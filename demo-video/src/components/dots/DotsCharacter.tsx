import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { useResponsive } from '../responsive/Container';
import { FeltOverlay } from './FeltFilter';

export type DotsVariant = 'blob-blue' | 'frog-green' | 'drop-yellow' | 'heart-pink';

interface Skin {
  key: string;
  mid: string;
  deep: string;
  rim: string;
  glow: string;
  radius: string;
}

const SKINS: Record<DotsVariant, Skin> = {
  'blob-blue': {
    key: '#8FB8FF', mid: '#3B82F6', deep: '#1E4FD1', rim: '#B9D2FF', glow: '#3B82F6',
    radius: '50% 50% 52% 48% / 56% 56% 44% 44%',
  },
  'frog-green': {
    key: '#DCFFEA', mid: '#5BEA8C', deep: '#1FA855', rim: '#C4F7D4', glow: '#22C55E',
    radius: '48% 52% 50% 50% / 52% 50% 50% 48%',
  },
  'drop-yellow': {
    key: '#FFEDBE', mid: '#F7B733', deep: '#D97A1A', rim: '#FFE08A', glow: '#F59E0B',
    radius: '50% 50% 50% 50% / 60% 60% 40% 40%',
  },
  'heart-pink': {
    key: '#FFC2EA', mid: '#F65DBD', deep: '#C41B7E', rim: '#FF9DDA', glow: '#E879F9',
    radius: '56% 44% 50% 50% / 46% 50% 50% 54%',
  },
};

const Smile: React.FC<{ w: number; color?: string }> = ({ w, color = 'rgba(10,10,25,0.62)' }) => (
  <svg width={w} height={w * 0.5} viewBox="0 0 40 20">
    <path d="M6 5 Q20 19 34 5" stroke={color} strokeWidth={4.5} fill="none" strokeLinecap="round" />
  </svg>
);

const ClosedEye: React.FC<{ w: number; color?: string }> = ({ w, color = 'rgba(20,12,4,0.75)' }) => (
  <svg width={w} height={w * 0.45} viewBox="0 0 40 18">
    <path d="M5 13 Q20 2 35 13" stroke={color} strokeWidth={4.5} fill="none" strokeLinecap="round" />
  </svg>
);

