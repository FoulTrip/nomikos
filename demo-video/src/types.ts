import { z } from 'zod';

// Acción visual por escena. El renderer elige componente según esto.
export const SceneActionType = z.enum([
  'hero_dots',
  'terminal',
  'diagram',
  'solana_tx',
  'shields',
  'fleet_map',
  'voice_loop',
  'outro_cta',
]);
export type SceneActionType = z.infer<typeof SceneActionType>;

export const CodeLanguage = z.enum(['rust', 'python', 'typescript', 'bash']);
export type CodeLanguage = z.infer<typeof CodeLanguage>;

export const SceneSchema = z.object({
  id: z.string().min(1),
  durationInFrames: z.number().int().positive(),
  narrationText: z.string().min(1),
  // Ruta relativa a public/, ej: "audio/scene-01.mp3". Si falta, la escena es muda.
  audioFile: z.string().optional(),
  codeSnippet: z.string().optional(),
  codeLanguage: CodeLanguage.optional(),
  // 402, 200, 409... para TxCard/diagramas x402
  httpStatus: z.number().int().optional(),
  actionType: SceneActionType,
});
export type Scene = z.infer<typeof SceneSchema>;

export const VideoPropsSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  themeId: z.string(),
  // true cuando public/audio/*.mp3 existe (scripts/generate-tts.py lo activa).
  hasAudio: z.boolean().optional(),
  scenes: z.array(SceneSchema).min(1),
});
export type VideoProps = z.infer<typeof VideoPropsSchema>;

export const totalFrames = (props: VideoProps): number =>
  props.scenes.reduce((acc, s) => acc + s.durationInFrames, 0);
