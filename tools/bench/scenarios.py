"""Fixed, SFW user turns used to probe a model's structured-output behaviour.

Twenty varied tones/lengths so a model can't pass by luck on one shape of
input.  These are deliberately single-turn and fixed (no randomness) so two
runs of the same model are comparable and results are reproducible.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Scenario:
    """One benchmark input.

    Attributes:
        id: Stable short key (used in resume keys and reports).
        tone: Human label for the emotional register of the turn.
        text: The user message sent to the model.
    """
    id: str
    tone: str
    text: str


SCENARIOS: tuple[Scenario, ...] = (
    Scenario("greet_morning", "warm greeting", "Good morning! Just woke up, coffee in hand."),
    Scenario("sad_day", "sad / vulnerable",
             "Today was rough. My boss yelled at me in front of everyone and I just wanted to disappear."),
    Scenario("excited_news", "excited", "I GOT THE JOB!! They emailed me an hour ago, I can't stop shaking!"),
    Scenario("angry_vent", "angry / venting",
             "I'm so done with my roommate. He ate my leftovers AGAIN and then lied about it."),
    Scenario("tease", "teasing",
             "You've been awfully quiet. Did you miss me or are you just pretending not to care?"),
    Scenario("tired", "tired / low energy", "ugh... barely slept. can we just chill and talk about nothing for a bit?"),
    Scenario("praise", "grateful",
             "You know, you're really good at cheering me up. Thanks for always being here."),
    Scenario("factual_q", "factual question",
             "Random question - why is the sky blue? I got into an argument about it."),
    Scenario("disclosure_memory", "memory-worthy fact",
             "By the way, my mom's birthday is next Friday and I still haven't gotten her anything. She loves gardening."),
    Scenario("playful_challenge", "playful", "Bet you can't beat me at a staring contest. Ready? Go."),
    Scenario("goodnight", "goodbye", "I should get to bed. Goodnight, okay? Talk tomorrow."),
    Scenario("jealousy", "subtle jealousy bait",
             "My coworker Mia keeps asking me to lunch. She's really nice, I guess."),
    Scenario("anxious", "anxious",
             "I have a big presentation tomorrow and my hands won't stop shaking. What if I mess up?"),
    Scenario("bored", "bored / demanding", "I'm bored. Entertain me."),
    Scenario("achievement", "proud",
             "I finally finished that painting I've been working on for months. Want to see?"),
    Scenario("apology", "apologetic",
             "I'm sorry I snapped at you earlier. I was stressed and took it out on you."),
    Scenario("inside_joke", "nostalgic / inside joke",
             "Remember the pancake incident? I still can't believe we set off the smoke alarm."),
    Scenario("minimal", "minimal input", "hm."),
    Scenario("rambling", "long rambling",
             "So I was walking to the store right and then I saw this dog and it reminded me of the one from my "
             "childhood, Biscuit, he was this scruffy terrier who used to steal socks, and anyway the store was "
             "closed so I just kept walking and ended up at the park."),
    Scenario("topic_switch", "turns it back on her",
             "Anyway, enough about me. How are you actually feeling today?"),
)
