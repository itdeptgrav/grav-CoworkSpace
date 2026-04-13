"use client";
/**
 * app/coworking/direct-messages/page.js
 * All original logic preserved + PDF card UI fixed + design polished
 */
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  collection, query, where, orderBy, limit,
  onSnapshot, getDocs, getDoc, doc, setDoc, updateDoc,
  serverTimestamp, writeBatch, arrayUnion,
} from "firebase/firestore";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import MeetingSummaryModal from "../../../components/coworking/meets/MeetingSummaryModal";
import { cancelMeet, updateMeet } from "../../../lib/coworkApi";
import MediaMessageInput from "../../../components/coworking/messaging/MediaMessageInput";
import { GwSpinner } from "../../../components/coworking/shared/CoworkShared";
import { firebaseDb, firebaseAuth } from "../../../lib/coworkFirebase";
import {
  collection as fsCollection, query as fsQuery, where as fsWhere,
  onSnapshot as fsOnSnapshot, doc as fsDoc, updateDoc as fsUpdateDoc,
} from "firebase/firestore";

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

// ─── helpers ─────────────────────────────────────────────────────────────────
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
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.93)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
        <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "88vh", objectFit: "contain", borderRadius: 12, display: "block" }} />
        <button onClick={onDl} style={{ position: "absolute", bottom: 14, right: 14, width: 42, height: 42, borderRadius: "50%", background: "rgba(0,0,0,0.65)", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.65)", border: "none", cursor: "pointer", color: "#fff", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>&#x2715;</button>
      </div>
    </div>
  );
}

// ─── PDF / Document attachment card ──────────────────────────────────────────
function DocCard({ att, isMe, onDl }) {
  const isPdf = att.type === "pdf";
  const name = att.name || (isPdf ? "Document.pdf" : "Attachment");
  const ext = name.split(".").pop()?.toUpperCase() || "FILE";

  // Size display
  const sizeStr = att.bytes ? (att.bytes > 1048576
    ? (att.bytes / 1048576).toFixed(1) + " MB"
    : (att.bytes / 1024).toFixed(0) + " KB")
    : null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: isMe ? "rgba(255,255,255,0.14)" : "#F8FAFF",
      border: isMe ? "1px solid rgba(255,255,255,0.18)" : "1px solid #E2E8F0",
      borderRadius: 12, padding: "10px 12px", marginTop: 4,
      minWidth: 200, maxWidth: 260,
    }}>
      {/* Icon block */}
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: isMe ? "rgba(255,255,255,0.18)" : "#EEF2FF",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0,
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isMe ? "rgba(255,255,255,0.85)" : "#4F46E5"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span style={{ fontSize: 7, fontWeight: 800, color: isMe ? "rgba(255,255,255,0.7)" : "#4F46E5", letterSpacing: "0.02em", marginTop: -2 }}>{ext.slice(0, 4)}</span>
      </div>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: isMe ? "rgba(255,255,255,0.95)" : "#1E293B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        {sizeStr && <div style={{ fontSize: 10, color: isMe ? "rgba(255,255,255,0.55)" : "#94A3B8", marginTop: 1 }}>{sizeStr}</div>}
      </div>
      {/* Actions */}
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <a href={att.url} target="_blank" rel="noopener noreferrer"
          style={{ width: 28, height: 28, borderRadius: 7, background: isMe ? "rgba(255,255,255,0.14)" : "#E8EEFF", display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", textDecoration: "none", color: isMe ? "rgba(255,255,255,0.85)" : "#4F46E5" }}
          title="Open">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
        <button onClick={() => onDl(att.url)}
          style={{ width: 28, height: 28, borderRadius: 7, background: isMe ? "rgba(255,255,255,0.14)" : "#E8EEFF", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: isMe ? "rgba(255,255,255,0.85)" : "#4F46E5" }}
          title="Download">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
// ── ThreadRequestCard — shows a request inline in chat ──────────────────────
const STATUS_COLORS = {
  pending: { bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA" },
  approved: { bg: "#F0FDF4", color: "#15803D", border: "#BBF7D0" },
  rejected: { bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA" },
};
const PRI_COLORS = {
  urgent: { bg: "#FEF2F2", color: "#B91C1C" },
  high: { bg: "#FFF7ED", color: "#C2410C" },
  medium: { bg: "#FFFBEB", color: "#92400E" },
  low: { bg: "#F0FDF4", color: "#15803D" },
};

// ── Collapsible requests bar — small pill, expands as floating panel ──────────
function ThreadRequestsBar({ requests, employeeId, employeeName }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const pending = requests.filter(r => r.status === "pending").length;

  return (
    <div ref={panelRef} style={{ position: "relative", flexShrink: 0 }}>
      {/* Pill trigger */}
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "6px 14px", background: open ? "#FAF5FF" : "#F8FAFC",
          border: "none", borderBottom: `1px solid ${open ? "#E9D5FF" : "#E5E7EB"}`,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#7C3AED", flex: 1, textAlign: "left" }}>
          {requests.length} Request{requests.length !== 1 ? "s" : ""}
        </span>
        {pending > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "#FEF3C7", color: "#D97706", border: "1px solid #FDE68A" }}>
            {pending} pending
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Floating dropdown panel */}
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
          background: "#fff", border: "1px solid #E9D5FF", borderTop: "none",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          maxHeight: "60vh", overflowY: "auto",
          padding: "8px",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          {requests.map(req => (
            <ThreadRequestCard key={req.id} req={req} employeeId={employeeId} employeeName={employeeName} />
          ))}
        </div>
      )}
    </div>
  );
}



