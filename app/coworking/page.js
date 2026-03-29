"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../hooks/useCoworkAuth";
import { useMeetings, useGroups } from "../../hooks/useCoworkData";
import CoworkTaskCard from "../../components/coworking/tasks/CoworkTaskCard";
import { getCoworkSocket } from "../../lib/coworkSocket";
import { GwEmpty, GwSpinner } from "../../components/coworking/shared/CoworkShared";
import { listTasks } from "../../lib/mediaUploadApi";
import { firebaseAuth, firebaseDb } from "../../lib/coworkFirebase";
import { useCoworkNotifications } from "../../hooks/useCoworkNotifications";
import { timeAgo } from "../../lib/coworkUtils";
import ReceivedRequests from "../../components/coworking/tasks/ReceivedRequests";
import {
  collection, doc, updateDoc, serverTimestamp,
  query, where, orderBy, onSnapshot, setDoc,
  getDocs
} from "firebase/firestore";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function apiFetch(path, opts = {}) {
  const u = firebaseAuth.currentUser;
  if (!u) throw new Error("Not authenticated");
  const token = await u.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...opts.headers },
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "Failed");
  return d;
}

const ST = {
  open: { color: "#667085", bg: "#F2F4F7", dot: "#98A2B3" },
  confirmed: { color: "#1A73E8", bg: "#EBF3FE", dot: "#1A73E8" },
  in_progress: { color: "#E37400", bg: "#FFF4E5", dot: "#F59E0B" },
  done: { color: "#1E8E3E", bg: "#E6F4EA", dot: "#34A853" },
};

/* ── Inline SVG Icons ── */
function I({ name, size = 16, color = "currentColor", sw = "1.8" }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" };
  const d = {
    arrow: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    tasks: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>,
    chat: <><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></>,
    users: <><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" /><path d="M16 3.13a4 4 0 010 7.75" /><path d="M21 21v-2a4 4 0 00-3-3.85" /></>,
    video: <><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></>,
    forward: <><polyline points="15 17 20 12 15 7" /><path d="M4 18v-2a4 4 0 014-4h12" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    bell: <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></>,
    star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></>,
  };
  return <svg {...p}>{d[name]}</svg>;
}

