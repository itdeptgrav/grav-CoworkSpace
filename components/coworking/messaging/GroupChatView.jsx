"use client";
/**
 * GRAV-CMS/app/coworking/create-group/group-chat/[groupId]/page.js
 *
 * 100% Firestore-native — zero backend API calls.
 *
 * Firestore operations:
 *   READ  cowork_groups/{groupId}                 → group info + memberIds
 *   READ  cowork_employees/{id}                   → member name/dept (batch)
 *   READ  cowork_groups/{groupId}/messages        → message history (onSnapshot, real-time)
 *   WRITE cowork_groups/{groupId}/messages/{id}   → send message
 *   WRITE cowork_groups/{groupId}.lastMessage     → update preview
 *
 * Images/Voice → Cloudinary directly (uploadImage, uploadVoice from mediaUploadApi)
 * PDFs         → backend → Google Drive (uploadPDF from mediaUploadApi, unchanged)
 *
 * Optimistic UI:
 *   1. Message shown instantly (sending=true)
 *   2. Firestore write completes → confirmed (sending=false, ✓)
 *   3. onSnapshot merges server messages; own optimistic messages are NOT duplicated
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    doc, getDoc, getDocs, setDoc, updateDoc, where,
    collection, query, orderBy, limit,
    onSnapshot, serverTimestamp, writeBatch, arrayUnion,
} from "firebase/firestore";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
// NOTE: import paths updated — this file lives in components/coworking/messaging/
// Original path was app/coworking/create-group/group-chat/[groupId]/page.js

import MediaMessageInput from "../../../components/coworking/messaging/MediaMessageInput";
import MessageBubble from "../../../components/coworking/messaging/MessageBubble";
import { firebaseDb, firebaseAuth } from "../../../lib/coworkFirebase";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
async function apiFetch(path, opts = {}) {
    const u = firebaseAuth.currentUser;
    const token = u ? await u.getIdToken() : "";
    const res = await fetch(`${BASE}/cowork${path}`, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
    return res.json();
}
import { GwAvatar, GwSpinner, GwEmpty } from "../../../components/coworking/shared/CoworkShared";
import MeetingSummaryModal from "../../../components/coworking/meets/MeetingSummaryModal";
import { cancelMeet, updateMeet } from "../../../lib/coworkApi";

// ── helpers ───────────────────────────────────────────────
function tsToISO(ts) {
    if (!ts) return new Date().toISOString();
    if (ts?.seconds) return new Date(ts.seconds * 1000).toISOString();
    return String(ts);
}

function resolveType(messageType, attachments) {
    if (messageType && messageType !== "text") return messageType;
    if (attachments?.length > 0) return attachments[0].type || "image";
    return "text";
}

// ══════════════════════════════════════════════════════════
// ── Inline Group Request Card — shown directly in chat timeline (matches DM ThreadRequestCard) ──
const GRP_REQ_STATUS = {
    pending: { color: "#D97706", bg: "#FEF3C7", border: "#FDE68A" },
    approved: { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
    rejected: { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
};
const GRP_REQ_PRI_COLOR = { urgent: "#DC2626", high: "#D97706", medium: "#6366F1", low: "#6B7280" };
const GRP_REQ_PRI_BG = { urgent: "#FEF2F2", high: "#FEF3C7", medium: "#EEF2FF", low: "#F9FAFB" };

function InlineGroupRequestCard({ req, employeeId, isCeoOrTl }) {
    const sc = GRP_REQ_STATUS[req.status] || GRP_REQ_STATUS.pending;
    const isFromMe = req.fromId === employeeId;
    // Support both single toId and toIds array (group requests)
    const isToMe = req.toId === employeeId || (req.toIds || []).includes(employeeId);
    const canRespond = (isCeoOrTl || isToMe) && req.status === "pending";

    const fire = (extra) => window.dispatchEvent(new CustomEvent("openRequestPanel", {
        detail: { tab: isToMe ? "received" : "sent", requestId: req.id, ...extra }
    }));

    return (
        <div style={{ display: "flex", justifyContent: isFromMe ? "flex-end" : "flex-start", width: "100%", marginBottom: 6 }}>
            <div style={{ maxWidth: 290, width: "100%", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", border: "1px solid #E2E8F0", background: "#fff" }}>
                {/* Dark header like meeting card */}
                <div style={{ background: "#1E293B", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em" }}>REQUEST</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>from {req.fromName}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 99, color: sc.color, background: sc.bg, border: `1px solid ${sc.border}`, flexShrink: 0, whiteSpace: "nowrap" }}>{req.status}</span>
                    {req.priority && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5, color: GRP_REQ_PRI_COLOR[req.priority], background: GRP_REQ_PRI_BG[req.priority], flexShrink: 0 }}>{req.priority}</span>}
                </div>
                {/* Body */}
                <div style={{ padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{req.subject}</div>
                    {req.message && <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{req.message}</div>}
                    {req.dueDate && <div style={{ fontSize: 11, color: "#D97706", fontWeight: 600 }}>⏰ Due {new Date(req.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>}
                    {req.type && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: "#F1F5F9", color: "#475569", fontWeight: 600, border: "1px solid #E2E8F0", alignSelf: "flex-start" }}>{req.type}</span>}
                    {req.attachments?.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {req.attachments.map((att, i) => (
                                <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: 10, color: "#2563EB", background: "#EFF6FF", border: "1px solid #BFDBFE", padding: "2px 8px", borderRadius: 5, textDecoration: "none", fontWeight: 500 }}>
                                    📎 {(att.name || "File").slice(0, 18)}
                                </a>
                            ))}
                        </div>
                    )}
                    {req.responseMessage && (
                        <div style={{ padding: "5px 9px", background: "#F8FAFC", borderRadius: 6, fontSize: 11, color: "#374151", borderLeft: "2px solid #CBD5E1" }}>
                            <strong>Response:</strong> {req.responseMessage}
                        </div>
                    )}
                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        {canRespond && (
                            <button onClick={() => fire({ openRespond: true })}
                                style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "none", background: "#16A34A", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                ✓ Respond
                            </button>
                        )}
                        <button onClick={() => fire({ openChat: true })}
                            style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "1px solid #E2E8F0", background: "#fff", color: "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            💬 Chat
                        </button>
                        <button onClick={() => fire({})}
                            style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "1px solid #E2E8F0", background: "#fff", color: "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            View →
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Collapsible requests bar for group chat ──────────────────────────────────
function GroupRequestsBar({ requests, employeeId, employeeName, isCeoOrTl }) {
    const [open, setOpen] = useState(false);
    const panelRef = useRef(null);
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);
    const pending = requests.filter(r => r.status === "pending").length;
    return (
        <div ref={panelRef} style={{ position: "relative", flexShrink: 0 }}>
            <button onClick={() => setOpen(p => !p)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: open ? "#FAF5FF" : "#F8FAFC", border: "none", borderBottom: `1px solid ${open ? "#E9D5FF" : "#E5E7EB"}`, cursor: "pointer", fontFamily: "inherit" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#7C3AED", flex: 1, textAlign: "left" }}>{requests.length} Request{requests.length !== 1 ? "s" : ""}</span>
                {pending > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "#FEF3C7", color: "#D97706", border: "1px solid #FDE68A" }}>{pending} pending</span>}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {open && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, background: "#fff", border: "1px solid #E9D5FF", borderTop: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: "60vh", overflowY: "auto", padding: "8px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {requests.map(req => (
                        <GroupRequestCard key={req.id} req={req} employeeId={employeeId} employeeName={employeeName} isCeoOrTl={isCeoOrTl} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Group Request Card ────────────────────────────────────────────────────────
const GRC_SC = { pending: { color: "#D97706", bg: "#FEF3C7", border: "#FDE68A" }, approved: { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" }, rejected: { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" } };
const GRC_PC = { urgent: "#DC2626", high: "#D97706", medium: "#2563EB", low: "#6B7280" };
const GRC_PB = { urgent: "#FEF2F2", high: "#FEF3C7", medium: "#EFF6FF", low: "#F9FAFB" };

function GroupRequestCard({ req, employeeId, isCeoOrTl }) {
    const sc = GRC_SC[req.status] || GRC_SC.pending;
    const isToMe = req.toId === employeeId || (req.toIds || []).includes(employeeId);
    const canRespond = (isCeoOrTl || isToMe) && req.status === "pending";

    const openPanel = (tab) => window.dispatchEvent(new CustomEvent("openRequestPanel", {
        detail: { tab, requestId: req.id }
    }));

    return (
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{req.subject}</span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 99, color: sc.color, background: sc.bg, border: `1px solid ${sc.border}`, flexShrink: 0 }}>{req.status}</span>
                {req.priority && <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4, color: GRC_PC[req.priority], background: GRC_PB[req.priority], flexShrink: 0 }}>{req.priority}</span>}
            </div>
            <div style={{ padding: "6px 12px 8px" }}>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>from {req.fromName}</div>
                {req.message && <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{req.message}</div>}
                {req.dueDate && <div style={{ fontSize: 10, color: "#D97706", fontWeight: 600, marginTop: 3 }}>⏰ {new Date(req.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>}
                {req.attachments?.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                        {req.attachments.map((att, i) => <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#2563EB", background: "#EFF6FF", border: "1px solid #BFDBFE", padding: "1px 7px", borderRadius: 5, textDecoration: "none" }}>📎 {(att.name || "File").slice(0, 16)}</a>)}
                    </div>
                )}
                {req.responseMessage && <div style={{ marginTop: 4, fontSize: 10, color: "#374151", background: "#F8FAFC", borderLeft: "2px solid #CBD5E1", padding: "3px 7px", borderRadius: "0 4px 4px 0" }}><strong>Response:</strong> {req.responseMessage}</div>}

                <div style={{ display: "flex", gap: 6, marginTop: 8, paddingTop: 8, borderTop: "1px solid #F1F5F9" }}>
                    {canRespond && (
                        <button onClick={() => openPanel("received")}
                            style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "none", background: "#16A34A", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            ✓ Respond
                        </button>
                    )}
                    <button onClick={() => openPanel(isToMe ? "received" : "sent")}
                        style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "1px solid #E2E8F0", background: "#fff", color: "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        💬 Chat
                    </button>
                    <button onClick={() => openPanel(isToMe ? "received" : "sent")}
                        style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "1px solid #E2E8F0", background: "#fff", color: "#374151", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        View →
                    </button>
                </div>
            </div>
        </div>
    );
}


export default function GroupChatView({ groupId, onBack }) {
    const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
    const router = useRouter();

    const [group, setGroup] = useState(null);   // group doc
    const [members, setMembers] = useState([]);     // member details
    // Quick lookup: employeeId → profilePicUrl
    const memberPicMap = new Map(members.map(m => [m.employeeId, m.profilePicUrl || ""]));
    const [messages, setMessages] = useState([]);     // real-time
    const [msgsLoading, setMsgsLoading] = useState(true);
    const [showMembers, setShowMembers] = useState(false);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [showMeetModal, setShowMeetModal] = useState(false);
    const [meetForm, setMeetForm] = useState({ title: "", dateTime: "", description: "" });
    const [meetBusy, setMeetBusy] = useState(false);
    const [meetError, setMeetError] = useState("");
    const [summaryModal, setSummaryModal] = useState(null);
    const [threadRequests, setThreadRequests] = useState([]);
    const [editModal, setEditModal] = useState(null);
    const [editError, setEditError] = useState("");
    const [editSaving, setEditSaving] = useState(false);
    const [cancellingId, setCancellingId] = useState(null);
    const [taskForm, setTaskForm] = useState({ title: "", description: "", dueDate: "", notes: "", priority: "medium" });
    const [taskBusy, setTaskBusy] = useState(false);
    const [taskError, setTaskError] = useState("");
    const [groupTasks, setGroupTasks] = useState([]);
    const [subtaskMap, setSubtaskMap] = useState({}); // taskId -> subtask docs
    const [tasksMinimized, setTasksMinimized] = useState(false); // pinned tasks panel min/max
    const [seenTaskIds, setSeenTaskIds] = useState(() => {
        // Load from localStorage so badge stays gone across sessions
        try { return new Set(JSON.parse(localStorage.getItem(`seen_tasks_${groupId}`) || "[]")); }
        catch { return new Set(); }
    });
    const [selectedMembers, setSelectedMembers] = useState(null); // null = not initialized yet
    const messagesEndRef = useRef(null);
    const unsubRef = useRef(null);
    const pendingMapRef = useRef(new Map()); // tempId → realId

    // ── Load group doc + member details ──────────────────────
    const loadGroup = useCallback(async () => {
        if (!groupId) return;
        try {
            const snap = await getDoc(doc(firebaseDb, "cowork_groups", groupId));
            if (!snap.exists()) return;
            const g = { id: snap.id, ...snap.data() };
            setGroup(g);

            // Load member details from cowork_employees
            if (g.memberIds?.length) {
                const memberDocs = await Promise.all(
                    g.memberIds.map(id => getDoc(doc(firebaseDb, "cowork_employees", id)))
                );
                const memberList = memberDocs
                    .filter(d => d.exists())
                    .map(d => ({ employeeId: d.id, ...d.data() }));
                setMembers(memberList);
                // Attach members back to group for display
                setGroup(prev => prev ? { ...prev, members: memberList } : prev);
            }
        } catch (e) { console.error("loadGroup:", e); }
    }, [groupId]);

    // ── Real-time messages listener ───────────────────────────
    const setupListener = useCallback(() => {
        if (!groupId) return;
        setMsgsLoading(true);

        const msgsRef = collection(firebaseDb, "cowork_groups", groupId, "messages");
        const q = query(msgsRef, orderBy("createdAt", "asc"), limit(100));

        const unsub = onSnapshot(q,
            snap => {
                const incoming = snap.docs.map(d => ({
                    ...d.data(),
                    id: d.id,
                    createdAt: tsToISO(d.data().createdAt),
                    temp: false,
                    sending: false,
                    error: false,
                }));

                // ── Mark other people's messages as read (readBy: arrayUnion) ──────
                // This fires when the user is viewing the chat — messages become read
                // immediately, which decrements the sidebar badge in real time.
                const toRead = snap.docs.filter(d => {
                    const data = d.data();
                    return data.senderId !== employeeId && !(data.readBy || []).includes(employeeId);
                });
                if (toRead.length > 0) {
                    const batch = writeBatch(firebaseDb);
                    toRead.forEach(d => batch.update(d.ref, { readBy: arrayUnion(employeeId) }));
                    batch.commit().catch(err => console.error("group mark read:", err));
                }

                // Source of truth merge with pendingMap to avoid flicker
                const incomingIds = new Set(incoming.map(m => m.messageId));
                setMessages(prev => {
                    const pendingMap = pendingMapRef.current;
                    const pendingKept = prev.filter(m => {
                        if (m.temp === true) {
                            const realId = pendingMap.get(m.messageId);
                            return realId ? !incomingIds.has(realId) : true;
                        }
                        if (m.error === true) return true;
                        return false;
                    });
                    return [...incoming, ...pendingKept]
                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                });

                setMsgsLoading(false);
            },
            err => { console.error("messages listener:", err); setMsgsLoading(false); }
        );

        unsubRef.current = unsub;
        return unsub;
    }, [groupId]);

    useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading, router]);

    useEffect(() => {
        if (!user || !employeeId || !groupId) return;
        loadGroup();
        const unsub = setupListener();
        return () => { if (unsub) unsub(); pendingMapRef.current.clear(); };
    }, [user, employeeId, groupId, loadGroup, setupListener]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ── Send message — writes directly to Firestore ──────────
    const handleSend = async (text, attachments, messageType, mentions = []) => {
        if (!groupId || !employeeId) return;

        const tempId = "temp_" + Date.now();
        const resolvedType = resolveType(messageType, attachments);

        const optimistic = {
            messageId: tempId,
            threadType: "group",
            threadId: groupId,
            senderId: employeeId,
            senderName: employeeName,
            text: text || "",
            attachments: attachments || [],
            mentions: Array.isArray(mentions) ? mentions : [], // NEW — employeeIds tagged with @
            messageType: resolvedType,
            type: resolvedType,
            readBy: [employeeId],
            temp: true,
            sending: true,
            error: false,
            createdAt: new Date().toISOString(),
        };

        // 1. Show immediately (optimistic)
        setMessages(prev => [...prev, optimistic]);

        try {
            // 2. Route through backend so FCM push + email fire for all members
            const result = await apiFetch(`/group/${groupId}/message`, {
                method: "POST",
                body: JSON.stringify({
                    text: text || "",
                    attachments: attachments || [],
                    messageType: resolvedType,
                    mentions: Array.isArray(mentions) ? mentions : [], // NEW — backend can use for @-push
                }),
            });

            const messageId = result.message?.messageId || result.messageId;
            if (messageId) pendingMapRef.current.set(tempId, messageId);

            // 3. Remove temp; onSnapshot handles confirmed message
            setMessages(prev => prev.filter(m => m.messageId !== tempId));
            pendingMapRef.current.delete(tempId);

        } catch (err) {
            console.error("handleSend:", err);
            pendingMapRef.current.delete(tempId);
            setMessages(prev => prev.map(m =>
                m.messageId === tempId ? { ...m, sending: false, error: true } : m
            ));
        }
    };

    // Load tasks from group doc's taskIds array — no Firestore index needed
    useEffect(() => {
        if (!groupId) return;
        // Listen to group doc for taskIds changes
        const unsub = onSnapshot(doc(firebaseDb, "cowork_groups", groupId),
            async snap => {
                const taskIds = snap.data()?.taskIds || [];
                if (taskIds.length === 0) { setGroupTasks([]); setSubtaskMap({}); return; }
                // Fetch each task doc
                const taskDocs = await Promise.all(taskIds.map(tid => getDoc(doc(firebaseDb, "cowork_tasks", tid))));
                const tasks = taskDocs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() }));
                setGroupTasks(tasks);

                // Fetch subtask details
                const newSubtaskMap = {};
                await Promise.all(tasks.map(async t => {
                    const ids = t.subtaskIds || [];
                    if (ids.length === 0) return;
                    const subtaskDocs = await Promise.all(
                        ids.slice(0, 5).map(sid => getDoc(doc(firebaseDb, "cowork_tasks", sid)))
                    );
                    newSubtaskMap[t.taskId || t.id] = subtaskDocs
                        .filter(d => d.exists())
                        .map(d => ({ id: d.id, ...d.data() }));
                }));
                setSubtaskMap(newSubtaskMap);
            },
            (err) => { console.error("group tasks:", err); }
        );
        return () => unsub();
    }, [groupId]);

    // Init selectedMembers when group loads — all members selected except CEO
    useEffect(() => {
        if (!group || selectedMembers !== null) return;
        const memberIds = group.memberIds || [];
        // All selected by default except CEO (E000)
        const initial = {};
        memberIds.forEach(id => { initial[id] = id !== "E000"; });
        setSelectedMembers(initial);
    }, [group, selectedMembers]);

    // ── Thread request listener — BEFORE any early returns (Rules of Hooks)
    useEffect(() => {
        if (!groupId) return;
        const unsub = onSnapshot(
            query(collection(firebaseDb, "cowork_requests"), where("threadId", "==", groupId)),
            snap => setThreadRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))),
            () => { }
        );
        return () => unsub();
    }, [groupId]);

    if (loading || !user) return null;

    // ── Access check: only group members can view this chat ──────────────────
    if (group && employeeId) {
        const memberIds = group.memberIds || [];
        const isMember = memberIds.includes(employeeId) || employeeId === "E000";
        if (!isMember) {
            return (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 12 }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Access Denied</div>
                    <div style={{ fontSize: 13, color: "#64748B" }}>You are not a member of this group.</div>
                    <button onClick={() => router.push("/coworking/create-group")}
                        style={{ marginTop: 8, padding: "8px 20px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        Back to Groups
                    </button>
                </div>
            );
        }
    }

    const isCeoOrTl = role === "ceo" || role === "tl";

    const handleViewSummary = (meetId, meetTitle) => setSummaryModal({ meetId, meetTitle });

    const handleCancelMeet = async (meetId, meetTitle) => {
        if (!window.confirm(`Cancel meeting "${meetTitle}"?`)) return;
        setCancellingId(meetId);
        try { await cancelMeet(meetId); }
        catch (e) { alert(e.message || "Failed to cancel"); }
        finally { setCancellingId(null); }
    };

    const handleEditSave = async (updated) => {
        if (!editModal) return;
        setEditError("");
        if (!updated.title?.trim()) { setEditError("Title is required."); return; }
        if (!updated.dateTime) { setEditError("Date and time is required."); return; }
        setEditSaving(true);
        try {
            await updateMeet(editModal.meetId, {
                title: updated.title.trim(), description: updated.description || "",
                dateTime: updated.dateTime, googleMeetLink: updated.googleMeetLink || null,
                participants: updated.participants || [],
            });
            setEditModal(null);
        } catch (e) { setEditError(e.message || "Failed to save."); }
        finally { setEditSaving(false); }
    };

    const handleCreateGroupMeeting = async () => {
        if (!meetForm.title.trim()) { setMeetError("Title is required"); return; }
        if (!meetForm.dateTime) { setMeetError("Date and time is required"); return; }
        setMeetBusy(true); setMeetError("");
        try {
            const memberIds = group?.memberIds || [];
            const result = await apiFetch("/schedule-meet/create", {
                method: "POST",
                body: JSON.stringify({
                    title: meetForm.title.trim(),
                    description: meetForm.description.trim() || "",
                    dateTime: meetForm.dateTime,
                    googleMeetLink: null,
                    participants: memberIds.filter(id => id !== employeeId).filter(Boolean),
                }),
            });

            const meetId = result?.meet?.meetId || result?.meetId;
            const joinCode = result?.meet?.joinCode || result?.joinCode || "";

            // Send invite as a group message
            const msgsRef = collection(firebaseDb, "cowork_groups", groupId, "messages");
            const msgId = crypto.randomUUID();
            await setDoc(doc(firebaseDb, "cowork_groups", groupId, "messages", msgId), {
                messageId: msgId,
                senderId: employeeId,
                senderName: employeeName,
                text: `Meeting Invitation: ${meetForm.title.trim()}`,
                messageType: "meeting_invite",
                type: "meeting_invite",
                meetingData: { meetId, joinCode, meetTitle: meetForm.title.trim(), description: meetForm.description.trim(), dateTime: meetForm.dateTime },
                readBy: [employeeId],
                createdAt: serverTimestamp(),
                threadId: groupId,
            });

            const groupRef = doc(firebaseDb, "cowork_groups", groupId);
            await updateDoc(groupRef, {
                lastMessage: { text: `📹 Meeting invite: ${meetForm.title.trim()}`, senderId: employeeId, senderName: employeeName, messageType: "meeting_invite", sentAt: serverTimestamp() },
                updatedAt: serverTimestamp(),
            });

            setShowMeetModal(false);
            setMeetForm({ title: "", dateTime: "", description: "" });
        } catch (e) { setMeetError(e.message); }
        finally { setMeetBusy(false); }
    };

    const handleCreateGroupTask = async () => {
        if (!taskForm.title.trim()) { setTaskError("Title is required"); return; }
        setTaskBusy(true); setTaskError("");
        try {
            // Use selected members (default: all except CEO)
            const assigneeIds = selectedMembers
                ? Object.entries(selectedMembers).filter(([, sel]) => sel).map(([id]) => id)
                : (group?.memberIds || []);
            if (assigneeIds.length === 0) { setTaskError("Select at least one member"); setTaskBusy(false); return; }
            const result = await apiFetch("/task/create", {
                method: "POST",
                body: JSON.stringify({
                    title: taskForm.title.trim(),
                    description: taskForm.description.trim() || "",
                    notes: taskForm.notes,
                    dueDate: taskForm.dueDate || null,
                    priority: taskForm.priority,
                    assigneeIds,
                    assignedBy: employeeId,
                    assignedByName: employeeName,
                    groupId,
                    createdByTl: role === "tl",
                }),
            });
            // Save taskId to group doc so it shows without a Firestore index
            const createdTaskId = result?.taskId || result?.task?.taskId;
            if (createdTaskId) {
                await updateDoc(doc(firebaseDb, "cowork_groups", groupId), {
                    taskIds: arrayUnion(createdTaskId),
                });

                // ── Post styled task_created card in group chat ──
                const chatMsgId = crypto.randomUUID();
                const msgsRef = collection(firebaseDb, "cowork_groups", groupId, "messages");
                await setDoc(doc(msgsRef, chatMsgId), {
                    messageId: chatMsgId,
                    senderId: "system",
                    senderName: "System",
                    text: `📋 Task created — "${taskForm.title.trim()}" · ID: ${createdTaskId} · by ${employeeName}`,
                    messageType: "task_created",
                    type: "task_created",
                    taskData: {
                        taskId: createdTaskId,
                        title: taskForm.title.trim(),
                        description: taskForm.description.trim() || "",
                        priority: taskForm.priority,
                        dueDate: taskForm.dueDate || null,
                        createdBy: employeeName,
                        assigneeCount: assigneeIds.length,
                    },
                    readBy: [],
                    createdAt: serverTimestamp(),
                });
                await updateDoc(doc(firebaseDb, "cowork_groups", groupId), {
                    lastMessage: {
                        text: `📋 Task created: ${taskForm.title.trim()}`,
                        senderId: employeeId,
                        senderName: employeeName,
                        messageType: "system",
                        sentAt: serverTimestamp(),
                    },
                    updatedAt: serverTimestamp(),
                });
            }
            setShowTaskModal(false);
            setTaskForm({ title: "", description: "", dueDate: "", notes: "", priority: "medium" });
        } catch (e) { setTaskError(e.message); }
        finally { setTaskBusy(false); }
    };

    return (
        <>

            <style>{GROUP_CHAT_CSS}</style>
            <div style={s.container} className="grav-chat-container">

                {/* ── Header ── */}
                <div style={s.header}>
                    <button onClick={() => onBack ? onBack() : router.push("/coworking/create-group")} style={s.backBtn} title="Back to groups" className="grp-back-btn">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    <GwAvatar name={group?.name || "G"} size={36} />

                    <div style={s.headerInfo}>
                        <div style={s.headerName}>{group?.name || "Loading…"}</div>
                        <div style={s.headerSub}>
                            <span style={s.memberCountTag}>{group?.memberIds?.length || 0} members</span>
                            <span style={s.groupIdTag}>{groupId}</span>
                        </div>
                    </div>

                    <div style={s.headerActions}>
                        {/* ── Request button — auto-selects all group members ── */}
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent("openRequestPanel", {
                                detail: {
                                    tab: "compose",
                                    threadContext: {
                                        type: "group",
                                        threadId: groupId,
                                        recipientId: null,
                                        recipientName: group?.name,
                                        recipientIds: (group?.memberIds || []).filter(id => id !== employeeId),
                                    }
                                }
                            }))}
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#FAF5FF", border: "1.5px solid #E9D5FF", borderRadius: "var(--radius-md)", cursor: "pointer", color: "#7C3AED", fontSize: 12, fontWeight: 600, fontFamily: "inherit", flexShrink: 0 }}
                            title="Send a request to all group members"
                            className="gc-header-btn"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                            <span className="gc-btn-label">Request</span>
                        </button>

                        {/* ── Schedule Meeting — labeled, CEO/TL only ── */}
                        {isCeoOrTl && (
                            <button
                                onClick={() => { setShowMeetModal(true); setMeetError(""); }}
                                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: "var(--radius-md)", cursor: "pointer", color: "#16A34A", fontSize: 12, fontWeight: 600, fontFamily: "inherit", flexShrink: 0 }}
                                title="Schedule a meeting with this group"
                                className="gc-header-btn"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                <span className="gc-btn-label">Schedule Meeting</span>
                            </button>
                        )}
                        {isCeoOrTl && (
                            <button
                                onClick={() => {
                                    // Re-init member selection — all selected except CEO
                                    const memberIds = group?.memberIds || [];
                                    const init = {};
                                    memberIds.forEach(id => { init[id] = id !== "E000"; });
                                    setSelectedMembers(init);
                                    setTaskError("");
                                    setTaskForm({ title: "", description: "", dueDate: "", notes: "", priority: "medium" });
                                    setShowTaskModal(true);
                                }}
                                style={{ ...s.headerIconBtn, background: "#EFF6FF", borderColor: "#BFDBFE", color: "#1D4ED8" }}
                                title="Create Task for this group"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                                </svg>
                            </button>
                        )}
                        <button
                            onClick={() => setShowMembers(p => !p)}
                            style={{
                                ...s.headerIconBtn,
                                background: showMembers ? "var(--primary-light)" : "var(--gray-50)",
                                borderColor: showMembers ? "var(--primary)" : "var(--gray-200)",
                                color: showMembers ? "var(--primary)" : "var(--gray-600)",
                            }}
                            title="View members"
                        >
                            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                                <circle cx="5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
                                <circle cx="10" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
                                <path d="M1 13c0-2.2 1.8-4 4-4h5c2.2 0 4 1.8 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Members panel ── */}
                {showMembers && (
                    <div style={s.membersPanel}>
                        <div style={s.membersPanelTitle}>
                            Members ({members.length || group?.memberIds?.length || 0})
                        </div>
                        <div style={s.membersList}>
                            {(members.length ? members : (group?.memberIds || []).map(id => ({ employeeId: id, name: id }))).map(m => (
                                <div key={m.employeeId} style={s.memberChip}>
                                    <GwAvatar name={m.name || m.employeeId} size={22} />
                                    <span style={s.memberName}>{m.name || m.employeeId}</span>
                                    {m.department && <span style={s.memberDept}>{m.department}</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Thread Requests — collapsible pill ── */}
                {threadRequests.length > 0 && (
                    <GroupRequestsBar requests={threadRequests} employeeId={employeeId} employeeName={employeeName} isCeoOrTl={isCeoOrTl} />
                )}

                {/* ── Pinned Task Panel — fixed above chat, not scrollable away ── */}
                {groupTasks.length > 0 && (
                    <div style={{
                        flexShrink: 0,
                        borderBottom: "1px solid #E2E8F0",
                        background: "#fff",
                        transition: "max-height 0.28s cubic-bezier(0.4,0,0.2,1)",
                        maxHeight: tasksMinimized ? 44 : 340,
                        overflow: "hidden",
                    }}>
                        {/* Panel header — always visible */}
                        <div style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "10px 16px",
                            borderBottom: tasksMinimized ? "none" : "1px solid #F1F5F9",
                            background: "#FAFBFF",
                            cursor: "pointer", userSelect: "none",
                        }} onClick={() => setTasksMinimized(p => !p)}>
                            {/* Icon */}
                            <div style={{ width: 26, height: 26, borderRadius: 7, background: "#EFF6FF", border: "1px solid #BFDBFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12l2 2 4-4" /></svg>
                            </div>
                            <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em" }}>
                                Group Tasks
                                <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE" }}>
                                    {groupTasks.length}
                                </span>
                                {/* Unread new tasks badge */}
                                {(() => {
                                    const newCount = groupTasks.filter(t => !seenTaskIds.has(t.taskId || t.id)).length;
                                    return newCount > 0 ? (
                                        <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, padding: "1px 7px", borderRadius: 99, background: "#2563EB", color: "#fff", animation: "gc-new-pulse 1.8s ease-in-out infinite" }}>
                                            {newCount} NEW
                                        </span>
                                    ) : null;
                                })()}
                            </span>
                            {/* Minimize / Maximize button */}
                            <button
                                onClick={e => { e.stopPropagation(); setTasksMinimized(p => !p); }}
                                style={{ width: 26, height: 26, border: "1px solid #E2E8F0", borderRadius: 6, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", flexShrink: 0, transition: "all 0.15s" }}
                                title={tasksMinimized ? "Expand tasks" : "Collapse tasks"}
                            >
                                {tasksMinimized ? (
                                    /* Maximize — expand arrows */
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                                        <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                                    </svg>
                                ) : (
                                    /* Minimize — collapse arrows */
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                                        <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
                                    </svg>
                                )}
                            </button>
                        </div>

                        {/* Task cards list — hidden when minimized */}
                        {!tasksMinimized && (
                            <div style={{ overflowY: "auto", maxHeight: 288, padding: "8px 12px 10px", display: "flex", flexDirection: "column", gap: 7 }}>
                                {groupTasks.map(t => {
                                    const tid = t.taskId || t.id;
                                    const subs = subtaskMap[tid] || [];
                                    const subCount = t.subtaskIds?.length || 0;
                                    const priColor = { low: "#16A34A", medium: "#D97706", high: "#DC2626" }[t.priority] || "#64748B";
                                    const priBg = { low: "#F0FDF4", medium: "#FFFBEB", high: "#FEF2F2" }[t.priority] || "#F8FAFC";
                                    const statusColor = { open: "#2563EB", in_progress: "#D97706", completed: "#16A34A" }[t.status] || "#64748B";
                                    const isNew = !seenTaskIds.has(tid);

                                    const markSeen = () => {
                                        if (!seenTaskIds.has(tid)) {
                                            const next = new Set(seenTaskIds);
                                            next.add(tid);
                                            setSeenTaskIds(next);
                                            try { localStorage.setItem(`seen_tasks_${groupId}`, JSON.stringify([...next])); } catch { }
                                        }
                                    };

                                    return (
                                        <div key={tid}
                                            onClick={() => { markSeen(); router.push(`/coworking/tasks?task=${tid}`); }}
                                            style={{
                                                background: isNew ? "#EFF6FF" : "#fff",
                                                borderRadius: 10,
                                                border: isNew ? "1.5px solid #2563EB" : "1.5px solid #E2E8F0",
                                                cursor: "pointer", overflow: "hidden",
                                                boxShadow: isNew ? "0 2px 8px rgba(37,99,235,0.14)" : "0 1px 4px rgba(0,0,0,0.05)",
                                                transition: "all 0.2s",
                                                position: "relative",
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.boxShadow = "0 3px 12px rgba(37,99,235,0.18)"; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = isNew ? "#2563EB" : "#E2E8F0"; e.currentTarget.style.boxShadow = isNew ? "0 2px 8px rgba(37,99,235,0.14)" : "0 1px 4px rgba(0,0,0,0.05)"; }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px 7px" }}>
                                                <div style={{ width: 26, height: 26, borderRadius: 6, background: isNew ? "#2563EB" : "#EFF6FF", border: isNew ? "none" : "1.5px solid #BFDBFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isNew ? "#fff" : "#2563EB"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12l2 2 4-4" /></svg>
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                                                    {t.description && <div style={{ fontSize: 11, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{t.description}</div>}
                                                    {!t.description && t.notes && <div style={{ fontSize: 11, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{t.notes}</div>}
                                                </div>
                                                {/* NEW badge — disappears on click */}
                                                {isNew && (
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 99,
                                                        background: "#2563EB", color: "#fff", flexShrink: 0,
                                                        animation: "gc-new-pulse 1.8s ease-in-out infinite",
                                                    }}>NEW</span>
                                                )}
                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6" /></svg>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 12px 8px", flexWrap: "wrap" }}>
                                                {t.priority && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, color: priColor, background: priBg, textTransform: "uppercase" }}>{t.priority}</span>}
                                                {t.status && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 4, color: statusColor, background: statusColor + "15", textTransform: "uppercase" }}>{t.status?.replace("_", " ")}</span>}
                                                {t.dueDate && (
                                                    <span style={{ fontSize: 10, color: "#64748B", display: "flex", alignItems: "center", gap: 3 }}>
                                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                                        {new Date(t.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                                    </span>
                                                )}
                                                {subCount > 0 && <span style={{ fontSize: 10, color: "#6366F1", background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 4, padding: "2px 7px", fontWeight: 600 }}>{subCount} subtask{subCount > 1 ? "s" : ""}</span>}
                                            </div>
                                            {subs.length > 0 && (
                                                <div style={{ borderTop: "1px solid #F1F5F9", padding: "5px 12px 8px" }}>
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                                        {subs.map(sub => {
                                                            const subDone = sub.status === "completed" || sub.status === "approved";
                                                            return (
                                                                <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                                    <div style={{ width: 11, height: 11, borderRadius: 3, border: `1.5px solid ${subDone ? "#16A34A" : "#CBD5E1"}`, background: subDone ? "#16A34A" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                                        {subDone && <svg width="7" height="7" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                                                    </div>
                                                                    <span style={{ fontSize: 11, color: subDone ? "#94A3B8" : "#374151", textDecoration: subDone ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.title}</span>
                                                                </div>
                                                            );
                                                        })}
                                                        {subCount > subs.length && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>+{subCount - subs.length} more</div>}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Messages ── */}
                <div style={s.messagesArea}>

                    {/* Chat messages + inline requests merged by timestamp */}
                    {msgsLoading ? (
                        <div style={s.center}><GwSpinner size={30} /></div>
                    ) : messages.length === 0 && groupTasks.length === 0 && threadRequests.length === 0 ? (
                        <GwEmpty icon="💬" title="No messages yet" subtitle="Be the first to say something!" />
                    ) : (() => {
                        // ── Build merged timeline: messages + requests sorted by createdAt ──
                        const tsToMs = (ts) => {
                            if (!ts) return 0;
                            if (ts?.seconds) return ts.seconds * 1000;
                            const d = new Date(ts); return isNaN(d) ? 0 : d.getTime();
                        };

                        const msgItems = messages.map(m => ({
                            _type: "msg",
                            _ms: tsToMs(m.createdAt),
                            ...m,
                        }));

                        const reqItems = threadRequests.map(r => ({
                            _type: "req",
                            _ms: tsToMs(r.createdAt),
                            req: r,
                        }));

                        const merged = [...msgItems, ...reqItems].sort((a, b) => a._ms - b._ms);

                        // ── Add date separators ──
                        const withSeps = [];
                        let lastDate = null;
                        const today = new Date();
                        const yesterday = new Date(Date.now() - 86400000);

                        merged.forEach((item, idx) => {
                            if (item._ms) {
                                const d = new Date(item._ms);
                                let ds;
                                if (d.toDateString() === today.toDateString()) ds = "Today";
                                else if (d.toDateString() === yesterday.toDateString()) ds = "Yesterday";
                                else ds = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                                if (ds !== lastDate) {
                                    withSeps.push({ _type: "sep", label: ds, _key: `sep_${ds}_${idx}` });
                                    lastDate = ds;
                                }
                            }
                            withSeps.push(item);
                        });

                        // ── For showAvatar grouping on messages ──
                        let lastSender = null;
                        return withSeps.map((item, i) => {
                            if (item._type === "sep") {
                                return (
                                    <div key={item._key} style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
                                        <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
                                        <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", padding: "3px 10px", background: "#F3F4F6", borderRadius: 99, border: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>
                                            {item.label}
                                        </span>
                                        <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
                                    </div>
                                );
                            }

                            if (item._type === "req") {
                                lastSender = null; // reset grouping after request card
                                return (
                                    <InlineGroupRequestCard
                                        key={item.req.id}
                                        req={item.req}
                                        employeeId={employeeId}
                                        isCeoOrTl={isCeoOrTl}
                                    />
                                );
                            }

                            // Regular message
                            const showAvatar = item.senderId !== lastSender;
                            lastSender = item.senderId;
                            return (
                                <MessageBubble
                                    key={item.messageId || item.id || i}
                                    msg={{ ...item, senderPicUrl: memberPicMap.get(item.senderId) || "" }}
                                    isMe={item.senderId === employeeId}
                                    showSender={showAvatar}
                                    showAvatar={showAvatar}
                                    isHost={isCeoOrTl}
                                    onViewSummary={handleViewSummary}
                                    onCancel={handleCancelMeet}
                                    onEdit={setEditModal}
                                />
                            );
                        });
                    })()}
                    <div ref={messagesEndRef} />
                </div>

                {/* ── Input ── */}
                <div style={s.inputArea}>
                    <MediaMessageInput
                        onSend={handleSend}
                        placeholder={`Message ${group?.name || "group"}…`}
                        disabled={msgsLoading}
                        members={members}
                    />
                </div>
            </div>

            {/* ── Create Task Modal ── */}
            {showTaskModal && (
                <div onClick={e => { if (e.target === e.currentTarget) setShowTaskModal(false); }}
                    style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }}
                >
                    <div style={{ background: "#fff", borderRadius: 14, width: "min(420px,100%)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", fontFamily: "inherit", overflow: "hidden" }}>
                        {/* Header */}
                        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Create Group Task</div>
                                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>All group members will be assigned</div>
                            </div>
                            <button onClick={() => setShowTaskModal(false)} style={{ width: 26, height: 26, border: "1px solid #E2E8F0", borderRadius: 6, background: "#F8FAFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" /></svg>
                            </button>
                        </div>

                        {/* Form — scrollable so content isn't cut off on small screens */}
                        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: 1 }}>
                            {taskError && <div style={{ padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7, fontSize: 12, color: "#B91C1C" }}>{taskError}</div>}

                            <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Title *</label>
                                <input value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
                                    placeholder="Task title" autoFocus
                                    style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                            </div>

                            <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Description</label>
                                <textarea value={taskForm.description} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))}
                                    placeholder="What needs to be done? Describe the task…" rows={2}
                                    style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Date</label>
                                    <input type="date" value={taskForm.dueDate ? taskForm.dueDate.split("T")[0] : ""}
                                        onChange={e => setTaskForm(p => ({ ...p, dueDate: e.target.value ? `${e.target.value}T${p.dueDate?.split("T")[1] || "09:00"}` : "" }))}
                                        style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Time</label>
                                    <input type="time" value={taskForm.dueDate ? (taskForm.dueDate.split("T")[1] || "09:00") : "09:00"}
                                        disabled={!taskForm.dueDate}
                                        onChange={e => { const d = taskForm.dueDate?.split("T")[0]; if (d) setTaskForm(p => ({ ...p, dueDate: `${d}T${e.target.value}` })); }}
                                        style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box", opacity: taskForm.dueDate ? 1 : 0.4 }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Priority</label>
                                <div style={{ display: "flex", gap: 6 }}>
                                    {[{ v: "low", l: "Low", c: "#16A34A" }, { v: "medium", l: "Normal", c: "#D97706" }, { v: "high", l: "Urgent", c: "#DC2626" }].map(({ v, l, c }) => (
                                        <button key={v} onClick={() => setTaskForm(p => ({ ...p, priority: v }))} type="button"
                                            style={{ flex: 1, padding: "6px 0", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${taskForm.priority === v ? c : "#E2E8F0"}`, background: taskForm.priority === v ? c + "15" : "#fff", color: taskForm.priority === v ? c : "#64748B", transition: "all 0.12s" }}>
                                            {l}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Notes</label>
                                <textarea value={taskForm.notes} onChange={e => setTaskForm(p => ({ ...p, notes: e.target.value }))}
                                    placeholder="Requirements, details…" rows={2}
                                    style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                            </div>

                            {/* Member selector */}
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                                    Assign To
                                    <span style={{ fontSize: 10, fontWeight: 400, color: "#94A3B8", textTransform: "none", marginLeft: 6 }}>CEO not assigned by default</span>
                                </label>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto", border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "6px 8px" }}>
                                    {/* CEO row — at top, unselected by default */}
                                    {(() => {
                                        const ceoMember = members.find(m => m.employeeId === "E000") || (group?.memberIds?.includes("E000") ? { employeeId: "E000", name: "Admin CEO" } : null);
                                        if (!ceoMember) return null;
                                        const sel = selectedMembers?.["E000"] || false;
                                        return (
                                            <div key="E000"
                                                onClick={() => setSelectedMembers(p => ({ ...p, "E000": !p?.["E000"] }))}
                                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, cursor: "pointer", background: sel ? "#EFF6FF" : "#F8FAFC", border: `1px solid ${sel ? "#BFDBFE" : "#E2E8F0"}`, transition: "all 0.12s" }}
                                            >
                                                <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${sel ? "#2563EB" : "#CBD5E1"}`, background: sel ? "#2563EB" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                    {sel && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                                </div>
                                                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#7C3AED", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                    {(ceoMember.name || "C")[0].toUpperCase()}
                                                </div>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A", flex: 1 }}>{ceoMember.name || "Admin CEO"}</span>
                                                <span style={{ fontSize: 9, color: "#7C3AED", background: "#F3E8FF", border: "1px solid #E9D5FF", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>CEO</span>
                                            </div>
                                        );
                                    })()}
                                    {/* All other members */}
                                    {members.filter(m => m.employeeId !== "E000").map(m => {
                                        const sel = selectedMembers?.[m.employeeId] !== false; // default true
                                        const colors = ["#2563EB", "#0891B2", "#16A34A", "#D97706", "#DC2626", "#7C3AED"];
                                        const color = colors[m.employeeId?.charCodeAt(m.employeeId.length - 1) % colors.length] || "#2563EB";
                                        return (
                                            <div key={m.employeeId}
                                                onClick={() => setSelectedMembers(p => ({ ...(p || {}), [m.employeeId]: !(p?.[m.employeeId] !== false) }))}
                                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, cursor: "pointer", background: sel ? "#EFF6FF" : "#fff", border: `1px solid ${sel ? "#BFDBFE" : "#E2E8F0"}`, transition: "all 0.12s" }}
                                            >
                                                <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${sel ? "#2563EB" : "#CBD5E1"}`, background: sel ? "#2563EB" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                    {sel && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                                </div>
                                                {m.profilePicUrl ? (
                                                    <img src={m.profilePicUrl} alt={m.name} style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                                                ) : (
                                                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: color, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                        {(m.name || m.employeeId)[0].toUpperCase()}
                                                    </div>
                                                )}
                                                <span style={{ fontSize: 12, color: "#0F172A", flex: 1 }}>{m.name || m.employeeId}</span>
                                                {m.role && m.role !== "employee" && (
                                                    <span style={{ fontSize: 9, color: "#0891B2", background: "#E0F2FE", border: "1px solid #BAE6FD", borderRadius: 4, padding: "1px 5px", fontWeight: 700, textTransform: "uppercase" }}>{m.role}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>
                                    {Object.values(selectedMembers || {}).filter(Boolean).length} of {members.length} selected
                                </div>
                            </div>
                        </div>

                        {/* Footer — always visible, sticks to bottom */}
                        <div style={{ padding: "12px 20px 18px", display: "flex", gap: 10, flexShrink: 0, borderTop: "1px solid #F1F5F9" }}>
                            <button onClick={() => setShowTaskModal(false)}
                                style={{ flex: 1, padding: "9px 0", border: "1.5px solid #E2E8F0", borderRadius: 8, background: "#F8FAFC", color: "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                                Cancel
                            </button>
                            <button onClick={handleCreateGroupTask} disabled={taskBusy || !taskForm.title.trim()}
                                style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 8, background: taskBusy || !taskForm.title.trim() ? "#93C5FD" : "#2563EB", color: "#fff", fontSize: 13, fontWeight: 600, cursor: taskBusy || !taskForm.title.trim() ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                                {taskBusy ? "Creating…" : "Create Task"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ── Meeting Summary Modal ── */}
            {summaryModal && (
                <MeetingSummaryModal
                    meetId={summaryModal.meetId}
                    meetTitle={summaryModal.meetTitle}
                    onClose={() => setSummaryModal(null)}
                />
            )}

            {/* ── Edit Meeting Modal ── */}
            {editModal && (
                <div onClick={e => { if (e.target === e.currentTarget) setEditModal(null); }}
                    style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}>
                    <div style={{ background: "#fff", borderRadius: 16, width: "min(440px,100%)", boxShadow: "0 24px 60px rgba(0,0,0,0.18)", fontFamily: "inherit", overflow: "hidden" }}>
                        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>✏️ Edit Meeting</div>
                            <button onClick={() => setEditModal(null)} style={{ width: 28, height: 28, border: "1px solid #E2E8F0", borderRadius: 7, background: "#F8FAFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" /></svg>
                            </button>
                        </div>
                        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
                            {editError && <div style={{ padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7, fontSize: 12, color: "#B91C1C" }}>{editError}</div>}
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Title</label>
                                <input value={editModal.title || ""} onChange={e => setEditModal(p => ({ ...p, title: e.target.value }))}
                                    style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Date</label>
                                    <input type="date" value={editModal.dateTime ? editModal.dateTime.split("T")[0] : ""}
                                        onChange={e => setEditModal(p => ({ ...p, dateTime: `${e.target.value}T${p.dateTime?.split("T")[1] || "09:00"}` }))}
                                        style={{ width: "100%", padding: "9px 10px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Time</label>
                                    <input type="time" value={editModal.dateTime ? (editModal.dateTime.split("T")[1] || "09:00") : "09:00"}
                                        onChange={e => { const d = editModal.dateTime?.split("T")[0]; if (d) setEditModal(p => ({ ...p, dateTime: `${d}T${e.target.value}` })); }}
                                        style={{ width: "100%", padding: "9px 10px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Description</label>
                                <textarea value={editModal.description || ""} onChange={e => setEditModal(p => ({ ...p, description: e.target.value }))} rows={2}
                                    style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                            </div>
                        </div>
                        <div style={{ padding: "0 22px 20px", display: "flex", gap: 10 }}>
                            <button onClick={() => setEditModal(null)} style={{ flex: 1, padding: "10px 0", border: "1.5px solid #E2E8F0", borderRadius: 9, background: "#F8FAFC", color: "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                            <button onClick={() => handleEditSave(editModal)} disabled={editSaving}
                                style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 9, background: editSaving ? "#86EFAC" : "#16A34A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: editSaving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                                {editSaving ? "Saving…" : "Save Changes"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Schedule Meeting Modal ── */}
            {showMeetModal && (
                <div onClick={e => { if (e.target === e.currentTarget) setShowMeetModal(false); }}
                    style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}>
                    <div style={{ background: "#fff", borderRadius: 16, width: "min(440px,100%)", boxShadow: "0 24px 60px rgba(0,0,0,0.18)", fontFamily: "inherit", overflow: "hidden" }}>
                        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", display: "flex", alignItems: "center", gap: 8 }}>
                                    <div style={{ width: 30, height: 30, borderRadius: 8, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                    </div>
                                    Schedule Group Meeting
                                </div>
                                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>All {group?.memberIds?.length || 0} members will be invited</div>
                            </div>
                            <button onClick={() => setShowMeetModal(false)} style={{ width: 28, height: 28, border: "1px solid #E2E8F0", borderRadius: 7, background: "#F8FAFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" /></svg>
                            </button>
                        </div>
                        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
                            {meetError && <div style={{ padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7, fontSize: 12, color: "#B91C1C" }}>{meetError}</div>}
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Meeting Title *</label>
                                <input value={meetForm.title} onChange={e => setMeetForm(p => ({ ...p, title: e.target.value }))}
                                    placeholder="e.g. Weekly Standup" autoFocus
                                    style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Date</label>
                                    <input type="date" value={meetForm.dateTime ? meetForm.dateTime.split("T")[0] : ""}
                                        onChange={e => setMeetForm(p => ({ ...p, dateTime: e.target.value ? `${e.target.value}T${p.dateTime?.split("T")[1] || "09:00"}` : "" }))}
                                        style={{ width: "100%", padding: "9px 10px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Time</label>
                                    <input type="time" value={meetForm.dateTime ? (meetForm.dateTime.split("T")[1] || "09:00") : "09:00"}
                                        disabled={!meetForm.dateTime}
                                        onChange={e => { const d = meetForm.dateTime?.split("T")[0]; if (d) setMeetForm(p => ({ ...p, dateTime: `${d}T${e.target.value}` })); }}
                                        style={{ width: "100%", padding: "9px 10px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box", opacity: meetForm.dateTime ? 1 : 0.4 }} />
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Description</label>
                                <textarea value={meetForm.description} onChange={e => setMeetForm(p => ({ ...p, description: e.target.value }))}
                                    placeholder="Agenda, topics to discuss…" rows={2}
                                    style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                            </div>
                            <div style={{ padding: "10px 12px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, fontSize: 12, color: "#15803D", display: "flex", alignItems: "center", gap: 7 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
                                All {group?.memberIds?.length || 0} group members invited automatically
                            </div>
                        </div>
                        <div style={{ padding: "0 22px 20px", display: "flex", gap: 10 }}>
                            <button onClick={() => setShowMeetModal(false)}
                                style={{ flex: 1, padding: "10px 0", border: "1.5px solid #E2E8F0", borderRadius: 9, background: "#F8FAFC", color: "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                                Cancel
                            </button>
                            <button onClick={handleCreateGroupMeeting} disabled={meetBusy || !meetForm.title.trim() || !meetForm.dateTime}
                                style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 9, background: meetBusy || !meetForm.title.trim() || !meetForm.dateTime ? "#86EFAC" : "#16A34A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: meetBusy ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                                {meetBusy ? "Scheduling…" : "Schedule Meeting"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

const s = {
    container: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden", background: "var(--surface)" },
    header: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--gray-200)", background: "var(--surface)", flexShrink: 0, minWidth: 0 },
    backBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: "1.5px solid var(--gray-200)", borderRadius: "var(--radius-md)", background: "var(--gray-50)", cursor: "pointer", color: "var(--gray-600)", flexShrink: 0 },
    headerInfo: { flex: 1, minWidth: 0 },
    headerName: { fontSize: 14, fontWeight: 700, color: "var(--gray-900)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    headerSub: { display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" },
    memberCountTag: { fontSize: 11, color: "var(--gray-500)", background: "var(--gray-100)", padding: "1px 7px", borderRadius: "var(--radius-full)", border: "1px solid var(--gray-200)" },
    groupIdTag: { fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--gray-400)", background: "var(--gray-100)", padding: "1px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--gray-200)" },
    headerActions: { display: "flex", gap: 5, flexShrink: 0, alignItems: "center" },
    headerIconBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: "1.5px solid", borderRadius: "var(--radius-md)", cursor: "pointer", transition: "all var(--transition)" },
    membersPanel: { padding: "10px 18px", borderBottom: "1px solid var(--gray-200)", background: "var(--gray-50)", flexShrink: 0 },
    membersPanelTitle: { fontSize: 10, fontWeight: 700, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 },
    membersList: { display: "flex", flexWrap: "wrap", gap: 6 },
    memberChip: { display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--surface)", borderRadius: "var(--radius-full)", border: "1px solid var(--gray-200)" },
    memberName: { fontSize: 12, color: "var(--gray-700)", fontWeight: 500 },
    memberDept: { fontSize: 10, color: "var(--gray-400)" },
    messagesArea: { flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", background: "var(--gray-50)", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" },
    center: { flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: 40 },
    inputArea: { flexShrink: 0, borderTop: "1px solid var(--gray-200)", background: "var(--surface)" },
};

// Mobile CSS injected once — collapses labeled buttons to icon-only below 480px
const GROUP_CHAT_CSS = `
  @media (max-width: 480px) {
    .gc-btn-label { display: none; }
    .gc-header-btn { padding: 0 !important; width: 34px !important; justify-content: center; }
  }
  .gc-task-cards { display: block !important; }
  @keyframes gc-new-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.75; transform: scale(1.08); }
  }
`;