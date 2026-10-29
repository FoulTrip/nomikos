import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const WRAPPED_SOL = "So11111111111111111111111111111111111111112";

interface SolanaTokenPair {
  chainId?: string;
  baseToken?: { address?: string };
  priceUsd?: string | null;
  liquidity?: { usd?: number | null } | null;
}

export async function GET(req: Request) {
  const requested = new URL(req.url).searchParams.get("currency");
  const currency = requested === "COP" ? "COP" : "USD";

  try {
    const solRes = await fetch(
      `https://api.dexscreener.com/token-pairs/v1/solana/${WRAPPED_SOL}`,
      { next: { revalidate: 60 }, headers: { Accept: "application/json" } },
    );
    if (!solRes.ok) throw new Error("sol-price-unavailable");
    const pairs = (await solRes.json()) as SolanaTokenPair[];
    const pair = pairs
      .filter((item) => item.chainId === "solana" && item.baseToken?.address === WRAPPED_SOL)
      .filter((item) => Number.isFinite(Number(item.priceUsd)) && Number(item.priceUsd) > 0)
      .sort((a, b) => Number(b.liquidity?.usd ?? 0) - Number(a.liquidity?.usd ?? 0))[0];
    if (!pair?.priceUsd) throw new Error("sol-price-unavailable");

    let usdCop: number | null = null;
    if (currency === "COP") {
      const fxRes = await fetch("https://open.er-api.com/v6/latest/USD", {
        next: { revalidate: 3_600 },
        headers: { Accept: "application/json" },
      });
      if (!fxRes.ok) throw new Error("fx-rate-unavailable");
      const fx = await fxRes.json();
      const rate = Number(fx?.rates?.COP);
      if (fx?.result !== "success" || !Number.isFinite(rate) || rate <= 0) {
        throw new Error("fx-rate-unavailable");
      }
      usdCop = rate;
    }

    return NextResponse.json({
      ok: true,
      currency,
      sol_usd: Number(pair.priceUsd),
      usd_cop: usdCop,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "market-rate-unavailable" },
      { status: 503 },
    );
  }
}
