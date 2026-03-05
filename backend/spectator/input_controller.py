"""Input controller — Playwright-based browser automation for AI-plays mode.

Launches a visible Chromium browser, navigates to a game URL, and runs a
decision loop: screenshot → VLM analysis → action execution → repeat.

The AI character plays the game autonomously while streaming screenshots
and "thoughts" back to the frontend via the spectator WebSocket.

Architecture:
    PlaySession  — Owns the Playwright browser lifecycle and action loop.
    _ACTION_PROMPT — VLM prompt that asks for structured JSON actions.
    _parse_action — Extracts action dicts from VLM response text.

Supported actions:
    press   — keyboard key press (e.g. ArrowUp, z, Space, Enter)
    click   — mouse click at (x, y) coordinates
    wait    — do nothing for N milliseconds
    type    — type a string of text

Throttling:
    Max 3 actions/second to prevent overwhelming the game.  Turn-based
    games like PokeRogue only need ~1 action/second anyway.
"""

import asyncio
import base64
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

logger = logging.getLogger("waifu.spectator.input")

# Max actions per second to prevent input spam
MAX_ACTIONS_PER_SEC = 3

# Decision loop interval — how often to screenshot + decide
LOOP_INTERVAL_MS = 1500

# Max actions before forcing a "think about what happened" pause
MAX_ACTIONS_BEFORE_PAUSE = 10


@dataclass
class GameAction:
    """A single game input action parsed from VLM response.

    Attributes:
        action: Action type (``"press"``, ``"click"``, ``"wait"``, ``"type"``).
        key: Keyboard key name for ``press`` actions (e.g. ``"ArrowUp"``).
        x: X coordinate for ``click`` actions.
        y: Y coordinate for ``click`` actions.
        text: Text string for ``type`` actions.
        duration_ms: Wait duration for ``wait`` actions.
        thought: AI's reasoning for this action.
    """

    action: str = "wait"
    key: str = ""
    x: int = 0
    y: int = 0
    text: str = ""
    duration_ms: int = 500
    thought: str = ""


def _build_play_prompt(game_tag: str, char_persona: str, recent_thoughts: list[str]) -> str:
    """Build the VLM system prompt for AI-plays mode.

    Args:
        game_tag: Name of the game being played.
        char_persona: Character's persona text (truncated).
        recent_thoughts: Last 3 AI thoughts for context continuity.

    Returns:
        System prompt string for the VLM.
    """
    thoughts_ctx = ""
    if recent_thoughts:
        recent = "\n".join(f"- {t}" for t in recent_thoughts[-3:])
        thoughts_ctx = f"\n\nYour recent thoughts:\n{recent}"

    return f"""You are playing {game_tag} in a browser. You can see the game screen.
{char_persona[:300] if char_persona else ''}
{thoughts_ctx}

Look at the screenshot and decide what action to take next.

Respond with a JSON action block followed by your thought:
```json
{{"action": "press", "key": "ArrowUp"}}
```
THOUGHT: I need to move up to reach the next area.

Available actions:
- {{"action": "press", "key": "<key>"}} — Press a key. Keys: ArrowUp, ArrowDown, ArrowLeft, ArrowRight, z, x, Space, Enter, Escape, Backspace, a-z, 0-9
- {{"action": "click", "x": <number>, "y": <number>}} — Click at screen coordinates
- {{"action": "wait", "duration_ms": <number>}} — Wait (use when animation is playing or loading)
- {{"action": "type", "text": "<string>"}} — Type text into an input field

Rules:
1. Only ONE action per response
2. If nothing needs doing (loading screen, animation), use "wait"
3. Be strategic — think about game mechanics, not just random inputs
4. Keep thoughts concise (1 sentence)"""


def _parse_action(raw_text: str) -> GameAction:
    """Parse a GameAction from VLM response text.

    Looks for a JSON code block with action data, plus a THOUGHT line.

    Args:
        raw_text: Raw VLM response text.

    Returns:
        Parsed ``GameAction``. Falls back to ``wait`` if parsing fails.

    Example:
        >>> _parse_action('```json\\n{"action": "press", "key": "z"}\\n```\\nTHOUGHT: Select move')
        GameAction(action='press', key='z', thought='Select move')
    """
    action = GameAction()

    # Extract JSON block
    json_match = re.search(r"```(?:json)?\s*(\{[^}]+\})\s*```", raw_text, re.DOTALL)
    if not json_match:
        # Try bare JSON
        json_match = re.search(r"(\{\"action\"[^}]+\})", raw_text)

    if json_match:
        try:
            data = json.loads(json_match.group(1))
            action.action = data.get("action", "wait")
            action.key = data.get("key", "")
            action.x = int(data.get("x", 0))
            action.y = int(data.get("y", 0))
            action.text = data.get("text", "")
            action.duration_ms = int(data.get("duration_ms", 500))
        except (json.JSONDecodeError, ValueError, TypeError):
            action.action = "wait"

    # Extract thought
    thought_match = re.search(r"THOUGHT:\s*(.+?)(?:\n|$)", raw_text, re.IGNORECASE)
    if thought_match:
        action.thought = thought_match.group(1).strip()

    return action


