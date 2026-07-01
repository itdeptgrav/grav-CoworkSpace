/**
 * components/coworking/tasks/PriorityChangeAckModal.jsx
 *
 * Blocking, non-dismissable modal shown to an employee whenever one or more
 * of their tasks had its deadline auto-extended because a higher-priority
 * task jumped the queue (fired from checkAndExtendForP1 on the backend).
 *
 * Reads from the `tasks` array already being kept live by the parent page
 * (no separate Firestore listener) — scans for deadlineAutoExtendedHistory
 * entries with acknowledgedByEmployee === false belonging to this employee,
 * groups entries from the same swap event (same shiftedByTaskId + at) into
 * ONE modal, plays a short two-tone chime on first appearance, and on
 * Confirm: pauses whatever timer is currently running (if any) and writes
 * acknowledgedByEmployee: true back to each entry shown.
 *
 * No Cancel button, no backdrop-click-to-close, no X — by design, per spec:
 * "this box not removable, always shows... after confirm it goes."
 */
"use client";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const F = { fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif" };

function ModalPortal({ children }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;
    return createPortal(children, document.body);
}

function playAckChime() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const tone = (freq, startAt, dur) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = "sine";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt);
            gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + startAt + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + dur);
            osc.start(ctx.currentTime + startAt);
            osc.stop(ctx.currentTime + startAt + dur + 0.02);
        };
        tone(880, 0, 0.32);
        tone(1175, 0.16, 0.32);
    } catch (e) { /* non-critical */ }
}

function fmtDateTime(iso) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
}

