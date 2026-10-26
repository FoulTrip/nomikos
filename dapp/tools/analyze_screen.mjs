// Analiza la geometría del GLB para localizar el disco de la pantalla AMOLED:
// busca el clúster de vértices de la cara superior (la más alta del dispositivo).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import fs from "node:fs";

const data = fs.readFileSync("public/models/ESP32-S3-Touch-AMOLED-1.43.glb");
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

loader.parse(
  data.buffer,
  "",
  (gltf) => {
    gltf.scene.updateMatrixWorld(true);
    let maxY = -Infinity;
    const pts = []; // { x, y, z } en espacio mundo

    gltf.scene.traverse((o) => {
      const m = o;
      if (!m.isMesh) return;
      const pos = m.geometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        pts.push([v.x, v.y, v.z]);
        if (v.y > maxY) maxY = v.y;
      }
    });

    console.log("maxY (cara superior):", maxY.toFixed(3));

    // Clúster de la cara superior: vértices a <0.8mm del máximo
    const top = pts.filter((p) => p[1] > maxY - 0.8);
    console.log("vértices en la cara superior:", top.length);

    let cx = 0, cz = 0;
    for (const p of top) { cx += p[0]; cz += p[2]; }
    cx /= top.length; cz /= top.length;
    console.log("centroide: x =", cx.toFixed(2), "· z =", cz.toFixed(2));

    const rs = top.map((p) => Math.hypot(p[0] - cx, p[2] - cz)).sort((a, b) => a - b);
    const q = (f) => rs[Math.floor(rs.length * f)].toFixed(2);
    console.log("radio percentiles (mm): p50 =", q(0.5), "· p90 =", q(0.9), "· p99 =", q(0.99), "· max =", rs[rs.length - 1].toFixed(2));

    // Histograma grueso de radios para ver los anillos (bisel vs pantalla)
    const hist = new Map();
    for (const r of rs) {
      const b = Math.floor(r / 2) * 2;
      hist.set(b, (hist.get(b) || 0) + 1);
    }
    console.log("histograma de radios (mm cada 2):");
    for (const [b, n] of [...hist.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`  r=${String(b).padStart(3)} mm  ${"█".repeat(Math.min(40, Math.round(n / 20)))} ${n}`);
    }
    process.exit(0);
  },
  (err) => { console.error(err); process.exit(1); }
);
