"use client";
/**
 * DeviceMicBridge — puente invisible entre el mic del dispositivo y el
 * micrófono del PC. El OS arranca con el mic APAGADO; al encenderlo
 * (tocando la onda en el AMOLED) con el sandbox activo, abre el
 * reconocimiento de voz del navegador y manda lo oído al agente
 * (simSay). Al silenciar o apagar el sandbox, corta el mic.
 */

import { useEffect, useRef } from "react";
import { simSay } from "@/lib/os/nomikos";
import { getAgentFeed, setAgentFeed } from "@/lib/viewer/agent";
import { useMicMuted } from "@/lib/viewer/view";
import { useSandbox } from "@/lib/viewer/sandbox";

// Web Speech API (Chrome/Edge): STT del navegador — en la placa real es
// whisper.cpp local; aquí usa el micrófono del PC.
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function speechCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

export default function DeviceMicBridge() {
  const sandbox = useSandbox();
  const muted = useMicMuted();
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const pendingRef = useRef(false);
  const wantRef = useRef(false);
  wantRef.current = sandbox && !muted;

  useEffect(() => {
    if (!sandbox || muted) {
      try {
        recRef.current?.stop();
      } catch {
        /* noop */
      }
      recRef.current = null;
      // al silenciar vuelve a reposo (un turno en vuelo mantiene "pensando")
      if (getAgentFeed().status === "listening") {
        setAgentFeed({ status: "idle", heard: null, error: null });
      }
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) {
      console.warn("[mic] este navegador no tiene reconocimiento de voz");
      setAgentFeed({ status: "error", error: "este navegador no tiene reconocimiento de voz" });
      return;
    }
    setAgentFeed({ status: "listening", heard: null, error: null, turnTs: Date.now() });

    let disposed = false;
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "es-ES";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript?.trim() ?? "";
      if (!text || pendingRef.current) return;
      pendingRef.current = true;
      setAgentFeed({ status: "thinking", heard: text, error: null, turnTs: Date.now() });
      void simSay(text)
        .then(() => setAgentFeed({ status: "done" }))
        .catch((err) =>
          setAgentFeed({
            status: "error",
            error: err instanceof Error ? err.message : "error inesperado",
          }),
        )
        .finally(() => {
          pendingRef.current = false;
        });
    };
    rec.onerror = (e) => {
      // not-allowed: sin permiso — se reintenta al re-encender el mic
      if (e.error === "not-allowed") {
        setAgentFeed({ status: "error", error: "permiso de micrófono denegado" });
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("[mic]:", e.error ?? "error");
      }
    };
    // walkie-talkie: mientras siga encendido, reabre tras cada turno
    rec.onend = () => {
      if (disposed || !wantRef.current) return;
      // tras listo/error vuelve a "escuchando"; un turno en vuelo
      // mantiene "pensando" hasta que el agente responde
      const st = getAgentFeed().status;
      if (st === "done" || st === "error") setAgentFeed({ status: "listening" });
      try {
        rec.start();
      } catch {
        /* el próximo encendido lo reabre */
      }
    };
    try {
      rec.start();
    } catch {
      /* sin mic en este intento */
    }
    return () => {
      disposed = true;
      try {
        rec.stop();
      } catch {
        /* noop */
      }
      if (recRef.current === rec) recRef.current = null;
    };
  }, [sandbox, muted]);

  return null;
}
