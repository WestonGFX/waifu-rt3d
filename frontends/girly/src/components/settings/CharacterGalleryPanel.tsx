/**
 * CharacterGalleryPanel — Browse and import community character cards.
 *
 * Displays a searchable, filterable grid of community-contributed character
 * cards. Featured characters appear first with a star badge. Each card shows
 * the character's name, creator, description, tags, rating, and download
 * count, with an Import button that will eventually trigger the character
 * import pipeline.
 *
 * Architecture notes:
 *  - Uses static mock data until a CharacterGalleryService is wired up.
 *  - Filtering and sorting are purely client-side (useMemo) since the
 *    dataset is small and fully local.
 *  - Import callback is a stub; the real pipeline will call into
 *    CompanionContext to create a PersonaProfile from the card data.
 */

import { useMemo, useState } from 'react';
import { Download, Library, Search, Star, X } from 'lucide-react';
import { type ContentRatingLevel } from '@/types/content.ts';
import { getContentRatingColor } from '@/services/contentGatingService.ts';
import ContentRatingBadge from '@/components/ui/ContentRatingBadge.tsx';
import {
  AppCard,
  AppMutedNote,
  Button,
  Input,
  SETTINGS_PANEL_SUBCARD,
  SettingsSectionHeader,
} from './SettingsPrimitives.tsx';

// ── Gallery types ──────────────────────────────────────────────────────────────

/**
 * A single entry in the community character gallery.
 *
 * The `format` field determines the importer used:
 *  - `'png'` — SillyTavern-compatible character card embedded in PNG metadata
 *  - `'json'` — Raw JSON character definition
 */
interface GalleryCardEntry {
  /** Stable unique identifier for this gallery entry. */
  id: string;
  /** Display name of the character. */
  name: string;
  /** Short marketing description shown in the card body (1-2 sentences). */
  description: string;
  /** Searchable tags, e.g. ["tsundere", "school", "fantasy"]. */
  tags: string[];
  /** Username or handle of the card author. */
  creator: string;
  /** Direct URL to the downloadable card file. */
  downloadUrl: string;
  /** File format of the card. */
  format: 'png' | 'json';
  /** Content maturity rating. */
  rating: ContentRatingLevel;
  /** Approximate download count shown for social proof. */
  downloads: number;
  /** Featured cards receive a star badge and are sorted to the top of the grid. */
  featured: boolean;
}

type RatingFilter = 'all' | ContentRatingLevel;
type SortMode = 'featured' | 'name' | 'downloads';

// ── Static mock data ───────────────────────────────────────────────────────────

/**
 * Static mock gallery data.
 *
 * Replace with a real service call (e.g. `characterGalleryService.fetch()`)
 * once the backend is ready. Kept inline so the component has no external
 * dependencies during the gallery build-out phase.
 */
