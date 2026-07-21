"use client";
import { useEffect, useState } from "react";
import { requestEmergencyApproval, shiftOngoingTaskDeadlines } from "../../../lib/emergencyApproval";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_KEYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const TERMINAL_STATUSES = ["done", "cancelled", "tl_final_approved", "ceo_approved"];

function istDow(ms) { return new Date(ms + IST_OFFSET_MS).getUTCDay(); }
function istMidnightUtcMs(ms) {
  const ist = new Date(ms + IST_OFFSET_MS);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
}
function istTimeMs(ms, timeStr) {
  const [h, m] = (timeStr || "09:30").split(":").map(Number);
  return istMidnightUtcMs(ms) + (h * 60 + m) * 60 * 1000;
}
function istDateKey(ms) { return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10); }

async function shiftTodaysTaskDeadlines(employeeId, shiftMs) {
  if (!shiftMs || shiftMs <= 0) return;
  const { firebaseDb } = await import("../../../lib/coworkFirebase");
  const { collection, query, where, getDocs, updateDoc } = await import("firebase/firestore");
  const todayKey = istDateKey(Date.now());
  const snap = await getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assigneeIds", "array-contains", employeeId)));
  for (const d of snap.docs) {
    const t = d.data();
    if (!t.dueDate || TERMINAL_STATUSES.includes(t.status)) continue;
    const dueMs = new Date(t.dueDate).getTime();
    if (istDateKey(dueMs) !== todayKey) continue;
    await updateDoc(d.ref, {
      dueDate: new Date(dueMs + shiftMs).toISOString(),
      lastDeadlineShiftMs: shiftMs,
    });
  }
}

async function applyLoginLatenessShift(employeeId, statusRef) {
  const { firebaseDb } = await import("../../../lib/coworkFirebase");
  const { doc, getDoc, updateDoc } = await import("firebase/firestore");

  const now = Date.now();
  const todayKey = istDateKey(now);

  const statusSnap = await getDoc(statusRef);
  const alreadyAppliedDate = statusSnap.exists() ? statusSnap.data().latenessAppliedDate : null;
  if (alreadyAppliedDate === todayKey) return;
  await updateDoc(statusRef, { latenessAppliedDate: todayKey });

  const officeSnap = await getDoc(doc(firebaseDb, "cowork_settings", "office"));
  const schedule = officeSnap.exists() ? officeSnap.data().schedule : null;
  if (!schedule) return;

  const cfg = schedule[DAY_KEYS[istDow(now)]];
  if (!cfg || cfg.isOff) return;

  const officeOpenMs = istTimeMs(now, cfg.inTime || "09:30");
  const latenessMs = now - officeOpenMs;
  if (latenessMs <= 0) return;

  await shiftTodaysTaskDeadlines(employeeId, latenessMs);
}

async function applyPendingEmergencyApproval(employeeId, employeeName, statusRef) {
  const { getDoc, updateDoc } = await import("firebase/firestore");
  const snap = await getDoc(statusRef);
  const data = snap.exists() ? snap.data() : {};
  const pendingMs = Number(data.pendingEmergencyGapMs) || 0;
  if (pendingMs <= 0) return;
  const pendingReason = data.pendingEmergencyReason || null;
  await updateDoc(statusRef, { pendingEmergencyGapMs: null, pendingEmergencyReason: null });
  return requestEmergencyApproval(employeeId, employeeName, pendingMs, pendingReason);
}

async function applyPendingBreakGap(employeeId, statusRef) {
  const { getDoc, updateDoc } = await import("firebase/firestore");
  const snap = await getDoc(statusRef);
  const pendingMs = snap.exists() ? Number(snap.data().pendingBreakGapMs) || 0 : 0;
  if (pendingMs <= 0) return;
  await updateDoc(statusRef, { pendingBreakGapMs: null });
  await shiftOngoingTaskDeadlines(employeeId, pendingMs);
}

/** Reads the daily break-time cap from Office Settings. Defaults to 60 min
 * if unset — matches the input's default in the Settings page. */
