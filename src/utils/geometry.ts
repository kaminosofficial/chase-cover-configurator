import * as THREE from 'three';
import { CSG } from 'three-csg-ts';
import type { ConfigState, CollarState } from '../store/configStore';

export const SC = 0.02; // world units per inch
export const MIN_GAP_INCHES = 1; // minimum 1 inch gap between holes
export const STORM_COLLAR_HEIGHT_INCHES = 2.5;
export const MAX_DIAGONAL_RISE_INCHES = 0.75;

export function mkMat(
    mat: 'galvanized' | 'copper',
    pc: boolean,
    pcCol: string
): THREE.MeshStandardMaterial {
    if (pc) return new THREE.MeshStandardMaterial({ color: pcCol, metalness: 0.3, roughness: 0.6 });
    if (mat === 'copper') return new THREE.MeshStandardMaterial({ color: '#e09a72', metalness: 0.85, roughness: 0.15, envMapIntensity: 1.2 });
    return new THREE.MeshStandardMaterial({ color: '#b8c4cc', metalness: 0.9, roughness: 0.25 });
}

const GAUGE_THICKNESS: Record<number, number> = {
    10: 0.1345, 12: 0.1046, 14: 0.0747,
    16: 0.0598, 18: 0.0478, 20: 0.0359, 24: 0.0239
};

function getCollarConfig(id: 'A' | 'B' | 'C', config: ConfigState): CollarState {
    if (id === 'A') return config.collarA;
    if (id === 'B') return config.collarB;
    return config.collarC;
}

export function holeR(id: 'A' | 'B' | 'C', config: ConfigState): number {
    return (getCollarConfig(id, config).dia / 2) * SC;
}

export function colH(id: 'A' | 'B' | 'C', config: ConfigState): number {
    return getCollarConfig(id, config).height * SC;
}

export function getDiagonalSlopeRise(W: number, L: number): number {
    return Math.min(Math.sqrt(W * W + L * L) * 0.015, MAX_DIAGONAL_RISE_INCHES * SC);
}

export function holeWorld(id: 'A' | 'B' | 'C', config: ConfigState): { wx: number; wz: number; r: number; h: number; id: string } {
    const collar = getCollarConfig(id, config);
    const r = holeR(id, config);
    const h = colH(id, config);

    // Safety clamp: ensure hole edge stays within cover boundaries
    const halfW = (config.w / 2) * SC;
    const halfL = (config.l / 2) * SC;

    if (collar.centered) {
        if (config.holes === 1) return { wx: 0, wz: 0, r, h, id };

        // Fixed-position centered layout:
        // Each hole gets a fixed slot that does NOT depend on other holes' diameters.
        // This ensures changing one hole's diameter never moves another hole.
        // The maxDia constraint in CollarGroup prevents overlap.

        if (config.holes === 2) {
            // A at +L/4, B at -L/4 (fixed positions)
            const slotPos = halfL / 2; // L/4 in world units
            if (id === 'A') return { wx: 0, wz: slotPos, r, h, id };
            if (id === 'B') return { wx: 0, wz: -slotPos, r, h, id };
        }

        if (config.holes === 3) {
            // A at +L/3, B at center, C at -L/3 (fixed positions)
            const slotPos = (2 * halfL) / 3; // L/3 in world units
            if (id === 'A') return { wx: 0, wz: slotPos, r, h, id };
            if (id === 'B') return { wx: 0, wz: 0, r, h, id };
            if (id === 'C') return { wx: 0, wz: -slotPos, r, h, id };
        }
    }

    // Uses offset1 as distance from bottom edge (Width / 2)
    // Uses offset2 as distance from left edge (Length / 2)
    let cz = (config.l / 2 - collar.offset2) * SC - r;
    let cx = (config.w / 2 - collar.offset1) * SC - r;

    // Clamp to cover boundaries (safety net for manual offset mode)
    cx = Math.max(-halfW + r, Math.min(halfW - r, cx));
    cz = Math.max(-halfL + r, Math.min(halfL - r, cz));

    return { wx: cx, wz: cz, r, h, id };
}

