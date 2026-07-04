// Image-based thermal receipts. The receipt is rendered onto a canvas at 300 DPI
// and exported as a PNG — so printing has ZERO CSS/layout dependency and looks
// identical on every 58 mm / 80 mm thermal printer. Supports download, print,
// WhatsApp/native share and PDF.

const DPI = 300;
const mmToPx = (mm) => Math.round((mm / 25.4) * DPI);

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Render a receipt PNG. Returns { dataUrl, width, height }.
 * widthMm: 58 | 80. qrDataUrl optional.
 */
export async function renderThermalReceipt(invoice, settings, qrDataUrl, { widthMm = 80, amountInWords, accent } = {}) {
  const W = mmToPx(Number(widthMm) || 80);
  const pad = Math.round(W * 0.045);
  const cw = W - pad * 2;
  const isSale = invoice.type === "sale";
  // Contextual colour: sale = lotus rose, purchase = warm amber. This is what makes the
  // shared "Red" (sale) / "Yellow" (purchase) bill image immediately recognisable.
  const tone = accent || (isSale ? "#d6336c" : "#c98a1f");
  const b = settings.business || {}; const bank = settings.bank || {};
  const scale = W / mmToPx(80); // font scale relative to 80mm baseline

  // Measure pass on a scratch canvas, then draw for real (two-pass so height fits content).
  const measure = document.createElement("canvas").getContext("2d");
  const font = (px, weight = "normal") => `${weight} ${Math.round(px * scale)}px Helvetica, Arial, sans-serif`;

  const lines = []; // { text, size, weight, align, gapAfter, color }
  const push = (text, size = 22, weight = "normal", align = "center", gapAfter = 6, color) => lines.push({ text, size, weight, align, gapAfter, color });
  const rule = (color) => lines.push({ rule: true, gapAfter: 8, color });
  const kv = (k, v, size = 20, weight = "normal", color) => lines.push({ kv: [k, v], size, weight, align: "row", gapAfter: 4, color });

  push(b.name || "Business", 34, "bold", "center", 6, tone);
  if (b.tagline) push(b.tagline, 18, "normal", "center", 4);
  (b.addressLines || []).forEach((l) => push(l, 18));
  if (b.contact) push(b.contact, 18);
  if (b.gstin) push(`GSTIN: ${b.gstin}`, 18, "normal", "center", 8);
  rule(tone);
  push(isSale ? "SALE INVOICE" : "PURCHASE VOUCHER", 24, "bold", "center", 6, tone);
  kv("Bill No", invoice.id, 20, "bold");
  kv("Date", new Date(invoice.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }));
  kv("Branch", invoice.branch || "-");
  rule(tone);
  push(isSale ? "Billed To" : "Received From", 18, "bold", "left", 4);
  push(invoice.party, 22, "bold", "left", 2);
  if (invoice.partyPhone) push(invoice.partyPhone, 18, "normal", "left", 2);
  if (invoice.partyAddress) push(invoice.partyAddress, 18, "normal", "left", 6);
  rule(tone);
  push(`${invoice.product}${invoice.productHindi ? " / " + invoice.productHindi : ""}`, 20, "bold", "left", 2);
  kv(`${invoice.totalKg} kg x INR ${invoice.rate}`, `INR ${money(invoice.gross)}`);
  rule(tone);
  kv("Gross", `INR ${money(invoice.gross)}`);
  if (invoice.cdDeduction > 0) kv("CD deduction", `- INR ${money(invoice.cdDeduction)}`);
  kv(`Net ${isSale ? "receivable" : "payable"}`, `INR ${money(invoice.netAmount)}`, 24, "bold", tone);
  kv("Paid", `INR ${money(invoice.paidAmount)}`);
  kv("Balance due", `INR ${money(invoice.dueAmount)}`, 20, "bold");
  rule(tone);
  if (amountInWords) push(`Rupees ${amountInWords(Math.round(invoice.netAmount))} Only`, 17, "normal", "center", 8);

  const qrImg = settings.invoice?.showQr !== false ? await loadImage(qrDataUrl) : null;
  const qrSize = qrImg ? Math.round(cw * 0.5) : 0;

  const footer = settings.invoice?.footer || "Thank you for your business.";

  // Height calculation
  let h = pad;
  for (const ln of lines) {
    if (ln.rule) { h += Math.round(10 * scale) + (ln.gapAfter || 0) * scale; continue; }
    measure.font = font(ln.size, ln.weight);
    const wrapped = wrapText(measure, ln.kv ? `${ln.kv[0]} ${ln.kv[1]}` : ln.text, cw);
    h += wrapped.length * Math.round(ln.size * 1.35 * scale) + (ln.gapAfter || 0) * scale;
  }
  if (qrImg) h += qrSize + Math.round(30 * scale);
  h += Math.round(40 * scale); // footer
  h = Math.round(h + pad);

  // Draw pass
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, h);
  ctx.fillStyle = "#000000"; ctx.textBaseline = "top";
  let y = pad;

  for (const ln of lines) {
    if (ln.rule) {
      y += Math.round(4 * scale);
      ctx.save(); ctx.strokeStyle = ln.color || "#000"; ctx.setLineDash([Math.round(4 * scale), Math.round(4 * scale)]);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke(); ctx.restore();
      y += Math.round(6 * scale) + (ln.gapAfter || 0) * scale;
      continue;
    }
    ctx.font = font(ln.size, ln.weight);
    ctx.fillStyle = ln.color || "#000000";
    const lh = Math.round(ln.size * 1.35 * scale);
    if (ln.kv) {
      const [k, v] = ln.kv;
      ctx.textAlign = "left"; ctx.fillText(k, pad, y);
      ctx.textAlign = "right"; ctx.fillText(v, W - pad, y);
      y += lh + (ln.gapAfter || 0) * scale;
    } else {
      const wrapped = wrapText(ctx, ln.text, cw);
      ctx.textAlign = ln.align === "left" ? "left" : "center";
      const x = ln.align === "left" ? pad : W / 2;
      for (const w of wrapped) { ctx.fillText(w, x, y); y += lh; }
      y += (ln.gapAfter || 0) * scale;
    }
  }

  ctx.fillStyle = "#000000"; // reset after any tinted lines
  if (qrImg) {
    y += Math.round(10 * scale);
    ctx.drawImage(qrImg, (W - qrSize) / 2, y, qrSize, qrSize);
    y += qrSize + Math.round(6 * scale);
    ctx.font = font(16, "normal"); ctx.textAlign = "center";
    ctx.fillText(`UPI: ${bank.upi || ""}`, W / 2, y);
    y += Math.round(24 * scale);
  }
  ctx.font = font(16, "normal"); ctx.textAlign = "center";
  wrapText(ctx, footer, cw).forEach((w) => { ctx.fillText(w, W / 2, y); y += Math.round(20 * scale); });

  return { dataUrl: canvas.toDataURL("image/png"), width: W, height: h, widthMm: Number(widthMm) || 80 };
}