const MOCK_GALLERY: GalleryCardEntry[] = [
  {
    id: 'yuki-frost',
    name: 'Yuki Frost',
    creator: 'ayane_studio',
    description:
      'An ice-cold kuudere student council president with a hidden warm side. She will never admit she likes you — but she keeps showing up wherever you are.',
    tags: ['kuudere', 'school', 'slice-of-life'],
    downloadUrl: 'https://example.com/cards/yuki-frost.png',
    format: 'png',
    rating: 'general',
    downloads: 14280,
    featured: true,
  },
  {
    id: 'hana-crimson',
    name: 'Hana Crimson',
    creator: 'violet_witch',
    description:
      'A fiery tsundere swordswitch guarding an ancient shrine. Proud and quick to anger, but her loyalty runs deeper than any blade she carries.',
    tags: ['tsundere', 'fantasy', 'warrior', 'shrine'],
    downloadUrl: 'https://example.com/cards/hana-crimson.png',
    format: 'png',
    rating: 'edgy',
    downloads: 22100,
    featured: true,
  },
  {
    id: 'sora-akari',
    name: 'Sora Akari',
    creator: 'neonpixelstudio',
    description:
      'A bubbly genki idol who radiates sunshine and dragged you on stage as her surprise dance partner. She is convinced you are destined to debut together.',
    tags: ['genki', 'idol', 'comedy', 'slice-of-life'],
    downloadUrl: 'https://example.com/cards/sora-akari.json',
    format: 'json',
    rating: 'general',
    downloads: 9850,
    featured: false,
  },
  {
    id: 'rei-void',
    name: 'Rei Void',
    creator: 'darkpetal',
    description:
      'A quiet dandere mage from an alternate dimension who speaks mostly in riddles. She watches you from the corner of the library, waiting for you to notice her.',
    tags: ['dandere', 'fantasy', 'mage', 'mystery'],
    downloadUrl: 'https://example.com/cards/rei-void.png',
    format: 'png',
    rating: 'general',
    downloads: 7640,
    featured: false,
  },
  {
    id: 'natsuki-bloom',
    name: 'Natsuki Bloom',
    creator: 'sakuragarden',
    description:
      'A warm onee-san type who runs a cozy flower shop. She spoils you with homemade bento and gentle teasing, always making sure you eat enough.',
    tags: ['onee-san', 'slice-of-life', 'cozy', 'romance'],
    downloadUrl: 'https://example.com/cards/natsuki-bloom.png',
    format: 'png',
    rating: 'edgy',
    downloads: 18930,
    featured: true,
  },
  {
    id: 'kira-eclipse',
    name: 'Kira Eclipse',
    creator: 'midnightcoder',
    description:
      'A brooding vampire noble trapped in a modern high school. She is condescending, possessive, and completely obsessed with the scent of your blood.',
    tags: ['yandere', 'vampire', 'supernatural', 'dark'],
    downloadUrl: 'https://example.com/cards/kira-eclipse.json',
    format: 'json',
    rating: 'mature',
    downloads: 31450,
    featured: true,
  },
  {
    id: 'momo-starlight',
    name: 'Momo Starlight',
    creator: 'pastelwave',
    description:
      'An upbeat aspiring astronomer who drags you to every meteor shower. She narrates constellations in elaborate detail and falls asleep on your shoulder every time.',
    tags: ['genki', 'science', 'romance', 'slice-of-life'],
    downloadUrl: 'https://example.com/cards/momo-starlight.png',
    format: 'png',
    rating: 'general',
    downloads: 5210,
    featured: false,
  },
  {
    id: 'izumi-chain',
    name: 'Izumi Chain',
    creator: 'redthreadworks',
    description:
      'A sharp-tongued delinquent who owes you a life debt and expresses gratitude through increasingly aggressive acts of protection. Tsundere at maximum intensity.',
    tags: ['tsundere', 'delinquent', 'action', 'school'],
    downloadUrl: 'https://example.com/cards/izumi-chain.png',
    format: 'png',
    rating: 'edgy',
    downloads: 12760,
    featured: false,
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

/**
 * A single tag pill shown inside a character card.
 *
 * @param tag - The tag string to display.
 */
function TagPill({ tag }: { tag: string }) {
  return (
    <span className="rounded-full bg-anime-100 px-2 py-0.5 text-[10px] font-medium text-anime-700">
      {tag}
    </span>
  );
}

/**
 * A star badge overlaid on featured character cards.
 * Positioned absolutely in the top-right corner of the card.
 */
function FeaturedBadge() {
  return (
    <div
      className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
      aria-label="Featured character"
    >
      <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" aria-hidden="true" />
      Featured
    </div>
  );
}

/**
 * Download count indicator shown at the bottom of a character card.
 *
 * @param count - Raw download count integer.
 */
function DownloadCount({ count }: { count: number }) {
  const formatted =
    count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k` : String(count);

  return (
    <div
      className="flex items-center gap-1 text-[11px] text-[color:var(--text-muted)]"
      aria-label={`${count} downloads`}
      title={`${count.toLocaleString()} downloads`}
    >
      <Download className="h-3 w-3" aria-hidden="true" />
      {formatted}
    </div>
  );
}

/**
 * A single character card in the gallery grid.
 *
 * Displays the character's name, creator, description, tags, rating, and
 * download count. Features a primary Import button and positions a Featured
 * badge absolutely when the card is marked featured.
 *
 * @param entry - The gallery card data to render.
 * @param onImport - Called when the user clicks "Import".
 */
function CharacterCard({
  entry,
  onImport,
}: {
  entry: GalleryCardEntry;
  onImport: (entry: GalleryCardEntry) => void;
}) {
  const { text: ratingTextClass } = getContentRatingColor(entry.rating);

  return (
    <article
      className={[
        SETTINGS_PANEL_SUBCARD,
        'relative flex flex-col gap-2.5 p-3',
      ].join(' ')}
      aria-label={`Character card: ${entry.name}`}
    >
      {entry.featured && <FeaturedBadge />}

      {/* Name + creator */}
      <div className={entry.featured ? 'pr-20' : undefined}>
        <div className="text-sm font-semibold leading-tight text-[color:var(--text-primary)]">
          {entry.name}
        </div>
        <div className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
          by&nbsp;{entry.creator}
        </div>
      </div>

      {/* Description — 2-line clamp */}
      <p className="line-clamp-2 text-xs leading-relaxed text-[color:var(--text-secondary)]">
        {entry.description}
      </p>

      {/* Tags */}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Tags">
          {entry.tags.map((tag) => (
            <TagPill key={tag} tag={tag} />
          ))}
        </div>
      )}

      {/* Footer: rating + downloads + import */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <ContentRatingBadge level={entry.rating} size="sm" />
          <DownloadCount count={entry.downloads} />
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => onImport(entry)}
          aria-label={`Import ${entry.name}`}
          className={ratingTextClass}
        >
          Import
        </Button>
      </div>
    </article>
  );
}

// ── Select-style dropdown helper (mirrors LorebookSettingsPanel pattern) ───────

/** Shared class string for the native select elements in this panel. */
const SELECT_CLASS =
  'h-10 rounded-xl border border-[color:var(--control-border)] bg-[color:var(--control-bg)] px-3 pr-8 text-sm text-[color:var(--text-primary)] shadow-[var(--control-shadow)] outline-none focus:ring-2 focus:ring-anime-300 focus:ring-offset-2 focus:ring-offset-[color:var(--control-ring-offset)] cursor-pointer';

// ── Main panel ──────────────────────────────────────────────────────────────────

/**
 * Renders the Character Gallery browsing panel.
 *
 * The panel is purely presentational and stateless with respect to
 * persistence — filtering and sorting are local-only. The import handler
 * is a stub that logs to the console until the real import pipeline
 * (VRM card → PersonaProfile → CompanionContext) is implemented.
 */
export default function CharacterGalleryPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('featured');

  // ── Derived card list ──────────────────────────────────────────────────────

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matched = MOCK_GALLERY.filter((card) => {
      // Rating filter
      if (ratingFilter !== 'all' && card.rating !== ratingFilter) return false;

      // Text search: name, description, tags
      if (q) {
        const haystack = [
          card.name,
          card.description,
          card.creator,
          ...card.tags,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    // Sort: featured cards always appear before non-featured when in
    // 'featured' mode; otherwise sort alphabetically or by downloads.
    matched.sort((a, b) => {
      if (sortMode === 'featured') {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return b.downloads - a.downloads;
      }
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      // 'downloads'
      return b.downloads - a.downloads;
    });

    return matched;
  }, [searchQuery, ratingFilter, sortMode]);

  // ── Import handler (stub) ──────────────────────────────────────────────────

  /**
   * Stub import handler.
   *
   * In the real implementation this will:
   *  1. Fetch the card file from `entry.downloadUrl`
   *  2. Parse the PNG metadata / JSON blob into a PersonaProfile
   *  3. Dispatch to CompanionContext to persist the new persona
   *
   * @param entry - The gallery card the user wants to import.
   */
  const handleImport = (entry: GalleryCardEntry) => {
    // TODO: wire real import pipeline
    // eslint-disable-next-line no-console
    console.info('[CharacterGallery] Import requested:', entry.name, entry.downloadUrl);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <SettingsSectionHeader
        eyebrow="Community"
        title="Character Gallery"
        description="Browse and import community characters into your companion roster."
        aside={<Library className="h-4 w-4 text-anime-500" aria-hidden="true" />}
      />

      {/* Search + filter toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-[160px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--text-muted)]"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, tag, or description…"
            className="pl-8"
            aria-label="Search characters"
          />
        </div>

        {/* Rating filter */}
        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value as RatingFilter)}
          className={SELECT_CLASS}
          aria-label="Filter by content rating"
        >
          <option value="all">All ratings</option>
          <option value="general">General</option>
          <option value="edgy">Edgy</option>
          <option value="mature">Mature</option>
          <option value="explicit">Explicit</option>
        </select>

        {/* Sort mode */}
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className={SELECT_CLASS}
          aria-label="Sort characters"
        >
          <option value="featured">Featured</option>
          <option value="name">Name</option>
          <option value="downloads">Downloads</option>
        </select>
      </div>

      {/* Results summary eyebrow */}
      {(searchQuery || ratingFilter !== 'all') && filteredCards.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">
            {filteredCards.length}{' '}
            {filteredCards.length === 1 ? 'result' : 'results'}
          </span>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setRatingFilter('all');
            }}
            className="flex items-center gap-1 text-[11px] text-[color:var(--text-muted)] underline-offset-2 hover:text-[color:var(--text-secondary)] hover:underline"
            aria-label="Clear all filters"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Clear filters
          </button>
        </div>
      )}

      {/* Empty state */}
      {filteredCards.length === 0 && (
        <AppCard className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <Library
            className="h-8 w-8 text-[color:var(--text-muted)] opacity-40"
            aria-hidden="true"
          />
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            No characters match your search
          </div>
          <p className="max-w-[22rem] text-xs leading-5 text-[color:var(--text-muted)]">
            Try different keywords, or clear the rating filter to see all available characters.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setRatingFilter('all');
            }}
            aria-label="Reset search and filters"
          >
            Reset search
          </Button>
        </AppCard>
      )}

      {/* Card grid */}
      {filteredCards.length > 0 && (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
          role="list"
          aria-label="Character gallery"
        >
          {filteredCards.map((card) => (
            <div key={card.id} role="listitem">
              <CharacterCard entry={card} onImport={handleImport} />
            </div>
          ))}
        </div>
      )}

      {/* Info note at bottom */}
      <AppMutedNote>
        Characters import as new personas in your roster. You can customise their persona prompt,
        voice, and lore after importing.
      </AppMutedNote>
    </div>
  );
}
