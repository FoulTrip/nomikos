"use client";
import { useSyncExternalStore } from "react";

import type { OSState, OSMessage, DeviceApp, AIMode } from "@/lib/os/types";
export type { OSState, OSMessage, DeviceApp, AIMode } from "@/lib/os/types";

export interface AIClientConfig {
  provider: "nvidia" | "meta" | "custom";
  baseUrl: string;
  model: string;
  apiKey: string;
}

// ---------- OS State (poll via /api/device/state) ----------
let snapshotOS: OSState | null = null;
const osListeners: Set<(state: OSState) => void> = new Set();

function emitOS() {
  osListeners.forEach((cb) => cb(snapshotOS!));
}

let osInterval: NodeJS.Timeout | null = null;

export async function refreshOS() {
  try {
    const res = await fetch("/api/device/state", { cache: "no-store" });
    if (res.ok) {
      snapshotOS = await res.json();
      emitOS();
    }
  } catch (e) {
    console.warn("refreshOS error", e);
  }
}

export function subscribeOS(cb: (state: OSState) => void) {
  osListeners.add(cb);
  // start interval once
  if (!osInterval) {
    refreshOS();
    osInterval = setInterval(refreshOS, 1_000);
  }
  return () => {
    osListeners.delete(cb);
    if (osListeners.size === 0 && osInterval) {
      clearInterval(osInterval);
      osInterval = null;
    }
  };
}

export function useOS() {
  return useSyncExternalStore(subscribeOS, () => snapshotOS ?? null, () => null);
}

// ---------- Acciones OS ----------
export async function tapScreen() {
  await fetch("/api/device/tap", { method: "POST", cache: "no-store" });
  await refreshOS();
}

export async function resetOS() {
  await fetch("/api/device/reset", { method: "POST", cache: "no-store" });
  await refreshOS();
}

// ---------- Config AI cliente (localStorage) ----------
const AI_CFG_KEY = "hackaton-meta.ai-config";

function loadAIClientConfig(): AIClientConfig {
  try {
    const stored = localStorage.getItem(AI_CFG_KEY);
    if (!stored) return defaultAIClientConfig();
    const p = JSON.parse(stored);
    return {
      provider: p.provider ?? "nvidia",
      baseUrl: p.baseUrl ?? "",
      model: p.model ?? "meta/llama-3.1-8b-instruct",
      apiKey: p.apiKey ?? "",
    };
  } catch {
    return defaultAIClientConfig();
  }
}

function saveAIClientConfig(cfg: AIClientConfig) {
  try {
    localStorage.setItem(AI_CFG_KEY, JSON.stringify(cfg));
  } catch {
    /* ignored */
  }
}

function defaultAIClientConfig(): AIClientConfig {
  return {
    provider: "nvidia",
    baseUrl: "",
    model: "meta/llama-3.1-8b-instruct",
    apiKey: "",
  };
}

export function useAIClientConfig(): AIClientConfig {
  return loadAIClientConfig();
}

export async function setAIClientConfig(cfg: Partial<AIClientConfig>) {
  const current = loadAIClientConfig();
  const next: AIClientConfig = { ...current, ...cfg };
  saveAIClientConfig(next);
}

// ---------- Envío de chat desde el cliente ----------
export async function sendClientChat(text: string, cfg?: Partial<AIClientConfig>) {
  // 1) guardar/actualizar config local si se provee
  if (cfg) await setAIClientConfig(cfg);

  // 2) obtener config actual
  const currentCfg = await useAIClientConfig();

  // 3) POST al servidor (el server-side hará la resolución real + LLM call)
  const res = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, config: currentCfg ?? {} }),
    // cache: "no-store",
  });
  await refreshOS();
  const data = await res.json();
  return data; // {ok, reply, mode, error?}
}