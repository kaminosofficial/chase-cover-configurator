import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useConfigStore } from '../../store/configStore';
import { buildCoverWithoutCollars, buildCollarForHole, holeWorld, clampDragToOffsets, getDiagonalSlopeRise, mkMat, SC } from '../../utils/geometry';

function HoleComponent({ id, config, activeId, setActiveId, mat }: { id: 'A'|'B'|'C', config: any, activeId: string | null, setActiveId: (id: string | null) => void, mat: THREE.Material }) {
    const setCollar = useConfigStore(state => state.setCollar);
    const setOrbitEnabled = useConfigStore(state => state.setOrbitEnabled);
    const moveHolesMode = useConfigStore(state => state.moveHolesMode);
    
    const [dragging, setDragging] = useState(false);
    const startOffsetsRef = useRef<{o1:number, o2:number, o3:number, o4:number} | null>(null);
    const dragOffsetRef = useRef(new THREE.Vector3());
    const configRef = useRef(config);
    useEffect(() => { configRef.current = config; }, [config]);
    
    const hole = holeWorld(id, config);
    const collarGroupRef = useRef<THREE.Group>(null);
    const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    const { camera, gl } = useThree();

    // Rebuild collar geometry
    useEffect(() => {
        const grp = collarGroupRef.current;
        if (!grp) return;
        grp.traverse(c => { const mesh = c as THREE.Mesh; if (mesh.geometry) mesh.geometry.dispose(); });
        while(grp.children.length) grp.remove(grp.children[0]);
        buildCollarForHole(grp, hole, config, mat);
    }, [config[`collar${id}`].dia, config[`collar${id}`].height, config[`collar${id}`].stormCollar, config.diag, config.sk, config.w, config.l, mat, hole.wx, hole.wz]);

    useEffect(() => {
        if (!dragging) return;
        
        const handleMove = (e: PointerEvent) => {
            const rect = gl.domElement.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            const ray = new THREE.Raycaster();
            ray.setFromCamera(new THREE.Vector2(x, y), camera);

            const target = new THREE.Vector3();
            if (ray.ray.intersectPlane(planeRef.current, target)) {
                // Apply the offset saved on pointer down
                target.sub(dragOffsetRef.current);

                const st = configRef.current;
                const safe = clampDragToOffsets(id, target.x, target.z, st);

                // If still colliding after all clamping, don't update — keep last valid position
                if (safe.colliding) return;

                const curr = st[`collar${id}` as 'collarA'|'collarB'|'collarC'];
                if (Math.abs(curr.offset1 - safe.offset1) > 0.001 || Math.abs(curr.offset2 - safe.offset2) > 0.001) {
                    setCollar(id, {
                        centered: false,
                        offset1: safe.offset1, offset2: safe.offset2,
                        offset3: safe.offset3, offset4: safe.offset4,
                    });
                }
            }
        };

        const handleUp = () => {
            if (dragging) {
                // Check if final position still results in an overlap that can't be pushed out safely
                const st = useConfigStore.getState();
                const currentHole = holeWorld(id, st);
                
                // Check if we are still dramatically overlapping another hole after the final push-back
                const otherIds: ('A'|'B'|'C')[] = [];
                if (st.holes >= 1 && id !== 'A') otherIds.push('A');
                if (st.holes >= 2 && id !== 'B') otherIds.push('B');
                if (st.holes === 3 && id !== 'C') otherIds.push('C');
                
                let hasCollision = false;
                for (const oId of otherIds) {
                    const other = holeWorld(oId, st);
                    const dx = currentHole.wx - other.wx;
                    const dz = currentHole.wz - other.wz;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    const minDist = currentHole.r + other.r + 1.0 * SC; // 1 inch gap
                    if (dist < minDist - 0.01) { // small epsilon
                         hasCollision = true;
                         break;
                    }
                }

                if (hasCollision && startOffsetsRef.current) {
                    const s = startOffsetsRef.current;
                    setCollar(id, {
                        centered: false,
                        offset1: s.o1, offset2: s.o2, offset3: s.o3, offset4: s.o4
                    });
                }
            }
            
            setDragging(false);
            setOrbitEnabled(true);
            document.body.style.cursor = 'auto';
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };
    }, [dragging, id, camera, gl, setCollar, setOrbitEnabled]);

    const W = config.w * SC;
    const L = config.l * SC;
    const skH = config.sk * SC;
    const SLOPE = config.diag ? getDiagonalSlopeRise(W, L) : 0;
    const localRoofY = config.diag ? SLOPE * (1 - Math.max(Math.abs(hole.wx / (W / 2)), Math.abs(hole.wz / (L / 2)))) : 0;
    const topY = skH + localRoofY + hole.h;

    return (
        <group position={[hole.wx, 0, hole.wz]}>
            <group ref={collarGroupRef} />

            {moveHolesMode && (
                <group position={[0, topY, 0]}>
                    <mesh
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            
                            // Calculate current state precisely using getState to avoid frame lag
                            const st = useConfigStore.getState();
                            const currentHole = holeWorld(id, st);
                            const collar = id === 'A' ? st.collarA : id === 'B' ? st.collarB : st.collarC;
                            
                            // Save start position for revert
                            startOffsetsRef.current = {
                                o1: collar.offset1, o2: collar.offset2,
                                o3: collar.offset3, o4: collar.offset4
                            };
                            
                            const safe = clampDragToOffsets(id, currentHole.wx, currentHole.wz, st);
                            
                            setCollar(id, { 
                                centered: false,
                                offset1: safe.offset1,
                                offset2: safe.offset2,
                                offset3: safe.offset3,
                                offset4: safe.offset4
                            });

                            // Calculate drag offset AFTER the state update to be ready for the next frame
                            const rect = gl.domElement.getBoundingClientRect();
                            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                            const ray = new THREE.Raycaster();
                            ray.setFromCamera(new THREE.Vector2(x, y), camera);
                            const hitPoint = new THREE.Vector3();
                            if (ray.ray.intersectPlane(planeRef.current, hitPoint)) {
                                dragOffsetRef.current.copy(hitPoint).sub(new THREE.Vector3(currentHole.wx, 0, currentHole.wz));
                            }

                            setDragging(true);
                            setOrbitEnabled(false);
                            setActiveId(id);
                            document.body.style.cursor = 'grabbing';
                        }}
                        onPointerOver={() => { document.body.style.cursor = dragging ? 'grabbing' : 'grab'; }}
                        onPointerOut={() => { if(!dragging) document.body.style.cursor = 'auto'; }}
                    >
                        <cylinderGeometry args={[hole.r + 0.05, hole.r + 0.05, 0.4, 24]} />
                        <meshBasicMaterial visible={false} />
                    </mesh>

                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                        <ringGeometry args={[hole.r + 0.01, hole.r + 0.06, 32]} />
                        <meshBasicMaterial color={dragging ? "#b89a69" : "#c9873b"} transparent opacity={0.6} side={THREE.DoubleSide} depthTest={false} />
                    </mesh>
                    
                    <Html position={[0, 0.1, 0]} center style={{ pointerEvents: 'none', zIndex: 10 }}>
                        <div style={{
                            background: dragging ? '#b89a69' : '#c9873b',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontFamily: 'var(--sans)',
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                            opacity: (activeId === id || dragging) ? 1 : 0.8,
                            transform: dragging ? 'scale(1.05)' : 'scale(1)',
                            transition: 'all 0.15s'
                        }}>
                           {dragging ? 'Dragging...' : '✥ Drag to Move'}
                        </div>
                    </Html>
                </group>
            )}
        </group>
    );
}

