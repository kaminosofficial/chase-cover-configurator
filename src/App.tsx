import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sidebar } from './components/sidebar/Sidebar';
import { ChaseViewer } from './components/viewer/ChaseViewer';
import { useConfigStore, saveConfigForRestore, restoreConfigIfNeeded } from './store/configStore';
import type { CollarState } from './store/configStore';
import { applyConfigState, getConfigState, exportToGLB } from './utils/ar';
import { cameraActions } from './utils/cameraRef';
import { RalModal } from './components/ral/RalModal';
import { formatFrac } from './utils/format';
import { getHoleSizeInches, getHoleEdgeOffsets, holeWorld } from './utils/geometry';

declare global {
  interface Window { QRious: any; }
}

declare const __LOCAL_IP__: string | undefined;

interface AppProps {
  productId?: string;
  variantId?: string;
}

function formatHoleSummary(code: 'A' | 'B' | 'C', index: number, collar: CollarState) {
  const size = getHoleSizeInches(collar);
  const label = `H${index}`;
  const holeText = collar.shape === 'rect'
    ? `${label}: ${formatFrac(size.sizeZ)}" x ${formatFrac(size.sizeX)}" rect`
    : `${label}: ${String.fromCharCode(8960)}${formatFrac(collar.dia)}"`;
  const offsetText = collar.centered
    ? ' (on center)'
    : ` [${code}1: ${formatFrac(collar.offset3)}" ${code}2: ${formatFrac(collar.offset4)}" ${code}3: ${formatFrac(collar.offset1)}" ${code}4: ${formatFrac(collar.offset2)}"]`;
  return holeText + offsetText;
}

