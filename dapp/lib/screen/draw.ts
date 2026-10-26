/**
 * draw.ts — la pantalla AMOLED 466×466 del simulador: lo que el OS
 * NomikOS muestra EN LA PLACA.
 *
 * Boot/claim espejan `firmware/agentd-esp32/display.rs` (mismos textos
 * y colores). El OS online (bloqueo, inicio, dapps, ajustes) es la UI
 * completa de producto: el firmware la implementará por fases (hoy solo
 * trae claim_banner/status por RAM); la geometría vive en layout.ts para
 * que dibujo y táctil coincidan al píxel.
 */
import type { NomikOSState } from "@/lib/os/nomikos";
import {
  C,
  GRID_TOP,
  TILE,
  TILE_COLS,
  TILE_GAP,
  badgeLetters,
  brandColor,
  homeTiles,
  type HomeTile,
} from "@/lib/screen/layout";

export const SCREEN_PX = 466;
const R = SCREEN_PX / 2;
const MARGIN = 8; // clip casi al borde: contenido hasta radio 225

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

export function drawScreen(
  ctx: CanvasRenderingContext2D,
  sim: NomikOSState | null,
  elapsedMs: number = Number.POSITIVE_INFINITY,
) {
  ctx.clearRect(0, 0, SCREEN_PX, SCREEN_PX);
  ctx.save();
  ctx.beginPath();
  ctx.arc(R, R, R - MARGIN, 0, Math.PI * 2);
  ctx.clip();

  // fondo negro (AMOLED real: píxeles apagados)
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, SCREEN_PX, SCREEN_PX);

  if (!sim) {
    // conectando: puntos animados + arco barriendo el borde
    const dots = ".".repeat(1 + (Math.floor(elapsedMs / 400) % 3));
    ctx.textAlign = "center";
    ctx.fillStyle = GRAY;
    ctx.font = "bold 30px monospace";
    ctx.fillText("NOMIKOS", R, R - 6);
    ctx.font = "16px monospace";
    ctx.fillText(`conectando con el worker${dots}`, R, R + 24);
    if (Number.isFinite(elapsedMs)) {
      const a0 = -Math.PI / 2 + (elapsedMs / 1000) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(R, R, R - MARGIN - 6, a0, a0 + Math.PI / 2);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // ═══ stage boot: arranque animado (logo + anillo + barra + log) ═══
  if (sim.stage === "boot") {
    const progress = Math.min(1, elapsedMs / 2600);
    const done = progress >= 1;
    ctx.textAlign = "center";

    // anillo de progreso en el borde (pista tenue + arco oro)
    ctx.beginPath();
    ctx.arc(R, R, R - MARGIN - 6, 0, Math.PI * 2);
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(R, R, R - MARGIN - 6, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = GOLD;
    ctx.font = "bold 40px monospace";
    ctx.fillText("NOMIKOS", R, R - 78);
    ctx.fillStyle = GRAY;
    ctx.font = "14px monospace";
    ctx.fillText("nomikos v0.1.0", R, R - 52);

    // barra de progreso
    const bw = 260;
    const bx = R - bw / 2;
    const by = R - 18;
    ctx.fillStyle = "#1c1c1c";
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 10, 5);
    ctx.fill();
    if (progress > 0) {
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.roundRect(bx, by, Math.max(10, bw * progress), 10, 5);
      ctx.fill();
    }

    // log de arranque por etapas
    const steps: Array<[number, string]> = [
      [0, "kernel 6.6-rpi"],
      [650, "agentd"],
      [1300, "red"],
      [1950, "worker"],
    ];
    ctx.font = "14px monospace";
    steps.forEach(([t, name], i) => {
      const y = R + 22 + i * 20;
      if (elapsedMs < t) {
        ctx.fillStyle = "#3a3a3a";
        ctx.textAlign = "center";
        ctx.fillText("···", R, y);
      } else {
        ctx.textAlign = "left";
        ctx.fillStyle = WHITE;
        ctx.fillText(name, R - 80, y);
        if (elapsedMs > t + 350) {
          ctx.fillStyle = GREEN;
          ctx.textAlign = "right";
          ctx.fillText("ok", R + 80, y);
        }
      }
    });
    ctx.textAlign = "center";

    // spinner mientras carga; "listo" al completar
    if (!done && Number.isFinite(elapsedMs)) {
      const a = (elapsedMs / 240) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(R, R + 132, 9, a, a + Math.PI * 1.4);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.fillStyle = GREEN;
      ctx.font = "bold 16px monospace";
      ctx.fillText("listo ✓", R, R + 138);
    }
    ctx.fillStyle = GRAY;
    ctx.font = "12px monospace";
    ctx.fillText(`boot #${sim.boot_count}`, R, R + 164);
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

  // ═══ stage online: el OS completo (bloqueo + inicio + apps + ajustes) ═══
  // "status" es la pantalla legacy (estados guardados viejos) → home.
  const screen = sim.screen === "status" ? "home" : sim.screen;

  // ── bloqueo: reloj grande + fecha + desbloqueo por toque ──
  // locked ausente (estados viejos) = bloqueado, igual que en el api.
  if (sim.locked !== false) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    drawStatusBar(ctx, true);
    ctx.textAlign = "center";
    ctx.fillStyle = WHITE;
    ctx.font = "bold 92px monospace";
    ctx.fillText(`${hh}:${mm}`, R, R - 20);
    ctx.fillStyle = GRAY;
    ctx.font = "17px monospace";
    ctx.fillText(dateLine(now), R, R + 14);
    // hint pulsante (fijo si el dibujo es estático)
    const pulse = Number.isFinite(elapsedMs)
      ? 0.55 + 0.45 * Math.sin(elapsedMs / 380)
      : 0.9;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = GOLD;
    ctx.font = "16px monospace";
    ctx.fillText("🔒 toca para desbloquear", R, R + 120);
    ctx.globalAlpha = 1;
    ctx.fillStyle = GRAY;
    ctx.font = "13px monospace";
    ctx.fillText(sim.name, R, R + 148);
    ctx.restore();
    return;
  }

  if (screen === "home") {
    // ── inicio: barra + rejilla [apps · ajustes · peaje] + conversación ──
    drawStatusBar(ctx, false);
    ctx.textAlign = "center";
    ctx.fillStyle = GOLD;
    ctx.font = "bold 19px monospace";
    ctx.fillText("NOMIKOS", R, 116);
    for (const t of homeTiles(sim)) {
      drawTile(ctx, t);
    }
    // última conversación con el agente (o invitación al mic)
    const gridBottom = GRID_TOP + gridRows(sim) * (TILE + TILE_GAP + 26);
    if (sim.last_reply) {
      ctx.fillStyle = GRAY;
      ctx.font = "13px monospace";
      ctx.fillText(`tú: ${sim.last_reply.text}`.slice(0, 38), R, gridBottom + 14);
      ctx.fillStyle = WHITE;
      wrapLines(ctx, `🤖 ${sim.last_reply.reply}`, R, gridBottom + 36, 14, 19, 2);
    } else {
      ctx.fillStyle = GRAY;
      ctx.font = "14px monospace";
      ctx.fillText("🎙 habla desde el panel", R, gridBottom + 22);
    }
  } else if (screen === "apps") {
    // ── dapps: lista de instaladas con logo + herramientas ──
    drawStatusBar(ctx, false);
    drawHeader(ctx, "‹ dapps");
    if (sim.apps.length === 0) {
      ctx.textAlign = "center";
      ctx.fillStyle = GRAY;
      ctx.font = "15px monospace";
      ctx.fillText("(sin dapps instaladas)", R, R + 10);
      ctx.fillText("nomikos apps add <slug>", R, R + 34);
    } else {
      sim.apps.slice(0, 4).forEach((a, i) => {
        const y = 148 + i * 66;
        drawBadge(ctx, C - 118, y + 29, 22, a.slug);
        ctx.textAlign = "left";
        ctx.fillStyle = WHITE;
        ctx.font = "bold 17px monospace";
        ctx.fillText(a.name.slice(0, 18), C - 88, y + 22);
        ctx.fillStyle = GRAY;
        ctx.font = "13px monospace";
        ctx.fillText(`${a.tools_count ?? 0} tools · ${a.status}`, C - 88, y + 42);
      });
    }
  } else if (screen === "appdetail") {
    // ── detalle de dapp: logo grande + ficha ──
    const app = sim.apps.find((a) => a.slug === sim.detail_app) ?? sim.apps[0];
    if (!app) {
      drawStatusBar(ctx, false);
      drawHeader(ctx, "‹ dapp");
      ctx.textAlign = "center";
      ctx.fillStyle = GRAY;
      ctx.font = "15px monospace";
      ctx.fillText("(dapp no instalada)", R, R + 10);
    } else {
      drawStatusBar(ctx, false);
      drawHeader(ctx, `‹ ${app.slug.slice(0, 16)}`);
      drawBadge(ctx, C, R - 28, 34, app.slug);
      ctx.textAlign = "center";
      ctx.fillStyle = WHITE;
      ctx.font = "bold 19px monospace";
      ctx.fillText(app.name.slice(0, 20), R, R + 34);
      ctx.fillStyle = GREEN;
      ctx.font = "14px monospace";
      ctx.fillText(`● ${app.status}`, R, R + 58);
      ctx.fillStyle = GRAY;
      ctx.fillText(`${app.tools_count ?? 0} tools para el agente`, R, R + 80);
      ctx.fillText("cada uso paga su peaje x402", R, R + 100);
    }
  } else if (screen === "x402") {
    // ── peaje: wallet dPaaS del agente + balance + último cobro ──
    drawStatusBar(ctx, false);
    drawHeader(ctx, "‹ peaje");
    const w = sim.agent_wallet;
    ctx.textAlign = "center";
    if (w?.wallet_pubkey) {
      const sol = w.balance_lamports == null
        ? "…"
        : (w.balance_lamports / 1_000_000_000).toFixed(4);
      ctx.fillStyle = WHITE;
      ctx.font = "bold 26px monospace";
      ctx.fillText(`${sol} SOL`, R, R - 30);
      ctx.fillStyle = GRAY;
      ctx.font = "13px monospace";
      const pk = w.wallet_pubkey;
      ctx.fillText(`${pk.slice(0, 6)}…${pk.slice(-5)} · ${w.network ?? "?"}`, R, R - 6);
      ctx.font = "12px monospace";
      ctx.fillText("recarga con 💧 Faucet del panel", R, R + 16);
    } else {
      ctx.fillStyle = GRAY;
      ctx.font = "14px monospace";
      ctx.fillText("sin wallet dPaaS", R, R - 20);
      ctx.fillText("configúrala en Wallet·Red", R, R + 2);
    }
    if (sim.last_x402) {
      const x = sim.last_x402;
      const stateLabel =
        x.status === "settled" ? "pagado ✓" : x.status === "verifying" ? "confirmando…" : "no se pudo pagar";
      ctx.fillStyle = x.status === "settled" ? GREEN : GOLD;
      ctx.font = "bold 15px monospace";
      ctx.fillText(stateLabel, R, R + 46);
      ctx.fillStyle = GRAY;
      ctx.font = "12px monospace";
      if (x.access) ctx.fillText(`${x.access}`.slice(0, 38), R, R + 66);
      if (x.hint) ctx.fillText(`${x.hint}`.slice(0, 38), R, R + 84);
      else if (x.lamports) ctx.fillText(`${x.lamports} lamports`, R, R + 84);
    } else {
      ctx.fillStyle = GRAY;
      ctx.font = "13px monospace";
      ctx.fillText("sin peajes todavía", R, R + 50);
    }
  } else if (screen === "settings") {
    // ── ajustes: filas navegables (proveedor/modelo ciclan; las keys
    // solo se cargan en el panel — el device solo elige) ──
    drawStatusBar(ctx, false);
    drawHeader(ctx, "‹ ajustes");
    const llmProviders = sim.llm?.providers ?? [];
    const activeRow = llmProviders.find((p) => p.is_active) ?? null;
    const withKey = llmProviders.filter((p) => p.has_key).length;
    const rows: Array<[string, string, boolean]> = [
      ["Wi-Fi", "NomikOS-Sim ✓", false],
      ["Dispositivo", (sim.device_id ?? "—").slice(0, 12), false],
      ["Proveedor ▸", activeRow?.provider ?? (withKey > 0 ? "elegir" : "sin keys"), true],
      ["Modelo ▸", (activeRow?.default_model ?? "—").split("/").pop() ?? "—", true],
      ["🔒 Bloquear", "", true],
    ];
    rows.forEach(([label, value, accent], i) => {
      const y = 140 + i * 44 + 26;
      ctx.textAlign = "left";
      ctx.fillStyle = accent ? GOLD : WHITE;
      ctx.font = `${accent ? "bold " : ""}15px monospace`;
      ctx.fillText(label, C - 138, y);
      if (value) {
        ctx.textAlign = "right";
        ctx.fillStyle = GRAY;
        ctx.font = "12px monospace";
        ctx.fillText(value.slice(0, 22), C + 138, y);
      }
      // separador
      ctx.fillStyle = "#222222";
      ctx.fillRect(C - 138, y + 10, 276, 1);
    });
  } else if (screen === "providers") {
    // ── lista de proveedores CON key (tocar = activar) ──
    drawStatusBar(ctx, false);
    drawHeader(ctx, "‹ proveedor");
    const list = (sim.llm?.providers ?? []).filter((p) => p.has_key).slice(0, 4);
    ctx.textAlign = "center";
    if (list.length === 0) {
      ctx.fillStyle = GRAY;
      ctx.font = "14px monospace";
      ctx.fillText("sin keys en tu cuenta", R, R + 4);
      ctx.fillText("cárgalas en Modelos", R, R + 28);
    } else {
      list.forEach((p, i) => {
        const y = 148 + i * 58;
        const isActive = p.provider === sim.llm?.active_provider;
        ctx.beginPath();
        ctx.arc(C - 118, y + 26, 16, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? GOLD : "#101010";
        ctx.fill();
        if (!isActive) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = brandColor(p.provider);
          ctx.stroke();
        }
        ctx.fillStyle = isActive ? "#000000" : brandColor(p.provider);
        ctx.font = "bold 14px monospace";
        ctx.fillText(badgeLetters(p.provider), C - 118, y + 31);
        ctx.textAlign = "left";
        ctx.fillStyle = WHITE;
        ctx.font = "bold 16px monospace";
        ctx.fillText(p.provider.slice(0, 16), C - 92, y + 22);
        ctx.fillStyle = GRAY;
        ctx.font = "12px monospace";
        ctx.fillText(`${(p.models ?? []).length} modelos · key ●`, C - 92, y + 42);
        ctx.textAlign = "center";
      });
    }
  } else if (screen === "models") {
    // ── lista de modelos del proveedor ACTIVO (tocar = usar) ──
    drawStatusBar(ctx, false);
    drawHeader(ctx, "‹ modelo");
    const activeRow = (sim.llm?.providers ?? []).find((p) => p.is_active) ?? null;
    const models = (activeRow?.models ?? []).slice(0, 4);
    ctx.textAlign = "center";
    if (!activeRow) {
      ctx.fillStyle = GRAY;
      ctx.font = "14px monospace";
      ctx.fillText("elige un proveedor primero", R, R + 10);
    } else if (models.length === 0) {
      ctx.fillStyle = GRAY;
      ctx.font = "14px monospace";
      ctx.fillText("sin modelos listados", R, R + 10);
    } else {
      models.forEach((m, i) => {
        const y = 148 + i * 58;
        const isCurrent = m === activeRow.default_model;
        ctx.beginPath();
        ctx.arc(C - 118, y + 26, 10, 0, Math.PI * 2);
        ctx.fillStyle = isCurrent ? GREEN : "#101010";
        ctx.fill();
        if (!isCurrent) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#3a3a3a";
          ctx.stroke();
        }
        ctx.textAlign = "left";
        ctx.fillStyle = isCurrent ? WHITE : GRAY;
        ctx.font = `${isCurrent ? "bold " : ""}14px monospace`;
        const short = m.includes("/") ? m.split("/").pop()! : m;
        ctx.fillText(short.slice(0, 24), C - 92, y + 24);
        ctx.fillStyle = "#555555";
        ctx.font = "11px monospace";
        ctx.fillText(m.slice(0, 30), C - 92, y + 42);
        ctx.textAlign = "center";
      });
    }
  } else {
    // pantalla desconocida → inicio (nunca pantalla vacía)
    drawStatusBar(ctx, false);
    ctx.textAlign = "center";
    ctx.fillStyle = GREEN;
    ctx.font = "bold 20px monospace";
    ctx.fillText("operativo", R, R - 40);
  }

  ctx.restore();
}

