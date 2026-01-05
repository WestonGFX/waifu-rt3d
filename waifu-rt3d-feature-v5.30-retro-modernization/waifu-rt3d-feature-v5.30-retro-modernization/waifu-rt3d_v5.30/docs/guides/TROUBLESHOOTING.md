# Troubleshooting Guide

**Version:** v5.30
**Last Updated:** 2025-11-25

---

## Table of Contents

1. [Server Issues](#server-issues)
2. [LLM/Chat Issues](#llmchat-issues)
3. [TTS/Voice Issues](#ttsvoice-issues)
4. [ASR/Microphone Issues](#asrmicrophone-issues)
5. [Database Issues](#database-issues)
6. [Frontend/UI Issues](#frontendui-issues)
7. [Configuration Issues](#configuration-issues)
8. [Performance Issues](#performance-issues)
9. [Installation Issues](#installation-issues)
10. [Advanced Debugging](#advanced-debugging)

---

## Server Issues

### Server won't start

**Symptom:** `python3 -m uvicorn backend.server:app --reload` fails

**Common Causes & Solutions:**

#### 1. Module not found
```
ModuleNotFoundError: No module named 'fastapi'
```
**Solution:**
```bash
pip install fastapi uvicorn python-multipart requests
# Or use requirements.txt
pip install -r requirements.txt
```

#### 2. Port already in use
```
Error: [Errno 48] Address already in use
```
**Solution:**
```bash
# Find process using port 8000
lsof -ti:8000

# Kill the process
kill -9 $(lsof -ti:8000)

# Or use different port
python3 -m uvicorn backend.server:app --port 8001
```

#### 3. Wrong directory
```
ModuleNotFoundError: No module named 'backend'
```
**Solution:**
```bash
# Must run from project root
cd /path/to/waifu-rt3d_v5.29_full
python3 -m uvicorn backend.server:app --reload
```

#### 4. Syntax errors in code
```
SyntaxError: invalid syntax
```
**Solution:**
```bash
# Check syntax
python3 -m py_compile backend/server.py

# Look for common issues:
# - Missing quotes
# - Incorrect indentation
# - Invalid escape sequences
```

---

### Server starts but crashes immediately

**Check the logs:**
```bash
# Run without --reload to see full error
python3 -m uvicorn backend.server:app
```

**Common Causes:**

#### Database file locked
```
sqlite3.OperationalError: database is locked
```
**Solution:**
```bash
# Close other processes using database
lsof backend/storage/app.db

# If stuck, restart system or:
rm backend/storage/app.db-journal
```

#### Missing storage directories
```
FileNotFoundError: backend/storage/
```
**Solution:**
```bash
mkdir -p backend/storage/audio
mkdir -p backend/storage/avatars
```

---

### Server accessible locally but not from other devices

**Solution:**
```bash
# Use 0.0.0.0 to listen on all interfaces
python3 -m uvicorn backend.server:app --host 0.0.0.0 --port 8000
```

**Firewall Check:**
```bash
# macOS: System Preferences > Security & Privacy > Firewall
# Linux: sudo ufw allow 8000
# Windows: Windows Defender Firewall > Allow an app
```

---

## LLM/Chat Issues

### "LLM probe: Connection refused"

**Symptom:** Health check shows LM Studio not reachable

**Solution:**

1. **Check if LM Studio is running:**
   - Open LM Studio application
   - Load a model (e.g., Mistral 7B)
   - Start local server (button in LM Studio interface)

2. **Verify endpoint:**
   ```bash
   curl http://127.0.0.1:1234/v1/models
   ```
   Should return JSON with model list.

3. **Check config:**
   ```json
   {
     "llm": {
       "provider": "lmstudio",
       "endpoint": "http://127.0.0.1:1234/v1",
       "api_key": "lm-studio"
     }
   }
   ```

4. **Check firewall:**
   - Allow port 1234
   - Or use different port in LM Studio settings

---

### LLM responses are very slow

**Causes & Solutions:**

#### 1. Large model on CPU
**Symptom:** 30+ seconds per response

**Solution:**
- Use smaller model (7B instead of 13B/70B)
- Enable GPU acceleration in LM Studio settings
- Reduce context window:
  ```json
  {"memory": {"max_history": 6}}
  ```

#### 2. Long conversation history
**Symptom:** Responses get slower over time

**Solution:**
```json
{
  "memory": {
    "max_history": 10  // Reduce from 12 to 10 or less
  }
}
```

#### 3. Model not loaded
**Check LM Studio:**
- Model should show "Loaded" status
- Click reload if needed

---

### Empty or nonsensical responses

**Common Causes:**

#### 1. Model incompatible
**Solution:** Use models designed for chat:
- ✅ `mistral-7b-instruct`
- ✅ `llama-2-13b-chat`
- ❌ `mistral-7b-base` (not trained for chat)

#### 2. Wrong API format
**Check:** Ensure using OpenAI-compatible models in LM Studio

#### 3. Context window exceeded
**Solution:** Start new session or reduce `max_history`

---

### "Adapter error: timeout"

**Solution:**
```python
# Increase timeout in adapter
# backend/llm/adapters/lmstudio.py
response = requests.post(..., timeout=60)  # Increase from 30
```

---

## TTS/Voice Issues

### No voice output (chat works but no audio)

**Checklist:**

1. **Check `speak` parameter:**
   ```json
   {"text": "Hello", "speak": true}  // Must be true
   ```

2. **Verify TTS configuration:**
   ```bash
   curl http://localhost:8000/api/config | grep -A 10 '"tts"'
   ```

3. **Check health:**
   ```bash
   curl http://localhost:8000/api/healthcheck
   # Look for "ttsConfigured": true
   ```

4. **Test TTS endpoint:**
   ```bash
   curl -X POST http://localhost:8000/api/tts \
     -H "Content-Type: application/json" \
     -d '{"text":"Hello world"}'
   ```

---

### "TTS failed: Connection refused"

**Symptom:** Using `xtts_server` or `piper_local` but not working

**Solution:**

#### For XTTS:
```bash
# Start XTTS server
cd TTS
python -m TTS.server.server

# Check if running
curl http://127.0.0.1:5002/
```

#### For Piper:
```bash
# Start Piper server
./piper --model en_US-lessac-medium --port 5000

# Check if running
curl http://127.0.0.1:5000/
```

#### For Fish Audio / ElevenLabs:
- Check API key is valid
- Verify internet connection
- Check API quota/credits

---

### "Invalid voice_id"

**Solution:**

#### Fish Audio:
```bash
# Get valid voice IDs from https://fish.audio/voices
# Or use default: 8ef4a238714b45718ce04243307c57a7
```

#### ElevenLabs:
```bash
# List voices
curl https://api.elevenlabs.io/v1/voices \
  -H "xi-api-key: YOUR_KEY"
```

---

### Robotic/poor quality voice

**Solutions:**

1. **Switch provider:**
   ```json
   {
     "tts": {
       "provider": "fish_audio"  // Or "elevenlabs"
     }
   }
   ```

2. **Increase sample rate:**
   ```json
   {
     "tts": {
       "sample_rate": 44100  // Higher quality
     }
   }
   ```

3. **Use better model:**
   - Piper: Use `medium` or `high` quality models
   - XTTS: Ensure using v2 models

---

## ASR/Microphone Issues

### "Microphone permission denied"

**Solution:**

**Chrome/Edge:**
1. Click lock icon in address bar
2. Allow microphone
3. Refresh page

**Safari:**
1. Safari > Settings > Websites > Microphone
2. Allow for localhost

**Firefox:**
1. about:preferences#privacy
2. Permissions > Microphone > Allow

---

### "Speech recognition not supported"

**Solution:**

1. **Use supported browser:**
   - ✅ Chrome/Edge (best)
   - ✅ Safari (good)
   - ⚠️ Firefox (limited)

2. **Or enable backend ASR:**
   ```json
   {
     "asr": {
       "enabled": true,
       "provider": "whisper_api",
       "api_key": "sk-..."
     }
   }
   ```

---

### "ASR not enabled in configuration"

**Solution:**
```json
{
  "asr": {
    "enabled": true,
    "provider": "whisper_api"
  }
}
```

Restart server after changing config.

---

### Poor transcription accuracy

**Solutions:**

1. **Use Whisper API:**
   ```json
   {"asr": {"provider": "whisper_api"}}
   ```

2. **Reduce background noise:**
   - Use headset microphone
   - Close doors/windows
   - Mute system sounds

3. **Specify language:**
   ```json
   {"asr": {"language": "en"}}
   ```

4. **Speak clearly:**
   - Not too fast
   - Clear pronunciation
   - Avoid mumbling

---

## Database Issues

### "No such table: characters"

**Symptom:** v5.30 endpoints failing

**Cause:** Database not migrated to schema v4

**Solution:**
```bash
# Run preflight to migrate
python3 -m backend.preflight

# Should see: "✅ Database upgraded to schema v4"
```

**Manual Migration:**
```bash
sqlite3 backend/storage/app.db < backend/db/schema_v4.sql
```

---

### "Database is locked"

**Causes & Solutions:**

#### 1. Multiple processes accessing database
**Solution:**
```bash
# Find processes
lsof backend/storage/app.db

# Kill stuck processes
kill -9 <PID>
```

#### 2. Interrupted transaction
**Solution:**
```bash
# Remove journal file
rm backend/storage/app.db-journal

# Restart server
```

---

### Database corruption

**Symptoms:**
- Random errors
- Missing data
- Crashes on query

**Solution:**

1. **Check integrity:**
   ```bash
   sqlite3 backend/storage/app.db "PRAGMA integrity_check;"
   ```

2. **If corrupted, restore from backup:**
   ```bash
   cp backend/storage/app.db backend/storage/app.db.corrupted
   cp backend/storage/app.db.backup backend/storage/app.db
   ```

3. **If no backup, try recovery:**
   ```bash
   sqlite3 backend/storage/app.db ".recover" | sqlite3 recovered.db
   cp recovered.db backend/storage/app.db
   ```

---

## Frontend/UI Issues

### Page won't load / blank screen

**Check browser console:** `F12` → Console tab

**Common Errors:**

#### 1. CORS error
```
Access-Control-Allow-Origin
```
**Solution:** Frontend must be served from same origin as backend.

#### 2. JavaScript error
```
Uncaught ReferenceError: THREE is not defined
```
**Solution:** Check JavaScript library files exist:
```bash
ls -la frontend/lib/
# Should see: three.min.js, GLTFLoader.js, etc.
```

#### 3. Failed to fetch
```
Failed to fetch http://localhost:8000/api/...
```
**Solution:**
- Ensure backend server is running
- Check port number matches
- Verify no firewall blocking

---

### VRM model won't load

**Check console for errors:**

#### 1. File not found
```
GET /files/avatars/model.vrm 404
```
**Solution:**
```bash
ls -la vrm/
# Upload model via /api/avatars/upload
```

#### 2. Invalid VRM file
```
Error parsing VRM
```
**Solution:**
- Ensure file is valid VRM format
- Try different model
- Check file not corrupted

#### 3. Three.js library missing
**Solution:**
```bash
# Check libraries exist
ls frontend/lib/three.min.js
ls frontend/lib/GLTFLoader.js
```

---

### Audio won't play

**Checklist:**

1. **Check audio file exists:**
   ```bash
   ls backend/storage/audio/
   ```

2. **Check file permissions:**
   ```bash
   chmod 644 backend/storage/audio/*.mp3
   ```

3. **Check browser can play format:**
   - MP3 supported in all browsers
   - WAV supported in all browsers
   - OGG may have issues

4. **Check audio URL:**
   ```javascript
   console.log(audioUrl); // Should be /files/audio/response_*.mp3
   ```

---

## Configuration Issues

### Changes to app.json not taking effect

**Solution:**

1. **Restart server:**
   ```bash
   # Stop server (Ctrl+C)
   # Start again
   python3 -m uvicorn backend.server:app --reload
   ```

2. **Check file saved:**
   ```bash
   cat backend/config/app.json | grep -A 5 '"llm"'
   ```

3. **Validate JSON:**
   ```bash
   python3 -m json.tool backend/config/app.json
   # Should print formatted JSON or show error
   ```

---

### Config file corrupted

**Symptoms:**
- Server won't start
- JSON parse errors

**Solution:**

1. **Backup corrupted file:**
   ```bash
   cp backend/config/app.json backend/config/app.json.broken
   ```

2. **Restore from template:**
   ```bash
   # If you have backup
   cp backend/config/app.json.backup backend/config/app.json

   # Or recreate default
   cat > backend/config/app.json << 'EOF'
   {
     "profile": "auto",
     "input_mode": "text",
     "output_mode": "text+voice",
     "llm": {
       "provider": "lmstudio",
       "endpoint": "http://127.0.0.1:1234/v1",
       "api_key": "lm-studio",
       "model": ""
     },
     "tts": {
       "provider": "fish_audio",
       "endpoint": "https://api.fish.audio/v1",
       "api_key": "",
       "voice_id": "8ef4a238714b45718ce04243307c57a7",
       "format": "mp3",
       "sample_rate": 24000,
       "fallback_chain": ["piper_local", "xtts_server"]
     },
     "asr": {
       "enabled": false,
       "provider": "browser"
     },
     "memory": {
       "max_history": 12
     }
   }
   EOF
   ```

---

## Performance Issues

### High CPU usage

**Causes & Solutions:**

#### 1. LLM running on CPU
**Solution:**
- Enable GPU in LM Studio
- Use smaller model
- Use cloud LLM (OpenAI, Claude)

#### 2. Hot reload in production
**Solution:**
```bash
# Don't use --reload in production
python3 -m uvicorn backend.server:app
```

#### 3. Large context window
**Solution:**
```json
{"memory": {"max_history": 6}}
```

---

### High memory usage

**Causes:**

1. Large LLM model loaded
2. Many audio files accumulated
3. Database too large

**Solutions:**

```bash
# Clean up audio files
find backend/storage/audio/ -name "*.mp3" -mtime +7 -delete

# Vacuum database
sqlite3 backend/storage/app.db "VACUUM;"

# Use smaller LLM model
```

---

### Slow API responses

**Check:**

```bash
# Test health check speed
time curl http://localhost:8000/api/healthcheck
```

**Solutions:**

1. **Optimize database queries** (already optimized in v5.30)
2. **Reduce context window**
3. **Use faster LLM model**
4. **Enable caching** (planned for v5.31)

---

## Installation Issues

### Python version too old

**Check version:**
```bash
python3 --version
# Should be 3.8 or higher
```

**Solution:**
- macOS: `brew install python@3.11`
- Linux: `sudo apt install python3.11`
- Windows: Download from python.org

---

### pip install fails

**Common Issues:**

#### 1. Permission denied
```bash
# Don't use sudo, use --user
pip install --user fastapi uvicorn
```

#### 2. No module named pip
```bash
python3 -m ensurepip --upgrade
```

#### 3. SSL certificate error
```bash
pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org fastapi
```

---

### Git clone fails

**Solutions:**

```bash
# If HTTPS fails, try SSH
git clone git@github.com:user/repo.git

# If both fail, download ZIP
# Extract and use that
```

---

## Advanced Debugging

### Enable Debug Logging

**Modify server.py:**
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

**Run with debug:**
```bash
python3 -m uvicorn backend.server:app --log-level debug
```

---

### Inspect Database

```bash
sqlite3 backend/storage/app.db

# Useful commands:
.tables                    # List all tables
.schema sessions          # Show table structure
SELECT * FROM sessions;   # View data
.quit                     # Exit
```

---

### Test Endpoints with cURL

```bash
# Health check
curl http://localhost:8000/api/healthcheck

# Config
curl http://localhost:8000/api/config

# Sessions
curl http://localhost:8000/api/sessions

# Characters
curl http://localhost:8000/api/characters

# Test chat (without LLM running - will show error)
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"text":"test"}'
```

---

### Check System Resources

```bash
# CPU usage
top -o cpu

# Memory
free -h  # Linux
vm_stat  # macOS

# Disk space
df -h

# Open files
lsof -p $(pgrep -f uvicorn)

# Network connections
netstat -an | grep 8000
```

---

### Capture Full Error Stack Trace

**Python:**
```python
import traceback
try:
    # ... code ...
except Exception as e:
    traceback.print_exc()
```

**JavaScript (Browser Console):**
```javascript
window.onerror = function(msg, url, line, col, error) {
  console.error('Error:', msg, 'at', url, line, col);
  console.error('Stack:', error.stack);
};
```

---

## Getting Help

### Information to Provide

When reporting issues, include:

1. **Version:** v5.29 or v5.30
2. **OS:** macOS, Linux, Windows + version
3. **Python version:** `python3 --version`
4. **Error message:** Full text, including stack trace
5. **Steps to reproduce:** What you did before error
6. **Config:** Relevant parts of app.json (redact API keys)
7. **Logs:** Server output

### Check Documentation

- **API Reference:** `docs/api/API_REFERENCE.md`
- **Feature Guides:** `docs/features/FEATURE_*.md`
- **Milestones:** `docs/planning/MILESTONES.md`

### Test Results

See `TESTING_RESULTS_V5.30.md` for known working configurations.

---

## Quick Fixes Checklist

- [ ] Server running? `curl http://localhost:8000/api/healthcheck`
- [ ] LM Studio running? `curl http://127.0.0.1:1234/v1/models`
- [ ] Database migrated? `python3 -m backend.preflight`
- [ ] Config valid JSON? `python3 -m json.tool backend/config/app.json`
- [ ] Dependencies installed? `pip install -r requirements.txt`
- [ ] In correct directory? `pwd` should show project root
- [ ] Port 8000 available? `lsof -ti:8000` should be empty
- [ ] Browser console clear? `F12` → no red errors
- [ ] Firewall allowing connections?
- [ ] Files have correct permissions? `ls -la`

---

**Need More Help?** Check GitHub issues or project documentation.

**Last Updated:** 2025-11-25
**Version:** v5.30
