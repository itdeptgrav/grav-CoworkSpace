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
import DMCallManager, { triggerCall } from "../../../../components/coworking/messaging/DMCallManager";

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

  useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading, router]);

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
      const cleanAtts = (attachments || []).map(a => { const c = {}; Object.entries(a).forEach(([k, v]) => { if (v !== undefined) c[k] = v; }); return c; });
      const messageData = {
        messageId,
        threadType: "direct",
        threadId: conversationId,
        senderId: employeeId,
        senderName: employeeName,
        text: text || "",
        attachments: cleanAtts,
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
      {/* ── Responsive styles ── */}
      <style jsx global>{`
        .gv-chat-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid var(--gray-200);
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          background: #fff;
        }
        .gv-chat-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          border-bottom: 1px solid var(--gray-200);
          background: #fff;
          flex-shrink: 0;
        }
        .gv-chat-back {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px;
          border: 1.5px solid var(--gray-200); border-radius: 10px;
          background: #fff; cursor: pointer; color: var(--gray-600);
          flex-shrink: 0; transition: all 0.15s;
        }
        .gv-chat-back:hover { background: var(--gray-50); border-color: var(--gray-300); }
        .gv-chat-info { flex: 1; min-width: 0; }
        .gv-chat-name {
          font-size: 15px; font-weight: 700; color: var(--gray-900);
          letter-spacing: -0.01em; line-height: 1.3;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .gv-chat-sub {
          display: flex; align-items: center; gap: 6px; margin-top: 2px;
          font-size: 11px; color: var(--gray-500); flex-wrap: wrap;
        }
        .gv-chat-tag {
          padding: 1px 7px; background: var(--gray-100);
          border-radius: 99px; border: 1px solid var(--gray-200);
          color: var(--gray-600); font-weight: 500;
          white-space: nowrap;
        }
        .gv-chat-id {
          padding: 1px 6px; background: var(--gray-100);
          border-radius: 4px; border: 1px solid var(--gray-200);
          color: var(--gray-400); font-family: var(--font-mono);
          font-size: 10px;
        }
        .gv-chat-call, .gv-chat-req {
          display: flex; align-items: center; justify-content: center;
          width: 38px; height: 38px;
          border: 1.5px solid var(--gray-200); border-radius: 10px;
          background: #fff; cursor: pointer; color: var(--gray-600);
          flex-shrink: 0; transition: all 0.15s;
        }
        .gv-chat-call:hover {
          background: #ECFDF5; border-color: #86EFAC; color: #16A34A;
        }
        .gv-chat-msgs {
          flex: 1; overflow-y: auto;
          padding: 16px 20px;
          display: flex; flex-direction: column;
          background: linear-gradient(180deg, #FAFAFB 0%, #F4F5F7 100%);
        }
        .gv-chat-input {
          flex-shrink: 0;
          border-top: 1px solid var(--gray-200);
          background: #fff;
          padding: 0;
        }

        /* Message bubbles — wider on mobile */
        .gv-msg-content { max-width: min(75%, 480px); }

        /* ── MOBILE — FULL RESPONSIVE OVERRIDE ── */
        @media (max-width: 767px) {
          .gv-msg-content { max-width: 80% !important; }
         .gv-chat-container {
            height: 100%;
            border-radius: 0;
            border: none;
            box-shadow: none;
          }
          .gv-chat-header {
            padding: 10px 12px;
            gap: 10px;
            position: sticky;
            top: 0;
            z-index: 10;
            backdrop-filter: blur(8px);
            background: rgba(255,255,255,0.95);
          }
          .gv-chat-back {
            width: 34px; height: 34px;
          }
          .gv-chat-call, .gv-chat-req {
            width: 36px; height: 36px;
          }
          .gv-chat-name {
            font-size: 14px;
          }
          .gv-chat-sub {
            font-size: 10px;
            gap: 4px;
            margin-top: 1px;
          }
          .gv-chat-tag {
            padding: 1px 6px;
            font-size: 10px;
          }
          /* Hide convId on mobile — too cluttered */
          .gv-chat-id {
            display: none;
          }
          .gv-chat-msgs {
            padding: 12px 10px;
            background: #F8F9FB;
          }
          /* Bigger touch targets on mobile */
          .gv-chat-input button {
            min-height: 40px;
          }
        }

        /* Extra small phones */
        @media (max-width: 380px) {
          .gv-chat-header {
            padding: 8px 10px;
            gap: 8px;
          }
          .gv-chat-name {
            font-size: 13px;
          }
          .gv-chat-tag {
            padding: 0 5px;
            font-size: 9px;
          }
          .gv-chat-back, .gv-chat-call, .gv-chat-req {
            width: 32px; height: 32px;
          }
        }
      `}</style>

      {/* ── Audio Call Manager (handles outgoing calls + LiveKit) ── */}
      {employeeId && otherEmpId && (
        <DMCallManager
          employeeId={employeeId}
          employeeName={employeeName}
          otherEmpId={otherEmpId}
          otherName={otherName}
          convId={conversationId}
        />
      )}

      <div className="gv-chat-container">

        {/* ── Header ── */}
        <div className="gv-chat-header">
          <button
            onClick={() => router.push("/coworking/direct-messages")}
            className="gv-chat-back"
            title="Back to messages"
            aria-label="Back"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <GwAvatar name={otherName} size={38} />

          <div className="gv-chat-info">
            <div className="gv-chat-name">{otherName}</div>
            <div className="gv-chat-sub">
              {otherEmployee?.department && (
                <span className="gv-chat-tag">{otherEmployee.department}</span>
              )}
              {otherEmployee?.role && (
                <span className="gv-chat-tag">{otherEmployee.role}</span>
              )}
              <span className="gv-chat-id">{conversationId}</span>
            </div>
          </div>

          {/* ── Audio Call button ── */}
          <button
            onClick={() => triggerCall(conversationId)}
            className="gv-chat-call"
            title="Audio call"
            aria-label="Call"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8 19.79 19.79 0 01.01 1.18 2 2 0 012 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z" />
            </svg>
          </button>
        </div>

        {/* ── Messages ── */}
        <div className="gv-chat-msgs">
          {msgsLoading ? (
            <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: 40 }}>
              <GwSpinner size={30} />
            </div>
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
                msg={{
                  ...msg,
                  senderPicUrl: msg.senderId === employeeId
                    ? ""
                    : (otherEmployee?.profilePicUrl || ""),
                }}
                isMe={msg.senderId === employeeId}
                showSender={msg.showSender}
                showAvatar={msg.showAvatar}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Input ── */}
        <div className="gv-chat-input">
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
  callBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: "1.5px solid var(--gray-200)", borderRadius: "var(--radius-md)", background: "var(--gray-50)", cursor: "pointer", color: "var(--gray-600)", flexShrink: 0, marginLeft: "auto" },
  headerInfo: { flex: 1, minWidth: 0 },
  headerName: { fontSize: 14, fontWeight: 700, color: "var(--gray-900)", letterSpacing: "-0.01em" },
  headerSub: { display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" },
  deptTag: { fontSize: 11, color: "var(--gray-500)", background: "var(--gray-100)", padding: "1px 7px", borderRadius: "var(--radius-full)", border: "1px solid var(--gray-200)" },
  convIdTag: { fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--gray-400)", background: "var(--gray-100)", padding: "1px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--gray-200)" },
  messagesArea: { flex: 1, overflowY: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", background: "var(--gray-50)" },
  center: { flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: 40 },
  inputArea: { flexShrink: 0, borderTop: "1px solid var(--gray-200)", background: "var(--surface)" },
};