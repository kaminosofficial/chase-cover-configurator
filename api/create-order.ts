import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchPricingFromPublicSheet, getStormCollarPrice } from '../lib/pricing-sheet.js';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN; // shpat_...
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SHOPIFY_TOKEN_URL = `https://${SHOPIFY_STORE}/admin/oauth/access_token`;

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
    collarA?: { dia: number; height: number; centered: boolean; offset1: number; offset2: number; offset3: number; offset4: number; stormCollar?: boolean };
    collarB?: { dia: number; height: number; centered: boolean; offset1: number; offset2: number; offset3: number; offset4: number; stormCollar?: boolean };
    collarC?: { dia: number; height: number; centered: boolean; offset1: number; offset2: number; offset3: number; offset4: number; stormCollar?: boolean };
    quantity: number;
    notes: string;
    shopifyProductId?: string;
    shopifyVariantId?: string;
}

// In-memory cache for the Shopify Admin API token
let shopifyTokenCache: { token: string; expiresAt: number } | null = null;

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getShopifyAccessToken() {
    // 1. Prefer static token if provided
    if (SHOPIFY_ACCESS_TOKEN) return SHOPIFY_ACCESS_TOKEN;

    // 2. Fallback to dynamic token from cache
    if (shopifyTokenCache && shopifyTokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
        return shopifyTokenCache.token;
    }

    // 3. Generate dynamic token via OAuth client_credentials
    if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
        throw new Error('Missing Shopify Credentials. Please provide SHOPIFY_ACCESS_TOKEN or CLIENT_ID/SECRET.');
    }

    const tokenBody = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
    });

    let lastStatus = 0;
    let lastText = '';

    for (let attempt = 1; attempt <= 2; attempt++) {
        const res = await fetch(SHOPIFY_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenBody.toString(),
        });

        if (res.ok) {
            const data = await res.json();
            const expiresIn = data.expires_in || 3600;

            shopifyTokenCache = {
                token: data.access_token,
                expiresAt: Date.now() + expiresIn * 1000
            };

            return data.access_token;
        }

        lastStatus = res.status;
        lastText = await res.text();

        if (attempt < 2 && [502, 503, 504].includes(res.status)) {
            await wait(500 * attempt);
            continue;
        }

        break;
    }

    console.error('Shopify Auth Error:', lastText);

    if (lastText.includes('shop_not_permitted')) {
        throw new Error(
            'Failed to generate Shopify access token: Shopify rejected client_credentials for this shop. ' +
            'Confirm the app was created in the Dev Dashboard, released with the required Admin API scopes, ' +
            'and installed on this exact store under the same organization that owns the app.'
        );
    }

    throw new Error(`Failed to generate Shopify access token: ${lastStatus} ${lastText}`);
}

async function fetchPricingFromSheet() {
    return fetchPricingFromPublicSheet(GOOGLE_SHEET_ID, 'pricing');
}

function computePrice(config: OrderConfig, p: Awaited<ReturnType<typeof fetchPricingFromSheet>>): number {
    const base = p.AREA_RATE * config.w * config.l + p.LINEAR_RATE * (config.w + config.l) + p.BASE_FIXED;

    // Storm collar cost: one collar per hole where stormCollar is enabled
    let stormCollarCost = 0;
    const collars = [config.collarA, config.collarB, config.collarC];
    for (let i = 0; i < config.holes; i++) {
        const c = collars[i];
        if (c?.stormCollar) stormCollarCost += getStormCollarPrice(c.dia, p.STORM_COLLAR_PRICES ?? {});
    }

    const subtotal = base
        + config.holes * p.HOLE_PRICE
        + (config.sk >= p.SKIRT_THRESHOLD ? p.SKIRT_SURCHARGE : 0)
        + (config.pc ? p.POWDER_COAT : 0)
        + stormCollarCost;
    return subtotal * (p.GAUGE_MULT[config.gauge] || 1) * (p.MATERIAL_MULT[config.mat] || 1);
}

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

function buildHoleProperties(config: OrderConfig): { name: string; value: string }[] {
    const props: { name: string; value: string }[] = [];
    const collars = [
        { label: 'H1', data: config.collarA },
        { label: 'H2', data: config.collarB },
        { label: 'H3', data: config.collarC },
    ];
    for (let i = 0; i < config.holes; i++) {
        const c = collars[i];
        if (!c.data) continue;
        const prefix = config.holes === 1 ? '' : `${c.label} `;
        props.push({ name: `${prefix}Diameter`, value: `${formatFrac(c.data.dia)}"` });
        props.push({ name: `${prefix}Collar Height`, value: `${formatFrac(c.data.height)}"` });
        if (c.data.centered) {
            props.push({ name: `${prefix}Position`, value: 'Centered on cover' });
        } else {
            props.push({ name: `${prefix}A1 (Top)`, value: `${formatFrac(c.data.offset3)}"` });
            props.push({ name: `${prefix}A2 (Right)`, value: `${formatFrac(c.data.offset4)}"` });
            props.push({ name: `${prefix}A3 (Bottom)`, value: `${formatFrac(c.data.offset1)}"` });
            props.push({ name: `${prefix}A4 (Left)`, value: `${formatFrac(c.data.offset2)}"` });
        }
    }
    return props;
}

