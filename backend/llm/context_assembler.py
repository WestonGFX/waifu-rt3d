"""Token-budget-aware context assembly for LLM chat requests.

Replaces the duplicated history-fetching code across ``/api/chat``,
``/api/chat/stream``, and ``/api/chat/multi`` with a single smart
assembler that respects context budgets.

Assembly priority order:
1. System prompt sections (always included — mandatory)
2. Rolling summaries from ``session_summaries`` table (oldest-first)
3. High-importance archived messages (adaptive threshold)
4. Semantic memory recall via sqlite-vec RAG (query-relevant memories)
5. Game memory (lowest priority — dropped first under pressure)
6. Recent active messages (last N that fit in remaining budget)
7. Reserve 10% of budget for LLM response tokens

Example:
    >>> ctx = assemble_context(session_id=1, char_id=1, user_text="Hi",
    ...                        sections=sections, cfg=cfg, cur=cursor)
    >>> len(ctx.messages)
    15
    >>> ctx.token_count
    2048
"""

from __future__ import annotations

import logging
import sqlite3
import time
from dataclasses import dataclass, field

from backend.llm.token_counter import count_tokens, count_messages_tokens, is_tiktoken_available

logger = logging.getLogger(__name__)


@dataclass
class AssembledContext:
    """Result of context assembly with budget metadata.

    Attributes:
        messages: Chat messages ready for LLM consumption (system + history + user).
        token_count: Actual token count of the assembled context.
        budget_summary: Dict for the ContextBudgetBar frontend widget.
        history_count: Number of history messages included.
        summaries_included: Number of rolling summaries included.
        high_importance_kept: Number of high-importance archived messages recalled.
        semantic_memories_included: Number of RAG semantic memories injected.
        cache_breakpoints: Indices in messages where cache boundaries should be placed.
    """
    messages: list[dict] = field(default_factory=list)
    token_count: int = 0
    budget_summary: dict = field(default_factory=dict)
    history_count: int = 0
    summaries_included: int = 0
    high_importance_kept: int = 0
    semantic_memories_included: int = 0
    cache_breakpoints: list[int] = field(default_factory=list)


