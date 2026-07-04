// Product barcode generation (CODE128) via JsBarcode, lazy-loaded.
export async function makeBarcode(value, opts = {}) {
  const JsBarcode = (await import("jsbarcode")).default;
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, String(value), {
    format: "CODE128", displayValue: true, fontSize: 16, height: 60, margin: 10,
    background: "#ffffff", lineColor: "#111111", ...opts,
  });
  return canvas.toDataURL("image/png");
}

export function downloadDataUrl(dataUrl, name) {
  const a = document.createElement("a");
  a.href = dataUrl; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
