import { useState, useEffect, type ReactNode } from 'react';
import { useConfigStore } from '../../store/configStore';
import type { CollarState, ConfigState } from '../../store/configStore';
import { holeWorld, SC, clampDragToOffsets, MIN_GAP_INCHES } from '../../utils/geometry';
import { InfoTooltip } from './InfoTooltip';

interface Props { id: 'A' | 'B' | 'C'; label: string; }

type HoleId = 'A' | 'B' | 'C';

const MIN_DIA = 3;
const STEP = 0.125;
const COLLAR_KEYS: Record<HoleId, 'collarA' | 'collarB' | 'collarC'> = {
  A: 'collarA',
  B: 'collarB',
  C: 'collarC',
};

function CollarInput({ label, value, min, max, onCommit, tooltip }: { label: ReactNode; value: number; min: number; max: number; onCommit: (v: number) => void; tooltip?: string }) {
  const [inputVal, setInputVal] = useState(value.toString());
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setInputVal(value.toString());
  }, [value, focused]);

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
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

function activeHoleIds(config: ConfigState): HoleId[] {
  const ids: HoleId[] = [];
  if (config.holes >= 1) ids.push('A');
  if (config.holes >= 2) ids.push('B');
  if (config.holes === 3) ids.push('C');
  return ids;
}

function getCollarState(config: ConfigState, id: HoleId): CollarState {
  return config[COLLAR_KEYS[id]];
}

function snapDownToEighth(value: number): number {
  return Math.floor(value * 8 + 0.0001) / 8;
}

function buildConfigWithCollar(config: ConfigState, id: HoleId, partial: Partial<CollarState>): ConfigState {
  const key = COLLAR_KEYS[id];
  return {
    ...config,
    [key]: {
      ...config[key],
      ...partial,
    },
  } as ConfigState;
}

function computeLogicalMaxDiameter(config: ConfigState, id: HoleId): number {
  const hole = holeWorld(id, config);
  const centerX = Math.abs(hole.wx / SC);
  const centerZ = Math.abs(hole.wz / SC);

  let maxRadius = Math.min(
    config.w / 2 - centerX,
    config.l / 2 - centerZ,
  );

  for (const otherId of activeHoleIds(config)) {
    if (otherId === id) continue;

    const other = holeWorld(otherId, config);
    const dx = hole.wx - other.wx;
    const dz = hole.wz - other.wz;
    const distInches = Math.sqrt(dx * dx + dz * dz) / SC;
    const allowedRadius = distInches - other.r / SC - MIN_GAP_INCHES;
    maxRadius = Math.min(maxRadius, allowedRadius);
  }

  return Math.max(0, snapDownToEighth(maxRadius * 2));
}

function layoutsOverlap(config: ConfigState): boolean {
  const holes = activeHoleIds(config).map(holeId => holeWorld(holeId, config));

  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      const dx = holes[i].wx - holes[j].wx;
      const dz = holes[i].wz - holes[j].wz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = holes[i].r + holes[j].r + MIN_GAP_INCHES * SC;
      if (dist < minDist - 0.0005) {
        return true;
      }
    }
  }

  return false;
}

function resolveManualOffsets(config: ConfigState, id: HoleId, partial: Partial<CollarState>) {
  const trialConfig = buildConfigWithCollar(config, id, { centered: false, ...partial });
  const trialHole = holeWorld(id, trialConfig);
  const safe = clampDragToOffsets(id, trialHole.wx, trialHole.wz, trialConfig);

  if (safe.colliding) {
    return null;
  }

  const safeConfig = buildConfigWithCollar(trialConfig, id, {
    centered: false,
    offset1: safe.offset1,
    offset2: safe.offset2,
    offset3: safe.offset3,
    offset4: safe.offset4,
  });

  if (layoutsOverlap(safeConfig)) {
    return null;
  }

  return safe;
}

function resolveManualDiameter(config: ConfigState, id: HoleId, requestedDia: number) {
  const currentHole = holeWorld(id, config);
  const logicalMaxDia = computeLogicalMaxDiameter(config, id);
  const upperBound = snapDownToEighth(Math.max(MIN_DIA, Math.min(requestedDia, logicalMaxDia)));
  const stepCount = Math.max(0, Math.floor((upperBound - MIN_DIA) / STEP + 0.0001));

  for (let stepIndex = 0; stepIndex <= stepCount; stepIndex++) {
    const candidateDia = snapDownToEighth(upperBound - stepIndex * STEP);
    const trialConfig = buildConfigWithCollar(config, id, {
      centered: false,
      dia: candidateDia,
    });
    const safe = clampDragToOffsets(id, currentHole.wx, currentHole.wz, trialConfig);

    if (safe.colliding) {
      continue;
    }

    const safeConfig = buildConfigWithCollar(trialConfig, id, {
      centered: false,
      dia: candidateDia,
      offset1: safe.offset1,
      offset2: safe.offset2,
      offset3: safe.offset3,
      offset4: safe.offset4,
    });

    if (!layoutsOverlap(safeConfig)) {
      return {
        dia: candidateDia,
        ...safe,
      };
    }
  }

  return null;
}

