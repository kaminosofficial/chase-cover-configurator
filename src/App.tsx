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

interface ShopifyCart {
  item_count?: number;
  items?: Array<{
    id?: number;
    variant_id?: number;
    quantity?: number;
    properties?: Record<string, string>;
  }>;
}

function normalizeShopifyId(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const normalized = String(value).trim();
  return /^\d+$/.test(normalized) ? normalized : undefined;
}

function readFieldValue(element: Element | null): string | undefined {
  if (!element) return undefined;
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
    return normalizeShopifyId(element.value);
  }
  return normalizeShopifyId(element.getAttribute('value'));
}

function getConfiguratorHost(appLayout: HTMLDivElement | null): HTMLElement | null {
  const rootNode = appLayout?.getRootNode();
  if (rootNode && 'host' in rootNode && rootNode.host instanceof HTMLElement) {
    return rootNode.host;
  }

  return document.querySelector('chase-cover-configurator, chase-configurator, #chase-cover-configurator-mount, #chase-configurator-mount');
}

function getShopifyMetaProduct(): any {
  const shopifyWindow = window as Window & {
    meta?: { product?: any };
    ShopifyAnalytics?: { meta?: { product?: any; selectedVariantId?: string | number } };
  };

  return shopifyWindow.meta?.product || shopifyWindow.ShopifyAnalytics?.meta?.product;
}

function resolveRuntimeShopifyIds(initialProductId?: string, initialVariantId?: string, appLayout?: HTMLDivElement | null) {
  const host = getConfiguratorHost(appLayout ?? null);
  const params = new URLSearchParams(window.location.search);
  const metaProduct = getShopifyMetaProduct();
  const shopifyWindow = window as Window & {
    ShopifyAnalytics?: { meta?: { selectedVariantId?: string | number } };
  };

  const productSources = [
    { source: 'prop', value: normalizeShopifyId(initialProductId) },
    { source: 'mount-attribute', value: normalizeShopifyId(host?.getAttribute('product-id') || undefined) },
    { source: 'shopify-meta-product', value: normalizeShopifyId(metaProduct?.id) },
  ];

  const variantSources = [
    { source: 'prop', value: normalizeShopifyId(initialVariantId) },
    { source: 'mount-attribute', value: normalizeShopifyId(host?.getAttribute('variant-id') || undefined) },
    { source: 'url-query-variant', value: normalizeShopifyId(params.get('variant') || undefined) },
    { source: 'cart-form', value: readFieldValue(document.querySelector('form[action*="/cart/add"] [name="id"]')) },
    { source: 'product-form', value: readFieldValue(document.querySelector('product-form [name="id"]')) },
    { source: 'data-product-form', value: readFieldValue(document.querySelector('[data-product-form] [name="id"]')) },
    { source: 'hidden-input', value: readFieldValue(document.querySelector('input[name="id"][type="hidden"]')) },
    { source: 'variant-select', value: readFieldValue(document.querySelector('select[name="id"]')) },
    { source: 'shopify-analytics-selected', value: normalizeShopifyId(shopifyWindow.ShopifyAnalytics?.meta?.selectedVariantId) },
    { source: 'shopify-meta-selectedVariantId', value: normalizeShopifyId(metaProduct?.selectedVariantId) },
    { source: 'shopify-meta-selected-or-first', value: normalizeShopifyId(metaProduct?.selected_or_first_available_variant?.id) },
    { source: 'shopify-meta-selected', value: normalizeShopifyId(metaProduct?.selected_variant?.id) },
    { source: 'shopify-meta-first-variant', value: normalizeShopifyId(metaProduct?.variants?.[0]?.id) },
  ];

  const resolvedProduct = productSources.find((entry) => entry.value);
  const resolvedVariant = variantSources.find((entry) => entry.value);

  return {
    productId: resolvedProduct?.value,
    variantId: resolvedVariant?.value,
    debug: {
      hostTag: host?.tagName?.toLowerCase() || null,
      path: window.location.pathname,
      search: window.location.search,
      productSource: resolvedProduct?.source || null,
      variantSource: resolvedVariant?.source || null,
      productSources,
      variantSources,
    },
  };
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

function updateCartBadgeCount(itemCount: number) {
  const selectors = [
    '[data-cart-count]',
    '[data-cart-count-bubble]',
    '.cart-count-bubble',
    '.cart-count',
    '.site-header__cart-count',
    '.header__icon--cart .count-bubble',
  ];

  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      if (!(element instanceof HTMLElement)) continue;
      element.hidden = false;
      element.textContent = String(itemCount);
    }
  }
}

