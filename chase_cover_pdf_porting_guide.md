# Porting Guide: Mobile & Desktop PDF Export Engine
This document details how to replicate the exact A4 PDF specification sheet export, dynamic logo-cropping engine, and modal preview layout in the **Chase Cover Configurator** repository.

---

## 1. Dependencies
Install the required PDF rasterization and layout generation packages in the target project:
```bash
npm install jspdf html-to-image html2canvas
```

---

## 2. Dynamic Logo Cropping Engine
Create the file `src/components/pdf/kaminosLogo.ts`. This file contains the white Kaminos logo (600×214) as a base64 data URI and uses an off-screen HTML5 canvas to dynamically split the logo into a symbol (icon) and a wordmark (text) with all transparent side paddings cropped out. This ensures perfect left-alignment in the header.

### Code: `src/components/pdf/kaminosLogo.ts`
```typescript
// White Kaminos wordmark (600x214) as an inline data URI so the
// PDF spec sheet renders the logo in every context (standalone, Shopify Shadow
// DOM, offline) with no cross-origin / path-resolution / canvas-taint issues.
export const KAMINOS_LOGO_WHITE = 'data:image/png;base64,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';

export function getCroppedLogo(): Promise<{ symbol: string; text: string }> {
  if (typeof window === 'undefined') {
    return Promise.resolve({
      symbol: KAMINOS_LOGO_WHITE,
      text: KAMINOS_LOGO_WHITE,
    });
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // 1. Crop the Symbol (Icon)
      // Original size is 600x214, symbol is centered: X [264 to 335] (width 72), Y [0 to 82] (height 83)
      const canvasSymbol = document.createElement('canvas');
      canvasSymbol.width = 72;
      canvasSymbol.height = 83;
      const ctxSymbol = canvasSymbol.getContext('2d');
      if (ctxSymbol) {
        ctxSymbol.drawImage(img, 264, 0, 72, 83, 0, 0, 72, 83);
      }
      const symbolData = canvasSymbol.toDataURL('image/png');

      // 2. Crop the Wordmark (Text)
      // Bottom Wordmark ("KAMINOS" text): X [0 to 599] (width 600), Y [132 to 213] (height 82)
      const canvasText = document.createElement('canvas');
      canvasText.width = 600;
      canvasText.height = 82;
      const ctxText = canvasText.getContext('2d');
      if (ctxText) {
        ctxText.drawImage(img, 0, 132, 600, 82, 0, 0, 600, 82);
      }
      const textData = canvasText.toDataURL('image/png');

      resolve({
        symbol: symbolData,
        text: textData,
      });
    };
    img.onerror = () => {
      resolve({
        symbol: KAMINOS_LOGO_WHITE,
        text: KAMINOS_LOGO_WHITE,
      });
    };
    img.src = KAMINOS_LOGO_WHITE;
  });
}
```

---

## 3. The Dual-Engine PDF Generation Module
Create the file `src/utils/pdfGenerator.ts`. This file handles the PDF rasterization and document generation. It switches rendering engines based on the user's platform to ensure compatibility, strips letter-spacing on mobile to prevent text overlap, renders off-screen to avoid viewport CSS transform clipping, and uses the Web Share API on mobile to prompt native "Save to Files" dialogs.

