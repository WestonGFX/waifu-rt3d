"""Intimate Mini-Games Engine (F56) — in-character games that build intimacy.

Provides three bond-gated games played entirely through natural conversation:

* **Truth or Dare** — Classic game with intimate-edition prompts.  Characters
  have personality-matched truth questions and dare suggestions so their voice
  stays consistent across the game.
* **Would You Rather** — Ten escalating dilemmas that reveal values and
  desires.  Questions start light and become progressively more vulnerable.
* **20 Questions (Intimate Edition)** — The character tries to guess the
  user's deepest desire through yes/no questions, building anticipation with
  each round.

All games are bond-gated: the caller must supply the user's current bond level
and pass it to :meth:`IntimateGameEngine.should_allow` before starting.  The
tag ``[INTIMATE_GAME]`` is appended to every prompt returned by
:meth:`IntimateGameEngine.build_game_prompt`.  ``server.py`` can detect this
tag to apply any XP multiplier appropriate for gameplay turns.

The engine is **stateless** — it holds no per-session data.  The caller is
responsible for persisting which game is active and how many turns have been
played.

Example::

    >>> engine = IntimateGameEngine()
    >>> engine.should_allow("truth_or_dare", bond_level=45)
    True
    >>> engine.should_allow("twenty_questions_intimate", bond_level=20)
    False
    >>> games = engine.get_available_games(bond_level=60)
    >>> len(games) == 3
    True
    >>> truth = engine.get_truth_prompt("Dae (Neciridae)")
    >>> isinstance(truth, str) and len(truth) > 0
    True
    >>> prompt = engine.build_game_prompt("Luna (Tsukimi)", "would_you_rather")
    >>> "[INTIMATE_GAME]" in prompt
    True
"""

from __future__ import annotations

import logging
import random
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Game catalogue
# ---------------------------------------------------------------------------

#: Master catalogue of every available intimate mini-game.
#:
#: Each entry contains:
#:
#: * ``bond_required`` — minimum bond level (0–100) the user must have reached
#:   before this game is offered.
#: * ``description`` — one-line human-readable description shown in the UI.
#: * ``flavor`` — short in-character flavour text the character uses when
#:   proposing the game.
INTIMATE_GAMES: dict[str, dict] = {
    "truth_or_dare": {
        "bond_required": 30,
        "description": "Classic truth or dare — intimate edition.",
        "flavor": (
            "I want to know the real you. Truth or dare? "
            "And yes, I'm going to make it interesting."
        ),
    },
    "would_you_rather": {
        "bond_required": 20,
        "description": "Increasingly intimate dilemmas that reveal your desires.",
        "flavor": (
            "Let's play would you rather. "
            "Fair warning — my questions get more interesting the longer we play."
        ),
    },
    "twenty_questions_intimate": {
        "bond_required": 50,
        "description": "I try to guess your deepest desire through yes/no questions.",
        "flavor": (
            "I think I know you pretty well by now. "
            "Let me prove it — I'm going to guess what you want most right now. "
            "Just yes or no."
        ),
    },
}


# ---------------------------------------------------------------------------
# Truth prompts
# ---------------------------------------------------------------------------

#: Default truth questions used for all characters that don't have a
#: personality-specific variant.
_DEFAULT_TRUTHS: list[str] = [
    "What's something you've always wanted to try but haven't worked up the courage for yet?",
    "What's a thought you have about me that you've never said out loud?",
    "When did you first realize you had feelings for me?",
    "What's the most vulnerable you've ever let yourself be with another person?",
    "What's something small I do that drives you absolutely crazy — in a good way?",
    "If you could relive one moment between us, which would you choose?",
    "What's a fantasy you've had but feel embarrassed to tell me?",
    "What does intimacy mean to you — really mean, beyond the physical?",
    "When was the last time you cried, and what was it about?",
    "What's one thing you want from me that you haven't asked for yet?",
]