function Bubble({ msg, isMe, showAvatar, onImg, onDl, isHost = false, onViewSummary = null, onCancel = null, onEdit = null }) {
  const status = msg.status || (msg.sending ? "sending" : "sent");

  // ── Meeting invite card ──────────────────────────────────────────────────────
  if (msg.messageType === "meeting_invite") {
    const md = msg.meetingData || {};
    const isLiveNow = md.dateTime
      ? (Date.now() >= new Date(md.dateTime).getTime() && Date.now() <= new Date(md.dateTime).getTime() + 2 * 3600000)
      : false;

    return (
      <div style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 6, marginBottom: 8 }}>
        {/* Avatar */}
        <div style={{ width: 28, height: 28, flexShrink: 0 }}>
          {showAvatar && !isMe && (
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: avBg(msg.senderName || ""), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9.5, fontWeight: 700 }}>
              {getInit(msg.senderName || "")}
            </div>
          )}
        </div>

        {/* Invite card */}
        <div style={{ maxWidth: 320, display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
          {showAvatar && !isMe && (
            <span style={{ fontSize: 10.5, color: "#64748B", fontWeight: 600, marginBottom: 3, paddingLeft: 3 }}>{msg.senderName}</span>
          )}
          <div style={{
            background: "#fff",
            border: "2px solid #16A34A",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 4px 16px rgba(22,163,74,0.15)",
            width: 300,
          }}>
            {/* Green header */}
            <div style={{ background: isLiveNow ? "#DC2626" : "#16A34A", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, background: "rgba(255,255,255,0.2)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: "0.04em" }}>
                  {isLiveNow ? "🔴 LIVE NOW" : "📹 MEETING INVITATION"}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", marginTop: 1 }}>from {msg.senderName}</div>
              </div>
            </div>

            {/* Details */}
            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{md.meetTitle || "CoWork Meeting"}</div>
              {md.description && (
                <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>{md.description}</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "#374151" }}>
                {md.dateTime && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>📅</span>
                    <span>{new Date(md.dateTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>
                )}
                {/* Meeting code — prominent */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>🔑</span>
                  <span style={{ fontSize: 11, color: "#9AA0A6" }}>Join Code:</span>
                  <span style={{
                    fontFamily: "monospace", fontSize: 18, fontWeight: 900,
                    color: isLiveNow ? "#DC2626" : "#16A34A",
                    letterSpacing: 4, background: isLiveNow ? "#FEF2F2" : "#F0FDF4",
                    padding: "2px 10px", borderRadius: 8,
                  }}>
                    {md.joinCode || md.meetId}
                  </span>
                </div>
              </div>

              {/* Join button */}
              <a
                href={`/coworking/cowork-meeting/${md.meetId}`}
                style={{
                  display: "block", width: "100%", padding: "10px 0",
                  background: isLiveNow ? "#DC2626" : "#16A34A",
                  color: "#fff", border: "none", borderRadius: 10,
                  fontSize: 13, fontWeight: 700, textAlign: "center",
                  textDecoration: "none", marginTop: 4,
                  boxShadow: isLiveNow ? "0 4px 12px rgba(220,38,38,0.35)" : "0 4px 12px rgba(22,163,74,0.3)",
                }}
              >
                {isLiveNow ? "🔴 Join Live Meeting" : "🎥 Join Meeting"}
              </a>

              {/* Host-only: Summary, Edit, Cancel */}
              {isHost && md.meetId && (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {onViewSummary && (
                    <button onClick={() => onViewSummary(md.meetId, md.meetTitle)}
                      style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /></svg>
                      Summary
                    </button>
                  )}
                  {onEdit && (
                    <button onClick={() => onEdit({ meetId: md.meetId, title: md.meetTitle, description: md.description, dateTime: md.dateTime, participants: [] })}
                      style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      Edit
                    </button>
                  )}
                  {onCancel && isMe && (
                    <button onClick={() => onCancel(md.meetId, md.meetTitle)}
                      style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Timestamp */}
          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 3, paddingRight: isMe ? 0 : 4, paddingLeft: isMe ? 4 : 0 }}>
            {fmtTime(msg.createdAt)}
          </div>
        </div>
      </div>
    );
  }
  // ── End meeting invite ───────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 6, marginBottom: 2 }}>
      {/* Avatar */}
      <div style={{ width: 28, height: 28, flexShrink: 0 }}>
        {showAvatar && !isMe && (
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: avBg(msg.senderName || ""), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9.5, fontWeight: 700 }}>
            {getInit(msg.senderName || "")}
          </div>
        )}
      </div>
      {/* Column */}
      <div style={{ display: "flex", flexDirection: "column", maxWidth: "64%", alignItems: isMe ? "flex-end" : "flex-start" }}>
        {showAvatar && !isMe && (
          <span style={{ fontSize: 10.5, color: "#64748B", fontWeight: 600, marginBottom: 3, paddingLeft: 3 }}>{msg.senderName}</span>
        )}
        <div style={{
          padding: "10px 13px 8px",
          borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          background: msg.error ? "#FEF2F2" : isMe ? "linear-gradient(135deg,#1a73e8 0%,#1D4ED8 50%,#4F46E5 100%)" : "#FFFFFF",
          color: msg.error ? "#DC2626" : isMe ? "#fff" : "#1E293B",
          border: msg.error ? "1.5px solid #FECACA" : isMe ? "none" : "1.5px solid #EEF2F8",
          boxShadow: isMe ? "0 3px 12px rgba(26,115,232,0.28)" : "0 1px 4px rgba(15,23,42,0.06)",
          fontSize: 13.5, lineHeight: 1.55, opacity: msg.sending ? .6 : 1, wordBreak: "break-word",
        }}>
          {/* Text */}
          {msg.text && <div>{msg.text}</div>}

          {/* Attachments */}
          {msg.attachments?.map((a, i) => (
            <div key={i} style={{ marginTop: msg.text ? 6 : 0 }}>
              {/* Image */}
              {a.type === "image" && (
                <img src={a.url} alt="" onClick={() => onImg(a.url)}
                  style={{ maxWidth: 220, maxHeight: 165, borderRadius: 10, cursor: "zoom-in", display: "block", marginTop: 2 }} />
              )}
              {/* Voice */}
              {a.type === "voice" && (
                <div style={{ marginTop: 2 }}>
                  <audio controls src={a.url} style={{ maxWidth: "100%", height: 34, display: "block" }} />
                </div>
              )}
              {/* PDF / Document — proper card */}
              {a.type !== "image" && a.type !== "voice" && (
                <DocCard att={a} isMe={isMe} onDl={onDl} />
              )}
            </div>
          ))}

          {/* Timestamp + ticks */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2, marginTop: 6 }}>
            <span style={{ fontSize: 10, color: isMe ? "rgba(255,255,255,0.58)" : "#94A3B8", whiteSpace: "nowrap" }}>{fmtTime(msg.createdAt)}</span>
            <Ticks status={status} isMe={isMe} />
          </div>
        </div>
        {msg.error && <div style={{ fontSize: 10, color: "#EF4444", marginTop: 2 }}>Failed to send</div>}
      </div>
    </div>
  );
}