export function CollarGroup({ id, label }: Props) {
  const config = useConfigStore(s => s);
  const setCollar = useConfigStore(s => s.setCollar);
  const collar = getCollarState(config, id);

  const maxW = Math.max(0, config.w - collar.dia);
  const maxL = Math.max(0, config.l - collar.dia);
  const maxDia = Math.max(MIN_DIA, computeLogicalMaxDiameter(config, id));
  const diaInputMax = maxDia;

  useEffect(() => {
    if (collar.centered && collar.dia > maxDia) {
      setCollar(id, { dia: Math.max(MIN_DIA, snapDownToEighth(maxDia)) });
    }
  }, [collar.centered, collar.dia, id, maxDia, setCollar]);

  useEffect(() => {
    if (collar.centered) {
      return;
    }

    const resolved = resolveManualDiameter(config, id, collar.dia);
    if (!resolved) {
      return;
    }

    const needsUpdate =
      Math.abs(collar.dia - resolved.dia) > 0.0001 ||
      Math.abs(collar.offset1 - resolved.offset1) > 0.0001 ||
      Math.abs(collar.offset2 - resolved.offset2) > 0.0001 ||
      Math.abs(collar.offset3 - resolved.offset3) > 0.0001 ||
      Math.abs(collar.offset4 - resolved.offset4) > 0.0001;

    if (needsUpdate) {
      setCollar(id, {
        centered: false,
        dia: resolved.dia,
        offset1: resolved.offset1,
        offset2: resolved.offset2,
        offset3: resolved.offset3,
        offset4: resolved.offset4,
      });
    }
  }, [
    collar.centered,
    collar.dia,
    collar.offset1,
    collar.offset2,
    collar.offset3,
    collar.offset4,
    config.w,
    config.l,
    config.holes,
    config.collarA,
    config.collarB,
    config.collarC,
    id,
    setCollar,
  ]);

  function handleCenteredChange(newCentered: boolean) {
    if (!newCentered) {
      const hole = holeWorld(id, config);
      const w = config.w;
      const l = config.l;
      const dia = collar.dia;
      const r8 = (value: number) => Math.max(0, Math.ceil(value * 8) / 8);
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
      setCollar(id, { dia: Math.min(newDia, maxDia) });
      return;
    }

    const resolved = resolveManualDiameter(config, id, newDia);
    if (!resolved) {
      return;
    }

    setCollar(id, {
      centered: false,
      dia: resolved.dia,
      offset1: resolved.offset1,
      offset2: resolved.offset2,
      offset3: resolved.offset3,
      offset4: resolved.offset4,
    });
  }

  function commitManualOffsets(partial: Partial<CollarState>) {
    const resolved = resolveManualOffsets(config, id, partial);
    if (!resolved) {
      return;
    }

    setCollar(id, {
      centered: false,
      offset1: resolved.offset1,
      offset2: resolved.offset2,
      offset3: resolved.offset3,
      offset4: resolved.offset4,
    });
  }

  function commitTop(value: number) {
    const next = Math.min(value, maxW);
    commitManualOffsets({
      offset3: next,
      offset1: Math.max(0, config.w - collar.dia - next),
    });
  }

  function commitBottom(value: number) {
    const next = Math.min(value, maxW);
    commitManualOffsets({
      offset1: next,
      offset3: Math.max(0, config.w - collar.dia - next),
    });
  }

  function commitRight(value: number) {
    const next = Math.min(value, maxL);
    commitManualOffsets({
      offset4: next,
      offset2: Math.max(0, config.l - collar.dia - next),
    });
  }

  function commitLeft(value: number) {
    const next = Math.min(value, maxL);
    commitManualOffsets({
      offset2: next,
      offset4: Math.max(0, config.l - collar.dia - next),
    });
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
        <label className="centered-check" style={{ display: 'flex', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={collar.stormCollar || false}
            onChange={e => setCollar(id, { stormCollar: e.target.checked })}
          />
          Add Storm Collar
          <InfoTooltip text="Adds a conical metal flashing at the base of the collar that sheds water away from the pipe penetration. The storm collar top opening is 1 inch smaller than the flue hole diameter." />
        </label>
        <label className="centered-check">
          <input
            type="checkbox"
            checked={id === 'A' ? config.showLabelsA : id === 'B' ? config.showLabelsB : config.showLabelsC}
            onChange={e => config.set({ [`showLabels${id}`]: e.target.checked } as any)}
          />
          Show Labels
        </label>
      </div>
      <div className="field-row">
        <CollarInput
          label="Diameter (in)"
          value={collar.dia}
          min={MIN_DIA}
          max={diaInputMax}
          onCommit={handleDiaChange}
          tooltip="Measure the outside diameter of the flue pipe or liner where it exits the chase top."
        />
        <CollarInput
          label="Collar Height (in)"
          value={collar.height}
          min={1}
          max={52}
          onCommit={value => setCollar(id, { height: value })}
          tooltip="Height of the vertical collar sleeve above the cover surface."
        />
      </div>
      {!collar.centered && (
        <div className="offset-grid">
          <div className="field-row">
            <CollarInput label={`${id}1 (Top edge -> hole)`} value={collar.offset3} min={0} max={maxW}
              onCommit={commitTop} />
            <CollarInput label={`${id}3 (Bottom edge -> hole)`} value={collar.offset1} min={0} max={maxW}
              onCommit={commitBottom} />
          </div>
          <div className="field-row">
            <CollarInput label={`${id}2 (Right edge -> hole)`} value={collar.offset4} min={0} max={maxL}
              onCommit={commitRight} />
            <CollarInput label={`${id}4 (Left edge -> hole)`} value={collar.offset2} min={0} max={maxL}
              onCommit={commitLeft} />
          </div>
        </div>
      )}
    </div>
  );
}
