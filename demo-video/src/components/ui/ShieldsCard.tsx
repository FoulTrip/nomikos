import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BadgeCheck, Brain, ShieldCheck } from 'lucide-react';
import type { VisualTheme } from '../../config/themes';
import { useResponsive } from '../responsive/Container';
import { DotsCharacter } from '../dots/DotsCharacter';

// Pipeline Llama Guard 3: Shield In → razonamiento → Shield Out. Progreso por frame.
const STEPS = [
  { label: 'Shield In', sub: 'Llama Guard 3 · S1–S14', Icon: ShieldCheck },
  { label: 'Razonamiento', sub: 'LLM cuenta · 15 tools', Icon: Brain },
  { label: 'Shield Out', sub: 'User/Agent · 1B', Icon: BadgeCheck },
];

export const ShieldsCard: React.FC<{ durationInFrames: number; theme: VisualTheme }> = ({
  durationInFrames,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { scale, isVertical } = useResponsive();
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const verdict = progress >= 0.9 ? 'SAFE · reply' : progress >= 0.33 ? 'reasoning…' : 'scanning…';

  return (
    <div
      style={{
        width: `${1240 * scale}px`,
        maxWidth: '94%',
        border: `1px solid ${theme.colors.border}`,
        borderRadius: `${20 * scale}px`,
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(8px)',
        padding: `${32 * scale}px ${36 * scale}px`,
      }}
    >
      <div style={{ display: 'flex', gap: `${14 * scale}px`, alignItems: 'center', marginBottom: `${28 * scale}px` }}>
        <div style={{ width: `${58 * scale}px`, height: `${58 * scale}px`, overflow: 'hidden', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <DotsCharacter variant="frog-green" size={52} floatOffset={3} glow={progress >= 0.9 ? 1 : 0.2 + progress * 0.5} still />
        </div>
        <span
          style={{
            fontFamily: theme.fonts.code,
            fontSize: `${24 * scale}px`,
            fontWeight: 700,
            color: progress >= 0.9 ? '#22C55E' : '#F59E0B',
            border: `1px solid ${theme.colors.border}`,
            borderRadius: `${999 * scale}px`,
            padding: `${8 * scale}px ${20 * scale}px`,
            background: progress >= 0.9 ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
          }}
        >
          {verdict}
        </span>
        <span style={{ fontFamily: theme.fonts.code, fontSize: `${22 * scale}px`, color: theme.colors.muted }}>
          llama-guard3:1b · Ollama CPU
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: isVertical ? 'column' : 'row', alignItems: 'stretch' }}>
        {STEPS.map((st, i) => {
          const start = i / STEPS.length;
          const end = (i + 1) / STEPS.length;
          const state: 'todo' | 'active' | 'done' = progress >= end ? 'done' : progress >= start ? 'active' : 'todo';
          const pop = spring({ frame: frame - start * durationInFrames, fps, config: { damping: 140, stiffness: 200 } });
          const gapFill = i < STEPS.length - 1 ? Math.min(1, Math.max(0, progress * STEPS.length - (i + 1) + 0.5)) : 0;
          const { Icon } = st;
          return (
            <React.Fragment key={st.label}>
              <div
                style={{
                  flex: 1,
                  border: `1px solid ${state === 'todo' ? theme.colors.border : theme.colors.accent}`,
                  borderRadius: `${14 * scale}px`,
                  padding: `${20 * scale}px`,
                  background: state === 'todo' ? 'transparent' : 'rgba(20,241,149,0.08)',
                  boxShadow: state === 'active' ? `0 0 ${30 * scale}px ${theme.colors.glow}` : 'none',
                  transform: state === 'todo' ? 'none' : `scale(${0.96 + 0.04 * pop})`,
                  opacity: state === 'todo' ? 0.55 : 1,
                }}
              >
                <Icon size={30 * scale} color={state === 'todo' ? theme.colors.muted : theme.colors.accent} />
                <div style={{ fontFamily: theme.fonts.heading, fontWeight: 800, fontSize: `${26 * scale}px`, color: theme.colors.text, marginTop: `${10 * scale}px` }}>
                  {st.label}
                </div>
                <div style={{ fontFamily: theme.fonts.code, fontSize: `${20 * scale}px`, color: theme.colors.muted }}>
                  {st.sub}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  style={{
                    alignSelf: 'center',
                    flexShrink: 0,
                    width: isVertical ? `${4 * scale}px` : `${44 * scale}px`,
                    height: isVertical ? `${28 * scale}px` : `${4 * scale}px`,
                    borderRadius: `${4 * scale}px`,
                    margin: isVertical ? `${8 * scale}px auto` : `0 ${10 * scale}px`,
                    background: theme.colors.border,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: theme.colors.accent,
                      transform: isVertical ? `scaleY(${gapFill})` : `scaleX(${gapFill})`,
                      transformOrigin: 'left top',
                    }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
