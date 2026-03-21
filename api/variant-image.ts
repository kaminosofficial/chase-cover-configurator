import type { VercelRequest, VercelResponse } from '@vercel/node';

const SHOPIFY_STORE = (process.env.SHOPIFY_STORE || '').trim();
const SHOPIFY_ACCESS_TOKEN = (process.env.SHOPIFY_ACCESS_TOKEN || '').trim() || undefined;
const SHOPIFY_CLIENT_ID = (process.env.SHOPIFY_CLIENT_ID || '').trim() || undefined;
const SHOPIFY_CLIENT_SECRET = (process.env.SHOPIFY_CLIENT_SECRET || '').trim() || undefined;
const SHOPIFY_PRODUCT_ID = (process.env.SHOPIFY_PRODUCT_ID || '').trim() || undefined;

/* ---- Auth ---- */

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
    if (SHOPIFY_ACCESS_TOKEN) return SHOPIFY_ACCESS_TOKEN;

    if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

    if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
        throw new Error('Missing Shopify credentials');
    }

    const res = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: SHOPIFY_CLIENT_ID,
            client_secret: SHOPIFY_CLIENT_SECRET,
        }).toString(),
    });

    if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
    const data = await res.json();
    tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
    return data.access_token;
}

/* ---- GraphQL helper ---- */

async function shopifyGraphQL(query: string, accessToken: string): Promise<any> {
    const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-10/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
        body: JSON.stringify({ query }),
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { errors: [{ message: text.slice(0, 300) }] }; }
}

/* ---- Handler ---- */

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { variantId, productId: rawProductId, image } = req.body || {};
    const productId = rawProductId || SHOPIFY_PRODUCT_ID;

    if (!variantId || !image) {
        return res.status(400).json({ error: 'Missing variantId or image' });
    }
    if (!productId) {
        return res.status(400).json({ error: 'Missing productId' });
    }

    const t0 = Date.now();
    try {
        const accessToken = await getAccessToken();

        // Step 1: Create staged upload
        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `chase-cover-${variantId}.png`;

        const stageResult = await shopifyGraphQL(`
            mutation {
                stagedUploadsCreate(input: [{
                    resource: PRODUCT_IMAGE
                    filename: "${filename}"
                    mimeType: "image/png"
                    httpMethod: PUT
                }]) {
                    stagedTargets { url resourceUrl }
                    userErrors { field message }
                }
            }
        `, accessToken);

        const target = stageResult?.data?.stagedUploadsCreate?.stagedTargets?.[0];
        if (!target?.url) {
            console.warn('[IMG] Staged upload failed');
            return res.status(502).json({ error: 'Staged upload failed' });
        }

        // Step 2: Upload binary
        const uploadRes = await fetch(target.url, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/png' },
            body: buffer,
        });
        if (!uploadRes.ok) {
            return res.status(502).json({ error: `Upload failed: ${uploadRes.status}` });
        }

        // Step 3: Attach to product + variant
        const imgRes = await fetch(
            `https://${SHOPIFY_STORE}/admin/api/2025-10/products/${productId}/images.json`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
                body: JSON.stringify({
                    image: { src: target.resourceUrl, variant_ids: [Number(variantId)] },
                }),
            }
        );
        const imgData = await imgRes.json().catch(() => null);
        const imageUrl = imgData?.image?.src;

        console.log('[IMG] Variant image uploaded in', Date.now() - t0, 'ms, ok:', !!imageUrl);
        return res.status(200).json({ success: true, imageUrl, ms: Date.now() - t0 });
    } catch (err: any) {
        console.error('[IMG] Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
