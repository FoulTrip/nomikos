"use client";
/**
 * AgentDock — la mascota + preview en vivo del turno agéntico, abajo
 * a la izquierda del sandbox. Compacto por diseño: estado, lo oído,
 * la respuesta (expandible) y el mini-flujo de eventos. Sin gráficas
 * ni ruido: lo esencial del razonamiento en tiempo real.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Mascot from "./Mascot";
import { useNomikOS } from "@/lib/os/nomikos";
import { useAgentFeed, type AgentStatus } from "@/lib/viewer/agent";
import { useSandbox } from "@/lib/viewer/sandbox";
import { cn } from "@/lib/utils";

const EV_LABEL: Record<string, string> = {
  boot: "arranque",
  enroll: "registro",
  claim: "emparejado",
  online: "en línea",
  "code-renewed": "código renovado",
  tap: "toque",
  unlock: "desbloqueo",
  lock: "bloqueo",
  "set-provider": "proveedor",
  "set-model": "modelo",
  apps: "apps",
  x402: "peaje x402",
  say: "turno de voz",
  rebuild: "reconstruido",
};

const STATUS_TEXT: Record<AgentStatus, string> = {
  idle: "Último turno",
  listening: "Escuchando…",
  thinking: "Pensando…",
  done: "Listo",
  error: "Ups",
};

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 8) return "ahora";
  if (s < 60) return `hace ${s}s`;
  return `hace ${Math.floor(s / 60)}m`;
}

export default function AgentDock() {
  const sandbox = useSandbox();
  const feed = useAgentFeed();
  const os = useNomikOS();
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hiddenTurn, setHiddenTurn] = useState(0);

  // cada turno nuevo reabre el dock
  useEffect(() => {
    if (feed.turnTs > 0) setHiddenTurn(0);
  }, [feed.turnTs]);

  const active = feed.status === "listening" || feed.status === "thinking";
  const reply = os?.last_reply ?? null;
  const show = sandbox && hiddenTurn !== feed.turnTs && (feed.status !== "idle" || reply !== null);
  if (!show) return null;

  const trail = (os?.events ?? [])
    .filter((e) => e.ev !== "heartbeat")
    .slice(-4)
    .reverse();

  if (collapsed) {
    return (
      <div className="absolute bottom-4 left-4 z-[5] max-md:right-3 max-md:left-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Ver actividad del agente"
          className="flex cursor-pointer items-center gap-2 rounded-full border bg-background/90 py-1 pr-3 pl-1 shadow-md backdrop-blur"
        >
          <Mascot mood={feed.status} size={30} />
          <span
            className={cn(
              "text-xs",
              active ? "animate-pulse text-primary" : "text-muted-foreground",
            )}
          >
            {STATUS_TEXT[feed.status]}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 left-4 z-[5] w-72 max-md:right-3 max-md:left-3 max-md:w-auto">
      <Card className="gap-2 bg-background/92 py-3 shadow-lg backdrop-blur">
        <CardContent className="grid gap-2 px-3">
          <div className="flex items-center gap-2.5">
            <Mascot mood={feed.status} size={44} />
            <div className="min-w-0 flex-1">
              <p className={cn("text-[13px] font-semibold", active && "animate-pulse text-primary")}>
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
              title="Minimizar"
              className="size-7 shrink-0"
            >
              <ChevronDown className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setHiddenTurn(feed.turnTs)}
              title="Ocultar"
              className="size-7 shrink-0"
            >
              <X className="size-4" />
            </Button>
          </div>

          {reply && (
            <>
              <Separator />
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                title={expanded ? "Contraer" : "Expandir"}
                className="grid cursor-pointer gap-1 text-left"
              >
                <span className="flex items-center justify-between text-[11px] tracking-wider text-muted-foreground uppercase">
                  Responde · {ago(reply.ts)}
                  {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </span>
                <span className={cn("text-xs leading-relaxed", !expanded && "line-clamp-3")}>
                  {reply.reply}
                </span>
              </button>
            </>
          )}

          {trail.length > 0 && (
            <>
              <Separator />
              <ol className="grid gap-1">
                {trail.map((e, i) => (
                  <li key={`${e.ts}-${i}`} className="flex items-center gap-2 text-[11px]">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        i === 0 ? "bg-primary" : "bg-muted-foreground/40",
                      )}
                    />
                    <span className="text-muted-foreground">{EV_LABEL[e.ev] ?? e.ev}</span>
                    <span className="ml-auto font-mono text-muted-foreground/70">{ago(e.ts)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
