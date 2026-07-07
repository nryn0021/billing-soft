// Native document exporters — every library is dynamically imported so the main
// bundle stays lean; the ~megabyte of xlsx/pdf/docx only loads when the user exports.

function rawCell(col, row) {
  const v = typeof col.value === "function" ? col.value(row) : row[col.key];
  return v == null ? "" : v;
}
function dispCell(col, row) {
  const v = rawCell(col, row);
  return col.fmt ? col.fmt(v, row) : v;
}

/** Excel (.xlsx) via SheetJS. Uses raw values so numbers stay numeric. */
export async function exportXlsx(filename, { columns, rows, sheetName = "Report" }) {
  const XLSX = await import("xlsx");
  const header = columns.map((c) => c.label);
  const body = rows.map((row) => columns.map((c) => rawCell(c, row)));
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws["!cols"] = columns.map((c) => ({ wch: Math.max(10, c.label.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** PDF table via jsPDF + autotable. */
export async function exportPdfTable(filename, { title, subtitle, columns, rows }) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(16); doc.text(title || "Report", 40, 44);
  if (subtitle) { doc.setFontSize(10); doc.setTextColor(120); doc.text(subtitle, 40, 60); doc.setTextColor(20); }
  autoTable(doc, {
    startY: 74,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => String(dispCell(c, row)))),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [21, 118, 79], textColor: 255 },
    alternateRowStyles: { fillColor: [244, 247, 242] },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, { halign: c.right ? "right" : "left" }])),
  });
  doc.save(`${filename}.pdf`);
}

