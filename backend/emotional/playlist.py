"""Romantic Playlist Suggestions (F48) — mood-matched music recommendations.

Characters suggest mood music with specific track names based on the
emotional tone of the conversation.  Per-character music taste ensures
the suggestions feel authentic to each character's personality.

No actual audio playback — just character dialogue with track names
and emotional context for why the song fits the moment.

Example::

    >>> engine = PlaylistEngine()
    >>> engine.get_mood_tracks("romantic")[:1]
    [{'track': 'At Last — Etta James', 'context': 'For dancing in the kitchen at midnight'}]
    >>> engine.get_character_genre("Dae (Neciridae)")
    'indie_art'
"""

from __future__ import annotations

import logging
import random
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Playlist data
# ---------------------------------------------------------------------------

#: Curated playlists organized by mood.
MOOD_PLAYLISTS: dict[str, list[dict]] = {
    "romantic": [
        {"track": "At Last — Etta James", "context": "For dancing in the kitchen at midnight"},
        {"track": "Falling — Harry Styles", "context": "When you can't stop thinking about someone"},
        {"track": "The Night We Met — Lord Huron", "context": "For looking at each other too long"},
        {"track": "Can't Help Falling in Love — Elvis Presley", "context": "For moments that feel inevitable"},
        {"track": "La Vie en Rose — Edith Piaf", "context": "When the world is just the two of you"},
    ],
    "intimate": [
        {"track": "Earned It — The Weeknd", "context": "For when words aren't enough"},
        {"track": "Adorn — Miguel", "context": "For getting lost in someone"},
        {"track": "Wicked Games — The Weeknd", "context": "For 2 AM honesty"},
        {"track": "Climax — Usher", "context": "For building tension"},
        {"track": "Often — The Weeknd", "context": "For not wanting to stop"},
    ],
    "melancholy": [
        {"track": "Skinny Love — Bon Iver", "context": "For aching tenderness"},
        {"track": "Hozier — Cherry Wine", "context": "For bittersweet closeness"},
        {"track": "The Night We Met — Lord Huron", "context": "For wishing things were simpler"},
        {"track": "Liability — Lorde", "context": "For feeling too much"},
        {"track": "Apocalypse — Cigarettes After Sex", "context": "For the end of the world, together"},
    ],
    "playful": [
        {"track": "Kiss Me — Sixpence None the Richer", "context": "For being silly in love"},
        {"track": "I Wanna Be Yours — Arctic Monkeys", "context": "For blurting out feelings"},
        {"track": "Electric Love — BORNS", "context": "For that buzzing feeling"},
        {"track": "Shut Up and Dance — Walk the Moon", "context": "For grabbing someone's hand"},
        {"track": "Tongue Tied — Grouplove", "context": "For speechless moments"},
    ],
    "energetic": [
        {"track": "Physical — Dua Lipa", "context": "For energy that needs an outlet"},
        {"track": "Into You — Ariana Grande", "context": "For magnetic attraction"},
        {"track": "Do I Wanna Know? — Arctic Monkeys", "context": "For electric tension"},
        {"track": "Partition — Beyoncé", "context": "For confidence"},
        {"track": "Pony — Ginuwine", "context": "For being bold"},
    ],
}

#: Per-character music taste / genre preferences.
CHARACTER_GENRES: dict[str, dict] = {
    "indie_art": {
        "description": "Indie, art rock, experimental — Radiohead, Phoebe Bridgers, Bon Iver",
        "characters": ["Dae (Neciridae)"],
    },
    "classical_ambient": {
        "description": "Classical, ambient, instrumental — Debussy, Ólafur Arnalds, Sigur Rós",
        "characters": ["Luna (Tsukimi)", "Ayane (Yuki)"],
    },
    "pop_electronic": {
        "description": "Pop, electronic, upbeat — Dua Lipa, CHVRCHES, Charli XCX",
        "characters": ["Genki (Kitsune)", "Rin (Akane)", "Mika (Mikazuki)"],
    },
    "dark_alternative": {
        "description": "Dark alternative, trip-hop, moody — Portishead, FKA twigs, Massive Attack",
        "characters": ["Sable (Kuroha)", "Kaede (Suzuha)"],
    },
    "soul_rnb": {
        "description": "Soul, R&B, jazz — Frank Ocean, SZA, Erykah Badu",
        "characters": ["Alana Calloway", "Hana (Momoka)"],
    },
    "soft_acoustic": {
        "description": "Soft acoustic, folk — Iron & Wine, Novo Amor, Daughter",
        "characters": ["Yuki (Shirayuki)", "Tsundere (Raine)"],
    },
}

