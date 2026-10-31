import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return forwardToApi("/marketplace/apps", { method: "GET" });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    namespace?: string;
    mode?: string;
    device_ids?: string[];
    tools?: { name: string; enabled: boolean; max_amount_lamports?: number; require_confirmation?: boolean }[];
    legal_consent?: {
      accepted: boolean;
      manifest_hash: string;
      terms_sha256: string;
      privacy_sha256: string;
    };
  } | null;
  const namespace = body?.namespace?.trim() ?? "";
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(namespace)) {
    return Response.json({ ok: false, error: "Namespace MCP inválido" }, { status: 400 });
  }

  return forwardToApi(`/marketplace/apps/${encodeURIComponent(namespace)}/install`, {
    method: "POST",
  }, {
    mode: body?.mode,
    device_ids: body?.device_ids,
    tools: body?.tools,
    legal_consent: body?.legal_consent,
  });
}
