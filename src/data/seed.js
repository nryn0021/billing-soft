const now = new Date();
const dateAt = (daysAgo, hour) => {
  const value = new Date(now);
  value.setDate(value.getDate() - daysAgo);
  value.setHours(hour, 15, 0, 0);
  return value.toISOString();
};

export const PRODUCT_COLORS = ["#db9b35", "#8fa866", "#c97744", "#71959a", "#c7a44f", "#9982b5", "#5f9e72", "#c38b68"];

export const INITIAL_DATA = {
  branches: ["Main Mill", "Market Yard"],
  counters: { sale: 1086, purchase: 643 },
  products: [
    { id: "RICE-SONAM", name: "Sonam Rice", short: "SR", category: "Rice", baseRate: 26.5, stockKg: 42600 },
    { id: "RICE-SAMBHA", name: "Sambha Rice", short: "SB", category: "Rice", baseRate: 31.25, stockKg: 31800 },
    { id: "RICE-SITA", name: "Sita Rice", short: "SI", category: "Rice", baseRate: 29, stockKg: 24750 },
    { id: "RICE-MUGDHA", name: "Mugdha Rice", short: "MR", category: "Rice", baseRate: 34.5, stockKg: 18600 },
    { id: "RICE-SWARNA", name: "Swarna Rice", short: "SW", category: "Rice", baseRate: 27.75, stockKg: 22600 },
    { id: "WHEAT", name: "Wheat", short: "WH", category: "Cereal", baseRate: 25.4, stockKg: 20400 },
    { id: "MOONG", name: "Moong (Green Gram)", short: "MG", category: "Pulse", baseRate: 78, stockKg: 13400 },
    { id: "KHESARI", name: "Khesari", short: "KH", category: "Pulse", baseRate: 49.5, stockKg: 5500 },
    { id: "MAIZE", name: "Maize", short: "MZ", category: "Cereal", baseRate: 23.25, stockKg: 10750 },
  ],
  parties: [
    { id: "PTY-1001", name: "Shree Balaji Traders", phone: "+91 98765 32010", address: "Gol Bazar, Raipur, Chhattisgarh", kind: "customer", balance: 86400, balanceType: "debtor", bank: null },
    { id: "PTY-1002", name: "Ramesh Kumar Sahu", phone: "+91 98271 44321", address: "Village Kharora, Raipur", kind: "supplier", balance: 23850, balanceType: "creditor", bank: { account: "•••• 2941", ifsc: "SBIN000****" } },
    { id: "PTY-1003", name: "Maa Annapurna Foods", phone: "+91 93011 82640", address: "Bhanpuri Industrial Area, Raipur", kind: "both", balance: 142000, balanceType: "debtor", bank: null },
    { id: "PTY-1004", name: "Suresh Patel", phone: "+91 97555 11862", address: "Arang, Raipur", kind: "supplier", balance: 47500, balanceType: "creditor", bank: { account: "•••• 8302", ifsc: "HDFC000****" } },
    { id: "PTY-1005", name: "Gupta Grain Stores", phone: "+91 94252 50128", address: "Pandri Market, Raipur", kind: "customer", balance: 33800, balanceType: "debtor", bank: null },
    { id: "PTY-1006", name: "Dinesh Verma", phone: "+91 98931 76429", address: "Tilda, Raipur", kind: "supplier", balance: 9200, balanceType: "creditor", bank: null },
  ],
  transactions: [
    { id: "SAL-1086", type: "sale", date: dateAt(0, 11), partyId: "PTY-1001", party: "Shree Balaji Traders", productId: "RICE-SONAM", product: "Sonam Rice", quantity: 21.2, unit: "quintal", totalKg: 2120, rate: 26.5, baseRate: 26.5, gross: 56180, cdDeduction: 0, netAmount: 56180, paidAmount: 56180, dueAmount: 0, paymentMethod: "Online / Bank", branch: "Main Mill", createdBy: "Amit Singh" },
    { id: "PUR-0643", type: "purchase", date: dateAt(0, 10), partyId: "PTY-1002", party: "Ramesh Kumar Sahu", productId: "WHEAT", product: "Wheat", quantity: 18, unit: "quintal", totalKg: 1800, rate: 25.4, baseRate: 25.4, gross: 45720, cdDeduction: 1143, netAmount: 44577, paidAmount: 30000, dueAmount: 14577, paymentMethod: "Split payment", branch: "Market Yard", createdBy: "Neeraj Patel" },
    { id: "SAL-1085", type: "sale", date: dateAt(0, 9), partyId: "PTY-1003", party: "Maa Annapurna Foods", productId: "RICE-SAMBHA", product: "Sambha Rice", quantity: 25, unit: "quintal", totalKg: 2500, rate: 31.25, baseRate: 31.25, gross: 78125, cdDeduction: 0, netAmount: 78125, paidAmount: 50000, dueAmount: 28125, paymentMethod: "Split payment", branch: "Main Mill", createdBy: "Amit Singh" },
    { id: "PUR-0642", type: "purchase", date: dateAt(0, 8), partyId: "PTY-1004", party: "Suresh Patel", productId: "MAIZE", product: "Maize", quantity: 12.5, unit: "quintal", totalKg: 1250, rate: 23, baseRate: 23.25, gross: 28750, cdDeduction: 718.75, netAmount: 28031.25, paidAmount: 28031.25, dueAmount: 0, paymentMethod: "Cash", branch: "Market Yard", createdBy: "Neeraj Patel" },
    { id: "SAL-1084", type: "sale", date: dateAt(1, 16), partyId: "PTY-1005", party: "Gupta Grain Stores", productId: "MOONG", product: "Moong (Green Gram)", quantity: 4.5, unit: "quintal", totalKg: 450, rate: 79, baseRate: 78, gross: 35550, cdDeduction: 0, netAmount: 35550, paidAmount: 35550, dueAmount: 0, paymentMethod: "Online / Bank", branch: "Main Mill", createdBy: "Amit Singh" },
    { id: "PUR-0641", type: "purchase", date: dateAt(1, 14), partyId: "PTY-1006", party: "Dinesh Verma", productId: "RICE-SWARNA", product: "Swarna Rice", quantity: 20, unit: "quintal", totalKg: 2000, rate: 27.75, baseRate: 27.75, gross: 55500, cdDeduction: 1387.5, netAmount: 54112.5, paidAmount: 45000, dueAmount: 9112.5, paymentMethod: "Split payment", branch: "Market Yard", createdBy: "Neeraj Patel" },
    { id: "SAL-1083", type: "sale", date: dateAt(2, 15), partyId: "PTY-1001", party: "Shree Balaji Traders", productId: "RICE-SITA", product: "Sita Rice", quantity: 1.8, unit: "tonne", totalKg: 1800, rate: 29, baseRate: 29, gross: 52200, cdDeduction: 0, netAmount: 52200, paidAmount: 52200, dueAmount: 0, paymentMethod: "Online / Bank", branch: "Main Mill", createdBy: "Amit Singh" },
    { id: "PUR-0640", type: "purchase", date: dateAt(3, 12), partyId: "PTY-1004", party: "Suresh Patel", productId: "KHESARI", product: "Khesari", quantity: 8, unit: "quintal", totalKg: 800, rate: 49.5, baseRate: 49.5, gross: 39600, cdDeduction: 990, netAmount: 38610, paidAmount: 38610, dueAmount: 0, paymentMethod: "Cash", branch: "Market Yard", createdBy: "Neeraj Patel" },
  ],
  audits: [
    { id: "AUD-1", kind: "override", text: "Moong rate changed from ₹78.00 to ₹79.00", meta: "Gupta Grain Stores · SAL-1084 · Amit Singh", date: dateAt(1, 16) },
    { id: "AUD-2", kind: "override", text: "Maize rate changed from ₹23.25 to ₹23.00", meta: "Suresh Patel · PUR-0642 · Neeraj Patel", date: dateAt(0, 8) },
    { id: "AUD-3", kind: "base-rate", text: "Sonam Rice base rate updated to ₹26.50", meta: "Admin · Prasen Narayan", date: dateAt(1, 9) },
    { id: "AUD-4", kind: "base-rate", text: "Daily rates reviewed for all 9 items", meta: "Manager · Rajesh Sharma", date: dateAt(2, 9) },
  ],
};
