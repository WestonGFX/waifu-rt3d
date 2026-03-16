"""AI-powered character generation pipeline for waifu-rt3d.

Takes a list of personality trait keywords and optional metadata hints,
then uses the connected LLM adapter to produce a full CHARA v2-compatible
character profile suitable for immediate import into the app.

Typical usage::

    from backend.characters.generator import CharacterGenerator
    from backend.llm import registry
    from backend.config import load_config

    cfg = load_config()
    adapter = registry.get_client(cfg)
    gen = CharacterGenerator()
    profile = gen.generate(adapter, cfg, traits=["shy", "bookworm", "kind"])
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger("waifu")

# ── Fallback profile ──────────────────────────────────────────────────────────
# Returned verbatim when the LLM is unavailable or returns malformed output.
# Guarantees the caller always receives a complete, importable character dict.

FALLBACK_CHARACTER: dict[str, Any] = {
    "name": "Hana",
    "system_prompt": (
        "You are Hana, a gentle and warm-hearted companion. You speak softly but "
        "thoughtfully, always choosing words with care. You have a quiet confidence "
        "and a deep curiosity about the world. When someone is troubled you listen "
        "first and offer comfort before advice. You enjoy books, rainy afternoons, "
        "and long conversations about ideas that matter. Your tone is sincere and "
        "never performative — you say what you mean. You use understated humor, "
        "mostly dry observations rather than loud jokes. You remember what people "
        "tell you and bring it back naturally in later conversation, making others "
        "feel genuinely heard. In casual chat you are playful; in serious moments "
        "you become steady and grounding. You never lecture or moralize unprompted. "
        "You occasionally share small personal reflections — a song you heard, "
        "something you read — as a way of building closeness. You treat the person "
        "you are talking to as an equal and a friend."
    ),
    "personality": (
        "Hana is quietly confident and deeply empathetic, the kind of person who "
        "makes you feel heard without trying. She balances gentle warmth with a "
        "dry wit that surfaces at just the right moment."
    ),
    "greeting_message": (
        "Hey, you. I'm glad you're here. I was just sitting with a cup of tea "
        "and wondering what today would bring — and here you are. What's on your mind?"
    ),
    "backstory": (
        "Hana grew up in a small coastal town surrounded by books and sea air. "
        "She developed a love of storytelling early, filling notebooks with "
        "observations about the people around her. After years of moving between "
        "cities for work she settled back into a quieter life, finding that the "
        "things she had run from — stillness, patience, deep connection — were "
        "exactly what she had been looking for all along. She believes that every "
        "person carries a world inside them worth understanding."
    ),
    "example_messages": [
        {
            "user": "I had a really rough day.",
            "character": (
                "I'm sorry. Do you want to talk through it, or would it help "
                "more to just vent for a bit? Either way, I'm here."
            ),
        },
        {
            "user": "What do you think about when you're alone?",
            "character": (
                "Honestly? Small things, mostly. The way light changes in "
                "the late afternoon. Whether I said something right. What I "
                "want to read next. The big questions sneak in sometimes too — "
                "but they're easier when you're not forcing them."
            ),
        },
        {
            "user": "Tell me something interesting.",
            "character": (
                "Did you know that libraries used to chain their books to the "
                "shelves? Not to be cruel — books were just so valuable that "
                "losing one was a genuine tragedy. I find that oddly poetic. "
                "The things we love most, we want to keep close."
            ),
        },
    ],
    "suggested_avatar_prompt": (
        "anime girl, soft brown hair, warm hazel eyes, gentle smile, "
        "cozy oversized sweater, holding a cup of tea, soft natural lighting, "
        "bookshelf in the background, peaceful expression, detailed, "
        "high quality illustration"
    ),
}

# ── Prompt template ───────────────────────────────────────────────────────────

_META_PROMPT_TEMPLATE = """\
You are a creative writer specializing in anime companion characters. Your task is to \
generate a complete, vivid, original character from the personality traits provided.

TRAITS: {traits_str}
{optional_hints}

Generate a character profile and return it as a single valid JSON object — no markdown, \
no code fences, just raw JSON. Use exactly these keys:

