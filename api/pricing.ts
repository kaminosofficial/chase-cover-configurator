import type { VercelRequest, VercelResponse } from '@vercel/node';

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY!;
const SHEET_NAME = 'pricing';

// In-memory cache (persists across warm invocations)
let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchPricing() {
    if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A1:B20?key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google Sheets API error: ${res.status}`);
    const json = await res.json();

    const rows: [string, string][] = json.values || [];
    const pricing: Record<string, number> = {};
    const gaugeMult: Record<number, number> = {};
    const materialMult: Record<string, number> = {};

    for (const [key, value] of rows) {
        const num = parseFloat(value);
        if (key.startsWith('GAUGE_')) {
            gaugeMult[parseInt(key.replace('GAUGE_', ''))] = num;
        } else if (key.startsWith('MAT_')) {
            materialMult[key.replace('MAT_', '')] = num;
        } else {
            pricing[key] = num;
        }
    }

    const result = {
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
