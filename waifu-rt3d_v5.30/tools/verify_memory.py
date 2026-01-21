import sys
import os
sys.path.append(os.getcwd())

from backend.memory.vector_store import VectorStore
import time

def verify_memory():
    print("INITIALIZING_VECTOR_STORE...")
    vs = VectorStore()
    
    # Clean previous test
    print("ADDING_TEST_MEMORY...")
    session_id = 999
    char_id = 1
    
    test_fact = f"My secret code is OMEGA-{int(time.time())}"
    vs.add_memory(session_id, char_id, "user", test_fact)
    
    print(f"STORED: {test_fact}")
    time.sleep(1) # Let indexing happen
    
    print("QUERYING_MEMORY...")
    results = vs.query_memory("What is my secret code?", char_id=char_id)
    
    found = False
    for r in results:
        print(f" - FOUND: {r['text']} (Dist: {r['dist']:.4f})")
        if test_fact in r['text']:
            found = True
            
    if found:
        print("\nSUCCESS: Memory successfully stored and retrieved.")
    else:
        print("\nFAILURE: Created memory not found in top results.")

if __name__ == "__main__":
    verify_memory()
