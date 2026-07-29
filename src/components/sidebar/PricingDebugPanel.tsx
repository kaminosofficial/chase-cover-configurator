import { useState } from 'react';
import { useConfigStore } from '../../store/configStore';
import { PRICING, getStormCollarPrice } from '../../config/pricing';
import { computePricingBreakdown, normalizeMarginRate } from '../../utils/pricing';

/**
 * PRICING VERIFICATION PANEL — /preview route on the standalone SPA only.
 *
 * TWO independent gates keep this away from customers:
 *
 *  1. COMPILE TIME — `__PRICING_DEBUG__` (vite.config.ts `define`) is the
 *     literal `false` in the BUILD_TARGET=shopify bundle, which is the only
 *     thing the storefront loads. The panel is tree-shaken out of it entirely,
 *     on every deployment, production or preview.
 *  2. RUNTIME — even in the SPA it renders only under /preview, so the public
 *     root of the Vercel site stays clean.
 *
 * The unit tests in src/utils/pricing.test.ts verify the FORMULA using fixed
 * fixtures. They cannot verify that the values currently coming out of the
 * Google Sheet are sane — that is what this panel is for. It shows the
 * constants actually loaded, a line-by-line trace of how the displayed price
 * was reached, and five self-checks run against those live constants.
 */

/** True on the /preview route, or anywhere in local dev. */
function isPricingPreviewRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const { pathname, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  return pathname === '/preview' || pathname.startsWith('/preview/');
}

