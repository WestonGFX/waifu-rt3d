# PRD: Memory Browser Ctrl+M Hotkey Integration

## Product Vision

Memory Browser is a slide-in panel overlay accessible via Ctrl+M (Linux/Windows) or Cmd+M (macOS) that provides users with comprehensive memory statistics, user facts database, tiered memory management, journal entries, and mind map visualization. Follows Apple macOS Finder sidebar pattern for familiar UX.

---

## User Stories

### Primary Use Cases

**As a user:**
- I want quick access to my memories without leaving chat flow (Ctrl+M shortcut)
- I want to view memory statistics at a glance (total count, tier distribution)
- I want to manage memories by tier (fleeting/auto-archive, recent/active, permanent/core profile)
- I want to search and filter memories by keyword
- I want to promote fleeting memories to active or permanent tiers

**As a power user:**
- I want batch operations for memory management
- I want keyboard navigation within overlay (tab through controls)
- I want undo/redo for memory edits
- I want API export option for backup

---

## Functional Requirements

### FR-1: Overview Tab — Memory Statistics Display

#### Description
Display comprehensive statistics about memory storage and distribution across tiers.

#### Design (Wireframe Approach)
```typescript
interface MemoryStats {
  totalMemories: number;
  tierDistribution: {
    fleeting: { count: number; percentage: number };
    recent: { count: number; percentage: number };
    permanent: { count: number; percentage: number };
  };
  averageAccuracy?: number | null;
}

// Expected structure from API
const expectedStats: MemoryStats = {
  totalMemories: 1234, // Example value
  tierDistribution: {
    fleeting: { count: 156, percentage: 12.6 },
    recent: { count: 890, percentage: 72.1 },
    permanent: { count: 188, percentage: 15.2 },
  },
};

// Display format for wireframe
function renderMemoryStats(stats: MemoryStats): JSX.Element {
  return (
    <div className="stats-section overview" data-testid="stats">
      <h4 style={{marginBottom: "16px"}}>Memory Statistics</h4>
      
      <div className="stat-row">
        <span>Total Memories:</span>
        <span className="stat-value">{stats.totalMemories.toLocaleString()}</span>
      </div>
      
      <div className="stat-row tier-breakdown">
        <span>Fleeting Tier:</span>
        <span className="tier-badge" style={{background: "rgba(255,193,7,.3)"}}>
          {stats.tierDistribution.fleeting.count} (12.6%)
        </span>
      </div>

      <div className="stat-row tier-breakdown">
        <span>Recent Tier:</span>
        <span className="tier-badge" style={{background: "rgba(26,188,156,.3)"}}>
          {stats.tierDistribution.recent.count} (72.1%)
        </span>
      </div>

      <div className="stat-row tier-breakdown">
        <span>Permanent Tier:</span>
        <span className="tier-badge" style={{background: "rgba(78,205,196,.3)"}}>
          {stats.tierDistribution.permanent.count} (15.2%)
        </span>
      </div>
    </div>
  );
}
```

#### Acceptance Criteria
- [ ] Overview tab displays total memory count accurately
- [ ] Tier distribution badges color-coded (fleeting=yellow, recent=green, permanent=cyan)
- [ ] Numbers update dynamically when memories are added/removed
- [ ] Accessibility: aria-live region for count changes
- [ ] Performance: stats render within 150ms of data fetch

---

### FR-2: About You Tab — User Facts Database

#### Description
Comprehensive facts database organized into editable entries with promote/delete operations.

