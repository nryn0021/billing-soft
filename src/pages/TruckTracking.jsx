import { useMemo, useState } from "react";
import { FiMapPin, FiTruck, FiChevronDown, FiChevronRight, FiCheckCircle } from "react-icons/fi";
import { useApp } from "../context/AppContext";
import { Card, Modal, Toggle, EmptyState, Badge, cx } from "../ui";
import { BillDetailBody } from "../billing/BillDetailBody";
import { inr, formatDateTime } from "../lib/format";

// Ordered dispatch lifecycle. Each state carries a label, a swatch class for the badge/pill and
// the button colour used on the tracking board. COMPLETE is green; problems (STUCK) are red.
const STATES = [
  { key: "dispatched", label: "Dispatched", cls: "bg-info/15 text-info border-info/30", dot: "bg-info" },
  { key: "on_the_way", label: "On the way", cls: "bg-brand/15 text-brand border-brand/30", dot: "bg-brand" },
  { key: "reached", label: "Reached", cls: "bg-accent/15 text-accent border-accent/30", dot: "bg-accent" },
  { key: "stuck", label: "Stuck", cls: "bg-danger/15 text-danger border-danger/30", dot: "bg-danger" },
  { key: "empty", label: "Truck empty", cls: "bg-warning/15 text-warning border-warning/30", dot: "bg-warning" },
  { key: "complete", label: "Complete", cls: "bg-success/15 text-success border-success/40", dot: "bg-success" },
];
const STATE_MAP = Object.fromEntries(STATES.map((s) => [s.key, s]));

export default function TruckTracking() {
  const { data, can } = useApp();
  const canUpdate = can("tracking.update");
  const [popup, setPopup] = useState(null);

  // All truck-kind bills, grouped by destination (place of supply).
  const groups = useMemo(() => {
    const trucks = (data.transactions || []).filter((t) => t.kind === "truck");
    const byDest = new Map();
    for (const t of trucks) {
      const dest = (t.meta?.placeOfSupply || "").trim() || "Unspecified destination";
      if (!byDest.has(dest)) byDest.set(dest, []);
      byDest.get(dest).push(t);
    }
    // Destinations with the most active (non-complete) trucks float to the top.
    return [...byDest.entries()]
      .map(([dest, list]) => ({
        dest, list,
        active: list.filter((t) => (t.meta?.tracking?.status || "dispatched") !== "complete").length,
      }))
      .sort((a, b) => b.active - a.active || b.list.length - a.list.length);
  }, [data.transactions]);

  const totalTrucks = groups.reduce((s, g) => s + g.list.length, 0);

  if (!totalTrucks) {
    return <EmptyState icon={FiTruck} title="No truck bills yet" message="Truck sale bills appear here automatically as dispatched, grouped by destination." />;
  }

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap gap-2">
        {STATES.map((s) => (
          <span key={s.key} className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", s.cls)}>
            <span className={cx("size-2 rounded-full", s.dot)} />{s.label}
          </span>
        ))}
      </div>

      {groups.map((g) => (
        <DestinationGroup key={g.dest} group={g} canUpdate={canUpdate} onOpen={setPopup} />
      ))}

      <Modal open={Boolean(popup)} onClose={() => setPopup(null)} size="lg"
        title={popup ? `Truck ${popup.meta?.vehicleNo || popup.id}` : ""}
        subtitle={popup ? `${popup.meta?.placeOfSupply || "—"} · Challan ${popup.meta?.challanNo || "—"}` : ""}>
        {popup && <BillDetailBody tx={popup} />}
      </Modal>
    </div>
  );
}

function DestinationGroup({ group, canUpdate, onOpen }) {
  const [open, setOpen] = useState(true);
  const { dest, list, active } = group;
  return (
    <Card className="overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-line hover:bg-surface-2 transition-colors">
        {open ? <FiChevronDown className="text-muted" /> : <FiChevronRight className="text-muted" />}
        <FiMapPin className="text-brand" />
        <span className="font-semibold text-ink">{dest}</span>
        <Badge className="ml-1">{list.length} truck{list.length !== 1 ? "s" : ""}</Badge>
        {active > 0 && <span className="text-xs text-muted">{active} active</span>}
      </button>
      {open && (
        <div className="divide-y divide-line">
          {list.map((tx) => <TruckRow key={tx.id} tx={tx} canUpdate={canUpdate} onOpen={onOpen} />)}
        </div>
      )}
    </Card>
  );
}