### Code: `src/utils/pdfGenerator.ts`
```typescript
import { jsPDF } from 'jspdf';
import { toCanvas } from 'html-to-image';
import html2canvas from 'html2canvas';

function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
  ]);
}

const isMobileDevice = (): boolean =>
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Rasterizes an A4 DOM element to a PDF and returns a Blob.
export async function generatePdf(element: HTMLElement | null): Promise<Blob | null> {
  if (!element) {
    console.error('PDF element target not found');
    return null;
  }

  try {
    // Ensure fonts are settled with a safety timeout so they don't block forever.
    if (document.fonts && document.fonts.ready) {
      try {
        await withTimeout(document.fonts.ready, 1500, 'Fonts load timeout');
      } catch { /* non-fatal */ }
    }

    const width = element.offsetWidth || 794;
    const height = element.offsetHeight || 1123;

    // Create a temporary, off-screen container that is completely un-transformed.
    const root = element.getRootNode();
    const containerToAppend = (root && 'appendChild' in root && root !== document)
      ? (root as any)
      : document.body;

    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'fixed';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = `${width}px`;
    tempContainer.style.height = `${height}px`;
    tempContainer.style.background = '#ffffff';
    tempContainer.style.zIndex = '-9999';
    tempContainer.style.transform = 'none';

    // Clone the element so we don't mutate the live UI preview.
    const clone = element.cloneNode(true) as HTMLElement;
    clone.style.transform = 'none';
    clone.style.margin = '0';
    clone.style.padding = '0';
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;

    // Strip letter-spacing on mobile/iOS to prevent html2canvas text overlapping/garbling
    if (isMobileDevice()) {
      clone.querySelectorAll('*').forEach((node) => {
        const el = node as HTMLElement;
        if (el.style.letterSpacing) {
          el.style.letterSpacing = '0';
        }
      });
      if (clone.style.letterSpacing) {
        clone.style.letterSpacing = '0';
      }
    }

    tempContainer.appendChild(clone);
    containerToAppend.appendChild(tempContainer);

    let canvas: HTMLCanvasElement;

    try {
      if (isMobileDevice()) {
        // ── Mobile path: html2canvas ──
        canvas = await withTimeout(
          html2canvas(clone, {
            scale: 2,
            backgroundColor: '#ffffff',
            width,
            height,
            useCORS: true,
            allowTaint: true,
            logging: false,
          }),
          15000,
          'PDF generation timed out (mobile)'
        );
      } else {
        // ── Desktop path: html-to-image (SVG foreignObject) ──
        canvas = await withTimeout(
          toCanvas(clone, {
            pixelRatio: 2,
            backgroundColor: '#ffffff',
            width,
            height,
            skipFonts: true,
          }),
          8000,
          'PDF generation timed out (desktop)'
        );
      }
    } finally {
      // Clean up the temporary container
      try {
        containerToAppend.removeChild(tempContainer);
      } catch { /* ignore */ }
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();    // 210
    const pageHeight = pdf.internal.pageSize.getHeight();  // 297
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    const tolerance = 10; // 10mm height tolerance (~38px)
    if (imgHeight <= pageHeight + tolerance) {
      // Fit exactly on a single page
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
    } else {
      // Slice across multiple A4 pages so nothing is clipped.
      let remaining = imgHeight;
      let position = 0;
      while (remaining > tolerance) {
        pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight);
        remaining -= pageHeight;
        position -= pageHeight;
        if (remaining > tolerance) pdf.addPage();
      }
    }

    return pdf.output('blob');
  } catch (err) {
    console.error('Failed to generate PDF:', err);
    return null;
  }
}

// Delivers the PDF: triggers browser download on desktop, or Web Share sheet on mobile.
export async function deliverPdf(blob: Blob, filename: string) {
  const isMobile =
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isMobile && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Kaminos Chimney Specification',
          text: 'Here is your configured Kaminos specification PDF.',
        });
        return;
      }
    } catch (e) {
      console.warn('Native sharing failed, falling back to download:', e);
    }
  }

  // Desktop or fallback: direct download via link injection
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

---

## 4. The Responsive Preview Modal
Create the file `src/components/pdf/PdfPreviewModal.tsx`. This file displays an overlay containing a scaled preview of the PDF report before the user downloads it.

### Code: `src/components/pdf/PdfPreviewModal.tsx`
```typescript
import { useState, useRef, useEffect } from 'react';
import { generatePdf, deliverPdf } from '../../utils/pdfGenerator';
import { PdfReport } from './PdfReport';

const REPORT_W = 794;

interface PdfPreviewModalProps {
  open: boolean;
  onClose: () => void;
  captureSnapshot: () => Promise<string | undefined>;
}

