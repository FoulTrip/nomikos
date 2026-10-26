// Validación: cargar el GLB meshopt con GLTFLoader + MeshoptDecoder (como en el navegador)
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
    let meshes = 0,
      tris = 0;
    gltf.scene.traverse((o) => {
      const m = o;
      if (m.isMesh) {
        meshes++;
        const g = m.geometry;
        tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      }
    });
    // Caja en espacio MUNDO (incluye el transform del nodo, como Bounds/Center en el visor)
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    console.log(`✔ GLB cargado por Three.js: ${meshes} malla(s), ${Math.round(tris)} triángulos`);
    console.log(`✔ Tamaño del dispositivo (mundo): ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`);
    console.log(`✔ Centrado en: (${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)})`);
    process.exit(0);
  },
  (err) => {
    console.error("✘ Error al parsear el GLB:", err);
    process.exit(1);
  }
);
