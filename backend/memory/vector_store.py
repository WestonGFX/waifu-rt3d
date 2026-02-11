import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
import logging
import os
import time

logger = logging.getLogger(__name__)

class VectorStore:
    def __init__(self, storage_path="backend/storage/memory"):
        self.storage_path = storage_path
        os.makedirs(storage_path, exist_ok=True)
        
        logger.info(f"Initializing Vector Store at {storage_path}...")
        
        # Initialize ChromaDB Client
        self.client = chromadb.PersistentClient(path=storage_path)
        
        # Initialize Embedding Model (MiniLM is fast & runs on CPU)
        logger.info("Loading Embedding Model (all-MiniLM-L6-v2)...")
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        
        # Get or Create Collection
        self.collection = self.client.get_or_create_collection(name="waifu_memory")
        logger.info("Vector Store Initialized.")

    def add_memory(self, session_id: int, char_id: int, role: str, text: str):
        """Embed and store a memory."""
        try:
            # Generate ID based on timestamp
            mem_id = f"{session_id}_{int(time.time()*1000)}"
            
            # Create Embedding
            embedding = self.model.encode(text).tolist()
            
            # Add to DB
            self.collection.add(
                documents=[text],
                embeddings=[embedding],
                metadatas=[{
                    "session_id": session_id,
                    "char_id": char_id,
                    "role": role,
                    "timestamp": time.time()
                }],
                ids=[mem_id]
            )
            logger.info(f"Memory stored: {mem_id}")
            return mem_id
        except Exception as e:
            logger.error(f"Failed to store memory: {e}")
            return None

    def query_memory(self, text: str, n_results=3, char_id=None):
        """Retrieve relevant past memories."""
        try:
            query_embedding = self.model.encode(text).tolist()
            
            where = None
            if char_id:
                where = {"char_id": char_id}

            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results,
                where=where
            )
            
            # Format results
            memories = []
            if results.get('documents'):
                for i, doc in enumerate(results['documents'][0]):
                    meta = results['metadatas'][0][i]
                    memories.append({
                        "id": results['ids'][0][i] if results.get('ids') else None,
                        "text": doc,
                        "role": meta['role'],
                        "dist": results['distances'][0][i] if 'distances' in results else 0,
                        "char_id": meta.get('char_id'),
                        "session_id": meta.get('session_id'),
                        "timestamp": meta.get('timestamp')
                    })
            
            return memories
        except Exception as e:
            logger.error(f"Memory query failed: {e}")
            return []