def assemble_context(
    session_id: int,
    char_id: int,
    user_text: str,
    sections: list[dict],
    cfg: dict,
    cur: sqlite3.Cursor,
    *,
    context_budget: int = 0,
    max_history: int = 30,
    skip_user_append: bool = False,
    vector_store=None,
    cache_hints: bool = False,
    scene_context: str | None = None,
) -> AssembledContext:
    """Assemble a token-budget-aware context for an LLM chat request.

    Builds the message list by fitting content into the available token
    budget in priority order: system prompt > rolling summaries >
    high-importance archived messages > semantic RAG memories >
    game memory > scene context > recent active messages.

    Args:
        session_id: Active chat session ID.
        char_id: Character ID for cross-session recall and RAG filtering.
        user_text: The current user message text.
        sections: Prompt sections from ``_build_prompt_sections()``, each with
            ``name``, ``content``, ``tokens``, ``chars`` keys.
        cfg: App configuration dict. Uses ``context_limit`` key (default 131072).
        cur: SQLite cursor for querying messages and summaries.
        context_budget: Override context budget in tokens. 0 = use ``cfg["context_limit"]``.
        max_history: Maximum number of recent messages to consider (default 30).
        skip_user_append: When True, do not append ``user_text`` as the final
            message.  Use this when the caller has already inserted the user
            message into the DB before calling this function, so it will
            appear in the fetched recent-messages list automatically.
        vector_store: Optional TieredMemoryManager (or VectorStore) for semantic
            RAG recall.  When provided, queries for memories relevant to
            ``user_text`` and includes them as a budget-managed tier.
        cache_hints: When True, record cache breakpoint indices in the result
            for Anthropic prompt caching (system prompt + summaries boundary).
        scene_context: Optional hint describing the current environment pose
            (e.g. ``"You're both sitting on the couch together, relaxing"``).
            Injected at lowest priority so the LLM can adapt dialogue to the
            physical setting.  Dropped silently if the budget is exhausted.

    Returns:
        ``AssembledContext`` with assembled messages and metadata.

    Example:
        >>> ctx = assemble_context(1, 1, "Hello!", sections, cfg, cursor)
        >>> ctx.token_count < cfg.get("context_limit", 131072)
        True
    """
    budget = context_budget or cfg.get("context_limit", 131072)
    # Reserve 10% for LLM response
    response_reserve = max(256, int(budget * 0.10))
    available = budget - response_reserve

    result = AssembledContext()

    # ── 1. System prompt (always included) ──────────────────────────
    system_content = "".join(s["content"] for s in sections)
    system_tokens = count_tokens(system_content)
    available -= system_tokens

    # ── 2. User message budget reservation ────────────────────────────
    if not skip_user_append and user_text:
        user_tokens = count_tokens(user_text) + 4  # +4 msg framing
        available -= user_tokens

    # Track section costs for budget summary
    section_costs = [{"name": s["name"], "tokens": s["tokens"], "chars": s["chars"]} for s in sections]

    # ── 3. Rolling summaries (oldest-first) ──────────────────────────
    summary_messages: list[dict] = []
    try:
        summary_rows = cur.execute(
            "SELECT summary_text, msg_range_start, msg_range_end, token_count "
            "FROM session_summaries WHERE session_id = ? AND meta_summary_id IS NULL "
            "ORDER BY msg_range_start ASC",
            (session_id,),
        ).fetchall()
    except sqlite3.OperationalError:
        # Table may not exist yet (pre-v35), or meta_summary_id column missing (pre-v54)
        try:
            summary_rows = cur.execute(
                "SELECT summary_text, msg_range_start, msg_range_end, token_count "
                "FROM session_summaries WHERE session_id = ? ORDER BY msg_range_start ASC",
                (session_id,),
            ).fetchall()
        except sqlite3.OperationalError:
            summary_rows = []

    for row in summary_rows:
        summary_text = row[0]
        s_tokens = row[3] or count_tokens(summary_text)
        msg_cost = s_tokens + 4  # framing
        if msg_cost > available:
            break
        summary_messages.append({
            "role": "system",
            "content": f"[Summary of messages {row[1]}-{row[2]}]\n{summary_text}",
        })
        available -= msg_cost
        result.summaries_included += 1

    # ── 4. High-importance archived messages (adaptive threshold) ────
    # Threshold rises as budget fills: 0.8 at empty → 0.95 at full,
    # so only the most critical memories survive under pressure.
    usage_ratio = (budget - available) / budget if budget > 0 else 0
    importance_threshold = 0.8 + (usage_ratio * 0.15)

    hi_messages: list[dict] = []

    # 4a. Cross-session recall: high-importance from OTHER sessions with same character
    try:
        cross_rows = cur.execute(
            "SELECT role, text, importance_score FROM messages "
            "WHERE char_id = ? AND is_active = 0 AND importance_score > ? "
            "AND session_id != ? "
            "ORDER BY importance_score DESC, id DESC LIMIT 10",
            (char_id, importance_threshold, session_id),
        ).fetchall()
    except sqlite3.OperationalError:
        cross_rows = []

    for role, text, _score in cross_rows:
        msg_cost = count_tokens(text or "") + 4
        if msg_cost > available:
            break
        hi_messages.append({"role": role, "content": text})
        available -= msg_cost
        result.high_importance_kept += 1

    # 4b. Current-session recall: high-importance from THIS session (archived)
    try:
        hi_rows = cur.execute(
            "SELECT role, text, importance_score FROM messages "
            "WHERE session_id = ? AND is_active = 0 AND importance_score > ? "
            "ORDER BY id ASC LIMIT 5",
            (session_id, importance_threshold),
        ).fetchall()
    except sqlite3.OperationalError:
        hi_rows = []

    for role, text, _score in hi_rows:
        msg_cost = count_tokens(text or "") + 4
        if msg_cost > available:
            break
        hi_messages.append({"role": role, "content": text})
        available -= msg_cost
        result.high_importance_kept += 1

    # ── 4c. Semantic memory recall (sqlite-vec RAG) ───────────────
    semantic_messages: list[dict] = []
    if vector_store and user_text:
        try:
            hits = vector_store.search(user_text, char_id=char_id, top_k=8)
            # AIE A4: Filter through personalization gate before injection
            try:
                from backend.adaptive.personalization_gate import filter_memories_for_context
                _gate_msgs = [{"role": "user", "content": user_text}]
                _gate_msgs.extend(hi_messages[-4:])
                _gate_candidates = [
                    {"text": h.get("text", ""), "importance": h.get("score", 0.5), "id": i}
                    for i, h in enumerate(hits)
                ]
                _gate_passed = filter_memories_for_context(
                    _gate_candidates, _gate_msgs, max_memories=5,
                )
                _passed_texts = {m["text"] for m in _gate_passed}
                hits = [h for h in hits if h.get("text", "") in _passed_texts]
            except Exception:
                hits = hits[:5]  # Fallback: just cap at 5

            for hit in hits:
                hit_text = hit.get("text", "")
                msg_cost = count_tokens(hit_text) + 4
                if msg_cost > available:
                    break
                semantic_messages.append({
                    "role": "system",
                    "content": f"[Memory] {hit_text}",
                })
                available -= msg_cost
                result.semantic_memories_included += 1
        except Exception:
            pass  # RAG unavailable — degrade gracefully

    # ── 4d. Game memory (lowest priority — injected last, dropped first) ──
    game_memory_text = ""
    try:
        from backend.spectator.memory import get_game_memory_snippet
        game_memory_text = get_game_memory_snippet(
            cur.connection, char_id, max_sessions=3, max_tokens_approx=150,
        )
    except Exception:
        pass  # spectator module may not exist or table may not be created yet

    game_memory_tokens = 0
    if game_memory_text:
        game_memory_tokens = count_tokens(game_memory_text) + 4
        if game_memory_tokens <= available:
            available -= game_memory_tokens
        else:
            game_memory_text = ""  # Drop game memory if it doesn't fit
            game_memory_tokens = 0

    # ── 4e. Scene context (lowest priority — nice-to-have pose hint) ──
    scene_context_text = ""
    if scene_context:
        scene_context_text = f"[Scene: {scene_context}]"
        scene_tokens = count_tokens(scene_context_text) + 4
        if scene_tokens <= available:
            available -= scene_tokens
        else:
            scene_context_text = ""  # Drop silently if budget exhausted

    # ── 5. Recent active messages (last N that fit) ──────────────────
    history_limit = cfg.get("llm", {}).get("history_limit", cfg.get("history_limit", 0))
    effective_limit = history_limit if history_limit > 0 else max_history

    recent_rows = cur.execute(
        "SELECT role, text FROM messages WHERE session_id = ? AND is_active = 1 "
        "AND role != 'director' "
        "ORDER BY id DESC LIMIT ?",
        (session_id, effective_limit),
    ).fetchall()

    # We fetched newest-first; we'll include as many as fit, then reverse
    recent_messages: list[dict] = []
    for role, text in recent_rows:
        msg_cost = count_tokens(text or "") + 4
        if msg_cost > available:
            break
        recent_messages.append({"role": role, "content": text})
        available -= msg_cost

    # Reverse to chronological order
    recent_messages.reverse()
    result.history_count = len(recent_messages)

    # ── Assemble final message list ──────────────────────────────────
    assembled: list[dict] = []

    # System prompt
    if system_content:
        assembled.append({"role": "system", "content": system_content})

    # Rolling summaries
    assembled.extend(summary_messages)

    # Cache breakpoint: system prompt + summaries are stable between turns
    if cache_hints:
        result.cache_breakpoints.append(len(assembled) - 1)

    # High-importance recalled messages
    if hi_messages:
        assembled.append({
            "role": "system",
            "content": "[Important recalled context from earlier conversations]",
        })
        assembled.extend(hi_messages)

    # Semantic RAG memories
    if semantic_messages:
        assembled.extend(semantic_messages)

    # Game memory (low priority — appears before recent chat for context)
    if game_memory_text:
        assembled.append({"role": "system", "content": game_memory_text})

    # Scene context (lowest priority — environment pose hint for dialogue adaptation)
    if scene_context_text:
        assembled.append({"role": "system", "content": scene_context_text})

    # Recent history
    assembled.extend(recent_messages)

    # Current user message (skip when caller already inserted it into DB)
    if not skip_user_append and user_text:
        assembled.append({"role": "user", "content": user_text})

    result.messages = assembled
    result.token_count = count_messages_tokens(assembled)

    # ── Budget summary for ContextBudgetBar ──────────────────────────
    hist_tokens = sum(count_tokens(m.get("content", "")) for m in recent_messages)
    summary_tokens = sum(count_tokens(m.get("content", "")) for m in summary_messages)

    all_sections = list(section_costs)
    if summary_tokens > 0:
        all_sections.append({"name": f"Summaries ({result.summaries_included})", "tokens": summary_tokens, "chars": summary_tokens * 4})
    if result.high_importance_kept > 0:
        hi_tok = sum(count_tokens(m.get("content", "")) for m in hi_messages)
        all_sections.append({"name": f"Recalled ({result.high_importance_kept})", "tokens": hi_tok, "chars": hi_tok * 4})
    if result.semantic_memories_included > 0:
        sem_tok = sum(count_tokens(m.get("content", "")) for m in semantic_messages)
        all_sections.append({"name": f"Semantic Memory ({result.semantic_memories_included})", "tokens": sem_tok, "chars": sem_tok * 4})
    if game_memory_tokens > 0:
        all_sections.append({"name": "Game Memory", "tokens": game_memory_tokens, "chars": game_memory_tokens * 4})
    all_sections.append({"name": f"Chat History ({result.history_count} msgs)", "tokens": hist_tokens, "chars": hist_tokens * 4})

    total_tokens = sum(s["tokens"] for s in all_sections)
    context_limit = cfg.get("context_limit", 131072)
    usage_pct = round(total_tokens / context_limit * 100, 1) if context_limit > 0 else 0

    result.budget_summary = {
        "sections": all_sections,
        "total_tokens": total_tokens,
        "context_limit": context_limit,
        "usage_pct": usage_pct,
        "history_messages": result.history_count,
        "remaining_tokens": max(0, context_limit - total_tokens),
        "summaries_included": result.summaries_included,
        "high_importance_kept": result.high_importance_kept,
        "semantic_memories_included": result.semantic_memories_included,
        "token_counter": "tiktoken" if is_tiktoken_available() else "heuristic",
    }

    logger.debug(
        f"[ContextAssembler] session={session_id}: {result.token_count} tokens, "
        f"{result.history_count} history, {result.summaries_included} summaries, "
        f"{result.high_importance_kept} recalled, {result.semantic_memories_included} RAG"
    )

    return result


