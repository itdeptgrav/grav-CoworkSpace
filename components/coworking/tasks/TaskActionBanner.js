/**
 * components/coworking/tasks/TaskActionBanner.jsx
 */
"use client";
import React from "react";

function fmtSecs(s) {
  if (!s) return "0m";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0)  return `${h}h ${m}m`;
  return `${m}m`;
}

export default function TaskActionBanner({
  task,
  employeeId,
  isCEO,
  isTL,
  isAssignee,
  isConfirmed,
  isStarted,
  actionBusy,
  handleAction,
  getDisplaySeconds,
  timerActiveTaskId,
  handleTimerStart,
  handleTimerPause,
}) {
  if (!task || task.isFolder) return null;

  const status = task.status;
  const comp   = task.completionStatus;

  let banner = null;

  // ── 1. Completion review needed (CEO / TL) ──────────────────────────────
  if (!banner && isCEO && comp === "submitted" && task.reviewFlow === "ceo_direct") {
    banner = {
      color: "#1B4F8A", bg: "#EBF2FA", border: "#BFDBFE", icon: "⭐",
      text: "This task has been submitted and is awaiting your final review.",
      cta: "Review Submission", action: () => handleAction("review_completion"),
    };
  }

  if (!banner && isCEO && comp === "tl_approved" && task.reviewFlow === "tl_then_ceo") {
    banner = {
      color: "#1B4F8A", bg: "#EBF2FA", border: "#BFDBFE", icon: "⭐",
      text: "TL has approved this submission. Your final CEO approval is needed.",
      cta: "CEO Final Approval", action: () => handleAction("ceo_review"),
    };
  }

  if (!banner && isTL && comp === "submitted" && ["tl_final","tl_then_ceo",null,undefined].includes(task.reviewFlow)) {
    banner = {
      color: "#1B4F8A", bg: "#EBF2FA", border: "#BFDBFE", icon: "⭐",
      text: "The employee has submitted this task for your review.",
      cta: "Review Submission", action: () => handleAction("review_completion"),
    };
  }

  if (!banner && (isCEO || isTL) && task.isThirdParty && comp === "submitted" && status !== "done") {
    banner = {
      color: "#059669", bg: "#F0FDF4", border: "#BBF7D0", icon: "✅",
      text: "The assignee has marked this third-party task as resolved. Approve to close it.",
      cta: "Mark as Completed", action: () => handleAction("third_party_complete"),
    };
  }

  // ── 2. Deadline proposal review (creator / TL) ──────────────────────────
  if (!banner && status === "pending_deadline_approval" && task.assignedBy === employeeId) {
    const fmt = (s) => { if (!s) return "?"; if (s < 60) return `${s}s`; if (s < 3600) return `${Math.round(s/60)} min`; if (s < 86400) return `${Math.round(s/3600)}h`; return `${Math.round(s/86400)}d`; };
    const total = Number(task.deadlineWindowSecs) || 0;
    const delta = Number(task.pendingExtensionSecs) || 0;
    const asked = delta > 0 ? `+${fmt(delta)} extra` : `${fmt(total)}`;
    banner = {
      color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", icon: "📅",
      text: `${task.proposedDeadlineByName || "The assignee"} requested ${asked}. Approve, suggest a different duration, or reject.`,
      cta: "Review Proposal", action: () => handleAction("deadline"),
    };
  }

  // ── 3. Employee needs to respond to TL counter ──────────────────────────
  if (!banner && isAssignee && status === "pending_employee_deadline_confirmation") {
    const w = task.tlCounterWindowSecs;
    const label = w ? (w < 3600 ? `${Math.round(w/60)}m` : w < 86400 ? `${Math.round(w/3600)}h` : `${Math.round(w/86400)}d`) : "a new duration";
    banner = {
      color: "#6D28D9", bg: "#F5F3FF", border: "#DDD6FE", icon: "📅",
      text: `${task.tlCounterDeadlineByName || "Your TL"} suggested ${label}. Accept or propose a different amount.`,
      cta: null,
    };
  }

  // ── 4. Goal / third-party / repeat confirm needed (employee) ────────────
  // These special task types still use a plain confirm (no timer start merged)
  if (!banner && isAssignee && !isConfirmed) {
    if (task.isGoal) {
      banner = {
        color: "#7E22CE", bg: "#FAF5FF", border: "#E9D5FF", icon: "🎯",
        text: "Review the goal target and confirm to unlock the chat and begin tracking progress.",
        cta: "Confirm Goal Task", action: () => handleAction("confirm"),
      };
    } else if (task.isThirdParty) {
      banner = {
        color: "#6D28D9", bg: "#F5F3FF", border: "#DDD6FE", icon: "🔗",
        text: "Review vendor details and confirm this task to start logging updates.",
        cta: "Confirm Task", action: () => handleAction("confirm"),
      };
    } else if (task.isRepeat) {
      banner = {
        color: "#1B4F8A", bg: "#EBF2FA", border: "#BFDBFE", icon: "🔁",
        text: "Review the repeat schedule and confirm to start submitting daily.",
        cta: "Confirm Task", action: () => handleAction("confirm"),
      };
    }
  }

  // ── 5. Fixed-deadline task (no timer) — Confirm & Start directly ─────────
  if (!banner && isAssignee && !isConfirmed && task.hasTimer === false && status === "open" && !task.isSelfAssigned) {
    banner = {
      color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0", icon: "▶",
      text: task.fixedDeadline
        ? `Deadline: ${new Date(task.fixedDeadline).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}. Tap to confirm and start.`
        : "Review the task and confirm to start working.",
      cta: "Confirm & Start", action: () => handleAction("confirm_and_start"),
    };
  }

  // ── 6. Timer task — deadline approved, Confirm & Start ──────────────────
  if (!banner && isAssignee && !isConfirmed && task.hasTimer === true &&
      ["deadline_approved", "confirmed"].includes(status)) {
    const rem = task.deadlineWindowSecs
      ? task.deadlineWindowSecs - (getDisplaySeconds?.(task.taskId) || 0)
      : null;
    const remStr = rem !== null ? (rem > 0 ? `${fmtSecs(rem)} remaining` : "deadline passed") : "";
    banner = {
      color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0", icon: "▶",
      text: `Deadline approved${remStr ? ` · ${remStr}` : ""}. Confirm and start working.`,
      cta: "Confirm & Start", action: () => handleAction("confirm_and_start"),
    };
  }

  // ── 7. Timer task — open, needs deadline proposal ───────────────────────
  if (!banner && isAssignee && !isConfirmed && task.hasTimer === true && status === "open" && !task.isSelfAssigned) {
    banner = {
      color: "#1B4F8A", bg: "#EBF2FA", border: "#BFDBFE", icon: "⏱",
      text: "Propose how much time you need for this task. Enter a duration below — your manager will approve before you start.",
      cta: null,
    };
  }

  // ── 8. Awaiting TL approval (employee) ──────────────────────────────────
  if (!banner && isAssignee && status === "pending_deadline_approval") {
    const fmt = (s) => { if (!s) return "?"; if (s < 60) return `${s}s`; if (s < 3600) return `${Math.round(s/60)} min`; if (s < 86400) return `${Math.round(s/3600)}h`; return `${Math.round(s/86400)}d`; };
    const total = Number(task.deadlineWindowSecs) || 0;
    banner = {
      color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", icon: "⏳",
      text: `Your request for ${fmt(total)} is waiting for approval. You can discuss in the Draft Chat meanwhile.`,
      cta: null,
    };
  }

  // ── 9. REMOVED: "Confirmed but not started" step is eliminated ──────────
  // confirm_and_start jumps straight to in_progress, so status "confirmed"
  // is skipped entirely for regular tasks. No banner needed here.

  // ── 10. TIMER TASK in progress — Play/Pause + worked/total bar ──────────
  if (!banner && isAssignee && isStarted && status === "in_progress" && task.deadlineWindowSecs > 0 &&
      !["submitted","tl_approved","tl_final_approved","ceo_approved"].includes(comp)) {
    const isRunning = timerActiveTaskId === task.taskId;
    const worked    = getDisplaySeconds?.(task.taskId) || 0;
    const total     = task.deadlineWindowSecs || 0;
    const remaining = Math.max(0, total - worked);
    const isOver    = worked >= total && total > 0;
    banner = { type: "timer", isRunning, worked, total, remaining, isOver };
  }

  // ── 11. DEADLINE TASK in progress — Submit Daily Report ─────────────────
  if (!banner && isAssignee && isStarted && status === "in_progress" &&
      !task.deadlineWindowSecs && !task.isRepeat && !task.isThirdParty && !task.isGoal &&
      !["submitted","tl_approved","tl_final_approved","ceo_approved"].includes(comp)) {
    banner = {
      color: "#1B4F8A", bg: "#EBF2FA", border: "#BFDBFE", icon: "📋",
      text: "Log your progress for today to keep your manager updated.",
      cta: "Submit Daily Report", action: () => handleAction("report"),
    };
  }

  // ── 12. Already submitted — waiting for review ──────────────────────────
  if (!banner && isAssignee && comp === "submitted") {
    banner = {
      color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", icon: "⏳",
      text: "Submitted and awaiting review by your Team Lead or CEO.",
      cta: null,
    };
  }

  // ── 13. Rejected — needs revision ───────────────────────────────────────
  if (!banner && isAssignee && (comp === "tl_rejected" || comp === "ceo_rejected")) {
    const reason = comp === "tl_rejected" ? task.tlReview?.rejectionReason : task.ceoReview?.rejectionReason;
    banner = {
      color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: "✕",
      text: reason ? `Rejected: "${reason}" — revise and resubmit.` : "Work was rejected. Revise and resubmit when ready.",
      cta: "Resubmit", action: () => handleAction("submit_completion"),
    };
  }

  if (!banner) return null;

  // ── Special render: Timer task banner ────────────────────────────────────
  if (banner.type === "timer") {
    const { isRunning, worked, total, remaining, isOver } = banner;
    const workedStr    = fmtSecs(worked);
    const totalStr     = fmtSecs(total);
    const remainingStr = fmtSecs(remaining);
    const pct          = total > 0 ? Math.min(100, Math.round((worked / total) * 100)) : 0;
    const barColor     = isOver ? "#DC2626" : pct > 80 ? "#D97706" : "#1B4F8A";

    return (
      <div style={{
        padding: "10px 14px",
        background: isOver ? "#FEF2F2" : "#F8FAFC",
        borderBottom: `1px solid ${isOver ? "#FECACA" : "#E2E8F0"}`,
        flexShrink: 0,
        fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif",
      }}>
        {/* Row: play/pause + time info + submit button */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

          {/* Play / Pause */}
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => isRunning
              ? handleTimerPause?.(task.taskId, task.title)
              : handleTimerStart?.(task.taskId, task.title)
            }
            style={{
              width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
              border: `1.5px solid ${isRunning ? "#BBF7D0" : "#1B4F8A"}`,
              background: isRunning ? "#DCFCE7" : "#1B4F8A",
              color: isRunning ? "#16A34A" : "#fff",
              cursor: actionBusy ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s", opacity: actionBusy ? 0.6 : 1,
            }}
            title={isRunning ? "Pause timer" : "Resume timer"}
          >
            {isRunning ? (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="1.5" width="3" height="9" rx="1" />
                <rect x="7" y="1.5" width="3" height="9" rx="1" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2.5 1.5l8 4.5-8 4.5V1.5z" />
              </svg>
            )}
          </button>

          {/* Time info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {isRunning && (
                <span style={{
                  width: 7, height: 7, borderRadius: "50%", background: "#16A34A",
                  display: "inline-block", flexShrink: 0,
                  animation: "tab-banner-pulse 1.4s ease-in-out infinite",
                }} />
              )}
              <span style={{ fontSize: 12, fontWeight: 700, color: isOver ? "#DC2626" : "#0F172A", fontFamily: "monospace" }}>
                {workedStr}
              </span>
              <span style={{ fontSize: 11, color: "#94A3B8" }}>of</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B", fontFamily: "monospace" }}>
                {totalStr}
              </span>
              {isOver ? (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", background: "#FEE2E2", padding: "1px 7px", borderRadius: 99 }}>
                  {fmtSecs(worked - total)} over
                </span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 600, color: pct > 80 ? "#D97706" : "#6B7280", background: pct > 80 ? "#FFFBEB" : "#F1F5F9", padding: "1px 7px", borderRadius: 99 }}>
                  {remainingStr} left
                </span>
              )}
            </div>
          </div>

          {/* Submit button */}
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => handleAction("submit_completion")}
            style={{
              flexShrink: 0, padding: "5px 12px",
              border: "1px solid #1B4F8A44", borderRadius: 5,
              background: "#fff", color: "#1B4F8A",
              fontSize: 11, fontWeight: 600,
              cursor: actionBusy ? "not-allowed" : "pointer",
              fontFamily: "inherit", opacity: actionBusy ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
            onMouseEnter={e => { if (!actionBusy) e.currentTarget.style.background = "#EBF2FA"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
          >
            Submit
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 8, height: 3, background: "#E2E8F0", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: barColor, borderRadius: 99,
            transition: "width 1s linear",
          }} />
        </div>

        <style>{`
          @keyframes tab-banner-pulse {
            0%,100% { opacity:1; transform:scale(1); }
            50% { opacity:0.4; transform:scale(0.7); }
          }
        `}</style>
      </div>
    );
  }

  // ── Standard banner render ────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px 14px",
      background: banner.bg,
      borderBottom: `1px solid ${banner.border}`,
      flexShrink: 0,
      fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif",
    }}>
      {banner.pulse ? (
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: banner.color, flexShrink: 0,
          animation: "tab-banner-pulse 1.6s ease-in-out infinite",
        }} />
      ) : (
        <span style={{ fontSize: 13, flexShrink: 0, lineHeight: 1 }}>{banner.icon}</span>
      )}

      <span style={{
        flex: 1, fontSize: 11, color: banner.color,
        fontWeight: 500, lineHeight: 1.45,
        overflow: "hidden", display: "-webkit-box",
        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
      }}>
        {banner.text}
      </span>

      {banner.cta && (
        <button
          type="button"
          disabled={actionBusy}
          onClick={banner.action}
          style={{
            flexShrink: 0, padding: "5px 12px",
            border: `1px solid ${banner.color}44`, borderRadius: 5,
            background: banner.color, color: "#fff",
            fontSize: 11, fontWeight: 600,
            cursor: actionBusy ? "not-allowed" : "pointer",
            fontFamily: "inherit", opacity: actionBusy ? 0.6 : 1,
            transition: "opacity 0.12s", whiteSpace: "nowrap",
          }}
          onMouseEnter={e => { if (!actionBusy) e.currentTarget.style.opacity = "0.85"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
        >
          {actionBusy ? "…" : banner.cta}
        </button>
      )}

      <style>{`
        @keyframes tab-banner-pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.4; transform:scale(0.7); }
        }
      `}</style>
    </div>
  );
}