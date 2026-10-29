"use client";
import { useLocale, useTranslations } from "next-intl";
/**
 * Dashboard — lo que /panel muestra con el sandbox APAGADO: modelo y
 * proveedor, tokens, tools por apps y análisis x402, distinguido entre
 * "producción" y "sandbox", más la cuadrícula de documentación.
 *
 * 100% shadcn (Tabs, Card, Badge, Table, Progress, Skeleton, Separator)
 * + gráficas recharts. Los tokens son los contadores devueltos por el
 * proveedor activo en cada completion y persistidos por el API.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Blocks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoiceStatusBreakdown, TokenUsageChart } from "./charts";
import { DocIcon } from "./DocViewer";
import { listDocs } from "@/lib/docs";

type Scope = "prod" | "sandbox";

interface X402Summary {
  ok: boolean;
  dpaas?: {
    network?: string;
    balance_lamports?: number | null;
    daily_limit_lamports?: number | null;
    daily_used_lamports?: number | null;
  };
  invoices_total?: number;
  invoices_by_status?: Record<string, number>;
  settled_lamports?: number;
}
type DisplayCurrency = "USD" | "COP";
interface SolMarketRates {
  sol_usd: number;
  usd_cop: number | null;
}
interface ServiceRow {
  service: string;
  display_name: string;
  added: boolean;
}
interface ToolRow {
  name: string;
  description?: string;
  app?: string;
}
interface ToolUsageRow {
  app: string;
  tool: string;
  uses: number;
}
interface LlmUsageGroup {
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_calls: number;
}
interface LlmUsageDailyPoint {
  date: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
interface LlmUsageSummary {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_calls: number;
  usage: LlmUsageGroup[];
  daily_usage: LlmUsageDailyPoint[];
}

export default function Dashboard() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [scope, setScope] = useState<Scope>("prod");
  const [x402, setX402] = useState<X402Summary | null>(null);
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [tools, setTools] = useState<ToolRow[] | null>(null);
  const [toolUsage, setToolUsage] = useState<ToolUsageRow[] | null>(null);
  const [llmUsage, setLlmUsage] = useState<LlmUsageSummary | null>(null);
  const [llmUsageError, setLlmUsageError] = useState(false);
  const [currency, setCurrency] = useState<DisplayCurrency>("COP");
  const [marketRates, setMarketRates] = useState<SolMarketRates | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/account/preferences", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const selected = data?.preferences?.currency;
        if (!cancelled && (selected === "USD" || selected === "COP")) setCurrency(selected);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadRates = async () => {
      try {
        const res = await fetch(`/api/market/sol-price?currency=${currency}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!cancelled && res.ok && data?.ok && typeof data.sol_usd === "number") {
          setMarketRates({ sol_usd: data.sol_usd, usd_cop: data.usd_cop ?? null });
        }
      } catch {
        // La cifra SOL sigue visible si falla la cotización externa.
      }
    };
    void loadRates();
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadRates();
    }, 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currency]);

  useEffect(() => {
    let cancelled = false;
    setX402(null);
    setToolUsage(null);
    const environment = scope === "prod" ? "production" : "sandbox";
    (async () => {
      try {
        const [x402Res, svcRes, toolsRes, usageRes] = await Promise.all([
          fetch(`/api/account/x402/summary?environment=${environment}`, { cache: "no-store" }),
          fetch("/api/account/services", { cache: "no-store" }),
          fetch("/api/agent/tools", { cache: "no-store" }),
          fetch(`/api/account/tool-usage?environment=${environment}`, { cache: "no-store" }),
        ]);
        const [x402J, svcJ, toolsJ, usageJ] = await Promise.all([
          x402Res.json().catch(() => null),
          svcRes.json().catch(() => null),
          toolsRes.json().catch(() => null),
          usageRes.json().catch(() => null),
        ]);
        if (cancelled) return;
        if (x402J?.ok) setX402(x402J);
        if (svcJ?.ok) setServices(svcJ.services ?? []);
        if (Array.isArray(toolsJ)) setTools(toolsJ);
        if (usageJ?.ok) setToolUsage(usageJ.usage ?? []);
      } catch {
        /* las tarjetas muestran su estado vacío */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  useEffect(() => {
    let cancelled = false;
    const environment = scope === "prod" ? "production" : "sandbox";
    const load = async () => {
      try {
        const res = await fetch(`/api/account/llm-usage?environment=${environment}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setLlmUsageError(true);
          setLlmUsage(null);
          return;
        }
        setLlmUsageError(false);
        setLlmUsage({
          prompt_tokens: data.prompt_tokens ?? 0,
          completion_tokens: data.completion_tokens ?? 0,
          total_tokens: data.total_tokens ?? 0,
          completion_calls: data.completion_calls ?? 0,
          usage: data.usage ?? [],
          daily_usage: data.daily_usage ?? [],
        });
      } catch {
        if (!cancelled) {
          setLlmUsageError(true);
          setLlmUsage(null);
        }
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [scope]);

  const byApp = new Map<string, ToolRow[]>();
  const core = t("core");
  for (const tool of tools ?? []) {
    const app = tool.app ?? core;
    const list = byApp.get(app) ?? [];
    list.push(tool);
    byApp.set(app, list);
  }
  const appGroups = [...byApp.entries()].sort(([a], [b]) =>
    a === core ? -1 : b === core ? 1 : a.localeCompare(b),
  );
  const addedApps = new Set((services ?? []).filter((s) => s.added).map((s) => s.service));
  const usesByApp = new Map<string, number>();
  for (const row of toolUsage ?? []) {
    usesByApp.set(row.app, (usesByApp.get(row.app) ?? 0) + row.uses);
  }
  const maxAppUses = Math.max(1, ...usesByApp.values());

  const byStatus = x402?.invoices_by_status ?? {};
  const settled = byStatus.settled ?? 0;
  const settledLamports = x402?.settled_lamports ?? 0;
  const settledSol = settledLamports / 1_000_000_000;
  const statusData = Object.entries(byStatus)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
  const dailyLimit = x402?.dpaas?.daily_limit_lamports ?? null;
  const dailyUsed = x402?.dpaas?.daily_used_lamports ?? 0;
  const dailyPct =
    dailyLimit && dailyLimit > 0 ? Math.min(100, (dailyUsed / dailyLimit) * 100) : null;
  const formatTokens = (value: number) => new Intl.NumberFormat(locale).format(value);
  const formatSol = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 9 }).format(value);
  const fiatRate = currency === "COP" ? marketRates?.usd_cop : 1;
  const fiatValue = settledLamports === 0
    ? 0
    : marketRates && fiatRate
      ? settledSol * marketRates.sol_usd * fiatRate
      : null;
  const formatFiat = (value: number) => new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "USD" ? 2 : 0,
    maximumFractionDigits: currency === "USD" ? 4 : 2,
  }).format(value);
  const tokensByDate = new Map((llmUsage?.daily_usage ?? []).map((day) => [day.date, day]));
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const tokenChartData = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(todayUtc.getTime() - (13 - index) * 24 * 60 * 60 * 1_000)
      .toISOString()
      .slice(0, 10);
    const day = tokensByDate.get(date);
    return {
      date,
      prompt_tokens: day?.prompt_tokens ?? 0,
      completion_tokens: day?.completion_tokens ?? 0,
    };
  });

  return (
    <div className="absolute inset-0 overflow-y-auto bg-background">
      <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 pb-10 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("summary")}</h2>
          <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <TabsList aria-label={t("scope")}>
              <TabsTrigger value="prod">{t("prod")}</TabsTrigger>
              <TabsTrigger value="sandbox">{t("sandbox")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {/* Tokens */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">{t("tokens")}</CardTitle>
              <p className="text-right text-2xl font-bold tabular-nums">
                {formatTokens(llmUsage?.total_tokens ?? 0)} <span className="text-sm font-medium text-muted-foreground">{t("tokensUnit")}</span>
              </p>
            </CardHeader>
            <CardContent className="pt-2">
              {llmUsageError && <p className="mb-2 text-xs text-muted-foreground">{t("tokenLoadError")}</p>}
              <TokenUsageChart data={tokenChartData} />
            </CardContent>
          </Card>

          {/* Tools por apps */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("toolsByApps")}</CardTitle>
              <CardDescription>
                {t("toolsInventory")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {tools === null ? (
                <div className="grid gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : appGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noTools")}</p>
              ) : (
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[46%]">{t("app")}</TableHead>
                      <TableHead className="w-[18%] text-right">{t("tools")}</TableHead>
                      <TableHead className="w-[36%]">{t("uses")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appGroups.map(([app, list]) => {
                      const uses = usesByApp.get(app) ?? 0;
                      const usePct = (uses / maxAppUses) * 100;
                      const logo =
                        app === core || app === "core"
                          ? "/nomik-mark-dark.png"
                          : app === "payload-cms"
                            ? "/apps/payload-cms.svg"
                            : null;
                      return (
                        <TableRow key={app}>
                          <TableCell>
                            <span className="flex min-w-0 flex-wrap items-center gap-2 font-medium">
                              <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white">
                                {logo ? (
                                  <Image
                                    src={logo}
                                    alt=""
                                    aria-hidden="true"
                                    width={20}
                                    height={20}
                                    className={app === "payload-cms"
                                      ? "size-5 object-cover object-left"
                                      : "size-4 object-contain"}
                                  />
                                ) : (
                                  <Blocks className="size-4 text-muted-foreground" aria-hidden="true" />
                                )}
                              </span>
                              <span className="truncate">{app}</span>
                              {addedApps.has(app) && (
                                <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">{t("inAccount")}</Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{formatTokens(list.length)}</TableCell>
                          <TableCell>
                            {toolUsage === null ? (
                              <Skeleton className="h-7 w-full" />
                            ) : (
                              <div className="grid min-w-16 gap-1.5">
                                <span className="text-right font-mono text-xs tabular-nums">{formatTokens(uses)}</span>
                                <Progress
                                  value={usePct}
                                  aria-label={`${app}: ${uses} ${t("uses").toLowerCase()}`}
                                  className="h-1.5"
                                />
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* x402 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("x402")}</CardTitle>
              <CardDescription>
                {scope === "prod" ? t("tolls") : t("tollsSandbox")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {x402 === null ? (
                <div className="grid gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-2 text-center">
                    <div className="rounded-lg border p-2">
                      <p className="text-xl font-bold tabular-nums">{formatTokens(x402.invoices_total ?? 0)}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{t("invoices")}</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="text-xl font-bold tabular-nums">{formatTokens(settled)}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{t("settled")}</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="whitespace-nowrap text-xs font-bold leading-tight tracking-tight tabular-nums sm:text-sm md:text-base">
                        {formatSol(settledSol)} SOL
                      </p>
                      <p className="text-[11px] tabular-nums text-muted-foreground">
                        {fiatValue === null ? t("fiatUnavailable") : formatFiat(fiatValue)}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{t("spend")}</p>
                    </div>
                  </div>
                  <Separator />
                  <InvoiceStatusBreakdown data={statusData} total={x402.invoices_total ?? 0} />
                  {dailyPct !== null && (
                    <Progress
                      value={dailyPct}
                      title={t("dailyUse", { pct: dailyPct.toFixed(0) })}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Docs */}
        <div className="grid gap-2">
          <h3 className="flex items-center justify-between">
            <span className="text-lg font-semibold">{t("docs")}</span>
            <Link href="/panel/docs" className="text-xs text-muted-foreground hover:text-foreground">{t("seeAll")}</Link>
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {listDocs(locale).map((d) => (
              <Link
                key={d.slug}
                href={`/panel/docs/${d.slug}`}
                className="grid gap-1 rounded-xl border p-4 transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <span className="flex items-center gap-2.5 text-sm font-semibold">
                  <DocIcon name={d.icon} className="size-5 shrink-0 text-primary" />
                  {d.title}
                </span>
                <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {d.summary}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
