/**
 * pdfEngine.js  — Smart Parking PDF Generation Engine
 * Uses PDFKit to produce professional, branded PDFs for:
 *   • Booking Receipts / Parking Invoices / GST Invoices
 *   • Refund Receipts / Fine Receipts / Wallet Transactions
 *   • Provider Settlements / Daily & Monthly Reports / Analytics
 */

const PDFDocument = require('pdfkit');
const path = require('path');

// ─── Brand Tokens ─────────────────────────────────────────────────────────────
const BRAND = {
  primary:    '#4F46E5',   // Indigo-600
  secondary:  '#06B6D4',   // Cyan-500
  accent:     '#10B981',   // Emerald-500
  danger:     '#EF4444',   // Red-500
  warning:    '#F59E0B',   // Amber-500
  dark:       '#1E293B',   // Slate-800
  muted:      '#64748B',   // Slate-500
  light:      '#F8FAFC',   // Slate-50
  white:      '#FFFFFF',
  border:     '#E2E8F0',   // Slate-200
  gst:        '#7C3AED',   // Violet-600
  company:    'SmartPark Pro',
  tagline:    'Smart Parking Marketplace',
  gstin:      '27AABCU9603R1ZM',   // Sample GSTIN
  pan:        'AABCU9603R',
  address:    '5th Floor, Tech Tower, Bandra Kurla Complex, Mumbai – 400051',
  phone:      '+91-98765-43210',
  email:      'support@smartparkpro.in',
  website:    'www.smartparkpro.in',
  cin:        'U72900MH2023PTC123456',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = {
  currency: (n) => `₹${Number(n || 0).toFixed(2)}`,
  date:     (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
  datetime: (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—',
  dur:      (mins) => {
    if (!mins && mins !== 0) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  },
  pct:      (n) => `${Number(n || 0).toFixed(1)}%`,
};

/** Returns a Buffer containing the PDF bytes */
function renderToBuffer(fn) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks = [];
    doc.on('data',  (c) => chunks.push(c));
    doc.on('end',   ()  => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try { fn(doc); } catch (e) { reject(e); }
    doc.end();
  });
}

// ─── Shared Layout Primitives ─────────────────────────────────────────────────
function drawHeader(doc, title, subtitle = '') {
  // Top gradient bar (simulated with rectangle)
  doc.rect(0, 0, doc.page.width, 8).fill(BRAND.primary);
  doc.rect(0, 4, doc.page.width, 4).fill(BRAND.secondary);

  // Company wordmark
  doc.fontSize(22).font('Helvetica-Bold').fillColor(BRAND.primary)
     .text(BRAND.company, 50, 24);
  doc.fontSize(8).font('Helvetica').fillColor(BRAND.muted)
     .text(BRAND.tagline, 50, 50);

  // Document title (right-aligned)
  doc.fontSize(18).font('Helvetica-Bold').fillColor(BRAND.dark)
     .text(title, 50, 24, { align: 'right' });
  if (subtitle) {
    doc.fontSize(9).font('Helvetica').fillColor(BRAND.muted)
       .text(subtitle, 50, 46, { align: 'right' });
  }

  // Divider
  doc.moveTo(50, 70).lineTo(doc.page.width - 50, 70)
     .strokeColor(BRAND.border).lineWidth(1).stroke();

  return 85; // next Y position
}

function drawFooter(doc) {
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 45;
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y)
       .strokeColor(BRAND.border).lineWidth(0.5).stroke();
    doc.fontSize(7).font('Helvetica').fillColor(BRAND.muted)
       .text(`${BRAND.company}  |  ${BRAND.address}  |  GSTIN: ${BRAND.gstin}`, 50, y + 6, { align: 'center' });
    doc.text(`Page ${i + 1} of ${pageCount}  |  Generated: ${fmt.datetime(new Date())}`, 50, y + 18, { align: 'center' });
    doc.text(BRAND.website, 50, y + 30, { align: 'center', link: `https://${BRAND.website}` });
  }
}

