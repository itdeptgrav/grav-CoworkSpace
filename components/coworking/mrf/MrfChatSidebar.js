// components/coworking/mrf/MrfChatSidebar.js
//
// Right-side chat panel scoped to ONE material request.
//
// The thread is stored in Mongo next to the MRF and is shared with the Store
// Person on the CMS side — they authenticate differently, so the backend is
// the meeting point. Live updates arrive on the Socket.IO room `mrf_<id>`.
"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { getCoworkSocket } from "../../../lib/coworkSocket"
import {
  fetchMrfChat, sendMrfChat, markMrfChatRead, uploadProductImage,
} from "../../../lib/mrfApi"

const C = {
  primary: "#1B4F8A", primaryLight: "#EBF2FA", primaryBorder: "#BFDBFE",
  border: "#E5E7EB", borderLight: "#F3F4F6",
  text: "#111827", textSub: "#4B5563", textMuted: "#9CA3AF",
  surface: "#F9FAFB", white: "#fff",
  amber: "#B45309", amberLight: "#FFFBEB", amberBorder: "#FDE68A",
}
const FONT = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif"

const ROLE_LABEL = {
  employee: "Requester",
  tl: "Primary Manager / TL",
  store: "Store",
  ceo: "CEO",
  system: "System",
}
const ROLE_COLOR = {
  employee: "#1B4F8A",
  tl: "#7C3AED",
  store: "#059669",
  ceo: "#B45309",
  system: "#6B7280",
}

const fmtTime = (t) =>
  !t ? "" : new Date(t).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  })

/**
 * @param {object}   mrf        the MRF this thread belongs to
 * @param {string}   employeeId current user's biometric id (own-message check)
 * @param {function} onClose
 * @param {function} onCounts   (count) => void — lets the parent update its badge
 */
