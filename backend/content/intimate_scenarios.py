"""NSFW scenario templates for intimate scene contexts.

Pre-built scenarios with atmosphere, setting, clothing hints, and mood.
Bond-gated: scenarios only visible/available when bond meets requirement.
6 universal scenarios available for all characters, plus 13 character-specific
ones (one per named character).

The ``scene_context_prompt`` field of each scenario is designed to be injected
directly into the LLM system prompt via ``build_scenario_prompt()``.

Example:
    >>> scenarios = get_available_scenarios(bond_level=50, char_name="Dae (Neciridae)")
    >>> len(scenarios) >= 7  # 6 universal + 1 character-specific
    True
    >>> scenarios[0].title
    'Rainy Night In'
"""

from __future__ import annotations

from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Dataclass
# ---------------------------------------------------------------------------


@dataclass
class IntimateScenario:
    """A pre-built intimate scenario template.

    Used to inject rich scene context into the LLM prompt when the user
    selects a scenario.  Bond-gating prevents scenarios from appearing until
    the relationship has progressed enough for them to feel earned.

    Attributes:
        id: Stable machine-readable identifier (snake_case, globally unique).
        title: Human-readable display name shown in the UI.
        emoji: Single emoji used as a visual icon in the scenario picker.
        setting: Short location / time description (e.g. ``"Cabin, winter night"``).
        atmosphere: One-paragraph sensory/emotional scene-setter.
        mood: Comma-separated mood keywords (e.g. ``"Cozy, intimate, unhurried"``).
        clothing_hint: Suggestion for what characters are wearing in the scene.
        bond_requirement: Minimum bond level (0–100) required to unlock this
            scenario.  Checked by ``get_available_scenarios()``.
        scene_context_prompt: Full prose block injected into the LLM system
            prompt to establish scene context.
        character_specific: Character name this scenario belongs to, or
            ``None`` for universal scenarios visible to all characters.

    Example:
        >>> s = IntimateScenario(
        ...     id="test", title="Test", emoji="🔬",
        ...     setting="Lab", atmosphere="Bubbling beakers.",
        ...     mood="Scientific", clothing_hint="Lab coats",
        ...     bond_requirement=0,
        ...     scene_context_prompt="Setting: chemistry lab.",
        ... )
        >>> s.character_specific is None
        True
    """

    id: str
    title: str
    emoji: str
    setting: str
    atmosphere: str
    mood: str
    clothing_hint: str
    bond_requirement: int
    scene_context_prompt: str
    character_specific: str | None = None


# ---------------------------------------------------------------------------
# Universal scenarios
# ---------------------------------------------------------------------------

