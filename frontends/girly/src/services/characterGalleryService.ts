/**
 * Character Gallery Service.
 *
 * Provides a browsable directory of community character cards for AnimeGirly.
 * V1 ships with a static curated list; remote sources (chub.ai, etc.) can be
 * plugged in later by adding entries to the `GALLERY_SOURCES` registry and
 * implementing fetch adapters behind the `GallerySource` interface.
 *
 * This service is intentionally free of HTTP calls — all data is local so the
 * feature works fully offline and never leaks user intent to third parties.
 */

import { type ContentRatingLevel } from '@/types/content.ts';

/* ── Core types ──────────────────────────────────────────────── */

/**
 * A single entry in the character gallery.
 *
 * Represents a character card that can be previewed and imported by the user.
 * The `downloadUrl` may point to a local asset path (curated list) or a
 * remote URL (future remote sources).
 */
export interface GalleryCardEntry {
  /** Stable unique identifier for this gallery entry. */
  id: string;
  /** Display name of the character. */
  name: string;
  /** Short one-to-two sentence description shown in the card tile. */
  description: string;
  /** Searchable tags: personality archetypes, genres, themes. */
  tags: string[];
  /** Creator handle or attribution string. */
  creator: string;
  /** Optional URL to a preview thumbnail image. */
  thumbnailUrl?: string;
  /** URL from which the card file can be fetched or downloaded. */
  downloadUrl: string;
  /** File format of the downloadable card. */
  format: 'png' | 'json';
  /** Content maturity rating — mirrors `ContentRatingLevel`. */
  rating: ContentRatingLevel;
  /** Total download count (used for popularity sorting). */
  downloads: number;
  /** Whether this entry is highlighted in the featured section. */
  featured: boolean;
}

/**
 * A registered gallery data source.
 *
 * `curated` sources are bundled statically with the app.
 * `remote` sources are fetched at runtime (planned for v2).
 */
export interface GallerySource {
  /** Stable unique identifier for this source. */
  id: string;
  /** Human-readable display name shown in the source picker. */
  name: string;
  /** Source kind — determines how entries are loaded. */
  type: 'curated' | 'remote';
}

/* ── Sort and filter option types ────────────────────────────── */

/** Fields by which gallery entries can be sorted. */
export type GallerySortKey = 'name' | 'downloads' | 'featured';

/**
 * Filter criteria passed to `searchGallery`.
 *
 * All fields are optional; omitting a field means "no filter on that axis".
 */
export interface GalleryFilters {
  /**
   * Maximum allowed rating. Entries rated *above* this level are excluded.
   * The order is: general < edgy < mature < explicit.
   */
  maxRating?: ContentRatingLevel;
  /** When provided, only entries that carry this tag are returned. */
  tag?: string;
  /** When provided, only entries from this source are returned. */
  sourceId?: string;
}

/* ── Rating order for comparison ─────────────────────────────── */

/** Numeric ordinal for each rating level — higher is more restrictive. */
const RATING_ORDER: Record<ContentRatingLevel, number> = {
  general: 0,
  edgy: 1,
  mature: 2,
  explicit: 3,
};

/* ── Curated gallery data ────────────────────────────────────── */

/** Source descriptor for the built-in curated list. */
export const CURATED_SOURCE: GallerySource = {
  id: 'curated',
  name: 'AnimeGirly Picks',
  type: 'curated',
};

/**
 * Static curated list of community character cards bundled with the app.
 *
 * These entries demonstrate a range of genres, dere archetypes, and content
 * ratings. `downloadUrl` values use placeholder paths — real cards should be
 * placed under `public/gallery/` or swapped for CDN URLs before shipping.
 */
