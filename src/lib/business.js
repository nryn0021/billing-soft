// Central business profile used across invoices, settings and printing.
// Placeholder values (GSTIN, bank account) are clearly marked — update with real data.
export const BUSINESS = {
  name: "Jai Mata Di Gud Mill",
  tagline: "Grain trading & processing",
  owner: "Pankaj Kumar Das",
  gstin: "10AAAAA0000A1Z5", // TODO: replace with the real GSTIN
  contact: "+91 99552 99279",
  contactRaw: "919955299279",
  email: "",
  addressLines: ["Main Road, Banka", "Bihar 813102, India"],
  city: "Banka, Bihar",
  bank: {
    name: "HDFC Bank",
    account: "5010 0XXX XXXX 789", // TODO: replace with the real account number
    ifsc: "HDFC0000123", // TODO: replace with the real IFSC
    branch: "Banka",
  },
  upi: "jmdgudmill@hdfc", // TODO: replace with the real UPI id (or swap the QR image)
};
