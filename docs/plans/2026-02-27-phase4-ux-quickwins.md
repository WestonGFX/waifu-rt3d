# Phase 4 — UX Quick-Wins Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 6 high-impact UX features (A–F) that each take < 2 h, require zero or minimal backend changes, and dramatically improve daily-use feel.

**Architecture:** All features are confined to the Sakura React frontend. Feature A (voice dictation) uses the browser-native Web Speech API. Feature B (typing indicator) inserts a ghost bubble during streaming. Feature C (quick-reply chips) buffers the last AI reply and shows 3 contextual chip suggestions. Feature D (message edit) refills the composer with an existing user message and re-sends. Feature E (VRM screenshot) fires an existing `captureScreenshot` postMessage to the viewer iframe. Feature F (affinity sparkline) maintains a rolling in-memory ring buffer of the last 10 affinity readings and renders them as an inline SVG path.

**Tech Stack:** React 19, Zustand, Framer Motion, Web Speech API (A), SVG (F), existing postMessage API (E)

---

## Feature A — Voice Dictation (Web Speech API)

**Files:**
- Modify: `frontends/sakura/src/views/ChatThread.tsx`

**Context:**
The composer already has push-to-talk (MediaRecorder → backend Whisper). This adds a **second mode**: browser-native Web Speech API continuous dictation. No backend. Click to start; words appear in the textarea in real-time as interim results. Click again (or press Enter) to stop and finalize.

**Step 1 — Add `useDictation` inline state + refs (inside ChatThread, near micState)**

```tsx
// ── Feature A: Web Speech API dictation ─────────────────────────────────
const recognitionRef = useRef<SpeechRecognition | null>(null);
const [dictating, setDictating] = useState(false);

const startDictation = useCallback(() => {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) { alert('Voice dictation requires Chrome or Edge.'); return; }
  const rec = new SR() as SpeechRecognition;
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  let base = draft; // capture draft at click time
  rec.onresult = (e: SpeechRecognitionEvent) => {
    let interim = '';
    let final = base;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) { final += e.results[i][0].transcript; base = final; }
      else interim += e.results[i][0].transcript;
    }
    setDraft(final + interim);
  };
  rec.onerror = () => { setDictating(false); };
  rec.onend = () => { setDictating(false); };
  recognitionRef.current = rec;
  rec.start();
  setDictating(true);
}, [draft, setDraft]);

const stopDictation = useCallback(() => {
  recognitionRef.current?.stop();
  setDictating(false);
}, []);

const toggleDictation = useCallback(() => {
  if (dictating) stopDictation();
  else startDictation();
}, [dictating, startDictation, stopDictation]);
```

**Step 2 — Add dictation button to composer row (beside the existing mic push-to-talk button)**

Find the push-to-talk button block (~line 664). Add this **after** it:

```tsx
{/* Voice dictation button — Web Speech API (Chrome/Edge only) */}
{!voiceActive && !!(
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
) && (
  <button
    onClick={toggleDictation}
    title={dictating ? 'Stop dictation' : 'Dictate (Web Speech API)'}
    aria-label={dictating ? 'Stop dictation' : 'Start voice dictation'}
    aria-pressed={dictating}
    className="p-2 rounded-lg transition-all duration-150 flex-shrink-0"
    style={{
      backgroundColor: dictating ? 'var(--color-success, #39c96e)' : 'transparent',
      color: dictating ? '#fff' : 'var(--color-text-tertiary)',
    }}
  >
    <Mic size={16} />
  </button>
)}
```

Import `Mic` from lucide-react (add to existing import line).

**Step 3 — Update textarea placeholder to show dictation status**

In the textarea `placeholder` prop, add:
```tsx
placeholder={
  dictating ? 'Dictating — speak now…' :
  voiceActive ? 'Voice mode active — speak to send…' :
  incognito ? 'Incognito — not saved…' :
  `Message ${activeCharacter.name}…`
}
```

**Step 4 — Stop dictation if voice-first mode activates (cleanup)**

In the `toggleVoiceMode` callback or the useEffect that watches `voiceActive`:
```tsx
if (voiceActive && dictating) stopDictation();
```

**Step 5 — Also bump textarea max height from 80px → 120px**

