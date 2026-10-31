"use client";
/**
 * AgentDock — conversación, facturas x402 y ficha técnica en el sandbox.
 *
 * - Colapsado por defecto: píldora con chip del agente + estado del turno.
 * - Expandido: la conversación COMPLETA (historial del api, hasta 12 turnos)
 *   en burbujas legibles — respuestas con tablas/listas/negritas se pintan
 *   como gráficos reales (ChatRichText), no como muro de texto. Alto hasta
 *   arriba (max 72dvh) con scroll interno y auto-scroll al último turno.
 * - Debajo vive el compositor: textarea con botón de enviar ADENTRO, para
 *   chatear sin hablar. Mismo flujo que el mic (simSay → AMOLED → respuesta),
 *   sin reconocimiento de voz. Solo existe en modo sandbox.
 * - Conversación, facturas y ficha técnica comparten una vista; solo una abre.
 * - Las superficies del dock usan fondo blanco para
 *   mantener el contenido legible sobre el canvas 3D.
 */

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { Blocks, Bot, ChevronDown, Cpu, LoaderCircle, Receipt, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatRichText from "@/components/panel/ChatRichText";
import DeviceSelect from "@/components/panel/DeviceSelect";
import ViewLockButton from "@/components/panel/ViewLockButton";
import { simSay, useNomikOS, type SimChatTurn } from "@/lib/os/nomikos";
import { useAgentFeed, type AgentStatus } from "@/lib/viewer/agent";
import { useSandbox } from "@/lib/viewer/sandbox";
import { cn } from "@/lib/utils";

const CARD =
  "rounded-[32px] border border-[#EDEDED] bg-white text-[#343433] shadow-[0_3px_16px_rgba(0,0,0,0.06)]";
const CHIP =
  "flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F6F4EF] text-foreground";

type DockSection = "turn" | "invoices" | "specs";

interface X402Invoice {
  id: string;
  resource: string;
  amount_lamports: number;
  status: string;
  tx_signature?: string | null;
  created_at: number;
  consumed_at?: number | null;
  app?: string | null;
  tool?: string | null;
}

interface X402Service {
  service: string;
  display_name: string;
  resource: string;
}

interface DAppTool {
  name: string;
  call?: { method?: string; path?: string };
}

interface DAppCatalogEntry {
  slug: string;
  name: string;
  tools?: DAppTool[];
}

const DAPP_LOGOS: Record<string, string> = {
  "payload-cms": "/apps/payload-cms.svg",
};

function resourcePath(resource: string): string {
  return resource.replace(/^x402:path:/, "");
}

function invoiceService(resource: string, services: X402Service[]): X402Service | undefined {
  const path = resourcePath(resource);
  return services.find((service) => {
    const pattern = resourcePath(service.resource);
    return pattern.endsWith("*")
      ? path.startsWith(pattern.slice(0, -1))
      : path === pattern;
  });
}

function parseAppResource(resource: string): { slug: string; method: string; path: string } | undefined {
  const match = /^x402:app:([^:]+):([^:]+):(.*)$/.exec(resource);
  if (!match) return undefined;
  return { slug: match[1], method: match[2], path: match[3] };
}

function pathMatchesTemplate(template: string, actual: string): boolean {
  const [templatePath, templateQuery = ""] = template.split("?", 2);
  const [actualPath, actualQuery = ""] = actual.split("?", 2);
  const templateSegments = templatePath.split("/");
  const actualSegments = actualPath.split("/");
  if (
    templateSegments.length !== actualSegments.length ||
    templateSegments.some((part, index) => {
      const value = actualSegments[index];
      return part.startsWith("{") && part.endsWith("}")
        ? !value
        : part !== value;
    })
  ) {
    return false;
  }

  const actualParams = new URLSearchParams(actualQuery);
  for (const [key, expected] of new URLSearchParams(templateQuery)) {
    const value = actualParams.get(key);
    if (value === null) return false;
    if (!(expected.startsWith("{") && expected.endsWith("}")) && expected !== value) {
      return false;
    }
  }
  return true;
}

function appToolForInvoice(invoice: X402Invoice, apps: DAppCatalogEntry[]): string | undefined {
  if (invoice.tool) return invoice.tool;
  const parsed = parseAppResource(invoice.resource);
  if (!parsed) return undefined;
  const app = apps.find((entry) => entry.slug === parsed.slug);
  return app?.tools?.find((tool) => {
    const path = tool.call?.path;
    if (!path || (tool.call?.method ?? "GET").toUpperCase() !== parsed.method.toUpperCase()) {
      return false;
    }
    return pathMatchesTemplate(path, parsed.path);
  })?.name;
}

export default function AgentDock({ specs }: { specs: [string, string][] }) {
  const t = useTranslations("dock");
  const locale = useLocale();
  const STATUS_TEXT: Record<AgentStatus, string> = {
    idle: t("status.idle"),
    listening: t("status.listening"),
    thinking: t("status.thinking"),
    done: t("status.done"),
    error: t("status.error"),
  };
  const ago = (ts: number): string => {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 8) return t("now");
    if (s < 60) return t("agoS", { s });
    return t("agoM", { m: Math.floor(s / 60) });
  };
  const sandbox = useSandbox();
  const feed = useAgentFeed();
  const os = useNomikOS();
  // Una sola sección puede estar abierta: conversación, facturas o ficha.
  const [section, setSection] = useState<DockSection | null>(null);
  const lastTurnTsRef = useRef(feed.turnTs);
  const [invoices, setInvoices] = useState<X402Invoice[] | null>(null);
  const [services, setServices] = useState<X402Service[]>([]);
  const [apps, setApps] = useState<DAppCatalogEntry[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState(false);
  // compositor: chatear sin hablar (solo sandbox)
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // No abrir el historial persistido al montar. Solo expandir cuando empieza
  // un turno nuevo en esta sesión del panel.
  useEffect(() => {
    const isNewTurn = feed.turnTs > 0 && feed.turnTs !== lastTurnTsRef.current;
    lastTurnTsRef.current = feed.turnTs;
    if (isNewTurn) {
      setSection("turn");
    }
  }, [feed.turnTs]);

  const active = feed.status === "listening" || feed.status === "thinking";
  const busy = sending || feed.status === "thinking";
  // historial: el api guarda los últimos turnos; fallback a la última
  // respuesta para cuentas viejas que aún no tienen la clave `chat`.
  const turns: SimChatTurn[] =
    os?.chat && os.chat.length > 0
      ? os.chat
      : os?.last_reply
        ? [os.last_reply]
        : [];
  const pending = feed.status === "thinking";

  // Auto-scroll al final del historial al abrir o recibir mensajes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, pending, section]);

  const toggleSection = (next: DockSection) => {
    setSection((current) => (current === next ? null : next));
  };

  const send = async () => {
    const msg = text.trim();
    if (!msg || busy) return;
    setSending(true);
    setSection("turn"); // al chatear, la conversación se ve
    try {
      await simSay(msg); // mismo flujo que el mic: feed → AMOLED → respuesta
      setText("");
      taRef.current?.focus();
    } catch {
      // el feed queda en error: la pantalla del OS y el dock lo muestran
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (section !== "invoices" || !sandbox) return;
    let active = true;
    let firstLoad = true;
    const load = async () => {
      if (firstLoad) {
        setInvoicesLoading(true);
        firstLoad = false;
      }
      setInvoicesError(false);
      try {
        const [invoiceRes, serviceRes, appRes] = await Promise.all([
          fetch("/api/account/x402/invoices?environment=sandbox", { cache: "no-store" }),
          fetch("/api/account/services", { cache: "no-store" }),
          fetch("/api/apps", { cache: "no-store" }),
        ]);
        const invoiceData = (await invoiceRes.json().catch(() => null)) as
          | { ok?: boolean; invoices?: X402Invoice[] }
          | null;
        const serviceData = (await serviceRes.json().catch(() => null)) as
          | { ok?: boolean; services?: X402Service[] }
          | null;
        const appData = (await appRes.json().catch(() => null)) as
          | { ok?: boolean; apps?: DAppCatalogEntry[] }
          | null;
        if (!invoiceRes.ok || invoiceData?.ok !== true) {
          throw new Error("invoice list unavailable");
        }
        if (active) {
          setInvoices(invoiceData.invoices ?? []);
          setServices(serviceData?.ok ? serviceData.services ?? [] : []);
          setApps(appData?.ok ? appData.apps ?? [] : []);
        }
      } catch {
        if (active) setInvoicesError(true);
      } finally {
        if (active) setInvoicesLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [section, sandbox]);

  if (!sandbox) return null;

  const invoiceStatus = (status: string, consumedAt?: number | null) => {
    if (status === "pending") return t("invoiceStatus.pending");
    if (status === "verifying") return t("invoiceStatus.verifying");
    if (status === "settled" && consumedAt) return t("invoiceStatus.consumed");
    if (status === "settled") return t("invoiceStatus.settled");
    if (status === "failed") return t("invoiceStatus.failed");
    return status;
  };

  const invoiceStatusStyle = (status: string) => {
    if (status === "settled") return "border-emerald-600/20 text-emerald-700";
    if (status === "failed") return "border-red-600/20 text-red-700";
    if (status === "verifying") return "border-blue-600/20 text-blue-700";
    return "border-amber-600/20 text-amber-700";
  };

  return (
    <div className="pointer-events-none absolute top-4 bottom-4 left-4 z-[5] flex w-[380px] max-w-[calc(100vw-24px)] flex-col justify-end gap-2 max-md:right-3 max-md:left-3 max-md:z-30 max-md:w-auto">
      {/* Los accesos abren una única sección del dock. */}
      <div className="pointer-events-auto flex w-fit max-w-full flex-wrap items-center gap-1 self-start">
        <button
          type="button"
          onClick={() => toggleSection("turn")}
          title={t("see")}
          aria-pressed={section === "turn"}
          className={cn(
            "flex min-h-7 cursor-pointer items-center gap-1.5 rounded-full border bg-white px-2.5 py-1.5 text-[11px] leading-none font-medium shadow-sm",
            section === "turn"
              ? "border-[#343433]/50 text-foreground"
              : "border-[#EDEDED] text-muted-foreground hover:text-foreground",
          )}
        >
          <Bot className={cn("size-3.5", active && "animate-pulse text-foreground")} />
          {t("lastTurn")}
          <ChevronDown className={cn("size-3 transition-transform", section === "turn" && "rotate-180")} />
        </button>
        <button
          type="button"
          onClick={() => toggleSection("invoices")}
          aria-pressed={section === "invoices"}
          className={cn(
            "flex min-h-7 cursor-pointer items-center gap-1.5 rounded-full border bg-white px-2.5 py-1.5 text-[11px] leading-none font-medium shadow-sm",
            section === "invoices"
              ? "border-[#343433]/50 text-foreground"
              : "border-[#EDEDED] text-muted-foreground hover:text-foreground",
          )}
        >
          <Receipt className="size-3.5" />
          {t("invoices")}
          <ChevronDown className={cn("size-3 transition-transform", section === "invoices" && "rotate-180")} />
        </button>
        <ViewLockButton />
        <button
          type="button"
          onClick={() => toggleSection("specs")}
          aria-pressed={section === "specs"}
          title={t("specs")}
          aria-label={t("specs")}
          className={cn(
            "flex size-8 cursor-pointer items-center justify-center rounded-full border bg-white shadow-sm",
            section === "specs"
              ? "border-[#343433]/50 text-foreground"
              : "border-[#EDEDED] text-muted-foreground hover:text-foreground",
          )}
        >
          <Cpu className="size-3.5" />
        </button>
      </div>

      {section === "turn" && (
        <div
          className={cn(
            CARD,
            "chat-screen-enter-right pointer-events-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden",
          )}
        >
          <div className="flex shrink-0 items-center gap-2.5 px-4 pt-3.5 pb-3">
            <span className={cn(CHIP, active && "text-foreground")}>
              <Bot className={cn("size-5", active && "animate-pulse")} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{STATUS_TEXT[feed.status]}</p>
              {feed.heard && (
                <p className="truncate text-xs text-muted-foreground" title={feed.heard}>
                  «{feed.heard}»
                </p>
              )}
              {feed.status === "error" && feed.error && (
                <p className="truncate text-xs text-destructive" title={feed.error}>
                  {feed.error}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSection(null)}
              title={t("minimize")}
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="h-px shrink-0 bg-[#EDEDED]" />

          <div ref={scrollRef} className="thin-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
            <div className="grid gap-4">
              {turns.length === 0 && !pending && (
                <p className="text-xs text-muted-foreground">{t("empty")}</p>
              )}
              {turns.map((m) => (
                <div key={m.ts} className="grid gap-1.5">
                  <div className="flex items-end justify-end gap-2">
                    <span className="shrink-0 text-[10px] text-muted-foreground">{ago(m.ts)}</span>
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#171717] px-3.5 py-2 text-xs leading-relaxed text-white break-words">
                      {m.text}
                    </p>
                  </div>
                  <div className="flex justify-start">
                    <div className="w-fit max-w-full rounded-2xl rounded-bl-md border border-[#EDEDED] bg-[#F6F4EF] px-3.5 py-2.5">
                      <ChatRichText text={m.reply} />
                    </div>
                  </div>
                </div>
              ))}
              {pending && (
                <div className="grid gap-1.5">
                  <div className="flex items-end justify-end gap-2">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#171717] px-3.5 py-2 text-xs leading-relaxed text-white break-words">
                      {feed.heard}
                    </p>
                  </div>
                  <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md border border-[#EDEDED] bg-[#F6F4EF] px-3.5 py-2.5">
                    <LoaderCircle className="size-3.5 animate-spin text-foreground" />
                    <span className="text-xs text-muted-foreground">{t("status.thinking")}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {section === "invoices" && (
        <div
          className={cn(
            CARD,
            "chat-screen-enter-right pointer-events-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden",
          )}
        >
          <div className="flex shrink-0 items-center gap-2.5 px-4 pt-3.5 pb-3">
            <span className={CHIP}><Receipt className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{t("invoices")}</p>
              <p className="truncate text-xs text-muted-foreground">{t("invoiceSubtitle")}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSection(null)}
              title={t("minimize")}
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="h-px shrink-0 bg-[#EDEDED]" />
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
            {invoicesLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                {t("loadingInvoices")}
              </div>
            ) : invoicesError ? (
              <p className="py-8 text-center text-xs text-muted-foreground">{t("invoiceError")}</p>
            ) : invoices?.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">{t("noInvoices")}</p>
            ) : (
              <div className="grid gap-2.5">
                {invoices?.map((invoice) => {
                  const service = invoiceService(invoice.resource, services);
                  const parsedApp = parseAppResource(invoice.resource);
                  const app = apps.find((entry) => entry.slug === parsedApp?.slug);
                  const appName = app?.name ?? invoice.app ?? service?.display_name ?? t("unknownApp");
                  const logo = app ? DAPP_LOGOS[app.slug] : undefined;
                  const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: 9 }).format(
                    invoice.amount_lamports / 1_000_000_000,
                  );
                  const date = new Intl.DateTimeFormat(locale, {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(invoice.created_at));
                  const toolName = appToolForInvoice(invoice, apps) ??
                    (parsedApp ? t("appRequestTool") : resourcePath(invoice.resource));
                  return (
                    <article key={invoice.id} className="grid gap-2 rounded-2xl border border-[#EDEDED]/80 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{amount} SOL</p>
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", invoiceStatusStyle(invoice.status))}>
                          {invoiceStatus(invoice.status, invoice.consumed_at)}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{date} · {invoice.id}</p>
                      <dl className="grid gap-1.5 text-xs">
                        <div className="grid grid-cols-[58px_minmax(0,1fr)] gap-2">
                          <dt className="text-muted-foreground">{t("invoiceApp")}</dt>
                          <dd className="flex min-w-0 items-center gap-1.5 font-medium" title={appName}>
                            {logo ? (
                              <Image src={logo} alt="" aria-hidden="true" width={20} height={20} className="size-5 shrink-0 object-contain" />
                            ) : (
                              <Blocks className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            )}
                            <span className="truncate">{appName}</span>
                          </dd>
                        </div>
                        <div className="grid grid-cols-[58px_minmax(0,1fr)] gap-2">
                          <dt className="text-muted-foreground">{t("invoiceTool")}</dt>
                          <dd className="truncate font-medium" title={toolName}>{toolName || "—"}</dd>
                        </div>
                      </dl>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {section === "specs" && (
        <div
          className={cn(
            CARD,
            "chat-screen-enter-right pointer-events-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden",
          )}
        >
          <div className="flex shrink-0 items-center gap-2.5 px-4 pt-3.5 pb-3">
            <span className={CHIP}><Cpu className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{t("specs")}</p>
              <p className="truncate text-xs text-muted-foreground">{t("specsSubtitle")}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSection(null)}
              title={t("minimize")}
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="h-px shrink-0 bg-[#EDEDED]" />
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
            <DeviceSelect />
            <div className="my-4 h-px bg-[#EDEDED]" />
            <dl className="grid gap-3">
              {specs.map(([term, value]) => (
                <div key={term} className="grid gap-0.5 border-b border-[#EDEDED] pb-3 last:border-0 last:pb-0">
                  <dt className="text-[11px] tracking-wider text-muted-foreground uppercase">
                    {term}
                  </dt>
                  <dd className="text-sm leading-relaxed">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {/* compositor: chatear con el agente sin usar la voz */}
      {section !== "invoices" && section !== "specs" && (
        <div className={cn(CARD, "pointer-events-auto p-2.5")}>
          <div className="relative rounded-2xl bg-[#F6F4EF] focus-within:ring-1 focus-within:ring-[#171717]/25">
            <textarea
              ref={taRef}
              value={text}
              rows={2}
              maxLength={500}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={t("chatPh")}
              aria-label={t("chatPh")}
              className="max-h-32 min-h-14 w-full resize-none bg-transparent py-2.5 pr-12 pl-3.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <Button
              type="button"
              size="icon"
              onClick={() => void send()}
              disabled={busy || !text.trim()}
              title={t("send")}
              aria-label={t("send")}
              className="absolute right-2 bottom-2 size-9 shrink-0 rounded-full bg-[#171717] text-white hover:bg-[#171717]/85 disabled:opacity-40"
            >
              {sending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