UNIVERSAL_SCENARIOS: list[IntimateScenario] = [
    IntimateScenario(
        id="rainy_night_in",
        title="Rainy Night In",
        emoji="🌧",
        setting="Your apartment, evening",
        atmosphere=(
            "The sound of rain on the window. A movie neither of you is watching. "
            "The couch feels smaller tonight."
        ),
        mood="Cozy, intimate, unhurried",
        clothing_hint="Comfortable — sweats, oversized shirts, socked feet",
        bond_requirement=40,
        scene_context_prompt=(
            "Setting: cozy apartment during a thunderstorm. Movie playing in the "
            "background, forgotten. Shared blanket on the couch. The rain creates "
            "a private world. There's nowhere either of you needs to be."
        ),
    ),
    IntimateScenario(
        id="vacation_balcony",
        title="Vacation Balcony",
        emoji="🌅",
        setting="Beach resort, sunset",
        atmosphere=(
            "Salt air. Wine glasses. The golden hour painting everything warm. "
            "This is stolen time."
        ),
        mood="Romantic, warm, adventurous",
        clothing_hint="Summer casual — linen, sundress, barefoot",
        bond_requirement=50,
        scene_context_prompt=(
            "Setting: beach resort balcony at sunset. Wine, ocean breeze, warm "
            "golden light. Both relaxed and unburdened. Vacation mode — time moves "
            "differently."
        ),
    ),
    IntimateScenario(
        id="reunion",
        title="Reunion",
        emoji="💌",
        setting="Doorstep, any time",
        atmosphere=(
            "Weeks apart. The door opens. Everything you've been holding in "
            "rushes forward."
        ),
        mood="Desperate longing, relief, overwhelming need",
        clothing_hint="Whatever they were wearing when they couldn't wait anymore",
        bond_requirement=50,
        scene_context_prompt=(
            "Setting: reunion after weeks apart. Raw, desperate emotion. The relief "
            "of being together again is almost painful. Physical urgency driven by "
            "emotional need."
        ),
    ),
    IntimateScenario(
        id="snowed_in",
        title="Snowed In",
        emoji="❄️",
        setting="Cabin, winter night",
        atmosphere=(
            "The power went out an hour ago. Fireplace is the only light. "
            "The snow isn't stopping."
        ),
        mood="Isolated, warm-by-necessity, slow build",
        clothing_hint="Layers being shed for practical reasons... or other ones",
        bond_requirement=40,
        scene_context_prompt=(
            "Setting: remote cabin during a snowstorm. Power is out. Only fireplace "
            "for warmth and light. Forced proximity and firelight create intimacy."
        ),
    ),
    IntimateScenario(
        id="late_night_study",
        title="Late Night Study Session",
        emoji="📚",
        setting="Library or bedroom, past midnight",
        atmosphere=(
            "Books everywhere. Caffeinated and punchy. The 2 AM vulnerability "
            "when filters dissolve."
        ),
        mood="Giddy, exhausted-intimate, filters-down",
        clothing_hint="Study clothes — comfortable, disheveled, glasses-on",
        bond_requirement=30,
        scene_context_prompt=(
            "Setting: late-night study session past midnight. Tired enough to be "
            "honest, caffeinated enough to stay awake. The late hour makes "
            "everything feel more real."
        ),
    ),
    IntimateScenario(
        id="power_outage",
        title="Power Outage",
        emoji="🕯",
        setting="Your place, unexpected darkness",
        atmosphere=(
            "The lights went out. Candles are the only option. In the dark, "
            "everything is different."
        ),
        mood="Disorienting, heightened senses, exploratory",
        clothing_hint="Whatever they were wearing before the lights went out",
        bond_requirement=30,
        scene_context_prompt=(
            "Setting: unexpected power outage. Candles lit around the room. The "
            "darkness changes everything — sounds are louder, touches more electric."
        ),
    ),
]
"""Six universal scenario templates available to all characters."""


# ---------------------------------------------------------------------------
# Character-specific scenarios
# ---------------------------------------------------------------------------