async function getMaxBreakSecs() {
  try {
    const { firebaseDb } = await import("../../../lib/coworkFirebase");
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(firebaseDb, "cowork_settings", "office"));
    const mins = snap.exists() ? Number(snap.data().maxBreakMinutesPerDay) : null;
    return (mins && mins > 0) ? mins * 60 : 3600;
  } catch (e) {
    console.warn("[break-mode] could not read max break minutes, defaulting to 60:", e.message);
    return 3600;
  }
}

async function setDutyMode(employeeId, targetMode, opts = {}) {
  const employeeName = opts.employeeName || employeeId;

  if (targetMode === "emergency" && !opts.reason?.trim()) {
    throw new Error("A reason is required to enter Emergency Mode.");
  }

  const { firebaseDb } = await import("../../../lib/coworkFirebase");
  const { doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp, increment } = await import("firebase/firestore");
  const ref = doc(firebaseDb, "cowork_duty_status", employeeId);

  const prevSnap = await getDoc(ref);
  const prev = prevSnap.exists() ? prevSnap.data() : {};
  const prevMode = prev.mode || (prev.isOnline ? "online" : "offline");
  const now = Date.now();
  const todayKey = new Date(now).toISOString().slice(0, 10); // matches dailyHours' existing (UTC) convention

  let sessionHours = 0;
  let dayKey = null;
  if (prevMode === "online" && targetMode !== "online") {
    const prevSince = prev.since?.toDate ? prev.since.toDate() : null;
    if (prevSince) {
      sessionHours = Math.max((now - prevSince.getTime()) / 3600000, 0);
      dayKey = prevSince.toISOString().slice(0, 10);
    }
  }

  const patch = {
    employeeId,
    mode: targetMode,
    isOnline: targetMode === "online",
    since: serverTimestamp(),
    emergencyReason: targetMode === "emergency" ? opts.reason.trim() : null,
  };

  // ── Closing out EMERGENCY — leaving it for ANYTHING else (Online, Offline,
  // or now Break too), not just the two cases handled before. ──
  let directEmergencyGapMs = 0;
  let directEmergencyReason = null;
  if (prevMode === "emergency" && targetMode === "online") {
    directEmergencyGapMs = now - (Number(prev.emergencyStartedAtMs) || now);
    directEmergencyReason = prev.emergencyReason || null;
    patch.emergencyStartedAtMs = null;
  } else if (prevMode === "emergency" && targetMode !== "online") {
    const gap = now - (Number(prev.emergencyStartedAtMs) || now);
    patch.pendingEmergencyGapMs = gap > 0 ? gap : null;
    patch.pendingEmergencyReason = prev.emergencyReason || null;
    patch.emergencyStartedAtMs = null;
  }

  // ── Closing out BREAK — the daily cap is evaluated NOW, against whatever
  // "today" is at this exact moment, not deferred to whenever they next log
  // in (which could be a different calendar day entirely). ──
  let directBreakAppliedMs = 0;
  let breakIncrementSecs = 0;
  if (prevMode === "break") {
    const sessionSecs = Math.max(0, (now - (Number(prev.breakStartedAtMs) || now)) / 1000);
    breakIncrementSecs = sessionSecs;
    const usedBeforeToday = Number(prev.dailyBreakSeconds?.[todayKey]) || 0;
    const maxSecs = await getMaxBreakSecs();
    const remainingBudget = Math.max(0, maxSecs - usedBeforeToday);
    const appliedSecs = Math.min(sessionSecs, remainingBudget);
    patch.breakStartedAtMs = null;
    if (targetMode === "online") {
      directBreakAppliedMs = appliedSecs * 1000;
    } else {
      patch.pendingBreakGapMs = appliedSecs > 0 ? appliedSecs * 1000 : null;
    }
  }

  if (targetMode === "emergency") {
    patch.emergencyStartedAtMs = now;
  } else if (targetMode === "break") {
    patch.breakStartedAtMs = now;
  }

  await setDoc(ref, patch, { merge: true });

  // Real, uncapped break time used today — for honest reporting, independent
  // of how much of it actually got applied to task deadlines.
  if (breakIncrementSecs > 0) {
    try {
      await updateDoc(ref, { [`dailyBreakSeconds.${todayKey}`]: increment(+breakIncrementSecs.toFixed(2)) });
    } catch (e) {
      console.warn("[DutyStatusToggle] could not record daily break seconds:", e.message);
    }
  }

  if (targetMode === "emergency" || targetMode === "break") {
    try { await autoPauseRunningTimer(employeeId); }
    catch (e) { console.warn("[DutyStatusToggle] could not auto-pause timer:", e.message); }
  }

  if (targetMode === "online") {
    try { await applyLoginLatenessShift(employeeId, ref); }
    catch (e) { console.warn("[DutyStatusToggle] lateness shift failed:", e.message); }

    if (directEmergencyGapMs > 0) {
      try { await requestEmergencyApproval(employeeId, employeeName, directEmergencyGapMs, directEmergencyReason); }
      catch (e) { console.warn("[DutyStatusToggle] emergency approval request failed:", e.message); }
    }
    try { await applyPendingEmergencyApproval(employeeId, employeeName, ref); }
    catch (e) { console.warn("[DutyStatusToggle] pending emergency approval request failed:", e.message); }

    if (directBreakAppliedMs > 0) {
      try { await shiftOngoingTaskDeadlines(employeeId, directBreakAppliedMs); }
      catch (e) { console.warn("[DutyStatusToggle] direct break shift failed:", e.message); }
    }
    try { await applyPendingBreakGap(employeeId, ref); }
    catch (e) { console.warn("[DutyStatusToggle] pending break shift failed:", e.message); }
  }

  try {
    if (dayKey && sessionHours > 0) {
      await updateDoc(ref, { [`dailyHours.${dayKey}`]: increment(+sessionHours.toFixed(2)) });
    }
  } catch (e) {
    console.warn("[DutyStatusToggle] could not record daily hours:", e.message);
  }

  try {
    await addDoc(collection(firebaseDb, "cowork_duty_status", employeeId, "logs"), {
      type: targetMode === "online" ? "login" : targetMode === "offline" ? "logout" : targetMode === "emergency" ? "emergency" : "break",
      at: serverTimestamp(),
      source: "manual",
      ...(targetMode === "emergency" ? { reason: opts.reason.trim() } : {}),
      ...(patch.pendingEmergencyGapMs ? { emergencyGapStoredMs: patch.pendingEmergencyGapMs } : {}),
      ...(directEmergencyGapMs > 0 ? { emergencyGapAppliedMs: directEmergencyGapMs } : {}),
      ...(patch.pendingBreakGapMs ? { breakGapStoredMs: patch.pendingBreakGapMs } : {}),
      ...(directBreakAppliedMs > 0 ? { breakGapAppliedMs: directBreakAppliedMs } : {}),
      ...(breakIncrementSecs > 0 ? { breakSessionSecs: +breakIncrementSecs.toFixed(2) } : {}),
      ...(dayKey ? { sessionHours: +sessionHours.toFixed(2) } : {}),
    });
  } catch (e) {
    console.warn("[DutyStatusToggle] could not write activity log:", e.message);
  }

  return { prevMode, directEmergencyGapMs, directBreakAppliedMs };
}

