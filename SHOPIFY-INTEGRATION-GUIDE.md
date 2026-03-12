# Chase Cover Configurator — Shopify + Vercel Integration Guide

## Goal

Integrate the chase cover 3D configurator into a Shopify store so that:
1. The configurator IIFE is hosted on Vercel (instant updates on git push, no re-uploading to Shopify)
2. Pricing constants are stored in a Google Sheet (editable without touching code)
3. "Add to Cart" creates a Shopify Draft Order with the correct server-calculated price (tamper-proof)
4. Customer is redirected to Shopify's native checkout
5. The standalone configurator is also accessible at the Vercel URL (for testing / direct access)

No iframe is used. The IIFE loads as a `<script>` tag directly on the Shopify page inside a Shadow DOM for CSS isolation.

---

## Architecture

```
Shopify Product Page
  |
  +-- <chase-cover-configurator product-id="..." variant-id="...">
  |     Renders inside Shadow DOM (CSS isolated from Shopify theme)
  |
  +-- <script src="https://your-app.vercel.app/chase-cover-configurator.iife.js">
        |
        +-- On load: GET /api/pricing
        |     -> Vercel serverless function
        |     -> Fetches pricing from Google Sheets (cached 5 min)
        |     -> Returns JSON pricing constants
        |
        +-- User configures cover -> price updates in real-time
        |
        +-- "Add to Cart" -> POST /api/create-order
              -> Vercel serverless function
              -> Re-fetches pricing from Google Sheets (tamper-proof)
              -> Recalculates price server-side
              -> Authenticates with Shopify (static token or OAuth)
              -> Creates Shopify Draft Order via Admin API (2025-10)
              -> Returns checkout URL -> customer redirected

Vercel Deployment (https://your-app.vercel.app)
  +-- /                             Standalone SPA (for testing / direct access)
  +-- /chase-cover-configurator.iife.js   IIFE bundle loaded by Shopify
  +-- /api/pricing                  Serverless: Google Sheets -> JSON
  +-- /api/create-order             Serverless: Config -> Shopify Draft Order
```

---

## Prerequisites

### 1. Shopify Admin API Access

You need **one** of the following authentication methods:

#### Option A: Static Admin API Access Token (Recommended for Store Admin apps)

1. Go to Shopify Admin > Settings > Apps and sales channels > Develop apps
2. Click "Create an app" > name it "Chase Cover Configurator"
3. Click "Configure Admin API scopes" > enable:
   - `write_draft_orders`
   - `read_draft_orders`
4. Click "Install app" > copy the **Admin API access token** (`shpat_...`) — shown once, save it!
5. Set this as the `SHOPIFY_ACCESS_TOKEN` environment variable

#### Option B: OAuth Client Credentials (For Shopify App Dashboard apps)

1. Go to the Shopify Partners Dashboard > Apps > your app
2. Under "API credentials", copy:
   - **Client ID** -> set as `SHOPIFY_CLIENT_ID`
   - **Client Secret** -> set as `SHOPIFY_CLIENT_SECRET`
3. The server will automatically obtain access tokens via OAuth `client_credentials` grant
4. Tokens are cached in memory and refreshed before expiry

**Auth priority in `api/create-order.ts`**:
1. If `SHOPIFY_ACCESS_TOKEN` is set, use it (simplest)
2. Otherwise, use `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` for dynamic OAuth tokens

### 2. Google Sheet for Pricing Config

1. Create a new Google Sheet
2. In `Sheet1`, set up this structure (Column A = key, Column B = value):

| Row | A (Key) | B (Value) |
|-----|---------|-----------|
| 1 | AREA_RATE | 0.025 |
| 2 | LINEAR_RATE | 0.445 |
| 3 | BASE_FIXED | 178.03 |
| 4 | HOLE_PRICE | 25 |
| 5 | POWDER_COAT | 45 |
| 6 | SKIRT_SURCHARGE | 75 |
| 7 | SKIRT_THRESHOLD | 6 |
| 8 | GAUGE_24 | 1.0 |
| 9 | GAUGE_20 | 1.3 |
| 10 | GAUGE_18 | 1.4 |
| 11 | GAUGE_16 | 1.6 |
| 12 | GAUGE_14 | 1.8 |
| 13 | GAUGE_12 | 2.7 |
| 14 | GAUGE_10 | 3.4 |
| 15 | MAT_galvanized | 1.0 |
| 16 | MAT_copper | 3.0 |