// ── piezas reutilizables de la UI ────────────────────────────────────

/** Barra de estado: hora izq + isla central + wifi/batería der (y≈70). */
function drawStatusBar(ctx: CanvasRenderingContext2D, locked: boolean) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  ctx.fillStyle = WHITE;
  ctx.font = "15px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`${hh}:${mm}`, 106, 71);
  // wifi: 3 arcos + punto (dibujado a mano: sin depender de glifos)
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 2;
  for (const r of [5, 9, 13]) {
    ctx.beginPath();
    ctx.arc(318, 70, r, -Math.PI * 0.78, -Math.PI * 0.22);
    ctx.stroke();
  }
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.arc(318, 70, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // batería: marco + carga + polo
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(338, 63, 24, 13);
  ctx.fillStyle = GREEN;
  ctx.fillRect(340, 65, 16, 9);
  ctx.fillStyle = WHITE;
  ctx.fillRect(363, 66, 3, 7);
  ctx.textAlign = "center";
  // isla flotante central: estado vivo del OS
  const w = 120;
  const h = 30;
  const x = C - w / 2;
  const y = 52;
  ctx.fillStyle = "#0d0d0d";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 15);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#2a2a2a";
  ctx.stroke();
  if (locked) {
    ctx.fillStyle = GOLD;
    ctx.font = "16px monospace";
    ctx.fillText("🔒", C, y + 21);
  } else {
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.arc(C - 30, y + 15, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.font = "13px monospace";
    ctx.fillText("online", C + 8, y + 20);
  }
}

