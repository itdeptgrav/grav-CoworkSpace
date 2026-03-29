"use client";
/**
 * GRAV-CMS/components/coworking/messaging/MediaMessageInput.jsx
 * Uploads images/voice directly to Cloudinary (no backend roundtrip).
 * PDFs go via backend → Google Drive.
 */
import { useState, useRef } from "react";
import { uploadImage, uploadVoice, uploadPDF } from "../../../lib/mediaUploadApi";

export default function MediaMessageInput({ onSend, placeholder = "Type a message...", disabled = false }) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState("");

  const imageRef = useRef(null);
  const pdfRef = useRef(null);
  const textareaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  const canSend = (text.trim() || attachments.length > 0) && !uploading && !recording && !disabled;

  // ── Upload image ─────────────────────────────────────────
  const handleImages = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    setError("");
    try {
      const results = await Promise.all(files.map(f => uploadImage(f)));
      const newAtts = results.map((r, i) => ({
        type: "image", url: r.url, name: files[i].name, size: files[i].size, publicId: r.publicId,
      }));
      setAttachments(prev => [...prev, ...newAtts]);
    } catch (err) {
      setError("Image upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  // ── Upload PDF ───────────────────────────────────────────
  const handlePDF = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const result = await uploadPDF(file);
      setAttachments(prev => [...prev, {
        type: "pdf", url: result.viewUrl || result.url,
        downloadUrl: result.downloadUrl, embedUrl: result.embedUrl,
        name: file.name, fileId: result.fileId,
      }]);
    } catch (err) {
      setError("PDF send feature not added yet");
    } finally {
      setUploading(false);
    }
  };

  // ── Voice recording ──────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recordingTimerRef.current);
        setRecordingSeconds(0);
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setUploading(true);
        try {
          const result = await uploadVoice(blob);
          setAttachments(prev => [...prev, { type: "voice", url: result.url, name: "Voice note", duration: result.duration || 0 }]);
        } catch (err) {
          setError("Voice upload failed: " + err.message);
        } finally {
          setUploading(false);
        }
      };
      mr.start(100);
      setRecording(true);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch {
      setError("Microphone access denied");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  // ── Send ─────────────────────────────────────────────────
  const handleSend = async () => {
    if (!canSend) return;
    const msgType = attachments.length > 0 ? attachments[0].type : "text";
    const toSend = { text: text.trim(), attachments: [...attachments], messageType: msgType };
    setText("");
    setAttachments([]);
    setError("");
    try {
      await onSend(toSend.text, toSend.attachments, toSend.messageType);
    } catch (err) {
      setError(err.message);
    }
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const removeAttachment = (i) => setAttachments(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div style={s.wrapper}>
      {/* Error */}
      {error && (
        <div style={s.errorBar}>
          ⚠️ {error}
          <button onClick={() => setError("")} style={s.errClose}>✕</button>
        </div>
      )}

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div style={s.attRow}>
          {attachments.map((a, i) => (
            <div key={i} style={s.attChip}>
              {a.type === "image" && <img src={a.url} alt="" style={s.attThumb} />}
              {a.type === "pdf" && <span>📄</span>}
              {a.type === "voice" && <span>🎤</span>}
              <span style={s.attName}>{a.name}</span>
              <button onClick={() => removeAttachment(i)} style={s.removeBtn}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Upload spinner */}
      {uploading && (
        <div style={s.uploadingBar}>⏳ Uploading...</div>
      )}

      {/* Recording indicator */}
      {recording && (
        <div style={s.recordingBar}>
          🔴 Recording {recordingSeconds}s — click Stop to finish
        </div>
      )}

      {/* Input row */}
      <div style={s.inputRow}>
        <input ref={imageRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImages} />
        <input ref={pdfRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={handlePDF} />

        <div style={s.iconBtns}>
          <button type="button" onClick={() => imageRef.current?.click()} style={s.iconBtn} title="Send image" disabled={disabled || recording || uploading}>📷</button>
          <button type="button" onClick={() => pdfRef.current?.click()} style={s.iconBtn} title="Send PDF" disabled={disabled || recording || uploading}>📄</button>
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            style={{ ...s.iconBtn, color: recording ? "#d93025" : "#5f6368", background: recording ? "#fce8e6" : "transparent" }}
            title={recording ? "Stop recording" : "Record voice note"}
            disabled={disabled || uploading}
          >{recording ? "⏹️" : "🎤"}</button>
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={recording ? "Recording..." : uploading ? "Uploading..." : placeholder}
          rows={1}
          style={s.textarea}
          disabled={disabled || recording || uploading}
        />

        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{ ...s.sendBtn, opacity: canSend ? 1 : 0.4 }}
        >➤</button>
      </div>
    </div>
  );
}

const s = {
  wrapper: { display: "flex", flexDirection: "column", gap: "6px", padding: "10px 14px", borderTop: "1px solid #e8eaed", background: "#fff", flexShrink: 0 },
  errorBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", background: "#fce8e6", borderRadius: "6px", fontSize: "13px", color: "#c5221f" },
  errClose: { background: "none", border: "none", cursor: "pointer", color: "#c5221f", fontSize: "14px" },
  attRow: { display: "flex", flexWrap: "wrap", gap: "6px" },
  attChip: { display: "flex", alignItems: "center", gap: "5px", padding: "3px 8px", background: "#f1f3f4", borderRadius: "14px", fontSize: "12px" },
  attThumb: { width: 24, height: 24, borderRadius: "3px", objectFit: "cover" },
  attName: { maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  removeBtn: { background: "none", border: "none", cursor: "pointer", color: "#5f6368", fontSize: "13px", padding: 0, lineHeight: 1 },
  uploadingBar: { fontSize: "12px", color: "#5f6368", padding: "2px 4px" },
  recordingBar: { fontSize: "12px", color: "#d93025", fontWeight: 500, padding: "2px 4px" },
  inputRow: { display: "flex", alignItems: "flex-end", gap: "6px" },
  iconBtns: { display: "flex", gap: "2px" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", fontSize: "19px", padding: "6px", borderRadius: "50%", color: "#5f6368", lineHeight: 1 },
  textarea: { flex: 1, padding: "9px 14px", border: "1px solid #dadce0", borderRadius: "20px", fontSize: "14px", resize: "none", outline: "none", fontFamily: "inherit", maxHeight: "100px", overflowY: "auto" },
  sendBtn: { width: 40, height: 40, borderRadius: "50%", background: "#1a73e8", color: "#fff", border: "none", fontSize: "17px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
};