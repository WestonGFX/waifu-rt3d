export interface LayoutDebugSnapshot {
  shellMode: 'split' | 'stacked';
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
  shellScrollWidth: number;
  shellScrollHeight: number;
  actualRenderedOverflowX: number;
  actualRenderedOverflowY: number;
  shellHorizontalOverflow: number;
  shellVerticalOverflow: number;
  viewerPercent: number;
  chatMinWidth: number;
  dpr: number;
  scale: number;
  windowInnerWidth: number;
  windowInnerHeight: number;
  documentClientWidth: number;
  documentClientHeight: number;
  visualViewportWidth: number;
  visualViewportHeight: number;
  effectiveViewportWidth: number;
  effectiveViewportHeight: number;
}

function formatDimension(width: number, height: number): string {
  return `${width} x ${height}`;
}

export function buildLayoutDebugLines(snapshot: LayoutDebugSnapshot): string[] {
  return [
    `mode ${snapshot.shellMode}`,
    `window ${formatDimension(snapshot.windowInnerWidth, snapshot.windowInnerHeight)}`,
    `client ${formatDimension(snapshot.documentClientWidth, snapshot.documentClientHeight)}`,
    `visual ${formatDimension(Math.round(snapshot.visualViewportWidth), Math.round(snapshot.visualViewportHeight))}`,
    `effective ${formatDimension(snapshot.effectiveViewportWidth, snapshot.effectiveViewportHeight)}`,
    `viewport ${formatDimension(snapshot.viewportWidth, snapshot.viewportHeight)}`,
    `content ${formatDimension(snapshot.contentWidth, snapshot.contentHeight)}`,
    `shell ${formatDimension(snapshot.shellScrollWidth, snapshot.shellScrollHeight)}`,
    `overflow ${formatDimension(snapshot.actualRenderedOverflowX, snapshot.actualRenderedOverflowY)}`,
    `shell overflow ${formatDimension(snapshot.shellHorizontalOverflow, snapshot.shellVerticalOverflow)}`,
    `dpr ${snapshot.dpr.toFixed(2)} | scale ${snapshot.scale.toFixed(2)}`,
    `viewer ${snapshot.viewerPercent}% | chat min ${snapshot.chatMinWidth}`,
  ];
}
