import { useState } from "react";
import { FiFileText, FiTrash2, FiAlertTriangle } from "react-icons/fi";
import { ReceiptActions } from "../print/ReceiptActions";
import { useApp } from "../context/AppContext";
import { inr2, num, txProductLabel } from "../lib/format";
import { Button, Modal, cx } from "../ui";

const signed = (v) => `${v < 0 ? "- " : "+ "}${inr2.format(Math.abs(v))}`;

/**
 * Full, read-only detail view of one bill — shared by the Bills page drawer and the
 * Parties-page linked-bill popup so both stay in sync. Renders the money breakdown
 * (incl. signed truck adjustments), transport/vehicle/broker meta, party GSTIN and remarks.
 *
 * `onDeleted` (optional) is called after an admin deletes the bill, so the parent drawer /
 * popup can close itself — the bill no longer exists.
 */
export function BillDetailBody({ tx, onDeleted }) {
  if (!tx) return null;
  return <BillDetail tx={tx} onDeleted={onDeleted} />;
}

function BillDetail({ tx, onDeleted }) {
  const { can, deleteBill, toast } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const canDelete = can("bills.delete");
  const m = tx.meta || {};
  const isTruck = tx.kind === "truck";

  const doDelete = async () => {
    setBusy(true);
    try {
      await deleteBill(tx.id);
      setConfirm(false);
      onDeleted?.();
    } catch (e) {
      toast(e.message || "Could not delete the bill", "danger");
    } finally { setBusy(false); }
  };

  const moneyRows = [
    ["Product", txProductLabel(tx)],
    ["Weight", `${num.format(tx.totalKg)} kg (${tx.quantity} ${tx.unit})`],
    isTruck ? ["Rate / qtl", inr2.format(tx.rate * 100)] : ["Rate / kg", inr2.format(tx.rate)],
    ["Gross amount", inr2.format(tx.gross)],
    ...(tx.cdDeduction ? [["CD deduction", `- ${inr2.format(tx.cdDeduction)}`]] : []),
    ...(tx.discount ? [["Discount", `- ${inr2.format(tx.discount)}`]] : []),
    ...(m.loadingCharge ? [["Loading charge", signed(m.loadingCharge)]] : []),
    ...(m.bharaAdv ? [["Bhara Adv", signed(m.bharaAdv)]] : []),
    ...(m.bharaLess ? [["Bhada Less", signed(m.bharaLess)]] : []),
    ["Net amount", inr2.format(tx.netAmount)],
    ["Paid", inr2.format(tx.paidAmount)],
    ["Balance due", inr2.format(tx.dueAmount)],
    ["Payment method", tx.paymentMethod],
    ["Created by", tx.createdBy],
  ];

  const transportRows = isTruck ? [
    ["Invoice / Challan", `${m.invoiceNo || tx.id} · ${m.challanNo || "—"}`],
    ["Buyer GSTIN", m.buyerGstin || tx.partyGstin || "—"],
    ["HSN · Bags", `${m.hsnCode || "—"} · ${m.bags != null ? num.format(m.bags) : "—"}`],
    ["Place of supply", m.placeOfSupply || "—"],
    ["Transporter", `${m.transportName || "—"}${m.transportMob ? ` · ${m.transportMob}` : ""}`],
    ["Vehicle", m.vehicleNo || "—"],
    ["Driver", `${m.driverName || "—"}${m.driverMob ? ` · ${m.driverMob}` : ""}`],
    ["Owner", `${m.ownerName || "—"}${m.ownerMob ? ` · ${m.ownerMob}` : ""}`],
    ["D.L. No.", m.dlNo || "—"],
    ["Broker", `${m.brokerName || "—"}${m.brokerMob ? ` · ${m.brokerMob}` : ""}`],
    ["Freight · Bhara", `${m.freight ? inr2.format(m.freight) : "—"} · ${m.bhara ? inr2.format(m.bhara) : "—"}`],
    ["Advance · To pay", `${m.advance ? inr2.format(m.advance) : "—"} · ${m.toPay ? inr2.format(m.toPay) : "—"}`],
  ] : [];

  return (
    <div className="space-y-5">
      <ReceiptActions invoice={tx} />
      <div className="flex items-center gap-3">
        <span className={cx("grid place-items-center size-11 rounded-xl text-brand-ink font-bold")}
          style={{ background: tx.type === "sale" ? "var(--sale)" : "var(--purchase)" }}><FiFileText /></span>
        <div>
          <p className="font-semibold text-ink">{tx.party}</p>
          <p className="text-xs text-muted">{tx.partyPhone}{tx.partyGstin ? ` · GSTIN ${tx.partyGstin}` : ""} · {tx.branch}</p>
        </div>
      </div>

      <div className="rounded-xl border border-line divide-y divide-line">
        {moneyRows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-4 py-2.5 text-sm"><span className="text-muted">{k}</span><span className="font-medium text-ink tnum text-right">{v}</span></div>
        ))}
      </div>

      {isTruck && (
        <div>
          <h4 className="text-sm font-semibold text-ink mb-2">Transport & document</h4>
          <div className="rounded-xl border border-line divide-y divide-line">
            {transportRows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between px-4 py-2 text-sm"><span className="text-muted">{k}</span><span className="font-medium text-ink text-right">{v}</span></div>
            ))}
          </div>
        </div>
      )}

      {tx.remarks && <p className="text-xs text-ink-2 bg-surface-2 border border-line rounded-xl px-3 py-2.5">Remarks: {tx.remarks}</p>}
      {tx.partyAddress && <p className="text-xs text-muted">Address: {tx.partyAddress}</p>}

      {/* Admin-only: permanently delete this bill (reverses stock + all ledger entries). */}
      {canDelete && (
        <div className="pt-1">
          <Button variant="ghost" size="sm" icon={FiTrash2} onClick={() => setConfirm(true)}
            className="text-danger hover:bg-danger/10">Delete this bill</Button>
        </div>
      )}

      <Modal open={confirm} onClose={() => !busy && setConfirm(false)} size="sm"
        title="Delete bill?" subtitle={`${tx.id} · ${inr2.format(tx.netAmount)}`}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>Cancel</Button>
          <Button variant="danger" icon={FiTrash2} onClick={doDelete} disabled={busy}>{busy ? "Deleting…" : "Delete permanently"}</Button>
        </>}>
        <div className="flex items-start gap-3">
          <span className="grid place-items-center size-10 rounded-xl bg-danger/15 text-danger shrink-0"><FiAlertTriangle /></span>
          <p className="text-sm text-ink-2">
            This permanently removes bill <b>{tx.id}</b>. Stock is restored, and the party's due{isTruck ? " and the truck-owner's freight payable are" : " is"} reversed. This cannot be undone.
          </p>
        </div>
      </Modal>
    </div>
  );
}
