"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/* ── Portal ── */
function Modal({ children }) {
    const [m, setM] = useState(false);
    useEffect(() => { setM(true); }, []);
    if (!m) return null;
    return createPortal(children, document.body);
}

async function getToken() {
    const { firebaseAuth } = await import("../../../lib/coworkFirebase");
    return firebaseAuth.currentUser?.getIdToken();
}

function fmtDatetime(dt) {
    if (!dt) return "—";
    const d = new Date(dt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtReadable(dt) {
    if (!dt) return "—";
    const d = new Date(dt);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function uploadFileToDrive(file) {
    const token = await getToken();
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/cowork/upload/pdf`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Upload failed");
    return { name: file.name, driveUrl: d.viewUrl || d.url, downloadUrl: d.downloadUrl || d.url, mimeType: file.type, size: file.size };
}

// ── Auto-distribute percentages equally among non-done components ─────────────
function distributeEqual(comps) {
    const n = comps.length;
    if (!n) return comps;
    const base = +(100 / n).toFixed(2);
    const remainder = +(100 - base * n).toFixed(2);
    return comps.map((c, i) => ({
        ...c,
        percentage: i === n - 1 ? +(base + remainder).toFixed(2) : base,
        points: c.points ?? 0,
    }));
}

// ── Redistribute % when one component changes ─────────────────────────────────
function redistributeAfterChange(comps, changedIdx, newPct) {
    const clamped = Math.min(100, Math.max(0, newPct));
    const remaining = +(100 - clamped).toFixed(2);
    const others = comps.filter((_, i) => i !== changedIdx && comps[i].status !== "done");
    if (!others.length) return comps.map((c, i) => i === changedIdx ? { ...c, percentage: 100 } : c);
    const perOther = +(remaining / others.length).toFixed(2);
    let othersUsed = 0;
    return comps.map((c, i) => {
        if (i === changedIdx) return { ...c, percentage: clamped };
        if (c.status === "done") return c;
        othersUsed++;
        // Last other gets remainder to ensure sum = 100
        const isLastOther = othersUsed === others.length;
        const assignedPct = isLastOther ? +(remaining - perOther * (others.length - 1)).toFixed(2) : perOther;
        return { ...c, percentage: assignedPct };
    });
}

/* ── Design tokens ── */
const T = {
    primary: "#6366F1",
    primaryDark: "#4F46E5",
    success: "#22C55E",
    successBg: "#F0FDF4",
    successBorder: "#86EFAC",
    warning: "#F59E0B",
    warningBg: "#FFFBEB",
    warningBorder: "#FDE68A",
    danger: "#EF4444",
    dangerBg: "#FFF5F5",
    dangerBorder: "#FECACA",
    text: "#0F172A",
    textMuted: "#64748B",
    textLight: "#94A3B8",
    border: "#E2E8F0",
    bg: "#F8FAFC",
    card: "#FFFFFF",
    radius: 12,
    shadow: "0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)",
    shadowMd: "0 4px 20px rgba(0,0,0,0.12)",
};

/* ── Shared button style factory ── */
function btn(variant = "default", extra = {}) {
    const base = { border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "all 0.15s", ...extra };
    const variants = {
        default: { background: "#fff", color: T.text, border: `1.5px solid ${T.border}` },
        primary: { background: T.primary, color: "#fff", boxShadow: "0 2px 8px rgba(99,102,241,0.3)" },
        success: { background: T.success, color: "#fff", boxShadow: "0 2px 8px rgba(34,197,94,0.25)" },
        danger: { background: T.danger, color: "#fff", boxShadow: "0 2px 8px rgba(239,68,68,0.25)" },
        ghost: { background: "transparent", color: T.textMuted, border: `1.5px solid ${T.border}` },
        amber: { background: T.warning, color: "#fff", boxShadow: "0 2px 8px rgba(245,158,11,0.25)" },
    };
    return { ...base, ...(variants[variant] || variants.default) };
}

/* ════════════════════════════════════
   CONFIRM MODAL (reusable)
════════════════════════════════════ */
function ConfirmModal({ icon, title, desc, confirmLabel, confirmVariant = "danger", onConfirm, onCancel }) {
    return (
        <Modal>
            <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
                <div style={{ background: "#fff", borderRadius: 16, padding: "28px 24px", width: "100%", maxWidth: 360, boxShadow: T.shadowMd, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }} onClick={e => e.stopPropagation()}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{icon}</div>
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 6 }}>{title}</div>
                        <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: desc }} />
                    </div>
                    <div style={{ display: "flex", gap: 10, width: "100%" }}>
                        <button onClick={onCancel} style={{ ...btn("ghost"), flex: 1, padding: "10px" }}>Cancel</button>
                        <button onClick={onConfirm} style={{ ...btn(confirmVariant), flex: 1, padding: "10px", fontWeight: 700 }}>{confirmLabel}</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

/* ════════════════════════════════════
   SUBMIT REPORT MODAL
════════════════════════════════════ */
function SubmitReportModal({ comp, idx, taskId, onSuccess, onCancel }) {
    const [text, setText] = useState("");
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState("");
    const fileRef = useRef(null);

    const handleFiles = async (e) => {
        const picked = Array.from(e.target.files || []);
        e.target.value = "";
        if (!picked.length) return;
        setUploading(true); setErr("");
        try {
            const uploaded = await Promise.all(picked.map(f => uploadFileToDrive(f)));
            setFiles(prev => [...prev, ...uploaded]);
        } catch (err) { setErr(err.message); }
        finally { setUploading(false); }
    };

    const handleSubmit = async () => {
        if (!text.trim() && !files.length) { setErr("Add a note or at least one file."); return; }
        setSubmitting(true); setErr("");
        try {
            const token = await getToken();
            const res = await fetch(`${BASE}/cowork/task/${taskId}/goal-activity/${comp.id}/submit-report`, {
                method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ text: text.trim(), files }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || "Failed");
            onSuccess();
        } catch (err) { setErr(err.message); }
        finally { setSubmitting(false); }
    };

    function fileIcon(m) {
        if (!m) return "📄";
        if (m.startsWith("image/")) return "🖼️";
        if (m.includes("pdf")) return "📋";
        if (m.includes("excel") || m.includes("spreadsheet") || m.includes("csv")) return "📊";
        if (m.includes("word") || m.includes("document")) return "📝";
        return "📄";
    }

    return (
        <Modal>
            <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0" }} onClick={onCancel}>
                <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 520, boxShadow: "0 -8px 40px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 16, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>

                    {/* Handle */}
                    <div style={{ width: 40, height: 4, background: T.border, borderRadius: 99, margin: "0 auto -8px" }} />

                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 4 }}>Submit Completion Report</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: T.bg, borderRadius: 99, width: "fit-content" }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted }}>Component #{idx + 1}</span>
                                <span style={{ width: 3, height: 3, borderRadius: "50%", background: T.border }} />
                                <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{comp.heading}</span>
                            </div>
                        </div>
                        <button onClick={onCancel} style={{ ...btn("ghost"), width: 32, height: 32, padding: 0, flexShrink: 0 }}>✕</button>
                    </div>

                    {/* Notes */}
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Report Notes</label>
                        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Describe what was done, findings, outcomes..." rows={4}
                            style={{ width: "100%", padding: "12px 14px", border: `1.5px solid ${T.border}`, borderRadius: 10, fontSize: 12, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6, color: T.text, transition: "border-color 0.15s" }}
                            onFocus={e => e.target.style.borderColor = T.primary} onBlur={e => e.target.style.borderColor = T.border} />
                    </div>

                    {/* File upload */}
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Attachments</label>
                        <input ref={fileRef} type="file" multiple accept="*/*" onChange={handleFiles} style={{ display: "none" }} />
                        <button onClick={() => fileRef.current?.click()} disabled={uploading}
                            style={{ width: "100%", padding: "14px", border: `2px dashed ${uploading ? T.primary : T.border}`, borderRadius: 10, fontSize: 12, fontWeight: 600, background: uploading ? "#EEF2FF" : T.bg, color: uploading ? T.primary : T.textMuted, cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                            {uploading ? "⏳ Uploading to Drive…" : "📎 Click to attach files (images, PDF, Excel, Word…)"}
                        </button>

                        {files.length > 0 && (
                            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                                {files.map((f, fi) => (
                                    <div key={fi} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8 }}>
                                        <span style={{ fontSize: 16, flexShrink: 0 }}>{fileIcon(f.mimeType)}</span>
                                        <a href={f.driveUrl} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 11, color: T.primary, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{f.name}</a>
                                        <button onClick={() => setFiles(p => p.filter((_, i) => i !== fi))} style={{ ...btn("ghost"), width: 24, height: 24, padding: 0, fontSize: 12, border: "none", color: T.textLight }}>✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {err && <div style={{ padding: "10px 12px", background: T.dangerBg, border: `1px solid ${T.dangerBorder}`, borderRadius: 8, fontSize: 11, color: T.danger, fontWeight: 600 }}>{err}</div>}

                    <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={onCancel} style={{ ...btn("ghost"), flex: 1, padding: "12px" }}>Cancel</button>
                        <button onClick={handleSubmit} disabled={submitting || uploading}
                            style={{ ...btn(submitting || uploading ? "ghost" : "success"), flex: 2, padding: "12px", fontSize: 13, fontWeight: 700, opacity: submitting || uploading ? 0.6 : 1 }}>
                            {submitting ? "Submitting…" : "✔ Submit & Mark Done"}
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

/* ════════════════════════════════════
   VIEW REPORT MODAL
════════════════════════════════════ */
function ViewReportModal({ comp, idx, onClose }) {
    const r = comp.report || {};
    function fileIcon(m) {
        if (!m) return "📄";
        if (m.startsWith("image/")) return "🖼️";
        if (m.includes("pdf")) return "📋";
        if (m.includes("excel") || m.includes("spreadsheet") || m.includes("csv")) return "📊";
        if (m.includes("word") || m.includes("document")) return "📝";
        return "📄";
    }
    return (
        <Modal>
            <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
                <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 520, boxShadow: "0 -8px 40px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 14, maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                    <div style={{ width: 40, height: 4, background: T.border, borderRadius: 99, margin: "0 auto -4px" }} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>📋 Submitted Report</div>
                            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>Component #{idx + 1}: <b>{comp.heading}</b></div>
                        </div>
                        <button onClick={onClose} style={{ ...btn("ghost"), width: 32, height: 32, padding: 0 }}>✕</button>
                    </div>

                    <div style={{ padding: "8px 12px", background: T.successBg, border: `1px solid ${T.successBorder}`, borderRadius: 8, fontSize: 11, color: "#166534" }}>
                        ✅ Submitted by <b>{r.submittedBy}</b> · {fmtReadable(r.submittedAt)}
                    </div>

                    {r.text && (
                        <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: T.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                            {r.text}
                        </div>
                    )}

                    {r.files?.length > 0 && (
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Attachments ({r.files.length})</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {r.files.map((f, fi) => (
                                    <a key={fi} href={f.driveUrl} target="_blank" rel="noreferrer"
                                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 9, textDecoration: "none", transition: "all 0.15s" }}
                                        onMouseEnter={e => e.currentTarget.style.borderColor = T.primary}
                                        onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                                        <span style={{ fontSize: 18 }}>{fileIcon(f.mimeType)}</span>
                                        <span style={{ flex: 1, fontSize: 11, color: T.primary, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                                        <span style={{ fontSize: 11, color: T.textLight }}>↗</span>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    <button onClick={onClose} style={{ ...btn("ghost"), padding: "12px", width: "100%" }}>Close</button>
                </div>
            </div>
        </Modal>
    );
}

/* ════════════════════════════════════
   HISTORY PANEL (slide-in right)
════════════════════════════════════ */
function HistoryPanel({ components, onClose }) {
    const [visible, setVisible] = useState(false);
    useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

    const handleClose = () => { setVisible(false); setTimeout(onClose, 280); };

    const TYPE = {
        created: { icon: "🌱", color: "#166534", bg: "#DCFCE7", border: "#86EFAC", tag: "Created" },
        edited: { icon: "✏️", color: "#92400E", bg: "#FEF3C7", border: "#FCD34D", tag: "Edited" },
        done: { icon: "✔", color: "#166534", bg: "#DCFCE7", border: "#86EFAC", tag: "Marked Done" },
        undone: { icon: "↩", color: "#1E40AF", bg: "#DBEAFE", border: "#93C5FD", tag: "Undone" },
        report: { icon: "📋", color: "#1D4ED8", bg: "#DBEAFE", border: "#93C5FD", tag: "Report Submitted" },
    };

    const allEvents = [];
    components.forEach((comp, ci) => {
        (comp.history || []).forEach((h, hi) => {
            const prevAt = hi > 0 ? (comp.history || [])[hi - 1].at : null;
            allEvents.push({ ...h, compIdx: ci, compHeading: comp.heading, prevAt });
        });
    });
    allEvents.sort((a, b) => b.at > a.at ? 1 : -1);
    const total = allEvents.length;

    return (
        <Modal>
            <style>{`
                @keyframes _fadeIn { from{opacity:0} to{opacity:1} }
                @keyframes _slideIn { from{transform:translateX(110%)} to{transform:translateX(0)} }
                @keyframes _slideOut { from{transform:translateX(0)} to{transform:translateX(110%)} }
            `}</style>

            {/* Backdrop */}
            <div onClick={handleClose} style={{ position: "fixed", inset: 0, zIndex: 99998, background: "rgba(15,23,42,0.35)", backdropFilter: "blur(3px)", animation: "_fadeIn 0.2s ease" }} />

            {/* Panel */}
            <div style={{
                position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 99999,
                width: "min(400px,100vw)", background: "#fff",
                boxShadow: "-4px 0 32px rgba(0,0,0,0.15)",
                display: "flex", flexDirection: "column",
                animation: `${visible ? "_slideIn" : "_slideOut"} 0.28s cubic-bezier(0.32,0.72,0,1) both`,
            }}>
                {/* Header */}
                <div style={{ background: "linear-gradient(135deg,#1E293B,#334155)", padding: "20px 20px 16px", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>Activity History</div>
                            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>
                                {total} event{total !== 1 ? "s" : ""} across {components.length} component{components.length !== 1 ? "s" : ""}
                            </div>
                        </div>
                        <button onClick={handleClose}
                            style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#94A3B8", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}
                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "#fff" }}
                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#94A3B8" }}>
                            ✕
                        </button>
                    </div>

                    {/* Component pills */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {components.map((comp, ci) => {
                            const cnt = (comp.history || []).length;
                            return (
                                <div key={ci} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: "#64748B" }}>#{ci + 1}</span>
                                    <span style={{ fontSize: 10, color: "#CBD5E1", fontWeight: 500, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{comp.heading}</span>
                                    {cnt > 0 && <span style={{ fontSize: 9, fontWeight: 800, color: "#F59E0B", background: "rgba(245,158,11,0.18)", padding: "1px 5px", borderRadius: 99 }}>{cnt}</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Timeline */}
                <div style={{ overflowY: "auto", flex: 1, padding: "20px 18px 40px" }}>
                    {total === 0 ? (
                        <div style={{ textAlign: "center", padding: "60px 0" }}>
                            <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>No changes yet</div>
                            <div style={{ fontSize: 11, color: T.textLight, marginTop: 4 }}>Changes will appear here as you work</div>
                        </div>
                    ) : (
                        <div style={{ position: "relative" }}>
                            {/* Vertical guide line */}
                            <div style={{ position: "absolute", left: 15, top: 16, bottom: 0, width: 2, background: "linear-gradient(to bottom,#E2E8F0,transparent)", borderRadius: 99 }} />

                            {allEvents.map((h, i) => {
                                const st = TYPE[h.type] || TYPE.edited;
                                return (
                                    <div key={i} style={{ display: "flex", gap: 12, marginBottom: i < allEvents.length - 1 ? 20 : 0, position: "relative" }}>
                                        {/* Icon */}
                                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: st.bg, border: `2px solid ${st.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, zIndex: 1, boxShadow: "0 0 0 3px #fff" }}>
                                            {st.icon}
                                        </div>

                                        {/* Content */}
                                        <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
                                            {/* Label + time */}
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: st.color }}>{h.label}</span>
                                            </div>

                                            {/* Timestamp — large and clear */}
                                            <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                                                <span style={{ fontSize: 10 }}>🕐</span>
                                                <span>{fmtReadable(h.at)}</span>
                                            </div>

                                            {/* Component chip */}
                                            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 99, fontSize: 10, fontWeight: 600, color: T.textMuted, marginBottom: h.changes?.length ? 10 : 0 }}>
                                                <span style={{ color: T.textLight }}>#{h.compIdx + 1}</span>
                                                <span style={{ color: T.text, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.compHeading}</span>
                                            </div>

                                            {/* Changed fields */}
                                            {h.changes?.length > 0 && (
                                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                    {h.changes.map((ch, ci) => (
                                                        <div key={ci} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                                                            {/* Field header */}
                                                            <div style={{ padding: "6px 12px", background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                                                                <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>{ch.field}</span>
                                                            </div>

                                                            {/* Before */}
                                                            {ch.from !== undefined && (
                                                                <div style={{ padding: "10px 12px", background: "#FFF5F5", borderBottom: "1px solid #FEE2E2" }}>
                                                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                                                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#DC2626" }} />
                                                                            <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626" }}>BEFORE</span>
                                                                        </div>
                                                                        {h.prevAt && (
                                                                            <div style={{ fontSize: 10, fontWeight: 600, color: "#F87171", background: "#FEE2E2", padding: "2px 8px", borderRadius: 99 }}>
                                                                                📅 {fmtReadable(h.prevAt)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div style={{ fontSize: 12, color: "#991B1B", lineHeight: 1.6, wordBreak: "break-word" }}>{ch.from || "(empty)"}</div>
                                                                </div>
                                                            )}

                                                            {/* After */}
                                                            <div style={{ padding: "10px 12px", background: "#F0FDF4" }}>
                                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                                                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#16A34A" }} />
                                                                        <span style={{ fontSize: 10, fontWeight: 700, color: "#16A34A" }}>{ch.from !== undefined ? "AFTER" : "SET TO"}</span>
                                                                    </div>
                                                                    <div style={{ fontSize: 10, fontWeight: 600, color: "#4ADE80", background: "#DCFCE7", padding: "2px 8px", borderRadius: 99 }}>
                                                                        📅 {fmtReadable(h.at)}
                                                                    </div>
                                                                </div>
                                                                <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.6, wordBreak: "break-word" }}>{ch.to || "(empty)"}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}

/* ════════════════════════════════════
   CUSTOM CALENDAR PICKER
   Shows used dates highlighted inline
════════════════════════════════════ */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function CustomCalendar({ value, onChange, usedDates = [] }) {
    const today = new Date();
    const parsed = value ? new Date(value) : null;
    const [viewYear, setViewYear] = useState(parsed ? parsed.getFullYear() : today.getFullYear());
    const [viewMonth, setViewMonth] = useState(parsed ? parsed.getMonth() : today.getMonth());
    const [hour, setHour] = useState(parsed ? parsed.getHours() : 0);
    const [minute, setMinute] = useState(parsed ? parsed.getMinutes() : 0);
    const [tooltip, setTooltip] = useState(null); // { x, y, names }

    // Build date → component names map from usedDates
    const usedMap = {};
    usedDates.forEach(d => {
        if (!d.deadline) return;
        const dd = new Date(d.deadline);
        const key = `${dd.getFullYear()}-${dd.getMonth()}-${dd.getDate()}`;
        if (!usedMap[key]) usedMap[key] = [];
        usedMap[key].push(d.heading);
    });

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
    const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

    const selectDate = (day) => {
        const d = new Date(viewYear, viewMonth, day, hour, minute);
        // Format as datetime-local value: YYYY-MM-DDTHH:mm
        const pad = n => String(n).padStart(2, "0");
        const str = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(minute)}`;
        onChange(str);
    };

    const updateTime = (h, m) => {
        setHour(h); setMinute(m);
        if (parsed) {
            const pad = n => String(n).padStart(2, "0");
            const str = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(h)}:${pad(m)}`;
            onChange(str);
        }
    };

    return (
        <div style={{ background: "#fff", border: `1.5px solid #E2E8F0`, borderRadius: 12, overflow: "hidden", userSelect: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>

            {/* Month nav */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                <button onClick={prevMonth} style={{ width: 28, height: 28, border: "1px solid #E2E8F0", borderRadius: 7, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{MONTHS[viewMonth]} {viewYear}</span>
                <button onClick={nextMonth} style={{ width: 28, height: 28, border: "1px solid #E2E8F0", borderRadius: 7, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
            </div>

            {/* Legend */}
            <div style={{ padding: "6px 14px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#475569" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: "#3B82F6" }} />
                    <span>Selected</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#475569" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: "#94A3B8" }} />
                    <span>Already used</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#475569" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: "#F1F5F9", border: "1px solid #CBD5E1" }} />
                    <span>Today</span>
                </div>
            </div>

            {/* Day headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "8px 10px 4px", gap: 2 }}>
                {DAYS.map(d => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.04em" }}>{d}</div>)}
            </div>

            {/* Calendar grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "0 10px 10px", gap: 2, position: "relative" }}>
                {/* Empty cells before first day */}
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const key = `${viewYear}-${viewMonth}-${day}`;
                    const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
                    const isSelected = parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth && parsed.getDate() === day;
                    const usedNames = usedMap[key] || [];
                    const isUsed = usedNames.length > 0;

                    let bg = "transparent", color = "#1E293B", border = "1px solid transparent";
                    if (isSelected) { bg = "#3B82F6"; color = "#fff"; border = "1px solid #2563EB"; }
                    else if (isUsed) { bg = "#94A3B8"; color = "#fff"; border = "1px solid #64748B"; }
                    else if (isToday) { bg = "#F1F5F9"; border = "1px solid #CBD5E1"; }

                    return (
                        <div key={day} style={{ position: "relative" }}>
                            <div
                                onClick={() => selectDate(day)}
                                onMouseEnter={isUsed ? (e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setTooltip({ day, names: usedNames, key });
                                } : undefined}
                                onMouseLeave={isUsed ? () => setTooltip(null) : undefined}
                                style={{ textAlign: "center", padding: "6px 2px", borderRadius: 7, fontSize: 12, fontWeight: isSelected || isToday ? 700 : 400, cursor: "pointer", background: bg, color, border, transition: "all 0.1s" }}
                            >
                                {day}
                                {isUsed && !isSelected && (
                                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#fff", margin: "1px auto 0" }} />
                                )}
                            </div>
                            {/* Tooltip */}
                            {tooltip?.key === key && (
                                <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", zIndex: 99, background: "#0F172A", color: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(0,0,0,0.3)", marginBottom: 4, minWidth: 120, textAlign: "center" }}>
                                    {tooltip.names.map((n, ni) => <div key={ni}>📌 {n}</div>)}
                                    <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #0F172A" }} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Time picker */}
            <div style={{ padding: "10px 14px", borderTop: "1px solid #E2E8F0", background: "#F8FAFC", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>Time</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                    <select value={hour} onChange={e => updateTime(Number(e.target.value), minute)}
                        style={{ flex: 1, padding: "6px 8px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontWeight: 600, color: "#0F172A", background: "#fff", fontFamily: "inherit", cursor: "pointer", outline: "none" }}>
                        {Array.from({ length: 24 }).map((_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}</option>)}
                    </select>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#64748B" }}>:</span>
                    <select value={minute} onChange={e => updateTime(hour, Number(e.target.value))}
                        style={{ flex: 1, padding: "6px 8px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontWeight: 600, color: "#0F172A", background: "#fff", fontFamily: "inherit", cursor: "pointer", outline: "none" }}>
                        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
                    </select>
                </div>
                {parsed && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#3B82F6", flexShrink: 0 }}>
                        {String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
                    </span>
                )}
            </div>

            {/* Selected date display */}
            {parsed && (
                <div style={{ padding: "8px 14px", borderTop: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 6, background: "#EFF6FF" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#1D4ED8" }}>
                        Selected: {fmtReadable(value)}
                    </span>
                </div>
            )}
        </div>
    );
}

/* ════════════════════════════════════
   FLOW EDIT BOX
════════════════════════════════════ */
function FlowEditBox({ idx, comp, onSave, onCancel, isNew, existingDeadlines = [] }) {
    const [heading, setHeading] = useState(comp.heading || "");
    const [description, setDescription] = useState(comp.description || "");
    const [deadline, setDeadline] = useState(comp.deadline || "");
    const ref = useRef(null);
    useEffect(() => { if (isNew) ref.current?.focus(); }, [isNew]);
    const canSave = heading.trim() && description.trim() && deadline;

    const otherDeadlines = existingDeadlines.filter(d => d.deadline && d.heading !== comp.heading);

    const inp = (extra = {}) => ({
        width: "100%", padding: "10px 12px", border: `1.5px solid ${T.border}`, borderRadius: 9,
        fontSize: 12, fontFamily: "inherit", outline: "none", background: "#fff",
        boxSizing: "border-box", color: T.text, transition: "border-color 0.15s", ...extra
    });

    return (
        <div style={{ background: "#fff", border: `2px solid ${T.primary}`, borderRadius: 14, padding: "16px", display: "flex", flexDirection: "column", gap: 12, boxShadow: `0 0 0 4px rgba(99,102,241,0.08), ${T.shadow}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: T.primary }}>{idx + 1}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.primary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {isNew ? "New Component" : "Edit Component"}
                </span>
            </div>

            <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Heading *</label>
                <input ref={ref} value={heading} onChange={e => setHeading(e.target.value)} placeholder="What is this component about?" style={inp()}
                    onFocus={e => e.target.style.borderColor = T.primary} onBlur={e => e.target.style.borderColor = T.border} />
            </div>
            <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Description *</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what needs to be done..." rows={3}
                    style={{ ...inp(), resize: "vertical" }}
                    onFocus={e => e.target.style.borderColor = T.primary} onBlur={e => e.target.style.borderColor = T.border} />
            </div>
            <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Deadline *</label>
                <CustomCalendar
                    value={deadline}
                    onChange={setDeadline}
                    usedDates={otherDeadlines}
                />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={onCancel} style={{ ...btn("ghost"), flex: 1, padding: "10px" }}>Cancel</button>
                <button disabled={!canSave} onClick={() => onSave({ heading: heading.trim(), description: description.trim(), deadline })}
                    style={{ ...btn(canSave ? "primary" : "ghost"), flex: 2, padding: "10px", fontWeight: 700, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}>
                    ✓ Save Component
                </button>
            </div>
        </div>
    );
}

/* ════════════════════════════════════
   ADD BUTTON
════════════════════════════════════ */
function AddBtn({ onClick }) {
    const [hov, setHov] = useState(false);
    return (
        <div style={{ display: "flex", justifyContent: "center", position: "relative", zIndex: 5, padding: "2px 0" }}>
            <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
                style={{ padding: "5px 18px", border: `2px dashed ${hov ? T.primary : T.border}`, borderRadius: 99, fontSize: 11, fontWeight: 700, color: hov ? T.primary : T.textMuted, background: hov ? "#EEF2FF" : "#fff", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s", boxShadow: hov ? `0 0 0 3px rgba(99,102,241,0.1)` : "none" }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add component
            </button>
        </div>
    );
}

/* ════════════════════════════════════
   NODE CARD
════════════════════════════════════ */
function NodeCard({ comp, idx, isDone, canEdit, isHead, taskId, onEdit, onDelete, onMarkDone, onMarkUndo, onPendingApproval, onReject, onReportSubmitted }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [showSubmit, setShowSubmit] = useState(false);
    const [showView, setShowView] = useState(false);
    const [showUndoConfirm, setShowUndoConfirm] = useState(false);
    const reportSubmitted = comp.reportSubmitted;
    const isPendingApproval = comp.status === "pending_approval";

    // Professional card colors based on who created it
    const isCreatedByHead = comp.createdByRole === "head";
    const cardAccent = isDone ? "#16A34A" : isCreatedByHead ? "#0F172A" : "#2563EB";
    const cardBg = isDone ? "#F0FDF4" : isCreatedByHead ? "#F8FAFC" : "#EFF6FF";
    const cardBorder = isDone ? T.successBorder : isCreatedByHead ? "#CBD5E1" : "#BFDBFE";

    return (
        <>
            {showSubmit && <SubmitReportModal comp={comp} idx={idx} taskId={taskId} onSuccess={() => { setShowSubmit(false); onPendingApproval(); onReportSubmitted(); }} onCancel={() => setShowSubmit(false)} />}
            {showView && <ViewReportModal comp={comp} idx={idx} onClose={() => setShowView(false)} />}
            {showUndoConfirm && (
                <ConfirmModal
                    icon="↩️" title="Undo Done?" confirmLabel="Yes, Undo" confirmVariant="amber"
                    desc={`<b>"${comp.heading}"</b> was marked done${comp.doneAt ? ` on ${fmtReadable(comp.doneAt)}` : ""}. Undo?`}
                    onConfirm={() => { setShowUndoConfirm(false); onMarkUndo(); }} onCancel={() => setShowUndoConfirm(false)} />
            )}

            <div style={{
                background: cardBg,
                border: `1px solid ${cardBorder}`,
                borderLeft: `3px solid ${cardAccent}`,
                borderRadius: 12, padding: "12px 14px",
                boxShadow: T.shadow,
                position: "relative",
                transition: "all 0.2s",
            }}>
                {/* ··· button */}
                {(canEdit || isHead) && (
                    <button onClick={() => setMenuOpen(o => !o)}
                        style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 7, border: `1.5px solid ${menuOpen ? T.primary : T.border}`, background: menuOpen ? "#EEF2FF" : "#fff", color: menuOpen ? T.primary : T.textMuted, fontSize: 15, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", transition: "all 0.15s" }}>
                        ···
                    </button>
                )}

                {/* Status badge */}
                <div style={{
                    display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, marginBottom: 8,
                    background: isDone ? T.successBg : isPendingApproval ? "#FFFBEB" : "#F1F5F9",
                    border: `1px solid ${isDone ? T.successBorder : isPendingApproval ? "#FDE68A" : T.border}`,
                }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: isDone ? "#22C55E" : isPendingApproval ? "#F59E0B" : "#94A3B8" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: isDone ? "#166534" : isPendingApproval ? "#92400E" : "#64748B" }}>{isDone ? "DONE" : isPendingApproval ? "⏳ AWAITING APPROVAL" : "PENDING"}</span>
                    {isDone && comp.doneAt && <span style={{ fontSize: 9, color: "#4ADE80", fontWeight: 600 }}>· {fmtReadable(comp.doneAt)}</span>}
                </div>

                {/* Report submitted badge */}
                {(reportSubmitted || isPendingApproval) && (
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, marginBottom: isHead && !isDone ? 6 : 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: "#1D4ED8" }}>
                                <span>📋</span> Report submitted · {comp.report?.submittedBy}
                            </div>
                            <button onClick={() => setShowView(true)} style={{ fontSize: 10, fontWeight: 700, color: T.primary, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>View →</button>
                        </div>
                        {/* Approve / Reject — visible inline for TL/CEO */}
                        {isHead && isPendingApproval && (
                            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                <button onClick={() => { setMenuOpen(false); onMarkDone(); }}
                                    style={{ ...btn("success"), flex: 1, padding: "7px 10px", fontSize: 11 }}>
                                    ✅ Approve
                                </button>
                                <button onClick={() => { setMenuOpen(false); onReject(); }}
                                    style={{ ...btn("ghost"), flex: 1, padding: "7px 10px", fontSize: 11, color: T.danger, borderColor: T.dangerBorder, background: T.dangerBg }}>
                                    ✕ Reject
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Content */}
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4, lineHeight: 1.4, paddingRight: 36 }}>{comp.heading}</div>
                <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.6, marginBottom: 8, whiteSpace: "pre-wrap" }}>{comp.description}</div>

                {/* % weight + points badges */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                    {comp.percentage != null && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#5B5EF4", background: "#EEF2FF", border: "1px solid #C7D2FE", padding: "2px 8px", borderRadius: 99 }}>
                            {Number(comp.percentage).toFixed(1)}% weight
                        </span>
                    )}
                    {(comp.points > 0) && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#7E22CE", background: "#F5F3FF", border: "1px solid #DDD6FE", padding: "2px 8px", borderRadius: 99 }}>
                            +{comp.points} pts on completion
                        </span>
                    )}
                    {/* Creator role badge */}
                    {comp.createdByRole && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: comp.createdByRole === "head" ? "#475569" : "#1D4ED8", background: comp.createdByRole === "head" ? "#F1F5F9" : "#DBEAFE", border: `1px solid ${comp.createdByRole === "head" ? "#CBD5E1" : "#93C5FD"}`, padding: "2px 7px", borderRadius: 99, letterSpacing: "0.03em" }}>
                            {comp.createdByRole === "head" ? "SET BY ADMIN" : "SET BY EMPLOYEE"}
                        </span>
                    )}
                </div>

                {/* Deadline — displayed as a badge, not overwritten */}
                {comp.deadline && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: isDone ? "#DCFCE7" : "#F1F5F9", border: `1px solid ${isDone ? "#86EFAC" : "#E2E8F0"}`, borderRadius: 8, marginBottom: 6 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={isDone ? "#16A34A" : "#64748B"} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        <span style={{ fontSize: 10, fontWeight: 700, color: isDone ? "#16A34A" : "#334155" }}>
                            Deadline: {fmtReadable(comp.deadline)}
                        </span>
                    </div>
                )}

                {(comp.createdAt || comp.editedAt) && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                        {comp.createdAt && <div style={{ fontSize: 9, color: T.textLight, display: "flex", alignItems: "center", gap: 4 }}><span>📌</span> Created {fmtReadable(comp.createdAt)}</div>}
                        {comp.editedAt && <div style={{ fontSize: 9, color: T.textLight, display: "flex", alignItems: "center", gap: 4 }}><span>✏️</span> Edited {fmtReadable(comp.editedAt)}</div>}
                    </div>
                )}

                {/* Expanded menu */}
                {menuOpen && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
                        {canEdit && (
                            <div style={{ display: "flex", gap: 6 }}>
                                {!isDone && (
                                    <>
                                        <button onClick={() => { setMenuOpen(false); onEdit(); }}
                                            style={{ ...btn("default"), flex: 1, padding: "8px 10px", fontSize: 11 }}>✏️ Edit</button>
                                        <button onClick={() => { setMenuOpen(false); onDelete(); }}
                                            style={{ ...btn("ghost"), padding: "8px 10px", fontSize: 11, color: T.danger, borderColor: T.dangerBorder, background: T.dangerBg }}>🗑</button>
                                    </>
                                )}
                                {isDone
                                    ? <button onClick={() => { setMenuOpen(false); setShowUndoConfirm(true); }}
                                        style={{ ...btn("ghost"), flex: 1, padding: "8px 10px", fontSize: 11, color: "#92400E", borderColor: T.warningBorder, background: T.warningBg }}>↩ Undo Done</button>
                                    : <button onClick={() => { setMenuOpen(false); setShowSubmit(true); }}
                                        style={{ ...btn("success"), flex: 1, padding: "8px 10px", fontSize: 11 }}>✔ Mark Done</button>
                                }
                            </div>
                        )}
                        {isHead && isPendingApproval && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <button onClick={() => { setMenuOpen(false); setShowView(true); }}
                                    style={{ ...btn("ghost"), padding: "8px 10px", fontSize: 11, color: T.primary, borderColor: "#BFDBFE", background: "#EFF6FF" }}>
                                    👁 View Submitted Report
                                </button>
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button onClick={() => { setMenuOpen(false); onMarkDone(); }}
                                        style={{ ...btn("success"), flex: 1, padding: "8px 10px", fontSize: 11 }}>
                                        ✅ Approve
                                    </button>
                                    <button onClick={() => { setMenuOpen(false); onReject(); }}
                                        style={{ ...btn("ghost"), flex: 1, padding: "8px 10px", fontSize: 11, color: T.danger, borderColor: T.dangerBorder, background: T.dangerBg }}>
                                        ✕ Reject
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}

/* ════════════════════════════════════
   INTERACTIVE FLOWCHART
════════════════════════════════════ */
function getProgressPct(components) {
    if (!components.length) return 0;
    let last = -1;
    components.forEach((c, i) => { if (c.status === "done") last = i; });
    return last < 0 ? 0 : Math.round(((last + 1) / components.length) * 100);
}

function InteractiveFlowchart({
    components, editingIdx, addingAfter, submitted, canEdit, isHead, editingMode, taskId,
    seenCount, onSeen,
    onEdit, onDelete, onMarkDone, onMarkUndo, onPendingApproval, onReject,
    onAddBetween, onSaveNew, onSaveEdit, onCancelEdit, onCancelAdd,
    onDeleteAll, onToggleEditMode, onRefresh,
}) {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const progressPct = getProgressPct(components);
    const totalEvents = components.reduce((s, c) => s + (c.history?.length || 0), 0);
    const unseen = Math.max(0, totalEvents - seenCount);

    // Detect narrow container — observe the wrapper width, not viewport,
    // because this component lives inside a sidebar that can be narrower.
    const wrapRef = useRef(null);
    const [isNarrow, setIsNarrow] = useState(false);
    useEffect(() => {
        const el = wrapRef.current;
        if (!el || typeof ResizeObserver === "undefined") {
            // Fallback: viewport-based check
            const check = () => setIsNarrow(window.innerWidth <= 640);
            check();
            window.addEventListener("resize", check);
            return () => window.removeEventListener("resize", check);
        }
        const ro = new ResizeObserver(entries => {
            for (const e of entries) {
                setIsNarrow(e.contentRect.width <= 560);
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div ref={wrapRef}>
            <style>{`
                /* Single-column timeline: shifts the line to the left and reorders rows */
                .gt-narrow .gt-tl-line { left: 14px !important; transform: none !important; }
                .gt-narrow .gt-tl-side-left,
                .gt-narrow .gt-tl-side-right {
                    width: auto !important;
                    min-width: 0 !important;
                }
                .gt-narrow .gt-tl-item.left .gt-tl-side-left { flex: 1 1 0% !important; display: block !important; }
                .gt-narrow .gt-tl-item.right .gt-tl-side-right { flex: 1 1 0% !important; display: block !important; }
                .gt-narrow .gt-tl-dot-wrap { width: 28px !important; }
                .gt-narrow .gt-tl-item.left .gt-tl-row { flex-direction: row-reverse; }
                .gt-narrow .gt-tl-item.left .gt-tl-side-right { display: none !important; }
                .gt-narrow .gt-tl-item.right .gt-tl-side-left { display: none !important; }
            `}</style>
            {showDeleteConfirm && (
                <ConfirmModal icon="🗑️" title="Delete entire roadmap?" confirmLabel="Yes, Delete All" confirmVariant="danger"
                    desc="This permanently removes all components and cannot be undone."
                    onConfirm={() => { setShowDeleteConfirm(false); onDeleteAll(); }} onCancel={() => setShowDeleteConfirm(false)} />
            )}
            {showHistory && <HistoryPanel components={components} onClose={() => setShowHistory(false)} />}

            <div
                className="gt-roadmap"
                style={
                    isNarrow
                        ? { background: "transparent", border: "none", borderRadius: 0, overflow: "visible", boxShadow: "none" }
                        : { background: "#fff", border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden", boxShadow: T.shadow }
                }
            >
                {/* ── Header ── */}
                {isNarrow ? (
                    /* Narrow: stacked header inside its own clean card */
                    <div className="gt-roadmap-head" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 16 }}>⭐</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: "-0.2px" }}>Goal Roadmap</span>
                            {components.length > 0 && (
                                <span style={{ fontSize: 10, fontWeight: 700, background: "#FEF3C7", color: "#92400E", padding: "3px 8px", borderRadius: 99, border: "1px solid #FDE68A", whiteSpace: "nowrap" }}>
                                    {components.length} component{components.length !== 1 ? "s" : ""}
                                </span>
                            )}
                            {components.length > 0 && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: progressPct === 100 ? "#166534" : "#64748B", background: progressPct === 100 ? T.successBg : T.bg, padding: "3px 8px", borderRadius: 99, border: `1px solid ${progressPct === 100 ? T.successBorder : T.border}`, whiteSpace: "nowrap" }}>
                                    {progressPct}% done
                                </span>
                            )}
                        </div>
                        {(submitted || components.length > 0 || (submitted && canEdit) || (canEdit && components.length > 0)) && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                                {submitted && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 99, background: T.successBg, border: `1px solid ${T.successBorder}`, fontSize: 10, fontWeight: 700, color: "#166534", whiteSpace: "nowrap" }}>
                                        ✅ Submitted
                                    </div>
                                )}
                                {components.length > 0 && (
                                    <button onClick={() => { setShowHistory(true); onSeen(totalEvents); }}
                                        style={{ ...btn("ghost"), padding: "4px 9px", fontSize: 10, gap: 4, position: "relative", borderColor: unseen > 0 ? T.primary : T.border, color: unseen > 0 ? T.primary : T.textMuted, background: unseen > 0 ? "#EEF2FF" : "#fff", whiteSpace: "nowrap" }}>
                                        🕐 History
                                        <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 99, background: unseen > 0 ? T.primary : T.border, color: "#fff", lineHeight: 1.4 }}>{unseen}</span>
                                    </button>
                                )}
                                {submitted && canEdit && (
                                    <button onClick={onToggleEditMode}
                                        style={{ ...btn(editingMode ? "danger" : "ghost"), padding: "4px 9px", fontSize: 10, whiteSpace: "nowrap" }}>
                                        {editingMode ? "🔒 Lock" : "✏️ Edit"}
                                    </button>
                                )}
                                {canEdit && components.length > 0 && (
                                    <button onClick={() => setShowDeleteConfirm(true)}
                                        style={{ ...btn("ghost"), padding: "4px 9px", fontSize: 10, color: T.danger, borderColor: T.dangerBorder, background: T.dangerBg }}>
                                        🗑
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    /* Desktop: original single-row header */
                    <div className="gt-roadmap-head" style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: T.bg }}>
                        <div className="gt-roadmap-title" style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 18 }}>⭐</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: "-0.2px" }}>Goal Roadmap</span>
                            {components.length > 0 && (
                                <span style={{ fontSize: 10, fontWeight: 700, background: "#FEF3C7", color: "#92400E", padding: "3px 8px", borderRadius: 99, border: "1px solid #FDE68A" }}>
                                    {components.length} component{components.length !== 1 ? "s" : ""}
                                </span>
                            )}
                            {components.length > 0 && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: progressPct === 100 ? "#166534" : "#64748B", background: progressPct === 100 ? T.successBg : T.bg, padding: "3px 8px", borderRadius: 99, border: `1px solid ${progressPct === 100 ? T.successBorder : T.border}` }}>
                                    {progressPct}% done
                                </span>
                            )}
                        </div>

                        <div className="gt-roadmap-actions" style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            {submitted && (
                                <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 99, background: T.successBg, border: `1px solid ${T.successBorder}`, fontSize: 10, fontWeight: 700, color: "#166534" }}>
                                    ✅ Submitted
                                </div>
                            )}

                            {components.length > 0 && (
                                <button onClick={() => { setShowHistory(true); onSeen(totalEvents); }}
                                    style={{ ...btn("ghost"), padding: "5px 10px", fontSize: 10, gap: 5, position: "relative", borderColor: unseen > 0 ? T.primary : T.border, color: unseen > 0 ? T.primary : T.textMuted, background: unseen > 0 ? "#EEF2FF" : "#fff" }}>
                                    🕐 History
                                    <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 99, background: unseen > 0 ? T.primary : T.border, color: "#fff", lineHeight: 1.4 }}>
                                        {unseen}
                                    </span>
                                </button>
                            )}

                            {submitted && canEdit && (
                                <button onClick={onToggleEditMode}
                                    style={{ ...btn(editingMode ? "danger" : "ghost"), padding: "5px 10px", fontSize: 10 }}>
                                    {editingMode ? "🔒 Lock" : "✏️ Edit"}
                                </button>
                            )}

                            {canEdit && components.length > 0 && (
                                <button onClick={() => setShowDeleteConfirm(true)}
                                    style={{ ...btn("ghost"), padding: "5px 10px", fontSize: 10, color: T.danger, borderColor: T.dangerBorder, background: T.dangerBg }}>
                                    🗑
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Progress bar ── */}
                {components.length > 0 && !isNarrow && (
                    <div style={{ height: 3, background: T.bg }}>
                        <div style={{ height: "100%", width: `${progressPct}%`, background: `linear-gradient(to right,${T.success},#16A34A)`, transition: "width 0.5s ease", borderRadius: "0 99px 99px 0" }} />
                    </div>
                )}

                {/* ── Body ── */}
                <div className={`gt-roadmap-body ${isNarrow ? "gt-narrow" : ""}`} style={{ padding: isNarrow ? "0" : "16px" }}>
                    {/* Empty state */}
                    {components.length === 0 && addingAfter === null && (
                        <div style={{ textAlign: "center", padding: "32px 0" }}>
                            <div style={{ fontSize: 36, marginBottom: 10 }}>🗺️</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 4 }}>No components yet</div>
                            <div style={{ fontSize: 11, color: T.textLight, marginBottom: 16 }}>Break your goal into steps</div>
                            {canEdit && <AddBtn onClick={() => onAddBetween(-1)} />}
                        </div>
                    )}
                    {components.length === 0 && addingAfter === -1 && (
                        <FlowEditBox idx={0} comp={{}} isNew onSave={(d) => onSaveNew(-1, d)} onCancel={onCancelAdd} existingDeadlines={components.map(c => ({ heading: c.heading, deadline: c.deadline }))} />
                    )}

                    {components.length > 0 && (
                        <div className="gt-timeline" style={{ position: "relative" }}>
                            {/* Base line */}
                            <div className="gt-tl-line" style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: T.border, transform: "translateX(-50%)", zIndex: 0, borderRadius: 99 }} />
                            {/* Progress line */}
                            {progressPct > 0 && (
                                <div className="gt-tl-line gt-tl-line-progress" style={{ position: "absolute", left: "50%", top: 0, height: `${progressPct}%`, width: 2, background: `linear-gradient(to bottom,${T.success},#16A34A)`, transform: "translateX(-50%)", zIndex: 1, borderRadius: 99, transition: "height 0.5s ease" }} />
                            )}

                            {/* Add before first */}
                            {canEdit && (!submitted || editingMode) && addingAfter !== -1 && (
                                <div style={{ position: "relative", zIndex: 2, marginBottom: 10 }}>
                                    <AddBtn onClick={() => onAddBetween(-1)} />
                                </div>
                            )}
                            {addingAfter === -1 && (
                                <div style={{ position: "relative", zIndex: 2, marginBottom: 14 }}>
                                    <FlowEditBox idx={0} comp={{}} isNew onSave={(d) => onSaveNew(-1, d)} onCancel={onCancelAdd} existingDeadlines={components.map(c => ({ heading: c.heading, deadline: c.deadline }))} />
                                </div>
                            )}

                            {components.map((comp, i) => {
                                const isDone = comp.status === "done";
                                const isLeft = i % 2 === 0;
                                const isEditing = editingIdx === i;

                                return (
                                    <div key={comp.id} className={`gt-tl-item ${isLeft ? "left" : "right"}`} style={{ position: "relative", zIndex: 2 }}>
                                        {/* Node row */}
                                        <div className="gt-tl-row" style={{ display: "flex", alignItems: "flex-start" }}>
                                            {/* Left side */}
                                            <div className="gt-tl-side gt-tl-side-left" style={{ width: "calc(50% - 16px)", flexShrink: 0 }}>
                                                {isLeft && !isEditing && (
                                                    <NodeCard comp={comp} idx={i} isDone={isDone} canEdit={canEdit} isHead={isHead} taskId={taskId}
                                                        onEdit={() => onEdit(i)} onDelete={() => onDelete(i)}
                                                        onMarkDone={() => onMarkDone(i)} onMarkUndo={() => onMarkUndo(i)}
                                                        onPendingApproval={() => onPendingApproval(i)} onReject={() => onReject(i)}
                                                        onReportSubmitted={onRefresh} />
                                                )}
                                            </div>

                                            {/* Center dot */}
                                            <div className="gt-tl-dot-wrap" style={{ width: 32, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: 14 }}>
                                                <div style={{
                                                    width: 18, height: 18, borderRadius: "50%",
                                                    background: isDone ? T.success : "#fff",
                                                    border: `2.5px solid ${isDone ? "#16A34A" : T.primary}`,
                                                    boxShadow: `0 0 0 4px #fff, 0 0 0 6px ${isDone ? "rgba(34,197,94,0.2)" : "rgba(99,102,241,0.15)"}`,
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    zIndex: 5, position: "relative",
                                                }}>
                                                    {isDone && <span style={{ fontSize: 8, color: "#fff", fontWeight: 900 }}>✔</span>}
                                                </div>
                                            </div>

                                            {/* Right side */}
                                            <div className="gt-tl-side gt-tl-side-right" style={{ flex: 1, minWidth: 0 }}>
                                                {!isLeft && !isEditing && (
                                                    <NodeCard comp={comp} idx={i} isDone={isDone} canEdit={canEdit} isHead={isHead} taskId={taskId}
                                                        onEdit={() => onEdit(i)} onDelete={() => onDelete(i)}
                                                        onMarkDone={() => onMarkDone(i)} onMarkUndo={() => onMarkUndo(i)}
                                                        onPendingApproval={() => onPendingApproval(i)} onReject={() => onReject(i)}
                                                        onReportSubmitted={onRefresh} />
                                                )}
                                            </div>
                                        </div>

                                        {/* Edit form */}
                                        {isEditing && (
                                            <div style={{ position: "relative", zIndex: 3, marginTop: 10, marginBottom: 4 }}>
                                                <FlowEditBox idx={i} comp={comp} isNew={false} onSave={(d) => onSaveEdit(i, d)} onCancel={onCancelEdit} existingDeadlines={components.map(c => ({ heading: c.heading, deadline: c.deadline }))} />
                                            </div>
                                        )}

                                        {/* Add after */}
                                        <div style={{ position: "relative", zIndex: 2, margin: "10px 0" }}>
                                            {addingAfter === i
                                                ? <FlowEditBox idx={i + 1} comp={{}} isNew onSave={(d) => onSaveNew(i, d)} onCancel={onCancelAdd} existingDeadlines={components.map(c => ({ heading: c.heading, deadline: c.deadline }))} />
                                                : canEdit && (!submitted || editingMode)
                                                    ? <AddBtn onClick={() => onAddBetween(i)} />
                                                    : <div style={{ height: 6 }} />
                                            }
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ════════════════════════════════════
   COMPONENT SETTINGS PANEL (CEO/TL)
   Edit % and points per component
════════════════════════════════════ */
function ComponentSettingsPanel({ components, onSave, onClose }) {
    const [local, setLocal] = useState(() => components.map(c => ({ ...c, percentage: c.percentage ?? 0, points: c.points ?? 0, locked: c.locked ?? false })));
    const [err, setErr] = useState("");

    const totalPct = local.reduce((s, c) => s + Number(c.percentage), 0);

    const handlePctChange = (idx, val) => {
        if (local[idx].locked || local[idx].status === "done") return;
        const newPct = Math.max(0, Math.min(100, Number(val) || 0));
        // Only redistribute among unlocked, non-done components
        const lockedTotal = local.reduce((s, c, i) => i !== idx && (c.locked || c.status === "done") ? s + Number(c.percentage) : s, 0);
        const remaining = +(100 - newPct - lockedTotal).toFixed(2);
        const freeIdxs = local.map((c, i) => i).filter(i => i !== idx && !local[i].locked && local[i].status !== "done");
        const perFree = freeIdxs.length > 0 ? +(remaining / freeIdxs.length).toFixed(2) : 0;
        setLocal(prev => prev.map((c, i) => {
            if (i === idx) return { ...c, percentage: newPct };
            if (c.locked || c.status === "done") return c;
            const isLast = i === freeIdxs[freeIdxs.length - 1];
            return { ...c, percentage: isLast ? +(remaining - perFree * (freeIdxs.length - 1)).toFixed(2) : perFree };
        }));
        setErr("");
    };

    const handlePointsChange = (idx, val) => {
        const pts = Math.max(0, Number(val) || 0);
        setLocal(prev => prev.map((c, i) => i === idx ? { ...c, points: pts } : c));
    };

    const toggleLock = (idx) => {
        setLocal(prev => prev.map((c, i) => i === idx ? { ...c, locked: !c.locked } : c));
    };

    const handleSave = () => {
        const total = local.reduce((s, c) => s + Number(c.percentage), 0);
        if (Math.abs(total - 100) > 0.5) { setErr(`Percentages must sum to 100%. Current: ${total.toFixed(2)}%`); return; }
        onSave(local);
    };

    return (
        <Modal>
            <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
                <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 -8px 40px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>

                    {/* Handle */}
                    <div style={{ width: 40, height: 4, background: T.border, borderRadius: 99, margin: "12px auto 0" }} />

                    {/* Header */}
                    <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>⚙️ Component Settings</div>
                            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>Adjust % completion weight and reward points per component</div>
                        </div>
                        <button onClick={onClose} style={{ ...btn("ghost"), width: 32, height: 32, padding: 0 }}>✕</button>
                    </div>

                    {/* Total % indicator */}
                    <div style={{ padding: "8px 20px", background: Math.abs(totalPct - 100) > 0.5 ? T.dangerBg : T.successBg, borderBottom: `1px solid ${Math.abs(totalPct - 100) > 0.5 ? T.dangerBorder : T.successBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: Math.abs(totalPct - 100) > 0.5 ? T.danger : "#166534" }}>
                            Total: {totalPct.toFixed(2)}% {Math.abs(totalPct - 100) <= 0.5 ? "✅" : "⚠️ Must equal 100%"}
                        </span>
                        <span style={{ fontSize: 11, color: T.textMuted }}>{local.length} components</span>
                    </div>

                    {/* Column headers */}
                    <div style={{ padding: "8px 20px", display: "grid", gridTemplateColumns: "1fr 90px 90px 40px", gap: 8, background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Component</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>% Weight</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>Points</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>Lock</span>
                    </div>

                    {/* Component rows */}
                    <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {local.map((c, i) => {
                            const isDone = c.status === "done";
                            const isLocked = c.locked || isDone;
                            return (
                                <div key={c.id || i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 40px", gap: 8, alignItems: "center", padding: "10px 12px", background: isDone ? T.successBg : isLocked ? "#FFFBEB" : "#fff", border: `1px solid ${isDone ? T.successBorder : isLocked ? T.warningBorder : T.border}`, borderRadius: 10 }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {isDone ? "✅ " : isLocked ? "🔒 " : ""}{c.heading}
                                        </div>
                                        {isDone && <div style={{ fontSize: 10, color: "#166534", fontWeight: 600 }}>Completed — locked</div>}
                                        {!isDone && isLocked && <div style={{ fontSize: 10, color: "#92400E", fontWeight: 600 }}>% locked — click 🔓 to unlock</div>}
                                    </div>
                                    <div style={{ textAlign: "center" }}>
                                        {isDone
                                            ? <span style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>{Number(c.percentage).toFixed(1)}%</span>
                                            : <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                <input type="number" value={c.percentage} min="0" max="100" step="0.1"
                                                    disabled={isLocked}
                                                    onChange={e => handlePctChange(i, e.target.value)}
                                                    style={{ width: "100%", padding: "6px 8px", border: `1.5px solid ${isLocked ? T.warningBorder : T.border}`, borderRadius: 7, fontSize: 12, fontWeight: 700, color: isLocked ? "#92400E" : T.text, fontFamily: "inherit", textAlign: "center", outline: "none", background: isLocked ? "#FFFBEB" : "#fff", cursor: isLocked ? "not-allowed" : "text" }}
                                                    onFocus={e => { if (!isLocked) e.target.style.borderColor = T.primary; }}
                                                    onBlur={e => e.target.style.borderColor = isLocked ? T.warningBorder : T.border}
                                                />
                                                <span style={{ fontSize: 11, color: T.textMuted, flexShrink: 0 }}>%</span>
                                            </div>
                                        }
                                    </div>
                                    <div style={{ textAlign: "center" }}>
                                        {isDone
                                            ? <span style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>{c.points || 0} pts</span>
                                            : <input type="number" value={c.points || 0} min="0" step="1"
                                                onChange={e => handlePointsChange(i, e.target.value)}
                                                placeholder="0"
                                                style={{ width: "100%", padding: "6px 8px", border: `1.5px solid ${T.border}`, borderRadius: 7, fontSize: 12, fontWeight: 700, color: "#7E22CE", fontFamily: "inherit", textAlign: "center", outline: "none" }}
                                                onFocus={e => e.target.style.borderColor = "#9333EA"}
                                                onBlur={e => e.target.style.borderColor = T.border}
                                            />
                                        }
                                    </div>
                                    <div style={{ textAlign: "center" }}>
                                        {!isDone && (
                                            <button onClick={() => toggleLock(i)}
                                                title={isLocked ? "Unlock %" : "Lock %"}
                                                style={{ width: 30, height: 30, borderRadius: 7, border: `1.5px solid ${isLocked ? T.warningBorder : T.border}`, background: isLocked ? T.warningBg : "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                {isLocked ? "🔒" : "🔓"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {err && <div style={{ margin: "0 20px 8px", padding: "10px 12px", background: T.dangerBg, border: `1px solid ${T.dangerBorder}`, borderRadius: 8, fontSize: 11, color: T.danger, fontWeight: 600 }}>{err}</div>}

                    {/* Footer */}
                    <div style={{ padding: "12px 20px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 10 }}>
                        <button onClick={onClose} style={{ ...btn("ghost"), flex: 1, padding: "12px" }}>Cancel</button>
                        <button onClick={handleSave} style={{ ...btn("primary"), flex: 2, padding: "12px", fontSize: 13, fontWeight: 700 }}>Save Settings</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

/* ════════════════════════════════════
   ACTIVITIES SECTION (state container)
════════════════════════════════════ */
function ActivitiesSection({ task, isAssignee, isCEO, isTL }) {
    const [components, setComponents] = useState([]);
    const [editingIdx, setEditingIdx] = useState(null);
    const [addingAfter, setAddingAfter] = useState(null);
    const [submitted, setSubmitted] = useState(false);
    const [submittedAt, setSubmittedAt] = useState(null);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saveErr, setSaveErr] = useState("");
    const [editingMode, setEditingMode] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const seenKey = `history_seen_${task?.taskId}`;
    const [seenCount, setSeenCountRaw] = useState(() => {
        try { return parseInt(localStorage.getItem(seenKey) || "0", 10) || 0; } catch { return 0; }
    });
    const handleSeen = (n) => { setSeenCountRaw(n); try { localStorage.setItem(seenKey, String(n)); } catch { } };

    const canEdit = isAssignee || isCEO || isTL;
    const isHead = isCEO || isTL;

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            const res = await fetch(`${BASE}/cowork/task/${task.taskId}/goal-activities`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error();
            const d = await res.json();
            setComponents(d.activities || []);
            setSubmitted(d.submitted || false);
            setSubmittedAt(d.submittedAt || null);
        } catch { }
        finally { setLoading(false); }
    }, [task.taskId]);

    useEffect(() => { load(); }, [load]);

    const persist = useCallback(async (comps, isSubmit, submitTime) => {
        setSaving(true); setSaveErr("");
        try {
            const token = await getToken();
            const sVal = isSubmit !== undefined ? isSubmit : submitted;
            const res = await fetch(`${BASE}/cowork/task/${task.taskId}/goal-activities`, {
                method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ activities: comps, submitted: sVal, submittedAt: submitTime || submittedAt }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Save failed"); }
        } catch (e) { setSaveErr(e.message); }
        finally { setSaving(false); }
    }, [task.taskId, submitted, submittedAt]);

    const genId = () => `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const handleSaveNew = (afterIdx, data) => {
        const now = fmtDatetime(new Date().toISOString());
        const entry = {
            type: "created", label: "Component Created", at: now, by: null, changes: [
                { field: "Heading", to: data.heading },
                { field: "Description", to: data.description },
                { field: "Deadline", to: fmtDatetime(data.deadline) },
            ]
        };
        const newComp = { id: genId(), ...data, status: "pending", points: 0, createdByRole: isHead ? "head" : "employee", createdAt: now, history: [entry] };
        const updated = [...components];
        updated.splice(afterIdx + 1, 0, newComp);
        const withPct = distributeEqual(updated); // auto-distribute equally
        setComponents(withPct); setAddingAfter(null);
        persist(withPct, submitted);
    };

    const handleSaveEdit = (idx, data) => {
        const now = fmtDatetime(new Date().toISOString());
        const prev = components[idx];
        const changes = [];
        if (prev.heading !== data.heading) changes.push({ field: "Heading", from: prev.heading, to: data.heading });
        if (prev.description !== data.description) changes.push({ field: "Description", from: prev.description, to: data.description });
        if (prev.deadline !== data.deadline) changes.push({ field: "Deadline", from: fmtDatetime(prev.deadline), to: fmtDatetime(data.deadline) });
        const entry = { type: "edited", label: "Component Edited", at: now, by: null, changes };
        const updated = components.map((c, i) => i === idx ? { ...c, ...data, editedAt: now, history: [...(c.history || []), entry] } : c);
        setComponents(updated); setEditingIdx(null);
        persist(updated, submitted);
    };

    const handleDelete = (idx) => {
        const updated = components.filter((_, i) => i !== idx);
        const withPct = distributeEqual(updated); // re-distribute equally
        setComponents(withPct);
        if (editingIdx === idx) setEditingIdx(null);
        if (addingAfter === idx) setAddingAfter(null);
        persist(withPct, submitted);
    };

    const handleDeleteAll = async () => {
        setComponents([]); setSubmitted(false); setSubmittedAt(null);
        setEditingIdx(null); setAddingAfter(null); setSaveErr(""); setEditingMode(false);
        await persist([], false, null);
    };

    const handleMarkDone = async (idx) => {
        const now = fmtDatetime(new Date().toISOString());
        const comp = components[idx];
        const entry = { type: "done", label: "Approved & Marked Done", at: now, by: null, changes: [] };
        const u = components.map((c, i) => i === idx ? { ...c, status: "done", doneAt: now, history: [...(c.history || []), entry] } : c);
        setComponents(u); persist(u, submitted);

        // Award points if component has points set
        const pts = comp.points || 0;
        if (pts > 0) {
            try {
                const token = await getToken();
                const assigneeId = (task.assigneeIds || [])[0];
                if (assigneeId) {
                    const creditRes = await fetch(`${BASE}/cowork/sop/goal-credit`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({
                            targetEmployeeId: assigneeId,
                            points: pts,
                            componentName: comp.heading,
                            taskTitle: task.title,
                            taskId: task.taskId,
                            componentId: comp.id,
                        }),
                    });
                    if (!creditRes.ok) {
                        const errData = await creditRes.json().catch(() => ({}));
                        console.error("[goal-credit] failed:", creditRes.status, errData);
                    } else {
                        console.log(`[goal-credit] +${pts} pts awarded to ${assigneeId}`);
                    }
                }
            } catch (e) { console.error("[goal-credit]", e.message); }
        }
    };

    // Called when employee submits report — backend already saved report data
    // Just reload from backend to get the updated component with report data
    const handlePendingApproval = async (idx) => {
        await load(); // reload fresh from Firestore — preserves report data
    };

    // Called when TL/CEO rejects — resets to pending so employee can resubmit
    const handleReject = (idx) => {
        const now = fmtDatetime(new Date().toISOString());
        const entry = { type: "rejected", label: "Report Rejected — Back to Pending", at: now, by: null, changes: [] };
        const u = components.map((c, i) => i === idx ? { ...c, status: "pending", reportSubmitted: false, report: null, history: [...(c.history || []), entry] } : c);
        setComponents(u); persist(u, submitted);
    };

    const handleMarkUndo = (idx) => {
        const now = fmtDatetime(new Date().toISOString());
        const prev = components[idx];
        const entry = { type: "undone", label: "Done Undone", at: now, by: null, changes: [] };
        const u = components.map((c, i) => i === idx ? { ...c, status: "pending", doneAt: null, history: [...(c.history || []), entry] } : c);
        setComponents(u); persist(u, submitted);
    };

    const handleFinalSubmit = async () => {
        if (!components.length || editingIdx !== null || addingAfter !== null) { setSaveErr("Save or cancel open component first."); return; }
        const now = fmtDatetime(new Date().toISOString());
        setSubmitted(true); setSubmittedAt(now);
        await persist(components, true, now);
    };

    const handleSaveSettings = (updated) => {
        setComponents(updated);
        setShowSettings(false);
        persist(updated, submitted);
    };

    if (loading) return (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{ width: 32, height: 32, border: `3px solid ${T.border}`, borderTopColor: T.primary, borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ fontSize: 12, color: T.textMuted }}>Loading activities…</div>
        </div>
    );

    const doneCount = components.filter(c => c.status === "done").length;

    return (
        <div className="gt-activities-wrap" style={{ padding: "14px 14px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <style>{`
                @media (max-width: 640px) {
                    .gt-activities-wrap { padding: 10px 10px 20px !important; gap: 10px !important; }
                }
            `}</style>

            {/* Settings panel */}
            {showSettings && components.length > 0 && (
                <ComponentSettingsPanel
                    components={components}
                    onSave={handleSaveSettings}
                    onClose={() => setShowSettings(false)}
                />
            )}

            {/* CEO/TL settings button */}
            {(isCEO || isTL) && components.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => setShowSettings(true)} style={{ ...btn("default"), padding: "7px 14px", fontSize: 11, gap: 6 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                        </svg>
                        % &amp; Points Settings
                    </button>
                </div>
            )}
            <InteractiveFlowchart
                components={components} editingIdx={editingIdx} addingAfter={addingAfter}
                submitted={submitted} canEdit={canEdit} isHead={isHead} editingMode={editingMode}
                taskId={task.taskId}
                seenCount={seenCount} onSeen={handleSeen}
                onEdit={(i) => { setEditingIdx(i); setAddingAfter(null); }}
                onDelete={handleDelete} onMarkDone={handleMarkDone} onMarkUndo={handleMarkUndo}
                onPendingApproval={handlePendingApproval} onReject={handleReject}
                onAddBetween={(i) => { setAddingAfter(i); setEditingIdx(null); }}
                onSaveNew={handleSaveNew} onSaveEdit={handleSaveEdit}
                onCancelEdit={() => setEditingIdx(null)} onCancelAdd={() => setAddingAfter(null)}
                onDeleteAll={handleDeleteAll} onToggleEditMode={() => setEditingMode(m => !m)}
                onRefresh={load}
            />

            {/* Final submit */}
            {!submitted && canEdit && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {saveErr && (
                        <div style={{ padding: "10px 14px", background: T.dangerBg, border: `1px solid ${T.dangerBorder}`, borderRadius: 9, fontSize: 11, color: T.danger, fontWeight: 600 }}>
                            ⚠️ {saveErr}
                        </div>
                    )}
                    <button disabled={!components.length || saving} onClick={handleFinalSubmit}
                        style={{
                            width: "100%", padding: "13px 16px", border: "none", borderRadius: 12,
                            background: !components.length || saving ? T.border : `linear-gradient(135deg,${T.primary},${T.primaryDark})`,
                            color: !components.length || saving ? T.textMuted : "#fff",
                            fontSize: 13, fontWeight: 800, cursor: !components.length || saving ? "not-allowed" : "pointer",
                            fontFamily: "inherit",
                            boxShadow: components.length && !saving ? "0 4px 16px rgba(99,102,241,0.35)" : "none",
                            transition: "all 0.2s", letterSpacing: "-0.2px",
                        }}>
                        {saving ? "Saving…" : "🚀 Final Submit"}
                    </button>
                    {!components.length && <div style={{ fontSize: 11, color: T.textLight, textAlign: "center" }}>Add at least one component to submit</div>}
                </div>
            )}

            {/* Submitted banner */}
            {submitted && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: T.successBg, border: `1.5px solid ${T.successBorder}`, borderRadius: 12, boxShadow: "0 2px 8px rgba(34,197,94,0.1)" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>✅</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>Activities Submitted</div>
                        <div style={{ fontSize: 11, color: "#4ADE80", marginTop: 2 }}>
                            {doneCount}/{components.length} completed · {submittedAt && fmtReadable(submittedAt)}
                        </div>
                    </div>
                </div>
            )}
            {saveErr && submitted && (
                <div style={{ padding: "10px 14px", background: T.dangerBg, border: `1px solid ${T.dangerBorder}`, borderRadius: 9, fontSize: 11, color: T.danger, fontWeight: 600 }}>⚠️ {saveErr}</div>
            )}
        </div>
    );
}

export default function GoalTask({ task, isAssignee, isCEO, isTL, onRefresh }) {
    return (
        <div style={{ height: "100%", overflowY: "auto" }}>
            <ActivitiesSection task={task} isAssignee={isAssignee} isCEO={isCEO} isTL={isTL} />
        </div>
    );
}