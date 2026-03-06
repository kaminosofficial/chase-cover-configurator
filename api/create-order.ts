import type { VercelRequest, VercelResponse } from '@vercel/node';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE!;           // e.g. "your-store.myshopify.com"
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID!;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET!;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY!;

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
    collarA?: { dia: number; height: number; centered: boolean; offset1: number; offset2: number; offset3: number; offset4: number };
    collarB?: { dia: number; height: number; centered: boolean; offset1: number; offset2: number; offset3: number; offset4: number };
    collarC?: { dia: number; height: number; centered: boolean; offset1: number; offset2: number; offset3: number; offset4: number };
    quantity: number;
    notes: string;
    shopifyProductId?: string;
    shopifyVariantId?: string;
}

// In-memory cache for the Shopify Admin API token
let shopifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getShopifyAccessToken() {
    // If we have a cached token that expires in more than 5 minutes, use it
    if (shopifyTokenCache && shopifyTokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
        return shopifyTokenCache.token;
    }

    const res = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: SHOPIFY_CLIENT_ID,
            client_secret: SHOPIFY_CLIENT_SECRET,
            grant_type: 'client_credentials'
        })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to generate Shopify access token: ${res.status} ${text}`);
    }

    const data = await res.json();
    const expiresIn = data.expires_in || 3600; // default to 1 hour if not provided

    shopifyTokenCache = {
        token: data.access_token,
        // Calculate expiration timestamp (convert seconds to ms)
        expiresAt: Date.now() + expiresIn * 1000
    };

    return data.access_token;
}

async function fetchPricingFromSheet() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/Sheet1!A1:B20?key=${GOOGLE_SHEETS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google Sheets API error: ${res.status}`);
    const json = await res.json();
    const rows: [string, string][] = json.values || [];

    const pricing: Record<string, number> = {};
    const gaugeMult: Record<number, number> = {};
    const materialMult: Record<string, number> = {};

    for (const [key, value] of rows) {
        const num = parseFloat(value);
        if (key.startsWith('GAUGE_')) gaugeMult[parseInt(key.replace('GAUGE_', ''))] = num;
        else if (key.startsWith('MAT_')) materialMult[key.replace('MAT_', '')] = num;
        else pricing[key] = num;
    }

    return {
        AREA_RATE: pricing.AREA_RATE ?? 0.025,
        LINEAR_RATE: pricing.LINEAR_RATE ?? 0.445,
        BASE_FIXED: pricing.BASE_FIXED ?? 178.03,
        HOLE_PRICE: pricing.HOLE_PRICE ?? 25,
        POWDER_COAT: pricing.POWDER_COAT ?? 45,
        SKIRT_SURCHARGE: pricing.SKIRT_SURCHARGE ?? 75,
        SKIRT_THRESHOLD: pricing.SKIRT_THRESHOLD ?? 6,
        GAUGE_MULT: gaugeMult,
        MATERIAL_MULT: materialMult,
    };
}

function computePrice(config: OrderConfig, p: Awaited<ReturnType<typeof fetchPricingFromSheet>>): number {
    const base = p.AREA_RATE * config.w * config.l + p.LINEAR_RATE * (config.w + config.l) + p.BASE_FIXED;
    const subtotal = base
        + config.holes * p.HOLE_PRICE
        + (config.sk >= p.SKIRT_THRESHOLD ? p.SKIRT_SURCHARGE : 0)
        + (config.pc ? p.POWDER_COAT : 0);
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
                            { name: 'Skirt', value: `${formatFrac(config.sk)}"` },
                            { name: 'Material', value: config.mat === 'copper' ? 'Copper' : 'Galvanized' },
                            { name: 'Gauge', value: `${config.gauge}ga` },
                            { name: 'Holes', value: `${config.holes}` },
                            { name: 'Drip Edge', value: config.drip ? 'Yes' : 'No' },
                            { name: 'Diagonal Crease', value: config.diag ? 'Yes' : 'No' },
                            ...(config.pc ? [{ name: 'Powder Coat', value: config.pcCol }] : []),
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
            `https://${SHOPIFY_STORE}/admin/api/2024-01/draft_orders.json`,
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
            console.error('Shopify API error:', errorText);
            return res.status(500).json({ error: 'Failed to create order' });
        }

        const shopifyData = await shopifyRes.json();
        const invoiceUrl = shopifyData.draft_order.invoice_url;

        return res.status(200).json({ checkout_url: invoiceUrl });
    } catch (err: any) {
        console.error('Create order error:', err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
}
