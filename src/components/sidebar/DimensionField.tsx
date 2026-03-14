import { useState, useEffect } from 'react';
import { useConfigStore } from '../../store/configStore';
import { InfoTooltip } from './InfoTooltip';
import { getHoleSizeInches } from '../../utils/geometry';

interface DimProps {
  configKey: 'w' | 'l' | 'sk';
  label: string;
  unit: string;
  max: number;
  tooltip?: string;
}

function DimInput({ configKey, label, unit, max, tooltip }: DimProps) {
  const config = useConfigStore(s => s);
  const committed = config[configKey] as number;
  const [inputVal, setInputVal] = useState(committed.toString());
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setInputVal(committed.toString());
  }, [committed, focused]);

  function getDynamicMin(): number {
    if (configKey === 'sk') return 1;
    const gap = 1, edgeClear = 0.5;
    let minReq = 16;
    if (config.holes === 0) return minReq;
    const a = getHoleSizeInches(config.collarA);
    const b = config.holes >= 2 ? getHoleSizeInches(config.collarB) : { sizeX: 0, sizeZ: 0 };
    const c = config.holes === 3 ? getHoleSizeInches(config.collarC) : { sizeX: 0, sizeZ: 0 };
    const dA = a.sizeZ;
    const dB = b.sizeZ;
    const dC = c.sizeZ;
    const wA = a.sizeX;
    const wB = b.sizeX;
    const wC = c.sizeX;
    if (configKey === 'l') {
      if (config.holes === 1) minReq = Math.max(minReq, dA + 2 * edgeClear);
      else if (config.holes === 2) minReq = Math.max(minReq, dA + dB + 2 * gap, 2 * dA + 4 * edgeClear, 2 * dB + 4 * edgeClear);
      else minReq = Math.max(minReq, 1.5 * (dA + dB) + 3 * gap, 1.5 * (dB + dC) + 3 * gap, 3 * dA + 6 * edgeClear, 3 * dC + 6 * edgeClear, dB + 2 * edgeClear);
    } else {
      minReq = Math.max(minReq, Math.max(wA, wB, wC) + 2 * edgeClear);
    }
    return minReq;
  }

  function commit() {
    setFocused(false);
    let raw = parseFloat(inputVal) || 0;
    raw = Math.ceil(raw * 8) / 8; // snap to eighths (always round up)
    const clamped = Math.max(getDynamicMin(), Math.min(max, raw));
    setInputVal(clamped.toString());
    config.set({ [configKey]: clamped });
  }

  return (
    <div className="field">
      <label>
        {label} <span className="unit">({unit})</span>
        {tooltip && <InfoTooltip text={tooltip} />}
      </label>
      <input
        type="number"
        value={inputVal}
        step={0.125}
        style={{ color: focused ? '#3b6dd4' : undefined }}
        onFocus={() => setFocused(true)}
        onChange={e => setInputVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); } }}
      />
    </div>
  );
}

export function DimensionFields() {
  return (
    <div className="field-row-3">
      <DimInput
        configKey="l"
        label="Length"
        unit="in"
        max={120}
        tooltip="Measure the outside length of your chase opening from edge to edge. Add ¼″ for proper fitment."
      />
      <DimInput
        configKey="w"
        label="Width"
        unit="in"
        max={60}
        tooltip="Measure the outside width of your chase opening from edge to edge. Add ¼″ for proper fitment."
      />
      <DimInput 
        configKey="sk" 
        label="Skirt" 
        unit="in" 
        max={12} 
        tooltip="The skirt wraps down over the sides of the chase. Standard is 2″–3″. Use 6″+ for added wind resistance."
      />
    </div>
  );
}
