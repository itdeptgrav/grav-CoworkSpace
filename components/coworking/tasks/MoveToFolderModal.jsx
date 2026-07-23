/**
 * components/coworking/tasks/MoveToFolderModal.jsx
 * RIGHT SLIDER — Move an existing standard task into an existing folder.
 * Styled to match ForwardTaskModal.jsx.
 */
"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { moveTaskToFolder } from "../../../lib/mediaUploadApi";

const F = { fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif" };

function SliderPortal({ children }) {
    const [m, setM] = useState(false);
    useEffect(() => setM(true), []);
    if (!m) return null;
    return createPortal(children, document.body);
}

export default function MoveToFolderModal({ task, folders, onClose, onSuccess }) {
    const [selectedFolderId, setSelectedFolderId] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async () => {
        if (!selectedFolderId) { setError("Pick a folder first."); return; }
        setError(""); setSubmitting(true);
        try {
            await moveTaskToFolder(task.taskId, selectedFolderId);
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
            <style>{`@keyframes mtf-in{from{transform:translateX(100%)}to{transform:translateX(0)}} @keyframes mtf-spin{to{transform:rotate(360deg)}}`}</style>

            {/* Backdrop */}
            <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.25)", zIndex: 8998, backdropFilter: "blur(1px)" }} />

            {/* Panel */}
            <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px,100vw)", background: "#fff", borderLeft: "1px solid #E5E7EB", boxShadow: "-6px 0 32px rgba(15,23,42,0.12)", display: "flex", flexDirection: "column", zIndex: 8999, ...F, animation: "mtf-in 0.24s cubic-bezier(0.32,0.72,0,1) both" }}>

                {/* Header */}
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #E5E7EB", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 3, height: 28, borderRadius: 2, background: "#1B4F8A", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Move to Folder</div>
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <span style={{ fontFamily: "monospace", background: "#F1F5F9", padding: "1px 5px", borderRadius: 3, marginRight: 5, fontSize: 10 }}>{task?.taskId}</span>
                            {task?.title}
                        </div>
                    </div>
                    <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "9px 12px", color: "#991B1B", fontSize: 12 }}>⚠️ {error}</div>}

                    {(!folders || folders.length === 0) ? (
                        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF", fontSize: 12 }}>No folders yet. Create one first from "Add Task."</div>
                    ) : (
                        folders.map(f => (
                            <button key={f.taskId} type="button" onClick={() => setSelectedFolderId(f.taskId)}
                                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1.5px solid ${selectedFolderId === f.taskId ? "#1B4F8A" : "#E5E7EB"}`, borderRadius: 8, background: selectedFolderId === f.taskId ? "#EBF2FA" : "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 0.12s" }}>
                                <span style={{ fontSize: 16, flexShrink: 0 }}>📁</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{f.title}</div>
                                    <div style={{ fontSize: 10, color: "#9CA3AF" }}>{(f.subtaskIds || []).length} task(s) inside</div>
                                </div>
                                {selectedFolderId === f.taskId && <span style={{ color: "#1B4F8A", fontWeight: 700 }}>✓</span>}
                            </button>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: "12px 18px", borderTop: "1px solid #E5E7EB", background: "#FAFAFA", display: "flex", gap: 8, flexShrink: 0 }}>
                    <button type="button" onClick={onClose} style={{ flex: 1, padding: "9px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", color: "#6B7280", fontSize: 12, fontWeight: 500, cursor: "pointer", ...F }}>
                        Cancel
                    </button>
                    <button type="button" onClick={handleSubmit} disabled={submitting || !selectedFolderId}
                        style={{ flex: 2, padding: "9px", border: "none", borderRadius: 6, background: submitting || !selectedFolderId ? "#E5E7EB" : "#1B4F8A", color: submitting || !selectedFolderId ? "#9CA3AF" : "#fff", fontSize: 12, fontWeight: 600, cursor: submitting || !selectedFolderId ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, ...F }}>
                        {submitting ? (<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "mtf-spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>Moving…</>) : "Move Task"}
                    </button>
                </div>
            </div>
        </SliderPortal>
    );
}