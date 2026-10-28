"use client";
import { useTranslations } from "next-intl";
/**
 * charts — gráficas del dashboard (recharts con estilo shadcn).
 * Datos 100% reales del api; sin datos se muestra estado vacío.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const GRID = "rgba(52,52,51,0.08)";
const TICK = "#848281";

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number | string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-semibold">{label}</p>
      <p className="font-mono text-muted-foreground">{payload[0].value}</p>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  settled: "#44C67F",
  pending: "#F5B442",
  verifying: "#4DAFFF",
  failed: "#EF4444",
  consumed: "#5F5DE7",
};

/** Barras verticales: facturas x402 por estado. */
export function InvoicesByStatusChart({ data }: { data: { status: string; count: number }[] }) {
  const t = useTranslations("panel.charts");
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("noInvoices")}</p>;
  }
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="status" tick={{ fill: TICK, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: TICK, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(52,52,51,0.05)" }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? "#848281"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras horizontales: tools por app. */
export function ToolsByAppChart({ data }: { data: { app: string; tools: number }[] }) {
  const t = useTranslations("panel.charts");
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("noTools")}</p>;
  }
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={{ fill: TICK, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="app"
            width={92}
            tick={{ fill: TICK, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(52,52,51,0.05)" }} />
          <Bar dataKey="tools" radius={[0, 4, 4, 0]} fill="#F5B442" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
