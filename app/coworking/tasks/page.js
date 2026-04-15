"use client";
/**
 * GRAV-CMS/app/coworking/tasks/page.js
 * ✦ REDESIGN V2 — Desktop: Tree | Chat | Details   Mobile: List → Chat+Tabs
 * ADDED: Enter to send, image lightbox, download option for attachments, message deletion (CEO only)
 * UPDATED: Tree Col-1 now groups by EMPLOYEE NAME (CEO view), then shows tasks/subtasks under each
 * FIXED: TL approve button properly integrated
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../components/coworking/layout/CoworkingShell";

import CreateTaskModal from "../../../components/coworking/tasks/CreateTaskModal";
import ForwardTaskModal from "../../../components/coworking/tasks/ForwardTaskModal";
import DailyReportModal from "../../../components/coworking/tasks/DailyReportModal";
import EditDeadlineModal from "../../../components/coworking/tasks/EditDeadlineModal";
import SubmitCompletionModal from "../../../components/coworking/tasks/SubmitCompletionModal";
import ReviewCompletionModal from "../../../components/coworking/tasks/ReviewCompletionModal";
import DeadlineBadge, { getDeadlineInfo } from "../../../components/coworking/tasks/DeadlineBadge";
import MediaMessageInput from "../../../components/coworking/messaging/MediaMessageInput";
import MessageBubble from "../../../components/coworking/messaging/MessageBubble";
import { GwAvatar, GwSpinner, GwEmpty, GwSectionLabel, GwConfirm, btnStyle } from "../../../components/coworking/shared/CoworkShared";
import { listTasks, getFullTask, getDailyReports, deleteTask } from "../../../lib/mediaUploadApi";
import { firebaseDb, firebaseAuth } from "../../../lib/coworkFirebase";
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
  writeBatch, where, arrayUnion,
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
};

const COMP = {
  submitted: { label: "Awaiting Review", color: "#D97706", bg: "#FEF3C7", icon: "⏳" },
  tl_approved: { label: "TL Approved · CEO Review", color: "#5B5EF4", bg: "#EDEDFE", icon: "✓" },
  tl_rejected: { label: "Rejected — Revise Work", color: "#EF4444", bg: "#FEF2F2", icon: "✕" },
  tl_final_approved: { label: "Approved — Complete!", color: "#16A34A", bg: "#DCFCE7", icon: "🏆" },
  ceo_approved: { label: "Approved — Complete!", color: "#16A34A", bg: "#DCFCE7", icon: "🏆" },
  ceo_rejected: { label: "CEO Rejected", color: "#EF4444", bg: "#FEF2F2", icon: "✕" },
};

const PRI = {
  high: { label: "Urgent", color: "#B91C1C", bg: "#FEF2F2", dot: "#B91C1C" },
  medium: { label: "Normal", color: "#92400E", bg: "#FFFBEB", dot: "#D97706" },
  low: { label: "Lowest", color: "#166534", bg: "#F0FDF4", dot: "#16A34A" }
};

// Avatar Color Helper
const AVATAR_COLORS = [
  ["#3B4252", "#4C566A"], ["#2563EB", "#3B82F6"], ["#0F766E", "#14B8A6"],
  ["#7C2D12", "#B91C1C"], ["#6D28D9", "#7C3AED"], ["#0E7490", "#06B6D4"],
  ["#9D174D", "#EC4899"], ["#374151", "#6B7280"],
];

function getAvatarColors(name = "") {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

// Helper Functions
function groupByDate(messages) {
  const groups = [];
  let lastDate = null;
  messages.forEach(msg => {
    const d = msg.createdAt ? new Date(msg.createdAt) : new Date();
    const dateStr = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    if (dateStr !== lastDate) {
      groups.push({ type: "date", label: dateStr });
      lastDate = dateStr;
    }
    groups.push({ type: "msg", ...msg });
  });
  return groups;
}

/* ─── Image Lightbox Modal ─── */
function ImageLightbox({ url, onClose, onDownload }) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          maxWidth: "90vw",
          maxHeight: "90vh",
          background: "transparent",
        }}
      >
        <img
          src={url}
          alt="Enlarged view"
          style={{
            maxWidth: "100%",
            maxHeight: "90vh",
            objectFit: "contain",
            borderRadius: "12px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
          }}
        />
        <button
          onClick={onDownload}
          style={{
            position: "absolute",
            bottom: "20px",
            right: "20px",
            background: "rgba(0,0,0,0.7)",
            border: "none",
            borderRadius: "50%",
            width: "48px",
            height: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.9)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.7)"}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            background: "rgba(0,0,0,0.7)",
            border: "none",
            borderRadius: "50%",
            width: "40px",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
            fontSize: "24px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.9)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.7)"}
        >
          ✕
        </button>
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}

