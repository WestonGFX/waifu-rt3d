import requests
import logging
from .base import LLMAdapter

logger = logging.getLogger("waifu.llm.ollama")

class OllamaAdapter(LLMAdapter):
    def chat(self, messages, model, endpoint, api_key, **kw):
        # Ollama API: POST /api/chat
        base_url = endpoint.rstrip('/')
        url = f"{base_url}/api/chat"
        
        # Convert system prompt to Ollama format if needed, 
        # but Ollama supports standard messages list now.
        
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": kw.get("temperature", 0.7)
            }
        }
        
        try:
            r = requests.post(url, json=payload, timeout=(5, 90))
            if r.status_code != 200:
                return {"ok": False, "error": f"Ollama Error {r.status_code}: {r.text}", "code": "ERR_OLLAMA"}
                
            data = r.json()
            return {"ok": True, "reply": data.get("message", {}).get("content", ""), "raw": data}
            
        except Exception as e:
            return {"ok": False, "error": str(e), "code": "ERR_CONN"}
