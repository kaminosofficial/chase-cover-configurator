// jsPDF / html2canvas / html-to-image are imported dynamically inside
// generatePdf() — together they're ~550KB and only a tiny fraction of visitors
// ever export a PDF. In the SPA build they split into a lazy chunk; the Shopify
// IIFE still inlines them (inlineDynamicImports), so behavior there is unchanged.

// Lightweight remote telemetry for diagnosing PDF failures in the field —
// events land in Vercel function logs (search "[CART-DBG]" / tag PDF-DBG).
// Fire-and-forget; never blocks or breaks the PDF flow.
export function pdfDebug(event: string, data?: Record<string, unknown>): void {
  try {
    const apiBase = (window as any).__chaseApiBase || '';
    fetch(`${apiBase}/api/cart-debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: 'PDF-DBG', event, ua: navigator.userAgent.slice(0, 90), ...data }),
      keepalive: true,
    }).catch(() => { /* ignore */ });
  } catch { /* ignore */ }
}

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

  const tStart = Date.now();
  try {
    pdfDebug('generate:start', { mobile: isMobileDevice() });
    // Load the heavy libs on demand: jsPDF always, plus only the rasterizer the
    // current platform actually uses (html2canvas on mobile, html-to-image on desktop).
    const [{ jsPDF }, rasterizer] = await Promise.all([
      import('jspdf'),
      isMobileDevice() ? import('html2canvas') : import('html-to-image'),
    ]);
    pdfDebug('generate:libs-loaded', { ms: Date.now() - tStart });

    // Ensure fonts are settled with a safety timeout so they don't block forever.
    if (document.fonts && document.fonts.ready) {
      try {
        await withTimeout(document.fonts.ready, 1500, 'Fonts load timeout');
      } catch { /* non-fatal */ }
    }

    // Create a temporary, off-screen container that is completely un-transformed.
    const root = element.getRootNode();
    const containerToAppend = (root && 'appendChild' in root && root !== document)
      ? (root as any)
      : document.body;

    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'fixed';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.background = '#ffffff';
    tempContainer.style.zIndex = '-9999';
    tempContainer.style.transform = 'none';

    containerToAppend.appendChild(tempContainer);

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();    // 210
    const pageHeight = pdf.internal.pageSize.getHeight();  // 297

    // Clone the element so we don't mutate the live UI preview.
    const clone = element.cloneNode(true) as HTMLElement;

    // Find all pages to render
    const pages = Array.from(clone.querySelectorAll('.pdf-page-render')) as HTMLElement[];
    if (pages.length === 0) {
      pages.push(clone);
    }

    for (let i = 0; i < pages.length; i++) {
      const pageEl = pages[i];
      const width = 794;
      const height = 1123;

      // Reset styles to standard A4 dimensions for capturing
      pageEl.style.transform = 'none';
      pageEl.style.margin = '0';
      pageEl.style.padding = '0';
      pageEl.style.width = `${width}px`;
      pageEl.style.height = `${height}px`;
      pageEl.style.boxSizing = 'border-box';

      // Strip letter-spacing on mobile/iOS to prevent html2canvas text overlapping/garbling
      if (isMobileDevice()) {
        pageEl.querySelectorAll('*').forEach((node) => {
          const el = node as HTMLElement;
          if (el.style.letterSpacing) {
            el.style.letterSpacing = '0';
          }
        });
        if (pageEl.style.letterSpacing) {
          pageEl.style.letterSpacing = '0';
        }
      }

      tempContainer.appendChild(pageEl);

      let canvas: HTMLCanvasElement;

      try {
        if (isMobileDevice()) {
          // ── Mobile path: html2canvas ──
          const html2canvas = (rasterizer as typeof import('html2canvas')).default;
          canvas = await withTimeout(
            html2canvas(pageEl, {
              scale: 2,
              backgroundColor: '#ffffff',
              width,
              height,
              useCORS: true,
              allowTaint: true,
              logging: false,
            }),
            15000,
            `PDF page ${i + 1} generation timed out (mobile)`
          );
        } else {
          // ── Desktop path: html-to-image (SVG foreignObject) ──
          const { toCanvas } = rasterizer as typeof import('html-to-image');
          canvas = await withTimeout(
            toCanvas(pageEl, {
              pixelRatio: 2,
              backgroundColor: '#ffffff',
              width,
              height,
              skipFonts: true,
            }),
            8000,
            `PDF page ${i + 1} generation timed out (desktop)`
          );
        }
      } finally {
        // Remove from temp container after capture
        try {
          tempContainer.removeChild(pageEl);
        } catch { /* ignore */ }
      }

      pdfDebug('generate:page-captured', { page: i + 1, of: pages.length, canvasW: canvas.width, canvasH: canvas.height, ms: Date.now() - tStart });

      const imgData = canvas.toDataURL('image/jpeg', 0.92);

      if (i > 0) {
        pdf.addPage();
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
    }

    // Clean up temporary container from body/shadow-root
    try {
      containerToAppend.removeChild(tempContainer);
    } catch { /* ignore */ }

    const blob = pdf.output('blob');
    pdfDebug('generate:done', { blobSize: blob?.size, ms: Date.now() - tStart });
    return blob;
  } catch (err) {
    console.error('Failed to generate PDF:', err);
    pdfDebug('generate:error', { error: String((err as Error)?.message || err), ms: Date.now() - tStart });
    return null;
  }
}
// Delivers the generated PDF: on devices that support sharing files (iOS/Android)
// this opens the native share sheet so the user can "Save to Files"; otherwise it
// triggers a normal browser download. Same implementation as the cap configurator
// (its mobile-download fixes apply here too): share payload is files+title ONLY,
// user-cancel returns without a redundant download, and the object URL is revoked
// on a delay — revoking synchronously after click() kills the download on iOS.
export async function deliverPdf(blob: Blob, filename: string): Promise<void> {
  const file =
    typeof File !== 'undefined'
      ? new File([blob], filename, { type: 'application/pdf' })
      : null;

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data?: ShareData) => Promise<void>;
  };

  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const fileShareable = !!(isMobile && file && nav.canShare && nav.canShare({ files: [file] }) && nav.share);
  pdfDebug('deliver:start', { isMobile, fileShareable, blobSize: blob.size });

  if (fileShareable) {
    try {
      await nav.share!({ files: [file!], title: filename });
      pdfDebug('deliver:share-ok');
      return;
    } catch (e) {
      pdfDebug('deliver:share-error', { name: (e as DOMException)?.name, error: String((e as Error)?.message || e) });
      // User cancelled, or share was blocked — fall through to download/open.
      if ((e as DOMException)?.name === 'AbortError') return;
    }
  }

  pdfDebug('deliver:fallback-download');
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
