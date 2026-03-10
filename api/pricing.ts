import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchPricingFromPublicSheet } from '../lib/pricing-sheet';

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SHEET_NAME = 'pricing';

// In-memory cache (persists across warm invocations)
let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchPricing() {
    if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

    const result = await fetchPricingFromPublicSheet(SHEET_ID, SHEET_NAME);

    cache = { data: result, ts: Date.now() };
    return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    try {
        const pricing = await fetchPricing();
        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
        return res.status(200).json(pricing);
    } catch (err: any) {
        console.error('Pricing fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch pricing' });
    }
}
