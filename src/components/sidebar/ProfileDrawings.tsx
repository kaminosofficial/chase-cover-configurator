import { useConfigStore } from '../../store/configStore';
import type { ConfigState } from '../../store/configStore';
import { holeWorld, SC } from '../../utils/geometry';
import { formatFrac } from '../../utils/format';

/**
 * Live 2D worksheet-style drawings (top profile + side profile), matching the
 * Lifetime Chimney Supply paper order forms. Pure SVG derived from the same
 * store the 3D viewer reads, so typing a dimension — or dragging a hole in
 * the 3D viewport — redraws these instantly.
 *
 * Coordinate mapping (derived from CollarGroup's centered→offset conversion):
 *   inches from TOP edge of drawing  = w/2 + wx/SC   (hole center)
 *   inches from LEFT edge of drawing = l/2 - wz/SC   (hole center)
 * The drawing is L wide (horizontal) × W tall (vertical), like the worksheet.
 */

type HoleId = 'A' | 'B' | 'C';
const HOLE_NUM: Record<HoleId, number> = { A: 1, B: 2, C: 3 };

const RED = '#c0392b';
const BLUE = '#2779bd';
const INK = '#4a443d';
const GHOST = '#c4bcb0';

interface HoleGeom {
  id: HoleId;
  shape: 'round' | 'rect';
  cx: number;      // inches from left edge
  cy: number;      // inches from top edge
  halfH: number;   // half-extent horizontal (along L), inches
  halfV: number;   // half-extent vertical (along W), inches
  height: number;  // collar height, inches
  storm: boolean;
  dia: number;
}

function activeHoleGeoms(config: ConfigState): HoleGeom[] {
  const ids: HoleId[] = [];
  if (config.holes >= 1) ids.push('A');
  if (config.holes >= 2) ids.push('B');
  if (config.holes === 3) ids.push('C');
  return ids.map(id => {
    const h = holeWorld(id, config);
    const collar = config[`collar${id}` as 'collarA' | 'collarB' | 'collarC'];
    return {
      id,
      shape: h.shape,
      cx: config.l / 2 - h.wz / SC,
      cy: config.w / 2 + h.wx / SC,
      halfH: h.halfZ / SC,
      halfV: h.halfX / SC,
      height: collar.height,
      storm: collar.stormCollar && h.shape === 'round',
      dia: collar.dia,
    };
  });
}

function ArrowDefs({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" fill="context-stroke" />
      </marker>
    </defs>
  );
}

function Dim({ x1, y1, x2, y2, label, color, marker, dx = 0, dy = -5 }: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; color: string; marker: string; dx?: number; dy?: number;
}) {
  return (
    <>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.6}
        markerStart={`url(#${marker})`} markerEnd={`url(#${marker})`} />
      <text x={(x1 + x2) / 2 + dx} y={(y1 + y2) / 2 + dy} fill={color} fontSize={11.5}
        fontWeight={600} textAnchor="middle" fontFamily="var(--font-ui, Inter, sans-serif)">{label}</text>
    </>
  );
}

function coverFill(config: ConfigState): string {
  if (config.mat === 'copper') return '#e7c19f';
  if (config.pc) return `${config.pcCol}33`;
  return '#eceae6';
}

/** Top (plan) profile. Pass activeId to annotate one hole worksheet-style
 *  (TE/BE/LE/RE/D + between-gaps); omit it for the chase-box view (L/W dims). */
