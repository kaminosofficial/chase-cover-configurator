import * as THREE from 'three';
import { CSG } from 'three-csg-ts';
import type { ConfigState, CollarState } from '../store/configStore';

export const SC = 0.02; // world units per inch
export const MIN_GAP_INCHES = 1; // minimum 1 inch gap between holes

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

export function holeWorld(id: 'A' | 'B' | 'C', config: ConfigState): { wx: number; wz: number; r: number; h: number; id: string } {
    const collar = getCollarConfig(id, config);
    const r = holeR(id, config);
    const h = colH(id, config);
    const MIN_GAP = MIN_GAP_INCHES * SC; // 1 inch minimum gap between holes

    if (collar.centered) {
        if (config.holes === 1) return { wx: 0, wz: 0, r, h, id };
        if (config.holes === 2) {
            const rA = (getCollarConfig('A', config).dia / 2) * SC;
            const rB = (getCollarConfig('B', config).dia / 2) * SC;
            const defaultSpacing = (config.l / 4) * SC;
            const minSpacing = rA + rB + MIN_GAP;
            const spacing = Math.max(defaultSpacing, minSpacing);
            if (id === 'A') return { wx: 0, wz: spacing, r, h, id };
            if (id === 'B') return { wx: 0, wz: -spacing, r, h, id };
        }
        if (config.holes === 3) {
            const rA = (getCollarConfig('A', config).dia / 2) * SC;
            const rB = (getCollarConfig('B', config).dia / 2) * SC;
            const rC = (getCollarConfig('C', config).dia / 2) * SC;
            const defaultAB = (config.l / 3) * SC;
            const defaultBC = (config.l / 3) * SC;
            const minAB = rA + rB + MIN_GAP;
            const minBC = rB + rC + MIN_GAP;
            const spacingAB = Math.max(defaultAB, minAB);
            const spacingBC = Math.max(defaultBC, minBC);
            if (id === 'A') return { wx: 0, wz: spacingAB, r, h, id };
            if (id === 'B') return { wx: 0, wz: 0, r, h, id };
            if (id === 'C') return { wx: 0, wz: -spacingBC, r, h, id };
        }
    }

    // Uses offset1 as distance from bottom edge (Width / 2)
    // Uses offset2 as distance from left edge (Length / 2)
    const cz = (config.l / 2 - collar.offset2) * SC - r;
    const cx = (config.w / 2 - collar.offset1) * SC - r;

    return { wx: cx, wz: cz, r, h, id };
}

export function clampDragToOffsets(id: 'A' | 'B' | 'C', cx: number, cz: number, config: ConfigState) {
    const collar = id === 'A' ? config.collarA : id === 'B' ? config.collarB : config.collarC;
    const r = (collar.dia / 2) * SC;
    
    // Other holes to check collisions against
    const otherIds: ('A'|'B'|'C')[] = [];
    if (config.holes >= 1 && id !== 'A') otherIds.push('A');
    if (config.holes >= 2 && id !== 'B') otherIds.push('B');
    if (config.holes === 3 && id !== 'C') otherIds.push('C');

    // Prevent passing cover boundaries
    // At wx = max Right, offset1 = 0 -> cx = w/2*SC - r
    // At wx = max Left, offset1 = max -> cx = -w/2*SC + r
    const maxCx = (config.w / 2) * SC - r;
    const minCx = (-config.w / 2) * SC + r;
    const maxCz = (config.l / 2) * SC - r;
    const minCz = (-config.l / 2) * SC + r;
    
    let safeCx = Math.max(minCx, Math.min(maxCx, cx));
    let safeCz = Math.max(minCz, Math.min(maxCz, cz));

    // Collision against other holes
    for (const otherId of otherIds) {
        const other = holeWorld(otherId, config);
        const dx = safeCx - other.wx;
        const dz = safeCz - other.wz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = r + other.r + MIN_GAP_INCHES * SC;

        if (dist < minDist && dist > 0.001) {
            // Push back along collision normal
            const scale = minDist / dist;
            safeCx = other.wx + dx * scale;
            safeCz = other.wz + dz * scale;
            // Re-clamp to boundaries just in case push-back pushed us off cover
            safeCx = Math.max(minCx, Math.min(maxCx, safeCx));
            safeCz = Math.max(minCz, Math.min(maxCz, safeCz));
        }
    }

    // Convert safe local coordinates back to offsets in inches
    // cx = (w/2 - offset1) * SC - r  => offset1 = w/2 - (cx + r)/SC
    // cz = (l/2 - offset2) * SC - r  => offset2 = l/2 - (cz + r)/SC
    let offset1 = config.w / 2 - (safeCx + r) / SC;
    let offset2 = config.l / 2 - (safeCz + r) / SC;
    
    // Snap to 1/8" increments
    offset1 = Math.max(0, Math.ceil(offset1 * 8) / 8);
    offset2 = Math.max(0, Math.ceil(offset2 * 8) / 8);
    
    const offset3 = Math.max(0, config.w - collar.dia - offset1);
    const offset4 = Math.max(0, config.l - collar.dia - offset2);

    return { offset1, offset2, offset3, offset4 };
}

