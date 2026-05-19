/**
 * GRAV-CMS/components/coworking/messaging/MessageBubble.jsx
 *
 * UI revision:
 *   - Image-only messages no longer sit inside a coloured bubble.
 *     They render as the bare image (rounded, bordered) with NO
 *     background, NO padding, NO shadow — so there is no blue box
 *     around a sent image.
 *   - Hardened against horizontal overflow: every flex link in the
 *     row chain has minWidth:0, the bubble column is clamped, and
 *     attachment media is width-responsive (maxWidth:100%) instead
 *     of a fixed 240px that could push past a narrow column.
 *   - No logic changes: same props, handlers, message types, copy,
 *     lightbox, PDF/voice behaviour.
 */
"use client";
import { useState, useRef, useEffect } from "react";
import { GwAvatar } from "../shared/CoworkShared";
import LinkedText from "./LinkedText";

/* ── inject styles once ─────────────────────────────────── */
if (typeof document !== "undefined" && !document.getElementById("mb-styles")) {
    const el = document.createElement("style");
    el.id = "mb-styles";
    el.textContent = `
    @keyframes mb-spin { to { transform: rotate(360deg); } }
    @keyframes mb-fadein { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
    .mb-bubble-in { animation: mb-fadein 0.18s ease forwards; }
    .mb-bwrap { position: relative; display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
    .mb-copy-btn { opacity: 0; transition: opacity 0.15s, background 0.15s; }
    .mb-bwrap:hover .mb-copy-btn { opacity: 1 !important; }
    @media (hover: none) { .mb-copy-btn { opacity: 1 !important; } }
  `;
    document.head.appendChild(el);
}

// ── Context menu (no backdrop — document mousedown listener) ─────────────────
function MbCtxMenu({ items, isMe, onClose }) {
    const ref = useRef(null);
    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        const t = setTimeout(() => document.addEventListener("mousedown", handler), 10);
        return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
    }, [onClose]);
    return (
        <div ref={ref} style={{
            position: "absolute", [isMe ? "right" : "left"]: 0, bottom: "calc(100% + 6px)",
            zIndex: 9999, background: "#fff", borderRadius: 12,
            boxShadow: "0 8px 28px rgba(0,0,0,0.18)", border: "1px solid #E5E7EB",
            minWidth: 180, overflow: "hidden", padding: "4px 0",
        }}>
            {items.map(item => (
                <button key={item.label}
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); item.action(); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", border: "none", background: "transparent", color: item.red ? "#EF4444" : "#1F2937", fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                    <span style={{ width: 22, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
                    {item.label}
                </button>
            ))}
        </div>
    );
}

