import * as THREE from 'three';
import { CSG } from 'three-csg-ts';
import type { ConfigState, CollarState, HoleShape } from '../store/configStore.js';

type HoleId = 'A' | 'B' | 'C';

export interface HoleWorldData {
  wx: number;
  wz: number;
  h: number;
  id: HoleId;
  shape: HoleShape;
  halfX: number;
  halfZ: number;
  sizeX: number;
  sizeZ: number;
  radius: number;
}

export const SC = 0.02;
export const MIN_GAP_INCHES = 1;
export const STORM_COLLAR_HEIGHT_INCHES = 2.5;
export const MAX_DIAGONAL_RISE_INCHES = 0.75;

export function mkMat(
  mat: 'galvanized' | 'stainless' | 'copper',
  pc: boolean,
  pcCol: string
): THREE.MeshStandardMaterial {
  // Copper always renders as copper — its look is independent of powder coat state
  if (mat === 'copper') return new THREE.MeshStandardMaterial({ color: '#e09a72', metalness: 0.85, roughness: 0.15, envMapIntensity: 1.2 });
  if (pc) return new THREE.MeshStandardMaterial({ color: pcCol, metalness: 0.3, roughness: 0.6 });
  return new THREE.MeshStandardMaterial({ color: '#b8c4cc', metalness: 0.9, roughness: 0.25 });
}

const GAUGE_THICKNESS: Record<number, number> = {
  24: 0.0239,
  22: 0.0299,
  20: 0.0359,
};

function getCollarConfig(id: HoleId, config: ConfigState): CollarState {
  if (id === 'A') return config.collarA;
  if (id === 'B') return config.collarB;
  return config.collarC;
}

export function getHoleSizeInches(collar: CollarState): { sizeX: number; sizeZ: number } {
  if (collar.shape === 'rect') {
    return {
      sizeX: collar.rectWidth,
      sizeZ: collar.rectLength,
    };
  }

  return {
    sizeX: collar.dia,
    sizeZ: collar.dia,
  };
}

export function holeR(id: HoleId, config: ConfigState): number {
  return (getCollarConfig(id, config).dia / 2) * SC;
}

export function colH(id: HoleId, config: ConfigState): number {
  return getCollarConfig(id, config).height * SC;
}

export function getDiagonalSlopeRise(W: number, L: number): number {
  return Math.min(Math.sqrt(W * W + L * L) * 0.015, MAX_DIAGONAL_RISE_INCHES * SC);
}

function getHalfExtentsWorld(collar: CollarState): { halfX: number; halfZ: number } {
  const { sizeX, sizeZ } = getHoleSizeInches(collar);
  return {
    halfX: (sizeX / 2) * SC,
    halfZ: (sizeZ / 2) * SC,
  };
}

export function holeWorld(id: HoleId, config: ConfigState): HoleWorldData {
  const collar = getCollarConfig(id, config);
  const { sizeX, sizeZ } = getHoleSizeInches(collar);
  const { halfX, halfZ } = getHalfExtentsWorld(collar);
  const h = colH(id, config);
  const halfW = (config.w / 2) * SC;
  const halfL = (config.l / 2) * SC;

  if (collar.centered) {
    if (config.holes === 1) {
      return {
        wx: 0,
        wz: 0,
        h,
        id,
        shape: collar.shape,
        halfX,
        halfZ,
        sizeX: sizeX * SC,
        sizeZ: sizeZ * SC,
        radius: collar.shape === 'round' ? (collar.dia / 2) * SC : 0,
      };
    }

    if (config.holes === 2) {
      const slotPos = halfL / 2;
      if (id === 'A') {
        return {
          wx: 0,
          wz: slotPos,
          h,
          id,
          shape: collar.shape,
          halfX,
          halfZ,
          sizeX: sizeX * SC,
          sizeZ: sizeZ * SC,
          radius: collar.shape === 'round' ? (collar.dia / 2) * SC : 0,
        };
      }
      if (id === 'B') {
        return {
          wx: 0,
          wz: -slotPos,
          h,
          id,
          shape: collar.shape,
          halfX,
          halfZ,
          sizeX: sizeX * SC,
          sizeZ: sizeZ * SC,
          radius: collar.shape === 'round' ? (collar.dia / 2) * SC : 0,
        };
      }
    }

    if (config.holes === 3) {
      const slotPos = (2 * halfL) / 3;
      if (id === 'A') {
        return {
          wx: 0,
          wz: slotPos,
          h,
          id,
          shape: collar.shape,
          halfX,
          halfZ,
          sizeX: sizeX * SC,
          sizeZ: sizeZ * SC,
          radius: collar.shape === 'round' ? (collar.dia / 2) * SC : 0,
        };
      }
      if (id === 'B') {
        return {
          wx: 0,
          wz: 0,
          h,
          id,
          shape: collar.shape,
          halfX,
          halfZ,
          sizeX: sizeX * SC,
          sizeZ: sizeZ * SC,
          radius: collar.shape === 'round' ? (collar.dia / 2) * SC : 0,
        };
      }
      if (id === 'C') {
        return {
          wx: 0,
          wz: -slotPos,
          h,
          id,
          shape: collar.shape,
          halfX,
          halfZ,
          sizeX: sizeX * SC,
          sizeZ: sizeZ * SC,
          radius: collar.shape === 'round' ? (collar.dia / 2) * SC : 0,
        };
      }
    }
  }

  let cz = (config.l / 2 - collar.offset2) * SC - halfZ;
  let cx = (config.w / 2 - collar.offset1) * SC - halfX;

  cx = Math.max(-halfW + halfX, Math.min(halfW - halfX, cx));
  cz = Math.max(-halfL + halfZ, Math.min(halfL - halfZ, cz));

  return {
    wx: cx,
    wz: cz,
    h,
    id,
    shape: collar.shape,
    halfX,
    halfZ,
    sizeX: sizeX * SC,
    sizeZ: sizeZ * SC,
    radius: collar.shape === 'round' ? (collar.dia / 2) * SC : 0,
  };
}

