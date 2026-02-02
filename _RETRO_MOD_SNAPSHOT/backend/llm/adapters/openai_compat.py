import requests
import time
import logging
from .base import LLMAdapter

logger = logging.getLogger("waifu.llm.openai")

class OpenAICompatAdapter(LLMAdapter):
    def chat(self, messages, model, endpoint, api_key, **kw):
        # normalize endpoint
        base_url = endpoint.rstrip('/')
        if not base_url.endswith('/v1'): base_url += '/v1'
        url = f"{base_url}/chat/completions"
        
        headers = {
            "Content-Type": "application/json"
        }
        if api_key and not api_key.startswith("env:"):
             headers["Authorization"] = f"Bearer {api_key}"
        elif api_key and api_key.startswith("env:"):
             # This should have been resolved by server.py already, but just in case
             pass

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": kw.get("max_tokens", -1),
            "temperature": kw.get("temperature", 0.7),
            "stream": False
        }
        
        try:
            r = requests.post(url, headers=headers, json=payload, timeout=(5, 90))
            
            if r.status_code != 200:
                return {
                    "ok": False, 
                    "error": f"API Error {r.status_code}: {r.text}", 
                    "code": "ERR_API_FAIL"
                }
            
            data = r.json()
            if "choices" not in data or not data["choices"]:
                return {"ok": False, "error": "Empty response from LLM", "code": "ERR_EMPTY"}
                
            reply = data["choices"][0]["message"]["content"]
            return {"ok": True, "reply": reply, "raw": data}
            
        except requests.exceptions.Timeout:
            return {"ok": False, "error": "Request Timed Out", "code": "ERR_TIMEOUT"}
        except Exception as e:
            return {"ok": False, "error": f"Connection Failed: {str(e)}", "code": "ERR_CONN"}