```tsx
el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
```

**Step 6 — Build check**
```bash
npm run build --prefix frontends/sakura 2>&1 | tail -5
```
Expected: `✓ built in ...`

---

## Feature B — Typing Indicator (animated "..." bubble)

**Files:**
- Modify: `frontends/sakura/src/views/ChatThread.tsx`

**Context:**
When `loading === true`, show a ghost dialogue bubble with 3 animated dots at the bottom of the message list, just before the end-of-list anchor. Uses existing CSS animation or Framer Motion.

**Step 1 — Add `TypingIndicator` component (top of ChatThread.tsx, before main component)**

```tsx
/** Animated three-dot typing indicator shown while the AI is generating. */
function TypingIndicator({ name }: { name: string }) {
  return (
    <div
      className="flex items-end gap-2 px-4 py-1"
      aria-label={`${name} is typing`}
      aria-live="polite"
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '10px 14px', borderRadius: '18px 18px 18px 4px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              display: 'block', width: 6, height: 6, borderRadius: '50%',
              backgroundColor: 'var(--color-text-muted)',
              animation: 'typingDot 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

**Step 2 — Add `typingDot` keyframe to `frontends/sakura/src/styles/components.css`**

```css
@keyframes typingDot {
  0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
  30%           { opacity: 1;    transform: translateY(-4px); }
}
```

**Step 3 — Insert TypingIndicator into message list**

In ChatThread JSX, after the messages `.map(...)` block and before the `<div ref={endRef} />` anchor:

```tsx
{/* Typing indicator — shown while streaming or waiting for first token */}
{loading && (
  <TypingIndicator name={activeCharacter.name} />
)}
<div ref={endRef} />
```

**Step 4 — Build check**
```bash
npm run build --prefix frontends/sakura 2>&1 | tail -5
```

---

## Feature C — Quick-Reply Suggestion Chips

**Files:**
- Modify: `frontends/sakura/src/views/ChatThread.tsx`
- Modify: `frontends/sakura/src/stores/chatStore.ts`

**Context:**
After each AI response finishes streaming, show 3 tappable reply suggestion chips just above the composer. Clicking a chip fills the draft and sends immediately. Suggestions are generated client-side from the AI reply text (no backend call): extract the last sentence, detect a question, and offer contextual continuations.

**Step 1 — Add `generateChips` pure function (top of ChatThread.tsx)**

```tsx
/**
 * Generate 3 quick-reply chip suggestions from the last assistant message.
 * Uses simple heuristics: detects questions, emotional content, and topic keywords.
 *
 * @param text - The last assistant message text.
 * @param charName - Character name for personalised chips.
 * @returns Array of 3 suggestion strings.
 */
