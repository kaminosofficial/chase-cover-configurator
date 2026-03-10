import { Html, Line } from '@react-three/drei';
import { useConfigStore } from '../../store/configStore';
import { getDiagonalSlopeRise, holeWorld, SC } from '../../utils/geometry';
import { formatFrac } from '../../utils/format';

const HOLE_COLOR: Record<string, string> = {
    A: '#facc15', // yellow
    B: '#38bdf8', // sky blue
    C: '#4ade80', // green
};

const HOLE_Y_OFFSET = 0.013;
const ARROW_LEN = 0.018;
const ARROW_HALF_W = 0.006;

export function DimensionOverlay() {
    const config = useConfigStore(s => s);

    const W = config.w * SC;
    const L = config.l * SC;
    const skH = config.sk * SC;
    const SLOPE = config.diag ? getDiagonalSlopeRise(W, L) : 0;
    const baseY = skH + SLOPE + 0.018;

    // --- Side labels: Top=-W/2(left in 3D), Right=-L/2(back), Bottom=+W/2(right), Left=+L/2(front) ---
    const showSideLabels = config.showLabels && config.holes > 0;
    const sideLabelY = baseY + 0.005;
    const sideLabels = showSideLabels ? [
        { key: 'side-top', label: 'Top', pos: [-W / 2 - 0.04, sideLabelY, 0] as [number, number, number] },
        { key: 'side-right', label: 'Right', pos: [0, sideLabelY, -L / 2 - 0.04] as [number, number, number] },
        { key: 'side-bottom', label: 'Bottom', pos: [W / 2 + 0.04, sideLabelY, 0] as [number, number, number] },
        { key: 'side-left', label: 'Left', pos: [0, sideLabelY, L / 2 + 0.04] as [number, number, number] },
    ] : [];

    const holeIds: ('A' | 'B' | 'C')[] = [];
    if (config.holes >= 1) holeIds.push('A');
    if (config.holes >= 2) holeIds.push('B');
    if (config.holes === 3) holeIds.push('C');

    return (
        <>
            {sideLabels.map(sl => (
                <Html key={sl.key} position={sl.pos} center zIndexRange={[10, 0]}>
                    <div style={{
                        background: 'rgba(10,10,10,0.82)',
                        color: '#ffffff',
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                        border: '1px solid rgba(255,255,255,0.3)',
                        pointerEvents: 'none',
                        userSelect: 'none',
                        lineHeight: '16px',
                    }}>
                        {sl.label}
                    </div>
                </Html>
            ))}

            {holeIds.map((id, holeIndex) => {
                const collar = id === 'A' ? config.collarA : id === 'B' ? config.collarB : config.collarC;
                const showLabels = id === 'A' ? config.showLabelsA : id === 'B' ? config.showLabelsB : config.showLabelsC;
                if (!showLabels) return null;

                const hole = holeWorld(id, config);
                const color = HOLE_COLOR[id];
                const Y = baseY + holeIndex * HOLE_Y_OFFSET;
                const hx = hole.wx;
                const hz = hole.wz;
                const r = hole.r;

                // Mapping: X1=Top(-W/2), X2=Right(-L/2), X3=Bottom(+W/2), X4=Left(+L/2)
                const dims = [
                    {
                        key: `${id}1`,
                        label: `${id}1`,
                        from: [-W / 2, Y, hz] as [number, number, number],
                        to: [hx - r, Y, hz] as [number, number, number],
                        midX: (-W / 2 + hx - r) / 2,
                        midZ: hz,
                        inches: Math.abs(hole.wx / SC - collar.dia / 2 + config.w / 2),
                        dir: 'x' as const,
                    },
                    {
                        key: `${id}2`,
                        label: `${id}2`,
                        from: [hx, Y, -L / 2] as [number, number, number],
                        to: [hx, Y, hz - r] as [number, number, number],
                        midX: hx,
                        midZ: (-L / 2 + hz - r) / 2,
                        inches: Math.abs(hole.wz / SC - collar.dia / 2 + config.l / 2),
                        dir: 'z' as const,
                    },
                    {
                        key: `${id}3`,
                        label: `${id}3`,
                        from: [W / 2, Y, hz] as [number, number, number],
                        to: [hx + r, Y, hz] as [number, number, number],
                        midX: (W / 2 + hx + r) / 2,
                        midZ: hz,
                        inches: Math.abs(config.w / 2 - (hole.wx / SC + collar.dia / 2)),
                        dir: 'x' as const,
                    },
                    {
                        key: `${id}4`,
                        label: `${id}4`,
                        from: [hx, Y, L / 2] as [number, number, number],
                        to: [hx, Y, hz + r] as [number, number, number],
                        midX: hx,
                        midZ: (L / 2 + hz + r) / 2,
                        inches: Math.abs(config.l / 2 - (hole.wz / SC + collar.dia / 2)),
                        dir: 'z' as const,
                    },
                ];

                return dims.map(dim => {
                    const dx = dim.to[0] - dim.from[0];
                    const dz = dim.to[2] - dim.from[2];
                    const len = Math.sqrt(dx * dx + dz * dz);
                    if (len < 0.001) return null;

                    const ux = dx / len;
                    const uz = dz / len;
                    const px = -uz;
                    const pz = ux;

                    const arrowFrom1: [number, number, number] = [
                        dim.from[0] + ux * ARROW_LEN + px * ARROW_HALF_W, Y, dim.from[2] + uz * ARROW_LEN + pz * ARROW_HALF_W
                    ];
                    const arrowFrom2: [number, number, number] = [
                        dim.from[0] + ux * ARROW_LEN - px * ARROW_HALF_W, Y, dim.from[2] + uz * ARROW_LEN - pz * ARROW_HALF_W
                    ];
                    const arrowTo1: [number, number, number] = [
                        dim.to[0] - ux * ARROW_LEN + px * ARROW_HALF_W, Y, dim.to[2] - uz * ARROW_LEN + pz * ARROW_HALF_W
                    ];
                    const arrowTo2: [number, number, number] = [
                        dim.to[0] - ux * ARROW_LEN - px * ARROW_HALF_W, Y, dim.to[2] - uz * ARROW_LEN - pz * ARROW_HALF_W
                    ];

                    const displayInches = formatFrac(dim.inches) + '"';

                    return (
                        <group key={dim.key}>
                            <Line points={[dim.from, dim.to]} color={color} lineWidth={1.2} dashed dashSize={0.012} gapSize={0.006} />
                            <Line points={[arrowFrom1, dim.from, arrowFrom2]} color={color} lineWidth={1.5} />
                            <Line points={[arrowTo1, dim.to, arrowTo2]} color={color} lineWidth={1.5} />
                            <Html position={[dim.midX, Y + 0.022, dim.midZ]} center zIndexRange={[10, 0]}>
                                <div style={{
                                    background: 'rgba(10,10,10,0.72)',
                                    color,
                                    padding: '2px 6px',
                                    borderRadius: 3,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    whiteSpace: 'nowrap',
                                    border: `1px solid ${color}55`,
                                    pointerEvents: 'none',
                                    userSelect: 'none',
                                    lineHeight: '14px',
                                }}>
                                    {dim.label}: {displayInches}
                                </div>
                            </Html>
                        </group>
                    );
                });
            })}
        </>
    );
}
