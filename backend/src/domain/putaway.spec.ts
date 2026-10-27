import { LocationGeom, ProductDims } from './fit.js';
import { Candidate, bestQuantity, isValidVin, suggestLocations } from './putaway.js';

const pump: ProductDims = { lengthCm: 50, widthCm: 30, heightCm: 40, weightKg: 27, stackable: true };
const car: ProductDims = { lengthCm: 464, widthCm: 182, heightCm: 173, weightKg: 1550, stackable: false };
const bay = (code: string, usedKg: number, capKg = 250): LocationGeom =>
  ({ kind: 'BAY', lengthCm: 100, widthCm: 60, heightCm: 60, capKg: null, shelf: { capKg, usedKg } });
const cand = (code: string, geom: LocationGeom, contents: ProductDims[] = [], skus: string[] = []): Candidate =>
  ({ code, address: code, kind: geom.kind, geom, contents, skus });

describe('suggestLocations', () => {
  const cands = [
    cand('RCV', { kind: 'RECEIVING', lengthCm: 0, widthCm: 0, heightCm: 99999, capKg: null, shelf: null }),
    cand('A-RK1-S1-B1', bay('x', 0)),
    cand('A-RK1-S1-B2', bay('x', 54), [pump, pump], ['PDR-2CPM25']),
    cand('A-RK4-S1-B1', bay('x', 243), [pump], ['PDR-2CPM25']), // shelf at its weight limit
    cand('B-R1C1', { kind: 'FLOOR', lengthCm: 373, widthCm: 373, heightCm: 300, capKg: null, shelf: null }),
  ];

  it('puts bays already holding the product first, then empty ones; never the full shelf or Receiving', () => {
    const s = suggestLocations([pump], 'PDR-2CPM25', cands).map((x) => x.code);
    expect(s[0]).toBe('A-RK1-S1-B2');
    expect(s).toContain('A-RK1-S1-B1');
    expect(s).not.toContain('A-RK4-S1-B1');
    expect(s).not.toContain('RCV');
  });

  it('sends vehicles to free floor cells only', () => {
    expect(suggestLocations([car], 'SUB-FOR20', cands).map((x) => x.code)).toEqual(['B-R1C1']);
  });

  it('sends tall items to the tightest-fitting space, not to a pallet', () => {
    const tall: ProductDims = { lengthCm: 20, widthCm: 20, heightCm: 115, weightKg: 38, stackable: true };
    const merged: LocationGeom = { kind: 'BAY', lengthCm: 100, widthCm: 60, heightCm: 120, capKg: null, shelf: { capKg: 600, usedKg: 0 } };
    const pallet: LocationGeom = { kind: 'PLATE', lengthCm: 120, widthCm: 100, heightCm: 150, capKg: 1000, shelf: null };
    const s = suggestLocations([tall], 'PDR-4SR1', [cand('A-R11C2-P1', pallet), cand('A-RK3-S3-B1', merged)]);
    expect(s.map((x) => x.code)).toEqual(['A-RK3-S3-B1', 'A-R11C2-P1']);
  });

  it('can exclude the current location (for moves)', () => {
    expect(suggestLocations([pump], 'PDR-2CPM25', cands, 6, 'A-RK1-S1-B2').map((x) => x.code)).not.toContain('A-RK1-S1-B2');
  });
});

describe('bestQuantity', () => {
  it('is the most units that fit one location by space and weight', () => {
    // One empty 100×60×60 cm bay = 360,000 cm³. Each pump is 50×30×40 = 60,000 cm³ → space for 6.
    // Weight would allow 9 (250 kg ÷ 27 kg), so space is the limit here.
    const cands = [cand('A', bay('A', 0))];
    expect(bestQuantity(pump, 12, 'X', cands)).toBe(6);
    expect(bestQuantity(pump, 3, 'X', cands)).toBe(3);
  });
  it('is 1 for vehicles', () => {
    expect(bestQuantity(car, 5, 'SUB', [])).toBe(1);
  });
});

describe('isValidVin', () => {
  it('accepts 17-character VINs without I, O, Q', () => {
    expect(isValidVin('JF2SKAEC1RH412301')).toBe(true);
    expect(isValidVin('JF2SKAEC1RH41230')).toBe(false);
    expect(isValidVin('JF2SKAEC1RH41230O')).toBe(false);
  });
});
