import React from 'react';
import { useVideoConfig } from 'remotion';

export const useResponsive = () => {
  const { width, height } = useVideoConfig();
  const isVertical = height > width;
  const isSquare = width === height;
  // Base horizontal 1920, base vertical 1080. Escala lineal determinista.
  const scale = isVertical ? width / 1080 : width / 1920;
  return { width, height, isVertical, isSquare, scale };
};

export const ResponsiveContainer: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isVertical, scale } = useResponsive();
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: (isVertical ? 28 : 40) * scale,
        padding: isVertical ? `${48 * scale}px ${40 * scale}px` : `${60 * scale}px ${80 * scale}px`,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
};
