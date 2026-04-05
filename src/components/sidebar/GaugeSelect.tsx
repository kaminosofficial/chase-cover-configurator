import { useConfigStore } from '../../store/configStore';

const GAUGES = [
  { v: 24, l: '24 ga' },
  { v: 22, l: '22 ga' },
  { v: 20, l: '20 ga' },
];

export function GaugeSelect() {
  const gauge = useConfigStore(s => s.gauge);
  const set = useConfigStore(s => s.set);

  return (
    <div className="gauge-button-group" role="radiogroup" aria-label="Gauge">
      {GAUGES.map(g => (
        <button
          key={g.v}
          type="button"
          className={`gauge-button${gauge === g.v ? ' active' : ''}`}
          aria-pressed={gauge === g.v}
          onClick={() => set({ gauge: g.v as 20 | 22 | 24 })}
        >
          {g.l}
        </button>
      ))}
    </div>
  );
}
