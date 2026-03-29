/**
 * GRAV-CMS/components/coworking/tasks/TaskCard.jsx
 * ALL features preserved + new completion flow + CEO delete.
 * Click card → navigate to task detail page.
 */
"use client";
import { useRouter } from "next/navigation";
import DeadlineBadge, { getDeadlineInfo } from "./DeadlineBadge";

const STATUS = {
    open: { label: "Open", color: "#80868b", bg: "#f1f3f4" },
    confirmed: { label: "Confirmed", color: "#1a73e8", bg: "#e8f0fe" },
    in_progress: { label: "In Progress", color: "#b06000", bg: "#fef7e0" },
    done: { label: "Done ✓", color: "#1e8e3e", bg: "#e6f4ea" },
};

const PRIORITY = {
    low: { label: "Low", color: "#1e8e3e" },
    medium: { label: "Medium", color: "#f9ab00" },
    high: { label: "High", color: "#d93025" },
};

const COMPLETION = {
    submitted: { label: "⏳ TL Review Pending", color: "#b06000", bg: "#fef7e0" },
    tl_approved: { label: "✅ TL Approved · CEO Review", color: "#1a73e8", bg: "#e8f0fe" },
    tl_rejected: { label: "❌ TL Rejected", color: "#d93025", bg: "#fce8e6" },
    ceo_approved: { label: "🎉 CEO Approved · Complete!", color: "#1e8e3e", bg: "#e6f4ea" },
    ceo_rejected: { label: "❌ CEO Rejected", color: "#d93025", bg: "#fce8e6" },
};

