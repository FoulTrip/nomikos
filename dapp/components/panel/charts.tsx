"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle2,
  CircleHelp,
  CircleX,
  Clock3,
  LoaderCircle,
  ReceiptText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const GRID = "rgba(52,52,51,0.08)";
const TICK = "#848281";

function TokenUsageTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey?: string; value?: number | string }[];
  label?: string;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  if (!active || !payload?.length) return null;
  const date = label
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${label}T00:00:00Z`))
    : "";
  return (
    <div className="grid gap-1.5 rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{date}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="flex items-center justify-between gap-5 text-muted-foreground">
          <span>
            {item.dataKey === "prompt_tokens"
              ? t("tokenPrompt")
              : item.dataKey === "total_tokens"
                ? t("tokenTotal")
                : t("tokenCompletion")}
          </span>
          <span className="font-mono font-medium text-foreground">
            {new Intl.NumberFormat(locale).format(Number(item.value ?? 0))}
          </span>
        </p>
      ))}
    </div>
  );
}

/** Gráfico diario compacto para comparar entrada, salida y total en tarjetas separadas. */
export function TokenUsageChart({
  data,
  dataKey,
  color,
}: {
  data: {
    date: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }[];
  dataKey: "prompt_tokens" | "completion_tokens" | "total_tokens";
  color: string;
}) {
  const locale = useLocale();
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${value}T00:00:00Z`),
    );
  return (
    <div className="h-32 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={dateLabel}
            tick={{ fill: TICK, fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            minTickGap={12}
            interval={
              data.length > 60 ? 13 : data.length > 30 ? 5 : data.length > 9 ? 2 : "preserveStartEnd"
            }
          />
          <Tooltip content={<TokenUsageTooltip />} />
          <Bar
            dataKey={dataKey}
            fill={color}
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Estado x402 compacto: conteos y proporciones con componentes shadcn. */
export function InvoiceStatusBreakdown({
  data,
  total,
}: {
  data: {
    status: string;
    count: number;
    amount: { primary: string; secondary?: string };
  }[];
  total: number;
}) {
  const t = useTranslations("panel.charts");
  const locale = useLocale();
  const states: Record<string, {
    label: string;
    icon: typeof CheckCircle2;
    iconClass: string;
    progressClass: string;
  }> = {
    settled: {
      label: t("invoiceSettled"),
      icon: CheckCircle2,
      iconClass: "text-emerald-600",
      progressClass: "[&>[data-slot=progress-indicator]]:bg-emerald-500",
    },
    pending: {
      label: t("invoicePending"),
      icon: Clock3,
      iconClass: "text-amber-600",
      progressClass: "[&>[data-slot=progress-indicator]]:bg-amber-500",
    },
    verifying: {
      label: t("invoiceVerifying"),
      icon: LoaderCircle,
      iconClass: "text-blue-600",
      progressClass: "[&>[data-slot=progress-indicator]]:bg-blue-500",
    },
    failed: {
      label: t("invoiceFailed"),
      icon: CircleX,
      iconClass: "text-red-600",
      progressClass: "[&>[data-slot=progress-indicator]]:bg-red-500",
    },
  };

  if (data.length === 0) {
    return (
      <div className="flex min-h-24 items-center justify-center">
        <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <ReceiptText className="size-4" aria-hidden="true" />
          <span>{t("noInvoicesIndicator")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {data.map(({ status, count, amount }) => {
        const state = states[status] ?? {
          label: status,
          icon: CircleHelp,
          iconClass: "text-muted-foreground",
          progressClass: "",
        };
        const Icon = state.icon;
        return (
          <div key={status} className="grid min-w-0 gap-1.5">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <Badge variant="outline" className="min-w-0 gap-1.5 text-[10px]">
                  <Icon className={`size-3.5 shrink-0 ${state.iconClass}`} aria-hidden="true" />
                  <span className="truncate">{state.label}</span>
                </Badge>
                <Badge variant="secondary" className="shrink-0 px-1.5 font-mono text-[10px] tabular-nums">
                  {new Intl.NumberFormat(locale).format(count)}
                </Badge>
              </div>
              <div className="grid shrink-0 justify-items-end gap-0.5 text-right">
                <span className="text-xs font-medium tabular-nums">{amount.primary}</span>
                {amount.secondary && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {amount.secondary}
                  </span>
                )}
              </div>
            </div>
            <Progress
              value={total > 0 ? (count / total) * 100 : 0}
              aria-label={`${state.label}: ${count} / ${total}`}
              className={`h-1.5 ${state.progressClass}`}
            />
          </div>
        );
      })}
    </div>
  );
}
