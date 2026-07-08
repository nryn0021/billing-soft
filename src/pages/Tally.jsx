import { useRef, useState } from "react";
import { FiDatabase, FiDownload, FiUpload, FiUsers, FiFileText, FiCheckCircle, FiAlertTriangle } from "react-icons/fi";
import { useApp } from "../context/AppContext";
import { Button, Card, PanelHeader } from "../ui";
import { buildTallyXml, downloadTallyXml } from "../lib/tally";

export default function Tally() {
  const { data, can, importTally, toast } = useApp();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState("");
  const [summary, setSummary] = useState(null);

  const parties = data.parties || [];
  const bills = data.transactions || [];
  const canImport = can("tally.import");

  const stamp = () => new Date().toISOString().slice(0, 10);

  const doExport = (masters, vouchers, label) => {
    setBusy(label);
    try {
      const xml = buildTallyXml(parties, bills, { masters, vouchers });
      downloadTallyXml(`tally_${label}_${stamp()}`, xml);
      toast("Tally XML downloaded", "success");
    } catch (e) {
      toast(e.message || "Export failed", "danger");
    } finally { setBusy(""); }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setBusy("import"); setSummary(null);
    try {
      const xml = await file.text();
      const result = await importTally(xml);
      setSummary(result);
    } catch (err) {
      toast(err.message || "Import failed", "danger");
    } finally { setBusy(""); }
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Export */}
      <Card className="p-5">
        <PanelHeader icon={FiDownload} title="Export to Tally"
          subtitle="Download your book as a Tally-importable XML (ENVELOPE / Import Data)." />
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <ExportTile icon={FiUsers} title="Parties" count={`${parties.length} ledgers`}
            hint="Sundry Debtors / Creditors with balances" disabled={!!busy}
            onClick={() => doExport(true, false, "parties")} />
          <ExportTile icon={FiFileText} title="Bills" count={`${bills.length} vouchers`}
            hint="Sales & Purchase vouchers" disabled={!!busy}
            onClick={() => doExport(false, true, "bills")} />
          <ExportTile icon={FiDatabase} title="Everything" count="Masters + vouchers"
            hint="One combined Tally file" primary disabled={!!busy}
            onClick={() => doExport(true, true, "full")} />
        </div>
        <p className="text-[11px] text-muted mt-3">
          In Tally: <b>Gateway of Tally → Import Data → Masters / Vouchers</b>, then pick the downloaded XML.
        </p>
      </Card>

      {/* Import */}
      <Card className="p-5">
        <PanelHeader icon={FiUpload} title="Import from Tally"
          subtitle="Upload a Tally masters XML export to bring your existing parties in." />
        {!canImport ? (
          <p className="text-sm text-muted mt-4">You don't have permission to import Tally data.</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={onFile} />
              <Button variant="primary" icon={FiUpload} disabled={busy === "import"} onClick={() => fileRef.current?.click()}>
                {busy === "import" ? "Importing…" : "Choose Tally XML"}
              </Button>
              <p className="text-xs text-muted">
                Party ledgers (Sundry Debtors / Creditors) and their opening balances are imported and de-duplicated by phone / name.
              </p>
            </div>
            {summary && (
              <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink"><FiCheckCircle className="text-success" /> Import complete</p>
                <div className="grid grid-cols-3 gap-3 mt-3 text-center">
                  <Stat label="Added" value={summary.created} tone="text-success" />
                  <Stat label="Updated" value={summary.updated} tone="text-info" />
                  <Stat label="Skipped" value={summary.skipped} tone="text-muted" />
                </div>
              </div>
            )}
            <p className="flex items-start gap-1.5 text-[11px] text-muted mt-3">
              <FiAlertTriangle className="mt-0.5 shrink-0" />
              Bills/vouchers are not imported (a grain bill needs product, weight & stock that a Tally voucher doesn't carry) — only parties and their dues. Your bills still export OUT to Tally in full.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

function ExportTile({ icon: Icon, title, count, hint, onClick, disabled, primary }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`text-left rounded-xl border p-4 transition-colors disabled:opacity-50 ${primary ? "border-brand/40 bg-brand/5 hover:bg-brand/10" : "border-line hover:bg-surface-2"}`}>
      <Icon className={`text-xl ${primary ? "text-brand" : "text-ink-2"}`} />
      <p className="mt-2 text-sm font-semibold text-ink">{title}</p>
      <p className="text-xs text-ink-2">{count}</p>
      <p className="text-[11px] text-muted mt-1">{hint}</p>
    </button>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <p className={`text-2xl font-bold tnum ${tone}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}