export default function MessageBubble({
    msg, isMe, showSender = true, showAvatar = true,
    isHost = false, onViewSummary = null, onEdit = null, onCancel = null, onCopied,
    onReply = null, onDeleteMsg = null, onEditMsg = null,
}) {
    const [pdfOpen, setPdfOpen] = useState(false);
    const [imgOpen, setImgOpen] = useState(null);
    const [copyFlash, setCopyFlash] = useState(false);
    const [ctxMenu, setCtxMenu] = useState(false);
    const lastTapRef = useRef(0);

    const handleCopy = () => {
        if (!msg.text) return;
        navigator.clipboard?.writeText(msg.text).then(() => {
            setCopyFlash(true);
            setTimeout(() => setCopyFlash(false), 1200);
            onCopied?.();
        });
    };

    const openCtx = (e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu(true); };
    const handleDoubleTap = (e) => {
        const now = Date.now();
        if (now - lastTapRef.current < 350) openCtx(e);
        lastTapRef.current = now;
    };
    const isSender = isMe;

    /* ── Deleted message placeholder ─────────────────────── */
    if (msg.isDeleted) {
        return (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 10, flexDirection: isMe ? "row-reverse" : "row", minWidth: 0 }}>
                {!isMe && <div style={{ width: 28, flexShrink: 0 }} />}
                <div style={{ padding: "9px 14px", borderRadius: 12, border: "1.5px dashed #D1D5DB", background: "#F9FAFB", fontSize: 13, color: "#9CA3AF", fontStyle: "italic", display: "flex", alignItems: "center", gap: 7 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                    This message was deleted.
                </div>
            </div>
        );
    }

    /* ── Meeting invite card ─────────────────────────────── */
    if (msg.messageType === "meeting_invite") {
        const md = msg.meetingData || {};
        const meetId = md.meetId;
        const joinCode = md.joinCode;
        return (
            <div style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", margin: "10px 0", minWidth: 0 }}>
                <div style={{ background: "linear-gradient(135deg,#15803D,#166534)", borderRadius: 16, padding: "16px 18px", maxWidth: 320, width: "100%", boxShadow: "0 4px 20px rgba(21,128,61,0.35)", fontFamily: "inherit", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, minWidth: 0 }}>
                        <div style={{ width: 36, height: 36, background: "rgba(255,255,255,0.2)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "0.08em" }}>MEETING INVITATION</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>from {msg.senderName}</div>
                        </div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", marginBottom: 12, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 6, overflowWrap: "anywhere" }}>{md.meetTitle || "CoWork Meeting"}</div>
                        {md.description && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginBottom: 8, lineHeight: 1.5, overflowWrap: "anywhere" }}>{md.description}</div>}
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "rgba(255,255,255,0.9)", minWidth: 0 }}>
                            {md.dateTime && <span>{new Date(md.dateTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>}
                            {joinCode && <span style={{ overflowWrap: "anywhere" }}>Join Code: <strong style={{ fontFamily: "monospace", letterSpacing: 3 }}>{joinCode}</strong></span>}
                        </div>
                    </div>
                    {meetId && (
                        <a href={`/coworking/cowork-meeting/${meetId}`}
                            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "11px 0", background: "#fff", color: "#15803D", borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: "none", boxSizing: "border-box" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                            Join Meeting
                        </a>
                    )}
                    {meetId && isHost && (
                        <div style={{ display: "flex", gap: 6, marginTop: 8, minWidth: 0 }}>
                            {onViewSummary && (
                                <button onClick={() => onViewSummary(meetId, md.meetTitle)}
                                    style={{ flex: 1, minWidth: 0, padding: "7px 0", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                                    Summary
                                </button>
                            )}
                            {onEdit && (
                                <button onClick={() => onEdit({ meetId, title: md.meetTitle, description: md.description, dateTime: md.dateTime, participants: [] })}
                                    style={{ flex: 1, minWidth: 0, padding: "7px 0", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                    Edit
                                </button>
                            )}
                            {onCancel && isMe && (
                                <button onClick={() => onCancel(meetId, md.meetTitle)}
                                    style={{ flex: 1, minWidth: 0, padding: "7px 0", borderRadius: 8, border: "none", background: "rgba(220,38,38,0.35)", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                                    Cancel
                                </button>
                            )}
                        </div>
                    )}
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textAlign: "right", marginTop: 8 }}>
                        {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}
                    </div>
                </div>
            </div>
        );
    }

    /* ── Task created notification card ─────────────────── */
    if (msg.messageType === "task_created") {
        const td = msg.taskData || {};
        return (
            <div style={{ display: "flex", justifyContent: "center", margin: "10px 0", width: "100%", minWidth: 0 }}>
                <div style={{ width: "min(320px, 92%)", borderRadius: 12, overflow: "hidden", border: "1.5px solid #BFDBFE", boxShadow: "0 2px 10px rgba(37,99,235,0.10)", background: "#fff", minWidth: 0 }}>
                    <div style={{ background: "linear-gradient(135deg, #1D4ED8, #2563EB)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12l2 2 4-4" /></svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "0.08em" }}>Task Created</div>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>by {td.createdBy || msg.senderName}</div>
                        </div>
                        <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.65)", background: "rgba(0,0,0,0.2)", padding: "2px 7px", borderRadius: 5, flexShrink: 0, whiteSpace: "nowrap" }}>{td.taskId || ""}</span>
                    </div>
                    <div style={{ padding: "10px 14px 12px", minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4, overflowWrap: "anywhere" }}>{td.title || msg.text}</div>
                        {td.description && <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5, marginBottom: 6, overflowWrap: "anywhere" }}>{td.description}</div>}
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8, minWidth: 0 }}>
                            {td.priority && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 5, color: { low: "#16A34A", medium: "#D97706", high: "#DC2626" }[td.priority] || "#64748B", background: { low: "#F0FDF4", medium: "#FFFBEB", high: "#FEF2F2" }[td.priority] || "#F8FAFC", textTransform: "uppercase", whiteSpace: "nowrap" }}>{td.priority}</span>}
                            {td.dueDate && <span style={{ fontSize: 9, color: "#64748B", fontWeight: 600, display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>{new Date(td.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>}
                            {td.assigneeCount > 0 && <span style={{ fontSize: 9, color: "#2563EB", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 5, padding: "2px 7px", fontWeight: 600, whiteSpace: "nowrap" }}>{td.assigneeCount} assigned</span>}
                        </div>
                        {td.taskId && (
                            <a href={`/coworking/tasks`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 0", background: "#2563EB", color: "#fff", borderRadius: 8, fontSize: 11, fontWeight: 600, textDecoration: "none", width: "100%", boxSizing: "border-box" }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                                Open Task
                            </a>
                        )}
                    </div>
                    <div style={{ fontSize: 9, color: "#94A3B8", textAlign: "right", padding: "0 14px 8px" }}>
                        {msg.createdAt ? new Date(typeof msg.createdAt === "string" ? msg.createdAt : msg.createdAt?.seconds * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}
                    </div>
                </div>
            </div>
        );
    }

    /* ── System message ─────────────────────────────────── */
    if (msg.messageType === "system") {
        return (
            <div style={{ display: "flex", justifyContent: "center", margin: "6px 0", minWidth: 0 }}>
                <span style={{ background: "#F1F3F4", color: "#5F6368", fontSize: 11, padding: "4px 14px", borderRadius: 20, textAlign: "center", whiteSpace: "pre-line", maxWidth: "80%", border: "1px solid #E8EAED", overflowWrap: "anywhere" }}>
                    <LinkedText text={msg.text} isMe={false} />
                </span>
            </div>
        );
    }

    const isSameSender = !showSender;

    /* ── Is this an image-only message? (no text, only image attachments) ──
       These render WITHOUT any coloured bubble — just the image. */
    const atts = msg.attachments || [];
    const hasText = !!(msg.text && msg.text.trim());
    const onlyImages = atts.length > 0 && atts.every(a => a.type === "image");
    const isBareImage = onlyImages && !hasText && !msg.error;

    /* ── Bubble colours ─────────────────────────────────── */
    const bubbleBg = isMe
        ? msg.error ? "#fee2e2" : msg.sending ? "rgba(37,99,235,0.55)" : "#2563eb"
        : "#FFFFFF";
    const bubbleColor = isMe ? (msg.error ? "#991b1b" : "#fff") : "#202124";
    const bubbleRadius = isMe ? "18px 4px 18px 18px" : "4px 18px 18px 18px";
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
                minWidth: 0,
                maxWidth: "100%",
            }}
        >
            {/* Avatar */}
            {!isMe && (
                showAvatar
                    ? <GwAvatar name={msg.senderName || "?"} size={28} url={msg.senderPicUrl || ""} />
                    : <div style={{ width: 28, flexShrink: 0 }} />
            )}

            {/* ── mb-bwrap: bubble + hover copy button ── */}
            <div
                className="mb-bwrap"
                style={{ flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", minWidth: 0, maxWidth: "100%" }}
            >
                {/* Copy button — appears on hover (text messages only) */}
                {hasText && (
                    <button
                        className="mb-copy-btn"
                        title={copyFlash ? "Copied!" : "Copy"}
                        onClick={handleCopy}
                        style={{
                            width: 24, height: 24, borderRadius: 6,
                            border: "1px solid #E2E8F0",
                            background: copyFlash ? "#F0FDF4" : "#fff",
                            color: copyFlash ? "#16A34A" : "#94A3B8",
                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0, alignSelf: "center",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                        }}
                    >
                        {copyFlash ? (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        ) : (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                        )}
                    </button>
                )}

                {/* Bubble + meta column */}
                <div style={{
                    display: "flex", flexDirection: "column", gap: 3,
                    maxWidth: "min(75%, 480px)",
                    minWidth: 0,
                    alignItems: isMe ? "flex-end" : "flex-start",
                }}>
                    {/* Sender name */}
                    {showSender && !isMe && (
                        <span style={{ fontSize: 11, color: "#9AA0A6", marginLeft: 4, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                            {msg.senderName}
                        </span>
                    )}

                    {/* Context menu */}
                    {ctxMenu && (
                        <MbCtxMenu
                            isMe={isMe}
                            onClose={() => setCtxMenu(false)}
                            items={[
                                { icon: "↩", label: "Reply", action: () => { setCtxMenu(false); onReply?.(msg); } },
                                ...(hasText ? [{ icon: "⎘", label: "Copy Text", action: () => { setCtxMenu(false); handleCopy(); } }] : []),
                                ...(isSender && hasText ? [{ icon: "✎", label: "Edit Message", action: () => { setCtxMenu(false); onEditMsg?.(msg); } }] : []),
                                ...(isSender ? [{ icon: "🗑", label: "Delete", action: () => { setCtxMenu(false); onDeleteMsg?.(msg); }, red: true }] : []),
                            ]}
                        />
                    )}

                    {isBareImage ? (
                        /* ── Image-only: NO bubble background, just the image ── */
                        <div
                            onDoubleClick={openCtx}
                            onContextMenu={openCtx}
                            onTouchEnd={handleDoubleTap}
                            style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: "100%", minWidth: 0, alignItems: isMe ? "flex-end" : "flex-start", cursor: "default" }}>
                            {atts.map((att, i) => (
                                <AttachmentPreview
                                    key={i}
                                    att={att}
                                    isMe={isMe}
                                    bare
                                    onPDFClick={() => setPdfOpen(att)}
                                    onImgClick={() => setImgOpen(att.url)}
                                />
                            ))}
                        </div>
                    ) : (
                        /* ── Normal bubble (text, mixed, pdf, voice, errors) ── */
                        <div
                            onDoubleClick={openCtx}
                            onContextMenu={openCtx}
                            onTouchEnd={handleDoubleTap}
                            style={{
                                padding: "8px 12px 7px",
                                background: bubbleBg,
                                color: bubbleColor,
                                borderRadius: bubbleRadius,
                                border: bubbleBorder,
                                fontSize: 14, lineHeight: 1.55,
                                wordBreak: "break-word",
                                overflowWrap: "anywhere",
                                transition: "background 0.25s, opacity 0.25s",
                                opacity: msg.sending ? 0.82 : 1,
                                maxWidth: "100%",
                                minWidth: 0,
                                boxShadow: isMe && !msg.error ? "0 1px 4px rgba(37,99,235,0.18)" : "none",
                            }}>
                            {msg.replyTo && (
                                <div style={{ borderLeft: `3px solid ${isMe ? "rgba(255,255,255,0.45)" : "#2563EB"}`, padding: "4px 8px", marginBottom: 6, background: isMe ? "rgba(0,0,0,0.12)" : "#EFF6FF", borderRadius: "0 6px 6px 0" }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: isMe ? "rgba(255,255,255,0.85)" : "#2563EB", marginBottom: 1 }}>{msg.replyTo.senderName}</div>
                                    <div style={{ fontSize: 11, color: isMe ? "rgba(255,255,255,0.7)" : "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{msg.replyTo.text || "📎 Attachment"}</div>
                                </div>
                            )}
                            {atts.map((att, i) => (
                                <AttachmentPreview key={i} att={att} isMe={isMe} onPDFClick={() => setPdfOpen(att)} onImgClick={() => setImgOpen(att.url)} />
                            ))}
                            {hasText ? (
                                <div style={{ whiteSpace: "pre-wrap" }}>
                                    <LinkedText text={msg.text} isMe={isMe} />
                                </div>
                            ) : null}
                        </div>
                    )}

                    {/* Timestamp + status */}
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 10, color: "#9AA0A6" }}>
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                        {msg.isEdited && <span style={{ fontSize: 10, color: "#9AA0A6", fontStyle: "italic" }}>(edited)</span>}
                        {msg.sending && !msg.error && (
                            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#9AA0A6" }}>
                                <span style={{ display: "inline-block", width: 9, height: 9, border: "1.5px solid #9AA0A6", borderTopColor: "transparent", borderRadius: "50%", animation: "mb-spin 0.8s linear infinite" }} />
                                sending
                            </span>
                        )}
                        {msg.error && <span style={{ fontSize: 10, color: "#D93025", display: "flex", alignItems: "center", gap: 3 }}>Not sent</span>}
                        {isMe && !msg.sending && !msg.error && <span style={{ fontSize: 11, color: "#9AA0A6", lineHeight: 1 }}>✓</span>}
                    </div>

                    {msg.error && (
                        <div style={{ fontSize: 11, color: "#D93025", background: "#FCE8E6", padding: "4px 10px", borderRadius: 8, border: "1px solid #F5C6C2", overflowWrap: "anywhere" }}>
                            Failed to send. Check your connection.
                        </div>
                    )}
                </div>
            </div>

            {/* PDF lightbox */}
            {pdfOpen && <PDFModal att={pdfOpen} onClose={() => setPdfOpen(false)} />}

            {/* Image lightbox */}
            {imgOpen && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setImgOpen(null)}>
                    <img src={imgOpen} alt="" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 10, objectFit: "contain" }} onClick={e => e.stopPropagation()} />
                    <button style={{ position: "absolute", top: 18, right: 18, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", borderRadius: "50%", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setImgOpen(null)}>✕</button>
                </div>
            )}
        </div>
    );
}