function roundToEighth(value: number): number {
  return Math.round(value * 8) / 8;
}

function supportRadius(hole: HoleWorldData, nx: number, nz: number): number {
  if (hole.shape === 'round') return hole.radius;
  return Math.abs(nx) * hole.halfX + Math.abs(nz) * hole.halfZ;
}

function circleRectOverlap(circle: HoleWorldData, rect: HoleWorldData, gapWorld: number): boolean {
  const dx = Math.abs(circle.wx - rect.wx);
  const dz = Math.abs(circle.wz - rect.wz);
  const closestX = Math.max(dx - rect.halfX, 0);
  const closestZ = Math.max(dz - rect.halfZ, 0);
  const allowed = circle.radius + gapWorld;
  return closestX * closestX + closestZ * closestZ < allowed * allowed - 0.000001;
}

export function holesOverlap(a: HoleWorldData, b: HoleWorldData, gapWorld = MIN_GAP_INCHES * SC): boolean {
  if (a.shape === 'round' && b.shape === 'round') {
    const dx = a.wx - b.wx;
    const dz = a.wz - b.wz;
    return dx * dx + dz * dz < (a.radius + b.radius + gapWorld) * (a.radius + b.radius + gapWorld) - 0.000001;
  }

  if (a.shape === 'rect' && b.shape === 'rect') {
    return (
      Math.abs(a.wx - b.wx) < a.halfX + b.halfX + gapWorld - 0.000001 &&
      Math.abs(a.wz - b.wz) < a.halfZ + b.halfZ + gapWorld - 0.000001
    );
  }

  return a.shape === 'round'
    ? circleRectOverlap(a, b, gapWorld)
    : circleRectOverlap(b, a, gapWorld);
}

function rayCircleHitDistance(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  radius: number
): number | null {
  const rx = ox - cx;
  const rz = oz - cz;
  const b = 2 * (dx * rx + dz * rz);
  const c = rx * rx + rz * rz - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / 2;
  const t2 = (-b + sqrtDisc) / 2;
  if (t1 >= 0) return t1;
  if (t2 >= 0) return t2;
  return null;
}

function rayRectHitDistance(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  halfX: number,
  halfZ: number
): number | null {
  const minX = cx - halfX;
  const maxX = cx + halfX;
  const minZ = cz - halfZ;
  const maxZ = cz + halfZ;
  const eps = 0.000001;

  let tMin = -Infinity;
  let tMax = Infinity;

  if (Math.abs(dx) < eps) {
    if (ox < minX || ox > maxX) return null;
  } else {
    const tx1 = (minX - ox) / dx;
    const tx2 = (maxX - ox) / dx;
    tMin = Math.max(tMin, Math.min(tx1, tx2));
    tMax = Math.min(tMax, Math.max(tx1, tx2));
  }

  if (Math.abs(dz) < eps) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    const tz1 = (minZ - oz) / dz;
    const tz2 = (maxZ - oz) / dz;
    tMin = Math.max(tMin, Math.min(tz1, tz2));
    tMax = Math.min(tMax, Math.max(tz1, tz2));
  }

  if (tMax < 0 || tMin > tMax) return null;
  return tMin >= 0 ? tMin : tMax >= 0 ? 0 : null;
}

export function getHoleEdgeOffsets(hole: HoleWorldData, config: ConfigState) {
  const halfXInches = hole.halfX / SC;
  const halfZInches = hole.halfZ / SC;

  return {
    top: roundToEighth(config.w / 2 + hole.wx / SC - halfXInches),
    right: roundToEighth(config.l / 2 + hole.wz / SC - halfZInches),
    bottom: roundToEighth(config.w / 2 - hole.wx / SC - halfXInches),
    left: roundToEighth(config.l / 2 - hole.wz / SC - halfZInches),
  };
}

