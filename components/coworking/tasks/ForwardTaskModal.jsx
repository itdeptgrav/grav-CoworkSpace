/**
 * GRAV-CMS/components/coworking/tasks/ForwardTaskModal.jsx
 * CEO and TL can forward/split tasks to employees.
 * Uses forwardTask from mediaUploadApi.
 */
"use client";
import { useState, useEffect } from "react";
import { forwardTask, listAllEmployees } from "../../../lib/mediaUploadApi";
import DeadlineBadge, { getDeadlineInfo } from "./DeadlineBadge";

export default function ForwardTaskModal({ task, currentEmployeeId, onClose, onSuccess }) {
    const [employees, setEmployees] = useState([]);
    const [loadingEmps, setLoadingEmps] = useState(true);
    const [assignments, setAssignments] = useState([
        { employeeId: "", notes: "", dueDate: "", title: task?.title || "" }
    ]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        listAllEmployees()
            .then(emps => setEmployees(emps.filter(e => e.employeeId !== currentEmployeeId)))
            .catch(err => setError("Could not load employees: " + err.message))
            .finally(() => setLoadingEmps(false));
    }, [currentEmployeeId]);

    const addRow = () => setAssignments(prev => [...prev, { employeeId: "", notes: "", dueDate: "", title: task?.title || "" }]);
    const removeRow = (i) => setAssignments(prev => prev.filter((_, j) => j !== i));
    const updateRow = (i, k, v) => setAssignments(prev => prev.map((r, j) => j === i ? { ...r, [k]: v } : r));

    const handleSubmit = async (e) => {
        e.preventDefault();
        const filled = assignments.filter(a => a.employeeId && a.notes);
        if (!filled.length) { setError("Add at least one assignment with employee and notes."); return; }
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
        <div style={s.overlay}>
            <div style={s.modal}>
                <div style={s.header}>
                    <div>
                        <h2 style={s.title}>↗ Forward & Split Task</h2>
                        <p style={s.sub}>
                            <code style={s.idBadge}>{task?.taskId}</code>{" "}
                            {task?.title}
                        </p>
                    </div>
                    <button onClick={onClose} style={s.closeBtn}>✕</button>
                </div>

                {error && <div style={s.errBox}>⚠️ {error}</div>}

                {loadingEmps ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#80868b" }}>Loading employees...</div>
                ) : employees.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#80868b" }}>No other employees found.</div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 460, overflowY: "auto", paddingRight: 4 }}>
                            {assignments.map((row, i) => {
                                const dl = getDeadlineInfo(row.dueDate);
                                return (
                                    <div key={i} style={s.rowCard}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: "#1a73e8" }}>Assignment {i + 1}</span>
                                            {assignments.length > 1 && (
                                                <button type="button" onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: "#d93025", fontSize: 12, cursor: "pointer" }}>Remove</button>
                                            )}
                                        </div>

                                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                            <div style={{ flex: "1 1 200px", ...s.field }}>
                                                <label style={s.label}>Assign to *</label>
                                                <select style={s.input} value={row.employeeId} onChange={e => updateRow(i, "employeeId", e.target.value)} required>
                                                    <option value="">Select employee</option>
                                                    {employees.map(emp => (
                                                        <option key={emp.employeeId} value={emp.employeeId}>
                                                            {emp.name} ({emp.employeeId}){emp.department ? ` — ${emp.department}` : ""}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div style={{ flex: "1 1 160px", ...s.field }}>
                                                <label style={s.label}>Deadline</label>
                                                <input
                                                    type="date" style={{ ...s.input, borderColor: dl.status !== "none" ? dl.color : "#dadce0" }}
                                                    value={row.dueDate}
                                                    onChange={e => updateRow(i, "dueDate", e.target.value)}
                                                />
                                                {row.dueDate && <div style={{ marginTop: 3 }}><DeadlineBadge dueDate={row.dueDate} /></div>}
                                            </div>
                                        </div>

                                        <div style={{ marginTop: 10, ...s.field }}>
                                            <label style={s.label}>Subtask title</label>
                                            <input style={s.input} value={row.title} onChange={e => updateRow(i, "title", e.target.value)} placeholder={task?.title} />
                                        </div>

                                        <div style={{ marginTop: 10, ...s.field }}>
                                            <label style={s.label}>Instructions / Notes *</label>
                                            <textarea
                                                style={{ ...s.input, height: 70, resize: "vertical" }}
                                                value={row.notes}
                                                onChange={e => updateRow(i, "notes", e.target.value)}
                                                placeholder="What this employee needs to do..."
                                                required
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <button type="button" onClick={addRow} style={s.addRowBtn}>+ Add another assignment</button>

                        <div style={s.footer}>
                            <button type="button" onClick={onClose} style={s.cancelBtn}>Cancel</button>
                            <button type="submit" disabled={submitting} style={s.submitBtn}>
                                {submitting ? "Forwarding..." : `Forward to ${assignments.filter(a => a.employeeId).length} employee(s)`}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

const s = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, fontFamily: "'Google Sans','Roboto',sans-serif" },
    modal: { background: "#fff", borderRadius: 16, width: "min(760px,96vw)", maxHeight: "90vh", overflow: "auto", padding: 28, boxShadow: "0 32px 64px rgba(0,0,0,0.2)" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
    title: { margin: "0 0 4px", fontSize: 20, fontWeight: 600, color: "#202124" },
    sub: { margin: 0, fontSize: 13, color: "#5f6368" },
    idBadge: { fontSize: 11, fontFamily: "monospace", background: "#f1f3f4", padding: "1px 5px", borderRadius: 4, color: "#80868b" },
    closeBtn: { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#5f6368" },
    errBox: { background: "#fce8e6", border: "1px solid #f5c6c6", borderRadius: 8, padding: "10px 14px", color: "#c5221f", fontSize: 13, marginBottom: 14 },
    rowCard: { background: "#f8f9fa", borderRadius: 10, padding: 14, border: "1px solid #e8eaed" },
    field: { display: "flex", flexDirection: "column", gap: 5 },
    label: { fontSize: 11, fontWeight: 700, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.5px" },
    input: { padding: "9px 12px", border: "1.5px solid #dadce0", borderRadius: 8, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" },
    addRowBtn: { marginTop: 12, padding: "9px 16px", border: "1.5px dashed #1a73e8", borderRadius: 8, background: "transparent", color: "#1a73e8", fontSize: 13, cursor: "pointer", width: "100%", fontWeight: 500 },
    footer: { display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20, paddingTop: 16, borderTop: "1px solid #e8eaed" },
    cancelBtn: { padding: "11px 24px", border: "none", background: "transparent", color: "#1a73e8", fontSize: 14, fontWeight: 500, cursor: "pointer" },
    submitBtn: { padding: "11px 28px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" },
};