# Chase Cover Configurator — Project Documentation

## Overview

This is a 3D chase cover configurator built for **Kaminos**. Users configure custom chase covers by setting dimensions, hole placements, material, gauge, and options. The 3D model updates in real-time and supports AR preview. The app is deployed on **Vercel** and integrates with **Shopify** (Draft Orders) and **Google Sheets** (dynamic pricing).

**Tech stack**: React + TypeScript + Vite + Zustand (state) + React Three Fiber (3D) + Three.js (geometry)

**Hosting**: Vercel (serverless functions + static assets + Shopify IIFE bundle)

---

## File Structure

```
chase-cover-configurator/
├── api/                                 # Vercel serverless functions
│   ├── pricing.ts                       # GET /api/pricing — returns Google Sheet pricing (cached 5 min)
│   └── create-order.ts                  # POST /api/create-order — creates Shopify Draft Order
├── vercel.json                          # Vercel build config, CORS headers, rewrites
├── .env                                 # Environment variables (see "Environment Variables" section)
├── package.json                         # Scripts: dev, build, build:shopify, build:vercel
├── vite.config.ts                       # Multi-target build config (SPA / Shopify IIFE / Vercel)
├── CLAUDE.md                            # This file
├── SHOPIFY-INTEGRATION-GUIDE.md         # Step-by-step Shopify + Vercel integration guide
├── dist/                                # Vercel output (SPA + IIFE copy)
├── dist-shopify/                        # Shopify IIFE build output
├── src/
│   ├── App.tsx                          # Main layout, dim-overlay, AR launch, Add to Cart handler
│   ├── main.tsx                         # React entry point (standalone SPA mode)
│   ├── shopify-entry.tsx                # Shopify IIFE entry (Shadow DOM, portal, API base detection)
│   ├── web-component.tsx                # Legacy web component entry (not used in production)
│   ├── store/configStore.ts             # Zustand store, pricing logic, price recompute on load
│   ├── config/
│   │   ├── index.ts                     # Re-exports pricing + ralColors
│   │   ├── pricing.ts                   # Pricing constants, loadPricingFromAPI(), onPricingLoaded()
│   │   └── ralColors.ts                 # RAL color palette data
│   ├── utils/
│   │   ├── geometry.ts                  # 3D model generation (buildScene, holeWorld)
│   │   ├── ar.ts                        # AR export (GLB) and config serialization
│   │   ├── cameraRef.ts                 # Camera action bindings (reset, top, front)
│   │   ├── format.ts                    # formatFrac() — fraction display (e.g. 48 1/2)
│   │   └── pdfGenerator.ts             # PDF generation via html2canvas + jsPDF
│   ├── components/
│   │   ├── viewer/
│   │   │   ├── ChaseViewer.tsx          # R3F Canvas, lights, environment
│   │   │   ├── ChaseModel.tsx           # Geometry rebuild on config changes
│   │   │   └── DimensionOverlay.tsx     # 3D labels with arrows (A1-A4)
│   │   ├── sidebar/
│   │   │   ├── Sidebar.tsx              # Main sidebar layout + price breakdown
│   │   │   ├── DimensionField.tsx       # Width/Length/Skirt inputs with limits
│   │   │   ├── CollarGroup.tsx          # Per-hole controls (dia, height, offsets)
│   │   │   ├── HoleSelector.tsx         # 0-3 hole selection buttons
│   │   │   ├── GaugeSelect.tsx          # Gauge dropdown
│   │   │   ├── MaterialChips.tsx        # Galvanized / Copper toggle
│   │   │   ├── ToggleRow.tsx            # Toggle switches (drip, diag, pc)
│   │   │   ├── PowderCoatSection.tsx    # Color picker + RAL trigger
│   │   │   ├── PriceDisplay.tsx         # Estimated price display
│   │   │   ├── CartRow.tsx              # Quantity + Add to Cart + Download PDF
│   │   │   └── NotesField.tsx           # Special notes textarea
│   │   ├── pdf/
│   │   │   └── PdfReport.tsx            # Hidden PDF report template (rendered off-screen)
│   │   ├── ral/RalModal.tsx             # RAL color palette modal
│   │   └── ar/                          # AR-related components
│   ├── styles/
│   │   ├── globals.css                  # All CSS (standalone mode)
│   │   └── globals-scoped.css           # Scoped CSS injected into Shadow DOM (Shopify IIFE)
│   ├── vite-env.d.ts                    # Vite type declarations
│   └── model-viewer.d.ts               # Type declarations for <model-viewer> web component
```

