"use client";
import { useLocale, useTranslations } from "next-intl";
/**
 * Dashboard — métricas de tokens con periodo seleccionable, tools por apps
 * y análisis x402, distinguido entre "producción" y "sandbox", más docs.
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
type TokenPeriod = "7d" | "30d" | "90d";

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
  invoices_lamports_by_status?: Record<string, number>;
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
  const [tokenPeriod, setTokenPeriod] = useState<TokenPeriod>("7d");
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
        const days = tokenPeriod.slice(0, -1);
        const res = await fetch(`/api/account/llm-usage?environment=${environment}&days=${days}`, { cache: "no-store" });
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
  }, [scope, tokenPeriod]);

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
  const usageByProvider = new Map<string, { completion_calls: number; total_tokens: number }>();
  for (const row of llmUsage?.usage ?? []) {
    const current = usageByProvider.get(row.provider) ?? { completion_calls: 0, total_tokens: 0 };
    current.completion_calls += row.completion_calls;
    current.total_tokens += row.total_tokens;
    usageByProvider.set(row.provider, current);
  }
  const mostUsedProvider = [...usageByProvider.entries()].sort(
    ([, a], [, b]) => b.completion_calls - a.completion_calls || b.total_tokens - a.total_tokens,
  )[0];
  const modelUsage = [...(llmUsage?.usage ?? [])].sort(
    (a, b) => b.completion_calls - a.completion_calls || b.total_tokens - a.total_tokens,
  );
  const mostUsedModel = modelUsage[0];

  const byStatus = x402?.invoices_by_status ?? {};
  const lamportsByStatus = x402?.invoices_lamports_by_status ?? {};
  const settledLamports = x402?.settled_lamports ?? 0;
  const settledSol = settledLamports / 1_000_000_000;
  const statusData = Object.entries(byStatus)
    .map(([status, count]) => ({
      status,
      count,
      amountLamports: lamportsByStatus[status] ?? 0,
    }))
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
  const formatInvoiceAmount = (lamports: number) => {
    const sol = lamports / 1_000_000_000;
    const fiatRate = currency === "COP" ? marketRates?.usd_cop : 1;
    if (marketRates && fiatRate != null) {
      const fiatAmount = new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: currency === "USD" ? 4 : 2,
      }).format(sol * marketRates.sol_usd * fiatRate);
      return {
        primary: fiatAmount,
        secondary: `${formatSol(sol)} SOL`,
      };
    }
    return { primary: `${formatSol(sol)} SOL`, secondary: undefined };
  };
  const tokenDays = Number(tokenPeriod.slice(0, -1));
  const tokensByDate = new Map((llmUsage?.daily_usage ?? []).map((day) => [day.date, day]));
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const tokenChartData = Array.from({ length: tokenDays }, (_, index) => {
    const date = new Date(todayUtc.getTime() - (tokenDays - 1 - index) * 24 * 60 * 60 * 1_000)
      .toISOString()
      .slice(0, 10);
    const day = tokensByDate.get(date);
    return {
      date,
      prompt_tokens: day?.prompt_tokens ?? 0,
      completion_tokens: day?.completion_tokens ?? 0,
      total_tokens: day?.total_tokens ?? 0,
    };
  });

  return (
    <div className="absolute inset-0 overflow-y-auto bg-background">
      <div className="mx-auto grid w-full max-w-5xl gap-5 px-4 pt-4 pb-10 sm:px-6 sm:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <TabsList aria-label={t("scope")}>
              <TabsTrigger value="prod">{t("prod")}</TabsTrigger>
              <TabsTrigger value="sandbox">{t("sandbox")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={tokenPeriod} onValueChange={(v) => setTokenPeriod(v as TokenPeriod)}>
            <TabsList aria-label={t("period")}>
              <TabsTrigger value="7d">7d</TabsTrigger>
              <TabsTrigger value="30d">30d</TabsTrigger>
              <TabsTrigger value="90d">90d</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <section aria-label={t("tokens")} className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {([
            {
              key: "prompt_tokens",
              label: t("tokenPrompt"),
              value: llmUsage?.prompt_tokens ?? 0,
              color: "#6172F3",
            },
            {
              key: "completion_tokens",
              label: t("tokenCompletion"),
              value: llmUsage?.completion_tokens ?? 0,
              color: "#26A879",
            },
            {
              key: "total_tokens",
              label: t("tokenTotal"),
              value: llmUsage?.total_tokens ?? 0,
              color: "#343433",
            },
          ] as const).map((metric) => (
            <Card key={metric.key} className="h-full gap-2 py-4">
              <CardHeader className="gap-1 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">{metric.label}</CardTitle>
                  <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">
                    {t("tokenPeriod", { days: tokenDays })}
                  </Badge>
                </div>
                <p className="text-2xl font-bold leading-none tabular-nums">
                  {formatTokens(metric.value)} <span className="text-xs font-medium text-muted-foreground">{t("tokensUnit")}</span>
                </p>
              </CardHeader>
              <CardContent className="min-h-0 px-3 pb-2 pt-0">
                {llmUsageError && <p className="mb-1 text-xs text-muted-foreground">{t("tokenLoadError")}</p>}
                <TokenUsageChart
                  data={tokenChartData}
                  dataKey={metric.key}
                  color={metric.color}
                />
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="h-full">
          <CardHeader className="gap-1">
            <CardTitle className="text-sm">{t("providerModelUsage")}</CardTitle>
            <CardDescription>{t("providerModelUsageDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-lg border px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("mostUsedProvider")}</p>
                <p className="truncate text-sm font-semibold">{mostUsedProvider?.[0] ?? "—"}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {mostUsedProvider
                    ? `${formatTokens(mostUsedProvider[1].completion_calls)} ${t("calls")} · ${formatTokens(mostUsedProvider[1].total_tokens)} ${t("tokensUnit")}`
                    : t("noModelUsage")}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("mostUsedModel")}</p>
                <p className="truncate text-sm font-semibold">{mostUsedModel?.model ?? "—"}</p>
                <p className="truncate text-xs tabular-nums text-muted-foreground">
                  {mostUsedModel
                    ? `${mostUsedModel.provider} · ${formatTokens(mostUsedModel.completion_calls)} ${t("calls")} · ${formatTokens(mostUsedModel.total_tokens)} ${t("tokensUnit")}`
                    : t("noModelUsage")}
                </p>
              </div>
            </div>
            {modelUsage.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[620px] table-fixed text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[17%] whitespace-nowrap px-2">{t("provider")}</TableHead>
                      <TableHead className="w-[28%] whitespace-nowrap px-2">{t("model")}</TableHead>
                      <TableHead className="w-[12%] whitespace-nowrap px-2 text-right">{t("calls")}</TableHead>
                      <TableHead className="w-[14%] whitespace-nowrap px-2 text-right">{t("inputTokens")}</TableHead>
                      <TableHead className="w-[14%] whitespace-nowrap px-2 text-right">{t("outputTokens")}</TableHead>
                      <TableHead className="w-[15%] whitespace-nowrap px-2 text-right">{t("totalTokens")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelUsage.map((row) => (
                      <TableRow key={`${row.provider}:${row.model}`}>
                        <TableCell className="truncate px-2 font-medium">{row.provider}</TableCell>
                        <TableCell className="truncate px-2 font-mono" title={row.model}>{row.model}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 text-right tabular-nums">{formatTokens(row.completion_calls)}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 text-right tabular-nums">{formatTokens(row.prompt_tokens)}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 text-right tabular-nums">{formatTokens(row.completion_tokens)}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 text-right font-semibold tabular-nums">{formatTokens(row.total_tokens)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("noModelUsage")}</p>
            )}
          </CardContent>
        </Card>

        <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">

          {/* Tools por apps */}
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-sm">{t("toolsByApps")}</CardTitle>
              <CardDescription>
                {t("toolsInventory")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid flex-1 content-start gap-3">
              {tools === null ? (
                <div className="grid gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : appGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noTools")}</p>
              ) : (
                <Table className="table-fixed text-[11px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[46%] whitespace-nowrap px-2 text-[10px]">{t("app")}</TableHead>
                      <TableHead className="w-[18%] whitespace-nowrap px-1 text-right text-[10px]">{t("tools")}</TableHead>
                      <TableHead className="w-[36%] whitespace-nowrap px-2 text-[10px]">{t("uses")}</TableHead>
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
                          <TableCell className="px-2">
                            <span className="flex min-w-0 items-center gap-1 font-medium">
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
                              <span className="truncate text-[10px]">{app}</span>
                              {addedApps.has(app) && (
                                <Badge variant="secondary" className="shrink-0 px-1 py-0 text-[8px]">{t("inAccount")}</Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-1 text-right font-mono text-[10px] tabular-nums">{formatTokens(list.length)}</TableCell>
                          <TableCell className="px-2">
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
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-sm">{t("x402")}</CardTitle>
              <CardDescription>
                {scope === "prod" ? t("tolls") : t("tollsSandbox")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid flex-1 content-start gap-3">
              {x402 === null ? (
                <div className="grid gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : (
                <>
                  <div className="flex justify-start">
                    <div className="flex min-w-40 items-center gap-3 rounded-lg border px-3 py-2">
                      <div className="text-left">
                        <p className="whitespace-nowrap text-sm font-bold leading-tight tracking-tight tabular-nums">
                          {fiatValue === null ? t("fiatUnavailable") : formatFiat(fiatValue)}
                        </p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          {formatSol(settledSol)} SOL
                        </p>
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <InvoiceStatusBreakdown
                    data={statusData.map((item) => ({ ...item, amount: formatInvoiceAmount(item.amountLamports) }))}
                    total={x402.invoices_total ?? 0}
                  />
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

          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-sm">{t("dailyBudget")}</CardTitle>
              <CardDescription>{t("dailyBudgetDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid flex-1 content-start gap-4">
              {x402 === null ? (
                <div className="grid gap-3">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : (
                <>
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{t("dpaasBalance")}</p>
                      <p className="mt-1 truncate text-2xl font-bold tabular-nums">
                        {x402.dpaas?.balance_lamports == null
                          ? "—"
                          : `${formatSol(x402.dpaas.balance_lamports / 1_000_000_000)} ${t("sol")}`}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 capitalize">
                      {x402.dpaas?.network ?? "—"}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{t("dailySpent")}</span>
                      <span className="font-medium tabular-nums">
                        {formatSol(dailyUsed / 1_000_000_000)} / {dailyLimit == null
                          ? t("noDailyLimit")
                          : `${formatSol(dailyLimit / 1_000_000_000)} ${t("sol")}`}
                      </span>
                    </div>
                    {dailyPct !== null ? (
                      <Progress value={dailyPct} aria-label={t("dailyUse", { pct: dailyPct.toFixed(0) })} />
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("noDailyLimitDescription")}</p>
                    )}
                  </div>
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
