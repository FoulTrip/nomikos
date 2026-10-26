"use client";
/**
 * lib/viewer/view.ts — estado de la vista 3D compartido entre el panel
 * lateral (botón) y el visor (controles). `locked` = cámara fija de
 * frente, sin rotación ni paneo: la pantalla queda firme para tocar
 * los iconos con precisión. El zoom sigue activo para acercarse.
 */
import { useSyncExternalStore } from "react";

let locked = false;
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

export function setViewLocked(v: boolean): void {
  if (locked === v) return;
  locked = v;
  emit();
}

export function useViewLocked(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => locked,
    () => false, // SSR: desbloqueado (coincide en ambos lados)
  );
}