/** Cabecera de subpantalla con retroceso (zona HEADER_ZONE). */
function drawHeader(ctx: CanvasRenderingContext2D, title: string) {
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.font = "bold 20px monospace";
  ctx.fillText(title, C, 114);
}

/** Badge de dapp: círculo de color de marca + iniciales. */
function drawBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  slug: string,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#101010";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = brandColor(slug);
  ctx.stroke();
  ctx.fillStyle = brandColor(slug);
  ctx.font = `bold ${Math.round(r * 0.9)}px monospace`;
  ctx.textAlign = "center";
  ctx.fillText(badgeLetters(slug), x, y + Math.round(r * 0.32));
}

/** Cuántas filas ocupa la rejilla de inicio (para colocar lo de abajo). */
function gridRows(sim: NomikOSState): number {
  return Math.max(1, Math.ceil(homeTiles(sim).length / TILE_COLS));
}

/** Tile de la rejilla de inicio: icono + etiqueta. */
function drawTile(ctx: CanvasRenderingContext2D, t: HomeTile) {
  const { x, y } = t.rect;
  // caja
  ctx.fillStyle = "#141414";
  ctx.beginPath();
  ctx.roundRect(x, y, TILE, TILE, 18);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#2e2e2e";
  ctx.stroke();
  // icono
  ctx.textAlign = "center";
  if (t.kind === "drawer") {
    // cajón de apps: rejilla 2×2
    ctx.fillStyle = WHITE;
    const gx = x + TILE / 2 - 17;
    const gy = y + TILE / 2 - 17;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        ctx.beginPath();
        ctx.roundRect(gx + c * 19, gy + r * 19, 15, 15, 4);
        ctx.fill();
      }
    }
  } else if (t.kind === "settings") {
    ctx.fillStyle = GRAY;
    ctx.font = "40px monospace";
    ctx.fillText("⚙", x + TILE / 2, y + TILE / 2 + 14);
  } else {
    ctx.fillStyle = GOLD;
    ctx.font = "40px monospace";
    ctx.fillText("⚡", x + TILE / 2, y + TILE / 2 + 14);
  }
  // etiqueta (voz: el nombre + nº de dapp)
  ctx.fillStyle = GRAY;
  ctx.font = "13px monospace";
  ctx.fillText(t.label.slice(0, 12), x + TILE / 2, y + TILE + 18);
}

/** Fecha corta en español para el bloqueo. */
function dateLine(now: Date): string {
  const days = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const months = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  return `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`;
}
