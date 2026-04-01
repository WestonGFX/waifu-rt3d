/**
 * TemperatureMeter — Feature F21: Scene Temperature Indicator
 *
 * A subtle, compact indicator in the chat header area that shows the
 * current "temperature" (intimacy intensity) of the conversation.
 * Driven by the arousal engine's state — higher arousal = warmer colors.
 *
 * The meter is intentionally understated: a thin gradient bar or small
 * icon that shifts color from cool blue → warm pink → hot red as the
 * scene intensifies. It never shows numbers or percentages — just a
 * mood-like visual cue.
 *
 * @module TemperatureMeter
 */

import { Flame } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface TemperatureMeterProps {
  /**
   * Current scene temperature (0–100).
   * 0 = neutral, 20 = warm, 50 = heated, 80+ = intense.
   * Driven by the arousal engine's current level.
   */
  temperature: number;
  /** Whether to show the meter at all. Hidden when temperature is 0. */
  visible?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Maps temperature ranges to visual properties.
 * The gradient is intentionally smooth — no abrupt transitions.
 */
function getTemperatureColor(temp: number): { color: string; glow: string; opacity: number } {
  if (temp <= 0)  return { color: 'var(--color-text-muted)', glow: 'none', opacity: 0 };
  if (temp <= 20) return { color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.15)', opacity: 0.5 };
  if (temp <= 40) return { color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.2)', opacity: 0.65 };
  if (temp <= 60) return { color: '#ec4899', glow: 'rgba(236, 72, 153, 0.25)', opacity: 0.8 };
  if (temp <= 80) return { color: '#f43f5e', glow: 'rgba(244, 63, 94, 0.3)', opacity: 0.9 };
  return             { color: '#ef4444', glow: 'rgba(239, 68, 68, 0.35)', opacity: 1 };
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Compact temperature indicator for the chat header.
 * Shows a flame icon that changes color and intensity based on the
 * scene's current arousal level. Invisible when temperature is 0.
 *
 * @param props - See {@link TemperatureMeterProps}.
 *
 * @example
 * <TemperatureMeter temperature={arousalLevel} />
 */
export function TemperatureMeter({
  temperature,
  visible = true,
}: TemperatureMeterProps) {
  if (!visible || temperature <= 0) return null;

  const { color, glow, opacity } = getTemperatureColor(temperature);

  // Scale the flame icon slightly larger at higher temperatures
  const scale = 1 + Math.min(temperature / 200, 0.25);

  return (
    <div
      className="flex items-center gap-1 transition-all duration-700"
      style={{ opacity }}
      title={`Scene intensity: ${temperature > 80 ? 'Intense' : temperature > 50 ? 'Heated' : temperature > 20 ? 'Warm' : 'Cool'}`}
    >
      {/* Flame icon */}
      <div
        className="transition-all duration-700"
        style={{
          color,
          filter: temperature > 40 ? `drop-shadow(0 0 3px ${glow})` : 'none',
          transform: `scale(${scale})`,
        }}
      >
        <Flame size={14} />
      </div>

      {/* Thin temperature bar — only shows at 20+ */}
      {temperature >= 20 && (
        <div
          className="rounded-full overflow-hidden transition-all duration-700"
          style={{
            width: 32,
            height: 3,
            backgroundColor: 'var(--color-border)',
          }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(temperature, 100)}%`,
              backgroundColor: color,
              boxShadow: `0 0 4px ${glow}`,
            }}
          />
        </div>
      )}
    </div>
  );
}
