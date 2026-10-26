import React from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import type { VisualTheme } from '../../config/themes';
import { useResponsive } from '../responsive/Container';

// Entrada uniforme: fade + rise suave. Nada aparece de golpe.
export const Enter: React.FC<{
  children: React.ReactNode;
  delay?: number;
  rise?: number;
  span?: number;
}> = ({ children, delay = 8, rise = 26, span = 22 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, span], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  if (p <= 0) return null;
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * rise}px)`, width: '100%', display: 'flex', justifyContent: 'center' }}>
      {children}
    </div>
  );
};

// Tarjeta-caption glassmorphism: paginada por frases, crossfade suave.
// Reemplaza el karaoke palabra a palabra.
export const CaptionCard: React.FC<{
  text: string;
  durationInFrames: number;
  theme: VisualTheme;
}> = ({ text, durationInFrames, theme }) => {
  const frame = useCurrentFrame();
  const { scale } = useResponsive();
  const pages = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const safe = pages.length ? pages : [text];
  const pageDur = durationInFrames / safe.length;
  const idx = Math.min(safe.length - 1, Math.floor(frame / pageDur));
  const local = frame - idx * pageDur;
  const OVERLAP = 12;

  const card = (i: number, opacity: number, risePx: number, key: string) => (
    <div
      key={key}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        margin: '0 auto',
        maxWidth: `${1060 * scale}px`,
        background: 'rgba(255,255,255,0.07)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: `${16 * scale}px`,
        padding: `${20 * scale}px ${30 * scale}px`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 18px 50px rgba(0,0,0,0.45)',
        opacity,
        transform: `translateY(${risePx}px)`,
        fontFamily: theme.fonts.body,
        fontSize: `${29 * scale}px`,
        lineHeight: 1.5,
        color: theme.colors.text,
        textAlign: 'center',
      }}
    >
      {safe[i]}
    </div>
  );

  // Crossfade entre páginas: nunca hay un frame vacío.
  let nodes: React.ReactNode;
  if (local < OVERLAP && idx > 0) {
    const p = Easing.out(Easing.cubic)(local / OVERLAP);
    nodes = (
      <>
        {card(idx - 1, 1 - p, -10 * scale * p, 'prev')}
        {card(idx, p, 18 * scale * (1 - p), 'cur')}
      </>
    );
  } else {
    const enter = interpolate(local, [0, 14], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    });
    if (enter <= 0) return null;
    nodes = card(idx, enter, 18 * scale * (1 - enter), 'cur');
  }
  return (
    <div style={{ position: 'relative', width: '100%', minHeight: `${150 * scale}px`, display: 'flex', justifyContent: 'center' }}>
      {nodes}
    </div>
  );
};
