import React from 'react';
import { AbsoluteFill, Audio, Series, staticFile } from 'remotion';
import type { Scene, SceneActionType, VideoProps } from '../types';
import { getTheme, type VisualTheme } from '../config/themes';
import { ResponsiveContainer, useResponsive } from '../components/responsive/Container';
import { DotsTitle } from '../components/dots/DotsTitle';
import { DotsRow } from '../components/dots/DotsCharacter';
import { GlowBackground } from '../components/fx/GlowBackground';
import { Terminal } from '../components/ui/Terminal';
import { TxCard } from '../components/ui/TxCard';
import { ShieldsCard } from '../components/ui/ShieldsCard';
import { CaptionCard, Enter } from '../components/fx/Enter';

const CAPTIONED: SceneActionType[] = ['terminal', 'diagram', 'solana_tx', 'shields', 'fleet_map', 'voice_loop'];

// Tinte ambiental reactivo al contenido de cada bloque.
const TINTS: Record<string, string | undefined> = {
  hero_dots: undefined,
  outro_cta: undefined,
  terminal: '#3B82F6',
  diagram: '#E879F9',
  solana_tx: '#F59E0B',
  shields: '#22C55E',
  fleet_map: '#E879F9',
  voice_loop: '#3B82F6',
};

const SceneCard: React.FC<{ scene: Scene; theme: VisualTheme }> = ({ scene, theme }) => {
  const { scale } = useResponsive();
  return (
    <div
      style={{
        width: `${1200 * scale}px`,
        maxWidth: '90%',
        border: `1px solid ${theme.colors.border}`,
        borderRadius: `${20 * scale}px`,
        padding: `${36 * scale}px ${44 * scale}px`,
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{ display: 'flex', gap: `${12 * scale}px`, alignItems: 'center', marginBottom: `${16 * scale}px` }}>
        <span
          style={{
            fontFamily: theme.fonts.code,
            fontSize: `${22 * scale}px`,
            color: theme.colors.accent,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: `${999 * scale}px`,
            padding: `${6 * scale}px ${16 * scale}px`,
          }}
        >
          {scene.id} · {scene.actionType}
        </span>
        {typeof scene.httpStatus === 'number' && (
          <span
            style={{
              fontFamily: theme.fonts.code,
              fontSize: `${22 * scale}px`,
              color: scene.httpStatus === 402 ? '#F59E0B' : theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: `${999 * scale}px`,
              padding: `${6 * scale}px ${16 * scale}px`,
            }}
          >
            HTTP {scene.httpStatus}
          </span>
        )}
      </div>
      <div style={{ fontFamily: theme.fonts.body, fontSize: `${30 * scale}px`, color: theme.colors.text, lineHeight: 1.45 }}>
        {scene.narrationText}
      </div>
      {scene.codeSnippet && scene.actionType !== 'terminal' && (
        <pre
          style={{
            marginTop: `${20 * scale}px`,
            fontFamily: theme.fonts.code,
            fontSize: `${22 * scale}px`,
            color: theme.colors.muted,
            background: 'rgba(0,0,0,0.45)',
            border: `1px solid ${theme.colors.border}`,
            borderRadius: `${12 * scale}px`,
            padding: `${18 * scale}px ${20 * scale}px`,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {scene.codeSnippet}
        </pre>
      )}
    </div>
  );
};

const HeroScene: React.FC<{ props: VideoProps; theme: VisualTheme }> = ({ props, theme }) => {
  const { scale } = useResponsive();
  return (
    <ResponsiveContainer>
      <DotsTitle text="NomikOS" themeId={theme.id} delay={5} />
      <div style={{ fontFamily: theme.fonts.body, fontSize: `${34 * scale}px`, color: theme.colors.muted, textAlign: 'center', maxWidth: `${1200 * scale}px` }}>
        {props.subtitle}
      </div>
      <DotsRow delay={12} />
    </ResponsiveContainer>
  );
};

const OutroScene: React.FC<{ props: VideoProps; theme: VisualTheme }> = ({ props, theme }) => {
  const { scale } = useResponsive();
  return (
    <ResponsiveContainer>
      <DotsTitle text="NomikOS" themeId={theme.id} delay={2} />
      <div style={{ fontFamily: theme.fonts.body, fontSize: `${30 * scale}px`, color: theme.colors.muted, textAlign: 'center', maxWidth: `${1100 * scale}px` }}>
        {props.subtitle}
      </div>
      <DotsRow delay={6} />
    </ResponsiveContainer>
  );
};

const SceneRenderer: React.FC<{ scene: Scene; props: VideoProps; theme: VisualTheme }> = ({ scene, props, theme }) => {
  const { scale } = useResponsive();
  const captioned = (CAPTIONED as string[]).includes(scene.actionType);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {scene.actionType === 'hero_dots' && <HeroScene props={props} theme={theme} />}
      {scene.actionType === 'outro_cta' && <OutroScene props={props} theme={theme} />}
      {scene.actionType === 'terminal' && (
        <ResponsiveContainer>
          <Enter delay={10}>
            <Terminal
              code={scene.codeSnippet ?? scene.narrationText}
              language={scene.codeLanguage ?? 'bash'}
              durationInFrames={scene.durationInFrames}
              theme={theme}
            />
          </Enter>
        </ResponsiveContainer>
      )}
      {scene.actionType === 'solana_tx' && (
        <ResponsiveContainer>
          <Enter delay={10}>
            <TxCard durationInFrames={scene.durationInFrames} theme={theme} invoiceId={`x402_${scene.id}`} />
          </Enter>
        </ResponsiveContainer>
      )}
      {scene.actionType === 'shields' && (
        <ResponsiveContainer>
          <Enter delay={10}>
            <ShieldsCard durationInFrames={scene.durationInFrames} theme={theme} />
          </Enter>
        </ResponsiveContainer>
      )}
      {(scene.actionType === 'diagram' ||
        scene.actionType === 'fleet_map' ||
        scene.actionType === 'voice_loop') && (
        <ResponsiveContainer>
          <Enter delay={10}>
            <SceneCard scene={scene} theme={theme} />
          </Enter>
        </ResponsiveContainer>
      )}
      {captioned && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: `${44 * scale}px`,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <CaptionCard text={scene.narrationText} durationInFrames={scene.durationInFrames} theme={theme} />
        </div>
      )}
    </div>
  );
};

export const MainComposition: React.FC<VideoProps> = (props) => {
  const theme = getTheme(props.themeId);
  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      <Series>
        {props.scenes.map((scene) => (
          <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
            <GlowBackground theme={theme} tint={TINTS[scene.actionType]} />
            {props.hasAudio && scene.audioFile ? <Audio src={staticFile(scene.audioFile)} /> : null}
            <SceneRenderer scene={scene} props={props} theme={theme} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
