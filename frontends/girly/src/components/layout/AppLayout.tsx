import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useCompanion } from '../../context/CompanionContext.tsx';
import { useEnvironment } from '../../context/EnvironmentContext.tsx';
import { useModel } from '../../context/ModelContext.tsx';
import { useSettings } from '../../context/SettingsContext.tsx';
import {
  getProviderOptions,
  resolveCurrentRuntimeStatus,
  updateProviderOptions,
} from '../../services/llmRuntimeService.ts';
import { fetchModelLibrary } from '../../services/modelLibraryService.ts';
import {
  buildRecommendedProviderPatch,
  needsProviderPatch,
} from '../../services/modelRecommendationService.ts';
import { buildLayoutDebugLines } from './layoutDebug.ts';
import { resolveTwoColumnStageHeight } from './shellStage.ts';
import { getBrowserViewportFallback } from './viewportBounds.ts';
import ThreeViewer from '../viewer/ThreeViewer.tsx';
import ChatPanel from '../chat/ChatPanel.tsx';

/**
 * Lazy-load the Live2D viewer so pixi-live2d-display (which throws at
 * module evaluation time when the Cubism 2 SDK isn't present) doesn't
 * crash the entire app on startup.
 */
const Live2DViewer = lazy(() => import('../viewer/Live2DViewer.tsx'));
import VoiceCallOverlay from '../viewer/VoiceCallOverlay.tsx';
import useVoiceCall from '../../hooks/useVoiceCall.ts';

const VIEWER_MIN_WIDTH = 320;
const LIGHT_CHAT_MIN_WIDTH = 420;
const HEAVY_CHAT_MIN_WIDTH = 540;
const FLOATING_GAP = 16;
const FULLSCREEN_GAP = 0;
const STACKED_VIEWER_HEIGHT = 'clamp(18rem, 38dvh, 34rem)';
const FLOATING_PADDING = 16;
const FULLSCREEN_PADDING = 0;
const VIEWER_MIN_PERCENT = 30;

function getViewerPercentBounds(workspaceWidth: number, chatMinWidth: number) {
  if (workspaceWidth <= 0) {
    return { minPercent: 40, maxPercent: 40 };
  }

  const defaultMaxPercent = workspaceWidth >= 1680
    ? 52
    : workspaceWidth >= 1480
      ? 50
      : workspaceWidth >= 1280
        ? 48
        : workspaceWidth >= 1120
          ? 46
          : 42;
  const intrinsicMaxPercent = Math.floor(((workspaceWidth - chatMinWidth) / workspaceWidth) * 100);
  const maxPercent = Math.max(VIEWER_MIN_PERCENT, Math.min(defaultMaxPercent, intrinsicMaxPercent));
  return {
    minPercent: Math.min(VIEWER_MIN_PERCENT, maxPercent),
    maxPercent,
  };
}

function canUseTwoColumnWorkspace(workspaceWidth: number, chatMinWidth: number, gap: number): boolean {
  return workspaceWidth >= VIEWER_MIN_WIDTH + chatMinWidth + gap;
}

