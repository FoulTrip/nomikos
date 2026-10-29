"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  Bounds,
  Center,
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
  useBounds,
  useGLTF,
  useProgress,
} from "@react-three/drei";
import * as THREE from "three";
import { LoaderCircle } from "lucide-react";
import DeviceScreen from "./DeviceScreen";
import {
  useViewLocked,
  useModalOpen,
  useOverScreen,
  useDeviceChatFull,
  useDeviceChatCompose,
  useDeviceChatDraft,
  useDeviceChatFocusNonce,
  setDeviceChatCompose,
  setDeviceChatDraft,
} from "@/lib/viewer/view";
import { simSay } from "@/lib/os/nomikos";
import { useTranslations } from "next-intl";

/**
 * ViewLocker — calcula una distancia frontal a partir del Bounds actual,
 * que ya incorpora el aspect ratio del canvas. Así el equipo no queda
 * ampliado al fijar la vista en una pantalla móvil vertical.
 */
function ViewLocker() {
  const locked = useViewLocked();
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const bounds = useBounds();
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    minDistance?: number;
    update: () => void;
  } | null;
  const saved = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (!controls) return;
    if (locked) {
      if (!saved.current) {
        saved.current = { pos: camera.position.clone(), target: controls.target.clone() };
      }
      const { center, distance } = bounds.getSize();
      const frontDistance = Math.max(distance, controls.minDistance ?? 15);
      camera.position.set(center.x, center.y, center.z + frontDistance);
      controls.target.copy(center);
      controls.update();
    } else if (saved.current) {
      camera.position.copy(saved.current.pos);
      controls.target.copy(saved.current.target);
      controls.update();
      saved.current = null;
    }
  }, [locked, camera, controls, bounds, size]);

  return null;
}

/** Ruta del modelo glb: proxy local → agent-os-api → Cloudflare R2. */
const MODEL_URL = "/api/device/model";

/**
 * Overlay de carga como DOM plano, FUERA del <Canvas>.
 *
 * El `<Html>` de drei crea un root de ReactDOM dentro del canvas y lo
 * desmonta en el cleanup de useLayoutEffect — durante el commit de React
 * — lo que con React 19 produce:
 *   "Attempted to synchronously unmount a root while React was already
 *    rendering" + NotFoundError removeChild al navegar login⇄panel.
 * `useProgress` lee un store externo y no crea roots: mismo UX, sin carrera.
 */
function ModelLoader() {
  const { active, progress, errors } = useProgress();
  if (!active || errors.length > 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-5 flex items-center justify-center gap-2 bg-[radial-gradient(600px_300px_at_50%_45%,rgba(255,255,255,0.92),rgba(255,255,255,0.65))] text-sm tracking-wide text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin text-primary" />
      Cargando modelo 3D… {Math.round(progress)}%
    </div>
  );
}

function Device() {
  // (path, useDraco, useMeshOpt): el GLB usa compresión meshopt,
  // cuyo decodificador se incluye localmente (sin CDN).
  const { scene } = useGLTF(MODEL_URL, false, true);

  // Material estilizado (el STEP no exporta texturas) + sombras por malla.
  useMemo(() => {
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.material = new THREE.MeshStandardMaterial({
          color: "#23272e",
          metalness: 0.55,
          roughness: 0.42,
        });
      }
    });
  }, [scene]);

  // El CAD llega "acostado" (pantalla hacia +Y). Se pone de pie,
  // con la pantalla mirando a la cámara (+Z).
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <primitive object={scene} />
      {/* Superponemos la pantalla táctil / OS en el frente del dispositivo */}
      <DeviceScreen />
    </group>
  );
}

