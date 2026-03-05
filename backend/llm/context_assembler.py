"""Token-budget-aware context assembly for LLM chat requests.

Replaces the duplicated history-fetching code across ``/api/chat``,
``/api/chat/stream``, and ``/api/chat/multi`` with a single smart
assembler that respects context budgets.

Assembly priority order:
1. System prompt sections (always included — mandatory)
2. Rolling summaries from ``session_summaries`` table (oldest-first)
3. High-importance archived messages (``importance_score > 0.8``)
4. Recent active messages (last N that fit in remaining budget)
5. Reserve 10% of budget for LLM response tokens

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
    """
    messages: list[dict] = field(default_factory=list)
    token_count: int = 0
    budget_summary: dict = field(default_factory=dict)
    history_count: int = 0
    summaries_included: int = 0
    high_importance_kept: int = 0


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
) -> AssembledContext:
    """Assemble a token-budget-aware context for an LLM chat request.

    Builds the message list by fitting content into the available token
    budget in priority order: system prompt > rolling summaries >
    high-importance archived messages > recent active messages.

    Args:
        session_id: Active chat session ID.
        char_id: Character ID (unused currently, reserved for per-char budgets).
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
            "FROM session_summaries WHERE session_id = ? ORDER BY msg_range_start ASC",
            (session_id,),
        ).fetchall()
    except sqlite3.OperationalError:
        # Table may not exist yet (pre-v35 schema)
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

    # ── 4. High-importance archived messages (score > 0.8) ───────────
    hi_messages: list[dict] = []
    try:
        hi_rows = cur.execute(
            "SELECT role, text, importance_score FROM messages "
            "WHERE session_id = ? AND is_active = 0 AND importance_score > 0.8 "
            "ORDER BY id ASC LIMIT 10",
            (session_id,),
        ).fetchall()
    except sqlite3.OperationalError:
        # importance_score column may not exist yet
        hi_rows = []

    for role, text, _score in hi_rows:
        msg_cost = count_tokens(text or "") + 4
        if msg_cost > available:
            break
        hi_messages.append({"role": role, "content": text})
        available -= msg_cost
        result.high_importance_kept += 1

    # ── 4b. Game memory (lowest priority — injected last, dropped first) ──
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

    # ── 5. Recent active messages (last N that fit) ──────────────────
    history_limit = cfg.get("llm", {}).get("history_limit", cfg.get("history_limit", 0))
    effective_limit = history_limit if history_limit > 0 else max_history

    recent_rows = cur.execute(
        "SELECT role, text FROM messages WHERE session_id = ? AND is_active = 1 "
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

    # High-importance recalled messages
    if hi_messages:
        assembled.append({
            "role": "system",
            "content": "[Important recalled context from earlier in this conversation]",
        })
        assembled.extend(hi_messages)

    # Game memory (low priority — appears before recent chat for context)
    if game_memory_text:
        assembled.append({"role": "system", "content": game_memory_text})

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
        "token_counter": "tiktoken" if is_tiktoken_available() else "heuristic",
    }

    logger.debug(
        f"[ContextAssembler] session={session_id}: {result.token_count} tokens, "
        f"{result.history_count} history, {result.summaries_included} summaries, "
        f"{result.high_importance_kept} recalled"
    )

    return result