export function TopProfile({ activeId }: { activeId?: HoleId }) {
  const config = useConfigStore(s => s);
  const { l: L, w: W } = config;
  const geoms = activeHoleGeoms(config);
  const PAD = 34, PADR = 64, VW = 430;
  const sc = (VW - PAD - PADR) / L;
  const w = L * sc, h = W * sc;
  const VH = h + PAD + 44;
  const X = (x: number) => PAD + x * sc;
  const Y = (y: number) => PAD + y * sc;
  const mk = `arr-top-${activeId ?? 'box'}`;
  const active = geoms.find(g => g.id === activeId);

  return (
    <div className="profile-drawing">
      <div className="profile-drawing-caption">
        {active ? `Hole #${HOLE_NUM[active.id]} — top profile` : 'Top profile'}
      </div>
      <svg viewBox={`0 0 ${VW} ${VH}`} xmlns="http://www.w3.org/2000/svg">
        <ArrowDefs id={mk} />
        <rect x={PAD} y={PAD} width={w} height={h} fill={coverFill(config)} stroke={INK} strokeWidth={2} rx={2} />
        {config.diag && (
          <>
            <line x1={PAD} y1={PAD} x2={PAD + w} y2={PAD + h} stroke="#b9b2a7" strokeWidth={1} strokeDasharray="5 4" />
            <line x1={PAD + w} y1={PAD} x2={PAD} y2={PAD + h} stroke="#b9b2a7" strokeWidth={1} strokeDasharray="5 4" />
          </>
        )}
        {config.mountTop && (() => {
          const m = 2 * sc, r = Math.max(2.2, 0.125 * sc * 4);
          return [[X(0) + m, Y(0) + m], [X(L) - m, Y(0) + m], [X(0) + m, Y(W) - m], [X(L) - m, Y(W) - m]]
            .map(([px, py], i) => <circle key={i} cx={px} cy={py} r={r} fill="#fff" stroke={INK} strokeWidth={1.4} />);
        })()}
        {geoms.map(g => {
          const on = !activeId || g.id === activeId;
          const stroke = on ? INK : GHOST;
          return g.shape === 'round' ? (
            <circle key={g.id} cx={X(g.cx)} cy={Y(g.cy)} r={g.halfH * sc} fill="#fff" stroke={stroke} strokeWidth={on ? 2 : 1.6} />
          ) : (
            <rect key={g.id} x={X(g.cx - g.halfH)} y={Y(g.cy - g.halfV)} width={g.halfH * 2 * sc} height={g.halfV * 2 * sc}
              fill="#fff" stroke={stroke} strokeWidth={on ? 2 : 1.6} rx={2} />
          );
        })}
        {!active && (
          <>
            <Dim x1={X(0)} y1={Y(W) + 18} x2={X(L)} y2={Y(W) + 18} label={`L ${formatFrac(L)}″`} color={RED} marker={mk} dy={16} />
            <Dim x1={X(L) + 18} y1={Y(0)} x2={X(L) + 18} y2={Y(W)} label={`W ${formatFrac(W)}″`} color={RED} marker={mk} dx={22} dy={3} />
          </>
        )}
        {active && (() => {
          const n = HOLE_NUM[active.id];
          const te = active.cy - active.halfV, be = W - active.cy - active.halfV;
          const le = active.cx - active.halfH, re = L - active.cx - active.halfH;
          const idx = geoms.findIndex(g => g.id === active.id);
          const prev = idx > 0 ? geoms[idx - 1] : null;
          const sizeLabel = active.shape === 'round'
            ? `D${n} ${formatFrac(active.dia)}″`
            : `${formatFrac(active.halfH * 2)}″×${formatFrac(active.halfV * 2)}″`;
          return (
            <>
              <Dim x1={X(active.cx)} y1={Y(0)} x2={X(active.cx)} y2={Y(te)} label={`TE${n} ${formatFrac(te)}″`} color={BLUE} marker={mk} dx={30} dy={3} />
              <Dim x1={X(active.cx)} y1={Y(active.cy + active.halfV)} x2={X(active.cx)} y2={Y(W)} label={`BE${n} ${formatFrac(be)}″`} color={BLUE} marker={mk} dx={30} dy={3} />
              {prev ? (
                <Dim x1={X(prev.cx + prev.halfH)} y1={Y(active.cy)} x2={X(le)} y2={Y(active.cy)}
                  label={`B${n} ${formatFrac(le - (prev.cx + prev.halfH))}″`} color={BLUE} marker={mk} />
              ) : (
                <Dim x1={X(0)} y1={Y(active.cy)} x2={X(le)} y2={Y(active.cy)} label={`LE ${formatFrac(le)}″`} color={BLUE} marker={mk} />
              )}
              <Dim x1={X(active.cx + active.halfH)} y1={Y(active.cy)} x2={X(L)} y2={Y(active.cy)} label={`RE ${formatFrac(re)}″`} color={BLUE} marker={mk} />
              <text x={X(active.cx)} y={Y(active.cy) + 4} fill={INK} fontSize={11.5} fontWeight={700}
                textAnchor="middle" fontFamily="var(--font-ui, Inter, sans-serif)">{sizeLabel}</text>
            </>
          );
        })()}
      </svg>
    </div>
  );
}

