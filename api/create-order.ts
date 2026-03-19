import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchPricingFromPublicSheet, getStormCollarPrice } from '../lib/pricing-sheet.js';
import { getHoleEdgeOffsets, holeWorld } from '../src/utils/geometry.js';

const SHOPIFY_STORE = (process.env.SHOPIFY_STORE || '').trim();
const SHOPIFY_ACCESS_TOKEN = (process.env.SHOPIFY_ACCESS_TOKEN || '').trim() || undefined;
const SHOPIFY_CLIENT_ID = (process.env.SHOPIFY_CLIENT_ID || '').trim() || undefined;
const SHOPIFY_CLIENT_SECRET = (process.env.SHOPIFY_CLIENT_SECRET || '').trim() || undefined;
const GOOGLE_SHEET_ID = (process.env.GOOGLE_SHEET_ID || '').trim();
const SHOPIFY_TOKEN_URL = `https://${SHOPIFY_STORE}/admin/oauth/access_token`;

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
    image?: string; // base64 data URL of 3D viewer screenshot
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
        showLabels: false,
        showLabelsA: false,
        showLabelsB: false,
        showLabelsC: false,
        price: 0,
        orbitEnabled: true,
        moveHolesMode: false,
        setOrbitEnabled: () => undefined,
        setMoveHolesMode: () => undefined,
        set: () => undefined,
        setCollar: () => undefined,
    } as any;

    const hole = holeWorld(id, state);
    const offsets = getHoleEdgeOffsets(hole, state);
    return `${id}1(Top): ${formatFrac(offsets.top)}\" | ${id}2(Right): ${formatFrac(offsets.right)}\" | ${id}3(Bottom): ${formatFrac(offsets.bottom)}\" | ${id}4(Left): ${formatFrac(offsets.left)}\"`;
}

// In-memory cache for the Shopify Admin API token
let shopifyTokenCache: { token: string; expiresAt: number } | null = null;

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getShopifyAccessToken() {
    console.log('[AUTH] Starting auth flow...');
    console.log('[AUTH] SHOPIFY_STORE:', SHOPIFY_STORE || '(not set)');
    console.log('[AUTH] SHOPIFY_ACCESS_TOKEN:', SHOPIFY_ACCESS_TOKEN ? `set (${SHOPIFY_ACCESS_TOKEN.substring(0, 8)}...)` : '(not set)');
    console.log('[AUTH] SHOPIFY_CLIENT_ID:', SHOPIFY_CLIENT_ID ? `set (${SHOPIFY_CLIENT_ID.substring(0, 8)}...)` : '(not set)');
    console.log('[AUTH] SHOPIFY_CLIENT_SECRET:', SHOPIFY_CLIENT_SECRET ? `set (${SHOPIFY_CLIENT_SECRET.substring(0, 8)}...)` : '(not set)');

    // 1. Prefer static token if provided
    if (SHOPIFY_ACCESS_TOKEN) {
        console.log('[AUTH] Using static SHOPIFY_ACCESS_TOKEN');
        return SHOPIFY_ACCESS_TOKEN;
    }

    // 2. Fallback to dynamic token from cache
    if (shopifyTokenCache && shopifyTokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
        console.log('[AUTH] Using cached token (expires at', new Date(shopifyTokenCache.expiresAt).toISOString(), ')');
        return shopifyTokenCache.token;
    }

    // 3. Generate dynamic token via OAuth client_credentials
    if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
        throw new Error('Missing Shopify Credentials. Please provide SHOPIFY_ACCESS_TOKEN or CLIENT_ID/SECRET.');
    }

    console.log('[AUTH] Attempting client_credentials grant to', SHOPIFY_TOKEN_URL);

    const tokenBody = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
    });

    let lastStatus = 0;
    let lastText = '';

    for (let attempt = 1; attempt <= 2; attempt++) {
        console.log(`[AUTH] Token request attempt ${attempt}/2`);
        const res = await fetch(SHOPIFY_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenBody.toString(),
        });

        console.log(`[AUTH] Response status: ${res.status}`);

        if (res.ok) {
            const data = await res.json();
            const expiresIn = data.expires_in || 3600;
            console.log('[AUTH] Token obtained successfully, expires in', expiresIn, 'seconds');

            shopifyTokenCache = {
                token: data.access_token,
                expiresAt: Date.now() + expiresIn * 1000
            };

            return data.access_token;
        }

        lastStatus = res.status;
        lastText = await res.text();
        console.error(`[AUTH] Token request failed (attempt ${attempt}):`, lastStatus, lastText);

        if (attempt < 2 && [502, 503, 504].includes(res.status)) {
            await wait(500 * attempt);
            continue;
        }

        break;
    }

    console.error('[AUTH] All token attempts failed. Last error:', lastStatus, lastText);

    if (lastText.includes('shop_not_permitted')) {
        throw new Error(
            'Failed to generate Shopify access token: Shopify rejected client_credentials for this shop. ' +
            'Confirm the app was created in the Dev Dashboard, released with the required Admin API scopes, ' +
            'and installed on this exact store under the same organization that owns the app.'
        );
    }

    if (lastText.includes('application_cannot_be_found')) {
        throw new Error(
            'Failed to generate Shopify access token: Shopify cannot find an app with this client_id. ' +
            'The SHOPIFY_CLIENT_ID may be incorrect or the app may have been deleted. ' +
            'Check your Shopify Partners Dashboard for the correct credentials.'
        );
    }

    throw new Error(`Failed to generate Shopify access token: ${lastStatus} ${lastText}`);
}

