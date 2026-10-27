import React from 'react';
import { AbsoluteFill, Easing, interpolate, Series, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Bot, Boxes, Brain, Coins, KeyRound, Layers, ShieldCheck, Wallet, Zap } from 'lucide-react';
import type { Scene, VideoProps } from '../types';
import { getTheme, type VisualTheme } from '../config/themes';
import { ResponsiveContainer, useResponsive } from '../components/responsive/Container';
import { LogoLockup } from '../components/brand/LogoLockup';
import { GlowBackground } from '../components/fx/GlowBackground';
import { Enter } from '../components/fx/Enter';
import { FlowLine, NodeChip, Particles, StatusChip, CodeRain, hash01 } from '../components/motion/prims';
import { Terminal } from '../components/ui/Terminal';

// Fondo YouTube 16:9, mudo, 100% motion graphics. Sigue los mismos 8 bloques
// y timings del guion para acompañar la voz del presentador. Sin narraciones,
// sin captions, sin capturas: solo sistemas visuales del contexto.
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

const CHIPS: Record<string, { dot: string; text: string }> = {
  tesis: { dot: '#E879F9', text: 'ARCHITECTURE' },
  shields: { dot: '#22C55E', text: 'SHIELDS · LLAMA GUARD 3' },
  peaje: { dot: '#F59E0B', text: 'X402 · DELEGATED SIGNER' },
  confirm: { dot: '#22C55E', text: 'SETTLEMENT · ONE-SHOT' },
  stack: { dot: '#3B82F6', text: 'STACK · RUST + PYTHON' },
  limites: { dot: '#E879F9', text: 'LIMITS · DAILY CAP' },
};

