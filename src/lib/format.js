// Formatting helpers, labels and shared domain constants.

export const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
export const num0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// Payment-status "rubber stamp" shown on every bill. Reads the bill's own money fields
// (all in rupees on the mapped invoice) and returns what the stamp should say + which
// colour state to paint it: green when settled, orange when part-paid, red when nothing
// is paid yet. `amount` is the balance still due (0 when fully paid).
export function paymentStamp(invoice) {
  // Same fallback chain as qr.js dueRupees() so the stamp and the scan-to-pay QR never
  // disagree (e.g. a "PAID" stamp next to a live QR) when dueAmount is absent.
  const due = Math.max(0, Math.round(invoice?.dueAmount ?? invoice?.netAmount ?? 0));
  const paid = Math.max(0, Math.round(invoice?.paidAmount ?? 0));
  const method = (invoice?.paymentMethod || "").trim();
  if (due <= 0) return { state: "paid", label: "PAID", sub: method ? `via ${method}` : "Paid in full", amount: 0 };
  if (paid > 0) return { state: "partial", label: `${inr.format(due)} DUE`, sub: "Partially paid", amount: due };
  return { state: "unpaid", label: `${inr.format(due)} DUE`, sub: "Payment pending", amount: due };
}

// Compact money for KPI tiles: ₹1.2L, ₹3.4Cr, etc.
export function compactInr(value) {
  const v = Number(value) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${num.format(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${num.format(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${num.format(abs / 1e3)}K`;
  return `${sign}₹${num0.format(abs)}`;
}

export const kgPerUnit = { kg: 1, quintal: 100, tonne: 1000 };
export const UNITS = [
  { value: "kg", short: "kg", label: "Kilogram (kg)" },
  { value: "quintal", short: "qtl", label: "Quintal (100 kg)" },
  { value: "tonne", short: "ton", label: "Tonne (1,000 kg)" },
];
export const PAYMENT_METHODS = ["Cash", "Online / Bank", "Split payment", "Credit"];

// Validated categorical series palette (see dataviz validation). Assigned in fixed order.
export const SERIES_COLORS = ["#2a78d6", "#12a150", "#e2a017", "#7c4dd6", "#e0503f", "#e87ba4", "#eb6834", "#0d9488"];

export function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
export function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
export function formatDateLong(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
}
export function timeAgo(value) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d ago` : formatDate(value);
}
export function isSameDay(a, b) { return new Date(a).toDateString() === new Date(b).toDateString(); }

export function productLabel(p) { return p?.hindiName ? `${p.name} · ${p.hindiName}` : p?.name || ""; }
export function txProductLabel(t) { return t?.productHindi ? `${t.product} · ${t.productHindi}` : t?.product || ""; }
export function initials(name) {
  return String(name || "").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
}
export function titleCase(value) { return String(value || "").replace(/\b\w/g, (c) => c.toUpperCase()); }

export function amountInWords(value) {
  if (!value) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const underHundred = (n) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`);
  const underThousand = (n) => `${n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred ` : ""}${underHundred(n % 100)}`.trim();
  const parts = [];
  let remaining = Math.min(Math.floor(value), 999999999);
  const crore = Math.floor(remaining / 10000000); remaining %= 10000000;
  const lakh = Math.floor(remaining / 100000); remaining %= 100000;
  const thousand = Math.floor(remaining / 1000); remaining %= 1000;
  if (crore) parts.push(`${underThousand(crore)} Crore`);
  if (lakh) parts.push(`${underHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${underHundred(thousand)} Thousand`);
  if (remaining) parts.push(underThousand(remaining));
  return parts.join(" ") || "Zero";
}
