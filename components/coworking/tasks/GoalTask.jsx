"use client";
import { useState } from "react";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function getToken() {
    const { firebaseAuth } = await import("../../../lib/coworkFirebase");
    return firebaseAuth.currentUser?.getIdToken();
}

function fmtNum(n, type, unit) {
    if (n === null || n === undefined) return "0";
    if (type === "amount") return "₹" + Number(n).toLocaleString("en-IN");
    if (type === "percentage") return n + (unit || "%");
    return Number(n).toLocaleString("en-IN") + (unit ? " " + unit : "");
}

function daysLeft(dateStr) {
    if (!dateStr) return null;
    const diff = new Date(dateStr) - new Date();
    return Math.ceil(diff / 86400000);
}

function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/* ─── Progress Bar ─── */
function ProgressBar({ pct, color }) {
    const c = color || (pct >= 100 ? "#059669" : pct >= 75 ? "#2563EB" : pct >= 50 ? "#D97706" : "#DC2626");
    return (
        <div style={{ background: "#F1F5F9", borderRadius: 99, height: 10, overflow: "hidden", width: "100%" }}>
            <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: c, borderRadius: 99, transition: "width 0.4s ease" }} />
        </div>
    );
}

/* ─── Milestone row ─── */
function MilestoneRow({ ms, achievedPct }) {
    const done = achievedPct >= ms.pct;
    const overdue = !done && ms.date && new Date(ms.date) < new Date();
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "0.5px solid #F1F5F9" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: done ? "#DCFCE7" : overdue ? "#FEE2E2" : "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>
                {done ? "✅" : overdue ? "⚠️" : "⬜"}
            </div>
            <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: done ? "#166534" : overdue ? "#991B1B" : "#374151" }}>{ms.pct}% milestone</span>
                {ms.label && <span style={{ fontSize: 11, color: "#64748B", marginLeft: 6 }}>{ms.label}</span>}
            </div>
            <span style={{ fontSize: 11, color: done ? "#166534" : overdue ? "#DC2626" : "#94A3B8" }}>{fmtDate(ms.date)}</span>
        </div>
    );
}