/** Word (.docx) table via docx. */
export async function exportDocxTable(filename, { title, subtitle, columns, rows }) {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType, AlignmentType } = docx;
  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map((c) => new TableCell({
      shading: { fill: "15764F" },
      children: [new Paragraph({ alignment: c.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: c.label, bold: true, color: "FFFFFF", size: 18 })] })],
    })),
  });
  const bodyRows = rows.map((row) => new TableRow({
    children: columns.map((c) => new TableCell({
      children: [new Paragraph({ alignment: c.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: String(dispCell(c, row)), size: 18 })] })],
    })),
  }));
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(title || "Report")] }),
        ...(subtitle ? [new Paragraph({ children: [new TextRun({ text: subtitle, color: "667569" })] })] : []),
        new Paragraph({ children: [new TextRun("")] }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] }),
      ],
    }],
  });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${filename}.docx`);
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Small coloured payment-status stamp for the A4 PDF. jsPDF's core font can't render ₹,
// so the rupee sign is swapped for "Rs " here.
function drawPdfStamp(doc, ps, x, y, w) {
  const col = ps.state === "paid" ? [10, 143, 10] : ps.state === "partial" ? [209, 122, 21] : [204, 59, 48];
  const h = 15;
  doc.setDrawColor(col[0], col[1], col[2]); doc.setLineWidth(0.9);
  doc.roundedRect(x, y, w, h, 2, 2);
  doc.setTextColor(col[0], col[1], col[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(ps.label.replace("₹", "Rs "), x + w / 2, y + 7, { align: "center" });
  doc.setFontSize(7); doc.text(String(ps.sub).toUpperCase(), x + w / 2, y + 11.5, { align: "center" });
  doc.setTextColor(19, 29, 24); doc.setDrawColor(19, 29, 24); doc.setLineWidth(0.5); doc.setFont("helvetica", "normal");
}

/**
 * A4 invoice PDF drawn with jsPDF — a black-and-white bordered layout that mirrors the
 * truck "Bill of Supply" (thin black rules, no colour accents), so it prints clean on any
 * office printer. Everything stays on ONE A4 page: the goods description wraps inside a fixed
 * column instead of bleeding across the amount columns, and no addPage() is ever called.
 * Per-document element visibility comes from Settings → Documents (`documents.a4`).
 */
export async function invoicePdf(invoice, settings, qrDataUrl, { amountInWords }) {
  const { jsPDF } = await import("jspdf");
  const { paymentStamp } = await import("./format");
  const { docPref, docText } = await import("./docPrefs");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const isSale = invoice.type === "sale";
  const b = settings.business || {}; const bank = settings.bank || {};
  const inv = settings.invoice || {};
  const INK = [17, 19, 15]; // near-black ink for all text + borders
  const M = 14, R = 210 - M; // left/right page margins
  const money = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const setInk = () => { doc.setTextColor(INK[0], INK[1], INK[2]); doc.setDrawColor(INK[0], INK[1], INK[2]); };
  setInk(); doc.setLineWidth(0.3);

  // Per-document toggles
  const showBank = docPref(settings, "a4", "bank");
  const showStamp = docPref(settings, "a4", "stamp");
  const showSignature = docPref(settings, "a4", "signature");
  const showRemarks = docPref(settings, "a4", "remarks");
  const showTerms = docPref(settings, "a4", "terms");
  const termsText = docText(settings, "a4", "terms", inv.terms || "");
  const footerText = docText(settings, "a4", "footer", inv.footer || "");

  let y = 16;

  // ---- Header: business identity (left) + document title/no/date (right) ----
  doc.setFont("helvetica", "bold"); doc.setFontSize(17);
  doc.text(b.name || "Business", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  const idLines = [...(b.addressLines || []), `Owner: ${b.owner || ""}  ·  ${b.contact || ""}`, `GSTIN: ${b.gstin || "-"}`];
  doc.text(idLines, M, y + 5.5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(isSale ? "SALE INVOICE" : "PURCHASE VOUCHER", R, y, { align: "right" });
  doc.setFontSize(10); doc.text(invoice.id, R, y + 6, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.text(new Date(invoice.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }), R, y + 11, { align: "right" });

  y += 5.5 + idLines.length * 4 + 3;
  doc.setLineWidth(0.5); doc.line(M, y, R, y); doc.setLineWidth(0.3); y += 6;

  // ---- Parties: two bordered boxes (Billed to / Pay to) ----
  const mid = 105, boxH = showBank ? 30 : 26, half = (R - M) / 2 - 2;
  doc.rect(M, y, showBank ? half : R - M, boxH);
  if (showBank) doc.rect(mid, y, R - mid, boxH);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text(isSale ? "BILLED TO" : "RECEIVED FROM", M + 2, y + 5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.text([invoice.party, invoice.partyAddress || "", invoice.partyPhone || "",
    invoice.partyGstin ? `GSTIN: ${invoice.partyGstin}` : "", `Payment: ${invoice.paymentMethod}`].filter(Boolean),
    M + 2, y + 10, { maxWidth: (showBank ? half : R - M) - 4 });
  if (showBank) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("PAY TO", mid + 2, y + 5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    doc.text([`${bank.name || ""}`, `A/C ${bank.account || ""}`, `IFSC ${bank.ifsc || ""}`,
      `Branch ${bank.branch || ""}`, bank.upi ? `UPI ${bank.upi}` : ""].filter(Boolean), mid + 2, y + 10);
  }
  y += boxH + 6;

  // ---- Goods table: bordered header + one wrapped row ----
  // Columns: description | weight | rate/kg | amount. Description wraps in its fixed width.
  const cDesc = M, cWt = 118, cRate = 145, cAmt = R; // x anchors (amount right-aligned to R)
  const descW = cWt - cDesc - 4;
  const th = 8;
  doc.setLineWidth(0.4); doc.rect(M, y, R - M, th);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  doc.text("DESCRIPTION", cDesc + 2, y + 5.3);
  doc.text("WEIGHT", cWt, y + 5.3);
  doc.text("RATE / KG", cRate, y + 5.3);
  doc.text("AMOUNT", cAmt - 2, y + 5.3, { align: "right" });
  y += th;

  // jsPDF's built-in Helvetica can't render Devanagari — the Hindi name (मक्का …) came out as
  // garbage, so the PDF shows the English product name only (any stray non-Latin glyph stripped).
  // The on-screen A4/BoS keep the Hindi where the browser can render it.
  const desc = String(invoice.product || "Item").replace(/[^\x20-\x7E]/g, "").trim() || "Item";
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  const descLines = doc.splitTextToSize(desc, descW);
  const rowH = Math.max(9, descLines.length * 4 + 4);
  doc.setLineWidth(0.3); doc.rect(M, y, R - M, rowH);
  doc.text(descLines, cDesc + 2, y + 5);
  doc.text(`${money(invoice.totalKg)} kg`.replace(".00", ""), cWt, y + 5);
  doc.text(money(invoice.rate), cRate, y + 5);
  doc.text(money(invoice.gross), cAmt - 2, y + 5, { align: "right" });
  y += rowH + 6;

  // ---- Totals block (right-aligned), amount-in-words + remarks (left) ----
  const tLabel = 130;
  const rowT = (label, val, bold) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, tLabel, y); doc.text(val, cAmt - 2, y, { align: "right" }); y += 5.5;
  };
  const wordsY = y;
  doc.setFontSize(8.5);
  rowT("Gross amount", money(invoice.gross));
  if (invoice.cdDeduction > 0) rowT("CD deduction", "- " + money(invoice.cdDeduction));
  if (invoice.discount > 0) rowT("Discount", "- " + money(invoice.discount));
  doc.setFontSize(9.5); rowT(`Net ${isSale ? "receivable" : "payable"}`, money(invoice.netAmount), true);
  doc.setFontSize(8.5); rowT("Paid", money(invoice.paidAmount));
  // Aligned separator immediately before the final Balance due (spans the totals column).
  y += 1; doc.setLineWidth(0.4); doc.line(tLabel, y - 2, cAmt, y - 2); doc.setLineWidth(0.3); y += 2;
  doc.setFontSize(9); rowT("Balance due", money(invoice.dueAmount), true);

  // Amount in words + remarks fill the left column beside the totals.
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("Amount in words", M, wordsY);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(`${amountInWords(Math.round(invoice.netAmount))} Rupees Only`, tLabel - M - 4), M, wordsY + 4.5);
  let leftY = wordsY + 14;
  if (showRemarks && invoice.remarks) {
    doc.text(doc.splitTextToSize(`Remarks: ${invoice.remarks}`, tLabel - M - 4), M, leftY);
    leftY += 8;
  }
  y = Math.max(y, leftY) + 4;

  // ---- QR (left) + payment stamp (right), on the same band ----
  const bandY = y;
  if (qrDataUrl) {
    try {
      doc.addImage(qrDataUrl, "PNG", M, bandY, 24, 24);
      doc.setFontSize(8.5); doc.text(`Scan to pay Rs ${money(invoice.dueAmount)}`, M + 28, bandY + 8);
      doc.setFontSize(8); doc.text(`UPI: ${bank.upi || ""}`, M + 28, bandY + 13);
    } catch { /* ignore bad image */ }
  }
  if (showStamp) drawPdfStamp(doc, paymentStamp(invoice), 150, bandY + 2, R - 150);
  y = bandY + 30;

  // ---- Terms (left) + signature (right) ----
  if (showTerms && termsText) {
    doc.setFontSize(7.5);
    doc.text(doc.splitTextToSize(`Terms: ${termsText}`, 118), M, y);
  }
  if (showSignature) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(`For ${b.name || ""}`, R, y, { align: "right" });
    doc.setFont("helvetica", "italic"); doc.setFontSize(12);
    doc.text(b.owner || "", R, y + 8, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(`${b.owner || "Authorised signatory"}, Proprietor`, R, y + 13, { align: "right" });
  }
  y += 20;

  // ---- Footer note ----
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(110, 110, 110);
  doc.text(`${footerText} · This is a computer-generated ${isSale ? "invoice" : "voucher"}.`, 105, Math.min(y, 288), { align: "center" });

  doc.save(`${invoice.id}.pdf`);
}