// Glossy premium: volumen por gradientes en capas + specular de estudio + rim.
// glow 0..1 intensifica el halo exterior (spotlight reactivo al contenido).
export const DotsCharacter: React.FC<{
  variant: DotsVariant;
  delay?: number;
  floatOffset?: number;
  size?: number;
  glow?: number;
  still?: boolean;
  cycle?: number;
}> = ({ variant, delay = 0, floatOffset = 0, size = 260, glow = 0.25, still = false, cycle = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { scale } = useResponsive();
  const s = size * scale;
  const skin = SKINS[variant];

  // cycle>0: modo loop — todo periódico sobre `cycle` frames, sin entradas.
  const TAU = Math.PI * 2;
  const loop = cycle > 0;
  const enter = loop ? 1 : spring({ frame: frame - delay, fps, config: { damping: 90, stiffness: 120 } });
  const floatY = still
    ? 0
    : loop
      ? Math.sin(((TAU * (frame + floatOffset)) / cycle) * 2) * 8 * scale
      : Math.sin((frame + floatOffset) / 20) * 11 * scale;
  const squash = still
    ? 0
    : loop
      ? Math.sin(((TAU * (frame + floatOffset)) / cycle) * 3 + 1) * 0.02
      : Math.sin((frame + floatOffset) / 24) * 0.028;
  const wobble = still ? 0 : loop ? Math.sin((TAU * frame) / cycle + floatOffset) * 1.2 : Math.sin(frame / 34 + floatOffset) * 1.6;
  const blink = loop
    ? (frame + floatOffset) % (cycle / 4) < 6
      ? 0.08
      : 1
    : (frame + floatOffset) % 100 < 6
      ? 0.08
      : 1;
  const breathe = loop ? 0.5 + 0.5 * Math.sin((TAU * frame) / cycle) : 0.5 + 0.5 * Math.sin(frame / 70 + floatOffset);
  const halo = 0.22 + glow * 0.55 + breathe * 0.1;

  const h = s * (variant === 'drop-yellow' ? 1.1 : variant === 'heart-pink' ? 0.98 : 0.94);

  return (
    <div
      style={{
        width: s,
        height: h,
        transform: `translateY(${floatY}px) rotate(${wobble}deg) scale(${enter * (1 - squash)}, ${enter * (1 + squash)})`,
        opacity: enter > 0.02 ? 1 : 0,
        position: 'relative',
      }}
    >
      {/* halo exterior */}
      <div
        style={{
          position: 'absolute',
          inset: '-22%',
          background: `radial-gradient(closest-side, ${skin.glow}, transparent)`,
          filter: `blur(${30 * scale}px)`,
          opacity: halo,
        }}
      />
      {/* cuerpo */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: skin.radius,
          background: [
            `radial-gradient(ellipse 90% 62% at 30% 16%, rgba(255,255,255,0.6), transparent 60%)`,
            `radial-gradient(ellipse 120% 90% at 50% 118%, ${skin.rim}70, transparent 55%)`,
            variant === 'drop-yellow'
              ? `radial-gradient(circle 55% at 50% 62%, rgba(255,236,180,0.75), transparent 70%)`
              : `radial-gradient(circle 60% at 50% 55%, rgba(255,255,255,0.14), transparent 70%)`,
            `linear-gradient(165deg, ${skin.key} 0%, ${skin.mid} 52%, ${skin.deep} 100%)`,
          ].join(','),
          boxShadow: [
            `inset 0 ${10 * scale}px ${24 * scale}px rgba(255,255,255,0.4)`,
            `inset 0 ${-18 * scale}px ${36 * scale}px rgba(0,0,0,0.22)`,
            `inset ${8 * scale}px 0 ${24 * scale}px rgba(255,255,255,0.14)`,
            `inset ${-12 * scale}px 0 ${30 * scale}px rgba(0,0,0,0.24)`,
            `0 ${20 * scale}px ${60 * scale}px rgba(0,0,0,0.5)`,
          ].join(','),
          overflow: 'hidden',
        }}
      >
        {/* specular principal */}
        <div
          style={{
            position: 'absolute',
            left: '16%',
            top: '8%',
            width: '34%',
            height: '20%',
            borderRadius: '50%',
            transform: 'rotate(-18deg)',
            background: 'rgba(255,255,255,0.85)',
            filter: `blur(${7 * scale}px)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '12%',
            top: '30%',
            width: '9%',
            height: '9%',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.7)',
            filter: `blur(${3 * scale}px)`,
          }}
        />
        {/* reflejo inferior */}
        <div
          style={{
            position: 'absolute',
            left: '20%',
            bottom: '6%',
            width: '60%',
            height: '14%',
            borderRadius: '50%',
            background: `radial-gradient(closest-side, ${skin.rim}55, transparent)`,
            filter: `blur(${8 * scale}px)`,
          }}
        />
      </div>

      {/* caras y accesorios */}
      {variant === 'blob-blue' && (
        <>
          <div
            style={{
              position: 'absolute', left: '8%', top: '-13%', width: '76%', height: '30%',
              background: 'linear-gradient(180deg, #2A3358, #141A36)',
              borderRadius: '50%', transform: 'rotate(-7deg)',
              boxShadow: `0 ${6 * scale}px ${18 * scale}px rgba(0,0,0,0.55), inset 0 ${4 * scale}px ${10 * scale}px rgba(255,255,255,0.18)`,
              overflow: 'hidden',
            }}
          >
            <FeltOverlay opacity={0.25} />
          </div>
          <div style={{ position: 'absolute', left: '52%', top: '-19%', width: `${20 * scale}px`, height: `${20 * scale}px`, background: '#141A36', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', left: '0%', top: '44%', width: '100%', display: 'flex', justifyContent: 'center', gap: `${36 * scale}px` }}>
            {[0, 1].map((k) => (
              <div key={k} style={{ width: `${26 * scale}px`, height: `${34 * scale}px`, transform: `scaleY(${blink})` }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%, #ffffff, #D8E6FF)', boxShadow: `0 0 ${14 * scale}px rgba(255,255,255,0.75)` }} />
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', left: '0%', top: '66%', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Smile w={44 * scale} />
          </div>
        </>
      )}
      {variant === 'frog-green' && (
        <>
          <div style={{ position: 'absolute', left: '0%', top: '30%', width: '100%', display: 'flex', justifyContent: 'center', gap: `${16 * scale}px` }}>
            {[0, 1].map((k) => (
              <div key={k} style={{ width: `${68 * scale}px`, height: `${76 * scale}px`, transform: `scaleY(${blink})`, background: 'radial-gradient(circle at 35% 30%, #ffffff, #DDF3E4)', borderRadius: '50%', boxShadow: `inset 0 ${-6 * scale}px ${12 * scale}px rgba(0,0,0,0.12), 0 ${4 * scale}px ${10 * scale}px rgba(0,0,0,0.25)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: `${34 * scale}px`, height: `${40 * scale}px`, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #2A2A35, #0B0B12)', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '20%', top: '12%', width: '28%', height: '28%', borderRadius: '50%', background: 'rgba(255,255,255,0.95)' }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', left: '0%', top: '68%', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Smile w={40 * scale} />
          </div>
        </>
      )}
      {variant === 'drop-yellow' && (
        <>
          <div style={{ position: 'absolute', left: '0%', top: '46%', width: '100%', display: 'flex', justifyContent: 'center', gap: `${44 * scale}px` }}>
            <ClosedEye w={52 * scale} />
            <ClosedEye w={52 * scale} />
          </div>
          <div style={{ position: 'absolute', left: '16%', top: '58%', width: `${44 * scale}px`, height: `${24 * scale}px`, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255,110,120,0.55), transparent)' }} />
          <div style={{ position: 'absolute', right: '16%', top: '58%', width: `${44 * scale}px`, height: `${24 * scale}px`, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255,110,120,0.55), transparent)' }} />
          <div style={{ position: 'absolute', left: '0%', top: '68%', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Smile w={40 * scale} color="rgba(60,25,5,0.7)" />
          </div>
        </>
      )}
      {variant === 'heart-pink' && (
        <>
          <div
            style={{
              position: 'absolute', left: '10%', top: '38%', width: '80%', height: '34%',
              borderRadius: `${18 * scale}px`,
              background: 'linear-gradient(180deg, rgba(190,225,255,0.42), rgba(150,190,255,0.22))',
              border: `${2.5 * scale}px solid rgba(255,255,255,0.55)`,
              boxShadow: `0 ${6 * scale}px ${20 * scale}px rgba(0,0,0,0.3), inset 0 ${2 * scale}px ${8 * scale}px rgba(255,255,255,0.35)`,
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: `${30 * scale}px` }}>
              <svg width={34 * scale} height={20 * scale} viewBox="0 0 40 24">
                <path d="M6 18 Q20 4 34 18" stroke="#BFE3FF" strokeWidth={5} fill="none" strokeLinecap="round" />
              </svg>
              <svg width={30 * scale} height={18 * scale} viewBox="0 0 40 22">
                <path d="M8 6 Q20 20 32 6" stroke="#BFE3FF" strokeWidth={5} fill="none" strokeLinecap="round" />
              </svg>
              <svg width={34 * scale} height={20 * scale} viewBox="0 0 40 24">
                <path d="M6 18 Q20 4 34 18" stroke="#BFE3FF" strokeWidth={5} fill="none" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ position: 'absolute', left: '12%', bottom: '14%', display: 'flex', gap: `${8 * scale}px` }}>
              {['#F59E0B', '#38BDF8', '#22C55E'].map((c) => (
                <div key={c} style={{ width: `${10 * scale}px`, height: `${10 * scale}px`, borderRadius: '50%', background: c, boxShadow: `0 0 ${8 * scale}px ${c}` }} />
              ))}
            </div>
            <div style={{ position: 'absolute', left: '8%', top: '10%', width: '34%', height: '26%', borderRadius: '50%', background: 'rgba(255,255,255,0.5)', filter: `blur(${4 * scale}px)` }} />
          </div>
          <div style={{ position: 'absolute', left: '0%', top: '78%', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Smile w={36 * scale} color="rgba(60,5,40,0.65)" />
          </div>
        </>
      )}
    </div>
  );
};

export const DotsRow: React.FC<{ delay?: number; spotlight?: DotsVariant | null; cycle?: number }> = ({
  delay = 10,
  spotlight = null,
  cycle = 0,
}) => {
  const { scale, isVertical } = useResponsive();
  const variants: DotsVariant[] = ['blob-blue', 'frog-green', 'drop-yellow', 'heart-pink'];
  return (
    <div style={{ display: 'flex', gap: `${(isVertical ? 20 : 30) * scale}px`, alignItems: 'flex-end' }}>
      {variants.map((v, i) => (
        <DotsCharacter
          key={v}
          variant={v}
          delay={delay + i * 8}
          floatOffset={i * 24}
          size={isVertical ? 196 : 258}
          glow={spotlight ? (spotlight === v ? 1 : 0.12) : 0.3}
          cycle={cycle}
        />
      ))}
    </div>
  );
};
