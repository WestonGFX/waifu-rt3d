/**
 * TwoDViewer – Canvas-based 2D avatar renderer.
 *
 * Drop-in alternative to {@link ThreeViewer}.  Draws a procedural anime-style
 * avatar using only the Canvas 2D API – no images, SVG or network requests.
 *
 * Three animation states are driven by ChatContext signals:
 *   - **IDLE**      – gentle float + breathe; smile + blush visible.
 *   - **THINKING**  – speech bubble with pulsing dots; purple glow; blush fades.
 *   - **TALKING**   – mouth oscillates open/closed; auto-reverts to idle after 4 s.
 *
 * FPS cap (30) and telemetry dispatch mirror {@link ThreeViewer} exactly so that
 * the Dev-Mode panel shows consistent metrics regardless of render mode.
 */

import { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { resolveAvatarPresentation } from '../../services/avatarPerformanceService.ts';

/* ── constants ────────────────────────────────────────────────────── */

/** Target frame-rate – must match ThreeViewer. */
const TARGET_FPS       = 30;
/** Minimum ms between drawn frames. */
const FRAME_INTERVAL   = 1000 / TARGET_FPS;
/** Rolling FPS sample window length – must match ThreeViewer. */
const FPS_SAMPLE_SIZE  = 60;
/** Per-frame opacity lerp factor – yields ≈ 300 ms crossfade @ 30 FPS. */
const LERP_FACTOR      = 0.08;
/* ── palette ──────────────────────────────────────────────────────── */

/**
 * Design-token hex values used for every avatar colour.  Centralised so
 * palette tweaks are a single diff.
 */
const C = {
  hair      : '#8b5cf6',   // anime-500
  hairHL    : '#c4b5fd',   // anime-300 – highlight strand
  collar    : '#ddd1ff',   // anime-200
  top       : '#ede5ff',   // anime-100 – torso fill
  bubbleStr : '#ddd1ff',   // anime-200 – bubble stroke
  mouth     : '#fb7185',   // rose-pastel-400
  eyebrow   : '#fb7185',   // rose-pastel-400
  skin      : '#f5deb3',   // wheat – only non-token colour
};

/* ── pure helpers ─────────────────────────────────────────────────── */

/**
 * Linear interpolation.
 * @param a - Current value.
 * @param b - Target value.
 * @param t - Factor in [0, 1].
 * @returns Value moved from *a* toward *b* by *t*.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Traces a rounded-rectangle **path** on *ctx* (does not stroke or fill).
 * @param ctx - 2-D context.
 * @param x   - Left edge.
 * @param y   - Top edge.
 * @param w   - Width.
 * @param h   - Height.
 * @param r   - Corner radius.
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y,         x + r, y);
  ctx.closePath();
}

/* ── drawing ──────────────────────────────────────────────────────── */

/** Current lerped opacity triple threaded through every draw call. */
interface Opacities { idle: number; think: number; talk: number; }

/**
 * Orchestrator – clears the canvas, positions the avatar (with float
 * offset) and invokes every drawing layer in painters order (back → front).
 *
 * @param ctx - 2-D context (already DPR-scaled via setTransform).
 * @param W   - Logical canvas width (CSS pixels).
 * @param H   - Logical canvas height (CSS pixels).
 * @param t   - Timestamp in ms (drives continuous sin-based animations).
 * @param ops - Lerped animation opacities for the current frame.
 */
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  W: number, H: number, t: number, ops: Opacities,
): void {
  ctx.save();
  ctx.clearRect(0, 0, W, H);

  /* ── layout metrics (all derived from face radius) ── */
  const faceR  = Math.min(W, H) * 0.175;
  const cx     = W  / 2;
  const headCY = H  * 0.38 + Math.sin(t * 0.002) * 3;  // vertical float ±3 px
  const bodyCY = headCY + faceR * 2.6;

  // torso breathe – different freq prevents phase-locking with float
  const breatheExtra = Math.sin(t * 0.003);             // ±1 px on waist

  /* ── 1  Thinking glow (conditional) ── */
  if (ops.think > 0.01) {
    const pulseA = (0.5 + 0.5 * Math.sin(t * 0.005)) * ops.think * 0.35;
    const g = ctx.createRadialGradient(cx, headCY, faceR * 0.2, cx, headCY, faceR * 2.2);
    g.addColorStop(0, `rgba(167,139,250,${pulseA})`);   // anime-400 centre
    g.addColorStop(1, 'rgba(167,139,250,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ── 2  Hair back ── */
  ctx.fillStyle = C.hair;
  ctx.beginPath();
  ctx.ellipse(cx, headCY + faceR * 0.1, faceR * 1.25, faceR * 1.3, 0, 0, Math.PI * 2);
  ctx.fill();

  /* ── 3  Hair side curtains ── */
  ctx.fillStyle = C.hair;
  // left curtain
  ctx.beginPath();
  ctx.moveTo(cx - faceR * 0.9,  headCY);
  ctx.quadraticCurveTo(cx - faceR * 1.6, headCY + faceR * 1.2,  cx - faceR * 1.1,  headCY + faceR * 2.0);
  ctx.lineTo(cx - faceR * 0.7,  headCY + faceR * 1.8);
  ctx.quadraticCurveTo(cx - faceR * 1.0, headCY + faceR * 0.8,  cx - faceR * 0.6,  headCY + faceR * 0.1);
  ctx.closePath();
  ctx.fill();
  // right curtain (mirrored)
  ctx.beginPath();
  ctx.moveTo(cx + faceR * 0.9,  headCY);
  ctx.quadraticCurveTo(cx + faceR * 1.6, headCY + faceR * 1.2,  cx + faceR * 1.1,  headCY + faceR * 2.0);
  ctx.lineTo(cx + faceR * 0.7,  headCY + faceR * 1.8);
  ctx.quadraticCurveTo(cx + faceR * 1.0, headCY + faceR * 0.8,  cx + faceR * 0.6,  headCY + faceR * 0.1);
  ctx.closePath();
  ctx.fill();

  /* ── 4  Neck ── */
  ctx.fillStyle = C.skin;
  ctx.fillRect(cx - faceR * 0.2, headCY + faceR * 0.85, faceR * 0.4, faceR * 0.55);

  /* ── 5  Body / torso ── */
  const shoulderW = faceR * 1.3;
  const waistW    = faceR * 0.95 + breatheExtra;
  const torsoH    = faceR * 1.4;
  const torsoY    = bodyCY - torsoH * 0.4;
  // trapezoid fill
  ctx.fillStyle = C.top;
  ctx.beginPath();
  ctx.moveTo(cx - shoulderW, torsoY);
  ctx.lineTo(cx + shoulderW, torsoY);
  ctx.lineTo(cx + waistW,    torsoY + torsoH);
  ctx.lineTo(cx - waistW,    torsoY + torsoH);
  ctx.closePath();
  ctx.fill();
  // V-collar accent
  ctx.strokeStyle = C.collar;
  ctx.lineWidth   = faceR * 0.06;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - faceR * 0.35, torsoY);
  ctx.lineTo(cx,                torsoY + faceR * 0.35);
  ctx.lineTo(cx + faceR * 0.35, torsoY);
  ctx.stroke();

  /* ── 6  Face ── */
  ctx.fillStyle = C.skin;
  ctx.beginPath();
  ctx.arc(cx, headCY, faceR, 0, Math.PI * 2);
  ctx.fill();

  /* ── 7  Hair front bangs ── */
  ctx.fillStyle = C.hair;
  ctx.beginPath();
  ctx.moveTo(cx - faceR * 1.05, headCY - faceR * 0.55);
  ctx.quadraticCurveTo(cx - faceR * 0.6,  headCY - faceR * 0.15, cx - faceR * 0.15, headCY - faceR * 0.45);
  ctx.quadraticCurveTo(cx + faceR * 0.1,  headCY - faceR * 0.7,  cx + faceR * 0.3,  headCY - faceR * 0.3);
  ctx.quadraticCurveTo(cx + faceR * 0.55, headCY - faceR * 0.05, cx + faceR * 0.85, headCY - faceR * 0.5);
  ctx.lineTo(cx + faceR * 0.95,  headCY - faceR * 0.9);
  ctx.quadraticCurveTo(cx + faceR * 0.2,  headCY - faceR * 1.15, cx - faceR * 0.2,  headCY - faceR * 1.0);
  ctx.lineTo(cx - faceR * 1.05,  headCY - faceR * 0.55);
  ctx.closePath();
  ctx.fill();
  // highlight strand – lighter value of hair colour
  ctx.fillStyle = C.hairHL;
  ctx.beginPath();
  ctx.moveTo(cx - faceR * 0.05,  headCY - faceR * 0.85);
  ctx.quadraticCurveTo(cx + faceR * 0.15, headCY - faceR * 0.55, cx + faceR * 0.05, headCY - faceR * 0.25);
  ctx.quadraticCurveTo(cx - faceR * 0.08, headCY - faceR * 0.55, cx - faceR * 0.05, headCY - faceR * 0.85);
  ctx.closePath();
  ctx.fill();

  /* ── 8  Eyes ── (oversized anime style: ¼ face-diameter each) */
  const eyeR   = faceR * 0.235;
  const eyeGap = faceR * 0.42;      // half-distance between eye centres
  const eyeY   = headCY + faceR * 0.05;

  for (const sign of [-1, 1]) {
    const ex = cx + sign * eyeGap;
    // sclera
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, eyeR, eyeR * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    // iris
    ctx.fillStyle = C.hair;                               // anime-500
    ctx.beginPath();
    ctx.arc(ex, eyeY, eyeR * 0.6, 0, Math.PI * 2);
    ctx.fill();
    // pupil
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(ex, eyeY, eyeR * 0.28, 0, Math.PI * 2);
    ctx.fill();
    // catch-light highlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex - eyeR * 0.18, eyeY - eyeR * 0.22, eyeR * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── 9  Eyebrows ── */
  ctx.strokeStyle = C.eyebrow;
  ctx.lineWidth   = faceR * 0.055;
  ctx.lineCap     = 'round';
  for (const sign of [-1, 1]) {
    const ex = cx + sign * eyeGap;
    ctx.beginPath();
    ctx.moveTo(ex - eyeR * 0.7, eyeY - eyeR * 1.2);
    ctx.quadraticCurveTo(ex, eyeY - eyeR * 1.35, ex + eyeR * 0.7, eyeY - eyeR * 1.1);
    ctx.stroke();
  }

  /* ── 10  Mouth ── */
  drawMouth(ctx, cx, headCY, faceR, t, ops.talk);

  /* ── 11  Blush ── (fades when thinking) */
  const blushA = 0.45 * (1 - ops.think * 0.7);
  if (blushA > 0.01) {
    ctx.fillStyle = `rgba(253,164,175,${blushA})`;        // rose-pastel-300
    const bR = faceR * 0.22;
    // left cheek
    ctx.beginPath();
    ctx.ellipse(cx - eyeGap - faceR * 0.05, eyeY + eyeR, bR, bR * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    // right cheek
    ctx.beginPath();
    ctx.ellipse(cx + eyeGap + faceR * 0.05, eyeY + eyeR, bR, bR * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── 12  Thinking bubble ── (conditional) */
  if (ops.think > 0.01) {
    drawBubble(ctx, cx, headCY, faceR, t, ops.think);
  }

  ctx.restore();
}

/**
 * Draws the mouth:  a static smile when idle, or an oscillating
 * open/closed oval when talking.  The open phase is gated by *talkOp*.
 *
 * @param ctx    - 2-D context.
 * @param cx     - Face horizontal centre.
 * @param headCY - Face vertical centre.
 * @param faceR  - Face radius.
 * @param t      - Timestamp ms (drives sin oscillation).
 * @param talkOp - Talking opacity 0–1; acts as blend weight.
 */
function drawMouth(
  ctx: CanvasRenderingContext2D,
  cx: number, headCY: number, faceR: number, t: number, talkOp: number,
): void {
  const my = headCY + faceR * 0.52;
  const mw = faceR * 0.2;

  ctx.strokeStyle = C.mouth;
  ctx.lineWidth   = faceR * 0.05;
  ctx.lineCap     = 'round';

  if (talkOp < 0.02) {
    // pure smile arc
    ctx.beginPath();
    ctx.arc(cx, my - faceR * 0.02, mw, 0.1, Math.PI - 0.1);
    ctx.stroke();
    return;
  }

  // 0–1 oscillator at ≈ 0.5 Hz
  const osc = Math.sin(t * 0.015) * 0.5 + 0.5;

  if (osc < 0.15) {
    // momentarily closed → smile
    ctx.beginPath();
    ctx.arc(cx, my - faceR * 0.02, mw, 0.1, Math.PI - 0.1);
    ctx.stroke();
  } else {
    // open oval – height scales with oscillator
    const openH = faceR * 0.11 * osc;
    ctx.fillStyle   = '#4a0020';          // dark mouth interior
    ctx.strokeStyle = C.mouth;
    ctx.beginPath();
    ctx.ellipse(cx, my, mw * 0.7, openH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * Draws a speech-thought bubble positioned above-right of the head,
 * with a diminishing two-circle tail and three staggered pulsing dots.
 *
 * @param ctx    - 2-D context.
 * @param cx     - Face horizontal centre.
 * @param headCY - Face vertical centre.
 * @param faceR  - Face radius (all offsets are relative to this).
 * @param t      - Timestamp ms (dot-pulse phase source).
 * @param alpha  - Bubble opacity (= thinking lerp value).
 */
function drawBubble(
  ctx: CanvasRenderingContext2D,
  cx: number, headCY: number, faceR: number, t: number, alpha: number,
): void {
  const bx = cx + faceR * 0.7;
  const by = headCY - faceR * 2.2;
  const bw = faceR * 2.2;
  const bh = faceR * 0.85;
  const br = faceR * 0.18;

  ctx.globalAlpha = alpha;

  // rounded-rect body
  ctx.fillStyle   = '#ffffff';
  ctx.strokeStyle = C.bubbleStr;
  ctx.lineWidth   = faceR * 0.04;
  roundRect(ctx, bx, by, bw, bh, br);
  ctx.fill();
  ctx.stroke();

  // tail – two diminishing circles connecting bubble to head
  const tailCX = bx + faceR * 0.3;
  const tailCY = by + bh;
  ctx.fillStyle   = '#ffffff';
  ctx.strokeStyle = C.bubbleStr;
  // larger circle
  ctx.beginPath();
  ctx.arc(tailCX, tailCY + faceR * 0.15, faceR * 0.14, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // smaller circle
  ctx.beginPath();
  ctx.arc(tailCX - faceR * 0.12, tailCY + faceR * 0.35, faceR * 0.08, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // three pulsing dots – each phase-staggered so they don't pop in unison
  const dotR   = faceR * 0.09;
  const dotY   = by + bh * 0.5;
  const dotGap = bw * 0.28;
  for (let i = 0; i < 3; i++) {
    const scale = 0.7 + 0.3 * Math.sin(t * 0.005 + i * 1.05);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(bx + bw * 0.25 + i * dotGap, dotY, dotR * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;   // restore before the caller's ctx.restore()
}

/* ── component ────────────────────────────────────────────────────── */

/**
 * TwoDViewer – Canvas-2D avatar, a full drop-in for ThreeViewer.
 *
 * Owns a single `requestAnimationFrame` loop that is FPS-capped (30 fps)
 * and reports telemetry to AppContext in exactly the same shape that
 * ThreeViewer does, so the Dev-Mode panel needs no changes.
 *
 * The 2-D viewer now mirrors the shared avatar runtime so it follows the
 * same high-level phases as the VRM path, while still rendering a simpler
 * pose language.
 */
export default function TwoDViewer() {
  const { state: appState, dispatch: appDispatch } = useApp();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  /* ── RAF / telemetry refs ── */
  const rafRef      = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const fpsRef      = useRef<number[]>([]);            // rolling timestamp window

  /* ── animation-state refs (never cause re-renders) ── */
  const opsRef     = useRef<Opacities>({ idle: 1, think: 0, talk: 0 });
  const avatarRef  = useRef(appState.avatar);
  const devModeRef = useRef(appState.devMode);

  useEffect(() => {
    avatarRef.current = appState.avatar;
  }, [appState.avatar]);

  useEffect(() => {
    devModeRef.current = appState.devMode;
  }, [appState.devMode]);

  /* ── canvas resize ─────────────────────────────────────────────── */
  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    /**
     * Syncs the canvas pixel buffer to `container` CSS size × DPR (max 2).
     * Also resets the context transform so drawing stays in logical px.
     */
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const { clientWidth: w, clientHeight: h } = container;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();                                            // initial size
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  /* ── RAF loop ───────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    /**
     * Per-frame callback.  Contains the FPS gate, the three-state
     * machine, opacity lerps, the draw call, and telemetry dispatch.
     *
     * @param timestamp - High-res timestamp provided by the browser.
     */
    const loop = (timestamp: number) => {
      rafRef.current = requestAnimationFrame(loop);

      /* ── FPS gate (remainder carry-over – identical to ThreeViewer) ── */
      const elapsed = timestamp - lastTimeRef.current;
      if (elapsed < FRAME_INTERVAL) return;
      lastTimeRef.current = timestamp - (elapsed % FRAME_INTERVAL);

      /* ── state machine → opacity targets ── */
      let tIdle = 1, tThink = 0, tTalk = 0;
      const frame = resolveAvatarPresentation(avatarRef.current, Date.now());

      if (frame.phase === 'thinking') {
        tIdle = 0;
        tThink = 1;
        tTalk = 0;
      } else if (frame.phase === 'speaking' || frame.phase === 'reacting') {
        tIdle = 0;
        tThink = 0;
        tTalk = 1;
      } else if (frame.phase === 'settling') {
        tIdle = 0.45;
        tThink = 0;
        tTalk = 0.35;
      }

      /* ── lerp toward targets ── */
      const ops = opsRef.current;
      ops.idle  = lerp(ops.idle,  tIdle,  LERP_FACTOR);
      ops.think = lerp(ops.think, tThink, LERP_FACTOR);
      ops.talk  = lerp(ops.talk,  tTalk,  LERP_FACTOR);

      /* ── draw ── */
      const dpr = Math.min(window.devicePixelRatio, 2);
      drawAvatar(ctx, canvas.width / dpr, canvas.height / dpr, timestamp, ops);

      /* ── FPS telemetry (rolling window – identical to ThreeViewer) ── */
      fpsRef.current.push(timestamp);
      if (fpsRef.current.length > FPS_SAMPLE_SIZE) fpsRef.current.shift();

      if (fpsRef.current.length >= 2) {
        const span   = fpsRef.current[fpsRef.current.length - 1] - fpsRef.current[0];
        const avgFps = (fpsRef.current.length - 1) / (span / 1000);
        if (devModeRef.current) {
          appDispatch({
            type: 'UPDATE_METRICS',
            payload: {
              currentFps: Math.round(1000 / elapsed),
              averageFps: Math.round(avgFps),
            },
          });
        }
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [appDispatch]);                                   // appDispatch is stable; effect runs once

  /* ── JSX ── */
  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ background: 'linear-gradient(180deg, #ede5ff 0%, #faf5ff 100%)' }}
      />
    </div>
  );
}
