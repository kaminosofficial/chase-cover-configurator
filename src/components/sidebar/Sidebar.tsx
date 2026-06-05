import { DimensionFields } from './DimensionField';
import { HoleSelector } from './HoleSelector';
import { CollarGroup } from './CollarGroup';
import { MaterialChips } from './MaterialChips';
import { GaugeSelect } from './GaugeSelect';
import { ToggleRow } from './ToggleRow';
import { PowderCoatSection } from './PowderCoatSection';
import { PriceDisplay } from './PriceDisplay';
import { CartRow } from './CartRow';
import { useConfigStore } from '../../store/configStore';
import { InfoTooltip } from './InfoTooltip';

interface SidebarProps {
  onOpenRal: () => void;
  onAddToCart: () => void;
  onBuyNow: () => void;
  isSubmitting?: boolean;
  submittingAction?: 'cart' | 'buy' | null;
  submittingStep?: string;
}

export function Sidebar({ onOpenRal, onAddToCart, onBuyNow, isSubmitting = false, submittingAction = null, submittingStep = '' }: SidebarProps) {
  const config = useConfigStore(s => s);
  const holes = config.holes;
  const pc = config.pc;

  return (
    <div className="sidebar">
      <div className={`sidebar-scroll${isSubmitting ? ' sidebar-scroll--disabled' : ''}`}>
        <h1 className="sidebar-main-title">Chase Cover Configurator</h1>

        <div className="section">
          <div className="section-title">
            <span className="section-title-label">Cover Dimensions</span>
          </div>
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
          <div className="section-title">
            <span className="section-title-label">Options</span>
          </div>
          <ToggleRow id="drip" label="Drip Edge" tooltip="A drip edge extends beyond the skirt at a 45-degree angle, directing rainwater away from the chase to prevent water damage." />
          <ToggleRow id="diag" label="Diagonal Crease" tooltip="Diagonal creases from each corner create a peaked surface that channels water and debris off the cover." />
        </div>

        <div className="section">
          <div className="section-title">
            <span className="section-title-label">Flue Holes</span>
            <InfoTooltip text="Flue holes accommodate chimney pipes passing through the cover. Select how many openings your chase requires." />
          </div>
          <HoleSelector />
          {holes >= 1 && <CollarGroup id="A" label="Hole 1" />}
          {holes >= 2 && <CollarGroup id="B" label="Hole 2" />}
          {holes === 3 && <CollarGroup id="C" label="Hole 3" />}
        </div>

        <div className="section">
          <div className="section-title">
            <span className="section-title-label">Material</span>
            <InfoTooltip text="Stainless steel is durable and cost-effective. Copper develops a natural patina over time and offers superior longevity." />
          </div>
          <MaterialChips />
          <div className="field-row section-subgroup section-subgroup--material">
            <div className="field">
              <label className="subsection-label">
                Gauge
                <InfoTooltip text="Gauge indicates metal thickness. 24ga is the lightest option, 22ga is a sturdier upgrade, and 20ga is the heaviest option we offer." />
              </label>
              <GaugeSelect />
            </div>
          </div>
        </div>

        {config.mat !== 'copper' && (
          <div className="section section--powder">
            <div className="section-title">
              <span className="section-title-label">Powder Coating</span>
              <InfoTooltip text="Powder coating adds a baked-on color finish for UV protection and a custom appearance." />
            </div>
            <ToggleRow id="pc" label="Color Options" />
            {pc && <PowderCoatSection onOpenRal={onOpenRal} />}
          </div>
        )}

      </div>

      <div className="price-bar">
        <div className="price-header">
          <PriceDisplay />
        </div>
        <CartRow onAddToCart={onAddToCart} onBuyNow={onBuyNow} isSubmitting={isSubmitting} submittingAction={submittingAction} submittingStep={submittingStep} />
      </div>
    </div>
  );
}
