import { useEffect, useRef, useState } from "react";

export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try { const v = localStorage.getItem(key); return v === null ? initial : JSON.parse(v); } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / private mode */ }
  }, [key, value]);
  return [value, setValue];
}

/** theme: "light" | "dark" | "system" — applied to <html data-theme>. */
export function useTheme() {
  const [theme, setTheme] = useLocalStorage("jmd-theme", "system");
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = theme === "system" ? (mql.matches ? "dark" : "light") : theme;
      document.documentElement.setAttribute("data-theme", resolved);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0b0e11" : "#15764f");
    };
    apply();
    if (theme === "system") { mql.addEventListener("change", apply); return () => mql.removeEventListener("change", apply); }
    return undefined;
  }, [theme]);
  return [theme, setTheme];
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

export function useDebounced(value, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Global keydown handler. combos: { "mod+k": fn, "escape": fn } — mod = ctrl/cmd. */
export function useHotkeys(combos) {
  const ref = useRef(combos);
  useEffect(() => { ref.current = combos; });
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const combo = `${mod ? "mod+" : ""}${key}`;
      const fn = ref.current[combo] || ref.current[key];
      if (fn) { e.preventDefault(); fn(e); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * USB barcode scanner support. Keyboard-wedge scanners "type" the code very fast
 * and finish with Enter, so we accept only rapid character sequences ending in
 * Enter — normal human typing (with >120 ms gaps) is ignored.
 */
export function useBarcodeScanner(onScan, { minLength = 3, enabled = true } = {}) {
  const state = useRef({ buffer: "", last: 0 });
  const cb = useRef(onScan);
  useEffect(() => { cb.current = onScan; });
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      const now = performance.now();
      const s = state.current;
      if (now - s.last > 120) s.buffer = "";
      s.last = now;
      if (e.key === "Enter") {
        if (s.buffer.length >= minLength) { const code = s.buffer; s.buffer = ""; cb.current?.(code); }
        return;
      }
      if (e.key.length === 1) s.buffer += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, minLength]);
}

/** Count-up animation for KPI numbers. Returns the animated value. */
export function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(0);
  const startRef = useRef(0);
  const fromRef = useRef(0);
  useEffect(() => {
    let raf;
    fromRef.current = value;
    startRef.current = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return value;
}
