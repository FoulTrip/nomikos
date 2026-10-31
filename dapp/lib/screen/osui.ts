"use client";
/**
 * osui.ts — puente al crate Rust firmware/os-ui (fuente ÚNICA de la GUI).
 * El estado (JSON del api) entra, los píxeles salen: la pantalla que ves
 * la dibuja Rust (el mismo código que correrá en la placa), no canvas TS.
 */

export interface BancoView {
  tab: "main" | "receive" | "send";
  recv: "qr" | "nfc";
  send: "nfc" | "manual";
}

export type ListScroll = Record<string, number>;
export type OsTheme = "dark" | "light";

/** Estado del turno agéntico en curso (lo alimenta el micrófono/consola). */
export type OsChatStatus = "idle" | "listening" | "thinking" | "done" | "error";

export interface OsChatView {
  status: OsChatStatus;
  heard: string | null;
  /** ms desde que arrancó el turno (avanza los pasos del proceso). */
  elapsed_ms: number;
}

export interface OsUiView {
  scroll: { apps: number; providers: number; models: number };
  theme: OsTheme;
  /** Shade 0..100 (el panel lo lleva 0..1). */
  shadeP: number;
  micMuted: boolean;
  banco: BancoView;
  sendTo: string;
  chat: OsChatView;
  /** Hoja del historial completo de chat (pantalla deslizante). */
  chatFull: boolean;
  /** Progreso del deslizamiento 0..100 (0 = fuera, 100 = puesta). */
  chatAnim: number;
  /** Scroll vertical del historial (px desde el turno más antiguo). */
  chatScroll: number;
  /** La barra inferior del dispositivo es un input de escritura. */
  chatCompose: boolean;
  /** Texto que se está escribiendo al agente. */
  chatDraft: string;
  /** Drawer lateral de historial de chat (desliza de derecha a izquierda). */
  chatDrawer: boolean;
  /** Progreso del drawer 0..100 (0 = cerrado, 100 = abierto). */
  chatDrawerAnim: number;
  /** Scroll vertical del drawer (px desde el turno más antiguo). */
  chatDrawerScroll: number;
}

/** Subconjunto del NomikOSState que consume Rust (sin events/secretos). */
export interface OsUiState {
  stage: string;
  screen: string;
  locked: boolean;
  device_id: string | null;
  claim_code: string | null;
  boot_count: number;
  taps: number;
  apps: { slug: string; name: string; status: string; tools_count?: number }[];
  detail_app: string | null;
  llm?: {
    active_provider: string | null;
    providers: {
      provider: string;
      models?: string[];
      default_model?: string | null;
      has_key?: boolean;
      is_active?: boolean;
    }[] | null;
  } | null;
  agent_wallet?: {
    wallet_pubkey: string | null;
    network: string | null;
    balance_lamports: number | null;
  } | null;
  last_x402?: {
    status: string;
    access?: string;
    hint?: string;
    lamports?: number;
  } | null;
  last_reply?: { text: string; reply: string } | null;
  /** Historial completo de chat de la cuenta (lo pinta la hoja del OS). */
  chat?: {
    text: string;
    reply: string;
    artifacts?: { title: string; app: string; item_count: number }[];
  }[] | null;
}

interface OsUiModule {
  default: (options?: { module_or_path: string }) => Promise<void>;
  osui_render: (
    stateJson: string,
    viewJson: string,
    elapsedMs: bigint,
    hour: number,
    minute: number,
    dateLine: string,
  ) => Uint8Array;
  osui_hit: (stateJson: string, viewJson: string, px: number, py: number) => string;
  osui_frame_len: () => number;
  osui_width: () => number;
  osui_chat_scroll_max: (stateJson: string) => number;
}

let mod: OsUiModule | null = null;
let failed = false;

const JS_URL = "/wasm/os-ui/os_ui.js";
const WASM_URL = "/wasm/os-ui/os_ui_bg.wasm";

/** Carga el módulo WASM una vez. false = no disponible (ver fallback). */
export async function initOsUi(): Promise<boolean> {
  if (mod) return true;
  if (failed) return false;
  try {
    // webpackIgnore: artefacto precompilado en public/, no del bundle.
    const m = (await import(/* webpackIgnore: true */ JS_URL)) as OsUiModule;
    await m.default({ module_or_path: WASM_URL });
    // Sonda: un render mínimo debe devolver bytes (caza roturas temprano).
    const probe = m.osui_render("null", "{}", BigInt(0), 0, 0, "");
    if (!(probe instanceof Uint8Array) || probe.length !== m.osui_frame_len()) {
      throw new Error("sonda de render inválida");
    }
    if (m.osui_chat_scroll_max('{"chat":[]}') !== 0) {
      throw new Error("sonda de scroll de chat inválida");
    }
    mod = m;
    return true;
  } catch (e) {
    console.error("[os-ui] wasm no disponible:", e);
    failed = true;
    return false;
  }
}

