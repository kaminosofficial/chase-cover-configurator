import { describe, it, expect } from 'vitest';
import {
  SC,
  MIN_GAP_INCHES,
  getHoleSizeInches,
  holeWorld,
  holesOverlap,
} from './geometry';
import type { ConfigState, CollarState } from '../store/configStore';

/**
 * Tests for the hole-placement maths.
 *
 * WHY THIS FILE EXISTS: holeWorld() is the single source of truth for where a
 * flue hole sits. It feeds the 3D model, the drag-to-move handles, the PDF
 * spec sheet, and (as of the worksheet UI) the live 2D profile drawings. If its
 * coordinate convention shifts, the 2D drawing silently tells the customer a
 * different hole position than the one that gets fabricated. These tests pin
 * the convention so that can't happen quietly.
 */

const collar = (over: Partial<CollarState> = {}): CollarState => ({
  shape: 'round',
  dia: 10,
  rectWidth: 8,
  rectLength: 6,
  height: 2,
  centered: true,
  offset1: 0, offset2: 0, offset3: 0, offset4: 0,
  stormCollar: false,
  ...over,
});

const cfg = (over: Partial<ConfigState> = {}): ConfigState => ({
  w: 48, l: 60, sk: 3,
  holes: 1,
  collarA: collar(), collarB: collar(), collarC: collar(),
  ...over,
} as ConfigState);

describe('getHoleSizeInches', () => {
  it('uses the diameter on both axes for a round hole', () => {
    expect(getHoleSizeInches(collar({ shape: 'round', dia: 10 }))).toEqual({ sizeX: 10, sizeZ: 10 });
  });

  it('maps rectWidth to X (across the cover width) and rectLength to Z', () => {
    // Easy to transpose in a refactor; a swap would render the hole rotated 90 degrees.
    expect(getHoleSizeInches(collar({ shape: 'rect', rectWidth: 8, rectLength: 6 })))
      .toEqual({ sizeX: 8, sizeZ: 6 });
  });
});

describe('centered placement', () => {
  it('puts a single hole dead centre', () => {
    const h = holeWorld('A', cfg({ holes: 1 }));
    expect(h.wx).toBe(0);
    expect(h.wz).toBe(0);
  });

  it('places two holes symmetrically about the centre', () => {
    const c = cfg({ holes: 2 });
    const a = holeWorld('A', c);
    const b = holeWorld('B', c);
    expect(a.wz).toBeCloseTo(-b.wz, 12);
    expect(a.wz).toBeGreaterThan(0);
    expect(a.wx).toBe(0);
    expect(b.wx).toBe(0);
  });

  it('places three holes symmetrically with the middle one centred', () => {
    const c = cfg({ holes: 3 });
    const [a, b, cc] = (['A', 'B', 'C'] as const).map(id => holeWorld(id, c));
    expect(b.wz).toBe(0);
    expect(a.wz).toBeCloseTo(-cc.wz, 12);
    expect(a.wz).toBeGreaterThan(0);
  });

  it('scales hole spacing with cover length', () => {
    const short = holeWorld('A', cfg({ holes: 2, l: 40 }));
    const long = holeWorld('A', cfg({ holes: 2, l: 100 }));
    expect(long.wz).toBeGreaterThan(short.wz);
  });
});

describe('world-space conversion convention', () => {
  // The 2D drawings invert this exact mapping to derive TE/BE/LE/RE, so the
  // relationship between inches, SC and world units must stay fixed.
  it('reports half-extents in world units (inches x SC)', () => {
    const h = holeWorld('A', cfg({ collarA: collar({ dia: 10 }) }));
    expect(h.halfX / SC).toBeCloseTo(5, 12);
    expect(h.halfZ / SC).toBeCloseTo(5, 12);
    expect(h.radius / SC).toBeCloseTo(5, 12);
  });

  it('reports radius 0 for a rectangular hole', () => {
    const h = holeWorld('A', cfg({ collarA: collar({ shape: 'rect' }) }));
    expect(h.radius).toBe(0);
  });

  it('converts manual offsets so that offset2 measures from the length edge', () => {
    const c = cfg({
      l: 60,
      collarA: collar({ centered: false, offset2: 10, offset1: 0, dia: 10 }),
    });
    const h = holeWorld('A', c);
    // cz = (l/2 - offset2) * SC - halfZ  ->  (30 - 10) * SC - 5*SC = 15*SC
    expect(h.wz / SC).toBeCloseTo(15, 10);
  });

  it('keeps a hole inside the cover even when offsets push it out', () => {
    const c = cfg({
      w: 48, l: 60,
      collarA: collar({ centered: false, offset1: -500, offset2: -500, dia: 10 }),
    });
    const h = holeWorld('A', c);
    expect(Math.abs(h.wx) + h.halfX).toBeLessThanOrEqual((c.w / 2) * SC + 1e-9);
    expect(Math.abs(h.wz) + h.halfZ).toBeLessThanOrEqual((c.l / 2) * SC + 1e-9);
  });
});

describe('holesOverlap', () => {
  const roundAt = (wz: number, dia: number) =>
    holeWorld('A', cfg({ collarA: collar({ centered: false, dia }) })) &&
    ({
      wx: 0, wz, h: 0, id: 'A' as const, shape: 'round' as const,
      halfX: (dia / 2) * SC, halfZ: (dia / 2) * SC,
      sizeX: dia * SC, sizeZ: dia * SC, radius: (dia / 2) * SC,
    });

  it('detects two circles closer than the minimum gap', () => {
    // centres 10.5in apart, radii 5+5 = 10in -> only 0.5in gap, under the 1in minimum
    expect(holesOverlap(roundAt(0, 10), roundAt(10.5 * SC, 10))).toBe(true);
  });

  it('allows two circles exactly at the minimum gap', () => {
    // centres 11in apart, radii 5+5 -> exactly 1in gap
    expect(holesOverlap(roundAt(0, 10), roundAt(11 * SC, 10))).toBe(false);
  });

  it('allows comfortably separated circles', () => {
    expect(holesOverlap(roundAt(0, 10), roundAt(20 * SC, 10))).toBe(false);
  });

  it('enforces a 1 inch minimum gap by default', () => {
    expect(MIN_GAP_INCHES).toBe(1);
  });
});