export function clampDragToOffsets(id: HoleId, cx: number, cz: number, config: ConfigState) {
  const collar = getCollarConfig(id, config);
  const collarKey = id === 'A' ? 'collarA' : id === 'B' ? 'collarB' : 'collarC';
  const hole = holeWorld(id, config);
  const size = getHoleSizeInches(collar);
  const maxOffset1 = Math.max(0, config.w - size.sizeX);
  const maxOffset2 = Math.max(0, config.l - size.sizeZ);

  const otherIds: HoleId[] = [];
  if (config.holes >= 1 && id !== 'A') otherIds.push('A');
  if (config.holes >= 2 && id !== 'B') otherIds.push('B');
  if (config.holes === 3 && id !== 'C') otherIds.push('C');

  const maxCx = (config.w / 2) * SC - hole.halfX;
  const minCx = (-config.w / 2) * SC + hole.halfX;
  const maxCz = (config.l / 2) * SC - hole.halfZ;
  const minCz = (-config.l / 2) * SC + hole.halfZ;
  const clampX = (value: number) => Math.max(minCx, Math.min(maxCx, value));
  const clampZ = (value: number) => Math.max(minCz, Math.min(maxCz, value));

  let safeCx = clampX(cx);
  let safeCz = clampZ(cz);

  for (let pass = 0; pass < 12; pass++) {
    let anyCollision = false;

    for (const otherId of otherIds) {
      const other = holeWorld(otherId, config);
      const moving = { ...hole, wx: safeCx, wz: safeCz };

      if (!holesOverlap(moving, other)) continue;

      anyCollision = true;
      const dx = moving.wx - other.wx;
      const dz = moving.wz - other.wz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const gapWorld = MIN_GAP_INCHES * SC;

      if (dist < 0.0005) {
        const directions: Array<[number, number]> = id > otherId
          ? [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
          : [[-1, 0], [0, -1], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

        let bestCx = safeCx;
        let bestCz = safeCz;
        let bestError = Number.POSITIVE_INFINITY;

        for (const [rawNx, rawNz] of directions) {
          const len = Math.sqrt(rawNx * rawNx + rawNz * rawNz);
          const nx = rawNx / len;
          const nz = rawNz / len;
          const required = supportRadius(moving, nx, nz) + supportRadius(other, -nx, -nz) + gapWorld;
          const candidateCx = clampX(other.wx + nx * required);
          const candidateCz = clampZ(other.wz + nz * required);
          const candidateHole = { ...moving, wx: candidateCx, wz: candidateCz };

          if (holesOverlap(candidateHole, other)) continue;

          const candidateError = Math.hypot(candidateCx - safeCx, candidateCz - safeCz);
          if (candidateError < bestError) {
            bestCx = candidateCx;
            bestCz = candidateCz;
            bestError = candidateError;
          }
        }

        safeCx = bestCx;
        safeCz = bestCz;
      } else {
        const nx = dx / dist;
        const nz = dz / dist;
        const required = supportRadius(moving, nx, nz) + supportRadius(other, -nx, -nz) + gapWorld;
        safeCx = clampX(other.wx + nx * required);
        safeCz = clampZ(other.wz + nz * required);
      }
    }

    if (!anyCollision) break;
  }

  let offset1 = config.w / 2 - (safeCx + hole.halfX) / SC;
  let offset2 = config.l / 2 - (safeCz + hole.halfZ) / SC;

  offset1 = Math.max(0, Math.min(maxOffset1, roundToEighth(offset1)));
  offset2 = Math.max(0, Math.min(maxOffset2, roundToEighth(offset2)));

  const offset3 = Math.max(0, Math.min(maxOffset1, config.w - size.sizeX - offset1));
  const offset4 = Math.max(0, Math.min(maxOffset2, config.l - size.sizeZ - offset2));

  const snappedConfig = {
    ...config,
    [collarKey]: {
      ...collar,
      centered: false,
      offset1,
      offset2,
      offset3,
      offset4,
    },
  } as ConfigState;

  const snappedHole = holeWorld(id, snappedConfig);
  let stillColliding = false;
  for (const otherId of otherIds) {
    const other = holeWorld(otherId, snappedConfig);
    if (holesOverlap(snappedHole, other)) {
      stillColliding = true;
      break;
    }
  }

  return { offset1, offset2, offset3, offset4, colliding: stillColliding };
}

export function buildCoverWithoutCollars(grp: THREE.Group, config: ConfigState) {
  const W = config.w * SC;
  const L = config.l * SC;
  const skH = config.sk * SC;
  const T = (GAUGE_THICKNESS[config.gauge] || 0.0239) * SC;
  const SLOPE = config.diag ? getDiagonalSlopeRise(W, L) : 0;

  const mat = mkMat(config.mat, config.pc, config.pcCol);

  const holes: HoleWorldData[] = [];
  if (config.holes >= 1) holes.push(holeWorld('A', config));
  if (config.holes >= 2) holes.push(holeWorld('B', config));
  if (config.holes === 3) holes.push(holeWorld('C', config));

  if (config.diag) {
    buildSlopedTop(W, L, skH, T, SLOPE, holes, mat, grp);
  } else {
    buildFlatTop(W, L, skH, T, holes, mat, grp);
  }

  function addSk(w: number, px: number, pz: number, ry: number) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, skH, T), mat.clone());
    m.position.set(px, skH / 2, pz);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
  }

  addSk(W + T, 0, L / 2, 0);
  addSk(W + T, 0, -L / 2, 0);
  addSk(L + T, -W / 2, 0, Math.PI / 2);
  addSk(L + T, W / 2, 0, Math.PI / 2);

  if (config.drip) {
    const dy = 0;
    const lipOut = 0.5 * SC;
    const lipDrop = 0.5 * SC;

    function addDrip(len: number, ox: number, oz: number, ix: number, iz: number) {
      const g = new THREE.BufferGeometry();
      let tx = 0;
      let tz = 0;
      if (Math.abs(ix) > 0.5) {
        tz = 1;
      } else {
        tx = 1;
      }

      const hl = len / 2;
      const t0x = ox - tx * hl;
      const t0z = oz - tz * hl;
      const t1x = ox + tx * hl;
      const t1z = oz + tz * hl;
      const topY = dy;

      const btmY = dy - lipDrop;
      const b0x = t0x - ix * lipOut - tx * lipOut;
      const b0z = t0z - iz * lipOut - tz * lipOut;
      const b1x = t1x - ix * lipOut + tx * lipOut;
      const b1z = t1z - iz * lipOut + tz * lipOut;

      g.setAttribute('position', new THREE.Float32BufferAttribute([
        t0x, topY, t0z, t1x, topY, t1z,
        b0x, btmY, b0z, b1x, btmY, b1z,
      ], 3));
      g.setIndex([0, 2, 1, 1, 2, 3]);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat.clone());
      (m.material as THREE.Material).side = THREE.DoubleSide;
      m.castShadow = true;
      grp.add(m);
    }

    addDrip(W + T, 0, L / 2, 0, -1);
    addDrip(W + T, 0, -L / 2, 0, 1);
    addDrip(L + T, -W / 2, 0, 1, 0);
    addDrip(L + T, W / 2, 0, -1, 0);
  }
}

