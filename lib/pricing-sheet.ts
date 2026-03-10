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
    };
}

export async function fetchPricingFromPublicSheet(sheetId: string, sheetName = 'pricing'): Promise<PricingConstants> {
    if (!sheetId) {
        throw new Error('Missing GOOGLE_SHEET_ID');
    }

    const url =
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Google Sheet fetch error: ${res.status}`);
    }

    const text = await res.text();
    const json = parseGvizResponse(text);
    const rows = json.table?.rows ?? [];
    return buildPricing(rows);
}
