import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchPricingFromPublicSheet, getStormCollarPrice } from '../lib/pricing-sheet.js';
import { getHoleEdgeOffsets, holeWorld } from '../src/utils/geometry.js';
import { computePricingBreakdown } from '../src/utils/pricing.js';

const SHOPIFY_STORE = (process.env.SHOPIFY_STORE || '').trim();
const SHOPIFY_ACCESS_TOKEN = (process.env.SHOPIFY_ACCESS_TOKEN || '').trim() || undefined;
const SHOPIFY_CLIENT_ID = (process.env.SHOPIFY_CLIENT_ID || '').trim() || undefined;
const SHOPIFY_CLIENT_SECRET = (process.env.SHOPIFY_CLIENT_SECRET || '').trim() || undefined;
const GOOGLE_SHEET_ID = (process.env.GOOGLE_SHEET_ID || '').trim();
const SHOPIFY_PRODUCT_ID = (process.env.SHOPIFY_PRODUCT_ID || '').trim() || undefined; // fallback product ID
const SHOPIFY_TOKEN_URL = `https://${SHOPIFY_STORE}/admin/oauth/access_token`;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CollarConfig {
    shape?: 'round' | 'rect';
    dia: number;
    rectWidth?: number;
    rectLength?: number;
    height: number;
    centered: boolean;
    offset1: number;
    offset2: number;
    offset3: number;
    offset4: number;
    stormCollar?: boolean;
}

interface OrderConfig {
    w: number;
    l: number;
    sk: number;
    drip: boolean;
    diag: boolean;
    mat: string;
    gauge: number;
    pc: boolean;
    pcCol: string;
    holes: number;
    collarA?: CollarConfig;
    collarB?: CollarConfig;
    collarC?: CollarConfig;
    holeCutoutA?: string;
    holeCutoutB?: string;
    holeCutoutC?: string;
    quantity: number;
    notes: string;
    shopifyProductId?: string;
    shopifyVariantId?: string;
    image?: string;
}

/* ------------------------------------------------------------------ */
/*  Shopify Auth (same as create-order)                                */
/* ------------------------------------------------------------------ */

let shopifyTokenCache: { token: string; expiresAt: number } | null = null;

function applyProductIdFallback(config: OrderConfig) {
    if (!config.shopifyProductId && SHOPIFY_PRODUCT_ID) {
        config.shopifyProductId = SHOPIFY_PRODUCT_ID;
        console.log('[CART] Using env var SHOPIFY_PRODUCT_ID:', SHOPIFY_PRODUCT_ID);
    }
}