function generateChips(text: string, charName: string): string[] {
  const lower = text.toLowerCase();
  const hasQuestion = text.includes('?');
  const isEmotional = /happy|sad|miss|love|glad|wonder|hope|afraid/.test(lower);
  const isAskingAboutUser = /how (are|do) you|what about you|tell me/.test(lower);

  if (hasQuestion && isAskingAboutUser) {
    return ["I'm doing well! 😊", "Honestly, not great…", "Tell me more first!"];
  }
  if (hasQuestion) {
    return ["Yes, definitely!", "Not really, no…", "I'm not sure, what do you think?"];
  }
  if (isEmotional) {
    return [`I feel the same way, ${charName}`, "That's really sweet ♥", "Tell me more about that"];
  }
  return ["That's interesting! Go on…", "I hadn't thought of it that way", `What else is on your mind, ${charName}?`];
}
```

**Step 2 — Add chip state to ChatThread**

```tsx
const [quickChips, setQuickChips] = useState<string[]>([]);
```

**Step 3 — Populate chips when `loading` transitions from true → false**

Add a `useEffect` watching `loading`:

```tsx
useEffect(() => {
  if (!loading) {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant && lastAssistant.text) {
      setQuickChips(generateChips(lastAssistant.text, activeCharacter.name));
    }
  } else {
    setQuickChips([]); // clear while streaming
  }
}, [loading]);
```

**Step 4 — Render chips above composer**

Inside the composer `<div className="max-w-3xl mx-auto">`, before the waveform:

```tsx
{/* Quick-reply chips — appear after AI response, disappear when user types */}
{quickChips.length > 0 && !draft && !loading && (
  <div className="flex gap-2 mb-2 flex-wrap" role="group" aria-label="Quick reply suggestions">
    {quickChips.map((chip, i) => (
      <button
        key={i}
        onClick={() => {
          setDraft(chip);
          setQuickChips([]);
          // Auto-send after a frame so the textarea shows the value first
          setTimeout(() => {
            sendMessage(chip, true, incognito, effectiveMaxTokens);
            setDraft('');
          }, 50);
        }}
        className="px-3 py-1.5 text-xs rounded-full transition-all duration-150"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {chip}
      </button>
    ))}
  </div>
)}
```

**Step 5 — Clear chips when user starts typing**

In the textarea `onChange`:
```tsx
onChange={(e) => { setDraft(e.target.value); if (quickChips.length) setQuickChips([]); }}
```

**Step 6 — Build check**
```bash
npm run build --prefix frontends/sakura 2>&1 | tail -5
```

---

## Feature D — Message Edit + Regenerate

**Files:**
- Modify: `frontends/sakura/src/views/ChatThread.tsx`
- Modify: `frontends/sakura/src/components/DialogueBubble.tsx`

**Context:**
User messages get a hover pencil icon. Clicking it: (1) fills the draft textarea with the original text, (2) deletes all messages that come after that message client-side, (3) re-sends (creating a new branch). This is the simplest correct approach — branches already exist in the backend.

**Step 1 — Add `onEdit` prop to DialogueBubble**

In `DialogueBubble.tsx`, add `onEdit?: () => void` to the `DialogueBubbleProps` interface. In the bubble JSX (user role only), render a hover-reveal edit button:

```tsx
{role === 'user' && onEdit && (
  <button
    onClick={onEdit}
    className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1"
    title="Edit message"
    aria-label="Edit this message"
    style={{ color: 'var(--color-text-muted)' }}
  >
    <Pencil size={12} />
  </button>
)}
```

Import `Pencil` from lucide-react. Wrap the bubble container in `className="relative group"` if not already.

**Step 2 — Add `editMessage` action to chatStore**

In `chatStore.ts`, add to `ChatState` interface and implementation:

```typescript
/** Edit a past user message: trims messages after it and refills draft. */
editMessageAt: (messageId: string, text: string) => void;
```

Implementation:
```typescript
editMessageAt: (messageId, text) => {
  const { messages } = get();
  const idx = messages.findIndex(m => m.id === messageId);
  if (idx < 0) return;
  // Keep messages up to (but not including) the edited message
  const trimmed = messages.slice(0, idx);
  set({ messages: trimmed, draft: text });
},
```

**Step 3 — Wire up in ChatThread**

In the `messages.map()` call in ChatThread, pass `onEdit` to `<DialogueBubble>` for user messages:

```tsx
onEdit={msg.role === 'user' ? () => {
  editMessageAt(msg.id, msg.text);
  // Focus the textarea after a frame
  setTimeout(() => textareaRef.current?.focus(), 50);
} : undefined}
```

Import `editMessageAt` from `useChatStore`.

**Step 4 — Build check**
```bash
npm run build --prefix frontends/sakura 2>&1 | tail -5
```

---

## Feature E — VRM Screenshot Download

**Files:**
- Modify: `frontends/sakura/src/components/ModelPanel.tsx`

**Context:**
`viewer.html` already has `captureScreenshot()` and responds to `{ type: 'captureScreenshot' }` postMessage with `{ type: 'screenshotReady', dataUrl }`. We just need to trigger it and create a download link.

**Step 1 — Add screenshot state + message listener to ModelPanel**

In `ModelPanel`, add:

```tsx
const [screenshotPending, setScreenshotPending] = useState(false);
```

In the existing `useEffect` message handler (the one that watches `modelLoaded`/`fpsUpdate` etc.), add:

```tsx
} else if (e.data?.type === 'screenshotReady') {
  const a = document.createElement('a');
  a.href = e.data.dataUrl;
  a.download = `${character.name.toLowerCase().replace(/\s+/g, '-')}-screenshot.png`;
  a.click();
  setScreenshotPending(false);
}
```

**Step 2 — Add screenshot trigger function**

```tsx
const handleScreenshot = useCallback(() => {
  const iframe = document.querySelector<HTMLIFrameElement>('iframe[src*="viewer"]');
  if (!iframe) return;
  setScreenshotPending(true);
  iframe.contentWindow?.postMessage({ type: 'captureScreenshot' }, '*');
}, [character.name]);
```

**Step 3 — Add camera icon button to the control bar**

In the bottom-right control bar JSX, next to the hide-controls toggle button, add:

```tsx
{/* Screenshot capture button — only shown when model is loaded */}
{vrmLoadState === 'loaded' && (
  <button
    onClick={handleScreenshot}
    disabled={screenshotPending}
    className="flex items-center gap-1 px-2.5 py-1.5 text-xs"
    style={{
      backgroundColor: 'var(--color-surface)',
      borderRadius: 'var(--radius-button)',
      boxShadow: 'var(--shadow-card)',
      color: 'var(--color-text-secondary)',
      border: '1px solid var(--color-border)',
      opacity: screenshotPending ? 0.5 : 0.85,
    }}
    title="Capture screenshot (PNG)"
    aria-label="Download 3D viewport screenshot"
  >
    <Camera size={13} />
  </button>
)}
```

Import `Camera` from lucide-react.

**Step 4 — Build check**
```bash
npm run build --prefix frontends/sakura 2>&1 | tail -5
```

---

## Feature F — Affinity Sparkline in StatusBar

**Files:**
- Modify: `frontends/sakura/src/components/StatusBar.tsx`

**Context:**
`RelationshipBar` already polls `api.getRelationship(charId)` after each message. We'll maintain a rolling buffer of the last 10 affinity values (in-memory, no backend change) and render a tiny 48×16 SVG polyline below the existing tier badge.

**Step 1 — Add ring buffer state to `RelationshipBar`**

```tsx
const affinityHistory = useRef<number[]>([]);
```

**Step 2 — Push new values on each fetch**

In the `useEffect`:
```tsx
api.getRelationship(charId)
  .then(data => {
    setRel(data);
    // Maintain rolling window of last 10 readings
    affinityHistory.current = [...affinityHistory.current.slice(-9), data.affinity];
  })
  .catch(() => {});