3. Click File > Share > "Anyone with the link" > set to **Viewer**
4. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`

### 3. Google Sheets API Key

1. Go to https://console.cloud.google.com/
2. Create a new project (or use existing)
3. Enable "Google Sheets API"
4. Go to Credentials > Create Credentials > API Key
5. (Recommended) Restrict the key to "Google Sheets API" only
6. Copy the API key

### 4. Vercel Account

1. Sign up at https://vercel.com (free tier works)
2. Install Vercel CLI: `npm i -g vercel`
3. Link the project: `cd chase-cover-configurator && vercel link`

---

## Environment Variables

### Required Variables

Set these in the **Vercel Dashboard** (Settings > Environment Variables) and in `.env` for local development:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GOOGLE_SHEET_ID` | Yes | Google Sheet ID (from the URL) | `1L9qAQbB-5dU...` |
| `GOOGLE_SHEETS_API_KEY` | Yes | Google Cloud API key | `AIzaSyA48c...` |
| `SHOPIFY_STORE` | Yes | Shopify store domain | `your-store.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | If using Option A | Static Admin API token | `shpat_abc123...` |
| `SHOPIFY_CLIENT_ID` | If using Option B | Shopify App Client ID | `18e8d566e8...` |
| `SHOPIFY_CLIENT_SECRET` | If using Option B | Shopify App Client Secret | `shpss_e733...` |

### Setting via CLI

```bash
vercel env add GOOGLE_SHEET_ID        # paste your Google Sheet ID
vercel env add GOOGLE_SHEETS_API_KEY  # paste your Google API key
vercel env add SHOPIFY_STORE          # e.g. "your-store.myshopify.com"

# Option A (static token):
vercel env add SHOPIFY_ACCESS_TOKEN   # paste shpat_... token

# Option B (OAuth):
vercel env add SHOPIFY_CLIENT_ID      # paste client ID
vercel env add SHOPIFY_CLIENT_SECRET  # paste client secret
```

### Local `.env` File

For local development, create a `.env` file in the project root:

```env
# Google Sheets
GOOGLE_SHEET_ID=your-sheet-id-here
GOOGLE_SHEETS_API_KEY=your-api-key-here

# Shopify
SHOPIFY_STORE=your-store.myshopify.com

# Auth Option A (static token):
SHOPIFY_ACCESS_TOKEN=shpat_your_token_here

# Auth Option B (OAuth — use if no static token):
# SHOPIFY_CLIENT_ID=your-client-id
# SHOPIFY_CLIENT_SECRET=your-client-secret
```

> **Important**: The `.env` file is gitignored. Never commit secrets to the repository.

---

## Project Structure (Integration-Specific Files)

```
chase-cover-configurator/
├── api/                              # Vercel serverless functions (auto-detected)
│   ├── pricing.ts                    # GET /api/pricing
│   └── create-order.ts              # POST /api/create-order
├── vercel.json                       # Vercel config (build, CORS, rewrites)
├── src/
│   ├── shopify-entry.tsx             # Shopify IIFE entry point (Shadow DOM)
│   ├── main.tsx                      # Standalone SPA entry point
│   ├── config/pricing.ts            # Client-side pricing (fetches from /api/pricing)
│   └── styles/
│       ├── globals.css               # CSS for standalone SPA
│       └── globals-scoped.css        # CSS injected into Shadow DOM (Shopify)
├── dist/                             # Vercel output dir (SPA + IIFE)
└── dist-shopify/                     # Shopify IIFE build output
```

---

## Build & Deploy

### Build Commands

```bash
# Local development (standalone SPA)
npm run dev

# Build standalone SPA only
npm run build

# Build Shopify IIFE only
npm run build:shopify

