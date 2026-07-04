// Client-side export helpers: CSV (Excel-compatible), JSON, and Print.
// CSV opens natively in Excel/Sheets; Print produces a PDF via the browser dialog.

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeCsv(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** rows: array of objects, columns: [{ key, label }] */
export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCsv(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCsv(typeof c.value === "function" ? c.value(row) : row[c.key])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

export function exportCsv(filename, rows, columns) {
  // BOM for Excel to detect UTF-8 (₹, Hindi names).
  download(`${filename}.csv`, "﻿" + toCsv(rows, columns), "text/csv;charset=utf-8;");
}

export function exportJson(filename, data) {
  download(`${filename}.json`, JSON.stringify(data, null, 2), "application/json");
}

/** Print the whole document — the print stylesheet isolates .print-root. */
export function printDocument() {
  window.print();
}

/** Open an isolated print window with arbitrary HTML (used for report print/PDF). */
export function printHtml(title, innerHtml, styles = "") {
  const w = window.open("", "_blank", "width=900,height=1200");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${title}</title>
    <meta charset="utf-8" />
    <style>
      *{box-sizing:border-box;font-family:'Inter',system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      body{margin:0;padding:28px;color:#131d18;}
      h1{font-size:20px;margin:0 0 2px;} .sub{color:#66756c;font-size:12px;margin-bottom:18px;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e6ebe3;}
      th{background:#f3f6f2;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.04em;color:#66756c;}
      tfoot td{font-weight:700;border-top:2px solid #cfd8cf;}
      .r{text-align:right;} ${styles}
    </style></head><body>${innerHtml}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 350);
}