const progressOf = (scene: Scene) => {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const frame = useCurrentFrame();
  return interpolate(frame, [0, scene.durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

// tesis: arquitectura viva Meta → Guard → x402 → dPaaS → Solana.
const ArchFlow: React.FC<{ scene: Scene; theme: VisualTheme }> = ({ scene, theme }) => {
  const p = progressOf(scene);
  const { scale } = useResponsive();
  const nodes = [
    { label: 'Meta LLM', sub: 'reason', Icon: Brain, color: '#38BDF8' },
    { label: 'Guard', sub: 'in / out', Icon: ShieldCheck, color: '#22C55E' },
    { label: 'x402', sub: '402 · pay', Icon: Zap, color: '#F59E0B' },
    { label: 'dPaaS', sub: 'RAM sign', Icon: KeyRound, color: '#E879F9' },
    { label: 'Solana', sub: 'devnet', Icon: Coins, color: '#14F195' },
  ];
  return (
    <div style={{ position: 'relative', width: `${1560 * scale}px`, maxWidth: '96%', height: `${560 * scale}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CodeRain color="#38BDF8" opacity={0.11} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {nodes.map((n, i) => {
        const a = interpolate(p, [i / nodes.length, (i + 0.7) / nodes.length], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
        <React.Fragment key={n.label}>
          <div style={{ transform: `scale(${1 + 0.05 * a})`, filter: a > 0.5 ? `drop-shadow(0 0 ${34 * scale}px ${n.color}77)` : 'none', transition: 'none' }}>
          <Enter delay={6 + i * 10} span={18}>
            <NodeChip
              icon={<n.Icon size={34 * scale} />}
              label={n.label}
              sub={n.sub}
              active={a}
              color={n.color}
              theme={theme}
              size={168}
            />
          </Enter>
          </div>
          {i < nodes.length - 1 && <FlowLine length={64 * scale} color={n.color} pulses={2} speed={3.2} />}
        </React.Fragment>
        );
      })}
      </div>
    </div>
  );
};

// shields: split-screen — terminal tipeando el filtro + tarjeta de estado live.
const GUARD_CODE = `$ nomik guard scan --in request.json
llama-guard3:1b · S1-S14 .......... SAFE
$ nomik tools exec --tool get_health
15 tools · policy ok · 41ms
$ nomik guard scan --out reply.json
llama-guard3:1b · S1-S14 .......... SAFE`;

const ShieldStatus: React.FC<{ scene: Scene; theme: VisualTheme }> = ({ scene, theme }) => {
  const p = progressOf(scene);
  const { scale } = useResponsive();
  const pct = Math.floor(Math.min(p * 1.12, 1) * 100);
  const R = 80 * scale;
  const C = 2 * Math.PI * R;
  const rows: [string, number][] = [['INPUT SCAN', 0.12], ['POLICY S1–S14', 0.38], ['OUTPUT SCAN', 0.64]];
  return (
    <div
      style={{
        width: `${440 * scale}px`,
        borderRadius: `${20 * scale}px`,
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.13)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 24px 60px rgba(0,0,0,0.45)',
        padding: `${28 * scale}px ${32 * scale}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: `${18 * scale}px`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: `${12 * scale}px`, fontFamily: theme.fonts.code, fontSize: `${21 * scale}px`, letterSpacing: '0.14em', color: theme.colors.muted }}>
        <Bot size={26 * scale} color="#22C55E" />
        GUARD · LIVE
      </div>
      <div style={{ position: 'relative', width: R * 2, height: R * 2 }}>
        <svg width={R * 2} height={R * 2}>
          <circle cx={R} cy={R} r={R - 8 * scale} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={11 * scale} />
          <circle
            cx={R}
            cy={R}
            r={R - 8 * scale}
            fill="none"
            stroke="#22C55E"
            strokeWidth={11 * scale}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct / 100)}
            transform={`rotate(-90 ${R} ${R})`}
            style={{ filter: `drop-shadow(0 0 ${10 * scale}px rgba(34,197,94,0.7))` }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: theme.fonts.code, fontWeight: 700, fontSize: `${40 * scale}px`, color: theme.colors.text }}>
          {pct}%
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${10 * scale}px`, width: '100%' }}>
        {rows.map(([label, at]) => {
          const on = p >= at;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: `${12 * scale}px`, fontFamily: theme.fonts.code, fontSize: `${20 * scale}px`, color: on ? theme.colors.text : theme.colors.muted, opacity: on ? 1 : 0.55 }}>
              <div style={{ width: `${11 * scale}px`, height: `${11 * scale}px`, borderRadius: '50%', background: on ? '#22C55E' : 'rgba(255,255,255,0.2)', boxShadow: on ? `0 0 ${10 * scale}px #22C55E` : 'none' }} />
              {label}
              <span style={{ marginLeft: 'auto', color: on ? '#22C55E' : 'transparent' }}>✓</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ShieldSplit: React.FC<{ scene: Scene; theme: VisualTheme }> = ({ scene, theme }) => {
  const { scale } = useResponsive();
  return (
    <div style={{ display: 'flex', gap: `${52 * scale}px`, alignItems: 'center' }}>
      <Enter delay={8} span={20}>
        <Terminal code={GUARD_CODE} title="nomik — shields" language="bash" durationInFrames={scene.durationInFrames} theme={theme} width={920} />
      </Enter>
      <Enter delay={22} span={20}>
        <ShieldStatus scene={scene} theme={theme} />
      </Enter>
    </div>
  );
};

// peaje: tarjeta 3D que se firma y vuela hacia el beacon devnet.
const SIG_HEX = '8f2a41c9e7b0d5f63a19e4c8b2d6f0a5e7c9d1b3f6a8e0c4d2b6f8a0e4c6d8a2b4e7c1';
const TxFlight: React.FC<{ scene: Scene; theme: VisualTheme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, scene.durationInFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const { scale } = useResponsive();
  const signP = interpolate(p, [0.22, 0.52], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const signed = SIG_HEX.slice(0, Math.floor(signP * SIG_HEX.length));
  const flyP = interpolate(p, [0.48, 0.95], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const sealed = p > 0.9;
  const tx = interpolate(flyP, [0, 1], [-330, 400]) * scale;
  const rotY = -17 + flyP * 30;
  const rotX = 8 - flyP * 10 + Math.sin(frame / 26) * 1.4;
  const streak = Math.sin(Math.min(Math.max(flyP, 0), 1) * Math.PI);
  const enter = interpolate(frame, [0, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: 'relative', width: `${1560 * scale}px`, maxWidth: '96%', height: `${560 * scale}px` }}>
      {/* beacon devnet */}
      <div style={{ position: 'absolute', right: `${40 * scale}px`, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: `${14 * scale}px` }}>
        <div style={{ position: 'relative', width: `${110 * scale}px`, height: `${110 * scale}px` }}>
          {[0, 1].map((k) => {
            const t = ((frame + k * 40) % 80) / 80;
            return (
              <div key={k} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `${2 * scale}px solid #14F195`, opacity: (1 - t) * 0.55, transform: `scale(${0.55 + t * 1.5})` }} />
            );
          })}
          <div style={{ position: 'absolute', inset: `${22 * scale}px`, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #8affd8, #14F195 55%, #0a5c38)', boxShadow: `0 0 ${sealed ? 60 : 34 * scale}px rgba(20,241,149,${sealed ? 0.9 : 0.55})` }} />
          {sealed && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${34 * scale}px`, color: '#04120b', fontWeight: 800 }}>✓</div>
          )}
        </div>
        <div style={{ fontFamily: theme.fonts.code, fontSize: `${20 * scale}px`, letterSpacing: '0.14em', color: theme.colors.muted }}>devnet</div>
      </div>
      {/* estelas de velocidad */}
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: `${(30 + i * 11) * scale + 130 * scale}px`,
            left: `${(60 + hash01(i, 21) * 500) * scale}px`,
            width: `${(120 + hash01(i, 22) * 200) * scale * (0.4 + 0.6 * streak)}px`,
            height: `${2.5 * scale}px`,
            borderRadius: 4,
            background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.7))',
            opacity: streak * 0.8,
          }}
        />
      ))}
      {/* tarjeta en vuelo */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: `${1400 * scale}px` }}>
        <div
          style={{
            transform: `translateX(${tx}px) rotateY(${rotY}deg) rotateX(${rotX}deg) scale(${0.85 + 0.15 * enter})`,
            opacity: enter,
            width: `${600 * scale}px`,
            borderRadius: `${22 * scale}px`,
            background: 'linear-gradient(160deg, rgba(30,28,20,0.92), rgba(12,12,16,0.94))',
            backdropFilter: 'blur(10px)',
            border: `1.5px solid ${sealed ? '#22C55E' : 'rgba(245,158,11,0.55)'}`,
            boxShadow: sealed
              ? `0 0 ${60 * scale}px rgba(34,197,94,0.45), 0 ${30 * scale}px ${80 * scale}px rgba(0,0,0,0.6)`
              : `0 0 ${44 * scale}px rgba(245,158,11,0.3), 0 ${30 * scale}px ${80 * scale}px rgba(0,0,0,0.6)`,
            padding: `${30 * scale}px ${34 * scale}px`,
            transformStyle: 'preserve-3d',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: `${14 * scale}px`, marginBottom: `${18 * scale}px` }}>
            <Zap size={30 * scale} color="#F59E0B" />
            <span style={{ fontFamily: theme.fonts.code, fontWeight: 700, fontSize: `${25 * scale}px`, color: theme.colors.text }}>402 · INVOICE</span>
            <span style={{ marginLeft: 'auto', fontFamily: theme.fonts.code, fontSize: `${23 * scale}px`, color: '#F59E0B' }}>◎ 0.0001</span>
          </div>
          <div style={{ fontFamily: theme.fonts.code, fontSize: `${21 * scale}px`, color: theme.colors.muted, marginBottom: `${16 * scale}px` }}>
            payer <span style={{ color: theme.colors.text }}>7xKp…9f</span> → payee <span style={{ color: theme.colors.text }}>3Nm…2b</span>
          </div>
          <div style={{ fontFamily: theme.fonts.code, fontSize: `${12 * scale}px`, letterSpacing: '0.2em', color: theme.colors.muted, marginBottom: `${8 * scale}px` }}>
            ED25519 SIGNATURE
          </div>
          <div
            style={{
              fontFamily: theme.fonts.code,
              fontSize: `${19 * scale}px`,
              lineHeight: 1.7,
              color: '#F59E0B',
              wordBreak: 'break-all',
              minHeight: `${66 * scale}px`,
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: `${10 * scale}px`,
              padding: `${12 * scale}px ${16 * scale}px`,
            }}
          >
            {signed}
            {!sealed && <span style={{ opacity: frame % 20 < 12 ? 1 : 0 }}>▌</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: `${12 * scale}px`, marginTop: `${18 * scale}px`, fontFamily: theme.fonts.code, fontSize: `${21 * scale}px`, color: sealed ? '#22C55E' : '#F59E0B' }}>
            <div style={{ width: `${11 * scale}px`, height: `${11 * scale}px`, borderRadius: '50%', background: sealed ? '#22C55E' : '#F59E0B', boxShadow: `0 0 ${10 * scale}px currentColor` }} />
            {sealed ? 'SEALED → devnet ✓' : signP > 0 ? 'SIGNING in RAM…' : 'AWAITING PAYMENT'}
          </div>
        </div>
      </div>
    </div>
  );
};

// confirm: sello de settlement dibujándose + ledger.
const SettleSeal: React.FC<{ scene: Scene; theme: VisualTheme }> = ({ scene, theme }) => {
  const p = progressOf(scene);
  const { scale } = useResponsive();
  const R = 110 * scale;
  const C = 2 * Math.PI * R;
  const draw = interpolate(p, [0.05, 0.55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const check = interpolate(p, [0.55, 0.75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const rows = [
    { t: 'settled', ok: true },
    { t: 'consumed_at', ok: true },
    { t: 'replay → 409', ok: false },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: `${70 * scale}px` }}>
      <div style={{ position: 'relative', width: R * 2, height: R * 2 }}>
        <svg width={R * 2} height={R * 2}>
          <circle cx={R} cy={R} r={R - 6 * scale} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={5 * scale} />
          <circle
            cx={R}
            cy={R}
            r={R - 6 * scale}
            fill="none"
            stroke="#22C55E"
            strokeWidth={5 * scale}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - draw)}
            transform={`rotate(-90 ${R} ${R})`}
            style={{ filter: `drop-shadow(0 0 ${14 * scale}px rgba(34,197,94,0.7))` }}
          />
          <path
            d={`M ${R - 44 * scale} ${R + 4 * scale} L ${R - 12 * scale} ${R + 34 * scale} L ${R + 46 * scale} ${R - 30 * scale}`}
            fill="none"
            stroke="#22C55E"
            strokeWidth={9 * scale}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - check}
          />
        </svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${16 * scale}px` }}>
        {rows.map((r, i) => {
          const on = interpolate(p, [0.3 + i * 0.18, 0.44 + i * 0.18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          if (on <= 0) return <div key={r.t} style={{ height: `${46 * scale}px` }} />;
          return (
            <div
              key={r.t}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: `${14 * scale}px`,
                fontFamily: theme.fonts.code,
                fontSize: `${24 * scale}px`,
                color: r.ok ? theme.colors.text : '#F59E0B',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: `${12 * scale}px`,
                padding: `${10 * scale}px ${22 * scale}px`,
                opacity: on,
                transform: `translateX(${(1 - on) * 24 * scale}px)`,
              }}
            >
              <span style={{ color: r.ok ? '#22C55E' : '#F59E0B' }}>{r.ok ? '✓' : '⊘'}</span>
              {r.t}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// stack: 3 capas glass con partículas ascendentes.
const LayerStack: React.FC<{ scene: Scene; theme: VisualTheme }> = ({ scene, theme }) => {
  const p = progressOf(scene);
  const { scale } = useResponsive();
  const layers = [
    { label: 'panel', sub: 'next.js · 3D', Icon: Boxes, color: '#38BDF8' },
    { label: 'brain', sub: 'llama stack', Icon: Brain, color: '#E879F9' },
    { label: 'api', sub: 'axum · xchacha', Icon: Layers, color: '#22C55E' },
  ];
  return (
    <div style={{ position: 'relative', display: 'flex', gap: `${90 * scale}px`, alignItems: 'stretch' }}>
      <Particles count={36} color="#3B82F6" opacity={0.4} speed={0.3} />
      <FlowLine length={300 * scale} color="#3B82F6" pulses={3} speed={3} vertical />
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${22 * scale}px`, justifyContent: 'center' }}>
        {layers.map((l, i) => {
          const on = interpolate(p, [i * 0.22, i * 0.22 + 0.2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
          if (on <= 0) return <div key={l.label} style={{ height: `${92 * scale}px` }} />;
          return (
            <div
              key={l.label}
              style={{
                width: `${620 * scale}px`,
                display: 'flex',
                alignItems: 'center',
                gap: `${18 * scale}px`,
                background: 'rgba(255,255,255,0.05)',
                backdropFilter: 'blur(10px)',
                border: `1px solid ${l.color}66`,
                borderRadius: `${16 * scale}px`,
                padding: `${20 * scale}px ${28 * scale}px`,
                boxShadow: `0 0 ${26 * scale}px ${l.color}33`,
                opacity: on,
                transform: `translateX(${(1 - on) * 40 * scale}px)`,
              }}
            >
              <span style={{ color: l.color, display: 'flex' }}>
                <l.Icon size={32 * scale} />
              </span>
              <span style={{ fontFamily: theme.fonts.code, fontWeight: 700, fontSize: `${28 * scale}px`, color: theme.colors.text }}>{l.label}</span>
              <span style={{ fontFamily: theme.fonts.code, fontSize: `${22 * scale}px`, color: theme.colors.muted }}>{l.sub}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Dígitos estilo slot-machine: ruedan rápido y se fijan escalonados.
const SlotNumber: React.FC<{ value: number; digits: number; progress: number; start: number; theme: VisualTheme }> = ({
  value,
  digits,
  progress,
  start,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { scale } = useResponsive();
  const str = String(value).padStart(digits, '0');
  return (
    <div style={{ display: 'flex', gap: `${7 * scale}px` }}>
      {str.split('').map((ch, d) => {
        const settled = progress >= start + d * 0.05 + 0.08;
        const digit = settled ? ch : String((frame * 5 + d * 3 + value * 7) % 10);
        return (
          <div
            key={d}
            style={{
              width: `${40 * scale}px`,
              height: `${52 * scale}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: theme.fonts.code,
              fontWeight: 700,
              fontSize: `${30 * scale}px`,
              color: settled ? theme.colors.text : theme.colors.muted,
              background: 'rgba(0,0,0,0.45)',
              border: `1px solid ${settled ? 'rgba(232,121,249,0.5)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: `${9 * scale}px`,
            }}
          >
            {digit}
          </div>
        );
      })}
    </div>
  );
};

// limites: gauge de cap diario con aguja elástica + órbita 24/7.
const LimitGauge: React.FC<{ scene: Scene; theme: VisualTheme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame, [0, scene.durationInFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const { scale } = useResponsive();
  const CAP = 0.72;
  // Muelle determinista estirado al 75% de la escena: sobrepasa y vibra.
  const elastic = spring({ frame, fps, config: { damping: 9, stiffness: 110 }, durationInFrames: scene.durationInFrames * 0.75 });
  const e = Math.max(0, elastic);
  const fill = Math.min(e, 1) * CAP;
  const needle = Math.min(e, 1.07) * CAP;
  const R = 130 * scale;
  const arc = (r: number, a0: number, a1: number) => {
    const x = (a: number) => R + r * Math.cos(a);
    const y = (a: number) => R + r * Math.sin(a);
    return `M ${x(a0)} ${y(a0)} A ${r} ${r} 0 0 1 ${x(a1)} ${y(a1)}`;
  };
  const A0 = Math.PI * 0.75;
  const A1 = Math.PI * 2.25;
  const totalLen = R * (A1 - A0);
  const pct = Math.floor(fill * 100);
  const orbit = p * Math.PI * 4;
  const ox = R + (R + 34 * scale) * Math.cos(orbit - Math.PI / 2);
  const oy = R + (R + 34 * scale) * Math.sin(orbit - Math.PI / 2);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: `${60 * scale}px` }}>
      <div style={{ position: 'relative', width: R * 2, height: R * 2 }}>
        <svg width={R * 2} height={R * 2}>
          <path d={arc(R - 10 * scale, A0, A1)} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={14 * scale} strokeLinecap="round" />
          <path
            d={arc(R - 10 * scale, A0, A0 + (A1 - A0) * fill)}
            fill="none"
            stroke="#E879F9"
            strokeWidth={14 * scale}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 ${12 * scale}px rgba(232,121,249,0.7))` }}
          />
          <line x1={R} y1={R} x2={R + (R - 34 * scale) * Math.cos(A0 + (A1 - A0) * needle)} y2={R + (R - 34 * scale) * Math.sin(A0 + (A1 - A0) * needle)} stroke="#fff" strokeWidth={5 * scale} strokeLinecap="round" />
          <circle cx={R} cy={R} r={9 * scale} fill="#fff" />
          <circle cx={R} cy={R} r={R + 34 * scale} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={2 * scale} strokeDasharray={`${6 * scale} ${10 * scale}`} />
          <circle cx={ox} cy={oy} r={7 * scale} fill="#14F195" />
          <circle cx={ox} cy={oy} r={13 * scale} fill="#14F195" opacity={0.3} />
        </svg>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${34 * scale}px`, textAlign: 'center', fontFamily: theme.fonts.code, fontWeight: 700, fontSize: `${44 * scale}px`, color: theme.colors.text }}>
          {pct}%
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${6 * scale}px`, textAlign: 'center', fontFamily: theme.fonts.code, fontSize: `${19 * scale}px`, color: theme.colors.muted }}>
          daily cap · 24/7
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${20 * scale}px` }}>
        {[
          { label: 'TX SETTLED', value: 1284, digits: 5, start: 0.08 },
          { label: 'REPLAYS BLOCKED', value: 37, digits: 4, start: 0.3 },
          { label: 'WALLETS', value: 12, digits: 3, start: 0.52 },
        ].map((r) => (
          <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: `${10 * scale}px` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: `${12 * scale}px`, fontFamily: theme.fonts.code, fontSize: `${20 * scale}px`, letterSpacing: '0.12em', color: theme.colors.muted }}>
              <Wallet size={22 * scale} color="#E879F9" />
              {r.label}
            </div>
            <SlotNumber value={r.value} digits={r.digits} progress={p} start={r.start} theme={theme} />
          </div>
        ))}
      </div>
    </div>
  );
};

// Fallback genérico: campo orbital con el chip del bloque.
const OrbitField: React.FC<{ scene: Scene; theme: VisualTheme; color: string }> = ({ scene, theme, color }) => {
  const frame = useCurrentFrame();
  const { scale } = useResponsive();
  const R = 170 * scale;
  return (
    <div style={{ position: 'relative', width: R * 2, height: R * 2 }}>
      {[0.55, 0.8, 1].map((k, ri) => (
        <div key={ri} style={{ position: 'absolute', inset: `${(1 - k) * 50}%`, border: '1px solid rgba(255,255,255,0.12)', borderRadius: '50%' }} />
      ))}
      {Array.from({ length: 9 }).map((_, i) => {
        const ring = [0.55, 0.8, 1][i % 3];
        const a = frame / (70 + (i % 3) * 26) + (i * 2 * Math.PI) / 9 + hash01(i, 5);
        const x = R + R * ring * Math.cos(a);
        const y = R + R * ring * Math.sin(a);
        return <div key={i} style={{ position: 'absolute', left: x - 5 * scale, top: y - 5 * scale, width: `${10 * scale}px`, height: `${10 * scale}px`, borderRadius: '50%', background: color, opacity: 0.55 + 0.4 * hash01(i, 6), boxShadow: `0 0 ${12 * scale}px ${color}` }} />;
      })}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: `${54 * scale}px`, height: `${54 * scale}px`, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, #fff, ${color})`, boxShadow: `0 0 ${44 * scale}px ${color}` }} />
      </div>
      <Particles count={20} color={color} opacity={0.3} speed={0.2} />
    </div>
  );
};

const IntroCover: React.FC<{ theme: VisualTheme }> = ({ theme }) => (
  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <ResponsiveContainer>
      <LogoLockup theme={theme} staged />
    </ResponsiveContainer>
    <LensCalibrate />
  </div>
);

// Calibración de lente en la intro: esquinas que convergen + barrido,
// se disipa cuando empieza la escritura (f90).
const LensCalibrate: React.FC = () => {
  const frame = useCurrentFrame();
  const { scale } = useResponsive();
  const env = interpolate(frame, [0, 18, 86, 130], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (env <= 0) return null;
  const m = interpolate(frame, [0, 80], [170, 72], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }) * scale;
  const sweep = interpolate(frame, [8, 82], [6, 94], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const b = 58 * scale;
  const t = 2 * scale;
  const corner = (pos: React.CSSProperties, border: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', width: b, height: b, ...pos, ...border,
  });
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: env * 0.6, pointerEvents: 'none' }}>
      <div style={corner({ left: m, top: m }, { borderLeft: `${t}px solid #fff`, borderTop: `${t}px solid #fff` })} />
      <div style={corner({ right: m, top: m }, { borderRight: `${t}px solid #fff`, borderTop: `${t}px solid #fff` })} />
      <div style={corner({ left: m, bottom: m }, { borderLeft: `${t}px solid #fff`, borderBottom: `${t}px solid #fff` })} />
      <div style={corner({ right: m, bottom: m }, { borderRight: `${t}px solid #fff`, borderBottom: `${t}px solid #fff` })} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: `${64 * scale}px`, height: `${t}px`, background: '#fff', transform: 'translate(-50%,-50%)', opacity: 0.5 }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: `${t}px`, height: `${64 * scale}px`, background: '#fff', transform: 'translate(-50%,-50%)', opacity: 0.5 }} />
      <div style={{ position: 'absolute', left: '6%', right: '6%', top: `${sweep}%`, height: `${t}px`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
    </div>
  );
};