/* ── Attachment preview ──────────────────────────────────── */
function AttachmentPreview({ att, isMe, onPDFClick, onImgClick, bare = false }) {
    if (att.type === "image") {
        return (
            <img src={att.url} alt={att.name || "image"} onClick={onImgClick}
                style={{
                    width: "auto",
                    maxWidth: bare ? 280 : 240,
                    maxHeight: 260,
                    borderRadius: 12,
                    objectFit: "cover",
                    cursor: "pointer",
                    display: "block",
                    marginBottom: bare ? 0 : 6,
                    border: "1px solid #E5E7EB",
                    /* never wider than the bubble column */
                    minWidth: 0,
                }} />
        );
    }
    if (att.type === "pdf") {
        return (
            <div onClick={onPDFClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: isMe ? "rgba(255,255,255,0.15)" : "#E8EAED", borderRadius: 9, cursor: "pointer", marginBottom: 6, maxWidth: 240, minWidth: 0 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>📄</span>
                <div style={{ overflow: "hidden", minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isMe ? "#fff" : "#202124" }}>{att.name || "Document"}</div>
                    <div style={{ fontSize: 11, color: isMe ? "rgba(255,255,255,0.65)" : "#5F6368" }}>Click to view PDF</div>
                </div>
            </div>
        );
    }
    if (att.type === "voice") {
        return <div style={{ marginBottom: 6, minWidth: 0 }}><audio controls src={att.url} style={{ height: 36, maxWidth: 240, width: "100%" }} /></div>;
    }
    return null;
}

/* ── PDF modal ───────────────────────────────────────────── */
function PDFModal({ att, onClose }) {
    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
            <div style={{ background: "#fff", borderRadius: 14, width: "min(900px,96vw)", height: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #E8EAED", minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "#202124", display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>📄</span> {att.name || "Document"}
                    </span>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        {att.downloadUrl && <a href={att.downloadUrl} target="_blank" rel="noopener noreferrer" style={pdfBtnStyle}>Download</a>}
                        <a href={att.url} target="_blank" rel="noopener noreferrer" style={pdfBtnStyle}>Open</a>
                        <button onClick={onClose} style={{ ...pdfBtnStyle, background: "transparent", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
                    </div>
                </div>
                {att.embedUrl ? (
                    <iframe src={att.embedUrl} style={{ flex: 1, border: "none", width: "100%" }} title={att.name} />
                ) : (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#5F6368", gap: 12, padding: 20, textAlign: "center" }}>
                        <span style={{ fontSize: 48 }}>📄</span>
                        <p style={{ margin: 0 }}>Preview not available.</p>
                        {att.url && <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>Open in Google Drive</a>}
                    </div>
                )}
            </div>
        </div>
    );
}

const pdfBtnStyle = {
    padding: "5px 12px", background: "#F8F9FA", border: "1px solid #E8EAED",
    borderRadius: 6, fontSize: 12, color: "#3C4043", cursor: "pointer",
    textDecoration: "none", fontWeight: 500, whiteSpace: "nowrap",
};