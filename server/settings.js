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
  },
  qrImage: "", // data URL uploaded by owner; empty → QR is generated from the UPI id
  invoice: {
    footer: "Thank you for your business.",
    terms: "Goods once sold will not be taken back. Subject to Banka jurisdiction.",
    signatureName: "Authorised signatory",
    showQr: true,
    logoText: "JM",
  },
  thermal: { width: "80" }, // "58" | "80"
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
