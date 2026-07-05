"use client";
/**
 * app/coworking/direct-messages/page.js
 *
 * CHANGES:
 *  1. Formal / professional UI — flat message bubbles, no dot grid, clean shadows
 *  2. Reply fix — replyTo now persisted in Firestore so it renders after send
 *  3. Nested Chat (Sub-Chat) — right-slider panel with list / create / view sub-chat threads
 */
import { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  collection, query, where, orderBy, limit, limitToLast, startAfter, endBefore,
  onSnapshot, getDocs, getDoc, doc, setDoc, updateDoc,
  serverTimestamp, writeBatch, arrayUnion, increment,
} from "firebase/firestore";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import MeetingSummaryModal from "../../../components/coworking/meets/MeetingSummaryModal";
import { cancelMeet, updateMeet } from "../../../lib/coworkApi";
import MediaMessageInput from "../../../components/coworking/messaging/MediaMessageInput";
import LinkedText from "../../../components/coworking/messaging/LinkedText";
import { GwSpinner } from "../../../components/coworking/shared/CoworkShared";
import { firebaseDb, firebaseAuth } from "../../../lib/coworkFirebase";
import DMCallManager, { triggerCall } from "../../../components/coworking/messaging/DMCallManager";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
async function apiFetch(path, opts = {}) {
  const token = await firebaseAuth.currentUser?.getIdToken();
  const res = await fetch(`${BASE_URL}/cowork${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "Failed");
  return d;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function convId(a, b) { return [a, b].sort().join("_"); }
function tsToMs(ts) {
  if (!ts) return 0;
  if (ts?.seconds) return ts.seconds * 1000;
  const d = new Date(ts); return isNaN(d.getTime()) ? 0 : d.getTime();
}
function tsToISO(ts) {
  if (!ts) return new Date().toISOString();
  if (ts?.seconds) return new Date(ts.seconds * 1000).toISOString();
  return ts;
}
function fmtTime(ts) {
  const d = new Date(tsToMs(ts) || Date.now());
  if (isNaN(d)) return "";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtConv(ts) {
  const ms = tsToMs(ts); if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 60000) return "now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h";
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function resolveMessageType(mt, atts) {
  if (mt && mt !== "text") return mt;
  if (atts?.length > 0) return atts[0].type || "image";
  return "text";
}
function getInit(name = "") {
  return name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}
const AV_COLORS = ["#1a73e8", "#7c3aed", "#0f9d58", "#d93025", "#f59e0b", "#0891b2", "#db2777", "#16a34a"];
const avBg = (n = "") => AV_COLORS[(n.charCodeAt(0) || 0) % AV_COLORS.length];

// ─── WhatsApp ticks ───────────────────────────────────────────────────────────
function Ticks({ status, isMe }) {
  if (!isMe) return null;
  if (status === "sending") return <span style={{ fontSize: 10, opacity: .4, marginLeft: 2 }}>&#9675;</span>;
  if (status === "sent") return (
    <svg width="14" height="9" viewBox="0 0 14 9" style={{ marginLeft: 2, flexShrink: 0 }}>
      <path d="M1 4.5L4.5 8L13 1" stroke="rgba(255,255,255,0.6)" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (status === "delivered") return (
    <svg width="18" height="9" viewBox="0 0 18 9" style={{ marginLeft: 2, flexShrink: 0 }}>
      <path d="M1 4.5L4.5 8L13 1" stroke="rgba(255,255,255,0.65)" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 4.5L8.5 8L17 1" stroke="rgba(255,255,255,0.65)" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (status === "read") return (
    <svg width="18" height="9" viewBox="0 0 18 9" style={{ marginLeft: 2, flexShrink: 0 }}>
      <path d="M1 4.5L4.5 8L13 1" stroke="#93C5FD" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 4.5L8.5 8L17 1" stroke="#93C5FD" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  return null;
}

// ─── Unread badge ─────────────────────────────────────────────────────────────
function Badge({ n }) {
  if (!n) return null;
  return (
    <div style={{ minWidth: 18, height: 18, borderRadius: 9, background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", flexShrink: 0 }}>
      {n > 99 ? "99+" : n}
    </div>
  );
}

// ─── Image lightbox ───────────────────────────────────────────────────────────
function Lightbox({ url, onClose, onDl }) {
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
        <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "88vh", objectFit: "contain", borderRadius: 10, display: "block" }} />
        <button onClick={onDl} title="Download image" style={{ position: "absolute", bottom: 14, right: 14, display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 999, background: "#1a73e8", border: "none", cursor: "pointer", color: "#fff", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", boxShadow: "0 2px 10px rgba(0,0,0,0.35)", whiteSpace: "nowrap" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          Download image
        </button>
        <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, width: 34, height: 34, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", cursor: "pointer", color: "#fff", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>&#x2715;</button>
      </div>
    </div>
  );
}

// ─── PDF / Document attachment card ──────────────────────────────────────────
function DocCard({ att, isMe, onDl }) {
  const name = att.name || "Attachment";
  const ext = name.split(".").pop()?.toUpperCase() || "FILE";
  const sizeStr = att.bytes ? (att.bytes > 1048576 ? (att.bytes / 1048576).toFixed(1) + " MB" : (att.bytes / 1024).toFixed(0) + " KB") : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: isMe ? "rgba(255,255,255,0.12)" : "#F8FAFF", border: isMe ? "1px solid rgba(255,255,255,0.15)" : "1px solid #E2E8F0", borderRadius: 10, padding: "9px 11px", marginTop: 4, minWidth: 190, maxWidth: 250 }}>
      <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, background: isMe ? "rgba(255,255,255,0.15)" : "#EEF2FF", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isMe ? "rgba(255,255,255,0.8)" : "#4F46E5"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
        <span style={{ fontSize: 7, fontWeight: 800, color: isMe ? "rgba(255,255,255,0.65)" : "#4F46E5", marginTop: -2 }}>{ext.slice(0, 4)}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: isMe ? "rgba(255,255,255,0.95)" : "#1E293B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        {sizeStr && <div style={{ fontSize: 10, color: isMe ? "rgba(255,255,255,0.5)" : "#94A3B8", marginTop: 1 }}>{sizeStr}</div>}
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ width: 26, height: 26, borderRadius: 6, background: isMe ? "rgba(255,255,255,0.12)" : "#E8EEFF", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", color: isMe ? "rgba(255,255,255,0.8)" : "#4F46E5" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
        </a>
        <button onClick={() => onDl(att.url)} style={{ width: 26, height: 26, borderRadius: 6, background: isMe ? "rgba(255,255,255,0.12)" : "#E8EEFF", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: isMe ? "rgba(255,255,255,0.8)" : "#4F46E5" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
        </button>
      </div>
    </div>
  );
}

// ─── Context menu ─────────────────────────────────────────────────────────────
function CtxMenu({ items, isMe, onClose }) {
  const ref = useRef(null);
  const [flip, setFlip] = useState(false);
  // FIX: menu always opened UPWARD; for messages near the top of the scroll
  // container it extended past the container's top edge and got clipped
  // (z-index cannot escape an ancestor's overflow clipping). Measure before
  // paint and flip downward when there is no room above.
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    let anc = el.parentElement;
    while (anc && anc !== document.body) {
      const oy = getComputedStyle(anc).overflowY;
      if (oy === "auto" || oy === "scroll") break;
      anc = anc.parentElement;
    }
    const boundTop = anc && anc !== document.body ? anc.getBoundingClientRect().top : 0;
    if (el.getBoundingClientRect().top < boundTop + 4) setFlip(true);
  }, []);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 10);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onClose]);
  return (
    <div ref={ref} style={{ position: "absolute", [isMe ? "right" : "left"]: 0, bottom: "calc(100% + 6px)", zIndex: 9999, background: "#fff", borderRadius: 10, boxShadow: "0 6px 24px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #E5E7EB", minWidth: 172, overflow: "hidden", padding: "3px 0" }}>
      {items.map(item => (
        <button key={item.label} onMouseDown={e => { e.preventDefault(); e.stopPropagation(); item.action(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", background: "transparent", color: item.red ? "#EF4444" : "#1F2937", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }} onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ─── Request status/priority colours ─────────────────────────────────────────
const REQ_STATUS_COLORS = {
  pending: { color: "#D97706", bg: "#FEF3C7", border: "#FDE68A" },
  approved: { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  rejected: { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
};
const REQ_PRI_COLOR = { urgent: "#DC2626", high: "#D97706", medium: "#6366F1", low: "#6B7280" };
const REQ_PRI_BG = { urgent: "#FEF2F2", high: "#FEF3C7", medium: "#EEF2FF", low: "#F9FAFB" };

// ─── Message Bubble ───────────────────────────────────────────────────────────
function Bubble({ msg, isMe, showAvatar, onImg, onDl, isHost = false, onViewSummary = null, onCancel = null, onEdit = null, onCopied, onReply = null, onDeleteMsg = null, onEditMsg = null, currentUserId = null, onJumpToReply = null, highlight = false }) {
  const status = msg.status || (msg.sending ? "sending" : "sent");
  const rowId = `dm-msg-${msg.messageId || msg.id || ""}`;
  const rowCls = highlight ? "dm-jump-hl" : undefined;
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
  const isSender = currentUserId && msg.senderId === currentUserId;

  // ── Deleted placeholder ──────────────────────────────────────────────────
  if (msg.isDeleted) {
    return (
      <div id={rowId} className={rowCls} style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 6, marginBottom: 2 }}>
        <div style={{ width: 28, flexShrink: 0 }} />
        <div style={{ padding: "8px 13px", borderRadius: 10, border: "1.5px dashed #D1D5DB", background: "#F9FAFB", fontSize: 13, color: "#9CA3AF", fontStyle: "italic", display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
          This message was deleted.
        </div>
      </div>
    );
  }

  // ── Meeting invite card ───────────────────────────────────────────────────
  if (msg.messageType === "meeting_invite") {
    const md = msg.meetingData || {};
    const isLiveNow = md.dateTime ? (Date.now() >= new Date(md.dateTime).getTime() && Date.now() <= new Date(md.dateTime).getTime() + 2 * 3600000) : false;
    return (
      <div id={rowId} className={rowCls} style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 6, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, flexShrink: 0 }}>
          {showAvatar && !isMe && (
            msg.senderPicUrl
              ? <img src={msg.senderPicUrl} alt={msg.senderName} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
              : <div style={{ width: 28, height: 28, borderRadius: "50%", background: avBg(msg.senderName || ""), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9.5, fontWeight: 700 }}>{getInit(msg.senderName || "")}</div>
          )}
        </div>
        <div style={{ maxWidth: 300, display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
          {showAvatar && !isMe && <span style={{ fontSize: 10.5, color: "#64748B", fontWeight: 600, marginBottom: 3, paddingLeft: 3 }}>{msg.senderName}</span>}
          <div style={{ background: "#fff", border: `2px solid ${isLiveNow ? "#DC2626" : "#16A34A"}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", width: 290 }}>
            <div style={{ background: isLiveNow ? "#DC2626" : "#16A34A", padding: "11px 15px", display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 30, height: 30, background: "rgba(255,255,255,0.18)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: "0.04em" }}>{isLiveNow ? "🔴 LIVE NOW" : "📹 MEETING INVITATION"}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>from {msg.senderName}</div>
              </div>
            </div>
            <div style={{ padding: "13px 15px", display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{md.meetTitle || "CoWork Meeting"}</div>
              {md.description && <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>{md.description}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
                {md.dateTime && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span>📅</span><span>{new Date(md.dateTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span></div>}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>🔑</span>
                  <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900, color: isLiveNow ? "#DC2626" : "#16A34A", letterSpacing: 4, background: isLiveNow ? "#FEF2F2" : "#F0FDF4", padding: "2px 9px", borderRadius: 7 }}>{md.joinCode || md.meetId}</span>
                </div>
              </div>
              <a href={`/coworking/cowork-meeting/${md.meetId}`} style={{ display: "block", width: "100%", padding: "9px 0", background: isLiveNow ? "#DC2626" : "#16A34A", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, textAlign: "center", textDecoration: "none", marginTop: 3 }}>
                {isLiveNow ? "🔴 Join Live Meeting" : "🎥 Join Meeting"}
              </a>
              {isHost && md.meetId && (
                <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
                  {onViewSummary && <button onClick={() => onViewSummary(md.meetId, md.meetTitle)} style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>Summary</button>}
                  {onEdit && <button onClick={() => onEdit({ meetId: md.meetId, title: md.meetTitle, description: md.description, dateTime: md.dateTime, participants: [] })} style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>Edit</button>}
                  {onCancel && isMe && <button onClick={() => onCancel(md.meetId, md.meetTitle)} style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>Cancel</button>}
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 3 }}>{fmtTime(msg.createdAt)}</div>
        </div>
      </div>
    );
  }

  // ── Standard message ──────────────────────────────────────────────────────
  return (
    <div id={rowId} className={rowCls} style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 6, marginBottom: 2 }}>
      <div style={{ width: 28, height: 28, flexShrink: 0 }}>
        {showAvatar && !isMe && (
          msg.senderPicUrl
            ? <img src={msg.senderPicUrl} alt={msg.senderName} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
            : <div style={{ width: 28, height: 28, borderRadius: "50%", background: avBg(msg.senderName || ""), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9.5, fontWeight: 700 }}>{getInit(msg.senderName || "")}</div>
        )}
      </div>
      <div className="dm-bub-col" style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
        {showAvatar && !isMe && (
          <span style={{ fontSize: 10.5, color: "#64748B", fontWeight: 600, marginBottom: 3, paddingLeft: 3 }}>{msg.senderName}</span>
        )}
        <div className="dm-bubble-wrap" style={{ position: "relative", display: "inline-flex", alignItems: "flex-start", flexDirection: isMe ? "row-reverse" : "row", gap: 4 }}>
          {ctxMenu && (
            <CtxMenu isMe={isMe}
              items={[
                { icon: "↩", label: "Reply", action: () => { setCtxMenu(false); onReply?.(msg); } },
                ...(msg.text ? [{ icon: "⎘", label: "Copy Text", action: () => { setCtxMenu(false); handleCopy(); } }] : []),
                ...(isSender && msg.text ? [{ icon: "✎", label: "Edit Message", action: () => { setCtxMenu(false); onEditMsg?.(msg); } }] : []),
                ...(isSender ? [{ icon: "🗑", label: "Delete", action: () => { setCtxMenu(false); onDeleteMsg?.(msg); }, red: true }] : []),
              ]}
              onClose={() => setCtxMenu(false)}
            />
          )}

          {/* ── BUBBLE — formal flat design ── */}
          <div
            onDoubleClick={openCtx}
            onContextMenu={openCtx}
            onTouchEnd={handleDoubleTap}
            style={{
              padding: "9px 13px 7px",
              borderRadius: isMe ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
              background: msg.error ? "#FEF2F2" : isMe ? "#1a73e8" : "#FFFFFF",
              color: msg.error ? "#DC2626" : isMe ? "#fff" : "#1E293B",
              border: msg.error ? "1.5px solid #FECACA" : isMe ? "none" : "1px solid #E8EDF3",
              boxShadow: isMe ? "0 1px 3px rgba(26,115,232,0.2)" : "0 1px 3px rgba(15,23,42,0.05)",
              fontSize: 13.5, lineHeight: 1.55, opacity: msg.sending ? .65 : 1,
              wordBreak: "break-word", cursor: "default",
            }}>

            {/* Reply quote — FIX: renders msg.replyTo if present */}
            {msg.replyTo && (
              <div
                onClick={(e) => { if (onJumpToReply && msg.replyTo.messageId) { e.stopPropagation(); onJumpToReply(msg.replyTo.messageId); } }}
                title={onJumpToReply && msg.replyTo.messageId ? "Go to original message" : undefined}
                style={{
                  borderLeft: `3px solid ${isMe ? "rgba(255,255,255,0.5)" : "#2563EB"}`,
                  paddingLeft: 8, marginBottom: 7,
                  background: isMe ? "rgba(0,0,0,0.1)" : "#EFF6FF",
                  borderRadius: "0 6px 6px 0",
                  padding: "4px 8px",
                  marginBottom: 6,
                  cursor: onJumpToReply && msg.replyTo.messageId ? "pointer" : "default",
                }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: isMe ? "rgba(255,255,255,0.85)" : "#2563EB", marginBottom: 1 }}>{msg.replyTo.senderName}</div>
                <div style={{ fontSize: 11, color: isMe ? "rgba(255,255,255,0.7)" : "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                  {msg.replyTo.text || "📎 Attachment"}
                </div>
              </div>
            )}

            {msg.text && <div><LinkedText text={msg.text} isMe={isMe} /></div>}

            {msg.attachments?.map((a, i) => (
              <div key={i} style={{ marginTop: msg.text ? 5 : 0 }}>
                {a.type === "image" && <img src={a.url} alt="" onClick={() => onImg(a.url)} style={{ maxWidth: 210, maxHeight: 158, borderRadius: 8, cursor: "zoom-in", display: "block", marginTop: 2 }} />}
                {a.type === "voice" && <div style={{ marginTop: 2 }}><audio controls src={a.url} style={{ maxWidth: "100%", height: 34, display: "block" }} /></div>}
                {a.type !== "image" && a.type !== "voice" && <DocCard att={a} isMe={isMe} onDl={onDl} />}
              </div>
            ))}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2, marginTop: 5 }}>
              <span style={{ fontSize: 10, color: isMe ? "rgba(255,255,255,0.55)" : "#94A3B8", whiteSpace: "nowrap" }}>{fmtTime(msg.createdAt)}</span>
              {msg.isEdited && <span style={{ fontSize: 10, color: isMe ? "rgba(255,255,255,0.45)" : "#9CA3AF", fontStyle: "italic" }}>(edited)</span>}
              <Ticks status={status} isMe={isMe} />
            </div>
          </div>

          {/* Copy button on hover */}
          {msg.text && (
            <button className="dm-copy-btn" title={copyFlash ? "Copied!" : "Copy"} onClick={handleCopy}
              style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #E2E8F0", background: copyFlash ? "#F0FDF4" : "#fff", color: copyFlash ? "#16A34A" : "#94A3B8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, alignSelf: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.06)", transition: "all 0.12s", opacity: 0 }}>
              {copyFlash
                ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
              }
            </button>
          )}
        </div>
        {msg.error && <div style={{ fontSize: 10, color: "#EF4444", marginTop: 2 }}>Failed to send</div>}
      </div>
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Av({ name, size = 40, url }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: avBg(name || ""), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: size * 0.35, fontWeight: 700, flexShrink: 0 }}>
      {getInit(name || "")}
    </div>
  );
}