function infoBox(doc, x, y, w, h, bgColor = BRAND.light) {
  doc.roundedRect(x, y, w, h, 6).fill(bgColor);
  return { x: x + 12, y: y + 10 };
}

function keyValue(doc, x, y, key, value, keyColor = BRAND.muted, valColor = BRAND.dark) {
  doc.fontSize(8).font('Helvetica').fillColor(keyColor).text(key, x, y);
  doc.fontSize(9).font('Helvetica-Bold').fillColor(valColor).text(String(value ?? '—'), x, y + 11);
  return y + 26;
}

function tableHeader(doc, x, y, cols, bgColor = BRAND.primary) {
  const totalWidth = cols.reduce((s, c) => s + c.width, 0);
  doc.rect(x, y, totalWidth, 20).fill(bgColor);
  let cx = x;
  cols.forEach(col => {
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.white)
       .text(col.label, cx + 4, y + 5, { width: col.width - 8, align: col.align || 'left' });
    cx += col.width;
  });
  return y + 20;
}

function tableRow(doc, x, y, cols, data, alt = false) {
  const totalWidth = cols.reduce((s, c) => s + c.width, 0);
  if (alt) doc.rect(x, y, totalWidth, 18).fill('#F1F5F9');
  let cx = x;
  cols.forEach((col, i) => {
    doc.fontSize(8).font('Helvetica').fillColor(BRAND.dark)
       .text(String(data[i] ?? '—'), cx + 4, y + 4, { width: col.width - 8, align: col.align || 'left' });
    cx += col.width;
  });
  // Bottom border
  doc.moveTo(x, y + 18).lineTo(x + totalWidth, y + 18).strokeColor(BRAND.border).lineWidth(0.3).stroke();
  return y + 18;
}

function statusBadge(doc, x, y, status) {
  const map = {
    Completed: { bg: '#DCFCE7', fg: '#16A34A' },
    Active:    { bg: '#DBEAFE', fg: '#2563EB' },
    PARKED:    { bg: '#DBEAFE', fg: '#2563EB' },
    Cancelled: { bg: '#FEE2E2', fg: '#DC2626' },
    Pending:   { bg: '#FEF9C3', fg: '#CA8A04' },
    Refunded:  { bg: '#EDE9FE', fg: '#7C3AED' },
  };
  const { bg, fg } = map[status] || { bg: '#F1F5F9', fg: BRAND.muted };
  const w = 70, h = 16;
  doc.roundedRect(x, y, w, h, 8).fill(bg);
  doc.fontSize(8).font('Helvetica-Bold').fillColor(fg).text(status, x, y + 3, { width: w, align: 'center' });
}

