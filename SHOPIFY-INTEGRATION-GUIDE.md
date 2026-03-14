# Chase Cover Configurator — Shopify + Vercel Integration Guide

## Goal

Integrate the chase cover 3D configurator into a Shopify store so that:
1. The configurator IIFE is hosted on Vercel (instant updates on git push / `vercel --prod`, no re-uploading to Shopify)
2. Pricing constants are stored in a Google Sheet (editable without touching code)
3. "Add to Cart" creates a Shopify Draft Order with the correct server-calculated price (tamper-proof)
4. Customer is redirected to Shopify's native checkout
5. The standalone configurator is also accessible at the Vercel URL (for testing / direct access)
6. If the customer presses Back from checkout, their configuration is automatically restored

No iframe is used. The IIFE loads as a `<script>` tag directly on the Shopify page inside a Shadow DOM for CSS isolation.

---

## Architecture

```
Shopify Product Page
  |
  +-- <chase-cover-configurator product-id="..." variant-id="...">
  |     Renders inside Shadow DOM (CSS isolated from Shopify theme)
  |
  +-- <script src="https://chase-cover-configurator.vercel.app/chase-cover-configurator.iife.js">
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
              -> Authenticates with Shopify (static shpat_ token)
              -> Uploads 3D screenshot to Shopify Files (requires write_files scope)
              -> Creates Shopify Draft Order via Admin API (2025-10)
              -> Returns checkout URL -> customer redirected

Vercel Deployment (https://chase-cover-configurator.vercel.app)
  +-- /                                        Standalone SPA (for testing / direct access)
  +-- /chase-cover-configurator.iife.js        IIFE bundle loaded by Shopify
  +-- /chase-configurator.iife.js              Legacy filename alias (same file)
  +-- /api/pricing                             Serverless: Google Sheets -> JSON
  +-- /api/create-order                        Serverless: Config -> Shopify Draft Order
```

---

## Prerequisites

### 1. Shopify Admin API Access — IMPORTANT

> ⚠️ **Always use Option A (Static Token)**. Option B (`client_credentials` OAuth) only works when the app was created inside the same Shopify organization as the store. If you are a Shopify Partner deploying to a **client store**, you must use Option A — otherwise you will get `shop_not_permitted` errors.

#### Option A: Static Admin API Access Token ✅ (Recommended — always use this for client stores)

1. Log into the **client's** Shopify Admin (not your Partners Dashboard)
2. Go to **Settings > Apps and sales channels > Develop apps**
3. Click **"Create an app"** → name it e.g. "Chase Cover Configurator"
4. Click **"Configure Admin API scopes"** → enable:
   - `write_draft_orders`
   - `read_draft_orders`
   - `write_files` ← **required for cart image upload**
   - `read_files`
5. Click **"Save"**, then click **"Install app"**
6. Copy the **Admin API access token** (`shpat_...`) — it's shown **only once**, save it securely!
7. Set this as `SHOPIFY_ACCESS_TOKEN` in Vercel environment variables
8. Set `SHOPIFY_STORE` to the store's `.myshopify.com` domain

#### Option B: OAuth Client Credentials ⚠️ (Only works within same Shopify org — avoid for client stores)

1. Go to the **Shopify Partners Dashboard** > Apps > your app
2. Under "API credentials", copy:
   - **Client ID** → set as `SHOPIFY_CLIENT_ID`
   - **Client Secret** → set as `SHOPIFY_CLIENT_SECRET`
3. The server will attempt a `client_credentials` grant on each order
4. **This will fail** (`shop_not_permitted`) if the app org ≠ the store's org

