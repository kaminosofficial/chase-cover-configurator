import { useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, useProgress } from '@react-three/drei';
import { useConfigStore } from '../../store/configStore';
import { ChaseModel } from './ChaseModel';
import { DimensionOverlay } from './DimensionOverlay';
import { bindCameraActions } from '../../utils/cameraRef';

// Syncs camera and controls refs to the module-level cameraActions
function CameraSync() {
  const { camera, controls } = useThree();
  useEffect(() => {
    if (controls) bindCameraActions(camera, controls);
  }, [camera, controls]);
  return null;
}

function Loader() {
  const { active, progress } = useProgress();
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (!active && progress >= 100) {
      const t = setTimeout(() => setShow(false), 600);
      return () => clearTimeout(t);
    }
  }, [active, progress]);

  if (!show) return null;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: '#cdc9c0',
      opacity: (!active && progress >= 100) ? 0 : 1,
      transition: 'opacity 0.5s ease',
      pointerEvents: 'none',
    }}>
      <div style={{
        width: 180, height: 4,
        background: 'rgba(0,0,0,0.1)',
        borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.max(progress, 10)}%`,
          background: '#b89a69',
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{
        marginTop: 10,
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 10, color: '#7a7168', letterSpacing: 1,
      }}>
        Loading…
      </div>
    </div>
  );
}

export function ChaseViewer() {
  const orbitEnabled = useConfigStore(state => state.orbitEnabled);

  return (
    <>
      <Canvas
        shadows
        camera={{ position: [1.5, 1.2, 1.5], fov: 45 }}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <OrbitControls enabled={orbitEnabled} target={[0, 0.04, 0]} makeDefault minDistance={0.5} maxDistance={4.5} />
        <CameraSync />

        <ambientLight intensity={0.7} />
        <directionalLight
          position={[5, 8, 5]}
          intensity={1.3}
          castShadow
          shadow-bias={-0.0001}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <hemisphereLight intensity={0.4} groundColor="#b08060" />
        <Environment preset="warehouse" environmentIntensity={0.7} />

        <ChaseModel />
        <DimensionOverlay />
      </Canvas>
      <Loader />
    </>
  );
}

