import { useEffect, useState, type ReactNode } from 'react';
import { useConfigStore } from '../../store/configStore';
import type { CollarState, ConfigState, HoleShape } from '../../store/configStore';
import { clampDragToOffsets, getHoleSizeInches, holeWorld, holesOverlap, MIN_GAP_INCHES, SC } from '../../utils/geometry';
import { InfoTooltip } from './InfoTooltip';

interface Props {
  id: 'A' | 'B' | 'C';
  label: string;
}

type HoleId = 'A' | 'B' | 'C';

const MIN_SIZE = 3;
const STEP = 0.125;
const COLLAR_KEYS: Record<HoleId, 'collarA' | 'collarB' | 'collarC'> = {
  A: 'collarA',
  B: 'collarB',
  C: 'collarC',
};

function CollarInput({
  label,
  value,
  min,
  max,
  onCommit,
  tooltip,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
  tooltip?: string;
}) {
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

function holeFitsCover(config: ConfigState, id: HoleId): boolean {
  const hole = holeWorld(id, config);
  const centerX = Math.abs(hole.wx / SC);
  const centerZ = Math.abs(hole.wz / SC);
  return (
    centerX + hole.halfX / SC <= config.w / 2 + 0.0001 &&
    centerZ + hole.halfZ / SC <= config.l / 2 + 0.0001
  );
}

function layoutsOverlap(config: ConfigState): boolean {
  const holes = activeHoleIds(config).map(holeId => holeWorld(holeId, config));

  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      if (holesOverlap(holes[i], holes[j], MIN_GAP_INCHES * SC)) {
        return true;
      }
    }
  }

  return false;
}

function layoutValid(config: ConfigState): boolean {
  return activeHoleIds(config).every(id => holeFitsCover(config, id)) && !layoutsOverlap(config);
}

function resolveManualOffsets(config: ConfigState, id: HoleId, partial: Partial<CollarState>) {
  const trialConfig = buildConfigWithCollar(config, id, { centered: false, ...partial });
  const trialHole = holeWorld(id, trialConfig);
  const safe = clampDragToOffsets(id, trialHole.wx, trialHole.wz, trialConfig);

  if (safe.colliding) return null;

  const safeConfig = buildConfigWithCollar(trialConfig, id, {
    centered: false,
    offset1: safe.offset1,
    offset2: safe.offset2,
    offset3: safe.offset3,
    offset4: safe.offset4,
  });

  if (!layoutValid(safeConfig)) return null;
  return safe;
}

function resolveRoundDiameter(config: ConfigState, id: HoleId, requestedDia: number) {
  const collar = getCollarState(config, id);
  const currentHole = holeWorld(id, config);
  const upperBound = snapDownToEighth(Math.max(MIN_SIZE, Math.min(requestedDia, config.w, config.l)));
  const stepCount = Math.max(0, Math.floor((upperBound - MIN_SIZE) / STEP + 0.0001));

  for (let stepIndex = 0; stepIndex <= stepCount; stepIndex++) {
    const candidateDia = snapDownToEighth(upperBound - stepIndex * STEP);
    const trialConfig = buildConfigWithCollar(config, id, {
      shape: 'round',
      dia: candidateDia,
    });

    if (collar.centered) {
      if (layoutValid(trialConfig)) {
        return { dia: candidateDia };
      }
      continue;
    }

    const safe = clampDragToOffsets(id, currentHole.wx, currentHole.wz, trialConfig);
    if (safe.colliding) continue;

    const safeConfig = buildConfigWithCollar(trialConfig, id, {
      centered: false,
      offset1: safe.offset1,
      offset2: safe.offset2,
      offset3: safe.offset3,
      offset4: safe.offset4,
    });

    if (layoutValid(safeConfig)) {
      return {
        dia: candidateDia,
        ...safe,
      };
    }
  }

  return null;
}

