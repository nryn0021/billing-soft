import { useState } from "react";
import { FiCornerUpLeft, FiDelete, FiRefreshCw } from "react-icons/fi";
import { cx } from "../ui";

const calc = (a, b, op) => (op === "+" ? a + b : op === "−" ? a - b : op === "×" ? a * b : op === "÷" ? (b === 0 ? 0 : a / b) : b);

// Kept at module scope (not defined during render) so its identity is stable.
function CalcKey({ label, onClick, className }) {
  return <button type="button" onClick={onClick} className={cx("h-10 rounded-lg font-semibold text-sm transition-colors active:scale-95", className)}>{label}</button>;
}

/** Compact POS calculator. onUse(value) inserts the current result elsewhere. */
export function Calculator({ onUse }) {
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState(null);
  const [op, setOp] = useState(null);
  const [fresh, setFresh] = useState(false);

  const digit = (d) => {
    if (d === "." && display.includes(".") && !fresh) return;
    setDisplay(fresh ? (d === "." ? "0." : d) : display === "0" && d !== "." ? d : display + d);
    setFresh(false);
  };
  const choose = (next) => {
    const v = Number(display);
    if (stored !== null && op && !fresh) { const r = calc(stored, v, op); setDisplay(String(round(r))); setStored(r); }
    else setStored(v);
    setOp(next); setFresh(true);
  };
  const equals = () => { if (stored === null || !op) return; setDisplay(String(round(calc(stored, Number(display), op)))); setStored(null); setOp(null); setFresh(true); };
  const clear = () => { setDisplay("0"); setStored(null); setOp(null); setFresh(false); };
  const back = () => setDisplay(display.length > 1 ? display.slice(0, -1) : "0");

  return (
    <div className="card-flat bg-surface-2 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-ink-2">Calculator</span>
        <button type="button" onClick={clear} className="text-muted hover:text-ink" title="Clear"><FiRefreshCw className="text-sm" /></button>
      </div>
      <div className="rounded-lg bg-surface border border-line px-3 py-2 text-right mb-2">
        <div className="text-[10px] text-muted h-3">{stored !== null ? `${round(stored)} ${op || ""}` : ""}</div>
        <div className="text-xl font-bold text-ink tnum truncate">{display}</div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <CalcKey label="AC" onClick={clear} className="bg-danger/10 text-danger" />
        <CalcKey label={<FiDelete className="mx-auto" />} onClick={back} className="bg-surface-3 text-ink-2" />
        <CalcKey label="÷" onClick={() => choose("÷")} className="bg-surface-3 text-brand" />
        <CalcKey label="×" onClick={() => choose("×")} className="bg-surface-3 text-brand" />
        {["7", "8", "9"].map((k) => <CalcKey key={k} label={k} onClick={() => digit(k)} className="bg-surface text-ink border border-line" />)}
        <CalcKey label="−" onClick={() => choose("−")} className="bg-surface-3 text-brand" />
        {["4", "5", "6"].map((k) => <CalcKey key={k} label={k} onClick={() => digit(k)} className="bg-surface text-ink border border-line" />)}
        <CalcKey label="+" onClick={() => choose("+")} className="bg-surface-3 text-brand" />
        {["1", "2", "3"].map((k) => <CalcKey key={k} label={k} onClick={() => digit(k)} className="bg-surface text-ink border border-line" />)}
        <CalcKey label="=" onClick={equals} className="row-span-2 bg-brand text-brand-ink" />
        <CalcKey label="0" onClick={() => digit("0")} className="col-span-2 bg-surface text-ink border border-line" />
        <CalcKey label="." onClick={() => digit(".")} className="bg-surface text-ink border border-line" />
      </div>
      {onUse && <button type="button" onClick={() => onUse(round(Number(display)))} className="btn btn-ghost btn-sm w-full mt-2"><FiCornerUpLeft /> Use {display} as amount paid</button>}
    </div>
  );
}

function round(n) { return Number(Number(n).toFixed(6)); }
