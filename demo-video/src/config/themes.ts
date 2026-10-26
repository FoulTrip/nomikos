// Skills visuales: un themeId en data.json cambia todo el look sin tocar componentes.

export interface VisualTheme {
  id: string;
  label: string;
  colors: {
    bg: string;
    accent: string;
    text: string;
    muted: string;
    border: string;
    glow: string;
    // Glow cromático por letra para DotsTitle (d, o, t, s)
    glowPerLetter?: [string, string, string, string];
  };
  textures: {
    overlay: 'noise' | 'grid' | 'dots' | 'felt' | 'none';
    blurAmount: string;
    noiseOpacity: number;
  };
  fonts: {
    code: string;
    heading: string;
    body: string;
  };
}

export const THEMES: Record<string, VisualTheme> = {
  dots_plush: {
    id: 'dots_plush',
    label: 'Dots Plush (hero negro + felt)',
    colors: {
      bg: '#000000',
      accent: '#14F195',
      text: '#FFFFFF',
      muted: 'rgba(255,255,255,0.72)',
      border: 'rgba(255,255,255,0.12)',
      glow: 'rgba(20,241,149,0.35)',
      glowPerLetter: ['#3B82F6', '#22C55E', '#F59E0B', '#E879F9'],
    },
    textures: { overlay: 'felt', blurAmount: '40px', noiseOpacity: 0.1 },
    fonts: {
      code: '"JetBrains Mono", monospace',
      heading: 'Nunito, "Baloo 2", Inter, sans-serif',
      body: 'Inter, sans-serif',
    },
  },
  cyberpunk_dark: {
    id: 'cyberpunk_dark',
    label: 'Cyberpunk Dark (Solana)',
    colors: {
      bg: '#090d16',
      accent: '#14F195',
      text: '#F3F4F6',
      muted: 'rgba(243,244,246,0.7)',
      border: 'rgba(20,241,149,0.2)',
      glow: 'rgba(20,241,149,0.4)',
    },
    textures: { overlay: 'grid', blurAmount: '40px', noiseOpacity: 0.06 },
    fonts: {
      code: '"JetBrains Mono", monospace',
      heading: 'Inter, sans-serif',
      body: 'Inter, sans-serif',
    },
  },
  claude_matte: {
    id: 'claude_matte',
    label: 'Claude Matte (estudio claro)',
    colors: {
      bg: '#E8E4DC',
      accent: '#D97757',
      text: '#1A1A1A',
      muted: 'rgba(26,26,26,0.68)',
      border: 'rgba(26,26,26,0.12)',
      glow: 'rgba(217,119,87,0.3)',
    },
    textures: { overlay: 'dots', blurAmount: '60px', noiseOpacity: 0.05 },
    fonts: {
      code: '"Fira Code", monospace',
      heading: 'Inter, sans-serif',
      body: 'Inter, sans-serif',
    },
  },
};

export const getTheme = (id: string): VisualTheme =>
  THEMES[id] ?? THEMES.dots_plush;
