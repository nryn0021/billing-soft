// Per-document print preferences — which elements (QR, signature, stamp, terms, bank block,
// remarks) appear on each document type, plus per-document terms/footer text overrides.
// The admin controls these from Settings → Documents; the defaults live in server/settings.js
// (`documents`). Every element defaults ON when unset, so nothing disappears for a tenant whose
// stored settings predate this feature.

// Map a print `format` to its `documents` key.
//   "thermal" → thermal · "gst" → Bill of Supply · "challan" → Challan · else → A4.
// The combined "challan+gst" job maps to "gst" only for gating QR *generation*; each sheet then
// re-checks its own key ("gst" / "challan") when it decides whether to render the QR image.
export function docKeyForFormat(format) {
  if (format === "thermal") return "thermal";
  if (format === "gst") return "gst";
  if (format === "challan") return "challan";
  if (format === "challan+gst") return "gst";
  return "a4";
}

// Is `element` (qr|signature|stamp|terms|bank|remarks) enabled for this document? Missing
// document/element → true (default-on), so older settings blobs keep the full layout.
export function docPref(settings, docKey, element) {
  const d = settings?.documents?.[docKey];
  if (!d || d[element] === undefined) return true;
  return d[element] !== false;
}

// Per-document terms/footer text override. `which` is "terms" or "footer". Empty/blank →
// fall back to the shared Invoice-tab value passed as `fallback`.
export function docText(settings, docKey, which, fallback) {
  const key = which === "terms" ? "termsText" : "footerText";
  const v = settings?.documents?.[docKey]?.[key];
  return v && String(v).trim() ? v : fallback;
}
