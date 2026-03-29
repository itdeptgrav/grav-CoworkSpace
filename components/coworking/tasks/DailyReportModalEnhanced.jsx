/**
 * GRAV-CMS/components/coworking/tasks/DailyReportModalEnhanced.jsx
 * REPLACES DailyReportModal.jsx — now supports images + PDFs + graceful fallback.
 *
 * Images → Cloudinary
 * PDFs   → Google Drive (if fails, shows "PDF send feature not added yet", continues)
 */
"use client";
import { useState, useRef } from "react";
import { firebaseAuth } from "../../../lib/coworkFirebase";
import { uploadImage, uploadPDF } from "../../../lib/mediaUploadApi";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function submitReport(taskId, payload) {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error("Not authenticated");
    const token = await user.getIdToken();
    const res = await fetch(`${BASE}/cowork/task/${taskId}/daily-report`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to submit report");
    return data;
}

export default function DailyReportModalEnhanced({ task, currentEmployeeId, onClose, onSuccess }) {
    const [message, setMessage] = useState("");
    const [progress, setProgress] = useState(task?.progressPercent || 0);
    const [files, setFiles] = useState([]); // { file, previewUrl, type:"image"|"pdf", cloudUrl, uploading, error }
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [pdfWarning, setPdfWarning] = useState("");
    const imageInputRef = useRef(null);
    const pdfInputRef = useRef(null);

    const handleImageSelect = (e) => {
        const selected = Array.from(e.target.files || []);
        e.target.value = "";
        const newFiles = selected.map(f => ({
            file: f, type: "image",
            previewUrl: URL.createObjectURL(f),
            cloudUrl: null, uploading: false, error: null,
        }));
        setFiles(prev => [...prev, ...newFiles]);
    };

    const handlePDFSelect = (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        setFiles(prev => [...prev, { file: f, type: "pdf", previewUrl: null, cloudUrl: null, uploading: false, error: null }]);
    };

    const removeFile = (i) => {
        setFiles(prev => {
            if (prev[i].previewUrl) URL.revokeObjectURL(prev[i].previewUrl);
            return prev.filter((_, idx) => idx !== i);
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim()) { setError("Please describe what you worked on today."); return; }
        setError(""); setPdfWarning(""); setSubmitting(true);

        const updatedFiles = [...files];
        const imageUrls = [];
        const pdfAttachments = [];

        // Upload all files
        for (let i = 0; i < updatedFiles.length; i++) {
            if (updatedFiles[i].cloudUrl) {
                if (updatedFiles[i].type === "image") imageUrls.push(updatedFiles[i].cloudUrl);
                else pdfAttachments.push(updatedFiles[i].cloudUrl);
                continue;
            }

            updatedFiles[i].uploading = true;
            setFiles([...updatedFiles]);

            try {
                if (updatedFiles[i].type === "image") {
                    const result = await uploadImage(updatedFiles[i].file, "cowork-daily-reports");
                    updatedFiles[i].cloudUrl = result.url;
                    imageUrls.push(result.url);
                } else {
                    // PDF upload
                    try {
                        const result = await uploadPDF(updatedFiles[i].file);
                        updatedFiles[i].cloudUrl = result.viewUrl || result.url;
                        pdfAttachments.push({ name: updatedFiles[i].file.name, url: result.viewUrl, downloadUrl: result.downloadUrl, embedUrl: result.embedUrl });
                    } catch (pdfErr) {
                        if (pdfErr.message === "PDF_FEATURE_NOT_AVAILABLE") {
                            setPdfWarning("PDF send feature not added yet — PDF was skipped.");
                        } else {
                            setPdfWarning(`PDF upload failed (${pdfErr.message}) — PDF was skipped.`);
                        }
                        // Don't throw — continue without the PDF
                    }
                }
                updatedFiles[i].uploading = false;
                setFiles([...updatedFiles]);
            } catch (err) {
                updatedFiles[i].uploading = false;
                updatedFiles[i].error = "Upload failed";
                setFiles([...updatedFiles]);
                throw new Error(`File upload failed: ${err.message}`);
            }
        }

        try {
            await submitReport(task.taskId, {
                message: message.trim(),
                imageUrls,
                pdfAttachments,
                progressPercent: Number(progress),
                reportDate: new Date().toDateString(),
            });
            onSuccess?.();
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const progressColor = progress >= 100 ? "#1e8e3e" : progress >= 50 ? "#1a73e8" : "#f9ab00";

    return (
        <div style={s.overlay}>
            <div style={s.modal}>
                {/* Header */}
                <div style={s.header}>
                    <div>
                        <h2 style={s.title}>Daily Report</h2>
                        <p style={s.subtitle}>
                            {task?.title} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
                        </p>
                    </div>
                    <button onClick={onClose} style={s.closeBtn}>✕</button>
                </div>

                {error && <div style={s.errBox}>⚠️ {error}</div>}
                {pdfWarning && <div style={s.warnBox}>⚠️ {pdfWarning}</div>}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    {/* Message */}
                    <div style={s.fieldGroup}>
                        <label style={s.label}>What did you work on today? *</label>
                        <textarea
                            style={{ ...s.input, height: "96px", resize: "vertical" }}
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="Describe what you accomplished, blockers, next steps..."
                            required
                        />
                    </div>

                    {/* Progress */}
                    <div style={s.fieldGroup}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                            <label style={s.label}>Overall progress</label>
                            <span style={{ fontSize: "14px", fontWeight: 700, color: progressColor }}>{progress}%</span>
                        </div>
                        <input
                            type="range" min={task?.progressPercent || 0} max={100}
                            value={progress}
                            onChange={e => setProgress(Number(e.target.value))}
                            style={{ width: "100%", accentColor: progressColor }}
                        />
                    </div>

                    {/* File uploads */}
                    <div style={s.fieldGroup}>
                        <label style={s.label}>Attachments (images + PDF)</label>
                        <div style={s.uploadButtons}>
                            <button type="button" onClick={() => imageInputRef.current?.click()} style={s.uploadBtn}>
                                📷 Add Images
                            </button>
                            <button type="button" onClick={() => pdfInputRef.current?.click()} style={s.uploadBtn}>
                                📄 Add PDF
                            </button>
                        </div>
                        <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImageSelect} />
                        <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={handlePDFSelect} />

                        {/* File preview grid */}
                        {files.length > 0 && (
                            <div style={s.fileGrid}>
                                {files.map((f, i) => (
                                    <div key={i} style={s.fileItem}>
                                        {f.type === "image" && f.previewUrl && (
                                            <img src={f.previewUrl} alt="" style={s.imgPreview} />
                                        )}
                                        {f.type === "pdf" && (
                                            <div style={s.pdfPreview}>
                                                <span style={{ fontSize: "28px" }}>📄</span>
                                                <span style={s.pdfName}>{f.file?.name}</span>
                                            </div>
                                        )}
                                        {f.uploading && <div style={s.fileOverlay}><span>⏳</span></div>}
                                        {f.cloudUrl && !f.uploading && <div style={{ ...s.fileOverlay, background: "rgba(30,142,62,0.55)" }}><span style={{ color: "#fff" }}>✓</span></div>}
                                        {f.error && <div style={{ ...s.fileOverlay, background: "rgba(217,48,37,0.65)" }}><span style={{ color: "#fff", fontSize: 11 }}>Failed</span></div>}
                                        {!f.uploading && !submitting && (
                                            <button type="button" onClick={() => removeFile(i)} style={s.removeBtn}>✕</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={s.footer}>
                        <button type="button" onClick={onClose} style={s.cancelBtn} disabled={submitting}>Cancel</button>
                        <button type="submit" disabled={submitting} style={s.submitBtn}>
                            {submitting
                                ? files.some(f => f.uploading) ? "Uploading files..." : "Submitting..."
                                : "Submit Daily Report"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const s = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, fontFamily: "'Google Sans','Roboto',sans-serif" },
    modal: { background: "#fff", borderRadius: "12px", width: "min(620px,96vw)", maxHeight: "90vh", overflow: "auto", padding: "28px", boxShadow: "0 24px 48px rgba(0,0,0,0.2)" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" },
    title: { margin: "0 0 4px", fontSize: "22px", fontWeight: 400, color: "#202124" },
    subtitle: { margin: 0, fontSize: "13px", color: "#5f6368" },
    closeBtn: { background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#5f6368" },
    errBox: { background: "#fce8e6", border: "1px solid #f5c6c6", borderRadius: "6px", padding: "10px 14px", color: "#c5221f", fontSize: "13px", marginBottom: "14px" },
    warnBox: { background: "#fef7e0", border: "1px solid #f9ab00", borderRadius: "6px", padding: "10px 14px", color: "#b06000", fontSize: "13px", marginBottom: "14px" },
    fieldGroup: { display: "flex", flexDirection: "column", gap: "6px" },
    label: { fontSize: "12px", fontWeight: 500, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.5px" },
    input: { padding: "10px 14px", border: "1px solid #dadce0", borderRadius: "4px", fontSize: "14px", fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" },
    uploadButtons: { display: "flex", gap: "10px" },
    uploadBtn: { padding: "8px 16px", border: "1.5px dashed #dadce0", borderRadius: "6px", background: "#fafafa", color: "#5f6368", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" },
    fileGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: "8px", marginTop: "10px" },
    fileItem: { position: "relative", height: "90px", borderRadius: "6px", overflow: "hidden", background: "#f1f3f4" },
    imgPreview: { width: "100%", height: "100%", objectFit: "cover" },
    pdfPreview: { width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" },
    pdfName: { fontSize: "10px", color: "#5f6368", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 4px", maxWidth: "80px" },
    fileOverlay: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" },
    removeBtn: { position: "absolute", top: 3, right: 3, background: "rgba(0,0,0,0.55)", border: "none", color: "#fff", borderRadius: "50%", width: 20, height: 20, fontSize: "11px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
    footer: { display: "flex", justifyContent: "flex-end", gap: "10px", paddingTop: "16px", borderTop: "1px solid #e8eaed" },
    cancelBtn: { padding: "10px 24px", border: "none", background: "transparent", color: "#1a73e8", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
    submitBtn: { padding: "10px 28px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: "4px", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
};