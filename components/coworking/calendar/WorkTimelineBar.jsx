"use client";
/**
 * components/coworking/calendar/WorkTimelineBar.jsx
 *
 * Timeline bar for a selected date panel in the Employee Calendar.
 * Reads cowork_work_commits/{employeeId}/logs, filters to the selected date,
 * then renders proportional filled/gap segments across the day's working span.
 *
 * Rules:
 *  - Gap > 10 min → show blank space proportional to gap duration
 *  - Gap ≤ 10 min → merge into the continuous run (no visual break)
 *  - Scale is proportional to total time span (earliest start → latest end)
 *  - Hour markers drawn at natural 1-hr boundaries within the span
 *  - Each segment is colored per task (same hash palette as calendar bars)
 *  - Tooltip on hover shows task title + start–end + duration
 */

import { useState, useEffect, useRef } from "react";

const GAP_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

const TASK_COLORS = [
    "#0D9488", "#7C3AED", "#EC4899", "#65A30D", "#06B6D4",
    "#6366F1", "#10B981", "#D97706", "#D946EF", "#EA580C",
    "#3B82F6", "#A855F7", "#16A34A", "#F43F5E", "#0EA5E9", "#DC2626",
];

function taskColor(taskId = "") {
    let h = 0;
    for (let i = 0; i < taskId.length; i++) { h = ((h << 5) - h) + taskId.charCodeAt(i); h |= 0; }
    return TASK_COLORS[Math.abs(h) % TASK_COLORS.length];
}

