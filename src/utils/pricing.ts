export interface PricingLike {
  EXT_ANCHOR: number;
  EXT_S_W: number;
  EXT_S_L: number;
  EXT_S_AREA: number;
  MARGIN_RATE: number;
  HOLE_PRICE: number;
  SKIRT_SURCHARGE: number;
  SKIRT_THRESHOLD: number;
  PAINTED_MULTIPLIER: number;
  GAUGE_MULT: Record<number, number>;
  MATERIAL_MULT: Record<string, number>;
  MODEL_COEFFICIENTS: Record<string, number>;
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

export const DEFAULT_MODEL_COEFFICIENTS: Record<string, number> = {
  bias: 182.0890489917,
  area: 0.0318723134,
  perim: 0.1369965570,
  D: 0.1036000360,
  m: 0.0333965210,
  W: 0.0656462319,
  L: 0.0713503251,
  wingpos: -0.4452748191,
  whigh: 13.2853202528,
  b2: 6.3069706208,
  area_b2: -0.0039675400,
  perim_b2: 0.0856807640,
  D_b2: 0.0080467890,
  m_b2: 0.0776339750,
  W_b2: 0.0457194643,
  L_b2: 0.0399612998,
  wingpos_b2: 0.0,
  whigh_b2: -13.2864079933,
  b3: 0.0016241299,
  area_b3: -0.0015856263,
  perim_b3: 0.0876736534,
  D_b3: 0.0877030168,
  m_b3: -0.0000293635,
  W_b3: -0.0000293635,
  L_b3: 0.0877030168,
  wingpos_b3: 0.0032482599,
  whigh_b3: -13.2177378352,
  b4a: 0.0054606302,
  area_b4a: -0.0010569625,
  perim_b4a: 0.2362901679,
  D_b4a: 0.2250368930,
  m_b4a: 0.0112532749,
  W_b4a: 0.0112532749,
  L_b4a: 0.2250368930,
  wingpos_b4a: -0.0589158775,
  whigh_b4a: -13.2853477253,
  b4b: 0.0054496755,
  area_b4b: -0.0010639801,
  perim_b4b: 0.2364314296,
  D_b4b: 0.2248706840,
  m_b4b: 0.0115607456,
  W_b4b: 0.0115607456,
  L_b4b: 0.2248706840,
  wingpos_b4b: -0.0585124405,
  whigh_b4b: -13.2872982748,
  b5a: 0.0067248312,
  area_b5a: 0.0047864585,
  perim_b5a: 0.2887895888,
  D_b5a: 0.2596192011,
  m_b5a: 0.0291703878,
  W_b5a: 0.0291703878,
  L_b5a: 0.2596192011,
  wingpos_b5a: -0.0900720198,
  whigh_b5a: -13.2884850880,
  b5b: 0.0066716629,
  area_b5b: 0.0047453558,
  perim_b5b: 0.2893939816,
  D_b5b: 0.2589883006,
  m_b5b: 0.0304056809,
  W_b5b: 0.0304056809,
  L_b5b: 0.2589883006,
  wingpos_b5b: -0.0879381705,
  whigh_b5b: -13.2849600574,
  b6a: 0.0024888303,
  area_b6a: 0.0059039372,
  perim_b6a: 0.2389892036,
  D_b6a: 0.2389277043,
  m_b6a: 0.0000614993,
  W_b6a: 0.0000614993,
  L_b6a: 0.2389277043,
  wingpos_b6a: 0.1095085311,
  whigh_b6a: -13.2840252787,
  b6b: 0.0111706794,
  area_b6b: 0.0069478620,
  perim_b6b: 0.2549968956,
  D_b6b: 0.3182822290,
  m_b6b: -0.0632853333,
  W_b6b: -0.0632853333,
  L_b6b: 0.3182822290,
  wingpos_b6b: -0.2625931017,
  whigh_b6b: -13.2407231832,
  W_b1: 0.0007898759,
  bug_W46_L36: -49.9511870042,
  bug_W46_L38: -49.8969266443,
  bug_W30_L96: -4.9919550609,
  bug_W52_L32: 1.3386118958,
};

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
 * Panel base price from cover dimensions (inches).
 * In-range (W≤52, L≤100): L + W + 4×skirt — e.g. default 60+48+12 = $120.
 * User wording L×(2×skirt)+W×(2×skirt) is read as both long sides (2×skirt each) added to L+W, not 2×skirt×(L+W).
 * Oversized: sheet EXT_* anchor + width/length/area surcharges (regression coefficients unused).
 */
export function computeBasePanelPrice(
  w: number,
  l: number,
  sk: number,
  pricing: PricingLike
): number {
  if (!Number.isFinite(w) || !Number.isFinite(l) || w <= 0 || l <= 0) return 0;
  const skirt = Number.isFinite(sk) ? Math.max(0, sk) : 0;

  if (w <= 52 && l <= 100) {
    return l + w + 4 * skirt;
  }

  const extraWidth = Math.max(0, w - 52);
  const extraLength = Math.max(0, l - 100);
  return pricing.EXT_ANCHOR
    + pricing.EXT_S_W * extraWidth
    + pricing.EXT_S_L * extraLength
    + pricing.EXT_S_AREA * extraWidth * extraLength;
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
  const baseGeometry = computeBasePanelPrice(config.w, config.l, skirt, pricing);
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
