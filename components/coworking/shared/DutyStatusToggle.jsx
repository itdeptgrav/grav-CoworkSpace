"use client";
import { useEffect, useState } from "react";

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
  console.log(`[login-lateness] checking ${snap.docs.length} task(s), today=${todayKey}`);
  for (const d of snap.docs) {
    const t = d.data();
    if (!t.dueDate || TERMINAL_STATUSES.includes(t.status)) continue;
    const dueMs = new Date(t.dueDate).getTime();
    if (istDateKey(dueMs) !== todayKey) continue;
    console.log(`[login-lateness] shifting ${d.id} by ${Math.round(shiftMs/60000)}min`);
    await updateDoc(d.ref, {
      dueDate: new Date(dueMs + shiftMs).toISOString(),
      lastDeadlineShiftMs: shiftMs,
    });
  }
}

/** Emergency Mode shift — deliberately NOT restricted to "due today", unlike
 * the login-lateness shift above. An emergency gap should push back ANY
 * ongoing task's deadline, whichever day it currently falls on. */
async function shiftOngoingTaskDeadlines(employeeId, shiftMs) {
  if (!shiftMs || shiftMs <= 0) return;
  const { firebaseDb } = await import("../../../lib/coworkFirebase");
  const { collection, query, where, getDocs, updateDoc } = await import("firebase/firestore");
  const snap = await getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assigneeIds", "array-contains", employeeId)));
  console.log(`[emergency-shift] checking ${snap.docs.length} task(s) for employee ${employeeId}, shift=${Math.round(shiftMs/60000)}min`);
  let shifted = 0;
  for (const d of snap.docs) {
    const t = d.data();
    if (!t.dueDate) {
      console.log(`[emergency-shift] skipping ${d.id} — no dueDate yet (timer never started)`);
      continue;
    }
    if (TERMINAL_STATUSES.includes(t.status)) {
      console.log(`[emergency-shift] skipping ${d.id} — status "${t.status}" is terminal`);
      continue;
    }
    const dueMs = new Date(t.dueDate).getTime();
    console.log(`[emergency-shift] shifting ${d.id}: ${t.dueDate} → ${new Date(dueMs + shiftMs).toISOString()}`);
    await updateDoc(d.ref, {
      dueDate: new Date(dueMs + shiftMs).toISOString(),
      lastDeadlineShiftMs: shiftMs,
    });
    shifted++;
  }
  console.log(`[emergency-shift] done — ${shifted} task(s) actually shifted`);
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

async function applyPendingEmergencyGap(employeeId, statusRef) {
  const { getDoc, updateDoc } = await import("firebase/firestore");
  const snap = await getDoc(statusRef);
  const pendingMs = snap.exists() ? Number(snap.data().pendingEmergencyGapMs) || 0 : 0;
  console.log(`[emergency-shift] pending gap from Firestore: ${pendingMs}ms`);
  if (pendingMs <= 0) return;
  await updateDoc(statusRef, { pendingEmergencyGapMs: null });
  await shiftOngoingTaskDeadlines(employeeId, pendingMs);
}

async function setDutyMode(employeeId, targetMode, opts = {}) {
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

  let directEmergencyGapMs = 0;
  if (prevMode === "emergency" && targetMode === "offline") {
    const gap = now - (Number(prev.emergencyStartedAtMs) || now);
    patch.pendingEmergencyGapMs = gap > 0 ? gap : null;
    patch.emergencyStartedAtMs = null;
  } else if (prevMode === "emergency" && targetMode === "online") {
    directEmergencyGapMs = now - (Number(prev.emergencyStartedAtMs) || now);
    patch.emergencyStartedAtMs = null;
  } else if (targetMode === "emergency") {
    patch.emergencyStartedAtMs = now;
  }

  await setDoc(ref, patch, { merge: true });

  if (targetMode === "emergency") {
    console.log("[emergency-pause] entering Emergency Mode — attempting to pause any running timer");
    try {
      const paused = await autoPauseRunningTimer(employeeId);
      console.log(`[emergency-pause] paused ${paused.length} timer(s):`, paused.map(p => p.taskId));
    } catch (e) {
      console.warn("[DutyStatusToggle] could not auto-pause timer on emergency:", e.message);
    }
  }

  if (targetMode === "online") {
    try { await applyLoginLatenessShift(employeeId, ref); }
    catch (e) { console.warn("[DutyStatusToggle] lateness shift failed:", e.message); }

    console.log(`[emergency-shift] directEmergencyGapMs computed as: ${directEmergencyGapMs}ms`);
    if (directEmergencyGapMs > 0) {
      try { await shiftOngoingTaskDeadlines(employeeId, directEmergencyGapMs); }
      catch (e) { console.warn("[DutyStatusToggle] direct emergency shift failed:", e.message); }
    }

    try { await applyPendingEmergencyGap(employeeId, ref); }
    catch (e) { console.warn("[DutyStatusToggle] pending emergency shift failed:", e.message); }
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
      type: targetMode === "online" ? "login" : targetMode === "offline" ? "logout" : "emergency",
      at: serverTimestamp(),
      source: "manual",
      ...(targetMode === "emergency" ? { reason: opts.reason.trim() } : {}),
      ...(patch.pendingEmergencyGapMs ? { emergencyGapStoredMs: patch.pendingEmergencyGapMs } : {}),
      ...(directEmergencyGapMs > 0 ? { emergencyGapAppliedMs: directEmergencyGapMs } : {}),
      ...(dayKey ? { sessionHours: +sessionHours.toFixed(2) } : {}),
    });
  } catch (e) {
    console.warn("[DutyStatusToggle] could not write activity log:", e.message);
  }

  return { prevMode, directEmergencyGapMs };
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