function TruckRow({ tx, canUpdate, onOpen }) {
  const { updateTracking, toast } = useApp();
  const tracking = tx.meta?.tracking || { status: "dispatched", driverPaid: false };
  const status = tracking.status || "dispatched";
  const s = STATE_MAP[status] || STATE_MAP.dispatched;
  const [place, setPlace] = useState(tracking.place || "");
  const [busy, setBusy] = useState(false);
  const toPay = Number(tx.meta?.toPay || 0);
  const showDriverPaid = status === "empty" || status === "complete";

  const push = async (patch) => {
    setBusy(true);
    try {
      await updateTracking(tx.id, {
        status: patch.status ?? status,
        place: patch.place ?? place,
        note: patch.note ?? tracking.note ?? "",
        driverPaid: patch.driverPaid ?? Boolean(tracking.driverPaid),
      });
    } catch (e) {
      toast(e.message || "Could not update status", "danger");
    } finally { setBusy(false); }
  };

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Clicking the truck number opens the full linked bill + challan detail. */}
        <button onClick={() => onOpen(tx)} className="inline-flex items-center gap-2 font-semibold text-ink hover:text-brand transition-colors">
          <span className={cx("grid place-items-center size-9 rounded-xl", s.cls)}><FiTruck /></span>
          <span className="tnum">{tx.meta?.vehicleNo || tx.id}</span>
        </button>
        <div className="min-w-0">
          <p className="text-sm text-ink truncate">{tx.party}</p>
          <p className="text-xs text-muted truncate">
            {tx.meta?.driverName ? `${tx.meta.driverName}${tx.meta.driverMob ? " · " + tx.meta.driverMob : ""}` : tx.id}
          </p>
        </div>
        <span className={cx("ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", s.cls)}>
          <span className={cx("size-2 rounded-full", s.dot)} />{s.label}
        </span>
        {toPay > 0 && (
          <span className={cx("text-xs font-medium tnum", tracking.driverPaid ? "text-success line-through" : "text-warning")}>
            To-pay {inr.format(toPay)}
          </span>
        )}
      </div>

      {tracking.place && status !== "complete" && (
        <p className="text-xs text-muted mt-1.5 ml-11">Last known: {tracking.place} · {tracking.updatedAt ? formatDateTime(tracking.updatedAt) : ""}</p>
      )}

      {canUpdate && (
        <div className="mt-3 ml-11 space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {STATES.map((opt) => (
              <button key={opt.key} disabled={busy} onClick={() => push({ status: opt.key })}
                className={cx("rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                  status === opt.key ? opt.cls : "border-line text-ink-2 hover:bg-surface-2")}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Optional place note — most relevant while on the way; not mandatory. */}
          {(status === "on_the_way" || status === "stuck") && (
            <div className="flex items-center gap-2">
              <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Add a place / note (optional)…"
                className="input h-9 max-w-xs text-sm" />
              <button disabled={busy} onClick={() => push({ place })} className="btn btn-ghost btn-sm">Save note</button>
            </div>
          )}

          {/* Once empty/complete, the challan's remaining To-Pay can be marked settled with the driver. */}
          {showDriverPaid && toPay > 0 && (
            <Toggle checked={Boolean(tracking.driverPaid)} disabled={busy}
              onChange={(v) => push({ driverPaid: v })}
              label={`Driver paid the remaining To-Pay (${inr.format(toPay)})`}
              hint="Clears the freight payable to the truck owner in the ledger." />
          )}

          {status === "complete" && (
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-success"><FiCheckCircle /> Trip complete</p>
          )}
        </div>
      )}
    </div>
  );
}
