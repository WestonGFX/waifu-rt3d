export function resolveTwoColumnStageHeight(viewportHeight: number, shellPaddingPx: number): number {
  const availableHeight = Math.max(0, Math.round(viewportHeight - shellPaddingPx * 2));
  return availableHeight;
}
