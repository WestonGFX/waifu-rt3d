import requests
from .base import LLMAdapter

class LMStudioAdapter(LLMAdapter):
    def chat(self, messages, model, endpoint, api_key, **kw):
        import time
        base = endpoint.rstrip('/')
        if not base.endswith('/v1'):
            base += '/v1'
        url = base + '/chat/completions'
        
        retries = 3
        backoff = 1.0 # starting delay in seconds
        
        last_exception = None
        for i in range(retries):
            try:
                r = requests.post(
                    url, 
                    headers={'Authorization': f'Bearer {api_key}'}, 
                    json={'model': model, 'messages': messages}, 
                    timeout=120
                )
                if r.status_code == 200:
                    data = r.json()
                    try:
                        reply = data['choices'][0]['message']['content']
                        return {'ok': True, 'reply': reply, 'raw': data}
                    except Exception:
                        return {'ok': False, 'error': f'Unexpected LLM payload: {data}'}
                elif r.status_code >= 500:
                    # Retry on server errors
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                else:
                    return {'ok': False, 'error': f'LLM error ({r.status_code}): {r.text}'}
            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
                last_exception = e
                time.sleep(backoff)
                backoff *= 2
            except Exception as e:
                return {'ok': False, 'error': f'LLM request catastrophic failure: {e}'}
                
        return {'ok': False, 'error': f'LLM request failed after {retries} retries. Last error: {last_exception}'}
