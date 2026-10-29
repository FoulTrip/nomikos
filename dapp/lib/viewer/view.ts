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

// ── Modal abierto: mientras haya un modal encima, el visor 3D no roba
// interacción (la rueda sobre un desplegable hacía zoom en vez de scroll).
let modalOpen = false;

export function setModalOpen(v: boolean): void {
  if (modalOpen === v) return;
  modalOpen = v;
  emit();
}

export function useModalOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => modalOpen,
    () => false,
  );
}

// ── Puntero sobre la pantalla del dispositivo: la rueda hace scroll de
// la lista del OS en vez de zoom de cámara (el zoom sigue fuera de ella).
let overScreen = false;

export function setOverScreen(v: boolean): void {
  if (overScreen === v) return;
  overScreen = v;
  emit();
}

export function useOverScreen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => overScreen,
    () => false,
  );
}

// ── Mic silenciado desde la pantalla del OS (el botón de inicio).
// En sandbox arranca APAGADO: al encenderlo, el puente del panel
// (DeviceMicBridge) abre el micrófono del PC y manda lo oído al agente.
let micMuted = true;

export function setMicMuted(v: boolean): void {
  if (micMuted === v) return;
  micMuted = v;
  emit();
}

export function useMicMuted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => micMuted,
    () => true, // SSR: apagado (coincide en ambos lados)
  );
}

// ── Dirección destino del envío manual (Banco › Enviar › Manual).
// Se escribe en el panel (el OS de 466px no tiene teclado) y el
// dispositivo la muestra para confirmar.
let bankSendTo = "";

export function setBankSendTo(v: string): void {
  if (bankSendTo === v) return;
  bankSendTo = v;
  emit();
}

export function useBankSendTo(): string {
  return useSyncExternalStore(
    subscribe,
    () => bankSendTo,
    () => "",
  );
}

// ── Chat del dispositivo (hoja del historial en el AMOLED) ─────────────
// El visor 3D no puede escribir directo en el Canvas: el input vive en
// HTML bajo el dispositivo y este store lo comparte con DeviceScreen.
let deviceChatDraft = "";
let deviceChatCompose = false;
let deviceChatFocusNonce = 0;

export function setDeviceChatDraft(v: string): void {
  if (deviceChatDraft === v) return;
  deviceChatDraft = v;
  emit();
}

export function setDeviceChatCompose(v: boolean): void {
  if (deviceChatCompose === v) return;
  deviceChatCompose = v;
  emit();
}

export function requestDeviceChatFocus(): void {
  deviceChatFocusNonce += 1;
  emit();
}

export function useDeviceChatDraft(): string {
  return useSyncExternalStore(
    subscribe,
    () => deviceChatDraft,
    () => "",
  );
}

export function useDeviceChatCompose(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => deviceChatCompose,
    () => false,
  );
}

export function useDeviceChatFocusNonce(): number {
  return useSyncExternalStore(
    subscribe,
    () => deviceChatFocusNonce,
    () => 0,
  );
}

// ── Hoja del chat abierta (para mostrar el input HTML fuera del Canvas)
let deviceChatFull = false;

export function setDeviceChatFull(v: boolean): void {
  if (deviceChatFull === v) return;
  deviceChatFull = v;
  emit();
}

export function useDeviceChatFull(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => deviceChatFull,
    () => false,
  );
}

// ── Drawer lateral de historial de chat (desliza de derecha a izquierda)
let deviceChatDrawer = false;
let deviceChatDrawerAnim = 0;
let deviceChatDrawerScroll = 0;

export function setDeviceChatDrawer(v: boolean): void {
  if (deviceChatDrawer === v) return;
  deviceChatDrawer = v;
  emit();
}

export function useDeviceChatDrawer(): boolean {
  return useSyncExternalStore(subscribe, () => deviceChatDrawer, () => false);
}

export function setDeviceChatDrawerAnim(v: number): void {
  if (deviceChatDrawerAnim === v) return;
  deviceChatDrawerAnim = v;
  emit();
}

export function useDeviceChatDrawerAnim(): number {
  return useSyncExternalStore(subscribe, () => deviceChatDrawerAnim, () => 0);
}

export function setDeviceChatDrawerScroll(v: number): void {
  if (deviceChatDrawerScroll === v) return;
  deviceChatDrawerScroll = v;
  emit();
}

export function useDeviceChatDrawerScroll(): number {
  return useSyncExternalStore(
    subscribe,
    () => deviceChatDrawerScroll,
    () => 0,
  );
}
