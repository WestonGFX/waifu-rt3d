interface ViewportSnapshot {
  innerWidth?: number;
  innerHeight?: number;
  clientWidth?: number;
  clientHeight?: number;
  visualViewportWidth?: number;
  visualViewportHeight?: number;
}

function pickVisibleDimension(candidates: number[]): number {
  const valid = candidates
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value));

  if (valid.length === 0) return 0;
  return Math.min(...valid);
}

export function resolveVisibleViewport(snapshot: ViewportSnapshot): { width: number; height: number } {
  return {
    width: pickVisibleDimension([
      snapshot.innerWidth ?? 0,
      snapshot.clientWidth ?? 0,
      snapshot.visualViewportWidth ?? 0,
    ]),
    height: pickVisibleDimension([
      snapshot.innerHeight ?? 0,
      snapshot.clientHeight ?? 0,
      snapshot.visualViewportHeight ?? 0,
    ]),
  };
}

export function getBrowserViewportFallback() {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }

  return resolveVisibleViewport({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    visualViewportWidth: window.visualViewport?.width ?? 0,
    visualViewportHeight: window.visualViewport?.height ?? 0,
  });
}
