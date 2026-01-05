# Session Management - Complete Guide

**Feature:** Conversation Session Management
**Status:** ✅ Implemented (v5.30)
**Module:** Database + API Endpoints
**Purpose:** Organize conversations into manageable sessions

---

## Overview

The Session Management system allows you to organize conversations into separate sessions, similar to chat tabs or conversation threads. Each session maintains its own message history, allowing you to have different conversations about different topics simultaneously.

**Key Features:**
- 📝 Multiple conversation sessions
- 💬 Independent message histories
- 🏷️ Custom session titles
- 🔄 Easy session switching
- 🗄️ Persistent storage
- 🗑️ Session deletion
- 📊 Message count tracking

---

## Architecture

### Database Schema (v3+)

**Sessions Table:**
```sql
CREATE TABLE sessions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT DEFAULT 'New Session',
  created_ts REAL DEFAULT (strftime('%s','now'))
);
```

**Messages Table:**
```sql
CREATE TABLE messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  ts REAL DEFAULT (strftime('%s','now')),
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

**Relationship:**
- One session → Many messages
- Deleting session deletes all messages (CASCADE)
- Messages belong to exactly one session

---

## API Endpoints

### GET /api/sessions

List all conversation sessions with message counts.

**Request:**
```bash
curl http://localhost:8000/api/sessions
```

**Response:**
```json
{
  "sessions": [
    {
      "id": 1,
      "title": "Project Planning",
      "created_ts": 1732425678.0,
      "message_count": 24
    },
    {
      "id": 2,
      "title": "Daily Chat",
      "created_ts": 1732425690.0,
      "message_count": 5
    },
    {
      "id": 3,
      "title": "Learning JavaScript",
      "created_ts": 1732425700.0,
      "message_count": 0
    }
  ]
}
```

**Fields:**
- `id` - Unique session identifier
- `title` - Session name (editable)
- `created_ts` - Unix timestamp of creation
- `message_count` - Number of messages in session

**Sorted:** Newest first (DESC by created_ts)

---

### POST /api/sessions

Create new conversation session.

**Request:**
```bash
curl -X POST http://localhost:8000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title":"Weekend Plans"}'
```

**Optional:** Title defaults to "New Session" if not provided.

**Response:**
```json
{
  "id": 4,
  "title": "Weekend Plans",
  "created_ts": 1732425710.0
}
```

**JavaScript:**
```javascript
async function createSession(title = 'New Session') {
  const response = await fetch('/api/sessions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({title})
  });
  return await response.json();
}
```

---

### PUT /api/sessions/{session_id}

Update session title.

**Request:**
```bash
curl -X PUT http://localhost:8000/api/sessions/4 \
  -H "Content-Type: application/json" \
  -d '{"title":"Sunday Plans (Updated)"}'
```

**Response:**
```json
{
  "ok": true
}
```

**Error (No title):**
```json
{
  "detail": "Title required"
}
```

**Use Cases:**
- Rename session based on conversation topic
- Add context/notes to title
- Organize sessions with prefixes ("Work: ...", "Personal: ...")

---

### DELETE /api/sessions/{session_id}

Delete session and all its messages (permanent).

**Request:**
```bash
curl -X DELETE http://localhost:8000/api/sessions/4
```

**Response:**
```json
{
  "ok": true
}
```

**⚠️ Warning:** This action is **permanent** and **cannot be undone**!

**What Gets Deleted:**
- Session record
- All messages in the session (CASCADE delete)
- No way to recover

**UI Recommendation:** Show confirmation dialog before deletion.

---

### GET /api/sessions/{session_id}/messages

Retrieve complete message history for a session.

**Request:**
```bash
curl http://localhost:8000/api/sessions/1/messages
```

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "role": "user",
      "text": "Hello! Can you help me plan my project?",
      "ts": 1732425678.0
    },
    {
      "id": 2,
      "role": "assistant",
      "text": "Of course! I'd be happy to help. What kind of project are you planning?",
      "ts": 1732425679.5
    },
    {
      "id": 3,
      "role": "user",
      "text": "A web application for task management.",
      "ts": 1732425690.0
    }
  ]
}
```

**Fields:**
- `id` - Unique message ID
- `role` - `"user"` or `"assistant"`
- `text` - Message content
- `ts` - Unix timestamp

**Sorted:** Oldest first (chronological order)

---

