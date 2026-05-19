import PDFDocument from 'pdfkit';
import { createWriteStream } from 'fs';

/**
 * Generate the daily finance report as a real PDF document (NOT a DOM
 * screenshot). Pulls the same data shape the renderer would fetch from
 * /api/reports/daily, then composes it with pdfkit so the output is
 * always multi-page, paginated cleanly, and consistent regardless of
 * the on-screen layout or viewport.
 *
 * Architecture: this runs in the Electron main process, which already has
 * Prisma loaded (sqlite-bootstrap initialises it on packaged Windows;
 * the dev path uses the shared client). We import reportsService
 * dynamically so the bundle splits cleanly.
 */

const UZBEK_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
] as const;

function fmtUZSDecimal(value: { toFixed: (digits: number) => string } | string | number | null | undefined): string {
  if (value == null) return '0';
  let str: string;
  if (typeof value === 'string') str = value;
  else if (typeof value === 'number') str = String(Math.round(value));
  else str = value.toFixed(0);
  const n = Number(str);
  if (!Number.isFinite(n)) return '0';
  // Use space as thousands separator (Uzbek convention).
  return Math.round(n).toLocaleString('uz-UZ').replace(/,/g, ' ').replace(/ /g, ' ');
}

function fmtSigned(value: { toFixed: (digits: number) => string } | string | number | null | undefined): string {
  if (value == null) return '0';
  const raw = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : value.toFixed(0);
  const n = Number(raw);
  if (!Number.isFinite(n)) return '0';
  return (n < 0 ? '-' : '') + fmtUZSDecimal(Math.abs(n));
}

function fmtDateUz(d: Date): string {
  return `${d.getDate()} ${UZBEK_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtDateTimeShort(iso: string | Date | null): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm} ${hh}:${mi}`;
}

const STATUS_LABEL_UZ: Record<string, string> = {
  CLOSED: 'Yopilgan',
  CANCELED: 'Bekor',
  WALKOUT: "To'lamagan",
  OPEN: 'Ochiq',
  PARTIAL: 'Qisman',
  PAID: 'Yopilgan',
};

// ─── Style constants ──────────────────────────────────────────────────
const PAGE_MARGIN = 36; // 0.5 inch
const COLOR_TEXT = '#111827';
const COLOR_MUTED = '#6b7280';
const COLOR_PRIMARY = '#b45309'; // amber-700
const COLOR_SUCCESS = '#15803d';
const COLOR_DANGER = '#b91c1c';
const COLOR_WARNING = '#a16207';
const COLOR_BORDER = '#e5e7eb';
const COLOR_HEADER_BG = '#f3f4f6';
const COLOR_ZEBRA = '#f9fafb';

type Doc = PDFKit.PDFDocument;

// ─── Layout helpers ───────────────────────────────────────────────────

