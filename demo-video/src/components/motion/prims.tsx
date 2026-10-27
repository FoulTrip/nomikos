import React from 'react';
import { useCurrentFrame } from 'remotion';
import type { VisualTheme } from '../../config/themes';
import { useResponsive } from '../responsive/Container';

export const hash01 = (i: number, s = 0) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Línea de flujo con pulsos de luz viajando. Determinista por frame.
export const FlowLine: React.FC<{
  length: number;
  color: string;
  pulses?: number;
  speed?: number;
  vertical?: boolean;
  thickness?: number;
}> = ({ length, color, pulses = 2, speed = 4, vertical = false, thickness = 3 }) => {
  const frame = useCurrentFrame();
  const w = vertical ? 24 : length;
  const h = vertical ? length : 24;
  return (
    <svg width={w} height={h} style={{ overflow: 'visible', flexShrink: 0 }}>
      {vertical ? (
        <rect x={12 - thickness / 2} y={0} width={thickness} height={length} rx={thickness} fill={color} opacity={0.22} />
      ) : (
        <rect x={0} y={12 - thickness / 2} width={length} height={thickness} rx={thickness} fill={color} opacity={0.22} />
      )}
      {Array.from({ length: pulses }).map((_, p) => {
        const pos = (frame * speed + (p * length) / pulses) % length;
        const cx = vertical ? 12 : pos;
        const cy = vertical ? pos : 12;
        return (
          <g key={p}>
            <circle cx={cx} cy={cy} r={10} fill={color} opacity={0.3} />
            <circle cx={cx} cy={cy} r={3.5} fill="#fff" opacity={0.95} />
          </g>
        );
      })}
    </svg>
  );
};

// Nodo glass con icono + etiqueta mínima. active 0..1 enciende el borde.
export const NodeChip: React.FC<{
  icon: React.ReactNode;
  label: string;
  sub?: string;
  active: number;
  color: string;
  theme: VisualTheme;
  size?: number;
}> = ({ icon, label, sub, active, color, theme, size = 150 }) => {
  const { scale } = useResponsive();
  const s = size * scale;
  const a = Math.max(0, Math.min(1, active));
  return (
    <div
      style={{
        width: s,
        borderRadius: `${16 * scale}px`,
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(10px)',
        border: `1px solid rgba(255,255,255,0.12)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.1), 0 0 ${34 * scale}px ${color}${a > 0.02 ? '55' : '00'}`,
        padding: `${18 * scale}px ${12 * scale}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: `${8 * scale}px`,
        opacity: 0.45 + 0.55 * a,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, border: `1.5px solid ${color}`, borderRadius: 'inherit', opacity: a, pointerEvents: 'none' }} />
      <div style={{ color, display: 'flex' }}>{icon}</div>
      <div style={{ fontFamily: theme.fonts.code, fontWeight: 700, fontSize: `${21 * scale}px`, color: theme.colors.text, textAlign: 'center' }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontFamily: theme.fonts.code, fontSize: `${17 * scale}px`, color: theme.colors.muted, textAlign: 'center' }}>
          {sub}
        </div>
      )}
    </div>
  );
};

// Partículas ascendentes deterministas (índice → posición/velocidad).
export const Particles: React.FC<{ count?: number; color: string; opacity?: number; speed?: number }> = ({
  count = 42,
  color,
  opacity = 0.5,
  speed = 0.35,
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: count }).map((_, i) => {
        const x = hash01(i, 1) * 100;
        const v = speed * (0.4 + hash01(i, 2));
        const y = 100 - ((frame * v + hash01(i, 3) * 100) % 100);
        const sz = 2 + hash01(i, 4) * 3.5;
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(frame / 18 + i * 1.7));
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              width: sz,
              height: sz,
              borderRadius: '50%',
              background: color,
              opacity: opacity * tw,
              boxShadow: `0 0 ${sz * 2}px ${color}`,
            }}
          />
        );
      })}
    </div>
  );
};

// Lluvia de código de fondo: columnas mono desplazándose rápido en bucle local.
const CODE_LINES = [
  'fn settle_access(id)',
  'X-Payment: x402_9f3a',
  'check_limits(acct)',
  'transfer_lamports(kp)',
  'ed25519::sign(msg)',
  'consumed_at = now()',
  'replay → 409',
  'status = settled',
  'decrypt → RAM ★',
  'verify on-chain ✓',
  'invoice::poll(4×3s)',
  'dPaaS::resolve_payer',
];
export const CodeRain: React.FC<{ color: string; opacity?: number; columns?: number }> = ({
  color,
  opacity = 0.13,
  columns = 7,
}) => {
  const frame = useCurrentFrame();
  const { scale } = useResponsive();
  const lh = 30 * scale;
  const total = CODE_LINES.length * lh;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        opacity,
        maskImage: 'linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent)',
        WebkitMaskImage: 'linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent)',
      }}
    >
      {Array.from({ length: columns }).map((_, c) => {
        const speed = 5 + hash01(c, 9) * 5;
        const off = (frame * speed + hash01(c, 10) * total * 2) % total;
        return (
          <div
            key={c}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${(c + 0.5) * (100 / columns)}%`,
              transform: `translate(-50%, ${-off}px)`,
              fontFamily: 'ui-monospace, monospace',
              fontSize: `${19 * scale}px`,
              lineHeight: `${lh}px`,
              color,
              whiteSpace: 'nowrap',
            }}
          >
            {[...CODE_LINES, ...CODE_LINES].map((ln, i) => (
              <div key={i} style={{ opacity: 0.5 + 0.5 * hash01(i * 7 + c, 11) }}>
                {ln}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

// Píldora de estado mínima para el fondo (sync con el guion hablado).
export const StatusChip: React.FC<{ dot: string; text: string; theme: VisualTheme }> = ({ dot, text, theme }) => {
  const frame = useCurrentFrame();
  const { scale } = useResponsive();
  const pulse = 0.55 + 0.45 * Math.sin(frame / 22);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: `${12 * scale}px`,
        background: 'rgba(255,255,255,0.055)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: `${999 * scale}px`,
        padding: `${12 * scale}px ${26 * scale}px`,
      }}
    >
      <div style={{ width: `${10 * scale}px`, height: `${10 * scale}px`, borderRadius: '50%', background: dot, opacity: pulse, boxShadow: `0 0 ${10 * scale}px ${dot}` }} />
      <span style={{ fontFamily: theme.fonts.code, fontSize: `${20 * scale}px`, letterSpacing: '0.12em', color: theme.colors.muted }}>
        {text}
      </span>
    </div>
  );
};
