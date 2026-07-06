import { useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { FiCreditCard, FiDownload, FiMapPin, FiPhone, FiSearch, FiUsers, FiArrowUpRight, FiArrowDownLeft } from "react-icons/fi";
import { useApp } from "../context/AppContext";
import { Avatar, Badge, Button, Card, Drawer, EmptyState, Modal, Segmented, cx } from "../ui";
import { BillDetailBody } from "../billing/BillDetailBody";
import { exportCsv } from "../lib/export";
import { formatDate, formatDateLong, inr, inr2 } from "../lib/format";
import { partyStatement } from "../lib/reports";
import { useDebounced } from "../lib/hooks";

export default function Parties() {
  const { data } = useApp();
  const { openBill } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(null);
  const q = useDebounced(query);

  const focusId = params.get("focus");
  useEffect(() => {
    if (focusId) {
      const p = data.parties.find((x) => x.id === focusId);
      if (p) setFocused(p);
      setParams({}, { replace: true });
    }
  }, [focusId, data.parties, setParams]);

  const receivable = data.parties.filter((p) => p.balanceType === "debtor").reduce((s, p) => s + p.balance, 0);
  const payable = data.parties.filter((p) => p.balanceType === "creditor").reduce((s, p) => s + p.balance, 0);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    return data.parties
      .filter((p) => filter === "all" || (filter === "debtor" || filter === "creditor" ? p.balanceType === filter : p.kind === filter))
      .filter((p) => !term || p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term) || (digits && p.phone.replace(/\D/g, "").includes(digits)))
      .sort((a, b) => b.balance - a.balance);
  }, [data.parties, filter, q]);

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="p-4 flex items-center gap-3"><span className="grid place-items-center size-11 rounded-xl bg-success/12 text-success"><FiArrowDownLeft /></span><div><p className="text-xs text-muted">Receivable from debtors</p><p className="text-lg font-bold text-ink tnum">{inr.format(receivable)}</p></div></Card>
        <Card className="p-4 flex items-center gap-3"><span className="grid place-items-center size-11 rounded-xl bg-danger/12 text-danger"><FiArrowUpRight /></span><div><p className="text-xs text-muted">Payable to creditors</p><p className="text-lg font-bold text-ink tnum">{inr.format(payable)}</p></div></Card>
        <Card className="p-4 flex items-center gap-3"><span className="grid place-items-center size-11 rounded-xl bg-brand/12 text-brand"><FiUsers /></span><div><p className="text-xs text-muted">Total parties</p><p className="text-lg font-bold text-ink tnum">{data.parties.length}</p></div></Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented options={[{ value: "all", label: "All" }, { value: "customer", label: "Customers" }, { value: "supplier", label: "Suppliers" }, { value: "debtor", label: "Debtors" }, { value: "creditor", label: "Creditors" }]} value={filter} onChange={setFilter} />
        <div className="relative grow min-w-[200px] max-w-md">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, phone or ID…" className="input pl-9" />
        </div>
        <Button variant="ghost" icon={FiDownload} className="ml-auto" onClick={() => exportCsv(`parties-${Date.now()}`, rows, [
          { key: "id", label: "ID" }, { key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "address", label: "Address" }, { key: "kind", label: "Kind" }, { key: "balanceType", label: "Balance type" }, { key: "balance", label: "Balance" },
        ])}>Export</Button>
      </div>

      {rows.length === 0 ? (
        <Card><EmptyState icon={FiUsers} title="No parties found" message="Parties are created automatically when you bill them." /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((p) => (
            <button key={p.id} onClick={() => setFocused(p)} className="card p-4 text-left hover:-translate-y-0.5 transition-transform group">
              <div className="flex items-start gap-3">
                <Avatar name={p.name} className="size-11" />
                <div className="min-w-0 grow">
                  <div className="flex items-center gap-2"><h3 className="font-semibold text-ink truncate">{p.name}</h3><Badge className="capitalize shrink-0">{p.kind}</Badge></div>
                  <p className="text-xs text-muted mt-0.5">{p.id} · {p.phone}</p>
                  <p className="text-xs text-muted truncate flex items-center gap-1 mt-1"><FiMapPin className="shrink-0" />{p.address}</p>
                </div>
              </div>
              <div className="flex items-end justify-between mt-4 pt-3 border-t border-line">
                <div><p className="text-[11px] text-muted">{p.balanceType === "debtor" ? "You will receive" : "You have to pay"}</p><p className={cx("text-lg font-bold tnum", p.balanceType === "debtor" ? "text-success" : "text-danger")}>{inr.format(p.balance)}</p></div>
                <span className="text-xs text-brand font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">Ledger <FiArrowUpRight /></span>
              </div>
            </button>
          ))}
        </div>
      )}

      <PartyDrawer party={focused} onClose={() => setFocused(null)} onBill={openBill} />
    </div>
  );
}

