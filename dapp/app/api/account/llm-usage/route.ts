import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const environment = new URL(req.url).searchParams.get("environment");
  const query = environment ? `?environment=${encodeURIComponent(environment)}` : "";
  return forwardToApi(`/accounts/me/llm-usage${query}`, { method: "GET" });
}
