import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FiX, FiInbox, FiCheckCircle, FiAlertTriangle, FiInfo, FiMonitor, FiMoon, FiSun, FiArrowUpRight, FiTrendingUp, FiTrendingDown } from "react-icons/fi";
import { useApp } from "./context/AppContext";
import { num } from "./lib/format";
import { useCountUp } from "./lib/hooks";

export const cx = (...parts) => parts.filter(Boolean).join(" ");

/* --------------------------------- layout --------------------------------- */
export function Card({ className, children, as: As = "section", ...rest }) {
  return <As className={cx("card", className)} {...rest}>{children}</As>;
}

export function PanelHeader({ title, subtitle, action, icon: Icon }) {
  return (
    <header className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && <span className="grid place-items-center size-9 rounded-xl bg-surface-3 text-brand shrink-0"><Icon /></span>}
        <div className="min-w-0">
          <h3 className="text-[0.95rem] font-semibold text-ink truncate">{title}</h3>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
  );
}

/* --------------------------------- button --------------------------------- */
export function Button({ variant = "ghost", size, icon: Icon, iconRight: R, children, className, ...rest }) {
  return (
    <button className={cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", !children && "btn-icon", className)} {...rest}>
      {Icon && <Icon className="text-[1.05em]" />}
      {children}
      {R && <R className="text-[1.05em]" />}
    </button>
  );
}

export function IconButton({ icon: Icon, className, label, ...rest }) {
  return <button aria-label={label} className={cx("btn btn-ghost btn-icon", className)} {...rest}><Icon /></button>;
}

/* --------------------------------- badges --------------------------------- */
export function Badge({ tone, children, icon: Icon, className }) {
  return <span className={cx("badge", tone && `badge-${tone}`, className)}>{Icon && <Icon />}{children}</span>;
}

export function StatusDot({ tone = "success", label }) {
  const color = { success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)", info: "var(--info)" }[tone];
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2"><span className="size-2 rounded-full" style={{ background: color, boxShadow: `0 0 0 3px color-mix(in oklab, ${color} 22%, transparent)` }} />{label}</span>;
}

/* -------------------------------- segmented ------------------------------- */
export function Segmented({ options, value, onChange, size }) {
  return (
    <div className={cx("inline-flex items-center gap-1 rounded-xl bg-surface-2 border border-line p-1", size === "sm" && "text-sm")}>
      {options.map((opt) => {
        const v = opt.value ?? opt;
        const label = opt.label ?? opt;
        const active = v === value;
        return (
          <button key={v} onClick={() => onChange(v)} className="relative px-3 py-1.5 rounded-lg text-[0.8rem] font-semibold transition-colors">
            {active && <motion.span layoutId={`seg-${options.map((o) => o.value ?? o).join("")}`} className="absolute inset-0 rounded-lg bg-surface shadow-soft border border-line" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            <span className={cx("relative z-10", active ? "text-ink" : "text-muted hover:text-ink-2")}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------- field --------------------------------- */
export function Field({ label, hint, error, className, children, wide }) {
  return (
    <label className={cx("block", wide && "sm:col-span-2", className)}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {error ? <span className="block text-xs text-danger mt-1">{error}</span> : hint ? <span className="block text-xs text-muted mt-1">{hint}</span> : null}
    </label>
  );
}

export function Avatar({ name, className, style }) {
  const initials = String(name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return <span className={cx("grid place-items-center rounded-xl bg-brand/10 text-brand font-bold text-[0.72rem] shrink-0", className)} style={{ background: "color-mix(in oklab, var(--brand) 14%, var(--surface))", ...style }}>{initials}</span>;
}

/* ------------------------------- skeletons -------------------------------- */
export function Skeleton({ className }) { return <div className={cx("skeleton", className)} />; }
export function SkeletonRows({ rows = 5 }) {
  return <div className="space-y-2">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>;
}

export function EmptyState({ icon: Icon = FiInbox, title, message, action, className }) {
  return (
    <div className={cx("flex flex-col items-center justify-center text-center py-14 px-6", className)}>
      <span className="grid place-items-center size-14 rounded-2xl bg-surface-3 text-muted mb-4"><Icon className="text-2xl" /></span>
      <h4 className="font-semibold text-ink">{title}</h4>
      {message && <p className="text-sm text-muted mt-1 max-w-sm">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------ overlays ---------------------------------- */
function Overlay({ onClose, children, align = "center" }) {
  return createPortal(
    <div className={cx("fixed inset-0 z-[100] flex p-0 sm:p-4", align === "right" ? "justify-end" : "items-center justify-center")}>
      <motion.button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      {children}
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }) {
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <AnimatePresence>
      {open && (
        <Overlay onClose={onClose}>
          <motion.div role="dialog" aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            className={cx("relative z-10 w-full card overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh] rounded-t-3xl sm:rounded-3xl self-end sm:self-auto", width)}>
            {(title || onClose) && (
              <header className="flex items-start justify-between gap-4 p-5 border-b border-line">
                <div><h3 className="text-lg font-semibold text-ink">{title}</h3>{subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}</div>
                <IconButton icon={FiX} label="Close" onClick={onClose} />
              </header>
            )}
            <div className="overflow-y-auto p-5 grow">{children}</div>
            {footer && <footer className="flex items-center justify-end gap-2 p-4 border-t border-line bg-surface-2">{footer}</footer>}
          </motion.div>
        </Overlay>
      )}
    </AnimatePresence>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = "max-w-md" }) {
  return (
    <AnimatePresence>
      {open && (
        <Overlay onClose={onClose} align="right">
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 360, damping: 38 }}
            className={cx("relative z-10 w-full h-full bg-surface border-l border-line flex flex-col", width)}>
            <header className="flex items-start justify-between gap-4 p-5 border-b border-line">
              <div><h3 className="text-lg font-semibold text-ink">{title}</h3>{subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}</div>
              <IconButton icon={FiX} label="Close" onClick={onClose} />
            </header>
            <div className="overflow-y-auto p-5 grow">{children}</div>
            {footer && <footer className="flex items-center justify-end gap-2 p-4 border-t border-line bg-surface-2">{footer}</footer>}
          </motion.aside>
        </Overlay>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------- toaster --------------------------------- */
const TOAST_ICON = { success: FiCheckCircle, danger: FiAlertTriangle, warning: FiAlertTriangle, info: FiInfo, default: FiInfo };
export function Toaster() {
  const { toasts, dismissToast } = useApp();
  return createPortal(
    <div className="fixed z-[200] bottom-4 right-4 left-4 sm:left-auto flex flex-col items-center sm:items-end gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = TOAST_ICON[t.tone] || FiInfo;
          const tone = { success: "var(--success)", danger: "var(--danger)", warning: "var(--warning)", info: "var(--info)", default: "var(--brand)" }[t.tone];
          return (
            <motion.button key={t.id} onClick={() => dismissToast(t.id)}
              initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="pointer-events-auto glass rounded-xl shadow-pop px-4 py-3 flex items-center gap-3 text-sm font-medium text-ink w-full sm:w-auto sm:min-w-[16rem] max-w-sm text-left">
              <Icon style={{ color: tone }} className="shrink-0 text-lg" />{t.message}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

const TONE_COLOR = { brand: "var(--brand)", sale: "var(--sale)", purchase: "var(--purchase)", info: "var(--info)", success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)", accent: "var(--accent)" };

export function KpiCard({ label, value, format, icon: Icon, tone = "brand", delta, deltaUp, subtitle, spark, onClick }) {
  const isNumber = typeof value === "number" && typeof format === "function";
  const animated = useCountUp(isNumber ? value : 0);
  const color = TONE_COLOR[tone] || tone;
  const Delta = deltaUp ? FiTrendingUp : FiTrendingDown;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
      className={cx("card p-4 sm:p-5 relative group", onClick && "cursor-pointer hover:-translate-y-0.5 transition-transform")}
      onClick={onClick}>
      <div className="flex items-start justify-between">
        <span className="grid place-items-center size-10 rounded-xl" style={{ background: `color-mix(in oklab, ${color} 15%, var(--surface))`, color }}><Icon className="text-lg" /></span>
        {onClick && <FiArrowUpRight className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
      <p className="text-xs text-ink-2 mt-3.5 font-medium">{label}</p>
      <div className="flex items-end justify-between gap-2 mt-1">
        <strong className="text-2xl font-bold text-ink tracking-tight tnum">{isNumber ? format(animated) : value}</strong>
        {spark && <div className="mb-1 opacity-80"><Sparkline data={spark} color={color} width={72} height={26} /></div>}
      </div>
      <div className="flex items-center gap-2 mt-1.5 text-xs">
        {delta && <span className={cx("inline-flex items-center gap-0.5 font-semibold", deltaUp ? "text-success" : "text-danger")}><Delta className="text-[0.9em]" />{delta}</span>}
        {subtitle && <span className="text-muted truncate">{subtitle}</span>}
      </div>
    </motion.div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={cx("flex items-center justify-between gap-3 py-1.5", disabled && "opacity-60")}>
      {(label || hint) && <span className="min-w-0"><span className="block text-sm text-ink">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>}
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => !disabled && onChange(!checked)}
        className={cx("relative shrink-0 w-10 h-6 rounded-full transition-colors", checked ? "bg-brand" : "bg-surface-3 border border-line")}>
        <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 35 }}
          className="absolute top-0.5 size-5 rounded-full bg-white shadow-soft" style={{ left: checked ? "1.15rem" : "0.15rem" }} />
      </button>
    </label>
  );
}

export function ProgressBar({ value, max = 100, color = "var(--brand)", className }) {
  const pct = Math.max(2, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className={cx("h-1.5 rounded-full bg-surface-3 overflow-hidden", className)}>
      <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} />
    </div>
  );
}

/* ------------------------------ theme toggle ------------------------------ */
export function ThemeToggle() {
  const { theme, setTheme } = useApp();
  const opts = [{ value: "light", icon: FiSun }, { value: "system", icon: FiMonitor }, { value: "dark", icon: FiMoon }];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-surface-2 border border-line p-0.5">
      {opts.map(({ value, icon: Icon }) => (
        <button key={value} onClick={() => setTheme(value)} aria-label={`${value} theme`}
          className={cx("size-7 grid place-items-center rounded-md transition-colors", theme === value ? "bg-surface text-brand shadow-soft" : "text-muted hover:text-ink")}>
          <Icon className="text-sm" />
        </button>
      ))}
    </div>
  );
}

/* ================================ CHARTS ================================== */
function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver((entries) => { const r = entries[0].contentRect; setSize({ width: r.width, height: r.height }); });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

const EASE = [0.16, 1, 0.3, 1];

/** Grouped bar chart: sale vs purchase per period. */
export function GroupedBars({ data, height = 240, format = (v) => num.format(v) }) {
  const [ref, { width }] = useSize();
  const [hover, setHover] = useState(null);
  const padX = 10, padTop = 18, padBottom = 26;
  const max = Math.max(1, ...data.flatMap((d) => [d.sale, d.purchase]));
  const plotH = height - padTop - padBottom;
  const groupW = width ? (width - padX * 2) / data.length : 0;
  const barW = Math.min(16, Math.max(6, groupW / 3.2));
  const gap = 3;
  const y = (v) => padTop + plotH - (v / max) * plotH;
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="overflow-visible">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={padX} x2={width - padX} y1={padTop + plotH * f} y2={padTop + plotH * f} stroke="var(--line)" strokeWidth="1" strokeDasharray={f === 1 ? "0" : "3 5"} />
          ))}
          {data.map((d, i) => {
            const gx = padX + i * groupW + groupW / 2;
            const active = hover === i;
            return (
              <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={padX + i * groupW} y={padTop} width={groupW} height={plotH} fill={active ? "color-mix(in oklab, var(--surface-3) 60%, transparent)" : "transparent"} rx="6" />
                {[["sale", "var(--sale)", -1], ["purchase", "var(--purchase)", 1]].map(([k, color, dir]) => {
                  const val = d[k];
                  const h = (val / max) * plotH;
                  const x = gx + dir * (gap / 2) + (dir < 0 ? -barW : 0);
                  return <motion.rect key={k} x={x} width={barW} rx="4" fill={color}
                    initial={{ height: 0, y: padTop + plotH }} animate={{ height: Math.max(val > 0 ? 2 : 0, h), y: y(val) }} transition={{ duration: 0.7, ease: EASE, delay: i * 0.02 }} />;
                })}
                <text x={gx} y={height - 8} textAnchor="middle" className="fill-muted" style={{ fontSize: 10 }}>{d.short || d.label}</text>
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && (
        <div className="absolute -translate-x-1/2 -top-1 pointer-events-none glass rounded-lg shadow-pop px-3 py-2 text-xs z-10" style={{ left: padX + hover * groupW + groupW / 2 }}>
          <div className="font-semibold text-ink mb-1">{data[hover].label}</div>
          <div className="flex items-center gap-2 text-ink-2"><span className="size-2 rounded-full" style={{ background: "var(--sale)" }} />Sales <b className="ml-auto text-ink tnum">{format(data[hover].sale)}</b></div>
          <div className="flex items-center gap-2 text-ink-2 mt-0.5"><span className="size-2 rounded-full" style={{ background: "var(--purchase)" }} />Purchases <b className="ml-auto text-ink tnum">{format(data[hover].purchase)}</b></div>
        </div>
      )}
    </div>
  );
}

/** Smooth area trend for a single series. */
export function TrendArea({ data, valueKey = "value", height = 120, color = "var(--brand)", format = (v) => num.format(v) }) {
  const [ref, { width }] = useSize();
  const [hover, setHover] = useState(null);
  const pad = 6;
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  const min = Math.min(0, ...data.map((d) => d[valueKey]));
  const plotH = height - pad * 2;
  const stepX = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;
  const x = (i) => pad + i * stepX;
  const y = (v) => pad + plotH - ((v - min) / (max - min || 1)) * plotH;
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d[valueKey])}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${height - pad} L${x(0)},${height - pad} Z`;
  const gid = `grad-${valueKey}-${data.length}`;
  return (
    <div ref={ref} className="relative w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(data.length - 1, Math.round((e.clientX - r.left - pad) / (stepX || 1))))); }}>
          <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
          <motion.path d={area} fill={`url(#${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} />
          <motion.path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: EASE }} />
          {hover != null && <>
            <line x1={x(hover)} x2={x(hover)} y1={pad} y2={height - pad} stroke="var(--line)" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(data[hover][valueKey])} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />
          </>}
        </svg>
      )}
      {hover != null && (
        <div className="absolute -translate-x-1/2 -top-2 pointer-events-none glass rounded-lg shadow-pop px-2.5 py-1.5 text-xs z-10" style={{ left: x(hover) }}>
          <div className="text-muted">{data[hover].label}</div><div className="font-semibold text-ink tnum">{format(data[hover][valueKey])}</div>
        </div>
      )}
    </div>
  );
}

export function Sparkline({ data, color = "var(--brand)", width = 96, height = 30 }) {
  if (!data?.length) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const stepX = width / (data.length - 1 || 1);
  const y = (v) => height - 2 - ((v - min) / (max - min || 1)) * (height - 4);
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${i * stepX},${y(v)}`).join(" ");
  return <svg width={width} height={height} className="overflow-visible"><motion.path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: EASE }} /></svg>;
}

/** Donut with a surface gap between segments. */
export function Donut({ data, size = 168, thickness = 22, centerLabel, centerValue }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const lens = data.map((d) => (d.value / total) * circ);
  const offsets = lens.map((_, i) => lens.slice(0, i).reduce((s, l) => s + l, 0));
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
          {data.map((d, i) => (
            <motion.circle key={d.id ?? i} cx={c} cy={c} r={r} fill="none" stroke={d.color} strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, lens[i] - 3)} ${circ - Math.max(0, lens[i] - 3)}`} strokeDashoffset={-offsets[i]} strokeLinecap="butt"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 * i }} />
          ))}
        </svg>
        {(centerValue || centerLabel) && (
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>{centerValue && <div className="text-xl font-bold text-ink leading-none">{centerValue}</div>}{centerLabel && <div className="text-[10px] text-muted mt-1">{centerLabel}</div>}</div>
          </div>
        )}
      </div>
      <ul className="space-y-1.5 min-w-0 grow">
        {data.map((d, i) => (
          <li key={d.id ?? i} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-ink-2 truncate">{d.label}</span>
            <span className="ml-auto font-semibold text-ink tnum">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ranked horizontal bars (top products, breakdowns). */
export function BarList({ data, format = (v) => num.format(v) }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={d.id ?? i}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="flex items-center gap-2 min-w-0 text-ink"><span className="text-muted tnum w-4 shrink-0">{i + 1}</span><span className="truncate">{d.label}</span></span>
            <span className="font-semibold text-ink tnum ml-2 shrink-0">{format(d.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <motion.div className="h-full rounded-full" style={{ background: d.color || "var(--brand)" }} initial={{ width: 0 }} animate={{ width: `${(d.value / max) * 100}%` }} transition={{ duration: 0.7, ease: EASE, delay: i * 0.04 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Deterministic faux-QR placeholder (swap for a real QR image later). */
export function QrPlaceholder({ size = 96, seed = "JMD-PAY", color = "var(--ink)", bg = "var(--surface)" }) {
  const cells = 21;
  const rng = (n) => { let h = 2166136261; const s = seed + n; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100 / 100; };
  const cell = size / cells;
  const isFinder = (x, y) => (x < 7 && y < 7) || (x >= cells - 7 && y < 7) || (x < 7 && y >= cells - 7);
  const squares = [];
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    if (isFinder(x, y)) continue;
    if (rng(x * cells + y) > 0.55) squares.push(<rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} rx={cell * 0.2} fill={color} />);
  }
  const finder = (fx, fy) => (
    <g key={`f-${fx}-${fy}`} transform={`translate(${fx * cell} ${fy * cell})`}>
      <rect width={cell * 7} height={cell * 7} rx={cell} fill="none" stroke={color} strokeWidth={cell} />
      <rect x={cell * 2} y={cell * 2} width={cell * 3} height={cell * 3} rx={cell * 0.6} fill={color} />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded-lg" role="img" aria-label="Payment QR placeholder">
      <rect width={size} height={size} fill={bg} />
      {squares}
      {[finder(0, 0), finder(cells - 7, 0), finder(0, cells - 7)]}
    </svg>
  );
}
