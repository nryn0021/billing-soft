// Resolve the payment QR for an invoice: the owner's uploaded QR image if present,
// otherwise a real UPI QR generated from the business UPI id + bill amount.
// The `qrcode` library is loaded lazily so it never bloats the main bundle.

export function upiUri(settings, invoice) {
  const pa = settings?.bank?.upi || "";
  const pn = settings?.business?.name || "Merchant";
  const amount = invoice ? Math.round(invoice.dueAmount || invoice.netAmount || 0) : 0;
  const params = new URLSearchParams({ pa, pn });
  if (amount > 0) params.set("am", String(amount));
  params.set("cu", "INR");
  return `upi://pay?${params.toString()}`;
}

export async function makeInvoiceQr(settings, invoice) {
  if (settings?.qrImage) return settings.qrImage; // owner-uploaded image (data URL)
  if (!settings?.bank?.upi) return "";
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(upiUri(settings, invoice), { margin: 0, width: 320, errorCorrectionLevel: "M" });
}

/** Standalone QR data URL for a plain string (used in Settings preview). */
export async function makeQr(text, opts = {}) {
  if (!text) return "";
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(text, { margin: 1, width: 240, ...opts });
}