export function ChaseModel() {
    const groupRef = useRef<THREE.Group>(null);
    const [activeId, setActiveId] = useState<string | null>(null);

    const config = useConfigStore(state => state);
    const mat = mkMat(config.mat, config.pc, config.pcCol);

    const [mountTime] = useState(() => performance.now());

    useFrame(() => {
        const elapsed = (performance.now() - mountTime) / 1000;
        if (elapsed < 3 && groupRef.current) {
            // Slower, subtler wobble animation for the first 3 seconds
            const progress = elapsed / 3;
            const amplitude = 0.08 * (1 - progress); 
            groupRef.current.rotation.y = Math.sin(elapsed * Math.PI * 1.5) * amplitude;
        } else if (groupRef.current && groupRef.current.rotation.y !== 0) {
            groupRef.current.rotation.y = 0; // snap back exactly
        }
    });

    useEffect(() => {
        const grp = groupRef.current;
        if (!grp) return;

        // Clean up old geometry and materials
        grp.traverse(c => {
            const mesh = c as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        });

        // Remove old children
        while (grp.children.length) {
            grp.remove(grp.children[0]);
        }

        // Rebuild full procedural geometry and attach to group
        try {
            buildCoverWithoutCollars(grp, config);
            (window as any).__chaseGroup = grp;
        } catch (e) {
            console.error("Failed to build geometry", e);
        }
    }, [
        config.w, config.l, config.sk, config.drip, config.diag, config.mat, config.gauge,
        config.pc, config.pcCol, config.holes,
        config.collarA, config.collarB, config.collarC
    ]);

    return (
        <group>
            <group ref={groupRef} onClick={() => setActiveId(null)} />
            {config.holes >= 1 && <HoleComponent id="A" config={config} activeId={activeId} setActiveId={setActiveId} mat={mat} />}
            {config.holes >= 2 && <HoleComponent id="B" config={config} activeId={activeId} setActiveId={setActiveId} mat={mat} />}
            {config.holes === 3 && <HoleComponent id="C" config={config} activeId={activeId} setActiveId={setActiveId} mat={mat} />}
        </group>
    );
}