const OutroCover: React.FC<{ theme: VisualTheme }> = ({ theme }) => (
  <ResponsiveContainer>
    <LogoLockup theme={theme} staged={false} zoom footerLines={['github.com/FoulTrip/nomikos', 'BUILT FOR META HACKATHON']} />
  </ResponsiveContainer>
);

// Destello anamórfico al abrir cada bloque: línea de luz horizontal.
const AnamorphicFlare: React.FC<{ color?: string }> = ({ color = '#9db8ff' }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [4, 12, 34], [0, 0.85, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (o <= 0) return null;
  const y = 38 + Math.sin(frame / 6) * 1.5;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: o }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: `${y}%`, height: 2, background: `linear-gradient(90deg, transparent 8%, ${color} 50%, transparent 92%)` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: `${y}%`, height: 60, transform: 'translateY(-50%)', background: `linear-gradient(90deg, transparent 20%, ${color}44 50%, transparent 80%)`, filter: 'blur(12px)' }} />
    </div>
  );
};

// Bokeh frontal: orbes desenfocados a la deriva para dar profundidad.
const BOKEH = [
  { x: 12, y: 22, r: 130, c: '#3B82F6', sp: 90, ph: 0 },
  { x: 86, y: 68, r: 190, c: '#E879F9', sp: 120, ph: 2 },
  { x: 72, y: 18, r: 100, c: '#22C55E', sp: 75, ph: 4 },
  { x: 24, y: 78, r: 150, c: '#F59E0B', sp: 105, ph: 1 },
];
const BokehField: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {BOKEH.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${b.x + Math.sin(frame / b.sp + b.ph) * 3}%`,
            top: `${b.y + Math.cos(frame / (b.sp * 1.3) + b.ph) * 4}%`,
            width: b.r * 2,
            height: b.r * 2,
            borderRadius: '50%',
            background: `radial-gradient(closest-side, ${b.c}2e, transparent)`,
            filter: 'blur(30px)',
          }}
        />
      ))}
    </div>
  );
};

const SceneStage: React.FC<{ scene: Scene; props: VideoProps; theme: VisualTheme }> = ({ scene, props, theme }) => {
  const { scale } = useResponsive();
  const chip = CHIPS[scene.id];
  const tint = TINTS[scene.actionType] ?? '#E879F9';
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <AnamorphicFlare color={tint} />
      {scene.actionType === 'hero_dots' && <IntroCover theme={theme} />}
      {scene.actionType === 'outro_cta' && <OutroCover theme={theme} />}
      {scene.actionType === 'terminal' && (
        <ResponsiveContainer>
          <LayerStack scene={scene} theme={theme} />
        </ResponsiveContainer>
      )}
      {scene.actionType === 'diagram' && scene.id === 'tesis' && (
        <ResponsiveContainer>
          <ArchFlow scene={scene} theme={theme} />
        </ResponsiveContainer>
      )}
      {scene.actionType === 'diagram' && scene.id === 'confirm' && (
        <ResponsiveContainer>
          <SettleSeal scene={scene} theme={theme} />
        </ResponsiveContainer>
      )}
      {scene.actionType === 'diagram' && scene.id === 'limites' && (
        <ResponsiveContainer>
          <LimitGauge scene={scene} theme={theme} />
        </ResponsiveContainer>
      )}
      {scene.actionType === 'solana_tx' && (
        <ResponsiveContainer>
          <TxFlight scene={scene} theme={theme} />
        </ResponsiveContainer>
      )}
      {scene.actionType === 'shields' && (
        <ResponsiveContainer>
          <ShieldSplit scene={scene} theme={theme} />
        </ResponsiveContainer>
      )}
      {scene.actionType === 'fleet_map' && (
        <ResponsiveContainer>
          <LimitGauge scene={scene} theme={theme} />
        </ResponsiveContainer>
      )}
      {scene.actionType === 'voice_loop' && (
        <ResponsiveContainer>
          <OrbitField scene={scene} theme={theme} color={tint} />
        </ResponsiveContainer>
      )}
      {chip && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${46 * scale}px`, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <StatusChip dot={chip.dot} text={chip.text} theme={theme} />
        </div>
      )}
    </div>
  );
};

export const BackdropMotion: React.FC<VideoProps> = (props) => {
  const theme = getTheme(props.themeId);
  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      <Series>
        {props.scenes.map((scene) => (
          <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
            <GlowBackground theme={theme} tint={TINTS[scene.actionType]} />
            <SceneStage scene={scene} props={props} theme={theme} />
          </Series.Sequence>
        ))}
      </Series>
      <BokehField />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 78% 72% at 50% 45%, transparent 58%, rgba(0,0,0,0.42) 100%)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
