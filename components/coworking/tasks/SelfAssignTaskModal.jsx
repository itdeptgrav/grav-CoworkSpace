/**
 * SelfAssignTaskModal.jsx — Right Slider Panel version
 */
"use client";
import { useState, useEffect, useRef } from "react";
import { createTask, listAllEmployees, listTasks } from "../../../lib/mediaUploadApi";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "../../../lib/coworkFirebase";

export default function SelfAssignTaskModal({
    onClose,
    onSuccess,
    currentEmployeeId,
    currentEmployeeName,
    currentRole,
}) {
    const [form, setForm] = useState({
        title: "",
        description: "",
        notes: "",
        requestedHours: 1,
        requestedMinutes: 0,
    });

    const [approvers, setApprovers] = useState([]);
    const [approverSearch, setApproverSearch] = useState("");
    const [selectedApprover, setSelectedApprover] = useState(null);
    const [approverOpen, setApproverOpen] = useState(false);
    const approverRef = useRef(null);

    const [allRootTasks, setAllRootTasks] = useState([]);
    const [taskSearch, setTaskSearch] = useState("");
    const [selectedParent, setSelectedParent] = useState(null);
    const [taskOpen, setTaskOpen] = useState(false);
    const taskRef = useRef(null);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [loadingData, setLoadingData] = useState(true);
    const [visible, setVisible] = useState(false);

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    // Animate in on mount
    useEffect(() => {
        requestAnimationFrame(() => setVisible(true));
    }, []);

    const handleClose = () => {
        setVisible(false);
        setTimeout(onClose, 300);
    };

    useEffect(() => {
        Promise.all([listAllEmployees(), listTasks()])
            .then(([emps, taskResult]) => {
                const eligible = emps.filter(
                    e => (e.role === "tl" || e.role === "ceo") && e.employeeId !== currentEmployeeId
                );
                setApprovers(eligible);
                const roots = (taskResult.tasks || []).filter(t =>
                    !t.parentTaskId && !t.isFolder && (
                        (t.assigneeIds || []).includes(currentEmployeeId) ||
                        t.assignedBy === currentEmployeeId ||
                        t.createdBy === currentEmployeeId
                    )
                );
                setAllRootTasks(roots);
            })
            .catch(e => console.error("[SelfAssignTaskModal] load error:", e.message))
            .finally(() => setLoadingData(false));
    }, [currentEmployeeId]);
    useEffect(() => {
        const handler = (e) => {
            if (approverRef.current && !approverRef.current.contains(e.target)) setApproverOpen(false);
            if (taskRef.current && !taskRef.current.contains(e.target)) setTaskOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Close on Escape key
    useEffect(() => {
        const handler = (e) => { if (e.key === "Escape") handleClose(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, []);

    const filteredApprovers = approvers.filter(e =>
        e.name?.toLowerCase().includes(approverSearch.toLowerCase()) ||
        e.department?.toLowerCase().includes(approverSearch.toLowerCase())
    );

    const filteredTasks = allRootTasks.filter(t =>
        t.title?.toLowerCase().includes(taskSearch.toLowerCase()) ||
        t.taskId?.toLowerCase().includes(taskSearch.toLowerCase())
    );

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (!form.title.trim()) { setError("Title is required."); return; }
        if (!selectedApprover) { setError("Select an approver (TL or CEO) who will review this task."); return; }
        const _reqSecs = (Number(form.requestedHours) || 0) * 3600 + (Number(form.requestedMinutes) || 0) * 60;
        if (_reqSecs <= 0) { setError("Enter how much time you need for this task."); return; }

        setSubmitting(true);
        try {
            const newTask = await createTask({
                title: form.title.trim(),
                description: form.description,
                notes: form.notes,
                assigneeIds: [currentEmployeeId],
                dueDate: null,
                priority: null,
                parentTaskId: selectedParent?.taskId || null,
                createdByRole: currentRole,
                createdBy: currentEmployeeId,
                createdByCeo: currentRole === "ceo",
                createdByTl: currentRole === "tl",
                status: "open",
                isFolder: false,
                hasTimer: true,
                fixedDeadline: null,
                senderTimerWindowSecs: _reqSecs,
                isRepeat: false,
                isThirdParty: false,
                isGoal: false,
                visibleTo: [selectedApprover.employeeId],
                approverId: selectedApprover.employeeId,
                approverName: selectedApprover.name,
                isSelfAssigned: true,
            });

            // Notify the approver — this self-assigned task needs their review
            try {
                await setDoc(doc(collection(firebaseDb, "cowork_notifications")), {
                    recipientEmployeeId: selectedApprover.employeeId,
                    type: "self_task_approval_needed",
                    title: "Self-assigned task needs your approval",
                    body: `${currentEmployeeName} assigned themselves "${form.title.trim()}" and needs your review.`,
                    data: {
                        taskId: newTask?.taskId || null,
                        taskTitle: form.title.trim(),
                        requesterId: currentEmployeeId,
                        requesterName: currentEmployeeName,
                    },
                    read: false,
                    createdAt: serverTimestamp(),
                });
            } catch (notifErr) {
                console.error("[SelfAssignTaskModal] notify approver failed:", notifErr.message);
            }

            onSuccess?.(newTask);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <style>{`
                .sam-input:focus { border-color: #7C3AED !important; outline: none; box-shadow: 0 0 0 3px rgba(124,58,237,0.09); }
                .sam-cancel:hover { background: #F3F4F6 !important; }
                .sam-submit:hover:not(:disabled) { background: #6D28D9 !important; }
                .sam-dd-item:hover { background: #F5F3FF !important; }
                .sam-overlay { transition: opacity 0.3s ease; }
                .sam-panel { transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
                @keyframes sam-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
            `}</style>

            {/* Backdrop */}
            <div
                className="sam-overlay"
                onClick={handleClose}
                style={{
                    position: "fixed", inset: 0,
                    background: "rgba(15,23,42,0.4)",
                    zIndex: 700,
                    backdropFilter: "blur(2px)",
                    opacity: visible ? 1 : 0,
                }}
            />

            {/* Right Slider Panel */}
            <div
                className="sam-panel"
                style={{
                    position: "fixed",
                    top: 0, right: 0, bottom: 0,
                    width: "min(520px, 100vw)",
                    background: "#fff",
                    zIndex: 701,
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "-8px 0 40px rgba(0,0,0,0.15)",
                    fontFamily: "'Inter','DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
                    transform: visible ? "translateX(0)" : "translateX(100%)",
                    overflowY: "hidden",
                }}
            >
                {/* ── Header ── */}
                <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                    padding: "20px 24px 16px",
                    borderBottom: "1px solid #E5E7EB",
                    flexShrink: 0,
                    background: "#fff",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 9,
                            background: "#F5F3FF", border: "1px solid #DDD6FE",
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                                <polyline points="16 11 18 13 22 9" />
                            </svg>
                        </div>
                        <div>
                            <h2 style={{ margin: "0 0 3px", fontSize: 16, fontWeight: 600, color: "#0F172A", letterSpacing: "-0.01em" }}>
                                Assign to Myself
                            </h2>
                            <p style={{ margin: 0, fontSize: 12, color: "#64748B" }}>
                                Assigned to <strong style={{ color: "#7C3AED" }}>{currentEmployeeName}</strong>
                            </p>
                        </div>
                    </div>
                    <button onClick={handleClose} style={{
                        width: 32, height: 32, borderRadius: 7, border: "1px solid #E5E7EB",
                        background: "#fff", cursor: "pointer", display: "flex",
                        alignItems: "center", justifyContent: "center", color: "#6B7280", flexShrink: 0,
                    }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* ── Scrollable body ── */}
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>

                    {/* Info pill */}
                    <div style={{
                        display: "flex", alignItems: "flex-start", gap: 8,
                        padding: "9px 12px", marginBottom: 16,
                        background: "#F5F3FF", border: "1px solid #DDD6FE",
                        borderRadius: 7, fontSize: 12, color: "#5B21B6", lineHeight: 1.5,
                    }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span>Task assigned to you. The selected approver will review and approve before work begins.</span>
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{
                            display: "flex", alignItems: "flex-start", gap: 8,
                            padding: "9px 12px", marginBottom: 14,
                            background: "#FFF1F2", border: "1px solid #FECDD3",
                            borderRadius: 7, fontSize: 12, color: "#991B1B", lineHeight: 1.5,
                        }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#991B1B" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                        {/* Title */}
                        <div style={s.field}>
                            <label style={s.label}>Title <span style={s.req}>*</span></label>
                            <input
                                className="sam-input" style={s.input}
                                value={form.title}
                                onChange={e => set("title", e.target.value)}
                                placeholder="What needs to be done?"
                                autoFocus
                            />
                        </div>

                        {/* Description */}
                        <div style={s.field}>
                            <label style={s.label}>Description</label>
                            <textarea
                                className="sam-input" style={{ ...s.input, height: 64, resize: "vertical" }}
                                value={form.description}
                                onChange={e => set("description", e.target.value)}
                                placeholder="Brief description of what needs to be done"
                            />
                        </div>

                        {/* Notes */}
                        <div style={s.field}>
                            <label style={s.label}>Notes / Requirements</label>
                            <textarea
                                className="sam-input" style={{ ...s.input, height: 68, resize: "vertical" }}
                                value={form.notes}
                                onChange={e => set("notes", e.target.value)}
                                placeholder="Specific requirements, deliverables, acceptance criteria"
                            />
                        </div>

                        {/* Approver */}
                        <div style={s.field} ref={approverRef}>
                            <label style={s.label}>
                                Approver — Visible To <span style={s.req}>*</span>
                                <span style={{ fontSize: 10, fontWeight: 400, color: "#9CA3AF", marginLeft: 4, textTransform: "none" }}>TL or CEO only</span>
                            </label>

                            {selectedApprover ? (
                                <div style={s.selectedPill}>
                                    <span style={s.pillAvatar}>{selectedApprover.name?.charAt(0).toUpperCase()}</span>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: "#5B21B6" }}>{selectedApprover.name}</span>
                                    <span style={s.pillRole}>{selectedApprover.role?.toUpperCase()}</span>
                                    {selectedApprover.department && (
                                        <span style={{ fontSize: 11, color: "#7C3AED", marginLeft: 2 }}>· {selectedApprover.department}</span>
                                    )}
                                    <button type="button" onClick={() => { setSelectedApprover(null); setApproverSearch(""); }} style={s.pillClear}>
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="#7C3AED" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                    </button>
                                </div>
                            ) : (
                                <div style={{ position: "relative" }}>
                                    <input
                                        className="sam-input"
                                        style={{ ...s.input, paddingLeft: 34 }}
                                        placeholder={loadingData ? "Loading..." : "Search TL or CEO by name..."}
                                        value={approverSearch}
                                        onChange={e => { setApproverSearch(e.target.value); setApproverOpen(true); }}
                                        onFocus={() => setApproverOpen(true)}
                                        disabled={loadingData}
                                    />
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                    {approverOpen && filteredApprovers.length > 0 && (
                                        <div style={s.dropdown}>
                                            {filteredApprovers.map(emp => (
                                                <div key={emp.employeeId} className="sam-dd-item" style={s.ddItem}
                                                    onMouseDown={() => { setSelectedApprover(emp); setApproverSearch(""); setApproverOpen(false); }}>
                                                    <span style={s.ddAvatar}>{emp.name?.charAt(0).toUpperCase()}</span>
                                                    <span style={{ fontSize: 13, color: "#1E293B", fontWeight: 500 }}>{emp.name}</span>
                                                    <span style={{ ...s.pillRole, marginLeft: "auto" }}>{emp.role?.toUpperCase()}</span>
                                                    {emp.department && <span style={{ fontSize: 11, color: "#94A3B8" }}>{emp.department}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {approverOpen && !loadingData && filteredApprovers.length === 0 && (
                                        <div style={{ ...s.dropdown, padding: "10px 12px", fontSize: 12, color: "#9CA3AF" }}>No TL or CEO found</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Parent Task */}
                        <div style={s.field} ref={taskRef}>
                            <label style={s.label}>
                                Under Task
                                <span style={{ fontSize: 10, fontWeight: 400, color: "#9CA3AF", marginLeft: 4, textTransform: "none" }}>Optional — appears as subtask</span>
                            </label>

                            {selectedParent ? (
                                <div style={{ ...s.selectedPill, borderColor: "#CBD5E1", background: "#F8FAFC" }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: "#334155", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedParent.title}</span>
                                    <span style={{ fontSize: 10, color: "#94A3B8", fontFamily: "monospace", flexShrink: 0 }}>{selectedParent.taskId}</span>
                                    <button type="button" onClick={() => { setSelectedParent(null); setTaskSearch(""); }} style={{ ...s.pillClear, marginLeft: 4 }}>
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                    </button>
                                </div>
                            ) : (
                                <div style={{ position: "relative" }}>
                                    <input
                                        className="sam-input"
                                        style={{ ...s.input, paddingLeft: 34 }}
                                        placeholder={loadingData ? "Loading..." : "Search tasks by title..."}
                                        value={taskSearch}
                                        onChange={e => { setTaskSearch(e.target.value); setTaskOpen(true); }}
                                        onFocus={() => setTaskOpen(true)}
                                        disabled={loadingData}
                                    />
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                    {taskOpen && filteredTasks.length > 0 && (
                                        <div style={s.dropdown}>
                                            {filteredTasks.slice(0, 8).map(t => (
                                                <div key={t.taskId} className="sam-dd-item" style={s.ddItem}
                                                    onMouseDown={() => { setSelectedParent(t); setTaskSearch(""); setTaskOpen(false); }}>
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>
                                                    <span style={{ fontSize: 13, color: "#1E293B", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                                                    <span style={{ fontSize: 10, color: "#94A3B8", fontFamily: "monospace", flexShrink: 0 }}>{t.taskId}</span>
                                                </div>
                                            ))}
                                            {filteredTasks.length > 8 && (
                                                <div style={{ padding: "6px 12px", fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>
                                                    +{filteredTasks.length - 8} more — type to narrow
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {taskOpen && !loadingData && taskSearch && filteredTasks.length === 0 && (
                                        <div style={{ ...s.dropdown, padding: "10px 12px", fontSize: 12, color: "#9CA3AF" }}>No tasks found</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Timer duration — self-tasks are always timer-based, no fixed-deadline option */}
                        <div style={s.field}>
                            <label style={s.label}>⏱ Time Tracking</label>
                            <p style={{ fontSize: 11, color: "#6B7280", margin: "0 0 10px", lineHeight: 1.5 }}>
                                You'll set how much time you need below — your approver reviews it when confirming.
                            </p>

                            <div>
                                <label style={{ ...s.label, marginBottom: 4 }}>How much time do you need? <span style={s.req}>*</span></label>
                                <div style={{ display: "flex", gap: 10 }}>
                                    <div style={{ flex: 1 }}>
                                        <input
                                            className="sam-input" style={s.input}
                                            type="number" min={0} max={99}
                                            value={form.requestedHours}
                                            onChange={e => set("requestedHours", Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
                                        />
                                        <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>hours</div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <input
                                            className="sam-input" style={s.input}
                                            type="number" min={0} max={59} step={5}
                                            value={form.requestedMinutes}
                                            onChange={e => set("requestedMinutes", Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                                        />
                                        <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>minutes</div>
                                    </div>
                                </div>
                                <p style={{ fontSize: 11, color: "#6B7280", margin: "6px 0 0", lineHeight: 1.5 }}>
                                    This is what you're requesting — your approver reviews it when confirming the task.
                                </p>
                            </div>
                        </div>

                        {/* Spacer so content isn't hidden behind footer */}
                        <div style={{ height: 8 }} />
                    </form>
                </div>

                {/* ── Sticky Footer ── */}
                <div style={{
                    display: "flex", justifyContent: "flex-end", gap: 10,
                    padding: "14px 24px",
                    borderTop: "1px solid #E5E7EB",
                    background: "#FAFAFA",
                    flexShrink: 0,
                }}>
                    <button type="button" className="sam-cancel" onClick={handleClose} style={{
                        padding: "9px 20px", border: "1px solid #E5E7EB", background: "#fff",
                        color: "#374151", fontSize: 13, fontWeight: 500,
                        cursor: "pointer", borderRadius: 6, fontFamily: "inherit", transition: "background 0.12s",
                    }}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="sam-submit"
                        disabled={submitting || loadingData}
                        onClick={handleSubmit}
                        style={{
                            padding: "9px 22px", background: "#7C3AED", color: "#fff",
                            border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600,
                            cursor: "pointer", fontFamily: "inherit",
                            display: "flex", alignItems: "center", gap: 7,
                            transition: "background 0.12s, opacity 0.12s",
                            opacity: (submitting || loadingData) ? 0.65 : 1,
                        }}
                    >
                        {submitting ? (
                            <>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "sam-spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
                                Creating…
                            </>
                        ) : (
                            <>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                                Assign to Myself
                            </>
                        )}
                    </button>
                </div>
            </div>
        </>
    );
}

const s = {
    field: { display: "flex", flexDirection: "column", gap: 5 },
    label: {
        fontSize: 11, fontWeight: 600, color: "#374151",
        textTransform: "uppercase", letterSpacing: "0.05em",
        display: "flex", alignItems: "center", gap: 4,
    },
    req: { color: "#EF4444", fontWeight: 700 },
    input: {
        padding: "9px 12px", border: "1.5px solid #E5E7EB", borderRadius: 7,
        fontSize: 13, fontFamily: "inherit", color: "#1E293B",
        background: "#FAFAFA", boxSizing: "border-box", width: "100%",
        transition: "border-color 0.12s, box-shadow 0.12s",
    },
    selectedPill: {
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", borderRadius: 8,
        border: "1.5px solid #DDD6FE", background: "#F5F3FF",
    },
    pillAvatar: {
        width: 24, height: 24, borderRadius: 6,
        background: "#7C3AED", color: "#fff",
        fontSize: 11, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
    pillRole: {
        fontSize: 9, fontWeight: 700, background: "#7C3AED", color: "#fff",
        borderRadius: 3, padding: "1px 5px", flexShrink: 0, letterSpacing: "0.03em",
    },
    pillClear: {
        marginLeft: "auto", background: "none", border: "none",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, padding: 2,
    },
    dropdown: {
        position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
        background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.1)", zIndex: 50,
        maxHeight: 200, overflowY: "auto",
    },
    ddItem: {
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", cursor: "pointer",
        borderBottom: "1px solid #F1F5F9", transition: "background 0.1s",
    },
    ddAvatar: {
        width: 24, height: 24, borderRadius: 6,
        background: "#E5E7EB", color: "#374151",
        fontSize: 11, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
};