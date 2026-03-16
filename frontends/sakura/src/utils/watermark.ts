/**
 * Client-side watermark compositing for Photo Mode screenshots.
 *
 * Draws semi-transparent text onto a screenshot PNG using an offscreen
 * canvas. Applied after the viewer returns the screenshot dataUrl but
 * before posting to the gallery API.
 *
 * @module watermark
 */

/** Configuration for the watermark overlay. */
export interface WatermarkConfig {
  /** Whether to apply a watermark. */
  enabled: boolean;
  /** Text to render (e.g., "@username" or "Made with Waifu.exe"). */
  text: string;
  /** Corner position for the watermark. */
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Font size in pixels (scaled proportionally to image size). */
  fontSize?: number;
  /** Text color with alpha (default: semi-transparent white). */
  color?: string;
}

/** Default watermark configuration. */
export const DEFAULT_WATERMARK: WatermarkConfig = {
  enabled: false,
  text: 'WAIFU.EXE',
  position: 'bottom-right',
  fontSize: 14,
  color: 'rgba(255, 255, 255, 0.4)',
};

/**
 * Apply a text watermark to a screenshot data URL.
 *
 * Creates an offscreen canvas, draws the screenshot, overlays the
 * watermark text at the specified corner, and returns the composited
 * PNG as a new data URL.
 *
 * @param dataUrl - The original PNG data URL from the viewer.
 * @param config - Watermark configuration.
 * @returns Promise resolving to the watermarked PNG data URL.
 *          Returns the original dataUrl if watermarking is disabled
 *          or if an error occurs.
 *
 * @example
 * ```ts
 * const watermarked = await applyWatermark(dataUrl, {
 *   enabled: true,
 *   text: '@myhandle',
 *   position: 'bottom-right',
 * });
 * ```
 */
export async function applyWatermark(
  dataUrl: string,
  config: WatermarkConfig,
): Promise<string> {
  if (!config.enabled || !config.text.trim()) {
    return dataUrl;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        // Draw the original screenshot
        ctx.drawImage(img, 0, 0);

        // Configure watermark text style
        const fontSize = config.fontSize ?? 14;
        // Scale font size proportionally — 14px at 1080p, larger for 4x captures
        const scaledSize = Math.round(fontSize * (img.width / 1920));
        ctx.font = `${scaledSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = config.color ?? 'rgba(255, 255, 255, 0.4)';
        ctx.textBaseline = 'bottom';

        const padding = scaledSize;

        // Position calculation based on corner
        let x: number;
        let y: number;
        switch (config.position) {
          case 'top-left':
            ctx.textAlign = 'left';
            x = padding;
            y = padding + scaledSize;
            break;
          case 'top-right':
            ctx.textAlign = 'right';
            x = img.width - padding;
            y = padding + scaledSize;
            break;
          case 'bottom-left':
            ctx.textAlign = 'left';
            x = padding;
            y = img.height - padding;
            break;
          case 'bottom-right':
          default:
            ctx.textAlign = 'right';
            x = img.width - padding;
            y = img.height - padding;
            break;
        }

        // Optional subtle drop shadow for readability
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = scaledSize * 0.3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        ctx.fillText(config.text, x, y);

        resolve(canvas.toDataURL('image/png'));
      } catch {
        // On any canvas error, return the original
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
