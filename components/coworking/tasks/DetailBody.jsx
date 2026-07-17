/**
 * components/coworking/tasks/DetailBody.jsx
 * 
 * // <components />
 <page className="js"></page>
 *
 * FORMAL, CLEAN redesign of the Details tab right panel.
 * Replaces the existing DetailBody function in page.js.
 * Drop-in: same props signature, same internal logic, no changes needed elsewhere.
 *
 * Design principles:
 * - Plain white background, no colored gradients or cartoon cards
 * - Data shown as clean label → value rows (like a form)
 * - Workflow actions shown as clear, simple buttons with short plain-English labels
 * - No decorative emojis in structural UI (only in user-supplied content)
 * - IBM Plex Sans, #1B4F8A brand color
 */
"use client";
import { useState, useEffect, useRef } from "react";
import { GwAvatar } from "../shared/CoworkShared";
import { ReportCard, ReportDateGroup } from "./ReportCard";
import ThirdPartyTask from "./ThirdPartyTask";
import GoalTask from "./GoalTask";
import DeadlineBreakdown from "./DeadlineBreakdown";
import { formatTimeHMS } from "../../../hooks/useTaskTimer";
import { firebaseDb } from "../../../lib/coworkFirebase";
import { addWorkingSecs } from "../../../lib/officeDueDate";

// ── tiny helpers ──────────────────────────────────────────────────────────────
const F = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif";
const BRAND = "#1B4F8A";

