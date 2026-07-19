"use client";
/**
 * GRAV-CMS/app/coworking/direct-messages/[conversationId]/page.js
 *
 * ADDED:
 *  - Double-tap context menu on messages (Reply / Copy / Edit / Delete)
 *  - Reply-to: strip above input + replyTo stored in message
 *  - Edit message: edit bar replaces input; updates Firestore + sets isEdited=true
 *  - Delete message: sets isDeleted=true in Firestore (shows placeholder in UI)
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  onSnapshot, query, orderBy, limit,
  serverTimestamp, updateDoc,
} from "firebase/firestore";
import { useCoworkAuth } from "../../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../../components/coworking/layout/CoworkingShell";
import MessageBubble from "../../../../components/coworking/messaging/MessageBubble";
import MediaMessageInput from "../../../../components/coworking/messaging/MediaMessageInput";
import { GwAvatar, GwSpinner, GwEmpty } from "../../../../components/coworking/shared/CoworkShared";
import { firebaseDb, getCoworkToken } from "../../../../lib/coworkFirebase";
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
  const pendingMapRef = useRef(new Map());

  // ── New: reply / edit state ──────────────────────────────
  const [replyTo, setReplyTo] = useState(null);   // { messageId, senderName, text }
  const [editingMsg, setEditingMsg] = useState(null); // { messageId, text }
  const [editText, setEditText] = useState("");
  const editInputRef = useRef(null);

  const otherEmpId = conversationId
    ?.split("_")
    .find(part => part !== employeeId)
    || null;

  // ── Load other employee info ─────────────────────────────
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

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const onViewportChange = () => {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      });
    };
    window.visualViewport.addEventListener("resize", onViewportChange);
    return () => window.visualViewport.removeEventListener("resize", onViewportChange);
  }, []);

  useEffect(() => {
    const onFocusIn = (e) => {
      const t = e.target;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) {
        setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" }); }, 100);
        setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" }); }, 350);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  // ── Focus edit input when entering edit mode ─────────────
  useEffect(() => {
    if (editingMsg) {
      setTimeout(() => editInputRef.current?.focus(), 50);
    }
  }, [editingMsg]);

  // ── Send message ─────────────────────────────────────────
  const handleSend = async (text, attachments, messageType) => {
    if (!otherEmpId || !employeeId) return;

    const tempId = "temp_" + Date.now();
    const resolvedType = resolveMessageType(messageType, attachments);

    // Capture reply then clear immediately
    const currentReplyTo = replyTo;
    setReplyTo(null);

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
      ...(currentReplyTo ? { replyTo: currentReplyTo } : {}),
    };

    setMessages(prev => [...prev, optimistic]);

    try {
      const messageId = crypto.randomUUID();
      pendingMapRef.current.set(tempId, messageId);
      const convRef = doc(firebaseDb, "cowork_direct_messages", conversationId);
      const msgsRef = collection(firebaseDb, "cowork_direct_messages", conversationId, "messages");

      const convSnap = await getDoc(convRef);
      if (!convSnap.exists()) {
        await setDoc(convRef, {
          conversationId,
          participantIds: [employeeId, otherEmpId].sort(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

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
        ...(currentReplyTo ? { replyTo: currentReplyTo } : {}),
      };

      await setDoc(doc(msgsRef, messageId), messageData);

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

      // Push-notify the receiver. This page writes Firestore directly, so the
      // backend never sees the message — without this call, DMs sent from this
      // screen produce NO FCM push / email (the split-view messages page
      // already fires the same endpoint). Fire-and-forget: never blocks send.
      (async () => {
        try {
          const _tok = await getCoworkToken();
          const _base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
          await fetch(`${_base}/cowork/direct-message/notify`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${_tok}` },
            body: JSON.stringify({ toEmployeeId: otherEmpId, text: text || "", messageType: resolvedType }),
          });
        } catch (_) { }
      })();

      setMessages(prev => prev.filter(m => m.messageId !== tempId));
      pendingMapRef.current.delete(tempId);

    } catch (err) {
      console.error("handleSend error:", err);
      pendingMapRef.current.delete(tempId);
      setMessages(prev => prev.map(m =>
        m.messageId === tempId ? { ...m, sending: false, error: true } : m
      ));
    }
  };

  // ── Delete message ────────────────────────────────────────
  const handleDeleteMsg = useCallback(async (msg) => {
    if (!msg || msg.senderId !== employeeId) return;
    const msgId = msg.messageId || msg.id;
    if (!msgId || msgId.startsWith("temp_")) return;
    try {
      const msgRef = doc(firebaseDb, "cowork_direct_messages", conversationId, "messages", msgId);
      await updateDoc(msgRef, {
        isDeleted: true,
        text: "",
        attachments: [],
        deletedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("deleteMsg error:", e);
    }
  }, [employeeId, conversationId]);

  // ── Edit message — save ───────────────────────────────────
  const handleSaveEdit = useCallback(async () => {
    if (!editingMsg || !editText.trim()) return;
    const msgId = editingMsg.messageId || editingMsg.id;
    if (!msgId || msgId.startsWith("temp_")) return;
    try {
      const msgRef = doc(firebaseDb, "cowork_direct_messages", conversationId, "messages", msgId);
      await updateDoc(msgRef, {
        text: editText.trim(),
        isEdited: true,
        editedAt: serverTimestamp(),
      });
      setEditingMsg(null);
      setEditText("");
    } catch (e) {
      console.error("editMsg error:", e);
    }
  }, [editingMsg, editText, conversationId]);

  // ── Open edit mode ────────────────────────────────────────
  const handleOpenEdit = useCallback((msg) => {
    if (msg.senderId !== employeeId) return;
    setEditingMsg(msg);
    setEditText(msg.text || "");
    setReplyTo(null);
  }, [employeeId]);

  // ── Open reply mode ───────────────────────────────────────
  const handleReply = useCallback((msg) => {
    setReplyTo({
      messageId: msg.messageId || msg.id,
      senderName: msg.senderName || "Unknown",
      text: (msg.text || "").slice(0, 120),
    });
    setEditingMsg(null);
  }, []);

  if (loading || !user) return null;

  const otherName = otherEmployee?.name || otherEmpId || "…";

  const groupedMsgs = messages.map((msg, i) => ({
    ...msg,
    showSender: i === 0 || messages[i - 1]?.senderId !== msg.senderId,
    showAvatar: i === 0 || messages[i - 1]?.senderId !== msg.senderId,
  }));

  return (
    <>
      <style jsx global>{`
        .gv-chat-container {
          display: flex; flex-direction: column; height: 100%; min-height: 0;
          border-radius: 14px; overflow: hidden;
          border: 1px solid var(--gray-200);
          box-shadow: 0 1px 3px rgba(0,0,0,0.04); background: #fff;
        }
        .gv-chat-header {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 20px; border-bottom: 1px solid var(--gray-200);
          background: #fff; flex-shrink: 0;
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
          color: var(--gray-600); font-weight: 500; white-space: nowrap;
        }
        .gv-chat-id {
          padding: 1px 6px; background: var(--gray-100);
          border-radius: 4px; border: 1px solid var(--gray-200);
          color: var(--gray-400); font-family: var(--font-mono); font-size: 10px;
        }
        .gv-chat-call, .gv-chat-req {
          display: flex; align-items: center; justify-content: center;
          width: 38px; height: 38px;
          border: 1.5px solid var(--gray-200); border-radius: 10px;
          background: #fff; cursor: pointer; color: var(--gray-600);
          flex-shrink: 0; transition: all 0.15s;
        }
        .gv-chat-call:hover { background: #ECFDF5; border-color: #86EFAC; color: #16A34A; }
        .gv-chat-msgs {
          flex: 1; overflow-y: auto; padding: 16px 20px;
          display: flex; flex-direction: column;
          background: linear-gradient(180deg, #FAFAFB 0%, #F4F5F7 100%);
        }
        .gv-chat-input { flex-shrink: 0; border-top: 1px solid var(--gray-200); background: #fff; padding: 0; }
        .gv-msg-content { max-width: min(75%, 480px); }

        @media (max-width: 767px) {
          .gv-msg-content { max-width: 80% !important; }
          .gv-chat-container { height: 100%; border-radius: 0; border: none; box-shadow: none; }
          .gv-chat-header { padding: 10px 12px; gap: 10px; position: sticky; top: 0; z-index: 10; backdrop-filter: blur(8px); background: rgba(255,255,255,0.95); }
          .gv-chat-back { width: 34px; height: 34px; }
          .gv-chat-call, .gv-chat-req { width: 36px; height: 36px; }
          .gv-chat-name { font-size: 14px; }
          .gv-chat-sub { font-size: 10px; gap: 4px; margin-top: 1px; }
          .gv-chat-tag { padding: 1px 6px; font-size: 10px; }
          .gv-chat-id { display: none; }
          .gv-chat-msgs { padding: 12px 10px; background: #F8F9FB; }
          .gv-chat-input button { min-height: 40px; }
        }

        @media (max-width: 380px) {
          .gv-chat-header { padding: 8px 10px; gap: 8px; }
          .gv-chat-name { font-size: 13px; }
          .gv-chat-tag { padding: 0 5px; font-size: 9px; }
          .gv-chat-back, .gv-chat-call, .gv-chat-req { width: 32px; height: 32px; }
        }
      `}</style>

      {/* ── Audio Call Manager ── */}
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
          <button onClick={() => router.push("/coworking/direct-messages")} className="gv-chat-back" title="Back to messages" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <GwAvatar name={otherName} size={38} />

          <div className="gv-chat-info">
            <div className="gv-chat-name">{otherName}</div>
            <div className="gv-chat-sub">
              {otherEmployee?.department && <span className="gv-chat-tag">{otherEmployee.department}</span>}
              {otherEmployee?.role && <span className="gv-chat-tag">{otherEmployee.role}</span>}
              <span className="gv-chat-id">{conversationId}</span>
            </div>
          </div>

          <button onClick={() => triggerCall(conversationId)} className="gv-chat-call" title="Audio call" aria-label="Call">
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
            <GwEmpty icon="💬" title={`Start a conversation with ${otherName}`} subtitle="Messages are private and stored securely." />
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
                currentUserId={employeeId}
                onReply={handleReply}
                onDeleteMsg={handleDeleteMsg}
                onEditMsg={handleOpenEdit}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Input area (reply strip / edit bar / normal input) ── */}
        <div className="gv-chat-input">

          {/* Reply preview strip */}
          {replyTo && !editingMsg && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 16px",
              borderTop: "1px solid #E5E7EB",
              background: "#F8FAFF",
              borderLeft: "3px solid #2563EB",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#2563EB", marginBottom: 1 }}>
                  Replying to {replyTo.senderName}
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {replyTo.text || "📎 Attachment"}
                </div>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                style={{ width: 24, height: 24, border: "none", background: "transparent", cursor: "pointer", color: "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: 4, fontSize: 16 }}
              >✕</button>
            </div>
          )}

          {/* Edit bar — replaces input when editing */}
          {editingMsg ? (
            <div style={{ padding: "8px 12px", borderTop: "1px solid #E5E7EB" }}>
              {/* Edit header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#2563EB", display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  Editing message
                </span>
                <button
                  onClick={() => { setEditingMsg(null); setEditText(""); }}
                  style={{ fontSize: 13, color: "#9CA3AF", border: "none", background: "transparent", cursor: "pointer" }}
                >✕ Cancel</button>
              </div>
              {/* Edit textarea */}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  ref={editInputRef}
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                    if (e.key === "Escape") { setEditingMsg(null); setEditText(""); }
                  }}
                  rows={2}
                  style={{
                    flex: 1, resize: "none", border: "1.5px solid #2563EB", borderRadius: 10,
                    padding: "8px 12px", fontSize: 14, fontFamily: "inherit",
                    outline: "none", color: "#111827", background: "#fff",
                    lineHeight: 1.5,
                  }}
                />
                <button
                  onClick={handleSaveEdit}
                  disabled={!editText.trim()}
                  style={{
                    padding: "8px 18px", borderRadius: 10, border: "none",
                    background: editText.trim() ? "#2563EB" : "#E5E7EB",
                    color: editText.trim() ? "#fff" : "#9CA3AF",
                    fontSize: 13, fontWeight: 600, cursor: editText.trim() ? "pointer" : "default",
                    fontFamily: "inherit", flexShrink: 0, alignSelf: "flex-end",
                    transition: "background 0.15s",
                  }}
                >Save</button>
              </div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>Enter to save · Esc to cancel</div>
            </div>
          ) : (
            <MediaMessageInput
              onSend={handleSend}
              placeholder={`Message ${otherName}…`}
              disabled={msgsLoading}
            />
          )}
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