```

**Step 3 — Render sparkline SVG below the tier badge**

Add this inside `RelationshipBar`'s return JSX, below the stats bars:

```tsx
{/* Affinity sparkline — only shown when we have ≥ 3 data points */}
{affinityHistory.current.length >= 3 && (() => {
  const h = affinityHistory.current;
  const W = 48, H = 14;
  const minV = Math.min(...h), maxV = Math.max(...h);
  const range = maxV - minV || 0.01;
  const pts = h.map((v, i) => {
    const x = (i / (h.length - 1)) * W;
    const y = H - ((v - minV) / range) * (H - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg
      width={W} height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', marginTop: 3, opacity: 0.7 }}
      aria-label="Affinity trend over recent messages"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Current value dot */}
      {(() => {
        const last = h[h.length - 1];
        const x = W, y = H - ((last - minV) / range) * (H - 2) - 1;
        return <circle cx={x - 0} cy={y} r="2" fill="var(--color-accent)" />;
      })()}
    </svg>
  );
})()}
```

**Step 4 — Build check**
```bash
npm run build --prefix frontends/sakura 2>&1 | tail -5
```

---

## Final Verification

After all 6 features are implemented:

```bash
npm run build --prefix frontends/sakura 2>&1 | tail -10
```

**Manual smoke-test checklist:**
1. Voice dictation: click Mic icon → speak → words appear in textarea → Enter sends
2. Typing indicator: send a message → see animated dots before reply arrives → dots disappear when reply streams in
3. Quick-reply chips: after any AI reply → 3 chips appear above composer → click chip → auto-sends
4. Message edit: hover a past user bubble → pencil appears → click → draft fills, later messages clear → re-send
5. VRM screenshot: open 3D panel, load model → camera icon visible → click → PNG downloads
6. Affinity sparkline: send 3+ messages → tiny trend line appears below affinity bars in StatusBar
