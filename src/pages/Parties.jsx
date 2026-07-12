import { useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { FiCreditCard, FiDownload, FiMapPin, FiPhone, FiSearch, FiUsers, FiArrowUpRight, FiArrowDownLeft, FiTruck, FiPlusCircle } from "react-icons/fi";
import { useApp } from "../context/AppContext";
import { Avatar, Badge, Button, Card, Drawer, EmptyState, Field, Modal, Segmented, cx } from "../ui";
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

  // Parties that are truck owners (freight payable keyed by vehicle no) — traced from the truck
  // bills that booked their "to-pay". Used to label their card/drawer as a driver payable.
  const truckOwnerIds = useMemo(() => {
    const ids = new Set();
    for (const t of data.transactions) {
      if (t.kind === "truck" && t.meta?.tracking?.ownerParty) ids.add(t.meta.tracking.ownerParty);
    }
    return ids;
  }, [data.transactions]);

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
          {rows.map((p) => {
            const owner = truckOwnerIds.has(p.id);
            return (
            <button key={p.id} onClick={() => setFocused(p)} className="card p-4 text-left hover:-translate-y-0.5 transition-transform group">
              <div className="flex items-start gap-3">
                <Avatar name={p.name} className="size-11" />
                <div className="min-w-0 grow">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-ink truncate">{p.name}</h3>
                    {owner
                      ? <Badge className="shrink-0 bg-info/12 text-info border-info/25"><span className="inline-flex items-center gap-1"><FiTruck />Truck</span></Badge>
                      : <Badge className="capitalize shrink-0">{p.kind}</Badge>}
                  </div>
                  <p className="text-xs text-muted mt-0.5">{p.id} · {p.phone}</p>
                  <p className="text-xs text-muted truncate flex items-center gap-1 mt-1"><FiMapPin className="shrink-0" />{p.address}</p>
                </div>
              </div>
              <div className="flex items-end justify-between mt-4 pt-3 border-t border-line">
                <div><p className="text-[11px] text-muted">{p.balanceType === "debtor" ? "You will receive" : "You have to pay"}</p><p className={cx("text-lg font-bold tnum", p.balanceType === "debtor" ? "text-success" : "text-danger")}>{inr.format(p.balance)}</p></div>
                <span className="text-xs text-brand font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">Ledger <FiArrowUpRight /></span>
              </div>
            </button>
            );
          })}
        </div>
      )}

      <PartyDrawer party={focused} onClose={() => setFocused(null)} onBill={openBill} />
    </div>
  );
}

