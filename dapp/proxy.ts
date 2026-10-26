/**
 * proxy.ts — enrutador de sesión de Next.js 16 (proxy.ts sustituye a
 * middleware.ts; Auth.js v5 expone `auth` como wrapper del proxy).
 *
 *   "/"        autenticado → /panel
 *   "/panel/*" sin sesión   → "/"
 *
 * Matcher explícito: nunca intercepta /api/* ni archivos estáticos —
 * evita bucles con las rutas de Auth.js y con los proxies del dapp.
 * (Defensa en profundidad: /panel re-verifica con auth() server-side.)
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const proxy = auth((req) => {
  const loggedIn = !!req.auth;
  const { nextUrl } = req;

  if (nextUrl.pathname === "/") {
    return loggedIn
      ? NextResponse.redirect(new URL("/panel", nextUrl))
      : NextResponse.next();
  }

  if (nextUrl.pathname.startsWith("/panel") && !loggedIn) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/", "/panel/:path*"],
};
