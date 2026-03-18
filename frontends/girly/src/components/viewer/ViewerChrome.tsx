import { useEffect } from 'react';
import { Pause, Play } from 'lucide-react';

export type ViewerChromeCameraMode = 'orbit' | 'freelook';
export type ViewerChromeNotice = 'freelook' | 'paused' | null;

const VIEWER_NOTICE_DURATION_MS = 6000;

interface ViewerChromeProps {
  cameraMode: ViewerChromeCameraMode;
  renderPaused: boolean;
  viewerNotice: ViewerChromeNotice;
  onSetCameraMode: (mode: ViewerChromeCameraMode) => void;
  onResetView: () => void;
  onToggleRenderPaused: () => void;
  onDismissNotice: () => void;
}

const selectedControlClass =
  'bg-[color:var(--control-bg-hover)] text-text-primary shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--control-border-soft)_72%,transparent)]';
const idleControlClass =
  'text-text-secondary hover:bg-[color:var(--control-bg-hover)] hover:text-text-primary';

export default function ViewerChrome({
  cameraMode,
  renderPaused,
  viewerNotice,
  onSetCameraMode,
  onResetView,
  onToggleRenderPaused,
  onDismissNotice,
}: ViewerChromeProps) {
  useEffect(() => {
    if (!viewerNotice) return undefined;

    const timer = window.setTimeout(() => {
      onDismissNotice();
    }, VIEWER_NOTICE_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [onDismissNotice, viewerNotice]);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-center">
        <div className="pointer-events-auto motion-panel inline-flex max-w-full items-center gap-1 rounded-pill border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg)] p-1 shadow-[var(--control-shadow)] backdrop-blur-md">
          <button
            type="button"
            onClick={() => onSetCameraMode('orbit')}
            className={[
              'rounded-pill px-3 py-1.5 text-[11px] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-duration-micro)] ease-[var(--motion-ease-standard)] active:scale-[var(--motion-scale-press)]',
              cameraMode === 'orbit' ? selectedControlClass : idleControlClass,
            ].join(' ')}
          >
            Orbit
          </button>
          <button
            type="button"
            onClick={() => onSetCameraMode('freelook')}
            className={[
              'rounded-pill px-3 py-1.5 text-[11px] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-duration-micro)] ease-[var(--motion-ease-standard)] active:scale-[var(--motion-scale-press)]',
              cameraMode === 'freelook' ? selectedControlClass : idleControlClass,
            ].join(' ')}
          >
            Free look
          </button>
          <button
            type="button"
            onClick={onResetView}
            className={`rounded-pill px-3 py-1.5 text-[11px] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-duration-micro)] ease-[var(--motion-ease-standard)] active:scale-[var(--motion-scale-press)] ${idleControlClass}`}
          >
            Reset view
          </button>
          <div className="mx-1 h-5 w-px bg-[color:var(--control-border-soft)]" aria-hidden="true" />
          <button
            type="button"
            onClick={onToggleRenderPaused}
            aria-label={renderPaused ? 'Resume viewer rendering' : 'Pause viewer rendering'}
            title={renderPaused ? 'Resume viewer' : 'Pause viewer'}
            className={[
              'inline-flex h-8 w-8 items-center justify-center rounded-full border transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-duration-micro)] ease-[var(--motion-ease-standard)] active:scale-[var(--motion-scale-press)]',
              renderPaused
                ? 'border-anime-200 bg-anime-100/92 text-anime-700 hover:bg-anime-200/90'
                : 'border-[color:var(--control-border-soft)] bg-[color:var(--control-bg-hover)] text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            {renderPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {viewerNotice === 'freelook' && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
          <button
            type="button"
            onClick={onDismissNotice}
            aria-label="Dismiss free look notice"
            className="pointer-events-auto motion-panel max-w-[28rem] rounded-2xl border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg)] px-4 py-3 text-left text-[11px] leading-5 text-text-secondary shadow-[var(--control-shadow)] backdrop-blur-md transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-standard)] hover:bg-[color:var(--control-bg-hover)] active:scale-[var(--motion-scale-press)]"
          >
            <span className="motion-content block text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-500">Free look</span>
            <span className="motion-content mt-1 block">
              Drag to look around. Use <span className="font-semibold text-text-primary">WASD</span> or arrow keys to move, <span className="font-semibold text-text-primary">Q/E</span> to rise or lower, and the mouse wheel to nudge forward or backward.
            </span>
            <span className="motion-content mt-2 block text-[10px] text-text-muted">Click to dismiss or wait a moment.</span>
          </button>
        </div>
      )}

      {viewerNotice === 'paused' && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
          <button
            type="button"
            onClick={onDismissNotice}
            aria-label="Dismiss viewer paused notice"
            className="pointer-events-auto motion-panel max-w-[24rem] rounded-2xl border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg)] px-4 py-3 text-left text-[11px] leading-5 text-text-secondary shadow-[var(--control-shadow)] backdrop-blur-md transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-standard)] hover:bg-[color:var(--control-bg-hover)] active:scale-[var(--motion-scale-press)]"
          >
            <span className="motion-content block text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-500">Viewer paused</span>
            <span className="motion-content mt-1 block">
              Viewer rendering is paused. Resume when you want animation and room motion back.
            </span>
            <span className="motion-content mt-2 block text-[10px] text-text-muted">Click to dismiss or wait a moment.</span>
          </button>
        </div>
      )}
    </>
  );
}