function pageContentWidth(doc: Doc): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensureSpace(doc: Doc, needed: number): void {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function sectionTitle(doc: Doc, title: string, subtitle?: string): void {
  ensureSpace(doc, 60);
  doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(13).text(title, { lineGap: 2 });
  if (subtitle) {
    doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(8.5).text(subtitle);
  }
  doc.moveDown(0.4);
  // underline
  const y = doc.y;
  doc.save()
    .strokeColor(COLOR_BORDER)
    .lineWidth(0.5)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .stroke()
    .restore();
  doc.moveDown(0.4);
}

function pageHeader(doc: Doc, title: string, dateLabel: string): void {
  // Brand line + report meta
  doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(11).text('CHAYXANA', PAGE_MARGIN, PAGE_MARGIN);
  doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(8).text(`Moliyaviy hisobot · ${dateLabel}`, { align: 'left' });
  doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(20).text(title, PAGE_MARGIN, PAGE_MARGIN + 26);
  doc.moveDown(0.6);
}

function footerOnPage(doc: Doc, pageNum: number, generatedAt: string): void {
  // CRITICAL #1: bottomY must be INSIDE the printable area. Drawing in the
  // margin makes pdfkit's text() auto-paginate, which re-fires 'pageAdded'.
  //
  // CRITICAL #2: we MUST restore doc.y after drawing. doc.text() advances the
  // cursor — leaving it parked at the bottom of the page causes the very next
  // text/ensureSpace call in user code to trigger another addPage(), which
  // fires pageAdded → re-enters footerOnPage → cursor at bottom again →
  // infinite page cascade (the symptom: PDF balloons to hundreds of pages).
  const savedY = doc.y;
  doc.save();
  doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(8);
  const bottomY = doc.page.height - doc.page.margins.bottom - 14;
  doc.text(`Yaratildi: ${generatedAt}`, doc.page.margins.left, bottomY, { lineBreak: false });
  doc.text(
    `${pageNum}`,
    doc.page.width - doc.page.margins.right - 30,
    bottomY,
    { lineBreak: false, width: 30, align: 'right' },
  );
  doc.restore();
  doc.y = savedY;
}

// ─── Two-column key/value list (for sales/cashflow/expenses summaries) ─

type KvRow = { label: string; value: string; bold?: boolean; tone?: 'good' | 'danger' | 'warn' | 'muted' };

function kvBlock(doc: Doc, title: string, rows: KvRow[], opts?: { columnWidth?: number }): void {
  ensureSpace(doc, 20 + rows.length * 14);
  doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(8).text(title.toUpperCase(), { lineGap: 1, characterSpacing: 0.5 });
  doc.moveDown(0.2);
  const width = opts?.columnWidth ?? pageContentWidth(doc);
  for (const row of rows) {
    const y = doc.y;
    const valueColor =
      row.tone === 'good' ? COLOR_SUCCESS :
      row.tone === 'danger' ? COLOR_DANGER :
      row.tone === 'warn' ? COLOR_WARNING :
      row.tone === 'muted' ? COLOR_MUTED :
      COLOR_TEXT;

    doc.fillColor(row.tone === 'muted' ? COLOR_MUTED : COLOR_TEXT)
      .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(9.5)
      .text(row.label, doc.page.margins.left, y, { width: width * 0.65, lineBreak: false });

    doc.fillColor(valueColor)
      .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(9.5)
      .text(row.value, doc.page.margins.left + width * 0.65, y, { width: width * 0.35, align: 'right', lineBreak: false });

    doc.moveDown(0.4);
    // separator
    const sepY = doc.y - 2;
    doc.save().strokeColor(COLOR_BORDER).lineWidth(0.3)
      .moveTo(doc.page.margins.left, sepY)
      .lineTo(doc.page.margins.left + width, sepY)
      .stroke().restore();
  }
  doc.moveDown(0.5);
}

// ─── Generic table renderer ───────────────────────────────────────────

type TableColumn = {
  header: string;
  width: number; // proportional weight if all weights sum to 1, else absolute px
  align?: 'left' | 'right' | 'center';
};
type TableCell = { text: string; tone?: 'good' | 'danger' | 'warn' | 'muted'; bold?: boolean };

function table(
  doc: Doc,
  columns: TableColumn[],
  rows: Array<TableCell[] | string[]>,
  opts?: { emptyMessage?: string; zebra?: boolean; footerRow?: TableCell[] | string[] },
): void {
  if (rows.length === 0) {
    doc.fillColor(COLOR_MUTED).font('Helvetica-Oblique').fontSize(9.5)
      .text(opts?.emptyMessage ?? 'Tanlangan sana uchun ma\'lumot yo\'q', { align: 'left' });
    doc.moveDown(0.5);
    return;
  }

  // Compute absolute widths
  const total = columns.reduce((s, c) => s + c.width, 0);
  const tableWidth = pageContentWidth(doc);
  const colWidths = columns.map((c) => (c.width / total) * tableWidth);

  const rowHeight = 18;
  const cellPadding = 4;

  const drawHeader = () => {
    const y = doc.y;
    // header bg
    doc.save()
      .fillColor(COLOR_HEADER_BG)
      .rect(doc.page.margins.left, y, tableWidth, rowHeight)
      .fill()
      .restore();
    let x = doc.page.margins.left;
    for (let i = 0; i < columns.length; i += 1) {
      const c = columns[i]!;
      doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(8.5)
        .text(c.header, x + cellPadding, y + 5, {
          width: colWidths[i]! - cellPadding * 2,
          align: c.align ?? 'left',
          lineBreak: false,
          ellipsis: true,
        });
      x += colWidths[i]!;
    }
    // header bottom border
    doc.save().strokeColor(COLOR_BORDER).lineWidth(0.5)
      .moveTo(doc.page.margins.left, y + rowHeight)
      .lineTo(doc.page.margins.left + tableWidth, y + rowHeight)
      .stroke().restore();
    doc.y = y + rowHeight;
  };

  drawHeader();

  const isCell = (v: TableCell | string): v is TableCell => typeof v === 'object' && v !== null && 'text' in v;

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r]!;
    const y = doc.y;
    // Page break if no room for one more row + footer
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
      drawHeader();
    }
    const ry = doc.y;
    if (opts?.zebra !== false && r % 2 === 1) {
      doc.save()
        .fillColor(COLOR_ZEBRA)
        .rect(doc.page.margins.left, ry, tableWidth, rowHeight)
        .fill()
        .restore();
    }
    let x = doc.page.margins.left;
    for (let i = 0; i < columns.length; i += 1) {
      const c = columns[i]!;
      const raw = row[i];
      const cell: TableCell = isCell(raw)
        ? raw
        : { text: typeof raw === 'string' ? raw : String(raw ?? '') };
      const color =
        cell.tone === 'good' ? COLOR_SUCCESS :
        cell.tone === 'danger' ? COLOR_DANGER :
        cell.tone === 'warn' ? COLOR_WARNING :
        cell.tone === 'muted' ? COLOR_MUTED :
        COLOR_TEXT;
      doc.fillColor(color)
        .font(cell.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .text(cell.text, x + cellPadding, ry + 5, {
          width: colWidths[i]! - cellPadding * 2,
          align: c.align ?? 'left',
          lineBreak: false,
          ellipsis: true,
        });
      x += colWidths[i]!;
    }
    // row separator
    doc.save().strokeColor(COLOR_BORDER).lineWidth(0.3)
      .moveTo(doc.page.margins.left, ry + rowHeight)
      .lineTo(doc.page.margins.left + tableWidth, ry + rowHeight)
      .stroke().restore();
    doc.y = ry + rowHeight;
  }

  if (opts?.footerRow) {
    const y = doc.y;
    if (y + rowHeight + 2 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }
    const ry = doc.y;
    doc.save()
      .fillColor(COLOR_HEADER_BG)
      .rect(doc.page.margins.left, ry, tableWidth, rowHeight)
      .fill()
      .restore();
    let x = doc.page.margins.left;
    for (let i = 0; i < columns.length; i += 1) {
      const c = columns[i]!;
      const raw = opts.footerRow[i];
      const cell: TableCell = isCell(raw)
        ? raw
        : { text: typeof raw === 'string' ? raw : String(raw ?? '') };
      doc.fillColor(COLOR_TEXT)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(cell.text, x + cellPadding, ry + 5, {
          width: colWidths[i]! - cellPadding * 2,
          align: c.align ?? 'left',
          lineBreak: false,
          ellipsis: true,
        });
      x += colWidths[i]!;
    }
    doc.y = ry + rowHeight;
  }
  doc.moveDown(0.6);
}

