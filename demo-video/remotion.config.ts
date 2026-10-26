import { Config } from '@remotion/cli/config';

// Three.js en Remotion: OpenGL ANGLE para render determinista en Chromium.
Config.setChromiumOpenGlRenderer('angle');
