"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/* ─── Portal wrapper — mounts on document.body, escapes all parent CSS ─── */
function Modal({ children }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;
    return createPortal(children, document.body);
}



async function getToken() {
    const { firebaseAuth } = await import("../../../lib/coworkFirebase");
    return firebaseAuth.currentUser?.getIdToken();
}

function fmtDatetime(dt) {
    if (!dt) return "—";
    const d = new Date(dt);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

/* ─── Upload file to Drive via backend ─── */
async function uploadFileToDrive(file) {
    const token = await getToken();
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/cowork/upload/pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Upload failed");
    return {
        name: file.name,
        driveUrl: d.viewUrl || d.url,
        downloadUrl: d.downloadUrl || d.url,
        mimeType: file.type,
        size: file.size,
    };
}

/* ─── Modals ─── */
function DeleteAllModal({ onConfirm, onCancel }) {
    return (
        <Modal><div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onCancel}>
            <div style={{ background: "#fff", borderRadius: 14, padding: "24px 22px", width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 14 }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 28, textAlign: "center" }}>🗑️</div>
                <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", marginBottom: 6 }}>Delete entire flowchart?</div>
                    <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>Permanently removes all components. Cannot be undone.</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={onCancel} style={{ flex: 1, padding: "9px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#fff", color: "#374151", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                    <button onClick={onConfirm} style={{ flex: 1, padding: "9px", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "#EF4444", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Yes, Delete All</button>
                </div>
            </div>
        </div></Modal>
    );
}

function MarkDoneModal({ compHeading, onConfirm, onCancel }) {
    return (
        <Modal><div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onCancel}>
            <div style={{ background: "#fff", borderRadius: 14, padding: "24px 22px", width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 14 }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 28, textAlign: "center" }}>✅</div>
                <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", marginBottom: 6 }}>Mark as Done?</div>
                    <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>Mark <b>"{compHeading}"</b> as completed?</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={onCancel} style={{ flex: 1, padding: "9px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#fff", color: "#374151", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                    <button onClick={onConfirm} style={{ flex: 1, padding: "9px", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "#22C55E", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>✔ Confirm Done</button>
                </div>
            </div>
        </div></Modal>
    );
}

/* ─── Submit Report Modal (Y fills in text + files) ─── */
function SubmitReportModal({ comp, idx, taskId, onSuccess, onCancel, compName }) {
    const [text, setText] = useState("");
    const [files, setFiles] = useState([]); // [{name, driveUrl, mimeType, size}]
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uploadErr, setUploadErr] = useState("");
    const fileRef = useRef(null);

    const handleFiles = async (e) => {
        const picked = Array.from(e.target.files || []);
        e.target.value = "";
        if (!picked.length) return;
        setUploading(true); setUploadErr("");
        try {
            const uploaded = await Promise.all(picked.map(f => uploadFileToDrive(f)));
            setFiles(prev => [...prev, ...uploaded]);
        } catch (err) { setUploadErr(err.message); }
        finally { setUploading(false); }
    };

    const handleSubmit = async () => {
        if (!text.trim() && !files.length) { setUploadErr("Add text or at least one file."); return; }
        setSubmitting(true); setUploadErr("");
        try {
            const token = await getToken();
            const res = await fetch(`${BASE}/cowork/task/${taskId}/goal-activity/${comp.id}/submit-report`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ text: text.trim(), files }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || "Failed");
            onSuccess();
        } catch (err) { setUploadErr(err.message); }
        finally { setSubmitting(false); }
    };

    const removeFile = (i) => setFiles(prev => prev.filter((_, fi) => fi !== i));

    function fileIcon(mime) {
        if (!mime) return "📄";
        if (mime.startsWith("image/")) return "🖼️";
        if (mime.includes("pdf")) return "📋";
        if (mime.includes("excel") || mime.includes("spreadsheet") || mime.includes("csv")) return "📊";
        if (mime.includes("word") || mime.includes("document")) return "📝";
        return "📄";
    }

    return (
        <Modal><div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
            <div style={{ background: "#fff", borderRadius: 16, padding: "22px 20px", width: "100%", maxWidth: 440, boxShadow: "0 12px 40px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", gap: 14, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1E293B", marginBottom: 4 }}>
                        ✔ Mark Done — Submit Report
                    </div>
                    <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.4 }}>
                        Submit <b>Component #{idx + 1}: "{comp.heading}"</b> report to mark as done
                    </div>
                </div>

                {/* Text */}
                <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Report / Notes</label>
                    <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Describe what was done, findings, notes..." rows={4}
                        style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                        onFocus={e => e.target.style.borderColor = "#F59E0B"}
                        onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
                </div>

                {/* File upload */}
                <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Attachments (images, PDF, Excel, Word, any file)</label>
                    <input ref={fileRef} type="file" multiple accept="*/*" onChange={handleFiles} style={{ display: "none" }} />
                    <button onClick={() => fileRef.current?.click()} disabled={uploading}
                        style={{ width: "100%", padding: "10px", border: "2px dashed #CBD5E1", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#F8FAFC", color: "#475569", cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                        {uploading ? "⏳ Uploading to Drive…" : "📎 Choose Files"}
                    </button>

                    {/* Uploaded files list */}
                    {files.length > 0 && (
                        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                            {files.map((f, fi) => (
                                <div key={fi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 7 }}>
                                    <span style={{ fontSize: 14 }}>{fileIcon(f.mimeType)}</span>
                                    <a href={f.driveUrl} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 11, color: "#1D4ED8", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</a>
                                    <button onClick={() => removeFile(fi)} style={{ padding: "2px 6px", border: "none", background: "none", color: "#94A3B8", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>✕</button>
                                </div>
                            ))}
                        </div>
                    )}
                    {uploadErr && <div style={{ fontSize: 11, color: "#DC2626", marginTop: 5 }}>{uploadErr}</div>}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={onCancel} style={{ flex: 1, padding: "10px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#fff", color: "#374151", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                    <button onClick={handleSubmit} disabled={submitting || uploading}
                        style={{ flex: 2, padding: "10px", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, background: submitting || uploading ? "#CBD5E1" : "#F59E0B", color: "#fff", cursor: submitting || uploading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                        {submitting ? "Submitting…" : "✔ Submit Report"}
                    </button>
                </div>
            </div>
        </div></Modal>
    );
}

/* ─── View Report Modal (X sees submitted report) ─── */
function ViewReportModal({ comp, idx, onClose }) {
    const r = comp.report;
    function fileIcon(mime) {
        if (!mime) return "📄";
        if (mime.startsWith("image/")) return "🖼️";
        if (mime.includes("pdf")) return "📋";
        if (mime.includes("excel") || mime.includes("spreadsheet") || mime.includes("csv")) return "📊";
        if (mime.includes("word") || mime.includes("document")) return "📝";
        return "📄";
    }
    return (
        <Modal><div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
            <div style={{ background: "#fff", borderRadius: 16, padding: "22px 20px", width: "100%", maxWidth: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", gap: 12, maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1E293B", marginBottom: 3 }}>📋 Submitted Report</div>
                    <div style={{ fontSize: 11, color: "#64748B" }}>Component #{idx + 1}: <b>{comp.heading}</b></div>
                    <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>By {r.submittedBy} · {fmtDatetime(r.submittedAt)}</div>
                </div>
                {r.text && (
                    <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                        {r.text}
                    </div>
                )}
                {r.files?.length > 0 && (
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Attachments ({r.files.length})</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {r.files.map((f, fi) => (
                                <a key={fi} href={f.driveUrl} target="_blank" rel="noreferrer"
                                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 7, textDecoration: "none" }}>
                                    <span style={{ fontSize: 16 }}>{fileIcon(f.mimeType)}</span>
                                    <span style={{ flex: 1, fontSize: 11, color: "#1D4ED8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                                    <span style={{ fontSize: 10, color: "#94A3B8" }}>↗</span>
                                </a>
                            ))}
                        </div>
                    </div>
                )}
                <button onClick={onClose} style={{ padding: "10px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#fff", color: "#374151", cursor: "pointer", fontFamily: "inherit" }}>Close</button>
            </div>
        </div></Modal>
    );
}


/* ─── History Modal ─── */
function HistoryModal({ components, onClose }) {
    const icons = {
        created: { icon: "🌱", color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC" },
        edited: { icon: "✏️", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
        done: { icon: "✅", color: "#166534", bg: "#DCFCE7", border: "#86EFAC" },
        undone: { icon: "↩️", color: "#92400E", bg: "#FEF3C7", border: "#FDE68A" },
        report: { icon: "📋", color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
    };

    // Flatten all history events, attach comp info + prevAt (timestamp of previous event on same comp)
    const allEvents = [];
    components.forEach((comp, ci) => {
        const hist = comp.history || [];
        hist.forEach((h, hi) => {
            const prevAt = hi > 0 ? hist[hi - 1].at : null; // time when the previous state was set
            allEvents.push({ ...h, compIdx: ci, compHeading: comp.heading, prevAt });
        });
    });
    // Sort newest first
    allEvents.sort((a, b) => (b.at > a.at ? 1 : -1));

    const totalChanges = allEvents.length;

    return (
        <Modal>
            <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
                <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden" }} onClick={e => e.stopPropagation()}>

                    {/* ── Fixed header ── */}
                    <div style={{ padding: "18px 20px 14px", borderBottom: "1.5px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: "#1E293B", display: "flex", alignItems: "center", gap: 8 }}>
                                🕐 Activity History
                                <span style={{ fontSize: 11, fontWeight: 700, background: "#F1F5F9", color: "#64748B", padding: "2px 8px", borderRadius: 99 }}>
                                    {totalChanges} event{totalChanges !== 1 ? "s" : ""}
                                </span>
                            </div>
                            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>All changes across {components.length} components</div>
                        </div>
                        <button onClick={onClose}
                            style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#64748B", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>
                            ✕
                        </button>
                    </div>

                    {/* ── Scrollable timeline ── */}
                    <div style={{ overflowY: "auto", padding: "16px 20px 20px", flex: 1 }}>
                        {totalChanges === 0 ? (
                            <div style={{ textAlign: "center", padding: "40px 0", fontSize: 13, color: "#94A3B8" }}>
                                <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
                                No history recorded yet.
                            </div>
                        ) : (
                            <div style={{ position: "relative" }}>
                                {/* vertical line */}
                                <div style={{ position: "absolute", left: 15, top: 0, bottom: 0, width: 2, background: "#E2E8F0", borderRadius: 99 }} />

                                {allEvents.map((h, i) => {
                                    const st = icons[h.type] || icons.edited;
                                    const isLast = i === allEvents.length - 1;
                                    return (
                                        <div key={i} style={{ display: "flex", gap: 14, marginBottom: isLast ? 0 : 20, position: "relative" }}>
                                            {/* Dot */}
                                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: st.bg, border: `2px solid ${st.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0, zIndex: 1, position: "relative" }}>
                                                {st.icon}
                                            </div>

                                            {/* Card */}
                                            <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
                                                {/* Top row: action + time */}
                                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                                                    <div>
                                                        <span style={{ fontSize: 12, fontWeight: 700, color: st.color }}>{h.label}</span>
                                                        <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: 6 }}>· {h.at}</span>
                                                    </div>
                                                </div>

                                                {/* Component tag */}
                                                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", background: "#F1F5F9", borderRadius: 99, fontSize: 10, fontWeight: 600, color: "#475569", marginBottom: h.changes?.length ? 8 : 0 }}>
                                                    Component #{h.compIdx + 1} — {h.compHeading}
                                                </div>

                                                {/* Changed fields */}
                                                {h.changes && h.changes.length > 0 && (
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                                                        {h.changes.map((ch, ci) => (
                                                            <div key={ci} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 10px" }}>
                                                                <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                                                    {ch.field}
                                                                </div>
                                                                {ch.from !== undefined && (
                                                                    <div style={{ background: "#FFF5F5", border: "1px solid #FECACA", borderRadius: 6, padding: "6px 8px", marginBottom: 5 }}>
                                                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                                                                            <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626" }}>◀ Before</span>
                                                                            {h.prevAt && <span style={{ fontSize: 9, color: "#94A3B8" }}>set on {h.prevAt}</span>}
                                                                        </div>
                                                                        <span style={{ fontSize: 11, color: "#DC2626", lineHeight: 1.5, wordBreak: "break-word" }}>{ch.from || "(empty)"}</span>
                                                                    </div>
                                                                )}
                                                                <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 6, padding: "6px 8px" }}>
                                                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                                                                        <span style={{ fontSize: 10, fontWeight: 700, color: "#16A34A" }}>{ch.from !== undefined ? "▶ After" : "▶ Set to"}</span>
                                                                        <span style={{ fontSize: 9, color: "#94A3B8" }}>changed on {h.at}</span>
                                                                    </div>
                                                                    <span style={{ fontSize: 11, color: "#166534", lineHeight: 1.5, wordBreak: "break-word" }}>{ch.to || "(empty)"}</span>
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
            </div>
        </Modal>
    );
}

/* ─── Inline edit form ─── */
function FlowEditBox({ idx, comp, onSave, onCancel, isNew }) {
    const [heading, setHeading] = useState(comp.heading || "");
    const [description, setDescription] = useState(comp.description || "");
    const [deadline, setDeadline] = useState(comp.deadline || "");
    const ref = useRef(null);
    useEffect(() => { if (isNew) ref.current?.focus(); }, [isNew]);
    const canSave = heading.trim() && description.trim() && deadline;
    const inp = { width: "100%", padding: "7px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none", background: "#fff", boxSizing: "border-box" };
    return (
        <div style={{ background: "#FFFDF0", border: "2px solid #F59E0B", borderRadius: 12, padding: "14px", display: "flex", flexDirection: "column", gap: 9, boxShadow: "0 2px 12px rgba(245,158,11,0.15)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#92400E", textTransform: "uppercase", letterSpacing: "0.08em" }}>✏️ Component #{idx + 1}</div>
            <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Heading *</label>
                <input ref={ref} value={heading} onChange={e => setHeading(e.target.value)} placeholder="What is this component about?" style={inp}
                    onFocus={e => e.target.style.borderColor = "#F59E0B"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
            </div>
            <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Description *</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what needs to be done..." rows={3}
                    style={{ ...inp, resize: "vertical" }}
                    onFocus={e => e.target.style.borderColor = "#F59E0B"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
            </div>
            <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Deadline *</label>
                <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} style={inp}
                    onFocus={e => e.target.style.borderColor = "#F59E0B"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <button disabled={!canSave} onClick={() => onSave({ heading: heading.trim(), description: description.trim(), deadline })}
                    style={{ flex: 1, padding: "8px", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700, fontFamily: "inherit", background: canSave ? "#F59E0B" : "#E5E7EB", color: canSave ? "#fff" : "#9CA3AF", cursor: canSave ? "pointer" : "not-allowed" }}>
                    ✓ Save
                </button>
                <button onClick={onCancel} style={{ padding: "8px 14px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, background: "#fff", color: "#6B7280", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
        </div>
    );
}

function TimelineAddBtn({ onClick }) {
    const [hov, setHov] = useState(false);
    return (
        <div style={{ display: "flex", justifyContent: "center", position: "relative", zIndex: 5 }}>
            <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
                style={{ background: hov ? "#FFFBEB" : "#fff", border: `2px dashed ${hov ? "#F59E0B" : "#FDE68A"}`, borderRadius: 99, padding: "4px 16px", fontSize: 11, fontWeight: 700, color: "#92400E", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s" }}>
                <span style={{ fontSize: 14 }}>+</span> Add component
            </button>
        </div>
    );
}

/* ─── Node card ─── */
function NodeCard({ comp, idx, isDone, canEdit, isHead, taskId, onEdit, onDelete, onMarkDone, onMarkUndo, onReportSubmitted }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [showUndoConfirm, setShowUndoConfirm] = useState(false);
    const [showSubmitReport, setShowSubmitReport] = useState(false);
    const [showViewReport, setShowViewReport] = useState(false);

    const reportSubmitted = comp.reportSubmitted;



    return (
        <>
            {showSubmitReport && (
                <SubmitReportModal comp={comp} idx={idx} taskId={taskId}
                    onSuccess={() => { setShowSubmitReport(false); onMarkDone(); onReportSubmitted(); }}
                    onCancel={() => setShowSubmitReport(false)} />
            )}
            {showViewReport && (
                <ViewReportModal comp={comp} idx={idx} onClose={() => setShowViewReport(false)} />
            )}
            {showUndoConfirm && (
                <Modal>
                    <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowUndoConfirm(false)}>
                        <div style={{ background: "#fff", borderRadius: 14, padding: "24px 22px", width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 14 }} onClick={e => e.stopPropagation()}>
                            <div style={{ fontSize: 28, textAlign: "center" }}>↩️</div>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", marginBottom: 6 }}>Undo Done?</div>
                                <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>
                                    <b>"{comp.heading}"</b> was already marked done{comp.doneAt ? ` on ${comp.doneAt}` : ""}. Are you sure you want to undo?
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => setShowUndoConfirm(false)} style={{ flex: 1, padding: "9px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#fff", color: "#374151", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                                <button onClick={() => { setShowUndoConfirm(false); onMarkUndo(); }} style={{ flex: 1, padding: "9px", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "#F59E0B", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Yes, Undo</button>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            <div style={{ background: isDone ? "#F0FDF4" : "#FFFDF0", border: `1.5px solid ${isDone ? "#86EFAC" : "#FDE68A"}`, borderRadius: 10, padding: "10px 12px", boxShadow: "0 1px 8px rgba(0,0,0,0.07)", position: "relative" }}>

                {/* ··· menu — top right, assignee or head */}
                {(canEdit || isHead) && (
                    <button onClick={() => setMenuOpen(o => !o)}
                        style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 6, border: "1.5px solid #E2E8F0", background: menuOpen ? "#F1F5F9" : "#fff", color: "#64748B", fontSize: 15, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", padding: 0 }}>
                        ···
                    </button>
                )}

                {/* Status badge */}
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99, marginBottom: 6, background: isDone ? "#DCFCE7" : "#FEF9C3", fontSize: 10, fontWeight: 700, color: isDone ? "#166534" : "#92400E" }}>
                    {isDone ? "✔ DONE" : "◻ PENDING"}
                    {isDone && comp.doneAt && <span style={{ fontSize: 9, opacity: 0.8, marginLeft: 2 }}>· {comp.doneAt}</span>}
                </div>

                {/* Report submitted badge */}
                {reportSubmitted && (
                    <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 6, padding: "5px 9px", marginBottom: 7, fontSize: 10, fontWeight: 700, color: "#166534", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>✅ Report submitted · {comp.report?.submittedBy}</span>
                        <button onClick={() => setShowViewReport(true)} style={{ fontSize: 10, fontWeight: 700, color: "#1D4ED8", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>View →</button>
                    </div>
                )}

                <div style={{ fontSize: 12, fontWeight: 700, color: "#1E293B", marginBottom: 3, lineHeight: 1.4, paddingRight: 30 }}>{comp.heading}</div>
                <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.5, marginBottom: 5, whiteSpace: "pre-wrap" }}>{comp.description}</div>
                <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4 }}>🕐 {fmtDatetime(comp.deadline)}</div>
                {(comp.createdAt || comp.editedAt) && (
                    <div style={{ fontSize: 9, color: "#94A3B8", display: "flex", flexDirection: "column", gap: 1 }}>
                        {comp.createdAt && <span>📌 Created {comp.createdAt}</span>}
                        {comp.editedAt && <span>✏️ Edited {comp.editedAt}</span>}
                    </div>
                )}

                {/* ··· menu open: show action buttons */}
                {menuOpen && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F1F5F9", display: "flex", flexDirection: "column", gap: 6 }}>
                        {/* Assignee actions */}
                        {canEdit && (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {/* Edit + Delete only when PENDING */}
                                {!isDone && (
                                    <>
                                        <button onClick={() => { setMenuOpen(false); onEdit(); }}
                                            style={{ flex: 1, padding: "6px 10px", border: "1.5px solid #CBD5E1", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "#fff", color: "#374151", cursor: "pointer", fontFamily: "inherit" }}>
                                            ✏️ Edit
                                        </button>
                                        <button onClick={() => { setMenuOpen(false); onDelete(); }}
                                            style={{ padding: "6px 10px", border: "1.5px solid #FECACA", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "#FFF5F5", color: "#DC2626", cursor: "pointer", fontFamily: "inherit" }}>
                                            🗑
                                        </button>
                                    </>
                                )}
                                {isDone
                                    ? <button onClick={() => { setMenuOpen(false); setShowUndoConfirm(true); }}
                                        style={{ flex: 1, padding: "6px 10px", border: "1.5px solid #A7F3D0", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "#F0FDF4", color: "#166534", cursor: "pointer", fontFamily: "inherit" }}>
                                        ↩ Undo
                                    </button>
                                    : <button onClick={() => { setMenuOpen(false); setShowSubmitReport(true); }}
                                        style={{ flex: 1, padding: "6px 10px", border: "1.5px solid #86EFAC", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#DCFCE7", color: "#166534", cursor: "pointer", fontFamily: "inherit" }}>
                                        ✔ Done
                                    </button>
                                }
                            </div>
                        )}

                        {/* Head (X) — view report if submitted */}
                        {isHead && reportSubmitted && (
                            <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => { setMenuOpen(false); setShowViewReport(true); }}
                                    style={{ flex: 1, padding: "6px 10px", border: "1.5px solid #BFDBFE", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#EFF6FF", color: "#1D4ED8", cursor: "pointer", fontFamily: "inherit" }}>
                                    👁 View Report
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}

/* ─── Progress line helper ─── */
function getProgressPct(components) {
    if (!components.length) return 0;
    let lastDoneIdx = -1;
    components.forEach((c, i) => { if (c.status === "done") lastDoneIdx = i; });
    if (lastDoneIdx === -1) return 0;
    return Math.round(((lastDoneIdx + 1) / components.length) * 100);
}

/* ─── Interactive flowchart ─── */
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

    return (
        <>
            {showDeleteConfirm && (
                <DeleteAllModal onConfirm={() => { setShowDeleteConfirm(false); onDeleteAll(); }} onCancel={() => setShowDeleteConfirm(false)} />
            )}
            {showHistory && (
                <HistoryModal components={components} onClose={() => setShowHistory(false)} />
            )}


            <div style={{ background: "#FAFAFA", border: "1.5px solid #E2E8F0", borderRadius: 12, padding: "16px 14px" }}>
                {/* Header */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 16 }}>⭐</span> Goal Roadmap
                    {components.length > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: "#FEF3C7", color: "#92400E", padding: "2px 7px", borderRadius: 99 }}>
                            {components.length} component{components.length !== 1 ? "s" : ""}
                        </span>
                    )}
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                        {submitted && <span style={{ fontSize: 10, fontWeight: 700, color: "#166534", background: "#DCFCE7", padding: "2px 8px", borderRadius: 99 }}>✅ Submitted</span>}
                        {submitted && canEdit && (
                            <button onClick={onToggleEditMode}
                                style={{ padding: "3px 10px", border: `1.5px solid ${editingMode ? "#FCA5A5" : "#FECACA"}`, borderRadius: 6, fontSize: 10, fontWeight: 700, background: editingMode ? "#EF4444" : "#FFF5F5", color: editingMode ? "#fff" : "#DC2626", cursor: "pointer", fontFamily: "inherit" }}>
                                {editingMode ? "🔒 Lock" : "✏️ Edit"}
                            </button>
                        )}
                        {components.length > 0 && (() => {
                            const totalEvents = components.reduce((sum, comp) => sum + (comp.history?.length || 0), 0);
                            const unseen = Math.max(0, totalEvents - seenCount);
                            return (
                                <button onClick={() => { setShowHistory(true); onSeen(totalEvents); }}
                                    style={{ padding: "3px 10px", border: `1.5px solid ${unseen > 0 ? "#6366F1" : "#E2E8F0"}`, borderRadius: 6, fontSize: 10, fontWeight: 700, background: unseen > 0 ? "#EEF2FF" : "#F8FAFC", color: unseen > 0 ? "#4338CA" : "#374151", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                                    🕐 History
                                    <span style={{ background: unseen > 0 ? "#6366F1" : "#CBD5E1", color: "#fff", fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 99, lineHeight: 1.4 }}>
                                        {unseen}
                                    </span>
                                </button>
                            );
                        })()}
                        {canEdit && components.length > 0 && (
                            <button onClick={() => setShowDeleteConfirm(true)}
                                style={{ padding: "3px 10px", border: "1.5px solid #FECACA", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "#FFF5F5", color: "#DC2626", cursor: "pointer", fontFamily: "inherit" }}>
                                🗑 Delete All
                            </button>
                        )}
                    </div>
                </div>

                {/* Empty state */}
                {components.length === 0 && addingAfter === null && (
                    <div style={{ textAlign: "center", padding: "20px 0" }}>
                        <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>No components yet.</div>
                        {canEdit && <TimelineAddBtn onClick={() => onAddBetween(-1)} />}
                    </div>
                )}
                {components.length === 0 && addingAfter === -1 && (
                    <FlowEditBox idx={0} comp={{}} isNew onSave={(d) => onSaveNew(-1, d)} onCancel={onCancelAdd} />
                )}

                {/* Timeline */}
                {components.length > 0 && (
                    <div style={{ position: "relative" }}>
                        {/* Base grey line */}
                        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 3, background: "#E2E8F0", transform: "translateX(-50%)", zIndex: 0, borderRadius: 99 }} />
                        {/* Green progress overlay */}
                        {progressPct > 0 && (
                            <div style={{ position: "absolute", left: "50%", top: 0, height: `${progressPct}%`, width: 3, background: "linear-gradient(to bottom, #22C55E, #16A34A)", transform: "translateX(-50%)", zIndex: 1, borderRadius: 99, transition: "height 0.4s ease" }} />
                        )}

                        {/* Add before first */}
                        {canEdit && (!submitted || editingMode) && addingAfter !== -1 && (
                            <div style={{ position: "relative", zIndex: 2, marginBottom: 8 }}>
                                <TimelineAddBtn onClick={() => onAddBetween(-1)} />
                            </div>
                        )}
                        {addingAfter === -1 && (
                            <div style={{ position: "relative", zIndex: 2, marginBottom: 12 }}>
                                <FlowEditBox idx={0} comp={{}} isNew onSave={(d) => onSaveNew(-1, d)} onCancel={onCancelAdd} />
                            </div>
                        )}

                        {components.map((comp, i) => {
                            const isDone = comp.status === "done";
                            const isLeft = i % 2 === 0;
                            const isEditing = editingIdx === i;
                            const nodeCanEdit = canEdit;

                            return (
                                <div key={comp.id} style={{ position: "relative", zIndex: 2 }}>
                                    <div style={{ display: "flex", alignItems: "flex-start", minHeight: 20 }}>
                                        {/* LEFT */}
                                        <div style={{ width: "calc(50% - 10px)", flexShrink: 0 }}>
                                            {isLeft && !isEditing && (
                                                <NodeCard comp={comp} idx={i} isDone={isDone} canEdit={nodeCanEdit} isHead={isHead} taskId={taskId}
                                                    onEdit={() => onEdit(i)} onDelete={() => onDelete(i)}
                                                    onMarkDone={() => onMarkDone(i)} onMarkUndo={() => onMarkUndo(i)}
                                                    onReportSubmitted={() => {
                                                        const now = fmtDatetime(new Date().toISOString());
                                                        const prev = components[i];
                                                        const histEntry = { type: "report", label: "Report Submitted", at: now, by: null, changes: [] };
                                                        const prevHistory = prev.history || [];
                                                        const updated = components.map((c2, ci) => ci === i ? { ...c2, history: [...prevHistory, histEntry] } : c2);
                                                        setComponents(updated);
                                                        persist(updated, submitted);
                                                        onRefresh();
                                                    }}
                                                />
                                            )}
                                        </div>
                                        {/* DOT */}
                                        <div style={{ width: 20, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: isEditing ? 18 : 16 }}>
                                            <div style={{ width: 16, height: 16, borderRadius: "50%", background: isDone ? "#22C55E" : "#fff", border: `2.5px solid ${isDone ? "#16A34A" : "#F59E0B"}`, boxShadow: `0 0 0 3px ${isDone ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 5, position: "relative" }}>
                                                {isDone && <span style={{ fontSize: 8, color: "#fff", fontWeight: 900 }}>✔</span>}
                                            </div>
                                        </div>
                                        {/* RIGHT */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {!isLeft && !isEditing && (
                                                <NodeCard comp={comp} idx={i} isDone={isDone} canEdit={nodeCanEdit} isHead={isHead} taskId={taskId}
                                                    onEdit={() => onEdit(i)} onDelete={() => onDelete(i)}
                                                    onMarkDone={() => onMarkDone(i)} onMarkUndo={() => onMarkUndo(i)}
                                                    onReportSubmitted={() => {
                                                        const now = fmtDatetime(new Date().toISOString());
                                                        const prev = components[i];
                                                        const histEntry = { type: "report", label: "Report Submitted", at: now, by: null, changes: [] };
                                                        const prevHistory = prev.history || [];
                                                        const updated = components.map((c2, ci) => ci === i ? { ...c2, history: [...prevHistory, histEntry] } : c2);
                                                        setComponents(updated);
                                                        persist(updated, submitted);
                                                        onRefresh();
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {/* Edit form */}
                                    {isEditing && (
                                        <div style={{ position: "relative", zIndex: 3, marginTop: 8, marginBottom: 4 }}>
                                            <FlowEditBox idx={i} comp={comp} isNew={false} onSave={(d) => onSaveEdit(i, d)} onCancel={onCancelEdit} />
                                        </div>
                                    )}

                                    {/* Add after */}
                                    <div style={{ position: "relative", zIndex: 2, margin: "10px 0" }}>
                                        {addingAfter === i
                                            ? <FlowEditBox idx={i + 1} comp={{}} isNew onSave={(d) => onSaveNew(i, d)} onCancel={onCancelAdd} />
                                            : canEdit && (!submitted || editingMode)
                                                ? <TimelineAddBtn onClick={() => onAddBetween(i)} />
                                                : <div style={{ height: 8 }} />
                                        }
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}

/* ─── State container ─── */
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

    // Persist seen count in localStorage so unseen badge survives page reloads
    const seenKey = `history_seen_${task?.taskId}`;
    const [seenCount, setSeenCountRaw] = useState(() => {
        try { return parseInt(localStorage.getItem(seenKey) || "0", 10) || 0; } catch { return 0; }
    });
    const handleSeen = (n) => {
        setSeenCountRaw(n);
        try { localStorage.setItem(seenKey, String(n)); } catch { }
    };

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
            const submittedVal = isSubmit !== undefined ? isSubmit : submitted;
            const res = await fetch(`${BASE}/cowork/task/${task.taskId}/goal-activities`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ activities: comps, submitted: submittedVal, submittedAt: submitTime || submittedAt }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Save failed"); }
        } catch (e) { setSaveErr(e.message); }
        finally { setSaving(false); }
    }, [task.taskId, submitted, submittedAt]);

    const genId = () => `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const handleSaveNew = (afterIdx, data) => {
        const now = fmtDatetime(new Date().toISOString());
        const historyEntry = {
            type: "created", label: "Component Created", at: now, by: null,
            changes: [
                { field: "Heading", to: data.heading },
                { field: "Description", to: data.description },
                { field: "Deadline", to: fmtDatetime(data.deadline) },
            ],
        };
        const newComp = { id: genId(), ...data, status: "pending", createdAt: now, history: [historyEntry] };
        const updated = [...components];
        updated.splice(afterIdx + 1, 0, newComp);
        setComponents(updated); setAddingAfter(null);
        persist(updated, submitted);
    };

    const handleSaveEdit = (idx, data) => {
        const now = fmtDatetime(new Date().toISOString());
        const prev = components[idx];
        const changes = [];
        if (prev.heading !== data.heading)
            changes.push({ field: "Heading", from: prev.heading, to: data.heading });
        if (prev.description !== data.description)
            changes.push({ field: "Description", from: prev.description, to: data.description });
        if (prev.deadline !== data.deadline)
            changes.push({ field: "Deadline", from: fmtDatetime(prev.deadline), to: fmtDatetime(data.deadline) });
        const historyEntry = { type: "edited", label: "Component Edited", at: now, by: null, changes };
        const prevHistory = prev.history || [];
        const updated = components.map((c, i) => i === idx ? { ...c, ...data, editedAt: now, history: [...prevHistory, historyEntry] } : c);
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
        const historyEntry = { type: "done", label: "Marked as Done", at: now, by: null, changes: [] };
        const prevHistory = prev.history || [];
        const u = components.map((c, i) => i === idx ? { ...c, status: "done", doneAt: now, history: [...prevHistory, historyEntry] } : c);
        setComponents(u); persist(u, submitted);
    };
    const handleMarkUndo = (idx) => {
        const now = fmtDatetime(new Date().toISOString());
        const prev = components[idx];
        const historyEntry = { type: "undone", label: "Done Undone", at: now, by: null, changes: [] };
        const prevHistory = prev.history || [];
        const u = components.map((c, i) => i === idx ? { ...c, status: "pending", doneAt: null, history: [...prevHistory, historyEntry] } : c);
        setComponents(u); persist(u, submitted);
    };

    const handleFinalSubmit = async () => {
        if (!components.length || editingIdx !== null || addingAfter !== null) { setSaveErr("Save or cancel the open component first."); return; }
        const now = fmtDatetime(new Date().toISOString());
        setSubmitted(true); setSubmittedAt(now);
        await persist(components, true, now);
    };

    const handleToggleEditMode = () => setEditingMode(m => !m);

    if (loading) return <div style={{ padding: "20px", textAlign: "center", fontSize: 12, color: "#94A3B8" }}>Loading…</div>;

    return (
        <div style={{ padding: "12px 14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <InteractiveFlowchart
                components={components} editingIdx={editingIdx} addingAfter={addingAfter}
                submitted={submitted} canEdit={canEdit} isHead={isHead} editingMode={editingMode}
                taskId={task.taskId}
                onEdit={(i) => { setEditingIdx(i); setAddingAfter(null); }}
                onDelete={handleDelete} onMarkDone={handleMarkDone} onMarkUndo={handleMarkUndo}
                onAddBetween={(i) => { setAddingAfter(i); setEditingIdx(null); }}
                onSaveNew={handleSaveNew} onSaveEdit={handleSaveEdit}
                onCancelEdit={() => setEditingIdx(null)} onCancelAdd={() => setAddingAfter(null)}
                onDeleteAll={handleDeleteAll} onToggleEditMode={handleToggleEditMode}
                onRefresh={load}
                seenCount={seenCount} onSeen={handleSeen}
            />

            {!submitted && canEdit && (
                <div>
                    {saveErr && <div style={{ fontSize: 11, color: "#DC2626", marginBottom: 6 }}>{saveErr}</div>}
                    <button disabled={!components.length || saving} onClick={handleFinalSubmit}
                        style={{ width: "100%", padding: "11px 16px", border: "none", borderRadius: 10, background: !components.length || saving ? "#CBD5E1" : "linear-gradient(135deg, #F59E0B, #EF4444)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: !components.length || saving ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: components.length && !saving ? "0 3px 12px rgba(239,68,68,0.25)" : "none", transition: "all 0.2s" }}>
                        {saving ? "Saving…" : "🚀 Final Submit"}
                    </button>
                    {!components.length && <div style={{ fontSize: 11, color: "#94A3B8", textAlign: "center", marginTop: 5 }}>Add at least one component before submitting.</div>}
                </div>
            )}

            {submitted && (
                <div style={{ background: "#F0FDF4", border: "1.5px solid #86EFAC", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>✅</span>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>Activities submitted!</div>
                        {submittedAt && <div style={{ fontSize: 10, color: "#4ADE80" }}>Submitted on {submittedAt}</div>}
                    </div>
                </div>
            )}
            {saveErr && submitted && <div style={{ fontSize: 11, color: "#DC2626" }}>{saveErr}</div>}
        </div>
    );
}

export default function GoalTask({ task, isAssignee, isCEO, isTL, onRefresh }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
            <ActivitiesSection task={task} isAssignee={isAssignee} isCEO={isCEO} isTL={isTL} />
        </div>
    );
}