/**
 * lib/docs.ts — registro modular de la documentación del panel.
 *
 * Cada guía es un JSON en `content/docs/` con secciones y bloques
 * tipados. Escalar = agregar un JSON + una línea en DOCS.
 */
import aplicaciones from "@/content/docs/aplicaciones.json";
import instalacionOs from "@/content/docs/instalacion-os.json";
import instalacionApps from "@/content/docs/instalacion-apps.json";
import orquestacion from "@/content/docs/orquestacion.json";
import proveedores from "@/content/docs/proveedores.json";

export type DocBlock =
  | { type: "p"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "list"; items: string[] }
  | { type: "code"; lang: string; text: string }
  | { type: "callout"; tone: "info" | "warn"; title?: string; text: string }
  | { type: "table"; head: string[]; rows: string[][] };

export interface DocSection {
  heading: string;
  blocks: DocBlock[];
}

export interface Doc {
  slug: string;
  title: string;
  icon: string;
  summary: string;
  updated: string;
  sections: DocSection[];
  related: string[];
}

const DOCS = [
  aplicaciones,
  instalacionOs,
  instalacionApps,
  orquestacion,
  proveedores,
] as Doc[];

export function listDocs(): Doc[] {
  return DOCS;
}

export function getDoc(slug: string): Doc | null {
  return DOCS.find((d) => d.slug === slug) ?? null;
}