---

## Environment Variables

All environment variables are set in Vercel (Settings > Environment Variables) and in `.env` for local dev.

| Variable | Description | Example |
|----------|-------------|---------|
| `GOOGLE_SHEET_ID` | Google Sheet ID containing pricing constants | `1L9qAQ...` |
| `GOOGLE_SHEETS_API_KEY` | Google Cloud API key (restricted to Sheets API) | `AIzaSy...` |
| `SHOPIFY_STORE` | Shopify store domain | `your-store.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | (Optional) Static Shopify Admin API token (`shpat_...`) for Store Admin apps | `shpat_abc123...` |
| `SHOPIFY_CLIENT_ID` | Shopify App Client ID (used for OAuth if no static token) | `18e8d5...` |
| `SHOPIFY_CLIENT_SECRET` | Shopify App Client Secret (used for OAuth if no static token) | `shpss_e7...` |

**Auth priority** (in `api/create-order.ts`):
1. If `SHOPIFY_ACCESS_TOKEN` is set, use it directly (simplest — for Store Admin custom apps)
2. Otherwise, use `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` to obtain a token via OAuth `client_credentials` grant (tokens are cached in memory until near expiry)

---

## Build System

### Build Targets (via `vite.config.ts`)

| Command | `BUILD_TARGET` | Output | Description |
|---------|---------------|--------|-------------|
| `npm run dev` | — | — | Local dev server (port 5173) |
| `npm run build` | — | `dist/` | Standard SPA build (standalone hosting) |
| `npm run build:shopify` | `shopify` | `dist-shopify/` | IIFE bundle for Shopify embedding |
| `npm run build:vercel` | — | `dist/` | Both SPA + IIFE (copies IIFE into `dist/`) |

### Vercel Build (`build:vercel`)

Runs `npm run build && npm run build:shopify && cp dist-shopify/chase-cover-configurator.iife.js dist/`. This produces:
- `dist/index.html` + assets — standalone SPA (accessible at the Vercel URL root)
- `dist/chase-cover-configurator.iife.js` — the IIFE bundle loaded by Shopify
- `api/*.ts` — Vercel serverless functions (auto-detected)

### `vercel.json`

- `buildCommand`: `npm run build:vercel`
- `outputDirectory`: `dist`
- CORS headers on `/api/*` and `/chase-cover-configurator.iife.js` (Access-Control-Allow-Origin: *)
- Cache-Control on IIFE: `public, max-age=60, s-maxage=300`

---

## Shopify Integration (Summary)

See `SHOPIFY-INTEGRATION-GUIDE.md` for full step-by-step setup.

### How It Works

1. **Shopify product page** loads `<script src="https://your-vercel-app.vercel.app/chase-cover-configurator.iife.js">`
2. The IIFE (`shopify-entry.tsx`) attaches a **Shadow DOM** to `<chase-cover-configurator>` for CSS isolation
3. On load, it calls `GET /api/pricing` to fetch pricing constants from Google Sheets
4. User configures the chase cover; price updates in real-time
5. "Add to Cart" calls `POST /api/create-order` which:
   - Re-fetches pricing from Google Sheets (tamper-proof)
   - Recalculates price server-side
   - Creates a Shopify **Draft Order** via Admin API (API version `2025-10`)
   - Returns the `invoice_url` (Shopify checkout link)
6. Customer is redirected to Shopify's native checkout

### Shadow DOM & Portals

- The configurator renders inside a **Shadow DOM** (`shopify-entry.tsx`) for complete CSS isolation from Shopify themes
- CSS is injected as `globals-scoped.css?inline` into the shadow root
- AR/QR overlays are **portaled to the light DOM** (`#chase-cover-configurator-portal`) because `<model-viewer>` requires light DOM for AR to work
- Google Fonts and QRious are injected into the document head (light DOM)

### Product & Variant ID Linking

The Shopify Liquid template can pass product/variant IDs:
```html
<chase-cover-configurator
  product-id="{{ product.id }}"
  variant-id="{{ product.variants.first.id }}"
  style="display:block;width:100%;height:800px;">
</chase-cover-configurator>
```

These are read by `shopify-entry.tsx` and passed to `App` as props. When present, the Draft Order line item includes `variant_id` or `product_id`, linking the order to the Shopify product catalog.

### API Base URL Detection

The IIFE detects its own origin by scanning `<script>` tags for one containing `chase-cover-configurator` in the `src` (and still accepts the legacy `chase-configurator` filename during the transition). The origin of that script URL becomes the API base (`window.__chaseApiBase`), so API calls always go back to the Vercel deployment regardless of which Shopify domain hosts the page.

---

## Serverless API Functions (Vercel)

### `GET /api/pricing`

- Fetches pricing constants from Google Sheets (`Sheet1!A1:B20`)
- In-memory cache with 5-minute TTL
- Returns JSON: `{ AREA_RATE, LINEAR_RATE, BASE_FIXED, HOLE_PRICE, POWDER_COAT, SKIRT_SURCHARGE, SKIRT_THRESHOLD, GAUGE_MULT, MATERIAL_MULT }`
- Cache-Control: `public, max-age=60, s-maxage=300`

### `POST /api/create-order`

- Receives full configuration as JSON body
- Authenticates with Shopify (static token or OAuth — see "Auth priority" above)
- Fetches pricing from Google Sheets server-side (tamper-proof)
- Computes price server-side
- Creates a Shopify Draft Order with:
  - Line item properties (Width, Length, Skirt, Material, Gauge, Drip Edge, Diagonal Crease, Powder Coat, Holes, per-hole details)
  - Hidden `_config_json` property with full JSON config for reproduction
  - Order note with human-readable description
- Returns `{ checkout_url }` (the Draft Order invoice URL)

---

## Dynamic Pricing (Google Sheets)

Pricing constants are stored in a Google Sheet and fetched at two points:
1. **Client-side** (`loadPricingFromAPI`): On app startup, fetches via `GET /api/pricing` for real-time price display
2. **Server-side** (`create-order.ts`): Re-fetches directly from Google Sheets API before creating the order (tamper-proof)

When remote pricing loads, the Zustand store's `onPricingLoaded` callback triggers a price recompute.

### Google Sheet Structure

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

Changes take effect within **5 minutes** (server cache TTL). No code changes or redeployment needed.

---

## Pricing Formula

**Files**: `config/pricing.ts` + `store/configStore.ts` + `api/create-order.ts`

```
base = AREA_RATE * W * L + LINEAR_RATE * (W + L) + BASE_FIXED
subtotal = base + holes * HOLE_PRICE + skirtSurcharge + powderCoat
total = subtotal * GAUGE_MULT[gauge] * MATERIAL_MULT[material]
```

| Constant | Default Value |
|----------|---------------|
| AREA_RATE | $0.025/sq in |
| LINEAR_RATE | $0.445/in |
| BASE_FIXED | $178.03 |
| HOLE_PRICE | $25/hole |
| POWDER_COAT | $45 |
| SKIRT_SURCHARGE | $75 (if skirt >= 6") |
| SKIRT_THRESHOLD | 6" |

**Gauge multipliers**: 24ga=1.0, 20ga=1.3, 18ga=1.4, 16ga=1.6, 14ga=1.8, 12ga=2.7, 10ga=3.4

**Material multipliers**: Galvanized=1.0, Copper=3.0

---

## PDF Generation

Users can download a PDF specification/pricing worksheet via the "Download PDF" button in `CartRow.tsx`.

### How It Works

1. `PdfReport.tsx` renders a hidden HTML report off-screen (`position: absolute; top: -9999px`)
2. The report includes:
   - Kaminos header with date and order number field
   - Top-down SVG drawing of the cover with holes positioned using `holeWorld()` from `geometry.ts`
   - Dimensions, hole configurations, material, gauge, options
   - Pricing summary (unit price, quantity, total)
3. `pdfGenerator.ts` uses `html2canvas` to capture the hidden element, then `jsPDF` to create a letter-size PDF
4. File is downloaded as `KAMINOS-ChaseCover-YYYY-MM-DD.pdf`

---

## Dimension Limits

| Field | Min | Max | Default | Unit | Snap |
|-------|-----|-----|---------|------|------|
| Width | 16 (dynamic) | 60 | 48 | inches | 1/8" |
| Length | 16 (dynamic) | 120 | 60 | inches | 1/8" |
| Skirt | 1 | 12 | 3 | inches | 1/8" |

**Dynamic minimums** (`DimensionField.tsx`):
- Width min = max(16, `largestHoleDia + 1"`)
- Length min depends on hole count:
  - 1 hole: max(16, `diaA + 1"`)
  - 2 holes: max(16, `diaA + diaB + 2"`, `2*diaA + 2"`, etc.)
  - 3 holes: similar but with 3 hole diameters

All inputs snap to nearest 1/8 inch.

---

## Hole Placement Logic

### Holes (0-3)
Each hole has: diameter (3-30"), collar height (1-52"), centered flag, 4 offsets.

### Centered Mode
When centered, holes auto-position along the Z axis (length direction):
- **1 hole**: center of cover (0, 0)
- **2 holes**: spaced at +/-L/4 from center (or further if diameters require it)
- **3 holes**: A at +L/3, B at center (0), C at -L/3 (adjusted for diameter)

**Overlap prevention**: Centered holes enforce a minimum gap of 1" between hole edges:
```
spacing = max(defaultSpacing, radiusA + radiusB + 1")
```

### Manual Offset Mode
When "Centered on Cover" is unchecked, user controls 4 offsets:

| Label | Offset Key | Meaning |
|-------|-----------|---------|
| X1 (Top) | offset3 | Distance from top edge to hole edge |
| X2 (Right) | offset4 | Distance from right edge to hole edge |
| X3 (Bottom) | offset1 | Distance from bottom edge to hole edge |
| X4 (Left) | offset2 | Distance from left edge to hole edge |

**Internal position calculation** (`geometry.ts:holeWorld`):
```
cx = (W/2 - offset1) * SC - radius
cz = (L/2 - offset2) * SC - radius
```

**Collision detection** (`CollarGroup.tsx:clampForCollision`):
When editing offsets, the system checks distance to all other holes and ensures `dist >= r1 + r2 + 1"`. If violated, the proposed offset is pushed back to maintain the gap.

**Offset constraints**: Each offset is clamped to `[0, coverDim - holeDia]`.

---

## Dim-Overlay (Top-Right Info Box)

Shows in the 3D viewport as a summary:
```
48" W x 60" L x 3" Skirt
H1: dia10" (on center)
H1: dia10" [A1: 5" A2: 8" A3: 5" A4: 8"]
```

When not centered, shows all 4 offsets: A1=offset3 (Top), A2=offset4 (Right), A3=offset1 (Bottom), A4=offset2 (Left).

---

## 3D Label System (DimensionOverlay)

Labels float above the model using `@react-three/drei Html` components with `distanceFactor={8}` for stable sizing. Each hole shows 4 measurement arrows:
- Arrow from each edge to the hole perimeter (not center)
- Color coded: A=yellow (#facc15), B=sky blue (#38bdf8), C=green (#4ade80)
- Arrows have heads at both ends

Side labels (Top/Right/Bottom/Left) shown when "Show Side Labels" is checked and holes > 0.

Per-hole labels are individually toggleable via "Show Labels" checkbox.

---

## 3D Geometry (`geometry.ts`)

### Scale
`SC = 0.02` — world units per inch. All calculations convert inches to world units.

### Gauge Thickness (inches)
10ga=0.1345, 12ga=0.1046, 14ga=0.0747, 16ga=0.0598, 18ga=0.0478, 20ga=0.0359, 24ga=0.0239

### Model Components

1. **Lid (top surface)**:
   - **Flat** (diag off): `ExtrudeGeometry` rectangle with circular holes via `Shape.holes`
   - **Sloped** (diag on): 60x60 tessellated grid. Height at each point: `edgeY + SLOPE * (1 - max(|px|, |pz|))` where px/pz are normalized coords (Chebyshev distance). Vertices near diagonals snap to create sharp crease lines. Triangle edges align along diagonals for visible ridges. SLOPE = `sqrt(W^2 + L^2) * 0.035`.

2. **Skirt**: 4 `BoxGeometry` panels around the perimeter, height = skirt value.

3. **Drip Edge**: 4 beveled strips (0.5" out, 0.5" down at 45deg) as custom `BufferGeometry` quads.

4. **Collars**: Custom `BufferGeometry` cylinders (48 segments). Bottom vertices follow `getRoofY()` for smooth intersection with sloped roof. Top ring cap via `RingGeometry`.

5. **Bottom face** (sloped mode only): Flat `ExtrudeGeometry` with hole cutouts at skirt height.

### Hole Cutouts on Sloped Roof
Grid vertices near hole boundaries snap to the hole radius. Triangles inside holes or entirely on the hole boundary are culled. No CSG library needed.

---

## AR System (`ar.ts`)

### Export
`exportToGLB(group)`: Clones the scene group, scales to real-world meters (0.0254/SC), strips environment maps, exports as base64 GLB via `GLTFExporter`.

### Serialization
`getConfigState(config)`: Serializes config to base64 JSON for URL hash. Includes dimensions, toggles, and per-hole collar settings.

`applyConfigState(base64)`: Restores config from URL hash on page load (mobile AR flow).

### Flow
1. Desktop: Shows QR code with URL containing serialized config hash
2. Mobile: Scans QR -> page loads with config -> user taps "Launch AR"
3. GLB exported from scene -> passed to `<model-viewer>` web component for WebXR/Scene Viewer

### QR Code Generation
Uses QRious library (loaded from CDN). On desktop, clicking "View in AR" generates a QR code with the current config serialized in the URL hash. The URL uses the page's canonical URL if available (avoids Shopify preview paths that 404).

### model-viewer
Loaded dynamically on mobile when AR is first triggered. The `<model-viewer>` element is portaled to light DOM on Shopify for AR to work through Shadow DOM.

---

## Materials

- **Galvanized**: metalness=0.9, roughness=0.25, color=#b8c4cc
- **Copper**: metalness=0.85, roughness=0.15, color=#e09a72
- **Powder Coat**: metalness=0.3, roughness=0.6, user-selected color

---

## State Management (Zustand)

Single store `useConfigStore` with flat state. Two mutation methods:
- `set(partial)`: Updates any top-level config and recomputes price
- `setCollar(id, partial)`: Updates a specific collar (A/B/C) and recomputes price

Defaults: W=48, L=60, Skirt=3, 1 hole, 10" dia, 3" collar height, centered, galvanized, 24ga, drip on, diagonal crease on.

On startup, `loadPricingFromAPI()` fetches remote pricing. When it resolves, `onPricingLoaded()` triggers a price recompute in the store so the displayed price reflects the latest Google Sheet values.

---

## Entry Points

### Standalone SPA (`main.tsx`)
- Used for local dev (`npm run dev`) and the Vercel-hosted standalone page
- Renders `<App>` into `#root`
- Calls `loadPricingFromAPI(window.location.origin)` on startup
- No Shadow DOM; uses `globals.css` directly

### Shopify IIFE (`shopify-entry.tsx`)
- Built via `npm run build:shopify` (BUILD_TARGET=shopify)
- Self-executing IIFE that:
  1. Injects Google Fonts + QRious into document head
  2. Finds `<chase-cover-configurator>` or `#chase-cover-configurator-mount`
  3. Attaches Shadow DOM with `globals-scoped.css` injected as `<style>`
  4. Creates a light-DOM portal container for AR/QR overlays
  5. Detects API base URL from the script's own `src`
  6. Reads `product-id` and `variant-id` attributes from the mount element
  7. Calls `loadPricingFromAPI(apiBase)` and renders `<App>` into shadow root

### Legacy Web Component (`web-component.tsx`)
- Not used in current production flow
- Defines a `<chase-cover-configurator>` custom element with Shadow DOM
