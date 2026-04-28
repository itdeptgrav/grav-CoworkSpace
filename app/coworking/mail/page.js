"use client";
import { useState, useEffect, useRef } from "react";
import { firebaseAuth, firebaseDb } from "../../../lib/coworkFirebase";
import {
    collection, query, where, orderBy, limit,
    onSnapshot, doc, updateDoc, addDoc, arrayUnion, arrayRemove, serverTimestamp,
} from "firebase/firestore";
import { listEmployees, getMe } from "../../../lib/coworkApi";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
async function tok() { return firebaseAuth.currentUser?.getIdToken(); }

function fmt(ts) {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
        return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
function fmtFull(ts) {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const AVCOLS = ["#475569", "#1e40af", "#15803d", "#7c2d12", "#5b21b6", "#0e7490", "#9d174d", "#3f3f46"];
function avC(n = "") { let h = 0; for (const c of n) h = c.charCodeAt(0) + ((h << 5) - h); return AVCOLS[Math.abs(h) % AVCOLS.length]; }
function avI(n = "") { return (n || "?").split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase(); }

/* ─── Icons (Lucide-inspired) ─── */
function Icon({ name, size = 16, fill = false, strokeWidth = 1.75 }) {
    const p = {
        inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" /></>,
        send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
        draft: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 13h6" /><path d="M9 17h4" /></>,
        star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
        search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
        trash: <><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
        pencil: <><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /></>,
        reply: <><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></>,
        replyAll: <><polyline points="7 17 2 12 7 7" /><polyline points="12 17 7 12 12 7" /><path d="M22 18v-2a4 4 0 0 0-4-4H7" /></>,
        forward: <><polyline points="15 17 20 12 15 7" /><path d="M4 18v-2a4 4 0 0 1 4-4h12" /></>,
        paperclip: <><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8l-8.59 8.57a2 2 0 1 1-2.83-2.83l8.49-8.48" /></>,
        x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
        back: <path d="m15 18-6-6 6-6" />,
        plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
        sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></>,
        moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
        link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
        listBullet: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
        listNumber: <><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></>,
        envelope: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></>,
        chevron: <path d="m6 9 6 6 6-6" />,
        mail: <><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
    };
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: "block" }}>
            {p[name]}
        </svg>
    );
}

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root[data-cw-theme="light"] {
  --cw-bg: #fafafa;
  --cw-panel-1: #f7f7f8;
  --cw-panel-2: #ffffff;
  --cw-panel-3: #fafafa;
  --cw-border: #e7e7ea;
  --cw-border-2: #d4d4d8;
  --cw-text: #18181b;
  --cw-text-2: #52525b;
  --cw-text-3: #a1a1aa;
  --cw-text-4: #d4d4d8;
  --cw-hover: rgba(24,24,27,0.04);
  --cw-hover-2: rgba(24,24,27,0.06);
  --cw-active-bg: rgba(37,99,235,0.07);
  --cw-active-text: #1d4ed8;
  --cw-accent: #2563eb;
  --cw-accent-hover: #1d4ed8;
  --cw-accent-soft: rgba(37,99,235,0.08);
  --cw-warn: #d97706;
  --cw-danger: #dc2626;
  --cw-modal-shadow: 0 16px 64px -8px rgba(15,23,42,0.18), 0 4px 16px rgba(15,23,42,0.06);
  --cw-card-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.04);
  --cw-overlay: rgba(15,23,42,0.32);
  --cw-ring: 0 0 0 3px rgba(37,99,235,0.18);
}
:root[data-cw-theme="dark"] {
  --cw-bg: #09090b;
  --cw-panel-1: #0c0c0d;
  --cw-panel-2: #131316;
  --cw-panel-3: #0c0c0d;
  --cw-border: #1f1f23;
  --cw-border-2: #2a2a2f;
  --cw-text: #fafafa;
  --cw-text-2: #a1a1aa;
  --cw-text-3: #71717a;
  --cw-text-4: #3f3f46;
  --cw-hover: rgba(255,255,255,0.04);
  --cw-hover-2: rgba(255,255,255,0.06);
  --cw-active-bg: rgba(59,130,246,0.12);
  --cw-active-text: #93c5fd;
  --cw-accent: #3b82f6;
  --cw-accent-hover: #2563eb;
  --cw-accent-soft: rgba(59,130,246,0.12);
  --cw-warn: #f59e0b;
  --cw-danger: #f87171;
  --cw-modal-shadow: 0 24px 64px -8px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.5);
  --cw-card-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.35);
  --cw-overlay: rgba(0,0,0,0.6);
  --cw-ring: 0 0 0 3px rgba(59,130,246,0.28);
}

@keyframes cw-spin { to { transform: rotate(360deg); } }
@keyframes cw-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes cw-modal-in { from { opacity: 0; transform: translateY(4px) scale(0.995); } to { opacity: 1; transform: translateY(0) scale(1); } }

.cw-shell {
  display: flex; height: 100vh; overflow: hidden;
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  font-feature-settings: 'cv11', 'ss01';
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  color: var(--cw-text); background: var(--cw-bg);
  font-size: 13px; line-height: 1.5;
  letter-spacing: -0.005em;
}
.cw-shell *, .cw-shell *::before, .cw-shell *::after { box-sizing: border-box; }

.cw-shell ::-webkit-scrollbar { width: 10px; height: 10px; }
.cw-shell ::-webkit-scrollbar-track { background: transparent; }
.cw-shell ::-webkit-scrollbar-thumb {
  background: transparent; border-radius: 8px;
  border: 2px solid transparent; background-clip: padding-box;
  transition: background .2s;
}
.cw-shell *:hover::-webkit-scrollbar-thumb { background: var(--cw-border-2); border: 2px solid transparent; background-clip: padding-box; }
.cw-shell ::-webkit-scrollbar-thumb:hover { background: var(--cw-text-3) !important; }

/* ── Buttons ── */
.cw-btn-primary {
  background: var(--cw-accent); color: #fff; border: 1px solid transparent;
  cursor: pointer; font-weight: 500; font-family: inherit; font-size: 13px;
  border-radius: 7px; padding: 7px 14px;
  transition: background .12s ease, box-shadow .12s ease, transform .08s ease;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  white-space: nowrap; line-height: 1.2;
}
.cw-btn-primary:hover { background: var(--cw-accent-hover); }
.cw-btn-primary:active { transform: scale(0.985); }
.cw-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.cw-btn-primary:focus-visible { outline: none; box-shadow: var(--cw-ring); }

