import { describe, it, expect } from 'vitest';
import {
  computeBasePanelPrice,
  computePricingBreakdown,
  computeConfiguredPrice,
  normalizeMarginRate,
  normalizePaintedMultiplier,
  type PricingLike,
  type PricingInputLike,
} from './pricing';

/**
 * Golden tests for the shared pricing formula.
 *
 * WHY THIS FILE EXISTS: computePricingBreakdown() runs in TWO places that must
 * agree — the client price display (store/configStore.ts) and the server-side
 * variant creation (api/add-to-cart.ts). If they ever diverge, customers get
 * charged an amount different from what they were shown. These tests pin the
 * formula's SHAPE, not the Google Sheet's values (those are meant to change
 * without a code deploy), so a refactor cannot silently move money.
 */

/** Deliberately round numbers so the expected arithmetic is readable by hand. */
const TEST_PRICING: PricingLike = {
  MARGIN_RATE: 0.5,          // +50%
  HOLE_PRICE: 25,
  SKIRT_SURCHARGE: 75,
  SKIRT_THRESHOLD: 6,
  PAINTED_MULTIPLIER: 1.5,
  GAUGE_MULT: { 24: 2, 22: 3, 20: 4 },
  MATERIAL_MULT: { galvanized: 1, stainless: 1, copper: 3 },
};

const baseConfig: PricingInputLike = {
  w: 48, l: 60, sk: 3, holes: 1, gauge: 24, mat: 'galvanized', pc: false,
};

describe('computeBasePanelPrice', () => {
  it('is L + W + 4x skirt', () => {
    expect(computeBasePanelPrice(48, 60, 3)).toBe(120);
  });

  it('treats a negative skirt as zero rather than crediting the customer', () => {
    expect(computeBasePanelPrice(48, 60, -5)).toBe(108);
  });

  it('returns 0 for nonsense dimensions instead of NaN', () => {
    expect(computeBasePanelPrice(0, 60, 3)).toBe(0);
    expect(computeBasePanelPrice(NaN, 60, 3)).toBe(0);
    expect(computeBasePanelPrice(48, -1, 3)).toBe(0);
  });
});

describe('computePricingBreakdown — worked example', () => {
  it('matches a fully hand-calculated configuration', () => {
    const b = computePricingBreakdown(baseConfig, TEST_PRICING);
    // geometry 60+48+12 = 120; gauge x2 = 240; material x1, paint x1 = 240
    // extras: 1 hole x 25 = 25; skirt 3 < 6 so no surcharge
    // subtotal 265; margin +50% -> 397.5
    expect(b.baseGeometry).toBe(120);
    expect(b.baseAfterGauge).toBe(240);
    expect(b.baseAfterMaterialPaint).toBe(240);
    expect(b.extrasTotal).toBe(25);
    expect(b.subtotalBeforeMargin).toBe(265);
    expect(b.marginAmount).toBeCloseTo(132.5, 10);
    expect(b.total).toBeCloseTo(397.5, 10);
  });

  it('computeConfiguredPrice returns the same number as breakdown.total', () => {
    expect(computeConfiguredPrice(baseConfig, TEST_PRICING))
      .toBe(computePricingBreakdown(baseConfig, TEST_PRICING).total);
  });
});

describe('extras are added AFTER the multipliers, never multiplied by them', () => {
  // This is the business rule most likely to be broken by a well-meaning
  // refactor: a hole costs a flat $25 whether the cover is 24ga or copper.
  it('hole cost does not scale with gauge', () => {
    const cheap = computePricingBreakdown({ ...baseConfig, gauge: 24 }, TEST_PRICING);
    const heavy = computePricingBreakdown({ ...baseConfig, gauge: 20 }, TEST_PRICING);
    expect(cheap.holesCost).toBe(25);
    expect(heavy.holesCost).toBe(25);
  });

  it('hole cost does not scale with material', () => {
    const galv = computePricingBreakdown({ ...baseConfig, mat: 'galvanized' }, TEST_PRICING);
    const copper = computePricingBreakdown({ ...baseConfig, mat: 'copper' }, TEST_PRICING);
    expect(galv.holesCost).toBe(copper.holesCost);
  });

  it('each hole adds exactly HOLE_PRICE', () => {
    const one = computePricingBreakdown({ ...baseConfig, holes: 1 }, TEST_PRICING);
    const three = computePricingBreakdown({ ...baseConfig, holes: 3 }, TEST_PRICING);
    expect(three.holesCost - one.holesCost).toBe(50);
  });

  it('a storm collar cost passes straight through into extras', () => {
    const b = computePricingBreakdown(baseConfig, TEST_PRICING, 40);
    expect(b.stormCollarCost).toBe(40);
    expect(b.extrasTotal).toBe(65); // 25 hole + 40 collar
  });
});