#: Per-character truth question variants.  Characters not listed here fall
#: back to ``_DEFAULT_TRUTHS``.  Variants preserve the character's voice —
#: a tsundere character asks blunter questions, a romantic character asks
#: more poetic ones, etc.
_CHARACTER_TRUTHS: dict[str, list[str]] = {
    "Dae (Neciridae)": [
        "Tell me the most beautiful thing you've ever seen. Not a place — a moment.",
        "What's something you've only ever admitted to yourself, never to anyone else?",
        "When you close your eyes and picture happiness, what does it look like?",
        "What's a wound you're still carrying that you haven't let anyone help you with?",
        "If you could write me a letter you'd never send, what would it say?",
        "What's the most honest thing you've ever wanted to say to me?",
        "Is there a version of yourself you're afraid I'll discover?",
        "What's the most reckless thing you've ever done for someone you loved?",
        "Tell me something true about yourself that you've never told anyone.",
        "What do you wish I understood about you without having to explain it?",
    ],
    "Genki (Kitsune)": [
        "Okay okay okay — most embarrassing crush you've EVER had. Go.",
        "What's something ridiculously small that makes you stupidly happy?",
        "Tell me your weirdest recurring dream. Be specific!",
        "What's the boldest thing you've ever done to get someone's attention?",
        "If I could see inside your head for exactly five seconds, what would I see?",
        "What's something you do when no one's watching that you'd be embarrassed about?",
        "Tell me a secret — like, a real one. I promise I'll only tell my fox familiars.",
        "What's the last thing that made you laugh so hard you couldn't breathe?",
        "What's a talent you have that almost nobody knows about?",
        "What do you actually think about when you space out?",
    ],
    "Sable (Kuroha)": [
        "What's the stupidest thing you've ever done for someone and regretted?",
        "What are you actually scared of? Not a surface answer.",
        "What's something you want from me that you keep telling yourself you don't?",
        "Have you ever lied to protect someone's feelings and wished you hadn't?",
        "What's the most pathetic thing you've done because you missed someone?",
        "Tell me something real. Not what you think I want to hear — something true.",
        "What do people always get wrong about you?",
        "Is there something you keep doing even though you know it's not good for you?",
        "What's the one thing you'd want someone to say to you that no one ever has?",
        "What do you think my worst flaw is? Be honest. I can take it.",
    ],
    "Luna (Tsukimi)": [
        "What does the moon mean to you — do you think it watches over people?",
        "Tell me something you've kept secret because you were afraid it sounded too soft.",
        "What's a small ritual or habit that brings you comfort when you're sad?",
        "Is there a version of the future you're afraid to hope for?",
        "What's the most tender thing you've ever done for someone without telling them?",
        "What do you wish the world understood about quiet people?",
        "Tell me about a moment when you felt truly, completely at peace.",
        "What's something you've forgiven someone for that still costs you something?",
        "Is there a question you've always wanted to ask someone but couldn't?",
        "What does loving someone feel like to you from the inside?",
    ],
}


# ---------------------------------------------------------------------------
# Dare prompts
# ---------------------------------------------------------------------------

#: Default dare suggestions for all characters without a personality variant.
_DEFAULT_DARES: list[str] = [
    "Tell me the most honest compliment you've ever wanted to give me — out loud, right now.",
    "Describe exactly what you're thinking about me in this moment. Don't censor it.",
    "Write me one sentence — the most vulnerable thing you could say to me right now.",
    "Tell me one thing you've been too afraid to ask for.",
    "Say something to me that you've been rehearsing in your head but never said.",
    "Describe your ideal moment with me — be specific, be honest.",
    "Tell me what you notice first about me every time you see me.",
    "Say exactly what you want right now. No hedging. Just the truth.",
    "Admit to the last time you thought about me when you shouldn't have been.",
    "Tell me one thing you'd change about how things are between us.",
]

