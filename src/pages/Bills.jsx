import { useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import {
  FiArrowDownLeft, FiDownload, FiFileText, FiPlus, FiSearch, FiTruck, FiX,
} from "react-icons/fi";
import { useApp } from "../context/AppContext";
import { Badge, Button, Card, Drawer, EmptyState, Segmented, cx } from "../ui";
import { BillDetailBody } from "../billing/BillDetailBody";
import { exportCsv, exportJson } from "../lib/export";
import { formatDateLong, inr, inr2, num, txProductLabel } from "../lib/format";
import { useDebounced } from "../lib/hooks";

const BILL_COLUMNS = [
  { key: "id", label: "Bill No" },
  { key: "type", label: "Type" },
  { label: "Date", value: (r) => formatDateLong(r.date) },
  { key: "party", label: "Party" },
  { label: "Product", value: (r) => r.product },
  { label: "Weight (kg)", value: (r) => r.totalKg },
  { label: "Rate", value: (r) => r.rate },
  { label: "Gross", value: (r) => r.gross },
  { label: "CD", value: (r) => r.cdDeduction },
  { label: "Discount", value: (r) => r.discount },
  { label: "Net", value: (r) => r.netAmount },
  { label: "Paid", value: (r) => r.paidAmount },
  { label: "Due", value: (r) => r.dueAmount },
  { key: "paymentMethod", label: "Payment" },
  { key: "branch", label: "Branch" },
];

export default function Bills() {
  const { data } = useApp();
  const { openBill, branch } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [focused, setFocused] = useState(null);
  const q = useDebounced(query);

  const focusId = params.get("focus");
  useEffect(() => {
    if (focusId) {
      const tx = data.transactions.find((t) => t.id === focusId);
      if (tx) setFocused(tx);
      setParams({}, { replace: true });
    }
  }, [focusId, data.transactions, setParams]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.transactions
      .filter((t) => branch === "All branches" || t.branch === branch)
      .filter((t) => filter === "all" || t.type === filter)
      .filter((t) => !term || t.id.toLowerCase().includes(term) || t.party.toLowerCase().includes(term) || t.product.toLowerCase().includes(term));
  }, [data.transactions, branch, filter, q]);

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented options={[{ value: "all", label: "All bills" }, { value: "sale", label: "Sales" }, { value: "purchase", label: "Purchases" }]} value={filter} onChange={setFilter} />
        <div className="relative grow min-w-[200px] max-w-md">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bill no., party or product…" className="input pl-9" />
          {query && <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"><FiX /></button>}
        </div>
        <div className="relative ml-auto flex gap-2">
          <div className="relative">
            <Button variant="ghost" icon={FiDownload} onClick={() => setExportOpen((o) => !o)}>Export</Button>
            {exportOpen && (
              <>
                <button className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} aria-label="close" />
                <div className="absolute right-0 mt-1 z-20 card p-1.5 w-44 shadow-pop">
                  {[
                    ["CSV (Excel)", () => exportCsv(`bills-${Date.now()}`, rows, BILL_COLUMNS)],
                    ["JSON", () => exportJson(`bills-${Date.now()}`, rows)],
                    ["Print / PDF", () => window.print()],
                  ].map(([label, fn]) => (
                    <button key={label} onClick={() => { fn(); setExportOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">{label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
          <Button variant="info" icon={FiTruck} onClick={() => openBill("truck")} className="hidden sm:inline-flex">Truck sale</Button>
          <Button variant="purchase" icon={FiArrowDownLeft} onClick={() => openBill("purchase")} className="hidden sm:inline-flex">Purchase</Button>
          <Button variant="primary" icon={FiPlus} onClick={() => openBill("sale")}>New sale</Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <p className="text-sm font-semibold text-ink">{rows.length} bill{rows.length !== 1 ? "s" : ""}</p>
          <p className="text-xs text-muted hidden sm:block">Net total <span className="font-semibold text-ink tnum">{inr.format(rows.reduce((s, r) => s + r.netAmount, 0))}</span></p>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={FiFileText} title="No bills found" message={query ? "Try a different search term." : "Create your first bill to get started."}
            action={<Button variant="primary" icon={FiPlus} onClick={() => openBill("sale")}>New sale bill</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[840px]">
              <thead><tr className="text-left text-xs text-muted border-b border-line">
                {["Bill no.", "Type", "Date", "Party", "Product", "Weight", "Rate/kg", "Net", "Due", ""].map((h) => <th key={h} className="font-medium px-4 py-2.5">{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((tx) => (
                  <tr key={tx.id} className="row-hover border-b border-line cursor-pointer" onClick={() => setFocused(tx)}>
                    <td className="px-4 py-3 font-semibold text-ink">{tx.id}</td>
                    <td className="px-4 py-3"><span className={cx("badge", tx.type === "sale" ? "badge-success" : "badge-warning", "capitalize")}>{tx.type}</span></td>
                    <td className="px-4 py-3 text-ink-2 whitespace-nowrap">{formatDateLong(tx.date)}</td>
                    <td className="px-4 py-3"><span className="text-ink">{tx.party}</span><span className="block text-xs text-muted">{tx.branch}</span></td>
                    <td className="px-4 py-3 text-ink-2">{txProductLabel(tx)}</td>
                    <td className="px-4 py-3 tnum text-ink-2 whitespace-nowrap">{num.format(tx.totalKg)} kg</td>
                    <td className="px-4 py-3 tnum text-ink-2">{inr2.format(tx.rate)}</td>
                    <td className="px-4 py-3 tnum font-semibold text-ink">{inr.format(tx.netAmount)}</td>
                    <td className={cx("px-4 py-3 tnum", tx.dueAmount ? "text-danger font-medium" : "text-muted")}>{tx.dueAmount ? inr.format(tx.dueAmount) : "Clear"}</td>
                    <td className="px-4 py-3 text-right"><Badge>{tx.dueAmount ? "Part paid" : "Paid"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <BillDrawer tx={focused} onClose={() => setFocused(null)} />
    </div>
  );
}

function BillDrawer({ tx, onClose }) {
  return (
    <Drawer open={Boolean(tx)} onClose={onClose} title={tx?.id} subtitle={tx ? `${tx.kind === "truck" ? "Truck sale · Bill of Supply" : tx.type === "sale" ? "Sale invoice" : "Purchase voucher"} · ${formatDateLong(tx.date)}` : ""}
      footer={tx && <Button variant="ghost" onClick={onClose}>Close</Button>}>
      {tx && <BillDetailBody tx={tx} />}
    </Drawer>
  );
}
