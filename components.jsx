/* ============================================================
   Dental Clinic — shared UI components
   Loaded as a Babel <script> in both original.html and
   redesign.html, before each page's app script. Defines the
   reusable presentation primitives (icons, Slider, Card, Chip,
   button/table style helpers). Depends on global React and on
   C / MONO / SANS from engine.js.
   ============================================================ */

/* ---- lucide icon stubs ---- */
const _icon = (paths) => ({ size=24, color='currentColor', strokeWidth=2, style }) =>
  React.createElement('svg', { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:color, strokeWidth, strokeLinecap:'round', strokeLinejoin:'round', style },
    ...paths.map((d,i) => React.createElement('path', { key:i, d })));

const Save = ({ size=24, color='currentColor', strokeWidth=2, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
  </svg>
);
const Trash2 = ({ size=24, color='currentColor', strokeWidth=2, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
  </svg>
);
const AlertTriangle = ({ size=24, color='currentColor', strokeWidth=2, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const RotateCcw = ({ size=24, color='currentColor', strokeWidth=2, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
  </svg>
);
const FolderOpen = ({ size=24, color='currentColor', strokeWidth=2, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><polyline points="2 10 22 10"/>
  </svg>
);
const TrendingUp = ({ size=24, color='currentColor', strokeWidth=2, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
  </svg>
);
const Info = ({ size=24, color='currentColor', strokeWidth=2, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);
const FileText = ({ size=24, color='currentColor', strokeWidth=2, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);

/* ---------- small components ---------- */
function Slider({ label, value, min, max, step, unit, onChange, hint, danger }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
        <label style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, fontWeight: 500 }}>{label}</label>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: danger ? C.neg : C.ink, letterSpacing: "-0.02em" }}>
          {typeof value === "number" && value % 1 !== 0 ? value.toFixed(2) : value.toLocaleString("en-US")}<span style={{ color: C.sub, fontWeight: 400, marginLeft: 3 }}>{unit}</span>
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", '--accent': danger ? C.neg : C.brass, height: 4, cursor: "pointer" }} />
      {hint && <div style={{ fontFamily: SANS, fontSize: 11, color: danger ? C.neg : C.sub, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}
function Card({ title, n, children }) {
  return (
    <div className="print-avoid pods-card" style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: "16px 18px" }}>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 14 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.brass, fontWeight: 700 }}>{n}</span>
        <h3 style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.text, margin: 0 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}
function Chip({ label, value, sub, color }) {
  return (
    <div style={{ flex: "1 1 130px", minWidth: 120, padding: "10px 14px", borderLeft: `2px solid ${color || C.brass}` }}>
      <div style={{ fontFamily: SANS, fontSize: 10.5, letterSpacing: "0.07em", textTransform: "uppercase", color: C.invSub, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: color || C.inv, letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.invSub, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const th = { padding: "9px 14px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#fff", background: "#15263B", letterSpacing: "0.04em", fontFamily: SANS };
const td = { padding: "6px 14px", textAlign: "right", borderBottom: "1px solid #ECE7DA", letterSpacing: "-0.02em", whiteSpace: "nowrap" };
const iconBtn = { background: "transparent", border: "none", cursor: "pointer", padding: 3, display: "flex", alignItems: "center", borderRadius: 5 };
function btn(bg, color, border) {
  return { display: "inline-flex", alignItems: "center", gap: 6, background: bg, color, border: `1px solid ${border || bg}`, borderRadius: 7, padding: "8px 13px", fontFamily: SANS, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
}
