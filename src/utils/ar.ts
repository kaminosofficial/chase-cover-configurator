import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import type { ConfigState } from '../store/configStore';

export const SC = 0.02;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
  }
  return btoa(binary);
}

export function exportToGLB(grp: THREE.Group): Promise<string> {
  return new Promise((resolve, reject) => {
    const exportGroup = grp.clone();
    const scale = 0.0254 / SC;
    exportGroup.scale.set(scale, scale, scale);
    exportGroup.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const m = (mesh.material as THREE.MeshStandardMaterial).clone();
        m.envMap = null;
        m.envMapIntensity = 0;
        m.side = THREE.DoubleSide;
        (m as any).normalMap = null;
        m.transparent = false;
        m.depthWrite = true;
        m.needsUpdate = true;
        mesh.material = m;
      }
    });
    exportGroup.updateMatrixWorld(true);
    const exporter = new GLTFExporter();
    exporter.parse(exportGroup, (result) => {
      if (result instanceof ArrayBuffer) {
        resolve('data:model/gltf-binary;base64,' + arrayBufferToBase64(result));
      } else {
        const json = JSON.stringify(result);
        resolve('data:model/gltf+json;base64,' + btoa(unescape(encodeURIComponent(json))));
      }
    }, (err) => reject(err), { binary: true });
  });
}

export function getConfigState(config: Partial<ConfigState>): string {
  const state: any = {
    w: config.w, l: config.l, sk: config.sk,
    drip: config.drip ? 1 : 0, diag: config.diag ? 1 : 0,
    holes: config.holes, mat: config.mat,
    pc: config.pc ? 1 : 0, pcCol: config.pcCol,
    gauge: config.gauge,
  };
  const cA = config.collarA, cB = config.collarB, cC = config.collarC;
  if ((config.holes ?? 0) >= 1 && cA) state.cA = { sh: cA.shape, d: cA.dia, rw: cA.rectWidth, rl: cA.rectLength, h: cA.height, c: cA.centered ? 1 : 0, a1: cA.offset1, a2: cA.offset2, a3: cA.offset3, a4: cA.offset4, sc: cA.stormCollar ? 1 : 0 };
  if ((config.holes ?? 0) >= 2 && cB) state.cB = { sh: cB.shape, d: cB.dia, rw: cB.rectWidth, rl: cB.rectLength, h: cB.height, c: cB.centered ? 1 : 0, b1: cB.offset1, b2: cB.offset2, b3: cB.offset3, b4: cB.offset4, sc: cB.stormCollar ? 1 : 0 };
  if ((config.holes ?? 0) === 3 && cC) state.cC = { sh: cC.shape, d: cC.dia, rw: cC.rectWidth, rl: cC.rectLength, h: cC.height, c: cC.centered ? 1 : 0, c1: cC.offset1, c2: cC.offset2, c3: cC.offset3, c4: cC.offset4, sc: cC.stormCollar ? 1 : 0 };
  return btoa(JSON.stringify(state));
}

export function applyConfigState(base64: string): Partial<ConfigState> {
  try {
    const s = JSON.parse(atob(base64));
    const partial: Partial<ConfigState> = {
      w: parseFloat(s.w) || 24, l: parseFloat(s.l) || 36, sk: parseFloat(s.sk) || 3,
      drip: !!s.drip, diag: !!s.diag, holes: s.holes || 0,
      mat: s.mat || 'galvanized', pc: !!s.pc, pcCol: s.pcCol || '#101010',
      gauge: s.gauge || 24,
    };
    if (s.cA) partial.collarA = { shape: s.cA.sh === 'rect' ? 'rect' : 'round', dia: parseFloat(s.cA.d), rectWidth: parseFloat(s.cA.rw) || parseFloat(s.cA.d), rectLength: parseFloat(s.cA.rl) || parseFloat(s.cA.d), height: parseFloat(s.cA.h), centered: !!s.cA.c, offset1: parseFloat(s.cA.a1) || 0, offset2: parseFloat(s.cA.a2) || 0, offset3: parseFloat(s.cA.a3) || 0, offset4: parseFloat(s.cA.a4) || 0, stormCollar: s.cA.sh === 'rect' ? false : !!s.cA.sc };
    if (s.cB) partial.collarB = { shape: s.cB.sh === 'rect' ? 'rect' : 'round', dia: parseFloat(s.cB.d), rectWidth: parseFloat(s.cB.rw) || parseFloat(s.cB.d), rectLength: parseFloat(s.cB.rl) || parseFloat(s.cB.d), height: parseFloat(s.cB.h), centered: !!s.cB.c, offset1: parseFloat(s.cB.b1) || 0, offset2: parseFloat(s.cB.b2) || 0, offset3: parseFloat(s.cB.b3) || 0, offset4: parseFloat(s.cB.b4) || 0, stormCollar: s.cB.sh === 'rect' ? false : !!s.cB.sc };
    if (s.cC) partial.collarC = { shape: s.cC.sh === 'rect' ? 'rect' : 'round', dia: parseFloat(s.cC.d), rectWidth: parseFloat(s.cC.rw) || parseFloat(s.cC.d), rectLength: parseFloat(s.cC.rl) || parseFloat(s.cC.d), height: parseFloat(s.cC.h), centered: !!s.cC.c, offset1: parseFloat(s.cC.c1) || 0, offset2: parseFloat(s.cC.c2) || 0, offset3: parseFloat(s.cC.c3) || 0, offset4: parseFloat(s.cC.c4) || 0, stormCollar: s.cC.sh === 'rect' ? false : !!s.cC.sc };
    return partial;
  } catch {
    return {};
  }
}
