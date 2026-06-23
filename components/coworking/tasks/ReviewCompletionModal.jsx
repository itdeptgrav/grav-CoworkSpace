/**
 * components/coworking/tasks/ReviewCompletionModal.jsx
 * RIGHT SLIDER — TL/CEO reviews employee submission.
 * 
 * Buttons: Approve / Rework / Reject
 * Before each action: shows C1 score impact confirmation popup.
 */
"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { reviewCompletion, ceoReviewCompletion } from "../../../lib/mediaUploadApi";
import { getC1Config } from "../../../lib/coworkApi";

const F = { fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif" };
const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function SliderPortal({ children }) {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  if (!m) return null;
  return createPortal(children, document.body);
}

// ── C1 Score Preview — fetches impact from backend ───────────────────────────
async function fetchC1Preview(taskId, isRejected, submittedAt, dueDate) {
  try {
    const { firebaseAuth } = await import("../../../lib/coworkFirebase");
    const token = await firebaseAuth.currentUser?.getIdToken();
    // If no submittedAt, use NOW — if TL is approving after deadline, system detects it
    const effectiveSubmittedAt = submittedAt || new Date().toISOString();
    const res = await fetch(`${BASE}/cowork/c1/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ taskId, isRejected, submittedAt: effectiveSubmittedAt, dueDate }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Rework API call ───────────────────────────────────────────────────────────
async function callRework(taskId, reworkReason, waiveDeduction = false) {
  const { firebaseAuth } = await import("../../../lib/coworkFirebase");
  const token = await firebaseAuth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}/cowork/task/${taskId}/rework`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reworkReason, waiveDeduction }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Rework failed"); }
  return await res.json();
}

// ── Confirmation popup for score impact ─────────────────────────────────────
function C1ConfirmPopup({ title, color, lines, onConfirm, onCancel, confirmLabel, busy, confirmMode, onWaiveRework }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "min(380px,90vw)", background: "#fff", borderRadius: 10, boxShadow: "0 8px 40px rgba(0,0,0,0.18)", overflow: "hidden", ...F }}>
        {/* Header */}
        <div style={{ padding: "13px 16px", background: color, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{title}</div>
        </div>
        {/* Body */}
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {lines.map((line, i) => (
            <div key={i} style={{ fontSize: 12, color: line.color || "#374151", fontWeight: line.bold ? 700 : 400, padding: line.box ? "8px 12px" : 0, background: line.box || "transparent", borderRadius: line.box ? 6 : 0 }}>
              {line.text}
            </div>
          ))}
        </div>
        {/* Footer */}
        <div style={{ padding: "10px 16px 14px", display: "flex", gap: 8 }}>
          <button onClick={onCancel} disabled={busy} style={{ flex: 1, padding: "8px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", color: "#6B7280", fontSize: 12, fontWeight: 500, cursor: "pointer", ...F }}>
            Cancel
          </button>
          {confirmMode === "rework" ? (
            <>
              <button onClick={() => { onWaiveRework(false); onConfirm(); }} disabled={busy}
                style={{ flex: 2, padding: "8px", border: "none", borderRadius: 6, background: busy ? "#E5E7EB" : "#D97706", color: "#fff", fontSize: 12, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", ...F }}>
                {busy ? "Processing…" : "🔄 Rework −0.2 pts"}
              </button>
              <button onClick={() => { onWaiveRework(true); onConfirm(); }} disabled={busy}
                style={{ flex: 2, padding: "8px", border: "1px solid #BBF7D0", borderRadius: 6, background: busy ? "#E5E7EB" : "#F0FDF4", color: busy ? "#9CA3AF" : "#15803D", fontSize: 12, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", ...F }}>
                {busy ? "Processing…" : "🔄 Rework — No Deduction"}
              </button>
            </>
          ) : (
            <button onClick={onConfirm} disabled={busy} style={{ flex: 2, padding: "8px", border: "none", borderRadius: 6, background: busy ? "#E5E7EB" : color, color: "#fff", fontSize: 12, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", ...F }}>
              {busy ? "Processing…" : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReviewCompletionModal({ task, currentEmployeeId, role, reviewType, onClose, onSuccess }) {
  const [rejectionReason, setRejectionReason] = useState("");
  const [reworkReason, setReworkReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pointNotif, setPointNotif] = useState(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showReworkForm, setShowReworkForm] = useState(false);

  // ── C1 confirmation states ────────────────────────────────────────────────
  const [confirmMode, setConfirmMode] = useState(null); // "approve" | "reject" | "rework"
  const [waiveReworkDeduction, setWaiveReworkDeduction] = useState(false);
  const [c1Preview, setC1Preview] = useState(null);
  const [c1Loading, setC1Loading] = useState(false);

  const isCEOReview = reviewType === "ceo_review";
  const submission = task?.completionSubmission;
  const tlReview = task?.tlReview;

  // ── Fetch C1 preview when preparing a confirm ─────────────────────────────
  const prepareConfirm = async (mode) => {
    setConfirmMode(mode);
    setC1Loading(true);
    const isRejected = mode === "reject";
    const preview = await fetchC1Preview(
      task.taskId,
      isRejected,
      submission?.submittedAt || null,
      task.dueDate || task.fixedDeadline || null
    );
    setC1Preview(preview);
    setC1Loading(false);
  };

  // ── Approve ───────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    setSubmitting(true); setError("");
    try {
      if (isCEOReview) await ceoReviewCompletion({ taskId: task.taskId, approved: true });
      else await reviewCompletion({ taskId: task.taskId, approved: true });
      // Build notification from preview
      if (c1Preview) {
        const score = c1Preview.taskScore;
        const missed = c1Preview.deadlineMissedNow;
        const reason = [
          score > 0 ? `+${score.toFixed(2)} pts · Task Completed` : null,
          missed ? `−${c1Preview.cfg?.c1DeadlineDeduction || 0.5} pts · Deadline Missed` : null,
        ].filter(Boolean).join("  |  ");
        setPointNotif({ type: score >= 1 ? "reward" : "mixed", pts: score, reason });
        setTimeout(() => setPointNotif(null), 6000);
      }
      onSuccess?.();
    } catch (err) { setError(err.message); setConfirmMode(null); }
    finally { setSubmitting(false); }
  };

  // ── Reject ────────────────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!rejectionReason.trim()) { setError("Please provide a reason for rejection."); return; }
    setSubmitting(true); setError("");
    try {
      if (isCEOReview) await ceoReviewCompletion({ taskId: task.taskId, approved: false, rejectionReason: rejectionReason.trim() });
      else await reviewCompletion({ taskId: task.taskId, approved: false, rejectionReason: rejectionReason.trim() });
      onSuccess?.();
    } catch (err) { setError(err.message); setConfirmMode(null); }
    finally { setSubmitting(false); }
  };

  // ── Rework ────────────────────────────────────────────────────────────────
  const handleRework = async () => {
    if (!reworkReason.trim()) { setError("Reason required."); return; }
    setSubmitting(true); setError("");
    try {
      await callRework(task.taskId, reworkReason.trim());
      const dedAmt = c1Preview?.cfg?.c1ReworkDeduction || 0.2;
      setPointNotif({ type: "deduct", pts: dedAmt, reason: `Rework recorded · −${dedAmt} pts from final task score` });
      setTimeout(() => setPointNotif(null), 5000);
      onSuccess?.();
    } catch (err) { setError(err.message); setConfirmMode(null); }
    finally { setSubmitting(false); }
  };

  // ── C1 score summary lines ────────────────────────────────────────────────
  const buildC1Lines = (mode) => {
    if (!c1Preview) return [{ text: "Loading C1 impact…", color: "#6B7280" }];
    const { taskScore, deadlinesMissed, deadlineMissedNow, extensionsFiled, reworksReceived, etcHours, cfg } = c1Preview;

    const lines = [];
    if (mode === "approve") {
      const base = Number(cfg?.c1BaseScore || 1);
      // Use TOTAL deadlinesMissed from preview (already includes new + existing)
      const dlTotal = Number(deadlinesMissed) || 0;
      const dlDeduct = +(dlTotal * (cfg?.c1DeadlineDeduction || 0.5)).toFixed(2);
      const extDeduct = +(extensionsFiled * (cfg?.c1ExtensionDeduction || 0.2)).toFixed(2);
      const rwDeduct = +(reworksReceived * (cfg?.c1ReworkDeduction || 0.2)).toFixed(2);

      lines.push({ text: `Base score (on-time):       +${base.toFixed(2)}`, color: "#374151" });
      if (dlTotal > 0) lines.push({ text: `Deadline missed (${dlTotal}×):      −${dlDeduct}   (${dlTotal} × ${cfg?.c1DeadlineDeduction || 0.5})`, color: "#DC2626" });
      if (extensionsFiled > 0) lines.push({ text: `Extension filed (${extensionsFiled}×):      −${extDeduct}   (${extensionsFiled} × ${cfg?.c1ExtensionDeduction || 0.2}) · already in SOP`, color: "#B45309" });
      if (reworksReceived > 0) lines.push({ text: `Reworks received (${reworksReceived}×):    −${rwDeduct}   (${reworksReceived} × ${cfg?.c1ReworkDeduction || 0.2}) · already in SOP`, color: "#B45309" });
      const rejectionsReceived = Number(c1Preview?.rejectionsReceived) || 0;
      const rejDeduct = +(rejectionsReceived * (cfg?.c1RejectScore || 0)).toFixed(2);
      if (rejectionsReceived > 0) lines.push({ text: `Rejections (${rejectionsReceived}×):           −${rejDeduct}   (${rejectionsReceived} × ${cfg?.c1RejectScore || 0}) · already in SOP`, color: "#B45309" });
      const displayQualityScore = +(taskScore - rejDeduct).toFixed(2);
      lines.push({ text: `─────────────────────────────────────`, color: "#E5E7EB" });
      lines.push({ text: `C1 Quality Score:            ${displayQualityScore >= 0 ? "+" : ""}${displayQualityScore.toFixed(2)}   (affects ScoreCard only)`, bold: false, color: displayQualityScore >= 0 ? "#059669" : "#DC2626" });
      lines.push({ text: `SOP Reward:                  +${Number(cfg?.c1BaseScore || 1).toFixed(2)}   (added to SOP history)`, bold: true, color: "#059669" });
      if (etcHours > 0) lines.push({ text: `ETC: ${etcHours}h  ·  Score will affect Quality Rate`, color: "#9CA3AF" });
      else lines.push({ text: `ETC: 0h  ·  Task excluded from Quality Rate (no ETC set)`, color: "#9CA3AF" });
    } else if (mode === "reject") {
      lines.push({ text: `Task Score will be overridden to: ${cfg?.c1RejectScore ?? 0} (rejection override)`, bold: true, color: "#DC2626" });
      lines.push({ text: "All deductions are ignored. Score is set to the rejection override value.", color: "#6B7280" });
      lines.push({ text: "This action cannot be undone.", color: "#B91C1C", box: "#FEF2F2" });
    } else if (mode === "rework") {
      const newReworks = reworksReceived + 1;
      if (waiveReworkDeduction) {
        lines.push({ text: `Rework #${newReworks} — No point deduction.`, bold: true, color: "#15803D" });
        lines.push({ text: "Task sent back for revision. Employee keeps full points for this rework.", color: "#6B7280" });
      } else {
        lines.push({ text: `Rework #${newReworks} — −${cfg?.c1ReworkDeduction || 0.2} pts deduction.`, bold: true, color: "#D97706" });
        lines.push({ text: `Deduction of ${cfg?.c1ReworkDeduction || 0.2} will be recorded in employee's SOP history immediately.`, color: "#6B7280" });
      }
      lines.push({ text: "Task will be sent back to the employee for revision.", color: "#374151" });
    }
    return lines;
  };

  const modeColors = { approve: "#059669", reject: "#DC2626", rework: "#D97706" };
  const modeLabels = { approve: "✅ Confirm Approve", reject: "Confirm Rejection", rework: "🔄 Confirm Rework" };
  const modeActions = { approve: handleApprove, reject: handleReject, rework: handleRework };

  return (
    <SliderPortal>
      <style>{`@keyframes rcm-in{from{transform:translateX(100%)}to{transform:translateX(0)}} @keyframes rcm-spin{to{transform:rotate(360deg)}}`}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.25)", zIndex: 8998, backdropFilter: "blur(1px)" }} />

      {/* Panel */}
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(500px,100vw)", background: "#fff", borderLeft: "1px solid #E5E7EB", boxShadow: "-6px 0 32px rgba(15,23,42,0.12)", display: "flex", flexDirection: "column", zIndex: 8999, ...F, animation: "rcm-in 0.24s cubic-bezier(0.32,0.72,0,1) both" }}>

        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #E5E7EB", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 28, borderRadius: 2, background: isCEOReview ? "#D97706" : "#1B4F8A", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{isCEOReview ? "CEO Final Review" : "Review Completion"}</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {task?.title}
              <span style={{ fontFamily: "monospace", background: "#F1F5F9", padding: "1px 5px", borderRadius: 3, marginLeft: 6, fontSize: 10 }}>{task?.taskId}</span>
            </div>
          </div>
          <button onClick={onClose} disabled={submitting} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0, opacity: submitting ? 0.4 : 1 }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "9px 12px", color: "#991B1B", fontSize: 12 }}>⚠️ {error}</div>}

          {/* Submission card */}
          {submission && (
            <div style={{ background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>📤 Submitted by {submission.submittedByName}</span>
                <span style={{ fontSize: 10, color: "#9CA3AF" }}>{submission.submittedAt ? new Date(submission.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span>
              </div>
              {submission.message && <p style={{ fontSize: 12, color: "#1F2937", lineHeight: 1.6, margin: "0 0 10px", whiteSpace: "pre-wrap" }}>{submission.message}</p>}
              {submission.imageUrls?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>📷 Proof Images ({submission.imageUrls.length})</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(80px,1fr))", gap: 6 }}>
                    {submission.imageUrls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={`Proof ${i + 1}`} style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid #E5E7EB", cursor: "pointer" }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {submission.pdfAttachments?.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>📄 Documents ({submission.pdfAttachments.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {submission.pdfAttachments.map((pdf, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: "#fff", borderRadius: 6, border: "1px solid #E5E7EB", fontSize: 11 }}>
                        <span style={{ color: "#374151" }}>📄 {pdf.name || "Document"}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          {pdf.url && <a href={pdf.url} target="_blank" rel="noreferrer" style={{ color: "#1B4F8A", fontSize: 11, textDecoration: "none", padding: "2px 7px", border: "1px solid #BFDBFE", borderRadius: 4 }}>View ↗</a>}
                          {pdf.downloadUrl && <a href={pdf.downloadUrl} target="_blank" rel="noreferrer" style={{ color: "#1B4F8A", fontSize: 11, textDecoration: "none", padding: "2px 7px", border: "1px solid #BFDBFE", borderRadius: 4 }}>↓</a>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TL review info (CEO view) */}
          {isCEOReview && tlReview && (
            <div style={{ background: "#EBF2FA", border: "1px solid #BFDBFE", borderRadius: 8, padding: "10px 12px", fontSize: 11, color: "#1B4F8A" }}>
              ✅ TL <strong>{tlReview.reviewedByName}</strong> approved this work on {new Date(tlReview.reviewedAt).toLocaleDateString("en-IN")}
            </div>
          )}

          {/* Rework reason form */}
          {showReworkForm && (
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
                Reason for Rework <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <textarea autoFocus value={reworkReason} onChange={e => setReworkReason(e.target.value)}
                placeholder="Explain what needs to be improved…"
                style={{ width: "100%", minHeight: 80, padding: "9px 11px", border: "1px solid #FCD34D", borderRadius: 6, fontSize: 12, ...F, outline: "none", resize: "vertical", boxSizing: "border-box", color: "#111827", background: "#FFFBEB" }} />
            </div>
          )}

          {/* Rejection reason form */}
          {showRejectForm && (
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
                Reason for Rejection <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <textarea autoFocus value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}
                placeholder="Explain what needs to be improved…"
                style={{ width: "100%", minHeight: 90, padding: "9px 11px", border: "1px solid #FECACA", borderRadius: 6, fontSize: 12, ...F, outline: "none", resize: "vertical", boxSizing: "border-box", color: "#111827" }} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 18px", borderTop: "1px solid #E5E7EB", background: "#FAFAFA", flexShrink: 0 }}>
          {/* Default: 3 buttons */}
          {!showRejectForm && !showReworkForm ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} disabled={submitting} style={{ flex: 1, padding: "9px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", color: "#6B7280", fontSize: 12, fontWeight: 500, cursor: submitting ? "not-allowed" : "pointer", ...F }}>
                Cancel
              </button>
              <button onClick={() => { setShowReworkForm(true); setShowRejectForm(false); }} disabled={submitting} style={{ flex: 1, padding: "9px", border: "1px solid #FCD34D", borderRadius: 6, background: "#FFFBEB", color: "#92400E", fontSize: 12, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", ...F }}>
                🔄 Rework
              </button>
              <button onClick={() => { setShowRejectForm(true); setShowReworkForm(false); }} disabled={submitting} style={{ flex: 1, padding: "9px", border: "1px solid #FECACA", borderRadius: 6, background: "#FEF2F2", color: "#DC2626", fontSize: 12, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", ...F }}>
                ✕ Reject
              </button>
              <button onClick={() => prepareConfirm("approve")} disabled={submitting} style={{ flex: 2, padding: "9px", border: "none", borderRadius: 6, background: submitting ? "#E5E7EB" : "#059669", color: submitting ? "#9CA3AF" : "#fff", fontSize: 12, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, ...F }}>
                {isCEOReview ? "✅ Final Approve" : "✅ Approve"}
              </button>
            </div>
          ) : showReworkForm ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowReworkForm(false); setReworkReason(""); setError(""); }} disabled={submitting} style={{ flex: 1, padding: "9px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", color: "#6B7280", fontSize: 12, fontWeight: 500, cursor: "pointer", ...F }}>
                ← Back
              </button>
              <button onClick={() => { if (!reworkReason.trim()) { setError("Reason required."); return; } prepareConfirm("rework"); }} disabled={submitting || !reworkReason.trim()} style={{ flex: 2, padding: "9px", border: "none", borderRadius: 6, background: submitting || !reworkReason.trim() ? "#E5E7EB" : "#D97706", color: submitting || !reworkReason.trim() ? "#9CA3AF" : "#fff", fontSize: 12, fontWeight: 600, cursor: submitting || !reworkReason.trim() ? "not-allowed" : "pointer", ...F }}>
                Review Impact →
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowRejectForm(false); setRejectionReason(""); setError(""); }} disabled={submitting} style={{ flex: 1, padding: "9px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", color: "#6B7280", fontSize: 12, fontWeight: 500, cursor: "pointer", ...F }}>
                ← Back
              </button>
              <button onClick={() => { if (!rejectionReason.trim()) { setError("Reason required."); return; } prepareConfirm("reject"); }} disabled={submitting || !rejectionReason.trim()} style={{ flex: 2, padding: "9px", border: "none", borderRadius: 6, background: submitting || !rejectionReason.trim() ? "#E5E7EB" : "#DC2626", color: submitting || !rejectionReason.trim() ? "#9CA3AF" : "#fff", fontSize: 12, fontWeight: 600, cursor: submitting || !rejectionReason.trim() ? "not-allowed" : "pointer", ...F }}>
                Review Impact →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── C1 Score Confirmation Popup ─────────────────────────────────────── */}
      {confirmMode && (
        <C1ConfirmPopup
          title={
            confirmMode === "approve" ? "✅ Confirm Approval — C1 Impact" :
              confirmMode === "reject" ? "⚠ Confirm Rejection — C1 Impact" :
                "🔄 Confirm Rework — C1 Impact"
          }
          color={modeColors[confirmMode]}
          lines={c1Loading ? [{ text: "Calculating C1 impact…", color: "#6B7280" }] : buildC1Lines(confirmMode)}
          onConfirm={modeActions[confirmMode]}
          onCancel={() => setConfirmMode(null)}
          confirmLabel={modeLabels[confirmMode]}
          busy={submitting}
          confirmMode={confirmMode}
          onWaiveRework={setWaiveReworkDeduction}
        />
      )}

      {pointNotif && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          background: "#1F2937", borderRadius: 10, padding: "14px 18px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          display: "flex", alignItems: "flex-start", gap: 12,
          maxWidth: 320, fontFamily: "'IBM Plex Sans',-apple-system,sans-serif",
          animation: "slideUp 0.3s ease",
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: pointNotif.type === "deduct" ? "#DC2626" : pointNotif.type === "reward" ? "#059669" : "#D97706",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 800, color: "#fff",
          }}>
            {pointNotif.type === "reward" ? "+" : pointNotif.type === "deduct" ? "−" : "⚡"}
          </div>
          <div>
            {pointNotif.pts != null && (
              <div style={{ fontSize: 16, fontWeight: 800, color: pointNotif.type === "reward" ? "#6EE7B7" : "#FCA5A5", marginBottom: 4 }}>
                {pointNotif.type === "reward" ? `+${Number(pointNotif.pts).toFixed(2)} pts` : `Score: ${Number(pointNotif.pts).toFixed(2)} pts`}
              </div>
            )}
            <div style={{ fontSize: 12, color: "#D1D5DB", lineHeight: 1.5 }}>{pointNotif.reason}</div>
          </div>
          <button onClick={() => setPointNotif(null)}
            style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 16, padding: 0, flexShrink: 0, marginLeft: "auto" }}>×</button>
        </div>
      )}

    </SliderPortal>
  );
}