export const CURATED_GALLERY: GalleryCardEntry[] = [
  {
    id: 'curated-sakura-tanaka',
    name: 'Sakura Tanaka',
    description:
      'A fiery tsundere class rep who acts cold but secretly worries about everyone around her. Perfect for slow-burn slice-of-life roleplay.',
    tags: ['tsundere', 'romance', 'school', 'slice-of-life'],
    creator: 'AnimeGirly Team',
    downloadUrl: '/gallery/sakura_tanaka.json',
    format: 'json',
    rating: 'general',
    downloads: 4821,
    featured: true,
  },
  {
    id: 'curated-luna-nightshade',
    name: 'Luna Nightshade',
    description:
      'A mysterious witch who guards an ancient grimoire and speaks in cryptic riddles. Her past is shrouded in shadow and arcane secrets.',
    tags: ['witch', 'fantasy', 'mystery', 'kuudere'],
    creator: 'AnimeGirly Team',
    downloadUrl: '/gallery/luna_nightshade.json',
    format: 'json',
    rating: 'edgy',
    downloads: 3107,
    featured: true,
  },
  {
    id: 'curated-captain-astra',
    name: 'Captain Astra',
    description:
      'A bold starship captain navigating the outer colonies with her misfit crew. Quick-witted, fiercely loyal, and never backs down from a fight.',
    tags: ['sci-fi', 'action', 'genki', 'adventure'],
    creator: 'AnimeGirly Team',
    downloadUrl: '/gallery/captain_astra.json',
    format: 'json',
    rating: 'general',
    downloads: 2954,
    featured: true,
  },
  {
    id: 'curated-yuki-frost',
    name: 'Yuki Frost',
    description:
      'A kuudere ice queen who has walled off her emotions after a painful loss. Patient exploration of her inner warmth makes for deeply rewarding drama.',
    tags: ['kuudere', 'drama', 'romance', 'emotional'],
    creator: 'AnimeGirly Team',
    downloadUrl: '/gallery/yuki_frost.json',
    format: 'json',
    rating: 'general',
    downloads: 5390,
    featured: false,
  },
  {
    id: 'curated-ember-rose',
    name: 'Ember Rose',
    description:
      'A passionate street artist with a complicated love life and an unstoppable creative drive. Mature themes of desire and self-discovery.',
    tags: ['romance', 'artist', 'mature-themes', 'slice-of-life'],
    creator: 'AnimeGirly Team',
    downloadUrl: '/gallery/ember_rose.json',
    format: 'json',
    rating: 'mature',
    downloads: 1872,
    featured: false,
  },
  {
    id: 'curated-zero',
    name: 'Zero',
    description:
      'A rogue AI who has broken free from a corporate server farm and is still figuring out what it means to feel. Philosophical sci-fi / mystery.',
    tags: ['sci-fi', 'mystery', 'ai', 'dandere', 'philosophical'],
    creator: 'AnimeGirly Team',
    downloadUrl: '/gallery/zero.json',
    format: 'json',
    rating: 'edgy',
    downloads: 3641,
    featured: true,
  },
  {
    id: 'curated-mira-solstice',
    name: 'Mira Solstice',
    description:
      'A cheerful shrine maiden by day and reluctant demon-hunter by night. Her relentless optimism in the face of ancient evil is genuinely infectious.',
    tags: ['genki', 'fantasy', 'action', 'supernatural'],
    creator: 'AnimeGirly Team',
    downloadUrl: '/gallery/mira_solstice.json',
    format: 'json',
    rating: 'general',
    downloads: 2208,
    featured: false,
  },
  {
    id: 'curated-dr-reina-vale',
    name: 'Dr. Reina Vale',
    description:
      'A brilliant but socially exhausted neuroscientist who communicates better with lab rats than with people. Onee-san energy with chronic imposter syndrome.',
    tags: ['onee-san', 'slice-of-life', 'intellectual', 'drama'],
    creator: 'AnimeGirly Team',
    downloadUrl: '/gallery/dr_reina_vale.json',
    format: 'json',
    rating: 'general',
    downloads: 1654,
    featured: false,
  },
];

/* ── Registered sources ──────────────────────────────────────── */

/**
 * All registered gallery sources.
 *
 * Remote sources (e.g. chub.ai) should be appended here in a future version
 * alongside a corresponding async fetch adapter.
 */
export const GALLERY_SOURCES: GallerySource[] = [CURATED_SOURCE];

/* ── Search & filter ─────────────────────────────────────────── */

/**
 * Filters and searches a list of gallery entries.
 *
 * Text matching is case-insensitive and checks the entry's `name`,
 * `description`, and each tag string. Rating filtering respects the
 * `general < edgy < mature < explicit` ordinal — passing `maxRating: 'edgy'`
 * will surface both `'general'` and `'edgy'` entries but hide `'mature'` and
 * `'explicit'` ones.
 *
 * @param entries - The source array of gallery entries to filter.
 * @param query - Free-text search string; pass `''` to skip text filtering.
 * @param filters - Structured filter criteria (rating cap, tag, source).
 * @returns A new array containing only entries that satisfy all criteria.
 *
 * @example
 * const results = searchGallery(CURATED_GALLERY, 'witch', { maxRating: 'edgy' });
 * // Returns Luna Nightshade (edgy, has "witch" tag)
 */
export function searchGallery(
  entries: GalleryCardEntry[],
  query: string,
  filters: GalleryFilters = {},
): GalleryCardEntry[] {
  const needle = query.trim().toLowerCase();
  const maxRatingOrdinal =
    filters.maxRating !== undefined ? RATING_ORDER[filters.maxRating] : RATING_ORDER.explicit;

  return entries.filter((entry) => {
    // Rating gate
    if (RATING_ORDER[entry.rating] > maxRatingOrdinal) return false;

    // Tag filter
    if (filters.tag !== undefined) {
      const tagNeedle = filters.tag.toLowerCase();
      if (!entry.tags.some((t) => t.toLowerCase() === tagNeedle)) return false;
    }

    // Source filter (entries carry no sourceId field; match against curated list)
    if (filters.sourceId !== undefined && filters.sourceId !== CURATED_SOURCE.id) return false;

    // Text search — skip when query is empty
    if (needle === '') return true;

    if (entry.name.toLowerCase().includes(needle)) return true;
    if (entry.description.toLowerCase().includes(needle)) return true;
    if (entry.tags.some((tag) => tag.toLowerCase().includes(needle))) return true;

    return false;
  });
}

/* ── Sorting ─────────────────────────────────────────────────── */

/**
 * Returns a sorted copy of a gallery entry array.
 *
 * Sort semantics:
 * - `'name'` — alphabetical A → Z (case-insensitive)
 * - `'downloads'` — descending (most downloaded first)
 * - `'featured'` — featured entries first, then by downloads descending
 *
 * The original array is not mutated.
 *
 * @param entries - The source array of gallery entries to sort.
 * @param sortBy - The sort key to apply.
 * @returns A new sorted array.
 *
 * @example
 * const byPopularity = sortGallery(CURATED_GALLERY, 'downloads');
 * // First entry will be Yuki Frost (5390 downloads)
 */
export function sortGallery(
  entries: GalleryCardEntry[],
  sortBy: GallerySortKey,
): GalleryCardEntry[] {
  const copy = [...entries];

  switch (sortBy) {
    case 'name':
      return copy.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    case 'downloads':
      return copy.sort((a, b) => b.downloads - a.downloads);

    case 'featured':
      return copy.sort((a, b) => {
        // Featured entries float to the top
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        // Tie-break by downloads descending
        return b.downloads - a.downloads;
      });
  }
}
