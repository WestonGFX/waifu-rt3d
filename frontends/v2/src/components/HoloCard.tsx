import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

interface HoloCardProps {
  title: string;
  subtitle: string;
  image?: string;
  accent?: 'cyan' | 'magenta';
}

export function HoloCard({ title, subtitle, image, accent = 'cyan' }: HoloCardProps) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const glow = useMemo(() => {
    return accent === 'cyan' ? 'var(--v2-neon-cyan)' : 'var(--v2-neon-magenta)';
  }, [accent]);

  return (
    <motion.article
      className={clsx('v2-holo-card')}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - 0.5) * 14;
        const y = ((event.clientY - rect.top) / rect.height - 0.5) * -14;
        setTilt({ x: y, y: x });
      }}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      animate={{ rotateX: tilt.x, rotateY: tilt.y }}
      transition={{ type: 'spring', stiffness: 180, damping: 18, mass: 0.6 }}
      style={{ boxShadow: `0 0 24px color-mix(in srgb, ${glow} 28%, transparent)` }}
    >
      <div className="v2-holo-metal" />
      <div className="v2-holo-glass" />
      {image ? <img src={image} alt={title} className="v2-holo-image" /> : null}
      <div className="v2-holo-content">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
    </motion.article>
  );
}