#: Reverse lookup: character name → genre key.
CHARACTER_GENRE_MAP: dict[str, str] = {}
for _genre, _data in CHARACTER_GENRES.items():
    for _char in _data["characters"]:
        CHARACTER_GENRE_MAP[_char] = _genre


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class PlaylistEngine:
    """Stateless engine for mood-matched music suggestions.

    Example::

        >>> engine = PlaylistEngine()
        >>> len(engine.get_available_moods()) >= 5
        True
    """

    def get_available_moods(self) -> list[str]:
        """Return all available playlist mood categories.

        Returns:
            Sorted list of mood strings.

        Example::

            >>> PlaylistEngine().get_available_moods()
            ['energetic', 'intimate', 'melancholy', 'playful', 'romantic']
        """
        return sorted(MOOD_PLAYLISTS.keys())

    def get_mood_tracks(self, mood: str) -> list[dict]:
        """Return all tracks for a given mood.

        Args:
            mood: Mood category (e.g. ``"romantic"``).

        Returns:
            List of track dicts with ``track`` and ``context`` keys.
            Returns empty list for unknown moods.

        Example::

            >>> tracks = PlaylistEngine().get_mood_tracks("romantic")
            >>> len(tracks) >= 3
            True
        """
        return MOOD_PLAYLISTS.get(mood, [])

    def get_random_track(self, mood: str) -> Optional[dict]:
        """Return a random track for a mood.

        Args:
            mood: Mood category.

        Returns:
            Track dict or ``None`` for unknown moods.

        Example::

            >>> track = PlaylistEngine().get_random_track("playful")
            >>> track is not None
            True
            >>> "track" in track
            True
        """
        tracks = self.get_mood_tracks(mood)
        return random.choice(tracks) if tracks else None

    def get_character_genre(self, char_name: str) -> str:
        """Return the music genre preference for a character.

        Args:
            char_name: Character display name.

        Returns:
            Genre key string; defaults to ``"indie_art"``.

        Example::

            >>> PlaylistEngine().get_character_genre("Genki (Kitsune)")
            'pop_electronic'
            >>> PlaylistEngine().get_character_genre("Unknown")
            'indie_art'
        """
        return CHARACTER_GENRE_MAP.get(char_name, "indie_art")

    def get_suggestion_prompt(self, char_name: str, mood: str) -> Optional[str]:
        """Build a prompt fragment for the character to suggest a song.

        Args:
            char_name: Character display name.
            mood: Current conversation mood.

        Returns:
            Prompt string with track suggestion, or ``None`` if no
            tracks exist for the mood.

        Example::

            >>> engine = PlaylistEngine()
            >>> prompt = engine.get_suggestion_prompt("Dae (Neciridae)", "romantic")
            >>> prompt is not None
            True
            >>> "[PLAYLIST_SUGGESTION]" in prompt
            True
        """
        track = self.get_random_track(mood)
        if not track:
            return None

        genre = self.get_character_genre(char_name)
        genre_desc = CHARACTER_GENRES.get(genre, {}).get("description", "")

        return (
            f"You could naturally suggest a song that fits this moment.\n"
            f"Song: \"{track['track']}\"\n"
            f"Why it fits: {track['context']}\n"
            f"Your music taste: {genre_desc}\n\n"
            f"Weave the suggestion naturally into conversation — don't just "
            f"announce it. Maybe hum it, or say it reminds you of them.\n\n"
            "[PLAYLIST_SUGGESTION]"
        )