function sumStrings(values: string[]): number {
  return values.reduce((s, v) => s + Number(v || '0'), 0);
}

// ─── The main report ──────────────────────────────────────────────────

export async function generateDailyReportPdf(opts: {
  date: Date;
  outputPath: string;
}): Promise<void> {
  // Load reportsService lazily so this module doesn't drag the whole
  // server into early startup paths that don't use PDF.
  const { reportsService } = await import('./server/services/reports.service');
  const data = await reportsService.daily(opts.date);

  const dateLabel = fmtDateUz(opts.date);
  const generatedAt = fmtDateTimeShort(new Date());

  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, info: {
    Title: `Chayxana — Kunlik hisobot — ${dateLabel}`,
    Author: 'Chayxana Master',
    Subject: `Daily financial report for ${dateLabel}`,
    CreationDate: new Date(),
  } });

  const stream = createWriteStream(opts.outputPath);
  doc.pipe(stream);

  // Page numbering: pdfkit needs a per-page hook.
  // Re-entrance guard: if footerOnPage ever causes pdfkit to auto-paginate,
  // 'pageAdded' would re-fire while we're still inside the previous footer
  // render, recursing into doc.text() forever. Belt-and-suspenders alongside
  // keeping bottomY inside the printable area.
  let pageNum = 1;
  let inFooter = false;
  const tagPage = () => {
    if (inFooter) return;
    inFooter = true;
    try {
      footerOnPage(doc, pageNum, generatedAt);
    } finally {
      inFooter = false;
    }
  };
  doc.on('pageAdded', () => {
    tagPage();
    pageNum += 1;
  });

  pageHeader(doc, 'Kunlik moliyaviy hisobot', dateLabel);

  // ─── 1. Yakuniy ko'rsatkichlar (headline block) ────────────────────
  sectionTitle(doc, 'Yakuniy ko\'rsatkichlar', 'Bu kun bo\'yicha eng asosiy raqamlar');
  kvBlock(doc, 'Foyda hisobi', [
    { label: 'Sof savdo', value: fmtUZSDecimal(data.sales.netSales) + ' so\'m' },
    { label: 'Netto chiqim', value: '-' + fmtUZSDecimal(data.expenses.net) + ' so\'m', tone: 'muted' },
    {
      label: 'Sof foyda (savdo asosida)',
      value: fmtSigned(data.results.salesBasedProfit) + ' so\'m',
      bold: true,
      tone: Number(data.results.salesBasedProfit) >= 0 ? 'good' : 'danger',
    },
    { label: 'Pul oqimi natijasi', value: fmtSigned(data.results.cashflowBasedNet) + ' so\'m', bold: true },
    { label: 'Xizmat haqi (alohida)', value: fmtUZSDecimal(data.sales.serviceCharge) + ' so\'m', tone: 'muted' },
  ]);

  kvBlock(doc, 'To\'lov tekshiruvi', [
    { label: 'Yakuniy chek summasi', value: fmtUZSDecimal(data.checks.salesVsPayments.billedTotal) + ' so\'m' },
    { label: 'To\'lovlar yig\'indisi', value: fmtUZSDecimal(data.checks.salesVsPayments.paymentTotal) + ' so\'m' },
    {
      label: 'Farq',
      value: fmtSigned(data.checks.salesVsPayments.difference) + ' so\'m',
      bold: true,
      tone: Number(data.checks.salesVsPayments.difference) === 0 ? 'good' : 'danger',
    },
  ]);

  // ─── 2. Savdo qisqacha ────────────────────────────────────────────
  sectionTitle(doc, 'Savdo qisqacha');
  kvBlock(doc, 'Buyurtmalar', [
    { label: 'Yopilgan', value: `${data.sales.closedOrders} ta` },
    { label: 'Bekor qilingan', value: `${data.sales.canceledOrders} ta`, tone: data.sales.canceledOrders > 0 ? 'warn' : 'muted' },
    { label: 'To\'lamay ketgan', value: `${data.sales.walkoutOrders} ta`, tone: data.sales.walkoutOrders > 0 ? 'danger' : 'muted' },
  ]);
  kvBlock(doc, 'Summalar', [
    { label: 'Brutto savdo', value: fmtUZSDecimal(data.sales.grossSales) + ' so\'m' },
    { label: 'Chegirmalar', value: '-' + fmtUZSDecimal(data.sales.discounts) + ' so\'m', tone: 'muted' },
    { label: 'Sof ovqat savdosi', value: fmtUZSDecimal(data.sales.netSales) + ' so\'m', bold: true },
    { label: 'Xizmat haqi (mijoz to\'lagan)', value: fmtUZSDecimal(data.sales.serviceCharge) + ' so\'m' },
    { label: 'Qarzga sotildi', value: fmtUZSDecimal(data.sales.debtSales) + ' so\'m', tone: Number(data.sales.debtSales) > 0 ? 'warn' : 'muted' },
  ]);

  // ─── 3. Pul oqimi ──────────────────────────────────────────────────
  sectionTitle(doc, 'Pul oqimi', 'Kassaga tushgan va undan ketgan pul');
  kvBlock(doc, 'Kirim', [
    { label: 'Naqd (buyurtmalardan)', value: fmtUZSDecimal(data.cashflow.orderCash) + ' so\'m' },
    { label: 'Karta (buyurtmalardan)', value: fmtUZSDecimal(data.cashflow.orderCard) + ' so\'m' },
    { label: 'Nasiya qaytimi (naqd)', value: fmtUZSDecimal(data.cashflow.debtRepaymentsCash) + ' so\'m', tone: Number(data.cashflow.debtRepaymentsCash) > 0 ? 'good' : 'muted' },
    { label: 'Nasiya qaytimi (karta)', value: fmtUZSDecimal(data.cashflow.debtRepaymentsCard) + ' so\'m', tone: Number(data.cashflow.debtRepaymentsCard) > 0 ? 'good' : 'muted' },
    { label: 'Jami real kirim', value: fmtUZSDecimal(data.cashflow.realCashIn) + ' so\'m', bold: true },
  ]);
  kvBlock(doc, 'Chiqim', [
    { label: 'Kiritilgan chiqim', value: fmtUZSDecimal(data.checks.expenses.recordedExpense) + ' so\'m' },
    { label: 'Bekor qilingan', value: fmtUZSDecimal(data.checks.expenses.reversalAmount) + ' so\'m', tone: Number(data.checks.expenses.reversalAmount) > 0 ? 'warn' : 'muted' },
    { label: 'Netto chiqim', value: fmtUZSDecimal(data.expenses.net) + ' so\'m', bold: true },
  ]);

  // ─── 4. Xarajatlar — turkumlar + items ────────────────────────────
  doc.addPage();
  sectionTitle(doc, 'Xarajatlar', 'Turkumlar bo\'yicha summa va to\'liq ro\'yxat');
  if (data.expenses.byCategory.length > 0) {
    table(
      doc,
      [
        { header: 'Turkum', width: 4 },
        { header: 'Summa (so\'m)', width: 2, align: 'right' },
      ],
      data.expenses.byCategory.map((c) => [
        c.categoryName,
        { text: fmtUZSDecimal(c.amount), bold: true },
      ]),
      {
        footerRow: [
          'JAMI',
          fmtUZSDecimal(sumStrings(data.expenses.byCategory.map((c) => c.amount))),
        ],
      },
    );
  } else {
    doc.fillColor(COLOR_MUTED).font('Helvetica-Oblique').fontSize(9.5)
      .text('Bu sana uchun chiqimlar turkumi yo\'q', { align: 'left' });
    doc.moveDown(0.5);
  }

  if (data.expenses.items.length > 0) {
    sectionTitle(doc, 'Xarajatlar — to\'liq ro\'yxat');
    table(
      doc,
      [
        { header: 'Vaqti', width: 1.4 },
        { header: 'Turkum', width: 2 },
        { header: 'Sabab', width: 4 },
        { header: 'Kim kiritdi', width: 2 },
        { header: 'Summa (so\'m)', width: 1.6, align: 'right' },
      ],
      data.expenses.items.map((it) => [
        fmtDateTimeShort(it.occurredAt),
        it.categoryName,
        it.reason,
        it.createdByName,
        {
          text: fmtSigned(it.signedAmount),
          tone: it.status === 'REVERSAL' ? 'danger' : undefined,
          bold: true,
        },
      ]),
      {
        footerRow: [
          'JAMI (netto)',
          '',
          '',
          '',
          fmtUZSDecimal(data.expenses.net),
        ],
      },
    );
  }

  // ─── 5. Buyurtmalar registri ──────────────────────────────────────
  doc.addPage();
  sectionTitle(doc, 'Buyurtmalar reestri', 'Tanlangan kun bo\'yicha barcha yopilgan, bekor qilingan va to\'lamagan');
  if (data.ordersTable.length > 0) {
    const totals = {
      gross: sumStrings(data.ordersTable.map((o) => o.gross)),
      discount: sumStrings(data.ordersTable.map((o) => o.discount)),
      net: sumStrings(data.ordersTable.map((o) => o.net)),
      cash: sumStrings(data.ordersTable.map((o) => o.cash)),
      card: sumStrings(data.ordersTable.map((o) => o.card)),
      debt: sumStrings(data.ordersTable.map((o) => o.debt)),
    };
    table(
      doc,
      [
        { header: 'Vaqti', width: 1.2 },
        { header: '#', width: 0.9 },
        { header: 'Stol', width: 1.4 },
        { header: 'Ofitsiant', width: 1.7 },
        { header: 'Holat', width: 1 },
        { header: 'Brutto', width: 1.2, align: 'right' },
        { header: 'Sof', width: 1.2, align: 'right' },
        { header: 'Naqd', width: 1.2, align: 'right' },
        { header: 'Karta', width: 1.2, align: 'right' },
        { header: 'Qarz', width: 1.2, align: 'right' },
      ],
      data.ordersTable.map((o) => [
        fmtDateTimeShort(o.at),
        o.orderNumber,
        o.tableName ?? 'Olib ketish',
        o.waiterName,
        STATUS_LABEL_UZ[o.status] ?? o.status,
        fmtUZSDecimal(o.gross),
        { text: fmtUZSDecimal(o.net), bold: true },
        fmtUZSDecimal(o.cash),
        fmtUZSDecimal(o.card),
        { text: fmtUZSDecimal(o.debt), tone: Number(o.debt) > 0 ? 'warn' : undefined },
      ]),
      {
        footerRow: [
          'JAMI',
          `${data.ordersTable.length} ta`,
          '',
          '',
          '',
          fmtUZSDecimal(totals.gross),
          fmtUZSDecimal(totals.net),
          fmtUZSDecimal(totals.cash),
          fmtUZSDecimal(totals.card),
          fmtUZSDecimal(totals.debt),
        ],
      },
    );
  } else {
    doc.fillColor(COLOR_MUTED).font('Helvetica-Oblique').fontSize(9.5)
      .text('Bu sana uchun buyurtmalar topilmadi', { align: 'left' });
  }

  // ─── 6. Ofitsiantlar bo'yicha ────────────────────────────────────
  doc.addPage();
  sectionTitle(doc, 'Ofitsiantlar bo\'yicha', 'Har bir ofitsiantning yopilgan buyurtmalari va daromadi');
  if (data.perWaiter.length > 0) {
    table(
      doc,
      [
        { header: 'Ofitsiant', width: 3 },
        { header: 'Buyurtmalar', width: 1.4, align: 'right' },
        { header: 'Daromad (sof)', width: 2, align: 'right' },
        { header: 'Xizmat haqi', width: 1.8, align: 'right' },
        { header: 'O\'rt. chek', width: 1.6, align: 'right' },
      ],
      data.perWaiter.map((w) => {
        const avg = w.orders > 0 ? Number(w.revenue) / w.orders : 0;
        return [
          w.waiterName,
          `${w.orders} ta`,
          { text: fmtUZSDecimal(w.revenue), bold: true },
          { text: fmtUZSDecimal(w.serviceEarned), tone: Number(w.serviceEarned) > 0 ? 'good' : 'muted' },
          { text: fmtUZSDecimal(avg), tone: 'muted' },
        ];
      }),
      {
        footerRow: [
          `JAMI (${data.perWaiter.length} ofitsiant)`,
          `${data.perWaiter.reduce((s, w) => s + w.orders, 0)} ta`,
          fmtUZSDecimal(sumStrings(data.perWaiter.map((w) => w.revenue))),
          fmtUZSDecimal(sumStrings(data.perWaiter.map((w) => w.serviceEarned))),
          '',
        ],
      },
    );
  } else {
    doc.fillColor(COLOR_MUTED).font('Helvetica-Oblique').fontSize(9.5)
      .text('Bu sana uchun ofitsiantlar daromadi topilmadi', { align: 'left' });
  }

  // ─── 7. Taomlar bo'yicha sotuv ───────────────────────────────────
  doc.addPage();
  sectionTitle(doc, 'Taomlar bo\'yicha sotuv', 'Har bir taom necha marta va qancha summaga sotilgan');
  if (data.mealSales.length > 0) {
    table(
      doc,
      [
        { header: 'Taom', width: 3.2 },
        { header: 'Turkum', width: 1.8 },
        { header: 'Miqdor', width: 1.2, align: 'right' },
        { header: 'Buyurtmalarda', width: 1.4, align: 'right' },
        { header: 'Brutto savdo', width: 1.7, align: 'right' },
        { header: 'O\'rt. 1 buyurtma', width: 1.7, align: 'right' },
      ],
      data.mealSales.map((m) => [
        m.mealName,
        m.categoryName ?? '—',
        `${m.qtyOrdered}`,
        `${m.ordersCount}`,
        { text: fmtUZSDecimal(m.grossSales), bold: true },
        { text: fmtUZSDecimal(m.avgPerOrder), tone: 'muted' },
      ]),
      {
        footerRow: [
          `JAMI (${data.mealSales.length} ta turdagi taom)`,
          '',
          `${data.mealSales.reduce((s, m) => s + m.qtyOrdered, 0)} dona`,
          `${data.mealSales.reduce((s, m) => s + m.ordersCount, 0)} ta`,
          fmtUZSDecimal(sumStrings(data.mealSales.map((m) => m.grossSales))),
          '',
        ],
      },
    );
  } else {
    doc.fillColor(COLOR_MUTED).font('Helvetica-Oblique').fontSize(9.5)
      .text('Bu sana uchun taom sotuvi topilmadi', { align: 'left' });
  }

  // ─── 8. Bekor / Walkout ───────────────────────────────────────────
  doc.addPage();
  sectionTitle(doc, 'Bekor qilingan va to\'lamay ketgan buyurtmalar');
  doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(9)
    .text(`Bekor qilingan — ${data.cancellations.length} ta`);
  doc.moveDown(0.2);
  table(
    doc,
    [
      { header: 'Vaqti', width: 1.4 },
      { header: 'Buyurtma ID', width: 1.4 },
      { header: 'Kim bekor qildi', width: 2 },
      { header: 'Sabab', width: 5 },
    ],
    data.cancellations.map((c) => [
      fmtDateTimeShort(c.canceledAt),
      c.orderId.slice(-6).toUpperCase(),
      c.canceledBy,
      c.reason || '—',
    ]),
    { emptyMessage: 'Bu sana uchun bekor qilingan buyurtmalar yo\'q' },
  );

  doc.moveDown(0.3);
  const walkoutTotal = sumStrings(data.walkouts.map((w) => w.amount));
  doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(9)
    .text(`To'lamay ketgan — ${data.walkouts.length} ta · Yo'qotilgan summa: ${fmtUZSDecimal(walkoutTotal)} so'm`);
  doc.moveDown(0.2);
  table(
    doc,
    [
      { header: 'Vaqti', width: 1.4 },
      { header: 'Buyurtma ID', width: 1.4 },
      { header: 'Kim belgiladi', width: 2 },
      { header: 'Summa', width: 1.5, align: 'right' },
      { header: 'Sabab', width: 3.5 },
    ],
    data.walkouts.map((w) => [
      fmtDateTimeShort(w.markedAt),
      w.orderId.slice(-6).toUpperCase(),
      w.markedBy,
      { text: fmtUZSDecimal(w.amount), tone: 'danger', bold: true },
      w.reason || '—',
    ]),
    { emptyMessage: 'Bu sana uchun to\'lamay ketgan buyurtmalar yo\'q' },
  );

  // ─── 9. Nasiya ledger ─────────────────────────────────────────────
  doc.addPage();
  sectionTitle(doc, 'Nasiyalar', 'Bugungi nasiya harakati va to\'liq qarz ledger\'i');
  kvBlock(doc, 'Bugun', [
    { label: 'Ochilgan nasiya', value: fmtUZSDecimal(data.debtSnapshot.openedTodayAmount) + ' so\'m', tone: Number(data.debtSnapshot.openedTodayAmount) > 0 ? 'warn' : 'muted' },
    { label: '  shundan yangi yozuv', value: `${data.debtSnapshot.openedTodayCount} ta`, tone: 'muted' },
    { label: 'Bugun qaytarilgan', value: fmtUZSDecimal(data.debtSnapshot.repaidTodayAmount) + ' so\'m', tone: Number(data.debtSnapshot.repaidTodayAmount) > 0 ? 'good' : 'muted' },
    { label: '  shundan to\'lov', value: `${data.debtSnapshot.repayments.length} ta`, tone: 'muted' },
    { label: 'Jami qarz qoldig\'i', value: fmtUZSDecimal(data.debtSnapshot.outstandingTotal) + ' so\'m', bold: true, tone: Number(data.debtSnapshot.outstandingTotal) > 0 ? 'danger' : 'good' },
  ]);

  if (data.debtLedger.length > 0) {
    doc.moveDown(0.2);
    table(
      doc,
      [
        { header: 'Ochilgan', width: 1.3 },
        { header: '#', width: 0.8 },
        { header: 'Mijoz', width: 2.5 },
        { header: 'Nasiya', width: 1.3, align: 'right' },
        { header: 'Bugun qaytgan', width: 1.4, align: 'right' },
        { header: 'Jami qaytgan', width: 1.4, align: 'right' },
        { header: 'Qoldiq', width: 1.4, align: 'right' },
        { header: 'Holat', width: 1.1 },
      ],
      data.debtLedger.map((d) => [
        fmtDateTimeShort(d.openedAt),
        d.orderNumber,
        d.debtorPhone ? `${d.debtorName} (${d.debtorPhone})` : d.debtorName,
        fmtUZSDecimal(d.originalAmount),
        { text: fmtUZSDecimal(d.repaidToday), tone: Number(d.repaidToday) > 0 ? 'good' : 'muted' },
        fmtUZSDecimal(d.totalRepaid),
        { text: fmtUZSDecimal(d.remainingAmount), tone: Number(d.remainingAmount) > 0 ? 'danger' : undefined, bold: true },
        STATUS_LABEL_UZ[d.status] ?? d.status,
      ]),
      {
        footerRow: [
          `JAMI (${data.debtLedger.length})`,
          '',
          '',
          fmtUZSDecimal(sumStrings(data.debtLedger.map((d) => d.originalAmount))),
          fmtUZSDecimal(sumStrings(data.debtLedger.map((d) => d.repaidToday))),
          fmtUZSDecimal(sumStrings(data.debtLedger.map((d) => d.totalRepaid))),
          fmtUZSDecimal(sumStrings(data.debtLedger.map((d) => d.remainingAmount))),
          '',
        ],
      },
    );
  }

  // ─── 10. Yakuniy hisobot — single page summary ────────────────────
  doc.addPage();
  sectionTitle(doc, 'YAKUNIY HISOBOT', `Barcha asosiy raqamlar bir joyda — ${dateLabel}`);

  kvBlock(doc, 'Savdo / Daromad', [
    { label: 'Brutto savdo', value: fmtUZSDecimal(data.sales.grossSales) + ' so\'m' },
    { label: 'Chegirmalar', value: '-' + fmtUZSDecimal(data.sales.discounts) + ' so\'m', tone: 'muted' },
    { label: 'Sof ovqat savdosi', value: fmtUZSDecimal(data.sales.netSales) + ' so\'m', bold: true },
    { label: 'Xizmat haqi (ofitsiantlarga)', value: fmtUZSDecimal(data.sales.serviceCharge) + ' so\'m', tone: 'muted' },
    { label: 'Yakuniy chek summasi', value: fmtUZSDecimal(data.checks.salesVsPayments.billedTotal) + ' so\'m', bold: true },
  ]);

  kvBlock(doc, 'Real kassa kirimi', [
    { label: 'Naqd (buyurtmalardan)', value: fmtUZSDecimal(data.cashflow.orderCash) + ' so\'m' },
    { label: 'Karta (buyurtmalardan)', value: fmtUZSDecimal(data.cashflow.orderCard) + ' so\'m' },
    { label: 'Nasiya qaytimi (naqd)', value: fmtUZSDecimal(data.cashflow.debtRepaymentsCash) + ' so\'m', tone: Number(data.cashflow.debtRepaymentsCash) > 0 ? 'good' : 'muted' },
    { label: 'Nasiya qaytimi (karta)', value: fmtUZSDecimal(data.cashflow.debtRepaymentsCard) + ' so\'m', tone: Number(data.cashflow.debtRepaymentsCard) > 0 ? 'good' : 'muted' },
    { label: 'Jami real kirim', value: fmtUZSDecimal(data.cashflow.realCashIn) + ' so\'m', bold: true },
    { label: 'Qarzga sotildi (kelajak)', value: fmtUZSDecimal(data.sales.debtSales) + ' so\'m', tone: Number(data.sales.debtSales) > 0 ? 'warn' : 'muted' },
  ]);

  kvBlock(doc, 'Chiqimlar (netto)', [
    { label: 'Kiritilgan brutto', value: fmtUZSDecimal(data.expenses.gross) + ' so\'m' },
    { label: 'Bekor qilingan', value: '-' + fmtUZSDecimal(data.checks.expenses.reversalAmount) + ' so\'m', tone: 'muted' },
    { label: 'Netto chiqim', value: fmtUZSDecimal(data.expenses.net) + ' so\'m', bold: true, tone: 'warn' },
  ]);

  kvBlock(doc, 'Nasiya holati (bugun yopilgandagi)', [
    { label: 'Bugun ochilgan', value: fmtUZSDecimal(data.debtSnapshot.openedTodayAmount) + ' so\'m', tone: Number(data.debtSnapshot.openedTodayAmount) > 0 ? 'warn' : 'muted' },
    { label: 'Bugun qaytarilgan', value: fmtUZSDecimal(data.debtSnapshot.repaidTodayAmount) + ' so\'m', tone: Number(data.debtSnapshot.repaidTodayAmount) > 0 ? 'good' : 'muted' },
    { label: 'Jami qoldiq', value: fmtUZSDecimal(data.debtSnapshot.outstandingTotal) + ' so\'m', bold: true, tone: Number(data.debtSnapshot.outstandingTotal) > 0 ? 'danger' : 'good' },
  ]);

  kvBlock(doc, 'Yakuniy natija', [
    {
      label: 'SOF FOYDA (savdo asosida)',
      value: fmtSigned(data.results.salesBasedProfit) + ' so\'m',
      bold: true,
      tone: Number(data.results.salesBasedProfit) >= 0 ? 'good' : 'danger',
    },
    {
      label: 'KASSA HARAKATI (real)',
      value: fmtSigned(data.results.cashflowBasedNet) + ' so\'m',
      bold: true,
      tone: Number(data.results.cashflowBasedNet) >= 0 ? 'good' : 'danger',
    },
  ]);

  // Tag the first page now that we know we have at least one
  tagPage();

  doc.end();

  // Wait for the stream to flush before resolving so the caller can verify the file.
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}