export function osUiReady(): boolean {
  return mod !== null;
}

/** Renderiza un frame → ImageData 466×466 (null si wasm no está). */
export function renderOsUi(
  os: OsUiState | null,
  view: OsUiView,
  elapsedMs: number,
  clock: { hour: number; minute: number; date: string },
): ImageData | null {
  if (!mod) return null;
  try {
    const ms = Number.isFinite(elapsedMs) ? BigInt(Math.max(0, Math.floor(elapsedMs))) : BigInt(0);
    const bytes = mod.osui_render(
      JSON.stringify(os),
      JSON.stringify(view),
      ms,
      clock.hour,
      clock.minute,
      clock.date,
    );
    const w = mod.osui_width();
    return new ImageData(new Uint8ClampedArray(bytes), w, w);
  } catch (e) {
    console.error("[os-ui] render falló:", e);
    return null;
  }
}

/** Toque (px 466) → target ("" = nada). Prefijo "local:" = vista del panel. */
export function hitOsUi(os: OsUiState | null, view: OsUiView, px: number, py: number): string {
  if (!mod || !os) return "";
  try {
    return mod.osui_hit(JSON.stringify(os), JSON.stringify(view), px, py);
  } catch (e) {
    console.error("[os-ui] hit falló:", e);
    return "";
  }
}

/** Filas de una lista con scroll (para la rueda del ratón). */
export function scrollTotal(os: OsUiState | null, screen: string): number {
  if (!os) return 0;
  if (screen === "apps") return os.apps.length;
  if (screen === "providers") return (os.llm?.providers ?? []).filter((p) => p.has_key).length;
  if (screen === "models") {
    const active = (os.llm?.providers ?? []).find((p) => p.is_active);
    return active?.models?.length ?? 0;
  }
  return 0;
}

export function clampScroll(total: number, want: number): number {
  return Math.max(0, Math.min(Math.max(0, total - 4), Math.floor(want)));
}

export function chatScrollMax(os: OsUiState | null): number {
  if (mod && os) {
    try {
      return mod.osui_chat_scroll_max(JSON.stringify(os));
    } catch (e) {
      console.error("[os-ui] cálculo de scroll falló:", e);
    }
  }
  const chat = os?.chat ?? [];
  if (chat.length === 0) return 0;
  let total = 0;
  for (const turn of chat) {
    const userLines = Math.max(1, Math.min(64, Math.ceil(turn.text.length / 38)));
    const replyLines = Math.max(1, Math.min(64, Math.ceil(turn.reply.length / 38)));
    const userHeight = 24 + userLines * 15;
    const agentHeight = 24 + replyLines * 15;
    total += userHeight + 8 + agentHeight + 12;
  }
  return Math.max(0, total - 12 - (418 - 48));
}

export function clampChatScroll(os: OsUiState | null, want: number): number {
  const max = chatScrollMax(os);
  return Math.max(0, Math.min(max, Math.floor(want)));
}

const DRAWER_LIST_TOP = 136;
const DRAWER_LIST_BOT = 340;
const DRAWER_VISIBLE = DRAWER_LIST_BOT - DRAWER_LIST_TOP; // 204 px

/** Altura estimada de un bloque del historial (usuario+agente) para el drawer. */
function drawerChatBlockH(text: string, reply: string): number {
  const ul = Math.max(1, Math.ceil(text.length / 26));
  const rl = Math.max(1, Math.ceil(reply.length / 28));
  const uh = 16 + ul * 17;
  const ah = 16 + 20 + rl * 17 + 8;
  return uh + 10 + ah + 14;
}

export function chatDrawerScrollMax(os: OsUiState | null): number {
  const chat = os?.chat ?? [];
  if (chat.length === 0) return 0;
  let total = 0;
  for (const t of chat) total += drawerChatBlockH(t.text, t.reply);
  return Math.max(0, total - DRAWER_VISIBLE);
}

export function clampChatDrawerScroll(os: OsUiState | null, want: number): number {
  const max = chatDrawerScrollMax(os);
  return Math.max(0, Math.min(max, Math.floor(want)));
}
