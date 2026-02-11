import { useEffect, useRef } from 'react';

interface VoiceVisualizerProps {
  level: number;
}

export function VoiceVisualizer({ level }: VoiceVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * ratio;
      canvas.height = canvas.clientHeight * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let pulse = 0;

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      pulse += 0.08;

      context.clearRect(0, 0, width, height);
      context.fillStyle = 'rgba(0, 0, 0, 0.18)';
      context.fillRect(0, 0, width, height);

      const amplitude = Math.max(0.08, level);
      const centerY = height * 0.5;

      context.lineWidth = 2;
      context.strokeStyle = 'rgba(0, 243, 255, 0.9)';
      context.beginPath();

      for (let x = 0; x <= width; x += 4) {
        const n = x / width;
        const wave = Math.sin(n * Math.PI * 8 + pulse) * amplitude * 24;
        const sparkle = Math.cos(n * Math.PI * 20 - pulse * 1.8) * amplitude * 8;
        const y = centerY + wave + sparkle;
        if (x === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }

        if (Math.random() < amplitude * 0.04) {
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
  }, [level]);

  return (
    <div className="v2-visualizer-shell">
      <canvas ref={canvasRef} className="v2-visualizer-canvas" />
    </div>
  );
}
