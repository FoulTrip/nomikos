"use client";
/**
 * AgentDock — chat del agente abajo a la izquierda del sandbox.
 *
 * - Colapsado por defecto: píldora con chip del agente + estado del turno.
 * - Expandido: la conversación COMPLETA (historial del api, hasta 12 turnos)
 *   en burbujas legibles — respuestas con tablas/listas/negritas se pintan
 *   como gráficos reales (ChatRichText), no como muro de texto. Alto hasta
 *   arriba (max 72dvh) con scroll interno y auto-scroll al último turno.
 * - Debajo vive el compositor: textarea con botón de enviar ADENTRO, para
 *   chatear sin hablar. Mismo flujo que el mic (simSay → AMOLED → respuesta),
 *   sin reconocimiento de voz. Solo existe en modo sandbox.
 * - Estilo: el lenguaje del panel (tarjetas cálidas rounded-[32px], beige
 *   #F6F4EF, píldoras negras).
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, ChevronDown, LoaderCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatRichText from "@/components/panel/ChatRichText";
import { simSay, useNomikOS, type SimChatTurn } from "@/lib/os/nomikos";
import { useAgentFeed, type AgentStatus } from "@/lib/viewer/agent";
import { useSandbox } from "@/lib/viewer/sandbox";
import { cn } from "@/lib/utils";

const CARD =
  "rounded-[32px] border border-[#EDEDED] bg-white/95 shadow-[0_3px_16px_rgba(0,0,0,0.06)] backdrop-blur-md";
const CHIP =
  "flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F6F4EF] text-foreground";

export default function AgentDock() {
  const t = useTranslations("dock");
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
  // colapsada por defecto: la píldora aparece con el turno, sin ocupar
  const [collapsed, setCollapsed] = useState(true);
  const [hiddenTurn, setHiddenTurn] = useState(0);
  // compositor: chatear sin hablar (solo sandbox)
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // cada turno nuevo reabre el dock
  useEffect(() => {
    if (feed.turnTs > 0) setHiddenTurn(0);
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

  // auto-scroll al último turno del historial
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, pending, collapsed]);

  const showStatus =
    sandbox && hiddenTurn !== feed.turnTs && (feed.status !== "idle" || turns.length > 0);
  if (!sandbox) return null;

  const send = async () => {
    const msg = text.trim();
    if (!msg || busy) return;
    setSending(true);
    setCollapsed(false); // al chatear, la conversación se ve
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

  return (
    <div className="absolute bottom-4 left-4 z-[5] flex w-[380px] max-w-[calc(100vw-24px)] flex-col gap-2 max-md:right-3 max-md:left-3 max-md:w-auto">
      {/* estado del turno: píldora (colapsada) o chat completo (expandido) */}
      {showStatus &&
        (collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title={t("see")}
            className={cn(
              "flex w-fit cursor-pointer items-center gap-2 self-start rounded-full border border-[#EDEDED] bg-white/95 py-1 pr-3.5 pl-1 shadow-[0_3px_16px_rgba(0,0,0,0.06)] backdrop-blur-md",
            )}
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full",
                active ? "bg-[#171717] text-white" : "bg-[#F6F4EF] text-foreground",
              )}
            >
              <Bot className={cn("size-4", active && "animate-pulse")} />
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {STATUS_TEXT[feed.status]}
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        ) : (
          <div
            className={cn(
              CARD,
              "flex max-h-[min(72dvh,640px)] w-full flex-col overflow-hidden",
            )}
          >
            {/* cabecera compacta: chip + estado + controles */}
            <div className="flex shrink-0 items-center gap-2.5 px-4 pt-3.5 pb-3">
              <span className={cn(CHIP, active && "text-foreground")}>
                <Bot className={cn("size-5", active && "animate-pulse")} />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-[13px] font-semibold",
                    active && "text-foreground",
                  )}
                >
                  {STATUS_TEXT[feed.status]}
                </p>
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
                onClick={() => setCollapsed(true)}
                title={t("minimize")}
                className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setHiddenTurn(feed.turnTs)}
                title={t("hide")}
                className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="h-px shrink-0 bg-[#EDEDED]" />

            {/* historial del chat: alto hasta arriba, scroll interno */}
            <div
              ref={scrollRef}
              className="thin-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3.5"
            >
              <div className="grid gap-4">
                {turns.length === 0 && !pending && (
                  <p className="text-xs text-muted-foreground">{t("empty")}</p>
                )}
                {turns.map((m) => (
                  <div key={m.ts} className="grid gap-1.5">
                    {/* tu mensaje: píldora negra a la derecha */}
                    <div className="flex items-end justify-end gap-2">
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {ago(m.ts)}
                      </span>
                      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#171717] px-3.5 py-2 text-xs leading-relaxed text-white break-words">
                        {m.text}
                      </p>
                    </div>
                    {/* respuesta: burbuja beige con render rico */}
                    <div className="flex justify-start">
                      <div className="w-fit max-w-full rounded-2xl rounded-bl-md border border-[#EDEDED] bg-[#F6F4EF] px-3.5 py-2.5">
                        <ChatRichText text={m.reply} />
                      </div>
                    </div>
                  </div>
                ))}
                {/* turno en vuelo: tu mensaje + indicador de proceso */}
                {pending && (
                  <div className="grid gap-1.5">
                    <div className="flex items-end justify-end gap-2">
                      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#171717] px-3.5 py-2 text-xs leading-relaxed text-white break-words">
                        {feed.heard}
                      </p>
                    </div>
                    <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md border border-[#EDEDED] bg-[#F6F4EF] px-3.5 py-2.5">
                      <LoaderCircle className="size-3.5 animate-spin text-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {t("status.thinking")}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

      {/* compositor: chatear con el agente sin usar la voz */}
      <div className={cn(CARD, "p-2.5")}>
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
    </div>
  );
}
