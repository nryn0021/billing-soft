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

/** A4 invoice PDF drawn with jsPDF (crisp vector text + embedded QR). */
export async function invoicePdf(invoice, settings, qrDataUrl, { amountInWords }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const isSale = invoice.type === "sale";
  const b = settings.business || {}; const bank = settings.bank || {};
  const M = 16; let y = 20;
  const inr = (n) => `INR ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(19, 29, 24);
  doc.text(b.name || "Business", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
  doc.text([...(b.addressLines || []), `Owner: ${b.owner || ""}  |  ${b.contact || ""}`, `GSTIN: ${b.gstin || "-"}`], M, y + 6);
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(21, 118, 79);
  doc.text(isSale ? "SALE INVOICE" : "PURCHASE VOUCHER", 210 - M, y, { align: "right" });
  doc.setTextColor(19, 29, 24); doc.setFontSize(11);
  doc.text(invoice.id, 210 - M, y + 6, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
  doc.text(new Date(invoice.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }), 210 - M, y + 11, { align: "right" });

  y += 24; doc.setDrawColor(19, 29, 24); doc.setLineWidth(0.5); doc.line(M, y, 210 - M, y); y += 8;
  doc.setTextColor(19, 29, 24); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(isSale ? "Billed to" : "Received from", M, y);
  doc.text("Pay to", 120, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(60);
  doc.text([invoice.party, invoice.partyAddress || "", invoice.partyPhone || "", `Payment: ${invoice.paymentMethod}`], M, y + 6);
  doc.text([`${bank.name || ""}`, `A/C ${bank.account || ""}`, `IFSC ${bank.ifsc || ""}`, `Branch ${bank.branch || ""}`], 120, y + 6);

  y += 34;
  doc.setFillColor(243, 246, 242); doc.rect(M, y, 210 - 2 * M, 8, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(90);
  doc.text("DESCRIPTION", M + 2, y + 5.5);
  doc.text("WEIGHT", 120, y + 5.5); doc.text("RATE/KG", 150, y + 5.5); doc.text("AMOUNT", 210 - M - 2, y + 5.5, { align: "right" });
  y += 12; doc.setFont("helvetica", "normal"); doc.setTextColor(19, 29, 24); doc.setFontSize(9);
  doc.text(`${invoice.product}${invoice.productHindi ? " (" + invoice.productHindi + ")" : ""}`, M + 2, y);
  doc.text(`${invoice.totalKg} kg`, 120, y); doc.text(inr(invoice.rate).replace("INR ", ""), 150, y);
  doc.text(inr(invoice.gross).replace("INR ", ""), 210 - M - 2, y, { align: "right" });

  y += 10; const tx = 120;
  const rowP = (label, val, bold) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.text(label, tx, y); doc.text(val, 210 - M - 2, y, { align: "right" }); y += 6; };
  rowP("Gross amount", inr(invoice.gross).replace("INR ", ""));
  if (invoice.cdDeduction > 0) rowP("CD deduction", "- " + inr(invoice.cdDeduction).replace("INR ", ""));
  doc.setDrawColor(19, 29, 24); doc.line(tx, y - 2, 210 - M, y - 2);
  rowP(`Net ${isSale ? "receivable" : "payable"}`, inr(invoice.netAmount).replace("INR ", ""), true);
  rowP("Paid", inr(invoice.paidAmount).replace("INR ", ""));
  rowP("Balance due", inr(invoice.dueAmount).replace("INR ", ""));

  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(90);
  doc.text(`Amount in words: ${amountInWords(Math.round(invoice.netAmount))} Rupees Only`, M, y);
  if (qrDataUrl && settings.invoice?.showQr !== false) {
    try { doc.addImage(qrDataUrl, "PNG", M, y + 6, 26, 26); doc.text("Scan to pay", M + 30, y + 12); doc.text(`UPI: ${bank.upi || ""}`, M + 30, y + 17); } catch { /* ignore bad image */ }
  }
  y += 44;
  doc.setFontSize(7); doc.setTextColor(120);
  doc.text(settings.invoice?.terms || "", M, y, { maxWidth: 120 });
  doc.text(`For ${b.name || ""}`, 210 - M, y, { align: "right" });
  doc.text(settings.invoice?.signatureName || "Authorised signatory", 210 - M, y + 10, { align: "right" });
  doc.save(`${invoice.id}.pdf`);
}
