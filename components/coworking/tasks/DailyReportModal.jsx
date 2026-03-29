/**
 * GRAV-CMS/components/coworking/tasks/DailyReportModal.jsx
 * Images uploaded directly to Cloudinary. PDFs via backend.
 * Uses submitDailyReport from mediaUploadApi.
 */
"use client";
import { useState, useRef } from "react";
import { uploadImage, uploadPDF, submitDailyReport } from "../../../lib/mediaUploadApi";

export default function DailyReportModal({ task, currentEmployeeId, onClose, onSuccess }) {
    const [message, setMessage] = useState("");
    const [progress, setProgress] = useState(task?.progressPercent || 0);
    const [images, setImages] = useState([]);
    const [pdfs, setPdfs] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [pdfWarn, setPdfWarn] = useState("");
    const imgRef = useRef(null);
    const pdfRef = useRef(null);

    const progressColor = progress >= 100 ? "#1e8e3e" : progress >= 50 ? "#1a73e8" : "#f9ab00";

    const addImages = (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = "";
        setImages(prev => [...prev, ...files.map(f => ({ file: f, preview: URL.createObjectURL(f), url: null, uploading: false, err: null }))]);
    };

    const addPdfs = (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = "";
        setPdfs(prev => [...prev, ...files.map(f => ({ file: f, name: f.name, result: null, uploading: false, err: null }))]);
    };

    const removeImg = (i) => setImages(prev => { URL.revokeObjectURL(prev[i].preview); return prev.filter((_, j) => j !== i); });
    const removePdf = (i) => setPdfs(prev => prev.filter((_, j) => j !== i));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim()) { setError("Please describe today's work."); return; }
        setError(""); setPdfWarn(""); setSubmitting(true);
        try {
            // Upload images
            const imageUrls = [];
            const imgs = [...images];
            for (let i = 0; i < imgs.length; i++) {
                if (imgs[i].url) { imageUrls.push(imgs[i].url); continue; }
                imgs[i].uploading = true; setImages([...imgs]);
                try {
                    const r = await uploadImage(imgs[i].file, "cowork-daily-reports");
                    imgs[i].url = r.url; imgs[i].uploading = false;
                    imageUrls.push(r.url);
                } catch (err) {
                    imgs[i].err = "Failed"; imgs[i].uploading = false; setImages([...imgs]);
                    throw new Error("Image upload failed: " + err.message);
                }
                setImages([...imgs]);
            }

            // Upload PDFs
            const pdfAttachments = [];
            const ps = [...pdfs];
            for (let i = 0; i < ps.length; i++) {
                if (ps[i].result) { pdfAttachments.push(ps[i].result); continue; }
                ps[i].uploading = true; setPdfs([...ps]);
                try {
                    const r = await uploadPDF(ps[i].file);
                    ps[i].result = { url: r.viewUrl || r.url, name: ps[i].name, downloadUrl: r.downloadUrl, embedUrl: r.embedUrl, fileId: r.fileId };
                    ps[i].uploading = false;
                    pdfAttachments.push(ps[i].result);
                } catch {
                    ps[i].err = "Skipped"; ps[i].uploading = false;
                    setPdfWarn("PDF send feature not added yet — PDFs were skipped.");
                }
                setPdfs([...ps]);
            }

            await submitDailyReport(task.taskId, {
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

    return (
        <div style={s.overlay}>
            <div style={s.modal}>
                <div style={s.header}>
                    <div>
                        <h2 style={s.title}>📊 Daily Report</h2>
                        <p style={s.sub}>
                            <code style={s.idBadge}>{task?.taskId}</code>{" "}
                            {task?.title} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
                        </p>
                    </div>
                    <button onClick={onClose} style={s.closeBtn}>✕</button>
                </div>

                {error && <div style={s.errBox}>⚠️ {error}</div>}
                {pdfWarn && <div style={s.warnBox}>⚠️ {pdfWarn}</div>}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    <div style={s.field}>
                        <label style={s.label}>What did you work on today? *</label>
                        <textarea
                            style={{ ...s.input, height: 100, resize: "vertical" }}
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="Describe what you accomplished, blockers, next steps..."
                            required
                        />
                    </div>

                    <div style={s.field}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <label style={s.label}>Progress</label>
                            <span style={{ fontSize: 16, fontWeight: 700, color: progressColor }}>{progress}%</span>
                        </div>
                        <input
                            type="range" min={task?.progressPercent || 0} max={100}
                            value={progress}
                            onChange={e => setProgress(Number(e.target.value))}
                            style={{ width: "100%", accentColor: progressColor }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9aa0a6", marginTop: 2 }}>
                            <span>Current: {task?.progressPercent || 0}%</span>
                            <span>100%</span>
                        </div>
                    </div>

                    {/* Images */}
                    <div style={s.field}>
                        <label style={s.label}>Proof Images</label>
                        <div
                            style={s.dropZone}
                            onClick={() => imgRef.current?.click()}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); addImages({ target: { files: Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")) }, value: "" }); }}
                        >
                            <span style={{ fontSize: 28 }}>📸</span>
                            <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 500, color: "#202124" }}>Click or drag images here</p>
                            <p style={{ margin: 0, fontSize: 12, color: "#80868b" }}>JPG, PNG, WebP · max 10MB · uploaded to Cloudinary</p>
                        </div>
                        <input ref={imgRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={addImages} />
                        {images.length > 0 && (
                            <div style={s.imgGrid}>
                                {images.map((img, i) => (
                                    <div key={i} style={s.imgWrap}>
                                        <img src={img.preview} alt="" style={s.imgThumb} />
                                        {img.uploading && <div style={s.imgOverlay}>⏳</div>}
                                        {img.url && <div style={{ ...s.imgOverlay, background: "rgba(30,142,62,0.6)", color: "#fff" }}>✓</div>}
                                        {img.err && <div style={{ ...s.imgOverlay, background: "rgba(217,48,37,0.7)", color: "#fff", fontSize: 11 }}>Failed</div>}
                                        {!img.uploading && !submitting && (
                                            <button type="button" onClick={() => removeImg(i)} style={s.rmBtn}>✕</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* PDFs */}
                    <div style={s.field}>
                        <label style={s.label}>PDF Documents (optional)</label>
                        <button type="button" onClick={() => pdfRef.current?.click()} style={s.pdfAddBtn}>📄 Add PDF files</button>
                        <input ref={pdfRef} type="file" accept=".pdf,application/pdf" multiple style={{ display: "none" }} onChange={addPdfs} />
                        {pdfs.length > 0 && (
                            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                                {pdfs.map((p, i) => (
                                    <div key={i} style={s.pdfRow}>
                                        <span>📄</span>
                                        <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                                        {p.uploading && <span style={{ fontSize: 12, color: "#5f6368" }}>Uploading...</span>}
                                        {p.result && <span style={{ fontSize: 12, color: "#1e8e3e" }}>✓</span>}
                                        {p.err && <span style={{ fontSize: 12, color: "#f9ab00" }}>Skipped</span>}
                                        {!submitting && <button type="button" onClick={() => removePdf(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9aa0a6", fontSize: 16 }}>✕</button>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={s.footer}>
                        <button type="button" onClick={onClose} style={s.cancelBtn} disabled={submitting}>Cancel</button>
                        <button type="submit" disabled={submitting} style={s.submitBtn}>
                            {submitting ? (images.some(i => i.uploading) || pdfs.some(p => p.uploading) ? "Uploading..." : "Submitting...") : "Submit Daily Report"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const s = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, fontFamily: "'Google Sans','Roboto',sans-serif" },
    modal: { background: "#fff", borderRadius: 16, width: "min(660px,96vw)", maxHeight: "92vh", overflow: "auto", padding: 28, boxShadow: "0 32px 64px rgba(0,0,0,0.2)" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 },
    title: { margin: "0 0 4px", fontSize: 22, fontWeight: 600, color: "#202124" },
    sub: { margin: 0, fontSize: 13, color: "#5f6368" },
    idBadge: { fontSize: 11, fontFamily: "monospace", background: "#f1f3f4", padding: "1px 5px", borderRadius: 4, color: "#80868b" },
    closeBtn: { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#5f6368" },
    errBox: { background: "#fce8e6", border: "1px solid #f5c6c6", borderRadius: 8, padding: "10px 14px", color: "#c5221f", fontSize: 13, marginBottom: 14 },
    warnBox: { background: "#fef7e0", border: "1px solid #f9ab00", borderRadius: 8, padding: "10px 14px", color: "#b06000", fontSize: 13, marginBottom: 14 },
    field: { display: "flex", flexDirection: "column", gap: 7 },
    label: { fontSize: 11, fontWeight: 700, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.6px" },
    input: { padding: "11px 14px", border: "1.5px solid #dadce0", borderRadius: 8, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" },
    dropZone: { border: "2px dashed #dadce0", borderRadius: 12, padding: "26px 20px", textAlign: "center", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "#fafafa" },
    imgGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: 8, marginTop: 10 },
    imgWrap: { position: "relative", height: 90, borderRadius: 8, overflow: "hidden", background: "#f1f3f4" },
    imgThumb: { width: "100%", height: "100%", objectFit: "cover" },
    imgOverlay: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 },
    rmBtn: { position: "absolute", top: 3, right: 3, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: 22, height: 22, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
    pdfAddBtn: { padding: "9px 16px", border: "1.5px dashed #1a73e8", borderRadius: 8, background: "#f8fbff", color: "#1a73e8", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 500, width: "fit-content" },
    pdfRow: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#f8f9fa", borderRadius: 8, border: "1px solid #e8eaed" },
    footer: { display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 18, borderTop: "1px solid #e8eaed" },
    cancelBtn: { padding: "11px 24px", border: "none", background: "transparent", color: "#1a73e8", fontSize: 14, fontWeight: 500, cursor: "pointer" },
    submitBtn: { padding: "11px 28px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" },
};