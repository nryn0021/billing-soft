import { useState } from "react";
import { FiDownload, FiFileText, FiImage, FiLayers, FiPrinter, FiShare2, FiTruck } from "react-icons/fi";
import { useApp } from "../context/AppContext";
import { Button, Segmented } from "../ui";
import { amountInWords, billFileName } from "../lib/format";
import { makeInvoiceQr } from "../lib/qr";
import { downloadReceipt, printReceiptImage, receiptPdf, renderThermalReceipt, shareReceipt } from "../lib/thermal";

/** Full receipt toolbar: A4 print/PDF + image-based thermal (print/PNG/WhatsApp/PDF). */
export function ReceiptActions({ invoice }) {
  const { settings, printInvoice, toast } = useApp();
  const [width, setWidth] = useState(String(settings.thermal?.width || "80"));
  const [busy, setBusy] = useState("");

  const withBusy = (key, fn) => async () => {
    setBusy(key);
    try { await fn(); } catch (e) { toast(e.message || "Something went wrong", "danger"); } finally { setBusy(""); }
  };

  // `withQr` lets the shareable image (PNG / WhatsApp) drop the QR when the owner has turned
  // off Settings → Invoice → "Show QR on shared bill image", while the thermal PRINT keeps it.
  const genReceipt = async ({ withQr = true } = {}) => {
    const qr = withQr ? await makeInvoiceQr(settings, invoice, "thermal") : "";
    return renderThermalReceipt(invoice, settings, qr, { widthMm: Number(width), amountInWords });
  };
  const shareQr = settings.invoice?.shareQr !== false;

  // Rich, human-readable WhatsApp caption sent alongside the bill image. Uses WhatsApp
  // markdown (*bold*) and includes the full money breakdown plus date & time.
  const caption = () => {
    const isSale = invoice.type === "sale";
    const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const when = new Date(invoice.date).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" });
    const lines = [
      `*${settings.business?.name || "Bill"}*`,
      isSale ? "🧾 *SALE BILL*" : "📦 *PURCHASE BILL*",
      "",
      `*Bill No:*  ${invoice.id}`,
      `*Date:*  ${when}`,
      `*${isSale ? "Customer" : "Supplier"}:*  ${invoice.party}${invoice.partyPhone ? `  (${invoice.partyPhone})` : ""}`,
      "",
      `*Item:*  ${invoice.product}${invoice.productHindi ? ` / ${invoice.productHindi}` : ""}`,
      `*Weight:*  ${invoice.totalKg} kg  ×  ₹${invoice.rate}/kg`,
      `*Gross:*  ${money(invoice.gross)}`,
    ];
    if (invoice.cdDeduction > 0) lines.push(`*CD deduction:*  − ${money(invoice.cdDeduction)}`);
    if (invoice.discount > 0) lines.push(`*Discount:*  − ${money(invoice.discount)}`);
    lines.push(
      `*Net ${isSale ? "receivable" : "payable"}:*  ${money(invoice.netAmount)}`,
      `*Paid:*  ${money(invoice.paidAmount)}    *Balance due:*  ${money(invoice.dueAmount)}`,
      `*Payment mode:*  ${invoice.paymentMethod}`,
      "",
      settings.invoice?.footer || "Thank you for your business.",
    );
    return lines.join("\n");
  };

  const a4Pdf = withBusy("a4pdf", async () => {
    const { invoicePdf } = await import("../lib/exporters");
    const qr = await makeInvoiceQr(settings, invoice, "a4");
    await invoicePdf(invoice, settings, qr, { amountInWords });
  });

  const isTruck = invoice.kind === "truck" || invoice.meta?.kind === "truck";

  return (
    <div className="rounded-xl border border-line p-3 space-y-3">
      {isTruck && (
        <div className="rounded-lg border border-info/25 bg-info/5 p-2.5 space-y-2">
          <p className="text-xs font-semibold text-info flex items-center gap-1.5"><FiTruck /> Truck sale documents</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="info" size="sm" icon={FiFileText} onClick={() => printInvoice(invoice, "gst")}>Bill of Supply</Button>
            <Button variant="ghost" size="sm" icon={FiPrinter} onClick={() => printInvoice(invoice, "challan")}>Challan</Button>
          </div>
          {/* Both documents in one print job (Challan then Bill of Supply) — pick "Save as PDF"
              in the print dialog to download both together as a single 2-page file. */}
          <Button variant="ghost" size="sm" icon={FiLayers} className="w-full" onClick={() => printInvoice(invoice, "challan+gst")}>Challan + Bill of Supply</Button>
          <p className="text-[11px] text-muted">Tip: choose “Save as PDF” in the print dialog to download both pages as one file.</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Print & share</p>
        <Segmented size="sm" options={[{ value: "58", label: "58mm" }, { value: "80", label: "80mm" }]} value={width} onChange={setWidth} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" size="sm" icon={FiPrinter} onClick={() => printInvoice(invoice, "a4")}>A4 print</Button>
        <Button variant="ghost" size="sm" icon={FiFileText} onClick={a4Pdf} disabled={busy === "a4pdf"}>A4 PDF</Button>
        <Button variant="ghost" size="sm" icon={FiPrinter} disabled={!!busy} onClick={withBusy("tp", async () => { const r = await genReceipt(); printReceiptImage(r.dataUrl, r.widthMm); })}>Thermal print</Button>
        <Button variant="ghost" size="sm" icon={FiImage} disabled={!!busy} onClick={withBusy("png", async () => { const r = await genReceipt({ withQr: shareQr }); downloadReceipt(r.dataUrl, billFileName(invoice)); })}>Save PNG</Button>
        <Button variant="ghost" size="sm" icon={FiDownload} disabled={!!busy} onClick={withBusy("tpdf", async () => { const r = await genReceipt({ withQr: shareQr }); await receiptPdf(r.dataUrl, billFileName(invoice), r.widthMm, r.height, r.width); })}>Thermal PDF</Button>
        <Button variant="primary" size="sm" icon={FiShare2} disabled={!!busy} onClick={withBusy("wa", async () => {
          const r = await genReceipt({ withQr: shareQr });
          const name = billFileName(invoice);
          const shared = await shareReceipt(r.dataUrl, name, caption(), settings.notifications?.whatsapp?.ownerNumber);
          toast(shared ? "Bill image ready to send on WhatsApp" : "Bill image downloaded — attach it in the WhatsApp chat that opened", shared ? "success" : "info");
        })}>WhatsApp</Button>
      </div>
      <p className="text-[11px] text-muted">Receipts render as a 300&nbsp;DPI image — {invoice.type === "sale" ? "rose for sales" : "amber for purchases"}, crisp on any 58/80&nbsp;mm printer, and shared to WhatsApp as the actual bill picture.</p>
    </div>
  );
}
