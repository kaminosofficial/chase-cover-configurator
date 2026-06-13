import { useEffect, useState } from 'react';
import { useConfigStore } from '../../store/configStore';
import type { CollarState } from '../../store/configStore';
import { KAMINOS_LOGO_WHITE, getCroppedLogo } from './kaminosLogo';
import { formatFrac } from '../../utils/format';
import { RAL_COLORS } from '../../config/ralColors';

// Human-readable powder-coat label: "Ruby Red (RAL 3002)" (matches the cart
// line item), falling back to the hex if the color isn't a known RAL swatch.
function ralLabel(hex: string): string {
  const match = RAL_COLORS.find(c => c.hex.toLowerCase() === hex.toLowerCase());
  return match ? `${match.name} (${match.ral})` : hex.toUpperCase();
}

// Airy design tokens
const C = {
  ink: '#171411',
  gold: '#C2974A',
  goldSoft: '#D9BC86',
  label: '#8E8E8E',
  value: '#1A1A1A',
  muted: '#9A9690',
  hair: '#E6E4E0',
  hairStrong: '#D8D5CF',
  footerBg: '#EFEDEA',
  cardBg: '#FBFAF8',
  metaUrl: '#9C988F',
};

const FONT = "'Jost', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const pageStyle = {
  width: '794px',
  height: '1123px',
  background: '#ffffff',
  color: C.value,
  fontFamily: FONT,
  boxSizing: 'border-box' as const,
  display: 'flex',
  flexDirection: 'column' as const,
  WebkitFontSmoothing: 'antialiased',
  position: 'relative' as const,
};

const headerStyle = {
  background: C.ink,
  color: '#fff',
  padding: '30px 53px',
  borderBottom: `2.5px solid ${C.gold}`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
};

const notesCardStyle = {
  fontSize: '12px',
  color: '#555',
  lineHeight: 1.6,
  padding: '12px 14px',
  border: `1px solid ${C.hair}`,
  borderRadius: '6px',
  background: C.cardBg,
  marginTop: '8px',
  wordBreak: 'break-word' as const,
  whiteSpace: 'pre-wrap' as const,
};

interface PdfReportProps {
  snapshotUrl?: string;
}

