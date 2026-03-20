import type { VercelRequest, VercelResponse } from '@vercel/node';

const SHOPIFY_STORE = (process.env.SHOPIFY_STORE || '').trim();
const SHOPIFY_ACCESS_TOKEN = (process.env.SHOPIFY_ACCESS_TOKEN || '').trim() || undefined;
const SHOPIFY_CLIENT_ID = (process.env.SHOPIFY_CLIENT_ID || '').trim() || undefined;
const SHOPIFY_CLIENT_SECRET = (process.env.SHOPIFY_CLIENT_SECRET || '').trim() || undefined;
const SHOPIFY_PRODUCT_ID = (process.env.SHOPIFY_PRODUCT_ID || '').trim() || undefined;
const CRON_SECRET = (process.env.CRON_SECRET || '').trim() || undefined;

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function resolveProductId(accessToken: string): Promise<string | null> {
    if (SHOPIFY_PRODUCT_ID) return SHOPIFY_PRODUCT_ID;

    try {
        const res = await fetch(
            `https://${SHOPIFY_STORE}/admin/api/2025-10/products.json?limit=50&fields=id,title`,
            { headers: { 'X-Shopify-Access-Token': accessToken } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        const products = data?.products || [];
        const chase = products.find((p: any) => p.title?.toLowerCase().includes('chase')) || products[0];
        return chase?.id ? String(chase.id) : null;
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Auth: allow Vercel cron (Bearer CRON_SECRET) or manual trigger with ?secret= param
    const authHeader = req.headers.authorization || '';
    const querySecret = typeof req.query.secret === 'string' ? req.query.secret : '';
    if (CRON_SECRET) {
        const validBearer = authHeader === `Bearer ${CRON_SECRET}`;
        const validQuery = querySecret === CRON_SECRET;
        if (!validBearer && !validQuery) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    try {
        // Auth: use static token, fall back to OAuth client_credentials
        let accessToken = SHOPIFY_ACCESS_TOKEN;
        if (!accessToken && SHOPIFY_CLIENT_ID && SHOPIFY_CLIENT_SECRET) {
            try {
                const tokenRes = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'client_credentials',
                        client_id: SHOPIFY_CLIENT_ID,
                        client_secret: SHOPIFY_CLIENT_SECRET,
                    }).toString(),
                });
                if (tokenRes.ok) {
                    const tokenData = await tokenRes.json();
                    accessToken = tokenData.access_token;
                }
            } catch { /* ignore */ }
        }

        if (!accessToken) {
            return res.status(500).json({
                error: 'Shopify auth not configured. Set SHOPIFY_ACCESS_TOKEN env var in Vercel.',
                debug: {
                    hasStaticToken: !!SHOPIFY_ACCESS_TOKEN,
                    hasClientId: !!SHOPIFY_CLIENT_ID,
                    hasClientSecret: !!SHOPIFY_CLIENT_SECRET,
                    store: SHOPIFY_STORE || '(not set)',
                },
            });
        }

        const productId = await resolveProductId(accessToken);
        if (!productId) {
            return res.status(400).json({ error: 'Could not resolve product ID. Set SHOPIFY_PRODUCT_ID env var.' });
        }

        console.log('[CLEANUP] Starting cleanup for product', productId);

        // List all variants
        const listRes = await fetch(
            `https://${SHOPIFY_STORE}/admin/api/2025-10/products/${productId}/variants.json?limit=250`,
            { headers: { 'X-Shopify-Access-Token': accessToken } }
        );

        if (!listRes.ok) {
            const errText = await listRes.text();
            return res.status(502).json({ error: `Failed to list variants: ${listRes.status}`, detail: errText.slice(0, 300) });
        }

        const listData = await listRes.json();
        const variants = listData?.variants || [];
        const cutoff = Date.now() - THREE_DAYS_MS;

        console.log('[CLEANUP] Found', variants.length, 'total variants');

        let deleted = 0;
        let kept = 0;
        const errors: string[] = [];

        for (const v of variants) {
            const opt = String(v.option1 || '');

            // Only delete auto-created variants (CC- prefix)
            if (!opt.startsWith('CC-')) {
                kept++;
                continue;
            }

            // Check age
            const createdAt = new Date(v.created_at).getTime();
            if (createdAt >= cutoff) {
                kept++;
                continue;
            }

            // Delete this stale variant
            try {
                const delRes = await fetch(
                    `https://${SHOPIFY_STORE}/admin/api/2025-10/products/${productId}/variants/${v.id}.json`,
                    { method: 'DELETE', headers: { 'X-Shopify-Access-Token': accessToken } }
                );

                if (delRes.ok) {
                    deleted++;
                    console.log('[CLEANUP] Deleted variant', v.id, opt);
                } else {
                    const errText = await delRes.text();
                    errors.push(`Failed to delete ${v.id}: ${delRes.status} ${errText.slice(0, 100)}`);
                    console.error('[CLEANUP] Failed to delete variant', v.id, delRes.status);
                }
            } catch (err: any) {
                errors.push(`Error deleting ${v.id}: ${err.message}`);
            }
        }

        console.log('[CLEANUP] Done:', { deleted, kept, errors: errors.length });

        return res.status(200).json({
            success: true,
            productId,
            totalVariants: variants.length,
            deleted,
            kept,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (err: any) {
        console.error('[CLEANUP] Error:', err?.stack || err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
}
