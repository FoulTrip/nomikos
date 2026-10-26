# Hackaton Meta — Visor 3D del ESP32-S3-Touch-AMOLED-1.43

Visor 3D web del dispositivo **Waveshare ESP32-S3-Touch-AMOLED-1.43**, construido con
**Next.js 16 + Three.js** (vía `@react-three/fiber`) y empaquetado en un contenedor
**Docker** listo para producción.

El usuario puede **rotar el dispositivo con el ratón**, hacer zoom con la rueda y
mover la vista con clic derecho.

## Pipeline del modelo 3D

```
ESP32-S3-Touch-AMOLED-1_43.stp (17 MB, CAD de PTC Creo)
        │  FreeCAD 1.0 headless  →  tools/convert_step_root.py
        ▼
esp32_root.obj (13.3 MB, 150 948 triángulos, mm)
        │  obj2gltf 3.2  →  tools/convert_to_gltf.sh
        ▼
ESP32-S3-Touch-AMOLED-1.43.glb (glTF binario + compresión meshopt)
        │
        ▼
public/models/  →  se sirve estático y lo carga useGLTF() de Three.js
```

- Solo se tesela el **ensamblaje raíz** (`ESP32_S3_TOUCH_AMOLED_1_43_ASM`) para no
  duplicar piezas (los sub-ensamblajes ya contienen a sus hijos).
- `obj2gltf` convierte el sistema de ejes CAD (Z arriba) a glTF (Y arriba).
- El modelo original está en
  `~/Descargas/ESP32-S3-Touch-AMOLED-1.43-3DFile/ESP32-S3-Touch-AMOLED-1.43/`.

## Estructura

```
├── app/                    # App Router (layout, página y estilos)
├── components/
│   └── DeviceViewer.tsx    # Escena Three.js (Canvas, luces, OrbitControls)
├── public/models/          # GLB del dispositivo
├── tools/                  # Scripts de conversión STEP → OBJ → GLB
├── next.config.ts          # output: "standalone" para Docker
├── Dockerfile              # build multi-stage (node:22-alpine)
└── package.json
```

## Desarrollo local

```bash
npm install
npm run dev        # http://localhost:3000
```

## Producción con Docker

```bash
npm run docker:build   # docker build -t hackaton-meta .
npm run docker:run     # docker run --rm -p 3000:3000 hackaton-meta
```

Abre <http://localhost:3000>. La imagen final usa la salida `standalone` de Next.js,
corre con usuario sin privilegios y pesa ~200 MB.

## Controles

| Acción           | Resultado             |
| ---------------- | --------------------- |
| Arrastrar        | Rotar el dispositivo  |
| Rueda del ratón  | Zoom                  |
| Clic derecho     | Desplazar la vista    |

Al cargar, el modelo gira solo (`autoRotate`) hasta que el usuario interactúa.

## Regenerar el modelo (opcional)

```bash
# 1) STEP → OBJ (requiere FreeCAD: sudo apt install freecad)
freecadcmd tools/convert_step_root.py

# 2) OBJ → GLB con compresión meshopt
bash tools/convert_to_gltf.sh
```

## Notas técnicas

- **Three.js** se usa a través de `@react-three/fiber` y `@react-three/drei`
  (implementaciones oficiales del ecosistema Three.js para React): `useGLTF`
  carga el modelo, `OrbitControls` aporta la rotación con el ratón y `Bounds`
  auto-encuadra el modelo sea cual sea su escala.
- La iluminación usa `Lightformer`s locales: la app funciona **sin internet**
  (no descarga HDRs de CDNs).
- El STEP original no incluye texturas, por lo que el visor aplica un material
  PBR estilizado (grafito metálico) al cargar.
