import requests
import logging
from .base import LLMAdapter

logger = logging.getLogger("waifu.llm.lmstudio")

class LMStudioRESTAdapter(LLMAdapter):
    def chat(self, messages, model, endpoint, api_key, **kw):
        """
        Adapter for LM-Studio REST API v1.
        Uses 'input' + 'system_prompt' structure.
        Assumes stateful behavior or single-turn if no session mgmt provided in curl example.
        """
        # Normalize endpoint
        base_url = endpoint.rstrip('/')
        # User example was http://localhost:1234/api/v1/chat
        # If user provides http://localhost:1234, we append /api/v1/chat
        # If user provides http://localhost:1234/v1 (openai style), we might need to adjust, 
        # but let's assume standard base for this new adapter type.
        
        target_url = f"{base_url}/api/v1/chat"
        if "api/v1" in base_url:
            target_url = f"{base_url}/chat"

        # Headers
        headers = {
            "Content-Type": "application/json"
        }
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        # Extract System Prompt and Input
        system_prompt = "You are a helpful assistant."
        user_input = ""
        
        # Simple extraction logic
        # 1. Find system message
        for m in messages:
            if m['role'] == 'system':
                system_prompt = m['content']
                break
        
        # 2. Find last user message (Input)
        # Note: If we want to send full history as a single block, we could concatenation,
        # but for this specific "input" field, it usually implies the latest prompt.
        # Since the user mentioned "stateful", we'll send the distinct latest input.
        if messages and messages[-1]['role'] == 'user':
             user_input = messages[-1]['content']
        else:
            # Fallback if the last message isn't user (rare)
            user_input = "..."

        payload = {
            "model": model,
            "system_prompt": system_prompt,
            "input": user_input,
            "temperature": kw.get("temperature", 0.7),
            # Add max_tokens if needed, though user example didn't have it
            # "max_tokens": kw.get("max_tokens", -1) 
        }

        try:
            # Allow timeout override for testing
            timeout = kw.get("timeout", (5, 120))
            r = requests.post(target_url, headers=headers, json=payload, timeout=timeout)
            
            if r.status_code != 200:
                 return {
                    "ok": False, 
                    "error": f"LM-Studio Error {r.status_code}: {r.text}", 
                    "code": "ERR_API_FAIL"
                }

            data = r.json()
            # User example response structure wasn't explicitly shown but usually it's standard JSON.
            # Assuming standard structure or checking content.
            # If it mimics OpenAI in some way, it might be 'choices'.
            # If it's pure custom, let's guess 'content' or 'reply'.
            # Actually, standard LM-Studio /v1/chat/completions is OpenAI.
            # This /api/v1/chat might return { "content": "..." } or similar.
            # I will trust the user said "REST API-v1".
            # Let's inspect data safely.
            
            reply = ""
            if "content" in data:
                reply = data["content"]
            elif "choices" in data:
                reply = data["choices"][0]["message"]["content"]
            elif "reply" in data:
                reply = data["reply"]
            else:
                 # Fallback dump
                 reply = str(data)

            return {"ok": True, "reply": reply}

        except Exception as e:
            return {"ok": False, "error": f"Connection Failed: {str(e)}", "code": "ERR_CONN"}
