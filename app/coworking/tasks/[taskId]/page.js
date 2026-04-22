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
import { taskForwardApi } from "../../../../lib/taskForwardApi";
import { getCoworkSocket } from "../../../../lib/coworkSocket";
import { firebaseAuth } from "../../../../lib/coworkFirebase";

import { firebaseDb } from "../../../../lib/coworkFirebase";
import { collection, doc, setDoc, addDoc, updateDoc, onSnapshot, query, orderBy, limit, serverTimestamp, increment } from "firebase/firestore";
import { computeLiveDeadline, fmtLiveDeadlineDateTime } from "../../../../lib/tasksPageHelpers";


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
    pending_deadline_approval: { c: "#b06000", bg: "#fef7e0", label: "⏳ Deadline Pending" },
    deadline_approved: { c: "#059669", bg: "#ECFDF5", label: "✓ Deadline Approved" },
    confirmed: { c: "#1a73e8", bg: "#e8f0fe", label: "Confirmed" },
    in_progress: { c: "#b06000", bg: "#fef7e0", label: "In Progress" },
    done: { c: "#1e8e3e", bg: "#e6f4ea", label: "Done ✓" },
};
// Helper for numeric priority display (1–10)
function getPriChip(priority) {
    const n = typeof priority === "number" ? priority : Number(priority);
    if (!isNaN(n) && n > 0) {
        const c = n >= 8 ? "#d93025" : n >= 5 ? "#b06000" : "#1e8e3e";
        const bg = n >= 8 ? "#fce8e6" : n >= 5 ? "#fef7e0" : "#e6f4ea";
        return { c, bg, label: `P${n}` };
    }
    // Fallback for legacy string priorities
    const map = { high: { c: "#d93025", bg: "#fce8e6", label: "High" }, medium: { c: "#b06000", bg: "#fef7e0", label: "Medium" }, low: { c: "#1e8e3e", bg: "#e6f4ea", label: "Low" } };
    return map[priority] || map.medium;
}
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
    const [chatMsgs, setChatMsgs] = useState([]);
    const [draftMsgs, setDraftMsgs] = useState([]);
    const [reports, setReports] = useState([]);
    const [reportsLoading, setReportsLoading] = useState(false);
    const [tab, setTab] = useState("chat"); // "chat" | "reports"
    const [chatTab, setChatTab] = useState("draft"); // "draft" | "normal"
    const [activeModal, setActiveModal] = useState(null);
    const [showDelete, setShowDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);
    // ── Live timer session for deadline sync ───────────────────────────────
    // Subscribed to the ASSIGNEE's Firestore timer session for this task so
    // both the CEO/TL (viewing this page) and the employee compute the same
    // wall-clock deadline via computeLiveDeadline(). Without this, the CEO side
    // falls back to stale task.dueDate and shows a time a few minutes off from
    // the employee's running timer.
    const [timerSession, setTimerSession] = useState(null);
    // Deadline proposal state
    const [propDate, setPropDate] = useState("");
    const [propTime, setPropTime] = useState("09:00");
    const [proposing, setProposing] = useState(false);
    const [propError, setPropError] = useState("");
    // Deadline approval state (for creator)
    const [approving, setApproving] = useState(false);
    const [rejectReason, setRejectReason] = useState("");
    const [showRejectInput, setShowRejectInput] = useState(false);
    // Draft chat send state
    const [draftText, setDraftText] = useState("");
    const [sendingDraft, setSendingDraft] = useState(false);
    const messagesEndRef = useRef(null);
    const draftEndRef = useRef(null);

    const isCEO = role === "ceo";
    const isTL = role === "tl";
    const canCreate = isCEO || isTL;

    const loadTask = useCallback(async () => {
        if (!taskId) return;
        setTaskLoading(true);
        try {
            const data = await taskForwardApi.getTaskDetails(taskId);
            const t = data.task || data;
            setTask(t);
            setChatMsgs(t.chatMessages || []);
            setDraftMsgs(t.draftChatMessages || []);
            // Auto-select chat tab: normal if task is post-confirmation, draft otherwise
            const isPostConfirm = ["confirmed", "in_progress", "done"].includes(t.status);
            setChatTab(isPostConfirm ? "normal" : "draft");
        } catch (e) { console.error(e); }
        finally { setTaskLoading(false); }
    }, [taskId]);

    const loadReports = useCallback(async () => {
        if (!taskId) return;
        setReportsLoading(true);
        try {
            const data = await taskForwardApi.getDailyReports(taskId);
            setReports(data.reports || data || []);
        }
        catch { setReports([]); }
        finally { setReportsLoading(false); }
    }, [taskId]);

    useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading]);
    useEffect(() => { loadTask(); }, [loadTask]);
    useEffect(() => { if (tab === "reports") loadReports(); }, [tab, loadReports]);

    // Socket — normal task chat
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

    // Firestore real-time listener for draft_chat — gives both users live updates
    useEffect(() => {
        if (!taskId || !employeeId) return;
        // Firestore onSnapshot is the primary source for draft messages
        const draftRef = collection(firebaseDb, "cowork_tasks", taskId, "draft_chat");
        const draftQ = query(draftRef, orderBy("createdAt", "asc"), limit(100));
        const unsubDraft = onSnapshot(draftQ, snap => {
            const msgs = snap.docs.map(d => ({
                ...d.data(), id: d.id,
                createdAt: d.data().createdAt?.seconds
                    ? new Date(d.data().createdAt.seconds * 1000).toISOString()
                    : (d.data().createdAt || new Date().toISOString()),
                temp: false,
            }));
            setDraftMsgs(msgs);
        }, err => console.error("draft_chat listener:", err));

        // Socket — deadline status changes to reload task
        const socket = getCoworkSocket(employeeId);
        const deadlineApprovedHandler = ({ taskId: tid }) => { if (tid === taskId) loadTask(); };
        const deadlineProposedHandler = ({ taskId: tid }) => { if (tid === taskId) loadTask(); };
        const deadlineRejectedHandler = ({ taskId: tid }) => { if (tid === taskId) loadTask(); };
        socket.on("deadline_approved", deadlineApprovedHandler);
        socket.on("deadline_proposed", deadlineProposedHandler);
        socket.on("deadline_rejected", deadlineRejectedHandler);

        return () => {
            unsubDraft();
            socket.off("deadline_approved", deadlineApprovedHandler);
            socket.off("deadline_proposed", deadlineProposedHandler);
            socket.off("deadline_rejected", deadlineRejectedHandler);
        };
    }, [taskId, employeeId, loadTask]);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);
    useEffect(() => { draftEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [draftMsgs]);

    // ── Live timer session subscription ───────────────────────────────────
    // Subscribes to cowork_task_timers/{assigneeId}/sessions/{taskId} so the
    // deadline math reflects the CURRENT running timer state (lastStartTime,
    // totalSeconds, isActive, updatedAt) instead of falling back to the stale
    // task.dueDate wall-clock value. When task has multiple assignees we pick
    // the FIRST one since they're the primary worker in the current model.
    useEffect(() => {
        const assigneeId = task?.assigneeIds?.[0];
        if (!taskId || !assigneeId) { setTimerSession(null); return; }
        const ref = doc(firebaseDb, "cowork_task_timers", assigneeId, "sessions", taskId);
        const unsub = onSnapshot(ref, snap => {
            if (snap.exists()) {
                setTimerSession(snap.data());
            } else {
                setTimerSession(null);
            }
        }, err => {
            console.warn("timer session listener:", err.message);
            setTimerSession(null);
        });
        return () => unsub();
    }, [taskId, task?.assigneeIds]);

    // ── Propose deadline (employee sets date+time, submits for approval) ─────
    const handleProposeDeadline = async () => {
        if (!propDate) { setPropError("Please select a date."); return; }
        setPropError("");
        setProposing(true);
        try {
            const proposedDate = `${propDate}T${propTime || "09:00"}`;
            // Get current worked seconds from timer sessions in Firestore
            const timerRef = collection(firebaseDb, "cowork_task_timers", employeeId, "sessions");
            const timerSnap = await import("firebase/firestore").then(fb => fb.getDocs(timerRef));
            const sess = timerSnap.docs.find(d => d.id === taskId);
            const workedSecs = sess ? (sess.data().totalSeconds || 0) : 0;
            await taskForwardApi.proposeDeadline(taskId, proposedDate, workedSecs);
            await loadTask();
        } catch (err) { setPropError(err.message); }
        finally { setProposing(false); }
    };

    // ── Approve or reject deadline (task creator only) ────────────────────────
    const handleApproveDeadline = async (approved) => {
        if (!approved && !rejectReason.trim()) {
            setShowRejectInput(true);
            return;
        }
        setApproving(true);
        try {
            await taskForwardApi.approveDeadline(taskId, approved, rejectReason.trim());
            setRejectReason("");
            setShowRejectInput(false);
            await loadTask();
        } catch (err) { alert(err.message); }
        finally { setApproving(false); }
    };

    // ── Send draft chat message ───────────────────────────────────────────────
    const handleSendDraftChat = async () => {
        const text = draftText.trim();
        if (!text) return;
        const tempId = "temp_draft_" + Date.now();
        setDraftMsgs(prev => [...prev, {
            messageId: tempId, senderId: employeeId, senderName: employeeName,
            text, messageType: "text", temp: true, createdAt: new Date().toISOString(),
        }]);
        setDraftText("");
        setSendingDraft(true);
        try {
            // Write directly to Firestore — onSnapshot gives real-time to both users
            const messageId = crypto.randomUUID();
            const draftRef = collection(firebaseDb, "cowork_tasks", taskId, "draft_chat");
            await setDoc(doc(draftRef, messageId), {
                messageId, taskId,
                senderId: employeeId, senderName: employeeName,
                text, messageType: "text",
                createdAt: serverTimestamp(),
            });
            await updateDoc(doc(firebaseDb, "cowork_tasks", taskId), {
                draftChatMessageCount: increment(1),
                updatedAt: serverTimestamp(),
            });
            setDraftMsgs(prev => prev.filter(m => m.messageId !== tempId));
        } catch (err) {
            console.error("draft send:", err);
            setDraftMsgs(prev => prev.map(m => m.messageId === tempId ? { ...m, error: true, temp: false } : m));
        }
        finally { setSendingDraft(false); }
    };

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
                            {(() => {
                                const pc = getPriChip(task.priority); return (
                                    <span style={s.chip(pc.bg, pc.c)}>⚡ {pc.label}</span>
                                );
                            })()}
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
                                            <GwAvatar name={a.name} size={22} url={a.profilePicUrl || ""} />
                                            <span style={{ fontSize: 12 }}>{a.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── DEADLINE STEP-FLOW ── */}
                        <div style={s.actionSection}>
                            {isAssignee && !isConfirmed && (() => {
                                // PRIORITY: if dueDate set and not pending approval → always show Confirm
                                const hasDueDate = !!task.dueDate;
                                const isPending = task.status === "pending_deadline_approval";
                                // Use the LIVE deadline (derived from the running timer session) so
                                // this full-page detail view stays in sync with the side-panel view.
                                // Falls back to the static task.dueDate when there's no session yet
                                // (e.g. task approved but employee hasn't pressed Play).
                                const deadlineMs = hasDueDate
                                    ? (computeLiveDeadline(task, timerSession) || new Date(task.dueDate).getTime())
                                    : null;
                                const deadlinePassed = deadlineMs && deadlineMs < Date.now();
                                const passedStr = (() => {
                                    if (!deadlinePassed || !deadlineMs) return "";
                                    const diff = Math.abs(Math.floor((Date.now() - deadlineMs) / 60000));
                                    if (diff < 60) return `${diff}m ago`;
                                    const h = Math.floor(diff / 60);
                                    return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
                                })();

                                if (hasDueDate && !isPending) return (
                                    <div style={{ background: deadlinePassed ? "#FEF2F2" : "#F0FDF4", border: `1.5px solid ${deadlinePassed ? "#FECDD3" : "#BBF7D0"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                                            <span style={{ width: 20, height: 20, borderRadius: "50%", background: deadlinePassed ? "#FEE2E2" : "#DCFCE7", border: `2px solid ${deadlinePassed ? "#EF4444" : "#16A34A"}`, color: deadlinePassed ? "#EF4444" : "#16A34A", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{deadlinePassed ? "!" : "✓"}</span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: deadlinePassed ? "#991B1B" : "#166534" }}>
                                                {deadlinePassed ? "⚠️ Deadline Passed" : "✓ Deadline Approved"}
                                            </span>
                                        </div>
                                        {task.dueDate && <div style={{ fontSize: 12, fontWeight: 600, padding: "4px 9px", borderRadius: 6, display: "inline-block", marginBottom: 8, background: deadlinePassed ? "#FEE2E2" : "#DCFCE7", color: deadlinePassed ? "#B91C1C" : "#166534" }}>
                                            📅 {fmtLiveDeadlineDateTime(task, timerSession) || new Date(task.dueDate).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                            {deadlinePassed && <span style={{ opacity: 0.8, marginLeft: 6 }}>· passed {passedStr}</span>}
                                        </div>}
                                        {deadlinePassed && <div style={{ fontSize: 12, color: "#B91C1C", background: "#FEF2F2", borderRadius: 7, padding: "6px 9px", marginBottom: 8, lineHeight: 1.5 }}>
                                            Deadline has passed. Confirm receipt and start working, or request a new deadline.
                                        </div>}
                                        <button disabled={actionBusy} onClick={() => handleAction("confirm")}
                                            style={{ ...s.actionBtn("confirm"), display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                                            ✓ Confirm &amp; Accept Task
                                        </button>
                                    </div>
                                );

                                // Step 1: no dueDate yet — propose
                                if (task.status === "open" || task.status === "deadline_rejected") return (
                                    <div style={{ background: "#F8FAFC", border: "1.5px solid #E2E8F0", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                                            <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#EFF6FF", border: "2px solid #3B82F6", color: "#3B82F6", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>1</span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: "#1E293B" }}>Set Your Deadline</span>
                                        </div>
                                        {task.deadlineProposalRejected && <div style={{ background: "#FEF2F2", border: "1px solid #FECDD3", borderRadius: 7, padding: "8px 10px", marginBottom: 10, fontSize: 12, color: "#991B1B" }}>
                                            ❌ <strong>Rejected:</strong> {task.deadlineRejectionReason || "Please propose a new deadline."}
                                        </div>}
                                        {propError && <div style={{ color: "#d93025", fontSize: 12, marginBottom: 8 }}>{propError}</div>}
                                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Date</label>
                                                <input type="date" value={propDate} min={new Date().toISOString().split("T")[0]} onChange={e => setPropDate(e.target.value)}
                                                    style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                                            </div>
                                            <div style={{ width: 100, flexShrink: 0 }}>
                                                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Time</label>
                                                <input type="time" value={propTime} onChange={e => setPropTime(e.target.value)}
                                                    style={{ width: "100%", padding: "8px 6px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                                            </div>
                                        </div>
                                        <button disabled={!propDate || proposing} onClick={handleProposeDeadline}
                                            style={{ width: "100%", padding: "9px", borderRadius: 8, border: "1.5px solid #BFDBFE", background: !propDate || proposing ? "#F1F5F9" : "#EFF6FF", color: !propDate || proposing ? "#94A3B8" : "#1D4ED8", fontSize: 13, fontWeight: 700, cursor: !propDate || proposing ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                                            {proposing ? "Submitting…" : "📅 Submit Deadline for Approval"}
                                        </button>
                                        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>💬 Use Draft Chat to discuss</div>
                                    </div>
                                );

                                // Step 2: waiting for approval
                                if (task.status === "pending_deadline_approval") return (
                                    <div style={{ background: "#FFFBEB", border: "1.5px solid #FDE68A", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                            <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#FEF3C7", border: "2px solid #D97706", color: "#D97706", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>2</span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>⏳ Awaiting Approval</span>
                                        </div>
                                        {task.proposedDeadline && <div style={{ fontSize: 12, color: "#78350F", background: "#FEF9C3", padding: "5px 9px", borderRadius: 6, display: "inline-block", marginBottom: 6 }}>
                                            📅 {new Date(task.proposedDeadline).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                        </div>}
                                        <div style={{ fontSize: 11, color: "#A16207" }}>💬 Use Draft Chat to discuss while waiting</div>
                                    </div>
                                );

                                return null;
                            })()}

                            {/* Creator: approve/reject panel */}
                            {task.status === "pending_deadline_approval" && isCreator && (
                                <div style={{ background: "#FFF7ED", border: "1.5px solid #FED7AA", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: "#9A3412", marginBottom: 8 }}>
                                        {["in_progress", "confirmed"].includes(task.prevStatusBeforeDeadlineProposal || "") ? "📅 Deadline Extension Request" : "📋 Deadline Proposal — Needs Your Approval"}
                                    </div>
                                    {task.proposedDeadline && <div style={{ fontSize: 13, color: "#78350F", marginBottom: 10 }}>
                                        Proposed by <strong>{task.proposedDeadlineByName}</strong>:<br />
                                        <span style={{ fontWeight: 700 }}>📅 {new Date(task.proposedDeadline).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                        {task.dueDate && ["in_progress", "confirmed"].includes(task.prevStatusBeforeDeadlineProposal || "") && (
                                            <span style={{ color: "#9CA3AF", fontSize: 11, marginLeft: 6 }}>(was: {new Date(task.dueDate).toLocaleString("en-IN", { day: "2-digit", month: "short" })})</span>
                                        )}
                                    </div>}
                                    {!showRejectInput ? (
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button onClick={() => handleApproveDeadline(true)} disabled={approving}
                                                style={{ flex: 1, padding: "8px", borderRadius: 7, border: "1.5px solid #BBF7D0", background: "#DCFCE7", color: "#166534", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: approving ? 0.5 : 1 }}>
                                                {approving ? "…" : "✓ Approve"}
                                            </button>
                                            <button onClick={() => setShowRejectInput(true)} disabled={approving}
                                                style={{ flex: 1, padding: "8px", borderRadius: 7, border: "1.5px solid #FECDD3", background: "#FFF1F2", color: "#991B1B", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                                                ✕ Reject
                                            </button>
                                        </div>
                                    ) : (
                                        <div>
                                            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                                                placeholder="Give a reason for rejection (required)…"
                                                style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #FECDD3", borderRadius: 7, fontSize: 12, fontFamily: "inherit", resize: "vertical", minHeight: 56, outline: "none", boxSizing: "border-box" }} />
                                            <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
                                                <button onClick={() => handleApproveDeadline(false)} disabled={!rejectReason.trim() || approving}
                                                    style={{ flex: 1, padding: "8px", borderRadius: 7, border: "1.5px solid #FECDD3", background: "#FFF1F2", color: "#991B1B", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: !rejectReason.trim() || approving ? 0.5 : 1 }}>
                                                    {approving ? "…" : "Send Rejection"}
                                                </button>
                                                <button onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
                                                    style={{ padding: "8px 14px", borderRadius: 7, border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Post-confirm actions */}
                            {isAssignee && isConfirmed && !isStarted && task.status !== "pending_deadline_approval" && (
                                <button disabled={actionBusy} onClick={() => handleAction("start")} style={s.actionBtn("start")}>▶ Start Working</button>
                            )}
                            {task.status === "pending_deadline_approval" && isAssignee && !isStarted && (
                                <div style={{ padding: "9px 12px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, fontSize: 12, color: "#92400E", display: "flex", alignItems: "center", gap: 6 }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                    <strong>Work paused</strong> — waiting for new deadline approval
                                </div>
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
                    {/* Outer tab bar: Chat | Reports */}
                    <div style={s.tabBar}>
                        <button onClick={() => setTab("chat")} style={{ ...s.tabBtn2, ...(tab === "chat" ? s.tabActive2 : {}) }}>
                            💬 Chat <span style={s.chatNote}>(This task only)</span>
                        </button>
                        <button onClick={() => setTab("reports")} style={{ ...s.tabBtn2, ...(tab === "reports" ? s.tabActive2 : {}) }}>
                            📊 Daily Reports
                            {task.dailyReportCount > 0 && <span style={s.tabCount}>{task.dailyReportCount}</span>}
                        </button>
                    </div>

                    {/* CHAT TAB */}
                    {tab === "chat" && (() => {
                        const isPreConfirmed = ["open", "pending_deadline_approval", "deadline_approved"].includes(task.status);
                        const isPostConfirmed = ["confirmed", "in_progress", "done"].includes(task.status);
                        return (
                            <>
                                {/* Draft / Normal sub-tabs */}
                                <div style={{ display: "flex", borderBottom: "1px solid #e8eaed", background: "#fff", flexShrink: 0 }}>
                                    <button onClick={() => setChatTab("draft")}
                                        style={{ flex: 1, padding: "9px 12px", border: "none", background: "none", fontFamily: "inherit", fontSize: 12, fontWeight: chatTab === "draft" ? 700 : 500, color: chatTab === "draft" ? "#D97706" : "#9aa0a6", borderBottom: `2px solid ${chatTab === "draft" ? "#D97706" : "transparent"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                                        ✏️ Draft Chat
                                        {isPreConfirmed && <span style={{ fontSize: 9, fontWeight: 700, background: "#FEF3C7", color: "#D97706", padding: "1px 5px", borderRadius: 99, border: "1px solid #FDE68A" }}>ACTIVE</span>}
                                        {isPostConfirmed && <span style={{ fontSize: 9, color: "#9aa0a6" }}>read-only</span>}
                                        {draftMsgs.length > 0 && <span style={{ fontSize: 9, fontWeight: 700, background: chatTab === "draft" ? "#FEF3C7" : "#f1f3f4", color: chatTab === "draft" ? "#D97706" : "#80868b", padding: "1px 5px", borderRadius: 99 }}>{draftMsgs.length}</span>}
                                    </button>
                                    <button onClick={() => isPostConfirmed && setChatTab("normal")} disabled={isPreConfirmed}
                                        style={{ flex: 1, padding: "9px 12px", border: "none", background: "none", fontFamily: "inherit", fontSize: 12, fontWeight: chatTab === "normal" ? 700 : 500, color: isPreConfirmed ? "#d3d3d3" : (chatTab === "normal" ? "#1a73e8" : "#9aa0a6"), borderBottom: `2px solid ${chatTab === "normal" ? "#1a73e8" : "transparent"}`, cursor: isPreConfirmed ? "not-allowed" : "pointer", opacity: isPreConfirmed ? 0.45 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                                        💬 Normal Chat
                                        {isPreConfirmed && <span style={{ fontSize: 9, color: "#d3d3d3" }}>🔒 locked</span>}
                                        {chatMsgs.length > 0 && <span style={{ fontSize: 9, fontWeight: 700, background: chatTab === "normal" ? "#e8f0fe" : "#f1f3f4", color: chatTab === "normal" ? "#1a73e8" : "#80868b", padding: "1px 5px", borderRadius: 99 }}>{chatMsgs.length}</span>}
                                    </button>
                                </div>

                                {/* DRAFT chat view */}
                                {chatTab === "draft" && (
                                    <>
                                        <div style={s.chatInfo}>
                                            <span style={{ fontSize: 12, color: "#b06000" }}>
                                                ✏️ <strong>Draft Chat</strong> — {isPreConfirmed ? "Discuss deadline & task details before confirming." : "Read-only. Task has been confirmed."}
                                            </span>
                                        </div>
                                        <div style={s.chatArea}>
                                            {draftMsgs.length === 0 ? (
                                                <div style={s.chatEmpty}>
                                                    <div style={{ fontSize: 40, marginBottom: 10 }}>✏️</div>
                                                    <div style={{ fontWeight: 500, color: "#202124", marginBottom: 6 }}>No draft messages yet</div>
                                                    <div style={{ fontSize: 13, color: "#80868b" }}>{isPreConfirmed ? "Discuss the task and deadline here." : "No pre-confirmation discussion."}</div>
                                                </div>
                                            ) : (
                                                draftMsgs.map((msg, i) => {
                                                    const isMe = msg.senderId === employeeId;
                                                    const isSystem = msg.messageType === "system";
                                                    if (isSystem) return <div key={msg.messageId || i} style={{ textAlign: "center", padding: "4px 12px", fontSize: 11, color: "#9aa0a6", fontStyle: "italic" }}>{msg.text}</div>;
                                                    const prevMsg = i > 0 ? draftMsgs[i - 1] : null;
                                                    const showSender = !prevMsg || prevMsg.senderId !== msg.senderId;
                                                    return <MessageBubble key={msg.messageId || i} msg={msg} isMe={isMe} showSender={showSender} showAvatar={showSender} />;
                                                })
                                            )}
                                            <div ref={draftEndRef} />
                                        </div>
                                        {isPreConfirmed ? (
                                            <div style={{ background: "#fff", borderTop: "1px solid #e8eaed", padding: "8px 12px", flexShrink: 0 }}>
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <input value={draftText} onChange={e => setDraftText(e.target.value)}
                                                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendDraftChat(); } }}
                                                        placeholder="Draft message…"
                                                        style={{ flex: 1, padding: "9px 12px", border: "1.5px solid #e8eaed", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", background: "#f8f9fa" }} />
                                                    <button onClick={handleSendDraftChat} disabled={!draftText.trim() || sendingDraft}
                                                        style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: !draftText.trim() || sendingDraft ? "#e8eaed" : "#f9ab00", color: !draftText.trim() || sendingDraft ? "#9aa0a6" : "#000", fontWeight: 600, cursor: !draftText.trim() || sendingDraft ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 12 }}>
                                                        {sendingDraft ? "…" : "Send"}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ background: "#FFF8E1", borderTop: "1px solid #FDE68A", padding: "8px 14px", fontSize: 11, color: "#92400E", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                                                🔒 Draft chat is read-only after task confirmation
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* NORMAL chat view */}
                                {chatTab === "normal" && (
                                    <>
                                        <div style={s.chatInfo}>
                                            <span style={{ fontSize: 12, color: "#5f6368" }}>
                                                💬 <strong>{task.title} ({taskId})</strong> — active task chat
                                            </span>
                                        </div>
                                        <div style={s.chatArea}>
                                            {chatMsgs.length === 0 ? (
                                                <div style={s.chatEmpty}>
                                                    <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
                                                    <div style={{ fontWeight: 500, color: "#202124", marginBottom: 6 }}>No messages yet</div>
                                                    <div style={{ fontSize: 13, color: "#80868b" }}>Chat is open after task confirmation.</div>
                                                </div>
                                            ) : (
                                                groupedMsgs.map((msg, i) => (
                                                    <MessageBubble key={msg.messageId || i} msg={msg} isMe={msg.senderId === employeeId} showSender={msg.showSender} showAvatar={msg.showAvatar} />
                                                ))
                                            )}
                                            <div ref={messagesEndRef} />
                                        </div>
                                        <div style={{ background: "#202C33", flexShrink: 0 }}>
                                            <MediaMessageInput onSend={handleSendChat} placeholder={`Message in ${task.title}...`} />
                                        </div>
                                    </>
                                )}
                            </>
                        );
                    })()}

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
                                                    <GwAvatar name={r.employeeName} size={36} url={r.profilePicUrl || ""} />
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