#### Implementation Priority HIGH
```typescript
interface UserFact {
  id: string;
  title: string;
  content: string;
  tier: MemoryTier; // fleeting/recent/permanent
  updatedAt: Date;
}

type MemoryTier = "fleeting" | "recent" | "permanent";

interface FactsPanelProps {
  facts: UserFact[];
  onPromote: (factId: string, fromTier: MemoryTier) => Promise<void>;
  onDelete: (factId: string) => Promise<void>;
}

function FactsPanel({ facts, onPromote, onDelete }: FactsPanelProps) {
  return (
    <div className="tab-content about-you" data-testid="about-you">
      <h4>Your User Facts Database</h4>

      {facts.map(fact => (
        <div 
          key={fact.id} 
          className="fact-item" 
          onClick={() => navigateToFactDetail(`${fact.id}`)}
        >
          <strong>{escapeHtml(fact.title)}</strong>
          <br />
          <span style={{marginBottom: "4px"}}>{truncateText(fact.content, 200)}</span>
          
          <div style={{display: "flex", gap: "8px", marginTop: "8px"}}>
            {fact.tier === "fleeting" && (
              <button 
                onClick={(e) => { e.stopPropagation(); onPromote(fact.id, "fleeting"); }}
                className="promote-button"
              >
                Promote to Recent
              </button>
            )}

            {(fact.tier === "recent" || fact.tier === "permanent") && (
              <button 
                onClick={(e) => { e.stopPropagation(); onDelete(fact.id); }}
                className="delete-button"
              >
                Delete Fact
              </button>
            )}
            
            <button className="edit-button">Edit</button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

#### Acceptance Criteria  
- [ ] All facts load with correct tier badges visible
- [ ] Promote operation updates tier badge and removes from source tier
- [ ] Delete requires confirmation dialog (prevents accidental loss)
- [ ] Keyboard navigation works (tab between facts, enter to edit/promote/delete)
- [ ] Empty state shown when no facts in tier

---

### FR-3: Memories Tab — Tiered Memory Browser

#### Description
Displays memories organized by tiers with search filtering, promote/degrade operations.

#### Implementation Priority HIGH
```typescript
interface TierBadge {
  variant: "fleeting" | "recent" | "permanent";
  label: string;
  badge: JSX.Element;
}

function MemoryCard({ memory }: { memory: MemoryItem }) {
  const tier = getTierBadge(memory.tier);
  
  return (
    <div className="fact-card" data-testid={`memory-item`}>
      <strong>{escapeHtml(memory.content)}</strong>
      
      <div 
        className="tier-badge" 
        style={{
          variant: memory.tier,
          background: getTierColor(memory.tier),
        }}
      >
        {tier.label}
      </div>

      {memory.tier === "fleeting" && (
        <button 
          className="promote-button"
          onClick={() => promoteMemory(memory.id)}
        >
          Promote
        </button>
      )}

      {(memory.tier === "recent" || memory.tier === "permanent") && (
        <button 
          className="delete-button"
          onClick={() => deleteMemory(memory.id)}
        >
          Delete
        </button>
      )}
    </div>
  );
}

function promoteMemory(memoryId: string) {
  // Move memory to next tier or permanent tier
  const currentTier = getMemoryTierFromId(memoryId);
  const nextTier = getNextTier(currentTier);
  
  if (nextTier) {
    updateMemory(memoryId, { tier: nextTier });
  }
}

function deleteMemory(memoryId: string) {
  if (!window.confirm("Delete this memory permanently?")) return;
  
  try {
    await companionApi.deleteMemory(memoryId);
  } catch (error) {
    console.error("Failed to delete memory:", error);
    showErrorMessage("Could not delete memory");
  }
}
```

#### Acceptance Criteria
- [ ] Tier badges color-coded and clearly visible on each memory card  
- [ ] Promote button appears only for fleeting tier memories
- [ ] Delete button appears for recent/permanent tier memories only
- [ ] Search input filters results in real-time (debounced 300ms)
- [ ] Keyboard shortcuts: / focuses search, Enter promotes, Del deletes

---

### FR-4: Journal Tab — Daily Entry Viewer

#### Description
Displays user journal entries organized by date with text editing capability.

#### Implementation Priority MEDIUM
```typescript
interface JournalEntry {
  id: string;
  date: Date;
  content: string;
  tags: string[];
}

interface JournalTabProps {
  entries: JournalEntry[];
}

