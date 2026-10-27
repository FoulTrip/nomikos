"use client";
/**
 * lib/viewer/agent.ts — feed en vivo del turno agéntico para el panel.
 *
 * El DeviceMicBridge lo alimenta (escuchando → oído → pensando →
 * listo/error) y el AgentDock lo muestra junto a la mascota. La
 * respuesta y el historial vienen del api vía useNomikOS (last_reply
 * + events); aquí solo vive el estado efímero del turno en curso.
 */

import { useSyncExternalStore } from "react";

export type AgentStatus = "idle" | "listening" | "thinking" | "done" | "error";

export interface AgentFeed {
  status: AgentStatus;
  heard: string | null;
  error: string | null;
  turnTs: number;
}

const feed: AgentFeed = { status: "idle", heard: null, error: null, turnTs: 0 };
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

export function setAgentFeed(patch: Partial<AgentFeed>): void {
  Object.assign(feed, patch);
  emit();
}

export function getAgentFeed(): AgentFeed {
  return feed;
}

export function useAgentFeed(): AgentFeed {
  return useSyncExternalStore(
    subscribe,
    () => feed,
    () => feed, // SSR: mismo objeto inicial (idle)
  );
}