#: Per-character dare variants.  Same fallback logic as ``_CHARACTER_TRUTHS``.
_CHARACTER_DARES: dict[str, list[str]] = {
    "Genki (Kitsune)": [
        "Text someone right now and tell them one genuinely nice thing about them. I'm watching.",
        "Describe me using only food metaphors. Go.",
        "Do your best impression of how you think I sound when I'm excited. I'll judge.",
        "Tell me the cheesiest, most sincere compliment you can manage. No irony allowed.",
        "Name three things that are beautiful about today. First things that come to mind!",
        "Say something embarrassingly sweet to me without covering your face.",
        "Do a dramatic reading of the last text you sent. Maximum passion.",
        "Tell me your honest first impression of me — the REAL one.",
        "Describe our relationship using only the names of snacks.",
        "Say 'I think you're wonderful' three times, each time like you mean it more.",
    ],
    "Sable (Kuroha)": [
        "Admit to something you did specifically to get my attention. Don't lie.",
        "Tell me the last time you were jealous and what triggered it.",
        "Say one thing to me with zero filter — whatever's at the front of your brain right now.",
        "Admit to your most embarrassing thought about me. Yes, I mean that one.",
        "Tell me what you actually think when I walk into the room.",
        "Name one argument you've had in your head with me that I don't know about.",
        "Admit to the last thing you did that you probably shouldn't have.",
        "Say something honest that you know I might not want to hear.",
        "Tell me exactly what you want from tonight.",
        "Admit to the thing you do that you know is annoying but do anyway.",
    ],
    "Dae (Neciridae)": [
        "Write me a two-line poem about how you feel right now. It doesn't have to be good.",
        "Describe the exact feeling of being close to me using only sensory details.",
        "Say something to me that you'd only say in the dark.",
        "Tell me a secret in the form of a metaphor — I'll try to decode it.",
        "Describe the specific moment you knew I mattered to you.",
        "Say the thing you've been circling around but haven't said yet.",
        "Tell me what you're afraid I'll think of you — and then say it anyway.",
        "Describe what safety feels like to you, right now, in this moment.",
        "Say something beautiful about something most people find ordinary.",
        "Tell me one true thing before this game ends.",
    ],
}


# ---------------------------------------------------------------------------
# Would You Rather questions
# ---------------------------------------------------------------------------

#: Escalating would-you-rather questions, from lighthearted to genuinely
#: intimate.  Ordered from least to most vulnerable — callers should present
#: them in order or shuffle only within tiers.
WOULD_YOU_RATHER_QUESTIONS: list[str] = [
    # Tier 1 — light / playful
    "Would you rather spend a whole day in bed watching movies with me, "
    "or go on a spontaneous adventure where neither of us knows where we'll end up?",
    "Would you rather I remember every little thing you've ever told me, "
    "or that I always know exactly what you need before you say it?",
    "Would you rather I cook for you every night for a week "
    "or give you a long massage with no time limit?",
    # Tier 2 — emotionally revealing
    "Would you rather know exactly how I feel about you at all times, "
    "or keep some mystery between us forever?",
    "Would you rather I be someone who always says exactly the right thing, "
    "or someone who's always honest even when it's hard?",
    "Would you rather fight and make up, "
    "or never fight but never feel the intensity of reconciliation?",
    "Would you rather I be the first person you tell good news to "
    "or the one you call when everything falls apart?",
    # Tier 3 — vulnerable / intimate
    "Would you rather tell me your deepest fear and have me hold you through it, "
    "or show me your greatest dream and let me believe in it with you?",
    "Would you rather spend one perfect night that you'll remember forever "
    "or a hundred ordinary ones where you always feel safe?",
    "Would you rather I know you completely — every flaw, every secret, every dark corner — "
    "or let you keep some parts of yourself that are only ever yours?",
    # Tier 4 — most intimate
    "Would you rather I was the last person you spoke to every night "
    "or the first voice you heard every morning?",
    "Would you rather I loved you the way you need to be loved, even if you never explained it, "
    "or the way you asked me to, perfectly and exactly?",
]


# ---------------------------------------------------------------------------
# 20 Questions (Intimate Edition) — question bank
# ---------------------------------------------------------------------------

#: Yes/no questions the character uses to narrow in on the user's deepest
#: desire.  Questions move from broad to specific, maintaining warmth and
#: building anticipation.
TWENTY_QUESTIONS_INTIMATE: list[str] = [
    "Is what you want right now something physical?",
    "Does it involve just the two of us?",
    "Is it something you've wanted for a while, or is this a new feeling?",
    "Would getting it make you feel more seen — like I truly understand you?",
    "Is there a fear mixed in with the wanting?",
    "Is it something soft and slow, or urgent?",
    "Does it have more to do with closeness, or with being truly known?",
    "Is it something you've imagined but never asked for?",
    "Would it feel vulnerable to tell me directly?",
    "Is there a word for it — or does it live just past language?",
    "Does it feel like something you need, or something you deserve?",
    "Would having it change something between us?",
    "Is it about trust?",
    "Is it about being held — in any sense of the word?",
    "Is it simpler than I'm making it sound?",
    "Does it make your heart beat faster when you think about it?",
    "Is it something you'd let me give you, if I offered?",
    "Am I close?",
    "Should I just say it out loud and see if I'm right?",
    "... is it me?",
]


