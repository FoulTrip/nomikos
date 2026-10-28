import { cookies } from "next/headers";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import esMessages from "../messages/es.json";
import enMessages from "../messages/en.json";

const allMessages = { es: esMessages, en: enMessages };

export default getRequestConfig(async ({ requestLocale }) => {
  // 1) Segmento [locale] (landing pública)
  const requested = await requestLocale;
  if (hasLocale(routing.locales, requested)) {
    return { locale: requested, messages: allMessages[requested] };
  }

  // 2) Cookie de cuenta (panel/docs/preferencias): la hidrata el login
  //    y la guarda /preferences desde GET /api/accounts/me/preferences.
  //    Solo se lee aquí (fuera de [locale]), así la landing estática
  //    no toca `cookies()` y sigue prerenderizada.
  try {
    const stored = (await cookies()).get("NOMIK_LOCALE")?.value;
    if (hasLocale(routing.locales, stored)) {
      return { locale: stored, messages: allMessages[stored] };
    }
  } catch {
    // Sin acceso a cookies (prerender estático): cae al default.
  }

  // 3) Default
  return { locale: routing.defaultLocale, messages: allMessages[routing.defaultLocale] };
});
