/**
 * GRAV-CMS/components/coworking/messaging/MediaMessageInput.jsx
 *
 * Professional redesign — all upload logic preserved exactly.
 * Images/voice → Cloudinary directly (no backend roundtrip).
 * PDFs → backend → Google Drive.
 * Optimistic: attachments fully uploaded before message is sent.
 */
"use client";
import { useState, useRef } from "react";
import { uploadImage, uploadVoice, uploadPDF } from "../../../lib/mediaUploadApi";

export default function MediaMessageInput({
    onSend,
    placeholder = "Write a message…",
    disabled = false,
}) {
    const [text, setText] = useState("");
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [recording, setRecording] = useState(false);
    const [recSeconds, setRecSeconds] = useState(0);
    const [error, setError] = useState("");

    const imageRef = useRef(null);
    const pdfRef = useRef(null);
    const textareaRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recTimerRef = useRef(null);

    const canSend = (text.trim() || attachments.length > 0) && !uploading && !recording && !disabled;

    // ── Upload images → Cloudinary directly ──────────────────
    const handleImages = async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = "";
        if (!files.length) return;
        setUploading(true);
        setError("");
        try {
            const results = await Promise.all(files.map(f => uploadImage(f)));
            setAttachments(prev => [
                ...prev,
                ...results.map((r, i) => ({
                    type: "image", url: r.url,
                    name: files[i].name, size: files[i].size,
                })),
            ]);
        } catch (err) {
            setError("Image upload failed: " + err.message);
        } finally {
            setUploading(false);
        }
    };

    // ── Upload PDF → backend → Google Drive ──────────────────
    const handlePDF = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setUploading(true);
        setError("");
        try {
            const r = await uploadPDF(file);
            setAttachments(prev => [...prev, {
                type: "pdf",
                url: r.viewUrl || r.url,
                downloadUrl: r.downloadUrl,
                embedUrl: r.embedUrl,
                name: file.name,
                fileId: r.fileId,
            }]);
        } catch {
            setError("PDF feature unavailable — PDFs require Google Drive setup");
        } finally {
            setUploading(false);
        }
    };

    // ── Voice recording → Cloudinary ─────────────────────────
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunksRef.current = [];
            const mr = new MediaRecorder(stream);
            mediaRecorderRef.current = mr;

            mr.ondataavailable = e => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            mr.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                clearInterval(recTimerRef.current);
                setRecSeconds(0);
                const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                setUploading(true);
                try {
                    const r = await uploadVoice(blob);
                    setAttachments(prev => [...prev, {
                        type: "voice", url: r.url,
                        name: "Voice note", duration: r.duration || 0,
                    }]);
                } catch (err) {
                    setError("Voice upload failed: " + err.message);
                } finally {
                    setUploading(false);
                }
            };

            mr.start(100);
            setRecording(true);
            recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
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
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const removeAttachment = (i) => setAttachments(prev => prev.filter((_, idx) => idx !== i));

    return (
        <div style={s.wrapper}>
            {/* Error bar */}
            {error && (
                <div style={s.errorBar}>
                    <span style={s.errorIcon}>!</span>
                    <span style={{ flex: 1 }}>{error}</span>
                    <button onClick={() => setError("")} style={s.errorClose}>✕</button>
                </div>
            )}

            {/* Status bar */}
            {(uploading || recording) && (
                <div style={s.statusBar}>
                    {uploading && (
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                                className="grav-spin"
                                style={{ width: 12, height: 12, border: "2px solid var(--gray-300)", borderTopColor: "var(--primary)", borderRadius: "50%", display: "inline-block" }}
                            />
                            Uploading…
                        </span>
                    )}
                    {recording && (
                        <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--danger)" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--danger)", display: "inline-block", animation: "grav-pulse 1s infinite" }} />
                            Recording {recSeconds}s — press ⏹ to stop
                        </span>
                    )}
                </div>
            )}

            {/* Attachment previews */}
            {attachments.length > 0 && (
                <div style={s.attRow}>
                    {attachments.map((att, i) => (
                        <div key={i} style={s.attChip}>
                            {att.type === "image" && (
                                <img src={att.url} alt="" style={s.attThumb} />
                            )}
                            {att.type === "pdf" && (
                                <span style={{ fontSize: 14 }}>📄</span>
                            )}
                            {att.type === "voice" && (
                                <span style={{ fontSize: 14 }}>🎤</span>
                            )}
                            <span style={s.attName}>{att.name}</span>
                            <span style={{ fontSize: 10, color: "var(--success)", fontWeight: 700 }}>✓</span>
                            <button
                                type="button"
                                onClick={() => removeAttachment(i)}
                                style={s.attRemove}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Input row */}
            <div style={s.inputRow}>
                {/* Hidden file inputs */}
                <input
                    ref={imageRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={handleImages}
                />
                <input
                    ref={pdfRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: "none" }}
                    onChange={handlePDF}
                />

                {/* Tool buttons */}
                <div style={s.toolBtns}>
                    <ToolBtn
                        onClick={() => imageRef.current?.click()}
                        disabled={disabled || recording || uploading}
                        title="Attach image"
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                            <circle cx="6" cy="7" r="1.2" fill="currentColor" />
                            <path d="M2 11l3-3 2.5 2.5L10 8l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </ToolBtn>

                    <ToolBtn
                        onClick={() => pdfRef.current?.click()}
                        disabled={disabled || recording || uploading}
                        title="Attach PDF"
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M4 2h6l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                            <path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                            <path d="M5 9h6M5 11.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        </svg>
                    </ToolBtn>

                    <ToolBtn
                        onClick={recording ? stopRecording : startRecording}
                        disabled={disabled || uploading}
                        title={recording ? "Stop recording" : "Record voice"}
                        active={recording}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
                            <path d="M3 8a5 5 0 0010 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                            <path d="M8 13v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                    </ToolBtn>
                </div>

                {/* Textarea */}
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                        recording ? "Recording…" :
                            uploading ? "Uploading…" :
                                placeholder
                    }
                    rows={1}
                    disabled={disabled || recording || uploading}
                    className="grav-input"
                    style={s.textarea}
                />

                {/* Send button */}
                <button
                    onClick={handleSend}
                    disabled={!canSend}
                    style={{
                        ...s.sendBtn,
                        opacity: canSend ? 1 : 0.4,
                        cursor: canSend ? "pointer" : "not-allowed",
                        background: canSend ? "var(--primary)" : "var(--gray-300)",
                    }}
                    className="grav-btn"
                    title="Send (Enter)"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M14 8L2 2l2.5 6L2 14l12-6z" fill="white" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

// Small tool button
function ToolBtn({ children, onClick, disabled, title, active }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: active ? "var(--danger-light)" : "transparent",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: disabled ? "not-allowed" : "pointer",
                color: active ? "var(--danger)" : "var(--gray-500)",
                opacity: disabled ? 0.45 : 1,
                flexShrink: 0,
                transition: "all var(--transition)",
            }}
        >
            {children}
        </button>
    );
}

