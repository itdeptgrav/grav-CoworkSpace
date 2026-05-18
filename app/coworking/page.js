"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
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
import { useTaskTimer, formatTimeHMS } from "../../hooks/useTaskTimer";

import {
  collection, doc, updateDoc, serverTimestamp, getDoc,
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
   AVATAR COLORS
────────────────────────────────────────────────────────── */
const AVC = ["#3B4252", "#4C51BF", "#0F766E", "#7C2D12", "#6D28D9", "#0E7490", "#9D174D", "#374151"];
const avC = s => AVC[(s || "?").charCodeAt(0) % AVC.length];

/* ──────────────────────────────────────────────────────────
   STATUS BADGE HELPER
────────────────────────────────────────────────────────── */
const SB = {
  open: { l: "Todo", c: "#6B7280", bg: "#F3F4F6" },
  pending_deadline_approval: { l: "Pending", c: "#D97706", bg: "#FEF3C7" },
  pending_employee_deadline_confirmation: { l: "Confirming", c: "#7C3AED", bg: "#F5F3FF" },
  deadline_approved: { l: "Approved", c: "#059669", bg: "#ECFDF5" },
  confirmed: { l: "Confirmed", c: "#5B5EF4", bg: "#EDEDFE" },
  in_progress: { l: "In Progress", c: "#6D28D9", bg: "#F3E8FF" },
  done: { l: "Completed", c: "#16A34A", bg: "#DCFCE7" },
};
function getStatusBadge(s) { return SB[s] || SB.open; }

/* ──────────────────────────────────────────────────────────
   PRIORITY HELPER
────────────────────────────────────────────────────────── */
function getPri(p) {
  if (typeof p === "number" || (typeof p === "string" && !isNaN(Number(p)))) {
    const n = Number(p);
    if (n >= 8) return { l: "High", c: "#DC2626", bg: "#FEF2F2" };
    if (n >= 5) return { l: "Medium", c: "#D97706", bg: "#FFFBEB" };
    return { l: "Low", c: "#16A34A", bg: "#F0FDF4" };
  }
  if (p === "high") return { l: "High", c: "#DC2626", bg: "#FEF2F2" };
  if (p === "low") return { l: "Low", c: "#16A34A", bg: "#F0FDF4" };
  return { l: "Medium", c: "#D97706", bg: "#FFFBEB" };
}

/* ──────────────────────────────────────────────────────────
   ICON SET
────────────────────────────────────────────────────────── */
function Ic({ n, s = 16, c = "currentColor" }) {
  const p = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: c, strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0 } };
  const icons = {
    task: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></>,
    video: <><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></>,
    users: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>,
    chat: <><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></>,
    cal: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    emp: <><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></>,
    alert: <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
    x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    arrow: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
    chevR: <><polyline points="9 18 15 12 9 6" /></>,
    chevD: <><polyline points="6 9 12 15 18 9" /></>,
    chevU: <><polyline points="18 15 12 9 6 15" /></>,
    checkC: <><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
    send: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
    down: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    file: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
    attach: <><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></>,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>,
    pause: <><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>,
    play: <><polygon points="5 3 19 12 5 21 5 3" /></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></>,
    more: <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>,
    list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
    search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>,
    bell: <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></>,
    img: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>,
    home: <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
  };
  return <svg {...p}>{icons[n] || null}</svg>;
}

