import { useState, useRef, useEffect } from 'react';
import { generatePdf, deliverPdf, pdfDebug } from '../../utils/pdfGenerator';
import { PdfReport } from './PdfReport';

const REPORT_W = 794;
const FONT = "'Jost', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

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
      if (!el) pdfDebug('modal:print-mount-missing');
      const blob = await generatePdf(el);
      if (blob) {
        await deliverPdf(blob, filename);
      } else {
        // Never fail silently — generatePdf logs the cause via pdfDebug.
        alert('Sorry, the PDF could not be generated on this device. Please try again.');
      }
    } catch (error) {
      console.error('Error in handleDownload:', error);
      pdfDebug('modal:error', { error: String((error as Error)?.message || error) });
      alert('Sorry, the PDF download failed. Please try again.');
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
        // Top-aligned with a 14vh offset (not centered): inside the shadow root
        // the theme's sticky header paints over the top of this overlay, so the
        // dialog starts below it. Do NOT portal to the light DOM to "fix" this —
        // that breaks mobile PDF generation (see App.tsx).
        justifyContent: 'flex-start',
        alignItems: 'center',
        padding: '14vh 16px 3vh',
        // Stop wheel/touch over the backdrop from scrolling the page behind.
        overscrollBehavior: 'contain',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {/* Self-contained Spinner style */}
      <style>{`
        @keyframes pdf-spin {
          to { transform: rotate(360deg); }
        }
        .pdf-capture-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(194, 151, 74, 0.2);
          border-top: 3px solid rgb(194, 151, 74);
          border-radius: 50%;
          animation: pdf-spin 0.8s linear infinite;
        }
      `}</style>

      <div style={{
        background: '#fff',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '880px',
        maxHeight: '82vh',
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
            <span style={{ fontWeight: '600', fontSize: '15px', color: '#1a1a1a', fontFamily: FONT }}>Specification Preview</span>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#999', padding: '4px 8px' }}>
            &times;
          </button>
        </div>

        {/* Scaled Preview Frame */}
        <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '24px 16px', backgroundColor: '#e4e2de', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: 0 }}>
          {isCapturing ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '16px', color: '#666', fontFamily: FONT }}>
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
        <div style={{ padding: '14px 20px', borderTop: '1px solid #ebebeb', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#fff', fontFamily: FONT }}>
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
