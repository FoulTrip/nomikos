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
}

interface OsUiModule {
  default: (url?: string) => Promise<void>;
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
    await m.default(WASM_URL);
    // Sonda: un render mínimo debe devolver bytes (caza roturas temprano).
    const probe = m.osui_render("null", "{}", BigInt(0), 0, 0, "");
    if (!(probe instanceof Uint8Array) || probe.length !== m.osui_frame_len()) {
      throw new Error("sonda de render inválida");
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
