"use client";
import { useTranslations } from "next-intl";
/**
 * SimulatorBar — la barra del simulador NomikOS: detecta ejecución
 * LOCAL (host/dirección del navegador + despliegue docker del compose)
 * y expone las acciones del OS simulado: AGREGAR al agente (claim),
 * peaje x402, micrófono para hablar con el agente y reconstruir.
 */

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Crosshair,
  LoaderCircle,
  Mic,
  Monitor,
  Plus,
  RefreshCw,
  Send,
  Square,
  Unlock,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { useNomikOS, simClaim, simX402, simRebuild, simSay, simPress } from "@/lib/os/nomikos";
import { setBankSendTo, setViewLocked, useBankSendTo, useMicMuted, useViewLocked } from "@/lib/viewer/view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function isLocal(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h.endsWith(".local");
}

// Web Speech API (Chrome/Edge): STT del navegador — en la placa real es
// whisper.cpp local; aquí simula el micrófono del dispositivo.
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function speechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

export default function SimulatorBar() {
  const t = useTranslations("sim");
  const os = useNomikOS();
  const [busy, setBusy] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [tts, setTts] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const lastSpokenTs = useRef<number>(0);
  const deployment = process.env.NEXT_PUBLIC_DEPLOYMENT;
  // Hidratación: window solo existe en el cliente — si se lee durante el
  // render, el HTML del servidor difiere (React #418). Se resuelve en
  // un efecto para que el primer render cliente == servidor.
  const [local, setLocal] = useState(false);
  const [srAvailable, setSrAvailable] = useState(false);
  useEffect(() => {
    setLocal(isLocal());
    setSrAvailable(speechRecognition() !== null);
  }, []);
  const SR = srAvailable;

  // Vista 3D fija: de frente y sin rotación para tocar con precisión.
  const viewLocked = useViewLocked();
  // Mute desde el botón de voz del OS: no abre el mic y corta el activo.
  const micMuted = useMicMuted();
  const bankSendTo = useBankSendTo();
  useEffect(() => {
    if (micMuted && recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* noop */
      }
      setListening(false);
    }
  }, [micMuted]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      // los errores del api se MUESTRAN (antes morían en la consola:
      // un 409 de claim expirado parecía un botón roto)
      setActionError(e instanceof Error ? e.message : t("unexpected"));
    } finally {
      setBusy(null);
    }
  };

  // TTS: leer en voz alta la respuesta del agente (en la placa real es
  // piper local; aquí speechSynthesis del navegador).
  useEffect(() => {
    if (!tts || !os?.last_reply) return;
    if (os.last_reply.ts <= lastSpokenTs.current) return;
    lastSpokenTs.current = os.last_reply.ts;
    try {
      const u = new SpeechSynthesisUtterance(os.last_reply.reply.slice(0, 280));
      u.lang = "es-ES";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* sin TTS en este navegador */
    }
  }, [os?.last_reply, tts]);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        /* noop */
      }
    };
  }, []);

  const toggleMic = () => {
    const Ctor = speechRecognition();
    if (!Ctor) {
      setMicError(t("noSTT"));
      return;
    }
    if (micMuted && !listening) {
      setMicError(t("micMuted"));
      return;
    }
    if (listening) {
      try {
        recRef.current?.stop();
      } catch {
        /* noop */
      }
      return;
    }
    setMicError(null);
    setHeard(null);
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "es-ES";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript?.trim() ?? "";
      if (text) {
        setHeard(text);
        void run("say", () => simSay(text));
      }
    };
    rec.onerror = (e) => {
      setMicError(
        e.error === "not-allowed"
          ? t("micDenied")
          : `mic: ${e.error ?? "error"}`,
      );
      setListening(false);
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setMicError(t("micFail"));
    }
  };

  const sendTyped = () => {
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    setHeard(text);
    void run("say", () => simSay(text));
  };

  return (
    <Card aria-label={t("title")} className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Monitor className="size-4 text-primary" />{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 px-4">
        {/* Detección de ejecución local (host + compose) */}
        {local && (
          <p
            className="flex items-center gap-1.5 text-xs text-emerald-400"
            title="El ecosistema corre en esta máquina"
          >
            <span className="size-1.5 rounded-full bg-emerald-400" />
            {t("ecoLocal")}{deployment === "docker" ? t("ecoDocker") : ""} {t("ecoDetected")}
          </p>
        )}

        <p className="font-mono text-xs text-muted-foreground">
          {os === null
            ? "sincronizando…"
            : t("stageLine", { stage: os.stage, boots: os.boot_count, taps: os.taps }) + (os.stage === "online" && os.locked ? " 🔒" : "")}
        </p>

        {os?.stage === "online" && (
          <p className="font-mono text-xs text-muted-foreground">
            {(() => {
              const act = os.llm?.providers?.find((p) => p.is_active);
              return act
                ? `🧠 ${act.provider} · ${(act.default_model ?? "—").split("/").pop()}`
                : t("noProvider");
            })()}
          </p>
        )}

        {actionError && (
          <p className="text-xs text-red-400" role="alert">
            ⚠️ {actionError}
          </p>
        )}

        {os?.stage === "claim" && (
          <>
            <p className="text-[13px]">
              {t("claimOnScreen")}{" "}
              <b className="font-mono tracking-widest text-primary">{os.claim_code}</b>
            </p>
            <Button
              type="button"
              size="sm"
              disabled={busy !== null}
              onClick={() => void run("claim", simClaim)}
            >
              {busy === "claim" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Plus />
              )}
              {busy === "claim" ? t("claiming") : t("addAgent")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("onlineNote")}</p>
          </>
        )}

        {os?.stage === "online" && os.locked !== false && (
          <>
            <p className="text-xs text-muted-foreground">{t("lockedNote")}</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void run("unlock", () => simPress("unlock"))}
            >{t("unlock")}</Button>
          </>
        )}

        {os?.stage === "online" && os.locked === false && (
          <>
            <p className="text-xs text-muted-foreground">{t("touchHint")}</p>
            <Button
              type="button"
              size="sm"
              variant={viewLocked ? "default" : "secondary"}
              onClick={() => setViewLocked(!viewLocked)}
              title={t("camTitle")}
            >
              {viewLocked ? <Unlock /> : <Crosshair />}
              {viewLocked ? t("camRelease") : t("camFront")}
            </Button>
            {/* micrófono: hablar con el agente (voz → turno real del device) */}
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={listening ? "destructive" : "secondary"}
                disabled={busy !== null || !SR}
                onClick={toggleMic}
                title={SR ? t("micTalk") : t("micNoSR")}
                className={cn("flex-1", listening && "listening-pulse")}
              >
                {listening ? <Square /> : <Mic />}
                {listening ? t("micListening") : t("micTalkLower")}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setTts((v) => !v)}
                title={t("ttsTitle")}
                className="size-8 shrink-0"
              >
                {tts ? <Volume2 /> : <VolumeX />}
              </Button>
            </div>
            {(heard || busy === "say") && (
              <p className="text-xs text-muted-foreground">
                {busy === "say" ? t("thinking") : ""}
                {heard ? t("heard", { text: heard }) : ""}
              </p>
            )}
            {micError && <p className="text-xs text-destructive">{micError}</p>}
            {os.screen === "x402" && (
              <div className="grid gap-1">
                <label
                  htmlFor="bank-send-to"
                  className="text-[11px] tracking-wider text-muted-foreground uppercase"
                >{t("bankLabel")}</label>
                <Input
                  id="bank-send-to"
                  type="text"
                  placeholder={t("toPh")}
                  value={bankSendTo}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setBankSendTo(e.target.value.trim())}
                  className="h-8 font-mono text-xs"
                />
              </div>
            )}
            <div className="flex gap-1.5">
              <Input
                type="text"
                placeholder={t("typePh")}
                value={typed}
                disabled={busy !== null}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendTyped();
                }}
                className="h-8 min-w-0 flex-1 text-[13px]"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                disabled={busy !== null || !typed.trim()}
                onClick={sendTyped}
                className="size-8 shrink-0"
              >
                <Send />
              </Button>
            </div>
            {os.last_reply && (
              <p
                className="rounded-r-md border-l-2 border-primary bg-muted/50 p-2 text-xs leading-relaxed"
                title={os.last_reply.reply}
              >
                <Bot className="mr-1 inline size-3.5 text-primary" />
                {os.last_reply.reply.slice(0, 160)}
                {os.last_reply.reply.length > 160 ? "…" : ""}
              </p>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void run("x402", simX402)}
            >
              {busy === "x402" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Zap />
              )}
              {busy === "x402" ? t("paying") : t("payToll")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => {
                if (window.confirm(t("rebuildQ"))) {
                  void run("rebuild", simRebuild);
                }
              }}
              className="text-muted-foreground"
            >
              {busy === "rebuild" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              {busy === "rebuild" ? t("rebuilding") : t("rebuild")}
            </Button>
            {os.last_x402 && (
              <p className="text-xs text-muted-foreground">
                {t("lastToll")} {os.last_x402.access ?? os.last_x402.status}
                {os.last_x402.hint ? ` — ${os.last_x402.hint}` : ""}
              </p>
            )}
          </>
        )}

        {os?.stage === "boot" && (
          <p className="text-xs text-muted-foreground">{t("booting")}</p>
        )}
      </CardContent>
    </Card>
  );
}
