/**
 * components/coworking/tasks/EditTaskModal.jsx
 * RIGHT SLIDER — Edit an existing task's title, description, and requirements
 * from its Details tab. Styled to match ForwardTaskModal.jsx / MoveToFolderModal.jsx.
 */
"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { editTaskDetails } from "../../../lib/mediaUploadApi";

const F = { fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif" };
const inp = { padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: "inherit", color: "#111827", background: "#fff", boxSizing: "border-box", width: "100%", outline: "none" };
const lbl = { fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 };

function SliderPortal({ children }) {
    const [m, setM] = useState(false);
    useEffect(() => setM(true), []);
    if (!m) return null;
    return createPortal(children, document.body);
}

export default function EditTaskModal({ task, onClose, onSuccess }) {
    const [title, setTitle] = useState(task?.title || "");
    const [description, setDescription] = useState(task?.description || "");
    const [requirements, setRequirements] = useState(task?.requirements || []);
    const [reqInput, setReqInput] = useState("");
    const [editingReqIndex, setEditingReqIndex] = useState(null);
    const [editReqValue, setEditReqValue] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async () => {
        if (!title.trim()) { setError("Title can't be empty."); return; }
        setError(""); setSubmitting(true);
        try {
            await editTaskDetails(task.taskId, { title: title.trim(), description, requirements });
            onSuccess?.();
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <SliderPortal>
            <style>{`@keyframes etm-in{from{transform:translateX(100%)}to{transform:translateX(0)}} @keyframes etm-spin{to{transform:rotate(360deg)}}`}</style>

            {/* Backdrop */}
            <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.25)", zIndex: 8998, backdropFilter: "blur(1px)" }} />

            {/* Panel */}
            <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(460px,100vw)", background: "#fff", borderLeft: "1px solid #E5E7EB", boxShadow: "-6px 0 32px rgba(15,23,42,0.12)", display: "flex", flexDirection: "column", zIndex: 8999, ...F, animation: "etm-in 0.24s cubic-bezier(0.32,0.72,0,1) both" }}>

                {/* Header */}
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #E5E7EB", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 3, height: 28, borderRadius: 2, background: "#1B4F8A", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Edit Task</div>
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <span style={{ fontFamily: "monospace", background: "#F1F5F9", padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>{task?.taskId}</span>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "9px 12px", color: "#991B1B", fontSize: 12 }}>⚠️ {error}</div>}

                    <div>
                        <label style={lbl}>Title *</label>
                        <input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" autoFocus />
                    </div>

                    <div>
                        <label style={lbl}>Description</label>
                        <textarea style={{ ...inp, height: 70, resize: "vertical" }} value={description} onChange={e => setDescription(e.target.value)} placeholder="What this task involves" />
                    </div>

                    <div>
                        <label style={lbl}>Requirements / Deliverables</label>
                        {requirements.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
                                {requirements.map((req, ri) => (
                                    <div key={ri} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 9px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 5 }}>
                                        {editingReqIndex === ri ? (
                                            <input
                                                autoFocus
                                                style={{ ...inp, flex: 1, padding: "4px 8px" }}
                                                value={editReqValue}
                                                onChange={e => setEditReqValue(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === "Enter" && editReqValue.trim()) {
                                                        e.preventDefault();
                                                        setRequirements(prev => prev.map((r, i) => i === ri ? editReqValue.trim() : r));
                                                        setEditingReqIndex(null);
                                                    } else if (e.key === "Escape") {
                                                        setEditingReqIndex(null);
                                                    }
                                                }}
                                                onBlur={() => {
                                                    if (editReqValue.trim()) setRequirements(prev => prev.map((r, i) => i === ri ? editReqValue.trim() : r));
                                                    setEditingReqIndex(null);
                                                }}
                                            />
                                        ) : (
                                            <>
                                                <span style={{ color: "#1B4F8A", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>•</span>
                                                <span style={{ flex: 1, fontSize: 12, color: "#111827", lineHeight: 1.5, cursor: "pointer" }}
                                                    onClick={() => { setEditingReqIndex(ri); setEditReqValue(req); }}>{req}</span>
                                                <button type="button" title="Edit" onClick={() => { setEditingReqIndex(ri); setEditReqValue(req); }}
                                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 12, padding: 0, flexShrink: 0, lineHeight: 1 }}>✎</button>
                                                <button type="button" onClick={() => setRequirements(prev => prev.filter((_, i) => i !== ri))}
                                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 14, padding: 0, flexShrink: 0, lineHeight: 1 }}>×</button>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ display: "flex", gap: 6 }}>
                            <input
                                style={{ ...inp, flex: 1 }}
                                value={reqInput}
                                onChange={e => setReqInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === "Enter" && reqInput.trim()) {
                                        e.preventDefault();
                                        setRequirements(prev => [...prev, reqInput.trim()]);
                                        setReqInput("");
                                    }
                                }}
                                placeholder="Type a requirement and press Enter"
                            />
                            <button type="button"
                                onClick={() => { if (!reqInput.trim()) return; setRequirements(prev => [...prev, reqInput.trim()]); setReqInput(""); }}
                                style={{ padding: "0 12px", border: "1px solid #1B4F8A", borderRadius: 5, background: "#EBF2FA", color: "#1B4F8A", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                                + Add
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: "12px 18px", borderTop: "1px solid #E5E7EB", background: "#FAFAFA", display: "flex", gap: 8, flexShrink: 0 }}>
                    <button type="button" onClick={onClose} style={{ flex: 1, padding: "9px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", color: "#6B7280", fontSize: 12, fontWeight: 500, cursor: "pointer", ...F }}>
                        Cancel
                    </button>
                    <button type="button" onClick={handleSubmit} disabled={submitting || !title.trim()}
                        style={{ flex: 2, padding: "9px", border: "none", borderRadius: 6, background: submitting || !title.trim() ? "#E5E7EB" : "#1B4F8A", color: submitting || !title.trim() ? "#9CA3AF" : "#fff", fontSize: 12, fontWeight: 600, cursor: submitting || !title.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, ...F }}>
                        {submitting ? (<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "etm-spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>Saving…</>) : "Save Changes"}
                    </button>
                </div>
            </div>
        </SliderPortal>
    );
}