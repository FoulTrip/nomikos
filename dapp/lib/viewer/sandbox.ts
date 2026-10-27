"use client";
/**
 * lib/viewer/sandbox.ts — modo sandbox efímero del panel.
 *
 * ON = sesión de prueba en el navegador: habilita el select de
 * dispositivos, el visor 3D y el detector de entorno; la sesión usa los
 * parámetros de la cuenta (proveedor, modelo, dapps, wallet) sin guardar
 * nada en el servidor. El estado persiste solo en localStorage.
 */
import { useSyncExternalStore } from "react";

const KEY = "nomikos-sandbox";
const STATS_KEY = "nomikos-sandbox-stats";

export interface SandboxStats {
  sessions: number;
  last_at: number | null;
}

export function getSandboxStats(): SandboxStats {
  if (typeof window === "undefined") return { sessions: 0, last_at: null };
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    if (!raw) return { sessions: 0, last_at: null };
    const v = JSON.parse(raw) as Partial<SandboxStats>;
    return {
      sessions: typeof v.sessions === "number" ? v.sessions : 0,
      last_at: typeof v.last_at === "number" ? v.last_at : null,
    };
  } catch {
    return { sessions: 0, last_at: null };
  }
}

let enabled = false;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): boolean {
  if (!hydrated && typeof window !== "undefined") {
    try {
      enabled = window.localStorage.getItem(KEY) === "1";
    } catch {
      enabled = false;
    }
    hydrated = true;
  }
  return enabled;
}

export function setSandbox(v: boolean): void {
  const was = enabled;
  enabled = v;
  hydrated = true;
  try {
    window.localStorage.setItem(KEY, v ? "1" : "0");
    // cada activación cuenta como una sesión efímera en este navegador
    if (v && !was) {
      const s = getSandboxStats();
      window.localStorage.setItem(
        STATS_KEY,
        JSON.stringify({ sessions: s.sessions + 1, last_at: Date.now() }),
      );
    }
  } catch {
    /* sin almacenamiento: la sesión sigue siendo efímera */
  }
  emit();
}

export function useSandbox(): boolean {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => false, // SSR: apagado (coincide en ambos lados)
  );
}
