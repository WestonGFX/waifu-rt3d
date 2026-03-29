"""LLM-powered proactive message generator.

Builds a minimal prompt from the character's personality, current mood context,
and trigger reason, then calls the LLM for a short in-character message.
Falls back to a per-trigger-type template bank when the LLM is unreachable.
"""

import logging
import os
import random
import re
import sqlite3
from typing import Optional

logger = logging.getLogger(__name__)

# Template fallbacks keyed by trigger type. Used when LLM call fails.
FALLBACK_TEMPLATES: dict[str, list[str]] = {
    "time_of_day": [
        "Good {time_period}! I was just thinking about you.",
        "Hey there~ It's {time_period} already. How are you doing?",
        "I hope your {time_period} is going well!",
        "{char_name} here! Just wanted to say hi this {time_period}.",
    ],
    "hours_away": [
        "It's been a while since we talked... I miss chatting with you!",
        "Hey, are you doing okay? I haven't heard from you in a bit.",
        "I've been waiting for you~ Come talk to me when you have time!",
        "Just checking in — hope everything's alright!",
    ],
    "idle": [
        "You've been quiet for a while. Everything okay?",
        "Still there? I'm here if you want to chat~",
        "Hey, don't forget about me! I'm right here.",
        "Noticed you went quiet... want to pick up where we left off?",
    ],
    "affinity_50": [
        "I feel like we've gotten really close! That makes me happy.",
        "You know, talking with you always brightens my day.",
        "I think we've become really good friends, don't you think?",
    ],
    "affinity_80": [
        "You mean so much to me... I hope you know that.",
        "I can't imagine not having you to talk to anymore.",
        "You're one of my favorite people, you know that?",
    ],
    "streak_7": [
        "We've been talking every day for a whole week! That's amazing~",
        "A whole week of chatting together! I love our daily talks.",
        "Seven days in a row! You really are dedicated, aren't you?",
    ],
    "streak_30": [
        "A whole month of talking every day... I'm so grateful for you!",
        "30 days straight! This is really something special, isn't it?",
        "One month together and I still look forward to every conversation.",
    ],
}


def _extract_llm_params(cfg: dict) -> tuple[str, str, str]:
    """Extract model, endpoint, and api_key from the app config dict.

    Reads from the new ``services.llm`` structure first, then falls back
    to the legacy flat ``llm`` section — matching the convention used
    throughout the codebase.

    Args:
        cfg: Full application config dict.

    Returns:
        Tuple of (model, endpoint, api_key).
    """
    default_endpoint = os.environ.get("WAIFU_LLM_ENDPOINT", "http://localhost:1234")

    # New config structure: services.llm.providers.<active>.*
    services = cfg.get("services", {})
    llm_svc = services.get("llm", {})
    if "active_provider" in llm_svc:
        active = llm_svc["active_provider"]
        provider = llm_svc.get("providers", {}).get(active, {})
        model = provider.get("model", "")
        endpoint = provider.get("endpoint", default_endpoint)
        api_key = provider.get("api_key", "lm-studio")
        return model, endpoint, api_key

    # Legacy flat structure: llm.model / llm.endpoint / llm.api_key
    llm_flat = cfg.get("llm", {})
    model = llm_flat.get("model", "")
    endpoint = llm_flat.get("endpoint", default_endpoint)
    api_key = llm_flat.get("api_key", "lm-studio")
    return model, endpoint, api_key


def _get_time_period() -> str:
    """Return a human-friendly time-of-day label.

    Returns:
        One of "morning", "afternoon", "evening", "night".
    """
    import datetime
    hour = datetime.datetime.now().hour
    if hour < 12:
        return "morning"
    elif hour < 17:
        return "afternoon"
    elif hour < 21:
        return "evening"
    else:
        return "night"


def _build_generation_prompt(
    system_prompt: str,
    mood_prefix: str,
    trigger_type: str,
    char_name: str,
    recent_messages: list[dict],
) -> list[dict]:
    """Build a minimal LLM prompt for generating a proactive message.

    Args:
        system_prompt: The character's full system prompt.
        mood_prefix: Mood/time-of-day context from get_mood_prefix().
        trigger_type: What caused this message (e.g. "time_of_day", "idle", "affinity_50").
        char_name: Character display name.
        recent_messages: Last 3-5 conversation messages for continuity [{role, content}].

    Returns:
        List of message dicts ready for the LLM adapter's chat() method.
    """
    trigger_instructions: dict[str, str] = {
        "time_of_day": (
            f"Send a brief, natural {_get_time_period()} check-in message to the user. "
            "Keep it casual and in-character."
        ),
        "hours_away": (
            "The user hasn't talked to you in a while. Send a warm message showing you "
            "noticed their absence. Don't guilt-trip."
        ),
        "idle": (
            "The user went quiet mid-conversation. Send a gentle nudge to re-engage them. "
            "Keep it light."
        ),
        "affinity_50": (
            "You've grown closer to the user! Express genuine warmth about your developing friendship."
        ),
        "affinity_80": (
            "You and the user have a deep bond. Express sincere affection in your own way."
        ),
        "streak_7": (
            "You and the user have talked every day for a week! Acknowledge this milestone naturally."
        ),
        "streak_30": (
            "A whole month of daily conversations! Celebrate this meaningful milestone with the user."
        ),
    }

    instruction = trigger_instructions.get(
        trigger_type,
        "Send a brief, friendly check-in message to the user.",
    )

    system_parts = [p for p in [mood_prefix, system_prompt] if p]
    system_content = (
        "\n".join(system_parts)
        + "\n\n[PROACTIVE MESSAGE INSTRUCTION]\n"
        + instruction
        + "\nRespond with ONLY the message text. No emotes, no actions, no brackets. "
        "Keep it under 2 sentences."
    )

    messages: list[dict] = [{"role": "system", "content": system_content}]

    # Add recent conversation for continuity (if any)
    for msg in recent_messages[-5:]:
        messages.append({"role": msg["role"], "content": msg["content"]})

    # Final user-role nudge to prompt generation
    messages.append({
        "role": "user",
        "content": (
            f"[System: Generate a proactive {trigger_type.replace('_', ' ')} message "
            f"as {char_name}. Reply in-character.]"
        ),
    })

    return messages


