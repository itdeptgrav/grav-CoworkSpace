/**
 * GRAV-CMS/components/coworking/tasks/EditDeadlineModal.jsx
 * CEO edits task deadline with a mandatory reason.
 */
"use client";
import { useState } from "react";
import { editTaskDeadline } from "../../../lib/mediaUploadApi";
import DeadlineBadge from "./DeadlineBadge";

export default function EditDeadlineModal({ task, onClose, onSuccess }) {
  const [newDueDate, setNewDueDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setError("A reason is required when changing the deadline."); return; }
    setError(""); setSubmitting(true);
    try {
      await editTaskDeadline({ taskId: task.taskId, newDueDate: newDueDate || null, reason: reason.trim() });
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.header}>
          <div>
            <h2 style={s.title}>Edit Deadline</h2>
            <p style={s.subtitle}>{task.title}</p>
          </div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        {error && <div style={s.errBox}>⚠️ {error}</div>}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={s.field}>
            <label style={s.label}>Current deadline</label>
            <div>
              {task.dueDate
                ? <><span style={s.dateDisplay}>{new Date(task.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span><DeadlineBadge dueDate={task.dueDate} /></>
                : <span style={s.noDue}>No deadline set</span>
              }
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>New deadline</label>
            <input
              type="date"
              style={s.input}
              value={newDueDate}
              onChange={e => setNewDueDate(e.target.value)}
              placeholder="Leave blank to remove deadline"
            />
            {newDueDate && <DeadlineBadge dueDate={newDueDate} />}
          </div>

          <div style={s.field}>
            <label style={s.label}>Reason for change * <span style={{ color: "#d93025", fontSize: "11px" }}>(required)</span></label>
            <textarea
              style={{ ...s.input, height: "80px", resize: "vertical" }}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain why the deadline is being changed (visible to assignees)..."
              required
            />
          </div>

          <div style={s.footer}>
            <button type="button" onClick={onClose} style={s.cancelBtn} disabled={submitting}>Cancel</button>
            <button type="submit" disabled={submitting || !reason.trim()} style={{ ...s.submitBtn, opacity: !reason.trim() ? 0.5 : 1 }}>
              {submitting ? "Saving..." : "Update Deadline"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const s = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, fontFamily: "'Google Sans','Roboto',sans-serif" },
  modal: { background: "#fff", borderRadius: "12px", width: "min(500px,96vw)", padding: "24px", boxShadow: "0 24px 48px rgba(0,0,0,0.2)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" },
  title: { margin: "0 0 4px", fontSize: "20px", fontWeight: 400, color: "#202124" },
  subtitle: { margin: 0, fontSize: "13px", color: "#5f6368" },
  closeBtn: { background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#5f6368" },
  errBox: { background: "#fce8e6", border: "1px solid #f5c6c6", borderRadius: "6px", padding: "10px 14px", color: "#c5221f", fontSize: "13px", marginBottom: "12px" },
  field: { display: "flex", flexDirection: "column", gap: "6px" },
  label: { fontSize: "11px", fontWeight: 500, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.5px" },
  input: { padding: "10px 12px", border: "1px solid #dadce0", borderRadius: "4px", fontSize: "14px", fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" },
  dateDisplay: { fontSize: "14px", color: "#202124", marginRight: "8px" },
  noDue: { fontSize: "13px", color: "#80868b" },
  footer: { display: "flex", justifyContent: "flex-end", gap: "10px", paddingTop: "16px", borderTop: "1px solid #e8eaed" },
  cancelBtn: { padding: "10px 24px", border: "none", background: "transparent", color: "#1a73e8", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
  submitBtn: { padding: "10px 24px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: "4px", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
};