# Chase Cover Configurator — Shopify + Vercel Integration Guide

## Goal

Integrate the chase cover 3D configurator into a Shopify store so that:
1. The configurator IIFE is hosted on Vercel (instant updates on git push, no re-uploading to Shopify)
2. Pricing constants are stored in a Google Sheet (editable without touching code)
3. "Add to Cart" creates a Shopify Draft Order with the correct calculated price (tamper-proof)
4. Customer is redirected to Shopify's native checkout

No iframe is used. The IIFE loads as a `<script>` tag directly on the Shopify page.

---

## Architecture

```
Shopify Product Page
  └─ <script src="https://chase-configurator.vercel.app/chase-configurator.iife.js">
       │
       ├─ On load: GET /api/pricing → returns pricing constants from Google Sheet (cached 5 min)
       ├─ User configures → price updates in real-time using fetched constants
       └─ "Add to Cart" → POST /api/create-order
                             ├─ Re-fetches pricing constants from Google Sheet
                             ├─ Recalculates price server-side (tamper-proof)
                             ├─ Creates Shopify Draft Order via Admin API
                             └─ Returns checkout URL → customer redirected
```

---

## Prerequisites

### 1. Shopify Admin API Access Token

1. Go to Shopify Admin → Settings → Apps and sales channels → Develop apps
2. Click "Create an app" → name it "Chase Configurator"
3. Click "Configure Admin API scopes" → enable:
   - `write_draft_orders`
   - `read_draft_orders`
4. Click "Install app" → copy the **Admin API access token** (shown once — save it!)
5. Note your store domain: `your-store.myshopify.com`

### 2. Google Sheet for Pricing Config

1. Create a new Google Sheet
2. Set it up with this exact structure (Sheet name: `pricing`):

| Row | A (Key)          | B (Value) |
|-----|------------------|-----------|
| 1   | AREA_RATE        | 0.025     |
| 2   | LINEAR_RATE      | 0.445     |
| 3   | BASE_FIXED       | 178.03    |
| 4   | HOLE_PRICE       | 25        |
| 5   | POWDER_COAT      | 45        |
| 6   | SKIRT_SURCHARGE  | 75        |
| 7   | SKIRT_THRESHOLD  | 6         |
| 8   | GAUGE_24         | 1.0       |
| 9   | GAUGE_20         | 1.3       |
| 10  | GAUGE_18         | 1.4       |
| 11  | GAUGE_16         | 1.6       |
| 12  | GAUGE_14         | 1.8       |
| 13  | GAUGE_12         | 2.7       |
| 14  | GAUGE_10         | 3.4       |
| 15  | MAT_galvanized   | 1.0       |
| 16  | MAT_copper       | 3.0       |

3. Click File → Share → "Anyone with the link" → set to **Viewer**
4. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`

### 3. Google Sheets API Key

1. Go to https://console.cloud.google.com/
2. Create a new project (or use existing)
3. Enable "Google Sheets API"
4. Go to Credentials → Create Credentials → API Key
5. (Optional but recommended) Restrict the key to "Google Sheets API" only
6. Copy the API key

### 4. Vercel Account

1. Sign up at https://vercel.com (free tier is fine)
2. Install Vercel CLI: `npm i -g vercel`

---

## Project Structure

Add these files to the existing `chase-configurator-new` project:

```
chase-configurator-new/
├── api/                          # Vercel serverless functions
│   ├── pricing.ts                # GET /api/pricing — returns Google Sheet values
│   └── create-order.ts           # POST /api/create-order — creates Draft Order
├── public/                       # Static files served by Vercel
│   └── (IIFE will be built here)
├── vercel.json                   # Vercel config
├── src/                          # Existing source code
│   ├── config/pricing.ts         # Modified to fetch from API
│   └── ...
└── ...
```

---

## Step-by-Step Implementation

### Step 1: Create `vercel.json`

```json
{
  "buildCommand": "npm run build:shopify:vercel",
  "outputDirectory": "public",
  "headers": [
    {
      "source": "/chase-configurator.iife.js",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Cache-Control", "value": "public, max-age=60, s-maxage=300" }
      ]
    },
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, POST, OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Content-Type" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/chase-configurator.iife.js", "destination": "/chase-configurator.iife.js" }
  ]
}
```

### Step 2: Create `api/pricing.ts`

This serverless function fetches pricing constants from Google Sheets and caches them.

```typescript
// api/pricing.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY!;
const SHEET_NAME = 'pricing';

