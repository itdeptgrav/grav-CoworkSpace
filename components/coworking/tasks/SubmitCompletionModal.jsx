"use client";
/**
 * GRAV-CMS/components/coworking/tasks/SubmitCompletionModal.jsx
 * Employee submits completion request with proof (images + PDFs).
 */
import { useState, useRef } from "react";
import { uploadImage, uploadPDF, submitCompletionRequest } from "../../../lib/mediaUploadApi";

export default function SubmitCompletionModal({ task, currentEmployeeId, onClose, onSuccess }) {
    const [message, setMessage] = useState("");
    const [files, setFiles] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [pdfWarning, setPdfWarning] = useState("");
    const imgRef = useRef(null);
    const pdfRef = useRef(null);

    const handleImages = async (e) => {
        const selected = Array.from(e.target.files || []);
        e.target.value = "";
        if (!selected.length) return;
        setUploading(true);
        setError("");
        try {
            const results = await Promise.all(selected.map(f => uploadImage(f, "cowork-completion-proof")));
            const newFiles = results.map((r, i) => ({ type: "image", url: r.url, name: selected[i].name, preview: URL.createObjectURL(selected[i]) }));
            setFiles(prev => [...prev, ...newFiles]);
        } catch (err) { setError("Image upload failed: " + err.message); }
        finally { setUploading(false); }
    };

    const handlePDF = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setUploading(true);
        setPdfWarning("");
        try {
            const result = await uploadPDF(file);
            setFiles(prev => [...prev, { type: "pdf", url: result.viewUrl || result.url, downloadUrl: result.downloadUrl, embedUrl: result.embedUrl, name: file.name, fileId: result.fileId }]);
        } catch {
            setPdfWarning("PDF send feature not added yet — PDF was skipped.");
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim()) { setError("Please describe the completed work."); return; }
        setError(""); setSubmitting(true);
        try {
            const imageUrls = files.filter(f => f.type === "image").map(f => f.url);
            const pdfAttachments = files.filter(f => f.type === "pdf").map(f => ({ url: f.url, name: f.name, downloadUrl: f.downloadUrl, embedUrl: f.embedUrl, fileId: f.fileId }));
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
                {pdfWarning && <div style={s.warnBox}>⚠️ {pdfWarning}</div>}
                {uploading && <div style={s.infoBox}>⏳ Uploading file...</div>}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={s.field}>
                        <label style={s.label}>Describe completed work *</label>
                        <textarea style={{ ...s.input, height: "100px", resize: "vertical" }} value={message} onChange={e => setMessage(e.target.value)} placeholder="What did you complete? How was it done? Include any notes..." required />
                    </div>

                    <div style={s.field}>
                        <label style={s.label}>Proof of work</label>
                        <div style={s.uploadBtns}>
                            <button type="button" onClick={() => imgRef.current?.click()} style={s.uploadBtn} disabled={uploading}>📷 Add Images</button>
                            <button type="button" onClick={() => pdfRef.current?.click()} style={s.uploadBtn} disabled={uploading}>📄 Add PDF</button>
                        </div>
                        <input ref={imgRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImages} />
                        <input ref={pdfRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handlePDF} />

                        {files.length > 0 && (
                            <div style={s.fileGrid}>
                                {files.map((f, i) => (
                                    <div key={i} style={s.fileItem}>
                                        {f.type === "image" ? <img src={f.preview || f.url} alt="" style={s.fileThumb} /> : <div style={s.pdfIcon}>📄<span style={s.pdfName}>{f.name}</span></div>}
                                        <button type="button" onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} style={s.removeBtn}>✕</button>
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
    warnBox: { background: "#fef7e0", border: "1px solid #f9ab00", borderRadius: "6px", padding: "9px 12px", color: "#b06000", fontSize: "13px", marginBottom: "12px" },
    infoBox: { background: "#e8f0fe", borderRadius: "6px", padding: "9px 12px", color: "#1a73e8", fontSize: "13px", marginBottom: "12px" },
    field: { display: "flex", flexDirection: "column", gap: "6px" },
    label: { fontSize: "11px", fontWeight: 500, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.5px" },
    input: { padding: "10px 12px", border: "1px solid #dadce0", borderRadius: "4px", fontSize: "14px", fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
    uploadBtns: { display: "flex", gap: "10px" },
    uploadBtn: { padding: "8px 16px", border: "1.5px dashed #dadce0", borderRadius: "6px", background: "#fafafa", color: "#5f6368", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" },
    fileGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(80px,1fr))", gap: "8px", marginTop: "10px" },
    fileItem: { position: "relative", height: "80px", borderRadius: "6px", overflow: "hidden", background: "#f1f3f4" },
    fileThumb: { width: "100%", height: "100%", objectFit: "cover" },
    pdfIcon: { width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: "24px", gap: "2px" },
    pdfName: { fontSize: "9px", color: "#5f6368", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70px" },
    removeBtn: { position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.55)", border: "none", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
    footer: { display: "flex", justifyContent: "flex-end", gap: "10px", paddingTop: "14px", borderTop: "1px solid #e8eaed" },
    cancelBtn: { padding: "9px 22px", border: "none", background: "transparent", color: "#1a73e8", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
    submitBtn: { padding: "9px 24px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: "4px", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
};