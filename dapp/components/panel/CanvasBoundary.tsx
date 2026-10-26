"use client";
/**
 * CanvasBoundary — boundary del árbol 3D del visor (p. ej. si el GLB de R2
 * falla al cargar). La carrera de desmonte de React 19 + R3F ("removeChild
 * NotFoundError" al navegar login⇄panel) se corrigió de raíz eliminando el
 * `<Html>` de drei del fallback: el loader ahora es DOM plano fuera del
 * Canvas (ModelLoader en DeviceViewer.tsx).
 */
import React from "react";

export default class CanvasBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[CanvasBoundary] error del visor 3D (en desmonte):", error);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
