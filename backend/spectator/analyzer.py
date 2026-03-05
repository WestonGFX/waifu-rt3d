"""Frame analyzer — VLM-powered game frame analysis for spectator mode.

Sends game screenshots to a VLM (Claude, LLaVA, Qwen-VL, GPT-4o) along with
character context and a rolling window of recent observations.  Extracts
emotion tags and urgency scores from the VLM response to drive character
reactions.

If no VLM is available, falls back to text-only "imagine you're watching"
prompts using the standard LLM adapter.
"""

import logging
import re
import sqlite3
from dataclasses import dataclass, field

from backend.llm.registry import get_client, get_vision_client

logger = logging.getLogger("waifu.spectator.analyzer")


@dataclass
class GameReaction:
    """A single reaction from the character to a game frame.

    Attributes:
        text: The character's reaction text (in-character dialogue).
        emotion: Detected emotion tag (e.g. ``"excited"``, ``"worried"``).
        urgency: How important this reaction is (0.0–1.0).  High urgency
            (>0.6) bypasses normal throttle cooldowns.
        quiet: True if the VLM determined nothing interesting happened and
            the character should stay silent.
    """

    text: str = ""
    emotion: str = "neutral"
    urgency: float = 0.5
    quiet: bool = False


class FrameAnalyzer:
    """Stateful VLM-backed game frame analyzer.

    Maintains a rolling window of recent observations for continuity,
    builds character-aware spectator prompts, and parses structured
    emotion/urgency tags from VLM responses.

    Args:
        cfg: Application config dict (for LLM adapter selection).
        char_id: Character ID for persona/system prompt loading.
        game_tag: User-provided game name (e.g. ``"PokeRogue"``).
        mode: ``"watch"`` (user plays) or ``"play"`` (AI plays).
        db_path: Path to SQLite database for character data.

    Example:
        >>> analyzer = FrameAnalyzer(cfg, char_id=1, game_tag="PokeRogue")
        >>> reaction = analyzer.analyze_frame(image_b64, user_name="Chris")
        >>> print(reaction.text, reaction.emotion, reaction.urgency)
    """

    MAX_OBSERVATIONS = 5

    def __init__(
        self,
        cfg: dict,
        char_id: int,
        game_tag: str = "unknown game",
        mode: str = "watch",
        db_path: str = "backend/storage/app.db",
    ):
        self.cfg = cfg
        self.char_id = char_id
        self.game_tag = game_tag
        self.mode = mode
        self.db_path = db_path

        self._observations: list[str] = []
        self._char_name: str = ""
        self._char_persona: str = ""
        self._load_character()

    def _load_character(self) -> None:
        """Load character name and persona from the database."""
        try:
            con = sqlite3.connect(self.db_path)
            con.row_factory = sqlite3.Row
            row = con.execute(
                "SELECT name, persona FROM characters WHERE id = ?",
                (self.char_id,),
            ).fetchone()
            if row:
                self._char_name = row["name"] or "AI"
                self._char_persona = row["persona"] or ""
            con.close()
        except Exception as e:
            logger.warning(f"[Analyzer] Failed to load character {self.char_id}: {e}")
            self._char_name = "AI"

    def _build_spectator_prompt(self, user_name: str = "the user") -> str:
        """Build the system prompt for spectator analysis.

        Args:
            user_name: The user's display name for the prompt.

        Returns:
            A system prompt string tailored to the current game and mode.
        """
        mode_ctx = (
            f"{user_name} is playing and you're watching."
            if self.mode == "watch"
            else "You are playing the game yourself."
        )

        observation_ctx = ""
        if self._observations:
            recent = "\n".join(f"- {obs}" for obs in self._observations[-self.MAX_OBSERVATIONS:])
            observation_ctx = f"\n\nRecent observations:\n{recent}"

        return f"""You are {self._char_name}, an anime companion character watching a game.
{self._char_persona[:500] if self._char_persona else ''}

Game: {self.game_tag}
{mode_ctx}{observation_ctx}

React to what you see in the game screenshot. Stay in character.
Keep your reaction to 1-2 sentences max.

Response format (REQUIRED):
[EMOTION: <emotion>] [URGENCY: <0.0-1.0>]
<your reaction text>

Emotion options: excited, worried, amused, surprised, proud, disappointed, neutral, angry, scared, happy, sad, curious
Urgency guide: 0.0-0.3 = mundane, 0.4-0.6 = interesting, 0.7-1.0 = critical moment

If nothing interesting is happening, respond with just:
[QUIET]"""

    def _parse_reaction(self, raw_text: str) -> GameReaction:
        """Parse structured tags from VLM response.

        Extracts ``[EMOTION: X]``, ``[URGENCY: 0.X]``, and ``[QUIET]`` tags.

        Args:
            raw_text: Raw VLM response string.

        Returns:
            Parsed ``GameReaction`` with extracted fields.
        """
        if not raw_text or "[QUIET]" in raw_text.upper():
            return GameReaction(quiet=True)

        emotion = "neutral"
        urgency = 0.5

        # Extract [EMOTION: xxx]
        emotion_match = re.search(r"\[EMOTION:\s*(\w+)\]", raw_text, re.IGNORECASE)
        if emotion_match:
            emotion = emotion_match.group(1).lower()

        # Extract [URGENCY: 0.x]
        urgency_match = re.search(r"\[URGENCY:\s*([\d.]+)\]", raw_text, re.IGNORECASE)
        if urgency_match:
            try:
                urgency = max(0.0, min(1.0, float(urgency_match.group(1))))
            except ValueError:
                pass

        # Strip tags from the reaction text
        clean_text = re.sub(r"\[EMOTION:\s*\w+\]", "", raw_text, flags=re.IGNORECASE)
        clean_text = re.sub(r"\[URGENCY:\s*[\d.]+\]", "", clean_text, flags=re.IGNORECASE)
        clean_text = clean_text.strip()

        reaction = GameReaction(
            text=clean_text,
            emotion=emotion,
            urgency=urgency,
        )

        # Record observation for context continuity
        if clean_text:
            self._observations.append(clean_text[:200])
            if len(self._observations) > self.MAX_OBSERVATIONS:
                self._observations.pop(0)

        return reaction

    def analyze_frame(
        self,
        image_b64: str,
        user_name: str = "the user",
        media_type: str = "image/jpeg",
    ) -> GameReaction:
        """Analyze a game frame screenshot and generate a character reaction.

        Sends the frame to a VLM for analysis with character context.
        Falls back to text-only analysis if no VLM is available.

        Args:
            image_b64: Base64-encoded game screenshot (JPEG/PNG).
            user_name: User's display name for personalized reactions.
            media_type: MIME type of the image (default ``"image/jpeg"``).

        Returns:
            ``GameReaction`` with reaction text, emotion, and urgency.

        Example:
            >>> reaction = analyzer.analyze_frame(screenshot_b64, "Chris")
            >>> if not reaction.quiet:
            ...     print(f"[{reaction.emotion}] {reaction.text}")
        """
        system_prompt = self._build_spectator_prompt(user_name)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "React to this game screenshot:"},
        ]

        try:
            adapter, model, endpoint, api_key = get_vision_client(self.cfg)

            if adapter.supports_vision() and image_b64:
                images = [{"data": image_b64, "media_type": media_type}]
                result = adapter.image_chat(
                    messages, images, model, endpoint, api_key,
                    temperature=0.8,
                    max_tokens=200,
                )
            else:
                # Text-only fallback — describe what might be happening
                messages[-1]["content"] = (
                    f"Imagine you're watching someone play {self.game_tag}. "
                    "React to what's happening in the game right now."
                )
                adapter = get_client(self.cfg)
                llm_cfg = self.cfg.get("llm", {})
                result = adapter.chat(
                    messages,
                    llm_cfg.get("model", ""),
                    llm_cfg.get("endpoint", "http://localhost:1234"),
                    llm_cfg.get("api_key", ""),
                    temperature=0.8,
                    max_tokens=200,
                )

            if result.get("ok"):
                return self._parse_reaction(result["reply"])
            else:
                logger.warning(f"[Analyzer] VLM error: {result.get('error')}")
                return GameReaction(quiet=True)

        except Exception as e:
            logger.error(f"[Analyzer] Frame analysis failed: {e}")
            return GameReaction(quiet=True)

    def reset(self) -> None:
        """Clear the observation window.  Call when starting a new game session."""
        self._observations.clear()
