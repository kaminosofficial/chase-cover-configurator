import { useState } from 'react';
import { DimensionFields } from './DimensionField';
import { HoleSelector } from './HoleSelector';
import { CollarGroup } from './CollarGroup';
import { MaterialChips } from './MaterialChips';
import { GaugeSelect } from './GaugeSelect';
import { ToggleRow } from './ToggleRow';
import { PowderCoatSection } from './PowderCoatSection';
import { PriceDisplay } from './PriceDisplay';
import { CartRow } from './CartRow';
import { NotesField } from './NotesField';
import { useConfigStore } from '../../store/configStore';
import { PRICING, getStormCollarPrice } from '../../config/pricing';
import { InfoTooltip } from './InfoTooltip';

interface SidebarProps {
  descExpanded: boolean;
  setDescExpanded: (v: boolean) => void;
  bdOpen: boolean;
  setBdOpen: (v: boolean) => void;
  onOpenRal: () => void;
  onAddToCart: () => void;
  onBuyNow: () => void;
  isSubmitting?: boolean;
  submittingAction?: 'cart' | 'buy' | null;
}

function fmt(n: number) { return '$' + n.toFixed(2); }

export function Sidebar({ descExpanded, setDescExpanded, bdOpen, setBdOpen, onOpenRal, onAddToCart, onBuyNow, isSubmitting = false, submittingAction = null }: SidebarProps) {
  const config = useConfigStore(s => s);
  const holes = config.holes;
  const pc = config.pc;

  const [introExpanded, setIntroExpanded] = useState(true);

  // Price breakdown rows
  const base = PRICING.AREA_RATE * config.w * config.l + PRICING.LINEAR_RATE * (config.w + config.l) + PRICING.BASE_FIXED;
  const holeAmt = holes * PRICING.HOLE_PRICE;
  const skirtAmt = config.sk >= PRICING.SKIRT_THRESHOLD ? PRICING.SKIRT_SURCHARGE : 0;
  const pcAmt = pc && config.mat !== 'copper' ? PRICING.POWDER_COAT : 0;

  // Per-hole storm collar costs (only for holes with storm collar enabled)
  const holeLabels = holes === 1
    ? ['Hole 1']
    : holes === 2
      ? ['Hole 1', 'Hole 2']
      : ['Hole 1', 'Hole 2', 'Hole 3'];
  const activeCollars = [config.collarA, config.collarB, config.collarC].slice(0, holes);
  const scItems = activeCollars
    .map((c, i) => ({ label: holeLabels[i], price: c.stormCollar && c.shape !== 'rect' ? getStormCollarPrice(c.dia) : 0 }))
    .filter(item => item.price > 0);
  const scTotal = scItems.reduce((sum, item) => sum + item.price, 0);

  const subtotal = base + holeAmt + scTotal + skirtAmt + pcAmt;
  const gaugeMult = PRICING.GAUGE_MULT[config.gauge] || 1;
  const matMult = PRICING.MATERIAL_MULT[config.mat] || 1;
  const total = subtotal * gaugeMult * matMult;

  const bdRows: { label: string; value: string; cls: string }[] = [
    { label: `Base Price (${config.w}" x ${config.l}")`, value: fmt(base), cls: 'bd-row' },
    { label: `${holes} Flue Hole${holes !== 1 ? 's' : ''}`, value: fmt(holeAmt), cls: 'bd-row' },
    ...scItems.map(item => ({
      label: `Storm Collar - ${item.label}`,
      value: fmt(item.price),
      cls: 'bd-row',
    })),
    ...(skirtAmt ? [{ label: 'Oversized Skirt Surcharge', value: fmt(skirtAmt), cls: 'bd-row' }] : []),
    ...(pcAmt ? [{ label: 'Powder Coating', value: fmt(pcAmt), cls: 'bd-row' }] : []),
    { label: 'Subtotal', value: fmt(subtotal), cls: 'bd-sub' },
    ...(gaugeMult !== 1 ? [{ label: `${config.gauge} ga Material`, value: 'x ' + gaugeMult.toFixed(2), cls: 'bd-row' }] : []),
    ...(matMult !== 1 ? [{ label: config.mat === 'copper' ? 'Copper' : 'Galvanized Steel', value: 'x ' + matMult.toFixed(2), cls: 'bd-row' }] : []),
    { label: 'TOTAL ESTIMATE', value: fmt(total), cls: 'bd-total' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-scroll">
        <section className={`project-info-card${introExpanded ? ' open' : ''}`}>
          <button
            className={`project-info-toggle${introExpanded ? ' open' : ''}`}
            onClick={() => setIntroExpanded(!introExpanded)}
            aria-expanded={introExpanded}
            aria-controls="project-info-panel"
          >
            <span className="project-info-toggle-text">Project Info &amp; Instructions</span>
            <span className="project-info-toggle-icon" aria-hidden="true" />
          </button>

          {introExpanded && (
            <div id="project-info-panel" className="project-info-body">
              <div className="product-desc">
                <div className={`product-desc-text${descExpanded ? ' expanded' : ''}`}>
                  Kaminos chase covers are custom-fabricated to your exact measurements for a precise,
                  weatherproof fit. Choose from premium galvanized steel or copper - each built to
                  outlast and outperform standard covers. Add diagonal creases for improved water
                  drainage and a drip edge for extra protection. Backed by our lifetime warranty
                  against rust and corrosion.
                </div>
                <button className="desc-toggle" onClick={() => setDescExpanded(!descExpanded)}>
                  {descExpanded ? 'Show Less' : 'Read More'}
                </button>
              </div>

              <div className="measure-note">
                You must add an extra <strong>1/4"</strong> to both the length and width measurements for proper
                fitment. If you need a custom shape, please <a href="tel:+18887779789">give us a call</a>.{' '}
                Need help measuring? <a href="https://kaminos.com/measuring-guide" target="_blank" rel="noreferrer">Click here</a>.
              </div>
            </div>
          )}
        </section>

        <div className="section">
          <div className="section-title">Cover Dimensions</div>
          <DimensionFields />
          <label className="centered-check" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={config.showLabels}
              onChange={e => config.set({ showLabels: e.target.checked })}
            />
            Show Side Labels (Top / Right / Bottom / Left)
          </label>
        </div>

        <div className="section">
          <div className="section-title">Options</div>
          <ToggleRow id="drip" label="Drip Edge" tooltip="A drip edge extends beyond the skirt at a 45-degree angle, directing rainwater away from the chase to prevent water damage." />
          <ToggleRow id="diag" label="Diagonal Crease" tooltip="Diagonal creases from each corner create a peaked surface that channels water and debris off the cover." />
        </div>

        <div className="section">
          <div className="section-title">
            Flue Holes
            <InfoTooltip text="Flue holes accommodate chimney pipes passing through the cover. Select how many openings your chase requires." />
          </div>
          <HoleSelector />
          {holes >= 1 && <CollarGroup id="A" label="Hole 1 (Left)" />}
          {holes >= 2 && <CollarGroup id="B" label={holes === 2 ? 'Hole 2 (Right)' : 'Hole 2 (Middle)'} />}
          {holes === 3 && <CollarGroup id="C" label="Hole 3 (Right)" />}
        </div>

        <div className="section">
          <div className="section-title">
            Material &amp; Gauge
            <InfoTooltip text="Galvanized steel is durable and cost-effective. Copper develops a natural patina over time and offers superior longevity." />
          </div>
          <MaterialChips />
          <div className="field-row" style={{ marginTop: 10 }}>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center' }}>
                Gauge
                <InfoTooltip text="Gauge indicates metal thickness - lower numbers are thicker and more durable. 24ga is standard for most residential applications." />
              </label>
              <GaugeSelect />
            </div>
          </div>
        </div>

        {config.mat !== 'copper' && (
          <div className="section">
            <div className="section-title">POWDER COATING</div>
            <ToggleRow id="pc" label="Color Options" tooltip="Powder coating adds a baked-on color finish for UV protection and a custom appearance." />
            {pc && <PowderCoatSection onOpenRal={onOpenRal} />}
          </div>
        )}

        <div className="section">
          <div className="section-title">Special Notes</div>
          <NotesField />
        </div>
      </div>

      <div className="price-bar">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <button
            className={`bd-toggle${bdOpen ? ' open' : ''}`}
            onClick={() => setBdOpen(!bdOpen)}
            style={{ marginBottom: 0 }}
          >
            <span>{bdOpen ? '\u25BC' : '\u25B2'}</span> Price Breakdown
          </button>
          <PriceDisplay />
        </div>

        <div className={`bd-panel${bdOpen ? ' open' : ''}`}>
          {bdRows.map((row, i) => (
            <div key={i} className={row.cls}>
              <span>{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
        <CartRow onAddToCart={onAddToCart} onBuyNow={onBuyNow} isSubmitting={isSubmitting} submittingAction={submittingAction} />
      </div>
    </div>
  );
}
