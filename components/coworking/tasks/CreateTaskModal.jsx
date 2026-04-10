/**
 * REPLACE: components/coworking/tasks/CreateTaskModal.jsx
 *
 * UI ONLY CHANGE — all logic, functions, props identical.
 * New look: professional / government-dashboard style.
 * Clean white modal, structured sections, no emoji in buttons/labels,
 * formal typography, proper field hierarchy.
 */
"use client";
import React from "react";
import { useState, useEffect, useRef } from "react";
import { createTask, listAllEmployees, uploadImage, uploadPDF } from "../../../lib/mediaUploadApi";
import DeadlineBadge from "./DeadlineBadge";
import { firebaseDb } from "../../../lib/coworkFirebase";
import { collection, doc, setDoc, updateDoc, serverTimestamp, increment } from "firebase/firestore";

// ── Empty subtask row template ────────────────────────────────────────────────
const emptySubtask = () => ({
    title: "", description: "", notes: "", dueDate: "", priority: "medium", assigneeIds: [],
});


// ── DateTimePicker — professional date+time selector ──────────────────────────
function DateTimePicker({ value, onChange, label = "Deadline", style: extraStyle = {} }) {
    // value is stored as "YYYY-MM-DDTHH:mm" (datetime-local format)
    const [showPicker, setShowPicker] = React.useState(false);
    const [date, setDate] = React.useState("");
    const [time, setTime] = React.useState("09:00");
    const pickerRef = React.useRef(null);

    // Parse incoming value
    React.useEffect(() => {
        if (value) {
            const [d, t] = value.includes("T") ? value.split("T") : [value, "09:00"];
            setDate(d || "");
            setTime(t?.slice(0, 5) || "09:00");
        } else {
            setDate(""); setTime("09:00");
        }
    }, [value]);

    // Close on outside click
    React.useEffect(() => {
        if (!showPicker) return;
        const handler = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showPicker]);

    const commit = (d, t) => {
        if (d) onChange(t ? `${d}T${t}` : d);
        else onChange("");
    };

    const clear = (e) => { e.stopPropagation(); onChange(""); setShowPicker(false); };

    // Format display
    const displayText = (() => {
        if (!value) return null;
        const dt = new Date(value);
        if (isNaN(dt.getTime())) return value;
        const dateStr = dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        const timeStr = dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
        return `${dateStr} · ${timeStr}`;
    })();

    // Quick time presets
    const TIME_PRESETS = [
        { label: "9:00 AM", value: "09:00" }, { label: "10:00 AM", value: "10:00" },
        { label: "12:00 PM", value: "12:00" }, { label: "2:00 PM", value: "14:00" },
        { label: "5:00 PM", value: "17:00" }, { label: "6:00 PM", value: "18:00" },
        { label: "EOD", value: "23:59" },
    ];

    const FONT = "'Inter','DM Sans',-apple-system,sans-serif";

    return (
        <div style={{ position: "relative", ...extraStyle }} ref={pickerRef}>
            {/* Trigger button */}
            <button type="button"
                onClick={() => setShowPicker(p => !p)}
                style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 11px", border: `1.5px solid ${showPicker ? "#3B82F6" : "#E2E8F0"}`,
                    borderRadius: 8, background: "#fff", cursor: "pointer", fontFamily: FONT,
                    boxShadow: showPicker ? "0 0 0 3px rgba(59,130,246,0.12)" : "none",
                    transition: "all 0.15s", textAlign: "left",
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={value ? "#3B82F6" : "#94A3B8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span style={{ flex: 1, fontSize: 13, color: value ? "#0F172A" : "#94A3B8", fontWeight: value ? 500 : 400 }}>
                    {displayText || "Set date & time"}
                </span>
                {value && (
                    <span onClick={clear} style={{ fontSize: 14, color: "#94A3B8", lineHeight: 1, padding: "0 2px", cursor: "pointer" }}>×</span>
                )}
            </button>

            {/* Picker dropdown */}
            {showPicker && (
                <div style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 9999,
                    background: "#fff", borderRadius: 12, padding: 16,
                    boxShadow: "0 12px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)",
                    width: 280, fontFamily: FONT,
                    animation: "dtp-pop 0.12s cubic-bezier(0.4,0,0.2,1)",
                }}>
                    <style>{`@keyframes dtp-pop { from { opacity:0; transform:translateY(-4px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>

                    {/* Date section */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Date</div>
                        <input type="date"
                            value={date}
                            min={new Date().toISOString().split("T")[0]}
                            onChange={e => { setDate(e.target.value); commit(e.target.value, time); }}
                            style={{
                                width: "100%", padding: "7px 10px", border: "1.5px solid #E2E8F0",
                                borderRadius: 7, fontSize: 13, color: "#0F172A", fontFamily: FONT,
                                outline: "none", boxSizing: "border-box", cursor: "pointer",
                            }}
                        />
                    </div>

                    {/* Time section */}
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Time</div>
                        {/* Preset buttons */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                            {TIME_PRESETS.map(p => (
                                <button key={p.value} type="button"
                                    onClick={() => { setTime(p.value); commit(date, p.value); }}
                                    style={{
                                        padding: "4px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                                        border: `1.5px solid ${time === p.value ? "#3B82F6" : "#E2E8F0"}`,
                                        background: time === p.value ? "#EFF6FF" : "#F8FAFC",
                                        color: time === p.value ? "#1D4ED8" : "#475569",
                                        cursor: "pointer", fontFamily: FONT, transition: "all 0.1s",
                                    }}>
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        {/* Manual time input */}
                        <input type="time"
                            value={time}
                            onChange={e => { setTime(e.target.value); commit(date, e.target.value); }}
                            style={{
                                width: "100%", padding: "7px 10px", border: "1.5px solid #E2E8F0",
                                borderRadius: 7, fontSize: 13, color: "#0F172A", fontFamily: FONT,
                                outline: "none", boxSizing: "border-box",
                            }}
                        />
                    </div>

                    {/* Footer */}
                    <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <button type="button" onClick={clear}
                            style={{ padding: "6px 12px", border: "1.5px solid #E2E8F0", borderRadius: 7, background: "#F8FAFC", color: "#64748B", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: FONT }}>
                            Clear
                        </button>
                        <button type="button" onClick={() => setShowPicker(false)}
                            style={{ padding: "6px 14px", border: "none", borderRadius: 7, background: "#2563EB", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CreateTaskModal({
    onClose,
    onSuccess,
    currentEmployeeId,
    currentEmployeeName,
    currentRole,
    parentTask = null,
}) {
    const isMultiMode = !!parentTask && (currentRole === "ceo" || currentRole === "tl");

    const [form, setForm] = useState({ title: "", description: "", notes: "", dueDate: "", priority: "medium" });
    const [subtaskRows, setSubtaskRows] = useState([emptySubtask()]);
    const [employees, setEmployees] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [selectedDepts, setSelectedDepts] = useState([]); // departments filter
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

    const empDisplayName = (emp) => {
        if (emp.role === "tl" && emp.department) return `${emp.name} (${emp.department} TL)`;
        if (emp.role === "tl") return `${emp.name} (TL)`;
        return emp.name;
    };

    // ── Department helpers ────────────────────────────────────────────────────
    // Collect unique departments from all loaded employees
    const allDepts = [...new Set(
        employees.map(e => e.department).filter(Boolean)
    )].sort();

    const toggleDept = (dept) =>
        setSelectedDepts(prev =>
            prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
        );

    // Employees visible in Assign To — filtered by selected departments
    // If no dept selected → show all
    const visibleEmployees = selectedDepts.length === 0
        ? employees
        : employees.filter(e => selectedDepts.includes(e.department));

    const assignedToTL = selectedIds.some(id => employees.find(e => e.employeeId === id)?.role === "tl");
    const needsApproval = currentRole === "employee" && assignedToTL;

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

    const postSubtaskNotification = async (parentTaskId, subtaskTitle, subtaskId) => {
        try {
            const messageId = crypto.randomUUID();
            const msgsRef = collection(firebaseDb, "cowork_tasks", parentTaskId, "chat");
            const taskRef = doc(firebaseDb, "cowork_tasks", parentTaskId);
            await setDoc(doc(msgsRef, messageId), {
                messageId, taskId: parentTaskId,
                senderId: currentEmployeeId,
                senderName: currentEmployeeName || "System",
                text: `Subtask "${subtaskTitle}" has been created under this task`,
                attachments: [], messageType: "system", mention: null,
                createdAt: serverTimestamp(), subtaskId,
            });
            await updateDoc(taskRef, {
                chatMessageCount: increment(1),
                lastChatAt: serverTimestamp(),
                lastChatPreview: `Subtask "${subtaskTitle}" created`,
                updatedAt: serverTimestamp(),
            });
        } catch (err) { console.error("postSubtaskNotification:", err); }
    };


    const postAttachmentsToChat = async (taskId, attachments) => {
        if (!attachments || attachments.length === 0) return;
        try {
            const messageId = crypto.randomUUID();
            const msgsRef = collection(firebaseDb, "cowork_tasks", taskId, "chat");
            const taskRef = doc(firebaseDb, "cowork_tasks", taskId);
            const cleanAttachments = attachments.map(att => ({
                url: att.url || att.fileUrl || "",
                name: att.name || "Attachment",
                type: att.type || "file",
                mimeType: att.mimeType || (att.type === "image" ? "image/jpeg" : "application/pdf"),
                originalName: att.name || "Attachment",
            }));
            await setDoc(doc(msgsRef, messageId), {
                messageId,
                taskId,
                senderId: currentEmployeeId,
                senderName: currentEmployeeName || "System",
                text: `📎 ${attachments.length} attachment${attachments.length > 1 ? "s" : ""} added at task creation`,
                attachments: cleanAttachments,
                messageType: "attachment",
                mention: null,
                createdAt: serverTimestamp(),
            });
            await updateDoc(taskRef, {
                chatMessageCount: increment(1),
                lastChatAt: serverTimestamp(),
                lastChatPreview: `📎 ${attachments.length} file${attachments.length > 1 ? "s" : ""} attached`,
                updatedAt: serverTimestamp(),
            });
        } catch (err) { console.error("postAttachmentsToChat:", err); }
    };

    // handleImagePick comes next (already in your code)

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(""); setSubmitting(true);
        try {
            if (isMultiMode) {
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
                // ← ADD THESE 3 LINES
                if (newTask?.taskId && attachments.length > 0) {
                    await postAttachmentsToChat(newTask.taskId, attachments);
                }
                onSuccess?.(newTask);
            }
        } catch (err) { setError(err.message); }
        finally { setSubmitting(false); }
    };

    const PRIORITIES = [
        { value: "low", label: "Low", color: "#166534", bg: "#F0FDF4", border: "#BBF7D0" },
        { value: "medium", label: "Medium", color: "#92400E", bg: "#FFFBEB", border: "#FDE68A" },
        { value: "high", label: "High", color: "#991B1B", bg: "#FFF1F2", border: "#FECDD3" },
    ];

    return (
        <div style={s.overlay}>
            <style>{`
                .ctm-input:focus { border-color: #2563EB !important; outline: none; box-shadow: 0 0 0 3px rgba(37,99,235,0.08); }
                .ctm-emp-btn:hover { background: #F8FAFF !important; }
                .ctm-add-row:hover { background: #EFF6FF !important; }
                .ctm-cancel:hover { background: #F3F4F6 !important; }
                .ctm-submit:hover:not(:disabled) { background: #1D4ED8 !important; }
                .ctm-remove:hover { color: #991B1B !important; }
                @keyframes ctm-in { from { opacity:0; transform:translateY(-12px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
            `}</style>

            <div style={s.modal}>
                {/* ── Modal Header ── */}
                <div style={s.modalHeader}>
                    <div style={s.headerLeft}>
                        <div style={s.headerIcon}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {parentTask
                                    ? <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>
                                    : <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>
                                }
                            </svg>
                        </div>
                        <div>
                            <h2 style={s.modalTitle}>
                                {parentTask
                                    ? (isMultiMode ? "Add Multiple Subtasks" : "Add Subtask")
                                    : "Create Task"
                                }
                            </h2>
                            {parentTask && (
                                <div style={s.modalSub}>
                                    Under: <strong style={{ color: "#1E293B" }}>{parentTask.title}</strong>
                                    <code style={s.idCode}>{parentTask.taskId}</code>
                                </div>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} style={s.closeBtn} title="Close">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* ── Approval Notice ── */}
                {needsApproval && (
                    <div style={s.noticeBox}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span>This task is assigned to a Team Lead. It will require <strong>TL approval</strong> before proceeding.</span>
                    </div>
                )}

                {/* ── Error ── */}
                {error && (
                    <div style={s.errBox}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#991B1B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 0 }}>

                    {/* ════════════════════════════════════════════════════
                        MULTI-SUBTASK MODE
                    ═══════════════════════════════════════════════════════ */}
                    {isMultiMode ? (
                        <>
                            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "55vh", overflowY: "auto", padding: "20px 24px 0" }}>
                                {subtaskRows.map((row, i) => (
                                    <div key={i} style={s.rowCard}>
                                        {/* Row header */}
                                        <div style={s.rowCardHeader}>
                                            <div style={s.rowBadge}>Subtask {i + 1}</div>
                                            {subtaskRows.length > 1 && (
                                                <button type="button" className="ctm-remove" onClick={() => removeSubtaskRow(i)} style={s.removeBtn}>
                                                    Remove
                                                </button>
                                            )}
                                        </div>

                                        <div style={s.rowGrid}>
                                            <div style={s.field}>
                                                <label style={s.label}>Title <span style={s.req}>*</span></label>
                                                <input className="ctm-input" style={s.input} value={row.title}
                                                    onChange={e => updateRow(i, "title", e.target.value)}
                                                    placeholder="Enter subtask title" />
                                            </div>
                                            <div style={s.field}>
                                                <label style={s.label}>Deadline</label>
                                                <div style={{ display: "flex", gap: 6 }}>
                                                    <input type="date" className="ctm-input" style={{ ...s.input, flex: 1 }}
                                                        value={row.dueDate ? row.dueDate.split("T")[0] : ""}
                                                        onChange={e => {
                                                            const d = e.target.value;
                                                            const t = row.dueDate?.split("T")[1] || "09:00";
                                                            updateRow(i, "dueDate", d ? `${d}T${t}` : "");
                                                        }} />
                                                    <input type="time" className="ctm-input" style={{ ...s.input, width: 90, flexShrink: 0 }}
                                                        value={row.dueDate ? (row.dueDate.split("T")[1] || "09:00") : "09:00"}
                                                        disabled={!row.dueDate}
                                                        onChange={e => {
                                                            const d = row.dueDate?.split("T")[0];
                                                            if (d) updateRow(i, "dueDate", `${d}T${e.target.value}`);
                                                        }} />
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ ...s.field, marginTop: 10 }}>
                                            <label style={s.label}>Notes</label>
                                            <textarea className="ctm-input" style={{ ...s.input, height: 52, resize: "vertical" }}
                                                value={row.notes} onChange={e => updateRow(i, "notes", e.target.value)}
                                                placeholder="Specific requirements or deliverables" />
                                        </div>

                                        <div style={{ ...s.field, marginTop: 10 }}>
                                            <label style={s.label}>Priority</label>
                                            <div style={{ display: "flex", gap: 6 }}>
                                                {PRIORITIES.map(p => (
                                                    <button key={p.value} type="button" onClick={() => updateRow(i, "priority", p.value)}
                                                        style={{
                                                            flex: 1, padding: "7px 6px",
                                                            border: `1.5px solid ${row.priority === p.value ? p.border : "#E5E7EB"}`,
                                                            borderRadius: 6,
                                                            background: row.priority === p.value ? p.bg : "#fff",
                                                            color: row.priority === p.value ? p.color : "#6B7280",
                                                            fontSize: 12, fontWeight: row.priority === p.value ? 600 : 400,
                                                            cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s",
                                                        }}>
                                                        {p.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div style={{ ...s.field, marginTop: 10 }}>
                                            <label style={s.label}>
                                                Assign to
                                                {row.assigneeIds.length > 0 && <span style={s.countBadge}>{row.assigneeIds.length} selected</span>}
                                                <span style={s.req}> *</span>
                                            </label>

                                            {/* Department filter for this row */}
                                            {allDepts.length > 0 && (
                                                <div style={{ ...s.deptSection, marginBottom: 8 }}>
                                                    <div style={s.deptLabel}>Filter by department</div>
                                                    <div style={s.deptRow}>
                                                        {allDepts.map(dept => {
                                                            // Use row's own dept filter stored in row object
                                                            const rowDepts = row._depts || [];
                                                            const active = rowDepts.includes(dept);
                                                            const empCount = employees.filter(e => e.department === dept).length;
                                                            return (
                                                                <button key={dept} type="button"
                                                                    onClick={() => updateRow(i, "_depts", active ? rowDepts.filter(d => d !== dept) : [...rowDepts, dept])}
                                                                    style={{
                                                                        display: "inline-flex", alignItems: "center", gap: 4,
                                                                        padding: "4px 9px",
                                                                        border: `1.5px solid ${active ? "#2563EB" : "#E5E7EB"}`,
                                                                        borderRadius: 5,
                                                                        background: active ? "#2563EB" : "#fff",
                                                                        color: active ? "#fff" : "#374151",
                                                                        fontSize: 11, fontWeight: active ? 600 : 400,
                                                                        cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s",
                                                                    }}>
                                                                    {dept}
                                                                    <span style={{ fontSize: 9, background: active ? "rgba(255,255,255,0.25)" : "#F3F4F6", color: active ? "#fff" : "#6B7280", borderRadius: 99, padding: "1px 5px" }}>
                                                                        {empCount}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Employees filtered by row's dept selection */}
                                            <div style={s.empGrid}>
                                                {(() => {
                                                    const rowDepts = row._depts || [];
                                                    const filtered = rowDepts.length === 0 ? employees : employees.filter(e => rowDepts.includes(e.department));
                                                    if (filtered.length === 0) return <span style={{ fontSize: 12, color: "#9CA3AF" }}>No employees in selected department(s).</span>;
                                                    return filtered.map(emp => {
                                                        const sel = row.assigneeIds.includes(emp.employeeId);
                                                        const isTL = emp.role === "tl";
                                                        return (
                                                            <button key={emp.employeeId} type="button" className="ctm-emp-btn"
                                                                onClick={() => toggleRowAssignee(i, emp.employeeId)}
                                                                style={{
                                                                    display: "flex", alignItems: "center", gap: 7,
                                                                    padding: "6px 11px",
                                                                    border: `1.5px solid ${sel ? "#2563EB" : "#E5E7EB"}`,
                                                                    borderRadius: 6,
                                                                    background: sel ? "#EFF6FF" : "#fff",
                                                                    cursor: "pointer", fontSize: 12,
                                                                    color: sel ? "#1D4ED8" : "#374151",
                                                                    fontWeight: sel ? 600 : 400,
                                                                    fontFamily: "inherit", transition: "all 0.12s",
                                                                }}>
                                                                <span style={sel ? s.avatarSel : s.avatar}>
                                                                    {emp.name?.charAt(0).toUpperCase()}
                                                                </span>
                                                                <span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                                    {empDisplayName(emp)}
                                                                </span>
                                                                {isTL && <span style={s.tlTag}>TL</span>}
                                                                {sel && (
                                                                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                                                                        <path d="M2 6l3 3 5-5" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ padding: "14px 24px 0" }}>
                                <button type="button" className="ctm-add-row" onClick={addSubtaskRow} style={s.addRowBtn}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                    Add Another Subtask
                                </button>
                            </div>
                        </>
                    ) : (
                        /* ════════════════════════════════════════════════════
                            SINGLE TASK / SUBTASK MODE
                        ═══════════════════════════════════════════════════════ */
                        <div style={{ padding: "20px 24px 0", display: "flex", flexDirection: "column", gap: 16 }}>

                            {/* Title */}
                            <div style={s.field}>
                                <label style={s.label}>
                                    Title <span style={s.req}>*</span>
                                </label>
                                <input className="ctm-input" style={s.input}
                                    value={form.title} onChange={e => set("title", e.target.value)}
                                    placeholder={parentTask ? "Enter subtask title" : "Enter task title"}
                                    autoFocus />
                            </div>

                            {/* Description */}
                            <div style={s.field}>
                                <label style={s.label}>Description</label>
                                <textarea className="ctm-input" style={{ ...s.input, height: 64, resize: "vertical" }}
                                    value={form.description} onChange={e => set("description", e.target.value)}
                                    placeholder="Brief description of what needs to be done" />
                            </div>

                            {/* Notes */}
                            <div style={s.field}>
                                <label style={s.label}>
                                    Notes / Requirements <span style={s.req}>*</span>
                                </label>
                                <textarea className="ctm-input" style={{ ...s.input, height: 72, resize: "vertical" }}
                                    value={form.notes} onChange={e => set("notes", e.target.value)}
                                    placeholder="Specific requirements, deliverables, acceptance criteria"
                                    required />
                            </div>

                            {/* Deadline + Priority */}
                            <div style={{ display: "flex", gap: 16 }}>
                                <div style={{ flex: 1, ...s.field }}>
                                    <label style={s.label}>Deadline</label>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        <input type="date" className="ctm-input" style={{ ...s.input, flex: 1 }}
                                            value={form.dueDate ? form.dueDate.split("T")[0] : ""}
                                            onChange={e => {
                                                const d = e.target.value;
                                                const t = form.dueDate?.split("T")[1] || "09:00";
                                                set("dueDate", d ? `${d}T${t}` : "");
                                            }} />
                                        <input type="time" className="ctm-input" style={{ ...s.input, width: 100, flexShrink: 0 }}
                                            value={form.dueDate ? (form.dueDate.split("T")[1] || "09:00") : "09:00"}
                                            disabled={!form.dueDate}
                                            onChange={e => {
                                                const d = form.dueDate?.split("T")[0];
                                                if (d) set("dueDate", `${d}T${e.target.value}`);
                                            }} />
                                    </div>
                                    {form.dueDate && <div style={{ marginTop: 4 }}><DeadlineBadge dueDate={form.dueDate} /></div>}
                                </div>
                                <div style={{ flex: 1, ...s.field }}>
                                    <label style={s.label}>Priority</label>
                                    <div style={{ display: "flex", gap: 6, height: 38, alignItems: "stretch" }}>
                                        {PRIORITIES.map(p => (
                                            <button key={p.value} type="button" onClick={() => set("priority", p.value)}
                                                style={{
                                                    flex: 1,
                                                    border: `1.5px solid ${form.priority === p.value ? p.border : "#E5E7EB"}`,
                                                    borderRadius: 6,
                                                    background: form.priority === p.value ? p.bg : "#fff",
                                                    color: form.priority === p.value ? p.color : "#6B7280",
                                                    fontSize: 12, fontWeight: form.priority === p.value ? 600 : 400,
                                                    cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s",
                                                }}>
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Assignees — Department filter first, then employees */}
                            <div style={s.field}>
                                <label style={s.label}>
                                    Assign to
                                    {selectedIds.length > 0 && <span style={s.countBadge}>{selectedIds.length} selected</span>}
                                    <span style={s.req}> *</span>
                                </label>

                                {/* Step 1: Department chips */}
                                {allDepts.length > 0 && (
                                    <div style={s.deptSection}>
                                        <div style={s.deptLabel}>
                                            Filter by department
                                            {selectedDepts.length > 0 && (
                                                <button type="button" onClick={() => setSelectedDepts([])} style={s.deptClearBtn}>
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                        <div style={s.deptRow}>
                                            {allDepts.map(dept => {
                                                const active = selectedDepts.includes(dept);
                                                const empCount = employees.filter(e => e.department === dept).length;
                                                return (
                                                    <button key={dept} type="button" onClick={() => toggleDept(dept)}
                                                        style={{
                                                            display: "inline-flex", alignItems: "center", gap: 5,
                                                            padding: "5px 11px",
                                                            border: `1.5px solid ${active ? "#2563EB" : "#E5E7EB"}`,
                                                            borderRadius: 5,
                                                            background: active ? "#2563EB" : "#fff",
                                                            color: active ? "#fff" : "#374151",
                                                            fontSize: 12, fontWeight: active ? 600 : 400,
                                                            cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s",
                                                        }}>
                                                        {dept}
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 600,
                                                            background: active ? "rgba(255,255,255,0.25)" : "#F3F4F6",
                                                            color: active ? "#fff" : "#6B7280",
                                                            borderRadius: 99, padding: "1px 6px",
                                                        }}>
                                                            {empCount}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Step 2: Employees of selected departments */}
                                <div style={s.empGrid}>
                                    {employees.length === 0 ? (
                                        <span style={{ fontSize: 13, color: "#9CA3AF" }}>Loading employees…</span>
                                    ) : visibleEmployees.length === 0 ? (
                                        <span style={{ fontSize: 13, color: "#9CA3AF" }}>No employees in selected department(s).</span>
                                    ) : visibleEmployees.map(emp => {
                                        const sel = selectedIds.includes(emp.employeeId);
                                        const isTL = emp.role === "tl";
                                        return (
                                            <button key={emp.employeeId} type="button" className="ctm-emp-btn"
                                                onClick={() => toggle(emp.employeeId)}
                                                style={{
                                                    display: "flex", alignItems: "center", gap: 7,
                                                    padding: "7px 12px",
                                                    border: `1.5px solid ${sel ? "#2563EB" : "#E5E7EB"}`,
                                                    borderRadius: 6,
                                                    background: sel ? "#EFF6FF" : "#fff",
                                                    cursor: "pointer", fontSize: 13,
                                                    color: sel ? "#1D4ED8" : "#374151",
                                                    fontWeight: sel ? 600 : 400,
                                                    fontFamily: "inherit", transition: "all 0.12s",
                                                }}>
                                                <span style={sel ? s.avatarSel : s.avatar}>
                                                    {emp.name?.charAt(0).toUpperCase()}
                                                </span>
                                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                                                    {empDisplayName(emp)}
                                                </span>
                                                {isTL && <span style={s.tlTag}>TL</span>}
                                                {sel && (
                                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                                                        <path d="M2 6l3 3 5-5" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Attachments */}
                            <div style={s.field}>
                                <label style={s.label}>
                                    Attachments
                                    <span style={{ fontWeight: 400, textTransform: "none", fontSize: 11, color: "#9CA3AF", marginLeft: 6 }}>
                                        Optional — visible in task chat
                                    </span>
                                </label>
                                <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImagePick} />
                                <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.rar,.7z" multiple style={{ display: "none" }} onChange={handlePdfPick} />

                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingFiles}
                                        style={s.attachBtn}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                                        </svg>
                                        Add Images
                                    </button>
                                    <button type="button" onClick={() => pdfInputRef.current?.click()} disabled={uploadingFiles}
                                        style={{ ...s.attachBtn, borderColor: "#FECDD3", color: "#9F1239" }}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                                        </svg>
                                        Add PDF
                                    </button>
                                    {uploadingFiles && (
                                        <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "ctm-spin 1s linear infinite", marginRight: 4 }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
                                            Uploading…
                                        </span>
                                    )}
                                </div>

                                {attachments.length > 0 && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                                        {attachments.map((att, idx) => (
                                            <div key={idx} style={{ position: "relative", width: 80, flexShrink: 0 }}>
                                                {att.type === "image" ? (
                                                    <img src={att.localUrl || att.url} alt={att.name}
                                                        style={{ width: "100%", height: 60, objectFit: "cover", borderRadius: 6, display: "block", border: "1px solid #E5E7EB" }} />
                                                ) : (
                                                    <div style={{ width: 80, height: 60, border: "1px solid #E5E7EB", borderRadius: 6, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, background: "#F9FAFB", padding: 4, overflow: "hidden" }}>
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                                                        </svg>
                                                        <span style={{ fontSize: 9, color: "#6B7280", textAlign: "center", lineHeight: 1.2 }}>{att.name}</span>
                                                    </div>
                                                )}
                                                <button type="button" onClick={() => removeAttachment(idx)}
                                                    style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#EF4444", color: "#fff", border: "none", cursor: "pointer", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                                                        <path d="M1 1l8 8M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Footer ── */}
                    <div style={s.footer}>
                        <button type="button" className="ctm-cancel" onClick={onClose} style={s.cancelBtn}>
                            Cancel
                        </button>
                        <button type="submit" className="ctm-submit" disabled={submitting || uploadingFiles}
                            style={{ ...s.submitBtn, opacity: (submitting || uploadingFiles) ? 0.65 : 1 }}>
                            {submitting ? (
                                <>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "ctm-spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
                                    Creating…
                                </>
                            ) : isMultiMode
                                ? `Create ${subtaskRows.filter(r => r.title.trim()).length || 1} Subtask${subtaskRows.filter(r => r.title.trim()).length !== 1 ? "s" : ""}`
                                : parentTask
                                    ? "Create Subtask"
                                    : "Create Task"
                            }
                        </button>
                    </div>

                    <style>{`@keyframes ctm-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
                </form>
            </div>
        </div>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
    // Modal shell
    overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 700, fontFamily: "'Inter','DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", backdropFilter: "blur(2px)" },
    modal: { background: "#fff", borderRadius: 10, width: "min(680px,96vw)", maxHeight: "93vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)", animation: "ctm-in 0.2s ease" },

    // Header
    modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "20px 24px 18px", borderBottom: "1px solid #E5E7EB" },
    headerLeft: { display: "flex", alignItems: "flex-start", gap: 12 },
    headerIcon: { width: 34, height: 34, borderRadius: 8, background: "#EFF6FF", border: "1px solid #BFDBFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
    modalTitle: { margin: "0 0 3px", fontSize: 16, fontWeight: 600, color: "#0F172A", letterSpacing: "-0.01em" },
    modalSub: { margin: 0, fontSize: 12, color: "#64748B" },
    idCode: { fontFamily: "monospace", background: "#F1F5F9", color: "#475569", padding: "1px 5px", borderRadius: 3, fontSize: 11, marginLeft: 4, border: "1px solid #E2E8F0" },
    closeBtn: { width: 32, height: 32, borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", flexShrink: 0, transition: "all 0.12s" },

    // Alerts
    noticeBox: { display: "flex", alignItems: "flex-start", gap: 9, margin: "14px 24px 0", padding: "10px 13px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 7, fontSize: 13, color: "#1E40AF", lineHeight: 1.5 },
    errBox: { display: "flex", alignItems: "flex-start", gap: 9, margin: "14px 24px 0", padding: "10px 13px", background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: 7, fontSize: 13, color: "#991B1B", lineHeight: 1.5 },

    // Form fields
    field: { display: "flex", flexDirection: "column", gap: 5 },
    label: { fontSize: 11, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 },
    req: { color: "#EF4444", fontWeight: 700 },
    input: { padding: "9px 12px", border: "1.5px solid #E5E7EB", borderRadius: 7, fontSize: 13, fontFamily: "inherit", color: "#1E293B", background: "#FAFAFA", boxSizing: "border-box", width: "100%", transition: "border-color 0.12s, box-shadow 0.12s" },
    countBadge: { fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 99, background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", marginLeft: 6 },

    // Assignee grid
    empGrid: { display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 160, overflowY: "auto", padding: "2px 0" },
    avatar: { width: 24, height: 24, borderRadius: 6, background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", fontSize: 11, fontWeight: 700, flexShrink: 0 },
    avatarSel: { width: 24, height: 24, borderRadius: 6, background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 },
    tlTag: { fontSize: 9, fontWeight: 700, background: "#064E3B", color: "#fff", borderRadius: 3, padding: "1px 5px", flexShrink: 0, letterSpacing: "0.03em" },

    // Multi-subtask row card
    rowCard: { background: "#F8FAFC", borderRadius: 8, padding: "14px 16px", border: "1px solid #E2E8F0" },
    rowCardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    rowBadge: { fontSize: 11, fontWeight: 700, color: "#2563EB", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 4, padding: "2px 8px", letterSpacing: "0.04em", textTransform: "uppercase" },
    removeBtn: { background: "none", border: "none", color: "#B91C1C", fontSize: 12, cursor: "pointer", fontWeight: 500, padding: 0, fontFamily: "inherit", transition: "color 0.12s" },
    rowGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
    addRowBtn: { width: "100%", padding: "9px 0", border: "1.5px dashed #BFDBFE", borderRadius: 7, background: "#fff", color: "#2563EB", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "background 0.12s" },

    // Attachments
    attachBtn: { display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", border: "1.5px dashed #BBF7D0", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#065F46", fontFamily: "inherit", transition: "background 0.12s" },

    // Department filter
    deptSection: { background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 7, padding: "10px 12px", marginBottom: 6 },
    deptLabel: { fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 7, display: "flex", alignItems: "center", justifyContent: "space-between" },
    deptClearBtn: { fontSize: 11, fontWeight: 500, color: "#2563EB", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", textDecoration: "underline" },
    deptRow: { display: "flex", flexWrap: "wrap", gap: 6 },

    // Footer
    footer: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 24px", borderTop: "1px solid #E5E7EB", marginTop: 20, background: "#FAFAFA", borderRadius: "0 0 10px 10px" },
    cancelBtn: { padding: "9px 20px", border: "1px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer", borderRadius: 6, fontFamily: "inherit", transition: "background 0.12s" },
    submitBtn: { padding: "9px 22px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 7, transition: "background 0.12s, opacity 0.12s" },
};