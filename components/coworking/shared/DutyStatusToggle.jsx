"use client";
import { useEffect, useState } from "react";

async function setDutyStatus(employeeId, isOnline) {
  const { firebaseDb } = await import("../../../lib/coworkFirebase");
  const { doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp, increment } = await import("firebase/firestore");

  const ref = doc(firebaseDb, "cowork_duty_status", employeeId);

  let sessionHours = 0;
  let dayKey = null;
  if (!isOnline) {
    try {
      const prev = await getDoc(ref);
      const prevSince = prev.exists() ? prev.data().since : null;
      if (prevSince?.toDate) {
        const startedAt = prevSince.toDate();
        sessionHours = Math.max((Date.now() - startedAt.getTime()) / 3600000, 0);
        dayKey = startedAt.toISOString().slice(0, 10);
      }
    } catch (e) {
      console.warn("[DutyStatusToggle] could not read previous session:", e.message);
    }
  }

  await setDoc(ref, { employeeId, isOnline, since: serverTimestamp() }, { merge: true });

  try {
    if (dayKey && sessionHours > 0) {
      await updateDoc(ref, { [`dailyHours.${dayKey}`]: increment(+sessionHours.toFixed(2)) });
    }
  } catch (e) {
    console.warn("[DutyStatusToggle] could not record daily hours:", e.message);
  }

  try {
    await addDoc(collection(firebaseDb, "cowork_duty_status", employeeId, "logs"), {
      type: isOnline ? "login" : "logout",
      at: serverTimestamp(),
      source: "manual",
      ...(dayKey ? { sessionHours: +sessionHours.toFixed(2) } : {}),
    });
  } catch (e) {
    console.warn("[DutyStatusToggle] could not write activity log:", e.message);
  }
}

async function fetchRecentLogs(employeeId, max = 8) {
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
          if (!snap.exists()) { setStatus({ isOnline: false, sinceMs: null, dailyHours: {} }); return; }
          const d = snap.data();
          setStatus({
            isOnline: !!d.isOnline,
            sinceMs: d.since?.toDate ? d.since.toDate().getTime() : null,
            dailyHours: d.dailyHours || {},
          });
        },
        (e) => console.error("[DutyStatusToggle] snapshot:", e.message)
      );
    })();
    return () => unsub();
  }, [employeeId]);

  useEffect(() => {
    if (!status?.isOnline) return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [status?.isOnline]);

  const isOnline = status?.isOnline ?? null;
  const todayKey = new Date().toISOString().slice(0, 10);

  const workedTodaySeconds = (() => {
    if (!status?.isOnline) return 0;
    const closedToday = (status.dailyHours?.[todayKey] || 0) * 3600;
    const openSession = status.sinceMs ? (Date.now() - status.sinceMs) / 1000 : 0;
    return closedToday + openSession;
  })();

  const stateClass = isOnline === null ? "" : isOnline ? " is-online" : " is-offline";
  const label = isOnline === null ? "…" : isOnline ? `Online · ${formatDuration(workedTodaySeconds)}` : "Offline";

  const statusDescription = isOnline
    ? "You're marked Online — today's working time is being tracked automatically from your login."
    : "You're marked Offline — no working time is being tracked right now.";

  const openPanel = async () => {
    setResultMessage(null);
    setResultIsError(false);
    setPanelOpen(true);
    setLogs(await fetchRecentLogs(employeeId));
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const next = !isOnline;
      await setDutyStatus(employeeId, next); // real failure only if THIS throws

      if (next) {
        setResultIsError(false);
        setResultMessage(`You're online. Login recorded at ${fmtTime(Date.now())}.`);
      } else {
        let pauseNote = "";
        try {
          const paused = await autoPauseRunningTimer(employeeId);
          if (paused.length > 0) {
            const p = paused[0];
            pauseNote = ` Your running timer on "${p.taskTitle}" was paused automatically — ${formatDuration(p.totalSeconds)} logged.`;
          }
        } catch (e) {
          console.warn("[DutyStatusToggle] could not auto-pause timer:", e.message);
          pauseNote = " (Couldn't confirm whether a task timer was running — please pause it manually if one was.)";
        }
        setResultIsError(false);
        setResultMessage(`You're offline. Logout recorded at ${fmtTime(Date.now())}.${pauseNote}`);
      }

      // Optional parent hook. Success is already shown above — this must
      // NEVER be able to turn that success message into an error message.
      try {
        onStatusChange?.(next);
      } catch (e) {
        console.error("[DutyStatusToggle] onStatusChange callback threw — check CoworkingShell.js's wiring (likely a missing `socket` reference):", e.message);
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
        title={`You're ${isOnline ? "Online" : "Offline"} — click to change`}
        onClick={openPanel}
      >
        <span className="cw-duty-dot" />
        <span className="cw-duty-text-col">
          <span className="cw-duty-label">{isOnline === null ? "…" : isOnline ? "Online" : "Offline"}</span>
          <span className="cw-duty-caption">
            {isOnline === null ? "" : isOnline ? `Worked today · ${formatDuration(workedTodaySeconds)}` : "Not tracking time"}
          </span>
        </span>
      </button>

      <div className={`cw-duty-panel-overlay${panelOpen ? " show" : ""}`} onClick={() => !busy && setPanelOpen(false)} />
      <div className={`cw-duty-panel${panelOpen ? " open" : ""}`}>
        <div className="cw-duty-panel-head">
          <span className="cw-duty-panel-title">Duty Status</span>
          <button className="cw-duty-panel-close" onClick={() => !busy && setPanelOpen(false)}>×</button>
        </div>

        <div className="cw-duty-panel-body">
          {isOnline ? (
            <div className="cw-duty-live-box is-online">
              <div className="cw-duty-live-label">Worked today</div>
              <div className="cw-duty-live-value">{formatDuration(workedTodaySeconds)}</div>
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
          ) : (
            <>
              <div className="cw-duty-confirm-title">{isOnline ? "Go Offline?" : "Go Online?"}</div>
              <div className="cw-duty-confirm-sub">
                {isOnline
                  ? "This logs your Logout time now and automatically pauses any task timer you currently have running."
                  : "This logs your Login time now, starting today's tracked work session."}
              </div>
              <div className="cw-duty-confirm-actions">
                <button className="cw-duty-btn-cancel" onClick={() => setPanelOpen(false)} disabled={busy}>Cancel</button>
                <button className={isOnline ? "cw-duty-btn-danger" : "cw-duty-btn-primary"} onClick={confirm} disabled={busy}>
                  {busy ? "Saving…" : isOnline ? "Yes, Log Out" : "Yes, Log In"}
                </button>
              </div>
            </>
          )}

          <div className="cw-duty-history-title">Recent activity</div>
          {logs.length === 0 ? (
            <div className="cw-duty-history-empty">No activity yet.</div>
          ) : logs.map(l => (
            <div key={l.id} className="cw-duty-history-row">
              <span className={`cw-duty-history-tag ${l.type}`}>{l.type === "login" ? "Login" : "Logout"}</span>
              <span className="cw-duty-history-time">{fmtTime(l.at)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}