export function buildCoverWithoutCollars(grp: THREE.Group, config: ConfigState) {
    const W = config.w * SC;
    const L = config.l * SC;
    const skH = config.sk * SC;
    const T = (GAUGE_THICKNESS[config.gauge] || 0.0478) * SC;
    const SLOPE = config.diag ? 0.75 * SC : 0; // fixed 3/4 inch rise from edges to peak

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

    // Drip Edge — 0.5" outward at 45 degrees
    if (config.drip) {
        const dy = 0;
        const lipOut = 0.5 * SC;  // 0.5 inch horizontal extension
        const lipDrop = 0.5 * SC; // 0.5 inch vertical drop → 45° angle

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
    // Only render collar when storm collar is enabled
    const collar = getCollarConfig(hole.id as 'A' | 'B' | 'C', config);
    if (!collar.stormCollar) return;

    const W = config.w * SC;
    const L = config.l * SC;
    const skH = config.sk * SC;
    const T = (GAUGE_THICKNESS[config.gauge] || 0.0478) * SC;
    const SLOPE = config.diag ? 0.75 * SC : 0; // fixed 3/4 inch rise from edges to peak

    const COLLAR_SEGS = 48;
    const localRoofY = config.diag ? SLOPE * (1 - Math.max(Math.abs(hole.wx / (W / 2)), Math.abs(hole.wz / (L / 2)))) : 0;
    const topY = skH + localRoofY + hole.h;

    const colVerts: number[] = [];
    const colIdx: number[] = [];

    for (let i = 0; i < COLLAR_SEGS; i++) {
        const a = (i / COLLAR_SEGS) * Math.PI * 2;
        // Generate relative to hole center (0, 0) since TransformControls will move the group
        const px = Math.cos(a) * hole.r;
        const pz = Math.sin(a) * hole.r;
        
        // For the bottom Y, we must find the roof height at the ABSOLUTE position
        const absPx = hole.wx + px;
        const absPz = hole.wz + pz;

        let btmY: number;
        if (config.diag) {
            const npx = absPx / (W / 2);
            const npz = absPz / (L / 2);
            const d = Math.max(Math.abs(npx), Math.abs(npz));
            btmY = skH + SLOPE * (1 - d) - 0.002;
        } else {
            btmY = skH - 0.002;
        }

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

    const lo = hole.r + T;
    const li = hole.r - T * 0.5;
    const rG = new THREE.RingGeometry(li, lo, 32);
    const rm = new THREE.Mesh(rG, mat.clone());
    rm.rotation.x = -Math.PI / 2;
    rm.position.set(0, topY + 0.001, 0); // local to group
    grp.add(rm);
    
    // Removal of visual flared storm collar per user request. 
    // The collarHeight state still controls the main vertical collar height.
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
        -hw, edgeY - thickness, hl
    ];

    const indices = [
        0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4,
        5, 6, 7, 5, 7, 8, 5, 8, 9, 5, 9, 6,
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
    baseMat.side = THREE.DoubleSide;

    console.time('[CSG] fromMesh (roof)');
    let csgTop = CSG.fromMesh(new THREE.Mesh(topGeo, baseMat));
    console.timeEnd('[CSG] fromMesh (roof)');

    for (const h of holes) {
        if (h.r > 0) {
            const cylH = SLOPE + 10;
            const cylGeo = new THREE.CylinderGeometry(h.r, h.r, cylH, 32);
            const cylMesh = new THREE.Mesh(cylGeo);
            cylMesh.position.set(h.wx, edgeY + SLOPE / 2, h.wz);
            cylMesh.updateMatrixWorld();

            console.time(`[CSG] subtract hole ${h.id}`);
            const csgHole = CSG.fromMesh(cylMesh);
            csgTop = csgTop.subtract(csgHole);
            console.timeEnd(`[CSG] subtract hole ${h.id}`);
        }
    }

    console.time('[CSG] toMesh (final)');
    const finalTopMesh = CSG.toMesh(csgTop, new THREE.Matrix4(), baseMat);
    console.timeEnd('[CSG] toMesh (final)');
    finalTopMesh.castShadow = true;
    finalTopMesh.receiveShadow = true;
    grp.add(finalTopMesh);
}