function money(v) { return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = []; let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/* ------------------------------- actions -------------------------------- */
export function downloadReceipt(dataUrl, name) {
  const a = document.createElement("a");
  a.href = dataUrl; a.download = `${name}.png`;
  document.body.appendChild(a); a.click(); a.remove();
}

export function printReceiptImage(dataUrl, widthMm = 80) {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>Receipt</title><style>
    @page{size:${widthMm}mm auto;margin:0}
    html,body{margin:0;padding:0;background:#fff}
    img{width:${widthMm}mm;display:block}
  </style></head><body><img src="${dataUrl}" onload="setTimeout(()=>{window.print();},120)"/></body></html>`);
  w.document.close();
}

async function dataUrlToFile(dataUrl, name) {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], `${name}.png`, { type: "image/png" });
}

/** Share via the native sheet (WhatsApp appears there on mobile). Falls back to download + wa.me. */
export async function shareReceipt(dataUrl, name, caption, waNumber) {
  try {
    const file = await dataUrlToFile(dataUrl, name);
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: caption });
      return true;
    }
  } catch { /* fall through */ }
  downloadReceipt(dataUrl, name);
  const num = String(waNumber || "").replace(/\D/g, "");
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(caption)}`, "_blank");
  return false;
}

export async function receiptPdf(dataUrl, name, widthMm = 80, heightPx = 0, widthPx = 0) {
  const { jsPDF } = await import("jspdf");
  const hMm = widthPx ? (heightPx / widthPx) * widthMm : widthMm * 2;
  const doc = new jsPDF({ unit: "mm", format: [widthMm, hMm] });
  doc.addImage(dataUrl, "PNG", 0, 0, widthMm, hMm);
  doc.save(`${name}.pdf`);
}
