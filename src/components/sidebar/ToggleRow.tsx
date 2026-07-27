import { useConfigStore } from '../../store/configStore';
import { InfoTooltip } from './InfoTooltip';

/** Boolean store keys this row can bind to. */
type ToggleKey = 'drip' | 'diag' | 'pc' | 'mountSkirt' | 'mountTop';

interface Props {
  id: ToggleKey;
  label: string;
  tooltip?: string;
  /** Optional small helper line under the label (e.g. mounting-hole spec text). */
  sub?: string;
  defaultChecked?: boolean;
}

export function ToggleRow({ id, label, tooltip, sub }: Props) {
  const checked = useConfigStore(s => s[id]);
  const set = useConfigStore(s => s.set);

  function toggle() {
    set({ [id]: !checked } as any);
  }

  return (
    <div className="toggle-row">
      <span className="toggle-label" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center' }}>
          {label}
          {tooltip && <InfoTooltip text={tooltip} />}
        </span>
        {sub && <span className="toggle-sublabel">{sub}</span>}
      </span>
      <label className="toggle">
        <input type="checkbox" checked={checked} onChange={toggle} />
        <div className="toggle-track"></div>
        <div className="toggle-knob"></div>
      </label>
    </div>
  );
}