// ─── Request Card (in thread) ─────────────────────────────────────────────────
function ThreadRequestCard({ req, employeeId }) {
  const sc = REQ_STATUS_COLORS[req.status] || REQ_STATUS_COLORS.pending;
  const isFromMe = req.fromId === employeeId;
  const isToMe = req.toId === employeeId;
  const fire = (extra) => window.dispatchEvent(new CustomEvent("openRequestPanel", { detail: { tab: isToMe ? "received" : "sent", requestId: req.id, ...extra } }));
  return (
    <div style={{ display: "flex", justifyContent: isFromMe ? "flex-end" : "flex-start", width: "100%", marginBottom: 4 }}>
      <div style={{ maxWidth: 270, width: "100%", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", border: "1px solid #E2E8F0", background: "#fff" }}>
        <div style={{ background: "#1E293B", padding: "9px 13px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em" }}>Request</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>from {req.fromName}</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 99, color: sc.color, background: sc.bg, border: `1px solid ${sc.border}`, flexShrink: 0 }}>{req.status}</span>
          {req.priority && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 5, color: REQ_PRI_COLOR[req.priority], background: REQ_PRI_BG[req.priority], flexShrink: 0 }}>{req.priority}</span>}
        </div>
        <div style={{ padding: "9px 13px 11px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{req.subject}</div>
          {req.message && <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{req.message}</div>}
          {req.dueDate && <div style={{ fontSize: 11, color: "#D97706", fontWeight: 600 }}>⏰ Due {new Date(req.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>}
          <div style={{ display: "flex", gap: 5, marginTop: 3 }}>
            {isToMe && req.status === "pending" && (
              <button onClick={() => fire({ openRespond: true })} style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "none", background: "#16A34A", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>✓ Respond</button>
            )}
            <button onClick={() => fire({ openChat: true })} style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "1px solid #E2E8F0", background: "#fff", color: "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>💬 Chat</button>
            <button onClick={() => fire({})} style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "1px solid #E2E8F0", background: "#fff", color: "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>View →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUB-CHAT FULL VIEW  (replaces main chat area — not the slider)
// ─────────────────────────────────────────────────────────────────────────────
function SubChatFullView({ subChat, cid, employeeId, employeeName, otherPersonId, onBack }) {
  const [msgs, setMsgs] = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(true);
  const [scLightbox, setScLightbox] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editText, setEditText] = useState("");
  const [pasteUploading, setPasteUploading] = useState(false);
  const endRef = useRef(null);
  const editInputRef = useRef(null);

  const dlFile = async (url) => {
    if (!url) return;
    // Derive a real filename from the URL, fallback to timestamp
    const name = (() => {
      try { const p = new URL(url).pathname.split("/").pop(); return p && p.includes(".") ? decodeURIComponent(p) : "file_" + Date.now(); }
      catch { return "file_" + Date.now(); }
    })();
    // FIX: browsers ignore the `download` attribute on cross-origin URLs, so a plain
    // <a download> just navigates to Cloudinary. For Cloudinary, inject fl_attachment
    // so it responds with Content-Disposition: attachment → real download.
    if (url.includes("res.cloudinary.com") && url.includes("/upload/") && !url.includes("fl_attachment")) {
      const a = document.createElement("a");
      a.href = url.replace("/upload/", "/upload/fl_attachment/");
      a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      return;
    }
    // Non-Cloudinary hosts: fetch → blob → object URL (download attr works on blob:)
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    } catch (e) {
      console.error("dlFile:", e);
      window.open(url, "_blank"); // last resort — at least show the file
    }
  };

  useEffect(() => {
    setMsgsLoading(true);
    const q = query(
      collection(firebaseDb, "cowork_direct_messages", cid, "sub_chats", subChat.id, "messages"),
      orderBy("createdAt", "asc"), limitToLast(400)
    );

    const unsub = onSnapshot(q, snap => {
      setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setMsgsLoading(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
      // Mark sub-chat as read for current user
      updateDoc(
        doc(firebaseDb, "cowork_direct_messages", cid, "sub_chats", subChat.id),
        { [`unread.${employeeId}`]: 0 }
      ).catch(() => { });
    }, err => { console.error(err); setMsgsLoading(false); });
    return () => unsub();
  }, [subChat.id, cid]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  // ── Reply ────────────────────────────────────────────────────────────────
  const handleReply = (msg) => {
    setReplyTo({ messageId: msg.messageId || msg.id, senderName: msg.senderName || "Unknown", text: (msg.text || "").slice(0, 120) });
    setEditingMsg(null);
  };

  // ── Edit ─────────────────────────────────────────────────────────────────
  const handleOpenEdit = (msg) => {
    if (msg.senderId !== employeeId) return;
    setEditingMsg(msg); setEditText(msg.text || ""); setReplyTo(null);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };
  const handleMsgEditSave = async () => {
    if (!editingMsg || !editText.trim()) return;
    const msgId = editingMsg.messageId || editingMsg.id; if (!msgId) return;
    try {
      await updateDoc(
        doc(firebaseDb, "cowork_direct_messages", cid, "sub_chats", subChat.id, "messages", msgId),
        { text: editText.trim(), isEdited: true, editedAt: serverTimestamp() }
      );
      setEditingMsg(null); setEditText("");
    } catch (e) { console.error("sc edit:", e); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDeleteMsg = async (msg) => {
    if (!msg || msg.senderId !== employeeId) return;
    const msgId = msg.messageId || msg.id; if (!msgId) return;
    try {
      await updateDoc(
        doc(firebaseDb, "cowork_direct_messages", cid, "sub_chats", subChat.id, "messages", msgId),
        { isDeleted: true, text: "", attachments: [], deletedAt: serverTimestamp() }
      );
    } catch (e) { console.error("sc delete:", e); }
  };

  // ── Paste image ───────────────────────────────────────────────────────────
  const handlePaste = async (e) => {
    const imageItem = Array.from(e.clipboardData?.items || []).find(it => it.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile(); if (!file) return;
    setPasteUploading(true);
    try {
      const { uploadImage } = await import("../../../lib/mediaUploadApi");
      const result = await uploadImage(file, "cowork-dm");
      window.dispatchEvent(new CustomEvent("dm_paste_attachment", { detail: { type: "image", url: result.url, name: "pasted_image.png" } }));
    } catch (err) { console.error("sc paste:", err); }
    finally { setPasteUploading(false); }
  };

  const handleSend = async (text, attachments, messageType) => {
    if (!text?.trim() && !attachments?.length) return;
    const currentReplyTo = replyTo || null;
    setReplyTo(null);
    const rt = resolveMessageType(messageType, attachments);
    const msgId = crypto.randomUUID();
    const cleanAtts = (attachments || []).map(a => { const c = {}; Object.entries(a).forEach(([k, v]) => { if (v !== undefined) c[k] = v; }); return c; });
    try {
      await setDoc(
        doc(firebaseDb, "cowork_direct_messages", cid, "sub_chats", subChat.id, "messages", msgId),
        { messageId: msgId, senderId: employeeId, senderName: employeeName, text: text || "", attachments: cleanAtts, messageType: rt, replyTo: currentReplyTo, createdAt: serverTimestamp() }
      );

      const preview = rt === "image" ? "📷 Photo" : rt === "voice" ? "🎤 Voice" : (text || "").slice(0, 60);
      await updateDoc(doc(firebaseDb, "cowork_direct_messages", cid, "sub_chats", subChat.id), {
        lastMessage: preview, updatedAt: serverTimestamp(),
        ...(otherPersonId ? { [`unread.${otherPersonId}`]: increment(1) } : {}),
      });
      // Push notification to the other person
      if (otherPersonId) {
        apiFetch("/direct-message/notify", {
          method: "POST",
          body: JSON.stringify({ toEmployeeId: otherPersonId, text: `[${subChat.name}] ${text || "📎 Attachment"}`, messageType: rt }),
        }).catch(() => { });
      }
    } catch (e) { console.error("sc send:", e); }
  };

  // Build list with date separators (use tsToMs for robust timestamp parsing)
  const withSep = [];
  let lastDate = null;
  msgs.forEach((msg, i) => {
    if (msg.isSystem) { withSep.push({ ...msg, _sys: true }); return; }
    const ms = tsToMs(msg.createdAt);
    const today = new Date(), yesterday = new Date(Date.now() - 86400000);
    const d = ms ? new Date(ms) : null;
    let ds = null;
    if (d) { if (d.toDateString() === today.toDateString()) ds = "Today"; else if (d.toDateString() === yesterday.toDateString()) ds = "Yesterday"; else ds = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
    if (ds && ds !== lastDate) { withSep.push({ _sep: true, label: ds }); lastDate = ds; }
    withSep.push({ ...msg, isMe: msg.senderId === employeeId, showAvatar: i === 0 || msgs[i - 1]?.senderId !== msg.senderId || msgs[i - 1]?.isSystem });
  });

  return (
    <>
      {scLightbox && <Lightbox url={scLightbox} onClose={() => setScLightbox(null)} onDl={() => dlFile(scLightbox)} />}

      {/* ── Sub-chat header ── */}
      <div className="sc-head">
        <button className="sc-back-btn" onClick={onBack}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          Main Chat
        </button>
        <div className="sc-head-divider" />
        <div className="sc-head-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        </div>
        <div className="sc-head-info">
          <div className="sc-head-name">{subChat.name}</div>
          {subChat.description && <div className="sc-head-desc">{subChat.description}</div>}
        </div>
        <span className="sc-head-badge">Sub-Chat</span>
      </div>

      {/* ── Messages ── */}
      <div className="sc-msgs">
        {msgsLoading && msgs.length === 0 ? <div className="dm-center"><GwSpinner size={24} /></div>
          : withSep.length === 0 ? (
            <div className="dm-chat-empty">
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{subChat.name}</div>
              <div style={{ fontSize: 12, color: "#94A3B8" }}>Start the discussion</div>
            </div>
          ) : withSep.map((item, i) => {
            if (item._sep) return <div key={"sep" + i} className="dm-datesep"><span className="dm-datesep-label">{item.label}</span></div>;
            if (item._sys || item.isSystem) return (
              <div key={item.id || i} className="sc-sys-msg">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                {item.text}
              </div>
            );
            return (
              <Bubble
                key={item.id || item.messageId || i}
                msg={{ ...item, senderPicUrl: "" }}
                isMe={item.isMe}
                showAvatar={item.showAvatar}
                onImg={setScLightbox}
                onDl={dlFile}
                isHost={false}
                onCopied={() => { }}
                currentUserId={employeeId}
                onReply={handleReply}
                onDeleteMsg={handleDeleteMsg}
                onEditMsg={handleOpenEdit}
              />
            );
          })}
        <div ref={endRef} />
      </div>

      {/* ── Input ── */}

      {/* ── Input ── */}
      <div className="dm-input" onPaste={handlePaste}>
        {/* Paste uploading indicator */}
        {pasteUploading && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0 6px", fontSize: 11, color: "#1558b0", fontWeight: 600 }}>
            <div style={{ width: 11, height: 11, borderRadius: "50%", border: "2px solid rgba(26,115,232,0.25)", borderTopColor: "#1a73e8", animation: "dm-spin 0.7s linear infinite", flexShrink: 0 }} />
            Uploading image…
          </div>
        )}
        {/* Reply preview strip */}
        {replyTo && !editingMsg && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px", background: "#F0F7FF", borderBottom: "1px solid #DBEAFE", borderLeft: "3px solid #2563EB" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#2563EB" }}>Replying to {replyTo.senderName}</div>
              <div style={{ fontSize: 11.5, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyTo.text || "📎 Attachment"}</div>
            </div>
            <button onClick={() => setReplyTo(null)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#9CA3AF", fontSize: 15, padding: 2 }}>✕</button>
          </div>
        )}
        {/* Edit bar */}
        {editingMsg ? (
          <div style={{ padding: "8px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#2563EB" }}>✎ Editing message</span>
              <button onClick={() => { setEditingMsg(null); setEditText(""); }} style={{ fontSize: 11.5, color: "#9CA3AF", border: "none", background: "transparent", cursor: "pointer" }}>✕ Cancel</button>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                ref={editInputRef}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleMsgEditSave(); } if (e.key === "Escape") { setEditingMsg(null); setEditText(""); } }}
                rows={2}
                style={{ flex: 1, resize: "none", border: "1.5px solid #2563EB", borderRadius: 9, padding: "7px 11px", fontSize: 13.5, fontFamily: "inherit", outline: "none", color: "#111827", lineHeight: 1.5 }}
              />
              <button
                onClick={handleMsgEditSave}
                disabled={!editText.trim()}
                style={{ padding: "8px 15px", borderRadius: 9, border: "none", background: editText.trim() ? "#2563EB" : "#E5E7EB", color: editText.trim() ? "#fff" : "#9CA3AF", fontSize: 13, fontWeight: 600, cursor: editText.trim() ? "pointer" : "default", fontFamily: "inherit", flexShrink: 0 }}
              >Save</button>
            </div>
            <div style={{ fontSize: 10.5, color: "#9CA3AF", marginTop: 3 }}>Enter to save · Esc to cancel</div>
          </div>
        ) : (
          <MediaMessageInput onSend={handleSend} placeholder={`Message in "${subChat.name}"…`} />
        )}
      </div>

    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  NESTED CHAT PANEL  (right slider — only LIST + CREATE; View fires onViewSubChat)
// ─────────────────────────────────────────────────────────────────────────────
function NestedChatPanel({ open, onClose, cid, employeeId, employeeName, onViewSubChat, subChatsData, scLoading }) {
  // view: "list" | "create"
  const [view, setView] = useState("list");
  const subChats = subChatsData || [];

  // create form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  // ── Load messages for active sub-chat ──────────────────────────────────
  // ── Reset on close ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) { setView("list"); setNewName(""); setNewDesc(""); setCreateErr(""); }
  }, [open]);

  // ── Create sub-chat + auto system message + open it ─────────────────────
  const handleCreate = async () => {
    if (!newName.trim()) { setCreateErr("Name is required"); return; }
    setCreating(true); setCreateErr("");
    const scId = crypto.randomUUID();
    const name = newName.trim();
    const desc = newDesc.trim();
    try {
      // 1. Create sub-chat doc
      await setDoc(doc(firebaseDb, "cowork_direct_messages", cid, "sub_chats", scId), {
        subChatId: scId, name, description: desc,
        createdBy: employeeId, createdByName: employeeName,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        lastMessage: "", messageCount: 0,
      });
      // 2. Auto system message
      const sysMsgId = crypto.randomUUID();
      await setDoc(
        doc(firebaseDb, "cowork_direct_messages", cid, "sub_chats", scId, "messages", sysMsgId),
        { messageId: sysMsgId, senderId: "system", senderName: "System", text: `This sub-chat was created for discussion of "${name}".`, isSystem: true, messageType: "system", createdAt: serverTimestamp() }
      );
      setNewName(""); setNewDesc("");
      // 3. Open immediately in full view
      onViewSubChat({ id: scId, subChatId: scId, name, description: desc });
    } catch (e) { console.error(e); setCreateErr("Failed to create. Try again."); setCreating(false); }
  };

  if (!open) return null;

  return (
    <div className="nc-panel">
      {/* ── Panel header ── */}
      <div className="nc-head">
        {view === "create" ? (
          <>
            <div className="nc-head-title" style={{ flex: 1 }}>New Sub-Chat</div>
            <button className="nc-icon-btn" onClick={() => { setView("list"); setCreateErr(""); setNewName(""); setNewDesc(""); }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </>
        ) : (
          <>
            <div className="nc-head-title" style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              Sub-Chats
            </div>
            <button className="nc-new-btn" onClick={() => { setView("create"); setCreateErr(""); }}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              New
            </button>
          </>
        )}
        <button className="nc-icon-btn" onClick={onClose} title="Close panel" style={{ marginLeft: view !== "create" ? 6 : 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* ── LIST view ── */}
      {view === "list" && (
        <div className="nc-body">
          {scLoading ? (
            <div className="nc-center"><GwSpinner size={20} /></div>
          ) : subChats.length === 0 ? (
            <div className="nc-empty">
              <div style={{ fontSize: 30, marginBottom: 8, opacity: 0.25 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 4 }}>No Sub-Chats yet</div>
              <div style={{ fontSize: 11.5, color: "#94A3B8", lineHeight: 1.5, marginBottom: 14 }}>Create a focused thread for a specific topic</div>
              <button className="nc-create-first" onClick={() => setView("create")}>Create Sub-Chat</button>
            </div>
          ) : (
            <div className="nc-list">
              {subChats.map(sc => (
                <div key={sc.id} className="nc-sc-card">
                  <div className="nc-sc-icon-wrap">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                  </div>
                  <div className="nc-sc-info">
                    <div className="nc-sc-name">{sc.name}</div>
                    {sc.description && <div className="nc-sc-desc">{sc.description}</div>}
                    {sc.lastMessage && <div className="nc-sc-last">{sc.lastMessage}</div>}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                    {(sc.unread?.[employeeId] || 0) > 0 && (
                      <div style={{ minWidth: 18, height: 18, borderRadius: 9, background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
                        {sc.unread[employeeId] > 99 ? "99+" : sc.unread[employeeId]}
                      </div>
                    )}
                    <button className="nc-view-btn" onClick={() => onViewSubChat(sc)}>View</button>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CREATE view ── */}
      {view === "create" && (
        <div className="nc-body nc-create-body">
          {createErr && (
            <div style={{ padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7, fontSize: 12, color: "#B91C1C", marginBottom: 4 }}>{createErr}</div>
          )}
          <div className="nc-field">
            <label className="nc-label">Sub-Chat Name <span style={{ color: "#EF4444" }}>*</span></label>
            <input
              className="nc-input"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Design Feedback, Bug Fix Discussion…"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
            />
          </div>
          <div className="nc-field">
            <label className="nc-label">Description <span style={{ color: "#94A3B8", fontWeight: 400, fontSize: 10.5 }}>(optional)</span></label>
            <textarea
              className="nc-input"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Briefly describe what this thread is about…"
              rows={3}
              style={{ resize: "vertical" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button className="nc-btn-secondary" onClick={() => { setView("list"); setCreateErr(""); setNewName(""); setNewDesc(""); }}>Cancel</button>
            <button className="nc-btn-primary" onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? "Creating…" : "Create Sub-Chat"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function DirectMessagesPage() {
  const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
  const isCeoOrTl = role === "ceo" || role === "tl";
  const router = useRouter();

  // ── Meeting state ─────────────────────────────────────────────────────────
  const [showMeetModal, setShowMeetModal] = useState(false);
  const [meetForm, setMeetForm] = useState({ title: "", dateTime: "", description: "" });
  const [meetBusy, setMeetBusy] = useState(false);
  const [meetError, setMeetError] = useState("");
  const [summaryModal, setSummaryModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [threadRequests, setThreadRequests] = useState([]);

  // ── Sidebar / person state ────────────────────────────────────────────────
  const [conversations, setConversations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [activeTab, setActiveTab] = useState("recents");
  const [convsLoading, setConvsLoading] = useState(true);
  const [empsLoading, setEmpsLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [unread, setUnread] = useState({});

  // ── Nested Chat ───────────────────────────────────────────────────────────
  const [nestedOpen, setNestedOpen] = useState(false);
  const [activeSubChat, setActiveSubChat] = useState(null);
  const [subChatsForPanel, setSubChatsForPanel] = useState([]);
  const [subChatsLoading, setSubChatsLoading] = useState(false);
  const [subChatUnread, setSubChatUnread] = useState(0);

  // ── Paste / copy toast ────────────────────────────────────────────────────
  const [pasteUploading, setPasteUploading] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const copyToastTimerRef = useRef(null);
  const showCopyToast = () => {
    setCopyToast(true);
    if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
    copyToastTimerRef.current = setTimeout(() => setCopyToast(false), 1500);
  };

  // ── Reply / Edit / Delete state ───────────────────────────────────────────
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editText, setEditText] = useState("");
  const editInputRef = useRef(null);

  const endRef = useRef(null);
  const msgsContainerRef = useRef(null);
  const oldestDocRef = useRef(null);
  const scrollAnchorRef = useRef(null);    // { scrollHeight, scrollTop } captured before prepend
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [jumpHighlightId, setJumpHighlightId] = useState(null);
  const pendingJumpRef = useRef(null);
  const jumpBusyRef = useRef(false);
  const pendingMapRef = useRef(new Map());
  const activeConv = useRef(null);
  const allDepts = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();

  useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading]);

  // ── Load employees ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !employeeId) return;
    setEmpsLoading(true);
    getDocs(collection(firebaseDb, "cowork_employees"))
      .then(snap => setEmployees(snap.docs.map(d => ({ employeeId: d.id, ...d.data() })).filter(e => e.employeeId !== employeeId)))
      .catch(console.error).finally(() => setEmpsLoading(false));
  }, [user, employeeId]);

  // ── Real-time conversations ───────────────────────────────────────────────
  useEffect(() => {
    if (!user || !employeeId) return;
    setConvsLoading(true);
    const q = query(collection(firebaseDb, "cowork_direct_messages"), where("participantIds", "array-contains", employeeId));
    const unsub = onSnapshot(q, async snap => {
      const convs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
        const ta = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
        const tb = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
        return tb - ta;
      });
      setConversations(convs);
      setConvsLoading(false);
      const counts = {};
      await Promise.all(convs.map(async conv => {
        if (conv.id === activeConv.current) return;
        try {
          const ms = await getDocs(query(collection(firebaseDb, "cowork_direct_messages", conv.id, "messages"), where("senderId", "!=", employeeId)));
          const n = ms.docs.filter(d => !(d.data().readBy || []).includes(employeeId)).length;
          if (n > 0) counts[conv.id] = n;
        } catch (_) { }
      }));
      setUnread(counts);
    }, err => { console.error("convs:", err); setConvsLoading(false); });
    return () => unsub();
  }, [user, employeeId]);

  // ── Real-time messages ── limitToLast(300) so newest always visible ────────
  useEffect(() => {
    if (!selectedPerson || !employeeId) return;
    const cid = convId(employeeId, selectedPerson.employeeId);
    activeConv.current = cid;
    setMsgsLoading(true);
    setHasMoreMsgs(false);
    oldestDocRef.current = null;

    // limitToLast: always get NEWEST 300, not the oldest 100
    const q = query(
      collection(firebaseDb, "cowork_direct_messages", cid, "messages"),
      orderBy("createdAt", "asc"),
      limitToLast(30)
    );
    const unsub = onSnapshot(q, async snap => {
      if (snap.docs.length > 0) oldestDocRef.current = snap.docs[0];
      setHasMoreMsgs(snap.docs.length >= 30);

      const incoming = snap.docs.map(d => ({
        ...d.data(), id: d.id,
        createdAt: tsToISO(d.data().createdAt),
        temp: false, sending: false, error: false,
      }));
      const toRead = snap.docs.filter(d => d.data().senderId !== employeeId && !(d.data().readBy || []).includes(employeeId));
      if (toRead.length > 0) {
        const batch = writeBatch(firebaseDb);
        toRead.forEach(d => batch.update(d.ref, { readBy: arrayUnion(employeeId), status: "read" }));
        batch.commit().catch(console.error);
        setUnread(prev => { const n = { ...prev }; delete n[cid]; return n; });
      }
      const inIds = new Set(incoming.map(m => m.messageId));
      setMessages(prev => {
        const pMap = pendingMapRef.current;
        const kept = prev.filter(m => {
          if (m.temp === true) { const r = pMap.get(m.messageId); return r ? !inIds.has(r) : true; }
          if (m._older === true) return !inIds.has(m.messageId);
          return m.error === true;
        });
        const merged = [...incoming, ...kept].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return merged.map(m => {
          if (m.temp || m.error || m._older) return m;
          const live = snap.docs.find(d => d.data().messageId === m.messageId);
          if (!live) return m;
          const rb = live.data().readBy || [];
          const status = rb.includes(selectedPerson.employeeId) ? "read" : rb.length > 1 ? "delivered" : "sent";
          return { ...m, status };
        });
      });
      setMsgsLoading(false);
    }, err => { console.error("msgs:", err); setMsgsLoading(false); });
    return () => { unsub(); activeConv.current = null; };
  }, [selectedPerson, employeeId]);

  // ── Load older messages on scroll-up ─────────────────────────────────────
  // HOW SCROLL ANCHORING WORKS:
  // 1. Before setMessages: save { scrollHeight, scrollTop } into scrollAnchorRef
  // 2. useLayoutEffect fires synchronously after React commits DOM, before browser paints
  // 3. At that exact moment: scrollTop = savedScrollTop + (newScrollHeight - savedScrollHeight)
  // This is the only reliable way — rAF and MutationObserver both fire too late.

  const handleLoadMore = useCallback(async () => {
    if (!selectedPerson || !employeeId || !hasMoreMsgs || loadingMore || !oldestDocRef.current) return;
    const cid = convId(employeeId, selectedPerson.employeeId);
    setLoadingMore(true);
    try {
      const container = msgsContainerRef.current;
      const olderQ = query(
        collection(firebaseDb, "cowork_direct_messages", cid, "messages"),
        orderBy("createdAt", "asc"),
        endBefore(oldestDocRef.current),
        limitToLast(100)
      );
      const snap = await getDocs(olderQ);
      if (snap.docs.length > 0) {
        oldestDocRef.current = snap.docs[0];
        const olderMsgs = snap.docs.map(d => ({
          ...d.data(), id: d.id,
          createdAt: tsToISO(d.data().createdAt),
          temp: false, sending: false, error: false,
          _older: true,
        }));

        // ── STEP 1: Snapshot BEFORE React re-renders ──────────────────────
        if (container) {
          scrollAnchorRef.current = {
            scrollHeight: container.scrollHeight,
            scrollTop: container.scrollTop,
          };
        }

        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.messageId || m.id));
          const newOnes = olderMsgs.filter(m => !existingIds.has(m.messageId || m.id));
          return [...newOnes, ...prev].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        });
        setHasMoreMsgs(snap.docs.length >= 100);
        // ── STEP 2: useLayoutEffect below restores scroll position ────────
      } else {
        setHasMoreMsgs(false);
      }
    } catch (e) { console.error("loadMore:", e); }
    finally { setLoadingMore(false); }
  }, [selectedPerson, employeeId, hasMoreMsgs, loadingMore]);

  // ── STEP 2: Restore scroll synchronously after DOM commit, before paint ──
  // useLayoutEffect runs AFTER React updates the DOM but BEFORE the browser paints.
  // This is the only hook that runs at the right time to prevent visible jump.
  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    const container = msgsContainerRef.current;
    if (!anchor || !container) return;
    // Compute how much height was added at the top and shift scrollTop by that amount
    const addedHeight = container.scrollHeight - anchor.scrollHeight;
    if (addedHeight > 0) {
      container.scrollTop = anchor.scrollTop + addedHeight;
    }
    scrollAnchorRef.current = null; // clear so normal message updates aren't affected
  }, [messages]);

  // Scroll listener — triggers load-more when scrolled within 80px of top
  useEffect(() => {
    const container = msgsContainerRef.current;
    if (!container) return;
    const onScroll = () => { if (container.scrollTop < 80 && hasMoreMsgs && !loadingMore) handleLoadMore(); };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [hasMoreMsgs, loadingMore, handleLoadMore]);

  // Smart scroll-to-bottom: only on person change OR if already near bottom
  const prevPersonRef = useRef(null);
  useEffect(() => {
    if (scrollAnchorRef.current) return; // don't scroll-to-bottom during load-more
    const isNewPerson = prevPersonRef.current !== selectedPerson?.employeeId;
    prevPersonRef.current = selectedPerson?.employeeId || null;
    const container = msgsContainerRef.current;
    if (isNewPerson) {
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "auto" }), 80);
    } else if (container) {
      const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
      if (nearBottom) endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, selectedPerson]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const onVP = () => { requestAnimationFrame(() => { endRef.current?.scrollIntoView({ behavior: "auto", block: "end" }); }); };
    window.visualViewport.addEventListener("resize", onVP);
    return () => window.visualViewport.removeEventListener("resize", onVP);
  }, []);

  useEffect(() => {
    const onFocus = (e) => {
      if (e.target?.tagName === "TEXTAREA" || e.target?.tagName === "INPUT") {
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: "auto", block: "end" }), 100);
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: "auto", block: "end" }), 350);
      }
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);

  // ── Jump to original message when a reply preview is clicked (WhatsApp-style) ──
  const flashMessage = useCallback((mid) => {
    setJumpHighlightId(mid);
    setTimeout(() => setJumpHighlightId(cur => (cur === mid ? null : cur)), 1900);
  }, []);

  const jumpToMessage = useCallback(async (targetMsgId) => {
    if (!targetMsgId || !selectedPerson || !employeeId || jumpBusyRef.current) return;
    const el = document.getElementById(`dm-msg-${targetMsgId}`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); flashMessage(targetMsgId); return; }
    if (!oldestDocRef.current) return;
    jumpBusyRef.current = true;
    setLoadingMore(true);
    try {
      const cid = convId(employeeId, selectedPerson.employeeId);
      let cursor = oldestDocRef.current;
      let oldestFetched = null;
      let collected = [];
      let found = false;
      let lastLen = 0;
      for (let page = 0; page < 10 && cursor; page++) {
        const snap = await getDocs(query(
          collection(firebaseDb, "cowork_direct_messages", cid, "messages"),
          orderBy("createdAt", "asc"),
          endBefore(cursor),
          limitToLast(100)
        ));
        if (snap.docs.length === 0) break;
        lastLen = snap.docs.length;
        cursor = snap.docs[0];
        oldestFetched = snap.docs[0];
        const older = snap.docs.map(d => ({
          ...d.data(), id: d.id,
          createdAt: tsToISO(d.data().createdAt),
          temp: false, sending: false, error: false,
          _older: true,
        }));
        collected = [...older, ...collected];
        if (older.some(m => (m.messageId || m.id) === targetMsgId)) { found = true; break; }
        if (snap.docs.length < 100) break;
      }
      if (collected.length > 0) {
        if (oldestFetched) oldestDocRef.current = oldestFetched;
        setHasMoreMsgs(lastLen >= 100);
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.messageId || m.id));
          const newOnes = collected.filter(m => !existingIds.has(m.messageId || m.id));
          return [...newOnes, ...prev].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        });
      }
      if (found) {
        pendingJumpRef.current = targetMsgId;
      } else {
        console.warn("[jumpToMessage] original not found (deleted or beyond 1000-msg cap):", targetMsgId);
      }
    } catch (e) { console.error("jumpToMessage:", e); }
    finally { setLoadingMore(false); jumpBusyRef.current = false; }
  }, [selectedPerson, employeeId, flashMessage]);

  useEffect(() => {
    const mid = pendingJumpRef.current;
    if (!mid) return;
    const el = document.getElementById(`dm-msg-${mid}`);
    if (!el) return;
    pendingJumpRef.current = null;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    flashMessage(mid);
  }, [messages, flashMessage]);

  useEffect(() => {
    pendingJumpRef.current = null;
    jumpBusyRef.current = false;
    setJumpHighlightId(null);
  }, [selectedPerson?.employeeId]);

  // ── Close nested state + reset sub-chat data when person changes ─────────
  useEffect(() => {
    setNestedOpen(false);
    setActiveSubChat(null);
    setSubChatsForPanel([]);
    setSubChatUnread(0);
  }, [selectedPerson]);

  // ── Single subscription feeds both the panel list AND the button badge ───
  useEffect(() => {
    if (!selectedPerson?.employeeId || !employeeId) {
      setSubChatsForPanel([]); setSubChatUnread(0); return;
    }
    const cid = [employeeId, selectedPerson.employeeId].sort().join("_");
    setSubChatsLoading(true);
    const q = query(
      collection(firebaseDb, "cowork_direct_messages", cid, "sub_chats"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, snap => {
      const chats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSubChatsForPanel(chats);
      setSubChatUnread(chats.reduce((sum, sc) => sum + (sc.unread?.[employeeId] || 0), 0));
      setSubChatsLoading(false);
    }, err => { console.error(err); setSubChatsLoading(false); });
    return () => unsub();
  }, [selectedPerson?.employeeId, employeeId]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async (text, attachments, messageType) => {
    if (!selectedPerson || !employeeId) return;
    // ↓ FIX: capture replyTo before clearing, then include in message
    const currentReplyTo = replyTo || null;
    setReplyTo(null);

    const cid = convId(employeeId, selectedPerson.employeeId);
    const tempId = "temp_" + Date.now();
    const rt = resolveMessageType(messageType, attachments);

    const opt = {
      messageId: tempId, threadType: "direct", threadId: cid,
      senderId: employeeId, senderName: employeeName,
      text: text || "", attachments: attachments || [],
      messageType: rt, type: rt,
      replyTo: currentReplyTo,           // ← included in optimistic msg
      readBy: [employeeId], status: "sending",
      temp: true, sending: true, error: false,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, opt]);

    try {
      const messageId = crypto.randomUUID();
      pendingMapRef.current.set(tempId, messageId);
      const convRef = doc(firebaseDb, "cowork_direct_messages", cid);
      const msgsRef = collection(firebaseDb, "cowork_direct_messages", cid, "messages");
      const snap = await getDoc(convRef);
      if (!snap.exists()) {
        await setDoc(convRef, { conversationId: cid, participantIds: [employeeId, selectedPerson.employeeId].sort(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      const cleanAtts = (attachments || []).map(a => { const c = {}; Object.entries(a).forEach(([k, v]) => { if (v !== undefined) c[k] = v; }); return c; });
      await setDoc(doc(msgsRef, messageId), {
        messageId, threadType: "direct", threadId: cid,
        senderId: employeeId, senderName: employeeName,
        text: text || "", attachments: cleanAtts,
        messageType: rt, type: rt,
        replyTo: currentReplyTo,          // ← persisted to Firestore (reply fix)
        readBy: [employeeId], status: "sent",
        createdAt: serverTimestamp(),
      });
      const preview = rt === "image" ? "📷 Photo" : rt === "pdf" ? "📄 Document" : rt === "voice" ? "🎤 Voice" : (text || "").slice(0, 80);
      await updateDoc(convRef, { lastMessage: { text: preview, senderId: employeeId, senderName: employeeName, messageType: rt, sentAt: serverTimestamp() }, updatedAt: serverTimestamp() });
      apiFetch("/direct-message/notify", { method: "POST", body: JSON.stringify({ toEmployeeId: selectedPerson.employeeId, text: text || "", messageType: rt }) }).catch(() => { });
    } catch (err) {
      console.error("send:", err);
      pendingMapRef.current.delete(tempId);
      setMessages(prev => prev.map(m => m.messageId === tempId ? { ...m, sending: false, error: true, status: "error" } : m));
    }
  };

  // ── Delete message ────────────────────────────────────────────────────────
  const handleDeleteMsg = async (msg) => {
    if (!msg || msg.senderId !== employeeId || !selectedPerson) return;
    const msgId = msg.messageId || msg.id;
    if (!msgId || msgId.startsWith("temp_")) return;
    const cid = convId(employeeId, selectedPerson.employeeId);
    try {
      await updateDoc(doc(firebaseDb, "cowork_direct_messages", cid, "messages", msgId), {
        isDeleted: true, text: "", attachments: [], deletedAt: serverTimestamp(),
      });
      // FIX: if the deleted message was the conversation's LATEST, the sidebar
      // preview (conv.lastMessage) still shows its old text — update it too.
      // Dot-notation touches ONLY text/messageType; sentAt/updatedAt untouched,
      // so the conversation list does NOT reorder (WhatsApp behavior).
      const realMsgs = messages.filter(m => !m.temp && !m.error);
      const lastReal = realMsgs[realMsgs.length - 1];
      if (lastReal && (lastReal.messageId || lastReal.id) === msgId) {
        await updateDoc(doc(firebaseDb, "cowork_direct_messages", cid), {
          "lastMessage.text": "This message was deleted.",
          "lastMessage.messageType": "deleted",
        });
      }
    } catch (e) { console.error("deleteMsg:", e); }
  };

  // ── Edit message ──────────────────────────────────────────────────────────
  const handleMsgEditSave = async () => {
    if (!editingMsg || !editText.trim() || !selectedPerson) return;
    const msgId = editingMsg.messageId || editingMsg.id;
    if (!msgId || msgId.startsWith("temp_")) return;
    const cid = convId(employeeId, selectedPerson.employeeId);
    try {
      await updateDoc(doc(firebaseDb, "cowork_direct_messages", cid, "messages", msgId), {
        text: editText.trim(), isEdited: true, editedAt: serverTimestamp(),
      });
      setEditingMsg(null); setEditText("");
    } catch (e) { console.error("editMsg:", e); }
  };

  const handleReply = (msg) => { setReplyTo({ messageId: msg.messageId || msg.id, senderName: msg.senderName || "Unknown", text: (msg.text || "").slice(0, 120) }); setEditingMsg(null); };
  const handleOpenEdit = (msg) => { if (msg.senderId !== employeeId) return; setEditingMsg(msg); setEditText(msg.text || ""); setReplyTo(null); setTimeout(() => editInputRef.current?.focus(), 50); };

  // ── Paste image ───────────────────────────────────────────────────────────
  const handlePaste = async (e) => {
    if (!selectedPerson || !employeeId) return;
    const imageItem = Array.from(e.clipboardData?.items || []).find(it => it.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    setPasteUploading(true);
    try {
      const { uploadImage } = await import("../../../lib/mediaUploadApi");
      const result = await uploadImage(file, "cowork-dm");
      window.dispatchEvent(new CustomEvent("dm_paste_attachment", { detail: { type: "image", url: result.url, name: "pasted_image.png" } }));
    } catch (err) { console.error("paste upload failed:", err); }
    finally { setPasteUploading(false); }
  };

  const selectPerson = person => {
    if (!person) return;
    const cid = convId(employeeId, person.employeeId);

    if (selectedPerson?.employeeId === person.employeeId) {
      setMobileChatOpen(true);
      setUnread(prev => { const n = { ...prev }; delete n[cid]; return n; });
      return;
    }
    setSelectedPerson(person);
    setMessages([]);
    pendingMapRef.current.clear();
    setMobileChatOpen(true);
    setUnread(prev => { const n = { ...prev }; delete n[cid]; return n; });
  };

  const dlFile = async (url) => {
    if (!url) return;
    // Derive a real filename from the URL, fallback to timestamp
    const name = (() => {
      try { const p = new URL(url).pathname.split("/").pop(); return p && p.includes(".") ? decodeURIComponent(p) : "file_" + Date.now(); }
      catch { return "file_" + Date.now(); }
    })();
    // FIX: browsers ignore the `download` attribute on cross-origin URLs, so a plain
    // <a download> just navigates to Cloudinary. For Cloudinary, inject fl_attachment
    // so it responds with Content-Disposition: attachment → real download.
    if (url.includes("res.cloudinary.com") && url.includes("/upload/") && !url.includes("fl_attachment")) {
      const a = document.createElement("a");
      a.href = url.replace("/upload/", "/upload/fl_attachment/");
      a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      return;
    }
    // Non-Cloudinary hosts: fetch → blob → object URL (download attr works on blob:)
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    } catch (e) {
      console.error("dlFile:", e);
      window.open(url, "_blank"); // last resort — at least show the file
    }
  };

  // ── Thread request listener ───────────────────────────────────────────────
  useEffect(() => {
    if (!employeeId || !selectedPerson?.employeeId) { setThreadRequests([]); return; }
    const cid = convId(employeeId, selectedPerson.employeeId);
    const unsub = onSnapshot(
      query(collection(firebaseDb, "cowork_requests"), where("threadId", "==", cid)),
      snap => setThreadRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))),
      () => { }
    );
    return () => unsub();
  }, [employeeId, selectedPerson?.employeeId]);

  if (loading || !user) return null;

  const empMap = Object.fromEntries(employees.map(e => [e.employeeId, e]));
  const filteredEmps = employees.filter(e => {
    const q = search.toLowerCase();
    const mQ = !q || e.name?.toLowerCase().includes(q) || e.employeeId?.toLowerCase().includes(q) || e.department?.toLowerCase().includes(q);
    const mD = !selectedDept || e.department === selectedDept;
    return mQ && mD;
  });
  const filteredConvs = conversations.filter(conv => {
    const oid = conv.participantIds?.find(id => id !== employeeId) || "";
    const other = empMap[oid];
    if (!other) return true;
    const q = search.toLowerCase();
    const mQ = !q || other.name?.toLowerCase().includes(q) || other.department?.toLowerCase().includes(q);
    const mD = !selectedDept || other.department === selectedDept;
    return mQ && mD;
  });
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  // ── Sorted flat list of messages (no separators yet — added during render) ─
  const sortedMessages = messages
    .filter(m => !m._sep)
    .map((msg, i) => ({
      ...msg,
      isMe: msg.senderId === employeeId,
      showAvatar: i === 0 || messages.filter(x => !x._sep)[i - 1]?.senderId !== msg.senderId,
      _ts: msg.createdAt ? (typeof msg.createdAt === "string" ? new Date(msg.createdAt).getTime() : (msg.createdAt?.seconds || 0) * 1000) : 0,
    }));

  const handleViewSummary = (meetId, meetTitle) => setSummaryModal({ meetId, meetTitle });
  const handleCancelMeet = async (meetId, meetTitle) => {
    if (!window.confirm(`Cancel meeting "${meetTitle}"?`)) return;
    setCancellingId(meetId);
    try { await cancelMeet(meetId); } catch (e) { alert(e.message || "Failed"); } finally { setCancellingId(null); }
  };
  const handleEditSave = async (updated) => {
    if (!editModal) return;
    setEditError("");
    if (!updated.title?.trim()) { setEditError("Title is required."); return; }
    if (!updated.dateTime) { setEditError("Date and time is required."); return; }
    setEditSaving(true);
    try {
      await updateMeet(editModal.meetId, { title: updated.title.trim(), description: updated.description || "", dateTime: updated.dateTime, googleMeetLink: updated.googleMeetLink || null, participants: updated.participants || [] });
      setEditModal(null);
    } catch (e) { setEditError(e.message || "Failed to save."); } finally { setEditSaving(false); }
  };
  const handleCreateMeeting = async () => {
    if (!meetForm.title.trim()) { setMeetError("Title is required"); return; }
    if (!meetForm.dateTime) { setMeetError("Date and time is required"); return; }
    if (!selectedPerson) return;
    setMeetBusy(true); setMeetError("");
    try {
      const result = await apiFetch("/schedule-meet/create", { method: "POST", body: JSON.stringify({ title: meetForm.title.trim(), description: meetForm.description.trim() || "", dateTime: meetForm.dateTime, googleMeetLink: null, participants: [selectedPerson.employeeId] }) });
      const meetId = result?.meet?.meetId || result?.meetId;
      const joinCode = result?.meet?.joinCode || result?.joinCode || "";
      const cid = convId(employeeId, selectedPerson.employeeId);
      const convRef = doc(firebaseDb, "cowork_direct_messages", cid);
      const msgsRef = collection(convRef, "messages");
      const msgId = crypto.randomUUID();
      await setDoc(doc(msgsRef, msgId), { messageId: msgId, senderId: employeeId, senderName: employeeName, text: `Meeting Invitation: ${meetForm.title.trim()}`, messageType: "meeting_invite", type: "meeting_invite", meetingData: { meetId, joinCode, meetTitle: meetForm.title.trim(), description: meetForm.description.trim(), dateTime: meetForm.dateTime }, readBy: [employeeId], createdAt: serverTimestamp() });
      await updateDoc(convRef, { lastMessage: { text: `📹 Meeting invite: ${meetForm.title.trim()}`, senderId: employeeId, senderName: employeeName, messageType: "meeting_invite", sentAt: serverTimestamp() }, updatedAt: serverTimestamp() });
      setShowMeetModal(false);
      setMeetForm({ title: "", dateTime: "", description: "" });
    } catch (e) { setMeetError(e.message); } finally { setMeetBusy(false); }
  };

  const roleChip = r => r === "ceo" ? { bg: "#FEF3C7", color: "#92400E", label: "CEO" }
    : r === "tl" ? { bg: "#F0FDF4", color: "#166534", label: "Team Lead" }
      : { bg: "#EFF6FF", color: "#1D4ED8", label: "Member" };

  const currentCid = selectedPerson ? convId(employeeId, selectedPerson.employeeId) : null;

  return (
    <>
      <style>{CSS}</style>
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} onDl={() => dlFile(lightbox)} />}

      {/* Copy toast */}
      {copyToast && (
        <div style={{ position: "fixed", bottom: 76, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#1E293B", color: "#fff", padding: "7px 16px", borderRadius: 7, fontSize: 12, fontWeight: 600, boxShadow: "0 3px 12px rgba(0,0,0,0.18)", pointerEvents: "none", animation: "dm-toast-in 0.15s ease" }}>
          ✓ Copied to clipboard
        </div>
      )}

      {/* Paste uploading indicator */}
      {pasteUploading && (
        <div style={{ position: "fixed", bottom: 76, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#1B4F8A", color: "#fff", padding: "7px 16px", borderRadius: 7, fontSize: 12, fontWeight: 600, boxShadow: "0 3px 12px rgba(0,0,0,0.18)", pointerEvents: "none", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "dm-spin 0.7s linear infinite" }} />
          Uploading pasted image…
        </div>
      )}

      <div className="dm-root">

        {/* ════════════════════ SIDEBAR ════════════════════ */}
        <div className={`dm-left${mobileChatOpen ? " mob-gone" : ""}`}>
          <div className="dm-lhead">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "#1a73e8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 6 }}>
                  Messages {totalUnread > 0 && <Badge n={totalUnread} />}
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500, marginTop: 1 }}>Direct conversations</div>
              </div>
            </div>
          </div>

          <div className="dm-search-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input className="dm-search-in" placeholder="Search name or department…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="dm-search-clr" onClick={() => setSearch("")}>&#215;</button>}
          </div>

          {allDepts.length > 0 && (
            <div className="dm-dept-row">
              <button className={`dm-chip${!selectedDept ? " on" : ""}`} onClick={() => setSelectedDept("")}>All</button>
              {allDepts.map(d => <button key={d} className={`dm-chip${selectedDept === d ? " on" : ""}`} onClick={() => setSelectedDept(p => p === d ? "" : d)}>{d}</button>)}
            </div>
          )}

          <div className="dm-tabs">
            <button className={`dm-tab${activeTab === "recents" ? " on" : ""}`} onClick={() => setActiveTab("recents")}>
              Recent {totalUnread > 0 && <span className="dm-tab-bdg">{totalUnread}</span>}
            </button>
            <button className={`dm-tab${activeTab === "people" ? " on" : ""}`} onClick={() => setActiveTab("people")}>
              People <span className="dm-tab-cnt">{filteredEmps.length}</span>
            </button>
          </div>

          {activeTab === "recents" && (
            <div className="dm-list">
              {convsLoading ? <div className="dm-center"><GwSpinner size={22} /></div>
                : filteredConvs.length === 0 ? <div className="dm-empty-s"><div style={{ fontSize: 28, opacity: .25, marginBottom: 6 }}>&#128172;</div><div style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>No conversations yet</div></div>
                  : filteredConvs.map(conv => {
                    const oid = conv.participantIds?.find(id => id !== employeeId) || "";
                    const other = empMap[oid];
                    const name = other?.name || oid;
                    const lm = conv.lastMessage;
                    const prev = lm?.messageType === "image" ? "&#128247; Photo" : lm?.messageType === "pdf" ? "&#128196; Document" : lm?.messageType === "voice" ? "&#127908; Voice" : lm?.text?.slice(0, 46) || "No messages yet";
                    const n = unread[conv.id] || 0;
                    const isAct = selectedPerson?.employeeId === oid;
                    return (
                      <div key={conv.id} className={`dm-row${isAct ? " act" : ""}`} onClick={() => selectPerson(other)} role="button">
                        <div style={{ position: "relative", flexShrink: 0 }}>
                          <Av name={name} size={42} url={other?.profilePicUrl || ""} />
                          {n > 0 && <div className="dm-av-dot" />}
                        </div>
                        <div className="dm-row-info">
                          <div className="dm-row-name" style={{ fontWeight: n > 0 ? 700 : 600 }}>{name}</div>
                          <div className="dm-row-prev" style={{ fontWeight: n > 0 ? 600 : 400, color: n > 0 ? "#374151" : "#94A3B8" }} dangerouslySetInnerHTML={{ __html: prev }} />
                          {other?.department && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>{other.department}</div>}
                        </div>
                        <div className="dm-row-r">
                          <span className="dm-row-ts" style={{ color: n > 0 ? "#1a73e8" : "#CBD5E1" }}>{fmtConv(lm?.sentAt || conv.updatedAt)}</span>
                          <Badge n={n} />
                        </div>
                      </div>
                    );
                  })}
            </div>
          )}

          {activeTab === "people" && (
            <div className="dm-list">
              {empsLoading ? <div className="dm-center"><GwSpinner size={22} /></div>
                : filteredEmps.length === 0 ? <div className="dm-empty-s"><div style={{ fontSize: 28, opacity: .25, marginBottom: 6 }}>&#128101;</div><div style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>No employees found</div></div>
                  : filteredEmps.map(emp => {
                    const rc = roleChip(emp.role);
                    const isAct = selectedPerson?.employeeId === emp.employeeId;
                    return (
                      <div key={emp.employeeId} className={`dm-row${isAct ? " act" : ""}`} onClick={() => selectPerson(emp)} role="button">
                        <Av name={emp.name || emp.employeeId} size={38} url={emp.profilePicUrl || ""} />
                        <div className="dm-row-info">
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div className="dm-row-name">{emp.name || emp.employeeId}</div>
                            <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: rc.bg, color: rc.color, flexShrink: 0 }}>{rc.label}</span>
                          </div>
                          {emp.department && <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500, marginTop: 2 }}>{emp.department}</div>}
                        </div>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>
                      </div>
                    );
                  })}
            </div>
          )}
        </div>

        {/* ════════════════════ CHAT PANEL ════════════════════ */}
        <div className={`dm-chat${!mobileChatOpen ? " mob-gone-chat" : ""}`}>
          {!selectedPerson ? (
            <div className="dm-no-sel">
              <div className="dm-no-sel-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#64748B" }}>No conversation open</div>
              <div style={{ fontSize: 12, color: "#94A3B8", maxWidth: 210, lineHeight: 1.5 }}>Select someone from the list to start messaging</div>
            </div>

          ) : activeSubChat ? (
            /* ═══ SUB-CHAT FULL VIEW — replaces main chat entirely ═══ */
            <SubChatFullView
              subChat={activeSubChat}
              cid={currentCid}
              employeeId={employeeId}
              employeeName={employeeName}
              otherPersonId={selectedPerson?.employeeId}
              onBack={() => setActiveSubChat(null)}
            />

          ) : (
            <>
              {/* ── Chat Header ── */}
              <div className="dm-chat-head">
                <button className="dm-back" onClick={() => { setMobileChatOpen(false); setSelectedPerson(null); setNestedOpen(false); }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                  <span className="dm-back-lbl">Back</span>
                </button>

                <div className="dm-chat-av-wrap" style={{ position: "relative", flexShrink: 0 }}>
                  <Av name={selectedPerson.name || selectedPerson.employeeId} size={42} url={selectedPerson.profilePicUrl || ""} />
                  <div style={{ position: "absolute", bottom: 1, right: 1, width: 10, height: 10, borderRadius: "50%", background: "#22C55E", border: "2px solid #fff" }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dm-chat-name">{selectedPerson.name || selectedPerson.employeeId}</div>
                  <div className="dm-chat-meta">
                    {selectedPerson.department && <span className="dm-pill dept">{selectedPerson.department}</span>}
                    {selectedPerson.role && (() => { const rc = roleChip(selectedPerson.role); return <span className="dm-pill" style={{ background: rc.bg, color: rc.color }}>{rc.label}</span>; })()}
                    <span className="dm-pill mono">{selectedPerson.employeeId}</span>
                  </div>
                </div>

                {/* Audio call button */}
                <button className="dm-head-call" onClick={() => {
                  const cid = convId(employeeId, selectedPerson.employeeId);
                  const socket = (typeof window !== "undefined") ? require("../../../lib/coworkSocket").getCoworkSocket(employeeId) : null;
                  if (socket) socket.emit("call_invite", { toEmployeeId: selectedPerson.employeeId, fromEmployeeId: employeeId, fromName: employeeName, convId: cid });
                  router.push(`/coworking/audio-call/${cid}`);
                }} title="Audio call">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63 19.79 19.79 0 01.1 4.02 2 2 0 012.08 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 9.91a16 16 0 006.18 6.18l1.48-1.48a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
                </button>

                {/* ─── NESTED CHAT BUTTON ─── */}
                {/* ─── NESTED CHAT BUTTON ─── */}
                <button
                  className={`dm-head-btn dm-head-nested${nestedOpen ? " active" : ""}`}
                  onClick={() => setNestedOpen(p => !p)}
                  title="Nested Chat — Sub-threads"
                  style={{ position: "relative" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    <path d="M8 10h8M8 14h5" />
                  </svg>
                  <span className="dm-head-btn-lbl">Sub Chat</span>
                  {subChatUnread > 0 && (
                    <span style={{ position: "absolute", top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 8, background: "#EF4444", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: "2px solid #fff", lineHeight: 1 }}>
                      {subChatUnread > 99 ? "99+" : subChatUnread}
                    </span>
                  )}
                </button>

                {/* Request button */}
                <button className="dm-head-btn dm-head-req" onClick={() => {
                  window.dispatchEvent(new CustomEvent("openRequestPanel", { detail: { tab: "compose", threadContext: { type: "dm", threadId: convId(employeeId, selectedPerson.employeeId), recipientId: selectedPerson.employeeId, recipientName: selectedPerson.name } } }));
                }} title="Request">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="10" y1="10" x2="14" y2="10" /></svg>
                  <span className="dm-head-btn-lbl">Request</span>
                </button>

                {/* Schedule meeting */}
                {isCeoOrTl && (
                  <button className="dm-head-btn dm-head-meet" onClick={() => { setShowMeetModal(true); setMeetError(""); }} title="Schedule Meeting">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" /></svg>
                    <span className="dm-head-btn-lbl">Schedule</span>
                  </button>
                )}
              </div>

              {/* ── Messages ── */}
              <div className="dm-msgs" ref={msgsContainerRef}>
                {/* Load older messages button */}
                {hasMoreMsgs && (
                  <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 16px", borderRadius: 20, border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#1D4ED8", fontSize: 12, fontWeight: 600, cursor: loadingMore ? "default" : "pointer", fontFamily: "inherit", opacity: loadingMore ? 0.7 : 1 }}
                    >
                      {loadingMore ? <><div style={{ width: 11, height: 11, borderRadius: "50%", border: "2px solid rgba(29,78,216,0.25)", borderTopColor: "#1D4ED8", animation: "dm-spin 0.7s linear infinite" }} /> Loading…</> : "↑ Load older messages"}
                    </button>
                  </div>
                )}
                {msgsLoading && messages.length === 0 ? <div className="dm-center"><GwSpinner size={24} /></div>
                  : sortedMessages.length === 0 ? (
                    <div className="dm-chat-empty">
                      <Av name={selectedPerson.name || "?"} size={48} url={selectedPerson.profilePicUrl || ""} />
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginTop: 4 }}>{selectedPerson.name}</div>
                      <div style={{ fontSize: 12, color: "#94A3B8" }}>No messages yet — say hello!</div>
                    </div>
                  ) : (() => {
                    // Combine messages + request cards by timestamp, then inject date separators
                    const reqItems = threadRequests.map(r => ({
                      _isReq: true, id: r.id, req: r,
                      _ts: r.createdAt?.seconds ? r.createdAt.seconds * 1000 : 0,
                    }));
                    const combined = [...sortedMessages, ...reqItems].sort((a, b) => a._ts - b._ts);

                    // Inject date separators after sorting (so they are always in correct position)
                    const withDateSeps = [];
                    let lastDate = null;
                    const today = new Date();
                    const yesterday = new Date(Date.now() - 86400000);
                    combined.forEach((item, ci) => {
                      const ms = item._ts;
                      const d = ms ? new Date(ms) : null;
                      let ds = null;
                      if (d) {
                        if (d.toDateString() === today.toDateString()) ds = "Today";
                        else if (d.toDateString() === yesterday.toDateString()) ds = "Yesterday";
                        else ds = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                      }
                      if (ds && ds !== lastDate) {
                        withDateSeps.push({ _sep: true, label: ds, _sepKey: ds + ci });
                        lastDate = ds;
                      }
                      // Fix showAvatar after re-sort (compare against previous non-sep, non-req item)
                      if (!item._isReq) {
                        const prevMsg = withDateSeps.filter(x => !x._sep && !x._isReq).slice(-1)[0];
                        withDateSeps.push({ ...item, showAvatar: !prevMsg || prevMsg.senderId !== item.senderId });
                      } else {
                        withDateSeps.push(item);
                      }
                    });

                    return withDateSeps.map((item, i) => {
                      if (item._sep) return <div key={item._sepKey || ("sep" + i)} className="dm-datesep"><span className="dm-datesep-label">{item.label}</span></div>;
                      if (item._isReq) return <div key={item.id} style={{ padding: "0 4px", marginBottom: 6 }}><ThreadRequestCard req={item.req} employeeId={employeeId} /></div>;
                      return (
                        <Bubble
                          key={item.messageId || item.id || i}
                          msg={{ ...item, senderPicUrl: item.isMe ? "" : (selectedPerson?.profilePicUrl || "") }}
                          isMe={item.isMe}
                          showAvatar={item.showAvatar}
                          onImg={setLightbox}
                          onDl={dlFile}
                          isHost={isCeoOrTl}
                          onViewSummary={handleViewSummary}
                          onCancel={handleCancelMeet}
                          onEdit={setEditModal}
                          onCopied={showCopyToast}
                          currentUserId={employeeId}
                          onReply={handleReply}
                          onDeleteMsg={handleDeleteMsg}
                          onEditMsg={handleOpenEdit}
                          onJumpToReply={jumpToMessage}
                          highlight={jumpHighlightId === (item.messageId || item.id)}
                        />
                      );
                    });
                  })()}
                <div ref={endRef} />
              </div>

              {/* ── Input area ── */}
              <div className="dm-input" onPaste={handlePaste}>
                {/* Reply preview */}
                {replyTo && !editingMsg && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px", background: "#F0F7FF", borderBottom: "1px solid #DBEAFE", borderLeft: "3px solid #2563EB" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#2563EB" }}>Replying to {replyTo.senderName}</div>
                      <div style={{ fontSize: 11.5, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyTo.text || "📎 Attachment"}</div>
                    </div>
                    <button onClick={() => setReplyTo(null)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#9CA3AF", fontSize: 15, padding: 2 }}>✕</button>
                  </div>
                )}
                {/* Edit bar */}
                {editingMsg ? (
                  <div style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#2563EB" }}>✎ Editing message</span>
                      <button onClick={() => { setEditingMsg(null); setEditText(""); }} style={{ fontSize: 11.5, color: "#9CA3AF", border: "none", background: "transparent", cursor: "pointer" }}>✕ Cancel</button>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                      <textarea ref={editInputRef} value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleMsgEditSave(); } if (e.key === "Escape") { setEditingMsg(null); setEditText(""); } }} rows={2} style={{ flex: 1, resize: "none", border: "1.5px solid #2563EB", borderRadius: 9, padding: "7px 11px", fontSize: 13.5, fontFamily: "inherit", outline: "none", color: "#111827", lineHeight: 1.5 }} />
                      <button onClick={handleMsgEditSave} disabled={!editText.trim()} style={{ padding: "8px 15px", borderRadius: 9, border: "none", background: editText.trim() ? "#2563EB" : "#E5E7EB", color: editText.trim() ? "#fff" : "#9CA3AF", fontSize: 13, fontWeight: 600, cursor: editText.trim() ? "pointer" : "default", fontFamily: "inherit", flexShrink: 0 }}>Save</button>
                    </div>
                    <div style={{ fontSize: 10.5, color: "#9CA3AF", marginTop: 3 }}>Enter to save · Esc to cancel</div>
                  </div>
                ) : (
                  <MediaMessageInput
                    onSend={handleSend}
                    placeholder={`Message ${selectedPerson.name || selectedPerson.employeeId}…`}
                    disabled={msgsLoading}
                  />
                )}
              </div>

              {/* Nested Chat panel — right slider, only when sub-chat not open */}
              <NestedChatPanel
                open={nestedOpen}
                onClose={() => setNestedOpen(false)}
                cid={currentCid}
                employeeId={employeeId}
                employeeName={employeeName}
                onViewSubChat={(sc) => { setActiveSubChat(sc); setNestedOpen(false); }}
                subChatsData={subChatsForPanel}
                scLoading={subChatsLoading}
              />

            </>
          )}
        </div>
      </div>

      {/* ── Meeting Summary Modal ── */}
      {summaryModal && <MeetingSummaryModal meetId={summaryModal.meetId} meetTitle={summaryModal.meetTitle} onClose={() => setSummaryModal(null)} />}

      {/* ── Edit Meeting Modal ── */}
      {editModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditModal(null); }} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "min(430px,100%)", boxShadow: "0 20px 50px rgba(0,0,0,0.16)", fontFamily: "inherit", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px 13px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Edit Meeting</div>
              <button onClick={() => setEditModal(null)} style={{ width: 27, height: 27, border: "1px solid #E2E8F0", borderRadius: 7, background: "#F8FAFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
            </div>
            <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              {editError && <div style={{ padding: "7px 11px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, fontSize: 12, color: "#B91C1C" }}>{editError}</div>}
              <div><label style={labelSt}>Title</label><input value={editModal.title || ""} onChange={e => setEditModal(p => ({ ...p, title: e.target.value }))} style={inputSt} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={labelSt}>Date</label><input type="date" value={editModal.dateTime ? editModal.dateTime.split("T")[0] : ""} onChange={e => setEditModal(p => ({ ...p, dateTime: `${e.target.value}T${p.dateTime?.split("T")[1] || "09:00"}` }))} style={inputSt} /></div>
                <div><label style={labelSt}>Time</label><input type="time" value={editModal.dateTime ? (editModal.dateTime.split("T")[1] || "09:00") : "09:00"} onChange={e => { const d = editModal.dateTime?.split("T")[0]; if (d) setEditModal(p => ({ ...p, dateTime: `${d}T${e.target.value}` })); }} style={inputSt} /></div>
              </div>
              <div><label style={labelSt}>Description</label><textarea value={editModal.description || ""} onChange={e => setEditModal(p => ({ ...p, description: e.target.value }))} rows={2} style={{ ...inputSt, resize: "vertical" }} /></div>
            </div>
            <div style={{ padding: "0 20px 18px", display: "flex", gap: 9 }}>
              <button onClick={() => setEditModal(null)} style={btnSec}>Cancel</button>
              <button onClick={() => handleEditSave(editModal)} disabled={editSaving} style={{ ...btnPri, opacity: editSaving ? 0.7 : 1 }}>{editSaving ? "Saving…" : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule Meeting Modal ── */}
      {showMeetModal && selectedPerson && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowMeetModal(false); }} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "min(430px,100%)", boxShadow: "0 20px 50px rgba(0,0,0,0.16)", fontFamily: "inherit", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px 13px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Schedule Meeting</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>with {selectedPerson.name}</div>
              </div>
              <button onClick={() => setShowMeetModal(false)} style={{ width: 27, height: 27, border: "1px solid #E2E8F0", borderRadius: 7, background: "#F8FAFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
            </div>
            <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              {meetError && <div style={{ padding: "7px 11px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, fontSize: 12, color: "#B91C1C" }}>{meetError}</div>}
              <div><label style={labelSt}>Meeting Title *</label><input value={meetForm.title} onChange={e => setMeetForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Project Review" autoFocus style={inputSt} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={labelSt}>Date</label><input type="date" value={meetForm.dateTime ? meetForm.dateTime.split("T")[0] : ""} onChange={e => setMeetForm(p => ({ ...p, dateTime: e.target.value ? `${e.target.value}T${p.dateTime?.split("T")[1] || "09:00"}` : "" }))} style={inputSt} /></div>
                <div><label style={labelSt}>Time</label><input type="time" value={meetForm.dateTime ? (meetForm.dateTime.split("T")[1] || "09:00") : "09:00"} disabled={!meetForm.dateTime} onChange={e => { const d = meetForm.dateTime?.split("T")[0]; if (d) setMeetForm(p => ({ ...p, dateTime: `${d}T${e.target.value}` })); }} style={{ ...inputSt, opacity: meetForm.dateTime ? 1 : 0.4 }} /></div>
              </div>
              <div><label style={labelSt}>Description</label><textarea value={meetForm.description} onChange={e => setMeetForm(p => ({ ...p, description: e.target.value }))} placeholder="Agenda…" rows={2} style={{ ...inputSt, resize: "vertical" }} /></div>
              <div style={{ padding: "9px 11px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 7, fontSize: 12, color: "#1D4ED8" }}>
                👤 <strong>{selectedPerson.name}</strong> will be invited automatically
              </div>
            </div>
            <div style={{ padding: "0 20px 18px", display: "flex", gap: 9 }}>
              <button onClick={() => setShowMeetModal(false)} style={btnSec}>Cancel</button>
              <button onClick={handleCreateMeeting} disabled={meetBusy || !meetForm.title.trim() || !meetForm.dateTime} style={{ ...btnPri, opacity: meetBusy || !meetForm.title.trim() || !meetForm.dateTime ? 0.6 : 1 }}>
                {meetBusy ? "Scheduling…" : "Schedule Meeting"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Shared modal style helpers ───────────────────────────────────────────────
const labelSt = { fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };
const inputSt = { width: "100%", padding: "8px 11px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", color: "#0F172A" };
const btnSec = { flex: 1, padding: "9px 0", border: "1.5px solid #E2E8F0", borderRadius: 8, background: "#F8FAFC", color: "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
const btnPri = { flex: 1, padding: "9px 0", border: "none", borderRadius: 8, background: "#1a73e8", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

// ─────────────────────────────────────────────────────────────────────────────
//  CSS
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

@keyframes dm-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
@keyframes dm-spin { to { transform: rotate(360deg); } }
@keyframes nc-slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

/* ─── ROOT ─── */
.dm-root {
  display: flex;
  height: calc(100dvh - 56px);
  max-height: calc(100dvh - 56px);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: #F1F5F9;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #E2E8F0;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  position: relative;
  overscroll-behavior: contain;
}
@supports not (height: 100dvh) {
  .dm-root { height: calc(100vh - 56px); max-height: calc(100vh - 56px); }
}

/* ─── SIDEBAR ─── */
.dm-left {
  width: 300px; min-width: 300px;
  display: flex; flex-direction: column;
  background: #fff;
  border-right: 1px solid #EEF2F8;
  overflow: hidden;
}
.dm-lhead { padding: 16px 16px 13px; border-bottom: 1px solid #F1F5F9; flex-shrink: 0; }

.dm-search-wrap {
  margin: 8px 12px 5px;
  display: flex; align-items: center; gap: 8px;
  padding: 8px 11px;
  background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px;
  transition: border-color 0.14s; flex-shrink: 0;
}
.dm-search-wrap:focus-within { border-color: #1a73e8; background: #fff; }
.dm-search-in { border: none; background: none; outline: none; font-size: 13px; font-weight: 500; color: #0F172A; font-family: inherit; width: 100%; }
.dm-search-in::placeholder { color: #CBD5E1; }
.dm-search-clr { background: none; border: none; cursor: pointer; color: #94A3B8; font-size: 16px; line-height: 1; padding: 0; }

.dm-dept-row { display: flex; gap: 5px; padding: 3px 12px 7px; overflow-x: auto; flex-wrap: nowrap; flex-shrink: 0; }
.dm-dept-row::-webkit-scrollbar { height: 0; }
.dm-chip { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 10.5px; font-weight: 600; white-space: nowrap; border: 1px solid #E2E8F0; background: #fff; color: #64748B; cursor: pointer; transition: all 0.12s; font-family: inherit; }
.dm-chip:hover { border-color: #1a73e8; color: #1a73e8; }
.dm-chip.on { background: #1a73e8; color: #fff; border-color: #1a73e8; }

.dm-tabs { display: flex; padding: 0 12px; gap: 2px; border-bottom: 1px solid #EEF2F8; flex-shrink: 0; }
.dm-tab { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 9px 8px; border: none; background: none; cursor: pointer; font-size: 11px; font-weight: 700; color: #94A3B8; border-bottom: 2px solid transparent; margin-bottom: -1px; font-family: inherit; transition: all 0.12s; text-transform: uppercase; letter-spacing: 0.05em; }
.dm-tab:hover { color: #475569; }
.dm-tab.on { color: #1a73e8; border-bottom-color: #1a73e8; }
.dm-tab-bdg { font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 99px; background: #EF4444; color: #fff; }
.dm-tab-cnt { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 99px; background: #F1F5F9; color: #64748B; }

.dm-list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 0; }
.dm-list::-webkit-scrollbar { width: 3px; }
.dm-list::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 2px; }

.dm-row { display: flex; align-items: center; gap: 10px; padding: 9px 14px; cursor: pointer; border-left: 2.5px solid transparent; transition: background 0.1s; user-select: none; }
.dm-row:hover { background: #F8FAFC; }
.dm-row.act { background: #EFF6FF; border-left-color: #1a73e8; }
.dm-row-info { flex: 1; min-width: 0; }
.dm-row-name { font-size: 13px; font-weight: 600; color: #0F172A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dm-row-prev { font-size: 11px; color: #94A3B8; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dm-row-r { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
.dm-row-ts { font-size: 10px; white-space: nowrap; font-weight: 600; }
.dm-av-dot { position: absolute; top: -1px; right: -1px; width: 11px; height: 11px; border-radius: 50%; background: #EF4444; border: 2px solid #fff; }
.dm-center { display: flex; justify-content: center; padding: 28px; }
.dm-empty-s { padding: 24px 16px; text-align: center; }

/* ─── CHAT PANEL ─── */
.dm-chat {
  flex: 1; display: flex; flex-direction: column;
  background: #F8FAFC;
  overflow: hidden; min-width: 0;
  position: relative;
}
.dm-no-sel {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 9px; text-align: center; padding: 40px;
  background: #F8FAFC;
}
.dm-no-sel-icon { width: 62px; height: 62px; border-radius: 16px; background: #EEF2FF; display: flex; align-items: center; justify-content: center; border: 1px solid #E0E7FF; }

.dm-chat-head {
  padding: 10px 16px; background: #fff;
  border-bottom: 1px solid #EEF2F8;
  display: flex; align-items: center; gap: 10px;
  flex-shrink: 0; min-height: 62px;
  box-shadow: 0 1px 2px rgba(15,23,42,0.04);
}
.dm-chat-name { font-size: 14px; font-weight: 700; color: #0F172A; }
.dm-chat-meta { display: flex; align-items: center; gap: 4px; margin-top: 3px; flex-wrap: wrap; }
.dm-pill { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 20px; letter-spacing: 0.02em; white-space: nowrap; }
.dm-pill.dept { background: #EFF6FF; color: #1D4ED8; }
.dm-pill.mono { background: #F8FAFC; color: #94A3B8; font-family: monospace; font-size: 9px; border: 1px solid #E2E8F0; }

.dm-back { display: none; align-items: center; gap: 4px; padding: 6px 10px; border: 1px solid #E2E8F0; border-radius: 8px; background: #fff; cursor: pointer; color: #1a73e8; font-size: 12px; font-weight: 600; font-family: inherit; white-space: nowrap; flex-shrink: 0; }
.dm-back:hover { background: #EFF6FF; }

/* Bubble column max width */
.dm-bub-col { max-width: 62%; }

/* Copy button on hover */
.dm-bubble-wrap .dm-copy-btn { opacity: 0; transition: opacity 0.12s; }
.dm-bubble-wrap:hover .dm-copy-btn { opacity: 1 !important; }
@media (hover: none) { .dm-copy-btn { opacity: 1 !important; } }
@keyframes dm-jump-flash {
  0% { background: rgba(37,99,235,0.16); box-shadow: 0 0 0 4px rgba(37,99,235,0.10); }
  60% { background: rgba(37,99,235,0.10); }
  100% { background: transparent; box-shadow: none; }
}
.dm-jump-hl { animation: dm-jump-flash 1.9s ease-out; border-radius: 12px; }

@keyframes dm-jump-flash {
  0% { background: rgba(37,99,235,0.16); box-shadow: 0 0 0 4px rgba(37,99,235,0.10); }
  60% { background: rgba(37,99,235,0.10); }
  100% { background: transparent; box-shadow: none; }
}
.dm-jump-hl { animation: dm-jump-flash 1.9s ease-out; border-radius: 12px; }


/* Header action buttons */
.dm-head-call { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 9px; border: 1px solid #DCFCE7; background: #F0FDF4; color: #16A34A; cursor: pointer; flex-shrink: 0; transition: background 0.12s; }
.dm-head-call:hover { background: #DCFCE7; }

.dm-head-btn { display: flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; flex-shrink: 0; transition: all 0.12s; white-space: nowrap; }
.dm-head-req  { border: 1px solid #E9D5FF; background: #FAF5FF; color: #7C3AED; }
.dm-head-req:hover  { background: #F3E8FF; }
.dm-head-meet { border: 1px solid #BFDBFE; background: #EFF6FF; color: #1D4ED8; }
.dm-head-meet:hover { background: #DBEAFE; }
.dm-head-nested { border: 1px solid #D1FAE5; background: #F0FDF4; color: #065F46; }
.dm-head-nested:hover { background: #D1FAE5; }
.dm-head-nested.active { border-color: #059669; background: #ECFDF5; color: #047857; box-shadow: 0 0 0 2px rgba(5,150,105,0.15); }

.dm-msgs {
  flex: 1; min-height: 0; overflow-y: auto; padding: 14px 18px;
  display: flex; flex-direction: column; gap: 2px;
  background: #F8FAFC;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.dm-msgs::-webkit-scrollbar { width: 3px; }
.dm-msgs::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 2px; }

.dm-datesep { display: flex; align-items: center; gap: 8px; margin: 10px 0 7px; }
.dm-datesep::before, .dm-datesep::after { content: ""; flex: 1; height: 1px; background: #E8EDF4; }
.dm-datesep-label { font-size: 10px; font-weight: 700; color: "#94A3B8"; padding: 2px 10px; background: #EAEEF4; border-radius: 20px; white-space: nowrap; letter-spacing: 0.03em; color: #64748B; }
.dm-chat-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; padding: 40px; }

.dm-input { flex-shrink: 0; border-top: 1px solid #EEF2F8; background: #fff; padding: 8px 14px 10px; }

/* ─── NESTED CHAT PANEL ─── */
.nc-panel {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 340px;
  background: #fff;
  border-left: 1px solid #E2E8F0;
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: -3px 0 16px rgba(0,0,0,0.07);
  animation: nc-slide-in 0.22s cubic-bezier(0.4,0,0.2,1);
  overflow: hidden;
}

.nc-head {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px 11px;
  border-bottom: 1px solid #EEF2F8;
  flex-shrink: 0;
  background: #fff;
}
.nc-head-title { font-size: 13.5px; font-weight: 700; color: #0F172A; }

.nc-back {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 7px;
  border: 1px solid #E2E8F0; background: #F8FAFC;
  color: #1a73e8; font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: inherit; flex-shrink: 0;
}
.nc-back:hover { background: #EFF6FF; }

.nc-new-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 11px; border-radius: 7px;
  border: none; background: #1a73e8;
  color: #fff; font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: inherit; flex-shrink: 0;
}
.nc-new-btn:hover { background: #1558b0; }

.nc-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 7px;
  border: 1px solid #E2E8F0; background: #F8FAFC;
  color: #64748B; cursor: pointer; flex-shrink: 0;
}
.nc-icon-btn:hover { background: #F1F5F9; }

.nc-body {
  flex: 1; overflow-y: auto; display: flex; flex-direction: column;
  gap: 10px; padding: 12px;
}
.nc-body::-webkit-scrollbar { width: 3px; }
.nc-body::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 2px; }

.nc-create-body { padding: 16px; gap: 14px; }

.nc-list { display: flex; flex-direction: column; gap: 8px; }

.nc-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 30px 20px; text-align: center; gap: 6px;
}

.nc-create-first {
  margin-top: 8px; padding: 8px 18px; border-radius: 8px;
  border: none; background: #1a73e8; color: #fff;
  font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit;
}
.nc-create-first:hover { background: #1558b0; }

.nc-sc-card {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 10px;
  border: 1px solid #EEF2F8; background: #FAFBFC;
  transition: border-color 0.12s;
}
.nc-sc-card:hover { border-color: #D1E3FF; background: #F5F8FF; }

.nc-sc-icon-wrap {
  width: 32px; height: 32px; border-radius: 8px;
  background: #EFF6FF; border: 1px solid #DBEAFE;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.nc-sc-info { flex: 1; min-width: 0; }
.nc-sc-name { font-size: 12.5px; font-weight: 700; color: #0F172A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nc-sc-desc { font-size: 11px; color: #64748B; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nc-sc-last { font-size: 10.5px; color: #94A3B8; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-style: italic; }

.nc-view-btn {
  padding: 5px 12px; border-radius: 7px;
  border: 1px solid #DBEAFE; background: #EFF6FF;
  color: #1D4ED8; font-size: 11.5px; font-weight: 600;
  cursor: pointer; font-family: inherit; flex-shrink: 0;
}
.nc-view-btn:hover { background: #DBEAFE; }

.nc-field { display: flex; flex-direction: column; gap: 5px; }
.nc-label { font-size: 11px; font-weight: 700; color: "#64748B"; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em; }
.nc-input {
  width: 100%; padding: 8px 11px; border: 1.5px solid #E2E8F0; border-radius: 7px;
  font-size: 13px; font-family: inherit; outline: none; color: #0F172A;
  box-sizing: border-box; transition: border-color 0.14s;
}
.nc-input:focus { border-color: #1a73e8; }
.nc-btn-secondary { flex: 1; padding: 9px 0; border: 1.5px solid #E2E8F0; border-radius: 8px; background: #F8FAFC; color: #374151; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; }
.nc-btn-primary { flex: 1; padding: 9px 0; border: none; border-radius: 8px; background: #1a73e8; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.nc-btn-primary:disabled { background: #93C5FD; cursor: not-allowed; }

.nc-subinfo {
  padding: 9px 14px;
  background: #F8FAFC;
  border-bottom: 1px solid #EEF2F8;
  flex-shrink: 0;
}
.nc-subinfo-name { font-size: 12.5px; font-weight: 700; color: #0F172A; }
.nc-subinfo-desc { font-size: 11px; color: #64748B; margin-top: 2px; line-height: 1.4; }

.nc-msgs {
  flex: 1; overflow-y: auto; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 2px;
  background: #F9FAFB;
}
.nc-msgs::-webkit-scrollbar { width: 3px; }
.nc-msgs::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 2px; }

.nc-input-row {
  display: flex; align-items: flex-end; gap: 8px;
  padding: 8px 12px 10px;
  border-top: 1px solid #EEF2F8;
  background: #fff;
  flex-shrink: 0;
}
.nc-chat-input {
  flex: 1; resize: none;
  border: 1.5px solid #E2E8F0; border-radius: 10px;
  padding: 8px 11px; font-size: 13px; font-family: inherit;
  outline: none; color: #0F172A; line-height: 1.5;
  max-height: 90px; overflow-y: auto;
  background: #F8FAFC;
  transition: border-color 0.14s;
}
.nc-chat-input:focus { border-color: #1a73e8; background: #fff; }
.nc-center { display: flex; justify-content: center; padding: 24px; }

.nc-send-btn {
  width: 36px; height: 36px; border-radius: 9px;
  border: none; background: #1a73e8;
  color: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: background 0.12s;
}
.nc-send-btn:hover { background: #1558b0; }
.nc-send-btn:disabled { background: #93C5FD; cursor: not-allowed; }

@keyframes sc-fade-in { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }

/* ── SUB-CHAT FULL VIEW ── */
.sc-head { padding:10px 16px; background:#fff; border-bottom:1.5px solid #E8F0FE; display:flex; align-items:center; gap:10px; flex-shrink:0; min-height:58px; box-shadow:0 1px 4px rgba(26,115,232,0.06); animation:sc-fade-in 0.18s ease; }
.sc-back-btn { display:flex; align-items:center; gap:6px; padding:7px 13px; border-radius:8px; border:1.5px solid #BFDBFE; background:#EFF6FF; color:#1a73e8; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; white-space:nowrap; flex-shrink:0; transition:all 0.12s; }
.sc-back-btn:hover { background:#DBEAFE; border-color:#1a73e8; }
.sc-head-divider { width:1px; height:22px; background:#E2E8F0; flex-shrink:0; }
.sc-head-icon { width:30px; height:30px; border-radius:8px; background:#EFF6FF; border:1px solid #BFDBFE; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.sc-head-info { flex:1; min-width:0; }
.sc-head-name { font-size:14px; font-weight:700; color:#0F172A; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sc-head-desc { font-size:11px; color:#64748B; margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sc-head-badge { padding:3px 10px; border-radius:20px; background:#EFF6FF; border:1px solid #BFDBFE; color:#1D4ED8; font-size:10.5px; font-weight:700; white-space:nowrap; flex-shrink:0; }
.sc-msgs { flex:1; min-height:0; overflow-y:auto; padding:14px 18px; display:flex; flex-direction:column; gap:2px; background:#F8FAFC; overscroll-behavior:contain; animation:sc-fade-in 0.2s ease; }
.sc-msgs::-webkit-scrollbar { width:3px; }
.sc-msgs::-webkit-scrollbar-thumb { background:#E2E8F0; border-radius:2px; }
.sc-sys-msg { display:flex; align-items:center; justify-content:center; gap:6px; margin:10px auto; padding:5px 14px; background:#F1F5F9; border-radius:20px; font-size:11px; color:#64748B; font-style:italic; max-width:90%; text-align:center; border:1px solid #E2E8F0; }

/* ── RESPONSIVE ── */
@media (max-width: 1100px) {
  .dm-left { width: 270px; min-width: 270px; }
  .nc-panel { width: 310px; }
}
@media (max-width: 900px) {
  .dm-head-meet { display: none; }
  .nc-panel { width: 280px; }
}
@media (max-width: 768px) {
  .dm-root { height: calc(100dvh - 56px); border-radius: 0; border: none; box-shadow: none; }
  .dm-left { position: absolute; inset: 0; z-index: 10; width: 100%; min-width: 100%; transition: transform 0.26s cubic-bezier(0.4,0,0.2,1); }
  .dm-left.mob-gone { transform: translateX(-100%); }
  .dm-chat { position: absolute; inset: 0; z-index: 20; transition: transform 0.26s cubic-bezier(0.4,0,0.2,1); }
  .dm-chat.mob-gone-chat { transform: translateX(100%); }
  .dm-back { display: flex !important; }
  .dm-chat-head { padding: 8px 10px; gap: 7px; }
  .dm-back { padding: 6px 8px; gap: 0; }
  .dm-back-lbl { display: none; }
  .dm-chat-name { font-size: 13.5px; }
  .dm-chat-meta .dm-pill.mono { display: none; }
  .dm-head-btn { padding: 0; width: 34px; height: 34px; justify-content: center; gap: 0; }
  .dm-head-btn-lbl { display: none; }
  .dm-head-meet { display: none; }
  .dm-msgs { padding: 10px 10px; }
  .dm-bub-col { max-width: 78%; }
  .dm-input { padding: 7px 10px 9px; }
  .nc-panel { width: 100%; border-left: none; }
}
@media (max-width: 380px) {
  .dm-bub-col { max-width: 82%; }
}
@media (min-width: 1280px) {
  .dm-left { width: 340px; min-width: 340px; }
}
`;