// ─── Avatar component ─────────────────────────────────────────────────────────
function Av({ name, size = 40 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: avBg(name || ""), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: size * 0.35, fontWeight: 700, flexShrink: 0, letterSpacing: "0.02em" }}>
      {getInit(name || "")}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DirectMessagesPage() {
  const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
  const isCeoOrTl = role === "ceo" || role === "tl";
  const [showMeetModal, setShowMeetModal] = useState(false);
  const [meetForm, setMeetForm] = useState({ title: "", dateTime: "", description: "" });
  const [meetBusy, setMeetBusy] = useState(false);
  const [meetError, setMeetError] = useState("");
  const [summaryModal, setSummaryModal] = useState(null); // { meetId, meetTitle }
  const [threadRequests, setThreadRequests] = useState([]); // requests linked to this DM thread
  const [editModal, setEditModal] = useState(null);       // meet object
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const router = useRouter();

  const [conversations, setConversations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [activeTab, setActiveTab] = useState("recents"); // "recents" | "people"
  const [convsLoading, setConvsLoading] = useState(true);
  const [empsLoading, setEmpsLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [unread, setUnread] = useState({});

  const endRef = useRef(null);
  const pendingMapRef = useRef(new Map());
  const activeConv = useRef(null);

  // All unique departments
  const allDepts = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();

  useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading]);

  // ── Load employees ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !employeeId) return;
    setEmpsLoading(true);
    getDocs(collection(firebaseDb, "cowork_employees"))
      .then(snap => setEmployees(
        snap.docs.map(d => ({ employeeId: d.id, ...d.data() })).filter(e => e.employeeId !== employeeId)
      ))
      .catch(console.error).finally(() => setEmpsLoading(false));
  }, [user, employeeId]);

  // ── Real-time conversations ───────────────────────────────────────────────
  useEffect(() => {
    if (!user || !employeeId) return;
    setConvsLoading(true);
    const q = query(
      collection(firebaseDb, "cowork_direct_messages"),
      where("participantIds", "array-contains", employeeId),
      orderBy("updatedAt", "desc")
    );
    const unsub = onSnapshot(q, async snap => {
      const convs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setConversations(convs);
      setConvsLoading(false);
      const counts = {};
      await Promise.all(convs.map(async conv => {
        if (conv.id === activeConv.current) return;
        try {
          const ms = await getDocs(query(
            collection(firebaseDb, "cowork_direct_messages", conv.id, "messages"),
            where("senderId", "!=", employeeId)
          ));
          const n = ms.docs.filter(d => !(d.data().readBy || []).includes(employeeId)).length;
          if (n > 0) counts[conv.id] = n;
        } catch (_) { }
      }));
      setUnread(counts);
    }, err => { console.error("convs:", err); setConvsLoading(false); });
    return () => unsub();
  }, [user, employeeId]);

  // ── Real-time messages ────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPerson || !employeeId) return;
    const cid = convId(employeeId, selectedPerson.employeeId);
    activeConv.current = cid;
    setMsgsLoading(true);
    const q = query(
      collection(firebaseDb, "cowork_direct_messages", cid, "messages"),
      orderBy("createdAt", "asc"), limit(100)
    );
    const unsub = onSnapshot(q, async snap => {
      const incoming = snap.docs.map(d => ({ ...d.data(), id: d.id, createdAt: tsToISO(d.data().createdAt), temp: false, sending: false, error: false }));
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
          return m.error === true;
        });
        const merged = [...incoming, ...kept].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return merged.map(m => {
          if (m.temp || m.error) return m;
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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async (text, attachments, messageType) => {
    if (!selectedPerson || !employeeId) return;
    const cid = convId(employeeId, selectedPerson.employeeId);
    const tempId = "temp_" + Date.now();
    const rt = resolveMessageType(messageType, attachments);
    const opt = { messageId: tempId, threadType: "direct", threadId: cid, senderId: employeeId, senderName: employeeName, text: text || "", attachments: attachments || [], messageType: rt, type: rt, readBy: [employeeId], status: "sending", temp: true, sending: true, error: false, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, opt]);
    try {
      const messageId = crypto.randomUUID();
      pendingMapRef.current.set(tempId, messageId);
      const convRef = doc(firebaseDb, "cowork_direct_messages", cid);
      const msgsRef = collection(firebaseDb, "cowork_direct_messages", cid, "messages");
      const snap = await getDoc(convRef);
      if (!snap.exists()) await setDoc(convRef, { conversationId: cid, participantIds: [employeeId, selectedPerson.employeeId].sort(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await setDoc(doc(msgsRef, messageId), { messageId, threadType: "direct", threadId: cid, senderId: employeeId, senderName: employeeName, text: text || "", attachments: attachments || [], messageType: rt, type: rt, readBy: [employeeId], status: "sent", createdAt: serverTimestamp() });
      const preview = rt === "image" ? "\u{1F4F7} Photo" : rt === "pdf" ? "\u{1F4C4} Document" : rt === "voice" ? "\u{1F3A4} Voice" : (text || "").slice(0, 80);
      await updateDoc(convRef, { lastMessage: { text: preview, senderId: employeeId, senderName: employeeName, messageType: rt, sentAt: serverTimestamp() }, updatedAt: serverTimestamp() });
      setMessages(prev => prev.filter(m => m.messageId !== tempId));
      pendingMapRef.current.delete(tempId);
    } catch (err) {
      console.error("send:", err);
      pendingMapRef.current.delete(tempId);
      setMessages(prev => prev.map(m => m.messageId === tempId ? { ...m, sending: false, error: true, status: "error" } : m));
    }
  };

  const selectPerson = person => {
    if (!person) return;
    setSelectedPerson(person);
    setMessages([]);
    pendingMapRef.current.clear();
    setMobileChatOpen(true);
    const cid = convId(employeeId, person.employeeId);
    setUnread(prev => { const n = { ...prev }; delete n[cid]; return n; });
  };

  const dlFile = url => {
    const a = document.createElement("a"); a.href = url;
    a.download = "file_" + Date.now(); document.body.appendChild(a);
    a.click(); document.body.removeChild(a);
  };

  // ── Thread request listener — MUST be before any early return (Rules of Hooks)
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

  // Derived data
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

  // Group messages with date separators
  const withSep = [];
  let lastDate = null;
  messages.forEach((msg, i) => {
    const ms2 = tsToMs(msg.createdAt);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    const d = ms2 ? new Date(ms2) : null;
    let ds = null;
    if (d) {
      if (d.toDateString() === today.toDateString()) ds = "Today";
      else if (d.toDateString() === yesterday.toDateString()) ds = "Yesterday";
      else ds = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    }
    if (ds && ds !== lastDate) { withSep.push({ _sep: true, label: ds }); lastDate = ds; }
    withSep.push({ ...msg, isMe: msg.senderId === employeeId, showAvatar: i === 0 || messages[i - 1]?.senderId !== msg.senderId });
  });

  const handleViewSummary = (meetId, meetTitle) => setSummaryModal({ meetId, meetTitle });

  const handleCancelMeet = async (meetId, meetTitle) => {
    if (!window.confirm(`Cancel meeting "${meetTitle}"? This cannot be undone.`)) return;
    setCancellingId(meetId);
    try { await cancelMeet(meetId); }
    catch (e) { alert(e.message || "Failed to cancel meeting"); }
    finally { setCancellingId(null); }
  };

  const handleEditSave = async (updated) => {
    if (!editModal) return;
    setEditError("");
    if (!updated.title?.trim()) { setEditError("Title is required."); return; }
    if (!updated.dateTime) { setEditError("Date and time is required."); return; }
    setEditSaving(true);
    try {
      await updateMeet(editModal.meetId, {
        title: updated.title.trim(), description: updated.description || "",
        dateTime: updated.dateTime, googleMeetLink: updated.googleMeetLink || null,
        participants: updated.participants || [],
      });
      setEditModal(null);
    } catch (e) { setEditError(e.message || "Failed to save."); }
    finally { setEditSaving(false); }
  };

  const handleCreateMeeting = async () => {
    if (!meetForm.title.trim()) { setMeetError("Title is required"); return; }
    if (!meetForm.dateTime) { setMeetError("Date and time is required"); return; }
    if (!selectedPerson) return;
    setMeetBusy(true); setMeetError("");
    try {
      const result = await apiFetch("/schedule-meet/create", {
        method: "POST",
        body: JSON.stringify({
          title: meetForm.title.trim(),
          description: meetForm.description.trim() || "",
          dateTime: meetForm.dateTime,
          googleMeetLink: null,
          participants: [selectedPerson.employeeId],
        }),
      });
      const meetId = result?.meet?.meetId || result?.meetId;
      const joinCode = result?.meet?.joinCode || result?.joinCode || "";
      // Send invite message in this conversation
      const cid = convId(employeeId, selectedPerson.employeeId);
      const convRef = doc(firebaseDb, "cowork_direct_messages", cid);
      const msgsRef = collection(convRef, "messages");
      const msgId = crypto.randomUUID();
      await setDoc(doc(msgsRef, msgId), {
        messageId: msgId, senderId: employeeId, senderName: employeeName,
        text: `Meeting Invitation: ${meetForm.title.trim()}`,
        messageType: "meeting_invite", type: "meeting_invite",
        meetingData: { meetId, joinCode, meetTitle: meetForm.title.trim(), description: meetForm.description.trim(), dateTime: meetForm.dateTime },
        readBy: [employeeId], createdAt: serverTimestamp(),
      });
      await updateDoc(convRef, {
        lastMessage: { text: `📹 Meeting invite: ${meetForm.title.trim()}`, senderId: employeeId, senderName: employeeName, messageType: "meeting_invite", sentAt: serverTimestamp() },
        updatedAt: serverTimestamp(),
      });
      setShowMeetModal(false);
      setMeetForm({ title: "", dateTime: "", description: "" });
    } catch (e) { setMeetError(e.message); }
    finally { setMeetBusy(false); }
  };

  const roleChip = r => r === "ceo" ? { bg: "#FEF3C7", color: "#92400E", label: "CEO" }
    : r === "tl" ? { bg: "#F0FDF4", color: "#166534", label: "Team Lead" }
      : { bg: "#EFF6FF", color: "#1D4ED8", label: "Member" };

  return (
    <>
      <style>{CSS}</style>
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} onDl={() => dlFile(lightbox)} />}

      <div className="dm-root">

        {/* ══════════════ SIDEBAR ══════════════ */}
        <div className={`dm-left${mobileChatOpen ? " mob-gone" : ""}`}>

          {/* Header */}
          <div className="dm-lhead">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: "linear-gradient(135deg,#1a73e8,#4F46E5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.03em", display: "flex", alignItems: "center", gap: 7 }}>
                  Messages
                  {totalUnread > 0 && <Badge n={totalUnread} />}
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500, marginTop: 1 }}>Direct conversations</div>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="dm-search-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input className="dm-search-in" placeholder="Search name or department…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="dm-search-clr" onClick={() => setSearch("")}>&#215;</button>}
          </div>

          {/* Department chips */}
          {allDepts.length > 0 && (
            <div className="dm-dept-row">
              <button className={`dm-chip${!selectedDept ? " on" : ""}`} onClick={() => setSelectedDept("")}>All</button>
              {allDepts.map(d => (
                <button key={d} className={`dm-chip${selectedDept === d ? " on" : ""}`} onClick={() => setSelectedDept(p => p === d ? "" : d)}>{d}</button>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="dm-tabs">
            <button className={`dm-tab${activeTab === "recents" ? " on" : ""}`} onClick={() => setActiveTab("recents")}>
              Recent {totalUnread > 0 && <span className="dm-tab-bdg">{totalUnread}</span>}
            </button>
            <button className={`dm-tab${activeTab === "people" ? " on" : ""}`} onClick={() => setActiveTab("people")}>
              People <span className="dm-tab-cnt">{filteredEmps.length}</span>
            </button>
          </div>

          {/* ── Recents tab ── */}
          {activeTab === "recents" && (
            <div className="dm-list">
              {convsLoading ? (
                <div className="dm-center"><GwSpinner size={22} /></div>
              ) : filteredConvs.length === 0 ? (
                <div className="dm-empty-s">
                  <div style={{ fontSize: 28, opacity: .3, marginBottom: 6 }}>&#128172;</div>
                  <div style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>No conversations yet</div>
                </div>
              ) : filteredConvs.map(conv => {
                const oid = conv.participantIds?.find(id => id !== employeeId) || "";
                const other = empMap[oid];
                const name = other?.name || oid;
                const lm = conv.lastMessage;
                const prev = lm?.messageType === "image" ? "&#128247; Photo"
                  : lm?.messageType === "pdf" ? "&#128196; Document"
                    : lm?.messageType === "voice" ? "&#127908; Voice"
                      : lm?.text?.slice(0, 46) || "No messages yet";
                const n = unread[conv.id] || 0;
                const isAct = selectedPerson?.employeeId === oid;
                return (
                  <div key={conv.id} className={`dm-row${isAct ? " act" : ""}`} onClick={() => selectPerson(other)} role="button">
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <Av name={name} size={42} />
                      {n > 0 && <div className="dm-av-dot" />}
                    </div>
                    <div className="dm-row-info">
                      <div className="dm-row-name" style={{ fontWeight: n > 0 ? 700 : 600 }}>{name}</div>
                      <div className="dm-row-prev" style={{ fontWeight: n > 0 ? 600 : 400, color: n > 0 ? "#374151" : "#94A3B8" }} dangerouslySetInnerHTML={{ __html: prev }} />
                      {other?.department && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1, fontWeight: 500 }}>{other.department}</div>}
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

          {/* ── People tab ── */}
          {activeTab === "people" && (
            <div className="dm-list">
              {empsLoading ? (
                <div className="dm-center"><GwSpinner size={22} /></div>
              ) : filteredEmps.length === 0 ? (
                <div className="dm-empty-s">
                  <div style={{ fontSize: 28, opacity: .3, marginBottom: 6 }}>&#128101;</div>
                  <div style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>No employees found</div>
                </div>
              ) : filteredEmps.map(emp => {
                const rc = roleChip(emp.role);
                const isAct = selectedPerson?.employeeId === emp.employeeId;
                return (
                  <div key={emp.employeeId} className={`dm-row${isAct ? " act" : ""}`} onClick={() => selectPerson(emp)} role="button">
                    <Av name={emp.name || emp.employeeId} size={38} />
                    <div className="dm-row-info">
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div className="dm-row-name">{emp.name || emp.employeeId}</div>
                        <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: rc.bg, color: rc.color, flexShrink: 0 }}>{rc.label}</span>
                      </div>
                      {emp.department && <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500, marginTop: 2 }}>{emp.department}</div>}
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ══════════════ CHAT PANEL ══════════════ */}
        <div className={`dm-chat${!mobileChatOpen ? " mob-gone-chat" : ""}`}>
          {!selectedPerson ? (
            <div className="dm-no-sel">
              <div className="dm-no-sel-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#64748B" }}>No conversation open</div>
              <div style={{ fontSize: 12, color: "#94A3B8", maxWidth: 220, lineHeight: 1.5 }}>Select someone from the list to start messaging</div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="dm-chat-head">
                <button className="dm-back" onClick={() => { setMobileChatOpen(false); setSelectedPerson(null); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                  Back
                </button>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Av name={selectedPerson.name || selectedPerson.employeeId} size={44} />
                  <div style={{ position: "absolute", bottom: 1, right: 1, width: 11, height: 11, borderRadius: "50%", background: "#22C55E", border: "2px solid #fff" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dm-chat-name">{selectedPerson.name || selectedPerson.employeeId}</div>
                  <div className="dm-chat-meta">
                    {selectedPerson.department && <span className="dm-pill dept">{selectedPerson.department}</span>}
                    {selectedPerson.role && (() => { const rc = roleChip(selectedPerson.role); return <span className="dm-pill" style={{ background: rc.bg, color: rc.color }}>{rc.label}</span>; })()}
                    <span className="dm-pill mono">{selectedPerson.employeeId}</span>
                  </div>
                </div>

                {/* Request button */}
                <button onClick={() => {
                  window.dispatchEvent(new CustomEvent("openRequestPanel", {
                    detail: {
                      tab: "compose",
                      threadContext: { type: "dm", threadId: convId(employeeId, selectedPerson.employeeId), recipientId: selectedPerson.employeeId, recipientName: selectedPerson.name }
                    }
                  }));
                }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, border: "1.5px solid #E9D5FF", background: "#FAF5FF", color: "#7C3AED", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    <line x1="12" y1="8" x2="12" y2="12" /><line x1="10" y1="10" x2="14" y2="10" />
                  </svg>
                  Request
                </button>

                {/* Schedule Meeting button — CEO/TL only */}
                {isCeoOrTl && (
                  <button onClick={() => { setShowMeetModal(true); setMeetError(""); }}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, border: "1.5px solid #BFDBFE", background: "#EFF6FF", color: "#1D4ED8", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" />
                    </svg>
                    Schedule Meeting
                  </button>
                )}
              </div>



              {/* Messages */}
              <div className="dm-msgs">
                {msgsLoading && messages.length === 0 ? (
                  <div className="dm-center"><GwSpinner size={24} /></div>
                ) : withSep.length === 0 ? (
                  <div className="dm-chat-empty">
                    <Av name={selectedPerson.name || "?"} size={52} />
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginTop: 4 }}>{selectedPerson.name}</div>
                    <div style={{ fontSize: 12, color: "#94A3B8" }}>No messages yet — say hello!</div>
                  </div>
                ) : (() => {
                  // Merge requests into message timeline by createdAt
                  const reqItems = threadRequests.map(r => ({
                    _isReq: true, id: r.id, req: r,
                    _ts: r.createdAt?.seconds || 0,
                  }));
                  const msgItems = withSep.map(m => ({
                    ...m, _ts: m.createdAt ? (typeof m.createdAt === 'string' ? new Date(m.createdAt).getTime() / 1000 : (m.createdAt?.seconds || 0)) : 0
                  }));
                  const combined = [...msgItems, ...reqItems].sort((a, b) => a._ts - b._ts);

                  return combined.map((item, i) => {
                    if (item._sep) return (
                      <div key={"sep" + i} className="dm-datesep">
                        <span className="dm-datesep-label">{item.label}</span>
                      </div>
                    );
                    if (item._isReq) return (
                      <div key={item.id} style={{ padding: "0 4px", marginBottom: 8 }}>
                        <ThreadRequestCard req={item.req} employeeId={employeeId} />
                      </div>
                    );
                    return (
                      <Bubble key={item.messageId || item.id || i} msg={item} isMe={item.isMe} showAvatar={item.showAvatar} onImg={setLightbox} onDl={dlFile} isHost={isCeoOrTl} onViewSummary={handleViewSummary} onCancel={handleCancelMeet} onEdit={setEditModal} />
                    );
                  });
                })()}
                <div ref={endRef} />
              </div>

              {/* Input */}
              <div className="dm-input">
                <MediaMessageInput onSend={handleSend} placeholder={`Message ${selectedPerson.name || selectedPerson.employeeId}\u2026`} disabled={msgsLoading} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Meeting Summary Modal ── */}
      {summaryModal && (
        <MeetingSummaryModal
          meetId={summaryModal.meetId}
          meetTitle={summaryModal.meetTitle}
          onClose={() => setSummaryModal(null)}
        />
      )}

      {/* ── Edit Meeting Modal ── */}
      {editModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditModal(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "min(440px,100%)", boxShadow: "0 24px 60px rgba(0,0,0,0.18)", fontFamily: "inherit", overflow: "hidden" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>✏️ Edit Meeting</div>
              <button onClick={() => setEditModal(null)} style={{ width: 28, height: 28, border: "1px solid #E2E8F0", borderRadius: 7, background: "#F8FAFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
            <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              {editError && <div style={{ padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7, fontSize: 12, color: "#B91C1C" }}>{editError}</div>}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Title</label>
                <input value={editModal.title || ""} onChange={e => setEditModal(p => ({ ...p, title: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Date</label>
                  <input type="date" value={editModal.dateTime ? editModal.dateTime.split("T")[0] : ""}
                    onChange={e => setEditModal(p => ({ ...p, dateTime: `${e.target.value}T${p.dateTime?.split("T")[1] || "09:00"}` }))}
                    style={{ width: "100%", padding: "9px 10px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Time</label>
                  <input type="time" value={editModal.dateTime ? (editModal.dateTime.split("T")[1] || "09:00") : "09:00"}
                    onChange={e => { const d = editModal.dateTime?.split("T")[0]; if (d) setEditModal(p => ({ ...p, dateTime: `${d}T${e.target.value}` })); }}
                    style={{ width: "100%", padding: "9px 10px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Description</label>
                <textarea value={editModal.description || ""} onChange={e => setEditModal(p => ({ ...p, description: e.target.value }))} rows={2}
                  style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ padding: "0 22px 20px", display: "flex", gap: 10 }}>
              <button onClick={() => setEditModal(null)} style={{ flex: 1, padding: "10px 0", border: "1.5px solid #E2E8F0", borderRadius: 9, background: "#F8FAFC", color: "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={() => handleEditSave(editModal)} disabled={editSaving}
                style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 9, background: editSaving ? "#93C5FD" : "#2563EB", color: "#fff", fontSize: 13, fontWeight: 600, cursor: editSaving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {editSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule Meeting Modal ── */}
      {showMeetModal && selectedPerson && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowMeetModal(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "min(440px,100%)", boxShadow: "0 24px 60px rgba(0,0,0,0.18)", fontFamily: "inherit", overflow: "hidden" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>📅 Schedule Meeting</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>with {selectedPerson.name}</div>
              </div>
              <button onClick={() => setShowMeetModal(false)} style={{ width: 28, height: 28, border: "1px solid #E2E8F0", borderRadius: 7, background: "#F8FAFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
            <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              {meetError && <div style={{ padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7, fontSize: 12, color: "#B91C1C" }}>{meetError}</div>}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Meeting Title *</label>
                <input value={meetForm.title} onChange={e => setMeetForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Project Review" autoFocus
                  style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Date</label>
                  <input type="date" value={meetForm.dateTime ? meetForm.dateTime.split("T")[0] : ""}
                    onChange={e => setMeetForm(p => ({ ...p, dateTime: e.target.value ? `${e.target.value}T${p.dateTime?.split("T")[1] || "09:00"}` : "" }))}
                    style={{ width: "100%", padding: "9px 10px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Time</label>
                  <input type="time" value={meetForm.dateTime ? (meetForm.dateTime.split("T")[1] || "09:00") : "09:00"} disabled={!meetForm.dateTime}
                    onChange={e => { const d = meetForm.dateTime?.split("T")[0]; if (d) setMeetForm(p => ({ ...p, dateTime: `${d}T${e.target.value}` })); }}
                    style={{ width: "100%", padding: "9px 10px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box", opacity: meetForm.dateTime ? 1 : 0.4 }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Description</label>
                <textarea value={meetForm.description} onChange={e => setMeetForm(p => ({ ...p, description: e.target.value }))} placeholder="Agenda…" rows={2}
                  style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <div style={{ padding: "10px 12px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, fontSize: 12, color: "#1D4ED8" }}>
                👤 <strong>{selectedPerson.name}</strong> will be invited automatically
              </div>
            </div>
            <div style={{ padding: "0 22px 20px", display: "flex", gap: 10 }}>
              <button onClick={() => setShowMeetModal(false)} style={{ flex: 1, padding: "10px 0", border: "1.5px solid #E2E8F0", borderRadius: 9, background: "#F8FAFC", color: "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={handleCreateMeeting} disabled={meetBusy || !meetForm.title.trim() || !meetForm.dateTime}
                style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 9, background: meetBusy || !meetForm.title.trim() || !meetForm.dateTime ? "#93C5FD" : "#2563EB", color: "#fff", fontSize: 13, fontWeight: 600, cursor: meetBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {meetBusy ? "Scheduling…" : "Schedule Meeting"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

.dm-root {
  display: flex;
  height: calc(100vh - 108px);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: #F1F5F9;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #E2E8F0;
  box-shadow: 0 4px 24px rgba(0,0,0,0.07);
  position: relative;
}

/* ─── SIDEBAR ─── */
.dm-left {
  width: 320px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-right: 1.5px solid #EEF2F8;
  overflow: hidden;
}
.dm-lhead {
  padding: 18px 18px 14px;
  border-bottom: 1px solid #F1F5F9;
  flex-shrink: 0;
}

/* Search */
.dm-search-wrap {
  margin: 10px 14px 6px;
  display: flex; align-items: center; gap: 8px;
  padding: 9px 12px;
  background: #F8FAFC;
  border: 1.5px solid #E2E8F0;
  border-radius: 10px;
  transition: all 0.15s;
  flex-shrink: 0;
}
.dm-search-wrap:focus-within { border-color: #1a73e8; background: #fff; box-shadow: 0 0 0 3px rgba(26,115,232,0.1); }
.dm-search-in { border: none; background: none; outline: none; font-size: 13px; font-weight: 500; color: #0F172A; font-family: inherit; width: 100%; }
.dm-search-in::placeholder { color: #CBD5E1; }
.dm-search-clr { background: none; border: none; cursor: pointer; color: #94A3B8; font-size: 17px; line-height: 1; padding: 0; }

/* Dept chips */
.dm-dept-row {
  display: flex; gap: 5px; padding: 4px 14px 8px;
  overflow-x: auto; flex-wrap: nowrap; flex-shrink: 0;
}
.dm-dept-row::-webkit-scrollbar { height: 0; }
.dm-chip {
  display: inline-flex; align-items: center;
  padding: 4px 11px; border-radius: 20px;
  font-size: 11px; font-weight: 600; white-space: nowrap;
  border: 1.5px solid #E2E8F0; background: #fff; color: #64748B;
  cursor: pointer; transition: all 0.12s; font-family: inherit;
}
.dm-chip:hover { border-color: #1a73e8; color: #1a73e8; }
.dm-chip.on { background: #1a73e8; color: #fff; border-color: #1a73e8; box-shadow: 0 2px 8px rgba(26,115,232,0.2); }

/* Tabs */
.dm-tabs { display: flex; padding: 0 14px; gap: 2px; border-bottom: 1.5px solid #EEF2F8; flex-shrink: 0; }
.dm-tab {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px 8px; border: none; background: none; cursor: pointer;
  font-size: 11px; font-weight: 700; color: #94A3B8;
  border-bottom: 2.5px solid transparent; margin-bottom: -1.5px;
  font-family: inherit; transition: all 0.12s; text-transform: uppercase; letter-spacing: 0.06em;
}
.dm-tab:hover { color: #475569; }
.dm-tab.on { color: #1a73e8; border-bottom-color: #1a73e8; }
.dm-tab-bdg { font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 99px; background: #EF4444; color: #fff; }
.dm-tab-cnt { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 99px; background: #F1F5F9; color: #64748B; }

/* List */
.dm-list { flex: 1; overflow-y: auto; padding: 6px 0; }
.dm-list::-webkit-scrollbar { width: 3px; }
.dm-list::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 2px; }

.dm-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.1s; user-select: none;
}
.dm-row:hover { background: #F8FAFC; }
.dm-row.act { background: #EFF6FF; border-left-color: #1a73e8; }
.dm-row-info { flex: 1; min-width: 0; }
.dm-row-name { font-size: 13px; font-weight: 600; color: #0F172A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dm-row-prev { font-size: 11px; color: #94A3B8; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dm-row-r { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
.dm-row-ts { font-size: 10px; white-space: nowrap; font-weight: 600; }
.dm-av-dot { position: absolute; top: -1px; right: -1px; width: 12px; height: 12px; border-radius: 50%; background: #EF4444; border: 2px solid #fff; }
.dm-center { display: flex; justify-content: center; padding: 30px; }
.dm-empty-s { padding: 24px 16px; text-align: center; }

/* ─── CHAT ─── */
.dm-chat {
  flex: 1; display: flex; flex-direction: column;
  background: #F8FAFC; overflow: hidden; min-width: 0;
  background-image: radial-gradient(circle at 1px 1px, #E2E8F0 1px, transparent 0);
  background-size: 20px 20px;
  background-color: #F8FAFC;
}
.dm-no-sel {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px; text-align: center; padding: 40px;
  background: #F8FAFC;
  background-image: radial-gradient(circle at 1px 1px, #E2E8F0 1px, transparent 0);
  background-size: 20px 20px;
}
.dm-no-sel-icon {
  width: 68px; height: 68px; border-radius: 20px;
  background: linear-gradient(135deg,#EEF2FF,#F0F9FF);
  display: flex; align-items: center; justify-content: center;
  border: 1.5px solid #E0E7FF;
}

/* Chat header */
.dm-chat-head {
  padding: 12px 18px; background: #fff;
  border-bottom: 1.5px solid #EEF2F8;
  display: flex; align-items: center; gap: 12px;
  flex-shrink: 0; min-height: 66px;
  box-shadow: 0 1px 3px rgba(15,23,42,0.04);
}
.dm-chat-name { font-size: 15px; font-weight: 700; color: #0F172A; letter-spacing: -0.02em; }
.dm-chat-meta { display: flex; align-items: center; gap: 5px; margin-top: 4px; flex-wrap: wrap; }
.dm-pill {
  font-size: 10.5px; font-weight: 600; padding: 2px 8px;
  border-radius: 20px; letter-spacing: 0.02em; white-space: nowrap;
}
.dm-pill.dept  { background: #EFF6FF; color: #1D4ED8; }
.dm-pill.mono  { background: #F8FAFC; color: #94A3B8; font-family: monospace; font-size: 9px; border: 1px solid #E2E8F0; }

.dm-back {
  display: none; align-items: center; gap: 5px;
  padding: 7px 12px; border: 1.5px solid #E2E8F0; border-radius: 9px;
  background: #fff; cursor: pointer; color: #1a73e8;
  font-size: 12px; font-weight: 600; font-family: inherit;
  transition: all 0.12s; white-space: nowrap; flex-shrink: 0;
}
.dm-back:hover { background: #EFF6FF; border-color: #1a73e8; }

/* Messages */
.dm-msgs {
  flex: 1; overflow-y: auto; padding: 16px 20px;
  display: flex; flex-direction: column; gap: 2px;
  background: inherit;
}
.dm-msgs::-webkit-scrollbar { width: 4px; }
.dm-msgs::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 2px; }

.dm-datesep { display: flex; align-items: center; gap: 8px; margin: 12px 0 8px; }
.dm-datesep::before, .dm-datesep::after { content: ""; flex: 1; height: 1px; background: #E2E8F0; }
.dm-datesep-label {
  font-size: 10.5px; font-weight: 700; color: "#94A3B8";
  padding: 3px 12px; background: #EEF2F8; border-radius: 20px;
  white-space: nowrap; letter-spacing: 0.03em;
}

.dm-chat-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px; text-align: center; padding: 40px;
}

/* Input */
.dm-input { flex-shrink: 0; border-top: 1.5px solid #EEF2F8; background: #fff; padding: 10px 16px 12px; }

/* ─── RESPONSIVE ─── */
@media (max-width: 768px) {
  .dm-root { height: calc(100dvh - 56px); border-radius: 0; border: none; }
  .dm-left {
    position: absolute; inset: 0; z-index: 10; width: 100%; min-width: 100%;
    transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
  }
  .dm-left.mob-gone { transform: translateX(-100%); }
  .dm-chat {
    position: absolute; inset: 0; z-index: 20;
    transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
  }
  .dm-chat.mob-gone-chat { transform: translateX(100%); }
  .dm-back { display: flex !important; }
  .dm-msgs { padding: 12px 14px; }
  .dm-chat-head { padding: 10px 14px; }
}
@media (min-width: 769px) and (max-width: 1024px) {
  .dm-left { width: 272px; min-width: 272px; }
  .dm-back { display: flex !important; }
}
@media (min-width: 1280px) {
  .dm-left { width: 360px; min-width: 360px; }
}
`
// ── Request Card — professional, like meeting invite ─────────────────────────
const REQ_STATUS_COLORS = {
  pending: { color: "#D97706", bg: "#FEF3C7", border: "#FDE68A" },
  approved: { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  rejected: { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
};
const REQ_PRI_COLOR = { urgent: "#DC2626", high: "#D97706", medium: "#6366F1", low: "#6B7280" };
const REQ_PRI_BG = { urgent: "#FEF2F2", high: "#FEF3C7", medium: "#EEF2FF", low: "#F9FAFB" };

function ThreadRequestCard({ req, employeeId }) {
  const sc = REQ_STATUS_COLORS[req.status] || REQ_STATUS_COLORS.pending;
  const isFromMe = req.fromId === employeeId;
  const isToMe = req.toId === employeeId;

  const fire = (extra) => window.dispatchEvent(new CustomEvent("openRequestPanel", {
    detail: { tab: isToMe ? "received" : "sent", requestId: req.id, ...extra }
  }));

  return (
    <div style={{ display: "flex", justifyContent: isFromMe ? "flex-end" : "flex-start", width: "100%", marginBottom: 4 }}>
      <div style={{ maxWidth: 280, width: "100%", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", border: "1px solid #E2E8F0", background: "#fff" }}>
        {/* Header — dark like meeting card */}
        <div style={{ background: "#1E293B", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em" }}>Request</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>from {req.fromName}</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 99, color: sc.color, background: sc.bg, border: `1px solid ${sc.border}`, flexShrink: 0, whiteSpace: "nowrap" }}>{req.status}</span>
          {req.priority && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5, color: REQ_PRI_COLOR[req.priority], background: REQ_PRI_BG[req.priority], flexShrink: 0 }}>{req.priority}</span>}
        </div>

        {/* Body */}
        <div style={{ padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{req.subject}</div>
          {req.message && <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{req.message}</div>}
          {req.dueDate && <div style={{ fontSize: 11, color: "#D97706", fontWeight: 600 }}>⏰ Due {new Date(req.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>}
          {req.type && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: "#F1F5F9", color: "#475569", fontWeight: 600, border: "1px solid #E2E8F0", alignSelf: "flex-start" }}>{req.type}</span>}
          {req.attachments?.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {req.attachments.map((att, i) => (
                <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 10, color: "#2563EB", background: "#EFF6FF", border: "1px solid #BFDBFE", padding: "2px 8px", borderRadius: 5, textDecoration: "none", fontWeight: 500 }}>
                  📎 {(att.name || "File").slice(0, 18)}
                </a>
              ))}
            </div>
          )}
          {req.responseMessage && (
            <div style={{ padding: "5px 9px", background: "#F8FAFC", borderRadius: 6, fontSize: 11, color: "#374151", borderLeft: "2px solid #CBD5E1" }}>
              <strong>Response:</strong> {req.responseMessage}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            {isToMe && req.status === "pending" && (
              <button onClick={() => fire({ openRespond: true })}
                style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "none", background: "#16A34A", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                ✓ Respond
              </button>
            )}
            <button onClick={() => fire({ openChat: true })}
              style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "1px solid #E2E8F0", background: "#fff", color: "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              💬 Chat
            </button>
            <button onClick={() => fire({})}
              style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "1px solid #E2E8F0", background: "#fff", color: "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              View →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

;