/* ─── Update log entry ─── */
function UpdateEntry({ u, goalConfig }) {
    const ts = u.createdAt?.seconds ? new Date(u.createdAt.seconds * 1000) : new Date(u.createdAt);
    return (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 0", borderBottom: "0.5px solid #F1F5F9" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>📈</div>
            <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#1D4ED8" }}>+{fmtNum(u.addedValue, goalConfig?.goalType, goalConfig?.unit)}</span>
                    <span style={{ fontSize: 10, color: "#94A3B8" }}>by {u.loggedByName}</span>
                    <span style={{ fontSize: 10, color: "#CBD5E1" }}>·</span>
                    <span style={{ fontSize: 10, color: "#94A3B8" }}>{ts.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} {ts.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {u.note && <p style={{ fontSize: 11, color: "#374151", margin: "3px 0 0", lineHeight: 1.5 }}>{u.note}</p>}
                {/* For percentage type — show completed/pending */}
                {goalConfig?.goalType === "percentage" && u.currentValue !== undefined && (
                    <div style={{ fontSize: 10, color: "#64748B", marginTop: 3 }}>
                        <span style={{ color: "#166534", fontWeight: 600 }}>{u.currentValue} completed</span>
                        {" · "}
                        <span style={{ color: "#DC2626", fontWeight: 600 }}>{Math.max(0, (goalConfig.baseline || 0) - u.currentValue)} pending</span>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Main GoalTask component ─── */
export default function GoalTask({ task, isAssignee, isCEO, isTL, onRefresh }) {
    const gc = task.goalConfig || {};
    const updates = [...(task.goalUpdates || [])].sort((a, b) =>
        (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
    );

    const target = Number(gc.targetValue) || 0;
    const baseline = Number(gc.baseline) || 0;
    const achieved = Number(task.goalAchieved) || 0;
    const isPercentage = gc.goalType === "percentage";

    // For percentage: achieved = how much the number has moved from baseline
    // e.g. baseline=100, current=88, reduction achieved = 12
    const achievedPct = isPercentage
        ? target > 0 ? Math.round(((baseline - achieved) / (baseline * (target / 100))) * 100) : 0
        : target > 0 ? Math.round((achieved / target) * 100) : 0;

    const exceeded = achievedPct > 100;
    const dl = daysLeft(gc.deadline);
    const deadlinePassed = dl !== null && dl < 0;
    const milestones = gc.milestones || [];

    // Form state
    const [addedValue, setAddedValue] = useState("");
    const [currentValue, setCurrentValue] = useState(""); // for percentage type
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async () => {
        const val = isPercentage ? parseFloat(currentValue) : parseFloat(addedValue);
        if (isNaN(val) || val < 0) { setError("Please enter a valid number."); return; }
        setSubmitting(true); setError("");
        try {
            const token = await getToken();
            const res = await fetch(`${BASE}/cowork/task/${task.taskId}/goal-update`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    addedValue: isPercentage ? Math.max(0, baseline - val) - achieved : val,
                    currentValue: isPercentage ? val : undefined,
                    note,
                }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || "Failed");
            setAddedValue(""); setCurrentValue(""); setNote("");
            onRefresh?.();
        } catch (e) { setError(e.message); }
        finally { setSubmitting(false); }
    };

    const barColor = exceeded ? "#059669" : achievedPct >= 75 ? "#2563EB" : achievedPct >= 50 ? "#D97706" : "#DC2626";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%", overflowY: "auto" }}>
            <div style={{ padding: "12px 14px 0", display: "flex", flexDirection: "column", gap: 12 }}>

                {/* ── Goal header card ── */}
                <div style={{ background: "#F8FAFC", border: "1.5px solid #E2E8F0", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>🎯 Goal</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1E293B" }}>{gc.goalDescription || "Achieve target"}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 10, color: "#64748B" }}>Deadline</div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: deadlinePassed ? "#DC2626" : dl !== null && dl <= 7 ? "#D97706" : "#1E293B" }}>
                                {deadlinePassed ? `⚠️ ${Math.abs(dl)}d overdue` : dl !== null ? `${dl}d left` : fmtDate(gc.deadline)}
                            </div>
                            <div style={{ fontSize: 10, color: "#94A3B8" }}>{fmtDate(gc.deadline)}</div>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                            <span style={{ fontSize: 11, color: "#374151" }}>
                                {isPercentage
                                    ? <><b style={{ color: barColor }}>{baseline - achieved}</b> completed · <b style={{ color: "#DC2626" }}>{Math.max(0, achieved)} pending</b></>
                                    : <><b style={{ color: barColor }}>{fmtNum(achieved, gc.goalType, gc.unit)}</b> / {fmtNum(target, gc.goalType, gc.unit)}</>
                                }
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: exceeded ? "#059669" : barColor }}>
                                {exceeded ? `🎉 ${achievedPct}%` : `${achievedPct}%`}
                            </span>
                        </div>
                        <ProgressBar pct={achievedPct} color={barColor} />
                    </div>

                    {/* Exceeded message */}
                    {exceeded && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#059669", background: "#DCFCE7", padding: "4px 8px", borderRadius: 5, textAlign: "center" }}>
                            🎉 Target exceeded! Outstanding performance.
                        </div>
                    )}

                    {/* Deadline passed + partial */}
                    {deadlinePassed && !exceeded && achievedPct < 100 && (
                        <div style={{ fontSize: 11, color: "#991B1B", background: "#FEE2E2", padding: "4px 8px", borderRadius: 5, textAlign: "center" }}>
                            ⛔ Deadline passed — {achievedPct}% achieved ({achievedPct < 50 ? "Missed" : "Partial"})
                        </div>
                    )}
                </div>

                {/* ── Milestones ── */}
                {milestones.length > 0 && (
                    <div style={{ background: "#FAFAFA", border: "1.5px solid #E2E8F0", borderRadius: 10, padding: "10px 14px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Milestones</div>
                        {milestones.map((ms, i) => <MilestoneRow key={i} ms={ms} achievedPct={achievedPct} />)}
                    </div>
                )}

                {/* ── Update form — employee only, not past deadline ── */}
                {isAssignee && !deadlinePassed && !exceeded && (
                    <div style={{ background: "#F8FAFC", border: "1.5px solid #E2E8F0", borderRadius: 10, padding: "12px 14px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Log Progress</div>

                        {isPercentage ? (
                            <div style={{ marginBottom: 8 }}>
                                <label style={{ fontSize: 11, color: "#374151", display: "block", marginBottom: 4 }}>
                                    Current value (e.g. tickets now = 88)
                                </label>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <input type="number" value={currentValue} onChange={e => setCurrentValue(e.target.value)} placeholder={`Current count (baseline was ${baseline})`}
                                        style={{ flex: 1, padding: "7px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
                                    <div style={{ fontSize: 11, color: "#64748B", flexShrink: 0 }}>
                                        {currentValue && !isNaN(currentValue)
                                            ? <><b style={{ color: "#166534" }}>{Math.max(0, baseline - Number(currentValue))} done</b> · <b style={{ color: "#DC2626" }}>{Math.max(0, Number(currentValue))} pending</ b></>
                                            : "enter value"}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ marginBottom: 8 }}>
                                <label style={{ fontSize: 11, color: "#374151", display: "block", marginBottom: 4 }}>
                                    How much did you achieve? (added this time)
                                </label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input type="number" value={addedValue} onChange={e => setAddedValue(e.target.value)} placeholder="e.g. 5000000"
                                        style={{ flex: 1, padding: "7px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
                                    <span style={{ padding: "7px 10px", background: "#F1F5F9", borderRadius: 7, fontSize: 11, color: "#64748B", whiteSpace: "nowrap" }}>
                                        {gc.unit || (gc.goalType === "amount" ? "₹" : gc.goalType === "percentage" ? "%" : "units")}
                                    </span>
                                </div>
                            </div>
                        )}

                        <textarea placeholder="Add a note (optional)..." value={note} onChange={e => setNote(e.target.value)}
                            style={{ width: "100%", minHeight: 48, padding: "7px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", resize: "vertical", outline: "none", background: "#fff", boxSizing: "border-box", marginBottom: 8 }} />

                        {error && <div style={{ fontSize: 11, color: "#991B1B", marginBottom: 6 }}>{error}</div>}

                        <button disabled={submitting} onClick={handleSubmit}
                            style={{ width: "100%", padding: "8px 12px", borderRadius: 7, border: "none", background: submitting ? "#94A3B8" : "#7C3AED", color: "#fff", fontSize: 12, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                            {submitting ? "Saving…" : "Log Progress Update"}
                        </button>
                    </div>
                )}

                {/* CEO/TL — stale warning */}
                {(isCEO || isTL) && !exceeded && updates.length === 0 && (
                    <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 10px", fontSize: 11, color: "#92400E" }}>
                        ⚠️ No progress updates yet from employee.
                    </div>
                )}

                {/* ── Update history ── */}
                {updates.length > 0 && (
                    <div style={{ background: "#FAFAFA", border: "1.5px solid #E2E8F0", borderRadius: 10, padding: "10px 14px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                            Progress History ({updates.length})
                        </div>
                        {updates.map((u, i) => <UpdateEntry key={i} u={u} goalConfig={gc} />)}
                    </div>
                )}

                <div style={{ height: 16 }} />
            </div>
        </div>
    );
}