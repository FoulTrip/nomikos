"use server";
/**
 * Server actions de sesión — envuelven al IdP de `api` vía Auth.js v5.
 *
 * Los redirects (NEXT_REDIRECT) se propagan: solo se capturan AuthError.
 * Registro: alta en api (201/409/400) → auto-login → /panel.
 */
import { AuthError } from "next-auth";
import { API_GATEWAY_URL, auth, signIn, signOut } from "@/auth";

interface FormState {
  error?: string;
}

function authErrorMessage(error: AuthError): string {
  const code = (error as { code?: string }).code;
  if (code === "rate_limited")
    return "Demasiados intentos fallidos. Espera un minuto y vuelve a intentarlo.";
  if (code === "credentials") return "Email o contraseña incorrectos.";
  return "No se pudo iniciar sesión contra la API. Inténtalo de nuevo.";
}

/** Login con email/password → cookie de sesión → /panel. */
export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Introduce tu email y contraseña." };

  try {
    await signIn("credentials", { email, password, redirectTo: "/panel" });
    return {}; // nunca llega: signIn redirige
  } catch (error) {
    if (error instanceof AuthError) return { error: authErrorMessage(error) };
    throw error; // NEXT_REDIRECT y errores de framework deben propagarse
  }
}

/** Registro en el IdP real (api) + auto-login → /panel. */
export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password)
    return { error: "Introduce un email y una contraseña (mín. 8 caracteres)." };

  // 1) Alta en api — 201 creada · 409 duplicada · 400 validación
  const res = await fetch(`${API_GATEWAY_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      display_name: email.split("@")[0],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);

  if (!res) return { error: "La API no responde. ¿Está corriendo el gateway (:8080)?" };
  if (res.status === 409)
    return { error: "Ese email ya está registrado — inicia sesión." };
  if (res.status === 400)
    return { error: "Email inválido o contraseña débil (mínimo 8 caracteres)." };
  if (!res.ok) return { error: `No se pudo crear la cuenta (HTTP ${res.status}).` };

  // 2) Alta ok → login inmediato → /panel
  try {
    await signIn("credentials", { email, password, redirectTo: "/panel" });
    return {};
  } catch (error) {
    if (error instanceof AuthError) return { error: authErrorMessage(error) };
    throw error;
  }
}

/**
 * Cierra la sesión del dapp Y revoca el token opaco en api (IdP).
 * La revocación es la semántica del test E2E 02: reuso del token → 401.
 */
export async function logoutAction(): Promise<void> {
  const session = await auth();
  if (session?.accessToken) {
    // Best-effort: si api está caído, la cookie local igual se destruye.
    await fetch(`${API_GATEWAY_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
    }).catch(() => {});
  }
  await signOut({ redirectTo: "/" });
}
