/**
 * REPLACE: components/coworking/tasks/CreateTaskModal.jsx
 *
 * NEW FEATURES (all original features preserved):
 * 1. CEO can add MULTIPLE subtasks at once (add row button)
 * 2. TL names shown as "Name (Dept TL)" in assignee list
 * 3. If employee assigns to TL → shows "pending TL approval" notice
 * 4. Subtask creation posts chat notification in parent task
 * 5. Visibility: tasks labeled with createdByCeo/createdByTl for backend filtering
 */
"use client";
import { useState, useEffect, useRef } from "react";
import { createTask, listAllEmployees, uploadImage, uploadPDF } from "../../../lib/mediaUploadApi";
import DeadlineBadge from "./DeadlineBadge";
import { firebaseDb } from "../../../lib/coworkFirebase";
import { collection, doc, setDoc, updateDoc, serverTimestamp, increment } from "firebase/firestore";

// ── Empty subtask row template ────────────────────────────────────────────────
const emptySubtask = () => ({
    title: "", description: "", notes: "", dueDate: "", priority: "medium", assigneeIds: [],
});

export default function CreateTaskModal({
    onClose,
    onSuccess,
    currentEmployeeId,
    currentEmployeeName,
    currentRole, // "ceo" | "tl" | "employee"
    parentTask = null,
}) {
    // For CEO: list of subtasks to create at once
    // For non-CEO or single task: single form
    const isMultiMode = !!parentTask && (currentRole === "ceo" || currentRole === "tl");

    const [form, setForm] = useState({ title: "", description: "", notes: "", dueDate: "", priority: "medium" });
    const [subtaskRows, setSubtaskRows] = useState([emptySubtask()]);
    const [employees, setEmployees] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [attachments, setAttachments] = useState([]);
    const [uploadingFiles, setUploadingFiles] = useState(false);
    const imageInputRef = useRef(null);
    const pdfInputRef = useRef(null);

    useEffect(() => {
        listAllEmployees()
            .then(emps => setEmployees(emps.filter(e => e.employeeId !== currentEmployeeId)))
            .catch(() => { });
    }, [currentEmployeeId]);

    const toggle = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    // ── TL display name helper ────────────────────────────────────────────────
    const empDisplayName = (emp) => {
        if (emp.role === "tl" && emp.department) return `${emp.name} (${emp.department} TL)`;
        if (emp.role === "tl") return `${emp.name} (TL)`;
        return emp.name;
    };

    // ── Check if any selected assignee is TL (requires approval from employee) ──
    const assignedToTL = selectedIds.some(id => employees.find(e => e.employeeId === id)?.role === "tl");
    const needsApproval = currentRole === "employee" && assignedToTL;

    // ── Multi-subtask row management ──────────────────────────────────────────
    const addSubtaskRow = () => setSubtaskRows(prev => [...prev, emptySubtask()]);
    const removeSubtaskRow = (i) => setSubtaskRows(prev => prev.filter((_, j) => j !== i));
    const updateRow = (i, k, v) => setSubtaskRows(prev => prev.map((r, j) => j === i ? { ...r, [k]: v } : r));
    const toggleRowAssignee = (rowIdx, empId) => {
        setSubtaskRows(prev => prev.map((r, j) => {
            if (j !== rowIdx) return r;
            const has = r.assigneeIds.includes(empId);
            return { ...r, assigneeIds: has ? r.assigneeIds.filter(x => x !== empId) : [...r.assigneeIds, empId] };
        }));
    };

    // ── Post subtask notification in parent chat ──────────────────────────────
    const postSubtaskNotification = async (parentTaskId, subtaskTitle, subtaskId) => {
        try {
            const messageId = crypto.randomUUID();
            const msgsRef = collection(firebaseDb, "cowork_tasks", parentTaskId, "chat");
            const taskRef = doc(firebaseDb, "cowork_tasks", parentTaskId);
            await setDoc(doc(msgsRef, messageId), {
                messageId, taskId: parentTaskId,
                senderId: currentEmployeeId,
                senderName: currentEmployeeName || "System",
                text: `📋 Subtask "${subtaskTitle}" has been created under this task`,
                attachments: [], messageType: "system", mention: null,
                createdAt: serverTimestamp(), subtaskId,
            });
            await updateDoc(taskRef, {
                chatMessageCount: increment(1),
                lastChatAt: serverTimestamp(),
                lastChatPreview: `📋 Subtask "${subtaskTitle}" created`,
                updatedAt: serverTimestamp(),
            });
        } catch (err) { console.error("postSubtaskNotification:", err); }
    };

    // ── File upload handlers ──────────────────────────────────────────────────
    const handleImagePick = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setUploadingFiles(true); setError("");
        try {
            const results = await Promise.all(files.map(async (file) => {
                const localUrl = URL.createObjectURL(file);
                const result = await uploadImage(file, "cowork-task-attachments");
                return { type: "image", url: result.url, name: file.name, localUrl };
            }));
            setAttachments(prev => [...prev, ...results]);
        } catch (err) { setError("Image upload failed: " + err.message); }
        finally { setUploadingFiles(false); if (imageInputRef.current) imageInputRef.current.value = ""; }
    };

    const handlePdfPick = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setUploadingFiles(true); setError("");
        try {
            const results = await Promise.all(files.map(async (file) => {
                const result = await uploadPDF(file);
                return { type: "pdf", url: result.url || result.webViewLink || result.fileUrl, name: result.name || file.name };
            }));
            setAttachments(prev => [...prev, ...results]);
        } catch (err) { setError("PDF upload failed: " + err.message); }
        finally { setUploadingFiles(false); if (pdfInputRef.current) pdfInputRef.current.value = ""; }
    };

    const removeAttachment = (idx) => {
        setAttachments(prev => {
            const updated = [...prev];
            if (updated[idx]?.localUrl) URL.revokeObjectURL(updated[idx].localUrl);
            updated.splice(idx, 1);
            return updated;
        });
    };

    // ── SUBMIT ────────────────────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(""); setSubmitting(true);

        try {
            if (isMultiMode) {
                // Create multiple subtasks at once
                const validRows = subtaskRows.filter(r => r.title.trim() && r.assigneeIds.length > 0);
                if (!validRows.length) { setError("Add at least one subtask with title and assignee."); setSubmitting(false); return; }

                for (const row of validRows) {
                    const newTask = await createTask({
                        title: row.title.trim(),
                        description: row.description,
                        notes: row.notes,
                        assigneeIds: row.assigneeIds,
                        dueDate: row.dueDate || null,
                        priority: row.priority,
                        parentTaskId: parentTask?.taskId || null,
                        createdByRole: currentRole,
                        createdBy: currentEmployeeId,
                        createdByCeo: currentRole === "ceo",
                        createdByTl: currentRole === "tl",
                    });
                    if (parentTask?.taskId && newTask?.taskId) {
                        await postSubtaskNotification(parentTask.taskId, row.title.trim(), newTask.taskId);
                    }
                }
                onSuccess?.();
            } else {
                // Single task
                if (!form.title.trim()) { setError("Title is required."); setSubmitting(false); return; }
                if (!selectedIds.length) { setError("Assign to at least one person."); setSubmitting(false); return; }

                const newTask = await createTask({
                    title: form.title.trim(),
                    description: form.description,
                    notes: form.notes,
                    assigneeIds: selectedIds,
                    dueDate: form.dueDate || null,
                    priority: form.priority,
                    parentTaskId: parentTask?.taskId || null,
                    createdByRole: currentRole,
                    createdBy: currentEmployeeId,
                    createdByCeo: currentRole === "ceo" && !parentTask,
                    createdByTl: currentRole === "tl",
                    status: needsApproval ? "pending_tl_approval" : "open",
                });

                if (parentTask?.taskId && newTask?.taskId) {
                    await postSubtaskNotification(parentTask.taskId, form.title.trim(), newTask.taskId);
                }

                onSuccess?.(newTask);
            }
        } catch (err) { setError(err.message); }
        finally { setSubmitting(false); }
    };

    const PRIORITIES = [
        { value: "low", label: "🟢 Low", color: "#1e8e3e" },
        { value: "medium", label: "🟡 Medium", color: "#f9ab00" },
        { value: "high", label: "🔴 High", color: "#d93025" },
    ];

    return (
        <div style={s.overlay}>
            <div style={s.modal}>
                {/* Header */}
                <div style={s.header}>
                    <div>
                        <h2 style={s.title}>
                            {parentTask ? (isMultiMode ? "➕ Add Multiple Subtasks" : "➕ Add Subtask") : "📋 Create Task"}
                        </h2>
                        {parentTask && (
                            <p style={s.subtitle}>
                                Under: <strong>{parentTask.title}</strong>{" "}
                                <code style={s.idBadge}>({parentTask.taskId})</code>
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} style={s.closeBtn}>✕</button>
                </div>

                {/* TL Approval notice */}
                {needsApproval && (
                    <div style={s.infoBox}>
                        ℹ️ This task is assigned to a Team Lead and will require <strong>TL approval</strong> before it proceeds.
                    </div>
                )}

                {error && <div style={s.errBox}>⚠️ {error}</div>}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                    {/* ── MULTI-SUBTASK MODE (CEO/TL creating subtasks under a parent) ── */}
                    {isMultiMode ? (
                        <>
                            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "55vh", overflowY: "auto", paddingRight: 4 }}>
                                {subtaskRows.map((row, i) => (
                                    <div key={i} style={s.rowCard}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: "#1a73e8" }}>Subtask {i + 1}</span>
                                            {subtaskRows.length > 1 && (
                                                <button type="button" onClick={() => removeSubtaskRow(i)}
                                                    style={{ background: "none", border: "none", color: "#d93025", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                            <div style={{ flex: "1 1 200px", ...s.field }}>
                                                <label style={s.label}>Title *</label>
                                                <input style={s.input} value={row.title} onChange={e => updateRow(i, "title", e.target.value)}
                                                    placeholder="Subtask title..." required={i === 0} />
                                            </div>
                                            <div style={{ flex: "1 1 160px", ...s.field }}>
                                                <label style={s.label}>Deadline</label>
                                                <input type="date" style={s.input} value={row.dueDate} onChange={e => updateRow(i, "dueDate", e.target.value)} />
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 10, ...s.field }}>
                                            <label style={s.label}>Notes</label>
                                            <textarea style={{ ...s.input, height: 52, resize: "vertical" }} value={row.notes}
                                                onChange={e => updateRow(i, "notes", e.target.value)} placeholder="Specific requirements..." />
                                        </div>
                                        <div style={{ marginTop: 10, ...s.field }}>
                                            <label style={s.label}>Priority</label>
                                            <div style={{ display: "flex", gap: 5 }}>
                                                {PRIORITIES.map(p => (
                                                    <button key={p.value} type="button" onClick={() => updateRow(i, "priority", p.value)}
                                                        style={{ flex: 1, padding: "6px 4px", border: `2px solid ${row.priority === p.value ? p.color : "#e8eaed"}`, borderRadius: "7px", background: row.priority === p.value ? `${p.color}18` : "#fff", color: row.priority === p.value ? p.color : "#5f6368", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                                                        {p.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 10, ...s.field }}>
                                            <label style={s.label}>Assign to ({row.assigneeIds.length} selected) *</label>
                                            <div style={s.empGrid}>
                                                {employees.map(emp => {
                                                    const sel = row.assigneeIds.includes(emp.employeeId);
                                                    const isTL = emp.role === "tl";
                                                    return (
                                                        <button key={emp.employeeId} type="button" onClick={() => toggleRowAssignee(i, emp.employeeId)}
                                                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", border: `2px solid ${sel ? (isTL ? "#166534" : "#1a73e8") : "#e8eaed"}`, borderRadius: 20, background: sel ? (isTL ? "#f0fdf4" : "#e8f0fe") : "#fff", cursor: "pointer", fontSize: 12, color: sel ? (isTL ? "#166534" : "#1a73e8") : "#3c4043", fontWeight: sel ? 600 : 400 }}>
                                                            <span style={{ width: 22, height: 22, borderRadius: "50%", background: sel ? (isTL ? "#166534" : "#1a73e8") : "#e8eaed", display: "flex", alignItems: "center", justifyContent: "center", color: sel ? "#fff" : "#5f6368", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                                                                {emp.name?.charAt(0).toUpperCase()}
                                                            </span>
                                                            <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                                {empDisplayName(emp)}
                                                            </span>
                                                            {isTL && <span style={{ fontSize: 9, background: "#166534", color: "#fff", borderRadius: 4, padding: "1px 4px", flexShrink: 0 }}>TL</span>}
                                                            {sel && <span>✓</span>}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button type="button" onClick={addSubtaskRow} style={s.addRowBtn}>
                                + Add Another Subtask
                            </button>
                        </>
                    ) : (
                        /* ── SINGLE TASK / SUBTASK MODE ── */
                        <>
                            <div style={s.field}>
                                <label style={s.label}>Title *</label>
                                <input style={s.input} value={form.title} onChange={e => set("title", e.target.value)}
                                    placeholder={parentTask ? "Subtask title..." : "Task title..."} required autoFocus />
                            </div>

                            <div style={s.field}>
                                <label style={s.label}>Description</label>
                                <textarea style={{ ...s.input, height: "64px", resize: "vertical" }} value={form.description}
                                    onChange={e => set("description", e.target.value)} placeholder="What needs to be done..." />
                            </div>

                            <div style={s.field}>
                                <label style={s.label}>Notes / Requirements *</label>
                                <textarea style={{ ...s.input, height: "72px", resize: "vertical" }} value={form.notes}
                                    onChange={e => set("notes", e.target.value)} placeholder="Specific requirements, deliverables..." required />
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

                            {/* Assignees — TLs labeled with dept */}
                            <div style={s.field}>
                                <label style={s.label}>Assign to ({selectedIds.length} selected) *</label>
                                <div style={s.empGrid}>
                                    {employees.length === 0 ? (
                                        <span style={{ fontSize: 13, color: "#80868b" }}>Loading...</span>
                                    ) : employees.map(emp => {
                                        const sel = selectedIds.includes(emp.employeeId);
                                        const isTL = emp.role === "tl";
                                        const displayName = empDisplayName(emp);
                                        return (
                                            <button key={emp.employeeId} type="button" onClick={() => toggle(emp.employeeId)}
                                                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px", border: `2px solid ${sel ? (isTL ? "#166534" : "#1a73e8") : "#e8eaed"}`, borderRadius: "20px", background: sel ? (isTL ? "#f0fdf4" : "#e8f0fe") : "#fff", cursor: "pointer", fontSize: "13px", color: sel ? (isTL ? "#166534" : "#1a73e8") : "#3c4043", fontWeight: sel ? 500 : 400 }}>
                                                <span style={{ width: 26, height: 26, borderRadius: "50%", background: sel ? (isTL ? "#166534" : "#1a73e8") : "#e8eaed", display: "flex", alignItems: "center", justifyContent: "center", color: sel ? "#fff" : "#5f6368", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>
                                                    {emp.name?.charAt(0).toUpperCase()}
                                                </span>
                                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{displayName}</span>
                                                {isTL && <span style={{ fontSize: 10, background: "#166534", color: "#fff", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>TL</span>}
                                                {sel && <span>✓</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Attachments */}
                            <div style={s.field}>
                                <label style={s.label}>
                                    Attachments
                                    <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, color: "#80868b", marginLeft: 6 }}>
                                        (optional — shown in task chat)
                                    </span>
                                </label>
                                <input ref={imageInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" multiple style={{ display: "none" }} onChange={handleImagePick} />
                                <input ref={pdfInputRef} type="file" accept="application/pdf" multiple style={{ display: "none" }} onChange={handlePdfPick} />
                                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                                    <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingFiles}
                                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1.5px dashed #4CAF50", borderRadius: "8px", background: "transparent", cursor: "pointer", fontSize: "12px", fontWeight: 500, color: "#2e7d32" }}>
                                        📷 Add Images
                                    </button>
                                    <button type="button" onClick={() => pdfInputRef.current?.click()} disabled={uploadingFiles}
                                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1.5px dashed #F44336", borderRadius: "8px", background: "transparent", cursor: "pointer", fontSize: "12px", fontWeight: 500, color: "#c62828" }}>
                                        📄 Add PDF
                                    </button>
                                    {uploadingFiles && <span style={{ fontSize: 12, color: "#80868b" }}>Uploading...</span>}
                                </div>
                                {attachments.length > 0 && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                                        {attachments.map((att, idx) => (
                                            <div key={idx} style={{ position: "relative", width: 90, flexShrink: 0 }}>
                                                {att.type === "image" ? (
                                                    <img src={att.localUrl || att.url} alt={att.name} style={{ width: "100%", height: 68, objectFit: "cover", borderRadius: 7, display: "block" }} />
                                                ) : (
                                                    <div style={{ width: 90, height: 68, border: "1.5px solid #f5c6c6", borderRadius: 7, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, background: "#fce8e6", padding: "6px", overflow: "hidden" }}>
                                                        <span style={{ fontSize: 10, color: "#3c4043", textAlign: "center" }}>📄 {att.name}</span>
                                                    </div>
                                                )}
                                                <button type="button" onClick={() => removeAttachment(idx)}
                                                    style={{ position: "absolute", top: -7, right: -7, width: 20, height: 20, borderRadius: "50%", background: "#d93025", color: "#fff", border: "none", cursor: "pointer", fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    <div style={s.footer}>
                        <button type="button" onClick={onClose} style={s.cancelBtn}>Cancel</button>
                        <button type="submit" disabled={submitting || uploadingFiles}
                            style={{ ...s.submitBtn, opacity: (submitting || uploadingFiles) ? 0.7 : 1 }}>
                            {submitting
                                ? "Creating..."
                                : isMultiMode
                                    ? `Create ${subtaskRows.filter(r => r.title.trim()).length || 1} Subtask(s)`
                                    : parentTask
                                        ? "Create Subtask"
                                        : "Create & Assign Task"
                            }
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const s = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 700, fontFamily: "'Google Sans','Roboto',sans-serif" },
    modal: { background: "#fff", borderRadius: "16px", width: "min(700px,96vw)", maxHeight: "93vh", overflow: "auto", padding: "28px", boxShadow: "0 32px 64px rgba(0,0,0,0.2)" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px" },
    title: { margin: "0 0 4px", fontSize: "20px", fontWeight: 600, color: "#202124" },
    subtitle: { margin: 0, fontSize: "13px", color: "#5f6368" },
    idBadge: { fontFamily: "monospace", background: "#f1f3f4", padding: "1px 5px", borderRadius: "3px", fontSize: "11px" },
    closeBtn: { background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#5f6368", flexShrink: 0 },
    infoBox: { background: "#e8f0fe", border: "1px solid #c5d8f8", borderRadius: "8px", padding: "10px 14px", color: "#1a73e8", fontSize: "13px", marginBottom: "14px" },
    errBox: { background: "#fce8e6", border: "1px solid #f5c6c6", borderRadius: "8px", padding: "12px 16px", color: "#c5221f", fontSize: "13px", marginBottom: "16px" },
    field: { display: "flex", flexDirection: "column", gap: "6px" },
    label: { fontSize: "11px", fontWeight: 600, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.6px" },
    input: { padding: "10px 14px", border: "1.5px solid #dadce0", borderRadius: "8px", fontSize: "14px", fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" },
    empGrid: { display: "flex", flexWrap: "wrap", gap: "8px", maxHeight: "160px", overflowY: "auto", padding: "4px 0" },
    footer: { display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "20px", borderTop: "1px solid #e8eaed" },
    cancelBtn: { padding: "11px 24px", border: "none", background: "transparent", color: "#1a73e8", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
    submitBtn: { padding: "11px 28px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer" },
    rowCard: { background: "#f8f9fa", borderRadius: 10, padding: 14, border: "1px solid #e8eaed" },
    addRowBtn: { padding: "9px 16px", border: "1.5px dashed #1a73e8", borderRadius: 8, background: "transparent", color: "#1a73e8", fontSize: 13, cursor: "pointer", width: "100%", fontWeight: 500 },
};