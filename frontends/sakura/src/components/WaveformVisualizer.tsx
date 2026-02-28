import { useEffect, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface WaveformVisualizerProps {
  /**
   * Ref to the HTMLAudioElement being visualized.
   * The component attaches a Web Audio API analyser to this element.
   * The ref value may be null on initial render; the effect re-runs
   * when it becomes non-null.
   */
  audioRef: React.RefObject<HTMLAudioElement | null>;
  /**
   * When true the canvas is rendered and the rAF loop runs.
   * When false the component returns null (clean unmount).
   */
  playing: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/** Number of frequency bins — must be half of fftSize. */
const BAR_COUNT = 32;
const FFT_SIZE = BAR_COUNT * 2; // 64
const BAR_WIDTH = 3;
const BAR_GAP = 1;
const CANVAS_HEIGHT = 32;

/* ═══════════════════════════════════════════════════════════════════════
   Module-level WeakMap — tracks which audio elements are already connected
   to an AudioContext source node so we never call createMediaElementSource
   more than once per element.
   ═══════════════════════════════════════════════════════════════════════ */

interface AudioBinding {
  ctx: AudioContext;
  analyser: AnalyserNode;
}

/**
 * Maps each HTMLAudioElement to the AudioContext + AnalyserNode pair created
 * for it.  Using a WeakMap avoids memory leaks — entries are collected when
 * the audio element itself is garbage-collected.
 */
const audioBindings = new WeakMap<HTMLAudioElement, AudioBinding>();

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Animated frequency bar chart rendered on a `<canvas>` element.
 *
 * Uses the Web Audio API AnalyserNode to read frequency magnitude data from
 * the TTS audio element in real time.
 *
 * Key design decisions:
 * - `createMediaElementSource` is idempotent per element thanks to the
 *   module-level `audioBindings` WeakMap.  A second call on the same element
 *   would throw `InvalidStateError`; we guard against that here.
 * - The AudioContext is created lazily on first `playing=true` render to
 *   comply with browser autoplay policies (context must be created or resumed
 *   inside a user-gesture flow, which TTS playback satisfies).
 * - The rAF loop is cancelled on unmount / when `playing` becomes false.
 * - Canvas width is set dynamically to fill the parent container.
 *
 * @param audioRef - Ref to the TTS HTMLAudioElement.
 * @param playing  - True while TTS audio is actively playing.
 */
export function WaveformVisualizer({ audioRef, playing }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** RAF handle so we can cancel the animation loop on cleanup. */
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;

    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    /* ── 1. Retrieve or create the AudioContext + AnalyserNode ── */
    let binding = audioBindings.get(audio);

    if (!binding) {
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.75;

        // Wire: source → analyser → speakers
        source.connect(analyser);
        analyser.connect(ctx.destination);

        binding = { ctx, analyser };
        audioBindings.set(audio, binding);
      } catch (err) {
        // InvalidStateError: already connected via a different context, or
        // browser does not support Web Audio.  Fail silently — the audio
        // still plays; we just cannot visualize it.
        console.warn('[WaveformVisualizer] Could not create audio binding:', err);
        return;
      }
    }

    const { ctx, analyser } = binding;

    // Resume the AudioContext if it was suspended (autoplay policy).
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        console.warn('[WaveformVisualizer] AudioContext resume failed.');
      });
    }

    /* ── 2. Resolve the accent color for bar fills ── */
    const accentColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-accent')
        .trim() || '#a78bfa';

    /* ── 3. rAF draw loop ── */
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      const { width, height } = canvas;
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return;

      analyser.getByteFrequencyData(dataArray);

      // Clear frame
      ctx2d.clearRect(0, 0, width, height);

      const step = Math.floor(dataArray.length / BAR_COUNT);
      const totalBarsWidth = BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * BAR_GAP;
      // Center the bar chart horizontally in the canvas.
      const startX = Math.max(0, (width - totalBarsWidth) / 2);

      for (let i = 0; i < BAR_COUNT; i++) {
        // Average a few neighbouring bins per bar for smoother appearance.
        let sum = 0;
        for (let j = 0; j < step; j++) {
          sum += dataArray[i * step + j] ?? 0;
        }
        const magnitude = sum / step; // 0–255

        // Minimum bar height of 2px so silent bars are still visible.
        const barHeight = Math.max(2, (magnitude / 255) * height);

        const x = startX + i * (BAR_WIDTH + BAR_GAP);
        const y = height - barHeight;

        ctx2d.fillStyle = accentColor;
        // Fade opacity based on magnitude for depth effect.
        ctx2d.globalAlpha = 0.4 + (magnitude / 255) * 0.6;
        ctx2d.beginPath();
        ctx2d.roundRect(x, y, BAR_WIDTH, barHeight, [1, 1, 0, 0]);
        ctx2d.fill();
      }

      ctx2d.globalAlpha = 1;
    };

    draw();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playing, audioRef]);

  // When not playing, render nothing so the canvas is cleanly removed.
  if (!playing) return null;

  return (
    <canvas
      ref={canvasRef}
      width={BAR_COUNT * (BAR_WIDTH + BAR_GAP)}
      height={CANVAS_HEIGHT}
      aria-hidden="true"
      style={{
        display: 'block',
        width: '100%',
        height: `${CANVAS_HEIGHT}px`,
        // canvas element uses explicit width/height attrs for pixel density;
        // the CSS width stretches it to fill the container.
      }}
    />
  );
}