const money = (n: number) => `$${n.toFixed(2)}`;
const num = (n: number) => Number(n.toFixed(4)).toString();

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '3px 0', fontWeight: strong ? 600 : 400,
      borderTop: strong ? '1px solid rgba(18,18,18,0.15)' : undefined,
      marginTop: strong ? 4 : 0,
    }}>
      <span style={{ color: 'rgba(18,18,18,0.65)' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

export function PricingDebugPanel() {
  const [open, setOpen] = useState(false);
  const config = useConfigStore(s => s);

  // Second gate: SPA root and any other route stay clean.
  if (!isPricingPreviewRoute()) return null;

  const { w, l, sk, holes, gauge, mat, pc } = config;

  // Storm collar cost, computed the same way configStore does it.
  let stormCollarCost = 0;
  const collars = [config.collarA, config.collarB, config.collarC];
  for (let i = 0; i < holes; i++) {
    const c = collars[i];
    if (c?.stormCollar && c.shape !== 'rect') stormCollarCost += getStormCollarPrice(c.dia);
  }

  const input = { w, l, sk, holes, gauge, mat, pc };
  const b = computePricingBreakdown(input, PRICING, stormCollarCost);

  // ---- The five self-checks, run against the LIVE loaded constants ----
  const approx = (a: number, x: number) => Math.abs(a - x) < 0.0001;

  const checks: { name: string; detail: string; pass: boolean }[] = [
    (() => {
      const expected = l + w + 4 * Math.max(0, sk);
      return {
        name: 'Base geometry = L + W + 4 × skirt',
        detail: `${l} + ${w} + 4×${sk} = ${num(expected)} (got ${num(b.baseGeometry)})`,
        pass: approx(b.baseGeometry, expected),
      };
    })(),
    (() => {
      // A hole is a flat fee: it must cost the same on the lightest and heaviest gauge.
      const light = computePricingBreakdown({ ...input, gauge: 24 }, PRICING, 0);
      const heavy = computePricingBreakdown({ ...input, gauge: 20 }, PRICING, 0);
      return {
        name: 'Hole cost is flat (not multiplied by gauge)',
        detail: `24ga holes ${money(light.holesCost)} vs 20ga holes ${money(heavy.holesCost)}`,
        pass: approx(light.holesCost, heavy.holesCost),
      };
    })(),
    (() => {
      const painted = computePricingBreakdown({ ...input, mat: 'copper', pc: true }, PRICING, 0);
      const plain = computePricingBreakdown({ ...input, mat: 'copper', pc: false }, PRICING, 0);
      return {
        name: 'Powder coat is NOT charged on copper',
        detail: `copper+pc ${money(painted.total)} vs copper ${money(plain.total)}`,
        pass: approx(painted.total, plain.total),
      };
    })(),
    (() => {
      const t = PRICING.SKIRT_THRESHOLD;
      const below = computePricingBreakdown({ ...input, sk: t - 0.125 }, PRICING, 0);
      const at = computePricingBreakdown({ ...input, sk: t }, PRICING, 0);
      return {
        name: `Skirt surcharge starts AT ${t}" (not above it)`,
        detail: `${num(t - 0.125)}" → ${money(below.skirtCost)}, ${num(t)}" → ${money(at.skirtCost)}`,
        pass: approx(below.skirtCost, 0) && approx(at.skirtCost, PRICING.SKIRT_SURCHARGE),
      };
    })(),
    (() => {
      const expected = b.subtotalBeforeMargin * (1 + b.marginRate);
      return {
        name: 'Total = subtotal × (1 + margin)',
        detail: `${money(b.subtotalBeforeMargin)} × ${num(1 + b.marginRate)} = ${money(expected)}`,
        pass: approx(b.total, expected),
      };
    })(),
  ];

  const allPass = checks.every(c => c.pass);
  const rawMargin = PRICING.MARGIN_RATE;
  const marginWasPercent = normalizeMarginRate(rawMargin) !== rawMargin;

  return (
    <div style={{
      marginTop: 18, border: '1px solid rgba(18,18,18,0.12)', borderRadius: 6,
      background: '#fffdf5', fontSize: 12, lineHeight: 1.5, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, padding: '10px 12px', background: '#fdf3d6', border: 'none',
          cursor: 'pointer', font: 'inherit', fontWeight: 600, color: 'rgb(18,18,18)', textAlign: 'left',
        }}
      >
        <span>🔍 Pricing verification — preview only</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: allPass ? '#1a7f45' : '#b3261e', fontWeight: 700 }}>
            {allPass ? '5/5 OK' : `${checks.filter(c => c.pass).length}/5`}
          </span>
          <span style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }}>▾</span>
        </span>
      </button>

      {open && (
        <div style={{ padding: '12px 12px 14px' }}>
          <div style={{ color: 'rgba(18,18,18,0.55)', marginBottom: 10 }}>
            This panel is compiled out of the live site. It exists so the numbers
            can be checked against the Google Sheet before going live.
          </div>

          {/* ---- Live constants ---- */}
          <div style={{ fontWeight: 600, margin: '10px 0 4px' }}>
            1 · Constants currently loaded
            <span style={{
              fontWeight: 400, marginLeft: 6,
              color: config.pricingLoaded ? '#1a7f45' : '#b3261e',
            }}>
              {config.pricingLoaded ? '(from Google Sheet)' : '(NOT loaded — using built-in defaults)'}
            </span>
          </div>
          <Row label="MARGIN_RATE (raw)" value={`${num(rawMargin)}${marginWasPercent ? ' → read as %' : ''}`} />
          <Row label="margin applied" value={`× ${num(1 + b.marginRate)}  (+${num(b.marginRate * 100)}%)`} />
          <Row label="HOLE_PRICE" value={money(PRICING.HOLE_PRICE)} />
          <Row label="SKIRT_SURCHARGE" value={money(PRICING.SKIRT_SURCHARGE)} />
          <Row label="SKIRT_THRESHOLD" value={`${num(PRICING.SKIRT_THRESHOLD)}"`} />
          <Row label="PAINTED_MULTIPLIER" value={`× ${num(PRICING.PAINTED_MULTIPLIER)}`} />
          <Row label={`GAUGE_MULT[${gauge}]`} value={`× ${num(b.gaugeFactor)}`} />
          <Row label={`MATERIAL_MULT[${mat}]`} value={`× ${num(b.materialFactor)}`} />

          {/* ---- Formula trace ---- */}
          <div style={{ fontWeight: 600, margin: '14px 0 4px' }}>2 · How this price was reached</div>
          <Row label={`L ${num(l)} + W ${num(w)} + 4 × skirt ${num(sk)}`} value={money(b.baseGeometry)} />
          <Row label={`× gauge ${gauge}ga (${num(b.gaugeFactor)})`} value={money(b.baseAfterGauge)} />
          <Row label={`× material ${mat} (${num(b.materialFactor)}) × paint (${num(b.paintedMultiplier)})`} value={money(b.baseAfterMaterialPaint)} />
          <Row label={`+ ${holes} hole${holes === 1 ? '' : 's'} × ${money(PRICING.HOLE_PRICE)}`} value={money(b.holesCost)} />
          <Row label={`+ skirt surcharge (${num(sk)}" ${sk >= PRICING.SKIRT_THRESHOLD ? '≥' : '<'} ${num(PRICING.SKIRT_THRESHOLD)}")`} value={money(b.skirtCost)} />
          <Row label="+ storm collars" value={money(b.stormCollarCost)} />
          <Row label="subtotal before margin" value={money(b.subtotalBeforeMargin)} strong />
          <Row label={`× margin (1 + ${num(b.marginRate)})`} value={money(b.total)} strong />
          <div style={{ color: 'rgba(18,18,18,0.55)', marginTop: 6 }}>
            Extras (holes, skirt, storm collars) are added <b>after</b> the
            multipliers — a hole costs the same on 24ga as on copper.
          </div>

          {/* ---- Self checks ---- */}
          <div style={{ fontWeight: 600, margin: '14px 0 4px' }}>3 · Self-checks against these constants</div>
          {checks.map(c => (
            <div key={c.name} style={{ padding: '5px 0', borderTop: '1px dashed rgba(18,18,18,0.10)' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ color: c.pass ? '#1a7f45' : '#b3261e', fontWeight: 700 }}>
                  {c.pass ? '✓' : '✗'}
                </span>
                <span style={{ fontWeight: 500 }}>{c.name}</span>
              </div>
              <div style={{ color: 'rgba(18,18,18,0.55)', paddingLeft: 18 }}>{c.detail}</div>
            </div>
          ))}
          {!allPass && (
            <div style={{ marginTop: 8, color: '#b3261e', fontWeight: 600 }}>
              A check failed — the sheet values or the formula need looking at
              before this goes live.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
