"use client";
import { useLocale, useTranslations } from "next-intl";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { simTap, simPress, useNomikOS, type NomikOSState, type SimChatArtifact } from "@/lib/os/nomikos";
import { useAgentFeed, type AgentFeed } from "@/lib/viewer/agent";
import {
  chatDrawerScrollMax,
  chatScrollMax,
  clampChatDrawerScroll,
  clampChatScroll,
  clampScroll,
  hitOsUi,
  initOsUi,
  renderOsUi,
  scrollTotal,
  type BancoView,
  type ListScroll,
  type OsChatView,
  type OsTheme,
  type OsUiState,
  type OsUiView,
} from "@/lib/screen/osui";
import {
  setDeviceChatCompose,
  setDeviceChatDraft,
  setDeviceChatDrawer,
  setDeviceChatDrawerAnim,
  setDeviceChatDrawerScroll,
  setDeviceChatFull,
  setMicMuted,
  setOverScreen,
  useBankSendTo,
  useDeviceChatCompose,
  useDeviceChatDraft,
  useDeviceChatDrawer,
  useDeviceChatDrawerAnim,
  useDeviceChatDrawerScroll,
  useMicMuted,
} from "@/lib/viewer/view";

const THEME_KEY = "nomikos-os-theme";

function loadTheme(): OsTheme {
  try {
    return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

const TEX_SIZE = 466; // px (AMOLED 466×466)
const SHADE_H = 466; // recorrido del shade (igual que el Rust)
const CHAT_EDGE_OPEN_PX = 180;
const CHAT_EDGE_SNAP_PCT = 38;

// Colocación de la pantalla sobre el modelo (unidades del GLB, en mm).
const SCREEN_Y = 3;
const SCREEN_RADIUS = 21.0;

function roundedBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke?: string,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawWrappedCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
  maxLines: number,
): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > width) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines += 1;
      if (lines >= maxLines) return y + lines * lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line && lines < maxLines) {
    ctx.fillText(line, x, y + lines * lineHeight);
    lines += 1;
  }
  return y + lines * lineHeight;
}

function drawDeviceArtifact(
  ctx: CanvasRenderingContext2D,
  artifact: SimChatArtifact,
  requestedPage: number,
  cache: Map<string, HTMLImageElement>,
  locale: string,
) {
  const items = artifact.items ?? [];
  const page = Math.max(0, Math.min(items.length - 1, requestedPage));
  const item = items[page];
  const bg = "#ffffff";
  const ink = "#171717";
  const muted = "#737373";
  const line = "#e8e8e8";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  ctx.fillStyle = ink;
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(artifact.title.toLocaleUpperCase(locale), 82, 54);
  ctx.fillStyle = muted;
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(artifact.app === "payload-cms" ? "Payload CMS" : artifact.app, 338, 54);
  ctx.strokeStyle = line;
  ctx.beginPath();
  ctx.moveTo(80, 66);
  ctx.lineTo(386, 66);
  ctx.stroke();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(350, 40);
  ctx.lineTo(362, 52);
  ctx.moveTo(362, 40);
  ctx.lineTo(350, 52);
  ctx.stroke();

  const imageX = 76;
  const imageY = 82;
  const imageW = 314;
  const imageH = 128;
  roundedBox(ctx, imageX, imageY, imageW, imageH, 13, "#f2f2f2", line);
  const imageSource = item?.image_data;
  if (imageSource) {
    let image = cache.get(imageSource);
    if (!image) {
      image = new Image();
      image.src = imageSource;
      cache.set(imageSource, image);
    }
    if (image.complete && image.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(imageX, imageY, imageW, imageH, 13);
      ctx.clip();
      const scale = Math.max(imageW / image.naturalWidth, imageH / image.naturalHeight);
      const drawW = image.naturalWidth * scale;
      const drawH = image.naturalHeight * scale;
      ctx.drawImage(image, imageX + (imageW - drawW) / 2, imageY + (imageH - drawH) / 2, drawW, drawH);
      ctx.restore();
    } else {
      ctx.fillStyle = muted;
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Cargando imagen…", 233, 151);
    }
  } else {
    ctx.fillStyle = muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Imagen no disponible", 233, 151);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  ctx.font = "600 17px system-ui, sans-serif";
  const titleBottom = drawWrappedCanvasText(ctx, item?.title ?? "Sin productos", 78, 238, 310, 20, 2);
  ctx.fillStyle = muted;
  ctx.font = "12px system-ui, sans-serif";
  drawWrappedCanvasText(ctx, item?.description ?? "", 78, Math.max(263, titleBottom + 5), 310, 16, 3);

  const price = item?.price ? `${item.currency ? `${item.currency} ` : ""}${item.price}` : "";
  if (price) {
    ctx.fillStyle = ink;
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(price.slice(0, 32), 78, 337);
  }
  ctx.fillStyle = muted;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "left";
  const paymentText = artifact.payment_status === "settled"
    ? `${artifact.app === "payload-cms" ? "Payload CMS" : artifact.app} · x402 pagado`
    : `${artifact.app === "payload-cms" ? "Payload CMS" : artifact.app} · servicio completado`;
  ctx.fillText(paymentText, 78, 356);

  const pagerY = 368;
  roundedBox(ctx, 82, pagerY, 82, 32, 16, "#f5f5f5", line);
  roundedBox(ctx, 302, pagerY, 82, 32, 16, page < items.length - 1 ? "#171717" : "#a3a3a3");
  ctx.font = "13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = page > 0 ? ink : "#b7b7b7";
  ctx.fillText("Anterior", 123, pagerY + 21);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Siguiente", 343, pagerY + 21);
  ctx.fillStyle = muted;
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText(items.length ? `${page + 1} / ${items.length}` : "0 / 0", 233, pagerY + 20);
}

// canvas off-screen que se convierte en textura
function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TEX_SIZE;
  c.height = TEX_SIZE;
  return c;
}