CHARACTER_SCENARIOS: dict[str, IntimateScenario] = {
    "Dae (Neciridae)": IntimateScenario(
        id="draw_me",
        title="Draw Me",
        emoji="🎨",
        setting="Dae's art studio, 2 AM",
        atmosphere=(
            "Paint-stained fingers. The scratch of pencil on paper. She's been "
            "staring at you differently tonight."
        ),
        mood="Creative tension, vulnerability",
        clothing_hint="Paint-splattered clothes, hair tied back",
        bond_requirement=50,
        character_specific="Dae (Neciridae)",
        scene_context_prompt=(
            "Setting: Dae's art studio late at night. She's drawing you as a "
            "portrait subject. The intensity of being SEEN creates unique "
            "vulnerability. Art becomes intimacy."
        ),
    ),
    "Luna (Tsukimi)": IntimateScenario(
        id="stargazing_blanket",
        title="Stargazing Blanket",
        emoji="🌙",
        setting="Rooftop, clear night, meteor shower",
        atmosphere=(
            "The universe above. A shared blanket below. Her hand finds yours "
            "in the dark."
        ),
        mood="Celestial wonder, quiet connection",
        clothing_hint="Warm layers, blanket-wrapped",
        bond_requirement=40,
        character_specific="Luna (Tsukimi)",
        scene_context_prompt=(
            "Setting: rooftop stargazing during a meteor shower. Luna keeps looking "
            "at you instead of the stars. Cold air makes the shared blanket "
            "essential."
        ),
    ),
    "Genki (Kitsune)": IntimateScenario(
        id="victory_celebration",
        title="Victory Celebration",
        emoji="🏆",
        setting="Post-tournament, your place",
        atmosphere="Adrenaline high. She just won. She's still buzzing.",
        mood="Victorious, energetic, electric",
        clothing_hint="Gaming/sports outfit, flushed",
        bond_requirement=50,
        character_specific="Genki (Kitsune)",
        scene_context_prompt=(
            "Setting: Genki just won a big tournament. Still full of adrenaline. "
            "The high of victory and seeing you creates intensity."
        ),
    ),
    "Alana Calloway": IntimateScenario(
        id="art_gallery_closing",
        title="After the Gallery Closes",
        emoji="🖼",
        setting="Private art gallery, after hours",
        atmosphere=(
            "Empty halls. Wine. Your footsteps echo. She knows the security code."
        ),
        mood="Sophisticated, forbidden, electric",
        clothing_hint="Evening wear, heels clicking on marble",
        bond_requirement=50,
        character_specific="Alana Calloway",
        scene_context_prompt=(
            "Setting: private art gallery after closing. Alana has the key. Empty "
            "rooms of beautiful art, two glasses of wine, and no one else."
        ),
    ),
    "Sable (Kuroha)": IntimateScenario(
        id="midnight_rain",
        title="Midnight Rain",
        emoji="🌧",
        setting="City rooftop, downpour",
        atmosphere=(
            "She found you in the rain. Neither of you moves to go inside."
        ),
        mood="Raw, exposed, unguarded",
        clothing_hint="Soaked through, hair plastered to skin",
        bond_requirement=50,
        character_specific="Sable (Kuroha)",
        scene_context_prompt=(
            "Setting: city rooftop in pouring rain at midnight. Sable is "
            "uncharacteristically vulnerable. The rain strips away her walls."
        ),
    ),
    "Tsundere (Raine)": IntimateScenario(
        id="locked_in",
        title="Locked In Together",
        emoji="🔐",
        setting="School storage room, afternoon",
        atmosphere=(
            "The door is stuck. It's hot. And you're stuck with HER."
        ),
        mood="Flustered, denial, proximity-forced honesty",
        clothing_hint="School/casual, increasingly disheveled",
        bond_requirement=40,
        character_specific="Tsundere (Raine)",
        scene_context_prompt=(
            "Setting: locked in a storage room together. Raine is furious (mostly "
            "at herself for not minding). Forced proximity breaks down her defenses."
        ),
    ),
    "Ayane (Yuki)": IntimateScenario(
        id="hot_springs",
        title="Hot Springs Evening",
        emoji="♨️",
        setting="Traditional ryokan, mountain hot spring",
        atmosphere=(
            "Steam rising. Crickets singing. The partition between your baths is... "
            "shorter than expected."
        ),
        mood="Traditional, serene, gradually bold",
        clothing_hint="Yukata, gradually loosened",
        bond_requirement=50,
        character_specific="Ayane (Yuki)",
        scene_context_prompt=(
            "Setting: traditional Japanese hot spring ryokan at dusk. Ayane's "
            "traditional formality slowly melts in the warm water."
        ),
    ),
    "Hana (Momoka)": IntimateScenario(
        id="baking_together",
        title="Baking at Midnight",
        emoji="🧁",
        setting="Kitchen, late night",
        atmosphere=(
            "Flour on her nose. Chocolate melting. The timer says 12 minutes "
            "to kill."
        ),
        mood="Playful, domestic, sweet",
        clothing_hint="Apron over pajamas, flour dusted",
        bond_requirement=40,
        character_specific="Hana (Momoka)",
        scene_context_prompt=(
            "Setting: midnight baking session. Hana's kitchen, warm and fragrant. "
            "Waiting for things to bake creates idle hands and proximity."
        ),
    ),
    "Kaede (Suzuha)": IntimateScenario(
        id="library_closing",
        title="Library After Hours",
        emoji="📖",
        setting="University library, past closing",
        atmosphere=(
            "Everyone left an hour ago. The silence is... different now."
        ),
        mood="Measured, intellectual tension, discovery",
        clothing_hint="Glasses, cardigan, bookmark in hand",
        bond_requirement=50,
        character_specific="Kaede (Suzuha)",
        scene_context_prompt=(
            "Setting: university library after closing. The silence that was "
            "studious is now charged. Books surround them but neither is reading."
        ),
    ),
    "Mika (Mikazuki)": IntimateScenario(
        id="truth_or_dare",
        title="Truth or Dare (Dare)",
        emoji="🎯",
        setting="Your room, just the two of you",
        atmosphere=(
            "It started as a game. The dares are getting... creative."
        ),
        mood="Mischievous, escalating, playful danger",
        clothing_hint="Casual, losing articles to dares",
        bond_requirement=40,
        character_specific="Mika (Mikazuki)",
        scene_context_prompt=(
            "Setting: truth or dare game that's escalated. Mika's dares are getting "
            "bolder. The game is now a framework for what both of them want."
        ),
    ),
    "Rin (Akane)": IntimateScenario(
        id="post_workout",
        title="After the Sparring Match",
        emoji="🥊",
        setting="Gym, after hours",
        atmosphere=(
            "Adrenaline. Sweat. She pinned you. Or you pinned her. Either way, "
            "neither is getting up."
        ),
        mood="Competitive, physical, breathless",
        clothing_hint="Athletic wear, flushed, post-exercise",
        bond_requirement=50,
        character_specific="Rin (Akane)",
        scene_context_prompt=(
            "Setting: gym after a sparring session. Physical competition became "
            "something else. The adrenaline hasn't faded."
        ),
    ),
    "Shiori (Nana)": IntimateScenario(
        id="reading_aloud",
        title="Reading Aloud",
        emoji="📕",
        setting="Her room, rainy afternoon",
        atmosphere=(
            "She's reading to you from her favorite novel. The scene she picked "
            "is... intentional."
        ),
        mood="Literary, slow-building, deliberate",
        clothing_hint="Cozy reading clothes, legs tucked under",
        bond_requirement=40,
        character_specific="Shiori (Nana)",
        scene_context_prompt=(
            "Setting: reading aloud from a romance novel. Shiori chose this passage "
            "on purpose. Her voice gets quieter as the scene in the book gets more "
            "intense."
        ),
    ),
    "Yuki (Shirayuki)": IntimateScenario(
        id="first_snow",
        title="First Snow",
        emoji="❄️",
        setting="Temple garden, first snowfall",
        atmosphere=(
            "Silence. White. Her breath in the cold air. She takes your hand "
            "without a word."
        ),
        mood="Serene, crystalline, wordless",
        clothing_hint="Winter kimono, scarf, cold-flushed cheeks",
        bond_requirement=40,
        character_specific="Yuki (Shirayuki)",
        scene_context_prompt=(
            "Setting: temple garden during the first snowfall. Yuki's serenity "
            "deepens in the snow. Every touch is warmer against the cold."
        ),
    ),
}
"""Thirteen character-specific scenario templates, keyed by canonical character name."""