// ─── 1. BOOKING RECEIPT / PARKING INVOICE ─────────────────────────────────────
async function generateBookingReceipt(booking) {
  return renderToBuffer((doc) => {
    const b = booking;
    const zone  = b.zoneId || {};
    const slot  = b.slotId || {};
    const driver = b.userId || {};
    const vehicle = b.vehicleId || {};

    let y = drawHeader(doc, 'BOOKING RECEIPT', `Invoice No: INV-${b._id?.toString().slice(-8).toUpperCase()}`);

    // ─ Status Badge
    statusBadge(doc, doc.page.width - 130, 30, b.status || 'Completed');

    // ─ Two-column info grid ──────────────────────────────────────────────────
    const col1x = 50, col2x = 320, boxW = 240, boxH = 120;

    // Left box — Driver / Booking Info
    infoBox(doc, col1x, y, boxW, boxH);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.primary).text('DRIVER DETAILS', col1x + 12, y + 10);
    let ly = y + 24;
    ly = keyValue(doc, col1x + 12, ly, 'Name',    driver.fullName || 'N/A');
    ly = keyValue(doc, col1x + 12, ly, 'Email',   driver.email || 'N/A');
    ly = keyValue(doc, col1x + 12, ly, 'Phone',   driver.phone || 'N/A');
    keyValue(doc, col1x + 12, ly, 'Booking ID', b._id?.toString().slice(-10).toUpperCase() || 'N/A');

    // Right box — Parking / Provider Info
    infoBox(doc, col2x, y, boxW, boxH);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.primary).text('PARKING DETAILS', col2x + 12, y + 10);
    let ry = y + 24;
    ry = keyValue(doc, col2x + 12, ry, 'Parking Name', zone.name || 'N/A');
    ry = keyValue(doc, col2x + 12, ry, 'Address',      zone.address || 'N/A');
    ry = keyValue(doc, col2x + 12, ry, 'Slot No.',     slot.slotIdentifier || slot.slotNumber || 'N/A');
    keyValue(doc, col2x + 12, ry, 'QR Reference', b.qrToken?.slice(-10).toUpperCase() || 'N/A');

    y += boxH + 14;

    // ─ Vehicle & Time row ────────────────────────────────────────────────────
    infoBox(doc, col1x, y, boxW, 90);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.primary).text('VEHICLE', col1x + 12, y + 10);
    let vy = y + 24;
    vy = keyValue(doc, col1x + 12, vy, 'Make / Model', `${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'N/A');
    vy = keyValue(doc, col1x + 12, vy, 'Plate No.', b.vehiclePlate || vehicle.licensePlate || 'N/A');
    keyValue(doc, col1x + 12, vy, 'Type', vehicle.vehicleType || 'N/A');

    infoBox(doc, col2x, y, boxW, 90);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.primary).text('PARKING SESSION', col2x + 12, y + 10);
    let ty = y + 24;
    ty = keyValue(doc, col2x + 12, ty, 'Entry Time',  fmt.datetime(b.entryTime || b.startTime));
    ty = keyValue(doc, col2x + 12, ty, 'Exit Time',   fmt.datetime(b.exitTime || b.actualEndTime || b.endTime));
    keyValue(doc, col2x + 12, ty, 'Duration', b.hours ? `${b.hours}h` : '—');

    y += 104;

    // ─ Charge Breakdown ──────────────────────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND.dark).text('CHARGE BREAKDOWN', col1x, y);
    y += 16;

    const chargeCols = [
      { label: 'Description', width: 270, align: 'left' },
      { label: 'Qty', width: 60, align: 'center' },
      { label: 'Rate', width: 80, align: 'right' },
      { label: 'Amount', width: 85, align: 'right' },
    ];

    y = tableHeader(doc, col1x, y, chargeCols);

    const baseCharge = (b.totalCost || 0) - (b.fineAmount || 0);
    const gstRate    = 0.18;
    const baseNet    = baseCharge / (1 + gstRate);
    const gstAmt     = baseCharge - baseNet;

    const rows = [
      ['Parking Fee (Base)', `${b.hours || 1} hr`, fmt.currency(zone.basePricePerHour || 0) + '/hr', fmt.currency(baseNet)],
      ['GST @ 18% (CGST 9% + SGST 9%)', '—', '18%', fmt.currency(gstAmt)],
    ];
    if (b.fineAmount > 0) {
      rows.push(['Overstay / Fine Charge', '—', '—', fmt.currency(b.fineAmount)]);
    }
    rows.forEach((row, i) => {
      y = tableRow(doc, col1x, y, chargeCols, row, i % 2 === 1);
    });

    // Total row
    y += 4;
    doc.rect(col1x, y, chargeCols.reduce((s, c) => s + c.width, 0), 24).fill(BRAND.primary);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(BRAND.white)
       .text('TOTAL AMOUNT PAID', col1x + 8, y + 6)
       .text(fmt.currency(b.totalCost), col1x, y + 6, { width: chargeCols.reduce((s, c) => s + c.width, 0) - 8, align: 'right' });
    y += 28;

    // Payment mode
    y += 8;
    doc.fontSize(9).font('Helvetica').fillColor(BRAND.muted)
       .text('Payment Mode: SmartPark Wallet  |  Transaction Status: Paid  |  Currency: INR', col1x, y);

    // ─ GST Summary ───────────────────────────────────────────────────────────
    y += 20;
    infoBox(doc, col1x, y, 495, 60, '#F5F3FF');
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.gst).text('GST INVOICE SUMMARY', col1x + 12, y + 8);
    doc.fontSize(7.5).font('Helvetica').fillColor(BRAND.dark)
       .text(`Supplier GSTIN: ${BRAND.gstin}  |  SAC Code: 997212 (Parking / Valet Services)`, col1x + 12, y + 22)
       .text(`Taxable Value: ${fmt.currency(baseNet)}  |  CGST (9%): ${fmt.currency(gstAmt / 2)}  |  SGST (9%): ${fmt.currency(gstAmt / 2)}  |  Total Tax: ${fmt.currency(gstAmt)}`, col1x + 12, y + 34)
       .text(`Place of Supply: ${zone.city || 'Maharashtra'}  |  Reverse Charge Applicable: No`, col1x + 12, y + 46);
    y += 72;

    // ─ Terms ─────────────────────────────────────────────────────────────────
    doc.fontSize(7.5).font('Helvetica').fillColor(BRAND.muted)
       .text('This is a computer-generated receipt and does not require a signature. For disputes, contact support within 48 hours.', col1x, y, { width: 495 });

    drawFooter(doc);
  });
}

// ─── 2. REFUND RECEIPT ────────────────────────────────────────────────────────
async function generateRefundReceipt(transaction, booking = null) {
  return renderToBuffer((doc) => {
    const t = transaction;
    const b = booking || {};
    const driver = t.userId || {};

    let y = drawHeader(doc, 'REFUND RECEIPT', `Ref: REF-${t._id?.toString().slice(-8).toUpperCase()}`);

    // Refund amount hero box
    infoBox(doc, 50, y, 495, 70, '#F5F3FF');
    doc.fontSize(28).font('Helvetica-Bold').fillColor(BRAND.gst)
       .text(fmt.currency(t.amount), 50, y + 8, { width: 495, align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor(BRAND.muted)
       .text('REFUND AMOUNT CREDITED TO WALLET', 50, y + 44, { width: 495, align: 'center' });
    y += 86;

    // Info grid
    const col1x = 50, col2x = 280, boxW = 210, boxH = 100;
    infoBox(doc, col1x, y, boxW, boxH);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.primary).text('CUSTOMER DETAILS', col1x + 12, y + 10);
    let ly = y + 24;
    ly = keyValue(doc, col1x + 12, ly, 'Name',  driver.fullName || 'N/A');
    ly = keyValue(doc, col1x + 12, ly, 'Email', driver.email || 'N/A');
    keyValue(doc, col1x + 12, ly, 'Wallet Balance After', fmt.currency(t.balanceAfter));

    infoBox(doc, col2x, y, boxW, boxH);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.primary).text('REFUND DETAILS', col2x + 12, y + 10);
    let ry = y + 24;
    ry = keyValue(doc, col2x + 12, ry, 'Transaction ID', t._id?.toString().slice(-12).toUpperCase() || 'N/A');
    ry = keyValue(doc, col2x + 12, ry, 'Reason',         t.description || 'Booking Cancellation');
    if (b._id) keyValue(doc, col2x + 12, ry, 'Booking Ref', b._id?.toString().slice(-10).toUpperCase());

    y += boxH + 14;
    doc.fontSize(9).font('Helvetica').fillColor(BRAND.muted)
       .text(`Refund Date: ${fmt.datetime(t.createdAt)}  |  Mode: SmartPark Wallet Credit  |  Processing Time: Instant`, 50, y);
    y += 20;
    doc.fontSize(7.5).font('Helvetica').fillColor(BRAND.muted)
       .text('Refunds are processed instantly to your SmartPark Wallet. For bank withdrawal queries, contact support.', 50, y, { width: 495 });

    drawFooter(doc);
  });
}

// ─── 3. FINE / PENALTY RECEIPT ────────────────────────────────────────────────
async function generateFineReceipt(transaction, booking = null) {
  return renderToBuffer((doc) => {
    const t = transaction;
    const b = booking || {};
    const zone = b.zoneId || {};
    const slot = b.slotId || {};

    let y = drawHeader(doc, 'PENALTY NOTICE', `Fine: FN-${t._id?.toString().slice(-8).toUpperCase()}`);

    // Fine hero
    infoBox(doc, 50, y, 495, 70, '#FEF2F2');
    doc.fontSize(28).font('Helvetica-Bold').fillColor(BRAND.danger)
       .text(fmt.currency(t.amount), 50, y + 8, { width: 495, align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor(BRAND.muted)
       .text('PENALTY / FINE DEDUCTED FROM WALLET', 50, y + 44, { width: 495, align: 'center' });
    y += 86;

    const col1x = 50, col2x = 280, boxW = 210, boxH = 100;
    infoBox(doc, col1x, y, boxW, boxH);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.danger).text('FINE DETAILS', col1x + 12, y + 10);
    let ly = y + 24;
    ly = keyValue(doc, col1x + 12, ly, 'Reason',       t.description || 'Overstay Penalty');
    ly = keyValue(doc, col1x + 12, ly, 'Fine Amount',  fmt.currency(t.amount));
    keyValue(doc, col1x + 12, ly, 'Date',          fmt.datetime(t.createdAt));

    infoBox(doc, col2x, y, boxW, boxH);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.danger).text('BOOKING REFERENCE', col2x + 12, y + 10);
    let ry = y + 24;
    ry = keyValue(doc, col2x + 12, ry, 'Parking',  zone.name || 'N/A');
    ry = keyValue(doc, col2x + 12, ry, 'Slot',     slot.slotIdentifier || 'N/A');
    keyValue(doc, col2x + 12, ry, 'Booking ID', b._id?.toString().slice(-10).toUpperCase() || 'N/A');

    y += boxH + 14;
    doc.fontSize(8).font('Helvetica').fillColor(BRAND.muted)
       .text('Fines are charged for overstay beyond the booked duration. Repeated violations may affect your trust score.', 50, y, { width: 495 });

    drawFooter(doc);
  });
}

// ─── 4. WALLET TRANSACTION RECEIPT ───────────────────────────────────────────
async function generateWalletReceipt(transaction) {
  return renderToBuffer((doc) => {
    const t = transaction;
    const driver = t.userId || {};
    const isCredit = t.type === 'credit';

    let y = drawHeader(doc, 'WALLET STATEMENT', `TXN: ${t._id?.toString().slice(-10).toUpperCase()}`);

    infoBox(doc, 50, y, 495, 80, isCredit ? '#F0FDF4' : '#FEF2F2');
    doc.fontSize(30).font('Helvetica-Bold').fillColor(isCredit ? BRAND.accent : BRAND.danger)
       .text(`${isCredit ? '+' : '-'} ${fmt.currency(t.amount)}`, 50, y + 10, { width: 495, align: 'center' });
    doc.fontSize(9).font('Helvetica').fillColor(BRAND.muted)
       .text(isCredit ? 'AMOUNT CREDITED' : 'AMOUNT DEBITED', 50, y + 48, { width: 495, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor(BRAND.muted)
       .text(`Balance After: ${fmt.currency(t.balanceAfter)}`, 50, y + 62, { width: 495, align: 'center' });
    y += 96;

    const col1x = 50, col2x = 280, boxW = 210, boxH = 100;
    infoBox(doc, col1x, y, boxW, boxH);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.primary).text('ACCOUNT DETAILS', col1x + 12, y + 10);
    let ly = y + 24;
    ly = keyValue(doc, col1x + 12, ly, 'Name',  driver.fullName || 'N/A');
    ly = keyValue(doc, col1x + 12, ly, 'Email', driver.email || 'N/A');
    keyValue(doc, col1x + 12, ly, 'Wallet ID', t.walletId?.toString().slice(-10).toUpperCase() || 'N/A');

    infoBox(doc, col2x, y, boxW, boxH);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.primary).text('TRANSACTION DETAILS', col2x + 12, y + 10);
    let ry = y + 24;
    ry = keyValue(doc, col2x + 12, ry, 'Category',  t.category || 'N/A');
    ry = keyValue(doc, col2x + 12, ry, 'Description', t.description?.substring(0, 30) || 'N/A');
    keyValue(doc, col2x + 12, ry, 'Date & Time', fmt.datetime(t.createdAt));

    drawFooter(doc);
  });
}

// ─── 5. PROVIDER SETTLEMENT REPORT ───────────────────────────────────────────
async function generateProviderSettlement({ provider, settlements, period }) {
  return renderToBuffer((doc) => {
    let y = drawHeader(doc, 'PROVIDER SETTLEMENT', `Period: ${period}`);

    // Provider info
    infoBox(doc, 50, y, 495, 80);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.primary).text('PROVIDER DETAILS', 62, y + 10);
    let py = y + 24;
    doc.fontSize(8).font('Helvetica').fillColor(BRAND.muted).text('Business Name', 62, py);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND.dark).text(provider.businessName || provider.fullName || 'N/A', 62, py + 11);
    doc.fontSize(8).font('Helvetica').fillColor(BRAND.muted).text('Email', 200, py);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND.dark).text(provider.email || 'N/A', 200, py + 11);
    doc.fontSize(8).font('Helvetica').fillColor(BRAND.muted).text('GSTIN', 380, py);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND.dark).text(provider.gstNumber || 'N/A', 380, py + 11);
    doc.fontSize(8).font('Helvetica').fillColor(BRAND.muted).text('Bank Account', 62, py + 30);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND.dark).text(provider.bankAccount || 'N/A', 62, py + 41);
    doc.fontSize(8).font('Helvetica').fillColor(BRAND.muted).text('UPI', 200, py + 30);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND.dark).text(provider.upiId || 'N/A', 200, py + 41);
    y += 96;

    // Settlement table
    doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND.dark).text('SETTLEMENT BREAKDOWN', 50, y);
    y += 16;
    const cols = [
      { label: 'Zone / Lot',      width: 160, align: 'left' },
      { label: 'Bookings',        width: 70,  align: 'center' },
      { label: 'Gross Revenue',   width: 90,  align: 'right' },
      { label: 'Platform Fee',    width: 90,  align: 'right' },
      { label: 'Net Payout',      width: 85,  align: 'right' },
    ];
    y = tableHeader(doc, 50, y, cols);
    let totalGross = 0, totalFee = 0, totalNet = 0;
    settlements.forEach((s, i) => {
      const gross = s.gross || 0;
      const fee   = s.platformFee || gross * 0.15;
      const net   = gross - fee;
      totalGross += gross; totalFee += fee; totalNet += net;
      y = tableRow(doc, 50, y, cols, [
        s.zoneName || 'Zone', s.bookingCount || 0,
        fmt.currency(gross), fmt.currency(fee), fmt.currency(net)
      ], i % 2 === 1);
      if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
    });
    // Totals
    y += 2;
    doc.rect(50, y, cols.reduce((s, c) => s + c.width, 0), 22).fill(BRAND.accent);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND.white)
       .text('TOTAL', 58, y + 6)
       .text(fmt.currency(totalGross), 50, y + 6, { width: 320 + 90, align: 'right' })
    doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND.white)
       .text(fmt.currency(totalFee), 50, y + 6, { width: 320 + 90 + 90, align: 'right' })
    doc.fontSize(10).font('Helvetica-Bold').fillColor(BRAND.white)
       .text(fmt.currency(totalNet), 50, y + 5, { width: cols.reduce((s, c) => s + c.width, 0) - 8, align: 'right' });
    y += 36;

    doc.fontSize(8).font('Helvetica').fillColor(BRAND.muted)
       .text(`Platform Fee: 15% of Gross Revenue  |  GST on Platform Fee: 18%  |  Settlement Mode: Bank Transfer / UPI`, 50, y, { width: 495 });

    drawFooter(doc);
  });
}

// ─── 6. DAILY / MONTHLY ADMIN REPORT ─────────────────────────────────────────
async function generateAdminReport({ period, type = 'Daily', metrics, zones, topDrivers }) {
  return renderToBuffer((doc) => {
    let y = drawHeader(doc, `${type.toUpperCase()} REPORT`, `Period: ${period}  |  Generated by Admin`);

    // KPI Hero Row
    const kpis = [
      { label: 'Total Bookings',    value: metrics.totalBookings || 0,              color: BRAND.primary },
      { label: 'Revenue',           value: fmt.currency(metrics.totalRevenue || 0), color: BRAND.accent },
      { label: 'Occupancy Rate',    value: fmt.pct(metrics.avgOccupancy || 0),      color: BRAND.secondary },
      { label: 'Active Users',      value: metrics.activeUsers || 0,                color: BRAND.warning },
    ];
    const kpiW = 118;
    kpis.forEach((k, i) => {
      const kx = 50 + i * (kpiW + 5);
      infoBox(doc, kx, y, kpiW, 60);
      doc.fontSize(18).font('Helvetica-Bold').fillColor(k.color)
         .text(String(k.value), kx, y + 8, { width: kpiW, align: 'center' });
      doc.fontSize(7.5).font('Helvetica').fillColor(BRAND.muted)
         .text(k.label, kx, y + 36, { width: kpiW, align: 'center' });
    });
    y += 76;

    // Zone Performance Table
    if (zones && zones.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND.dark).text('ZONE PERFORMANCE', 50, y);
      y += 16;
      const cols = [
        { label: 'Zone Name',     width: 160, align: 'left' },
        { label: 'Bookings',      width: 70,  align: 'center' },
        { label: 'Occupancy %',   width: 80,  align: 'center' },
        { label: 'Revenue',       width: 90,  align: 'right' },
        { label: 'Avg Duration',  width: 95,  align: 'right' },
      ];
      y = tableHeader(doc, 50, y, cols);
      zones.forEach((z, i) => {
        y = tableRow(doc, 50, y, cols, [
          z.name, z.bookings || 0,
          fmt.pct(z.occupancy), fmt.currency(z.revenue), z.avgDuration || '—'
        ], i % 2 === 1);
        if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
      });
      y += 14;
    }

    // Top Drivers
    if (topDrivers && topDrivers.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND.dark).text('TOP DRIVERS', 50, y);
      y += 16;
      const cols = [
        { label: '#',          width: 30,  align: 'center' },
        { label: 'Driver',     width: 150, align: 'left' },
        { label: 'Bookings',   width: 70,  align: 'center' },
        { label: 'Spend',      width: 90,  align: 'right' },
        { label: 'Trust Score',width: 80,  align: 'center' },
        { label: 'Status',     width: 75,  align: 'center' },
      ];
      y = tableHeader(doc, 50, y, cols, BRAND.dark);
      topDrivers.forEach((d, i) => {
        y = tableRow(doc, 50, y, cols, [
          i + 1, d.fullName || 'N/A', d.bookings || 0,
          fmt.currency(d.spend), d.score || 500, d.status || 'Active'
        ], i % 2 === 1);
        if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
      });
    }

    drawFooter(doc);
  });
}

// ─── 7. ANALYTICS REPORT ─────────────────────────────────────────────────────
async function generateAnalyticsReport({ period, revenue, bookingsByHour, vehicleBreakdown, issueStats }) {
  return renderToBuffer((doc) => {
    let y = drawHeader(doc, 'ANALYTICS REPORT', `Period: ${period}`);

    // Revenue trend table
    if (revenue && revenue.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND.dark).text('REVENUE TREND', 50, y);
      y += 16;
      const cols = [
        { label: 'Date',      width: 120, align: 'left' },
        { label: 'Bookings',  width: 80,  align: 'center' },
        { label: 'Revenue',   width: 100, align: 'right' },
        { label: 'Avg Spend', width: 100, align: 'right' },
        { label: 'Growth',    width: 95,  align: 'right' },
      ];
      y = tableHeader(doc, 50, y, cols);
      revenue.forEach((r, i) => {
        const prev  = revenue[i - 1];
        const growth = prev && prev.revenue > 0
          ? (((r.revenue - prev.revenue) / prev.revenue) * 100).toFixed(1) + '%'
          : '—';
        y = tableRow(doc, 50, y, cols, [
          fmt.date(r.date), r.bookings || 0,
          fmt.currency(r.revenue), fmt.currency(r.avgSpend), growth
        ], i % 2 === 1);
        if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
      });
      y += 14;
    }

    // Vehicle type breakdown
    if (vehicleBreakdown && vehicleBreakdown.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND.dark).text('VEHICLE TYPE BREAKDOWN', 50, y);
      y += 16;
      const cols = [
        { label: 'Vehicle Type', width: 150, align: 'left' },
        { label: 'Bookings',     width: 80,  align: 'center' },
        { label: 'Revenue',      width: 100, align: 'right' },
        { label: 'Share %',      width: 80,  align: 'center' },
        { label: 'Avg Hrs',      width: 85,  align: 'center' },
      ];
      y = tableHeader(doc, 50, y, cols, BRAND.secondary);
      const totalB = vehicleBreakdown.reduce((s, v) => s + (v.bookings || 0), 0);
      vehicleBreakdown.forEach((v, i) => {
        const share = totalB > 0 ? ((v.bookings / totalB) * 100).toFixed(1) + '%' : '—';
        y = tableRow(doc, 50, y, cols, [
          v.type, v.bookings || 0, fmt.currency(v.revenue), share, v.avgHours || '—'
        ], i % 2 === 1);
        if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
      });
    }

    drawFooter(doc);
  });
}

// ─── 8. EMERGENCY INCIDENT REPORT ────────────────────────────────────────────
async function generateIncidentReport({ incident, booking, driver, zone }) {
  return renderToBuffer((doc) => {
    let y = drawHeader(doc, 'INCIDENT REPORT', `Ref: INC-${(incident._id || Date.now()).toString().slice(-8).toUpperCase()}`);

    // URGENT banner
    doc.rect(50, y, 495, 24).fill('#FEF2F2');
    doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND.danger)
       .text('⚠  EMERGENCY INCIDENT — CONFIDENTIAL', 50, y + 6, { width: 495, align: 'center' });
    y += 34;

    infoBox(doc, 50, y, 495, 110);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.danger).text('INCIDENT DETAILS', 62, y + 10);
    let iy = y + 24;
    iy = keyValue(doc, 62, iy, 'Incident Type',  incident.type || 'Emergency');
    iy = keyValue(doc, 62, iy, 'Reported At',    fmt.datetime(incident.createdAt));
    iy = keyValue(doc, 62, iy, 'Resolved At',    fmt.datetime(incident.resolvedAt));

    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND.danger).text('LOCATION & PARTIES', 280, y + 10);
    let jy = y + 24;
    jy = keyValue(doc, 280, jy, 'Parking Zone', zone?.name || 'N/A');
    jy = keyValue(doc, 280, jy, 'Driver',       driver?.fullName || 'N/A');
    jy = keyValue(doc, 280, jy, 'Booking Ref',  booking?._id?.toString().slice(-10).toUpperCase() || 'N/A');
    y += 126;

    doc.fontSize(10).font('Helvetica-Bold').fillColor(BRAND.dark).text('INCIDENT DESCRIPTION', 50, y);
    y += 14;
    doc.roundedRect(50, y, 495, 80, 6).fill(BRAND.light);
    doc.fontSize(9).font('Helvetica').fillColor(BRAND.dark)
       .text(incident.description || 'No description provided.', 62, y + 10, { width: 471, height: 60 });
    y += 94;

    doc.fontSize(10).font('Helvetica-Bold').fillColor(BRAND.dark).text('RESOLUTION NOTES', 50, y);
    y += 14;
    doc.roundedRect(50, y, 495, 60, 6).fill(BRAND.light);
    doc.fontSize(9).font('Helvetica').fillColor(BRAND.dark)
       .text(incident.resolution || 'Pending resolution.', 62, y + 10, { width: 471, height: 40 });

    drawFooter(doc);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────
module.exports = {
  generateBookingReceipt,
  generateRefundReceipt,
  generateFineReceipt,
  generateWalletReceipt,
  generateProviderSettlement,
  generateAdminReport,
  generateAnalyticsReport,
  generateIncidentReport,
  fmt,
};
