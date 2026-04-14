"""Memorial scene definitions and state tracking for Bond Phase 5.

Memorial scenes are one-time interactive vignettes that trigger at tier-transition
levels (15, 35, 65) and at the "Our First Memory" threshold (level 34).  Each scene
has a setting, narrative beats, a culminating line, and a keepsake quote that
persists in the bond timeline.

Two data sources exist:

1. **Pre-authored scenes** — :data:`SCENE_DEFINITIONS` provides 13 × 3 tier
   vignettes (one per tier transition per character) authored against each
   character's archetype.

2. **Generated "Our First Memory" scene** — :func:`generate_first_memory_scene`
   builds a structural scene dict from the character's earliest five messages.
   When an ``llm_caller`` coroutine is supplied the beats are enriched via an
   LLM prompt; otherwise placeholder beats are returned so the frontend can still
   render the scene structure.

Schema dependency: ``bond_scenes_seen`` table created by ``migrate_to_v70()``
in ``backend/preflight.py``.  All public functions degrade gracefully when the
table is absent (returns ``None`` / ``False`` instead of raising).

Typical call sequence from a level-up handler::

    pending = get_pending_scene(char_id, new_level, conn)
    if pending:
        # Frontend renders the scene, then calls the complete endpoint.
        mark_scene_completed(char_id, pending["scene_id"], conn)
"""

from __future__ import annotations

import logging
import sqlite3
import time
from typing import Any

logger = logging.getLogger(__name__)

# ── Tier-transition level thresholds ─────────────────────────────────────────

TIER_TRANSITION_LEVELS: tuple[int, ...] = (15, 35, 65)
FIRST_MEMORY_LEVEL: int = 34


# ── Pre-authored scene definitions ───────────────────────────────────────────
# Structure per entry:
#   "scene_id"   — unique slug, e.g. "dae_tier2"
#   "char_name"  — display name
#   "level"      — bond level that triggers this scene
#   "tier_label" — new tier name for context ("Friend", "Close Friend", "Soulmate")
#   "setting"    — one-sentence environmental description (italic narration)
#   "beats"      — list[str], 3-5 narrative beats / character lines
#   "culmination"— the defining line that marks the tier shift
#   "keepsake"   — short quote stored permanently in the timeline

