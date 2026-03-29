"use client";
/**
 * GRAV-CMS/app/coworking/direct-messages/[conversationId]/page.js
 *
 * 100% Firestore-native — zero backend API calls for messaging.
 *
 * Firestore operations:
 *   READ  cowork_direct_messages/{convId}                → conversation meta
 *   READ  cowork_direct_messages/{convId}/messages       → message history (onSnapshot, real-time)
 *   READ  cowork_employees/{employeeId}                  → other person's info
 *   WRITE cowork_direct_messages/{convId}                → create conversation doc if missing
 *   WRITE cowork_direct_messages/{convId}/messages       → new message
 *   WRITE cowork_direct_messages/{convId}.lastMessage    → update preview
 *
 * Images/Voice → Cloudinary directly (no backend)
 * PDFs         → still goes through backend → Google Drive (unchanged)
 *
 * Optimistic UI:
 *   1. Message shown instantly (sending=true, semi-transparent)
 *   2. Firestore write completes → message confirmed (sending=false, tick)
 *   3. Firestore write fails → message stays with error state
 *   4. onSnapshot fires for OTHER users' messages only (own messages skipped to prevent duplicates)
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  onSnapshot, query, orderBy, limit,
  serverTimestamp, updateDoc,
} from "firebase/firestore";
// Use built-in crypto.randomUUID() — no uuid package needed
import { useCoworkAuth } from "../../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../../components/coworking/layout/CoworkingShell";
import MessageBubble from "../../../../components/coworking/messaging/MessageBubble";
import MediaMessageInput from "../../../../components/coworking/messaging/MediaMessageInput";
import { GwAvatar, GwSpinner, GwEmpty } from "../../../../components/coworking/shared/CoworkShared";
import { firebaseDb } from "../../../../lib/coworkFirebase";
import { uploadImage, uploadVoice, uploadPDF } from "../../../../lib/mediaUploadApi";

// ── helpers ───────────────────────────────────────────────
function tsToISO(ts) {
  if (!ts) return new Date().toISOString();
  if (ts?.seconds) return new Date(ts.seconds * 1000).toISOString();
  return ts;
}

function resolveMessageType(messageType, attachments) {
  if (messageType && messageType !== "text") return messageType;
  if (attachments?.length > 0) return attachments[0].type || "image";
  return "text";
}

// ══════════════════════════════════════════════════════════
export default function ConversationPage() {
  const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
  const { conversationId } = useParams();
  const router = useRouter();

  const [messages, setMessages] = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(true);
  const [otherEmployee, setOtherEmployee] = useState(null);
  const messagesEndRef = useRef(null);
  const unsubRef = useRef(null);
  const pendingMapRef = useRef(new Map()); // tempId → realId

  // Derive other employee ID from conversationId ("E000_E006")
  // conversationId is always sorted([idA, idB]).join("_")
  const otherEmpId = conversationId
    ?.split("_")
    .find(part => part !== employeeId)
    || null;

  // ── Load other employee info from Firestore ──────────────
  const loadOtherEmployee = useCallback(async () => {
    if (!otherEmpId) return;
    try {
      const snap = await getDoc(doc(firebaseDb, "cowork_employees", otherEmpId));
      if (snap.exists()) {
        setOtherEmployee({ employeeId: otherEmpId, ...snap.data() });
      } else {
        setOtherEmployee({ employeeId: otherEmpId, name: otherEmpId });
      }
    } catch {
      setOtherEmployee({ employeeId: otherEmpId, name: otherEmpId });
    }
  }, [otherEmpId]);

  // ── Real-time message listener ───────────────────────────
  const setupListener = useCallback(() => {
    if (!conversationId) return;
    setMsgsLoading(true);

    const msgsRef = collection(firebaseDb, "cowork_direct_messages", conversationId, "messages");
    const q = query(msgsRef, orderBy("createdAt", "asc"), limit(100));

    const unsub = onSnapshot(
      q,
      snap => {
        const incoming = snap.docs.map(d => ({
          ...d.data(),
          id: d.id,
          createdAt: tsToISO(d.data().createdAt),
          temp: false, sending: false, error: false,
        }));

        // Source of truth merge — pendingMapRef prevents flicker/duplicate
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
      err => {
        console.error("messages listener:", err);
        setMsgsLoading(false);
      }
    );

    unsubRef.current = unsub;
    return unsub;
  }, [conversationId]);

  useEffect(() => { if (!loading && !user) router.push("/coworking-login"); }, [user, loading, router]);

  useEffect(() => {
    if (!user || !employeeId || !conversationId) return;
    loadOtherEmployee();
    const unsub = setupListener();
    return () => { if (unsub) unsub(); };
  }, [user, employeeId, conversationId, loadOtherEmployee, setupListener]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send message — writes directly to Firestore ──────────
  const handleSend = async (text, attachments, messageType) => {
    if (!otherEmpId || !employeeId) return;

    const tempId = "temp_" + Date.now();
    const resolvedType = resolveMessageType(messageType, attachments);

    const optimistic = {
      messageId: tempId,
      threadType: "direct",
      threadId: conversationId,
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
      const convRef = doc(firebaseDb, "cowork_direct_messages", conversationId);
      const msgsRef = collection(firebaseDb, "cowork_direct_messages", conversationId, "messages");

      // 2. Ensure conversation document exists
      const convSnap = await getDoc(convRef);
      if (!convSnap.exists()) {
        await setDoc(convRef, {
          conversationId,
          participantIds: [employeeId, otherEmpId].sort(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // 3. Write message to Firestore
      const messageData = {
        messageId,
        threadType: "direct",
        threadId: conversationId,
        senderId: employeeId,
        senderName: employeeName,
        text: text || "",
        attachments: attachments || [],
        messageType: resolvedType,
        type: resolvedType,
        readBy: [employeeId],
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(msgsRef, messageId), messageData);

      // 4. Update conversation's lastMessage preview
      const previewText =
        resolvedType === "image" ? "📷 Image"
          : resolvedType === "pdf" ? "📄 Document"
            : resolvedType === "voice" ? "🎤 Voice note"
              : (text || "").slice(0, 80);

      await updateDoc(convRef, {
        lastMessage: {
          text: previewText,
          senderId: employeeId,
          senderName: employeeName,
          messageType: resolvedType,
          sentAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });

      // 5. Remove temp immediately; onSnapshot handles the confirmed message
      setMessages(prev => prev.filter(m => m.messageId !== tempId));
      pendingMapRef.current.delete(tempId);

    } catch (err) {
      console.error("handleSend error:", err);
      // Keep message visible with error state
      pendingMapRef.current.delete(tempId);
      setMessages(prev => prev.map(m =>
        m.messageId === tempId
          ? { ...m, sending: false, error: true }
          : m
      ));
    }
  };

  if (loading || !user) return null;

  const otherName = otherEmployee?.name || otherEmpId || "…";

  const groupedMsgs = messages.map((msg, i) => ({
    ...msg,
    showSender: i === 0 || messages[i - 1]?.senderId !== msg.senderId,
    showAvatar: i === 0 || messages[i - 1]?.senderId !== msg.senderId,
  }));

  return (
    <>
      <div style={s.container} className="grav-chat-container">

        {/* ── Header ── */}
        <div style={s.header}>
          <button
            onClick={() => router.push("/coworking/direct-messages")}
            style={s.backBtn}
            title="Back to messages"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <GwAvatar name={otherName} size={36} />

          <div style={s.headerInfo}>
            <div style={s.headerName}>{otherName}</div>
            <div style={s.headerSub}>
              {otherEmployee?.department && (
                <span style={s.deptTag}>{otherEmployee.department}</span>
              )}
              <span style={s.convIdTag}>{conversationId}</span>
            </div>
          </div>
        </div>

        {/* ── Messages ── */}
        <div style={s.messagesArea}>
          {msgsLoading ? (
            <div style={s.center}><GwSpinner size={30} /></div>
          ) : messages.length === 0 ? (
            <GwEmpty
              icon="💬"
              title={`Start a conversation with ${otherName}`}
              subtitle="Messages are private and stored securely."
            />
          ) : (
            groupedMsgs.map((msg, i) => (
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
            placeholder={`Message ${otherName}…`}
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
  deptTag: { fontSize: 11, color: "var(--gray-500)", background: "var(--gray-100)", padding: "1px 7px", borderRadius: "var(--radius-full)", border: "1px solid var(--gray-200)" },
  convIdTag: { fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--gray-400)", background: "var(--gray-100)", padding: "1px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--gray-200)" },
  messagesArea: { flex: 1, overflowY: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", background: "var(--gray-50)" },
  center: { flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: 40 },
  inputArea: { flexShrink: 0, borderTop: "1px solid var(--gray-200)", background: "var(--surface)" },
};