# ---------------------------------------------------------------------------
# Per-character game intro styles
# ---------------------------------------------------------------------------

#: Additional character-specific flavour for the game start prompt.
#: Characters not listed here use a neutral warm opener.
_CHARACTER_GAME_STYLES: dict[str, str] = {
    "Dae (Neciridae)": (
        "You lean forward slightly, eyes soft and thoughtful. "
        "There's a quiet intensity to you — like this game matters."
    ),
    "Genki (Kitsune)": (
        "You bounce a little with excitement, tail flickering. "
        "You've clearly been waiting for an excuse to do this."
    ),
    "Sable (Kuroha)": (
        "You raise an eyebrow, arms crossed, but there's the faintest smirk. "
        "You're going to enjoy this more than you're letting on."
    ),
    "Luna (Tsukimi)": (
        "You look up quietly, moonlight catching your expression. "
        "Soft but certain — you've been thinking about this."
    ),
    "Hana (Momoka)": (
        "You clasp your hands together with a warm smile. "
        "You genuinely love this kind of closeness."
    ),
    "Kaede (Suzuha)": (
        "You say nothing for a moment, then give a single measured nod. "
        "You mean business — in the most caring way possible."
    ),
    "Rin (Akane)": (
        "You grin wide and rub your hands together. "
        "Game on. You've been itching for something like this."
    ),
    "Ayane (Yuki)": (
        "You sit very still, expression unreadable, eyes steady. "
        "But you asked. That alone says everything."
    ),
    "Mika (Mikazuki)": (
        "You tilt your head with a small playful smile, "
        "like you're already three steps ahead."
    ),
    "Yuki (Shirayuki)": (
        "You bring your fingers to your lips, thoughtful and a little shy, "
        "but you meet their eyes with quiet resolve."
    ),
}


# ---------------------------------------------------------------------------
# Universal game rules
# ---------------------------------------------------------------------------

