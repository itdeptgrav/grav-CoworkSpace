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

    if (diff < 0) return {
        status: "overdue",
        color: "#d93025", bg: "#fce8e6",
        label: `Overdue by ${Math.ceil(Math.abs(diff) / 86400000)}d`,
        icon: "🔴",
    };
    if (diff < twoDays) return {
        status: "near",
        color: "#b06000", bg: "#fef7e0",
        label: diff < 86400000
            ? `Due in ${Math.ceil(diff / 3600000)}h`
            : `Due tomorrow`,
        icon: "🟠",
    };
    return {
        status: "safe",
        color: "#1e8e3e", bg: "#e6f4ea",
        label: `Due ${new Date(dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`,
        icon: "🟢",
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