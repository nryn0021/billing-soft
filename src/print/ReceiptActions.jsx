import { useState } from "react";
import { FiDownload, FiFileText, FiImage, FiPrinter, FiShare2 } from "react-icons/fi";
import { useApp } from "../context/AppContext";
import { Button, Segmented } from "../ui";
import { amountInWords } from "../lib/format";
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

  const genReceipt = async () => {
    const qr = await makeInvoiceQr(settings, invoice);
    return renderThermalReceipt(invoice, settings, qr, { widthMm: Number(width), amountInWords });
  };

  const caption = () => {
    const kind = invoice.type === "sale" ? "🧾 Sale Bill" : "📦 Purchase Bill";
    return `${kind}\nBill No: ${invoice.id}\nParty: ${invoice.party}\nAmount: ₹${Math.round(invoice.netAmount).toLocaleString("en-IN")}\nDate: ${new Date(invoice.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}\n\n${settings.business?.name || ""}`;
  };

  const a4Pdf = withBusy("a4pdf", async () => {
    const { invoicePdf } = await import("../lib/exporters");
    const qr = await makeInvoiceQr(settings, invoice);
    await invoicePdf(invoice, settings, qr, { amountInWords });
  });

  return (
    <div className="rounded-xl border border-line p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Print & share</p>
        <Segmented size="sm" options={[{ value: "58", label: "58mm" }, { value: "80", label: "80mm" }]} value={width} onChange={setWidth} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" size="sm" icon={FiPrinter} onClick={() => printInvoice(invoice, "a4")}>A4 print</Button>
        <Button variant="ghost" size="sm" icon={FiFileText} onClick={a4Pdf} disabled={busy === "a4pdf"}>A4 PDF</Button>
        <Button variant="ghost" size="sm" icon={FiPrinter} disabled={!!busy} onClick={withBusy("tp", async () => { const r = await genReceipt(); printReceiptImage(r.dataUrl, r.widthMm); })}>Thermal print</Button>
        <Button variant="ghost" size="sm" icon={FiImage} disabled={!!busy} onClick={withBusy("png", async () => { const r = await genReceipt(); downloadReceipt(r.dataUrl, invoice.id); })}>Save PNG</Button>
        <Button variant="ghost" size="sm" icon={FiDownload} disabled={!!busy} onClick={withBusy("tpdf", async () => { const r = await genReceipt(); await receiptPdf(r.dataUrl, invoice.id, r.widthMm, r.height, r.width); })}>Thermal PDF</Button>
        <Button variant="primary" size="sm" icon={FiShare2} disabled={!!busy} onClick={withBusy("wa", async () => { const r = await genReceipt(); await shareReceipt(r.dataUrl, invoice.id, caption(), settings.notifications?.whatsapp?.ownerNumber); })}>WhatsApp</Button>
      </div>
      <p className="text-[11px] text-muted">Thermal receipts are rendered as a 300&nbsp;DPI image — crisp on any 58/80&nbsp;mm printer, no layout glitches.</p>
    </div>
  );
}
