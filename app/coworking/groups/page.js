"use client";
/**
 * GRAV-CMS/app/coworking/create-group/group-chat/[groupId]/page.js
 *
 * 100% Firestore-native — zero backend API calls for reads.
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
 * UI revision:
 *   - Formal, restrained neutral palette (slate grayscale + single muted accent)
 *   - Horizontal-overflow hardened: every flex child that holds text has
 *     minWidth:0, every row constrains its width, no element can push the
 *     viewport sideways on mobile.
 *
 * Optimistic UI:
 *   1. Message shown instantly (sending=true)
 *   2. Backend write completes → confirmed (sending=false)
 *   3. onSnapshot merges server messages; own optimistic messages are NOT duplicated
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    doc, getDoc, getDocs, setDoc, updateDoc, where,
    collection, query, orderBy, limit, limitToLast, endBefore,
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

// ── Formal neutral design tokens ──────────────────────────
// One muted accent (slate-blue), the rest is a calm grayscale.
const C = {
    ink: "#1F2937",      // primary text
    sub: "#6B7280",      // secondary text
    faint: "#9CA3AF",    // tertiary text
    line: "#E5E7EB",     // borders
    lineSoft: "#F1F2F4", // hairline dividers
    panel: "#FFFFFF",    // card surface
    surface: "#FAFAFA",  // app surface
    fill: "#F4F5F7",     // chip / inactive fill
    accent: "#475569",   // muted slate accent (the only non-gray)
    accentSoft: "#EEF1F5",
    accentLine: "#D8DEE6",
};
// Status tokens — desaturated, formal (no bright greens/ambers/reds)
const STATUS = {
    pending: { color: "#6B7280", bg: "#F4F5F7", border: "#E5E7EB", label: "Pending" },
    approved: { color: "#374151", bg: "#EEF1F5", border: "#D8DEE6", label: "Approved" },
    rejected: { color: "#9B6B6B", bg: "#F6F0F0", border: "#E6D8D8", label: "Rejected" },
};
const PRIORITY = {
    urgent: { color: "#8A4B4B", bg: "#F6F0F0" },
    high: { color: "#7A6A4B", bg: "#F4F1EA" },
    medium: { color: "#4B5563", bg: "#F1F2F4" },
    low: { color: "#6B7280", bg: "#F7F7F8" },
};

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
// ── Inline Request Card — shown directly in chat timeline ──
function InlineGroupRequestCard({ req, employeeId, isCeoOrTl }) {
    const sc = STATUS[req.status] || STATUS.pending;
    const pc = PRIORITY[req.priority] || PRIORITY.medium;
    const isFromMe = req.fromId === employeeId;
    const isToMe = req.toId === employeeId || (req.toIds || []).includes(employeeId);
    const canRespond = (isCeoOrTl || isToMe) && req.status === "pending";

    const fire = (extra) => window.dispatchEvent(new CustomEvent("openRequestPanel", {
        detail: { tab: isToMe ? "received" : "sent", requestId: req.id, ...extra }
    }));

    return (
        <div style={{ display: "flex", justifyContent: isFromMe ? "flex-end" : "flex-start", width: "100%", minWidth: 0, marginBottom: 6 }}>
            <div style={{ maxWidth: 320, width: "100%", minWidth: 0, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, background: C.panel }}>
                {/* Header */}
                <div style={{ background: C.fill, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.line}`, minWidth: 0 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: C.panel, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, textTransform: "uppercase", letterSpacing: "0.05em" }}>Request</div>
                        <div style={{ fontSize: 10, color: C.faint, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>from {req.fromName}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 99, color: sc.color, background: sc.bg, border: `1px solid ${sc.border}`, flexShrink: 0, whiteSpace: "nowrap" }}>{sc.label}</span>
                </div>
                {/* Body */}
                <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{req.subject}</div>
                        {req.priority && <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 4, color: pc.color, background: pc.bg, flexShrink: 0, whiteSpace: "nowrap" }}>{req.priority}</span>}
                    </div>
                    {req.message && <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.5, overflowWrap: "anywhere" }}>{req.message}</div>}
                    {req.dueDate && <div style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>Due {new Date(req.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>}
                    {req.type && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: C.fill, color: C.sub, fontWeight: 600, border: `1px solid ${C.line}`, alignSelf: "flex-start", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{req.type}</span>}
                    {req.attachments?.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", minWidth: 0 }}>
                            {req.attachments.map((att, i) => (
                                <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: 10, color: C.accent, background: C.accentSoft, border: `1px solid ${C.accentLine}`, padding: "2px 8px", borderRadius: 4, textDecoration: "none", fontWeight: 500, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {(att.name || "File").slice(0, 24)}
                                </a>
                            ))}
                        </div>
                    )}
                    {req.responseMessage && (
                        <div style={{ padding: "6px 9px", background: C.fill, borderRadius: 6, fontSize: 11, color: C.ink, borderLeft: `2px solid ${C.line}`, overflowWrap: "anywhere" }}>
                            <strong style={{ fontWeight: 600 }}>Response:</strong> {req.responseMessage}
                        </div>
                    )}
                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 6, marginTop: 4, minWidth: 0 }}>
                        {canRespond && (
                            <button onClick={() => fire({ openRespond: true })}
                                style={{ flex: 1, minWidth: 0, padding: "6px 0", borderRadius: 6, border: `1px solid ${C.accent}`, background: C.accent, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                Respond
                            </button>
                        )}
                        <button onClick={() => fire({ openChat: true })}
                            style={{ flex: 1, minWidth: 0, padding: "6px 0", borderRadius: 6, border: `1px solid ${C.line}`, background: C.panel, color: C.ink, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            Chat
                        </button>
                        <button onClick={() => fire({})}
                            style={{ flex: 1, minWidth: 0, padding: "6px 0", borderRadius: 6, border: `1px solid ${C.line}`, background: C.panel, color: C.ink, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            View
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Collapsible requests bar ──────────────────────────────
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
        <div ref={panelRef} style={{ position: "relative", flexShrink: 0, minWidth: 0 }}>
            <button onClick={() => setOpen(p => !p)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", background: open ? C.fill : C.surface, border: "none", borderBottom: `1px solid ${C.line}`, cursor: "pointer", fontFamily: "inherit", minWidth: 0, boxSizing: "border-box" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.ink, flex: 1, minWidth: 0, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{requests.length} Request{requests.length !== 1 ? "s" : ""}</span>
                {pending > 0 && <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 99, background: C.fill, color: C.sub, border: `1px solid ${C.line}`, flexShrink: 0, whiteSpace: "nowrap" }}>{pending} pending</span>}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2.5" strokeLinecap="round" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {open && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, background: C.panel, border: `1px solid ${C.line}`, borderTop: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.10)", maxHeight: "60vh", overflowY: "auto", overflowX: "hidden", padding: 8, display: "flex", flexDirection: "column", gap: 6, boxSizing: "border-box" }}>
                    {requests.map(req => (
                        <GroupRequestCard key={req.id} req={req} employeeId={employeeId} employeeName={employeeName} isCeoOrTl={isCeoOrTl} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Group Request Card (compact, used inside the bar) ─────
function GroupRequestCard({ req, employeeId, isCeoOrTl }) {
    const sc = STATUS[req.status] || STATUS.pending;
    const pc = PRIORITY[req.priority] || PRIORITY.medium;
    const isToMe = req.toId === employeeId || (req.toIds || []).includes(employeeId);
    const canRespond = (isCeoOrTl || isToMe) && req.status === "pending";

    const openPanel = (tab) => window.dispatchEvent(new CustomEvent("openRequestPanel", {
        detail: { tab, requestId: req.id }
    }));

    return (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: C.surface, borderBottom: `1px solid ${C.line}`, minWidth: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{req.subject}</span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 99, color: sc.color, background: sc.bg, border: `1px solid ${sc.border}`, flexShrink: 0, whiteSpace: "nowrap" }}>{sc.label}</span>
            </div>
            <div style={{ padding: "7px 12px 9px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>from {req.fromName}</div>
                    {req.priority && <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4, color: pc.color, background: pc.bg, flexShrink: 0, whiteSpace: "nowrap" }}>{req.priority}</span>}
                </div>
                {req.message && <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{req.message}</div>}
                {req.dueDate && <div style={{ fontSize: 10, color: C.sub, fontWeight: 600, marginTop: 3 }}>Due {new Date(req.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>}
                {req.attachments?.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4, minWidth: 0 }}>
                        {req.attachments.map((att, i) => <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: C.accent, background: C.accentSoft, border: `1px solid ${C.accentLine}`, padding: "1px 7px", borderRadius: 4, textDecoration: "none", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(att.name || "File").slice(0, 20)}</a>)}
                    </div>
                )}
                {req.responseMessage && <div style={{ marginTop: 4, fontSize: 10, color: C.ink, background: C.fill, borderLeft: `2px solid ${C.line}`, padding: "3px 7px", borderRadius: "0 4px 4px 0", overflowWrap: "anywhere" }}><strong style={{ fontWeight: 600 }}>Response:</strong> {req.responseMessage}</div>}

                <div style={{ display: "flex", gap: 6, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.lineSoft}`, minWidth: 0 }}>
                    {canRespond && (
                        <button onClick={() => openPanel("received")}
                            style={{ flex: 1, minWidth: 0, padding: "5px 0", borderRadius: 6, border: `1px solid ${C.accent}`, background: C.accent, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            Respond
                        </button>
                    )}
                    <button onClick={() => openPanel(isToMe ? "received" : "sent")}
                        style={{ flex: 1, minWidth: 0, padding: "5px 0", borderRadius: 6, border: `1px solid ${C.line}`, background: C.panel, color: C.ink, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Chat
                    </button>
                    <button onClick={() => openPanel(isToMe ? "received" : "sent")}
                        style={{ flex: 1, minWidth: 0, padding: "5px 0", borderRadius: 6, border: `1px solid ${C.line}`, background: C.panel, color: C.ink, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        View
                    </button>
                </div>
            </div>
        </div>
    );
}


export default function GroupChatView({ groupId, onBack }) {
    const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
    const router = useRouter();

    const [group, setGroup] = useState(null);
    const [members, setMembers] = useState([]);
    const memberPicMap = new Map(members.map(m => [m.employeeId, m.profilePicUrl || ""]));
    const [messages, setMessages] = useState([]);
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

    // ── Reply / Edit state ─────────────────────────────────────────────────
    const [replyTo, setReplyTo] = useState(null);
    const [editingMsg, setEditingMsg] = useState(null);
    const [editText, setEditText] = useState("");
    const editInputRef = useRef(null);

    const [pasteUploading, setPasteUploading] = useState(false);
    const [copyToast, setCopyToast] = useState(false);
    const copyToastTimerRef = useRef(null);
    const showCopyToast = () => {
        setCopyToast(true);
        if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
        copyToastTimerRef.current = setTimeout(() => setCopyToast(false), 1500);
    };

    const [taskForm, setTaskForm] = useState({ title: "", description: "", dueDate: "", notes: "", priority: "medium" });
    const [taskBusy, setTaskBusy] = useState(false);
    const [taskError, setTaskError] = useState("");
    const [groupTasks, setGroupTasks] = useState([]);
    const [subtaskMap, setSubtaskMap] = useState({});
    const [tasksMinimized, setTasksMinimized] = useState(false);
    const [seenTaskIds, setSeenTaskIds] = useState(() => {
        try { return new Set(JSON.parse(localStorage.getItem(`seen_tasks_${groupId}`) || "[]")); }
        catch { return new Set(); }
    });
    const [selectedMembers, setSelectedMembers] = useState(null);
    const messagesEndRef = useRef(null);
    const unsubRef = useRef(null);
    const pendingMapRef = useRef(new Map());
    const messagesContainerRef = useRef(null);
    const oldestDocRef = useRef(null);
    const prevGroupIdRef = useRef(null);
    const [hasMoreMsgs, setHasMoreMsgs] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [imgLightbox, setImgLightbox] = useState(null);

    // ── Load group doc + member details ──────────────────────
    const loadGroup = useCallback(async () => {
        if (!groupId) return;
        try {
            const snap = await getDoc(doc(firebaseDb, "cowork_groups", groupId));
            if (!snap.exists()) return;
            const g = { id: snap.id, ...snap.data() };
            setGroup(g);

            if (g.memberIds?.length) {
                const memberDocs = await Promise.all(
                    g.memberIds.map(id => getDoc(doc(firebaseDb, "cowork_employees", id)))
                );
                const memberList = memberDocs
                    .filter(d => d.exists())
                    .map(d => ({ employeeId: d.id, ...d.data() }));
                setMembers(memberList);
                setGroup(prev => prev ? { ...prev, members: memberList } : prev);
            }
        } catch (e) { console.error("loadGroup:", e); }
    }, [groupId]);

    // ── Real-time messages listener ───────────────────────────
    const setupListener = useCallback(() => {
        if (!groupId) return;
        setMsgsLoading(true);

        const msgsRef = collection(firebaseDb, "cowork_groups", groupId, "messages");
        const q = query(msgsRef, orderBy("createdAt", "asc"), limitToLast(300));

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

                const toRead = snap.docs.filter(d => {
                    const data = d.data();
                    return data.senderId !== employeeId && !(data.readBy || []).includes(employeeId);
                });
                if (toRead.length > 0) {
                    const batch = writeBatch(firebaseDb);
                    toRead.forEach(d => batch.update(d.ref, { readBy: arrayUnion(employeeId) }));
                    batch.commit().catch(err => console.error("group mark read:", err));
                }

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

    // ── Send message ─────────────────────────────────────────
    const handleSend = async (text, attachments, messageType, mentions = []) => {
        if (!groupId || !employeeId) return;

        const tempId = "temp_" + Date.now();
        const resolvedType = resolveType(messageType, attachments);
        const currentReplyTo = replyTo;   // capture before clearing
        setReplyTo(null);                 // clear the "Replying to" banner immediately

        const optimistic = {
            messageId: tempId,
            threadType: "group",
            threadId: groupId,
            senderId: employeeId,
            senderName: employeeName,
            text: text || "",
            attachments: attachments || [],
            mentions: Array.isArray(mentions) ? mentions : [],
            messageType: resolvedType,
            type: resolvedType,
            readBy: [employeeId],
            ...(currentReplyTo ? { replyTo: currentReplyTo } : {}),
            temp: true,
            sending: true,
            error: false,
            createdAt: new Date().toISOString(),
        };

        setMessages(prev => [...prev, optimistic]);

        try {
            const result = await apiFetch(`/group/${groupId}/message`, {
                method: "POST",
                body: JSON.stringify({
                    text: text || "",
                    attachments: attachments || [],
                    messageType: resolvedType,
                    mentions: Array.isArray(mentions) ? mentions : [],
                    ...(currentReplyTo ? { replyTo: currentReplyTo } : {}),
                }),
            });

            const messageId = result.message?.messageId || result.messageId;
            if (messageId) pendingMapRef.current.set(tempId, messageId);

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

    // ── Delete / Edit / Reply handlers ────────────────────────────────────
    const handleDeleteMsg = async (msg) => {
        if (!msg || msg.senderId !== employeeId) return;
        const msgId = msg.messageId || msg.id;
        if (!msgId || msgId.startsWith("temp_")) return;
        try {
            await updateDoc(doc(firebaseDb, "cowork_groups", groupId, "messages", msgId), {
                isDeleted: true, text: "", attachments: [], deletedAt: serverTimestamp(),
            });
        } catch (e) { console.error("deleteMsg:", e); }
    };

    const handleGroupEditSave = async () => {
        if (!editingMsg || !editText.trim()) return;
        const msgId = editingMsg.messageId || editingMsg.id;
        if (!msgId || msgId.startsWith("temp_")) return;
        try {
            await updateDoc(doc(firebaseDb, "cowork_groups", groupId, "messages", msgId), {
                text: editText.trim(), isEdited: true, editedAt: serverTimestamp(),
            });
            setEditingMsg(null); setEditText("");
        } catch (e) { console.error("editMsg:", e); }
    };

    // Jump to the original message when a reply quote is clicked.
    // Scope: only the loaded window (last 100 msgs) — no pagination in this component.
    const jumpToMessage = (targetMsgId) => {
        if (!targetMsgId) return;
        const el = document.getElementById(`gc-msg-${targetMsgId}`);
        if (!el) { console.warn("[jumpToMessage] original not in the loaded 100 messages:", targetMsgId); return; }
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setJumpHighlightId(targetMsgId);
        setTimeout(() => setJumpHighlightId(cur => (cur === targetMsgId ? null : cur)), 1900);
    };

    const handleReply = (msg) => {
        setReplyTo({ messageId: msg.messageId || msg.id, senderName: msg.senderName || "Unknown", text: (msg.text || "").slice(0, 120) });
        setEditingMsg(null);
    };

    const handleOpenEdit = (msg) => {
        if (msg.senderId !== employeeId) return;
        setEditingMsg(msg); setEditText(msg.text || ""); setReplyTo(null);
        setTimeout(() => editInputRef.current?.focus(), 50);
    };

    // Load tasks from group doc's taskIds array
    useEffect(() => {
        if (!groupId) return;
        const unsub = onSnapshot(doc(firebaseDb, "cowork_groups", groupId),
            async snap => {
                const taskIds = snap.data()?.taskIds || [];
                if (taskIds.length === 0) { setGroupTasks([]); setSubtaskMap({}); return; }
                const taskDocs = await Promise.all(taskIds.map(tid => getDoc(doc(firebaseDb, "cowork_tasks", tid))));
                const tasks = taskDocs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() }));
                setGroupTasks(tasks);

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

    // Init selectedMembers when group loads
    useEffect(() => {
        if (!group || selectedMembers !== null) return;
        const memberIds = group.memberIds || [];
        const initial = {};
        memberIds.forEach(id => { initial[id] = id !== "E000"; });
        setSelectedMembers(initial);
    }, [group, selectedMembers]);

    // ── Thread request listener ──────────────────────────────
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

    // ── Access check ─────────────────────────────────────────
    if (group && employeeId) {
        const memberIds = group.memberIds || [];
        const isMember = memberIds.includes(employeeId) || employeeId === "E000";
        if (!isMember) {
            return (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 12, padding: 20, textAlign: "center" }}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Access Denied</div>
                    <div style={{ fontSize: 13, color: C.sub }}>You are not a member of this group.</div>
                    <button onClick={() => router.push("/coworking/create-group")}
                        style={{ marginTop: 8, padding: "8px 20px", background: C.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
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
                lastMessage: { text: `Meeting invite: ${meetForm.title.trim()}`, senderId: employeeId, senderName: employeeName, messageType: "meeting_invite", sentAt: serverTimestamp() },
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
            const createdTaskId = result?.taskId || result?.task?.taskId;
            if (createdTaskId) {
                await updateDoc(doc(firebaseDb, "cowork_groups", groupId), {
                    taskIds: arrayUnion(createdTaskId),
                });

                const chatMsgId = crypto.randomUUID();
                const msgsRef = collection(firebaseDb, "cowork_groups", groupId, "messages");
                await setDoc(doc(msgsRef, chatMsgId), {
                    messageId: chatMsgId,
                    senderId: "system",
                    senderName: "System",
                    text: `Task created — "${taskForm.title.trim()}" · ID: ${createdTaskId} · by ${employeeName}`,
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
                        text: `Task created: ${taskForm.title.trim()}`,
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

            {/* Copy toast */}
            {copyToast && (
                <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: C.ink, color: "#fff", padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.18)", pointerEvents: "none", animation: "gc-toast-in 0.15s ease" }}>
                    Copied to clipboard
                </div>
            )}

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
                        {/* Request */}
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
                            style={s.headerTextBtn}
                            title="Send a request to all group members"
                            className="gc-header-btn"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                            <span className="gc-btn-label">Request</span>
                        </button>

                        {/* Schedule Meeting — CEO/TL only */}
                        {isCeoOrTl && (
                            <button
                                onClick={() => { setShowMeetModal(true); setMeetError(""); }}
                                style={s.headerTextBtn}
                                title="Schedule a meeting with this group"
                                className="gc-header-btn"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                <span className="gc-btn-label">Meeting</span>
                            </button>
                        )}

                        {/* Create Task — CEO/TL only */}
                        {isCeoOrTl && (
                            <button
                                onClick={() => {
                                    const memberIds = group?.memberIds || [];
                                    const init = {};
                                    memberIds.forEach(id => { init[id] = id !== "E000"; });
                                    setSelectedMembers(init);
                                    setTaskError("");
                                    setTaskForm({ title: "", description: "", dueDate: "", notes: "", priority: "medium" });
                                    setShowTaskModal(true);
                                }}
                                style={s.headerIconBtn}
                                title="Create Task for this group"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                                </svg>
                            </button>
                        )}

                        {/* Members toggle */}
                        <button
                            onClick={() => setShowMembers(p => !p)}
                            style={{
                                ...s.headerIconBtn,
                                background: showMembers ? C.fill : C.surface,
                                borderColor: showMembers ? C.accentLine : C.line,
                                color: showMembers ? C.accent : C.sub,
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

                {/* ── Thread Requests — collapsible ── */}
                {threadRequests.length > 0 && (
                    <GroupRequestsBar requests={threadRequests} employeeId={employeeId} employeeName={employeeName} isCeoOrTl={isCeoOrTl} />
                )}

                {/* ── Pinned Task Panel ── */}
                {groupTasks.length > 0 && (
                    <div style={{
                        flexShrink: 0,
                        borderBottom: `1px solid ${C.line}`,
                        background: C.panel,
                        transition: "max-height 0.28s cubic-bezier(0.4,0,0.2,1)",
                        maxHeight: tasksMinimized ? 44 : 340,
                        overflow: "hidden",
                        minWidth: 0,
                    }}>
                        {/* Panel header */}
                        <div style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "10px 16px",
                            borderBottom: tasksMinimized ? "none" : `1px solid ${C.lineSoft}`,
                            background: C.surface,
                            cursor: "pointer", userSelect: "none", minWidth: 0,
                        }} onClick={() => setTasksMinimized(p => !p)}>
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: C.fill, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12l2 2 4-4" /></svg>
                            </div>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: C.ink, letterSpacing: "-0.01em", display: "flex", alignItems: "center", overflow: "hidden" }}>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Group Tasks</span>
                                <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: C.fill, color: C.sub, border: `1px solid ${C.line}`, flexShrink: 0 }}>
                                    {groupTasks.length}
                                </span>
                                {(() => {
                                    const newCount = groupTasks.filter(t => !seenTaskIds.has(t.taskId || t.id)).length;
                                    return newCount > 0 ? (
                                        <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: C.accent, color: "#fff", flexShrink: 0 }}>
                                            {newCount} NEW
                                        </span>
                                    ) : null;
                                })()}
                            </span>
                            <button
                                onClick={e => { e.stopPropagation(); setTasksMinimized(p => !p); }}
                                style={{ width: 26, height: 26, border: `1px solid ${C.line}`, borderRadius: 6, background: C.panel, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, flexShrink: 0, transition: "all 0.15s" }}
                                title={tasksMinimized ? "Expand tasks" : "Collapse tasks"}
                            >
                                {tasksMinimized ? (
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                                        <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                                    </svg>
                                ) : (
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                                        <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
                                    </svg>
                                )}
                            </button>
                        </div>

                        {!tasksMinimized && (
                            <div style={{ overflowY: "auto", overflowX: "hidden", maxHeight: 288, padding: "8px 12px 10px", display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
                                {groupTasks.map(t => {
                                    const tid = t.taskId || t.id;
                                    const subs = subtaskMap[tid] || [];
                                    const subCount = t.subtaskIds?.length || 0;
                                    const pri = PRIORITY[t.priority] || PRIORITY.medium;
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
                                                background: isNew ? C.surface : C.panel,
                                                borderRadius: 8,
                                                border: `1px solid ${isNew ? C.accentLine : C.line}`,
                                                cursor: "pointer", overflow: "hidden",
                                                transition: "border-color 0.15s",
                                                position: "relative", minWidth: 0,
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = isNew ? C.accentLine : C.line; }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px 7px", minWidth: 0 }}>
                                                <div style={{ width: 26, height: 26, borderRadius: 6, background: C.fill, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12l2 2 4-4" /></svg>
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                                                    {t.description && <div style={{ fontSize: 11, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{t.description}</div>}
                                                    {!t.description && t.notes && <div style={{ fontSize: 11, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{t.notes}</div>}
                                                </div>
                                                {isNew && (
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                                                        background: C.accent, color: "#fff", flexShrink: 0, whiteSpace: "nowrap",
                                                    }}>NEW</span>
                                                )}
                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6" /></svg>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 12px 8px", flexWrap: "wrap", minWidth: 0 }}>
                                                {t.priority && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, color: pri.color, background: pri.bg, textTransform: "uppercase", whiteSpace: "nowrap" }}>{t.priority}</span>}
                                                {t.status && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 4, color: C.sub, background: C.fill, border: `1px solid ${C.line}`, textTransform: "uppercase", whiteSpace: "nowrap" }}>{t.status?.replace("_", " ")}</span>}
                                                {t.dueDate && (
                                                    <span style={{ fontSize: 10, color: C.sub, display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
                                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                                        {new Date(t.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                                    </span>
                                                )}
                                                {subCount > 0 && <span style={{ fontSize: 10, color: C.sub, background: C.fill, border: `1px solid ${C.line}`, borderRadius: 4, padding: "2px 7px", fontWeight: 600, whiteSpace: "nowrap" }}>{subCount} subtask{subCount > 1 ? "s" : ""}</span>}
                                            </div>
                                            {subs.length > 0 && (
                                                <div style={{ borderTop: `1px solid ${C.lineSoft}`, padding: "5px 12px 8px", minWidth: 0 }}>
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                                                        {subs.map(sub => {
                                                            const subDone = sub.status === "completed" || sub.status === "approved";
                                                            return (
                                                                <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                                                    <div style={{ width: 11, height: 11, borderRadius: 3, border: `1.5px solid ${subDone ? C.accent : C.line}`, background: subDone ? C.accent : C.panel, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                                        {subDone && <svg width="7" height="7" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                                                    </div>
                                                                    <span style={{ fontSize: 11, color: subDone ? C.faint : C.ink, textDecoration: subDone ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{sub.title}</span>
                                                                </div>
                                                            );
                                                        })}
                                                        {subCount > subs.length && <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>+{subCount - subs.length} more</div>}
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
                    {msgsLoading ? (
                        <div style={s.center}><GwSpinner size={30} /></div>
                    ) : messages.length === 0 && groupTasks.length === 0 && threadRequests.length === 0 ? (
                        <GwEmpty icon="💬" title="No messages yet" subtitle="Be the first to say something." />
                    ) : (() => {
                        const tsToMs = (ts) => {
                            if (!ts) return 0;
                            if (ts?.seconds) return ts.seconds * 1000;
                            const d = new Date(ts); return isNaN(d) ? 0 : d.getTime();
                        };

                        const msgItems = messages.map(m => ({ _type: "msg", _ms: tsToMs(m.createdAt), ...m }));
                        const reqItems = threadRequests.map(r => ({ _type: "req", _ms: tsToMs(r.createdAt), req: r }));
                        const merged = [...msgItems, ...reqItems].sort((a, b) => a._ms - b._ms);

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

                        let lastSender = null;
                        return withSeps.map((item, i) => {
                            if (item._type === "sep") {
                                return (
                                    <div key={item._key} style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0", minWidth: 0 }}>
                                        <div style={{ flex: 1, height: 1, background: C.line }} />
                                        <span style={{ fontSize: 10, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: "0.05em", padding: "3px 10px", background: C.fill, borderRadius: 99, border: `1px solid ${C.line}`, whiteSpace: "nowrap", flexShrink: 0 }}>
                                            {item.label}
                                        </span>
                                        <div style={{ flex: 1, height: 1, background: C.line }} />
                                    </div>
                                );
                            }

                            if (item._type === "req") {
                                lastSender = null;
                                return (
                                    <InlineGroupRequestCard
                                        key={item.req.id}
                                        req={item.req}
                                        employeeId={employeeId}
                                        isCeoOrTl={isCeoOrTl}
                                    />
                                );
                            }

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
                                    currentUserId={employeeId}
                                    onReply={handleReply}
                                    onDeleteMsg={handleDeleteMsg}
                                    onEditMsg={handleOpenEdit}
                                    onImageClick={(url, name) => setImgLightbox({ url, name })}
                                />
                            );
                        });
                    })()}
                    <div ref={messagesEndRef} />
                </div>

                {/* ── Input ── */}
                <div style={s.inputArea} onPaste={async (e) => {
                    const items = Array.from(e.clipboardData?.items || []);
                    const imageItem = items.find(it => it.type.startsWith("image/"));
                    if (!imageItem) return;
                    e.preventDefault();
                    const file = imageItem.getAsFile();
                    if (!file) return;
                    setPasteUploading(true);
                    try {
                        const { uploadImage } = await import("../../../lib/mediaUploadApi");
                        const result = await uploadImage(file, "cowork-group");
                        window.dispatchEvent(new CustomEvent("dm_paste_attachment", {
                            detail: { type: "image", url: result.url, name: "pasted_image.png" }
                        }));
                    } catch (err) {
                        console.error("paste upload failed:", err);
                    } finally {
                        setPasteUploading(false);
                    }
                }}>
                    {pasteUploading && (
                        <div style={{ padding: "6px 14px", background: C.fill, borderBottom: `1px solid ${C.line}`, fontSize: 11, color: C.sub, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <div style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${C.line}`, borderTopColor: C.accent, animation: "gc-spin 0.7s linear infinite", flexShrink: 0 }} />
                            Uploading pasted image…
                        </div>
                    )}
                    {replyTo && !editingMsg && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderTop: "1px solid #E5E7EB", background: "#F0F7FF", borderLeft: "3px solid #2563EB" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#2563EB" }}>Replying to {replyTo.senderName}</div>
                                <div style={{ fontSize: 12, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyTo.text || "📎 Attachment"}</div>
                            </div>
                            <button onClick={() => setReplyTo(null)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#9CA3AF", fontSize: 16, lineHeight: 1 }}>✕</button>
                        </div>
                    )}
                    {editingMsg ? (
                        <div style={{ padding: "10px 14px", borderTop: "1px solid #E5E7EB" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#2563EB" }}>✎ Editing message</span>
                                <button onClick={() => { setEditingMsg(null); setEditText(""); }} style={{ fontSize: 12, color: "#9CA3AF", border: "none", background: "transparent", cursor: "pointer" }}>✕ Cancel</button>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                                <textarea ref={editInputRef} value={editText} onChange={e => setEditText(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGroupEditSave(); } if (e.key === "Escape") { setEditingMsg(null); setEditText(""); } }}
                                    rows={2} style={{ flex: 1, resize: "none", border: "1.5px solid #2563EB", borderRadius: 10, padding: "8px 12px", fontSize: 14, fontFamily: "inherit", outline: "none", color: "#111827", lineHeight: 1.5 }} />
                                <button onClick={handleGroupEditSave} disabled={!editText.trim()}
                                    style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: editText.trim() ? "#2563EB" : "#E5E7EB", color: editText.trim() ? "#fff" : "#9CA3AF", fontSize: 13, fontWeight: 600, cursor: editText.trim() ? "pointer" : "default", fontFamily: "inherit", flexShrink: 0 }}>Save</button>
                            </div>
                            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>Enter to save · Esc to cancel</div>
                        </div>
                    ) : (
                        <MediaMessageInput
                            onSend={handleSend}
                            placeholder={`Message ${group?.name || "group"}…`}
                            disabled={msgsLoading || pasteUploading}
                            members={members}
                        />
                    )}
                </div>
            </div>

            {/* ── Create Task Modal ── */}
            {showTaskModal && (
                <div onClick={e => { if (e.target === e.currentTarget) setShowTaskModal(false); }}
                    style={s.modalOverlay}
                >
                    <div style={{ background: C.panel, borderRadius: 12, width: "min(420px,100%)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.16)", fontFamily: "inherit", overflow: "hidden", boxSizing: "border-box" }}>
                        <div style={{ padding: "16px 20px 14px", borderBottom: `1px solid ${C.lineSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Create Group Task</div>
                                <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>Selected members will be assigned</div>
                            </div>
                            <button onClick={() => setShowTaskModal(false)} style={s.modalClose}>
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke={C.sub} strokeWidth="1.8" strokeLinecap="round" /></svg>
                            </button>
                        </div>

                        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", overflowX: "hidden", flex: 1, minWidth: 0 }}>
                            {taskError && <div style={s.formError}>{taskError}</div>}

                            <div style={{ minWidth: 0 }}>
                                <label style={s.label}>Title *</label>
                                <input value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
                                    placeholder="Task title" autoFocus style={s.input} />
                            </div>

                            <div style={{ minWidth: 0 }}>
                                <label style={s.label}>Description</label>
                                <textarea value={taskForm.description} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))}
                                    placeholder="What needs to be done?" rows={2} style={{ ...s.input, resize: "vertical" }} />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, minWidth: 0 }}>
                                <div style={{ minWidth: 0 }}>
                                    <label style={s.label}>Date</label>
                                    <input type="date" value={taskForm.dueDate ? taskForm.dueDate.split("T")[0] : ""}
                                        onChange={e => setTaskForm(p => ({ ...p, dueDate: e.target.value ? `${e.target.value}T${p.dueDate?.split("T")[1] || "09:00"}` : "" }))}
                                        style={{ ...s.input, fontSize: 12 }} />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <label style={s.label}>Time</label>
                                    <input type="time" value={taskForm.dueDate ? (taskForm.dueDate.split("T")[1] || "09:00") : "09:00"}
                                        disabled={!taskForm.dueDate}
                                        onChange={e => { const d = taskForm.dueDate?.split("T")[0]; if (d) setTaskForm(p => ({ ...p, dueDate: `${d}T${e.target.value}` })); }}
                                        style={{ ...s.input, fontSize: 12, opacity: taskForm.dueDate ? 1 : 0.4 }} />
                                </div>
                            </div>

                            <div style={{ minWidth: 0 }}>
                                <label style={s.label}>Priority</label>
                                <div style={{ display: "flex", gap: 6, minWidth: 0 }}>
                                    {[{ v: "low", l: "Low" }, { v: "medium", l: "Normal" }, { v: "high", l: "Urgent" }].map(({ v, l }) => (
                                        <button key={v} onClick={() => setTaskForm(p => ({ ...p, priority: v }))} type="button"
                                            style={{ flex: 1, minWidth: 0, padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${taskForm.priority === v ? C.accent : C.line}`, background: taskForm.priority === v ? C.accentSoft : C.panel, color: taskForm.priority === v ? C.accent : C.sub, transition: "all 0.12s" }}>
                                            {l}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ minWidth: 0 }}>
                                <label style={s.label}>Notes</label>
                                <textarea value={taskForm.notes} onChange={e => setTaskForm(p => ({ ...p, notes: e.target.value }))}
                                    placeholder="Requirements, details…" rows={2} style={{ ...s.input, resize: "vertical" }} />
                            </div>

                            {/* Member selector */}
                            <div style={{ minWidth: 0 }}>
                                <label style={{ ...s.label, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                                    <span>Assign To</span>
                                    <span style={{ fontSize: 10, fontWeight: 400, color: C.faint, textTransform: "none" }}>CEO not assigned by default</span>
                                </label>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto", overflowX: "hidden", border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 8px", minWidth: 0 }}>
                                    {(() => {
                                        const ceoMember = members.find(m => m.employeeId === "E000") || (group?.memberIds?.includes("E000") ? { employeeId: "E000", name: "Admin CEO" } : null);
                                        if (!ceoMember) return null;
                                        const sel = selectedMembers?.["E000"] || false;
                                        return (
                                            <div key="E000"
                                                onClick={() => setSelectedMembers(p => ({ ...p, "E000": !p?.["E000"] }))}
                                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, cursor: "pointer", background: sel ? C.accentSoft : C.surface, border: `1px solid ${sel ? C.accentLine : C.line}`, transition: "all 0.12s", minWidth: 0 }}
                                            >
                                                <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${sel ? C.accent : C.line}`, background: sel ? C.accent : C.panel, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                    {sel && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                                </div>
                                                <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.accent, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                    {(ceoMember.name || "C")[0].toUpperCase()}
                                                </div>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: C.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ceoMember.name || "Admin CEO"}</span>
                                                <span style={{ fontSize: 9, color: C.sub, background: C.fill, border: `1px solid ${C.line}`, borderRadius: 4, padding: "1px 5px", fontWeight: 700, flexShrink: 0 }}>CEO</span>
                                            </div>
                                        );
                                    })()}
                                    {members.filter(m => m.employeeId !== "E000").map(m => {
                                        const sel = selectedMembers?.[m.employeeId] !== false;
                                        return (
                                            <div key={m.employeeId}
                                                onClick={() => setSelectedMembers(p => ({ ...(p || {}), [m.employeeId]: !(p?.[m.employeeId] !== false) }))}
                                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, cursor: "pointer", background: sel ? C.accentSoft : C.panel, border: `1px solid ${sel ? C.accentLine : C.line}`, transition: "all 0.12s", minWidth: 0 }}
                                            >
                                                <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${sel ? C.accent : C.line}`, background: sel ? C.accent : C.panel, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                    {sel && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                                </div>
                                                {m.profilePicUrl ? (
                                                    <img src={m.profilePicUrl} alt={m.name} style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                                                ) : (
                                                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.fill, border: `1px solid ${C.line}`, color: C.sub, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                        {(m.name || m.employeeId)[0].toUpperCase()}
                                                    </div>
                                                )}
                                                <span style={{ fontSize: 12, color: C.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name || m.employeeId}</span>
                                                {m.role && m.role !== "employee" && (
                                                    <span style={{ fontSize: 9, color: C.sub, background: C.fill, border: `1px solid ${C.line}`, borderRadius: 4, padding: "1px 5px", fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>{m.role}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>
                                    {Object.values(selectedMembers || {}).filter(Boolean).length} of {members.length} selected
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: "12px 20px 18px", display: "flex", gap: 10, flexShrink: 0, borderTop: `1px solid ${C.lineSoft}`, minWidth: 0 }}>
                            <button onClick={() => setShowTaskModal(false)} style={s.btnSecondary}>Cancel</button>
                            <button onClick={handleCreateGroupTask} disabled={taskBusy || !taskForm.title.trim()}
                                style={{ ...s.btnPrimary, opacity: taskBusy || !taskForm.title.trim() ? 0.5 : 1, cursor: taskBusy || !taskForm.title.trim() ? "not-allowed" : "pointer" }}>
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
                <div onClick={e => { if (e.target === e.currentTarget) setEditModal(null); }} style={s.modalOverlay}>
                    <div style={{ background: C.panel, borderRadius: 12, width: "min(440px,100%)", boxShadow: "0 20px 60px rgba(0,0,0,0.16)", fontFamily: "inherit", overflow: "hidden", boxSizing: "border-box" }}>
                        <div style={{ padding: "16px 22px 14px", borderBottom: `1px solid ${C.lineSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Edit Meeting</div>
                            <button onClick={() => setEditModal(null)} style={s.modalClose}>
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke={C.sub} strokeWidth="1.8" strokeLinecap="round" /></svg>
                            </button>
                        </div>
                        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
                            {editError && <div style={s.formError}>{editError}</div>}
                            <div style={{ minWidth: 0 }}>
                                <label style={s.label}>Title</label>
                                <input value={editModal.title || ""} onChange={e => setEditModal(p => ({ ...p, title: e.target.value }))} style={s.input} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, minWidth: 0 }}>
                                <div style={{ minWidth: 0 }}>
                                    <label style={s.label}>Date</label>
                                    <input type="date" value={editModal.dateTime ? editModal.dateTime.split("T")[0] : ""}
                                        onChange={e => setEditModal(p => ({ ...p, dateTime: `${e.target.value}T${p.dateTime?.split("T")[1] || "09:00"}` }))}
                                        style={{ ...s.input, fontSize: 12 }} />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <label style={s.label}>Time</label>
                                    <input type="time" value={editModal.dateTime ? (editModal.dateTime.split("T")[1] || "09:00") : "09:00"}
                                        onChange={e => { const d = editModal.dateTime?.split("T")[0]; if (d) setEditModal(p => ({ ...p, dateTime: `${d}T${e.target.value}` })); }}
                                        style={{ ...s.input, fontSize: 12 }} />
                                </div>
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <label style={s.label}>Description</label>
                                <textarea value={editModal.description || ""} onChange={e => setEditModal(p => ({ ...p, description: e.target.value }))} rows={2}
                                    style={{ ...s.input, resize: "vertical" }} />
                            </div>
                        </div>
                        <div style={{ padding: "0 22px 20px", display: "flex", gap: 10, minWidth: 0 }}>
                            <button onClick={() => setEditModal(null)} style={s.btnSecondary}>Cancel</button>
                            <button onClick={() => handleEditSave(editModal)} disabled={editSaving}
                                style={{ ...s.btnPrimary, opacity: editSaving ? 0.5 : 1, cursor: editSaving ? "not-allowed" : "pointer" }}>
                                {editSaving ? "Saving…" : "Save Changes"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Schedule Meeting Modal ── */}
            {showMeetModal && (
                <div onClick={e => { if (e.target === e.currentTarget) setShowMeetModal(false); }} style={s.modalOverlay}>
                    <div style={{ background: C.panel, borderRadius: 12, width: "min(440px,100%)", boxShadow: "0 20px 60px rgba(0,0,0,0.16)", fontFamily: "inherit", overflow: "hidden", boxSizing: "border-box" }}>
                        <div style={{ padding: "16px 22px 14px", borderBottom: `1px solid ${C.lineSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 6, background: C.fill, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                    </div>
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Schedule Group Meeting</span>
                                </div>
                                <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>All {group?.memberIds?.length || 0} members will be invited</div>
                            </div>
                            <button onClick={() => setShowMeetModal(false)} style={s.modalClose}>
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke={C.sub} strokeWidth="1.8" strokeLinecap="round" /></svg>
                            </button>
                        </div>
                        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
                            {meetError && <div style={s.formError}>{meetError}</div>}
                            <div style={{ minWidth: 0 }}>
                                <label style={s.label}>Meeting Title *</label>
                                <input value={meetForm.title} onChange={e => setMeetForm(p => ({ ...p, title: e.target.value }))}
                                    placeholder="e.g. Weekly Standup" autoFocus style={s.input} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, minWidth: 0 }}>
                                <div style={{ minWidth: 0 }}>
                                    <label style={s.label}>Date</label>
                                    <input type="date" value={meetForm.dateTime ? meetForm.dateTime.split("T")[0] : ""}
                                        onChange={e => setMeetForm(p => ({ ...p, dateTime: e.target.value ? `${e.target.value}T${p.dateTime?.split("T")[1] || "09:00"}` : "" }))}
                                        style={{ ...s.input, fontSize: 12 }} />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <label style={s.label}>Time</label>
                                    <input type="time" value={meetForm.dateTime ? (meetForm.dateTime.split("T")[1] || "09:00") : "09:00"}
                                        disabled={!meetForm.dateTime}
                                        onChange={e => { const d = meetForm.dateTime?.split("T")[0]; if (d) setMeetForm(p => ({ ...p, dateTime: `${d}T${e.target.value}` })); }}
                                        style={{ ...s.input, fontSize: 12, opacity: meetForm.dateTime ? 1 : 0.4 }} />
                                </div>
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <label style={s.label}>Description</label>
                                <textarea value={meetForm.description} onChange={e => setMeetForm(p => ({ ...p, description: e.target.value }))}
                                    placeholder="Agenda, topics to discuss…" rows={2} style={{ ...s.input, resize: "vertical" }} />
                            </div>
                            <div style={{ padding: "9px 12px", background: C.fill, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12, color: C.sub, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
                                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>All {group?.memberIds?.length || 0} group members invited automatically</span>
                            </div>
                        </div>
                        <div style={{ padding: "0 22px 20px", display: "flex", gap: 10, minWidth: 0 }}>
                            <button onClick={() => setShowMeetModal(false)} style={s.btnSecondary}>Cancel</button>
                            <button onClick={handleCreateGroupMeeting} disabled={meetBusy || !meetForm.title.trim() || !meetForm.dateTime}
                                style={{ ...s.btnPrimary, opacity: meetBusy || !meetForm.title.trim() || !meetForm.dateTime ? 0.5 : 1, cursor: meetBusy ? "not-allowed" : "pointer" }}>
                                {meetBusy ? "Scheduling…" : "Schedule Meeting"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {imgLightbox && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", zIndex: 99999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }} onClick={() => setImgLightbox(null)}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", background: "rgba(0,0,0,0.4)" }} onClick={e => e.stopPropagation()}>
                        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>Image Preview</span>
                        <div style={{ display: "flex", gap: 10 }}>
                            <a href={imgLightbox.url} download={imgLightbox.name} target="_blank" rel="noopener noreferrer"
                                style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 7, textDecoration: "none" }}
                                onClick={e => e.stopPropagation()}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                Download
                            </a>
                            <button style={{ width: 36, height: 36, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 18, cursor: "pointer", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setImgLightbox(null)}>✕</button>
                        </div>
                    </div>
                    <img src={imgLightbox.url} alt={imgLightbox.name} style={{ maxWidth: "88vw", maxHeight: "80vh", borderRadius: 10, objectFit: "contain", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()} />
                    {imgLightbox.name && <div style={{ marginTop: 14, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{imgLightbox.name}</div>}
                </div>
            )}
        </>
    );
}

const s = {
    container: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0, overflow: "hidden", background: C.surface },
    header: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.line}`, background: C.panel, flexShrink: 0, minWidth: 0, overflow: "hidden" },
    backBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface, cursor: "pointer", color: C.sub, flexShrink: 0 },
    headerInfo: { flex: 1, minWidth: 0, overflow: "hidden" },
    headerName: { fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    headerSub: { display: "flex", alignItems: "center", gap: 6, marginTop: 2, minWidth: 0, overflow: "hidden" },
    memberCountTag: { fontSize: 11, color: C.sub, background: C.fill, padding: "1px 7px", borderRadius: 99, border: `1px solid ${C.line}`, whiteSpace: "nowrap", flexShrink: 0 },
    groupIdTag: { fontSize: 10, fontFamily: "var(--font-mono, monospace)", color: C.faint, background: C.fill, padding: "1px 6px", borderRadius: 4, border: `1px solid ${C.line}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
    headerActions: { display: "flex", gap: 5, flexShrink: 0, alignItems: "center" },
    headerTextBtn: { display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, cursor: "pointer", color: C.sub, fontSize: 12, fontWeight: 600, fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap" },
    headerIconBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: `1px solid ${C.line}`, background: C.surface, color: C.sub, borderRadius: 8, cursor: "pointer", transition: "all 0.15s", flexShrink: 0 },
    membersPanel: { padding: "10px 18px", borderBottom: `1px solid ${C.line}`, background: C.surface, flexShrink: 0, minWidth: 0 },
    membersPanelTitle: { fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 },
    membersList: { display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0 },
    memberChip: { display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: C.panel, borderRadius: 99, border: `1px solid ${C.line}`, maxWidth: "100%", minWidth: 0 },
    memberName: { fontSize: 12, color: C.ink, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
    memberDept: { fontSize: 10, color: C.faint, whiteSpace: "nowrap", flexShrink: 0 },
    messagesArea: { flex: 1, minHeight: 0, minWidth: 0, overflowY: "auto", overflowX: "hidden", padding: "14px 16px", display: "flex", flexDirection: "column", background: C.surface, overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" },
    center: { flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: 40 },
    inputArea: { flexShrink: 0, borderTop: `1px solid ${C.line}`, background: C.panel, minWidth: 0 },
    modalOverlay: { position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, boxSizing: "border-box" },
    modalClose: { width: 26, height: 26, border: `1px solid ${C.line}`, borderRadius: 6, background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
    label: { fontSize: 11, fontWeight: 600, color: C.sub, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 },
    input: { width: "100%", padding: "8px 12px", border: `1px solid ${C.line}`, borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", color: C.ink, background: C.panel },
    formError: { padding: "8px 12px", background: STATUS.rejected.bg, border: `1px solid ${STATUS.rejected.border}`, borderRadius: 7, fontSize: 12, color: STATUS.rejected.color },
    btnSecondary: { flex: 1, minWidth: 0, padding: "9px 0", border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface, color: C.ink, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
    btnPrimary: { flex: 1, minWidth: 0, padding: "9px 0", border: `1px solid ${C.accent}`, borderRadius: 8, background: C.accent, color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "inherit" },
};

const GROUP_CHAT_CSS = `
  .grav-chat-container { max-width: 100%; overflow-x: hidden; }

  /* X-overflow fix: the only real cause was the image inside
     MessageBubble (a separate file) rendering wider than the
     column. Clamp just the media — nothing else is touched. */
  .grav-chat-container img,
  .grav-chat-container video {
    max-width: 100%;
    height: auto;
  }

  @media (max-width: 560px) {
    .gc-btn-label { display: none; }
    .gc-header-btn { padding: 0 !important; width: 34px !important; justify-content: center; }
  }
  @keyframes gc-spin { to { transform: rotate(360deg); } }
  @keyframes gc-toast-in { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
`;