## Using Sessions in Chat

### Chat Endpoint with Session

**Endpoint:** `POST /api/chat?session_id={id}`

**Request:**
```bash
curl -X POST "http://localhost:8000/api/chat?session_id=1" \
  -H "Content-Type: application/json" \
  -d '{"text":"What did we discuss earlier?","speak":false}'
```

**Server Behavior:**
1. Saves user message to session 1
2. Retrieves last N messages from session 1 (context window)
3. Sends to LLM with history
4. Saves assistant response to session 1
5. Returns response

**Response:**
```json
{
  "ok": true,
  "reply": "Earlier we discussed your task management web application project. You mentioned wanting to build it, and I offered to help with planning.",
  "audio": null,
  "session_id": 1
}
```

**Context Window:**
Controlled by `config.memory.max_history` (default: 12 messages).

**Example:**
```json
{
  "memory": {
    "max_history": 20
  }
}
```

---

## Common Workflows

### Workflow 1: Start New Conversation

```javascript
// 1. Create new session
const session = await fetch('/api/sessions', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({title: 'Learning Python'})
}).then(r => r.json());

// 2. Start chatting
const response = await fetch(`/api/chat?session_id=${session.id}`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({text: 'How do I learn Python?', speak: false})
}).then(r => r.json());

console.log(response.reply);
```

---

### Workflow 2: Resume Previous Conversation

```javascript
// 1. List sessions
const sessions = await fetch('/api/sessions').then(r => r.json());

// 2. User selects session (e.g., ID 3)
const sessionId = 3;

// 3. Load message history (optional, for UI display)
const history = await fetch(`/api/sessions/${sessionId}/messages`)
  .then(r => r.json());

// 4. Display history in UI
history.messages.forEach(msg => {
  displayMessage(msg.role, msg.text);
});

// 5. Continue conversation
const response = await fetch(`/api/chat?session_id=${sessionId}`, {
  method: 'POST',
  body: JSON.stringify({text: 'Where were we?'})
}).then(r => r.json());
```

---

### Workflow 3: Session Sidebar UI

```javascript
// Load sessions for sidebar
async function loadSessionsSidebar() {
  const {sessions} = await fetch('/api/sessions').then(r => r.json());

  const sidebar = document.getElementById('sessionSidebar');
  sidebar.innerHTML = '';

  sessions.forEach(session => {
    const div = document.createElement('div');
    div.className = 'session-item';
    div.innerHTML = `
      <span class="session-title">${session.title}</span>
      <span class="session-count">(${session.message_count})</span>
    `;
    div.onclick = () => switchToSession(session.id);
    sidebar.appendChild(div);
  });
}

// Switch active session
function switchToSession(sessionId) {
  currentSessionId = sessionId;
  loadMessages(sessionId);
  // Update UI to show active session
}
```

---

### Workflow 4: Auto-Rename Session

Automatically rename session based on first message:

```javascript
async function sendFirstMessage(text) {
  // Create session
  const session = await fetch('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({title: 'New Session'})
  }).then(r => r.json());

  // Send message
  await fetch(`/api/chat?session_id=${session.id}`, {
    method: 'POST',
    body: JSON.stringify({text})
  });

  // Generate title from first message (truncate if long)
  const title = text.length > 30 ? text.substring(0, 30) + '...' : text;

  // Update session title
  await fetch(`/api/sessions/${session.id}`, {
    method: 'PUT',
    body: JSON.stringify({title})
  });
}
```

---

## Frontend Integration

### Session Sidebar (index_v2.html)

**HTML:**
```html
<div id="sessionSidebar">
  <h3>Sessions</h3>
  <button id="newSessionBtn">+ New Session</button>
  <div id="sessionList"></div>
</div>
```