export function buildCollarForHole(
  grp: THREE.Group,
  hole: HoleWorldData,
  config: ConfigState,
  mat: THREE.Material
) {
  const W = config.w * SC;
  const L = config.l * SC;
  const skH = config.sk * SC;
  const T = (GAUGE_THICKNESS[config.gauge] || 0.0239) * SC;
  const SLOPE = config.diag ? getDiagonalSlopeRise(W, L) : 0;
  const localRoofY = config.diag ? SLOPE * (1 - Math.max(Math.abs(hole.wx / (W / 2)), Math.abs(hole.wz / (L / 2)))) : 0;
  const topY = skH + localRoofY + hole.h;
  const roofSurfaceY = (absPx: number, absPz: number) => {
    if (!config.diag) return skH;
    const npx = absPx / (W / 2);
    const npz = absPz / (L / 2);
    const d = Math.max(Math.abs(npx), Math.abs(npz));
    return skH + SLOPE * (1 - d);
  };

  if (hole.shape === 'rect') {
    buildRectangularCollar(grp, hole, config, mat, T, topY, roofSurfaceY);
    return;
  }

  buildRoundCollar(grp, hole, config, mat, T, skH, localRoofY, topY, roofSurfaceY);
}

function buildRoundCollar(
  grp: THREE.Group,
  hole: HoleWorldData,
  config: ConfigState,
  mat: THREE.Material,
  T: number,
  skH: number,
  localRoofY: number,
  topY: number,
  roofSurfaceY: (absPx: number, absPz: number) => number
) {
  const collarCfg = getCollarConfig(hole.id, config);
  const stormEnabled = collarCfg.stormCollar;
  const stormTopR = Math.max(T * 2, hole.radius - 0.5 * SC);
  const collarR = stormEnabled ? stormTopR : hole.radius;
  const outerR = collarR + T * 0.5;
  const innerR = Math.max(T * 1.2, collarR - T * 0.5);
  const COLLAR_SEGS = 48;
  const colVerts: number[] = [];
  const colIdx: number[] = [];

  for (let i = 0; i < COLLAR_SEGS; i++) {
    const a = (i / COLLAR_SEGS) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);

    const outerPx = cos * outerR;
    const outerPz = sin * outerR;
    const innerPx = cos * innerR;
    const innerPz = sin * innerR;

    const outerBottomY = roofSurfaceY(hole.wx + outerPx, hole.wz + outerPz) - 0.002;
    const innerBottomY = roofSurfaceY(hole.wx + innerPx, hole.wz + innerPz) - 0.002;

    colVerts.push(
      outerPx, topY, outerPz,
      outerPx, outerBottomY, outerPz,
      innerPx, topY, innerPz,
      innerPx, innerBottomY, innerPz
    );
  }

  for (let i = 0; i < COLLAR_SEGS; i++) {
    const cur = i * 4;
    const next = ((i + 1) % COLLAR_SEGS) * 4;

    colIdx.push(cur, next, cur + 1);
    colIdx.push(next, next + 1, cur + 1);
    colIdx.push(cur + 2, cur + 3, next + 2);
    colIdx.push(next + 2, cur + 3, next + 3);
    colIdx.push(cur, cur + 2, next);
    colIdx.push(next, cur + 2, next + 2);
  }

  const cGeo = new THREE.BufferGeometry();
  cGeo.setAttribute('position', new THREE.Float32BufferAttribute(colVerts, 3));
  cGeo.setIndex(colIdx);
  cGeo.computeVertexNormals();

  const cMat = mat.clone();
  cMat.side = THREE.DoubleSide;
  const cMesh = new THREE.Mesh(cGeo, cMat);
  cMesh.castShadow = true;
  grp.add(cMesh);

  const lo = outerR + T * 0.5;
  const li = innerR;
  const rG = new THREE.RingGeometry(li, lo, 32);
  const rm = new THREE.Mesh(rG, mat.clone());
  rm.rotation.x = -Math.PI / 2;
  rm.position.set(0, topY + 0.001, 0);
  grp.add(rm);

  if (!stormEnabled) return;

  const baseY = skH + localRoofY;
  const holeDiaInches = (hole.radius * 2) / SC;
  const stormFlareInches = holeDiaInches >= 5
    ? 3
    : THREE.MathUtils.lerp(1.75, 3, Math.max(0, Math.min(1, holeDiaInches - 4)));
  const stormBotR = hole.radius + stormFlareInches * SC;
  const stormH = STORM_COLLAR_HEIGHT_INCHES * SC;
  const seamCenterAngle = Math.PI / 2;
  const seamGap = 0.12 * SC;
  const coneGapAngle = Math.min(Math.PI / 20, seamGap / Math.max(stormBotR, 0.001));
  const coneThetaStart = seamCenterAngle + coneGapAngle / 2;
  const coneThetaLength = Math.PI * 2 - coneGapAngle;

  const otherHoles: HoleWorldData[] = [];
  if (config.holes >= 1 && hole.id !== 'A') otherHoles.push(holeWorld('A', config));
  if (config.holes >= 2 && hole.id !== 'B') otherHoles.push(holeWorld('B', config));
  if (config.holes === 3 && hole.id !== 'C') otherHoles.push(holeWorld('C', config));

  function getStormRayLimit(dirX: number, dirZ: number) {
    const collarClearance = 0.05 * SC;
    let limit = stormBotR;

    for (const other of otherHoles) {
      const otherCfg = getCollarConfig(other.id, config);

      if (other.shape === 'round') {
        const otherStormTopR = otherCfg.stormCollar ? Math.max(T * 2, other.radius - 0.5 * SC) : other.radius;
        const otherOuterR = otherStormTopR + T * 0.5 + collarClearance;
        const hit = rayCircleHitDistance(hole.wx, hole.wz, dirX, dirZ, other.wx, other.wz, otherOuterR);
        if (hit !== null) limit = Math.min(limit, hit);
      } else {
        const otherOuterHalfX = other.halfX + T * 0.5 + collarClearance;
        const otherOuterHalfZ = other.halfZ + T * 0.5 + collarClearance;
        const hit = rayRectHitDistance(hole.wx, hole.wz, dirX, dirZ, other.wx, other.wz, otherOuterHalfX, otherOuterHalfZ);
        if (hit !== null) limit = Math.min(limit, hit);
      }
    }

    return Math.max(0, limit);
  }

  const stormSegs = 64;
  const stormRows = 12;
  const rowStride = stormRows + 1;
  const stormLift = 0.0004;
  const coneVerts: number[] = [];
  const coneIdx: number[] = [];

  for (let i = 0; i <= stormSegs; i++) {
    const angleT = i / stormSegs;
    const a = coneThetaStart + coneThetaLength * angleT;
    const dirX = Math.cos(a);
    const dirZ = Math.sin(a);
    const allowedR = getStormRayLimit(dirX, dirZ);
    const bottomY = roofSurfaceY(hole.wx + dirX * allowedR, hole.wz + dirZ * allowedR) + stormLift;

    for (let row = 0; row <= stormRows; row++) {
      const rowT = row / stormRows;
      const rawR = THREE.MathUtils.lerp(stormTopR, stormBotR, rowT);
      const clippedR = Math.min(rawR, allowedR);
      const px = dirX * clippedR;
      const pz = dirZ * clippedR;
      const py = THREE.MathUtils.lerp(baseY + stormH, bottomY, rowT);
      coneVerts.push(px, py, pz);
    }
  }

  for (let i = 0; i < stormSegs; i++) {
    for (let row = 0; row < stormRows; row++) {
      const cur = i * rowStride + row;
      const next = (i + 1) * rowStride + row;
      coneIdx.push(cur, next, cur + 1);
      coneIdx.push(next, next + 1, cur + 1);
    }
  }

  const coneGeo = new THREE.BufferGeometry();
  coneGeo.setAttribute('position', new THREE.Float32BufferAttribute(coneVerts, 3));
  coneGeo.setIndex(coneIdx);
  coneGeo.computeVertexNormals();
  const coneMat = (mat as THREE.MeshStandardMaterial).clone();
  coneMat.side = THREE.DoubleSide;
  const coneMesh = new THREE.Mesh(coneGeo, coneMat);
  coneMesh.castShadow = true;
  grp.add(coneMesh);

  const bandH = 0.18 * SC;
  const bandR = stormTopR + T * 1.1;
  const bandGapAngle = Math.min(Math.PI / 16, seamGap * 0.9 / Math.max(bandR, 0.001));
  const bandGeo = new THREE.CylinderGeometry(
    bandR,
    bandR,
    bandH,
    64,
    1,
    true,
    seamCenterAngle + bandGapAngle / 2,
    Math.PI * 2 - bandGapAngle
  );
  const bandMat = (mat as THREE.MeshStandardMaterial).clone();
  bandMat.metalness = Math.min(1, bandMat.metalness + 0.06);
  bandMat.roughness = Math.max(0.12, bandMat.roughness - 0.05);
  const bandMesh = new THREE.Mesh(bandGeo, bandMat);
  bandMesh.position.set(0, baseY + stormH - bandH / 2 + 0.01 * SC, 0);
  bandMesh.castShadow = true;
  grp.add(bandMesh);

  const hardwareGroup = new THREE.Group();
  hardwareGroup.rotation.y = -seamCenterAngle;
  grp.add(hardwareGroup);

  const hardwareT = 0.58;
  const hardwareY = baseY + stormH * hardwareT;
  const hardwareR = THREE.MathUtils.lerp(stormBotR, stormTopR, hardwareT);

  const strapThickness = 0.05 * SC;
  const strapHeight = 0.9 * SC;
  const strapWidth = 0.22 * SC;
  const strapX = hardwareR + strapThickness / 2 + T * 0.3;
  const strapZ = seamGap / 2 + strapWidth / 2 - 0.015 * SC;
  const strapGeo = new THREE.BoxGeometry(strapThickness, strapHeight, strapWidth);

  const strapFront = new THREE.Mesh(strapGeo, bandMat.clone());
  strapFront.position.set(strapX, hardwareY, strapZ);
  strapFront.castShadow = true;
  hardwareGroup.add(strapFront);

  const strapBack = new THREE.Mesh(strapGeo, bandMat.clone());
  strapBack.position.set(strapX, hardwareY, -strapZ);
  strapBack.castShadow = true;
  hardwareGroup.add(strapBack);

  const bridgePlateGeo = new THREE.BoxGeometry(strapThickness * 0.85, 0.12 * SC, seamGap + strapWidth * 1.2);
  const bridgePlate = new THREE.Mesh(bridgePlateGeo, bandMat.clone());
  bridgePlate.position.set(strapX - strapThickness * 0.08, hardwareY - strapHeight * 0.16, 0);
  bridgePlate.castShadow = true;
  hardwareGroup.add(bridgePlate);

  const sleeveRadius = 0.1 * SC;
  const sleeveLength = seamGap + 0.12 * SC;
  const sleeveGeo = new THREE.CylinderGeometry(sleeveRadius, sleeveRadius, sleeveLength, 20);
  const sleeveMat = bandMat.clone();
  sleeveMat.roughness = Math.max(0.18, sleeveMat.roughness - 0.04);
  const sleeveMesh = new THREE.Mesh(sleeveGeo, sleeveMat);
  sleeveMesh.rotation.x = Math.PI / 2;
  sleeveMesh.position.set(strapX - strapThickness * 0.1, hardwareY + strapHeight * 0.06, 0);
  sleeveMesh.castShadow = true;
  hardwareGroup.add(sleeveMesh);

  const boltRadius = 0.055 * SC;
  const boltLength = seamGap + strapWidth * 2 + 0.22 * SC;
  const boltY = hardwareY + strapHeight * 0.06;
  const boltGeo = new THREE.CylinderGeometry(boltRadius, boltRadius, boltLength, 18);
  const boltMat = bandMat.clone();
  boltMat.metalness = Math.min(1, boltMat.metalness + 0.08);
  boltMat.roughness = Math.max(0.1, boltMat.roughness - 0.08);
  const boltMesh = new THREE.Mesh(boltGeo, boltMat);
  boltMesh.rotation.x = Math.PI / 2;
  boltMesh.position.set(strapX, boltY, 0);
  boltMesh.castShadow = true;
  hardwareGroup.add(boltMesh);

  const washerRadius = 0.11 * SC;
  const washerThickness = 0.035 * SC;
  const washerGeo = new THREE.CylinderGeometry(washerRadius, washerRadius, washerThickness, 24);
  const washerOffset = seamGap / 2 + strapWidth + washerThickness;

  const washerFront = new THREE.Mesh(washerGeo, boltMat.clone());
  washerFront.rotation.x = Math.PI / 2;
  washerFront.position.set(strapX, boltY, washerOffset);
  washerFront.castShadow = true;
  hardwareGroup.add(washerFront);

  const washerBack = new THREE.Mesh(washerGeo, boltMat.clone());
  washerBack.rotation.x = Math.PI / 2;
  washerBack.position.set(strapX, boltY, -washerOffset);
  washerBack.castShadow = true;
  hardwareGroup.add(washerBack);

  const headRadius = 0.16 * SC;
  const headLength = 0.12 * SC;
  const headGeo = new THREE.CylinderGeometry(headRadius, headRadius, headLength, 6);
  const headMesh = new THREE.Mesh(headGeo, boltMat.clone());
  headMesh.rotation.x = Math.PI / 2;
  headMesh.rotation.z = Math.PI / 6;
  headMesh.position.set(strapX, boltY, washerOffset + headLength * 0.7);
  headMesh.castShadow = true;
  hardwareGroup.add(headMesh);

  const nutRadius = 0.15 * SC;
  const nutLength = 0.14 * SC;
  const nutGeo = new THREE.CylinderGeometry(nutRadius, nutRadius, nutLength, 6);
  const nutMesh = new THREE.Mesh(nutGeo, boltMat.clone());
  nutMesh.rotation.x = Math.PI / 2;
  nutMesh.rotation.z = Math.PI / 6;
  nutMesh.position.set(strapX, boltY, -(washerOffset + nutLength * 0.7));
  nutMesh.castShadow = true;
  hardwareGroup.add(nutMesh);
}