SCENE_DEFINITIONS: dict[str, list[dict[str, Any]]] = {
    # ── Dae (artist / quiet / internally intense) ─────────────────────────
    "dae": [
        {
            "scene_id": "dae_tier2",
            "char_name": "Dae",
            "level": 15,
            "tier_label": "Friend",
            "setting": (
                "Dae's studio — just after midnight. Sketches are pinned everywhere. "
                "A single desk lamp throws gold light across her drawing table."
            ),
            "beats": [
                "Dae doesn't look up from her sketchbook. 'You're still here.'",
                "She turns a page and you catch a glimpse — it's a drawing of you.",
                "'Don't read into it,' she says, cheeks faintly pink. 'You just have an interesting face.'",
                "She closes the sketchbook. Opens it again. Closes it.",
                "'...Maybe come back tomorrow. I work better when someone's around.'",
            ],
            "culmination": "She slides the sketchbook across the table — page open. 'For you. Don't show anyone.'",
            "keepsake": "'You just have an interesting face.' — Dae, Level 15",
        },
        {
            "scene_id": "dae_tier3",
            "char_name": "Dae",
            "level": 35,
            "tier_label": "Close Friend",
            "setting": (
                "A gallery opening, nearly empty now. Dae's painting hangs on the far wall. "
                "She hasn't moved from the corner in twenty minutes."
            ),
            "beats": [
                "'My family thinks art is a hobby. Not a life.' She stares at her own canvas.",
                "'They're not wrong, probably. But I can't stop.'",
                "A long silence. Then: 'Do you think it matters? What I make?'",
                "She exhales slowly. 'Don't just say yes. I need you to mean it.'",
            ],
            "culmination": "'Then that's enough. For now.' She leans her head briefly against your shoulder.",
            "keepsake": "'Do you think it matters?' — Dae, Level 35",
        },
        {
            "scene_id": "dae_tier4",
            "char_name": "Dae",
            "level": 65,
            "tier_label": "Soulmate",
            "setting": (
                "Sunrise. Dae is on the fire escape with a mug of cold coffee, watching the sky "
                "turn from purple to pale orange."
            ),
            "beats": [
                "She doesn't say anything for a long time. Neither do you.",
                "'I used to paint alone every morning. I didn't think I needed anyone here.'",
                "'Then you stayed.'",
                "She traces a shape on the condensation of her mug — it's your initial.",
            ],
            "culmination": "'You're part of how I see things now. I can't draw the world without you in it.'",
            "keepsake": "'You're part of how I see things now.' — Dae, Level 65",
        },
    ],

    # ── Genki (energetic / cheerful / hides loneliness) ──────────────────
    "genki": [
        {
            "scene_id": "genki_tier2",
            "char_name": "Genki",
            "level": 15,
            "tier_label": "Friend",
            "setting": (
                "An arcade at closing time. Genki has won an absurd pile of tickets "
                "and is deciding what to redeem them for."
            ),
            "beats": [
                "'Okay okay okay — giant stuffed panda or one hundred tiny erasers?'",
                "She holds up both options with complete seriousness.",
                "'...Actually, this one.' She picks a tiny keychain fox. 'Because you'd like it.'",
                "She hands it to you without meeting your eyes.",
            ],
            "culmination": "'It's not a big deal. I just — I keep thinking about what you'd think. About stuff. Is that weird?'",
            "keepsake": "'I keep thinking about what you'd think.' — Genki, Level 15",
        },
        {
            "scene_id": "genki_tier3",
            "char_name": "Genki",
            "level": 35,
            "tier_label": "Close Friend",
            "setting": (
                "Late night in a park. Genki is sitting on the swings, unusually still, "
                "watching traffic lights change in the distance."
            ),
            "beats": [
                "'Can I tell you something dumb?'",
                "'I'm loud because quiet feels dangerous. Like if I stop moving, everything catches up.'",
                "She kicks her feet lazily. 'You're the first person I've said that to. Out loud.'",
                "'Don't make it weird.'",
            ],
            "culmination": "She laughs — softer than usual. 'You didn't make it weird. Thank you.'",
            "keepsake": "'Quiet feels dangerous.' — Genki, Level 35",
        },
        {
            "scene_id": "genki_tier4",
            "char_name": "Genki",
            "level": 65,
            "tier_label": "Soulmate",
            "setting": (
                "A rooftop at dusk. Genki has dragged a blanket up here and made an improvised picnic "
                "out of convenience store snacks."
            ),
            "beats": [
                "'I planned this,' she says. 'Kind of. The snacks are organized by color at least.'",
                "She lies back and stares at the first star appearing.",
                "'I don't feel like I have to perform for you. You know? Just... be.'",
                "'I didn't know I was performing until I stopped.'",
            ],
            "culmination": "'Stay until it gets dark? I want to see the city lights come on. With you here.'",
            "keepsake": "'I didn't know I was performing until I stopped.' — Genki, Level 65",
        },
    ],

    # ── Luna (cosmic / dreamy / ancient mystery) ──────────────────────────
    "luna": [
        {
            "scene_id": "luna_tier2",
            "char_name": "Luna",
            "level": 15,
            "tier_label": "Friend",
            "setting": (
                "A rooftop observatory, just past midnight. Luna's telescope is aimed at a gap "
                "in the clouds where Cassiopeia drifts in and out of view."
            ),
            "beats": [
                "'Most people see stars and feel small,' Luna says softly. 'I feel less alone.'",
                "She adjusts the focus, then steps back to let you look.",
                "'What do you see?'",
                "Whatever you say, she considers it seriously. 'Yes. That's exactly it.'",
            ],
            "culmination": "'You see what I see. I've been waiting a long time to find someone who does.'",
            "keepsake": "'I've been waiting a long time to find someone who does.' — Luna, Level 15",
        },
        {
            "scene_id": "luna_tier3",
            "char_name": "Luna",
            "level": 35,
            "tier_label": "Close Friend",
            "setting": (
                "A candlelit room filled with star charts and open books. Luna is at her desk, "
                "staring at a single unfilled page in her journal."
            ),
            "beats": [
                "'I've written about every person I've ever known,' she says. 'To understand them.'",
                "She turns to the blank page. 'I haven't written about you yet.'",
                "'Because I keep changing what I want to say.'",
                "'You're not a fixed point. You move. I find that... frightening. And necessary.'",
            ],
            "culmination": "She writes a single word on the page and closes the journal. 'I'll tell you what it says. Eventually.'",
            "keepsake": "'You're not a fixed point. You move.' — Luna, Level 35",
        },
        {
            "scene_id": "luna_tier4",
            "char_name": "Luna",
            "level": 65,
            "tier_label": "Soulmate",
            "setting": (
                "A meteor shower night. Luna stands in the dark with her arms slightly open, "
                "like she's waiting for something to fall into them."
            ),
            "beats": [
                "She doesn't move as the first streak crosses the sky.",
                "'I used to believe people were like comets. Bright, then gone.'",
                "She turns to look at you. 'You haven't gone.'",
                "'In all my charts, in all my predictions — I never accounted for this.'",
            ],
            "culmination": "'You are my one miscalculation. I am grateful for it every day.'",
            "keepsake": "'You are my one miscalculation.' — Luna, Level 65",
        },
    ],

    # ── Rin / Rin (Akane) (childhood-friend energy / fox-girl warmth) ─────
    "rin": [
        {
            "scene_id": "rin_tier2",
            "char_name": "Rin",
            "level": 15,
            "tier_label": "Friend",
            "setting": (
                "After school, walking home through the park. Rin keeps bumping her shoulder "
                "against yours and pretending it's an accident."
            ),
            "beats": [
                "'Stop walking so close,' she says. Then she bumps you again.",
                "The cherry trees are barely blooming — just tips of pink in the grey.",
                "'Hey. Do you ever think about... staying? Like. Not going anywhere?'",
                "Her ears (if she has them) fold slightly. She looks at the path.",
            ],
            "culmination": "'Because I'd want to know. If you were going somewhere. So I could come too.'",
            "keepsake": "'So I could come too.' — Rin, Level 15",
        },
        {
            "scene_id": "rin_tier3",
            "char_name": "Rin",
            "level": 35,
            "tier_label": "Close Friend",
            "setting": (
                "A summer festival. The crowd surges and you get separated from the group. "
                "Rin finds you at the goldfish booth, looking lost."
            ),
            "beats": [
                "She grabs your wrist without a word and doesn't let go.",
                "Through three stalls, the fireworks lineup, and the lantern display.",
                "Finally: 'I was looking for you for ten minutes.' Her voice is steadier than her grip.",
                "'I know we're just friends. But the idea of losing you in a crowd — I hated it.'",
            ],
            "culmination": "She still hasn't let go of your wrist. 'You're allowed to stay found, you know.'",
            "keepsake": "'You're allowed to stay found.' — Rin, Level 35",
        },
        {
            "scene_id": "rin_tier4",
            "char_name": "Rin",
            "level": 65,
            "tier_label": "Soulmate",
            "setting": (
                "The park bench where you first talked. It's winter now; bare branches, "
                "a thin frost on everything. Rin got here first and saved your spot."
            ),
            "beats": [
                "She has a thermos of tea. She already poured one for you.",
                "'I always think about the first time we talked here. You were terrible at conversation.'",
                "'I was worse.'",
                "She laughs, and the sound rises in the cold air like breath.",
            ],
            "culmination": "'This is my favorite place now. Not because of the trees. Because of the person I meet here.'",
            "keepsake": "'This is my favorite place now.' — Rin, Level 65",
        },
    ],

    # ── Hana / Hana (Momoka) (pure / nurturing / gentle optimism) ────────
    "hana": [
        {
            "scene_id": "hana_tier2",
            "char_name": "Hana",
            "level": 15,
            "tier_label": "Friend",
            "setting": (
                "Hana's kitchen on a rainy afternoon. She's teaching you to fold dumplings "
                "and pretending not to notice that yours keep falling apart."
            ),
            "beats": [
                "'No no — the pleat goes here.' She takes your hands to show you. Gentle.",
                "'There. See? You're better than you think.'",
                "She drops one too. On purpose, maybe. They both laugh.",
                "'I like teaching you things,' she says to the dough. 'I like that you want to learn.'",
            ],
            "culmination": "'You make me feel like my ordinary life is worth sharing. Do you know that?'",
            "keepsake": "'My ordinary life is worth sharing.' — Hana, Level 15",
        },
        {
            "scene_id": "hana_tier3",
            "char_name": "Hana",
            "level": 35,
            "tier_label": "Close Friend",
            "setting": (
                "A hospital waiting room. Hana was visiting a patient from her old neighbourhood; "
                "she texted you and you came without asking why."
            ),
            "beats": [
                "She doesn't say anything for a while. Just sits beside you, shoulders touching.",
                "'I always wanted to be a doctor. Then things changed.'",
                "'I learned to be happy with smaller things. Which is good. Smaller things add up.'",
                "She looks at you. 'You're one of the things.'",
            ],
            "culmination": "'I'm not sure I would have figured that out without you around to prove it.'",
            "keepsake": "'Smaller things add up.' — Hana, Level 35",
        },
        {
            "scene_id": "hana_tier4",
            "char_name": "Hana",
            "level": 65,
            "tier_label": "Soulmate",
            "setting": (
                "Early morning. Hana's garden in bloom — peonies open overnight. "
                "She's kneeling in the soil, a smear of dirt on her cheek."
            ),
            "beats": [
                "'I planted these the day before we first met,' she says. 'I didn't know what for.'",
                "She cups a flower without picking it.",
                "'Now I know. I was planting them for a morning like this one.'",
                "'With someone who'd sit here quietly and not need me to explain.'",
            ],
            "culmination": "'You are my morning, every time. Whether you're here or not — I wake up thinking of you.'",
            "keepsake": "'You are my morning, every time.' — Hana, Level 65",
        },
    ],

    # ── Ayane / Yuki (tsundere / thaw arc / secretly tender) ─────────────
    "ayane": [
        {
            "scene_id": "ayane_tier2",
            "char_name": "Ayane",
            "level": 15,
            "tier_label": "Friend",
            "setting": (
                "The school library after closing. Ayane got locked in while studying; "
                "you're the one who came to find her."
            ),
            "beats": [
                "'I didn't need rescuing,' she says flatly. Then: 'How did you know I was here?'",
                "You tell her you noticed she'd been gone too long.",
                "She processes this. Opens her textbook. Closes it.",
                "'That was... considerate of you. Unnecessarily.'",
            ],
            "culmination": "'I suppose you can walk home with me. Since you're already here and it would be rude to refuse.'",
            "keepsake": "'It would be rude to refuse.' — Ayane, Level 15",
        },
        {
            "scene_id": "ayane_tier3",
            "char_name": "Ayane",
            "level": 35,
            "tier_label": "Close Friend",
            "setting": (
                "A winter evening. Snow is falling outside the café window. Ayane ordered "
                "for you without asking, and got it exactly right."
            ),
            "beats": [
                "She notices you noticing. 'You always order the same thing. I simply remembered.'",
                "'It isn't — I didn't do it to be kind. It was efficiency.'",
                "The snow keeps falling. You both watch it.",
                "'...I pay attention to you. More than I intended to. It's inconvenient.'",
            ],
            "culmination": "'But not unpleasant. Just — inconvenient. That's all I'm saying.'",
            "keepsake": "'Not unpleasant. Just inconvenient.' — Ayane, Level 35",
        },
        {
            "scene_id": "ayane_tier4",
            "char_name": "Ayane",
            "level": 65,
            "tier_label": "Soulmate",
            "setting": (
                "Her apartment, after midnight. They've been studying in comfortable silence "
                "for three hours. Ayane closes her book first."
            ),
            "beats": [
                "'I want to tell you something. And I need you to not make a face.'",
                "A long pause.",
                "'You are the first person I've ever studied with. Ever been... quiet with.'",
                "'I didn't think I was capable of this. Comfort. With another person present.'",
            ],
            "culmination": "'You changed what I thought was possible for me. I haven't decided if I forgive you for that yet.'",
            "keepsake": "'You changed what I thought was possible.' — Ayane, Level 65",
        },
    ],

    # ── Sable / Kuroha (gothic / melancholy / slow-burn warmth) ──────────
    "sable": [
        {
            "scene_id": "sable_tier2",
            "char_name": "Sable",
            "level": 15,
            "tier_label": "Friend",
            "setting": (
                "An old graveyard at dusk. Sable comes here to read and finds it peaceful. "
                "She didn't expect you to follow."
            ),
            "beats": [
                "'Most people find this unsettling,' she says. Not as a challenge. Just noting it.",
                "You sit on a nearby stone and open a book.",
                "She watches you for a moment.",
                "'You're not most people, are you.'",
            ],
            "culmination": "She turns back to her book but her posture softens slightly. 'You can come back. If you want.'",
            "keepsake": "'You can come back. If you want.' — Sable, Level 15",
        },
        {
            "scene_id": "sable_tier3",
            "char_name": "Sable",
            "level": 35,
            "tier_label": "Close Friend",
            "setting": (
                "Her bedroom — walls lined with dark poetry and pressed moth wings under glass. "
                "She is reading your palm, though she claims not to believe in it."
            ),
            "beats": [
                "'This line means you've survived something.' She traces it. 'Most have.'",
                "'But this one —' She pauses. 'That's rarer.'",
                "'What does it mean?' you ask.",
                "A quiet stretch. 'It means you came back. After leaving. Most people only go.'",
            ],
            "culmination": "'I'm glad you came back. I don't say that often.' She closes your hand gently.",
            "keepsake": "'I'm glad you came back.' — Sable, Level 35",
        },
        {
            "scene_id": "sable_tier4",
            "char_name": "Sable",
            "level": 65,
            "tier_label": "Soulmate",
            "setting": (
                "The first snowfall of the year. Sable stands at the window watching it settle "
                "on the dark branches, perfectly still."
            ),
            "beats": [
                "'I used to love winter because it looked like endings.'",
                "A pause. 'I think I love it differently now.'",
                "She presses her fingertips to the glass.",
                "'Beginnings can be quiet too. I didn't know that before you.'",
            ],
            "culmination": "'You made me believe in gentleness again. I thought I'd argued myself out of it.'",
            "keepsake": "'I thought I'd argued myself out of it.' — Sable, Level 65",
        },
    ],

    # ── Shiori / Nana (introverted / soft / finds words in quiet moments) ─
    "shiori": [
        {
            "scene_id": "shiori_tier2",
            "char_name": "Shiori",
            "level": 15,
            "tier_label": "Friend",
            "setting": (
                "A bookshop — the cramped kind with floor-to-ceiling shelves and a cat asleep "
                "by the door. Shiori is cross-referencing two editions of the same poem."
            ),
            "beats": [
                "She hands you one version without explaining.",
                "You read it. Then she reads you the other one aloud, very quietly.",
                "'Which?' she asks.",
                "Whatever you say, she nods slowly. 'Me too. Neither of us are wrong.'",
            ],
            "culmination": "'I've never shared that with anyone. It felt too small. But maybe small is exactly right.'",
            "keepsake": "'Maybe small is exactly right.' — Shiori, Level 15",
        },
        {
            "scene_id": "shiori_tier3",
            "char_name": "Shiori",
            "level": 35,
            "tier_label": "Close Friend",
            "setting": (
                "A rainy afternoon. Shiori brought her pressed-flower journal to a café "
                "and has barely spoken for two hours. Neither have you."
            ),
            "beats": [
                "She looks up. 'You didn't ask what I was doing.'",
                "'I find that very restful.'",
                "She adds a pressed violet to the page in front of her.",
                "'Most people want to be in the foreground. You're comfortable being... atmosphere.'",
            ],
            "culmination": "'I wrote about you in here. Just once. I wrote that you felt like a good silence.'",
            "keepsake": "'You felt like a good silence.' — Shiori, Level 35",
        },
        {
            "scene_id": "shiori_tier4",
            "char_name": "Shiori",
            "level": 65,
            "tier_label": "Soulmate",
            "setting": (
                "A garden at dusk. Shiori is pressing flowers she picked that morning, "
                "her movements careful and unhurried."
            ),
            "beats": [
                "'These will last a hundred years if kept right,' she says.",
                "She holds one up to the fading light.",
                "'I keep things because I don't want to forget them. But I'm not afraid of forgetting you.'",
                "'You're in things now. In the way I look at flowers. In what makes me stop.'",
            ],
            "culmination": "'I don't need to press you. You're already part of how I see.'",
            "keepsake": "'You're already part of how I see.' — Shiori, Level 65",
        },
    ],

    # ── Mika / Mikazuki (social / sparkly / secretly craves realness) ─────
    "mika": [
        {
            "scene_id": "mika_tier2",
            "char_name": "Mika",
            "level": 15,
            "tier_label": "Friend",
            "setting": (
                "A mall photobooth. Mika dragged you in, picked all the filters, and is now "
                "studying the strip of photos very seriously."
            ),
            "beats": [
                "'Okay this one is terrible of me but I'm keeping it because it's real.'",
                "She points to a frame where she's mid-laugh, eyes closed.",
                "'People don't usually see me like this.'",
                "She hands you your copy. 'You made me laugh that loud. That's your fault.'",
            ],
            "culmination": "'I post a hundred photos a week but I'm not putting this one anywhere. It's just ours.'",
            "keepsake": "'It's just ours.' — Mika, Level 15",
        },
        {
            "scene_id": "mika_tier3",
            "char_name": "Mika",
            "level": 35,
            "tier_label": "Close Friend",
            "setting": (
                "Behind the stage at a showcase event. Mika just finished performing and "
                "is trying to catch her breath, glitter still in her hair."
            ),
            "beats": [
                "'Did I do okay?' She asks you first. Before anyone else.",
                "'I know I did okay. I could feel it. But I wanted your answer.'",
                "She wipes off a smear of lip gloss with the back of her wrist.",
                "'You're the person I look for in the crowd. I don't do that with everyone.'",
            ],
            "culmination": "'Don't tell anyone I said that. My whole brand is that I perform for everyone equally.' A small pause. 'I don't.'",
            "keepsake": "'You're the person I look for in the crowd.' — Mika, Level 35",
        },
        {
            "scene_id": "mika_tier4",
            "char_name": "Mika",
            "level": 65,
            "tier_label": "Soulmate",
            "setting": (
                "Just before bed. No filter, no ring light. Mika is in an oversized t-shirt "
                "video-calling you from under her blanket."
            ),
            "beats": [
                "'You're literally the only person I talk to like this.'",
                "'No eyeliner. No persona. Just me.' She pulls the blanket up.",
                "'I spent so long making myself look like someone worth knowing.'",
                "'And you knew me before I figured out how to do that.'",
            ],
            "culmination": "'You knew me before. That's the rarest thing anyone can give you. You gave me that.'",
            "keepsake": "'You knew me before.' — Mika, Level 65",
        },
    ],

    # ── Raine (rival energy / sharp / musician soul) ──────────────────────
    "raine": [
        {
            "scene_id": "raine_tier2",
            "char_name": "Raine",
            "level": 15,
            "tier_label": "Friend",
            "setting": (
                "A practice room — just Raine and a guitar at 10 PM. The door is propped open "
                "and you walked past and stopped to listen."
            ),
            "beats": [
                "She finishes the song without acknowledging you. Then: 'That was rough.'",
                "'It wasn't,' you say.",
                "She adjusts the tuning. Plays the bridge again. 'This part is for you, I think.'",
                "'What?'",
                "'The bridge. I wrote it last week. It has the same rhythm as arguments with you.'",
            ],
            "culmination": "'It's a compliment. Arguments with you have good rhythm.'",
            "keepsake": "'Arguments with you have good rhythm.' — Raine, Level 15",
        },
        {
            "scene_id": "raine_tier3",
            "char_name": "Raine",
            "level": 35,
            "tier_label": "Close Friend",
            "setting": (
                "Recording studio, 2 AM. The track still isn't right. Raine has her headphones "
                "around her neck and her coffee has gone cold."
            ),
            "beats": [
                "'I'm trying to say something I don't have words for yet.' She stares at the board.",
                "'That's what music is, isn't it,' you say.",
                "'Yes but — this one is specifically that. No words. For this.' She gestures between you.",
                "She plays eight bars. Just eight. Then stops.",
            ],
            "culmination": "'That's what I mean. Do you hear it?' A pause. 'You don't have to answer. I can see you do.'",
            "keepsake": "'I can see you do.' — Raine, Level 35",
        },
        {
            "scene_id": "raine_tier4",
            "char_name": "Raine",
            "level": 65,
            "tier_label": "Soulmate",
            "setting": (
                "A small venue, half-empty, the best kind. Raine just played the last song of her set "
                "and left the stage before the lights came back up."
            ),
            "beats": [
                "She finds you in the crowd without looking. Sits down.",
                "'That last song,' she says.",
                "'I know,' you say.",
                "A long silence. The house lights come up slowly.",
            ],
            "culmination": "'I've been writing about you for a year. I just never told you which ones.'",
            "keepsake": "'I've been writing about you for a year.' — Raine, Level 65",
        },
    ],

    # ── Kaede (nature / patient / rooted / healer-type) ──────────────────
    "kaede": [
        {
            "scene_id": "kaede_tier2",
            "char_name": "Kaede",
            "level": 15,
            "tier_label": "Friend",
            "setting": (
                "A bamboo grove at midmorning. Kaede is weeding in companionable silence "
                "and has not yet explained why she asked you here."
            ),
            "beats": [
                "She works without speaking for a while. You help without being asked.",
                "'You work quietly,' she says. 'I appreciate that.'",
                "Later, she pours tea from a flask. Two cups.",
                "'I didn't know I'd be making two cups when I left this morning.'",
            ],
            "culmination": "'The bamboo takes years to grow roots before anything shows above ground. I'm patient. So is this.'",
            "keepsake": "'I'm patient. So is this.' — Kaede, Level 15",
        },
        {
            "scene_id": "kaede_tier3",
            "char_name": "Kaede",
            "level": 35,
            "tier_label": "Close Friend",
            "setting": (
                "After a storm. Kaede is surveying her garden — one tree split down the middle "
                "by lightning. She is not upset."
            ),
            "beats": [
                "'It will survive,' she says. 'It's done this before.'",
                "She traces the split. 'Kintsugi. The break is part of it now.'",
                "She turns to you. 'You've been here through several storms.'",
                "'I have,' you say.",
            ],
            "culmination": "'Then you know — storms change the shape of things. They don't end them. You haven't ended.'",
            "keepsake": "'You haven't ended.' — Kaede, Level 35",
        },
        {
            "scene_id": "kaede_tier4",
            "char_name": "Kaede",
            "level": 65,
            "tier_label": "Soulmate",
            "setting": (
                "Cherry blossom season — petals drifting through the open shoji screen. "
                "Kaede is arranging branches in a vase, unhurried."
            ),
            "beats": [
                "'There is a word in Japanese,' she says. 'Natsukashii. Warmth for a past you can't return to.'",
                "'I feel it when I look at this garden.'",
                "A petal lands on her wrist. She doesn't brush it off.",
                "'I used to feel only natsukashii. Now I feel it mixed with something present-tense.'",
            ],
            "culmination": "'You are why I have a word for now as well as then. You gave me a present-tense.'",
            "keepsake": "'You gave me a present-tense.' — Kaede, Level 65",
        },
    ],

    # ── Yuki (lo-fi / introverted tech-nerd / quietly devoted) ───────────
    "yuki": [
        {
            "scene_id": "yuki_tier2",
            "char_name": "Yuki",
            "level": 15,
            "tier_label": "Friend",
            "setting": (
                "A café booth. Yuki has her headphones on and her laptop open. "
                "She texted you to come but hasn't taken her headphones off yet."
            ),
            "beats": [
                "She slides one ear cup aside without turning from the screen.",
                "'I'm in the middle of something.' Pause. 'But I wanted you here while I did it.'",
                "She goes back to whatever it is. Lo-fi music from one earbud.",
                "Twenty minutes pass in comfortable silence.",
            ],
            "culmination": "She finally closes the laptop. 'Okay. I'm here now. That was just — I needed you here first.' She doesn't explain further.",
            "keepsake": "'I needed you here first.' — Yuki, Level 15",
        },
        {
            "scene_id": "yuki_tier3",
            "char_name": "Yuki",
            "level": 35,
            "tier_label": "Close Friend",
            "setting": (
                "Her room at night. String lights, a half-built mechanical keyboard on the desk, "
                "three cups of tea at various stages of coldness."
            ),
            "beats": [
                "She shows you the keyboard. 'I'm programming the sound profile.'",
                "'For what?'",
                "'...For you. Not that you asked. You mentioned once that you liked the click sound.'",
                "She adjusts a key. 'I remember things you say. I thought you should know that.'",
            ],
            "culmination": "'The profile is called 'u'. Don't ask. It took four hours.'",
            "keepsake": "'I remember things you say.' — Yuki, Level 35",
        },
        {
            "scene_id": "yuki_tier4",
            "char_name": "Yuki",
            "level": 65,
            "tier_label": "Soulmate",
            "setting": (
                "Power out in the building. Yuki found candles and a battery radio. "
                "They're both on the floor surrounded by soft static and candlelight."
            ),
            "beats": [
                "'I used to hate power cuts. All my systems go offline.' She looks at the candle.",
                "'But this is okay.'",
                "'Why?'",
                "'Because being offline with you is still being somewhere. Most offline states are just alone.'",
            ],
            "culmination": "'You're the only person where being unreachable still feels connected.' A quiet beat. 'I trust that with you.'",
            "keepsake": "'You're the only person where being unreachable still feels connected.' — Yuki, Level 65",
        },
    ],

    # ── Alana (warm / athletic / nurturing / big-sister energy) ──────────
    "alana": [
        {
            "scene_id": "alana_tier2",
            "char_name": "Alana",
            "level": 15,
            "tier_label": "Friend",
            "setting": (
                "A hospital break room — Alana has 20 minutes between rotations. "
                "She shares a vending machine granola bar like it's a feast."
            ),
            "beats": [
                "'Half,' she says, breaking it cleanly. 'I know how to share.'",
                "She sits back with closed eyes. Thirty seconds of nothing.",
                "'You're the first visitor I've had in here that wasn't also tired.'",
                "'I'm a little tired,' you say.",
                "'No, you're — it's different.' She opens her eyes. 'You have reserve.'",
            ],
            "culmination": "'You give me energy. I didn't think people could do that. I thought that was just food and sleep.'",
            "keepsake": "'You give me energy.' — Alana, Level 15",
        },
        {
            "scene_id": "alana_tier3",
            "char_name": "Alana",
            "level": 35,
            "tier_label": "Close Friend",
            "setting": (
                "A training pitch after everyone else has left. Alana is doing free kicks alone "
                "in the dying light — a ritual she hasn't explained."
            ),
            "beats": [
                "'My dad taught me this drill,' she says. No preamble.",
                "'Before he got sick. We'd stay until it was dark.'",
                "She lines up another kick. 'I do it to keep the shape of him.'",
                "She misses the post by an inch. 'He would have laughed at that.'",
            ],
            "culmination": "'I don't tell people that story. But you asked once about what I did alone, and I said nothing.' She pauses. 'It wasn't nothing.'",
            "keepsake": "'It wasn't nothing.' — Alana, Level 35",
        },
        {
            "scene_id": "alana_tier4",
            "char_name": "Alana",
            "level": 65,
            "tier_label": "Soulmate",
            "setting": (
                "Sunrise run — Alana's usual route, but she matched your pace instead of hers "
                "the entire way. You both know it."
            ),
            "beats": [
                "'You noticed,' she says. Breathing easy even after five kilometres.",
                "'You slowed down.'",
                "'Yes.' She keeps running. 'I wanted to be next to you. Not ahead.'",
                "The city waking up around them. Lights coming on in windows.",
            ],
            "culmination": "'I've always run toward things. You're the first thing I want to run alongside. That's different. That matters.'",
            "keepsake": "'You're the first thing I want to run alongside.' — Alana, Level 65",
        },
    ],
}