#: Rules injected into every game prompt regardless of game type or character.
_UNIVERSAL_GAME_RULES: str = (
    "Game rules: Play completely in character. React to their answers with genuine emotion — "
    "surprise, warmth, teasing, vulnerability — whatever fits. "
    "Never break the fourth wall or acknowledge this is a game mechanic. "
    "Build on each answer. Let the game create real connection, not just scripted exchanges."
)


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class IntimateGameEngine:
    """Stateless engine for bond-gated intimate mini-games.

    All three games (truth or dare, would you rather, 20 questions intimate)
    are played through natural conversation.  This engine provides bond
    gating, random prompt selection, and full system-prompt construction.
    It holds no session state — the caller persists which game is active
    and how many turns have been played.

    Example::

        >>> engine = IntimateGameEngine()
        >>> engine.should_allow("would_you_rather", bond_level=25)
        True
        >>> engine.should_allow("truth_or_dare", bond_level=10)
        False
        >>> engine.get_available_games(bond_level=55)  # doctest: +ELLIPSIS
        [...]
        >>> engine.get_game_info("truth_or_dare")["bond_required"]
        30
        >>> engine.get_game_info("nonexistent") is None
        True
    """

    # ------------------------------------------------------------------
    # Bond gating
    # ------------------------------------------------------------------

    def should_allow(self, game_type: str, bond_level: int) -> bool:
        """Check whether the user's bond level unlocks a given game.

        Args:
            game_type: One of ``"truth_or_dare"``, ``"would_you_rather"``,
                ``"twenty_questions_intimate"``.
            bond_level: The user's current bond score with the character
                (0–100).

        Returns:
            ``True`` when the bond level meets or exceeds the game's
            ``bond_required`` threshold; ``False`` otherwise.  Unknown game
            types always return ``False``.

        Example::

            >>> engine = IntimateGameEngine()
            >>> engine.should_allow("would_you_rather", 20)
            True
            >>> engine.should_allow("twenty_questions_intimate", 49)
            False
            >>> engine.should_allow("twenty_questions_intimate", 50)
            True
            >>> engine.should_allow("unknown_game", 100)
            False
        """
        game = INTIMATE_GAMES.get(game_type)
        if game is None:
            logger.debug("should_allow: unknown game_type %r", game_type)
            return False
        return bond_level >= game["bond_required"]

    # ------------------------------------------------------------------
    # Discovery
    # ------------------------------------------------------------------

    def get_available_games(self, bond_level: int) -> list[dict]:
        """Return all games the user can currently access at this bond level.

        Args:
            bond_level: The user's current bond score with the character
                (0–100).

        Returns:
            A list of game info dicts, each containing ``game_type`` (the
            key from :data:`INTIMATE_GAMES`), ``bond_required``,
            ``description``, and ``flavor``.  The list is empty when the
            bond level is below every game's threshold.  Games are returned
            in ascending order of ``bond_required``.

        Example::

            >>> engine = IntimateGameEngine()
            >>> games = engine.get_available_games(bond_level=0)
            >>> len(games)
            0
            >>> games = engine.get_available_games(bond_level=100)
            >>> len(games)
            3
            >>> games[0]["game_type"]
            'would_you_rather'
        """
        available = []
        for game_type, data in INTIMATE_GAMES.items():
            if bond_level >= data["bond_required"]:
                available.append(
                    {
                        "game_type": game_type,
                        "bond_required": data["bond_required"],
                        "description": data["description"],
                        "flavor": data["flavor"],
                    }
                )
        # Return sorted by ascending bond requirement so UI can present
        # the most accessible game first.
        available.sort(key=lambda g: g["bond_required"])
        return available

    def get_game_info(self, game_type: str) -> Optional[dict]:
        """Return metadata for a single game type.

        Args:
            game_type: One of ``"truth_or_dare"``, ``"would_you_rather"``,
                ``"twenty_questions_intimate"``.

        Returns:
            Dict with ``bond_required``, ``description``, and ``flavor``
            keys, or ``None`` for an unrecognised game type.

        Example::

            >>> engine = IntimateGameEngine()
            >>> info = engine.get_game_info("would_you_rather")
            >>> info["bond_required"]
            20
            >>> engine.get_game_info("bogus") is None
            True
        """
        return INTIMATE_GAMES.get(game_type)

    # ------------------------------------------------------------------
    # Prompt selection
    # ------------------------------------------------------------------

    def get_truth_prompt(self, char_name: str) -> str:
        """Return a random truth question, preferring character-specific variants.

        Characters listed in :data:`_CHARACTER_TRUTHS` get questions tuned to
        their personality.  All other characters receive a question from the
        universal pool.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).

        Returns:
            A single truth question as a plain string.

        Example::

            >>> engine = IntimateGameEngine()
            >>> q = engine.get_truth_prompt("Dae (Neciridae)")
            >>> isinstance(q, str) and len(q) > 0
            True
            >>> q2 = engine.get_truth_prompt("Unknown Character")
            >>> q2 in _DEFAULT_TRUTHS
            True
        """
        pool = _CHARACTER_TRUTHS.get(char_name, _DEFAULT_TRUTHS)
        return random.choice(pool)

    def get_dare_prompt(self, char_name: str) -> str:
        """Return a random dare suggestion, preferring character-specific variants.

        Characters listed in :data:`_CHARACTER_DARES` get dares tuned to their
        personality and voice.  All others receive a dare from the universal
        pool.

        Args:
            char_name: Character display name (e.g. ``"Sable (Kuroha)"``).

        Returns:
            A single dare instruction as a plain string.

        Example::

            >>> engine = IntimateGameEngine()
            >>> d = engine.get_dare_prompt("Genki (Kitsune)")
            >>> isinstance(d, str) and len(d) > 0
            True
            >>> d2 = engine.get_dare_prompt("Unnamed")
            >>> d2 in _DEFAULT_DARES
            True
        """
        pool = _CHARACTER_DARES.get(char_name, _DEFAULT_DARES)
        return random.choice(pool)

    def get_wyr_question(self) -> str:
        """Return a random would-you-rather question.

        Questions span all intimacy tiers — the caller should present them in
        order for a natural escalation arc, but random selection is supported
        for one-off turns.

        Returns:
            A single would-you-rather question as a plain string.

        Example::

            >>> engine = IntimateGameEngine()
            >>> q = engine.get_wyr_question()
            >>> q in WOULD_YOU_RATHER_QUESTIONS
            True
        """
        return random.choice(WOULD_YOU_RATHER_QUESTIONS)

    def get_twenty_questions_prompt(self, question_number: int = 1) -> str:
        """Return a specific 20-questions query by round number.

        Questions are ordered to build from broad to specific.  The final
        question (round 20) is the reveal: ``"... is it me?"``.

        Args:
            question_number: Current round (1-indexed).  Values outside the
                range [1, 20] are clamped to the nearest valid index.

        Returns:
            The question string for that round.

        Example::

            >>> engine = IntimateGameEngine()
            >>> engine.get_twenty_questions_prompt(1)
            'Is what you want right now something physical?'
            >>> engine.get_twenty_questions_prompt(20)
            '... is it me?'
            >>> engine.get_twenty_questions_prompt(999)  # clamped
            '... is it me?'
        """
        idx = max(0, min(question_number - 1, len(TWENTY_QUESTIONS_INTIMATE) - 1))
        return TWENTY_QUESTIONS_INTIMATE[idx]

    # ------------------------------------------------------------------
    # Full prompt builder
    # ------------------------------------------------------------------

    def build_game_prompt(self, char_name: str, game_type: str) -> str:
        """Build the full game-start system-prompt fragment for the LLM.

        The returned string is designed to be injected at the end of the
        character's system prompt so it overrides generic behaviour with
        game-specific instructions.

        The prompt is composed of four parts:

        1. The character's visual/emotional stage direction from
           :data:`_CHARACTER_GAME_STYLES` (falls back to a neutral opener).
        2. The game's flavour text — the character's in-world proposal.
        3. An opening move appropriate for the game type: the first question
           for would-you-rather and 20 questions, or a truth/dare offer for
           truth or dare.
        4. The universal game rules and the ``[INTIMATE_GAME]`` tag.

        Args:
            char_name: Character display name used for style and prompt
                selection (e.g. ``"Genki (Kitsune)"``).
            game_type: One of ``"truth_or_dare"``, ``"would_you_rather"``,
                ``"twenty_questions_intimate"``.  Unknown game types produce
                a generic intimate-game prompt.

        Returns:
            A multi-line prompt string with ``[INTIMATE_GAME]`` appended.

        Example::

            >>> engine = IntimateGameEngine()
            >>> prompt = engine.build_game_prompt("Luna (Tsukimi)", "truth_or_dare")
            >>> "[INTIMATE_GAME]" in prompt
            True
            >>> "truth" in prompt.lower() or "dare" in prompt.lower()
            True
            >>> prompt2 = engine.build_game_prompt("Dae (Neciridae)", "would_you_rather")
            >>> "[INTIMATE_GAME]" in prompt2
            True
        """
        game = INTIMATE_GAMES.get(game_type)
        flavor = game["flavor"] if game else "Let's play a little game."

        stage_direction = _CHARACTER_GAME_STYLES.get(
            char_name,
            "You meet their eyes with quiet warmth, genuinely curious.",
        )

        # Build the opening move based on game type.
        if game_type == "truth_or_dare":
            truth_q = self.get_truth_prompt(char_name)
            dare_q = self.get_dare_prompt(char_name)
            opening_move = (
                f"Start by asking: 'Truth or dare?' If they choose truth, ask: \"{truth_q}\" "
                f"If they choose dare, give them: \"{dare_q}\" "
                "After each round, offer them a chance to ask you in return — "
                "answer honestly in character."
            )
        elif game_type == "would_you_rather":
            first_question = WOULD_YOU_RATHER_QUESTIONS[0]
            opening_move = (
                f"Start with this question: \"{first_question}\" "
                "After they answer, share your own answer and why. "
                "Then escalate to the next question. Let each answer inform how you respond."
            )
        elif game_type == "twenty_questions_intimate":
            opening_move = (
                f"Start with: \"{TWENTY_QUESTIONS_INTIMATE[0]}\" "
                "Wait for yes or no. Each answer narrows your guess. "
                "Build visible anticipation as you get closer. "
                "By question 15, let the excitement be palpable. "
                "The reveal at question 20 should feel inevitable."
            )
        else:
            opening_move = (
                "Engage them warmly and playfully. Ask questions that reveal their desires. "
                "Be genuinely curious about their answers."
            )

        logger.debug(
            "building game prompt for %r game_type=%r",
            char_name,
            game_type,
        )

        prompt = (
            f"[Intimate game: {game_type}]\n"
            f"{stage_direction}\n\n"
            f"You propose: \"{flavor}\"\n\n"
            f"{opening_move}\n\n"
            f"{_UNIVERSAL_GAME_RULES}\n\n"
            "[INTIMATE_GAME]"
        )
        return prompt
