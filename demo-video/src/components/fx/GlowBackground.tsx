import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { VisualTheme } from '../../config/themes';
import { NoiseOverlay } from '../dots/FeltFilter';

// Fondo negro + glows radiales con respiración lenta + grano.
export const GlowBackground: React.FC<{ theme: VisualTheme; tint?: string; cycle?: number }> = ({ theme, tint, cycle = 0 }) => {
  const frame = useCurrentFrame();
  const TAU = Math.PI * 2;
  const drift = cycle > 0 ? (3 * Math.sin((TAU * frame) / cycle)) / 100 : interpolate(frame, [0, 5400], [0, 1]);
  const b1 = cycle > 0 ? 0.5 + 0.15 * Math.sin((TAU * frame) / cycle) : 0.5 + 0.18 * Math.sin(frame / 75);
  const b2 = cycle > 0 ? 0.42 + 0.12 * Math.sin(((TAU * frame) / cycle) * 2 + 2) : 0.42 + 0.15 * Math.sin(frame / 95 + 2);
  const glows = theme.colors.glowPerLetter ?? [theme.colors.glow, theme.colors.glow];
  const c1 = tint ?? glows[0];
  const c2 = tint ?? (glows[3] ?? glows[0]);
  return (
    <AbsoluteFill style={{ background: theme.colors.bg, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: `${10 + drift * 6}%`,
          top: '-20%',
          width: '70%',
          height: '70%',
          background: `radial-gradient(closest-side, ${c1}55, transparent)`,
          filter: `blur(${theme.textures.blurAmount})`,
          opacity: b1,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: '-10%',
          bottom: '-20%',
          width: '65%',
          height: '65%',
          background: `radial-gradient(closest-side, ${c2}44, transparent)`,
          filter: `blur(${theme.textures.blurAmount})`,
          opacity: b2,
        }}
      />
      {theme.textures.overlay !== 'none' && <NoiseOverlay opacity={theme.textures.noiseOpacity} />}
    </AbsoluteFill>
  );
};
