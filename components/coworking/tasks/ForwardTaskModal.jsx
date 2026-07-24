/**
 * components/coworking/tasks/ForwardTaskModal.jsx
 * RIGHT SLIDER — Forward & split task to employees.
 * All logic identical to original; only presentation changed.
 */
"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { forwardTask, listAllEmployees, getForwardBudget } from "../../../lib/mediaUploadApi";

const F = { fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif" };

function SliderPortal({ children }) {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  if (!m) return null;
  return createPortal(children, document.body);
}

export default function ForwardTaskModal({ task, currentEmployeeId, onClose, onSuccess }) {
  const [employees, setEmployees] = useState([]);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [assignments, setAssignments] = useState([
    { employeeId: "", notes: "", title: task?.title || "", timerDurationVal: "", timerDurationUnit: "hours", requirements: [], reqInput: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [budget, setBudget] = useState(null); // { hasBudget, remainingSecs } — null while loading/unavailable

  useEffect(() => {
    listAllEmployees()
      .then(emps => setEmployees(emps.filter(e => e.employeeId !== currentEmployeeId)))
      .catch(err => setError("Could not load employees: " + err.message))
      .finally(() => setLoadingEmps(false));
  }, [currentEmployeeId]);

  useEffect(() => {
    if (!task?.taskId) return;
    getForwardBudget(task.taskId)
      .then(setBudget)
      .catch(() => setBudget(null)); // informational only — a failed preview shouldn't block the form
  }, [task?.taskId]);

  const addRow = () => setAssignments(prev => [...prev, { employeeId: "", notes: "", title: task?.title || "", timerDurationVal: "", timerDurationUnit: "hours", requirements: [], reqInput: "" }]);
  const removeRow = (i) => setAssignments(prev => prev.filter((_, j) => j !== i));
  const updateRow = (i, k, v) => setAssignments(prev => prev.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Any row the user has started filling in must be fully complete —
    // Duration included, it's mandatory now, not optional.
    const touched = assignments.filter(a => a.employeeId || a.notes || a.timerDurationVal);
    const incomplete = touched.find(a => !a.employeeId || !a.notes || !(Number(a.timerDurationVal) > 0));
    if (incomplete) {
      setError(!(Number(incomplete.timerDurationVal) > 0)
        ? "Duration is required for every assignment."
        : "Employee and notes are required for every assignment.");
      return;
    }
    const filled = touched.map(a => {
      const val = Number(a.timerDurationVal) || 0;
      const unit = a.timerDurationUnit || "hours";
      const senderTimerWindowSecs = val * (unit === "minutes" ? 60 : unit === "days" ? 86400 : 3600);
      return { employeeId: a.employeeId, notes: a.notes, title: a.title, hasTimer: true, senderTimerWindowSecs, requirements: a.requirements || [] };
    });
    if (!filled.length) { setError("Add at least one assignment with employee, duration, and notes."); return; }
    setError(""); setSubmitting(true);
    try {
      await forwardTask(task.taskId, filled);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SliderPortal>
      <style>{`@keyframes ftm-in{from{transform:translateX(100%)}to{transform:translateX(0)}} @keyframes ftm-spin{to{transform:rotate(360deg)}}`}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.25)", zIndex: 8998, backdropFilter: "blur(1px)" }} />

      {/* Panel */}
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(520px,100vw)", background: "#fff", borderLeft: "1px solid #E5E7EB", boxShadow: "-6px 0 32px rgba(15,23,42,0.12)", display: "flex", flexDirection: "column", zIndex: 8999, ...F, animation: "ftm-in 0.24s cubic-bezier(0.32,0.72,0,1) both" }}>

        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #E5E7EB", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 28, borderRadius: 2, background: "#1B4F8A", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Forward & Split Task</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ fontFamily: "monospace", background: "#F1F5F9", padding: "1px 5px", borderRadius: 3, marginRight: 5, fontSize: 10 }}>{task?.taskId}</span>
              {task?.title}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "9px 12px", color: "#991B1B", fontSize: 12 }}>⚠️ {error}</div>}

          {loadingEmps ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40, color: "#9CA3AF", fontSize: 12 }}>Loading employees…</div>
          ) : employees.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF", fontSize: 12 }}>No other employees found.</div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {assignments.map((row, i) => {
                return (
                  <div key={i} style={{ background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1B4F8A" }}>Assignment {i + 1}</span>
                      {assignments.length > 1 && (
                        <button type="button" onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 11, cursor: "pointer", ...F }}>Remove</button>
                      )}
                    </div>

                    {/* Employee select */}
                    <div style={{ marginBottom: 8 }}>
                      <label style={lbl}>Assign to *</label>
                      <select style={inp} value={row.employeeId} onChange={e => updateRow(i, "employeeId", e.target.value)}>

                        <option value="">Select employee…</option>
                        {employees.map(emp => (
                          <option key={emp.employeeId} value={emp.employeeId}>
                            {emp.name} ({emp.employeeId}){emp.department ? ` — ${emp.department}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Title + estimated duration row */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 2 }}>
                        <label style={lbl}>Subtask title</label>
                        <input style={inp} value={row.title} onChange={e => updateRow(i, "title", e.target.value)} placeholder={task?.title} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={lbl}>Duration *</label>
                        <div style={{ display: "flex", gap: 4 }}>
                          <input type="number" min={0} style={{ ...inp, width: "50%" }}
                            value={row.timerDurationVal}
                            onChange={e => updateRow(i, "timerDurationVal", e.target.value.replace(/[^0-9]/g, ""))}
                            placeholder="e.g. 2" />
                          <select style={{ ...inp, width: "50%" }} value={row.timerDurationUnit}
                            onChange={e => updateRow(i, "timerDurationUnit", e.target.value)}>
                            <option value="minutes">min</option>
                            <option value="hours">hrs</option>
                          </select>
                        </div>
                        {budget?.hasBudget && (
                          <div style={{ fontSize: 10, color: "#6B7280", marginTop: 4 }}>
                            {fmtSecs(Math.max(0, budget.remainingSecs - assignments.reduce((sum, r, j) => j === i ? sum : sum + rowSecs(r), 0)))} remaining in parent task
                          </div>
                        )}
                      </div>
                    </div>


                    {/* Notes */}
                    <div>
                      <label style={lbl}>Instructions / Notes *</label>
                      <textarea style={{ ...inp, height: 64, resize: "vertical" }} value={row.notes} onChange={e => updateRow(i, "notes", e.target.value)} placeholder="What this employee needs to do…" />
                    </div>

                    {/* Requirements / Deliverables */}
                    <div style={{ marginTop: 8 }}>
                      <label style={lbl}>Requirements / Deliverables</label>
                      {(row.requirements || []).length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
                          {(row.requirements || []).map((req, ri) => (
                            <div key={ri} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 9px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 5 }}>
                              {row.editingReqIndex === ri ? (
                                <input
                                  autoFocus
                                  style={{ ...inp, flex: 1, padding: "4px 8px" }}
                                  value={row.editReqValue ?? ""}
                                  onChange={e => updateRow(i, "editReqValue", e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter" && (row.editReqValue || "").trim()) {
                                      e.preventDefault();
                                      updateRow(i, "requirements", (row.requirements || []).map((r, j2) => j2 === ri ? row.editReqValue.trim() : r));
                                      updateRow(i, "editingReqIndex", null);
                                    } else if (e.key === "Escape") {
                                      updateRow(i, "editingReqIndex", null);
                                    }
                                  }}
                                  onBlur={() => {
                                    if ((row.editReqValue || "").trim()) {
                                      updateRow(i, "requirements", (row.requirements || []).map((r, j2) => j2 === ri ? row.editReqValue.trim() : r));
                                    }
                                    updateRow(i, "editingReqIndex", null);
                                  }}
                                />
                              ) : (
                                <>
                                  <span style={{ color: "#1B4F8A", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>•</span>
                                  <span style={{ flex: 1, fontSize: 12, color: "#111827", lineHeight: 1.5, cursor: "pointer" }}
                                    onClick={() => { updateRow(i, "editingReqIndex", ri); updateRow(i, "editReqValue", req); }}>{req}</span>
                                  <button type="button" title="Edit" onClick={() => { updateRow(i, "editingReqIndex", ri); updateRow(i, "editReqValue", req); }}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 12, padding: 0, flexShrink: 0, lineHeight: 1 }}>✎</button>
                                  <button type="button" onClick={() => updateRow(i, "requirements", (row.requirements || []).filter((_, j2) => j2 !== ri))}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 14, padding: 0, flexShrink: 0, lineHeight: 1 }}>×</button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          style={{ ...inp, flex: 1 }}
                          value={row.reqInput || ""}
                          onChange={e => updateRow(i, "reqInput", e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && (row.reqInput || "").trim()) {
                              e.preventDefault();
                              updateRow(i, "requirements", [...(row.requirements || []), row.reqInput.trim()]);
                              updateRow(i, "reqInput", "");
                            }
                          }}
                          placeholder="Type a requirement and press Enter"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!(row.reqInput || "").trim()) return;
                            updateRow(i, "requirements", [...(row.requirements || []), row.reqInput.trim()]);
                            updateRow(i, "reqInput", "");
                          }}
                          style={{ padding: "0 12px", border: "1px solid #1B4F8A", borderRadius: 5, background: "#EBF2FA", color: "#1B4F8A", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                          + Add
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button type="button" onClick={addRow} style={{ padding: "8px", border: "1.5px dashed #CBD5E1", borderRadius: 6, background: "transparent", color: "#6B7280", fontSize: 12, cursor: "pointer", ...F, transition: "all 0.12s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#1B4F8A"; e.currentTarget.style.color = "#1B4F8A" }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#CBD5E1"; e.currentTarget.style.color = "#6B7280" }}>
                + Add another assignment
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 18px", borderTop: "1px solid #E5E7EB", background: "#FAFAFA", display: "flex", gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: "9px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", color: "#6B7280", fontSize: 12, fontWeight: 500, cursor: "pointer", ...F }}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={submitting || loadingEmps} style={{ flex: 2, padding: "9px", border: "none", borderRadius: 6, background: submitting || loadingEmps ? "#E5E7EB" : "#1B4F8A", color: submitting || loadingEmps ? "#9CA3AF" : "#fff", fontSize: 12, fontWeight: 600, cursor: submitting || loadingEmps ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, ...F }}>
            {submitting ? (<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "ftm-spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>Forwarding…</>) : `Forward to ${assignments.filter(a => a.employeeId).length || 0} employee(s)`}
          </button>
        </div>
      </div>
    </SliderPortal >
  );
}

function fmtSecs(s) {
  s = Math.max(0, Math.round(Number(s) || 0));
  if (s < 3600) return `${Math.round(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function rowSecs(row) {
  const val = Number(row.timerDurationVal) || 0;
  const unit = row.timerDurationUnit || "hours";
  return val * (unit === "minutes" ? 60 : unit === "days" ? 86400 : 3600);
}

const lbl = { fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };
const inp = { padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontFamily: "'IBM Plex Sans',-apple-system,sans-serif", outline: "none", boxSizing: "border-box", width: "100%", background: "#fff", color: "#111827" };