class PlaySession:
    """Playwright-based browser automation for AI-plays mode.

    Launches a visible Chromium browser, navigates to a game URL, and
    runs the VLM decision loop: screenshot → analyze → act → repeat.

    Streams screenshots and AI thoughts back to the caller via a
    callback function.

    Args:
        game_url: URL to navigate to.
        char_id: Character ID for persona loading.
        cfg: Application config dict.
        on_frame: Callback ``(screenshot_b64, thought, action_desc)`` called
            after each decision cycle.
        db_path: Path to SQLite database.

    Example:
        >>> session = PlaySession(
        ...     "https://pokerogue.net",
        ...     char_id=1,
        ...     cfg=load_config(),
        ...     on_frame=lambda s, t, a: print(t),
        ... )
        >>> await session.start()
    """

    def __init__(
        self,
        game_url: str,
        char_id: int,
        cfg: dict,
        on_frame: Optional[Callable] = None,
        db_path: str = "backend/storage/app.db",
    ):
        self.game_url = game_url
        self.char_id = char_id
        self.cfg = cfg
        self.on_frame = on_frame
        self.db_path = db_path
        self._running = False
        self._browser = None
        self._page = None
        self._recent_thoughts: list[str] = []
        self._action_count = 0
        self._char_persona = ""
        self._game_tag = ""

    async def start(self) -> None:
        """Launch Playwright browser and begin the AI play loop.

        Raises:
            ImportError: If Playwright is not installed.
            RuntimeError: If browser launch fails.
        """
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            raise ImportError(
                "Playwright is required for AI-plays mode. "
                "Install with: pip install playwright && playwright install chromium"
            )

        # Load character persona
        import sqlite3
        try:
            con = sqlite3.connect(self.db_path)
            con.row_factory = sqlite3.Row
            row = con.execute(
                "SELECT name, persona FROM characters WHERE id = ?",
                (self.char_id,),
            ).fetchone()
            if row:
                self._char_persona = row["persona"] or ""
                self._game_tag = self.game_url.split("//")[-1].split("/")[0]
            con.close()
        except Exception as e:
            logger.warning(f"[PlaySession] Failed to load character: {e}")

        self._running = True
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(headless=False)
        self._page = await self._browser.new_page()

        # Set a reasonable viewport for game rendering
        await self._page.set_viewport_size({"width": 1280, "height": 720})

        logger.info(f"[PlaySession] Navigating to {self.game_url}")
        await self._page.goto(self.game_url, wait_until="domcontentloaded")

        # Give the game a few seconds to load
        await asyncio.sleep(3)

        # Start the decision loop
        asyncio.create_task(self._decision_loop())

    async def _decision_loop(self) -> None:
        """Main loop: screenshot → VLM → action → repeat."""
        from backend.llm.registry import get_vision_client

        adapter, model, endpoint, api_key = get_vision_client(self.cfg)

        while self._running and self._page:
            try:
                # Take screenshot
                screenshot_bytes = await self._page.screenshot(type="jpeg", quality=70)
                screenshot_b64 = base64.b64encode(screenshot_bytes).decode("ascii")

                # Build prompt
                system_prompt = _build_play_prompt(
                    self._game_tag, self._char_persona, self._recent_thoughts,
                )
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "What action should you take next?"},
                ]

                # VLM analysis
                if adapter.supports_vision():
                    images = [{"data": screenshot_b64, "media_type": "image/jpeg"}]
                    result = adapter.image_chat(
                        messages, images, model, endpoint, api_key,
                        temperature=0.6, max_tokens=150,
                    )
                else:
                    result = {"ok": False, "error": "No vision model available"}

                if not result.get("ok"):
                    logger.warning(f"[PlaySession] VLM error: {result.get('error')}")
                    await asyncio.sleep(2)
                    continue

                # Parse action
                action = _parse_action(result["reply"])
                if action.thought:
                    self._recent_thoughts.append(action.thought)
                    if len(self._recent_thoughts) > 5:
                        self._recent_thoughts.pop(0)

                # Execute action
                action_desc = await self._execute_action(action)

                # Stream back to frontend
                if self.on_frame:
                    try:
                        self.on_frame(screenshot_b64, action.thought, action_desc)
                    except Exception:
                        pass

                # Throttle
                self._action_count += 1
                if self._action_count >= MAX_ACTIONS_BEFORE_PAUSE:
                    self._action_count = 0
                    await asyncio.sleep(2)  # Brief pause to "think"
                else:
                    await asyncio.sleep(LOOP_INTERVAL_MS / 1000.0)

            except Exception as e:
                logger.error(f"[PlaySession] Decision loop error: {e}")
                await asyncio.sleep(2)

    async def _execute_action(self, action: GameAction) -> str:
        """Execute a parsed game action via Playwright.

        Args:
            action: The ``GameAction`` to execute.

        Returns:
            Human-readable description of what was done.
        """
        if not self._page:
            return "no page"

        # Rate limit
        min_interval = 1.0 / MAX_ACTIONS_PER_SEC
        await asyncio.sleep(min_interval)

        try:
            if action.action == "press" and action.key:
                await self._page.keyboard.press(action.key)
                return f"pressed {action.key}"

            elif action.action == "click":
                await self._page.mouse.click(action.x, action.y)
                return f"clicked ({action.x}, {action.y})"

            elif action.action == "type" and action.text:
                await self._page.keyboard.type(action.text, delay=50)
                return f"typed '{action.text[:20]}'"

            elif action.action == "wait":
                wait_ms = min(action.duration_ms, 5000)
                await asyncio.sleep(wait_ms / 1000.0)
                return f"waited {wait_ms}ms"

            else:
                return "unknown action"

        except Exception as e:
            logger.warning(f"[PlaySession] Action failed: {e}")
            return f"error: {e}"

    async def stop(self) -> None:
        """Stop the play session and close the browser."""
        self._running = False
        try:
            if self._page:
                await self._page.close()
                self._page = None
            if self._browser:
                await self._browser.close()
                self._browser = None
            if hasattr(self, '_playwright') and self._playwright:
                await self._playwright.stop()
                self._playwright = None
        except Exception as e:
            logger.warning(f"[PlaySession] Cleanup error: {e}")

        logger.info("[PlaySession] Session stopped")

    @property
    def is_running(self) -> bool:
        """Whether the play session is currently active."""
        return self._running
