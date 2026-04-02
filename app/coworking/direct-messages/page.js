"use client";
/**
 * GRAV-CMS/app/coworking/direct-messages/page.js
 *
 * MERGED & ENHANCED VERSION
 * Features from both old and new code:
 * ✅ Modern 2-column layout (People | Chat) from old code
 * ✅ Full responsive for all user types (CEO, Admin, Employees) from old code
 * ✅ WhatsApp-style ticks: 1 grey = sent, 2 grey = delivered, 2 blue = read (from new)
 * ✅ Unread counter badge (circle with number) on each conversation (from new)
 * ✅ Badge disappears immediately when you click that conversation (from new)
 * ✅ Timestamp always visible inside every bubble (never disappears) (from new)
 * ✅ Circular avatar indicators on message sender (from new)
 * ✅ Media message support (images, voice, PDF) from old code
 * ✅ Image lightbox modal from old code
 * ✅ Firestore: status field per message (sent/delivered/read) from new
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  collection, query, where, orderBy, limit,
  onSnapshot, getDocs, getDoc, doc, setDoc, updateDoc, addDoc,
  serverTimestamp, writeBatch, arrayUnion,
} from "firebase/firestore";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../components/coworking/layout/CoworkingShell";
import MessageBubble from "../../../components/coworking/messaging/MessageBubble";
import MediaMessageInput from "../../../components/coworking/messaging/MediaMessageInput";
import { GwAvatar, GwSpinner, GwEmpty } from "../../../components/coworking/shared/CoworkShared";
import { firebaseDb } from "../../../lib/coworkFirebase";
import { uploadImage, uploadVoice, uploadPDF } from "../../../lib/mediaUploadApi";

// ─── helpers ─────────────────────────────────────────────
function convId(a, b) { return [a, b].sort().join("_"); }
function tsToMs(ts) {
  if (!ts) return 0;
  if (ts?.seconds) return ts.seconds * 1000;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
function tsToISO(ts) {
  if (!ts) return new Date().toISOString();
  if (ts?.seconds) return new Date(ts.seconds * 1000).toISOString();
  return ts;
}
function fmtTime(ts) {
  const d = new Date(tsToMs(ts) || Date.now());
  if (isNaN(d)) return "";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtConv(ts) {
  const ms = tsToMs(ts); if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 60000) return "now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h";
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function timeAgo(ts) {
  const ms = tsToMs(ts);
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function resolveMessageType(messageType, attachments) {
  if (messageType && messageType !== "text") return messageType;
  if (attachments?.length > 0) return attachments[0].type || "image";
  return "text";
}

// ─── WhatsApp ticks ───────────────────────────────────────
function Ticks({ status }) {
  if (status === "sending") return <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginLeft: 3 }}>○</span>;
  if (status === "sent") return (
    <svg width="14" height="9" viewBox="0 0 14 9" style={{ marginLeft: 3, opacity: 0.75 }}>
      <path d="M1 4.5L4.5 8L13 1" stroke="rgba(255,255,255,0.85)" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (status === "delivered") return (
    <svg width="18" height="9" viewBox="0 0 18 9" style={{ marginLeft: 3, opacity: 0.75 }}>
      <path d="M1 4.5L4.5 8L13 1" stroke="rgba(255,255,255,0.85)" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 4.5L8.5 8L17 1" stroke="rgba(255,255,255,0.85)" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (status === "read") return (
    <svg width="18" height="9" viewBox="0 0 18 9" style={{ marginLeft: 3 }}>
      <path d="M1 4.5L4.5 8L13 1" stroke="#53BDEB" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 4.5L8.5 8L17 1" stroke="#53BDEB" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  return null;
}

// ─── Unread badge ─────────────────────────────────────────
function Badge({ n }) {
  if (!n) return null;
  return (
    <div style={{
      minWidth: 19, height: 19, borderRadius: 10,
      background: "#1A73E8", color: "#fff",
      fontSize: 10.5, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "0 5px", flexShrink: 0,
      animation: "popIn 0.18s ease",
    }}>{n > 99 ? "99+" : n}</div>
  );
}

// ─── Image Lightbox Modal ───
function ImageLightbox({ url, onClose, onDownload }) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          maxWidth: "90vw",
          maxHeight: "90vh",
          background: "transparent",
        }}
      >
        <img
          src={url}
          alt="Enlarged view"
          style={{
            maxWidth: "100%",
            maxHeight: "90vh",
            objectFit: "contain",
            borderRadius: "12px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
          }}
        />
        <button
          onClick={onDownload}
          style={{
            position: "absolute",
            bottom: "20px",
            right: "20px",
            background: "rgba(0,0,0,0.7)",
            border: "none",
            borderRadius: "50%",
            width: "48px",
            height: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.9)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.7)"}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            background: "rgba(0,0,0,0.7)",
            border: "none",
            borderRadius: "50%",
            width: "40px",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
            fontSize: "24px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.9)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.7)"}
        >
          ✕
        </button>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Single message bubble with full features ────────────────
function MessageBubbleFull({ msg, isMe, showAvatar, onImgClick, onDownload }) {
  const status = msg.status || (msg.sending ? "sending" : "sent");
  const avatarColor = isMe ? "linear-gradient(135deg,#3B82F6,#2563EB)" : "linear-gradient(135deg,#1A73E8,#8B5CF6)";
  const initial = (msg.senderName || "?").charAt(0).toUpperCase();

  return (
    <div style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 6, marginBottom: 3 }}>
      {/* Circular avatar */}
      <div style={{ width: 28, height: 28, flexShrink: 0 }}>
        {showAvatar && (
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: avatarColor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700 }}>
            {initial}
          </div>
        )}
      </div>

      {/* Column */}
      <div style={{ display: "flex", flexDirection: "column", maxWidth: "65%", alignItems: isMe ? "flex-end" : "flex-start", animation: "fadeUp 0.18s ease" }}>
        {showAvatar && !isMe && (
          <div style={{ fontSize: 10, color: "#5F6368", marginBottom: 3, paddingLeft: 4, fontWeight: 500 }}>{msg.senderName}</div>
        )}

        {/* Bubble */}
        <div style={{
          padding: "8px 12px 6px",
          borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: msg.error ? "#FCE8E6" : isMe ? "linear-gradient(135deg,#1A73E8,#7C7FFA)" : "#ffffff",
          color: msg.error ? "#D93025" : isMe ? "#fff" : "#1a1a2e",
          border: msg.error ? "1px solid #FECACA" : isMe ? "none" : "1px solid #E8EDF5",
          boxShadow: isMe ? "0 2px 8px rgba(91,94,244,0.22)" : "0 1px 3px rgba(0,0,0,0.05)",
          fontSize: 13.5,
          lineHeight: 1.5,
          opacity: msg.sending ? 0.6 : 1,
          wordBreak: "break-word",
        }}>
          {msg.text && <div>{msg.text}</div>}

          {/* Attachments */}
          {msg.attachments?.map((a, i) => (
            <div key={i} style={{ marginTop: msg.text ? 5 : 0 }}>
              {a.type === "image" && (
                <img
                  src={a.url}
                  alt=""
                  onClick={() => onImgClick(a.url)}
                  style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8, cursor: "pointer", display: "block" }}
                />
              )}
              {a.type === "voice" && (
                <audio controls src={a.url} style={{ maxWidth: "100%", height: 36 }} />
              )}
              {a.type === "pdf" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: isMe ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.05)", padding: "5px 10px", borderRadius: 20, fontSize: 11 }}>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: isMe ? "rgba(255,255,255,0.9)" : "#1A73E8", textDecoration: "none", flex: 1 }}>📄 {a.name || "Document"}</a>
                  <button onClick={() => onDownload(a.url)} style={{ background: "none", border: "none", cursor: "pointer", color: isMe ? "rgba(255,255,255,0.9)" : "#1A73E8", padding: 4, borderRadius: "50%" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                </div>
              )}
              {a.type !== "image" && a.type !== "voice" && a.type !== "pdf" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: isMe ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.05)", padding: "5px 10px", borderRadius: 20, fontSize: 11 }}>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: isMe ? "rgba(255,255,255,0.9)" : "#1A73E8", textDecoration: "none", flex: 1 }}>📎 {a.name || "Attachment"}</a>
                  <button onClick={() => onDownload(a.url)} style={{ background: "none", border: "none", cursor: "pointer", color: isMe ? "rgba(255,255,255,0.9)" : "#1A73E8", padding: 4, borderRadius: "50%" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* ── Time + ticks — ALWAYS VISIBLE ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2, marginTop: 5, opacity: 0.9 }}>
            <span style={{ fontSize: 10, color: isMe ? "rgba(255,255,255,0.72)" : "#9aa0b0", whiteSpace: "nowrap" }}>
              {fmtTime(msg.createdAt)}
            </span>
            {isMe && <Ticks status={status} />}
          </div>
        </div>

        {msg.error && (
          <div style={{ fontSize: 10, color: "#EA4335", marginTop: 2, paddingRight: 4 }}>Failed to send</div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
export default function DirectMessagesPage() {
  const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
  const router = useRouter();

  const [conversations, setConversations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [convsLoading, setConvsLoading] = useState(true);
  const [empsLoading, setEmpsLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const messagesEndRef = useRef(null);
  const unsubRef = useRef(null);
  const pendingMapRef = useRef(new Map());
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [unread, setUnread] = useState({});
  const activeConv = useRef(null);

  // ── Check device type ──────────
  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  // ── Load all employees once ──────────
  useEffect(() => {
    if (!user || !employeeId) return;
    setEmpsLoading(true);
    getDocs(collection(firebaseDb, "cowork_employees"))
      .then(snap => {
        const emps = snap.docs
          .map(d => ({ employeeId: d.id, ...d.data() }))
          .filter(e => e.employeeId !== employeeId);
        setEmployees(emps);
      })
      .catch(err => console.error("employees:", err))
      .finally(() => setEmpsLoading(false));
  }, [user, employeeId]);

  // ── Real-time conversations listener with unread counts ──
  useEffect(() => {
    if (!user || !employeeId) return;
    setConvsLoading(true);

    const q = query(
      collection(firebaseDb, "cowork_direct_messages"),
      where("participantIds", "array-contains", employeeId),
      orderBy("updatedAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      async snap => {
        const convs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setConversations(convs);
        setConvsLoading(false);

        // Count unread per conversation
        const counts = {};
        await Promise.all(convs.map(async conv => {
          if (conv.id === activeConv.current) return;
          try {
            const ms = await getDocs(
              query(collection(firebaseDb, "cowork_direct_messages", conv.id, "messages"),
                where("senderId", "!=", employeeId))
            );
            const n = ms.docs.filter(d => !(d.data().readBy || []).includes(employeeId)).length;
            if (n > 0) counts[conv.id] = n;
          } catch (_) { }
        }));
        setUnread(counts);
      },
      err => {
        console.error("conversations listener:", err);
        setConvsLoading(false);
      }
    );

    unsubRef.current = unsub;
    return () => unsub();
  }, [user, employeeId]);

  // ── Real-time message listener for selected conversation ──
  useEffect(() => {
    if (!selectedPerson || !employeeId) return;

    const conversationId = convId(employeeId, selectedPerson.employeeId);
    activeConv.current = conversationId;
    setMsgsLoading(true);

    const msgsRef = collection(firebaseDb, "cowork_direct_messages", conversationId, "messages");
    const q = query(msgsRef, orderBy("createdAt", "asc"), limit(100));

    const unsub = onSnapshot(
      q,
      async snap => {
        const incoming = snap.docs.map(d => ({
          ...d.data(),
          id: d.id,
          createdAt: tsToISO(d.data().createdAt),
          temp: false, sending: false, error: false,
        }));

        // Mark messages from other person as READ
        const toRead = snap.docs.filter(d => d.data().senderId !== employeeId && !(d.data().readBy || []).includes(employeeId));
        if (toRead.length > 0) {
          const batch = writeBatch(firebaseDb);
          toRead.forEach(d => batch.update(d.ref, { readBy: arrayUnion(employeeId), status: "read" }));
          batch.commit().catch(console.error);
          setUnread(prev => { const n = { ...prev }; delete n[conversationId]; return n; });
        }

        // Merge with optimistic messages
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

          const merged = [...incoming, ...pendingKept]
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

          // Attach status from Firestore
          return merged.map(m => {
            if (m.temp || m.error) return m;
            const live = snap.docs.find(d => d.data().messageId === m.messageId);
            if (!live) return m;
            const rb = live.data().readBy || [];
            const status = rb.includes(selectedPerson.employeeId) ? "read" : rb.length > 1 ? "delivered" : "sent";
            return { ...m, status };
          });
        });
        setMsgsLoading(false);
      },
      err => {
        console.error("messages listener:", err);
        setMsgsLoading(false);
      }
    );

    return () => { unsub(); activeConv.current = null; };
  }, [selectedPerson, employeeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!loading && !user) router.push("/coworking-login");
  }, [user, loading, router]);

  const downloadImage = (url) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = `image_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSend = async (text, attachments, messageType) => {
    if (!selectedPerson || !employeeId) return;

    const conversationId = convId(employeeId, selectedPerson.employeeId);
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
      status: "sending",
      temp: true,
      sending: true,
      error: false,
      createdAt: new Date().toISOString(),
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
          participantIds: [employeeId, selectedPerson.employeeId].sort(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

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
        status: "sent",
        createdAt: serverTimestamp(),
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

      setMessages(prev => prev.filter(m => m.messageId !== tempId));
      pendingMapRef.current.delete(tempId);

    } catch (err) {
      console.error("handleSend error:", err);
      pendingMapRef.current.delete(tempId);
      setMessages(prev => prev.map(m =>
        m.messageId === tempId
          ? { ...m, sending: false, error: true, status: "error" }
          : m
      ));
    }
  };

  const selectPerson = (person) => {
    if (!person) return;
    setSelectedPerson(person);
    setMessages([]);
    pendingMapRef.current.clear();
    if (isMobile) {
      setMobileChatOpen(true);
    }
    // Clear badge immediately
    const cid = convId(employeeId, person.employeeId);
    setUnread(prev => { const n = { ...prev }; delete n[cid]; return n; });
  };

  const closeChat = () => {
    setMobileChatOpen(false);
    if (isMobile) {
      setSelectedPerson(null);
    }
  };

  const handleBackToList = () => {
    setMobileChatOpen(false);
    setSelectedPerson(null);
  };

  if (loading || !user) return null;

  const empMap = Object.fromEntries(employees.map(e => [e.employeeId, e]));
  const filteredEmps = employees.filter(e =>
    e.name?.toLowerCase().includes(search.toLowerCase()) ||
    e.employeeId?.toLowerCase().includes(search.toLowerCase()) ||
    e.department?.toLowerCase().includes(search.toLowerCase())
  );

  const groupedMsgs = messages.map((msg, i) => ({
    ...msg,
    isMe: msg.senderId === employeeId,
    showSender: i === 0 || messages[i - 1]?.senderId !== msg.senderId,
    showAvatar: i === 0 || messages[i - 1]?.senderId !== msg.senderId,
  }));

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  return (
    <>
      <style>{STYLES}</style>

      {lightboxImage && (
        <ImageLightbox
          url={lightboxImage}
          onClose={() => setLightboxImage(null)}
          onDownload={() => downloadImage(lightboxImage)}
        />
      )}

      <div className={`dm-root ${isTablet ? 'tablet-view' : ''} ${isMobile ? 'mobile-view' : ''}`}>

        {/* ═══ LEFT PANEL: People + Recent Conversations ═══ */}
        <div className={`dm-left-panel${(isMobile && mobileChatOpen) ? " mob-hidden" : ""}`}>

          {/* Close button for CEO/admin on mobile */}
          {isMobile && mobileChatOpen && (
            <button className="dm-mobile-close-left" onClick={() => setMobileChatOpen(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {/* Header */}
          <div className="dm-left-header">
            <div className="dm-brand">
              <div className="dm-brand-mark">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M2 13c0-3 2-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div className="dm-brand-title">Messages</div>
                <div className="dm-brand-sub">Direct conversations</div>
              </div>
            </div>
            {totalUnread > 0 && <Badge n={totalUnread} />}
          </div>

          {/* Recent Conversations Section */}
          <div className="dm-section">
            <div className="dm-section-header">
              <span className="dm-section-title">Recent Conversations</span>
              <span className="dm-section-count">
                {convsLoading ? "…" : conversations.length}
              </span>
            </div>

            <div className="dm-conv-list">
              {convsLoading ? (
                <div className="dm-center"><GwSpinner size={24} /></div>
              ) : conversations.length === 0 ? (
                <div className="dm-empty-small">
                  <span>💬</span>
                  <p>No recent conversations</p>
                </div>
              ) : (
                conversations.map(conv => {
                  const otherId = conv.participantIds?.find(id => id !== employeeId) || "";
                  const other = empMap[otherId];
                  const name = other?.name || otherId;
                  const lastMsg = conv.lastMessage;
                  const preview =
                    lastMsg?.messageType === "image" ? "📷 Image"
                      : lastMsg?.messageType === "pdf" ? "📄 Document"
                        : lastMsg?.messageType === "voice" ? "🎤 Voice note"
                          : lastMsg?.text?.slice(0, 50) || "No messages yet";
                  const ts = lastMsg?.sentAt || conv.updatedAt;
                  const n = unread[conv.id] || 0;
                  const isAct = selectedPerson?.employeeId === otherId;

                  return (
                    <button
                      key={conv.id}
                      className={`dm-conv-item${isAct ? " active" : ""}`}
                      onClick={() => selectPerson(other)}
                    >
                      <GwAvatar name={name} size={isMobile ? 36 : 40} />
                      <div className="dm-conv-info">
                        <div className="dm-conv-name" style={{ fontWeight: n > 0 ? 700 : 500 }}>{name}</div>
                        <div className="dm-conv-preview" style={{ fontWeight: n > 0 ? 600 : 400 }}>{preview}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, color: n > 0 ? "#1A73E8" : "#9AA0A6", fontWeight: n > 0 ? 600 : 400, whiteSpace: "nowrap" }}>{fmtConv(ts)}</span>
                        <Badge n={n} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* People List Section */}
          <div className="dm-section">
            <div className="dm-section-header">
              <span className="dm-section-title">All People</span>
              <span className="dm-section-count">{employees.length}</span>
            </div>

            {/* Search Bar */}
            <div className="dm-search-wrap">
              <div className="dm-search-icon">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </div>
              <input
                className="dm-search-input"
                placeholder="Search by name or department…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="dm-people-list">
              {empsLoading ? (
                <div className="dm-center"><GwSpinner size={24} /></div>
              ) : filteredEmps.length === 0 ? (
                <div className="dm-empty-small">
                  <span>👥</span>
                  <p>No employees found</p>
                </div>
              ) : (
                filteredEmps.map(emp => (
                  <button
                    key={emp.employeeId}
                    className={`dm-person-item${selectedPerson?.employeeId === emp.employeeId ? " active" : ""}`}
                    onClick={() => selectPerson(emp)}
                  >
                    <GwAvatar name={emp.name || emp.employeeId} size={isMobile ? 32 : 36} />
                    <div className="dm-person-info">
                      <div className="dm-person-name">{emp.name || emp.employeeId}</div>
                      <div className="dm-person-sub">{emp.department || emp.employeeId}</div>
                    </div>
                    <div className="dm-person-arrow">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5h6M5.5 2.5L8 5l-2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ═══ RIGHT PANEL: Chat Area ═══ */}
        <div className={`dm-chat-panel${isMobile && !mobileChatOpen ? " mob-hidden" : ""}`}>

          {/* Chat Header - Always shows person name when selected */}
          <div className="dm-chat-header">
            {(isMobile || isTablet) && (
              <button className="dm-mobile-back" onClick={handleBackToList} aria-label="Back to people list">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Back</span>
              </button>
            )}

            {selectedPerson ? (
              <>
                <GwAvatar name={selectedPerson.name || selectedPerson.employeeId} size={isMobile ? 36 : 44} />
                <div className="dm-chat-info">
                  <div className="dm-chat-name">{selectedPerson.name || selectedPerson.employeeId}</div>
                  <div className="dm-chat-sub">
                    {selectedPerson.department && (
                      <span className="dm-dept-badge">{selectedPerson.department}</span>
                    )}
                    {selectedPerson.role === "ceo" && (
                      <span className="dm-role-badge ceo">CEO</span>
                    )}
                    {selectedPerson.role === "admin" && (
                      <span className="dm-role-badge admin">Admin</span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="dm-chat-placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" strokeLinejoin="round" />
                </svg>
                <span>Select a person to start messaging</span>
              </div>
            )}
          </div>

          {/* Messages Area */}
          <div className="dm-messages-area">
            {!selectedPerson ? (
              <div className="dm-empty-chat">
                <div className="dm-empty-icon">💬</div>
                <p>No conversation selected</p>
                <span>Choose someone from the left to start chatting</span>
              </div>
            ) : msgsLoading && messages.length === 0 ? (
              <div className="dm-center"><GwSpinner size={28} /></div>
            ) : messages.length === 0 ? (
              <div className="dm-empty-chat">
                <div className="dm-empty-icon">💬</div>
                <p>No messages yet</p>
                <span>Start a conversation with {selectedPerson.name || selectedPerson.employeeId}</span>
              </div>
            ) : (
              <>
                {groupedMsgs.map((msg, i) => {
                  const isMe = msg.senderId === employeeId;
                  const showAvatar = msg.showAvatar;

                  return (
                    <MessageBubbleFull
                      key={msg.messageId || msg.id || i}
                      msg={msg}
                      isMe={isMe}
                      showAvatar={showAvatar}
                      onImgClick={setLightboxImage}
                      onDownload={downloadImage}
                    />
                  );
                })}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          {selectedPerson && (
            <div className="dm-input-area">
              <MediaMessageInput
                onSend={handleSend}
                placeholder={`Message ${selectedPerson.name || selectedPerson.employeeId}…`}
                disabled={msgsLoading}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

@keyframes fadeUp { 
  from { opacity: 0; transform: translateY(5px); } 
  to { opacity: 1; transform: translateY(0); } 
}

@keyframes popIn { 
  from { transform: scale(0.5); opacity: 0; } 
  to { transform: scale(1); opacity: 1; } 
}

.dm-root {
  display: flex;
  height: calc(100vh - 108px);
  border-radius: 20px;
  overflow: hidden;
  background: var(--surface, #FFFFFF);
  border: 1px solid var(--border, #E8EAED);
  box-shadow: 0 20px 60px rgba(0,0,0,0.08);
  font-family: 'DM Sans', system-ui, sans-serif;
  position: relative;
}

/* LEFT PANEL */
.dm-left-panel {
  width: 340px;
  min-width: 340px;
  display: flex;
  flex-direction: column;
  background: #F8FAFE;
  border-right: 1px solid var(--border, #E8EAED);
  overflow-y: auto;
}

.dm-left-header {
  padding: 20px 18px 12px;
  border-bottom: 1px solid var(--border, #E8EAED);
  background: var(--surface);
  display: flex;
  align-items: center;
  gap: 10px;
}

.dm-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.dm-brand-mark {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: linear-gradient(135deg, #1A73E8, #8B5CF6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.dm-brand-title {
  font-size: 15px;
  font-weight: 800;
  color: #202124;
  letter-spacing: -0.3px;
}

.dm-brand-sub {
  font-size: 11px;
  color: #9AA0A6;
  margin-top: 2px;
}

/* Sections */
.dm-section {
  padding: 16px 0 8px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,0.05));
}

.dm-section-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0 18px 8px;
}

.dm-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #5F6368;
}

.dm-section-count {
  font-size: 10px;
  font-weight: 600;
  color: #9AA0A6;
  background: #F1F5F9;
  padding: 2px 7px;
  border-radius: 20px;
}

/* Search */
.dm-search-wrap {
  position: relative;
  margin: 0 14px 12px;
}

.dm-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #9AA0A6;
}

.dm-search-input {
  width: 100%;
  padding: 9px 12px 9px 34px;
  border: 1.5px solid #E2E8F0;
  border-radius: 12px;
  font-size: 12.5px;
  font-family: inherit;
  background: white;
  transition: all 0.2s;
}

.dm-search-input:focus {
  outline: none;
  border-color: #1A73E8;
  box-shadow: 0 0 0 3px rgba(91,94,244,0.1);
}

/* Conversation list */
.dm-conv-list, .dm-people-list {
  max-height: 280px;
  overflow-y: auto;
  padding: 0 8px;
}

.dm-conv-list::-webkit-scrollbar,
.dm-people-list::-webkit-scrollbar,
.dm-messages-area::-webkit-scrollbar {
  width: 4px;
}

.dm-conv-list::-webkit-scrollbar-track,
.dm-people-list::-webkit-scrollbar-track,
.dm-messages-area::-webkit-scrollbar-track {
  background: transparent;
}

.dm-conv-list::-webkit-scrollbar-thumb,
.dm-people-list::-webkit-scrollbar-thumb,
.dm-messages-area::-webkit-scrollbar-thumb {
  background: #E2E8F0;
  border-radius: 4px;
}

.dm-conv-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  width: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  border-radius: 12px;
  transition: all 0.2s;
  margin-bottom: 2px;
}

.dm-conv-item:hover {
  background: #F1F5F9;
}

.dm-conv-item.active {
  background: #E8F0FE;
}

.dm-conv-info {
  flex: 1;
  min-width: 0;
}

.dm-conv-name {
  font-size: 13px;
  font-weight: 600;
  color: #202124;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dm-conv-preview {
  font-size: 11px;
  color: #5F6368;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* People list */
.dm-person-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  width: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  border-radius: 10px;
  transition: all 0.2s;
}

.dm-person-item:hover {
  background: #F1F5F9;
}

.dm-person-item.active {
  background: #E8F0FE;
}

.dm-person-info {
  flex: 1;
  min-width: 0;
}

.dm-person-name {
  font-size: 13px;
  font-weight: 500;
  color: #202124;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dm-person-sub {
  font-size: 11px;
  color: #5F6368;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dm-person-arrow {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #F1F5F9;
  color: #1A73E8;
  flex-shrink: 0;
}

/* Role badges */
.dm-role-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 500;
  margin-left: 4px;
}

.dm-role-badge.ceo {
  background: linear-gradient(135deg, #F9AB00, #E37400);
  color: white;
}

.dm-role-badge.admin {
  background: linear-gradient(135deg, #3B82F6, #2563EB);
  color: white;
}

/* CHAT PANEL */
.dm-chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #F8FAFE;
  overflow: hidden;
}

.dm-chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid var(--border, #E8EAED);
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  min-height: 66px;
}

.dm-mobile-back {
  display: none;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid #E2E8F0;
  background: white;
  border-radius: 10px;
  cursor: pointer;
  color: #1A73E8;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
}

.dm-mobile-back:hover {
  background: #F1F5F9;
  transform: scale(0.98);
}

.dm-mobile-close-left {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 20;
  background: white;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  padding: 6px;
  cursor: pointer;
  display: none;
  color: #1A73E8;
}

.dm-chat-info {
  flex: 1;
  min-width: 0;
}

.dm-chat-name {
  font-size: 16px;
  font-weight: 700;
  color: #202124;
  letter-spacing: -0.3px;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dm-chat-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dm-dept-badge {
  font-size: 10px;
  color: #1A73E8;
  background: #E8F0FE;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 500;
}

.dm-chat-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #9AA0A6;
  font-size: 13px;
}

/* Messages Area */
.dm-messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dm-empty-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  padding: 40px;
  color: #9AA0A6;
}

.dm-empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.dm-empty-small {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 20px;
  text-align: center;
  color: #9AA0A6;
  gap: 8px;
}

.dm-empty-small span {
  font-size: 32px;
  opacity: 0.5;
}

.dm-empty-small p {
  font-size: 12px;
  margin: 0;
}

.dm-center {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.dm-input-area {
  flex-shrink: 0;
  border-top: 1px solid var(--border, #E8EAED);
  background: white;
  padding: 8px 16px;
}

/* Tablet Responsive (768px - 1024px) */
@media (min-width: 768px) and (max-width: 1024px) {
  .dm-left-panel {
    width: 280px;
    min-width: 280px;
  }

  .dm-conv-list, .dm-people-list {
    max-height: 240px;
  }

  .dm-chat-name {
    font-size: 15px;
  }

  .dm-messages-area {
    padding: 16px;
  }

  .dm-mobile-back {
    display: flex !important;
  }
}

/* Mobile Responsive (up to 767px) */
@media (max-width: 767px) {
  .dm-root {
    height: calc(100dvh - 56px);
    border-radius: 0;
  }

  .dm-left-panel {
    width: 100%;
    min-width: 100%;
    position: absolute;
    inset: 0;
    z-index: 10;
    background: #F8FAFE;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .dm-left-panel.mob-hidden {
    transform: translateX(-100%);
  }

  .dm-chat-panel {
    width: 100%;
    position: absolute;
    inset: 0;
    z-index: 20;
    background: #F8FAFE;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .dm-chat-panel.mob-hidden {
    transform: translateX(100%);
  }

  .dm-mobile-back {
    display: flex !important;
  }

  .dm-mobile-close-left {
    display: flex;
  }

  .dm-chat-header {
    padding: 10px 12px;
    gap: 10px;
  }

  .dm-chat-name {
    font-size: 14px;
  }

  .dm-messages-area {
    padding: 12px;
  }

  .dm-conv-list, .dm-people-list {
    max-height: 220px;
  }

  .dm-conv-item, .dm-person-item {
    gap: 10px;
    padding: 8px 10px;
  }

  .dm-conv-name, .dm-person-name {
    font-size: 12px;
  }

  .dm-conv-preview, .dm-person-sub {
    font-size: 10px;
  }
}

/* Desktop and Large Screens (1025px and above) */
@media (min-width: 1025px) {
  .dm-left-panel {
    width: 360px;
    min-width: 360px;
  }

  .dm-conv-list, .dm-people-list {
    max-height: 320px;
  }

  .dm-messages-area {
    padding: 20px 24px;
  }
}

/* Very Large Screens (1440px and above) */
@media (min-width: 1440px) {
  .dm-left-panel {
    width: 380px;
    min-width: 380px;
  }

  .dm-conv-list, .dm-people-list {
    max-height: 360px;
  }

  .dm-chat-name {
    font-size: 18px;
  }
}
`;