.cw-btn-secondary {
  background: var(--cw-panel-2); color: var(--cw-text);
  border: 1px solid var(--cw-border); cursor: pointer;
  font-family: inherit; font-weight: 500; font-size: 12.5px;
  border-radius: 7px; padding: 6px 12px;
  transition: background .12s ease, border-color .12s ease;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  white-space: nowrap; line-height: 1.2;
}
.cw-btn-secondary:hover { background: var(--cw-hover); border-color: var(--cw-border-2); }
.cw-btn-secondary:focus-visible { outline: none; box-shadow: var(--cw-ring); }

.cw-btn-ghost {
  background: transparent; color: var(--cw-text-2);
  border: 1px solid transparent; cursor: pointer;
  font-family: inherit; font-weight: 500; font-size: 12.5px;
  border-radius: 7px; padding: 6px 10px;
  transition: background .12s, color .12s;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.cw-btn-ghost:hover { background: var(--cw-hover); color: var(--cw-text); }
.cw-btn-ghost:focus-visible { outline: none; box-shadow: var(--cw-ring); }

.cw-icon-btn {
  width: 28px; height: 28px; border-radius: 6px;
  border: 1px solid transparent; background: transparent;
  color: var(--cw-text-2); cursor: pointer; display: inline-flex;
  align-items: center; justify-content: center;
  transition: background .12s, color .12s;
  flex-shrink: 0; font-family: inherit;
}
.cw-icon-btn:hover { background: var(--cw-hover); color: var(--cw-text); }
.cw-icon-btn:focus-visible { outline: none; box-shadow: var(--cw-ring); }
.cw-icon-btn-lg { width: 32px; height: 32px; border-radius: 7px; }

/* ── Form inputs ── */
.cw-input {
  width: 100%; padding: 7px 12px 7px 32px; border-radius: 7px;
  border: 1px solid var(--cw-border); background: var(--cw-panel-2);
  color: var(--cw-text); font-size: 13px; outline: none;
  transition: border-color .12s, box-shadow .12s;
  font-family: inherit; height: 32px;
}
.cw-input::placeholder { color: var(--cw-text-3); }
.cw-input:focus { border-color: var(--cw-accent); box-shadow: 0 0 0 3px var(--cw-accent-soft); }

/* ── Folder nav ── */
.cw-folder {
  position: relative;
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px; border-radius: 6px;
  border: none; background: transparent; cursor: pointer;
  font-size: 13px; font-weight: 500; line-height: 1.2;
  color: var(--cw-text-2); width: 100%; text-align: left;
  margin-bottom: 1px; font-family: inherit; min-height: 30px;
  transition: background .12s, color .12s;
}
.cw-folder:hover { background: var(--cw-hover); color: var(--cw-text); }
.cw-folder.active { background: var(--cw-active-bg); color: var(--cw-active-text); }
.cw-folder.active::before {
  content: ""; position: absolute;
  left: -8px; top: 6px; bottom: 6px; width: 2px;
  background: var(--cw-accent); border-radius: 1px;
}
.cw-folder:focus-visible { outline: none; box-shadow: var(--cw-ring); }
.cw-folder-icon { color: var(--cw-text-3); transition: color .12s; }
.cw-folder:hover .cw-folder-icon { color: var(--cw-text-2); }
.cw-folder.active .cw-folder-icon { color: var(--cw-active-text); }
.cw-folder-count {
  margin-left: auto; font-size: 11px; font-weight: 500;
  color: var(--cw-text-3); font-variant-numeric: tabular-nums;
}
.cw-folder.active .cw-folder-count { color: var(--cw-active-text); }
.cw-folder-dot {
  position: absolute; top: 5px; right: 5px;
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--cw-accent);
}

/* ── Mail row ── */
.cw-row {
  position: relative;
  display: flex; align-items: flex-start; gap: 10px;
  padding: 11px 14px 11px 18px; cursor: pointer;
  border-bottom: 1px solid var(--cw-border);
  transition: background .12s ease;
}
.cw-row:hover { background: var(--cw-hover); }
.cw-row.active { background: var(--cw-active-bg); }
.cw-row.active::before {
  content: ""; position: absolute;
  left: 0; top: 0; bottom: 0; width: 2px;
  background: var(--cw-accent);
}
.cw-row-dot {
  position: absolute; left: 8px; top: 18px;
  width: 6px; height: 6px; border-radius: 50%;
  background: transparent; transition: background .12s;
}
.cw-row.unread .cw-row-dot { background: var(--cw-accent); }
.cw-row.unread .cw-row-name { color: var(--cw-text); font-weight: 600; }
.cw-row.unread .cw-row-subj { color: var(--cw-text); font-weight: 500; }
.cw-row-actions {
  display: flex; gap: 1px; flex-shrink: 0;
  opacity: 0; transition: opacity .12s;
  margin-left: 2px;
}
.cw-row:hover .cw-row-actions { opacity: 1; }

/* ── Chip (recipient pill, attachment, count badge) ── */
.cw-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 5px 2px 8px; border-radius: 5px;
  font-size: 12px; font-weight: 500; line-height: 1.4;
  background: var(--cw-hover); border: 1px solid var(--cw-border);
  color: var(--cw-text);
  transition: background .12s, border-color .12s;
}
.cw-chip:hover { background: var(--cw-hover-2); border-color: var(--cw-border-2); }
.cw-chip-link { text-decoration: none; }
.cw-chip-x {
  background: none; border: none; cursor: pointer;
  color: var(--cw-text-3);
  padding: 0; line-height: 1; font-family: inherit;
  width: 14px; height: 14px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 3px; transition: color .12s, background .12s;
}
.cw-chip-x:hover { color: var(--cw-danger); background: var(--cw-hover); }

.cw-count-pill {
  display: inline-flex; align-items: center;
  font-size: 11px; font-weight: 500;
  color: var(--cw-text-3);
  font-variant-numeric: tabular-nums;
}

