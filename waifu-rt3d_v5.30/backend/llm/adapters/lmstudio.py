import requests
from .base import LLMAdapter

class LMStudioAdapter(LLMAdapter):
    def chat(self, messages, model, endpoint, api_key, **kw):
        import time
        
        # 9-POINT ROBUSTNESS: Smart URL Discovery
        # Generate candidate URLs to try (e.g., http://loc:1234/v1 vs http://loc:1234)
        clean_ep = endpoint.rstrip('/')
        candidates = []
        if clean_ep.endswith('/v1'):
            candidates.append(clean_ep)
            candidates.append(clean_ep[:-3])
        else:
            candidates.append(clean_ep + '/v1')
            candidates.append(clean_ep)
            
        # Try finding a working URL from candidates
        url_suffix = '/chat/completions'
        last_response = None
        
        for base_url in candidates:
            url = base_url + url_suffix
            
            for i in range(retries):
                try:
                    # 3. Timeout Handling (Aggressive: 5s connect, 60s read)
                    r = requests.post(
                        url, 
                        headers={'Authorization': f'Bearer {api_key}'}, 
                        json={'model': model, 'messages': messages, 'max_tokens': kw.get('max_tokens', -1), 'temperature': kw.get('temperature', 0.7)}, 
                        timeout=(5, 60)
                    )
                    
                    # 6. Auth Handling
                    if r.status_code in [401, 403]:
                        return {'ok': False, 'error': 'ERR_AUTH_FAILURE: Check API Key', 'code': 'ERR_AUTH'}
                    
                    if r.status_code == 200:
                        data = r.json()
                        
                        # 4. Malformed JSON / 7. Empty Response
                        if 'choices' not in data or not data['choices']:
                            return {'ok': False, 'error': 'ERR_EMPTY_RESPONSE: LLM returned no choices', 'code': 'ERR_EMPTY'}
                            
                        reply = data['choices'][0]['message']['content']
                        
                        # 2. Model Unloaded / 8. Stuck Generation
                        if not reply:
                            return {'ok': False, 'error': 'ERR_ZERO_CONTENT: LLM generated empty string', 'code': 'ERR_ZERO_CONTENT'}

                        return {'ok': True, 'reply': reply, 'raw': data}
                    
                    # 2. Model Unloaded OR Wrong URL Path
                    if r.status_code == 404:
                         # Ensure we don't retry same bad URL 3 times if it's a 404
                         last_response = {'ok': False, 'error': 'ERR_404: Endpoint not found', 'code': 'ERR_MODEL_UNLOADED'}
                         break # Break retry loop to try next candidate URL
                    
                    elif r.status_code >= 500:
                        time.sleep(backoff)
                        backoff *= 2
                        continue
                        
                    else:
                        return {'ok': False, 'error': f'LLM Error ({r.status_code}): {r.text}', 'code': 'ERR_API_FAIL'}

                except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
                    # 1. Connection Refused -> Try next candidate immediately? 
                    # Actually, assume it might be transient, but if all retries fail, try next candidate.
                    last_exception = e
                    time.sleep(backoff)
                    backoff *= 2
                except Exception as e:
                     return {'ok': False, 'error': f'ERR_CATASTROPHIC: {e}', 'code': 'ERR_UNKNOWN'}
                     
            # If we exhausted retries for this candidate, loop continues to next candidate
            
        return {'ok': False, 'error': 'ERR_LLM_TIMEOUT: All endpoints failed', 'code': 'ERR_LLM_TIMEOUT'}
