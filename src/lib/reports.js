// Report + analytics computations derived from the bootstrap dataset.
// Everything is computed client-side from `data.transactions/products/parties`.
import { isSameDay } from "./format";

export const PERIODS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "mtd", label: "This month" },
  { id: "quarter", label: "Quarter" },
  { id: "fy", label: "FY 2026-27" },
  { id: "all", label: "All time" },
];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

export function financialYearRange(ref = new Date()) {
  const y = ref.getMonth() >= 3 ? ref.getFullYear() : ref.getFullYear() - 1;
  return { from: new Date(y, 3, 1), to: new Date(y + 1, 2, 31, 23, 59, 59), label: `FY ${y}-${String(y + 1).slice(2)}` };
}

export function periodRange(period, custom) {
  const now = new Date();
  const end = new Date();
  if (period === "custom" && custom?.from) return { from: startOfDay(custom.from), to: new Date(custom.to || now) };
  switch (period) {
    case "today": return { from: startOfDay(now), to: end };
    case "7d": return { from: startOfDay(new Date(now.getTime() - 6 * 864e5)), to: end };
    case "30d": return { from: startOfDay(new Date(now.getTime() - 29 * 864e5)), to: end };
    case "mtd": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: end };
    case "quarter": { const q = Math.floor(now.getMonth() / 3) * 3; return { from: new Date(now.getFullYear(), q, 1), to: end }; }
    case "fy": return financialYearRange(now);
    default: return { from: new Date(0), to: end };
  }
}

export function filterByPeriod(transactions, period, custom) {
  if (period === "all") return transactions;
  const { from, to } = periodRange(period, custom);
  return transactions.filter((t) => { const d = new Date(t.date); return d >= from && d <= to; });
}

const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);

export function totals(transactions) {
  const sales = transactions.filter((t) => t.type === "sale");
  const purchases = transactions.filter((t) => t.type === "purchase");
  const salesNet = sum(sales, (t) => t.netAmount);
  const purchaseNet = sum(purchases, (t) => t.netAmount);
  return {
    salesNet,
    purchaseNet,
    salesCount: sales.length,
    purchaseCount: purchases.length,
    salesGross: sum(sales, (t) => t.gross),
    purchaseGross: sum(purchases, (t) => t.gross),
    cashIn: sum(sales, (t) => t.paidAmount),
    cashOut: sum(purchases, (t) => t.paidAmount),
    receivable: sum(sales, (t) => t.dueAmount),
    payable: sum(purchases, (t) => t.dueAmount),
    net: salesNet - purchaseNet,
    weightSold: sum(sales, (t) => t.totalKg),
    weightBought: sum(purchases, (t) => t.totalKg),
  };
}

/** Sales vs purchase per day for the last N days → [{ key, label, sale, purchase }]. */
export function dailySeries(transactions, days = 14) {
  const buckets = [];
  const now = startOfDay(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 864e5);
    const dayTx = transactions.filter((t) => isSameDay(t.date, day));
    buckets.push({
      key: day.toISOString(),
      label: new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(day),
      short: new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(day),
      sale: sum(dayTx.filter((t) => t.type === "sale"), (t) => t.netAmount),
      purchase: sum(dayTx.filter((t) => t.type === "purchase"), (t) => t.netAmount),
    });
  }
  return buckets;
}

/** Monthly aggregation for the last N months. */
export function monthlySeries(transactions, months = 6) {
  const now = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const inMonth = transactions.filter((t) => { const x = new Date(t.date); return x.getMonth() === d.getMonth() && x.getFullYear() === d.getFullYear(); });
    out.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: new Intl.DateTimeFormat("en-IN", { month: "short" }).format(d),
      sale: sum(inMonth.filter((t) => t.type === "sale"), (t) => t.netAmount),
      purchase: sum(inMonth.filter((t) => t.type === "purchase"), (t) => t.netAmount),
    });
  }
  return out;
}

/** Value + weight billed per product (sales by default). */
export function productBreakdown(transactions, kind = "sale") {
  const map = new Map();
  transactions.filter((t) => t.type === kind).forEach((t) => {
    const cur = map.get(t.productId) || { id: t.productId, name: t.product, hindi: t.productHindi, value: 0, weight: 0, count: 0 };
    cur.value += t.netAmount; cur.weight += t.totalKg; cur.count += 1;
    map.set(t.productId, cur);
  });
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export function paymentBreakdown(transactions) {
  const map = new Map();
  transactions.forEach((t) => {
    const cur = map.get(t.paymentMethod) || { method: t.paymentMethod, value: 0, count: 0 };
    cur.value += t.netAmount; cur.count += 1;
    map.set(t.paymentMethod, cur);
  });
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export function branchSummary(transactions) {
  const map = new Map();
  transactions.forEach((t) => {
    const cur = map.get(t.branch) || { branch: t.branch, sales: 0, purchases: 0, count: 0 };
    if (t.type === "sale") cur.sales += t.netAmount; else cur.purchases += t.netAmount;
    cur.count += 1;
    map.set(t.branch, cur);
  });
  return [...map.values()];
}

export function partyStatement(transactions, partyId) {
  return transactions
    .filter((t) => t.partyId === partyId)
    .map((t) => ({ id: t.id, date: t.date, type: t.type, product: t.product, amount: t.netAmount, paid: t.paidAmount, due: t.dueAmount, method: t.paymentMethod }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function inventoryValuation(products) {
  const totalKg = sum(products, (p) => p.stockKg);
  const value = sum(products, (p) => p.stockKg * p.baseRate);
  return { totalKg, value, lines: products.map((p) => ({ ...p, value: p.stockKg * p.baseRate })) };
}

export const LOW_STOCK_KG = 6000; // < 6 tonnes flagged
export function stockAlerts(products) {
  return products.filter((p) => p.stockKg < LOW_STOCK_KG).sort((a, b) => a.stockKg - b.stockKg);
}
