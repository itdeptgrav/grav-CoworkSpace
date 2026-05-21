/**
 * components/coworking/tasks/DetailBody.jsx
 * 
 * // <components />
 <page className="js"></page>
 *
 * FORMAL, CLEAN redesign of the Details tab right panel.
 * Replaces the existing DetailBody function in page.js.
 * Drop-in: same props signature, same internal logic, no changes needed elsewhere.
 *
 * Design principles:
 * - Plain white background, no colored gradients or cartoon cards
 * - Data shown as clean label → value rows (like a form)
 * - Workflow actions shown as clear, simple buttons with short plain-English labels
 * - No decorative emojis in structural UI (only in user-supplied content)
 * - IBM Plex Sans, #1B4F8A brand color
 */
"use client";
import { useState } from "react";
import { GwAvatar } from "../shared/CoworkShared";
import { ReportCard, ReportDateGroup } from "./ReportCard";
import ThirdPartyTask from "./ThirdPartyTask";
import GoalTask from "./GoalTask";
import DeadlineBreakdown from "./DeadlineBreakdown";
import { fmtLiveDeadlineDateTime } from "../../../lib/tasksPageHelpers";
import { formatTimeHMS } from "../../../hooks/useTaskTimer";

// ── tiny helpers ──────────────────────────────────────────────────────────────
const F = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif";
const BRAND = "#1B4F8A";