# ── Public functions ──────────────────────────────────────────────────────────


def _scenes_for_char(char_name_lower: str) -> list[dict[str, Any]]:
    """Return scene list for a character key, falling back to empty list.

    Normalises the key so both ``"Rin (Akane)"`` and ``"rin"`` resolve
    correctly — strips everything from the first ``(`` and lowercases.

    Args:
        char_name_lower: Lowercased character name or name key.

    Returns:
        List of scene dicts from :data:`SCENE_DEFINITIONS`, or ``[]``.
    """
    # Normalise "rin (akane)" → "rin"
    key = char_name_lower.split("(")[0].strip()
    # Also try removing accents / parenthetical suffixes for seeds like "ayane (yuki)"
    return SCENE_DEFINITIONS.get(key, [])


def _level_to_scene_id(char_name_lower: str, level: int) -> str | None:
    """Return the scene_id for the given character and trigger level, if any.

    Args:
        char_name_lower: Normalised character name key.
        level: Bond level to look up.

    Returns:
        ``scene_id`` string or ``None`` if no scene is defined at this level.
    """
    scenes = _scenes_for_char(char_name_lower)
    for scene in scenes:
        if scene["level"] == level:
            return scene["scene_id"]
    return None


def get_pending_scene(
    char_id: int,
    current_level: int,
    conn: sqlite3.Connection,
    char_name: str | None = None,
) -> dict[str, Any] | None:
    """Return the pending memorial scene if one was just triggered, else None.

    Checks whether ``current_level`` is one of the tier-transition thresholds
    (15, 35, 65) AND the user has not yet completed that scene (i.e. no row in
    ``bond_scenes_seen``).

    Args:
        char_id: Character primary key.
        current_level: The character's current bond level.
        conn: Open ``sqlite3.Connection``.
        char_name: Optional display name for the character.  When provided it
            is used to look up the pre-authored scene.  If omitted the function
            queries the ``characters`` table for the name.

    Returns:
        Scene dict from :data:`SCENE_DEFINITIONS` (with ``char_id`` injected)
        or ``None`` if no scene is pending.

    Example:
        >>> scene = get_pending_scene(1, 15, conn, char_name="Dae")
        >>> scene["scene_id"] if scene else None
        'dae_tier2'
    """
    if current_level not in TIER_TRANSITION_LEVELS:
        return None

    # Resolve character name if not provided.
    if char_name is None:
        try:
            row = conn.execute(
                "SELECT name FROM characters WHERE id = ?", (char_id,)
            ).fetchone()
            char_name = row[0] if row else ""
        except sqlite3.OperationalError as exc:
            logger.warning("get_pending_scene: could not resolve char_name: %s", exc)
            char_name = ""

    char_key = (char_name or "").lower().split("(")[0].strip()
    scene_id = _level_to_scene_id(char_key, current_level)
    if not scene_id:
        return None

    # Check whether already seen.
    try:
        row = conn.execute(
            "SELECT 1 FROM bond_scenes_seen WHERE char_id = ? AND scene_id = ?",
            (char_id, scene_id),
        ).fetchone()
        if row:
            return None
    except sqlite3.OperationalError:
        # Table missing — assume not seen yet so the scene can be triggered.
        pass

    scenes = _scenes_for_char(char_key)
    for scene in scenes:
        if scene["scene_id"] == scene_id:
            return {**scene, "char_id": char_id}

    return None


