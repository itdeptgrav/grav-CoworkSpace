/**
 * GRAV-CMS/components/coworking/tasks/DeadlineBadge.jsx
 * Deadline based on WORKED TIME vs deadline window — not wall clock.
 * deadline only counts when timer is running.
 */
"use client";

/**
 * getDeadlineInfo
 * @param {string} dueDate - ISO date string (still stored for reference)
 * @param {number} deadlineWindowSecs - total seconds the employee asked for
 * @param {number} workedSecs - total seconds already worked (from timer)
 */
export function getDeadlineInfo(dueDate, deadlineWindowSecs = 0, workedSecs = 0) {
    // If we have a deadline window, use worked-time mode
    if (deadlineWindowSecs > 0) {
        const remaining = deadlineWindowSecs - workedSecs;
        if (remaining <= 0) {
            const over = Math.abs(remaining);
            const overLabel = over < 3600
                ? `${Math.ceil(over / 60)}m over`
                : over < 86400
                    ? `${Math.ceil(over / 3600)}h over`
                    : `${Math.ceil(over / 86400)}d over`;
            return { status: "overdue", color: "#d93025", bg: "#fce8e6", label: `⚠ ${overLabel}`, icon: "🔴" };
        }
        const twoHours = 2 * 3600;
        if (remaining < twoHours) return {
            status: "near", color: "#b06000", bg: "#fef7e0", icon: "🟠",
            label: remaining < 3600
                ? `${Math.ceil(remaining / 60)}m left`
                : `${Math.ceil(remaining / 3600)}h left`,
        };
        return {
            status: "safe", color: "#1e8e3e", bg: "#e6f4ea", icon: "🟢",
            label: remaining < 86400
                ? `${Math.ceil(remaining / 3600)}h left`
                : `${Math.ceil(remaining / 86400)}d left`,
        };
    }

    // Fallback: no window set yet — show nothing or "no deadline"
    if (!dueDate) return { status: "none", color: "#80868b", bg: "#f1f3f4", label: "No deadline" };

    // Legacy wall-clock fallback (for tasks approved before timer concept)
    const now = Date.now();
    const diff = new Date(dueDate).getTime() - now;
    if (diff < 0) {
        const over = Math.abs(diff);
        return {
            status: "overdue", color: "#d93025", bg: "#fce8e6", icon: "🔴",
            label: over < 3600000 ? `${Math.ceil(over / 60000)}m over` : over < 86400000 ? `${Math.ceil(over / 3600000)}h over` : `${Math.ceil(over / 86400000)}d over`
        };
    }
    if (diff < 7200000) return {
        status: "near", color: "#b06000", bg: "#fef7e0", icon: "🟠",
        label: diff < 3600000 ? `${Math.ceil(diff / 60000)}m left` : `${Math.ceil(diff / 3600000)}h left`,
    };
    return {
        status: "safe", color: "#1e8e3e", bg: "#e6f4ea", icon: "🟢",
        label: diff < 86400000 ? `${Math.ceil(diff / 3600000)}h left` : `${Math.ceil(diff / 86400000)}d left`,
    };
}

export default function DeadlineBadge({ dueDate, deadlineWindowSecs = 0, workedSecs = 0, showFull = false }) {
    // Don't show any badge until timer has actually been started
    if (deadlineWindowSecs > 0 && workedSecs === 0) return null;

    const info = getDeadlineInfo(dueDate, deadlineWindowSecs, workedSecs);
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