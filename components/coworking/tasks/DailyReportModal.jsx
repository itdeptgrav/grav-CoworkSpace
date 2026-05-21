/**
 * components/coworking/tasks/DailyReportModal.jsx
 * RIGHT SLIDER — Daily report submission.
 * All logic identical to original.
 */
"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { uploadImage, uploadPDF, submitDailyReport } from "../../../lib/mediaUploadApi";

const F = { fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif" };

function SliderPortal({ children }) {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  if (!m) return null;
  return createPortal(children, document.body);
}

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

  const progressColor = progress >= 100 ? "#16A34A" : progress >= 50 ? "#1B4F8A" : "#D97706";

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
    e?.preventDefault();
    if (!message.trim()) { setError("Please describe today's work."); return; }
    setError(""); setPdfWarn(""); setSubmitting(true);
    try {
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
          setPdfWarn("PDF send feature not available yet — PDFs were skipped.");
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
    <SliderPortal>
      <style>{`@keyframes drm-in{from{transform:translateX(100%)}to{transform:translateX(0)}} @keyframes drm-spin{to{transform:rotate(360deg)}}`}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.25)", zIndex: 8998, backdropFilter: "blur(1px)" }} />

      {/* Panel */}
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(480px,100vw)", background: "#fff", borderLeft: "1px solid #E5E7EB", boxShadow: "-6px 0 32px rgba(15,23,42,0.12)", display: "flex", flexDirection: "column", zIndex: 8999, ...F, animation: "drm-in 0.24s cubic-bezier(0.32,0.72,0,1) both" }}>

        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #E5E7EB", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 28, borderRadius: 2, background: "#1B4F8A", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Daily Report</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>
              {task?.title} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "9px 12px", color: "#991B1B", fontSize: 12 }}>⚠️ {error}</div>}
          {pdfWarn && <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, padding: "9px 12px", color: "#92400E", fontSize: 12 }}>⚠️ {pdfWarn}</div>}

          <form id="drm-form" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* What did you work on */}
            <div>
              <label style={lbl}>What did you work on today? <span style={{ color: "#EF4444" }}>*</span></label>
              <textarea value={message} onChange={e => setMessage(e.target.value)}
                placeholder="Describe what you accomplished, blockers, next steps…"
                style={{ ...inp, height: 100, resize: "vertical" }} />
            </div>



            {/* Image attachments */}
            <div>
              <label style={lbl}>Proof Images</label>
              <input ref={imgRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={addImages} />
              {images.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(72px,1fr))", gap: 6, marginBottom: 8 }}>
                  {images.map((img, i) => (
                    <div key={i} style={{ position: "relative", height: 72, borderRadius: 6, overflow: "hidden", background: "#F1F5F9" }}>
                      <img src={img.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      {img.uploading && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#fff", fontSize: 10 }}>↑</span></div>}
                      {img.err && <div style={{ position: "absolute", inset: 0, background: "rgba(220,38,38,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#fff", fontSize: 9 }}>Fail</span></div>}
                      {!img.uploading && !submitting && (
                        <button type="button" onClick={() => removeImg(i)} style={{ position: "absolute", top: 3, right: 3, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none", color: "#fff", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => imgRef.current?.click()} style={attachBtn}>
                📷 Add Images
              </button>
            </div>

            {/* PDF attachments */}
            <div>
              <label style={lbl}>PDF Attachments</label>
              <input ref={pdfRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={addPdfs} />
              {pdfs.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }}>
                  {pdfs.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6 }}>
                      <span style={{ fontSize: 14 }}>📄</span>
                      <span style={{ flex: 1, fontSize: 11, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                      {p.uploading && <span style={{ fontSize: 10, color: "#6B7280" }}>Uploading…</span>}
                      {p.err && <span style={{ fontSize: 10, color: "#D97706" }}>{p.err}</span>}
                      {!submitting && <button type="button" onClick={() => removePdf(i)} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>}
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => pdfRef.current?.click()} style={attachBtn}>
                📄 Add PDF
              </button>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 18px", borderTop: "1px solid #E5E7EB", background: "#FAFAFA", display: "flex", gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={submitting} style={{ flex: 1, padding: "9px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", color: "#6B7280", fontSize: 12, fontWeight: 500, cursor: submitting ? "not-allowed" : "pointer", ...F }}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={submitting} style={{ flex: 2, padding: "9px", border: "none", borderRadius: 6, background: submitting ? "#E5E7EB" : "#1B4F8A", color: submitting ? "#9CA3AF" : "#fff", fontSize: 12, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, ...F }}>
            {submitting ? (<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "drm-spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>{images.some(i => i.uploading) || pdfs.some(p => p.uploading) ? "Uploading…" : "Submitting…"}</>) : "Submit Daily Report"}
          </button>
        </div>
      </div>
    </SliderPortal>
  );
}

const lbl = { fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 };
const inp = { padding: "9px 11px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: "'IBM Plex Sans',-apple-system,sans-serif", outline: "none", boxSizing: "border-box", width: "100%", background: "#fff", color: "#111827" };
const attachBtn = { width: "100%", padding: "8px", border: "1px dashed #D1D5DB", borderRadius: 6, background: "#F8FAFC", color: "#6B7280", fontSize: 12, cursor: "pointer", fontFamily: "'IBM Plex Sans',-apple-system,sans-serif", transition: "all 0.12s" };