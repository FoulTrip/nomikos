/**
 * lib/docs.ts — registro modular de la documentación del panel, por idioma.
 *
 * Cada guía es un JSON en `content/docs/{es,en}/` con secciones y bloques
 * tipados. Escalar = agregar un JSON + una línea en DOCS.
 * El idioma se resuelve por petición (cookie NOMIK_LOCALE — ver
 * i18n/request.ts); la UI nunca elige fichero por su cuenta.
 */
import aplicacionesEs from "@/content/docs/es/aplicaciones.json";
import instalacionOsEs from "@/content/docs/es/instalacion-os.json";
import instalacionAppsEs from "@/content/docs/es/instalacion-apps.json";
import orquestacionEs from "@/content/docs/es/orquestacion.json";
import proveedoresEs from "@/content/docs/es/proveedores.json";
import sandboxEs from "@/content/docs/es/sandbox.json";
import aplicacionesEn from "@/content/docs/en/aplicaciones.json";
import instalacionOsEn from "@/content/docs/en/instalacion-os.json";
import instalacionAppsEn from "@/content/docs/en/instalacion-apps.json";
import orquestacionEn from "@/content/docs/en/orquestacion.json";
import proveedoresEn from "@/content/docs/en/proveedores.json";
import sandboxEn from "@/content/docs/en/sandbox.json";

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

const DOCS: Record<"es" | "en", Doc[]> = {
  es: [aplicacionesEs, instalacionOsEs, instalacionAppsEs, orquestacionEs, proveedoresEs, sandboxEs],
  en: [aplicacionesEn, instalacionOsEn, instalacionAppsEn, orquestacionEn, proveedoresEn, sandboxEn],
} as Record<"es" | "en", Doc[]>;

export function resolveDocsLocale(locale?: string): "es" | "en" {
  return locale === "en" ? "en" : "es";
}

export function listDocs(locale?: string): Doc[] {
  return DOCS[resolveDocsLocale(locale)];
}

export function getDoc(slug: string, locale?: string): Doc | null {
  return DOCS[resolveDocsLocale(locale)].find((d) => d.slug === slug) ?? null;
}
