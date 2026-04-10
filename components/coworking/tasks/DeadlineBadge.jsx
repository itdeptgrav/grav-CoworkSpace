/**
 * GRAV-CMS/components/coworking/tasks/DeadlineBadge.jsx
 * Shows deadline with color coding: green / orange / red
 */
"use client";

export function getDeadlineInfo(dueDate) {
    if (!dueDate) return { status: "none", color: "#80868b", bg: "#f1f3f4", label: "No deadline" };
    const now = Date.now();
    const due = new Date(dueDate).getTime();
    const diff = due - now;
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    // Show time only if a time component is present (not midnight/default)
    const hasTime = dueDate.includes("T") && !/T00:00/.test(dueDate);
    const timeStr = hasTime
        ? new Date(dueDate).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
        : null;
    const dateStr = new Date(dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    const fullStr = timeStr ? `${dateStr}, ${timeStr}` : dateStr;

    if (diff < 0) {
        const absMs = Math.abs(diff);
        const overdueLabel = absMs < 3600000
            ? `Overdue by ${Math.ceil(absMs / 60000)}m`
            : absMs < 86400000
                ? `Overdue by ${Math.ceil(absMs / 3600000)}h`
                : `Overdue by ${Math.ceil(absMs / 86400000)}d`;
        return { status: "overdue", color: "#d93025", bg: "#fce8e6", label: overdueLabel, icon: "🔴" };
    }
    if (diff < twoDays) return {
        status: "near", color: "#b06000", bg: "#fef7e0", icon: "🟠",
        label: diff < 3600000
            ? `Due in ${Math.ceil(diff / 60000)}m`
            : diff < 86400000
                ? `Due in ${Math.ceil(diff / 3600000)}h`
                : `Due tomorrow${timeStr ? " · " + timeStr : ""}`,
    };
    return {
        status: "safe", color: "#1e8e3e", bg: "#e6f4ea", icon: "🟢",
        label: `Due ${fullStr}`,
    };
}

export default function DeadlineBadge({ dueDate, showFull = false }) {
    const info = getDeadlineInfo(dueDate);
    if (info.status === "none") return null;

    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: "4px",
            padding: "2px 10px", borderRadius: "12px",
            fontSize: "12px", fontWeight: 500,
            color: info.color, background: info.bg,
            fontFamily: "'Google Sans', sans-serif",
            border: `1px solid ${info.color}22`,
        }}>
            {info.icon} {info.label}
        </span>
    );
}