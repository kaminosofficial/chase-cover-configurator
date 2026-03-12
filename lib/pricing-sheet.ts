export interface PricingConstants {
    AREA_RATE: number;
    LINEAR_RATE: number;
    BASE_FIXED: number;
    HOLE_PRICE: number;
    POWDER_COAT: number;
    SKIRT_SURCHARGE: number;
    SKIRT_THRESHOLD: number;
    GAUGE_MULT: Record<number, number>;
    MATERIAL_MULT: Record<string, number>;
    // Storm collar prices keyed by collar diameter × 10 (e.g. 40 = 4.0", 55 = 5.5")
    STORM_COLLAR_PRICES: Record<number, number>;
}

/**
 * Returns the storm collar price for a given hole diameter.
 * Storm collar diameter = holeDia - 1". Looks up nearest size ≤ collar diameter.
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
    AREA_RATE: 0.025,
    LINEAR_RATE: 0.445,
    BASE_FIXED: 178.03,
    HOLE_PRICE: 25,
    POWDER_COAT: 45,
    SKIRT_SURCHARGE: 75,
    SKIRT_THRESHOLD: 6,
    GAUGE_MULT: {},
    MATERIAL_MULT: {},
    STORM_COLLAR_PRICES: {},
};

function parseGvizResponse(text: string) {
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\);\s*$/);
    if (!match) {
        throw new Error('Unexpected Google visualization response format');
    }
    return JSON.parse(match[1]);
}

function buildPricing(rows: Array<{ c?: Array<{ v?: string | number | null }> }>): PricingConstants {
    const pricing: Record<string, number> = {};
    const gaugeMult: Record<number, number> = {};
    const materialMult: Record<string, number> = {};
    const stormCollarPrices: Record<number, number> = {};

    for (const row of rows) {
        const keyCell = row.c?.[0]?.v;
        const valueCell = row.c?.[1]?.v;
        if (typeof keyCell !== 'string' || valueCell == null) continue;

        const num = typeof valueCell === 'number' ? valueCell : parseFloat(String(valueCell));
        if (!Number.isFinite(num)) continue;

        if (keyCell.startsWith('GAUGE_')) {
            gaugeMult[parseInt(keyCell.replace('GAUGE_', ''), 10)] = num;
        } else if (keyCell.startsWith('MAT_')) {
            materialMult[keyCell.replace('MAT_', '')] = num;
        } else if (keyCell.startsWith('SC_')) {
            // Storm collar price: key = SC_<diameter*10> (e.g. SC_55 = 5.5" collar)
            const sizeTenths = parseInt(keyCell.replace('SC_', ''), 10);
            if (!isNaN(sizeTenths)) stormCollarPrices[sizeTenths] = num;
        } else {
            pricing[keyCell] = num;
        }
    }

    return {
        AREA_RATE: pricing.AREA_RATE ?? DEFAULT_PRICING.AREA_RATE,
        LINEAR_RATE: pricing.LINEAR_RATE ?? DEFAULT_PRICING.LINEAR_RATE,
        BASE_FIXED: pricing.BASE_FIXED ?? DEFAULT_PRICING.BASE_FIXED,
        HOLE_PRICE: pricing.HOLE_PRICE ?? DEFAULT_PRICING.HOLE_PRICE,
        POWDER_COAT: pricing.POWDER_COAT ?? DEFAULT_PRICING.POWDER_COAT,
        SKIRT_SURCHARGE: pricing.SKIRT_SURCHARGE ?? DEFAULT_PRICING.SKIRT_SURCHARGE,
        SKIRT_THRESHOLD: pricing.SKIRT_THRESHOLD ?? DEFAULT_PRICING.SKIRT_THRESHOLD,
        GAUGE_MULT: gaugeMult,
        MATERIAL_MULT: materialMult,
        STORM_COLLAR_PRICES: stormCollarPrices,
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