**JavaScript:**
```javascript
let currentSessionId = 1;

// Create new session
document.getElementById('newSessionBtn').addEventListener('click', async () => {
  const title = prompt('Session title:', 'New Session');
  if (!title) return;

  const session = await fetch('/api/sessions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({title})
  }).then(r => r.json());

  currentSessionId = session.id;
  loadSessions();
  clearChatDisplay();
});

// Load and display sessions
async function loadSessions() {
  const {sessions} = await fetch('/api/sessions').then(r => r.json());

  const list = document.getElementById('sessionList');
  list.innerHTML = '';

  sessions.forEach(session => {
    const item = document.createElement('div');
    item.className = 'session-item' +
      (session.id === currentSessionId ? ' active' : '');
    item.innerHTML = `
      <div class="session-title">${session.title}</div>
      <div class="session-meta">${session.message_count} messages</div>
      <button class="delete-btn" onclick="deleteSession(${session.id})">🗑️</button>
    `;
    item.onclick = () => switchSession(session.id);
    list.appendChild(item);
  });
}

// Switch session
async function switchSession(sessionId) {
  currentSessionId = sessionId;
  loadSessions(); // Refresh UI

  // Load message history
  const {messages} = await fetch(`/api/sessions/${sessionId}/messages`)
    .then(r => r.json());

  clearChatDisplay();
  messages.forEach(msg => displayMessage(msg.role, msg.text));
}

// Delete session
async function deleteSession(sessionId) {
  if (!confirm('Delete this session? This cannot be undone!')) return;

  await fetch(`/api/sessions/${sessionId}`, {method: 'DELETE'});

  if (sessionId === currentSessionId) {
    currentSessionId = 1; // Switch to default
  }

  loadSessions();
}
```

---

## Best Practices

### Session Organization

**✅ DO:**
- Create separate sessions for different topics
- Rename sessions based on conversation content
- Delete old/unused sessions regularly
- Use descriptive titles

**Example Titles:**
- "Work: Project Alpha Planning"
- "Personal: Weekend Trip Ideas"
- "Learning: Python Basics"
- "Debug: API Error Investigation"

**❌ DON'T:**
- Keep all conversations in one session (loses context)
- Use vague titles ("Session 1", "Chat")
- Create sessions for single messages
- Delete sessions with important history

---

### Performance Optimization

**Context Window Size:**
```json
{
  "memory": {
    "max_history": 12  // Adjust based on needs
  }
}
```

**Guidelines:**
- Short conversations: 6-10 messages
- Normal conversations: 10-20 messages
- Long-term planning: 20-50 messages
- Very long contexts: May slow down LLM

**Trade-offs:**
- Larger context = Better memory, slower responses
- Smaller context = Faster responses, less memory

---

### Data Management

**Regular Cleanup:**
```bash
# List sessions with 0 messages (empty)
sqlite3 backend/storage/app.db << EOF
SELECT s.id, s.title, COUNT(m.id) as msg_count
FROM sessions s
LEFT JOIN messages m ON s.id = m.session_id
GROUP BY s.id
HAVING msg_count = 0;
EOF
```

**Archive Old Sessions:**
```bash
# Export session to JSON
sqlite3 backend/storage/app.db << EOF
.mode json
SELECT * FROM messages WHERE session_id = 5;
EOF > session_5_archive.json
```

---

## Advanced Use Cases

### 1. Session Templates

Create sessions from templates for common use cases:

```javascript
const TEMPLATES = {
  'coding': {
    title: 'Coding Help',
    firstMessage: 'I need help with programming.'
  },
  'brainstorm': {
    title: 'Brainstorming Session',
    firstMessage: 'Let\'s brainstorm some ideas.'
  },
  'learning': {
    title: 'Learning Session',
    firstMessage: 'I want to learn about something new.'
  }
};

async function createFromTemplate(templateName) {
  const template = TEMPLATES[templateName];
  const session = await createSession(template.title);
  await sendMessage(session.id, template.firstMessage);
  return session;
}
```

---

### 2. Session Search/Filter

```javascript
// Filter sessions by title
function filterSessions(sessions, query) {
  return sessions.filter(s =>
    s.title.toLowerCase().includes(query.toLowerCase())
  );
}

// Sort by message count
function sortByActivity(sessions) {
  return sessions.sort((a, b) => b.message_count - a.message_count);
}

// Get recent sessions
function getRecentSessions(sessions, limit = 5) {
  return sessions.slice(0, limit);
}
```

---

### 3. Session Sharing/Export

```javascript
async function exportSession(sessionId) {
  const {messages} = await fetch(`/api/sessions/${sessionId}/messages`)
    .then(r => r.json());

  const text = messages.map(m =>
    `${m.role.toUpperCase()}: ${m.text}`
  ).join('\n\n');

  // Download as text file
  const blob = new Blob([text], {type: 'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `session_${sessionId}.txt`;
  a.click();
}
```

---

### 4. Session Analytics

