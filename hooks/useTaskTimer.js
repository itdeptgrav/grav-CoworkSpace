"use client";
/**
 * useTaskTimer.js
 *
 * Global task time tracker for CoWork.
 * - Only one task/subtask can run at a time per employee
 * - Stores sessions in Firestore: cowork_task_timers/{employeeId}/sessions/{taskId}
 * - Fires a toast when a task is auto-stopped by starting another
 *
 * NEW: useWatchEmployeeTimers(employeeIds)
 *   Lets CEO/TL watch live timer sessions for a list of employees.
 *   Returns: Map<taskId, { employeeId, employeeName, taskTitle, totalSeconds, isActive, lastStartTime, displaySeconds }>
 *
 * Firestore schema: cowork_task_timers/{employeeId}/sessions/{taskId}
 *   totalSeconds    number   — cumulative worked seconds
 *   isActive        boolean  — currently running?
 *   lastStartTime   number   — ms timestamp when last started
 *   taskTitle       string
 *   employeeId      string
 *   taskId          string
 *   updatedAt       number
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { doc, setDoc, onSnapshot, collection } from "firebase/firestore";
import { firebaseDb } from "../lib/coworkFirebase";

// ── Format seconds → HH:MM:SS ─────────────────────────────────────────────────
export function formatTime(totalSeconds) {
    const s = Math.floor(totalSeconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
    if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
    return `${sec}s`;
}

export function formatTimeHMS(totalSeconds) {
    const s = Math.floor(totalSeconds);
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
}

// ── Firestore helpers ─────────────────────────────────────────────────────────
function timerRef(employeeId, taskId) {
    return doc(firebaseDb, "cowork_task_timers", employeeId, "sessions", taskId);
}

async function saveSession(employeeId, taskId, data) {
    try {
        await setDoc(timerRef(employeeId, taskId), {
            ...data,
            employeeId,
            taskId,
            updatedAt: Date.now(),
        }, { merge: true });
    } catch (e) {
        console.error("[TaskTimer] Firestore save error:", e.message);
    }
}

// ── Main hook (for the assignee themselves) ───────────────────────────────────
//
// Optional `opts`:
//   - deadlineWindowsRef : a ref holding { [taskId]: windowSecs } — the hook
//     reads it EVERY tick (via ref so it doesn't cause re-renders) and auto-
//     pauses the running task the moment displaySecs >= windowSecs.
//   - onDeadlineReached(taskId, taskTitle, totalSecs) : called right BEFORE
//     pause fires. Caller uses this to open the commit modal with a pre-filled
//     "⚠ Deadline reached — please request an extension" prompt.
//
// Auto-pause fires at most ONCE per running session (gated by autoPausedRef).
// When the employee gets an extension approved and resumes, the gate resets
// because resume spins up a fresh tick loop via startTick().
export function useTaskTimer(employeeId, opts = {}) {
    const { deadlineWindowsRef, onDeadlineReached } = opts;
    const [activeTaskId, setActiveTaskId] = useState(null);
    const [sessionMap, setSessionMap] = useState(new Map());
    const [liveTick, setLiveTick] = useState(0);
    const [toast, setToast] = useState(null);

    const tickRef = useRef(null);
    const activeRef = useRef(null);
    const sessionMapRef = useRef(new Map());
    // Has auto-pause already fired for the CURRENT running task? Reset on each
    // startTick() so the next resume gets a fresh gate.
    const autoPausedRef = useRef(false);
    // Keep latest pauseTask + onDeadlineReached refs so the tick closure uses
    // up-to-date versions without needing them in its deps.
    const pauseTaskRef = useRef(null);
    const onDeadlineRef = useRef(null);
    onDeadlineRef.current = onDeadlineReached;

    activeRef.current = activeTaskId;
    sessionMapRef.current = sessionMap;

    const showToast = useCallback((message, type = "info") => {
        setToast({ message, type, id: Date.now() });
        setTimeout(() => setToast(null), 4000);
    }, []);

    const startTick = useCallback((taskId, baseSecs) => {
        clearInterval(tickRef.current);
        const startedAt = Date.now();
        setLiveTick(baseSecs);
        // Reset auto-pause gate ONLY if we haven't already exceeded the window.
        // If baseSecs >= window the deadline was already hit this session —
        // don't reset or it fires again on every Resume click, trapping the
        // employee in an infinite pause loop.
        const currentWin = deadlineWindowsRef?.current?.[taskId] || 0;
        const alreadyOver = currentWin > 0 && baseSecs > currentWin;
        if (!alreadyOver) {
            autoPausedRef.current = false;
        }
        tickRef.current = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startedAt) / 1000);
            const display = baseSecs + elapsed;
            setLiveTick(display);

            // ── Auto-pause on deadline hit ────────────────────────────────
            if (autoPausedRef.current) return;
            const winSecs = deadlineWindowsRef?.current?.[taskId] || 0;
            if (winSecs > 0 && display >= winSecs) {
                autoPausedRef.current = true;
                clearInterval(tickRef.current); // stop tick immediately
                const title = sessionMapRef.current.get(taskId)?.taskTitle || taskId;
                try { onDeadlineRef.current?.(taskId, title, display); } catch (e) { /* swallow */ }
                pauseTaskRef.current?.(taskId, title, { autoReason: "deadline_reached" });
            }
        }, 1000);
    }, [deadlineWindowsRef]);

    const stopTick = useCallback(() => {
        clearInterval(tickRef.current);
        tickRef.current = null;
    }, []);

    useEffect(() => {
        if (!employeeId) return;
        let unsub;
        (async () => {
            try {
                const colRef = collection(firebaseDb, "cowork_task_timers", employeeId, "sessions");
                unsub = onSnapshot(colRef, (snap) => {
                    const map = new Map();
                    let activeId = null;
                    snap.docs.forEach(d => {
                        const data = d.data();
                        map.set(d.id, data);
                        if (data.isActive) activeId = d.id;
                    });
                    setSessionMap(map);
                    sessionMapRef.current = map;

                    if (activeId && activeRef.current !== activeId) {
                        const sess = map.get(activeId);
                        const elapsed = sess.lastStartTime
                            ? Math.floor((Date.now() - sess.lastStartTime) / 1000)
                            : 0;
                        setActiveTaskId(activeId);
                        startTick(activeId, (sess.totalSeconds || 0) + elapsed);
                    }
                });
            } catch (e) {
                console.error("[TaskTimer] Load error:", e.message);
            }
        })();
        return () => { unsub?.(); stopTick(); };
    }, [employeeId, startTick, stopTick]);

    const startTask = useCallback(async (taskId, taskTitle, opts = {}) => {
        if (!employeeId) return;
        const currentActive = activeRef.current;
        const now = Date.now();

        if (currentActive && currentActive !== taskId) {
            const prev = sessionMapRef.current.get(currentActive);
            const prevBase = prev?.totalSeconds || 0;
            const prevStart = prev?.lastStartTime || now;
            const addedSecs = Math.floor((now - prevStart) / 1000);
            const newTotal = prevBase + addedSecs;
            const prevTitle = prev?.taskTitle || currentActive;

            // Optimistic update for the stopped task
            const nextMap = new Map(sessionMapRef.current);
            nextMap.set(currentActive, { ...(prev || {}), totalSeconds: newTotal, isActive: false, lastStartTime: null, taskTitle: prevTitle });
            sessionMapRef.current = nextMap;
            setSessionMap(nextMap);

            await saveSession(employeeId, currentActive, {
                totalSeconds: newTotal,
                isActive: false,
                lastStartTime: null,
                taskTitle: prevTitle,
            });

            showToast(
                `⏸ "${prevTitle}" paused (${formatTime(newTotal)}) → "${taskTitle}" started`,
                "switch"
            );
        }

        const existing = sessionMapRef.current.get(taskId);
        // anchorBaseSecs — when provided by handleTimerStart (extension-start path),
        // it overrides totalSeconds in Firestore so the auto-pause gate fires at
        // exactly (anchorBaseSecs + lastExtensionSecs) = newTotalWindowSecs.
        // Without this, Firestore still holds the old value — causing a mismatch on resume.
        const baseSecs = (opts?.anchorBaseSecs != null)
            ? Math.max(0, Number(opts.anchorBaseSecs))
            : (existing?.totalSeconds || 0);

        await saveSession(employeeId, taskId, {
            totalSeconds: baseSecs,
            isActive: true,
            lastStartTime: now,
            taskTitle,
        });

        setActiveTaskId(taskId);
        startTick(taskId, baseSecs);

        if (!currentActive || currentActive === taskId) {
            showToast(`▶ "${taskTitle}" started${baseSecs > 0 ? ` (resuming from ${formatTime(baseSecs)})` : ""}`, "start");
        }
    }, [employeeId, startTick, showToast]);

    const pauseTask = useCallback(async (taskId, taskTitle, pauseOpts = {}) => {
        if (!employeeId) return;
        const now = Date.now();
        const sess = sessionMapRef.current.get(taskId);
        const base = sess?.totalSeconds || 0;
        const startedAt = sess?.lastStartTime || now;
        const addedSecs = Math.floor((now - startedAt) / 1000);
        const newTotal = base + addedSecs;
        // Flag the session so the UI can distinguish a user-initiated pause
        // from the automatic deadline-reached pause. We store it both locally
        // (for the optimistic map) and in Firestore so CEO/TL see the same
        // state and can react (e.g. badge on their task card).
        const autoReason = pauseOpts.autoReason || null;

        // ── Optimistic update: update local map immediately so time stays visible
        // before Firestore onSnapshot fires (avoids flash-to-zero on pause)
        const updatedSess = { ...(sess || {}), totalSeconds: newTotal, isActive: false, lastStartTime: null, taskTitle, lastPauseReason: autoReason };
        const nextMap = new Map(sessionMapRef.current);
        nextMap.set(taskId, updatedSess);
        sessionMapRef.current = nextMap;
        setSessionMap(nextMap);

        await saveSession(employeeId, taskId, {
            totalSeconds: newTotal,
            isActive: false,
            lastStartTime: null,
            taskTitle,
            lastPauseReason: autoReason,
        });

        setActiveTaskId(null);
        stopTick();
        if (autoReason === "deadline_reached") {
            showToast(`⏱ "${taskTitle}" — deadline reached, timer paused. Request extension to continue.`, "pause");
        } else {
            showToast(`⏸ "${taskTitle}" paused — ${formatTime(newTotal)} total`, "pause");
        }
    }, [employeeId, stopTick, showToast]);
    // Register the latest pauseTask in the ref so the tick loop can call it
    // without stale-closure issues. Done right after declaration.
    pauseTaskRef.current = pauseTask;

    const getDisplaySeconds = useCallback((taskId) => {
        if (taskId === activeRef.current) return liveTick;
        const sess = sessionMapRef.current.get(taskId);
        return sess?.totalSeconds || 0;
    }, [liveTick]);

    const getSession = useCallback((taskId) => {
        return sessionMapRef.current.get(taskId) || null;
    }, []);

    return {
        activeTaskId,
        sessionMap,
        liveTick,
        toast,
        startTask,
        pauseTask,
        getDisplaySeconds,
        getSession,
        formatTime,
        formatTimeHMS,
    };
}

