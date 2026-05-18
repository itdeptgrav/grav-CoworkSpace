"use client";
/**
 * GRAV-CMS/app/coworking/tasks/page.js
 * ✦ REDESIGN V2 — Desktop: Tree | Chat | Details   Mobile: List → Chat+Tabs
 * ADDED: Enter to send, image lightbox, download option for attachments, message deletion (CEO only)
 * UPDATED: Tree Col-1 now groups by EMPLOYEE NAME (CEO view), then shows tasks/subtasks under each
 * FIXED: TL approve button properly integrated
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../components/coworking/layout/CoworkingShell";

import CreateTaskModal from "../../../components/coworking/tasks/CreateTaskModal";
import SelfAssignTaskModal from "../../../components/coworking/tasks/SelfAssignTaskModal";
import ForwardTaskModal from "../../../components/coworking/tasks/ForwardTaskModal";
import DailyReportModal from "../../../components/coworking/tasks/DailyReportModal";
import EditDeadlineModal from "../../../components/coworking/tasks/EditDeadlineModal";
import SubmitCompletionModal from "../../../components/coworking/tasks/SubmitCompletionModal";
import ReviewCompletionModal from "../../../components/coworking/tasks/ReviewCompletionModal";
import DeadlineBadge, { getDeadlineInfo } from "../../../components/coworking/tasks/DeadlineBadge";

import TaskActionBanner from "../../../components/coworking/tasks/TaskActionBanner";

import DeadlineBreakdown from "../../../components/coworking/tasks/DeadlineBreakdown";
import ImageLightbox from "../../../components/coworking/tasks/ImageLightbox";
import SwipeableMessage from "../../../components/coworking/tasks/SwipeableMessage";
import { ReportCard, ReportDateGroup } from "../../../components/coworking/tasks/ReportCard";
import WorkCommitModal from "../../../components/coworking/tasks/WorkCommitModal";
import {
  PRI,
  getPriDisplay,
  getAvatarColors,
  computeLiveDeadline,
  fmtLiveDeadlineDate,
  fmtLiveDeadlineDateTime,
  groupByDate,
} from "../../../lib/tasksPageHelpers";
import MediaMessageInput from "../../../components/coworking/messaging/MediaMessageInput";

// remove the inline DetailBody function from page.js
// add at the top imports:
import DetailBody from "../../../components/coworking/tasks/DetailBody";

import MessageBubble from "../../../components/coworking/messaging/MessageBubble";
import LinkedText from "../../../components/coworking/messaging/LinkedText";
import { GwAvatar, GwSpinner, GwEmpty, GwSectionLabel, GwConfirm, btnStyle } from "../../../components/coworking/shared/CoworkShared";
import { listTasks, getFullTask, getDailyReports, deleteTask } from "../../../lib/mediaUploadApi";
import ThirdPartyTask from "../../../components/coworking/tasks/ThirdPartyTask";
import GoalTask from "../../../components/coworking/tasks/GoalTask";
import { taskForwardApi } from "../../../lib/taskForwardApi";
import { getCoworkSocket } from "../../../lib/coworkSocket";
import { firebaseDb, firebaseAuth } from "../../../lib/coworkFirebase";
import { useTaskTimer, useWatchEmployeeTimers, formatTimeHMS, formatTime } from "../../../hooks/useTaskTimer";
import {
  MessageCircle,
  Plus,
  Forward,
  BarChart3,
  Calendar,
  CheckCircle
} from "lucide-react";

import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  query, orderBy, limit, onSnapshot, serverTimestamp, getDocs,
  writeBatch, where, arrayUnion, increment,
} from "firebase/firestore";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function apiFetch(path, opts = {}) {
  const u = firebaseAuth.currentUser;
  if (!u) throw new Error("Not authenticated");
  const token = await u.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...opts.headers
    }
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "Failed");
  return d;
}



// Status Constants
const STATUS = {
  open: { label: "Not Started", color: "#D97706", bg: "#FEF3C7", dot: "#D97706", glow: "rgba(217,119,6,0.3)" },
  confirmed: { label: "Confirmed", color: "#4F46E5", bg: "#EEF2FF", dot: "#4F46E5", glow: "rgba(79,70,229,0.3)" },
  in_progress: { label: "In Progress", color: "#7C3AED", bg: "#F5F3FF", dot: "#7C3AED", glow: "rgba(124,58,237,0.3)" },
  done: { label: "Done", color: "#16A34A", bg: "#F0FDF4", dot: "#16A34A", glow: "rgba(22,163,74,0.3)" },
  pending_tl_approval: { label: "Pending TL Approval", color: "#7C3AED", bg: "#F5F3FF", dot: "#7C3AED", glow: "rgba(124,58,237,0.3)" },
  pending_deadline_approval: { label: "Deadline Pending", color: "#D97706", bg: "#FFFBEB", dot: "#D97706", glow: "rgba(217,119,6,0.3)" },
  pending_employee_deadline_confirmation: { label: "Employee Confirming", color: "#7C3AED", bg: "#F5F3FF", dot: "#7C3AED", glow: "rgba(124,58,237,0.3)" },
  deadline_approved: { label: "Deadline Approved", color: "#059669", bg: "#ECFDF5", dot: "#059669", glow: "rgba(5,150,105,0.3)" },
  repeat_pending_confirmation: { label: "Awaiting Confirmation", color: "#D97706", bg: "#FEF3C7", dot: "#D97706", glow: "rgba(217,119,6,0.3)" },
  repeat_active: { label: "Active · Repeating", color: "#2563EB", bg: "#EFF6FF", dot: "#2563EB", glow: "rgba(37,99,235,0.3)" },
};

const COMP = {
  submitted: { label: "Awaiting Review", color: "#D97706", bg: "#FEF3C7", icon: "⏳" },
  tl_approved: { label: "TL Approved · CEO Review", color: "#5B5EF4", bg: "#EDEDFE", icon: "✓" },
  tl_rejected: { label: "Rejected — Revise Work", color: "#EF4444", bg: "#FEF2F2", icon: "✕" },
  tl_final_approved: { label: "Approved — Complete!", color: "#16A34A", bg: "#DCFCE7", icon: "🏆" },
  ceo_approved: { label: "Approved — Complete!", color: "#16A34A", bg: "#DCFCE7", icon: "🏆" },
  ceo_rejected: { label: "CEO Rejected", color: "#EF4444", bg: "#FEF2F2", icon: "✕" },
};

/* ─── TreeNode ─── */
function TreeNode({ node, allTaskMap, allTasks, selectedId, onSelect, expandedIds, toggleExpand, depth, viewerRole, viewerEmployeeId, unreadTaskIds, unreadCounts, lastMsgTimes }) {
  const isSelected = selectedId === node.taskId;
  const isExpanded = expandedIds.has(node.taskId);
  const dl = getDeadlineInfo(node.dueDate, node.deadlineWindowSecs || 0, 0);
  const isUnread = unreadTaskIds?.has(node.taskId);

  // CEO: hide TL-created subtasks in count/expand
  // Resolve children from allTasks array (plain React state — triggers re-render on priority change)
  // allTaskMap is a Map object — React doesn't detect Map mutations as prop changes
  // By also checking allTasks, we get fresh priority values immediately after handleUpdatePriority
  const allChildren = (node.subtaskIds || []).map(id => {
    const fromArr = allTasks?.find(t => t.taskId === id);
    const fromMap = allTaskMap.get(id);
    // Prefer allTasks entry (fresh) but fall back to map (covers nodes not in allTasks like intermediate folders)
    return fromArr || fromMap;
  }).filter(Boolean);
  const visibleChildren = (viewerRole === "ceo"
    ? allChildren.filter(c => c.createdByCeo === true || (c.assignedBy === viewerEmployeeId && c.createdByTl !== true))
    : allChildren
  ).sort((a, b) => {
    const pa = Number(a.priority ?? 5), pb = Number(b.priority ?? 5);
    if (pa !== pb) return pa - pb;
    return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
  });
  const hasChildren = visibleChildren.length > 0;

  // Use real timestamp from live chat listener — falls back to task field
  const chatTimeStr = (() => {
    // Prefer the live timestamp from Firestore chat snapshot
    let ms = lastMsgTimes?.[node.taskId] || 0;
    // Fallback to task document's lastChatAt if chat listener hasn't fired
    if (!ms && node.lastChatAt) {
      if (node.lastChatAt?.seconds) ms = node.lastChatAt.seconds * 1000;
      else if (typeof node.lastChatAt === "number") ms = node.lastChatAt;
      else if (typeof node.lastChatAt === "string") ms = new Date(node.lastChatAt).getTime();
    }
    if (!ms || isNaN(ms)) return null;
    const diffMins = Math.floor((Date.now() - ms) / 60000);
    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    const diffH = Math.floor(diffMins / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return "Yesterday";
    if (diffD < 7) return `${diffD}d`;
    return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  })();

  // TRUE unread count from live Firestore chat listener
  const unreadMsgCount = (unreadCounts?.[node.taskId]) || 0;

  return (
    <div className="gv-node-wrap">
      <div
        className={`gv-node${isSelected ? " active" : ""}`}
        style={{ paddingLeft: 10 + depth * 12 }}
        onClick={() => onSelect(node)}
      >
        {hasChildren ? (
          <button
            className={`gv-chevron${isExpanded ? " open" : ""}`}
            onClick={e => { e.stopPropagation(); toggleExpand(node.taskId); }}
            style={{ color: "var(--text-4)", flexShrink: 0 }}
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M2.5 1.5l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : <span style={{ width: 15, flexShrink: 0 }} />}

        <span className="gv-node-file-icon">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1.5" y="1.5" width="10" height="10" rx="1.8" stroke="currentColor" strokeWidth="1.1" />
            <path d="M3.5 5h6M3.5 7.5h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </span>

        <span className="gv-node-name">{node.title}</span>

        {/* Right side: unread msg count + time (WhatsApp style — only shown when unread) */}
        <span style={{ display: "flex", alignItems: "center", gap: 3, marginLeft: "auto", flexShrink: 0 }}>
          {isUnread && unreadMsgCount > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 800,
              color: "#fff",
              background: "#16A34A",
              padding: "1px 5px", borderRadius: 99,
              minWidth: 18, textAlign: "center",
            }}>
              {unreadMsgCount > 99 ? "99+" : unreadMsgCount}
            </span>
          )}
          {chatTimeStr && isUnread && (
            <span style={{
              fontSize: 8, color: "#16A34A",
              fontFamily: "var(--mono,monospace)", fontWeight: 700,
            }}>
              {chatTimeStr}
            </span>
          )}
          {!isUnread && chatTimeStr && (
            <span style={{
              fontSize: 8, color: "var(--text-4,#A8AFCC)",
              fontFamily: "var(--mono,monospace)", fontWeight: 400,
            }}>
              {chatTimeStr}
            </span>
          )}
          {/* CEO-visible subtask count */}
          {hasChildren && (
            <span className="gv-node-ct">{visibleChildren.length}</span>
          )}
          {/* Green unread dot */}
          {isUnread && (
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#16A34A", flexShrink: 0,
            }} />
          )}
          {dl.status === "overdue" && !isUnread && <span className="gv-overdue-dot" />}
        </span>
      </div>

      {isExpanded && visibleChildren.map(child => (
        <TreeNode
          key={child.taskId} node={child} allTaskMap={allTaskMap} allTasks={allTasks}
          selectedId={selectedId} onSelect={onSelect}
          expandedIds={expandedIds} toggleExpand={toggleExpand}
          depth={depth + 1}
          viewerRole={viewerRole} viewerEmployeeId={viewerEmployeeId}
          unreadTaskIds={unreadTaskIds}
          unreadCounts={unreadCounts}
          lastMsgTimes={lastMsgTimes}
        />
      ))}
    </div>
  );
}


/* ─── EmployeeGroup — Groups tasks under employee name ─── */
/* ─── EmployeeGroup — Groups tasks under employee name with complete features ─── */
function EmployeeGroup({
  empId, empName, tasks, allTaskMap, allTasks, empPicUrl, selectedId, onSelect,
  expandedIds, toggleExpand, expandedEmps, toggleEmp,
  viewerRole, viewerEmployeeId, unreadTaskIds, unreadCounts, lastMsgTimes
}) {
  const isOpen = expandedEmps.has(empId);
  const rootTasksForEmp = tasks.filter(t => !t.parentTaskId);

  // Green dot on folder if any task under this employee is unread
  const hasUnread = unreadTaskIds && rootTasksForEmp.some(t => unreadTaskIds.has(t.taskId));

  // TRUE unread message count: sum of unread counts (not total msgs ever)
  const totalUnreadMsgs = rootTasksForEmp.reduce((sum, t) => sum + (unreadCounts?.[t.taskId] || 0), 0);

  // Latest message time — use real timestamps from chat listeners
  const latestTime = (() => {
    const times = rootTasksForEmp.map(t => lastMsgTimes?.[t.taskId] || 0).filter(ms => ms > 0);
    if (!times.length) return null;
    const ms = Math.max(...times);
    const diffMins = Math.floor((Date.now() - ms) / 60000);
    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    const diffH = Math.floor(diffMins / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return "Yesterday";
    if (diffD < 7) return `${diffD}d`;
    return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  })();

  // Sort tasks: unread first, then by latest activity (WhatsApp style)
  const sortedTasks = [...rootTasksForEmp].sort((a, b) => {
    const ua = unreadCounts?.[a.taskId] || 0;
    const ub = unreadCounts?.[b.taskId] || 0;
    if (ua > 0 && ub === 0) return -1;
    if (ub > 0 && ua === 0) return 1;
    return (lastMsgTimes?.[b.taskId] || 0) - (lastMsgTimes?.[a.taskId] || 0);
  });

  return (
    <div className="gv-emp-group">
      <div className="gv-emp-header" onClick={() => toggleEmp(empId)}>
        {/* Avatar */}
        <GwAvatar name={empName} size={24} url={empPicUrl} style={{ marginRight: 4, flexShrink: 0 }} />

        {/* Folder icon */}
        <span className="gv-emp-folder-icon" style={{ marginRight: 4 }}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M1.5 4.5A1 1 0 0 1 2.5 3.5h3l1.5 2H12.5A1 1 0 0 1 13.5 6.5v5A1 1 0 0 1 12.5 12.5H2.5A1 1 0 0 1 1.5 11.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
          </svg>
        </span>

        {/* Employee name + green pulse dot */}
        <span className="gv-emp-name" style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
          {empName}
          {hasUnread && (
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#16A34A", flexShrink: 0,
              boxShadow: "0 0 0 2px rgba(16,185,129,0.3)",
              animation: "od-pulse 2s ease-in-out infinite",
              display: "inline-block",
            }} />
          )}
        </span>

        {/* TRUE unread message count badge — only shows when > 0 */}
        {totalUnreadMsgs > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 800,
            color: "#fff",
            background: "#16A34A",
            padding: "1px 6px", borderRadius: 99,
            minWidth: 18, textAlign: "center",
          }}>
            {totalUnreadMsgs > 99 ? "99+" : totalUnreadMsgs}
          </span>
        )}

        {/* Time indicator */}
        {latestTime && (
          <span style={{
            fontSize: 8,
            color: hasUnread ? "#16A34A" : "var(--text-4)",
            fontFamily: "var(--mono)",
            fontWeight: hasUnread ? 700 : 400,
            marginLeft: 2,
          }}>
            {latestTime}
          </span>
        )}

        {/* Three dots menu */}
        <span className="gv-emp-dots" onClick={e => e.stopPropagation()}>···</span>

        {/* Chevron */}
        <span className={`gv-emp-chevron${isOpen ? " open" : ""}`}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2.5 4l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>

      {/* Expanded content — sorted tasks */}
      {isOpen && (
        <div className="gv-emp-tasks">
          {sortedTasks.map(t => (
            <TreeNode
              key={t.taskId} node={t} allTaskMap={allTaskMap} allTasks={allTasks}
              selectedId={selectedId} onSelect={onSelect}
              expandedIds={expandedIds} toggleExpand={toggleExpand}
              depth={0} viewerRole={viewerRole} viewerEmployeeId={viewerEmployeeId}
              unreadTaskIds={unreadTaskIds} unreadCounts={unreadCounts}
              lastMsgTimes={lastMsgTimes}
            />
          ))}
          {sortedTasks.length === 0 && (
            <div style={{ padding: "5px 12px", fontSize: 11, color: "var(--text-4)", fontStyle: "italic" }}>
              No tasks
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Add CSS animation for pulse effect
const styles = `
@keyframes od-pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.2);
  }
}
`;

// Inject styles if not already present
if (!document.querySelector('#employee-group-styles')) {
  const styleSheet = document.createElement("style");
  styleSheet.id = 'employee-group-styles';
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}


/* ─── ReportCard ─── */
/* ─── TaskRequestsPanel ─── */
function TaskRequestsPanel({ task, employeeId, employeeName, isCEO, isTL, onNewRequest }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!task?.taskId) return;
    setLoading(true);
    let unsub;
    try {
      const ref = collection(firebaseDb, "cowork_requests");
      unsub = onSnapshot(query(ref, where("taskId", "==", task.taskId)), snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0) > 0 ? -1 : 1);
        setRequests(docs);
        setLoading(false);
      }, () => setLoading(false));
    } catch (e) {
      console.error("requests listener:", e);
      setLoading(false);
    }
    return () => { if (unsub) unsub(); };
  }, [task?.taskId]);

  const fmt = (ts) => {
    if (!ts) return "";
    const ms = ts?.seconds ? ts.seconds * 1000 : new Date(ts).getTime();
    const diff = Math.floor((Date.now() - ms) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  const statusColor = (s) => s === "approved" ? "#16A34A" : s === "rejected" ? "#B91C1C" : "#D97706";
  const statusBg = (s) => s === "approved" ? "#F0FDF4" : s === "rejected" ? "#FEF2F2" : "#FFFBEB";
  const statusLabel = (s) => s === "approved" ? "Approved" : s === "rejected" ? "Rejected" : "Pending";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header with New Request btn */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>All Requests</span>
        <button onClick={onNewRequest} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "var(--p)", color: "#fff", border: "none", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)" }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /></svg>
          New
        </button>
      </div>
      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><GwSpinner /></div>
        ) : requests.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px", textAlign: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
            </div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", margin: 0 }}>No requests yet</p>
            <p style={{ fontSize: 10, color: "var(--text-4)", marginTop: 3 }}>Tap New to send a request</p>
          </div>
        ) : requests.map(req => (
          <div key={req.id} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <GwAvatar name={req.fromName || req.senderName || "?"} size={26} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.2 }}>{req.fromName || req.senderName || "Unknown"}</div>
                  <div style={{ fontSize: 9, color: "var(--text-4)", marginTop: 1 }}>{fmt(req.createdAt)}</div>
                </div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 99, color: statusColor(req.status), background: statusBg(req.status), flexShrink: 0 }}>{statusLabel(req.status || "pending")}</span>
            </div>
            {req.message && <p style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.55, margin: 0, whiteSpace: "pre-wrap" }}>{req.message}</p>}
            {req.type && <div style={{ marginTop: 5 }}><span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 5, background: "var(--bg)", color: "var(--text-3)", border: "1px solid var(--border)", fontWeight: 600 }}>{req.type}</span></div>}
          </div>
        ))}
      </div>
    </div>
  );
}


/* ─── RepeatSubmissionsTab — per-slot submission UI for repeat tasks ─── */
function RepeatSubmissionsTab({ task, employeeId, isAssignee, isCEO, isTL }) {
  const rc = task.repeatConfig || {};
  const times = rc.deadlineTimes || (rc.deadlineTime ? [rc.deadlineTime] : ["10:00"]);
  const totalSlots = rc.timesPerDay || times.length || 1;
  const todayStr = new Date().toISOString().split("T")[0];
  const todaySubs = task.repeatSubmissions?.[todayStr] || {};

  const [slotStates, setSlotStates] = useState(() =>
    Array.from({ length: totalSlots }, () => ({ comment: "", files: [], uploading: false, submitting: false, error: "" }))
  );

  const updateSlot = (i, patch) =>
    setSlotStates(prev => prev.map((s, j) => j === i ? { ...s, ...patch } : s));

  const handleFiles = async (i, fileList) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    updateSlot(i, { uploading: true, error: "" });
    try {
      const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const { firebaseAuth } = await import("../../../lib/coworkFirebase");
      const token = await firebaseAuth.currentUser?.getIdToken();
      const uploaded = await Promise.all(files.map(async file => {
        const isImage = file.type.startsWith("image/");
        if (isImage) {
          const { uploadImage } = await import("../../../lib/mediaUploadApi");
          const r = await uploadImage(file, "cowork-repeat-submissions");
          return { name: file.name, url: r.url, type: "image", size: file.size };
        }
        // All other files → Google Drive via backend
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`${BASE}/cowork/upload/pdf`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Upload failed");
        return { name: file.name, url: d.viewUrl || d.url || d.webViewLink, downloadUrl: d.downloadUrl, fileId: d.fileId, type: "file", size: file.size, mimeType: d.mimeType };
      }));
      updateSlot(i, { files: [...slotStates[i].files, ...uploaded], uploading: false });
    } catch (e) {
      updateSlot(i, { uploading: false, error: e.message });
    }
  };

  const handleSubmit = async (i) => {
    if (slotStates[i].submitting) return;
    updateSlot(i, { submitting: true, error: "" });
    try {
      const { firebaseAuth } = await import("../../../lib/coworkFirebase");
      const token = await firebaseAuth.currentUser?.getIdToken();
      const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${BASE}/cowork/task/${task.taskId}/repeat-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date: todayStr, slotIndex: i, comment: slotStates[i].comment, files: slotStates[i].files }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Submit failed");
      updateSlot(i, { submitting: false, comment: "", files: [] });
    } catch (e) {
      updateSlot(i, { submitting: false, error: e.message });
    }
  };

  const now = new Date();
  const currentHHMM = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");

  return (
    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748B", marginBottom: 4 }}>
        Today's Submissions — {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
      </div>

      {Array.from({ length: totalSlots }, (_, i) => {
        const slotKey = `slot_${i}`;
        const existing = todaySubs[slotKey];
        const deadline = times[i] || times[times.length - 1];
        const isPast = currentHHMM > deadline;
        const ss = slotStates[i];

        return (
          <div key={i} style={{ background: existing ? "#F0FDF4" : "#F8FAFC", border: `1.5px solid ${existing ? "#86EFAC" : "#E2E8F0"}`, borderRadius: 10, padding: "12px 14px" }}>
            {/* Slot header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: existing ? "#166534" : "#374151" }}>Slot {i + 1}</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "#1D4ED8", color: "#fff" }}>{deadline}</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: existing ? "#DCFCE7" : isPast ? "#FEE2E2" : "#FEF3C7", color: existing ? "#166534" : isPast ? "#991B1B" : "#92400E" }}>
                {existing ? `✅ Submitted ${existing.submittedAt ? new Date(existing.submittedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}` : isPast ? "❌ Past deadline" : "🕐 Pending"}
              </span>
            </div>

            {/* Submitted view */}
            {existing && (
              <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.5 }}>
                {existing.comment && <p style={{ margin: "0 0 6px", color: "#1E293B" }}>{existing.comment}</p>}
                {existing.files?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {existing.files.map((f, fi) => (
                      <a key={fi} href={f.url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: "#EFF6FF", color: "#1D4ED8", textDecoration: "none", border: "0.5px solid #BFDBFE" }}>
                        📎 {f.name}
                      </a>
                    ))}
                  </div>
                )}
                {(isCEO || isTL) && <div style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>By: {existing.submittedByName}</div>}
              </div>
            )}

            {/* Submit form — employee only, not yet submitted */}
            {!existing && isAssignee && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <textarea
                  placeholder="Add a comment (optional)..."
                  value={ss.comment}
                  onChange={e => updateSlot(i, { comment: e.target.value })}
                  style={{ width: "100%", minHeight: 52, padding: "7px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", resize: "vertical", outline: "none", background: "#fff", boxSizing: "border-box" }}
                />

                {/* File list */}
                {ss.files.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {ss.files.map((f, fi) => (
                      <div key={fi} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: "#F1F5F9", color: "#374151", display: "flex", alignItems: "center", gap: 4 }}>
                        📎 {f.name}
                        <button onClick={() => updateSlot(i, { files: ss.files.filter((_, idx) => idx !== fi) })}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}

                {ss.error && <div style={{ fontSize: 11, color: "#991B1B" }}>{ss.error}</div>}

                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 6, border: "1.5px dashed #CBD5E1", cursor: "pointer", fontSize: 11, color: "#475569", background: "#fff" }}>
                    <input type="file" multiple style={{ display: "none" }} disabled={ss.uploading}
                      onChange={e => { handleFiles(i, e.target.files); e.target.value = ""; }} />
                    {ss.uploading ? "Uploading…" : "📎 Add files"}
                  </label>
                  <button
                    disabled={ss.submitting || ss.uploading}
                    onClick={() => handleSubmit(i)}
                    style={{ flex: 1, padding: "7px 12px", borderRadius: 7, border: "none", background: (ss.submitting || ss.uploading) ? "#94A3B8" : "#2563EB", color: "#fff", fontSize: 12, fontWeight: 600, cursor: (ss.submitting || ss.uploading) ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {ss.submitting ? "Submitting…" : `Submit Slot ${i + 1}`}
                  </button>
                </div>
              </div>
            )}

            {/* CEO/TL view — not yet submitted */}
            {!existing && (isCEO || isTL) && (
              <div style={{ fontSize: 11, color: "#64748B" }}>No submission yet for this slot.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── SwipeableMessage — swipe right to reply (WhatsApp-style) ─── */
/* ─── Main Page ─── */
export default function TasksPage() {
  const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isGoalView = searchParams?.get("filter") === "goal";

  // Clear selected task when switching between goal/regular view
  const prevGoalView = useRef(isGoalView);
  useEffect(() => {
    if (prevGoalView.current !== isGoalView) {
      prevGoalView.current = isGoalView;
      setSelectedTask(null);
      setChatMessages([]);
    }
  }, [isGoalView]);

  // State Variables
  const [allTasks, setAllTasks] = useState([]);
  const [allTaskMap, setAllTaskMap] = useState(new Map());
  const [tasksLoading, setTasksLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);

  // ── Drag & drop state ────────────────────────────────────────────────────
  const dragTaskIdRef = useRef(null);
  const dragOverIdRef = useRef(null);
  const [dailyReports, setDailyReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState("info");
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [activeModal, setActiveModal] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [showDeleteConf, setShowDeleteConf] = useState(false);
  const [priorityToast, setPriorityToast] = useState(null); // { label, taskTitle }

  // ── Work commit modal (shown when employee pauses timer) ─────────────────────
  const [commitModal, setCommitModal] = useState(null); // { taskId, taskTitle }
  const [commitMessage, setCommitMessage] = useState("");
  const [savingCommit, setSavingCommit] = useState(false);
  // Attachments added in the pause-timer modal — each: { name, url, downloadUrl, mimeType, size, fileId }
  const [commitAttachments, setCommitAttachments] = useState([]);
  const [commitUploading, setCommitUploading] = useState(false);
  const [commitDragging, setCommitDragging] = useState(false);
  const commitFileInputRef = useRef(null);

  // ── Draft chat + deadline flow state ─────────────────────────────────────────
  const [draftMessages, setDraftMessages] = useState([]);
  const [chatTabMode, setChatTabMode] = useState("normal"); // "draft" | "normal"

  // Re-evaluate chatTabMode whenever task status or confirmedBy changes live
  useEffect(() => {
    if (!selectedTask) return;
    const preConfirmed = ["confirmed", "in_progress", "done"].includes(selectedTask.status)
      ? false
      : (selectedTask.isRepeat || selectedTask.isThirdParty || selectedTask.isGoal)
        ? !(selectedTask.confirmedBy || []).includes(employeeId || "")
        : true;
    setChatTabMode(preConfirmed ? "draft" : "normal");
  }, [selectedTask?.taskId, selectedTask?.status, selectedTask?.confirmedBy, employeeId]);
  const [proposedDurationVal, setProposedDurationVal] = useState(""); // e.g. "4"
  const [proposedDurationUnit, setProposedDurationUnit] = useState("hours"); // hours | days | minutes
  const [proposingDeadline, setProposingDeadline] = useState(false);
  const [approvingDeadline, setApprovingDeadline] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [showExtendForm, setShowExtendForm] = useState(false);
  // TL counter-propose states
  const [counterDurationVal, setCounterDurationVal] = useState("");
  const [counterDurationUnit, setCounterDurationUnit] = useState("hours");
  const [counterMessage, setCounterMessage] = useState("");
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterBusy, setCounterBusy] = useState(false);
  // Employee respond to TL counter states
  const [respondBusy, setRespondBusy] = useState(false);
  // Employee's counter-proposal state (when disagreeing with TL's suggested date)
  const [empCounterDurationVal, setEmpCounterDurationVal] = useState("");
  const [empCounterDurationUnit, setEmpCounterDurationUnit] = useState("hours");
  const [empCounterMsg, setEmpCounterMsg] = useState("");
  const [showEmpCounterForm, setShowEmpCounterForm] = useState(false);
  // Keep legacy for backward compat
  const [rejectCounterReason, setRejectCounterReason] = useState("");
  const [showRejectCounterInput, setShowRejectCounterInput] = useState(false);

  const [requestModal, setRequestModal] = useState(null); // { taskId, taskTitle }

  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [mobileView, setMobileView] = useState("list");
  const [mobDetailPanel, setMobDetailPanel] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [deleteMsgConf, setDeleteMsgConf] = useState(null);
  const [employeeMap, setEmployeeMap] = useState(new Map());
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [expandedEmps, setExpandedEmps] = useState(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // ── List panel state (hoisted from render to fix Rules of Hooks) ──
  const [listSearch, setListSearch] = useState("");
  const [activeStatTab, setActiveStatTab] = useState("all");
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  // Group mode for list panel: "person" (default, per-assignee with drag-in-group) or "status"
  // Collapsed state for per-person groups lives inside `collapsedGroups` under keys like
  //   "person_{sectionKey}_{assigneeId}"  — by default ALL person groups start collapsed.
  const [groupByMode, setGroupByMode] = useState("flat");
  const [rowMenuOpen, setRowMenuOpen] = useState(null);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 0, y: 0 });
  const [sheetTask, setSheetTask] = useState(null); // mobile bottom sheet task
  const [rightPanel, setRightPanel] = useState(null); // "info" | "reports" | "requests" | null  -- starts hidden so chat owns the right column (matches Image-2)
  const [taskFiles, setTaskFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [extReqDate, setExtReqDate] = useState("");
  const [extReqReason, setExtReqReason] = useState("");
  const [extReqBusy, setExtReqBusy] = useState(false);
  const [showExtReqForm, setShowExtReqForm] = useState(false);
  const [reviewExtDate, setReviewExtDate] = useState("");
  const [reviewExtBusy, setReviewExtBusy] = useState(false);


  // Load all files when Files tab is opened
  useEffect(() => {
    if (rightPanel !== "files" || !selectedTask?.taskId) return;
    const loadFiles = async () => {
      setFilesLoading(true);
      const seen = new Set();
      const files = [];
      const push = (f) => { if (!f.url || seen.has(f.url)) return; seen.add(f.url); files.push(f); };
      try {
        const { collection, query, orderBy, getDocs } = await import("firebase/firestore");
        const snap = await getDocs(query(collection(firebaseDb, "cowork_tasks", selectedTask.taskId, "chat"), orderBy("createdAt", "asc")));
        snap.docs.forEach(d => {
          const msg = d.data();
          (msg.attachments || []).forEach(att => {
            if (att.url) push({ url: att.url, name: att.name || att.fileName || "File", type: att.type || "file", from: msg.senderName, date: msg.createdAt });
          });
          if (msg.mediaUrl) push({ url: msg.mediaUrl, name: msg.mediaName || "Image", type: "image", from: msg.senderName, date: msg.createdAt });
          if (msg.pdfUrl) push({ url: msg.pdfUrl, name: msg.pdfName || "Document", type: "pdf", from: msg.senderName, date: msg.createdAt });
          if (msg.fileUrl) push({ url: msg.fileUrl, name: msg.fileName || "File", type: msg.fileType || "file", from: msg.senderName, date: msg.createdAt });
        });
        (selectedTask.vendorUpdates || []).forEach(upd => {
          (upd.files || []).forEach(f => {
            if (f.url) push({ url: f.url, name: f.name || "File", type: f.type || "file", from: upd.loggedByName, date: upd.createdAt });
          });
        });
        (selectedTask.attachments || []).forEach(att => {
          if (att.url) push({ url: att.url, name: att.name || "File", type: att.type || "file", from: "Task", date: selectedTask.createdAt });
        });
        (selectedTask.completionSubmission?.files || []).forEach(f => {
          if (f.url) push({ url: f.url, name: f.name || "File", type: f.type || "file", from: selectedTask.submittedByName || "Employee", date: selectedTask.submittedAt });
        });
      } catch (e) { console.error("loadFiles:", e); }
      setTaskFiles(files);
      setFilesLoading(false);
    };
    loadFiles();
  }, [rightPanel, selectedTask?.taskId, selectedTask?.vendorUpdates?.length, selectedTask?.goalUpdates?.length]);

  // ── Filter + Export state ──
  // ── Filter + Export state ──
  const [filterDept, setFilterDept] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterDeadline, setFilterDeadline] = useState(""); // "tomorrow" | "week" | "month"
  // Image-2 top-level navigation tabs and filter pills
  const [taskSection, setTaskSection] = useState("assigned"); // "assigned" | "created" | "self"
  const [viewFilter, setViewFilter] = useState(""); // "" | "today" | "week" | "overdue" | "completed"

  const [employeeMapFull, setEmployeeMapFull] = useState(new Map());
  const [filterOpen, setFilterOpen] = useState(false);
  const [priCtxMenu, setPriCtxMenu] = useState(null); // { x, y, taskId, current }

  // ── Resizable split panel state ──
  const [sidebarWidth, setSidebarWidth] = useState(50); // percentage — task list : chat split
  const isDraggingRef = useRef(false);
  const rootRef = useRef(null);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev) => {
      if (!isDraggingRef.current || !rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSidebarWidth(Math.max(20, Math.min(70, pct)));
    };
    const onUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // Phase 2: Context menu on messages
  const [contextMenu, setContextMenu] = useState(null); // { x, y, message }
  const [replyTo, setReplyTo] = useState(null); // { messageId, text, senderName }
  const longPressTimer = useRef(null);


  // Sync toolbar with detail tab
  // Sync toolbar with detail tab
  useEffect(() => {
    if (rightPanel === "info" || rightPanel === "reports") {
      setActiveDetailTab(rightPanel);
    }
    // "requests" panel is independent — no detail tab sync needed
  }, [rightPanel]);

  // Auto-open Activity tab when a goal task is selected
  useEffect(() => {
    if (selectedTask?.isGoal) {
      setRightPanel("reports");
    }
  }, [selectedTask?.taskId, selectedTask?.isGoal]);



  // ── Phase 2: Context menu handlers ──
  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message: msg });
  };

  const handleLongPressStart = (msg) => {
    longPressTimer.current = setTimeout(() => {
      setContextMenu({ x: window.innerWidth / 2, y: Math.min(window.innerHeight * 0.5, window.innerHeight - 220), message: msg });
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [contextMenu]);

  // Close priority context menu on outside click
  useEffect(() => {
    if (!priCtxMenu) return;
    const close = (e) => {
      if (!e.target.closest(".gv-pri-ctx")) setPriCtxMenu(null);
    };
    setTimeout(() => document.addEventListener("click", close), 50);
    return () => document.removeEventListener("click", close);
  }, [priCtxMenu]);

  // Close row action menu on outside click
  // Uses "click" (not mousedown) so menu items fire before menu closes
  // setTimeout(50) prevents the opening tap from immediately closing on mobile
  useEffect(() => {
    if (!rowMenuOpen) return;
    let fn = null;
    const timer = setTimeout(() => {
      fn = () => setRowMenuOpen(null);
      document.addEventListener("click", fn);
    }, 50);
    return () => {
      clearTimeout(timer);
      if (fn) document.removeEventListener("click", fn);
    };
  }, [rowMenuOpen]);


  const [unreadTaskIds, setUnreadTaskIds] = useState(new Set());
  // Per-task unread message counts (accurate, based on live chat subcollection count)
  const [unreadCounts, setUnreadCounts] = useState({});
  // Per-task latest message timestamps (ms) — from live Firestore chat snapshots
  const [lastMsgTimes, setLastMsgTimes] = useState({});

  const messagesEndRef = useRef(null);
  const pendingMapRef = useRef(new Map());
  // Tracks when we last did a local optimistic update per taskId
  // Listener ignores Firestore updates for 4s after a local action to avoid flickering
  const ignoreLiveUntilRef = useRef({});
  // Stores { taskId -> timestamp(ms) } of when user last opened each task chat
  const lastReadAtRef = useRef({});
  const isCEO = role === "ceo";
  const isTL = role === "tl";
  const isEmployee = role === "employee";
  const canDrag = isCEO || isTL; // employees see order but cannot drag

  // Drag cross-level warning modal
  const [dragWarnModal, setDragWarnModal] = useState(null);
  // { dragId, dropOnTaskId, dragTitle, dropTitle, newParentId, isRootMove }

  // ── Task Timer (start/pause per task, one active at a time) ─────────────────
  // ── Deadline auto-pause wiring ──────────────────────────────────────────
  // The hook ticks every second while a task is running. Each tick it peeks
  // at this ref to see the approved window for the running task. The moment
  // workedSecs >= windowSecs it auto-pauses and fires onDeadlineReached.
  // Using a ref (not prop) so updating a window doesn't cause the tick
  // interval to respawn mid-count.
  const deadlineWindowsRef = useRef({});
  // Keep the ref synced whenever the tasks list (re)loads. Only tasks that
  // have an approved window contribute; everything else is skipped.
  useEffect(() => {
    const map = {};
    allTasks.forEach(t => {
      const w = Number(t.deadlineWindowSecs) || 0;
      // Only auto-pause on tasks in an "actively working" state. A pending-
      // approval or done task shouldn't trigger auto-pause even if somehow
      // the timer is running.
      if (w > 0 && ["confirmed", "in_progress", "deadline_approved"].includes(t.status)) {
        map[t.taskId] = w;
      }
    });
    deadlineWindowsRef.current = map;
  }, [allTasks]);

  // Auto-pause handler. When the tick loop detects deadline reached, it
  // calls this (before pausing). We open the work commit modal with a
  // pre-filled message so the employee can note what they got done before
  // requesting an extension.
  const handleDeadlineReached = useCallback((taskId, taskTitle, workedSecs) => {
    setCommitModal({ taskId, taskTitle, autoReason: "deadline_reached" });
    setCommitMessage("⚠️ Deadline reached. Please summarize what you accomplished before requesting an extension.");
    setCommitAttachments([]);
  }, []);

  const {
    activeTaskId: timerActiveTaskId,
    startTask: timerStart,
    pauseTask: timerPause,
    getDisplaySeconds,
    getSession: getTimerSession,
    toast: timerToast,
    sessionMap: timerSessionMap,
  } = useTaskTimer(employeeId, {
    deadlineWindowsRef,
    onDeadlineReached: handleDeadlineReached,
  });

  const handleTimerStart = useCallback(async (newTaskId, newTaskTitle) => {
    if (timerActiveTaskId && timerActiveTaskId !== newTaskId) {
      // Another task is running — show commit modal, then start new task after
      setCommitModal({ taskId: timerActiveTaskId, taskTitle: allTaskMapRef.current?.get(timerActiveTaskId)?.title || timerActiveTaskId, nextTaskId: newTaskId, nextTaskTitle: newTaskTitle });
      setCommitMessage("");
      return;
    }

    // ── Extension-start detection ──────────────────────────────────────
    // If the task has awaitingExtensionStart=true, this is the FIRST start
    // after an extension approval. We must:
    //   (1) re-anchor the session's totalSeconds so remaining = lastExtensionSecs
    //   (2) rewrite task.dueDate = now + lastExtensionSecs * 1000
    //   (3) clear awaitingExtensionStart + record extensionTimerStartedAt
    const task = allTaskMapRef.current?.get(newTaskId);
    if (task?.awaitingExtensionStart && Number(task.lastExtensionSecs) > 0) {
      const extSecs = Number(task.lastExtensionSecs);
      const windowSecs = Number(task.deadlineWindowSecs) || extSecs;
      // Anchor so that from this moment, exactly extSecs remain.
      // anchorBaseSecs = windowSecs - extSecs. (For a deadline-reached case
      // that's the old window value; for a preemptive case we forgive any
      // unused original budget — matches the product spec.)
      const anchorBaseSecs = Math.max(0, windowSecs - extSecs);
      const now = Date.now();
      const newDueDateISO = new Date(now + extSecs * 1000).toISOString();

      // Force-update deadlineWindowsRef BEFORE timerStart so auto-pause fires at correct new window
      deadlineWindowsRef.current[newTaskId] = windowSecs;

      // 1) Start the timer with the re-anchored base.
      await timerStart(newTaskId, newTaskTitle, { anchorBaseSecs });

      // 2) Update the task doc so every viewer (employee, TL, CEO) sees
      //    the new deadline immediately via their Firestore listener.
      //    firebaseDb is already imported at the top of the file (line 43)
      //    from lib/coworkFirebase, so we just use it directly — no dynamic
      //    import needed.
      try {
        const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");
        await updateDoc(doc(firebaseDb, "cowork_tasks", newTaskId), {
          awaitingExtensionStart: false,
          extensionTimerStartedAt: new Date(now).toISOString(),
          dueDate: newDueDateISO,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.error("[extension-start] failed to update task:", e.message);
      }
      return;
    }

    // Normal path — plain start/resume, no re-anchoring.
    timerStart(newTaskId, newTaskTitle);
  }, [timerActiveTaskId, timerStart]);

  const handleTimerPause = useCallback((taskId, taskTitle) => {
    setCommitModal({ taskId, taskTitle });
    setCommitMessage("");
    setCommitAttachments([]);
  }, []);

  // Upload commit-modal files to Google Drive via /cowork/upload/pdf (accepts any non-executable).
  // Shared by the <input type="file"> onChange AND the drop-zone onDrop so logic stays DRY.
  const uploadCommitFiles = useCallback(async (files) => {
    const list = Array.from(files || []).filter(f => f && (f.size > 0 || f.type));
    if (!list.length) return;
    setCommitUploading(true);
    try {
      const u = firebaseAuth.currentUser;
      if (!u) throw new Error("Not authenticated");
      const token = await u.getIdToken();
      for (const file of list) {
        if (file.size > 50 * 1024 * 1024) {
          console.warn("[commit upload] skipping — 50MB limit:", file.name);
          continue;
        }
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`${BASE}/cowork/upload/pdf`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setCommitAttachments(prev => [...prev, {
          name: data.fileName || file.name,
          url: data.viewUrl || data.url || "",
          downloadUrl: data.downloadUrl || "",
          mimeType: data.mimeType || file.type || "",
          size: Number(data.size) || file.size || 0,
          fileId: data.fileId || "",
        }]);
      }
    } catch (err) {
      console.error("[commit upload] error:", err.message);
      alert("Upload failed: " + err.message);
    } finally {
      setCommitUploading(false);
    }
  }, []);

  // Close the commit modal without saving. Disabled while a save or upload is in flight
  // so the user can't orphan a half-written commit.
  const closeCommitModal = useCallback(() => {
    if (savingCommit || commitUploading) return;
    setCommitModal(null);
    setCommitMessage("");
    setCommitAttachments([]);
    setCommitDragging(false);
  }, [savingCommit, commitUploading]);

  // Esc dismisses the commit modal (same guard as the × button).
  useEffect(() => {
    if (!commitModal) return;
    const h = (e) => { if (e.key === "Escape") closeCommitModal(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [commitModal, closeCommitModal]);

  // ── Update priority inline from detail panel ──────────────────────────────
  // ── Drag & Drop — reorder tasks by updating `order` field in Firestore ────
  const handleDragStart = useCallback((taskId) => {
    dragTaskIdRef.current = taskId;
  }, []);

  const handleDrop = useCallback(async (dropOnTaskId, explicitDragId) => {
    const dragId = explicitDragId || dragTaskIdRef.current;
    dragTaskIdRef.current = null;
    dragOverIdRef.current = null;
    if (!dragId || dragId === dropOnTaskId) return;

    const dragTask = allTaskMapRef.current.get(dragId);
    const dropTask = allTaskMapRef.current.get(dropOnTaskId);
    if (!dragTask || !dropTask) return;

    // ── Same-assignee guard ────────────────────────────────────────────────
    // In Person grouping mode the UI shows one card per assignee. Dragging a
    // task from Alice's group onto Bob's group would silently change nothing
    // visually (because each person's group is a separate ordered list) and
    // would be confusing. So reject cross-assignee drops here — the user can
    // still reassign via the detail panel.
    //
    // A task is in an "assignee group" for each ID in assigneeIds. We treat
    // the drop as valid if the two tasks share at least one common assignee,
    // OR if both are unassigned.
    const dragAssignees = new Set(dragTask.assigneeIds || []);
    const dropAssignees = new Set(dropTask.assigneeIds || []);
    const bothUnassigned = dragAssignees.size === 0 && dropAssignees.size === 0;
    const sharesAssignee = [...dragAssignees].some(a => dropAssignees.has(a));
    if (!bothUnassigned && !sharesAssignee) {
      return; // silent reject — cross-person drop
    }

    // ── SAME LEVEL vs CROSS-LEVEL ──
    const dragParent = dragTask.parentTaskId || null;
    const dropParent = dropTask.parentTaskId || null;
    const isCrossLevel = dragParent !== dropParent;

    if (isCrossLevel) {
      // Show warning modal — let user confirm before changing hierarchy
      const isRootMove = !dropParent; // dropping onto a root-level task
      setDragWarnModal({
        dragId,
        dropOnTaskId,
        dragTitle: dragTask.title || dragId,
        dropTitle: dropTask.title || dropOnTaskId,
        newParentId: dropParent,
        isRootMove,
      });
      return; // wait for user confirmation
    }

    // Same level — proceed directly
    await executeDrop(dragId, dropOnTaskId, dropParent);
  }, []);

  // ── Execute the actual reorder (called after same-level drop OR warning confirmation) ──
  const executeDrop = useCallback(async (dragId, dropOnTaskId, parentId) => {
    const dragTask = allTaskMapRef.current.get(dragId);
    const dropTask = allTaskMapRef.current.get(dropOnTaskId);
    if (!dragTask || !dropTask) return;

    // Get all siblings at this level
    const rawSiblings = [...allTaskMapRef.current.values()]
      .filter(t => (t.parentTaskId || null) === parentId);

    // Sort by current order/priority to get the real current positions
    const sorted = [...rawSiblings].sort((a, b) => {
      const ao = a.order !== undefined ? a.order : (Number(a.priority ?? 99)) * 1000;
      const bo = b.order !== undefined ? b.order : (Number(b.priority ?? 99)) * 1000;
      if (ao !== bo) return ao - bo;
      return (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0);
    });

    const dragIdx = sorted.findIndex(t => t.taskId === dragId);
    const dropIdx = sorted.findIndex(t => t.taskId === dropOnTaskId);
    if (dragIdx < 0 || dropIdx < 0) return;

    // TRUE SWAP: just exchange the two tasks' positions, everything else stays
    const reordered = [...sorted];
    reordered[dragIdx] = { ...sorted[dropIdx], parentTaskId: parentId };
    reordered[dropIdx] = { ...sorted[dragIdx], parentTaskId: parentId };

    // Reassign order + priority based on final position
    const updates = reordered.map((t, i) => ({
      taskId: t.taskId,
      order: i * 10,
      priority: i + 1,
      parentTaskId: parentId,
    }));

    // Block live listener for 8s so optimistic update isn't overwritten
    const now8 = Date.now() + 8000;
    updates.forEach(u => { ignoreLiveUntilRef.current[u.taskId] = now8; });

    // Optimistic local update
    setAllTasks(prev => {
      const map = new Map(prev.map(t => [t.taskId, t]));
      updates.forEach(u => {
        const t = map.get(u.taskId);
        if (t) map.set(u.taskId, { ...t, order: u.order, priority: u.priority, parentTaskId: u.parentTaskId });
      });
      return [...map.values()];
    });

    // Sync allTaskMapRef immediately
    updates.forEach(u => {
      const existing = allTaskMapRef.current.get(u.taskId);
      if (existing) allTaskMapRef.current.set(u.taskId, { ...existing, order: u.order, priority: u.priority, parentTaskId: u.parentTaskId });
    });

    // Persist to Firestore
    try {
      const { writeBatch: _wb, doc: _doc } = await import("firebase/firestore");
      const batch = _wb(firebaseDb);
      updates.forEach(u => batch.update(
        _doc(firebaseDb, "cowork_tasks", u.taskId),
        { order: u.order, priority: u.priority, parentTaskId: u.parentTaskId || null, updatedAt: new Date() }
      ));
      await batch.commit();
    } catch (e) { console.error("[drag] batch update:", e.message); }
  }, []);

  const handleUpdatePriority = useCallback(async (taskId, newPriority) => {
    const p = Math.max(1, Math.min(10, Number(newPriority)));
    if (!taskId || isNaN(p)) return;

    const taskTitle = allTaskMapRef.current?.get(taskId)?.title || "";
    const label = p === 1 ? "P1 — Highest" : p === 2 ? "P2 — High" : p === 10 ? "P10 — Lowest" : `P${p} — Medium`;

    // Optimistic update — change local state immediately, no reload needed
    // Also clear `order` so the priority-based sort takes effect instantly
    setAllTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, priority: p, order: undefined } : t));
    setSelectedTask(prev => prev?.taskId === taskId ? { ...prev, priority: p, order: undefined } : prev);
    // Also update allTaskMap so TblRow subtask sort sees the new priority instantly
    setAllTaskMap(prev => {
      const next = new Map(prev);
      const existing = next.get(taskId);
      if (existing) next.set(taskId, { ...existing, priority: p, order: undefined });
      return next;
    });
    if (allTaskMapRef.current?.has(taskId)) {
      allTaskMapRef.current.set(taskId, { ...allTaskMapRef.current.get(taskId), priority: p, order: undefined });
    }

    // Show top-right toast
    setPriorityToast({ label, taskTitle });
    setTimeout(() => setPriorityToast(null), 2500);

    try {
      await updateDoc(doc(firebaseDb, "cowork_tasks", taskId), {
        priority: p,
        updatedAt: new Date(),
      });
    } catch (e) {
      console.error("[priority] update error:", e.message);
      // Revert on failure
      setAllTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, priority: t.priority } : t));
    }
  }, []);

  const handleCommitSubmit = useCallback(async (skipMessage = false) => {
    if (!commitModal) return;
    const { taskId, taskTitle } = commitModal;
    setSavingCommit(true);
    try {
      const sess = timerSessionMap?.get(taskId);
      const base = sess?.totalSeconds || 0;
      const start = sess?.lastStartTime || Date.now();
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const secondsWorked = base + elapsed;
      const msg = commitMessage.trim();
      // Attachments are uploaded (Google Drive) before this handler runs via the
      // file-input handler; here we just persist the array with the commit doc.
      const attachments = (commitAttachments || []).map(a => ({
        name: a.name || "attachment",
        url: a.url || "",
        downloadUrl: a.downloadUrl || "",
        mimeType: a.mimeType || "",
        size: a.size || 0,
        fileId: a.fileId || "",
      }));

      // Write commit log to Firestore
      const { addDoc: _addDoc, collection: _col, serverTimestamp: _st } = await import("firebase/firestore");
      await _addDoc(_col(firebaseDb, "cowork_work_commits", employeeId, "logs"), {
        taskId, taskTitle: taskTitle || taskId,
        message: msg,
        secondsWorked,
        stoppedAt: _st(),
        empId: employeeId,
        empName: employeeName,
        hasMessage: !!msg,
        attachments,
        hasAttachments: attachments.length > 0,
      });
    } catch (e) {
      console.error("[commit] write error:", e.message);
    } finally {
      // Always pause regardless of commit write success
      timerPause(taskId, taskTitle);
      // If switching to another task, start it now
      const next = commitModal?.nextTaskId;
      const nextTitle = commitModal?.nextTaskTitle;
      setCommitModal(null);
      setCommitMessage("");
      setCommitAttachments([]);
      setSavingCommit(false);
      if (next) {
        setTimeout(() => timerStart(next, nextTitle), 200);
      }
    }
  }, [commitModal, commitMessage, commitAttachments, employeeId, employeeName, timerPause, timerSessionMap]);


  const handleRequestExtension = useCallback(async () => {
    if (!extReqDate || !selectedTask) return;
    setExtReqBusy(true);
    try {
      await apiFetch(`/cowork/task/${selectedTask.taskId}/request-deadline-extension`, {
        method: "POST", body: JSON.stringify({ proposedDate: extReqDate, reason: extReqReason }),
      });
      setShowExtReqForm(false); setExtReqDate(""); setExtReqReason("");
      setSelectedTask(prev => prev ? { ...prev, deadlineExtRequest: { proposedDate: extReqDate, reason: extReqReason, requestedByName: employeeName, status: "pending" } } : prev);
    } catch (e) { alert(e.message); }
    finally { setExtReqBusy(false); }
  }, [extReqDate, extReqReason, selectedTask, employeeName]);

  const handleReviewExtension = useCallback(async (action, counterDate) => {
    if (!selectedTask) return;
    setReviewExtBusy(true);
    try {
      const newDate = action === "approve" ? selectedTask.deadlineExtRequest?.proposedDate : counterDate;
      await apiFetch(`/cowork/task/${selectedTask.taskId}/review-deadline-extension`, {
        method: "POST",
        body: JSON.stringify({ action, newDate }),
      });
      setReviewExtDate("");
      setSelectedTask(prev => {
        if (!prev) return prev;
        const updatedExt = { ...prev.deadlineExtRequest, status: action === "approve" ? "approved" : action === "counter" ? "countered" : "rejected", reviewedByName: employeeName, approvedDate: action === "approve" ? newDate : undefined, counterDate: action === "counter" ? newDate : undefined };
        return { ...prev, deadlineExtRequest: updatedExt, fixedDeadline: action !== "reject" ? newDate : prev.fixedDeadline };
      });
    } catch (e) { alert(e.message); }
    finally { setReviewExtBusy(false); }
  }, [selectedTask, employeeName]);




  // ── TL counter-propose deadline ──────────────────────────────────────────────
  const handleTlCounterPropose = useCallback(async () => {
    if (!counterDurationVal || !selectedTask) return;
    setCounterBusy(true);
    const n = parseFloat(counterDurationVal);
    const ms = counterDurationUnit === "minutes" ? n * 60000 : counterDurationUnit === "days" ? n * 86400000 : n * 3600000;
    const windowSecs = Math.round(ms / 1000);
    const dt = new Date(Date.now() + ms).toISOString();
    // Optimistic: immediately show pending_employee_deadline_confirmation
    const optimistic = { status: "pending_employee_deadline_confirmation", tlCounterDeadline: dt, tlCounterWindowSecs: windowSecs, tlCounterDeadlineMessage: counterMessage.trim(), tlCounterDeadlineByName: employeeName };
    setAllTasks(prev => prev.map(t => t.taskId === selectedTask.taskId ? { ...t, ...optimistic } : t));
    setSelectedTask(prev => prev ? { ...prev, ...optimistic } : prev);
    ignoreLiveUntilRef.current[selectedTask.taskId] = Date.now() + 5000;
    setShowCounterForm(false); setCounterDurationVal(""); setCounterDurationUnit("hours"); setCounterMessage("");
    try {
      await taskForwardApi.tlCounterDeadline(selectedTask.taskId, dt, counterMessage.trim(), windowSecs);
    } catch (e) {
      console.error(e);
      // Revert on failure
      setAllTasks(prev => prev.map(t => t.taskId === selectedTask.taskId ? { ...t, status: "pending_deadline_approval", tlCounterDeadline: null } : t));
      setSelectedTask(prev => prev ? { ...prev, status: "pending_deadline_approval", tlCounterDeadline: null } : prev);
    }
    finally { setCounterBusy(false); }
  }, [counterDurationVal, counterDurationUnit, counterMessage, selectedTask, employeeName]);

  // ── Employee respond to TL counter-proposal ───────────────────────────────
  const handleRespondToCounter = useCallback(async (accepted) => {
    if (!selectedTask) return;
    setRespondBusy(true);

    if (accepted) {
      // Optimistic: immediately show deadline_approved with TL's date
      const newDue = selectedTask.tlCounterDeadline;
      const optimistic = { status: "deadline_approved", dueDate: newDue, tlCounterDeadline: null, tlCounterDeadlineMessage: null };
      ignoreLiveUntilRef.current[selectedTask.taskId] = Date.now() + 5000;
      setAllTasks(prev => prev.map(t => t.taskId === selectedTask.taskId ? { ...t, ...optimistic } : t));
      setSelectedTask(prev => prev ? { ...prev, ...optimistic } : prev);
      setShowEmpCounterForm(false);
      try {
        await taskForwardApi.respondToTlCounter(selectedTask.taskId, true, "");
      } catch (e) {
        console.error("[respond-counter]", e.message);
        // Revert
        setAllTasks(prev => prev.map(t => t.taskId === selectedTask.taskId ? { ...t, status: "pending_employee_deadline_confirmation", dueDate: selectedTask.dueDate, tlCounterDeadline: selectedTask.tlCounterDeadline } : t));
        setSelectedTask(prev => prev ? { ...prev, status: "pending_employee_deadline_confirmation" } : prev);
      }
    } else {
      // Optimistic: show pending_deadline_approval with employee's new duration
      const n = parseFloat(empCounterDurationVal) || 1;
      const ms = empCounterDurationUnit === "minutes" ? n * 60000 : empCounterDurationUnit === "days" ? n * 86400000 : n * 3600000;
      const dt = new Date(Date.now() + ms).toISOString();
      // Flip deadlineWindowSecs along with the proposal so the "X min/h requested" badge
      // shows the NEW number instantly instead of briefly rendering the old value.
      const newWindowSecs = Math.round(ms / 1000);
      const optimistic = { status: "pending_deadline_approval", proposedDeadline: dt, proposedDeadlineByName: employeeName, tlCounterDeadline: null, tlCounterWindowSecs: null, deadlineWindowSecs: newWindowSecs };
      ignoreLiveUntilRef.current[selectedTask.taskId] = Date.now() + 5000;
      setAllTasks(prev => prev.map(t => t.taskId === selectedTask.taskId ? { ...t, ...optimistic } : t));
      setSelectedTask(prev => prev ? { ...prev, ...optimistic } : prev);
      setShowEmpCounterForm(false);
      setEmpCounterDurationVal(""); setEmpCounterDurationUnit("hours"); setEmpCounterMsg("");
      try {
        await taskForwardApi.respondToTlCounter(selectedTask.taskId, false, "Employee wants a different duration");
        await taskForwardApi.proposeDeadline(selectedTask.taskId, dt, 0, newWindowSecs);
      } catch (e) { console.error("[respond-counter]", e.message); }
    }
    setRespondBusy(false);
  }, [selectedTask, empCounterDurationVal, empCounterDurationUnit, employeeName]);

  const allAssigneeIds = (isCEO || isTL)
    ? [...new Set(allTasks.flatMap(t => t.assigneeIds || []))]
    : [];

  const { activeTimers: assigneeActiveTimers, allTimers: assigneeAllTimers } = useWatchEmployeeTimers(
    allAssigneeIds,
    employeeMap
  );


  // Helper Functions
  const downloadImage = (url) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = `image_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Data Loading Functions
  const loadEmployees = useCallback(async () => {
    // Load for all roles so avatars show correctly
    setEmployeesLoading(true);
    try {
      const snap = await getDocs(collection(firebaseDb, "cowork_employees"));
      const map = new Map();
      const fullMap = new Map();
      snap.forEach(docSnap => {
        const emp = docSnap.data();
        const id = emp.employeeId || docSnap.id;
        if (id) {
          map.set(id, emp.name || "Unknown");
          fullMap.set(id, emp); // full record including department
        }
      });
      setEmployeeMap(map);
      setEmployeeMapFull(fullMap);
    } catch (e) {
      console.error("loadEmployees (Firestore):", e);
    } finally {
      setEmployeesLoading(false);
    }
  }, [role]);

  // ── Real-time unread badge system — must be defined BEFORE loadAllTasks ───────
  const chatCountListenersRef = useRef({});
  const totalMsgCountsRef = useRef({});
  const lastMsgTimesRef = useRef({});
  // Keep a ref-copy of allTaskMap so setupChatCountListeners never needs it as a dep
  const allTaskMapRef = useRef(new Map());
  const visibleTaskListRef = useRef([]); // tracks current rendered flat list for drag-drop
  const latestTaskIdRef = useRef(null); // tracks last clicked task to discard stale responses
  // ── Background chat prefetch cache ──
  const chatCacheRef = useRef({});        // taskId -> messages[]
  const prefetchingRef = useRef(new Set()); // currently prefetching

  const prefetchChat = useCallback((taskId) => {
    if (!taskId || chatCacheRef.current[taskId] || prefetchingRef.current.has(taskId)) return;
    prefetchingRef.current.add(taskId);
    const msgsRef = collection(firebaseDb, "cowork_tasks", taskId, "chat");
    const q = query(msgsRef, orderBy("createdAt", "asc"), limit(100));
    getDocs(q).then(snap => {
      chatCacheRef.current[taskId] = snap.docs.map(d => ({
        ...d.data(), id: d.id,
        createdAt: d.data().createdAt?.seconds ? new Date(d.data().createdAt.seconds * 1000).toISOString() : d.data().createdAt,
        temp: false, sending: false, error: false,
      }));
      prefetchingRef.current.delete(taskId);
    }).catch(() => prefetchingRef.current.delete(taskId));
  }, []);
  // Per-task lastReadAt timestamps loaded from Firestore (ms). Key = taskId.
  // Used as the baseline: only messages AFTER this time count as unread.
  const firestoreLastReadRef = useRef({});
  // Track if we've initialized lastRead for a given task
  const lastReadInitializedRef = useRef({});

  // Load lastReadAt from Firestore for a task (once per session)
  const loadLastReadAt = useCallback(async (taskId) => {
    if (!employeeId || lastReadInitializedRef.current[taskId]) return;
    lastReadInitializedRef.current[taskId] = true;
    try {
      const { getDoc } = await import("firebase/firestore");
      const readRef = doc(firebaseDb, "cowork_tasks", taskId, "readStatus", employeeId);
      const snap = await getDoc(readRef);
      if (snap.exists()) {
        const data = snap.data();
        let ms = 0;
        if (data.lastReadAt?.seconds) ms = data.lastReadAt.seconds * 1000;
        else if (typeof data.lastReadAt === "number") ms = data.lastReadAt;
        firestoreLastReadRef.current[taskId] = ms;
      } else {
        // Never opened before — set baseline to NOW so old messages don't flood as unread
        // We write this baseline so next time we only count truly new messages
        const writeRef = doc(firebaseDb, "cowork_tasks", taskId, "readStatus", employeeId);
        const nowMs = Date.now();
        firestoreLastReadRef.current[taskId] = nowMs;
        import("firebase/firestore").then(({ setDoc: sd, serverTimestamp: st }) => {
          sd(writeRef, { lastReadAt: st(), lastReadAtMs: nowMs }, { merge: true }).catch(() => { });
        });
      }
    } catch (e) {
      // Fallback: use current time as baseline (no old messages will show as unread)
      firestoreLastReadRef.current[taskId] = Date.now();
    }
  }, [employeeId]);

  const setupChatCountListeners = useCallback((tasks) => {
    tasks.forEach(t => {
      // Load lastReadAt from Firestore first (async, non-blocking)
      loadLastReadAt(t.taskId);

      if (chatCountListenersRef.current[t.taskId]) return;

      const msgsRef = collection(firebaseDb, "cowork_tasks", t.taskId, "chat");
      const unsub = onSnapshot(query(msgsRef, orderBy("createdAt", "asc")), snap => {
        totalMsgCountsRef.current[t.taskId] = snap.size;

        // Track latest message time
        if (snap.docs.length > 0) {
          const lastDoc = snap.docs[snap.docs.length - 1];
          const createdAt = lastDoc.data().createdAt;
          let ms = 0;
          if (createdAt?.seconds) ms = createdAt.seconds * 1000;
          else if (typeof createdAt === "number") ms = createdAt;
          else if (typeof createdAt === "string") ms = new Date(createdAt).getTime() || 0;
          if (ms > 0) {
            lastMsgTimesRef.current[t.taskId] = ms;
            setLastMsgTimes(prev => {
              if (prev[t.taskId] === ms) return prev;
              return { ...prev, [t.taskId]: ms };
            });
          }
        }

        // ✅ CORRECT unread count:
        // A message is unread if ALL of these are true:
        //   1. Not sent by me
        //   2. Not in my readBy list
        //   3. Created AFTER my lastReadAt baseline (prevents old history flooding)
        const myLastReadMs = firestoreLastReadRef.current[t.taskId] || 0;

        const unreadCount = snap.docs.filter(d => {
          const data = d.data();
          // Skip my own messages — sender never sees their own as unread
          if (data.senderId === employeeId) return false;
          // If already read (readBy contains me), not unread
          const readBy = data.readBy || [];
          if (readBy.includes(employeeId)) return false;
          // Only count messages AFTER the last time I read this chat
          // This prevents showing old messages as unread on first load
          if (myLastReadMs > 0) {
            let msgMs = 0;
            const ca = data.createdAt;
            if (ca?.seconds) msgMs = ca.seconds * 1000;
            else if (typeof ca === "number") msgMs = ca;
            else if (typeof ca === "string") msgMs = new Date(ca).getTime() || 0;
            if (msgMs <= myLastReadMs) return false;
          }
          return true;
        }).length;

        // ✅ Only update state if value actually changed
        setUnreadCounts(prev => {
          const current = prev[t.taskId] || 0;
          if (current === unreadCount) return prev;

          const next = { ...prev };
          if (unreadCount === 0) {
            delete next[t.taskId];
          } else {
            next[t.taskId] = unreadCount;
          }

          setUnreadTaskIds(prevIds => {
            const n = new Set(prevIds);
            if (unreadCount > 0) {
              n.add(t.taskId);
              let parentId = t.parentTaskId;
              while (parentId) {
                n.add(parentId);
                const parent = allTaskMapRef.current.get(parentId);
                if (!parent) break;
                parentId = parent.parentTaskId;
              }
            } else {
              n.delete(t.taskId);
            }
            return n;
          });

          return next;
        });
      }, err => console.error(`chat count listener [${t.taskId}]:`, err));

      chatCountListenersRef.current[t.taskId] = unsub;
    });
  }, [employeeId, loadLastReadAt]);


  // Tear down all chat count listeners on unmount
  useEffect(() => {
    return () => {
      Object.values(chatCountListenersRef.current).forEach(unsub => unsub());
      chatCountListenersRef.current = {};
    };
  }, []);

  const loadAllTasks = useCallback(async () => {
    if (!employeeId) return;
    setTasksLoading(true);
    try {
      let tasks = await listTasks();

      // ── Dedup by taskId (backend may return duplicates from multiple queries) ──
      const seenIds = new Set();
      tasks = tasks.filter(t => { if (seenIds.has(t.taskId)) return false; seenIds.add(t.taskId); return true; });

      // ── Visibility filter: applied for all roles as final safety net ──────────
      // The backend already filters correctly, but we re-apply here as defence-in-depth
      // to prevent any flash of wrong tasks if the backend fallback (/task/list) is used.
      if (role === "ceo") {
        // CEO sees tasks they created OR assigned to them OR self-assign tasks where CEO is approver
        tasks = tasks.filter(t => {
          const assignedToMe = (t.assigneeIds || []).includes(employeeId);
          const createdByMe = t.assignedBy === employeeId || t.createdByCeo === true || t.assignedByRole === "ceo";
          const isMyApproval = t.approverId === employeeId || (Array.isArray(t.visibleTo) && t.visibleTo.includes(employeeId));
          return assignedToMe || createdByMe || isMyApproval;
        });
      } else if (role === "employee") {
        // Employee sees:
        // 1. Tasks directly assigned to them
        // 2. Tasks they created (subtasks they assigned to others)
        // 3. Folder tasks that contain any of the above
        const taskMap = new Map(tasks.map(t => [t.taskId, t]));
        tasks = tasks.filter(t => {
          // Directly assigned to me
          if ((t.assigneeIds || []).includes(employeeId)) return true;
          // Task I created (I'm the assignedBy)
          if (t.assignedBy === employeeId) return true;
          // Folder task — show if any subtask involves me (assigned to me OR created by me)
          if (t.isFolder === true || (t.isFolder === undefined && !t.assigneeIds?.length)) {
            const subtaskIds = t.subtaskIds || [];
            return subtaskIds.some(sid => {
              const sub = taskMap.get(sid);
              return sub && ((sub.assigneeIds || []).includes(employeeId) || sub.assignedBy === employeeId);
            });
          }
          return false;
        });
      }
      // TL: no extra filter — backend already returns correct set

      // ── For EMPLOYEES: fetch folder parents up the chain ──────────────────────
      // Backend only returns directly-assigned tasks. Folder tasks (empty assigneeIds)
      // are never returned. We must fetch them separately using the parent chain.
      let allFetchedChain = []; // ALL chain items (including intermediate nodes like task1)
      if (role === "employee" && tasks.length > 0) {
        const existingIds = new Set(tasks.map(t => t.taskId));
        const missingParentIds = [...new Set(
          tasks.filter(t => t.parentTaskId && !existingIds.has(t.parentTaskId)).map(t => t.parentTaskId)
        )];
        if (missingParentIds.length) {
          try {
            const { getDoc, doc: fd } = await import("firebase/firestore");
            const alreadyFetched = new Set([...existingIds]);
            let toFetch = missingParentIds.filter(id => !alreadyFetched.has(id));
            while (toFetch.length > 0 && allFetchedChain.length < 20) {
              const docs = await Promise.all(toFetch.map(id => getDoc(fd(firebaseDb, "cowork_tasks", id))));
              const nextToFetch = [];
              docs.forEach(doc => {
                if (!doc.exists()) return;
                const t = { ...doc.data(), taskId: doc.id };
                alreadyFetched.add(t.taskId);
                if (t.isFolder !== true && !t.parentTaskId && !t.assigneeIds?.length) t.isFolder = true;
                allFetchedChain.push(t);
                if (t.parentTaskId && !alreadyFetched.has(t.parentTaskId)) {
                  nextToFetch.push(t.parentTaskId);
                  alreadyFetched.add(t.parentTaskId);
                }
              });
              toFetch = nextToFetch;
            }
            // Only add ROOT folders to allTasks to avoid duplicate standalone rows
            // Intermediate nodes (e.g. task1 under folder) go into allTaskMap ONLY
            const rootFolders = allFetchedChain.filter(t => !t.parentTaskId);
            if (rootFolders.length) tasks = [...tasks, ...rootFolders];
          } catch (e) {
            console.warn("[loadAllTasks] folder parent fetch:", e.message);
          }
        }
      }

      // Preserve any locally-set `order` values (from drag-drop) not yet synced from backend
      const existingOrderMap = new Map(allTaskMapRef.current ? [...allTaskMapRef.current.entries()].map(([id, t]) => [id, t.order]) : []);
      const tasksWithOrder = tasks.map(t => existingOrderMap.has(t.taskId) ? { ...t, order: existingOrderMap.get(t.taskId) } : t);

      setAllTasks(tasksWithOrder);
      // fullMap includes allTasks + intermediate chain nodes so TblRow can expand deep trees
      const fullMap = new Map(tasksWithOrder.map(t => [t.taskId, t]));
      allFetchedChain.forEach(t => fullMap.set(t.taskId, t));
      allTaskMapRef.current = fullMap;
      setAllTaskMap(fullMap);
      // Auto-expand folder tasks for employees so their subtasks show immediately
      const autoExpand = new Set();
      if (role === "employee") {
        tasks.forEach(t => {
          if (t.isFolder && t.subtaskIds?.length) autoExpand.add(t.taskId);
        });
      }
      setExpandedIds(autoExpand);

      // Per-task chat count listeners give 100% accurate real-time unread counts
      setupChatCountListeners(tasks);
      // Background-prefetch chats staggered so they're ready before user clicks
      const rootsForPrefetch = tasks.filter(t => !t.parentTaskId && t.status !== 'done');
      rootsForPrefetch.forEach((t, i) => {
        setTimeout(() => prefetchChat(t.taskId), 300 + i * 150);
      });

    } catch (e) {
      console.error(e);
    } finally {
      setTasksLoading(false);
    }
  }, [employeeId, role]); // setupChatCountListeners intentionally omitted — stable empty-dep callback

  // Silent refresh — only updates task data, no loading spinner or state resets
  const softRefreshTask = useCallback(async (taskId) => {
    try {
      const task = await getFullTask(taskId);
      const cached = allTaskMapRef.current?.get(taskId);
      if (cached?.isThirdParty && !task.isThirdParty) task.isThirdParty = true;
      if (cached?.thirdPartyConfig && !task.thirdPartyConfig) task.thirdPartyConfig = cached.thirdPartyConfig;
      if (cached?.isGoal && !task.isGoal) task.isGoal = true;
      if (cached?.goalConfig && !task.goalConfig) task.goalConfig = cached.goalConfig;
      setSelectedTask(prev => prev?.taskId === taskId ? { ...prev, ...task } : prev);
      setAllTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, ...task } : t));
      allTaskMapRef.current?.set(taskId, { ...(cached || {}), ...task });
    } catch (e) { console.error("softRefreshTask:", e); }
  }, []);


  const loadDetail = useCallback(async (taskId) => {
    latestTaskIdRef.current = taskId; // mark this as the latest requested task
    setDetailLoading(true);
    setDailyReports([]);
    setDraftMessages([]); // reset draft messages
    setProposedDurationVal(""); setProposedDurationUnit("hours");
    setShowRejectInput(false); setRejectReason("");
    setShowCounterForm(false); setCounterDurationVal(""); setCounterDurationUnit("hours"); setCounterMessage("");
    // ── Serve cached messages instantly ──
    if (chatCacheRef.current[taskId]?.length) {
      setChatMessages(chatCacheRef.current[taskId]);
      setDetailLoading(false);
    } else {
      setChatMessages([]);
    }
    try {
      const task = await getFullTask(taskId);
      // ── STALE RESPONSE GUARD: discard if user has since clicked a different task ──
      if (latestTaskIdRef.current !== taskId) return;
      // ── Merge isFolder from allTaskMap so old tasks without the field still work ──
      // allTaskMap has the live Firestore value; getFullTask may return undefined for isFolder
      const cached = allTaskMapRef.current?.get(taskId);
      if (cached?.isFolder && !task.isFolder) task.isFolder = true;
      // Merge isRepeat + repeatConfig from cache (same as isFolder — may not be in getFullTask response)
      if (cached?.isRepeat && !task.isRepeat) task.isRepeat = true;
      if (cached?.repeatConfig && !task.repeatConfig) task.repeatConfig = cached.repeatConfig;
      // Merge isThirdParty + thirdPartyConfig from cache
      if (cached?.isThirdParty && !task.isThirdParty) task.isThirdParty = true;
      if (cached?.thirdPartyConfig && !task.thirdPartyConfig) task.thirdPartyConfig = cached.thirdPartyConfig;
      if (cached?.isGoal && !task.isGoal) task.isGoal = true;
      if (cached?.goalConfig && !task.goalConfig) task.goalConfig = cached.goalConfig;
      if (cached?.hasTimer !== undefined && task.hasTimer === undefined) task.hasTimer = cached.hasTimer;
      if (cached?.fixedDeadline && !task.fixedDeadline) task.fixedDeadline = cached.fixedDeadline;
      setSelectedTask(task);
      // Load draft messages from task details
      if (task.draftChatMessages?.length) setDraftMessages(task.draftChatMessages);
      // Set default chat tab: draft if pre-confirmed, normal if post-confirmed
      // Repeat/third-party/goal use confirmedBy (no status workflow)

      const preConfirmed = ["confirmed", "in_progress", "done"].includes(task.status)
        ? false
        : (task.isRepeat || task.isThirdParty || task.isGoal)
          ? !(task.confirmedBy || []).includes(employeeId || "")
          : true;
      setChatTabMode(preConfirmed ? "draft" : "normal");

      // Update messages from REST only if cache was empty
      if (!chatCacheRef.current[taskId]?.length && task.chatMessages?.length) {
        setChatMessages(task.chatMessages);
      }
    } catch (e) {
      if (latestTaskIdRef.current === taskId) console.error(e);
    } finally {
      if (latestTaskIdRef.current === taskId) setDetailLoading(false);
    }
  }, [prefetchChat]);

  const loadReports = useCallback(async (taskId) => {
    setReportsLoading(true);
    try {
      setDailyReports(await getDailyReports(taskId));
    } catch {
      setDailyReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const handleHoverPrefetch = useCallback((taskId) => {
    prefetchChat(taskId);
  }, [prefetchChat]);

  const handleSelectNode = async (node) => {
    // Immediately show the task in 30% panel and open chat panel
    // Use cached data first to avoid ANY perceived wait
    setSelectedTask(allTaskMap.get(node.taskId) || node);
    setMobDetailPanel(null);
    setDetailCollapsed(false);
    setMobileView("chat");
    // Serve cached chat immediately
    if (chatCacheRef.current[node.taskId]?.length) {
      setChatMessages(chatCacheRef.current[node.taskId]);
    } else {
      setChatMessages([]);
    }
    // Load full detail in background
    loadDetail(node.taskId);

    // Expand this task and collapse all others
    setExpandedIds(new Set([node.taskId]));

    // ✅ CRITICAL FIX: Mark ALL messages in Firestore as READ immediately
    const markTaskAndSubtasksAsRead = async (taskId) => {
      try {
        // Get all messages for this task
        const msgsRef = collection(firebaseDb, "cowork_tasks", taskId, "chat");
        const snapshot = await getDocs(msgsRef);

        const nowMs = Date.now();

        // ✅ Persist lastReadAt to Firestore so unread counts are accurate across sessions
        const readStatusRef = doc(firebaseDb, "cowork_tasks", taskId, "readStatus", employeeId);
        import("firebase/firestore").then(({ setDoc: sd, serverTimestamp: st }) => {
          sd(readStatusRef, { lastReadAt: st(), lastReadAtMs: nowMs }, { merge: true }).catch(() => { });
        });
        // Update local ref immediately so listener recomputes instantly
        firestoreLastReadRef.current[taskId] = nowMs;

        if (snapshot.empty) return;

        const batch = writeBatch(firebaseDb);
        let hasUnread = false;

        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          const readBy = data.readBy || [];
          // Only mark messages NOT sent by me AND not already read by me
          if (data.senderId !== employeeId && !readBy.includes(employeeId)) {
            batch.update(docSnap.ref, {
              readBy: arrayUnion(employeeId)
            });
            hasUnread = true;
          }
        });

        if (hasUnread) {
          await batch.commit();
          console.log(`✅ Marked messages as read for task: ${taskId}`);
        }

        // Also mark subtasks
        const t = allTaskMap.get(taskId);
        if (t && t.subtaskIds && t.subtaskIds.length > 0) {
          for (const subId of t.subtaskIds) {
            await markTaskAndSubtasksAsRead(subId);
          }
        }
      } catch (err) {
        console.error("Error marking messages as read:", err);
      }
    };

    // Call the async function
    markTaskAndSubtasksAsRead(node.taskId);

    // Update lastReadAt timestamp for UI new message indicator
    lastReadAtRef.current[node.taskId] = Date.now();

    // Force immediate UI update for unread counts
    const collectIds = (taskId) => {
      const t = allTaskMap.get(taskId);
      if (!t) return [taskId];
      const childIds = (t.subtaskIds || []).flatMap(id => collectIds(id));
      return [taskId, ...childIds];
    };
    const allIdsToMark = collectIds(node.taskId);

    setUnreadTaskIds(prev => {
      const n = new Set(prev);
      allIdsToMark.forEach(id => n.delete(id));
      return n;
    });

    setUnreadCounts(prev => {
      const n = { ...prev };
      allIdsToMark.forEach(id => delete n[id]);
      return n;
    });

    // Expand parent tasks
    const expanded = new Set(expandedIds);
    expanded.add(node.taskId);
    let currentTask = node;
    while (currentTask.parentTaskId) {
      expanded.add(currentTask.parentTaskId);
      currentTask = allTaskMap.get(currentTask.parentTaskId);
      if (!currentTask) break;
    }
    setExpandedIds(expanded);
  };

  const toggleExpand = (taskId) => {
    setExpandedIds(prev => {
      const n = new Set(prev);
      if (n.has(taskId)) {
        n.delete(taskId);
      } else {
        n.add(taskId);
      }
      return n;
    });
  };

  const toggleEmp = (empId) => {
    setExpandedEmps(prev => {
      // If this employee is already expanded, collapse it
      if (prev.has(empId)) {
        const n = new Set(prev);
        n.delete(empId);
        return n;
      }
      // Otherwise, expand this employee and close all others
      return new Set([empId]);
    });
  };

  // Main Action Handler - FIXED: Added approve_tl case
  const handleAction = async (type, overrideTaskId) => {
    const tid = overrideTaskId || selectedTask?.taskId;
    if (!tid) return;
    const targetTask = allTaskMap.get(tid) || selectedTask;

    // Modal actions
    if (["add_subtask", "add_goal_task", "forward", "report", "submit_completion", "review_completion", "ceo_review", "deadline"].includes(type)) {
      setActiveModal({ type, taskId: tid, task: targetTask });
      return;
    }

    if (type === "delete") {
      setShowDeleteConf(true);
      return;
    }

    // API actions
    setActionBusy(true);
    try {
      if (type === "confirm") await apiFetch(`/cowork/task/${tid}/confirm`, { method: "POST" });
      if (type === "start") await apiFetch(`/cowork/task/${tid}/start`, { method: "POST" });
      if (type === "confirm_and_start") {
        await apiFetch(`/cowork/task/${tid}/confirm`, { method: "POST" });
        await apiFetch(`/cowork/task/${tid}/start`, { method: "POST" });
      }
      // FIXED: Added approve_tl action
      if (type === "approve_tl") await apiFetch(`/cowork/task/${tid}/approve`, { method: "POST" });
      if (type === "third_party_complete") await apiFetch(`/cowork/task/${tid}/third-party-complete`, { method: "POST" });

      await Promise.all([loadDetail(selectedTask.taskId), loadAllTasks()]);
    } catch (e) {
      alert(e.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteConfirm = async () => {
    const target = (activeModal?.type === "delete_task" ? activeModal.task : null) || selectedTask;
    if (!target) return;
    setActionBusy(true);
    try {
      await deleteTask(target.taskId);
      if (selectedTask?.taskId === target.taskId) { setSelectedTask(null); setChatMessages([]); }
      setShowDeleteConf(false);
      setActiveModal(null);
      await loadAllTasks();
      setMobileView("list");
    } catch (e) {
      alert(e.message);
    } finally {
      setActionBusy(false);
    }
  };

  // Message Functions
  const handleDeleteMessage = async (message) => {
    if (!isCEO) return;
    if (!selectedTask?.taskId) return;
    setDeleteMsgConf({ message });
  };

  // ── Duration → ISO date string helper ────────────────────────────────────
  const durationToDate = (val, unit) => {
    const n = parseFloat(val);
    if (!n || n <= 0) return null;
    const ms = unit === "minutes" ? n * 60 * 1000
      : unit === "hours" ? n * 3600 * 1000
        : unit === "days" ? n * 86400 * 1000
          : n * 3600 * 1000;
    return new Date(Date.now() + ms).toISOString();
  };

  const durationLabel = (val, unit) => {
    const n = parseFloat(val);
    if (!n) return "";
    return `${n} ${unit}`;
  };

  // ── Deadline proposal handlers ────────────────────────────────────────────
  const handleProposeDeadline = async () => {
    if (!selectedTask?.taskId || !proposedDurationVal) return;
    const proposedDate = durationToDate(proposedDurationVal, proposedDurationUnit);
    if (!proposedDate) return;
    // Compute the window in seconds from the same inputs so the optimistic UI shows the
    // NEW duration immediately (otherwise the "X min/h requested" badge keeps rendering
    // the stale deadlineWindowSecs from the previous proposal until Firestore catches up).
    const _n = parseFloat(proposedDurationVal) || 0;
    const _windowSecs = proposedDurationUnit === "minutes" ? Math.round(_n * 60)
      : proposedDurationUnit === "days" ? Math.round(_n * 86400)
        : Math.round(_n * 3600);
    setProposingDeadline(true);
    // Optimistic: show pending_deadline_approval immediately
    const optimistic = { status: "pending_deadline_approval", proposedDeadline: proposedDate, proposedDeadlineByName: employeeName, deadlineWindowSecs: _windowSecs };
    ignoreLiveUntilRef.current[selectedTask.taskId] = Date.now() + 5000;
    setAllTasks(prev => prev.map(t => t.taskId === selectedTask.taskId ? { ...t, ...optimistic } : t));
    setSelectedTask(prev => prev ? { ...prev, ...optimistic } : prev);
    try {
      const workedSecs = getDisplaySeconds(selectedTask.taskId) || 0;
      await taskForwardApi.proposeDeadline(selectedTask.taskId, proposedDate, workedSecs, _windowSecs);
    } catch (e) {
      alert(e.message);
      // Revert on failure
      setAllTasks(prev => prev.map(t => t.taskId === selectedTask.taskId ? { ...t, status: selectedTask.status, deadlineWindowSecs: selectedTask.deadlineWindowSecs } : t));
      setSelectedTask(prev => prev ? { ...prev, status: selectedTask.status, deadlineWindowSecs: selectedTask.deadlineWindowSecs } : prev);
    }
    finally { setProposingDeadline(false); }
  };

  const handleApproveDeadline = async (approved) => {
    if (!selectedTask?.taskId) return;
    if (!approved && !rejectReason.trim()) { setShowRejectInput(true); return; }
    setApprovingDeadline(true);

    if (approved) {
      // Optimistic: immediately show deadline_approved with the proposed date
      const newDue = selectedTask.proposedDeadline;
      const optimistic = { status: "deadline_approved", dueDate: newDue, proposedDeadline: null, deadlineProposalRejected: false };
      ignoreLiveUntilRef.current[selectedTask.taskId] = Date.now() + 5000;
      setAllTasks(prev => prev.map(t => t.taskId === selectedTask.taskId ? { ...t, ...optimistic } : t));
      setSelectedTask(prev => prev ? { ...prev, ...optimistic } : prev);
    } else {
      // Optimistic: back to open with rejection reason
      const optimistic = { status: "open", deadlineProposalRejected: true, deadlineRejectionReason: rejectReason.trim(), proposedDeadline: null };
      ignoreLiveUntilRef.current[selectedTask.taskId] = Date.now() + 5000;
      setAllTasks(prev => prev.map(t => t.taskId === selectedTask.taskId ? { ...t, ...optimistic } : t));
      setSelectedTask(prev => prev ? { ...prev, ...optimistic } : prev);
    }
    setShowRejectInput(false); setRejectReason("");
    try {
      await taskForwardApi.approveDeadline(selectedTask.taskId, approved, rejectReason.trim());
    } catch (e) { alert(e.message); }
    finally { setApprovingDeadline(false); }
  };

  // ── Draft chat send handler — writes directly to Firestore ─────────────────
  const handleSendDraftChat = async (text, attachments, messageType) => {
    if (!selectedTask?.taskId || !text?.trim()) return;
    const tid = selectedTask.taskId;
    const tempId = "draft_temp_" + Date.now();
    const resolvedType = messageType || "text";

    // Show optimistic temp message immediately
    setDraftMessages(prev => [...prev, {
      messageId: tempId, senderId: employeeId, senderName: employeeName,
      text, attachments: attachments || [], messageType: resolvedType,
      temp: true, createdAt: new Date().toISOString(),
    }]);

    try {
      const messageId = crypto.randomUUID();
      const draftRef = collection(firebaseDb, "cowork_tasks", tid, "draft_chat");
      await setDoc(doc(draftRef, messageId), {
        messageId, taskId: tid,
        senderId: employeeId, senderName: employeeName,
        text: text || "", attachments: attachments || [],
        messageType: resolvedType,
        createdAt: serverTimestamp(),
      });
      // Update task metadata count
      await updateDoc(doc(firebaseDb, "cowork_tasks", tid), {
        draftChatMessageCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      // Remove temp — onSnapshot will add the real message
      setDraftMessages(prev => prev.filter(m => m.messageId !== tempId));
    } catch (err) {
      console.error("draft send error:", err);
      setDraftMessages(prev => prev.map(m =>
        m.messageId === tempId ? { ...m, error: true, temp: false } : m
      ));
    }
  };

  const confirmDeleteMessage = async () => {
    if (!deleteMsgConf?.message) return;
    const message = deleteMsgConf.message;
    const taskId = selectedTask.taskId;

    try {
      const msgsRef = collection(firebaseDb, "cowork_tasks", taskId, "chat");
      const messageDoc = await import("firebase/firestore").then(fb =>
        fb.getDocs(query(msgsRef, limit(100)))
      ).then(snap => {
        const d = snap.docs.find(d => d.data().messageId === message.messageId);
        return d;
      });

      if (messageDoc) {
        await deleteDoc(messageDoc.ref);
        const taskRef = doc(firebaseDb, "cowork_tasks", taskId);
        await updateDoc(taskRef, {
          chatMessageCount: Math.max(0, (selectedTask.chatMessageCount || 1) - 1),
          updatedAt: serverTimestamp()
        });
      }
      setDeleteMsgConf(null);
    } catch (err) {
      console.error("Error deleting message:", err);
      alert("Failed to delete message");
      setDeleteMsgConf(null);
    }
  };

  const handleSendChat = async (text, attachments, messageType) => {
    if (!selectedTask) return;

    const tid = selectedTask.taskId;
    const tempId = "temp_" + Date.now();
    const resolvedType = messageType && messageType !== "text" ? messageType : attachments?.length > 0 ? (attachments[0].type || "image") : "text";
    const currentReplyTo = replyTo;
    const opt = {
      messageId: tempId,
      taskId: tid,
      senderId: employeeId,
      senderName: employeeName,
      text: text || "",
      attachments: attachments || [],
      messageType: resolvedType,
      replyTo: currentReplyTo || null,
      temp: true,
      sending: true,
      error: false,
      createdAt: new Date().toISOString()
    };
    setReplyTo(null); // clear reply after capturing
    // Add to end — will be replaced by real message from onSnapshot
    setChatMessages(prev => [...prev, opt]);
    // Scroll immediately — instant for own messages so it doesn't lag
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }), 10);

    try {
      const messageId = crypto.randomUUID();
      pendingMapRef.current.set(tempId, messageId);
      const msgsRef = collection(firebaseDb, "cowork_tasks", tid, "chat");
      const taskRef = doc(firebaseDb, "cowork_tasks", tid);

      // Strip undefined from attachments — Firestore rejects undefined values
      const cleanAttachments = (attachments || []).map(a => {
        const clean = {};
        Object.entries(a).forEach(([k, v]) => { if (v !== undefined) clean[k] = v; });
        return clean;
      });

      await setDoc(doc(msgsRef, messageId), {
        messageId,
        taskId: tid,
        senderId: employeeId,
        senderName: employeeName,
        text: text || "",
        attachments: cleanAttachments,
        messageType: resolvedType,
        replyTo: currentReplyTo || null,
        mention: null,
        readBy: [employeeId],
        createdAt: serverTimestamp()
      });

      const preview = resolvedType === "image" ? "📷 Image" : resolvedType === "pdf" ? "📄 PDF" : resolvedType === "voice" ? "🎤 Voice" : (text || "").slice(0, 60);
      await updateDoc(taskRef, {
        chatMessageCount: (selectedTask.chatMessageCount || 0) + 1,
        lastChatAt: serverTimestamp(),
        lastChatPreview: preview,
        updatedAt: serverTimestamp()
      });

      // Send notifications
      const otherAssignees = (selectedTask.assigneeIds || []).filter(id => id !== employeeId);
      if (otherAssignees.length > 0) {
        const notifCollection = collection(firebaseDb, "cowork_notifications");
        const notifBatch = writeBatch(firebaseDb);

        otherAssignees.forEach(recipientId => {
          const notifRef = doc(notifCollection);
          notifBatch.set(notifRef, {
            recipientEmployeeId: recipientId,
            type: "task_chat",
            title: `New message in "${selectedTask.title}"`,
            body: resolvedType === "image"
              ? "📷 Sent an image"
              : resolvedType === "pdf"
                ? "📄 Sent a document"
                : resolvedType === "voice"
                  ? "🎤 Sent a voice message"
                  : (text || "").slice(0, 80),
            data: {
              taskId: tid,
              taskTitle: selectedTask.title,
              senderId: employeeId,
              senderName: employeeName,
            },
            read: false,
            createdAt: serverTimestamp(),
          });
        });
        await notifBatch.commit();
      }

      setChatMessages(prev => prev.filter(m => m.messageId !== tempId));
      pendingMapRef.current.delete(tempId);
    } catch (err) {
      console.error("sendChat:", err);
      pendingMapRef.current.delete(tempId);
      setChatMessages(prev => prev.map(m => m.messageId === tempId ? { ...m, sending: false, error: true } : m));
    }
  };

  // Build Employee Groups
  const buildEmployeeGroups = () => {
    if (!isCEO && !isTL) return null;

    const groups = new Map();
    const UNASSIGNED = "__unassigned__";
    const rootTasks = allTasks.filter(t => !t.parentTaskId);

    // Helper to get a reliable ms timestamp from a Firestore-style lastChatAt
    const getMs = (lastChatAt) => {
      if (!lastChatAt) return 0;
      if (lastChatAt?.seconds) return lastChatAt.seconds * 1000;
      if (typeof lastChatAt === "number") return lastChatAt;
      if (typeof lastChatAt === "string") { const d = new Date(lastChatAt).getTime(); return isNaN(d) ? 0 : d; }
      return 0;
    };

    rootTasks.forEach(t => {
      const assigneeIds = t.assigneeIds || [];
      if (assigneeIds.length === 0) {
        if (!groups.has(UNASSIGNED)) groups.set(UNASSIGNED, { name: "Unassigned", tasks: [], latestMs: 0 });
        const g = groups.get(UNASSIGNED);
        g.tasks.push(t);
        g.latestMs = Math.max(g.latestMs, getMs(t.lastChatAt), getMs(t.updatedAt));
      } else {
        assigneeIds.forEach(aid => {
          const name = employeeMap.get(aid)
            || t.assigneeNameMap?.[aid]
            || (employeesLoading ? `Loading…` : `Employee (${aid})`);
          if (!groups.has(aid)) groups.set(aid, { name, tasks: [], latestMs: 0 });
          else if (employeeMap.get(aid) && groups.get(aid).name !== employeeMap.get(aid)) {
            groups.get(aid).name = employeeMap.get(aid);
          }
          const g = groups.get(aid);
          g.tasks.push(t);
          g.latestMs = Math.max(g.latestMs, getMs(t.lastChatAt), getMs(t.updatedAt));
        });
      }
    });

    // Sort each employee's tasks by latest activity (most recent first — WhatsApp style)
    groups.forEach(g => {
      g.tasks.sort((a, b) => {
        const aMs = Math.max(getMs(a.lastChatAt), getMs(a.updatedAt));
        const bMs = Math.max(getMs(b.lastChatAt), getMs(b.updatedAt));
        return bMs - aMs;
      });
    });

    // Sort employee groups by most recent activity at the top (WhatsApp conversation order)
    const sorted = new Map(
      [...groups.entries()].sort((a, b) => b[1].latestMs - a[1].latestMs)
    );

    return sorted;
  };

  // Effects
  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (user && employeeId && role) {
      loadAllTasks();
      loadEmployees();
    }
  }, [user, employeeId, role, loadAllTasks, loadEmployees]);

  // Auto-switch chat tab based on task status
  useEffect(() => {
    if (!selectedTask) return;
    const preConfirmed = ["confirmed", "in_progress", "done"].includes(selectedTask.status)
      ? false
      : (selectedTask.isRepeat || selectedTask.isThirdParty || selectedTask.isGoal)
        ? !(selectedTask.confirmedBy || []).includes(employeeId || "")
        : true;
    setChatTabMode(preConfirmed ? "draft" : "normal");

  }, [selectedTask?.taskId, selectedTask?.status, selectedTask?.confirmedBy]);
  useEffect(() => {
    const storedTaskId = localStorage.getItem('selectedTaskId');
    if (storedTaskId && allTasks.length > 0 && !selectedTask) {
      const taskToOpen = allTasks.find(t => t.taskId === storedTaskId);
      if (taskToOpen) {
        loadDetail(taskToOpen.taskId);
        setMobileView("chat");

        // Only expand ancestors, not the task itself
        const ancestors = new Set();
        let current = taskToOpen;
        while (current.parentTaskId) {
          ancestors.add(current.parentTaskId);
          current = allTaskMap.get(current.parentTaskId);
          if (!current) break;
        }
        setExpandedIds(ancestors);

        if ((isCEO || isTL) && taskToOpen.assigneeIds?.length > 0) {
          const empId = taskToOpen.assigneeIds[0];
          setExpandedEmps(prev => new Set([...prev, empId]));
        }
        localStorage.removeItem('selectedTaskId');
      } else {
        localStorage.removeItem('selectedTaskId');
      }
    }
  }, [allTasks, selectedTask, loadDetail, isCEO, isTL, allTaskMap]);

  // Chat listener (normal chat + draft chat — both via Firestore onSnapshot)
  useEffect(() => {
    if (!selectedTask?.taskId) return;
    const taskId = selectedTask.taskId;
    pendingMapRef.current.clear();

    // Record the time this chat was opened — messages before this are "read"
    lastReadAtRef.current[taskId] = Date.now();

    // ── Draft chat — Firestore real-time listener ───────────────────────────
    // Writes to draft_chat subcollection; both sender & receiver get live updates
    const draftRef = collection(firebaseDb, "cowork_tasks", taskId, "draft_chat");
    const draftQ = query(draftRef, orderBy("createdAt", "asc"), limit(100));
    const unsubDraft = onSnapshot(draftQ, snap => {
      const msgs = snap.docs.map(d => ({
        ...d.data(), id: d.id,
        createdAt: d.data().createdAt?.seconds
          ? new Date(d.data().createdAt.seconds * 1000).toISOString()
          : (d.data().createdAt || new Date().toISOString()),
        temp: false,
      }));
      setDraftMessages(msgs);
    }, err => console.error("draft_chat listener:", err));

    // ── Socket ──────────────────────────────────────────────────────────────
    const socket = getCoworkSocket(employeeId);

    // timer_blocked: auto-pause if backend signals timer should stop
    const timerBlockedHandler = ({ taskId: tid }) => {
      if (timerActiveTaskId === tid) {
        handleTimerPause(tid, allTaskMapRef.current?.get(tid)?.title || tid);
      }
    };
    socket.on("timer_blocked", timerBlockedHandler);
    const draftHandler = ({ taskId: tid, message }) => {
      // onSnapshot already handles this — no-op to avoid duplicates
    };
    socket.on("task_draft_chat_message", draftHandler);

    // ── LIVE task document listener — real-time cross-user sync ─────────────
    // When TL suggests a date → employee sees it instantly (no reload)
    // When employee proposes → TL sees it instantly (no reload)
    const taskDocRef = doc(firebaseDb, "cowork_tasks", taskId);
    const unsubTask = onSnapshot(taskDocRef, (snap) => {
      if (!snap.exists()) return;
      // Skip if we just did an optimistic update — prevents 2-3 second flicker
      // where listener overwrites optimistic state with stale Firestore data
      if ((ignoreLiveUntilRef.current[taskId] || 0) > Date.now()) return;
      const updated = {
        ...snap.data(),
        taskId: snap.id,
        createdAt: snap.data().createdAt?.toDate?.()?.toISOString() || snap.data().createdAt,
        updatedAt: snap.data().updatedAt?.toDate?.()?.toISOString() || snap.data().updatedAt,
        deadlineApprovedAt: snap.data().deadlineApprovedAt || null,
      };
      setSelectedTask(prev => prev?.taskId === taskId ? { ...prev, ...updated } : prev);
      setAllTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, ...updated } : t));
      setAllTaskMap(prev => { const next = new Map(prev); next.set(taskId, updated); return next; });
      allTaskMapRef.current?.set(taskId, updated);
    }, err => console.error("task doc listener:", err));

    const msgsRef = collection(firebaseDb, "cowork_tasks", taskId, "chat");
    const q = query(msgsRef, orderBy("createdAt", "asc"), limit(100));
    const unsub = onSnapshot(q, snap => {
      const incoming = snap.docs.map(d => ({
        ...d.data(), id: d.id,
        createdAt: d.data().createdAt?.seconds ? new Date(d.data().createdAt.seconds * 1000).toISOString() : d.data().createdAt,
        temp: false, sending: false, error: false,
      }));

      // ── Mark other people's messages as READ by adding our ID to readBy ──
      const unreadByMe = snap.docs.filter(d => {
        const data = d.data();
        return data.senderId !== employeeId && !(data.readBy || []).includes(employeeId);
      });
      if (unreadByMe.length > 0) {
        const batch = writeBatch(firebaseDb);
        unreadByMe.forEach(d => batch.update(d.ref, { readBy: arrayUnion(employeeId) }));
        batch.commit().catch(err => console.error("mark read:", err));
      }


      const incomingIds = new Set(incoming.map(m => m.messageId));
      setChatMessages(prev => {
        const pm = pendingMapRef.current;
        const kept = prev.filter(m => {
          if (m.temp === true) { const rid = pm.get(m.messageId); return rid ? !incomingIds.has(rid) : true; }
          if (m.error === true) return true;
          return false;
        });
        return [...incoming, ...kept].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      });
    }, err => console.error("chat listener:", err));
    return () => { unsub(); unsubDraft(); unsubTask(); pendingMapRef.current.clear(); socket.off("task_draft_chat_message", draftHandler); socket.off("timer_blocked", timerBlockedHandler); };
  }, [selectedTask?.taskId]);

  useEffect(() => {
    // Small delay to let DOM render complete before scrolling
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, 30);
    return () => clearTimeout(timer);
  }, [chatMessages]);

  // ── Real-time unread badge system ────────────────────────────────────────────
  // For each task, we keep a live Firestore chat listener that counts messages.
  // unreadCounts[taskId] = exact number of messages since user last opened that task.
  // ── Real-time listener: update allTasks timestamps & lastChatAt live ──────────
  // Only updates task metadata (title, status, lastChatAt) — NOT unread counts.
  // Unread counts are handled by setupChatCountListeners above.
  //
  // FIX: The previous listener queried ALL cowork_tasks with no visibility filter,
  // causing wrong employees to see tasks briefly on first load (flash bug).
  // Now we scope the Firestore query to ONLY tasks visible to the current user:
  //   CEO      → tasks where assignedBy === CEO (tasks they created)
  //   TL       → tasks where assignedBy === TL  OR  assigneeIds contains TL
  //   Employee → tasks where assigneeIds contains employee
  // After the snapshot fires, we apply the same role-based filter used in loadAllTasks
  // before merging into state — so stale/wrong tasks can never appear.
  useEffect(() => {
    if (!employeeId || !role) return;
    const tasksRef = collection(firebaseDb, "cowork_tasks");

    // Build a role-appropriate Firestore query so we never pull unrelated tasks
    let taskQuery;
    if (role === "ceo") {
      // CEO: tasks they created (second listener added below for assigned-to-CEO)
      taskQuery = query(tasksRef, where("assignedBy", "==", employeeId), orderBy("updatedAt", "desc"), limit(100));
    } else if (role === "tl") {
      // TL sees tasks they created (separate listener below handles assigned-to-TL)
      taskQuery = query(tasksRef, where("assignedBy", "==", employeeId), orderBy("updatedAt", "desc"), limit(100));
    } else {
      // Employee: only tasks assigned to them
      taskQuery = query(tasksRef, where("assigneeIds", "array-contains", employeeId), orderBy("updatedAt", "desc"), limit(100));
    }

    // For EMPLOYEE: also fetch folder parent tasks so they can see the folder structure
    let unsubFolderParents = null;
    if (role === "employee") {
      // After tasks load, fetch any folder parents for subtasks assigned to this employee
      const fetchFolderParents = async (assignedTasks) => {
        const parentIds = [...new Set(
          assignedTasks
            .filter(t => t.parentTaskId && !assignedTasks.find(x => x.taskId === t.parentTaskId))
            .map(t => t.parentTaskId)
        )];
        if (!parentIds.length) return;
        try {
          const { getDocs: gd, doc: fd } = await import("firebase/firestore");
          const parentDocs = await Promise.all(
            parentIds.map(id => import("firebase/firestore").then(({ getDoc, doc: d }) =>
              getDoc(d(firebaseDb, "cowork_tasks", id))
            ))
          );
          const folders = parentDocs
            .filter(d => d.exists())
            .map(d => ({ ...d.data(), taskId: d.id }))
            // Include if isFolder is true, OR if assigneeIds is empty (folder-like task)
            .filter(t => t.isFolder === true || t.isFolder === undefined && (!t.assigneeIds?.length));
          // Force isFolder: true on all matched parents
          folders.forEach(f => { f.isFolder = true; });
          if (folders.length) {
            setAllTasks(prev => {
              const map = new Map(prev.map(t => [t.taskId, t]));
              folders.forEach(f => map.set(f.taskId, f));
              const newList = [...map.values()];
              allTaskMapRef.current = new Map(newList.map(t => [t.taskId, t]));
              setAllTaskMap(new Map(newList.map(t => [t.taskId, t])));
              return newList;
            });
          }
        } catch (e) { console.warn("[FolderParents]", e.message); }
      };
      // We'll call fetchFolderParents after the main snapshot fires (below)
      window.__fetchFolderParents = fetchFolderParents;
    }

    // For CEO: also listen to tasks assigned TO the CEO (by TL etc.)
    let unsubCeoAssigned = null;
    if (role === "ceo") {
      const qAssigned = query(tasksRef, where("assigneeIds", "array-contains", employeeId), orderBy("updatedAt", "desc"), limit(100));
      unsubCeoAssigned = onSnapshot(qAssigned, snap => {
        if (snap.empty) return;
        setAllTasks(prev => {
          const map = new Map(prev.map(t => [t.taskId, t]));
          snap.docs.forEach(d => { map.set(d.id, { ...d.data(), taskId: d.id }); });
          return [...map.values()];
        });
      }, () => { });

      // Also listen to self-assign tasks where CEO is the approver
      const qApprover = query(tasksRef, where("approverId", "==", employeeId), orderBy("updatedAt", "desc"), limit(100));
      onSnapshot(qApprover, snap => {
        if (snap.empty) return;
        setAllTasks(prev => {
          const map = new Map(prev.map(t => [t.taskId, t]));
          snap.docs.forEach(d => { map.set(d.id, { ...d.data(), taskId: d.id }); });
          return [...map.values()];
        });
      }, () => { });
    }

    // Helper: apply the same visibility filter used in loadAllTasks
    const applyVisibilityFilter = (taskData) => {
      if (role === "ceo") {
        const assignedToMe = (taskData.assigneeIds || []).includes(employeeId);
        const createdByMe = taskData.assignedBy === employeeId || taskData.createdByCeo === true || taskData.assignedByRole === "ceo";
        const isMyApproval = taskData.approverId === employeeId || (Array.isArray(taskData.visibleTo) && taskData.visibleTo.includes(employeeId));
        return assignedToMe || createdByMe || isMyApproval;
      }
      return true;
    };

    const unsub = onSnapshot(
      taskQuery,
      snap => {
        if (snap.empty) return;
        const newDocs = snap.docs.map(d => ({ ...d.data(), taskId: d.id })).filter(applyVisibilityFilter);

        // Set tasks immediately so UI renders without waiting
        setAllTasks(prev => {
          const map = new Map(prev.map(t => [t.taskId, t]));
          // Keep any folder parents already fetched
          prev.filter(t => t.isFolder).forEach(f => map.set(f.taskId, f));
          newDocs.forEach(t => map.set(t.taskId, t));
          const newList = [...map.values()];
          // Build fullMap preserving ALL intermediate nodes from previous ref
          // (e.g. task1 fetched by loadAllTasks must stay in map so rootTasks filter works)
          const fullMap = new Map(newList.map(t => [t.taskId, t]));
          allTaskMapRef.current.forEach((t, id) => { if (!fullMap.has(id)) fullMap.set(id, t); });
          allTaskMapRef.current = fullMap;
          setAllTaskMap(fullMap);
          setupChatCountListeners(newList);
          return newList;
        });

        // For employees: fetch full parent chain so folder structure shows correctly
        // (subtasks may be 2+ levels deep: folder → task1 → subtask1)
        if (role === "employee") {
          const existingIds = new Set(newDocs.map(t => t.taskId));
          const initialParentIds = [...new Set(
            newDocs.filter(t => t.parentTaskId && !existingIds.has(t.parentTaskId)).map(t => t.parentTaskId)
          )];
          if (initialParentIds.length) {
            const fetchChain = async (startIds) => {
              const fetched = [];
              const alreadyFetched = new Set([...existingIds]);
              let toFetch = startIds.filter(id => !alreadyFetched.has(id));
              while (toFetch.length > 0 && fetched.length < 20) {
                const docs = await Promise.all(
                  toFetch.map(id => import("firebase/firestore").then(({ getDoc, doc: d }) =>
                    getDoc(d(firebaseDb, "cowork_tasks", id))
                  ))
                );
                const nextToFetch = [];
                docs.forEach(doc => {
                  if (!doc.exists()) return;
                  const t = { ...doc.data(), taskId: doc.id };
                  alreadyFetched.add(t.taskId);
                  if (t.isFolder !== true && !t.parentTaskId && !t.assigneeIds?.length) t.isFolder = true;
                  fetched.push(t);
                  if (t.parentTaskId && !alreadyFetched.has(t.parentTaskId)) {
                    nextToFetch.push(t.parentTaskId);
                    alreadyFetched.add(t.parentTaskId);
                  }
                });
                toFetch = nextToFetch;
              }
              return fetched;
            };
            fetchChain(initialParentIds).then(fetchedTasks => {
              if (!fetchedTasks.length) return;
              // Only root folders go into allTasks — intermediates go to allTaskMap only
              const rootFolders = fetchedTasks.filter(t => !t.parentTaskId);
              setAllTasks(prev => {
                const map = new Map(prev.map(t => [t.taskId, t]));
                rootFolders.forEach(t => map.set(t.taskId, t));
                const newList = [...map.values()];
                // fullMap has everything including intermediate nodes for tree expansion
                const fullMap = new Map(newList.map(t => [t.taskId, t]));
                fetchedTasks.forEach(t => fullMap.set(t.taskId, t));
                allTaskMapRef.current = fullMap;
                setAllTaskMap(fullMap);
                return newList;
              });
            }).catch(e => console.warn("[FolderParents]", e.message));
          }
        }
      },
      err => console.error("realtime tasks listener:", err)
    );

    // For TL: also listen to tasks assigned TO them (second query needed because Firestore
    // doesn’t support OR queries across different fields in a single listener)
    let unsubTlAssigned = null;
    if (role === "tl") {
      const tlAssignedQuery = query(
        tasksRef,
        where("assigneeIds", "array-contains", employeeId),
        orderBy("updatedAt", "desc"),
        limit(100)
      );
      unsubTlAssigned = onSnapshot(
        tlAssignedQuery,
        snap => {
          if (snap.empty) return;
          setAllTasks(prev => {
            const map = new Map(prev.map(t => [t.taskId, t]));
            snap.docs.forEach(d => {
              const updated = { ...d.data(), taskId: d.id };
              map.set(d.id, updated);
            });
            const newList = [...map.values()];
            const taskMapLocal = new Map(newList.map(t => [t.taskId, t]));
            allTaskMapRef.current = taskMapLocal;
            setAllTaskMap(taskMapLocal);
            setupChatCountListeners(newList);
            return newList;
          });
        },
        err => console.error("realtime tasks listener (TL assigned):", err)
      );
    }

    return () => {
      unsub();
      if (unsubTlAssigned) unsubTlAssigned();
      if (unsubCeoAssigned) unsubCeoAssigned();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, role]);

  useEffect(() => {
    if (activeDetailTab === "reports" && selectedTask?.taskId) loadReports(selectedTask.taskId);
  }, [activeDetailTab, selectedTask?.taskId, loadReports]);

  useEffect(() => {
    if (mobDetailPanel === "reports" && selectedTask?.taskId) loadReports(selectedTask.taskId);
  }, [mobDetailPanel, selectedTask?.taskId, loadReports]);

  if (loading || !user) return null;

  // Computed Values
  const task = selectedTask;
  const isAssignee = task?.assigneeIds?.includes(employeeId);
  const isConfirmed = task?.confirmedBy?.includes(employeeId);
  const isStarted = task?.status === "in_progress" || task?.status === "done";
  const st = task ? (STATUS[task.status] || STATUS.open) : null;
  const pri = getPriDisplay(task?.priority);
  const pct = task?.progressPercent || 0;
  const pctColor = task?.status === "done" ? "#16A34A" : pct >= 70 ? "var(--p,#5B5EF4)" : pct >= 30 ? "#F59E0B" : "#EF4444";
  const pctGradient = task?.status === "done"
    ? "linear-gradient(90deg,#22C55E,#4ADE80)"
    : pct >= 70
      ? "linear-gradient(90deg,var(--p,#5B5EF4),#818CF8)"
      : pct >= 30
        ? "linear-gradient(90deg,#F59E0B,#FBBF24)"
        : "linear-gradient(90deg,#EF4444,#F87171)";

  const grouped = groupByDate(chatMessages);
  const getModalTask = () => activeModal ? (allTaskMap.get(activeModal.taskId) || activeModal.task || task) : task;
  // Stats: root = strict !parentTaskId for ALL roles (CEO, TL, employee)
  // Subtasks always have parentTaskId — never count them in total regardless of role
  const dedupedForStats = [...new Map(allTasks.map(t => [t.taskId, t])).values()];
  const rootOnlyTasks = dedupedForStats.filter(t => !t.parentTaskId);
  const stats = {
    total: rootOnlyTasks.length,
    open: rootOnlyTasks.filter(t => ["open", "pending_deadline_approval", "pending_employee_deadline_confirmation", "deadline_approved"].includes(t.status)).length,
    active: rootOnlyTasks.filter(t => ["in_progress", "confirmed"].includes(t.status)).length,
    done: rootOnlyTasks.filter(t => t.status === "done").length,
  };

  const doExport = () => {
    const allRows = [];
    const esc = v => {
      if (v == null) return "";
      const s = String(v).trim();
      return (s.includes(",") || s.includes('"') || s.includes("\n")) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const fmtDate = d => { try { const dt = new Date(d); return isNaN(dt) ? "" : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return ""; } };
    const stLabel = s => ({ open: "Not Started", confirmed: "Confirmed", in_progress: "In Progress", done: "Done", pending_tl_approval: "Pending TL Approval" }[s] || s || "");
    const prLabel = p => ({ high: "Urgent", medium: "Normal", low: "Lowest" }[p] || p || "Normal");
    const cpLabel = s => ({ submitted: "Awaiting TL Review", tl_approved: "TL Approved", tl_rejected: "TL Rejected", ceo_approved: "CEO Approved", ceo_rejected: "CEO Rejected" }[s] || s || "");
    const addRow = (t, depth) => {
      const ids = t.assigneeIds || [];
      const names = ids.map(id => employeeMap.get(id) || t.assigneeNameMap?.[id] || id).join("; ") || "Unassigned";
      const depts = [...new Set(ids.map(id => employeeMapFull.get(id)?.department || "").filter(Boolean))].join("; ") || t.department || "";
      allRows.push([t.taskId || "", depth === 0 ? "Task" : `Subtask(L${depth})`, "  ".repeat(depth) + (t.title || ""), t.description || "", stLabel(t.status), prLabel(t.priority), names, depts, fmtDate(t.startDate), fmtDate(t.dueDate), (t.progressPercent ?? 0) + "%", cpLabel(t.completionStatus), t.createdByName || t.createdBy || "", t.parentTaskId || "", (t.subtaskIds || []).length]);
      (t.subtaskIds || []).forEach(sid => { const sub = allTaskMap.get(sid); if (sub) addRow(sub, depth + 1); });
    };
    allTasks.filter(t => !t.parentTaskId).forEach(t => addRow(t, 0));
    if (!allRows.length) { alert("No tasks to export."); return; }
    const HEADERS = ["Task ID", "Type", "Title", "Description", "Status", "Priority", "Assigned To", "Department", "Start Date", "Due Date", "Progress", "Completion Status", "Created By", "Parent Task ID", "Subtask Count"];
    const csv = [HEADERS, ...allRows].map(r => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const now = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
    const a = document.createElement("a"); a.href = url; a.download = `Tasks_Export_${now}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const employeeGroups = buildEmployeeGroups();

  // Styles
  const STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    @keyframes timerPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(0.75); } }
    @keyframes timerToastIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
    :root {
      --font: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      --mono: 'IBM Plex Mono', ui-monospace, monospace;
      --p: #4F46E5; --p-mid: #4338CA; --p-lt: #EEF2FF; --p-glow: rgba(79,70,229,0.12);
      --surface: #FFFFFF; --bg: #F3F4F6; --bg2: #E5E7EB;
      --border: #E5E7EB; --border2: #D1D5DB;
      --text-1: #111827; --text-2: #374151; --text-3: #6B7280; --text-4: #9CA3AF;
      --success: #22C55E; --warn: #F59E0B; --danger: #EF4444;
      --radius: 8px; --radius-lg: 12px;
      --ease: cubic-bezier(0.2,0,0,1); --ease2: cubic-bezier(0.4,0,0.2,1);
      --shadow-sm: 0 1px 2px rgba(26,29,46,0.05); --shadow-md: 0 2px 8px rgba(26,29,46,0.07);
      --shadow-xl: 0 8px 24px rgba(26,29,46,0.1);
      --sidebar-bg: #FAFBFF;
    }

    .gv-root { display:flex; height:100%; overflow:hidden; background:var(--bg); font-family:var(--font); position:relative; }

    /* ═══ RESIZER ═══ */
    .gv-resizer { width:4px; cursor:col-resize; background:transparent; flex-shrink:0; position:relative; z-index:10; transition:background 0.15s; }
    .gv-resizer::after { content:''; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:2px; height:32px; border-radius:2px; background:var(--border2); opacity:0; transition:opacity 0.15s; }
    .gv-resizer:hover { background:var(--p-lt); }
    .gv-resizer:hover::after { opacity:1; }
    .gv-resizer:active { background:var(--p); }

    /* ═══ COL 1 — LIST PANEL ═══ */
@keyframes chatSlideIn { from{opacity:1;transform:none} to{opacity:1;transform:none} }
.gv-list-panel { display:flex; flex-direction:column; background:var(--surface); z-index:3; overflow:hidden; border-right:1px solid var(--border); transition: none; }
.gv-chat { flex:1; min-width:200px; display:flex; flex-direction:column; background:var(--surface); overflow:hidden; position:relative; }
    .gv-lp-topbar { display:flex; align-items:center; gap:8px; padding:10px 14px; border-bottom:1px solid var(--border); flex-shrink:0; background:var(--surface); }
    .gv-lp-title { font-size:13px; font-weight:700; color:var(--text-1); flex:1; }
    .gv-search-box { display:flex; align-items:center; gap:5px; padding:5px 10px; border:1px solid var(--border); border-radius:8px; background:var(--bg); transition:all 0.15s; flex:1; max-width:220px; }
    .gv-search-box:focus-within { border-color:var(--p); background:#fff; box-shadow:0 0 0 2px var(--p-glow); }
    .gv-search-box input { border:none; background:none; outline:none; font-size:11px; color:var(--text-1); font-family:var(--font); width:100%; }
    .gv-search-box input::placeholder { color:var(--text-4); }

    .gv-new-btn { display:flex; align-items:center; gap:4px; padding:5px 12px; border-radius:8px; background:var(--p); color:#fff; font-size:11px; font-weight:600; border:none; cursor:pointer; font-family:var(--font); transition:all 0.15s; white-space:nowrap; box-shadow:0 1px 4px var(--p-glow); }
    .gv-new-btn:hover { background:var(--p-mid); transform:translateY(-1px); }
    .gv-back-btn { display:flex; align-items:center; gap:4px; padding:4px 8px; border-radius:6px; border:1px solid var(--border); background:var(--surface); cursor:pointer; font-family:var(--font); font-size:11px; font-weight:600; color:var(--text-2); transition:all 0.13s; flex-shrink:0; }
    .gv-back-btn:hover { background:var(--p-lt); border-color:var(--p); color:var(--p); }

    /* Stats tabs */
    .gv-stats { display:flex; gap:0; border-bottom:1px solid var(--border); flex-shrink:0; background:var(--surface); padding:0 8px; }
    .gv-stat { display:flex; align-items:center; gap:4px; padding:7px 12px; cursor:pointer; transition:all 0.12s; border-bottom:2px solid transparent; flex:1; justify-content:center; }
    .gv-stat:hover { background:var(--bg); }
    .gv-stat.active-tab { border-bottom-color:var(--p); }
    .gv-stat.active-tab .gv-stat-n { color:var(--p); }
    .gv-stat.active-tab .gv-stat-l { color:var(--p); font-weight:700; }
    .gv-stat-n { font-size:12px; font-weight:700; line-height:1; font-family:var(--mono); color:var(--text-1); }
    .gv-stat-l { font-size:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-4); }

    .gv-list-body { flex:1; overflow-y:auto; overflow-x:visible; }
    .gv-list-body::-webkit-scrollbar { width:3px; }
    .gv-list-body::-webkit-scrollbar-thumb { background:var(--border2); border-radius:3px; }

    /* ── Table — Task.Co clean style ── */
    .gv-tbl-group { }
    .gv-grp-header { display:flex; align-items:center; gap:6px; padding:7px 14px; border-bottom:1px solid var(--border); cursor:pointer; user-select:none; background:var(--surface); position:sticky; top:0; z-index:5; }
    .gv-grp-header:hover { background:#FAFBFF; }
    .gv-grp-badge { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:99px; font-size:10px; font-weight:700; }
    .gv-grp-count { font-size:10px; font-weight:700; padding:1px 7px; border-radius:99px; background:var(--bg2); color:var(--text-3); }

    .gv-tbl-head { display:flex; align-items:center; padding:0 6px; height:30px; background:#F7F8FC; border-bottom:1px solid var(--border); font-size:10px; font-weight:700; color:var(--text-4); text-transform:uppercase; letter-spacing:0.05em; position:sticky; top:34px; z-index:4; }
    .gv-tbl-head .col-name    { flex:2; min-width:0; padding:0 10px; border-right:1px solid var(--border); }
    .gv-tbl-head .col-timer   { width:62px; flex-shrink:0; border-right:1px solid var(--border); padding:0 6px; }
    .gv-tbl-row .col-timer    { width:62px; flex-shrink:0; border-right:1px solid var(--border); padding:0 6px; display:flex; align-items:center; justify-content:center; }
    .gv-tbl-head .col-desc    { flex:2.5; min-width:0; padding:0 10px; border-right:1px solid var(--border); }
    .gv-tbl-head .col-people  { width:90px; padding:0 10px; flex-shrink:0; border-right:1px solid var(--border); }
    .gv-tbl-head .col-pri     { width:88px; padding:0 10px; flex-shrink:0; border-right:1px solid var(--border); }
    .gv-tbl-head .col-date    { width:116px; padding:0 10px; flex-shrink:0; border-right:1px solid var(--border); }
    .gv-tbl-head .col-status  { width:108px; padding:0 10px; flex-shrink:0; }
    .gv-tbl-head .col-act     { width:30px; flex-shrink:0; }

    .gv-tbl-row { display:flex; align-items:flex-start; padding:6px 6px; min-height:40px; border-bottom:1px solid #F3F4F8; cursor:pointer; transition:background 0.08s; background:var(--surface); overflow:visible; }
    .gv-tbl-row:hover { background:#F7F8FC; }
    .gv-tbl-row.selected { background:var(--p-lt); }
    .gv-tbl-row.subtask-row { background:#FAFBFF; }
    .gv-tbl-row.subtask-row:hover { background:#F0F2FA; }
    .gv-tbl-drag { width:18px; display:flex; align-items:center; justify-content:center; color:#94A3B8; flex-shrink:0; opacity:0.4; transition:opacity 0.15s, color 0.15s; cursor:grab; border-radius:4px; }
    .gv-tbl-row .gv-tbl-drag { opacity: 0.3; } .gv-tbl-row:hover .gv-tbl-drag { opacity:1; color:#4F46E5; background:rgba(79,70,229,0.08); }
    .gv-dragging { opacity:0.3 !important; }
    .gv-drag-over { box-shadow:inset 0 2px 0 0 #4F46E5 !important; background:rgba(79,70,229,0.05) !important; }
    .gv-tbl-row.gv-dragging { opacity:0.4 !important; background:#EEF2FF !important; }
    .gv-tbl-row.gv-drag-over { background:#EEF2FF !important; border-top:2px solid #4F46E5 !important; position:relative; }
    .gv-tbl-row.gv-drag-over::before { content:""; position:absolute; left:8px; right:8px; top:-1px; height:2px; background:#4F46E5; border-radius:99px; pointer-events:none; }
    .gv-tbl-row.gv-drag-over .gv-tbl-drag { opacity:1; color:#4F46E5; }
    .gv-tbl-check { width:22px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .gv-tbl-expand { width:16px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .gv-tbl-row .col-name  { flex:2; min-width:0; padding:4px 10px; display:flex; align-items:flex-start; gap:4px; border-right:1px solid var(--border); min-height:28px; }
    .gv-tbl-row .col-desc  { flex:2.5; min-width:0; padding:4px 10px; border-right:1px solid var(--border); }
    .gv-tbl-row .col-people { width:90px; padding:0 10px; flex-shrink:0; border-right:1px solid var(--border); overflow:visible; }
    .gv-tbl-row .col-pri   { width:88px; padding:0 10px; flex-shrink:0; border-right:1px solid var(--border); }
    .gv-tbl-row .col-date  { width:116px; padding:0 10px; flex-shrink:0; border-right:1px solid var(--border); }
    .gv-tbl-row .col-status { width:108px; padding:0 10px; flex-shrink:0; }
    .gv-tbl-row .col-act   { width:30px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
    .gv-task-name { font-size:12px; font-weight:500; color:var(--text-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .gv-task-name.done-line { text-decoration:line-through; color:var(--text-4); font-weight:400; }
    .gv-task-desc { font-size:11px; color:var(--text-4); white-space:pre-wrap; word-break:break-word; line-height:1.5; }

    .gv-avatar-stack { display:flex; position:relative; overflow:visible; }
    .gv-avatar-stack-tip { display:none; position:fixed; background:#1A1D2E; color:#fff; border-radius:8px; padding:6px 10px; font-size:10px; white-space:nowrap; z-index:9999; box-shadow:0 4px 16px rgba(0,0,0,0.3); pointer-events:none; margin-top:-90px; }
    .gv-avatar-stack:hover .gv-avatar-stack-tip { display:block; position:absolute; bottom:calc(100% + 6px); left:0; z-index:9999; margin-top:0; }

    .gv-compact-grp-head { padding:5px 12px; font-size:9px; font-weight:700; color:var(--text-4); text-transform:uppercase; letter-spacing:0.07em; background:var(--surface); border-bottom:1px solid var(--border); display:flex; align-items:center; gap:4px; }
    .gv-compact-item { display:flex; align-items:center; gap:6px; padding:8px 12px; border-bottom:1px solid #F3F4F8; cursor:pointer; transition:all 0.08s; }
    .gv-compact-item:hover { background:#F0F2FA; }
    .gv-compact-item.active { background:var(--p-lt); border-left:2px solid var(--p); }
    .gv-compact-item-name { font-size:11px; font-weight:500; color:var(--text-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
    .gv-compact-item.active .gv-compact-item-name { color:var(--p); font-weight:600; }

    .gv-row-menu { position:fixed; z-index:2000; background:#fff; border:1px solid #E5E7EB; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.12); min-width:180px; padding:4px; animation:ctx-in 0.12s ease; }
    .gv-row-menu-sheet-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:1999; }
    .gv-row-menu-sheet { display:none; position:fixed; bottom:0; left:0; right:0; background:#fff; border-radius:18px 18px 0 0; z-index:2000; padding:12px 0 max(16px,env(safe-area-inset-bottom)); box-shadow:0 -4px 24px rgba(0,0,0,0.15); animation:sheet-up 0.22s cubic-bezier(0.4,0,0.2,1); }
    @keyframes sheet-up { from{transform:translateY(100%)} to{transform:translateY(0)} }
    .gv-row-menu-sheet-handle { width:36px; height:4px; background:#D1D5DB; border-radius:2px; margin:0 auto 12px; }
    .gv-row-menu-sheet-title { font-size:11px; font-weight:700; color:#9CA3AF; text-transform:uppercase; letter-spacing:0.06em; padding:0 16px 10px; }
    .gv-row-menu-sheet-item { display:flex; align-items:center; gap:12px; width:100%; padding:13px 18px; border:none; background:none; cursor:pointer; font-size:15px; font-weight:500; color:#111827; text-align:left; font-family:inherit; }
    .gv-row-menu-sheet-item:active { background:#F9FAFB; }
    .gv-row-menu-sheet-item.danger { color:#DC2626; }
    .gv-row-menu-sheet-sep { height:1px; background:#F3F4F6; margin:4px 0; }
    @media (max-width:767px) {
      .gv-row-menu { display:none !important; }
      .gv-row-menu-sheet-overlay { display:block; }
      .gv-row-menu-sheet { display:block; }
    }

    .gv-sidebar-toggle { position:absolute; left:0; top:50%; transform:translateY(-50%); width:16px; height:36px; background:var(--surface); border:1px solid var(--border); border-left:none; border-radius:0 6px 6px 0; cursor:pointer; z-index:4; display:flex; align-items:center; justify-content:center; color:var(--text-4); transition:all 0.15s; }
    .gv-sidebar-toggle:hover { color:var(--p); background:var(--p-lt); }

    /* Tree */
    .gv-tree-list { flex:1; overflow-y:auto; padding:2px 0; }
    .gv-tree-list::-webkit-scrollbar { width:3px; }
    .gv-tree-list::-webkit-scrollbar-thumb { background:var(--bg2); border-radius:2px; }
    .gv-emp-group { margin:0; }
    .gv-emp-header { display:flex; align-items:center; gap:6px; padding:8px 12px; cursor:pointer; transition:background 0.1s; user-select:none; }
    .gv-emp-header:hover { background:#F0F2FA; }
    .gv-emp-folder-icon { width:14px; height:14px; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:var(--text-3); }
    .gv-emp-name { font-size:12px; font-weight:600; color:var(--text-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .gv-emp-dots { font-size:12px; color:var(--text-4); padding:0 3px; cursor:pointer; border-radius:3px; }
    .gv-emp-dots:hover { background:var(--bg2); }
    .gv-emp-chevron { color:var(--text-4); transition:transform 0.2s var(--ease); flex-shrink:0; }
    .gv-emp-chevron.open { transform:rotate(180deg); }
    .gv-emp-tasks { padding:0 0 2px; }

    .gv-node { display:flex; align-items:center; gap:5px; padding:7px 12px 7px 20px; cursor:pointer; transition:all 0.08s; border-left:2px solid transparent; }
    .gv-node:hover { background:#F0F2FA; }
    .gv-node.active { background:var(--p-lt); border-left-color:var(--p); }
    .gv-chevron { width:14px; height:14px; border:none; background:none; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center; border-radius:3px; color:var(--text-4); transition:transform 0.2s var(--ease); }
    .gv-chevron:hover { background:var(--bg2); }
    .gv-chevron.open { transform:rotate(90deg); }
    .gv-node-file-icon { width:14px; height:14px; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:var(--text-3); }
    .gv-node.active .gv-node-file-icon { color:var(--p); }
    .gv-node-name { font-size:11px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-2); font-weight:400; }
    .gv-node.active .gv-node-name { color:var(--p); font-weight:600; }
    .gv-node-ct { font-size:8px; font-family:var(--mono); color:var(--text-4); padding:1px 4px; border-radius:99px; background:var(--bg); }
    .gv-overdue-dot { width:5px; height:5px; border-radius:50%; background:var(--danger); animation:od-pulse 2s ease-in-out infinite; }
    @keyframes od-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }

    /* ═══ COL 2 — CHAT ═══ */
    .gv-chat { flex:1; min-width:0; display:flex; flex-direction:column; background:var(--surface); overflow:hidden; position:relative; }
    .gv-chat-head { display:flex; align-items:center; gap:8px; padding:9px 16px; border-bottom:1px solid var(--border); flex-shrink:0; min-height:46px; background:var(--surface); }
    .gv-chat-task-chip { display:flex; align-items:center; gap:4px; padding:2px 8px; border-radius:5px; background:var(--p-lt); flex-shrink:0; }
    .gv-chat-tid { font-size:9px; font-family:var(--mono); font-weight:600; color:var(--p); }
    .gv-chat-task-name { font-size:12px; font-weight:600; color:var(--text-1); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .gv-chat-badge { font-size:9px; font-weight:700; padding:2px 8px; border-radius:99px; flex-shrink:0; }
    .gv-chat-actions { display:flex; gap:2px; flex-shrink:0; margin-left:auto; align-items:center; }
    .gv-chat-act-btn { width:28px; height:28px; border-radius:7px; border:1px solid var(--border); background:var(--surface); cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--text-3); transition:all 0.12s; flex-shrink:0; }
    .gv-chat-act-btn:hover { background:var(--p-lt); color:var(--p); border-color:var(--p); }
    .gv-mob-only-actions { display:none; gap:2px; align-items:center; }
    @media (max-width:767px) { .gv-mob-only-actions { display:flex; } }

    .gv-msgs { flex:1; min-height:0;overflow-y:auto; padding:14px 18px; display:flex; flex-direction:column; gap:1px; background:#F5F6FA; background-image:url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d5d7e2' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E"); }
    .gv-msgs::-webkit-scrollbar { width:3px; }
    .gv-msgs::-webkit-scrollbar-thumb { background:var(--border2); border-radius:3px; }
    .gv-date-sep { display:flex; align-items:center; gap:10px; margin:12px 0; }
    .gv-date-sep-line { flex:1; height:1px; background:var(--border); }
    .gv-date-sep-label { font-size:9px; color:var(--text-4); font-weight:700; text-transform:uppercase; letter-spacing:0.06em; white-space:nowrap; padding:3px 9px; background:var(--surface); border-radius:99px; border:1px solid var(--border); }
    .gv-msg-group { display:flex; gap:6px; padding:3px 0; max-width:72%; }
    .gv-msg-group.me { margin-left:auto; flex-direction:row-reverse; }
    .gv-msg-avatar { width:28px; height:28px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:700; color:#fff; background:var(--p); flex-shrink:0; position:relative; }
    .gv-msg-col { flex:1; min-width:0; }
    .gv-msg-meta { display:flex; align-items:center; gap:3px; font-size:10px; color:var(--text-4); margin-bottom:2px; font-weight:500; }
    .gv-msg-group.me .gv-msg-meta { justify-content:flex-end; }
    .gv-bubble-wrapper { display:flex; align-items:flex-start; gap:3px; position:relative; }
    .gv-msg-group.me .gv-bubble-wrapper { flex-direction:row-reverse; }
    .gv-bubble { padding:7px 11px 5px; border-radius:3px 10px 10px 10px; background:#FFFFFF; font-size:12px; line-height:1.5; color:var(--text-1); max-width:100%; word-wrap:break-word; border:1px solid var(--border); box-shadow:0 1px 2px rgba(0,0,0,0.02); }
    .gv-msg-group.me .gv-bubble { background:var(--p); color:#fff; border-radius:10px 3px 10px 10px; border:none; box-shadow:0 1px 4px rgba(91,94,244,0.25); }
    .gv-reply-quote { border-left:3px solid var(--p); padding:4px 8px; margin-bottom:5px; border-radius:0 4px 4px 0; background:rgba(79,70,229,0.06); }
    .gv-bubble.gv-sending { opacity:0.5; }
    .gv-bubble.gv-error { border:1.5px solid var(--danger); }
    .gv-bubble.gv-bubble-new { box-shadow:inset 3px 0 0 var(--success); }
    .gv-bubble-status { font-size:9px; color:var(--text-4); margin-top:2px; }
    .gv-bubble-status.gv-error { color:var(--danger); }
    .gv-image-preview { max-width:200px; max-height:180px; border-radius:8px; cursor:pointer; margin-top:3px; display:block; object-fit:cover; }
    .gv-attachment { display:inline-flex; align-items:center; gap:5px; padding:6px 10px; background:var(--surface); border:1px solid var(--border); border-radius:8px; font-size:11px; color:var(--text-2); text-decoration:none; margin-top:3px; }
    .gv-attachment:hover { background:var(--bg); }
    .gv-attachment-download { color:var(--p); }
    .gv-delete-msg { width:20px; height:20px; border-radius:50%; border:none; background:transparent; color:var(--text-4); cursor:pointer; font-size:10px; display:none; align-items:center; justify-content:center; flex-shrink:0; position:absolute; top:-6px; right:-6px; }
    .gv-bubble-wrapper:hover .gv-delete-msg { display:flex; }
    .gv-delete-msg:hover { background:#FEE2E2; color:var(--danger); }
    .gv-sys-msg { text-align:center; padding:4px 12px; font-size:10px; color:var(--text-4); font-style:italic; }
    .gv-input-bar { border-top:1px solid var(--border); background:var(--surface); flex-shrink:0; padding:4px 8px; padding-bottom:max(4px, env(safe-area-inset-bottom)); }
    /* (base input bar CSS: now handled by edit-16 block) */

    /* ── Compact input bar height fix ── */
.gv-input-bar textarea,
.gv-input-bar input[type="text"],
.gv-input-bar [contenteditable] {
  min-height: 36px !important;
  max-height: 80px !important;
  padding: 6px 8px !important;
  font-size: 13px !important;
  line-height: 1.4 !important;
}
.gv-input-bar > div { min-height: unset !important; }
.gv-input-bar > div > div:has(textarea),
.gv-input-bar > div > div:has(input),
.gv-input-bar > div > div:has([contenteditable]) {
  min-height: unset !important;
  padding: 2px 6px 2px 8px !important;
}

    /* ═══ COL 3 — RIGHT PANEL ═══ */
.gv-right-area { display:flex; height:100%; flex-shrink:0; width:360px; }    .gv-toolbar { width:38px; min-width:38px; background:var(--surface); border-left:1px solid var(--border); display:flex; flex-direction:column; align-items:center; padding:8px 0; gap:3px; }
    .gv-tool-btn { width:30px; height:30px; border-radius:8px; border:none; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--text-3); transition:all 0.12s; position:relative; }
    .gv-tool-btn:hover { background:var(--bg); color:var(--text-1); }
    .gv-tool-btn.active { background:var(--p-lt); color:var(--p); }
    .gv-tool-btn.active::after { content:''; position:absolute; right:0; top:6px; bottom:6px; width:2px; background:var(--p); border-radius:2px 0 0 2px; }
    .gv-tool-sep { width:20px; height:1px; background:var(--border); margin:4px 0; }

    .gv-detail { width:340px; min-width:340px; display:flex; flex-direction:column; background:var(--surface); border-right:1px solid var(--border); transition:width 0.2s var(--ease), min-width 0.2s var(--ease), opacity 0.15s; overflow:hidden; order:1; }
    .gv-detail.collapsed { width:0; min-width:0; opacity:0; border:none; overflow:hidden; }
    .gv-detail-toggle { display:none; }
    .gv-detail-head { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid var(--border); flex-shrink:0; }
    .gv-detail-head-title { font-size:12px; font-weight:700; color:var(--text-1); }
    .gv-detail-head-actions { display:flex; gap:3px; }
    .gv-detail-icon-btn { width:26px; height:26px; border-radius:6px; border:1px solid var(--border); background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--text-3); transition:all 0.1s; }
    .gv-detail-icon-btn:hover { background:var(--bg); color:var(--text-1); }
    .gv-detail-icon-btn.danger:hover { background:#FEE2E2; color:var(--danger); }
    .gv-detail-inner { flex:1; overflow-y:auto; display:flex; flex-direction:column; }
    .gv-detail-inner::-webkit-scrollbar { width:3px; }
    .gv-detail-inner::-webkit-scrollbar-thumb { background:var(--bg2); border-radius:2px; }
    .gv-placeholder { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; text-align:center; }

    .gv-d-title-row { display:flex; justify-content:space-between; align-items:flex-start; padding:12px 12px 6px; gap:6px; }
    .gv-d-title { font-size:14px; font-weight:700; color:var(--text-1); line-height:1.3; }
    .gv-actions { display:flex; gap:3px; flex-wrap:wrap; flex-shrink:0; }
    .gv-abtn { padding:4px 8px; border-radius:6px; border:1px solid var(--border); background:var(--surface); cursor:pointer; font-size:10px; font-weight:600; font-family:var(--font); transition:all 0.12s; }
    .gv-abtn:hover { background:var(--bg); }
    .gv-abtn-p { color:var(--p); border-color:var(--p); }
    .gv-abtn-p:hover { background:var(--p-lt); }
    .gv-abtn-o { color:var(--text-3); }
    .gv-abtn-d { color:var(--danger); border-color:var(--danger); }
    .gv-abtn-d:hover { background:#FEE2E2; }

    .gv-badge-row { display:flex; gap:4px; flex-wrap:wrap; padding:0 12px 8px; }
    .gv-code-tag { font-size:9px; font-family:var(--mono); color:var(--text-4); background:var(--bg); padding:1px 6px; border-radius:4px; }
    .gv-badge { font-size:9px; font-weight:600; padding:2px 7px; border-radius:5px; border:1px solid; display:inline-flex; align-items:center; gap:3px; }
    .gv-badge-dot { width:4px; height:4px; border-radius:50%; }

    .gv-detail-tabs { display:flex; border-bottom:1px solid var(--border); padding:0 12px; flex-shrink:0; }
    .gv-dtab { display:flex; align-items:center; gap:4px; padding:8px 12px; font-size:11px; font-weight:500; color:var(--text-3); border:none; background:none; cursor:pointer; font-family:var(--font); border-bottom:2px solid transparent; transition:all 0.12s; }
    .gv-dtab:hover { color:var(--text-1); }
    .gv-dtab.active { color:var(--p); border-bottom-color:var(--p); font-weight:700; }
    .gv-dtab-ct { font-size:8px; font-weight:700; color:var(--p); background:var(--p-lt); padding:1px 5px; border-radius:99px; }

    .gv-detail-scroll, .gv-reports-scroll { flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:8px; }
    .gv-info-row { display:flex; align-items:flex-start; gap:8px; padding:5px 0; border-bottom:1px solid var(--border); }
    .gv-info-lbl { font-size:10px; color:var(--text-4); font-weight:500; width:84px; flex-shrink:0; display:flex; align-items:center; gap:4px; padding-top:1px; }
    .gv-info-val { font-size:11px; color:var(--text-1); flex:1; font-weight:500; line-height:1.4; }
    .gv-bc { display:flex; align-items:center; flex-wrap:wrap; gap:2px; }
    .gv-bc-btn { font-size:10px; color:var(--p); background:none; border:none; cursor:pointer; font-family:var(--font); font-weight:500; }
    .gv-bc-btn:hover { text-decoration:underline; }
    .gv-bc-sep { font-size:9px; color:var(--text-4); margin:0 1px; }
    .gv-bc-cur { font-size:10px; color:var(--text-3); font-weight:600; }

    .gv-meta-row { display:flex; gap:5px; flex-wrap:wrap; }
    .gv-meta-pill { display:inline-flex; align-items:center; gap:3px; padding:3px 8px; border-radius:99px; background:var(--bg); border:1px solid var(--border); font-size:9px; color:var(--text-3); font-weight:600; }
    .gv-desc { font-size:12px; line-height:1.6; color:var(--text-2); white-space:pre-wrap; }
    .gv-notes { display:flex; gap:6px; align-items:flex-start; padding:8px 10px; background:#FFF8E1; border:1px solid rgba(245,158,11,0.2); border-radius:8px; }
    .gv-notes-text { font-size:11px; line-height:1.6; color:#7B4F00; flex:1; }

    .gv-prog { display:flex; flex-direction:column; gap:4px; }
    .gv-prog-head { display:flex; justify-content:space-between; align-items:center; }
    .gv-prog-lbl { font-size:10px; font-weight:600; color:var(--text-3); }
    .gv-prog-pct { font-size:11px; font-weight:700; font-family:var(--mono); }
    .gv-prog-track { height:4px; background:var(--bg); border-radius:99px; overflow:hidden; }
    .gv-prog-fill { height:100%; border-radius:99px; transition:width 0.6s var(--ease2); }

    .gv-comp-banner { display:flex; align-items:flex-start; gap:8px; padding:10px; border-radius:8px; border:1px solid; }
    .gv-comp-icon { font-size:14px; flex-shrink:0; }
    .gv-comp-text { font-size:11px; font-weight:700; }
    .gv-comp-sub { font-size:10px; opacity:0.8; margin-top:2px; }
    .gv-sec-lbl { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-4); margin-bottom:4px; }

    .gv-wf-btn { display:flex; align-items:center; gap:5px; width:100%; padding:7px 12px; border-radius:8px; font-size:11px; font-weight:600; border:1.5px solid; cursor:pointer; font-family:var(--font); transition:all 0.15s; margin-bottom:3px; }
    .gv-wf-confirm { background:var(--p-lt); color:var(--p); border-color:rgba(91,94,244,0.2); }
    .gv-wf-confirm:hover { background:var(--p); color:#fff; }
    .gv-wf-start { background:#DCFCE7; color:#16A34A; border-color:rgba(22,163,74,0.2); }
    .gv-wf-start:hover { background:#16A34A; color:#fff; }
    .gv-wf-report { background:#FEF3C7; color:#D97706; border-color:rgba(217,119,6,0.2); }
    .gv-wf-report:hover { background:#D97706; color:#fff; }
    .gv-wf-submit { background:var(--p-lt); color:var(--p); border-color:rgba(91,94,244,0.2); }
    .gv-wf-submit:hover { background:var(--p); color:#fff; }
    .gv-wf-review { background:var(--bg); color:var(--text-2); border-color:var(--border); }
    .gv-wf-review:hover { background:var(--text-1); color:#fff; }
    .gv-wf-ceo { background:#FEF3C7; color:#D97706; border-color:rgba(217,119,6,0.2); }
    .gv-wf-ceo:hover { background:#D97706; color:#fff; }
    .gv-wf-btn:disabled { opacity:0.5; pointer-events:none; }

    .gv-sub-item { display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:6px; background:var(--bg); cursor:pointer; margin-bottom:3px; transition:all 0.1s; }
    .gv-sub-item:hover { background:var(--p-lt); }
    .gv-sub-name { font-size:11px; font-weight:500; color:var(--text-2); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .gv-dl-entry { display:flex; gap:6px; align-items:flex-start; padding:5px 8px; background:var(--bg); border-radius:6px; margin-bottom:3px; }
    .gv-report-card { background:var(--bg); border-radius:10px; padding:12px; margin-bottom:6px; }
    .gv-report-card:hover { box-shadow:var(--shadow-sm); }

    .gv-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:30px 14px; text-align:center; }
    .gv-empty-icon { font-size:24px; margin-bottom:8px; opacity:0.5; }
    .gv-empty-t { font-size:12px; font-weight:600; color:var(--text-3); }
    .gv-empty-s { font-size:10px; color:var(--text-4); margin-top:3px; }

    .gv-skeleton { background:linear-gradient(90deg,#F0F2FA 25%,#E8E9F0 50%,#F0F2FA 75%); background-size:200% 100%; animation:skel-shimmer 1.5s infinite; border-radius:6px; }
    @keyframes skel-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
    .gv-skel-row { display:flex; gap:8px; align-items:center; padding:8px 12px; }
    .gv-skel-circle { width:24px; height:24px; border-radius:50%; flex-shrink:0; }
    .gv-skel-lines { flex:1; display:flex; flex-direction:column; gap:5px; }
    .gv-skel-line { height:8px; border-radius:3px; }
    .gv-shimmer { background:linear-gradient(90deg,var(--bg) 30%,var(--bg2) 50%,var(--bg) 70%); background-size:200% 100%; animation:skel-shimmer 1.5s infinite; border-radius:5px; }
    .gv-mobile-back { display:none; align-items:center; gap:4px; padding:8px 12px; font-size:11px; font-weight:600; color:var(--p); background:none; border:none; cursor:pointer; font-family:var(--font); border-bottom:1px solid var(--border); }
    .gv-mobile-tabs-bar { display:none; border-bottom:1px solid var(--border); }
    .gv-mob-tab { flex:1; padding:6px; border:none; background:none; font-size:11px; font-weight:500; color:var(--text-3); cursor:pointer; font-family:var(--font); }
    .gv-mob-tab.active { color:var(--p); border-bottom:2px solid var(--p); }

    .gv-ctx-menu { position:fixed; z-index:3000; background:var(--surface); border:1px solid var(--border); border-radius:10px; box-shadow:var(--shadow-xl); min-width:150px; padding:4px; animation:ctx-in 0.12s ease; }
    @keyframes ctx-in { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
    .gv-ctx-item { display:flex; align-items:center; gap:6px; padding:7px 10px; font-size:11px; font-weight:500; color:var(--text-2); cursor:pointer; border-radius:6px; transition:background 0.1s; border:none; background:none; width:100%; font-family:var(--font); text-align:left; }
    .gv-ctx-item:hover { background:var(--bg); }
    .gv-ctx-item.danger { color:var(--danger); }
    .gv-ctx-item.danger:hover { background:#FEE2E2; }
    .gv-ctx-sep { height:1px; background:var(--border); margin:3px 6px; }

    @media (max-width:767px) {
      .gv-root { height:calc(100dvh - 56px); flex-direction:column; overflow:hidden; position:relative; }
      .gv-list-panel {
        width:100%!important; min-width:100%!important; border-right:none;
        max-height:100%; flex-shrink:0;
        transform:translateX(0); transition:transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.22s;
      }
      .gv-list-panel.mob-hidden { transform:translateX(-100%); opacity:0; pointer-events:none; position:absolute; height:100%; }
      .gv-chat {
        width:100%; position:absolute; top:0; left:0; right:0; bottom:0;
        transform:translateX(100%); transition:transform 0.28s cubic-bezier(0.4,0,0.2,1);
        background:var(--surface); z-index:10; display:flex; flex-direction:column;
      }
      .gv-chat.mob-visible { transform:translateX(0); animation:none; }
      .gv-chat.mob-hidden { display:none; }
      .gv-right-area { display:none; }
      .gv-toolbar { display:none; }
      .gv-detail { width:100%!important; min-width:100%!important; position:fixed; inset:0; z-index:50; border:none; }
      .gv-detail.collapsed { display:none; }
      .gv-detail.mob-tab-active { display:flex; }
      .gv-sidebar-toggle { display:none; }
      .gv-mobile-back { display:flex; }
      .gv-mobile-tabs-bar { display:flex; }
      .gv-resizer { display:none; }
      .gv-msgs { padding:10px 12px; }
      .gv-msg-group { max-width:86%; }
      .gv-tbl-head .col-desc, .gv-tbl-row .col-desc,
      .gv-tbl-head .col-pri, .gv-tbl-row .col-pri,
      .gv-tbl-head .col-status, .gv-tbl-row .col-status,
      .gv-tbl-check, .gv-tbl-drag { display:none !important; }
      /* Mobile: keep col-date visible for deadline */
      .gv-tbl-row .col-date { display: flex !important; width: auto !important; min-width: 0 !important; padding: 0 4px !important; flex-shrink: 1 !important; }
      .gv-tbl-row .col-date span { font-size: 9px !important; }
      .gv-tbl-row .col-date svg { width: 10px !important; height: 10px !important; }
      .gv-tbl-head .col-date { display: none !important; }
      .gv-tbl-row .col-timer { width:44px; padding:0 4px; }
      .gv-tbl-head .col-timer { display:none; }
      .gv-tbl-row { height:54px; }
      .gv-tbl-head .col-people { display:none; }
      .gv-tbl-row .col-people { width:auto; max-width:140px; flex:0 1 auto; padding:0 6px; overflow:hidden; border-right:none; }
      .gv-mob-people-names { display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
      .gv-tbl-row .col-act { width:32px; }
      .gv-compact-item { padding:10px 14px; }
      .gv-compact-item-name { font-size:13px; }
      .gv-lp-topbar { padding:10px 14px; }
      .gv-grp-header { padding:10px 14px; }
    }

    /* ═══ COMPACT MODE (30% panel) ═══ */
    .gv-list-panel.is-compact .col-desc,
    .gv-list-panel.is-compact .col-people,
    .gv-list-panel.is-compact .col-pri,
    .gv-list-panel.is-compact .col-date,
    .gv-list-panel.is-compact .col-timer,
    .gv-list-panel.is-compact .gv-tbl-drag,
    .gv-list-panel.is-compact .gv-tbl-check { display:none; }
    .gv-list-panel.is-compact .gv-tbl-row { height:38px; }
    .gv-list-panel.is-compact .col-name { flex:1; padding:0 8px; border-right:none; }
    .gv-list-panel.is-compact .col-status { width:90px; padding:0 6px; }
    .gv-list-panel.is-compact .col-act { width:26px; }
    .gv-list-panel.is-compact .gv-tbl-row.selected .col-name .gv-task-name { color:var(--p); font-weight:700; }
    .gv-list-panel.is-compact .gv-grp-header { padding:6px 10px; }
    .gv-list-panel.is-compact .gv-tbl-head { display:none; }
    .gv-list-panel.is-compact .gv-grp-badge { font-size:10px; padding:3px 8px; }
    .gv-list-panel.is-compact .gv-lp-topbar { padding:8px 10px; gap:5px; }
    .gv-list-panel.is-compact .gv-stats { display:none; }
    .gv-list-panel.is-compact .gv-tbl-expand { width:16px; }
    @media (max-width:480px) { .gv-chat-task-name { display:none; } }
    .gv-mob-detail-hero { display:none; flex-shrink:0; }
    .gv-desk-detail-head { display:block; }
    @media (max-width:767px) {
      .gv-mob-detail-hero { display:block; }
      .gv-desk-detail-head { display:none; }
      .gv-detail.mob-tab-active { background:var(--bg); }
    }
    /* ═══ MOBILE WHATSAPP-STYLE CHAT HEADER ═══ */
    .gv-mob-chat-topbar { display:none; align-items:center; gap:8px; padding:8px 12px; background:#fff; border-bottom:1px solid var(--border); flex-shrink:0; min-height:50px; }
    .gv-mob-back-btn { width:32px; height:32px; border:none; background:transparent; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--text-2); flex-shrink:0; }
    .gv-mob-back-btn:active { background:var(--bg); }
    .gv-mob-group-avatar { display:none; }
    .gv-mob-group-info { display:flex; align-items:center; gap:9px; flex:1; min-width:0; cursor:pointer; }
    .gv-mob-group-text { flex:1; min-width:0; }
    .gv-mob-group-name { font-size:14px; font-weight:700; color:var(--text-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; line-height:1.2; }
    .gv-mob-group-members { font-size:10px; color:var(--text-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:1px; line-height:1.3; }
    .gv-mob-chat-actions { display:flex; gap:2px; flex-shrink:0; }
    .gv-mob-icon-btn { width:32px; height:32px; border:none; background:transparent; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--text-2); }
    .gv-mob-icon-btn:active { background:var(--bg); }
    .gv-desk-only { display:flex; }
    .gv-mob-people-names { display:none; overflow:hidden; line-height:1.2; }

    @media (max-width:767px) {
      .gv-mob-chat-topbar { display:flex; }
      .gv-desk-only { display:none !important; }
      .gv-mob-people-names { display:block; margin-top:1px; overflow:hidden; line-height:1.2; }
      .gv-mobile-back { display:none; }
      .gv-img2-tabs { display:flex !important; overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none; padding:0 12px; }
      .gv-img2-tabs::-webkit-scrollbar { display:none; }
      .gv-img2-tab { flex-shrink:0; padding:10px 12px; font-size:12px; }
    }

    /* ════════════════════════════════════════════════════════════════════
       ✦ IMAGE-2 REDESIGN OVERLAY — purely additive visual refresh
       Preserves all existing functionality; just restyles surfaces.
       ════════════════════════════════════════════════════════════════════ */

    /* — Page outer breathing room (so panels read as cards) — */
    .gv-root { background:#F5F6FA; padding:10px; gap:10px; }
    .gv-list-panel { border-radius:14px; border:1px solid #ECEEF3; box-shadow:0 1px 2px rgba(15,23,42,0.03); overflow:hidden; }
    .gv-chat { border-radius:14px; border:1px solid #ECEEF3; box-shadow:0 1px 2px rgba(15,23,42,0.03); overflow:hidden; }
    .gv-right-area { gap:0; }
    .gv-detail { border-radius:14px; border:1px solid #ECEEF3 !important; box-shadow:0 1px 2px rgba(15,23,42,0.03); margin-left:10px; overflow:hidden; }
    .gv-toolbar { background:transparent !important; border:none !important; }

    /* — List panel header (top bar) — */
    .gv-lp-topbar { padding:14px 18px; border-bottom:1px solid #F1F2F6; min-height:60px; }
    .gv-lp-title { font-size:20px; font-weight:700; letter-spacing:-0.01em; color:#0F172A; }
    .gv-search-box { padding:7px 12px; border-radius:10px; border:1px solid #E5E7EB; background:#F8F9FB; max-width:280px; }
    .gv-search-box input { font-size:12px; }
    

    /* — Stats / filter chips bar — Image 2 pill style — */
    .gv-stats { padding:10px 14px; gap:8px; border-bottom:1px solid #F1F2F6; background:#fff; }
    .gv-stat { flex:0 0 auto; padding:6px 14px; border-radius:99px; border:1px solid #E5E7EB; background:#fff; gap:6px; transition:all 0.15s; }
    .gv-stat:hover { background:#F8F9FB; border-color:#D1D5DB; }
    .gv-stat.active-tab { border-color:#5B5EF4; background:#5B5EF4; }
    .gv-stat.active-tab .gv-stat-l, .gv-stat.active-tab .gv-stat-n { color:#fff !important; }
    .gv-stat-n { font-size:12px; }
    .gv-stat-l { font-size:10px; letter-spacing:0.04em; text-transform:capitalize; font-weight:600; color:#64748B; }

    /* — Group headers (Assigned to me / Created by me / Other) — */
    .gv-grp-header { padding:14px 16px 10px; border-bottom:none; background:transparent; }
    .gv-grp-header:hover { background:transparent; }
    .gv-grp-badge { padding:0; background:transparent !important; font-size:13px; font-weight:600; color:#0F172A; }
    .gv-grp-count { background:#EEF2FF; color:#5B5EF4; padding:2px 9px; font-size:11px; }

    /* — Task rows: card-like with colored left edge — */
    .gv-tbl-head { display:none !important; }
    .gv-tbl-row {
      margin:6px 12px; border-radius:10px;
      border:1px solid #ECEEF3 !important; border-bottom:1px solid #ECEEF3 !important;
      background:#fff; min-height:56px; padding:8px 6px 8px 14px;
      position:relative; transition:all 0.15s;
      box-shadow:0 1px 2px rgba(15,23,42,0.02);
    }
    .gv-tbl-row::before {
      content:""; position:absolute; left:0; top:8px; bottom:8px; width:3px;
      background:#94A3B8; border-radius:0 3px 3px 0; transition:background 0.15s;
    }
    .gv-tbl-row[data-grp="assigned"]::before { background:linear-gradient(180deg,#5B5EF4,#7C3AED); }
    .gv-tbl-row[data-grp="created"]::before { background:linear-gradient(180deg,#10B981,#059669); }
    .gv-tbl-row[data-grp="other"]::before { background:linear-gradient(180deg,#F59E0B,#D97706); }
    .gv-tbl-row:hover { background:#FAFBFF; transform:translateY(-1px); box-shadow:0 4px 12px rgba(15,23,42,0.05); }
    .gv-tbl-row.selected { background:#F5F4FF; border-color:#C7D2FE !important; }
    .gv-tbl-row.subtask-row { background:#FAFBFF; }
    .gv-task-name { font-size:13px; font-weight:600; color:#0F172A; }
    .gv-task-desc { font-size:11px; color:#94A3B8; }

    /* ─── CHAT COLUMN — Image 2 redesign ─────────────────────────────── */
    .gv-chat { background:#fff; }

    /* Gradient hero strip (decorative banner) — only when a task is selected */
    .gv-chat-hero {
      flex-shrink:0; height:0 !important; overflow:hidden; display:none;
    }
    .gv-chat-hero::after { display:none; }

    /* Restyle the desktop chat header to match Image 2 (white bar under hero) */
    .gv-chat-head.gv-desk-only {
      padding:12px 20px; min-height:58px; gap:10px;
      border-bottom:1px solid #F1F2F6; background:#fff;
    }
    .gv-chat-head.gv-desk-only > svg:first-child { display:none; }
    .gv-chat-head.gv-desk-only .gv-chat-task-chip { display:none; }
    .gv-chat-head.gv-desk-only .gv-chat-task-name {
      font-size:18px; font-weight:700; color:#0F172A; letter-spacing:-0.01em;
    }
    .gv-chat-head.gv-desk-only .gv-chat-badge {
      font-size:10px; font-weight:600; padding:4px 10px; border-radius:99px;
      display:inline-flex; align-items:center; gap:4px;
    }
    .gv-chat-act-btn {
      width:34px; height:34px; border-radius:10px; border:1px solid #E5E7EB; background:#fff;
    }
    .gv-chat-act-btn:hover { background:#F5F4FF; color:#5B5EF4; border-color:#C7D2FE; }

    /* "Chat with team" avatar strip */
    .gv-chat-team-strip {
      display:flex; align-items:center; gap:10px; padding:9px 20px;
      background:#fff; border-bottom:1px solid #F1F2F6; flex-shrink:0;
    }
    .gv-chat-team-avatars { display:flex; align-items:center; }
    .gv-chat-team-avatars .gv-team-av {
      width:28px; height:28px; border-radius:50%; border:2px solid #fff;
      background:linear-gradient(135deg,#A78BFA,#7C3AED); color:#fff;
      display:flex; align-items:center; justify-content:center;
      font-size:11px; font-weight:700; margin-left:-7px; flex-shrink:0;
      box-shadow:0 1px 3px rgba(15,23,42,0.12); overflow:hidden;
    }
    .gv-chat-team-avatars .gv-team-av:first-child { margin-left:0; }
    .gv-chat-team-avatars .gv-team-av img { width:100%; height:100%; object-fit:cover; }
    .gv-chat-team-more {
      min-width:28px; height:28px; padding:0 8px; border-radius:99px; border:2px solid #fff;
      background:#5B5EF4; color:#fff;
      display:flex; align-items:center; justify-content:center;
      font-size:10px; font-weight:700; margin-left:-7px; flex-shrink:0;
    }
    .gv-chat-team-label { font-size:12px; color:#64748B; font-weight:500; }

    /* ─── RIGHT DETAIL PANEL — Image 2 clean card ─────────────────── */
    .gv-detail { width:340px; min-width:340px; background:#fff; border:1px solid #ECEEF3 !important; }
    .gv-detail-head { padding:14px 18px; background:#fff; border-bottom:1px solid #F1F2F6; }
    .gv-detail-head-title { font-size:15px; font-weight:700; color:#0F172A; }
    .gv-detail-icon-btn { width:30px; height:30px; border-radius:8px; border:1px solid #E5E7EB; }
    .gv-detail-inner { background:#fff; }

    /* === Width fix: chat panel is a fixed 30% strip, task list takes the rest === */
    @media (min-width:768px) {
     .gv-chat.gv-has-task {
        flex: 1 1 0% !important;
        min-width: 200px !important;
        max-width: none !important;
      }
    }

    /* === Image-2 task row -- hide description + people columns, remove dividers === */
    .gv-tbl-head .col-desc, .gv-tbl-row .col-desc,
    .gv-tbl-head .col-people, .gv-tbl-row .col-people {
      display: none !important;
    }
    /* Remove all internal vertical dividers -- Image-2 rows are clean cards */
    .gv-tbl-row .col-name,
    .gv-tbl-row .col-timer,
    .gv-tbl-row .col-pri,
    .gv-tbl-row .col-date,
    .gv-tbl-row .col-status,
    .gv-tbl-row .col-act { border-right: none !important; }
    /* Restore some breathing room between columns */
    /* (overlay column widths: consolidated into edit-18) */
    /* Match the row name text size to Image-2 */
    .gv-tbl-row .gv-task-name { font-size: 13px; font-weight: 600; color: #0F172A; }

    /* === Image-2 group section header refresh === */
    .gv-tbl-group { margin: 8px 0; }
    .gv-grp-header { padding: 14px 18px 8px !important; }
    .gv-grp-badge { font-size: 13px !important; font-weight: 600 !important; }
    .gv-grp-count { background: #EEF2FF !important; color: #5B5EF4 !important; padding: 2px 9px !important; font-size: 11px !important; font-weight: 700 !important; }

    /* === Chat panel polish -- match Image-2 message bubbles & input === */
    .gv-chat-hero { display:none !important; }
    .gv-chat-head.gv-desk-only { padding: 14px 22px !important; min-height: 64px !important; }
    .gv-chat-head.gv-desk-only .gv-chat-task-name { font-size: 17px !important; }
    .gv-chat-head.gv-desk-only .gv-chat-badge { padding: 5px 12px !important; font-size: 11px !important; }

    /* Message bubbles: cleaner, more spacious */
    .gv-msg-area { padding: 14px 18px !important; gap: 14px !important; background: #FAFBFF !important; }
    .gv-bubble { padding: 9px 13px 7px !important; border-radius: 4px 12px 12px 12px !important; font-size: 13px !important; }
    .gv-msg-group.me .gv-bubble { border-radius: 12px 4px 12px 12px !important; background: linear-gradient(135deg, #5B5EF4, #7C3AED) !important; }

    /* Input bar */
    /* (input bar: all handled by edit-16) */

    /* List panel topbar buttons -- bigger, matches Image-2 */
    .gv-lp-title { font-size: 22px !important; font-weight: 700 !important; }

    /* Toolbar (vertical icon rail) — make it float as pills */
    .gv-toolbar { padding:8px 6px; gap:6px; }
    .gv-tool-btn {
      width:36px; height:36px; border-radius:10px; border:1px solid #E5E7EB; background:#fff;
      transition:all 0.15s; box-shadow:0 1px 2px rgba(15,23,42,0.03);
    }
    .gv-tool-btn:hover { background:#F5F4FF; color:#5B5EF4; border-color:#C7D2FE; }
    .gv-tool-btn.active { background:linear-gradient(135deg,#5B5EF4,#7C3AED); color:#fff; border-color:transparent; box-shadow:0 2px 8px rgba(91,94,244,0.3); }
    .gv-tool-sep { background:#E5E7EB; margin:4px 8px; }

    /* When no task is selected, hide the chat panel on desktop so the task list fills the width (Image-2 behavior) */
    @media (min-width:768px) {
      .gv-chat.gv-no-task { display:none !important; }
      .gv-chat.gv-no-task ~ .gv-resizer,
      .gv-chat.gv-no-task + .gv-right-area { display:none !important; }
    }

    /* Image-2 outer tabs (Chat / Activity / Files / Details) */
    .gv-img2-tabs { display:flex; align-items:stretch; gap:0; padding:0 20px; background:#fff; border-bottom:1px solid #F1F2F6; flex-shrink:0; }
    .gv-img2-tab { padding:11px 14px; border:none; background:transparent; font-family:inherit; font-size:13px; font-weight:500; color:#64748B; cursor:pointer; position:relative; transition:color 0.15s; white-space:nowrap; }
    .gv-img2-tab:hover:not(:disabled) { color:#5B5EF4; }
    .gv-img2-tab.active { color:#5B5EF4; font-weight:600; }
    .gv-img2-tab.active::after { content:""; position:absolute; left:14px; right:14px; bottom:-1px; height:2.5px; background:#5B5EF4; border-radius:2px 2px 0 0; }
    .gv-img2-tab:disabled { color:#CBD5E1; cursor:not-allowed; }

    /* Right-area is no longer used on desktop -- detail content renders inline inside the chat sidebar instead. */
    @media (min-width:768px) {
      .gv-toolbar { display:none !important; }
      .gv-right-area { display:none !important; }
    }

    /* Inline detail render inside chat sidebar */
    .gv-chat-inline-detail { animation: fadeInDetail 0.18s cubic-bezier(0.4,0,0.2,1); }
    @keyframes fadeInDetail { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
    .gv-chat-inline-detail .gv-detail-scroll { padding: 14px 18px !important; }
    .gv-chat-inline-detail .gv-reports-scroll { padding: 14px 18px !important; }

    /* === Cleaner task rows (Image-2) === */
    .gv-tbl-row { padding: 10px 8px 10px 16px !important; min-height: 64px !important; }
    .gv-tbl-row::before { top: 10px !important; bottom: 10px !important; width: 3.5px !important; }
    .gv-tbl-row .gv-task-name { font-size: 13.5px !important; font-weight: 600 !important; }
    .gv-tbl-row .col-name { padding: 4px 12px !important; }

    /* Border refinement on chat sidebar */
    .gv-chat.gv-has-task { border: 1px solid #ECEEF3 !important; box-shadow: 0 1px 3px rgba(15,23,42,0.04) !important; }

    /* === Image-2 top tab row (My Tasks / All Tasks / Calendar / Timeline / Kanban) === */
    .gv-img2-toptabs {
      display: flex; align-items: center; gap: 6px;
      padding: 14px 18px 0;
      background: #fff;
      border-bottom: 1px solid #F1F2F6;
      flex-shrink: 0;
    }
    .gv-img2-toptab {
      background: transparent; border: none; cursor: pointer;
      font-family: var(--font); font-size: 14px; font-weight: 600;
      color: #6B7280; padding: 10px 16px; border-radius: 8px 8px 0 0;
      transition: all 0.15s; position: relative; margin-bottom: -1px;
    }
    .gv-img2-toptab:hover:not(:disabled):not(.active) { color: #0F172A; background: #F8FAFC; }
    .gv-img2-toptab.active {
      color: #5B5EF4;
      background: #EEF2FF;
      border-radius: 8px;
      margin-bottom: 4px;
    }
    .gv-img2-toptab:disabled { opacity: 0.5; cursor: not-allowed; }

    /* === Image-2 filter pill row === */
    .gv-img2-pillrow {
      display: flex; align-items: center; gap: 8px;
      padding: 14px 18px;
      background: #fff;
      border-bottom: 1px solid #F1F2F6;
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    .gv-img2-pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 14px; border-radius: 99px;
      background: #fff; border: 1px solid #E5E7EB;
      font-family: var(--font); font-size: 12.5px; font-weight: 600;
      color: #4B5563; cursor: pointer; transition: all 0.15s;
      white-space: nowrap;
    }
    .gv-img2-pill:hover:not(.active) { background: #F8FAFC; border-color: #CBD5E1; }
    .gv-img2-pill.active {
      background: #5B5EF4 !important; border-color: #5B5EF4 !important;
      color: #fff !important;
    }
    .gv-img2-pill-count {
      font-size: 11px; font-weight: 700; opacity: 0.85;
    }
    .gv-img2-pill.active .gv-img2-pill-count { color: #fff; opacity: 1; }
    .gv-img2-filters-btn { color: #4B5563 !important; }

    /* === Hide legacy toolbar elements === */
    .gv-legacy-info { display: none !important; }
    /* filterbar visibility controlled by inline style via filterOpen state */
    .gv-legacy-chattabs { display: none !important; }

    /* === COMPACT-MODE: keep all columns visible when task is selected === */
    .gv-list-panel.is-compact .col-timer,
    .gv-list-panel.is-compact .col-pri,
    .gv-list-panel.is-compact .col-date,
    .gv-list-panel.is-compact .col-status,
    .gv-list-panel.is-compact .gv-tbl-check,
    .gv-list-panel.is-compact .gv-tbl-drag {
      display: flex !important;
    }
    .gv-list-panel.is-compact .gv-tbl-row { min-height: 64px !important; height: auto !important; }
    /* (compact column widths: consolidated into edit-18) */
    .gv-list-panel.is-compact .gv-stats { display: none !important; }
    .gv-list-panel.is-compact .gv-img2-toptabs { display: flex !important; }
    .gv-list-panel.is-compact .gv-img2-pillrow { display: flex !important; }

    /* Hide any leftover sub-group headers (flat list mode is default now) */
    .gv-emp-header { display: none !important; }
    .gv-tbl-group > .gv-grp-header { display: none !important; }

    /* === EDIT-11: Image-2 pixel-polish overrides (must come last to win) === */

    /* Show the document icon next to task title in chat header (was hidden) */
    .gv-chat-head.gv-desk-only > svg:first-child {
      display: inline-block !important;
      width: 18px !important; height: 18px !important;
      opacity: 1 !important; flex-shrink: 0;
    }
    .gv-chat-head.gv-desk-only > svg:first-child path {
      stroke: #0F172A !important; stroke-width: 1.6 !important;
      fill: none !important; opacity: 1 !important;
    }

    /* Tighten EVERYTHING -- user said current is too big */
    .gv-lp-title { font-size: 18px !important; font-weight: 700 !important; }
    .gv-img2-toptabs { padding: 10px 14px 0 !important; gap: 4px !important; }
    .gv-img2-toptab { font-size: 13px !important; padding: 7px 12px !important; }
    .gv-img2-pillrow { padding: 10px 14px !important; gap: 6px !important; }
    .gv-img2-pill { padding: 5px 11px !important; font-size: 11.5px !important; }
    .gv-img2-pill-count { font-size: 10.5px !important; }

    /* Smaller, denser task rows */
    .gv-tbl-row { min-height: 56px !important; padding: 8px 6px 8px 14px !important; margin: 5px 10px !important; }
    .gv-tbl-row .gv-task-name { font-size: 12.5px !important; font-weight: 600 !important; }
    .gv-tbl-row::before { top: 8px !important; bottom: 8px !important; width: 3px !important; }

    /* Section header tighter */
    .gv-tbl-group { margin: 4px 0 !important; }

    /* === Chat panel: shorter hero, tighter header so chat content starts higher === */
    /* .gv-chat-hero removed */
    .gv-chat-head.gv-desk-only { padding: 10px 18px !important; min-height: 52px !important; gap: 8px !important; }
    .gv-chat-head.gv-desk-only .gv-chat-task-name { font-size: 15px !important; font-weight: 700 !important; }
    .gv-chat-head.gv-desk-only .gv-chat-badge { padding: 4px 9px !important; font-size: 10.5px !important; }
    .gv-chat-act-btn { width: 30px !important; height: 30px !important; border-radius: 8px !important; }
    .gv-img2-tabs { padding: 0 18px !important; }
    .gv-img2-tab { padding: 9px 12px !important; font-size: 12.5px !important; }
    .gv-chat-team-strip { padding: 8px 18px !important; }
    .gv-chat-team-strip .gv-team-av { width: 24px !important; height: 24px !important; font-size: 10px !important; }
    .gv-chat-team-strip .gv-chat-team-more { min-width: 24px !important; height: 24px !important; font-size: 9.5px !important; }
    .gv-chat-team-label { font-size: 11.5px !important; }

    /* (old force-white input bar CSS removed by edit-14) */

    /* === Image-2: "+ Add Another Task" footer card === */
    .gv-img2-add-another {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: calc(100% - 24px); margin: 8px 12px 16px;
      padding: 16px 14px;
      background: #FAFBFF; border: 1px dashed #D1D5DB; border-radius: 12px;
      color: #5B5EF4; font-family: var(--font); font-size: 13px; font-weight: 600;
      cursor: pointer; transition: all 0.15s;
    }
    .gv-img2-add-another:hover { background: #F5F4FF; border-color: #5B5EF4; border-style: solid; }
    .gv-img2-add-another svg { color: #5B5EF4; }

    /* Status badge in chat header: tighter padding now that there is a chevron */
    .gv-img2-status-badge { padding: 5px 10px !important; }

    /* === EDIT-12 polish === */

    /* Hero now contains an SVG -- make sure it fills the box and has no extra bg */
    .gv-chat-hero { background: transparent !important; padding: 0 !important; }
    .gv-chat-hero svg { width: 100%; height: 100%; display: block; }

    /* Hide the small colored dot before status text in row pills (Image-2 has no dot) */
    .gv-tbl-row .col-status > span > span:first-child { display: none !important; }
    .gv-tbl-row .col-status > span { padding: 4px 11px !important; }
    /* Same in flat-mode rows */
    .col-status > span:first-child > span:first-child[style*="border-radius: 50%"] { display: none !important; }

    /* Priority pill -- match Image-2 (small flag icon + label, soft tint background) */
    .gv-tbl-row .col-pri > span { padding: 3px 8px !important; font-size: 11px !important; }

    /* === EDIT-13: Proper tree branch for subtasks === */
    .gv-tbl-row.subtask-row {
      position: relative;
      margin-left: 38px !important;
      margin-right: 12px !important;
      background: #FAFBFF !important;
    }
    /* Hide the data-grp colored left bar on subtask rows -- it was clashing
       with the branch connector and making one continuous vertical line. */
    .gv-tbl-row.subtask-row::before { display: none !important; }
    /* Branch connector: vertical line going up + horizontal arm into the row */
    .gv-tbl-row.subtask-row::after {
      content: ""; position: absolute;
      left: -22px; top: -3px; bottom: 50%;
      width: 18px;
      border-left: 1.5px solid #CBD5E1;
      border-bottom: 1.5px solid #CBD5E1;
      border-bottom-left-radius: 10px;
      pointer-events: none;
    }
    /* Two siblings -- second one needs the line to extend up past the first sibling */
    .gv-tbl-row.subtask-row + .gv-tbl-row.subtask-row::after {
      top: -50%;
    }

    /* Cleaner row hover -- subtle, doesn't clash with colored section bg */
    .gv-tbl-row { transition: box-shadow 0.15s, transform 0.15s; }
    .gv-tbl-row:hover { background: #fff !important; transform: none !important; box-shadow: 0 2px 8px rgba(15,23,42,0.06) !important; }
    .gv-tbl-row.selected { background: #fff !important; border-color: #C7D2FE !important; box-shadow: 0 2px 8px rgba(91,94,244,0.12) !important; }

  /* === EDIT-16: WhatsApp-style input bar — icons inside field, send outside === */
.gv-input-bar {
  padding: 6px 8px !important;
  background: #fff !important;
  border-top: 1px solid #F1F2F6 !important;
  position: relative !important;
  color: #374151 !important;
}
.gv-input-bar * { color: inherit; }
/* Main flex container: row layout */
.gv-input-bar > div { background: transparent !important; }
.gv-input-bar > div > div.att-menu { background: #fff !important; border-radius: 12px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important; border: 1px solid #E5E7EB !important; overflow: hidden !important; }
/* The wrapper that holds + emoji + input — make it look like ONE input field */
.gv-input-bar > div:first-child,
.gv-input-bar > form:first-child,
.gv-input-bar > div > div:first-child {
  display: flex !important;
  align-items: flex-end !important;
  gap: 6px !important;
}
/* The row containing action buttons + text input = unified capsule */
/* The row containing action buttons + text input = unified capsule
   Use :has(input)/:has(textarea) to ONLY target the div that wraps the text field,
   not the outer container that also holds the send button */
.gv-input-bar > div > div:has(input),
.gv-input-bar > div > div:has(textarea),
.gv-input-bar > div > div:has([contenteditable]),
.gv-input-bar > form > div:has(input),
.gv-input-bar > form > div:has(textarea) {
  display: flex !important;
  align-items: flex-end !important;
  gap: 0 !important;
  background: #F3F4F6 !important;
  border: 1px solid #E5E7EB !important;
  border-radius: 22px !important;
  padding: 4px 6px 4px 8px !important;
  flex: 1 !important;
  min-width: 0 !important;
  transition: border-color 0.15s !important;
}
.gv-input-bar > div > div:has(input):focus-within,
.gv-input-bar > div > div:has(textarea):focus-within,
.gv-input-bar > div > div:has([contenteditable]):focus-within,
.gv-input-bar > form > div:has(input):focus-within,
.gv-input-bar > form > div:has(textarea):focus-within {
  border-color: #C7D2FE !important;
  background: #FAFBFF !important;
}
/* Text input — no border/bg of its own, fills the capsule */
.gv-input-bar input[type="text"],
.gv-input-bar textarea,
.gv-input-bar [contenteditable] {
  background: transparent !important;
  color: #1F2937 !important;
  border: none !important;
  border-radius: 0 !important;
  padding: 6px 8px !important;
  font-size: 13px !important;
  flex: 1 !important;
  min-width: 0 !important;
  min-height: 20px !important;
  max-height: 120px !important;
  overflow-y: auto !important;
  resize: none !important;
  outline: none !important;
  line-height: 1.45 !important;
}
.gv-input-bar input::placeholder,
.gv-input-bar textarea::placeholder { color: #9CA3AF !important; }
/* Action buttons (+ , emoji, mic) — inside the capsule, compact */
.gv-input-bar button:not([type="submit"]) {
  color: #6B7280 !important;
  background: transparent !important;
  border: none !important;
  width: 32px !important;
  height: 32px !important;
  min-width: 32px !important;
  align-self: flex-end !important;
  margin-bottom: 2px !important;
  border-radius: 50% !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0 !important;
  padding: 0 !important;
  cursor: pointer !important;
  transition: background 0.12s, color 0.12s !important;
}
.gv-input-bar button:not([type="submit"]) svg {
  stroke: currentColor !important;
  width: 18px !important;
  height: 18px !important;
}
.gv-input-bar button:not([type="submit"]):hover {
  color: #5B5EF4 !important;
  background: rgba(91,94,244,0.08) !important;
}
/* Send button — outside the capsule, circular gradient */
.gv-input-bar button[type="submit"] {
  background: linear-gradient(135deg, #5B5EF4, #7C3AED) !important;
  color: #fff !important;
  border-radius: 50% !important;
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-shadow: 0 2px 8px rgba(91,94,244,0.3) !important;
  flex-shrink: 0 !important;
  border: none !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  transition: transform 0.12s, box-shadow 0.12s !important;
  /* Force it OUT of the capsule by overriding any inherited capsule styles */
  position: relative !important;
  z-index: 2 !important;
}
.gv-input-bar button[type="submit"]:hover {
  transform: scale(1.05) !important;
  box-shadow: 0 4px 12px rgba(91,94,244,0.4) !important;
}
.gv-input-bar button[type="submit"] svg,
.gv-input-bar button[type="submit"] path {
  stroke: #fff !important;
  fill: #fff !important;
  color: #fff !important;
  width: 16px !important;
  height: 16px !important;
}

/* ── Emoji picker — proper positioning above input ── */
.gv-input-bar [role="dialog"],
.gv-input-bar [role="menu"],
.gv-input-bar [role="listbox"],
.gv-input-bar [class*="popover"],
.gv-input-bar [class*="Popover"],
.gv-input-bar [class*="picker"],
.gv-input-bar [class*="Picker"],
.gv-input-bar [class*="dropdown"],
.gv-input-bar [class*="menu"]:not(.gv-input-bar),
.gv-input-bar [class*="Menu"] {
  background: #fff !important;
  color: #1F2937 !important;
  z-index: 9999 !important;
  border: 1px solid #E5E7EB !important;
  border-radius: 14px !important;
  box-shadow: 0 -8px 32px rgba(0,0,0,0.14) !important;
  max-height: 340px !important;
  overflow: hidden !important;
}
em-emoji-picker,
[class*="EmojiPicker"],
[class*="emoji-picker"],
[data-emoji-picker] {
  position: absolute !important;
  bottom: calc(100% + 8px) !important;
  left: 8px !important;
  right: auto !important;
  z-index: 9999 !important;
  background: #fff !important;
  border: 1px solid #E5E7EB !important;
  border-radius: 14px !important;
  box-shadow: 0 -8px 32px rgba(0,0,0,0.14) !important;
  max-height: 340px !important;
  overflow-y: auto !important;
  width: min(340px, calc(100vw - 32px)) !important;
}
/* Attachment popup — positioned above the + button */
.gv-input-bar [class*="popover"] button,
.gv-input-bar [class*="menu"] button,
.gv-input-bar [class*="Menu"] button,
.gv-input-bar [class*="dropdown"] button {
  color: #374151 !important;
  background: #fff !important;
  width: auto !important;
  height: auto !important;
  min-width: auto !important;
  border-radius: 8px !important;
  padding: 8px 14px !important;
}
.gv-input-bar [class*="popover"] button:hover,
.gv-input-bar [class*="menu"] button:hover {
  background: #F3F4F6 !important;
}

/* === EDIT-18: Fixed-width columns — wider gaps + column header support === */
.gv-tbl-row { gap: 0 !important; justify-content: flex-start !important; }
.gv-tbl-row .col-name  { flex: 1 1 0% !important; min-width: 0 !important; padding: 4px 16px 4px 8px !important; border-right: none !important; overflow: hidden !important; }
.gv-tbl-row .col-timer { flex: 0 0 140px !important; width: 140px !important; padding: 0 14px !important; border-right: none !important; display: flex !important; justify-content: center !important; }
.gv-tbl-row .col-pri   { flex: 0 0 80px !important; width: 80px !important; padding: 0 12px !important; border-right: none !important; display: flex !important; justify-content: center !important; }
.gv-tbl-row .col-date  { flex: 0 0 130px !important; width: 130px !important; padding: 0 12px !important; border-right: none !important; display: flex !important; justify-content: center !important; }
.gv-tbl-row .col-status { flex: 0 0 120px !important; width: 120px !important; padding: 0 12px !important; border-right: none !important; display: flex !important; justify-content: center !important; }
.gv-tbl-row .col-act   { flex: 0 0 34px !important; width: 34px !important; padding: 0 !important; border-right: none !important; }

/* Column header row — visible, styled as a clean label bar */
.gv-col-header {
  display: flex !important; align-items: center;
  padding: 6px 6px 6px 10px; margin: 0 8px 2px;
  background: transparent; border: none;
  position: sticky; top: 0; z-index: 6;
}
.gv-col-header .col-label {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: #94A3B8;
  display: flex; align-items: center; justify-content: center;
  white-space: nowrap;
}
.gv-col-header .col-label.col-name-label { justify-content: flex-start !important; padding-left: 38px; }
.gv-col-header .col-label-name  { flex: 1 1 0%; min-width: 0; padding: 0 16px 0 8px; justify-content: flex-start !important; padding-left: 38px !important; }
.gv-col-header .col-label-timer { flex: 0 0 140px; width: 140px; padding: 0 14px; }
.gv-col-header .col-label-pri   { flex: 0 0 80px; width: 80px; padding: 0 12px; }
.gv-col-header .col-label-date  { flex: 0 0 130px; width: 130px; padding: 0 12px; }
.gv-col-header .col-label-status { flex: 0 0 120px; width: 120px; padding: 0 12px; }
.gv-col-header .col-label-act   { flex: 0 0 34px; width: 34px; }

/* Compact mode */
.gv-list-panel.is-compact .gv-tbl-row .col-name  { flex: 1 1 0% !important; min-width: 0 !important; overflow: hidden !important; }
.gv-list-panel.is-compact .gv-tbl-row .col-timer { flex: 0 0 130px !important; width: 130px !important; }
.gv-list-panel.is-compact .gv-tbl-row .col-pri   { flex: 0 0 70px !important; width: 70px !important; }
.gv-list-panel.is-compact .gv-tbl-row .col-date  { flex: 0 0 120px !important; width: 120px !important; }
.gv-list-panel.is-compact .gv-tbl-row .col-status { flex: 0 0 110px !important; width: 110px !important; }
.gv-list-panel.is-compact .gv-tbl-row .col-timer,
.gv-list-panel.is-compact .gv-tbl-row .col-pri,
.gv-list-panel.is-compact .gv-tbl-row .col-date,
.gv-list-panel.is-compact .gv-tbl-row .col-status,
.gv-list-panel.is-compact .gv-tbl-row .col-act { border-right: none !important; }
/* Compact column header widths */
.gv-list-panel.is-compact .gv-col-header .col-label-timer { flex: 0 0 130px; width: 130px; }
.gv-list-panel.is-compact .gv-col-header .col-label-pri   { flex: 0 0 70px; width: 70px; }
.gv-list-panel.is-compact .gv-col-header .col-label-date  { flex: 0 0 120px; width: 120px; }
.gv-list-panel.is-compact .gv-col-header .col-label-status { flex: 0 0 110px; width: 110px; }

/* Column content sizing */
.gv-tbl-row .col-pri > span { font-size: 10px !important; padding: 3px 8px !important; white-space: nowrap !important; }
.gv-tbl-row .col-status > span { font-size: 10px !important; padding: 4px 10px !important; white-space: nowrap !important; }
.gv-tbl-row .col-date span { font-size: 10px !important; white-space: nowrap !important; }
.gv-tbl-row .col-date svg { width: 12px !important; height: 12px !important; }

/* Task name truncation */
.gv-tbl-row .col-name .gv-task-name {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  display: block !important;
  max-width: 100% !important;
}
.gv-tbl-row .col-name > div > span {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  max-width: 100% !important;
}
/* ═══ MOBILE RESPONSIVE — card layout for task rows ═══ */
@media (max-width:767px) {
  .gv-col-header { display: none !important; }

  /* Card layout: name on top, metadata below */
  .gv-tbl-row {
    flex-wrap: wrap !important;
    padding: 10px 32px 8px 10px !important;
    gap: 0 !important;
    position: relative !important;
    min-height: auto !important;
    align-items: flex-start !important;
  }

  /* Hide drag handle + expand chevron take minimal space */
  .gv-tbl-row .gv-tbl-drag { display: none !important; }
  .gv-tbl-row .gv-tbl-expand { width: 14px !important; flex-shrink: 0 !important; order: 0 !important; margin-top: 2px !important; }

  /* Task name — full width, allow wrapping up to 2 lines */
  .gv-tbl-row .col-name {
    flex: 1 1 0% !important;
    min-width: 0 !important;
    max-width: none !important;
    width: auto !important;
    padding: 0 0 4px 0 !important;
    order: 1 !important;
    overflow: hidden !important;
  }
  .gv-tbl-row .col-name .gv-task-name {
    font-size: 13px !important;
    font-weight: 600 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    display: block !important;
    max-width: 100% !important;
  }

  /* Action menu — pinned top-right corner */
  .gv-tbl-row .col-act {
    flex: 0 0 24px !important;
    width: 24px !important;
    position: absolute !important;
    top: 8px !important;
    right: 6px !important;
    order: 2 !important;
  }

  /* ── Bottom metadata row: flows left to right as compact pills ── */
  /* Force these onto a second line by making them appear AFTER col-name */
  .gv-tbl-row .col-timer { order: 10 !important; }
  .gv-tbl-row .col-pri   { order: 11 !important; }
  .gv-tbl-row .col-date  { order: 12 !important; }
  .gv-tbl-row .col-status { order: 13 !important; }

  .gv-tbl-row .col-timer,
  .gv-tbl-row .col-pri,
  .gv-tbl-row .col-date,
  .gv-tbl-row .col-status {
    flex: 0 0 auto !important;
    width: auto !important;
    min-width: auto !important;
    max-width: none !important;
    padding: 0 6px 0 0 !important;
    justify-content: flex-start !important;
    display: inline-flex !important;
    align-items: center !important;
  }

  /* Timer: vertical layout (button on top, time below), hide remaining time */
  .gv-tbl-row .col-timer {
    flex-direction: column !important;
    align-items: center !important;
    gap: 0 !important;
  }
  .gv-tbl-row .col-timer > div {
    flex-direction: column !important;
    align-items: center !important;
    gap: 2px !important;
    flex-wrap: nowrap !important;
  }
  /* Hide the remaining deadline time on mobile (⏰ 6h59m) */
  .gv-tbl-row .col-timer > div > span[title="Deadline passed"],
  .gv-tbl-row .col-timer > div > span[title="Time remaining"] {
    display: none !important;
  }
  .gv-tbl-row .col-timer button {
    width: 22px !important;
    height: 22px !important;
    min-width: 22px !important;
  }
  .gv-tbl-row .col-timer span {
    font-size: 9px !important;
  }

  /* Priority pill — compact */
  .gv-tbl-row .col-pri > span {
    font-size: 9px !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
  }

  /* Date — compact */
  .gv-tbl-row .col-date span { font-size: 9px !important; }
  .gv-tbl-row .col-date svg { width: 10px !important; height: 10px !important; }

  /* Status pill — compact */
  .gv-tbl-row .col-status > span {
    font-size: 8px !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
  }

  /* Section headers — tighter */
  .gv-tbl-row { margin: 4px 6px !important; border-radius: 8px !important; }

  /* Subtask rows */
  .gv-tbl-row.subtask-row { margin-left: 20px !important; margin-right: 6px !important; }
}

/* ═══ VERY SMALL SCREENS (≤ 380px) ═══ */
@media (max-width:380px) {
  .gv-tbl-row { padding: 8px 28px 6px 8px !important; }
  .gv-tbl-row .col-name .gv-task-name { font-size: 12px !important; }
  /* Hide status on tiny screens */
  .gv-tbl-row .col-status { display: none !important; }
  .gv-tbl-row .col-pri > span { font-size: 8px !important; padding: 1px 4px !important; }
  .gv-tbl-row .col-date span { font-size: 8px !important; }
}
    /* === EDIT-17: comprehensive visual fixes === */

    /* Hide checkbox from rows */
    .gv-tbl-check { display: none !important; }

    /* Timer column: horizontal layout, circular button */
    /* (timer width: in edit-18) */
    .gv-tbl-row .col-timer > div { flex-direction: row !important; gap: 5px !important; }
    .gv-tbl-row .col-timer button { border-radius: 50% !important; width: 38px !important; height: 38px !important; }

    /* Subtask row: no border at all */
    .gv-tbl-row.subtask-row { border: none !important; box-shadow: none !important; }
    .gv-tbl-row.subtask-row::before,
    .gv-tbl-row.subtask-row::after { display: none !important; }

    /* Emoji picker: ensure full visibility */
    em-emoji-picker,
    [class*="EmojiPicker"],
    [class*="emoji-picker"],
    [data-emoji-picker] {
      position: absolute !important;
      bottom: 100% !important;
      left: 0 !important;
      z-index: 9999 !important;
      background: #fff !important;
      border: 1px solid #E5E7EB !important;
      border-radius: 12px !important;
      box-shadow: 0 -4px 24px rgba(0,0,0,0.12) !important;
      max-height: 320px !important;
      overflow-y: auto !important;
    }


    /* === Priority context menu === */
.gv-pri-ctx {
  position: fixed; z-index: 9999;
  background: #fff; border: 1px solid #E5E7EB; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15,23,42,0.14);
  padding: 6px; min-width: 160px;
  animation: ctx-in 0.12s ease;
}
.gv-pri-ctx-title {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: #94A3B8;
  padding: 4px 10px 8px; border-bottom: 1px solid #F1F5F9; margin-bottom: 4px;
}
.gv-pri-ctx-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: 6px; cursor: pointer;
  font-size: 12px; font-weight: 500; color: #374151;
  transition: background 0.1s; border: none; background: none;
  width: 100%; font-family: var(--font); text-align: left;
}
.gv-pri-ctx-item:hover { background: #F5F4FF; color: #1B4F8A; }
.gv-pri-ctx-item.active { background: #EBF2FA; color: #1B4F8A; font-weight: 700; }

/* === Task row separation — card with clear borders === */
.gv-tbl-row {
  border: 1px solid #E8EBF0 !important;
  border-bottom: 1px solid #E8EBF0 !important;
  background: #fff !important;
}
.gv-tbl-row:nth-child(even) { background: #FAFBFD !important; }
.gv-tbl-row:hover { background: #F5F7FF !important; border-color: #C7D2FE !important; }
.gv-tbl-row.selected { background: #EBF2FA !important; border-color: #93C5FD !important; border-left: 3px solid #1B4F8A !important; }

    /* Timeline/Kanban placeholder views */
    .gv-timeline-view, .gv-kanban-view {
      flex: 1; display: flex; flex-direction: column;
      
    }
    .gv-kanban-board {
      display: flex; gap: 12px; flex: 1;
      overflow-x: auto; padding-bottom: 12px;
    }
    .gv-kanban-col {
      min-width: 220px; max-width: 280px; flex: 1;
      background: #F8F9FB; border-radius: 10px;
      border: 1px solid #ECEEF3; display: flex; flex-direction: column;
    }
    .gv-kanban-col-head {
      padding: 10px 12px; font-size: 11px; font-weight: 700;
      display: flex; align-items: center; gap: 6;
      border-bottom: 1px solid #ECEEF3;
    }
    .gv-kanban-card {
      margin: 6px 8px; padding: 10px 12px;
      background: #fff; border: 1px solid #ECEEF3;
      border-radius: 8px; cursor: pointer;
      transition: box-shadow 0.12s;
    }
    .gv-kanban-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }

    /* Timeline bars */
    .gv-tl-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 0; border-bottom: 1px solid #F3F4F6;
    }
    .gv-tl-bar {
      height: 24px; border-radius: 6px;
      display: flex; align-items: center; padding: 0 8px;
      font-size: 10px; font-weight: 600; color: #fff;
      white-space: nowrap; overflow: hidden;
    }


    /* 1. Remove colored left border from task rows -- user says it looks bad */
    .gv-tbl-row::before { display: none !important; }

    /* 2. Scale everything down slightly */
    .gv-lp-title { font-size: 16px !important; }
    .gv-img2-toptab { font-size: 12px !important; padding: 6px 10px !important; }
    .gv-img2-toptabs { padding: 8px 12px 0 !important; }
    .gv-img2-pill { padding: 4px 10px !important; font-size: 11px !important; }
    .gv-img2-pillrow { padding: 8px 12px !important; gap: 5px !important; }
    .gv-tbl-row { min-height: 50px !important; padding: 6px 6px 6px 10px !important; margin: 4px 8px !important; border-radius: 8px !important; }
    .gv-tbl-row .gv-task-name { font-size: 12px !important; }
    .gv-grp-badge { font-size: 12px !important; }
    .gv-grp-count { font-size: 10px !important; padding: 1px 7px !important; }
    .gv-chat-hero { height: 60px !important; }
    .gv-chat-head.gv-desk-only { padding: 8px 16px !important; min-height: 44px !important; }
    .gv-chat-head.gv-desk-only .gv-chat-task-name { font-size: 14px !important; }
    .gv-chat-head.gv-desk-only .gv-chat-badge { padding: 3px 8px !important; font-size: 10px !important; }
    .gv-chat-act-btn { width: 28px !important; height: 28px !important; border-radius: 7px !important; }
    .gv-img2-tabs { padding: 0 16px !important; }
    .gv-img2-tab { padding: 8px 10px !important; font-size: 11.5px !important; }
    .gv-chat-team-strip { padding: 6px 16px !important; }

    /* 3. Fix vertical alignment of ALL columns in task rows */
    .gv-tbl-row { align-items: center !important; }
    .gv-tbl-row .col-name { align-items: flex-start !important; }
    .gv-tbl-row .col-timer { display: flex !important; align-items: center !important; justify-content: center !important; }
    .gv-tbl-row .col-pri { display: flex !important; align-items: center !important; }
    .gv-tbl-row .col-date { display: flex !important; align-items: center !important; }
    .gv-tbl-row .col-status { display: flex !important; align-items: center !important; }
    .gv-tbl-row .col-act { display: flex !important; align-items: center !important; justify-content: center !important; }
    .gv-tbl-row .gv-tbl-drag { display: flex !important; align-items: center !important; }
    .gv-tbl-row .gv-tbl-check { display: flex !important; align-items: center !important; }
    .gv-tbl-row .gv-tbl-expand { display: flex !important; align-items: center !important; }

    /* (column widths: consolidated into edit-18) */

    /* (edit-15 input bar: consolidated into edit-16) */

    /* 6. Subtask row: no left border either */
    .gv-tbl-row.subtask-row::before { display: none !important; }

    /* 7. Filter icon button - ensure it is clickable */
    .gv-img2-filters-btn { cursor: pointer !important; position: relative !important; z-index: 1 !important; }

    /* Mobile: collapse outer card padding */
    @media (max-width:767px) {
      .gv-root { padding:0; gap:0; background:#fff; }
      .gv-list-panel, .gv-chat, .gv-detail { border-radius:0; border-left:none !important; border-right:none !important; box-shadow:none; margin-left:0; }
      .gv-chat-hero { display:none; }
    }

    /* ════════════════════════════════════════════════════════════════════
       ✦ FLAT / SIMPLE OVERRIDE — removes cartoon look (must be last to win)
       ════════════════════════════════════════════════════════════════════ */
    .gv-root { background:#F5F6FA !important; }
    .gv-list-panel, .gv-chat, .gv-detail {
      border-radius:8px !important;
      box-shadow:none !important;
      border:1px solid #E5E7EB !important;
    }
    .gv-tbl-row::before { display:none !important; }
    .gv-tbl-row {
      border:1px solid #E5E7EB !important;
      border-radius:6px !important;
      background:#fff !important;
      box-shadow:none !important;
      margin:4px 10px !important;
      min-height:50px !important;
      padding:8px 6px 8px 12px !important;
      transform:none !important;
      transition:background 0.12s, border-color 0.12s !important;
    }
    .gv-tbl-row:nth-child(even) { background:#fff !important; }
    .gv-tbl-row:hover {
      background:#F8FAFC !important;
      border-color:#D7DDE8 !important;
      transform:none !important;
      box-shadow:none !important;
    }
    .gv-tbl-row.selected {
      background:#F0F5FF !important;
      border-color:#C7D2FE !important;
      border-left:3px solid #1B4F8A !important;
      box-shadow:none !important;
    }
    .gv-tbl-row.subtask-row {
      border:1px solid #EEF1F5 !important;
      background:#FCFCFD !important;
      box-shadow:none !important;
    }
    .gv-tbl-row.subtask-row::before,
    .gv-tbl-row.subtask-row::after { display:none !important; }
    .gv-grp-count {
      background:#F1F5F9 !important;
      color:#475569 !important;
      font-weight:600 !important;
      border:1px solid #E5E7EB !important;
    }
    .gv-stat { border-radius:6px !important; }
    .gv-stat.active-tab { background:#1B4F8A !important; border-color:#1B4F8A !important; }
    .gv-msg-group.me .gv-bubble {
      background:#1B4F8A !important;
      box-shadow:none !important;
    }
    .gv-tool-btn { box-shadow:none !important; border-radius:6px !important; }
    .gv-tool-btn.active {
      background:#EBF2FA !important;
      color:#1B4F8A !important;
      border-color:#C7D2FE !important;
      box-shadow:none !important;
    }
    .gv-tool-btn.active::after { display:none !important; }
    .gv-chat-team-avatars .gv-team-av,
    .gv-chat-team-avatars .gv-chat-team-more {
      background:#1B4F8A !important;
      box-shadow:none !important;
    }
  `;


  return (
    <>

      <style>{STYLES}</style>

      {/* ── Priority changed toast — top-right ── */}
      {/* ── Drag cross-level warning modal ── */}
      {dragWarnModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
          zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(3px)", padding: 16, fontFamily: "var(--font)",
        }}>
          <div style={{
            background: "#fff", borderRadius: 16, width: "min(420px,96vw)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.22)", overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #FEF3C7", background: "#FFFBEB" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: "#FEF3C7", border: "1px solid #FDE68A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>⚠️</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#92400E" }}>Move task to different location?</div>
                  <div style={{ fontSize: 12, color: "#B45309", marginTop: 2 }}>This will change the task hierarchy</div>
                </div>
              </div>
            </div>
            {/* Body */}
            <div style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, marginBottom: 12 }}>
                <strong>"{dragWarnModal.dragTitle}"</strong> will be moved{" "}
                {dragWarnModal.isRootMove
                  ? <span>to the <strong>root level</strong> (becomes a parent task)</span>
                  : <span>under <strong>"{dragWarnModal.dropTitle}"</strong>'s parent</span>
                }.
              </div>
              <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "#166534" }}>
                ✅ <strong>No data will be lost</strong> — all messages, reports, timer history, and attachments stay intact. Only the position changes.
              </div>
            </div>
            {/* Footer */}
            <div style={{ padding: "12px 20px 16px", display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid #F1F5F9" }}>
              <button onClick={() => setDragWarnModal(null)}
                style={{ padding: "8px 18px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#F9FAFB", color: "#64748B", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel — keep position
              </button>
              <button onClick={() => {
                const { dragId, dropOnTaskId, newParentId } = dragWarnModal;
                setDragWarnModal(null);
                executeDrop(dragId, dropOnTaskId, newParentId);
              }}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#D97706", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Yes, move it
              </button>
            </div>
          </div>
        </div>
      )}

      {priorityToast && (
        <div style={{
          position: "fixed", top: 20, right: 24, zIndex: 9999,
          background: "#1E293B", color: "#fff",
          padding: "10px 16px", borderRadius: 12,
          fontSize: 12, fontWeight: 600, fontFamily: "inherit",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          display: "flex", alignItems: "center", gap: 8, maxWidth: 320,
          animation: "timerToastIn 0.2s ease-out",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FACC15" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
          </svg>
          <div>
            <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 400, marginBottom: 1 }}>
              Priority updated{priorityToast.taskTitle ? ` · ${priorityToast.taskTitle.slice(0, 22)}${priorityToast.taskTitle.length > 22 ? "…" : ""}` : ""}
            </div>
            <div>{priorityToast.label}</div>
          </div>
        </div>
      )}

      {/* ── Task Timer Toast notification ── */}
      {timerToast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          background: timerToast.type === "switch" ? "#1E293B" : timerToast.type === "pause" ? "#334155" : "#166534",
          color: "#fff", padding: "10px 18px", borderRadius: 12,
          fontSize: 12, fontWeight: 500, fontFamily: "inherit",
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          display: "flex", alignItems: "center", gap: 8, maxWidth: 360,
          animation: "timerToastIn 0.25s ease-out",
        }}>
          <span style={{ fontSize: 16 }}>{timerToast.type === "switch" ? "⏱" : timerToast.type === "pause" ? "⏸" : "▶"}</span>
          <span>{timerToast.message}</span>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <ImageLightbox
          url={lightboxImage}
          onClose={() => setLightboxImage(null)}
          onDownload={() => downloadImage(lightboxImage)}
        />
      )}

      <div className="gv-root" ref={rootRef}>

        {/* COL-1: FULL-WIDTH TABLE / COMPACT LIST PANEL */}
        {(() => {
          const STATUS_GROUPS_TABLE = [
            { key: "open", label: "Not Started", color: "#EF4444", bg: "#FEF2F2", dot: "#EF4444" },
            { key: "pending_deadline_approval", label: "Deadline Pending", color: "#D97706", bg: "#FFFBEB", dot: "#D97706" },
            { key: "pending_employee_deadline_confirmation", label: "Employee Confirming", color: "#7C3AED", bg: "#F5F3FF", dot: "#7C3AED" },
            { key: "deadline_approved", label: "Deadline Approved", color: "#059669", bg: "#ECFDF5", dot: "#059669" },
            { key: "confirmed", label: "Confirmed", color: "#5B5EF4", bg: "#EDEDFE", dot: "#5B5EF4" },
            { key: "in_progress", label: "In Progress", color: "#8B5CF6", bg: "#F3E8FF", dot: "#8B5CF6" },
            { key: "done", label: "Done", color: "#16A34A", bg: "#DCFCE7", dot: "#16A34A" },
          ];



          // For employees: show ALL tasks assigned to them (including forwarded subtasks)
          // For CEO/TL: show only root tasks (they see full hierarchy via subtask expansion)
          // Deduplicate allTasks first — guards against any race condition duplicates
          const dedupedTasks = [...new Map(allTasks.map(t => [t.taskId, t])).values()];
          const rootTasks = (role === "employee"
            ? dedupedTasks.filter(t => !t.parentTaskId || !allTaskMapRef.current.has(t.parentTaskId))
            : dedupedTasks.filter(t => !t.parentTaskId)
          ).filter(t => isGoalView ? t.isGoal : true);
          const filteredRoots = rootTasks.filter(t => {
            const q = listSearch.toLowerCase();
            const matchQ = !q || t.title?.toLowerCase().includes(q) || t.taskId?.toLowerCase().includes(q);

            const matchSt = viewFilter === "completed"
              ? true
              : activeStatTab === "all"
                ? true  // show ALL including done — user wants to see completed tasks
                : (activeStatTab === "open" && ["open", "pending_deadline_approval", "deadline_approved"].includes(t.status))
                || (activeStatTab === "in_progress" && (t.status === "in_progress" || t.status === "confirmed"))
                || (activeStatTab === "done" && t.status === "done");

            // Department filter — checks assignee's dept from full employee record
            const matchDept = !filterDept || (() => {
              const dl = filterDept.toLowerCase();
              if (t.department?.toLowerCase().includes(dl)) return true;
              return (t.assigneeIds || []).some(aid => {
                const emp = employeeMapFull.get(aid);
                return emp?.department?.toLowerCase().includes(dl);
              });
            })();
            // Employee name filter
            const matchEmp = !filterEmployee || (() => {
              const el = filterEmployee.toLowerCase();
              return (t.assigneeIds || []).some(aid => {
                const name = employeeMap.get(aid) || t.assigneeNameMap?.[aid] || "";
                return name.toLowerCase().includes(el);
              });
            })();
            // Deadline quick filter: tomorrow / week / month
            const matchDate = (() => {
              if (!filterDeadline && !filterDateFrom && !filterDateTo) return true;
              const td = t.dueDate || t.startDate;
              if (!td) return false;
              const tMs = new Date(td).getTime();
              if (isNaN(tMs)) return false;
              if (filterDeadline) {
                const now = new Date(); now.setHours(0, 0, 0, 0);
                const tom = new Date(now); tom.setDate(tom.getDate() + 1);
                if (filterDeadline === "tomorrow") {
                  const tomEnd = new Date(tom); tomEnd.setHours(23, 59, 59, 999);
                  return tMs >= tom.getTime() && tMs <= tomEnd.getTime();
                }
                if (filterDeadline === "week") {
                  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7); weekEnd.setHours(23, 59, 59, 999);
                  return tMs >= tom.getTime() && tMs <= weekEnd.getTime();
                }
                if (filterDeadline === "month") {
                  const monthEnd = new Date(now); monthEnd.setDate(monthEnd.getDate() + 30); monthEnd.setHours(23, 59, 59, 999);
                  return tMs >= tom.getTime() && tMs <= monthEnd.getTime();
                }
              }
              if (filterDateFrom && tMs < new Date(filterDateFrom).getTime()) return false;
              if (filterDateTo && tMs > new Date(filterDateTo + "T23:59:59").getTime()) return false;
              return true;
            })();
            const matchView = (() => {
              if (!viewFilter) return true;
              if (viewFilter === "completed") return t.status === "done";
              const td = t.dueDate || t.startDate;
              if (viewFilter === "overdue") {
                if (t.status === "done") return false;
                if (!td) return false;
                const tMs = new Date(td).getTime();
                return !isNaN(tMs) && tMs < Date.now();
              }
              if (!td) return false;
              const tMs = new Date(td).getTime();
              if (isNaN(tMs)) return false;
              if (viewFilter === "today") {
                const s = new Date(); s.setHours(0, 0, 0, 0);
                const e = new Date(); e.setHours(23, 59, 59, 999);
                return tMs >= s.getTime() && tMs <= e.getTime();
              }
              if (viewFilter === "week") {
                const s = new Date(); s.setHours(0, 0, 0, 0);
                const e = new Date(); e.setDate(e.getDate() + 7); e.setHours(23, 59, 59, 999);
                return tMs >= s.getTime() && tMs <= e.getTime();
              }
              return true;
            })();
            return matchQ && matchSt && matchDept && matchEmp && matchDate && matchView && (isGoalView ? true : !t.isGoal);
          });

          // Priority is POSITIONAL — drag-drop sets it (P1=top, P5+=bottom)
          // Tasks sort by priority so drag-drop reorders are immediately visible.
          const getCreatedMs = (t) => {
            if (t?.createdAt?.seconds) return t.createdAt.seconds * 1000;
            if (typeof t?.createdAt === "number") return t.createdAt;
            if (typeof t?.createdAt === "string") {
              const ms = new Date(t.createdAt).getTime();
              return isNaN(ms) ? 0 : ms;
            }
            return 0;
          };

          filteredRoots.sort((a, b) => {
            // Prefer explicit `order` (set by drag-drop), else use priority
            const ao = a.order !== undefined ? a.order : (Number(a.priority ?? 5)) * 1000;
            const bo = b.order !== undefined ? b.order : (Number(b.priority ?? 5)) * 1000;
            if (ao !== bo) return ao - bo;
            // Same priority bucket → newest first
            return getCreatedMs(b) - getCreatedMs(a);
          });

          // Store for drag-drop reference
          visibleTaskListRef.current = filteredRoots;



          const AvatarStack = ({ t }) => {
            const ids = t.assigneeIds || [];
            const shown = ids.slice(0, 3);
            const extra = ids.length - 3;
            const names = ids.map((id, i) => employeeMap?.get(id) || t.assigneeNameMap?.[id] || t.assigneeNames?.[i] || id);
            return (
              <div className="gv-avatar-stack">
                <div style={{ display: "flex" }}>
                  {shown.map((id, i) => {
                    const name = employeeMap?.get(id) || t.assigneeNameMap?.[id] || (t.assigneeNames?.[idx] ?? null) || id || "?";
                    const picUrl = employeeMapFull?.get(id)?.profilePicUrl || "";
                    const [c1, c2] = getAvatarColors(name);
                    return (
                      picUrl ? (
                        <img key={id} src={picUrl} alt={name} style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", marginLeft: i > 0 ? -6 : 0, flexShrink: 0, position: "relative", zIndex: shown.length - i }} />
                      ) : (
                        <div key={id} style={{ width: 20, height: 20, borderRadius: "50%", background: `linear-gradient(135deg,${c1},${c2})`, color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff", marginLeft: i > 0 ? -6 : 0, flexShrink: 0, position: "relative", zIndex: shown.length - i }}>
                          {name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                      )
                    );
                  })}
                  {extra > 0 && <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--bg2)", color: "var(--text-3)", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff", marginLeft: -6 }}>+{extra}</div>}
                </div>
                <div className="gv-avatar-stack-tip">
                  <div style={{ fontWeight: 700, fontSize: 9, color: "#98A2B3", marginBottom: 3, textTransform: "uppercase" }}>Assigned to</div>
                  {names.slice(0, 6).map((n, i) => <div key={i} style={{ padding: "1px 0" }}>{n}</div>)}
                  {!names.length && <div>Unassigned</div>}
                </div>
              </div>
            );
          };

          const TblRow = ({ t, depth = 0, isSubtask = false }) => {
            const dl = getDeadlineInfo(t.dueDate, t.deadlineWindowSecs || 0, 0);
            const st = STATUS[t.status] || STATUS.open;
            const p = getPriDisplay(t.priority);
            // Only show expand arrow for subtasks visible to current user
            const allSubtaskIds = t.subtaskIds || [];
            const visibleSubtaskIds = isCEO
              ? allSubtaskIds.filter(sid => {
                const s = allTaskMap.get(sid);
                return s && (s.createdByCeo === true || (s.assignedBy === employeeId && !s.createdByTl));
              })
              : isEmployee
                // Employee: FLATTEN the subtree — skip intermediate nodes, show only their tasks directly
                ? (() => {
                  const getMyTasks = (taskId, seen = new Set()) => {
                    if (seen.has(taskId)) return [];
                    seen.add(taskId);
                    const node = allTaskMapRef.current.get(taskId);
                    if (!node) return [];
                    const result = [];
                    for (const sid of (node.subtaskIds || [])) {
                      const sub = allTaskMapRef.current.get(sid);
                      if (!sub) continue;
                      if ((sub.assigneeIds || []).includes(employeeId) || sub.assignedBy === employeeId) {
                        result.push(sid); // This is my task — show it directly
                      } else {
                        // Not my task — go deeper, flatten
                        result.push(...getMyTasks(sid, seen));
                      }
                    }
                    return result;
                  };
                  return getMyTasks(t.taskId);
                })()
                : allSubtaskIds;
            const hasChildren = visibleSubtaskIds.length > 0;
            const isExp = expandedIds.has(t.taskId);
            const isSel = task?.taskId === t.taskId;
            const unread = unreadCounts?.[t.taskId] || 0;
            return (
              <>
                <div className={`gv-tbl-row${isSel ? " selected" : ""}${isSubtask ? " subtask-row" : ""}`}
                  data-grp={(t.assigneeIds || []).includes(employeeId) ? "assigned" : (t.assignedBy === employeeId ? "created" : "other")}
                  style={{ paddingLeft: 8 + depth * 18 }}
                  draggable={canDrag}
                  onDragStart={e => {
                    if (!canDrag) { e.preventDefault(); return; }
                    dragTaskIdRef.current = t.taskId;
                    dragOverIdRef.current = null;
                    e.dataTransfer.effectAllowed = "move";
                    // Use task title as ghost — NO setState to avoid re-render killing drag
                    const ghost = document.createElement("div");
                    ghost.textContent = "↕ " + (t.title || "Task");
                    ghost.style.cssText = "position:fixed;top:-999px;left:-999px;background:#4F46E5;color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;font-family:inherit;white-space:nowrap;box-shadow:0 4px 16px rgba(79,70,229,0.4);pointer-events:none;";
                    document.body.appendChild(ghost);
                    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 16);
                    setTimeout(() => ghost.remove(), 100);
                    // Mark dragging via DOM class only — no setState
                    e.currentTarget.classList.add("gv-dragging");
                    e.currentTarget.dataset.dragSrc = t.taskId;
                  }}
                  onDragOver={e => {
                    e.preventDefault();
                    if (!canDrag || dragTaskIdRef.current === t.taskId) {
                      e.dataTransfer.dropEffect = "none";
                      return;
                    }
                    e.dataTransfer.dropEffect = "move";
                    // Only update if target changed — via DOM class manipulation, no setState
                    if (dragOverIdRef.current !== t.taskId) {
                      if (dragOverIdRef.current) {
                        document.querySelectorAll(".gv-drag-over").forEach(el => el.classList.remove("gv-drag-over"));
                      }
                      dragOverIdRef.current = t.taskId;
                      e.currentTarget.classList.add("gv-drag-over");
                    }
                  }}
                  onDragLeave={e => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      e.currentTarget.classList.remove("gv-drag-over");
                      if (dragOverIdRef.current === t.taskId) dragOverIdRef.current = null;
                    }
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("gv-drag-over");
                    document.querySelectorAll(".gv-dragging").forEach(el => el.classList.remove("gv-dragging"));
                    const dragId = dragTaskIdRef.current;
                    dragOverIdRef.current = null;
                    dragTaskIdRef.current = null;
                    handleDrop(t.taskId, dragId);
                  }}
                  onDragEnd={e => {
                    e.currentTarget.classList.remove("gv-dragging");
                    document.querySelectorAll(".gv-drag-over").forEach(el => el.classList.remove("gv-drag-over"));
                    dragTaskIdRef.current = null;
                    dragOverIdRef.current = null;
                  }}
                  onClick={e => {
                    // Don't select task if expand button was clicked
                    if (e.target.closest(".gv-tbl-expand") || e.target.closest(".gv-tbl-check") || e.target.closest(".gv-tbl-drag") || e.target.closest(".col-act") || e.target.closest(".col-timer")) return;
                    handleSelectNode(t);
                  }}
                  onMouseEnter={() => handleHoverPrefetch(t.taskId)}>
                  {canDrag && <div className="gv-tbl-drag" title="Drag to reorder" style={{ cursor: "grab" }}><svg width="9" height="12" viewBox="0 0 9 12" fill="currentColor"><circle cx="3" cy="2" r="1.1" /><circle cx="6" cy="2" r="1.1" /><circle cx="3" cy="6" r="1.1" /><circle cx="6" cy="6" r="1.1" /><circle cx="3" cy="10" r="1.1" /><circle cx="6" cy="10" r="1.1" /></svg></div>}
                  {/* checkbox removed per user request */}
                  <div className="gv-tbl-expand"
                    onMouseDown={e => {
                      if (hasChildren) {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleExpand(t.taskId);
                      }
                    }}
                    onClick={e => { if (hasChildren) { e.stopPropagation(); e.preventDefault(); } }}
                    style={{ cursor: hasChildren ? "pointer" : "default" }}
                  >
                    {hasChildren && <span style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-4)" }}>
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ transform: isExp ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}><path d="M2.5 1.5l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>}
                  </div>
                  <div className="col-name" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2, overflow: "hidden", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%", minWidth: 0, overflow: "hidden" }}>
                      <span className={`gv-task-name${t.status === "done" ? " done-line" : ""}`} style={t.isSelfAssigned ? { color: "#7C3AED" } : {}}>{t.title}</span>
                      {t.isSelfAssigned && (
                        <span style={{ fontSize: 8, fontWeight: 700, background: "#F5F3FF", color: "#7C3AED", border: "1px solid #DDD6FE", borderRadius: 4, padding: "1px 5px", flexShrink: 0, letterSpacing: "0.03em", whiteSpace: "nowrap" }}>SELF</span>
                      )}
                      {unread > 0 && <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: "#16A34A", padding: "1px 5px", borderRadius: 99, flexShrink: 0 }}>{unread > 99 ? "99+" : unread}</span>}
                      {dl.status === "overdue" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--danger)", flexShrink: 0, display: "inline-block", marginLeft: 3 }} />}
                    </div>
                    {t.assignedBy && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9.5, color: "var(--text-4)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                        {/* Curved arrow SVG — corner-down-right style, purple tint */}
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.7 }}>
                          <path d="M3 2 L3 7 Q3 9 5 9 L10 9" stroke="#8B5CF6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                          <polyline points="8,7 10,9 8,11" stroke="#8B5CF6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                        By {t.assignedBy === employeeId ? <span style={{ color: "#5B5EF4", fontWeight: 600 }}>you</span> : <span style={{ color: "var(--text-3)", fontWeight: 600 }}>{employeeMap?.get(t.assignedBy) || t.assignedByName || t.assignedBy}</span>}
                      </span>
                    )}
                    {/* Assigned to: show assignee names */}

                    {(t.assigneeIds || []).length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginTop: 2 }}>
                        {(t.assigneeIds || []).slice(0, 3).map((id, i) => {
                          const nm = employeeMap?.get(id) || t.assigneeNameMap?.[id] || (t.assigneeNames || [])[i] || id;
                          const picUrl = employeeMapFull?.get(id)?.profilePicUrl || "";
                          const [c1, c2] = getAvatarColors(nm || id);
                          const initials = (nm || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                          return (
                            <span key={id} style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              background: "#F1F5F9", borderRadius: 99,
                              padding: "1px 7px 1px 2px",
                              border: "1px solid #E2E8F0",
                              fontSize: 10, fontWeight: 500, color: "#374151",
                              whiteSpace: "nowrap", flexShrink: 0,
                            }}>
                              {picUrl ? (
                                <img src={picUrl} alt={nm} style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                              ) : (
                                <span style={{ width: 16, height: 16, borderRadius: "50%", background: `linear-gradient(135deg,${c1},${c2})`, color: "#fff", fontSize: 7, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  {initials}
                                </span>
                              )}
                              {nm}
                            </span>
                          );
                        })}
                        {(t.assigneeIds || []).length > 3 && (
                          <span style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 99, padding: "1px 6px" }}>
                            +{t.assigneeIds.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="col-timer" onClick={e => e.stopPropagation()}>
                    {(() => {
                      const isAssigneeOfThis = (t.assigneeIds || []).includes(employeeId);
                      const canControl = isAssigneeOfThis;
                      const canView = isAssigneeOfThis || isCEO || isTL;
                      if (!canView) return null;
                      // Repeat task without timer — show a small repeat badge instead
                      if (t.isRepeat && !t.repeatConfig?.hasTimer) return (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#EFF6FF", color: "#1D4ED8", letterSpacing: "0.03em" }}>🔁</span>
                          <span style={{ fontSize: 9, color: "#94A3B8" }}>{t.repeatConfig?.frequency || "daily"}</span>
                        </div>
                      );
                      if (t.isThirdParty) return (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#F5F3FF", color: "#6D28D9" }}>🔗</span>
                          <span style={{ fontSize: 9, color: "#94A3B8" }}>vendor</span>
                        </div>
                      );
                      if (t.isGoal) return (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#FDF4FF", color: "#7E22CE" }}>🎯</span>
                          <span style={{ fontSize: 9, color: "#94A3B8" }}>goal</span>
                        </div>
                      );
                      // Normal task without timer — show fixed deadline date instead
                      if (!t.hasTimer && t.fixedDeadline) return (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#F0FDF4", color: "#166534" }}>📅</span>
                          <span style={{ fontSize: 9, color: "#94A3B8" }}>{new Date(t.fixedDeadline).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                        </div>
                      );
                      const isRunning = timerActiveTaskId === t.taskId;
                      const secs = getDisplaySeconds(t.taskId);
                      const sess = getTimerSession(t.taskId);
                      const hasTime = (sess?.totalSeconds || 0) > 0 || isRunning;
                      // Block timer when awaiting deadline approval (can still pause if running)
                      const timerBlocked = !["deadline_approved", "confirmed", "in_progress", "done"].includes(t.status) && !isRunning;
                      return (
                        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {/* Button only for assignees — only show after task is confirmed/in_progress */}
                          {canControl && (["confirmed", "in_progress", "deadline_approved", "done"].includes(t.status) || isRunning || (sess?.totalSeconds || 0) > 0) && (
                            <button
                              disabled={timerBlocked}
                              onClick={e => {
                                e.stopPropagation();
                                if (timerBlocked) return;
                                if (isRunning) handleTimerPause(t.taskId, t.title);
                                else handleTimerStart(t.taskId, t.title);
                              }}
                              style={{
                                width: 38, height: 38, borderRadius: 99, border: "1.5px solid",
                                borderColor: timerBlocked ? "#FDE68A" : isRunning ? "#BBF7D0" : "#E2E8F0",
                                background: timerBlocked ? "#FFFBEB" : isRunning ? "#DCFCE7" : "#F8FAFC",
                                color: timerBlocked ? "#D97706" : isRunning ? "#16A34A" : "#94A3B8",
                                cursor: timerBlocked ? "not-allowed" : "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0, transition: "all 0.15s",
                                opacity: timerBlocked ? 0.6 : 1,
                              }}
                              onMouseEnter={e => { if (!timerBlocked) { e.currentTarget.style.borderColor = isRunning ? "#86EFAC" : "#6366F1"; e.currentTarget.style.color = isRunning ? "#15803D" : "#4F46E5"; } }}
                              onMouseLeave={e => { if (!timerBlocked) { e.currentTarget.style.borderColor = isRunning ? "#BBF7D0" : "#E2E8F0"; e.currentTarget.style.color = isRunning ? "#16A34A" : "#94A3B8"; } }}
                              title={timerBlocked ? "Waiting for deadline approval" : isRunning ? "Pause" : (hasTime ? "Resume" : "Start")}
                            >
                              {isRunning
                                ? <svg width="15" height="15" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1.5" width="3" height="9" rx="1" /><rect x="7" y="1.5" width="3" height="9" rx="1" /></svg>
                                : <svg width="15" height="15" viewBox="0 0 12 12" fill="currentColor"><path d="M2.5 1.5l8 4.5-8 4.5V1.5z" /></svg>
                              }
                            </button>
                          )}
                          {/* CEO/TL: show running indicator if someone is working */}
                          {!canControl && (() => {
                            const watchedSession = assigneeAllTimers?.get(t.taskId);
                            if (!watchedSession) return null;
                            const isWatching = watchedSession.isActive;
                            return (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                {isWatching && (
                                  <span style={{
                                    width: 7, height: 7, borderRadius: "50%",
                                    background: "#16A34A", display: "inline-block",
                                    animation: "timerPulse 1.5s ease-in-out infinite",
                                  }} title={`${watchedSession.employeeName} is working`} />
                                )}
                                <span style={{
                                  fontSize: 9, fontFamily: "monospace", fontWeight: 700,
                                  color: isWatching ? "#16A34A" : "#94A3B8",
                                  letterSpacing: "0.03em", lineHeight: 1,
                                }}>
                                  {formatTimeHMS(watchedSession.displaySeconds)}
                                </span>
                              </div>
                            );
                          })()}
                          {canControl && (isRunning || ["in_progress", "done", "confirmed", "deadline_approved"].includes(t.status)) && (
                            <span style={{
                              fontSize: 9, fontFamily: "monospace", fontWeight: 700,
                              color: isRunning ? "#16A34A" : "#94A3B8",
                              letterSpacing: "0.03em", lineHeight: 1,
                              opacity: secs === 0 && !isRunning ? 0 : 1,
                            }}>
                              {formatTimeHMS(secs)}
                            </span>
                          )}
                          {/* Remaining deadline time — renders below timer */}
                          {t.dueDate && canControl && (() => {
                            const _tw = t.deadlineWindowSecs || 0;
                            const msLeft = _tw > 0 ? (_tw - (secs || 0)) * 1000 : (t.dueDate ? new Date(t.dueDate).getTime() - Date.now() : 0);
                            const isOver = msLeft < 0;
                            const absSecs = Math.abs(Math.floor(msLeft / 1000));
                            const h = Math.floor(absSecs / 3600);
                            const m = Math.floor((absSecs % 3600) / 60);
                            const label = isOver
                              ? (h > 0 ? `-${h}h${m}m` : `-${m}m`)
                              : (h > 0 ? `${h}h${m}m` : `${m}m`);
                            const color = isOver ? "#EF4444" : msLeft < 2 * 3600 * 1000 ? "#D97706" : "#94A3B8";
                            return (
                              <span style={{ fontSize: 8, fontWeight: 700, color, letterSpacing: "0.02em", lineHeight: 1, width: "100%", textAlign: "center", marginTop: 2 }}
                                title={isOver ? "Deadline passed" : "Time remaining"}>
                                {isOver ? "⚠️ " : "⏰ "}{label}
                              </span>
                            );
                          })()}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="col-desc"><span className="gv-task-desc">{t.description || ""}</span></div>
                  <div className="col-people">
                    {/* Desktop: avatar stack */}
                    <span className="gv-desk-only"><AvatarStack t={t} /></span>
                    {/* Mobile: plain names, no avatars */}
                    <div className="gv-mob-people-names">
                      {(() => {
                        const ids = t.assigneeIds || [];
                        const shown = ids.slice(0, 6);
                        const extra = ids.length - 6;
                        const names = shown.map((id, i) => {
                          const full = (typeof employeeMap?.get === "function" ? employeeMap.get(id) : null) || t.assigneeNameMap?.[id] || (t.assigneeNames || [])[i] || id;
                          return (full || "").split(" ")[0] || id;
                        });
                        return <span style={{ fontSize: 10, fontWeight: 500, color: "var(--text-2)", lineHeight: 1.25, letterSpacing: "-0.01em", wordBreak: "break-word" }}>
                          {names.join(", ")}{extra > 0 && <span style={{ color: "var(--text-4)", fontWeight: 600 }}> +{extra}</span>}
                        </span>;
                      })()}
                    </div>
                  </div>
                  <div className="col-pri">{t.priority && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, color: p.color, background: p.bg, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ fontSize: 9 }}>⚑</span> {p.label}</span>}</div>
                  <div className="col-date">
                    {(t.deadlineWindowSecs > 0) ? (() => {
                      const _mine = getDisplaySeconds ? getDisplaySeconds(t.taskId) : 0;
                      const _watched = assigneeAllTimers?.get(t.taskId)?.displaySeconds || 0;
                      const secs = _mine || _watched;
                      if (!secs) return <span style={{ fontSize: 11, color: "var(--border2)" }}>—</span>;
                      const h = Math.floor(secs / 3600);
                      const m = Math.floor((secs % 3600) / 60);
                      const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
                      return (
                        <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                          </svg>
                          {label}
                        </span>
                      );
                    })() : (t.startDate || t.dueDate) ? (
                      <span style={{ fontSize: 11, color: dl.status === "overdue" ? "var(--danger)" : dl.status === "near" ? "var(--warn)" : "#64748B", fontWeight: dl.status !== "safe" ? 600 : 500, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}>
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        {t.startDate && <>{new Date(t.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}<span style={{ color: "var(--text-4)", margin: "0 1px" }}>→</span></>}
                        {t.dueDate && fmtLiveDeadlineDate(t, getTimerSession(t.taskId) || assigneeAllTimers?.get(t.taskId))}
                      </span>
                    ) : <span style={{ fontSize: 11, color: "var(--border2)" }}>—</span>}
                  </div>
                  <div className="col-status"><span style={{ fontSize: 10.5, fontWeight: 600, padding: "5px 12px", borderRadius: 99, color: st.color, background: st.bg, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center" }}>{st.label}</span></div>
                  <div className="col-act" onClick={e => e.stopPropagation()}>
                    <button style={{ width: 26, height: 26, border: "none", background: "transparent", cursor: "pointer", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-4)" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--bg2)"; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      onClick={e => { e.stopPropagation(); if (window.innerWidth <= 767) { setSheetTask(t); } else { setRowMenuOpen(rowMenuOpen === t.taskId ? null : t.taskId); setRowMenuPos({ x: e.clientX, y: e.clientY }); } }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                    </button>
                  </div>
                </div>
                {rowMenuOpen === t.taskId && (
                  <div className="gv-row-menu" style={{ top: Math.min(rowMenuPos.y + 4, window.innerHeight - 280), left: Math.min(rowMenuPos.x - 160, window.innerWidth - 190) }} onMouseDown={e => e.stopPropagation()}>
                    {[
                      ...(!t.isFolder ? [{ l: "Open Chat", a: () => { handleSelectNode(t); setRowMenuOpen(null); } }] : []),
                      ...((isCEO || isTL) ? [{ l: "Add Subtask", a: () => { setActiveModal({ type: "add_subtask", taskId: t.taskId, task: t }); setRowMenuOpen(null); } }] : []),
                      ...(!isCEO && !t.isFolder ? [{ l: "Forward Task", a: () => { setActiveModal({ type: "forward", taskId: t.taskId, task: t }); setRowMenuOpen(null); } }] : []),
                      ...(!isCEO && !t.isFolder ? [{ l: "Daily Report", a: () => { setActiveModal({ type: "report", taskId: t.taskId, task: t }); setRowMenuOpen(null); } }] : []),
                      ...(isCEO ? [{ l: "Edit Deadline", a: () => { setActiveModal({ type: "deadline", taskId: t.taskId, task: t }); setRowMenuOpen(null); } }] : []),
                      ...(isCEO && t.completionStatus === "submitted" && t.reviewFlow === "ceo_direct" ? [{ l: "Review Completion", a: () => { setActiveModal({ type: "review_completion", taskId: t.taskId, task: t }); setRowMenuOpen(null); } }] : []),
                      ...(isTL && t.completionStatus === "submitted" && ["tl_final", "tl_then_ceo", null, undefined].includes(t.reviewFlow) ? [{ l: "Review Submission", a: () => { setActiveModal({ type: "review_completion", taskId: t.taskId, task: t }); setRowMenuOpen(null); } }] : []),
                      ...(isCEO && t.completionStatus === "tl_approved" && t.reviewFlow === "tl_then_ceo" ? [{ l: "CEO Final Approval", a: () => { setActiveModal({ type: "ceo_review", taskId: t.taskId, task: t }); setRowMenuOpen(null); } }] : []),
                      ...((isCEO || isTL) ? [{ l: "Delete Task", d: true, a: () => { setSelectedTask(t); setShowDeleteConf(true); setRowMenuOpen(null); } }] : []),
                    ].map((item, i) => (
                      <button key={i} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, color: item.d ? "var(--danger)" : "var(--text-2)", textAlign: "left", borderRadius: 6, fontFamily: "var(--font)", transition: "background 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.background = item.d ? "#FEE2E2" : "var(--bg)"}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}
                        onClick={item.a}>
                        {item.l}
                      </button>
                    ))}
                  </div>
                )}
                {isExp && [...visibleSubtaskIds]
                  .map(sid => allTasks.find(t => t.taskId === sid) || allTaskMap.get(sid))
                  .filter(Boolean)
                  .sort((a, b) => {
                    if (a.order !== undefined || b.order !== undefined) {
                      const ao = a.order !== undefined ? a.order : 90000 + (Number(a.priority ?? 5)) * 1000;
                      const bo = b.order !== undefined ? b.order : 90000 + (Number(b.priority ?? 5)) * 1000;
                      return ao - bo;
                    }
                    const pa = Number(a.priority ?? 5), pb = Number(b.priority ?? 5);
                    if (pa !== pb) return pa - pb;
                    return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
                  })
                  .map(sub => <TblRow key={sub.taskId} t={sub} depth={depth + 1} isSubtask />)}
              </>
            );
          };

          const CompactItem = ({ t, isSubEl = false }) => {
            const dl = getDeadlineInfo(t.dueDate, t.deadlineWindowSecs || 0, 0);
            const st = STATUS[t.status] || STATUS.open;
            const isSel = task?.taskId === t.taskId;
            const unread = unreadCounts?.[t.taskId] || 0;
            const hasChildren = (t.subtaskIds || []).length > 0;
            const isExp = expandedIds.has(t.taskId);
            return (
              <>
                <div className={`gv-compact-item${isSel ? " active" : ""}`} style={{ paddingLeft: isSubEl ? 24 : 12 }} onClick={() => handleSelectNode(t)}>
                  <span style={{ width: isSubEl ? 6 : 7, height: isSubEl ? 6 : 7, borderRadius: "50%", background: st.dot, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="gv-compact-item-name" style={{ fontSize: isSubEl ? 11 : 12 }}>{t.title}</div>
                    {dl.status !== "safe" && t.dueDate && <div style={{ fontSize: 9, color: dl.status === "overdue" ? "var(--danger)" : "var(--warn)", marginTop: 1, fontWeight: 600 }}>{dl.text || ""}</div>}
                  </div>
                  {unread > 0 && <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: "#16A34A", padding: "1px 5px", borderRadius: 99, flexShrink: 0 }}>{unread > 99 ? "99+" : unread}</span>}
                  {!isSubEl && hasChildren && (
                    <button style={{ width: 16, height: 16, border: "none", background: "none", cursor: "pointer", color: "var(--text-4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}
                      onClick={e => { e.stopPropagation(); toggleExpand(t.taskId); }}>
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ transform: isExp ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}><path d="M2.5 1.5l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  )}
                </div>
                {!isSubEl && isExp && [...(t.subtaskIds || [])]
                  .map(sid => allTasks.find(t => t.taskId === sid) || allTaskMap.get(sid))
                  .filter(Boolean)
                  .sort((a, b) => Number(a.priority ?? 5) - Number(b.priority ?? 5))
                  .map(sub => <CompactItem key={sub.taskId} t={sub} isSubEl />)}
                {/* ── 🎯 Add Goal Task — shows under task when expanded ── */}
                {!isSubEl && isExp && (isCEO || isTL) && !t.isFolder && !t.isRepeat && !t.isGoal && (
                  <div
                    style={{ paddingLeft: 28, paddingRight: 8, paddingTop: 4, paddingBottom: 4, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", opacity: 0.7 }}
                    onClick={e => { e.stopPropagation(); setActiveModal({ type: "add_goal_task", taskId: t.taskId, task: t }); }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "0.7"}
                  >
                    <span style={{ fontSize: 10 }}>🎯</span>
                    <span style={{ fontSize: 10, color: "#7E22CE", fontWeight: 600 }}>+ Add Goal Task</span>
                  </div>
                )}
              </>
            );
          };

          const isCompact = !!task;

          return (
            <div className={`gv-list-panel ${isCompact ? "is-compact" : ""} ${mobileView === "chat" ? "mob-hidden" : ""}`} style={isCompact ? { flexBasis: `${sidebarWidth}%`, flexShrink: 0, flexGrow: 0, minWidth: 0 } : { flex: '1 1 100%', minWidth: '100%' }}>

              {/* ── Drag mode banner ── */}
              {false && (  // drag banner removed — CSS handles feedback
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, background: "linear-gradient(90deg,#4F46E5,#7C3AED)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "5px 14px", display: "flex", alignItems: "center", gap: 7, letterSpacing: "0.03em", pointerEvents: "none" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 9 2 12 5 15" /><polyline points="19 9 22 12 19 15" /><line x1="2" y1="12" x2="22" y2="12" /></svg>
                  Dragging — drop on any task to reorder
                  <span style={{ marginLeft: "auto", fontSize: 10, opacity: 0.8 }}>Release to place</span>
                </div>
              )}
              <div className="gv-lp-topbar">
                {isCompact ? (
                  <>
                    <button className="gv-back-btn" onClick={() => { setSelectedTask(null); setChatMessages([]); }}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M7 2L3 5.5l4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      All Tasks
                    </button>
                    <span className="gv-lp-title" style={{ fontSize: 14 }}>Task</span>
                    <div className="gv-search-box" style={{ maxWidth: 180 }}>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke="var(--text-4)" strokeWidth="1.1" /><line x1="8.5" y1="8.5" x2="11" y2="11" stroke="var(--text-4)" strokeWidth="1.1" strokeLinecap="round" /></svg>
                      <input value={listSearch} onChange={e => setListSearch(e.target.value)} placeholder="Search..." />
                    </div>
                  </>
                ) : (
                  <>
                    <span className="gv-lp-title">{isGoalView ? "🎯 Goal Tasks" : "Tasks Overview"}</span>
                    <div className="gv-search-box">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke="var(--text-4)" strokeWidth="1.1" /><line x1="8.5" y1="8.5" x2="11" y2="11" stroke="var(--text-4)" strokeWidth="1.1" strokeLinecap="round" /></svg>
                      <input value={listSearch} onChange={e => setListSearch(e.target.value)} placeholder={isGoalView ? "Search goal tasks..." : "Search tasks..."} />
                    </div>

                  </>
                )}
              </div>

              {/* === Section tabs: Assigned / Created / Self Tasks === */}
              {/* === Section tabs — goal view shows its own tabs, regular view shows Assigned/Created/Self === */}
              {isGoalView ? (
                <div style={{
                  display: "flex", alignItems: "center", borderBottom: "1px solid #E5E7EB",
                  background: "#fff", flexShrink: 0, padding: "0 16px",
                }}>
                  {[
                    { key: "assigned", label: "Assigned to Me" },
                    { key: "created", label: "Created by Me" },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setTaskSection(tab.key)}
                      style={{
                        padding: "10px 14px", border: "none",
                        borderBottom: `2px solid ${taskSection === tab.key ? "#1B4F8A" : "transparent"}`,
                        background: "transparent", fontFamily: "var(--font)",
                        fontSize: 13, fontWeight: taskSection === tab.key ? 600 : 400,
                        color: taskSection === tab.key ? "#1B4F8A" : "#6B7280",
                        cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                  <div style={{ flex: 1 }} />
                  {/* + New Goal button always visible for CEO/TL in goal view */}
                  {(isCEO || isTL) && (
                    <button
                      type="button"
                      onClick={() => setActiveModal({ type: "add_goal_task", taskId: null, task: null })}
                      title="Create new goal task"
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        height: 30, padding: "0 12px",
                        border: "none", borderRadius: 6,
                        background: "#1B4F8A", color: "#fff",
                        fontSize: 12, fontWeight: 600,
                        fontFamily: "var(--font)", cursor: "pointer", flexShrink: 0,
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#163E6E"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#1B4F8A"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 1.5v9M1.5 6h9" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      + New Goal
                    </button>
                  )}
                </div>
              ) : (
                <div style={{
                  display: "flex", alignItems: "center", borderBottom: "1px solid #E5E7EB",
                  background: "#fff", flexShrink: 0, padding: "0 16px",
                }}>
                  {[
                    { key: "assigned", label: "Assigned to Me" },
                    { key: "created", label: "Created by Me" },
                    { key: "self", label: "Self Tasks" },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setTaskSection(tab.key)}
                      style={{
                        padding: "10px 14px",
                        border: "none",
                        borderBottom: `2px solid ${taskSection === tab.key ? "#1B4F8A" : "transparent"}`,
                        background: "transparent",
                        fontFamily: "var(--font)",
                        fontSize: 13,
                        fontWeight: taskSection === tab.key ? 600 : 400,
                        color: taskSection === tab.key ? "#1B4F8A" : "#6B7280",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                  <div style={{ flex: 1 }} />
                  {(isCEO || isTL) && taskSection === "created" && (
                    <button
                      onClick={() => setActiveModal({ type: "add_subtask", taskId: null, task: null })}
                      title="Create new task"
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        height: 30, padding: "0 12px",
                        border: "none", borderRadius: 6,
                        background: "#1B4F8A", color: "#fff",
                        fontSize: 12, fontWeight: 600,
                        fontFamily: "var(--font)", cursor: "pointer",
                        flexShrink: 0, marginRight: 8,
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#163E6E"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#1B4F8A"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 1.5v9M1.5 6h9" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      New
                    </button>
                  )}
                  <button
                    onClick={() => setFilterOpen(o => !o)}
                    title="Filters"
                    style={{
                      width: 30, height: 30,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: `1px solid ${filterOpen || (filterDept || filterEmployee || filterDeadline || filterDateFrom || filterDateTo || viewFilter) ? "#1B4F8A" : "#D1D5DB"}`,
                      borderRadius: 6,
                      background: filterOpen ? "#EBF2FA" : "#fff",
                      cursor: "pointer", position: "relative", flexShrink: 0,
                      color: filterOpen ? "#1B4F8A" : "#6B7280", transition: "all 0.15s",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    {(filterDept || filterEmployee || filterDeadline || filterDateFrom || filterDateTo || viewFilter) && (
                      <span style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: "#1B4F8A" }} />
                    )}
                  </button>
                </div>
              )}

              {/* === Filter bar === */}
              {!isGoalView && (
                <>


                  {/* Expanded filter panel — only visible when filterOpen */}
                  {filterOpen && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 14px", borderBottom: "1px solid #E5E7EB",
                      background: "#F8F9FB", flexShrink: 0, flexWrap: "wrap",
                    }}>
                      {/* Status filter */}
                      <select
                        value={viewFilter}
                        onChange={e => setViewFilter(e.target.value)}
                        style={{
                          padding: "5px 10px", border: "1px solid #D1D5DB", borderRadius: 6,
                          fontSize: 12, fontFamily: "var(--font)", color: "#374151",
                          background: "#fff", cursor: "pointer", outline: "none",
                        }}
                      >
                        <option value="">All Statuses</option>
                        <option value="today">Due Today</option>
                        <option value="week">Due This Week</option>
                        <option value="overdue">Overdue</option>
                        <option value="completed">Completed</option>
                      </select>

                      {/* Person filter */}
                      <select
                        value={filterEmployee}
                        onChange={e => setFilterEmployee(e.target.value)}
                        style={{
                          padding: "5px 10px", border: "1px solid #D1D5DB", borderRadius: 6,
                          fontSize: 12, fontFamily: "var(--font)", color: "#374151",
                          background: "#fff", cursor: "pointer", outline: "none", maxWidth: 150,
                        }}
                      >
                        <option value="">All People</option>
                        {(() => {
                          const seen = new Set();
                          const opts = [];
                          allTasks.forEach(t => (t.assigneeIds || []).forEach(aid => {
                            if (!seen.has(aid)) {
                              seen.add(aid);
                              opts.push({ id: aid, name: employeeMap?.get(aid) || t.assigneeNameMap?.[aid] || aid });
                            }
                          }));
                          return opts.sort((a, b) => a.name.localeCompare(b.name))
                            .map(o => <option key={o.id} value={o.name}>{o.name}</option>);
                        })()}
                      </select>

                      {/* Deadline filter */}
                      <select
                        value={filterDeadline}
                        onChange={e => setFilterDeadline(e.target.value)}
                        style={{
                          padding: "5px 10px", border: "1px solid #D1D5DB", borderRadius: 6,
                          fontSize: 12, fontFamily: "var(--font)", color: "#374151",
                          background: "#fff", cursor: "pointer", outline: "none",
                        }}
                      >
                        <option value="">All Deadlines</option>
                        <option value="tomorrow">Tomorrow</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                      </select>



                      {/* Department filter */}
                      <select
                        value={filterDept}
                        onChange={e => setFilterDept(e.target.value)}
                        style={{
                          padding: "5px 10px", border: "1px solid #D1D5DB", borderRadius: 6,
                          fontSize: 12, fontFamily: "var(--font)", color: "#374151",
                          background: "#fff", cursor: "pointer", outline: "none",
                        }}
                      >
                        <option value="">All Departments</option>
                        {(() => {
                          const deptSet = new Set();
                          allTasks.forEach(t => {
                            if (t.department) deptSet.add(t.department);
                            (t.assigneeIds || []).forEach(aid => {
                              const emp = employeeMapFull.get(aid);
                              if (emp?.department) deptSet.add(emp.department);
                            });
                          });
                          return Array.from(deptSet).sort().map(d => <option key={d} value={d}>{d}</option>);
                        })()}
                      </select>

                      {/* Divider */}
                      <div style={{ flex: 1 }} />

                      {/* Clear */}
                      {(filterDept || filterEmployee || filterDeadline || filterDateFrom || filterDateTo || viewFilter) && (
                        <button
                          onClick={() => { setFilterDept(""); setFilterEmployee(""); setFilterDeadline(""); setFilterDateFrom(""); setFilterDateTo(""); setViewFilter(""); }}
                          style={{
                            padding: "5px 10px", border: "1px solid #D1D5DB", borderRadius: 6,
                            fontSize: 12, fontFamily: "var(--font)", color: "#6B7280",
                            background: "#fff", cursor: "pointer",
                          }}
                        >
                          Clear
                        </button>
                      )}

                      {/* Export CSV */}
                      <button
                        onClick={doExport}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "5px 10px", border: "1px solid #D1D5DB", borderRadius: 6,
                          fontSize: 12, fontFamily: "var(--font)", color: "#374151",
                          background: "#fff", cursor: "pointer",
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Export
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Task.Co-style project info — hidden in goal view */}
              {!isCompact && !isGoalView && (
                <div className="gv-legacy-info" style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", marginBottom: 2 }}>Daily Task Board</div>
                    <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--text-3)" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="4" r="2" stroke="currentColor" strokeWidth="1" /><path d="M2 10.5c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg> {role === "ceo" ? "CEO" : role === "tl" ? "Team Lead" : "Member"}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><rect x="1" y="1.5" width="10" height="9" rx="1" stroke="currentColor" strokeWidth="1" /><path d="M1 4.5h10" stroke="currentColor" strokeWidth="1" /></svg> {stats.total} Tasks</span>
                    </div>
                  </div>
                  {(isCEO || isTL) && <button className="gv-new-btn" style={{ padding: "4px 10px", fontSize: 10 }} onClick={() => setActiveModal({ type: "add_subtask", taskId: null, task: null })}><svg width="8" height="8" viewBox="0 0 9 9" fill="none"><path d="M4.5 1v7M1 4.5h7" stroke="white" strokeWidth="1.6" strokeLinecap="round" /></svg> Add</button>}
                </div>
              )}
              {/* ── FILTER BAR (new — sits between project info and stats tabs) ── */}

              <div className="gv-stats">
                {[{ key: "all", l: "ALL", v: stats.total, c: "#5B5EF4" }, { key: "open", l: "OPEN", v: stats.open, c: "#EF4444" }, { key: "in_progress", l: "ACTIVE", v: stats.active, c: "#8B5CF6" }, { key: "done", l: "DONE", v: stats.done, c: "#16A34A" }].map(s => (
                  <div key={s.key} className={`gv-stat${activeStatTab === s.key ? " active-tab" : ""}`} onClick={() => setActiveStatTab(s.key)}>
                    <span className="gv-stat-n" style={{ color: s.c }}>{s.v}</span>
                    <span className="gv-stat-l">{s.l}</span>
                  </div>
                ))}
              </div>
              <div className="gv-list-body">
                {/* Timeline View */}


                {tasksLoading ? (
                  <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {[1, 2, 3, 4].map(i => (<div key={i} className="gv-skel-row"><div className="gv-skeleton gv-skel-circle" /><div className="gv-skel-lines"><div className="gv-skeleton gv-skel-line" style={{ width: `${60 + i * 8}%` }} /><div className="gv-skeleton gv-skel-line" style={{ width: `${40 + i * 5}%` }} /></div></div>))}
                  </div>
                ) : filteredRoots.length === 0 ? (
                  <div className="gv-empty"><div className="gv-empty-icon">📋</div><p className="gv-empty-t">{listSearch || filterDept || filterEmployee || filterDeadline || filterDateFrom || filterDateTo ? "No matches" : "No tasks yet"}</p><p className="gv-empty-s">{(isCEO || isTL) && !listSearch && !filterDept && !filterEmployee && !filterDeadline ? "Click + Add Task to start" : "Try adjusting search or filters"}</p></div>
                ) : (
                  (() => {
                    // ── Split filteredRoots into two sections ──────────────
                    // Helper: check if ANY descendant of a task involves the employee
                    const hasDescendantAssignedToMe = (taskId, visited = new Set()) => {
                      if (visited.has(taskId)) return false;
                      visited.add(taskId);
                      const t = allTaskMap.get(taskId);
                      if (!t) return false;
                      if ((t.assigneeIds || []).includes(employeeId) && t.assignedBy !== employeeId) return true;
                      return (t.subtaskIds || []).some(sid => hasDescendantAssignedToMe(sid, visited));
                    };
                    const hasDescendantCreatedByMe = (taskId, visited = new Set()) => {
                      if (visited.has(taskId)) return false;
                      visited.add(taskId);
                      const t = allTaskMap.get(taskId);
                      if (!t) return false;
                      if (t.assignedBy === employeeId) return true;
                      return (t.subtaskIds || []).some(sid => hasDescendantCreatedByMe(sid, visited));
                    };

                    // Section A: Assigned to me by others (direct OR folder with my subtask deep inside)
                    const assignedToMe = filteredRoots.filter(t => {
                      if ((t.assigneeIds || []).includes(employeeId) && t.assignedBy !== employeeId) return true;
                      if (t.isFolder) return hasDescendantAssignedToMe(t.taskId);
                      return false;
                    });
                    // Section B: Created by me (direct OR folder with subtask I created)
                    const createdByMe = filteredRoots.filter(t => {
                      if (assignedToMe.find(x => x.taskId === t.taskId)) return false;
                      if (t.assignedBy === employeeId) return true;
                      if (t.isFolder) return hasDescendantCreatedByMe(t.taskId);
                      return false;
                    });
                    // Section C: Other tasks (visible to user but neither assigned nor created by them)
                    const otherTasks = filteredRoots.filter(t => {
                      if (assignedToMe.find(x => x.taskId === t.taskId)) return false;
                      if (createdByMe.find(x => x.taskId === t.taskId)) return false;
                      return true;
                    });


                    // ─── helpers ───────────────────────────────────────────────
                    const timeAgo = (ts) => {
                      if (!ts) return null;
                      const secs = Math.floor((Date.now() - (ts?.seconds ? ts.seconds * 1000 : new Date(ts).getTime())) / 1000);
                      if (secs < 60) return "just now";
                      if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
                      if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
                      if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
                      return `${Math.floor(secs / 604800)}w ago`;
                    };

                    const fmtShortDate = (d) => {
                      if (!d) return null;
                      try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); } catch { return null; }
                    };

                    const isOverdue = (d) => {
                      if (!d) return false;
                      return new Date(d) < new Date() && new Date(d).toDateString() !== new Date().toDateString();
                    };

                    const isDueToday = (d) => {
                      if (!d) return false;
                      return new Date(d).toDateString() === new Date().toDateString();
                    };

                    const avatarInitials = (name) => {
                      if (!name) return "?";
                      const parts = name.trim().split(" ");
                      return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name[0].toUpperCase();
                    };

                    const avatarColor = (name) => {
                      const colors = ["#1B4F8A", "#0F766E", "#7C3AED", "#B45309", "#0369A1", "#6D28D9", "#047857", "#9A3412"];
                      if (!name) return colors[0];
                      return colors[name.charCodeAt(0) % colors.length];
                    };

                    // ─── TaskRow component ──────────────────────────────────────
                    const TaskRow = ({ t, depth = 0, section, allTaskMap, employeeMap, employeeId, onSelect, selectedId, expandedIds, toggleExpand }) => {
                      const isSelected = selectedId === t.taskId;
                      const hasSubtasks = (t.subtaskIds || []).length > 0;
                      const isExpanded = expandedIds?.has(t.taskId);
                      const st = STATUS[t.status] || STATUS.open;
                      const assigneeIds = t.assigneeIds || [];
                      const dueDate = t.dueDate || t.fixedDeadline || t.deadline;
                      const overdue = dueDate && new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString();
                      const dueToday = dueDate && new Date(dueDate).toDateString() === new Date().toDateString();
                      const dueDateStr = dueDate ? (() => { try { return new Date(dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return null; } })() : null;

                      const getPrior = (p) => {
                        if (p === "high") return { label: "P1", color: "#DC2626" };
                        if (p === "medium") return { label: "P3", color: "#D97706" };
                        if (p === "low") return { label: "P5", color: "#16A34A" };
                        const n = Number(p);
                        if (!n || isNaN(n)) return { label: "—", color: "#94A3B8" };
                        const palette = ["#DC2626", "#EA580C", "#D97706", "#CA8A04", "#2563EB", "#7C3AED", "#059669", "#0891B2", "#64748B", "#16A34A"];
                        return { label: `P${n}`, color: palette[Math.min(n - 1, palette.length - 1)] };
                      };
                      const prior = getPrior(t.priority);

                      const fmtTs = (ts) => {
                        if (!ts) return null;
                        const ms = ts?.seconds ? ts.seconds * 1000 : new Date(ts).getTime();
                        if (!ms || isNaN(ms)) return null;
                        return new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
                      };

                      const timeAgoStr = t.createdAt ? (() => {
                        const ms = t.createdAt?.seconds ? t.createdAt.seconds * 1000 : new Date(t.createdAt).getTime();
                        const secs = Math.floor((Date.now() - ms) / 1000);
                        if (secs < 60) return "just now";
                        if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
                        if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
                        return `${Math.floor(secs / 86400)}d ago`;
                      })() : null;

                      const assignedByName = t.assignedByName
                        || (t.assignedBy ? (typeof employeeMap?.get === "function" ? employeeMap.get(t.assignedBy) : null) : null)
                        || null;

                      const compMap = {
                        submitted: { label: "Submitted · Awaiting Review", color: "#D97706" },
                        tl_approved: { label: "TL Approved", color: "#5B5EF4" },
                        tl_rejected: { label: "TL Rejected — Needs Revision", color: "#DC2626" },
                        tl_final_approved: { label: "✅ Approved & Complete", color: "#16A34A" },
                        ceo_approved: { label: "✅ CEO Approved & Complete", color: "#16A34A" },
                        ceo_rejected: { label: "CEO Rejected", color: "#DC2626" },
                      };
                      const comp = t.completionStatus ? compMap[t.completionStatus] : null;

                      const workedSecs = t.timerTotalSeconds || t.workedSeconds || 0;
                      const workedStr = workedSecs >= 60 ? (() => {
                        const h = Math.floor(workedSecs / 3600), m = Math.floor((workedSecs % 3600) / 60);
                        return h > 0 ? `${h}h ${m}m` : `${m}m`;
                      })() : null;

                      const lastChatMs = (() => {
                        if (!t.lastChatAt) return null;
                        if (t.lastChatAt?.seconds) return t.lastChatAt.seconds * 1000;
                        if (typeof t.lastChatAt === "number") return t.lastChatAt;
                        if (typeof t.lastChatAt === "string") return new Date(t.lastChatAt).getTime();
                        return null;
                      })();
                      const lastChatStr = lastChatMs ? (() => {
                        const diff = Math.floor((Date.now() - lastChatMs) / 60000);
                        if (diff < 1) return "just now";
                        if (diff < 60) return `${diff}m ago`;
                        if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
                        return `${Math.floor(diff / 1440)}d ago`;
                      })() : null;

                      // dot separator helper
                      const Dot = () => <span style={{ color: "#D1D5DB", fontSize: 10, margin: "0 2px" }}>·</span>;

                      return (
                        <div style={{ borderBottom: "1.5px solid #F0F2F7" }}>

                          <div
                            onClick={() => onSelect(t)}
                            draggable={!!(isCEO || isTL)}
                            onDragStart={e => {
                              if (!isCEO && !isTL) { e.preventDefault(); return; }
                              dragTaskIdRef.current = t.taskId;
                              dragOverIdRef.current = null;
                              e.dataTransfer.effectAllowed = "move";
                              const ghost = document.createElement("div");
                              ghost.textContent = "↕ " + (t.title || "Task");
                              ghost.style.cssText = "position:fixed;top:-999px;left:-999px;background:#1B4F8A;color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;font-family:inherit;white-space:nowrap;pointer-events:none;";
                              document.body.appendChild(ghost);
                              e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 16);
                              setTimeout(() => ghost.remove(), 100);
                              e.currentTarget.style.opacity = "0.4";
                            }}
                            onDragOver={e => {
                              e.preventDefault();
                              if (!isCEO && !isTL) return;
                              if (dragTaskIdRef.current === t.taskId) return;
                              e.dataTransfer.dropEffect = "move";
                              if (dragOverIdRef.current !== t.taskId) {
                                document.querySelectorAll(".taskrow-drag-over").forEach(el => {
                                  el.style.borderTop = "";
                                  el.classList.remove("taskrow-drag-over");
                                });
                                dragOverIdRef.current = t.taskId;
                                e.currentTarget.style.borderTop = "3px solid #1B4F8A";
                                e.currentTarget.classList.add("taskrow-drag-over");
                              }
                            }}
                            onDragLeave={e => {
                              if (!e.currentTarget.contains(e.relatedTarget)) {
                                e.currentTarget.style.borderTop = "";
                                e.currentTarget.classList.remove("taskrow-drag-over");
                                if (dragOverIdRef.current === t.taskId) dragOverIdRef.current = null;
                              }
                            }}
                            onDrop={e => {
                              e.preventDefault();
                              e.currentTarget.style.borderTop = "";
                              e.currentTarget.classList.remove("taskrow-drag-over");
                              document.querySelectorAll(".taskrow-drag-over").forEach(el => {
                                el.style.borderTop = "";
                                el.classList.remove("taskrow-drag-over");
                              });
                              const dragId = dragTaskIdRef.current;
                              dragOverIdRef.current = null;
                              dragTaskIdRef.current = null;
                              if (!dragId || dragId === t.taskId) return;
                              handleDrop(t.taskId, dragId);
                            }}
                            onDragEnd={e => {
                              e.currentTarget.style.opacity = "1";
                              e.currentTarget.style.borderTop = "";
                              document.querySelectorAll(".taskrow-drag-over").forEach(el => {
                                el.style.borderTop = "";
                                el.classList.remove("taskrow-drag-over");
                              });
                              dragTaskIdRef.current = null;
                              dragOverIdRef.current = null;
                            }}
                            style={{
                              display: "flex", alignItems: "flex-start", gap: 8,
                              padding: `9px 12px 9px ${12 + depth * 18}px`,
                              background: isSelected ? "#F0F5FF" : "#fff",
                              border: isSelected ? "1px solid #C7D2FE" : "1px solid #E5E7EB",
                              borderLeft: isSelected ? "3px solid #1B4F8A" : "3px solid transparent",
                              borderRadius: 6,
                              margin: "0 10px 6px",
                              cursor: (isCEO || isTL) ? "grab" : "pointer",
                              transition: "background 0.12s, border-color 0.12s",
                            }}
                            onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = "#F8FAFC"; e.currentTarget.style.borderColor = "#D7DDE8"; } }}
                            onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#E5E7EB"; } }}
                          >


                            {/* Expand chevron */}
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); if (hasSubtasks) toggleExpand?.(t.taskId); }}
                              style={{
                                width: 16, height: 16, marginTop: 3, flexShrink: 0,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                background: "none", border: "none",
                                cursor: hasSubtasks ? "pointer" : "default",
                                color: hasSubtasks ? "#94A3B8" : "transparent", padding: 0,
                                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s",
                              }}
                            >
                              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                                <path d="M2.5 1.5l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>

                            {/* Content */}
                            <div style={{ flex: 1, minWidth: 0 }}>

                              {/* ROW 1: title + priority + type badges */}
                              <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 2, flexWrap: "wrap" }}>
                                {depth > 0 && <span style={{ fontSize: 10, color: "#CBD5E1", flexShrink: 0 }}>↳</span>}
                                <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? "#1B4F8A" : "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {t.title}
                                </span>
                                <span
                                  title={`Priority ${prior.label} — drag tasks to reorder`}
                                  style={{ fontSize: 10, fontWeight: 700, color: prior.color, flexShrink: 0, padding: "1px 6px", borderRadius: 4, background: prior.color + "14", border: `1px solid ${prior.color}33` }}
                                >
                                  {prior.label}
                                </span>
                                {hasSubtasks && <span style={{ fontSize: 10, color: "#94A3B8", flexShrink: 0 }}>{(t.subtaskIds || []).length} sub</span>}
                                {t.isRepeat && <span style={{ fontSize: 9, fontWeight: 700, color: "#1D4ED8", background: "#EFF6FF", padding: "1px 5px", borderRadius: 3 }}>🔁 Repeat</span>}
                                {t.isThirdParty && <span style={{ fontSize: 9, fontWeight: 700, color: "#6D28D9", background: "#F5F3FF", padding: "1px 5px", borderRadius: 3 }}>🔗 3rd Party</span>}
                                {t.isGoal && <span style={{ fontSize: 9, fontWeight: 700, color: "#7E22CE", background: "#FDF4FF", padding: "1px 5px", borderRadius: 3 }}>🎯 Goal</span>}
                                {t.isSelfAssigned && <span style={{ fontSize: 9, fontWeight: 700, color: "#7C3AED", background: "#F5F3FF", padding: "1px 5px", borderRadius: 3 }}>SELF</span>}
                              </div>

                              {/* ROW 2: description (only if exists, 1 truncated line) */}
                              {t.description && (
                                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 3, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {t.description.replace(/<[^>]*>/g, "").slice(0, 140)}
                                </div>
                              )}

                              {/* ROW 3: all meta inline — assigned by/to · time · dept · worked · last msg · due · completion */}
                              <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", lineHeight: 1.6 }}>

                                {/* Assigned by (assigned tab) */}
                                {section === "assigned" && assignedByName && (
                                  <>
                                    <span style={{ fontSize: 10, color: "#6B7280" }}>
                                      by <strong style={{ color: "#374151", fontWeight: 600 }}>{assignedByName}</strong>
                                    </span>
                                    <Dot />
                                  </>
                                )}

                                {/* Assigned to label (created tab) */}
                                {section === "created" && assigneeIds.length > 0 && (
                                  <>
                                    <span style={{ fontSize: 10, color: "#6B7280" }}>to:</span>
                                    <span style={{ marginLeft: 3 }} />
                                  </>
                                )}

                                {/* Assignee avatars + full names inline */}
                                {section !== "assigned" && assigneeIds.length > 0 && (
                                  <>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                                      {assigneeIds.slice(0, 3).map((aid, i) => {
                                        const nm = (typeof employeeMap?.get === "function" ? employeeMap.get(aid) : null)
                                          || t.assigneeNameMap?.[aid] || (t.assigneeNames || [])[i] || aid;
                                        const empFull = (typeof employeeMapFull?.get === "function" ? employeeMapFull.get(aid) : null) || {};
                                        const picUrl = empFull.profilePicUrl || empFull.photoURL || "";
                                        const [c1, c2] = getAvatarColors(nm || aid);
                                        const initials = (nm || "?").split(" ").filter(Boolean).slice(0, 2).map(s => s[0]).join("").toUpperCase();
                                        return (
                                          <span key={aid} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "#374151" }}>
                                            {picUrl
                                              ? <img src={picUrl} alt={nm} style={{ width: 14, height: 14, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid #E5E7EB" }} />
                                              : <span style={{ width: 14, height: 14, borderRadius: "50%", background: `linear-gradient(135deg,${c1},${c2})`, color: "#fff", fontSize: 6, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials}</span>
                                            }
                                            {nm}{i < Math.min(assigneeIds.length, 3) - 1 && <span style={{ color: "#D1D5DB" }}>,</span>}
                                          </span>
                                        );
                                      })}
                                      {assigneeIds.length > 3 && <span style={{ fontSize: 10, color: "#9CA3AF" }}>+{assigneeIds.length - 3}</span>}
                                    </span>
                                    <Dot />
                                  </>
                                )}

                                {/* Time ago */}
                                {timeAgoStr && <><span style={{ fontSize: 10, color: "#C0C8D8" }}>{timeAgoStr}</span><Dot /></>}

                                {/* Department */}
                                {t.department && <><span style={{ fontSize: 10, color: "#94A3B8" }}>{t.department}</span><Dot /></>}

                                {/* Timer worked */}
                                {workedStr && <><span style={{ fontSize: 10, color: "#6B7280" }}>⏱ {workedStr}</span><Dot /></>}

                                {/* Last chat */}
                                {lastChatStr && <><span style={{ fontSize: 10, color: "#94A3B8" }}>💬 {lastChatStr}</span><Dot /></>}

                                {/* Due date — inline, coloured — only for deadline tasks */}
                                {dueDateStr && t.status !== "done" && !t.deadlineWindowSecs && (
                                  <span style={{ fontSize: 10, fontWeight: overdue || dueToday ? 600 : 400, color: overdue ? "#EF4444" : dueToday ? "#F59E0B" : "#9CA3AF" }}>
                                    {overdue ? `⚠ Overdue · ${dueDateStr}` : dueToday ? `📅 Due today` : `📅 ${dueDateStr}`}
                                  </span>
                                )}


                                <div className="col-timer" onClick={e => e.stopPropagation()}>
                                  {t.deadlineWindowSecs > 0 && (() => {
                                    const isRunning = timerActiveTaskId === t.taskId;
                                    const isAssigneeOfThis = (t.assigneeIds || []).includes(employeeId);
                                    const _mine = getDisplaySeconds ? getDisplaySeconds(t.taskId) : 0;
                                    const _watched = assigneeAllTimers?.get(t.taskId)?.displaySeconds || 0;
                                    const secs = _mine || _watched;
                                    const total = t.deadlineWindowSecs || 0;
                                    const isOver = total > 0 && secs >= total;
                                    const h = Math.floor(secs / 3600);
                                    const m = Math.floor((secs % 3600) / 60);
                                    const workedStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
                                    return (
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }} onClick={e => e.stopPropagation()}>
                                        {isAssigneeOfThis && t.status === "in_progress" && (
                                          <button
                                            type="button"
                                            title={isRunning ? "Pause" : "Resume"}
                                            onClick={() => isRunning
                                              ? handleTimerPause?.(t.taskId, t.title)
                                              : handleTimerStart?.(t.taskId, t.title)
                                            }
                                            style={{
                                              width: 18, height: 18, borderRadius: "50%", border: "none",
                                              background: isRunning ? "#DCFCE7" : "#EBF2FA",
                                              color: isRunning ? "#16A34A" : "#1B4F8A",
                                              cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                                              flexShrink: 0, padding: 0,
                                            }}
                                          >
                                            {isRunning ? (
                                              <svg width="7" height="7" viewBox="0 0 12 12" fill="currentColor">
                                                <rect x="2" y="1.5" width="3" height="9" rx="1" />
                                                <rect x="7" y="1.5" width="3" height="9" rx="1" />
                                              </svg>
                                            ) : (
                                              <svg width="7" height="7" viewBox="0 0 12 12" fill="currentColor">
                                                <path d="M2.5 1.5l8 4.5-8 4.5V1.5z" />
                                              </svg>
                                            )}
                                          </button>
                                        )}
                                        {secs > 0 && (
                                          <span style={{ fontSize: 10, color: isOver ? "#DC2626" : "#6B7280" }}>
                                            ⏱ {workedStr}{total > 0 ? ` / ${Math.floor(total / 3600) > 0 ? `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m` : `${Math.floor(total / 60)}m`}` : ""}
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })()}
                                </div>

                              </div>

                              {/* ROW 4: completion/submission status — only when exists, very compact */}
                              {comp && (
                                <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: comp.color }}>
                                    {comp.label}
                                  </span>
                                  {t.submittedAt && (
                                    <span style={{ fontSize: 10, color: "#9CA3AF" }}>{fmtTs(t.submittedAt)}</span>
                                  )}
                                  {/* Rejection reason inline */}
                                  {(t.completionStatus === "tl_rejected" && t.tlReview?.rejectionReason) && (
                                    <span style={{ fontSize: 10, color: "#DC2626" }}>· "{t.tlReview.rejectionReason}"</span>
                                  )}
                                  {(t.completionStatus === "ceo_rejected" && t.ceoReview?.rejectionReason) && (
                                    <span style={{ fontSize: 10, color: "#DC2626" }}>· "{t.ceoReview.rejectionReason}"</span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Right: status badge */}
                            <span style={{
                              fontSize: 11, fontWeight: 500,
                              color: st.color, background: st.bg,
                              padding: "3px 9px", borderRadius: 5,
                              border: `1px solid ${st.color}22`,
                              whiteSpace: "nowrap", flexShrink: 0, marginTop: 1,
                            }}>{st.label}</span>
                          </div>

                          {/* Subtasks recursive */}
                          {hasSubtasks && isExpanded && (
                            <div>
                              {(t.subtaskIds || []).map(sid => {
                                const sub = allTaskMap?.get(sid);
                                if (!sub) return null;
                                return (
                                  <TaskRow
                                    key={sub.taskId} t={sub} depth={depth + 1} section={section}
                                    allTaskMap={allTaskMap} employeeMap={employeeMap}
                                    employeeId={employeeId} onSelect={onSelect}
                                    selectedId={selectedId} expandedIds={expandedIds} toggleExpand={toggleExpand}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    };

                    // ─── renderTaskGroup ────────────────────────────────────────
                    const renderTaskGroup = (tasks, section) => {
                      if (!tasks || tasks.length === 0) return null;
                      const roots = tasks.filter(t => !t.parentTaskId);
                      return (
                        <div style={{ background: "#fff" }}>
                          {roots.map(t => (
                            <TaskRow
                              key={t.taskId}
                              t={t}
                              depth={0}
                              section={section}
                              allTaskMap={allTaskMap}
                              employeeMap={employeeMap}
                              employeeId={employeeId}
                              onSelect={handleSelectNode}
                              selectedId={task?.taskId}
                              expandedIds={expandedIds}
                              toggleExpand={toggleExpand}
                            />
                          ))}
                        </div>
                      );
                    };


                    // Section box wrapper with title + minimize/maximize
                    const SectionBox = ({ sectionKey, title, icon, accentColor, accentBg, tasks, count }) => {
                      const sectionCollapsed = collapsedGroups.has(`section_${sectionKey}`);
                      const toggleSection = () => setCollapsedGroups(prev => {
                        const n = new Set(prev);
                        const k = `section_${sectionKey}`;
                        n.has(k) ? n.delete(k) : n.add(k);
                        return n;
                      });
                      return (
                        <div style={{
                          border: `1.5px solid ${accentColor}22`,
                          borderRadius: 10,
                          overflow: "hidden",
                          background: "var(--surface)",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                          marginBottom: 12,
                        }}>
                          {/* Section header */}
                          <div style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "9px 14px",
                            background: accentBg,
                            borderBottom: sectionCollapsed ? "none" : `1px solid ${accentColor}22`,
                            cursor: "pointer", userSelect: "none",
                          }} onClick={toggleSection}>
                            <span style={{ fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: accentColor, flex: 1, letterSpacing: "0.01em" }}>{title}</span>
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              padding: "2px 8px", borderRadius: 99,
                              background: accentColor, color: "#fff",
                              marginRight: 6,
                            }}>{count}</span>
                            {/* Maximize / Minimize icon */}
                            <button style={{
                              width: 22, height: 22, border: `1px solid ${accentColor}44`,
                              borderRadius: 5, background: "#fff",
                              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                              color: accentColor, flexShrink: 0, transition: "all 0.12s",
                            }}
                              onClick={e => { e.stopPropagation(); toggleSection(); }}
                              title={sectionCollapsed ? "Maximize" : "Minimize"}
                            >
                              {sectionCollapsed ? (
                                // Maximize icon
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                                  <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                                </svg>
                              ) : (
                                // Minimize icon
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                                  <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
                                </svg>
                              )}
                            </button>
                          </div>
                          {/* Section body — hidden when minimized */}
                          {!sectionCollapsed && (
                            <>
                              {renderTaskGroup(tasks, sectionKey)}
                            </>
                          )}
                        </div>
                      );
                    };

                    return (
                      <>
                        {isGoalView ? (
                          <>
                            {(() => {
                              const goalAssigned = filteredRoots.filter(t =>
                                (t.assigneeIds || []).includes(employeeId) && t.assignedBy !== employeeId
                              );
                              const goalCreated = filteredRoots.filter(t =>
                                t.assignedBy === employeeId
                              );
                              const activeGoalTasks = taskSection === "assigned" ? goalAssigned
                                : taskSection === "created" ? goalCreated
                                  : filteredRoots;
                              return (
                                <div>
                                  {activeGoalTasks.length === 0 ? (
                                    <div style={{ textAlign: "center", padding: "50px 20px" }}>
                                      <div style={{ fontSize: 32, marginBottom: 10 }}>🎯</div>
                                      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                                        {taskSection === "assigned" ? "No goal tasks assigned to you" : "No goal tasks created yet"}
                                      </div>
                                      <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 16 }}>
                                        {taskSection === "assigned" ? "Goal tasks assigned to you will appear here." : "Click + New Goal to create your first goal task."}
                                      </div>
                                      {(isCEO || isTL) && (
                                        <button
                                          type="button"
                                          onClick={() => setActiveModal({ type: "add_goal_task", taskId: null, task: null })}
                                          style={{
                                            display: "inline-flex", alignItems: "center", gap: 6,
                                            padding: "8px 18px", border: "none", borderRadius: 7,
                                            background: "#1B4F8A", color: "#fff",
                                            fontSize: 13, fontWeight: 600,
                                            fontFamily: "var(--font)", cursor: "pointer",
                                          }}
                                        >
                                          + New Goal Task
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <div>
                                      <div style={{ padding: "8px 0" }}>
                                        {renderTaskGroup(activeGoalTasks, taskSection)}
                                      </div>
                                      {/* Add another goal task — always visible for CEO/TL */}
                                      {(isCEO || isTL) && (
                                        <button
                                          type="button"
                                          onClick={() => setActiveModal({ type: "add_goal_task", taskId: null, task: null })}
                                          style={{
                                            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                            width: "calc(100% - 24px)", margin: "4px 12px 16px",
                                            padding: "10px 14px",
                                            background: "transparent", border: "1px dashed #CBD5E1", borderRadius: 6,
                                            color: "#64748B", fontFamily: "var(--font)", fontSize: 12,
                                            cursor: "pointer", transition: "all 0.15s",
                                          }}
                                          onMouseEnter={e => { e.currentTarget.style.borderColor = "#1B4F8A"; e.currentTarget.style.color = "#1B4F8A"; }}
                                          onMouseLeave={e => { e.currentTarget.style.borderColor = "#CBD5E1"; e.currentTarget.style.color = "#64748B"; }}
                                        >
                                          + New Goal Task
                                        </button>
                                      )}
                                    </div>
                                  )}

                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <>
                            {/* Assigned to Me */}
                            {taskSection === "assigned" && (
                              assignedToMe.length === 0 ? (
                                <div className="gv-empty">
                                  <div className="gv-empty-icon">📥</div>
                                  <p className="gv-empty-t">No assigned tasks</p>
                                  <p className="gv-empty-s">Tasks assigned to you will appear here</p>
                                </div>
                              ) : (
                                <>
                                  {renderTaskGroup(assignedToMe, "assigned")}
                                  {(isCEO || isTL) && taskSection === "created" && (
                                    <button
                                      type="button"
                                      onClick={() => setActiveModal({ type: "add_subtask", taskId: null, task: null })}
                                      style={{
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                        width: "calc(100% - 24px)", margin: "8px 12px 16px",
                                        padding: "12px 14px",
                                        background: "transparent", border: "1px dashed #CBD5E1", borderRadius: 6,
                                        color: "#64748B", fontFamily: "var(--font)", fontSize: 12,
                                        cursor: "pointer", transition: "all 0.15s",
                                      }}
                                      onMouseEnter={e => { e.currentTarget.style.borderColor = "#1B4F8A"; e.currentTarget.style.color = "#1B4F8A"; }}
                                      onMouseLeave={e => { e.currentTarget.style.borderColor = "#CBD5E1"; e.currentTarget.style.color = "#64748B"; }}
                                    >
                                      + New Task
                                    </button>
                                  )}
                                </>
                              )
                            )}

                            {/* Created by Me */}
                            {taskSection === "created" && (
                              createdByMe.length === 0 ? (
                                <div className="gv-empty">
                                  <div className="gv-empty-icon">✏️</div>
                                  <p className="gv-empty-t">No tasks created yet</p>
                                  <p className="gv-empty-s">Tasks you create will appear here</p>
                                </div>
                              ) : (
                                <>
                                  {renderTaskGroup(createdByMe, "created")}
                                  {(isCEO || isTL) && (
                                    <button
                                      type="button"
                                      onClick={() => setActiveModal({ type: "add_subtask", taskId: null, task: null })}
                                      style={{
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                        width: "calc(100% - 24px)", margin: "8px 12px 16px",
                                        padding: "12px 14px",
                                        background: "transparent", border: "1px dashed #CBD5E1", borderRadius: 6,
                                        color: "#64748B", fontFamily: "var(--font)", fontSize: 12,
                                        cursor: "pointer", transition: "all 0.15s",
                                      }}
                                      onMouseEnter={e => { e.currentTarget.style.borderColor = "#1B4F8A"; e.currentTarget.style.color = "#1B4F8A"; }}
                                      onMouseLeave={e => { e.currentTarget.style.borderColor = "#CBD5E1"; e.currentTarget.style.color = "#64748B"; }}
                                    >
                                      + New Task
                                    </button>
                                  )}
                                </>
                              )
                            )}

                            {/* Self Tasks */}
                            {taskSection === "self" && (() => {
                              const needsMyApproval = allTasks.filter(t =>
                                t.status !== "cancelled" && t.status !== "done" &&
                                t.selfAssignApproved !== true &&
                                (t.approverId === employeeId || (Array.isArray(t.visibleTo) && t.visibleTo.includes(employeeId)))
                              );
                              const myOwnTasks = allTasks.filter(t =>
                                t.status !== "cancelled" && t.isSelfAssigned === true &&
                                (t.assigneeIds || []).includes(employeeId) && t.approverId !== employeeId
                              );
                              return (
                                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
                                  {needsMyApproval.length === 0 && myOwnTasks.length === 0 && (
                                    <div style={{ textAlign: "center", padding: "40px 20px" }}>
                                      <div style={{ fontSize: 28, marginBottom: 8 }}>👤</div>
                                      <div style={{ fontSize: 13, fontWeight: 600, color: "#64748B" }}>No self-assigned tasks</div>
                                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4, marginBottom: 16 }}>Use "Assign to Self" to create one</div>
                                      <button className="gv-new-btn" onClick={() => setActiveModal({ type: "self_assign" })} style={{ background: "#1B4F8A", margin: "0 auto" }}>
                                        Assign to Self
                                      </button>
                                    </div>
                                  )}
                                  {needsMyApproval.length > 0 && (
                                    <div>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #E5E7EB" }}>
                                        Needs Your Approval ({needsMyApproval.length})
                                      </div>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                        {needsMyApproval.map(t => (
                                          <div key={t.taskId} style={{ background: "#fff", border: "1px solid #E5E7EB", borderLeft: "3px solid #DC2626", borderRadius: 6, padding: "10px 12px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                              <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => handleSelectNode(t)}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: "#1E293B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                                                <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                                                  By <strong>{t.assignedByName}</strong>
                                                  {t.approverName && <> · Approver <strong style={{ color: "#DC2626" }}>{t.approverName}</strong></>}
                                                </div>
                                              </div>
                                              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                                <button onClick={async () => { try { await apiFetch(`/cowork/task/${t.taskId}/self-assign-approve`, { method: "POST", body: JSON.stringify({ approved: true }) }); await loadAllTasks(); } catch (e) { alert(e.message); } }}
                                                  style={{ padding: "4px 10px", background: "#1B4F8A", color: "#fff", border: "none", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                                  Approve
                                                </button>
                                                <button onClick={async () => { const r = prompt("Rejection reason:"); if (r === null) return; try { await apiFetch(`/cowork/task/${t.taskId}/self-assign-approve`, { method: "POST", body: JSON.stringify({ approved: false, rejectionReason: r }) }); await loadAllTasks(); } catch (e) { alert(e.message); } }}
                                                  style={{ padding: "4px 10px", background: "#fff", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                                  Reject
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {myOwnTasks.length > 0 && (
                                    <div>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #E5E7EB" }}>
                                        My Self-Assigned Tasks ({myOwnTasks.length})
                                      </div>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                        {myOwnTasks.map(t => {
                                          const sst = STATUS[t.status] || STATUS.open;
                                          return (
                                            <div key={t.taskId} onClick={() => handleSelectNode(t)}
                                              style={{ background: "#fff", border: "1px solid #E5E7EB", borderLeft: "3px solid #1B4F8A", borderRadius: 6, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                                              <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: "#1E293B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                                                <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                                                  {t.approverName && <>Approver: <strong>{t.approverName}</strong></>}
                                                  {t.fixedDeadline && <> · {new Date(t.fixedDeadline).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</>}
                                                </div>
                                              </div>
                                              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, color: sst.color, background: sst.bg, flexShrink: 0 }}>{sst.label}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            </div>
          );
        })()}

        {/* RESIZABLE DIVIDER */}
        {task && <div className="gv-resizer" onMouseDown={handleMouseDown} />}

        {/* COL-2: CHAT for normal tasks / FOLDER CONTENTS for folder tasks */}
        {task?.isFolder ? (
          <div className={`gv-chat ${task ? "gv-has-task" : "gv-no-task"} ${mobileView === "chat" ? "mob-visible" : "mob-hidden"} ${mobDetailPanel ? "mob-hidden" : ""}`} style={{ position: "relative", display: "flex", flexDirection: "column", background: "var(--surface)" }}>
            {/* Folder header */}
            <div className="gv-chat-head gv-desk-only" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontSize: 16 }}>📁</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>
                <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 1 }}>Folder Task — contains subtasks</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", padding: "3px 9px", borderRadius: 99 }}>Folder</span>
            </div>
            {/* Folder contents */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
              {/* Subtask count summary */}
              {(() => {
                const subtaskIds = task.subtaskIds || task.subtasks?.map(s => s.taskId) || [];
                const allSubtasks = subtaskIds.map(id => allTaskMap.get(id)).filter(Boolean);
                // Employee: only show subtasks assigned to or by them — not other people's subtasks
                const subtasks = role === "employee"
                  ? allSubtasks.filter(sub =>
                    (sub.assigneeIds || []).includes(employeeId) || sub.assignedBy === employeeId
                  )
                  : allSubtasks;
                const done = subtasks.filter(s => s.status === "done").length;
                const inProg = subtasks.filter(s => s.status === "in_progress").length;
                const open = subtasks.filter(s => s.status === "open" || s.status === "not_started").length;
                return (
                  <>
                    {subtasks.length > 0 && (
                      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: "#F0FDF4", color: "#16A34A" }}>✅ {done} Done</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: "#EFF6FF", color: "#1D4ED8" }}>⏳ {inProg} Active</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: "#F8FAFC", color: "#64748B" }}>📋 {open} Open</span>
                      </div>
                    )}
                    {subtasks.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-4)" }}>
                        <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}>Empty folder</div>
                        <div style={{ fontSize: 11, color: "var(--text-4)", marginBottom: 16 }}>Add subtasks to organize work inside this folder</div>
                        {(isCEO || isTL) && (
                          <button onClick={() => setActiveModal({ type: "add_subtask", taskId: task.taskId, task })}
                            style={{ padding: "7px 16px", borderRadius: 8, border: "1.5px solid var(--p)", background: "var(--p-lt)", color: "var(--p)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            + Add Subtask
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {(isCEO || isTL) && (
                          <button onClick={() => setActiveModal({ type: "add_subtask", taskId: task.taskId, task })}
                            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px", borderRadius: 8, border: "1.5px dashed var(--border2)", background: "transparent", color: "var(--text-4)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 4, transition: "all 0.15s" }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--p)"; e.currentTarget.style.color = "var(--p)"; e.currentTarget.style.background = "var(--p-lt)"; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--text-4)"; e.currentTarget.style.background = "transparent"; }}>
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                            Add Subtask
                          </button>
                        )}
                        {subtasks.map(sub => {
                          const sst = STATUS[sub.status] || STATUS.open;
                          const assigneeName = sub.assigneeIds?.map(id => (typeof employeeMap?.get === "function" ? employeeMap.get(id) : null) || sub.assigneeNameMap?.[id] || id).join(", ") || "Unassigned";
                          return (
                            <div key={sub.taskId} onClick={() => handleSelectNode(sub)}
                              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", cursor: "pointer", transition: "all 0.1s" }}
                              onMouseEnter={e => { e.currentTarget.style.background = "var(--p-lt)"; e.currentTarget.style.borderColor = "var(--p)"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.borderColor = "var(--border)"; }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: sst.dot, flexShrink: 0, display: "inline-block" }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.title}</div>
                                <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 2 }}>{assigneeName}</div>
                              </div>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, color: sst.color, background: sst.bg, flexShrink: 0 }}>{sst.label}</span>
                              <svg width="8" height="8" viewBox="0 0 9 9" fill="none" style={{ color: "var(--text-4)", flexShrink: 0 }}><path d="M2.5 1.5l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        ) : (
          <div className={`gv-chat ${task ? "gv-has-task" : "gv-no-task"} ${mobileView === "chat" ? "mob-visible" : "mob-hidden"} ${mobDetailPanel ? "mob-hidden" : ""}`} style={{ position: "relative" }}>

            {/* ── Hero banner removed — more space for chat ── */}

            {/* ── Chat header: WhatsApp-style on mobile, standard on desktop ── */}
            {task ? (
              <>
                {/* MOBILE BACK + GROUP HEADER */}
                <div className="gv-mob-chat-topbar">
                  <button className="gv-mob-back-btn" onClick={() => { setMobileView("list"); setSelectedTask(null); }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                  </button>
                  {/* Tappable group info area */}
                  <div className="gv-mob-group-info" onClick={() => setMobDetailPanel("info")}>
                    <div className="gv-mob-group-avatar">
                      {(task.title || "T")[0].toUpperCase()}
                    </div>
                    <div className="gv-mob-group-text">
                      <div className="gv-mob-group-name">{task.title}</div>
                      <div className="gv-mob-group-members">
                        {(task.assigneeIds || []).slice(0, 4).map((id, i) => {
                          const nm = (typeof employeeMap?.get === "function" ? employeeMap.get(id) : null) || task.assigneeNameMap?.[id] || (task.assigneeNames || [])[i] || id;
                          return <span key={id}>{nm}{i < Math.min((task.assigneeIds || []).length, 4) - 1 ? ", " : ""}</span>;
                        })}
                        {(task.assigneeIds || []).length > 4 && <span> +{task.assigneeIds.length - 4} more</span>}
                        {!(task.assigneeIds?.length) && <span>No members</span>}
                      </div>
                    </div>
                  </div>
                  {/* Action icons */}
                  <div className="gv-mob-chat-actions">
                    <button className="gv-mob-icon-btn" onClick={() => window.dispatchEvent(new CustomEvent("openRequestPanel", { detail: { tab: "compose", taskId: task.taskId, taskTitle: task.title } }))} title="Request">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                    </button>
                    {(isCEO || isTL) && <button className="gv-mob-icon-btn" onClick={() => handleAction("add_subtask")} title="Add Subtask">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>}
                    <button className="gv-mob-icon-btn" onClick={() => setMobDetailPanel("info")} title="Details">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                    </button>
                  </div>
                </div>

                {/* DESKTOP: standard header (hidden on mobile) */}
                <div className="gv-chat-head gv-desk-only">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M14 10a1.33 1.33 0 0 1-1.33 1.33H4L1.33 14.33V3.33A1.33 1.33 0 0 1 2.67 2H12.67A1.33 1.33 0 0 1 14 3.33V10z" fill="var(--p)" opacity=".15" stroke="var(--p)" strokeWidth="1.1" strokeLinejoin="round" />
                  </svg>
                  <div className="gv-chat-task-chip"><span className="gv-chat-tid">{task.taskId}</span></div>
                  <span className="gv-chat-task-name">{task.title}</span>
                  {task.status && (
                    <span className="gv-chat-badge gv-img2-status-badge" style={{ color: (STATUS[task.status] || STATUS.open).color, background: (STATUS[task.status] || STATUS.open).bg, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {(STATUS[task.status] || STATUS.open).label}
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.7, flexShrink: 0 }}><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                  )}
                  <div className="gv-chat-actions">
                    {/* Forward task + Add subtask buttons (replaced phone/video) */}
                    <button className="gv-chat-act-btn gv-img2-icon" title="Forward Task" type="button" onClick={() => handleAction("forward")}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7" /><path d="M4 18v-2a4 4 0 014-4h12" /></svg>
                    </button>
                    {(isCEO || isTL) && <button className="gv-chat-act-btn gv-img2-icon" title="Add Subtask" type="button" onClick={() => handleAction("add_subtask")}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>}
                    <button className={`gv-chat-act-btn gv-img2-icon${rightPanel === "info" ? " active" : ""}`} title="Task details" type="button" onClick={() => setRightPanel(rightPanel === "info" ? null : "info")}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                    </button>
                    <div className="gv-mob-only-actions">
                      {(isCEO || isTL) && <button className="gv-chat-act-btn" onClick={() => handleAction("add_subtask")} title="Add Subtask"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>}
                      {isCEO && <button className="gv-chat-act-btn" onClick={() => handleAction("deadline")} title="Deadline"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></button>}
                      {isCEO && <button className="gv-chat-act-btn" style={{ color: "var(--danger)" }} onClick={() => handleAction("delete")} title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg></button>}
                    </div>
                  </div>
                </div>

                {/* "Chat with team" avatar strip -- Image-2 style (desktop only) */}
                {/* Image-2 OUTER TABS: Chat / Activity / Files / Details (now BEFORE team strip) */}
                <div className="gv-img2-tabs">
                  {task?.isGoal ? (
                    <>
                      <button type="button" className={`gv-img2-tab ${rightPanel === "reports" ? "active" : ""}`} onClick={() => setRightPanel("reports")}>Activity</button>
                      <button type="button" className={`gv-img2-tab ${rightPanel === null ? "active" : ""}`} onClick={() => setRightPanel(null)}>Chat</button>
                      <button type="button" className={`gv-img2-tab ${rightPanel === "files" ? "active" : ""}`} onClick={() => setRightPanel("files")}>Files</button>
                      <button type="button" className={`gv-img2-tab ${rightPanel === "info" ? "active" : ""}`} onClick={() => setRightPanel("info")}>Details</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className={`gv-img2-tab ${rightPanel === null ? "active" : ""}`} onClick={() => setRightPanel(null)}>Chat</button>
                      <button type="button" className={`gv-img2-tab ${rightPanel === "reports" ? "active" : ""}`} onClick={() => setRightPanel("reports")}>Activity</button>
                      <button type="button" className={`gv-img2-tab ${rightPanel === "files" ? "active" : ""}`} onClick={() => setRightPanel("files")}>Files</button>
                      <button type="button" className={`gv-img2-tab ${rightPanel === "info" ? "active" : ""}`} onClick={() => setRightPanel("info")}>Details</button>
                    </>
                  )}
                </div>

                
              </>
            ) : (
              <div className="gv-chat-head">
                <span style={{ fontSize: 13, color: "var(--text-4)", fontStyle: "italic" }}>Select a task to start chatting</span>
              </div>
            )}

            {/* Mobile tabs now handled by header action buttons above */}

            {/* === Image-2: chat content shows ONLY when no detail tab is active === */}
            {(rightPanel === null) && (<>

              <TaskActionBanner task={task} employeeId={employeeId} isCEO={isCEO} isTL={isTL} isAssignee={isAssignee} isConfirmed={isConfirmed} isStarted={isStarted} actionBusy={actionBusy} handleAction={handleAction} getDisplaySeconds={getDisplaySeconds} timerActiveTaskId={timerActiveTaskId} handleTimerStart={handleTimerStart} handleTimerPause={handleTimerPause} />

              {/* ── TASK GUIDE — formal info strip for new open tasks ── */}
              {task && !task.isFolder && !task.isRepeat && !task.isThirdParty && !task.isGoal && isAssignee && !isConfirmed && task.status === "open" && !task.dueDate && (
                <div style={{
                  flexShrink: 0, padding: "12px 16px",
                  background: "#fff",
                  borderBottom: "1px solid #F1F5F9",
                  borderLeft: "3px solid #1B4F8A",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#1B4F8A", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                    How this task works
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 0, overflowX: "auto" }}>
                    {(task.isSelfAssigned ? [
                      { label: "Awaiting Approval", active: true },
                      { label: "Start Work", active: false },
                      { label: "Submit", active: false },
                    ] : task.hasTimer === true ? [
                      { label: "Set Deadline", active: true },
                      { label: "TL Approves", active: false },
                      { label: "Start Work", active: false },
                    ] : [
                      { label: "Confirm & Start", active: true },
                      { label: "Submit", active: false },
                    ]).map((step, i, arr) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                        <div style={{
                          display: "flex", flexDirection: "row", alignItems: "center", gap: 6,
                          padding: "5px 10px",
                          background: step.active ? "#EBF2FA" : "transparent",
                          borderRadius: 5,
                          border: step.active ? "1px solid #BFDBFE" : "1px solid transparent",
                          minWidth: 0,
                        }}>
                          <span style={{
                            width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                            background: step.active ? "#1B4F8A" : "#F1F5F9",
                            color: step.active ? "#fff" : "#94A3B8",
                            fontSize: 9, fontWeight: 700,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>{i + 1}</span>
                          <span style={{ fontSize: 11, fontWeight: step.active ? 600 : 400, color: step.active ? "#1B4F8A" : "#6B7280", whiteSpace: "nowrap" }}>
                            {step.label}
                          </span>
                        </div>
                        {i < arr.length - 1 && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, margin: "0 2px", color: "#D1D5DB" }}>
                            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── WORKFLOW BANNER (pre-confirmed only) — shown in chat column ── */}
              {task && !task.isFolder && !task.isRepeat && !task.isThirdParty && !task.isGoal && isAssignee && !isConfirmed && (() => {
                const df = {
                  proposedDurationVal: proposedDurationVal,
                  proposedDurationUnit: proposedDurationUnit,
                  setDurationVal: setProposedDurationVal,
                  setDurationUnit: setProposedDurationUnit,
                  proposing: proposingDeadline,
                  approving: approvingDeadline,
                  rejectReason,
                  setRejectReason,
                  showRejectInput,
                  setShowRejectInput,
                  showExtend: showExtendForm,
                  setShowExtend: setShowExtendForm,
                  onPropose: handleProposeDeadline,
                  onApprove: handleApproveDeadline,
                };
                const status = task.status;
                const deadlineApprovedStatuses = ["deadline_approved", "confirmed", "in_progress", "done"];
                const hasDueDate = deadlineApprovedStatuses.includes(status);
                const isPendingApproval = ["pending_deadline_approval", "pending_employee_deadline_confirmation"].includes(status);
                // Timer-based deadlinePassed: only when worked seconds >= window AND timer has run
                const _fWorked = getDisplaySeconds ? getDisplaySeconds(task.taskId) : 0;
                const _fWindow = task.deadlineWindowSecs || 0;
                const _fTimerStarted = _fWorked > 0;
                const deadlinePassed = _fTimerStarted && _fWindow > 0 && _fWorked >= _fWindow;
                const passedStr = deadlinePassed ? (() => {
                  const over = _fWorked - _fWindow;
                  if (over < 3600) return `${Math.round(over / 60)}m over`;
                  if (over < 86400) return `${Math.round(over / 3600)}h over`;
                  return `${Math.round(over / 86400)}d over`;
                })() : "";

                // Don't show if task is confirmed/in_progress/done (already started or working)
                if (["confirmed", "in_progress", "done"].includes(status)) return null;

                return (
                  <div style={{ flexShrink: 0, borderBottom: "1px solid #F1F5F9", background: "#fff" }}>

                    {/* Step: deadline approved (timer task) → Confirm & Start */}
                    {hasDueDate && !isPendingApproval && (
                      <div style={{ padding: "10px 16px", borderLeft: `3px solid ${deadlinePassed ? "#DC2626" : "#16A34A"}` }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: deadlinePassed ? "#DC2626" : "#111827", marginBottom: 4 }}>
                          {deadlinePassed ? "Deadline passed — start to continue" : "Deadline approved — ready to start"}
                        </div>
                        {(_fWindow > 0) && (
                          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 8 }}>
                            {!_fTimerStarted
                              ? `${_fWindow < 3600 ? Math.round(_fWindow / 60) + " min" : _fWindow < 86400 ? Math.round(_fWindow / 3600) + "h" : Math.round(_fWindow / 86400) + "d"} approved — countdown begins when you start`
                              : deadlinePassed
                                ? `Exceeded by ${passedStr}`
                                : (() => {
                                  const rem = _fWindow - _fWorked;
                                  return `${rem < 3600 ? Math.round(rem / 60) + " min" : rem < 86400 ? Math.round(rem / 3600) + "h" : Math.round(rem / 86400) + "d"} remaining`;
                                })()
                            }
                          </div>
                        )}
                        <button disabled={actionBusy} onClick={() => handleAction("confirm_and_start")}
                          style={{ padding: "5px 14px", border: `1px solid ${deadlinePassed ? "#DC2626" : "#16A34A"}`, borderRadius: 5, background: deadlinePassed ? "#DC2626" : "#16A34A", color: "#fff", fontSize: 11, fontWeight: 600, cursor: actionBusy ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: actionBusy ? 0.5 : 1 }}>
                          {actionBusy ? "Starting…" : "▶ Confirm & Start"}
                        </button>
                      </div>
                    )}

                    {/* Step 1a: No-timer task — confirm & start directly */}
                    {!hasDueDate && status === "open" && task.hasTimer === false && !task.isSelfAssigned && (
                      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, borderLeft: "3px solid #16A34A" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#111827", marginBottom: 2 }}>Ready to start</div>
                          <div style={{ fontSize: 11, color: "#6B7280" }}>Tap to confirm and begin working on this task.</div>
                        </div>
                        <button disabled={actionBusy} onClick={() => handleAction("confirm_and_start")}
                          style={{ flexShrink: 0, padding: "6px 16px", border: "none", borderRadius: 6, background: "#16A34A", color: "#fff", fontSize: 11, fontWeight: 600, cursor: actionBusy ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: actionBusy ? 0.5 : 1 }}>
                          {actionBusy ? "Starting…" : "▶ Confirm & Start"}
                        </button>
                      </div>
                    )}

                    {/* Self-assigned task: waiting for approver */}
                    {task.isSelfAssigned && status === "open" && task.selfAssignApproved !== true && (
                      <div style={{ padding: "10px 16px", borderLeft: "3px solid #9CA3AF" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#111827", marginBottom: 2 }}>Awaiting approval</div>
                        <div style={{ fontSize: 11, color: "#6B7280" }}>
                          <strong style={{ color: "#374151" }}>{task.approverName || "Your approver"}</strong> must approve this self-assigned task before you can begin.
                        </div>
                      </div>
                    )}

                    {/* Step 1b: Timer task — employee proposes duration */}
                    {!hasDueDate && status === "open" && task.hasTimer === true && (
                      <div style={{ padding: "10px 16px", borderLeft: "3px solid #1B4F8A" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#111827", marginBottom: 2 }}>Set your deadline</div>
                        {task.deadlineProposalRejected && (
                          <div style={{ fontSize: 11, color: "#DC2626", marginBottom: 8 }}>
                            Rejected: {task.deadlineRejectionReason || "Please propose a new duration."}
                          </div>
                        )}
                        {!task.deadlineProposalRejected && (
                          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 8 }}>
                            Enter how long you need. Your manager will approve before the timer starts.
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input type="number" min="1" max="999" placeholder="e.g. 4"
                            value={df.proposedDurationVal || ""}
                            onChange={e => df.setDurationVal?.(e.target.value)}
                            style={{ width: 80, padding: "5px 8px", border: "1px solid #D1D5DB", borderRadius: 5, fontSize: 12, fontFamily: "inherit", outline: "none", color: "#111827" }} />
                          <select value={df.proposedDurationUnit || "hours"} onChange={e => df.setDurationUnit?.(e.target.value)}
                            style={{ width: 70, padding: "5px 4px", border: "1px solid #D1D5DB", borderRadius: 5, fontSize: 12, fontFamily: "inherit", background: "#fff", cursor: "pointer", outline: "none", color: "#111827" }}>
                            <option value="minutes">min</option>
                            <option value="hours">hrs</option>
                            <option value="days">days</option>
                          </select>
                          <button disabled={!df.proposedDurationVal || df.proposing} onClick={df.onPropose}
                            style={{ padding: "5px 14px", border: "1px solid #1B4F8A", borderRadius: 5, background: "#fff", color: "#1B4F8A", fontSize: 11, fontWeight: 600, cursor: !df.proposedDurationVal || df.proposing ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: !df.proposedDurationVal || df.proposing ? 0.5 : 1 }}>
                            {df.proposing ? "Submitting…" : "Submit for Approval"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 2a: awaiting TL approval */}
                    {status === "pending_deadline_approval" && (
                      <div style={{ padding: "10px 16px", borderLeft: "3px solid #D97706" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#111827", marginBottom: 2 }}>Waiting for approval</div>
                        <div style={{ fontSize: 11, color: "#6B7280" }}>
                          {(() => {
                            const fmt = (s) => { if (!s) return "?"; if (s < 60) return `${s}s`; if (s < 3600) return `${Math.round(s / 60)} min`; if (s < 86400) return `${Math.round(s / 3600)}h`; return `${Math.round(s / 86400)}d`; };
                            const delta = Number(task.pendingExtensionSecs) || 0;
                            const total = Number(task.deadlineWindowSecs) || 0;
                            return delta > 0
                              ? `Your request for +${fmt(delta)} extra time is pending. You can discuss in the Draft Chat meanwhile.`
                              : `Your request for ${fmt(total)} is pending. You can discuss in the Draft Chat meanwhile.`;
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Step 2b: TL counter-proposed — employee must respond */}
                    {status === "pending_employee_deadline_confirmation" && (
                      <div style={{ padding: "10px 16px", borderLeft: "3px solid #7C3AED" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#111827", marginBottom: 2 }}>
                          {task.tlCounterDeadlineByName || "Your TL"} suggested a duration
                        </div>
                        <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 8 }}>
                          {(() => {
                            const w = task.tlCounterWindowSecs || 0;
                            const dur = w <= 0 ? "a duration" : w < 3600 ? `${Math.round(w / 60)} min` : w < 86400 ? `${Math.round(w / 3600)}h` : `${Math.round(w / 86400)}d`;
                            return `${dur} — countdown starts when you press the timer, not now.`;
                          })()}
                          {task.tlCounterDeadlineMessage && (
                            <span style={{ display: "block", marginTop: 4, color: "#374151", fontStyle: "italic" }}>
                              "{task.tlCounterDeadlineMessage}"
                            </span>
                          )}
                        </div>
                        {!showRejectCounterInput ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => handleRespondToCounter(true)} disabled={respondBusy}
                              style={{ padding: "5px 14px", border: "1px solid #16A34A", borderRadius: 5, background: "#fff", color: "#16A34A", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: respondBusy ? 0.5 : 1 }}>
                              Accept
                            </button>
                            <button onClick={() => setShowRejectCounterInput(true)} disabled={respondBusy}
                              style={{ padding: "5px 14px", border: "1px solid #D1D5DB", borderRadius: 5, background: "#fff", color: "#6B7280", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                              Reject
                            </button>
                          </div>
                        ) : (
                          <div>
                            <textarea value={rejectCounterReason} onChange={e => setRejectCounterReason(e.target.value)}
                              placeholder="Reason for rejecting…"
                              style={{ width: "100%", padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 5, fontSize: 11, fontFamily: "inherit", resize: "none", minHeight: 44, outline: "none", boxSizing: "border-box", marginBottom: 6, color: "#111827" }} />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => handleRespondToCounter(false)} disabled={!rejectCounterReason.trim() || respondBusy}
                                style={{ padding: "5px 14px", border: "1px solid #DC2626", borderRadius: 5, background: "#fff", color: "#DC2626", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: !rejectCounterReason.trim() || respondBusy ? 0.5 : 1 }}>
                                {respondBusy ? "…" : "Send"}
                              </button>
                              <button onClick={() => { setShowRejectCounterInput(false); setRejectCounterReason(""); }}
                                style={{ padding: "5px 10px", border: "1px solid #E5E7EB", borderRadius: 5, background: "#fff", color: "#6B7280", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })()}

              {/* Creator approval panel in chat column — 3 tabs always visible */}
              {task && !task.isFolder && task.status === "pending_deadline_approval" && task.assignedBy === employeeId && (() => {
                const isExt = ["in_progress", "confirmed"].includes(task.prevStatusBeforeDeadlineProposal || "");
                const activeTab = showCounterForm ? "suggest" : showRejectInput ? "reject" : null;
                const setTab = (t) => {
                  setShowCounterForm(t === "suggest");
                  setShowRejectInput(t === "reject");
                  if (t !== "suggest") { setCounterDurationVal(""); setCounterDurationUnit("hours"); setCounterMessage(""); }
                  if (t !== "reject") { setRejectReason(""); }
                };
                return (
                  <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
                    <div style={{ padding: "10px 14px 8px", background: "#FFF7ED", borderBottom: "1px solid #FED7AA" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#9A3412", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                        {isExt ? "📅 Extension Request" : "📋 Deadline Proposal"}
                      </div>
                      {task.proposedDeadline && (
                        <div style={{ fontSize: 12, color: "#78350F" }}>
                          <strong>{task.proposedDeadlineByName}</strong> requests:{" "}
                          <span style={{ fontWeight: 700 }}>
                            {(() => {
                              const fmt = (s) => { if (!s) return "?"; if (s < 60) return `${s}s`; if (s < 3600) return `${Math.round(s / 60)} min`; if (s < 86400) return `${Math.round(s / 3600)}h`; return `${Math.round(s / 86400)}d`; };
                              const delta = Number(task.pendingExtensionSecs) || 0;
                              const total = Number(task.deadlineWindowSecs) || 0;
                              if (delta > 0) {
                                const prev = Math.max(0, total - delta);
                                return <>⏱ +{fmt(delta)} extra <span style={{ color: "#C2410C", fontWeight: 500, fontSize: 11 }}>(was {fmt(prev)} → new {fmt(total)})</span></>;
                              }
                              return <>⏱ {fmt(total)} requested</>;
                            })()}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* 3 action tabs ALWAYS visible */}
                    <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #E5E7EB" }}>
                      {[
                        { key: "approve", label: "✓ Approve", color: "#166534", activeBg: "#DCFCE7", activeBorder: "#16A34A" },
                        { key: "suggest", label: "📅 Suggest Duration", color: "#6D28D9", activeBg: "#EDE9FE", activeBorder: "#7C3AED" },
                        { key: "reject", label: "✕ Reject", color: "#991B1B", activeBg: "#FEE2E2", activeBorder: "#EF4444" },
                      ].map(tab => (
                        <button key={tab.key}
                          onClick={() => tab.key === "approve" ? handleApproveDeadline(true) : setTab(activeTab === tab.key ? null : tab.key)}
                          disabled={tab.key === "approve" && approvingDeadline}
                          style={{
                            flex: 1, padding: "9px 4px", border: "none", fontFamily: "inherit",
                            fontSize: 10, fontWeight: 700, cursor: "pointer",
                            color: activeTab === tab.key ? tab.color : "#6B7280",
                            background: activeTab === tab.key ? tab.activeBg : "#fff",
                            borderBottom: activeTab === tab.key ? `2.5px solid ${tab.activeBorder}` : "2.5px solid transparent",
                            transition: "all 0.1s",
                          }}>
                          {tab.key === "approve" && approvingDeadline ? "…" : tab.label}
                        </button>
                      ))}
                    </div>
                    {activeTab === "suggest" && (
                      <div style={{ padding: "10px 14px" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Propose a new deadline to employee:</div>
                        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                          <input type="number" min="1" max="999" placeholder="e.g. 4"
                            value={counterDurationVal || ""}
                            onChange={e => setCounterDurationVal(e.target.value)}
                            style={{ flex: 1, padding: "7px 8px", border: "1.5px solid #DDD6FE", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
                          <select value={counterDurationUnit || "hours"} onChange={e => setCounterDurationUnit(e.target.value)}
                            style={{ width: 72, padding: "7px 4px", border: "1.5px solid #DDD6FE", borderRadius: 7, fontSize: 12, fontFamily: "inherit", background: "#F9FAFB", cursor: "pointer", outline: "none" }}>
                            <option value="minutes">min</option>
                            <option value="hours">hrs</option>
                            <option value="days">days</option>
                          </select>
                        </div>
                        <textarea value={counterMessage} onChange={e => setCounterMessage(e.target.value)}
                          placeholder="Message to employee (optional)..."
                          style={{ width: "100%", padding: "7px 9px", border: "1.5px solid #DDD6FE", borderRadius: 7, fontSize: 11, fontFamily: "inherit", resize: "none", minHeight: 52, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                        <button onClick={handleTlCounterPropose} disabled={!counterDurationVal || counterBusy}
                          style={{ width: "100%", padding: "8px", borderRadius: 8, border: "none", background: !counterDurationVal || counterBusy ? "#E5E7EB" : "#7C3AED", color: !counterDurationVal || counterBusy ? "#9CA3AF" : "#fff", fontSize: 12, fontWeight: 700, cursor: !counterDurationVal || counterBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                          {counterBusy ? "Sending..." : "⏱ Send Duration to Employee"}
                        </button>
                      </div>
                    )}
                    {activeTab === "reject" && (
                      <div style={{ padding: "10px 14px" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Reason for rejection (required):</div>
                        <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                          placeholder="Tell the employee why..."
                          style={{ width: "100%", padding: "7px 9px", border: "1.5px solid #FECDD3", borderRadius: 7, fontSize: 11, fontFamily: "inherit", resize: "none", minHeight: 52, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                        <button onClick={() => handleApproveDeadline(false)} disabled={!rejectReason.trim() || approvingDeadline}
                          style={{ width: "100%", padding: "8px", borderRadius: 8, border: "none", background: !rejectReason.trim() || approvingDeadline ? "#E5E7EB" : "#EF4444", color: !rejectReason.trim() || approvingDeadline ? "#9CA3AF" : "#fff", fontSize: 12, fontWeight: 700, cursor: !rejectReason.trim() || approvingDeadline ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                          {approvingDeadline ? "Sending..." : "Send Rejection"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── DRAFT / NORMAL CHAT TAB BAR ──────────────────────────────────── */}
              {task && !task.isFolder && (() => {
                const isPreConfirmed = !["confirmed", "in_progress", "done"].includes(task.status);
                const isPostConfirmed = ["confirmed", "in_progress", "done"].includes(task.status);
                return (
                  <div className="gv-legacy-chattabs" style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
                    {/* Draft Chat tab — always visible */}
                    <button
                      onClick={() => setChatTabMode("draft")}
                      style={{ flex: 1, padding: "8px 12px", border: "none", background: "none", fontFamily: "var(--font)", fontSize: 11, fontWeight: chatTabMode === "draft" ? 700 : 500, color: chatTabMode === "draft" ? "#D97706" : "var(--text-3)", borderBottom: `2px solid ${chatTabMode === "draft" ? "#D97706" : "transparent"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "all 0.12s" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      Draft Chat
                      {isPreConfirmed && <span style={{ fontSize: 8, fontWeight: 700, background: "#FEF3C7", color: "#D97706", padding: "1px 5px", borderRadius: 99, border: "1px solid #FDE68A" }}>ACTIVE</span>}
                      {isPostConfirmed && <span style={{ fontSize: 8, color: "#94A3B8" }}>read-only</span>}
                      {draftMessages.length > 0 && <span style={{ fontSize: 9, fontWeight: 700, background: chatTabMode === "draft" ? "#FEF3C7" : "var(--bg)", color: chatTabMode === "draft" ? "#D97706" : "var(--text-4)", padding: "1px 5px", borderRadius: 99 }}>{draftMessages.length}</span>}
                    </button>
                    {/* Normal Chat tab — only after confirmation */}
                    <button
                      onClick={() => isPostConfirmed && setChatTabMode("normal")}
                      disabled={isPreConfirmed}
                      style={{ flex: 1, padding: "8px 12px", border: "none", background: "none", fontFamily: "var(--font)", fontSize: 11, fontWeight: chatTabMode === "normal" ? 700 : 500, color: isPreConfirmed ? "var(--text-4)" : (chatTabMode === "normal" ? "var(--p)" : "var(--text-3)"), borderBottom: `2px solid ${chatTabMode === "normal" ? "var(--p)" : "transparent"}`, cursor: isPreConfirmed ? "not-allowed" : "pointer", opacity: isPreConfirmed ? 0.45 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "all 0.12s" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                      Chat
                      {isPreConfirmed && <span style={{ fontSize: 8, color: "#94A3B8" }}>locked</span>}
                      {chatMessages.length > 0 && <span style={{ fontSize: 9, fontWeight: 700, background: chatTabMode === "normal" ? "var(--p-lt)" : "var(--bg)", color: chatTabMode === "normal" ? "var(--p)" : "var(--text-4)", padding: "1px 5px", borderRadius: 99 }}>{chatMessages.length}</span>}
                    </button>
                  </div>
                );
              })()}

              {/* Messages */}
              <div className="gv-msgs">
                {!task ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--p-lt)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--p)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 3 }}>No conversation selected</p>
                      <p style={{ fontSize: 10, color: "var(--text-4)", lineHeight: 1.6 }}>Select a task from the sidebar<br />to view its chat thread</p>
                    </div>
                  </div>
                ) : detailLoading ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, padding: 24 }}>
                    {[1, 2, 3].map(i => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: i % 2 === 0 ? "flex-start" : "flex-end", flexDirection: i % 2 === 0 ? "row" : "row-reverse" }}>
                        <div className="gv-skeleton gv-skel-circle" style={{ width: 30, height: 30 }} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, width: `${40 + i * 10}%` }}>
                          <div className="gv-skeleton gv-skel-line" style={{ height: 14, width: "60%" }} />
                          <div className="gv-skeleton" style={{ height: 40 + i * 12, borderRadius: 12, width: "100%" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : chatTabMode === "draft" ? (
                  /* ── DRAFT CHAT MESSAGES ── */
                  draftMessages.length === 0 ? (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 32 }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", textAlign: "center" }}>Draft Chat</p>
                      <p style={{ fontSize: 11, color: "var(--text-4)", textAlign: "center", lineHeight: 1.5 }}>
                        {["confirmed", "in_progress", "done"].includes(task?.status) ? "Draft discussion from before confirmation." : "Discuss the task details and deadline here before confirming."}
                      </p>
                    </div>
                  ) : groupByDate(draftMessages).map((item, idx) => {
                    if (item.type === "date") return (
                      <div key={`ddate-${idx}`} className="gv-date-sep">
                        <div className="gv-date-sep-line" />
                        <span className="gv-date-sep-label">{item.label}</span>
                        <div className="gv-date-sep-line" />
                      </div>
                    );
                    const msg = item;
                    const isMe = msg.senderId === employeeId;
                    if (msg.messageType === "system") return <div key={msg.messageId || idx} className="gv-sys-msg">{msg.text}</div>;
                    const prevMsg = idx > 0 ? groupByDate(draftMessages)[idx - 1] : null;
                    const showAvatar = !prevMsg || prevMsg.type === "date" || prevMsg.senderId !== msg.senderId;
                    return (
                      <div key={msg.messageId || idx} className={`gv-msg-group${isMe ? " me" : ""}`} style={{ marginTop: showAvatar ? 8 : 1 }}>
                        {!isMe && <div className="gv-msg-avatar" style={{ visibility: showAvatar ? "visible" : "hidden" }}>{(msg.senderName || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}</div>}
                        <div className="gv-msg-col">
                          {showAvatar && <div className="gv-msg-meta">{!isMe && <span>{msg.senderName}</span>}{msg.createdAt && <span style={{ marginLeft: isMe ? 0 : 6 }}>{new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}</div>}
                          <div className="gv-bubble-wrapper">
                            <div className={`gv-bubble${msg.temp ? " gv-sending" : ""}${msg.error ? " gv-error" : ""}`}>
                              {msg.text && <div><LinkedText text={msg.text} isMe={isMe} /></div>}
                              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                                <span style={{ fontSize: 10, color: isMe ? "rgba(255,255,255,0.65)" : "var(--text-4)" }}>{msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : chatMessages.length === 0 ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 32 }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D0D5DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                    <p style={{ fontSize: 13, color: "var(--text-4)", textAlign: "center" }}>No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  grouped.map((item, idx) => {
                    if (item.type === "date") {
                      return (
                        <div key={`date-${idx}`} className="gv-date-sep">
                          <div className="gv-date-sep-line" />
                          <span className="gv-date-sep-label">{item.label}</span>
                          <div className="gv-date-sep-line" />
                        </div>
                      );
                    }
                    const msg = item;
                    const isMe = msg.senderId === employeeId;
                    const isSystem = msg.messageType === "system" || msg.senderRole === "system";

                    if (isSystem) {
                      return (
                        <div key={msg.messageId || idx} className="gv-sys-msg">{msg.text}</div>
                      );
                    }

                    const msgTime = msg.createdAt ? new Date(msg.createdAt).getTime() : 0;
                    const openedAt = lastReadAtRef.current[selectedTask?.taskId] || 0;
                    // A message is "new/unread" if it arrived after the chat was opened
                    // AND it was not sent by the current user
                    const isNewMsg = !isMe && !msg.temp && msgTime > openedAt;

                    // Group consecutive messages from same sender — hide avatar
                    const prevMsg = idx > 0 ? grouped[idx - 1] : null;
                    const showAvatar = !prevMsg || prevMsg.type === "date" || prevMsg.senderId !== msg.senderId;

                    return (
                      <SwipeableMessage
                        key={msg.messageId || idx}
                        isMe={isMe}
                        onReply={() => setReplyTo({ messageId: msg.messageId, text: msg.text || (msg.attachments?.length ? "📎 Attachment" : ""), senderName: msg.senderName, senderId: msg.senderId })}
                        onContextMenu={(e) => handleContextMenu(e, msg)}
                        onLongPressStart={() => handleLongPressStart(msg)}
                        onLongPressEnd={handleLongPressEnd}
                        style={{ marginTop: showAvatar ? 8 : 1 }}
                      >
                        {!isMe && (
                          <div className="gv-msg-avatar" style={{ position: "relative", visibility: showAvatar ? "visible" : "hidden" }}>
                            {(msg.senderName || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                            {/* Green dot on avatar for new messages */}
                            {isNewMsg && (
                              <span style={{
                                position: "absolute", bottom: -1, right: -1,
                                width: 9, height: 9, borderRadius: "50%",
                                background: "#16A34A",
                                border: "2px solid var(--bg, #F4F6FB)",
                                flexShrink: 0,
                              }} />
                            )}
                          </div>
                        )}
                        <div className="gv-msg-col">
                          <div className="gv-msg-meta" style={{ display: showAvatar ? "flex" : "none" }}>
                            {!isMe && <span>{msg.senderName}</span>}
                            {msg.createdAt && (
                              <span style={{ marginLeft: isMe ? 0 : 6 }}>
                                {new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}

                            {isNewMsg && (
                              <span style={{
                                marginLeft: 6,
                                fontSize: 9,
                                fontWeight: 700,
                                color: "#16A34A",
                                background: "rgba(16,185,129,0.12)",
                                padding: "1px 6px",
                                borderRadius: 99,
                                letterSpacing: "0.04em",
                              }}>
                                NEW · {new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </div>
                          <div className="gv-bubble-wrapper">
                            <div className={`gv-bubble${msg.sending ? " gv-sending" : ""}${msg.error ? " gv-error" : ""}${isNewMsg ? " gv-bubble-new" : ""}`}>
                              {/* Reply quote */}
                              {msg.replyTo && (() => {
                                const replyIsMe = msg.replyTo.senderName === employeeName || msg.replyTo.senderId === employeeId;
                                const replyLabel = replyIsMe ? "You" : msg.replyTo.senderName;
                                return (
                                  <div style={{
                                    background: isMe ? "rgba(0,0,0,0.15)" : "rgba(79,70,229,0.07)",
                                    borderLeft: `3px solid ${isMe ? "rgba(255,255,255,0.5)" : "var(--p)"}`,
                                    borderRadius: "0 6px 6px 0",
                                    padding: "5px 9px",
                                    marginBottom: 6,
                                    cursor: "pointer",
                                  }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: isMe ? "rgba(255,255,255,0.9)" : "var(--p)", marginBottom: 2 }}>{replyLabel}</div>
                                    <div style={{ fontSize: 11, color: isMe ? "rgba(255,255,255,0.7)" : "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 230 }}>{msg.replyTo.text}</div>
                                  </div>
                                );
                              })()}
                              {msg.text && <div><LinkedText text={msg.text} isMe={isMe} /></div>}
                              {msg.attachments?.map((att, ai) => {
                                if (att.type === "image") {
                                  return (
                                    <img
                                      key={ai}
                                      src={att.url}
                                      alt="attachment"
                                      className="gv-image-preview"
                                      onClick={() => setLightboxImage(att.url)}
                                    />
                                  );
                                }
                                if (att.type === "pdf") {
                                  return (
                                    <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer" className="gv-attachment">
                                      📄 {att.name || "Document"}
                                      <span className="gv-attachment-download">
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 1v8M4 6l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" /><path d="M1 11h12" strokeLinecap="round" /></svg>
                                      </span>
                                    </a>
                                  );
                                }
                                if (att.type === "voice") {
                                  return (
                                    <div key={ai} style={{ marginTop: 6 }}>
                                      <audio controls src={att.url} style={{ maxWidth: "200px", height: "32px" }} />
                                    </div>
                                  );
                                }
                                return null;
                              })}
                              {msg.mediaUrl && msg.messageType === "image" && (
                                <img src={msg.mediaUrl} alt="attachment" className="gv-image-preview" onClick={() => setLightboxImage(msg.mediaUrl)} />
                              )}
                              {msg.pdfUrl && (
                                <a href={msg.pdfUrl} target="_blank" rel="noopener noreferrer" className="gv-attachment">
                                  📄 {msg.pdfFileName || "Document"}
                                </a>
                              )}
                              {/* WhatsApp ticks + time */}
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 4 }}>
                                <span style={{ fontSize: 10, color: isMe ? "rgba(255,255,255,0.65)" : "var(--text-4)" }}>
                                  {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}
                                </span>
                                {isMe && msg.sending && (
                                  <svg width="12" height="9" viewBox="0 0 12 9"><path d="M1 4.5L4 7.5L11 1" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                )}
                                {isMe && !msg.temp && !msg.error && !msg.sending && (() => {
                                  const rb = msg.readBy || [];
                                  const otherAssignees = (selectedTask?.assigneeIds || []).filter(id => id !== employeeId);
                                  const seenByOther = otherAssignees.some(id => rb.includes(id));
                                  // Single grey tick = sent, Double grey = delivered, Double blue = read
                                  if (seenByOther) {
                                    // Double BLUE tick — message has been read
                                    return (
                                      <svg width="16" height="9" viewBox="0 0 16 9" style={{ flexShrink: 0 }}>
                                        <path d="M1 4.5L4 7.5L11 1" stroke="#53BDEB" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d="M5 4.5L8 7.5L15 1" stroke="#53BDEB" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    );
                                  }
                                  // Double grey tick — delivered but not read
                                  return (
                                    <svg width="16" height="9" viewBox="0 0 16 9" style={{ flexShrink: 0 }}>
                                      <path d="M1 4.5L4 7.5L11 1" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                      <path d="M5 4.5L8 7.5L15 1" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  );
                                })()}
                              </div>
                              {msg.error && <div className="gv-bubble-status gv-error">Failed to send</div>}
                            </div>
                            {/* CEO can delete messages via context menu */}
                            {isCEO && !msg.temp && (
                              <button className="gv-delete-msg" onClick={(e) => { e.stopPropagation(); handleContextMenu(e, msg); }} title="More options">⋯</button>
                            )}
                          </div>
                        </div>
                      </SwipeableMessage>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar with @ mention */}
              {task && (
                <div style={{ position: "relative", flexShrink: 0 }}>
                  {/* Reply preview bar */}
                  {replyTo && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px 5px", background: "var(--p-lt)", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--p)", marginBottom: 1 }}>Replying to {replyTo.senderName === employeeName ? "yourself" : replyTo.senderName}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyTo.text}</div>
                      </div>
                      <button onClick={() => setReplyTo(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-4)", padding: 3, flexShrink: 0, display: "flex" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  )}
                  <div className="gv-input-bar">
                    <MediaMessageInput
                      onSend={chatTabMode === "draft" ? handleSendDraftChat : handleSendChat}
                      placeholder={chatTabMode === "draft" ? `Draft: ${task.title}…` : `Chat in ${task.title}…`}
                      disabled={chatTabMode === "draft" && ["confirmed", "in_progress", "done"].includes(task?.status)}
                      style={{ minHeight: "unset", maxHeight: 80 }}
                    />
                    {chatTabMode === "draft" && ["confirmed", "in_progress", "done"].includes(task?.status) && (
                      <div style={{ padding: "6px 12px", background: "#FFFBEB", borderTop: "1px solid #FDE68A", fontSize: 10, color: "#92400E", display: "flex", alignItems: "center", gap: 5 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                        Draft chat is read-only after task confirmation
                      </div>
                    )}
                  </div>
                </div>
              )}

            </>)}

            {/* === Image-2: inline detail/activity render inside chat sidebar === */}
            {task && !task.isFolder && rightPanel && (
              <div className="gv-chat-inline-detail" style={{ flex: 1, overflowY: task.isGoal ? "auto" : "hidden", background: "#fff", display: "flex", flexDirection: "column", minHeight: 0 }}>
                
                <TaskActionBanner task={task} employeeId={employeeId} isCEO={isCEO} isTL={isTL} isAssignee={isAssignee} isConfirmed={isConfirmed} isStarted={isStarted} actionBusy={actionBusy} handleAction={handleAction} getDisplaySeconds={getDisplaySeconds} timerActiveTaskId={timerActiveTaskId} handleTimerStart={handleTimerStart} handleTimerPause={handleTimerPause} />

                {rightPanel === "files" ? (
                  filesLoading ? (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 40 }}><GwSpinner /></div>
                  ) : taskFiles.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", gap: 10 }}>
                      <span style={{ fontSize: 32 }}>📂</span>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>No files yet</div>
                      <div style={{ fontSize: 11, color: "var(--text-4)", textAlign: "center" }}>Files shared in chat or activity logs will appear here.</div>
                    </div>
                  ) : (
                    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                        {taskFiles.length} file{taskFiles.length !== 1 ? "s" : ""}
                      </div>
                      {taskFiles.map((f, idx) => {
                        const isImg = f.type === "image" || /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name || "");
                        const isPdf = /\.pdf$/i.test(f.name || "");
                        const isDoc = /\.(doc|docx|xls|xlsx|ppt|pptx|csv|txt)$/i.test(f.name || "");
                        const icon = isImg ? "🖼️" : isPdf ? "📄" : isDoc ? "📊" : "📎";
                        const fmtD = (ts) => {
                          if (!ts) return "";
                          const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
                          return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
                        };
                        return (
                          <a key={idx} href={f.url} target="_blank" rel="noreferrer"
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)", textDecoration: "none" }}
                            onMouseEnter={e => e.currentTarget.style.background = "var(--bg-2)"}
                            onMouseLeave={e => e.currentTarget.style.background = "var(--bg)"}>
                            {isImg
                              ? <img src={f.url} alt={f.name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0, border: "1px solid var(--border)" }} />
                              : <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
                            }
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                              <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 2 }}>{f.from}{f.date ? " · " + fmtD(f.date) : ""}</div>
                            </div>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                          </a>
                        );
                      })}
                    </div>
                  )
                ) : rightPanel === "requests" && !task.isFolder ? (
                  <TaskRequestsPanel
                    task={task}
                    employeeId={employeeId}
                    employeeName={employeeName}
                    isCEO={isCEO}
                    isTL={isTL}
                    onNewRequest={() => window.dispatchEvent(new CustomEvent("openRequestPanel", { detail: { tab: "compose", taskId: task.taskId, taskTitle: task.title } }))}
                  />
                ) : (
                  <DetailBody
                    task={task}
                    dailyReports={dailyReports}
                    reportsLoading={reportsLoading}
                    activeDetailTab={rightPanel === "reports" ? "reports" : "info"}
                    setActiveDetailTab={(v) => setRightPanel(v === "reports" ? "reports" : "info")}
                    isAssignee={isAssignee}
                    isConfirmed={isConfirmed}
                    isStarted={isStarted}
                    isCEO={isCEO}
                    isTL={isTL}
                    actionBusy={actionBusy}
                    handleAction={handleAction}
                    handleSelectNode={handleSelectNode}
                    employeeId={employeeId}
                    pct={pct}
                    pctColor={pctColor}
                    pctGradient={pctGradient}
                    unreadCounts={unreadCounts}
                    employeeMap={employeeMap}
                    chatMessages={chatMessages}
                    timerActiveTaskId={timerActiveTaskId}
                    getDisplaySeconds={getDisplaySeconds}
                    getTimerSession={getTimerSession}
                    timerStart={handleTimerStart}
                    timerPause={handleTimerPause}
                    onUpdatePriority={handleUpdatePriority}
                    employeeMapFull={employeeMapFull}
                    watchedTimers={assigneeAllTimers}
                    deadlineFlow={{
                      proposedDurationVal: proposedDurationVal,
                      proposedDurationUnit: proposedDurationUnit,
                      setDurationVal: setProposedDurationVal,
                      setDurationUnit: setProposedDurationUnit,
                      proposing: proposingDeadline,
                      approving: approvingDeadline,
                      rejectReason,
                      setRejectReason,
                      showRejectInput,
                      setShowRejectInput,
                      showExtend: showExtendForm,
                      setShowExtend: setShowExtendForm,
                      showCounterForm,
                      setShowCounterForm,
                      counterDurationVal,
                      setCounterDurationVal,
                      counterDurationUnit,
                      setCounterDurationUnit,
                      counterMessage,
                      setCounterMessage,
                      counterBusy,
                      handleTlCounterPropose,
                      showRejectCounterInput,
                      setShowRejectCounterInput,
                      rejectCounterReason,
                      setRejectCounterReason,
                      respondBusy,
                      handleRespondToCounter,
                      empCounterDurationVal: empCounterDurationVal, setEmpCounterDurationVal,
                      empCounterDurationUnit: empCounterDurationUnit, setEmpCounterDurationUnit,
                      empCounterMsg, setEmpCounterMsg,
                      showEmpCounterForm, setShowEmpCounterForm,
                      onPropose: handleProposeDeadline,
                      onApprove: handleApproveDeadline,
                    }}
                    extFlow={{
                      showExtReqForm, setShowExtReqForm,
                      extReqDate, setExtReqDate,
                      extReqReason, setExtReqReason,
                      extReqBusy,
                      handleRequestExtension,
                      reviewExtDate, setReviewExtDate,
                      reviewExtBusy,
                      handleReviewExtension,
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* MOBILE DETAIL OVERLAY (Info/Reports) */}
        {task && mobDetailPanel && (
          <div className={`gv-detail mob-tab-active`} style={{ flexDirection: "column" }}>
            <div className="gv-detail-inner">
              {/* Mobile detail header with back */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
                <button
                  onClick={() => setMobDetailPanel(null)}
                  style={{ border: "none", background: "none", cursor: "pointer", color: "var(--p)", fontFamily: "var(--font)", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Chat
                </button>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</span>
              </div>

              {/* Mobile hero header — WhatsApp group info style */}
              <div className="gv-mob-detail-hero">
                {/* Top bar: back + task title + toggle */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#fff", borderBottom: "1px solid var(--border)" }}>
                  <button onClick={() => setMobDetailPanel(null)} style={{ width: 32, height: 32, border: "none", background: "var(--bg)", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)", flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>
                    <div style={{ fontSize: 10, color: "var(--text-4)", display: "flex", gap: 6, marginTop: 1 }}>
                      <span style={{ fontFamily: "monospace" }}>{task.taskId}</span>
                      {st && <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>}
                    </div>
                  </div>
                  <button onClick={() => setMobDetailPanel(mobDetailPanel === "info" ? "reports" : "info")} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 20, background: "var(--bg)", cursor: "pointer", color: "var(--text-2)", flexShrink: 0 }}>
                    {mobDetailPanel === "info" ? "Reports" : "Info"}
                  </button>
                </div>
                {/* Action row with SVG icons */}
                <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
                  {[
                    ...(isCEO || isTL ? [{ svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>, label: "Subtask", a: () => { handleAction("add_subtask"); setMobDetailPanel(null); } }] : []),
                    ...(!isCEO ? [{ svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7" /><path d="M4 18v-2a4 4 0 014-4h12" /></svg>, label: "Forward", a: () => { handleAction("forward"); setMobDetailPanel(null); } }] : []),
                    { svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>, label: "Request", a: () => { window.dispatchEvent(new CustomEvent("openRequestPanel", { detail: { tab: "compose", taskId: task.taskId, taskTitle: task.title } })); setMobDetailPanel(null); } },
                    ...(isCEO ? [{ svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>, label: "Deadline", a: () => { handleAction("deadline"); setMobDetailPanel(null); } }] : []),
                    ...(!isCEO && task.status === "in_progress" ? [{ svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>, label: "Report", a: () => { handleAction("report"); setMobDetailPanel(null); } }] : []),
                  ].map((ac, i) => (
                    <button key={i} onClick={ac.a} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: "10px 4px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font)" }}>
                      <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--p-lt)", color: "var(--p)", display: "flex", alignItems: "center", justifyContent: "center" }}>{ac.svg}</span>
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: "var(--text-3)" }}>{ac.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Desktop: keep badge row + tabs (hidden on mobile) */}
              <div className="gv-desk-detail-head">
                <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className="gv-code-tag">{task.taskId}</span>
                  {st && <span className="gv-badge" style={{ color: st.color, background: st.bg, borderColor: `${st.color}22` }}><span className="gv-badge-dot" style={{ background: st.dot }} />{st.label}</span>}
                  <span className="gv-badge" style={{ color: pri.color, background: pri.bg, borderColor: `${pri.color}22` }}><span className="gv-badge-dot" style={{ background: pri.dot }} />{pri.label}</span>
                </div>
                <div className="gv-detail-tabs">
                  {!task.isFolder && task.isGoal && (
                    <button className={`gv-dtab ${mobDetailPanel === "reports" ? "active" : ""}`} onClick={() => setMobDetailPanel("reports")}>Activity</button>
                  )}
                  <button className={`gv-dtab ${mobDetailPanel === "info" ? "active" : ""}`} onClick={() => setMobDetailPanel("info")}>Details</button>
                  {!task.isFolder && !task.isGoal && (
                    <button className={`gv-dtab ${mobDetailPanel === "reports" ? "active" : ""}`} onClick={() => setMobDetailPanel("reports")}>
                      {task.isThirdParty ? "Timeline" : task.isRepeat ? "Submissions" : "Reports"}
                      {!task.isThirdParty && !task.isRepeat && (task.dailyReportCount || 0) > 0 && <span className="gv-dtab-ct">{task.dailyReportCount}</span>}
                    </button>
                  )}
                  {task.isFolder && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#7C3AED", background: "#EDE9FE", padding: "3px 9px", borderRadius: 99, display: "flex", alignItems: "center", gap: 4, marginLeft: 6, alignSelf: "center" }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
                      Folder
                    </span>
                  )}
                </div>
              </div>

              <DetailBody
                task={task}
                dailyReports={dailyReports}
                reportsLoading={reportsLoading}
                activeDetailTab={mobDetailPanel}
                setActiveDetailTab={setMobDetailPanel}
                isAssignee={isAssignee}
                isConfirmed={isConfirmed}
                isStarted={isStarted}
                isCEO={isCEO}
                isTL={isTL}
                actionBusy={actionBusy}
                handleAction={handleAction}
                handleSelectNode={handleSelectNode}
                employeeId={employeeId}
                pct={pct}
                pctColor={pctColor}
                pctGradient={pctGradient}
                unreadCounts={unreadCounts}
                employeeMap={employeeMap}
                chatMessages={chatMessages}
                timerActiveTaskId={timerActiveTaskId}
                getDisplaySeconds={getDisplaySeconds}
                getTimerSession={getTimerSession}
                timerStart={handleTimerStart}
                timerPause={handleTimerPause}
                onUpdatePriority={handleUpdatePriority}
                employeeMapFull={employeeMapFull}
                watchedTimers={assigneeAllTimers}
                deadlineFlow={{
                  proposedDurationVal: proposedDurationVal,
                  proposedDurationUnit: proposedDurationUnit,
                  setDurationVal: setProposedDurationVal,
                  setDurationUnit: setProposedDurationUnit,
                  proposing: proposingDeadline,
                  approving: approvingDeadline,
                  rejectReason,
                  setRejectReason,
                  showRejectInput,
                  setShowRejectInput,
                  showExtend: showExtendForm,
                  setShowExtend: setShowExtendForm,
                  showCounterForm,
                  setShowCounterForm,
                  counterDurationVal,
                  setCounterDurationVal,
                  counterDurationUnit,
                  setCounterDurationUnit,
                  counterMessage,
                  setCounterMessage,
                  counterBusy,
                  handleTlCounterPropose,
                  showRejectCounterInput,
                  setShowRejectCounterInput,
                  rejectCounterReason,
                  setRejectCounterReason,
                  respondBusy,
                  handleRespondToCounter,
                  empCounterDurationVal: empCounterDurationVal, setEmpCounterDurationVal,
                  empCounterDurationUnit: empCounterDurationUnit, setEmpCounterDurationUnit,
                  empCounterMsg, setEmpCounterMsg,
                  showEmpCounterForm, setShowEmpCounterForm,
                  onPropose: handleProposeDeadline,
                  onApprove: handleApproveDeadline,
                }}
                extFlow={{
                  showExtReqForm, setShowExtReqForm,
                  extReqDate, setExtReqDate,
                  extReqReason, setExtReqReason,
                  extReqBusy,
                  handleRequestExtension,
                  reviewExtDate, setReviewExtDate,
                  reviewExtBusy,
                  handleReviewExtension,
                }}
              />
            </div>
          </div>
        )}

        {/* COL-3: RIGHT AREA (TOOLBAR + DETAIL PANEL) */}
        <div className={`gv-right-area ${rightPanel ? "gv-overlay-active" : "gv-overlay-hidden"}`} style={{ flexDirection: "row-reverse" }}>
          {/* Vertical toolbar — rightmost edge */}
          <div className="gv-toolbar" style={{ order: 2 }}>
            <button
              className={`gv-tool-btn ${rightPanel === "info" ? "active" : ""}`}
              onClick={() => setRightPanel(rightPanel === "info" ? null : "info")}
              title="Task Details"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </button>
            <button
              className={`gv-tool-btn ${rightPanel === "reports" ? "active" : ""}`}
              onClick={() => setRightPanel(rightPanel === "reports" ? null : "reports")}
              title="Reports"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </button>
            <button
              className={`gv-tool-btn ${rightPanel === "requests" ? "active" : ""}`}
              onClick={() => setRightPanel(rightPanel === "requests" ? null : "requests")}
              title="Requests"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </button>
            <div className="gv-tool-sep" />
            <button
              className="gv-tool-btn"
              onClick={() => task && handleAction("add_subtask")}
              title="Add Subtask"
              disabled={!task || (!isCEO && !isTL)}
              style={{ opacity: task && (isCEO || isTL) ? 1 : 0.3 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              className="gv-tool-btn"
              onClick={() => task && handleAction("forward")}
              title="Forward"
              disabled={!task}
              style={{ opacity: task ? 1 : 0.3 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 17 20 12 15 7" /><path d="M4 18v-2a4 4 0 014-4h12" />
              </svg>
            </button>
          </div>

          {/* Detail panel */}
          <div className={`gv-detail ${rightPanel === null ? "collapsed" : ""}`}>
            <div className="gv-detail-inner">
              {/* Detail header with close */}
              <div className="gv-detail-head">
                <span className="gv-detail-head-title">{rightPanel === "reports" ? "Reports" : rightPanel === "requests" ? "Requests" : rightPanel === "files" ? "Files" : "Task Details"}</span>
                <div className="gv-detail-head-actions">
                  <button className="gv-detail-icon-btn" onClick={() => setRightPanel(null)} title="Close panel">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              </div>

              {!task ? (
                <div className="gv-placeholder">
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-4)", lineHeight: 1.6, maxWidth: 180, textAlign: "center" }}>Select a task to view details here.</p>
                </div>
              ) : detailLoading ? (
                <div style={{ padding: "18px 15px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="gv-skel-row">
                      <div className="gv-skel-lines">
                        <div className="gv-skeleton gv-skel-line" style={{ width: `${90 - i * 12}%`, height: i === 1 ? 16 : 10 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* No duplicate header — DetailBody renders its own */}


                  {/* Desktop tabs */}
                  <div className="gv-detail-tabs">
                    <button className={`gv-dtab ${rightPanel === "info" ? "active" : ""}`} onClick={() => { setActiveDetailTab("info"); setRightPanel("info"); }}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1" /><path d="M5.5 5v3M5.5 3.5v.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
                      Info
                    </button>
                    {!task.isFolder && (
                      <button className={`gv-dtab ${rightPanel === "reports" ? "active" : ""}`} onClick={() => { setActiveDetailTab("reports"); setRightPanel("reports"); }}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="7" width="2" height="3.5" rx=".5" stroke="currentColor" strokeWidth=".9" /><rect x="4.5" y="4" width="2" height="6.5" rx=".5" stroke="currentColor" strokeWidth=".9" /><rect x="8" y="1" width="2" height="9.5" rx=".5" stroke="currentColor" strokeWidth=".9" /></svg>
                        {task.isThirdParty ? "Timeline" : task.isGoal ? "Goal" : task.isRepeat ? "Submissions" : "Reports"}
                        {!task.isThirdParty && !task.isGoal && !task.isRepeat && (task.dailyReportCount || 0) > 0 && <span className="gv-dtab-ct">{task.dailyReportCount}</span>}
                      </button>
                    )}
                    {!task.isFolder && (
                      <button className={`gv-dtab ${rightPanel === "requests" ? "active" : ""}`} onClick={() => setRightPanel("requests")}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                        Requests
                      </button>
                    )}
                    {task.isFolder && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#7C3AED", background: "#EDE9FE", padding: "3px 9px", borderRadius: 99, display: "flex", alignItems: "center", gap: 4, marginLeft: 4, alignSelf: "center" }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
                        Folder Task
                      </span>
                    )}
                  </div>

                  {rightPanel === "files" ? (
                    filesLoading ? (
                      <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><GwSpinner /></div>
                    ) : taskFiles.length === 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", gap: 10 }}>
                        <span style={{ fontSize: 32 }}>📂</span>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>No files yet</div>
                        <div style={{ fontSize: 11, color: "var(--text-4)", textAlign: "center" }}>Files shared in chat or activity logs will appear here.</div>
                      </div>
                    ) : (
                      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", flex: 1 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                          {taskFiles.length} file{taskFiles.length !== 1 ? "s" : ""}
                        </div>
                        {taskFiles.map((f, idx) => {
                          const isImg = f.type === "image" || /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name || "");
                          const isPdf = /\.pdf$/i.test(f.name || "");
                          const isDoc = /\.(doc|docx|xls|xlsx|ppt|pptx|csv|txt)$/i.test(f.name || "");
                          const icon = isImg ? "🖼️" : isPdf ? "📄" : isDoc ? "📊" : "📎";
                          const fmtD = (ts) => {
                            if (!ts) return "";
                            const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
                            return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
                          };
                          return (
                            <a key={idx} href={f.url} target="_blank" rel="noreferrer"
                              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)", textDecoration: "none" }}
                              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-2)"}
                              onMouseLeave={e => e.currentTarget.style.background = "var(--bg)"}>
                              {isImg
                                ? <img src={f.url} alt={f.name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0, border: "1px solid var(--border)" }} />
                                : <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
                              }
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                                <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 2 }}>{f.from}{f.date ? " · " + fmtD(f.date) : ""}</div>
                              </div>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            </a>
                          );
                        })}
                      </div>
                    )
                  ) : rightPanel === "requests" && !task.isFolder ? (
                    <TaskRequestsPanel
                      task={task}
                      employeeId={employeeId}
                      employeeName={employeeName}
                      isCEO={isCEO}
                      isTL={isTL}
                      onNewRequest={() => window.dispatchEvent(new CustomEvent("openRequestPanel", { detail: { tab: "compose", taskId: task.taskId, taskTitle: task.title } }))}
                    />
                  ) : (
                    <DetailBody
                      task={task}
                      dailyReports={dailyReports}
                      reportsLoading={reportsLoading}
                      activeDetailTab={activeDetailTab}
                      setActiveDetailTab={setActiveDetailTab}
                      isAssignee={isAssignee}
                      isConfirmed={isConfirmed}
                      isStarted={isStarted}
                      isCEO={isCEO}
                      isTL={isTL}
                      actionBusy={actionBusy}
                      handleAction={handleAction}
                      handleSelectNode={handleSelectNode}
                      employeeId={employeeId}
                      pct={pct}
                      pctColor={pctColor}
                      pctGradient={pctGradient}
                      unreadCounts={unreadCounts}
                      employeeMap={employeeMap}
                      chatMessages={chatMessages}
                      timerActiveTaskId={timerActiveTaskId}
                      getDisplaySeconds={getDisplaySeconds}
                      getTimerSession={getTimerSession}
                      timerStart={handleTimerStart}
                      deadlineFlow={{
                        proposedDurationVal: proposedDurationVal,
                        proposedDurationUnit: proposedDurationUnit,
                        setDurationVal: setProposedDurationVal,
                        setDurationUnit: setProposedDurationUnit,
                        proposing: proposingDeadline,
                        approving: approvingDeadline,
                        rejectReason,
                        setRejectReason,
                        showRejectInput,
                        setShowRejectInput,
                        showExtend: showExtendForm,
                        setShowExtend: setShowExtendForm,
                        showCounterForm,
                        setShowCounterForm,
                        counterDurationVal,
                        setCounterDurationVal,
                        counterDurationUnit,
                        setCounterDurationUnit,
                        counterMessage,
                        setCounterMessage,
                        counterBusy,
                        handleTlCounterPropose,
                        showRejectCounterInput,
                        setShowRejectCounterInput,
                        rejectCounterReason,
                        setRejectCounterReason,
                        respondBusy,
                        handleRespondToCounter,
                        empCounterDurationVal: empCounterDurationVal, setEmpCounterDurationVal,
                        empCounterDurationUnit: empCounterDurationUnit, setEmpCounterDurationUnit,
                        empCounterMsg, setEmpCounterMsg,
                        showEmpCounterForm, setShowEmpCounterForm,
                        onPropose: handleProposeDeadline,
                        onApprove: handleApproveDeadline,
                      }}
                      extFlow={{
                        showExtReqForm, setShowExtReqForm,
                        extReqDate, setExtReqDate,
                        extReqReason, setExtReqReason,
                        extReqBusy,
                        handleRequestExtension,
                        reviewExtDate, setReviewExtDate,
                        reviewExtBusy,
                        handleReviewExtension,
                      }}
                      timerPause={handleTimerPause}
                      onUpdatePriority={handleUpdatePriority}
                      employeeMapFull={employeeMapFull}
                      watchedTimers={assigneeAllTimers}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div >


      {/* Mobile bottom sheet row menu */}
      {
        sheetTask && (
          <>
            <div className="gv-row-menu-sheet-overlay" onClick={() => setSheetTask(null)} />
            <div className="gv-row-menu-sheet">
              <div className="gv-row-menu-sheet-handle" />
              <div className="gv-row-menu-sheet-title">{sheetTask.title}</div>
              {[
                ...(!sheetTask.isFolder ? [{ l: "Open Chat", icon: <MessageCircle />, a: () => { handleSelectNode(sheetTask); setSheetTask(null); } }] : []),
                ...((isCEO || isTL) ? [{ l: "Add Subtask", icon: <Plus />, a: () => { setActiveModal({ type: "add_subtask", taskId: sheetTask.taskId, task: sheetTask }); setSheetTask(null); } }] : []),
                ...(!isCEO && !sheetTask.isFolder ? [{ l: "Forward Task", icon: <Forward />, a: () => { setActiveModal({ type: "forward", taskId: sheetTask.taskId, task: sheetTask }); setSheetTask(null); } }] : []),
                ...(!isCEO && !sheetTask.isFolder ? [{ l: "Daily Report", icon: <BarChart3 />, a: () => { setActiveModal({ type: "report", taskId: sheetTask.taskId, task: sheetTask }); setSheetTask(null); } }] : []),
                ...(isCEO ? [{ l: "Edit Deadline", icon: <Calendar />, a: () => { setActiveModal({ type: "deadline", taskId: sheetTask.taskId, task: sheetTask }); setSheetTask(null); } }] : []),
                ...(isCEO && sheetTask.completionStatus === "submitted" && sheetTask.reviewFlow === "ceo_direct" ? [{ l: "Review Completion", icon: <CheckCircle />, a: () => { setActiveModal({ type: "review_completion", taskId: sheetTask.taskId, task: sheetTask }); setSheetTask(null); } }] : []),
                ...(isTL && sheetTask.completionStatus === "submitted" && ["tl_final", "tl_then_ceo", null, undefined].includes(sheetTask.reviewFlow) ? [{ l: "Review Submission", icon: <CheckCircle />, a: () => { setActiveModal({ type: "review_completion", taskId: sheetTask.taskId, task: sheetTask }); setSheetTask(null); } }] : []),
                ...(isCEO && sheetTask.completionStatus === "tl_approved" && sheetTask.reviewFlow === "tl_then_ceo" ? [{ l: "CEO Final Approval", icon: <CheckCircle />, a: () => { setActiveModal({ type: "ceo_review", taskId: sheetTask.taskId, task: sheetTask }); setSheetTask(null); } }] : []),
              ].map((item, i) => (
                <button key={i} className="gv-row-menu-sheet-item" onClick={item.a}>
                  <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{item.icon}</span>
                  {item.l}
                </button>
              ))}
              {isCEO && (
                <>
                  <div className="gv-row-menu-sheet-sep" />
                  <button className="gv-row-menu-sheet-item danger" onClick={() => { setActiveModal({ type: "delete_task", taskId: sheetTask.taskId, task: sheetTask }); setShowDeleteConf(true); setSheetTask(null); }}>
                    <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>🗑</span>
                    Delete Task
                  </button>
                </>
              )}
            </div>
          </>
        )
      }

      {/* Context Menu */}
      {
        contextMenu && (
          <div className="gv-ctx-menu" style={{ left: Math.min(contextMenu.x, window.innerWidth - 180), top: Math.min(contextMenu.y, window.innerHeight - 200) }} onClick={e => e.stopPropagation()}>
            {/* Reply */}
            <button className="gv-ctx-item" onClick={() => {
              setReplyTo({ messageId: contextMenu.message.messageId, text: contextMenu.message.text || (contextMenu.message.attachments?.length ? "📎 Attachment" : ""), senderName: contextMenu.message.senderName });
              setContextMenu(null);
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 00-4-4H4" /></svg>
              Reply
            </button>
            {/* Copy */}
            <button className="gv-ctx-item" onClick={() => {
              if (contextMenu.message?.text) navigator.clipboard?.writeText(contextMenu.message.text);
              setContextMenu(null);
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
              Copy text
            </button>
            {contextMenu.message?.attachments?.some(a => a.type === "image") && (
              <button className="gv-ctx-item" onClick={() => {
                const img = contextMenu.message.attachments.find(a => a.type === "image");
                if (img) downloadImage(img.url);
                setContextMenu(null);
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Download image
              </button>
            )}

          </div>
        )
      }

      {/* Modals */}
      {
        activeModal?.type === "add_subtask" && <CreateTaskModal
          onClose={() => setActiveModal(null)}
          onSuccess={async (newTask) => {
            setActiveModal(null);
            if (activeModal.task?.taskId) setExpandedIds(prev => new Set([...prev, activeModal.task.taskId]));
            await loadAllTasks();
            if (selectedTask) loadDetail(selectedTask.taskId);
          }}
          currentEmployeeId={employeeId}
          currentEmployeeName={employeeName}
          currentRole={role}
          parentTask={activeModal.task}
        />
      }
      {/* ── Add Goal Task — opens same CreateTaskModal with isGoal=true pre-set ── */}
      {
        activeModal?.type === "add_goal_task" && <CreateTaskModal
          onClose={() => setActiveModal(null)}
          onSuccess={async (newTask) => {
            setActiveModal(null);
            if (activeModal.task?.taskId) setExpandedIds(prev => new Set([...prev, activeModal.task.taskId]));
            await loadAllTasks();
            if (selectedTask) loadDetail(selectedTask.taskId);
          }}
          currentEmployeeId={employeeId}
          currentEmployeeName={employeeName}
          currentRole={role}
          parentTask={activeModal.task}
          initialIsGoal={true}
        />
      }
      {activeModal?.type === "self_assign" && (
        <SelfAssignTaskModal
          onClose={() => setActiveModal(null)}
          onSuccess={async (newTask) => {
            setActiveModal(null);
            await loadAllTasks();
            if (newTask?.taskId) loadDetail(newTask.taskId);
          }}
          currentEmployeeId={employeeId}
          currentEmployeeName={employeeName}
          currentRole={role}
        />
      )}
      {activeModal?.type === "forward" && <ForwardTaskModal task={getModalTask()} currentEmployeeId={employeeId} onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); if (selectedTask) loadDetail(selectedTask.taskId); }} />}
      {activeModal?.type === "report" && <DailyReportModal task={getModalTask()} currentEmployeeId={employeeId} onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadDetail(selectedTask.taskId); setActiveDetailTab("reports"); }} />}
      {activeModal?.type === "deadline" && task && <EditDeadlineModal task={task} onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadDetail(task.taskId); loadAllTasks(); }} />}
      {activeModal?.type === "submit_completion" && <SubmitCompletionModal task={getModalTask()} currentEmployeeId={employeeId} onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadDetail(selectedTask.taskId); }} />}
      {activeModal?.type === "review_completion" && <ReviewCompletionModal task={getModalTask()} currentEmployeeId={employeeId} role={role} reviewType="review_completion" onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadDetail(selectedTask.taskId); }} />}
      {activeModal?.type === "ceo_review" && <ReviewCompletionModal task={getModalTask()} currentEmployeeId={employeeId} role={role} reviewType="ceo_review" onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadDetail(selectedTask.taskId); }} />}

      {priCtxMenu && (
        <div
          className="gv-pri-ctx"
          style={{
            position: "fixed",
            left: Math.min(priCtxMenu.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 180),
            top: Math.min(priCtxMenu.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 240),
            zIndex: 9999,
            background: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(15,23,42,0.14)",
            padding: 6,
            minWidth: 168,
            animation: "ctx-in 0.12s ease",
            fontFamily: "var(--font)",
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94A3B8", padding: "4px 10px 8px", borderBottom: "1px solid #F1F5F9", marginBottom: 4 }}>
            Set Priority
          </div>
          {[
            { p: 1, label: "P1 — Highest", color: "#DC2626", bg: "#FEF2F2" },
            { p: 2, label: "P2 — High", color: "#EA580C", bg: "#FFF7ED" },
            { p: 3, label: "P3 — Medium", color: "#D97706", bg: "#FFFBEB" },
            { p: 4, label: "P4 — Normal", color: "#0369A1", bg: "#EFF6FF" },
            { p: 5, label: "P5 — Low", color: "#16A34A", bg: "#F0FDF4" },
          ].map(({ p, label, color, bg }) => {
            const isActive = Number(priCtxMenu.current) === p;
            return (
              <button
                key={p}
                onClick={() => { handleUpdatePriority(priCtxMenu.taskId, p); setPriCtxMenu(null); }}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  width: "100%", padding: "7px 10px",
                  border: "none", background: isActive ? "#EBF2FA" : "none",
                  cursor: "pointer", fontSize: 12, fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#1B4F8A" : "#374151",
                  textAlign: "left", borderRadius: 6, fontFamily: "var(--font)",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#F5F7FF"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "none"; }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                  background: bg, color, fontSize: 9, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1px solid ${color}44`,
                }}>P{p}</span>
                {label}
                {isActive && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: "auto", flexShrink: 0 }}>
                    <path d="M2 6l3 3 5-5" stroke="#1B4F8A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Delete message confirmation modal */}
      {
        deleteMsgConf && (
          <GwConfirm
            open={true}
            title="Delete Message?"
            message={`Delete this message from ${deleteMsgConf.message.senderName}? This action cannot be undone.`}
            onConfirm={confirmDeleteMessage}
            onCancel={() => setDeleteMsgConf(null)}
          />
        )
      }

      {/* ── Work Commit Modal — shown when employee pauses timer ── */}
      <WorkCommitModal
        commitModal={commitModal}
        commitMessage={commitMessage}
        commitAttachments={commitAttachments}
        commitUploading={commitUploading}
        commitDragging={commitDragging}
        savingCommit={savingCommit}
        setCommitMessage={setCommitMessage}
        setCommitAttachments={setCommitAttachments}
        setCommitDragging={setCommitDragging}
        commitFileInputRef={commitFileInputRef}
        closeCommitModal={closeCommitModal}
        uploadCommitFiles={uploadCommitFiles}
        handleCommitSubmit={handleCommitSubmit}
      />

      {/* Delete task confirmation modal */}
      <GwConfirm
        open={showDeleteConf}
        busy={actionBusy}
        title="Delete Task?"
        message={`Permanently delete "${(activeModal?.task || task)?.title} (${(activeModal?.task || task)?.taskId})"${(activeModal?.task || task)?.subtaskIds?.length ? ` and all ${(activeModal?.task || task).subtaskIds.length} subtasks` : ""}? This cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => { if (!actionBusy) setShowDeleteConf(false); }}
      />

      {/* Request panel is now universal — opened via window event from toolbar/mobile */}
    </>
  );
}