async def maybe_create_meta_summary(
    session_id: int,
    cfg: dict,
    con: sqlite3.Connection,
    *,
    threshold: int = 5,
) -> dict | None:
    """Distill multiple rolling summaries into a single meta-summary.

    When a session accumulates more than ``threshold`` un-rolled summaries,
    the oldest batch is sent to the LLM for distillation.  The resulting
    meta-summary is stored as a new row, and its children are marked with
    ``meta_summary_id`` so the assembler skips them.

    This keeps summary chain growth **logarithmic** instead of linear.

    Args:
        session_id: Session whose summaries to check.
        cfg: App config dict (for LLM access).
        con: SQLite connection.
        threshold: Minimum un-rolled summaries before distillation fires.

    Returns:
        Dict with meta-summary details if created, None otherwise.

    Example:
        >>> result = await maybe_create_meta_summary(1, cfg, conn)
        >>> result is None or "meta_summary" in result
        True
    """
    try:
        rows = con.execute(
            "SELECT id, summary_text, msg_range_start, msg_range_end "
            "FROM session_summaries WHERE session_id = ? AND meta_summary_id IS NULL "
            "ORDER BY msg_range_start ASC",
            (session_id,),
        ).fetchall()
    except sqlite3.OperationalError:
        return None  # Table or column doesn't exist yet

    if len(rows) < threshold:
        return None

    # Take the oldest batch (leave at least 1 un-rolled for recency)
    batch = rows[:threshold - 1]
    combined_text = "\n\n".join(
        f"[Summary {i + 1} (messages {r[2]}-{r[3]})]\n{r[1]}"
        for i, r in enumerate(batch)
    )

    # Resolve character name
    char_row = con.execute(
        "SELECT c.name FROM sessions s JOIN characters c ON c.id = s.character_id "
        "WHERE s.id = ?", (session_id,)
    ).fetchone()
    char_name = char_row[0] if char_row else "the AI"

    meta_prompt = (
        f"Distill these {len(batch)} conversation summaries between the user and "
        f"{char_name} into a single cohesive narrative summary. Preserve:\n"
        "- Major topics and how they evolved\n"
        "- Emotional arcs and relationship progression\n"
        "- User facts, preferences, and personal details\n"
        "- Promises or commitments from either party\n"
        "- Named entities that may be referenced later\n\n"
        f"SUMMARIES:\n{combined_text}\n\n"
        f"Write a dense, factual meta-summary under 400 words. Use '{char_name}', not 'the AI'."
    )

    try:
        from starlette.concurrency import run_in_threadpool
        from backend.llm.registry import get_client
        adapter = get_client(cfg)
        res = await run_in_threadpool(
            adapter.chat,
            [{"role": "user", "content": meta_prompt}],
            cfg["llm"]["model"],
            cfg["llm"]["endpoint"],
            cfg["llm"]["api_key"],
            temperature=0.3,
            max_tokens=800,
        )
    except Exception as e:
        logger.warning(f"Meta-summary generation failed: {e}")
        return None

    if not res.get("ok"):
        logger.warning(f"Meta-summary LLM error: {res.get('error')}")
        return None

    meta_text = res.get("reply", res.get("text", "")).strip()
    if not meta_text:
        return None

    # Insert meta-summary row
    now = int(time.time())
    range_start = batch[0][2]  # msg_range_start of first child
    range_end = batch[-1][3]   # msg_range_end of last child
    meta_tokens = count_tokens(meta_text)

    con.execute(
        "INSERT INTO session_summaries "
        "(session_id, summary_text, msg_range_start, msg_range_end, msg_count, token_count, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (session_id, meta_text, range_start, range_end, 0, meta_tokens, now),
    )
    meta_id = con.execute("SELECT last_insert_rowid()").fetchone()[0]

    # Mark children as rolled up
    child_ids = [r[0] for r in batch]
    placeholders = ",".join("?" * len(child_ids))
    con.execute(
        f"UPDATE session_summaries SET meta_summary_id = ? WHERE id IN ({placeholders})",
        [meta_id] + child_ids,
    )
    con.commit()

    logger.info(
        f"[MetaSummary] session={session_id}: distilled {len(batch)} summaries "
        f"(msgs {range_start}-{range_end}) into meta-summary #{meta_id}"
    )

    return {
        "meta_summary_id": meta_id,
        "meta_summary": meta_text,
        "children_rolled": len(batch),
        "range": [range_start, range_end],
    }
