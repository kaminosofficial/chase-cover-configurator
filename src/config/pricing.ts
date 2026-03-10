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

// Default values (used as fallback and for local dev)
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
    }
};

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
        };
    } catch (err) {
        console.warn('[ChaseConfigurator] Failed to fetch pricing from API, using defaults:', err);
    }
    _loaded = true;
    _listeners.forEach(cb => cb());
    _listeners.length = 0;
}