export function clampDragToOffsets(id: 'A' | 'B' | 'C', cx: number, cz: number, config: ConfigState) {
    const collar = id === 'A' ? config.collarA : id === 'B' ? config.collarB : config.collarC;
    const collarKey = id === 'A' ? 'collarA' : id === 'B' ? 'collarB' : 'collarC';
    const r = (collar.dia / 2) * SC;
    const maxOffset1 = Math.max(0, config.w - collar.dia);
    const maxOffset2 = Math.max(0, config.l - collar.dia);

    const otherIds: ('A'|'B'|'C')[] = [];
    if (config.holes >= 1 && id !== 'A') otherIds.push('A');
    if (config.holes >= 2 && id !== 'B') otherIds.push('B');
    if (config.holes === 3 && id !== 'C') otherIds.push('C');

    const maxCx = (config.w / 2) * SC - r;
    const minCx = (-config.w / 2) * SC + r;
    const maxCz = (config.l / 2) * SC - r;
    const minCz = (-config.l / 2) * SC + r;
    const clampX = (value: number) => Math.max(minCx, Math.min(maxCx, value));
    const clampZ = (value: number) => Math.max(minCz, Math.min(maxCz, value));

    let safeCx = clampX(cx);
    let safeCz = clampZ(cz);

    for (let pass = 0; pass < 8; pass++) {
        let anyCollision = false;

        for (const otherId of otherIds) {
            const other = holeWorld(otherId, config);
            const dx = safeCx - other.wx;
            const dz = safeCz - other.wz;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const minDist = r + other.r + MIN_GAP_INCHES * SC;

            if (dist < minDist - 0.0005) {
                anyCollision = true;

                if (dist < 0.0005) {
                    const directions: Array<[number, number]> = id > otherId
                        ? [[1, 0], [0, 1], [-1, 0], [0, -1]]
                        : [[-1, 0], [0, -1], [1, 0], [0, 1]];
                    let bestCx = safeCx;
                    let bestCz = safeCz;
                    let bestDist = -1;
                    let bestError = Number.POSITIVE_INFINITY;

                    for (const [nx, nz] of directions) {
                        const candidateCx = clampX(other.wx + nx * minDist);
                        const candidateCz = clampZ(other.wz + nz * minDist);
                        const candidateDx = candidateCx - other.wx;
                        const candidateDz = candidateCz - other.wz;
                        const candidateDist = Math.sqrt(candidateDx * candidateDx + candidateDz * candidateDz);
                        const candidateError = Math.sqrt((candidateCx - safeCx) * (candidateCx - safeCx) + (candidateCz - safeCz) * (candidateCz - safeCz));

                        if (candidateDist > bestDist + 0.0005 || (Math.abs(candidateDist - bestDist) <= 0.0005 && candidateError < bestError)) {
                            bestCx = candidateCx;
                            bestCz = candidateCz;
                            bestDist = candidateDist;
                            bestError = candidateError;
                        }
                    }

                    safeCx = bestCx;
                    safeCz = bestCz;
                } else {
                    const scale = minDist / dist;
                    safeCx = clampX(other.wx + dx * scale);
                    safeCz = clampZ(other.wz + dz * scale);
                }
            }
        }

        if (!anyCollision) break;
    }

    let offset1 = config.w / 2 - (safeCx + r) / SC;
    let offset2 = config.l / 2 - (safeCz + r) / SC;

    offset1 = Math.max(0, Math.min(maxOffset1, Math.round(offset1 * 8) / 8));
    offset2 = Math.max(0, Math.min(maxOffset2, Math.round(offset2 * 8) / 8));

    const offset3 = Math.max(0, Math.min(maxOffset1, config.w - collar.dia - offset1));
    const offset4 = Math.max(0, Math.min(maxOffset2, config.l - collar.dia - offset2));

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
        const dx = snappedHole.wx - other.wx;
        const dz = snappedHole.wz - other.wz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = snappedHole.r + other.r + MIN_GAP_INCHES * SC;
        if (dist < minDist - 0.0005) {
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
    const T = (GAUGE_THICKNESS[config.gauge] || 0.0478) * SC;
    const SLOPE = config.diag ? getDiagonalSlopeRise(W, L) : 0;

    const mat = mkMat(config.mat, config.pc, config.pcCol);

    const holes: ReturnType<typeof holeWorld>[] = [];
    if (config.holes >= 1) holes.push(holeWorld('A', config));
    if (config.holes >= 2) holes.push(holeWorld('B', config));
    if (config.holes === 3) holes.push(holeWorld('C', config));

    if (config.diag) {
        buildSlopedTop(W, L, skH, T, SLOPE, holes, mat, grp);
    } else {
        buildFlatTop(W, L, skH, T, holes, mat, grp);
    }

    // Skirt
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

    // Drip Edge â€” 0.5" outward at 45 degrees
    if (config.drip) {
        const dy = 0;
        const lipOut = 0.5 * SC;  // 0.5 inch horizontal extension
        const lipDrop = 0.5 * SC; // 0.5 inch vertical drop â†’ 45Â° angle

        function addDrip(len: number, ox: number, oz: number, ix: number, iz: number) {
            const g = new THREE.BufferGeometry();
            let tx = 0, tz = 0;
            if (Math.abs(ix) > 0.5) { tx = 0; tz = 1; } else { tx = 1; tz = 0; }
            const hl = len / 2;

            const t0x = ox - tx * hl, t0z = oz - tz * hl;
            const t1x = ox + tx * hl, t1z = oz + tz * hl;
            const topY = dy;

            const btmY = dy - lipDrop;
            const b0x = t0x - ix * lipOut - tx * lipOut, b0z = t0z - iz * lipOut - tz * lipOut;
            const b1x = t1x - ix * lipOut + tx * lipOut, b1z = t1z - iz * lipOut + tz * lipOut;

            g.setAttribute('position', new THREE.Float32BufferAttribute([
                t0x, topY, t0z, t1x, topY, t1z,
                b0x, btmY, b0z, b1x, btmY, b1z,
            ], 3));
            g.setIndex([0, 2, 1, 1, 2, 3]);
            g.computeVertexNormals();
            const m = new THREE.Mesh(g, mat.clone());
            m.material.side = THREE.DoubleSide;
            m.castShadow = true;
            grp.add(m);
        }

        addDrip(W + T, 0, L / 2, 0, -1);
        addDrip(W + T, 0, -L / 2, 0, 1);
        addDrip(L + T, -W / 2, 0, 1, 0);
        addDrip(L + T, W / 2, 0, -1, 0);
    }

    // Note: Collars are now built separately to allow TransformControls
}

export function buildCollarForHole(
    grp: THREE.Group,
    hole: ReturnType<typeof holeWorld>,
    config: ConfigState,
    mat: THREE.Material
) {
    const W = config.w * SC;
    const L = config.l * SC;
    const skH = config.sk * SC;
    const T = (GAUGE_THICKNESS[config.gauge] || 0.0478) * SC;
    const SLOPE = config.diag ? getDiagonalSlopeRise(W, L) : 0;

    const COLLAR_SEGS = 48;
    const localRoofY = config.diag ? SLOPE * (1 - Math.max(Math.abs(hole.wx / (W / 2)), Math.abs(hole.wz / (L / 2)))) : 0;
    const topY = skH + localRoofY + hole.h;
    const roofSurfaceY = (absPx: number, absPz: number) => {
        if (!config.diag) return skH;
        const npx = absPx / (W / 2);
        const npz = absPz / (L / 2);
        const d = Math.max(Math.abs(npx), Math.abs(npz));
        return skH + SLOPE * (1 - d);
    };

    // Determine collar config and whether storm collar is active
    const collarCfg = hole.id === 'A' ? config.collarA : hole.id === 'B' ? config.collarB : config.collarC;
    const stormEnabled = collarCfg.stormCollar;

    // Storm cone top radius = 1" smaller than hole radius (0.5" smaller per side)
    const stormTopR = Math.max(T * 2, hole.r - 0.5 * SC);
    // When storm collar is enabled, the collar cylinder narrows to match the cone top seamlessly
    const collarR = stormEnabled ? stormTopR : hole.r;

    const colVerts: number[] = [];
    const colIdx: number[] = [];

    for (let i = 0; i < COLLAR_SEGS; i++) {
        const a = (i / COLLAR_SEGS) * Math.PI * 2;
        // Generate relative to hole center (0, 0) since group position handles translation
        const px = Math.cos(a) * collarR;
        const pz = Math.sin(a) * collarR;

        // For the bottom Y, find the roof height at the ABSOLUTE position
        const absPx = hole.wx + px;
        const absPz = hole.wz + pz;

        const btmY = roofSurfaceY(absPx, absPz) - 0.002;

        colVerts.push(px, topY, pz);
        colVerts.push(px, btmY, pz);
    }

    for (let i = 0; i < COLLAR_SEGS; i++) {
        const cur = i * 2;
        const next = ((i + 1) % COLLAR_SEGS) * 2;
        colIdx.push(cur, next, cur + 1);
        colIdx.push(next, next + 1, cur + 1);
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

    // Top ring cap for the collar
    const lo = collarR + T;
    const li = collarR - T * 0.5;
    const rG = new THREE.RingGeometry(li, lo, 32);
    const rm = new THREE.Mesh(rG, mat.clone());
    rm.rotation.x = -Math.PI / 2;
    rm.position.set(0, topY + 0.001, 0);
    grp.add(rm);

    // Storm collar: conical flashing at the base of the collar
    if (stormEnabled) {
        const baseY = skH + localRoofY; // cover surface at this hole's location

        // Bottom of cone: flares out ~3" beyond the hole edge
        const stormBotR = hole.r + 3 * SC;
        // Height: fixed at 2.5 inches
        const stormH = STORM_COLLAR_HEIGHT_INCHES * SC;
        const seamCenterAngle = Math.PI / 2;
        const seamGap = 0.12 * SC;
        const coneGapAngle = Math.min(Math.PI / 20, seamGap / Math.max(stormBotR, 0.001));
        const coneThetaStart = seamCenterAngle + coneGapAngle / 2;
        const coneThetaLength = Math.PI * 2 - coneGapAngle;

        // Build the storm collar as a roof-following frustum so it never pokes through the cover from below.
        const stormSegs = 64;
        const stormLift = 0.0004;
        const coneVerts: number[] = [];
        const coneIdx: number[] = [];

        for (let i = 0; i <= stormSegs; i++) {
            const t = i / stormSegs;
            const a = coneThetaStart + coneThetaLength * t;
            const topPx = Math.cos(a) * stormTopR;
            const topPz = Math.sin(a) * stormTopR;
            const botPx = Math.cos(a) * stormBotR;
            const botPz = Math.sin(a) * stormBotR;
            const bottomY = roofSurfaceY(hole.wx + botPx, hole.wz + botPz) + stormLift;

            coneVerts.push(topPx, baseY + stormH, topPz);
            coneVerts.push(botPx, bottomY, botPz);
        }

        for (let i = 0; i < stormSegs; i++) {
            const cur = i * 2;
            const next = (i + 1) * 2;
            coneIdx.push(cur, next, cur + 1);
            coneIdx.push(next, next + 1, cur + 1);
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

        // Top band with a narrower split and mid-seam tightening hardware.
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
}


function buildFlatTop(W: number, L: number, skH: number, T: number, holes: any[], mat: THREE.Material, grp: THREE.Group) {
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, -L / 2);
    shape.lineTo(W / 2, -L / 2);
    shape.lineTo(W / 2, L / 2);
    shape.lineTo(-W / 2, L / 2);
    shape.closePath();

    for (const h of holes) {
        const sx = h.wx, sy = -h.wz;
        const hp = new THREE.Path();
        for (let j = 0; j <= 32; j++) {
            const a = (j / 32) * Math.PI * 2;
            const hx = sx + Math.cos(a) * h.r, hy = sy + Math.sin(a) * h.r;
            j === 0 ? hp.moveTo(hx, hy) : hp.lineTo(hx, hy);
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

function buildSlopedTop(W: number, L: number, skH: number, T: number, SLOPE: number, holes: any[], mat: THREE.Material, grp: THREE.Group) {
    const hw = W / 2, hl = L / 2;
    const edgeY = skH;

    const thickness = T; // Use actual gauge thickness
    const pts = [
        // Top surface vertices
        0, edgeY + SLOPE, 0, // 0: Peak
        -hw, edgeY, -hl,     // 1: Top Left
        hw, edgeY, -hl,      // 2: Top Right
        hw, edgeY, hl,       // 3: Bottom Right
        -hw, edgeY, hl,      // 4: Bottom Left
        // Bottom surface vertices (shifted down by thickness)
        0, edgeY + SLOPE - thickness, 0, // 5: BPeak
        -hw, edgeY - thickness, -hl,     // 6: BTL
        hw, edgeY - thickness, -hl,      // 7: BTR
        hw, edgeY - thickness, hl,       // 8: BBR
        -hw, edgeY - thickness, hl       // 9: BBL
    ];

    const indices = [
        0, 2, 1, // Top Back
        0, 3, 2, // Top Right
        0, 4, 3, // Top Front
        0, 1, 4, // Top Left
        // Bottom faces
        5, 6, 7, // Bottom Back
        5, 7, 8, // Bottom Right
        5, 8, 9, // Bottom Front
        5, 9, 6, // Bottom Left
        // Side walls (closing the thin edge)
        1, 2, 7, 1, 7, 6,
        2, 3, 8, 2, 8, 7,
        3, 4, 9, 3, 9, 8,
        4, 1, 6, 4, 6, 9
    ];

    let topGeo = new THREE.BufferGeometry();
    topGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    topGeo.setIndex(indices);
    topGeo = topGeo.toNonIndexed();
    topGeo.computeVertexNormals();

    const baseMat = mat.clone();
    baseMat.side = THREE.DoubleSide; // Safe rendering for CSG output

    let csgTop = CSG.fromMesh(new THREE.Mesh(topGeo, baseMat));

    for (const h of holes) {
        if (h.r > 0) {
            // Cut hole. Make cylinder taller than roof height to ensure full cut
            const cylH = SLOPE + 10;
            const cylGeo = new THREE.CylinderGeometry(h.r, h.r, cylH, 32); 
            const cylMesh = new THREE.Mesh(cylGeo);
            cylMesh.position.set(h.wx, edgeY + SLOPE / 2, h.wz);
            cylMesh.updateMatrixWorld();

            const csgHole = CSG.fromMesh(cylMesh);
            csgTop = csgTop.subtract(csgHole);
        }
    }

    const finalTopMesh = CSG.toMesh(csgTop, new THREE.Matrix4(), baseMat);
    finalTopMesh.castShadow = true;
    finalTopMesh.receiveShadow = true;
    grp.add(finalTopMesh);
}