/** Estado mínimo que consume Rust (sin events ni secretos). */
function leanState(os: NomikOSState | null): OsUiState | null {
  if (!os) return null;
  return {
    stage: os.stage,
    screen: os.screen,
    locked: os.locked,
    device_id: os.device_id,
    claim_code: os.claim_code,
    boot_count: os.boot_count,
    taps: os.taps,
    apps: os.apps,
    detail_app: os.detail_app,
    llm: os.llm,
    agent_wallet: os.agent_wallet,
    last_x402: os.last_x402,
    last_reply: os.last_reply,
    chat: os.chat?.map((turn) => ({
      text: turn.text,
      reply: turn.reply,
      artifacts: turn.artifacts?.slice(0, 1).map((artifact) => ({
        title: artifact.title,
        app: artifact.app,
        item_count: artifact.items.length,
      })),
    })) ?? null,
  };
}

const DAYS: Record<string, string[]> = {
  es: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
  en: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
};
const MONTHS: Record<string, string[]> = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
};

function clockParts(locale: string): { hour: number; minute: number; date: string } {
  const now = new Date();
  const days = DAYS[locale] ?? DAYS.es;
  const months = MONTHS[locale] ?? MONTHS.es;
  return {
    hour: now.getHours(),
    minute: now.getMinutes(),
    date: `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`,
  };
}