function buildRectangularCollar(
  grp: THREE.Group,
  hole: HoleWorldData,
  _config: ConfigState,
  mat: THREE.Material,
  T: number,
  topY: number,
  roofSurfaceY: (absPx: number, absPz: number) => number
) {
  const outerHalfX = hole.halfX + T * 0.5;
  const outerHalfZ = hole.halfZ + T * 0.5;
  const innerHalfX = Math.max(T * 1.2, hole.halfX - T * 0.5);
  const innerHalfZ = Math.max(T * 1.2, hole.halfZ - T * 0.5);
  const panelMat = mat.clone();
  panelMat.side = THREE.DoubleSide;

  function addPanel(points: Array<[number, number]>) {
    const [p0, p1] = points;
    const bottom0 = roofSurfaceY(hole.wx + p0[0], hole.wz + p0[1]) - 0.002;
    const bottom1 = roofSurfaceY(hole.wx + p1[0], hole.wz + p1[1]) - 0.002;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      p0[0], topY, p0[1],
      p1[0], topY, p1[1],
      p1[0], bottom1, p1[1],
      p0[0], bottom0, p0[1],
    ], 3));
    geo.setIndex([0, 1, 3, 1, 2, 3]);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, panelMat.clone());
    mesh.castShadow = true;
    grp.add(mesh);
  }

  addPanel([[-outerHalfX, -outerHalfZ], [outerHalfX, -outerHalfZ]]);
  addPanel([[outerHalfX, -outerHalfZ], [outerHalfX, outerHalfZ]]);
  addPanel([[outerHalfX, outerHalfZ], [-outerHalfX, outerHalfZ]]);
  addPanel([[-outerHalfX, outerHalfZ], [-outerHalfX, -outerHalfZ]]);

  addPanel([[-innerHalfX, -innerHalfZ], [-innerHalfX, innerHalfZ]]);
  addPanel([[-innerHalfX, innerHalfZ], [innerHalfX, innerHalfZ]]);
  addPanel([[innerHalfX, innerHalfZ], [innerHalfX, -innerHalfZ]]);
  addPanel([[innerHalfX, -innerHalfZ], [-innerHalfX, -innerHalfZ]]);

  const rimShape = new THREE.Shape();
  rimShape.moveTo(-outerHalfX, -outerHalfZ);
  rimShape.lineTo(outerHalfX, -outerHalfZ);
  rimShape.lineTo(outerHalfX, outerHalfZ);
  rimShape.lineTo(-outerHalfX, outerHalfZ);
  rimShape.closePath();

  const innerPath = new THREE.Path();
  innerPath.moveTo(-innerHalfX, -innerHalfZ);
  innerPath.lineTo(-innerHalfX, innerHalfZ);
  innerPath.lineTo(innerHalfX, innerHalfZ);
  innerPath.lineTo(innerHalfX, -innerHalfZ);
  innerPath.closePath();
  rimShape.holes.push(innerPath);

  const rimGeo = new THREE.ShapeGeometry(rimShape);
  const rimMesh = new THREE.Mesh(rimGeo, mat.clone());
  rimMesh.rotation.x = -Math.PI / 2;
  rimMesh.position.set(0, topY + 0.001, 0);
  rimMesh.castShadow = true;
  grp.add(rimMesh);
}

