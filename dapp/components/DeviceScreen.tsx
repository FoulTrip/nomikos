"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useNomikOS, simTap, simPress, type NomikOSState } from "@/lib/os/nomikos";
import {
  clampScroll,
  hitOsUi,
  initOsUi,
  osUiReady,
  renderOsUi,
  scrollTotal,
  type BancoView,
  type ListScroll,
  type OsTheme,
  type OsUiState,
  type OsUiView,
} from "@/lib/screen/osui";
import { setMicMuted, setOverScreen, useBankSendTo, useMicMuted } from "@/lib/viewer/view";

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

// Colocación de la pantalla sobre el modelo (unidades del GLB, en mm).
// El CAD llega "acostado" con la pantalla hacia +Y; el grupo padre de
// DeviceViewer lo rota π/2 en X para que mire a la cámara.
// Display real 1.43" = 36.3 mm Ø (radio 18.16): radio 21.0 cubre el
// frontal dejando un borde delgado (pedido visual).
const SCREEN_Y = 3;
const SCREEN_RADIUS = 21.0;

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
  };
}

function clockParts(): { hour: number; minute: number; date: string } {
  const now = new Date();
  const days = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const months = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  return {
    hour: now.getHours(),
    minute: now.getMinutes(),
    date: `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`,
  };
}

