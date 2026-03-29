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
import RequestModal from "../../../components/coworking/tasks/RequestModal";
import DeadlineBadge, { getDeadlineInfo } from "../../../components/coworking/tasks/DeadlineBadge";
import MediaMessageInput from "../../../components/coworking/messaging/MediaMessageInput";
import MessageBubble from "../../../components/coworking/messaging/MessageBubble";
import { GwAvatar, GwSpinner, GwEmpty, GwSectionLabel, GwConfirm, btnStyle } from "../../../components/coworking/shared/CoworkShared";
import { listTasks, getFullTask, getDailyReports, deleteTask } from "../../../lib/mediaUploadApi";
import { firebaseDb, firebaseAuth } from "../../../lib/coworkFirebase";

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
  open: { label: "Open", color: "#667085", bg: "#F2F4F7", dot: "#98A2B3", glow: "rgba(152,162,179,0.3)" },
  confirmed: { label: "Confirmed", color: "#1A73E8", bg: "#EBF3FE", dot: "#1A73E8", glow: "rgba(26,115,232,0.3)" },
  in_progress: { label: "In Progress", color: "#E37400", bg: "#FFF4E5", dot: "#F9AB00", glow: "rgba(249,171,0,0.3)" },
  done: { label: "Done", color: "#1E8E3E", bg: "#E6F4EA", dot: "#34A853", glow: "rgba(52,168,83,0.3)" },
  pending_tl_approval: { label: "Pending TL Approval", color: "#7C3AED", bg: "#F3E8FF", dot: "#7C3AED", glow: "rgba(124,58,237,0.3)" },
};

const COMP = {
  submitted: { label: "Awaiting TL Review", color: "#E37400", bg: "#FFF4E5", icon: "⏳" },
  tl_approved: { label: "TL Approved · CEO Review", color: "#1A73E8", bg: "#EBF3FE", icon: "✓" },
  tl_rejected: { label: "TL Rejected", color: "#D93025", bg: "#FCE8E6", icon: "✕" },
  ceo_approved: { label: "Approved — Complete!", color: "#1E8E3E", bg: "#E6F4EA", icon: "🏆" },
  ceo_rejected: { label: "CEO Rejected", color: "#D93025", bg: "#FCE8E6", icon: "✕" }
};

const PRI = {
  high: { label: "High", color: "#D93025", bg: "#FCE8E6", dot: "#EA4335" },
  medium: { label: "Medium", color: "#E37400", bg: "#FFF4E5", dot: "#F9AB00" },
  low: { label: "Low", color: "#1E8E3E", bg: "#E6F4EA", dot: "#34A853" }
};

