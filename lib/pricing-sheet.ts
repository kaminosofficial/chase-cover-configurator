import {
    DEFAULT_GAUGE_MULT,
    DEFAULT_MATERIAL_MULT,
    DEFAULT_MODEL_COEFFICIENTS,
    normalizePaintedMultiplier,
    type PricingLike,
} from '../src/utils/pricing.js';

export interface PricingConstants extends PricingLike {
    STORM_COLLAR_PRICES: Record<number, number>;
}

/**
 * Returns the storm collar price for a given hole diameter.
 * Storm collar diameter = holeDia - 1". Looks up nearest size <= collar diameter.
 */
export function getStormCollarPrice(holeDia: number, prices: Record<number, number>): number {
    const collarDiaTenths = Math.floor((holeDia - 1) * 10);
    const keys = Object.keys(prices).map(Number).sort((a, b) => b - a);
    for (const key of keys) {
        if (key <= collarDiaTenths) return prices[key];
    }
    return 0;
}

const DEFAULT_PRICING: PricingConstants = {
    EXT_ANCHOR: 489.33,
    EXT_S_W: 4.245,
    EXT_S_L: 2.495,
    EXT_S_AREA: 0.040,
    HOLE_PRICE: 25,
    SKIRT_SURCHARGE: 75,
    SKIRT_THRESHOLD: 6,
    PAINTED_MULTIPLIER: 1.5,
    GAUGE_MULT: { ...DEFAULT_GAUGE_MULT },
    MATERIAL_MULT: { ...DEFAULT_MATERIAL_MULT },
    MODEL_COEFFICIENTS: { ...DEFAULT_MODEL_COEFFICIENTS },
    STORM_COLLAR_PRICES: {
        40: 30,
        50: 30,
        55: 30,
        60: 30,
        65: 40,
        70: 40,
        80: 40,
        90: 50,
        100: 60,
        110: 60,
        120: 60,
        130: 70,
        140: 70,
        150: 75,
        160: 80,
        170: 90,
        180: 100,
        200: 120,
        220: 140,
        240: 160,
        260: 180,
        280: 200,
        290: 210,
    },
};

function parseGvizResponse(text: string) {
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\);\s*$/);
    if (!match) {
        throw new Error('Unexpected Google visualization response format');
    }
    return JSON.parse(match[1]);
}

function extractKeyValuePairs(row: { c?: Array<{ v?: string | number | null }> }) {
    const pairs: Array<{ key: string; value: number }> = [];
    const cells = row.c ?? [];

    for (let i = 0; i < cells.length - 1; i++) {
        const keyCell = cells[i]?.v;
        const valueCell = cells[i + 1]?.v;
        if (typeof keyCell !== 'string' || valueCell == null) continue;

        const key = keyCell.trim();
        if (!key) continue;

        const num = typeof valueCell === 'number' ? valueCell : parseFloat(String(valueCell));
        if (!Number.isFinite(num)) continue;

        pairs.push({ key, value: num });
    }

    return pairs;
}

function buildPricing(rows: Array<{ c?: Array<{ v?: string | number | null }> }>): PricingConstants {
    const pricing: Record<string, number> = {};
    const gaugeMult: Record<number, number> = {};
    const materialMult: Record<string, number> = {};
    const stormCollarPrices: Record<number, number> = {};
    const modelCoefficients: Record<string, number> = {};
    let legacyPowderCoatPercent: number | undefined;

    for (const row of rows) {
        for (const { key, value } of extractKeyValuePairs(row)) {
            if (key.startsWith('GAUGE_')) {
                gaugeMult[parseInt(key.replace('GAUGE_', ''), 10)] = value;
            } else if (key.startsWith('MAT_')) {
                materialMult[key.replace('MAT_', '')] = value;
            } else if (key.startsWith('SC_')) {
                const sizeTenths = parseInt(key.replace('SC_', ''), 10);
                if (!isNaN(sizeTenths)) stormCollarPrices[sizeTenths] = value;
            } else if (key.startsWith('COEF_')) {
                modelCoefficients[key.replace('COEF_', '')] = value;
            } else if (key === 'POWDER_COAT') {
                legacyPowderCoatPercent = value;
            } else {
                pricing[key] = value;
            }
        }
    }

    return {
        EXT_ANCHOR: pricing.EXT_ANCHOR ?? DEFAULT_PRICING.EXT_ANCHOR,
        EXT_S_W: pricing.EXT_S_W ?? DEFAULT_PRICING.EXT_S_W,
        EXT_S_L: pricing.EXT_S_L ?? DEFAULT_PRICING.EXT_S_L,
        EXT_S_AREA: pricing.EXT_S_AREA ?? DEFAULT_PRICING.EXT_S_AREA,
        HOLE_PRICE: pricing.HOLE_PRICE ?? DEFAULT_PRICING.HOLE_PRICE,
        SKIRT_SURCHARGE: pricing.SKIRT_SURCHARGE ?? DEFAULT_PRICING.SKIRT_SURCHARGE,
        SKIRT_THRESHOLD: pricing.SKIRT_THRESHOLD ?? DEFAULT_PRICING.SKIRT_THRESHOLD,
        PAINTED_MULTIPLIER: normalizePaintedMultiplier(
            pricing.PAINTED_MULTIPLIER ?? legacyPowderCoatPercent ?? DEFAULT_PRICING.PAINTED_MULTIPLIER
        ),
        GAUGE_MULT: { ...DEFAULT_PRICING.GAUGE_MULT, ...gaugeMult },
        MATERIAL_MULT: { ...DEFAULT_PRICING.MATERIAL_MULT, ...materialMult },
        MODEL_COEFFICIENTS: { ...DEFAULT_PRICING.MODEL_COEFFICIENTS, ...modelCoefficients },
        STORM_COLLAR_PRICES: { ...DEFAULT_PRICING.STORM_COLLAR_PRICES, ...stormCollarPrices },
    };
}

export async function fetchPricingFromPublicSheet(sheetId: string, sheetName = 'pricing'): Promise<PricingConstants> {
    if (!sheetId) {
        throw new Error('Missing GOOGLE_SHEET_ID');
    }

    const url =
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&ts=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
        throw new Error(`Google Sheet fetch error: ${res.status}`);
    }

    const text = await res.text();
    const json = parseGvizResponse(text);
    const rows = json.table?.rows ?? [];
    return buildPricing(rows);
}
