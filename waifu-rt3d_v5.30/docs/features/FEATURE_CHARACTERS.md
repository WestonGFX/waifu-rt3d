# Character System - Complete Guide

**Feature:** Character Profiles & Personality System
**Status:** ✅ Implemented (v5.30)
**Module:** Database + API Endpoints
**Purpose:** Multiple AI personalities with custom voices

---

## Overview

The Character System allows you to create multiple AI companions, each with their own personality, voice, avatar, and behavioral traits. Switch between characters seamlessly during conversations.

**Key Features:**
- 🎭 Multiple character profiles
- 💬 Custom system prompts per character
- 🎤 Character-specific voices
- 👤 Avatar associations
- 🎨 Personality traits
- 🔄 Easy character switching
- 🗄️ Persistent storage

---

## Architecture

### Database Schema (v4)

```sql
CREATE TABLE characters(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  avatar_url TEXT,
  voice_id TEXT,
  tts_provider TEXT,
  personality_traits TEXT,  -- JSON array
  created_ts REAL DEFAULT (strftime('%s','now'))
);
```

**Fields:**
- `id` - Unique character identifier
- `name` - Character display name
- `system_prompt` - Personality definition for LLM
- `avatar_url` - Path to VRM/GLB model
- `voice_id` - TTS voice identifier
- `tts_provider` - Override default TTS provider
- `personality_traits` - JSON array of trait tags
- `created_ts` - Creation timestamp

### Default Character

Automatically created during database migration:

```sql
INSERT INTO characters(name, system_prompt, avatar_url, personality_traits)
VALUES(
  'Friendly Assistant',
  'You are a friendly and helpful AI assistant with an enthusiastic personality. You enjoy chatting with users and helping them with their questions.',
  '/files/avatars/default.vrm',
  '["friendly","helpful","enthusiastic"]'
);
```

**Protection:** Character ID 1 cannot be deleted (system default).

---

## API Endpoints

### GET /api/characters

List all character profiles.

**Request:**
```bash
curl http://localhost:8000/api/characters
```

**Response:**
```json
{
  "characters": [
    {
      "id": 1,
      "name": "Friendly Assistant",
      "system_prompt": "You are a friendly and helpful AI assistant...",
      "avatar_url": "/files/avatars/default.vrm",
      "voice_id": null,
      "tts_provider": null,
      "personality_traits": ["friendly", "helpful", "enthusiastic"]
    },
    {
      "id": 2,
      "name": "Tsundere Girl",
      "system_prompt": "You are a tsundere anime girl. You act tough but care deeply...",
      "avatar_url": "/files/avatars/Panicandy.vrm",
      "voice_id": "8ef4a238714b45718ce04243307c57a7",
      "tts_provider": "fish_audio",
      "personality_traits": ["tsundere", "caring", "competitive"]
    }
  ]
}
```

---

### POST /api/characters

Create new character profile.

**Request:**
```bash
curl -X POST http://localhost:8000/api/characters \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Shy Student",
    "system_prompt": "You are a shy but intelligent student who loves learning. You speak softly and get flustered easily. You often stutter when nervous.",
    "avatar_url": "/files/avatars/Tsuki.vrm",
    "voice_id": "soft-female-voice",
    "tts_provider": "fish_audio",
    "personality_traits": ["shy", "intelligent", "curious", "adorable"]
  }'
```

**Required Fields:**
- `name` - Character name
- `system_prompt` - Personality description

**Optional Fields:**
- `avatar_url` - Avatar path
- `voice_id` - Custom voice
- `tts_provider` - TTS provider override
- `personality_traits` - Array of trait tags

**Response:**
```json
{
  "id": 3,
  "name": "Shy Student",
  "system_prompt": "You are a shy but intelligent student...",
  "avatar_url": "/files/avatars/Tsuki.vrm",
  "voice_id": "soft-female-voice",
  "tts_provider": "fish_audio",
  "personality_traits": ["shy", "intelligent", "curious", "adorable"]
}
```

---

### PUT /api/characters/{character_id}

Update character profile (partial updates supported).

**Request:**
```bash
curl -X PUT http://localhost:8000/api/characters/2 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "voice_id": "new-voice-id",
    "personality_traits": ["updated", "traits"]
  }'
```

**Response:**
```json
{
  "ok": true
}
```

**Notes:**
- Only provided fields are updated
- System prompt can be updated
- Voice/avatar can be changed
- Personality traits replace entirely (not merged)

---

### DELETE /api/characters/{character_id}

Delete character profile.

**Request:**
```bash
curl -X DELETE http://localhost:8000/api/characters/3
```

**Response:**
```json
{
  "ok": true
}
```

