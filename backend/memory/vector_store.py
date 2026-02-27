import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
import logging
import os
import time
from typing import Optional

logger = logging.getLogger(__name__)


class VectorStore:
    """ChromaDB-backed vector store for semantic memory and character knowledge.

    Handles embedding, storage, and retrieval of conversation memories and
    character knowledge document chunks. Uses MiniLM for fast CPU-based
    sentence embeddings.

    Args:
        storage_path: Directory for ChromaDB persistent storage.

    Example:
        >>> store = VectorStore("backend/storage/memory")
        >>> store.add_memory(1, 1, "user", "Hello there!")
        '1_1707849600000'
    """

    def __init__(self, storage_path: str = "backend/storage/memory"):
        self.storage_path = storage_path
        os.makedirs(storage_path, exist_ok=True)

        logger.info(f"Initializing Vector Store at {storage_path}...")

        # Initialize ChromaDB Client
        self.client = chromadb.PersistentClient(path=storage_path)

        # Initialize Embedding Model (MiniLM is fast & runs on CPU)
        logger.info("Loading Embedding Model (all-MiniLM-L6-v2)...")
        self.model = SentenceTransformer('all-MiniLM-L6-v2')

        # Get or Create Collections
        self.collection = self.client.get_or_create_collection(name="waifu_memory")
        self.docs_collection = self.client.get_or_create_collection(name="character_docs")
        logger.info("Vector Store Initialized.")

    def add_memory(self, session_id: int, char_id: int, role: str, text: str) -> Optional[str]:
        """Embed and store a conversation memory.

        Args:
            session_id: Chat session ID.
            char_id: Character ID associated with this memory.
            role: Message role ('user' or 'assistant').
            text: Message text to embed.

        Returns:
            Memory ID string on success, None on failure.
        """
        try:
            mem_id = f"{session_id}_{int(time.time()*1000)}"
            embedding = self.model.encode(text).tolist()

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

    def query_memory(
        self,
        text: str,
        n_results: int = 3,
        char_id: Optional[int] = None,
        max_dist: float = 1.0,
    ) -> list:
        """Retrieve relevant past memories via semantic similarity.

        Also queries character knowledge docs if char_id is provided,
        merging results by relevance score.

        Args:
            text: Query text to find similar memories for.
            n_results: Maximum number of results to return.
            char_id: Optional character ID to filter memories.
            max_dist: Cosine distance ceiling (0-2); memories with
                ``dist > max_dist`` are excluded.  Default 1.0 keeps
                results with at least a 0.0 relevance score.

        Returns:
            List of memory dicts with text, role, dist, and metadata.
        """
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

            memories = []
            if results.get('documents'):
                for i, doc in enumerate(results['documents'][0]):
                    meta = results['metadatas'][0][i]
                    dist = results['distances'][0][i] if 'distances' in results else 0
                    if dist > max_dist:
                        continue  # skip semantically unrelated memories
                    memories.append({
                        "id": results['ids'][0][i] if results.get('ids') else None,
                        "text": doc,
                        "role": meta['role'],
                        "dist": dist,
                        "char_id": meta.get('char_id'),
                        "session_id": meta.get('session_id'),
                        "timestamp": meta.get('timestamp')
                    })

            # Also search character knowledge docs
            if char_id:
                try:
                    doc_results = self.docs_collection.query(
                        query_embeddings=[query_embedding],
                        n_results=min(3, n_results),
                        where={"char_id": char_id}
                    )
                    if doc_results.get('documents'):
                        for i, doc in enumerate(doc_results['documents'][0]):
                            meta = doc_results['metadatas'][0][i]
                            memories.append({
                                "id": doc_results['ids'][0][i],
                                "text": doc,
                                "role": "knowledge",
                                "dist": doc_results['distances'][0][i] if 'distances' in doc_results else 0,
                                "char_id": meta.get('char_id'),
                                "session_id": None,
                                "timestamp": meta.get('timestamp')
                            })
                except Exception:
                    pass  # docs_collection may be empty

            # Sort by distance (lower = more relevant)
            memories.sort(key=lambda m: m.get('dist', 999))
            return memories[:n_results]

        except Exception as e:
            logger.error(f"Memory query failed: {e}")
            return []

    def list_memories(self, char_id: Optional[int] = None, page: int = 0,
                      size: int = 20) -> dict:
        """List stored memories with pagination.

        Args:
            char_id: Optional character ID to filter by.
            page: Page number (0-indexed).
            size: Number of results per page.

        Returns:
            Dict with 'memories' list and 'total' count.

        Example:
            >>> store.list_memories(char_id=1, page=0, size=10)
            {'memories': [...], 'total': 42}
        """
        try:
            where = {"char_id": char_id} if char_id else None
            total = self.collection.count()

            # ChromaDB get() with limit/offset for pagination
            results = self.collection.get(
                where=where,
                limit=size,
                offset=page * size,
                include=["documents", "metadatas"]
            )

            memories = []
            if results.get('ids'):
                for i, mem_id in enumerate(results['ids']):
                    meta = results['metadatas'][i] if results.get('metadatas') else {}
                    memories.append({
                        "id": mem_id,
                        "text": results['documents'][i] if results.get('documents') else "",
                        "role": meta.get('role', ''),
                        "char_id": meta.get('char_id'),
                        "session_id": meta.get('session_id'),
                        "timestamp": meta.get('timestamp')
                    })

            return {"memories": memories, "total": total}
        except Exception as e:
            logger.error(f"List memories failed: {e}")
            return {"memories": [], "total": 0}

    def delete_memory(self, memory_id: str) -> bool:
        """Delete a single memory by its ID.

        Args:
            memory_id: The ChromaDB document ID to delete.

        Returns:
            True if deletion succeeded, False otherwise.
        """
        try:
            self.collection.delete(ids=[memory_id])
            logger.info(f"Memory deleted: {memory_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete memory {memory_id}: {e}")
            return False

    def add_doc_chunks(self, char_id: int, doc_id: int, filename: str,
                       chunks: list[str]) -> int:
        """Embed and store document chunks for character knowledge base.

        Args:
            char_id: Character ID the document belongs to.
            doc_id: Database row ID of the document.
            filename: Original filename for metadata.
            chunks: List of text chunks to embed.

        Returns:
            Number of chunks successfully stored.

        Example:
            >>> store.add_doc_chunks(1, 5, "lore.txt", ["Chunk 1...", "Chunk 2..."])
            2
        """
        stored = 0
        try:
            for i, chunk in enumerate(chunks):
                chunk_id = f"doc_{doc_id}_chunk_{i}"
                embedding = self.model.encode(chunk).tolist()

                self.docs_collection.add(
                    documents=[chunk],
                    embeddings=[embedding],
                    metadatas=[{
                        "char_id": char_id,
                        "doc_id": doc_id,
                        "filename": filename,
                        "chunk_index": i,
                        "timestamp": time.time()
                    }],
                    ids=[chunk_id]
                )
                stored += 1

            logger.info(f"Stored {stored} chunks for doc {doc_id} (char {char_id})")
        except Exception as e:
            logger.error(f"Failed to store doc chunks: {e}")
        return stored

    def query_doc_chunks(
        self,
        char_id: int,
        query: str,
        n_results: int = 3,
        max_dist: float = 0.85,
    ) -> list:
        """Semantic search over a character's knowledge base documents.

        Used by the ``read_knowledge`` agent tool to find relevant passages
        from uploaded files.  Results are filtered by a maximum cosine
        distance threshold to avoid returning irrelevant chunks.

        Args:
            char_id: Character whose documents to search.
            query: Natural-language search query to embed.
            n_results: Maximum number of chunks to return.
            max_dist: Cosine distance ceiling (0-2); chunks with
                ``dist > max_dist`` are excluded.  Default 0.85 keeps
                results with a relevance score of ≥ 0.15.

        Returns:
            List of dicts with keys: ``text``, ``dist``, ``filename``,
            ``doc_id``, ``chunk_index``.  Sorted by ascending distance
            (most relevant first).

        Example:
            >>> results = store.query_doc_chunks(1, "favourite food", 3)
            >>> results[0]["filename"]
            'character_lore.txt'
        """
        try:
            query_embedding = self.model.encode(query).tolist()
            raw = self.docs_collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results,
                where={"char_id": char_id},
            )

            chunks = []
            if raw.get("documents"):
                for i, doc in enumerate(raw["documents"][0]):
                    dist = (
                        raw["distances"][0][i]
                        if "distances" in raw
                        else 0.0
                    )
                    if dist > max_dist:
                        continue  # skip irrelevant results
                    meta = raw["metadatas"][0][i] if raw.get("metadatas") else {}
                    chunks.append(
                        {
                            "text": doc,
                            "dist": dist,
                            "filename": meta.get("filename", ""),
                            "doc_id": meta.get("doc_id"),
                            "chunk_index": meta.get("chunk_index", 0),
                        }
                    )

            chunks.sort(key=lambda c: c["dist"])
            return chunks

        except Exception as e:
            logger.error("Doc chunk query failed for char %s: %s", char_id, e)
            return []

    def delete_doc_chunks(self, doc_id: int) -> bool:
        """Delete all chunks belonging to a document.

        Args:
            doc_id: Database row ID of the document whose chunks to remove.

        Returns:
            True if deletion succeeded, False otherwise.
        """
        try:
            self.docs_collection.delete(where={"doc_id": doc_id})
            logger.info(f"Deleted chunks for doc {doc_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete doc chunks for {doc_id}: {e}")
            return False
