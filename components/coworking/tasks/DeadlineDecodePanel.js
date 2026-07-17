"use client";
import { useState } from "react";
import { firebaseDb } from "../../../lib/coworkFirebase";
import { explainAddWorkingSecs } from "../../../lib/officeDueDate";

const F = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif";
const BRAND = "#1B4F8A";
const GREEN = "#16A34A";

const STEP_LABEL = {
  work: (s) => `Worked ${s.hoursUsed}h — ${s.date}, ${s.from} to ${s.to}${s.final ? " (deadline reached here)" : ""}`,
  break: (s) => `${s.name} — ${s.date}, ${s.from} to ${s.to} — pushed the deadline forward`,
  holiday: (s) => `${s.date} — company holiday${s.name ? ` (${s.name})` : ""} — pushed the deadline forward`,
  leave: (s) => `${s.date} — employee on approved leave — pushed the deadline forward`,
  off: (s) => `${s.date} — office closed — pushed the deadline forward`,
  anchor: (s) => `Started after "${s.title}" (higher priority) — its deadline: ${s.dueDate}`,
  extension: (s) => `Extension approved — final deadline moved to ${s.dueDate}`,
};

const EXTENDS_DEADLINE = new Set(["break", "holiday", "leave", "off", "anchor", "extension"]);

export default function DeadlineDecodePanel({ task }) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState({ loading: false, loaded: false, steps: [], error: null });

  const assigneeId = (task.assigneeIds || [])[0];
  const windowSecs = Number(task.deadlineWindowSecs) || Number(task.senderTimerWindowSecs) || 0;
  const createdMs = task.createdAt?.seconds
    ? task.createdAt.seconds * 1000
    : task.createdAt ? new Date(task.createdAt).getTime() : null;

  if (!windowSecs || !createdMs) return null;

  const runDecode = async () => {
    setState({ loading: true, loaded: false, steps: [], error: null });
    try {
      const { getDoc, doc, getDocs, collection, query, where } = await import("firebase/firestore");
      const { firebaseAuth } = await import("../../../lib/coworkFirebase");

      const officeSnap = await getDoc(doc(firebaseDb, "cowork_settings", "office"));
      const officeData = officeSnap.exists() ? officeSnap.data() : {};
      const schedule = officeData.schedule || null;
      const breaks = officeData.breaks || [];

      const token = await firebaseAuth.currentUser?.getIdToken();
      const from = new Date(createdMs).toISOString().slice(0, 10);
      const to = new Date(createdMs + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const bdRes = await fetch(`${BASE}/cowork/scheduling/blocked-dates?employeeId=${assigneeId}&from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const bdData = await bdRes.json();
      const blockedMap = new Map(Object.entries(bdData.blockedDates || {}));

      // ── Did this task's clock actually start from task creation, or did it
      // anchor after a higher-priority task? Best-effort: nearest lower-numbered
      // priority sibling with an existing dueDate. Multi-hop chains aren't fully
      // replicated here — this covers the direct predecessor only. ──
      const leadingSteps = [];
      let anchorMs = createdMs;
      const thisPriority = Number(task.priority) || 99;
      if (assigneeId && thisPriority > 1) {
        const TERM = ["done", "cancelled", "tl_final_approved", "ceo_approved"];
        const snap = await getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assigneeIds", "array-contains", assigneeId)));
        const higher = snap.docs
          .map(d => ({ taskId: d.id, ...d.data() }))
          .filter(t => t.taskId !== task.taskId && Number(t.priority) < thisPriority && !TERM.includes(t.status) && t.dueDate)
          .sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate)); // latest-finishing predecessor
        if (higher.length > 0) {
          const pred = higher[0];
          anchorMs = new Date(pred.dueDate).getTime();
          leadingSteps.push({ type: "anchor", title: pred.title || pred.taskId, dueDate: new Date(pred.dueDate).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) });
        }
      }

      const result = explainAddWorkingSecs(anchorMs, windowSecs, schedule, blockedMap, breaks);
      const steps = [...leadingSteps, ...result.steps];

      // ── If an extension was later approved, the walked reconstruction above
      // doesn't know about it — the real stored dueDate is the source of truth. ──
      if (task.deadlineExtRequest?.status === "approved" && task.dueDate) {
        steps.push({
          type: "extension",
          dueDate: new Date(task.dueDate).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
        });
      }

      setState({ loading: false, loaded: true, steps, error: null });
    } catch (e) {
      setState({ loading: false, loaded: true, steps: [], error: e.message });
    }
  };

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !state.loaded && !state.loading) runDecode();
  };

  return (
    <div style={{ border: "1px solid #F1F5F9", borderRadius: 8, overflow: "hidden", fontFamily: F }}>
      <div
        onClick={handleToggle}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: "#F8FAFC", cursor: "pointer", userSelect: "none" }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: BRAND }}>Deadline Breakdown</span>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}>
          <path d="M2.5 1.5l4 3-4 3" stroke="#9CA3AF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {expanded && (
        <div style={{ padding: "12px" }}>
          {state.loading ? (
            <div style={{ fontSize: 11, color: "#9CA3AF" }}>Working it out…</div>
          ) : state.error ? (
            <div style={{ fontSize: 11, color: "#DC2626" }}>Couldn't reconstruct this: {state.error}</div>
          ) : state.steps.length === 0 ? (
            <div style={{ fontSize: 11, color: "#9CA3AF" }}>No breakdown available.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {state.steps.map((s, i) => {
                const isLast = i === state.steps.length - 1;
                const extends_ = EXTENDS_DEADLINE.has(s.type);
                const label = (STEP_LABEL[s.type] || STEP_LABEL.work)(s);
                return (
                  <div key={i} style={{ display: "flex", gap: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 18, flexShrink: 0 }}>
                      <div style={{
                        width: 7, height: 7, borderRadius: "50%", marginTop: 4, flexShrink: 0,
                        background: extends_ ? GREEN : BRAND,
                        border: "2px solid #fff", boxShadow: "0 0 0 1px #E5E7EB",
                      }} />
                      {!isLast && <div style={{ width: 1, flex: 1, background: "#E5E7EB", minHeight: 10 }} />}
                    </div>
                    <div style={{ flex: 1, paddingBottom: isLast ? 2 : 8, paddingLeft: 8 }}>
                      <span style={{ fontSize: 11.5, lineHeight: 1.5, fontWeight: extends_ ? 600 : 500, color: extends_ ? GREEN : "#1F2937" }}>
                        {label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 10, lineHeight: 1.5 }}>
            Green rows are what pushed this deadline later than a plain hour-count would give. Reconstructed from current office settings and the direct predecessor task only — multi-step priority chains and older settings changes may not be fully reflected.
          </div>
        </div>
      )}
    </div>
  );
}