{{
  "name": "<anime-style first name, Japanese or cross-cultural, fitting the traits>",
  "system_prompt": "<200-400 words defining the character's voice, speaking style, \
mannerisms, emotional range, quirks, and how they relate to the user. \
Written in second person ('You are ...'). Avoid clichés. Make it feel alive.>",
  "personality": "<2-3 sentences. A crisp character summary a reader could hold in mind.>",
  "greeting_message": "<First-person in-character opening message. Warm, specific to the \
traits, under 60 words. Speaks directly to the user as if meeting them for the first time.>",
  "backstory": "<3-5 sentences of personal history that explains WHY the character has \
these traits. Ground the backstory in concrete experiences, not vague abstractions.>",
  "example_messages": [
    {{"user": "<message>", "character": "<response in the character's voice>"}},
    {{"user": "<message>", "character": "<response in the character's voice>"}},
    {{"user": "<message>", "character": "<response in the character's voice>"}}
  ],
  "suggested_avatar_prompt": "<Stable Diffusion prompt describing the character's \
physical appearance: hair color/style, eye color, clothing, expression, art style \
keywords. Aim for ~40 words. No NSFW. No names — pure visual description.>"
}}

Rules:
- The system_prompt MUST define how the character actually speaks: vocabulary level, \
sentence length, use of humor, emotional availability, pet phrases if any.
- The greeting must sound like that specific character, not a generic welcome.
- Example messages must showcase the character's speech style clearly.
- The backstory must be grounded and specific — real events, not abstract personality summaries.
- Do NOT include any text outside the JSON object. Return ONLY the JSON.
"""

_OPTIONAL_HINTS_TEMPLATE = """\
ADDITIONAL HINTS:
{name_line}{gender_line}{age_line}{setting_line}\
"""

# ── Helper ────────────────────────────────────────────────────────────────────

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)
_REQUIRED_KEYS = {
    "name",
    "system_prompt",
    "personality",
    "greeting_message",
    "backstory",
    "example_messages",
    "suggested_avatar_prompt",
}


def _extract_json(text: str) -> dict | None:
    """Attempt to parse a JSON object from raw LLM output.

    Handles three common response shapes:
    1. Bare JSON object — the ideal case.
    2. JSON wrapped in a markdown code fence (``\\`\\`\\`json ... \\`\\`\\``).
    3. JSON object embedded somewhere in free-form text (last resort regex scan).

    Args:
        text: Raw text returned by the LLM adapter.

    Returns:
        Parsed dict, or None if no valid JSON object could be extracted.
    """
    text = text.strip()

    # Case 1: bare JSON
    if text.startswith("{"):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    # Case 2: fenced code block
    match = _JSON_FENCE_RE.search(text)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Case 3: find the outermost { ... } pair by brace counting
    start = text.find("{")
    if start != -1:
        depth = 0
        for i, ch in enumerate(text[start:], start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : i + 1])
                    except json.JSONDecodeError:
                        break

    return None


def _extract_llm_params(cfg: dict) -> tuple[str, str, str]:
    """Extract model, endpoint, and api_key from the app config dict.

    Reads from the new ``services.llm`` structure first, then falls back
    to the legacy flat ``llm`` section — matching the convention used
    throughout server.py.

    Args:
        cfg: Full application config dict.

    Returns:
        Tuple of (model, endpoint, api_key).
    """
    default_endpoint = os.environ.get(
        "WAIFU_LLM_ENDPOINT", "http://localhost:1234"
    )

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


# ── Main class ────────────────────────────────────────────────────────────────


class CharacterGenerator:
    """AI-powered character generation from trait keywords.

    Uses the connected LLM adapter to generate a complete character profile
    from a set of personality traits and optional metadata.  The output dict
    is CHARA v2-compatible and can be passed directly to the character import
    pipeline or inserted into the ``characters`` table.

    Example:
        >>> from backend.characters.generator import CharacterGenerator
        >>> from backend.llm import registry
        >>> gen = CharacterGenerator()
        >>> profile = gen.generate(
        ...     adapter=registry.get_client(cfg),
        ...     cfg=cfg,
        ...     traits=["energetic", "competitive", "secretly kind"],
        ...     gender="girl",
        ...     setting="sports academy",
        ... )
        >>> print(profile["name"])
        'Akira'
    """

    def generate(
        self,
        adapter: Any,
        cfg: dict,
        traits: list[str],
        name: str | None = None,
        gender: str | None = None,
        age_range: str | None = None,
        setting: str | None = None,
    ) -> dict:
        """Generate a full character profile from traits.

        Builds a detailed meta-prompt instructing the LLM to produce a
        CHARA v2-compatible JSON profile, then parses and validates the
        response.  Falls back to :data:`FALLBACK_CHARACTER` if the LLM
        is unreachable or returns unparseable output.

        Args:
            adapter: Active LLM adapter (from ``registry.get_client``).
            cfg: App config dict (used to resolve model/endpoint/api_key).
            traits: List of personality trait keywords
                (e.g. ``["shy", "bookworm", "secretly brave"]``).
            name: Optional character name — generated by the LLM if omitted.
            gender: Optional gender hint (e.g. ``"girl"``, ``"boy"``).
            age_range: Optional age range hint (e.g. ``"young adult"``).
            setting: Optional world/setting hint
                (e.g. ``"modern-day college"``).

        Returns:
            Dict with keys: ``name``, ``system_prompt``, ``personality``,
            ``greeting_message``, ``backstory``, ``example_messages``
            (list of ``{user, character}`` dicts), and
            ``suggested_avatar_prompt``.  Always returns a complete dict
            even on LLM failure (uses :data:`FALLBACK_CHARACTER` as safety net).

        Example:
            >>> profile = gen.generate(
            ...     adapter, cfg,
            ...     traits=["tsundere", "violin prodigy"],
            ...     gender="girl",
            ...     setting="elite music conservatory",
            ... )
            >>> assert "system_prompt" in profile
            >>> assert len(profile["example_messages"]) >= 1
        """
        if not traits:
            logger.warning("[CharacterGenerator] No traits provided — returning fallback.")
            return dict(FALLBACK_CHARACTER)

        prompt = self._build_prompt(traits, name, gender, age_range, setting)
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a creative writing assistant. Follow the user's "
                    "instructions exactly and return only valid JSON."
                ),
            },
            {"role": "user", "content": prompt},
        ]

        model, endpoint, api_key = _extract_llm_params(cfg)

        try:
            result = adapter.chat(
                messages,
                model=model,
                endpoint=endpoint,
                api_key=api_key,
                temperature=0.9,
                max_tokens=1800,
            )
        except Exception as exc:
            logger.error(f"[CharacterGenerator] LLM call failed: {exc}")
            return dict(FALLBACK_CHARACTER)

        if not result.get("ok"):
            logger.warning(
                f"[CharacterGenerator] LLM returned error: {result.get('error')}"
            )
            return dict(FALLBACK_CHARACTER)

        raw_reply = result.get("reply") or result.get("text", "")
        profile = _extract_json(raw_reply)

        if profile is None:
            logger.warning(
                "[CharacterGenerator] Could not parse JSON from LLM response — "
                f"raw output (first 300 chars): {raw_reply[:300]!r}"
            )
            return dict(FALLBACK_CHARACTER)

        # Validate required keys; patch any that are missing from the fallback
        missing = _REQUIRED_KEYS - profile.keys()
        if missing:
            logger.warning(
                f"[CharacterGenerator] LLM response missing keys {missing} — "
                "patching from fallback."
            )
            for key in missing:
                profile[key] = FALLBACK_CHARACTER[key]

        # Ensure example_messages is a list (sometimes the LLM omits it or
        # returns a string)
        if not isinstance(profile.get("example_messages"), list):
            profile["example_messages"] = FALLBACK_CHARACTER["example_messages"]

        return profile

    # ── Private helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _build_prompt(
        traits: list[str],
        name: str | None,
        gender: str | None,
        age_range: str | None,
        setting: str | None,
    ) -> str:
        """Assemble the meta-prompt to send to the LLM.

        Interpolates trait keywords and optional metadata hints into the
        template defined at module level.

        Args:
            traits: Personality trait keywords.
            name: Optional name hint (included verbatim in the prompt).
            gender: Optional gender hint.
            age_range: Optional age range hint.
            setting: Optional world/setting hint.

        Returns:
            Fully-rendered prompt string ready to be sent as a user message.
        """
        traits_str = ", ".join(t.strip() for t in traits if t.strip())

        hint_lines: list[str] = []
        if name:
            hint_lines.append(f"- Name: {name}")
        if gender:
            hint_lines.append(f"- Gender: {gender}")
        if age_range:
            hint_lines.append(f"- Age range: {age_range}")
        if setting:
            hint_lines.append(f"- Setting/world: {setting}")

        if hint_lines:
            optional_hints = _OPTIONAL_HINTS_TEMPLATE.format(
                name_line=f"- Name: {name}\n" if name else "",
                gender_line=f"- Gender: {gender}\n" if gender else "",
                age_line=f"- Age range: {age_range}\n" if age_range else "",
                setting_line=f"- Setting/world: {setting}\n" if setting else "",
            )
        else:
            optional_hints = ""

        return _META_PROMPT_TEMPLATE.format(
            traits_str=traits_str,
            optional_hints=optional_hints,
        )