/**
 * Upload a base64 data URL image to Shopify using staged uploads (GraphQL).
 * Returns the Shopify-hosted image URL, or undefined on failure.
 */
async function uploadImageToShopify(base64DataUrl: string, accessToken: string): Promise<string | undefined> {
    try {
        // Parse base64
        const match = base64DataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
        if (!match) return undefined;
        const mimeType = `image/${match[1]}`;
        const buffer = Buffer.from(match[2], 'base64');
        const filename = `chase-cover-${Date.now()}.${match[1]}`;

        // Step 1: Create staged upload target
        const stagedRes = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-10/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
                query: `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
                    stagedUploadsCreate(input: $input) {
                        stagedTargets { url resourceUrl parameters { name value } }
                        userErrors { field message }
                    }
                }`,
                variables: {
                    input: [{
                        resource: 'FILE',
                        filename,
                        mimeType,
                        httpMethod: 'PUT',
                    }],
                },
            }),
        });
        const stagedData = await stagedRes.json();
        const target = stagedData?.data?.stagedUploadsCreate?.stagedTargets?.[0];
        if (!target?.url) {
            console.log('[IMAGE] Staged upload failed:', JSON.stringify(stagedData));
            return undefined;
        }

        // Step 2: Upload the binary to the staged URL
        const uploadRes = await fetch(target.url, {
            method: 'PUT',
            headers: { 'Content-Type': mimeType, 'Content-Length': String(buffer.length) },
            body: buffer,
        });
        if (!uploadRes.ok) {
            console.log('[IMAGE] Upload to staged URL failed:', uploadRes.status);
            return undefined;
        }

        // Step 3: Create a file record in Shopify to get a permanent URL
        const fileRes = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-10/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
                query: `mutation fileCreate($files: [FileCreateInput!]!) {
                    fileCreate(files: $files) {
                        files { id alt preview { image { url } } }
                        userErrors { field message }
                    }
                }`,
                variables: {
                    files: [{
                        originalSource: target.resourceUrl,
                        alt: 'Custom Chase Cover Preview',
                        contentType: 'IMAGE',
                    }],
                },
            }),
        });
        const fileData = await fileRes.json();
        const imageUrl = fileData?.data?.fileCreate?.files?.[0]?.preview?.image?.url;
        console.log('[IMAGE] Shopify file created:', imageUrl ? 'success' : 'no url', JSON.stringify(fileData?.data?.fileCreate?.userErrors));
        return imageUrl || undefined;
    } catch (err: any) {
        console.log('[IMAGE] Upload error (non-fatal):', err.message);
        return undefined;
    }
}