/* ── Card (thread message) ── */
.cw-card {
  background: var(--cw-panel-2);
  border: 1px solid var(--cw-border);
  border-radius: 8px;
  transition: border-color .15s, box-shadow .15s;
}
.cw-card.open {
  border-color: var(--cw-border-2);
  box-shadow: var(--cw-card-shadow);
}
.cw-card-head {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; cursor: pointer; user-select: none;
}

/* ── Modal ── */
.cw-modal-overlay {
  position: fixed; inset: 0;
  background: var(--cw-overlay);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 600; padding: 24px;
  animation: cw-fade-in .12s ease;
}
.cw-modal {
  background: var(--cw-panel-2);
  border: 1px solid var(--cw-border);
  border-radius: 12px;
  width: 100%; max-width: 640px; max-height: 86vh;
  display: flex; flex-direction: column;
  box-shadow: var(--cw-modal-shadow);
  overflow: hidden;
  animation: cw-modal-in .18s cubic-bezier(.2,.8,.2,1);
}

/* ── Content editable placeholder ── */
.cw-ce:empty:before {
  content: attr(data-placeholder);
  color: var(--cw-text-3); pointer-events: none;
}

.cw-mailbody { color: var(--cw-text); }
.cw-mailbody a { color: var(--cw-accent); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
.cw-mailbody p:first-child { margin-top: 0; }
.cw-mailbody p:last-child { margin-bottom: 0; }

/* ── Suggest dropdown ── */
.cw-suggest {
  position: absolute; top: calc(100% + 4px);
  left: 0; right: 0;
  background: var(--cw-panel-2);
  border: 1px solid var(--cw-border);
  border-radius: 8px;
  box-shadow: var(--cw-card-shadow);
  z-index: 500; overflow: hidden;
  animation: cw-fade-in .12s ease;
  max-height: 280px; overflow-y: auto;
}
.cw-suggest-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; cursor: pointer;
  transition: background .1s;
}
.cw-suggest-item:hover { background: var(--cw-hover); }

/* ── Empty state ── */
.cw-empty-icon {
  width: 56px; height: 56px;
  border-radius: 12px;
  background: var(--cw-panel-1);
  border: 1px solid var(--cw-border);
  display: flex; align-items: center; justify-content: center;
  color: var(--cw-text-3);
}

/* ── Utilities ── */
.cw-tnum { font-variant-numeric: tabular-nums; }
.cw-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cw-divider { height: 1px; background: var(--cw-border); }

/* Quoted reply */
.cw-quote {
  margin-top: 14px; padding-left: 12px;
  border-left: 2px solid var(--cw-border-2);
  color: var(--cw-text-3); font-size: 13px;
}

