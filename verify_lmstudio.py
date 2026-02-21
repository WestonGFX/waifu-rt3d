import sys
import os
import time

# Ensure backend is in path
sys.path.append(os.getcwd())

from backend.llm.adapters.lmstudio_rest import LMStudioRESTAdapter
from backend.llm.adapters.openai_compat import OpenAICompatAdapter

def test_adapter():
    print("=== Testing LM-Studio Connectivity ===")
    
    # User provided config
    endpoint_base = "http://10.0.0.17:1234"
    api_key = "sk-lm-HhhBXSeX:qaqsGLDXX6ekXfQRo2D2"
    model = "glm-4.7-flash-uncensored-heretic-neo-code-imatrix-max"
    
    messages = [
        {"role": "system", "content": "Reply with 'Connection Successful'."},
        {"role": "user", "content": "Status check."}
    ]
    
    # 1. Test REST Adapter (api/v1/chat)
    print(f"\n[Test 1] LF-Studio REST Adapter ({endpoint_base})")
    try:
        adapter = LMStudioRESTAdapter()
        start = time.time()
        # Verify_lmstudio.py assumes the adapter handles the path construction
        response = adapter.chat(messages, model, endpoint_base, api_key, timeout=(2, 5))
        duration = time.time() - start
        
        print(f"Time: {duration:.2f}s")
        if response.get("ok"):
            print(f"SUCCESS: {response.get('reply')}")
        else:
            print(f"FAILURE: {response.get('error')}")
    except Exception as e:
        print(f"ERROR: {e}")

    # 2. Test OpenAI Compat Adapter (/v1/chat/completions)
    print(f"\n[Test 2] OpenAI Compat Adapter ({endpoint_base}/v1)")
    try:
        adapter = OpenAICompatAdapter()
        start = time.time()
        # OpenAI adapter usually expects /v1 included or appended
        endpoint_openai = f"{endpoint_base}" 
        response = adapter.chat(messages, model, endpoint_openai, api_key, timeout=(2, 5))
        duration = time.time() - start
        
        print(f"Time: {duration:.2f}s")
        if response.get("ok"):
            print(f"SUCCESS: {response.get('reply')}")
        else:
            print(f"FAILURE: {response.get('error')}")
            print(f"Raw: {response.get('raw', 'N/A')}")

    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    test_adapter()