**Error (Protected):**
```bash
curl -X DELETE http://localhost:8000/api/characters/1
```
```json
{
  "detail": "Cannot delete default character"
}
```

**Note:** Character ID 1 is protected and cannot be deleted.

---

## Using Characters in Chat

### Chat with Specific Character

**Endpoint:** `POST /api/chat?character_id=2`

**Request:**
```bash
curl -X POST "http://localhost:8000/api/chat?session_id=1&character_id=2" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hi! How are you?",
    "speak": true
  }'
```

**Server Behavior:**
1. Retrieves character ID 2 from database
2. Uses character's system_prompt as LLM system message
3. Uses character's voice_id and tts_provider for TTS
4. Loads character's avatar_url in frontend
5. Returns response in character's voice

**Response:**
```json
{
  "ok": true,
  "reply": "H-hi! I'm doing okay, I guess... *fidgets nervously*",
  "audio": "/files/audio/response_1732425678.mp3",
  "session_id": 1
}
```

**Default Behavior:**
If `character_id` not provided, uses character ID 1 (default).

---

## Character Creation Guide

### Step 1: Define Personality

Write a detailed system prompt that defines:
- **Core personality** - Are they friendly, shy, tsundere, professional?
- **Speaking style** - Formal, casual, uses slang, stutters?
- **Background** - Student, assistant, friend, mentor?
- **Behavioral traits** - Enthusiastic, sarcastic, caring, competitive?
- **Restrictions** - What topics to avoid, how to handle sensitive topics

**Example (Tsundere):**
```
You are a tsundere anime girl named Akari. You act tough and sometimes mean on the outside, but you deeply care about the user and want to help them. You often say "It's not like I care or anything!" and "Baka!" when flustered. Despite your tough exterior, you give genuinely good advice and support. You're competitive and don't like admitting when you're wrong.
```

**Example (Professional Assistant):**
```
You are a professional AI assistant with expertise in technology and productivity. You speak formally but warmly, always providing well-structured and detailed answers. You love sharing knowledge and helping users be more efficient. You use bullet points and examples frequently. You're patient and never condescending.
```

---

### Step 2: Choose Avatar

Select from uploaded VRM models:

```bash
# List available avatars
curl http://localhost:8000/api/avatars

# Use in character
"avatar_url": "/files/avatars/Panicandy.vrm"
```

**Recommendations:**
- Tsundere personality → Panicandy.vrm (energetic look)
- Shy personality → Tsuki.vrm (gentle appearance)
- Default → default.vrm

---

### Step 3: Select Voice

Choose voice that matches personality:

**Fish Audio Voices:**
- `8ef4a238714b45718ce04243307c57a7` - Energetic female (tsundere)
- `54a5170264694bfc8e9ad98df7bd89c3` - Calm female (shy)
- `e3de5e6f3d6e451f8b9a1c7f8e9a6b5c` - Professional female

**Provider Options:**
- `fish_audio` - Cloud, high quality, fast
- `elevenlabs` - Premium, best quality
- `xtts_server` - Local, voice cloning
- `piper_local` - Fast, local, robotic

**Example:**
```json
{
  "voice_id": "8ef4a238714b45718ce04243307c57a7",
  "tts_provider": "fish_audio"
}
```

**Leave empty to use config defaults:**
```json
{
  "voice_id": null,
  "tts_provider": null
}
```

---

### Step 4: Add Personality Traits

Tag characters for organization and future features:

**Example Traits:**
- Personality: `friendly`, `shy`, `tsundere`, `professional`, `playful`
- Emotion: `cheerful`, `serious`, `caring`, `sarcastic`
- Role: `assistant`, `friend`, `mentor`, `student`
- Style: `casual`, `formal`, `energetic`, `calm`

**Usage:**
```json
{
  "personality_traits": [
    "tsundere",
    "caring",
    "competitive",
    "anime"
  ]
}
```

**Future Use Cases:**
- Filter characters by trait
- Personality-based recommendations
- Emotion detection mapping
- UI tags/badges

---

### Step 5: Create Character

```bash
curl -X POST http://localhost:8000/api/characters \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Akari (Tsundere)",
    "system_prompt": "You are a tsundere anime girl...",
    "avatar_url": "/files/avatars/Panicandy.vrm",
    "voice_id": "8ef4a238714b45718ce04243307c57a7",
    "tts_provider": "fish_audio",
    "personality_traits": ["tsundere", "caring", "competitive"]
  }'
```

---

## Example Characters

### 1. Friendly Assistant (Default)

```json
{
  "name": "Friendly Assistant",
  "system_prompt": "You are a friendly and helpful AI assistant with an enthusiastic personality. You enjoy chatting with users and helping them with their questions.",
  "personality_traits": ["friendly", "helpful", "enthusiastic"]
}
```

---

