import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchPricingFromPublicSheet, getStormCollarPrice } from '../lib/pricing-sheet.js';
import { getHoleEdgeOffsets, holeWorld } from '../src/utils/geometry.js';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SHOPIFY_PRODUCT_ID = process.env.SHOPIFY_PRODUCT_ID; // fallback product ID
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

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getShopifyAccessToken() {
    if (SHOPIFY_ACCESS_TOKEN) return SHOPIFY_ACCESS_TOKEN;

    if (shopifyTokenCache && shopifyTokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
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
    return data.access_token;
}

/* ------------------------------------------------------------------ */
/*  Pricing (same as create-order)                                     */
/* ------------------------------------------------------------------ */

async function fetchPricingFromSheet() {
    return fetchPricingFromPublicSheet(GOOGLE_SHEET_ID, 'pricing');
}

function computePrice(config: OrderConfig, p: Awaited<ReturnType<typeof fetchPricingFromSheet>>): number {
    const base = p.AREA_RATE * config.w * config.l + p.LINEAR_RATE * (config.w + config.l) + p.BASE_FIXED;

    let stormCollarCost = 0;
    const collars = [config.collarA, config.collarB, config.collarC];
    for (let i = 0; i < config.holes; i++) {
        const c = collars[i];
        if (c?.stormCollar) stormCollarCost += getStormCollarPrice(c.dia, p.STORM_COLLAR_PRICES ?? {});
    }

    const subtotal = base
        + config.holes * p.HOLE_PRICE
        + (config.sk >= p.SKIRT_THRESHOLD ? p.SKIRT_SURCHARGE : 0)
        + (config.pc && config.mat !== 'copper' ? p.POWDER_COAT : 0)
        + stormCollarCost;
    return subtotal * (p.GAUGE_MULT[config.gauge] || 1) * (p.MATERIAL_MULT[config.mat] || 1);
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
        { key: 'Material & Gauge', value: `${config.mat === 'copper' ? 'Copper' : 'Galvanized'} — ${config.gauge}ga` },
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
/*  Shopify Admin API helpers                                          */
/* ------------------------------------------------------------------ */

async function updateVariantPrice(variantId: string, price: string, accessToken: string): Promise<boolean> {
    try {
        const res = await fetch(
            `https://${SHOPIFY_STORE}/admin/api/2025-10/variants/${variantId}.json`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken,
                },
                body: JSON.stringify({
                    variant: { id: Number(variantId), price },
                }),
            }
        );
        if (!res.ok) {
            const text = await res.text();
            console.error('[CART] Failed to update variant price:', res.status, text);
            return false;
        }
        console.log('[CART] Variant price updated to', price);
        return true;
    } catch (err: any) {
        console.error('[CART] Variant price update error:', err.message);
        return false;
    }
}