export default function DeviceScreen() {
  const t = useTranslations("screen");
  const locale = useLocale();
  const os = useNomikOS();
  const feed = useAgentFeed();
  const feedRef = useRef(feed);
  feedRef.current = feed;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const osRef = useRef(os);
  osRef.current = os;
  const [wasm, setWasm] = useState(false);
  useEffect(() => {
    void initOsUi().then((ok) => setWasm(ok));
  }, []);
  const [scroll, setScroll] = useState<ListScroll>({});
  const scrollRef = useRef(scroll);
  scrollRef.current = scroll;
  const [theme, setTheme] = useState<OsTheme>("dark");
  const themeRef = useRef(theme);
  themeRef.current = theme;
  useEffect(() => {
    setTheme(loadTheme());
  }, []);
  const [shadeP, setShadeP] = useState(0);
  const shadeRef = useRef(shadeP);
  shadeRef.current = shadeP;
  const dragRef = useRef<{ startUvY: number; startP: number; moved: boolean; startChatScroll: number } | null>(null);
  const edgeDragRef = useRef<{
    startUvX: number;
    direction: "open" | "close";
    moved: boolean;
    opened: boolean;
    progress: number;
  } | null>(null);
  const rafRef = useRef(0);
  const cancelSnap = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };
  useEffect(() => () => cancelSnap(), []);
  const snapShadeTo = (target: number) => {
    cancelSnap();
    const from = shadeRef.current;
    if (from === target) return;
    const t0 = performance.now();
    const dur = 180;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      setShadeP(from + (target - from) * e);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = 0;
        setShadeP(target);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // ── Hoja del historial de chat ──────────────────────────────
  const [chatFull, setChatFull] = useState(false);
  const [chatAnim, setChatAnim] = useState(0);
  const [chatScroll, setChatScroll] = useState(0);
  const chatFullRef = useRef(chatFull);
  const chatAnimRef = useRef(chatAnim);
  const chatScrollRef = useRef(chatScroll);
  chatFullRef.current = chatFull;
  chatAnimRef.current = chatAnim;
  chatScrollRef.current = chatScroll;
  const chatRaf = useRef(0);
  const cancelChatAnim = () => {
    cancelAnimationFrame(chatRaf.current);
    chatRaf.current = 0;
  };
  useEffect(() => () => cancelChatAnim(), []);

  // ── Drawer lateral de historial de chat (derecha → izquierda) ─────────
  const [chatDrawer, setChatDrawer] = useState(false);
  const [chatDrawerAnim, setChatDrawerAnim] = useState(0);
  const [chatDrawerScroll, setChatDrawerScroll] = useState(0);
  const chatDrawerRef = useRef(chatDrawer);
  const chatDrawerAnimRef = useRef(chatDrawerAnim);
  const chatDrawerScrollRef = useRef(chatDrawerScroll);
  chatDrawerRef.current = chatDrawer;
  chatDrawerAnimRef.current = chatDrawerAnim;
  chatDrawerScrollRef.current = chatDrawerScroll;
  const chatDrawerRaf = useRef(0);
  const [artifactTurnIndex, setArtifactTurnIndex] = useState<number | null>(null);
  const [artifactPage, setArtifactPage] = useState(0);
  const artifactTurnRef = useRef<number | null>(null);
  const artifactPageRef = useRef(0);
  const artifactGestureRef = useRef<{ startUvX: number; moved: boolean } | null>(null);
  const suppressArtifactClickRef = useRef(false);
  const artifactImagesRef = useRef(new Map<string, HTMLImageElement>());
  artifactTurnRef.current = artifactTurnIndex;
  artifactPageRef.current = artifactPage;
  const cancelChatDrawerAnim = () => {
    cancelAnimationFrame(chatDrawerRaf.current);
    chatDrawerRaf.current = 0;
  };
  useEffect(() => () => cancelChatDrawerAnim(), []);
  useEffect(() => {
    setDeviceChatDrawer(chatDrawer);
  }, [chatDrawer]);
  useEffect(() => {
    setDeviceChatDrawerAnim(chatDrawerAnim);
  }, [chatDrawerAnim]);
  useEffect(() => {
    setDeviceChatDrawerScroll(chatDrawerScroll);
  }, [chatDrawerScroll]);
  // Reset drawer scroll when history changes size drastically
  useEffect(() => {
    const max = chatDrawerScrollMax(leanState(os));
    if (chatDrawerScroll > max) setChatDrawerScroll(max);
  }, [os?.chat?.length, chatDrawerScroll]);

  const animChatDrawerTo = (targetOpen: boolean) => {
    cancelChatDrawerAnim();
    const from = chatDrawerAnimRef.current;
    const to = targetOpen ? 100 : 0;
    if (from === to) {
      if (!targetOpen) setChatDrawer(false);
      return;
    }
    if (targetOpen) setChatDrawer(true);
    const t0 = performance.now();
    const dur = 260;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (to - from) * e);
      setChatDrawerAnim(v);
      if (t < 1) {
        chatDrawerRaf.current = requestAnimationFrame(step);
      } else {
        chatDrawerRaf.current = 0;
        setChatDrawerAnim(to);
        if (!targetOpen) setChatDrawer(false);
      }
    };
    chatDrawerRaf.current = requestAnimationFrame(step);
  };

  const openChatDrawer = () => {
    const max = chatDrawerScrollMax(leanState(osRef.current));
    setChatDrawerScroll(max);
    animChatDrawerTo(true);
  };
  const closeChatDrawer = () => {
    setChatDrawerScroll(0);
    animChatDrawerTo(false);
  };
  useEffect(() => {
    setDeviceChatFull(chatFull);
  }, [chatFull]);
  useEffect(() => {
    if (!chatFull && artifactTurnRef.current !== null) {
      artifactTurnRef.current = null;
      setArtifactTurnIndex(null);
      artifactPageRef.current = 0;
      setArtifactPage(0);
    }
  }, [chatFull]);
  useEffect(() => () => {
    setDeviceChatFull(false);
  }, []);
  const chatTailTs = os?.chat?.[Math.max(0, (os?.chat?.length ?? 0) - 1)]?.ts;
  const previousChatMaxRef = useRef(0);
  // Mantiene la vista al final cuando llegan turnos nuevos, pero respeta el
  // scroll manual si el usuario está leyendo mensajes anteriores.
  useEffect(() => {
    const max = chatScrollMax(leanState(os));
    const wasAtBottom = previousChatMaxRef.current - chatScrollRef.current <= 48;
    if (chatFullRef.current && wasAtBottom) {
      chatScrollRef.current = max;
      setChatScroll(max);
    } else if (chatScrollRef.current > max) {
      chatScrollRef.current = max;
      setChatScroll(max);
    }
    previousChatMaxRef.current = max;
  }, [os?.chat?.length, chatTailTs, wasm]);

  const animChatTo = (targetFull: boolean) => {
    cancelChatAnim();
    const from = chatAnimRef.current;
    const to = targetFull ? 100 : 0;
    if (from === to) {
      setDeviceChatFull(targetFull);
      if (!targetFull) setChatFull(false);
      return;
    }
    if (targetFull) {
      setChatFull(true);
      setDeviceChatFull(true);
    }
    const t0 = performance.now();
    const dur = 260;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (to - from) * e);
      setChatAnim(v);
      if (t < 1) {
        chatRaf.current = requestAnimationFrame(step);
      } else {
        chatRaf.current = 0;
        setChatAnim(to);
        if (!targetFull) {
          setChatFull(false);
          setDeviceChatFull(false);
        }
      }
    };
    chatRaf.current = requestAnimationFrame(step);
  };

  const prepareFullChat = () => {
    // El panel superior no puede quedarse superpuesto al chat lateral.
    // Al abrir mensajes, retrae la cortina con la misma animación de cierre.
    snapShadeTo(0);
    // La hoja horizontal reemplaza cualquier drawer que hubiese quedado
    // abierto, para que nunca se dibujen las dos vistas a la vez.
    cancelChatDrawerAnim();
    chatDrawerRef.current = false;
    chatDrawerAnimRef.current = 0;
    setChatDrawer(false);
    setChatDrawerAnim(0);
    setDeviceChatDrawer(false);
    setDeviceChatDrawerAnim(0);
    // Al abrir, empieza abajo del todo (últimos mensajes visibles).
    const max = chatScrollMax(leanState(osRef.current));
    chatScrollRef.current = max;
    setChatScroll(max);
    setDeviceChatCompose(false);
    setDeviceChatDraft("");
  };

  const chatCompose = useDeviceChatCompose();
  const chatDraft = useDeviceChatDraft();
  const chatComposeRef = useRef(chatCompose);
  const chatDraftRef = useRef(chatDraft);
  chatComposeRef.current = chatCompose;
  chatDraftRef.current = chatDraft;

  const animatingBase =
    os === null ||
    os.stage === "boot" ||
    os.locked !== false ||
    os.screen === "home" ||
    os.screen === "status";
  const animatingChat = chatAnim > 0 && chatAnim < 100;
  const animatingChatDrawer = chatDrawerAnim > 0 && chatDrawerAnim < 100;
  const animating =
    animatingBase || animatingChat || animatingChatDrawer || chatFull || chatCompose || chatDrawer;

  const micMuted = useMicMuted();
  const micRef = useRef(micMuted);
  micRef.current = micMuted;
  const [banco, setBanco] = useState<BancoView>({ tab: "main", recv: "qr", send: "nfc" });
  const bancoRef = useRef(banco);
  bancoRef.current = banco;
  const sendTo = useBankSendTo();
  const sendToRef = useRef(sendTo);
  sendToRef.current = sendTo;

  const paint = (
    osState: NomikOSState | null,
    view: OsUiView,
    elapsedMs: number,
  ): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = renderOsUi(leanState(osState), view, elapsedMs, clockParts(locale));
    if (!img) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
      ctx.fillStyle = "#ffc000";
      ctx.font = "16px monospace";
      ctx.textAlign = "center";
      ctx.fillText(t("loading"), TEX_SIZE / 2, TEX_SIZE / 2);
      return;
    }
    ctx.putImageData(img, 0, 0);
    const turnIndex = artifactTurnRef.current;
    const artifact = turnIndex === null ? null : osState?.chat?.[turnIndex]?.artifacts?.[0] ?? null;
    if (artifact) {
      drawDeviceArtifact(ctx, artifact, artifactPageRef.current, artifactImagesRef.current, locale);
    }
  };

  const viewOf = (
    scroll: ListScroll,
    theme: OsTheme,
    shadeP: number,
    micMuted: boolean,
    banco: BancoView,
    sendTo: string,
    chat: OsChatView,
    chatFull: boolean,
    chatAnim: number,
    chatScroll: number,
    chatCompose: boolean,
    chatDraft: string,
    chatDrawer: boolean,
    chatDrawerAnim: number,
    chatDrawerScroll: number,
  ): OsUiView => ({
    scroll: {
      apps: scroll["apps"] ?? 0,
      providers: scroll["providers"] ?? 0,
      models: scroll["models"] ?? 0,
    },
    theme,
    shadeP: Math.round(shadeP * 100),
    micMuted,
    banco,
    sendTo,
    chat,
    chatFull,
    chatAnim,
    chatScroll,
    chatCompose,
    chatDraft,
    chatDrawer,
    chatDrawerAnim,
    chatDrawerScroll,
  });

  const chatOf = (f: AgentFeed): OsChatView => ({
    status: f.status,
    heard: f.heard,
    elapsed_ms: f.turnTs > 0 ? Math.max(0, Date.now() - f.turnTs) : 0,
  });

  useEffect(() => {
    const canvas = makeCanvas();
    canvasRef.current = canvas;
    setTexture(new THREE.CanvasTexture(canvas));
    return () => {
      canvasRef.current = null;
      setOverScreen(false);
    };
  }, []);

  useEffect(() => {
    if (!texture || !wasm || animating) return;
    paint(
      os,
      viewOf(
        scroll,
        theme,
        shadeP,
        micMuted,
        banco,
        sendTo,
        chatOf(feed),
        chatFull,
        chatAnim,
        chatScroll,
        chatCompose,
        chatDraft,
        chatDrawer,
        chatDrawerAnim,
        chatDrawerScroll,
      ),
      Number.POSITIVE_INFINITY,
    );
    texture.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [os, texture, wasm, animating, scroll, theme, shadeP, micMuted, banco, sendTo, feed, chatFull, chatAnim, chatScroll, chatCompose, chatDraft]);

  useEffect(() => {
    setScroll({});
    cancelSnap();
    setShadeP(0);
    setBanco({ tab: "main", recv: "qr", send: "nfc" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [os?.screen]);

  useEffect(() => {
    if (!texture || !wasm || !animating) return;
    const t0 = performance.now();
    let raf = 0;
    const frame = () => {
      paint(
        osRef.current,
        viewOf(
          scrollRef.current,
          themeRef.current,
          shadeRef.current,
          micRef.current,
          bancoRef.current,
          sendToRef.current,
          chatOf(feedRef.current),
          chatFullRef.current,
          chatAnimRef.current,
          chatScrollRef.current,
          chatComposeRef.current,
          chatDraftRef.current,
          chatDrawerRef.current,
          chatDrawerAnimRef.current,
          chatDrawerScrollRef.current,
        ),
        performance.now() - t0,
      );
      texture.needsUpdate = true;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture, wasm, animating]);

  if (!texture) return null;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, SCREEN_Y, 0]}
      onPointerOver={() => setOverScreen(true)}
      onPointerOut={() => setOverScreen(false)}
      onPointerDown={(e) => {
        cancelSnap();
        const uv = (e as unknown as { uv?: { x: number; y: number } }).uv;
        if (!uv) {
          dragRef.current = null;
          edgeDragRef.current = null;
          return;
        }
        if (artifactTurnRef.current !== null) {
          artifactGestureRef.current = { startUvX: uv.x, moved: false };
          edgeDragRef.current = null;
          dragRef.current = null;
          return;
        }
        // Desde el borde izquierdo, deslizar a la derecha cierra el chat.
        if (uv.x < 0.12 && chatFullRef.current) {
          edgeDragRef.current = {
            startUvX: uv.x,
            direction: "close",
            moved: false,
            opened: false,
            progress: 0,
          };
          dragRef.current = null;
          return;
        }
        // Un gesto desde el borde derecho abre la hoja completa del chat.
        if (uv.x > 0.88 && !chatFullRef.current) {
          edgeDragRef.current = {
            startUvX: uv.x,
            direction: "open",
            moved: false,
            opened: false,
            progress: 0,
          };
          dragRef.current = null;
          return;
        }
        // Si el drawer de chat está abierto, el arrastre hace scroll vertical
        if (chatDrawerRef.current) {
          dragRef.current = {
            startUvY: uv.y,
            startP: shadeRef.current,
            moved: false,
            startChatScroll: chatDrawerScrollRef.current,
          };
          edgeDragRef.current = null;
          return;
        }
        // Si el chat (hoja) está abierto, el arrastre hace scroll del historial
        if (chatFullRef.current) {
          dragRef.current = { startUvY: uv.y, startP: shadeRef.current, moved: false, startChatScroll: chatScrollRef.current };
          edgeDragRef.current = null;
          return;
        }
        dragRef.current = { startUvY: uv.y, startP: shadeRef.current, moved: false, startChatScroll: 0 };
        edgeDragRef.current = null;
      }}
      onPointerMove={(e) => {
        const uv = (e as unknown as { uv?: { x: number; y: number } }).uv;
        const cur = osRef.current;
        const artifactGesture = artifactGestureRef.current;
        if (artifactGesture) {
          if (uv && Math.abs(uv.x - artifactGesture.startUvX) * TEX_SIZE > 10) {
            artifactGesture.moved = true;
          }
          return;
        }
        const edge = edgeDragRef.current;
        if (edge) {
          if (!uv || !cur || cur.stage !== "online" || cur.locked !== false) return;
          const dxPx = (edge.direction === "open" ? edge.startUvX - uv.x : uv.x - edge.startUvX) * TEX_SIZE;
          if (Math.abs(dxPx) > 4) edge.moved = true;
          const pct = Math.round(Math.min(100, Math.max(0, (dxPx / CHAT_EDGE_OPEN_PX) * 100)));
          edge.progress = pct;

          if (edge.direction === "open") {
            if (pct > 0 && !edge.opened) {
              edge.opened = true;
              prepareFullChat();
              chatFullRef.current = true;
              setChatFull(true);
              setDeviceChatFull(true);
            } else if (pct === 0 && edge.opened) {
              edge.opened = false;
              chatFullRef.current = false;
              setChatFull(false);
              setDeviceChatFull(false);
            }
          }
          const visiblePct = edge.direction === "open" ? pct : 100 - pct;
          chatAnimRef.current = visiblePct;
          setChatAnim(visiblePct);
          return;
        }

        const drag = dragRef.current;
        if (!drag || !uv || !cur || cur.stage !== "online" || cur.locked !== false) return;
        // Scroll del historial del chat (si la hoja está abierta)
        if (chatFullRef.current) {
          const dyPx = (drag.startUvY - uv.y) * TEX_SIZE;
          if (Math.abs(dyPx) > 2) drag.moved = true;
          const next = clampChatScroll(leanState(cur), drag.startChatScroll + dyPx);
          setChatScroll(next);
          return;
        }
        // Scroll del drawer lateral de chat
        if (chatDrawerRef.current) {
          const dyPx = (drag.startUvY - uv.y) * TEX_SIZE;
          if (Math.abs(dyPx) > 2) drag.moved = true;
          const next = clampChatDrawerScroll(leanState(cur), drag.startChatScroll + dyPx);
          setChatDrawerScroll(next);
          return;
        }
        if (drag.startUvY > 0.78 || drag.startP > 0) {
          const dyPx = (drag.startUvY - uv.y) * TEX_SIZE;
          const p = Math.min(1, Math.max(0, drag.startP + dyPx / (SHADE_H * 0.55)));
          if (Math.abs(p - drag.startP) > 0.02) drag.moved = true;
          setShadeP(p);
        }
      }}
      onPointerUp={(e) => {
        const drag = dragRef.current;
        const artifactGesture = artifactGestureRef.current;
        if (artifactGesture) {
          const uv = (e as unknown as { uv?: { x: number; y: number } }).uv;
          artifactGestureRef.current = null;
          if (artifactGesture.moved && uv) {
            const delta = uv.x - artifactGesture.startUvX;
            const turnIndex = artifactTurnRef.current;
            const itemCount = turnIndex === null
              ? 0
              : osRef.current?.chat?.[turnIndex]?.artifacts?.[0]?.items.length ?? 0;
            const next = delta < 0
              ? Math.max(0, Math.min(itemCount - 1, artifactPageRef.current + 1))
              : Math.max(0, artifactPageRef.current - 1);
            artifactPageRef.current = next;
            setArtifactPage(next);
            suppressArtifactClickRef.current = true;
          }
          dragRef.current = null;
          return;
        }
        const edge = edgeDragRef.current;
        edgeDragRef.current = null;
        // Resolver el gesto lateral: completar apertura/cierre o volver.
        if (edge) {
          dragRef.current = {
            startUvY: 0,
            startP: 0,
            moved: true,
            startChatScroll: 0,
          };
          chatAnimRef.current = edge.direction === "open" ? edge.progress : 100 - edge.progress;
          if (edge.direction === "open") {
            if (edge.moved && edge.progress >= CHAT_EDGE_SNAP_PCT) {
              prepareFullChat();
              chatFullRef.current = true;
              setChatFull(true);
              setDeviceChatFull(true);
              animChatTo(true);
            } else if (edge.opened || edge.progress > 0) {
              animChatTo(false);
            }
          } else if (edge.moved && edge.progress >= CHAT_EDGE_SNAP_PCT) {
            setDeviceChatCompose(false);
            setDeviceChatDraft("");
            animChatTo(false);
          } else {
            animChatTo(true);
          }
          return;
        }
        // Si era scroll del chat, no hacer snap del shade
        if (chatFullRef.current) {
          dragRef.current = drag?.moved ? drag : null;
          return;
        }
        // Si era scroll del drawer, no hacer snap del shade
        if (chatDrawerRef.current) {
          dragRef.current = drag?.moved ? drag : null;
          return;
        }
        dragRef.current = drag?.moved ? drag : null;
        if (!drag?.moved) return;
        snapShadeTo(shadeRef.current > 0.35 ? 1 : 0);
      }}
      onWheel={(e) => {
        const cur = osRef.current;
        if (!cur || cur.stage !== "online") return;
        const dy = (e as unknown as { deltaY?: number }).deltaY ?? 0;
        if (dy === 0) return;
        // Rueda sobre la hoja del chat: scroll del historial
        if (chatFullRef.current) {
          const step = dy > 0 ? 32 : -32;
          const next = clampChatScroll(leanState(cur), chatScrollRef.current + step);
          if (next !== chatScrollRef.current) setChatScroll(next);
          return;
        }
        // Rueda sobre el drawer lateral: scroll del historial
        if (chatDrawerRef.current) {
          const step = dy > 0 ? 32 : -32;
          const next = clampChatDrawerScroll(leanState(cur), chatDrawerScrollRef.current + step);
          if (next !== chatDrawerScrollRef.current) setChatDrawerScroll(next);
          return;
        }
        const screen = cur.screen === "status" ? "home" : cur.screen;
        if (screen !== "apps" && screen !== "providers" && screen !== "models") return;
        const total = scrollTotal(leanState(cur), screen);
        const prev = scrollRef.current[screen] ?? 0;
        const next = clampScroll(total, prev + (dy > 0 ? 1 : -1));
        if (next !== prev) setScroll((s) => ({ ...s, [screen]: next }));
      }}
      onClick={(e) => {
        const uv = (e as unknown as { uv?: { x: number; y: number } }).uv;
        if (suppressArtifactClickRef.current) {
          suppressArtifactClickRef.current = false;
          return;
        }
        if (dragRef.current?.moved) {
          dragRef.current = null;
          return;
        }
        dragRef.current = null;
        const cur = osRef.current;
        if (!uv || !cur || cur.stage !== "online") {
          void simTap();
          return;
        }
        const px = uv.x * TEX_SIZE;
        const py = (1 - uv.y) * TEX_SIZE;
        if (artifactTurnRef.current !== null) {
          const turnIndex = artifactTurnRef.current;
          const itemCount = cur.chat?.[turnIndex]?.artifacts?.[0]?.items.length ?? 0;
          if (px >= 342 && py <= 76) {
            artifactTurnRef.current = null;
            setArtifactTurnIndex(null);
            artifactPageRef.current = 0;
            setArtifactPage(0);
          } else if (py >= 368 && py <= 410 && px >= 72 && px <= 174) {
            const next = Math.max(0, artifactPageRef.current - 1);
            artifactPageRef.current = next;
            setArtifactPage(next);
          } else if (py >= 368 && py <= 410 && px >= 292 && px <= 394) {
            const next = Math.min(Math.max(0, itemCount - 1), artifactPageRef.current + 1);
            artifactPageRef.current = next;
            setArtifactPage(next);
          }
          return;
        }
        const view = viewOf(
          scrollRef.current,
          themeRef.current,
          shadeRef.current,
          micRef.current,
          bancoRef.current,
          sendToRef.current,
          chatOf(feedRef.current),
          chatFullRef.current,
          chatAnimRef.current,
          chatScrollRef.current,
          chatComposeRef.current,
          chatDraftRef.current,
          chatDrawerRef.current,
          chatDrawerAnimRef.current,
          chatDrawerScrollRef.current,
        );
        const target = hitOsUi(leanState(cur), view, px, py);
        const artifactMatch = target.match(/^local:chat-artifact:(\d+)$/);
        if (artifactMatch) {
          const index = Number(artifactMatch[1]);
          if (cur.chat?.[index]?.artifacts?.[0]?.items.length) {
            artifactPageRef.current = 0;
            setArtifactPage(0);
            artifactTurnRef.current = index;
            setArtifactTurnIndex(index);
          }
          return;
        }
        if (!target) return;
        if (target === "local:shade-open") {
          snapShadeTo(1);
          return;
        }
        if (target === "local:shade-close") {
          snapShadeTo(0);
          return;
        }
        if (target === "local:shade-body") return;
        if (target === "local:bank-main") {
          setBanco((b) => ({ ...b, tab: "main" }));
          return;
        }
        if (target === "local:bank-send") {
          setBanco((b) => ({ ...b, tab: "send" }));
          return;
        }
        if (target === "local:bank-receive") {
          setBanco((b) => ({ ...b, tab: "receive" }));
          return;
        }
        if (target === "local:bank-qr") {
          setBanco((b) => ({ ...b, recv: "qr" }));
          return;
        }
        if (target === "local:bank-nfc") {
          setBanco((b) => ({ ...b, recv: "nfc" }));
          return;
        }
        if (target === "local:bank-send-nfc") {
          setBanco((b) => ({ ...b, send: "nfc" }));
          return;
        }
        if (target === "local:bank-send-manual") {
          setBanco((b) => ({ ...b, send: "manual" }));
          return;
        }
        if (target === "local:mic") {
          setMicMuted(!micRef.current);
          return;
        }
        if (target === "local:chat-drawer-close") {
          closeChatDrawer();
          return;
        }
        if (target === "local:theme") {
          setTheme((t) => {
            const next = t === "light" ? "dark" : "light";
            try {
              window.localStorage.setItem(THEME_KEY, next);
            } catch {
              /* sin storage: solo sesión */
            }
            return next;
          });
          return;
        }
        void simPress(target);
      }}
    >
      <circleGeometry args={[SCREEN_RADIUS, 64]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
