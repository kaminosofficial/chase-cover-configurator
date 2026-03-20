import { create } from 'zustand';
import { PRICING, getStormCollarPrice, onPricingLoaded } from '../config/pricing';
import { computePricingBreakdown } from '../utils/pricing.js';

export type HoleShape = 'round' | 'rect';

export interface CollarState {
  shape: HoleShape;
  dia: number;
  rectWidth: number;
  rectLength: number;
  height: number;
  centered: boolean;
  offset1: number;
  offset2: number;
  offset3: number;
  offset4: number;
  stormCollar: boolean;
}

export interface ConfigState {
  w: number;
  l: number;
  sk: number;
  drip: boolean;
  diag: boolean;
  mat: 'galvanized' | 'stainless' | 'copper';
  gauge: 10 | 12 | 14 | 16 | 18 | 20 | 24;
  pc: boolean;
  pcCol: string;
  holes: 0 | 1 | 2 | 3;
  collarA: CollarState;
  collarB: CollarState;
  collarC: CollarState;
  showLabels: boolean;
  showLabelsA: boolean;
  showLabelsB: boolean;
  showLabelsC: boolean;
  quantity: number;
  notes: string;
  price: number;
  orbitEnabled: boolean;
  moveHolesMode: boolean;
  setOrbitEnabled: (v: boolean) => void;
  setMoveHolesMode: (v: boolean) => void;
  set: (partial: Partial<ConfigState>) => void;
  setCollar: (id: 'A' | 'B' | 'C', partial: Partial<CollarState>) => void;
}

const defaultCollar: CollarState = {
  shape: 'round',
  dia: 6, height: 2, centered: true,
  rectWidth: 6, rectLength: 6,
  offset1: 0, offset2: 0, offset3: 0, offset4: 0,
  stormCollar: false,
};

type StoreData = Omit<ConfigState, 'set' | 'setCollar' | 'setOrbitEnabled' | 'setMoveHolesMode'>;

function computePrice(s: Partial<StoreData>): number {
  const w = s.w ?? 24, l = s.l ?? 36, sk = s.sk ?? 3;
  const holes = s.holes ?? 0, pc = s.pc ?? false;
  const gauge = s.gauge ?? 24, mat = s.mat ?? 'galvanized';

  // Storm collar cost: one collar per hole where stormCollar is enabled
  let stormCollarCost = 0;
  const collars = [s.collarA, s.collarB, s.collarC];
  for (let i = 0; i < holes; i++) {
    const c = collars[i];
    if (c?.stormCollar && c.shape !== 'rect') stormCollarCost += getStormCollarPrice(c.dia);
  }

  return computePricingBreakdown({ w, l, sk, holes, gauge, pc, mat }, PRICING, stormCollarCost).total;
}

const initial: StoreData = {
  w: 48, l: 60, sk: 3,
  drip: true, diag: true,
  mat: 'galvanized', gauge: 24,
  pc: false, pcCol: '#0B0E0F',
  holes: 1,
  collarA: { ...defaultCollar, dia: 10 },
  collarB: { ...defaultCollar, dia: 10 },
  collarC: { ...defaultCollar, dia: 10 },
  showLabels: false,
  showLabelsA: false,
  showLabelsB: false,
  showLabelsC: false,
  quantity: 1, notes: '',
  price: 0,
  orbitEnabled: true,
  moveHolesMode: false,
};
initial.price = computePrice(initial);

const RESTORE_KEY = 'chase-cover-restore';

/** Save current config to sessionStorage before navigating to cart. */
export function saveConfigForRestore() {
  try {
    const s = useConfigStore.getState();
    const data = {
      w: s.w, l: s.l, sk: s.sk,
      drip: s.drip, diag: s.diag,
      mat: s.mat, gauge: s.gauge,
      pc: s.pc, pcCol: s.pcCol,
      holes: s.holes,
      collarA: s.collarA, collarB: s.collarB, collarC: s.collarC,
      quantity: s.quantity, notes: s.notes,
    };
    sessionStorage.setItem(RESTORE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/** Restore config from sessionStorage (back-from-cart), then clear it.
 *  Returns true if config was restored. */
export function restoreConfigIfNeeded(): boolean {
  try {
    const raw = sessionStorage.getItem(RESTORE_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(RESTORE_KEY);
    const data = JSON.parse(raw);
    useConfigStore.getState().set(data);
    return true;
  } catch {
    sessionStorage.removeItem(RESTORE_KEY);
    return false;
  }
}

export const useConfigStore = create<ConfigState>()(
  (set) => ({
    ...initial,
    set: (partial) => set(state => {
      const next = { ...state, ...partial };
      return { ...partial, price: computePrice(next) };
    }),
    setCollar: (id, partial) => set(state => {
      const key = `collar${id}` as 'collarA' | 'collarB' | 'collarC';
      const updated = { ...state[key], ...partial };
      const next = { ...state, [key]: updated };
      return { [key]: updated, price: computePrice(next) };
    }),
    setOrbitEnabled: (v: boolean) => set({ orbitEnabled: v }),
    setMoveHolesMode: (v: boolean) => set({ moveHolesMode: v }),
  })
);

onPricingLoaded(() => {
  const state = useConfigStore.getState();
  useConfigStore.setState({ price: computePrice(state) });
});
