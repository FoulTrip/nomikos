import React, { useId } from 'react';

// Overlay de microfibra felt via feTurbulence. Determinista, sin assets.
export const FeltOverlay: React.FC<{ opacity?: number; borderRadius?: string | number }> = ({
  opacity = 0.12,
  borderRadius = 'inherit',
}) => {
  const id = useId().replace(/:/g, '');
  const filterId = `felt-${id}`;
  return (
    <svg
      width="100%"
      height="100%"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        borderRadius,
        pointerEvents: 'none',
      }}
    >
      <filter id={filterId}>
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${filterId})`} opacity={opacity} />
    </svg>
  );
};

// Grano global fullscreen para fondo negro dots.
export const NoiseOverlay: React.FC<{ opacity?: number }> = ({ opacity = 0.08 }) => {
  const id = useId().replace(/:/g, '');
  const filterId = `noise-${id}`;
  return (
    <svg
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <filter id={filterId}>
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${filterId})`} opacity={opacity} />
    </svg>
  );
};
