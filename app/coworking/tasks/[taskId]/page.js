"use client";
/**
 * GRAV-CMS/app/coworking/tasks/[taskId]/page.js
 *
 * COMPLETE task detail:
 * - LEFT: task info, breadcrumb, progress, completion status, assignees,
 *         actions (confirm/start/report/forward/submit/review),
 *         subtasks with OWN independent chat/reports,
 *         CEO: edit deadline, delete, add subtask
 * - RIGHT: TWO TABS — isolated chat (no overlap) + daily reports
 *   - Chat is SPECIFIC to this task (task_T001 chat ≠ task_T002 chat)
 *   - Reports are SPECIFIC to this task
 *   - Real-time via socket.io, room = "task_chat_<taskId>"
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useCoworkAuth } from "../../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../../components/coworking/layout/CoworkingShell";
import DeadlineBadge, { getDeadlineInfo } from "../../../../components/coworking/tasks/DeadlineBadge";
import { GwAvatar, GwStatusBadge } from "../../../../components/coworking/shared/CoworkShared";
import MediaMessageInput from "../../../../components/coworking/messaging/MediaMessageInput";
import MessageBubble from "../../../../components/coworking/messaging/MessageBubble";
import CreateTaskModal from "../../../../components/coworking/tasks/CreateTaskModal";
import EditDeadlineModal from "../../../../components/coworking/tasks/EditDeadlineModal";
import DailyReportModal from "../../../../components/coworking/tasks/DailyReportModal";
import ForwardTaskModal from "../../../../components/coworking/tasks/ForwardTaskModal";
import SubmitCompletionModal from "../../../../components/coworking/tasks/SubmitCompletionModal";
import ReviewCompletionModal from "../../../../components/coworking/tasks/ReviewCompletionModal";
import { getFullTask, deleteTask, getDailyReports, getTaskChat } from "../../../../lib/mediaUploadApi";
import { getCoworkSocket } from "../../../../lib/coworkSocket";
import { firebaseAuth } from "../../../../lib/coworkFirebase";

import { firebaseDb } from "../../../../lib/coworkFirebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";


const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function apiFetch(path, opts = {}) {
    const u = firebaseAuth.currentUser;
    if (!u) throw new Error("Not authenticated");
    const token = await u.getIdToken();
    const res = await fetch(`${BASE}${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...opts.headers } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    return data;
}

const STATUS_COLORS = {
    open: { c: "#80868b", bg: "#f1f3f4", label: "Open" },
    confirmed: { c: "#1a73e8", bg: "#e8f0fe", label: "Confirmed" },
    in_progress: { c: "#b06000", bg: "#fef7e0", label: "In Progress" },
    done: { c: "#1e8e3e", bg: "#e6f4ea", label: "Done ✓" },
};
const COMPLETION_STATUS = {
    submitted: { label: "⏳ Awaiting TL Review", c: "#b06000", bg: "#fef7e0" },
    tl_approved: { label: "✅ TL Approved · CEO Review", c: "#1a73e8", bg: "#e8f0fe" },
    tl_rejected: { label: "❌ TL Rejected", c: "#d93025", bg: "#fce8e6" },
    ceo_approved: { label: "🎉 Fully Approved · Complete!", c: "#1e8e3e", bg: "#e6f4ea" },
    ceo_rejected: { label: "❌ CEO Rejected", c: "#d93025", bg: "#fce8e6" },
};

export default function TaskDetailPage() {
    const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
    const router = useRouter();
    const { taskId } = useParams();

    const [task, setTask] = useState(null);
    const [taskLoading, setTaskLoading] = useState(true);
    const [chatMsgs, setChatMsgs] = useState([]); // THIS task's chat only
    const [reports, setReports] = useState([]);
    const [reportsLoading, setReportsLoading] = useState(false);
    const [tab, setTab] = useState("chat");
    const [activeModal, setActiveModal] = useState(null);
    const [showDelete, setShowDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);
    const messagesEndRef = useRef(null);

    const isCEO = role === "ceo";
    const isTL = role === "tl";
    const canCreate = isCEO || isTL;

    const loadTask = useCallback(async () => {
        if (!taskId) return;
        setTaskLoading(true);
        try {
            const t = await taskForwardApi.getTaskDetails(taskId); // Changed from getFullTask
            setTask(t);
            setChatMsgs(t.chatMessages || []);
        } catch (e) { console.error(e); }
        finally { setTaskLoading(false); }
    }, [taskId]);

    const loadReports = useCallback(async () => {
        if (!taskId) return;
        setReportsLoading(true);
        try {
            setReports(await taskForwardApi.getDailyReports(taskId)); // Changed from getDailyReports
        }
        catch { setReports([]); }
        finally { setReportsLoading(false); }
    }, [taskId]);

    useEffect(() => { if (!loading && !user) router.push("/coworking-login"); }, [user, loading]);
    useEffect(() => { loadTask(); }, [loadTask]);
    useEffect(() => { if (tab === "reports") loadReports(); }, [tab, loadReports]);

    // Socket — join room "task_chat_T001" — ISOLATED from other tasks
    useEffect(() => {
        if (!taskId || !employeeId) return;
        const socket = getCoworkSocket(employeeId);

        const handler = ({ taskId: tid, message }) => {
            if (tid === taskId) {
                setChatMsgs(prev => prev.find(m => m.messageId === message.messageId) ? prev : [...prev, message]);
            }
        };

        socket.on("task_chat_message", handler);
        return () => socket.off("task_chat_message", handler);
    }, [taskId, employeeId]);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);

    const handleAction = async (type, targetId) => {
        if (type === "add_subtask") { setActiveModal({ type: "add_subtask", taskId: targetId || taskId }); return; }
        if (["forward", "report", "submit_completion", "review_completion", "ceo_review"].includes(type)) {
            setActiveModal({ type, taskId: targetId || taskId }); return;
        }
        setActionBusy(true);
        try {
            if (type === "confirm") await apiFetch(`/cowork/task/${targetId || taskId}/confirm`, { method: "POST" });
            if (type === "start") await apiFetch(`/cowork/task/${targetId || taskId}/start`, { method: "POST" });
            await loadTask();
        } catch (err) { alert(err.message); }
        finally { setActionBusy(false); }
    };

    const handleSendChat = async (text, attachments, messageType) => {
        const tempId = "temp_" + Date.now();
        setChatMsgs(prev => [...prev, {
            messageId: tempId, senderId: employeeId, senderName: employeeName,
            text, attachments, messageType, temp: true, createdAt: new Date().toISOString(),
        }]);

        try {
            // Write directly to Firestore
            const chatRef = collection(firebaseDb, "cowork_tasks", taskId, "chat");
            await addDoc(chatRef, {
                text,
                attachments: attachments || [],
                messageType: messageType || "text",
                senderId: employeeId,
                senderName: employeeName,
                createdAt: serverTimestamp(),
                taskId: taskId
            });

            // Remove the temporary message
            setChatMsgs(prev => prev.filter(m => m.messageId !== tempId));
        } catch (err) {
            console.error("Failed to send message:", err);
            setChatMsgs(prev => prev.map(m => m.messageId === tempId ? { ...m, error: true, temp: false } : m));
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try { await deleteTask(taskId); router.push("/coworking/tasks"); }
        catch (err) { alert(err.message); setDeleting(false); setShowDelete(false); }
    };

    if (loading || !user) return null;

    if (taskLoading) {
        return (
            <CoworkingShell role={role} employeeName={employeeName} employeeId={employeeId} title="Task">
                <div style={s.fullCenter}><div style={s.spinner} /><p style={{ color: "#5f6368", marginTop: 12 }}>Loading task...</p></div>
            </CoworkingShell>
        );
    }

    if (!task) {
        return (
            <CoworkingShell role={role} employeeName={employeeName} employeeId={employeeId} title="Task">
                <div style={s.fullCenter}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
                    <p style={{ color: "#c5221f", fontWeight: 500 }}>Task not found</p>
                    <button onClick={() => router.push("/coworking/tasks")} style={s.backLink}>← Back to Tasks</button>
                </div>
            </CoworkingShell>
        );
    }

    const isAssignee = task.assigneeIds?.includes(employeeId);
    const isCreator = task.assignedBy === employeeId;
    const isConfirmed = task.confirmedBy?.includes(employeeId);
    const isStarted = task.status === "in_progress" || task.status === "done";
    const compBadge = task.completionStatus ? COMPLETION_STATUS[task.completionStatus] : null;
    const statusInfo = STATUS_COLORS[task.status] || STATUS_COLORS.open;

    const groupedMsgs = chatMsgs.map((msg, i) => ({
        ...msg,
        showSender: i === 0 || chatMsgs[i - 1]?.senderId !== msg.senderId,
        showAvatar: i === 0 || chatMsgs[i - 1]?.senderId !== msg.senderId,
    }));

    const getModalTask = (id) => {
        if (id === taskId) return task;
        return task.subtasks?.find(s => s.taskId === id) || task;
    };

    return (
        <CoworkingShell role={role} employeeName={employeeName} employeeId={employeeId} title="Task Details">
            <div style={s.page}>

                {/* ══ LEFT PANEL ══ */}
                <div style={s.leftPanel}>

                    {/* Task header card */}
                    <div style={s.card}>
                        {/* Back + actions */}
                        <div style={s.topRow}>
                            <button onClick={() => {
                                if (task.parentTaskId) router.push(`/coworking/tasks/${task.parentTaskId}`);
                                else router.push("/coworking/tasks");
                            }} style={s.backBtn}>
                                {task.parentTaskId ? "← Parent Task" : "← All Tasks"}
                            </button>
                            <div style={s.actionBtns}>
                                {canCreate && <button onClick={() => setActiveModal({ type: "add_subtask", taskId })} style={s.btn("blue")}>➕ Subtask</button>}
                                {isCEO && <button onClick={() => setActiveModal({ type: "deadline" })} style={s.btn("gray")}>📅 Deadline</button>}
                                {isCEO && <button onClick={() => setShowDelete(true)} style={s.btn("red")}>🗑 Delete</button>}
                            </div>
                        </div>

                        {/* Breadcrumb path */}
                        {task.path?.length > 0 && (
                            <div style={s.breadcrumb}>
                                {task.path.map((p, i) => (
                                    <span key={p.taskId} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <button onClick={() => router.push(`/coworking/tasks/${p.taskId}`)} style={s.breadcrumbBtn}>
                                            {p.title} <code style={{ fontSize: 10 }}>({p.taskId})</code>
                                        </button>
                                        {i < task.path.length - 1 && <span style={{ color: "#9aa0a6" }}>›</span>}
                                    </span>
                                ))}
                                <span style={{ color: "#9aa0a6" }}>›</span>
                                <span style={{ fontSize: 12, fontWeight: 500, color: "#202124" }}>{task.title}</span>
                            </div>
                        )}

                        {/* Badges */}
                        <div style={s.badgesRow}>
                            <code style={s.idCode}>{task.taskId}</code>
                            {task.depth > 0 && <span style={s.chip("#f1f3f4", "#80868b")}>Level {task.depth}</span>}
                            {task.isRoot && <span style={s.chip("#e8f0fe", "#1a73e8")}>Root Task</span>}
                            <span style={s.chip(statusInfo.bg, statusInfo.c)}>{statusInfo.label}</span>
                            <span style={s.chip(task.priority === "high" ? "#fce8e6" : task.priority === "medium" ? "#fef7e0" : "#e6f4ea",
                                task.priority === "high" ? "#d93025" : task.priority === "medium" ? "#b06000" : "#1e8e3e")}>
                                ⚡ {task.priority || "medium"}
                            </span>
                        </div>

                        {/* Title */}
                        <h1 style={s.taskTitle}>
                            {task.title}
                            <span style={s.titleId}> ({task.taskId})</span>
                        </h1>

                        {task.description && <p style={s.desc}>{task.description}</p>}
                        {task.notes && <div style={s.notesBox}><span>📝</span><span>{task.notes}</span></div>}

                        {/* Meta */}
                        <div style={s.metaRow}>
                            {task.dueDate && <DeadlineBadge dueDate={task.dueDate} />}
                            <span style={s.metaChip}>👤 {task.assigneeIds?.length || 0} assigned</span>
                            {task.subtaskIds?.length > 0 && <span style={s.metaChip}>📋 {task.subtaskIds.length} subtasks</span>}
                            {task.dailyReportCount > 0 && <span style={s.metaChip}>📊 {task.dailyReportCount} reports</span>}
                            {task.chatMessageCount > 0 && <span style={{ ...s.metaChip, color: "#1a73e8" }}>💬 {task.chatMessageCount} msgs</span>}
                        </div>

                        {/* Progress */}
                        {(task.progressPercent || 0) >= 0 && (
                            <div style={s.progressSection}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: "#9aa0a6", textTransform: "uppercase", letterSpacing: "0.6px" }}>Progress</span>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: task.status === "done" ? "#1e8e3e" : "#1a73e8" }}>{task.progressPercent || 0}%</span>
                                </div>
                                <div style={s.progressBg}>
                                    <div style={{ ...s.progressFill, width: `${task.progressPercent || 0}%`, background: task.status === "done" ? "#1e8e3e" : (task.progressPercent || 0) >= 50 ? "#1a73e8" : "#f9ab00" }} />
                                </div>
                            </div>
                        )}

                        {/* Completion badge */}
                        {compBadge && (
                            <div style={{ ...s.compBadge, color: compBadge.c, background: compBadge.bg }}>
                                {compBadge.label}
                                {task.completionStatus === "tl_rejected" && task.tlReview?.rejectionReason && <div style={s.rejReason}>Reason: {task.tlReview.rejectionReason}</div>}
                                {task.completionStatus === "ceo_rejected" && task.ceoReview?.rejectionReason && <div style={s.rejReason}>Reason: {task.ceoReview.rejectionReason}</div>}
                            </div>
                        )}

                        {/* Assignees */}
                        {task.assigneeDetails?.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                                <div style={s.sectionLabel}>ASSIGNEES</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {task.assigneeDetails.map(a => (
                                        <div key={a.employeeId} style={s.assigneeChip}>
                                            <GwAvatar name={a.name} size={22} />
                                            <span style={{ fontSize: 12 }}>{a.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Action buttons */}
                        <div style={s.actionSection}>
                            {isAssignee && !isConfirmed && task.status === "open" && (
                                <button disabled={actionBusy} onClick={() => handleAction("confirm")} style={s.actionBtn("confirm")}>✓ Confirm Receipt</button>
                            )}
                            {isAssignee && isConfirmed && !isStarted && (
                                <button disabled={actionBusy} onClick={() => handleAction("start")} style={s.actionBtn("start")}>▶ Start Working</button>
                            )}
                            {isAssignee && task.status === "in_progress" && (
                                <button onClick={() => setActiveModal({ type: "report", taskId })} style={s.actionBtn("report")}>📊 Submit Daily Report</button>
                            )}
                            {(isAssignee || isCreator || isTL || isCEO) && task.status !== "done" && (
                                <button onClick={() => setActiveModal({ type: "forward", taskId })} style={s.actionBtn("forward")}>↗ Forward Task</button>
                            )}
                            {isAssignee && task.status === "in_progress" && !["submitted", "tl_approved", "ceo_approved"].includes(task.completionStatus) && (
                                <button onClick={() => setActiveModal({ type: "submit_completion", taskId })} style={s.actionBtn("submit")}>📤 Submit Completed Work</button>
                            )}
                            {(isTL || isCEO) && task.completionStatus === "submitted" && (
                                <button onClick={() => setActiveModal({ type: "review_completion", taskId })} style={s.actionBtn("review")}>👁 Review Submission</button>
                            )}
                            {isCEO && task.completionStatus === "tl_approved" && (
                                <button onClick={() => setActiveModal({ type: "ceo_review", taskId })} style={s.actionBtn("approve")}>✅ CEO Final Review</button>
                            )}
                        </div>

                        {/* Deadline history */}
                        {isCEO && task.deadlineHistory?.length > 0 && (
                            <div style={s.historyBox}>
                                <div style={s.sectionLabel}>DEADLINE HISTORY</div>
                                {task.deadlineHistory.map((h, i) => (
                                    <div key={i} style={s.historyRow}>
                                        <div style={{ fontSize: 11, color: "#9aa0a6" }}>{new Date(h.editedAt).toLocaleDateString("en-IN")} · {h.editedByName}</div>
                                        <div style={{ fontSize: 12 }}>{h.oldDueDate ? new Date(h.oldDueDate).toLocaleDateString("en-IN") : "None"} → {h.newDueDate ? new Date(h.newDueDate).toLocaleDateString("en-IN") : "None"}</div>
                                        <div style={{ fontSize: 12, color: "#5f6368", fontStyle: "italic" }}>"{h.reason}"</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Subtasks card */}
                    <div style={s.card}>
                        <div style={s.cardHeader}>
                            <h3 style={s.cardTitle}>📋 Subtasks ({task.subtasks?.length || 0})</h3>
                            {canCreate && (
                                <button onClick={() => setActiveModal({ type: "add_subtask", taskId })} style={s.addBtn}>+ Add</button>
                            )}
                        </div>

                        {!task.subtasks?.length ? (
                            <div style={s.emptyState}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                                <div style={{ fontSize: 13, color: "#80868b" }}>{canCreate ? "No subtasks. Click + Add to create one." : "No subtasks assigned."}</div>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {task.subtasks.map(sub => {
                                    const subStatus = STATUS_COLORS[sub.status] || STATUS_COLORS.open;
                                    const subComp = sub.completionStatus ? COMPLETION_STATUS[sub.completionStatus] : null;
                                    const subIsAssig = sub.assigneeIds?.includes(employeeId);
                                    const subIsConf = sub.confirmedBy?.includes(employeeId);
                                    const subStarted = sub.status === "in_progress" || sub.status === "done";

                                    return (
                                        <div key={sub.taskId}
                                            style={{ background: "#f8f9fa", borderRadius: 10, padding: 14, border: "1px solid #e8eaed", cursor: "pointer" }}
                                            onClick={() => router.push(`/coworking/tasks/${sub.taskId}`)}
                                        >
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                                    <code style={{ fontSize: 10, fontFamily: "monospace", color: "#9aa0a6", background: "#e8eaed", padding: "1px 5px", borderRadius: 3 }}>{sub.taskId}</code>
                                                    <span style={{ ...s.chip(subStatus.bg, subStatus.c), fontSize: 11 }}>{subStatus.label}</span>
                                                    {sub.subtaskIds?.length > 0 && <span style={s.chip("#f3e8fd", "#9334e9")}>📋 {sub.subtaskIds.length}</span>}
                                                </div>
                                                {sub.dueDate && <DeadlineBadge dueDate={sub.dueDate} />}
                                            </div>

                                            <div style={{ fontSize: 14, fontWeight: 500, color: "#202124", marginBottom: 4 }}>
                                                {sub.title} <span style={{ fontSize: 11, color: "#9aa0a6", fontWeight: 400 }}>({sub.taskId})</span>
                                            </div>
                                            {sub.notes && <div style={{ fontSize: 12, color: "#5f6368", marginBottom: 6 }}>📝 {sub.notes}</div>}

                                            {(sub.progressPercent || 0) > 0 && (
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                                    <div style={{ flex: 1, height: 4, background: "#e8eaed", borderRadius: 2, overflow: "hidden" }}>
                                                        <div style={{ height: "100%", width: `${sub.progressPercent}%`, background: sub.status === "done" ? "#1e8e3e" : "#1a73e8", borderRadius: 2 }} />
                                                    </div>
                                                    <span style={{ fontSize: 11, color: "#5f6368", minWidth: 28 }}>{sub.progressPercent}%</span>
                                                </div>
                                            )}

                                            {subComp && (
                                                <div style={{ fontSize: 11, fontWeight: 500, color: subComp.c, background: subComp.bg, padding: "3px 8px", borderRadius: 4, marginBottom: 6, display: "inline-block" }}>{subComp.label}</div>
                                            )}

                                            {/* Subtask meta: chat + reports */}
                                            <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#9aa0a6", marginBottom: 8 }}>
                                                {sub.chatMessageCount > 0 && <span style={{ color: "#1a73e8" }}>💬 {sub.chatMessageCount} msgs (isolated)</span>}
                                                {sub.dailyReportCount > 0 && <span>📊 {sub.dailyReportCount} reports</span>}
                                            </div>

                                            {/* Subtask actions (stop propagation) */}
                                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                                                {subIsAssig && !subIsConf && sub.status === "open" && (
                                                    <button onClick={() => handleAction("confirm", sub.taskId)} style={sBtn("confirm")}>✓ Confirm</button>
                                                )}
                                                {subIsAssig && subIsConf && !subStarted && (
                                                    <button onClick={() => handleAction("start", sub.taskId)} style={sBtn("start")}>▶ Start</button>
                                                )}
                                                {subIsAssig && sub.status === "in_progress" && (
                                                    <button onClick={() => setActiveModal({ type: "report", taskId: sub.taskId })} style={sBtn("report")}>📊 Report</button>
                                                )}
                                                {(subIsAssig || isTL || isCEO) && sub.status !== "done" && (
                                                    <button onClick={() => setActiveModal({ type: "forward", taskId: sub.taskId })} style={sBtn("forward")}>↗ Forward</button>
                                                )}
                                                {canCreate && (
                                                    <button onClick={() => router.push(`/coworking/tasks/${sub.taskId}`)} style={sBtn("view")}>👁 View & Chat</button>
                                                )}
                                                {subIsAssig && sub.status === "in_progress" && !["submitted", "tl_approved", "ceo_approved"].includes(sub.completionStatus) && (
                                                    <button onClick={() => setActiveModal({ type: "submit_completion", taskId: sub.taskId })} style={sBtn("submit")}>📤 Submit</button>
                                                )}
                                                {(isTL || isCEO) && sub.completionStatus === "submitted" && (
                                                    <button onClick={() => setActiveModal({ type: "review_completion", taskId: sub.taskId })} style={sBtn("review")}>👁 Review</button>
                                                )}
                                                {isCEO && sub.completionStatus === "tl_approved" && (
                                                    <button onClick={() => setActiveModal({ type: "ceo_review", taskId: sub.taskId })} style={sBtn("approve")}>✅ Final</button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ══ RIGHT PANEL — isolated chat + reports ══ */}
                <div style={s.rightPanel}>
                    {/* Tab bar */}
                    <div style={s.tabBar}>
                        <button onClick={() => setTab("chat")} style={{ ...s.tabBtn2, ...(tab === "chat" ? s.tabActive2 : {}) }}>
                            💬 Chat <span style={s.chatNote}>(This task only)</span>
                            {chatMsgs.length > 0 && <span style={s.tabCount}>{chatMsgs.length}</span>}
                        </button>
                        <button onClick={() => setTab("reports")} style={{ ...s.tabBtn2, ...(tab === "reports" ? s.tabActive2 : {}) }}>
                            📊 Daily Reports
                            {task.dailyReportCount > 0 && <span style={s.tabCount}>{task.dailyReportCount}</span>}
                        </button>
                    </div>

                    {/* CHAT TAB — completely isolated, no overlap with other tasks */}
                    {tab === "chat" && (
                        <>
                            <div style={s.chatInfo}>
                                <span style={{ fontSize: 12, color: "#5f6368" }}>
                                    📍 <strong>{task.title} ({taskId})</strong> — chat is private to this task.
                                    {task.path?.length > 0 && (
                                        <span style={{ color: "#9aa0a6" }}> · Part of: {task.path.map(p => p.title).join(" › ")}</span>
                                    )}
                                </span>
                            </div>

                            <div style={s.chatArea}>
                                {chatMsgs.length === 0 ? (
                                    <div style={s.chatEmpty}>
                                        <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
                                        <div style={{ fontWeight: 500, color: "#202124", marginBottom: 6 }}>No messages yet in this task</div>
                                        <div style={{ fontSize: 13, color: "#80868b" }}>Messages here are isolated to <strong>{task.title} ({taskId})</strong> only.</div>
                                    </div>
                                ) : (
                                    groupedMsgs.map((msg, i) => (
                                        <MessageBubble key={msg.messageId || i} msg={msg} isMe={msg.senderId === employeeId} showSender={msg.showSender} showAvatar={msg.showAvatar} />
                                    ))
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <MediaMessageInput onSend={handleSendChat} placeholder={`Message in ${task.title} (${taskId})...`} />
                        </>
                    )}

                    {/* REPORTS TAB */}
                    {tab === "reports" && (
                        <div style={s.reportsArea}>
                            {reportsLoading ? (
                                <div style={s.chatEmpty}><div style={s.spinner} /><p>Loading reports...</p></div>
                            ) : reports.length === 0 ? (
                                <div style={s.chatEmpty}>
                                    <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                                    <div style={{ fontWeight: 500, color: "#202124", marginBottom: 6 }}>No reports for this task yet</div>
                                    {isAssignee && task.status === "in_progress" && (
                                        <button onClick={() => setActiveModal({ type: "report", taskId })} style={{ padding: "10px 20px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 500 }}>
                                            📊 Submit Daily Report
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div style={{ padding: "0 0 20px" }}>
                                    <div style={{ padding: "14px 20px 0", fontSize: 13, color: "#5f6368" }}>
                                        {reports.length} report{reports.length !== 1 ? "s" : ""} for <strong>{task.title} ({taskId})</strong>
                                    </div>
                                    {reports.map((r, i) => (
                                        <div key={r.id || i} style={s.reportCard}>
                                            <div style={s.reportHeader}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                    <GwAvatar name={r.employeeName} size={36} />
                                                    <div>
                                                        <div style={{ fontSize: 14, fontWeight: 600, color: "#202124" }}>{r.employeeName}</div>
                                                        <div style={{ fontSize: 12, color: "#9aa0a6" }}>{r.reportDate} · {new Date(r.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                                                    </div>
                                                </div>
                                                <div style={{ padding: "4px 12px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: r.progressPercent >= 100 ? "#e6f4ea" : r.progressPercent >= 50 ? "#e8f0fe" : "#fef7e0", color: r.progressPercent >= 100 ? "#1e8e3e" : r.progressPercent >= 50 ? "#1a73e8" : "#b06000" }}>
                                                    {r.progressPercent}%
                                                </div>
                                            </div>
                                            <p style={{ margin: "10px 0 0", fontSize: 14, color: "#202124", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.message}</p>
                                            {r.imageUrls?.length > 0 && (
                                                <div style={{ marginTop: 12 }}>
                                                    <div style={s.proofLabel}>📷 Proof ({r.imageUrls.length})</div>
                                                    <div style={s.proofGrid}>
                                                        {r.imageUrls.map((url, j) => (
                                                            <a key={j} href={url} target="_blank" rel="noopener noreferrer">
                                                                <img src={url} alt="" style={s.proofImg} />
                                                            </a>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {r.pdfAttachments?.length > 0 && (
                                                <div style={{ marginTop: 10 }}>
                                                    <div style={s.proofLabel}>📄 Documents ({r.pdfAttachments.length})</div>
                                                    {r.pdfAttachments.map((p, j) => (
                                                        <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8f9fa", borderRadius: 8, border: "1px solid #e8eaed", fontSize: 13, marginTop: 6 }}>
                                                            <span>📄 {p.name || "Document"}</span>
                                                            <div style={{ display: "flex", gap: 8 }}>
                                                                {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: "#1a73e8", fontSize: 12, textDecoration: "none", padding: "3px 8px", border: "1px solid #1a73e8", borderRadius: 4 }}>View ↗</a>}
                                                                {p.downloadUrl && <a href={p.downloadUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1a73e8", fontSize: 12, textDecoration: "none", padding: "3px 8px", border: "1px solid #1a73e8", borderRadius: 4 }}>Download</a>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ══ MODALS ══ */}
            {activeModal?.type === "add_subtask" && (
                <CreateTaskModal
                    parentTask={task}
                    currentEmployeeId={employeeId}
                    onClose={() => setActiveModal(null)}
                    onSuccess={() => { setActiveModal(null); loadTask(); }}
                />
            )}
            {activeModal?.type === "deadline" && (
                <EditDeadlineModal task={task} onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadTask(); }} />
            )}
            {activeModal?.type === "report" && (
                <DailyReportModal task={getModalTask(activeModal.taskId)} currentEmployeeId={employeeId} onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadTask(); if (tab === "reports") loadReports(); }} />
            )}
            {activeModal?.type === "forward" && (
                <ForwardTaskModal task={getModalTask(activeModal.taskId)} currentEmployeeId={employeeId} onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadTask(); }} />
            )}
            {activeModal?.type === "submit_completion" && (
                <SubmitCompletionModal task={getModalTask(activeModal.taskId)} currentEmployeeId={employeeId} onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadTask(); }} />
            )}
            {activeModal?.type === "review_completion" && (
                <ReviewCompletionModal task={getModalTask(activeModal.taskId)} currentEmployeeId={employeeId} role={role} reviewType="review_completion" onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadTask(); }} />
            )}
            {activeModal?.type === "ceo_review" && (
                <ReviewCompletionModal task={getModalTask(activeModal.taskId)} currentEmployeeId={employeeId} role={role} reviewType="ceo_review" onClose={() => setActiveModal(null)} onSuccess={() => { setActiveModal(null); loadTask(); }} />
            )}

            {showDelete && (
                <div style={s.overlay}>
                    <div style={s.confirmBox}>
                        <div style={{ fontSize: 48, textAlign: "center", marginBottom: 12 }}>⚠️</div>
                        <h3 style={s.confirmTitle}>Delete Task?</h3>
                        <p style={s.confirmText}>
                            Permanently delete <strong>"{task.title} ({taskId})"</strong> and ALL nested subtasks + their chats and reports?
                            <br /><span style={{ color: "#d93025" }}>Cannot be undone.</span>
                        </p>
                        <div style={s.confirmBtns}>
                            <button onClick={() => setShowDelete(false)} style={s.cancelBtn} disabled={deleting}>Cancel</button>
                            <button onClick={handleDelete} style={s.deleteBtn} disabled={deleting}>{deleting ? "Deleting..." : "Delete All"}</button>
                        </div>
                    </div>
                </div>
            )}
        </CoworkingShell>
    );
}

function sBtn(type) {
    const MAP = {
        confirm: { b: "#1a73e8", bg: "#e8f0fe", c: "#1a73e8" },
        start: { b: "#1e8e3e", bg: "#e6f4ea", c: "#1e8e3e" },
        report: { b: "#f9ab00", bg: "#fef7e0", c: "#b06000" },
        forward: { b: "#9334e9", bg: "#f3e8fd", c: "#9334e9" },
        submit: { b: "#1a73e8", bg: "#e8f0fe", c: "#1558d0" },
        review: { b: "#f9ab00", bg: "#fef7e0", c: "#b06000" },
        approve: { b: "#1e8e3e", bg: "#e6f4ea", c: "#1e8e3e" },
        view: { b: "#dadce0", bg: "#f8f9fa", c: "#5f6368" },
    };
    const m = MAP[type] || MAP.confirm;
    return { padding: "4px 10px", border: `1.5px solid ${m.b}`, borderRadius: "7px", background: m.bg, color: m.c, fontSize: "11px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
}

const s = {
    page: { display: "flex", gap: "20px", alignItems: "flex-start", minHeight: "calc(100vh - 140px)" },
    leftPanel: { width: "400px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "16px" },
    rightPanel: { flex: 1, background: "#fff", borderRadius: "16px", border: "1px solid #e8eaed", display: "flex", flexDirection: "column", overflow: "hidden", minHeight: "calc(100vh - 160px)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
    card: { background: "#fff", borderRadius: "16px", border: "1px solid #e8eaed", padding: "18px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
    fullCenter: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh" },
    spinner: { width: 36, height: 36, border: "3px solid #f3f3f3", borderTop: "3px solid #1a73e8", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto" },
    backLink: { marginTop: 16, color: "#1a73e8", background: "none", border: "none", cursor: "pointer", fontSize: 14 },
    topRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 },
    backBtn: { background: "none", border: "none", cursor: "pointer", color: "#1a73e8", fontSize: 13, fontWeight: 500, padding: 0 },
    actionBtns: { display: "flex", gap: 6, flexWrap: "wrap" },
    btn: (v) => ({ padding: "6px 12px", border: `1.5px solid ${v === "blue" ? "#1a73e8" : v === "red" ? "#d93025" : "#dadce0"}`, borderRadius: "8px", background: v === "blue" ? "#e8f0fe" : v === "red" ? "#fce8e6" : "#f8f9fa", color: v === "blue" ? "#1a73e8" : v === "red" ? "#d93025" : "#5f6368", fontSize: "12px", fontWeight: 500, cursor: "pointer" }),
    breadcrumb: { display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 12, padding: "8px 12px", background: "#f8f9fa", borderRadius: 8, border: "1px solid #e8eaed" },
    breadcrumbBtn: { background: "none", border: "none", cursor: "pointer", color: "#1a73e8", fontSize: 12, padding: 0, fontFamily: "inherit" },
    badgesRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 },
    idCode: { fontSize: 11, fontFamily: "monospace", color: "#80868b", background: "#f1f3f4", padding: "2px 7px", borderRadius: 5 },
    chip: (bg, c) => ({ fontSize: 11, fontWeight: 500, color: c, background: bg, padding: "2px 8px", borderRadius: 10, display: "inline-block" }),
    taskTitle: { margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: "#202124", lineHeight: 1.3, fontFamily: "'Google Sans',sans-serif" },
    titleId: { fontSize: 14, fontWeight: 400, color: "#9aa0a6" },
    desc: { margin: "0 0 8px", fontSize: 14, color: "#5f6368", lineHeight: 1.5 },
    notesBox: { display: "flex", gap: 8, padding: "10px 14px", background: "#f8f9fa", borderRadius: 8, border: "1px solid #e8eaed", fontSize: 13, color: "#5f6368", lineHeight: 1.5 },
    metaRow: { display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" },
    metaChip: { fontSize: 12, color: "#5f6368", background: "#f1f3f4", padding: "3px 9px", borderRadius: 10 },
    progressSection: { margin: "12px 0" },
    progressBg: { height: 8, background: "#e8eaed", borderRadius: 4, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 4, transition: "width 0.4s ease" },
    compBadge: { padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 500, margin: "10px 0" },
    rejReason: { fontSize: 12, fontWeight: 400, marginTop: 4, opacity: 0.85 },
    sectionLabel: { fontSize: 10, fontWeight: 700, color: "#9aa0a6", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 },
    assigneeChip: { display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "#f8f9fa", borderRadius: 16, border: "1px solid #e8eaed" },
    actionSection: { display: "flex", flexDirection: "column", gap: 8, marginTop: 16, paddingTop: 16, borderTop: "1px solid #f1f3f4" },
    actionBtn: (t) => {
        const M = { confirm: { bg: "#e8f0fe", c: "#1a73e8", b: "#1a73e8" }, start: { bg: "#e6f4ea", c: "#1e8e3e", b: "#1e8e3e" }, report: { bg: "#fef7e0", c: "#b06000", b: "#f9ab00" }, forward: { bg: "#f3e8fd", c: "#9334e9", b: "#9334e9" }, submit: { bg: "#e8f0fe", c: "#1558d0", b: "#1a73e8" }, review: { bg: "#fef7e0", c: "#b06000", b: "#f9ab00" }, approve: { bg: "#e6f4ea", c: "#1e8e3e", b: "#1e8e3e" } };
        const m = M[t] || M.confirm;
        return { padding: "10px 16px", border: `1.5px solid ${m.b}`, borderRadius: 10, background: m.bg, color: m.c, fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left", fontFamily: "inherit" };
    },
    historyBox: { marginTop: 14, paddingTop: 14, borderTop: "1px solid #f1f3f4" },
    historyRow: { display: "flex", flexDirection: "column", gap: 2, padding: "7px 0", borderBottom: "1px solid #f1f3f4" },
    cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    cardTitle: { margin: 0, fontSize: 15, fontWeight: 600, color: "#202124" },
    addBtn: { padding: "5px 12px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 500 },
    emptyState: { textAlign: "center", padding: 24, color: "#80868b" },
    // Right panel
    tabBar: { display: "flex", borderBottom: "2px solid #f1f3f4", flexShrink: 0 },
    tabBtn2: { padding: "14px 18px", border: "none", background: "transparent", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#5f6368", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" },
    tabActive2: { color: "#1a73e8", borderBottom: "2px solid #1a73e8", marginBottom: "-2px" },
    tabCount: { background: "#e8f0fe", color: "#1a73e8", fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 10 },
    chatNote: { fontSize: 11, color: "#9aa0a6", fontWeight: 400 },
    chatInfo: { padding: "8px 16px", background: "#fafafa", borderBottom: "1px solid #f1f3f4", flexShrink: 0 },
    chatArea: { flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 2 },
    chatEmpty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "40px 20px", color: "#5f6368" },
    reportsArea: { flex: 1, overflowY: "auto" },
    reportCard: { margin: "12px 16px 0", padding: 16, background: "#fff", borderRadius: 12, border: "1px solid #e8eaed", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" },
    reportHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
    proofLabel: { fontSize: 11, fontWeight: 600, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 },
    proofGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(80px,1fr))", gap: 8 },
    proofImg: { width: "100%", height: 80, objectFit: "cover", borderRadius: 8, cursor: "pointer", border: "1px solid #e8eaed" },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600 },
    confirmBox: { background: "#fff", borderRadius: 16, padding: 32, width: "min(440px,95vw)", boxShadow: "0 32px 64px rgba(0,0,0,0.2)", fontFamily: "'Google Sans','Roboto',sans-serif" },
    confirmTitle: { margin: "0 0 12px", fontSize: 20, fontWeight: 600, color: "#202124", textAlign: "center" },
    confirmText: { margin: "0 0 24px", fontSize: 14, color: "#5f6368", lineHeight: 1.6, textAlign: "center" },
    confirmBtns: { display: "flex", justifyContent: "center", gap: 12 },
    cancelBtn: { padding: "11px 28px", border: "1.5px solid #dadce0", background: "#fff", color: "#5f6368", borderRadius: 8, fontSize: 14, cursor: "pointer" },
    deleteBtn: { padding: "11px 28px", border: "none", background: "#d93025", color: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" },
};