// Avatar Color Helper
const AVATAR_COLORS = [
  ["#1A73E8", "#4285F4"], ["#1E8E3E", "#34A853"], ["#E37400", "#F9AB00"],
  ["#D93025", "#EA4335"], ["#0E7490", "#00ACC1"], ["#7C3AED", "#9575CD"],
  ["#00897B", "#26A69A"], ["#AD1457", "#EC407A"],
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
              background: "#34A853",
              padding: "1px 5px", borderRadius: 99,
              minWidth: 18, textAlign: "center",
            }}>
              {unreadMsgCount > 99 ? "99+" : unreadMsgCount}
            </span>
          )}
          {chatTimeStr && isUnread && (
            <span style={{
              fontSize: 8, color: "#34A853",
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
              background: "#34A853", flexShrink: 0,
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
              background: "#34A853", flexShrink: 0,
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
            background: "#34A853",
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
            color: hasUnread ? "#34A853" : "var(--text-4)",
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
  const pctColor = pct >= 100 ? "#1E8E3E" : pct >= 50 ? "var(--p,#1A73E8)" : "#E37400";
  const pctBg = pct >= 100 ? "#E6F4EA" : pct >= 50 ? "var(--p-lt,#EBF3FE)" : "#FFF4E5";
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



/* ─── Detail Panel Body (shared desktop + mobile) ─── */
function DetailBody({ task, dailyReports, reportsLoading, activeDetailTab, setActiveDetailTab,
  isAssignee, isConfirmed, isStarted, isCEO, isTL, actionBusy, handleAction, handleSelectNode,
  employeeId, pct, pctColor, pctGradient, unreadCounts }) {
  const st = STATUS[task.status] || STATUS.open;
  const comp = task.completionStatus ? COMP[task.completionStatus] : null;
  const pri = task.priority ? (PRI[task.priority] || PRI.medium) : PRI.medium;

  return (
    <>
      {activeDetailTab === "info" && (
        <div className="gv-detail-scroll">
          {/* Breadcrumb */}
          {task.path?.length > 0 && (
            <div className="gv-bc">
              {task.path.map(p => (
                <span key={p.taskId} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <button className="gv-bc-btn" onClick={() => handleSelectNode(p)}>{p.title}</button>
                  <span className="gv-bc-sep">›</span>
                </span>
              ))}
              <span className="gv-bc-cur">{task.title}</span>
            </div>
          )}

          {/* Meta */}
          <div className="gv-meta-row">
            {task.dueDate && <DeadlineBadge dueDate={task.dueDate} />}
            <span className="gv-meta-pill" style={{ position: "relative", cursor: "pointer" }}
              onMouseEnter={(e) => {
                const tip = e.currentTarget.querySelector('.gv-assignee-tip');
                if (tip) tip.style.display = 'block';
              }}
              onMouseLeave={(e) => {
                const tip = e.currentTarget.querySelector('.gv-assignee-tip');
                if (tip) tip.style.display = 'none';
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1" /><path d="M1 9c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
              {task.assigneeIds?.length || 0}
              <div className="gv-assignee-tip" style={{
                display: "none", position: "absolute", top: "100%", left: 0, marginTop: 4,
                background: "#1A1D21", color: "#fff", borderRadius: 8, padding: "8px 12px",
                fontSize: 11, whiteSpace: "nowrap", zIndex: 50, boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                minWidth: 120,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: "#98A2B3", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>Assigned to</div>
                {(task.assigneeNames || task.assigneeIds || []).map((name, i) => (
                  <div key={i} style={{ padding: "2px 0", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34A853" }} />
                    {typeof name === "string" ? name : name}
                  </div>
                ))}
                {(!task.assigneeNames?.length && !task.assigneeIds?.length) && <div>No one assigned</div>}
              </div>
            </span>
            {(task.subtaskIds?.length || 0) > 0 && (
              <span className="gv-meta-pill">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="3" height="3" rx=".7" stroke="currentColor" strokeWidth=".9" /><rect x="6" y="1" width="3" height="3" rx=".7" stroke="currentColor" strokeWidth=".9" /><rect x="1" y="6" width="3" height="3" rx=".7" stroke="currentColor" strokeWidth=".9" /></svg>
                {task.subtaskIds.length} subs
              </span>
            )}
            {task.chatMessageCount > 0 && (
              <span className="gv-meta-pill">
                💬 {task.chatMessageCount}
                {(unreadCounts?.[task.taskId] || 0) > 0 && (
                  <span style={{
                    marginLeft: 4, fontSize: 9, fontWeight: 800,
                    color: "#fff", background: "#34A853",
                    padding: "1px 5px", borderRadius: 99,
                    minWidth: 16, textAlign: "center", display: "inline-block",
                  }}>
                    {unreadCounts[task.taskId] > 99 ? "99+" : unreadCounts[task.taskId]} new
                  </span>
                )}
              </span>
            )}
          </div>

          {task.description && <p className="gv-desc">{task.description}</p>}
          {task.notes && (
            <div className="gv-notes">
              <span style={{ flexShrink: 0, fontSize: 14 }}>📝</span>
              <span className="gv-notes-text">{task.notes}</span>
            </div>
          )}

          {/* Progress */}
          <div className="gv-prog">
            <div className="gv-prog-head">
              <span className="gv-prog-lbl">Progress</span>
              <span className="gv-prog-pct" style={{ color: pctColor }}>{pct}%</span>
            </div>
            <div className="gv-prog-track">
              <div className="gv-prog-fill" style={{ width: `${pct}%`, background: pctGradient }} />
            </div>
          </div>

          {/* Completion banner */}
          {comp && (
            <div className="gv-comp-banner" style={{ color: comp.color, background: comp.bg, borderColor: `${comp.color}33` }}>
              <span className="gv-comp-icon">{comp.icon}</span>
              <div>
                <div className="gv-comp-text" style={{ color: comp.color }}>{comp.label}</div>
                {task.completionStatus === "tl_rejected" && task.tlReview?.rejectionReason && <div className="gv-comp-sub">{task.tlReview.rejectionReason}</div>}
                {task.completionStatus === "ceo_rejected" && task.ceoReview?.rejectionReason && <div className="gv-comp-sub">{task.ceoReview.rejectionReason}</div>}
              </div>
            </div>
          )}

          {/* Workflow */}
          {(isAssignee || isTL || isCEO) && (
            <div>
              <div className="gv-sec-lbl">Workflow</div>
              {isAssignee && !isConfirmed && task.status === "open" && (
                <button className="gv-wf-btn gv-wf-confirm" disabled={actionBusy} onClick={() => handleAction("confirm")}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Confirm Task
                </button>
              )}
              {isAssignee && isConfirmed && !isStarted && (
                <button className="gv-wf-btn gv-wf-start" disabled={actionBusy} onClick={() => handleAction("start")}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 2l7 4-7 4V2z" fill="currentColor" /></svg>
                  Start Working
                </button>
              )}
              {isAssignee && task.status === "in_progress" && (
                <button className="gv-wf-btn gv-wf-report" onClick={() => handleAction("report")}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="2.5" width="9" height="7" rx="1" stroke="currentColor" strokeWidth="1.1" /><path d="M4 5.5h4M4 7.5h2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
                  Daily Report
                </button>
              )}
              {isAssignee && task.status === "in_progress" && !["submitted", "tl_approved", "ceo_approved"].includes(task.completionStatus) && (
                <button className="gv-wf-btn gv-wf-submit" onClick={() => handleAction("submit_completion")}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 4.5l3-3.5 3 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /><path d="M2 11h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                  Submit for Review
                </button>
              )}
              {/* TL Approve Button - FIXED: Properly integrated */}
              {isTL && task.status === "pending_tl_approval" && task.assigneeIds?.includes(employeeId) && (
                <button className="gv-wf-btn"
                  style={{ background: "#f3e8ff", color: "#9333ea", borderColor: "rgba(147,51,234,.3)" }}
                  disabled={actionBusy}
                  onClick={() => handleAction("approve_tl")}>
                  ⭐ Approve Task
                </button>
              )}
              {(isTL || isCEO) && task.completionStatus === "submitted" && (
                <button className="gv-wf-btn gv-wf-review" onClick={() => handleAction("review_completion")}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.1" /><circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1" /></svg>
                  Review Submission
                </button>
              )}
              {isCEO && task.completionStatus === "tl_approved" && (
                <button className="gv-wf-btn gv-wf-ceo" onClick={() => handleAction("ceo_review")}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  CEO Final Approval
                </button>
              )}
            </div>
          )}

          {/* Subtasks */}
          {task.subtasks?.length > 0 && (
            <div>
              <div className="gv-sec-lbl">Subtasks ({task.subtasks.length})</div>
              {task.subtasks.map(sub => {
                const sst = STATUS[sub.status] || STATUS.open;
                return (
                  <div key={sub.taskId} className="gv-sub-item" onClick={() => handleSelectNode(sub)}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: sst.dot, flexShrink: 0 }} />
                    <span className="gv-sub-name">{sub.title}</span>
                    {sub.subtaskIds?.length > 0 && <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-4)", background: "var(--bg2)", padding: "1px 5px", borderRadius: 99 }}>{sub.subtaskIds.length}</span>}
                    <span className="gv-badge" style={{ color: sst.color, background: sst.bg, borderColor: `${sst.color}22`, fontSize: 9 }}>{sst.label}</span>
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ color: "var(--text-4)", flexShrink: 0 }}><path d="M2.5 1.5l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </div>
                );
              })}
            </div>
          )}

          {/* Deadline history */}
          {isCEO && task.deadlineHistory?.length > 0 && (
            <div>
              <div className="gv-sec-lbl">Deadline History</div>
              {task.deadlineHistory.map((h, i) => (
                <div key={i} className="gv-dl-entry">
                  <span style={{ fontSize: 10, color: "var(--text-4)", fontFamily: "var(--mono)", flexShrink: 0 }}>{new Date(h.editedAt).toLocaleDateString("en-IN")}</span>
                  <span style={{ fontSize: 11, color: "var(--text-2)", flex: 1 }}>
                    {h.editedByName}:&nbsp;
                    <span style={{ color: "var(--danger)", fontWeight: 700 }}>{h.oldDueDate || "None"}</span>
                    &nbsp;→&nbsp;
                    <span style={{ color: "var(--success)", fontWeight: 700 }}>{h.newDueDate}</span>
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-3)", fontStyle: "italic", flex: 1 }}>{h.reason}</span>
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
  const [rightPanel, setRightPanel] = useState("info"); // "info" | "reports" | null



  // Phase 2: Context menu on messages
  const [contextMenu, setContextMenu] = useState(null); // { x, y, message }
  const longPressTimer = useRef(null);


  // Sync toolbar with detail tab
  useEffect(() => {
    if (rightPanel === "info" || rightPanel === "reports") {
      setActiveDetailTab(rightPanel);
    }
  }, [rightPanel]);



  // ── Phase 2: Context menu handlers ──
  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message: msg });
  };

  const handleLongPressStart = (msg) => {
    longPressTimer.current = setTimeout(() => {
      setContextMenu({ x: window.innerWidth / 2, y: window.innerHeight / 2, message: msg });
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
    if (role !== "ceo" && role !== "tl") return;
    setEmployeesLoading(true);
    try {
      const snap = await getDocs(collection(firebaseDb, "cowork_employees"));
      const map = new Map();
      snap.forEach(docSnap => {
        const emp = docSnap.data();
        const id = emp.employeeId || docSnap.id;
        if (id) {
          map.set(id, emp.name || "Unknown");
        }
      });
      setEmployeeMap(map);
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

      // ── CEO visibility: hide TL-created subtasks from CEO tree ──────────
      if (role === "ceo") {
        tasks = tasks.filter(t => {
          if (!t.parentTaskId) {
            // Root task: show only if created by CEO
            return t.assignedBy === employeeId || t.createdByCeo === true;
          }
          // Subtask: show only if created by CEO, hide TL-created subtasks
          return t.createdByCeo === true || (t.assignedBy === employeeId && t.createdByTl !== true);
        });
      }

      setAllTasks(tasks);
      const map = new Map(tasks.map(t => [t.taskId, t]));
      allTaskMapRef.current = map;
      setAllTaskMap(map);
      setExpandedIds(new Set(tasks.filter(t => !t.parentTaskId).map(t => t.taskId)));

      // Per-task chat count listeners give 100% accurate real-time unread counts
      setupChatCountListeners(tasks);

    } catch (e) {
      console.error(e);
    } finally {
      setTasksLoading(false);
    }
  }, [employeeId, role]); // setupChatCountListeners intentionally omitted — stable empty-dep callback

  const loadDetail = useCallback(async (taskId) => {
    setDetailLoading(true);
    setChatMessages([]);
    setDailyReports([]);
    try {
      const task = await getFullTask(taskId);
      setSelectedTask(task);
      setChatMessages(task.chatMessages || []);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

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

  const handleSelectNode = async (node) => {
    // First, load the detail
    loadDetail(node.taskId);
    setActiveDetailTab("info");
    setMobDetailPanel(null);
    setDetailCollapsed(false);
    setMobileView("chat");

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
    if (!selectedTask) return;
    setActionBusy(true);
    try {
      await deleteTask(selectedTask.taskId);
      setSelectedTask(null);
      setChatMessages([]);
      setShowDeleteConf(false);
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
    const opt = {
      messageId: tempId,
      taskId: tid,
      senderId: employeeId,
      senderName: employeeName,
      text: text || "",
      attachments: attachments || [],
      messageType: resolvedType,
      temp: true,
      sending: true,
      error: false,
      createdAt: new Date().toISOString()
    };
    // Add to end — will be replaced by real message from onSnapshot
    setChatMessages(prev => [...prev, opt]);
    // Scroll immediately
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 20);

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
    if (!loading && !user) router.push("/coworking-login");
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
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
    return () => clearTimeout(timer);
  }, [chatMessages]);

  // ── Real-time unread badge system ────────────────────────────────────────────
  // For each task, we keep a live Firestore chat listener that counts messages.
  // unreadCounts[taskId] = exact number of messages since user last opened that task.
  // ── Real-time listener: update allTasks timestamps & lastChatAt live ──────────
  // Only updates task metadata (title, status, lastChatAt) — NOT unread counts.
  // Unread counts are handled by setupChatCountListeners above.
  useEffect(() => {
    if (!employeeId) return;
    const tasksRef = collection(firebaseDb, "cowork_tasks");
    const unsub = onSnapshot(
      query(tasksRef, orderBy("updatedAt", "desc"), limit(50)),
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
      err => console.error("realtime tasks listener:", err)
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

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
  const pctColor = task?.status === "done" ? "#1E8E3E" : pct >= 70 ? "var(--p,#1A73E8)" : pct >= 30 ? "#E37400" : "#EA4335";
  const pctGradient = task?.status === "done"
    ? "linear-gradient(90deg,#1E8E3E,#34A853)"
    : pct >= 70
      ? "linear-gradient(90deg,var(--p,#1A73E8),#818CF8)"
      : pct >= 30
        ? "linear-gradient(90deg,#E37400,#FBBC04)"
        : "linear-gradient(90deg,#EF4444,#F87171)";

  const grouped = groupByDate(chatMessages);
  const getModalTask = () => activeModal ? (allTaskMap.get(activeModal.taskId) || activeModal.task || task) : task;
  const stats = {
    total: allTasks.length,
    open: allTasks.filter(t => t.status === "open").length,
    active: allTasks.filter(t => t.status === "in_progress").length,
    done: allTasks.filter(t => t.status === "done").length,
  };

  const employeeGroups = buildEmployeeGroups();

  // Styles
  const STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --font: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      --mono: 'IBM Plex Mono', ui-monospace, monospace;
      --p: #1A73E8; --p-mid: #1557B0; --p-lt: #EBF3FE; --p-glow: rgba(26,115,232,0.12);
      --surface: #FFFFFF; --bg: #F0F2F5; --bg2: #E4E7EC;
      --border: #E4E7EC; --border2: #D0D5DD;
      --text-1: #1A1D21; --text-2: #344054; --text-3: #667085; --text-4: #98A2B3;
      --success: #1E8E3E; --warn: #E37400; --danger: #D93025;
      --radius: 10px; --radius-lg: 12px;
      --ease: cubic-bezier(0.2,0,0,1); --ease2: cubic-bezier(0.4,0,0.2,1);
      --shadow-sm: 0 1px 3px rgba(60,64,67,0.08); --shadow-md: 0 2px 8px rgba(60,64,67,0.12);
      --shadow-xl: 0 8px 28px rgba(60,64,67,0.16);
    }

    /* ═══ ROOT ═══ */
    .gv-root { display:flex; height:100%; overflow:hidden; background:var(--bg); font-family:var(--font); }

    /* ═══ COL 1 — LEFT SIDEBAR ═══ */
    .gv-tree {
      width: 300px; min-width: 300px; display:flex; flex-direction:column;
      background:var(--surface); border-right:1px solid var(--border); z-index:3;
      transition: width 0.25s var(--ease), min-width 0.25s var(--ease), opacity 0.2s;
    }
    .gv-tree.collapsed { width:0; min-width:0; overflow:hidden; opacity:0; border:none; }

    .gv-tree-head { border-bottom:1px solid var(--border); flex-shrink:0; background:var(--surface); }

    .gv-brand-row { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; gap:8px; }
    .gv-logo { display:flex; align-items:center; gap:8px; }
    .gv-logo-mark {
      width:28px; height:28px; border-radius:8px; background:var(--p);
      display:flex; align-items:center; justify-content:center; flex-shrink:0;
    }
    .gv-logo-text { font-size:14px; font-weight:700; color:var(--text-1); letter-spacing:-0.02em; }
    .gv-logo-sub { font-size:10px; color:var(--text-4); margin-top:1px; }
    .gv-new-btn {
      display:flex; align-items:center; gap:4px; padding:6px 12px; border-radius:20px;
      background:var(--p); color:#fff; font-size:12px; font-weight:600; border:none;
      cursor:pointer; font-family:var(--font); transition:all 0.15s;
      box-shadow: 0 1px 3px var(--p-glow);
    }
    .gv-new-btn:hover { background:var(--p-mid); box-shadow:var(--shadow-md); transform:translateY(-1px); }

    /* Sidebar toggle (outside sidebar) */
    .gv-sidebar-toggle {
      position:absolute; left:0; top:50%; transform:translateY(-50%);
      width:20px; height:40px; background:var(--surface); border:1px solid var(--border);
      border-left:none; border-radius:0 8px 8px 0; cursor:pointer; z-index:4;
      display:flex; align-items:center; justify-content:center; color:var(--text-4);
      transition:all 0.15s; box-shadow:2px 0 4px rgba(0,0,0,0.04);
    }
    .gv-sidebar-toggle:hover { color:var(--p); background:var(--p-lt); }
    .gv-sidebar-toggle svg { transition:transform 0.2s; }
    .gv-sidebar-toggle.flip svg { transform:rotate(180deg); }

    /* Stats */
    .gv-stats {
      display:grid; grid-template-columns:repeat(4,1fr); border-bottom:1px solid var(--border); flex-shrink:0;
    }
    .gv-stat {
      display:flex; flex-direction:column; align-items:center; gap:1px; padding:8px 4px;
      cursor:default; transition:background 0.1s; border-right:1px solid var(--border);
    }
    .gv-stat:last-child { border-right:none; }
    .gv-stat:hover { background:#F5F7FA; }
    .gv-stat-n { font-size:15px; font-weight:700; line-height:1; font-family:var(--mono); }
    .gv-stat-l { font-size:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-4); }

    /* Tree list */
    .gv-tree-list { flex:1; overflow-y:auto; padding:4px 0; }
    .gv-tree-list::-webkit-scrollbar { width:3px; }
    .gv-tree-list::-webkit-scrollbar-thumb { background:var(--bg2); border-radius:2px; }

    /* Employee group — conversation style */
    .gv-emp-group { margin:0; }
    .gv-emp-header {
      display:flex; align-items:center; gap:8px; padding:10px 14px;
      cursor:pointer; transition:background 0.1s; user-select:none;
    }
    .gv-emp-header:hover { background:#F5F7FA; }
    .gv-emp-folder-icon { width:16px; height:16px; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:var(--text-3); }
    .gv-emp-name { font-size:13px; font-weight:600; color:var(--text-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .gv-emp-dots { font-size:14px; color:var(--text-4); padding:0 4px; cursor:pointer; border-radius:4px; }
    .gv-emp-dots:hover { background:var(--bg2); }
    .gv-emp-chevron { color:var(--text-4); transition:transform 0.2s var(--ease); flex-shrink:0; }
    .gv-emp-chevron.open { transform:rotate(180deg); }
    .gv-emp-tasks { padding:0 0 2px; }

    /* Tree node — conversation item style */
    .gv-node {
      display:flex; align-items:center; gap:6px; padding:8px 14px 8px 24px;
      cursor:pointer; transition:all 0.1s; border-left:2px solid transparent;
    }
    .gv-node:hover { background:#F5F7FA; }
    .gv-node.active { background:var(--p-lt); border-left-color:var(--p); }
    .gv-chevron {
      width:16px; height:16px; border:none; background:none; cursor:pointer; padding:0;
      display:flex; align-items:center; justify-content:center; border-radius:3px;
      color:var(--text-4); transition:transform 0.2s var(--ease);
    }
    .gv-chevron:hover { background:var(--bg2); }
    .gv-chevron.open { transform:rotate(90deg); }
    .gv-node-file-icon { width:16px; height:16px; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:var(--text-3); }
    .gv-node.active .gv-node-file-icon { color:var(--p); }
    .gv-node-name { font-size:13px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-2); font-weight:400; }
    .gv-node.active .gv-node-name { color:var(--p); font-weight:600; }
    .gv-node-ct { font-size:9px; font-family:var(--mono); color:var(--text-4); padding:1px 5px; border-radius:99px; background:var(--bg); }
    .gv-overdue-dot { width:6px; height:6px; border-radius:50%; background:var(--danger); animation:od-pulse 2s ease-in-out infinite; }
    @keyframes od-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }

    /* ═══ COL 2 — CHAT ═══ */
    .gv-chat {
      flex:1; min-width:0; display:flex; flex-direction:column;
      background:var(--surface); overflow:hidden; position:relative;
    }

    .gv-chat-head {
      display:flex; align-items:center; gap:10px; padding:10px 18px;
      border-bottom:1px solid var(--border); flex-shrink:0; min-height:52px; background:var(--surface);
    }
    .gv-chat-task-chip { display:flex; align-items:center; gap:5px; padding:4px 10px; border-radius:6px; background:var(--p-lt); flex-shrink:0; }
    .gv-chat-tid { font-size:10px; font-family:var(--mono); font-weight:600; color:var(--p); }
    .gv-chat-task-name { font-size:14px; font-weight:600; color:var(--text-1); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .gv-chat-badge { font-size:10px; font-weight:600; padding:3px 8px; border-radius:4px; flex-shrink:0; }

    /* Chat header action buttons */
    .gv-chat-actions {
      display:flex; gap:2px; flex-shrink:0; margin-left:auto; align-items:center;
    }
    .gv-chat-act-btn {
      width:32px; height:32px; border-radius:8px; border:1px solid var(--border);
      background:var(--surface); cursor:pointer; display:flex; align-items:center;
      justify-content:center; color:var(--text-3); transition:all 0.12s; flex-shrink:0;
    }
    .gv-chat-act-btn:hover { background:var(--p-lt); color:var(--p); border-color:var(--p); }

    /* Mobile-only actions: HIDDEN on desktop */
    .gv-mob-only-actions { display:none; gap:2px; align-items:center; }

    @media (max-width:767px) {
      /* Show mobile-only actions on mobile */
      .gv-mob-only-actions { display:flex; }
    }

    /* Messages */
    .gv-msgs {
      flex:1; overflow-y:auto; padding:16px 20px; display:flex; flex-direction:column; gap:1px;
      background:#F0F2F5;
      background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23e0e0e0' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
    }
    .gv-msgs::-webkit-scrollbar { width:4px; }
    .gv-msgs::-webkit-scrollbar-thumb { background:var(--bg2); border-radius:2px; }

    .gv-date-sep { display:flex; align-items:center; gap:12px; margin:14px 0; }
    .gv-date-sep-line { flex:1; height:1px; background:var(--border); }
    .gv-date-sep-label {
      font-size:10px; color:var(--text-4); font-weight:600; text-transform:uppercase;
      letter-spacing:0.06em; white-space:nowrap; padding:3px 10px;
      background:var(--surface); border-radius:99px; border:1px solid var(--border);
    }

    .gv-msg-group { display:flex; gap:8px; padding:4px 0; max-width:75%; }
    .gv-msg-group.me { margin-left:auto; flex-direction:row-reverse; }
    .gv-msg-avatar {
      width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center;
      font-size:10px; font-weight:700; color:#fff; background:#667085; flex-shrink:0; position:relative;
    }
    .gv-msg-col { flex:1; min-width:0; }
    .gv-msg-meta { display:flex; align-items:center; gap:4px; font-size:11px; color:var(--text-4); margin-bottom:3px; font-weight:500; }
    .gv-msg-group.me .gv-msg-meta { justify-content:flex-end; }

    .gv-bubble-wrapper { display:flex; align-items:flex-start; gap:4px; position:relative; }
    .gv-msg-group.me .gv-bubble-wrapper { flex-direction:row-reverse; }

    .gv-bubble {
      padding:8px 12px 6px; border-radius:2px 12px 12px 12px; background:#FFFFFF;
      font-size:13.5px; line-height:1.5; color:var(--text-1); max-width:100%; word-wrap:break-word;
      border:1px solid #E4E7EC; box-shadow:0 1px 2px rgba(0,0,0,0.04);
    }
    .gv-msg-group.me .gv-bubble { 
      background:#1A73E8; color:#fff; border-radius:12px 2px 12px 12px; 
      border:none; box-shadow:0 1px 3px rgba(26,115,232,0.3);
    }
    .gv-bubble.gv-sending { opacity:0.5; }
    .gv-bubble.gv-error { border:1.5px solid var(--danger); }
    .gv-bubble.gv-bubble-new { box-shadow:inset 3px 0 0 var(--success); }
    .gv-bubble-status { font-size:10px; color:var(--text-4); margin-top:3px; }
    .gv-bubble-status.gv-error { color:var(--danger); }

    .gv-image-preview { max-width:220px; max-height:200px; border-radius:8px; cursor:pointer; margin-top:4px; display:block; object-fit:cover; }
    .gv-attachment {
      display:inline-flex; align-items:center; gap:6px; padding:8px 12px;
      background:var(--surface); border:1px solid var(--border); border-radius:8px;
      font-size:12px; color:var(--text-2); text-decoration:none; margin-top:4px;
    }
    .gv-attachment:hover { background:var(--bg); }
    .gv-attachment-download { color:var(--p); }

    /* Context menu on messages (replaces delete X) */
    .gv-delete-msg {
      width:24px; height:24px; border-radius:50%; border:none; background:transparent;
      color:var(--text-4); cursor:pointer; font-size:12px; display:none;
      align-items:center; justify-content:center; flex-shrink:0; transition:all 0.1s;
      position:absolute; top:-8px; right:-8px;
    }
    .gv-bubble-wrapper:hover .gv-delete-msg { display:flex; }
    .gv-delete-msg:hover { background:#FEE2E2; color:var(--danger); }

    .gv-sys-msg { text-align:center; padding:6px 16px; font-size:11px; color:var(--text-4); font-style:italic; }
    .gv-input-bar { 
      border-top:1px solid var(--border); background:#F0F2F5; flex-shrink:0; padding:6px 12px;
    }
    .gv-input-bar textarea, .gv-input-bar input[type="text"] {
      border-radius:20px !important; background:#fff !important; border:1px solid #E4E7EC !important;
      padding:10px 16px !important; font-size:14px !important;
    }
    .gv-input-bar textarea:focus, .gv-input-bar input[type="text"]:focus {
      border-color:#1A73E8 !important; box-shadow:0 0 0 2px rgba(26,115,232,0.1) !important;
    }

    /* ═══ COL 3 — RIGHT PANEL with TOOLBAR ═══ */
    .gv-right-area { display:flex; height:100%; }

    /* Vertical toolbar */
    .gv-toolbar {
      width:44px; min-width:44px; background:var(--surface); border-left:1px solid var(--border);
      display:flex; flex-direction:column; align-items:center; padding:8px 0; gap:4px;
    }
    .gv-tool-btn {
      width:36px; height:36px; border-radius:10px; border:none; background:transparent;
      cursor:pointer; display:flex; align-items:center; justify-content:center;
      color:var(--text-3); transition:all 0.12s; position:relative;
    }
    .gv-tool-btn:hover { background:#F5F7FA; color:var(--text-1); }
    .gv-tool-btn.active { background:var(--p-lt); color:var(--p); }
    .gv-tool-btn.active::after {
      content:''; position:absolute; right:0; top:8px; bottom:8px; width:2px;
      background:var(--p); border-radius:2px 0 0 2px;
    }
    .gv-tool-sep { width:24px; height:1px; background:var(--border); margin:4px 0; }

    /* Detail panel */
    .gv-detail {
      width:320px; min-width:320px; display:flex; flex-direction:column;
      background:var(--surface); border-right:1px solid var(--border);
      transition:width 0.25s var(--ease), min-width 0.25s var(--ease), opacity 0.2s;
      overflow:hidden; order:1;
    }
    .gv-detail.collapsed { width:0; min-width:0; opacity:0; border:none; overflow:hidden; }

    .gv-detail-toggle {
      position:absolute; left:-12px; top:50%; transform:translateY(-50%);
      width:24px; height:24px; border-radius:50%; border:1px solid var(--border);
      background:var(--surface); cursor:pointer; display:none;
      align-items:center; justify-content:center; color:var(--text-3); z-index:5;
      box-shadow:var(--shadow-sm);
    }

    /* Detail header with close */
    .gv-detail-head {
      display:flex; align-items:center; justify-content:space-between;
      padding:12px 14px; border-bottom:1px solid var(--border); flex-shrink:0;
    }
    .gv-detail-head-title { font-size:13px; font-weight:700; color:var(--text-1); }
    .gv-detail-head-actions { display:flex; gap:4px; }
    .gv-detail-icon-btn {
      width:28px; height:28px; border-radius:6px; border:1px solid var(--border);
      background:transparent; cursor:pointer; display:flex; align-items:center;
      justify-content:center; color:var(--text-3); transition:all 0.1s;
    }
    .gv-detail-icon-btn:hover { background:#F5F7FA; color:var(--text-1); }
    .gv-detail-icon-btn.danger:hover { background:#FEE2E2; color:var(--danger); border-color:var(--danger); }

    .gv-detail-inner { flex:1; overflow-y:auto; display:flex; flex-direction:column; }
    .gv-detail-inner::-webkit-scrollbar { width:3px; }
    .gv-detail-inner::-webkit-scrollbar-thumb { background:var(--bg2); border-radius:2px; }

    .gv-placeholder {
      flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
      padding:24px; text-align:center;
    }

    .gv-d-title-row { display:flex; justify-content:space-between; align-items:flex-start; padding:14px 14px 8px; gap:8px; }
    .gv-d-title { font-size:15px; font-weight:700; color:var(--text-1); line-height:1.35; }
    .gv-actions { display:flex; gap:4px; flex-wrap:wrap; flex-shrink:0; }
    .gv-abtn {
      padding:5px 10px; border-radius:6px; border:1px solid var(--border); background:var(--surface);
      cursor:pointer; font-size:11px; font-weight:600; font-family:var(--font); transition:all 0.12s;
    }
    .gv-abtn:hover { background:var(--bg); }
    .gv-abtn-p { color:var(--p); border-color:var(--p); }
    .gv-abtn-p:hover { background:var(--p-lt); }
    .gv-abtn-o { color:var(--text-3); }
    .gv-abtn-d { color:var(--danger); border-color:var(--danger); }
    .gv-abtn-d:hover { background:#FEE2E2; }

    .gv-badge-row { display:flex; gap:5px; flex-wrap:wrap; padding:0 14px 10px; }
    .gv-code-tag { font-size:10px; font-family:var(--mono); color:var(--text-4); background:var(--bg); padding:2px 8px; border-radius:4px; }
    .gv-badge { font-size:10px; font-weight:600; padding:2px 8px; border-radius:4px; border:1px solid; display:inline-flex; align-items:center; gap:4px; }
    .gv-badge-dot { width:5px; height:5px; border-radius:50%; }

    .gv-detail-tabs { display:flex; border-bottom:1px solid var(--border); padding:0 14px; flex-shrink:0; }
    .gv-dtab {
      display:flex; align-items:center; gap:5px; padding:9px 14px; font-size:12px; font-weight:500;
      color:var(--text-3); border:none; background:none; cursor:pointer; font-family:var(--font);
      border-bottom:2px solid transparent; transition:all 0.12s;
    }
    .gv-dtab:hover { color:var(--text-1); }
    .gv-dtab.active { color:var(--p); border-bottom-color:var(--p); font-weight:600; }
    .gv-dtab-ct { font-size:9px; font-weight:700; color:var(--p); background:var(--p-lt); padding:1px 5px; border-radius:99px; }

    .gv-detail-scroll, .gv-reports-scroll { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:12px; }
    .gv-bc { display:flex; align-items:center; flex-wrap:wrap; gap:2px; }
    .gv-bc-btn { font-size:11px; color:var(--p); background:none; border:none; cursor:pointer; font-family:var(--font); font-weight:500; }
    .gv-bc-btn:hover { text-decoration:underline; }
    .gv-bc-sep { font-size:10px; color:var(--text-4); margin:0 2px; }
    .gv-bc-cur { font-size:11px; color:var(--text-3); font-weight:600; }

    .gv-meta-row { display:flex; gap:6px; flex-wrap:wrap; }
    .gv-meta-pill { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:99px; background:var(--bg); border:1px solid var(--border); font-size:10px; color:var(--text-3); font-weight:600; }
    .gv-desc { font-size:13px; line-height:1.65; color:var(--text-2); white-space:pre-wrap; }
    .gv-notes { display:flex; gap:8px; align-items:flex-start; padding:10px 12px; background:#FFF8E1; border:1px solid rgba(249,171,0,0.2); border-radius:8px; }
    .gv-notes-text { font-size:12px; line-height:1.6; color:#7B4F00; flex:1; }

    .gv-prog { display:flex; flex-direction:column; gap:6px; }
    .gv-prog-head { display:flex; justify-content:space-between; align-items:center; }
    .gv-prog-lbl { font-size:11px; font-weight:600; color:var(--text-2); }
    .gv-prog-pct { font-size:13px; font-weight:700; font-family:var(--mono); }
    .gv-prog-track { height:5px; background:var(--bg); border-radius:99px; overflow:hidden; }
    .gv-prog-fill { height:100%; border-radius:99px; transition:width 0.6s var(--ease2); }

    .gv-comp-banner { display:flex; align-items:flex-start; gap:10px; padding:12px; border-radius:8px; border:1px solid; }
    .gv-comp-icon { font-size:16px; flex-shrink:0; }
    .gv-comp-text { font-size:12px; font-weight:700; }
    .gv-comp-sub { font-size:11px; opacity:0.8; margin-top:3px; }
    .gv-sec-lbl { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-4); margin-bottom:6px; }

    .gv-wf-btn {
      display:flex; align-items:center; gap:6px; width:100%; padding:9px 14px; border-radius:8px;
      font-size:12px; font-weight:600; border:1.5px solid; cursor:pointer; font-family:var(--font);
      transition:all 0.15s; margin-bottom:4px;
    }
    .gv-wf-confirm { background:var(--p-lt); color:var(--p); border-color:rgba(26,115,232,0.2); }
    .gv-wf-confirm:hover { background:var(--p); color:#fff; }
    .gv-wf-start { background:#E6F4EA; color:#1E8E3E; border-color:rgba(30,142,62,0.2); }
    .gv-wf-start:hover { background:#1E8E3E; color:#fff; }
    .gv-wf-report { background:#FFF4E5; color:#E37400; border-color:rgba(227,116,0,0.2); }
    .gv-wf-report:hover { background:#E37400; color:#fff; }
    .gv-wf-submit { background:var(--p-lt); color:var(--p); border-color:rgba(26,115,232,0.2); }
    .gv-wf-submit:hover { background:var(--p); color:#fff; }
    .gv-wf-review { background:var(--bg); color:var(--text-2); border-color:var(--border); }
    .gv-wf-review:hover { background:var(--text-1); color:#fff; }
    .gv-wf-ceo { background:#FFF4E5; color:#E37400; border-color:rgba(227,116,0,0.2); }
    .gv-wf-ceo:hover { background:#E37400; color:#fff; }
    .gv-wf-btn:disabled { opacity:0.5; pointer-events:none; }

    .gv-sub-item { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; background:var(--bg); cursor:pointer; margin-bottom:4px; transition:all 0.1s; }
    .gv-sub-item:hover { background:var(--p-lt); transform:translateX(2px); }
    .gv-sub-name { font-size:12px; font-weight:600; color:var(--text-2); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    .gv-dl-entry { display:flex; gap:8px; align-items:flex-start; padding:7px 10px; background:var(--bg); border-radius:8px; margin-bottom:4px; }
    .gv-report-card { background:var(--bg); border-radius:10px; padding:14px; margin-bottom:8px; transition:box-shadow 0.12s; }
    .gv-report-card:hover { box-shadow:var(--shadow-sm); }

    .gv-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:32px 16px; text-align:center; }
    .gv-empty-icon { font-size:28px; margin-bottom:8px; opacity:0.5; }
    .gv-empty-t { font-size:13px; font-weight:600; color:var(--text-3); }
    .gv-empty-s { font-size:11px; color:var(--text-4); margin-top:2px; }

    /* Skeleton loader */
    .gv-skeleton {
      background: linear-gradient(90deg, #F0F2F5 25%, #E4E7EC 50%, #F0F2F5 75%);
      background-size: 200% 100%; animation: skel-shimmer 1.5s infinite; border-radius:6px;
    }
    @keyframes skel-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
    .gv-skel-row { display:flex; gap:10px; align-items:center; padding:10px 14px; }
    .gv-skel-circle { width:30px; height:30px; border-radius:50%; flex-shrink:0; }
    .gv-skel-lines { flex:1; display:flex; flex-direction:column; gap:6px; }
    .gv-skel-line { height:10px; border-radius:4px; }

    /* also keep old shimmer class for compat */
    .gv-shimmer {
      background: linear-gradient(90deg, var(--bg) 30%, var(--bg2) 50%, var(--bg) 70%);
      background-size: 200% 100%; animation: skel-shimmer 1.5s infinite; border-radius:6px;
    }

    .gv-mobile-back {
      display:none; align-items:center; gap:5px; padding:8px 14px;
      font-size:12px; font-weight:600; color:var(--p); background:none; border:none;
      cursor:pointer; font-family:var(--font); border-bottom:1px solid var(--border);
    }
    .gv-mobile-tabs-bar { display:none; border-bottom:1px solid var(--border); }
    .gv-mob-tab {
      flex:1; padding:8px; border:none; background:none; font-size:12px; font-weight:500;
      color:var(--text-3); cursor:pointer; font-family:var(--font);
    }
    .gv-mob-tab.active { color:var(--p); border-bottom:2px solid var(--p); }

    /* ─── Sidebar Tabs ─── */

        /* ─── Context Menu ─── */
    .gv-ctx-menu {
      position:fixed; z-index:1000; background:var(--surface);
      border:1px solid var(--border); border-radius:10px;
      box-shadow:var(--shadow-xl); min-width:160px; padding:4px;
      animation:ctx-in 0.12s ease;
    }
    @keyframes ctx-in { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
    .gv-ctx-item {
      display:flex; align-items:center; gap:8px; padding:8px 12px;
      font-size:12px; font-weight:500; color:var(--text-2); cursor:pointer;
      border-radius:6px; transition:background 0.1s; border:none; background:none;
      width:100%; font-family:var(--font); text-align:left;
    }
    .gv-ctx-item:hover { background:#F5F7FA; }
    .gv-ctx-item.danger { color:var(--danger); }
    .gv-ctx-item.danger:hover { background:#FEE2E2; }
    .gv-ctx-sep { height:1px; background:var(--border); margin:4px 8px; }


        /* ─── Mobile ─── */
    @media (max-width:767px) {
      .gv-root { height:calc(100vh - 56px); flex-direction:column; }
      .gv-tree { width:100%; min-width:100%; border-right:none; border-bottom:1px solid var(--border); max-height:100%; transition:max-height 0.25s var(--ease2),opacity 0.2s; }
      .gv-tree.mob-hidden { max-height:0!important; opacity:0; pointer-events:none; overflow:hidden; border-bottom:none; }
      .gv-chat { width:100%; flex:1; }
      .gv-chat.mob-hidden { display:none; }
      .gv-right-area { display:none; }
      .gv-toolbar { display:none; }
      .gv-detail { width:100%!important; min-width:100%!important; position:fixed; inset:0; z-index:50; border:none; }
      .gv-detail.collapsed { display:none; }
      .gv-detail.mob-tab-active { display:flex; }
      .gv-detail-toggle { display:none; }
      .gv-sidebar-toggle { display:none; }
      .gv-mobile-back { display:flex; }
      .gv-mobile-tabs-bar { display:flex; }
      .gv-msgs { padding:12px; }
      .gv-msg-group { max-width:88%; }
    }
    @media (max-width:480px) { .gv-chat-task-name { display:none; } }
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

      <div className="gv-root" >

        {/* COL-1: TASK TREE */}
        <div className={`gv-tree ${sidebarCollapsed ? "collapsed" : ""} ${mobileView === "chat" ? "mob-hidden" : ""}`}>
          <div className="gv-tree-head">
            <div className="gv-brand-row">
              <div className="gv-logo">
                <div className="gv-logo-mark">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <rect x="1" y="1" width="5" height="5" rx="1.2" fill="white" opacity=".9" />
                    <rect x="7" y="1" width="5" height="5" rx="1.2" fill="white" />
                    <rect x="1" y="7" width="5" height="5" rx="1.2" fill="white" />
                    <rect x="7" y="7" width="5" height="5" rx="1.2" fill="white" opacity=".6" />
                  </svg>
                </div>
                <div>
                  <div className="gv-logo-text">Task Board</div>
                  <div className="gv-logo-sub">{(isCEO || isTL) ? "By employee" : "Select task to open"}</div>
                </div>
              </div>
              {(isCEO || isTL) && (
                <button className="gv-new-btn" onClick={() => setActiveModal({ type: "add_subtask", taskId: null, task: null })}>
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M4.5 1v7M1 4.5h7" stroke="white" strokeWidth="1.6" strokeLinecap="round" /></svg>
                  New
                </button>
              )}
            </div>
          </div>


          <div className="gv-stats">
            {[
              { v: stats.total, l: "All", c: "#1A73E8" },
              { v: stats.open, l: "Open", c: "#98A2B3" },
              { v: stats.active, l: "Active", c: "#F9AB00" },
              { v: stats.done, l: "Done", c: "#34A853" },
            ].map(s => (
              <div key={s.l} className="gv-stat">
                <span className="gv-stat-n" style={{ color: s.c }}>{s.v}</span>
                <span className="gv-stat-l">{s.l}</span>
              </div>
            ))}
          </div>

          <div className="gv-tree-list">
            {tasksLoading ? (
              <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="gv-skel-row">
                    <div className="gv-skeleton gv-skel-circle" />
                    <div className="gv-skel-lines">
                      <div className="gv-skeleton gv-skel-line" style={{ width: `${60 + i * 8}%` }} />
                      <div className="gv-skeleton gv-skel-line" style={{ width: `${40 + i * 5}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : allTasks.length === 0 ? (
              <div className="gv-empty">
                <div className="gv-empty-icon">📋</div>
                <p className="gv-empty-t">No tasks yet</p>
                <p className="gv-empty-s">{(isCEO || isTL) ? "Click + New to start" : "No tasks assigned"}</p>
              </div>
            ) : (isCEO || isTL) && employeeGroups ? (
              <>
                {employeesLoading && (
                  <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                    <GwSpinner />
                    <span style={{ fontSize: 10, color: "var(--text-4)" }}>Loading employees…</span>
                  </div>
                )}
                {(() => {
                  // Sort employee groups: unread first, then by latest real message time
                  const getMsForEmp = (empTasks) => {
                    const rootTs = empTasks.filter(t => !t.parentTaskId);
                    const times = rootTs.map(t => lastMsgTimes[t.taskId] || 0);
                    return times.length ? Math.max(...times) : 0;
                  };
                  const getEmpUnread = (empTasks) =>
                    empTasks.filter(t => !t.parentTaskId).reduce((sum, t) => sum + (unreadCounts?.[t.taskId] || 0), 0);

                  const sortedEntries = Array.from(employeeGroups.entries()).sort((a, b) => {
                    const ua = getEmpUnread(a[1].tasks);
                    const ub = getEmpUnread(b[1].tasks);
                    if (ua > 0 && ub === 0) return -1;
                    if (ub > 0 && ua === 0) return 1;
                    return getMsForEmp(b[1].tasks) - getMsForEmp(a[1].tasks);
                  });

                  return sortedEntries.map(([empId, { name, tasks: empTasks }], idx) => (
                    <div key={empId}>
                      <EmployeeGroup
                        empId={empId}
                        empName={name}
                        tasks={empTasks}
                        allTaskMap={allTaskMap}
                        selectedId={task?.taskId}
                        onSelect={handleSelectNode}
                        expandedIds={expandedIds}
                        toggleExpand={toggleExpand}
                        expandedEmps={expandedEmps}
                        toggleEmp={toggleEmp}
                        viewerRole={role}
                        viewerEmployeeId={employeeId}
                        unreadTaskIds={unreadTaskIds}
                        unreadCounts={unreadCounts}
                        lastMsgTimes={lastMsgTimes}
                      />
                      {idx < sortedEntries.length - 1 && <div style={{ height: "0.5px", background: "var(--border)", margin: "3px 12px" }} />}
                    </div>
                  ));
                })()}
                {employeeGroups.size === 0 && (
                  <div className="gv-empty">
                    <div className="gv-empty-icon">👥</div>
                    <p className="gv-empty-t">No employees yet</p>
                    <p className="gv-empty-s">Assign tasks to employees first</p>
                  </div>
                )}
              </>
            ) : (
              // Flat tree — sorted by real latest message time (WhatsApp style)
              allTasks
                .filter(t => !t.parentTaskId)
                .sort((a, b) => {
                  const ua = unreadCounts?.[a.taskId] || 0;
                  const ub = unreadCounts?.[b.taskId] || 0;
                  if (ua > 0 && ub === 0) return -1;
                  if (ub > 0 && ua === 0) return 1;
                  return (lastMsgTimes[b.taskId] || 0) - (lastMsgTimes[a.taskId] || 0);
                })
                .map(t => (
                  <TreeNode key={t.taskId} node={t} allTaskMap={allTaskMap}
                    selectedId={task?.taskId} onSelect={handleSelectNode}
                    expandedIds={expandedIds} toggleExpand={toggleExpand} depth={0}
                    viewerRole={role}
                    viewerEmployeeId={employeeId}
                    unreadTaskIds={unreadTaskIds}
                    unreadCounts={unreadCounts}
                    lastMsgTimes={lastMsgTimes}
                  />
                ))
            )}
          </div>


        </div>
        <button
          className={`gv-sidebar-toggle ${sidebarCollapsed ? "flip" : ""}`}
          onClick={() => setSidebarCollapsed(v => !v)}
          title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M6 2L3 5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* COL-2: CHAT */}
        <div className={`gv-chat ${mobileView !== "chat" ? "mob-hidden" : ""} ${mobDetailPanel ? "mob-hidden" : ""}`} style={{ position: "relative" }}>

          {/* Mobile back button */}
          <button className="gv-mobile-back" onClick={() => { setMobileView("list"); setSelectedTask(null); }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            All Tasks
          </button>

          {/* Chat header */}
          <div className="gv-chat-head">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <path d="M14 10a1.33 1.33 0 0 1-1.33 1.33H4L1.33 14.33V3.33A1.33 1.33 0 0 1 2.67 2H12.67A1.33 1.33 0 0 1 14 3.33V10z" fill="var(--p,#1A73E8)" opacity=".15" stroke="var(--p,#1A73E8)" strokeWidth="1.1" strokeLinejoin="round" />
            </svg>
            {task ? (
              <>
                <div className="gv-chat-task-chip">
                  <span className="gv-chat-tid">{task.taskId}</span>
                </div>
                <span className="gv-chat-task-name">{task.title}</span>
                {task.status && (
                  <span className="gv-chat-badge" style={{ color: (STATUS[task.status] || STATUS.open).color, background: (STATUS[task.status] || STATUS.open).bg }}>
                    {(STATUS[task.status] || STATUS.open).label}
                  </span>
                )}

                {/* Action buttons in header */}
                <div className="gv-chat-actions">
                  {/* ── MOBILE ONLY: ALL buttons including Info/Reports ── */}
                  <div className="gv-mob-only-actions">
                    <button className="gv-chat-act-btn" style={{ background: "linear-gradient(135deg,#D93025,#EA4335)", color: "#fff", border: "none", fontWeight: 800, fontSize: 10 }}
                      onClick={() => setRequestModal({ taskId: task.taskId, taskTitle: task.title })} title="Send Request">
                      R
                    </button>
                    {(isCEO || isTL) && (
                      <button className="gv-chat-act-btn" onClick={() => handleAction("add_subtask")} title="Add Subtask">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      </button>
                    )}
                    {(isCEO || isTL || isAssignee) && task.status !== "done" && (
                      <button className="gv-chat-act-btn" onClick={() => handleAction("forward")} title="Forward Task">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7" /><path d="M4 18v-2a4 4 0 014-4h12" /></svg>
                      </button>
                    )}
                    {isCEO && (
                      <button className="gv-chat-act-btn" onClick={() => handleAction("deadline")} title="Edit Deadline">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      </button>
                    )}
                    {isCEO && (
                      <button className="gv-chat-act-btn" style={{ color: "var(--danger)" }} onClick={() => handleAction("delete")} title="Delete Task">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                      </button>
                    )}
                    <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px", flexShrink: 0 }} />
                    <button className="gv-chat-act-btn" style={mobDetailPanel === "info" ? { background: "var(--p-lt)", color: "var(--p)", borderColor: "var(--p)" } : {}}
                      onClick={() => setMobDetailPanel(mobDetailPanel === "info" ? null : "info")} title="Task Info">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                    </button>
                    <button className="gv-chat-act-btn" style={mobDetailPanel === "reports" ? { background: "var(--p-lt)", color: "var(--p)", borderColor: "var(--p)" } : {}}
                      onClick={() => setMobDetailPanel(mobDetailPanel === "reports" ? null : "reports")} title="Reports">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <span style={{ fontSize: 13, color: "var(--text-4)", fontStyle: "italic" }}>Select a task to start chatting</span>
            )}
          </div>

          {/* Mobile tabs now handled by header action buttons above */}

          {/* Messages */}
          <div className="gv-msgs">
            {!task ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 40 }}>
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#D0D5DD" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-3)", marginBottom: 4 }}>No conversation selected</p>
                  <p style={{ fontSize: 12, color: "var(--text-4)", lineHeight: 1.5 }}>Select a task from the left panel<br />to view its chat thread</p>
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
                  <div key={msg.messageId || idx} className={`gv-msg-group${isMe ? " me" : ""}`}
                    onContextMenu={(e) => handleContextMenu(e, msg)}
                    onTouchStart={() => handleLongPressStart(msg)}
                    onTouchEnd={handleLongPressEnd}
                    onTouchCancel={handleLongPressEnd}
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
                            background: "#34A853",
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
                            color: "#34A853",
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
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar with @ mention */}
          {task && (
            <div style={{ position: "relative" }}>
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
          <div className={`gv-detail mob-tab-active`}>
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

              {/* Detail badge row */}
              <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="gv-code-tag">{task.taskId}</span>
                {st && <span className="gv-badge" style={{ color: st.color, background: st.bg, borderColor: `${st.color}22` }}><span className="gv-badge-dot" style={{ background: st.dot }} />{st.label}</span>}
                <span className="gv-badge" style={{ color: pri.color, background: pri.bg, borderColor: `${pri.color}22` }}><span className="gv-badge-dot" style={{ background: pri.dot }} />{pri.label}</span>
              </div>

              {/* tab switcher inside mobile detail */}
              <div className="gv-detail-tabs">
                <button className={`gv-dtab ${mobDetailPanel === "info" ? "active" : ""}`} onClick={() => setMobDetailPanel("info")}>ℹ️ Info</button>
                <button className={`gv-dtab ${mobDetailPanel === "reports" ? "active" : ""}`} onClick={() => setMobDetailPanel("reports")}>
                  📊 Reports
                  {(task.dailyReportCount || 0) > 0 && <span className="gv-dtab-ct">{task.dailyReportCount}</span>}
                </button>
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </button>
            <button
              className={`gv-tool-btn ${rightPanel === "reports" ? "active" : ""}`}
              onClick={() => setRightPanel(rightPanel === "reports" ? null : "reports")}
              title="Reports"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 17 20 12 15 7" /><path d="M4 18v-2a4 4 0 014-4h12" />
              </svg>
            </button>
          </div>

          {/* Detail panel */}
          <div className={`gv-detail ${rightPanel === null ? "collapsed" : ""}`}>
            <div className="gv-detail-inner">
              {/* Detail header with close */}
              <div className="gv-detail-head">
                <span className="gv-detail-head-title">{rightPanel === "reports" ? "Reports" : "Task Details"}</span>
                <div className="gv-detail-head-actions">
                  <button className="gv-detail-icon-btn" onClick={() => setRightPanel(null)} title="Close panel">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              </div>

              {!task ? (
                <div className="gv-placeholder">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D0D5DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                  <p style={{ fontSize: 12, color: "var(--text-4)", lineHeight: 1.7, maxWidth: 180, textAlign: "center", marginTop: 8 }}>Select a task to view details and reports here.</p>
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
                  {/* Detail header */}
                  <div className="gv-d-title-row">
                    <div className="gv-d-title">{task.title}</div>
                    <div className="gv-actions">
                      {/* Circle R — Request button — visible to everyone */}
                      <button
                        className="gv-abtn"
                        style={{
                          background: "linear-gradient(135deg,#D93025,#EA4335)",
                          color: "#fff", borderColor: "transparent",
                          borderRadius: "50%", width: 28, height: 28,
                          padding: 0, fontSize: 11, fontWeight: 800,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, boxShadow: "0 2px 8px rgba(217,48,37,0.4)",
                          cursor: "pointer",
                        }}
                        title="Send a Request"
                        onClick={() => setRequestModal({ taskId: task.taskId, taskTitle: task.title })}
                      >
                        R
                      </button>
                      {(isCEO || isTL) && <button className="gv-abtn gv-abtn-p" onClick={() => handleAction("add_subtask")}>+Sub</button>}
                      {(isCEO || isTL || isAssignee) && task.status !== "done" && <button className="gv-abtn gv-abtn-o" onClick={() => handleAction("forward")}>↗ Fwd</button>}
                      {isCEO && <button className="gv-abtn gv-abtn-o" onClick={() => handleAction("deadline")}>📅</button>}
                      {isCEO && <button className="gv-abtn gv-abtn-d" onClick={() => handleAction("delete")}>🗑</button>}
                    </div>
                  </div>

                  <div className="gv-badge-row">
                    <span className="gv-code-tag">{task.taskId}</span>
                    {!task.parentTaskId && <span className="gv-badge" style={{ color: "var(--p)", background: "var(--p-lt)", borderColor: "rgba(91,94,244,.2)" }}>Root</span>}
                    {st && <span className="gv-badge" style={{ color: st.color, background: st.bg, borderColor: `${st.color}22` }}><span className="gv-badge-dot" style={{ background: st.dot }} />{st.label}</span>}
                    <span className="gv-badge" style={{ color: pri.color, background: pri.bg, borderColor: `${pri.color}22` }}><span className="gv-badge-dot" style={{ background: pri.dot }} />{pri.label}</span>
                  </div>


                  {/* Desktop tabs */}
                  <div className="gv-detail-tabs">
                    <button className={`gv-dtab ${(rightPanel || activeDetailTab) === "info" ? "active" : ""}`} onClick={() => { setActiveDetailTab("info"); setRightPanel("info"); }}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1" /><path d="M5.5 5v3M5.5 3.5v.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
                      Info
                    </button>
                    <button className={`gv-dtab ${(rightPanel || activeDetailTab) === "reports" ? "active" : ""}`} onClick={() => { setActiveDetailTab("reports"); setRightPanel("reports"); }}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="7" width="2" height="3.5" rx=".5" stroke="currentColor" strokeWidth=".9" /><rect x="4.5" y="4" width="2" height="6.5" rx=".5" stroke="currentColor" strokeWidth=".9" /><rect x="8" y="1" width="2" height="9.5" rx=".5" stroke="currentColor" strokeWidth=".9" /></svg>
                      Reports
                      {(task.dailyReportCount || 0) > 0 && <span className="gv-dtab-ct">{task.dailyReportCount}</span>}
                    </button>
                  </div>

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
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div className="gv-ctx-menu" style={{ left: Math.min(contextMenu.x, window.innerWidth - 180), top: Math.min(contextMenu.y, window.innerHeight - 200) }} onClick={e => e.stopPropagation()}>
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
        title="Delete Task?"
        message={`Permanently delete "${task?.title} (${task?.taskId})"${task?.subtaskIds?.length ? ` and all ${task.subtaskIds.length} subtasks` : ""}? This cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConf(false)}
      />

      {/* Request Modal - for sending requests to team members */}
      {requestModal && (
        <RequestModal
          taskId={requestModal.taskId}
          taskTitle={requestModal.taskTitle}
          currentEmployeeId={employeeId}
          currentEmployeeName={employeeName}
          onClose={() => setRequestModal(null)}
        />
      )}
    </>
  );
}