export default function AppLayout() {
  const { state: appState, dispatch: appDispatch } = useApp();
  const { state: companionState, activePersona } = useCompanion();
  const voiceCall = useVoiceCall();
  const { currentEnvironment } = useEnvironment();
  const { state: modelState, dispatch: modelDispatch } = useModel();
  const { state: settingsState, dispatch: settingsDispatch } = useSettings();

  const workspaceViewportRef = useRef<HTMLDivElement | null>(null);
  const workspaceContentRef = useRef<HTMLDivElement | null>(null);
  const viewerSectionRef = useRef<HTMLElement | null>(null);
  const chatSectionRef = useRef<HTMLElement | null>(null);
  const didAutoSelectPreferredModelRef = useRef(false);
  const isDraggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartPercentRef = useRef(0);

  const [viewportSize, setViewportSize] = useState(getBrowserViewportFallback);
  const [layoutMetrics, setLayoutMetrics] = useState({
    viewportWidth: 0,
    viewportHeight: 0,
    contentWidth: 0,
    contentHeight: 0,
    shellScrollWidth: 0,
    shellScrollHeight: 0,
    contentOverflowRight: 0,
    contentOverflowBottom: 0,
    viewerOverflowRight: 0,
    chatOverflowRight: 0,
    dpr: 1,
    scale: 1,
    windowInnerWidth: 0,
    windowInnerHeight: 0,
    documentClientWidth: 0,
    documentClientHeight: 0,
    visualViewportWidth: 0,
    visualViewportHeight: 0,
  });

  const gapPx = appState.shellStylePreference === 'fullscreen' ? FULLSCREEN_GAP : FLOATING_GAP;
  const baseShellPaddingPx = appState.shellStylePreference === 'fullscreen'
    ? FULLSCREEN_PADDING
    : viewportSize.width > 0 && viewportSize.width < 1120
      ? 10
      : viewportSize.width > 0 && viewportSize.width < 1480
        ? 12
        : FLOATING_PADDING;
  const activeThreadMessageCount = companionState.currentThreadId
    ? companionState.messagesByThread[companionState.currentThreadId]?.length ?? 0
    : 0;
  const hasHeavyRightColumn = activeThreadMessageCount > 0 || Boolean(currentEnvironment);
  const chatMinWidth = hasHeavyRightColumn ? HEAVY_CHAT_MIN_WIDTH : LIGHT_CHAT_MIN_WIDTH;
  const browserViewport = getBrowserViewportFallback();
  const effectiveViewportWidth = viewportSize.width > 0 ? viewportSize.width : browserViewport.width;
  const effectiveViewportHeight = viewportSize.height > 0 ? viewportSize.height : browserViewport.height;
  const intrinsicTwoColumn = canUseTwoColumnWorkspace(
    Math.max(0, effectiveViewportWidth - baseShellPaddingPx * 2),
    chatMinWidth,
    gapPx,
  );
  const shellPaddingPx = baseShellPaddingPx;
  const workspaceWidth = Math.max(0, effectiveViewportWidth - shellPaddingPx * 2);
  const viewerPercentBounds = getViewerPercentBounds(workspaceWidth, chatMinWidth);
  const safeViewerPercent = Math.min(
    viewerPercentBounds.maxPercent,
    Math.max(viewerPercentBounds.minPercent, settingsState.desktopViewerWidthPercent),
  );
  const shellHorizontalOverflow = Math.max(0, layoutMetrics.shellScrollWidth - layoutMetrics.viewportWidth);
  const shellVerticalOverflow = Math.max(0, layoutMetrics.shellScrollHeight - layoutMetrics.viewportHeight);
  const descendantHorizontalOverflow = Math.max(
    layoutMetrics.contentOverflowRight,
    layoutMetrics.viewerOverflowRight,
    layoutMetrics.chatOverflowRight,
  );
  const descendantVerticalOverflow = layoutMetrics.contentOverflowBottom;
  const brokenHorizontalClipping = layoutMetrics.viewportWidth > 0
    && shellHorizontalOverflow <= 8
    && descendantHorizontalOverflow > 8;
  const brokenVerticalClipping = layoutMetrics.viewportHeight > 0
    && shellVerticalOverflow <= 8
    && descendantVerticalOverflow > 48;
  const actualRenderedOverflowX = Math.max(shellHorizontalOverflow, descendantHorizontalOverflow);
  const actualRenderedOverflowY = Math.max(shellVerticalOverflow, descendantVerticalOverflow);
  const measuredTwoColumnOverflow = brokenHorizontalClipping;
  const twoColumnLayout = intrinsicTwoColumn && !measuredTwoColumnOverflow;
  const splitColumnWidth = Math.max(0, workspaceWidth - gapPx);
  const layoutPresentation = useMemo(() => {
    if (!twoColumnLayout) return 'stacked';
    if (workspaceWidth >= 1480 && effectiveViewportHeight >= 860) return 'wide';
    return 'compact';
  }, [effectiveViewportHeight, twoColumnLayout, workspaceWidth]);
  const constrainedViewport = effectiveViewportWidth > 0
    && (!intrinsicTwoColumn || brokenHorizontalClipping || brokenVerticalClipping);
  const twoColumnStageHeight = resolveTwoColumnStageHeight(effectiveViewportHeight, shellPaddingPx);
  const maxViewerWidth = Math.max(VIEWER_MIN_WIDTH, workspaceWidth - chatMinWidth - gapPx);
  const preferredViewerWidth = Math.round((workspaceWidth * safeViewerPercent) / 100);
  const viewerTrackWidth = twoColumnLayout
    ? Math.max(VIEWER_MIN_WIDTH, Math.min(maxViewerWidth, preferredViewerWidth))
    : 0;
  const unlockedChatMinWidth = chatMinWidth;
  const splitMinimumWidth = twoColumnLayout ? viewerTrackWidth + gapPx + unlockedChatMinWidth : 0;
  const chatTrackWidth = twoColumnLayout
    ? Math.max(unlockedChatMinWidth, workspaceWidth - viewerTrackWidth - gapPx)
    : workspaceWidth;

  useEffect(() => {
    const node = workspaceViewportRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const browserFallback = getBrowserViewportFallback();
      const nextWidth = Math.round(entry.contentRect.width > 0 ? entry.contentRect.width : browserFallback.width);
      const nextHeight = Math.round(entry.contentRect.height > 0 ? entry.contentRect.height : browserFallback.height);
      setViewportSize((previous) => (
        previous.width === nextWidth && previous.height === nextHeight
          ? previous
          : { width: nextWidth, height: nextHeight }
      ));
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewportNode = workspaceViewportRef.current;
    const contentNode = workspaceContentRef.current;
    if (!viewportNode || !contentNode || typeof ResizeObserver === 'undefined') return;

    let frameId: number | null = null;

    const commitMetrics = () => {
      const shell = viewportNode.closest('.app-shell') as HTMLElement | null;
      const viewportRect = viewportNode.getBoundingClientRect();
      const viewerRect = viewerSectionRef.current?.getBoundingClientRect();
      const chatRect = chatSectionRef.current?.getBoundingClientRect();
      const measureDescendantOverflowRight = (root: HTMLElement | null | undefined, boundaryRight: number) => {
        if (!root) return 0;
        let furthestRight = root.getBoundingClientRect().right;
        root.querySelectorAll<HTMLElement>('*').forEach((node) => {
          const rect = node.getBoundingClientRect();
          furthestRight = Math.max(furthestRight, rect.right);
        });
        return Math.max(0, Math.round(furthestRight - boundaryRight));
      };
      const furthestRight = Math.max(
        viewerRect?.right ?? viewportRect.left,
        chatRect?.right ?? viewportRect.left,
      );
      const furthestBottom = Math.max(
        viewerRect?.bottom ?? viewportRect.top,
        chatRect?.bottom ?? viewportRect.top,
      );
      const nextMetrics = {
        viewportWidth: Math.round(viewportNode.clientWidth),
        viewportHeight: Math.round(viewportNode.clientHeight),
        contentWidth: Math.round(contentNode.scrollWidth),
        contentHeight: Math.round(contentNode.scrollHeight),
        shellScrollWidth: shell?.scrollWidth ?? 0,
        shellScrollHeight: shell?.scrollHeight ?? 0,
        contentOverflowRight: Math.max(0, Math.round(furthestRight - viewportRect.right)),
        contentOverflowBottom: Math.max(0, Math.round(furthestBottom - viewportRect.bottom)),
        viewerOverflowRight: Math.max(
          0,
          (viewerSectionRef.current?.scrollWidth ?? 0) - (viewerSectionRef.current?.clientWidth ?? 0),
          measureDescendantOverflowRight(viewerSectionRef.current, viewerRect?.right ?? viewportRect.right),
        ),
        chatOverflowRight: Math.max(
          0,
          (chatSectionRef.current?.scrollWidth ?? 0) - (chatSectionRef.current?.clientWidth ?? 0),
          measureDescendantOverflowRight(chatSectionRef.current, chatRect?.right ?? viewportRect.right),
        ),
        dpr: window.devicePixelRatio || 1,
        scale: window.visualViewport?.scale ?? 1,
        windowInnerWidth: Math.round(window.innerWidth),
        windowInnerHeight: Math.round(window.innerHeight),
        documentClientWidth: Math.round(document.documentElement.clientWidth),
        documentClientHeight: Math.round(document.documentElement.clientHeight),
        visualViewportWidth: window.visualViewport?.width ?? 0,
        visualViewportHeight: window.visualViewport?.height ?? 0,
      };

      setLayoutMetrics((previous) => {
        const keys = Object.keys(nextMetrics) as Array<keyof typeof nextMetrics>;
        return keys.some((key) => previous[key] !== nextMetrics[key]) ? nextMetrics : previous;
      });
    };

    const updateMetrics = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        commitMetrics();
      });
    };

    const observer = new ResizeObserver(() => updateMetrics());
    observer.observe(viewportNode);
    observer.observe(contentNode);
    if (viewerSectionRef.current) observer.observe(viewerSectionRef.current);
    if (chatSectionRef.current) observer.observe(chatSectionRef.current);
    updateMetrics();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => updateMetrics());
    });

    window.addEventListener('resize', updateMetrics);
    window.visualViewport?.addEventListener('resize', updateMetrics);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
      window.removeEventListener('resize', updateMetrics);
      window.visualViewport?.removeEventListener('resize', updateMetrics);
    };
  }, []);

  useEffect(() => {
    if (didAutoSelectPreferredModelRef.current) return;
    if (modelState.modelUrl) {
      didAutoSelectPreferredModelRef.current = true;
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const library = await fetchModelLibrary(controller.signal);
        const preferredVrm = library.files.find((file) => file.name === 'Panicandy.vrm')
          ?? library.files.find((file) => file.ext === 'vrm')
          ?? null;

        if (!preferredVrm) return;
        if (modelState.modelUrl === preferredVrm.url) {
          didAutoSelectPreferredModelRef.current = true;
          return;
        }

        didAutoSelectPreferredModelRef.current = true;
        modelDispatch({ type: 'SET_MODEL_URL', payload: preferredVrm.url });
      } catch {
        // If the library is unavailable, keep the current avatar selection.
      }
    })();

    return () => controller.abort();
  }, [modelDispatch, modelState.modelUrl]);

  useEffect(() => {
    if (appState.providerConfig.llm.primary !== 'ollama') return;

    const currentOptions = getProviderOptions(appState.providerConfig, 'ollama');
    const runtime = resolveCurrentRuntimeStatus(companionState.runtimeStatuses, appState.providerConfig);
    if (!runtime?.online || runtime.models.length === 0) return;

    const defaultModelId = currentOptions.model
      ?? runtime.activeModelId
      ?? runtime.models.find((model) => model.loaded)?.id
      ?? runtime.models[0]?.id;
    if (!defaultModelId) return;

    const modelInfo = runtime.models.find((model) => model.id === defaultModelId) ?? runtime.models[0];
    const autoTuneEnabled = currentOptions.autoTune ?? true;
    const autoPatch = autoTuneEnabled
      ? buildRecommendedProviderPatch(modelInfo, companionState.helperCapabilities)
      : null;
    const nextOptions = {
      model: defaultModelId,
      ...(autoPatch ?? {}),
    };

    if (
      currentOptions.model === nextOptions.model
      && !needsProviderPatch(currentOptions, autoPatch)
    ) {
      return;
    }

    const nextConfig = updateProviderOptions(appState.providerConfig, 'ollama', nextOptions);
    appDispatch({ type: 'SET_PROVIDER_CONFIG', payload: nextConfig });
  }, [
    appDispatch,
    appState.providerConfig,
    companionState.helperCapabilities,
    companionState.runtimeStatuses,
  ]);

  useEffect(() => {
    const endDrag = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      activePointerIdRef.current = null;
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (
        !isDraggingRef.current
        || !workspaceViewportRef.current
        || (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current)
      ) {
        return;
      }
      const deltaX = event.clientX - dragStartXRef.current;
      const usableWidth = Math.max(1, workspaceViewportRef.current.getBoundingClientRect().width - shellPaddingPx * 2 - gapPx);
      const deltaPercent = (deltaX / usableWidth) * 100;
      const nextPercent = Math.min(
        viewerPercentBounds.maxPercent,
        Math.max(viewerPercentBounds.minPercent, dragStartPercentRef.current + deltaPercent),
      );
      settingsDispatch({ type: 'SET_DESKTOP_VIEWER_WIDTH_PERCENT', payload: Math.round(nextPercent) });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return;
      endDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [gapPx, settingsDispatch, shellPaddingPx, viewerPercentBounds.maxPercent, viewerPercentBounds.minPercent]);

  const startHorizontalResize = useCallback((event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => {
    if (!workspaceViewportRef.current || !twoColumnLayout) return;
    event.preventDefault();
    isDraggingRef.current = true;
    dragStartXRef.current = event.clientX;
    dragStartPercentRef.current = safeViewerPercent;
    if ('pointerId' in event) {
      activePointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } else {
      activePointerIdRef.current = null;
    }
    document.body.style.setProperty('cursor', 'col-resize');
    document.body.style.setProperty('user-select', 'none');
  }, [safeViewerPercent, twoColumnLayout]);

  const handleShellWheelCapture = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    const shell = event.currentTarget;
    const maxScrollLeft = shell.scrollWidth - shell.clientWidth;
    const maxScrollTop = shell.scrollHeight - shell.clientHeight;

    if (maxScrollLeft <= 1 && maxScrollTop <= 1) return;

    const previousLeft = shell.scrollLeft;
    const previousTop = shell.scrollTop;
    const clampScrollDelta = (delta: number, multiplier: number, cap: number) => {
      const scaled = delta * multiplier;
      if (Math.abs(scaled) <= 0.1) return 0;
      return Math.sign(scaled) * Math.min(Math.abs(scaled), cap);
    };
    const rawHorizontalDelta = event.deltaX + (event.shiftKey ? event.deltaY : 0);
    const rawVerticalDelta = event.shiftKey ? 0 : event.deltaY;
    const horizontalDelta = clampScrollDelta(rawHorizontalDelta, 0.38, 42);
    const verticalDelta = clampScrollDelta(rawVerticalDelta, 0.5, 64);
    const hasHorizontalIntent = Math.abs(rawHorizontalDelta) > 0.1;
    const hasVerticalIntent = Math.abs(rawVerticalDelta) > 0.1 && maxScrollTop > 1;

    if (maxScrollLeft > 1 && horizontalDelta !== 0) {
      shell.scrollLeft = Math.min(maxScrollLeft, Math.max(0, previousLeft + horizontalDelta));
    }

    if (hasVerticalIntent && verticalDelta !== 0) {
      shell.scrollTop = Math.min(maxScrollTop, Math.max(0, previousTop + verticalDelta));
    }

    if (
      shell.scrollLeft !== previousLeft
      || shell.scrollTop !== previousTop
      || hasHorizontalIntent
    ) {
      event.preventDefault();
    }
  }, []);

  const shellStyle = appState.shellStylePreference;
  const viewerSurfaceClass = twoColumnLayout
    ? 'shell-surface shell-surface--strong shell-surface--shared-height shell-surface--split-card'
    : shellStyle === 'floating'
    ? 'shell-surface shell-surface--strong shell-surface--floating'
    : 'shell-surface shell-surface--strong shell-surface--fullscreen';
  const chatSurfaceClass = twoColumnLayout
    ? 'shell-region shell-region--chat shell-region--shared-height shell-region--split-card'
    : shellStyle === 'floating'
    ? 'shell-region shell-region--chat shell-region--floating'
    : 'shell-region shell-region--chat shell-region--fullscreen';
  const showLayoutDebug = appState.devMode
    && typeof window !== 'undefined'
    && window.localStorage.getItem('animegirly_layout_debug') === '1';
  const layoutDebugLines = showLayoutDebug
    ? buildLayoutDebugLines({
      shellMode: twoColumnLayout ? 'split' : 'stacked',
      viewportWidth: layoutMetrics.viewportWidth,
      viewportHeight: layoutMetrics.viewportHeight,
      contentWidth: layoutMetrics.contentWidth,
      contentHeight: layoutMetrics.contentHeight,
      shellScrollWidth: layoutMetrics.shellScrollWidth,
      shellScrollHeight: layoutMetrics.shellScrollHeight,
      actualRenderedOverflowX,
      actualRenderedOverflowY,
      shellHorizontalOverflow,
      shellVerticalOverflow,
      viewerPercent: safeViewerPercent,
      chatMinWidth,
      dpr: layoutMetrics.dpr,
      scale: layoutMetrics.scale,
      windowInnerWidth: layoutMetrics.windowInnerWidth,
      windowInnerHeight: layoutMetrics.windowInnerHeight,
      documentClientWidth: layoutMetrics.documentClientWidth,
      documentClientHeight: layoutMetrics.documentClientHeight,
      visualViewportWidth: layoutMetrics.visualViewportWidth,
      visualViewportHeight: layoutMetrics.visualViewportHeight,
      effectiveViewportWidth,
      effectiveViewportHeight,
    })
    : [];
  const resizeEdgeLeft = shellPaddingPx + Math.round((splitColumnWidth * safeViewerPercent) / 100 + gapPx / 2);

  return (
    <div
      className="app-shell"
      data-shell-style={shellStyle}
      data-shell-mode={twoColumnLayout ? 'split' : 'stacked'}
      data-shell-constrained={constrainedViewport ? 'true' : 'false'}
      data-shell-presentation={layoutPresentation}
      onWheelCapture={handleShellWheelCapture}
    >
      {/* ── Frontend Switcher ─────────────────────── */}
      <div style={{
        position: 'fixed', top: 8, left: 8, zIndex: 50,
        display: 'flex', gap: 3, padding: '3px 6px',
        background: 'color-mix(in srgb, var(--shell-panel-strong, #1e1e2e) 85%, transparent)',
        borderRadius: 14, backdropFilter: 'blur(8px)',
        border: '1px solid color-mix(in srgb, var(--shell-border-strong, #313244) 40%, transparent)',
      }}>
        {[
          { id: 'neon', label: 'Neon', path: '/' },
          { id: 'sakura', label: 'Sakura', path: '/sakura/' },
          { id: 'nova', label: 'Nova', path: '/nova/' },
          { id: 'girly', label: 'Girly', path: '/girly/' },
        ].map(fe => (
          <button
            key={fe.id}
            onClick={() => { if (fe.id !== 'girly') window.location.href = fe.path; }}
            style={{
              padding: '2px 8px', fontSize: '0.55rem',
              fontWeight: fe.id === 'girly' ? 700 : 500,
              borderRadius: 10, border: 'none',
              cursor: fe.id === 'girly' ? 'default' : 'pointer',
              background: fe.id === 'girly'
                ? 'color-mix(in srgb, var(--anime-500, #f0a0c0) 20%, transparent)'
                : 'transparent',
              color: fe.id === 'girly'
                ? 'var(--anime-500, #f0a0c0)'
                : 'var(--text-muted, #6c7086)',
              transition: 'all 150ms ease',
            }}
          >
            {fe.label}
          </button>
        ))}
      </div>
      <div
        ref={workspaceViewportRef}
        className="h-full w-full min-w-0 overflow-visible"
      >
        <div
          className="relative min-h-full w-full min-w-0 overflow-visible"
          style={{
            padding: `${shellPaddingPx}px`,
          }}
        >
          <div
            ref={workspaceContentRef}
            className={twoColumnLayout
              ? 'grid min-h-full min-w-0 items-stretch'
              : 'flex min-h-full min-w-0 flex-col'}
            style={twoColumnLayout
              ? {
                  gap: `${gapPx}px`,
                  gridTemplateColumns: `${viewerTrackWidth}px minmax(${unlockedChatMinWidth}px, 1fr)`,
                  minHeight: `${twoColumnStageHeight}px`,
                  width: `max(100%, ${splitMinimumWidth}px)`,
                }
              : {
                  gap: `${gapPx}px`,
                  minHeight: `calc(${STACKED_VIEWER_HEIGHT} + 28rem)`,
                }}
          >
          <section
            ref={viewerSectionRef}
            className={`${viewerSurfaceClass} relative min-h-0 min-w-0 overflow-hidden`}
            data-surface-role="viewer"
            style={twoColumnLayout
              ? {
                  height: `${twoColumnStageHeight}px`,
                  minHeight: `${twoColumnStageHeight}px`,
                  maxHeight: `${twoColumnStageHeight}px`,
                  alignSelf: 'stretch',
                }
              : {
                  minHeight: STACKED_VIEWER_HEIGHT,
                  height: STACKED_VIEWER_HEIGHT,
                }}
          >
            {appState.renderMode === 'live2d'
              ? (modelState.live2dModelUrl
                ? <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-text-muted">Loading Live2D…</div>}>
                    <Live2DViewer modelUrl={modelState.live2dModelUrl} />
                  </Suspense>
                : <div className="flex h-full items-center justify-center text-center text-sm text-text-muted px-4">
                    <div>
                      <p className="font-medium">No Live2D model loaded</p>
                      <p className="mt-1 text-xs">Import a .model3.json file from the Model Manager settings panel.</p>
                    </div>
                  </div>)
              : <ThreeViewer />}
          </section>

          <section
            ref={chatSectionRef}
            className={`${chatSurfaceClass} min-h-0 min-w-0 overflow-visible`}
            data-surface-role="controls"
            style={twoColumnLayout
              ? {
                  height: `${twoColumnStageHeight}px`,
                  minHeight: `${twoColumnStageHeight}px`,
                  maxHeight: `${twoColumnStageHeight}px`,
                  minWidth: `${unlockedChatMinWidth}px`,
                  overflowY: 'hidden',
                  overflowX: 'hidden',
                  alignSelf: 'stretch',
                }
              : {
                  minHeight: 0,
                }}
          >
            <ChatPanel
              layoutMode={twoColumnLayout ? 'two-column' : 'single-column'}
              initialWorkspaceWidth={twoColumnLayout ? chatTrackWidth : workspaceWidth}
              initialWorkspaceHeight={twoColumnLayout ? twoColumnStageHeight : effectiveViewportHeight}
            />
          </section>
          </div>
          {twoColumnLayout ? (
            <div
              className="shell-resize-edge shell-resize-edge--vertical"
              style={{ left: `${resizeEdgeLeft}px` }}
              onPointerDown={startHorizontalResize}
              onMouseDown={startHorizontalResize}
              onDoubleClick={() => settingsDispatch({ type: 'SET_DESKTOP_VIEWER_WIDTH_PERCENT', payload: 40 })}
              aria-hidden="true"
            >
              <div className="shell-resize-edge__handle" />
            </div>
          ) : null}
          {showLayoutDebug ? (
            <div className="pointer-events-none absolute bottom-3 left-3 z-40 max-w-[22rem] rounded-[16px] border border-[color:var(--shell-border-strong)] bg-[color:var(--shell-panel-strong)]/90 px-3 py-2 text-[10px] leading-5 text-text-muted shadow-[var(--shell-shadow-soft)] backdrop-blur-xl">
              <div className="font-semibold uppercase tracking-[0.18em] text-anime-600">Layout debug</div>
              {layoutDebugLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
              <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-text-muted/80">
                set <code>localStorage.animegirly_layout_debug = '1'</code> in dev mode
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <VoiceCallOverlay
        isActive={voiceCall.isActive}
        phase={voiceCall.phase}
        personaName={activePersona?.name ?? 'Companion'}
        lastTranscript={voiceCall.lastTranscript}
        onStart={voiceCall.startCall}
        onStop={voiceCall.stopListening}
        onMuteToggle={voiceCall.toggleMute}
        isMuted={voiceCall.isMuted}
        onEnd={voiceCall.endCall}
      />
    </div>
  );
}