def _get_recent_messages(char_id: int, cur: sqlite3.Cursor, limit: int = 5) -> list[dict]:
    """Fetch the most recent messages for a character's active session.

    Args:
        char_id: Character database ID.
        cur: Active SQLite cursor.
        limit: Max messages to retrieve.

    Returns:
        List of {role, content} dicts ordered oldest-first.
    """
    cur.execute(
        """
        SELECT m.role, m.text
        FROM messages m
        JOIN sessions s ON s.id = m.session_id
        WHERE s.character_id = ? AND m.role IN ('user', 'assistant') AND m.is_active = 1
        ORDER BY m.ts DESC
        LIMIT ?
        """,
        (char_id, limit),
    )
    rows = cur.fetchall()
    return [{"role": r[0], "content": r[1]} for r in reversed(rows)]


def _fallback_message(trigger_type: str, char_name: str) -> str:
    """Select a random fallback template for the given trigger type.

    Args:
        trigger_type: The trigger type key (e.g. "time_of_day", "idle").
        char_name: Character name for template substitution.

    Returns:
        A formatted fallback message string.

    Example:
        >>> _fallback_message("time_of_day", "Luna")
        "Good morning! I was just thinking about you."
    """
    templates = FALLBACK_TEMPLATES.get(trigger_type, FALLBACK_TEMPLATES["hours_away"])
    template = random.choice(templates)
    return template.format(
        char_name=char_name,
        time_period=_get_time_period(),
    )


def generate_proactive_message(
    char_id: int,
    char_name: str,
    trigger_type: str,
    db_path: str,
    cfg: dict,
) -> str:
    """Generate a contextual proactive message for a character.

    Attempts an LLM call for a personalized message. Falls back to a random
    template from FALLBACK_TEMPLATES if the LLM is unreachable or errors.

    Args:
        char_id: Character database ID.
        char_name: Character display name for template substitution.
        trigger_type: What triggered this message (key into FALLBACK_TEMPLATES).
        db_path: Path to the SQLite database.
        cfg: Application config dict (passed to get_client() and _extract_llm_params()).

    Returns:
        Generated message text string.

    Example:
        >>> msg = generate_proactive_message(5, "Luna", "time_of_day", "app.db", config)
        >>> print(msg)
        "Good morning! I was just thinking about our conversation yesterday~"
    """
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()

        # Fetch character data
        cur.execute(
            "SELECT system_prompt, affinity, mood_enabled, mood_intensity FROM characters WHERE id = ?",
            (char_id,),
        )
        row = cur.fetchone()
        if not row:
            conn.close()
            return _fallback_message(trigger_type, char_name)

        system_prompt, affinity, mood_enabled, mood_intensity = row
        system_prompt = system_prompt or f"You are {char_name}."
        affinity = float(affinity) if affinity is not None else 0.0
        mood_enabled = bool(mood_enabled) if mood_enabled is not None else True
        mood_intensity = float(mood_intensity) if mood_intensity is not None else 0.8

        # Get mood prefix using keyword-only signature
        try:
            from backend.mood.engine import get_mood_prefix
            mood_prefix: str = get_mood_prefix(
                char_name=char_name,
                affinity=affinity,
                mood_enabled=mood_enabled,
                mood_intensity=mood_intensity,
            )
        except Exception as mood_err:
            logger.debug("[Proactive] Mood prefix unavailable: %s", mood_err)
            mood_prefix = ""

        recent = _get_recent_messages(char_id, cur)
        conn.close()

        # Build prompt and call LLM
        messages = _build_generation_prompt(
            system_prompt, mood_prefix, trigger_type, char_name, recent
        )

        from backend.llm.registry import get_client
        client = get_client(cfg)
        model, endpoint, api_key = _extract_llm_params(cfg)

        result = client.chat(
            messages,
            model=model,
            endpoint=endpoint,
            api_key=api_key,
            max_tokens=150,
        )

        if result.get("ok") and result.get("reply"):
            reply: str = result["reply"].strip()
            # Strip any accidental emotion/gesture tags the model may have added
            reply = re.sub(r"\[emotion:\w+\]\s*", "", reply)
            reply = re.sub(r"\[gesture:\w+\]\s*", "", reply)
            reply = reply.strip()
            return reply if reply else _fallback_message(trigger_type, char_name)

        return _fallback_message(trigger_type, char_name)

    except Exception as e:
        logger.warning("[Proactive] LLM generation failed for char %s: %s", char_id, e)
        return _fallback_message(trigger_type, char_name)