function PartyDrawer({ party, onClose, onBill }) {
  const { data, can } = useApp();
  const [openTx, setOpenTx] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const statement = party ? partyStatement(data.transactions, party.id) : [];
  const totalBilled = statement.reduce((s, x) => s + x.amount, 0);
  const openBillDetail = (id) => {
    const tx = data.transactions.find((t) => t.id === id);
    if (tx) setOpenTx(tx);
  };

  // Truck-owner (freight) party: real bills are billed to the grain buyer, so its challans don't
  // show under partyStatement — trace them via meta.tracking.ownerParty so the vehicle party's
  // ledger lists every associated challan (each opening its Bill of Supply / Challan for traceback).
  const ownedTrucks = party
    ? data.transactions
        .filter((t) => t.kind === "truck" && t.meta?.tracking?.ownerParty === party.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
    : [];
  const isOwner = ownedTrucks.length > 0;

  // Standalone receipts/payments recorded against this party's balance.
  const payments = party ? (data.payments || []).filter((p) => p.partyId === party.id) : [];
  const canPay = Boolean(party) && can("parties.payment") && party.balance > 0;
  const payVerb = party?.balanceType === "debtor" ? "Receive payment" : "Record payment";

  return (
    <>
    <Drawer open={Boolean(party)} onClose={onClose} title={party?.name} subtitle={party ? `${party.id} · ${party.kind}` : ""} width="max-w-lg"
      footer={party && <Button variant="primary" onClick={() => { onClose(); onBill(party.kind === "supplier" ? "purchase" : "sale"); }}>New bill</Button>}>
      {party && (
        <div className="space-y-5">
          <div className={cx("rounded-2xl p-4 border", party.balanceType === "debtor" ? "bg-success/8 border-success/20" : "bg-danger/8 border-danger/20")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-ink-2">{party.balanceType === "debtor" ? "Outstanding — you will receive" : "Outstanding — you have to pay"}</p>
                <p className={cx("text-2xl font-bold tnum mt-1", party.balanceType === "debtor" ? "text-success" : "text-danger")}>{inr.format(party.balance)}</p>
              </div>
              {canPay && <Button size="sm" variant="primary" icon={FiPlusCircle} onClick={() => setPayOpen(true)}>{payVerb}</Button>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info icon={FiPhone} label="Contact" value={party.phone} />
            <Info icon={FiMapPin} label="Address" value={party.address} />
            <Info icon={FiCreditCard} label="Bank account" value={party.bankAccount || "Not added"} />
            <Info icon={FiCreditCard} label="IFSC" value={party.bankIfsc || "Not added"} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-ink">{isOwner ? "Challans on this vehicle" : "Transaction history"}</h4>
              <span className="text-xs text-muted">{isOwner ? `${ownedTrucks.length} challan${ownedTrucks.length !== 1 ? "s" : ""}` : `${statement.length} bills · ${inr.format(totalBilled)}`}</span>
            </div>
            {isOwner ? (
              // Each row shows the freight (bhada) breakdown for that challan and opens the linked
              // Bill of Supply / Challan (via the truck-bill popup) so a pending amount is traceable.
              <ul className="rounded-xl border border-line divide-y divide-line overflow-hidden">
                {ownedTrucks.map((t) => {
                  const paid = Boolean(t.meta?.tracking?.driverPaid);
                  const remaining = paid ? 0 : Number(t.meta?.toPay || 0);
                  return (
                    <li key={t.id}>
                      <button type="button" onClick={() => setOpenTx(t)} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm row-hover text-left">
                        <span className="grid place-items-center size-8 rounded-lg bg-info/12 text-info shrink-0"><FiTruck /></span>
                        <div className="min-w-0 grow">
                          <span className="font-medium text-ink">Challan {t.meta?.challanNo || "—"} → {t.party}</span>
                          <span className="block text-xs text-muted">Bhada {inr.format(Number(t.meta?.bhara || 0))} · Advance {inr.format(Number(t.meta?.advance || 0))} · {formatDate(t.date)}</span>
                        </div>
                        <div className="text-right">
                          <span className={cx("font-semibold tnum", remaining > 0 ? "text-danger" : "text-success")}>{inr2.format(remaining)}</span>
                          <span className={cx("block text-[11px]", remaining > 0 ? "text-muted" : "text-success")}>{remaining > 0 ? "due" : "cleared"}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : statement.length === 0 ? (
              <p className="text-sm text-muted py-4 text-center">No transactions yet.</p>
            ) : (
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
            {isOwner && <p className="text-[11px] text-muted mt-1.5">Open a challan to view or print its Bill of Supply &amp; Challan.</p>}
          </div>

          {payments.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-ink">Payment history</h4>
                <span className="text-xs text-muted">{payments.length} entr{payments.length !== 1 ? "ies" : "y"}</span>
              </div>
              <ul className="rounded-xl border border-line divide-y divide-line overflow-hidden">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className={cx("grid place-items-center size-8 rounded-lg shrink-0", p.direction === "in" ? "bg-success/12 text-success" : "bg-danger/12 text-danger")}>
                      {p.direction === "in" ? <FiArrowDownLeft /> : <FiArrowUpRight />}
                    </span>
                    <div className="min-w-0 grow">
                      <span className="font-medium text-ink">{p.direction === "in" ? "Received" : "Paid"} · {p.method}</span>
                      <span className="block text-xs text-muted truncate">{formatDate(p.date)} · {p.by}{p.note ? ` · ${p.note}` : ""}</span>
                    </div>
                    <span className={cx("font-semibold tnum", p.direction === "in" ? "text-success" : "text-danger")}>{inr2.format(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Drawer>
    <Modal open={Boolean(openTx)} onClose={() => setOpenTx(null)} size="lg"
      title={openTx?.id} subtitle={openTx ? `${openTx.kind === "truck" ? "Truck sale · Bill of Supply" : openTx.type === "sale" ? "Sale invoice" : "Purchase voucher"} · ${formatDateLong(openTx.date)}` : ""}
      footer={<Button variant="ghost" onClick={() => setOpenTx(null)}>Close</Button>}>
      {openTx && <BillDetailBody tx={openTx} />}
    </Modal>
    <PaymentModal party={party} open={payOpen} onClose={() => setPayOpen(false)} />
    </>
  );
}

const PAY_METHODS = ["Cash", "Online / Bank", "UPI", "Cheque", "Other"];

function PaymentModal({ party, open, onClose }) {
  const { recordPayment, toast } = useApp();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset the form whenever a different party's modal is opened.
  useEffect(() => { if (open) { setAmount(""); setMethod("Cash"); setNote(""); } }, [open, party?.id]);

  if (!party) return null;
  const receiving = party.balanceType === "debtor"; // money IN from a debtor, else money OUT to a creditor
  const due = party.balance;
  const amt = Number(amount);
  const invalid = !Number.isFinite(amt) || amt <= 0 || amt > due;

  const submit = async () => {
    if (invalid || busy) return;
    setBusy(true);
    try {
      await recordPayment(party.id, { amount: amt, method, note: note.trim() });
      onClose();
    } catch (e) {
      toast(e.message || "Could not record the payment", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="sm"
      title={receiving ? "Receive payment" : "Record payment"}
      subtitle={`${party.name} · ${receiving ? "owes you" : "you owe"} ${inr.format(due)}`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={invalid || busy}>{busy ? "Saving…" : receiving ? "Receive" : "Pay"}</Button>
      </>}>
      <div className="space-y-3">
        <Field label={`Amount (max ${inr.format(due)})`} hint="Reduces the outstanding balance. Can't exceed the amount due.">
          <input type="number" min="0" step="0.01" inputMode="decimal" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </Field>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setAmount(String(due))}>Full amount</Button>
          {due >= 2 && <Button size="sm" variant="ghost" onClick={() => setAmount(String(Math.round(due / 2 * 100) / 100))}>Half</Button>}
        </div>
        <Field label="Method">
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Note (optional)">
          <input type="text" className="input" value={note} maxLength={240} onChange={(e) => setNote(e.target.value)} placeholder="e.g. UPI ref, cheque no., bhara for challan #…" />
        </Field>
        {amt > due && <p className="text-xs text-danger">Amount exceeds the {inr.format(due)} due.</p>}
      </div>
    </Modal>
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