**Auth priority in `api/create-order.ts`**:
1. If `SHOPIFY_ACCESS_TOKEN` is set → use it (always preferred)
2. Otherwise → attempt `client_credentials` via `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET`

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
| `SHOPIFY_STORE` | Yes | Shopify store `.myshopify.com` domain | `kaminos.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | **Yes (Option A)** | Static Admin API token | `shpat_abc123...` |
| `SHOPIFY_CLIENT_ID` | Option B only | Shopify App Client ID | `18e8d566e8...` |
| `SHOPIFY_CLIENT_SECRET` | Option B only | Shopify App Client Secret | `shpss_e733...` |

### Setting via CLI

```bash
vercel env add GOOGLE_SHEET_ID        # paste your Google Sheet ID
vercel env add GOOGLE_SHEETS_API_KEY  # paste your Google API key
vercel env add SHOPIFY_STORE          # e.g. "kaminos.myshopify.com"
vercel env add SHOPIFY_ACCESS_TOKEN   # paste shpat_... token
```

### Local `.env` File

For local development, create a `.env` file in the project root:

```env
# Google Sheets
GOOGLE_SHEET_ID=your-sheet-id-here
GOOGLE_SHEETS_API_KEY=your-api-key-here

# Shopify
SHOPIFY_STORE=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_your_token_here
```

> **Important**: The `.env` file is gitignored. Never commit secrets to the repository.

---

## Project Structure (Integration-Specific Files)

```
chase-cover-configurator/
├── api/                              # Vercel serverless functions (auto-detected)
│   ├── pricing.ts                    # GET /api/pricing
│   └── create-order.ts              # POST /api/create-order
├── lib/
│   └── pricing-sheet.ts             # Shared pricing fetch/parse logic
├── vercel.json                       # Vercel config (build, CORS, rewrites)
├── src/
│   ├── shopify-entry.tsx             # Shopify IIFE entry point (Shadow DOM)
│   ├── main.tsx                      # Standalone SPA entry point
│   ├── store/configStore.ts         # Zustand store + saveConfigForRestore / restoreConfigIfNeeded
│   ├── config/pricing.ts            # Client-side pricing (fetches from /api/pricing)
│   └── styles/
│       ├── globals.css               # CSS source (edit this one!)
│       └── globals-scoped.css        # Auto-synced from globals.css before Shopify build
├── scripts/
│   └── sync-shopify-css.mjs         # Pre-build script: copies globals.css → globals-scoped.css
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

# Build Shopify IIFE only (also syncs CSS first)
npm run build:shopify

# Build everything for Vercel (SPA + IIFE + copies IIFE into dist/)
npm run build:vercel