export function PdfPreviewModal({ open, onClose, captureSnapshot }: PdfPreviewModalProps) {
  const [snapshotUrl, setSnapshotUrl] = useState<string | undefined>(undefined);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const didCaptureRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.82);
  const [reportHeight, setReportHeight] = useState(1123);

  useEffect(() => {
    if (!open) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const availableWidth = containerWidth - 32;
        const calculatedScale = Math.min(0.95, Math.max(0.25, availableWidth / REPORT_W));
        setScale(calculatedScale);
      }
      if (reportRef.current) {
        setReportHeight(reportRef.current.clientHeight);
      }
    };

    const timer = setTimeout(updateDimensions, 100);
    window.addEventListener('resize', updateDimensions);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateDimensions);
    };
  }, [open, snapshotUrl]);

  if (open && !didCaptureRef.current && !isCapturing) {
    didCaptureRef.current = true;
    setIsCapturing(true);
    setSnapshotUrl(undefined);
    captureSnapshot().then((url) => {
      setSnapshotUrl(url);
      setIsCapturing(false);
    }).catch(() => {
      setIsCapturing(false);
    });
  }

  function handleClose() {
    didCaptureRef.current = false;
    setSnapshotUrl(undefined);
    setIsCapturing(false);
    onClose();
  }

  async function handleDownload() {
    setIsDownloading(true);
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `KAMINOS-ChaseCover-${dateStr}.pdf`;
      const el = (reportRef.current?.querySelector('#print-mount') ?? null) as HTMLElement | null;
      const blob = await generatePdf(el);
      if (blob) await deliverPdf(blob, filename);
    } catch (error) {
      console.error('Error in handleDownload:', error);
    } finally {
      setIsDownloading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      id="pdf-preview-overlay"
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{
        background: '#fff',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '880px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #ebebeb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#fafafa',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(194, 151, 74)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="15" y2="17"/>
              <polyline points="9 9 10 9"/>
            </svg>
            <span style={{ fontWeight: '600', fontSize: '15px', color: '#1a1a1a' }}>Specification Preview</span>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#999', padding: '4px 8px' }}>
            &times;
          </button>
        </div>

        {/* Scaled Preview Frame */}
        <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 16px', backgroundColor: '#e4e2de', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: 0 }}>
          {isCapturing ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '16px', color: '#666' }}>
              <div className="pdf-capture-spinner" />
              <div style={{ fontSize: '14px' }}>Capturing 3D preview…</div>
            </div>
          ) : (
            <div style={{ width: `${REPORT_W * scale}px`, height: `${reportHeight * scale}px`, overflow: 'hidden', position: 'relative', boxShadow: '0 6px 24px rgba(0,0,0,0.18)', flexShrink: 0 }}>
              <div ref={reportRef} style={{ position: 'absolute', left: 0, top: 0, width: `${REPORT_W}px`, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <PdfReport snapshotUrl={snapshotUrl} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #ebebeb', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#fff' }}>
          <button onClick={handleClose} style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontWeight: '500', fontSize: '14px', color: '#555' }}>
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={isDownloading || isCapturing}
            style={{
              padding: '10px 22px', borderRadius: '6px', border: 'none',
              background: isDownloading || isCapturing ? '#d6c191' : 'rgb(194, 151, 74)',
              color: '#fff', cursor: isDownloading || isCapturing ? 'not-allowed' : 'pointer',
              fontWeight: '600', fontSize: '14px', minWidth: '150px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            {!isDownloading && (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            )}
            {isDownloading ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 5. Reusable CSS and Styles
The PDF Spec sheet is self-styled using standard inline React styles to ensure high portability, CSS containment, and compatibility inside Shadow DOM scopes.
The core aesthetic parameters:
- **Font Family**: Jost / System default fallback.
- **Harmony Color Palettes**:
  - Ink Header: `#171411`
  - Accent Gold: `#C2974A`
  - Soft Gold (borders): `#D9BC86`
  - Gray labels: `#8E8E8E`
  - Light Gray hairline borders: `#E6E4E0`
  - Light background cards: `#FBFAF8`
- **Flexbox Grid**: Standard `flex-direction: row` with `flex: 1` columns. **NEVER use CSS Grid**, as `html2canvas` fails to parse grid alignments, causing elements to overlap.

---

## 6. Porting and Adapting the PDF spec template: `src/components/pdf/PdfReport.tsx`
Create `src/components/pdf/PdfReport.tsx`. **Important:** The content of the specification sections must be adapted from the *Chimney Cap* features to the *Chase Cover* features.

Here is the exact structure to write in the target repository. The target agent should update the data mappings to match the Chase Cover Zustand store config variables:

```typescript
import { useState, useEffect } from 'react';
import { useConfigStore } from '../../store/configStore';
import { KAMINOS_LOGO_WHITE, getCroppedLogo } from './kaminosLogo';

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

interface PdfReportProps {
  snapshotUrl?: string;
}

export function PdfReport({ snapshotUrl }: PdfReportProps) {
  const config = useConfigStore();
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const totalPrice = config.price * config.quantity;

  const [logoAssets, setLogoAssets] = useState<{ symbol: string; text: string } | null>(null);

  useEffect(() => {
    getCroppedLogo().then(setLogoAssets);
  }, []);

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

  return (
    <div
      id="print-mount"
      style={{
        width: '794px',
        minHeight: '1123px',
        background: '#ffffff',
        color: C.value,
        fontFamily: FONT,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          background: C.ink,
          color: '#fff',
          padding: '30px 53px',
          borderBottom: `2.5px solid ${C.gold}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'flex-start' }}>
          {logoAssets ? (
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
          )}
          {/* ADAPT CONTENT: Title has font-size 20px, left aligned, and says CHASE COVER SPECIFICATION */}
          <div style={{ fontSize: '20px', letterSpacing: '0.18em', textTransform: 'uppercase', color: C.gold, fontWeight: 600, textAlign: 'left' }}>
            Chase Cover Specification
          </div>
        </div>

        {/* Date / Website block vertically centered */}
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>{dateStr}</div>
          <div style={{ fontSize: '12px', color: C.metaUrl, letterSpacing: '0.04em' }}>kaminos.com</div>
        </div>
      </header>

      {/* ── Snapshot Hero Image ── */}
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
                : { maxWidth: `${HERO_MAX_W}px`, maxHeight: `${HERO_MAX_H}px`, width: 'auto', height: 'auto', display: 'block' }
            }
          />
        ) : (
          <div style={{ padding: '60px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
            3D preview not available
          </div>
        )}
      </div>

      <div style={{ height: '1px', background: C.hair, margin: '0 53px', flexShrink: 0 }} />

      {/* ── Specification Data Body (Two Column Flexbox) ── */}
      <div style={{ flex: '1 1 auto', padding: '28px 53px 28px', display: 'flex', flexDirection: 'row', gap: '60px', alignItems: 'flex-start' }}>
        
        {/* Left Column: Dimensions & Structural Options */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <SectionLabel>Dimensions</SectionLabel>
            <SpecList>
              {/* ADAPT CONTENT: Map to Chase Cover config fields (width, length, skirt, diagonal creases) */}
              <SpecRow label="Width" value={`${config.width}"`} />
              <SpecRow label="Length" value={`${config.length}"`} />
              <SpecRow label="Skirt Size" value={`${config.skirt}"`} />
              <SpecRow label="Diagonal Creases" value={config.diagonalCreases ? 'Yes' : 'No'} />
              <SpecRow label="Drip Edge" value={config.dripEdge ? 'Yes' : 'No'} />
            </SpecList>
          </div>

          {/* ADAPT CONTENT: Map to Chase Cover Holes details. Loop over holes array if available. */}
          {config.holes && config.holes.length > 0 && (
            <div>
              <SectionLabel>Holes Details</SectionLabel>
              {config.holes.map((hole: any, idx: number) => (
                <div key={idx} style={{ marginTop: idx > 0 ? '12px' : '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: C.gold, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Hole #{idx + 1} ({hole.shape})
                  </div>
                  <SpecList>
                    <SpecRow label="Diameter / Size" value={hole.shape === 'round' ? `${hole.diameter}"` : `${hole.width}" x ${hole.length}"`} />
                    <SpecRow label="X Center Offset" value={`${hole.x}"`} />
                    <SpecRow label="Y Center Offset" value={`${hole.y}"`} />
                    <SpecRow label="Storm Collar" value={hole.stormCollar ? 'Yes' : 'No'} />
                  </SpecList>
                </div>
              ))}
            </div>
          )}

          {config.notes && (
            <div>
              <SectionLabel>Special Notes</SectionLabel>
              <div style={{ fontSize: '12px', color: '#555', lineHeight: 1.6, padding: '12px 14px', border: `1px solid ${C.hair}`, borderRadius: '6px', background: C.cardBg, marginTop: '8px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                {config.notes}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Material, Color & Pricing Card */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <SectionLabel>Material &amp; Finish</SectionLabel>
            <SpecList>
              {/* ADAPT CONTENT: Map to Chase Cover material, gauge, powder coat selection */}
              <SpecRow label="Material" value={config.material === 'stainless' ? 'Stainless Steel' : 'Copper'} />
              <SpecRow label="Gauge" value={`${config.gauge} Gauge`} />
              <SpecRow label="Powder Coat" value={config.powderCoat ? 'Yes' : 'No'} />
            </SpecList>

            {config.powderCoat && config.powderCoatColor && (
              <div style={{ marginTop: '14px', padding: '11px 14px', background: C.cardBg, borderRadius: '6px', border: `1px solid ${C.hair}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: config.powderCoatColor, border: '1px solid rgba(0,0,0,0.12)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.label }}>
                    Powder Coat Color
                  </div>
                  <div style={{ fontSize: '12px', color: '#444', fontWeight: 600 }}>
                    {config.powderCoatColor.toUpperCase()}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pricing Box */}
          <div style={{ marginTop: 'auto', border: `1.5px solid ${C.gold}`, borderRadius: '10px', background: C.cardBg, padding: '20px 20px 18px' }}>
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
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{ marginTop: 'auto', background: C.footerBg, borderTop: `1px solid ${C.hair}`, padding: '23px 53px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: '11.5px', color: C.muted, letterSpacing: '0.01em' }}>
          This document is for reference only. Final pricing subject to confirmation.
        </div>
        <div style={{ fontSize: '11.5px', color: '#7A766F', letterSpacing: '0.03em' }}>
          kaminos.com · 1-888-777-9789
        </div>
      </footer>
    </div>
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
```

---

## 7. Mounting and Triggering PDF Preview Modal

### UI Export Button Placement (`src/components/sidebar/Sidebar.tsx`)
In the Kaminos design, the **Export PDF** button is positioned in the header of the bottom price bar (`.price-bar > .price-header`), rendering directly next to the `<PriceDisplay />` component. This placement preserves its responsive behavior across mobile (docked bottom sheet) and desktop (bottom-right sidebar).

#### 1. Add `onExportPdf` to `SidebarProps`
In `src/components/sidebar/Sidebar.tsx`, declare `onExportPdf` and `isSubmitting` in the component interface:
```typescript
interface SidebarProps {
  onOpenRal: () => void;
  onAddToCart: () => void;
  onBuyNow: () => void;
  onExportPdf?: () => void; // Add this
  isSubmitting?: boolean;   // Add this (to disable the button during submit)
  submittingAction?: 'cart' | 'buy' | null;
  submittingStep?: string;
}
```

#### 2. Render the Button in `Sidebar.tsx`
Update the `.price-bar` container in `src/components/sidebar/Sidebar.tsx` to include the button as follows:
```typescript
export function Sidebar({ 
  onOpenRal, 
  onAddToCart, 
  onBuyNow, 
  onExportPdf, 
  isSubmitting = false, 
  submittingAction = null, 
  submittingStep = '' 
}: SidebarProps) {
  const config = useConfigStore();

  return (
    <div className="sidebar">
      {/* ... previous inputs / scroll section ... */}

      <div className="price-bar">
        <div className="price-header">
          <PriceDisplay />
          {onExportPdf && (
            <button
              id="export-pdf-btn"
              className="export-pdf-btn export-pdf-btn--inline"
              onClick={onExportPdf}
              disabled={isSubmitting}
              aria-label="Export specification PDF"
            >
              {/* PDF file icon */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="9" y1="13" x2="15" y2="13"/>
                <line x1="9" y1="17" x2="15" y2="17"/>
                <polyline points="9 9 10 9"/>
              </svg>
              Export PDF
            </button>
          )}
        </div>
        <CartRow onAddToCart={onAddToCart} onBuyNow={onBuyNow} isSubmitting={isSubmitting} submittingAction={submittingAction} submittingStep={submittingStep} />
      </div>
    </div>
  );
}
```

---

## 8. CSS Classes to Add (`src/styles/globals.css`)
Ensure the following classes are present in the CSS file of the target project (usually `src/styles/globals.css` or equivalent). These styles handle the hover state, disabled behavior, and inline layout adjustments.

```css
/* ---- Export PDF button (above cart row) ---- */
.export-pdf-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 42px;
  margin-bottom: 10px;
  background: #fff;
  border: 1px solid rgba(18, 18, 18, 0.12);
  border-radius: 6px;
  color: rgb(18, 18, 18);
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.18s, color 0.15s, box-shadow 0.15s;
  letter-spacing: 0.01em;
}
.export-pdf-btn:hover {
  background: #faf6ef;
  border-color: rgb(209, 179, 130);
  color: rgb(180, 140, 80);
  box-shadow: 0 1px 4px rgba(209, 179, 130, 0.18);
}
.export-pdf-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Inline variant — sits on the price line, right of the total (local-only) */
.export-pdf-btn--inline {
  width: auto;
  height: 34px;
  margin-bottom: 0;
  padding: 0 14px;
  font-size: 13px;
  flex-shrink: 0;
}

/* ---- PDF capture spinner ---- */
.pdf-capture-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(209, 179, 130, 0.2);
  border-top-color: rgb(209, 179, 130);
  border-radius: 50%;
  animation: pdf-spin 0.75s linear infinite;
}
@keyframes pdf-spin {
  to { transform: rotate(360deg); }
}
```

---

## 9. Main Page Integration (`src/App.tsx`)

#### 1. Import `PdfPreviewModal` in `src/App.tsx`
```typescript
import { PdfPreviewModal } from './components/pdf/PdfPreviewModal';
```

#### 2. Declare modal state
Inside the `App` component, declare the open state:
```typescript
const [pdfOpen, setPdfOpen] = useState(false);
```

#### 3. Implement snapshot capture method
Since the 3D viewer renders inside a `<canvas>` element:
* Ensure the Three.js `WebGLRenderer` has `preserveDrawingBuffer: true` enabled in the R3F Canvas component. Otherwise, the canvas capture will render as a blank image.
* Add this capture helper in `src/App.tsx`:
```typescript
const captureSnapshot = async (): Promise<string | undefined> => {
  const canvas = document.querySelector('canvas') || document.getElementById('configurator-canvas');
  if (!canvas) return undefined;
  return canvas.toDataURL('image/jpeg', 0.95);
};
```

#### 4. Pass the handler to `<Sidebar />`
```typescript
<Sidebar
  onOpenRal={() => setRalOpen(true)}
  onExportPdf={() => setPdfOpen(true)} // Pass the handler here
  isSubmitting={isSubmitting}
  submittingAction={submittingAction}
  submittingStep={submittingStep}
  onAddToCart={...}
  onBuyNow={...}
/>
```

#### 5. Render the Modal component at the root level of the JSX (bottom of your return block):
```typescript
<PdfPreviewModal
  open={pdfOpen}
  onClose={() => setPdfOpen(false)}
  captureSnapshot={captureSnapshot}
/>
```

