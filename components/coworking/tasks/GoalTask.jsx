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
    const r = comp.report;
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
   FLOW EDIT BOX
════════════════════════════════════ */
function FlowEditBox({ idx, comp, onSave, onCancel, isNew }) {
    const [heading, setHeading] = useState(comp.heading || "");
    const [description, setDescription] = useState(comp.description || "");
    const [deadline, setDeadline] = useState(comp.deadline || "");
    const ref = useRef(null);
    useEffect(() => { if (isNew) ref.current?.focus(); }, [isNew]);
    const canSave = heading.trim() && description.trim() && deadline;

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
                <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} style={inp()}
                    onFocus={e => e.target.style.borderColor = T.primary} onBlur={e => e.target.style.borderColor = T.border} />
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
function NodeCard({ comp, idx, isDone, canEdit, isHead, taskId, onEdit, onDelete, onMarkDone, onMarkUndo, onReportSubmitted }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [showSubmit, setShowSubmit] = useState(false);
    const [showView, setShowView] = useState(false);
    const [showUndoConfirm, setShowUndoConfirm] = useState(false);
    const reportSubmitted = comp.reportSubmitted;

    return (
        <>
            {showSubmit && <SubmitReportModal comp={comp} idx={idx} taskId={taskId} onSuccess={() => { setShowSubmit(false); onMarkDone(); onReportSubmitted(); }} onCancel={() => setShowSubmit(false)} />}
            {showView && <ViewReportModal comp={comp} idx={idx} onClose={() => setShowView(false)} />}
            {showUndoConfirm && (
                <ConfirmModal
                    icon="↩️" title="Undo Done?" confirmLabel="Yes, Undo" confirmVariant="amber"
                    desc={`<b>"${comp.heading}"</b> was marked done${comp.doneAt ? ` on ${fmtReadable(comp.doneAt)}` : ""}. Undo?`}
                    onConfirm={() => { setShowUndoConfirm(false); onMarkUndo(); }} onCancel={() => setShowUndoConfirm(false)} />
            )}

            <div style={{
                background: isDone ? "#F0FDF4" : "#fff",
                border: `1.5px solid ${isDone ? T.successBorder : T.border}`,
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
                    background: isDone ? T.successBg : "#F1F5F9",
                    border: `1px solid ${isDone ? T.successBorder : T.border}`,
                }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: isDone ? "#22C55E" : "#94A3B8" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: isDone ? "#166534" : "#64748B" }}>{isDone ? "DONE" : "PENDING"}</span>
                    {isDone && comp.doneAt && <span style={{ fontSize: 9, color: "#4ADE80", fontWeight: 600 }}>· {fmtReadable(comp.doneAt)}</span>}
                </div>

                {/* Report submitted badge */}
                {reportSubmitted && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: "#1D4ED8" }}>
                            <span>📋</span> Report submitted · {comp.report?.submittedBy}
                        </div>
                        <button onClick={() => setShowView(true)} style={{ fontSize: 10, fontWeight: 700, color: T.primary, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>View →</button>
                    </div>
                )}

                {/* Content */}
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4, lineHeight: 1.4, paddingRight: 36 }}>{comp.heading}</div>
                <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.6, marginBottom: 8, whiteSpace: "pre-wrap" }}>{comp.description}</div>

                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: T.textMuted, fontWeight: 600, marginBottom: (comp.createdAt || comp.editedAt) ? 5 : 0 }}>
                    <span>🕐</span>
                    <span>{fmtReadable(comp.deadline)}</span>
                </div>

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
                        {isHead && reportSubmitted && (
                            <button onClick={() => { setMenuOpen(false); setShowView(true); }}
                                style={{ ...btn("ghost"), padding: "8px 10px", fontSize: 11, color: T.primary, borderColor: "#BFDBFE", background: "#EFF6FF" }}>
                                👁 View Submitted Report
                            </button>
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
    onEdit, onDelete, onMarkDone, onMarkUndo,
    onAddBetween, onSaveNew, onSaveEdit, onCancelEdit, onCancelAdd,
    onDeleteAll, onToggleEditMode, onRefresh,
}) {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const progressPct = getProgressPct(components);
    const totalEvents = components.reduce((s, c) => s + (c.history?.length || 0), 0);
    const unseen = Math.max(0, totalEvents - seenCount);

    return (
        <>
            {showDeleteConfirm && (
                <ConfirmModal icon="🗑️" title="Delete entire roadmap?" confirmLabel="Yes, Delete All" confirmVariant="danger"
                    desc="This permanently removes all components and cannot be undone."
                    onConfirm={() => { setShowDeleteConfirm(false); onDeleteAll(); }} onCancel={() => setShowDeleteConfirm(false)} />
            )}
            {showHistory && <HistoryPanel components={components} onClose={() => setShowHistory(false)} />}

            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden", boxShadow: T.shadow }}>
                {/* ── Header ── */}
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: T.bg }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 18 }}>⭐</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: "-0.2px" }}>Goal Roadmap</span>
                        {components.length > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, background: "#FEF3C7", color: "#92400E", padding: "3px 8px", borderRadius: 99, border: "1px solid #FDE68A" }}>
                                {components.length} component{components.length !== 1 ? "s" : ""}
                            </span>
                        )}
                        {/* Progress */}
                        {components.length > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: progressPct === 100 ? "#166534" : "#64748B", background: progressPct === 100 ? T.successBg : T.bg, padding: "3px 8px", borderRadius: 99, border: `1px solid ${progressPct === 100 ? T.successBorder : T.border}` }}>
                                {progressPct}% done
                            </span>
                        )}
                    </div>

                    {/* Right controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {submitted && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 99, background: T.successBg, border: `1px solid ${T.successBorder}`, fontSize: 10, fontWeight: 700, color: "#166534" }}>
                                ✅ Submitted
                            </div>
                        )}

                        {/* History button */}
                        {components.length > 0 && (
                            <button onClick={() => { setShowHistory(true); onSeen(totalEvents); }}
                                style={{ ...btn("ghost"), padding: "5px 10px", fontSize: 10, gap: 5, position: "relative", borderColor: unseen > 0 ? T.primary : T.border, color: unseen > 0 ? T.primary : T.textMuted, background: unseen > 0 ? "#EEF2FF" : "#fff" }}>
                                🕐 History
                                <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 99, background: unseen > 0 ? T.primary : T.border, color: "#fff", lineHeight: 1.4 }}>
                                    {unseen}
                                </span>
                            </button>
                        )}

                        {/* Edit mode toggle (after submit, assignee only) */}
                        {submitted && canEdit && (
                            <button onClick={onToggleEditMode}
                                style={{ ...btn(editingMode ? "danger" : "ghost"), padding: "5px 10px", fontSize: 10 }}>
                                {editingMode ? "🔒 Lock" : "✏️ Edit"}
                            </button>
                        )}

                        {/* Delete all */}
                        {canEdit && components.length > 0 && (
                            <button onClick={() => setShowDeleteConfirm(true)}
                                style={{ ...btn("ghost"), padding: "5px 10px", fontSize: 10, color: T.danger, borderColor: T.dangerBorder, background: T.dangerBg }}>
                                🗑
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Progress bar ── */}
                {components.length > 0 && (
                    <div style={{ height: 3, background: T.bg }}>
                        <div style={{ height: "100%", width: `${progressPct}%`, background: `linear-gradient(to right,${T.success},#16A34A)`, transition: "width 0.5s ease", borderRadius: "0 99px 99px 0" }} />
                    </div>
                )}

                {/* ── Body ── */}
                <div style={{ padding: "16px" }}>
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
                        <FlowEditBox idx={0} comp={{}} isNew onSave={(d) => onSaveNew(-1, d)} onCancel={onCancelAdd} />
                    )}

                    {components.length > 0 && (
                        <div style={{ position: "relative" }}>
                            {/* Base line */}
                            <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: T.border, transform: "translateX(-50%)", zIndex: 0, borderRadius: 99 }} />
                            {/* Progress line */}
                            {progressPct > 0 && (
                                <div style={{ position: "absolute", left: "50%", top: 0, height: `${progressPct}%`, width: 2, background: `linear-gradient(to bottom,${T.success},#16A34A)`, transform: "translateX(-50%)", zIndex: 1, borderRadius: 99, transition: "height 0.5s ease" }} />
                            )}

                            {/* Add before first */}
                            {canEdit && (!submitted || editingMode) && addingAfter !== -1 && (
                                <div style={{ position: "relative", zIndex: 2, marginBottom: 10 }}>
                                    <AddBtn onClick={() => onAddBetween(-1)} />
                                </div>
                            )}
                            {addingAfter === -1 && (
                                <div style={{ position: "relative", zIndex: 2, marginBottom: 14 }}>
                                    <FlowEditBox idx={0} comp={{}} isNew onSave={(d) => onSaveNew(-1, d)} onCancel={onCancelAdd} />
                                </div>
                            )}

                            {components.map((comp, i) => {
                                const isDone = comp.status === "done";
                                const isLeft = i % 2 === 0;
                                const isEditing = editingIdx === i;

                                return (
                                    <div key={comp.id} style={{ position: "relative", zIndex: 2 }}>
                                        {/* Node row */}
                                        <div style={{ display: "flex", alignItems: "flex-start" }}>
                                            {/* Left side */}
                                            <div style={{ width: "calc(50% - 16px)", flexShrink: 0 }}>
                                                {isLeft && !isEditing && (
                                                    <NodeCard comp={comp} idx={i} isDone={isDone} canEdit={canEdit} isHead={isHead} taskId={taskId}
                                                        onEdit={() => onEdit(i)} onDelete={() => onDelete(i)}
                                                        onMarkDone={() => onMarkDone(i)} onMarkUndo={() => onMarkUndo(i)}
                                                        onReportSubmitted={onRefresh} />
                                                )}
                                            </div>

                                            {/* Center dot */}
                                            <div style={{ width: 32, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: 14 }}>
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
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                {!isLeft && !isEditing && (
                                                    <NodeCard comp={comp} idx={i} isDone={isDone} canEdit={canEdit} isHead={isHead} taskId={taskId}
                                                        onEdit={() => onEdit(i)} onDelete={() => onDelete(i)}
                                                        onMarkDone={() => onMarkDone(i)} onMarkUndo={() => onMarkUndo(i)}
                                                        onReportSubmitted={onRefresh} />
                                                )}
                                            </div>
                                        </div>

                                        {/* Edit form */}
                                        {isEditing && (
                                            <div style={{ position: "relative", zIndex: 3, marginTop: 10, marginBottom: 4 }}>
                                                <FlowEditBox idx={i} comp={comp} isNew={false} onSave={(d) => onSaveEdit(i, d)} onCancel={onCancelEdit} />
                                            </div>
                                        )}

                                        {/* Add after */}
                                        <div style={{ position: "relative", zIndex: 2, margin: "10px 0" }}>
                                            {addingAfter === i
                                                ? <FlowEditBox idx={i + 1} comp={{}} isNew onSave={(d) => onSaveNew(i, d)} onCancel={onCancelAdd} />
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
        </>
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

    const seenKey = `history_seen_${task?.taskId}`;
    const [seenCount, setSeenCountRaw] = useState(() => {
        try { return parseInt(localStorage.getItem(seenKey) || "0", 10) || 0; } catch { return 0; }
    });
    const handleSeen = (n) => { setSeenCountRaw(n); try { localStorage.setItem(seenKey, String(n)); } catch { } };

    const canEdit = isAssignee;
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
        const newComp = { id: genId(), ...data, status: "pending", createdAt: now, history: [entry] };
        const updated = [...components];
        updated.splice(afterIdx + 1, 0, newComp);
        setComponents(updated); setAddingAfter(null);
        persist(updated, submitted);
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
        setComponents(updated);
        if (editingIdx === idx) setEditingIdx(null);
        if (addingAfter === idx) setAddingAfter(null);
        persist(updated, submitted);
    };

    const handleDeleteAll = async () => {
        setComponents([]); setSubmitted(false); setSubmittedAt(null);
        setEditingIdx(null); setAddingAfter(null); setSaveErr(""); setEditingMode(false);
        await persist([], false, null);
    };

    const handleMarkDone = (idx) => {
        const now = fmtDatetime(new Date().toISOString());
        const prev = components[idx];
        const entry = { type: "done", label: "Marked as Done", at: now, by: null, changes: [] };
        const u = components.map((c, i) => i === idx ? { ...c, status: "done", doneAt: now, history: [...(c.history || []), entry] } : c);
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

    if (loading) return (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{ width: 32, height: 32, border: `3px solid ${T.border}`, borderTopColor: T.primary, borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ fontSize: 12, color: T.textMuted }}>Loading activities…</div>
        </div>
    );

    const doneCount = components.filter(c => c.status === "done").length;

    return (
        <div style={{ padding: "14px 14px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <InteractiveFlowchart
                components={components} editingIdx={editingIdx} addingAfter={addingAfter}
                submitted={submitted} canEdit={canEdit} isHead={isHead} editingMode={editingMode}
                taskId={task.taskId}
                seenCount={seenCount} onSeen={handleSeen}
                onEdit={(i) => { setEditingIdx(i); setAddingAfter(null); }}
                onDelete={handleDelete} onMarkDone={handleMarkDone} onMarkUndo={handleMarkUndo}
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