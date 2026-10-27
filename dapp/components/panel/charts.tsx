"use client";
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

const GRID = "rgba(255,255,255,0.08)";
const TICK = "#a1a1aa";

function DarkTooltip({
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
  settled: "#34d399",
  pending: "#fbbf24",
  verifying: "#38bdf8",
  failed: "#f87171",
  consumed: "#a78bfa",
};

/** Barras verticales: facturas x402 por estado. */
export function InvoicesByStatusChart({ data }: { data: { status: string; count: number }[] }) {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin facturas todavía.</p>;
  }
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="status" tick={{ fill: TICK, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: TICK, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? "#71717a"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras horizontales: tools por app. */
export function ToolsByAppChart({ data }: { data: { app: string; tools: number }[] }) {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin tools todavía.</p>;
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
          <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="tools" radius={[0, 4, 4, 0]} fill="#eab308" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
