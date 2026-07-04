import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  FiActivity, FiAlertTriangle, FiArrowDownLeft, FiArrowRight, FiBox, FiClock,
  FiCreditCard, FiEdit2, FiPackage, FiPlus, FiShoppingBag, FiTrendingUp, FiUsers,
} from "react-icons/fi";
import { useApp } from "../context/AppContext";
import { Badge, BarList, Button, Card, EmptyState, GroupedBars, KpiCard, PanelHeader, Segmented, cx } from "../ui";
import { SERIES_COLORS, compactInr, formatDate, initials, inr, num, timeAgo, txProductLabel } from "../lib/format";
import { dailySeries, inventoryValuation, productBreakdown, stockAlerts, totals } from "../lib/reports";

export default function Dashboard() {
  const { data, user } = useApp();
  const { openBill, branch } = useOutletContext();
  const [range, setRange] = useState(14);

  const transactions = useMemo(
    () => (branch === "All branches" ? data.transactions : data.transactions.filter((t) => t.branch === branch)),
    [data.transactions, branch],
  );

  const today = new Date();
  const todayTx = transactions.filter((t) => new Date(t.date).toDateString() === today.toDateString());
  const yTx = transactions.filter((t) => new Date(t.date).toDateString() === new Date(Date.now() - 864e5).toDateString());
  const t = totals(todayTx);
  const yesterday = totals(yTx);
  const series = useMemo(() => dailySeries(transactions, range), [transactions, range]);
  const spark = series.slice(-7);
  const inv = inventoryValuation(data.products);
  const receivable = data.parties.filter((p) => p.balanceType === "debtor").reduce((s, p) => s + p.balance, 0);
  const payable = data.parties.filter((p) => p.balanceType === "creditor").reduce((s, p) => s + p.balance, 0);
  const alerts = stockAlerts(data.products);
  const topProducts = productBreakdown(transactions, "sale").slice(0, 5).map((p, i) => ({ id: p.id, label: p.name, value: p.value, color: SERIES_COLORS[i] }));
  const debtors = [...data.parties].filter((p) => p.balanceType === "debtor" && p.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 4);
  const creditors = [...data.parties].filter((p) => p.balanceType === "creditor" && p.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 4);

  const pct = (now, prev) => (prev > 0 ? `${Math.abs(Math.round(((now - prev) / prev) * 100))}%` : now > 0 ? "New" : "0%");
  const hour = today.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-ink">{greeting}, {user.displayName.split(" ")[0]} 👋</h2>
          <p className="text-sm text-muted mt-0.5">Here’s what’s happening at your mill {branch === "All branches" ? "today" : `in ${branch}`}.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" icon={FiArrowDownLeft} onClick={() => openBill("purchase")} className="hidden sm:inline-flex">Purchase</Button>
          <Button variant="primary" icon={FiPlus} onClick={() => openBill("sale")}>New sale</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="Today's sales" value={t.salesNet} format={compactInr} icon={FiTrendingUp} tone="sale"
          delta={pct(t.salesNet, yesterday.salesNet)} deltaUp={t.salesNet >= yesterday.salesNet} subtitle={`${t.salesCount} bills`} spark={spark.map((d) => d.sale)} />
        <KpiCard label="Today's purchases" value={t.purchaseNet} format={compactInr} icon={FiShoppingBag} tone="purchase"
          delta={pct(t.purchaseNet, yesterday.purchaseNet)} deltaUp={t.purchaseNet >= yesterday.purchaseNet} subtitle={`${t.purchaseCount} bills`} spark={spark.map((d) => d.purchase)} />
        <KpiCard label="Inventory value" value={inv.value} format={compactInr} icon={FiBox} tone="info" subtitle={`${num.format(inv.totalKg / 1000)} T in stock`} />
        <KpiCard label="Net receivable" value={receivable - payable} format={compactInr} icon={FiCreditCard} tone="accent"
          subtitle={`${inr.format(receivable)} in · ${inr.format(payable)} out`} />
      </div>

      {/* main + side */}
      <div className="grid xl:grid-cols-3 gap-4 lg:gap-5">
        <Card className="p-5 xl:col-span-2">
          <PanelHeader title="Sales & purchase overview" subtitle={`Net values · last ${range} days`}
            action={<Segmented size="sm" options={[{ value: 7, label: "7d" }, { value: 14, label: "14d" }, { value: 30, label: "30d" }]} value={range} onChange={setRange} />} />
          <div className="flex flex-wrap items-center gap-5 mb-4">
            <div><p className="text-xs text-muted">Sales</p><p className="text-lg font-bold text-ink tnum">{inr.format(series.reduce((s, d) => s + d.sale, 0))}</p></div>
            <div><p className="text-xs text-muted">Purchases</p><p className="text-lg font-bold text-ink tnum">{inr.format(series.reduce((s, d) => s + d.purchase, 0))}</p></div>
            <div className="ml-auto flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-ink-2"><span className="size-2.5 rounded-sm" style={{ background: "var(--sale)" }} />Sales</span>
              <span className="flex items-center gap-1.5 text-ink-2"><span className="size-2.5 rounded-sm" style={{ background: "var(--purchase)" }} />Purchases</span>
            </div>
          </div>
          <GroupedBars data={series} height={250} format={(v) => inr.format(v)} />
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <PanelHeader title="Stock alerts" subtitle={alerts.length ? `${alerts.length} item(s) running low` : "All grains healthy"} icon={FiAlertTriangle} />
            {alerts.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl bg-success/10 border border-success/20 p-3">
                <FiActivity className="text-success" /><p className="text-sm text-ink-2">Healthy stock levels across all products.</p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {alerts.slice(0, 4).map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <span className="grid place-items-center size-8 rounded-lg bg-warning/15 text-warning text-xs font-bold">{p.short}</span>
                    <span className="min-w-0 grow"><span className="block text-sm font-medium text-ink truncate">{p.name}</span><span className="block text-xs text-muted">{num.format(p.stockKg)} kg left</span></span>
                    <Badge tone="warning">Low</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <PanelHeader title="Top selling products" subtitle="By billed value" />
            {topProducts.length ? <BarList data={topProducts} format={(v) => inr.format(v)} /> : <EmptyState icon={FiPackage} title="No sales yet" message="Top products appear here once you record sales." />}
          </Card>
        </div>
      </div>

      {/* recent + ledgers + activity */}
      <div className="grid xl:grid-cols-3 gap-4 lg:gap-5">
        <Card className="p-5 xl:col-span-2 overflow-hidden">
          <PanelHeader title="Recent bills" subtitle="Latest transactions" action={<Link to="/bills" className="btn btn-subtle btn-sm">View all <FiArrowRight /></Link>} />
          {todayTx.length + transactions.length === 0 ? (
            <EmptyState title="No bills yet" message="Create your first sale or purchase to see it here." action={<Button variant="primary" icon={FiPlus} onClick={() => openBill("sale")}>New sale</Button>} />
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead><tr className="text-left text-xs text-muted">{["Bill", "Party", "Item", "Weight", "Amount", "Status"].map((h) => <th key={h} className="font-medium px-2 pb-2">{h}</th>)}</tr></thead>
                <tbody>
                  {transactions.slice(0, 7).map((tx) => (
                    <tr key={tx.id} className="row-hover border-t border-line">
                      <td className="px-2 py-2.5"><span className="font-semibold text-ink">{tx.id}</span><span className="block text-xs text-muted">{formatDate(tx.date)}</span></td>
                      <td className="px-2 py-2.5"><span className="text-ink">{tx.party}</span><span className="block text-xs text-muted">{tx.branch}</span></td>
                      <td className="px-2 py-2.5 text-ink-2">{txProductLabel(tx)}</td>
                      <td className="px-2 py-2.5 tnum text-ink-2">{num.format(tx.totalKg / 100)} qtl</td>
                      <td className="px-2 py-2.5 tnum font-semibold text-ink">{inr.format(tx.netAmount)}</td>
                      <td className="px-2 py-2.5"><Badge tone={tx.dueAmount ? "warning" : "success"}>{tx.dueAmount ? "Part paid" : "Paid"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <PanelHeader title="Activity" subtitle="Rate changes & overrides" />
          <ul className="space-y-3">
            {data.audits.slice(0, 5).map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className={cx("grid place-items-center size-8 rounded-lg shrink-0", a.kind === "override" ? "bg-warning/15 text-warning" : "bg-info/12 text-info")}>{a.kind === "override" ? <FiEdit2 className="text-sm" /> : <FiClock className="text-sm" />}</span>
                <div className="min-w-0"><p className="text-sm text-ink leading-snug">{a.text}</p><p className="text-xs text-muted mt-0.5 truncate">{a.meta} · {timeAgo(a.date)}</p></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ledgers */}
      <div className="grid md:grid-cols-2 gap-4 lg:gap-5">
        <LedgerWidget title="Top debtors" caption="You will receive" tone="success" parties={debtors} />
        <LedgerWidget title="Top creditors" caption="You have to pay" tone="danger" parties={creditors} />
      </div>
    </div>
  );
}

function LedgerWidget({ title, caption, tone, parties }) {
  return (
    <Card className="p-5">
      <PanelHeader title={title} subtitle={caption} action={<Link to="/parties" className="btn btn-subtle btn-sm">Ledgers <FiArrowRight /></Link>} />
      {parties.length === 0 ? <EmptyState icon={FiUsers} title="Nothing outstanding" message="No balances to show." /> : (
        <ul className="divide-y divide-line">
          {parties.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <span className="grid place-items-center size-9 rounded-xl bg-surface-3 text-ink-2 text-xs font-bold">{initials(p.name)}</span>
              <div className="min-w-0 grow"><p className="text-sm font-medium text-ink truncate">{p.name}</p><p className="text-xs text-muted">{p.id} · {p.phone}</p></div>
              <span className={cx("font-semibold tnum", tone === "success" ? "text-success" : "text-danger")}>{inr.format(p.balance)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