export default function DutyStatusToggle({ employeeId, onStatusChange }) {
  const [status, setStatus] = useState(null);
  const [, setTick] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [emergencyReasonInput, setEmergencyReasonInput] = useState("");
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [resultIsError, setResultIsError] = useState(false);

  useEffect(() => {
    if (!employeeId) return;
    let unsub = () => {};
    (async () => {
      const { firebaseDb } = await import("../../../lib/coworkFirebase");
      const { doc, onSnapshot } = await import("firebase/firestore");
      unsub = onSnapshot(
        doc(firebaseDb, "cowork_duty_status", employeeId),
        (snap) => {
          if (!snap.exists()) { setStatus({ mode: "offline", sinceMs: null, dailyHours: {} }); return; }
          const d = snap.data();
          setStatus({
            mode: d.mode || (d.isOnline ? "online" : "offline"),
            sinceMs: d.since?.toDate ? d.since.toDate().getTime() : null,
            dailyHours: d.dailyHours || {},
            emergencyReason: d.emergencyReason || null,
            emergencyStartedAtMs: d.emergencyStartedAtMs || null,
          });
        },
        (e) => console.error("[DutyStatusToggle] snapshot:", e.message)
      );
    })();
    return () => unsub();
  }, [employeeId]);

  useEffect(() => {
    if (status?.mode !== "online") return;
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

  const stateClass = mode ? ` is-${mode}` : "";
  const label = mode === null ? "…" : mode === "online" ? "Online" : mode === "emergency" ? "Emergency" : "Offline";
  const caption = mode === "online" ? `Worked today · ${formatDuration(workedTodaySeconds)}`
    : mode === "emergency" ? `Since ${fmtTime(status?.emergencyStartedAtMs)}`
    : mode === "offline" ? "Not tracking time" : "";

  const statusDescription = mode === "online"
    ? "You're marked Online. Today's working time is being tracked automatically from your login."
    : mode === "emergency"
    ? `You're in Emergency Mode. Reason: "${status?.emergencyReason || "—"}". Nothing is being tracked as active work right now.`
    : "You're marked Offline. No working time is being tracked right now.";

  const openPanel = async () => {
    setResultMessage(null);
    setResultIsError(false);
    setPendingAction(null);
    setEmergencyReasonInput("");
    setPanelOpen(true);
    setLogs(await fetchRecentLogs(employeeId));
  };

  const confirm = async () => {
    const target = pendingAction;
    if (!target) return;
    if (target === "emergency" && !emergencyReasonInput.trim()) return;
    setBusy(true);
    try {
      const { prevMode } = await setDutyMode(employeeId, target, { reason: emergencyReasonInput });

      if (target === "emergency") {
        setResultMessage(`Emergency Mode activated at ${fmtTime(Date.now())}. Reason: "${emergencyReasonInput.trim()}". This time will be accounted for once you sign back in.`);
      } else if (target === "online") {
        const extra = prevMode === "emergency" ? " Your Emergency Mode time has been added to today's task deadlines." : "";
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
        const extra = prevMode === "emergency" ? " Your Emergency Mode time has been recorded and will be added to your tasks' deadlines at your next login." : "";
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
      try { setLogs(await fetchRecentLogs(employeeId)); } catch (_) {}
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
            ) : (
              <>
                <div className="cw-duty-section-label">Change status</div>
                <div className="cw-duty-mode-grid">
                  <button
                    className={`cw-duty-mode-btn${mode === "online" ? "" : " cw-duty-mode-btn-primary"}`}
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
                </div>
              </>
            )
          ) : pendingAction === "emergency" ? (
            <>
              <div className="cw-duty-section-label">Enter Emergency Mode</div>
              <div className="cw-duty-confirm-sub">A reason is required. This time will be added to today's task deadlines once you sign back in.</div>
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
          ) : (
            <>
              <div className="cw-duty-section-label">{pendingAction === "offline" ? "Sign out?" : "Sign in?"}</div>
              <div className="cw-duty-confirm-sub">
                {pendingAction === "offline"
                  ? "This logs your logout time and pauses any task timer you currently have running."
                  : mode === "emergency"
                  ? "This ends Emergency Mode and signs you in. The time will be added to today's task deadlines."
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

          <div className="cw-duty-history-title">Recent activity</div>
          {logs.length === 0 ? (
            <div className="cw-duty-history-empty">No activity yet.</div>
          ) : logs.slice(0, 6).map(l => (
            <div key={l.id} className="cw-duty-history-row">
              <span className={`cw-duty-history-tag ${l.type}`}>
                {l.type === "login" ? "Login" : l.type === "logout" ? "Logout" : "Emergency"}
              </span>
              <span className="cw-duty-history-time">{fmtTime(l.at)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}