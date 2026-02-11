import { useEffect, useMemo, useRef, useState } from 'react';

import type { VoiceSource } from '../types';

interface VoiceVisualizerProps {
  level: number;
  source?: VoiceSource;
}

function supportsCanvas2d() {
  if (typeof document === 'undefined') {
    return false;
  }
  const probe = document.createElement('canvas');
  return typeof probe.getContext === 'function' && probe.getContext('2d') !== null;
}

export function VoiceVisualizer({ level, source = 'idle' }: VoiceVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelRef = useRef(level);
  const pulseRef = useRef(0);
  const [mode, setMode] = useState<'canvas' | 'bars'>(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return 'bars';
    }
    return supportsCanvas2d() ? 'canvas' : 'bars';
  });

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = (matches: boolean) => {
      setMode(matches ? 'bars' : supportsCanvas2d() ? 'canvas' : 'bars');
    };

    apply(media.matches);

    const handleChange = (event: MediaQueryListEvent) => apply(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (mode !== 'canvas') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * ratio;
      canvas.height = canvas.clientHeight * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    let raf = 0;

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      pulseRef.current += 0.08;

      context.clearRect(0, 0, width, height);
      context.fillStyle = 'rgba(0, 0, 0, 0.18)';
      context.fillRect(0, 0, width, height);

      const amplitude = Math.max(0.08, levelRef.current);
      const centerY = height * 0.5;

      context.lineWidth = 2;
      context.strokeStyle = 'rgba(0, 243, 255, 0.9)';
      context.beginPath();

      for (let x = 0; x <= width; x += 4) {
        const n = x / width;
        const wave = Math.sin(n * Math.PI * 8 + pulseRef.current) * amplitude * 24;
        const sparkle = Math.cos(n * Math.PI * 20 - pulseRef.current * 1.8) * amplitude * 8;
        const y = centerY + wave + sparkle;

        if (x === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }

        if (Math.random() < amplitude * 0.02) {
          context.fillStyle = 'rgba(0, 243, 255, 0.45)';
          context.fillRect(x, y, 2, 2);
        }
      }

      context.stroke();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [mode]);

  const bars = useMemo(() => {
    const amplitude = Math.max(0.08, level);
    return Array.from({ length: 22 }, (_, index) => {
      const wobble = Math.sin(index * 0.9 + amplitude * 4) * 0.5 + 0.5;
      const height = 10 + Math.round((amplitude * 46 + wobble * 18));
      return {
        id: index,
        height
      };
    });
  }, [level]);

  return (
    <div className="v2-visualizer-shell" data-source={source}>
      {mode === 'canvas' ? (
        <canvas ref={canvasRef} className="v2-visualizer-canvas" />
      ) : (
        <div className="v2-visualizer-bars" role="img" aria-label="Voice activity fallback bars">
          {bars.map((bar) => (
            <span key={bar.id} style={{ height: `${bar.height}px` }} />
          ))}
        </div>
      )}
    </div>
  );
}
