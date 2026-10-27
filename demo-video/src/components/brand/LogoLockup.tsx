import React, { useEffect, useState } from 'react';
import { Easing, interpolate, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from 'remotion';
import type { VisualTheme } from '../../config/themes';
import { useResponsive } from '../responsive/Container';

const WORD = 'NomikOS';
const TYPE_START = 90;
const PER_LETTER = 14;

// Portada de marca con Geist (Vercel): la marca aparece centrada, luego
// "NomikOS" se escribe a su derecha con caret, y el tagline debajo.
// staged=true: secuencia por fases (intro). staged=false: lockup final (outro).
export const LogoLockup: React.FC<{ theme: VisualTheme; staged?: boolean; zoom?: boolean; footerLines?: string[] }> = ({
  theme,
  staged = true,
  zoom = false,
  footerLines = [],
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { scale } = useResponsive();
  const [fontReady, setFontReady] = useState(false);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [fontHandle] = useState(() => delayRender('geist'));
  const [imgHandle] = useState(() => delayRender('nomik-mark'));

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      new FontFace('GeistNomik', `url(${staticFile('fonts/Geist-Medium.woff2')}) format('woff2')`, { weight: '500' }).load(),
      new FontFace('GeistNomik', `url(${staticFile('fonts/Geist-Regular.woff2')}) format('woff2')`, { weight: '400' }).load(),
    ])
      .then((faces) => {
        if (cancelled) return;
        faces.forEach((f) => document.fonts.add(f));
        setFontReady(true);
        continueRender(fontHandle);
      })
      .catch((e) => cancelRender(e instanceof Error ? e : new Error(String(e))));
    return () => {
      cancelled = true;
    };
  }, [fontHandle, continueRender, cancelRender]);

  const ease = Easing.out(Easing.cubic);
  const markO = staged
    ? interpolate(frame, [0, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })
    : interpolate(frame, [0, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const markS = staged
    ? interpolate(frame, [0, 70], [0.88, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })
    : 1;
  const typed = staged ? Math.max(0, Math.min(WORD.length, Math.floor((frame - TYPE_START) / PER_LETTER))) : WORD.length;
  const typeDone = TYPE_START + WORD.length * PER_LETTER;
  const caretOn = staged && frame >= TYPE_START && frame < typeDone + 24 && frame % 24 < 14;
  const tagO = staged
    ? interpolate(frame, [typeDone + 10, typeDone + 80], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })
    : markO;
  const breathe = 0.75 + 0.25 * Math.sin(frame / 55);
  const push = zoom ? interpolate(frame, [0, durationInFrames], [1, 1.035], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  if (!fontReady) return null;

  return (
    <div style={{ transform: `scale(${push})`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: `${34 * scale}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: `${44 * scale}px` }}>
        <img
          src={staticFile('logo/nomik-mark-alpha.png')}
          onLoad={() => continueRender(imgHandle)}
          onError={(e) => cancelRender(e instanceof Error ? e : new Error('logo load'))}
          style={{
            width: `${200 * scale}px`,
            height: `${200 * scale}px`,
            objectFit: 'contain',
            filter: `drop-shadow(0 0 ${26 * scale}px rgba(255,255,255,${0.35 + 0.3 * breathe}))`,
            opacity: markO,
            transform: `scale(${markS})`,
          }}
        />
        {(typed > 0 || !staged) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              fontFamily: 'GeistNomik, Inter, sans-serif',
              fontWeight: 500,
              fontSize: `${124 * scale}px`,
              letterSpacing: '-0.02em',
              color: '#fff',
              lineHeight: 1,
              textShadow: `0 0 ${30 * scale}px rgba(255,255,255,${0.28 + 0.2 * breathe})`,
              whiteSpace: 'pre',
            }}
          >
            {WORD.slice(0, typed)}
            {caretOn && (
              <span style={{ display: 'inline-block', width: `${7 * scale}px`, height: `${104 * scale}px`, background: '#fff', marginLeft: `${10 * scale}px`, boxShadow: `0 0 ${16 * scale}px rgba(255,255,255,0.8)` }} />
            )}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: 'GeistNomik, Inter, sans-serif',
          fontWeight: 400,
          fontSize: `${25 * scale}px`,
          letterSpacing: '0.06em',
          color: theme.colors.muted,
          opacity: tagO,
          textAlign: 'center',
        }}
      >
        Autonomous economic system for artificial intelligence agents
      </div>
      {footerLines.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: `${10 * scale}px`, opacity: tagO }}>
          {footerLines.map((l) => (
            <div key={l} style={{ fontFamily: theme.fonts.code, fontSize: `${20 * scale}px`, letterSpacing: '0.14em', color: theme.colors.muted }}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
