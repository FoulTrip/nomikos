"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
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
          <span>{item.dataKey === "prompt_tokens" ? t("tokenPrompt") : t("tokenCompletion")}</span>
          <span className="font-mono font-medium text-foreground">
            {new Intl.NumberFormat(locale).format(Number(item.value ?? 0))}
          </span>
        </p>
      ))}
    </div>
  );
}

/** Área apilada: tokens de entrada y salida por día durante los últimos 14 días. */
export function TokenUsageChart({
  data,
}: {
  data: { date: string; prompt_tokens: number; completion_tokens: number }[];
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${value}T00:00:00Z`),
    );
  const compactNumber = (value: number) =>
    new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);

  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="tokenPromptFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6172F3" stopOpacity={0.24} />
              <stop offset="100%" stopColor="#6172F3" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="tokenCompletionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#26A879" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#26A879" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={dateLabel}
            tick={{ fill: TICK, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={20}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={compactNumber}
            tick={{ fill: TICK, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={44}
          />
          <Tooltip content={<TokenUsageTooltip />} />
          <Legend
            iconType="circle"
            iconSize={7}
            formatter={(value) => value === "prompt_tokens" ? t("tokenPrompt") : t("tokenCompletion")}
            wrapperStyle={{ fontSize: 11, color: TICK }}
          />
          <Area
            type="monotone"
            dataKey="prompt_tokens"
            stackId="tokens"
            stroke="#6172F3"
            strokeWidth={2}
            fill="url(#tokenPromptFill)"
            activeDot={{ r: 4 }}
          />
          <Area
            type="monotone"
            dataKey="completion_tokens"
            stackId="tokens"
            stroke="#26A879"
            strokeWidth={2}
            fill="url(#tokenCompletionFill)"
            activeDot={{ r: 4 }}
          />
        </AreaChart>
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
              <Badge variant="outline" className="min-w-0 gap-1.5 text-[10px]">
                <Icon className={`size-3.5 shrink-0 ${state.iconClass}`} aria-hidden="true" />
                <span className="truncate">{state.label}</span>
              </Badge>
              <div className="grid shrink-0 justify-items-end gap-0.5 text-right">
                <span className="font-mono text-xs tabular-nums">
                  {new Intl.NumberFormat(locale).format(count)}
                </span>
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
