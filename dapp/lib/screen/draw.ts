/**
 * draw.ts — la pantalla AMOLED 466×466 del simulador: lo que el OS
 * NomikOS muestra EN LA PLACA. Espeja `firmware/agentd-esp32/display.rs`
 * (claim_banner / status): mismos textos, misma jerarquía, mismos
 * colores — aquí con antialias de canvas.
 */
import type { NomikOSState } from "@/lib/os/nomikos";

export const SCREEN_PX = 466;
const R = SCREEN_PX / 2;
const MARGIN = 20;

// paleta del firmware (display.rs): oro #FFC000 · blanco · gris · verde
const GOLD = "#ffc000";
const WHITE = "#ffffff";
const GRAY = "#9a9a9a";
const GREEN = "#00c000";

// dibuja texto envuelto por palabras, centrado, máximo maxLines líneas
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontPx: number,
  lineH: number,
  maxLines: number,
) {
  ctx.font = `${fontPx}px monospace`;
  const words = text.replace(/\s+/g, " ").split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > 300 && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
}

export function drawScreen(ctx: CanvasRenderingContext2D, sim: NomikOSState | null) {
  ctx.clearRect(0, 0, SCREEN_PX, SCREEN_PX);
  ctx.save();
  ctx.beginPath();
  ctx.arc(R, R, R - MARGIN, 0, Math.PI * 2);
  ctx.clip();

  // fondo negro (AMOLED real: píxeles apagados)
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, SCREEN_PX, SCREEN_PX);

  if (!sim) {
    ctx.textAlign = "center";
    ctx.fillStyle = GRAY;
    ctx.font = "bold 30px monospace";
    ctx.fillText("NOMIKOS", R, R - 6);
    ctx.font = "16px monospace";
    ctx.fillText("conectando con el worker…", R, R + 24);
    ctx.restore();
    return;
  }

  // ═══ stage boot: el agentd simulado se presenta ═══
  if (sim.stage === "boot") {
    ctx.textAlign = "center";
    ctx.fillStyle = GOLD;
    ctx.font = "bold 34px monospace";
    ctx.fillText("NOMIKOS", R, R - 30);
    ctx.fillStyle = GRAY;
    ctx.font = "17px monospace";
    ctx.fillText(sim.board, R, R + 2);
    ctx.fillStyle = WHITE;
    ctx.font = "15px monospace";
    ctx.fillText(`boot #${sim.boot_count} — presentando al worker…`, R, R + 30);
    ctx.restore();
    return;
  }

  // ═══ stage claim: el banner de emparejado (claim_banner de display.rs) ═══
  if (sim.stage === "claim") {
    ctx.textAlign = "center";
    ctx.fillStyle = GOLD;
    ctx.font = "bold 34px monospace";
    ctx.fillText("NOMIKOS", R, R - 120);
    ctx.font = "20px monospace";
    ctx.fillText(sim.name, R, R - 90);
    // el código, GRANDE y centrado (12px/char en la placa; aquí 54px)
    ctx.fillStyle = WHITE;
    ctx.font = "bold 54px monospace";
    ctx.fillText(sim.claim_code ?? "????????", R, R + 10);
    ctx.fillStyle = GRAY;
    ctx.font = "17px monospace";
    ctx.fillText("empareja en el panel", R, R + 50);
    ctx.fillText("(Flota → Emparejar)", R, R + 74);
    // feedback: los toques en claim también cuentan (el código no cambia)
    ctx.font = "13px monospace";
    ctx.fillText(`toques: ${sim.taps} · pulsa AGREGAR`, R, R + 100);
    ctx.restore();
    return;
  }

  // ═══ stage online: el estado operativo (status de display.rs) ═══
  // "status" es la pantalla legacy (estados guardados viejos) → home.
  const screen = sim.screen === "status" ? "home" : sim.screen;

  ctx.textAlign = "center";
  ctx.fillStyle = WHITE;
  ctx.font = "bold 26px monospace";
  ctx.fillText("ONLINE", R, R - 110);
  ctx.fillStyle = GOLD;
  ctx.font = "17px monospace";
  ctx.fillText(sim.name, R, R - 84);

  if (screen === "home") {
    // pantalla PRINCIPAL: estado + dapps + última conversación con el agente
    ctx.fillStyle = GREEN;
    ctx.font = "bold 20px monospace";
    ctx.fillText("operativo", R, R - 44);
    ctx.fillStyle = WHITE;
    ctx.font = "16px monospace";
    const appLine =
      sim.apps.length === 0
        ? "dapps: — (instala con nomikos apps)"
        : `dapps: ${sim.apps
            .slice(0, 2)
            .map((a) => a.slug)
            .join(", ")}${sim.apps.length > 2 ? ` +${sim.apps.length - 2}` : ""}`;
    ctx.fillText(appLine.slice(0, 34), R, R - 16);
    if (sim.last_reply) {
      // última conversación: lo que dijiste → lo que respondió el agente
      ctx.fillStyle = GRAY;
      ctx.font = "14px monospace";
      ctx.fillText(`tú: ${sim.last_reply.text}`.slice(0, 36), R, R + 12);
      ctx.fillStyle = WHITE;
      wrapLines(ctx, sim.last_reply.reply, R, R + 36, 15, 20, 3);
    } else {
      ctx.fillStyle = GRAY;
      ctx.font = "14px monospace";
      ctx.fillText("habla desde el panel", R, R + 16);
    }
    ctx.fillStyle = GRAY;
    ctx.font = "14px monospace";
    ctx.fillText("toca: apps · peaje · ajustes", R, R + 96);
  } else if (screen === "apps") {
    // pantalla apps: las dapps instaladas del agente (tienda)
    ctx.fillStyle = GOLD;
    ctx.font = "bold 20px monospace";
    ctx.fillText(`dapps: ${sim.apps.length}`, R, R - 40);
    ctx.fillStyle = WHITE;
    ctx.font = "18px monospace";
    if (sim.apps.length === 0) {
      ctx.fillText("(sin dapps instaladas)", R, R - 8);
    } else {
      sim.apps.slice(0, 4).forEach((a, i) => {
        ctx.fillText(a.slug, R, R - 8 + i * 28);
      });
    }
    ctx.fillStyle = GRAY;
    ctx.font = "14px monospace";
    ctx.fillText("toca: más pantallas", R, R + 90);
  } else if (screen === "x402" && sim.last_x402) {
    // pantalla peaje: el último recurso protegido cobrado
    ctx.fillStyle = GOLD;
    ctx.font = "bold 20px monospace";
    ctx.fillText("peaje x402", R, R - 40);
    ctx.fillStyle = WHITE;
    ctx.font = "15px monospace";
    const x = sim.last_x402;
    ctx.fillText(`${x.resource}`, R, R - 12);
    ctx.fillStyle = x.status === "settled" ? GREEN : GOLD;
    ctx.fillText(`${x.status} · ${x.access ?? ""}`.slice(0, 30), R, R + 14);
    if (x.lamports) {
      ctx.fillStyle = GRAY;
      ctx.font = "13px monospace";
      ctx.fillText(`${x.lamports} lamports`, R, R + 38);
    }
    ctx.fillStyle = GRAY;
    ctx.font = "14px monospace";
    ctx.fillText("toca: más pantallas", R, R + 90);
  } else if (screen === "x402" && !sim.last_x402) {
    // pantalla peaje sin peajes aún: invita a cobrar el primero
    ctx.fillStyle = GOLD;
    ctx.font = "bold 20px monospace";
    ctx.fillText("peaje x402", R, R - 40);
    ctx.fillStyle = GRAY;
    ctx.font = "15px monospace";
    ctx.fillText("sin peajes todavía", R, R - 8);
    ctx.fillText("cóbralo desde el panel", R, R + 16);
    ctx.font = "14px monospace";
    ctx.fillText("toca: más pantallas", R, R + 90);
  } else if (screen === "settings") {
    // pantalla ajustes: identidad y progreso del OS simulado
    ctx.fillStyle = GOLD;
    ctx.font = "bold 20px monospace";
    ctx.fillText("ajustes", R, R - 44);
    ctx.fillStyle = WHITE;
    ctx.font = "14px monospace";
    ctx.fillText(sim.board, R, R - 16);
    ctx.fillText(`device: ${(sim.device_id ?? "—").slice(0, 16)}`, R, R + 8);
    ctx.fillStyle = GRAY;
    ctx.fillText(`boots: ${sim.boot_count} · toques: ${sim.taps}`, R, R + 32);
    ctx.fillText(`eventos: ${sim.events.length} · dapps: ${sim.apps.length}`, R, R + 54);
    ctx.font = "14px monospace";
    ctx.fillText("toca: inicio", R, R + 90);
  } else {
    // pantalla status legacy (estados guardados viejos) → igual que home
    ctx.fillStyle = GREEN;
    ctx.font = "bold 20px monospace";
    ctx.fillText("operativo", R, R - 40);
    ctx.fillStyle = GRAY;
    ctx.font = "15px monospace";
    ctx.fillText(`boots: ${sim.boot_count} · toques: ${sim.taps}`, R, R - 12);
    ctx.fillText(`device: ${(sim.device_id ?? "—").slice(0, 14)}…`, R, R + 12);
    ctx.fillStyle = GRAY;
    ctx.font = "14px monospace";
    ctx.fillText("toca: más pantallas", R, R + 90);
  }

  ctx.restore();
}
