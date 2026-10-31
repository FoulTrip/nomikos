import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const query = new URLSearchParams();
  const environment = params.get("environment");
  const days = params.get("days");
  if (environment) query.set("environment", environment);
  if (days) query.set("days", days);
  const suffix = query.size ? `?${query.toString()}` : "";
  return forwardToApi(`/accounts/me/llm-usage${suffix}`, { method: "GET" });
}
