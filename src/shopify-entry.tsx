/**
 * Chase Configurator – Shopify IIFE Entry Point (Shadow DOM)
 * ===========================================================
 * Renders the React app inside a Shadow DOM for complete style isolation
 * from Shopify theme CSS.
 *
 * AR/QR overlays are portaled to the light DOM so <model-viewer> AR works.
 *
 * Usage in Shopify Liquid:
 *   <chase-configurator style="display:block;width:100%;height:800px;"></chase-configurator>
 *   <script src="{{ 'chase-configurator.iife.js' | asset_url }}"></script>
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { loadPricingFromAPI } from './config/pricing';
// Import CSS as raw string (Vite ?inline) so we can inject into Shadow DOM
import cssText from './styles/globals-scoped.css?inline';

(function () {
    'use strict';

    const patchViewportForIOS = () => {
        const isIOS =
            /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (!isIOS) return;

        let viewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            document.head.appendChild(viewport);
        }

        const existingContent = viewport.getAttribute('content') || 'width=device-width, initial-scale=1';
        const entries = new Map<string, string>();
        for (const part of existingContent.split(',')) {
            const [rawKey, rawValue] = part.split('=');
            const key = rawKey?.trim();
            if (!key) continue;
            entries.set(key.toLowerCase(), rawValue?.trim() ?? '');
        }

        entries.set('maximum-scale', '1.0');
        entries.set('user-scalable', '0');

        const nextContent = Array.from(entries.entries())
            .map(([key, value]) => (value ? `${key}=${value}` : key))
            .join(', ');

        viewport.setAttribute('content', nextContent);
    };

    patchViewportForIOS();

    // 1. Inject Google Fonts into document head (must be in light DOM for fonts to load)
    const FONT_ID = 'chase-configurator-fonts';
    if (!document.getElementById(FONT_ID)) {
        const link = document.createElement('link');
        link.id = FONT_ID;
        link.rel = 'stylesheet';
        link.href =
            'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap';
        document.head.appendChild(link);
    }

    // 2. Inject QRious if not already present
    const QRIOUS_ID = 'chase-configurator-qrious';
    if (!document.getElementById(QRIOUS_ID) && !(window as any).QRious) {
        const script = document.createElement('script');
        script.id = QRIOUS_ID;
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js';
        document.head.appendChild(script);
    }

    // 3. Find mount point
    let mount: HTMLElement | null =
        document.querySelector('chase-configurator') ||
        document.getElementById('chase-configurator-mount');

    if (!mount) {
        mount = document.createElement('div');
        mount.id = 'chase-configurator-mount';
        mount.style.cssText = 'width:100%;height:800px;';
        document.body.appendChild(mount);
        console.warn(
            '[ChaseConfigurator] No <chase-configurator> or #chase-configurator-mount found. Created one automatically.'
        );
    }

    if (!mount.style.display) {
        mount.style.display = 'block';
    }
    if (!mount.style.width) {
        mount.style.width = '100%';
    }
    if (!mount.style.height) {
        mount.style.height = '100%';
    }

    // 4. Attach Shadow DOM for complete style isolation
    const shadow = mount.attachShadow({ mode: 'open' });

    // 5. Inject CSS into shadow root
    const style = document.createElement('style');
    style.textContent = cssText;
    shadow.appendChild(style);

    // 6. Create the scoped root wrapper inside the shadow root
    const root = document.createElement('div');
    root.className = 'chase-configurator-root';
    root.style.cssText = 'width:100%;height:100%;';
    shadow.appendChild(root);

    // 7. Create a light-DOM container for AR/QR overlays
    //    (model-viewer needs light DOM for AR to work)
    const portalContainer = document.createElement('div');
    portalContainer.id = 'chase-configurator-portal';
    document.body.appendChild(portalContainer);

    // Inject overlay-specific CSS into light DOM for portaled content.
    // We scope under #chase-configurator-portal so it won't affect the rest of the page.
    const portalStyle = document.createElement('style');
    portalStyle.textContent = `
      #chase-configurator-portal { --bg: #fdfcfb; --surface: #f8f5f1; --border: #ddd8d0; --text: #1c1914; --text-muted: #7a7168; --accent: #4b484b; --sans: "DM Sans", -apple-system, sans-serif; }
      #chase-configurator-portal .ar-overlay { position:fixed; inset:0; z-index:100000; background:rgba(0,0,0,0.85); display:none; align-items:center; justify-content:center; flex-direction:column; }
      #chase-configurator-portal .ar-overlay.active { display:flex; }
      #chase-configurator-portal .ar-overlay model-viewer { width:90vw; height:75vh; max-width:800px; background:#222; border-radius:12px; }
      #chase-configurator-portal .ar-close { position:absolute; top:20px; right:24px; width:40px; height:40px; border:none; background:rgba(255,255,255,0.15); color:#fff; font-size:22px; border-radius:50%; cursor:pointer; backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:100001; padding:0; line-height:1; }
      #chase-configurator-portal .ar-close:hover { background:rgba(255,255,255,0.3); }
      #chase-configurator-portal .ar-loading { color:#fff; font-family:var(--sans); font-size:13px; margin-top:12px; }
      #chase-configurator-portal .qr-overlay { position:fixed; inset:0; z-index:100000; background:rgba(0,0,0,0.85); display:none; align-items:center; justify-content:center; flex-direction:column; backdrop-filter:blur(5px); }
      #chase-configurator-portal .qr-overlay.active { display:flex; }
      #chase-configurator-portal .qr-card { background:var(--bg); padding:30px; border-radius:16px; text-align:center; max-width:90vw; width:320px; position:relative; font-family:var(--sans); }
      #chase-configurator-portal .qr-close { position:absolute; top:10px; right:12px; background:none; border:none; font-size:20px; color:var(--text-muted); cursor:pointer; padding:0; line-height:1; }
      #chase-configurator-portal .qr-close:hover { color:var(--text); }
      #chase-configurator-portal .qr-title { font-family:var(--sans); font-size:18px; font-weight:700; margin-bottom:10px; color:var(--text); }
      #chase-configurator-portal .qr-desc { font-family:var(--sans); font-size:13px; color:var(--text-muted); margin-bottom:20px; line-height:1.5; }
      #chase-configurator-portal .qr-canvas-container { background:#fff; padding:10px; border-radius:8px; border:1px solid var(--border); display:inline-flex; align-items:center; justify-content:center; }
      #chase-configurator-portal .ar-mobile-prompt { position:fixed; inset:0; z-index:100000; background:var(--bg); display:none; align-items:center; justify-content:center; flex-direction:column; text-align:center; padding:24px; }
      #chase-configurator-portal .ar-mobile-prompt.active { display:flex; }
      #chase-configurator-portal .ar-mobile-prompt h2 { font-size:22px; margin-bottom:12px; font-family:var(--sans); color:var(--text); font-weight:700; }
      #chase-configurator-portal .ar-mobile-prompt p { font-size:15px; color:var(--text-muted); margin-bottom:30px; font-family:var(--sans); }
      #chase-configurator-portal .launch-ar-big-btn { padding:16px 32px; font-size:18px; font-weight:700; font-family:var(--sans); background:var(--accent); color:#fff; border:none; border-radius:30px; cursor:pointer; box-shadow:0 4px 15px rgba(0,0,0,0.2); }
    `;
    document.head.appendChild(portalStyle);

    // Expose the portal container so App.tsx can use it via React portals
    (window as any).__chasePortalContainer = portalContainer;

    // 8. Detect API base URL from the script's own src attribute
    const IIFE_FILENAME = 'chase-configurator';
    let scriptSrc = '';
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
        if (scripts[i].src.includes(IIFE_FILENAME)) {
            scriptSrc = scripts[i].src;
            break;
        }
    }
    const apiBase = scriptSrc ? new URL(scriptSrc).origin : window.location.origin;
    (window as any).__chaseApiBase = apiBase;

    // Fetch pricing from Google Sheets via Vercel API
    loadPricingFromAPI(apiBase);

    // Read Shopify product/variant IDs from the liquid DOM node
    const productId = mount.getAttribute('product-id') || undefined;
    const variantId = mount.getAttribute('variant-id') || undefined;

    // 9. Render the React app into the shadow root
    ReactDOM.createRoot(root).render(
        <React.StrictMode>
            <App productId={productId} variantId={variantId} />
        </React.StrictMode>
    );
})();
