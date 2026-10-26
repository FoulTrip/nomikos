import React, { useEffect, useState } from 'react';
import { cancelRender, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadNunito } from '@remotion/google-fonts/Nunito';
import { getTheme } from '../../config/themes';
import { useResponsive } from '../responsive/Container';

const DEFAULT_GLOW: [string, string, string, string] = ['#3B82F6', '#22C55E', '#F59E0B', '#E879F9'];

const { fontFamily: nunitoFamily, waitUntilDone } = loadNunito('normal', {
  weights: ['800'],
  subsets: ['latin'],
});

// Título dots con glow cromático por letra + aberración RGB. 100% frame-driven.
export const DotsTitle: React.FC<{ text?: string; themeId?: string; delay?: number; instant?: boolean; cycle?: number }> = ({
  text = 'dots',
  themeId = 'dots_plush',
  delay = 0,
  instant = false,
  cycle = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    waitUntilDone()
      .then(() => setFontReady(true))
      .catch((e) => cancelRender(e instanceof Error ? e : new Error(String(e))));
  }, []);
  const { scale, isVertical } = useResponsive();
  const theme = getTheme(themeId);
  const glow = theme.colors.glowPerLetter ?? DEFAULT_GLOW;
  const fontSize = (isVertical ? 170 : 240) * scale;
  const haloPulse = cycle > 0 ? 0.5 + 0.15 * Math.sin((Math.PI * 2 * frame) / cycle) : 0.5 + 0.15 * Math.sin(frame / 45);
  if (!fontReady) return null;

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          left: '-30%',
          top: '-45%',
          width: '160%',
          height: '190%',
          background: `radial-gradient(ellipse 55% 50% at 50% 45%, ${glow[1]}40, ${glow[3]}28, transparent 70%)`,
          filter: `blur(${30 * scale}px)`,
          opacity: haloPulse,
          pointerEvents: 'none',
        }}
      />
    <div style={{ display: 'flex', gap: `${0.02 * fontSize}px`, lineHeight: 1, position: 'relative' }}>
      {text.split('').map((ch, i) => {
        const d = delay + i * 6;
        const enter = instant ? 1 : spring({ frame: frame - d, fps, config: { damping: 120, stiffness: 180 } });
        const y = interpolate(enter, [0, 1], [60 * scale, 0]);
        const opacity = interpolate(enter, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' });
        const color = glow[i % glow.length];
        return (
          <span
            key={i}
            style={{
              position: 'relative',
              fontFamily: nunitoFamily,
              fontWeight: 800,
              fontSize,
              letterSpacing: '-0.02em',
              transform: `translateY(${y}px)`,
              opacity,
              color: '#fff',
              textShadow: `0 0 ${14 * scale}px #fff, 0 0 ${28 * scale}px ${color}, 0 0 ${70 * scale}px ${color}, 0 0 ${150 * scale}px ${color}`,
            }}
          >
            {/* capas aberración */}
            <span
              style={{
                position: 'absolute',
                inset: 0,
                color,
                opacity: 0.55,
                transform: `translate(${-3 * scale}px, 0)`,
                filter: `blur(${2 * scale}px)`,
                pointerEvents: 'none',
              }}
            >
              {ch}
            </span>
            <span
              style={{
                position: 'absolute',
                inset: 0,
                color: '#fff',
                opacity: 0.35,
                transform: `translate(${3 * scale}px, 0)`,
                filter: `blur(${1 * scale}px)`,
                pointerEvents: 'none',
              }}
            >
              {ch}
            </span>
            <span style={{ position: 'relative' }}>{ch}</span>
          </span>
        );
      })}
      </div>
    </div>
  );
};