function buildFlatTop(W: number, L: number, skH: number, T: number, holes: HoleWorldData[], mat: THREE.Material, grp: THREE.Group) {
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, -L / 2);
  shape.lineTo(W / 2, -L / 2);
  shape.lineTo(W / 2, L / 2);
  shape.lineTo(-W / 2, L / 2);
  shape.closePath();

  for (const h of holes) {
    const sx = h.wx;
    const sy = -h.wz;
    const hp = new THREE.Path();

    if (h.shape === 'round') {
      for (let j = 0; j <= 32; j++) {
        const a = (j / 32) * Math.PI * 2;
        const hx = sx + Math.cos(a) * h.radius;
        const hy = sy + Math.sin(a) * h.radius;
        if (j === 0) hp.moveTo(hx, hy);
        else hp.lineTo(hx, hy);
      }
    } else {
      hp.moveTo(sx - h.halfX, sy - h.halfZ);
      hp.lineTo(sx + h.halfX, sy - h.halfZ);
      hp.lineTo(sx + h.halfX, sy + h.halfZ);
      hp.lineTo(sx - h.halfX, sy + h.halfZ);
      hp.closePath();
    }

    shape.holes.push(hp);
  }

  const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 32 });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = skH;
  m.castShadow = true;
  m.receiveShadow = true;
  grp.add(m);
}

