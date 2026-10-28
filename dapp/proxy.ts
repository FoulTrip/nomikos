/**
 * proxy.ts — enrutador de sesión de Next.js 16 (proxy.ts sustituye a
 * middleware.ts; Auth.js v5 expone `auth` como wrapper del proxy) +
 * negociación de idioma next-intl para la landing pública.
 *
 *   "/"               pública ES (landing) · "/en" pública EN
 *   "/signin|/signup" autenticado → /panel
 *   "/panel/*"        sin sesión  → /signin
 *
 * Las reglas de auth actúan primero (rutas sin localizar); lo demás pasa
 * por el middleware de idioma. Matcher explícito: nunca intercepta /api/*,
 * /_next/* ni archivos estáticos.
 */
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { auth } from "@/auth";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

export const proxy = auth((req) => {
  const loggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  if (
    (pathname === "/signin" || pathname === "/signup") &&
    loggedIn
  ) {
    return NextResponse.redirect(new URL("/panel", req.nextUrl));
  }

  if (pathname.startsWith("/panel") && !loggedIn) {
    return NextResponse.redirect(new URL("/signin", req.nextUrl));
  }

  // Solo la landing está localizada: el middleware de idioma actúa
  // UNICAMENTE sobre /, /en y /es (cualquier otra ruta la rompería
  // reescribiéndola con prefijo, p.ej. /signin → /es/signin).
  if (
    pathname === "/" ||
    pathname === "/en" ||
    pathname === "/es" ||
    pathname.startsWith("/en/") ||
    pathname.startsWith("/es/")
  ) {
    return intlMiddleware(req);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/", "/en", "/es", "/signin", "/signup", "/panel/:path*"],
};