/* ─── TreeNode ─── */
function TreeNode({ node, allTaskMap, selectedId, onSelect, expandedIds, toggleExpand, depth, viewerRole, viewerEmployeeId, unreadTaskIds, unreadCounts, lastMsgTimes }) {
  const isSelected = selectedId === node.taskId;
  const isExpanded = expandedIds.has(node.taskId);
  const dl = getDeadlineInfo(node.dueDate);
  const isUnread = unreadTaskIds?.has(node.taskId);

  // CEO: hide TL-created subtasks in count/expand
  const allChildren = (node.subtaskIds || []).map(id => allTaskMap.get(id)).filter(Boolean);
  const visibleChildren = viewerRole === "ceo"
    ? allChildren.filter(c => c.createdByCeo === true || (c.assignedBy === viewerEmployeeId && c.createdByTl !== true))
    : allChildren;
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
          key={child.taskId} node={child} allTaskMap={allTaskMap}
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
  empId, empName, tasks, allTaskMap, selectedId, onSelect,
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
        <GwAvatar name={empName} size={24} style={{ marginRight: 4, flexShrink: 0 }} />

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
              key={t.taskId} node={t} allTaskMap={allTaskMap}
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
function ReportCard({ report }) {
  const pct = report.progressPercent || 0;
  const pctColor = pct >= 100 ? "#16A34A" : pct >= 50 ? "var(--p,#5B5EF4)" : "#F59E0B";
  const pctBg = pct >= 100 ? "#DCFCE7" : pct >= 50 ? "var(--p-lt,#EDEDFE)" : "#FEF3C7";
  return (
    <div className="gv-report-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <GwAvatar name={report.employeeName} size={30} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1,#0C0E1A)" }}>{report.employeeName}</div>
            <div style={{ fontSize: 10, color: "var(--text-4,#A8AFCC)", marginTop: 1, fontFamily: "var(--mono,monospace)" }}>{report.reportDate}</div>
          </div>
        </div>
        <span style={{ padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 800, color: pctColor, background: pctBg, fontFamily: "var(--mono,monospace)" }}>{pct}%</span>
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--text-2,#3D4060)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{report.message}</p>
      {report.imageUrls?.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(56px,1fr))", gap: 4, marginTop: 6 }}>
          {report.imageUrls.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              <img src={url} alt="" style={{ width: "100%", height: 56, objectFit: "cover", borderRadius: 7, border: "1px solid var(--border,rgba(0,0,0,0.07))", display: "block" }} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}



/* ─── Detail Panel Body — Task.Co Card Style (shared desktop + mobile) ─── */

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

function DetailBody({ task, dailyReports, reportsLoading, activeDetailTab, setActiveDetailTab,
  isAssignee, isConfirmed, isStarted, isCEO, isTL, actionBusy, handleAction, handleSelectNode,
  employeeId, pct, pctColor, pctGradient, unreadCounts, employeeMap, chatMessages }) {
  const st = STATUS[task.status] || STATUS.open;
  // Derive comp label — for "submitted" status, show flow-appropriate label
  const _compBase = task.completionStatus ? COMP[task.completionStatus] : null;
  const comp = _compBase ? {
    ..._compBase,
    label: (task.completionStatus === "submitted" && task.reviewFlow === "ceo_direct")
      ? "Awaiting CEO Review"
      : (task.completionStatus === "submitted" && task.reviewFlow === "tl_final")
        ? "Awaiting TL Final Review"
        : (task.completionStatus === "submitted")
          ? "Awaiting TL Review"
          : _compBase.label,
  } : null;
  const pri = task.priority ? (PRI[task.priority] || PRI.medium) : PRI.medium;

  const createdDate = task.createdAt
    ? new Date(typeof task.createdAt === "object" && task.createdAt.seconds ? task.createdAt.seconds * 1000 : task.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  /* ── Field row helper ── */
  const Field = ({ icon, label, children }) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 11, color: "var(--text-4)", width: 90, flexShrink: 0, display: "flex", alignItems: "center", gap: 5, paddingTop: 1 }}>
        {icon} {label}
      </span>
      <div style={{ flex: 1, fontSize: 12, color: "var(--text-1)", lineHeight: 1.5 }}>{children}</div>
    </div>
  );

  /* ── Collect all files from task.attachments + chat message attachments ── */
  const allFiles = (() => {
    const files = [];
    // Task-level attachments
    (task.attachments || []).forEach(att => files.push({ ...att, source: "task" }));
    // Chat message attachments
    const msgs = chatMessages || task.chatMessages || [];
    msgs.forEach(msg => {
      (msg.attachments || []).forEach(att => {
        if (att.url) files.push({ name: att.name || att.fileName || (att.type === "image" ? "Image" : att.type === "pdf" ? "Document.pdf" : att.type === "voice" ? "Voice Note" : "File"), url: att.url, type: att.type || "file", size: att.size || 0, source: "chat" });
      });
      if (msg.mediaUrl && !msg.attachments?.length) files.push({ name: "Image", url: msg.mediaUrl, type: "image", size: 0, source: "chat" });
      if (msg.pdfUrl && !msg.attachments?.length) files.push({ name: "Document.pdf", url: msg.pdfUrl, type: "pdf", size: 0, source: "chat" });
    });
    return files;
  })();

  return (
    <>
      {activeDetailTab === "info" && (
        <div className="gv-detail-scroll" style={{ gap: 0, padding: "0 0 16px" }}>

          {/* ── Header block: created date + badges + title ── */}
          <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--border)" }}>
            {createdDate && (
              <div style={{ fontSize: 10, color: "var(--text-4)", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                Created on {createdDate}
              </div>
            )}
            {/* Badges row */}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 6, color: "var(--p)", background: "var(--p-lt)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1" /><path d="M3 5h4" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" /></svg>
                Task Name
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 6, color: pri.color, background: pri.bg, display: "inline-flex", alignItems: "center", gap: 3 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                {pri.label}
              </span>
              {st && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 6, color: st.color, background: st.bg, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.dot }} /> {st.label}
              </span>}
              <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-4)", padding: "3px 7px", background: "var(--bg)", borderRadius: 5, border: "1px solid var(--border)" }}>{task.taskId}</span>
            </div>
            {/* Big title */}
            <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.3, margin: 0, letterSpacing: "-0.01em" }}>{task.title}</h2>
          </div>

          {/* ── Description ── */}
          {task.description && (
            <div style={{ margin: "0 14px 0", padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 11, lineHeight: 1.65, color: "var(--text-2)" }}>
              {task.description}
            </div>
          )}

          {/* ── Structured fields ── */}
          <div style={{ display: "flex", flexDirection: "column", padding: "0 14px" }}>
            {/* People */}
            <Field icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>} label="People">
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {(task.assigneeIds || []).length > 0
                  ? (task.assigneeIds || []).map((id, i) => {
                    const nm = (typeof employeeMap?.get === "function" ? employeeMap.get(id) : null) || task.assigneeNameMap?.[id] || (task.assigneeNames || [])[i] || id;
                    const [c1, c2] = getAvatarColors(nm || id);
                    return (
                      <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px 3px 3px", borderRadius: 99, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 11, fontWeight: 500 }}>
                        <span style={{ width: 18, height: 18, borderRadius: "50%", background: `linear-gradient(135deg,${c1},${c2})`, color: "#fff", fontSize: 7, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {(nm || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                        {nm}
                      </span>
                    );
                  })
                  : <span style={{ color: "var(--text-4)", fontSize: 11 }}>Unassigned</span>
                }
              </div>
            </Field>

            {/* Timeline */}
            {(task.startDate || task.dueDate) && (
              <Field icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>} label="Timeline Date">
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-1)" }}>
                    {[
                      task.startDate ? new Date(task.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null,
                      task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null
                    ].filter(Boolean).join(" – ")}
                  </span>
                  {task.dueDate && <DeadlineBadge dueDate={task.dueDate} />}
                </div>
              </Field>
            )}

            {/* Type / category if exists */}
            {task.type && (
              <Field icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>} label="Type">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 6, background: "var(--bg)", border: "1px solid var(--border)", fontSize: 11, fontWeight: 600 }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                  {task.type}
                </span>
              </Field>
            )}

            {/* Attachments — sidebar card style */}
            {allFiles.length > 0 && (
              <div style={{ padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)" }}>Attachments ( {allFiles.length} )</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {allFiles.map((att, i) => {
                    const isImg = att.type === "image" || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name || att.fileName || "");
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: isImg ? "#FEF3C7" : "var(--p-lt)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {isImg
                            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--p)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                          }
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name || att.fileName || "Attachment"}</div>
                          <div style={{ fontSize: 9, color: "var(--text-4)", marginTop: 1 }}>
                            {att.size ? `${(att.size / 1048576).toFixed(2)} MB` : ""}
                            {att.url && <>{att.size ? " • " : ""}<a href={att.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--p)", fontWeight: 600, textDecoration: "none" }}>Preview</a></>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            {task.notes && (
              <Field icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>} label="Notes">
                <div style={{ fontSize: 11, lineHeight: 1.6, color: "var(--text-2)", whiteSpace: "pre-wrap" }}>{task.notes}</div>
              </Field>
            )}
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 14, padding: "0 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Progress</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)", color: pctColor }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "var(--bg)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 99, width: `${pct}%`, background: pctGradient, transition: "width 0.6s" }} />
            </div>
          </div>

          {/* Completion banner */}
          {comp && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 8, border: `1px solid ${comp.color}33`, color: comp.color, background: comp.bg, marginTop: 12, marginRight: 14 }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{comp.icon}</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{comp.label}</div>
                {task.completionStatus === "tl_rejected" && task.tlReview?.rejectionReason && <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>{task.tlReview.rejectionReason}</div>}
                {task.completionStatus === "ceo_rejected" && task.ceoReview?.rejectionReason && <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>{task.ceoReview.rejectionReason}</div>}
              </div>
            </div>
          )}

          {/* Workflow actions */}
          {(isAssignee || isTL || isCEO) && (
            <div style={{ marginTop: 14, padding: "0 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-4)", marginBottom: 6 }}>Workflow</div>
              {isAssignee && !isConfirmed && task.status === "open" && (
                <button className="gv-wf-btn gv-wf-confirm" disabled={actionBusy} onClick={() => handleAction("confirm")}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Confirm Task
                </button>
              )}
              {isAssignee && isConfirmed && !isStarted && (
                <button className="gv-wf-btn gv-wf-start" disabled={actionBusy} onClick={() => handleAction("start")}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3 2l7 4-7 4V2z" fill="currentColor" /></svg>
                  Start Working
                </button>
              )}
              {isAssignee && task.status === "in_progress" && (
                <button className="gv-wf-btn gv-wf-report" onClick={() => handleAction("report")}>Daily Report</button>
              )}
              {isAssignee && task.status === "in_progress" && !["submitted", "tl_approved", "tl_final_approved", "ceo_approved", "ceo_direct_approved"].includes(task.completionStatus) && (
                <button className="gv-wf-btn gv-wf-submit" onClick={() => handleAction("submit_completion")}>Submit for Review</button>
              )}
              {isTL && task.status === "pending_tl_approval" && task.assigneeIds?.includes(employeeId) && (
                <button className="gv-wf-btn" style={{ background: "#EDEDFE", color: "#5B5EF4", borderColor: "rgba(91,94,244,.3)" }} disabled={actionBusy} onClick={() => handleAction("approve_tl")}>⭐ Approve Task</button>
              )}
              {/* TL Review: show when submitted AND (flow is tl_final or tl_then_ceo) */}
              {isTL && task.completionStatus === "submitted" && ["tl_final", "tl_then_ceo", null, undefined].includes(task.reviewFlow) && (
                <button className="gv-wf-btn gv-wf-review" onClick={() => handleAction("review_completion")}>
                  {task.reviewFlow === "tl_final" ? "✅ Final Review" : "Review Submission"}
                </button>
              )}
              {/* CEO Review Direct: show when submitted AND flow is ceo_direct */}
              {isCEO && task.completionStatus === "submitted" && task.reviewFlow === "ceo_direct" && (
                <button className="gv-wf-btn gv-wf-ceo" onClick={() => handleAction("review_completion")}>CEO Final Review</button>
              )}
              {/* CEO Final Review: show after TL approved in tl_then_ceo flow */}
              {isCEO && task.completionStatus === "tl_approved" && task.reviewFlow === "tl_then_ceo" && (
                <button className="gv-wf-btn gv-wf-ceo" onClick={() => handleAction("ceo_review")}>CEO Final Approval</button>
              )}
            </div>
          )}

          {/* Subtasks — Task.Co style */}
          {task.subtasks?.length > 0 && (
            <div style={{ marginTop: 14, padding: "0 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-4)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="3" height="3" rx=".5" stroke="currentColor" strokeWidth=".9" /><rect x="6" y="1" width="3" height="3" rx=".5" stroke="currentColor" strokeWidth=".9" /><rect x="1" y="6" width="3" height="3" rx=".5" stroke="currentColor" strokeWidth=".9" /></svg>
                Subtasks ({task.subtasks.length})
              </div>
              {task.subtasks.map(sub => {
                const sst = STATUS[sub.status] || STATUS.open;
                return (
                  <div key={sub.taskId} onClick={() => handleSelectNode(sub)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "var(--bg)", cursor: "pointer", marginBottom: 3, transition: "all 0.1s", border: "1px solid transparent" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--p-lt)"; e.currentTarget.style.borderColor = "var(--p)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.borderColor = "transparent"; }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: sst.dot, flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.title}</span>
                    <svg width="8" height="8" viewBox="0 0 9 9" fill="none" style={{ color: "var(--text-4)", flexShrink: 0 }}><path d="M2.5 1.5l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </div>
                );
              })}
            </div>
          )}

          {/* Deadline history */}
          {isCEO && task.deadlineHistory?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-4)", marginBottom: 6 }}>Deadline History</div>
              {task.deadlineHistory.map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "6px 8px", background: "var(--bg)", borderRadius: 6, marginBottom: 3, fontSize: 10 }}>
                  <span style={{ color: "var(--text-4)", fontFamily: "var(--mono)", flexShrink: 0 }}>{new Date(h.editedAt).toLocaleDateString("en-IN")}</span>
                  <span style={{ color: "var(--text-2)", flex: 1 }}>
                    {h.editedByName}: <span style={{ color: "var(--danger)", fontWeight: 700 }}>{h.oldDueDate || "None"}</span> → <span style={{ color: "var(--success)", fontWeight: 700 }}>{h.newDueDate}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeDetailTab === "reports" && (
        <div className="gv-reports-scroll" style={{ flex: 1 }}>
          {reportsLoading
            ? <div style={{ display: "flex", justifyContent: "center", padding: 28 }}><GwSpinner /></div>
            : dailyReports.length === 0
              ? <div className="gv-empty"><div className="gv-empty-icon">📊</div><p className="gv-empty-t">No reports</p><p className="gv-empty-s">Daily reports will appear here.</p></div>
              : dailyReports.map((r, i) => <ReportCard key={r.id || i} report={r} />)
          }
        </div>
      )}
    </>
  );
}


