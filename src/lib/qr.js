// Resolve the payment QR for an invoice: a real, scannable UPI QR generated from the
// business UPI id + the bill's due amount. Scanning it opens the payer's UPI app pointed
// at the merchant with the amount pre-filled. If no UPI id is configured we generate a
// QR carrying the business + bank details so a QR ALWAYS appears on the bill (an empty
// UPI would otherwise produce a blank QR on thermal/PNG/PDF).
// The `qrcode` library is loaded lazily so it never bloats the main bundle.

// Balance still owed on a bill, in whole rupees (invoice money fields are already rupees).
// A scan-to-pay QR only makes sense while this is > 0 — once the bill is settled there is
// nothing left to collect. Note `?? ` (not `||`) so a genuine 0 due is respected instead
// of falling back to the full net amount.
export function dueRupees(invoice) {
  if (!invoice) return 0;
  return Math.max(0, Math.round(invoice.dueAmount ?? invoice.netAmount ?? 0));
}

// Which per-type QR toggle governs a given print format.
function qrTypeKey(invoice, format) {
  if (format === "gst" || format === "challan" || format === "challan+gst") return "truckSale";
  return invoice?.type === "purchase" ? "purchase" : "sale";
}

// Is the payment QR switched ON for this bill's type? `invoice.showQr === false` is the
// master kill-switch; otherwise the per-type map decides. Defaults when a type is unset:
// purchase OFF (we pay the supplier), sale + truck-sale ON.
export function qrEnabledFor(settings, invoice, format) {
  const inv = settings?.invoice || {};
  if (inv.showQr === false) return false;
  const key = qrTypeKey(invoice, format);
  const types = inv.qrTypes || {};
  if (types[key] === undefined) return key !== "purchase";
  return types[key] !== false;
}

// A scannable QR should appear only when it's enabled for the type AND money is still due.
export function qrVisible(settings, invoice, format) {
  return qrEnabledFor(settings, invoice, format) && dueRupees(invoice) > 0;
}

export function upiUri(settings, invoice) {
  const pa = settings?.bank?.upi || "";
  // Payee name shown on the payer's UPI screen — the account holder, which may differ
  // from the business name (settable at Settings → Bank & UPI → Payee name).
  const pn = settings?.bank?.upiName || settings?.business?.name || "Merchant";
  const amount = dueRupees(invoice); // link the QR to the BALANCE DUE, not the gross
  const params = new URLSearchParams({ pa, pn });
  if (amount > 0) params.set("am", String(amount));
  params.set("cu", "INR");
  return `upi://pay?${params.toString()}`;
}

// Human-readable fallback encoded into the QR when there is no UPI id — scanning it
// shows the payee's bank/contact details rather than nothing.
function fallbackPayload(settings, invoice) {
  const b = settings?.business || {};
  const bank = settings?.bank || {};
  const parts = [
    b.name,
    bank.name && `Bank: ${bank.name}`,
    bank.account && `A/C: ${bank.account}`,
    bank.ifsc && `IFSC: ${bank.ifsc}`,
    b.contact && `Ph: ${b.contact}`,
    invoice?.id && `Bill: ${invoice.id}`,
  ].filter(Boolean);
  return parts.join("\n") || (b.name || "Payment");
}

export async function makeInvoiceQr(settings, invoice, format = "a4") {
  // Central gate: no QR when the type is switched off or the bill is fully paid. Returning
  // "" here means every downstream render path (A4/PDF/thermal) naturally omits it.
  if (!qrVisible(settings, invoice, format)) return "";
  const QRCode = (await import("qrcode")).default;
  const text = settings?.bank?.upi ? upiUri(settings, invoice) : fallbackPayload(settings, invoice);
  return QRCode.toDataURL(text, { margin: 0, width: 320, errorCorrectionLevel: "M" });
}

/** Standalone QR data URL for a plain string (used in Settings preview). */
export async function makeQr(text, opts = {}) {
  if (!text) return "";
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(text, { margin: 1, width: 240, ...opts });
}
