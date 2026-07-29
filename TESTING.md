# Testing & CI harness

What automated checking exists, why it's deliberately small, and **how to
replicate it on the chimney cap configurator** (see the porting checklist at the
bottom — that section is written to be handed straight to Claude Code in the
other repo).

---

## What runs

| Command | What it does | Runs in CI? |
|---|---|---|
| `npm test` | Vitest unit tests, one pass | ✅ yes |
| `npm run test:watch` | Vitest in watch mode (local dev) | no |
| `npm run build:vercel` | `tsc -b` full type-check + both production bundles | ✅ yes |
| `npm run lint` | ESLint | ❌ **no — see below** |

CI is [`.github/workflows/ci.yml`](.github/workflows/ci.yml). It runs on every
pull request and every push to `main`, and it is a **check only — it deploys
nothing**. Green = tests pass, it type-checks, and it bundles.

---

## What is tested, and why only this

Two files, both pure-function maths. No DOM, no network, no Shopify, no mocks.

### `src/utils/pricing.test.ts` — the money

`computePricingBreakdown()` runs in **two places that must agree**:

- the client price display (`src/store/configStore.ts`)
- server-side variant creation (`api/add-to-cart.ts`)

If those diverge, a customer is charged something different from what they were
shown. The tests pin the formula's **shape**, deliberately *not* the Google
Sheet's numbers — sheet values are meant to change without a code deploy, so
asserting them would produce false failures.

Business rules locked down:

- extras (holes, skirt surcharge, storm collars) are added **after** the gauge
  and material multipliers, never multiplied by them
- the skirt surcharge triggers at `>=` the threshold, not `>`
- powder coat is **not** charged on copper, even though the store deliberately
  keeps `pc: true` so the colour returns when switching back to galvanized
- unknown gauge/material keys fall back to `1x` rather than producing `NaN`
- `normalizeMarginRate` treats a value over 10 as a percentage, clamps negatives
  to zero, so margin can never *reduce* a price

### `src/utils/geometry.test.ts` — the drawings

`holeWorld()` is the single source of truth for where a flue hole sits. It feeds
the 3D model, drag-to-move, the PDF spec sheet, **and the live 2D profile
drawings**. The 2D drawing code inverts this exact mapping to derive the
TE/BE/LE/RE dimensions, so if the coordinate convention shifts, the drawing
quietly shows the customer a different hole position than the one fabricated.

Locked down: the inches ↔ `SC` world-unit convention, centered placement for
1/2/3 holes, the manual-offset conversion, clamping holes inside the cover, the
rect `rectWidth→X` / `rectLength→Z` axis mapping, and the 1″ minimum gap.

### What is deliberately NOT tested

**The cart flow.** It's ~3000 lines of network and DOM orchestration against a
live Shopify storefront with real propagation timing. E2E there would be flaky,
slow, and would still miss the failures that actually occur in production —
which have been client-side connection drops and Shopify propagation lag, not
logic bugs. The real safety net for the cart is the branch preview plus manual
testing on a real phone, per [SHIPPING.md](SHIPPING.md).

Same reasoning excludes React component tests and visual regression: high
maintenance, low signal, for a UI that a human reviews on a preview link anyway.

---

## Why ESLint is not in CI

`npm run lint` currently reports ~205 problems (~195 errors) in real source,
overwhelmingly `@typescript-eslint/no-explicit-any` in places where `any` is
genuinely needed (three.js internals, `<model-viewer>`, dynamic Shopify globals).

Adding it as a blocking step would make CI permanently red, which trains you to
ignore red CI — strictly worse than not running it. Revisit only if someone
takes on the `no-explicit-any` cleanup or relaxes that rule to a warning.

The ESLint config **does** now ignore `dist`, `dist-shopify`, `.claude` and
`scratch`. `.claude/worktrees/` holds full throwaway copies of the repo, and
linting those was inflating the report from ~205 to ~375.

---

## Removed: `deploy.yml`

A `Deploy to GitHub Pages` workflow used to run on every push to `main`. It had
**failed on every run for months** (GitHub Pages was never enabled on the repo —
the API returns 404), so every merge painted a red ✗ for a deploy target nobody
uses. Production deploys go through Vercel, not Pages. Deleted.

---

## Adding a test later

Put it next to the code as `<name>.test.ts`. Only add tests for **pure
functions** — given inputs, returns outputs, no side effects. If a function
needs a browser, network, or Shopify to run, it belongs in manual preview
testing instead.

**Prove a new test can fail.** A test that passes no matter what is worse than
no test. Temporarily break the function it covers, confirm the test goes red,
then restore. Every test in these two files was verified this way.

---

## Porting checklist — chimney cap configurator

The cap repo shares the pricing module and cart architecture, so this transfers
almost directly. Steps:

1. `npm install -D vitest@^3`
2. Add to `package.json` scripts:
   ```json
   "test": "vitest run",
   "test:watch": "vitest"
   ```
3. Copy `src/utils/pricing.test.ts` across. **Check the cap's
   `PricingLike` field names and its `computePricingBreakdown` signature first** —
   if the cap's formula differs (different extras, no storm collars), adjust the
   worked example and drop assertions that don't apply. Keep the `TEST_PRICING`
   fixture approach: round numbers, not the live sheet values.
4. Copy `src/utils/geometry.test.ts` **only if the cap has an equivalent
   `holeWorld()`**. The cap has different geometry and no drag-to-move, so this
   one may need real rewriting rather than copying — treat it as a template, not
   a drop-in.
5. Add the `Unit tests` step to the cap's `.github/workflows/ci.yml`, before the
   build step.
6. Add `dist-shopify`, `.claude`, `scratch` to `globalIgnores` in
   `eslint.config.js`.
7. Check for a dead `deploy.yml` (`gh run list --workflow=deploy.yml`) and delete
   it if it's failing against a target that isn't used.
8. Run `npm test` and `npm run build` to confirm both pass, then mutation-test:
   break the pricing formula on purpose, confirm red, restore.

Do **not** port: any attempt to test the cart flow, and do not add lint to CI
without checking the cap's own error count first.