const s = {
    wrapper: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 14px 12px",
        background: "var(--surface)",
        borderTop: "1px solid var(--gray-200)",
        flexShrink: 0,
    },

    errorBar: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: "var(--danger-light)",
        border: "1px solid var(--danger-mid, #F5C6C2)",
        borderRadius: "var(--radius-md)",
        fontSize: 12,
        color: "var(--danger)",
        fontFamily: "var(--font)",
    },
    errorIcon: { fontWeight: 700, flexShrink: 0, width: 16, textAlign: "center" },
    errorClose: {
        background: "none", border: "none", cursor: "pointer",
        color: "var(--danger)", fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0,
    },

    statusBar: {
        fontSize: 11,
        color: "var(--gray-500)",
        padding: "2px 4px",
        fontFamily: "var(--font)",
    },

    attRow: { display: "flex", flexWrap: "wrap", gap: 6 },
    attChip: {
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        background: "var(--gray-50)",
        border: "1px solid var(--gray-200)",
        borderRadius: "var(--radius-full)",
        fontSize: 11,
        fontFamily: "var(--font)",
        color: "var(--gray-700)",
    },
    attThumb: { width: 22, height: 22, borderRadius: "var(--radius-sm)", objectFit: "cover" },
    attName: { maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    attRemove: {
        background: "none", border: "none", cursor: "pointer",
        color: "var(--gray-400)", fontSize: 11, padding: 0, lineHeight: 1,
    },

    inputRow: {
        display: "flex",
        alignItems: "flex-end",
        gap: 6,
    },
    toolBtns: { display: "flex", gap: 2, alignItems: "flex-end" },

    textarea: {
        flex: 1,
        padding: "8px 12px",
        border: "1.5px solid var(--gray-200)",
        borderRadius: "var(--radius-lg)",
        fontSize: 13,
        resize: "none",
        fontFamily: "var(--font)",
        lineHeight: 1.5,
        maxHeight: 96,
        overflowY: "auto",
        background: "var(--surface)",
        color: "var(--gray-800)",
        outline: "none",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxSizing: "border-box",
    },

    sendBtn: {
        width: 36,
        height: 36,
        borderRadius: "var(--radius-md)",
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        transition: "all var(--transition)",
    },
};