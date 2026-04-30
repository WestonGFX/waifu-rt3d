import { forwardRef, useEffect, useImperativeHandle, useRef, useCallback } from 'react';
import { parseActions, type Token } from '../lib/parseActions';

/**
 * Imperative methods exposed to the parent (ChatThread) so the composer
 * toolbar's Italic button + Ctrl/Cmd+I shortcut can drive selection wrapping
 * without leaking the contenteditable internals.
 */
export interface RichComposerHandle {
  /** Focus the editable surface. */
  focus(): void;
  /**
   * Wrap the current selection in `*...*`. With no selection, insert `**` and
   * park the caret between the asterisks. Mirrors the textarea behaviour.
   */
  wrapSelection(): void;
  /** Returns the current plain-text value. */
  getValue(): string;
}

interface Props {
  /** Plain-text source of truth. RichComposer renders styled spans from this. */
  value: string;
  /** Called whenever the user types or pastes. */
  onChange: (value: string) => void;
  /** Forwarded to the contenteditable div for Enter/Shift-Enter/etc. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Placeholder rendered via `:empty::before`. */
  placeholder?: string;
  /** Forwarded to the wrapper. Mirrors textarea className for layout parity. */
  className?: string;
  /** Forwarded to the wrapper. */
  style?: React.CSSProperties;
  /** Disabled state — toggles `contenteditable` and visually fades. */
  disabled?: boolean;
  /** Optional aria-label. */
  'aria-label'?: string;
}

/**
 * Render a parsed token list to an HTML string. Italic tokens use the
 * theme's `--color-action` so roleplay actions pop on every theme.
 *
 * Returned HTML is inserted via innerHTML; we sanitise input by encoding
 * any `<` / `>` / `&` characters in plain segments before assembly.
 */
function renderTokensToHtml(tokens: Token[]): string {
  if (tokens.length === 0) return '';
  return tokens.map(tok => {
    const safe = escapeHtml(tok.text);
    if (tok.type === 'bold') return `<strong>${safe}</strong>`;
    if (tok.type === 'italic') return `<em data-action="1" style="color: var(--color-action); opacity: 0.95;">*${safe}*</em>`;
    if (tok.type === 'narration') {
      return `<span data-narr="1" style="font-style: italic; color: var(--color-text-secondary); opacity: 0.85; font-size: 0.93em;">(${safe})</span>`;
    }
    return safe;
  }).join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, c => c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;');
}

/**
 * Compute the caret offset relative to the start of `root` in plain-text
 * characters. Walks the DOM range up to the current selection's end.
 *
 * Returns 0 if there's no selection inside `root`.
 */
function getCaretCharOffset(root: HTMLElement): number {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.endContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

/**
 * Set the caret to `offset` plain-text characters from the start of `root`.
 * Walks descendant text nodes counting characters until the offset lands.
 */
function setCaretCharOffset(root: HTMLElement, offset: number): void {
  const sel = document.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = Math.max(0, offset);

  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent ?? '').length;
      if (remaining <= len) {
        range.setStart(node, remaining);
        range.collapse(true);
        return true;
      }
      remaining -= len;
      return false;
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      if (walk(node.childNodes[i])) return true;
    }
    return false;
  }

  if (!walk(root)) {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Extract the current plain-text value from a contenteditable `root`,
 * normalising `<br>` and block boundaries to `\n`. We use this instead of
 * `innerText` because innerText is layout-dependent and inconsistent across
 * browsers when the element has CSS like `display: contents`.
 */
function extractPlainText(root: HTMLElement): string {
  let out = '';
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName;
    if (tag === 'BR') {
      out += '\n';
      return;
    }
    for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
    if (tag === 'DIV' || tag === 'P') out += '\n';
  }
  for (let i = 0; i < root.childNodes.length; i++) walk(root.childNodes[i]);
  // Trim ONE trailing newline that browsers like to inject from block boundaries.
  return out.replace(/\n$/, '');
}