// In-memory cache (persists across warm invocations)
let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchPricing() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}!A1:B20?key=${API_KEY}`;
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
```

### Step 3: Create `api/create-order.ts`

This serverless function:
1. Receives the full configuration from the client
2. Re-fetches pricing from Google Sheets (server-side, tamper-proof)
3. Recalculates the price
4. Creates a Shopify Draft Order with the exact price
5. Returns the checkout URL

```typescript
// api/create-order.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE!;           // e.g. "your-store.myshopify.com"
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY!;

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
  collarA?: { dia: number; height: number; centered: boolean; offset1: number; offset2: number; offset3: number; offset4: number };
  collarB?: { dia: number; height: number; centered: boolean; offset1: number; offset2: number; offset3: number; offset4: number };
  collarC?: { dia: number; height: number; centered: boolean; offset1: number; offset2: number; offset3: number; offset4: number };
  quantity: number;
  notes: string;
}

async function fetchPricingFromSheet() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/pricing!A1:B20?key=${GOOGLE_SHEETS_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Sheets API error: ${res.status}`);
  const json = await res.json();
  const rows: [string, string][] = json.values || [];

  const pricing: Record<string, number> = {};
  const gaugeMult: Record<number, number> = {};
  const materialMult: Record<string, number> = {};

  for (const [key, value] of rows) {
    const num = parseFloat(value);
    if (key.startsWith('GAUGE_')) gaugeMult[parseInt(key.replace('GAUGE_', ''))] = num;
    else if (key.startsWith('MAT_')) materialMult[key.replace('MAT_', '')] = num;
    else pricing[key] = num;
  }

  return {
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
}

