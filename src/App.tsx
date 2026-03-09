import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sidebar } from './components/sidebar/Sidebar';
import { ChaseViewer } from './components/viewer/ChaseViewer';
import { useConfigStore } from './store/configStore';
import { applyConfigState, getConfigState, exportToGLB } from './utils/ar';
import { cameraActions } from './utils/cameraRef';
import { RalModal } from './components/ral/RalModal';
import { formatFrac } from './utils/format';

declare global {
  interface Window { QRious: any; }
}

declare const __LOCAL_IP__: string | undefined;

interface AppProps {
  productId?: string;
  variantId?: string;
}

export default function App({ productId, variantId }: AppProps = {}) {
  const config = useConfigStore(s => s);
  const setConfig = useConfigStore(s => s.set);

  const [showMobilePrompt, setShowMobilePrompt] = useState(false);
  const [arActive, setArActive] = useState(false);
  const [qrActive, setQrActive] = useState(false);
  const [arLoading, setArLoading] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [bdOpen, setBdOpen] = useState(false);
  const [ralOpen, setRalOpen] = useState(false);
  const [dimOpen, setDimOpen] = useState(false);

  const arViewerRef = useRef<any>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrUrlRef = useRef<HTMLDivElement>(null);
  const [mountTime] = useState(() => performance.now());

  useEffect(() => {
    const end = performance.now();
    console.log(`[ChaseConfigurator] Total App Mount Time: ${(end - mountTime).toFixed(2)}ms`);
  }, []);

  // Hash restore on mount
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#ar=')) {
      const restored = applyConfigState(hash.slice(4));
      setConfig(restored as any);
      setShowMobilePrompt(true);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // Escape key closes overlays
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setArActive(false); setQrActive(false); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Mobile adjustable layout state
  const [mobilePreviewVH, setMobilePreviewVH] = useState(40);
  const [dragVH, setDragVH] = useState<number | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault(); // Prevent scrolling while dragging

      // Calculate new vh based on pointer Y
      const newVH = (e.clientY / window.innerHeight) * 100;
      
      // Clamp between 30 and 70 limits per user request
      const clampedVH = Math.max(30, Math.min(70, newVH));
      setDragVH(clampedVH);
    };

    const handlePointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setDragVH(prev => {
          if (prev !== null) setMobilePreviewVH(prev);
          return null;
        });
        document.body.style.userSelect = '';
        document.body.style.touchAction = '';
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const isMobile = () =>
    window.innerWidth <= 900 ||
    /Mobi|Android|iPad|iPhone/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);

  async function launchAR() {
    if (!isMobile()) {
      // Desktop: generate QR code
      const stateStr = getConfigState(config);

      let baseUrl = window.location.origin;
      // If we're on localhost but we have a real network IP from Vite, inject it
      if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && typeof __LOCAL_IP__ !== 'undefined' && __LOCAL_IP__) {
        baseUrl = `http://${__LOCAL_IP__}:${window.location.port}`;
      }

      // Use canonical URL if available (avoids Shopify preview paths that 404)
      const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      const pagePath = canonical ? canonical.href : baseUrl + window.location.pathname;
      // Strip any query params from canonical, keep only origin+path
      const pageUrl = pagePath.split('?')[0];

      const url = pageUrl + '#ar=' + stateStr;

      if (qrCanvasRef.current && window.QRious) {
        new window.QRious({ element: qrCanvasRef.current, value: url, size: 200, background: 'white', foreground: 'black', level: 'M' });
      }
      if (qrUrlRef.current) qrUrlRef.current.textContent = pageUrl;
      setQrActive(true);
      return;
    }
    // Mobile: dynamically load model-viewer if not already loaded, then export GLB
    setArActive(true);
    setArLoading(true);
    try {
      // Dynamically load model-viewer script if not present
      if (!customElements.get('model-viewer')) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.type = 'module';
          script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load model-viewer'));
          document.head.appendChild(script);
        });
        // Wait a moment for custom element registration
        await new Promise(r => setTimeout(r, 500));
      }

      await new Promise(r => setTimeout(r, 50));
      const sceneGroup = (window as any).__chaseGroup;
      if (!sceneGroup) throw new Error('Scene not ready');
      const url = await exportToGLB(sceneGroup);
      const viewer = arViewerRef.current;
      if (viewer) {
        viewer.setAttribute('src', url);
        viewer.style.display = 'block';
      }
    } catch (e: any) {
      console.error('AR launch failed:', e);
      alert('Could not launch AR: ' + (e?.message || 'Unknown error'));
      setArActive(false);
    } finally {
      setArLoading(false);
    }
  }

  // Dimension overlay content
  const dimLines: string[] = [];
  dimLines.push(`${formatFrac(config.w)}" W × ${formatFrac(config.l)}" L × ${formatFrac(config.sk)}" Skirt`);
  if (config.holes >= 1) {
    let t = `H1: ⌀${formatFrac(config.collarA.dia)}"`;
    t += config.collarA.centered ? ' (on center)' : ` [A1: ${formatFrac(config.collarA.offset3)}" A2: ${formatFrac(config.collarA.offset4)}" A3: ${formatFrac(config.collarA.offset1)}" A4: ${formatFrac(config.collarA.offset2)}"]`;
    dimLines.push(t);
  }
  if (config.holes >= 2) {
    let t = `H2: ⌀${formatFrac(config.collarB.dia)}"`;
    t += config.collarB.centered ? ' (on center)' : ` [B1: ${formatFrac(config.collarB.offset3)}" B2: ${formatFrac(config.collarB.offset4)}" B3: ${formatFrac(config.collarB.offset1)}" B4: ${formatFrac(config.collarB.offset2)}"]`;
    dimLines.push(t);
  }
  if (config.holes === 3) {
    let t = `H3: ⌀${formatFrac(config.collarC.dia)}"`;
    t += config.collarC.centered ? ' (on center)' : ` [C1: ${formatFrac(config.collarC.offset3)}" C2: ${formatFrac(config.collarC.offset4)}" C3: ${formatFrac(config.collarC.offset1)}" C4: ${formatFrac(config.collarC.offset2)}"]`;
    dimLines.push(t);
  }

  return (
    <>
      <header>
        <div className="logo">
          <div className="logo-mark">K</div>
          KAMINOS
        </div>
        <span className="header-meta">Custom Chase Covers</span>
      </header>

      <div className="app-layout" style={{ '--mobile-preview-vh': `${mobilePreviewVH}vh` } as any}>
        <div className="viewport">
          <ChaseViewer />

          {/* Viewport controls top-left */}
          <div className="viewport-controls">
            <button className="vp-btn" title="Reset" onClick={() => cameraActions.reset()}>⟳</button>
            <button className="vp-btn" title="Top" onClick={() => cameraActions.top()}>⊤</button>
            <button className="vp-btn" title="Front" onClick={() => cameraActions.front()}>◻</button>
            {config.holes > 0 && (
              <button
                className="vp-btn vp-move-holes"
                title={config.moveHolesMode ? 'Done Moving Holes' : 'Move Holes'}
                style={{ 
                  width: 'auto', padding: '0 12px', gap: '6px', fontWeight: 600, fontSize: '12px',
                  backgroundColor: config.moveHolesMode ? '#c9873b' : undefined, 
                  color: config.moveHolesMode ? '#fff' : undefined,
                  borderColor: config.moveHolesMode ? '#c9873b' : undefined,
                  display: 'flex', alignItems: 'center'
                }}
                onClick={() => setConfig({ moveHolesMode: !config.moveHolesMode })}
              >
                <span>{config.moveHolesMode ? '✓' : '✥'}</span>
                <span>{config.moveHolesMode ? 'Done Moving' : 'Move Holes'}</span>
              </button>
            )}
            <button className="ar-btn desktop-ar" onClick={launchAR}>View in AR</button>
          </div>

          {/* Mobile bottom-center controls */}
          <div className="mobile-only-controls" style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, zIndex: 5 }}>
            <button 
              className="ar-btn-mobile" 
              style={{ position: 'relative', bottom: 'auto', left: 'auto', transform: 'none', margin: 0 }}
              onClick={launchAR}
            >
              View in AR
            </button>
          </div>

          {/* Dimension overlay top-right — collapsible */}
          <div className={`dim-overlay${dimOpen ? ' dim-open' : ''}`} onClick={() => setDimOpen(o => !o)}>
            {dimOpen ? (
              dimLines.map((line, i) => (
                <div key={i}>{line}</div>
              ))
            ) : (
              <span className="dim-icon" title="Show dimensions">📐</span>
            )}
          </div>

          <div className="viewport-badge">Drag to orbit · Scroll to zoom · Right-drag to pan</div>
        </div>

        {/* Drag Indicator Overlay */}
        {dragVH !== null && (
          <div style={{
            position: 'absolute', top: `${dragVH}vh`, left: 0, right: 0,
            height: '2px', background: 'var(--accent)', zIndex: 9999, pointerEvents: 'none'
          }} />
        )}

        {/* Mobile Adjustable Slider (only visible via CSS on mobile) */}
        <div 
          className="mobile-divider"
          onPointerDown={() => {
            isDraggingRef.current = true;
            document.body.style.userSelect = 'none';
            document.body.style.touchAction = 'none';
          }}
        >
          <div className="mobile-divider-handle" />
        </div>

        <Sidebar
          descExpanded={descExpanded}
          setDescExpanded={setDescExpanded}
          bdOpen={bdOpen}
          setBdOpen={setBdOpen}
          onOpenRal={() => setRalOpen(true)}
          onAddToCart={async () => {
            const apiBase = (window as any).__chaseApiBase || '';
            if (!apiBase) {
              alert('Configuration error: API base not found. Are you running this via the Shopify integration?');
              return;
            }

            try {
              const payload = {
                w: config.w, l: config.l, sk: config.sk,
                drip: config.drip, diag: config.diag,
                mat: config.mat, gauge: config.gauge,
                pc: config.pc, pcCol: config.pcCol,
                holes: config.holes,
                collarA: config.holes >= 1 ? config.collarA : undefined,
                collarB: config.holes >= 2 ? config.collarB : undefined,
                collarC: config.holes >= 3 ? config.collarC : undefined,
                quantity: config.quantity,
                notes: config.notes,
                shopifyProductId: productId,
                shopifyVariantId: variantId,
              };

              // Optional: show a loading state here (could add a state var and overlay)

              const res = await fetch(`${apiBase}/api/create-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });

              const data = await res.json().catch(() => null);
              if (!res.ok) {
                console.error('Create order API error:', res.status, data);
                throw new Error(data?.error || `HTTP error! status: ${res.status}`);
              }

              if (data?.checkout_url) {
                window.location.href = data.checkout_url;
              } else {
                throw new Error(data?.error || 'No checkout URL returned');
              }
            } catch (err: any) {
              console.error('Add to cart error:', err);
              alert(`Failed to create order: ${err.message}`);
            }
          }}
        />
      </div>

      {/* RAL Modal */}
      <RalModal open={ralOpen} onClose={() => setRalOpen(false)} />

      {/* AR/QR Overlays — portaled to light DOM on Shopify so model-viewer AR works */}
      {(() => {
        const portalTarget = (window as any).__chasePortalContainer as HTMLElement | undefined;
        const overlays = (
          <>
            {/* AR Overlay (mobile model-viewer) */}
            <div className={`ar-overlay${arActive ? ' active' : ''}`}>
              <button className="ar-close" onClick={() => setArActive(false)}>✕</button>
              <model-viewer
                ref={arViewerRef}
                ar
                ar-modes="webxr scene-viewer quick-look"
                camera-controls
                touch-action="pan-y"
                auto-rotate
                shadow-intensity="1"
                environment-image="neutral"
                exposure="1.2"
                alt="Chase Cover 3D Preview"
                style={{ '--poster-color': '#222', display: arLoading ? 'none' : 'block' } as any}
              >
                <button slot="ar-button" style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', padding: '10px 24px', background: '#c9873b', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Place in your space
                </button>
              </model-viewer>
              {arLoading && <div className="ar-loading">Preparing 3D model…</div>}
            </div>

            {/* QR Overlay (desktop) */}
            <div className={`qr-overlay${qrActive ? ' active' : ''}`}>
              <div className="qr-card">
                <button className="qr-close" onClick={() => setQrActive(false)}>✕</button>
                <div className="qr-title">View in Your Space</div>
                <div className="qr-desc">Scan this QR code with your phone's camera to place the chase cover in your environment.</div>
                <div className="qr-canvas-container">
                  <canvas ref={qrCanvasRef} />
                </div>
                <div ref={qrUrlRef} style={{ marginTop: 10, fontSize: 11, color: '#888', wordBreak: 'break-all', maxWidth: 220, textAlign: 'center' }} />
              </div>
            </div>

            {/* Mobile AR Prompt (hash restore) */}
            <div className={`ar-mobile-prompt${showMobilePrompt ? ' active' : ''}`}>
              <h2>Configuration Loaded</h2>
              <p>Your custom chase cover is ready to be placed in AR.</p>
              <button className="launch-ar-big-btn" onClick={() => { setShowMobilePrompt(false); launchAR(); }}>
                Launch AR Experience
              </button>
            </div>
          </>
        );
        return portalTarget ? createPortal(overlays, portalTarget) : overlays;
      })()}
    </>
  );
}
