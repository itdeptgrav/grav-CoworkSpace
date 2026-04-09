"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../hooks/useCoworkAuth";
import { useMeetings, useGroups } from "../../hooks/useCoworkData";
import { getCoworkSocket } from "../../lib/coworkSocket";
import { GwSpinner, GwConfirm } from "../../components/coworking/shared/CoworkShared";
import EditDeadlineModal from "../../components/coworking/tasks/EditDeadlineModal";
import { deleteTask } from "../../lib/mediaUploadApi";
import { firebaseAuth, firebaseDb } from "../../lib/coworkFirebase";
import { useCoworkNotifications } from "../../hooks/useCoworkNotifications";
import { timeAgo } from "../../lib/coworkUtils";

import {
  collection, doc, updateDoc, serverTimestamp,
  query, where, orderBy, onSnapshot, setDoc, getDocs, limit,
} from "firebase/firestore";

/* ──────────────────────────────────────────────────────────
   PUSH
────────────────────────────────────────────────────────── */
function reqPush() {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default")
    Notification.requestPermission();
}
function firePush(t, b) {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted")
    try { new Notification(t, { body: b, icon: "/favicon.ico" }); } catch (_) { }
}

/* ──────────────────────────────────────────────────────────
   DEADLINE INFO
────────────────────────────────────────────────────────── */
function dlInfo(d) {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  if (ms < 0) return { s: "overdue", c: "#DC2626", bg: "#FEF2F2", text: `Overdue ${Math.ceil(-ms / 86400000)}d` };
  if (ms < 86400000) return { s: "critical", c: "#D97706", bg: "#FFFBEB", text: `${Math.ceil(ms / 3600000)}h left` };
  if (ms < 172800000) return { s: "near", c: "#B45309", bg: "#FEF3C7", text: "Due tomorrow" };
  if (ms < 604800000) return { s: "week", c: "#2563EB", bg: "#EFF6FF", text: `${Math.ceil(ms / 86400000)}d left` };
  return { s: "safe", c: "#16A34A", bg: "#F0FDF4", text: new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) };
}

function dlDot(info) {
  if (!info) return "#9CA3AF";
  return { overdue: "#DC2626", critical: "#D97706", near: "#B45309", week: "#2563EB", safe: "#16A34A" }[info.s] || "#9CA3AF";
}

/* ──────────────────────────────────────────────────────────
   DESIGNATION
────────────────────────────────────────────────────────── */
function desg(emp) {
  if (!emp) return "";
  if (emp.role === "ceo") return "Admin / CEO";
  if (emp.role === "tl") return emp.department ? `Team Lead · ${emp.department}` : "Team Lead";
  return emp.department || "Employee";
}

/* ──────────────────────────────────────────────────────────
   AVATAR COLORS — small set of muted tones
────────────────────────────────────────────────────────── */
const AVC = ["#3B4252", "#4C51BF", "#0F766E", "#7C2D12", "#6D28D9", "#0E7490", "#9D174D", "#374151"];
const avC = s => AVC[(s || "?").charCodeAt(0) % AVC.length];

/* ──────────────────────────────────────────────────────────
   SVG ICONS  — flexShrink moved to style to avoid DOM warning
────────────────────────────────────────────────────────── */
function Ic({ n, s = 14, c = "#6B7280", w = "1.5" }) {
  const p = {
    width: s, height: s, viewBox: "0 0 24 24",
    fill: "none", stroke: c, strokeWidth: w,
    strokeLinecap: "round", strokeLinejoin: "round",
    style: { display: "block", flexShrink: 0 },
  };
  const d = {
    task: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>,
    chat: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
    users: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>,
    video: <><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></>,
    cal: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    alert: <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></>,
    forward: <><polyline points="15 17 20 12 15 7" /><path d="M4 18v-2a4 4 0 014-4h12" /></>,
    arrow: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
    chevR: <polyline points="9 18 15 12 9 6" />,
    chevL: <polyline points="15 18 9 12 15 6" />,
    chevD: <polyline points="6 9 12 15 18 9" />,
    chevU: <polyline points="18 15 12 9 6 15" />,
    x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    checkC: <><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    send: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
    edit: <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
    trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></>,
    bar: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    attach: <><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></>,
    img: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>,
    file: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
    down: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    bell: <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
    emp: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    refresh: <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></>,
  };
  return <svg {...p}>{d[n] || null}</svg>;
}

