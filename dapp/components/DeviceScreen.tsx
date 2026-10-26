"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useNomikOS, simTap, simPress } from "@/lib/os/nomikos";
import { drawScreen } from "@/lib/screen/draw";
import { PX, hitTest } from "@/lib/screen/layout";

const TEX_SIZE = 466; // px (AMOLED 466×466)

// Colocación de la pantalla sobre el modelo (unidades del GLB, en mm).
// El CAD llega "acostado" con la pantalla hacia +Y; el grupo padre de
// DeviceViewer lo rota π/2 en X para que mire a la cámara.
// Display real 1.43" = 36.3 mm Ø (radio 18.16): radio 18.0 deja un borde
// ultra-delgado (~0.16 mm) de bisel visible alrededor.
const SCREEN_Y = 3;
const SCREEN_RADIUS = 18.0;

// canvas off-screen que se convierte en textura
function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TEX_SIZE;
  c.height = TEX_SIZE;
  return c;
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

  // Solo boot/conexión/bloqueo animan (progress, spinner, reloj vivo);
  // el resto son estáticos y se redibujan con cada estado del poll.
  const animating = os === null || os.stage === "boot" || os.locked !== false;

  useEffect(() => {
    const canvas = makeCanvas();
    canvasRef.current = canvas;
    setTexture(new THREE.CanvasTexture(canvas));
    return () => {
      canvasRef.current = null;
    };
  }, []);

  // Dibujo estático: claim/online se repintan solo cuando cambia el OS.
  useEffect(() => {
    if (!texture || !canvasRef.current || animating) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    drawScreen(ctx, os, Number.POSITIVE_INFINITY);
    texture.needsUpdate = true;
  }, [os, texture, animating]);

  // Dibujo animado (~60 fps): boot y conexión. No depende de `os` para
  // no reiniciar la animación con cada poll; lee el estado via ref y se
  // apaga solo al llegar a claim/online.
  useEffect(() => {
    if (!texture || !canvasRef.current || !animating) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const t0 = performance.now();
    let raf = 0;
    const frame = () => {
      drawScreen(ctx, osRef.current, performance.now() - t0);
      texture.needsUpdate = true;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [texture, animating]);

  if (!texture) return null;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, SCREEN_Y, 0]}
      onClick={(e) => {
        // táctil posicionado: uv del círculo → px de canvas → target.
        // uv.y va al revés que el canvas (flipY de la textura).
        const uv = (e as unknown as { uv?: { x: number; y: number } }).uv;
        if (!uv || !osRef.current || osRef.current.stage !== "online") {
          void simTap(); // legacy: boot/claim cuentan toques
          return;
        }
        const target = hitTest(osRef.current, uv.x * PX, (1 - uv.y) * PX);
        if (target) void simPress(target);
        // fuera de zona: sin acción (como la placa real)
      }}
    >
      <circleGeometry args={[SCREEN_RADIUS, 64]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
