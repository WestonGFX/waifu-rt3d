import requests
from .base import LLMAdapter

class LMStudioAdapter(LLMAdapter):
    def chat(self, messages, model, endpoint, api_key, **kw):
        url = endpoint.rstrip('/') + '/chat/completions'
        try:
            r = requests.post(url, headers={'Authorization': f'Bearer {api_key}'}, json={'model': model,'messages': messages}, timeout=60)
        except Exception as e:
            return {'ok': False, 'error': f'LLM request failed: {e}'}
        if r.status_code != 200: return {'ok': False, 'error': f'LLM error: {r.text}'}
        data = r.json()
        try: reply = data['choices'][0]['message']['content']
        except Exception: return {'ok': False, 'error': f'Unexpected LLM payload: {data}'}
        return {'ok': True, 'reply': reply, 'raw': data}