function resolveRectAxis(config: ConfigState, id: HoleId, axis: 'rectWidth' | 'rectLength', requestedValue: number) {
  const collar = getCollarState(config, id);
  const currentHole = holeWorld(id, config);
  const upperLimit = axis === 'rectWidth' ? config.w : config.l;
  const upperBound = snapDownToEighth(Math.max(MIN_SIZE, Math.min(requestedValue, upperLimit)));
  const stepCount = Math.max(0, Math.floor((upperBound - MIN_SIZE) / STEP + 0.0001));

  for (let stepIndex = 0; stepIndex <= stepCount; stepIndex++) {
    const candidateValue = snapDownToEighth(upperBound - stepIndex * STEP);
    const trialConfig = buildConfigWithCollar(config, id, {
      shape: 'rect',
      stormCollar: false,
      [axis]: candidateValue,
    } as Partial<CollarState>);

    if (collar.centered) {
      if (layoutValid(trialConfig)) {
        return { [axis]: candidateValue } as Partial<CollarState>;
      }
      continue;
    }

    const safe = clampDragToOffsets(id, currentHole.wx, currentHole.wz, trialConfig);
    if (safe.colliding) continue;

    const safeConfig = buildConfigWithCollar(trialConfig, id, {
      centered: false,
      offset1: safe.offset1,
      offset2: safe.offset2,
      offset3: safe.offset3,
      offset4: safe.offset4,
    });

    if (layoutValid(safeConfig)) {
      return {
        [axis]: candidateValue,
        ...safe,
      } as Partial<CollarState>;
    }
  }

  return null;
}

function ShapeToggle({ value, onChange }: { value: HoleShape; onChange: (shape: HoleShape) => void }) {
  return (
    <div className="shape-toggle">
      <button
        type="button"
        className={`shape-btn${value === 'round' ? ' active' : ''}`}
        onClick={() => onChange('round')}
      >
        Round
      </button>
      <button
        type="button"
        className={`shape-btn${value === 'rect' ? ' active' : ''}`}
        onClick={() => onChange('rect')}
      >
        Rectangle
      </button>
    </div>
  );
}

