import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { getTheme } from '../config/themes';
import { useResponsive } from '../components/responsive/Container';
import { DotsTitle } from '../components/dots/DotsTitle';
import { DotsRow } from '../components/dots/DotsCharacter';
import { GlowBackground } from '../components/fx/GlowBackground';

export const AMBIENT_FRAMES = 600;

// Fondo YouTube 16:9 sin sonido: loop perfecto de 20s, ritmo pausado,
// tarjetas glass rotando con crossfade. La voz se monta encima en edición.
const CARDS = [
  { dot: '#22C55E', title: 'x402 · toll settled', sub: 'invoice → X-Payment → 200 · replay → 409' },
  { dot: '#38BDF8', title: 'llama-guard3:1b', sub: 'shields in / out · SAFE' },
  { dot: '#F59E0B', title: 'dPaaS · delegated signer', sub: 'ed25519 in RAM → solana devnet' },
];

const CycleCards: React.FC = () => {
  const frame = useCurrentFrame();
  const { scale } = useResponsive();
  const theme = getTheme('dots_plush');
  const slot = AMBIENT_FRAMES / CARDS.length; // 200f por tarjeta
  const OVERLAP = 30;
  const idx = Math.floor(frame / slot) % CARDS.length;
  const local = frame - Math.floor(frame / slot) * slot;

  const card = (i: number, opacity: number, key: string) => {
    const c = CARDS[((i % CARDS.length) + CARDS.length) % CARDS.length];
    const pulse = 0.6 + 0.4 * Math.sin(((Math.PI * 2 * frame) / AMBIENT_FRAMES) * 8);
    return (
      <div
        key={key}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          margin: '0 auto',
          width: 'max-content',
          maxWidth: '92%',
          display: 'flex',
          alignItems: 'center',
          gap: `${16 * scale}px`,
          background: 'rgba(255,255,255,0.055)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: `${999 * scale}px`,
          padding: `${14 * scale}px ${30 * scale}px`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 16px 44px rgba(0,0,0,0.4)',
          opacity: opacity * 0.92,
        }}
      >
        <div style={{ width: `${12 * scale}px`, height: `${12 * scale}px`, borderRadius: '50%', background: c.dot, opacity: pulse, boxShadow: `0 0 ${12 * scale}px ${c.dot}`, flexShrink: 0 }} />
        <span style={{ fontFamily: theme.fonts.body, fontWeight: 700, fontSize: `${23 * scale}px`, color: theme.colors.text, whiteSpace: 'nowrap' }}>
          {c.title}
        </span>
        <span style={{ fontFamily: theme.fonts.code, fontSize: `${20 * scale}px`, color: theme.colors.muted, whiteSpace: 'nowrap' }}>
          {c.sub}
        </span>
      </div>
    );
  };

  // Crossfade al final de cada slot (incluye el cierre del loop 600→0).
  const tail = slot - local;
  if (tail <= OVERLAP) {
    const p = Easing.out(Easing.cubic)(1 - tail / OVERLAP);
    return (
      <div style={{ position: 'relative', width: '100%', minHeight: `${90 * scale}px` }}>
        {card(idx, 1 - p, 'cur')}
        {card(idx + 1, p, 'next')}
      </div>
    );
  }
  // Entrada del loop: funde desde negro en los primeros frames (también periódica).
  const head = frame < OVERLAP ? Easing.out(Easing.cubic)(frame / OVERLAP) : 1;
  return (
    <div style={{ position: 'relative', width: '100%', minHeight: `${90 * scale}px` }}>
      {card(idx, head, 'cur')}
    </div>
  );
};

export const AmbientLoop: React.FC<{ vignette?: boolean }> = ({ vignette = true }) => {
  const theme = getTheme('dots_plush');
  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      <GlowBackground theme={theme} cycle={AMBIENT_FRAMES} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: '9%',
          gap: '2.5%',
        }}
      >
        <DotsTitle text="NomikOS" themeId={theme.id} instant cycle={AMBIENT_FRAMES} />
        <div style={{ fontFamily: theme.fonts.body, fontSize: 26, letterSpacing: '0.14em', color: theme.colors.muted }}>
          ZERO-UI AGÉNTICO
        </div>
        <div style={{ marginTop: '1%' }}>
          <DotsRow delay={0} cycle={AMBIENT_FRAMES} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '7%', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 1100, padding: '0 40px' }}>
          <CycleCards />
        </div>
      </div>
      {vignette && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 75% 70% at 50% 45%, transparent 55%, rgba(0,0,0,0.5) 100%)',
            pointerEvents: 'none',
          }}
        />
      )}
    </AbsoluteFill>
  );
};

// Chequeo de periodicidad: f(0) === f(ciclo) en todos los drivers.
export const ambientLoopError = (): number => {
  const TAU = Math.PI * 2;
  const drivers = [
    Math.sin(0) - Math.sin((TAU * AMBIENT_FRAMES) / AMBIENT_FRAMES),
    Math.sin(0) - Math.sin(((TAU * AMBIENT_FRAMES) / AMBIENT_FRAMES) * 2),
    Math.sin(0) - Math.sin(((TAU * AMBIENT_FRAMES) / AMBIENT_FRAMES) * 8),
    AMBIENT_FRAMES % (AMBIENT_FRAMES / 4),
    AMBIENT_FRAMES % (AMBIENT_FRAMES / CARDS.length),
  ];
  return Math.max(...drivers.map(Math.abs));
};
