// Generates the client handover PDF for both Kaminos configurators.
// Run: node scratch/make-handover.cjs   (from E:\chase-configurator-new)
const { jsPDF } = require('jspdf');
const path = require('path');

const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
const W = 210, M = 18, CW = W - M * 2;
let y = 0;

const INK = [23, 20, 17];
const GOLD = [194, 151, 74];
const GREY = [110, 105, 98];
const LIGHT = [240, 237, 232];

function header() {
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 30, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 30, W, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('KAMINOS', M, 13.5);
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text('3D Configurators — Handover & Operations Guide', M, 21.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 200, 200);
  doc.text('June 2026', W - M, 13.5, { align: 'right' });
  y = 40;
}

function section(title) {
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...GOLD);
  doc.text(title.toUpperCase(), M, y);
  doc.setDrawColor(...LIGHT);
  doc.setLineWidth(0.4);
  doc.line(M, y + 1.8, W - M, y + 1.8);
  y += 7.5;
}

function para(text, opts = {}) {
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  doc.setFontSize(opts.size || 9.5);
  doc.setTextColor(...(opts.color || INK));
  const lines = doc.splitTextToSize(text, opts.width || CW);
  doc.text(lines, opts.x || M, y);
  y += lines.length * (opts.lh || 4.6) + (opts.gap ?? 1.5);
}

function labelLink(label, url) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text(label, M + 2, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 80, 160);
  doc.textWithLink(url, M + 52, y, { url });
  y += 5.4;
}

function bullet(text, bold = '') {
  doc.setFillColor(...GOLD);
  doc.circle(M + 2, y - 1.2, 0.7, 'F');
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  let lines;
  if (bold) {
    doc.setFont('helvetica', 'bold');
    doc.text(bold, M + 5.5, y);
    const boldW = doc.getTextWidth(bold + ' ');
    doc.setFont('helvetica', 'normal');
    lines = doc.splitTextToSize(text, CW - 5.5 - boldW);
    doc.text(lines[0], M + 5.5 + boldW, y);
    const rest = doc.splitTextToSize(lines.slice(1).join(' '), CW - 5.5);
    if (rest.length && rest[0]) { doc.text(rest, M + 5.5, y + 4.4); lines = [lines[0], ...rest]; }
    else lines = [lines[0]];
  } else {
    doc.setFont('helvetica', 'normal');
    lines = doc.splitTextToSize(text, CW - 5.5);
    doc.text(lines, M + 5.5, y);
  }
  y += lines.length * 4.4 + 1.6;
}

header();

// ── 1. The configurators ─────────────────────────────────────────────────
section('1. The configurators');
para('Both products share the same architecture: a 3D model customers configure live, real-time pricing from the Google Sheet, PDF spec-sheet export, AR preview, and a direct Add to Cart / Buy with Shop flow into the Kaminos Shopify store.', { gap: 3 });

doc.setFillColor(250, 248, 245);
doc.roundedRect(M, y - 3, CW, 24, 2, 2, 'F');
para('Multi-Flue Chimney Cap Configurator', { bold: true, x: M + 4, gap: 0.5 });
doc.setTextColor(40, 80, 160);
doc.setFontSize(9.5);
doc.textWithLink('https://chimney-cap-configurator.vercel.app', M + 4, y, { url: 'https://chimney-cap-configurator.vercel.app' });
y += 7;
para('Chase Cover Configurator', { bold: true, x: M + 4, gap: 0.5 });
doc.setTextColor(40, 80, 160);
doc.textWithLink('https://chase-cover-configurator.vercel.app', M + 4, y, { url: 'https://chase-cover-configurator.vercel.app' });
y += 9;
para('Each is also embedded directly on its product page on kaminos.com — the embedded version and the links above are the same app and always stay in sync.', { color: GREY, size: 9, gap: 3 });

// ── 2. Pricing ───────────────────────────────────────────────────────────
section('2. Editing prices (no developer needed)');
para('All pricing for BOTH configurators lives in one Google Sheet. Edit a value, and the live price updates within ~2 minutes — no deployment, no code changes:', { gap: 2.5 });
doc.setFont('helvetica', 'bold');
doc.setFontSize(9.5);
doc.setTextColor(...INK);
doc.text('Pricing sheet:', M + 2, y);
y += 4.6;
doc.setFont('helvetica', 'normal');
doc.setFontSize(8.2);
doc.setTextColor(40, 80, 160);
doc.textWithLink('https://docs.google.com/spreadsheets/d/1ygII9WTQ55xePPTX-7Q1eTSxMCMWbROFajMg5KYOu90/edit', M + 2, y, { url: 'https://docs.google.com/spreadsheets/d/1ygII9WTQ55xePPTX-7Q1eTSxMCMWbROFajMg5KYOu90/edit' });
y += 6;
bullet('columns A / B (multipliers, gauge & material factors, storm collar prices, "Kaminos Margin").', 'Chase cover block:');
bullet('columns H / I (the MULT_* matrix, bracket thresholds, surcharge percentages).', 'Chimney cap block:');
bullet('The price a customer is charged is always recalculated on the server from this sheet at the moment they add to cart — the website can never be tricked into a different price. If the sheet is ever unreachable or the margin is blanked, the system refuses the sale with a friendly "try again" message rather than selling at a wrong price.');
y += 1;

// ── 3. Variant cleanup ───────────────────────────────────────────────────
section('3. Variant cleanup (housekeeping)');
para('Every unique configuration a customer adds to cart briefly becomes a "variant" on your Shopify product (that is how the custom price flows into checkout). Shopify allows 100 variants per product, so old auto-created ones are cleaned up automatically: on a schedule every 10 days, and proactively whenever the count approaches the limit. Past orders are never affected — order details are stored on the order itself.', { gap: 2.5 });
para('You normally never need to think about this. If you ever want to clean up manually, open the dashboard for the product in question, review the list, and click the cleanup button:', { gap: 2.5 });
labelLink('Chimney cap:', 'https://chimney-cap-configurator.vercel.app/api/cleanup-variants?secret=kaminos');
labelLink('Chase cover:', 'https://chase-cover-configurator.vercel.app/api/cleanup-variants?secret=kaminos');
y += 1;
para('Only auto-created variants (names starting with MFC- or CC-) can be deleted there — your base product and any variants you created yourself are protected. Please keep these links private; the "secret=" part is the access key.', { color: GREY, size: 9, gap: 2 });

// ── Contact (subtle, above the footer) ───────────────────────────────────
y += 6;
doc.setDrawColor(...LIGHT);
doc.setLineWidth(0.4);
doc.line(M, y, W - M, y);
y += 6;
doc.setFont('helvetica', 'normal');
doc.setFontSize(9);
doc.setTextColor(...GREY);
doc.text('Questions about either configurator? Drop an email to Manzoor at manzoor@interaktive.io.', M, y);

// Footer
doc.setFillColor(...LIGHT);
doc.rect(0, 283, W, 14, 'F');
doc.setFontSize(8.5);
doc.setTextColor(...GREY);
doc.text('Kaminos 3D Configurators — prepared for handover, June 2026', M, 291);
doc.setTextColor(...GOLD);
doc.text('kaminos.com', W - M, 291, { align: 'right' });

const out = path.join(__dirname, '..', process.argv[2] || 'KAMINOS-Configurators-Handover.pdf');
require('fs').writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log('written:', out);
