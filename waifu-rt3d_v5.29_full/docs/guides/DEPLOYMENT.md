# Deployment Guide

**Version:** v5.30
**Last Updated:** 2025-11-25

---

## Table of Contents

1. [Local Development](#local-development)
2. [Production Considerations](#production-considerations)
3. [Manual Production Deployment](#manual-production-deployment)
4. [Docker Deployment (Planned)](#docker-deployment-planned-v534)
5. [Cloud Deployment Options](#cloud-deployment-options)
6. [Security](#security)
7. [Monitoring](#monitoring)
8. [Backup & Recovery](#backup--recovery)
9. [Troubleshooting](#troubleshooting)

---

## Local Development

### Requirements

**System:**
- Python 3.8 or higher
- 4GB+ RAM (8GB+ recommended)
- 5GB+ disk space

**Optional:**
- GPU (for local LLM/TTS)
- LM Studio (for local LLM)
- Microphone (for voice input)

---

### Quick Start

**1. Clone Repository**
```bash
cd /path/to/your/projects
git clone <repository-url> waifu-rt3d
cd waifu-rt3d
```

**2. Install Dependencies**
```bash
pip install -r requirements.txt
```

**3. Run Preflight Checks**
```bash
python3 -m backend.preflight
# Should see: "✅ Preflight successful"
```

**4. Start Development Server**
```bash
python3 -m uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000
```

**5. Open Browser**
```
http://localhost:8000
```

---

### Development Configuration

**File:** `backend/config/app.json`

```json
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
```

**Development Tips:**
- Use `--reload` for auto-restart on code changes
- Keep `host` as `127.0.0.1` for security
- Use small LLM models for faster iteration
- Enable browser-based ASR (no backend config needed)

---

### Directory Structure

```
waifu-rt3d_v5.29_full/
├── backend/
│   ├── server.py              # Main FastAPI application
│   ├── preflight.py           # Startup checks
│   ├── config/
│   │   └── app.json          # Configuration file
│   ├── db/
│   │   └── schema_v*.sql     # Database schemas
│   ├── llm/                  # LLM adapters
│   ├── tts/                  # TTS adapters
│   ├── asr/                  # ASR adapters
│   └── storage/
│       ├── app.db           # SQLite database
│       ├── audio/           # Generated audio files
│       └── avatars/         # VRM avatar uploads
├── frontend/
│   ├── index.html           # Original UI (v5.29)
│   ├── index_v2.html        # Enhanced UI (v5.30)
│   ├── viewer/              # Three.js VRM viewer
│   └── lib/                 # JavaScript libraries
├── vrm/                     # VRM model files
├── docs/                    # Documentation
├── requirements.txt         # Python dependencies
└── README.md
```

---

## Production Considerations

### NOT Production-Ready Yet

**v5.30 Status:** ⚠️ **LOCAL DEVELOPMENT ONLY**

**Missing for Production:**
- ❌ Authentication/authorization
- ❌ Rate limiting
- ❌ HTTPS/SSL
- ❌ Input validation/sanitization
- ❌ CORS configuration
- ❌ Error monitoring
- ❌ Logging infrastructure
- ❌ Database backups
- ❌ Health checks/monitoring
- ❌ Load balancing
- ❌ Secrets management

**Recommendation:** Wait for v5.34 or implement security hardening yourself.

---

### Security Checklist (Before Production)

**Critical:**
- [ ] Add API authentication (API keys, JWT, OAuth)
- [ ] Enable HTTPS/SSL
- [ ] Configure CORS properly
- [ ] Add rate limiting (10-60 req/min)
- [ ] Validate all user inputs
- [ ] Sanitize database queries (already parameterized)
- [ ] Hide API keys (use environment variables)
- [ ] Disable debug mode
- [ ] Remove `--reload` flag

**Important:**
- [ ] Set up monitoring (Prometheus, Grafana)
- [ ] Configure logging (structured logs)
- [ ] Database backups (automated)
- [ ] Error tracking (Sentry, etc.)
- [ ] Firewall configuration
- [ ] Regular security updates

---

## Manual Production Deployment

### Step 1: Server Setup

**Choose Hosting:**
- VPS (DigitalOcean, Linode, AWS EC2)
- Self-hosted server
- Cloud platform (Heroku, Render)

**Minimum Specs:**
- 2 CPU cores
- 4GB RAM
- 20GB storage
- Ubuntu 22.04 LTS (recommended)

---

### Step 2: Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python 3.11
sudo apt install python3.11 python3.11-venv python3-pip -y

# Install Git
sudo apt install git -y

# Clone project
cd /opt
sudo git clone <repository-url> waifu-rt3d
cd waifu-rt3d

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

---

### Step 3: Configure for Production

**Create production config:**
```bash
cp backend/config/app.json backend/config/app.prod.json
```

**Use environment variables for secrets:**
```bash
# Create .env file (add to .gitignore!)
cat > .env << 'EOF'
FISH_AUDIO_API_KEY=your-key-here
OPENAI_API_KEY=your-key-here
ELEVENLABS_API_KEY=your-key-here
SECRET_KEY=your-secret-key-here
EOF
```

**Modify server.py to read .env:**
```python
from dotenv import load_dotenv
import os

load_dotenv()

# Use in config
api_key = os.getenv('FISH_AUDIO_API_KEY')
```

---

### Step 4: Set Up Systemd Service

**Create service file:**
```bash
sudo nano /etc/systemd/system/waifu-rt3d.service
```

**Content:**
```ini
[Unit]
Description=Waifu RT3D Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/waifu-rt3d
Environment="PATH=/opt/waifu-rt3d/venv/bin"
ExecStart=/opt/waifu-rt3d/venv/bin/python3 -m uvicorn backend.server:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Enable and start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable waifu-rt3d
sudo systemctl start waifu-rt3d

# Check status
sudo systemctl status waifu-rt3d
```

---

### Step 5: Set Up Nginx Reverse Proxy

**Install Nginx:**
```bash
sudo apt install nginx -y
```

**Configure:**
```bash
sudo nano /etc/nginx/sites-available/waifu-rt3d
```

**Content:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /files/ {
        alias /opt/waifu-rt3d/backend/storage/;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    client_max_body_size 50M;  # For avatar uploads
}
```

**Enable:**
```bash
sudo ln -s /etc/nginx/sites-available/waifu-rt3d /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

### Step 6: Set Up SSL (HTTPS)

**Install Certbot:**
```bash
sudo apt install certbot python3-certbot-nginx -y
```

**Get Certificate:**
```bash
sudo certbot --nginx -d your-domain.com
```

**Auto-renewal:**
```bash
sudo certbot renew --dry-run
```

---

### Step 7: Configure Firewall

```bash
# Install UFW
sudo apt install ufw -y

# Allow SSH (important!)
sudo ufw allow ssh

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

---

### Step 8: Database Backups

**Create backup script:**
```bash
sudo nano /opt/waifu-rt3d/backup.sh
```

**Content:**
```bash
#!/bin/bash
BACKUP_DIR="/opt/waifu-rt3d/backups"
DB_PATH="/opt/waifu-rt3d/backend/storage/app.db"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

mkdir -p $BACKUP_DIR

# Backup database
sqlite3 $DB_PATH ".backup '$BACKUP_DIR/app_$DATE.db'"

# Keep only last 30 days
find $BACKUP_DIR -name "app_*.db" -mtime +30 -delete

echo "Backup created: $BACKUP_DIR/app_$DATE.db"
```

**Make executable:**
```bash
chmod +x /opt/waifu-rt3d/backup.sh
```

**Add to crontab (daily backup):**
```bash
sudo crontab -e

# Add line:
0 2 * * * /opt/waifu-rt3d/backup.sh
```

---

### Step 9: Set Up Monitoring

**Install htop:**
```bash
sudo apt install htop -y
```

**Check logs:**
```bash
# Service logs
sudo journalctl -u waifu-rt3d -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

### Step 10: Test Deployment

```bash
# Health check
curl https://your-domain.com/api/healthcheck

# Config
curl https://your-domain.com/api/config

# Sessions
curl https://your-domain.com/api/sessions
```

---

## Docker Deployment (Planned v5.34)

**Status:** 🚧 Not yet implemented

**Planned Dockerfile:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY vrm/ ./vrm/

EXPOSE 8000

CMD ["uvicorn", "backend.server:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Planned docker-compose.yml:**
```yaml
version: '3.8'

services:
  backend:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - ./backend/storage:/app/backend/storage
      - ./backend/config:/app/backend/config
    environment:
      - FISH_AUDIO_API_KEY=${FISH_AUDIO_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./frontend:/usr/share/nginx/html
    depends_on:
      - backend
    restart: unless-stopped
```

**Planned Usage:**
```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

---

## Cloud Deployment Options

### Heroku

**Pros:**
- Easy deployment
- Free tier available
- Automatic HTTPS

**Cons:**
- Limited free resources
- No persistent storage (files lost on restart)

**Not recommended** due to audio file storage needs.

---

### AWS EC2

**Pros:**
- Full control
- Scalable
- Persistent storage

**Cons:**
- Complex setup
- More expensive

**Recommended** for production.

---

### DigitalOcean Droplet

**Pros:**
- Simple VPS
- Affordable ($5-10/month)
- Good documentation

**Cons:**
- Manual setup required

**Recommended** for small-medium deployments.

---

### Render

**Pros:**
- Easy deployment
- Free tier
- Automatic HTTPS

**Cons:**
- Limited resources on free tier

**Good option** for testing production setup.

---

## Security

### Authentication (Implement Before Production)

**Option 1: API Key**
```python
from fastapi import Header, HTTPException

async def verify_api_key(x_api_key: str = Header()):
    if x_api_key != os.getenv('API_KEY'):
        raise HTTPException(status_code=401, detail="Invalid API key")

@app.get("/api/config", dependencies=[Depends(verify_api_key)])
async def get_config():
    # ...
```

**Option 2: JWT Tokens**
```python
from fastapi import Depends
from fastapi.security import HTTPBearer

security = HTTPBearer()

async def verify_token(credentials = Depends(security)):
    # Verify JWT token
    pass

@app.get("/api/config", dependencies=[Depends(verify_token)])
async def get_config():
    # ...
```

---

### Rate Limiting

**Install slowapi:**
```bash
pip install slowapi
```

**Implement:**
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/api/chat")
@limiter.limit("10/minute")
async def chat_endpoint(request: Request):
    # ...
```

---

### CORS Configuration

**For production:**
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-domain.com"],  # Specific domain only
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)
```

---

### Input Validation

**Already implemented:**
- FastAPI Pydantic models
- SQLite parameterized queries

**Additional:**
```python
from pydantic import BaseModel, validator

class ChatRequest(BaseModel):
    text: str
    speak: bool = False

    @validator('text')
    def text_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Text cannot be empty')
        if len(v) > 1000:
            raise ValueError('Text too long (max 1000 chars)')
        return v.strip()
```

---

## Monitoring

### Health Checks

**Current:** `GET /api/healthcheck`

**Production Addition:**
```python
@app.get("/health/live")
async def liveness():
    return {"status": "alive"}

@app.get("/health/ready")
async def readiness():
    # Check database, LLM, TTS
    return {"status": "ready"}
```

---

### Logging

**Configure structured logging:**
```python
import logging
import json_log_formatter

formatter = json_log_formatter.JSONFormatter()
handler = logging.StreamHandler()
handler.setFormatter(formatter)

logger = logging.getLogger('waifu-rt3d')
logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Use in code
logger.info("Request received", extra={
    "endpoint": "/api/chat",
    "session_id": session_id
})
```

---

### Metrics (Planned)

**Prometheus endpoint:**
```python
from prometheus_client import Counter, Histogram, make_asgi_app

REQUEST_COUNT = Counter('requests_total', 'Total requests')
REQUEST_LATENCY = Histogram('request_latency_seconds', 'Request latency')

# Mount metrics endpoint
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)
```

---

## Backup & Recovery

### Automated Backups

**Database:**
```bash
# Daily backup
0 2 * * * /opt/waifu-rt3d/backup.sh
```

**Config files:**
```bash
# Weekly config backup
0 3 * * 0 tar -czf /opt/backups/config_$(date +\%Y-\%m-\%d).tar.gz /opt/waifu-rt3d/backend/config/
```

---

### Disaster Recovery

**Recovery Plan:**

1. **Database Restoration:**
   ```bash
   cp /opt/waifu-rt3d/backups/app_latest.db /opt/waifu-rt3d/backend/storage/app.db
   sudo systemctl restart waifu-rt3d
   ```

2. **Config Restoration:**
   ```bash
   tar -xzf /opt/backups/config_latest.tar.gz -C /
   ```

3. **Audio Files:**
   - Regenerate on demand (TTS)
   - Or backup audio directory separately

---

## Troubleshooting

### Service won't start

```bash
# Check status
sudo systemctl status waifu-rt3d

# View logs
sudo journalctl -u waifu-rt3d -n 50

# Test manually
cd /opt/waifu-rt3d
source venv/bin/activate
python3 -m uvicorn backend.server:app --host 0.0.0.0 --port 8000
```

---

### High memory usage

```bash
# Check memory
free -h

# Check process
ps aux | grep uvicorn

# Reduce workers in systemd service
ExecStart=... --workers 2  # Instead of 4
```

---

### Database locked

```bash
# Find process
lsof /opt/waifu-rt3d/backend/storage/app.db

# Kill if stuck
sudo systemctl restart waifu-rt3d
```

---

## Performance Tuning

### Production Settings

**Uvicorn Workers:**
```bash
# General rule: (2 x CPU cores) + 1
--workers 4  # For 2-core server
--workers 8  # For 4-core server
```

**Database Optimization:**
```sql
-- Run periodically
VACUUM;
ANALYZE;
```

**Audio Cleanup:**
```bash
# Daily cleanup (older than 7 days)
0 4 * * * find /opt/waifu-rt3d/backend/storage/audio/ -name "*.mp3" -mtime +7 -delete
```

---

## Deployment Checklist

**Before Deployment:**
- [ ] Security hardening complete
- [ ] Secrets in environment variables
- [ ] HTTPS configured
- [ ] Firewall configured
- [ ] Database backups automated
- [ ] Monitoring set up
- [ ] Rate limiting enabled
- [ ] CORS configured properly
- [ ] Health checks working
- [ ] Logs configured
- [ ] Error tracking set up

**After Deployment:**
- [ ] Test all endpoints
- [ ] Verify backups working
- [ ] Check logs for errors
- [ ] Monitor resource usage
- [ ] Test failure scenarios
- [ ] Document deployment specifics

---

## Future Improvements (v5.34+)

**Planned:**
- Docker deployment (one-command setup)
- Kubernetes support (scalability)
- Redis caching (performance)
- PostgreSQL support (scale)
- CDN integration (static assets)
- Auto-scaling (cloud)
- Multi-region deployment

---

## Related Documentation

- **Troubleshooting:** `docs/guides/TROUBLESHOOTING.md`
- **API Reference:** `docs/api/API_REFERENCE.md`
- **Feature Guides:** `docs/features/`
- **Milestones:** `docs/planning/MILESTONES.md`

---

**Last Updated:** 2025-11-25
**Version:** v5.30
**Status:** Local Development Ready ✅ | Production Requires Security Hardening ⚠️
