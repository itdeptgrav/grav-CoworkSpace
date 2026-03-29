/**
 * GRAV-CMS/components/coworking/messaging/MessageBubble.jsx
 *
 * Renders a single chat bubble — text, image, PDF, voice, system.
 * Handles three states for own messages:
 *   sending=true  → dimmed blue with spinner  (being saved to backend)
 *   error=true    → red tint with "Failed" label  (backend save failed, stays visible)
 *   default       → full blue with ✓ tick  (confirmed / from server)
 *
 * Used in: task chat, group chat, direct messages.
 */
"use client";
import { useState } from "react";
import { GwAvatar } from "../shared/CoworkShared";

/* ── inject spin keyframe once ─────────────────────────── */
if (typeof document !== "undefined" && !document.getElementById("mb-styles")) {
    const el = document.createElement("style");
    el.id = "mb-styles";
    el.textContent = `
    @keyframes mb-spin { to { transform: rotate(360deg); } }
    @keyframes mb-fadein { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
    .mb-bubble-in { animation: mb-fadein 0.18s ease forwards; }
  `;
    document.head.appendChild(el);
}

export default function MessageBubble({ msg, isMe, showSender = true, showAvatar = true }) {
    const [pdfOpen, setPdfOpen] = useState(false);
    const [imgOpen, setImgOpen] = useState(null);

    /* ── System message ─────────────────────────────────── */
    if (msg.messageType === "system") {
        return (
            <div style={{ display: "flex", justifyContent: "center", margin: "6px 0" }}>
                <span style={{
                    background: "#F1F3F4", color: "#5F6368",
                    fontSize: 11, padding: "4px 14px", borderRadius: 20,
                    textAlign: "center", whiteSpace: "pre-line", maxWidth: "80%",
                    border: "1px solid #E8EAED",
                }}>
                    {msg.text}
                </span>
            </div>
        );
    }

    const isSameSender = !showSender;

    /* ── Bubble colour logic ────────────────────────────── */
    // OWN messages:
    //   sending → semi-transparent blue  (optimistic, not yet confirmed)
    //   error   → red tint               (failed, stays visible)
    //   default → solid blue             (confirmed)
    // OTHERS: always light grey
    const bubbleBg = isMe
        ? msg.error ? "#fee2e2"
            : msg.sending ? "rgba(37,99,235,0.55)"
                : "#2563eb"
        : "#F1F3F4";

    const bubbleColor = isMe
        ? msg.error ? "#991b1b"
            : "#fff"
        : "#202124";

    const bubbleRadius = isMe
        ? "18px 18px 4px 18px"
        : "18px 18px 18px 4px";

    const bubbleBorder = msg.error ? "1.5px solid #fca5a5" : "none";

    return (
        <div
            className="mb-bubble-in"
            style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-end",
                marginTop: isSameSender ? 2 : 10,
                flexDirection: isMe ? "row-reverse" : "row",
            }}
        >
            {/* Avatar — only for other users */}
            {!isMe && (
                showAvatar
                    ? <GwAvatar name={msg.senderName || "?"} size={28} />
                    : <div style={{ width: 28 }} />
            )}

            <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 3,
                maxWidth: "65%",
                alignItems: isMe ? "flex-end" : "flex-start",
            }}>
                {/* Sender name (others only) */}
                {showSender && !isMe && (
                    <span style={{ fontSize: 11, color: "#9AA0A6", marginLeft: 4, fontWeight: 500 }}>
                        {msg.senderName}
                    </span>
                )}

                {/* Bubble */}
                <div style={{
                    padding: "9px 14px",
                    background: bubbleBg,
                    color: bubbleColor,
                    borderRadius: bubbleRadius,
                    border: bubbleBorder,
                    fontSize: 14,
                    lineHeight: 1.55,
                    wordBreak: "break-word",
                    transition: "background 0.25s, opacity 0.25s",
                    opacity: msg.sending ? 0.82 : 1,
                    maxWidth: "100%",
                    boxShadow: isMe && !msg.error
                        ? "0 1px 4px rgba(37,99,235,0.18)"
                        : "0 1px 3px rgba(0,0,0,0.06)",
                }}>
                    {/* Attachments */}
                    {msg.attachments?.map((att, i) => (
                        <AttachmentPreview
                            key={i}
                            att={att}
                            isMe={isMe}
                            onPDFClick={() => setPdfOpen(att)}
                            onImgClick={() => setImgOpen(att.url)}
                        />
                    ))}

                    {/* Text */}
                    {msg.text ? (
                        <div style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>
                    ) : null}
                </div>

                {/* Timestamp + delivery status */}
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 10, color: "#9AA0A6" }}>
                        {msg.createdAt
                            ? new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                            : ""}
                    </span>

                    {/* Sending spinner */}
                    {msg.sending && !msg.error && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#9AA0A6" }}>
                            <span style={{
                                display: "inline-block",
                                width: 9, height: 9,
                                border: "1.5px solid #9AA0A6",
                                borderTopColor: "transparent",
                                borderRadius: "50%",
                                animation: "mb-spin 0.8s linear infinite",
                            }} />
                            sending
                        </span>
                    )}

                    {/* Error state */}
                    {msg.error && (
                        <span style={{
                            fontSize: 10, color: "#D93025",
                            display: "flex", alignItems: "center", gap: 3,
                        }}>
                            ⚠ Not sent
                        </span>
                    )}

                    {/* Delivered tick — own message, confirmed, not sending */}
                    {isMe && !msg.sending && !msg.error && (
                        <span style={{ fontSize: 11, color: "#2563eb", lineHeight: 1 }}>✓</span>
                    )}
                </div>

                {/* Error retry hint */}
                {msg.error && (
                    <div style={{
                        fontSize: 11, color: "#D93025",
                        background: "#FCE8E6",
                        padding: "4px 10px", borderRadius: 8,
                        border: "1px solid #F5C6C2",
                    }}>
                        Failed to send. Check your connection.
                    </div>
                )}
            </div>

            {/* PDF lightbox */}
            {pdfOpen && <PDFModal att={pdfOpen} onClose={() => setPdfOpen(false)} />}

            {/* Image lightbox */}
            {imgOpen && (
                <div
                    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
                    onClick={() => setImgOpen(null)}
                >
                    <img
                        src={imgOpen}
                        alt=""
                        style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 10, objectFit: "contain" }}
                        onClick={e => e.stopPropagation()}
                    />
                    <button
                        style={{ position: "absolute", top: 18, right: 18, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", borderRadius: "50%", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={() => setImgOpen(null)}
                    >
                        ✕
                    </button>
                </div>
            )}
        </div>
    );
}

