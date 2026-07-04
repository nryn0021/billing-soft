import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  FiActivity, FiBarChart2, FiCreditCard, FiDollarSign, FiDownload, FiFileText, FiGitBranch,
  FiLayers, FiPackage, FiPieChart, FiPrinter, FiShoppingBag, FiTrendingUp,
} from "react-icons/fi";
import { useApp } from "../context/AppContext";
import { BarList, Card, Donut, EmptyState, GroupedBars, KpiCard, PanelHeader, Segmented, TrendArea, cx } from "../ui";
import { exportCsv, exportJson, printHtml } from "../lib/export";
import { SERIES_COLORS, compactInr, formatDate, inr, inr2, num } from "../lib/format";
import {
  PERIODS, branchSummary, dailySeries, filterByPeriod, inventoryValuation, monthlySeries,
  paymentBreakdown, productBreakdown, totals,
} from "../lib/reports";

const REPORTS = [
  { id: "summary", label: "Business summary", icon: FiBarChart2 },
  { id: "sales", label: "Sales report", icon: FiTrendingUp },
  { id: "purchases", label: "Purchase report", icon: FiShoppingBag },
  { id: "profit", label: "Profit / margin", icon: FiDollarSign },
  { id: "cashflow", label: "Cash flow", icon: FiActivity },
  { id: "ledger", label: "Party ledger", icon: FiCreditCard },
  { id: "inventory", label: "Inventory", icon: FiPackage },
  { id: "payments", label: "Payment mix", icon: FiPieChart },
  { id: "branch", label: "Branch report", icon: FiGitBranch },
  { id: "products", label: "Top products", icon: FiLayers },
  { id: "audit", label: "Audit log", icon: FiFileText },
];

