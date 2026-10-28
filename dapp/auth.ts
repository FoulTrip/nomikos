/**
 * auth.ts — Auth.js v5 (next-auth@beta) para el dapp.
 *
 * NO crea sesiones paralelas: el IdP real vive en `api` (Rust :8080) —
 * tokens opacos en SQLite con revocación (suite E2E 02). El Credentials
 * provider hace login contra POST {API_GATEWAY_URL}/auth/login y guarda
 * el Bearer dentro del JWT cifrado de la cookie de sesión HTTP-Only.
 * Los proxies del dapp lo reenvían como `Authorization: Bearer` para
 * operar como la cuenta (regla #4 del workspace: única fuente de verdad).
 */
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

/** Gateway de la API Rust — única variable de negocio del dapp. */
export const API_GATEWAY_URL = (
  process.env.API_GATEWAY_URL ?? "http://localhost:8080/api"
).replace(/\/+$/, "");

/** Contrato del login de `api` (ver tests/tests/02.api.idp.e2e.ts). */
interface ApiLoginBody {
  ok: boolean;
  account_id: string;
  token: string;
  token_type: "Bearer";
  expires_at: number;
}

/** 429 del anti-bruteforce de api (5 fallos por email en 60 s). */
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

/** Login contra el IdP nativo. null = credenciales inválidas. */
async function loginWithApi(
  email: string,
  password: string,
): Promise<ApiLoginBody | null> {
  const res = await fetch(`${API_GATEWAY_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (res.status === 429) throw new RateLimitedError();
  if (!res.ok) return null; // 401 → email o contraseña incorrectos

  const body = (await res.json().catch(() => null)) as ApiLoginBody | null;
  // Integridad del contrato antes de crear la sesión local:
  if (
    !body?.ok ||
    !body.token ||
    body.token_type !== "Bearer" ||
    !body.account_id?.startsWith("acc-")
  ) {
    console.error("[auth] login fuera de contrato:", JSON.stringify(body));
    return null;
  }
  return body;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  /**
   * Sin adapter → estrategia JWT: el Bearer de `api` viaja dentro de la
   * cookie cifrada de Auth.js (HTTP-Only). TTL 7 días = TTL del token
   * opaco del IdP, para que ambas capas expiren juntas.
   */
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/signin" }, // login propio (sin páginas por defecto)
  trustHost: true, // self-hosted (Docker :3123), no solo Vercel
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        try {
          const body = await loginWithApi(email, password);
          if (!body) return null;
          return {
            id: body.account_id,
            email,
            accountId: body.account_id,
            accessToken: body.token,
            expiresAt: body.expires_at,
          };
        } catch (e) {
          if (e instanceof RateLimitedError) throw e;
          console.error("[auth] error contactando al IdP (api):", e);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      // Solo en el primer sign-in `user` viene del authorize(). El tipo
      // union `User | AdapterUser` de @auth/core no conoce los campos
      // extra → cast al contrato que devuelve authorize().
      if (user) {
        const u = user as unknown as {
          accessToken?: string;
          accountId?: string;
          expiresAt?: number;
        };
        token.accessToken = u.accessToken;
        token.accountId = u.accountId;
        token.expiresAt = u.expiresAt;
      }
      return token;
    },
    session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.accountId = token.accountId as string | undefined;
      session.expiresAt = token.expiresAt as number | undefined;
      if (session.user) session.user.accountId = token.accountId as string | undefined;
      return session;
    },
  },
});
