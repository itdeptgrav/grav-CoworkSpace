"use client";
/**
 * components/coworking/tasks/DeadlineBreakdown.jsx
 *
 * Renders the deadline window as an audit breakdown so CEO/TL and the
 * employee see the exact same story:
 *
 *   30m (original) + 20m + 10m = 60m asked
 *
 * Reads two fields set by the backend on every task:
 *   - task.originalWindowSecs : the first approved window (stable)
 *   - task.extensions[]       : one entry per approved extension
 *         [{ addedSecs, prevWindowSecs, newWindowSecs,
 *            approvedBy, approvedByName, approvedAt, viaCounter? }]
 *   - task.deadlineWindowSecs : total after all extensions (fallback when
 *                               originalWindowSecs is missing — legacy tasks)
 *
 * If neither field exists (or task has never had an approved deadline),
 * nothing renders — caller decides its own fallback.
 *
 * Drop-in usage anywhere the existing "Time Requested" or
 * "X min asked" label shows up:
 *
 *   <DeadlineBreakdown task={task} />
 *
 * Optional props:
 *   compact   boolean   → one-line compact layout (default: full)
 *   showList  boolean   → show the expandable extension history list
 */
import { useState } from "react";

function fmtSecs(s) {
    s = Math.max(0, Math.round(Number(s) || 0));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    if (s < 86400) {
        const h = Math.floor(s / 3600);
        const m = Math.round((s % 3600) / 60);
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    const d = Math.round(s / 86400);
    return d === 1 ? "1 day" : `${d} days`;
}

export default function DeadlineBreakdown({ task, compact = false, showList = true }) {
    const [open, setOpen] = useState(false);
    if (!task) return null;

    const total = Number(task.deadlineWindowSecs) || 0;
    if (total <= 0) return null;

    const extensions = Array.isArray(task.extensions) ? task.extensions : [];

    // Legacy tasks with no originalWindowSecs recorded: treat the current total
    // as the original (no breakdown possible). Avoids confusing "0 + 60 = 60".
    const original =
        Number(task.originalWindowSecs) > 0
            ? Number(task.originalWindowSecs)
            : total - extensions.reduce((s, e) => s + (Number(e.addedSecs) || 0), 0);

    const hasExtensions = extensions.length > 0;

    // One-line summary — e.g. "30m + 20m + 10m = 60m asked"
    const breakdownLine = hasExtensions
        ? [fmtSecs(original), ...extensions.map((e) => `+${fmtSecs(e.addedSecs)}`)].join(" ")
        : null;

    if (compact) {
        return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <span style={{ fontWeight: 700, color: "#0F172A" }}>
                    ⏱ {fmtSecs(total)} asked
                </span>
                {hasExtensions && (
                    <span style={{ color: "#64748B", fontFamily: "var(--mono,monospace)" }}>
                        ({breakdownLine})
                    </span>
                )}
            </span>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {/* Total — always shown */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                    fontSize: 12, fontWeight: 700, color: "#0F172A",
                    background: "#F1F5F9", padding: "3px 9px", borderRadius: 99,
                    display: "inline-flex", alignItems: "center", gap: 4,
                }}>
                    ⏱ {fmtSecs(total)} asked
                </span>
                {hasExtensions && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", background: "#F5F3FF", border: "1px solid #DDD6FE", padding: "2px 7px", borderRadius: 99 }}>
                        +{extensions.length} extension{extensions.length !== 1 ? "s" : ""}
                    </span>
                )}
            </div>

            {/* Breakdown — only when at least one extension exists */}
            {hasExtensions && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ fontSize: 11, color: "#475569", fontFamily: "var(--mono,monospace)" }}>
                        {fmtSecs(original)} <span style={{ color: "#94A3B8" }}>(original)</span>
                        {extensions.map((e, i) => (
                            <span key={i}>
                                <span style={{ color: "#94A3B8", margin: "0 4px" }}>+</span>
                                <span style={{ color: "#7C3AED", fontWeight: 600 }}>{fmtSecs(e.addedSecs)}</span>
                            </span>
                        ))}
                        <span style={{ color: "#94A3B8", margin: "0 6px" }}>=</span>
                        <strong style={{ color: "#0F172A" }}>{fmtSecs(total)}</strong>
                    </div>

                    {showList && (
                        <button
                            onClick={() => setOpen((o) => !o)}
                            style={{
                                alignSelf: "flex-start",
                                marginTop: 2,
                                padding: "2px 8px",
                                background: "transparent",
                                border: "1px solid #E2E8F0",
                                borderRadius: 6,
                                fontSize: 10, fontWeight: 600,
                                color: "#64748B",
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            {open ? "Hide history" : `View history (${extensions.length})`}
                        </button>
                    )}

                    {open && showList && (
                        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4, padding: "6px 10px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 7 }}>
                            {extensions.map((e, i) => {
                                const when = e.approvedAt ? new Date(e.approvedAt) : null;
                                const whenLabel = when && !isNaN(when)
                                    ? when.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) +
                                    " · " +
                                    when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                                    : "—";
                                return (
                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, lineHeight: 1.4 }}>
                                        <span style={{ fontWeight: 700, color: "#7C3AED" }}>
                                            +{fmtSecs(e.addedSecs)}
                                        </span>
                                        <span style={{ color: "#64748B" }}>
                                            · {fmtSecs(e.prevWindowSecs)} → {fmtSecs(e.newWindowSecs)}
                                        </span>
                                        <span style={{ color: "#94A3B8", marginLeft: "auto", fontFamily: "var(--mono,monospace)" }}>
                                            {whenLabel}
                                        </span>
                                        {e.approvedByName && (
                                            <span style={{ color: "#64748B", fontSize: 9.5 }}>
                                                by {e.approvedByName}
                                            </span>
                                        )}
                                        {e.viaCounter && (
                                            <span style={{ fontSize: 8, fontWeight: 700, color: "#0369A1", background: "#E0F2FE", padding: "1px 5px", borderRadius: 99 }}>
                                                counter
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}