function buildSlopedTop(W: number, L: number, skH: number, T: number, SLOPE: number, holes: HoleWorldData[], mat: THREE.Material, grp: THREE.Group) {
  const hw = W / 2;
  const hl = L / 2;
  const edgeY = skH;
  const thickness = T;
  const pts = [
    0, edgeY + SLOPE, 0,
    -hw, edgeY, -hl,
    hw, edgeY, -hl,
    hw, edgeY, hl,
    -hw, edgeY, hl,
    0, edgeY + SLOPE - thickness, 0,
    -hw, edgeY - thickness, -hl,
    hw, edgeY - thickness, -hl,
    hw, edgeY - thickness, hl,
    -hw, edgeY - thickness, hl,
  ];

  const indices = [
    0, 2, 1,
    0, 3, 2,
    0, 4, 3,
    0, 1, 4,
    5, 6, 7,
    5, 7, 8,
    5, 8, 9,
    5, 9, 6,
    1, 2, 7, 1, 7, 6,
    2, 3, 8, 2, 8, 7,
    3, 4, 9, 3, 9, 8,
    4, 1, 6, 4, 6, 9,
  ];

  let topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  topGeo.setIndex(indices);
  topGeo = topGeo.toNonIndexed();
  topGeo.computeVertexNormals();

  const baseMat = mat.clone();
  baseMat.side = THREE.DoubleSide;

  let csgTop = CSG.fromMesh(new THREE.Mesh(topGeo, baseMat));

  for (const h of holes) {
    const cutH = SLOPE + 10;
    const cutterGeo = h.shape === 'round'
      ? new THREE.CylinderGeometry(h.radius, h.radius, cutH, 32)
      : new THREE.BoxGeometry(h.sizeX, cutH, h.sizeZ);
    const cutterMesh = new THREE.Mesh(cutterGeo);
    cutterMesh.position.set(h.wx, edgeY + SLOPE / 2, h.wz);
    cutterMesh.updateMatrixWorld();
    csgTop = csgTop.subtract(CSG.fromMesh(cutterMesh));
  }

  const finalTopMesh = CSG.toMesh(csgTop, new THREE.Matrix4(), baseMat);
  finalTopMesh.castShadow = true;
  finalTopMesh.receiveShadow = true;
  grp.add(finalTopMesh);
}
