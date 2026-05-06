/**
 * Browser-side file-download helpers.
 *
 * Centralizes the "create object URL → anchor click → revoke URL" dance
 * that previously lived inline at four call sites in ChatThread.tsx (txt
 * export, markdown export, JSON export, and the still-to-come image
 * download in DialogueBubble's lightbox).
 *
 * All helpers run in the browser only; they have no Node fallback. The
 * frontend bundle is the only consumer.
 */

/**
 * Download a Blob as a file with the given name.
 *
 * Creates a transient object URL, attaches it to a hidden `<a>` element,
 * triggers a synthetic click, and revokes the URL on the next tick so the
 * browser has a moment to consume it. Safe to call multiple times in
 * succession — each call gets its own URL.
 *
 * @param blob     - Blob containing the file payload (any MIME type).
 * @param filename - Filename suggested to the browser. The user-agent may
 *                   sanitize it; non-ASCII or filesystem-reserved characters
 *                   are typically replaced with underscores by the browser.
 *
 * @example
 *   const blob = new Blob([text], { type: 'text/plain' });
 *   downloadBlob(blob, 'chat-export.txt');
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke synchronously after click — the click handler has already started
  // the download by the time we return; holding the URL longer just leaks.
  URL.revokeObjectURL(url);
}

/**
 * Fetch a remote URL and download it as a file.
 *
 * Used for chat-image saves (Phase 2 lightbox) and any future "save this
 * remote asset locally" flow. The fetch is unauthenticated and follows the
 * browser's normal CORS rules — same-origin URLs always work; cross-origin
 * URLs need a cooperating server.
 *
 * @param url      - Remote URL of the asset to download.
 * @param filename - Filename suggested to the browser.
 *
 * @returns Promise that resolves once the download has been triggered, or
 *          rejects if the fetch fails (network error or non-2xx status).
 *
 * @example
 *   await downloadUrl(message.imageUrl, `${charName}-${Date.now()}.png`);
 */
export async function downloadUrl(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`downloadUrl: ${url} → ${res.status}`);
  }
  const blob = await res.blob();
  downloadBlob(blob, filename);
}
