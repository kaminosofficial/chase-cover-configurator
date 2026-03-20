# Chase Cover Configurator — Project Documentation

## Overview

This is a 3D chase cover configurator built for **Kaminos**. Users configure custom chase covers by setting dimensions, hole placements, material, gauge, and options. The 3D model updates in real-time and supports AR preview. The app is deployed on **Vercel** and integrates with **Shopify** (Draft Orders) and **Google Sheets** (dynamic pricing).

**Tech stack**: React + TypeScript + Vite + Zustand (state) + React Three Fiber (3D) + Three.js (geometry)

**Hosting**: Vercel (serverless functions + static assets + Shopify IIFE bundle)

**Live URL**: `https://chase-cover-configurator.vercel.app`

---

## File Structure

```
chase-cover-configurator/
├── api/                                 # Vercel serverless functions
│   ├── pricing.ts                       # GET /api/pricing — returns Google Sheet pricing (cached 5 min)
│   └── create-order.ts                  # POST /api/create-order — creates Shopify Draft Order
├── lib/
│   └── pricing-sheet.ts                 # Shared pricing fetch logic (used by api/pricing.ts + api/create-order.ts)
├── vercel.json                          # Vercel build config, CORS headers, rewrites
├── .env                                 # Environment variables (see "Environment Variables" section)
├── package.json                         # Scripts: dev, build, build:shopify, build:vercel
├── vite.config.ts                       # Multi-target build config (SPA / Shopify IIFE / Vercel)
├── scripts/
│   └── sync-shopify-css.mjs             # Copies globals.css -> globals-scoped.css before Shopify build
├── CLAUDE.md                            # This file
├── SHOPIFY-INTEGRATION-GUIDE.md         # Step-by-step Shopify + Vercel integration guide
├── dist/                                # Vercel output (SPA + IIFE copy)
├── dist-shopify/                        # Shopify IIFE build output
├── src/
│   ├── App.tsx                          # Main layout, dim-overlay, AR launch, Add to Cart handler
│   ├── main.tsx                         # React entry point (standalone SPA mode)
│   ├── shopify-entry.tsx                # Shopify IIFE entry (Shadow DOM, portal, API base detection)
│   ├── web-component.tsx                # Legacy web component entry (not used in production)
│   ├── store/configStore.ts             # Zustand store, pricing logic, session restore helpers
│   ├── config/
│   │   ├── index.ts                     # Re-exports pricing + ralColors
│   │   ├── pricing.ts                   # Pricing constants, loadPricingFromAPI(), onPricingLoaded()
│   │   └── ralColors.ts                 # RAL color palette data
│   ├── utils/
│   │   ├── geometry.ts                  # 3D model generation (buildScene, holeWorld, mkMat)
│   │   ├── ar.ts                        # AR export (GLB) and config serialization
│   │   ├── cameraRef.ts                 # Camera action bindings (reset, top, front)
│   │   ├── format.ts                    # formatFrac() — fraction display (e.g. 48 1/2)
│   │   └── pdfGenerator.ts             # PDF generation via html2canvas + jsPDF
│   ├── components/
│   │   ├── viewer/
│   │   │   ├── ChaseViewer.tsx          # R3F Canvas, lights, environment
│   │   │   ├── ChaseModel.tsx           # Geometry rebuild on config changes; drag-to-move holes
│   │   │   └── DimensionOverlay.tsx     # 3D labels with arrows (A1-A4)
│   │   ├── sidebar/
│   │   │   ├── Sidebar.tsx              # Main sidebar layout + price breakdown
│   │   │   ├── DimensionField.tsx       # Length/Width/Skirt inputs with limits (order: L, W, Sk)
│   │   │   ├── CollarGroup.tsx          # Per-hole controls (shape, dia/rect, height, offsets)
│   │   │   ├── HoleSelector.tsx         # 0-3 hole selection buttons
│   │   │   ├── GaugeSelect.tsx          # Gauge dropdown
│   │   │   ├── MaterialChips.tsx        # Galvanized / Copper toggle
│   │   │   ├── ToggleRow.tsx            # Toggle switches (drip, diag, pc)
│   │   │   ├── PowderCoatSection.tsx    # Color picker + RAL trigger
│   │   │   ├── PriceDisplay.tsx         # Estimated price display
│   │   │   ├── CartRow.tsx              # Quantity + Add to Cart + Download PDF
│   │   │   ├── NotesField.tsx           # Special notes textarea (200-word limit)
│   │   │   └── InfoTooltip.tsx          # ⓘ hover tooltip component
│   │   ├── pdf/
│   │   │   └── PdfReport.tsx            # Hidden PDF report template (rendered off-screen)
│   │   ├── ral/RalModal.tsx             # RAL color palette modal
│   │   └── ar/                          # AR-related components
│   ├── styles/
│   │   ├── globals.css                  # All CSS (standalone mode + source for Shopify sync)
│   │   └── globals-scoped.css           # Scoped CSS injected into Shadow DOM (auto-synced from globals.css)
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
| `SHOPIFY_ACCESS_TOKEN` | Static Shopify Admin API token (`shpat_...`) — **preferred method** | `shpat_abc123...` |
| `SHOPIFY_CLIENT_ID` | Shopify App Client ID (fallback OAuth only — see caveats) | `18e8d5...` |
| `SHOPIFY_CLIENT_SECRET` | Shopify App Client Secret (fallback OAuth only — see caveats) | `shpss_e7...` |

**Auth priority** (in `api/create-order.ts`):
1. If `SHOPIFY_ACCESS_TOKEN` is set → use it directly (**always use this for client stores**)
2. Otherwise → try `client_credentials` OAuth grant using `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET`

> ⚠️ **IMPORTANT — Shopify OAuth Caveat**: The `client_credentials` grant (`SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET`) **only works when the app and the store are in the same Shopify organization**. If the app was created via the Partners Dashboard in the partner's org and installed on a client's store (different org), Shopify will return `shop_not_permitted`. **Always use `SHOPIFY_ACCESS_TOKEN` (Option A) for client store deployments**. Create the app directly in the client's store Admin > Settings > Apps > Develop apps.

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

Runs `npm run build && npm run build:shopify && node -e "...copy IIFE to dist/..."`. This produces:
- `dist/index.html` + assets — standalone SPA (accessible at the Vercel URL root)
- `dist/chase-cover-configurator.iife.js` — the IIFE bundle loaded by Shopify
- `dist/chase-configurator.iife.js` — legacy filename alias (also copied for backwards compat)
- `api/*.ts` — Vercel serverless functions (auto-detected)

### CSS Sync (`sync:shopify-css`)

Before the Shopify IIFE build, `scripts/sync-shopify-css.mjs` copies `globals.css` → `globals-scoped.css` so both builds stay in sync. **Never edit `globals-scoped.css` directly** — edit `globals.css` and let the sync handle it.

### `vercel.json`

- `buildCommand`: `npm run build:vercel`
- `outputDirectory`: `dist`
- CORS headers on `/api/*` and both IIFE filenames (Access-Control-Allow-Origin: *)
- Cache-Control on IIFE: `public, max-age=60, s-maxage=300`

### Manual Deploy

If Vercel's GitHub integration doesn't auto-trigger (e.g., due to permissions), deploy manually:
```bash
npx vercel --prod
```

---

## Shopify Integration (Summary)

See `SHOPIFY-INTEGRATION-GUIDE.md` for full step-by-step setup.

### How It Works

1. **Shopify product page** loads `<script src="https://chase-cover-configurator.vercel.app/chase-cover-configurator.iife.js">`
2. The IIFE (`shopify-entry.tsx`) attaches a **Shadow DOM** to `<chase-cover-configurator>` for CSS isolation
3. On load, it calls `GET /api/pricing` to fetch pricing constants from Google Sheets
4. User configures the chase cover; price updates in real-time
5. "Add to Cart" calls `POST /api/create-order` which:
   - Re-fetches pricing from Google Sheets (tamper-proof)
   - Recalculates price server-side
   - Creates a Shopify **Draft Order** via Admin API (API version `2025-10`)
   - Returns the `invoice_url` (Shopify checkout link)
6. Customer is redirected to Shopify's native checkout
7. If user presses **back** from checkout, their configuration is automatically restored

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

The IIFE detects its own origin by scanning `<script>` tags for one containing `chase-cover-configurator` or `chase-configurator` in the `src`. The origin of that script URL becomes the API base (`window.__chaseApiBase`), so API calls always go back to the Vercel deployment regardless of which Shopify domain hosts the page.

---

## Serverless API Functions (Vercel)

### `GET /api/pricing`

- Fetches pricing constants from Google Sheets (`Sheet1!A1:B20`)
- In-memory cache with 5-minute TTL
- Returns JSON: `{ AREA_RATE, LINEAR_RATE, BASE_FIXED, HOLE_PRICE, POWDER_COAT, SKIRT_SURCHARGE, SKIRT_THRESHOLD, GAUGE_MULT, MATERIAL_MULT, STORM_COLLAR_PRICES }`
- Cache-Control: `public, max-age=60, s-maxage=300`

### `POST /api/create-order`

- Receives full configuration as JSON body (including optional `image` base64 data URL)
- Authenticates with Shopify (static token preferred — see auth caveat above)
- Fetches pricing from Google Sheets server-side (tamper-proof)
- Computes price server-side
- Optionally uploads a 3D viewer screenshot to Shopify Files (requires `write_files` scope on the app)
- Creates a Shopify Draft Order with:
  - **Combined** line item properties: `Dimensions`, `Material & Gauge`, `Options`, `Powder Coat`, `Holes`, per-hole detail lines
  - Hidden `_config_json` property with full JSON config for reproduction
  - Hidden `_preview_image` property with Shopify-hosted image URL (if image upload succeeded)
  - Order note with human-readable description + preview URL
- Returns `{ checkout_url }` (the Draft Order invoice URL)

#### Line Item Properties Format (Shopify cart/checkout)

```
Dimensions:        60" L × 48" W × 3" Skirt
Material & Gauge:  Galvanized — 24ga
Options:           Drip Edge: Yes · Diagonal Crease: Yes
Powder Coat:       Ruby Red (#940604)          ← only if pc enabled and mat != copper
Holes:             2
H1 (Left):         Round ⌀10" — Collar 3" tall
H1 Position:       Centered on cover
H2 (Right):        Rectangle 8" × 8" — Collar 2" tall
H2 Offsets:        Top: 5" · Right: 8" · Bottom: 5" · Left: 8"
Special Notes:     …
_config_json:      { full JSON… }              ← hidden (prefixed with _)
_preview_image:    https://cdn.shopify.com/…  ← hidden (prefixed with _)
```

#### Cart Image Upload

The `POST /api/create-order` handler receives a `base64` PNG of the 3D viewer and uploads it to Shopify using:
1. `stagedUploadsCreate` GraphQL mutation → gets a temporary upload URL
2. HTTP `PUT` to the staged URL with the binary image
3. `fileCreate` GraphQL mutation → creates a permanent Shopify CDN file

**Requirement**: The Shopify app must have the `write_files` scope enabled. Without it, the upload fails silently (order is still created — image is just omitted).

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
| 17+ | STORM_COLLAR_* | varies |

Changes take effect within **5 minutes** (server cache TTL). No code changes or redeployment needed.

---

## Pricing Formula

**Files**: `config/pricing.ts` + `store/configStore.ts` + `api/create-order.ts`

```
base = AREA_RATE * W * L + LINEAR_RATE * (W + L) + BASE_FIXED
subtotal = base + holes * HOLE_PRICE + skirtSurcharge + powderCoat + stormCollarCosts
total = subtotal * GAUGE_MULT[gauge] * MATERIAL_MULT[material]
```

| Constant | Default Value |
|----------|---------------|
| AREA_RATE | $0.025/sq in |
| LINEAR_RATE | $0.445/in |
| BASE_FIXED | $178.03 |
| HOLE_PRICE | $25/hole |
| POWDER_COAT | $45 (only applied when `mat !== 'copper'`) |
| SKIRT_SURCHARGE | $75 (if skirt >= 6") |
| SKIRT_THRESHOLD | 6" |

**Gauge multipliers**: 24ga=1.0, 20ga=1.3, 18ga=1.4, 16ga=1.6, 14ga=1.8, 12ga=2.7, 10ga=3.4

**Material multipliers**: Galvanized=1.0, Copper=3.0

**Powder coat**: Charged only when `pc === true && mat !== 'copper'`. When copper is selected, powder coat state is preserved in the store but the charge and color swatch are not applied.

### Pricing Formula Derivation

The base formula constants (AREA_RATE, LINEAR_RATE, BASE_FIXED) were derived from the **Lifetime Chimney Supply** printed price list for 24ga galvanized steel (base case, no multipliers). The price list is a table with rows and columns from 16" to 58" in 2" increments.

**Derivation method** — the marginal cost of increasing one dimension by 1 inch is:

```
d(price)/dL = AREA_RATE * W + LINEAR_RATE
```

From the price table:
- Row 16, per-2" increment ≈ $1.69 → per inch: 16 × AREA_RATE + LINEAR_RATE = 0.845
- Row 18, per-2" increment ≈ $1.80 → per inch: 18 × AREA_RATE + LINEAR_RATE = 0.895

Solving: AREA_RATE = 0.025, LINEAR_RATE = 0.445, then BASE_FIXED = 198.67 - 0.025×256 - 0.445×32 = 178.03.

**Accuracy**: The formula matches the printed price list exactly at small sizes (16"–22" range). At larger sizes (40"+), there may be a small drift of a few dollars due to a possible quadratic per-dimension term in the original price table. This is under investigation — if confirmed, a `QUAD_RATE` constant will be added to the Google Sheet and code.

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
| Length | 16 (dynamic) | 120 | 60 | inches | 1/8" |
| Width | 16 (dynamic) | 60 | 48 | inches | 1/8" |
| Skirt | 1 | 12 | 3 | inches | 1/8" |

Note: The sidebar shows **Length first, then Width** (this order was intentional UX — matches typical how-to-measure instructions).

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
Each hole has: shape (round/rect), diameter or rect dimensions (3-30"), collar height (1-52"), centered flag, 4 offsets, storm collar toggle.

### Hole Shapes
- **Round**: Defined by `dia` (diameter in inches). Shown as `⌀10"` in UI and order.
- **Rectangle**: Defined by `rectWidth` × `rectLength`. Shown as `8" × 8" rect` in UI and order.

### Centered Mode
When centered, holes auto-position along the Z axis (length direction):
- **1 hole**: center of cover (0, 0)
- **2 holes**: spaced at +/-L/4 from center (or further if diameters require it)
- **3 holes**: A at +L/3, B at center (0), C at -L/3 (adjusted for diameter)

**Overlap prevention**: Centered holes enforce a minimum gap of 1" between hole edges:
```
spacing = max(defaultSpacing, radiusA + radiusB + 1")
```

**Centered → Manual toggle (no drift)**: When unchecking "Centered on Cover", the current world position is precisely converted to offsets with no rounding, preventing any visible position change.

### Manual Offset Mode
When "Centered on Cover" is unchecked, user controls 4 offsets:

| Label | Offset Key | Meaning |
|-------|-----------|---------|
| X1 (Top) | offset3 | Distance from top edge to hole edge |
| X2 (Right) | offset4 | Distance from right edge to hole edge |
| X3 (Bottom) | offset1 | Distance from bottom edge to hole edge |
| X4 (Left) | offset2 | Distance from left edge to hole edge |

**Collision detection** (`CollarGroup.tsx:clampForCollision`):
When editing offsets, the system checks distance to all other holes and ensures `dist >= r1 + r2 + 1"`. If violated, the proposed offset is pushed back to maintain the gap.

**Offset constraints**: Each offset is clamped to `[0, coverDim - holeDia]`.

### Drag-to-Move Holes (3D Viewport)

When holes > 0, a **"Move Holes"** button appears in the viewport toolbar. Clicking it enters move mode:
- Each hole shows an orange ring handle at the top of its collar
- Dragging the handle repositions the hole in real-time using raycasting against a horizontal plane
- Orbit is disabled while dragging
- Collision detection prevents holes from overlapping during drag
- If the final position is invalid (still overlapping after all clamping), the hole reverts to its start position

---

## Dim-Overlay (Top-Right Info Box)

Collapsed state: ruler icon button (SVG, grey, no background). Clicking opens the overlay.

Expanded state shows:
```
48" W x 60" L x 3" Skirt
H1: ⌀10" (on center)
H1: ⌀10" [A1: 5" A2: 8" A3: 5" A4: 8"]
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
   - **Flat** (diag off): `ExtrudeGeometry` rectangle with circular/rectangular holes via `Shape.holes`
   - **Sloped** (diag on): 60x60 tessellated grid. Height at each point: `edgeY + SLOPE * (1 - max(|px|, |pz|))` where px/pz are normalized coords (Chebyshev distance). Vertices near diagonals snap to create sharp crease lines. Triangle edges align along diagonals for visible ridges. SLOPE = `sqrt(W^2 + L^2) * 0.035`.

2. **Skirt**: 4 `BoxGeometry` panels around the perimeter, height = skirt value.

3. **Drip Edge**: 4 beveled strips (0.5" out, 0.5" down at 45deg) as custom `BufferGeometry` quads.

4. **Collars**: Custom `BufferGeometry` cylinders (48 segments) for round holes; rectangular collar geometry for rect holes. Bottom vertices follow `getRoofY()` for smooth intersection with sloped roof. Top ring cap via `RingGeometry`.

5. **Storm Collars**: Optional cylindrical flashing rings rendered above the collar opening. Price varies by hole diameter (looked up from Google Sheet `STORM_COLLAR_*` rows).

6. **Bottom face** (sloped mode only): Flat `ExtrudeGeometry` with hole cutouts at skirt height.

### Hole Cutouts on Sloped Roof
Grid vertices near hole boundaries snap to the hole radius/rect boundary. Triangles inside holes or entirely on the hole boundary are culled. No CSG library needed for lid cutouts (though three-csg-ts is available for other operations).

---

## AR System (`ar.ts`)

### Export
`exportToGLB(group)`: Clones the scene group, scales to real-world meters (0.0254/SC), strips environment maps, exports as base64 GLB via `GLTFExporter`.

### Serialization
`getConfigState(config)`: Serializes config to base64 JSON for URL hash. Includes dimensions, toggles, and per-hole collar settings.

`applyConfigState(base64)`: Restores config from URL hash on page load (mobile AR flow).

### Flow (Desktop)
1. Clicking "View in AR" generates a QR code with the current config serialized in the URL hash
2. The URL uses the page's canonical `<link>` if available (avoids Shopify preview paths that 404)
3. Mobile user scans QR → page loads with `#ar=` hash → config restored → AR prompt shown

### Flow (Mobile)
- On mobile (`window.innerWidth <= 767` or `Mobi|Android|iPhone` UA), clicking the AR icon in the bottom-left launches AR directly (bypasses QR code)
- `<model-viewer>` is loaded dynamically on first AR trigger
- GLB exported from scene → passed to `<model-viewer>` for WebXR/Scene Viewer

### model-viewer
The `<model-viewer>` element is portaled to light DOM on Shopify (via `#chase-cover-configurator-portal`) because AR requires light DOM to work through Shadow DOM.

---

## Materials

Material rendering is handled by `mkMat()` in `geometry.ts`. Priority order:

1. **Copper** (`mat === 'copper'`): Always renders copper color, regardless of powder coat state — `color=#e09a72, metalness=0.85, roughness=0.15`
2. **Powder Coat** (`mat === 'galvanized' && pc === true`): User-selected color — `metalness=0.3, roughness=0.6`
3. **Galvanized** (default): `color=#b8c4cc, metalness=0.9, roughness=0.25`

**Powder coat + copper behavior**: When switching to copper, the `pc` boolean is preserved in state but copper color is always shown. When switching back to galvanized, if `pc` was true before, the powder coat color is automatically shown again. The powder coat section is hidden in the sidebar while copper is selected.

---

## State Management (Zustand)

Single store `useConfigStore` with flat state. Mutation methods:
- `set(partial)`: Updates any top-level config and recomputes price
- `setCollar(id, partial)`: Updates a specific collar (A/B/C) and recomputes price
- `setOrbitEnabled(v)`: Enables/disables orbit controls (disabled during hole dragging)

Defaults: W=48, L=60, Skirt=3, 1 hole, 10" dia, 2" collar height, centered, galvanized, 24ga, drip on, diagonal crease on.

On startup, `loadPricingFromAPI()` fetches remote pricing. When it resolves, `onPricingLoaded()` triggers a price recompute in the store so the displayed price reflects the latest Google Sheet values.

### Session Config Restore (Back-from-Cart)

**No Zustand `persist` middleware is used.** Config is stored in `sessionStorage` only when the user clicks "Add to Cart" and is about to be redirected:

```
saveConfigForRestore()   → saves config to sessionStorage key 'chase-cover-restore'
window.location.href = checkout_url
```

On page mount, `restoreConfigIfNeeded()` is called:
- If the key exists → restore the config and **immediately delete the key**
- If the key doesn't exist → load defaults

**Result**:
- Manual page refresh → defaults (key was never set or was already cleared)
- Back from cart/checkout → config restored (key was set before redirect)
- Refresh after back → defaults (key was cleared on first restore)

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
  1. Patches iOS viewport (prevents zoom on input focus)
  2. Injects Google Fonts + QRious into document head
  3. Finds `<chase-cover-configurator>`, `<chase-configurator>`, `#chase-cover-configurator-mount`, or `#chase-configurator-mount`
  4. Attaches Shadow DOM with `globals-scoped.css` injected as `<style>`
  5. Creates a light-DOM portal container for AR/QR overlays with portal-scoped CSS in `<head>`
  6. Detects API base URL from the script's own `src` attribute
  7. Reads `product-id` and `variant-id` attributes from the mount element
  8. Calls `loadPricingFromAPI(apiBase)` and renders `<App>` into shadow root

### Legacy Web Component (`web-component.tsx`)
- Not used in current production flow
- Defines a `<chase-cover-configurator>` custom element with Shadow DOM

---

## UI Breakpoints & Responsive Behavior

| Breakpoint | Behavior |
|-----------|---------|
| > 767px | Desktop layout: side-by-side 3D viewer + sidebar |
| ≤ 767px | Mobile layout: stacked viewer (top) + sidebar (bottom), draggable divider |

- **iPad** (768px+) intentionally gets the **desktop layout** (sidebar always visible)
- Mobile: viewer height defaults to 40% of screen, adjustable by dragging the divider handle
- Mobile: AR button is a round icon (bottom-left of viewport), not text

---

## Key Decisions & History

- **Shopify auth**: `client_credentials` fails when app org ≠ store org. Use static `SHOPIFY_ACCESS_TOKEN` from a **Store Admin custom app** (created in the client store's Admin > Settings > Apps > Develop apps).
- **CSS isolation**: Shadow DOM used for Shopify embedding. `globals-scoped.css` is auto-synced from `globals.css` via a pre-build script — only ever edit `globals.css`.
- **Hole position drift fix**: Unchecking "Centered on Cover" previously caused slight position drift due to 1/8" rounding. Fixed by removing rounding in the centered→offset conversion.
- **Copper + powder coat**: Copper material always renders copper color. The `pc` boolean state is preserved so switching back to galvanized re-applies the powder coat color.
- **Session persistence**: Zustand `persist` middleware was removed. Config is now saved to `sessionStorage` only immediately before cart redirect, and cleared immediately after restoration. This gives "back from cart restores config" without "refresh loads last session".
- **Cart image**: 3D canvas is captured as base64 PNG and uploaded to Shopify Files via `stagedUploadsCreate` + `fileCreate` GraphQL. Requires `write_files` scope on the Shopify app. Fails silently — order is always created even if image upload fails.