function computePrice(config: OrderConfig, p: Awaited<ReturnType<typeof fetchPricingFromSheet>>): number {
  const base = p.AREA_RATE * config.w * config.l + p.LINEAR_RATE * (config.w + config.l) + p.BASE_FIXED;
  const subtotal = base
    + config.holes * p.HOLE_PRICE
    + (config.sk >= p.SKIRT_THRESHOLD ? p.SKIRT_SURCHARGE : 0)
    + (config.pc ? p.POWDER_COAT : 0);
  return subtotal * (p.GAUGE_MULT[config.gauge] || 1) * (p.MATERIAL_MULT[config.mat] || 1);
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

function buildLineItemDescription(config: OrderConfig): string {
  const lines: string[] = [];
  lines.push(`${formatFrac(config.w)}" W × ${formatFrac(config.l)}" L × ${formatFrac(config.sk)}" Skirt`);
  lines.push(`Material: ${config.mat === 'copper' ? 'Copper' : 'Galvanized'} | Gauge: ${config.gauge}ga`);
  lines.push(`Drip Edge: ${config.drip ? 'Yes' : 'No'} | Diagonal Crease: ${config.diag ? 'Yes' : 'No'}`);
  if (config.pc) lines.push(`Powder Coat: ${config.pcCol}`);

  const collars = [
    { label: 'H1', data: config.collarA },
    { label: 'H2', data: config.collarB },
    { label: 'H3', data: config.collarC },
  ];
  for (let i = 0; i < config.holes; i++) {
    const c = collars[i];
    if (c.data) {
      let desc = `${c.label}: ⌀${formatFrac(c.data.dia)}" × ${formatFrac(c.data.height)}" tall`;
      if (c.data.centered) {
        desc += ' (centered)';
      } else {
        desc += ` [Top:${formatFrac(c.data.offset3)}" Right:${formatFrac(c.data.offset4)}" Bottom:${formatFrac(c.data.offset1)}" Left:${formatFrac(c.data.offset2)}"]`;
      }
      lines.push(desc);
    }
  }

  if (config.notes) lines.push(`Notes: ${config.notes}`);
  return lines.join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const config: OrderConfig = req.body;

    // Validate required fields
    if (!config.w || !config.l || !config.sk || !config.mat || !config.gauge) {
      return res.status(400).json({ error: 'Missing required configuration fields' });
    }

    // Fetch pricing from Google Sheet (server-side — tamper-proof)
    const pricing = await fetchPricingFromSheet();

    // Calculate price server-side
    const unitPrice = computePrice(config, pricing);
    const quantity = Math.max(1, Math.min(99, Math.round(config.quantity || 1)));

    // Build human-readable description
    const description = buildLineItemDescription(config);

    // Create Shopify Draft Order via Admin API
    const draftOrderPayload = {
      draft_order: {
        line_items: [
          {
            title: 'Custom Chase Cover',
            price: unitPrice.toFixed(2),
            quantity: quantity,
            requires_shipping: true,
            taxable: true,
            properties: [
              { name: 'Width', value: `${formatFrac(config.w)}"` },
              { name: 'Length', value: `${formatFrac(config.l)}"` },
              { name: 'Skirt', value: `${formatFrac(config.sk)}"` },
              { name: 'Material', value: config.mat === 'copper' ? 'Copper' : 'Galvanized' },
              { name: 'Gauge', value: `${config.gauge}ga` },
              { name: 'Holes', value: `${config.holes}` },
              { name: 'Drip Edge', value: config.drip ? 'Yes' : 'No' },
              { name: 'Diagonal Crease', value: config.diag ? 'Yes' : 'No' },
              ...(config.pc ? [{ name: 'Powder Coat', value: config.pcCol }] : []),
              { name: '_config_json', value: JSON.stringify(config) },
            ],
          },
        ],
        note: description,
        use_customer_default_address: true,
      },
    };

    const shopifyRes = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/draft_orders.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify(draftOrderPayload),
      }
    );

    if (!shopifyRes.ok) {
      const errorText = await shopifyRes.text();
      console.error('Shopify API error:', errorText);
      return res.status(500).json({ error: 'Failed to create order' });
    }

    const shopifyData = await shopifyRes.json();
    const invoiceUrl = shopifyData.draft_order.invoice_url;

    return res.status(200).json({ checkout_url: invoiceUrl });
  } catch (err: any) {
    console.error('Create order error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
```

### Step 4: Add build script for Vercel

In `package.json`, add this script:

```json
{
  "scripts": {
    "build:shopify:vercel": "BUILD_TARGET=shopify vite build --mode production && mkdir -p public && cp dist-shopify/chase-configurator.iife.js public/"
  }
}
```

### Step 5: Modify `src/config/pricing.ts` to support dynamic pricing

Replace the contents of `src/config/pricing.ts` with:

```typescript
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
        const data = await res.json();
        PRICING = { ...PRICING, ...data };
        console.log('[ChaseConfigurator] Pricing loaded from API');
    } catch (err) {
        console.warn('[ChaseConfigurator] Failed to fetch pricing from API, using defaults:', err);
    }
    _loaded = true;
    _listeners.forEach(cb => cb());
    _listeners.length = 0;
}
```

### Step 6: Modify `src/shopify-entry.tsx`

Add the pricing fetch call and the API base URL. Also update the "Add to Cart" flow.

In `shopify-entry.tsx`, after the mount setup and before `ReactDOM.createRoot(root).render(...)`, add:

```typescript
import { loadPricingFromAPI } from './config/pricing';

// Detect the API base URL from the script's own src attribute
const currentScript = document.currentScript as HTMLScriptElement | null;
const scriptSrc = currentScript?.src || '';
const apiBase = scriptSrc ? new URL(scriptSrc).origin : window.location.origin;

// Store API base globally so the Add to Cart handler can use it
(window as any).__chaseApiBase = apiBase;

