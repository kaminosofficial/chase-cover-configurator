import { useConfigStore } from '../../store/configStore';

const HOLE_OPTIONS: { count: 0 | 1 | 2 | 3; label: string; sub: string }[] = [
  { count: 1, label: 'Single Hole', sub: '1 flue pipe' },
  { count: 2, label: 'Double Hole', sub: '2 flue pipes' },
  { count: 3, label: 'Triple Hole', sub: '3 flue pipes' },
  { count: 0, label: 'No Holes', sub: 'solid cover' },
];

/** Mini plan-view icon: cover outline with n hole circles, worksheet-style. */
function TypeIcon({ n }: { n: number }) {
  const pos = n === 1 ? [50] : n === 2 ? [32, 68] : n === 3 ? [24, 50, 76] : [];
  return (
    <svg width="72" height="26" viewBox="0 0 100 32" aria-hidden="true">
      <rect x="4" y="2" width="92" height="28" rx="3" fill="var(--color-surface-soft, #f3ece4)" stroke="currentColor" strokeWidth="2" />
      {pos.map(p => (
        <circle key={p} cx={p} cy="16" r="8" fill="#fff" stroke="currentColor" strokeWidth="2" />
      ))}
    </svg>
  );
}

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
    const r = {
      shape: 'round' as const,
      dia: d,
      rectWidth: d,
      rectLength: d,
      height: 2,
      centered: true,
      offset1: 0,
      offset2: 0,
      offset3: 0,
      offset4: 0,
      stormCollar: false,
    };
    config.set({ holes: n, collarA: { ...r }, collarB: { ...r }, collarC: { ...r } });
  }

  return (
    <div className="type-cards">
      {HOLE_OPTIONS.map(opt => (
        <button
          key={opt.count}
          type="button"
          className={`type-card${holes === opt.count ? ' active' : ''}`}
          onClick={() => selectHoles(opt.count)}
        >
          <TypeIcon n={opt.count} />
          <span className="type-card-title">{opt.label}</span>
          <span className="type-card-sub">{opt.sub}</span>
        </button>
      ))}
    </div>
  );
}
