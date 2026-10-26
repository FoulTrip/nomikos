import { NextResponse } from "next/server";
import {
  chatWithProvider,
  resolveFromEnv,
  resolveFromClient,
  AI_PROVIDERS,
} from "@/lib/ai/providers";
import type { ResolvedAIConfig } from "@/lib/ai/providers";
import type { OSMessage, AIMode } from "@/lib/os/types";
import { pushMsg, setAIMode, setTyping, finishChat, trimMsgs, getSnapshot } from "@/lib/os/device-os";

interface ChatBody {
  text: string;
  config?: {
    provider?: "nvidia" | "meta" | "custom";
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  };
}

// Devolvemos {ok:true, reply?, mode, error?}
export async function POST(req: Request) {
  try {
    const body: ChatBody = await req.json();
    const text = (body.text || "").trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: "Texto vacío" }, { status: 400 });
    }

    // decidir modo
    let mode: AIMode = "simulated";
    let cfg: ResolvedAIConfig | null = null;

    // 1) ¿Viene config del cliente (localStorage)?
    if (body.config) {
      cfg = resolveFromClient(body.config);
      if (cfg) mode = cfg.provider;
    }

    // 2) Si no hay config cliente, intentar desde env del servidor
    if (!cfg) {
      // probar nvidia, luego meta
      for (const p of ["nvidia", "meta"] as const) {
        const c = resolveFromEnv(p);
        if (c) { cfg = c; mode = p; break; }
      }
    }

    // 3) Si aun nada, modo simulado
    if (!cfg) mode = "simulated";

    // push usuario inmediatamente (optimista)
    pushMsg("user", text);
    trimMsgs();
    setTyping(true);

    // obtener respuesta
    let reply: string;
    if (mode === "simulated") {
      // generador simple
      const lowered = (text || "").toLowerCase();
      if (/hola|buenos? (días|tardes|noches)/.test(lowered)) {
        reply = "¡Hola! ¿En qué puedo ayudarte con el ESP32-S3?";
      } else if (/quién eres/i.test(lowered)) {
        reply = "Soy Muse, un agente OS minimalista que vive dentro del ESP32-S3-Touch-AMOLED-1.43.";
      } else if (/hora/.test(lowered)) {
        const h = new Date().getHours();
        reply = `Son las ${h > 12 ? h - 12 : h === 0 ? 12 : h} ${h >= 12 ? "PM" : "AM"}.`;
      } else if (/estado|cómo va/.test(lowered)) {
        const snap = await getSnapshot();
        reply = `Estado: ON. Batería ${(Math.random() * 20 + 70) | 0}% · App ${snap.app} · AI ${mode}.`;
      } else if (/gracias/.test(lowered)) {
        reply = "De nada. ¿Necitas otra cosa del dispositivo?";
      } else {
        // fallback aleatorio simulado + hint
        const r =
          ["Entendido. El ESP32-S3 tiene 240 MHz dual-core y 16 MB Flash + 8 MB PSRAM.",
            "La pantalla AMOLED redonda de 1.43\" tiene resolución 466 × 466 px.",
            "El controlador soporta Wi‑Fi 2.4 GHz y BLE 5.",
            "Tiene ranura micro‑SD, SPI, I2C y LED RGB."][Math.floor(Math.random() * 4)];
        reply = `${r} (modo simulado — configura un proveedor de IA para respuestas reales.)`;
      }
    } else if (cfg) {
      // modo real: enviamos el texto del usuario al proveedor
      try {
        reply = await chatWithProvider(cfg, [{ role: "user", content: text }]);
        mode = cfg.provider;
      } catch (e: any) {
        console.error("[chat] provider error:", e.message);
        mode = "simulated";
        reply = "Lo siento, hubo un error al contactar al proveedor de IA. Intenta con otro proveedor o usa modo simulado.";
      }
    } else {
      // no debería ocurrir (mode !== simulated implica cfg), pero por seguridad
      mode = "simulated";
      reply = "Sin configuración de IA disponible. Configura un proveedor en el panel AI.";
    }

    // push agente + apagar typing
    finishChat(reply, mode as AIMode);
    trimMsgs();

    return NextResponse.json({
      ok: true,
      reply,
      mode,
    });
  } catch (e: any) {
    console.error("[chat] route error:", e);
    return NextResponse.json({ ok: false, error: e.message || "Error interno" }, { status: 500 });
  }
}