// Fetch pricing from Google Sheets via Vercel API
loadPricingFromAPI(apiBase);
```

### Step 7: Modify "Add to Cart" in `src/App.tsx`

Replace the `onAddToCart` callback in App.tsx. Change the `onAddToCart` prop of `<Sidebar>`:

```typescript
onAddToCart={async () => {
  const apiBase = (window as any).__chaseApiBase || '';
  if (!apiBase) {
    alert('Configuration error: API base not found');
    return;
  }

  try {
    // Show loading state (optional: add a loading state variable)
    const payload = {
      w: config.w, l: config.l, sk: config.sk,
      drip: config.drip, diag: config.diag,
      mat: config.mat, gauge: config.gauge,
      pc: config.pc, pcCol: config.pcCol,
      holes: config.holes,
      collarA: config.holes >= 1 ? config.collarA : undefined,
      collarB: config.holes >= 2 ? config.collarB : undefined,
      collarC: config.holes >= 3 ? config.collarC : undefined,
      quantity: config.quantity,
      notes: config.notes,
    };

    const res = await fetch(`${apiBase}/api/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Failed to create order');
    const data = await res.json();

    if (data.checkout_url) {
      window.location.href = data.checkout_url;
    } else {
      throw new Error('No checkout URL returned');
    }
  } catch (err: any) {
    console.error('Add to cart error:', err);
    alert('Failed to add to cart. Please try again.');
  }
}}
```

### Step 8: Recalculate price when pricing loads

In `src/store/configStore.ts`, after the store is created, add a listener that recalculates the price when remote pricing loads. Add this at the bottom of the file:

```typescript
import { onPricingLoaded } from '../config';

onPricingLoaded(() => {
  const state = useConfigStore.getState();
  useConfigStore.setState({ price: computePrice(state) });
});
```

### Step 9: Set Vercel Environment Variables

Run these commands (or set them in the Vercel dashboard under Settings → Environment Variables):

```bash
vercel env add GOOGLE_SHEET_ID        # paste your Google Sheet ID
vercel env add GOOGLE_SHEETS_API_KEY  # paste your Google API key
vercel env add SHOPIFY_STORE          # e.g. "your-store.myshopify.com"
vercel env add SHOPIFY_ACCESS_TOKEN   # paste your Shopify Admin API token
```

### Step 10: Deploy to Vercel

```bash
cd chase-configurator-new
vercel --prod
```

Note your deployment URL, e.g. `https://chase-configurator-abc123.vercel.app`

### Step 11: Update Shopify Liquid Template

In your Shopify theme, replace the current script tag with:

```html
<chase-configurator style="display:block;width:100%;height:800px;"></chase-configurator>
<script src="https://chase-configurator-abc123.vercel.app/chase-configurator.iife.js"></script>
```

Now every time you push code changes to git, Vercel auto-deploys and Shopify always loads the latest version.

---

## Google Sheet Editing Guide

To change pricing, just edit the Google Sheet values:

| To change... | Edit cell... |
|---|---|
| Base price formula rate | B1 (AREA_RATE) |
| Per-inch rate | B2 (LINEAR_RATE) |
| Fixed base price | B3 (BASE_FIXED) |
| Price per hole | B4 (HOLE_PRICE) |
| Powder coat surcharge | B5 (POWDER_COAT) |
| Tall skirt surcharge | B6 (SKIRT_SURCHARGE) |
| Skirt threshold (inches) | B7 (SKIRT_THRESHOLD) |
| Gauge multipliers | B8-B14 |
| Material multipliers | B15-B16 |

Changes take effect within **5 minutes** (server cache TTL). No code changes or redeployment needed.

---

## How Orders Appear in Shopify Admin

Each order will show:
- **Line item title**: "Custom Chase Cover"
- **Price**: The server-calculated price
- **Properties** (visible in order details):
  - Width: 48"
  - Length: 60"
  - Skirt: 3"
  - Material: Galvanized
  - Gauge: 24ga
  - Holes: 1
  - Drip Edge: Yes
  - Diagonal Crease: Yes
  - (etc.)
- **Order note**: Full human-readable description of the configuration
- **Hidden property** `_config_json`: Complete JSON config for reproduction

---

## Security Summary

- **Client-side**: Calculates and displays price for UX only
- **Server-side** (Vercel function): Recalculates price from scratch using Google Sheet values before creating the order
- **Shopify**: Receives the Draft Order with server-calculated price — customer cannot alter it
- **Google Sheet**: Only readable (Viewer access), not editable by public

The client-displayed price and the server-calculated price use the same formula. If someone tampers with the client-side price, it doesn't matter — the Draft Order always uses the server-calculated price.

---

## Testing Checklist

1. [ ] Google Sheet is set up with pricing values and shared as "Viewer"
2. [ ] Vercel env vars are set (GOOGLE_SHEET_ID, GOOGLE_SHEETS_API_KEY, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN)
3. [ ] `vercel --prod` deploys successfully
4. [ ] Visiting `https://your-app.vercel.app/chase-configurator.iife.js` returns the JS file
5. [ ] Visiting `https://your-app.vercel.app/api/pricing` returns JSON with pricing constants
6. [ ] Shopify page loads the configurator correctly
7. [ ] Price updates in real-time as user changes options
8. [ ] "Add to Cart" redirects to Shopify checkout with correct price
9. [ ] Order appears in Shopify admin with all configuration details
10. [ ] Changing a value in Google Sheet updates pricing within 5 minutes