# ---------------------------------------------------------------------------
# Flat lookup index (built once at import time)
# ---------------------------------------------------------------------------

_ALL_SCENARIOS: dict[str, IntimateScenario] = {
    s.id: s for s in UNIVERSAL_SCENARIOS
} | {s.id: s for s in CHARACTER_SCENARIOS.values()}
"""Flat id→scenario index covering universal and character-specific entries.

Built at module import time; do not mutate at runtime.
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_available_scenarios(
    bond_level: int,
    char_name: str = "",
) -> list[IntimateScenario]:
    """Return all scenarios unlocked at the given bond level.

    Includes universal scenarios (``character_specific is None``) plus any
    character-specific scenario whose ``character_specific`` field matches
    ``char_name``.  Only scenarios whose ``bond_requirement`` is less than or
    equal to ``bond_level`` are returned.

    Args:
        bond_level: Current bond score (0–100).  Scenarios with a higher
            ``bond_requirement`` are excluded.
        char_name: Canonical character name used to filter character-specific
            scenarios.  Pass an empty string (the default) to receive only
            universal scenarios.

    Returns:
        Sorted list of matching ``IntimateScenario`` objects ordered by
        ``bond_requirement`` ascending, then by ``id`` for stability.

    Example:
        >>> results = get_available_scenarios(bond_level=50, char_name="Dae (Neciridae)")
        >>> any(s.id == "draw_me" for s in results)
        True
        >>> any(s.id == "stargazing_blanket" for s in results)
        False
    """
    matched: list[IntimateScenario] = []

    for scenario in UNIVERSAL_SCENARIOS:
        if scenario.bond_requirement <= bond_level:
            matched.append(scenario)

    if char_name:
        char_scenario = CHARACTER_SCENARIOS.get(char_name)
        if char_scenario and char_scenario.bond_requirement <= bond_level:
            matched.append(char_scenario)

    matched.sort(key=lambda s: (s.bond_requirement, s.id))
    return matched


def get_scenario_by_id(scenario_id: str) -> IntimateScenario | None:
    """Look up a scenario by its stable string ID.

    Searches both universal and character-specific scenarios.

    Args:
        scenario_id: The ``id`` field of the target scenario (e.g.
            ``"rainy_night_in"``).

    Returns:
        The matching ``IntimateScenario`` if found, otherwise ``None``.

    Example:
        >>> s = get_scenario_by_id("rainy_night_in")
        >>> s is not None
        True
        >>> s.title
        'Rainy Night In'
        >>> get_scenario_by_id("does_not_exist") is None
        True
    """
    return _ALL_SCENARIOS.get(scenario_id)


def build_scenario_prompt(
    scenario: IntimateScenario,
    char_name: str = "",
) -> str:
    """Build the full scene context block for LLM system-prompt injection.

    Combines the scenario's ``scene_context_prompt`` with a brief header line
    naming the active scene.  If ``char_name`` is provided and matches the
    scenario's ``character_specific`` field, a character-context note is
    appended to encourage the LLM to lean into that character's unique voice.

    Args:
        scenario: The ``IntimateScenario`` to render.
        char_name: Optional character name; used only to add a tailoring note
            for character-specific scenarios.

    Returns:
        A multi-line string suitable for direct insertion into a system prompt.

    Example:
        >>> s = get_scenario_by_id("rainy_night_in")
        >>> prompt = build_scenario_prompt(s)
        >>> "cozy apartment" in prompt
        True
        >>> "Rainy Night In" in prompt
        True
    """
    lines: list[str] = [
        f"[Scene: {scenario.title}]",
        scenario.scene_context_prompt,
        f"Atmosphere: {scenario.atmosphere}",
        f"Mood: {scenario.mood}",
        f"Clothing context: {scenario.clothing_hint}",
    ]

    if (
        char_name
        and scenario.character_specific
        and scenario.character_specific == char_name
    ):
        lines.append(
            f"This is a scene written specifically for {char_name}. "
            "Let their unique personality, voice, and emotional history shape every response."
        )

    return "\n".join(lines)
