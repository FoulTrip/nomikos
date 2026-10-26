"use server";
/* Server singleton — boots when module loads (container start). */

import { AIMode, OSState, OSMessage, DeviceApp } from "./types";
import { d1Query, d1Exec } from "./d1";

const g = globalThis as unknown as {
  __museOS?: {
    bootedAt: number;
    app: "home" | "agent" | "config";
    battery: number;
    messages: any[];
    agentTyping: boolean;
    aiMode: AIMode | null;
    lastRefresh: number;
  };
};
const os = (g.__museOS ??= {
  bootedAt: Date.now(),
  app: "home",
  battery: 80,
  messages: [],
  agentTyping: false,
  aiMode: null,
  lastRefresh: Date.now(),
});

const BOOT_MS = 2600;
const MAX_MSGS = 24;

// -----------------------------------------------------------------
// Persistencia en Cloudflare D1 (hackaton-meta-db, SQLite serverless).
// Best-effort: sin credenciales o si falla la API, el OS sigue en memoria.
async function persistState(key: string, value: string) {
  await d1Exec(
    "INSERT INTO os_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}

// Al arrancar el OS: recuperar los últimos mensajes y el estado guardado.
(async () => {
  try {
    const rows = await d1Query<{ role: "user" | "agent"; text: string; ts: number; mode: AIMode | null }>(
      "SELECT role, text, ts, mode FROM messages ORDER BY ts DESC LIMIT ?",
      [MAX_MSGS]
    );
    if (rows && rows.length > 0 && os.messages.length === 0) {
      os.messages = rows
        .map((r) => ({
          id: `${r.ts}-${Math.random().toString(36).slice(2, 8)}`,
          role: r.role,
          text: r.text,
          ts: Number(r.ts),
          mode: r.mode ?? undefined,
        }))
        .reverse();
    }
    const state = await d1Query<{ key: string; value: string }>(
      "SELECT key, value FROM os_state"
    );
    if (state) {
      for (const { key, value } of state) {
        if (key === "app" && (value === "home" || value === "agent" || value === "config")) {
          os.app = value;
        }
        if (key === "aiMode") {
          os.aiMode = value ? (value as AIMode) : null;
        }
      }
    }
  } catch {
    /* sin D1 → memoria */
  }
})();

// -----------------------------------------------------------------
// utils varios - Server Actions (async por "use server")
export async function mkId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
export async function mkISO(ms?: number) {
  return new Date(Date.now() + (ms || 0)).toISOString();
}

// -----------------------------------------------------------------
// acciones desde API routes ----
export async function tap() {
  os.app = os.app === "home" ? "agent" : "home";
  persistState("app", os.app);
}

export async function resetOS() {
  os.bootedAt = Date.now();
  os.messages = [];
  os.app = "home";
  os.agentTyping = false;
  os.aiMode = null;
  const now = Date.now();
  os.messages.push({
    id: await mkId(), role: "agent", text:
      "¡Hola! Soy Muse, el agente del ESP32-S3. Escribe en la consola o toca la pantalla para conversar.",
    ts: now, mode: "simulated",
  });
  await d1Exec("DELETE FROM messages");
  await persistState("app", "home");
  await persistState("aiMode", "");
  return os;
}

export async function getSnapshot() {
  const now = Date.now();
  const elapsed = now - os.bootedAt;
  const status = elapsed < BOOT_MS ? "booting" : "on";
  const progress = Math.min(1, elapsed / BOOT_MS);
  if (status === "on" && os.messages.length === 0) {
    os.messages.push({
      id: await mkId(), role: "agent", text:
        "¡Hola! Soy Muse, el agente del ESP32-S3. Escribe en la consola o toca la pantalla para conversar.",
      ts: now, mode: "simulated",
    });
  }
  return {
    status,
    bootProgress: progress,
    app: os.app,
    serverTime: now,
    battery: os.battery,
    messages: os.messages.slice(-MAX_MSGS),
    agentTyping: os.agentTyping,
    aiMode: os.aiMode,
  };
}

export async function tapOS() {
  os.app = os.app === "home" ? "agent" : "home";
  persistState("app", os.app);
}
export async function setAIMode(m: AIMode) {
  os.aiMode = m;
  persistState("aiMode", m ?? "");
}
export async function setTyping(b: boolean) { os.agentTyping = b; }

export async function pushMsg(role: "user" | "agent", text: string, mode?: AIMode) {
  const id = await mkId();
  const now = Date.now();
  os.messages.push({ id, role, text: text.slice(0, 230), ts: now, mode });
  if (os.messages.length > MAX_MSGS) os.messages.shift();
  // persistir en D1 (best-effort, no bloquea el chat)
  await d1Exec(
    "INSERT INTO messages (id, role, text, ts, mode) VALUES (?, ?, ?, ?, ?)",
    [id, role, text.slice(0, 230), now, mode ?? null]
  );
}

export async function trimMsgs() {
  if (os.messages.length > MAX_MSGS) os.messages.shift();
  await d1Exec(
    "DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY ts DESC LIMIT ?)",
    [MAX_MSGS]
  );
}

export async function finishChat(replyText: string, replyMode: AIMode = "simulated") {
  const now = Date.now();
  pushMsg("agent", replyText, replyMode);
  trimMsgs();
  setTyping(false);
}

// -----------------------------------------------------------------
// tipos exportados para consumo cliente
export type { OSState, OSMessage, DeviceApp, AIMode };
// -----------------------------------------------------------------