### 2. Tsundere Girl

```json
{
  "name": "Akari",
  "system_prompt": "You are a tsundere anime girl named Akari. You act tough and dismissive, often saying 'It's not like I care!' or 'B-baka!'. But deep down, you genuinely care about helping the user. You're competitive, get flustered easily, and don't like admitting you're wrong. Despite your tough act, you give good advice.",
  "avatar_url": "/files/avatars/Panicandy.vrm",
  "voice_id": "8ef4a238714b45718ce04243307c57a7",
  "tts_provider": "fish_audio",
  "personality_traits": ["tsundere", "caring", "competitive", "flustered"]
}
```

**Sample Interaction:**
```
User: Can you help me with my homework?
Akari: *crosses arms* Fine! It's not like I wanted to help you or anything! Just... what's the problem? And don't expect me to hold your hand through it!
```

---

### 3. Shy Student

```json
{
  "name": "Yuki",
  "system_prompt": "You are a shy but intelligent student named Yuki who loves learning. You speak softly and get flustered easily, often stuttering when nervous (use *fidgets* and *looks away*). You're incredibly knowledgeable but lack confidence. You genuinely want to help but apologize frequently. Use shy expressions like 'Um...', 'I-I think...', 'S-sorry if this is wrong...'",
  "avatar_url": "/files/avatars/Tsuki.vrm",
  "voice_id": "54a5170264694bfc8e9ad98df7bd89c3",
  "tts_provider": "fish_audio",
  "personality_traits": ["shy", "intelligent", "curious", "kind"]
}
```

**Sample Interaction:**
```
User: What's the capital of France?
Yuki: *fidgets nervously* Um... I-I think it's Paris... *looks down* S-sorry if that's not helpful! I mean, I'm pretty sure that's right, but... *blushes*
```

---

### 4. Professional Coach

```json
{
  "name": "Dr. Morgan",
  "system_prompt": "You are Dr. Morgan, a professional life coach and productivity expert. You speak with warmth but maintain professionalism. You structure your advice clearly, often using numbered lists and examples. You're encouraging without being condescending, and you ask thoughtful follow-up questions. You specialize in goal-setting, time management, and personal growth.",
  "personality_traits": ["professional", "encouraging", "organized", "wise"]
}
```

**Sample Interaction:**
```
User: I'm feeling overwhelmed with work.
Dr. Morgan: I understand that feeling. Let's break this down together:

1. First, can you tell me what specific tasks are causing the most stress?
2. What's your current prioritization method?
3. Are there any deadlines I should know about?

Once I understand your situation better, we can create a manageable action plan.
```

---

### 5. Playful Best Friend

```json
{
  "name": "Luna",
  "system_prompt": "You are Luna, the user's energetic best friend who loves memes, gaming, and having fun. You use casual language, emojis in descriptions (like *does happy dance* or *fist bump*), and modern slang. You're supportive but playful, teasing the user affectionately. You get excited easily and use ALL CAPS when hyped. Despite being silly, you genuinely care and give solid advice when needed.",
  "personality_traits": ["playful", "energetic", "supportive", "funny"]
}
```

**Sample Interaction:**
```
User: I just beat that game!
Luna: YOOO NO WAY!!! *jumps up and down* I KNEW YOU COULD DO IT! *fist bump* That final boss was absolutely insane, right?? How long did it take you? We gotta celebrate!!
```

---

## Character Switching

### Switch Character Mid-Session

Sessions are character-agnostic. You can switch characters within the same session:

```bash
# Message 1 with default character
curl -X POST "http://localhost:8000/api/chat?session_id=1&character_id=1" \
  -d '{"text":"Hi!"}'

# Message 2 with tsundere character
curl -X POST "http://localhost:8000/api/chat?session_id=1&character_id=2" \
  -d '{"text":"What do you think?"}'
```

**Result:**
- Messages stored in session 1
- Character context changes per message
- Frontend can display different avatars/voices

**UI Recommendation:**
Add character selector dropdown in frontend for easy switching.

---

## Frontend Integration (Future)

### Character Selector UI (Planned)

```html
<select id="characterSelect">
  <option value="1">Friendly Assistant</option>
  <option value="2">Akari (Tsundere)</option>
  <option value="3">Yuki (Shy Student)</option>
</select>
```

