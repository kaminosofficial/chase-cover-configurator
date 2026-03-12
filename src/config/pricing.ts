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

// Default values (used as fallback and for local dev)
// Storm collar diameter = hole diameter - 1". Keys = collarDia * 10.
// Prices from product catalog; sizes 15, 17, 20+ are extrapolated.
export let PRICING: PricingConstants = {
    AREA_RATE: 0.025,
    LINEAR_RATE: 0.445,
    BASE_FIXED: 178.03,
    HOLE_PRICE: 25,
    POWDER_COAT: 45,
    SKIRT_SURCHARGE: 75,
    SKIRT_THRESHOLD: 6,
    GAUGE_MULT: {
        24: 1.0, 20: 1.3, 18: 1.4, 16: 1.6, 14: 1.8, 12: 2.7, 10: 3.4,
    },
    MATERIAL_MULT: {
        galvanized: 1.0, copper: 3.0,
    },
    STORM_COLLAR_PRICES: {
        40: 30,   // 4.0" → $30
        50: 30,   // 5.0" → $30
        55: 30,   // 5.5" → $30
        60: 30,   // 6.0" → $30
        65: 40,   // 6.5" → $40
        70: 40,   // 7.0" → $40
        80: 40,   // 8.0" → $40
        90: 50,   // 9.0" → $50
        100: 60,  // 10.0" → $60
        110: 60,  // 11.0" → $60
        120: 60,  // 12.0" → $60
        130: 70,  // 13.0" → $70
        140: 70,  // 14.0" → $70
        150: 75,  // 15.0" → $75 (extrapolated)
        160: 80,  // 16.0" → $80
        170: 90,  // 17.0" → $90 (extrapolated)
        180: 100, // 18.0" → $100
        200: 120, // 20.0" → $120 (extrapolated)
        220: 140, // 22.0" → $140 (extrapolated)
        240: 160, // 24.0" → $160 (extrapolated)
        260: 180, // 26.0" → $180 (extrapolated)
        280: 200, // 28.0" → $200 (extrapolated)
        290: 210, // 29.0" → $210 (extrapolated, covers 30" max hole)
    },
};

/**
 * Returns the storm collar price for a given hole diameter.
 * Storm collar diameter = holeDia - 1". Looks up nearest size ≤ collar diameter.
 */
export function getStormCollarPrice(holeDia: number): number {
    const collarDiaTenths = Math.floor((holeDia - 1) * 10);
    const prices = PRICING.STORM_COLLAR_PRICES;
    const keys = Object.keys(prices).map(Number).sort((a, b) => b - a);
    for (const key of keys) {
        if (key <= collarDiaTenths) return prices[key];
    }
    return 0;
}

let _loaded = false;
const _listeners: Array<() => void> = [];

export function onPricingLoaded(cb: () => void) {
    if (_loaded) { cb(); return; }
    _listeners.push(cb);
}

// Fetch pricing from the Vercel API (which reads from Google Sheets)
// This is called once on app startup.
// The API_BASE should be set in shopify-entry.tsx or detected automatically.
export async function loadPricingFromAPI(apiBase: string) {
    try {
        const res = await fetch(`${apiBase}/api/pricing`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error(`Expected JSON, got ${contentType}`);
        }

        const data = await res.json();
        PRICING = {
            ...PRICING,
            ...data,
            GAUGE_MULT: { ...PRICING.GAUGE_MULT, ...(data.GAUGE_MULT ?? {}) },
            MATERIAL_MULT: { ...PRICING.MATERIAL_MULT, ...(data.MATERIAL_MULT ?? {}) },
            STORM_COLLAR_PRICES: { ...PRICING.STORM_COLLAR_PRICES, ...(data.STORM_COLLAR_PRICES ?? {}) },
        };
    } catch (err) {
        console.warn('[ChaseConfigurator] Failed to fetch pricing from API, using defaults:', err);
    }
    _loaded = true;
    _listeners.forEach(cb => cb());
    _listeners.length = 0;
}
