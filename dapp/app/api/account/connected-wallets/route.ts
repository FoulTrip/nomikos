/**
 * Wallets conectadas del navegador (Phantom / Solflare / Backpack /
 * MetaMask) de la cuenta — SOLO pubkeys: la clave privada nunca sale de
 * la wallet del usuario (no se recibe ni se guarda).
 *
 *  GET  → lista + la que está en uso
 *  POST → { provider, chain, pubkey, label?, set_active? } — conectar
 *         (default: pasa a ser la wallet en uso; solo una activa)
 *  PUT  → { label } — activar esa wallet y desactivar las demás
 */
import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return forwardToApi("/accounts/me/connected-wallets");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  return forwardToApi("/accounts/me/connected-wallets", { method: "POST" }, body);
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const label = String((body as { label?: string } | null)?.label ?? "").trim();
  if (!label) {
    return Response.json({ ok: false, error: "Falta el label de la wallet" }, { status: 400 });
  }
  return forwardToApi("/accounts/me/connected-wallets/activate", { method: "PUT" }, { label });
}
