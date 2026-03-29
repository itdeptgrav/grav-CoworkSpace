/**
 * GRAV-CMS/components/coworking/tasks/CreateTaskModal.jsx
 * CEO and TL can create tasks (root tasks or subtasks under any task).
 */
"use client";
import { useState, useEffect } from "react";
import { createTask, listAllEmployees } from "../../../lib/mediaUploadApi";
import DeadlineBadge from "./DeadlineBadge";

export default function CreateTaskModal({ onClose, onSuccess, currentEmployeeId, parentTask = null }) {
  const [form, setForm] = useState({ title: "", description: "", notes: "", dueDate: "", priority: "medium" });
  const [employees, setEmployees] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listAllEmployees()
      .then(emps => setEmployees(emps.filter(e => e.employeeId !== currentEmployeeId)))
      .catch(() => { });
  }, [currentEmployeeId]);

  const toggle = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required."); return; }
    if (!selectedIds.length) { setError("Assign to at least one person."); return; }
    setError(""); setSubmitting(true);
    try {
      await createTask({
        title: form.title,
        description: form.description,
        notes: form.notes,
        assigneeIds: selectedIds,
        dueDate: form.dueDate || null,
        priority: form.priority,
        parentTaskId: parentTask?.taskId || null,
      });
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const PRIORITIES = [
    { value: "low", label: "🟢 Low", color: "#1e8e3e" },
    { value: "medium", label: "🟡 Medium", color: "#f9ab00" },
    { value: "high", label: "🔴 High", color: "#d93025" },
  ];

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.header}>
          <div>
            <h2 style={s.title}>{parentTask ? "➕ Add Subtask" : "📋 Create Task"}</h2>
            {parentTask && (
              <p style={s.subtitle}>Under: <strong>{parentTask.title}</strong> <code style={s.idBadge}>({parentTask.taskId})</code></p>
            )}
          </div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        {error && <div style={s.errBox}>⚠️ {error}</div>}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={s.field}>
            <label style={s.label}>Title *</label>
            <input style={s.input} value={form.title} onChange={e => set("title", e.target.value)} placeholder={parentTask ? "Subtask title..." : "Task title..."} required autoFocus />
          </div>

          <div style={s.field}>
            <label style={s.label}>Description</label>
            <textarea style={{ ...s.input, height: "64px", resize: "vertical" }} value={form.description} onChange={e => set("description", e.target.value)} placeholder="What needs to be done..." />
          </div>

          <div style={s.field}>
            <label style={s.label}>Notes / Requirements *</label>
            <textarea style={{ ...s.input, height: "72px", resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Specific requirements, deliverables, expectations..." required />
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <div style={{ flex: 1, ...s.field }}>
              <label style={s.label}>Deadline</label>
              <input type="date" style={s.input} value={form.dueDate} onChange={e => set("dueDate", e.target.value)} />
              {form.dueDate && <div style={{ marginTop: 4 }}><DeadlineBadge dueDate={form.dueDate} /></div>}
            </div>
            <div style={{ flex: 1, ...s.field }}>
              <label style={s.label}>Priority</label>
              <div style={{ display: "flex", gap: "6px" }}>
                {PRIORITIES.map(p => (
                  <button key={p.value} type="button" onClick={() => set("priority", p.value)}
                    style={{ flex: 1, padding: "8px 4px", border: `2px solid ${form.priority === p.value ? p.color : "#e8eaed"}`, borderRadius: "8px", background: form.priority === p.value ? `${p.color}15` : "#fff", color: form.priority === p.value ? p.color : "#5f6368", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>Assign to ({selectedIds.length} selected) *</label>
            <div style={s.empGrid}>
              {employees.length === 0 ? (
                <span style={{ fontSize: 13, color: "#80868b" }}>Loading...</span>
              ) : employees.map(emp => {
                const sel = selectedIds.includes(emp.employeeId);
                return (
                  <button key={emp.employeeId} type="button" onClick={() => toggle(emp.employeeId)}
                    style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px", border: `2px solid ${sel ? "#1a73e8" : "#e8eaed"}`, borderRadius: "20px", background: sel ? "#e8f0fe" : "#fff", cursor: "pointer", fontSize: "13px", color: sel ? "#1a73e8" : "#3c4043", fontWeight: sel ? 500 : 400 }}>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", background: sel ? "#1a73e8" : "#e8eaed", display: "flex", alignItems: "center", justifyContent: "center", color: sel ? "#fff" : "#5f6368", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>
                      {emp.name?.charAt(0).toUpperCase()}
                    </span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{emp.name}</span>
                    {sel && <span>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={s.footer}>
            <button type="button" onClick={onClose} style={s.cancelBtn}>Cancel</button>
            <button type="submit" disabled={submitting} style={s.submitBtn}>
              {submitting ? "Creating..." : parentTask ? "Create Subtask" : "Create & Assign Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const s = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 700, fontFamily: "'Google Sans','Roboto',sans-serif" },
  modal: { background: "#fff", borderRadius: "16px", width: "min(680px,96vw)", maxHeight: "92vh", overflow: "auto", padding: "28px", boxShadow: "0 32px 64px rgba(0,0,0,0.2)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px" },
  title: { margin: "0 0 4px", fontSize: "20px", fontWeight: 600, color: "#202124" },
  subtitle: { margin: 0, fontSize: "13px", color: "#5f6368" },
  idBadge: { fontFamily: "monospace", background: "#f1f3f4", padding: "1px 5px", borderRadius: "3px", fontSize: "11px" },
  closeBtn: { background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#5f6368", flexShrink: 0 },
  errBox: { background: "#fce8e6", border: "1px solid #f5c6c6", borderRadius: "8px", padding: "12px 16px", color: "#c5221f", fontSize: "13px", marginBottom: "16px" },
  field: { display: "flex", flexDirection: "column", gap: "6px" },
  label: { fontSize: "11px", fontWeight: 600, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.6px" },
  input: { padding: "10px 14px", border: "1.5px solid #dadce0", borderRadius: "8px", fontSize: "14px", fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" },
  empGrid: { display: "flex", flexWrap: "wrap", gap: "8px", maxHeight: "180px", overflowY: "auto", padding: "4px 0" },
  footer: { display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "20px", borderTop: "1px solid #e8eaed" },
  cancelBtn: { padding: "11px 24px", border: "none", background: "transparent", color: "#1a73e8", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
  submitBtn: { padding: "11px 28px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer" },
};