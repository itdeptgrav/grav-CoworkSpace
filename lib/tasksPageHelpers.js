/**
 * lib/tasksPageHelpers.js
 *
 * Pure utility functions extracted from app/coworking/tasks/page.js.
 * Zero state, zero React — just formatters and live-deadline math.
 *
 * Kept in lib/ (next to coworkUtils.js, coworkApi.js, etc.) so they can
 * be imported by both the page and the individual task-page subcomponents
 * without creating a circular dep back into page.js.
 */

// ─── Priority display ─────────────────────────────────────────────────────────
export const PRI = {
    high: { label: "Urgent", color: "#B91C1C", bg: "#FEF2F2", dot: "#B91C1C" },
    medium: { label: "Normal", color: "#92400E", bg: "#FFFBEB", dot: "#D97706" },
    low: { label: "Lowest", color: "#166534", bg: "#F0FDF4", dot: "#16A34A" },
};

// Numeric priority (1-10) or string level ("high"|"medium"|"low")
export function getPriDisplay(priority) {
    const n =
        typeof priority === "number"
            ? priority
            : typeof priority === "string" && !isNaN(Number(priority))
                ? Number(priority)
                : null;
    if (n !== null) {
        const level = n >= 8 ? "high" : n >= 5 ? "medium" : "low";
        return { ...PRI[level], label: `P${n}`, dot: PRI[level].dot };
    }
    return PRI[priority] || PRI.medium;
}

// ─── Avatar color helper ──────────────────────────────────────────────────────
const AVATAR_COLORS = [
    ["#3B4252", "#4C566A"], ["#2563EB", "#3B82F6"], ["#0F766E", "#14B8A6"],
    ["#7C2D12", "#B91C1C"], ["#6D28D9", "#7C3AED"], ["#0E7490", "#06B6D4"],
    ["#9D174D", "#EC4899"], ["#374151", "#6B7280"],
];

export function getAvatarColors(name = "") {
    const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
    return AVATAR_COLORS[idx];
}

// ─── Live (dynamic) deadline ──────────────────────────────────────────────────
// Wall-clock timestamp (ms) when this task will actually finish, based on the
// employee's real work/pause behavior — NOT the static proposal time.
//
//   • Running         → lastStartTime + (estimate − totalSeconds) × 1000  (fixed during this run)
//   • Paused w/ work  → updatedAt     + (estimate − totalSeconds) × 1000  (frozen at pause moment)
//   • Never started   → now + estimate × 1000                              (slides until first Play)
//   • No estimate     → falls back to the static task.dueDate              (legacy tasks)
//
// Both employee and CEO/TL see the same value because both sides read the
// same Firestore timer session doc via useTaskTimer / useWatchEmployeeTimers.
export function computeLiveDeadline(task, sess) {
    const E = Number(task?.deadlineWindowSecs) || 0;
    if (!E) return task?.dueDate ? new Date(task.dueDate).getTime() : null;
    const W = Number(sess?.totalSeconds) || 0;
    const remainingMs = (E - W) * 1000;
    if (sess?.isActive && sess?.lastStartTime) {
        return sess.lastStartTime + remainingMs;
    }
    if (sess?.updatedAt && W > 0) {
        return sess.updatedAt + remainingMs;
    }
    return Date.now() + remainingMs;
}

export function fmtLiveDeadlineDate(task, sess) {
    const ms = computeLiveDeadline(task, sess);
    if (!ms) return null;
    return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtLiveDeadlineDateTime(task, sess) {
    const ms = computeLiveDeadline(task, sess);
    if (!ms) return null;
    return new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ─── Chat message grouping ────────────────────────────────────────────────────
// Inserts date-header entries between messages when the date changes.
// Returns a flat array of { type: "date", label } and { type: "msg", ...msg }.
export function groupByDate(messages) {
    const groups = [];
    let lastDate = null;
    messages.forEach((msg) => {
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