/**
 * Update the Shopify product's image so the draft order checkout shows the 3D preview.
 * Creates a new product image from the base64 data, then removes any old images.
 * Returns the new image URL or undefined on failure.
 */
async function updateProductImage(productId: string, base64DataUrl: string, accessToken: string): Promise<string | undefined> {
    try {
        const match = base64DataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
        if (!match) return undefined;
        const base64Data = match[2];
        const ext = match[1];

        // Create new product image directly from base64
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
            const errorText = await createRes.text();
            console.log('[IMAGE] Product image create failed:', createRes.status, errorText);
            return undefined;
        }

        const createData = await createRes.json();
        const newImageId = createData?.image?.id;
        const imageUrl = createData?.image?.src;
        console.log('[IMAGE] Product image created:', imageUrl ? 'success' : 'no url');

        // Clean up old images to prevent accumulation (non-blocking, fire-and-forget)
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
                } catch { /* ignore cleanup errors */ }
            })();
        }

        return imageUrl;
    } catch (err: any) {
        console.log('[IMAGE] Product image update error (non-fatal):', err.message);
        return undefined;
    }
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
        + (config.pc && config.mat !== 'copper' ? p.POWDER_COAT : 0)
        + stormCollarCost;
    return subtotal * (p.GAUGE_MULT[config.gauge] || 1) * (p.MATERIAL_MULT[config.mat] || 1);
}

// Common color name lookup — best-effort from hex
function getColorName(hex: string): string {
    // Well-known basic colors and common RAL picks
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
    // Parse hex to RGB for a rough hue-based name
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

function getHolePositionLabel(index: number, total: number): string {
    if (total === 1) return '';
    if (total === 2) return index === 0 ? 'Left' : 'Right';
    return index === 0 ? 'Left' : index === 1 ? 'Middle' : 'Right';
}

function buildHoleProperties(config: OrderConfig): { name: string; value: string }[] {
    const props: { name: string; value: string }[] = [];
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

        // Shape + Size on one line
        if (isRect) {
            const rw = formatFrac(c.data.rectWidth ?? c.data.dia);
            const rl = formatFrac(c.data.rectLength ?? c.data.dia);
            props.push({ name: label, value: `Rectangle ${rw}" × ${rl}" — Collar ${formatFrac(c.data.height)}" tall` });
        } else {
            props.push({ name: label, value: `Round ⌀${formatFrac(c.data.dia)}" — Collar ${formatFrac(c.data.height)}" tall` });
        }

        // Position on one line
        const cutoutOffsets = getHoleCutoutValue(c.id, config);
        props.push({
            name: `${config.holes === 1 ? '' : c.label + ' '}Position`,
            value: c.data.centered ? `Centered on cover | ${cutoutOffsets}` : cutoutOffsets,
        });
    }
    return props;
}