function fmtElapsed(secs) {
    const s = Math.max(0, Math.round(Number(secs) || 0));
    const m = Math.floor(s / 60);
    if (m < 1) return `${s}s`;
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function PriorityChangeAckModal({ employeeId, tasks, timerActiveTaskId, timerSessionMap, timerPause }) {
    const [pendingGroup, setPendingGroup] = useState(null);
    const [confirming, setConfirming] = useState(false);
    const lastChimeKeyRef = useRef(null);

    // ── Scan for unacknowledged entries belonging to this employee ──────────
    useEffect(() => {
        if (!Array.isArray(tasks) || !employeeId) { setPendingGroup(null); return; }

        const myTasks = tasks.filter(t => (t.assigneeIds || []).includes(employeeId));
        const unack = [];
        myTasks.forEach(t => {
            (t.deadlineAutoExtendedHistory || []).forEach(h => {
                if (h.acknowledgedByEmployee === false) {
                    unack.push({ ...h, taskId: t.taskId || t.id, taskTitle: t.title });
                }
            });
        });

        if (!unack.length) { setPendingGroup(null); return; }

        // Group entries from the same swap event — identical shiftedByTaskId + at
        // across every task that got bumped in that one action.
        const key = `${unack[0].shiftedByTaskId}|${unack[0].at}`;
        const group = unack.filter(e => `${e.shiftedByTaskId}|${e.at}` === key);

        setPendingGroup({
            key,
            entries: group,
            shiftedByTaskTitle: group[0].shiftedByTaskTitle,
            reason: group[0].reason || null,
            changedByName: group[0].changedByName || null,
            at: group[0].at,
        });
    }, [tasks, employeeId]);

    // ── Chime once per new group, not on every re-render ─────────────────────
    useEffect(() => {
        if (pendingGroup && lastChimeKeyRef.current !== pendingGroup.key) {
            lastChimeKeyRef.current = pendingGroup.key;
            playAckChime();
        }
    }, [pendingGroup]);

    if (!pendingGroup) return null;

    const activeTaskTitle = timerActiveTaskId
        ? (tasks.find(t => (t.taskId || t.id) === timerActiveTaskId)?.title || timerActiveTaskId)
        : null;
    const activeElapsedSecs = timerActiveTaskId
        ? (timerSessionMap?.get?.(timerActiveTaskId)?.totalSeconds || 0)
        : 0;

    const handleConfirm = async () => {
        if (confirming) return;
        setConfirming(true);
        try {
            if (timerActiveTaskId && typeof timerPause === "function") {
                await timerPause(timerActiveTaskId, activeTaskTitle, { autoReason: "priority_change_ack" });
            }

            const { firebaseDb } = await import("../../../lib/coworkFirebase");
            const { doc, getDoc, updateDoc } = await import("firebase/firestore");

            for (const entry of pendingGroup.entries) {
                const ref = doc(firebaseDb, "cowork_tasks", entry.taskId);
                const snap = await getDoc(ref);
                if (!snap.exists()) continue;
                const history = snap.data().deadlineAutoExtendedHistory || [];
                const updated = history.map(h =>
                    (h.shiftedByTaskId === entry.shiftedByTaskId && h.at === entry.at)
                        ? { ...h, acknowledgedByEmployee: true }
                        : h
                );
                await updateDoc(ref, { deadlineAutoExtendedHistory: updated });
            }
        } catch (e) {
            console.error("[PriorityChangeAckModal] confirm failed:", e.message);
        } finally {
            setConfirming(false);
            setPendingGroup(null);
        }
    };

    return (
        <ModalPortal>
            <style>{`@keyframes pcam-in{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}`}</style>

            {/* Backdrop — intentionally no onClick handler, modal cannot be dismissed by clicking outside */}
            <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.65)", zIndex: 10500, backdropFilter: "blur(4px)" }} />

            <div style={{ position: "fixed", inset: 0, zIndex: 10501, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...F }}>
                <div style={{
                    background: "#fff", borderRadius: 16, width: "min(480px,96vw)", maxHeight: "88vh",
                    display: "flex", flexDirection: "column", overflow: "hidden",
                    boxShadow: "0 32px 80px rgba(0,0,0,0.35)", animation: "pcam-in 0.22s cubic-bezier(0.32,0.72,0,1) both",
                }}>
                    {/* Header */}
                    <div style={{ padding: "18px 20px 14px", background: "#FFF7ED", borderBottom: "1px solid #FED7AA", flexShrink: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: "#FFEDD5", border: "1px solid #FDBA74", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 19 }}>⚠️</div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: "#9A3412" }}>Task Priority Changed</div>
                                <div style={{ fontSize: 12, color: "#C2410C", marginTop: 2 }}>
                                    by {pendingGroup.changedByName || "your manager"}, because <strong>"{pendingGroup.shiftedByTaskTitle}"</strong> took priority
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Body */}
                    <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
                        {pendingGroup.entries.map(entry => (
                            <div key={entry.taskId} style={{
                                border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 14px", marginBottom: 10,
                                background: "#F9FAFB",
                            }}>
                                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.taskTitle}</div>
                                    <span style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", background: "#F1F5F9", padding: "2px 7px", borderRadius: 99, flexShrink: 0 }}>{entry.taskId}</span>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Priority</div>
                                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#374151" }}>
                                            P{entry.oldPriority ?? "?"} <span style={{ color: "#9CA3AF" }}>→</span> <span style={{ color: "#DC2626" }}>P{entry.newPriority ?? "?"}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Deadline</div>
                                        <div style={{ fontSize: 12.5 }}>
                                            <span style={{ color: "#9CA3AF", textDecoration: "line-through" }}>{fmtDateTime(entry.oldDeadline)}</span><br />
                                            <span style={{ color: "#16A34A", fontWeight: 600 }}>{fmtDateTime(entry.newDeadline)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {pendingGroup.reason && (
                            <div style={{ marginTop: 4, marginBottom: 4, padding: "10px 12px", borderRadius: 8, background: "#F5F3FF", border: "1px solid #E9D5FF" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Reason</div>
                                <div style={{ fontSize: 12.5, color: "#4C1D95" }}>{pendingGroup.reason}</div>
                            </div>
                        )}

                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
                            Changed {fmtDateTime(pendingGroup.at)}
                        </div>

                        {timerActiveTaskId && (
                            <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA" }}>
                                <div style={{ fontSize: 12, color: "#991B1B" }}>
                                    ⏱ Currently running: <strong>{activeTaskTitle}</strong> ({fmtElapsed(activeElapsedSecs)} elapsed) — this will be paused when you confirm.
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer — Confirm only, no Cancel, by design */}
                    <div style={{ padding: "14px 20px 18px", borderTop: "1px solid #F1F5F9", flexShrink: 0 }}>
                        <button
                            onClick={handleConfirm}
                            disabled={confirming}
                            style={{
                                width: "100%", padding: "11px 20px", borderRadius: 9, border: "none",
                                background: confirming ? "#A78BFA" : "#7C3AED", color: "#fff",
                                fontSize: 14, fontWeight: 700, cursor: confirming ? "not-allowed" : "pointer",
                                fontFamily: "inherit",
                            }}>
                            {confirming ? "Confirming…" : "Confirm"}
                        </button>
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
}