export function CollarGroup({ id, label }: Props) {
  const config = useConfigStore(s => s);
  const setCollar = useConfigStore(s => s.setCollar);
  const collar = getCollarState(config, id);
  const size = getHoleSizeInches(collar);

  const maxW = Math.max(0, config.w - size.sizeX);
  const maxL = Math.max(0, config.l - size.sizeZ);
  const maxDiaInput = Math.max(MIN_SIZE, snapDownToEighth(Math.min(config.w, config.l)));
  const maxRectWidthInput = Math.max(MIN_SIZE, snapDownToEighth(config.w));
  const maxRectLengthInput = Math.max(MIN_SIZE, snapDownToEighth(config.l));

  useEffect(() => {
    let partial: Partial<CollarState> | null = null;

    if (collar.shape === 'rect' && collar.stormCollar) {
      partial = { ...(partial ?? {}), stormCollar: false };
    }

    if (collar.shape === 'round') {
      const resolved = resolveRoundDiameter(config, id, collar.dia);
      if (resolved) {
        const needsUpdate =
          Math.abs(collar.dia - resolved.dia) > 0.0001 ||
          ('offset1' in resolved && Math.abs(collar.offset1 - (resolved.offset1 ?? collar.offset1)) > 0.0001) ||
          ('offset2' in resolved && Math.abs(collar.offset2 - (resolved.offset2 ?? collar.offset2)) > 0.0001) ||
          ('offset3' in resolved && Math.abs(collar.offset3 - (resolved.offset3 ?? collar.offset3)) > 0.0001) ||
          ('offset4' in resolved && Math.abs(collar.offset4 - (resolved.offset4 ?? collar.offset4)) > 0.0001);

        if (needsUpdate) {
          partial = {
            ...(partial ?? {}),
            ...resolved,
            centered: collar.centered,
          };
        }
      }
    } else {
      let workingConfig = partial ? buildConfigWithCollar(config, id, partial) : config;
      const widthResolved = resolveRectAxis(workingConfig, id, 'rectWidth', getCollarState(workingConfig, id).rectWidth);
      if (widthResolved) {
        const workingCollar = getCollarState(workingConfig, id);
        const needsWidthUpdate =
          Math.abs(workingCollar.rectWidth - (widthResolved.rectWidth ?? workingCollar.rectWidth)) > 0.0001 ||
          ('offset1' in widthResolved && Math.abs(workingCollar.offset1 - (widthResolved.offset1 ?? workingCollar.offset1)) > 0.0001) ||
          ('offset2' in widthResolved && Math.abs(workingCollar.offset2 - (widthResolved.offset2 ?? workingCollar.offset2)) > 0.0001) ||
          ('offset3' in widthResolved && Math.abs(workingCollar.offset3 - (widthResolved.offset3 ?? workingCollar.offset3)) > 0.0001) ||
          ('offset4' in widthResolved && Math.abs(workingCollar.offset4 - (widthResolved.offset4 ?? workingCollar.offset4)) > 0.0001);

        if (needsWidthUpdate) {
          partial = {
            ...(partial ?? {}),
            ...widthResolved,
            stormCollar: false,
            centered: collar.centered,
          };
          workingConfig = buildConfigWithCollar(workingConfig, id, partial);
        }
      }

      const lengthResolved = resolveRectAxis(workingConfig, id, 'rectLength', getCollarState(workingConfig, id).rectLength);
      if (lengthResolved) {
        const workingCollar = getCollarState(workingConfig, id);
        const needsLengthUpdate =
          Math.abs(workingCollar.rectLength - (lengthResolved.rectLength ?? workingCollar.rectLength)) > 0.0001 ||
          ('offset1' in lengthResolved && Math.abs(workingCollar.offset1 - (lengthResolved.offset1 ?? workingCollar.offset1)) > 0.0001) ||
          ('offset2' in lengthResolved && Math.abs(workingCollar.offset2 - (lengthResolved.offset2 ?? workingCollar.offset2)) > 0.0001) ||
          ('offset3' in lengthResolved && Math.abs(workingCollar.offset3 - (lengthResolved.offset3 ?? workingCollar.offset3)) > 0.0001) ||
          ('offset4' in lengthResolved && Math.abs(workingCollar.offset4 - (lengthResolved.offset4 ?? workingCollar.offset4)) > 0.0001);

        if (needsLengthUpdate) {
          partial = {
            ...(partial ?? {}),
            ...lengthResolved,
            stormCollar: false,
            centered: collar.centered,
          };
        }
      }
    }

    if (partial) {
      setCollar(id, partial);
    }
  }, [
    collar.centered,
    collar.dia,
    collar.offset1,
    collar.offset2,
    collar.offset3,
    collar.offset4,
    collar.rectLength,
    collar.rectWidth,
    collar.shape,
    collar.stormCollar,
    config.collarA,
    config.collarB,
    config.collarC,
    config.holes,
    config.l,
    config.w,
    id,
    setCollar,
  ]);

  function handleCenteredChange(newCentered: boolean) {
    if (!newCentered) {
      const hole = holeWorld(id, config);
      const w = config.w;
      const l = config.l;
      const halfX = hole.halfX / SC;
      const halfZ = hole.halfZ / SC;
      // Use exact values (no 1/8" rounding) so the visual position doesn't shift
      const clamp0 = (v: number) => Math.max(0, v);
      setCollar(id, {
        centered: false,
        offset1: clamp0(w / 2 - halfX - hole.wx / SC),
        offset2: clamp0(l / 2 - halfZ - hole.wz / SC),
        offset3: clamp0(hole.wx / SC + w / 2 - halfX),
        offset4: clamp0(hole.wz / SC + l / 2 - halfZ),
      });
    } else {
      setCollar(id, { centered: true });
    }
  }

  function handleShapeChange(newShape: HoleShape) {
    if (newShape === collar.shape) return;

    if (newShape === 'rect') {
      let workingConfig = buildConfigWithCollar(config, id, {
        shape: 'rect',
        stormCollar: false,
        rectWidth: Math.max(MIN_SIZE, snapDownToEighth(collar.rectWidth || collar.dia)),
        rectLength: Math.max(MIN_SIZE, snapDownToEighth(collar.rectLength || collar.dia)),
      });

      const widthResolved = resolveRectAxis(workingConfig, id, 'rectWidth', getCollarState(workingConfig, id).rectWidth);
      if (!widthResolved) return;
      workingConfig = buildConfigWithCollar(workingConfig, id, widthResolved);

      const lengthResolved = resolveRectAxis(workingConfig, id, 'rectLength', getCollarState(workingConfig, id).rectLength);
      if (!lengthResolved) return;

      setCollar(id, {
        shape: 'rect',
        stormCollar: false,
        ...widthResolved,
        ...lengthResolved,
      });
      return;
    }

    const baseDia = snapDownToEighth(Math.max(MIN_SIZE, Math.min(collar.dia || Math.min(collar.rectWidth, collar.rectLength), config.w, config.l)));
    const workingConfig = buildConfigWithCollar(config, id, {
      shape: 'round',
      dia: baseDia,
    });
    const resolved = resolveRoundDiameter(workingConfig, id, baseDia);
    if (!resolved) return;

    setCollar(id, {
      shape: 'round',
      ...resolved,
    });
  }

  function handleDiaChange(newDia: number) {
    const resolved = resolveRoundDiameter(config, id, newDia);
    if (!resolved) return;

    setCollar(id, {
      shape: 'round',
      ...resolved,
      centered: collar.centered,
    });
  }

  function handleRectAxisChange(axis: 'rectWidth' | 'rectLength', value: number) {
    const resolved = resolveRectAxis(config, id, axis, value);
    if (!resolved) return;

    setCollar(id, {
      shape: 'rect',
      stormCollar: false,
      ...resolved,
      centered: collar.centered,
    });
  }

  function commitManualOffsets(partial: Partial<CollarState>) {
    const resolved = resolveManualOffsets(config, id, partial);
    if (!resolved) return;

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
      offset1: Math.max(0, config.w - size.sizeX - next),
    });
  }

  function commitBottom(value: number) {
    const next = Math.min(value, maxW);
    commitManualOffsets({
      offset1: next,
      offset3: Math.max(0, config.w - size.sizeX - next),
    });
  }

  function commitRight(value: number) {
    const next = Math.min(value, maxL);
    commitManualOffsets({
      offset4: next,
      offset2: Math.max(0, config.l - size.sizeZ - next),
    });
  }

  function commitLeft(value: number) {
    const next = Math.min(value, maxL);
    commitManualOffsets({
      offset2: next,
      offset4: Math.max(0, config.l - size.sizeZ - next),
    });
  }

  return (
    <div className="collar-group">
      <div className="collar-group-title">{label}</div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center' }}>
          Hole Shape
          <InfoTooltip text="Round holes use diameter. Rectangular holes switch the cutout and collar to length and width while keeping the same offset workflow." />
        </label>
        <ShapeToggle value={collar.shape} onChange={handleShapeChange} />
      </div>

      <div className="collar-options-row">
        <label className="centered-check" style={{ display: 'flex', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={collar.centered}
            onChange={e => handleCenteredChange(e.target.checked)}
          />
          Centered on Cover
          <InfoTooltip text="When centered, the hole is automatically placed at the center slot for the selected cover layout. Uncheck to set custom offsets from each edge." />
        </label>
        <label className={`centered-check${collar.shape === 'rect' ? ' centered-check-disabled' : ''}`} style={{ display: 'flex', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={collar.shape === 'rect' ? false : collar.stormCollar || false}
            disabled={collar.shape === 'rect'}
            onChange={e => setCollar(id, { stormCollar: e.target.checked })}
          />
          Add Storm Collar
          <InfoTooltip text={collar.shape === 'rect'
            ? 'Storm collars are available for round holes only.'
            : 'Adds a conical metal flashing at the base of the collar that sheds water away from the pipe penetration. The storm collar top opening is 1 inch smaller than the flue hole diameter.'}
          />
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

      {collar.shape === 'round' ? (
        <div className="field-row">
          <CollarInput
            label="Diameter (in)"
            value={collar.dia}
            min={MIN_SIZE}
            max={maxDiaInput}
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
      ) : (
        <div className="hole-size-row-rect">
          <CollarInput
            label="Length (in)"
            value={collar.rectLength}
            min={MIN_SIZE}
            max={maxRectLengthInput}
            onCommit={value => handleRectAxisChange('rectLength', value)}
            tooltip="Rectangular opening size along the cover length."
          />
          <CollarInput
            label="Width (in)"
            value={collar.rectWidth}
            min={MIN_SIZE}
            max={maxRectWidthInput}
            onCommit={value => handleRectAxisChange('rectWidth', value)}
            tooltip="Rectangular opening size along the cover width."
          />
          <CollarInput
            label="Collar Height (in)"
            value={collar.height}
            min={1}
            max={52}
            onCommit={value => setCollar(id, { height: value })}
            tooltip="Height of the rectangular collar sleeve above the cover surface."
          />
        </div>
      )}

      {!collar.centered && (
        <div className="offset-grid">
          <div className="field-row">
            <CollarInput
              label={`${id}1 (Top edge -> hole)`}
              value={collar.offset3}
              min={0}
              max={maxW}
              onCommit={commitTop}
            />
            <CollarInput
              label={`${id}3 (Bottom edge -> hole)`}
              value={collar.offset1}
              min={0}
              max={maxW}
              onCommit={commitBottom}
            />
          </div>
          <div className="field-row">
            <CollarInput
              label={`${id}2 (Right edge -> hole)`}
              value={collar.offset4}
              min={0}
              max={maxL}
              onCommit={commitRight}
            />
            <CollarInput
              label={`${id}4 (Left edge -> hole)`}
              value={collar.offset2}
              min={0}
              max={maxL}
              onCommit={commitLeft}
            />
          </div>
        </div>
      )}
    </div>
  );
}
