import { useEffect, useMemo, useState } from "react";
import { FiDownload, FiSearch, FiShield } from "react-icons/fi";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { Badge, Card, EmptyState, Segmented, SkeletonRows, cx } from "../ui";
import { exportCsv } from "../lib/export";
import { formatDateTime } from "../lib/format";
import { useDebounced } from "../lib/hooks";

const KIND_TONE = { security: "danger", override: "warning", "base-rate": "info", inventory: "info", bill: "success", settings: "warning" };
const FILTERS = [
  { value: "all", label: "All" }, { value: "bill", label: "Bills" }, { value: "inventory", label: "Inventory" },
  { value: "override", label: "Overrides" }, { value: "security", label: "Security" }, { value: "settings", label: "Settings" },
];

export default function Audit() {
  const { toast } = useApp();
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const q = useDebounced(query);

  useEffect(() => { api.audit().then((r) => setRows(r.audit)).catch((e) => toast(e.message, "danger")); }, [toast]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => filter === "all" || r.kind === filter || r.action === filter)
      .filter((r) => !term || [r.text, r.actor, r.entityId, r.ip].some((v) => String(v).toLowerCase().includes(term)));
  }, [rows, filter, q]);

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        <div className="relative grow min-w-[200px] max-w-md">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search action, user, record or IP…" className="input pl-9" />
        </div>
        <button className="btn btn-ghost btn-sm ml-auto" onClick={() => exportCsv(`audit-${Date.now()}`, visible, [
          { label: "Date", value: (r) => formatDateTime(r.date) }, { key: "action", label: "Action" }, { key: "entity", label: "Entity" },
          { key: "entityId", label: "Record" }, { key: "text", label: "Description" }, { key: "oldValue", label: "Old" }, { key: "newValue", label: "New" },
          { key: "actor", label: "User" }, { key: "ip", label: "IP" }, { key: "device", label: "Device" },
        ])}><FiDownload />Export</button>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-3.5 border-b border-line flex items-center gap-2">
          <FiShield className="text-brand" /><p className="text-sm font-semibold text-ink">Audit trail</p>
          <span className="text-xs text-muted ml-auto">{visible.length} events</span>
        </div>
        {!rows ? <div className="p-5"><SkeletonRows rows={8} /></div> : visible.length === 0 ? (
          <EmptyState icon={FiShield} title="No matching events" message="Every change is recorded here with user, before/after values, time, IP and device." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead><tr className="text-left text-xs text-muted border-b border-line">
                {["When", "Action", "Record", "Change", "User", "Device / IP"].map((h) => <th key={h} className="font-medium px-4 py-2.5">{h}</th>)}
              </tr></thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="row-hover border-b border-line align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-ink-2">{formatDateTime(r.date)}</td>
                    <td className="px-4 py-3"><Badge tone={KIND_TONE[r.kind]} className="capitalize">{r.action || r.kind}</Badge><span className="block text-ink mt-1 max-w-xs">{r.text}</span></td>
                    <td className="px-4 py-3 text-ink-2">{r.entity ? <><span className="capitalize">{r.entity}</span>{r.entityId ? <span className="block text-xs text-muted">{r.entityId}</span> : null}</> : "—"}</td>
                    <td className="px-4 py-3 text-xs">{r.oldValue || r.newValue ? <span className={cx(r.oldValue && "line-through text-muted")}>{r.oldValue}</span> : "—"}{r.newValue && <span className="text-ink"> → {r.newValue}</span>}</td>
                    <td className="px-4 py-3 text-ink-2 whitespace-nowrap">{r.actor}</td>
                    <td className="px-4 py-3 text-xs text-muted">{r.ip || "—"}<span className="block truncate max-w-[180px]">{r.device}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
