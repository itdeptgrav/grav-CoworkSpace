"use client";
/**
 * GRAV-CMS/components/coworking/tasks/SubmitCompletionModal.jsx
 * Employee submits completion request with proof.
 * Single "Attach Files" input — supports images, PDF, Excel, Word, and any other file.
 * Images → Cloudinary | All other files → Google Drive (via /cowork/upload/pdf)
 */
import { useState, useRef } from "react";
import { uploadImage, uploadPDF, submitCompletionRequest } from "../../../lib/mediaUploadApi";

// ── File type helpers ─────────────────────────────────────
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

export default function SubmitCompletionModal({ task, currentEmployeeId, onClose, onSuccess }) {
    const [message, setMessage] = useState("");
    const [files, setFiles] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingCount, setUploadingCount] = useState(0);
    const [error, setError] = useState("");
    const fileRef = useRef(null);

    const uploading = uploadingCount > 0;

    // ── Single unified file handler ───────────────────────
    const handleFiles = async (e) => {
        const selected = Array.from(e.target.files || []);
        e.target.value = "";
        if (!selected.length) return;

        setError("");
        setUploadingCount(prev => prev + selected.length);

        await Promise.all(selected.map(async (file) => {
            try {
                if (IMAGE_TYPES.includes(file.type)) {
                    // Images → Cloudinary
                    const preview = URL.createObjectURL(file);
                    const result = await uploadImage(file, "cowork-completion-proof");
                    setFiles(prev => [...prev, {
                        type: "image",
                        url: result.url,
                        name: file.name,
                        preview,
                    }]);
                } else {
                    // Everything else (PDF, Excel, Word, etc.) → Google Drive
                    const result = await uploadPDF(file);
                    setFiles(prev => [...prev, {
                        type: "doc",
                        url: result.viewUrl || result.url,
                        downloadUrl: result.downloadUrl,
                        embedUrl: result.embedUrl,
                        name: file.name,
                        fileId: result.fileId,
                    }]);
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
                url: f.url, name: f.name, downloadUrl: f.downloadUrl,
                embedUrl: f.embedUrl, fileId: f.fileId,
            }));
            await submitCompletionRequest({ taskId: task.taskId, message: message.trim(), imageUrls, pdfAttachments });
            onSuccess?.();
        } catch (err) { setError(err.message); }
        finally { setSubmitting(false); }
    };

    return (
        <div style={s.overlay}>
            <div style={s.modal}>
                <div style={s.header}>
                    <div>
                        <h2 style={s.title}>Submit Completed Work</h2>
                        <p style={s.subtitle}>{task.title} ({task.taskId})</p>
                    </div>
                    <button onClick={onClose} style={s.closeBtn}>✕</button>
                </div>

                {error && <div style={s.errBox}>⚠️ {error}</div>}
                {uploading && (
                    <div style={s.infoBox}>
                        ⏳ Uploading {uploadingCount} file{uploadingCount > 1 ? "s" : ""}...
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={s.field}>
                        <label style={s.label}>Describe completed work *</label>
                        <textarea
                            style={{ ...s.input, height: "100px", resize: "vertical" }}
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="What did you complete? How was it done? Include any notes..."
                            required
                        />
                    </div>

                    <div style={s.field}>
                        <label style={s.label}>Attachments (proof of work)</label>

                        {/* Single attach button */}
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            style={s.attachBtn}
                            disabled={uploading}
                        >
                            <span style={{ fontSize: "16px" }}>📎</span>
                            <span>Attach Files</span>
                            <span style={s.attachHint}>Images, PDF, Excel, Word, and more</span>
                        </button>
                        <input
                            ref={fileRef}
                            type="file"
                            multiple
                            style={{ display: "none" }}
                            onChange={handleFiles}
                        />

                        {/* File preview grid */}
                        {files.length > 0 && (
                            <div style={s.fileList}>
                                {files.map((f, i) => (
                                    <div key={i} style={s.fileRow}>
                                        {f.type === "image" ? (
                                            <img src={f.preview || f.url} alt="" style={s.imgThumb} />
                                        ) : (
                                            <div style={{ ...s.docIcon, color: getFileColor(f.name) }}>
                                                {getFileIcon(f.name)}
                                            </div>
                                        )}
                                        <span style={s.fileName} title={f.name}>{f.name}</span>
                                        <button
                                            type="button"
                                            onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                                            style={s.removeBtn}
                                            title="Remove"
                                        >✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={s.footer}>
                        <button type="button" onClick={onClose} style={s.cancelBtn} disabled={submitting}>Cancel</button>
                        <button type="submit" disabled={submitting || uploading} style={s.submitBtn}>
                            {submitting ? "Submitting..." : "Submit for Review"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const s = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, fontFamily: "'Google Sans','Roboto',sans-serif" },
    modal: { background: "#fff", borderRadius: "12px", width: "min(580px,96vw)", maxHeight: "88vh", overflow: "auto", padding: "26px", boxShadow: "0 24px 48px rgba(0,0,0,0.2)" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" },
    title: { margin: "0 0 4px", fontSize: "20px", fontWeight: 400, color: "#202124" },
    subtitle: { margin: 0, fontSize: "13px", color: "#5f6368" },
    closeBtn: { background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#5f6368" },
    errBox: { background: "#fce8e6", border: "1px solid #f5c6c6", borderRadius: "6px", padding: "9px 12px", color: "#c5221f", fontSize: "13px", marginBottom: "12px" },
    infoBox: { background: "#e8f0fe", borderRadius: "6px", padding: "9px 12px", color: "#1a73e8", fontSize: "13px", marginBottom: "12px" },
    field: { display: "flex", flexDirection: "column", gap: "6px" },
    label: { fontSize: "11px", fontWeight: 500, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.5px" },
    input: { padding: "10px 12px", border: "1px solid #dadce0", borderRadius: "4px", fontSize: "14px", fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
    attachBtn: {
        display: "flex", alignItems: "center", gap: "10px",
        padding: "10px 16px", border: "1.5px dashed #dadce0", borderRadius: "8px",
        background: "#fafafa", cursor: "pointer", fontFamily: "inherit",
        fontSize: "14px", color: "#3c4043", textAlign: "left", width: "100%",
        transition: "border-color 0.15s, background 0.15s",
    },
    attachHint: { marginLeft: "auto", fontSize: "11px", color: "#9aa0a6" },
    fileList: { display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" },
    fileRow: {
        display: "flex", alignItems: "center", gap: "10px",
        padding: "7px 10px", background: "#f8f9fa", borderRadius: "6px",
        border: "1px solid #e8eaed",
    },
    imgThumb: { width: "32px", height: "32px", borderRadius: "4px", objectFit: "cover", flexShrink: 0 },
    docIcon: { width: "32px", textAlign: "center", fontSize: "22px", flexShrink: 0 },
    fileName: { flex: 1, fontSize: "13px", color: "#202124", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    removeBtn: { background: "none", border: "none", color: "#9aa0a6", fontSize: "14px", cursor: "pointer", padding: "2px 4px", flexShrink: 0, lineHeight: 1 },
    footer: { display: "flex", justifyContent: "flex-end", gap: "10px", paddingTop: "14px", borderTop: "1px solid #e8eaed" },
    cancelBtn: { padding: "9px 22px", border: "none", background: "transparent", color: "#1a73e8", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
    submitBtn: { padding: "9px 24px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: "4px", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
};