export default function Reports() {
  const { data, can, toast } = useApp();
  const { branch } = useOutletContext();
  const [active, setActive] = useState("summary");
  const [period, setPeriod] = useState("30d");
  const [busy, setBusy] = useState("");

  const busyRun = (key, fn) => async () => {
    setBusy(key);
    try { await fn(); } catch (e) { toast(e.message || "Export failed", "danger"); } finally { setBusy(""); }
  };

  const branchTx = useMemo(() => (branch === "All branches" ? data.transactions : data.transactions.filter((t) => t.branch === branch)), [data.transactions, branch]);
  const scopeTx = useMemo(() => filterByPeriod(branchTx, period), [branchTx, period]);
  const report = useMemo(() => buildReport(active, { scopeTx, branchTx, data, period }), [active, scopeTx, branchTx, data, period]);

  const printReport = () => {
    const head = report.columns.map((c) => `<th class="${c.right ? "r" : ""}">${c.label}</th>`).join("");
    const body = report.rows.map((row) => `<tr>${report.columns.map((c) => `<td class="${c.right ? "r" : ""}">${cell(c, row)}</td>`).join("")}</tr>`).join("");
    printHtml(report.title, `<h1>${report.title}</h1><div class="sub">${report.subtitle} · Generated ${formatDate(new Date())}</div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
  };

  return (
    <div className="grid lg:grid-cols-[15rem_1fr] gap-4 max-w-[1500px] mx-auto">
      {/* report picker */}
      <aside className="lg:sticky lg:top-20 h-fit">
        <div className="lg:hidden">
          <select value={active} onChange={(e) => setActive(e.target.value)} className="input">{REPORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
        </div>
        <Card className="hidden lg:block p-2">
          {REPORTS.map((r) => (
            <button key={r.id} onClick={() => setActive(r.id)} className={cx("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors", active === r.id ? "bg-brand/10 text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
              <r.icon className="text-base shrink-0" />{r.label}
            </button>
          ))}
        </Card>
      </aside>

      <div className="space-y-4 min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <div><h2 className="text-lg font-bold text-ink">{report.title}</h2><p className="text-xs text-muted">{report.subtitle}</p></div>
          <div className="ml-auto flex items-center gap-2">
            <Segmented size="sm" options={PERIODS.map((p) => ({ value: p.id, label: p.label }))} value={period} onChange={setPeriod} />
          </div>
        </div>

        {can("reports.export") && (
          <div className="flex flex-wrap gap-2 justify-end">
            <span className="text-xs text-muted self-center mr-1"><FiDownload className="inline mb-0.5" /> Export</span>
            <button onClick={() => exportCsv(report.exportName, report.rows, report.columns)} className="btn btn-ghost btn-sm">CSV</button>
            <button onClick={busyRun("xlsx", async () => { const { exportXlsx } = await import("../lib/exporters"); await exportXlsx(report.exportName, { columns: report.columns, rows: report.rows, sheetName: report.title }); })} disabled={busy === "xlsx"} className="btn btn-ghost btn-sm">Excel</button>
            <button onClick={busyRun("pdf", async () => { const { exportPdfTable } = await import("../lib/exporters"); await exportPdfTable(report.exportName, { title: report.title, subtitle: report.subtitle, columns: report.columns, rows: report.rows }); })} disabled={busy === "pdf"} className="btn btn-ghost btn-sm">PDF</button>
            <button onClick={busyRun("docx", async () => { const { exportDocxTable } = await import("../lib/exporters"); await exportDocxTable(report.exportName, { title: report.title, subtitle: report.subtitle, columns: report.columns, rows: report.rows }); })} disabled={busy === "docx"} className="btn btn-ghost btn-sm">Word</button>
            <button onClick={() => exportJson(report.exportName, report.rows)} className="btn btn-ghost btn-sm">JSON</button>
            <button onClick={printReport} className="btn btn-ghost btn-sm"><FiPrinter />Print</button>
          </div>
        )}

        {report.kpis?.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {report.kpis.map((k) => <KpiCard key={k.label} label={k.label} value={k.value} format={compactInr} icon={k.icon} tone={k.tone} subtitle={k.subtitle} />)}
          </div>
        )}

        {report.chart}

        <Card className="overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">{report.rows.length} rows</p>
          </div>
          {report.rows.length === 0 ? <EmptyState icon={FiFileText} title="Nothing to show" message="No data in this period." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead><tr className="text-left text-xs text-muted border-b border-line">{report.columns.map((c) => <th key={c.label} className={cx("font-medium px-4 py-2.5", c.right && "text-right")}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {report.rows.map((row, i) => (
                    <tr key={row.id ?? i} className="row-hover border-b border-line">
                      {report.columns.map((c) => <td key={c.label} className={cx("px-4 py-2.5", c.right ? "text-right tnum text-ink" : "text-ink-2")}>{cell(c, row)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function cell(col, row) {
  const raw = typeof col.value === "function" ? col.value(row) : row[col.key];
  return col.fmt ? col.fmt(raw, row) : raw;
}

function buildReport(id, { scopeTx, branchTx, data, period }) {
  const t = totals(scopeTx);
  const periodLabel = PERIODS.find((p) => p.id === period)?.label || "";
  const money = (v) => inr.format(v);

  const salesRows = scopeTx.filter((x) => x.type === "sale");
  const purchaseRows = scopeTx.filter((x) => x.type === "purchase");

  const billColumns = [
    { key: "id", label: "Bill" },
    { label: "Date", value: (r) => r.date, fmt: (v) => formatDate(v) },
    { key: "party", label: "Party" },
    { label: "Product", value: (r) => r.product },
    { label: "Weight (kg)", value: (r) => r.totalKg, right: true, fmt: (v) => num.format(v) },
    { label: "Rate", value: (r) => r.rate, right: true, fmt: (v) => inr2.format(v) },
    { label: "Net", value: (r) => r.netAmount, right: true, fmt: (v) => inr.format(v) },
    { label: "Due", value: (r) => r.dueAmount, right: true, fmt: (v) => inr.format(v) },
  ];

  const bars = (series, subtitle) => (
    <Card className="p-5">
      <PanelHeader title="Sales vs purchases" subtitle={subtitle} />
      <div className="flex items-center gap-4 text-xs mb-3">
        <span className="flex items-center gap-1.5 text-ink-2"><span className="size-2.5 rounded-sm" style={{ background: "var(--sale)" }} />Sales</span>
        <span className="flex items-center gap-1.5 text-ink-2"><span className="size-2.5 rounded-sm" style={{ background: "var(--purchase)" }} />Purchases</span>
      </div>
      <GroupedBars data={series} height={230} format={money} />
    </Card>
  );

  switch (id) {
    case "sales":
      return {
        title: "Sales report", subtitle: `${periodLabel} · ${salesRows.length} sale bills`, exportName: `sales-${period}`,
        kpis: [
          { label: "Gross sales", value: t.salesGross, icon: FiTrendingUp, tone: "sale" },
          { label: "Net sales", value: t.salesNet, icon: FiDollarSign, tone: "sale", subtitle: `${t.salesCount} bills` },
          { label: "Cash received", value: t.cashIn, icon: FiCreditCard, tone: "success" },
          { label: "Outstanding", value: t.receivable, icon: FiActivity, tone: "warning" },
        ],
        chart: bars(dailySeries(branchTx, 14), "Last 14 days"),
        columns: billColumns, rows: salesRows,
      };
    case "purchases":
      return {
        title: "Purchase report", subtitle: `${periodLabel} · ${purchaseRows.length} purchase bills`, exportName: `purchases-${period}`,
        kpis: [
          { label: "Gross purchases", value: t.purchaseGross, icon: FiShoppingBag, tone: "purchase" },
          { label: "Net purchases", value: t.purchaseNet, icon: FiDollarSign, tone: "purchase", subtitle: `${t.purchaseCount} bills` },
          { label: "Cash paid", value: t.cashOut, icon: FiCreditCard, tone: "info" },
          { label: "Payable", value: t.payable, icon: FiActivity, tone: "danger" },
        ],
        chart: bars(dailySeries(branchTx, 14), "Last 14 days"),
        columns: billColumns, rows: purchaseRows,
      };
    case "profit": {
      const sByProd = productBreakdown(scopeTx, "sale");
      const pByProd = new Map(productBreakdown(scopeTx, "purchase").map((x) => [x.id, x]));
      const rows = sByProd.map((s) => {
        const buy = pByProd.get(s.id)?.value || 0;
        return { id: s.id, name: s.name, sales: s.value, purchases: buy, margin: s.value - buy };
      });
      return {
        title: "Profit & margin", subtitle: `${periodLabel} · trade margin (sales − purchases)`, exportName: `profit-${period}`,
        kpis: [
          { label: "Net sales", value: t.salesNet, icon: FiTrendingUp, tone: "sale" },
          { label: "Net purchases", value: t.purchaseNet, icon: FiShoppingBag, tone: "purchase" },
          { label: "Trade margin", value: t.net, icon: FiDollarSign, tone: t.net >= 0 ? "success" : "danger" },
          { label: "Stock value", value: inventoryValuation(data.products).value, icon: FiPackage, tone: "info" },
        ],
        chart: bars(monthlySeries(branchTx, 6), "Last 6 months"),
        columns: [
          { key: "name", label: "Product" },
          { label: "Sales", value: (r) => r.sales, right: true, fmt: money },
          { label: "Purchases", value: (r) => r.purchases, right: true, fmt: money },
          { label: "Margin", value: (r) => r.margin, right: true, fmt: money },
        ],
        rows,
      };
    }
    case "cashflow": {
      const series = dailySeries(branchTx, 14).map((d) => ({ ...d, value: d.sale - d.purchase }));
      const rows = dailySeries(branchTx, 30).map((d) => ({ id: d.key, label: d.label, inflow: d.sale, outflow: d.purchase, net: d.sale - d.purchase }));
      return {
        title: "Cash flow", subtitle: `${periodLabel} · money in vs out`, exportName: `cashflow-${period}`,
        kpis: [
          { label: "Cash in", value: t.cashIn, icon: FiTrendingUp, tone: "success" },
          { label: "Cash out", value: t.cashOut, icon: FiShoppingBag, tone: "danger" },
          { label: "Net flow", value: t.cashIn - t.cashOut, icon: FiActivity, tone: (t.cashIn - t.cashOut) >= 0 ? "success" : "danger" },
          { label: "Receivable − Payable", value: t.receivable - t.payable, icon: FiCreditCard, tone: "accent" },
        ],
        chart: <Card className="p-5"><PanelHeader title="Net daily position" subtitle="Sales − purchases, last 14 days" /><TrendArea data={series} height={150} format={money} /></Card>,
        columns: [
          { key: "label", label: "Day" },
          { label: "Inflow", value: (r) => r.inflow, right: true, fmt: money },
          { label: "Outflow", value: (r) => r.outflow, right: true, fmt: money },
          { label: "Net", value: (r) => r.net, right: true, fmt: money },
        ],
        rows,
      };
    }
    case "ledger": {
      const rows = data.parties.filter((p) => p.balance > 0).sort((a, b) => b.balance - a.balance)
        .map((p) => ({ id: p.id, name: p.name, phone: p.phone, type: p.balanceType, balance: p.balance }));
      return {
        title: "Party ledger", subtitle: "Outstanding balances (all time)", exportName: "ledger",
        kpis: [
          { label: "Total receivable", value: rows.filter((r) => r.type === "debtor").reduce((s, r) => s + r.balance, 0), icon: FiTrendingUp, tone: "success" },
          { label: "Total payable", value: rows.filter((r) => r.type === "creditor").reduce((s, r) => s + r.balance, 0), icon: FiShoppingBag, tone: "danger" },
          { label: "Parties with dues", value: rows.length, icon: FiCreditCard, tone: "brand", subtitle: "open ledgers" },
          { label: "Net position", value: rows.reduce((s, r) => s + (r.type === "debtor" ? r.balance : -r.balance), 0), icon: FiActivity, tone: "accent" },
        ],
        chart: null,
        columns: [
          { key: "id", label: "ID" }, { key: "name", label: "Party" }, { key: "phone", label: "Phone" },
          { label: "Type", value: (r) => r.type, fmt: (v) => (v === "debtor" ? "Receivable" : "Payable") },
          { label: "Balance", value: (r) => r.balance, right: true, fmt: money },
        ],
        rows,
      };
    }
    case "inventory": {
      const inv = inventoryValuation(data.products);
      return {
        title: "Inventory report", subtitle: "Current stock & valuation", exportName: "inventory",
        kpis: [
          { label: "Stock (tonnes)", value: inv.totalKg / 1000, icon: FiPackage, tone: "brand", subtitle: `${num.format(inv.totalKg)} kg` },
          { label: "Stock value", value: inv.value, icon: FiDollarSign, tone: "info" },
          { label: "Product lines", value: data.products.length, icon: FiLayers, tone: "accent" },
          { label: "Avg rate/kg", value: inv.totalKg ? inv.value / inv.totalKg : 0, icon: FiTrendingUp, tone: "success" },
        ],
        chart: null,
        columns: [
          { key: "id", label: "ID" }, { key: "name", label: "Product" }, { key: "category", label: "Category" },
          { label: "Stock (kg)", value: (r) => r.stockKg, right: true, fmt: (v) => num.format(v) },
          { label: "Rate", value: (r) => r.baseRate, right: true, fmt: inr2.format },
          { label: "Value", value: (r) => r.value, right: true, fmt: money },
        ],
        rows: inv.lines.slice().sort((a, b) => b.value - a.value),
      };
    }
    case "payments": {
      const pay = paymentBreakdown(scopeTx);
      return {
        title: "Payment mix", subtitle: `${periodLabel} · by method`, exportName: `payments-${period}`,
        kpis: [],
        chart: <Card className="p-5"><PanelHeader title="Payment methods" subtitle="Share of net value" /><Donut data={pay.map((p, i) => ({ id: p.method, label: p.method, value: p.value, color: SERIES_COLORS[i] }))} centerValue={String(pay.length)} centerLabel="methods" /></Card>,
        columns: [
          { key: "method", label: "Method" },
          { label: "Bills", value: (r) => r.count, right: true },
          { label: "Value", value: (r) => r.value, right: true, fmt: money },
        ],
        rows: pay,
      };
    }
    case "branch": {
      const b = branchSummary(scopeTx);
      return {
        title: "Branch report", subtitle: `${periodLabel} · performance by office`, exportName: `branch-${period}`,
        kpis: [], chart: null,
        columns: [
          { key: "branch", label: "Branch" },
          { label: "Bills", value: (r) => r.count, right: true },
          { label: "Sales", value: (r) => r.sales, right: true, fmt: money },
          { label: "Purchases", value: (r) => r.purchases, right: true, fmt: money },
          { label: "Net", value: (r) => r.sales - r.purchases, right: true, fmt: money },
        ],
        rows: b,
      };
    }
    case "products": {
      const prod = productBreakdown(scopeTx, "sale");
      return {
        title: "Top products", subtitle: `${periodLabel} · by sales value`, exportName: `products-${period}`,
        kpis: [],
        chart: <Card className="p-5"><PanelHeader title="Best sellers" subtitle="By billed value" />{prod.length ? <BarList data={prod.slice(0, 8).map((p, i) => ({ id: p.id, label: p.name, value: p.value, color: SERIES_COLORS[i % SERIES_COLORS.length] }))} format={money} /> : <EmptyState icon={FiPackage} title="No sales" />}</Card>,
        columns: [
          { key: "name", label: "Product" },
          { label: "Bills", value: (r) => r.count, right: true },
          { label: "Weight (kg)", value: (r) => r.weight, right: true, fmt: (v) => num.format(v) },
          { label: "Value", value: (r) => r.value, right: true, fmt: money },
        ],
        rows: prod,
      };
    }
    case "audit":
      return {
        title: "Audit log", subtitle: "Rate changes, overrides & security events", exportName: "audit",
        kpis: [], chart: null,
        columns: [
          { label: "Date", value: (r) => r.date, fmt: (v) => formatDate(v) },
          { key: "kind", label: "Type" }, { key: "text", label: "Event" }, { key: "meta", label: "Details" },
        ],
        rows: data.audits,
      };
    default:
      return {
        title: "Business summary", subtitle: `${periodLabel} · sales, purchases & position`, exportName: `summary-${period}`,
        kpis: [
          { label: "Net sales", value: t.salesNet, icon: FiTrendingUp, tone: "sale", subtitle: `${t.salesCount} bills` },
          { label: "Net purchases", value: t.purchaseNet, icon: FiShoppingBag, tone: "purchase", subtitle: `${t.purchaseCount} bills` },
          { label: "Trade margin", value: t.net, icon: FiDollarSign, tone: t.net >= 0 ? "success" : "danger" },
          { label: "Stock value", value: inventoryValuation(data.products).value, icon: FiPackage, tone: "info" },
        ],
        chart: bars(monthlySeries(branchTx, 6), "Last 6 months"),
        columns: billColumns, rows: scopeTx,
      };
  }
}