async function getShopifyAccessToken() {
    if (SHOPIFY_ACCESS_TOKEN) {
        console.log('[CART] Using static SHOPIFY_ACCESS_TOKEN');
        return SHOPIFY_ACCESS_TOKEN;
    }

    if (shopifyTokenCache && shopifyTokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
        console.log('[CART] Using cached OAuth token');
        return shopifyTokenCache.token;
    }

    if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
        throw new Error('Missing Shopify Credentials.');
    }

    const tokenBody = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
    });

    const res = await fetch(SHOPIFY_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Shopify token request failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    const expiresIn = data.expires_in || 3600;
    shopifyTokenCache = { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
    console.log('[CART] Received OAuth token, expires in', expiresIn, 'seconds');
    return data.access_token;
}

/* ------------------------------------------------------------------ */
/*  Pricing (same as create-order)                                     */
/* ------------------------------------------------------------------ */

async function fetchPricingFromSheet() {
    return fetchPricingFromPublicSheet(GOOGLE_SHEET_ID, 'pricing');
}

/* ------------------------------------------------------------------ */
/*  Formatting helpers (same as create-order)                          */
/* ------------------------------------------------------------------ */

function formatFrac(n: number): string {
    const whole = Math.floor(n);
    const frac = n - whole;
    const eighths = Math.round(frac * 8);
    if (eighths === 0) return `${whole}`;
    if (eighths === 4) return `${whole} 1/2`;
    if (eighths === 2) return `${whole} 1/4`;
    if (eighths === 6) return `${whole} 3/4`;
    return `${whole} ${eighths}/8`;
}

function getColorName(hex: string): string {
    const map: Record<string, string> = {
        '#0b0e0f': 'Jet Black', '#000000': 'Black', '#ffffff': 'White',
        '#940604': 'Ruby Red', '#cc0605': 'Flame Red', '#a42b26': 'Wine Red',
        '#0e4a6b': 'Gentian Blue', '#1f4e79': 'Steel Blue', '#1d5e8c': 'Signal Blue',
        '#354733': 'Chrome Green', '#35683a': 'Leaf Green', '#4f8c45': 'Yellow Green',
        '#f9b000': 'Rape Yellow', '#e59800': 'Golden Yellow', '#fd9d00': 'Signal Yellow',
        '#b8c4cc': 'Galvanized Silver', '#e09a72': 'Copper',
    };
    const lower = hex.toLowerCase();
    if (map[lower]) return map[lower];
    const r = parseInt(lower.slice(1, 3), 16);
    const g = parseInt(lower.slice(3, 5), 16);
    const b = parseInt(lower.slice(5, 7), 16);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lum = (max + min) / 2;
    if (max - min < 30) {
        if (lum < 50) return 'Black';
        if (lum > 220) return 'White';
        return 'Grey';
    }
    if (r >= g && r >= b) return g > 150 ? 'Orange' : 'Red';
    if (g >= r && g >= b) return 'Green';
    return 'Blue';
}

function getMaterialLabel(material: string): string {
    if (material === 'copper') return 'Copper';
    return 'Stainless Steel';
}

function getHoleCutoutValue(id: 'A' | 'B' | 'C', config: OrderConfig): string {
    const cachedValue = id === 'A'
        ? config.holeCutoutA
        : id === 'B'
            ? config.holeCutoutB
            : config.holeCutoutC;
    if (cachedValue) return cachedValue;

    const state = {
        ...config,
        showLabels: false, showLabelsA: false, showLabelsB: false, showLabelsC: false,
        price: 0, orbitEnabled: true, moveHolesMode: false,
        setOrbitEnabled: () => undefined, setMoveHolesMode: () => undefined,
        set: () => undefined, setCollar: () => undefined,
    } as any;

    const hole = holeWorld(id, state);
    const offsets = getHoleEdgeOffsets(hole, state);
    return `${id}1(Top): ${formatFrac(offsets.top)}" | ${id}2(Right): ${formatFrac(offsets.right)}" | ${id}3(Bottom): ${formatFrac(offsets.bottom)}" | ${id}4(Left): ${formatFrac(offsets.left)}"`;
}

function getHolePositionLabel(index: number, total: number): string {
    if (total === 1) return '';
    if (total === 2) return index === 0 ? 'Left' : 'Right';
    return index === 0 ? 'Left' : index === 1 ? 'Middle' : 'Right';
}

/* ------------------------------------------------------------------ */
/*  Build line item properties (for Shopify cart)                       */
/* ------------------------------------------------------------------ */

function buildCartProperties(config: OrderConfig): { key: string; value: string }[] {
    const props: { key: string; value: string }[] = [
        { key: 'Dimensions', value: `${formatFrac(config.l)}" L × ${formatFrac(config.w)}" W × ${formatFrac(config.sk)}" Skirt` },
        { key: 'Material & Gauge', value: `${getMaterialLabel(config.mat)} — ${config.gauge}ga` },
        { key: 'Options', value: `Drip Edge: ${config.drip ? 'Yes' : 'No'} · Diagonal Crease: ${config.diag ? 'Yes' : 'No'}` },
    ];

    if (config.pc && config.mat !== 'copper') {
        props.push({ key: 'Powder Coat', value: `${getColorName(config.pcCol)} (${config.pcCol})` });
    }

    props.push({ key: 'Holes', value: `${config.holes}` });

    // Hole details
    const collars = [
        { label: 'H1', id: 'A' as const, data: config.collarA },
        { label: 'H2', id: 'B' as const, data: config.collarB },
        { label: 'H3', id: 'C' as const, data: config.collarC },
    ];
    for (let i = 0; i < config.holes; i++) {
        const c = collars[i];
        if (!c.data) continue;
        const posLabel = getHolePositionLabel(i, config.holes);
        const label = config.holes === 1 ? 'Hole' : `${c.label} (${posLabel})`;
        const isRect = c.data.shape === 'rect';

        if (isRect) {
            const rw = formatFrac(c.data.rectWidth ?? c.data.dia);
            const rl = formatFrac(c.data.rectLength ?? c.data.dia);
            props.push({ key: label, value: `Rectangle ${rw}" × ${rl}" — Collar ${formatFrac(c.data.height)}" tall` });
        } else {
            props.push({ key: label, value: `Round ⌀${formatFrac(c.data.dia)}" — Collar ${formatFrac(c.data.height)}" tall` });
        }

        const cutoutOffsets = getHoleCutoutValue(c.id, config);
        props.push({
            key: `${config.holes === 1 ? '' : c.label + ' '}Position`,
            value: c.data.centered ? `Centered on cover | ${cutoutOffsets}` : cutoutOffsets,
        });
    }

    if (config.notes) {
        props.push({ key: 'Special Notes', value: config.notes });
    }

    // Hidden metadata (underscore-prefixed properties are hidden in Shopify cart/checkout UI)
    props.push({ key: '_config_json', value: JSON.stringify({ ...config, image: undefined }) });

    return props;
}

/* ------------------------------------------------------------------ */
/*  Shopify Admin API — Create variant with unique price               */
/* ------------------------------------------------------------------ */

function generateVariantOptionValue(): string {
    const ts = Date.now();
    const rand = Math.random().toString(16).slice(2, 6);
    return `CC-${ts}-${rand}`;
}

interface VariantCreateResult {
    ok: boolean;
    variantId?: string;
    error?: string;
    status?: number;
}

async function createVariant(
    productId: string,
    price: string,
    accessToken: string
): Promise<VariantCreateResult> {
    const optionValue = generateVariantOptionValue();
    console.log('[CART] Creating variant:', { productId, price, optionValue });

    const createRes = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2025-10/products/${productId}/variants.json`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
                variant: {
                    option1: optionValue,
                    price,
                    inventory_policy: 'continue',
                    inventory_management: null,
                },
            }),
        }
    );

    const resText = await createRes.text();
    if (createRes.ok) {
        let parsed: any;
        try { parsed = JSON.parse(resText); } catch { parsed = undefined; }
        const newVariantId = parsed?.variant?.id;
        const inventoryItemId = parsed?.variant?.inventory_item_id;
        if (newVariantId) {
            console.log('[CART] Variant created:', { variantId: String(newVariantId), price, optionValue, inventoryItemId });

            // Disable inventory tracking so the variant is never "sold out"
            if (inventoryItemId) {
                try {
                    const invRes = await fetch(
                        `https://${SHOPIFY_STORE}/admin/api/2025-10/inventory_items/${inventoryItemId}.json`,
                        {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Shopify-Access-Token': accessToken,
                            },
                            body: JSON.stringify({ inventory_item: { tracked: false } }),
                        }
                    );
                    console.log('[CART] Inventory tracking disabled:', invRes.ok ? 'success' : invRes.status);
                } catch (err: any) {
                    console.warn('[CART] Failed to disable inventory tracking:', err.message);
                }
            }

            return { ok: true, variantId: String(newVariantId) };
        }
        return { ok: false, error: 'Variant created but no ID in response', status: 200 };
    }

    console.error('[CART] Variant creation failed:', { status: createRes.status, body: resText.slice(0, 500) });
    return { ok: false, error: `Shopify returned ${createRes.status}: ${resText.slice(0, 300)}`, status: createRes.status };
}