function PartyDrawer({ party, onClose, onBill }) {
  const { data } = useApp();
  const [openTx, setOpenTx] = useState(null);
  const statement = party ? partyStatement(data.transactions, party.id) : [];
  const totalBilled = statement.reduce((s, x) => s + x.amount, 0);
  const openBillDetail = (id) => {
    const tx = data.transactions.find((t) => t.id === id);
    if (tx) setOpenTx(tx);
  };
  return (
    <>
    <Drawer open={Boolean(party)} onClose={onClose} title={party?.name} subtitle={party ? `${party.id} · ${party.kind}` : ""} width="max-w-lg"
      footer={party && <Button variant="primary" onClick={() => { onClose(); onBill(party.kind === "supplier" ? "purchase" : "sale"); }}>New bill</Button>}>
      {party && (
        <div className="space-y-5">
          <div className={cx("rounded-2xl p-4 border", party.balanceType === "debtor" ? "bg-success/8 border-success/20" : "bg-danger/8 border-danger/20")}>
            <p className="text-xs text-ink-2">{party.balanceType === "debtor" ? "Outstanding — you will receive" : "Outstanding — you have to pay"}</p>
            <p className={cx("text-2xl font-bold tnum mt-1", party.balanceType === "debtor" ? "text-success" : "text-danger")}>{inr.format(party.balance)}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info icon={FiPhone} label="Contact" value={party.phone} />
            <Info icon={FiMapPin} label="Address" value={party.address} />
            <Info icon={FiCreditCard} label="Bank account" value={party.bankAccount || "Not added"} />
            <Info icon={FiCreditCard} label="IFSC" value={party.bankIfsc || "Not added"} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-ink">Transaction history</h4>
              <span className="text-xs text-muted">{statement.length} bills · {inr.format(totalBilled)}</span>
            </div>
            {statement.length === 0 ? <p className="text-sm text-muted py-4 text-center">No transactions yet.</p> : (
              <ul className="rounded-xl border border-line divide-y divide-line overflow-hidden">
                {statement.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => openBillDetail(s.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm row-hover text-left">
                      <span className={cx("size-2 rounded-full shrink-0")} style={{ background: s.type === "sale" ? "var(--sale)" : "var(--purchase)" }} />
                      <div className="min-w-0 grow"><span className="font-medium text-ink">{s.id}</span><span className="block text-xs text-muted">{s.product} · {formatDate(s.date)}</span></div>
                      <div className="text-right"><span className="font-semibold text-ink tnum">{inr2.format(s.amount)}</span>{s.due > 0 && <span className="block text-xs text-danger">{inr.format(s.due)} due</span>}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Drawer>
    <Modal open={Boolean(openTx)} onClose={() => setOpenTx(null)} size="lg"
      title={openTx?.id} subtitle={openTx ? `${openTx.kind === "truck" ? "Truck sale · Bill of Supply" : openTx.type === "sale" ? "Sale invoice" : "Purchase voucher"} · ${formatDateLong(openTx.date)}` : ""}
      footer={<Button variant="ghost" onClick={() => setOpenTx(null)}>Close</Button>}>
      {openTx && <BillDetailBody tx={openTx} />}
    </Modal>
    </>
  );
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-xs text-muted flex items-center gap-1.5"><Icon />{label}</p>
      <p className="text-sm font-medium text-ink mt-1 break-words">{value}</p>
    </div>
  );
}
