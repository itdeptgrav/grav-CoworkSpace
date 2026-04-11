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
import { useRouter, useParams } from "next/navigation";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, where,
  collection, query, orderBy, limit,
  onSnapshot, serverTimestamp, writeBatch, arrayUnion,
} from "firebase/firestore";
import { useCoworkAuth } from "../../../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../../../components/coworking/layout/CoworkingShell";
import MediaMessageInput from "../../../../../components/coworking/messaging/MediaMessageInput";
import MessageBubble from "../../../../../components/coworking/messaging/MessageBubble";
import { firebaseDb, firebaseAuth } from "../../../../../lib/coworkFirebase";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
async function apiFetch(path, opts = {}) {
  const u = firebaseAuth.currentUser;
  const token = u ? await u.getIdToken() : "";
  const res = await fetch(`${BASE}/cowork${path}`, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}
import { GwAvatar, GwSpinner, GwEmpty } from "../../../../../components/coworking/shared/CoworkShared";

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
export default function GroupChatPage() {
  const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
  const router = useRouter();
  const { groupId } = useParams();

  const [group, setGroup] = useState(null);   // group doc
  const [members, setMembers] = useState([]);     // member details
  const [messages, setMessages] = useState([]);     // real-time
  const [msgsLoading, setMsgsLoading] = useState(true);
  const [showMembers, setShowMembers] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", dueDate: "", notes: "", priority: "medium" });
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [groupTasks, setGroupTasks] = useState([]);
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
  const handleSend = async (text, attachments, messageType) => {
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
      messageType: resolvedType,
      type: resolvedType,
      readBy: [employeeId],
      temp: true,
      sending: true,
      error: false,
      createdAt: new Date().toISOString(),
    };

    // 1. Show immediately
    setMessages(prev => [...prev, optimistic]);

    try {
      const messageId = crypto.randomUUID();
      pendingMapRef.current.set(tempId, messageId); // register before write
      const groupRef = doc(firebaseDb, "cowork_groups", groupId);
      const msgsRef = collection(firebaseDb, "cowork_groups", groupId, "messages");

      const messageData = {
        messageId,
        threadType: "group",
        threadId: groupId,
        senderId: employeeId,
        senderName: employeeName,
        text: text || "",
        attachments: attachments || [],
        messageType: resolvedType,
        type: resolvedType,
        readBy: [employeeId],
        createdAt: serverTimestamp(),
      };

      // 2. Write message to Firestore
      await setDoc(doc(msgsRef, messageId), messageData);

      // 3. Update group's lastMessage preview
      const previewText =
        resolvedType === "image" ? "📷 Image"
          : resolvedType === "pdf" ? "📄 Document"
            : resolvedType === "voice" ? "🎤 Voice note"
              : (text || "").slice(0, 80);

      await updateDoc(groupRef, {
        lastMessage: {
          text: previewText,
          senderId: employeeId,
          senderName: employeeName,
          messageType: resolvedType,
          sentAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });

      // 4. Remove temp immediately; onSnapshot handles confirmed message
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

  // Load tasks created for this group — single where clause, no composite index needed
  // Must be BEFORE any conditional return to follow Rules of Hooks
  useEffect(() => {
    if (!groupId) return;
    const q = query(
      collection(firebaseDb, "cowork_tasks"),
      where("groupId", "==", groupId)
    );
    const unsub = onSnapshot(q,
      snap => {
        const tasks = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(t => !t.parentTaskId);
        setGroupTasks(tasks);
      },
      (err) => { console.error("group tasks:", err); }
    );
    return () => unsub();
  }, [groupId]);

  if (loading || !user) return null;

  const groupedMessages = messages.map((msg, i) => ({
    ...msg,
    showSender: i === 0 || messages[i - 1]?.senderId !== msg.senderId,
    showAvatar: i === 0 || messages[i - 1]?.senderId !== msg.senderId,
  }));

  const isCeoOrTl = role === "ceo" || role === "tl";

  const handleCreateGroupTask = async () => {
    if (!taskForm.title.trim()) { setTaskError("Title is required"); return; }
    setTaskBusy(true); setTaskError("");
    try {
      // Assign to all group members
      const assigneeIds = group?.memberIds || [];
      await apiFetch("/task/create", {
        method: "POST",
        body: JSON.stringify({
          title: taskForm.title.trim(),
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
      setShowTaskModal(false);
      setTaskForm({ title: "", dueDate: "", notes: "", priority: "medium" });
    } catch (e) { setTaskError(e.message); }
    finally { setTaskBusy(false); }
  };

  return (
    <>
      <div style={s.container} className="grav-chat-container">

        {/* ── Header ── */}
        <div style={s.header}>
          <button onClick={() => router.push("/coworking/create-group")} style={s.backBtn} title="Back to groups">
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
            {isCeoOrTl && (
              <button
                onClick={() => setShowTaskModal(true)}
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

        {/* ── Messages ── */}
        <div style={s.messagesArea}>
          {msgsLoading ? (
            <div style={s.center}><GwSpinner size={30} /></div>
          ) : messages.length === 0 ? (
            <GwEmpty icon="💬" title="No messages yet" subtitle="Be the first to say something!" />
          ) : (
            groupedMessages.map((msg, i) => (
              <MessageBubble
                key={msg.messageId || msg.id || i}
                msg={msg}
                isMe={msg.senderId === employeeId}
                showSender={msg.showSender}
                showAvatar={msg.showAvatar}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Group Tasks Strip ── */}
        {groupTasks.length > 0 && (
          <div style={{ flexShrink: 0, borderTop: "1px solid #E2E8F0", background: "#F8FAFC", padding: "8px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              Group Tasks ({groupTasks.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {groupTasks.map(t => (
                <div key={t.id || t.taskId}
                  onClick={() => router.push(`/coworking/tasks?task=${t.taskId || t.id}`)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#fff", borderRadius: 8, border: "1px solid #E2E8F0", cursor: "pointer" }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12l2 2 4-4" /></svg>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                  {t.subtaskIds?.length > 0 && (
                    <span style={{ fontSize: 10, color: "#6366F1", background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 4, padding: "1px 6px", fontWeight: 600, flexShrink: 0 }}>
                      {t.subtaskIds.length} subtask{t.subtaskIds.length > 1 ? "s" : ""}
                    </span>
                  )}
                  {t.dueDate && (
                    <span style={{ fontSize: 10, color: "#64748B", flexShrink: 0 }}>
                      {new Date(t.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Input ── */}
        <div style={s.inputArea}>
          <MediaMessageInput
            onSend={handleSend}
            placeholder={`Message ${group?.name || "group"}…`}
            disabled={msgsLoading}
          />
        </div>
      </div>

      {/* ── Create Task Modal ── */}
      {showTaskModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowTaskModal(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }}
        >
          <div style={{ background: "#fff", borderRadius: 14, width: "min(420px,100%)", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", fontFamily: "inherit", overflow: "hidden" }}>
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

            {/* Form */}
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              {taskError && <div style={{ padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7, fontSize: 12, color: "#B91C1C" }}>{taskError}</div>}

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Title *</label>
                <input value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Task title" autoFocus
                  style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
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
                  placeholder="Requirements, details…" rows={3}
                  style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "0 20px 18px", display: "flex", gap: 10 }}>
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
    </>
  );
}

const s = {
  container: { display: "flex", flexDirection: "column", height: "calc(100vh - 108px)", borderRadius: "var(--radius-xl)", overflow: "hidden", border: "1px solid var(--gray-200)", boxShadow: "var(--shadow-sm)", background: "var(--surface)" },
  header: { display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid var(--gray-200)", background: "var(--surface)", flexShrink: 0 },
  backBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: "1.5px solid var(--gray-200)", borderRadius: "var(--radius-md)", background: "var(--gray-50)", cursor: "pointer", color: "var(--gray-600)", flexShrink: 0 },
  headerInfo: { flex: 1, minWidth: 0 },
  headerName: { fontSize: 14, fontWeight: 700, color: "var(--gray-900)", letterSpacing: "-0.01em" },
  headerSub: { display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" },
  memberCountTag: { fontSize: 11, color: "var(--gray-500)", background: "var(--gray-100)", padding: "1px 7px", borderRadius: "var(--radius-full)", border: "1px solid var(--gray-200)" },
  groupIdTag: { fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--gray-400)", background: "var(--gray-100)", padding: "1px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--gray-200)" },
  headerActions: { display: "flex", gap: 6, flexShrink: 0 },
  headerIconBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: "1.5px solid", borderRadius: "var(--radius-md)", cursor: "pointer", transition: "all var(--transition)" },
  membersPanel: { padding: "10px 18px", borderBottom: "1px solid var(--gray-200)", background: "var(--gray-50)", flexShrink: 0 },
  membersPanelTitle: { fontSize: 10, fontWeight: 700, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 },
  membersList: { display: "flex", flexWrap: "wrap", gap: 6 },
  memberChip: { display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--surface)", borderRadius: "var(--radius-full)", border: "1px solid var(--gray-200)" },
  memberName: { fontSize: 12, color: "var(--gray-700)", fontWeight: 500 },
  memberDept: { fontSize: 10, color: "var(--gray-400)" },
  messagesArea: { flex: 1, overflowY: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", background: "var(--gray-50)" },
  center: { flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: 40 },
  inputArea: { flexShrink: 0, borderTop: "1px solid var(--gray-200)", background: "var(--surface)" },
};