"use client";
/**
 * app/coworking/workload/[employeeId]/page.js
 * Employee Task Calendar — monthly view
 * Shows tasks as horizontal bars, hover tooltip, overlap detection
 * Accessible: CEO + TL only
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useCoworkAuth } from "../../../../hooks/useCoworkAuth";
import { getEmployeeCalendar } from "../../../../lib/coworkApi";

// ── Unique task color palette ─────────────────────────────────────────────────
const TASK_COLORS = [
    { bg: "#CCFBF1", border: "#0D9488", text: "#134E4A" }, // teal
    { bg: "#EDE9FE", border: "#7C3AED", text: "#4C1D95" }, // purple
    { bg: "#FCE7F3", border: "#EC4899", text: "#831843" }, // pink
    { bg: "#ECFCCB", border: "#65A30D", text: "#365314" }, // lime
    { bg: "#CFFAFE", border: "#06B6D4", text: "#164E63" }, // cyan
    { bg: "#E0E7FF", border: "#6366F1", text: "#312E81" }, // indigo
    { bg: "#D1FAE5", border: "#10B981", text: "#064E3B" }, // emerald
    { bg: "#FEF3C7", border: "#D97706", text: "#78350F" }, // amber
    { bg: "#FAE8FF", border: "#D946EF", text: "#701A75" }, // fuchsia
    { bg: "#FFF7ED", border: "#EA580C", text: "#7C2D12" }, // orange
    { bg: "#DBEAFE", border: "#3B82F6", text: "#1E3A8A" }, // blue
    { bg: "#FDF4FF", border: "#A855F7", text: "#581C87" }, // grape
    { bg: "#F0FDF4", border: "#16A34A", text: "#14532D" }, // green
    { bg: "#FFE4E6", border: "#F43F5E", text: "#881337" }, // rose
    { bg: "#E0F2FE", border: "#0EA5E9", text: "#0C4A6E" }, // sky
    { bg: "#FEF2F2", border: "#DC2626", text: "#7F1D1D" }, // red
];

function getTaskColor(taskId = "") {
    let hash = 0;
    for (let i = 0; i < taskId.length; i++) {
        hash = ((hash << 5) - hash) + taskId.charCodeAt(i);
        hash |= 0;
    }
    return TASK_COLORS[Math.abs(hash) % TASK_COLORS.length];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Avatar({ name, size = 34 }) {
    const initials = name
        ? name.trim().split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
        : "?";
    const colors = [
        { bg: "#EEEDFE", txt: "#3C3489" },
        { bg: "#E1F5EE", txt: "#0F6E56" },
        { bg: "#FAECE7", txt: "#993C1D" },
        { bg: "#E6F1FB", txt: "#0C447C" },
        { bg: "#FAEEDA", txt: "#633806" },
    ];
    const c = colors[name?.charCodeAt(0) % colors.length] || colors[0];
    return (
        <div style={{
            width: size, height: size, borderRadius: "50%",
            background: c.bg, color: c.txt, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: size * 0.34, fontWeight: 500, fontFamily: "inherit",
        }}>
            {initials}
        </div>
    );
}

function fmt12(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function fmtDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " +
        d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

// Build calendar grid for a given month
function buildCalendarDays(year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const cells = [];

    // Prev month padding
    for (let i = firstDay - 1; i >= 0; i--) {
        cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), otherMonth: true });
    }
    // This month
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push({ date: new Date(year, month, d), otherMonth: false });
    }
    // Next month padding
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
        cells.push({ date: new Date(year, month + 1, d), otherMonth: true });
    }
    return cells;
}

// Get tasks that span a specific calendar date
function getTasksForDate(tasks, date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return tasks.filter(t => {
        const start = new Date(t.startTime);
        const end = new Date(t.endTime);
        return start <= dayEnd && end >= dayStart;
    });
}

// Is a task starting on this date?
function isTaskStart(task, date) {
    const start = new Date(task.startTime);
    const d = new Date(date);
    return start.getFullYear() === d.getFullYear() &&
        start.getMonth() === d.getMonth() &&
        start.getDate() === d.getDate();
}

// Is a task ending on this date?
function isTaskEnd(task, date) {
    const end = new Date(task.endTime);
    const d = new Date(date);
    return end.getFullYear() === d.getFullYear() &&
        end.getMonth() === d.getMonth() &&
        end.getDate() === d.getDate();
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function Tooltip({ task, pos, visible }) {
    if (!visible || !task) return null;
    const sameDayStart = new Date(task.startTime).toDateString() === new Date(task.endTime).toDateString();
    return (
        <div style={{
            position: "fixed",
            left: Math.min(pos.x + 12, window.innerWidth - 220),
            top: pos.y - 10,
            background: "#fff",
            border: "1px solid #E8EAED",
            borderRadius: 8,
            padding: "10px 14px",
            minWidth: 200,
            maxWidth: 260,
            zIndex: 9999,
            pointerEvents: "none",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            fontFamily: "'Google Sans','Inter',system-ui,sans-serif",
        }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#202124", marginBottom: 6 }}>
                {task.isGoldTask ? "⭐ " : ""}{task.title}
            </div>
            <div style={{ fontSize: 11, color: "#5f6368", marginBottom: 3, display: "flex", gap: 6 }}>
                <span style={{ color: "#80868b", minWidth: 42 }}>Start</span>
                <span>{fmtDateTime(task.startTime)}</span>
            </div>
            <div style={{ fontSize: 11, color: "#5f6368", marginBottom: 3, display: "flex", gap: 6 }}>
                <span style={{ color: "#80868b", minWidth: 42 }}>End</span>
                <span>{fmtDateTime(task.endTime)}</span>
            </div>
            <div style={{ fontSize: 11, color: "#5f6368", marginBottom: task.overlap ? 6 : 0, display: "flex", gap: 6 }}>
                <span style={{ color: "#80868b", minWidth: 42 }}>Duration</span>
                <span>{task.etcHours} hrs</span>
            </div>
            {task.overlap && (
                <div style={{
                    fontSize: 11, color: "#D93025", background: "#FCE8E6",
                    borderRadius: 4, padding: "3px 7px", marginTop: 4,
                }}>
                    ⚠ Overlaps with another task
                </div>
            )}
        </div>
    );
}

// ── Task Bar ──────────────────────────────────────────────────────────────────
// Calculate partial bar width for start/end days
// Assumes 9AM–6PM office hours (9 hrs) for display proportion
const OFFICE_START_H = 9;
const OFFICE_TOTAL_H = 9;

function getBarStyle(task, date) {
    const start = isTaskStart(task, date);
    const end = isTaskEnd(task, date);
    const isSingleDay = start && end;

    let marginLeft = start ? 0 : -1;
    let marginRight = end ? 0 : -1;
    let width = "100%";

    if (!isSingleDay) {
        if (start) {
            // start day: bar begins at task start time position
            const s = new Date(task.startTime);
            const startPct = Math.max(0, Math.min(95,
                ((s.getHours() + s.getMinutes() / 60) - OFFICE_START_H) / OFFICE_TOTAL_H * 100
            ));
            marginLeft = `${startPct}%`;
            width = `${100 - startPct}%`;
        } else if (end) {
            // end day: bar stops at task end time position
            const e = new Date(task.endTime);
            const endPct = Math.max(5, Math.min(100,
                ((e.getHours() + e.getMinutes() / 60) - OFFICE_START_H) / OFFICE_TOTAL_H * 100
            ));
            width = `${endPct}%`;
            marginRight = 0;
        }
    }

    return { start, end, marginLeft, marginRight, width };
}

function TaskBar({ task, date, onHover, onLeave }) {
    const start = isTaskStart(task, date);
    const end = isTaskEnd(task, date);
    const { marginLeft, marginRight, width } = getBarStyle(task, date);

    const color = getTaskColor(task.taskId);

    const style = {
        height: 20,
        borderRadius: start && end ? 4 : start ? "4px 0 0 4px" : end ? "0 4px 4px 0" : 0,
        marginBottom: 2,
        padding: "0 6px",
        display: "flex",
        alignItems: "center",
        cursor: "pointer",
        overflow: "hidden",
        marginLeft,
        marginRight,
        width,
        position: "relative",
        background: color.bg,
        borderTop: task.overlap ? `1.5px dashed ${color.border}` : `1px solid ${color.border}`,
        borderBottom: task.overlap ? `1.5px dashed ${color.border}` : `1px solid ${color.border}`,
        borderLeft: start ? `3px solid ${color.border}` : "none",
        borderRight: end ? `1px solid ${color.border}` : "none",
        opacity: task.overlap ? 0.85 : 1,
    };

    return (
        <div
            style={style}
            onMouseEnter={e => onHover(task, { x: e.clientX, y: e.clientY })}
            onMouseMove={e => onHover(task, { x: e.clientX, y: e.clientY })}
            onMouseLeave={onLeave}
        >
            {start && (
                <span style={{
                    fontSize: 10,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: color.text,
                }}>
                    {task.isGoldTask ? "⭐ " : ""}{task.overlap ? "⚠ " : ""}{task.title}
                </span>
            )}
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EmployeeCalendarPage() {
    const { user, role, loading } = useCoworkAuth();
    const router = useRouter();
    const params = useParams();
    const employeeId = params?.employeeId;

    const today = new Date();
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [employee, setEmployee] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [fetching, setFetching] = useState(true);
    const [error, setError] = useState(null);
    const [tooltip, setTooltip] = useState({ task: null, pos: { x: 0, y: 0 }, visible: false });

    useEffect(() => {
        if (!loading && !user) { router.push("/"); return; }
        if (!loading && user && role === "employee") { router.push("/coworking"); }
    }, [user, role, loading]);

    useEffect(() => {
        if (!user || role === "employee" || !employeeId) return;
        setFetching(true);
        getEmployeeCalendar(employeeId)
            .then(data => {
                setEmployee(data.employee);
                setTasks(data.tasks || []);
            })
            .catch(e => setError(e.message))
            .finally(() => setFetching(false));
    }, [user, role, employeeId]);

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    };
    const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };

    const cells = buildCalendarDays(viewYear, viewMonth);

    const overlappingCount = tasks.filter(t => t.overlap).length;

    const handleHover = useCallback((task, pos) => {
        setTooltip({ task, pos, visible: true });
    }, []);

    const handleLeave = useCallback(() => {
        setTooltip(p => ({ ...p, visible: false }));
    }, []);

    if (loading || !user) return null;

    return (
        <div style={{
            padding: "12px 0px 48px",
            fontFamily: "'Google Sans','Inter',system-ui,sans-serif",
        }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <button
                    onClick={() => router.push("/coworking/calendar")}
                    style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: "none", border: "1px solid #DADCE0",
                        borderRadius: 8, padding: "6px 12px",
                        fontSize: 13, color: "#5f6368", cursor: "pointer",
                    }}
                >
                    ← Workload
                </button>

                {employee && (
                    <>
                        <Avatar name={employee.name} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 16, fontWeight: 600, color: "#202124" }}>
                                {employee.name}
                            </div>
                            <div style={{ fontSize: 12, color: "#5f6368", marginTop: 2 }}>
                                {employee.department} · {employee.employeeId}
                                {employee.role === "tl" && (
                                    <span style={{
                                        marginLeft: 6, fontSize: 10, background: "#E8F0FE",
                                        color: "#1a73e8", padding: "1px 6px", borderRadius: 10, fontWeight: 500,
                                    }}>TL</span>
                                )}
                            </div>
                        </div>
                        <div style={{
                            background: "#E8F0FE", color: "#1a73e8",
                            fontSize: 12, fontWeight: 500,
                            padding: "4px 12px", borderRadius: 20,
                        }}>
                            {tasks.length} task{tasks.length !== 1 ? "s" : ""}
                        </div>
                        {overlappingCount > 0 && (
                            <div style={{
                                background: "#FCE8E6", color: "#D93025",
                                fontSize: 12, fontWeight: 500,
                                padding: "4px 12px", borderRadius: 20,
                            }}>
                                ⚠ {overlappingCount} overlap{overlappingCount !== 1 ? "s" : ""}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Calendar card */}
            <div style={{
                background: "#fff",
                border: "1px solid #E8EAED",
                borderRadius: 12,
                overflow: "hidden",
            }}>
                {/* Month nav */}
                <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 16px", borderBottom: "1px solid #F1F3F4",
                }}>
                    <button onClick={prevMonth} style={navBtnStyle}>‹</button>
                    <div style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: 500, color: "#202124" }}>
                        {MONTH_NAMES[viewMonth]} {viewYear}
                    </div>
                    <button onClick={nextMonth} style={navBtnStyle}>›</button>
                    <button onClick={goToday} style={{
                        ...navBtnStyle, fontSize: 12, padding: "5px 14px",
                        background: "#E8F0FE", color: "#1a73e8", border: "1px solid #C5D9F7",
                    }}>Today</button>
                </div>

                {/* Day headers */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #E8EAED" }}>
                    {DAY_NAMES.map(d => (
                        <div key={d} style={{
                            padding: "7px 8px", textAlign: "center",
                            fontSize: 11, fontWeight: 600, color: "#80868b",
                            textTransform: "uppercase", letterSpacing: "0.05em",
                            borderRight: "1px solid #F1F3F4",
                        }}>{d}</div>
                    ))}
                </div>

                {/* States */}
                {fetching && (
                    <div style={{ textAlign: "center", padding: "48px 0", color: "#5f6368", fontSize: 14 }}>
                        Loading calendar...
                    </div>
                )}
                {!fetching && error && (
                    <div style={{ textAlign: "center", padding: "48px 0", color: "#D93025", fontSize: 14 }}>
                        {error}
                    </div>
                )}

                {/* Calendar grid */}
                {!fetching && !error && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                        {cells.map((cell, idx) => {
                            const isToday = !cell.otherMonth &&
                                cell.date.getFullYear() === today.getFullYear() &&
                                cell.date.getMonth() === today.getMonth() &&
                                cell.date.getDate() === today.getDate();

                            const dayTasks = getTasksForDate(tasks, cell.date);
                            const hasOverlap = dayTasks.some(t => t.overlap);

                            return (
                                <div key={idx} style={{
                                    minHeight: 80,
                                    padding: "4px 3px",
                                    borderRight: "1px solid #F1F3F4",
                                    borderBottom: "1px solid #F1F3F4",
                                    background: isToday ? "#F0F7FF"
                                        : cell.otherMonth ? "#FAFAFA"
                                            : "#fff",
                                    position: "relative",
                                    overflow: "hidden",
                                }}>
                                    {/* Date number */}
                                    <div style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: 24, height: 24,
                                        borderRadius: "50%",
                                        marginBottom: 3,
                                        fontSize: 12,
                                        fontWeight: isToday ? 600 : 400,
                                        color: isToday ? "#fff"
                                            : cell.otherMonth ? "#DADCE0"
                                                : "#202124",
                                        background: isToday ? "#1a73e8" : "transparent",
                                    }}>
                                        {cell.date.getDate()}
                                    </div>

                                    {/* Task bars */}
                                    {dayTasks.map(task => (
                                        <TaskBar
                                            key={task.taskId}
                                            task={task}
                                            date={cell.date}
                                            onHover={handleHover}
                                            onLeave={handleLeave}
                                        />
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Legend */}
            {!fetching && !error && (
                <div style={{
                    display: "flex", gap: 16, marginTop: 12,
                    flexWrap: "wrap", padding: "0 4px",
                }}>

                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5f6368" }}>
                        ⭐ = Gold task (C2)
                    </div>
                    <div style={{ fontSize: 12, color: "#80868b", marginLeft: "auto" }}>
                        Hover over a task bar to see details
                    </div>
                </div>
            )}

            {/* Tooltip */}
            <Tooltip task={tooltip.task} pos={tooltip.pos} visible={tooltip.visible} />
        </div>
    );
}

const navBtnStyle = {
    background: "#fff",
    border: "1px solid #DADCE0",
    borderRadius: 8,
    padding: "5px 12px",
    fontSize: 16,
    cursor: "pointer",
    color: "#202124",
    lineHeight: 1,
};