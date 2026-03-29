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
  doc, getDoc, getDocs, setDoc, updateDoc,
  collection, query, orderBy, limit,
  onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { useCoworkAuth } from "../../../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../../../components/coworking/layout/CoworkingShell";
import MediaMessageInput from "../../../../../components/coworking/messaging/MediaMessageInput";
import MessageBubble from "../../../../../components/coworking/messaging/MessageBubble";
import { firebaseDb } from "../../../../../lib/coworkFirebase";
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

  useEffect(() => { if (!loading && !user) router.push("/coworking-login"); }, [user, loading, router]);

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

  if (loading || !user) return null;

  const groupedMessages = messages.map((msg, i) => ({
    ...msg,
    showSender: i === 0 || messages[i - 1]?.senderId !== msg.senderId,
    showAvatar: i === 0 || messages[i - 1]?.senderId !== msg.senderId,
  }));

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

        {/* ── Input ── */}
        <div style={s.inputArea}>
          <MediaMessageInput
            onSend={handleSend}
            placeholder={`Message ${group?.name || "group"}…`}
            disabled={msgsLoading}
          />
        </div>
      </div>
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