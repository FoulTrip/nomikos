"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useNomikOS, simTap } from "@/lib/os/nomikos";
import { drawScreen } from "@/lib/screen/draw";

const TEX_SIZE = 466; // px (AMOLED 466×466)

// Colocación de la pantalla sobre el modelo (unidades del GLB, en mm).
// El CAD llega "acostado" con la pantalla hacia +Y; el grupo padre de
// DeviceViewer lo rota π/2 en X para que mire a la cámara.
const SCREEN_Y = 3;
const SCREEN_RADIUS = 16.5; // radio ≈ 33 mm, dentro del bisel de 36 mm

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

  useEffect(() => {
    const canvas = makeCanvas();
    canvasRef.current = canvas;
    setTexture(new THREE.CanvasTexture(canvas));
    return () => {
      canvasRef.current = null;
    };
  }, []);

  // Redibujar la pantalla con cada estado del OS (60 fps solo si hay
  // animación; el poll trae el estado cada 2 s).
  useEffect(() => {
    if (!texture || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    drawScreen(ctx, os);
    texture.needsUpdate = true;
  }, [os, texture]);

  if (!texture) return null;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, SCREEN_Y, 0]}
      onClick={() => void simTap()}
    >
      <circleGeometry args={[SCREEN_RADIUS, 64]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
