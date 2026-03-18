type LayoutMode = 'two-column' | 'single-column';

export interface ChatLayoutProfile {
  compactWorkspace: boolean;
  veryCompactWorkspace: boolean;
  toolbarCompact: boolean;
  headerCompact: boolean;
  showHeaderInsightPane: boolean;
  showCompactHeaderInsight: boolean;
  condenseDesktopHeader: boolean;
  utilityTrayHeightStyle: { height?: string; minHeight?: string; maxHeight?: string };
}

type ExpandedTrayKind = 'none' | 'settings' | 'utility';

function clampPx(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function resolveChatLayoutProfile(
  layoutMode: LayoutMode,
  workspaceWidth: number,
  workspaceHeight: number,
  expandedTrayKind: ExpandedTrayKind,
): ChatLayoutProfile {
  const widthUnknown = workspaceWidth === 0;
  const heightUnknown = workspaceHeight === 0;
  const crampedDesktopHeight = workspaceHeight > 0 && workspaceHeight < 820;
  const crampedDesktopWidth = workspaceWidth > 0 && workspaceWidth < 980;
  const desktopSettingsStress = layoutMode === 'two-column' && expandedTrayKind !== 'none';
  const compactWorkspace = workspaceWidth > 0 && workspaceWidth < 680;
  const veryCompactWorkspace = workspaceWidth > 0 && workspaceWidth < 560;
  const toolbarCompact = workspaceWidth > 0 && workspaceWidth < 800;
  const headerCompact = workspaceWidth > 0
    && (crampedDesktopWidth || crampedDesktopHeight || desktopSettingsStress);
  const showHeaderInsightPane = !desktopSettingsStress
    && (widthUnknown || (workspaceWidth >= 1020 && (heightUnknown || workspaceHeight >= 760)));
  const showCompactHeaderInsight = !showHeaderInsightPane;
  const condenseDesktopHeader = layoutMode === 'two-column'
    && (widthUnknown || (workspaceWidth >= 920 && (heightUnknown || workspaceHeight >= 700)));

  if (layoutMode === 'two-column') {
    if (expandedTrayKind !== 'none') {
      const openHeight = expandedTrayKind === 'settings'
        ? (workspaceHeight > 0 ? clampPx(workspaceHeight * 0.84, 620, 860) : 700)
        : (workspaceHeight > 0 ? clampPx(workspaceHeight * 0.4, 288, 372) : 324);
      return {
        compactWorkspace,
        veryCompactWorkspace,
        toolbarCompact,
        headerCompact,
        showHeaderInsightPane,
        showCompactHeaderInsight,
        condenseDesktopHeader,
        utilityTrayHeightStyle: {
          height: `${openHeight}px`,
          minHeight: `${openHeight}px`,
          maxHeight: `${openHeight}px`,
        },
      };
    }

    const collapsedHeight = workspaceHeight > 0 ? clampPx(workspaceHeight * 0.082, 64, 78) : 70;
    return {
      compactWorkspace,
      veryCompactWorkspace,
      toolbarCompact,
      headerCompact,
      showHeaderInsightPane,
      showCompactHeaderInsight,
      condenseDesktopHeader,
      utilityTrayHeightStyle: {
        height: `${collapsedHeight}px`,
      },
    };
  }

  return {
    compactWorkspace,
    veryCompactWorkspace,
    toolbarCompact,
    headerCompact,
    showHeaderInsightPane,
    showCompactHeaderInsight,
    condenseDesktopHeader,
    utilityTrayHeightStyle: expandedTrayKind !== 'none'
      ? { maxHeight: 'min(56dvh, 38rem)' }
      : { height: 'clamp(7rem, 19dvh, 11.5rem)' },
  };
}