function buildLineItemDescription(config: OrderConfig): string {
    const lines: string[] = [];
    lines.push(`${formatFrac(config.l)}" L × ${formatFrac(config.w)}" W × ${formatFrac(config.sk)}" Skirt`);
    lines.push(`Material: ${config.mat === 'copper' ? 'Copper' : 'Galvanized'} | Gauge: ${config.gauge}ga`);
    lines.push(`Drip Edge: ${config.drip ? 'Yes' : 'No'} | Diagonal Crease: ${config.diag ? 'Yes' : 'No'}`);
    if (config.pc) lines.push(`Powder Coat: ${getColorName(config.pcCol)} (${config.pcCol})`);

    const collars = [
        { label: 'H1', id: 'A' as const, data: config.collarA },
        { label: 'H2', id: 'B' as const, data: config.collarB },
        { label: 'H3', id: 'C' as const, data: config.collarC },
    ];
    for (let i = 0; i < config.holes; i++) {
        const c = collars[i];
        if (!c.data) continue;
        const posLabel = getHolePositionLabel(i, config.holes);
        const tag = config.holes === 1 ? 'Hole' : `${c.label} (${posLabel})`;
        const isRect = c.data.shape === 'rect';
        let desc: string;
        if (isRect) {
            desc = `${tag}: Rect ${formatFrac(c.data.rectWidth ?? c.data.dia)}" × ${formatFrac(c.data.rectLength ?? c.data.dia)}" — ${formatFrac(c.data.height)}" tall`;
        } else {
            desc = `${tag}: Round ⌀${formatFrac(c.data.dia)}" — ${formatFrac(c.data.height)}" tall`;
        }
        if (c.data.centered) {
            desc += ' (centered)';
        } else {
            desc += ` [Top:${formatFrac(c.data.offset3)}" Right:${formatFrac(c.data.offset4)}" Bottom:${formatFrac(c.data.offset1)}" Left:${formatFrac(c.data.offset2)}"]`;
        }
        desc += ` [${getHoleCutoutValue(c.id, config)}]`;
        lines.push(desc);
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

        // 1. Fetch Shopify auth and pricing in parallel
        console.log('[DEBUG] Fetching Shopify token and pricing...');
        const [shopifyAccessToken, pricing] = await Promise.all([
            getShopifyAccessToken(),
            fetchPricingFromSheet(),
        ]);
        console.log('[DEBUG] Shopify token and pricing fetched.');

        // 2. Fetch pricing from Google Sheet (server-side — tamper-proof)
        // 3. Calculate price server-side
        const unitPrice = computePrice(config, pricing);
        console.log('[DEBUG] Calculated unitPrice:', unitPrice);
        const quantity = Math.max(1, Math.min(99, Math.round(config.quantity || 1)));

        // 4. Build human-readable description
        const description = buildLineItemDescription(config);

        // 4b. Upload preview image to Shopify (non-blocking — won't fail the order)
        let previewImageUrl: string | undefined;
        if (config.image) {
            console.log('[DEBUG] Uploading preview image...');

            // Try updating the product image first (so checkout shows the thumbnail)
            if (config.shopifyProductId) {
                previewImageUrl = await Promise.race<string | undefined>([
                    updateProductImage(String(config.shopifyProductId), config.image, shopifyAccessToken),
                    wait(8000).then(() => undefined),
                ]);
                console.log('[DEBUG] Product image update:', previewImageUrl ? 'success' : '(failed, trying file upload fallback)');
            }

            // Fallback to staged file upload if product image update failed or no product ID
            if (!previewImageUrl) {
                previewImageUrl = await Promise.race<string | undefined>([
                    uploadImageToShopify(config.image, shopifyAccessToken),
                    wait(2000).then(() => undefined),
                ]);
            }

            console.log('[DEBUG] Preview image URL:', previewImageUrl || '(upload failed, continuing without image)');
        }

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
                            { name: 'Dimensions', value: `${formatFrac(config.l)}" L × ${formatFrac(config.w)}" W × ${formatFrac(config.sk)}" Skirt` },
                            { name: 'Material & Gauge', value: `${config.mat === 'copper' ? 'Copper' : 'Galvanized'} — ${config.gauge}ga` },
                            { name: 'Options', value: `Drip Edge: ${config.drip ? 'Yes' : 'No'} · Diagonal Crease: ${config.diag ? 'Yes' : 'No'}` },
                            ...(config.pc && config.mat !== 'copper' ? [{ name: 'Powder Coat', value: `${getColorName(config.pcCol)} (${config.pcCol})` }] : []),
                            { name: 'Holes', value: `${config.holes}` },
                            ...buildHoleProperties(config),
                            ...(config.notes ? [{ name: 'Special Notes', value: config.notes }] : []),
                            ...(previewImageUrl ? [{ name: '_preview_image', value: previewImageUrl }] : []),
                            { name: '_config_json', value: JSON.stringify({ ...config, image: undefined }) },
                        ],
                    },
                ],
                note: description + (previewImageUrl ? `\n\nPreview: ${previewImageUrl}` : ''),
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