// ── NEW: useWatchEmployeeTimers ────────────────────────────────────────────────
/**
 * Watch live timer sessions for a list of employee IDs (for CEO/TL assigner view).
 *
 * @param {string[]} employeeIds  — array of employee IDs to watch
 * @param {Map}      employeeMap  — Map<employeeId, employeeName> for display names
 *
 * @returns {Object}
 *   activeTimers: Map<taskId, { employeeId, employeeName, taskTitle, isActive,
 *                               totalSeconds, lastStartTime, displaySeconds }>
 *   — only contains tasks that are currently isActive === true
 *   — displaySeconds is kept live via a 1-second ticker
 */
export function useWatchEmployeeTimers(employeeIds = [], employeeMap = new Map()) {
    // Raw sessions from Firestore per employee: Map<empId, Map<taskId, sessionData>>
    const [rawSessions, setRawSessions] = useState(new Map());
    // Tick counter to force re-render every second when any session is active
    const [tick, setTick] = useState(0);
    const tickRef = useRef(null);
    const rawRef = useRef(new Map());

    rawRef.current = rawSessions;

    // Start/stop the 1-second ticker based on whether any session is active
    useEffect(() => {
        const hasActive = [...rawRef.current.values()].some(empMap =>
            [...empMap.values()].some(s => s.isActive)
        );
        if (hasActive && !tickRef.current) {
            tickRef.current = setInterval(() => setTick(t => t + 1), 1000);
        } else if (!hasActive && tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
        }
    });

    // Cleanup ticker on unmount
    useEffect(() => {
        return () => {
            if (tickRef.current) clearInterval(tickRef.current);
        };
    }, []);

    // Subscribe to each employee's timer sessions
    useEffect(() => {
        if (!employeeIds.length) return;

        const unsubMap = new Map();

        employeeIds.forEach(empId => {
            if (!empId || unsubMap.has(empId)) return;
            const colRef = collection(firebaseDb, "cowork_task_timers", empId, "sessions");
            const unsub = onSnapshot(colRef, (snap) => {
                const empSessions = new Map();
                snap.docs.forEach(d => {
                    empSessions.set(d.id, { ...d.data(), taskId: d.id });
                });
                setRawSessions(prev => {
                    const next = new Map(prev);
                    next.set(empId, empSessions);
                    return next;
                });
            }, (err) => {
                console.error(`[WatchTimers] Error watching ${empId}:`, err.message);
            });
            unsubMap.set(empId, unsub);
        });

        return () => {
            unsubMap.forEach(unsub => unsub());
        };
        // Re-run only when the joined string of IDs changes (avoids array reference churn)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employeeIds.join(",")]);

    // Build activeTimers (currently running) AND allTimers (running + paused with time)
    const activeTimers = new Map();
    const allTimers = new Map();

    rawSessions.forEach((empSessions, empId) => {
        empSessions.forEach((sess, taskId) => {
            const empName = (typeof employeeMap?.get === "function" ? employeeMap.get(empId) : null)
                || sess.employeeName || empId;

            if (sess.isActive) {
                const elapsed = sess.lastStartTime
                    ? Math.floor((Date.now() - sess.lastStartTime) / 1000)
                    : 0;
                const displaySeconds = (sess.totalSeconds || 0) + elapsed;
                const entry = {
                    employeeId: empId, employeeName: empName,
                    taskTitle: sess.taskTitle || taskId,
                    isActive: true,
                    totalSeconds: sess.totalSeconds || 0,
                    lastStartTime: sess.lastStartTime || null,
                    displaySeconds,
                };
                activeTimers.set(taskId, entry);
                allTimers.set(taskId, entry);
            } else if ((sess.totalSeconds || 0) > 0) {
                // Paused but has logged time — include in allTimers with grey display
                allTimers.set(taskId, {
                    employeeId: empId, employeeName: empName,
                    taskTitle: sess.taskTitle || taskId,
                    isActive: false,
                    totalSeconds: sess.totalSeconds,
                    lastStartTime: null,
                    displaySeconds: sess.totalSeconds,
                });
            }
        });
    });

    return { activeTimers, allTimers };
}