/* ── Attachment preview ──────────────────────────────────── */
function AttachmentPreview({ att, isMe, onPDFClick, onImgClick }) {
    if (att.type === "image") {
        return (
            <img
                src={att.url}
                alt={att.name || "image"}
                onClick={onImgClick}
                style={{
                    maxWidth: 240, maxHeight: 200,
                    borderRadius: 10, objectFit: "cover",
                    cursor: "pointer", display: "block", marginBottom: 6,
                    border: "1px solid rgba(0,0,0,0.08)",
                }}
            />
        );
    }

    if (att.type === "pdf") {
        return (
            <div
                onClick={onPDFClick}
                style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px",
                    background: isMe ? "rgba(255,255,255,0.15)" : "#E8EAED",
                    borderRadius: 9, cursor: "pointer",
                    marginBottom: 6, maxWidth: 240,
                }}
            >
                <span style={{ fontSize: 22, flexShrink: 0 }}>📄</span>
                <div style={{ overflow: "hidden" }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isMe ? "#fff" : "#202124" }}>
                        {att.name || "Document"}
                    </div>
                    <div style={{ fontSize: 11, color: isMe ? "rgba(255,255,255,0.65)" : "#5F6368" }}>Click to view PDF</div>
                </div>
            </div>
        );
    }

    if (att.type === "voice") {
        return (
            <div style={{ marginBottom: 6 }}>
                <audio controls src={att.url} style={{ height: 36, maxWidth: 240 }} />
            </div>
        );
    }

    return null;
}

/* ── PDF modal ───────────────────────────────────────────── */
function PDFModal({ att, onClose }) {
    return (
        <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onClose}
        >
            <div
                style={{ background: "#fff", borderRadius: 14, width: "min(900px,96vw)", height: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #E8EAED" }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "#202124", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>📄</span> {att.name || "Document"}
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                        {att.downloadUrl && (
                            <a href={att.downloadUrl} target="_blank" rel="noopener noreferrer" style={pdfBtnStyle}>⬇ Download</a>
                        )}
                        <a href={att.url} target="_blank" rel="noopener noreferrer" style={pdfBtnStyle}>↗ Open</a>
                        <button onClick={onClose} style={{ ...pdfBtnStyle, background: "transparent", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
                    </div>
                </div>
                {att.embedUrl ? (
                    <iframe src={att.embedUrl} style={{ flex: 1, border: "none", width: "100%" }} title={att.name} />
                ) : (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#5F6368", gap: 12 }}>
                        <span style={{ fontSize: 48 }}>📄</span>
                        <p style={{ margin: 0 }}>Preview not available.</p>
                        {att.url && <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>Open in Google Drive ↗</a>}
                    </div>
                )}
            </div>
        </div>
    );
}

const pdfBtnStyle = {
    padding: "5px 12px",
    background: "#F8F9FA",
    border: "1px solid #E8EAED",
    borderRadius: 6,
    fontSize: 12,
    color: "#3C4043",
    cursor: "pointer",
    textDecoration: "none",
    fontWeight: 500,
};