/* ── Notification Item ── */
function NotifRow({ n }) {
  return (
    <div className="d-notif-row" style={{ background: n.read ? "transparent" : "rgba(26,115,232,0.03)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="d-notif-title">{n.title}</div>
        {n.body && <div className="d-notif-body">{n.body}</div>}
      </div>
      <div className="d-notif-meta">
        <span className="d-notif-time">{timeAgo(n.createdAt)}</span>
        {!n.read && <span className="d-notif-dot" />}
      </div>
    </div>
  );
}

/* ── Task List Item ── */
function TaskItem({ task, onClick, showFrom }) {
  const st = ST[task.status] || ST.open;
  const pri = task.priority || "medium";
  const priColor = pri === "high" ? "#D93025" : pri === "medium" ? "#E37400" : "#1E8E3E";
  const msgCount = task.chatMessageCount || 0;
  const hasUnread = task.hasUnread || false;
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";

  const chatTimeStr = (() => {
    if (!task.lastChatAt) return null;
    const ts = task.lastChatAt?.seconds ? new Date(task.lastChatAt.seconds * 1000) : new Date(task.lastChatAt);
    const diff = Math.floor((Date.now() - ts) / 60000);
    if (diff < 1) return "now";
    if (diff < 60) return `${diff}m`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h`;
    return `${Math.floor(diff / 1440)}d`;
  })();

  return (
    <div className="d-task-item" onClick={() => onClick?.(task)}>
      <span className="d-task-dot" style={{ background: st.dot }} />
      <div className="d-task-info">
        <span className="d-task-name">{task.title}</span>
        <span className="d-task-sub">
          <span className="d-task-id">{task.taskId}</span>
          {showFrom && task.assignedByName && <span> from <b>{task.assignedByName}</b></span>}
          {!showFrom && task.assigneeNames && <span> to <b>{task.assigneeNames?.join(", ") || "—"}</b></span>}
        </span>
      </div>
      <div className="d-task-right">
        {msgCount > 0 && <span className={`d-task-msg${hasUnread ? " unread" : ""}`}>{msgCount}</span>}
        {chatTimeStr && <span className={`d-task-time${hasUnread ? " unread" : ""}`}>{chatTimeStr}</span>}
        {hasUnread && <span className="d-task-unread-dot" />}
      </div>
      <div className="d-task-tags">
        <span className="d-tag" style={{ color: st.color, background: st.bg }}>{task.status?.replace("_", " ") || "open"}</span>
        {isOverdue && <span className="d-tag d-tag-red">overdue</span>}
      </div>
    </div>
  );
}

/* ── Request Item ── */
function RequestItem({ req, currentEmployeeId, currentEmployeeName, onResolve }) {
  const [open, setOpen] = useState(false);
  const [responseMsg, setResponseMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const handleRespond = async (action) => {
    setBusy(true);
    try {
      await updateDoc(doc(firebaseDb, "cowork_requests", req.requestId), {
        status: action === "resolve" ? "resolved" : "rejected",
        responseMessage: responseMsg.trim(),
        respondedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      onResolve?.(req, action, responseMsg);
      setDone(true);
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  };

  if (done) return null;
  const ts = req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000) : new Date();

  return (
    <div className="d-req-card">
      <div className="d-req-top">
        <div>
          <span className="d-req-from">{req.fromName}</span>
          <span className="d-req-arrow">→</span>
          <span className="d-req-task-label">{req.taskTitle || req.taskId}</span>
        </div>
        <span className="d-req-time">{ts.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <p className="d-req-msg">"{req.message}"</p>
      {!open ? (
        <button className="d-req-respond" onClick={() => setOpen(true)}>Respond</button>
      ) : (
        <div className="d-req-form">
          <textarea value={responseMsg} onChange={e => setResponseMsg(e.target.value)} placeholder="Your response (optional)..." rows={2} className="d-req-input" autoFocus />
          <div className="d-req-btns">
            <button disabled={busy} onClick={() => handleRespond("resolve")} className="d-btn-green">{busy ? "..." : "Resolve"}</button>
            <button disabled={busy} onClick={() => handleRespond("reject")} className="d-btn-red">{busy ? "..." : "Reject"}</button>
            <button onClick={() => setOpen(false)} className="d-btn-ghost">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
  const router = useRouter();
  const { meets } = useMeetings(employeeId);
  const { groups } = useGroups(employeeId);
  const { notifications, unread, markRead } = useCoworkNotifications(employeeId || "");

  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [incomingTasks, setIncomingTasks] = useState([]);
  const [outgoingTasks, setOutgoingTasks] = useState([]);
  const [forwardedLoading, setForwardedLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [unreadTaskIds, setUnreadTaskIds] = useState(new Set());

  const isCEO = role === "ceo";
  const isTL = role === "tl";

  useEffect(() => {
    const c = () => setIsMobile(window.innerWidth <= 767);
    c(); window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    const q = query(collection(firebaseDb, "cowork_requests"), where("toId", "==", employeeId), where("status", "==", "pending"));
    const unsub = onSnapshot(q, snap => {
      setPendingRequests(snap.docs.map(d => ({ ...d.data(), requestId: d.id })).sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)));
    });
    return () => unsub();
  }, [employeeId]);

  const loadAllTasks = useCallback(async () => {
    if (!employeeId) return;
    setTasksLoading(true);
    try {
      const snap = await getDocs(query(collection(firebaseDb, "cowork_tasks"), orderBy("createdAt", "desc")));
      const all = []; snap.forEach(d => all.push({ ...d.data(), taskId: d.id }));
      setTasks(all);
      const readTimes = JSON.parse(localStorage.getItem("cowork_read_times") || "{}");
      const newUnread = new Set();
      all.forEach(t => {
        if (!t.lastChatAt) return;
        const lc = t.lastChatAt?.seconds ? t.lastChatAt.seconds * 1000 : typeof t.lastChatAt === "string" ? new Date(t.lastChatAt).getTime() : t.lastChatAt;
        if (lc > (readTimes[t.taskId] || 0) && t.assigneeIds?.includes(employeeId)) newUnread.add(t.taskId);
      });
      setUnreadTaskIds(newUnread);
    } catch (e) { console.error(e); }
    finally { setTasksLoading(false); }
  }, [employeeId]);

  const loadForwardedTasks = useCallback(() => {
    if (!employeeId) return;
    setForwardedLoading(true);
    try {
      setIncomingTasks(tasks.filter(t => (t.assigneeIds || []).includes(employeeId) && t.assignedBy !== employeeId).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)).slice(0, 5));
      setOutgoingTasks(tasks.filter(t => t.assignedBy === employeeId && (t.assigneeIds || []).some(id => id !== employeeId)).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)).slice(0, 5));
    } catch (e) { console.error(e); }
    finally { setForwardedLoading(false); }
  }, [tasks, employeeId]);

  useEffect(() => { if (tasks.length > 0) loadForwardedTasks(); }, [tasks, loadForwardedTasks]);
  useEffect(() => { if (!loading && !user) router.push("/coworking-login"); }, [user, loading, router]);
  useEffect(() => { if (user && employeeId) loadAllTasks(); }, [user, employeeId, loadAllTasks]);
  useEffect(() => { const t = setInterval(() => setCurrentTime(new Date()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { if (employeeId) getCoworkSocket(employeeId); }, [employeeId]);

  if (loading || !user) return null;

  const rootTasks = tasks.filter(t => !t.parentTaskId);
  const activeTasks = rootTasks.filter(t => t.status !== "done").slice(0, 5);
  const completedTasks = tasks.filter(t => t.status === "done").length;
  const inProgressTasks = tasks.filter(t => t.status === "in_progress").length;
  const openTasks = tasks.filter(t => t.status === "open").length;
  const totalTasks = tasks.length;
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const upcomingMeets = meets.filter(m => new Date(m.dateTime) > new Date()).sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime)).slice(0, 3);
  const todayMeets = meets.filter(m => new Date(m.dateTime).toDateString() === new Date().toDateString()).length;
  const pendingReview = tasks.filter(t => ["submitted", "tl_approved"].includes(t.completionStatus)).length;
  const recentNotifs = notifications.slice(0, 5);

  const greeting = (() => { const h = currentTime.getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; })();

  const goTask = (task) => { localStorage.setItem("selectedTaskId", task.taskId); router.push("/coworking/tasks"); };

  const handleRequestResolve = async (req, action, responseMsg) => {
    try {
      const msgId = crypto.randomUUID();
      const msgsRef = collection(firebaseDb, "cowork_tasks", req.taskId, "chat");
      const verb = action === "resolve" ? "Resolved" : "Rejected";
      const chatText = `${verb} request from ${req.fromName}: "${req.message}"${responseMsg ? ` — "${responseMsg}"` : ""}`;
      await setDoc(doc(msgsRef, msgId), { messageId: msgId, taskId: req.taskId, senderId: employeeId, senderName: employeeName, text: chatText, attachments: [], messageType: "system", mention: null, createdAt: serverTimestamp() });
      await updateDoc(doc(firebaseDb, "cowork_tasks", req.taskId), { lastChatAt: serverTimestamp(), lastChatPreview: chatText, updatedAt: serverTimestamp() });
    } catch (e) { console.error(e); }
  };

  const STATS = [
    { icon: "tasks", val: totalTasks, label: "Total", sub: `${completedTasks} done`, color: "#1A73E8" },
    { icon: "clock", val: inProgressTasks, label: "In Progress", sub: `${openTasks} open`, color: "#E37400" },
    { icon: "inbox", val: pendingReview, label: "In Review", sub: "awaiting", color: "#7C3AED" },
    { icon: "video", val: upcomingMeets.length, label: "Meetings", sub: todayMeets > 0 ? `${todayMeets} today` : "upcoming", color: "#1E8E3E" },
    { icon: "users", val: groups.length, label: "Groups", sub: "active", color: "#0E7490" },
  ];

  return (
    <div className="d-root">
      <style>{`
        .d-root {
          --font: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          --mono: 'IBM Plex Mono', ui-monospace, monospace;
          font-family: var(--font);
          padding: 24px;
          max-width: 1360px;
          margin: 0 auto;
          color: #1A1D21;
        }

        /* ── Greeting ── */
        .d-greeting {
          margin-bottom: 24px;
        }
        .d-greeting h2 {
          font-size: 22px;
          font-weight: 700;
          color: #1A1D21;
          margin: 0 0 4px;
          letter-spacing: -0.03em;
        }
        .d-greeting p {
          font-size: 13px;
          color: #667085;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .d-pct-bar {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .d-pct-track {
          width: 60px; height: 4px;
          background: #E4E7EC;
          border-radius: 99px;
          overflow: hidden;
        }
        .d-pct-fill {
          height: 100%;
          background: #1A73E8;
          border-radius: 99px;
          transition: width 0.6s ease;
        }
        .d-pct-label {
          font-size: 12px;
          font-weight: 600;
          color: #1A73E8;
          font-family: var(--mono);
        }

        /* ── Stats ── */
        .d-stats {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }
        .d-stat {
          background: #fff;
          border-radius: 10px;
          padding: 16px 18px;
          border: 1px solid #E4E7EC;
          display: flex;
          align-items: center;
          gap: 14px;
          transition: box-shadow 0.15s;
        }
        .d-stat:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .d-stat-icon {
          width: 40px; height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          opacity: 0.9;
        }
        .d-stat-val {
          font-size: 22px;
          font-weight: 700;
          font-family: var(--mono);
          line-height: 1;
          letter-spacing: -0.02em;
        }
        .d-stat-label { font-size: 12px; font-weight: 600; color: #344054; margin-top: 2px; }
        .d-stat-sub { font-size: 11px; color: #98A2B3; margin-top: 1px; }

        /* ── Grid layouts ── */
        .d-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
        .d-grid-main { display: grid; grid-template-columns: 1fr 360px; gap: 16px; align-items: start; }

        /* ── Card ── */
        .d-card {
          background: #fff;
          border-radius: 10px;
          border: 1px solid #E4E7EC;
          padding: 18px 20px;
          transition: box-shadow 0.15s;
        }
        .d-card:hover { box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
        .d-card-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }
        .d-card-title {
          font-size: 14px;
          font-weight: 700;
          color: #1A1D21;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .d-card-sub { font-size: 11px; color: #98A2B3; margin-top: 2px; }
        .d-card-action {
          font-size: 12px;
          font-weight: 500;
          color: #1A73E8;
          background: none;
          border: 1px solid #E4E7EC;
          border-radius: 6px;
          padding: 5px 12px;
          cursor: pointer;
          font-family: var(--font);
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.12s;
        }
        .d-card-action:hover { background: #EBF3FE; border-color: #D3E4FD; }

        /* ── Notification rows ── */
        .d-notif-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.1s;
        }
        .d-notif-row:hover { background: #F5F7FA !important; }
        .d-notif-title {
          font-size: 13px;
          font-weight: 500;
          color: #344054;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .d-notif-body {
          font-size: 11px;
          color: #98A2B3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-top: 1px;
        }
        .d-notif-meta { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .d-notif-time { font-size: 11px; color: #98A2B3; font-family: var(--mono); }
        .d-notif-dot { width: 6px; height: 6px; border-radius: 50%; background: #1A73E8; flex-shrink: 0; }
        .d-notif-more {
          text-align: center; padding: 8px 0 0;
          font-size: 12px; color: #98A2B3;
          border-top: 1px solid #F2F4F7; margin-top: 6px;
        }
        .d-mark-read {
          font-size: 12px; color: #667085; background: none; border: none;
          cursor: pointer; font-family: var(--font); transition: color 0.12s;
        }
        .d-mark-read:hover { color: #1A73E8; }

        /* ── Task list ── */
        .d-task-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.1s;
          margin-bottom: 2px;
        }
        .d-task-item:hover { background: #F5F7FA; }
        .d-task-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .d-task-info { flex: 1; min-width: 0; }
        .d-task-name {
          font-size: 13px; font-weight: 600; color: #1A1D21;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          display: block;
        }
        .d-task-sub {
          font-size: 11px; color: #98A2B3; margin-top: 2px; display: block;
        }
        .d-task-sub b { color: #667085; font-weight: 600; }
        .d-task-id {
          font-family: var(--mono); font-size: 10px; color: #98A2B3;
          background: #F2F4F7; padding: 1px 5px; border-radius: 3px;
          margin-right: 4px;
        }
        .d-task-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .d-task-msg {
          font-size: 11px; font-weight: 700; color: #667085;
          background: #F2F4F7; padding: 1px 7px; border-radius: 99px;
        }
        .d-task-msg.unread { color: #1E8E3E; background: #E6F4EA; }
        .d-task-time { font-size: 10px; font-family: var(--mono); color: #98A2B3; }
        .d-task-time.unread { color: #1E8E3E; font-weight: 700; }
        .d-task-unread-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #1E8E3E; flex-shrink: 0;
        }
        .d-task-tags { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
        .d-tag {
          font-size: 10px; font-weight: 600; padding: 2px 8px;
          border-radius: 4px; white-space: nowrap; text-transform: capitalize;
        }
        .d-tag-red { color: #D93025; background: #FEE2E2; }

        /* ── Request card ── */
        .d-req-card {
          padding: 12px 14px;
          background: #F9FAFB;
          border-radius: 8px;
          border: 1px solid #F2F4F7;
          margin-bottom: 6px;
        }
        .d-req-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .d-req-from { font-size: 13px; font-weight: 600; color: #1E8E3E; }
        .d-req-arrow { color: #98A2B3; margin: 0 6px; font-size: 12px; }
        .d-req-task-label { font-size: 12px; color: #667085; }
        .d-req-time { font-size: 11px; color: #98A2B3; font-family: var(--mono); }
        .d-req-msg { font-size: 13px; color: #344054; margin: 0 0 8px; font-style: italic; }
        .d-req-respond {
          font-size: 12px; font-weight: 600; color: #1E8E3E;
          background: #E6F4EA; border: none; border-radius: 6px;
          padding: 6px 14px; cursor: pointer; font-family: var(--font);
          transition: all 0.12s;
        }
        .d-req-respond:hover { background: #1E8E3E; color: #fff; }
        .d-req-form { display: flex; flex-direction: column; gap: 6px; }
        .d-req-input {
          width: 100%; padding: 8px 10px; font-size: 12px; font-family: var(--font);
          border: 1px solid #E4E7EC; border-radius: 6px; resize: none; outline: none;
          color: #1A1D21; box-sizing: border-box; background: #fff;
        }
        .d-req-input:focus { border-color: #1A73E8; box-shadow: 0 0 0 2px rgba(26,115,232,0.1); }
        .d-req-btns { display: flex; gap: 6px; }
        .d-btn-green { flex: 1; padding: 7px; border: none; border-radius: 6px; background: #1E8E3E; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font); }
        .d-btn-red { flex: 1; padding: 7px; border: none; border-radius: 6px; background: #D93025; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font); }
        .d-btn-ghost { padding: 7px 14px; border: 1px solid #E4E7EC; border-radius: 6px; background: #fff; color: #667085; font-size: 12px; cursor: pointer; font-family: var(--font); }

        /* ── Quick Actions ── */
        .d-qa-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .d-qa-btn {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 16px 8px; background: #F9FAFB; border: 1px solid #F2F4F7;
          border-radius: 10px; cursor: pointer; font-family: var(--font);
          transition: all 0.15s;
        }
        .d-qa-btn:hover { background: #EBF3FE; border-color: #D3E4FD; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
        .d-qa-icon {
          width: 36px; height: 36px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
        }
        .d-qa-label { font-size: 11px; font-weight: 600; color: #344054; }

        /* ── Meeting Row ── */
        .d-meet {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 0; border-bottom: 1px solid #F2F4F7;
        }
        .d-meet:last-child { border-bottom: none; }
        .d-meet-date { text-align: center; width: 36px; flex-shrink: 0; }
        .d-meet-day { font-size: 18px; font-weight: 700; color: #1A73E8; line-height: 1; font-family: var(--mono); }
        .d-meet-mon { font-size: 9px; color: #98A2B3; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
        .d-meet-title { font-size: 13px; font-weight: 600; color: #1A1D21; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .d-meet-time { font-size: 11px; color: #98A2B3; margin-top: 2px; display: flex; align-items: center; gap: 6px; }
        .d-meet-today { font-size: 10px; font-weight: 700; color: #1E8E3E; background: #E6F4EA; padding: 1px 8px; border-radius: 4px; }
        .d-join {
          padding: 5px 14px; background: #1A73E8; color: #fff; border-radius: 6px;
          font-size: 12px; font-weight: 600; text-decoration: none; flex-shrink: 0;
          transition: background 0.12s;
        }
        .d-join:hover { background: #1557B0; }

        /* ── Empty ── */
        .d-empty { text-align: center; padding: 28px 16px; color: #98A2B3; }
        .d-empty-title { font-size: 13px; font-weight: 600; color: #667085; margin-top: 8px; }
        .d-empty-sub { font-size: 11px; margin-top: 2px; }

        /* ── Responsive ── */
        @media (max-width: 1024px) {
          .d-grid-main { grid-template-columns: 1fr; }
        }
        @media (max-width: 767px) {
          .d-root { padding: 16px; }
          .d-stats {
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            padding-bottom: 4px;
          }
          .d-stats::-webkit-scrollbar { display: none; }
          .d-stat {
            min-width: 120px;
            padding: 12px 14px;
            gap: 10px;
          }
          .d-stat-icon { width: 32px; height: 32px; border-radius: 8px; }
          .d-stat-val { font-size: 18px; }
          .d-stat-label { font-size: 11px; }
          .d-stat-sub { display: none; }
          .d-grid-2 { grid-template-columns: 1fr; }
          .d-grid-main { grid-template-columns: 1fr; }
          .d-qa-grid { grid-template-columns: repeat(2, 1fr); }
          .d-hide-m { display: none !important; }
          .d-greeting h2 { font-size: 18px; }
        }
        @media (max-width: 480px) {
          .d-stat { min-width: 110px; }
        }
      `}</style>

      {/* ── Greeting ── */}
      <div className="d-greeting">
        <h2>{greeting}, {employeeName}</h2>
        <p>
          {currentTime.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          <span className="d-pct-bar">
            <span className="d-pct-track"><span className="d-pct-fill" style={{ width: `${pct}%` }} /></span>
            <span className="d-pct-label">{pct}%</span>
          </span>
        </p>
      </div>

      {/* ── Stats ── */}
      <div className="d-stats">
        {STATS.map(s => (
          <div key={s.label} className="d-stat">
            <div className="d-stat-icon" style={{ background: `${s.color}12`, color: s.color }}>
              <I name={s.icon} size={20} color={s.color} />
            </div>
            <div>
              <div className="d-stat-val" style={{ color: s.color }}>{s.val}</div>
              <div className="d-stat-label">{s.label}</div>
              <div className="d-stat-sub">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Notifications + Requests ── */}
      <div className="d-grid-2 d-hide-m">
        <div className="d-card">
          <div className="d-card-head">
            <div className="d-card-title"><I name="bell" size={16} color="#667085" /> Notifications {unread > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#1A73E8", background: "#EBF3FE", padding: "2px 8px", borderRadius: 4 }}>{unread}</span>}</div>
            {unread > 0 && <button className="d-mark-read" onClick={markRead}>Mark all read</button>}
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {recentNotifs.length === 0
              ? <div className="d-empty"><I name="bell" size={24} color="#D0D5DD" /><div className="d-empty-title">All caught up</div></div>
              : recentNotifs.map((n, i) => <NotifRow key={n.id || i} n={n} />)}
          </div>
          {notifications.length > 5 && <div className="d-notif-more">+{notifications.length - 5} more</div>}
        </div>

        <div className="d-card">
          <div className="d-card-head">
            <div className="d-card-title"><I name="inbox" size={16} color="#1E8E3E" /> Requests {pendingRequests.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#1E8E3E", background: "#E6F4EA", padding: "2px 8px", borderRadius: 4 }}>{pendingRequests.length}</span>}</div>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {pendingRequests.length === 0
              ? <div className="d-empty"><I name="inbox" size={24} color="#D0D5DD" /><div className="d-empty-title">No pending requests</div></div>
              : pendingRequests.map(r => <RequestItem key={r.requestId} req={r} currentEmployeeId={employeeId} currentEmployeeName={employeeName} onResolve={handleRequestResolve} />)}
          </div>
        </div>
      </div>

      {/* ── Received Requests ── */}
      <ReceivedRequests employeeId={employeeId} employeeName={employeeName} />

      {/* ── Forwarded Tasks ── */}
      <div className="d-grid-2">
        <div className="d-card">
          <div className="d-card-head">
            <div><div className="d-card-title"><I name="inbox" size={16} color="#1E8E3E" /> {isCEO ? "Assigned to Me" : "Forwarded to Me"}</div><div className="d-card-sub">{incomingTasks.length} task{incomingTasks.length !== 1 ? "s" : ""}</div></div>
            <button className="d-card-action" onClick={() => router.push("/coworking/tasks")}>View all <I name="arrow" size={12} /></button>
          </div>
          {forwardedLoading ? <div style={{ textAlign: "center", padding: 20 }}><GwSpinner /></div>
            : incomingTasks.length === 0 ? <div className="d-empty"><div className="d-empty-title">No incoming tasks</div></div>
              : incomingTasks.map(t => <TaskItem key={t.taskId} task={t} onClick={goTask} showFrom />)}
        </div>
        <div className="d-card">
          <div className="d-card-head">
            <div><div className="d-card-title"><I name="forward" size={16} color="#1A73E8" /> {isCEO ? "Assigned by Me" : "Forwarded by Me"}</div><div className="d-card-sub">{outgoingTasks.length} task{outgoingTasks.length !== 1 ? "s" : ""}</div></div>
            <button className="d-card-action" onClick={() => router.push("/coworking/tasks")}>View all <I name="arrow" size={12} /></button>
          </div>
          {forwardedLoading ? <div style={{ textAlign: "center", padding: 20 }}><GwSpinner /></div>
            : outgoingTasks.length === 0 ? <div className="d-empty"><div className="d-empty-title">No outgoing tasks</div></div>
              : outgoingTasks.map(t => <TaskItem key={t.taskId} task={t} onClick={goTask} />)}
        </div>
      </div>

      {/* ── Active Tasks + Sidebar ── */}
      <div className="d-grid-main">
        <div className="d-card">
          <div className="d-card-head">
            <div><div className="d-card-title">Active Tasks</div><div className="d-card-sub">{activeTasks.length} need attention</div></div>
            <button className="d-card-action" onClick={() => router.push("/coworking/tasks")}>View all <I name="arrow" size={12} /></button>
          </div>
          {tasksLoading ? <div style={{ textAlign: "center", padding: 28 }}><GwSpinner /></div>
            : activeTasks.length === 0 ? <div className="d-empty"><I name="check" size={24} color="#34A853" /><div className="d-empty-title">All caught up!</div><div className="d-empty-sub">No active tasks right now</div></div>
              : activeTasks.map(t => <TaskItem key={t.taskId} task={{ ...t, hasUnread: unreadTaskIds.has(t.taskId) }} onClick={goTask} showFrom />)}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="d-card">
            <div className="d-card-title" style={{ marginBottom: 12 }}>Quick Actions</div>
            <div className="d-qa-grid">
              {[
                { icon: "tasks", label: "Tasks", path: "/coworking/tasks", color: "#1A73E8", bg: "#EBF3FE" },
                { icon: "chat", label: "Messages", path: "/coworking/direct-messages", color: "#7C3AED", bg: "#F3E8FF" },
                { icon: "users", label: "Groups", path: "/coworking/create-group", color: "#0E7490", bg: "#E0F7FA" },
                { icon: "video", label: "Meetings", path: "/coworking/schedule-meet", color: "#1E8E3E", bg: "#E6F4EA" },
              ].map(a => (
                <button key={a.path} onClick={() => router.push(a.path)} className="d-qa-btn">
                  <div className="d-qa-icon" style={{ background: a.bg }}><I name={a.icon} size={16} color={a.color} /></div>
                  <span className="d-qa-label">{a.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="d-card">
            <div className="d-card-head">
              <div><div className="d-card-title">Upcoming Meetings</div><div className="d-card-sub">{upcomingMeets.length === 0 ? "None" : `${upcomingMeets.length} scheduled`}</div></div>
              <button className="d-card-action" onClick={() => router.push("/coworking/schedule-meet")}>New <I name="arrow" size={12} /></button>
            </div>
            {upcomingMeets.length === 0
              ? <div className="d-empty"><I name="calendar" size={24} color="#D0D5DD" /><div className="d-empty-title">No meetings</div></div>
              : upcomingMeets.map(m => (
                <div key={m.meetId} className="d-meet">
                  <div className="d-meet-date">
                    <div className="d-meet-day">{new Date(m.dateTime).getDate()}</div>
                    <div className="d-meet-mon">{new Date(m.dateTime).toLocaleDateString("en-IN", { month: "short" })}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="d-meet-title">{m.title}</div>
                    <div className="d-meet-time">
                      {new Date(m.dateTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      {new Date(m.dateTime).toDateString() === new Date().toDateString() && <span className="d-meet-today">Today</span>}
                    </div>
                  </div>
                  {m.googleMeetLink && <a href={m.googleMeetLink} target="_blank" rel="noopener noreferrer" className="d-join">Join</a>}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}