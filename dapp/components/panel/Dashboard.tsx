"use client";
/**
 * Dashboard — lo que /panel muestra con el sandbox APAGADO: modelo y
 * proveedor, tokens, tools por apps y análisis x402, distinguido entre
 * "producción" y "sandbox", más la cuadrícula de documentación.
 *
 * 100% shadcn (Tabs, Card, Badge, Table, Progress, Skeleton, Separator)
 * + gráficas recharts. Datos reales del api; donde aún no hay medidor
 * se muestra estado vacío honesto en vez de inventar cifras.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { InvoicesByStatusChart, ToolsByAppChart } from "./charts";
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

export default function Dashboard() {
  const [scope, setScope] = useState<Scope>("prod");
  const [x402, setX402] = useState<X402Summary | null>(null);
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [tools, setTools] = useState<ToolRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [x402Res, svcRes, toolsRes] = await Promise.all([
          fetch("/api/account/x402/summary", { cache: "no-store" }),
          fetch("/api/account/services", { cache: "no-store" }),
          fetch("/api/agent/tools", { cache: "no-store" }),
        ]);
        const [x402J, svcJ, toolsJ] = await Promise.all([
          x402Res.json().catch(() => null),
          svcRes.json().catch(() => null),
          toolsRes.json().catch(() => null),
        ]);
        if (cancelled) return;
        if (x402J?.ok) setX402(x402J);
        if (svcJ?.ok) setServices(svcJ.services ?? []);
        if (Array.isArray(toolsJ)) setTools(toolsJ);
      } catch {
        /* las tarjetas muestran su estado vacío */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byApp = new Map<string, ToolRow[]>();
  for (const t of tools ?? []) {
    const app = t.app ?? "núcleo";
    const list = byApp.get(app) ?? [];
    list.push(t);
    byApp.set(app, list);
  }
  const appGroups = [...byApp.entries()].sort(([a], [b]) =>
    a === "núcleo" ? -1 : b === "núcleo" ? 1 : a.localeCompare(b),
  );
  const addedApps = new Set((services ?? []).filter((s) => s.added).map((s) => s.service));

  const byStatus = x402?.invoices_by_status ?? {};
  const settled = byStatus.settled ?? 0;
  const statusData = Object.entries(byStatus)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
  const toolsData = appGroups.map(([app, list]) => ({ app, tools: list.length }));
  const dailyLimit = x402?.dpaas?.daily_limit_lamports ?? null;
  const dailyUsed = x402?.dpaas?.daily_used_lamports ?? 0;
  const dailyPct =
    dailyLimit && dailyLimit > 0 ? Math.min(100, (dailyUsed / dailyLimit) * 100) : null;

  return (
    <div className="absolute inset-0 overflow-y-auto bg-background">
      <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 pb-10 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Resumen de la cuenta</h2>
          <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <TabsList aria-label="Ámbito">
              <TabsTrigger value="prod">Producción</TabsTrigger>
              <TabsTrigger value="sandbox">Sandbox</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Tokens */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">
                Uso de tokens
              </CardTitle>
              <CardDescription>
                {scope === "prod" ? "Consumo del modelo activo" : "Consumo del sandbox"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-muted-foreground">—</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {scope === "prod"
                  ? "Sin medidor — el gateway aún no reporta tokens. Próximo paso: contador por cuenta en el api."
                  : "Sin actividad registrada — el sandbox es efímero y aún no registra su propio uso."}
              </p>
            </CardContent>
          </Card>

          {/* Tools por apps */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Tools por apps
              </CardTitle>
              <CardDescription>
                Inventario disponible para el agente
                {scope === "sandbox" ? " (igual en sandbox)" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {tools === null ? (
                <div className="grid gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : appGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin tools.</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>App</TableHead>
                        <TableHead className="text-right">Tools</TableHead>
                        <TableHead className="text-right">Usos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {appGroups.map(([app, list]) => (
                        <TableRow key={app}>
                          <TableCell>
                            <span className="flex items-center gap-2 font-medium">
                              {app}
                              {addedApps.has(app) && (
                                <Badge variant="secondary" className="text-[10px]">
                                  en tu cuenta
                                </Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">{list.length}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">—</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Separator />
                  <ToolsByAppChart data={toolsData} />
                </>
              )}
            </CardContent>
          </Card>

          {/* x402 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Análisis x402
              </CardTitle>
              <CardDescription>
                {scope === "prod" ? "Peajes de la cuenta" : "Peajes del sandbox"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {scope === "sandbox" ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  0 peajes — el sandbox aún no registra peajes propios. Los
                  peajes de prueba caen hoy en producción.
                </p>
              ) : x402 === null ? (
                <div className="grid gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border p-2">
                      <p className="text-xl font-bold">{x402.invoices_total ?? 0}</p>
                      <p className="text-[11px] text-muted-foreground">facturas</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="text-xl font-bold">{settled}</p>
                      <p className="text-[11px] text-muted-foreground">liquidadas</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="text-xl font-bold">
                        {(x402.settled_lamports ?? 0) / 1_000_000_000 < 0.0001
                          ? "≈0"
                          : ((x402.settled_lamports ?? 0) / 1_000_000_000).toFixed(4)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">SOL</p>
                    </div>
                  </div>
                  <Separator />
                  <InvoicesByStatusChart data={statusData} />
                  {dailyPct !== null && (
                    <Progress
                      value={dailyPct}
                      title={`Uso del límite diario: ${dailyPct.toFixed(0)}%`}
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
            <span className="text-lg font-semibold">Documentación</span>
            <Link href="/panel/docs" className="text-xs text-muted-foreground hover:text-foreground">
              Ver todas →
            </Link>
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {listDocs().map((d) => (
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
