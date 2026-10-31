import { forwardToApi } from "@/lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return forwardToApi("/accounts/me/marketplace/apps", { method: "GET" });
}