function buildLineItemDescription(config: OrderConfig): string {
    const lines: string[] = [];
    lines.push(`${formatFrac(config.w)}" W × ${formatFrac(config.l)}" L × ${formatFrac(config.sk)}" Skirt`);
    lines.push(`Material: ${config.mat === 'copper' ? 'Copper' : 'Galvanized'} | Gauge: ${config.gauge}ga`);
    lines.push(`Drip Edge: ${config.drip ? 'Yes' : 'No'} | Diagonal Crease: ${config.diag ? 'Yes' : 'No'}`);
    if (config.pc) lines.push(`Powder Coat: ${config.pcCol}`);

    const collars = [
        { label: 'H1', data: config.collarA },
        { label: 'H2', data: config.collarB },
        { label: 'H3', data: config.collarC },
    ];
    for (let i = 0; i < config.holes; i++) {
        const c = collars[i];
        if (c.data) {
            let desc = `${c.label}: ⌀${formatFrac(c.data.dia)}" × ${formatFrac(c.data.height)}" tall`;
            if (c.data.centered) {
                desc += ' (centered)';
            } else {
                desc += ` [Top:${formatFrac(c.data.offset3)}" Right:${formatFrac(c.data.offset4)}" Bottom:${formatFrac(c.data.offset1)}" Left:${formatFrac(c.data.offset2)}"]`;
            }
            lines.push(desc);
        }
    }

    if (config.notes) lines.push(`Notes: ${config.notes}`);
    return lines.join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const config: OrderConfig = req.body;
        console.log('[DEBUG] Handler request body:', JSON.stringify(config));

        // Validate required fields
        if (!config.w || !config.l || !config.sk || !config.mat || !config.gauge) {
            console.error('[DEBUG] Validation failed missing fields');
            return res.status(400).json({ error: 'Missing required configuration fields' });
        }

        // 1. Get Shopify Token dynamically
        console.log('[DEBUG] Fetching Shopify token...');
        const shopifyAccessToken = await getShopifyAccessToken();
        console.log('[DEBUG] Shopify token obtained.');

        // 2. Fetch pricing from Google Sheet (server-side — tamper-proof)
        console.log('[DEBUG] Fetching pricing from sheet...');
        const pricing = await fetchPricingFromSheet();
        console.log('[DEBUG] Pricing fetched.');

        // 3. Calculate price server-side
        const unitPrice = computePrice(config, pricing);
        console.log('[DEBUG] Calculated unitPrice:', unitPrice);
        const quantity = Math.max(1, Math.min(99, Math.round(config.quantity || 1)));

        // 4. Build human-readable description
        const description = buildLineItemDescription(config);

        // 5. Create Shopify Draft Order via Admin API
        const draftOrderPayload = {
            draft_order: {
                line_items: [
                    {
                        title: 'Custom Chase Cover',
                        price: unitPrice.toFixed(2),
                        quantity: quantity,
                        requires_shipping: true,
                        taxable: true,
                        ...(config.shopifyVariantId ? { variant_id: Number(config.shopifyVariantId) } : {}),
                        ...(config.shopifyProductId && !config.shopifyVariantId ? { product_id: Number(config.shopifyProductId) } : {}),
                        properties: [
                            { name: 'Width', value: `${formatFrac(config.w)}"` },
                            { name: 'Length', value: `${formatFrac(config.l)}"` },
                            { name: 'Skirt Height', value: `${formatFrac(config.sk)}"` },
                            { name: 'Material', value: config.mat === 'copper' ? 'Copper' : 'Galvanized' },
                            { name: 'Gauge', value: `${config.gauge}ga` },
                            { name: 'Drip Edge', value: config.drip ? 'Yes' : 'No' },
                            { name: 'Diagonal Crease', value: config.diag ? 'Yes' : 'No' },
                            ...(config.pc ? [{ name: 'Powder Coat Color', value: config.pcCol }] : []),
                            { name: 'Holes', value: `${config.holes}` },
                            ...buildHoleProperties(config),
                            ...(config.notes ? [{ name: 'Special Notes', value: config.notes }] : []),
                            { name: '_config_json', value: JSON.stringify(config) },
                        ],
                    },
                ],
                note: description,
                use_customer_default_address: true,
            },
        };
        console.log('[DEBUG] Draft Order Payload:', JSON.stringify(draftOrderPayload));

        console.log('[DEBUG] Sending request to Shopify...');
        const shopifyRes = await fetch(
            `https://${SHOPIFY_STORE}/admin/api/2025-10/draft_orders.json`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': shopifyAccessToken,
                },
                body: JSON.stringify(draftOrderPayload),
            }
        );

        if (!shopifyRes.ok) {
            const errorText = await shopifyRes.text();
            console.error('Shopify API error:', shopifyRes.status, errorText);
            return res.status(502).json({ error: 'Failed to create order', shopifyStatus: shopifyRes.status, details: errorText });
        }

        const shopifyData = await shopifyRes.json();
        const invoiceUrl = shopifyData.draft_order.invoice_url;

        return res.status(200).json({ checkout_url: invoiceUrl });
    } catch (err: any) {
        console.error('Create order error:', err?.stack || err);
        return res.status(500).json({ error: err.message || 'Internal server error', stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined });
    }
}