```javascript
async function getSessionStats(sessionId) {
  const {messages} = await fetch(`/api/sessions/${sessionId}/messages`)
    .then(r => r.json());

  return {
    total: messages.length,
    userMessages: messages.filter(m => m.role === 'user').length,
    assistantMessages: messages.filter(m => m.role === 'assistant').length,
    avgLength: messages.reduce((sum, m) => sum + m.text.length, 0) / messages.length,
    duration: messages[messages.length - 1].ts - messages[0].ts
  };
}
```

---

## Database Queries

### Useful Queries

**List all sessions with details:**
```sql
SELECT
  s.id,
  s.title,
  s.created_ts,
  COUNT(m.id) as message_count,
  MAX(m.ts) as last_message_ts
FROM sessions s
LEFT JOIN messages m ON s.id = m.session_id
GROUP BY s.id
ORDER BY s.created_ts DESC;
```

**Find sessions by keyword:**
```sql
SELECT DISTINCT s.id, s.title
FROM sessions s
JOIN messages m ON s.id = m.session_id
WHERE m.text LIKE '%keyword%';
```

**Session message statistics:**
```sql
SELECT
  s.title,
  COUNT(CASE WHEN m.role='user' THEN 1 END) as user_msgs,
  COUNT(CASE WHEN m.role='assistant' THEN 1 END) as assistant_msgs,
  AVG(LENGTH(m.text)) as avg_length
FROM sessions s
JOIN messages m ON s.id = m.session_id
WHERE s.id = 1
GROUP BY s.id;
```

**Delete old empty sessions:**
```sql
DELETE FROM sessions
WHERE id NOT IN (SELECT DISTINCT session_id FROM messages)
AND created_ts < strftime('%s', 'now', '-30 days');
```

---

## Troubleshooting

### Issue: Messages appearing in wrong session

**Cause:** Using incorrect `session_id` in chat request
**Solution:**
```javascript
// Always use correct session ID
fetch(`/api/chat?session_id=${currentSessionId}`, ...)
```

### Issue: Session list not updating after creation

**Cause:** Frontend not reloading session list
**Solution:**
```javascript
// Reload sessions after creating/deleting
await createSession(title);
await loadSessions(); // Refresh UI
```

### Issue: Very slow LLM responses

**Cause:** Too many messages in context window
**Solution:**
1. Reduce `max_history` in config
2. Or start new session for new topic

### Issue: Deleted session still appears in UI

**Cause:** Frontend cache not cleared
**Solution:**
```javascript
// Force reload after deletion
await deleteSession(id);
location.reload(); // Or manually update UI
```

---

## Future Enhancements

**Planned:**
- [ ] Session folders/categories
- [ ] Session tags/labels
- [ ] Full-text search across sessions
- [ ] Session templates
- [ ] Automatic session archiving
- [ ] Session sharing/collaboration
- [ ] Import/export sessions
- [ ] Session branching (fork conversation)
- [ ] Session merging
- [ ] Session analytics dashboard

---

## Related Documentation

- **Chat Integration:** `docs/features/FEATURE_LLM.md`
- **API Reference:** `docs/api/API_REFERENCE.md` (Session section)
- **Database Schema:** `backend/db/schema_v3.sql`
- **Character System:** `docs/features/FEATURE_CHARACTERS.md`
- **Frontend UI:** `frontend/index_v2.html`

---

## Quick Reference

**Files:**
- `backend/db/schema_v3.sql` - Session & message tables
- `backend/server.py:156-234` - Session endpoints
- `backend/storage/app.db` - Session data
- `frontend/index_v2.html` - Session sidebar UI

**Endpoints:**
- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create new session
- `PUT /api/sessions/{id}` - Update title
- `DELETE /api/sessions/{id}` - Delete session
- `GET /api/sessions/{id}/messages` - Get history
- `POST /api/chat?session_id={id}` - Chat in session

**Database:**
```sql
-- List sessions
SELECT * FROM sessions ORDER BY created_ts DESC;

-- Get session messages
SELECT * FROM messages WHERE session_id = 1 ORDER BY ts ASC;

-- Count messages per session
SELECT session_id, COUNT(*) FROM messages GROUP BY session_id;
```

**Config:**
```json
{
  "memory": {
    "max_history": 12  // Messages in context window
  }
}
```

---

**Last Updated:** 2025-11-25
**Version:** v5.30
**Status:** Production Ready ✅