/** Emergency cleanup: delete CC-* variants older than the given threshold */
async function emergencyCleanup(productId: string, accessToken: string, maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    console.log('[CART] Running emergency cleanup for product', productId);
    try {
        const listRes = await fetch(
            `https://${SHOPIFY_STORE}/admin/api/2025-10/products/${productId}/variants.json?limit=250`,
            { headers: { 'X-Shopify-Access-Token': accessToken } }
        );
        if (!listRes.ok) return 0;

        const listData = await listRes.json();
        const variants = listData?.variants || [];
        const cutoff = Date.now() - maxAgeMs;
        let deleted = 0;

        for (const v of variants) {
            const opt = String(v.option1 || '');
            if (!opt.startsWith('CC-')) continue;
            const createdAt = new Date(v.created_at).getTime();
            if (createdAt >= cutoff) continue;

            const delRes = await fetch(
                `https://${SHOPIFY_STORE}/admin/api/2025-10/products/${productId}/variants/${v.id}.json`,
                { method: 'DELETE', headers: { 'X-Shopify-Access-Token': accessToken } }
            );
            if (delRes.ok) deleted++;
        }

        console.log('[CART] Emergency cleanup deleted', deleted, 'stale variants');
        return deleted;
    } catch (err: any) {
        console.error('[CART] Emergency cleanup error:', err.message);
        return 0;
    }
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const config: OrderConfig = req.body;
        console.log('[CART] Request context:', {
            origin: req.headers.origin || null,
            referer: req.headers.referer || null,
            host: req.headers.host || null,
        });
        console.log('[CART] Add-to-cart request received, productId:', config.shopifyProductId);

        applyProductIdFallback(config);

        // Validate
        if (!config.w || !config.l || !config.sk || !config.mat || !config.gauge) {
            return res.status(400).json({ error: 'Missing required configuration fields' });
        }

        // 1. Auth + pricing in parallel
        const [accessToken, pricing] = await Promise.all([
            getShopifyAccessToken(),
            fetchPricingFromSheet(),
        ]);

        console.log('[CART] Auth OK, store:', SHOPIFY_STORE);

        // 2. Resolve product ID if missing
        if (!config.shopifyProductId) {
            console.log('[CART] No product ID — listing products to find chase cover...');
            try {
                const listRes = await fetch(
                    `https://${SHOPIFY_STORE}/admin/api/2025-10/products.json?limit=50&fields=id,title`,
                    { headers: { 'X-Shopify-Access-Token': accessToken } }
                );
                if (listRes.ok) {
                    const listData = await listRes.json();
                    const products = listData?.products || [];
                    const chaseProduct = products.find((p: any) =>
                        p.title?.toLowerCase().includes('chase')
                    ) || products[0];
                    if (chaseProduct?.id) {
                        config.shopifyProductId = String(chaseProduct.id);
                        console.log('[CART] Resolved product from list:', chaseProduct.title, '→', config.shopifyProductId);
                    }
                }
            } catch (err: any) {
                console.error('[CART] Product list error:', err.message);
            }
        }

        if (!config.shopifyProductId) {
            return res.status(400).json({
                error: 'Could not resolve a Shopify product. Set SHOPIFY_PRODUCT_ID env var in Vercel or pass product-id on the mount element.',
                debug: { envProductId: SHOPIFY_PRODUCT_ID || null, store: SHOPIFY_STORE },
            });
        }

        // 3. Calculate price server-side
        let stormCollarCost = 0;
        const collars = [config.collarA, config.collarB, config.collarC];
        for (let i = 0; i < config.holes; i++) {
            const c = collars[i];
            if (c?.stormCollar) stormCollarCost += getStormCollarPrice(c.dia, pricing.STORM_COLLAR_PRICES ?? {});
        }

        const pricingBreakdown = computePricingBreakdown(config, pricing, stormCollarCost);
        const unitPrice = pricingBreakdown.total;
        const priceStr = unitPrice.toFixed(2);
        console.log('[CART] Pricing breakdown:', { ...pricingBreakdown, paintedEnabled: config.pc });
        console.log('[CART] Calculated price:', priceStr);

        // 4. Create a new variant with the exact price
        const firstAttempt = await createVariant(config.shopifyProductId, priceStr, accessToken);
        let variantId: string | undefined = firstAttempt.variantId;
        let lastError: string = firstAttempt.error || '';

        // If variant limit reached (422), try emergency cleanup and retry once
        if (!firstAttempt.ok && firstAttempt.status === 422) {
            console.warn('[CART] Variant creation returned 422 — attempting emergency cleanup');
            const cleaned = await emergencyCleanup(config.shopifyProductId, accessToken);
            if (cleaned > 0) {
                console.log('[CART] Emergency cleanup freed', cleaned, 'slots — retrying variant creation');
                const retry = await createVariant(config.shopifyProductId, priceStr, accessToken);
                if (retry.ok) {
                    variantId = retry.variantId;
                } else {
                    lastError = retry.error;
                }
            }
        }

        if (!variantId) {
            return res.status(502).json({
                error: `Failed to create variant: ${lastError}`,
                debug: { productId: config.shopifyProductId, store: SHOPIFY_STORE },
            });
        }

        // 5. Build the line item properties for the frontend to use with /cart/add.js
        const properties = buildCartProperties(config);
        const quantity = Math.max(1, Math.min(99, Math.round(config.quantity || 1)));

        return res.status(200).json({
            success: true,
            variantId,
            quantity,
            price: priceStr,
            properties,
        });
    } catch (err: any) {
        console.error('[CART] Add-to-cart error:', err?.stack || err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
}
