import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import type { VisualTheme } from '../../config/themes';
import { useResponsive } from '../responsive/Container';

// Terminal con tipeo determinista. El caret parpadea por frame, sin timers.
export const Terminal: React.FC<{
  code: string;
  title?: string;
  language?: string;
  durationInFrames: number;
  theme: VisualTheme;
  delay?: number;
}> = ({ code, title = 'nomikos — demo', language = 'bash', durationInFrames, theme, delay = 15 }) => {
  const frame = useCurrentFrame();
  const { scale } = useResponsive();
  const lines = code.split('\n');
  const total = code.length;
  const shown = Math.floor(
    interpolate(frame - delay, [0, Math.max(1, durationInFrames * 0.55)], [0, total], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const caretOn = frame % 18 < 10;

  let remaining = shown;
  const rendered: { text: string; done: boolean; caretHere: boolean }[] = lines.map((ln) => {
    if (remaining <= 0) return { text: '', done: false, caretHere: false };
    const take = Math.min(ln.length, remaining);
    remaining -= take + 1; // +1 salto de línea
    const full = take === ln.length;
    return { text: ln.slice(0, take), done: full && remaining > 0, caretHere: !full || (full && remaining <= 0) };
  });
  const caretLine = Math.max(
    0,
    rendered.findIndex((r) => r.caretHere),
  );

  const isPrompt = (ln: string) => /^\s*(\$|curl|POST|GET|npx|make)\b/.test(ln);

  return (
    <div
      style={{
        width: `${1240 * scale}px`,
        maxWidth: '92%',
        border: `1px solid ${theme.colors.border}`,
        borderRadius: `${18 * scale}px`,
        background: 'rgba(10,13,22,0.78)',
        backdropFilter: 'blur(12px)',
        overflow: 'hidden',
        boxShadow: `0 ${24 * scale}px ${80 * scale}px rgba(0,0,0,0.5)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${10 * scale}px`,
          padding: `${14 * scale}px ${20 * scale}px`,
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
          <div key={c} style={{ width: `${14 * scale}px`, height: `${14 * scale}px`, borderRadius: '50%', background: c }} />
        ))}
        <div style={{ flex: 1, textAlign: 'center', fontFamily: theme.fonts.code, fontSize: `${20 * scale}px`, color: theme.colors.muted }}>
          {title}
        </div>
        <div
          style={{
            fontFamily: theme.fonts.code,
            fontSize: `${18 * scale}px`,
            color: theme.colors.accent,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: `${999 * scale}px`,
            padding: `${4 * scale}px ${14 * scale}px`,
          }}
        >
          {language}
        </div>
      </div>
      <div style={{ padding: `${26 * scale}px ${30 * scale}px`, minHeight: `${200 * scale}px` }}>
        {rendered.map((r, i) => (
          <div
            key={i}
            style={{
              fontFamily: theme.fonts.code,
              fontSize: `${26 * scale}px`,
              lineHeight: 1.7,
              color: isPrompt(lines[i]) ? theme.colors.accent : theme.colors.text,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              minHeight: `${44 * scale}px`,
            }}
          >
            {r.text}
            {i === caretLine && caretOn && (
              <span style={{ display: 'inline-block', width: `${14 * scale}px`, height: `${28 * scale}px`, background: theme.colors.accent, verticalAlign: '-4px', marginLeft: `${4 * scale}px` }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