function formatHoleCutoutSummary(code: 'A' | 'B' | 'C', config: ReturnType<typeof useConfigStore.getState>) {
  const hole = holeWorld(code, config);
  const offsets = getHoleEdgeOffsets(hole, config);
  return `[${code}1(Top): ${formatFrac(offsets.top)}\" ${code}2(Right): ${formatFrac(offsets.right)}\" ${code}3(Bottom): ${formatFrac(offsets.bottom)}\" ${code}4(Left): ${formatFrac(offsets.left)}\"]`;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<'cart' | 'buy' | null>(null);

  const arViewerRef = useRef<any>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrUrlRef = useRef<HTMLDivElement>(null);
  const appLayoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#ar=')) {
      // AR config takes priority — don't restore from cart
      const restored = applyConfigState(hash.slice(4));
      setConfig(restored as any);
      setShowMobilePrompt(true);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } else {
      // Restore config only when navigating back from cart (not on fresh refresh)
      restoreConfigIfNeeded();
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setArActive(false);
        setQrActive(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const [mobilePreviewSize, setMobilePreviewSize] = useState(40);
  const [dragPreviewSize, setDragPreviewSize] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const dragPointerOffsetRef = useRef(0);

  const getPreviewSizeFromPointer = (clientY: number) => {
    const layoutRect = appLayoutRef.current?.getBoundingClientRect();
    if (!layoutRect || layoutRect.height <= 0) return null;

    const dividerY = clientY - dragPointerOffsetRef.current;
    const relativeY = dividerY - layoutRect.top;
    const nextSize = (relativeY / layoutRect.height) * 100;
    return Math.max(30, Math.min(70, nextSize));
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();

      const nextSize = getPreviewSizeFromPointer(e.clientY);
      if (nextSize !== null) {
        setDragPreviewSize(nextSize);
      }
    };

    const handlePointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setDragPreviewSize(prev => {
          if (prev !== null) setMobilePreviewSize(prev);
          return null;
        });
        dragPointerOffsetRef.current = 0;
        document.body.style.userSelect = '';
        document.body.style.touchAction = '';
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  const isMobile = () =>
    window.innerWidth <= 767 ||
    /Mobi|Android|iPhone/i.test(navigator.userAgent);

  async function launchAR(direct = false) {
    if (!direct && !isMobile()) {
      const stateStr = getConfigState(config);

      let baseUrl = window.location.origin;
      if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && typeof __LOCAL_IP__ !== 'undefined' && __LOCAL_IP__) {
        baseUrl = `http://${__LOCAL_IP__}:${window.location.port}`;
      }

      const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      const pagePath = canonical ? canonical.href : baseUrl + window.location.pathname;
      const pageUrl = pagePath.split('?')[0];
      const url = pageUrl + '#ar=' + stateStr;

      if (qrCanvasRef.current && window.QRious) {
        new window.QRious({ element: qrCanvasRef.current, value: url, size: 200, background: 'white', foreground: 'black', level: 'M' });
      }
      if (qrUrlRef.current) qrUrlRef.current.textContent = pageUrl;
      setQrActive(true);
      return;
    }

    setArActive(true);
    setArLoading(true);
    try {
      if (!customElements.get('model-viewer')) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.type = 'module';
          script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load model-viewer'));
          document.head.appendChild(script);
        });
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

  const displayDimLines = [
    `${formatFrac(config.w)}" W x ${formatFrac(config.l)}" L x ${formatFrac(config.sk)}" Skirt`,
    ...(config.holes >= 1 ? [formatHoleSummary('A', 1, config.collarA)] : []),
    ...(config.holes >= 2 ? [formatHoleSummary('B', 2, config.collarB)] : []),
    ...(config.holes === 3 ? [formatHoleSummary('C', 3, config.collarC)] : []),
  ];

  return (
    <>
      <div
        ref={appLayoutRef}
        className="app-layout"
        style={{ '--mobile-preview-size': `${mobilePreviewSize}%` } as any}
      >
        <div className="viewport">
          <ChaseViewer />

          <div className="viewport-controls">
            <button className="vp-btn" title="Reset" onClick={() => cameraActions.reset()}>
              &#8635;
            </button>
            <button className="vp-btn" title="Top" onClick={() => cameraActions.top()}>
              &#8868;
            </button>
            <button className="vp-btn" title="Front" onClick={() => cameraActions.front()}>
              &#9723;
            </button>
            {config.holes > 0 && (
              <button
                className="vp-btn"
                title={config.moveHolesMode ? 'Done Moving Holes' : 'Move Holes'}
                style={{
                  width: 'auto',
                  padding: '0 12px',
                  gap: '6px',
                  fontWeight: 600,
                  fontSize: '12px',
                  backgroundColor: config.moveHolesMode ? '#c9873b' : undefined,
                  color: config.moveHolesMode ? '#fff' : undefined,
                  borderColor: config.moveHolesMode ? '#c9873b' : undefined,
                  display: 'flex',
                  alignItems: 'center',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                onClick={() => setConfig({ moveHolesMode: !config.moveHolesMode })}
              >
                <span>{config.moveHolesMode ? 'Done Moving' : 'Move Holes'}</span>
              </button>
            )}
            <button className="ar-btn desktop-ar viewport-action-btn" onClick={() => launchAR()}>View in AR</button>
          </div>

          <div className="mobile-only-controls" style={{ position: 'absolute', bottom: 14, left: 14, display: 'flex', gap: 8, zIndex: 5 }}>
            <button
              className="ar-btn-mobile"
              style={{ position: 'relative', bottom: 'auto', left: 'auto', transform: 'none', margin: 0 }}
              onClick={() => launchAR(true)}
              title="View in AR"
              aria-label="View in AR"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7V4h3M17 4h3v3M3 17v3h3M17 20h3v-3"/>
                <path d="M12 8l-4 2.3v4.4L12 17l4-2.3V10.3z"/>
                <line x1="12" y1="17" x2="12" y2="12.5"/>
                <line x1="8" y1="10.3" x2="12" y2="12.5"/>
                <line x1="16" y1="10.3" x2="12" y2="12.5"/>
              </svg>
            </button>
          </div>

          <div className={`dim-overlay${dimOpen ? ' dim-open' : ''}`}>
            {dimOpen ? (
              <>
                <button
                  className="dim-close"
                  onClick={(e) => { e.stopPropagation(); setDimOpen(false); }}
                  title="Close dimensions"
                  aria-label="Close dimensions"
                >
                  &times;
                </button>
                {displayDimLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </>
            ) : (
              <button
                type="button"
                className="dim-icon"
                title="Show dimensions"
                aria-label="Show dimensions"
                onClick={() => setDimOpen(true)}
              >
                <svg viewBox="0 0 28 10" aria-hidden="true" focusable="false">
                  <rect x="0.8" y="0.8" width="26.4" height="8.4" rx="1" />
                  <line x1="5.5"  y1="0.8" x2="5.5"  y2="5.8" />
                  <line x1="9"    y1="0.8" x2="9"    y2="4" />
                  <line x1="12.5" y1="0.8" x2="12.5" y2="5.8" />
                  <line x1="16"   y1="0.8" x2="16"   y2="4" />
                  <line x1="19.5" y1="0.8" x2="19.5" y2="5.8" />
                  <line x1="23"   y1="0.8" x2="23"   y2="4" />
                </svg>
              </button>
            )}
          </div>

          <div className="viewport-badge">Drag to orbit · Scroll to zoom · Right-drag to pan</div>
        </div>

        {dragPreviewSize !== null && (
          <div
            style={{
              position: 'absolute',
              top: `${dragPreviewSize}%`,
              left: 0,
              right: 0,
              height: '2px',
              background: 'var(--accent)',
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          />
        )}

        <div
          className="mobile-divider"
          onPointerDown={(e) => {
            e.preventDefault();

            const handleRect = e.currentTarget.getBoundingClientRect();
            const dividerY = handleRect.top + (handleRect.height / 2);
            dragPointerOffsetRef.current = e.clientY - dividerY;

            isDraggingRef.current = true;
            const nextSize = getPreviewSizeFromPointer(e.clientY);
            if (nextSize !== null) {
              setDragPreviewSize(nextSize);
            }
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
          isSubmitting={isSubmitting}
          submittingAction={submittingAction}
          onAddToCart={async () => {
            if (isSubmitting) return;
            const apiBase = (window as any).__chaseApiBase || '';
            if (!apiBase) {
              alert('Configuration error: API base not found. Are you running this via the Shopify integration?');
              return;
            }

            try {
              setIsSubmitting(true);
              setSubmittingAction('cart');

              // Capture 3D viewer screenshot
              let imageBase64: string | undefined;
              try {
                const root = appLayoutRef.current?.closest('.chase-cover-configurator-root') || document;
                const canvas = (root as Element).querySelector?.('canvas') ?? document.querySelector('.viewport canvas');
                if (canvas && canvas instanceof HTMLCanvasElement) {
                  imageBase64 = canvas.toDataURL('image/png', 0.85);
                }
              } catch { /* ignore capture errors */ }

              const payload = {
                w: config.w, l: config.l, sk: config.sk,
                drip: config.drip, diag: config.diag,
                mat: config.mat, gauge: config.gauge,
                pc: config.pc, pcCol: config.pcCol,
                holes: config.holes,
                collarA: config.holes >= 1 ? config.collarA : undefined,
                collarB: config.holes >= 2 ? config.collarB : undefined,
                collarC: config.holes >= 3 ? config.collarC : undefined,
                holeCutoutA: config.holes >= 1 ? formatHoleCutoutSummary('A', config) : undefined,
                holeCutoutB: config.holes >= 2 ? formatHoleCutoutSummary('B', config) : undefined,
                holeCutoutC: config.holes >= 3 ? formatHoleCutoutSummary('C', config) : undefined,
                quantity: config.quantity,
                notes: config.notes,
                shopifyProductId: productId,
                shopifyVariantId: variantId,
                image: imageBase64,
              };

              // Step 1: Call our API to calculate price + update variant
              const res = await fetch(`${apiBase}/api/add-to-cart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });

              const data = await res.json().catch(() => null);
              if (!res.ok) {
                console.error('Add-to-cart API error:', res.status, data);
                throw new Error(data?.error || `HTTP error! status: ${res.status}`);
              }

              // Step 2: Add to Shopify's native cart via AJAX Cart API
              const cartProperties: Record<string, string> = {};
              for (const prop of (data.properties || [])) {
                cartProperties[prop.key] = prop.value;
              }

              const cartRes = await fetch('/cart/add.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  items: [{
                    id: Number(data.variantId),
                    quantity: data.quantity,
                    properties: cartProperties,
                  }],
                }),
              });

              if (!cartRes.ok) {
                const cartError = await cartRes.text();
                console.error('Shopify cart add error:', cartRes.status, cartError);
                throw new Error('Failed to add item to cart');
              }

              // Step 3: Open the cart drawer / refresh cart UI
              // Try common Shopify theme methods to open the cart drawer
              try {
                // Dawn and many themes listen for this event
                document.documentElement.dispatchEvent(new CustomEvent('cart:refresh'));
                // Also try triggering a click on the cart icon to open the drawer
                const cartIcon = document.querySelector('[data-cart-toggle], .cart-icon-bubble, .js-drawer-open-cart, a[href="/cart"], .header__icon--cart button, .site-header__cart') as HTMLElement | null;
                if (cartIcon) cartIcon.click();
              } catch { /* ignore */ }

              // Show a brief success feedback
              alert('Added to cart!');

            } catch (err: any) {
              console.error('Add to cart error:', err);
              alert(`Failed to add to cart: ${err.message}`);
            } finally {
              setIsSubmitting(false);
              setSubmittingAction(null);
            }
          }}
          onBuyNow={async () => {
            if (isSubmitting) return;
            const apiBase = (window as any).__chaseApiBase || '';
            if (!apiBase) {
              alert('Configuration error: API base not found. Are you running this via the Shopify integration?');
              return;
            }

            try {
              setIsSubmitting(true);
              setSubmittingAction('buy');

              // Capture 3D viewer screenshot
              let imageBase64: string | undefined;
              try {
                const root = appLayoutRef.current?.closest('.chase-cover-configurator-root') || document;
                const canvas = (root as Element).querySelector?.('canvas') ?? document.querySelector('.viewport canvas');
                if (canvas && canvas instanceof HTMLCanvasElement) {
                  imageBase64 = canvas.toDataURL('image/png', 0.85);
                }
              } catch { /* ignore capture errors */ }

              const payload = {
                w: config.w, l: config.l, sk: config.sk,
                drip: config.drip, diag: config.diag,
                mat: config.mat, gauge: config.gauge,
                pc: config.pc, pcCol: config.pcCol,
                holes: config.holes,
                collarA: config.holes >= 1 ? config.collarA : undefined,
                collarB: config.holes >= 2 ? config.collarB : undefined,
                collarC: config.holes >= 3 ? config.collarC : undefined,
                holeCutoutA: config.holes >= 1 ? formatHoleCutoutSummary('A', config) : undefined,
                holeCutoutB: config.holes >= 2 ? formatHoleCutoutSummary('B', config) : undefined,
                holeCutoutC: config.holes >= 3 ? formatHoleCutoutSummary('C', config) : undefined,
                quantity: config.quantity,
                notes: config.notes,
                shopifyProductId: productId,
                shopifyVariantId: variantId,
                image: imageBase64,
              };

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
                saveConfigForRestore();
                window.location.href = data.checkout_url;
              } else {
                throw new Error(data?.error || 'No checkout URL returned');
              }
            } catch (err: any) {
              console.error('Buy now error:', err);
              alert(`Failed to create order: ${err.message}`);
            } finally {
              setIsSubmitting(false);
              setSubmittingAction(null);
            }
          }}
        />
      </div>

      <RalModal open={ralOpen} onClose={() => setRalOpen(false)} />

      {(() => {
        const portalTarget = (window as any).__chasePortalContainer as HTMLElement | undefined;
        const overlays = (
          <>
            <div className={`ar-overlay${arActive ? ' active' : ''}`}>
              <button className="ar-close" onClick={() => setArActive(false)}>&times;</button>
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
              {arLoading && <div className="ar-loading">Preparing 3D model...</div>}
            </div>

            <div className={`qr-overlay${qrActive ? ' active' : ''}`}>
              <div className="qr-card">
                <button className="qr-close" onClick={() => setQrActive(false)}>&times;</button>
                <div className="qr-title">View in Your Space</div>
                <div className="qr-desc">Scan this QR code with your phone's camera to place the chase cover in your environment.</div>
                <div className="qr-canvas-container">
                  <canvas ref={qrCanvasRef} />
                </div>
                <div ref={qrUrlRef} style={{ marginTop: 10, fontSize: 11, color: '#888', wordBreak: 'break-all', maxWidth: 220, textAlign: 'center' }} />
              </div>
            </div>

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