function DeviceChatInput() {
  const chatFull = useDeviceChatFull();
  const chatCompose = useDeviceChatCompose();
  const draft = useDeviceChatDraft();
  const focusNonce = useDeviceChatFocusNonce();
  const t = useTranslations("screen");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (chatCompose && chatFull) ref.current?.focus();
  }, [chatCompose, chatFull, focusNonce]);
  if (!chatFull || !chatCompose) return null;
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDeviceChatCompose(false);
    setDeviceChatDraft("");
    void simSay(text).catch(() => {});
  };
  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-10 flex w-[min(92%,360px)] -translate-x-1/2 items-center gap-2 rounded-full border border-zinc-200 bg-white/95 px-2 py-2 shadow-lg backdrop-blur">
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDeviceChatDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") send();
          if (e.key === "Escape") {
            setDeviceChatCompose(false);
            setDeviceChatDraft("");
          }
        }}
        placeholder={t("chatPlaceholder")}
        className="min-w-0 flex-1 bg-transparent px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
      />
      <button
        type="button"
        onClick={send}
        className="shrink-0 rounded-full bg-[#ffc000] px-4 py-2 text-sm font-semibold text-black hover:bg-[#e6ac00]"
      >
        {t("chatSend")}
      </button>
      <button
        type="button"
        onClick={() => {
          setDeviceChatCompose(false);
          setDeviceChatDraft("");
        }}
        className="shrink-0 rounded-full px-2 py-2 text-zinc-500 hover:bg-zinc-100"
        aria-label="close"
      >
        ✕
      </button>
    </div>
  );
}

export default function DeviceViewer() {
  const [autoRotate, setAutoRotate] = useState(true);
  const locked = useViewLocked();
  const modal = useModalOpen();
  const overScreen = useOverScreen();
  const interactive = !locked && !modal;

  return (
    <div className="absolute inset-0">
      <ModelLoader />
      {/* shadows="percentage": R3F mapea `true` → PCFSoftShadowMap, enum
          removido en three 0.186 (warning); PCFShadowMap es el fallback
          que three usa de todos modos. */}
      <Canvas shadows="percentage" dpr={[1, 2]} camera={{ position: [30, 22, 80], fov: 40 }}>
        <color attach="background" args={["#FFFFFF"]} />

        {/* Iluminación local (sin descargas externas) */}
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[40, 60, 30]}
          intensity={2.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-50, 15, -40]} intensity={0.8} color="#8fb6ff" />
        <Environment resolution={256}>
          <Lightformer intensity={3} position={[0, 5, 2]} scale={[12, 12, 1]} />
          <Lightformer
            intensity={1.6}
            position={[-6, 0, -1]}
            rotation-y={Math.PI / 2}
            scale={[12, 12, 1]}
            color="#9fc4ff"
          />
          <Lightformer
            intensity={1.6}
            position={[6, 0, 1]}
            rotation-y={-Math.PI / 2}
            scale={[12, 12, 1]}
            color="#ffd9a0"
          />
        </Environment>

        {/* fallback={null}: el loader vive fuera del Canvas (ModelLoader) */}
        <Suspense fallback={null}>
          {/* Encaja automáticamente el modelo en cámara, sea cual sea su escala */}
          <Bounds fit clip observe margin={1.2}>
            <Center>
              <Device />
            </Center>
            <ViewLocker />
          </Bounds>
          <ContactShadows
            position={[0, -24.5, 0]}
            opacity={0.55}
            scale={80}
            blur={2.5}
            far={20}
          />
        </Suspense>

        {/* Rotación con el ratón, zoom con la rueda, pan con clic derecho */}
        {/* Auto-rotate hasta que el usuario interactúa con los controles */}
        {/* Bloqueado: sin rotación ni paneo (el zoom sigue para acercar) */}
        {/* Modal abierto: todo quieto (la rueda es del desplegable) */}
        {/* Sobre la pantalla: la rueda scrollea la lista del OS, no zoom */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          autoRotate={autoRotate && !locked}
          enableRotate={interactive}
          enablePan={interactive}
          enableZoom={!modal && !overScreen}
          onStart={() => setAutoRotate(false)}
          autoRotateSpeed={1.2}
          minDistance={15}
          maxDistance={250}
        />
      </Canvas>
      <DeviceChatInput />
    </div>
  );
}

useGLTF.preload(MODEL_URL, false, true);
