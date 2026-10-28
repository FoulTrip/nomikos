"use client";
/**
 * DiagnosisCard — hermana de la Ficha técnica (mismo estilo del panel),
 * debajo de ella: los micro-peajes x402 LISTADOS y los logs del sistema
 * (payer, ERP). Cada sección es expandible/colapsable y con scroll
 * interno para ver todo el listado.
 *
 * Datos: GET /api/account/diagnosis (x402 summary + salud del ERP),
 * refresco cada 20 s.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSandbox } from "@/lib/viewer/sandbox";
import { cn } from "@/lib/utils";

interface Diagnosis {
  x402: {
    payer_configured?: boolean;
    summary?: {
      invoices_total?: number;
      invoices_by_status?: Record<string, number>;
      payouts_by_status?: Record<string, number>;
    } | null;
  } | null;
  erp: {
    running?: boolean;
    detail?: string | null;
  } | null;
}

const REFRESH_MS = 20_000;

/** Fila lista: etiqueta + valor (como la Ficha técnica, con color). */
function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "warn" | "bad" | "ok";
}) {
  return (
    <div>
      <dt className="text-[11px] tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-[13px] font-medium",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "bad" && "text-destructive",
          tone === "ok" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Subsección colapsable con scroll interno. */
function Fold({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-fit cursor-pointer items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
      >
        {title}
        {open ? (
          <ChevronUp className="size-3.5" />
        ) : (
          <ChevronDown className="size-3.5" />
        )}
      </button>
      {open && (
        <div className="thin-scroll grid max-h-44 gap-2.5 overflow-y-auto pr-1">
          {children}
        </div>
      )}
    </section>
  );
}

/** Log del sistema: punto de color + etiqueta + detalle. */
function Log({
  tone,
  label,
  detail,
}: {
  tone: "ok" | "warn" | "bad";
  label: string;
  detail: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-0.5 border-l-2 pl-2.5",
        tone === "ok" && "border-l-emerald-500",
        tone === "warn" && "border-l-amber-500",
        tone === "bad" && "border-l-red-500",
      )}
    >
      <p className="flex items-center gap-1.5 text-[12px] font-semibold">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            tone === "ok" && "bg-emerald-500",
            tone === "warn" && "bg-amber-500",
            tone === "bad" && "bg-red-500",
          )}
        />
        {label}
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground break-words">
        {detail}
      </p>
    </div>
  );
}

export default function DiagnosisCard() {
  const t = useTranslations("panel.diagnosis");
  const [open, setOpen] = useState(true);
  const [invoicesOpen, setInvoicesOpen] = useState(true);
  const [logsOpen, setLogsOpen] = useState(true);
  const [data, setData] = useState<Diagnosis | null>(null);
  const sandbox = useSandbox();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account/diagnosis", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as Diagnosis);
    } catch {
      /* best-effort: el próximo refresco re-intenta */
    }
  }, []);

  useEffect(() => {
    if (!sandbox) return;
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [sandbox, load]);

  if (!sandbox) return null;

  const by = data?.x402?.summary?.invoices_by_status ?? {};
  const pending = by["pending"] ?? 0;
  const verifying = by["verifying"] ?? 0;
  const settled = by["settled"] ?? 0;
  const failed = by["failed"] ?? 0;
  const total = data?.x402?.summary?.invoices_total ?? pending + verifying + settled + failed;
  const payouts = data?.x402?.summary?.payouts_by_status ?? {};
  const payoutsFailed = payouts["failed"] ?? 0;
  const payoutsConfirmed = payouts["confirmed"] ?? 0;
  const payerOk = data?.x402?.payer_configured === true;
  const erp = data?.erp;
  const erpRunning = erp?.running === true;

  return (
    <Card className="gap-3 py-4 max-md:hidden">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center justify-between text-xs font-semibold tracking-widest text-primary uppercase">
          {t("title")}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen((v) => !v)}
            title={open ? t("collapse") : t("expand")}
            aria-expanded={open}
            className="size-6"
          >
            {open ? <Minus className="size-4" /> : <Plus className="size-4" />}
          </Button>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="grid gap-4 px-4">
          {data === null ? (
            <p className="text-xs text-muted-foreground">{t("noData")}</p>
          ) : (
            <>
              {/* micro-peajes x402: listado con scroll interno */}
              <Fold
                title={t("invoices")}
                open={invoicesOpen}
                onToggle={() => setInvoicesOpen((v) => !v)}
              >
                <dl className="grid gap-2.5">
                  <Row
                    label={t("pending")}
                    value={pending}
                    tone={pending > 0 ? "warn" : "ok"}
                  />
                  {verifying > 0 && (
                    <Row label={t("verifying")} value={verifying} tone="warn" />
                  )}
                  <Row label={t("settled")} value={settled} tone="ok" />
                  <Row
                    label={t("failed")}
                    value={failed}
                    tone={failed > 0 ? "bad" : "ok"}
                  />
                  <Row label={t("total")} value={total} />
                </dl>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t("note")}
                </p>
              </Fold>

              {/* logs del sistema: expandible con scroll interno */}
              <Fold
                title={t("logs")}
                open={logsOpen}
                onToggle={() => setLogsOpen((v) => !v)}
              >
                <div className="grid gap-3">
                  {payerOk ? (
                    <Log tone="ok" label={t("payerOk")} detail={t("payerOkDetail")} />
                  ) : (
                    <Log
                      tone="warn"
                      label={t("payerWarn")}
                      detail={t("payerWarnDetail", {
                        failed: payoutsFailed,
                        confirmed: payoutsConfirmed,
                      })}
                    />
                  )}
                  {erp === null ? (
                    <Log tone="warn" label={t("erpUnknown")} detail={t("erpUnknownDetail")} />
                  ) : erpRunning ? (
                    <Log tone="ok" label={t("erpOk")} detail={t("erpOkDetail")} />
                  ) : (
                    <Log
                      tone="bad"
                      label={t("erpDown")}
                      detail={t("erpDownDetail", {
                        detail: erp?.detail ?? "sin respuesta",
                      })}
                    />
                  )}
                </div>
              </Fold>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
