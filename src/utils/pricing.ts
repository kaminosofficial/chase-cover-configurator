export interface PricingLike {
  MARGIN_RATE: number;
  HOLE_PRICE: number;
  SKIRT_SURCHARGE: number;
  SKIRT_THRESHOLD: number;
  PAINTED_MULTIPLIER: number;
  GAUGE_MULT: Record<number, number>;
  MATERIAL_MULT: Record<string, number>;
}

export interface PricingInputLike {
  w: number;
  l: number;
  sk: number;
  holes: number;
  gauge: number;
  mat: string;
  pc: boolean;
}

export interface PricingBreakdown {
  /** Raw panel geometry before material, paint, or gauge: L + W + 4×skirt (in-range sizes). */
  baseGeometry: number;
  basePrice: number;
  holesCost: number;
  skirtCost: number;
  stormCollarCost: number;
  extrasTotal: number;
  materialFactor: number;
  paintedMultiplier: number;
  baseAfterMaterialPaint: number;
  gaugeFactor: number;
  baseAfterGauge: number;
  subtotalBeforeMargin: number;
  marginRate: number;
  marginMultiplier: number;
  marginAmount: number;
  total: number;
}

export const DEFAULT_GAUGE_MULT: Record<number, number> = {
  24: 3.39,
  22: 4,
  20: 4.8,
};

export const DEFAULT_MATERIAL_MULT: Record<string, number> = {
  galvanized: 1.0,
  stainless: 1.0,
  copper: 3.0,
};

export function normalizePaintedMultiplier(value: number): number {
  if (!Number.isFinite(value)) return 1.5;
  if (value > 2) return 1 + value / 100;
  return value;
}

export function normalizeMarginRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 10) return value / 100;
  return value;
}

/**
 * Panel base price from cover dimensions (inches). Single linear formula
 * across the entire UI-valid range (L ≤ 120, W ≤ 60, skirt ≤ 12):
 *
 *   base = L + W + 4×skirt   — e.g. defaults 60 + 48 + 12 = $120.
 */
export function computeBasePanelPrice(w: number, l: number, sk: number): number {
  if (!Number.isFinite(w) || !Number.isFinite(l) || w <= 0 || l <= 0) return 0;
  const skirt = Number.isFinite(sk) ? Math.max(0, sk) : 0;
  return l + w + 4 * skirt;
}

export function computePricingBreakdown(
  config: PricingInputLike,
  pricing: PricingLike,
  stormCollarCost = 0
): PricingBreakdown {
  const holesCost = Math.max(0, config.holes || 0) * pricing.HOLE_PRICE;
  const skirt = Number.isFinite(config.sk) ? Math.max(0, config.sk) : 0;
  const skirtCost = skirt >= pricing.SKIRT_THRESHOLD ? pricing.SKIRT_SURCHARGE : 0;
  const extrasTotal = holesCost + skirtCost + stormCollarCost;
  const baseGeometry = computeBasePanelPrice(config.w, config.l, skirt);
  const basePrice = baseGeometry;
  const gaugeFactor = pricing.GAUGE_MULT[config.gauge] || 1;
  const baseAfterGauge = basePrice * gaugeFactor;
  const materialFactor = pricing.MATERIAL_MULT[config.mat] || 1;
  const paintedMultiplier = (config.pc && config.mat !== 'copper') ? pricing.PAINTED_MULTIPLIER : 1;
  const baseAfterMaterialPaint = baseAfterGauge * materialFactor * paintedMultiplier;
  const subtotalBeforeMargin = baseAfterMaterialPaint + extrasTotal;
  const marginRate = normalizeMarginRate(pricing.MARGIN_RATE);
  const marginMultiplier = 1 + marginRate;
  const marginAmount = subtotalBeforeMargin * marginRate;
  const total = subtotalBeforeMargin * marginMultiplier;

  return {
    baseGeometry,
    basePrice,
    holesCost,
    skirtCost,
    stormCollarCost,
    extrasTotal,
    materialFactor,
    paintedMultiplier,
    baseAfterMaterialPaint,
    gaugeFactor,
    baseAfterGauge,
    subtotalBeforeMargin,
    marginRate,
    marginMultiplier,
    marginAmount,
    total,
  };
}

export function computeConfiguredPrice(
  config: PricingInputLike,
  pricing: PricingLike,
  stormCollarCost = 0
): number {
  return computePricingBreakdown(config, pricing, stormCollarCost).total;
}
