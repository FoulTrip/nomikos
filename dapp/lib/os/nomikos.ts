"use client";
/**
 * lib/os/nomikos.ts — el OS NomikOS simulado, con progreso en la DB de
 * la cuenta (retomable). El api es AUTORITATIVO (máquina de estados
 * server-side); aquí solo: poll del estado + acciones.
 *
 * stage: boot (agentd se presenta → claim code) → claim → online
 * (flota REAL + apps del agente + peajes x402).
 */
import { useSyncExternalStore } from "react";

export interface SimApp {
  slug: string;
  name: string;
  status: string;
}

export interface SimX402 {
  resource: string;
  invoice_id?: string;
  status: string;
  access?: string;
  lamports?: number;
}

export interface SimReply {
  text: string;
  reply: string;
  ts: number;
}

export interface SimEvent {
  ts: number;
  ev: string;
}

export interface NomikOSState {
  stage: "boot" | "claim" | "online";
  board: string;
  name: string;
  device_id: string | null;
  claim_code: string | null;
  claimed: boolean;
  boot_count: number;
  taps: number;
  screen: "home" | "apps" | "x402" | "settings" | "status"; // "status" = legacy → home
  apps: SimApp[];
  last_x402: SimX402 | null;
  last_reply: SimReply | null;
  events: SimEvent[];
}

let snapshot: NomikOSState | null = null;
const listeners = new Set<(s: NomikOSState) => void>();
let poller: ReturnType<typeof setInterval> | null = null;
let beater: ReturnType<typeof setInterval> | null = null;
// Guard de primer arranque: persiste toda la sesión (nunca se resetea
// al desmontar, o un remount rápido dispara un doble boot).
let bootChecked = false;

function emit() {
  listeners.forEach((cb) => cb(snapshot!));
}

async function fetchState(): Promise<NomikOSState | null> {
  try {
    const res = await fetch("/api/account/simulation", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? (data.simulation as NomikOSState) : null;
  } catch {
    return null;
  }
}

async function step(action: string): Promise<void> {
  try {
    const res = await fetch("/api/account/simulation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok) {
        snapshot = data.simulation as NomikOSState;
        emit();
      }
    }
  } catch {
    /* best-effort: el poll re-sincroniza */
  }
}

// Igual que step() pero PROPAGA el error del api (para acciones que el
// usuario pulsa: claim, say). El llamador lo muestra en el panel.
async function stepStrict(action: string, extra?: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/account/simulation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    simulation?: NomikOSState;
  } | null;
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
  snapshot = data.simulation as NomikOSState;
  emit();
}

function subscribe(cb: (s: NomikOSState) => void): () => void {
  listeners.add(cb);

  if (!poller) {
    poller = setInterval(() => void fetchState().then((s) => s && ((snapshot = s), emit())), 2000);

    // latido del OS cuando está ONLINE (la flota lo ve vivo)
    beater = setInterval(() => {
      if (snapshot?.stage === "online") void step("heartbeat");
    }, 15_000);

    // primera carga: encender el OS si nunca arrancó (retoma si ya había progreso)
    // bootChecked persiste toda la sesión: un remount rápido no re-dispara el boot
    if (!bootChecked) {
      bootChecked = true;
      void (async () => {
        const s = await fetchState();
        if (s) {
          snapshot = s;
          emit();
          if (s.boot_count === 0) await step("boot");
        }
      })();
    }
  }

  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      if (poller) clearInterval(poller);
      if (beater) clearInterval(beater);
      poller = null;
      beater = null;
    }
  };
}

export function useNomikOS(): NomikOSState | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => null,
  );
}

// ---------- acciones del OS simulado ----------
export async function simClaim() {
  await stepStrict("claim"); // propaga el error: el panel lo muestra
}
export async function simTap() {
  await step("tap");
}
export async function simX402() {
  await step("x402");
}
export async function simRebuild() {
  await step("rebuild");
}
export async function simApps() {
  await step("apps");
}
export async function simSay(text: string) {
  await stepStrict("say", { text }); // propaga el error: el panel lo muestra
}