/* ──────────────────────────────────────────────────────────
   AVATAR COMPONENT
────────────────────────────────────────────────────────── */
function Av({ name = "", size = 32, url }) {
  const colors = ["#6C63FF", "#3B82F6", "#0EA5E9", "#14B8A6", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6"];
  const bg = colors[(name || "").charCodeAt(0) % colors.length];
  const init = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, fontWeight: 700, flexShrink: 0 }}>
      {init}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   TASK SIDE PANEL (latest msg + quick reply)
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
  const sb = getStatusBadge(task.status);
  const pri = getPri(task.priority);
  const info = dlInfo(task.dueDate);
  const subs = task.subtaskIds || [];

  return (
    <div style={{ borderTop: "1px solid #F3F4F6", background: "#FAFAFA" }}>
      <div style={{ padding: "8px 10px 0" }}>
        <button onClick={() => onTaskClick(task)} style={{ width: "100%", padding: "6px 0", border: "1px solid #E5E7EB", borderRadius: 5, background: "#fff", fontSize: 10, fontWeight: 600, color: "#374151", cursor: "pointer", fontFamily: "inherit" }}>
          Open Task →
        </button>
      </div>
      {/* Latest message */}
      {recentMsg && (
        <div style={{ padding: "8px 10px", borderBottom: "1px solid #F3F4F6" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#9CA3AF", marginBottom: 3 }}>Latest message</div>
          <div style={{ display: "flex", gap: 5, alignItems: "flex-start" }}>
            <Av name={recentMsg.senderName} size={18} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#374151" }}>{recentMsg.senderName}</span>
              <div style={{ fontSize: 10, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recentMsg.text}</div>
            </div>
          </div>
        </div>
      )}
      {!recentMsg && (
        <div style={{ padding: "9px 10px", borderBottom: "1px solid #F3F4F6", textAlign: "center" }}>
          <span style={{ fontSize: 10, color: "#9CA3AF" }}>No messages yet</span>
        </div>
      )}
      {/* Reply */}
      <div style={{ padding: "7px 8px" }}>
        {sent ? (
          <div style={{ padding: "6px 8px", background: "#F0FDF4", borderRadius: 5, fontSize: 10.5, color: "#16A34A", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            <Ic n="checkC" s={11} c="#16A34A" /> Sent!
          </div>
        ) : (
          <div style={{ display: "flex", gap: 5 }}>
            <input value={msgText} onChange={e => setMsgText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMsg()} placeholder="Reply..." style={{ flex: 1, padding: "6px 8px", fontSize: 11, border: "1px solid #E5E7EB", borderRadius: 5, outline: "none", fontFamily: "inherit", color: "#111827", background: "#F9FAFB" }} />
            <button onClick={sendMsg} disabled={sending || !msgText.trim()} style={{ width: 28, height: 28, borderRadius: 5, background: msgText.trim() ? "#6C63FF" : "#F3F4F6", border: "none", cursor: msgText.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Ic n="send" s={10} c={msgText.trim() ? "#fff" : "#D1D5DB"} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   MOBILE TASK CARD (with expandable subtask panel)
────────────────────────────────────────────────────────── */
function MobileTaskCard({ task, employeeId, empMap, isCEO, onTaskClick, employeeName }) {
  const [expanded, setExpanded] = useState(false);
  const sb = getStatusBadge(task.status);
  const pri = getPri(task.priority);
  const info = dlInfo(task.dueDate);
  const subs = task.subtaskIds || [];
  const assignerName = empMap?.[task.assignedBy]?.name || task.assignedByName || "";

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", overflow: "hidden", marginBottom: 8 }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "12px 14px", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start" }}>
        {/* Status dot */}
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: sb.c, marginTop: 5, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", lineHeight: 1.3 }}>{task.title}</div>
          {subs.length > 0 && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{subs.length} subtasks</div>}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 4, color: sb.c, background: sb.bg }}>{sb.l}</span>
            <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 4, color: pri.c, background: pri.bg }}>{pri.l}</span>
            {info && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 4, color: info.c, background: info.bg }}>{info.text}</span>}
          </div>
        </div>
        <Ic n={expanded ? "chevU" : "chevD"} s={12} c="#9CA3AF" />
      </div>
      {expanded && (
        <TaskSidePanel task={task} onTaskClick={onTaskClick} empMap={empMap} employeeId={employeeId} employeeName={employeeName} onClose={() => setExpanded(false)} />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   DONUT CHART (SVG)
────────────────────────────────────────────────────────── */
function DonutChart({ data, total }) {
  const size = 120, cx = 60, cy = 60, r = 45, sw = 22;
  let offset = 0;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={sw} />
        {data.map((d, i) => {
          const pct = total > 0 ? d.val / total : 0;
          const dash = pct * circ;
          const gap = circ - dash;
          const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={sw} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: "all 0.5s ease" }} />;
          offset += dash;
          return el;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#111827", lineHeight: 1 }}>{total}</div>
        <div style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 500 }}>Total Tasks</div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   DEADLINE SIDEBAR (desktop)
────────────────────────────────────────────────────────── */
function DeadlineSidebar({ tasks, role, employeeId, employeeName, empMap, open, onToggle, onTaskClick }) {
  const isCEO = role === "ceo";
  const [dirFilter, setDirFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const W = 300;

  const filtered = tasks.filter(t => {
    if (dirFilter === "to_you" && !((t.assigneeIds || []).includes(employeeId))) return false;
    if (dirFilter === "by_you" && t.assignedBy !== employeeId) return false;
    if (t.dueDate) {
      const ms = new Date(t.dueDate).getTime() - Date.now();
      if (dateFilter === "today" && ms > 86400000) return false;
      if (dateFilter === "week" && ms > 604800000) return false;
      if (dateFilter === "month" && ms > 2592000000) return false;
    } else {
      if (dateFilter !== "all") return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
    return 0;
  });

  const sW = open ? `${W}px` : "0px";

  return (
    <>
      {/* Sidebar panel */}
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: W, background: "#fff", borderLeft: "1px solid #E5E7EB", zIndex: 300, transform: open ? "translateX(0)" : `translateX(${W}px)`, transition: "transform 0.25s ease", display: "flex", flexDirection: "column", boxShadow: open ? "-4px 0 20px rgba(0,0,0,0.08)" : "none" }}>
        {/* Header */}
        <div style={{ padding: "16px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Ic n="alert" s={14} c="#6C63FF" />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Deadline Tracker</span>
          </div>
          <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer" }}><Ic n="x" s={16} c="#9CA3AF" /></button>
        </div>
        {/* Filters */}
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 4, flexWrap: "wrap" }}>
          {["all", "today", "week", "month"].map(f => (
            <button key={f} onClick={() => setDateFilter(f)} style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: dateFilter === f ? "#6C63FF" : "#F3F4F6", color: dateFilter === f ? "#fff" : "#6B7280", border: "none", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>{f}</button>
          ))}
        </div>
        {/* Tasks */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: "center", padding: 24, color: "#9CA3AF", fontSize: 12 }}>No tasks found</div>
          ) : sorted.map(t => {
            const info = dlInfo(t.dueDate);
            const sb = getStatusBadge(t.status);
            return (
              <div key={t.taskId} onClick={() => onTaskClick(t)} style={{ padding: "10px 10px", borderRadius: 8, border: "1px solid #F3F4F6", marginBottom: 6, cursor: "pointer", transition: "background 0.12s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"} onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", marginBottom: 4 }}>{t.title}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, color: sb.c, background: sb.bg }}>{sb.l}</span>
                  {info && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, color: info.c, background: info.bg }}>{info.text}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
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
  const [deadlineTask, setDeadlineTask] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const prevN = useRef(0);
  const isCEO = role === "ceo";

  // Dashboard table state
  const [taskTab, setTaskTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [expandedTaskIds, setExpandedTaskIds] = useState(new Set());
  const [viewMode, setViewMode] = useState("list");
  const [mobileMenu, setMobileMenu] = useState(false); // "list" | "grid"
  const [recentChatMessages, setRecentChatMessages] = useState([]);
  const [msgExpanded, setMsgExpanded] = useState(false);
  const [commitModal, setCommitModal] = useState(null); // { taskId, taskTitle }
  const [commitMessage, setCommitMessage] = useState("");
  const [savingCommit, setSavingCommit] = useState(false);

  /* Task Timer — same hook as tasks page */
  const {
    startTask: timerStart,
    pauseTask: timerPause,
    getDisplaySeconds,
    getTimerSession,
    activeTaskId: timerActiveTaskId,
    toast: timerToast,
  } = useTaskTimer(employeeId);

  /* Load employee map */
  useEffect(() => {
    if (!employeeId) return;
    getDocs(collection(firebaseDb, "cowork_employees")).then(snap => {
      const m = {};
      snap.forEach(d => { const e = d.data(); m[d.id] = { name: e.name, department: e.department, role: e.role, profilePicUrl: e.profilePicUrl || "" }; });
      setEmpMap(m);
    }).catch(() => { });
  }, [employeeId]);

  /* ── Recent Messages: aggregate from task chats, DMs, groups ── */
  useEffect(() => {
    if (!employeeId) return;
    const unsubs = [];
    const msgMap = new Map(); // key → msg object
    const flush = () => {
      const all = [...msgMap.values()].sort((a, b) => b.ts - a.ts).slice(0, 8);
      setRecentChatMessages(all);
    };

    // 1) Task chats — listen to tasks that have lastChatAt
    const tq = query(collection(firebaseDb, "cowork_tasks"), where("assigneeIds", "array-contains", employeeId));
    unsubs.push(onSnapshot(tq, snap => {
      snap.docs.forEach(d => {
        const t = d.data();
        if (!t.lastChatAt && !t.lastChatPreview) return;
        const ts = t.lastChatAt?.seconds ? t.lastChatAt.seconds * 1000 : 0;
        if (ts > 0) {
          msgMap.set("task_" + d.id, {
            id: "task_" + d.id, source: "task", sourceLabel: t.title || d.id,
            title: t.lastChatPreview || "New message", senderName: "",
            ts, type: "task_chat", taskId: d.id,
            color: "#4F46E5", bg: "#EDEDFE",
          });
        }
      });
      flush();
    }, () => { }));

    // 2) Also fetch tasks assigned BY this user
    const tq2 = query(collection(firebaseDb, "cowork_tasks"), where("assignedBy", "==", employeeId));
    unsubs.push(onSnapshot(tq2, snap => {
      snap.docs.forEach(d => {
        const t = d.data();
        if (!t.lastChatAt && !t.lastChatPreview) return;
        const ts = t.lastChatAt?.seconds ? t.lastChatAt.seconds * 1000 : 0;
        if (ts > 0) {
          msgMap.set("task_" + d.id, {
            id: "task_" + d.id, source: "task", sourceLabel: t.title || d.id,
            title: t.lastChatPreview || "New message", senderName: "",
            ts, type: "task_chat", taskId: d.id,
            color: "#4F46E5", bg: "#EDEDFE",
          });
        }
      });
      flush();
    }, () => { }));

    // 3) DM conversations — fetch by constructing conversation IDs directly
    //    Conversation ID = [myId, theirId].sort().join("_")
    //    This bypasses query/index/security-rule issues entirely
    const empIds = Object.keys(empMap).filter(id => id !== employeeId);
    Promise.all(empIds.map(async (otherId) => {
      const convId = [employeeId, otherId].sort().join("_");
      try {
        const convSnap = await getDoc(doc(firebaseDb, "cowork_direct_messages", convId));
        if (!convSnap.exists()) return;
        const conv = convSnap.data();
        const lastMsg = conv.lastMessage;
        if (!lastMsg || !lastMsg.text) return;
        // lastMessage uses sentAt (serverTimestamp) in [conversationId]/page.js
        // OR createdAt (ISO string) in direct-messages/page.js — check both
        const ts = lastMsg.sentAt?.seconds ? lastMsg.sentAt.seconds * 1000
          : (lastMsg.createdAt?.seconds ? lastMsg.createdAt.seconds * 1000
            : (typeof lastMsg.createdAt === "string" ? new Date(lastMsg.createdAt).getTime()
              : (typeof lastMsg.sentAt === "string" ? new Date(lastMsg.sentAt).getTime() : 0)));
        if (isNaN(ts) || ts <= 0) return;
        const otherName = empMap?.[otherId]?.name || lastMsg.senderName || "Someone";
        msgMap.set("dm_" + convId, {
          id: "dm_" + convId, source: "dm", sourceLabel: otherName,
          title: lastMsg.text, senderName: lastMsg.senderName || otherName,
          ts, type: "direct_message", conversationId: convId,
          color: "#0EA5E9", bg: "#F0F9FF",
        });
      } catch (_) { }
    })).then(() => flush());

    // 4) Group conversations — user is a member
    const gq = query(collection(firebaseDb, "cowork_groups"), where("memberIds", "array-contains", employeeId));
    unsubs.push(onSnapshot(gq, snap => {
      snap.docs.forEach(d => {
        const grp = d.data();
        const lastMsg = grp.lastMessage;
        if (!lastMsg) return;
        const ts = lastMsg.sentAt?.seconds ? lastMsg.sentAt.seconds * 1000
          : (lastMsg.createdAt?.seconds ? lastMsg.createdAt.seconds * 1000
            : (lastMsg.createdAt ? new Date(lastMsg.createdAt).getTime() : 0));
        if (ts > 0) {
          msgMap.set("grp_" + d.id, {
            id: "grp_" + d.id, source: "group", sourceLabel: grp.name || "Group",
            title: lastMsg.text || "Message", senderName: lastMsg.senderName || "",
            ts, type: "group_message", groupId: d.id,
            color: "#16A34A", bg: "#F0FDF4",
          });
        }
      });
      flush();
    }, () => { }));

    return () => unsubs.forEach(u => u());
  }, [employeeId, empMap]);

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
      const docs = snap.docs.map(d => ({ ...d.data(), requestId: d.id })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPendReqs(docs);
    });
    return () => unsub();
  }, [employeeId]);

  /* clock */
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  /* Load tasks — ORIGINAL role-based Firestore queries */
  const loadTasks = useCallback(async () => {
    if (!employeeId || !role) return;
    setTLoad(true);
    try {
      let all = [];
      if (role === "ceo") {
        const snap = await getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assignedBy", "==", employeeId)));
        snap.forEach(d => { const t = d.data(); if (t.createdByTl === true) return; all.push({ ...t, taskId: d.id }); });
      } else if (role === "tl") {
        const [snapBy, snapTo] = await Promise.all([
          getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assignedBy", "==", employeeId))),
          getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assigneeIds", "array-contains", employeeId))),
        ]);
        const seen = new Set();
        [...snapBy.docs, ...snapTo.docs].forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); all.push({ ...d.data(), taskId: d.id }); } });
        const existingIds = new Set(all.map(t => t.taskId));
        let missingParentIds = [...new Set(all.filter(t => t.parentTaskId && !existingIds.has(t.parentTaskId)).map(t => t.parentTaskId))];
        for (let pass = 0; pass < 2 && missingParentIds.length > 0; pass++) {
          const parentSnaps = await Promise.all(missingParentIds.map(id => getDoc(doc(collection(firebaseDb, "cowork_tasks"), id))));
          const fetched = [];
          parentSnaps.forEach(d => { if (d.exists() && !existingIds.has(d.id)) { existingIds.add(d.id); const t = { ...d.data(), taskId: d.id }; fetched.push(t); all.push(t); } });
          missingParentIds = [...new Set(fetched.filter(t => t.parentTaskId && !existingIds.has(t.parentTaskId)).map(t => t.parentTaskId))];
        }
      } else {
        const snap = await getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assigneeIds", "array-contains", employeeId)));
        snap.forEach(d => all.push({ ...d.data(), taskId: d.id }));
        const existingIds = new Set(all.map(t => t.taskId));
        let missingParentIds = [...new Set(all.filter(t => t.parentTaskId && !existingIds.has(t.parentTaskId)).map(t => t.parentTaskId))];
        for (let pass = 0; pass < 2 && missingParentIds.length > 0; pass++) {
          const parentSnaps = await Promise.all(missingParentIds.map(id => getDoc(doc(collection(firebaseDb, "cowork_tasks"), id))));
          const fetched = [];
          parentSnaps.forEach(d => { if (d.exists() && !existingIds.has(d.id)) { existingIds.add(d.id); const t = { ...d.data(), taskId: d.id }; fetched.push(t); all.push(t); } });
          missingParentIds = [...new Set(fetched.filter(t => t.parentTaskId && !existingIds.has(t.parentTaskId)).map(t => t.parentTaskId))];
        }
      }
      all.sort((a, b) => {
        const ta = a.createdAt?.seconds ?? (a.createdAt ? new Date(a.createdAt).getTime() / 1000 : 0);
        const tb = b.createdAt?.seconds ?? (b.createdAt ? new Date(b.createdAt).getTime() / 1000 : 0);
        return tb - ta;
      });
      setTasks(all);
    } catch (e) { console.error(e); } finally { setTLoad(false); }
  }, [employeeId, role]);

  useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading, router]);
  useEffect(() => { if (user && employeeId && role) loadTasks(); }, [user, employeeId, role, loadTasks]);
  useEffect(() => { if (employeeId) getCoworkSocket(employeeId); }, [employeeId]);

  if (loading || !user) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}><GwSpinner size={36} /></div>;

  /* ── Derived data ── */
  const nonFolderTasks = tasks.filter(t => !t.parentTaskId);
  const total = nonFolderTasks.length;
  const done = nonFolderTasks.filter(t => t.status === "done").length;
  const inprog = nonFolderTasks.filter(t => t.status === "in_progress").length;
  const review = nonFolderTasks.filter(t => ["submitted", "tl_approved"].includes(t.completionStatus)).length;
  const openT = nonFolderTasks.filter(t => t.status === "open").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const myTasks = tasks.filter(t => {
    if (t.status === "done") return false;
    if (t.isFolder === true) return false;
    return t.assignedBy === employeeId || (t.assigneeIds || []).includes(employeeId);
  });

  const trackerTasks = [...myTasks].sort((a, b) => {
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
    return 0;
  });

  const urgent = trackerTasks.filter(t => ["overdue", "critical", "near"].includes(dlInfo(t.dueDate)?.s)).length;

  const now = new Date();

  const getMeetStatus = (m) => {
    if (m.isCancelled === true || m.status === "cancelled") return "cancelled";
    if (m.status === "ended") return "ended";
    const start = new Date(m.dateTime).getTime();
    const nowMs = Date.now();
    if (nowMs >= start && nowMs <= start + 2 * 3600000) return "live";
    if (nowMs > start + 2 * 3600000) return "ended";
    return "upcoming";
  };

  const liveMeets = meets.filter(m => getMeetStatus(m) === "live").sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  const upMeets = meets.filter(m => getMeetStatus(m) === "upcoming").sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

  const todayM = meets.filter(m => {
    const s = getMeetStatus(m);
    return new Date(m.dateTime).toDateString() === now.toDateString() && s !== "ended" && s !== "cancelled";
  }).length;

  const greeting = (() => { const h = time.getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; })();

  const goTask = t => {
    localStorage.setItem("selectedTaskId", t.taskId);
    router.push("/coworking/tasks");
  };

  /* Task action — matches tasks page conditions exactly:
     - Only assignees can control play/pause
     - Task must be in confirmed/in_progress/deadline_approved to be controllable
     - Clicking navigates to tasks page where the full timer system handles it
     - CEO/TL see view-only indicator */
  const canControlTask = (t) => {
    const isAssignee = (t.assigneeIds || []).includes(employeeId);
    const controllableStates = ["confirmed", "in_progress", "deadline_approved"];
    return isAssignee && controllableStates.includes(t.status);
  };

  const getTaskActionInfo = (t) => {
    const isAssignee = (t.assigneeIds || []).includes(employeeId);
    // Check BOTH local activeTaskId AND Firestore session for running state
    const isRunningLocal = timerActiveTaskId === t.taskId;
    const sess = getTimerSession ? getTimerSession(t.taskId) : null;
    const isRunningFirestore = sess?.isActive === true;
    const isRunning = isRunningLocal || isRunningFirestore;
    const hasTime = sess && (sess.totalSeconds > 0 || isRunning);

    if (!isAssignee) {
      if (t.status === "in_progress" || isRunning) return { type: "indicator", icon: "clock", color: "#16A34A", label: "Working" };
      return { type: "none" };
    }
    if (isRunning) return { type: "action", icon: "pause", color: "#F59E0B", label: "Pause", action: "pause" };
    if (["confirmed", "deadline_approved", "in_progress"].includes(t.status)) return { type: "action", icon: "play", color: "#6C63FF", label: hasTime ? "Resume" : "Start", action: "start" };
    if (t.status === "open") return { type: "action", icon: "play", color: "#9CA3AF", label: "Start", action: "start" };
    if (t.status === "pending_deadline_approval") return { type: "indicator", icon: "clock", color: "#D97706", label: "Pending" };
    if (t.status === "done") return { type: "indicator", icon: "checkC", color: "#16A34A", label: "Done" };
    return { type: "action", icon: "play", color: "#6C63FF", label: "Open", action: "open" };
  };

  /* Start/Pause task timer — works directly on dashboard, same as tasks page */
  const handleTaskAction = (t, actionType) => {
    if (actionType === "pause") {
      // Open commit modal (same as tasks page) then pause
      setCommitModal({ taskId: t.taskId, taskTitle: t.title });
      setCommitMessage("");
    } else {
      // Start/Resume timer
      if (timerStart) timerStart(t.taskId, t.title);
    }
  };

  /* Save work commit + pause timer */
  const handleCommitAndPause = async () => {
    if (!commitModal) return;
    setSavingCommit(true);
    try {
      // Pause the timer first
      if (timerPause) timerPause(commitModal.taskId, commitModal.taskTitle);

      // Save daily report/commit if message provided
      if (commitMessage.trim()) {
        const reportRef = collection(firebaseDb, "cowork_tasks", commitModal.taskId, "daily_reports");
        await setDoc(doc(reportRef, crypto.randomUUID()), {
          taskId: commitModal.taskId,
          employeeId,
          employeeName,
          message: commitMessage.trim(),
          type: "work_commit",
          createdAt: serverTimestamp(),
        });
      }
      setCommitModal(null);
      setCommitMessage("");
      // Refresh tasks after a moment
      setTimeout(() => loadTasks(), 500);
    } catch (err) {
      console.error("Commit failed:", err);
    } finally {
      setSavingCommit(false);
    }
  };

  /* Skip commit — just pause without saving a report */
  const handleSkipCommit = () => {
    if (commitModal && timerPause) timerPause(commitModal.taskId, commitModal.taskTitle);
    setCommitModal(null);
    setCommitMessage("");
    setTimeout(() => loadTasks(), 500);
  };

  // Task filtering for the main table
  const assignedToMe = myTasks.filter(t => (t.assigneeIds || []).includes(employeeId));
  const assignedByMe = myTasks.filter(t => t.assignedBy === employeeId);

  let filteredTasks = taskTab === "assigned_to" ? assignedToMe : taskTab === "assigned_by" ? assignedByMe : myTasks;

  if (statusFilter !== "all") filteredTasks = filteredTasks.filter(t => t.status === statusFilter);
  if (priorityFilter !== "all") filteredTasks = filteredTasks.filter(t => {
    const p = getPri(t.priority);
    return p.l.toLowerCase() === priorityFilter;
  });

  // Sort: in_progress first, then by date
  filteredTasks = [...filteredTasks].sort((a, b) => {
    const order = { in_progress: 0, confirmed: 1, open: 2, pending_deadline_approval: 3, done: 4 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  // Paused tasks
  const pausedTasks = myTasks.filter(t => t.status === "confirmed" || t.isPaused);
  // Overdue tasks
  const overdueTasks = myTasks.filter(t => {
    const info = dlInfo(t.dueDate);
    return info?.s === "overdue" && t.status !== "done";
  });

  // Stats for donut
  const donutData = [
    { label: "In Progress", val: inprog, color: "#6C63FF" },
    { label: "Pending", val: review, color: "#F59E0B" },
    { label: "On Hold", val: pausedTasks.length, color: "#3B82F6" },
    { label: "Paused", val: myTasks.filter(t => t.isPaused).length, color: "#94A3B8" },
    { label: "Completed", val: done, color: "#22C55E" },
  ];

  const toggleExpand = (taskId) => {
    setExpandedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  /* ════════════════════════════════════
     MOBILE LAYOUT
  ════════════════════════════════════ */

  if (isMobile) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
          .wf-mob { font-family: 'DM Sans', -apple-system, sans-serif; background: #F8F9FB; min-height: 100vh; }
          .wf-mob-inner { padding: 16px 14px 30px; }
        `}</style>
        <div className="wf-mob">
          <div className="wf-mob-inner">
            {/* Header: Greeting + Burger */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h1 style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{greeting}, {employeeName?.split(" ")[0]}! 👋</h1>
                <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{time.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
              </div>
              <button onClick={() => setMobileMenu(true)} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Ic n="more" s={18} c="#374151" />
              </button>
            </div>

            {/* Stats 2x2 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[
                { label: "All Tasks", val: myTasks.length + done, icon: "task", color: "#6C63FF", bg: "#EDEDFE" },
                { label: "Assigned to Me", val: assignedToMe.length, icon: "users", color: "#3B82F6", bg: "#EFF6FF" },
                { label: "Overdue", val: overdueTasks.length, icon: "alert", color: "#EF4444", bg: "#FEF2F2" },
                { label: "Meetings", val: todayM, icon: "video", color: "#14B8A6", bg: "#F0FDFA" },
              ].map((s, i) => (
                <div key={i} style={{ background: "#fff", borderRadius: 10, border: "1px solid #EAECF0", padding: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#6B7280" }}>{s.label}</span>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}><Ic n={s.icon} s={12} c={s.color} /></div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Pending Requests (if any) */}
            {pendReqs.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF0", padding: "14px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Ic n="inbox" s={14} c="#16A34A" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Requests</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 99, background: "#DCFCE7", color: "#16A34A" }}>{pendReqs.length}</span>
                  </div>
                  <button onClick={() => window.dispatchEvent(new CustomEvent("openRequestPanel", { detail: { tab: "received" } }))} style={{ fontSize: 10, fontWeight: 600, color: "#6C63FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>View all</button>
                </div>
                {pendReqs.slice(0, 3).map((r, i) => (
                  <div key={r.requestId} style={{ padding: "8px 0", borderBottom: i < 2 ? "1px solid #F3F4F6" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{r.fromName || "Unknown"}</span>
                      <span style={{ fontSize: 9, color: "#9CA3AF" }}>{r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                    </div>
                    {r.message && <div style={{ fontSize: 11, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{r.message}"</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Task Tabs + List */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF0", marginBottom: 16, overflow: "hidden" }}>
              <div style={{ display: "flex", borderBottom: "1px solid #EAECF0" }}>
                {[{ k: "assigned_to", l: "To Me" }, { k: "assigned_by", l: "By Me" }, { k: "all", l: "All" }].map(t => (
                  <button key={t.k} onClick={() => setTaskTab(t.k)} style={{ flex: 1, padding: "10px 4px", fontSize: 11, fontWeight: 600, color: taskTab === t.k ? "#6C63FF" : "#9CA3AF", background: "none", border: "none", borderBottomWidth: 2, borderBottomStyle: "solid", borderBottomColor: taskTab === t.k ? "#6C63FF" : "transparent", cursor: "pointer", fontFamily: "inherit", marginBottom: -1 }}>
                    {t.l}
                  </button>
                ))}
              </div>
              <div style={{ padding: "8px" }}>
                {tLoad ? <div style={{ textAlign: "center", padding: 20 }}><GwSpinner /></div>
                  : filteredTasks.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: "#9CA3AF", fontSize: 12 }}>No tasks</div>
                    : filteredTasks.slice(0, 10).map(t => (
                      <MobileTaskCard key={t.taskId} task={t} employeeId={employeeId} empMap={empMap} isCEO={isCEO} onTaskClick={goTask} employeeName={employeeName} />
                    ))}
                {filteredTasks.length > 10 && (
                  <button onClick={() => router.push("/coworking/tasks")} style={{ width: "100%", padding: "8px", fontSize: 11, fontWeight: 600, color: "#6C63FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>View all tasks →</button>
                )}
              </div>
            </div>

            {/* Upcoming Meetings */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF0", padding: "14px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Upcoming</span>
                <button onClick={() => router.push("/coworking/schedule-meet")} style={{ fontSize: 10, fontWeight: 600, color: "#6C63FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>View all</button>
              </div>
              {[...liveMeets, ...upMeets.slice(0, 2)].length === 0 ? (
                <div style={{ textAlign: "center", padding: 12, color: "#9CA3AF", fontSize: 11 }}>No upcoming meetings</div>
              ) : [...liveMeets, ...upMeets.slice(0, 2)].map((m, i) => (
                <div key={m.meetId || i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: i < 1 ? "1px solid #F3F4F6" : "none" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 7, background: getMeetStatus(m) === "live" ? "#FEF2F2" : "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ic n="video" s={14} c={getMeetStatus(m) === "live" ? "#EF4444" : "#3B82F6"} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{m.title}</div>
                    <div style={{ fontSize: 10, color: "#9CA3AF" }}>{new Date(m.dateTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Recent Messages */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF0", padding: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Recent Messages</span>
                <button onClick={() => router.push("/coworking/direct-messages")} style={{ fontSize: 10, fontWeight: 600, color: "#6C63FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>View all</button>
              </div>
              {recentChatMessages.length === 0 ? (
                <div style={{ textAlign: "center", padding: 12, color: "#9CA3AF", fontSize: 11 }}>No messages</div>
              ) : recentChatMessages.slice(0, 4).map((msg, i, arr) => (
                <div key={msg.id} onClick={() => {
                  if (msg.type === "direct_message" && msg.conversationId) router.push(`/coworking/direct-messages/${msg.conversationId}`);
                  else if (msg.type === "task_chat" && msg.taskId) { localStorage.setItem("selectedTaskId", msg.taskId); router.push("/coworking/tasks"); }
                  else router.push("/coworking/direct-messages");
                }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer" }}>
                  <Av name={msg.senderName || msg.sourceLabel} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.sourceLabel}</div>
                    <div style={{ fontSize: 10, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.title}</div>
                  </div>
                  <span style={{ fontSize: 8, fontWeight: 600, padding: "2px 5px", borderRadius: 3, color: msg.color, background: msg.bg, flexShrink: 0 }}>{msg.source === "dm" ? "DM" : msg.source === "task" ? "Task" : "Group"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Burger Menu Overlay */}
          {mobileMenu && (
            <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.4)" }} onClick={() => setMobileMenu(false)}>
              <div style={{ position: "absolute", top: 0, right: 0, width: 260, height: "100%", background: "#fff", boxShadow: "-4px 0 20px rgba(0,0,0,0.1)", padding: "20px 16px" }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Menu</span>
                  <button onClick={() => setMobileMenu(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><Ic n="x" s={18} c="#6B7280" /></button>
                </div>
                {[
                  { icon: "home", label: "Dashboard", path: "/coworking" },
                  { icon: "task", label: "Tasks", path: "/coworking/tasks" },
                  { icon: "chat", label: "Messages", path: "/coworking/direct-messages" },
                  { icon: "users", label: "Groups", path: "/coworking/create-group" },
                  { icon: "cal", label: "Meetings", path: "/coworking/schedule-meet" },
                  ...(isCEO ? [{ icon: "emp", label: "Employees", path: "/coworking/create-employee" }] : []),
                ].map(item => (
                  <button key={item.label} onClick={() => { setMobileMenu(false); router.push(item.path); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 8px", background: "none", border: "none", borderBottom: "1px solid #F3F4F6", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    <Ic n={item.icon} s={16} c="#6B7280" />
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Deadline FAB */}
          {urgent > 0 && !sideOpen && (
            <button onClick={() => setSideOpen(true)} style={{ position: "fixed", bottom: 20, right: 16, width: 42, height: 42, borderRadius: "50%", background: "#6C63FF", border: "none", boxShadow: "0 4px 14px rgba(108,99,255,0.35)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150 }}>
              <Ic n="alert" s={18} c="#fff" />
              <span style={{ position: "absolute", top: -2, right: -2, minWidth: 14, height: 14, borderRadius: 99, background: "#DC2626", color: "#fff", fontSize: 7, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 2px", border: "2px solid #fff" }}>{urgent}</span>
            </button>
          )}

          {/* Deadline sheet */}
          {sideOpen && (
            <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.4)" }} onClick={() => setSideOpen(false)}>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#F9FAFB", borderRadius: "16px 16px 0 0", maxHeight: "84vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: "13px 14px 10px", background: "#fff", borderRadius: "16px 16px 0 0", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Ic n="alert" s={13} c="#6C63FF" /><span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Deadlines</span></div>
                  <button onClick={() => setSideOpen(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><Ic n="x" s={15} c="#9CA3AF" /></button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
                  {trackerTasks.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: "#9CA3AF", fontSize: 12 }}>All on track!</div>
                    : trackerTasks.map(t => <MobileTaskCard key={t.taskId} task={t} employeeId={employeeId} empMap={empMap} isCEO={isCEO} onTaskClick={t => { goTask(t); setSideOpen(false); }} employeeName={employeeName} />)}
                </div>
              </div>
            </div>
          )}
        </div>

        {deadlineTask && <EditDeadlineModal task={deadlineTask} onClose={() => setDeadlineTask(null)} onSuccess={() => { setDeadlineTask(null); loadTasks(); }} />}
        <GwConfirm open={!!deleteTarget} busy={deleteBusy} title="Delete Task?" message={`Permanently delete "${deleteTarget?.title}"?`} onCancel={() => setDeleteTarget(null)} onConfirm={async () => {
          if (!deleteTarget) return; setDeleteBusy(true);
          try { await deleteTask(deleteTarget.taskId); setDeleteTarget(null); loadTasks(); } catch (e) { alert(e.message); } finally { setDeleteBusy(false); }
        }} />
      </>
    );
  }

  /* ════════════════════════════════════
     DESKTOP / TABLET LAYOUT
  ════════════════════════════════════ */
  const sW = sideOpen ? "300px" : "0px";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 99px; }

        .wf-dash { font-family: 'DM Sans', -apple-system, sans-serif; background: #F8F9FB; min-height: 100vh; transition: padding-right 0.25s ease; min-width: 320px; }
.wf-inner { max-width: 100%; margin: 0 auto; padding: 20px 24px 40px; min-width: 0; }

        /* Stats row */
.wf-stats { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 12px; margin-bottom: 16px; }
        /* Main grid: left (task table) + right (controls/meetings/messages) */
.wf-main { display: grid; grid-template-columns: 1fr 340px; gap: 16px; margin-bottom: 20px; }
.wf-main-full { display: grid; grid-template-columns: 1fr 340px; gap: 16px; margin-bottom: 20px; }
.wf-top-with-requests { display: grid; grid-template-columns: 1fr 320px; gap: 16px; margin-bottom: 16px; align-items: start; }
.wf-top-with-requests .wf-top-left { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; }
        /* Bottom grid: 3 columns */
        .wf-bottom { display: grid; grid-template-columns: repeat(3, minmax(240px, 1fr)); gap: 16px; }

        /* Card base */
        .wf-card { background: #fff; border-radius: 12px; border: 1px solid #EAECF0; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }

        /* Task table */
        .wf-tbl { width: 100%; border-collapse: collapse; }
        .wf-tbl thead th { padding: 10px 12px; font-size: 11px; font-weight: 600; color: #6B7280; text-align: left; border-bottom: 1px solid #EAECF0; background: #F9FAFB; text-transform: uppercase; letter-spacing: 0.04em; }
        .wf-tbl tbody td { padding: 10px 12px; font-size: 12px; color: #374151; border-bottom: 1px solid #F3F4F6; vertical-align: middle; }
        .wf-tbl tbody tr { cursor: pointer; transition: background 0.1s; }
        .wf-tbl tbody tr:hover { background: #F9FAFB; }
        .wf-tbl tbody tr.wf-sub-row td { padding-left: 40px; background: #FAFBFC; font-size: 11.5px; }
        .wf-tbl tbody tr.wf-sub-row:hover td { background: #F3F4F6; }

        /* Responsive */
@media(max-width:1200px) { .wf-stats { grid-template-columns: repeat(2, 1fr); } .wf-main-full { grid-template-columns: 1fr; }
@media(max-width:900px) { .wf-stats { grid-template-columns: repeat(2, 1fr); } .wf-bottom { grid-template-columns: 1fr; } .wf-dash { padding-right: 0 !important; } }
@media(max-width:600px) { .wf-stats { grid-template-columns: 1fr 1fr; } .wf-stats .wf-stats-requests { grid-column: 1 / -1; }
@media(min-width:1600px) { .wf-inner { max-width: 100%; padding: 28px 48px 50px; } .wf-stats { gap: 16px; } .wf-main { gap: 20px; grid-template-columns: 1fr 400px; } .wf-main-full { gap: 20px; grid-template-columns: 1fr 400px; }
@media(min-width:1920px) { .wf-inner { max-width: 100%; padding: 32px 56px 60px; } .wf-main { grid-template-columns: 1fr 440px; } .wf-main-full { grid-template-columns: 1fr 440px; }
@media(min-width:2560px) { .wf-inner { padding: 36px 72px 60px; } .wf-main { grid-template-columns: 1fr 480px; gap: 24px; } .wf-stats { gap: 20px; } .wf-bottom { gap: 24px; } }      `}</style>

      <div className="wf-dash" style={{ paddingRight: sW }}>
        <div className="wf-inner">

          {/* ── GREETING ROW ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em" }}>
                {greeting}, {employeeName?.split(" ")[0]}! <span style={{ fontSize: 22 }}>👋</span>
              </h1>
              <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>Here&apos;s what&apos;s happening with your work today.</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Quick action buttons */}
              {[
                { label: "Tasks", icon: "task", path: "/coworking/tasks" },
                { label: "Messages", icon: "chat", path: "/coworking/direct-messages" },
                { label: "Meetings", icon: "cal", path: "/coworking/schedule-meet" },
                ...(isCEO ? [{ label: "Employees", icon: "emp", path: "/coworking/create-employee" }] : []),
              ].map(q => (
                <button key={q.label} onClick={() => router.push(q.path)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 12, fontWeight: 500, color: "#374151", cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#6C63FF"; e.currentTarget.style.color = "#6C63FF"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.color = "#374151"; }}>
                  <Ic n={q.icon} s={13} c="currentColor" /> {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── TOP AREA: (Stats + Tasks) left | Pending Requests right ── */}
          <div className="wf-top-with-requests">
            <div className="wf-top-left">

              {/* ── STATS CARDS ── */}
              <div className="wf-stats">
                {[
                  { label: "All Tasks", val: myTasks.length + done, sub: `${myTasks.filter(t => dlInfo(t.dueDate)?.s === "critical" || dlInfo(t.dueDate)?.s === "overdue").length} due today`, icon: "task", color: "#6C63FF", bg: "#EDEDFE" },
                  { label: "Assigned to Me", val: assignedToMe.length, sub: `${assignedToMe.filter(t => dlInfo(t.dueDate)?.s === "critical").length} due today`, icon: "users", color: "#3B82F6", bg: "#EFF6FF" },
                  { label: "Overdue", val: overdueTasks.length, sub: `${overdueTasks.filter(t => { const p = t.priority; return (typeof p === "number" ? p >= 8 : p === "high"); }).length} high priority`, icon: "alert", color: "#EF4444", bg: "#FEF2F2" },
                  { label: "Meetings Today", val: todayM, sub: upMeets[0] ? `Next: ${new Date(upMeets[0].dateTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "No upcoming", icon: "video", color: "#14B8A6", bg: "#F0FDFA" },
                ].map((s, i) => (
                  <div key={i} className="wf-card" style={{ padding: "14px 16px", animation: `fadeUp 0.3s ease ${i * 0.04}s both` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280" }}>{s.label}</span>
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Ic n={s.icon} s={14} c={s.color} />
                      </div>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#111827", lineHeight: 1, letterSpacing: "-0.03em" }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Task table — still inside wf-top-left */}                  {/* LEFT: My Tasks table */}
              <div className="wf-card" style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: "0 0 auto" }}>
                {/* Header */}
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #EAECF0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>My Tasks</h2>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff", fontSize: 11, fontWeight: 500, color: "#6B7280", cursor: "pointer", fontFamily: "inherit" }}>
                      <Ic n="filter" s={12} c="#9CA3AF" /> Filter
                    </button>
                    <button onClick={() => router.push("/coworking/tasks")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff", fontSize: 11, fontWeight: 500, color: "#6B7280", cursor: "pointer", fontFamily: "inherit" }}>
                      <Ic n="more" s={12} c="#9CA3AF" />
                    </button>
                    {/* List / Grid toggle */}
                    <div style={{ display: "flex", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden", marginLeft: 2 }}>
                      <button onClick={() => setViewMode("list")} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 30, border: "none", background: viewMode === "list" ? "#F3F4F6" : "#fff", cursor: "pointer", borderRight: "1px solid #E5E7EB" }} title="List view">
                        <Ic n="list" s={14} c={viewMode === "list" ? "#6C63FF" : "#9CA3AF"} />
                      </button>
                      <button onClick={() => setViewMode("grid")} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 30, border: "none", background: viewMode === "grid" ? "#F3F4F6" : "#fff", cursor: "pointer" }} title="Grid view">
                        <Ic n="grid" s={14} c={viewMode === "grid" ? "#6C63FF" : "#9CA3AF"} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #EAECF0" }}>
                  {[
                    { k: "assigned_to", l: "Assigned to Me" },
                    { k: "assigned_by", l: "Assigned by Me" },
                    { k: "all", l: "All Tasks" },
                  ].map(t => (
                    <button key={t.k} onClick={() => setTaskTab(t.k)} style={{
                      padding: "10px 20px", fontSize: 12, fontWeight: 600,
                      color: taskTab === t.k ? "#6C63FF" : "#9CA3AF",
                      background: "none", border: "none", borderBottomWidth: 2, borderBottomStyle: "solid", borderBottomColor: taskTab === t.k ? "#6C63FF" : "transparent",
                      cursor: "pointer", fontFamily: "inherit", marginBottom: -1,
                    }}>
                      {t.l}
                    </button>
                  ))}
                </div>

                {/* Filters row */}
                <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "5px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 11, color: "#6B7280", fontFamily: "inherit", background: "#fff", cursor: "pointer" }}>
                    <option value="all">All Status</option>
                    <option value="open">Todo</option>
                    <option value="in_progress">In Progress</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="done">Completed</option>
                  </select>
                  <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={{ padding: "5px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 11, color: "#6B7280", fontFamily: "inherit", background: "#fff", cursor: "pointer" }}>
                    <option value="all">All Priority</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  {(statusFilter !== "all" || priorityFilter !== "all") && (
                    <button onClick={() => { setStatusFilter("all"); setPriorityFilter("all"); }} style={{ fontSize: 11, color: "#6C63FF", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>Clear</button>
                  )}
                </div>

                {/* Table / Grid */}
                <div style={{ flex: "1 1 auto", overflowY: "auto" }}>
                  {tLoad ? (
                    <div style={{ textAlign: "center", padding: 40 }}><GwSpinner /></div>
                  ) : filteredTasks.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
                      <Ic n="checkC" s={32} c="#E5E7EB" />
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#6B7280", marginTop: 8 }}>All caught up!</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>No tasks match your filters</div>
                    </div>
                  ) : viewMode === "list" ? (
                    <table className="wf-tbl">
                      <thead>
                        <tr>
                          <th style={{ width: 30 }}></th>
                          <th>Task</th>
                          <th>{taskTab === "assigned_by" ? "Assignees" : "Assigned by"}</th>
                          <th>Group</th>
                          <th>Due Date</th>
                          <th>Priority</th>
                          <th>Status</th>
                          <th style={{ width: 40 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTasks.slice(0, 20).map(t => {
                          const sb = getStatusBadge(t.status);
                          const pri = getPri(t.priority);
                          const info = dlInfo(t.dueDate);
                          const subs = (t.subtaskIds || []);
                          const isExpanded = expandedTaskIds.has(t.taskId);
                          const assigner = empMap?.[t.assignedBy];
                          const assignerName = assigner?.name || t.assignedByName || "—";
                          const assignerPic = assigner?.profilePicUrl;
                          // For "Assigned by Me" tab, show assignees instead
                          const assigneeList = (t.assigneeIds || []).map(id => empMap?.[id]).filter(Boolean);

                          return (
                            <React.Fragment key={t.taskId}>
                              <tr onClick={() => goTask(t)}>
                                <td>
                                  {subs.length > 0 ? (
                                    <button onClick={e => { e.stopPropagation(); toggleExpand(t.taskId); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                                      <Ic n={isExpanded ? "chevD" : "chevR"} s={12} c="#9CA3AF" />
                                    </button>
                                  ) : <div style={{ width: 8, height: 8, borderRadius: "50%", background: sb.c, margin: "0 auto" }} />}
                                </td>
                                <td>
                                  <div style={{ fontWeight: 600, color: "#111827" }}>{t.title}</div>
                                  {subs.length > 0 && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1 }}>{subs.length} subtasks • {assigner?.department || "Team"}</div>}
                                </td>
                                <td>
                                  {taskTab === "assigned_by" ? (
                                    assigneeList.length > 0 ? (
                                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <div style={{ display: "flex" }}>
                                          {assigneeList.slice(0, 3).map((a, j) => (
                                            <div key={j} style={{ marginLeft: j > 0 ? -6 : 0 }}><Av name={a.name || ""} size={22} url={a.profilePicUrl} /></div>
                                          ))}
                                        </div>
                                        <span style={{ fontSize: 11.5, color: "#374151" }}>
                                          {assigneeList.length === 1 ? assigneeList[0].name : `${assigneeList[0].name} +${assigneeList.length - 1}`}
                                        </span>
                                      </div>
                                    ) : <span style={{ fontSize: 11.5, color: "#9CA3AF" }}>—</span>
                                  ) : (
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <Av name={assignerName} size={22} url={assignerPic} />
                                      <span style={{ fontSize: 11.5 }}>{assignerName}</span>
                                    </div>
                                  )}
                                </td>
                                <td style={{ fontSize: 11.5, color: "#6B7280" }}>{assigner?.department || "—"}</td>
                                <td>
                                  {info ? (
                                    <span style={{ fontSize: 11, fontWeight: 600, color: info.c }}>{info.text}</span>
                                  ) : (
                                    <span style={{ fontSize: 11, color: "#D1D5DB" }}>—</span>
                                  )}
                                </td>
                                <td><span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, color: pri.c, background: pri.bg }}>{pri.l}</span></td>
                                <td><span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, color: sb.c, background: sb.bg }}>{sb.l}</span></td>
                                <td>
                                  {(() => {
                                    const ai = getTaskActionInfo(t);
                                    const sess = getTimerSession ? getTimerSession(t.taskId) : null;
                                    const isRunning = timerActiveTaskId === t.taskId || sess?.isActive === true;
                                    const secs = getDisplaySeconds ? getDisplaySeconds(t.taskId) : (sess?.totalSeconds || 0);
                                    if (ai.type === "none") return null;
                                    return (
                                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                        {ai.type === "indicator" ? (
                                          <Ic n={ai.icon} s={14} c={ai.color} />
                                        ) : (
                                          <button onClick={e => { e.stopPropagation(); handleTaskAction(t, ai.action); }}
                                            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 4, transition: "background 0.12s" }}
                                            onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"}
                                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                            title={ai.label}>
                                            <Ic n={ai.icon} s={14} c={ai.color} />
                                          </button>
                                        )}
                                        {(isRunning || secs > 0) && (
                                          <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: isRunning ? "#16A34A" : "#94A3B8", lineHeight: 1 }}>
                                            {formatTimeHMS(secs)}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </td>
                              </tr>
                              {/* Subtask rows */}
                              {isExpanded && subs.map(subId => {
                                const sub = tasks.find(st => st.taskId === subId);
                                if (!sub) return null;
                                const ssb = getStatusBadge(sub.status);
                                const sp = getPri(sub.priority);
                                const si = dlInfo(sub.dueDate);
                                const sa = empMap?.[sub.assignedBy];
                                return (
                                  <tr key={subId} className="wf-sub-row" onClick={() => goTask(sub)}>
                                    <td></td>
                                    <td style={{ paddingLeft: 20 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: ssb.c, flexShrink: 0 }} />
                                        <span>{sub.title}</span>
                                      </div>
                                    </td>
                                    <td>
                                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                        <Av name={sa?.name || ""} size={18} url={sa?.profilePicUrl} />
                                        <span style={{ fontSize: 11 }}>{sa?.name || "—"}</span>
                                      </div>
                                    </td>
                                    <td style={{ fontSize: 11, color: "#9CA3AF" }}>{sa?.department || "—"}</td>
                                    <td>{si ? <span style={{ fontSize: 10.5, fontWeight: 600, color: si.c }}>{si.text}</span> : <span style={{ color: "#D1D5DB" }}>—</span>}</td>
                                    <td><span style={{ fontSize: 9.5, fontWeight: 600, padding: "2px 6px", borderRadius: 3, color: sp.c, background: sp.bg }}>{sp.l}</span></td>
                                    <td><span style={{ fontSize: 9.5, fontWeight: 600, padding: "2px 6px", borderRadius: 3, color: ssb.c, background: ssb.bg }}>{ssb.l}</span></td>
                                    <td></td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    /* ── GRID VIEW ── */
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, padding: 16 }}>
                      {filteredTasks.slice(0, 20).map(t => {
                        const sb = getStatusBadge(t.status);
                        const pri = getPri(t.priority);
                        const info = dlInfo(t.dueDate);
                        const subs = (t.subtaskIds || []);
                        const assigner = empMap?.[t.assignedBy];
                        const assignerName = assigner?.name || t.assignedByName || "—";
                        const gridAssignees = (t.assigneeIds || []).map(id => empMap?.[id]).filter(Boolean);
                        return (
                          <div key={t.taskId} onClick={() => goTask(t)} style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid #EAECF0", cursor: "pointer", transition: "all 0.12s", background: "#fff" }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = "#6C63FF"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(108,99,255,0.12)"; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = "#EAECF0"; e.currentTarget.style.boxShadow = "none"; }}>
                            {/* Top: status + priority badges */}
                            <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                              <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 4, color: sb.c, background: sb.bg }}>{sb.l}</span>
                              <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 4, color: pri.c, background: pri.bg }}>{pri.l}</span>
                            </div>
                            {/* Title */}
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", lineHeight: 1.3, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                            {subs.length > 0 && <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 6 }}>{subs.length} subtasks</div>}
                            {/* Person row — assignees or assigner depending on tab */}
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                              {taskTab === "assigned_by" && gridAssignees.length > 0 ? (
                                <>
                                  <div style={{ display: "flex" }}>{gridAssignees.slice(0, 2).map((a, j) => <div key={j} style={{ marginLeft: j > 0 ? -6 : 0 }}><Av name={a.name} size={20} url={a.profilePicUrl} /></div>)}</div>
                                  <span style={{ fontSize: 11, color: "#6B7280" }}>{gridAssignees.length === 1 ? gridAssignees[0].name : `${gridAssignees[0].name} +${gridAssignees.length - 1}`}</span>
                                </>
                              ) : (
                                <>
                                  <Av name={assignerName} size={20} url={assigner?.profilePicUrl} />
                                  <span style={{ fontSize: 11, color: "#6B7280" }}>{assignerName}</span>
                                  <span style={{ fontSize: 9, color: "#9CA3AF", marginLeft: "auto" }}>{assigner?.department || ""}</span>
                                </>
                              )}
                            </div>
                            {/* Footer: due date + action + timer */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              {info ? <span style={{ fontSize: 10, fontWeight: 600, color: info.c }}>{info.text}</span> : <span style={{ fontSize: 10, color: "#D1D5DB" }}>No deadline</span>}
                              {(() => {
                                const ai = getTaskActionInfo(t);
                                const sess = getTimerSession ? getTimerSession(t.taskId) : null;
                                const isRunning = timerActiveTaskId === t.taskId || sess?.isActive === true;
                                const secs = getDisplaySeconds ? getDisplaySeconds(t.taskId) : (sess?.totalSeconds || 0);
                                if (ai.type === "none") return null;
                                return (
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    {(isRunning || secs > 0) && <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: isRunning ? "#16A34A" : "#94A3B8" }}>{formatTimeHMS(secs)}</span>}
                                    {ai.type === "indicator" ? <Ic n={ai.icon} s={14} c={ai.color} /> : (
                                      <button onClick={e => { e.stopPropagation(); handleTaskAction(t, ai.action); }}
                                        style={{ background: "none", border: "none", cursor: "pointer", padding: 3, borderRadius: 4 }} title={ai.label}>
                                        <Ic n={ai.icon} s={14} c={ai.color} />
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer */}
                {filteredTasks.length > 20 && (
                  <div style={{ padding: "10px 16px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => router.push("/coworking/tasks")} style={{ fontSize: 12, fontWeight: 600, color: "#6C63FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                      View all tasks <Ic n="arrow" s={12} c="#6C63FF" />
                    </button>
                  </div>
                )}
              </div>

            </div>{/* end wf-top-left */}

            {/* RIGHT COLUMN: Pending Requests — spans from stats to bottom of tasks */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="wf-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 280, maxHeight: 600, }}>                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Ic n="inbox" s={14} c="#16A34A" />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Pending Requests</span>
                      {pendReqs.length > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "#DCFCE7", color: "#16A34A" }}>{pendReqs.length}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1 }}>{now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                  </div>
                </div>
                <button onClick={() => window.dispatchEvent(new CustomEvent("openRequestPanel", { detail: { tab: "received" } }))} style={{ fontSize: 11, fontWeight: 600, color: "#374151", background: "transparent", border: "1px solid #E5E7EB", borderRadius: 6, padding: "4px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit", transition: "all 0.12s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#374151"; e.currentTarget.style.background = "#F9FAFB"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "transparent"; }}>
                  Respond <Ic n="arrow" s={9} c="currentColor" />
                </button>
              </div>
                <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                  {pendReqs.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 16 }}>
                      <Ic n="checkC" s={22} c="#E5E7EB" />
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginTop: 7 }}>No pending requests</div>
                      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>All caught up!</div>
                    </div>
                  ) : (
                    <div>
                      {pendReqs.map((r, i) => {
                        const senderEmp = empMap?.[r.fromId] || {};
                        const senderD = desg(senderEmp);
                        const ts = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : new Date();
                        const cleanMsg = (r.message || "").trim();
                        const hasText = cleanMsg && cleanMsg !== '""' && cleanMsg.length > 0;
                        const reqAtts = (() => { const raw = r.attachments || r.files || r.media || []; if (Array.isArray(raw)) return raw.filter(a => a && (typeof a === "object" ? (a.url || a.fileUrl) : typeof a === "string" && a.startsWith("http"))); return []; })();
                        return (
                          <div key={r.requestId} style={{ padding: "10px 0", borderBottom: i < pendReqs.length - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer" }}
                            onClick={() => window.dispatchEvent(new CustomEvent("openRequestPanel", { detail: { tab: "received", requestId: r.requestId } }))}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                {empMap?.[r.fromId]?.profilePicUrl
                                  ? <img src={empMap[r.fromId].profilePicUrl} alt={r.fromName} style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                                  : <div style={{ width: 24, height: 24, borderRadius: "50%", background: avC(r.fromName || ""), color: "#fff", fontSize: 8.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{(r.fromName || "?")[0].toUpperCase()}</div>}
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{r.fromName || empMap?.[r.fromId]?.name || "Unknown"}</span>
                                  {senderD && <span style={{ fontSize: 9, color: "#9CA3AF", marginLeft: 5 }}>{senderD}</span>}
                                </div>
                              </div>
                              <span style={{ fontSize: 9, color: "#9CA3AF", flexShrink: 0 }}>{ts.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                            {r.taskTitle && <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 2 }}>Re: {r.taskTitle}</div>}
                            {hasText && <p style={{ fontSize: 11, color: "#4B5563", margin: 0, fontStyle: "italic", lineHeight: 1.5, wordBreak: "break-word" }}>"{cleanMsg}"</p>}
                            {reqAtts.length > 0 && (
                              <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {reqAtts.slice(0, 3).map((att, ai) => {
                                  const aUrl = att.url || att.fileUrl || (typeof att === "string" ? att : "");
                                  const aName = att.name || att.fileName || "File";
                                  const isImg = (att.type || att.mimeType || "").startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(aName);
                                  return (
                                    <a key={ai} href={aUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "#F3F4F6", borderRadius: 4, fontSize: 9, color: "#4B5563", textDecoration: "none", fontWeight: 500 }}>
                                      <Ic n={isImg ? "img" : "file"} s={10} c="#6B7280" />
                                      <span style={{ maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{aName}</span>
                                    </a>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              {/* Upcoming Meetings */}
              <div className="wf-card" style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Upcoming</h3>
                  <button onClick={() => router.push("/coworking/schedule-meet")} style={{ fontSize: 11, fontWeight: 600, color: "#6C63FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>View all</button>
                </div>
                {[...liveMeets, ...upMeets.slice(0, 3)].length === 0 ? (
                  <div style={{ textAlign: "center", padding: 16, color: "#9CA3AF", fontSize: 12 }}>No upcoming meetings</div>
                ) : [...liveMeets, ...upMeets.slice(0, 3)].map((m, i) => {
                  const isLive = getMeetStatus(m) === "live";
                  const dt = new Date(m.dateTime);
                  const participants = m.participantIds?.length || 0;
                  return (
                    <div key={m.meetId || i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < 2 ? "1px solid #F3F4F6" : "none" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: isLive ? "#FEF2F2" : "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Ic n="video" s={16} c={isLive ? "#EF4444" : "#3B82F6"} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{m.title}</div>
                        <div style={{ fontSize: 10.5, color: "#9CA3AF" }}>{dt.toLocaleDateString("en-IN", { weekday: "short" })}, {dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        {/* Participant avatars */}
                        <div style={{ display: "flex", marginRight: 6 }}>
                          {(m.participantIds || []).slice(0, 2).map((pid, j) => (
                            <Av key={pid} name={empMap?.[pid]?.name || ""} url={empMap?.[pid]?.profilePicUrl} size={22} />
                          ))}
                          {participants > 2 && (
                            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#E5E7EB", color: "#6B7280", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: -6 }}>+{participants - 2}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Recent Messages — real data from task chats, DMs, groups */}
              <div className="wf-card" style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Recent Messages</h3>
                  <button onClick={() => router.push("/coworking/direct-messages")} style={{ fontSize: 11, fontWeight: 600, color: "#6C63FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>View all</button>
                </div>
                {recentChatMessages.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 16, color: "#9CA3AF", fontSize: 12 }}>No recent messages</div>
                ) : (
                  <>
                    {recentChatMessages.slice(0, msgExpanded ? 10 : 4).map((msg, i, arr) => (
                      <div key={msg.id} onClick={() => {
                        if (msg.type === "task_chat" && msg.taskId) { localStorage.setItem("selectedTaskId", msg.taskId); router.push("/coworking/tasks"); }
                        else if (msg.type === "direct_message" && msg.conversationId) router.push(`/coworking/direct-messages/${msg.conversationId}`);
                        else if (msg.type === "group_message" && msg.groupId) router.push(`/coworking/create-group/group-chat/${msg.groupId}`);
                        else router.push("/coworking/direct-messages");
                      }} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer", transition: "background 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#FAFAFA"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <Av name={msg.senderName || msg.sourceLabel || "?"} size={32} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{msg.sourceLabel}</span>
                            <span style={{ fontSize: 8, fontWeight: 600, padding: "2px 6px", borderRadius: 3, color: msg.color, background: msg.bg, flexShrink: 0 }}>
                              {msg.source === "task" ? "Task" : msg.source === "dm" ? "DM" : "Group"}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {msg.senderName ? `${msg.senderName}: ` : ""}{msg.title}
                          </div>
                        </div>
                        <span style={{ fontSize: 10, color: "#9CA3AF", flexShrink: 0, marginTop: 2 }}>{msg.ts ? timeAgo(new Date(msg.ts).toISOString()) : ""}</span>
                      </div>
                    ))}
                    {recentChatMessages.length > 4 && (
                      <button onClick={() => setMsgExpanded(p => !p)} style={{ width: "100%", padding: "6px 0", fontSize: 11, fontWeight: 600, color: "#6C63FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>
                        {msgExpanded ? "Show less" : `Show ${Math.min(recentChatMessages.length - 4, 6)} more`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>{/* end wf-top-with-requests */}

          {/* ── BOTTOM ROW ── */}
          <div className="wf-bottom">
            {/* Tasks by Status — Donut Chart */}
            <div className="wf-card" style={{ padding: "20px" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Tasks by Status</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <DonutChart data={donutData} total={total} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { l: "In Progress", v: inprog, c: "#6C63FF", pct: total > 0 ? Math.round(inprog / total * 100) : 0 },
                    { l: "Pending", v: review, c: "#F59E0B", pct: total > 0 ? Math.round(review / total * 100) : 0 },
                    { l: "On Hold", v: pausedTasks.length, c: "#3B82F6", pct: total > 0 ? Math.round(pausedTasks.length / total * 100) : 0 },
                    { l: "Paused", v: myTasks.filter(t => t.isPaused).length, c: "#94A3B8", pct: total > 0 ? Math.round(myTasks.filter(t => t.isPaused).length / total * 100) : 0 },
                    { l: "Completed", v: done, c: "#22C55E", pct: total > 0 ? Math.round(done / total * 100) : 0 },
                  ].map(s => (
                    <div key={s.l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.c, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "#374151", fontWeight: 500, width: 90 }}>{s.l}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", width: 20 }}>{s.v}</span>
                      <span style={{ fontSize: 10, color: "#9CA3AF" }}>({s.pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tasks Paused */}
            <div className="wf-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Tasks Paused</h3>
                <button onClick={() => router.push("/coworking/tasks")} style={{ fontSize: 11, fontWeight: 600, color: "#6C63FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>View all</button>
              </div>
              {pausedTasks.length === 0 ? (
                <div style={{ textAlign: "center", padding: 16, color: "#9CA3AF", fontSize: 12 }}>No paused tasks</div>
              ) : pausedTasks.slice(0, 4).map((t, i) => {
                const info = dlInfo(t.dueDate);
                const pri = getPri(t.priority);
                return (
                  <div key={t.taskId} onClick={() => goTask(t)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < 3 ? "1px solid #F3F4F6" : "none", cursor: "pointer" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{t.title}</div>
                      <div style={{ fontSize: 10.5, color: "#9CA3AF" }}>Paused by {empMap?.[t.assignedBy]?.name || "—"}</div>
                    </div>
                    {info && <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, color: info.c, background: info.bg, flexShrink: 0, marginLeft: 8 }}>{info.text}</span>}
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, color: pri.c, background: pri.bg, flexShrink: 0, marginLeft: 4 }}>{pri.l}</span>
                  </div>
                );
              })}
            </div>

            {/* Overdue Tasks */}
            <div className="wf-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Overdue Tasks</h3>
                <button onClick={() => router.push("/coworking/tasks")} style={{ fontSize: 11, fontWeight: 600, color: "#6C63FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>View all</button>
              </div>
              {overdueTasks.length === 0 ? (
                <div style={{ textAlign: "center", padding: 16, color: "#9CA3AF", fontSize: 12 }}>No overdue tasks 🎉</div>
              ) : overdueTasks.slice(0, 5).map((t, i) => {
                const info = dlInfo(t.dueDate);
                const pri = getPri(t.priority);
                return (
                  <div key={t.taskId} onClick={() => goTask(t)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < 4 ? "1px solid #F3F4F6" : "none", cursor: "pointer" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{t.title}</div>
                      <div style={{ fontSize: 10.5, color: "#EF4444" }}>{info?.text || "Overdue"}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, color: pri.c, background: pri.bg, flexShrink: 0 }}>{pri.l}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div >

      {/* Edit Deadline Modal */}
      {deadlineTask && <EditDeadlineModal task={deadlineTask} onClose={() => setDeadlineTask(null)} onSuccess={() => { setDeadlineTask(null); loadTasks(); }} />}

      {/* Delete Task Confirm */}
      <GwConfirm open={!!deleteTarget} busy={deleteBusy} title="Delete Task?" message={`Permanently delete "${deleteTarget?.title} (${deleteTarget?.taskId})"? This cannot be undone.`} onCancel={() => setDeleteTarget(null)} onConfirm={async () => {
        if (!deleteTarget) return; setDeleteBusy(true);
        try { await deleteTask(deleteTarget.taskId); setDeleteTarget(null); loadTasks(); } catch (e) { alert(e.message); } finally { setDeleteBusy(false); }
      }} />

      {/* Work Commit Modal — shown when pausing a task timer */}
      {
        commitModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => handleSkipCommit()}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, padding: "24px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", animation: "fadeUp 0.2s ease" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>Pause Timer</h3>
                  <p style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{commitModal.taskTitle}</p>
                </div>
                <button onClick={handleSkipCommit} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Ic n="x" s={18} c="#9CA3AF" /></button>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>What did you work on? (optional)</label>
                <textarea
                  value={commitMessage}
                  onChange={e => setCommitMessage(e.target.value)}
                  placeholder="Describe what you accomplished..."
                  rows={4}
                  style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #E5E7EB", borderRadius: 10, fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", color: "#111827", boxSizing: "border-box" }}
                  onFocus={e => e.target.style.borderColor = "#6C63FF"}
                  onBlur={e => e.target.style.borderColor = "#E5E7EB"}
                  autoFocus
                />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={handleSkipCommit} disabled={savingCommit} style={{ padding: "8px 16px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 500, color: "#6B7280", cursor: "pointer", fontFamily: "inherit" }}>
                  Skip & Pause
                </button>
                <button onClick={handleCommitAndPause} disabled={savingCommit} style={{ padding: "8px 20px", border: "none", borderRadius: 8, background: "#6C63FF", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5, opacity: savingCommit ? 0.6 : 1 }}>
                  {savingCommit ? "Saving..." : "Save & Pause"}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Timer Toast */}
      {
        timerToast && (
          <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9998, background: "#1E293B", color: "#fff", padding: "10px 18px", borderRadius: 12, fontSize: 12, fontWeight: 500, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 8, maxWidth: 360, animation: "fadeUp 0.25s ease" }}>
            <span>{timerToast.message}</span>
          </div>
        )
      }

      <DeadlineSidebar tasks={trackerTasks} role={role} employeeId={employeeId} employeeName={employeeName} empMap={empMap} open={sideOpen} onToggle={() => setSideOpen(p => !p)} onTaskClick={goTask} />

      {
        isTablet && urgent > 0 && (
          <button onClick={() => setSideOpen(p => !p)} style={{ position: "fixed", bottom: 18, right: 16, display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: "#6C63FF", border: "none", borderRadius: 99, boxShadow: "0 4px 14px rgba(108,99,255,0.3)", cursor: "pointer", color: "#fff", fontSize: 11, fontWeight: 700, zIndex: 200 }}>
            <Ic n="alert" s={13} c="#fff" /> Deadlines <span style={{ background: "#DC2626", borderRadius: 99, padding: "1px 5px", fontSize: 8.5 }}>{urgent}</span>
          </button>
        )
      }
    </>
  );
}
