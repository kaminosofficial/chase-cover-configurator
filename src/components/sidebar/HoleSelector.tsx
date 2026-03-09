import { useConfigStore } from '../../store/configStore';

const HOLE_OPTIONS = [
  { count: 0, label: 'No Hole' },
  { count: 1, label: '1 Hole' },
  { count: 2, label: '2 Holes' },
  { count: 3, label: '3 Holes' },
];

export function HoleSelector() {
  const holes = useConfigStore(s => s.holes);
  const config = useConfigStore(s => s);

  function selectHoles(n: 0 | 1 | 2 | 3) {
    const W = config.w, L = config.l;
    let maxD = 10;
    if (n === 1) maxD = Math.min(10, W - 1, L - 1);
    if (n === 2) maxD = Math.min(10, W - 1, L / 2 - 1);
    if (n === 3) maxD = Math.min(10, W - 1, L / 3 - 1);
    const d = Math.max(3, Math.floor(maxD));
    const r = { dia: d, height: 3, centered: true, offset1: 0, offset2: 0, offset3: 0, offset4: 0, stormCollar: false };
    config.set({ holes: n, collarA: { ...r }, collarB: { ...r }, collarC: { ...r } });
  }

  return (
    <div className="hole-selector">
      {HOLE_OPTIONS.map(opt => (
        <button
          key={opt.count}
          className={`hole-btn${holes === opt.count ? ' active' : ''}`}
          onClick={() => selectHoles(opt.count as 0 | 1 | 2 | 3)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