export default function MrfChatSidebar({ mrf, employeeId, onClose, onCounts, subjectType = "MRF" }) {
  const mrfId = mrf?._id
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [isFinal, setIsFinal] = useState(false)
  const [pendingImages, setPendingImages] = useState([])
  const [uploading, setUploading] = useState(false)

  const scrollRef = useRef(null)
  const fileRef = useRef(null)

  const scrollToEnd = useCallback((smooth = false) => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" })
    })
  }, [])

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mrfId) return
    let cancelled = false
      ; (async () => {
        setLoading(true); setError("")
        try {
          const d = await fetchMrfChat(mrfId, {}, subjectType)
          if (cancelled) return
          setMessages(d.messages || [])
          setIsFinal(!!d.isFinal)
          onCounts?.(0)
          scrollToEnd()
        } catch (e) {
          if (!cancelled) setError(e.message || "Could not load the conversation.")
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mrfId, subjectType])

  // ── Live updates ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mrfId) return
    const socket = getCoworkSocket(employeeId)
    socket.emit("join_mrf", mrfId)

    const onMessage = (payload) => {
      if (String(payload?.mrfId) !== String(mrfId)) return
      setMessages(prev => {
        // The sender already appended it optimistically.
        if (prev.some(m => String(m._id) === String(payload.message?._id))) return prev
        return [...prev, payload.message]
      })
      markMrfChatRead(mrfId, subjectType).catch(() => { })
      scrollToEnd(true)
    }

    socket.on("mrf_chat_message", onMessage)
    return () => {
      socket.off("mrf_chat_message", onMessage)
      socket.emit("leave_mrf", mrfId)
    }
  }, [mrfId, employeeId, scrollToEnd])

  // ── Attachments ─────────────────────────────────────────────────────────
  const handleFiles = async (files) => {
    const list = Array.from(files || []).filter(f => f.type.startsWith("image/"))
    if (!list.length) return
    setUploading(true); setError("")
    try {
      const uploaded = []
      for (const f of list.slice(0, 5 - pendingImages.length)) {
        uploaded.push(await uploadProductImage(f, "mrf-chat"))
      }
      setPendingImages(prev => [...prev, ...uploaded])
    } catch (e) {
      setError(e.message || "Image upload failed — you can still send text.")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  // ── Send ────────────────────────────────────────────────────────────────
  const send = async () => {
    const body = draft.trim()
    if ((!body && !pendingImages.length) || sending) return
    setSending(true); setError("")
    try {
      const d = await sendMrfChat(mrfId, { body, attachments: pendingImages }, subjectType)
      setMessages(prev =>
        prev.some(m => String(m._id) === String(d.message?._id)) ? prev : [...prev, d.message]
      )
      setDraft(""); setPendingImages([])
      scrollToEnd(true)
    } catch (e) {
      setError(e.message || "Message could not be sent.")
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (!mrf) return null

  // A material request has an MRF number; a product request is identified by
  // the item(s) the person asked for.
  const subjectLabel = subjectType === "PRODUCT_REQUEST"
    ? ((mrf.products || []).map(p => p.itemName).filter(Boolean).join(", ") || "Product request")
    : mrf.mrfNumber

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.22)", zIndex: 1100 }}
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(440px,100vw)", background: C.white,
          borderLeft: `1px solid ${C.border}`, boxShadow: "-4px 0 20px rgba(0,0,0,0.08)",
          zIndex: 1101, display: "flex", flexDirection: "column", fontFamily: FONT,
        }}
      >
        {/* Header */}
        <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Request Chat</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ fontFamily: "monospace", color: C.primary, fontWeight: 700 }}>{subjectLabel}</span>
              {" · "}Requester, TL and Store
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close chat"
            style={{ width: 27, height: 27, borderRadius: 5, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSub, flexShrink: 0 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {isFinal && (
          <div style={{ padding: "7px 16px", background: C.amberLight, borderBottom: `1px solid ${C.amberBorder}`, fontSize: 11, color: C.amber }}>
            This request is closed. You can still message here if something needs clarifying.
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", background: C.surface }}>
          {loading ? (
            <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center", padding: "28px 0" }}>Loading conversation…</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "34px 12px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>No messages yet</div>
              <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 5, lineHeight: 1.5 }}>
                Use this to sort out availability, quantity, variants or an alternative
                product with the Store — it stays attached to {mrf.mrfNumber}.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.map(m => {
                if (m.isSystem) {
                  return (
                    <div key={m._id} style={{ alignSelf: "center", maxWidth: "92%", textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: C.textSub, background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: "5px 10px", lineHeight: 1.45 }}>
                        {m.body}
                      </div>
                      <div style={{ fontSize: 9.5, color: C.textMuted, marginTop: 2 }}>{fmtTime(m.createdAt)}</div>
                    </div>
                  )
                }
                const mine = m.senderBiometricId && m.senderBiometricId === employeeId
                const roleColor = ROLE_COLOR[m.senderRole] || C.textSub
                return (
                  <div key={m._id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                    {!mine && (
                      <div style={{ fontSize: 10, marginBottom: 2, display: "flex", gap: 5, alignItems: "center" }}>
                        <span style={{ fontWeight: 700, color: C.text }}>{m.senderName || "Unknown"}</span>
                        <span style={{ color: roleColor, fontWeight: 600 }}>{ROLE_LABEL[m.senderRole] || m.senderRole}</span>
                      </div>
                    )}
                    <div
                      style={{
                        background: mine ? C.primary : C.white,
                        color: mine ? "#fff" : C.text,
                        border: mine ? "none" : `1px solid ${C.border}`,
                        borderRadius: 9,
                        padding: "7px 10px",
                        fontSize: 12.5,
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.body}
                      {(m.attachments || []).length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: m.body ? 7 : 0 }}>
                          {m.attachments.map((a, i) => (
                            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={a.url}
                                alt={a.name || "attachment"}
                                style={{ width: 78, height: 78, objectFit: "cover", borderRadius: 6, border: `1px solid ${mine ? "rgba(255,255,255,0.35)" : C.border}` }}
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 9.5, color: C.textMuted, marginTop: 2, textAlign: mine ? "right" : "left" }}>
                      {fmtTime(m.createdAt)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Composer */}
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 14px", flexShrink: 0, background: C.white }}>
          {error && (
            <div style={{ fontSize: 11, color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 5, padding: "5px 8px", marginBottom: 7 }}>
              {error}
            </div>
          )}

          {pendingImages.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
              {pendingImages.map((im, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={im.url} alt={im.name} style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 5, border: `1px solid ${C.border}` }} />
                  <button
                    onClick={() => setPendingImages(prev => prev.filter((_, x) => x !== i))}
                    aria-label="Remove attachment"
                    style={{ position: "absolute", top: -5, right: -5, width: 16, height: 16, borderRadius: "50%", border: "none", background: "#111827", color: "#fff", cursor: "pointer", fontSize: 10, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "flex-end", gap: 7 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={e => handleFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || pendingImages.length >= 5}
              title={pendingImages.length >= 5 ? "Up to 5 images per message" : "Attach an image"}
              style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: uploading || pendingImages.length >= 5 ? "not-allowed" : "pointer", color: C.textSub, display: "flex", alignItems: "center", justifyContent: "center", opacity: uploading || pendingImages.length >= 5 ? 0.5 : 1 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
            </button>

            <textarea
              rows={1}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about availability, quantity, variants…"
              style={{
                flex: 1, resize: "none", maxHeight: 110, minHeight: 32,
                padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 6,
                fontSize: 12.5, fontFamily: FONT, color: C.text, outline: "none", lineHeight: 1.4,
              }}
              onFocus={e => { e.target.style.borderColor = C.primary }}
              onBlur={e => { e.target.style.borderColor = C.border }}
            />

            <button
              onClick={send}
              disabled={sending || uploading || (!draft.trim() && !pendingImages.length)}
              style={{
                width: 32, height: 32, flexShrink: 0, borderRadius: 6, border: "none",
                background: sending || (!draft.trim() && !pendingImages.length) ? "#93C5FD" : C.primary,
                color: "#fff",
                cursor: sending || (!draft.trim() && !pendingImages.length) ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              aria-label="Send message"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
            {uploading ? "Uploading image…" : "Enter to send · Shift+Enter for a new line"}
          </div>
        </div>
      </div>
    </>
  )
}