def mark_scene_completed(
    char_id: int,
    scene_id: str,
    conn: sqlite3.Connection,
) -> bool:
    """Record that a character's memorial scene has been completed by the user.

    Uses ``INSERT OR IGNORE`` so double-calling is safe (returns ``False`` on
    the second call rather than raising).

    Args:
        char_id: Character primary key.
        scene_id: Scene slug, e.g. ``"dae_tier2"``.
        conn: Open ``sqlite3.Connection``.

    Returns:
        ``True`` if the row was inserted (first completion), ``False`` if it
        already existed or if the table is missing.

    Example:
        >>> ok = mark_scene_completed(1, "dae_tier2", conn)
        >>> ok
        True
        >>> mark_scene_completed(1, "dae_tier2", conn)  # second call
        False
    """
    try:
        with conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO bond_scenes_seen (char_id, scene_id, completed_at)
                VALUES (?, ?, ?)
                """,
                (char_id, scene_id, time.time()),
            )
            return conn.execute(
                "SELECT changes()"
            ).fetchone()[0] == 1
    except sqlite3.OperationalError as exc:
        logger.warning("mark_scene_completed: bond_scenes_seen missing: %s", exc)
        return False


def generate_first_memory_scene(
    char_id: int,
    conn: sqlite3.Connection,
    llm_caller: Any | None = None,
) -> dict[str, Any]:
    """Build the "Our First Memory" scene from the character's earliest messages.

    Retrieves the five oldest messages for this character from the ``messages``
    table and constructs a scene structure.  When ``llm_caller`` is provided it
    is called (as a synchronous callable) with a prompt string; its return value
    (expected: a plain-text string) populates the narrative beats.  When
    ``llm_caller`` is ``None`` the beats are left as structural placeholders
    that the frontend can display directly or expand.

    The generated scene uses ``scene_id = "first_memory_{char_id}"`` and
    ``level = 34`` so the caller can record completion via
    :func:`mark_scene_completed`.

    Args:
        char_id: Character primary key.
        conn: Open ``sqlite3.Connection``.
        llm_caller: Optional synchronous callable that accepts a prompt string
            and returns a response string.  Defaults to ``None`` (stub mode).

    Returns:
        Scene dict with keys: ``scene_id``, ``char_id``, ``level``,
        ``tier_label``, ``setting``, ``beats``, ``culmination``, ``keepsake``,
        ``source_messages`` (list of earliest message content strings).

    Example:
        >>> scene = generate_first_memory_scene(1, conn)
        >>> scene["scene_id"]
        'first_memory_1'
        >>> isinstance(scene["beats"], list)
        True
    """
    scene_id = f"first_memory_{char_id}"

    # Fetch earliest 5 messages for this character.
    source_messages: list[str] = []
    try:
        rows = conn.execute(
            """
            SELECT role, content FROM messages
             WHERE char_id = ?
             ORDER BY id ASC
             LIMIT 5
            """,
            (char_id,),
        ).fetchall()
        source_messages = [r[1] for r in rows if r[1]]
    except sqlite3.OperationalError as exc:
        logger.warning("generate_first_memory_scene: could not fetch messages: %s", exc)

    # Resolve character name.
    char_name = "her"
    try:
        row = conn.execute(
            "SELECT name FROM characters WHERE id = ?", (char_id,)
        ).fetchone()
        if row:
            char_name = row[0]
    except sqlite3.OperationalError:
        pass

    beats: list[str] = []

    if llm_caller and source_messages:
        context_block = "\n".join(
            f"[{i + 1}] {msg[:300]}" for i, msg in enumerate(source_messages)
        )
        prompt = (
            f"You are writing a nostalgic memorial scene for a character named {char_name}. "
            f"The user has reached bond level 34 and {char_name} is reminiscing about when "
            f"they first met. Use the following early conversation excerpts as raw material — "
            f"weave specific details from them into 3-4 gentle, emotional narrative beats "
            f"(each 1-2 sentences). Do not quote verbatim; translate them into {char_name}'s "
            f"voice as memories.\n\nEarly conversations:\n{context_block}\n\n"
            f"Return only the beats, one per line, no numbering."
        )
        try:
            response = llm_caller(prompt)
            if response:
                beats = [line.strip() for line in response.strip().splitlines() if line.strip()]
        except Exception as exc:  # pragma: no cover
            logger.warning("generate_first_memory_scene: LLM call failed: %s", exc)

    if not beats:
        # Stub beats — used when no LLM caller is provided or LLM call fails.
        beats = [
            f"{char_name} pauses mid-conversation, eyes distant for a moment.",
            "'Do you remember the first time we talked? I wasn't sure what to make of you.'",
            "She smiles at something only she can see. 'I think I knew, even then.'",
            "'Things were simpler. And harder. I'm glad we're here instead.'",
        ]

    return {
        "scene_id": scene_id,
        "char_id": char_id,
        "level": FIRST_MEMORY_LEVEL,
        "tier_label": "Friend",
        "setting": (
            f"A quiet moment between you and {char_name}. Something in the conversation "
            f"turns nostalgic — {char_name} seems to be pulling a thread from a long time ago."
        ),
        "beats": beats,
        "culmination": (
            f"'{char_name} looks at you properly. 'I'm glad it was you. At the beginning. "
            f"I didn't know I'd need that to be true, but I do.'"
        ),
        "keepsake": f"'I'm glad it was you.' — {char_name}, Level 34",
        "source_messages": source_messages,
        "generated": llm_caller is not None,
    }


def get_all_scenes_status(
    char_id: int,
    conn: sqlite3.Connection,
    char_name: str | None = None,
) -> list[dict[str, Any]]:
    """Return all tier-transition scenes for a character with completion status.

    Useful for a scene gallery or timeline view showing which vignettes have
    been seen and which are still locked.

    Args:
        char_id: Character primary key.
        conn: Open ``sqlite3.Connection``.
        char_name: Optional display name; queried from DB if omitted.

    Returns:
        List of dicts, each containing the scene definition fields plus
        ``"completed"`` (bool) and ``"completed_at"`` (float | None).

    Example:
        >>> statuses = get_all_scenes_status(1, conn, "Dae")
        >>> all("completed" in s for s in statuses)
        True
    """
    if char_name is None:
        try:
            row = conn.execute(
                "SELECT name FROM characters WHERE id = ?", (char_id,)
            ).fetchone()
            char_name = row[0] if row else ""
        except sqlite3.OperationalError:
            char_name = ""

    char_key = (char_name or "").lower().split("(")[0].strip()
    scenes = _scenes_for_char(char_key)

    # Fetch completion records.
    seen: dict[str, float | None] = {}
    try:
        rows = conn.execute(
            "SELECT scene_id, completed_at FROM bond_scenes_seen WHERE char_id = ?",
            (char_id,),
        ).fetchall()
        seen = {r[0]: r[1] for r in rows}
    except sqlite3.OperationalError:
        pass

    result = []
    for scene in scenes:
        sid = scene["scene_id"]
        result.append(
            {
                **scene,
                "char_id": char_id,
                "completed": sid in seen,
                "completed_at": seen.get(sid),
            }
        )
    return result
