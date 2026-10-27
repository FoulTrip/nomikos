"use client";
/**
 * Mascot — la mascota NomikOS (tercer blob: huevo dorado de ojos
 * cerrados y mejillas rosas), recreada en SVG animado con SMIL
 * (sin CSS ni assets). El ánimo sigue al turno: flota en reposo,
 * bota al escuchar, se balancea al pensar.
 */

import type { AgentStatus } from "@/lib/viewer/agent";

export default function Mascot({
  mood,
  size = 48,
}: {
  mood: AgentStatus;
  size?: number;
}) {
  const anim =
    mood === "listening" ? (
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -6; 0 0"
        dur="0.7s"
        repeatCount="indefinite"
      />
    ) : mood === "thinking" ? (
      <animateTransform
        attributeName="transform"
        type="rotate"
        values="-6 50 56; 6 50 56; -6 50 56"
        dur="1.6s"
        repeatCount="indefinite"
      />
    ) : (
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -3; 0 0"
        dur="2.8s"
        repeatCount="indefinite"
      />
    );

  return (
    <svg
      width={size}
      height={(size * 112) / 100}
      viewBox="0 0 100 112"
      role="img"
      aria-label="Mascota NomikOS"
      className="shrink-0"
    >
      <defs>
        <radialGradient id="mascot-gold" cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#f7cf5f" />
          <stop offset="45%" stopColor="#c8922a" />
          <stop offset="100%" stopColor="#6e4a0e" />
        </radialGradient>
      </defs>
      <g>
        {anim}
        <ellipse cx="50" cy="56" rx="44" ry="52" fill="url(#mascot-gold)" />
        <ellipse
          cx="64"
          cy="30"
          rx="17"
          ry="11"
          fill="#ffffff"
          opacity="0.75"
          transform="rotate(-24 64 30)"
        />
        <circle cx="30" cy="52" r="4.5" fill="#ffffff" opacity="0.7" />
        {/* ojos cerrados felices */}
        <path d="M30 62 Q36 56 42 62" stroke="#3a2708" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M58 62 Q64 56 70 62" stroke="#3a2708" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* sonrisa + rubor */}
        <path d="M44 78 Q50 83 56 78" stroke="#3a2708" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <ellipse cx="28" cy="72" rx="7" ry="4.5" fill="#f4728c" opacity="0.6" />
        <ellipse cx="72" cy="72" rx="7" ry="4.5" fill="#f4728c" opacity="0.6" />
      </g>
    </svg>
  );
}
