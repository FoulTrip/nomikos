import type { E2EConfig } from 'e2e';

export default {
  // Sin engine UI: suite de integridad del ecosistema (API testing puro).
  // workers: 1 serializa los archivos — los tests del gateway agéntico (05/06)
  // usan el mismo backend LLM y no deben competir por él.
  workers: 1,
  targets: [{ name: 'default', platform: 'custom' }],
} satisfies E2EConfig;