function fmtTime(ms) {
    const d = new Date(ms);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function fmtDur(ms) {
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 60) return `${totalMin}m`;
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Segment tooltip ───────────────────────────────────────────────────────────
function SegTip({ seg, mousePos }) {
    return (
        <div style={{
            position: "fixed",
            left: Math.min(mousePos.x + 14, window.innerWidth - 210),
            top: mousePos.y - 70,
            background: "#1F2937",
            color: "#F9FAFB",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 11,
            lineHeight: 1.6,
            whiteSpace: "nowrap",
            zIndex: 9999,
            pointerEvents: "none",
            boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
        }}>
            <div style={{ fontWeight: 700, color: "#fff", marginBottom: 3 }}>{seg.taskTitle}</div>
            <div style={{ color: "#9CA3AF" }}>
                {fmtTime(seg.startMs)} → {fmtTime(seg.endMs)}
            </div>
            <div style={{ color: "#6EE7B7", fontWeight: 600 }}>{fmtDur(seg.endMs - seg.startMs)}</div>
        </div>
    );
}

// ── GapLabel ──────────────────────────────────────────────────────────────────
function GapLabel({ gap }) {
    return (
        <div style={{
            position: "absolute",
            left: `${gap._left}%`,
            width: `${gap._width}%`,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
        }}>
            <span style={{
                fontSize: 9,
                fontWeight: 600,
                color: "#9CA3AF",
                background: "#F8FAFC",
                padding: "1px 5px",
                borderRadius: 4,
                border: "1px solid #E5E7EB",
                whiteSpace: "nowrap",
                overflow: "hidden",
                maxWidth: "90%",
                textOverflow: "ellipsis",
            }}>
                {fmtDur(gap.durationMs)} idle
            </span>
        </div>
    );
}

// ── Hour markers ──────────────────────────────────────────────────────────────
function HourMarkers({ spanStartMs, spanEndMs, spanMs }) {
    if (spanMs <= 0) return null;
    // Find first full hour boundary after spanStart
    const startH = new Date(spanStartMs);
    startH.setMinutes(0, 0, 0);
    startH.setHours(startH.getHours() + 1);

    const markers = [];
    let cur = startH.getTime();
    while (cur < spanEndMs) {
        const pct = ((cur - spanStartMs) / spanMs) * 100;
        if (pct > 2 && pct < 98) {
            markers.push({ ms: cur, pct });
        }
        cur += 3600000;
    }

    return (
        <>
            {markers.map(m => (
                <div key={m.ms} style={{
                    position: "absolute",
                    left: `${m.pct}%`,
                    top: 0,
                    bottom: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    pointerEvents: "none",
                }}>
                    <div style={{ width: 1, height: "100%", background: "#E5E7EB", opacity: 0.7 }} />
                    <div style={{
                        position: "absolute",
                        bottom: -16,
                        fontSize: 9,
                        color: "#9CA3AF",
                        whiteSpace: "nowrap",
                        transform: "translateX(-50%)",
                    }}>
                        {fmtTime(m.ms)}
                    </div>
                </div>
            ))}
        </>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WorkTimelineBar({ employeeId, selectedDate, tasksForDay }) {
    const [logs, setLogs] = useState(null); // null=loading, []=empty, [...]
    const [error, setError] = useState(null);
    const [hoveredSeg, setHoveredSeg] = useState(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const containerRef = useRef(null);
    const [officeSchedule, setOfficeSchedule] = useState(null);

    // ── Fetch office schedule once ────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const { doc, getDoc } = await import("firebase/firestore");
                const { firebaseDb } = await import("../../../lib/coworkFirebase");
                const snap = await getDoc(doc(firebaseDb, "cowork_settings", "office"));
                if (snap.exists()) setOfficeSchedule(snap.data().schedule || null);
            } catch (e) { console.error("[WorkTimelineBar] schedule fetch:", e.message); }
        })();
    }, []);

    // ── Fetch logs for all tasks on selectedDate ──────────────────────────────
    useEffect(() => {
        if (!employeeId || !selectedDate) return;
        setLogs(null);
        setError(null);
        setHoveredSeg(null);

        (async () => {
            try {
                const { collection, query, where, getDocs } = await import("firebase/firestore");
                const { firebaseDb } = await import("../../../lib/coworkFirebase");

                const dayStart = new Date(selectedDate);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(selectedDate);
                dayEnd.setHours(23, 59, 59, 999);

                // Fetch all commits for this employee and filter by date in JS
                // (Firestore Timestamp comparison requires server-side index we may not have)
                const { query: _wq, orderBy: _wo, limit: _wl } = await import("firebase/firestore");
                const snap = await getDocs(
                    _wq(
                        collection(firebaseDb, "cowork_work_commits", employeeId, "logs"),
                        _wo("stoppedAt", "desc"),
                        _wl(200)
                    )
                );

                const dayLogs = [];
                snap.docs.forEach(d => {
                    const data = d.data();
                    // stoppedAt can be Firestore Timestamp or ISO string
                    const stoppedMs = data.stoppedAt?.seconds
                        ? data.stoppedAt.seconds * 1000
                        : data.stoppedAt ? new Date(data.stoppedAt).getTime() : null;
                    if (!stoppedMs) return;

                    const secondsWorked = Number(data.secondsWorked) || 0;
                    if (secondsWorked <= 0) return;

                    const startMs = stoppedMs - secondsWorked * 1000;

                    // Session overlaps with selected date?
                    if (startMs > dayEnd.getTime() || stoppedMs < dayStart.getTime()) return;

                    dayLogs.push({
                        taskId: data.taskId || "unknown",
                        taskTitle: data.taskTitle || data.taskId || "Task",
                        startMs: Math.max(startMs, dayStart.getTime()),
                        endMs: Math.min(stoppedMs, dayEnd.getTime()),
                        message: data.message || "",
                    });
                });

                // Sort chronologically
                dayLogs.sort((a, b) => a.startMs - b.startMs);
                setLogs(dayLogs);
            } catch (e) {
                console.error("[WorkTimelineBar]", e.message);
                setError(e.message);
            }
        })();
    }, [employeeId, selectedDate]);

    // ── Build segments and gaps ───────────────────────────────────────────────
    const { segments, gaps, spanStartMs, spanEndMs, spanMs, totalWorkedMs } = (() => {
        if (!logs || logs.length === 0) return { segments: [], gaps: [], spanStartMs: 0, spanEndMs: 0, spanMs: 0, totalWorkedMs: 0 };

        // Merge overlapping/close sessions into runs
        const merged = [];
        let cur = { ...logs[0] };
        for (let i = 1; i < logs.length; i++) {
            const l = logs[i];
            const gapMs = l.startMs - cur.endMs;
            if (gapMs <= GAP_THRESHOLD_MS) {
                // Merge — extend current run, keep most recent task info for labeling
                cur.endMs = Math.max(cur.endMs, l.endMs);
            } else {
                merged.push({ ...cur, type: "work" });
                merged.push({ startMs: cur.endMs, endMs: l.startMs, type: "gap", durationMs: gapMs });
                cur = { ...l };
            }
        }
        merged.push({ ...cur, type: "work" });

        const spanStartMs = merged[0].startMs;
        const spanEndMs = merged[merged.length - 1].endMs;
        const spanMs = spanEndMs - spanStartMs;

        // Compute proportional positions
        const segments = [];
        const gaps = [];
        let totalWorkedMs = 0;

        merged.forEach(m => {
            const _left = spanMs > 0 ? ((m.startMs - spanStartMs) / spanMs) * 100 : 0;
            const _width = spanMs > 0 ? ((m.endMs - m.startMs) / spanMs) * 100 : 100;
            if (m.type === "work") {
                // Find the original log entry that best matches this merged segment
                // Use the task with the most time in this segment
                const matchingLog = logs.reduce((best, l) => {
                    const overlap = Math.min(l.endMs, m.endMs) - Math.max(l.startMs, m.startMs);
                    const bestOverlap = best ? Math.min(best.endMs, m.endMs) - Math.max(best.startMs, m.startMs) : -1;
                    return overlap > bestOverlap ? l : best;
                }, null);
                totalWorkedMs += (m.endMs - m.startMs);
                segments.push({ ...m, _left, _width, taskId: matchingLog?.taskId || "unknown", taskTitle: matchingLog?.taskTitle || "Work" });
            } else {
                gaps.push({ ...m, _left, _width });
            }
        });

        return { segments, gaps, spanStartMs, spanEndMs, spanMs, totalWorkedMs };
    })();

    // ── Render ────────────────────────────────────────────────────────────────
    const dateLabel = selectedDate
        ? (() => { const [y, m, d] = selectedDate.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }); })()
        : "";

    return (
        <div style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{dateLabel}</div>
                    {logs && logs.length > 0 && (
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                            {fmtDur(totalWorkedMs)} worked across {logs.length} session{logs.length !== 1 ? "s" : ""}
                        </div>
                    )}
                </div>
                {logs && logs.length > 0 && (
                    <div style={{
                        fontSize: 11, fontWeight: 700,
                        padding: "3px 10px", borderRadius: 20,
                        background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0"
                    }}>
                        {fmtDur(totalWorkedMs)}
                    </div>
                )}
            </div>

            {/* Loading */}
            {logs === null && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 0", color: "#9CA3AF", fontSize: 12 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                        style={{ animation: "wt-spin 1s linear infinite", flexShrink: 0 }}>
                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    Loading work sessions…
                    <style>{`@keyframes wt-spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{ fontSize: 11, color: "#DC2626", padding: "8px 10px", background: "#FEF2F2", borderRadius: 6 }}>
                    ⚠ {error}
                </div>
            )}

            {/* Empty */}
            {logs !== null && !error && logs.length === 0 && (
                <div style={{
                    padding: "20px 0", textAlign: "center",
                    color: "#9CA3AF", fontSize: 12,
                    border: "1px dashed #E5E7EB", borderRadius: 8
                }}>
                    No timer sessions recorded for this day.
                </div>
            )}

            {/* Timeline */}
            {logs !== null && !error && logs.length > 0 && (
                <div>
                    {/* Track */}
                    <div
                        ref={containerRef}
                        style={{
                            position: "relative",
                            height: 28,
                            background: "#F1F5F9",
                            borderRadius: 6,
                            overflow: "visible",
                            marginBottom: 28, // space for hour labels below
                        }}
                    >
                        {/* Hour markers */}
                        <HourMarkers spanStartMs={spanStartMs} spanEndMs={spanEndMs} spanMs={spanMs} />

                        {/* Work segments */}
                        {segments.map((seg, i) => (
                            <div
                                key={i}
                                onMouseEnter={() => setHoveredSeg(i)}
                                onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setHoveredSeg(null)}
                                style={{
                                    position: "absolute",
                                    left: `${seg._left}%`,
                                    width: `${seg._width}%`,
                                    top: 0,
                                    height: "100%",
                                    background: taskColor(seg.taskId),
                                    borderRadius:
                                        seg._left === 0 && (seg._left + seg._width >= 99.5)
                                            ? 6
                                            : seg._left === 0 ? "6px 0 0 6px"
                                                : (seg._left + seg._width >= 99.5) ? "0 6px 6px 0"
                                                    : 0,
                                    cursor: "pointer",
                                    transition: "filter 0.1s",
                                    filter: hoveredSeg === i ? "brightness(1.1)" : "brightness(1)",
                                    zIndex: hoveredSeg === i ? 10 : 1,
                                }}
                            >
                                {/* Segment label (only if wide enough) */}
                                {seg._width > 8 && (
                                    <span style={{
                                        position: "absolute",
                                        inset: 0,
                                        display: "flex",
                                        alignItems: "center",
                                        paddingLeft: 6,
                                        fontSize: 9,
                                        fontWeight: 700,
                                        color: "#fff",
                                        overflow: "hidden",
                                        whiteSpace: "nowrap",
                                        textOverflow: "ellipsis",
                                        pointerEvents: "none",
                                        textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                                    }}>
                                        {seg.taskTitle}
                                    </span>
                                )}


                            </div>
                        ))}

                        {/* Gap labels */}
                        {gaps.map((gap, i) => (
                            gap._width > 4 && <GapLabel key={i} gap={gap} />
                        ))}

                        {/* Floating tooltip — rendered outside segments to avoid clip */}
                        {hoveredSeg !== null && segments[hoveredSeg] && (
                            <SegTip seg={segments[hoveredSeg]} mousePos={mousePos} />
                        )}

                        {/* Start / End time labels */}
                        <div style={{
                            position: "absolute",
                            left: 0,
                            bottom: -16,
                            fontSize: 9,
                            color: "#6B7280",
                            fontWeight: 600,
                        }}>
                            {fmtTime(spanStartMs)}
                        </div>
                        <div style={{
                            position: "absolute",
                            right: 0,
                            bottom: -16,
                            fontSize: 9,
                            color: "#6B7280",
                            fontWeight: 600,
                        }}>
                            {fmtTime(spanEndMs)}
                        </div>
                    </div>

                    {/* Legend */}
                    {(() => {
                        const uniqueTasks = [...new Map(logs.map(l => [l.taskId, l])).values()];
                        const visible = uniqueTasks.slice(0, 4);
                        const overflow = uniqueTasks.length - 4;
                        return (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, alignItems: "center" }}>
                                {visible.map(l => (
                                    <div key={l.taskId} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                        <div style={{ width: 10, height: 10, borderRadius: 2, background: taskColor(l.taskId), flexShrink: 0 }} />
                                        <span style={{ fontSize: 10, color: "#374151" }}>{l.taskTitle}</span>
                                    </div>
                                ))}
                                {overflow > 0 && (
                                    <span style={{ fontSize: 10, color: "#9CA3AF" }}>+{overflow} more</span>
                                )}
                                {gaps.length > 0 && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 4 }}>
                                        <div style={{ width: 10, height: 10, borderRadius: 2, background: "#F1F5F9", border: "1px dashed #D1D5DB", flexShrink: 0 }} />
                                        <span style={{ fontSize: 10, color: "#9CA3AF" }}>Idle &gt;10m</span>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                    {/* ── Office Hours Split Summary ── */}
                    {logs && logs.length > 0 && officeSchedule && (() => {
                        const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
                        const parseMins = t => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
                        let officeMs = 0, afterMs = 0;
                        logs.forEach(({ startMs, endMs }) => {
                            // Walk second by second is too slow — split at office boundary instead
                            const d = new Date(startMs);
                            const dayKey = DAY_KEYS[d.getDay()];
                            const dayCfg = officeSchedule[dayKey];
                            if (!dayCfg || dayCfg.isOff) { afterMs += endMs - startMs; return; }
                            const inMins = parseMins(dayCfg.inTime);
                            const outMins = parseMins(dayCfg.outTime);
                            const baseDate = new Date(startMs); baseDate.setHours(0, 0, 0, 0);
                            const officeStart = baseDate.getTime() + inMins * 60000;
                            const officeEnd = baseDate.getTime() + outMins * 60000;
                            // Overlap with office hours
                            const oStart = Math.max(startMs, officeStart);
                            const oEnd = Math.min(endMs, officeEnd);
                            const overlap = Math.max(0, oEnd - oStart);
                            officeMs += overlap;
                            afterMs += (endMs - startMs) - overlap;
                        });
                        const fmtMs = ms => {
                            const s = Math.round(ms / 1000);
                            if (s < 60) return `${s}s`;
                            if (s < 3600) return `${Math.round(s / 60)}m`;
                            const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
                            return m > 0 ? `${h}h ${m}m` : `${h}h`;
                        };
                        return (
                            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                                <div style={{ flex: 1, padding: "10px 14px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Office Hours</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#16A34A", fontFamily: "monospace" }}>{fmtMs(officeMs)}</div>
                                    <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>worked within {officeSchedule[DAY_KEYS[new Date(selectedDate).getDay()]]?.inTime} – {officeSchedule[DAY_KEYS[new Date(selectedDate).getDay()]]?.outTime}</div>
                                </div>
                                <div style={{ flex: 1, padding: "10px 14px", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "#D97706", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>After Hours</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#D97706", fontFamily: "monospace" }}>{fmtMs(afterMs)}</div>
                                    <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>worked outside office hours</div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Session list */}
                    {logs.length > 0 && (
                        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
                            {logs.map((l, i) => (
                                <div key={i} style={{
                                    display: "flex", alignItems: "center", gap: 10,
                                    padding: "5px 8px", borderRadius: 5,
                                    background: "#F8FAFC", border: "1px solid #E5E7EB",
                                    fontSize: 11,
                                }}>
                                    <div style={{
                                        width: 8, height: 8, borderRadius: "50%",
                                        background: taskColor(l.taskId), flexShrink: 0
                                    }} />
                                    <span style={{ flex: 1, color: "#1F2937", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {l.taskTitle}
                                    </span>
                                    <span style={{ color: "#6B7280", flexShrink: 0 }}>
                                        {fmtTime(l.startMs)} – {fmtTime(l.endMs)}
                                    </span>
                                    <span style={{ color: "#065F46", fontWeight: 700, flexShrink: 0, background: "#ECFDF5", padding: "1px 6px", borderRadius: 4 }}>
                                        {fmtDur(l.endMs - l.startMs)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}