/* ─── SwipeableMessage — swipe right to reply (WhatsApp-style) ─── */
function SwipeableMessage({ children, isMe, onReply, onContextMenu, onLongPressStart, onLongPressEnd, style }) {
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const startXRef = useRef(0);
  const THRESHOLD = 60;

  const handleTouchStart = (e) => {
    startXRef.current = e.touches[0].clientX;
    setSwiping(true);
    setTriggered(false);
    onLongPressStart?.();
  };

  const handleTouchMove = (e) => {
    const dx = e.touches[0].clientX - startXRef.current;
    // Only allow right swipe for replies (both sides swipe right to reply like WhatsApp)
    if (dx > 0 && dx <= THRESHOLD + 20) {
      setSwipeX(dx);
      if (dx >= THRESHOLD && !triggered) {
        setTriggered(true);
        // Haptic feedback if available
        if (navigator?.vibrate) navigator.vibrate(40);
      }
    }
  };

  const handleTouchEnd = (e) => {
    onLongPressEnd?.();
    if (triggered) onReply?.();
    setSwiping(false);
    setTriggered(false);
    setSwipeX(0);
  };

  const progress = Math.min(swipeX / THRESHOLD, 1);

  return (
    <div
      style={{ ...style, position: "relative", overflow: "visible" }}
      onContextMenu={onContextMenu}
    >
      {/* Reply icon that appears on swipe */}
      {swipeX > 8 && (
        <div style={{
          position: "absolute",
          left: isMe ? "auto" : Math.min(swipeX - 8, THRESHOLD - 4),
          right: isMe ? Math.min(swipeX - 8, THRESHOLD - 4) : "auto",
          top: "50%", transform: "translateY(-50%)",
          width: 28, height: 28,
          borderRadius: "50%",
          background: `rgba(79,70,229,${Math.min(progress, 1) * 0.15})`,
          border: `1.5px solid rgba(79,70,229,${Math.min(progress, 1) * 0.5})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: triggered ? "transform 0.15s" : "none",
          transform: `translateY(-50%) scale(${triggered ? 1.2 : 0.8 + progress * 0.4})`,
          pointerEvents: "none",
          zIndex: 5,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke={`rgba(79,70,229,${0.4 + progress * 0.6})`}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 00-4-4H4" />
          </svg>
        </div>
      )}
      {/* Message content shifted on swipe */}
      <div
        className={`gv-msg-group${isMe ? " me" : ""}`}
        style={{
          transform: swipeX > 0 ? `translateX(${isMe ? -swipeX : swipeX}px)` : "none",
          transition: swiping ? "none" : "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function TasksPage() {
  const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
  const router = useRouter();

  // State Variables
  const [allTasks, setAllTasks] = useState([]);
  const [allTaskMap, setAllTaskMap] = useState(new Map());
  const [tasksLoading, setTasksLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [dailyReports, setDailyReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState("info");
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [activeModal, setActiveModal] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [showDeleteConf, setShowDeleteConf] = useState(false);

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
  const [rowMenuOpen, setRowMenuOpen] = useState(null);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 0, y: 0 });
  const [sheetTask, setSheetTask] = useState(null); // mobile bottom sheet task
  const [rightPanel, setRightPanel] = useState("info"); // "info" | "reports" | "requests" | null
  // ── Filter + Export state ──
  const [filterDept, setFilterDept] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterDeadline, setFilterDeadline] = useState(""); // "tomorrow" | "week" | "month"
  const [filterOpen, setFilterOpen] = useState(false);
  const [employeeMapFull, setEmployeeMapFull] = useState(new Map());

  // ── Resizable split panel state ──
  const [sidebarWidth, setSidebarWidth] = useState(38); // percentage
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
  useEffect(() => {
    if (rightPanel === "info" || rightPanel === "reports") {
      setActiveDetailTab(rightPanel);
    }
    // "requests" panel is independent — no detail tab sync needed
  }, [rightPanel]);



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
  // Stores { taskId -> timestamp(ms) } of when user last opened each task chat
  const lastReadAtRef = useRef({});
  const isCEO = role === "ceo";
  const isTL = role === "tl";

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

      // ── Visibility filter: applied for all roles as final safety net ──────────
      // The backend already filters correctly, but we re-apply here as defence-in-depth
      // to prevent any flash of wrong tasks if the backend fallback (/task/list) is used.
      if (role === "ceo") {
        // CEO sees tasks they created OR tasks assigned to them (e.g. by a TL)
        tasks = tasks.filter(t => {
          const assignedToMe = (t.assigneeIds || []).includes(employeeId);
          const createdByMe = t.assignedBy === employeeId || t.createdByCeo === true || t.assignedByRole === "ceo";
          return assignedToMe || createdByMe;
        });
      } else if (role === "employee") {
        // Employee: ONLY tasks directly assigned to them. No parent tasks they weren't assigned to.
        tasks = tasks.filter(t =>
          (t.assigneeIds || []).includes(employeeId)
        );
      }
      // TL: no extra filter — backend already returns correct set

      setAllTasks(tasks);
      const map = new Map(tasks.map(t => [t.taskId, t]));
      allTaskMapRef.current = map;
      setAllTaskMap(map);
      setExpandedIds(new Set()); // subtasks collapsed by default

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

  const loadDetail = useCallback(async (taskId) => {
    latestTaskIdRef.current = taskId; // mark this as the latest requested task
    setDetailLoading(true);
    setDailyReports([]);
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
      setSelectedTask(task);
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
    setActiveDetailTab("info");
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
      // If this task is already expanded → collapse it
      if (prev.has(taskId)) {
        const n = new Set(prev);
        n.delete(taskId);
        return n;
      }
      // Otherwise expand this task and close all others
      return new Set([taskId]);
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
    if (["add_subtask", "forward", "report", "submit_completion", "review_completion", "ceo_review", "deadline"].includes(type)) {
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
      // FIXED: Added approve_tl action
      if (type === "approve_tl") await apiFetch(`/cowork/task/${tid}/approve`, { method: "POST" });

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
      await setDoc(doc(msgsRef, messageId), {
        messageId,
        taskId: tid,
        senderId: employeeId,
        senderName: employeeName,
        text: text || "",
        attachments: attachments || [],
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

  // Auto-select task from dashboard
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

  // Chat listener
  useEffect(() => {
    if (!selectedTask?.taskId) return;
    const taskId = selectedTask.taskId;
    pendingMapRef.current.clear();

    // Record the time this chat was opened — messages before this are "read"
    lastReadAtRef.current[taskId] = Date.now();

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
    return () => { unsub(); pendingMapRef.current.clear(); };
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
    }

    // Helper: apply the same visibility filter used in loadAllTasks
    const applyVisibilityFilter = (taskData) => {
      if (role === "ceo") {
        // CEO sees tasks they created OR tasks assigned to them
        const assignedToMe = (taskData.assigneeIds || []).includes(employeeId);
        const createdByMe = taskData.assignedBy === employeeId || taskData.createdByCeo === true || taskData.assignedByRole === "ceo";
        return assignedToMe || createdByMe;
      }
      // TL and Employee: the Firestore query already scopes correctly
      return true;
    };

    const unsub = onSnapshot(
      taskQuery,
      snap => {
        if (snap.empty) return;
        setAllTasks(prev => {
          const map = new Map(prev.map(t => [t.taskId, t]));
          snap.docs.forEach(d => {
            const updated = { ...d.data(), taskId: d.id };
            // Apply visibility filter before merging — prevents wrong tasks from entering state
            if (applyVisibilityFilter(updated)) {
              map.set(d.id, updated);
            }
          });
          const newList = [...map.values()];
          const taskMapLocal = new Map(newList.map(t => [t.taskId, t]));
          allTaskMapRef.current = taskMapLocal;
          setAllTaskMap(taskMapLocal);
          setupChatCountListeners(newList);
          return newList;
        });
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
  const pri = task?.priority ? (PRI[task.priority] || PRI.medium) : PRI.medium;
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
  // For employees: count all their assigned tasks; for CEO/TL: count root tasks only
  const rootOnlyTasks = role === "employee" ? allTasks : allTasks.filter(t => !t.parentTaskId);
  const stats = {
    total: rootOnlyTasks.filter(t => t.status !== "done").length,
    open: rootOnlyTasks.filter(t => t.status === "open").length,
    active: rootOnlyTasks.filter(t => ["in_progress", "confirmed"].includes(t.status)).length,
    done: rootOnlyTasks.filter(t => t.status === "done").length,
  };

  const employeeGroups = buildEmployeeGroups();

  // Styles
  const STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --font: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
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
    @keyframes chatSlideIn { from{opacity:0;transform:translateX(18px)} to{opacity:1;transform:translateX(0)} }
    .gv-list-panel { display:flex; flex-direction:column; background:var(--surface); z-index:3; overflow:hidden; border-right:1px solid var(--border); transition: width 0.3s cubic-bezier(0.4,0,0.2,1), min-width 0.3s cubic-bezier(0.4,0,0.2,1); }
    .gv-chat { flex:1; min-width:0; display:flex; flex-direction:column; background:var(--surface); overflow:hidden; position:relative; transition: flex 0.3s cubic-bezier(0.4,0,0.2,1); animation:chatSlideIn 0.25s cubic-bezier(0.4,0,0.2,1); }

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
    .gv-tbl-drag { width:16px; display:flex; align-items:center; justify-content:center; color:var(--border2); flex-shrink:0; opacity:0; transition:opacity 0.1s; }
    .gv-tbl-row:hover .gv-tbl-drag { opacity:1; }
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

    .gv-msgs { flex:1; overflow-y:auto; padding:14px 18px; display:flex; flex-direction:column; gap:1px; background:#F5F6FA; background-image:url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d5d7e2' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E"); }
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
    .gv-input-bar { border-top:1px solid var(--border); background:var(--surface); flex-shrink:0; padding:6px 12px; padding-bottom:max(6px, env(safe-area-inset-bottom)); }
    .gv-input-bar textarea, .gv-input-bar input[type="text"] { border-radius:10px !important; background:var(--bg) !important; border:1px solid var(--border) !important; padding:8px 14px !important; font-size:12px !important; }
    .gv-input-bar textarea:focus, .gv-input-bar input[type="text"]:focus { border-color:var(--p) !important; box-shadow:0 0 0 2px var(--p-glow) !important; }

    /* ═══ COL 3 — RIGHT PANEL ═══ */
    .gv-right-area { display:flex; height:100%; }
    .gv-toolbar { width:38px; min-width:38px; background:var(--surface); border-left:1px solid var(--border); display:flex; flex-direction:column; align-items:center; padding:8px 0; gap:3px; }
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
      .gv-tbl-head .col-date, .gv-tbl-row .col-date,
      .gv-tbl-head .col-pri, .gv-tbl-row .col-pri,
      .gv-tbl-head .col-status, .gv-tbl-row .col-status,
      .gv-tbl-check, .gv-tbl-drag { display:none; }
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
    }
  `;


  return (
    <>

      <style>{STYLES}</style>

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
            { key: "confirmed", label: "Confirmed", color: "#5B5EF4", bg: "#EDEDFE", dot: "#5B5EF4" },
            { key: "in_progress", label: "In Progress", color: "#8B5CF6", bg: "#F3E8FF", dot: "#8B5CF6" },
            { key: "done", label: "Done", color: "#16A34A", bg: "#DCFCE7", dot: "#16A34A" },
          ];



          // For employees: show ALL tasks assigned to them (including forwarded subtasks)
          // For CEO/TL: show only root tasks (they see full hierarchy via subtask expansion)
          const rootTasks = role === "employee"
            ? allTasks
            : allTasks.filter(t => !t.parentTaskId);
          const filteredRoots = rootTasks.filter(t => {
            const q = listSearch.toLowerCase();
            const matchQ = !q || t.title?.toLowerCase().includes(q) || t.taskId?.toLowerCase().includes(q);
            const matchSt = activeStatTab === "all"
              ? t.status !== "done"
              : (activeStatTab === "open" && t.status === "open")
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
            return matchQ && matchSt && matchDept && matchEmp && matchDate;
          });

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
                    const [c1, c2] = getAvatarColors(name);
                    return (
                      <div key={id} style={{ width: 20, height: 20, borderRadius: "50%", background: `linear-gradient(135deg,${c1},${c2})`, color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff", marginLeft: i > 0 ? -6 : 0, flexShrink: 0, position: "relative", zIndex: shown.length - i }}>
                        {name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
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
            const dl = getDeadlineInfo(t.dueDate);
            const st = STATUS[t.status] || STATUS.open;
            const p = PRI[t.priority] || PRI.medium;
            // Only show expand arrow for subtasks visible to current user
            const allSubtaskIds = t.subtaskIds || [];
            const visibleSubtaskIds = isCEO
              ? allSubtaskIds.filter(sid => {
                const s = allTaskMap.get(sid);
                return s && (s.createdByCeo === true || (s.assignedBy === employeeId && !s.createdByTl));
              })
              : allSubtaskIds;
            const hasChildren = visibleSubtaskIds.length > 0;
            const isExp = expandedIds.has(t.taskId);
            const isSel = task?.taskId === t.taskId;
            const unread = unreadCounts?.[t.taskId] || 0;
            return (
              <>
                <div className={`gv-tbl-row${isSel ? " selected" : ""}${isSubtask ? " subtask-row" : ""}`} style={{ paddingLeft: 8 + depth * 18 }} onClick={() => handleSelectNode(t)} onMouseEnter={() => handleHoverPrefetch(t.taskId)}>
                  <div className="gv-tbl-drag"><svg width="9" height="12" viewBox="0 0 9 12" fill="currentColor"><circle cx="3" cy="2" r="1.1" /><circle cx="6" cy="2" r="1.1" /><circle cx="3" cy="6" r="1.1" /><circle cx="6" cy="6" r="1.1" /><circle cx="3" cy="10" r="1.1" /><circle cx="6" cy="10" r="1.1" /></svg></div>
                  <div className="gv-tbl-check" onClick={e => e.stopPropagation()}>
                    <div style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${t.status === "done" ? "#16A34A" : "var(--border2)"}`, background: t.status === "done" ? "#16A34A" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {t.status === "done" && <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2.5 2.5 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                  </div>
                  <div className="gv-tbl-expand" onClick={e => { if (hasChildren) { e.stopPropagation(); e.preventDefault(); toggleExpand(t.taskId); } }}>
                    {hasChildren && <span style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-4)", cursor: "pointer" }}>
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ transform: isExp ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}><path d="M2.5 1.5l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>}
                  </div>
                  <div className="col-name" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%", minWidth: 0 }}>
                      <span className={`gv-task-name${t.status === "done" ? " done-line" : ""}`}>{t.title}</span>
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
                    {(t.startDate || t.dueDate) ? (
                      <span style={{ fontSize: 10, color: dl.status === "overdue" ? "var(--danger)" : dl.status === "near" ? "var(--warn)" : "var(--text-3)", fontWeight: dl.status !== "safe" ? 600 : 400, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 2 }}>
                        {t.startDate && <>{new Date(t.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}<span style={{ color: "var(--text-4)", margin: "0 1px" }}>→</span></>}
                        {t.dueDate && new Date(t.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    ) : <span style={{ fontSize: 11, color: "var(--border2)" }}>—</span>}
                  </div>
                  <div className="col-status"><span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, color: st.color, background: st.bg, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: st.dot, display: "inline-block" }} />{st.label}</span></div>
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
                      { l: "Open Chat", a: () => { handleSelectNode(t); setRowMenuOpen(null); } },
                      ...((isCEO || isTL) ? [{ l: "Add Subtask", a: () => { setActiveModal({ type: "add_subtask", taskId: t.taskId, task: t }); setRowMenuOpen(null); } }] : []),
                      ...(!isCEO ? [{ l: "Forward Task", a: () => { setActiveModal({ type: "forward", taskId: t.taskId, task: t }); setRowMenuOpen(null); } }] : []),
                      ...(!isCEO ? [{ l: "Daily Report", a: () => { setActiveModal({ type: "report", taskId: t.taskId, task: t }); setRowMenuOpen(null); } }] : []),
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
                {isExp && visibleSubtaskIds.map(sid => {
                  const sub = allTaskMap.get(sid); if (!sub) return null;
                  return <TblRow key={sid} t={sub} depth={depth + 1} isSubtask />;
                })}
              </>
            );
          };

          const CompactItem = ({ t, isSubEl = false }) => {
            const dl = getDeadlineInfo(t.dueDate);
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
                {!isSubEl && isExp && (t.subtaskIds || []).map(sid => {
                  const sub = allTaskMap.get(sid); if (!sub) return null;
                  return <CompactItem key={sid} t={sub} isSubEl />;
                })}
              </>
            );
          };

          const isCompact = !!task;

          return (
            <div className={`gv-list-panel ${isCompact ? "is-compact" : ""} ${mobileView === "chat" ? "mob-hidden" : ""}`} style={isCompact ? { width: '30%', minWidth: 220, maxWidth: '40%', flexShrink: 0, transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)' } : { width: '100%', minWidth: '100%', transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)' }}>
              <div className="gv-lp-topbar">
                {isCompact ? (
                  <>
                    <button className="gv-back-btn" onClick={() => { setSelectedTask(null); setChatMessages([]); }}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M7 2L3 5.5l4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      All Tasks
                    </button>
                    <span className="gv-lp-title" style={{ fontSize: 14 }}>Tasks</span>
                    <div className="gv-search-box" style={{ maxWidth: 180 }}>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke="var(--text-4)" strokeWidth="1.1" /><line x1="8.5" y1="8.5" x2="11" y2="11" stroke="var(--text-4)" strokeWidth="1.1" strokeLinecap="round" /></svg>
                      <input value={listSearch} onChange={e => setListSearch(e.target.value)} placeholder="Search..." />
                    </div>
                  </>
                ) : (
                  <>
                    <span className="gv-lp-title">Tasks</span>
                    <div className="gv-search-box">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke="var(--text-4)" strokeWidth="1.1" /><line x1="8.5" y1="8.5" x2="11" y2="11" stroke="var(--text-4)" strokeWidth="1.1" strokeLinecap="round" /></svg>
                      <input value={listSearch} onChange={e => setListSearch(e.target.value)} placeholder="Search tasks..." />
                    </div>
                    {(isCEO || isTL) && <button className="gv-new-btn" onClick={() => setActiveModal({ type: "add_subtask", taskId: null, task: null })}><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M4.5 1v7M1 4.5h7" stroke="white" strokeWidth="1.6" strokeLinecap="round" /></svg> Add Task</button>}
                  </>
                )}
              </div>
              {/* Task.Co-style project info */}
              {!isCompact && (
                <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
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
              {(() => {
                const hasFilter = !!(filterDept || filterEmployee || filterDeadline || filterDateFrom || filterDateTo);
                const clearAll = () => { setFilterDept(""); setFilterEmployee(""); setFilterDeadline(""); setFilterDateFrom(""); setFilterDateTo(""); };
                // ── CSV Export ──
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
                return (
                  <div style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
                    {/* Single filter bar: Dept pills | Person | Deadline | Export */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", flexWrap: "wrap" }}>

                      {/* ── Dept pills ── */}
                      {(() => {
                        const deptSet = new Set();
                        allTasks.filter(t => !t.parentTaskId).forEach(t => {
                          if (t.department) deptSet.add(t.department);
                          (t.assigneeIds || []).forEach(aid => {
                            const emp = employeeMapFull.get(aid);
                            if (emp?.department) deptSet.add(emp.department);
                          });
                        });
                        const depts = ["All", ...Array.from(deptSet).sort()];
                        return (
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", flex: 1, minWidth: 0 }}>
                            {depts.map(dept => {
                              const isAll = dept === "All";
                              const active = isAll ? !filterDept : filterDept === dept;
                              return (
                                <button key={dept}
                                  onClick={() => setFilterDept(isAll ? "" : (filterDept === dept ? "" : dept))}
                                  style={{
                                    display: "inline-flex", alignItems: "center",
                                    padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                                    cursor: "pointer", fontFamily: "var(--font)", whiteSpace: "nowrap",
                                    background: active ? "var(--p)" : "#fff",
                                    color: active ? "#fff" : "var(--text-2)",
                                    border: active ? "1.5px solid var(--p)" : "1.5px solid var(--border)",
                                    transition: "all 0.12s",
                                  }}
                                >{dept}</button>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* divider */}
                      <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

                      {/* ── Person dropdown ── */}
                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>Person</span>
                        <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}
                          style={{ padding: "4px 8px", border: "1.5px solid var(--border)", borderRadius: 7, fontSize: 11, fontWeight: 500, color: filterEmployee ? "var(--p)" : "var(--text-2)", fontFamily: "var(--font)", outline: "none", background: "#fff", cursor: "pointer", maxWidth: 130 }}
                        >
                          <option value="">All people</option>
                          {(() => {
                            const seen = new Set(); const opts = [];
                            allTasks.forEach(t => (t.assigneeIds || []).forEach(aid => {
                              if (!seen.has(aid)) { seen.add(aid); opts.push({ id: aid, name: employeeMap?.get(aid) || t.assigneeNameMap?.[aid] || aid }); }
                            }));
                            return opts.sort((a, b) => a.name.localeCompare(b.name)).map(o => <option key={o.id} value={o.name}>{o.name}</option>);
                          })()}
                        </select>
                      </div>

                      {/* divider */}
                      <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

                      {/* ── Deadline pills ── */}
                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>Deadline</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          {[{ key: "tomorrow", label: "Tomorrow" }, { key: "week", label: "Week" }, { key: "month", label: "Month" }].map(({ key, label }) => {
                            const active = filterDeadline === key;
                            return (
                              <button key={key} onClick={() => setFilterDeadline(active ? "" : key)}
                                style={{
                                  padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)", whiteSpace: "nowrap", transition: "all 0.12s",
                                  background: active ? "var(--p)" : "#fff", color: active ? "#fff" : "var(--text-2)",
                                  border: active ? "1.5px solid var(--p)" : "1.5px solid var(--border)",
                                }}
                              >{label}</button>
                            );
                          })}
                        </div>
                      </div>

                      {/* divider */}
                      <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

                      {hasFilter && <button onClick={clearAll} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 11, fontWeight: 600, cursor: "pointer", textDecoration: "underline", padding: 0, whiteSpace: "nowrap", flexShrink: 0 }}>Clear</button>}

                      {/* ── Export CSV ── */}
                      <button onClick={doExport}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", border: "1px solid var(--border)", borderRadius: 7, background: "var(--surface)", color: "var(--text-2)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)", flexShrink: 0, whiteSpace: "nowrap" }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        Export CSV
                      </button>
                    </div>
                    {/* Row 2: Expanded filter panel — department pills + other inputs */}
                    {filterOpen && (() => {
                      // ── Derive available departments from tasks that have at least one assignee
                      // Only include departments from tasks assigned by CEO or TL
                      const deptSet = new Set();
                      allTasks.filter(t => !t.parentTaskId).forEach(t => {
                        const isFromCeoOrTl = t.assignedByRole === "ceo" || t.assignedByRole === "tl" || t.createdByCeo === true || t.createdByTl === true || t.assignedBy === employeeId;
                        if (!isFromCeoOrTl && role !== "tl") return;
                        // Check task-level department field
                        if (t.department) deptSet.add(t.department);
                        // Check each assignee\'s department from employeeMapFull
                        (t.assigneeIds || []).forEach(aid => {
                          const emp = employeeMapFull.get(aid);
                          if (emp?.department) deptSet.add(emp.department);
                        });
                      });
                      const availableDepts = ["All", ...Array.from(deptSet).sort()];

                      // Department icon map — SVG paths keyed by lowercase dept name fragments
                      const getDeptIcon = (name) => {
                        const n = name.toLowerCase();
                        if (n.includes("hr") || n.includes("human")) return (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                        );
                        if (n.includes("account") || n.includes("finance") || n.includes("accounts")) return (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                        );
                        if (n.includes("design") || n.includes("creative")) return (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>
                        );
                        if (n.includes("it") || n.includes("tech") || n.includes("engineer") || n.includes("dev")) return (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
                        );
                        if (n.includes("sales") || n.includes("marketing")) return (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
                        );
                        if (n.includes("production") || n.includes("manufactur") || n.includes("operation")) return (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                        );
                        if (n.includes("manage") || n.includes("admin")) return (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                        );
                        // Default generic dept icon
                        return (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                        );
                      };

                      const deptScrollRef = { current: null };
                      return (
                        <div style={{ padding: "8px 10px 10px", borderTop: "1px solid var(--border)" }}>
                          {/* ── Department pill row ──────────────────── */}
                          <div style={{ marginBottom: 10 }}>
                            <label style={{ display: "block", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-4)", marginBottom: 6 }}>Department</label>
                            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
                              {availableDepts.map(dept => {
                                const isAll = dept === "All";
                                const active = isAll ? !filterDept : filterDept === dept;
                                return (
                                  <button
                                    key={dept}
                                    onClick={() => setFilterDept(isAll ? "" : (filterDept === dept ? "" : dept))}
                                    style={{
                                      display: "inline-flex", alignItems: "center", gap: 5,
                                      padding: "5px 12px", borderRadius: 99, flexShrink: 0,
                                      border: active ? "1.5px solid var(--p)" : "1.5px solid var(--border)",
                                      background: active ? "var(--p)" : "var(--surface)",
                                      color: active ? "#fff" : "var(--text-2)",
                                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                                      fontFamily: "var(--font)", transition: "all 0.14s",
                                      boxShadow: active ? "0 1px 6px var(--p-glow)" : "none",
                                    }}
                                  >
                                    {!isAll && <span style={{ opacity: active ? 1 : 0.6 }}>{getDeptIcon(dept)}</span>}
                                    {dept}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          {/* Person Name and Deadline pills are in the always-visible filter bar above */}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
              <div className="gv-stats">
                {[{ key: "all", l: "ALL", v: stats.total, c: "#5B5EF4" }, { key: "open", l: "OPEN", v: stats.open, c: "#EF4444" }, { key: "in_progress", l: "ACTIVE", v: stats.active, c: "#8B5CF6" }, { key: "done", l: "DONE", v: stats.done, c: "#16A34A" }].map(s => (
                  <div key={s.key} className={`gv-stat${activeStatTab === s.key ? " active-tab" : ""}`} onClick={() => setActiveStatTab(s.key)}>
                    <span className="gv-stat-n" style={{ color: s.c }}>{s.v}</span>
                    <span className="gv-stat-l">{s.l}</span>
                  </div>
                ))}
              </div>
              <div className="gv-list-body">
                {tasksLoading ? (
                  <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {[1, 2, 3, 4].map(i => (<div key={i} className="gv-skel-row"><div className="gv-skeleton gv-skel-circle" /><div className="gv-skel-lines"><div className="gv-skeleton gv-skel-line" style={{ width: `${60 + i * 8}%` }} /><div className="gv-skeleton gv-skel-line" style={{ width: `${40 + i * 5}%` }} /></div></div>))}
                  </div>
                ) : filteredRoots.length === 0 ? (
                  <div className="gv-empty"><div className="gv-empty-icon">📋</div><p className="gv-empty-t">{listSearch || filterDept || filterEmployee || filterDeadline || filterDateFrom || filterDateTo ? "No matches" : "No tasks yet"}</p><p className="gv-empty-s">{(isCEO || isTL) && !listSearch && !filterDept && !filterEmployee && !filterDeadline ? "Click + Add Task to start" : "Try adjusting search or filters"}</p></div>
                ) : (
                  (() => {
                    // ── Split filteredRoots into two sections ──────────────
                    // Section A: tasks assigned TO me by someone else
                    const assignedToMe = filteredRoots.filter(t =>
                      (t.assigneeIds || []).includes(employeeId) && t.assignedBy !== employeeId
                    );
                    // Section B: tasks I created myself
                    const createdByMe = filteredRoots.filter(t =>
                      t.assignedBy === employeeId
                    );

                    // Render table rows + column header for a list of tasks inside a section
                    const renderTaskGroup = (tasks, sectionKey) =>
                      STATUS_GROUPS_TABLE.map(grp => {
                        const grpTasks = tasks.filter(t => t.status === grp.key);
                        if (!grpTasks.length) return null;
                        const collapsed = collapsedGroups.has(`${sectionKey}_${grp.key}`);
                        return (
                          <div key={grp.key} className="gv-tbl-group">
                            <div className="gv-grp-header" onClick={() => setCollapsedGroups(prev => { const n = new Set(prev); const k = `${sectionKey}_${grp.key}`; n.has(k) ? n.delete(k) : n.add(k); return n; })}>
                              <span className="gv-grp-badge" style={{ color: grp.color, background: grp.bg, border: `1px solid ${grp.color}33` }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: grp.dot, display: "inline-block" }} />{grp.label}</span>
                              <span className="gv-grp-count">{grpTasks.length}</span>
                              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ marginLeft: "auto", transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform 0.15s", color: "var(--text-4)" }}><path d="M2 3.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </div>
                            {!collapsed && (
                              <>
                                <div className="gv-tbl-head">
                                  <div style={{ width: 20 }} /><div style={{ width: 26 }} /><div style={{ width: 20 }} />
                                  <div className="col-name">Task Name</div>
                                  <div className="col-desc">Description</div>
                                  <div className="col-people">People</div>
                                  <div className="col-pri">Priority</div>
                                  <div className="col-date">Timeline</div>
                                  <div className="col-status">Status</div>
                                  <div className="col-act" />
                                </div>
                                {grpTasks.map(t => <TblRow key={t.taskId} t={t} />)}
                              </>
                            )}
                          </div>
                        );
                      });

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
                          {!sectionCollapsed && renderTaskGroup(tasks, sectionKey)}
                        </div>
                      );
                    };

                    return (
                      <>
                        {/* Section A: Assigned to me by others */}
                        {assignedToMe.length > 0 && (
                          <SectionBox
                            sectionKey="assigned"
                            title="Assigned to me"
                            icon="📥"
                            accentColor="#5B5EF4"
                            accentBg="#F5F3FF"
                            tasks={assignedToMe}
                            count={assignedToMe.length}
                          />
                        )}
                        {/* Section B: Created by me */}
                        {createdByMe.length > 0 && (
                          <SectionBox
                            sectionKey="created"
                            title="Created by me"
                            icon="✏️"
                            accentColor="#0891B2"
                            accentBg="#F0F9FF"
                            tasks={createdByMe}
                            count={createdByMe.length}
                          />
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

        {/* COL-2: CHAT */}
        <div className={`gv-chat ${mobileView === "chat" ? "mob-visible" : "mob-hidden"} ${mobDetailPanel ? "mob-hidden" : ""}`} style={{ position: "relative" }}>

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
                {task.status && <span className="gv-chat-badge" style={{ color: (STATUS[task.status] || STATUS.open).color, background: (STATUS[task.status] || STATUS.open).bg }}>{(STATUS[task.status] || STATUS.open).label}</span>}
                <div className="gv-chat-actions">
                  <div className="gv-mob-only-actions">
                    {(isCEO || isTL) && <button className="gv-chat-act-btn" onClick={() => handleAction("add_subtask")} title="Add Subtask"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>}
                    {isCEO && <button className="gv-chat-act-btn" onClick={() => handleAction("deadline")} title="Deadline"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></button>}
                    {isCEO && <button className="gv-chat-act-btn" style={{ color: "var(--danger)" }} onClick={() => handleAction("delete")} title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg></button>}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="gv-chat-head">
              <span style={{ fontSize: 13, color: "var(--text-4)", fontStyle: "italic" }}>Select a task to start chatting</span>
            </div>
          )}

          {/* Mobile tabs now handled by header action buttons above */}

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
                          {msg.text && <div>{msg.text}</div>}
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
            <div style={{ position: "relative" }}>
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
                  onSend={handleSendChat}
                  placeholder={`Message in ${task.title}…`}
                  disabled={false}
                />
              </div>
            </div>
          )}
        </div>

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
                  <button className={`gv-dtab ${mobDetailPanel === "info" ? "active" : ""}`} onClick={() => setMobDetailPanel("info")}>ℹ️ Info</button>
                  <button className={`gv-dtab ${mobDetailPanel === "reports" ? "active" : ""}`} onClick={() => setMobDetailPanel("reports")}>
                    📊 Reports {(task.dailyReportCount || 0) > 0 && <span className="gv-dtab-ct">{task.dailyReportCount}</span>}
                  </button>
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
              />
            </div>
          </div>
        )}

        {/* COL-3: RIGHT AREA (TOOLBAR + DETAIL PANEL) */}
        <div className="gv-right-area" style={{ flexDirection: "row-reverse" }}>
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
                <span className="gv-detail-head-title">{rightPanel === "reports" ? "Reports" : rightPanel === "requests" ? "Requests" : "Task Details"}</span>
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
                    <button className={`gv-dtab ${rightPanel === "reports" ? "active" : ""}`} onClick={() => { setActiveDetailTab("reports"); setRightPanel("reports"); }}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="7" width="2" height="3.5" rx=".5" stroke="currentColor" strokeWidth=".9" /><rect x="4.5" y="4" width="2" height="6.5" rx=".5" stroke="currentColor" strokeWidth=".9" /><rect x="8" y="1" width="2" height="9.5" rx=".5" stroke="currentColor" strokeWidth=".9" /></svg>
                      Reports
                      {(task.dailyReportCount || 0) > 0 && <span className="gv-dtab-ct">{task.dailyReportCount}</span>}
                    </button>
                    <button className={`gv-dtab ${rightPanel === "requests" ? "active" : ""}`} onClick={() => setRightPanel("requests")}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                      Requests
                    </button>
                  </div>

                  {rightPanel === "requests" ? (
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
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* Mobile bottom sheet row menu */}
      {sheetTask && (
        <>
          <div className="gv-row-menu-sheet-overlay" onClick={() => setSheetTask(null)} />
          <div className="gv-row-menu-sheet">
            <div className="gv-row-menu-sheet-handle" />
            <div className="gv-row-menu-sheet-title">{sheetTask.title}</div>
            {[
              { l: "Open Chat", icon: <MessageCircle />, a: () => { handleSelectNode(sheetTask); setSheetTask(null); } },
              ...((isCEO || isTL) ? [{ l: "Add Subtask", icon: <Plus />, a: () => { setActiveModal({ type: "add_subtask", taskId: sheetTask.taskId, task: sheetTask }); setSheetTask(null); } }] : []),
              ...(!isCEO ? [{ l: "Forward Task", icon: <Forward />, a: () => { setActiveModal({ type: "forward", taskId: sheetTask.taskId, task: sheetTask }); setSheetTask(null); } }] : []),
              ...(!isCEO ? [{ l: "Daily Report", icon: <BarChart3 />, a: () => { setActiveModal({ type: "report", taskId: sheetTask.taskId, task: sheetTask }); setSheetTask(null); } }] : []),
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
      )}

      {/* Context Menu */}
      {contextMenu && (
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
          {isCEO && (
            <>
              <div className="gv-ctx-sep" />
              <button className="gv-ctx-item danger" onClick={() => {
                handleDeleteMessage(contextMenu.message);
                setContextMenu(null);
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                Delete message
              </button>
            </>
          )}
        </div>
      )}

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
      {activeModal?.type === "forward" && <ForwardTaskModal task={getModalTask()} currentEmployeeId={employeeId} onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); if (selectedTask) loadDetail(selectedTask.taskId); }} />}
      {activeModal?.type === "report" && <DailyReportModal task={getModalTask()} currentEmployeeId={employeeId} onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadDetail(selectedTask.taskId); setActiveDetailTab("reports"); }} />}
      {activeModal?.type === "deadline" && task && <EditDeadlineModal task={task} onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadDetail(task.taskId); loadAllTasks(); }} />}
      {activeModal?.type === "submit_completion" && <SubmitCompletionModal task={getModalTask()} currentEmployeeId={employeeId} onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadDetail(selectedTask.taskId); }} />}
      {activeModal?.type === "review_completion" && <ReviewCompletionModal task={getModalTask()} currentEmployeeId={employeeId} role={role} reviewType="review_completion" onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadDetail(selectedTask.taskId); }} />}
      {activeModal?.type === "ceo_review" && <ReviewCompletionModal task={getModalTask()} currentEmployeeId={employeeId} role={role} reviewType="ceo_review" onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadDetail(selectedTask.taskId); }} />}

      {/* Delete message confirmation modal */}
      {deleteMsgConf && (
        <GwConfirm
          open={true}
          title="Delete Message?"
          message={`Delete this message from ${deleteMsgConf.message.senderName}? This action cannot be undone.`}
          onConfirm={confirmDeleteMessage}
          onCancel={() => setDeleteMsgConf(null)}
        />
      )}

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