function fmtSecs(s) {
  s = Math.max(0, Math.round(Number(s) || 0));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) {
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(s / 86400)}d`;
}

function fmtDate(v) {
  if (!v) return null;
  try { return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return null; }
}

function fmtDateTime(v) {
  if (!v) return null;
  try { return new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return null; }
}

// Status display map
const STATUS_LABEL = {
  open: "Not Started", confirmed: "Confirmed", in_progress: "In Progress",
  done: "Done", pending_deadline_approval: "Awaiting Deadline Approval",
  pending_employee_deadline_confirmation: "Awaiting Your Response",
  deadline_approved: "Deadline Approved", deadline_rejected: "Deadline Rejected",
};
const STATUS_COLOR = {
  open: "#D97706", confirmed: "#4F46E5", in_progress: "#7C3AED",
  done: "#16A34A", pending_deadline_approval: "#D97706",
  pending_employee_deadline_confirmation: "#D97706",
  deadline_approved: "#16A34A", deadline_rejected: "#DC2626",
};
const COMP_LABEL = {
  submitted: "Submitted — Awaiting Review",
  tl_approved: "TL Approved — Awaiting CEO",
  tl_rejected: "Rejected by TL",
  tl_final_approved: "Approved & Complete",
  ceo_approved: "CEO Approved & Complete",
  ceo_rejected: "Rejected by CEO",
};
const COMP_COLOR = {
  submitted: "#D97706", tl_approved: "#4F46E5", tl_rejected: "#DC2626",
  tl_final_approved: "#16A34A", ceo_approved: "#16A34A", ceo_rejected: "#DC2626",
};

// ─────────────────────────────────────────────────────────────────────────────
// Row: label + value layout used throughout the info tab
function InfoRow({ label, children, noBorder }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0, padding: "9px 0", borderBottom: noBorder ? "none" : "1px solid #F1F5F9" }}>
      <span style={{ width: 110, flexShrink: 0, fontSize: 11, color: "#9CA3AF", fontWeight: 500, paddingTop: 1, lineHeight: 1.4 }}>{label}</span>
      <span style={{ flex: 1, fontSize: 12, color: "#1F2937", fontWeight: 500, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small status badge
function StatusBadge({ status }) {
  const label = STATUS_LABEL[status] || status || "Unknown";
  const color = STATUS_COLOR[status] || "#6B7280";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 4, border: `1px solid ${color}22`, background: `${color}11`, fontSize: 11, fontWeight: 600, color }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Priority badge
// priority is stored as a number (1–10) or occasionally a string ("high"/"P1")
const PRI_COLOR_NUM = { 1: "#DC2626", 2: "#EA580C", 3: "#D97706", 4: "#2563EB", 5: "#16A34A" };
const PRI_COLOR_STR = { high: "#DC2626", urgent: "#DC2626", medium: "#D97706", low: "#16A34A", p1: "#DC2626", p2: "#EA580C", p3: "#D97706", p4: "#2563EB", p5: "#16A34A" };
function PriBadge({ priority }) {
  if (priority === null || priority === undefined || priority === "") return <span style={{ color: "#9CA3AF", fontSize: 11 }}>—</span>;
  const n = Number(priority);
  if (!isNaN(n) && n > 0) {
    const color = PRI_COLOR_NUM[Math.min(n, 5)] || "#6B7280";
    return <span style={{ fontSize: 11, fontWeight: 700, color }}>P{n}</span>;
  }
  // string fallback
  const key = String(priority).toLowerCase().trim();
  const color = PRI_COLOR_STR[key] || "#6B7280";
  return <span style={{ fontSize: 11, fontWeight: 700, color }}>{String(priority).toUpperCase()}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header
function Section({ title }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF", padding: "14px 0 4px", borderBottom: "1px solid #F1F5F9", marginBottom: 2 }}>
      {title}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action button — primary (filled) or secondary (outlined)
function ActionBtn({ onClick, disabled, busy, variant = "primary", children, danger }) {
  const base = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    width: "100%", padding: "9px 14px", borderRadius: 6,
    fontSize: 12, fontWeight: 600, cursor: disabled || busy ? "not-allowed" : "pointer",
    fontFamily: F, transition: "all 0.12s", border: "none",
    opacity: disabled || busy ? 0.5 : 1,
  };
  const filled = { ...base, background: danger ? "#DC2626" : BRAND, color: "#fff" };
  const outlined = { ...base, background: "#fff", color: danger ? "#DC2626" : BRAND, border: `1px solid ${danger ? "#DC2626" : BRAND}` };
  const ghost = { ...base, background: "#F8FAFC", color: "#374151", border: "1px solid #E5E7EB" };
  const s = variant === "primary" ? filled : variant === "outline" ? outlined : ghost;
  return <button style={s} onClick={onClick} disabled={disabled || busy}>{busy ? "Processing…" : children}</button>;
}

// Spinner icon
function Spin() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: "db-spin 1s linear infinite", flexShrink: 0 }}>
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}

// ── RepeatSlots — shows time slots for repeat tasks ──────────────────────────
function RepeatSlots({ task, employeeId, isAssignee, isCEO, isTL }) {
  const rc = task.repeatConfig || {};
  const times = rc.deadlineTimes || (rc.deadlineTime ? [rc.deadlineTime] : ["10:00"]);
  const totalSlots = rc.timesPerDay || times.length || 1;
  const todayStr = new Date().toISOString().split("T")[0];
  const todaySubs = task.repeatSubmissions?.[todayStr] || {};
  const now = new Date();
  const currentHHMM = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");

  const [slotStates, setSlotStates] = useState(() =>
    Array.from({ length: totalSlots }, () => ({ comment: "", files: [], uploading: false, submitting: false, error: "" }))
  );
  const updateSlot = (i, patch) =>
    setSlotStates(prev => prev.map((s, j) => j === i ? { ...s, ...patch } : s));

  const handleFiles = async (i, fileList) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    updateSlot(i, { uploading: true, error: "" });
    try {
      const { firebaseAuth } = await import("../../../lib/coworkFirebase");
      const token = await firebaseAuth.currentUser?.getIdToken();
      const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const uploaded = await Promise.all(files.map(async file => {
        const isImage = file.type.startsWith("image/");
        if (isImage) {
          const { uploadImage } = await import("../../../lib/mediaUploadApi");
          const r = await uploadImage(file, "cowork-repeat-submissions");
          return { name: file.name, url: r.url, type: "image", size: file.size };
        }
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`${BASE}/cowork/upload/pdf`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Upload failed");
        return { name: file.name, url: d.viewUrl || d.url, downloadUrl: d.downloadUrl, type: "file", size: file.size };
      }));
      updateSlot(i, { files: [...slotStates[i].files, ...uploaded], uploading: false });
    } catch (e) { updateSlot(i, { uploading: false, error: e.message }); }
  };

  const handleSubmit = async (i) => {
    if (slotStates[i].submitting) return;
    updateSlot(i, { submitting: true, error: "" });
    try {
      const { firebaseAuth } = await import("../../../lib/coworkFirebase");
      const token = await firebaseAuth.currentUser?.getIdToken();
      const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${BASE}/cowork/task/${task.taskId}/repeat-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date: todayStr, slotIndex: i, comment: slotStates[i].comment, files: slotStates[i].files }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Submit failed");
      updateSlot(i, { submitting: false, comment: "", files: [] });
    } catch (e) { updateSlot(i, { submitting: false, error: e.message }); }
  };

  return (
    <div style={{ padding: "10px 16px", fontFamily: F }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF", marginBottom: 8 }}>
        {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
      </div>
      {Array.from({ length: totalSlots }, (_, i) => {
        const slotKey = `slot_${i}`;
        const existing = todaySubs[slotKey];
        const deadline = times[i] || times[times.length - 1];
        const isPast = currentHHMM > deadline;
        const ss = slotStates[i];
        const statusColor = existing ? "#16A34A" : isPast ? "#DC2626" : "#D97706";
        const statusText = existing ? `Submitted ${existing.submittedAt ? new Date(existing.submittedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}` : isPast ? "Missed" : "Pending";
        return (
          <div key={i} style={{ borderBottom: "1px solid #F1F5F9", padding: "10px 12px", borderRadius: 6, background: existing ? "#F0FDF4" : "#FAFAFA", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: existing || (!existing && isAssignee) ? 8 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#1F2937" }}>Slot {i + 1}</span>
                <span style={{ fontSize: 10, color: "#6B7280" }}>{deadline}</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: statusColor }}>{statusText}</span>
            </div>
            {existing && (
              <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.5, paddingLeft: 2 }}>
                {existing.comment && <div style={{ color: "#1F2937", marginBottom: 4 }}>{existing.comment}</div>}
                {existing.files?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {existing.files.map((f, fi) => (
                      <a key={fi} href={f.url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#F1F5F9", color: "#1B4F8A", textDecoration: "none" }}>
                        📎 {f.name}
                      </a>
                    ))}
                  </div>
                )}
                {(isCEO || isTL) && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>{existing.submittedByName}</div>}
              </div>
            )}
            {!existing && isAssignee && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <textarea placeholder="Message (optional)" value={ss.comment}
                  onChange={e => updateSlot(i, { comment: e.target.value })} rows={2}
                  style={{ width: "100%", padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: 5, fontSize: 11, fontFamily: F, resize: "none", outline: "none", background: "#fff", boxSizing: "border-box", color: "#1F2937" }} />
                {ss.files.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {ss.files.map((f, fi) => (
                      <div key={fi} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#F1F5F9", color: "#374151", display: "flex", alignItems: "center", gap: 3 }}>
                        📎 {f.name}
                        <button onClick={() => updateSlot(i, { files: ss.files.filter((_, idx) => idx !== fi) })} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 11, padding: 0, lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                {ss.error && <div style={{ fontSize: 10, color: "#DC2626" }}>{ss.error}</div>}
                <div style={{ display: "flex", gap: 6 }}>
                  <label style={{ fontSize: 11, color: "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", border: "1px solid #E5E7EB", borderRadius: 5, background: "#fff" }}>
                    <input type="file" multiple style={{ display: "none" }} disabled={ss.uploading} onChange={e => { handleFiles(i, e.target.files); e.target.value = ""; }} />
                    {ss.uploading ? "Uploading…" : "📎 Attach"}
                  </label>
                  <button disabled={ss.submitting || ss.uploading} onClick={() => handleSubmit(i)}
                    style={{ flex: 1, padding: "5px 10px", borderRadius: 5, border: "none", background: BRAND, color: "#fff", fontSize: 11, fontWeight: 600, cursor: (ss.submitting || ss.uploading) ? "not-allowed" : "pointer", opacity: (ss.submitting || ss.uploading) ? 0.6 : 1, fontFamily: F }}>
                    {ss.submitting ? "Submitting…" : "Submit"}
                  </button>
                </div>
              </div>
            )}
            {!existing && !isAssignee && (
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>No submission yet.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── WorkLogsSection ───────────────────────────────────────────────────────────
// Collapsible. Shows: approved vs used time summary, progress bar, extension
// history, and a tree-style list of every timer-pause commit log.
// Visible to all roles — sender / TL / CEO can audit the full work timeline.
function WorkLogsSection({ task }) {
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [logError, setLogError] = useState("");

  const _origWindowTop = Number(task.deadlineWindowSecs) || Number(task.senderTimerWindowSecs) || 0;
  const _hasExtTop = task.deadlineExtRequest?.status === "approved" && task.dueDate;
  const _wallTotalTop = _hasExtTop
    ? Math.round((new Date(task.dueDate).getTime() - (task.startedAt?.seconds
      ? task.startedAt.seconds * 1000
      : new Date(task.startedAt || Date.now()).getTime())) / 1000)
    : 0;
  const windowSecs = (_hasExtTop && _wallTotalTop > _origWindowTop)
    ? _wallTotalTop
    : _origWindowTop;

  useEffect(() => {
    if (!expanded || !task.taskId) return;
    const assigneeIds = task.assigneeIds || [];
    if (!assigneeIds.length) { setLoading(false); return; }
    setLoading(true);
    setLogError("");
    (async () => {
      try {
        // No orderBy — avoids requiring a Firestore composite index.
        // We sort the results in JS after fetching.
        const { collection, query, where, getDocs } = await import("firebase/firestore");
        const { firebaseDb } = await import("../../../lib/coworkFirebase");
        const all = [];
        for (const aid of assigneeIds) {
          const q = query(
            collection(firebaseDb, "cowork_work_commits", aid, "logs"),
            where("taskId", "==", task.taskId)
          );
          const snap = await getDocs(q);
          snap.docs.forEach(d => all.push({ ...d.data(), id: d.id }));
        }
        // Sort chronologically by stoppedAt (Firestore Timestamp or ISO string)
        all.sort((a, b) => {
          const ta = a.stoppedAt?.seconds ?? (a.stoppedAt ? new Date(a.stoppedAt).getTime() / 1000 : 0);
          const tb = b.stoppedAt?.seconds ?? (b.stoppedAt ? new Date(b.stoppedAt).getTime() / 1000 : 0);
          return ta - tb;
        });
        setLogs(all);
      } catch (e) {
        console.error("WorkLogsSection fetch error:", e);
        setLogError(e?.message || "Failed to load logs.");
      }
      finally { setLoading(false); }
    })();
  }, [expanded, task.taskId]);

  const totalWorked = logs.length > 0
    ? logs.reduce((s, l) => s + (Number(l.secondsWorked) || 0), 0)
    : Number(task.timerTotalSeconds || task.workedSeconds || 0);

  const overUsed = windowSecs > 0 && totalWorked > windowSecs;
  const extReq = task.deadlineExtRequest;

  const fmtTs = (ts) => {
    if (!ts) return "—";
    const ms = ts?.seconds ? ts.seconds * 1000 : new Date(ts).getTime();
    if (!ms || isNaN(ms)) return "—";
    return new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={{ border: "1px solid #F1F5F9", borderRadius: 8, overflow: "hidden", fontFamily: F }}>

      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: "#F8FAFC", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <span style={{ fontSize: 11, fontWeight: 700, color: BRAND }}>Work Timeline</span>
          {(logs.length > 0 || totalWorked > 0) && (
            <span style={{ fontSize: 9, fontWeight: 700, background: "#EBF2FA", color: BRAND, padding: "1px 6px", borderRadius: 99 }}>
              {logs.length > 0 ? `${logs.length} session${logs.length > 1 ? "s" : ""}` : "tracked"}
            </span>
          )}
          {extReq && (
            <span style={{ fontSize: 9, fontWeight: 700, background: "#FFFBEB", color: "#D97706", padding: "1px 6px", borderRadius: 99 }}>
              {extReq.status === "approved" ? "ext. approved" : extReq.status === "pending" ? "ext. pending" : "ext. rejected"}
            </span>
          )}
        </div>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}>
          <path d="M2.5 1.5l4 3-4 3" stroke="#9CA3AF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {expanded && (
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Summary cards */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {windowSecs > 0 && (
              <div style={{ flex: 1, minWidth: 88, padding: "8px 10px", background: "#EBF2FA", borderRadius: 6, border: "1px solid #BFDBFE" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: BRAND, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Approved</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: BRAND, fontFamily: "monospace" }}>{fmtSecs(windowSecs)}</div>
                <div style={{ fontSize: 9, color: "#64748B", marginTop: 2 }}>allocated window</div>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 88, padding: "8px 10px", background: overUsed ? "#FEF2F2" : "#F0FDF4", borderRadius: 6, border: `1px solid ${overUsed ? "#FECDD3" : "#BBF7D0"}` }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: overUsed ? "#DC2626" : "#16A34A", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Used</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: overUsed ? "#DC2626" : "#16A34A", fontFamily: "monospace" }}>{fmtSecs(totalWorked)}</div>
              <div style={{ fontSize: 9, color: "#64748B", marginTop: 2 }}>time worked</div>
            </div>
            {windowSecs > 0 && totalWorked > 0 && (
              <div style={{ flex: 1, minWidth: 88, padding: "8px 10px", background: "#F8FAFC", borderRadius: 6, border: "1px solid #E5E7EB" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
                  {overUsed ? "Over by" : "Remaining"}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: overUsed ? "#DC2626" : "#059669", fontFamily: "monospace" }}>
                  {overUsed ? fmtSecs(totalWorked - windowSecs) : fmtSecs(windowSecs - totalWorked)}
                </div>
                <div style={{ fontSize: 9, color: "#64748B", marginTop: 2 }}>{overUsed ? "past deadline" : "left in window"}</div>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {windowSecs > 0 && totalWorked > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: "#9CA3AF" }}>Time usage</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: overUsed ? "#DC2626" : "#374151" }}>
                  {Math.round((totalWorked / windowSecs) * 100)}% of approved window
                </span>
              </div>
              <div style={{ height: 6, background: "#F1F5F9", borderRadius: 99, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(100, (totalWorked / windowSecs) * 100)}%`,
                  background: overUsed ? "#DC2626" : totalWorked / windowSecs > 0.8 ? "#D97706" : "#16A34A",
                  borderRadius: 99, transition: "width 0.5s",
                }} />
              </div>
              {overUsed && (
                <div style={{ fontSize: 10, color: "#DC2626", fontWeight: 600, marginTop: 4 }}>
                  Exceeded approved window by {fmtSecs(totalWorked - windowSecs)}
                </div>
              )}
            </div>
          )}

          {/* Extension history */}
          {extReq && (
            <div style={{ padding: "10px 12px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                <span style={{ fontSize: 12 }}>⏰</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#D97706", textTransform: "uppercase", letterSpacing: "0.06em" }}>Deadline Extension</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                  background: extReq.status === "approved" ? "#DCFCE7" : extReq.status === "rejected" ? "#FEE2E2" : "#FEF9C3",
                  color: extReq.status === "approved" ? "#166534" : extReq.status === "rejected" ? "#991B1B" : "#854D0E",
                }}>
                  {(extReq.status || "pending").toUpperCase()}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "#374151", lineHeight: 1.6 }}>
                {extReq.requestedByName && <div>Requested by: <strong>{extReq.requestedByName}</strong></div>}
                {extReq.proposedDate && <div>Proposed: <strong>{fmtDateTime(extReq.proposedDate)}</strong></div>}
                {extReq.reason && <div style={{ color: "#6B7280" }}>Reason: "{extReq.reason}"</div>}
                {extReq.status === "approved" && task.dueDate && (
                  <div style={{ color: "#166534", fontWeight: 600, marginTop: 3 }}>
                    ✅ Approved — new deadline: {fmtDateTime(task.dueDate)}
                  </div>
                )}
                {extReq.status === "rejected" && extReq.rejectionReason && (
                  <div style={{ color: "#991B1B", marginTop: 3 }}>✕ Rejected: "{extReq.rejectionReason}"</div>
                )}
                {extReq.status === "countered" && extReq.counterDate && (
                  <div style={{ color: "#7C3AED", marginTop: 3 }}>↩ Counter proposed: {fmtDateTime(extReq.counterDate)}</div>
                )}
              </div>
            </div>
          )}

          {/* Work session logs (tree structure) */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
              Work Sessions {logs.length > 0 ? `(${logs.length})` : ""}
            </div>
            {loading ? (
              <div style={{ fontSize: 11, color: "#9CA3AF", padding: "6px 0", display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ animation: "db-spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
                Loading sessions…
              </div>
            ) : logError ? (
              <div style={{ fontSize: 11, color: "#DC2626", padding: "6px 8px", background: "#FEF2F2", border: "1px solid #FECDD3", borderRadius: 5 }}>
                ⚠️ {logError}
              </div>
            ) : logs.length === 0 ? (
              <div style={{ fontSize: 11, color: "#9CA3AF", padding: "4px 0" }}>
                No sessions recorded. Logs appear after the first timer pause.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {logs.map((log, i) => {
                  const isLast = i === logs.length - 1;
                  return (
                    <div key={log.id || i} style={{ display: "flex", gap: 0 }}>
                      {/* Tree line */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 22, flexShrink: 0 }}>
                        <div style={{
                          width: 9, height: 9, borderRadius: "50%", marginTop: 4, flexShrink: 0,
                          background: log.autoStopped ? "#D97706" : BRAND,
                          border: "2px solid #fff", boxShadow: "0 0 0 1px #E5E7EB",
                        }} />
                        {!isLast && <div style={{ width: 1, flex: 1, background: "#E5E7EB", minHeight: 12 }} />}
                      </div>
                      {/* Log content */}
                      <div style={{ flex: 1, paddingBottom: isLast ? 2 : 10, paddingLeft: 8 }}>
                        {/* Session header: duration + auto-stop badge */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#1F2937", fontFamily: "monospace" }}>
                            {fmtSecs(Number(log.secondsWorked) || 0)}
                          </span>
                          {log.autoStopped && (
                            <span style={{ fontSize: 9, fontWeight: 600, background: "#FEF3C7", color: "#D97706", padding: "1px 5px", borderRadius: 3 }}>
                              {log.reason === "submission" ? "auto-stopped · submitted"
                                : log.reason === "deadline_reached" ? "auto-stopped · deadline reached"
                                  : "auto-stopped"}
                            </span>
                          )}
                        </div>
                        {/* Start → Pause timestamps */}
                        {(() => {
                          const stopMs = log.stoppedAt?.seconds
                            ? log.stoppedAt.seconds * 1000
                            : log.stoppedAt ? new Date(log.stoppedAt).getTime() : null;
                          const startMs = stopMs != null
                            ? stopMs - (Number(log.secondsWorked) || 0) * 1000
                            : null;
                          const fmt = (ms) => ms
                            ? new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                            : "—";
                          return (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: log.message ? 6 : 2, flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 7px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 4 }}>
                                <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polygon points="3,1 11,6 3,11" fill="#16A34A" /></svg>
                                <span style={{ fontSize: 10, color: "#166534", fontWeight: 600 }}>{fmt(startMs)}</span>
                              </div>
                              <svg width="10" height="8" viewBox="0 0 14 8" fill="none">
                                <path d="M1 4h12M9 1l3 3-3 3" stroke="#9CA3AF" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 7px", background: "#FEF2F2", border: "1px solid #FECDD3", borderRadius: 4 }}>
                                <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><rect x="2" y="1" width="3" height="10" rx="1" fill="#DC2626" /><rect x="7" y="1" width="3" height="10" rx="1" fill="#DC2626" /></svg>
                                <span style={{ fontSize: 10, color: "#991B1B", fontWeight: 600 }}>{fmt(stopMs)}</span>
                              </div>
                            </div>
                          );
                        })()}
                        {log.message && (
                          <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.5, background: "#F8FAFC", border: "1px solid #F1F5F9", borderRadius: 5, padding: "6px 9px", marginBottom: log.attachments?.length ? 5 : 0 }}>
                            {log.message}
                          </div>
                        )}
                        {log.attachments?.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {log.attachments.map((a, ai) => (
                              <a key={ai} href={a.url} target="_blank" rel="noreferrer"
                                style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "#EBF2FA", color: BRAND, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
                                📎 {a.name}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
export default function DetailBody({
  task, dailyReports, reportsLoading, activeDetailTab, setActiveDetailTab,
  isAssignee, isConfirmed, isStarted, isCEO, isTL, actionBusy, handleAction, handleSelectNode,
  employeeId, pct, pctColor, pctGradient, unreadCounts, employeeMap, employeeMapFull, chatMessages,
  timerActiveTaskId, getDisplaySeconds, getTimerSession, timerStart, timerPause, watchedTimers,
  deadlineFlow, onUpdatePriority, extFlow, hasForwardedChild, handleTimerStart, handleTimerPause,
}) {
  const df = deadlineFlow || {};
  const ef = extFlow || {};

  // ── derived ──────────────────────────────────────────────────────────────
  const status = task.status;
  const workedSecs = getDisplaySeconds ? getDisplaySeconds(task.taskId) : 0;
  // Total window = original + extension (if extension was approved and timer resumed)
  // Use wall-clock remaining from dueDate as total window when extension exists
  const _origWindow = Number(task.deadlineWindowSecs) || Number(task.senderTimerWindowSecs) || 0;
  const _hasExtension = task.deadlineExtRequest?.status === "approved" && task.dueDate;
  const _wallClockTotal = _hasExtension
    ? Math.round((new Date(task.dueDate).getTime() - (task.startedAt?.seconds
      ? task.startedAt.seconds * 1000
      : new Date(task.startedAt || Date.now()).getTime())) / 1000)
    : 0;
  const windowSecs = (_hasExtension && _wallClockTotal > _origWindow)
    ? _wallClockTotal
    : _origWindow;
  const isRunningThis = timerActiveTaskId === task.taskId;
  const timerSession = getTimerSession ? getTimerSession(task.taskId) : null;

  // Use wall-clock dueDate when available — handles approved extensions correctly.
  // Without this, isTimerExceeded stays true even after extension is approved
  // because workedSecs(2m) >= windowSecs(2m) never resets.
  const _isTerminal = ["done", "cancelled", "tl_final_approved", "ceo_approved"].includes(task.status)
    || ["tl_final_approved", "ceo_approved", "tl_approved"].includes(task.completionStatus);
  const isTimerExceeded = _isTerminal ? false : task.dueDate
    ? new Date(task.dueDate) < new Date()
    : (windowSecs > 0 && workedSecs >= windowSecs);
  const isFixedDeadlinePassed = !task.hasTimer && task.fixedDeadline && new Date(task.fixedDeadline) < new Date() && ["in_progress", "confirmed"].includes(task.status);
  const timerBlocked = timerActiveTaskId && timerActiveTaskId !== task.taskId;

  // Wall-clock based remaining/over — reflects approved extensions immediately
  // When timer hasn't started yet (workedSecs=0, not running), show full budget
  // not wall-clock dueDate which may differ from window due to cascade timing gaps.
  const remainingSecs = (task.hasTimer && windowSecs > 0 && workedSecs === 0 && !isRunningThis)
    ? windowSecs
    : task.dueDate
      ? Math.max(0, (new Date(task.dueDate).getTime() - Date.now()) / 1000)
      : (windowSecs > 0 ? Math.max(0, windowSecs - workedSecs) : null);
  const overSecs = task.dueDate
    ? Math.max(0, (Date.now() - new Date(task.dueDate).getTime()) / 1000)
    : (windowSecs > 0 && workedSecs > windowSecs ? workedSecs - windowSecs : 0);

  // Fixed from the moment the task starts — never recalculates on pause/resume
  const liveDeadlineStr = task.dueDate ? fmtDateTime(task.dueDate) : null;

  // ── Estimated due date (before first play) ──────────────────────────────
  // task.dueDate is intentionally null until the timer is first started —
  // the real calculation has to check whether a higher-priority task is
  // already running and anchor after it, which can't be known in advance.
  // This is a separate, lower-stakes estimate: "if you started right now,
  // roughly when would this be due" — same office-hours math, no P1
  // chain-anchoring. Shown only so the field isn't blank; never written
  // anywhere, never used by handleTimerStart, never affects the real
  // dueDate computed at first play.
  const [officeSchedule, setOfficeSchedule] = useState(null);
  const [chainAnchorMs, setChainAnchorMs] = useState(undefined); // undefined = not loaded yet, null = no chain
  const _chainForTaskRef = useRef(null); // which taskId chainAnchorMs currently belongs to
  // Mirrors handleTimerStart's own _isFirstStart check exactly — a task can
  // be "in_progress" and still be pre-first-play (self-tasks land here),
  // not just "confirmed"/"deadline_approved". Missing that branch was why
  // the estimate went blank again for a task sitting in that exact state.
  const _neverStarted = !timerSession?.lastStartTime && (timerSession?.totalSeconds || 0) === 0;
  const _windowSecsForEstimate = Number(task.deadlineWindowSecs) || Number(task.senderTimerWindowSecs) || 0;
  const _needsEstimate = !task.dueDate && task.hasTimer !== false
    && _windowSecsForEstimate > 0
    && (
      ["confirmed", "deadline_approved"].includes(task.status) ||
      (task.status === "in_progress" && _neverStarted)
    );

  useEffect(() => {
    if (!_needsEstimate || officeSchedule) return;
    let cancelled = false;
    (async () => {
      try {
        const { getDoc, doc } = await import("firebase/firestore");
        const snap = await getDoc(doc(firebaseDb, "cowork_settings", "office"));
        if (!cancelled) setOfficeSchedule(snap.exists() ? (snap.data() || {}) : {});
      } catch (e) { if (!cancelled) setOfficeSchedule({}); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_needsEstimate, task.taskId]);

  // ── Priority-chain-aware estimate ────────────────────────────────────────
  // A lower-priority task's estimate should assume it runs AFTER any
  // higher-priority sibling task, same as what actually happens when you
  // press Play in priority order. Walks every non-terminal higher-priority
  // task for the same assignee: uses its real dueDate if it's already been
  // played, otherwise its OWN stable estimate (from ITS creation time, not
  // "now" — keeps this whole preview non-drifting the same way the single-
  // task estimate already is). Deliberately different from the real
  // confirm-chain logic in tasks/page.js, which anchors an unplayed
  // predecessor from "now" — that's correct there because it WRITES a
  // value at that instant; a preview that gets re-rendered repeatedly
  // shouldn't use a moving anchor.
  useEffect(() => {
    if (!_needsEstimate || !officeSchedule || _chainForTaskRef.current === task.taskId) return;
    _chainForTaskRef.current = task.taskId; // mark immediately — no other effect run for this task will re-enter
    setChainAnchorMs(undefined); // this task hasn't got a result yet — don't show a stale one from the last task
    let cancelled = false;
    (async () => {
      try {
        const { getDocs, collection, query, where } = await import("firebase/firestore");
        const assignee = (task.assigneeIds || [])[0] || task.assignedBy;
        const thisPriority = Number(task.priority) || 99;
        if (!assignee || thisPriority <= 1) { if (!cancelled) setChainAnchorMs(null); return; }
        const TERM = ["done", "cancelled", "tl_final_approved", "ceo_approved"];
        const snap = await getDocs(query(
          collection(firebaseDb, "cowork_tasks"),
          where("assigneeIds", "array-contains", assignee),
        ));
        const higher = snap.docs
          .map(d => ({ taskId: d.id, ...d.data() }))
          .filter(t => t.taskId !== task.taskId && Number(t.priority) < thisPriority && !TERM.includes(t.status))
          .sort((a, b) => Number(a.priority) - Number(b.priority));

        console.log(`[chain-estimate] ${task.taskId} (P${thisPriority}): found ${snap.docs.length} sibling task(s) for assignee ${assignee}, ${higher.length} qualify as higher-priority:`,
          higher.map(h => ({ taskId: h.taskId, priority: h.priority, status: h.status, dueDate: h.dueDate, deadlineWindowSecs: h.deadlineWindowSecs, senderTimerWindowSecs: h.senderTimerWindowSecs })));

        let anchor = null;
        for (const ht of higher) {
          if (ht.dueDate) {
            anchor = new Date(ht.dueDate).getTime();
            continue;
          }
          const htWindow = Number(ht.deadlineWindowSecs) || Number(ht.senderTimerWindowSecs) || 0;
          if (htWindow <= 0) continue;
          const htCreatedMs = ht.createdAt?.seconds ? ht.createdAt.seconds * 1000
            : ht.createdAt ? new Date(ht.createdAt).getTime() : Date.now();
          const base = anchor || htCreatedMs;
          anchor = new Date(addWorkingSecs(base, htWindow, officeSchedule.schedule || null)).getTime();
        }
        console.log(`[chain-estimate] ${task.taskId}: final chain anchor =`, anchor ? new Date(anchor).toString() : "null (no chain)");
        if (!cancelled) setChainAnchorMs(anchor);
      } catch (e) {
        console.error(`[chain-estimate] ${task.taskId}: FAILED —`, e.message, e);
        if (!cancelled) setChainAnchorMs(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_needsEstimate, officeSchedule, task.taskId]);

  const estimatedDueStr = (() => {
    if (!_needsEstimate || !officeSchedule || chainAnchorMs === undefined) return null;
    const createdAtMs = task.createdAt?.seconds
      ? task.createdAt.seconds * 1000
      : task.createdAt ? new Date(task.createdAt).getTime() : Date.now();
    try {
      // Anchored at createdAtMs (or the chain anchor, whichever is later) —
      // NOT "now". A preview should read the same whether you check it the
      // second the task was created or an hour later; only the real
      // first-play calculation should anchor to "now" (and it does, in
      // handleTimerStart — untouched by this).
      const anchorMs = chainAnchorMs ? Math.max(chainAnchorMs, createdAtMs) : createdAtMs;
      const iso = addWorkingSecs(
        anchorMs,
        _windowSecsForEstimate,
        officeSchedule.schedule || null,
      );
      return fmtDateTime(iso);
    } catch (e) { return null; }
  })();

  // Show date + time (previously only date)
  const createdAt = task.createdAt
    ? fmtDateTime(typeof task.createdAt === "object" && task.createdAt.seconds ? task.createdAt.seconds * 1000 : task.createdAt)
    : null;

  const compStatus = task.completionStatus;
  const compLabel = compStatus ? COMP_LABEL[compStatus] : null;
  const compColor = compStatus ? COMP_COLOR[compStatus] : null;
  const rejReason = compStatus === "tl_rejected" ? task.tlReview?.rejectionReason
    : compStatus === "ceo_rejected" ? task.ceoReview?.rejectionReason : null;

  // assignee names
  const assigneeList = (() => {
    const ids = task.assigneeIds || [];
    return ids.map(id => {
      const full = (typeof employeeMapFull?.get === "function" ? employeeMapFull.get(id) : null) || {};
      const name = full.name || (typeof employeeMap?.get === "function" ? employeeMap.get(id) : null) || task.assigneeNameMap?.[id] || id;
      const pic = full.profilePicUrl || full.photoURL || "";
      return { id, name, pic };
    });
  })();

  // ── tab bar ──────────────────────────────────────────────────────────────
  const tabs = [
    { key: "info", label: "Details" },
    ...(!task.isFolder ? [{ key: "reports", label: task.isThirdParty ? "Timeline" : task.isGoal ? "Goal Progress" : task.isRepeat ? "Submissions" : "Reports", count: (!task.isThirdParty && !task.isGoal && !task.isRepeat) ? (task.dailyReportCount || 0) : 0 }] : []),
  ];

  const curTab = activeDetailTab === "reports" ? "reports" : "info";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, fontFamily: F }}>
      <style>{`
        @keyframes db-spin { to { transform: rotate(360deg); } }
        .db-tab { background: none; border: none; cursor: pointer; padding: 8px 14px; font-size: 12px; font-weight: 500; color: #9CA3AF; border-bottom: 2px solid transparent; font-family: ${F}; transition: all 0.12s; white-space: nowrap; }
        .db-tab:hover { color: #374151; }
        .db-tab.active { color: ${BRAND}; border-bottom-color: ${BRAND}; font-weight: 700; }
        .db-abtn:hover { opacity: 0.85; }
        .db-scroll::-webkit-scrollbar { width: 3px; }
        .db-scroll::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 2px; }
      `}</style>



      {/* ── REPORTS / GOAL / TIMELINE / SUBMISSIONS TAB ── */}
      {curTab === "reports" && (
        <div className="db-scroll" style={{ flex: 1, overflowY: "auto", padding: task.isGoal ? "0" : "14px 16px" }}>
          {task.isThirdParty && <ThirdPartyTask task={task} employeeId={employeeId} isCEO={isCEO} isTL={isTL} isAssignee={isAssignee} />}
          {task.isGoal && <GoalTask task={task} employeeId={employeeId} isCEO={isCEO} isTL={isTL} isAssignee={isAssignee} currentEmployeeId={employeeId} currentEmployeeName={employeeId} />}
          {task.isRepeat && <RepeatSlots task={task} employeeId={employeeId} isCEO={isCEO} isTL={isTL} isAssignee={isAssignee} />}
          {!task.isThirdParty && !task.isGoal && (
            reportsLoading
              ? <div style={{ padding: 24, textAlign: "center", color: "#9CA3AF", fontSize: 12 }}>Loading…</div>
              : !dailyReports?.length
                ? <div style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 12 }}>No reports submitted yet.</div>
                : (() => {
                  const grouped = {};
                  [...(dailyReports || [])]
                    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
                    .forEach(r => {
                      if (!r) return;
                      const ts = r.createdAt?.seconds ? r.createdAt.seconds * 1000 : (r.createdAt ? new Date(r.createdAt).getTime() : Date.now());
                      const tsMs = isNaN(ts) ? Date.now() : ts;
                      const key = new Date(tsMs).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                      if (!grouped[key]) grouped[key] = [];
                      grouped[key].push(r);
                    });
                  return Object.entries(grouped).map(([dateKey, rpts]) => (
                    <ReportDateGroup key={dateKey} dateLabel={dateKey} reports={rpts || []} />
                  ));
                })()
          )}
        </div>
      )}

      {/* ── DETAILS / INFO TAB ── */}
      {curTab === "info" && (
        <div className="db-scroll" style={{ flex: 1, overflowY: "auto", padding: "2px 16px 20px" }}>

          {/* ── SECTION: TASK INFO ── */}
          <Section title="Task Information" />

          <InfoRow label="Task ID">
            <span style={{ fontFamily: "monospace", fontSize: 11, background: "#F1F5F9", padding: "1px 6px", borderRadius: 4, color: "#475569" }}>{task.taskId}</span>
          </InfoRow>

          <InfoRow label="Status">
            <StatusBadge status={status} />
          </InfoRow>

          {task.priority && !hasForwardedChild && (
            <InfoRow label="Priority">
              <PriBadge priority={task.priority} />
            </InfoRow>
          )}

          {createdAt && (
            <InfoRow label="Created on">
              {createdAt}
            </InfoRow>
          )}

          {task.assignedBy && (
            <InfoRow label="Assigned by">
              {task.assignedByName || task.assignedBy}
            </InfoRow>
          )}

          {Array.isArray(task.path) && task.path.length > 0 && (
            <InfoRow label="Parent Task">
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, fontSize: 12 }}>
                {task.path.map((p, i) => (
                  <span key={p.taskId} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ background: "#F1F5F9", color: "#334155", padding: "2px 8px", borderRadius: 5, fontWeight: 500 }}>
                      {p.title || p.taskId}
                    </span>
                    {i < task.path.length - 1 && <span style={{ color: "#9CA3AF" }}>›</span>}
                  </span>
                ))}
              </div>
            </InfoRow>
          )}

          {assigneeList.length > 0 && (
            <InfoRow label="People">
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {assigneeList.map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <GwAvatar name={a.name} size={20} url={a.pic} />
                    <span style={{ fontSize: 12, color: "#1F2937" }}>{a.name}</span>
                  </div>
                ))}
              </div>
            </InfoRow>
          )}

          {task.description && (
            <InfoRow label="Description">
              <span style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{task.description}</span>
            </InfoRow>
          )}


          {task.notes && (
            <InfoRow label="Notes">
              <span style={{ whiteSpace: "pre-wrap", lineHeight: 1.55, color: "#374151" }}>{task.notes}</span>
            </InfoRow>
          )}

          {task.requirements?.length > 0 && (
            <InfoRow label="Requirements">
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {task.requirements.map((req, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                    <span style={{ marginTop: 3, width: 5, height: 5, borderRadius: "50%", background: "#475569", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#1F2937", lineHeight: 1.55 }}>{req}</span>
                  </div>
                ))}
              </div>
            </InfoRow>
          )}

          {/* ── SECTION: TIMELINE ── */}
          {(task.dueDate || task.fixedDeadline || task.deadlineWindowSecs || task.senderTimerWindowSecs) && !hasForwardedChild && (
            <>
              <Section title="Timeline" />

              {/* Fixed deadline (non-timer tasks) */}
              {!task.hasTimer && task.fixedDeadline && (
                <InfoRow label="Deadline">
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>

                    {/* If extended — show original with strikethrough */}
                    {(task.deadlineAutoExtendedHistory || []).length > 0 && (() => {
                      const first = task.deadlineAutoExtendedHistory[0];
                      return (
                        <span style={{ fontSize: 12, color: "#9CA3AF", textDecoration: "line-through" }}>
                          {fmtDateTime(first.oldDeadline)}
                        </span>
                      );
                    })()}

                    {/* Current (new) deadline */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{fmtDateTime(task.fixedDeadline)}</span>
                      {(() => {
                        const dl = Math.ceil((new Date(task.fixedDeadline) - Date.now()) / 86400000);
                        const color = dl < 0 ? "#DC2626" : dl <= 1 ? "#D97706" : "#16A34A";
                        const txt = dl < 0 ? `${Math.abs(dl)}d overdue` : dl === 0 ? "Due today" : `${dl}d remaining`;
                        return <span style={{ fontSize: 10, fontWeight: 600, color }}>{txt}</span>;
                      })()}
                    </div>

                    {/* Extension reasons */}
                    {(task.deadlineAutoExtendedHistory || []).map((h, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "4px 8px", borderRadius: 5,
                        background: "#FFF7ED", border: "1px solid #FED7AA",
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#C2410C", flexShrink: 0 }}>+{h.extendedByHrs >= 1 ? `${Math.round(h.extendedByHrs * 10) / 10}h` : `${Math.round(h.extendedByHrs * 60)}m`}</span>
                        <span style={{ fontSize: 11, color: "#92400E" }}>
                          P1 task <strong>"{h.shiftedByTaskTitle}"</strong> assigned
                          {h.at && <> · {new Date(h.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}</>}
                        </span>
                      </div>
                    ))}

                  </div>
                </InfoRow>
              )}


              {/* Timer-based deadline */}
              {task.hasTimer && windowSecs > 0 && (
                <>
                  <InfoRow label="Time Requested">
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span>{fmtSecs(windowSecs)}</span>
                      <DeadlineBreakdown task={task} compact />
                    </div>
                  </InfoRow>

                  {workedSecs > 0 && (
                    <InfoRow label="Time Tracked">
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 600, color: isTimerExceeded ? "#DC2626" : "#1F2937" }}>{fmtSecs(workedSecs)}</span>
                          {windowSecs > 0 && (
                            <span style={{ fontSize: 10, color: "#9CA3AF" }}>of {fmtSecs(windowSecs)}</span>
                          )}
                          {isRunningThis && <span style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", background: "#F0FDF4", padding: "1px 6px", borderRadius: 4, border: "1px solid #BBF7D0" }}>Live</span>}
                        </div>
                        {/* Progress bar */}
                        {windowSecs > 0 && (
                          <div style={{ height: 4, background: "#F1F5F9", borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 99, width: `${Math.min(100, (workedSecs / windowSecs) * 100)}%`, background: isTimerExceeded ? "#DC2626" : "#16A34A", transition: "width 1s linear" }} />
                          </div>
                        )}
                        {overSecs > 0 && (
                          <span style={{ fontSize: 10, color: "#DC2626", fontWeight: 600 }}>+{fmtSecs(overSecs)} over deadline</span>
                        )}
                        {remainingSecs !== null && !isTimerExceeded && (
                          <span style={{ fontSize: 10, color: remainingSecs < 600 ? "#D97706" : "#16A34A", fontWeight: 600 }}>{fmtSecs(remainingSecs)} remaining</span>
                        )}
                      </div>
                    </InfoRow>
                  )}

                  {liveDeadlineStr && (
                    <InfoRow label="Due at">
                      <span style={{ fontWeight: 600, color: isTimerExceeded ? "#DC2626" : "#1F2937" }}>{liveDeadlineStr}</span>
                      {isTimerExceeded && (
                        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#DC2626", background: "#FEE2E2", padding: "1px 6px", borderRadius: 4 }}>Passed</span>
                      )}
                    </InfoRow>
                  )}

                  {!liveDeadlineStr && estimatedDueStr && (
                    <InfoRow label="Est. Due at">
                      <span style={{ fontWeight: 600, color: "#6B7280" }}>{estimatedDueStr}</span>
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#9CA3AF", background: "#F3F4F6", padding: "1px 6px", borderRadius: 4 }} title="Not final — the real deadline is set the moment you press Play, and may shift if a higher-priority task is running first.">
                        estimate
                      </span>
                    </InfoRow>
                  )}

                  {/* ── Work Timeline: sessions, usage summary, extension history ── */}
                  <div style={{ padding: "8px 0" }}>
                    <WorkLogsSection task={task} />
                  </div>
                </>
              )}

              {/* Calendar deadline (non-timer) */}
              {task.dueDate && !task.hasTimer && !task.fixedDeadline && (
                <InfoRow label="Due Date">
                  {fmtDate(task.dueDate)}
                </InfoRow>
              )}

              {/* ── Extension request status — shown to ALL roles ── */}
              {task.deadlineExtRequest && (() => {
                const ext = task.deadlineExtRequest;
                const sMap = {
                  pending: { color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", icon: "⏳", label: "Pending approval" },
                  approved: { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0", icon: "✅", label: "Approved" },
                  rejected: { color: "#DC2626", bg: "#FEF2F2", border: "#FECDD3", icon: "✕", label: "Rejected" },
                  countered: { color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE", icon: "↩", label: "Counter proposed" },
                };
                const s = sMap[ext.status] || sMap.pending;
                return (
                  <InfoRow label="Extension">
                    <div style={{ padding: "7px 10px", background: s.bg, border: `1px solid ${s.border}`, borderRadius: 6, fontSize: 11, lineHeight: 1.5 }}>
                      <div style={{ fontWeight: 700, color: s.color, marginBottom: 3 }}>{s.icon} {s.label}</div>
                      {ext.requestedByName && <div style={{ color: "#374151" }}>By: <strong>{ext.requestedByName}</strong></div>}
                      {ext.proposedDate && <div style={{ color: "#374151" }}>Proposed: <strong>{fmtDateTime(ext.proposedDate)}</strong></div>}
                      {ext.reason && <div style={{ color: "#6B7280", marginTop: 2 }}>Reason: {ext.reason}</div>}
                      {ext.status === "approved" && (task.fixedDeadline || task.dueDate) && <div style={{ color: "#16A34A", marginTop: 2, fontWeight: 600 }}>New deadline: {fmtDateTime(task.fixedDeadline || task.dueDate)}</div>}
                      {ext.status === "rejected" && ext.rejectionReason && <div style={{ color: "#991B1B", marginTop: 2 }}>Rejected: {ext.rejectionReason}</div>}
                    </div>
                  </InfoRow>
                );
              })()}
            </>
          )}

          {/* ── SECTION: COMPLETION STATUS ── */}
          {compLabel && (
            <>
              <Section title="Review Status" />
              <div style={{ padding: "10px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", background: `${compColor}11`, border: `1px solid ${compColor}33`, borderRadius: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: compColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: compColor }}>{compLabel}</span>
                </div>
                {rejReason && (
                  <div style={{ marginTop: 6, padding: "8px 10px", background: "#FEF2F2", border: "1px solid #FECDD3", borderRadius: 6, fontSize: 11, color: "#991B1B", lineHeight: 1.5 }}>
                    <strong>Reason:</strong> {rejReason}
                  </div>
                )}
                {task.completionSubmission?.message && (
                  <div style={{ marginTop: 6, padding: "8px 10px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 11, color: "#374151", lineHeight: 1.5 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", marginBottom: 4 }}>Submission note</div>
                    {task.completionSubmission.message}
                  </div>
                )}
              </div>
            </>
          )}


          {/* ── SECTION: TIMER CONTROL (assignee, in progress) ── */}
          {isAssignee && isConfirmed && isStarted && !task.isFolder && task.hasTimer && !task.isRepeat && !task.isThirdParty && !task.isGoal &&
            !hasForwardedChild && (
              <>
                <Section title="Timer" />
                <div style={{ padding: "10px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Live time display */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: isRunningThis ? "#F0FDF4" : "#F8FAFC", border: `1px solid ${isRunningThis ? "#BBF7D0" : "#E5E7EB"}`, borderRadius: 6 }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", marginBottom: 3 }}>Time Worked</div>
                      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace", color: isRunningThis ? "#16A34A" : "#1F2937", letterSpacing: "0.04em" }}>
                        {formatTimeHMS ? formatTimeHMS(workedSecs) : fmtSecs(workedSecs)}
                      </div>
                    </div>
                    <button
                      disabled={isTimerExceeded}
                      onClick={() => isRunningThis ? handleTimerPause?.(task.taskId, task.title) : handleTimerStart?.(task.taskId, task.title)}
                      style={{
                        padding: "7px 14px", borderRadius: 6, border: "none", cursor: isTimerExceeded ? "not-allowed" : "pointer",
                        fontFamily: F, fontSize: 11, fontWeight: 600, transition: "all 0.15s",
                        opacity: isTimerExceeded ? 0.4 : 1,
                        background: isRunningThis ? "#DCFCE7" : "#EBF2FA",
                        color: isRunningThis ? "#16A34A" : BRAND,
                      }}>
                      {isRunningThis ? "⏸ Pause" : "▶ Resume"}
                    </button>
                  </div>
                  {isTimerExceeded && !task.deadlineExtRequest && (
                    <div style={{ padding: "8px 10px", background: "#FEF2F2", border: "1px solid #FECDD3", borderRadius: 6, fontSize: 11, color: "#991B1B", lineHeight: 1.5 }}>
                      Deadline exceeded. Request an extension to continue working.
                    </div>
                  )}
                  {timerBlocked && !isRunningThis && !isTimerExceeded && (
                    <div style={{ padding: "8px 10px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 11, color: "#1D4ED8" }}>
                      Another task is currently running — pressing Resume will pause it and start this one.
                    </div>
                  )}
                </div>
              </>
            )}

          {/* ── SECTION: WORKFLOW ACTIONS ── */}
          {!task.isFolder && (
            <>
              <Section title="Actions" />
              <div style={{ padding: "10px 0", display: "flex", flexDirection: "column", gap: 6 }}>

                {/* ── DEADLINE ALERT BANNER (top of actions) ── */}
                {isFixedDeadlinePassed && (
                  <div style={{ padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FECDD3", borderRadius: 6, fontSize: 11, color: "#991B1B", lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>⚠️ Deadline Passed</div>
                    <div>Original deadline: <strong>{fmtDateTime(task.fixedDeadline)}</strong></div>
                    {task.deadlineExtRequest?.status === "pending" && (
                      <>
                        <div style={{ marginTop: 4, color: "#D97706", fontWeight: 600 }}>Extension request pending approval.</div>
                        {task.deadlineExtRequest?.proposedDate && (
                          <div style={{ marginTop: 2, color: "#92400E" }}>Requested new deadline: <strong>{fmtDateTime(task.deadlineExtRequest.proposedDate)}</strong></div>
                        )}
                      </>
                    )}
                    {task.deadlineExtRequest?.status === "approved" && (
                      <div style={{ marginTop: 4, color: "#16A34A", fontWeight: 600 }}>Extension approved — new deadline: <strong>{fmtDateTime(task.fixedDeadline || task.dueDate)}</strong></div>
                    )}
                  </div>
                )}

                {/* ── UPCOMING DEADLINE NOTICE (when not passed but due soon) ── */}
                {!isFixedDeadlinePassed && task.fixedDeadline && ["in_progress", "confirmed"].includes(status) && (() => {
                  const msLeft = new Date(task.fixedDeadline) - new Date();
                  const hoursLeft = msLeft / 3600000;
                  if (hoursLeft > 24) return null;
                  const color = hoursLeft <= 2 ? "#DC2626" : hoursLeft <= 8 ? "#D97706" : "#2563EB";
                  const bg = hoursLeft <= 2 ? "#FEF2F2" : hoursLeft <= 8 ? "#FFFBEB" : "#EFF6FF";
                  const border = hoursLeft <= 2 ? "#FECDD3" : hoursLeft <= 8 ? "#FDE68A" : "#BFDBFE";
                  const label = hoursLeft <= 0 ? "Deadline passed!" : hoursLeft < 1 ? `${Math.round(msLeft / 60000)} min remaining` : `${hoursLeft.toFixed(1)}h remaining`;
                  return (
                    <div style={{ padding: "10px 12px", background: bg, border: `1px solid ${border}`, borderRadius: 6, fontSize: 11, color, lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>🔔 Deadline Soon</div>
                      <div>Due: <strong>{fmtDateTime(task.fixedDeadline)}</strong></div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>{label}</div>
                    </div>
                  );
                })()}

                {/* ── EMPLOYEE: pre-confirm deadline flow ── */}
                {isAssignee && !isConfirmed && !task.isGoal && !task.isThirdParty && !task.isRepeat && (
                  <>
                    {/* Timer task: propose deadline */}
                    {task.hasTimer === true && status === "open" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.5 }}>
                          Propose how long you need to complete this task. Your TL will approve before you start.
                        </div>
                        {task.deadlineProposalRejected && (
                          <div style={{ padding: "7px 10px", background: "#FEF2F2", border: "1px solid #FECDD3", borderRadius: 6, fontSize: 11, color: "#991B1B", lineHeight: 1.4 }}>
                            Previous proposal was rejected: {task.deadlineRejectionReason || "Please propose a new deadline."}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="number" min="1" max="999" placeholder="Duration"
                            value={df.proposedDurationVal || ""}
                            onChange={e => df.setDurationVal?.(e.target.value)}
                            style={{ flex: 1, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                          <select value={df.proposedDurationUnit || "hours"}
                            onChange={e => df.setDurationUnit?.(e.target.value)}
                            style={{ width: 72, padding: "7px 6px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, background: "#fff", outline: "none", cursor: "pointer" }}>
                            <option value="minutes">min</option>
                            <option value="hours">hrs</option>
                            <option value="days">days</option>
                          </select>
                        </div>
                        <ActionBtn onClick={df.onPropose} busy={df.proposing} disabled={!df.proposedDurationVal}>
                          Submit Deadline for Approval
                        </ActionBtn>
                      </div>
                    )}

                    {/* Awaiting TL approval */}
                    {status === "pending_deadline_approval" && (
                      <div style={{ padding: "10px 12px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, fontSize: 11, color: "#92400E", lineHeight: 1.5 }}>
                        Your deadline proposal is awaiting approval from your TL. Use the Draft Chat to discuss in the meantime.
                        {task.proposedDeadline && <div style={{ marginTop: 4, fontWeight: 600 }}>Proposed: {fmtSecs(Number(task.proposedDurationSecs) || 0)}</div>}
                      </div>
                    )}

                    {/* TL counter-proposal: employee responds */}
                    {status === "pending_employee_deadline_confirmation" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ padding: "10px 12px", background: "#EBF2FA", border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 11, color: "#1E40AF", lineHeight: 1.5 }}>
                          Your TL suggested a different deadline:
                          {task.counterProposalSecs && <span style={{ fontWeight: 700, marginLeft: 4 }}>{fmtSecs(Number(task.counterProposalSecs))}</span>}
                          {task.counterProposalMessage && <div style={{ marginTop: 3, color: "#374151" }}>{task.counterProposalMessage}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <ActionBtn variant="primary" onClick={() => df.handleRespondToCounter?.("accept")} busy={df.respondBusy}>
                            Accept TL's Suggestion
                          </ActionBtn>
                          <ActionBtn variant="ghost" onClick={() => df.setShowEmpCounterForm?.(v => !v)}>
                            Counter
                          </ActionBtn>
                        </div>
                        {df.showEmpCounterForm && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6 }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <input type="number" min="1" placeholder="Duration"
                                value={df.empCounterDurationVal || ""} onChange={e => df.setEmpCounterDurationVal?.(e.target.value)}
                                style={{ flex: 1, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                              <select value={df.empCounterDurationUnit || "hours"} onChange={e => df.setEmpCounterDurationUnit?.(e.target.value)}
                                style={{ width: 72, padding: "7px 6px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, background: "#fff", outline: "none", cursor: "pointer" }}>
                                <option value="minutes">min</option>
                                <option value="hours">hrs</option>
                                <option value="days">days</option>
                              </select>
                            </div>
                            <input placeholder="Message (optional)" value={df.empCounterMsg || ""}
                              onChange={e => df.setEmpCounterMsg?.(e.target.value)}
                              style={{ padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                            <ActionBtn onClick={() => df.handleRespondToCounter?.("counter")} busy={df.respondBusy} disabled={!df.empCounterDurationVal}>
                              Send Counter Proposal
                            </ActionBtn>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Deadline approved → Confirm task */}
                    {(status === "deadline_approved" || (!task.hasTimer && status === "open" && task.dueDate)) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {task.dueDate && liveDeadlineStr && (
                          <div style={{ fontSize: 11, color: "#374151" }}>
                            Deadline approved: <strong>{liveDeadlineStr}</strong>
                          </div>
                        )}
                        <ActionBtn onClick={() => handleAction("confirm")} busy={actionBusy}>
                          Confirm &amp; Accept Task
                        </ActionBtn>
                      </div>
                    )}

                    {/* Fixed deadline task confirm — only show if deadline NOT yet approved */}
                    {!task.hasTimer && !task.dueDate && task.fixedDeadline && !task.deadlineApprovedBy && status !== "deadline_approved" && (
                      <ActionBtn onClick={() => handleAction("confirm")} busy={actionBusy}>
                        Confirm &amp; Accept Task
                      </ActionBtn>
                    )}

                    {/* Goal task confirm */}
                    {task.isGoal && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.5 }}>
                          Review the goal targets in the Goal Progress tab. Once confirmed, chat unlocks and you can start logging progress.
                        </div>
                        <ActionBtn onClick={() => handleAction("confirm")} busy={actionBusy}>
                          Confirm &amp; Accept Goal
                        </ActionBtn>
                      </div>
                    )}

                    {/* Third-party task confirm */}
                    {task.isThirdParty && (
                      <ActionBtn onClick={() => handleAction("confirm")} busy={actionBusy}>
                        Confirm &amp; Accept Task
                      </ActionBtn>
                    )}

                    {/* Self-assigned: waiting for approver */}
                    {task.isSelfAssigned && task.selfAssignApproved !== true && status === "open" && (
                      <div style={{ padding: "10px 12px", background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 6, fontSize: 11, color: "#5B21B6", lineHeight: 1.5 }}>
                        Waiting for <strong>{task.approverName || "your approver"}</strong> to approve this self-assigned task.
                      </div>
                    )}
                  </>
                )}

                {/* ── EMPLOYEE: confirmed, not started → Start Working (timer tasks only) ── */}
                {isAssignee && isConfirmed && !isStarted && status === "confirmed" && task.hasTimer !== false && (
                  <ActionBtn onClick={() => handleAction("start")} busy={actionBusy}>
                    Start Working
                  </ActionBtn>
                )}

                {/* ── EMPLOYEE: waiting for new deadline (extension pending) ── */}
                {isAssignee && status === "pending_deadline_approval" && isConfirmed && (
                  <div style={{ padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, fontSize: 11, color: "#92400E" }}>
                    Work paused — waiting for deadline extension approval.
                  </div>
                )}

                {/* ── EMPLOYEE: in progress actions ── */}
                {/* {isAssignee && status === "in_progress" && !task.isRepeat && !task.isThirdParty && !task.isGoal && (
                  <>
                    <ActionBtn variant="outline" onClick={() => handleAction("report")}>
                      Submit Daily Report
                    </ActionBtn>
                  </>
                )} */}

                {/* ── EMPLOYEE: submit for review ── */}
                {isAssignee && isStarted && !task.isGoal && !task.isThirdParty && !task.isRepeat && !compStatus && (
                  <ActionBtn onClick={() => handleAction("submit_completion")} busy={actionBusy}>
                    Submit for Review
                  </ActionBtn>
                )}
                {isAssignee && (compStatus === "tl_rejected" || compStatus === "ceo_rejected") && (
                  <ActionBtn onClick={() => handleAction("submit_completion")} busy={actionBusy}>
                    Re-submit for Review
                  </ActionBtn>
                )}
                {/* ── Extension zone calculation (clock-time proxy for display) ── */}
                {(() => {
                  const _createdMs = task.createdAtISO
                    ? new Date(task.createdAtISO).getTime()
                    : task.createdAt?.seconds
                      ? task.createdAt.seconds * 1000
                      : null;
                  const _timerWindowSecs = Number(task.deadlineWindowSecs)
                    || Number(task.senderTimerWindowSecs)
                    || (Number(task.etcHours) * 3600)
                    || 0;
                  const _window = (task.hasTimer === false && task.fixedDeadline && _createdMs)
                    ? (new Date(task.fixedDeadline).getTime() - _createdMs)
                    : _timerWindowSecs > 0
                      ? _timerWindowSecs * 1000
                      : (task.etcHours || 0) * 3600000;
                  const _workedMs = (workedSecs || 0) * 1000;
                  const _elapsed = _timerWindowSecs > 0
                    ? Math.min((_workedMs / (_timerWindowSecs * 1000)) * 100, 100)
                    : (_window > 0 && _createdMs)
                      ? Math.min(((Date.now() - _createdMs) / _window) * 100, 100)
                      : 0;
                  window.__extElapsedPct = _elapsed;
                  // Also write to a data attribute on the DOM for reliability
                  if (typeof document !== "undefined") {
                    document.documentElement.setAttribute("data-ext-elapsed", String(_elapsed));
                  }
                })()}

                {/* ── EXTENSION REQUEST ── */}
                {isAssignee & !task.isFolder && !["open", "done", "cancelled"].includes(status) && !["tl_final_approved", "ceo_approved", "submitted", "tl_approved"].includes(compStatus) && task.deadlineExtRequest?.status !== "pending" && (
                  <>
                    {!ef.showExtReqForm ? (() => {
                      const _pct = window.__extElapsedPct
                        || parseFloat(document.documentElement.getAttribute("data-ext-elapsed") || "0")
                        || 0;
                      // If deadline already passed → always zone 3 regardless of elapsed %
                      const _deadlinePassed = task.dueDate && new Date(task.dueDate) < new Date();
                      // If extension was approved and deadline is in future — never show penalty zone
                      const _extApproved = task.deadlineExtRequest?.status === "approved" && !_deadlinePassed;
                      const _zone = _deadlinePassed ? 3 : _extApproved ? 2 : _pct < 70 ? 2 : 3;

                      // Seed the request form with today's date + current time
                      // instead of leaving date blank / time hardcoded to 23:59
                      const _openExtForm = () => {
                        const now = new Date();
                        if (!ef.extReqDate) ef.setExtReqDate?.(now.toISOString().split("T")[0]);
                        if (!ef.extReqTime || ef.extReqTime === "23:59") {
                          ef.setExtReqTime?.(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
                        }
                        ef.setShowExtReqForm?.(true);
                      };
                      if (_zone === 1) return (
                        <div title="Extension available after 50% of task time has elapsed">
                          <ActionBtn variant="outline" disabled>
                            Request Extension — Not Available Yet
                          </ActionBtn>
                          <div style={{
                            fontSize: 10, color: "#9CA3AF", marginTop: 4,
                            textAlign: "center"
                          }}>
                            Available after 50% of task time · {_pct.toFixed(0)}% elapsed
                          </div>
                        </div>
                      );

                      if (_zone === 2) return (
                        <div>
                          <ActionBtn variant="outline"
                            onClick={_openExtForm}>
                            Request Deadline Extension
                          </ActionBtn>
                          <div style={{
                            fontSize: 10, color: "#16A34A",
                            fontWeight: 600, marginTop: 4,
                            padding: "4px 8px", background: "#F0FDF4",
                            borderRadius: 4, border: "1px solid #BBF7D0",
                            textAlign: "center"
                          }}>
                            ✓ No deduction if you request now · {_pct.toFixed(0)}% elapsed (cuts apply after 70%)
                          </div>
                        </div>
                      );

                      // Zone 3 — penalty warning
                      return (
                        <div>
                          <button
                            onClick={_openExtForm}
                            style={{
                              width: "100%", padding: "9px 14px",
                              background: "#FFFBEB",
                              border: "1px solid #F59E0B",
                              borderRadius: 6, fontSize: 12, fontWeight: 600,
                              color: "#92400E", cursor: "pointer",
                              fontFamily: "inherit"
                            }}>
                            ⚠ Request Deadline Extension
                          </button>
                          <div style={{
                            fontSize: 10, color: "#D97706",
                            fontWeight: 600, marginTop: 4,
                            padding: "4px 8px", background: "#FFFBEB",
                            borderRadius: 4, border: "1px solid #FDE68A"
                          }}>
                            ⚠ Filing now will deduct −0.2 pts from your C1 score
                          </div>
                        </div>
                      );
                    })() : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>Request Extension</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="date" value={ef.extReqDate || ""} onChange={e => ef.setExtReqDate?.(e.target.value)} min={new Date().toISOString().split("T")[0]}
                            style={{ flex: 1, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                          <input type="time" value={ef.extReqTime || "23:59"} onChange={e => ef.setExtReqTime?.(e.target.value)}
                            style={{ width: 90, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                        </div>
                        <textarea placeholder="Reason for extension"
                          value={ef.extReqReason || ""} onChange={e => ef.setExtReqReason?.(e.target.value)} rows={2}
                          style={{ padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none", resize: "vertical" }} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <ActionBtn variant="ghost" onClick={() => ef.setShowExtReqForm?.(false)}>Cancel</ActionBtn>
                          <ActionBtn onClick={ef.handleRequestExtension} busy={ef.extReqBusy} disabled={!ef.extReqDate}>
                            Send Request
                          </ActionBtn>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── TL: deadline proposal actions ── */}
                {isTL && !isCEO && status === "pending_deadline_approval" && !task.isFolder && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, color: "#374151" }}>
                      Employee's deadline proposal:
                      {task.proposedDurationSecs && <strong style={{ marginLeft: 4 }}>{fmtSecs(Number(task.proposedDurationSecs))}</strong>}
                    </div>
                    {!df.showCounterForm ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <ActionBtn variant="primary" onClick={df.onApprove} busy={df.approving}>
                          Approve
                        </ActionBtn>
                        <ActionBtn variant="ghost" onClick={() => df.setShowCounterForm?.(true)}>
                          Suggest Different
                        </ActionBtn>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>Suggest a different duration</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="number" min="1" placeholder="Duration"
                            value={df.counterDurationVal || ""} onChange={e => df.setCounterDurationVal?.(e.target.value)}
                            style={{ flex: 1, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                          <select value={df.counterDurationUnit || "hours"} onChange={e => df.setCounterDurationUnit?.(e.target.value)}
                            style={{ width: 72, padding: "7px 6px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, background: "#fff", outline: "none", cursor: "pointer" }}>
                            <option value="minutes">min</option>
                            <option value="hours">hrs</option>
                            <option value="days">days</option>
                          </select>
                        </div>
                        <input placeholder="Message to employee (optional)" value={df.counterMessage || ""}
                          onChange={e => df.setCounterMessage?.(e.target.value)}
                          style={{ padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <ActionBtn variant="ghost" onClick={() => df.setShowCounterForm?.(false)}>Cancel</ActionBtn>
                          <ActionBtn onClick={df.handleTlCounterPropose} busy={df.counterBusy} disabled={!df.counterDurationVal}>
                            Send Suggestion
                          </ActionBtn>
                        </div>
                      </div>
                    )}

                    {/* TL: reject deadline */}
                    {!df.showRejectInput ? (
                      <ActionBtn variant="ghost" danger onClick={() => df.setShowRejectInput?.(true)}>
                        Reject Proposal
                      </ActionBtn>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <textarea placeholder="Reason for rejection" value={df.rejectReason || ""}
                          onChange={e => df.setRejectReason?.(e.target.value)} rows={2}
                          style={{ padding: "7px 10px", border: "1px solid #FECDD3", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none", resize: "vertical" }} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <ActionBtn variant="ghost" onClick={() => df.setShowRejectInput?.(false)}>Cancel</ActionBtn>
                          <ActionBtn danger onClick={() => df.setShowRejectInput?.(false)} disabled={!df.rejectReason?.trim()}>
                            Confirm Rejection
                          </ActionBtn>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── TL/CEO: extension request review ── */}
                {(isTL || isCEO) && !isAssignee && (task.pendingExtension || task.deadlineExtRequest?.status === "pending") && !task.isFolder && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* Info box — buttons live inside */}
                    <div style={{ padding: "10px 12px", background: "#EBF2FA", border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 11, color: "#1E40AF", lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>⏰ Deadline Extension Request</div>
                      <div>From: <strong>{task.deadlineExtRequest?.requestedByName || "Employee"}</strong></div>
                      {task.deadlineExtRequest?.proposedDate && (
                        <div>Proposed: <strong>{new Date(task.deadlineExtRequest.proposedDate).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</strong></div>
                      )}
                      {(task.deadlineExtRequest?.reason || task.extensionReason) && (
                        <div style={{ color: "#374151", marginTop: 2 }}>Reason: {task.deadlineExtRequest?.reason || task.extensionReason}</div>
                      )}

                      {/* Approve + Reject + Suggest — inside the box */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid #BFDBFE" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            disabled={ef.reviewExtBusy}
                            onClick={() => ef.handleReviewExtension?.("reject", "")}
                            style={{ padding: "4px 12px", borderRadius: 5, border: "1px solid #FECDD3", background: "#FEF2F2", color: "#DC2626", fontSize: 11, fontWeight: 600, cursor: ef.reviewExtBusy ? "not-allowed" : "pointer", fontFamily: F, opacity: ef.reviewExtBusy ? 0.6 : 1 }}
                          >
                            Reject
                          </button>
                          <button
                            disabled={ef.reviewExtBusy}
                            onClick={() => {
                              if (task.deadlineExtRequest?.isPenaltyWaived) {
                                // Early request (48+ hrs before deadline) → no deduction panel
                                ef.handleReviewExtension?.("approve", "");
                              } else {
                                // Late request → show deduction decision panel
                                if (ef.onExtensionApproveClick) {
                                  ef.onExtensionApproveClick();
                                } else {
                                  ef.handleReviewExtension?.("approve", "");
                                }
                              }
                            }}
                            style={{ padding: "4px 12px", borderRadius: 5, border: "none", background: BRAND, color: "#fff", fontSize: 11, fontWeight: 600, cursor: ef.reviewExtBusy ? "not-allowed" : "pointer", fontFamily: F, opacity: ef.reviewExtBusy ? 0.6 : 1 }}
                          >
                            {ef.reviewExtBusy ? "Processing…" : "Approve"}
                          </button>
                        </div>
                        {!ef.reviewExtDate && (
                          <button
                            onClick={() => ef.setReviewExtDate?.(new Date().toISOString().split("T")[0])}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: BRAND, fontFamily: F, fontWeight: 600, textDecoration: "underline", padding: 0 }}
                          >
                            Suggest Another Deadline
                          </button>
                        )}
                      </div>

                    </div>

                    {/* Date/time inputs — only when suggest is clicked */}
                    {ef.reviewExtDate && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>Suggest a new deadline:</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="date" value={ef.reviewExtDate || ""} onChange={e => ef.setReviewExtDate?.(e.target.value)} min={new Date().toISOString().split("T")[0]}
                            style={{ flex: 1, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                          <input type="time" value={ef.reviewExtTime || "23:59"} onChange={e => ef.setReviewExtTime?.(e.target.value)}
                            style={{ width: 90, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: F, outline: "none" }} />
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <ActionBtn variant="ghost" onClick={() => ef.setReviewExtDate?.("")}>Cancel</ActionBtn>
                          <ActionBtn variant="outline" onClick={() => ef.handleReviewExtension?.("counter", ef.reviewExtDate + "T" + (ef.reviewExtTime || "23:59"))} busy={ef.reviewExtBusy} disabled={!ef.reviewExtDate}>
                            Send Suggestion
                          </ActionBtn>
                        </div>
                      </div>
                    )}
                  </div>
                )}



                {/* ── TL: review completion ── */}
                {isTL && !isCEO && compStatus === "submitted" && task.reviewFlow !== "ceo_direct" && (
                  <ActionBtn onClick={() => handleAction("review_completion")} busy={actionBusy}>
                    Review Submission
                  </ActionBtn>
                )}

                {/* ── CEO: review completion ── */}
                {isCEO && (compStatus === "tl_approved" || (compStatus === "submitted" && task.reviewFlow === "ceo_direct")) && (
                  <ActionBtn onClick={() => handleAction("ceo_review")} busy={actionBusy}>
                    Review &amp; Approve
                  </ActionBtn>
                )}

                {/* ── CEO: edit deadline ── */}
                {isCEO && !task.isFolder && (
                  <ActionBtn variant="ghost" onClick={() => handleAction("deadline")}>
                    Edit Deadline
                  </ActionBtn>
                )}

                {/* ── TL/CEO: forward task ── */}
                {(isTL || isCEO) && !task.isFolder && (
                  <ActionBtn variant="ghost" onClick={() => handleAction("forward")}>
                    Forward / Split Task
                  </ActionBtn>
                )}

                {/* ── CEO: delete ── */}
                {isCEO && !task.isFolder && (
                  <ActionBtn variant="ghost" danger onClick={() => handleAction("delete")}>
                    Delete Task
                  </ActionBtn>
                )}

                {/* ── Nothing to show ── */}
                {!isAssignee && !isTL && !isCEO && (
                  <div style={{ fontSize: 11, color: "#9CA3AF", padding: "8px 0" }}>No actions available for your role.</div>
                )}

              </div>
            </>
          )}

        </div>
      )}
    </div>
  );
}

// changed in the page.js