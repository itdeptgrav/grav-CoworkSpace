/**
 * GRAV-CMS/components/coworking/tasks/CreateSubtaskModal.jsx
 * Both CEO and TL (anyone assigned to parent task) can create subtasks.
 */
"use client";
import { useState, useEffect } from "react";
import { createSubtask, listAllEmployees } from "../../../lib/mediaUploadApi";
import DeadlineBadge from "./DeadlineBadge";

export default function CreateSubtaskModal({ taskId, taskTitle, currentEmployeeId, onClose, onSuccess }) {
    const [form, setForm] = useState({ title: "", description: "", notes: "", dueDate: "", priority: "medium" });
    const [employees, setEmployees] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [empsLoading, setEmpsLoading] = useState(true);

    useEffect(() => {
        listAllEmployees()
            .then(emps => setEmployees(emps.filter(e => e.employeeId !== currentEmployeeId)))
            .catch(() => { })
            .finally(() => setEmpsLoading(false));
    }, [currentEmployeeId]);

    const toggle = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.title.trim()) { setError("Title is required."); return; }
        if (!selectedIds.length) { setError("Assign to at least one person."); return; }
        setError(""); setSubmitting(true);
        try {
            await createSubtask({ taskId, ...form, assigneeIds: selectedIds });
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
                        <h2 style={s.title}>➕ Add Subtask</h2>
                        <p style={s.subtitle}>Under: <strong>{taskTitle}</strong> <span style={s.idBadge}>({taskId})</span></p>
                    </div>
                    <button onClick={onClose} style={s.closeBtn}>✕</button>
                </div>

                {error && <div style={s.errBox}>⚠️ {error}</div>}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={s.field}>
                        <label style={s.label}>Subtask title *</label>
                        <input style={s.input} value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Design login page" required />
                    </div>

                    <div style={s.field}>
                        <label style={s.label}>Description</label>
                        <textarea style={{ ...s.input, height: "64px", resize: "vertical" }} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Additional details..." />
                    </div>

                    <div style={s.field}>
                        <label style={s.label}>Notes / Requirements *</label>
                        <textarea style={{ ...s.input, height: "72px", resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="What needs to be done specifically..." required />
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
                                        style={{ flex: 1, padding: "8px 4px", border: `2px solid ${form.priority === p.value ? p.color : "#e8eaed"}`, borderRadius: "8px", background: form.priority === p.value ? `${p.color}18` : "#fff", color: form.priority === p.value ? p.color : "#5f6368", fontSize: "11px", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={s.field}>
                        <label style={s.label}>Assign to ({selectedIds.length} selected) *</label>
                        {empsLoading ? (
                            <div style={s.loadingEmps}>Loading employees...</div>
                        ) : (
                            <div style={s.empGrid}>
                                {employees.map(emp => {
                                    const sel = selectedIds.includes(emp.employeeId);
                                    return (
                                        <button key={emp.employeeId} type="button" onClick={() => toggle(emp.employeeId)}
                                            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", border: `2px solid ${sel ? "#1a73e8" : "#e8eaed"}`, borderRadius: "20px", background: sel ? "#e8f0fe" : "#fff", cursor: "pointer", fontSize: "13px", color: sel ? "#1a73e8" : "#3c4043", transition: "all 0.15s", fontWeight: sel ? 500 : 400 }}>
                                            <span style={{ width: 26, height: 26, borderRadius: "50%", background: sel ? "#1a73e8" : "#e8eaed", display: "flex", alignItems: "center", justifyContent: "center", color: sel ? "#fff" : "#5f6368", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>
                                                {emp.name?.charAt(0).toUpperCase()}
                                            </span>
                                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{emp.name}</span>
                                            {sel && <span style={{ marginLeft: "auto" }}>✓</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div style={s.footer}>
                        <button type="button" onClick={onClose} style={s.cancelBtn}>Cancel</button>
                        <button type="submit" disabled={submitting} style={s.submitBtn}>
                            {submitting ? "Creating..." : "Create Subtask"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const s = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 700, fontFamily: "'Google Sans','Roboto',sans-serif" },
    modal: { background: "#fff", borderRadius: "16px", width: "min(660px,96vw)", maxHeight: "90vh", overflow: "auto", padding: "28px", boxShadow: "0 32px 64px rgba(0,0,0,0.2)" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px" },
    title: { margin: "0 0 4px", fontSize: "20px", fontWeight: 600, color: "#202124" },
    subtitle: { margin: 0, fontSize: "13px", color: "#5f6368" },
    idBadge: { fontFamily: "monospace", background: "#f1f3f4", padding: "1px 5px", borderRadius: "3px", fontSize: "11px" },
    closeBtn: { background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#5f6368" },
    errBox: { background: "#fce8e6", border: "1px solid #f5c6c6", borderRadius: "8px", padding: "12px 16px", color: "#c5221f", fontSize: "13px", marginBottom: "16px" },
    field: { display: "flex", flexDirection: "column", gap: "6px" },
    label: { fontSize: "11px", fontWeight: 600, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.6px" },
    input: { padding: "10px 14px", border: "1.5px solid #dadce0", borderRadius: "8px", fontSize: "14px", fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" },
    empGrid: { display: "flex", flexWrap: "wrap", gap: "8px", maxHeight: "180px", overflowY: "auto", padding: "4px 0" },
    loadingEmps: { fontSize: "13px", color: "#80868b", padding: "12px 0" },
    footer: { display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "20px", borderTop: "1px solid #e8eaed" },
    cancelBtn: { padding: "11px 24px", border: "none", background: "transparent", color: "#1a73e8", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
    submitBtn: { padding: "11px 28px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer" },
};