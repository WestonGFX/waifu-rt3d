import requests
from .base import LLMAdapter

class LMStudioAdapter(LLMAdapter):
    def chat(self, messages, model, endpoint, api_key, **kw):
        # Auto-fix endpoint if missing /v1
        base = endpoint.rstrip('/')
        if not base.endswith('/v1'):
            base += '/v1'
        url = base + '/chat/completions'
        # Try to find ROOT/backend/debug.log
        log_path = "/Users/chris/Code/waifu-rt3d/waifu-rt3d_v5.30/backend/debug.log"
        try:
            r = requests.post(url, headers={'Authorization': f'Bearer {api_key}'}, json={'model': model,'messages': messages}, timeout=120)
        except Exception as e:
            return {'ok': False, 'error': f'LLM request failed: {e}'}
        if r.status_code != 200: return {'ok': False, 'error': f'LLM error: {r.text}'}
        data = r.json()
        try: reply = data['choices'][0]['message']['content']
        except Exception: return {'ok': False, 'error': f'Unexpected LLM payload: {data}'}
        return {'ok': True, 'reply': reply, 'raw': data}