# Build everything for Vercel (SPA + IIFE + copies IIFE into dist/)
npm run build:vercel
```

### How `build:vercel` Works

```bash
npm run build              # Standard Vite SPA build -> dist/
npm run build:shopify      # IIFE build (BUILD_TARGET=shopify) -> dist-shopify/
cp dist-shopify/chase-cover-configurator.iife.js dist/   # Copy IIFE into dist/
```

Vercel then serves `dist/` as static files and auto-deploys `api/*.ts` as serverless functions.

### Deploy to Vercel

```bash
# First time:
vercel link
vercel --prod

# Subsequent deploys (or just push to git if GitHub integration is set up):
git push origin main   # Auto-deploys via Vercel GitHub integration
```

### Verify Deployment

After deploying, verify these URLs work:

| URL | Expected |
|-----|----------|
| `https://your-app.vercel.app/` | Standalone configurator SPA |
| `https://your-app.vercel.app/chase-cover-configurator.iife.js` | JavaScript IIFE bundle |
| `https://your-app.vercel.app/api/pricing` | JSON with pricing constants |

---

## Shopify Theme Setup

### Basic Setup

Add this to your Shopify product page template (Liquid):

```html
<chase-cover-configurator style="display:block;width:100%;height:800px;"></chase-cover-configurator>
<script src="https://your-app.vercel.app/chase-cover-configurator.iife.js"></script>
```

### With Product/Variant ID Linking

To link Draft Orders to a Shopify product (so they appear properly in the catalog):

```html
<chase-cover-configurator
  product-id="{{ product.id }}"
  variant-id="{{ product.variants.first.id }}"
  style="display:block;width:100%;height:800px;">
</chase-cover-configurator>
<script src="https://your-app.vercel.app/chase-cover-configurator.iife.js"></script>
```

When `variant-id` is provided, the Draft Order line item includes `variant_id`, linking it to that specific variant. If only `product-id` is provided, it uses `product_id` instead.

### Alternative Mount Point

If you can't use a custom element, use a div with a specific ID:

```html
<div id="chase-cover-configurator-mount" style="width:100%;height:800px;"></div>
<script src="https://your-app.vercel.app/chase-cover-configurator.iife.js"></script>
```

### What the IIFE Does on Load

1. Injects Google Fonts (`DM Sans`, `JetBrains Mono`) into `<head>`
2. Injects QRious library (for QR codes) into `<head>`
3. Finds `<chase-cover-configurator>` or `#chase-cover-configurator-mount`
4. Attaches a **Shadow DOM** to the mount element
5. Injects scoped CSS (`globals-scoped.css`) into the shadow root
6. Creates a light-DOM container (`#chase-cover-configurator-portal`) for AR/QR overlays
7. Detects the API base URL from the script's own `src` attribute
8. Reads `product-id` and `variant-id` attributes
9. Fetches pricing from `/api/pricing`
10. Renders the React app into the shadow root

---

## API Reference

### `GET /api/pricing`

Returns current pricing constants from the Google Sheet.

**Response** (200):
```json
{
  "AREA_RATE": 0.025,
  "LINEAR_RATE": 0.445,
  "BASE_FIXED": 178.03,
  "HOLE_PRICE": 25,
  "POWDER_COAT": 45,
  "SKIRT_SURCHARGE": 75,
  "SKIRT_THRESHOLD": 6,
  "GAUGE_MULT": { "24": 1, "20": 1.3, "18": 1.4, "16": 1.6, "14": 1.8, "12": 2.7, "10": 3.4 },
  "MATERIAL_MULT": { "galvanized": 1, "copper": 3 }
}
```

**Caching**: Server-side in-memory cache (5 min TTL) + HTTP `Cache-Control: public, max-age=60, s-maxage=300`.

### `POST /api/create-order`

Creates a Shopify Draft Order from a configuration.

**Request body**:
```json
{
  "w": 48,
  "l": 60,
  "sk": 3,
  "drip": true,
  "diag": true,
  "mat": "galvanized",
  "gauge": 24,
  "pc": false,
  "pcCol": "#0B0E0F",
  "holes": 1,
  "collarA": {
    "dia": 10,
    "height": 3,
    "centered": true,
    "offset1": 0, "offset2": 0, "offset3": 0, "offset4": 0
  },
  "collarB": null,
  "collarC": null,
  "quantity": 1,
  "notes": "",
  "shopifyProductId": "123456789",
  "shopifyVariantId": "987654321"
}
```

**Response** (200):
```json
{
  "checkout_url": "https://your-store.myshopify.com/..."
}
```

**Error responses**:
- `400`: Missing required fields
- `405`: Method not POST
- `500`: Internal error (auth failure, etc.)
- `502`: Shopify API error (includes `shopifyStatus` and `details`)

---

## How Orders Appear in Shopify Admin

Each Draft Order will show:

### Line Item
- **Title**: "Custom Chase Cover"
- **Price**: Server-calculated price (tamper-proof)
- **Quantity**: As selected by user
- **Linked product/variant**: If `product-id` / `variant-id` were provided

### Line Item Properties (visible in order details)
- Width: 48"
- Length: 60"
- Skirt Height: 3"
- Material: Galvanized
- Gauge: 24ga
- Drip Edge: Yes
- Diagonal Crease: Yes
- Powder Coat Color: (if enabled)
- Holes: 1
- Diameter: 10"
- Collar Height: 3"
- Position: Centered on cover (or A1/A2/A3/A4 offsets)
- Special Notes: (if provided)
- `_config_json`: Complete JSON config (hidden, for reproduction)

### Order Note
Human-readable multi-line description:
```
48" W x 60" L x 3" Skirt
Material: Galvanized | Gauge: 24ga
Drip Edge: Yes | Diagonal Crease: Yes
H1: dia10" x 3" tall (centered)
```

---

## Pricing: How It Works End-to-End

### Client-Side (for display only)

1. On app startup, `loadPricingFromAPI(apiBase)` calls `GET /api/pricing`
2. Response updates the `PRICING` object in `src/config/pricing.ts`
3. `onPricingLoaded()` triggers a price recompute in the Zustand store
4. As users change configuration, price updates instantly using the fetched constants

### Server-Side (tamper-proof, for actual orders)

1. When "Add to Cart" is clicked, `POST /api/create-order` is called
2. The server re-fetches pricing directly from Google Sheets API (not from cache)
3. Price is recalculated server-side using the same formula
4. The Draft Order is created with the **server-calculated price**
5. Even if someone tampers with client-side pricing, the order price is always correct

### Updating Prices

Just edit values in the Google Sheet. Changes propagate:
- To the **client** (displayed price): within ~5 minutes (server cache + HTTP cache)
- To **new orders** (actual price): immediately (server always re-fetches from Google Sheets)

No code changes or redeployment needed.

---

## Security Summary

| Layer | Protection |
|-------|-----------|
| Client-side pricing | Display only — calculated from fetched constants, not trusted |
| Server-side pricing | Re-fetched from Google Sheets on every order — tamper-proof |
| Shopify Auth | Token never exposed to client; server-side only |
| Google Sheet | Shared as "Viewer" only — not editable by public |
| CORS | API endpoints allow `*` origin (required for cross-origin Shopify embedding) |
| Shadow DOM | CSS isolation prevents Shopify theme from breaking configurator styles |

---

## Troubleshooting

### "Configuration error: API base not found"
The IIFE couldn't detect its own script URL. Make sure the script tag's `src` contains `chase-cover-configurator` in the filename.

### Price shows $0 or incorrect value
- Check browser console for pricing fetch errors
- Verify `GET /api/pricing` returns valid JSON
- Check that Google Sheet is shared as "Viewer" and API key is valid

### "Add to Cart" fails
- Check Vercel function logs for errors
- Verify Shopify credentials are set in Vercel env vars
- If using OAuth (Option B), ensure Client ID/Secret are correct
- Check that the Shopify app has `write_draft_orders` scope

### Configurator doesn't render on Shopify
- Verify the IIFE URL returns JavaScript (not 404)
- Check browser console for errors
- Ensure `<chase-cover-configurator>` element exists in the DOM before the script loads

### AR doesn't work on Shopify
- AR overlays are portaled to light DOM (`#chase-cover-configurator-portal`) — this is required for `<model-viewer>` to work
- On desktop, AR shows a QR code for mobile scanning
- On mobile, `<model-viewer>` is loaded dynamically on first AR request

### PDF download not working
- The PDF is generated from a hidden HTML element rendered off-screen
- Check browser console for `html2canvas` errors
- Ensure the `PdfReport` component is mounted (it's rendered in `App.tsx`)

---

## Testing Checklist

1. [ ] Google Sheet is set up with pricing values and shared as "Viewer"
2. [ ] Vercel env vars are set (see Environment Variables section)
3. [ ] `vercel --prod` deploys successfully
4. [ ] `https://your-app.vercel.app/` shows the standalone configurator
5. [ ] `https://your-app.vercel.app/chase-cover-configurator.iife.js` returns the JS file
6. [ ] `https://your-app.vercel.app/api/pricing` returns JSON with pricing constants
7. [ ] Shopify page loads the configurator correctly (no CSS conflicts)
8. [ ] Price updates in real-time as user changes options
9. [ ] "Add to Cart" redirects to Shopify checkout with correct price
10. [ ] Order appears in Shopify admin with all configuration details (properties, notes)
11. [ ] Product/variant linking works (if using `product-id` / `variant-id` attributes)
12. [ ] Changing a value in Google Sheet updates pricing within 5 minutes
13. [ ] AR QR code works on desktop, AR placement works on mobile
14. [ ] PDF download generates a valid specification worksheet
