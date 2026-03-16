import { useState, useCallback, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** A screenshot item returned by the gallery API. */
export interface GalleryItem {
  id: number;
  uuid: string;
  character_id: number | null;
  character_name: string | null;
  emotion: string | null;
  gesture: string | null;
  quality: number;
  transparent: boolean;
  width: number;
  height: number;
  file_size: number;
  file_path: string;
  caption: string;
  favorite: boolean;
  created_at: string;
  url: string;
  thumb_url: string;
}

/** Paginated gallery response from the API. */
interface GalleryResponse {
  items: GalleryItem[];
  total: number;
  limit: number;
  offset: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   Hook
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * React hook for gallery data fetching, pagination, and mutations.
 *
 * Provides paginated screenshot listing with character and favorites
 * filtering, plus toggle-favorite, update-caption, and delete mutations.
 *
 * @example
 * ```tsx
 * const { items, total, loading, fetchPage, toggleFavorite, deleteItem } = useGallery();
 * useEffect(() => { fetchPage(); }, []);
 * ```
 */
export function useGallery() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Prevent concurrent fetches
  const fetchingRef = useRef(false);

  /**
   * Fetch a page of gallery items with optional filters.
   *
   * @param opts - Pagination and filter options
   * @param opts.offset - Pagination offset (default: current page * pageSize)
   * @param opts.characterId - Filter by character ID
   * @param opts.favoritesOnly - Only return favorited items
   * @param opts.append - Whether to append results (for infinite scroll)
   */
  const fetchPage = useCallback(async (opts: {
    offset?: number;
    characterId?: number | null;
    favoritesOnly?: boolean;
    append?: boolean;
  } = {}) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    const offset = opts.offset ?? page * pageSize;
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (opts.characterId != null) {
      params.set('character_id', String(opts.characterId));
    }
    if (opts.favoritesOnly) {
      params.set('favorites_only', 'true');
    }

    try {
      const res = await fetch(`/api/gallery?${params}`);
      if (!res.ok) throw new Error(`Gallery fetch failed: ${res.status}`);
      const data: GalleryResponse = await res.json();

      if (opts.append) {
        setItems(prev => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gallery');
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [page, pageSize]);

  /**
   * Toggle the favorite status of a gallery item.
   *
   * @param id - Screenshot database ID
   */
  const toggleFavorite = useCallback(async (id: number) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    // Optimistic update
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, favorite: !i.favorite } : i
    ));

    try {
      const res = await fetch(`/api/gallery/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !item.favorite }),
      });
      if (!res.ok) throw new Error('Update failed');
    } catch {
      // Revert optimistic update
      setItems(prev => prev.map(i =>
        i.id === id ? { ...i, favorite: item.favorite } : i
      ));
    }
  }, [items]);

  /**
   * Update the caption of a gallery item.
   *
   * @param id - Screenshot database ID
   * @param caption - New caption text
   */
  const updateCaption = useCallback(async (id: number, caption: string) => {
    try {
      const res = await fetch(`/api/gallery/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption }),
      });
      if (!res.ok) throw new Error('Update failed');
      const updated: GalleryItem = await res.json();
      setItems(prev => prev.map(i => i.id === id ? updated : i));
    } catch (err) {
      console.error('[Gallery] Caption update failed:', err);
    }
  }, []);

  /**
   * Delete a gallery item (removes file, thumbnail, and DB row).
   *
   * @param id - Screenshot database ID
   */
  const deleteItem = useCallback(async (id: number) => {
    // Optimistic removal
    setItems(prev => prev.filter(i => i.id !== id));
    setTotal(prev => prev - 1);

    try {
      const res = await fetch(`/api/gallery/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch {
      // Refetch to restore correct state
      fetchPage();
    }
  }, [fetchPage]);

  return {
    items,
    total,
    loading,
    error,
    page,
    setPage,
    pageSize,
    fetchPage,
    toggleFavorite,
    updateCaption,
    deleteItem,
  };
}