# Deploy to Vercel production (use this if GitHub auto-deploy doesn't trigger)
npx vercel --prod
```

### How `build:vercel` Works

```bash
npm run build              # Standard Vite SPA build -> dist/
npm run build:shopify      # Syncs CSS, then IIFE build (BUILD_TARGET=shopify) -> dist-shopify/
node -e "..."              # Copies IIFE into dist/ (both filenames)
```

Vercel then serves `dist/` as static files and auto-deploys `api/*.ts` as serverless functions.

### Deploy to Vercel

```bash
# If GitHub integration is connected, push to main:
git push origin main

# If Vercel doesn't auto-trigger (permissions issue), deploy manually:
npx vercel --prod
```

### Verify Deployment

After deploying, verify these URLs work:

| URL | Expected |
|-----|----------|
| `https://chase-cover-configurator.vercel.app/` | Standalone configurator SPA |
| `https://chase-cover-configurator.vercel.app/chase-cover-configurator.iife.js` | JavaScript IIFE bundle |
| `https://chase-cover-configurator.vercel.app/api/pricing` | JSON with pricing constants |

---

## Shopify Theme Setup

### Basic Setup

Add this to your Shopify product page template (Liquid):

```liquid
<chase-cover-configurator style="display:block;width:100%;height:800px;"></chase-cover-configurator>
<script src="https://chase-cover-configurator.vercel.app/chase-cover-configurator.iife.js"></script>
```

### With Product/Variant ID Linking

To link Draft Orders to a Shopify product (so they appear properly in the catalog):

```liquid
<chase-cover-configurator
  product-id="{{ product.id }}"
  variant-id="{{ product.variants.first.id }}"
  style="display:block;width:100%;height:800px;">
</chase-cover-configurator>
<script src="https://chase-cover-configurator.vercel.app/chase-cover-configurator.iife.js"></script>
```

When `variant-id` is provided, the Draft Order line item includes `variant_id`, linking it to that specific variant. If only `product-id` is provided, it uses `product_id` instead.

### Alternative Mount Point

If you can't use a custom element, use a div with a specific ID:

```html
<div id="chase-cover-configurator-mount" style="width:100%;height:800px;"></div>
<script src="https://chase-cover-configurator.vercel.app/chase-cover-configurator.iife.js"></script>
```

### What the IIFE Does on Load

1. Patches iOS viewport (prevents zoom on input focus)
2. Injects Google Fonts (`DM Sans`, `JetBrains Mono`) into `<head>`
3. Injects QRious library (for QR codes) into `<head>`
4. Finds `<chase-cover-configurator>`, `<chase-configurator>`, `#chase-cover-configurator-mount`, or `#chase-configurator-mount`
5. Attaches a **Shadow DOM** to the mount element
6. Injects scoped CSS (`globals-scoped.css`) into the shadow root
7. Creates a light-DOM container (`#chase-cover-configurator-portal`) for AR/QR overlays + injects portal CSS
8. Detects the API base URL from the script's own `src` attribute
9. Reads `product-id` and `variant-id` attributes
10. Fetches pricing from `/api/pricing`
11. Renders the React app into the shadow root

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
  "MATERIAL_MULT": { "galvanized": 1, "copper": 3 },
  "STORM_COLLAR_PRICES": {}
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
  "holes": 2,
  "collarA": {
    "shape": "round",
    "dia": 10,
    "height": 3,
    "centered": true,
    "offset1": 0, "offset2": 0, "offset3": 0, "offset4": 0,
    "stormCollar": false
  },
  "collarB": {
    "shape": "rect",
    "dia": 8,
    "rectWidth": 8,
    "rectLength": 8,
    "height": 2,
    "centered": false,
    "offset1": 10, "offset2": 12, "offset3": 10, "offset4": 12,
    "stormCollar": false
  },
  "collarC": null,
  "quantity": 1,
  "notes": "",
  "shopifyProductId": "123456789",
  "shopifyVariantId": "987654321",
  "image": "data:image/png;base64,..."
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
- **Price**: Server-calculated price (tamper-proof, re-fetched from Google Sheets)
- **Quantity**: As selected by user
- **Linked product/variant**: If `product-id` / `variant-id` were provided

### Line Item Properties

Properties are combined into fewer lines for readability:

```
Dimensions:        60" L × 48" W × 3" Skirt
Material & Gauge:  Galvanized — 24ga
Options:           Drip Edge: Yes · Diagonal Crease: Yes
Powder Coat:       Ruby Red (#940604)
Holes:             2
H1 (Left):         Round ⌀10" — Collar 3" tall
H1 Position:       Centered on cover
H2 (Right):        Rectangle 8" × 8" — Collar 2" tall
H2 Offsets:        Top: 5" · Right: 12" · Bottom: 5" · Left: 12"
Special Notes:     Customer note here
_config_json:      { …full JSON config… }
_preview_image:    https://cdn.shopify.com/…
```

> Properties starting with `_` are hidden from customers in the checkout UI.

### Hole Position Labels

| Hole Count | H1 Label | H2 Label | H3 Label |
|-----------|---------|---------|---------|
| 1 hole | "Hole" | — | — |
| 2 holes | "H1 (Left)" | "H2 (Right)" | — |
| 3 holes | "H1 (Left)" | "H2 (Middle)" | "H3 (Right)" |

### Order Note

Human-readable multi-line description:
```
60" L × 48" W × 3" Skirt
Material: Galvanized | Gauge: 24ga
Drip Edge: Yes | Diagonal Crease: Yes
H1 (Left): Round ⌀10" — 3" tall (centered)
H2 (Right): Rect 8" × 8" — 2" tall [Top:5" Right:12" Bottom:5" Left:12"]

Preview: https://cdn.shopify.com/…
```

---

## Cart Image (3D Screenshot)

When "Add to Cart" is clicked, the app:
1. Captures the 3D canvas as a PNG using `canvas.toDataURL()`
2. Sends it as a `base64` field in the `POST /api/create-order` request
3. The server uploads it to Shopify Files via GraphQL staged uploads
4. The resulting CDN URL is included as a hidden `_preview_image` property and in the order note

### Requirements for Image Upload

The Shopify app **must have** these scopes:
- `write_files`
- `read_files`

If these scopes are missing, the upload fails silently (the order is still created; the image is just omitted).

### Adding `write_files` Scope

1. Shopify Admin > Settings > Apps and sales channels > Develop apps > your app
2. Click "Configure Admin API scopes"
3. Enable `write_files` and `read_files`
4. Click Save → re-install the app (you'll get a new `shpat_...` token)
5. Update `SHOPIFY_ACCESS_TOKEN` in Vercel with the new token

---

## Pricing: How It Works End-to-End

### Client-Side (for display only)

1. On app startup, `loadPricingFromAPI(apiBase)` calls `GET /api/pricing`
2. Response updates the `PRICING` object in `src/config/pricing.ts`
3. `onPricingLoaded()` triggers a price recompute in the Zustand store
4. As users change configuration, price updates instantly using the fetched constants

### Server-Side (tamper-proof, for actual orders)

1. When "Add to Cart" is clicked, `POST /api/create-order` is called
2. The server re-fetches pricing directly from Google Sheets API (not from client-supplied values)
3. Price is recalculated server-side using the same formula
4. The Draft Order is created with the **server-calculated price**
5. Even if someone tampers with client-side data, the order price is always correct

### Updating Prices

Just edit values in the Google Sheet. Changes propagate:
- To the **client** (displayed price): within ~5 minutes (server cache + HTTP cache)
- To **new orders** (actual price): immediately on next order (server always re-fetches fresh from Google Sheets)

No code changes or redeployment needed.

---

## Session Config Restore (Back-from-Cart)

When the user clicks "Add to Cart":
1. The full configuration is saved to `sessionStorage` under key `chase-cover-restore`
2. The user is redirected to the Shopify checkout URL

When the page loads:
- If `chase-cover-restore` exists in `sessionStorage` → config is restored and the key is **immediately deleted**
- If it doesn't exist → default config loads

**Effect**:
- Press Back from checkout → config restored ✅
- Manually refresh the page → default config loads ✅ (key was either never set or already cleared)

---

## Security Summary

| Layer | Protection |
|-------|-----------|
| Client-side pricing | Display only — calculated from fetched constants, not trusted for orders |
| Server-side pricing | Re-fetched from Google Sheets on every order — tamper-proof |
| Shopify Auth | `shpat_` token never exposed to client; used server-side only |
| Google Sheet | Shared as "Viewer" only — not editable by public |
| CORS | API endpoints allow `*` origin (required for cross-origin Shopify embedding) |
| Shadow DOM | CSS isolation prevents Shopify theme from breaking configurator styles |
| `_` properties | Hidden line item properties (prefixed `_`) are not shown to customers in checkout |

---

## Troubleshooting

### "Configuration error: API base not found"
The IIFE couldn't detect its own script URL. Make sure the `<script>` tag `src` contains `chase-cover-configurator` or `chase-configurator` in the filename.

### Price shows $0 or incorrect value
- Check browser console for pricing fetch errors
- Verify `GET /api/pricing` returns valid JSON
- Check that Google Sheet is shared as "Viewer" and API key is valid

### "Add to Cart" fails with `shop_not_permitted`
- You are using `client_credentials` OAuth for a cross-organization store
- **Fix**: Create a custom app directly in the client's Shopify Admin and use the static `SHOPIFY_ACCESS_TOKEN`

### "Add to Cart" fails with `application_cannot_be_found`
- `SHOPIFY_CLIENT_ID` is incorrect or the app was deleted
- **Fix**: Use `SHOPIFY_ACCESS_TOKEN` from a Store Admin custom app instead

### "Add to Cart" fails with other error
- Check Vercel function logs: `vercel logs` or Vercel Dashboard > Deployments > Functions
- Verify all required env vars are set
- Ensure the Shopify app has `write_draft_orders` scope

### Configurator doesn't render on Shopify
- Verify the IIFE URL returns JavaScript (not 404)
- Check browser console for errors
- Ensure `<chase-cover-configurator>` element exists in the DOM before the script loads

### AR doesn't work on Shopify
- AR overlays are portaled to light DOM (`#chase-cover-configurator-portal`) — required for `<model-viewer>`
- On desktop: AR shows a QR code for mobile scanning
- On mobile: `<model-viewer>` is loaded dynamically on first AR tap, then AR launches directly

### Cart image is empty / no image in checkout
- App is missing `write_files` scope — see "Adding `write_files` Scope" above
- After adding scope you must re-install the app and update `SHOPIFY_ACCESS_TOKEN` in Vercel

### PDF download not working
- The PDF is generated from a hidden HTML element rendered off-screen
- Check browser console for `html2canvas` errors
- Ensure the `PdfReport` component is mounted (it's rendered in `App.tsx`)

### Config is lost after clicking Add to Cart
- The config is saved to `sessionStorage` right before redirect and restored on the next page load
- If user opens a new tab or clears storage, config won't restore — this is by design

### Vercel doesn't auto-deploy on git push
- GitHub integration may require re-authorization in Vercel Dashboard
- Use `npx vercel --prod` to deploy manually at any time

---

## Testing Checklist

### Initial Setup
1. [ ] Google Sheet is set up with pricing values and shared as "Viewer"
2. [ ] Vercel env vars are set: `GOOGLE_SHEET_ID`, `GOOGLE_SHEETS_API_KEY`, `SHOPIFY_STORE`, `SHOPIFY_ACCESS_TOKEN`
3. [ ] `npx vercel --prod` deploys successfully

### Vercel URLs
4. [ ] `https://chase-cover-configurator.vercel.app/` shows the standalone configurator
5. [ ] `/chase-cover-configurator.iife.js` returns the JS bundle
6. [ ] `/api/pricing` returns JSON with pricing constants

### Shopify Integration
7. [ ] Shopify product page loads the configurator without CSS conflicts
8. [ ] Price updates in real-time as user changes options
9. [ ] "Add to Cart" creates a Draft Order and redirects to Shopify checkout
10. [ ] Checkout shows correct price (matches configurator display)
11. [ ] Order appears in Shopify Admin > Drafts with all configuration details
12. [ ] Line item properties show combined format (Dimensions, Material & Gauge, Options, hole details)
13. [ ] Hole position labels show Left/Middle/Right correctly
14. [ ] Product/variant linking works (order linked to product in catalog)

### Material & Config Behavior
15. [ ] Switching to Copper always shows copper color in 3D model
16. [ ] Enabling powder coat → switching to copper → switching back to galvanized restores powder coat color
17. [ ] Powder coat is not charged when material is copper
18. [ ] Rectangular hole shows "Rectangle W" × H"" in order, not "Round ⌀"

### Session & Navigation
19. [ ] Pressing Back from checkout restores configuration
20. [ ] Manually refreshing the page loads defaults (not saved session)

### Features
21. [ ] Changing a value in Google Sheet updates displayed pricing within 5 minutes
22. [ ] AR QR code appears on desktop, AR placement works on mobile (direct launch)
23. [ ] PDF download generates a valid specification worksheet
24. [ ] "Move Holes" drag mode works — holes can be repositioned in 3D viewport
25. [ ] Cart image shows 3D screenshot in Shopify checkout (requires `write_files` scope)