export default function TaskCard({ task, currentEmployeeId, role, onAction }) {
    const router = useRouter();
    const deadline = getDeadlineInfo(task.dueDate);
    const status = STATUS[task.status] || STATUS.open;
    const priority = PRIORITY[task.priority] || PRIORITY.medium;
    const compInfo = task.completionStatus ? COMPLETION[task.completionStatus] : null;

    const isAssignee = task.assigneeIds?.includes(currentEmployeeId);
    const isCreator = task.assignedBy === currentEmployeeId;
    const isConfirmed = task.confirmedBy?.includes(currentEmployeeId);
    const isStarted = task.status === "in_progress" || task.status === "done";
    const isCEO = role === "ceo";
    const isTL = role === "tl";

    const borderColor =
        deadline.status === "overdue" ? "#d93025" :
            deadline.status === "near" ? "#f9ab00" : "#e8eaed";

    return (
        <div
            style={{
                background: "#fff",
                borderRadius: "12px",
                padding: "16px 20px",
                border: `1px solid ${borderColor}`,
                borderLeft: `4px solid ${borderColor === "#e8eaed" ? "#1a73e8" : borderColor}`,
                display: "flex", flexDirection: "column", gap: "12px",
                fontFamily: "'Google Sans','Roboto',sans-serif",
                cursor: "pointer",
                transition: "box-shadow 0.15s, transform 0.15s",
                boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
            }}
            onClick={() => router.push(`/coworking/tasks/${task.taskId}`)}
        >
            {/* ── Header ── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Badge row */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", flexWrap: "wrap" }}>
                        <code style={s.idCode}>{task.taskId}</code>
                        {task.isParent && <span style={s.badge("#e8f0fe", "#1a73e8")}>Parent</span>}
                        {task.subtaskIds?.length > 0 && <span style={s.badge("#f3e8fd", "#9334e9")}>📋 {task.subtaskIds.length} subtask{task.subtaskIds.length !== 1 ? "s" : ""}</span>}
                        <span style={{ fontSize: "11px", color: priority.color, fontWeight: 600 }}>⚡ {priority.label}</span>
                    </div>
                    {/* Title: "Name (T001)" */}
                    <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#202124", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {task.title} <span style={{ fontSize: "12px", fontWeight: 400, color: "#80868b" }}>({task.taskId})</span>
                    </h4>
                    {task.notes && (
                        <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#5f6368", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            📝 {task.notes}
                        </p>
                    )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px", alignItems: "flex-end", flexShrink: 0 }}>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 500, color: status.color, background: status.bg }}>
                        {status.label}
                    </span>
                    <DeadlineBadge dueDate={task.dueDate} />
                </div>
            </div>

            {/* ── Progress bar ── */}
            {task.progressPercent > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ flex: 1, height: "6px", background: "#e8eaed", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{
                            height: "100%", borderRadius: "3px",
                            width: `${task.progressPercent}%`,
                            background: task.status === "done" ? "#1e8e3e" : task.progressPercent >= 50 ? "#1a73e8" : "#f9ab00",
                            transition: "width 0.4s ease",
                        }} />
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#5f6368", minWidth: "34px", textAlign: "right" }}>
                        {task.progressPercent}%
                    </span>
                </div>
            )}

            {/* ── Completion status ── */}
            {compInfo && (
                <div style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, color: compInfo.color, background: compInfo.bg, display: "flex", alignItems: "flex-start", gap: "6px", flexWrap: "wrap" }}>
                    {compInfo.label}
                    {task.completionStatus === "tl_rejected" && task.tlReview?.rejectionReason && (
                        <span style={{ fontWeight: 400, opacity: 0.85 }}>— {task.tlReview.rejectionReason}</span>
                    )}
                    {task.completionStatus === "ceo_rejected" && task.ceoReview?.rejectionReason && (
                        <span style={{ fontWeight: 400, opacity: 0.85 }}>— {task.ceoReview.rejectionReason}</span>
                    )}
                </div>
            )}

            {/* ── Footer: meta + actions ── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ display: "flex", gap: "10px", fontSize: "12px", color: "#9aa0a6", flexWrap: "wrap" }}>
                    <span>👤 {task.assigneeIds?.length || 0} assigned</span>
                    {task.subtaskIds?.length > 0 && <span>📋 {task.subtaskIds.length} subtasks</span>}
                    {task.dailyReports?.length > 0 && <span>📊 {task.dailyReports.length} reports</span>}
                    {task.lastChatPreview && <span style={{ color: "#1a73e8" }}>💬 Chat</span>}
                </div>

                {/* Action buttons — stopPropagation */}
                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>

                    {/* ── ORIGINAL ACTIONS ── */}
                    {isAssignee && !isConfirmed && task.status === "open" && (
                        <button onClick={() => onAction("confirm", task.taskId)} style={btn("#1a73e8", "#e8f0fe", "#1a73e8")}>✓ Confirm</button>
                    )}
                    {isAssignee && isConfirmed && !isStarted && (
                        <button onClick={() => onAction("start", task.taskId)} style={btn("#1e8e3e", "#e6f4ea", "#1e8e3e")}>▶ Start</button>
                    )}
                    {isAssignee && task.status === "in_progress" && (
                        <button onClick={() => onAction("report", task.taskId)} style={btn("#f9ab00", "#fef7e0", "#b06000")}>📊 Report</button>
                    )}
                    {/* Forward — CEO and TL can forward anytime, assignee can forward */}
                    {(isAssignee || isCreator || isTL || isCEO) && task.status !== "done" && (
                        <button onClick={() => onAction("forward", task.taskId)} style={btn("#9334e9", "#f3e8fd", "#9334e9")}>↗ Forward</button>
                    )}

                    {/* ── NEW ACTIONS ── */}
                    {isAssignee && task.status === "in_progress" &&
                        !["submitted", "tl_approved", "ceo_approved"].includes(task.completionStatus) && (
                            <button onClick={() => onAction("submit_completion", task.taskId)} style={btn("#1a73e8", "#e8f0fe", "#1558d0")}>📤 Submit Work</button>
                        )}
                    {(isTL || isCEO) && task.completionStatus === "submitted" && (
                        <button onClick={() => onAction("review_completion", task.taskId)} style={btn("#f9ab00", "#fef7e0", "#b06000")}>👁 Review</button>
                    )}
                    {isCEO && task.completionStatus === "tl_approved" && (
                        <button onClick={() => onAction("ceo_review", task.taskId)} style={btn("#1e8e3e", "#e6f4ea", "#1e8e3e")}>✅ Final Review</button>
                    )}
                    {isCEO && (
                        <button onClick={() => onAction("delete", task.taskId)} style={btn("#d93025", "#fce8e6", "#d93025")}>🗑</button>
                    )}
                </div>
            </div>
        </div>
    );
}

const s = {
    idCode: { fontSize: "11px", fontFamily: "monospace", color: "#80868b", background: "#f1f3f4", padding: "2px 7px", borderRadius: "5px" },
    badge: (bg, color) => ({ fontSize: "11px", fontWeight: 500, color, background: bg, padding: "2px 8px", borderRadius: "10px" }),
};

function btn(border, bg, color) {
    return {
        padding: "5px 11px", border: `1.5px solid ${border}`, borderRadius: "8px",
        background: bg, color, fontSize: "12px", fontWeight: 500,
        cursor: "pointer", fontFamily: "'Google Sans',sans-serif", transition: "opacity 0.15s",
    };
}