function dispatchCartSyncEvents(cart: ShopifyCart | null) {
  const detail = { cart };
  const eventNames = ['cart:refresh', 'cart:updated', 'cart:update', 'cart:change'];

  for (const eventName of eventNames) {
    const event = new CustomEvent(eventName, { detail });
    document.documentElement.dispatchEvent(event);
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}

function tryOpenCartUi() {
  const selectors = [
    '[data-cart-toggle]',
    '.cart-icon-bubble',
    '.js-drawer-open-cart',
    '.header__icon--cart button',
    '.site-header__cart',
    'button[aria-controls*="CartDrawer"]',
    '[href="/cart"]',
  ];

  const detailsDrawer = document.querySelector('details[id*="CartDrawer"], details[data-cart-drawer]') as HTMLDetailsElement | null;
  if (detailsDrawer) {
    detailsDrawer.open = true;
    return true;
  }

  const cartDrawer = document.querySelector('cart-drawer, cart-notification, [id*="CartDrawer"]') as (HTMLElement & { open?: () => void; show?: () => void }) | null;
  if (cartDrawer) {
    cartDrawer.setAttribute('open', '');
    cartDrawer.classList.add('active', 'is-open');
    if (typeof cartDrawer.open === 'function') cartDrawer.open();
    if (typeof cartDrawer.show === 'function') cartDrawer.show();
    return true;
  }

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) {
      element.click();
      return true;
    }
  }

  return false;
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
    console.log('Configurator app boot props:', {
      productId: productId || null,
      variantId: variantId || null,
      path: window.location.pathname,
      search: window.location.search,
    });

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

            let shouldResetSubmitting = true;
            try {
              setIsSubmitting(true);
              setSubmittingAction('cart');

              const resolvedShopifyIds = resolveRuntimeShopifyIds(productId, variantId, appLayoutRef.current);
              console.log('Resolved Shopify IDs for cart:', resolvedShopifyIds);
              if (!resolvedShopifyIds.variantId) {
                console.warn('No Shopify variant ID resolved for cart submission.', resolvedShopifyIds.debug);
              }

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
                shopifyProductId: resolvedShopifyIds.productId,
                shopifyVariantId: resolvedShopifyIds.variantId,
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
              // Retry with backoff because newly created variants may take a moment
              // to propagate to Shopify's storefront API.
              const cartProperties: Record<string, string> = {};
              for (const prop of (data.properties || [])) {
                cartProperties[prop.key] = prop.value;
              }

              const cartPayload = JSON.stringify({
                items: [{
                  id: Number(data.variantId),
                  quantity: data.quantity,
                  properties: cartProperties,
                }],
              });

              let cartRes: Response | null = null;
              let cartErrorText = '';
              const maxRetries = 3;
              for (let attempt = 0; attempt < maxRetries; attempt++) {
                if (attempt > 0) {
                  console.log(`[CART] Retry ${attempt}/${maxRetries - 1} — waiting ${attempt * 1000}ms for variant propagation...`);
                  await new Promise(r => setTimeout(r, attempt * 1000));
                }

                cartRes = await fetch('/cart/add.js', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: cartPayload,
                });

                if (cartRes.ok) break;

                cartErrorText = await cartRes.text();
                const isSoldOut = cartErrorText.toLowerCase().includes('sold out') || cartErrorText.toLowerCase().includes('not available');
                if (!isSoldOut) break; // non-inventory error, don't retry
                console.warn(`[CART] /cart/add.js returned sold out on attempt ${attempt + 1}:`, cartErrorText.slice(0, 200));
              }

              if (!cartRes || !cartRes.ok) {
                let cartMessage = 'Failed to add item to cart';
                try {
                  const cartErrorJson = JSON.parse(cartErrorText);
                  cartMessage = cartErrorJson?.description || cartErrorJson?.message || cartMessage;
                } catch {
                  if (cartErrorText) cartMessage = cartErrorText;
                }
                console.error('Shopify cart add error:', cartRes?.status, cartErrorText);
                throw new Error(cartMessage);
              }

              // Step 3: Verify the cart actually updated before navigating away.
              const verifiedCartRes = await fetch('/cart.js', {
                headers: { Accept: 'application/json' },
                cache: 'no-store',
              });

              const verifiedCart = await verifiedCartRes.json().catch(() => null) as ShopifyCart | null;
              console.log('Verified storefront cart after add:', {
                status: verifiedCartRes.status,
                itemCount: verifiedCart?.item_count ?? null,
                variantId: data.variantId,
              });

              if (!verifiedCartRes.ok || !verifiedCart || typeof verifiedCart.item_count !== 'number') {
                throw new Error('Shopify cart could not be verified after add.');
              }

              const addedVariantId = Number(data.variantId);
              const variantPresent = !!verifiedCart.items?.some((item) => {
                const itemVariantId = Number(item.variant_id ?? item.id);
                return Number.isFinite(itemVariantId) && itemVariantId === addedVariantId;
              });

              if (!variantPresent) {
                console.warn('Added variant was not found in verified cart payload.', {
                  addedVariantId,
                  cart: verifiedCart,
                });
              }

              updateCartBadgeCount(verifiedCart.item_count);
              dispatchCartSyncEvents(verifiedCart);
              tryOpenCartUi();

              // The host theme drawer is not reliably reactive, so finish with a hard
              // cart-page navigation to guarantee the customer sees the fresh cart state.
              saveConfigForRestore();
              shouldResetSubmitting = false;
              window.location.assign('/cart');
              return;

            } catch (err: any) {
              console.error('Add to cart error:', err);
              alert(`Failed to add to cart: ${err.message}`);
            } finally {
              if (shouldResetSubmitting) {
                setIsSubmitting(false);
                setSubmittingAction(null);
              }
            }
          }}
          onBuyNow={async () => {
            if (isSubmitting) return;
            const apiBase = (window as any).__chaseApiBase || '';
            if (!apiBase) {
              alert('Configuration error: API base not found. Are you running this via the Shopify integration?');
              return;
            }

            let shouldResetSubmitting = true;
            try {
              setIsSubmitting(true);
              setSubmittingAction('buy');

              const resolvedShopifyIds = resolveRuntimeShopifyIds(productId, variantId, appLayoutRef.current);
              console.log('Resolved Shopify IDs for checkout:', resolvedShopifyIds);
              if (!resolvedShopifyIds.variantId) {
                console.warn('No Shopify variant ID resolved for express checkout submission.', resolvedShopifyIds.debug);
              }

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
                shopifyProductId: resolvedShopifyIds.productId,
                shopifyVariantId: resolvedShopifyIds.variantId,
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
                shouldResetSubmitting = false;
                window.location.href = data.checkout_url;
                return;
              } else {
                throw new Error(data?.error || 'No checkout URL returned');
              }
            } catch (err: any) {
              console.error('Buy now error:', err);
              alert(`Failed to create order: ${err.message}`);
            } finally {
              if (shouldResetSubmitting) {
                setIsSubmitting(false);
                setSubmittingAction(null);
              }
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