/** Side (elevation) profile: skirt strip, collars, storm-collar flanges,
 *  drip-edge flare, skirt mounting holes, S + collar-height dims. */
export function SideProfile({ activeId }: { activeId?: HoleId }) {
  const config = useConfigStore(s => s);
  const { l: L, sk: S } = config;
  const geoms = activeHoleGeoms(config);
  const PAD = 30, PADR = 64, VW = 430;
  const sc = (VW - PAD - PADR) / L;
  const maxC = Math.max(2, ...geoms.map(g => g.height));
  const collarScale = Math.min(sc * 1.4, 44 / Math.max(1, maxC));
  const skirtH = Math.max(S * sc * 1.4, 16);
  const topY = PAD + maxC * collarScale;
  const VH = topY + skirtH + 30;
  const X = (x: number) => PAD + x * sc;
  const mk = `arr-side-${activeId ?? 'box'}`;

  return (
    <div className="profile-drawing">
      <div className="profile-drawing-caption">
        {activeId ? `Hole #${HOLE_NUM[activeId]} — side profile` : 'Side profile'}
      </div>
      <svg viewBox={`0 0 ${VW} ${VH}`} xmlns="http://www.w3.org/2000/svg">
        <ArrowDefs id={mk} />
        <rect x={PAD} y={topY} width={L * sc} height={skirtH} fill={coverFill(config)} stroke={INK} strokeWidth={2} />
        {config.drip && (
          <path d={`M ${PAD} ${topY + skirtH} l -7 6 M ${PAD + L * sc} ${topY + skirtH} l 7 6`}
            stroke={INK} strokeWidth={2} fill="none" />
        )}
        {geoms.map(g => {
          const wpx = g.halfH * 2 * sc;
          const hpx = Math.max(g.height * collarScale, 6);
          const on = !activeId || g.id === activeId;
          const stroke = on ? INK : GHOST;
          return (
            <g key={g.id}>
              <rect x={X(g.cx) - wpx / 2} y={topY - hpx} width={wpx} height={hpx} fill="#fff" stroke={stroke} strokeWidth={on ? 2 : 1.6} />
              {g.storm && <path d={`M ${X(g.cx) - wpx / 2 - 6} ${topY - hpx * 0.45} h ${wpx + 12}`} stroke={stroke} strokeWidth={2.4} />}
              {on && activeId && (
                <Dim x1={X(g.cx) + wpx / 2 + 10} y1={topY - hpx} x2={X(g.cx) + wpx / 2 + 10} y2={topY}
                  label={`C${HOLE_NUM[g.id]} ${formatFrac(g.height)}″`} color={BLUE} marker={mk} dx={26} dy={3} />
              )}
            </g>
          );
        })}
        {config.mountSkirt && (() => {
          const r = Math.max(2.2, 0.125 * sc * 4);
          const y = topY + skirtH / 2;
          return [4, L - 4].map((px, i) => <circle key={i} cx={X(px)} cy={y} r={r} fill="#fff" stroke={INK} strokeWidth={1.4} />);
        })()}
        <Dim x1={PAD + L * sc + 16} y1={topY} x2={PAD + L * sc + 16} y2={topY + skirtH}
          label={`S ${formatFrac(S)}″`} color={RED} marker={mk} dx={22} dy={3} />
      </svg>
    </div>
  );
}
