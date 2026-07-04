import { useState } from "react";
import { FiCheck, FiEdit2, FiSliders, FiTrendingUp } from "react-icons/fi";
import { useApp } from "../context/AppContext";
import { Badge, Card, PanelHeader, cx } from "../ui";
import { SERIES_COLORS, formatDateTime } from "../lib/format";

export default function Rates() {
  const { data, user, updateRate } = useApp();
  const canEdit = user.role === "admin" || user.role === "manager";

  return (
    <div className="grid lg:grid-cols-3 gap-4 max-w-[1400px] mx-auto">
      <Card className="p-5 lg:col-span-2">
        <PanelHeader title="Base rates for today" icon={FiSliders}
          subtitle="Billers can override these while billing — every override is recorded."
          action={<Badge tone={canEdit ? "success" : undefined}>{canEdit ? `${user.role} can edit` : "View only"}</Badge>} />
        <div className="space-y-2">
          {data.products.map((p, i) => <RateRow key={`${p.id}-${p.baseRate}`} product={p} color={SERIES_COLORS[i % SERIES_COLORS.length]} canEdit={canEdit} onUpdate={updateRate} />)}
        </div>
      </Card>

      <Card className="p-5">
        <PanelHeader title="Rate audit trail" subtitle="Latest changes and overrides" />
        <ul className="space-y-3">
          {data.audits.map((a) => (
            <li key={a.id} className="flex gap-3">
              <span className={cx("grid place-items-center size-8 rounded-lg shrink-0", a.kind === "override" ? "bg-warning/15 text-warning" : "bg-info/12 text-info")}>{a.kind === "override" ? <FiEdit2 className="text-sm" /> : <FiTrendingUp className="text-sm" />}</span>
              <div className="min-w-0"><p className="text-sm text-ink leading-snug">{a.text}</p><p className="text-xs text-muted mt-0.5">{a.meta} · {formatDateTime(a.date)}</p></div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function RateRow({ product, color, canEdit, onUpdate }) {
  const [rate, setRate] = useState(String(product.baseRate));
  const [saving, setSaving] = useState(false);
  const changed = Number(rate) !== product.baseRate && Number(rate) > 0;
  const submit = async () => {
    setSaving(true);
    try { await onUpdate(product.id, Number(rate)); } catch { setRate(String(product.baseRate)); } finally { setSaving(false); }
  };
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-line hover:bg-surface-2 transition-colors">
      <span className="grid place-items-center size-10 rounded-xl text-white font-bold text-xs shrink-0" style={{ background: color }}>{product.short}</span>
      <div className="min-w-0 grow"><p className="font-medium text-ink truncate">{product.name}</p><p className="text-xs text-muted">{product.hindiName || product.category}</p></div>
      <div className="flex items-center input p-0 overflow-hidden w-32 shrink-0">
        <span className="px-2.5 text-muted">₹</span>
        <input type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} disabled={!canEdit} className="grow bg-transparent outline-none h-full px-0 tnum w-full" />
        <span className="px-2 text-xs text-muted whitespace-nowrap">/kg</span>
      </div>
      <button onClick={submit} disabled={!canEdit || !changed || saving} className={cx("btn btn-sm shrink-0", changed ? "btn-primary" : "btn-ghost")}>
        {saving ? "…" : changed ? <><FiCheck />Save</> : "Set"}
      </button>
    </div>
  );
}