async function updateProductImage(productId: string, base64DataUrl: string, accessToken: string): Promise<string | undefined> {
    try {
        const match = base64DataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
        if (!match) return undefined;
        const base64Data = match[2];
        const ext = match[1];

        const createRes = await fetch(
            `https://${SHOPIFY_STORE}/admin/api/2025-10/products/${productId}/images.json`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken,
                },
                body: JSON.stringify({
                    image: {
                        attachment: base64Data,
                        filename: `chase-cover-${Date.now()}.${ext}`,
                    },
                }),
            }
        );

        if (!createRes.ok) {
            console.log('[IMAGE] Product image create failed:', createRes.status);
            return undefined;
        }

        const createData = await createRes.json();
        const newImageId = createData?.image?.id;
        const imageUrl = createData?.image?.src;

        // Clean up old images (fire-and-forget)
        if (newImageId) {
            (async () => {
                try {
                    const listRes = await fetch(
                        `https://${SHOPIFY_STORE}/admin/api/2025-10/products/${productId}/images.json`,
                        { headers: { 'X-Shopify-Access-Token': accessToken } }
                    );
                    if (listRes.ok) {
                        const listData = await listRes.json();
                        const oldImages = (listData?.images || []).filter((img: any) => img.id !== newImageId);
                        for (const img of oldImages) {
                            fetch(
                                `https://${SHOPIFY_STORE}/admin/api/2025-10/products/${productId}/images/${img.id}.json`,
                                { method: 'DELETE', headers: { 'X-Shopify-Access-Token': accessToken } }
                            ).catch(() => {});
                        }
                    }
                } catch { /* ignore */ }
            })();
        }

        return imageUrl;
    } catch (err: any) {
        console.log('[IMAGE] Product image update error (non-fatal):', err.message);
        return undefined;
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
        console.log('[CART] Add-to-cart request received, productId:', config.shopifyProductId, 'variantId:', config.shopifyVariantId);

        // Use env var fallback for product ID if frontend didn't pass one
        if (!config.shopifyProductId && SHOPIFY_PRODUCT_ID) {
            config.shopifyProductId = SHOPIFY_PRODUCT_ID;
            console.log('[CART] Using env var SHOPIFY_PRODUCT_ID:', SHOPIFY_PRODUCT_ID);
        }

        // Validate
        if (!config.w || !config.l || !config.sk || !config.mat || !config.gauge) {
            return res.status(400).json({ error: 'Missing required configuration fields' });
        }

        // 1. Auth + pricing in parallel
        const [accessToken, pricing] = await Promise.all([
            getShopifyAccessToken(),
            fetchPricingFromSheet(),
        ]);

        // If variantId is missing, fetch the first variant from the product
        if (!config.shopifyVariantId && config.shopifyProductId) {
            console.log('[CART] No variantId provided, fetching from product', config.shopifyProductId);
            try {
                const prodRes = await fetch(
                    `https://${SHOPIFY_STORE}/admin/api/2025-10/products/${config.shopifyProductId}.json?fields=id,variants`,
                    { headers: { 'X-Shopify-Access-Token': accessToken } }
                );
                if (prodRes.ok) {
                    const prodData = await prodRes.json();
                    const firstVariant = prodData?.product?.variants?.[0];
                    if (firstVariant?.id) {
                        config.shopifyVariantId = String(firstVariant.id);
                        console.log('[CART] Resolved variantId:', config.shopifyVariantId);
                    }
                }
            } catch (err: any) {
                console.error('[CART] Failed to fetch product variants:', err.message);
            }
        }

        if (!config.shopifyVariantId) {
            return res.status(400).json({ error: 'Missing shopifyVariantId — cannot add to native cart without a variant. Provide variant-id or product-id in the HTML element.' });
        }

        // 2. Calculate price server-side
        const unitPrice = computePrice(config, pricing);
        const priceStr = unitPrice.toFixed(2);
        console.log('[CART] Calculated price:', priceStr);

        // 3. Update variant price + product image in parallel
        const updates: Promise<any>[] = [
            updateVariantPrice(config.shopifyVariantId, priceStr, accessToken),
        ];

        if (config.image && config.shopifyProductId) {
            updates.push(
                Promise.race([
                    updateProductImage(config.shopifyProductId, config.image, accessToken),
                    wait(8000).then(() => undefined),
                ])
            );
        }

        const [priceUpdated] = await Promise.all(updates);

        if (!priceUpdated) {
            return res.status(502).json({ error: 'Failed to update variant price on Shopify' });
        }

        // 4. Build the line item properties for the frontend to use with /cart/add.js
        const properties = buildCartProperties(config);
        const quantity = Math.max(1, Math.min(99, Math.round(config.quantity || 1)));

        return res.status(200).json({
            success: true,
            variantId: config.shopifyVariantId,
            quantity,
            price: priceStr,
            properties,
        });
    } catch (err: any) {
        console.error('[CART] Add-to-cart error:', err?.stack || err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
}