@media (max-width: 640px) {
  .cw-modal { max-height: 95vh; border-radius: 10px; }
  .cw-modal-overlay { padding: 8px; }
}
`;

/* ─── Avatar ─── */
function Av({ name = "", pic = null, size = 32 }) {
    const [err, setErr] = useState(false);
    if (pic && !err) {
        return <img src={pic} onError={() => setErr(true)} alt={name}
            style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, display: "block" }} />;
    }
    return (
        <div style={{ width: size, height: size, borderRadius: "50%", background: avC(name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.36), fontWeight: 600, flexShrink: 0, userSelect: "none", letterSpacing: "0.02em" }}>
            {avI(name)}
        </div>
    );
}

/* ─── Recipient input ─── */
function RecipInput({ label, value, onChange, employees, myId }) {
    const [q, setQ] = useState("");
    const [sugg, setSugg] = useState([]);

    useEffect(() => {
        if (!q.trim()) { setSugg([]); return; }
        const lq = q.toLowerCase();
        setSugg(employees.filter(e =>
            e.employeeId !== myId &&
            !value.find(r => r.id === e.employeeId) &&
            (e.name?.toLowerCase().includes(lq) || e.employeeId?.toLowerCase().includes(lq))
        ).slice(0, 6));
    }, [q, employees, value, myId]);

    const add = e => { onChange([...value, { id: e.employeeId, name: e.name, pic: e.profilePicUrl || null }]); setQ(""); setSugg([]); };
    const rm = id => onChange(value.filter(r => r.id !== id));

    return (
        <div style={{ display: "flex", alignItems: "flex-start", borderBottom: "1px solid var(--cw-border)", position: "relative", minHeight: 42 }}>
            <span style={{ fontSize: 11, color: "var(--cw-text-3)", padding: "13px 12px 0 0", flexShrink: 0, width: 32, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
            <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 5, padding: "8px 0", alignItems: "center" }}>
                {value.map(r => (
                    <span key={r.id} className="cw-chip">
                        <Av name={r.name} pic={r.pic} size={16} />
                        {r.name}
                        <button onClick={() => rm(r.id)} className="cw-chip-x" aria-label={`Remove ${r.name}`}>
                            <Icon name="x" size={11} strokeWidth={2} />
                        </button>
                    </span>
                ))}
                <input value={q} onChange={e => setQ(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter" && sugg[0]) { e.preventDefault(); add(sugg[0]); }
                        if (e.key === "Backspace" && !q && value.length) rm(value[value.length - 1].id);
                    }}
                    placeholder={value.length ? "" : "Search employees…"}
                    style={{ border: "none", outline: "none", fontSize: 13, background: "transparent", color: "var(--cw-text)", minWidth: 140, flex: 1, height: 26, fontFamily: "inherit" }} />
            </div>
            {sugg.length > 0 && (
                <div className="cw-suggest">
                    {sugg.map(e => (
                        <div key={e.employeeId} onClick={() => add(e)} className="cw-suggest-item">
                            <Av name={e.name} pic={e.profilePicUrl} size={28} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--cw-text)" }}>{e.name}</div>
                                <div style={{ fontSize: 11, color: "var(--cw-text-3)", marginTop: 1 }}>{e.department ? `${e.department} · ` : ""}{e.employeeId}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─── Compose modal ─── */
function Compose({ employees, myId, myName, myPic, replyTo, onClose }) {
    const [to, setTo] = useState(replyTo ? [{ id: replyTo.from, name: replyTo.fromName }] : []);
    const [cc, setCc] = useState([]);
    const [bcc, setBcc] = useState([]);
    const [subj, setSubj] = useState(replyTo ? `Re: ${replyTo.subject}` : "");
    const [showCc, setShowCc] = useState(false);
    const [showBcc, setShowBcc] = useState(false);
    const [atts, setAtts] = useState([]);
    const [upl, setUpl] = useState(false);
    const [sending, setSending] = useState(false);
    const bodyRef = useRef();

    const execCmd = (c, v) => { document.execCommand(c, false, v); bodyRef.current?.focus(); };

    const uploadFiles = async files => {
        setUpl(true);
        try {
            const token = await tok();
            const done = await Promise.all(Array.from(files).map(async f => {
                const fd = new FormData(); fd.append("file", f);
                const res = await fetch(`${BASE}/cowork/upload/pdf`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
                const d = await res.json(); if (!res.ok) throw new Error(d.error || "Upload failed");
                return { name: f.name, url: d.viewUrl || d.webViewLink || d.url, downloadUrl: d.downloadUrl, fileId: d.fileId, type: f.type.startsWith("image/") ? "image" : "file" };
            }));
            setAtts(p => [...p, ...done]);
        } catch (e) { alert(e.message); }
        finally { setUpl(false); }
    };

    const handlePaste = async e => {
        const items = e.clipboardData?.items;
        if (!items) return;
        const imageItems = Array.from(items).filter(item => item.type.startsWith("image/"));
        if (!imageItems.length) return;
        e.preventDefault();
        setUpl(true);
        try {
            const token = await tok();
            const done = await Promise.all(imageItems.map(async item => {
                const file = item.getAsFile();
                if (!file) return null;
                const fd = new FormData(); fd.append("file", file);
                const res = await fetch(`${BASE}/cowork/upload/pdf`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
                const d = await res.json(); if (!res.ok) throw new Error(d.error || "Upload failed");
                return { name: "pasted-image.png", url: d.viewUrl || d.webViewLink || d.url, downloadUrl: d.downloadUrl, type: "image" };
            }));
            setAtts(p => [...p, ...done.filter(Boolean)]);
        } catch (e) { alert(e.message); }
        finally { setUpl(false); }
    };

    const send = async (isDraft = false) => {
        if (!isDraft && !to.length) { alert("Add at least one recipient"); return; }
        setSending(true);
        try {
            const mailId = crypto.randomUUID();
            const threadId = replyTo?.threadId || replyTo?.mailId || mailId;

            // participants = everyone in this mail + original thread CC participants
            // This lets CC people see all replies even if they're not in to/cc of the reply
            const originalParticipants = replyTo
                ? [...(replyTo.to || []), ...(replyTo.cc || []), ...(replyTo.participants || []), replyTo.from].filter(Boolean)
                : [];
            const thisMailPeople = [myId, ...to.map(r => r.id), ...cc.map(r => r.id), ...bcc.map(r => r.id)];
            const participants = [...new Set([...thisMailPeople, ...originalParticipants])];

            await addDoc(collection(firebaseDb, "cowork_mails"), {
                mailId, threadId, parentMailId: replyTo?.mailId || null,
                from: myId, fromName: myName, fromPic: myPic || null,
                to: to.map(r => r.id), toNames: Object.fromEntries(to.map(r => [r.id, r.name])),
                toPics: Object.fromEntries(to.map(r => [r.id, r.pic || null])),
                cc: cc.map(r => r.id), ccNames: Object.fromEntries(cc.map(r => [r.id, r.name])),
                bcc: bcc.map(r => r.id),
                participants,
                subject: subj || (isDraft ? "(draft)" : "(no subject)"),
                body: bodyRef.current?.innerHTML || "",
                attachments: atts, isDraft,
                sentAt: serverTimestamp(),
                readBy: [myId], starredBy: [], deletedBy: [],
            });
            if (!isDraft) {
                // Notify ALL thread participants — including original CC people
                const recips = participants.filter(id => id !== myId);
                await Promise.all(recips.map(rId => addDoc(collection(firebaseDb, "cowork_notifications"), {
                    recipientEmployeeId: rId, type: "cowork_mail",
                    title: myName, body: (subj || "(no subject)").slice(0, 80),
                    data: { mailId, threadId }, read: false, createdAt: serverTimestamp(),
                })));
            }
            onClose();
        } catch (e) { alert(e.message); setSending(false); }
    };

    return (
        <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} className="cw-modal-overlay">
            <div className="cw-modal">
                {/* Header */}
                <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--cw-border)", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--cw-text)", flex: 1, letterSpacing: "-0.005em" }}>{replyTo ? "Reply" : "New message"}</span>
                    <button onClick={onClose} className="cw-icon-btn" aria-label="Close">
                        <Icon name="x" size={15} />
                    </button>
                </div>

                {/* Recipients */}
                <div style={{ padding: "0 18px", borderBottom: "1px solid var(--cw-border)" }}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                        <div style={{ flex: 1, minWidth: 0 }}><RecipInput label="To" value={to} onChange={setTo} employees={employees} myId={myId} /></div>
                        <div style={{ display: "flex", gap: 12, paddingLeft: 12, flexShrink: 0 }}>
                            {!showCc && <button onClick={() => setShowCc(true)} style={{ fontSize: 11, color: "var(--cw-text-3)", background: "none", border: "none", cursor: "pointer", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "inherit", padding: 0 }}>Cc</button>}
                            {!showBcc && <button onClick={() => setShowBcc(true)} style={{ fontSize: 11, color: "var(--cw-text-3)", background: "none", border: "none", cursor: "pointer", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "inherit", padding: 0 }}>Bcc</button>}
                        </div>
                    </div>
                    {showCc && <RecipInput label="Cc" value={cc} onChange={setCc} employees={employees} myId={myId} />}
                    {showBcc && <RecipInput label="Bcc" value={bcc} onChange={setBcc} employees={employees} myId={myId} />}
                    <input value={subj} onChange={e => setSubj(e.target.value)} placeholder="Subject"
                        style={{ width: "100%", border: "none", outline: "none", fontSize: 14, fontWeight: 500, padding: "11px 0", color: "var(--cw-text)", background: "transparent", borderTop: "1px solid var(--cw-border)", boxSizing: "border-box", fontFamily: "inherit", letterSpacing: "-0.005em" }} />
                </div>

                {/* Body */}
                <div ref={bodyRef} contentEditable suppressContentEditableWarning onPaste={handlePaste} className="cw-ce cw-mailbody"
                    data-placeholder="Compose your message…"
                    style={{ flex: 1, padding: "14px 18px", outline: "none", fontSize: 13.5, color: "var(--cw-text)", lineHeight: 1.65, overflowY: "auto", minHeight: 180 }}
                    dangerouslySetInnerHTML={replyTo ? { __html: `<br><br><div class="cw-quote"><div style="font-size:11px;color:#a1a1aa;margin-bottom:6px">On ${fmtFull(replyTo.sentAt)}, ${replyTo.fromName} wrote:</div>${replyTo.body}</div>` } : undefined}
                />

                {/* Attachments */}
                {atts.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 18px", borderTop: "1px solid var(--cw-border)" }}>
                        {atts.map((a, i) => (
                            <span key={i} className="cw-chip">
                                <Icon name="paperclip" size={11} strokeWidth={2} />
                                {a.name}
                                <button onClick={() => setAtts(p => p.filter((_, j) => j !== i))} className="cw-chip-x" aria-label="Remove attachment">
                                    <Icon name="x" size={11} strokeWidth={2} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                {/* Toolbar + footer */}
                <div style={{ padding: "10px 18px", borderTop: "1px solid var(--cw-border)", background: "var(--cw-panel-1)", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                    <button onMouseDown={e => { e.preventDefault(); execCmd("bold"); }} className="cw-icon-btn" aria-label="Bold" title="Bold">
                        <span style={{ fontWeight: 700, fontSize: 13 }}>B</span>
                    </button>
                    <button onMouseDown={e => { e.preventDefault(); execCmd("italic"); }} className="cw-icon-btn" aria-label="Italic" title="Italic">
                        <span style={{ fontStyle: "italic", fontSize: 13, fontFamily: "Georgia, serif" }}>I</span>
                    </button>
                    <button onMouseDown={e => { e.preventDefault(); execCmd("underline"); }} className="cw-icon-btn" aria-label="Underline" title="Underline">
                        <span style={{ textDecoration: "underline", fontSize: 13 }}>U</span>
                    </button>
                    <div style={{ width: 1, height: 18, background: "var(--cw-border)", margin: "0 4px" }} />
                    <button onMouseDown={e => { e.preventDefault(); execCmd("insertUnorderedList"); }} className="cw-icon-btn" aria-label="Bullet list" title="Bullet list">
                        <Icon name="listBullet" size={14} />
                    </button>
                    <button onMouseDown={e => { e.preventDefault(); execCmd("insertOrderedList"); }} className="cw-icon-btn" aria-label="Numbered list" title="Numbered list">
                        <Icon name="listNumber" size={14} />
                    </button>
                    <button onMouseDown={e => { e.preventDefault(); const u = prompt("URL:"); if (u) execCmd("createLink", u); }} className="cw-icon-btn" aria-label="Insert link" title="Insert link">
                        <Icon name="link" size={14} />
                    </button>
                    <label className="cw-icon-btn" style={{ cursor: "pointer" }} title={upl ? "Uploading…" : "Attach files"}>
                        <input type="file" multiple style={{ display: "none" }} onChange={e => { uploadFiles(e.target.files); e.target.value = ""; }} />
                        {upl
                            ? <div style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid currentColor", borderTopColor: "transparent", animation: "cw-spin 0.7s linear infinite" }} />
                            : <Icon name="paperclip" size={14} />}
                    </label>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => send(true)} className="cw-btn-ghost" disabled={sending}>
                        Save draft
                    </button>
                    <button onClick={() => send(false)} disabled={sending} className="cw-btn-primary">
                        <Icon name="send" size={13} />
                        {sending ? "Sending…" : "Send"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Mail row ─── */
function MailRow({ mail, active, myId, myPic, folder, empMap, onSelect, onStar, onDelete }) {
    const [hov, setHov] = useState(false);
    const unread = !(mail.readBy || []).includes(myId);
    const starred = (mail.starredBy || []).includes(myId);
    const isMe = mail.from === myId;
    const displayName = folder === "sent"
        ? (mail.toNames?.[mail.to?.[0]] || mail.to?.[0] || "—")
        : mail.fromName;
    const displayPic = folder === "sent"
        ? (mail.toPics?.[mail.to?.[0]] || empMap?.[mail.to?.[0]]?.profilePicUrl || null)
        : (isMe ? myPic : (mail.fromPic || empMap?.[mail.from]?.profilePicUrl || null));
    const preview = mail.body?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "";

    return (
        <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onSelect}
            className={`cw-row ${active ? "active" : ""} ${unread ? "unread" : ""}`}>
            <div className="cw-row-dot" />
            <Av name={displayName} pic={displayPic} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span className="cw-row-name cw-truncate" style={{ fontSize: 13, fontWeight: 500, color: "var(--cw-text-2)", letterSpacing: "-0.005em" }}>{displayName}</span>
                    <span className="cw-tnum" style={{ fontSize: 11, color: "var(--cw-text-3)", flexShrink: 0, fontWeight: 500 }}>{fmt(mail.sentAt)}</span>
                </div>
                <div className="cw-row-subj cw-truncate" style={{ fontSize: 12.5, fontWeight: 400, color: "var(--cw-text-2)", marginBottom: 1 }}>{mail.subject || "(no subject)"}</div>
                <div className="cw-truncate" style={{ fontSize: 11.5, color: "var(--cw-text-3)" }}>{preview}</div>
            </div>
            <div className="cw-row-actions">
                <button onClick={e => { e.stopPropagation(); onStar(); }} className="cw-icon-btn"
                    style={{ width: 24, height: 24, color: starred ? "var(--cw-warn)" : "var(--cw-text-3)" }}
                    aria-label={starred ? "Unstar" : "Star"} title={starred ? "Unstar" : "Star"}>
                    <Icon name="star" size={13} fill={starred} strokeWidth={1.5} />
                </button>
                <button onClick={e => { e.stopPropagation(); onDelete(); }} className="cw-icon-btn"
                    style={{ width: 24, height: 24 }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--cw-danger)"}
                    onMouseLeave={e => e.currentTarget.style.color = ""}
                    aria-label="Delete" title="Delete">
                    <Icon name="trash" size={13} />
                </button>
            </div>
            {!hov && starred && (
                <div style={{ color: "var(--cw-warn)", flexShrink: 0, display: "flex", alignItems: "center", marginLeft: 2 }}>
                    <Icon name="star" size={13} fill={true} strokeWidth={1.5} />
                </div>
            )}
        </div>
    );
}

/* ─── Thread view ─── */
function ThreadView({ threadId, myId, myName, myPic, employees, empMap, onReply, onClose }) {
    const [mails, setMails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState({});

    useEffect(() => {
        if (!threadId) return;
        setLoading(true);
        const q = query(collection(firebaseDb, "cowork_mails"), where("threadId", "==", threadId), where("isDraft", "==", false), orderBy("sentAt", "asc"));
        const unsub = onSnapshot(q, snap => {
            const m = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setMails(m);
            if (m.length) setExpanded(p => ({ ...p, [m[m.length - 1].id]: true }));
            snap.docs.forEach(d => {
                if (!(d.data().readBy || []).includes(myId))
                    updateDoc(d.ref, { readBy: arrayUnion(myId) }).catch(() => { });
            });
            setLoading(false);
        });
        return () => unsub();
    }, [threadId, myId]);

    if (loading) return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cw-panel-3)" }}>
            <div style={{ textAlign: "center", color: "var(--cw-text-3)", fontSize: 12 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", border: "1.5px solid var(--cw-border-2)", borderTopColor: "var(--cw-accent)", animation: "cw-spin 0.7s linear infinite", margin: "0 auto 10px" }} />
                Loading
            </div>
        </div>
    );

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--cw-panel-3)" }}>
            {/* Header */}
            <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--cw-border)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, background: "var(--cw-panel-2)", minHeight: 52 }}>
                <button onClick={onClose} className="cw-icon-btn cw-icon-btn-lg" aria-label="Back">
                    <Icon name="back" size={16} />
                </button>
                <h2 style={{ margin: 0, fontSize: "clamp(14px, 1.6vw, 16px)", fontWeight: 600, color: "var(--cw-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.015em" }}>{mails[0]?.subject || "(no subject)"}</h2>
                {mails.length > 1 && <span className="cw-count-pill cw-tnum">{mails.length} messages</span>}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
                {mails.map((mail, idx) => {
                    const open = expanded[mail.id];
                    const isLast = idx === mails.length - 1;
                    const isFromMe = mail.from === myId;
                    const pic = isFromMe ? myPic : (mail.fromPic || empMap?.[mail.from]?.profilePicUrl || null);
                    const toStr = mail.to?.map(id => mail.toNames?.[id] || employees.find(e => e.employeeId === id)?.name || id).join(", ") || "";
                    const ccStr = mail.cc?.length ? mail.cc.map(id => mail.ccNames?.[id] || employees.find(e => e.employeeId === id)?.name || id).join(", ") : "";

                    return (
                        <div key={mail.id} className={`cw-card ${open ? "open" : ""}`} style={{ marginBottom: 8, overflow: "hidden" }}>
                            {/* Card header */}
                            <div onClick={() => setExpanded(p => ({ ...p, [mail.id]: !p[mail.id] }))} className="cw-card-head">
                                <Av name={mail.fromName} pic={pic} size={32} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 1 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--cw-text)", letterSpacing: "-0.005em" }}>{mail.fromName}</span>
                                        {open && (
                                            <span className="cw-truncate" style={{ fontSize: 11.5, color: "var(--cw-text-3)", flex: 1 }}>
                                                to {toStr}{ccStr ? `, cc ${ccStr}` : ""}
                                            </span>
                                        )}
                                    </div>
                                    {!open && <div className="cw-truncate" style={{ fontSize: 12, color: "var(--cw-text-3)" }} dangerouslySetInnerHTML={{ __html: mail.body?.replace(/<[^>]+>/g, " ").slice(0, 130) }} />}
                                </div>
                                <span className="cw-tnum" style={{ fontSize: 11, color: "var(--cw-text-3)", flexShrink: 0, fontWeight: 500 }}>{fmt(mail.sentAt)}</span>
                            </div>

                            {open && (
                                <>
                                    <div className="cw-mailbody" style={{ padding: "0 18px 16px", paddingLeft: 62, fontSize: 13.5, lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: mail.body }} />
                                    {mail.attachments?.length > 0 && (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 18px 14px", paddingLeft: 62 }}>
                                            {mail.attachments.map((a, i) => (
                                                a.type === "image" || /\.(png|jpg|jpeg|gif|webp)$/i.test(a.name || "") ? (
                                                    <a key={i} href={a.url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginBottom: 4 }}>
                                                        <img
                                                            src={a.downloadUrl || (a.fileId ? `https://drive.google.com/uc?export=view&id=${a.fileId}` : a.url)}
                                                            alt={a.name}
                                                            style={{ maxWidth: 320, maxHeight: 240, borderRadius: 8, border: "1px solid var(--cw-border)", objectFit: "cover", cursor: "pointer", display: "block" }}
                                                            onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
                                                        />
                                                        <div style={{ display: "none", alignItems: "center", gap: 5, padding: "6px 10px", background: "var(--cw-hover)", borderRadius: 7, fontSize: 11, color: "var(--cw-text-2)" }}>
                                                            <Icon name="paperclip" size={11} strokeWidth={2} />{a.name}
                                                        </div>
                                                    </a>
                                                ) : (
                                                    <a key={i} href={a.url} target="_blank" rel="noreferrer" className="cw-chip cw-chip-link">
                                                        <Icon name="paperclip" size={11} strokeWidth={2} />
                                                        {a.name}
                                                    </a>
                                                )
                                            ))}
                                        </div>
                                    )}
                                    {isLast && (
                                        <div style={{ display: "flex", gap: 6, padding: "10px 18px 14px", paddingLeft: 62, borderTop: "1px solid var(--cw-border)", flexWrap: "wrap" }}>
                                            <button onClick={() => onReply(mail)} className="cw-btn-secondary">
                                                <Icon name="reply" size={13} />
                                                Reply
                                            </button>
                                            <button onClick={() => onReply({ ...mail, to: [...new Set([...mail.to, ...(mail.cc || [])])].filter(id => id !== myId), subject: mail.subject })} className="cw-btn-secondary">
                                                <Icon name="replyAll" size={13} />
                                                Reply all
                                            </button>
                                            <button onClick={() => onReply({ ...mail, to: [], subject: `Fwd: ${mail.subject}` })} className="cw-btn-secondary">
                                                <Icon name="forward" size={13} />
                                                Forward
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ─── Main ─── */
export default function MailPage() {
    const [myId, setMyId] = useState("");
    const [myName, setMyName] = useState("");
    const [myPic, setMyPic] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [empMap, setEmpMap] = useState({});
    const [folder, setFolder] = useState("inbox");
    const [mails, setMails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [compose, setCompose] = useState(null);
    const [search, setSearch] = useState("");
    const [ucounts, setUcounts] = useState({});
    const [mobilePanel, setMobilePanel] = useState("list");
    const [theme, setTheme] = useState("light");
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const unsub = firebaseAuth.onAuthStateChanged(async u => {
            if (!u) return;
            try {
                const me = await getMe();
                setMyId(me.employeeId);
                setMyName(me.name || "");
                setMyPic(me.profilePicUrl || u.photoURL || null);
                // list-members works for ALL roles (employee/TL/CEO)
                const token = await tok();
                const empRes = await fetch(`${BASE}/cowork/employee/list-members`, { headers: { Authorization: `Bearer ${token}` } });
                const empData = await empRes.json();
                const all = empData?.employees || [];
                setEmployees(all);
                // Key by BOTH id and employeeId — API returns id as Firestore doc ID
                const map = {};
                all.forEach(e => {
                    if (e.id) map[e.id] = e;
                    if (e.employeeId) map[e.employeeId] = e;
                });
                setEmpMap(map);
            } catch (err) { setMyId(u.uid); }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!myId) return;
        setLoading(true);

        // Inbox: need TWO queries — to[] and cc[] — then merge
        // Firestore doesn't support OR across array-contains fields
        if (folder === "inbox") {
            const mailMap = {};

            const merge = () => {
                const m = Object.values(mailMap)
                    .filter(m => !(m.deletedBy || []).includes(myId) && m.from !== myId)
                    .sort((a, b) => (b.sentAt?.seconds || 0) - (a.sentAt?.seconds || 0));
                setMails(m);
                setUcounts(p => ({ ...p, inbox: m.filter(m => !(m.readBy || []).includes(myId)).length }));
                setLoading(false); // show immediately after first query resolves
            };

            const toQ = query(collection(firebaseDb, "cowork_mails"), where("to", "array-contains", myId), where("isDraft", "==", false), orderBy("sentAt", "desc"), limit(50));
            const ccQ = query(collection(firebaseDb, "cowork_mails"), where("cc", "array-contains", myId), where("isDraft", "==", false), orderBy("sentAt", "desc"), limit(50));
            const parQ = query(collection(firebaseDb, "cowork_mails"), where("participants", "array-contains", myId), where("isDraft", "==", false), orderBy("sentAt", "desc"), limit(50));

            const unsubTo = onSnapshot(toQ, snap => { snap.docs.forEach(d => { mailMap[d.id] = { id: d.id, ...d.data() }; }); merge(); });
            const unsubCc = onSnapshot(ccQ, snap => { snap.docs.forEach(d => { mailMap[d.id] = { id: d.id, ...d.data() }; }); merge(); });
            const unsubPar = onSnapshot(parQ, snap => { snap.docs.forEach(d => { mailMap[d.id] = { id: d.id, ...d.data() }; }); merge(); });
            return () => { unsubTo(); unsubCc(); unsubPar(); };
        }

        // Other folders — single query
        let q;
        if (folder === "sent") q = query(collection(firebaseDb, "cowork_mails"), where("from", "==", myId), where("isDraft", "==", false), orderBy("sentAt", "desc"), limit(50));
        if (folder === "drafts") q = query(collection(firebaseDb, "cowork_mails"), where("from", "==", myId), where("isDraft", "==", true), orderBy("sentAt", "desc"), limit(50));
        if (folder === "starred") q = query(collection(firebaseDb, "cowork_mails"), where("starredBy", "array-contains", myId), where("isDraft", "==", false), orderBy("sentAt", "desc"), limit(50));
        if (!q) return;
        const unsub = onSnapshot(q, snap => {
            const m = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => !(m.deletedBy || []).includes(myId));
            setMails(m);
            setUcounts(p => ({ ...p, [folder]: m.filter(m => !(m.readBy || []).includes(myId)).length }));
            setLoading(false);
        });
        return () => unsub();
    }, [folder, myId]);

    // Responsive
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    // Theme
    useEffect(() => {
        document.documentElement.setAttribute("data-cw-theme", theme);
        return () => document.documentElement.removeAttribute("data-cw-theme");
    }, [theme]);

    const handleStar = async mail => {
        const starred = (mail.starredBy || []).includes(myId);
        await updateDoc(doc(firebaseDb, "cowork_mails", mail.id), { starredBy: starred ? arrayRemove(myId) : arrayUnion(myId) });
    };
    const handleDelete = async mail => {
        await updateDoc(doc(firebaseDb, "cowork_mails", mail.id), { deletedBy: arrayUnion(myId) });
        if (selected === mail.threadId) { setSelected(null); setMobilePanel("list"); }
    };

    const filtered = mails.filter(m => !search || [m.subject, m.fromName, m.body?.replace(/<[^>]+>/g, " ")].join(" ").toLowerCase().includes(search.toLowerCase()));

    const folders = [
        { id: "inbox", label: "Inbox", icon: "inbox" },
        { id: "sent", label: "Sent", icon: "send" },
        { id: "drafts", label: "Drafts", icon: "draft" },
        { id: "starred", label: "Starred", icon: "star" },
    ];

    const folderLabel = folders.find(f => f.id === folder)?.label || "";

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />

            <div className="cw-shell">

                {/* ── Sidebar ── */}
                <aside style={{ width: isMobile ? 56 : 224, display: "flex", flexDirection: "column", padding: isMobile ? "12px 8px" : "16px 16px", flexShrink: 0, transition: "width .2s ease", background: "var(--cw-panel-1)", borderRight: "1px solid var(--cw-border)" }}>

                    {/* Brand */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "0 0 14px" : "2px 4px 16px", marginBottom: 4 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: "var(--cw-accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>
                            <Icon name="mail" size={14} strokeWidth={2} />
                        </div>
                        {!isMobile && <span style={{ fontSize: 14, fontWeight: 600, color: "var(--cw-text)", letterSpacing: "-0.015em" }}>Mail</span>}
                    </div>

                    {/* Compose */}
                    <button onClick={() => { setCompose("new"); setSelected(null); }} className="cw-btn-primary"
                        style={{ width: "100%", marginBottom: 18, padding: isMobile ? "8px" : "8px 14px", justifyContent: "center" }}
                        title="Compose new message">
                        <Icon name="pencil" size={13} strokeWidth={2} />
                        {!isMobile && <span>Compose</span>}
                    </button>

                    {/* Folders */}
                    {!isMobile && (
                        <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--cw-text-3)", letterSpacing: "0.06em", textTransform: "uppercase", padding: "0 10px 6px" }}>Folders</div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                        {folders.map(f => {
                            const active = folder === f.id;
                            const count = ucounts[f.id] || 0;
                            return (
                                <button key={f.id} onClick={() => { setFolder(f.id); setSelected(null); setMobilePanel("list"); }}
                                    className={`cw-folder ${active ? "active" : ""}`}
                                    style={{ justifyContent: isMobile ? "center" : "flex-start", padding: isMobile ? "8px" : "6px 10px" }}
                                    title={f.label}>
                                    <span className="cw-folder-icon"><Icon name={f.icon} size={15} fill={f.icon === "star" && active} /></span>
                                    {!isMobile && <span>{f.label}</span>}
                                    {!isMobile && count > 0 && <span className="cw-folder-count">{count}</span>}
                                    {isMobile && count > 0 && <span className="cw-folder-dot" />}
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--cw-border)", display: "flex", flexDirection: "column", gap: 8 }}>
                        {/* Theme toggle */}
                        <div style={{ display: "flex", justifyContent: isMobile ? "center" : "flex-end" }}>
                            <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
                                className="cw-icon-btn"
                                aria-label="Toggle theme"
                                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
                                <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
                            </button>
                        </div>

                        {/* Profile */}
                        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: isMobile ? 0 : "4px 4px", justifyContent: isMobile ? "center" : "flex-start" }}>
                            <Av name={myName} pic={myPic} size={isMobile ? 28 : 28} />
                            {!isMobile && (
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div className="cw-truncate" style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cw-text)", letterSpacing: "-0.005em" }}>{myName || "—"}</div>
                                    <div className="cw-truncate" style={{ fontSize: 10.5, color: "var(--cw-text-3)", marginTop: 1, fontWeight: 500 }}>{myId}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </aside>

                {/* ── Mail list ── */}
                {(!isMobile || mobilePanel === "list") && (
                    <section style={{ width: isMobile ? "100%" : 340, display: "flex", flexDirection: "column", flexShrink: 0, background: "var(--cw-panel-2)", borderRight: "1px solid var(--cw-border)" }}>

                        {/* Header */}
                        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--cw-border)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--cw-text)", letterSpacing: "-0.015em" }}>{folderLabel}</h2>
                                {filtered.length > 0 && <span className="cw-count-pill cw-tnum">{filtered.length}</span>}
                            </div>
                            <div style={{ position: "relative" }}>
                                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--cw-text-3)", display: "flex", pointerEvents: "none" }}>
                                    <Icon name="search" size={13} strokeWidth={2} />
                                </span>
                                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search messages" className="cw-input" />
                            </div>
                        </div>

                        {/* Rows */}
                        <div style={{ flex: 1, overflowY: "auto" }}>
                            {loading
                                ? <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--cw-text-3)", fontSize: 12 }}>
                                    <div style={{ width: 18, height: 18, borderRadius: "50%", border: "1.5px solid var(--cw-border-2)", borderTopColor: "var(--cw-accent)", animation: "cw-spin 0.7s linear infinite", margin: "0 auto 10px" }} />
                                    Loading
                                </div>
                                : filtered.length === 0
                                    ? <div style={{ padding: "60px 24px", textAlign: "center" }}>
                                        <div style={{ display: "inline-flex", padding: 12, borderRadius: 10, background: "var(--cw-panel-1)", border: "1px solid var(--cw-border)", marginBottom: 12, color: "var(--cw-text-3)" }}>
                                            <Icon name={folders.find(f => f.id === folder)?.icon || "inbox"} size={18} />
                                        </div>
                                        <div style={{ fontSize: 13, color: "var(--cw-text-2)", fontWeight: 500, marginBottom: 2 }}>No messages</div>
                                        <div style={{ fontSize: 11.5, color: "var(--cw-text-3)" }}>{search ? "Try a different search" : `Your ${folder} is empty`}</div>
                                    </div>
                                    : filtered.map(m => (
                                        <MailRow key={m.id} mail={m} active={selected === m.threadId} myId={myId} myPic={myPic} folder={folder} empMap={empMap}
                                            onSelect={() => { setSelected(m.threadId); if (isMobile) setMobilePanel("thread"); }}
                                            onStar={() => handleStar(m)}
                                            onDelete={() => handleDelete(m)} />
                                    ))
                            }
                        </div>
                    </section>
                )}

                {/* ── Thread / empty ── */}
                {(!isMobile || mobilePanel === "thread") && (
                    <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--cw-panel-3)" }}>
                        {selected
                            ? <ThreadView threadId={selected} myId={myId} myName={myName} myPic={myPic} employees={employees} empMap={empMap}
                                onReply={mail => setCompose(mail)}
                                onClose={() => { setSelected(null); if (isMobile) setMobilePanel("list"); }} />
                            : <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 40, textAlign: "center" }}>
                                <div className="cw-empty-icon">
                                    <Icon name="envelope" size={22} strokeWidth={1.5} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--cw-text)", marginBottom: 4, letterSpacing: "-0.015em" }}>No conversation selected</div>
                                    <div style={{ fontSize: 13, color: "var(--cw-text-3)", maxWidth: 300, lineHeight: 1.55 }}>Select a message from the list, or start a new conversation.</div>
                                </div>
                                <button onClick={() => setCompose("new")} className="cw-btn-primary" style={{ marginTop: 4 }}>
                                    <Icon name="pencil" size={13} strokeWidth={2} />
                                    New message
                                </button>
                            </div>
                        }
                    </main>
                )}

                {compose && <Compose employees={employees} myId={myId} myName={myName} myPic={myPic} replyTo={compose !== "new" ? compose : null} onClose={() => setCompose(null)} />}
            </div>
        </>
    );
}
