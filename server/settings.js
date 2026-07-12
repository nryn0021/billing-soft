// Default application settings and a deep-merge so stored settings only need to hold
// the owner's overrides. This is the single source of business configuration —
// nothing business-specific should be hardcoded elsewhere.

export const DEFAULT_SETTINGS = {
  business: {
    name: "Jai Mata Di Gud Mill",
    tagline: "Grain trading & processing",
    owner: "Pankaj Kumar Das",
    gstin: "10AAAAA0000A1Z5",
    contact: "+91 99552 99279",
    email: "",
    website: "",
    addressLines: ["Main Road, Banka", "Bihar 813102, India"],
    city: "Banka, Bihar",
  },
  bank: {
    name: "HDFC Bank",
    account: "5010 0XXX XXXX 789",
    ifsc: "HDFC0000123",
    branch: "Banka",
    upi: "jmdgudmill@hdfc",
    upiName: "", // payee name on the UPI screen; empty → falls back to business name
  },
  invoice: {
    footer: "Thank you for your business.",
    terms: "Goods once sold will not be taken back. Subject to Banka jurisdiction.",
    signatureName: "Authorised signatory",
    showQr: true, // master switch for the payment QR
    // Per-bill-type QR: purchase OFF by default (the mill pays the supplier — no QR needed),
    // sale + truck-sale ON. Overridable in Settings → Invoice content.
    qrTypes: { sale: true, purchase: false, truckSale: true },
    // Whether the payment QR is baked into the bill IMAGE shared on WhatsApp / saved as PNG.
    // Independent of printed bills — some owners want a clean picture without the QR. ON by default.
    shareQr: true,
    logoText: "JM",
  },
  thermal: { width: "80" }, // "58" | "80"
  // Per-document element visibility + text overrides. Admin controls exactly what prints on
  // each document type (Settings → Documents). Every element defaults ON so existing behaviour
  // is preserved — EXCEPT the Challan, which never carries money, so its QR + payment stamp are
  // OFF by default. `termsText`/`footerText` empty → inherit the Invoice tab's terms/footer.
  documents: {
    a4:      { qr: true,  signature: true, stamp: true,  terms: true, bank: true,  remarks: true, termsText: "", footerText: "" },
    thermal: { qr: true,  signature: true, stamp: true,  terms: true, bank: true,  remarks: true, termsText: "", footerText: "" },
    gst:     { qr: true,  signature: true, stamp: true,  terms: true, bank: true,  remarks: true, termsText: "", footerText: "" },
    challan: { qr: false, signature: true, stamp: false, terms: false, bank: false, remarks: true, termsText: "", footerText: "" },
  },
  billing: { defaultPaymentMethod: "Cash" }, // preselected payment method in new bill composers
  cd: { enabled: true, rate: 2.5, threshold: 20000 }, // CD deduction rule (paise threshold applied server-side)
  prefixes: { sale: "SAL", purchase: "PUR" },
  financialYearStartMonth: 4,
  theme: { default: "system", contextualBillThemes: true },
  notifications: {
    owner: {
      saleBill: false, purchaseBill: false, partyAdded: false, partyEdited: false,
      productAdded: false, productUpdated: false, rateChanges: false, inventoryAlerts: false,
      loginAlerts: false, failedLoginAlerts: false, backupAlerts: false,
      dailySummary: false, weeklySummary: false, monthlySummary: false, profitReport: false, lowStock: false,
    },
    whatsapp: {
      enabled: false, provider: "meta", // meta | twilio | 360dialog | custom
      apiUrl: "", token: "", phoneNumberId: "", ownerNumber: "", groupId: "",
    },
  },
  rolePermissions: {}, // per-role overrides; empty → role defaults from permissions.js
};

function isObject(v) { return v && typeof v === "object" && !Array.isArray(v); }

export function deepMerge(base, patch) {
  if (!isObject(base)) return patch;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(patch || {})) {
    const b = base[key];
    const p = patch[key];
    out[key] = isObject(b) && isObject(p) ? deepMerge(b, p) : p;
  }
  return out;
}

export function withDefaults(stored) {
  return deepMerge(DEFAULT_SETTINGS, stored || {});
}
