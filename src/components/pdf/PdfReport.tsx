import { useConfigStore } from '../../store/configStore';
import type { CollarState } from '../../store/configStore';
import { getHoleEdgeOffsets, getHoleSizeInches, holeWorld, SC } from '../../utils/geometry';

function formatHoleDetails(collar: CollarState) {
  const size = getHoleSizeInches(collar);
  return collar.shape === 'rect'
    ? `${size.sizeZ}" L x ${size.sizeX}" W, ${collar.height}" Height`
    : `${collar.dia}" Dia, ${collar.height}" Height`;
}

export function PdfReport() {
  const config = useConfigStore();

  const formatPrice = (p: number) => `$${p.toFixed(2)}`;
  const MAX_SVG_WIDTH = 450;
  const MAX_SVG_HEIGHT = 250;
  const L = config.l;
  const W = config.w;
  const scale = Math.min(MAX_SVG_WIDTH / L, MAX_SVG_HEIGHT / W);
  const drawW = L * scale;
  const drawH = W * scale;
  const cx = MAX_SVG_WIDTH / 2;
  const cy = MAX_SVG_HEIGHT / 2;
  const rectX = cx - drawW / 2;
  const rectY = cy - drawH / 2;

  const renderHoles = () => {
    const ids: Array<'A' | 'B' | 'C'> = [];
    if (config.holes >= 1) ids.push('A');
    if (config.holes >= 2) ids.push('B');
    if (config.holes === 3) ids.push('C');

    return ids.map(id => {
      const collar = id === 'A' ? config.collarA : id === 'B' ? config.collarB : config.collarC;
      const hole = holeWorld(id, config);
      const offsets = getHoleEdgeOffsets(hole, config);
      const centerFromLeft = config.l / 2 - hole.wz / SC;
      const centerFromTop = config.w / 2 + hole.wx / SC;
      const hx = rectX + centerFromLeft * scale;
      const hy = rectY + centerFromTop * scale;
      const widthPx = (hole.sizeZ / SC) * scale;
      const heightPx = (hole.sizeX / SC) * scale;
      const showArrows = !collar.centered;

      return (
        <g key={id} data-x={centerFromLeft} data-y={centerFromTop}>
          {showArrows && (
            <>
              <line x1={rectX} y1={hy} x2={hx - widthPx / 2 - 2} y2={hy} stroke="#888" strokeWidth="1" markerEnd="url(#arrow)" markerStart="url(#arrow)" />
              <text x={rectX + ((offsets.left * scale) / 2)} y={hy - 4} fontSize="10" fill="#666" textAnchor="middle">{id}4: {offsets.left}"</text>

              <line x1={hx} y1={rectY + drawH} x2={hx} y2={hy + heightPx / 2 + 2} stroke="#888" strokeWidth="1" markerEnd="url(#arrow)" markerStart="url(#arrow)" />
              <text x={hx + 4} y={rectY + drawH - ((offsets.bottom * scale) / 2)} fontSize="10" fill="#666" alignmentBaseline="middle">{id}3: {offsets.bottom}"</text>
            </>
          )}

          {collar.shape === 'rect' ? (
            <rect
              x={hx - widthPx / 2}
              y={hy - heightPx / 2}
              width={widthPx}
              height={heightPx}
              fill="white"
              stroke="black"
              strokeWidth="2"
            />
          ) : (
            <circle cx={hx} cy={hy} r={(hole.radius / SC) * scale} fill="white" stroke="black" strokeWidth="2" />
          )}
          <text x={hx} y={hy + 4} fontSize="12" fontWeight="bold" textAnchor="middle" fill="black">{id}</text>
        </g>
      );
    });
  };

  return (
    <div
      id="print-mount"
      style={{
        width: '800px',
        padding: '50px',
        background: 'white',
        color: '#111',
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '30px', borderBottom: '2px solid #333', paddingBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '36px', fontWeight: '900', letterSpacing: '2px' }}>KAMINOS</h1>
        <h2 style={{ margin: '10px 0 0 0', fontSize: '18px', fontWeight: 'normal', color: '#555' }}>Chase Cover Specification & Pricing Worksheet</h2>
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '20px', fontSize: '14px', color: '#666' }}>
          <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '40px' }}>
        <div style={{ flex: '1.2' }}>
          <div style={{ marginBottom: '25px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', color: '#555', borderBottom: '1px solid #ddd', paddingBottom: '5px' }}>Configuration Blueprint</h3>
            <div style={{ border: '2px solid #222', padding: '15px' }}>
              <svg width={MAX_SVG_WIDTH} height={MAX_SVG_HEIGHT} style={{ display: 'block', margin: '0 auto' }}>
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#888" />
                  </marker>
                </defs>
                <rect x={rectX} y={rectY} width={drawW} height={drawH} fill="#f8f9fa" stroke="#222" strokeWidth="2" />
                {renderHoles()}
                <text x={cx} y={rectY - 14} fontSize="13" fontWeight="bold" textAnchor="middle" fill="#444">L: {config.l}"</text>
                <text x={rectX - 14} y={cy} fontSize="13" fontWeight="bold" textAnchor="middle" fill="#444" transform={`rotate(-90 ${rectX - 14} ${cy})`}>W: {config.w}"</text>
              </svg>
            </div>
          </div>

          <div style={{ fontSize: '14px', lineHeight: '1.8' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', color: '#555', borderBottom: '1px solid #ddd', paddingBottom: '5px' }}>Specifications</h3>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '4px 0', width: '35%', color: '#666' }}>Dimensions</td>
                  <td style={{ padding: '4px 0', fontWeight: '500' }}>{config.w}" W &times; {config.l}" L &times; {config.sk}" Skirt</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 0', color: '#666' }}>Skirt Options</td>
                  <td style={{ padding: '4px 0', fontWeight: '500' }}>{config.drip ? 'Drip Edge' : 'No Drip Edge'} &nbsp;|&nbsp; {config.diag ? 'Crossbreak' : 'Flat'}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 0', color: '#666' }}>Material</td>
                  <td style={{ padding: '4px 0', fontWeight: '500' }}>{config.gauge} Ga. {config.mat === 'galvanized' ? 'Stainless / Galvanized' : 'Copper'}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 0', color: '#666' }}>Powder Coat</td>
                  <td style={{ padding: '4px 0', fontWeight: '500' }}>{config.pc ? `Yes (${config.pcCol})` : 'No'}</td>
                </tr>
              </tbody>
            </table>

            {config.holes > 0 && (
              <>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', color: '#555', borderBottom: '1px solid #ddd', paddingBottom: '5px' }}>Hole Details</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {config.holes >= 1 && (
                      <tr>
                        <td style={{ padding: '4px 0', width: '15%', fontWeight: 'bold' }}>Hole A</td>
                        <td style={{ padding: '4px 0' }}>{formatHoleDetails(config.collarA)} {!config.collarA.centered && <span style={{ color: '#666', fontSize: '12px' }}>- Offset (A4: {config.collarA.offset2}", A3: {config.collarA.offset1}")</span>}</td>
                      </tr>
                    )}
                    {config.holes >= 2 && (
                      <tr>
                        <td style={{ padding: '4px 0', fontWeight: 'bold' }}>Hole B</td>
                        <td style={{ padding: '4px 0' }}>{formatHoleDetails(config.collarB)} {!config.collarB.centered && <span style={{ color: '#666', fontSize: '12px' }}>- Offset (B4: {config.collarB.offset2}", B3: {config.collarB.offset1}")</span>}</td>
                      </tr>
                    )}
                    {config.holes === 3 && (
                      <tr>
                        <td style={{ padding: '4px 0', fontWeight: 'bold' }}>Hole C</td>
                        <td style={{ padding: '4px 0' }}>{formatHoleDetails(config.collarC)} {!config.collarC.centered && <span style={{ color: '#666', fontSize: '12px' }}>- Offset (C4: {config.collarC.offset2}", C3: {config.collarC.offset1}")</span>}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>

        <div style={{ flex: '0.8', display: 'flex', flexDirection: 'column' }}>
          <div style={{ border: '2px solid #222', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ background: '#222', color: '#fff', padding: '12px 15px', fontWeight: 'bold', fontSize: '14px', letterSpacing: '1px', textTransform: 'uppercase' }}>
              Price Breakdown
            </div>
            <div style={{ padding: '20px 15px', fontSize: '14px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 0', color: '#444' }}>Base Chase Cover</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: '500' }}>Included</td>
                  </tr>
                  {config.holes > 0 && (
                    <tr>
                      <td style={{ padding: '6px 0', color: '#444' }}>Holes / Collars (&times;{config.holes})</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: '500' }}>Added</td>
                    </tr>
                  )}
                  {config.sk > 3 && (
                    <tr>
                      <td style={{ padding: '6px 0', color: '#444' }}>Extended Skirt ({config.sk}")</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: '500' }}>Added</td>
                    </tr>
                  )}
                  {config.pc && (
                    <tr>
                      <td style={{ padding: '6px 0', color: '#444' }}>Powder Coating</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: '500' }}>Added</td>
                    </tr>
                  )}
                  {config.mat === 'copper' && (
                    <tr>
                      <td style={{ padding: '6px 0', color: '#444' }}>Premium Material (Copper)</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: '500' }}>Added</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ padding: '6px 0', color: '#444' }}>Gauge Multiplier ({config.gauge} Ga.)</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: '500' }}>Applied</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ borderTop: '1px solid #ddd', margin: '15px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '14px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unit Price</span>
                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{formatPrice(config.price)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <span style={{ fontSize: '14px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quantity</span>
                <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{config.quantity}</span>
              </div>

              <div style={{ borderTop: '2px solid #222', margin: '15px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8f9fa', padding: '15px', borderRadius: '4px', border: '1px solid #eee' }}>
                <span style={{ fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Total</span>
                <span style={{ fontSize: '24px', fontWeight: '900', color: '#111' }}>{formatPrice(config.price * config.quantity)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