export default function DeviceScreen() {
  // NomikOSState | null — poll del estado del OS (progreso por cuenta)
  const os = useNomikOS();

  // canvas off-screen + textura, creados una sola vez al montar.
  // Esto corre solo en el cliente porque el componente vive dentro del
  // <Canvas> de R3F (su árbol no se renderiza en el servidor).
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const osRef = useRef(os);
  osRef.current = os;
  // WASM os-ui (Rust): la GUI real. Sin él, mensaje en pantalla.
  const [wasm, setWasm] = useState(false);
  useEffect(() => {
    void initOsUi().then((ok) => setWasm(ok));
  }, []);
  // Scroll de listas del OS (vista local: apps/providers/models).
  const [scroll, setScroll] = useState<ListScroll>({});
  const scrollRef = useRef(scroll);
  scrollRef.current = scroll;
  // Tema del OS (vista local, persiste en el navegador).
  const [theme, setTheme] = useState<OsTheme>("dark");
  const themeRef = useRef(theme);
  themeRef.current = theme;
  useEffect(() => {
    setTheme(loadTheme());
  }, []);
  // Shade de notificaciones: progreso 0..1 (sigue al dedo + snap animado).
  const [shadeP, setShadeP] = useState(0);
  const shadeRef = useRef(shadeP);
  shadeRef.current = shadeP;
  const dragRef = useRef<{ startUvY: number; startP: number; moved: boolean } | null>(null);
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

  // Solo boot/conexión/bloqueo animan (progress, spinner, reloj vivo);
  // inicio también (ondas del botón de voz); el resto son estáticos y
  // se redibujan con cada estado del poll.
  const animating =
    os === null ||
    os.stage === "boot" ||
    os.locked !== false ||
    os.screen === "home" ||
    os.screen === "status";
  const micMuted = useMicMuted();
  const micRef = useRef(micMuted);
  micRef.current = micMuted;
  // Subvista de Banco (vista local: main | receive | send + modos).
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
    const img = renderOsUi(leanState(osState), view, elapsedMs, clockParts());
    if (!img) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
      ctx.fillStyle = "#ffc000";
      ctx.font = "16px monospace";
      ctx.textAlign = "center";
      ctx.fillText("cargando UI…", TEX_SIZE / 2, TEX_SIZE / 2);
      return;
    }
    ctx.putImageData(img, 0, 0);
  };

  const viewOf = (
    scroll: ListScroll,
    theme: OsTheme,
    shadeP: number,
    micMuted: boolean,
    banco: BancoView,
    sendTo: string,
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

  // Dibujo estático: claim/online se repintan solo cuando cambia el OS.
  useEffect(() => {
    if (!texture || !wasm || animating) return;
    paint(os, viewOf(scroll, theme, shadeP, micMuted, banco, sendTo), Number.POSITIVE_INFINITY);
    texture.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [os, texture, wasm, animating, scroll, theme, shadeP, micMuted, banco, sendTo]);

  // Al cambiar de pantalla, scroll arriba, shade cerrado y banco al inicio.
  useEffect(() => {
    setScroll({});
    cancelSnap();
    setShadeP(0);
    setBanco({ tab: "main", recv: "qr", send: "nfc" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [os?.screen]);

  // Dibujo animado (~60 fps): boot, conexión, bloqueo e inicio. No depende
  // de `os` para no reiniciar la animación con cada poll; lee vía refs.
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
        dragRef.current = uv ? { startUvY: uv.y, startP: shadeRef.current, moved: false } : null;
      }}
      onPointerMove={(e) => {
        // Arrastre vertical: la lámina sigue al dedo (abajo abre, arriba cierra).
        const drag = dragRef.current;
        const uv = (e as unknown as { uv?: { x: number; y: number } }).uv;
        const cur = osRef.current;
        if (!drag || !uv || !cur || cur.stage !== "online" || cur.locked !== false) return;
        if (drag.startUvY > 0.78 || drag.startP > 0) {
          const dyPx = (drag.startUvY - uv.y) * TEX_SIZE; // >0 = hacia abajo
          // ×1.8 de sensibilidad: en vistas inclinadas el uv rinde menos
          // y abrir del todo costaba demasiado recorrido.
          const p = Math.min(1, Math.max(0, drag.startP + dyPx / (SHADE_H * 0.55)));
          if (Math.abs(p - drag.startP) > 0.02) drag.moved = true;
          setShadeP(p);
        }
      }}
      onPointerUp={() => {
        // Al soltar: snap según cuánto bajó (el clic de un arrastre se ignora).
        const drag = dragRef.current;
        dragRef.current = drag?.moved ? drag : null;
        if (!drag?.moved) return;
        snapShadeTo(shadeRef.current > 0.35 ? 1 : 0);
      }}
      onWheel={(e) => {
        // Rueda sobre la pantalla: scroll de la lista del OS (1 fila por
        // gesto). El zoom de cámara ya está off por overScreen.
        const cur = osRef.current;
        const screen = cur?.screen === "status" ? "home" : cur?.screen;
        if (!cur || cur.stage !== "online" || (screen !== "apps" && screen !== "providers" && screen !== "models")) return;
        const dy = (e as unknown as { deltaY?: number }).deltaY ?? 0;
        if (dy === 0) return;
        const total = scrollTotal(leanState(cur), screen);
        const prev = scrollRef.current[screen] ?? 0;
        const next = clampScroll(total, prev + (dy > 0 ? 1 : -1));
        if (next !== prev) setScroll((s) => ({ ...s, [screen]: next }));
      }}
      onClick={(e) => {
        // táctil posicionado: uv del círculo → px de canvas → target (Rust).
        // uv.y va al revés que el canvas (flipY de la textura).
        const uv = (e as unknown as { uv?: { x: number; y: number } }).uv;
        if (dragRef.current?.moved) {
          dragRef.current = null; // era un arrastre, no un toque
          return;
        }
        dragRef.current = null;
        const cur = osRef.current;
        if (!uv || !cur || cur.stage !== "online") {
          void simTap(); // legacy: boot/claim cuentan toques
          return;
        }
        const px = uv.x * TEX_SIZE;
        const py = (1 - uv.y) * TEX_SIZE;
        const view = viewOf(
          scrollRef.current,
          themeRef.current,
          shadeRef.current,
          micRef.current,
          bancoRef.current,
          sendToRef.current,
        );
        const target = hitOsUi(leanState(cur), view, px, py);
        if (!target) return; // fuera de zona: sin acción (como la placa real)
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
          setMicMuted(!micRef.current); // local: silencia el mic del panel
          return;
        }
        if (target === "local:theme") {
          // Tema: 100% local (no toca al api): alterna y persiste.
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
