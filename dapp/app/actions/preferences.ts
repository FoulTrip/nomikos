"use server";
/**
 * Server actions de preferencias — leen/escriben
 * GET+PUT /api/accounts/me/preferences con el Bearer de la sesión.
 *
 * La cookie NOMIK_LOCALE es la copia local del idioma de la cuenta:
 * se fija al guardar y al sincronizar tras el login; `i18n/request.ts`
 * la usa para panel/docs/preferencias (la landing usa su prefijo).
 */
import { cookies } from "next/headers";
import { API_GATEWAY_URL, auth } from "@/auth";

export interface Preferences {
  email: string;
  display_name: string | null;
  locale: "es" | "en";
  country: string | null;
  currency: "USD" | "COP";
}

interface PrefsState {
  ok: boolean;
  preferences?: Preferences;
  error?: string;
}

async function apiPrefs(
  token: string,
  init: RequestInit,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${API_GATEWAY_URL}/accounts/me/preferences`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res) return { status: 502, json: {} };
  return { status: res.status, json: (await res.json().catch(() => ({}))) as unknown };
}

function asPrefs(data: unknown): Preferences | null {
  const p = (data as { preferences?: Partial<Preferences> })?.preferences;
  if (!p || typeof p.email !== "string") return null;
  const country = typeof p.country === "string" && p.country ? p.country : null;
  return {
    email: p.email,
    display_name: p.display_name ?? null,
    locale: p.locale === "en" ? "en" : "es",
    country,
    currency: p.currency === "COP" || p.currency === "USD"
      ? p.currency
      : country === "CO" ? "COP" : "USD",
  };
}

export async function getPreferencesAction(): Promise<PrefsState> {
  const session = await auth();
  if (!session?.accessToken) return { ok: false, error: "auth" };
  const { status, json } = await apiPrefs(session.accessToken, { method: "GET" });
  const preferences = asPrefs(json);
  if (status !== 200 || !preferences) return { ok: false, error: "api" };
  return { ok: true, preferences };
}

export async function savePreferencesAction(input: {
  locale?: string;
  country?: string | null;
  display_name?: string | null;
  currency?: "USD" | "COP";
}): Promise<PrefsState> {
  const session = await auth();
  if (!session?.accessToken) return { ok: false, error: "auth" };
  const { status, json } = await apiPrefs(
    session.accessToken,
    { method: "PUT" },
    input,
  );
  const preferences = asPrefs(json);
  if (status !== 200 || !preferences) {
    const err = (json as { error?: string })?.error;
    return { ok: false, error: err ?? "api" };
  }
  // Amarra el idioma a la cuenta también en este navegador.
  (await cookies()).set("NOMIK_LOCALE", preferences.locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return { ok: true, preferences };
}

/** Tras el login: alinea la cookie con el idioma guardado en la cuenta. */
export async function syncLocaleAction(): Promise<{ locale: "es" | "en"; changed: boolean }> {
  const fallback = { locale: "es" as const, changed: false };
  const session = await auth();
  if (!session?.accessToken) return fallback;
  const { status, json } = await apiPrefs(session.accessToken, { method: "GET" });
  if (status !== 200) return fallback;
  const preferences = asPrefs(json);
  if (!preferences) return fallback;
  const jar = await cookies();
  const changed = jar.get("NOMIK_LOCALE")?.value !== preferences.locale;
  if (changed) {
    jar.set("NOMIK_LOCALE", preferences.locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  return { locale: preferences.locale, changed };
}