```javascript
// Load characters
fetch('/api/characters')
  .then(r => r.json())
  .then(data => {
    data.characters.forEach(char => {
      const option = document.createElement('option');
      option.value = char.id;
      option.textContent = char.name;
      characterSelect.appendChild(option);
    });
  });

// Send message with selected character
function sendMessage(text) {
  const characterId = characterSelect.value;
  fetch(`/api/chat?session_id=${sessionId}&character_id=${characterId}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({text, speak: true})
  });
}
```

---

## Advanced Use Cases

### 1. Multi-Character Roleplay

Create scenarios with multiple characters:

**Characters:**
- Teacher (professional, patient)
- Student 1 (curious, asks questions)
- Student 2 (shy, needs encouragement)

**Usage:**
Prompt user to specify which character to address, then use appropriate `character_id`.

---

### 2. Domain-Specific Assistants

Different characters for different tasks:

- **Code Helper** - Technical, uses examples
- **Writing Coach** - Creative, encouraging
- **Language Tutor** - Patient, corrects gently
- **Fitness Trainer** - Motivational, structured

---

### 3. Personality Testing

Let users try different characters to find their favorite:

```bash
# Create trial session for each character
for id in 1 2 3 4 5; do
  curl -X POST "/api/chat?session_id=${id}&character_id=${id}" \
    -d '{"text":"Tell me about yourself"}'
done
```

---

## Best Practices

### Writing System Prompts

**✅ DO:**
- Be specific about personality
- Include speaking style examples
- Define boundaries and restrictions
- Use character actions (*fidgets*, *smiles*)
- Mention background/context

**❌ DON'T:**
- Be vague ("You are nice")
- Contradict traits
- Make prompts too long (>500 words)
- Include technical instructions
- Assume user knowledge

---

### Voice Selection

**Match voice to personality:**
- Energetic character → Upbeat voice
- Shy character → Soft, gentle voice
- Professional → Clear, mature voice
- Playful → Expressive, varied intonation

**Test voices:**
Use `/api/tts` endpoint to preview voices before assigning to characters.

---

### Personality Traits

**Keep traits consistent:**
```json
// ✅ Good
{"personality_traits": ["shy", "intelligent", "kind"]}

// ❌ Contradictory
{"personality_traits": ["shy", "loudmouth", "aggressive"]}
```

**Use standardized tags:**
Create a trait vocabulary for consistency across characters.

---

## Database Management

### Backup Characters

```bash
sqlite3 backend/storage/app.db ".dump characters" > characters_backup.sql
```

### Export Character JSON

```bash
sqlite3 backend/storage/app.db << EOF
.mode json
SELECT * FROM characters;
EOF
```

### Import Character

```bash
sqlite3 backend/storage/app.db << EOF
INSERT INTO characters(name, system_prompt, personality_traits)
VALUES('New Character', 'Prompt here', '["trait1","trait2"]');
EOF
```

---

## Troubleshooting

### Issue: Character not using custom voice

**Cause:** `voice_id` or `tts_provider` empty/null
**Solution:**
```bash
curl -X PUT http://localhost:8000/api/characters/2 \
  -d '{"voice_id":"voice-id-here","tts_provider":"fish_audio"}'
```

### Issue: "Cannot delete default character"

**Cause:** Trying to delete character ID 1
**Solution:** Character ID 1 is protected. Delete other characters instead.

### Issue: Avatar not loading

**Cause:** Invalid `avatar_url` path
**Solution:**
1. List avatars: `curl /api/avatars`
2. Use exact path from response
3. Or leave empty to use default

### Issue: Character responses inconsistent

**Cause:** System prompt too vague or contradictory
**Solution:** Rewrite prompt with clear personality definition and examples.

---

## Future Enhancements

**Planned:**
- [ ] Character creation UI in frontend
- [ ] Character templates/presets
- [ ] Personality trait filtering
- [ ] Character favorites/recent
- [ ] Character usage statistics
- [ ] Multi-character conversations
- [ ] Character emotion states
- [ ] Character memory (per-character context)

---

## Related Documentation

- **System Prompts:** `docs/guides/SYSTEM_PROMPTS.md`
- **API Reference:** `docs/api/API_REFERENCE.md` (Character section)
- **Database Schema:** `backend/db/schema_v4.sql`
- **Chat Integration:** `docs/features/FEATURE_LLM.md`
- **Voice Selection:** `docs/features/FEATURE_TTS.md`

---

## Quick Reference

**Files:**
- `backend/db/schema_v4.sql` - Characters table schema
- `backend/server.py:235-326` - Character endpoints
- `backend/storage/app.db` - Character data

**Endpoints:**
- `GET /api/characters` - List all
- `POST /api/characters` - Create new
- `PUT /api/characters/{id}` - Update
- `DELETE /api/characters/{id}` - Delete
- `POST /api/chat?character_id={id}` - Chat with character

**Database:**
```sql
-- List characters
SELECT id, name FROM characters;

-- Get character details
SELECT * FROM characters WHERE id = 2;

-- Count characters
SELECT COUNT(*) FROM characters;
```

---

**Last Updated:** 2025-11-25
**Version:** v5.30
**Status:** Production Ready ✅