/**
 * RichComposer — drop-in replacement for the chat composer textarea that
 * renders `*action*` segments live as italic+colored while the user types.
 *
 * Approach: a single `contenteditable` div is the source of truth for the
 * caret; React owns the plain-text `value` prop. On input we (a) extract
 * the current plain text, (b) save the caret position, (c) replace the
 * div's innerHTML with parsed segments, (d) restore the caret, and
 * (e) bubble the new value to `onChange`. IME composition events suppress
 * the re-render so input methods (e.g. Japanese kana) work normally.
 */
export const RichComposer = forwardRef<RichComposerHandle, Props>(function RichComposer(
  { value, onChange, onKeyDown, placeholder, className, style, disabled, 'aria-label': ariaLabel },
  ref,
) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const composingRef = useRef(false);

  /** Extract → parse → restyle → restore caret → bubble onChange. */
  const handleInput = useCallback(() => {
    const root = divRef.current;
    if (!root || composingRef.current) return;
    const text = extractPlainText(root);
    const caret = getCaretCharOffset(root);
    const html = renderTokensToHtml(parseActions(text));
    if (root.innerHTML !== html) {
      root.innerHTML = html;
      setCaretCharOffset(root, caret);
    }
    if (text !== value) onChange(text);
  }, [onChange, value]);

  /**
   * Sync from external `value` changes (mic dictation, voice mode, send-clear,
   * pill click) — but only when the new value diverges from the current DOM
   * text. Prevents cursor jumps during normal typing where `value` already
   * matches the DOM after `handleInput`.
   */
  useEffect(() => {
    const root = divRef.current;
    if (!root) return;
    const currentText = extractPlainText(root);
    if (currentText === value) return;
    const html = renderTokensToHtml(parseActions(value));
    root.innerHTML = html;
    if (document.activeElement === root) {
      setCaretCharOffset(root, value.length);
    }
  }, [value]);

  /** Replace pasted rich content with plain text only. */
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const handleCompositionStart = useCallback(() => { composingRef.current = true; }, []);
  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false;
    handleInput();
  }, [handleInput]);

  /**
   * Wrap the current selection with `*...*`. Mirrors the textarea wrap
   * helper but uses the Selection API since contenteditable doesn't expose
   * `selectionStart`/`selectionEnd`.
   */
  const wrapSelection = useCallback(() => {
    const root = divRef.current;
    if (!root) return;
    root.focus();
    const sel = document.getSelection();
    if (!sel) return;
    if (!sel.rangeCount || !root.contains(sel.anchorNode as Node | null)) {
      const r = document.createRange();
      r.selectNodeContents(root);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    const startOffset = getCaretStartOffset(root);
    const endOffset = getCaretCharOffset(root);
    const text = extractPlainText(root);
    let nextText: string;
    let nextCaret: number;
    if (startOffset === endOffset) {
      nextText = text.slice(0, startOffset) + '**' + text.slice(startOffset);
      nextCaret = startOffset + 1;
    } else {
      const a = Math.min(startOffset, endOffset);
      const b = Math.max(startOffset, endOffset);
      nextText = text.slice(0, a) + '*' + text.slice(a, b) + '*' + text.slice(b);
      nextCaret = b + 1;
    }
    const html = renderTokensToHtml(parseActions(nextText));
    root.innerHTML = html;
    setCaretCharOffset(root, nextCaret);
    onChange(nextText);
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    focus: () => divRef.current?.focus(),
    wrapSelection,
    getValue: () => (divRef.current ? extractPlainText(divRef.current) : ''),
  }), [wrapSelection]);

  /** Render the initial value to HTML once on mount. */
  useEffect(() => {
    const root = divRef.current;
    if (!root) return;
    const html = renderTokensToHtml(parseActions(value));
    if (root.innerHTML !== html) root.innerHTML = html;
    // intentionally only on mount — subsequent value sync handled above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={divRef}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-placeholder={placeholder ?? ''}
      onInput={handleInput}
      onKeyDown={onKeyDown}
      onPaste={handlePaste}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      className={className}
      style={{
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        outline: 'none',
        ...style,
      }}
    />
  );
});

/**
 * Caret start offset (anchor) — symmetric with `getCaretCharOffset` but for
 * the start of the selection rather than the end. Used by `wrapSelection`
 * to detect a non-collapsed range.
 */
function getCaretStartOffset(root: HTMLElement): number {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}