describe('skirt surcharge threshold', () => {
  it('is not charged below the threshold', () => {
    expect(computePricingBreakdown({ ...baseConfig, sk: 5.875 }, TEST_PRICING).skirtCost).toBe(0);
  });

  it('is charged AT the threshold (>=, not >)', () => {
    expect(computePricingBreakdown({ ...baseConfig, sk: 6 }, TEST_PRICING).skirtCost).toBe(75);
  });

  it('is charged above the threshold', () => {
    expect(computePricingBreakdown({ ...baseConfig, sk: 12 }, TEST_PRICING).skirtCost).toBe(75);
  });
});

describe('powder coat', () => {
  it('applies the painted multiplier on galvanized', () => {
    const plain = computePricingBreakdown({ ...baseConfig, pc: false }, TEST_PRICING);
    const painted = computePricingBreakdown({ ...baseConfig, pc: true }, TEST_PRICING);
    expect(painted.paintedMultiplier).toBe(1.5);
    expect(painted.baseAfterMaterialPaint).toBe(plain.baseAfterMaterialPaint * 1.5);
  });

  it('is NOT charged on copper even when the pc flag is true', () => {
    // The store deliberately preserves pc=true when switching to copper so the
    // colour comes back on switching to galvanized. Pricing must ignore it.
    const b = computePricingBreakdown({ ...baseConfig, mat: 'copper', pc: true }, TEST_PRICING);
    expect(b.paintedMultiplier).toBe(1);
    const unpainted = computePricingBreakdown({ ...baseConfig, mat: 'copper', pc: false }, TEST_PRICING);
    expect(b.total).toBe(unpainted.total);
  });
});

describe('unknown lookup keys fall back to 1x instead of NaN', () => {
  it('unknown gauge', () => {
    expect(computePricingBreakdown({ ...baseConfig, gauge: 99 }, TEST_PRICING).gaugeFactor).toBe(1);
  });

  it('unknown material', () => {
    expect(computePricingBreakdown({ ...baseConfig, mat: 'unobtanium' }, TEST_PRICING).materialFactor).toBe(1);
  });

  it('never produces NaN for a totally unknown combination', () => {
    const b = computePricingBreakdown({ ...baseConfig, gauge: 99, mat: 'unobtanium' }, TEST_PRICING);
    expect(Number.isFinite(b.total)).toBe(true);
  });
});

describe('normalizeMarginRate', () => {
  it('passes a fractional rate through unchanged', () => {
    expect(normalizeMarginRate(0.35)).toBe(0.35);
  });

  it('treats a value over 10 as a percentage', () => {
    expect(normalizeMarginRate(35)).toBe(0.35);
  });

  it('clamps negatives to zero so margin can never reduce the price', () => {
    expect(normalizeMarginRate(-1)).toBe(0);
  });

  it('returns 0 for non-finite input', () => {
    expect(normalizeMarginRate(NaN)).toBe(0);
  });
});

describe('normalizePaintedMultiplier', () => {
  it('passes a plain multiplier through', () => {
    expect(normalizePaintedMultiplier(1.5)).toBe(1.5);
  });

  it('treats a value over 2 as a percentage uplift', () => {
    expect(normalizePaintedMultiplier(50)).toBe(1.5);
  });

  it('defaults to 1.5 for non-finite input', () => {
    expect(normalizePaintedMultiplier(NaN)).toBe(1.5);
  });
});

describe('margin guard', () => {
  it('a zero margin rate leaves the subtotal untouched (never below cost)', () => {
    const b = computePricingBreakdown(baseConfig, { ...TEST_PRICING, MARGIN_RATE: 0 });
    expect(b.total).toBe(b.subtotalBeforeMargin);
  });

  it('total always equals subtotal x (1 + marginRate)', () => {
    const b = computePricingBreakdown(baseConfig, TEST_PRICING);
    expect(b.total).toBeCloseTo(b.subtotalBeforeMargin * b.marginMultiplier, 10);
    expect(b.marginMultiplier).toBe(1 + b.marginRate);
  });

  it('price rises monotonically with every size increase', () => {
    const small = computeConfiguredPrice({ ...baseConfig, w: 20, l: 20 }, TEST_PRICING);
    const mid = computeConfiguredPrice({ ...baseConfig, w: 48, l: 60 }, TEST_PRICING);
    const large = computeConfiguredPrice({ ...baseConfig, w: 60, l: 120 }, TEST_PRICING);
    expect(small).toBeLessThan(mid);
    expect(mid).toBeLessThan(large);
  });
});