function JournalTab({ entries }: JournalTabProps) {
  // Group entries by day
  const groupedByDay = groupEntriesByDate(entries);
  
  return (
    <div className="tab-content journal">
      <h4>Daily Journal Entries</h4>

      {groupedByDay.map(([date, dayEntries]) => (
        <div key={date.toISOString()} className="journal-day">
          <h5>{formatDate(date)}</h5>
          
          {dayEntries.map(entry => (
            <div 
              key={entry.id} 
              className="journal-item"
              style={{marginBottom: "12px"}}
            >
              <strong>{truncateText(entry.content, 200)}</strong>
              
              <div style={{marginTop: "4px"}}>
                {entry.tags.map(tag => (
                  <span key={tag} className="journal-tag">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

#### Acceptance Criteria  
- [ ] Entries grouped by date with clear visual separation
- [ ] Dates formatted consistently (YYYY-MM-DD or locale format)
- [ ] Tags displayed as pill-shaped badges below content
- [ ] Scrollable area for large entry counts
- [ ] Empty state when no journal entries exist

---

### FR-5: Mind Map Tab — Visual Connection Graph

#### Description
Visual representation of character connections with their relationships and attributes.

#### Implementation Priority LOW (Future Enhancement)
```typescript
interface CharacterNode {
  id: string;
  name: string;
  connections: string[]; // IDs of connected characters
  attributes: Record<string, string>;
}

// TODO: Implement mind map visualization library integration
// Options: D3.js, vis-network, or similar

function MindMapTab({ nodes, edges }: { nodes: CharacterNode[]; edges: Edge[] }) {
  return (
    <div className="tab-content mind-map" style={{height: "100%", display: "flex"}}>
      {/* Placeholder for V1 — use Canvas API or WebGL in V2 */}
      <div style={{flex: 1; display: "flex", alignItems: "center", justifyContent: "center"}}>
        Mind Map Visualization Canvas
        <br />
        (V2 Enhancement)
      </div>
    </div>
  );
}
```

#### Acceptance Criteria  
- [ ] Placeholder visible in V1 with upgrade path documented
- [ ] Node data structure defined for future implementation
- [ ] Edge relationship metadata prepared (strength, type, lastUpdated)
- [ ] API endpoint exists for mindmap data retrieval (/api/mindmap)

---

## Non-Functional Requirements

### Performance Targets
- Overlay toggle: < 200ms from keypress to visible state
- Memory card rendering batched (not >60fps)  
- Search filtering: debounce to 300ms, then sync render ≤ 150ms
- Tier badge updates: instantaneous DOM patching (no full re-render)

### Accessibility Standards
- ARIA roles on overlay container (role="dialog")
- Keyboard navigation through all interactive controls
- Focus trapping within overlay when open
- Announce overlay open/close via screen reader (aria-live)
- Sufficient color contrast for tier badges (WCAG AA minimum)

---

## Wireframe Layout (V1)

```html
<div className="memory-browser-overlay" role="dialog">
  <div className="overlay-header">
    <h3>Memory Browser</h3>
    <button onClick={toggleOverlay}>✕ Close</button>
  </div>

  <nav className="tabs" role="tablist">
    <button className="tab active" role="tab">Overview</button>
    <button className="tab" role="tab">About You</button>
    <button className="tab" role="tab">Memories</button>
    <button className="tab" role="tab">Journal</button>
    <button className="tab" role="tab">Mind Map</button>
  </nav>

  <div className="tab-content overview" role="tabpanel">
    {/* Memory statistics display */}
    <StatsDisplay />
    
    <RecentFactsList />
  </div>
  
  <!-- Other tab content panels -->
</div>
```

---

## API Endpoints (Required)

| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| GET | /api/memory-browser | Get overview stats + recent facts | ✅ Ready |
| GET | /api/memory-browser/facts/{factId} | Get specific fact for edit mode | ✅ Ready |  
| DELETE | /api/memory-browser/delete/{factId} | Remove fact from database | ✅ Ready |
| POST | /api/memory-browser/promote | Promote memory to next tier | ⏸️ Needs implementation |
| GET | /api/mindmap | Get mindmap graph data | ⏸️ Future (V2) |

---

## Success Metrics

### Functional Metrics
- Overlay open/close: >95% success rate on Ctrl+M keypress
- Search filtering: 100% accuracy in results
- Tier promotion/deletion: >98% operation success rate

### Adoption Metrics  
- % of users who use Memory Browser within first week: Track via analytics
- Average time spent in overlay per session (if <2 seconds, may indicate poor UX)
- Features used: Which tabs most popular for each user segment?

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Tier promotion fails due to backend API limitations | MEDIUM | LOW | Implement client-side queue with retry logic |
| Search performance degrades with large memory counts | HIGH | MEDIUM | Implement pagination + virtual scrolling in V2 |
| Keyboard navigation broken during rapid typing | MEDIUM | MEDIUM | Add debouncing to key handlers; test with simulated fast typing |

---

## Appendix A: Tier Badge Styling (Wireframe)

```css
/* V1 Wireframe — Grayscale, no decorative colors */
.tier-badge {
  padding: 4px 12px;
  border-radius: 15px;
  font-size: 11px;
  font-weight: 500;
}

/* Production-ready color coding (apply in polish phase) */
.tier-badge[data-variant="fleeting"] {
  background: rgba(255,193,7);
  color: #333;
}

.tier-badge[data-variant="recent"] {
  background: rgba(26,188,156);
  color: white;
}

.tier-badge[data-variant="permanent"] {
  background: rgba(78,205,196);
  color: white;
}
```

---
