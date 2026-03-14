import { useConfigStore } from '../../store/configStore';

export function MaterialChips() {
  const mat = useConfigStore(s => s.mat);
  const set = useConfigStore(s => s.set);
  return (
    <div className="material-chips">
      <button className={`material-chip${mat === 'galvanized' ? ' active' : ''}`} onClick={() => set({ mat: 'galvanized' })}>
        Galvanized Steel
      </button>
      <button className={`material-chip${mat === 'copper' ? ' active' : ''}`} onClick={() => set({ mat: 'copper' })}>
        Copper
      </button>
    </div>
  );
}