function fmtSecs(s) {
  s = Math.max(0, Math.round(Number(s) || 0));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) {
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(s / 86400)}d`;
}

function fmtDate(v) {
  if (!v) return null;
  try { return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return null; }
}

function fmtDateTime(v) {
  if (!v) return null;
  try { return new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return null; }
}

// Status display map
const STATUS_LABEL = {
  open: "Not Started", confirmed: "Confirmed", in_progress: "In Progress",
  done: "Done", pending_deadline_approval: "Awaiting Deadline Approval",
  pending_employee_deadline_confirmation: "Awaiting Your Response",
  deadline_approved: "Deadline Approved", deadline_rejected: "Deadline Rejected",
};
const STATUS_COLOR = {
  open: "#D97706", confirmed: "#4F46E5", in_progress: "#7C3AED",
  done: "#16A34A", pending_deadline_approval: "#D97706",
  pending_employee_deadline_confirmation: "#D97706",
  deadline_approved: "#16A34A", deadline_rejected: "#DC2626",
};
const COMP_LABEL = {
  submitted: "Submitted — Awaiting Review",
  tl_approved: "TL Approved — Awaiting CEO",
  tl_rejected: "Rejected by TL",
  tl_final_approved: "Approved & Complete",
  ceo_approved: "CEO Approved & Complete",
  ceo_rejected: "Rejected by CEO",
};
const COMP_COLOR = {
  submitted: "#D97706", tl_approved: "#4F46E5", tl_rejected: "#DC2626",
  tl_final_approved: "#16A34A", ceo_approved: "#16A34A", ceo_rejected: "#DC2626",
};

// ─────────────────────────────────────────────────────────────────────────────
// Row: label + value layout used throughout the info tab
function InfoRow({ label, children, noBorder }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0, padding: "9px 0", borderBottom: noBorder ? "none" : "1px solid #F1F5F9" }}>
      <span style={{ width: 110, flexShrink: 0, fontSize: 11, color: "#9CA3AF", fontWeight: 500, paddingTop: 1, lineHeight: 1.4 }}>{label}</span>
      <span style={{ flex: 1, fontSize: 12, color: "#1F2937", fontWeight: 500, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small status badge
function StatusBadge({ status }) {
  const label = STATUS_LABEL[status] || status || "Unknown";
  const color = STATUS_COLOR[status] || "#6B7280";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 4, border: `1px solid ${color}22`, background: `${color}11`, fontSize: 11, fontWeight: 600, color }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Priority badge
// priority is stored as a number (1–10) or occasionally a string ("high"/"P1")
const PRI_COLOR_NUM = { 1: "#DC2626", 2: "#EA580C", 3: "#D97706", 4: "#2563EB", 5: "#16A34A" };
const PRI_COLOR_STR = { high: "#DC2626", urgent: "#DC2626", medium: "#D97706", low: "#16A34A", p1: "#DC2626", p2: "#EA580C", p3: "#D97706", p4: "#2563EB", p5: "#16A34A" };
function PriBadge({ priority }) {
  if (priority === null || priority === undefined || priority === "") return <span style={{ color: "#9CA3AF", fontSize: 11 }}>—</span>;
  const n = Number(priority);
  if (!isNaN(n) && n > 0) {
    const color = PRI_COLOR_NUM[Math.min(n, 5)] || "#6B7280";
    return <span style={{ fontSize: 11, fontWeight: 700, color }}>P{n}</span>;
  }
  // string fallback
  const key = String(priority).toLowerCase().trim();
  const color = PRI_COLOR_STR[key] || "#6B7280";
  return <span style={{ fontSize: 11, fontWeight: 700, color }}>{String(priority).toUpperCase()}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header
function Section({ title }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF", padding: "14px 0 4px", borderBottom: "1px solid #F1F5F9", marginBottom: 2 }}>
      {title}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action button — primary (filled) or secondary (outlined)
function ActionBtn({ onClick, disabled, busy, variant = "primary", children, danger }) {
  const base = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    width: "100%", padding: "9px 14px", borderRadius: 6,
    fontSize: 12, fontWeight: 600, cursor: disabled || busy ? "not-allowed" : "pointer",
    fontFamily: F, transition: "all 0.12s", border: "none",
    opacity: disabled || busy ? 0.5 : 1,
  };
  const filled = { ...base, background: danger ? "#DC2626" : BRAND, color: "#fff" };
  const outlined = { ...base, background: "#fff", color: danger ? "#DC2626" : BRAND, border: `1px solid ${danger ? "#DC2626" : BRAND}` };
  const ghost = { ...base, background: "#F8FAFC", color: "#374151", border: "1px solid #E5E7EB" };
  const s = variant === "primary" ? filled : variant === "outline" ? outlined : ghost;
  return <button style={s} onClick={onClick} disabled={disabled || busy}>{busy ? "Processing…" : children}</button>;
}

// Spinner icon
function Spin() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: "db-spin 1s linear infinite", flexShrink: 0 }}>
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
export default function DetailBody({
  task, dailyReports, reportsLoading, activeDetailTab, setActiveDetailTab,
  isAssignee, isConfirmed, isStarted, isCEO, isTL, actionBusy, handleAction, handleSelectNode,
  employeeId, pct, pctColor, pctGradient, unreadCounts, employeeMap, employeeMapFull, chatMessages,
  timerActiveTaskId, getDisplaySeconds, getTimerSession, timerStart, timerPause, watchedTimers,
  deadlineFlow, onUpdatePriority, extFlow,
}) {
  const df = deadlineFlow || {};
  const ef = extFlow || {};

  // ── derived ──────────────────────────────────────────────────────────────
  const status = task.status;
  const workedSecs = getDisplaySeconds ? getDisplaySeconds(task.taskId) : 0;
  const windowSecs = Number(task.deadlineWindowSecs) || 0;
  const isRunningThis = timerActiveTaskId === task.taskId;
  const timerSession = getTimerSession ? getTimerSession(task.taskId) : null;
  const isTimerExceeded = windowSecs > 0 && workedSecs >= windowSecs;
  const isFixedDeadlinePassed = !task.hasTimer && task.fixedDeadline && new Date(task.fixedDeadline) < new Date() && ["in_progress", "confirmed"].includes(task.status);
  const timerBlocked = timerActiveTaskId && timerActiveTaskId !== task.taskId;

  const remainingSecs = windowSecs > 0 ? Math.max(0, windowSecs - workedSecs) : null;
  const overSecs = windowSecs > 0 && workedSecs > windowSecs ? workedSecs - windowSecs : 0;

  const liveDeadlineStr = fmtLiveDeadlineDateTime(task, timerSession);
  const createdAt = task.createdAt
    ? fmtDate(typeof task.createdAt === "object" && task.createdAt.seconds ? task.createdAt.seconds * 1000 : task.createdAt)
    : null;

  const compStatus = task.completionStatus;
  const compLabel = compStatus ? COMP_LABEL[compStatus] : null;
  const compColor = compStatus ? COMP_COLOR[compStatus] : null;
  const rejReason = compStatus === "tl_rejected" ? task.tlReview?.rejectionReason
    : compStatus === "ceo_rejected" ? task.ceoReview?.rejectionReason : null;

  // assignee names
  const assigneeList = (() => {
    const ids = task.assigneeIds || [];
    return ids.map(id => {
      const full = (typeof employeeMapFull?.get === "function" ? employeeMapFull.get(id) : null) || {};
      const name = full.name || (typeof employeeMap?.get === "function" ? employeeMap.get(id) : null) || task.assigneeNameMap?.[id] || id;
      const pic = full.profilePicUrl || full.photoURL || "";
      return { id, name, pic };
    });
  })();

  // ── tab bar ──────────────────────────────────────────────────────────────
  const tabs = [
    { key: "info", label: "Details" },
    ...(!task.isFolder ? [{ key: "reports", label: task.isThirdParty ? "Timeline" : task.isGoal ? "Goal Progress" : task.isRepeat ? "Submissions" : "Reports", count: (!task.isThirdParty && !task.isGoal && !task.isRepeat) ? (task.dailyReportCount || 0) : 0 }] : []),
  ];

  const curTab = activeDetailTab === "reports" ? "reports" : "info";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, fontFamily: F }}>
      <style>{`
        @keyframes db-spin { to { transform: rotate(360deg); } }
        .db-tab { background: none; border: none; cursor: pointer; padding: 8px 14px; font-size: 12px; font-weight: 500; color: #9CA3AF; border-bottom: 2px solid transparent; font-family: ${F}; transition: all 0.12s; white-space: nowrap; }
        .db-tab:hover { color: #374151; }
        .db-tab.active { color: ${BRAND}; border-bottom-color: ${BRAND}; font-weight: 700; }
        .db-abtn:hover { opacity: 0.85; }
        .db-scroll::-webkit-scrollbar { width: 3px; }
        .db-scroll::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 2px; }
      `}</style>



      {/* ── REPORTS / GOAL / TIMELINE / SUBMISSIONS TAB ── */}
      {curTab === "reports" && (
        <div className="db-scroll" style={{ flex: 1, overflowY: "auto", padding: task.isGoal ? "0" : "14px 16px" }}>
          {task.isThirdParty && <ThirdPartyTask task={task} employeeId={employeeId} isCEO={isCEO} isTL={isTL} isAssignee={isAssignee} />}
          {task.isGoal && <GoalTask task={task} employeeId={employeeId} isCEO={isCEO} isTL={isTL} isAssignee={isAssignee} />}
          {!task.isThirdParty && !task.isGoal && (
            reportsLoading
              ? <div style={{ padding: 24, textAlign: "center", color: "#9CA3AF", fontSize: 12 }}>Loading…</div>
              : !dailyReports?.length
                ? <div style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 12 }}>No reports submitted yet.</div>
                : (() => {
                  const grouped = {};
                  [...(dailyReports || [])]
                    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
                    .forEach(r => {
                      if (!r) return;
                      const ts = r.createdAt?.seconds ? r.createdAt.seconds * 1000 : (r.createdAt ? new Date(r.createdAt).getTime() : Date.now());
                      const tsMs = isNaN(ts) ? Date.now() : ts;
                      const key = new Date(tsMs).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                      if (!grouped[key]) grouped[key] = [];
                      grouped[key].push(r);
                    });
                  return Object.entries(grouped).map(([dateKey, rpts]) => (
                    <ReportDateGroup key={dateKey} dateLabel={dateKey} reports={rpts || []} />
                  ));
                })()
          )}
        </div>
      )}

      {/* ── DETAILS / INFO TAB ── */}
      {curTab === "info" && (
        <div className="db-scroll" style={{ flex: 1, overflowY: "auto", padding: "2px 16px 20px" }}>

          {/* ── SECTION: TASK INFO ── */}
          <Section title="Task Information" />

          <InfoRow label="Task ID">
            <span style={{ fontFamily: "monospace", fontSize: 11, background: "#F1F5F9", padding: "1px 6px", borderRadius: 4, color: "#475569" }}>{task.taskId}</span>
          </InfoRow>

          <InfoRow label="Status">
            <StatusBadge status={status} />
          </InfoRow>

          {task.priority && (
            <InfoRow label="Priority">
              <PriBadge priority={task.priority} />
            </InfoRow>
          )}

          {createdAt && (
            <InfoRow label="Created on">
              {createdAt}
            </InfoRow>
          )}

          {task.assignedBy && (
            <InfoRow label="Assigned by">
              {task.assignedByName || task.assignedBy}
            </InfoRow>
          )}

          {assigneeList.length > 0 && (
            <InfoRow label="People">
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {assigneeList.map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <GwAvatar name={a.name} size={20} url={a.pic} />
                    <span style={{ fontSize: 12, color: "#1F2937" }}>{a.name}</span>
                  </div>
                ))}
              </div>
            </InfoRow>
          )}

          {task.description && (
            <InfoRow label="Description">
              <span style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{task.description}</span>
            </InfoRow>
          )}

          {task.notes && (
            <InfoRow label="Notes">
              <span style={{ whiteSpace: "pre-wrap", lineHeight: 1.55, color: "#374151" }}>{task.notes}</span>
            </InfoRow>
          )}

          {/* ── SECTION: TIMELINE ── */}
          {(task.dueDate || task.fixedDeadline || task.deadlineWindowSecs) && (
            <>
              <Section title="Timeline" />

              {/* Fixed deadline (non-timer tasks) */}
              {!task.hasTimer && task.fixedDeadline && (
                <InfoRow label="Deadline">
                  {fmtDateTime(task.fixedDeadline)}
                  {(() => {
                    const dl = Math.ceil((new Date(task.fixedDeadline) - Date.now()) / 86400000);
                    const color = dl < 0 ? "#DC2626" : dl <= 1 ? "#D97706" : "#16A34A";
                    const txt = dl < 0 ? `${Math.abs(dl)}d overdue` : dl === 0 ? "Due today" : `${dl}d remaining`;
                    return <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color }}>{txt}</span>;
                  })()}
                </InfoRow>
              )}

              {/* Timer-based deadline */}
              {task.hasTimer && windowSecs > 0 && (
                <>
                  <InfoRow label="Time Requested">
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span>{fmtSecs(windowSecs)}</span>
                      <DeadlineBreakdown task={task} compact />
                    </div>
                  </InfoRow>

                  {workedSecs > 0 && (
                    <InfoRow label="Time Tracked">
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 600, color: isTimerExceeded ? "#DC2626" : "#1F2937" }}>{fmtSecs(workedSecs)}</span>
                          {windowSecs > 0 && (
                            <span style={{ fontSize: 10, color: "#9CA3AF" }}>of {fmtSecs(windowSecs)}</span>
                          )}
                          {isRunningThis && <span style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", background: "#F0FDF4", padding: "1px 6px", borderRadius: 4, border: "1px solid #BBF7D0" }}>Live</span>}
                        </div>
                        {/* Progress bar */}
                        {windowSecs > 0 && (
                          <div style={{ height: 4, background: "#F1F5F9", borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 99, width: `${Math.min(100, (workedSecs / windowSecs) * 100)}%`, background: isTimerExceeded ? "#DC2626" : "#16A34A", transition: "width 1s linear" }} />
                          </div>
                        )}
                        {overSecs > 0 && (
                          <span style={{ fontSize: 10, color: "#DC2626", fontWeight: 600 }}>+{fmtSecs(overSecs)} over deadline</span>
                        )}
                        {remainingSecs !== null && !isTimerExceeded && (
                          <span style={{ fontSize: 10, color: remainingSecs < 600 ? "#D97706" : "#16A34A", fontWeight: 600 }}>{fmtSecs(remainingSecs)} remaining</span>
                        )}
                      </div>
                    </InfoRow>
                  )}

                  {liveDeadlineStr && (
                    <InfoRow label="Due at">
                      <span style={{ fontWeight: 600, color: isTimerExceeded ? "#DC2626" : "#1F2937" }}>{liveDeadlineStr}</span>
                    </InfoRow>
                  )}
                </>
              )}

              {/* Calendar deadline (non-timer) */}
              {task.dueDate && !task.hasTimer && !task.fixedDeadline && (
                <InfoRow label="Due Date">
                  {fmtDate(task.dueDate)}
                </InfoRow>
              )}
            </>
          )}

          {/* ── SECTION: COMPLETION STATUS ── */}
          {compLabel && (
            <>
              <Section title="Review Status" />
              <div style={{ padding: "10px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", background: `${compColor}11`, border: `1px solid ${compColor}33`, borderRadius: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: compColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: compColor }}>{compLabel}</span>
                </div>
                {rejReason && (
                  <div style={{ marginTop: 6, padding: "8px 10px", background: "#FEF2F2", border: "1px solid #FECDD3", borderRadius: 6, fontSize: 11, color: "#991B1B", lineHeight: 1.5 }}>
                    <strong>Reason:</strong> {rejReason}
                  </div>
                )}
                {task.completionSubmission?.message && (
                  <div style={{ marginTop: 6, padding: "8px 10px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 11, color: "#374151", lineHeight: 1.5 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", marginBottom: 4 }}>Submission note</div>
                    {task.completionSubmission.message}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── SECTION: PROGRESS ── */}
          {!task.isFolder && (
            <>
              <Section title="Progress" />
              <div style={{ padding: "10px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "#6B7280" }}>Overall completion</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: pctColor || BRAND }}>{pct || 0}%</span>
                </div>
                <div style={{ height: 5, background: "#F1F5F9", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 99, width: `${pct || 0}%`, background: pctGradient || BRAND, transition: "width 0.6s ease" }} />
                </div>
              </div>
            </>
          )}

          {/* ── SECTION: TIMER CONTROL (assignee, in progress) ── */}
          {isAssignee && isConfirmed && isStarted && !task.isFolder && task.hasTimer && !task.isRepeat && !task.isThirdParty && !task.isGoal && (
            <>
              <Section title="Timer" />
              <div style={{ padding: "10px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Live time display */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: isRunningThis ? "#F0FDF4" : "#F8FAFC", border: `1px solid ${isRunningThis ? "#BBF7D0" : "#E5E7EB"}`, borderRadius: 6 }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", marginBottom: 3 }}>Time Worked</div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace", color: isRunningThis ? "#16A34A" : "#1F2937", letterSpacing: "0.04em" }}>
                      {formatTimeHMS ? formatTimeHMS(workedSecs) : fmtSecs(workedSecs)}
                    </div>
                  </div>
                  <button
                    disabled={(timerBlocked && !isRunningThis) || isTimerExceeded}
                    onClick={() => isRunningThis ? timerPause?.(task.taskId, task.title) : timerStart?.(task.taskId, task.title)}
                    style={{
                      padding: "7px 14px", borderRadius: 6, border: "none", cursor: (timerBlocked && !isRunningThis) || isTimerExceeded ? "not-allowed" : "pointer",
                      fontFamily: F, fontSize: 11, fontWeight: 600, transition: "all 0.15s",
                      opacity: (timerBlocked && !isRunningThis) || isTimerExceeded ? 0.4 : 1,
                      background: isRunningThis ? "#DCFCE7" : "#EBF2FA",
                      color: isRunningThis ? "#16A34A" : BRAND,
                    }}>
                    {isRunningThis ? "⏸ Pause" : "▶ Resume"}
                  </button>
                </div>
                {isTimerExceeded && (
                  <div style={{ padding: "8px 10px", background: "#FEF2F2", border: "1px solid #FECDD3", borderRadius: 6, fontSize: 11, color: "#991B1B", lineHeight: 1.5 }}>
                    Deadline exceeded. Request an extension to continue working.
                  </div>
                )}
                {timerBlocked && !isRunningThis && !isTimerExceeded && (
                  <div style={{ padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, fontSize: 11, color: "#92400E" }}>
                    Another task is currently running. Pause it first.
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── SECTION: WORKFLOW ACTIONS ── */}
          {!task.isFolder && (
            <>
              <Section title="Actions" />
              <div style={{ padding: "10px 0", display: "flex", flexDirection: "column", gap: 6 }}>

                {/* ── DEADLINE ALERT BANNER (top of actions) ── */}
                {isFixedDeadlinePassed && (
                  <div style={{ padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FECDD3", borderRadius: 6, fontSize: 11, color: "#991B1B", lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>⚠️ Deadline Passed</div>
                    <div>Original deadline: <strong>{fmtDateTime(task.fixedDeadline)}</strong></div>
                    {task.deadlineExtRequest?.status === "pending" && (
                      <>
                        <div style={{ marginTop: 4, color: "#D97706", fontWeight: 600 }}>Extension request pending approval.</div>
                        {task.deadlineExtRequest?.proposedDate && (
                          <div style={{ marginTop: 2, color: "#92400E" }}>Requested new deadline: <strong>{fmtDateTime(task.deadlineExtRequest.proposedDate)}</strong></div>
                        )}
                      </>
                    )}
                    {task.deadlineExtRequest?.status === "approved" && (
                      <div style={{ marginTop: 4, color: "#16A34A", fontWeight: 600 }}>Extension approved — new deadline: <strong>{fmtDateTime(task.fixedDeadline)}</strong></div>
                    )}
                  </div>
                )}

                {/* ── UPCOMING DEADLINE NOTICE (when not passed but due soon) ── */}
                {!isFixedDeadlinePassed && task.fixedDeadline && ["in_progress", "confirmed"].includes(status) && (() => {
                  const msLeft = new Date(task.fixedDeadline) - new Date();
                  const hoursLeft = msLeft / 3600000;
                  if (hoursLeft > 24) return null;
                  const color = hoursLeft <= 2 ? "#DC2626" : hoursLeft <= 8 ? "#D97706" : "#2563EB";
                  const bg = hoursLeft <= 2 ? "#FEF2F2" : hoursLeft <= 8 ? "#FFFBEB" : "#EFF6FF";
                  const border = hoursLeft <= 2 ? "#FECDD3" : hoursLeft <= 8 ? "#FDE68A" : "#BFDBFE";
                  const label = hoursLeft <= 0 ? "Deadline passed!" : hoursLeft < 1 ? `${Math.round(msLeft / 60000)} min remaining` : `${hoursLeft.toFixed(1)}h remaining`;
                  return (
                    <div style={{ padding: "10px 12px", background: bg, border: `1px solid ${border}`, borderRadius: 6, fontSize: 11, color, lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>🔔 Deadline Soon</div>
                      <div>Due: <strong>{fmtDateTime(task.fixedDeadline)}</strong></div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>{label}</div>
                    </div>
                  );
                })()}

                {/* ── EMPLOYEE: pre-confirm deadline flow ── */}
                {isAssignee && !isConfirmed && !task.isGoal && !task.isThirdParty && !task.isRepeat && (
                  <>
                    {/* Timer task: propose deadline */}
                    {task.hasTimer === true && status === "open" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.5 }}>
                          Propose how long you need to complete this task. Your TL will approve before you start.
                        </div>
                        {task.deadlineProposalRejected && (
                          <div style={{ padding: "7px 10px", background: "#FEF2F2", border: "1px solid #FECDD3", borderRadius: 6, fontSize: 11, color: "#991B1B", lineHeight: 1.4 }}>
                            Previous proposal was rejected: {task.deadlineRejectionReason || "Please propose a new deadline."}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="number" min="1" max="999" placeholder="Duration"
                            value={df.proposedDurationVal || ""}
                            onChange={e => df.setDurationVal?.(e.target.value)}
                            style={{ flex: 1, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                          <select value={df.proposedDurationUnit || "hours"}
                            onChange={e => df.setDurationUnit?.(e.target.value)}
                            style={{ width: 72, padding: "7px 6px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, background: "#fff", outline: "none", cursor: "pointer" }}>
                            <option value="minutes">min</option>
                            <option value="hours">hrs</option>
                            <option value="days">days</option>
                          </select>
                        </div>
                        <ActionBtn onClick={df.onPropose} busy={df.proposing} disabled={!df.proposedDurationVal}>
                          Submit Deadline for Approval
                        </ActionBtn>
                      </div>
                    )}

                    {/* Awaiting TL approval */}
                    {status === "pending_deadline_approval" && (
                      <div style={{ padding: "10px 12px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, fontSize: 11, color: "#92400E", lineHeight: 1.5 }}>
                        Your deadline proposal is awaiting approval from your TL. Use the Draft Chat to discuss in the meantime.
                        {task.proposedDeadline && <div style={{ marginTop: 4, fontWeight: 600 }}>Proposed: {fmtSecs(Number(task.proposedDurationSecs) || 0)}</div>}
                      </div>
                    )}

                    {/* TL counter-proposal: employee responds */}
                    {status === "pending_employee_deadline_confirmation" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ padding: "10px 12px", background: "#EBF2FA", border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 11, color: "#1E40AF", lineHeight: 1.5 }}>
                          Your TL suggested a different deadline:
                          {task.counterProposalSecs && <span style={{ fontWeight: 700, marginLeft: 4 }}>{fmtSecs(Number(task.counterProposalSecs))}</span>}
                          {task.counterProposalMessage && <div style={{ marginTop: 3, color: "#374151" }}>{task.counterProposalMessage}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <ActionBtn variant="primary" onClick={() => df.handleRespondToCounter?.("accept")} busy={df.respondBusy}>
                            Accept TL's Suggestion
                          </ActionBtn>
                          <ActionBtn variant="ghost" onClick={() => df.setShowEmpCounterForm?.(v => !v)}>
                            Counter
                          </ActionBtn>
                        </div>
                        {df.showEmpCounterForm && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6 }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <input type="number" min="1" placeholder="Duration"
                                value={df.empCounterDurationVal || ""} onChange={e => df.setEmpCounterDurationVal?.(e.target.value)}
                                style={{ flex: 1, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                              <select value={df.empCounterDurationUnit || "hours"} onChange={e => df.setEmpCounterDurationUnit?.(e.target.value)}
                                style={{ width: 72, padding: "7px 6px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, background: "#fff", outline: "none", cursor: "pointer" }}>
                                <option value="minutes">min</option>
                                <option value="hours">hrs</option>
                                <option value="days">days</option>
                              </select>
                            </div>
                            <input placeholder="Message (optional)" value={df.empCounterMsg || ""}
                              onChange={e => df.setEmpCounterMsg?.(e.target.value)}
                              style={{ padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                            <ActionBtn onClick={() => df.handleRespondToCounter?.("counter")} busy={df.respondBusy} disabled={!df.empCounterDurationVal}>
                              Send Counter Proposal
                            </ActionBtn>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Deadline approved → Confirm task */}
                    {(status === "deadline_approved" || (!task.hasTimer && status === "open" && task.dueDate)) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {task.dueDate && liveDeadlineStr && (
                          <div style={{ fontSize: 11, color: "#374151" }}>
                            Deadline approved: <strong>{liveDeadlineStr}</strong>
                          </div>
                        )}
                        <ActionBtn onClick={() => handleAction("confirm")} busy={actionBusy}>
                          Confirm &amp; Accept Task
                        </ActionBtn>
                      </div>
                    )}

                    {/* Fixed deadline task confirm */}
                    {!task.hasTimer && !task.dueDate && task.fixedDeadline && (
                      <ActionBtn onClick={() => handleAction("confirm")} busy={actionBusy}>
                        Confirm &amp; Accept Task
                      </ActionBtn>
                    )}

                    {/* Goal task confirm */}
                    {task.isGoal && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.5 }}>
                          Review the goal targets in the Goal Progress tab. Once confirmed, chat unlocks and you can start logging progress.
                        </div>
                        <ActionBtn onClick={() => handleAction("confirm")} busy={actionBusy}>
                          Confirm &amp; Accept Goal
                        </ActionBtn>
                      </div>
                    )}

                    {/* Third-party task confirm */}
                    {task.isThirdParty && (
                      <ActionBtn onClick={() => handleAction("confirm")} busy={actionBusy}>
                        Confirm &amp; Accept Task
                      </ActionBtn>
                    )}

                    {/* Self-assigned: waiting for approver */}
                    {task.isSelfAssigned && task.selfAssignApproved !== true && status === "open" && (
                      <div style={{ padding: "10px 12px", background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 6, fontSize: 11, color: "#5B21B6", lineHeight: 1.5 }}>
                        Waiting for <strong>{task.approverName || "your approver"}</strong> to approve this self-assigned task.
                      </div>
                    )}
                  </>
                )}

                {/* ── EMPLOYEE: confirmed, not started → Start Working ── */}
                {isAssignee && isConfirmed && !isStarted && status === "confirmed" && (
                  <ActionBtn onClick={() => handleAction("start")} busy={actionBusy}>
                    Start Working
                  </ActionBtn>
                )}

                {/* ── EMPLOYEE: waiting for new deadline (extension pending) ── */}
                {isAssignee && status === "pending_deadline_approval" && isConfirmed && (
                  <div style={{ padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, fontSize: 11, color: "#92400E" }}>
                    Work paused — waiting for deadline extension approval.
                  </div>
                )}

                {/* ── EMPLOYEE: in progress actions ── */}
                {isAssignee && status === "in_progress" && !task.isRepeat && !task.isThirdParty && !task.isGoal && (
                  <>
                    <ActionBtn variant="outline" onClick={() => handleAction("report")}>
                      Submit Daily Report
                    </ActionBtn>
                  </>
                )}

                {/* ── EMPLOYEE: submit for review ── */}
                {isAssignee && isStarted && !task.isGoal && !task.isThirdParty && !task.isRepeat && !compStatus && (
                  <ActionBtn onClick={() => handleAction("submit_completion")} busy={actionBusy}>
                    Submit for Review
                  </ActionBtn>
                )}
                {isAssignee && (compStatus === "tl_rejected" || compStatus === "ceo_rejected") && (
                  <ActionBtn onClick={() => handleAction("submit_completion")} busy={actionBusy}>
                    Re-submit for Review
                  </ActionBtn>
                )}

                {/* ── EXTENSION REQUEST (in progress, timer exceeded OR fixed deadline passed) ── */}
                {isAssignee && (isTimerExceeded || isFixedDeadlinePassed) && ["in_progress", "confirmed"].includes(status) && !task.isFolder && (
                  <>
                    {!ef.showExtReqForm ? (
                      <ActionBtn variant="outline" onClick={() => ef.setShowExtReqForm?.(true)}>
                        Request Deadline Extension
                      </ActionBtn>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>Request Extension</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="date" value={ef.extReqDate || ""} onChange={e => ef.setExtReqDate?.(e.target.value)} min={new Date().toISOString().split("T")[0]}
                            style={{ flex: 1, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                          <input type="time" value={ef.extReqTime || "23:59"} onChange={e => ef.setExtReqTime?.(e.target.value)}
                            style={{ width: 90, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                        </div>
                        <textarea placeholder="Reason for extension"
                          value={ef.extReqReason || ""} onChange={e => ef.setExtReqReason?.(e.target.value)} rows={2}
                          style={{ padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none", resize: "vertical" }} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <ActionBtn variant="ghost" onClick={() => ef.setShowExtReqForm?.(false)}>Cancel</ActionBtn>
                          <ActionBtn onClick={ef.handleRequestExtension} busy={ef.extReqBusy} disabled={!ef.extReqDate}>
                            Send Request
                          </ActionBtn>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── TL: deadline proposal actions ── */}
                {isTL && !isCEO && status === "pending_deadline_approval" && !task.isFolder && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, color: "#374151" }}>
                      Employee's deadline proposal:
                      {task.proposedDurationSecs && <strong style={{ marginLeft: 4 }}>{fmtSecs(Number(task.proposedDurationSecs))}</strong>}
                    </div>
                    {!df.showCounterForm ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <ActionBtn variant="primary" onClick={df.onApprove} busy={df.approving}>
                          Approve
                        </ActionBtn>
                        <ActionBtn variant="ghost" onClick={() => df.setShowCounterForm?.(true)}>
                          Suggest Different
                        </ActionBtn>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>Suggest a different duration</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="number" min="1" placeholder="Duration"
                            value={df.counterDurationVal || ""} onChange={e => df.setCounterDurationVal?.(e.target.value)}
                            style={{ flex: 1, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                          <select value={df.counterDurationUnit || "hours"} onChange={e => df.setCounterDurationUnit?.(e.target.value)}
                            style={{ width: 72, padding: "7px 6px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, background: "#fff", outline: "none", cursor: "pointer" }}>
                            <option value="minutes">min</option>
                            <option value="hours">hrs</option>
                            <option value="days">days</option>
                          </select>
                        </div>
                        <input placeholder="Message to employee (optional)" value={df.counterMessage || ""}
                          onChange={e => df.setCounterMessage?.(e.target.value)}
                          style={{ padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <ActionBtn variant="ghost" onClick={() => df.setShowCounterForm?.(false)}>Cancel</ActionBtn>
                          <ActionBtn onClick={df.handleTlCounterPropose} busy={df.counterBusy} disabled={!df.counterDurationVal}>
                            Send Suggestion
                          </ActionBtn>
                        </div>
                      </div>
                    )}

                    {/* TL: reject deadline */}
                    {!df.showRejectInput ? (
                      <ActionBtn variant="ghost" danger onClick={() => df.setShowRejectInput?.(true)}>
                        Reject Proposal
                      </ActionBtn>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <textarea placeholder="Reason for rejection" value={df.rejectReason || ""}
                          onChange={e => df.setRejectReason?.(e.target.value)} rows={2}
                          style={{ padding: "7px 10px", border: "1px solid #FECDD3", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none", resize: "vertical" }} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <ActionBtn variant="ghost" onClick={() => df.setShowRejectInput?.(false)}>Cancel</ActionBtn>
                          <ActionBtn danger onClick={() => df.setShowRejectInput?.(false)} disabled={!df.rejectReason?.trim()}>
                            Confirm Rejection
                          </ActionBtn>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── TL/CEO: extension request review ── */}
                {(isTL || isCEO) && (task.pendingExtension || task.deadlineExtRequest?.status === "pending") && !task.isFolder && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ padding: "10px 12px", background: "#EBF2FA", border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 11, color: "#1E40AF", lineHeight: 1.5 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>⏰ Deadline Extension Request</div>
                      <div>From: <strong>{task.deadlineExtRequest?.requestedByName || "Employee"}</strong></div>
                      {task.deadlineExtRequest?.proposedDate && <div>Proposed new deadline: <strong>{new Date(task.deadlineExtRequest.proposedDate).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</strong></div>}
                      {task.deadlineExtRequest?.reason && <div style={{ marginTop: 3, color: "#374151" }}>Reason: {task.deadlineExtRequest.reason}</div>}
                      {task.extensionReason && <div style={{ marginTop: 3, color: "#374151" }}>Reason: {task.extensionReason}</div>}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>Set new deadline:</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="date" value={ef.reviewExtDate || ""} onChange={e => ef.setReviewExtDate?.(e.target.value)} min={new Date().toISOString().split("T")[0]}
                        style={{ flex: 1, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                      <input type="time" value={ef.reviewExtTime || "23:59"} onChange={e => ef.setReviewExtTime?.(e.target.value)}
                        style={{ width: 90, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <ActionBtn variant="ghost" danger onClick={() => ef.handleReviewExtension?.("reject", "")} busy={ef.reviewExtBusy}>
                        Reject
                      </ActionBtn>
                      <ActionBtn variant="outline" onClick={() => ef.handleReviewExtension?.("counter", ef.reviewExtDate + "T" + (ef.reviewExtTime || "23:59"))} busy={ef.reviewExtBusy} disabled={!ef.reviewExtDate}>
                        Suggest Date
                      </ActionBtn>
                      <ActionBtn onClick={() => ef.handleReviewExtension?.("approve", "")} busy={ef.reviewExtBusy}>
                        Approve
                      </ActionBtn>
                    </div>
                  </div>
                )}



                {/* ── TL: review completion ── */}
                {isTL && !isCEO && compStatus === "submitted" && task.reviewFlow !== "ceo_direct" && (
                  <ActionBtn onClick={() => handleAction("review_completion")} busy={actionBusy}>
                    Review Submission
                  </ActionBtn>
                )}

                {/* ── CEO: review completion ── */}
                {isCEO && (compStatus === "tl_approved" || (compStatus === "submitted" && task.reviewFlow === "ceo_direct")) && (
                  <ActionBtn onClick={() => handleAction("ceo_review")} busy={actionBusy}>
                    Review &amp; Approve
                  </ActionBtn>
                )}

                {/* ── CEO: edit deadline ── */}
                {isCEO && !task.isFolder && (
                  <ActionBtn variant="ghost" onClick={() => handleAction("deadline")}>
                    Edit Deadline
                  </ActionBtn>
                )}

                {/* ── TL/CEO: forward task ── */}
                {(isTL || isCEO) && !task.isFolder && (
                  <ActionBtn variant="ghost" onClick={() => handleAction("forward")}>
                    Forward / Split Task
                  </ActionBtn>
                )}

                {/* ── CEO: delete ── */}
                {isCEO && !task.isFolder && (
                  <ActionBtn variant="ghost" danger onClick={() => handleAction("delete")}>
                    Delete Task
                  </ActionBtn>
                )}

                {/* ── Nothing to show ── */}
                {!isAssignee && !isTL && !isCEO && (
                  <div style={{ fontSize: 11, color: "#9CA3AF", padding: "8px 0" }}>No actions available for your role.</div>
                )}

              </div>
            </>
          )}

        </div>
      )}
    </div>
  );
}

// changed in the page.js