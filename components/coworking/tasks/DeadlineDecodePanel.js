"use client";
import { useEffect, useState } from "react";
import { firebaseDb } from "../../../lib/coworkFirebase";
import { explainAddWorkingSecs } from "../../../lib/officeDueDate";

const F = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif";
const BRAND = "#1B4F8A";

const STEP_LABEL = {
  work: (s) => `Worked ${s.hoursUsed}h — ${s.date}, ${s.from} to ${s.to}${s.final ? " (deadline reached here)" : ""}`,
  break: (s) => `${s.name} — ${s.date}, ${s.from} to ${s.to}`,
  holiday: (s) => `${s.date} — company holiday${s.name ? ` (${s.name})` : ""}`,
  leave: (s) => `${s.date} — employee on approved leave`,
  off: (s) => `${s.date} — office closed`,
};

export default function DeadlineDecodePanel({ task }) {
  const [state, setState] = useState({ loading: true, steps: [], error: null });

  const assigneeId = (task.assigneeIds || [])[0];
  const windowSecs = Number(task.deadlineWindowSecs) || Number(task.senderTimerWindowSecs) || 0;
  const anchorMs = task.createdAt?.seconds
    ? task.createdAt.seconds * 1000
    : task.createdAt ? new Date(task.createdAt).getTime() : null;

  useEffect(() => {
    if (!assigneeId || !windowSecs || !anchorMs) { setState({ loading: false, steps: [], error: null }); return; }
    let cancelled = false;
    (async () => {
      try {
        const { getDoc, doc } = await import("firebase/firestore");
        const officeSnap = await getDoc(doc(firebaseDb, "cowork_settings", "office"));
        const officeData = officeSnap.exists() ? officeSnap.data() : {};
        const schedule = officeData.schedule || null;
        const breaks = officeData.breaks || [];

        const { firebaseAuth } = await import("../../../lib/coworkFirebase");
        const token = await firebaseAuth.currentUser?.getIdToken();
        const from = new Date(anchorMs).toISOString().slice(0, 10);
        const to = new Date(anchorMs + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const res = await fetch(`${BASE}/cowork/scheduling/blocked-dates?employeeId=${assigneeId}&from=${from}&to=${to}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const blockedMap = new Map(Object.entries(data.blockedDates || {}));

        const result = explainAddWorkingSecs(anchorMs, windowSecs, schedule, blockedMap, breaks);
        if (!cancelled) setState({ loading: false, steps: result.steps, error: null });
      } catch (e) {
        if (!cancelled) setState({ loading: false, steps: [], error: e.message });
      }
    })();
    return () => { cancelled = true; };
  }, [assigneeId, windowSecs, anchorMs]);

  if (!windowSecs || !anchorMs) return null;

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF", padding: "10px 0 6px" }}>
        Deadline Breakdown
      </div>

      {state.loading ? (
        <div style={{ fontSize: 11, color: "#9CA3AF", padding: "4px 0" }}>Loading…</div>
      ) : state.error ? (
        <div style={{ fontSize: 11, color: "#DC2626", padding: "4px 0" }}>Couldn't reconstruct this: {state.error}</div>
      ) : state.steps.length === 0 ? (
        <div style={{ fontSize: 11, color: "#9CA3AF", padding: "4px 0" }}>No breakdown available.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {state.steps.map((s, i) => {
            const isLast = i === state.steps.length - 1;
            const isWork = s.type === "work";
            const label = (STEP_LABEL[s.type] || STEP_LABEL.work)(s);
            return (
              <div key={i} style={{ display: "flex", gap: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 18, flexShrink: 0 }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%", marginTop: 4, flexShrink: 0,
                    background: isWork ? BRAND : "#CBD5E1",
                    border: "2px solid #fff", boxShadow: "0 0 0 1px #E5E7EB",
                  }} />
                  {!isLast && <div style={{ width: 1, flex: 1, background: "#E5E7EB", minHeight: 10 }} />}
                </div>
                <div style={{ flex: 1, paddingBottom: isLast ? 2 : 8, paddingLeft: 8 }}>
                  <span style={{ fontSize: 11.5, color: isWork ? "#1F2937" : "#6B7280", lineHeight: 1.5, fontWeight: isWork ? 600 : 400 }}>
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 8 }}>
        Reconstructed from current office settings — if holidays, leave, or breaks changed since this deadline was set, this may not exactly match what applied at that time.
      </div>
    </div>
  );
}