/* ──────────────────────────────────────────────────────────
   MINI DONUT
────────────────────────────────────────────────────────── */
function Donut({ segs, total, sz = 90 }) {
  const R = (sz - 11) / 2, circ = 2 * Math.PI * R, cx = sz / 2, cy = sz / 2;
  let off = 0;
  return (
    <svg width={sz} height={sz} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#E5E7EB" strokeWidth={11} />
      {segs.filter(s => s.v > 0).map((s, i) => {
        const len = (s.v / Math.max(total, 1)) * circ;
        const rot = -90 + (off / circ) * 360; off += len;
        return <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={s.c} strokeWidth={11}
          strokeDasharray={`${len} ${circ - len}`} transform={`rotate(${rot} ${cx} ${cy})`} strokeLinecap="round" />;
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="8" fill="#9CA3AF" fontFamily="Inter,sans-serif">Total</text>
      <text x={cx} y={cy + 9} textAnchor="middle" fontSize="17" fontWeight="800" fill="#111827" fontFamily="Inter,sans-serif">{total}</text>
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────
   BAR CHART  — bars anchored to bottom, fills card properly
────────────────────────────────────────────────────────── */
function BarChart({ data }) {
  const max = Math.max(...data.map(d => d.v), 1);
  const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const cm = new Date().getMonth();
  const BAR_AREA = 70;
  return (
    <div style={{ display: "flex", gap: 3, height: BAR_AREA + 20, alignItems: "stretch" }}>
      {data.map((d, i) => {
        const barH = d.v > 0 ? Math.max(Math.round((d.v / max) * BAR_AREA), 4) : 2;
        const active = i === cm;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
            {active && d.v > 0 && (
              <div style={{ background: "#1E293B", color: "#fff", fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 3, marginBottom: 4, whiteSpace: "nowrap", flexShrink: 0 }}>
                {d.v}
              </div>
            )}
            <div style={{
              width: "100%", height: barH, flexShrink: 0,
              borderRadius: active ? "3px 3px 0 0" : "2px 2px 0 0",
              background: active ? "#4F46E5" : "transparent",
              border: active ? "none" : "1px solid #E5E7EB",
              backgroundImage: active ? "none" : `repeating-linear-gradient(-45deg,transparent,transparent 2px,#E5E7EB 2px,#E5E7EB 3px)`,
              transition: "height 0.4s ease",
            }} />
            <div style={{ fontSize: 7.5, color: active ? "#4F46E5" : "#D1D5DB", fontWeight: active ? 700 : 400, marginTop: 3, lineHeight: 1, flexShrink: 0 }}>
              {MONTHS[i]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   MEDIA ATTACHMENT
────────────────────────────────────────────────────────── */
function MediaAttachment({ att }) {
  const [expanded, setExpanded] = useState(false);
  if (!att) return null;
  const url = att.url || att.fileUrl || att.downloadUrl || (typeof att === "string" ? att : "");
  const name = att.originalName || att.fileName || att.name || "Attachment";
  const mime = att.mimeType || att.type || "";
  const isImg = mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name);
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(name);
  const ext = (name.split(".").pop() || "FILE").toUpperCase();
  if (!url) return null;

  if (isImg) {
    return (
      <div style={{ marginTop: 5 }}>
        {!expanded ? (
          <button onClick={() => setExpanded(true)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "6px 9px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <Ic n="img" s={12} c="#6B7280" />
            <span style={{ flex: 1, fontSize: 11, color: "#374151", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            <span style={{ fontSize: 8, color: "#9CA3AF", background: "#F3F4F6", padding: "1px 4px", borderRadius: 3, flexShrink: 0 }}>{ext}</span>
            <Ic n="eye" s={10} c="#9CA3AF" />
          </button>
        ) : (
          <div style={{ border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 8px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
              <span style={{ fontSize: 10, color: "#374151", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{name}</span>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#2563EB", textDecoration: "none", fontWeight: 600 }}>
                  <Ic n="down" s={10} c="#2563EB" /> Download
                </a>
                <button onClick={() => setExpanded(false)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}>
                  <Ic n="x" s={10} c="#9CA3AF" />
                </button>
              </div>
            </div>
            <img src={url} alt={name} style={{ width: "100%", maxHeight: 200, objectFit: "contain", background: "#F9FAFB", display: "block" }} onError={e => { e.target.style.display = "none"; }} />
          </div>
        )}
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 7, padding: "6px 9px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, textDecoration: "none" }}>
      <Ic n={isPdf ? "file" : "attach"} s={12} c="#6B7280" />
      <span style={{ flex: 1, fontSize: 11, color: "#374151", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      <span style={{ fontSize: 8, color: "#9CA3AF", background: "#F3F4F6", padding: "1px 4px", borderRadius: 3, flexShrink: 0 }}>{ext}</span>
      <Ic n="down" s={10} c="#9CA3AF" />
    </a>
  );
}

/* ──────────────────────────────────────────────────────────
   TASK SIDE PANEL (latest msg + quick reply as ONE section)
────────────────────────────────────────────────────────── */
function TaskSidePanel({ task, onTaskClick, empMap, employeeId, employeeName, onClose }) {
  const [recentMsg, setRecentMsg] = useState(null);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!task?.taskId) return;
    const q = query(collection(firebaseDb, "cowork_tasks", task.taskId, "chat"), orderBy("createdAt", "desc"), limit(1));
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) setRecentMsg({ id: snap.docs[0].id, ...snap.docs[0].data() });
      else setRecentMsg(null);
    });
    return () => unsub();
  }, [task?.taskId]);

  const sendMsg = async () => {
    if (!msgText.trim()) return;
    setSending(true);
    try {
      const msgId = crypto.randomUUID();
      const ref = collection(firebaseDb, "cowork_tasks", task.taskId, "chat");
      await setDoc(doc(ref, msgId), {
        messageId: msgId, taskId: task.taskId, senderId: employeeId,
        senderName: employeeName, text: msgText.trim(),
        attachments: [], messageType: "text", mention: null, createdAt: serverTimestamp(),
      });
      await updateDoc(doc(firebaseDb, "cowork_tasks", task.taskId), {
        lastChatAt: serverTimestamp(), lastChatPreview: msgText.trim(), updatedAt: serverTimestamp(),
      });
      setSent(true); setMsgText("");
      setTimeout(() => setSent(false), 2500);
    } catch (e) { console.error(e); } finally { setSending(false); }
  };

  if (!task) return null;
  const msgAtts = (recentMsg?.attachments || []).filter(a => a?.url || a?.fileUrl || (typeof a === "string" && a.startsWith("http")));

  return (
    <div style={{ borderTop: "1px solid #F3F4F6", background: "#FAFAFA" }}>
      {/* Open task button */}
      <div style={{ padding: "8px 10px 0" }}>
        <button onClick={() => onTaskClick(task)} style={{ width: "100%", padding: "6px 0", border: "1px solid #E5E7EB", borderRadius: 7, background: "#fff", color: "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, transition: "all 0.12s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#EFF6FF"; e.currentTarget.style.borderColor = "#4F46E5"; e.currentTarget.style.color = "#4F46E5"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.color = "#374151"; }}>
          Open Task <Ic n="arrow" s={9} c="currentColor" />
        </button>
      </div>

      {/* Latest message + quick reply as ONE unified section */}
      <div style={{ margin: "8px 10px 10px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff", overflow: "hidden" }}>
        {/* Latest message */}
        {recentMsg && (
          <div style={{ padding: "9px 10px", borderBottom: "1px solid #F3F4F6" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: avC(recentMsg.senderId || recentMsg.senderName || ""), color: "#fff", fontSize: 7, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {(recentMsg.senderName || "?")[0]?.toUpperCase()}
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#374151" }}>{recentMsg.senderName || "Unknown"}</span>
              </div>
              <span style={{ fontSize: 9, color: "#9CA3AF" }}>{timeAgo(recentMsg.createdAt)}</span>
            </div>
            {recentMsg.text && recentMsg.messageType !== "system" && (
              <p style={{ margin: 0, fontSize: 11, color: "#4B5563", lineHeight: 1.5 }}>{recentMsg.text}</p>
            )}
            {recentMsg.messageType === "system" && recentMsg.text && (
              <p style={{ margin: 0, fontSize: 10, color: "#9CA3AF", fontStyle: "italic" }}>{recentMsg.text}</p>
            )}
            {msgAtts.map((a, i) => <MediaAttachment key={i} att={typeof a === "string" ? { url: a, name: "Attachment" } : a} />)}
          </div>
        )}
        {!recentMsg && (
          <div style={{ padding: "9px 10px", borderBottom: "1px solid #F3F4F6", textAlign: "center" }}>
            <span style={{ fontSize: 10, color: "#9CA3AF" }}>No messages yet — be the first!</span>
          </div>
        )}
        {/* Reply input — same box, no separator label */}
        <div style={{ padding: "7px 8px" }}>
          {sent ? (
            <div style={{ padding: "6px 8px", background: "#F0FDF4", borderRadius: 5, fontSize: 10.5, color: "#16A34A", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <Ic n="checkC" s={11} c="#16A34A" /> Sent!
            </div>
          ) : (
            <div style={{ display: "flex", gap: 5 }}>
              <input
                value={msgText}
                onChange={e => setMsgText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMsg()}
                placeholder="Reply..."
                style={{ flex: 1, padding: "6px 8px", fontSize: 11, border: "1px solid #E5E7EB", borderRadius: 5, outline: "none", fontFamily: "inherit", color: "#111827", background: "#F9FAFB" }}
                onFocus={e => e.target.style.borderColor = "#4F46E5"}
                onBlur={e => e.target.style.borderColor = "#E5E7EB"}
              />
              <button onClick={sendMsg} disabled={sending || !msgText.trim()} style={{ width: 28, height: 28, borderRadius: 5, background: msgText.trim() ? "#4F46E5" : "#F3F4F6", border: "none", cursor: msgText.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.12s" }}>
                {sending
                  ? <div style={{ width: 9, height: 9, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
                  : <Ic n="send" s={10} c={msgText.trim() ? "#fff" : "#D1D5DB"} />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   DEADLINE TRACKER CARD (in sidebar panel)
   — extracted as proper component so hooks are valid
────────────────────────────────────────────────────────── */
function DLTrackerItem({ task, employeeId, empMap, isCEO, onTaskClick, onOpenTask }) {
  const [open, setOpen] = useState(false);
  const info = dlInfo(task.dueDate);
  const byMe = task.assignedBy === employeeId;
  const dot = dlDot(info);

  let fromLine = "", toLine = "";
  if (isCEO) {
    if (byMe) {
      const names = (task.assigneeIds || []).slice(0, 2).map(id => {
        const e = empMap?.[id];
        return (e?.name || id) + (e?.department ? " · " + e.department : "");
      });
      fromLine = "By you";
      toLine = "To " + (names.join(", ") || "team");
    } else {
      const e = empMap?.[task.assignedBy];
      fromLine = "From " + (task.assignedByName || "Unknown") + (desg(e) ? " · " + desg(e) : "");
      toLine = "To you";
    }
  } else {
    if (byMe) {
      const names = (task.assigneeIds || []).slice(0, 2).map(id => { const e = empMap?.[id]; return e?.name || id; });
      fromLine = "By you";
      toLine = "To " + (names.join(", ") || "team");
    } else {
      const e = empMap?.[task.assignedBy];
      fromLine = "From " + (task.assignedByName || "Unknown") + (desg(e) ? " · " + desg(e) : "");
      toLine = "To you";
    }
  }

  return (
    <div style={{ borderRadius: 8, overflow: "hidden", background: "#fff", border: `1px solid ${open ? "#4F46E5" : "#F3F4F6"}`, marginBottom: 5, transition: "border-color 0.15s" }}>
      <div style={{ padding: "8px 10px", cursor: "pointer" }} onClick={() => setOpen(p => !p)}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0, marginTop: 5 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", lineHeight: 1.35, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>
            <div style={{ fontSize: 10, color: "#6B7280", lineHeight: 1.4 }}>{fromLine}</div>
            <div style={{ fontSize: 10, color: "#9CA3AF", lineHeight: 1.4 }}>{toLine}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
            {info
              ? <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, color: info.c, background: info.bg, whiteSpace: "nowrap" }}>{info.text}</span>
              : <span style={{ fontSize: 9, color: "#D1D5DB" }}>No deadline</span>}
            <span style={{ fontSize: 8.5, fontFamily: "monospace", color: "#D1D5DB" }}>{task.taskId}</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Ic n={open ? "chevU" : "chevD"} s={9} c="#D1D5DB" />
        </div>
      </div>
      {open && (
        <TaskSidePanel
          task={task}
          onTaskClick={onTaskClick}
          empMap={empMap}
          employeeId={employeeId}
          employeeName={onOpenTask}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   DEADLINE SIDEBAR
────────────────────────────────────────────────────────── */
function DeadlineSidebar({ tasks, role, employeeId, employeeName, empMap, open, onToggle, onTaskClick }) {
  const isCEO = role === "ceo";
  const [dirFilter, setDirFilter] = useState("all");   // all | to_you | by_you
  const [dateFilter, setDateFilter] = useState("all");   // all | today | week | month
  const [expanded, setExpanded] = useState(false);
  const W = expanded ? 356 : 292;

  const filtered = tasks.filter(t => {
    if (dirFilter === "to_you" && !((t.assigneeIds || []).includes(employeeId))) return false;
    if (dirFilter === "by_you" && t.assignedBy !== employeeId) return false;
    if (t.dueDate) {
      const ms = new Date(t.dueDate).getTime() - Date.now();
      if (dateFilter === "today" && ms > 86400000) return false;
      if (dateFilter === "week" && ms > 604800000) return false;
      if (dateFilter === "month" && ms > 2592000000) return false;
    } else {
      // Tasks without deadline hidden for date filters
      if (dateFilter !== "all") return false;
    }
    return true;
  });

  // Sort: by deadline asc, no-deadline at end
  const sorted = [...filtered].sort((a, b) => {
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
    return 0;
  });

  const overdue = sorted.filter(t => dlInfo(t.dueDate)?.s === "overdue");
  const soon = sorted.filter(t => ["critical", "near"].includes(dlInfo(t.dueDate)?.s));
  const thisWeek = sorted.filter(t => dlInfo(t.dueDate)?.s === "week");
  const upcoming = sorted.filter(t => dlInfo(t.dueDate)?.s === "safe");
  const noDl = sorted.filter(t => !t.dueDate);

  function Sec({ label, items, dotColor, max = 3 }) {
    const [all, setAll] = useState(false);
    if (!items.length) return null;
    const shown = all ? items : items.slice(0, max);
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: dotColor === "#9CA3AF" ? "#6B7280" : "#fff", background: dotColor, borderRadius: 99, padding: "0 4px", lineHeight: "14px" }}>{items.length}</span>
          </div>
          {items.length > max && (
            <button onClick={() => setAll(p => !p)} style={{ fontSize: 9, color: "#6B7280", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              {all ? "Less" : `+${items.length - max}`}
            </button>
          )}
        </div>
        {shown.map(t => (
          <DLTrackerItem
            key={t.taskId}
            task={t}
            employeeId={employeeId}
            empMap={empMap}
            isCEO={isCEO}
            onTaskClick={onTaskClick}
            onOpenTask={employeeName}
          />
        ))}
      </div>
    );
  }

  const urgentCount = overdue.length + soon.length;

  return (
    <>
      {/* Pull tab */}
      <button onClick={onToggle} style={{ position: "fixed", right: open ? W : 0, top: "50%", transform: "translateY(-50%)", width: 22, height: 52, background: "#fff", border: "1px solid #E5E7EB", borderRight: "none", borderRadius: "7px 0 0 7px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "-2px 0 6px rgba(0,0,0,0.05)", zIndex: 301, transition: "right 0.25s cubic-bezier(0.4,0,0.2,1)", position: "fixed" }}>
        <Ic n={open ? "chevR" : "chevL"} s={10} c="#9CA3AF" />
        {urgentCount > 0 && (
          <span style={{ position: "absolute", top: 3, right: open ? 2 : -5, minWidth: 13, height: 13, borderRadius: 99, background: "#DC2626", color: "#fff", fontSize: 7, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 2px", border: "2px solid #fff" }}>
            {urgentCount}
          </span>
        )}
      </button>
      {/* Panel */}
      <div style={{ position: "fixed", top: 0, right: 0, width: W, height: "100vh", background: "#F9FAFB", zIndex: 300, display: "flex", flexDirection: "column", transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1), width 0.18s ease", boxShadow: open ? "-4px 0 20px rgba(0,0,0,0.07)" : "none" }}>
        {/* Header */}
        <div style={{ padding: "13px 12px 10px", background: "#fff", borderBottom: "1px solid #F3F4F6" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Ic n="alert" s={13} c="#4F46E5" />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Deadline Tracker</div>
                <div style={{ fontSize: 9, color: "#9CA3AF" }}>{filtered.length} of {tasks.length} tasks</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setExpanded(p => !p)} style={{ width: 22, height: 22, borderRadius: 5, border: "1px solid #E5E7EB", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Ic n={expanded ? "chevR" : "chevL"} s={9} c="#9CA3AF" />
              </button>
              <button onClick={onToggle} style={{ width: 22, height: 22, borderRadius: 5, border: "1px solid #E5E7EB", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Ic n="x" s={9} c="#9CA3AF" />
              </button>
            </div>
          </div>
          {/* Direction filter */}
          <div style={{ display: "flex", gap: 3, marginBottom: 5 }}>
            {[["all", "All"], ["to_you", "To You"], ["by_you", "By You"]].map(([v, l]) => (
              <button key={v} onClick={() => setDirFilter(v)} style={{ flex: 1, padding: "4px 0", border: `1px solid ${dirFilter === v ? "#4F46E5" : "#E5E7EB"}`, borderRadius: 5, background: dirFilter === v ? "#4F46E5" : "#fff", color: dirFilter === v ? "#fff" : "#6B7280", fontSize: 9.5, fontWeight: dirFilter === v ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}>
                {l}
              </button>
            ))}
          </div>
          {/* Date filter */}
          <div style={{ display: "flex", gap: 3 }}>
            {[["all", "All"], ["today", "Today"], ["week", "Week"], ["month", "Month"]].map(([v, l]) => (
              <button key={v} onClick={() => setDateFilter(v)} style={{ flex: 1, padding: "3px 0", border: `1px solid ${dateFilter === v ? "#374151" : "#E5E7EB"}`, borderRadius: 5, background: dateFilter === v ? "#374151" : "transparent", color: dateFilter === v ? "#fff" : "#9CA3AF", fontSize: 8.5, fontWeight: dateFilter === v ? 700 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 9px", scrollbarWidth: "thin", scrollbarColor: "#E5E7EB transparent" }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: "center", padding: "36px 16px", color: "#9CA3AF" }}>
              <Ic n="checkC" s={26} c="#D1D5DB" />
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "#6B7280" }}>All clear</div>
              <div style={{ fontSize: 10, marginTop: 3 }}>No tasks match filters</div>
            </div>
          ) : (
            <>
              <Sec label="Overdue" items={overdue} dotColor="#DC2626" max={3} />
              <Sec label="Due Soon" items={soon} dotColor="#D97706" max={3} />
              <Sec label="This Week" items={thisWeek} dotColor="#2563EB" max={3} />
              <Sec label="Upcoming" items={upcoming} dotColor="#16A34A" max={3} />
              <Sec label="No Deadline" items={noDl} dotColor="#9CA3AF" max={3} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ──────────────────────────────────────────────────────────
   REMINDER ITEM
────────────────────────────────────────────────────────── */
function ReminderItem({ task, onClick, isCEO, empMap, employeeId }) {
  const info = dlInfo(task.dueDate);
  const byMe = task.assignedBy === employeeId;
  const isUrgent = info?.s === "overdue" || info?.s === "critical";

  let fromLine = "", toLine = "";
  if (isCEO) {
    if (byMe) {
      const names = (task.assigneeIds || []).slice(0, 2).map(id => {
        const e = empMap?.[id];
        return (e?.name || id) + (e?.department ? " · " + e.department : "");
      });
      fromLine = "By you";
      toLine = "To " + (names.join(", ") || "team");
    } else {
      const e = empMap?.[task.assignedBy];
      fromLine = "From " + (task.assignedByName || "Unknown") + (desg(e) ? " · " + desg(e) : "");
      toLine = "To you";
    }
  } else {
    if (byMe) {
      const names = (task.assigneeIds || []).slice(0, 2).map(id => { const e = empMap?.[id]; return e?.name || id; });
      fromLine = "By you";
      toLine = "To " + (names.join(", ") || "team");
    } else {
      const e = empMap?.[task.assignedBy];
      fromLine = task.assignedByName
        ? "From " + task.assignedByName + (desg(e) ? " · " + desg(e) : "")
        : "Assigned to you";
      toLine = "To you";
    }
  }

  return (
    <div onClick={() => onClick(task)}
      style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "9px 8px", borderRadius: 8, cursor: "pointer", transition: "background 0.1s", marginBottom: 2 }}
      onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <Ic n={isUrgent ? "alert" : "task"} s={14} c={isUrgent ? "#DC2626" : "#9CA3AF"} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#111827", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>
        <div style={{ fontSize: 10, color: "#6B7280", lineHeight: 1.35 }}>{fromLine}</div>
        <div style={{ fontSize: 10, color: "#9CA3AF", lineHeight: 1.35 }}>{toLine}</div>
      </div>
      {info && (
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, color: info.c, background: info.bg, whiteSpace: "nowrap", flexShrink: 0, marginTop: 1 }}>
          {info.text}
        </span>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   TASK ROW (table / list)
────────────────────────────────────────────────────────── */
function TaskRow({ task, onClick, showFrom, isCEO, empMap, employeeId }) {
  const info = dlInfo(task.dueDate);
  const STBG = {
    open: { c: "#374151", bg: "#F3F4F6" },
    confirmed: { c: "#1D4ED8", bg: "#EFF6FF" },
    in_progress: { c: "#B45309", bg: "#FFFBEB" },
    done: { c: "#16A34A", bg: "#F0FDF4" },
  };
  const sm = STBG[task.status] || STBG.open;
  const byMe = task.assignedBy === employeeId;

  let fromLine = "", toLine = "";
  if (showFrom && task.assignedByName) {
    const e = empMap?.[task.assignedBy];
    fromLine = task.assignedByName + (desg(e) ? " · " + desg(e) : "");
    toLine = "to you";
  } else if (!showFrom) {
    const names = (task.assigneeIds || []).slice(0, 2).map(id => {
      const e = empMap?.[id];
      return (e?.name || id) + (e?.department ? " · " + e.department : "");
    });
    fromLine = "by you";
    toLine = "to " + (names.join(", ") || "team");
  }

  return (
    <div onClick={() => onClick?.(task)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 7px", borderRadius: 7, cursor: "pointer", transition: "background 0.1s", marginBottom: 1 }}
      onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Ic n="task" s={12} c="#9CA3AF" />
        </div>
        <div style={{ position: "absolute", bottom: -1, right: -1, width: 7, height: 7, borderRadius: "50%", background: dlDot(info), border: "2px solid #fff" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 1 }}>{task.title}</div>
        <div style={{ fontSize: 10, color: "#6B7280" }}>{fromLine}</div>
        <div style={{ fontSize: 10, color: "#9CA3AF" }}>{toLine}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
        {info && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, color: info.c, background: info.bg, whiteSpace: "nowrap" }}>{info.text}</span>}
        <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 4, color: sm.c, background: sm.bg, textTransform: "capitalize", whiteSpace: "nowrap" }}>
          {(task.status || "open").replace("_", " ")}
        </span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   REQUEST CARD (view-only, no respond on dashboard)
────────────────────────────────────────────────────────── */
function ReqCard({ req, empMap }) {
  const senderEmp = empMap?.[req.fromId] || {};
  const senderDesg = desg(senderEmp);
  const ts = req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000) : new Date();

  const attachments = (() => {
    const raw = req.attachments || req.files || req.media || [];
    if (typeof raw === "string" && raw.startsWith("http")) return [{ url: raw, name: "Attachment" }];
    if (Array.isArray(raw)) return raw.filter(a => a && (typeof a === "object" ? (a.url || a.fileUrl) : typeof a === "string" && a.startsWith("http")));
    return [];
  })();

  const cleanMsg = (req.message || "").trim();
  const hasRealText = cleanMsg && cleanMsg !== '""' && cleanMsg !== "''" && cleanMsg.length > 0;

  return (
    <div style={{ padding: "10px 12px", background: "#FAFAFA", borderRadius: 9, border: "1px solid #F3F4F6", marginBottom: 6, cursor: "pointer" }}
      onClick={() => window.dispatchEvent(new CustomEvent("openRequestPanel", { detail: { tab: "received", requestId: req.requestId || req.id } }))}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: avC(req.fromName || empMap?.[req.fromId]?.name || ""), color: "#fff", fontSize: 8.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {(req.fromName || empMap?.[req.fromId]?.name || "?")[0].toUpperCase()}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{req.fromName || empMap?.[req.fromId]?.name || "Unknown"}</span>
              {senderDesg && <span style={{ fontSize: 9, color: "#9CA3AF", background: "#F3F4F6", padding: "1px 5px", borderRadius: 3 }}>{senderDesg}</span>}
            </div>
            <div style={{ fontSize: 9, color: "#9CA3AF", marginTop: 1 }}>{req.taskTitle || req.taskId}</div>
          </div>
        </div>
        <span style={{ fontSize: 9, color: "#9CA3AF", fontFamily: "monospace", flexShrink: 0 }}>{ts.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      {hasRealText && <p style={{ fontSize: 11, color: "#4B5563", margin: "0 0 6px", fontStyle: "italic", lineHeight: 1.5 }}>"{cleanMsg}"</p>}
      {attachments.map((a, i) => <MediaAttachment key={i} att={typeof a === "string" ? { url: a, name: "Attachment" } : a} />)}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   CARD PRIMITIVES
────────────────────────────────────────────────────────── */
function Card({ children, style = {} }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "16px 17px", boxShadow: "0 1px 2px rgba(0,0,0,0.05), 0 1px 6px rgba(0,0,0,0.03)", ...style }}>
      {children}
    </div>
  );
}
function CardH({ title, sub, iconName, iconColor, badge, badgeBg, badgeC, action, actionLabel }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {iconName && <Ic n={iconName} s={14} c={iconColor || "#6B7280"} />}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{title}</span>
            {badge != null && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: badgeBg || "#F3F4F6", color: badgeC || "#374151" }}>{badge}</span>}
          </div>
          {sub && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1 }}>{sub}</div>}
        </div>
      </div>
      {action && (
        <button onClick={action} style={{ fontSize: 11, fontWeight: 600, color: "#374151", background: "transparent", border: "1px solid #E5E7EB", borderRadius: 6, padding: "4px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit", transition: "all 0.12s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#374151"; e.currentTarget.style.background = "#F9FAFB"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "transparent"; }}>
          {actionLabel} <Ic n="arrow" s={9} c="currentColor" />
        </button>
      )}
    </div>
  );
}
function Empty({ iconName, title, sub }) {
  return (
    <div style={{ textAlign: "center", padding: "16px" }}>
      <Ic n={iconName} s={22} c="#E5E7EB" />
      <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginTop: 7 }}>{title}</div>
      {sub && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   MOBILE DEADLINE ITEM — proper component to avoid hooks-in-map
────────────────────────────────────────────────────────── */
function MobileDLItem({ task, employeeId, empMap, isCEO, onTaskClick, employeeName }) {
  const [expanded, setExpanded] = useState(false);
  const info = dlInfo(task.dueDate);
  const byMe = task.assignedBy === employeeId;
  const dot = dlDot(info);

  let fromLine = "", toLine = "";
  if (isCEO) {
    if (byMe) {
      const names = (task.assigneeIds || []).slice(0, 2).map(id => { const e = empMap?.[id]; return e?.name || id; });
      fromLine = "By you";
      toLine = "To " + (names.join(", ") || "team");
    } else {
      const e = empMap?.[task.assignedBy];
      fromLine = "From " + (task.assignedByName || "Unknown") + (desg(e) ? " · " + desg(e) : "");
      toLine = "To you";
    }
  } else {
    if (byMe) {
      const names = (task.assigneeIds || []).slice(0, 2).map(id => { const e = empMap?.[id]; return e?.name || id; });
      fromLine = "By you";
      toLine = "To " + (names.join(", ") || "team");
    } else {
      const e = empMap?.[task.assignedBy];
      fromLine = "From " + (task.assignedByName || "Unknown") + (desg(e) ? " · " + desg(e) : "");
      toLine = "To you";
    }
  }

  return (
    <div style={{ borderRadius: 9, background: "#fff", border: `1px solid ${expanded ? "#4F46E5" : "#F3F4F6"}`, marginBottom: 6, overflow: "hidden", transition: "border-color 0.15s" }}>
      <div style={{ padding: "9px 10px", cursor: "pointer" }} onClick={() => setExpanded(p => !p)}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0, marginTop: 5 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>
            <div style={{ fontSize: 10, color: "#6B7280", marginTop: 1 }}>{fromLine}</div>
            <div style={{ fontSize: 10, color: "#9CA3AF" }}>{toLine}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
            {info
              ? <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, color: info.c, background: info.bg }}>{info.text}</span>
              : <span style={{ fontSize: 9, color: "#D1D5DB" }}>No deadline</span>}
            <Ic n={expanded ? "chevU" : "chevD"} s={9} c="#D1D5DB" />
          </div>
        </div>
      </div>
      {expanded && (
        <TaskSidePanel
          task={task}
          onTaskClick={t => { onTaskClick(t); }}
          empMap={empMap}
          employeeId={employeeId}
          employeeName={employeeName}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN DASHBOARD
══════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
  const router = useRouter();
  const { meets } = useMeetings(employeeId);
  const { groups } = useGroups(employeeId);
  const { notifications, unread, markRead } = useCoworkNotifications(employeeId || "");

  const [tasks, setTasks] = useState([]);
  const [tLoad, setTLoad] = useState(true);
  const [time, setTime] = useState(new Date());
  const [pendReqs, setPendReqs] = useState([]);
  const [sideOpen, setSideOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [empMap, setEmpMap] = useState({});
  const [deadlineTask, setDeadlineTask] = useState(null); // task being edited
  const [deleteTarget, setDeleteTarget] = useState(null); // task being deleted
  const [deleteBusy, setDeleteBusy] = useState(false);
  const prevN = useRef(0);
  const isCEO = role === "ceo";

  /* Load employee map */
  useEffect(() => {
    if (!employeeId) return;
    getDocs(collection(firebaseDb, "cowork_employees")).then(snap => {
      const m = {};
      snap.forEach(d => { const e = d.data(); m[d.id] = { name: e.name, department: e.department, role: e.role }; });
      setEmpMap(m);
    }).catch(() => { });
  }, [employeeId]);

  useEffect(() => { reqPush(); }, []);
  useEffect(() => {
    if (notifications.length > prevN.current && prevN.current > 0) {
      const n = notifications[0]; if (n) firePush(n.title, n.body);
    }
    prevN.current = notifications.length;
  }, [notifications]);
  useEffect(() => {
    const fn = () => { setIsMobile(window.innerWidth < 640); setIsTablet(window.innerWidth >= 640 && window.innerWidth < 1024); };
    fn(); window.addEventListener("resize", fn); return () => window.removeEventListener("resize", fn);
  }, []);
  useEffect(() => {
    if (!employeeId) return;
    const q = query(collection(firebaseDb, "cowork_requests"), where("toId", "==", employeeId), where("status", "==", "pending"));
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ ...d.data(), requestId: d.id })).sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      if (docs.length > pendReqs.length && pendReqs.length > 0) firePush("New Request", `${docs[0].fromName}: ${docs[0].message?.slice(0, 60)}`);
      setPendReqs(docs);
    });
    return () => unsub();
  }, [employeeId]);

  const loadTasks = useCallback(async () => {
    if (!employeeId) return;
    setTLoad(true);
    try {
      let all = [];

      // NOTE: No orderBy in Firestore queries — combining where() + orderBy() on different
      // fields requires a composite index. We sort in JS after fetching instead.
      if (role === "ceo") {
        // CEO: ONLY tasks they personally created (assignedBy === CEO).
        // TL-created tasks must NOT appear — same rule as tasks page.
        const snap = await getDocs(query(
          collection(firebaseDb, "cowork_tasks"),
          where("assignedBy", "==", employeeId)
        ));
        snap.forEach(d => {
          const t = d.data();
          if (t.createdByTl === true) return; // drop any TL-created edge cases
          all.push({ ...t, taskId: d.id });
        });
      } else if (role === "tl") {
        // TL: tasks they created + tasks assigned TO them
        const [snapBy, snapTo] = await Promise.all([
          getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assignedBy", "==", employeeId))),
          getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assigneeIds", "array-contains", employeeId))),
        ]);
        const seen = new Set();
        [...snapBy.docs, ...snapTo.docs].forEach(d => {
          if (!seen.has(d.id)) { seen.add(d.id); all.push({ ...d.data(), taskId: d.id }); }
        });
      } else {
        // Employee: ONLY tasks directly assigned to them
        const snap = await getDocs(query(
          collection(firebaseDb, "cowork_tasks"),
          where("assigneeIds", "array-contains", employeeId)
        ));
        snap.forEach(d => all.push({ ...d.data(), taskId: d.id }));
      }
      // Sort by createdAt descending in JS — no composite index needed
      all.sort((a, b) => {
        const ta = a.createdAt?.seconds ?? (a.createdAt ? new Date(a.createdAt).getTime() / 1000 : 0);
        const tb = b.createdAt?.seconds ?? (b.createdAt ? new Date(b.createdAt).getTime() / 1000 : 0);
        return tb - ta;
      });

      setTasks(all);
    } catch (e) { console.error(e); } finally { setTLoad(false); }
  }, [employeeId, role]);

  useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading, router]);
  useEffect(() => { if (user && employeeId) loadTasks(); }, [user, employeeId, loadTasks]);
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { if (employeeId) getCoworkSocket(employeeId); }, [employeeId]);

  if (loading || !user) return null;

  /* ── Computed values ── */
  const total = tasks.length;
  const done = tasks.filter(t => t.status === "done").length;
  const inprog = tasks.filter(t => t.status === "in_progress").length;
  const openT = tasks.filter(t => t.status === "open").length;
  const review = tasks.filter(t => ["submitted", "tl_approved"].includes(t.completionStatus)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  /* ALL tasks directly assigned to or by me — no depth restriction */
  const myTasks = tasks.filter(t => {
    if (t.status === "done") return false;
    return t.assignedBy === employeeId || (t.assigneeIds || []).includes(employeeId);
  });

  /* Tracker tasks sorted by deadline */
  const trackerTasks = [...myTasks].sort((a, b) => {
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
    return 0;
  });

  /* Urgent = overdue or critical */
  const urgent = trackerTasks.filter(t => ["overdue", "critical", "near"].includes(dlInfo(t.dueDate)?.s)).length;

  const now = new Date();

  // Use same status logic as schedule-meet page — always respect DB status first
  const getMeetStatus = (m) => {
    if (m.status === "ended") return "ended";          // DB says ended → always ended
    if (m.status === "cancelled") return "ended";
    const start = new Date(m.dateTime).getTime();
    const nowMs = Date.now();
    if (nowMs >= start && nowMs <= start + 2 * 3600000) return "live";
    if (nowMs > start + 2 * 3600000) return "ended";   // past 2h window → ended
    return "upcoming";
  };

  const liveMeets = meets.filter(m => getMeetStatus(m) === "live")
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

  const upMeets = meets.filter(m => getMeetStatus(m) === "upcoming")
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

  const pastMts = meets.filter(m => getMeetStatus(m) === "ended")
    .sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));

  const featMeet = upMeets[0] || pastMts[0];
  const todayM = meets.filter(m => new Date(m.dateTime).toDateString() === now.toDateString() && getMeetStatus(m) !== "ended").length;
  const nextMeet = upMeets[0] || null;

  const greeting = (() => { const h = time.getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; })();

  const goTask = t => {
    localStorage.setItem("selectedTaskId", t.taskId);
    router.push("/coworking/tasks");
  };

  const barData = Array.from({ length: 12 }, (_, i) => ({
    v: tasks.filter(t => {
      if (!t.createdAt) return false;
      const d = t.createdAt?.seconds ? new Date(t.createdAt.seconds * 1000) : new Date(t.createdAt);
      return d.getMonth() === i;
    }).length,
  }));

  const SBADGE = {
    open: { l: "OPEN", c: "#374151", bg: "#F3F4F6" },
    confirmed: { l: "CONFIRMED", c: "#1D4ED8", bg: "#EFF6FF" },
    in_progress: { l: "IN PROGRESS", c: "#B45309", bg: "#FFFBEB" },
    done: { l: "DONE", c: "#16A34A", bg: "#F0FDF4" },
    submitted: { l: "SUBMITTED", c: "#4C1D95", bg: "#F5F3FF" },
    tl_approved: { l: "TL APPROVED", c: "#1D4ED8", bg: "#EFF6FF" },
  };
  const PCOL = {
    high: { c: "#991B1B", bg: "#FEF2F2" },
    medium: { c: "#92400E", bg: "#FFFBEB" },
    low: { c: "#166534", bg: "#F0FDF4" },
  };

  const sW = sideOpen && !isMobile && !isTablet ? 292 : 0;

  /* ════════════════════════════════════
     MOBILE LAYOUT
  ════════════════════════════════════ */
  if (isMobile) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          @keyframes spin { to { transform: rotate(360deg); } }
          body { font-family: 'Inter', -apple-system, sans-serif; background: #F3F4F6; }
        `}</style>
        <div style={{ background: "#F3F4F6", minHeight: "100vh", fontFamily: "'Inter',-apple-system,sans-serif", padding: "14px 13px 32px" }}>

          {/* Greeting */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>{greeting}, {employeeName?.split(" ")[0]}!</div>
            <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{time.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8 }}>
              <div style={{ flex: 1, height: 3, background: "#E5E7EB", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "#4F46E5", borderRadius: 99, transition: "width 1s ease" }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#4F46E5", fontFamily: "monospace" }}>{pct}%</span>
            </div>
          </div>


          {/* Quick actions */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
            {[
              { label: "Tasks", icon: "task", path: "/coworking/tasks" },
              { label: "Messages", icon: "chat", path: "/coworking/direct-messages" },
              { label: "Meets", icon: "video", path: "/coworking/schedule-meet" },
              { label: "Groups", icon: "users", path: "/coworking/create-group" },
            ].map(q => (
              <button key={q.label} onClick={() => router.push(q.path)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "10px 4px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 9, cursor: "pointer", fontFamily: "inherit" }}>
                <Ic n={q.icon} s={16} c="#374151" />
                <span style={{ fontSize: 9.5, fontWeight: 600, color: "#374151" }}>{q.label}</span>
              </button>
            ))}
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, marginBottom: 12 }}>
            {[
              { label: "Total", val: total, sub: `${done} done`, c: "#111827" },
              { label: "In Prog", val: inprog, sub: `${openT} open`, c: "#B45309" },
              { label: "Urgent", val: urgent, sub: "deadlines", c: "#DC2626" },
              { label: "Meetings", val: upMeets.length, sub: todayM > 0 ? `${todayM} today` : "upcoming", c: "#111827" },
              { label: "Requests", val: pendReqs.length, sub: "pending", c: "#111827" },
              { label: "Review", val: review, sub: "awaiting", c: "#4C1D95" },
            ].map(s => (
              <div key={s.label} style={{ background: "#fff", borderRadius: 9, padding: "9px 10px", border: "1px solid #F3F4F6" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.c, lineHeight: 1, letterSpacing: "-0.04em" }}>{s.val}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#374151", marginTop: 2 }}>{s.label}</div>
                <div style={{ fontSize: 9, color: "#9CA3AF", marginTop: 1 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Task & Reminders */}
          <Card style={{ marginBottom: 10 }}>
            <CardH title="Task & Reminders" iconName="alert" iconColor="#4F46E5"
              sub={`${trackerTasks.filter(t => t.dueDate && new Date(t.dueDate) - Date.now() < 604800000).length} deadlines this week`}
              badge={urgent > 0 ? urgent : null} badgeBg="#FEF2F2" badgeC="#DC2626"
              action={() => setSideOpen(true)} actionLabel="Tracker" />
            {tLoad ? <div style={{ textAlign: "center", padding: 14 }}><GwSpinner /></div>
              : myTasks.length === 0 ? <Empty iconName="checkC" title="No tasks" sub="Nothing assigned yet" />
                : myTasks.slice(0, 4).map(t => <ReminderItem key={t.taskId} task={t} onClick={goTask} isCEO={isCEO} empMap={empMap} employeeId={employeeId} />)}
          </Card>

          {/* Pending Requests */}
          {pendReqs.length > 0 && (
            <Card style={{ marginBottom: 10 }}>
              <CardH title="Pending Requests" iconName="inbox" iconColor="#16A34A"
                badge={pendReqs.length} badgeBg="#F0FDF4" badgeC="#16A34A"
                action={() => router.push("/coworking/tasks")} actionLabel="All" />
              {pendReqs.slice(0, 3).map(r => <ReqCard key={r.requestId} req={r} empMap={empMap} />)}
            </Card>
          )}

          {/* Notifications */}
          {unread > 0 && (
            <Card style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Ic n="bell" s={13} c="#6B7280" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Notifications</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: "#EFF6FF", color: "#2563EB", flexShrink: 0 }}>{unread}</span>
                </div>
                <button onClick={markRead} style={{ fontSize: 10, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
              </div>
              {notifications.slice(0, 3).map((n, i) => (
                <div key={n.id || i} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: i < 2 ? "1px solid #F9FAFB" : "none" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: n.read ? "#E5E7EB" : "#4F46E5", flexShrink: 0, marginTop: 4 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</div>
                    {n.body && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</div>}
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Upcoming Meeting */}
          <Card style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Ic n="cal" s={13} c="#6B7280" />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Upcoming Events</span>
                {/* count circles */}
                <div style={{ display: "flex", marginLeft: 4 }}>
                  {[...Array(Math.min(3, upMeets.length + liveMeets.length))].map((_, i) => (
                    <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #fff", marginLeft: i > 0 ? -4 : 0, background: AVC[i % AVC.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 6, fontWeight: 700, color: "#fff" }}>
                      {i + 1}
                    </div>
                  ))}
                  {(upMeets.length + liveMeets.length) > 3 && (
                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #fff", marginLeft: -4, background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 6, fontWeight: 700, color: "#374151" }}>
                      +{(upMeets.length + liveMeets.length) - 3}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => router.push("/coworking/schedule-meet")} style={{ fontSize: 10, fontWeight: 600, color: "#374151", background: "none", border: "1px solid #E5E7EB", borderRadius: 5, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit" }}>+ New</button>
            </div>

            {/* Scrollable list — all live then all upcoming, no ended */}
            <div style={{ maxHeight: 240, overflowY: "auto", marginRight: -4, paddingRight: 4 }}>
              {[...liveMeets, ...upMeets].length === 0
                ? <Empty iconName="cal" title="No upcoming meetings" sub="All clear!" />
                : [...liveMeets, ...upMeets].map(m => {
                  const dt = new Date(m.dateTime);
                  const isLive = liveMeets.some(l => l.meetId === m.meetId);
                  const today = dt.toDateString() === now.toDateString();
                  return (
                    <div key={m.meetId} onClick={() => router.push(`/coworking/cowork-meeting/${m.meetId}`)}
                      style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 6px", borderBottom: "1px solid #F9FAFB", cursor: "pointer", borderRadius: 7, transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      {/* Date block */}
                      <div style={{ textAlign: "center", width: 32, flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: isLive ? "#DC2626" : "#111827", lineHeight: 1 }}>{dt.getDate()}</div>
                        <div style={{ fontSize: 8, color: "#9CA3AF", textTransform: "uppercase" }}>{dt.toLocaleDateString("en-IN", { month: "short" })}</div>
                      </div>
                      {/* Title + time */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{m.title}</div>
                        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                          {dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          {isLive && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#FEF2F2", color: "#DC2626" }}>● LIVE</span>}
                          {today && !isLive && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#F0FDF4", color: "#16A34A" }}>Today</span>}
                        </div>
                      </div>
                      {/* Join button */}
                      <button onClick={e => { e.stopPropagation(); router.push(`/coworking/cowork-meeting/${m.meetId}`); }}
                        style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: isLive ? "#FEF2F2" : "#F0F9FF", color: isLive ? "#DC2626" : "#1D4ED8", border: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {isLive ? "Join" : "Open"}
                      </button>
                    </div>
                  );
                })
              }
            </div>
          </Card>

          {/* Active tasks */}
          <Card style={{ marginBottom: 10 }}>
            <CardH title="Active Tasks" iconName="task" sub={`${myTasks.length} tasks`} action={() => router.push("/coworking/tasks")} actionLabel="All" />
            {tLoad ? <div style={{ textAlign: "center", padding: 14 }}><GwSpinner /></div>
              : myTasks.length === 0 ? <Empty iconName="checkC" title="All caught up!" />
                : myTasks.slice(0, 5).map(t => {
                  const info = dlInfo(t.dueDate); const sb = SBADGE[t.status] || SBADGE.open;
                  const emp = empMap[t.assignedBy]; const d = desg(emp);
                  return (
                    <div key={t.taskId} onClick={() => goTask(t)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 6px", borderRadius: 7, cursor: "pointer", marginBottom: 1, transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: avC(t.taskId), color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {(t.title || "T").slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                        {t.assignedByName && <div style={{ fontSize: 9.5, color: "#9CA3AF", marginTop: 1 }}>{t.assignedByName}{d ? " · " + d : ""}</div>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                        {info && <span style={{ fontSize: 8.5, fontWeight: 700, padding: "2px 6px", borderRadius: 3, color: info.c, background: info.bg }}>{info.text}</span>}
                        <span style={{ fontSize: 8.5, fontWeight: 600, padding: "2px 6px", borderRadius: 3, color: sb.c, background: sb.bg, textTransform: "uppercase" }}>{sb.l}</span>
                      </div>
                    </div>
                  );
                })
            }
          </Card>

          {/* Task Overview (at bottom on mobile) */}
          <Card style={{ marginBottom: 10 }}>
            <CardH title="Task Overview" iconName="layers" sub={`${now.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              {[
                { label: "Total", val: total, badge: `${pct}%`, up: pct >= 50, sub: "completion" },
                { label: "Done", val: done, badge: openT, up: false, sub: "still open" },
              ].map((s, i) => (
                <div key={s.label} style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: 9.5, color: "#6B7280" }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#111827", lineHeight: 1.1, marginTop: 3, letterSpacing: "-0.04em" }}>{s.val}</div>
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 8.5, fontWeight: 700, padding: "1px 5px", borderRadius: 99, background: s.up ? "#F0FDF4" : "#FEF2F2", color: s.up ? "#16A34A" : "#DC2626" }}>{s.up ? "↑" : "↓"} {s.badge}</span>
                    <span style={{ fontSize: 8.5, color: "#9CA3AF" }}>{s.sub}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, height: 4, background: "#E5E7EB", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "#4F46E5", borderRadius: 99, transition: "width 1s ease" }} />
            </div>
          </Card>

        </div>

        {/* Mobile deadline sheet */}
        {sideOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.4)" }} onClick={() => setSideOpen(false)}>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#F9FAFB", borderRadius: "16px 16px 0 0", maxHeight: "84vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: "13px 14px 10px", background: "#fff", borderRadius: "16px 16px 0 0", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Ic n="alert" s={13} c="#4F46E5" />
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                    Deadline Tracker
                    <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 400, marginLeft: 6 }}>· {trackerTasks.length} tasks</span>
                  </div>
                </div>
                <button onClick={() => setSideOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
                  <Ic n="x" s={15} c="#9CA3AF" />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
                {trackerTasks.length === 0
                  ? <Empty iconName="checkC" title="All on track" sub="No tasks" />
                  : trackerTasks.map(t => (
                    <MobileDLItem
                      key={t.taskId}
                      task={t}
                      employeeId={employeeId}
                      empMap={empMap}
                      isCEO={isCEO}
                      onTaskClick={t => { goTask(t); setSideOpen(false); }}
                      employeeName={employeeName}
                    />
                  ))
                }
              </div>
            </div>
          </div>
        )}
        {urgent > 0 && !sideOpen && (
          <button onClick={() => setSideOpen(true)} style={{ position: "fixed", bottom: 18, right: 16, width: 42, height: 42, borderRadius: "50%", background: "#4F46E5", border: "none", boxShadow: "0 4px 14px rgba(79,70,229,0.35)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150 }}>
            <Ic n="alert" s={18} c="#fff" />
            <span style={{ position: "absolute", top: -2, right: -2, minWidth: 14, height: 14, borderRadius: 99, background: "#DC2626", color: "#fff", fontSize: 7, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 2px", border: "2px solid #fff" }}>{urgent}</span>
          </button>
        )}
      </>
    );
  }

  /* ════════════════════════════════════
     DESKTOP / TABLET LAYOUT
  ════════════════════════════════════ */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 99px; }
        .dsk { font-family: 'Inter', -apple-system, sans-serif; background: #F3F4F6; min-height: 100vh; transition: padding-right 0.25s cubic-bezier(0.4,0,0.2,1); }
        .dsk-inner { max-width: 1300px; margin: 0 auto; padding: 20px 22px 40px; }
        /* Stats */
        .st-strip { display: grid; grid-template-columns: repeat(5,1fr); gap: 9px; margin-bottom: 16px; }
        .st-card { background: #fff; border-radius: 10px; padding: 12px 13px 12px 16px; border: 1px solid #F3F4F6; display: flex; align-items: center; gap: 10px; transition: all 0.13s; position: relative; overflow: hidden; }
        .st-card:hover { box-shadow: 0 3px 12px rgba(0,0,0,0.09); transform: translateY(-1px); }
        /* Grids */
        .top-grid { display: grid; grid-template-columns: 1fr 340px; gap: 14px; margin-bottom: 14px; }
        .mid-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; align-items: start; }
        .bot-grid  { display: grid; grid-template-columns: 1fr 380px; gap: 14px; margin-bottom: 14px; }
        /* Table */
        .db-tbl { width: 100%; border-collapse: collapse; }
        .db-tbl td { padding: 10px 9px; font-size: 11px; color: #374151; border-bottom: 1px solid #F9FAFB; vertical-align: middle; }
        .db-tbl tr:last-child td { border-bottom: none; }
        .db-tbl tbody tr:hover td { background: #FAFAFA; cursor: pointer; }
        @media(max-width:1100px){ .st-strip{grid-template-columns:repeat(3,1fr);} .top-grid{grid-template-columns:1fr;} .bot-grid{grid-template-columns:1fr;} }
        @media(max-width:900px){ .dsk{padding-right:0!important;} .mid-grid{grid-template-columns:1fr;} .st-strip{grid-template-columns:repeat(2,1fr);} }
      `}</style>

      <div className="dsk" style={{ paddingRight: sW }}>
        <div className="dsk-inner">

          {/* Greeting */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em", lineHeight: 1.3 }}>{greeting}, {employeeName?.split(" ")[0]}!</h1>
              <p style={{ fontSize: 10.5, color: "#9CA3AF", marginTop: 3, display: "flex", alignItems: "center", gap: 8 }}>
                {time.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 44, height: 3, background: "#E5E7EB", borderRadius: 99, display: "inline-block", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${pct}%`, background: "#4F46E5", borderRadius: 99, transition: "width 1s ease" }} />
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: "#4F46E5", fontFamily: "monospace" }}>{pct}%</span>
                </span>
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              {[
                { label: "Tasks", icon: "task", path: "/coworking/tasks" },
                { label: "Messages", icon: "chat", path: "/coworking/direct-messages" },
                { label: "Meetings", icon: "cal", path: "/coworking/schedule-meet" },
                ...(isCEO ? [{ label: "Employees", icon: "emp", path: "/coworking/create-employee" }] : []),
              ].map(q => (
                <button key={q.label} onClick={() => router.push(q.path)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 99, fontSize: 11.5, fontWeight: 500, color: "#374151", cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#374151"; e.currentTarget.style.background = "#F9FAFB"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#fff"; }}>
                  <Ic n={q.icon} s={11} c="#374151" /> {q.label}
                </button>
              ))}
              <button onClick={() => setSideOpen(p => !p)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", background: urgent > 0 ? "#FEF2F2" : "#fff", border: `1px solid ${urgent > 0 ? "#FECACA" : "#E5E7EB"}`, borderRadius: 99, fontSize: 11.5, fontWeight: 600, color: urgent > 0 ? "#DC2626" : "#374151", cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}>
                <Ic n="alert" s={11} c={urgent > 0 ? "#DC2626" : "#9CA3AF"} />
                Deadlines {urgent > 0 && <span style={{ fontSize: 8.5, fontWeight: 700, background: "#DC2626", color: "#fff", borderRadius: 99, padding: "1px 5px", marginLeft: 1 }}>{urgent}</span>}
              </button>
            </div>
          </div>


          {/* Stats strip */}
          <div className="st-strip">
            {[
              { icon: "task", label: "Total Tasks", val: total, sub: `${done} completed`, c: "#4F46E5", accent: "#4F46E5", trend: `${pct}%`, tUp: pct >= 50 },
              { icon: "clock", label: "In Progress", val: inprog, sub: `${openT} open`, c: "#D97706", accent: "#F59E0B" },
              { icon: "inbox", label: "In Review", val: review, sub: "awaiting", c: "#7C3AED", accent: "#8B5CF6" },
              { icon: "video", label: "Meetings", val: upMeets.length, sub: todayM > 0 ? `${todayM} today` : "upcoming", c: "#0891B2", accent: "#06B6D4" },
              { icon: "users", label: "Groups", val: groups.length, sub: "active", c: "#16A34A", accent: "#22C55E" },
            ].map(s => (
              <div key={s.label} className="st-card">
                <Ic n={s.icon} s={18} c={s.accent} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.c, lineHeight: 1, letterSpacing: "-0.04em" }}>{s.val}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: "#374151", marginTop: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 9.5, color: "#9CA3AF", marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                    {s.sub}
                    {s.trend && <span style={{ fontSize: 8.5, fontWeight: 700, padding: "1px 5px", borderRadius: 99, background: s.tUp ? "#F0FDF4" : "#FEF2F2", color: s.tUp ? "#16A34A" : "#DC2626" }}>{s.tUp ? "↑" : "↓"}{s.trend}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Top 2-col: Task Reminders + right panel */}
          <div className="top-grid">
            {/* LEFT: Quick Links + Task Reminders */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Card>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Quick Links</span>
                  <button onClick={() => router.push("/coworking/tasks")} style={{ width: 18, height: 18, borderRadius: "50%", background: "#4F46E5", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Ic n="plus" s={9} c="#fff" />
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {["All Tasks", "Schedule Meeting", "View Groups", "Direct Messages", ...(isCEO ? ["Manage Employees"] : [])].map((label, i) => {
                    const paths = ["/coworking/tasks", "/coworking/schedule-meet", "/coworking/create-group", "/coworking/direct-messages", "/coworking/create-employee"];
                    return (
                      <button key={label} onClick={() => router.push(paths[i])} style={{ fontSize: 10.5, fontWeight: 500, color: "#374151", background: "transparent", border: "1px solid #E5E7EB", borderRadius: 99, padding: "4px 11px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "#374151"; e.currentTarget.style.background = "#F9FAFB"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "transparent"; }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Card>
              <Card style={{ flex: 1 }}>
                <CardH title="Task & Reminders" iconName="alert" iconColor="#4F46E5"
                  sub={`${trackerTasks.filter(t => t.dueDate && new Date(t.dueDate) - Date.now() < 604800000).length} deadlines this week`}
                  badge={urgent > 0 ? urgent : null} badgeBg="#FEF2F2" badgeC="#DC2626"
                  action={() => setSideOpen(true)} actionLabel="View all" />
                {tLoad ? <div style={{ textAlign: "center", padding: 16 }}><GwSpinner /></div>
                  : myTasks.length === 0 ? <Empty iconName="checkC" title="No tasks" sub="Nothing assigned to you yet" />
                    : <>
                      {myTasks.slice(0, 5).map(t => <ReminderItem key={t.taskId} task={t} onClick={goTask} isCEO={isCEO} empMap={empMap} employeeId={employeeId} />)}
                      {myTasks.length > 5 && (
                        <button onClick={() => setSideOpen(true)} style={{ width: "100%", marginTop: 7, padding: "7px 0", background: "#F9FAFB", border: "1px solid #F3F4F6", borderRadius: 7, fontSize: 10.5, fontWeight: 600, color: "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "inherit" }}
                          onMouseEnter={e => { e.currentTarget.style.background = "#EFF6FF"; e.currentTarget.style.color = "#4F46E5"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.color = "#6B7280"; }}>
                          View {myTasks.length - 5} more <Ic n="chevR" s={9} c="currentColor" />
                        </button>
                      )}
                    </>
                }
              </Card>
            </div>

            {/* RIGHT: Pending Requests + Upcoming Events */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* PENDING REQUESTS — top right position */}
              <Card>
                <CardH title="Pending Requests" iconName="inbox" iconColor="#16A34A"
                  sub={`${now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`}
                  badge={pendReqs.length > 0 ? pendReqs.length : null} badgeBg="#DCFCE7" badgeC="#16A34A"
                  action={() => window.dispatchEvent(new CustomEvent("openRequestPanel", { detail: { tab: "received" } }))} actionLabel="Respond" />
                {pendReqs.length === 0
                  ? <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <Donut segs={[{ v: done, c: "#4F46E5" }, { v: inprog, c: "#F59E0B" }, { v: openT, c: "#E5E7EB" }]} total={total} sz={90} />
                    <div>
                      {[{ l: "Done", c: "#4F46E5", v: done }, { l: "In Progress", c: "#F59E0B", v: inprog }, { l: "Open", c: "#9CA3AF", v: openT }].map(s => (
                        <div key={s.l} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.c, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: "#6B7280", flex: 1 }}>{s.l}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{s.v}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: 6, fontSize: 9.5, color: "#9CA3AF" }}>No pending requests</div>
                    </div>
                  </div>
                  : <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {pendReqs.slice(0, 4).map(r => <ReqCard key={r.requestId} req={r} empMap={empMap} />)}
                    {pendReqs.length > 4 && (
                      <button onClick={() => window.dispatchEvent(new CustomEvent("openRequestPanel", { detail: { tab: "received" } }))} style={{ width: "100%", marginTop: 5, fontSize: 10, color: "#6B7280", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "4px 0" }}>
                        +{pendReqs.length - 4} more — view all requests
                      </button>
                    )}
                  </div>
                }
              </Card>

              {/* Upcoming Events */}
              <Card style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <Ic n="cal" s={13} c="#6B7280" />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Upcoming Events</div>
                        {/* count circles */}
                        <div style={{ display: "flex" }}>
                          {[...Array(Math.min(3, upMeets.length + liveMeets.length))].map((_, i) => (
                            <div key={i} style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid #fff", marginLeft: i > 0 ? -4 : 0, background: AVC[i % AVC.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 5.5, fontWeight: 700, color: "#fff" }}>
                              {i + 1}
                            </div>
                          ))}
                          {(upMeets.length + liveMeets.length) > 3 && (
                            <div style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid #fff", marginLeft: -4, background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 5.5, fontWeight: 700, color: "#374151" }}>
                              +{(upMeets.length + liveMeets.length) - 3}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 9.5, color: "#9CA3AF", marginTop: 1 }}>{time.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div>
                    </div>
                  </div>
                  <button onClick={() => router.push("/coworking/schedule-meet")} style={{ fontSize: 10, fontWeight: 600, color: "#374151", background: "none", border: "1px solid #E5E7EB", borderRadius: 5, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "#374151"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "#E5E7EB"}>+ New</button>
                </div>

                {/* All live + upcoming, scrollable, no ended */}
                {[...liveMeets, ...upMeets].length === 0
                  ? <Empty iconName="cal" title="No meetings" sub="All clear for now" />
                  : <div style={{ maxHeight: 220, overflowY: "auto" }}>
                    {[...liveMeets, ...upMeets].map((m, idx) => {
                      const dt = new Date(m.dateTime);
                      const isLive = liveMeets.some(l => l.meetId === m.meetId);
                      const today = dt.toDateString() === now.toDateString();
                      return (
                        <div key={m.meetId} onClick={() => router.push(`/coworking/cowork-meeting/${m.meetId}`)}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px", borderBottom: idx < [...liveMeets, ...upMeets].length - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer" }}>
                          {/* Date block */}
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: isLive ? "#FEF2F2" : "#F3F4F6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: isLive ? "#DC2626" : "#374151", lineHeight: 1 }}>{dt.getDate()}</div>
                            <div style={{ fontSize: 6.5, color: "#9CA3AF", textTransform: "uppercase" }}>{dt.toLocaleDateString("en-IN", { month: "short" })}</div>
                          </div>
                          {/* Title + time */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
                            <div style={{ fontSize: 9.5, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 4, marginTop: 1, flexWrap: "wrap" }}>
                              {dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              {isLive && <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "#FEF2F2", color: "#DC2626" }}>● LIVE</span>}
                              {today && !isLive && <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "#F0FDF4", color: "#16A34A" }}>Today</span>}
                            </div>
                          </div>
                          {/* Open button */}
                          <button onClick={e => { e.stopPropagation(); router.push(`/coworking/cowork-meeting/${m.meetId}`); }}
                            style={{ fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: isLive ? "#FEF2F2" : "#F0F9FF", color: isLive ? "#DC2626" : "#1D4ED8", border: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
                            {isLive ? "Join" : "Open"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                }
              </Card>
            </div>
          </div>

          {/* Mid 2-col: Task Overview + Bar chart */}
          <div className="mid-grid">
            {/* TASK OVERVIEW — moved down from top-right */}
            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Task Overview</div>
                  <div style={{ fontSize: 9.5, color: "#9CA3AF", marginTop: 1 }}>
                    {new Date(new Date().setDate(1)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} — {now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </div>
                </div>
                <Ic n="layers" s={13} c="#D1D5DB" />
              </div>
              <div style={{ height: 1, background: "#F3F4F6", margin: "0 -17px 10px" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                {[
                  { label: "Total Tasks", val: total, badge: `${pct}%`, up: pct >= 50, sub: "completion" },
                  { label: "Completed", val: done, badge: openT, up: false, sub: "still open" },
                ].map((s, i) => (
                  <div key={s.label} style={{ padding: "8px 11px" }}>
                    <div style={{ fontSize: 9.5, color: "#6B7280" }}>{s.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#111827", lineHeight: 1.1, marginTop: 3, letterSpacing: "-0.04em" }}>{s.val}</div>
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 8.5, fontWeight: 700, padding: "1px 5px", borderRadius: 99, background: s.up ? "#F0FDF4" : "#FEF2F2", color: s.up ? "#16A34A" : "#DC2626" }}>{s.up ? "↑" : "↓"} {s.badge}</span>
                      <span style={{ fontSize: 8.5, color: "#9CA3AF" }}>{s.sub}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ margin: "10px 0 0", padding: "8px 11px", background: "#F9FAFB", borderRadius: 7 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 600, color: "#6B7280" }}>Progress</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#4F46E5", fontFamily: "monospace" }}>{pct}%</span>
                </div>
                <div style={{ height: 4, background: "#E5E7EB", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "#4F46E5", borderRadius: 99, transition: "width 1s ease" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                  {[{ l: "Open", c: "#F59E0B", v: openT }, { l: "In Prog", c: "#4F46E5", v: inprog }, { l: "Done", c: "#16A34A", v: done }].map(s => (
                    <div key={s.l} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: s.c }} />
                      <span style={{ fontSize: 8.5, color: "#9CA3AF" }}>{s.l} <b style={{ color: "#374151" }}>{s.v}</b></span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* BAR CHART */}
            <Card>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Ic n="bar" s={12} c="#9CA3AF" />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Task Activity</div>
                    <div style={{ fontSize: 9.5, color: "#9CA3AF", marginTop: 1 }}>Created this year · {total} total</div>
                  </div>
                </div>
                <div style={{ background: "#1E293B", color: "#fff", borderRadius: 6, padding: "5px 9px" }}>
                  <div style={{ fontSize: 9.5, fontWeight: 600, marginBottom: 3 }}>{time.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</div>
                  <div style={{ display: "flex", gap: 9 }}>
                    {[{ c: "#94A3B8", l: `${inprog} in prog` }, { c: "#64748B", l: `${done} done` }].map(s => (
                      <div key={s.l} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.c }} />
                        <span style={{ fontSize: 8.5, color: "#94A3B8" }}>{s.l}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <BarChart data={barData} />
            </Card>
          </div>

          {/* Active Tasks Table */}
          <Card style={{ padding: "16px 0 6px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 17px 12px", flexWrap: "wrap", gap: 7 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Active Tasks</div>
                <div style={{ fontSize: 9.5, color: "#9CA3AF", marginTop: 1 }}>{myTasks.length} tasks directly assigned</div>
              </div>
              <button onClick={() => router.push("/coworking/tasks")} style={{ fontSize: 10.5, fontWeight: 600, color: "#374151", background: "transparent", border: "1px solid #E5E7EB", borderRadius: 6, padding: "5px 11px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4, transition: "all 0.12s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#374151"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; }}>
                View all <Ic n="arrow" s={9} c="currentColor" />
              </button>
            </div>
            {tLoad ? <div style={{ textAlign: "center", padding: "20px 0" }}><GwSpinner /></div>
              : myTasks.length === 0
                ? <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>All caught up!</div>
                </div>
                : <div style={{ overflowX: "auto" }}>
                  <table className="db-tbl" style={{ minWidth: 600 }}>
                    <tbody>
                      {myTasks.slice(0, 10).map((t, ri) => {
                        const sb = SBADGE[t.status] || SBADGE.open;
                        const pri = PCOL[t.priority] || PCOL.medium;
                        const dI = dlInfo(t.dueDate);
                        const emp = empMap[t.assignedBy]; const d = desg(emp);
                        const aEmp = (t.assigneeIds || []).slice(0, 1).map(id => {
                          const e = empMap[id]; return e ? (e.name + (e.department ? " · " + e.department : "")) : id;
                        }).join(", ");
                        return (
                          <tr key={t.taskId} onClick={() => goTask(t)} style={{ animation: `fadeUp 0.13s ease ${ri * 0.02}s both` }}>
                            <td style={{ paddingLeft: 17, width: 42 }}>
                              <div style={{ position: "relative" }}>
                                <div style={{ width: 30, height: 30, borderRadius: 7, background: avC(t.taskId), color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  {(t.title || "T").slice(0, 2).toUpperCase()}
                                </div>
                                {dI && <div style={{ position: "absolute", bottom: -1, right: -1, width: 7, height: 7, borderRadius: "50%", background: dlDot(dI), border: "2px solid #fff" }} />}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontSize: 11.5, fontWeight: 700, color: "#111827" }}>{t.title}</div>
                              <div style={{ fontSize: 9.5, color: "#9CA3AF", marginTop: 1 }}>
                                {t.assignedByName ? (t.assignedByName + (d ? " · " + d : "")) : `#${t.taskId}`}
                              </div>
                            </td>
                            <td><span style={{ fontSize: 9, color: "#9CA3AF", fontFamily: "monospace", background: "#F9FAFB", padding: "1px 5px", borderRadius: 4, border: "1px solid #F3F4F6" }}>{t.taskId}</span></td>
                            <td style={{ fontSize: 10.5, color: "#6B7280", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{aEmp || "—"}</td>
                            <td>{t.priority && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 4, color: pri.c, background: pri.bg, textTransform: "capitalize" }}>{t.priority}</span>}</td>
                            <td style={{ fontSize: 10, color: "#6B7280", whiteSpace: "nowrap" }}>{t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                            <td>{dI && <span style={{ fontSize: 8.5, fontWeight: 700, padding: "2px 6px", borderRadius: 4, color: dI.c, background: dI.bg, whiteSpace: "nowrap" }}>{dI.text}</span>}</td>
                            <td><span style={{ fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5, color: sb.c, background: sb.bg, letterSpacing: "0.02em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{sb.l}</span></td>
                            <td style={{ paddingRight: 17, width: 56 }}>
                              <div style={{ display: "flex", gap: 5 }}>
                                <button onClick={e => { e.stopPropagation(); setDeadlineTask(t); }} title="Edit Deadline" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 3, borderRadius: 5, transition: "background 0.1s" }}
                                  onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                                  <Ic n="edit" s={12} c="#6B7280" />
                                </button>
                                {isCEO && (
                                  <button onClick={e => { e.stopPropagation(); setDeleteTarget(t); }} title="Delete Task" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 3, borderRadius: 5, transition: "background 0.1s" }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#FEF2F2"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                                    <Ic n="trash" s={12} c="#DC2626" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
            }
          </Card>

        </div>
      </div>

      {/* Edit Deadline Modal */}
      {deadlineTask && (
        <EditDeadlineModal
          task={deadlineTask}
          onClose={() => setDeadlineTask(null)}
          onSuccess={() => { setDeadlineTask(null); loadTasks(); }}
        />
      )}

      {/* Delete Task Confirm */}
      <GwConfirm
        open={!!deleteTarget}
        busy={deleteBusy}
        title="Delete Task?"
        message={`Permanently delete "${deleteTarget?.title} (${deleteTarget?.taskId})"? This cannot be undone.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleteBusy(true);
          try {
            await deleteTask(deleteTarget.taskId);
            setDeleteTarget(null);
            loadTasks();
          } catch (e) { alert(e.message); }
          finally { setDeleteBusy(false); }
        }}
      />

      <DeadlineSidebar tasks={trackerTasks} role={role} employeeId={employeeId} employeeName={employeeName} empMap={empMap} open={sideOpen} onToggle={() => setSideOpen(p => !p)} onTaskClick={goTask} />

      {isTablet && urgent > 0 && (
        <button onClick={() => setSideOpen(p => !p)} style={{ position: "fixed", bottom: 18, right: 16, display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: "#4F46E5", border: "none", borderRadius: 99, boxShadow: "0 4px 14px rgba(79,70,229,0.3)", cursor: "pointer", color: "#fff", fontSize: 11, fontWeight: 700, zIndex: 200 }}>
          <Ic n="alert" s={13} c="#fff" /> Deadlines <span style={{ background: "#DC2626", borderRadius: 99, padding: "1px 5px", fontSize: 8.5 }}>{urgent}</span>
        </button>
      )}
    </>
  );
}