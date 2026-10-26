/**
 * layout.ts — geometría de la UI del OS simulado: draw.ts DIBUJA con
 * estas medidas y el táctil (hitTest) las usa para resolver toques.
 * Una sola fuente para que lo que ves sea lo que tocas.
 *
 * Canvas 466×466, centro (233,233), círculo visible radio 213.
 * En la placa real este hit-testing lo hace el firmware (driver
 * táctil → coordenadas); aquí lo hace el navegador con el uv del mesh.
 */
import type { NomikOSState } from "@/lib/os/nomikos";

export const PX = 466;
export const C = PX / 2; // 233
export const CLIP_R = 225; // = 233 - MARGIN de draw.ts (contenido casi al borde)

/** Paleta del OS (oro/blanco/gris/verde del firmware + acentos UI). */
export const INK = {
  gold: "#ffc000",
  white: "#ffffff",
  gray: "#9a9a9a",
  dim: "#3a3a3a",
  green: "#00c000",
  red: "#ff5555",
  tile: "#161616",
  tileEdge: "#2e2e2e",
} as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function inRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/** Color de marca determinista por slug (HSL estable). */
export function brandColor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return `hsl(${h}, 70%, 55%)`;
}

/** Iniciales del badge (1-2 letras del slug). */
export function badgeLetters(slug: string): string {
  const parts = slug.split(/[-_]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return slug.slice(0, 2).toUpperCase();
}

// ── Home: rejilla de iconos (dapps + ajustes + peaje) ────────────────
export const TILE = 92;
export const TILE_GAP = 16;
export const TILE_COLS = 3;
export const GRID_TOP = 148;

export interface HomeTile {
  target: string;
  label: string;
  rect: Rect;
  kind: "drawer" | "settings" | "x402";
}

/**
 * Tiles de inicio: rejilla fija [apps · ajustes · peaje].
 * El cajón "apps" abre la lista de dapps instaladas (con logos); las
 * dapps NO van directas aquí para que inicio sea estable.
 */
export function homeTiles(_os: NomikOSState): HomeTile[] {
  const defs: Array<Omit<HomeTile, "rect">> = [
    { target: "apps", label: "apps", kind: "drawer" as const },
    { target: "settings", label: "ajustes", kind: "settings" as const },
    { target: "x402", label: "peaje", kind: "x402" as const },
  ];
  const step = TILE + TILE_GAP;
  return defs.map((d, i) => {
    const col = i % TILE_COLS;
    const row = Math.floor(i / TILE_COLS);
    const rowCount = Math.min(TILE_COLS, defs.length - row * TILE_COLS);
    const rowW = rowCount * TILE + (rowCount - 1) * TILE_GAP;
    return {
      ...d,
      rect: {
        x: C - rowW / 2 + col * step,
        y: GRID_TOP + row * (step + 26), // +26: etiqueta debajo
        w: TILE,
        h: TILE + 22,
      },
    };
  });
}

// ── Listas (apps / ajustes): cabecera atrás + filas ──────────────────
export const HEADER_ZONE: Rect = { x: C - 150, y: 52, w: 300, h: 44 };

export interface RowHit {
  target: string | null;
  rect: Rect;
}

/** Filas de la pantalla apps: una por dapp instalada (máx 4 visibles). */
export function appRows(os: NomikOSState): RowHit[] {
  return os.apps.slice(0, 4).map((a, i) => ({
    target: `app:${a.slug}`,
    rect: { x: C - 150, y: 148 + i * 66, w: 300, h: 58 },
  }));
}

/** Filas de ajustes: wifi, dispositivo, proveedor, modelo, bloquear.
 *  Proveedor/modelo ABREN sus listas (providers/models); el device solo
 *  elige entre lo configurado en la cuenta (las keys se cargan en el panel).
 *  5 filas compactas para que quepan en el círculo.
 */
export function settingsRows(): RowHit[] {
  const targets = [null, null, "providers", "models", "lock"];
  return targets.map((target, i) => ({
    target,
    rect: { x: C - 150, y: 140 + i * 44, w: 300, h: 40 },
  }));
}

/** Filas de la lista de proveedores (solo los CON key son elegibles). */
export function providerRows(os: NomikOSState): RowHit[] {
  const list = (os.llm?.providers ?? []).filter((p) => p.has_key).slice(0, 4);
  return list.map((p, i) => ({
    target: `provider:${p.provider}`,
    rect: { x: C - 150, y: 148 + i * 58, w: 300, h: 52 },
  }));
}

/** Filas de la lista de modelos del proveedor ACTIVO. */
export function modelRows(os: NomikOSState): RowHit[] {
  const active = (os.llm?.providers ?? []).find((p) => p.is_active);
  const models = (active?.models ?? []).slice(0, 4);
  return models.map((m, i) => ({
    target: `model:${m}`,
    rect: { x: C - 150, y: 148 + i * 58, w: 300, h: 52 },
  }));
}

// ── Hit-testing ──────────────────────────────────────────────────────
/**
 * Resuelve un toque (px de canvas) a un target de `press`, o null si
 * cae fuera de zonas activas. boot/claim se quedan fuera: ahí el tap
 * legacy (contar toques) sigue valiendo.
 */
export function hitTest(
  os: NomikOSState | null,
  px: number,
  py: number,
): string | null {
  if (!os || os.stage !== "online") return null;
  // fuera del círculo visible → nada
  if (Math.hypot(px - C, py - C) > CLIP_R) return null;
  if (os.locked !== false) return "unlock"; // en bloqueo, cualquier toque desbloquea

  const screen = os.screen === "status" ? "home" : os.screen;
  switch (screen) {
    case "home": {
      for (const t of homeTiles(os)) {
        if (inRect(px, py, t.rect)) return t.target;
      }
      return null;
    }
    case "apps": {
      if (inRect(px, py, HEADER_ZONE)) return "home";
      for (const r of appRows(os)) {
        if (inRect(px, py, r.rect)) return r.target;
      }
      return null;
    }
    case "appdetail":
      return inRect(px, py, HEADER_ZONE) ? "apps" : null;
    case "settings": {
      if (inRect(px, py, HEADER_ZONE)) return "home";
      for (const r of settingsRows()) {
        if (r.target && inRect(px, py, r.rect)) return r.target;
      }
      return null;
    }
    case "providers": {
      if (inRect(px, py, HEADER_ZONE)) return "settings";
      for (const r of providerRows(os)) {
        if (inRect(px, py, r.rect)) return r.target;
      }
      return null;
    }
    case "models": {
      if (inRect(px, py, HEADER_ZONE)) return "settings";
      for (const r of modelRows(os)) {
        if (inRect(px, py, r.rect)) return r.target;
      }
      return null;
    }
    case "x402":
      return inRect(px, py, HEADER_ZONE) ? "home" : null;
    default:
      return null;
  }
}
