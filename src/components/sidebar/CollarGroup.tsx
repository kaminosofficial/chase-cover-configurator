import { useState, useEffect } from 'react';
import { useConfigStore } from '../../store/configStore';
import type { CollarState } from '../../store/configStore';
import { holeWorld, SC } from '../../utils/geometry';
import { InfoTooltip } from './InfoTooltip';

interface Props { id: 'A' | 'B' | 'C'; label: string; }

function CollarInput({ label, value, min, max, onCommit, tooltip }: { label: React.ReactNode; value: number; min: number; max: number; onCommit: (v: number) => void; tooltip?: string }) {
  const [inputVal, setInputVal] = useState(value.toString());
  const [focused, setFocused] = useState(false);

  useEffect(() => { if (!focused) setInputVal(value.toString()); }, [value, focused]);

  function commit() {
    setFocused(false);
    let v = parseFloat(inputVal) || min;
    v = Math.ceil(v * 8) / 8;
    v = Math.max(min, Math.min(max, v));
    setInputVal(v.toString());
    onCommit(v);
  }

  return (
    <div className="field">
      <label style={{ display: 'flex', alignItems: 'center' }}>
        {label}
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

const MIN_GAP = 1; // minimum 1 inch gap between holes

/**
 * Check if a proposed offset change would cause this hole to overlap another.
 * Returns the clamped offset value that maintains MIN_GAP between all holes.
 *
 * offsetKey: which offset is being changed ('offset1'|'offset2'|'offset3'|'offset4')
 * proposedVal: the proposed new value for that offset
 */
function clampForCollision(
  id: 'A' | 'B' | 'C',
  config: any,
  offsetKey: 'offset1' | 'offset2' | 'offset3' | 'offset4',
  proposedVal: number
): number {
  // Build list of other hole IDs
  const otherIds: ('A' | 'B' | 'C')[] = [];
  if (config.holes >= 1 && id !== 'A') otherIds.push('A');
  if (config.holes >= 2 && id !== 'B') otherIds.push('B');
  if (config.holes === 3 && id !== 'C') otherIds.push('C');

  if (otherIds.length === 0) return proposedVal;

  const collar: CollarState = id === 'A' ? config.collarA : id === 'B' ? config.collarB : config.collarC;
  const myR = collar.dia / 2;

  // Compute what the hole center would be with the proposed offset
  // holeWorld uses offset1 and offset2 for position:
  //   cx = (w/2 - offset1) * SC - r
  //   cz = (l/2 - offset2) * SC - r
  // In inches (before SC): centerX = w/2 - offset1 - r, centerZ = l/2 - offset2 - r
  let testOffset1 = collar.offset1;
  let testOffset2 = collar.offset2;

  // Map the display label offsets to internal offsets
  if (offsetKey === 'offset3') {
    // Top: offset3 changed, offset1 = w - dia - offset3
    testOffset1 = Math.max(0, config.w - collar.dia - proposedVal);
  } else if (offsetKey === 'offset1') {
    testOffset1 = proposedVal;
  } else if (offsetKey === 'offset4') {
    // Right: offset4 changed, offset2 = l - dia - offset4
    testOffset2 = Math.max(0, config.l - collar.dia - proposedVal);
  } else if (offsetKey === 'offset2') {
    testOffset2 = proposedVal;
  }

  const proposedCx = config.w / 2 - testOffset1 - myR;
  const proposedCz = config.l / 2 - testOffset2 - myR;

  // Check distance to each other hole
  for (const otherId of otherIds) {
    const otherHole = holeWorld(otherId, config);
    const otherCx = otherHole.wx / SC;
    const otherCz = otherHole.wz / SC;
    const otherR = otherHole.r / SC;

    const dx = proposedCx - otherCx;
    const dz = proposedCz - otherCz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const minDist = myR + otherR + MIN_GAP;

    if (dist < minDist && dist > 0.001) {
      // Collision! Push back along the movement axis
      // Scale factor to maintain minimum distance
      const scale = minDist / dist;
      const safeCx = otherCx + dx * scale;
      const safeCz = otherCz + dz * scale;

      // Convert safe position back to offset
      if (offsetKey === 'offset1') {
        const safeOffset1 = config.w / 2 - myR - safeCx;
        proposedVal = Math.max(0, Math.ceil(safeOffset1 * 8) / 8);
      } else if (offsetKey === 'offset3') {
        const safeOffset1 = config.w / 2 - myR - safeCx;
        const safeOffset3 = config.w - collar.dia - safeOffset1;
        proposedVal = Math.max(0, Math.ceil(safeOffset3 * 8) / 8);
      } else if (offsetKey === 'offset2') {
        const safeOffset2 = config.l / 2 - myR - safeCz;
        proposedVal = Math.max(0, Math.ceil(safeOffset2 * 8) / 8);
      } else if (offsetKey === 'offset4') {
        const safeOffset2 = config.l / 2 - myR - safeCz;
        const safeOffset4 = config.l - collar.dia - safeOffset2;
        proposedVal = Math.max(0, Math.ceil(safeOffset4 * 8) / 8);
      }
    }
  }

  return proposedVal;
}

export function CollarGroup({ id, label }: Props) {
  const config = useConfigStore(s => s);
  const setCollar = useConfigStore(s => s.setCollar);
  const collar = id === 'A' ? config.collarA : id === 'B' ? config.collarB : config.collarC;

  // Dynamic max values based on cover dimensions
  const maxW = Math.max(0, config.w - collar.dia);
  const maxL = Math.max(0, config.l - collar.dia);

  // Max diameter: must fit within cover AND leave room for other holes (with 1" gap each)
  let maxDia = Math.min(config.w, config.l);
  if (config.holes >= 2) {
    const otherDias: number[] = [];
    if (id !== 'A' && config.holes >= 1) otherDias.push(config.collarA.dia);
    if (id !== 'B' && config.holes >= 2) otherDias.push(config.collarB.dia);
    if (id !== 'C' && config.holes === 3) otherDias.push(config.collarC.dia);
    const totalOtherDia = otherDias.reduce((s, d) => s + d, 0);
    const gaps = otherDias.length * MIN_GAP;
    maxDia = Math.min(maxDia, config.l - totalOtherDia - gaps);
  }
  maxDia = Math.max(3, maxDia);

  function handleCenteredChange(newCentered: boolean) {
    if (!newCentered) {
      const hole = holeWorld(id, config);
      const w = config.w, l = config.l, dia = collar.dia;
      const r8 = (v: number) => Math.max(0, Math.ceil(v * 8) / 8);
      setCollar(id, {
        centered: false,
        offset1: r8(w / 2 - dia / 2 - hole.wx / SC),
        offset2: r8(l / 2 - dia / 2 - hole.wz / SC),
        offset3: r8(hole.wx / SC + w / 2 - dia / 2),
        offset4: r8(hole.wz / SC + l / 2 - dia / 2),
      });
    } else {
      setCollar(id, { centered: true });
    }
  }

  function handleDiaChange(newDia: number) {
    if (collar.centered) {
      setCollar(id, { dia: newDia });
    } else {
      const deltaDia = newDia - collar.dia;
      const halfDelta = deltaDia / 2;
      const r8 = (v: number) => Math.max(0, Math.ceil(v * 8) / 8);
      setCollar(id, {
        dia: newDia,
        offset1: r8(collar.offset1 - halfDelta),
        offset2: r8(collar.offset2 - halfDelta),
        offset3: r8(collar.offset3 - halfDelta),
        offset4: r8(collar.offset4 - halfDelta),
      });
    }
  }

  function commitTop(v: number) {
    v = Math.min(v, maxW);
    v = clampForCollision(id, config, 'offset3', v);
    setCollar(id, { offset3: v, offset1: Math.max(0, config.w - collar.dia - v) });
  }
  function commitBottom(v: number) {
    v = Math.min(v, maxW);
    v = clampForCollision(id, config, 'offset1', v);
    setCollar(id, { offset1: v, offset3: Math.max(0, config.w - collar.dia - v) });
  }
  function commitRight(v: number) {
    v = Math.min(v, maxL);
    v = clampForCollision(id, config, 'offset4', v);
    setCollar(id, { offset4: v, offset2: Math.max(0, config.l - collar.dia - v) });
  }
  function commitLeft(v: number) {
    v = Math.min(v, maxL);
    v = clampForCollision(id, config, 'offset2', v);
    setCollar(id, { offset2: v, offset4: Math.max(0, config.l - collar.dia - v) });
  }

  return (
    <div className="collar-group">
      <div className="collar-group-title">{label}</div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <label className="centered-check" style={{ display: 'flex', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={collar.centered}
            onChange={e => handleCenteredChange(e.target.checked)}
          />
          Centered on Cover
          <InfoTooltip text="When centered, the hole is automatically placed at the center of the cover. Uncheck to set custom offsets from each edge." />
        </label>
        <label className="centered-check">
          <input
            type="checkbox"
            checked={id === 'A' ? config.showLabelsA : id === 'B' ? config.showLabelsB : config.showLabelsC}
            onChange={e => config.set({ [`showLabels${id}`]: e.target.checked } as any)}
          />
          Show Labels
        </label>
        <label className="centered-check" style={{ display: 'flex', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={collar.stormCollar || false}
            onChange={e => setCollar(id, { stormCollar: e.target.checked })}
          />
          Add Storm Collar
          <InfoTooltip text="The storm collar diameter will be 1 inch smaller than the selected flue hole diameter." />
        </label>
      </div>
      <div className="field-row">
        <CollarInput 
          label="Diameter (in)" 
          value={collar.dia} 
          min={3} 
          max={maxDia} 
          onCommit={handleDiaChange} 
          tooltip="Measure the outside diameter of the flue pipe or liner where it exits the chase top."
        />
        {collar.stormCollar && (
          <CollarInput 
            label="Collar Height (in)" 
            value={collar.height} 
            min={1} 
            max={52} 
            onCommit={v => setCollar(id, { height: v })} 
            tooltip="The collar is the vertical sleeve around the flue pipe. Taller collars provide more weather protection."
          />
        )}
      </div>
      {!collar.centered && (
        <div className="offset-grid">
          <div className="field-row" style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', right: '0', top: '-18px' }}>
              <InfoTooltip 
                text="The exact placement of the hole on the cover surface. Measure from the outside edge of the chimney structure to the edge of the pipe. Entering custom offsets allows you to match the exact position of existing pipes." 
              />
            </div>
            <CollarInput label={`${id}1 (Top edge → hole)`} value={collar.offset3} min={0} max={maxW}
              onCommit={commitTop} />
            <CollarInput label={`${id}3 (Bottom edge → hole)`} value={collar.offset1} min={0} max={maxW}
              onCommit={commitBottom} />
          </div>
          <div className="field-row">
            <CollarInput label={`${id}2 (Right edge → hole)`} value={collar.offset4} min={0} max={maxL}
              onCommit={commitRight} />
            <CollarInput label={`${id}4 (Left edge → hole)`} value={collar.offset2} min={0} max={maxL}
              onCommit={commitLeft} />
          </div>
        </div>
      )}
    </div>
  );
}
