"use client";
/**
 * GRAV-CMS/components/coworking/tasks/SubmitCompletionModal.jsx
 * Employee submits completion request with proof — right slider panel.
 */
import { useState, useRef, useEffect } from "react";
import { uploadImage, uploadPDF, submitCompletionRequest } from "../../../lib/mediaUploadApi";

const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];

function getFileIcon(name = "") {
    const ext = name.split(".").pop().toLowerCase();
    if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
    if (["doc", "docx"].includes(ext)) return "📝";
    if (["ppt", "pptx"].includes(ext)) return "📑";
    if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
    if (["mp4", "mov", "avi"].includes(ext)) return "🎬";
    if (ext === "pdf") return "📄";
    return "📎";
}

function getFileColor(name = "") {
    const ext = name.split(".").pop().toLowerCase();
    if (["xls", "xlsx", "csv"].includes(ext)) return "#1e7e34";
    if (["doc", "docx"].includes(ext)) return "#1a73e8";
    if (["ppt", "pptx"].includes(ext)) return "#c0392b";
    if (ext === "pdf") return "#c0392b";
    return "#5f6368";
}

export default function SubmitCompletionModal({ task, currentEmployeeId, onClose, onSuccess, timerActiveTaskId, onPauseTimer }) {
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState("");
    const [files, setFiles] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingCount, setUploadingCount] = useState(0);
    const [error, setError] = useState("");
    const fileRef = useRef(null);

    useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

    const handleClose = () => {
        setVisible(false);
        setTimeout(onClose, 280);
    };

    const uploading = uploadingCount > 0;

    const handleFiles = async (e) => {
        const selected = Array.from(e.target.files || []);
        e.target.value = "";
        if (!selected.length) return;
        setError("");
        setUploadingCount(prev => prev + selected.length);
        await Promise.all(selected.map(async (file) => {
            try {
                if (IMAGE_TYPES.includes(file.type)) {
                    const preview = URL.createObjectURL(file);
                    const result = await uploadImage(file, "cowork-completion-proof");
                    setFiles(prev => [...prev, { type: "image", url: result.url, name: file.name, preview }]);
                } else {
                    const result = await uploadPDF(file);
                    setFiles(prev => [...prev, { type: "doc", url: result.viewUrl || result.url, downloadUrl: result.downloadUrl, embedUrl: result.embedUrl, name: file.name, fileId: result.fileId }]);
                }
            } catch (err) {
                setError(`Failed to upload "${file.name}": ${err.message}`);
            } finally {
                setUploadingCount(prev => prev - 1);
            }
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim()) { setError("Please describe the completed work."); return; }
        setError(""); setSubmitting(true);
        try {
            const imageUrls = files.filter(f => f.type === "image").map(f => f.url);
            const pdfAttachments = files.filter(f => f.type === "doc").map(f => ({
                url: f.url, name: f.name, downloadUrl: f.downloadUrl, embedUrl: f.embedUrl, fileId: f.fileId,
            }));
            await submitCompletionRequest({ taskId: task.taskId, message: message.trim(), imageUrls, pdfAttachments });
            // Auto-pause the timer if it's still running for this task —
            // employees often forget to stop it after submitting work.
            if (timerActiveTaskId === task.taskId && onPauseTimer) {
              onPauseTimer(task.taskId, task.title);
            }
            onSuccess?.();
        } catch (err) { setError(err.message); }
        finally { setSubmitting(false); }
    };

    return (
        <>
            <style>{`
                @keyframes _scm_fadeIn { from{opacity:0} to{opacity:1} }
                @keyframes _scm_slideIn { from{transform:translateX(110%)} to{transform:translateX(0)} }
                @keyframes _scm_slideOut { from{transform:translateX(0)} to{transform:translateX(110%)} }
            `}</style>

            {/* Backdrop */}
            <div
                onClick={handleClose}
                style={{
                    position: "fixed", inset: 0, zIndex: 1998,
                    background: "rgba(15,23,42,0.35)",
                    backdropFilter: "blur(2px)",
                    animation: "_scm_fadeIn 0.2s ease",
                }}
            />

            {/* Slider panel */}
            <div style={{
                position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 1999,
                width: "min(480px, 100vw)",
                background: "#fff",
                boxShadow: "-4px 0 32px rgba(0,0,0,0.15)",
                display: "flex", flexDirection: "column",
                fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif",
                animation: `${visible ? "_scm_slideIn" : "_scm_slideOut"} 0.28s cubic-bezier(0.4,0,0.2,1) forwards`,
            }}>

                {/* Header */}
                <div style={{
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                    padding: "18px 20px 14px",
                    borderBottom: "1px solid #F1F5F9",
                    flexShrink: 0,
                }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", marginBottom: 3 }}>
                            Submit Completed Work
                        </div>
                        <div style={{ fontSize: 12, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>
                            {task.title}
                            <span style={{ fontSize: 10, fontFamily: "monospace", background: "#F1F5F9", color: "#94A3B8", padding: "1px 6px", borderRadius: 4, marginLeft: 6 }}>{task.taskId}</span>
                        </div>
                    </div>
                    <button onClick={handleClose} style={{ width: 28, height: 28, border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                {/* Scrollable body */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>

                    {error && (
                        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", color: "#DC2626", fontSize: 13, marginBottom: 16 }}>
                            ⚠️ {error}
                        </div>
                    )}
                    {uploading && (
                        <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "10px 14px", color: "#1D4ED8", fontSize: 13, marginBottom: 16 }}>
                            ⏳ Uploading {uploadingCount} file{uploadingCount > 1 ? "s" : ""}...
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>

                        {/* Description */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Describe completed work *
                            </label>
                            <textarea
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                placeholder="What did you complete? How was it done? Include any notes..."
                                required
                                style={{
                                    padding: "10px 12px", border: "1px solid #E2E8F0", borderRadius: 8,
                                    fontSize: 13, fontFamily: "inherit", outline: "none",
                                    resize: "vertical", minHeight: 100, width: "100%", boxSizing: "border-box",
                                    color: "#0F172A", lineHeight: 1.5,
                                }}
                                onFocus={e => e.target.style.borderColor = "#1B4F8A"}
                                onBlur={e => e.target.style.borderColor = "#E2E8F0"}
                            />
                        </div>

                        {/* Attachments */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Attachments (proof of work)
                            </label>
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                disabled={uploading}
                                style={{
                                    display: "flex", alignItems: "center", gap: 10,
                                    padding: "10px 14px", border: "1.5px dashed #CBD5E1", borderRadius: 8,
                                    background: "#F8FAFC", cursor: uploading ? "not-allowed" : "pointer",
                                    fontFamily: "inherit", fontSize: 13, color: "#475569",
                                    textAlign: "left", width: "100%", transition: "all 0.15s",
                                    opacity: uploading ? 0.6 : 1,
                                }}
                                onMouseEnter={e => { if (!uploading) { e.currentTarget.style.borderColor = "#1B4F8A"; e.currentTarget.style.color = "#1B4F8A"; } }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = "#CBD5E1"; e.currentTarget.style.color = "#475569"; }}
                            >
                                <span style={{ fontSize: 16 }}>📎</span>
                                <span>Attach Files</span>
                                <span style={{ marginLeft: "auto", fontSize: 11, color: "#94A3B8" }}>Images, PDF, Excel, Word…</span>
                            </button>
                            <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={handleFiles} />

                            {files.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                                    {files.map((f, i) => (
                                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#F8FAFC", borderRadius: 6, border: "1px solid #E2E8F0" }}>
                                            {f.type === "image" ? (
                                                <img src={f.preview || f.url} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                                            ) : (
                                                <span style={{ fontSize: 20, color: getFileColor(f.name), flexShrink: 0, width: 32, textAlign: "center" }}>{getFileIcon(f.name)}</span>
                                            )}
                                            <span style={{ flex: 1, fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                                            <button type="button" onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "#94A3B8", fontSize: 14, cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}>✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer buttons */}
                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid #F1F5F9", marginTop: 8 }}>
                            <button type="button" onClick={handleClose} disabled={submitting} style={{ padding: "8px 18px", border: "1px solid #E2E8F0", borderRadius: 7, background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                                Cancel
                            </button>
                            <button type="submit" disabled={submitting || uploading} style={{ padding: "8px 20px", border: "none", borderRadius: 7, background: submitting || uploading ? "#94A3B8" : "#1B4F8A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: submitting || uploading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                                {submitting ? "Submitting…" : uploading ? "Uploading…" : "Submit for Review"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
}