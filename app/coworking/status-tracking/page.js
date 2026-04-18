"use client";
/**
 * /coworking/status-tracking/page.js
 *
 * Real-time employee work status dashboard for CEO & TL.
 * - Shows only employees they have assigned tasks to
 * - WORKING NOW: live timer, task name, seconds ticking
 * - NOT WORKING: last task + when they stopped
 * - No "Paused" state — only Working / Not Working
 * - Click row → detail modal with all tasks + time breakdown
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { useWatchEmployeeTimers, formatTimeHMS, formatTime } from "../../../hooks/useTaskTimer";
import { firebaseDb } from "../../../lib/coworkFirebase";
import {
    collection, query, where, getDocs, onSnapshot,
    orderBy, limit, doc, getDoc,
} from "firebase/firestore";
import { taskForwardApi } from "../../../lib/taskForwardApi";

// ── Format seconds → readable string ──────────────────────────────────────────
function fmtSecs(s) {
    if (!s || s < 1) return "0s";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
    return `${sec}s`;
}

// ── Deadline intelligence ──────────────────────────────────────────────────────
// Given dueDate (ISO string) and workedSeconds, return deadline status info
function getDeadlineInfo(dueDate, workedSeconds = 0) {
    if (!dueDate) return null;
    const now = Date.now();
    const due = new Date(dueDate).getTime();
    const msLeft = due - now;
    const secsLeft = Math.floor(msLeft / 1000);

    // Total "budget" = time from when timer first started to deadline
    // We infer this is just the deadline itself; we track workedSeconds from timer
    const isOverdue = msLeft < 0;
    const overdueSecs = isOverdue ? Math.abs(secsLeft) : 0;

    // Progress: how much of deadline has been used by working
    // We compare workedSeconds vs total deadline window
    // If overdue, show worked vs deadline diff
    const status = isOverdue
        ? (workedSeconds >= Math.abs(secsLeft) + workedSeconds ? "complete" : "overdue")
        : msLeft < 2 * 3600 * 1000 ? "critical"    // < 2h left
            : msLeft < 12 * 3600 * 1000 ? "near"        // < 12h left
                : "safe";

    const timeLeftStr = (() => {
        if (isOverdue) {
            const s = overdueSecs;
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            if (h > 0) return `${h}h ${m}m overdue`;
            return `${m}m overdue`;
        }
        const h = Math.floor(secsLeft / 3600);
        const m = Math.floor((secsLeft % 3600) / 60);
        if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
        if (h > 0) return `${h}h ${m}m left`;
        return `${m}m left`;
    })();

    const color = isOverdue ? "#B91C1C" : status === "critical" ? "#D97706" : status === "near" ? "#D97706" : "#16A34A";
    const bg = isOverdue ? "#FEF2F2" : status === "critical" ? "#FFFBEB" : status === "near" ? "#FFFBEB" : "#F0FDF4";

    return { status, isOverdue, secsLeft, timeLeftStr, color, bg, dueDate };
}

// ── Avatar helper ──────────────────────────────────────────────────────────────
const AVATAR_PALETTE = [
    ["#4F46E5", "#818CF8"], ["#059669", "#34D399"], ["#DC2626", "#F87171"],
    ["#D97706", "#FBBF24"], ["#7C3AED", "#A78BFA"], ["#0891B2", "#22D3EE"],
    ["#BE185D", "#F472B6"], ["#374151", "#9CA3AF"],
];
function avatarColors(name = "") {
    const i = name.charCodeAt(0) % AVATAR_PALETTE.length;
    return AVATAR_PALETTE[i];
}
function initials(name = "") {
    return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

// ── Live timer display — ticks every second ────────────────────────────────────
function LiveTimer({ totalSeconds, lastStartTime, isActive }) {
    const [display, setDisplay] = useState(totalSeconds);
    useEffect(() => {
        if (!isActive || !lastStartTime) { setDisplay(totalSeconds); return; }
        const update = () => {
            const elapsed = Math.floor((Date.now() - lastStartTime) / 1000);
            setDisplay(totalSeconds + elapsed);
        };
        update();
        const t = setInterval(update, 1000);
        return () => clearInterval(t);
    }, [totalSeconds, lastStartTime, isActive]);
    return (
        <span style={{
            fontFamily: "monospace", fontSize: 15, fontWeight: 800,
            color: "#16A34A", letterSpacing: "0.04em",
        }}>
            {formatTimeHMS(display)}
        </span>
    );
}

// ── "Time ago" helper ──────────────────────────────────────────────────────────
function timeAgo(ms) {
    if (!ms) return "";
    const diff = Math.floor((Date.now() - ms) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

// ── Employee Detail Modal ──────────────────────────────────────────────────────
function EmployeeDetailModal({ emp, rawSessions, taskDataMap, onClose }) {
    const [activeTab, setActiveTab] = useState("time"); // "time" | "commits"
    const [commits, setCommits] = useState([]);
    const [commitsLoading, setCommitsLoading] = useState(false);

    // Load commits when "Work Log" tab selected
    useEffect(() => {
        if (activeTab !== "commits") return;
        setCommitsLoading(true);
        const logsRef = collection(firebaseDb, "cowork_work_commits", emp.employeeId, "logs");
        const q = query(logsRef, orderBy("stoppedAt", "desc"), limit(30));
        const unsub = onSnapshot(q, snap => {
            setCommits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setCommitsLoading(false);
        }, () => setCommitsLoading(false));
        return () => unsub();
    }, [activeTab, emp.employeeId]);

    const sessions = rawSessions || new Map();
    const sessArr = [...sessions.entries()].map(([taskId, s]) => ({ taskId, ...s }));
    sessArr.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return (b.totalSeconds || 0) - (a.totalSeconds || 0);
    });
    const totalAll = sessArr.reduce((sum, s) => {
        const extra = s.isActive && s.lastStartTime
            ? Math.floor((Date.now() - s.lastStartTime) / 1000) : 0;
        return sum + (s.totalSeconds || 0) + extra;
    }, 0);
    const [c1, c2] = avatarColors(emp.name);

    const fmtTs = (ts) => {
        if (!ts) return "";
        const ms = ts?.seconds ? ts.seconds * 1000 : (ts?.toMillis ? ts.toMillis() : ts);
        const d = new Date(ms);
        const now = new Date();
        const diff = Math.floor((now - d) / 60000);
        if (diff < 1) return "just now";
        if (diff < 60) return `${diff}m ago`;
        if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
        return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + " · " +
            d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    };

    return (
        <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(3px)", padding: 16,
        }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                background: "#fff", borderRadius: 16, width: "min(520px, 96vw)",
                maxHeight: "85vh", display: "flex", flexDirection: "column",
                boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
                animation: "modalIn 0.18s cubic-bezier(0.4,0,0.2,1)",
            }}>
                <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}`}</style>

                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 20px 0", }}>
                    <div style={{
                        width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                        background: `linear-gradient(135deg,${c1},${c2})`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 15, fontWeight: 800,
                    }}>
                        {initials(emp.name)}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>{emp.name}</div>
                        <div style={{ fontSize: 12, color: "#64748B", marginTop: 2, display: "flex", gap: 10 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: emp.isWorking ? "#16A34A" : "#9CA3AF" }}>
                                <span style={{ width: 7, height: 7, borderRadius: "50%", background: emp.isWorking ? "#16A34A" : "#D1D5DB", display: "inline-block", ...(emp.isWorking ? { animation: "pulse 2s infinite" } : {}) }} />
                                {emp.isWorking ? "Working Now" : "Not Working"}
                            </span>
                            <span>Total: <strong>{fmtSecs(totalAll)}</strong></span>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB", margin: "14px 20px 0", gap: 0 }}>
                    {[
                        { key: "time", label: "⏱ Time Breakdown", count: sessArr.length },
                        { key: "commits", label: "📝 Work Log", count: commits.length || null },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            style={{
                                padding: "8px 14px", border: "none", background: "none", fontFamily: "inherit",
                                fontSize: 12, fontWeight: activeTab === tab.key ? 700 : 500,
                                color: activeTab === tab.key ? "#4F46E5" : "#64748B",
                                borderBottom: `2px solid ${activeTab === tab.key ? "#4F46E5" : "transparent"}`,
                                cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                                transition: "all 0.12s",
                            }}>
                            {tab.label}
                            {tab.count > 0 && <span style={{ fontSize: 9, fontWeight: 700, background: activeTab === tab.key ? "#EEF2FF" : "#F1F5F9", color: activeTab === tab.key ? "#4F46E5" : "#9CA3AF", padding: "1px 6px", borderRadius: 99 }}>{tab.count}</span>}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: "auto" }}>

                    {/* TIME BREAKDOWN TAB */}
                    {activeTab === "time" && (
                        sessArr.length === 0 ? (
                            <div style={{ padding: "32px 20px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>No tracked time yet</div>
                        ) : sessArr.map(sess => {
                            const extra = sess.isActive && sess.lastStartTime ? Math.floor((Date.now() - sess.lastStartTime) / 1000) : 0;
                            const workedSecs = (sess.totalSeconds || 0) + extra;

                            // Task deadline data
                            const tData = taskDataMap?.get(sess.taskId) || taskDataMap?.get(sess.taskTitle) || null;
                            const taskDue = tData?.dueDate || (emp.activeTaskId === sess.taskId ? emp.activeTaskDueDate : null);

                            // ── ASKED FOR: CONSTANT — stored when employee proposed deadline ──────────
                            // deadlineWindowSecs is saved at proposal time and NEVER recalculated.
                            // If not stored (old tasks), show "—" for that column.
                            const storedAsked = tData?.deadlineWindowSecs || null;
                            const askedForSecs = storedAsked || null; // strictly constant, no fallback

                            // Deadline clock state
                            const isOverdue = taskDue && new Date(taskDue).getTime() < Date.now();
                            const clockSecsLeft = taskDue && !isOverdue
                                ? Math.max(0, Math.floor((new Date(taskDue).getTime() - Date.now()) / 1000))
                                : null;

                            // Third column logic:
                            // on_track   → TIME LEFT  = askedFor - worked  (e.g. 3h asked, 1h worked = 2h left)
                            // incomplete → STILL NEEDED = askedFor - worked (deadline passed, not done)
                            // overdue    → OVERTIME   = worked - askedFor  (worked beyond budget)
                            const workRemaining = askedForSecs ? Math.max(0, askedForSecs - workedSecs) : null;
                            const overtimeSecs = askedForSecs && isOverdue && workedSecs > askedForSecs
                                ? workedSecs - askedForSecs : null;

                            // State
                            const state = !taskDue ? "no_deadline"
                                : !isOverdue ? "on_track"
                                    : (askedForSecs && workedSecs < askedForSecs) ? "incomplete"
                                        : "overdue";

                            const STATE_STYLE = {
                                on_track: { border: "#BBF7D0", bg: "#F0FDF4", label: clockSecsLeft !== null ? `⏰ ${fmtSecs(clockSecsLeft)} left` : "On track", labelColor: "#166534", labelBg: "#DCFCE7" },
                                incomplete: { border: "#FED7AA", bg: "#FFF7ED", label: "⚠️ Incomplete", labelColor: "#9A3412", labelBg: "#FEF3C7" },
                                overdue: { border: "#FECDD3", bg: "#FEF2F2", label: overtimeSecs ? `+${fmtSecs(overtimeSecs)} overtime` : "🔴 Deadline passed", labelColor: overtimeSecs ? "#7C3AED" : "#B91C1C", labelBg: overtimeSecs ? "#EDE9FE" : "#FEE2E2" },
                                no_deadline: { border: "#E5E7EB", bg: "#F8FAFC", label: null, labelColor: "#64748B", labelBg: "#F1F5F9" },
                            };
                            const ss = STATE_STYLE[state];

                            // Bar: worked / askedFor (constant denominator — never changes)
                            const barPct = askedForSecs
                                ? Math.min(100, Math.round((workedSecs / askedForSecs) * 100))
                                : clockSecsLeft !== null
                                    ? Math.min(100, Math.round((workedSecs / (workedSecs + clockSecsLeft)) * 100))
                                    : 100;
                            const barColor = state === "on_track" ? "#16A34A"
                                : state === "incomplete" ? "#F97316"
                                    : "#EF4444";

                            return (
                                <div key={sess.taskId} style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9", background: sess.isActive ? "#F0FDF4" : "transparent" }}>

                                    {/* Row 1: dot + task name + timer */}
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: taskDue ? 10 : 0 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: sess.isActive ? "#16A34A" : "#D1D5DB", ...(sess.isActive ? { animation: "pulse 2s infinite" } : {}) }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sess.taskTitle || sess.taskId}</div>
                                            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{sess.isActive ? "Working now" : sess.updatedAt ? `Stopped ${timeAgo(sess.updatedAt)}` : "Stopped"}</div>
                                        </div>
                                        <div style={{ flexShrink: 0 }}>
                                            {sess.isActive
                                                ? <LiveTimer totalSeconds={sess.totalSeconds || 0} lastStartTime={sess.lastStartTime} isActive />
                                                : <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#64748B" }}>{formatTimeHMS(workedSecs)}</span>}
                                        </div>
                                    </div>

                                    {/* Deadline info card */}
                                    {taskDue && (
                                        <div style={{ marginLeft: 18, padding: "10px 12px", background: ss.bg, borderRadius: 9, border: `1.5px solid ${ss.border}` }}>

                                            {/* Top: deadline time + state badge */}
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                                <span style={{ fontSize: 11, color: "#64748B" }}>
                                                    Deadline: <strong style={{ color: "#0F172A" }}>
                                                        {new Date(taskDue).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                                    </strong>
                                                </span>
                                                {ss.label && (
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: ss.labelColor, background: ss.labelBg, padding: "2px 9px", borderRadius: 99 }}>
                                                        {ss.label}
                                                    </span>
                                                )}
                                            </div>

                                            {/* ASKED FOR (constant) | WORKED | TIME LEFT → OVERTIME → STILL NEEDED */}
                                            <div style={{ display: "flex", gap: 0, marginBottom: 8, background: "#fff", borderRadius: 7, border: "1px solid #F1F5F9", overflow: "hidden" }}>

                                                {/* Col 1: ASKED FOR — constant, never changes */}
                                                <div style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRight: "1px solid #E5E7EB" }}>
                                                    <div style={{ fontSize: 14, fontWeight: 800, color: "#374151" }}>
                                                        {askedForSecs ? fmtSecs(askedForSecs) : "—"}
                                                    </div>
                                                    <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>Asked for</div>
                                                </div>

                                                {/* Col 2: WORKED */}
                                                <div style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRight: "1px solid #E5E7EB" }}>
                                                    <div style={{ fontSize: 14, fontWeight: 800, color: "#059669" }}>{fmtSecs(workedSecs)}</div>
                                                    <div style={{ fontSize: 9, color: "#059669", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>✓ Worked</div>
                                                </div>

                                                {/* Col 3: TIME LEFT / STILL NEEDED / OVERTIME */}
                                                <div style={{ flex: 1, textAlign: "center", padding: "8px 4px" }}>
                                                    {state === "on_track" && workRemaining !== null && (
                                                        <>
                                                            <div style={{ fontSize: 14, fontWeight: 800, color: workRemaining === 0 ? "#059669" : clockSecsLeft < 7200 ? "#D97706" : "#374151" }}>
                                                                {workRemaining === 0 ? "✓" : fmtSecs(workRemaining)}
                                                            </div>
                                                            <div style={{ fontSize: 9, color: workRemaining === 0 ? "#059669" : "#94A3B8", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                                                {workRemaining === 0 ? "Done!" : "Time left"}
                                                            </div>
                                                        </>
                                                    )}
                                                    {state === "incomplete" && workRemaining > 0 && (
                                                        <>
                                                            <div style={{ fontSize: 14, fontWeight: 800, color: "#EA580C" }}>{fmtSecs(workRemaining)}</div>
                                                            <div style={{ fontSize: 9, color: "#EA580C", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>Still needed</div>
                                                        </>
                                                    )}
                                                    {state === "overdue" && overtimeSecs > 0 && (
                                                        <>
                                                            <div style={{ fontSize: 14, fontWeight: 800, color: "#7C3AED" }}>+{fmtSecs(overtimeSecs)}</div>
                                                            <div style={{ fontSize: 9, color: "#7C3AED", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>Overtime</div>
                                                        </>
                                                    )}
                                                    {((state === "overdue" && !overtimeSecs) || (!workRemaining && !overtimeSecs && state === "on_track")) && (
                                                        <>
                                                            <div style={{ fontSize: 14, fontWeight: 800, color: "#94A3B8" }}>—</div>
                                                            <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>—</div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Progress bar: worked / askedFor (constant base) */}
                                            <div style={{ height: 6, background: "#E5E7EB", borderRadius: 99, overflow: "hidden", marginBottom: 4 }}>
                                                <div style={{
                                                    height: "100%", width: `${barPct}%`, borderRadius: 99,
                                                    background: state === "on_track"
                                                        ? barPct >= 80 ? `linear-gradient(90deg,#D97706,#FBBF24)` : `linear-gradient(90deg,#16A34A,#4ADE80)`
                                                        : state === "incomplete" ? `linear-gradient(90deg,#F97316,#FB923C)`
                                                            : `linear-gradient(90deg,#EF4444,#F87171)`,
                                                    transition: "width 1s linear",
                                                }} />
                                            </div>
                                            <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4 }}>
                                                {askedForSecs ? `${barPct}% of asked time used` : `${barPct}% of window used`}
                                            </div>

                                            {/* Verdict */}
                                            {state === "incomplete" && (
                                                <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: "#9A3412", background: "#FEF3C7", borderRadius: 6, padding: "5px 8px" }}>
                                                    ⚠️ Deadline passed — asked {askedForSecs ? fmtSecs(askedForSecs) : "?"}, worked {fmtSecs(workedSecs)}, still needs {workRemaining ? fmtSecs(workRemaining) : "?"}
                                                </div>
                                            )}
                                            {state === "overdue" && !overtimeSecs && (
                                                <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: "#B91C1C", background: "#FEE2E2", borderRadius: 6, padding: "5px 8px" }}>
                                                    🔴 Deadline passed — task not yet submitted
                                                </div>
                                            )}
                                            {state === "overdue" && overtimeSecs > 0 && (
                                                <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: "#7C3AED", background: "#EDE9FE", borderRadius: 6, padding: "5px 8px" }}>
                                                    💪 Working overtime — {fmtSecs(overtimeSecs)} beyond the deadline window
                                                </div>
                                            )}
                                            {state === "on_track" && clockSecsLeft !== null && clockSecsLeft < 7200 && workRemaining > 0 && (
                                                <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: "#92400E", background: "#FEF3C7", borderRadius: 6, padding: "5px 8px" }}>
                                                    ⏰ Less than 2h until deadline — {workRemaining ? fmtSecs(workRemaining) : "?"} of work remaining
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}

                    {/* WORK LOG (COMMITS) TAB */}
                    {activeTab === "commits" && (
                        commitsLoading ? (
                            <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                                {[1, 2, 3].map(i => <div key={i} style={{ height: 60, borderRadius: 8, background: "linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />)}
                                <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
                            </div>
                        ) : commits.length === 0 ? (
                            <div style={{ padding: "40px 20px", textAlign: "center" }}>
                                <div style={{ fontSize: 32, marginBottom: 10 }}>📝</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 6 }}>No work logs yet</div>
                                <div style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.6 }}>
                                    Work log entries appear when the employee pauses their timer and adds a commit message.
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: "8px 0" }}>
                                {commits.map((commit, i) => (
                                    <div key={commit.id || i} style={{ padding: "12px 20px", borderBottom: "1px solid #F8FAFC" }}>
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                            {/* Commit dot */}
                                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: commit.hasMessage ? "#4F46E5" : "#D1D5DB", flexShrink: 0, marginTop: 5 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                {/* Task name */}
                                                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {commit.taskTitle || commit.taskId}
                                                </div>
                                                {/* Commit message */}
                                                {commit.message ? (
                                                    <div style={{ fontSize: 13, color: "#0F172A", lineHeight: 1.5, marginBottom: 5, background: "#F8FAFC", borderLeft: "3px solid #4F46E5", padding: "5px 10px", borderRadius: "0 6px 6px 0" }}>
                                                        "{commit.message}"
                                                    </div>
                                                ) : (
                                                    <div style={{ fontSize: 12, color: "#9CA3AF", fontStyle: "italic", marginBottom: 5 }}>No message</div>
                                                )}
                                                {/* Meta */}
                                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: "#059669", background: "#ECFDF5", padding: "2px 8px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 3 }}>
                                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                                        {fmtSecs(commit.secondsWorked)} worked
                                                    </span>
                                                    <span style={{ fontSize: 11, color: "#94A3B8" }}>{fmtTs(commit.stoppedAt)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: "12px 20px", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#64748B" }}>
                        {activeTab === "time" ? `${sessArr.length} task${sessArr.length !== 1 ? "s" : ""} tracked` : `${commits.length} log entr${commits.length !== 1 ? "ies" : "y"}`}
                    </span>
                    <button onClick={onClose} style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: "#4F46E5", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Employee Card Row ──────────────────────────────────────────────────────────
function DeadlineBar({ dueDate, workedSecs, isActive, lastStartTime }) {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (!isActive) return;
        const t = setInterval(() => setTick(n => n + 1), 1000);
        return () => clearInterval(t);
    }, [isActive]);

    if (!dueDate) return null;
    const now = Date.now();
    const due = new Date(dueDate).getTime();
    const liveWorked = isActive && lastStartTime
        ? workedSecs + Math.floor((now - lastStartTime) / 1000) : workedSecs;
    const msLeft = due - now;
    const isOverdue = msLeft < 0;
    const secsLeft = Math.abs(Math.floor(msLeft / 1000));

    const color = isOverdue ? "#B91C1C" : msLeft < 2 * 3600 * 1000 ? "#D97706" : msLeft < 12 * 3600 * 1000 ? "#D97706" : "#16A34A";
    const trackBg = isOverdue ? "#FEE2E2" : msLeft < 12 * 3600 * 1000 ? "#FEF3C7" : "#DCFCE7";

    const timeLeftStr = (() => {
        const s = secsLeft;
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        if (isOverdue) return h > 0 ? `${h}h ${m}m overdue` : `${m}m overdue`;
        if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
        if (h > 0) return `${h}h ${m}m left`;
        return `${m}m left`;
    })();

    const workedStr = fmtSecs(liveWorked);

    return (
        <div style={{ marginTop: 5 }}>
            {/* Time labels row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: "#64748B", display: "flex", alignItems: "center", gap: 3 }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    Worked: <strong style={{ color: "#0F172A" }}>{workedStr}</strong>
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color, background: isOverdue ? "#FEF2F2" : msLeft < 12 * 3600 * 1000 ? "#FFFBEB" : "#F0FDF4", padding: "1px 6px", borderRadius: 99 }}>
                    {isOverdue ? "⚠️" : "⏰"} {timeLeftStr}
                </span>
            </div>
            {/* Progress bar: worked time vs time remaining */}
            <div style={{ height: 4, background: trackBg, borderRadius: 99, overflow: "hidden", position: "relative" }}>
                {/* Worked portion */}
                {liveWorked > 0 && (
                    <div style={{
                        position: "absolute", left: 0, top: 0, height: "100%",
                        width: isOverdue
                            ? "100%"
                            : `${Math.min(100, (liveWorked / (liveWorked + secsLeft)) * 100)}%`,
                        background: isActive
                            ? `linear-gradient(90deg,${color},${color}bb)`
                            : "#94A3B8",
                        borderRadius: 99,
                        transition: "width 1s linear",
                    }} />
                )}
                {/* Overdue indicator */}
                {isOverdue && (
                    <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg,#FEE2E2,#FEE2E2 4px,#FECDD3 4px,#FECDD3 8px)", borderRadius: 99, opacity: 0.6 }} />
                )}
            </div>
            {/* Deadline date */}
            <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 2, textAlign: "right" }}>
                Due: {new Date(dueDate).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </div>
        </div>
    );
}

function EmployeeRow({ emp, onClick }) {
    const [c1, c2] = avatarColors(emp.name);
    const dl = emp.deadlineInfo;

    return (
        <div onClick={() => onClick(emp)} style={{
            display: "flex", alignItems: "flex-start", gap: 14,
            padding: "12px 20px 10px",
            borderBottom: "1px solid #F1F5F9",
            cursor: "pointer", transition: "background 0.1s",
            background: "#fff",
        }}
            onMouseEnter={e => e.currentTarget.style.background = emp.isWorking ? "#F0FDF4" : "#F8FAFC"}
            onMouseLeave={e => e.currentTarget.style.background = "#fff"}
        >
            {/* Avatar */}
            <div style={{ position: "relative", flexShrink: 0, marginTop: 2 }}>
                <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `linear-gradient(135deg,${c1},${c2})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 13, fontWeight: 800,
                }}>
                    {initials(emp.name)}
                </div>
                <span style={{
                    position: "absolute", bottom: -1, right: -1,
                    width: 11, height: 11, borderRadius: "50%",
                    background: emp.isWorking ? "#16A34A" : "#D1D5DB",
                    border: "2px solid #fff",
                    ...(emp.isWorking ? { animation: "pulse 2s infinite" } : {}),
                }} />
            </div>

            {/* Name + task + deadline bar */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{emp.name}</div>
                    {/* Timer or status — right side */}
                    <div style={{ flexShrink: 0 }}>
                        {emp.isWorking ? (
                            <LiveTimer totalSeconds={emp.activeSessionBase || 0} lastStartTime={emp.activeSessionStart} isActive />
                        ) : (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 9px", borderRadius: 99, background: "#F1F5F9", color: "#94A3B8", display: "inline-flex", alignItems: "center", gap: 3 }}>
                                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#D1D5DB" }} />
                                Not Working
                            </span>
                        )}
                    </div>
                </div>

                {/* Task name */}
                {emp.isWorking ? (
                    <div style={{ fontSize: 11, color: "#059669", display: "flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor"><path d="M2.5 1.5l8 4.5-8 4.5V1.5z" /></svg>
                        {emp.activeTaskTitle}
                    </div>
                ) : (
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                        {emp.lastTaskTitle ? `Last: ${emp.lastTaskTitle}${emp.lastActiveAt ? ` · ${timeAgo(emp.lastActiveAt)}` : ""}` : "No activity yet"}
                    </div>
                )}

                {/* Deadline progress bar — only when working and has deadline */}
                {emp.isWorking && emp.activeTaskDueDate && (
                    <DeadlineBar
                        dueDate={emp.activeTaskDueDate}
                        workedSecs={emp.activeSessionBase || 0}
                        isActive={true}
                        lastStartTime={emp.activeSessionStart}
                    />
                )}
                {/* Deadline badge for not-working — shows 3-state clearly */}
                {!emp.isWorking && emp.activeTaskDueDate && (() => {
                    const workedSecs = emp.activeTaskWorkedSecs || 0;
                    const taskDue = emp.activeTaskDueDate;
                    const isOverdue = new Date(taskDue).getTime() < Date.now();
                    const budgetSecs = null; // available in modal, not in card for simplicity
                    const secsLeft = isOverdue ? 0 : Math.floor((new Date(taskDue).getTime() - Date.now()) / 1000);

                    if (isOverdue && workedSecs < (dl?.secsLeft || 0) + workedSecs) {
                        // Incomplete — deadline passed, didn't work full budget
                        return (
                            <div style={{ marginTop: 5, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: "#9A3412", background: "#FEF3C7", padding: "3px 9px", borderRadius: 99, border: "1px solid #FED7AA" }}>
                                ⚠️ Deadline passed · Worked {fmtSecs(workedSecs)} · Click to see details
                            </div>
                        );
                    }
                    if (!isOverdue) {
                        return (
                            <div style={{ marginTop: 5, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600, color: "#166534", background: "#DCFCE7", padding: "3px 9px", borderRadius: 99 }}>
                                ⏰ {fmtSecs(secsLeft)} left · Worked {fmtSecs(workedSecs)}
                            </div>
                        );
                    }
                    return null;
                })()}
            </div>

            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ color: "#D1D5DB", flexShrink: 0, marginTop: 4 }}>
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function StatusTrackingPage() {
    const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
    const router = useRouter();

    // All unique employee IDs this user assigned tasks to
    const [assignedEmpIds, setAssignedEmpIds] = useState([]);
    // Employee name map: id → { name, department }
    const [empInfoMap, setEmpInfoMap] = useState(new Map());
    // Raw sessions per employee from Firestore (for detail modal)
    const [rawSessionsMap, setRawSessionsMap] = useState(new Map());
    // Task data map: taskId → { title, dueDate, status } for deadline tracking
    const [taskDataMap, setTaskDataMap] = useState(new Map());
    // Tasks with pending deadline approval — shown in right panel
    const [pendingDeadlineTasks, setPendingDeadlineTasks] = useState([]);
    const [approvingId, setApprovingId] = useState(null);
    const [counterFormTaskId, setCounterFormTaskId] = useState(null); // which task has suggest form open
    const [counterDate, setCounterDate] = useState("");
    const [counterTime, setCounterTime] = useState("09:00");
    const [counterMsg, setCounterMsg] = useState("");
    const [rejectFormTaskId, setRejectFormTaskId] = useState(null);
    const [rejectReason, setRejectReason] = useState("");
    const [dataLoading, setDataLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all"); // "all" | "working" | "not_working"
    const [selectedEmp, setSelectedEmp] = useState(null); // for modal
    const [lastUpdated, setLastUpdated] = useState(Date.now());

    // Only CEO and TL can see this page
    const isCEO = role === "ceo";
    const isTL = role === "tl";

    // Use the existing hook to watch live timers for all assigned employees
    const empNameMap = new Map([...empInfoMap.entries()].map(([id, info]) => [id, info.name]));
    const { activeTimers, allTimers } = useWatchEmployeeTimers(assignedEmpIds, empNameMap);

    // ── Load employees assigned tasks by this user ──────────────────────────────
    useEffect(() => {
        if (!employeeId || (!isCEO && !isTL)) return;

        const loadAssignedEmployees = async () => {
            setDataLoading(true);
            try {
                // Get all tasks where assignedBy === this user
                const tasksRef = collection(firebaseDb, "cowork_tasks");
                const q = query(tasksRef, where("assignedBy", "==", employeeId), limit(200));
                const snap = await getDocs(q);

                // Collect all unique assignee IDs
                const empIds = new Set();
                snap.docs.forEach(d => {
                    const t = d.data();
                    (t.assigneeIds || []).forEach(id => { if (id && id !== employeeId) empIds.add(id); });
                });

                const ids = [...empIds];
                setAssignedEmpIds(ids);

                // Load task due dates + budget info for all assigned tasks
                const tDataMap = new Map();
                snap.docs.forEach(d => {
                    const t = d.data();
                    const tid = d.id;
                    if (tid) {
                        // deadlineWindowSecs = dueDate - deadlineApprovedAt (approval time)
                        // This is ALWAYS correct: "Asked For" = time from TL approval to deadline
                        // e.g. approved 10:44 AM, deadline 11:14 AM → 30 min ✅
                        // We recalculate from approvedAt instead of trusting stored value
                        // because old tasks stored it at proposal time (hours earlier = wrong)
                        let deadlineWindowSecs = null;
                        if (t.dueDate && t.deadlineApprovedAt) {
                            const approvedMs = t.deadlineApprovedAt?.seconds
                                ? t.deadlineApprovedAt.seconds * 1000
                                : (typeof t.deadlineApprovedAt === "number" ? t.deadlineApprovedAt : null);
                            if (approvedMs) {
                                deadlineWindowSecs = Math.max(0, Math.floor(
                                    (new Date(t.dueDate).getTime() - approvedMs) / 1000
                                ));
                            }
                        }
                        const entry = {
                            title: t.title || tid, dueDate: t.dueDate || null,
                            status: t.status, taskId: tid,
                            deadlineWindowSecs,
                        };
                        tDataMap.set(tid, entry);
                        if (t.title) tDataMap.set(t.title, entry);
                    }
                });
                setTaskDataMap(tDataMap);

                // Load employee info for each
                const infoMap = new Map();
                await Promise.all(ids.map(async id => {
                    try {
                        const empDoc = await getDoc(doc(firebaseDb, "cowork_employees", id));
                        if (empDoc.exists()) {
                            const d = empDoc.data();
                            infoMap.set(id, { name: d.name || id, department: d.department || "", email: d.email || "" });
                        } else {
                            infoMap.set(id, { name: id, department: "", email: "" });
                        }
                    } catch { infoMap.set(id, { name: id, department: "", email: "" }); }
                }));
                setEmpInfoMap(infoMap);
            } catch (e) {
                console.error("[StatusTracking] load error:", e);
            } finally {
                setDataLoading(false);
            }
        };

        loadAssignedEmployees();
    }, [employeeId, isCEO, isTL]);

    // ── Live listener: pending deadline approval tasks ───────────────────────────
    useEffect(() => {
        if (!employeeId) return;
        const tasksRef = collection(firebaseDb, "cowork_tasks");
        const q = query(
            tasksRef,
            where("assignedBy", "==", employeeId),
            where("status", "==", "pending_deadline_approval"),
            limit(50)
        );
        const unsub = onSnapshot(q, snap => {
            setPendingDeadlineTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [employeeId]);

    // ── Watch raw sessions for detail modal ─────────────────────────────────────
    useEffect(() => {
        if (!assignedEmpIds.length) return;
        const unsubs = [];
        assignedEmpIds.forEach(empId => {
            const colRef = collection(firebaseDb, "cowork_task_timers", empId, "sessions");
            const unsub = onSnapshot(colRef, snap => {
                const sessions = new Map();
                snap.docs.forEach(d => sessions.set(d.id, { ...d.data(), taskId: d.id }));
                setRawSessionsMap(prev => {
                    const next = new Map(prev);
                    next.set(empId, sessions);
                    return next;
                });
                setLastUpdated(Date.now());
            });
            unsubs.push(unsub);
        });
        return () => unsubs.forEach(u => u());
    }, [assignedEmpIds.join(",")]);

    // ── Build employee list with working status ──────────────────────────────────
    const employees = assignedEmpIds.map(empId => {
        const info = empInfoMap.get(empId) || { name: empId, department: "" };

        // Check if this employee is currently working (any task isActive)
        const empSessions = rawSessionsMap.get(empId) || new Map();
        let isWorking = false;
        let activeTaskTitle = "";
        let activeTaskId = null;
        let activeSessionBase = 0;
        let activeSessionStart = null;
        let lastTaskTitle = "";
        let lastActiveAt = 0;
        let totalSecondsAll = 0;

        empSessions.forEach((sess, taskId) => {
            if (sess.isActive) {
                isWorking = true;
                activeTaskTitle = sess.taskTitle || taskId;
                activeTaskId = taskId;
                activeSessionBase = sess.totalSeconds || 0;
                activeSessionStart = sess.lastStartTime || null;
            }
            // Track last worked task (highest updatedAt among non-active)
            if (!sess.isActive && (sess.updatedAt || 0) > lastActiveAt) {
                lastActiveAt = sess.updatedAt || 0;
                lastTaskTitle = sess.taskTitle || taskId;
            }
            // Sum total time (add live elapsed for active sessions)
            const extra = sess.isActive && sess.lastStartTime
                ? Math.floor((Date.now() - sess.lastStartTime) / 1000) : 0;
            totalSecondsAll += (sess.totalSeconds || 0) + extra;
        });

        // Get deadline info for the currently active task
        const activeTaskData = activeTaskId
            ? (taskDataMap.get(activeTaskId) || taskDataMap.get(activeTaskTitle))
            : null;
        const activeTaskDueDate = activeTaskData?.dueDate || null;

        // Total seconds worked on the active task specifically (not all tasks)
        const activeTaskWorkedSecs = (() => {
            if (!activeTaskId) return 0;
            const sess = empSessions.get(activeTaskId);
            if (!sess) return 0;
            const extra = sess.isActive && sess.lastStartTime
                ? Math.floor((Date.now() - sess.lastStartTime) / 1000) : 0;
            return (sess.totalSeconds || 0) + extra;
        })();

        const deadlineInfo = getDeadlineInfo(activeTaskDueDate, activeTaskWorkedSecs);

        return {
            employeeId: empId, name: info.name, department: info.department,
            isWorking, activeTaskTitle, activeTaskId,
            activeSessionBase, activeSessionStart,
            lastTaskTitle, lastActiveAt, totalSecondsAll,
            activeTaskDueDate, activeTaskWorkedSecs, deadlineInfo,
        };
    });

    // ── Filter + Search ──────────────────────────────────────────────────────────
    const filtered = employees.filter(emp => {
        const matchSearch = !search.trim() ||
            emp.name.toLowerCase().includes(search.toLowerCase()) ||
            emp.department.toLowerCase().includes(search.toLowerCase());
        const matchFilter = filter === "all"
            || (filter === "working" && emp.isWorking)
            || (filter === "not_working" && !emp.isWorking);
        return matchSearch && matchFilter;
    });

    const working = filtered.filter(e => e.isWorking);
    const notWorking = filtered.filter(e => !e.isWorking);

    // ── Auth guard ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!loading && !user) router.push("/");
        if (!loading && user && !isCEO && !isTL) router.push("/coworking");
    }, [user, loading, isCEO, isTL]);

    if (loading || !user) return null;

    // ── Page styles ──────────────────────────────────────────────────────────────
    const CSS = `
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(22,163,74,0.4); }
      50% { opacity: 0.85; transform: scale(1.15); box-shadow: 0 0 0 4px rgba(22,163,74,0); }
    }
    @keyframes modalIn {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    .st-row:hover { background: #F8FAFC !important; }
    .st-filter-btn { padding: 6px 14px; border-radius: 99px; border: 1.5px solid #E5E7EB; background: #fff; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.12s; color: #374151; }
    .st-filter-btn.active { border-color: #4F46E5; background: #EEF2FF; color: #4F46E5; font-weight: 700; }
    .st-filter-btn:hover:not(.active) { border-color: #D1D5DB; background: #F9FAFB; }
    .st-section { background: #fff; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; }
    .st-section-header { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-bottom: 1px solid #F1F5F9; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 4px; }
    @media (max-width: 900px) {
      .st-right-panel { display: none !important; }
    }
    @media (max-width: 600px) {
      .st-filter-btn { padding: 5px 10px; font-size: 11px; }
    }
  `;

    const handleApproveDeadline = async (taskId, approved, reason = "") => {
        setApprovingId(taskId);
        try {
            await taskForwardApi.approveDeadline(taskId, approved, approved ? "" : (reason || "Rejected by TL/CEO"));
            setRejectFormTaskId(null); setRejectReason("");
        } catch (e) { console.error(e); }
        finally { setApprovingId(null); }
    };

    const handleCounterPropose = async (taskId) => {
        if (!counterDate) return;
        setApprovingId(taskId);
        try {
            const dt = `${counterDate}T${counterTime || "09:00"}:00`;
            await taskForwardApi.tlCounterDeadline(taskId, dt, counterMsg.trim());
            setCounterFormTaskId(null); setCounterDate(""); setCounterTime("09:00"); setCounterMsg("");
        } catch (e) { console.error(e); }
        finally { setApprovingId(null); }
    };

    return (
        <>
            <style>{CSS}</style>

            {/* Two-column layout: main content + right panel */}
            <div style={{
                display: "flex", gap: 0, minHeight: "100%",
                fontFamily: "'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif",
            }}>

                {/* ── LEFT: main employee list ── */}
                <div style={{ flex: 1, minWidth: 0, padding: "16px 16px 32px", overflowY: "auto" }}>
                    <div style={{ maxWidth: 780 }}>

                        {/* ── Page Header ── */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                                <div>
                                    <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 20 }}>📡</span> Live Status
                                    </h1>
                                    <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
                                        Real-time view of employees you assigned tasks to
                                    </p>
                                </div>
                                {/* Summary badges */}
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                    <div style={{
                                        display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                                        borderRadius: 99, background: "#F0FDF4", border: "1px solid #BBF7D0",
                                    }}>
                                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16A34A", animation: "pulse 2s infinite" }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: "#16A34A" }}>{employees.filter(e => e.isWorking).length} Working</span>
                                    </div>
                                    <div style={{
                                        display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                                        borderRadius: 99, background: "#F8FAFC", border: "1px solid #E5E7EB",
                                    }}>
                                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#D1D5DB" }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8" }}>{employees.filter(e => !e.isWorking).length} Not Working</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Search + Filter bar ── */}
                        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
                            {/* Search */}
                            <div style={{
                                display: "flex", alignItems: "center", gap: 7,
                                padding: "8px 12px", borderRadius: 9, border: "1.5px solid #E5E7EB",
                                background: "#fff", flex: 1, minWidth: 180,
                            }}>
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <circle cx="6" cy="6" r="4.5" stroke="#9CA3AF" strokeWidth="1.2" />
                                    <line x1="9.5" y1="9.5" x2="12.5" y2="12.5" stroke="#9CA3AF" strokeWidth="1.2" strokeLinecap="round" />
                                </svg>
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search employee name…"
                                    style={{ border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", background: "transparent", color: "#0F172A", flex: 1, minWidth: 0 }}
                                />
                                {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 0, display: "flex" }}>
                                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                </button>}
                            </div>

                            {/* Filter pills */}
                            <div style={{ display: "flex", gap: 6 }}>
                                {[
                                    { key: "all", label: `All (${employees.length})` },
                                    { key: "working", label: `🟢 Working (${employees.filter(e => e.isWorking).length})` },
                                    { key: "not_working", label: `⚪ Not Working (${employees.filter(e => !e.isWorking).length})` },
                                ].map(f => (
                                    <button key={f.key} className={`st-filter-btn${filter === f.key ? " active" : ""}`}
                                        onClick={() => setFilter(f.key)}>
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ── Loading state ── */}
                        {dataLoading ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {[1, 2, 3].map(i => (
                                    <div key={i} style={{
                                        height: 68, borderRadius: 12, overflow: "hidden",
                                        background: "linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%)",
                                        backgroundSize: "200% 100%",
                                        animation: "shimmer 1.4s infinite",
                                    }} />
                                ))}
                                <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
                            </div>
                        ) : employees.length === 0 ? (
                            <div style={{
                                textAlign: "center", padding: "48px 20px",
                                background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB",
                            }}>
                                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginBottom: 6 }}>No employees to track</div>
                                <div style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.6 }}>
                                    Employees you assign tasks to will appear here automatically.
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* ── WORKING NOW section ── */}
                                {(filter === "all" || filter === "working") && (
                                    <div style={{ marginBottom: 20 }}>
                                        <div className="st-section">
                                            {/* Section header */}
                                            <div className="st-section-header" style={{
                                                background: working.length > 0 ? "#F0FDF4" : "#FAFAFA",
                                                borderBottom: `1px solid ${working.length > 0 ? "#DCFCE7" : "#F1F5F9"}`,
                                            }}>
                                                <span style={{
                                                    width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                                                    background: working.length > 0 ? "#16A34A" : "#D1D5DB",
                                                    display: "inline-block",
                                                    ...(working.length > 0 ? { animation: "pulse 2s infinite" } : {}),
                                                }} />
                                                <span style={{
                                                    fontSize: 12, fontWeight: 800, textTransform: "uppercase",
                                                    letterSpacing: "0.07em",
                                                    color: working.length > 0 ? "#166534" : "#94A3B8",
                                                }}>
                                                    Working Now
                                                </span>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                                                    background: working.length > 0 ? "#16A34A" : "#E5E7EB",
                                                    color: working.length > 0 ? "#fff" : "#9CA3AF",
                                                }}>
                                                    {working.length}
                                                </span>
                                                {working.length > 0 && (
                                                    <span style={{ fontSize: 10, color: "#16A34A", marginLeft: "auto", fontWeight: 500 }}>
                                                        Live · updates every second
                                                    </span>
                                                )}
                                            </div>

                                            {working.length === 0 ? (
                                                <div style={{ padding: "24px 20px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
                                                    {search ? "No working employees match your search" : "No one is working right now"}
                                                </div>
                                            ) : (
                                                working.map(emp => (
                                                    <EmployeeRow key={emp.employeeId} emp={emp}
                                                        onClick={() => setSelectedEmp(emp)} />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ── NOT WORKING section ── */}
                                {(filter === "all" || filter === "not_working") && (
                                    <div>
                                        <div className="st-section">
                                            {/* Section header */}
                                            <div className="st-section-header" style={{ background: "#FAFAFA", borderBottom: "1px solid #F1F5F9" }}>
                                                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#D1D5DB", display: "inline-block", flexShrink: 0 }} />
                                                <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94A3B8" }}>
                                                    Not Working
                                                </span>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                                                    background: "#E5E7EB", color: "#9CA3AF",
                                                }}>
                                                    {notWorking.length}
                                                </span>
                                            </div>

                                            {notWorking.length === 0 ? (
                                                <div style={{ padding: "24px 20px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
                                                    {search ? "No employees match your search" : "Everyone is currently working!"}
                                                </div>
                                            ) : (
                                                notWorking.map(emp => (
                                                    <EmployeeRow key={emp.employeeId} emp={emp}
                                                        onClick={() => setSelectedEmp(emp)} />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Empty search result */}
                                {filtered.length === 0 && !dataLoading && (
                                    <div style={{ padding: "32px 20px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
                                        No employees match "<strong>{search}</strong>"
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                </div>

                {/* ── RIGHT: Pending Deadline Approvals panel ── */}
                <div style={{
                    width: 300, minWidth: 280, maxWidth: 320, flexShrink: 0,
                    borderLeft: "1px solid #E5E7EB", background: "#FAFAFA",
                    padding: "16px 0", overflowY: "auto",
                    display: "flex", flexDirection: "column",
                }}
                    className="st-right-panel"
                >
                    <div style={{ padding: "0 16px 12px", borderBottom: "1px solid #E5E7EB", marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", display: "flex", alignItems: "center", gap: 6 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                            Deadline Approvals
                            {pendingDeadlineTasks.length > 0 && (
                                <span style={{ fontSize: 10, fontWeight: 800, background: "#D97706", color: "#fff", padding: "1px 7px", borderRadius: 99 }}>
                                    {pendingDeadlineTasks.length}
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>Employees waiting for your approval</div>
                    </div>

                    {pendingDeadlineTasks.length === 0 ? (
                        <div style={{ padding: "32px 16px", textAlign: "center" }}>
                            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>All caught up!</div>
                            <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.5 }}>No pending deadline approvals</div>
                        </div>
                    ) : pendingDeadlineTasks.map(task => {
                        const isExt = ["in_progress", "confirmed"].includes(task.prevStatusBeforeDeadlineProposal || "");
                        const isBusy = approvingId === task.id;
                        return (
                            <div key={task.id} style={{ padding: "12px 16px", borderBottom: "1px solid #F1F5F9" }}>
                                {/* Tag */}
                                <div style={{ marginBottom: 6 }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: 99, background: isExt ? "#FEF3C7" : "#EEF2FF", color: isExt ? "#92400E" : "#4F46E5" }}>
                                        {isExt ? "📅 Extension" : "📋 New Deadline"}
                                    </span>
                                </div>
                                {/* Task title */}
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {task.title}
                                </div>
                                {/* Employee name */}
                                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>
                                    👤 {task.proposedDeadlineByName || "Employee"}
                                </div>
                                {/* Proposed deadline */}
                                {task.proposedDeadline && (
                                    <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6, padding: "5px 8px", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                        {new Date(task.proposedDeadline).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </div>
                                )}
                                {/* 3-tab action panel */}
                                {(() => {
                                    const activeTab = counterFormTaskId === task.id ? "suggest" : rejectFormTaskId === task.id ? "reject" : null;
                                    const setTab = (t) => {
                                        setCounterFormTaskId(t === "suggest" ? task.id : null);
                                        setRejectFormTaskId(t === "reject" ? task.id : null);
                                        if (t !== "suggest") { setCounterDate(""); setCounterTime("09:00"); setCounterMsg(""); }
                                        if (t !== "reject") setRejectReason("");
                                    };
                                    return (
                                        <div>
                                            {/* Tab buttons */}
                                            <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #E5E7EB", marginBottom: activeTab ? 8 : 0 }}>
                                                {[
                                                    { key: "approve", label: "✓ Approve", color: "#166534", activeBg: "#DCFCE7", border: "#BBF7D0" },
                                                    { key: "suggest", label: "📅 Suggest Date", color: "#6D28D9", activeBg: "#EDE9FE", border: "#DDD6FE" },
                                                    { key: "reject", label: "✕ Reject", color: "#991B1B", activeBg: "#FEE2E2", border: "#FECDD3" },
                                                ].map((tab, i) => (
                                                    <button key={tab.key}
                                                        onClick={() => tab.key === "approve" ? handleApproveDeadline(task.id, true) : setTab(activeTab === tab.key ? null : tab.key)}
                                                        disabled={isBusy}
                                                        style={{
                                                            flex: 1, padding: "7px 2px", border: "none",
                                                            borderLeft: i > 0 ? "1px solid #E5E7EB" : "none",
                                                            fontFamily: "inherit", fontSize: 10, fontWeight: 700,
                                                            cursor: isBusy ? "not-allowed" : "pointer",
                                                            color: activeTab === tab.key ? tab.color : "#6B7280",
                                                            background: activeTab === tab.key ? tab.activeBg : "#fff",
                                                            opacity: isBusy ? 0.5 : 1,
                                                            transition: "all 0.1s",
                                                        }}>
                                                        {tab.key === "approve" && isBusy ? "…" : tab.label}
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Suggest Date form */}
                                            {activeTab === "suggest" && (
                                                <div>
                                                    <div style={{ display: "flex", gap: 5, marginBottom: 5 }}>
                                                        <input type="date" value={counterDate} min={new Date().toISOString().split("T")[0]}
                                                            onChange={e => setCounterDate(e.target.value)}
                                                            style={{ flex: 1, padding: "6px 7px", border: "1.5px solid #DDD6FE", borderRadius: 7, fontSize: 11, fontFamily: "inherit", outline: "none" }} />
                                                        <input type="time" value={counterTime} onChange={e => setCounterTime(e.target.value)}
                                                            style={{ width: 74, padding: "6px 3px", border: "1.5px solid #DDD6FE", borderRadius: 7, fontSize: 11, fontFamily: "inherit", outline: "none" }} />
                                                    </div>
                                                    <textarea value={counterMsg} onChange={e => setCounterMsg(e.target.value)}
                                                        placeholder="Message to employee (optional)..."
                                                        style={{ width: "100%", padding: "6px 8px", border: "1.5px solid #DDD6FE", borderRadius: 7, fontSize: 11, fontFamily: "inherit", resize: "none", minHeight: 44, outline: "none", boxSizing: "border-box", marginBottom: 6 }} />
                                                    <button onClick={() => handleCounterPropose(task.id)} disabled={!counterDate || isBusy}
                                                        style={{ width: "100%", padding: "7px", borderRadius: 7, border: "none", background: !counterDate || isBusy ? "#E5E7EB" : "#7C3AED", color: !counterDate || isBusy ? "#9CA3AF" : "#fff", fontSize: 11, fontWeight: 700, cursor: !counterDate || isBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                                                        {isBusy ? "Sending..." : "📅 Send Date to Employee"}
                                                    </button>
                                                </div>
                                            )}
                                            {/* Reject form */}
                                            {activeTab === "reject" && (
                                                <div>
                                                    <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                                                        placeholder="Reason for rejection..."
                                                        style={{ width: "100%", padding: "6px 8px", border: "1.5px solid #FECDD3", borderRadius: 7, fontSize: 11, fontFamily: "inherit", resize: "none", minHeight: 44, outline: "none", boxSizing: "border-box", marginBottom: 6 }} />
                                                    <button onClick={() => handleApproveDeadline(task.id, false, rejectReason)} disabled={!rejectReason.trim() || isBusy}
                                                        style={{ width: "100%", padding: "7px", borderRadius: 7, border: "none", background: !rejectReason.trim() || isBusy ? "#E5E7EB" : "#EF4444", color: !rejectReason.trim() || isBusy ? "#9CA3AF" : "#fff", fontSize: 11, fontWeight: 700, cursor: !rejectReason.trim() || isBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                                                        {isBusy ? "Sending..." : "Send Rejection"}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })}
                </div>

                {/* ── Detail Modal ── */}
                {selectedEmp && (
                    <EmployeeDetailModal
                        emp={selectedEmp}
                        rawSessions={rawSessionsMap.get(selectedEmp.employeeId)}
                        taskDataMap={taskDataMap}
                        onClose={() => setSelectedEmp(null)}
                    />
                )}
            </div>
        </>
    );
}