async function fetchMyEmergencyRequests(employeeId, max = 5) {
  try {
    const { firebaseDb } = await import("../../../lib/coworkFirebase");
    const { collection, query, where, orderBy, limit, getDocs } = await import("firebase/firestore");
    const q = query(
      collection(firebaseDb, "cowork_emergency_approvals"),
      where("employeeId", "==", employeeId),
      orderBy("createdAt", "desc"),
      limit(max)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("[DutyStatusToggle] could not fetch emergency requests:", e.message);
    return [];
  }
}

async function fetchRecentLogs(employeeId, max = 6) {
  try {
    const { firebaseDb } = await import("../../../lib/coworkFirebase");
    const { collection, query, orderBy, limit, getDocs } = await import("firebase/firestore");
    const q = query(collection(firebaseDb, "cowork_duty_status", employeeId, "logs"), orderBy("at", "desc"), limit(max));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("[DutyStatusToggle] could not fetch logs:", e.message);
    return [];
  }
}

async function autoPauseRunningTimer(employeeId) {
  const { firebaseDb } = await import("../../../lib/coworkFirebase");
  const { collection, query, where, getDocs, updateDoc } = await import("firebase/firestore");
  const sessionsCol = collection(firebaseDb, "cowork_task_timers", employeeId, "sessions");
  const snap = await getDocs(query(sessionsCol, where("isActive", "==", true)));
  const now = Date.now();
  const paused = [];
  for (const d of snap.docs) {
    const sess = d.data();
    const base = sess.totalSeconds || 0;
    const startedAt = sess.lastStartTime || now;
    const newTotal = base + Math.floor((now - startedAt) / 1000);
    await updateDoc(d.ref, {
      totalSeconds: newTotal, isActive: false, lastStartTime: null,
      lastPauseReason: "logged_out", updatedAt: now,
    });
    paused.push({ taskId: d.id, taskTitle: sess.taskTitle || d.id, totalSeconds: newTotal });
  }
  return paused;
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function fmtTime(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function DutyStatusToggle({ employeeId, employeeName, onStatusChange }) {
  const [status, setStatus] = useState(null);
  const [, setTick] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [emergencyReasonInput, setEmergencyReasonInput] = useState("");
  const [logs, setLogs] = useState([]);
  const [emergencyRequests, setEmergencyRequests] = useState([]);
  const [maxBreakSecs, setMaxBreakSecs] = useState(3600);
  const [busy, setBusy] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [resultIsError, setResultIsError] = useState(false);

  useEffect(() => {
    (async () => setMaxBreakSecs(await getMaxBreakSecs()))();
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    let unsub = () => {};
    (async () => {
      const { firebaseDb } = await import("../../../lib/coworkFirebase");
      const { doc, onSnapshot } = await import("firebase/firestore");
      unsub = onSnapshot(
        doc(firebaseDb, "cowork_duty_status", employeeId),
        (snap) => {
          if (!snap.exists()) { setStatus({ mode: "offline", sinceMs: null, dailyHours: {}, dailyBreakSeconds: {} }); return; }
          const d = snap.data();
          setStatus({
            mode: d.mode || (d.isOnline ? "online" : "offline"),
            sinceMs: d.since?.toDate ? d.since.toDate().getTime() : null,
            dailyHours: d.dailyHours || {},
            dailyBreakSeconds: d.dailyBreakSeconds || {},
            emergencyReason: d.emergencyReason || null,
            emergencyStartedAtMs: d.emergencyStartedAtMs || null,
            breakStartedAtMs: d.breakStartedAtMs || null,
          });
        },
        (e) => console.error("[DutyStatusToggle] snapshot:", e.message)
      );
    })();
    return () => unsub();
  }, [employeeId]);

  useEffect(() => {
    if (status?.mode !== "online" && status?.mode !== "break") return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [status?.mode]);

  const mode = status?.mode ?? null;
  const todayKey = new Date().toISOString().slice(0, 10);

  const workedTodaySeconds = (() => {
    if (mode !== "online") return 0;
    const closedToday = (status.dailyHours?.[todayKey] || 0) * 3600;
    const openSession = status.sinceMs ? (Date.now() - status.sinceMs) / 1000 : 0;
    return closedToday + openSession;
  })();

  const usedBreakSecondsToday = status?.dailyBreakSeconds?.[todayKey] || 0;
  const breakElapsedSeconds = mode === "break" && status?.breakStartedAtMs ? Math.max(0, (Date.now() - status.breakStartedAtMs) / 1000) : 0;
  const breakRemainingSeconds = Math.max(0, maxBreakSecs - usedBreakSecondsToday - breakElapsedSeconds);

  const stateClass = mode ? ` is-${mode === "break" ? "break" : mode}` : "";
  const label = mode === null ? "…" : mode === "online" ? "Online" : mode === "emergency" ? "Emergency" : mode === "break" ? "On Break" : "Offline";
  const caption = mode === "online" ? `Worked today · ${formatDuration(workedTodaySeconds)}`
    : mode === "emergency" ? `Since ${fmtTime(status?.emergencyStartedAtMs)}`
    : mode === "break" ? `${formatDuration(breakElapsedSeconds)} elapsed`
    : mode === "offline" ? "Not tracking time" : "";

  const statusDescription = mode === "online"
    ? "You're marked Online. Today's working time is being tracked automatically from your login."
    : mode === "emergency"
    ? `You're in Emergency Mode. Reason: "${status?.emergencyReason || "—"}". Nothing is being tracked as active work right now.`
    : mode === "break"
    ? "You're on Break. Any running task timer has been paused."
    : "You're marked Offline. No working time is being tracked right now.";

  const openPanel = async () => {
    setResultMessage(null);
    setResultIsError(false);
    setPendingAction(null);
    setEmergencyReasonInput("");
    setPanelOpen(true);
    setLogs(await fetchRecentLogs(employeeId));
    setEmergencyRequests(await fetchMyEmergencyRequests(employeeId));
  };

  const confirm = async () => {
    const target = pendingAction;
    if (!target) return;
    if (target === "emergency" && !emergencyReasonInput.trim()) return;
    setBusy(true);
    try {
      const { prevMode, directBreakAppliedMs } = await setDutyMode(employeeId, target, { reason: emergencyReasonInput, employeeName });

      if (target === "emergency") {
        setResultMessage(`Emergency Mode activated at ${fmtTime(Date.now())}. Reason: "${emergencyReasonInput.trim()}". This time will be sent to your manager for approval once you sign back in.`);
      } else if (target === "break") {
        setResultMessage(`Break started at ${fmtTime(Date.now())}. Any running task timer has been paused.`);
      } else if (target === "online") {
        let extra = "";
        if (prevMode === "emergency") extra += " Your Emergency Mode time has been sent to your manager for approval — it'll only count toward your task deadlines once they approve it.";
        if (prevMode === "break") {
          extra += directBreakAppliedMs > 0
            ? ` Your break time has been added to today's task deadlines (${formatDuration(directBreakAppliedMs / 1000)}).`
            : " Your break used up today's full break budget, so no additional time was added to your task deadlines.";
        }
        setResultMessage(`You're online. Login recorded at ${fmtTime(Date.now())}.${extra}`);
      } else {
        let pauseNote = "";
        try {
          const paused = await autoPauseRunningTimer(employeeId);
          if (paused.length > 0) {
            const p = paused[0];
            pauseNote = ` Your running timer on "${p.taskTitle}" was paused automatically — ${formatDuration(p.totalSeconds)} logged.`;
          }
        } catch (e) {
          pauseNote = " (Couldn't confirm whether a task timer was running — please pause it manually if one was.)";
        }
        let extra = "";
        if (prevMode === "emergency") extra = " Your Emergency Mode time has been recorded — it'll be sent to your manager for approval the next time you sign in.";
        if (prevMode === "break") extra = " Your break time has been recorded — it'll be added to your tasks' deadlines (up to today's remaining budget) the next time you sign in.";
        setResultMessage(`You're offline. Logout recorded at ${fmtTime(Date.now())}.${pauseNote}${extra}`);
      }

      setResultIsError(false);
      setPendingAction(null);
      setEmergencyReasonInput("");
      try { onStatusChange?.(target); } catch (e) {
        console.error("[DutyStatusToggle] onStatusChange callback threw:", e.message);
      }
    } catch (e) {
      console.error("[DutyStatusToggle] status update failed:", e);
      setResultIsError(true);
      setResultMessage(`Couldn't update your status (${e.code || "error"}: ${e.message || "unknown"}). Please try again or tell IT that code.`);
    } finally {
      try { setLogs(await fetchRecentLogs(employeeId)); } catch (_) { }
      try { setEmergencyRequests(await fetchMyEmergencyRequests(employeeId)); } catch (_) { }
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className={`cw-duty-btn${stateClass}`}
        title={`You're ${label} — click to change`}
        onClick={openPanel}
      >
        <span className="cw-duty-dot" />
        <span className="cw-duty-text-col">
          <span className="cw-duty-label">{label}</span>
          <span className="cw-duty-caption">{caption}</span>
        </span>
      </button>

      <div className={`cw-duty-panel-overlay${panelOpen ? " show" : ""}`} onClick={() => !busy && setPanelOpen(false)} />
      <div className={`cw-duty-panel${panelOpen ? " open" : ""}`}>
        <div className="cw-duty-panel-head">
          <span className="cw-duty-panel-title">Duty Status</span>
          <button className="cw-duty-panel-close" onClick={() => !busy && setPanelOpen(false)}>×</button>
        </div>

        <div className="cw-duty-panel-body">
          {mode === "online" ? (
            <div className="cw-duty-live-box is-online">
              <div className="cw-duty-live-label">Worked today</div>
              <div className="cw-duty-live-value">{formatDuration(workedTodaySeconds)}</div>
            </div>
          ) : mode === "emergency" ? (
            <div className="cw-duty-live-box is-emergency">
              <div className="cw-duty-live-label">Emergency Mode</div>
              <div className="cw-duty-static-value">Since {fmtTime(status?.emergencyStartedAtMs)}</div>
            </div>
          ) : mode === "break" ? (
            <div className="cw-duty-live-box is-break">
              <div className="cw-duty-live-label">On Break</div>
              <div className="cw-duty-live-value">{formatDuration(breakElapsedSeconds)}</div>
              <div className="cw-duty-since">{formatDuration(breakRemainingSeconds)} of today's break budget left</div>
            </div>
          ) : (
            <div className="cw-duty-live-box">
              <div className="cw-duty-live-label">Status</div>
              <div className="cw-duty-static-value">Offline</div>
            </div>
          )}

          <div className="cw-duty-desc">{statusDescription}</div>

          {resultMessage ? (
            <div className={`cw-duty-result-box${resultIsError ? " is-error" : ""}`}>
              <div className="cw-duty-result-text">{resultMessage}</div>
              <button className="cw-duty-btn-primary" onClick={() => setPanelOpen(false)}>Done</button>
            </div>
          ) : pendingAction === null ? (
            mode === "emergency" ? (
              <>
                <div className="cw-duty-section-label">Reason on record</div>
                <div className="cw-duty-reason-display">"{status?.emergencyReason || "—"}"</div>
                <div className="cw-duty-mode-grid">
                  <button className="cw-duty-mode-btn cw-duty-mode-btn-primary" onClick={() => setPendingAction("online")}>Sign In</button>
                  <button className="cw-duty-mode-btn" onClick={() => setPendingAction("offline")}>Sign Out</button>
                </div>
              </>
            ) : mode === "break" ? (
              <>
                <div className="cw-duty-section-label">You're on break</div>
                <div className="cw-duty-mode-grid">
                  <button className="cw-duty-mode-btn cw-duty-mode-btn-primary" onClick={() => setPendingAction("online")}>Sign In</button>
                  <button className="cw-duty-mode-btn" onClick={() => setPendingAction("offline")}>Sign Out</button>
                </div>
              </>
            ) : (
              <>
                <div className="cw-duty-section-label">Change status</div>
                <div className="cw-duty-mode-grid">
                  <button
                    className={`cw-duty-mode-btn${mode === "online" ? "" : " cw-duty-mode-btn-primary"}`}
                    style={{ flexBasis: "100%" }}
                    onClick={() => setPendingAction(mode === "online" ? "offline" : "online")}
                  >
                    {mode === "online" ? "Sign Out" : "Sign In"}
                  </button>
                  <button
                    className="cw-duty-mode-btn cw-duty-mode-btn-warn"
                    onClick={() => { setPendingAction("emergency"); setEmergencyReasonInput(""); }}
                  >
                    Emergency Mode
                  </button>
                  <button
                    className="cw-duty-mode-btn cw-duty-mode-btn-break"
                    onClick={() => setPendingAction("break")}
                  >
                    Break Mode
                  </button>
                </div>
              </>
            )
          ) : pendingAction === "emergency" ? (
            <>
              <div className="cw-duty-section-label">Enter Emergency Mode</div>
              <div className="cw-duty-confirm-sub">A reason is required. This time will be sent to your manager for approval once you sign back in.</div>
              <textarea
                className="cw-duty-reason-input"
                rows={3}
                value={emergencyReasonInput}
                onChange={e => setEmergencyReasonInput(e.target.value)}
                placeholder="Reason for Emergency Mode"
              />
              <div className="cw-duty-confirm-actions">
                <button className="cw-duty-btn-cancel" onClick={() => setPendingAction(null)} disabled={busy}>Back</button>
                <button className="cw-duty-btn-warn-confirm" onClick={confirm} disabled={busy || !emergencyReasonInput.trim()}>
                  {busy ? "Saving…" : "Confirm"}
                </button>
              </div>
            </>
          ) : pendingAction === "break" ? (
            <>
              <div className="cw-duty-section-label">Start Break?</div>
              <div className="cw-duty-confirm-sub">Any running task timer will be paused automatically. Break time counts against today's allowed budget ({formatDuration(maxBreakSecs)} total).</div>
              <div className="cw-duty-confirm-actions">
                <button className="cw-duty-btn-cancel" onClick={() => setPendingAction(null)} disabled={busy}>Back</button>
                <button className="cw-duty-btn-primary" onClick={confirm} disabled={busy}>{busy ? "Saving…" : "Start Break"}</button>
              </div>
            </>
          ) : (
            <>
              <div className="cw-duty-section-label">{pendingAction === "offline" ? "Sign out?" : "Sign in?"}</div>
              <div className="cw-duty-confirm-sub">
                {pendingAction === "offline"
                  ? "This logs your logout time and pauses any task timer you currently have running."
                  : mode === "emergency"
                  ? "This ends Emergency Mode and signs you in. The time will be sent to your manager for approval."
                  : mode === "break"
                  ? "This ends your break and signs you in. Break time (up to today's remaining budget) will be added to your task deadlines."
                  : "This logs your login time now."}
              </div>
              <div className="cw-duty-confirm-actions">
                <button className="cw-duty-btn-cancel" onClick={() => setPendingAction(null)} disabled={busy}>Back</button>
                <button className="cw-duty-btn-primary" onClick={confirm} disabled={busy}>
                  {busy ? "Saving…" : "Confirm"}
                </button>
              </div>
            </>
          )}

          {emergencyRequests.length > 0 && (
            <>
              <div className="cw-duty-history-title">Emergency requests</div>
              {emergencyRequests.map(r => (
                <div key={r.id} className="cw-duty-emreq-row">
                  <div className="cw-duty-emreq-top">
                    <span className={`cw-duty-emreq-status cw-duty-emreq-${r.status}`}>
                      {r.status === "pending" ? "Pending" : r.status === "approved" ? "Approved" : "Rejected"}
                    </span>
                    <span className="cw-duty-history-time">{fmtTime(r.createdAt)}</span>
                  </div>
                  <div className="cw-duty-emreq-reason">"{r.reason || "No reason given"}"</div>
                </div>
              ))}
            </>
          )}

          <div className="cw-duty-history-title">Recent activity</div>
          {logs.length === 0 ? (
            <div className="cw-duty-history-empty">No activity yet.</div>
          ) : logs.slice(0, 6).map(l => (
            <div key={l.id} className="cw-duty-history-row">
              <span className={`cw-duty-history-tag ${l.type}`}>
                {l.type === "login" ? "Login" : l.type === "logout" ? "Logout" : l.type === "emergency" ? "Emergency" : "Break"}
              </span>
              <span className="cw-duty-history-time">{fmtTime(l.at)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}