export function PdfReport({ snapshotUrl }: PdfReportProps) {
  const config = useConfigStore();
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const totalPrice = config.price * config.quantity;

  // Same header treatment as the chimney cap configurator: the logo sheet is
  // cropped at runtime into a separate symbol + wordmark (getCroppedLogo);
  // falls back to the full logo image until the crop resolves.
  const [logoAssets, setLogoAssets] = useState<{ symbol: string; text: string } | null>(null);

  useEffect(() => {
    getCroppedLogo().then(setLogoAssets);
  }, []);

  const logoBlock = logoAssets ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
      <img
        src={logoAssets.symbol}
        alt="Kaminos Logo Mark"
        style={{ height: '32px', display: 'block' }}
      />
      <img
        src={logoAssets.text}
        alt="Kaminos"
        style={{ height: '20px', display: 'block' }}
      />
    </div>
  ) : (
    <img
      src={KAMINOS_LOGO_WHITE}
      alt="Kaminos"
      width={171}
      height={61}
      style={{ width: '171px', height: '61px', display: 'block' }}
    />
  );

  const HERO_MAX_W = 440;
  const HERO_MAX_H = 230;
  const [heroDims, setHeroDims] = useState<{ w: number; h: number } | null>(null);

  function onHeroLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    const r = Math.min(HERO_MAX_W / nw, HERO_MAX_H / nh);
    setHeroDims({ w: Math.round(nw * r), h: Math.round(nh * r) });
  }

  const getMaterialName = (mat: 'galvanized' | 'stainless' | 'copper') => {
    if (mat === 'copper') return 'Copper';
    if (mat === 'stainless') return 'Stainless Steel';
    return 'Galvanized Steel';
  };

  const renderCollarOffsets = (id: 'A' | 'B' | 'C', collar: CollarState) => {
    if (collar.centered) return 'Centered';
    return `${id} Top: ${formatFrac(collar.offset3)}", ${id} Right: ${formatFrac(collar.offset4)}", ${id} Bottom: ${formatFrac(collar.offset1)}", ${id} Left: ${formatFrac(collar.offset2)}"`;
  };

  function renderHoleDetails(id: 'A' | 'B' | 'C', collar: CollarState) {
    const sizeStr = collar.shape === 'round'
      ? `${collar.dia}" Dia`
      : `${collar.rectLength}" L x ${collar.rectWidth}" W`;

    return (
      <div key={id} style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: C.gold, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Hole {id === 'A' ? '1' : id === 'B' ? '2' : '3'} ({collar.shape === 'round' ? 'Round' : 'Rectangle'})
        </div>
        <SpecList>
          <SpecRow label="Size" value={sizeStr} />
          <SpecRow label="Collar Height" value={`${collar.height}"`} />
          {collar.shape === 'round' && (
            <SpecRow label="Storm Collar" value={collar.stormCollar ? 'Yes' : 'No'} />
          )}
          <SpecRow label="Position" value={renderCollarOffsets(id, collar)} />
        </SpecList>
      </div>
    );
  }

  const isMultiPage = config.holes > 1;

  if (isMultiPage) {
    return (
      <div id="print-mount" style={{ display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: '#e4e2de' }}>
        
        {/* ── PAGE 1 ── */}
        <div className="pdf-page-render" style={pageStyle}>
          {/* Header */}
          <header style={headerStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'flex-start' }}>
              {logoBlock}
              <div style={{ fontSize: '20px', letterSpacing: '0.18em', textTransform: 'uppercase', color: C.gold, fontWeight: 600, textAlign: 'left' }}>
                Chase Cover Specification
              </div>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>{dateStr}</div>
              <div style={{ fontSize: '12px', color: C.metaUrl, letterSpacing: '0.04em' }}>kaminos.com</div>
            </div>
          </header>

          {/* Snapshot Hero Image */}
          <SnapshotBlock snapshotUrl={snapshotUrl} heroDims={heroDims} onHeroLoad={onHeroLoad} />

          <div style={{ height: '1px', background: C.hair, margin: '0 53px' }} />

          {/* Page 1 Body */}
          <div style={{ flex: '1 1 auto', padding: '28px 53px 28px', display: 'flex', flexDirection: 'row', gap: '60px', alignItems: 'flex-start' }}>
            {/* Left Column: General Dimensions */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <SectionLabel>Dimensions</SectionLabel>
                <SpecList>
                  <SpecRow label="Width" value={`${config.w}"`} />
                  <SpecRow label="Length" value={`${config.l}"`} />
                  <SpecRow label="Skirt Size" value={`${config.sk}"`} />
                  <SpecRow label="Diagonal Creases" value={config.diag ? 'Yes' : 'No'} />
                  <SpecRow label="Drip Edge" value={config.drip ? 'Yes' : 'No'} />
                </SpecList>
              </div>

              {/* Hole 1 Details */}
              <div>
                <SectionLabel>Holes Details</SectionLabel>
                {renderHoleDetails('A', config.collarA)}
              </div>
            </div>

            {/* Right Column: Material & Finish */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <SectionLabel>Material &amp; Finish</SectionLabel>
                <SpecList>
                  <SpecRow label="Material" value={getMaterialName(config.mat)} />
                  <SpecRow label="Gauge" value={`${config.gauge} Gauge`} />
                  <SpecRow label="Powder Coat" value={config.pc ? 'Yes' : 'No'} />
                </SpecList>

                {config.pc && config.pcCol && (
                  <PowderCoatColorCard color={config.pcCol} />
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <FooterBlock pageNum="Page 1 of 2" />
        </div>

        {/* ── PAGE 2 ── */}
        <div className="pdf-page-render" style={pageStyle}>
          {/* Header */}
          <header style={headerStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'flex-start' }}>
              {logoBlock}
              <div style={{ fontSize: '20px', letterSpacing: '0.18em', textTransform: 'uppercase', color: C.gold, fontWeight: 600, textAlign: 'left' }}>
                Chase Cover Specification <span style={{ color: C.goldSoft, fontSize: '14px', textTransform: 'none', marginLeft: '10px' }}>(Continued)</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>{dateStr}</div>
              <div style={{ fontSize: '12px', color: C.metaUrl, letterSpacing: '0.04em' }}>kaminos.com</div>
            </div>
          </header>

          {/* Page 2 Body */}
          <div style={{ flex: '1 1 auto', padding: '40px 53px 28px', display: 'flex', flexDirection: 'row', gap: '60px', alignItems: 'flex-start' }}>
            {/* Left Column: Remaining Holes & Notes */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <SectionLabel>Holes Details (Continued)</SectionLabel>
                {config.holes >= 2 && renderHoleDetails('B', config.collarB)}
                {config.holes === 3 && renderHoleDetails('C', config.collarC)}
              </div>

              {config.notes && (
                <div>
                  <SectionLabel>Special Notes</SectionLabel>
                  <div style={notesCardStyle}>
                    {config.notes}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Pricing Summary */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <PricingCard config={config} totalPrice={totalPrice} />
            </div>
          </div>

          {/* Footer */}
          <FooterBlock pageNum="Page 2 of 2" />
        </div>

      </div>
    );
  }

  // Single Page rendering
  return (
    <div id="print-mount" className="pdf-page-render" style={pageStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'flex-start' }}>
          {logoBlock}
          <div style={{ fontSize: '20px', letterSpacing: '0.18em', textTransform: 'uppercase', color: C.gold, fontWeight: 600, textAlign: 'left' }}>
            Chase Cover Specification
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>{dateStr}</div>
          <div style={{ fontSize: '12px', color: C.metaUrl, letterSpacing: '0.04em' }}>kaminos.com</div>
        </div>
      </header>

      <SnapshotBlock snapshotUrl={snapshotUrl} heroDims={heroDims} onHeroLoad={onHeroLoad} />

      <div style={{ height: '1px', background: C.hair, margin: '0 53px' }} />

      <div style={{ flex: '1 1 auto', padding: '28px 53px 28px', display: 'flex', flexDirection: 'row', gap: '60px', alignItems: 'flex-start' }}>
        {/* Left Column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <SectionLabel>Dimensions</SectionLabel>
            <SpecList>
              <SpecRow label="Width" value={`${config.w}"`} />
              <SpecRow label="Length" value={`${config.l}"`} />
              <SpecRow label="Skirt Size" value={`${config.sk}"`} />
              <SpecRow label="Diagonal Creases" value={config.diag ? 'Yes' : 'No'} />
              <SpecRow label="Drip Edge" value={config.drip ? 'Yes' : 'No'} />
            </SpecList>
          </div>

          {config.holes > 0 && (
            <div>
              <SectionLabel>Holes Details</SectionLabel>
              {renderHoleDetails('A', config.collarA)}
            </div>
          )}

          {config.notes && (
            <div>
              <SectionLabel>Special Notes</SectionLabel>
              <div style={notesCardStyle}>
                {config.notes}
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <SectionLabel>Material &amp; Finish</SectionLabel>
            <SpecList>
              <SpecRow label="Material" value={getMaterialName(config.mat)} />
              <SpecRow label="Gauge" value={`${config.gauge} Gauge`} />
              <SpecRow label="Powder Coat" value={config.pc ? 'Yes' : 'No'} />
            </SpecList>

            {config.pc && config.pcCol && (
              <PowderCoatColorCard color={config.pcCol} />
            )}
          </div>

          <PricingCard config={config} totalPrice={totalPrice} />
        </div>
      </div>

      <FooterBlock />
    </div>
  );
}

// Inline Helper Blocks

function SnapshotBlock({ snapshotUrl, heroDims, onHeroLoad }: { snapshotUrl?: string; heroDims: any; onHeroLoad: any }) {
  return (
    <div style={{ flexShrink: 0, padding: '24px 53px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {snapshotUrl ? (
        <img
          src={snapshotUrl}
          alt="Configured chase cover"
          id="pdf-hero-image"
          onLoad={onHeroLoad}
          style={
            heroDims
              ? { width: `${heroDims.w}px`, height: `${heroDims.h}px`, display: 'block' }
              : { maxWidth: '440px', maxHeight: '230px', width: 'auto', height: 'auto', display: 'block' }
          }
        />
      ) : (
        <div style={{ padding: '60px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
          3D preview not available
        </div>
      )}
    </div>
  );
}

function PowderCoatColorCard({ color }: { color: string }) {
  return (
    <div style={{ marginTop: '14px', padding: '11px 14px', background: C.cardBg, borderRadius: '6px', border: `1px solid ${C.hair}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: color, border: '1px solid rgba(0,0,0,0.12)', flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.label }}>
          Powder Coat Color
        </div>
        <div style={{ fontSize: '12px', color: '#444', fontWeight: 600 }}>
          {ralLabel(color)}
        </div>
        <div style={{ fontSize: '10.5px', color: C.muted, marginTop: '1px' }}>
          {color.toUpperCase()}
        </div>
      </div>
    </div>
  );
}

function PricingCard({ config, totalPrice }: { config: any; totalPrice: number }) {
  return (
    <div style={{ border: `1.5px solid ${C.gold}`, borderRadius: '10px', background: C.cardBg, padding: '20px 20px 18px', marginTop: 'auto' }}>
      <div style={{ fontSize: '12.5px', letterSpacing: '0.18em', textTransform: 'uppercase', color: C.gold, fontWeight: 600, paddingBottom: '6px', borderBottom: `1px solid ${C.goldSoft}`, marginBottom: '19px' }}>
        Pricing &amp; Summary
      </div>
      <PriceRow label="Unit Price" value={`$${config.price.toFixed(2)}`} />
      <PriceRow label="Quantity" value={String(config.quantity)} />
      <hr style={{ border: 'none', borderTop: `1.5px dashed ${C.goldSoft}`, margin: '19px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '14.5px', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, color: C.ink }}>
          Total Price
        </span>
        <span style={{ fontSize: '30px', fontWeight: 700, color: C.ink, letterSpacing: '0.01em' }}>
          ${totalPrice.toFixed(2)}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: C.muted, textAlign: 'right', marginTop: '14px', fontStyle: 'italic' }}>
        *Estimate based on configuration
      </div>
    </div>
  );
}

// pageNum is only shown on multi-page exports ("Page 1 of 2" etc.); single-page
// exports omit it, matching the cap configurator's footer.
function FooterBlock({ pageNum }: { pageNum?: string }) {
  return (
    <footer style={{ marginTop: 'auto', background: C.footerBg, borderTop: `1px solid ${C.hair}`, padding: '23px 53px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
      <div style={{ fontSize: '11.5px', color: C.muted, letterSpacing: '0.01em' }}>
        This document is for reference only. Final pricing subject to confirmation.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        {pageNum && <span style={{ fontSize: '11px', fontWeight: 600, color: C.gold, letterSpacing: '0.05em' }}>{pageNum}</span>}
        <span style={{ fontSize: '11.5px', color: '#7A766F', letterSpacing: '0.03em' }}>
          kaminos.com · 1-888-777-9789
        </span>
      </div>
    </footer>
  );
}

// Inline Subcomponents
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '13px', letterSpacing: '0.20em', textTransform: 'uppercase', color: C.gold, fontWeight: 600, paddingBottom: '6px', marginBottom: '2px', borderBottom: `1px solid ${C.hairStrong}` }}>
      {children}
    </div>
  );
}

function SpecList({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>;
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: `1px solid ${C.hair}` }}>
      <span style={{ fontSize: '14px', color: C.label, fontWeight: 400, letterSpacing: '0.01em' }}>{label}</span>
      <span style={{ fontSize: '15px', color: C.value, fontWeight: 600, letterSpacing: '0.01em', textAlign: 'right', paddingLeft: '30px' }}>
        {value}
      </span>
    </div>
  );
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0' }}>
      <span style={{ fontSize: '14px', color: C.label }}>{label}</span>
      <span style={{ fontSize: '15px', color: C.value, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
