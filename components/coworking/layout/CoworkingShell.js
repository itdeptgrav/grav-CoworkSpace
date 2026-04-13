"use client";
import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { firebaseAuth, firebaseDb } from "../../../lib/coworkFirebase";
import { useCoworkNotifications } from "../../../hooks/useCoworkNotifications";
import { timeAgo } from "../../../lib/coworkUtils";
import { useState, useEffect, useRef, useCallback } from "react";
import NotesSidebarPanel from "../notes/NotesSidebarPanel";
import { subscribePip, clearPipMeeting, getPipMeeting } from "../../../lib/pipMeetingStore";
import dynamic from "next/dynamic";
import { useFCMToken } from "../../../hooks/useFCMToken";
import { usePushNotifications } from "../../../hooks/usePushNotifications";

// Dynamically import LiveKit (browser-only) for PiP room
const LiveKitRoom = dynamic(() => import("@livekit/components-react").then(m => m.LiveKitRoom), { ssr: false });
const RoomAudioRenderer = dynamic(() => import("@livekit/components-react").then(m => m.RoomAudioRenderer), { ssr: false });
const useLocalParticipant = dynamic ? null : null; // accessed via window event instead

import {
  collection, doc, setDoc, updateDoc, getDocs, getDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch,
} from "firebase/firestore";


/* ── helpers shared by the panel ── */
const CLD_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function fetchEmployees(excludeId) {
  const snap = await getDocs(collection(firebaseDb, "cowork_employees"));
  const list = [];
  snap.forEach(d => {
    const e = d.data();
    if (e.employeeId && e.employeeId !== excludeId) list.push(e);
  });
  return list;
}



async function uploadImageCld(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLD_PRESET);
  fd.append("folder", "cowork-requests");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLD_CLOUD}/image/upload`, { method: "POST", body: fd });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || "Upload failed");
  return { url: d.secure_url, name: file.name, type: "image", size: d.bytes || file.size };
}

async function uploadPdfBackend(file) {
  const token = await firebaseAuth.currentUser?.getIdToken();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE_URL}/cowork/upload/pdf`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "PDF upload failed");
  return { url: d.url || d.viewUrl, name: file.name, type: "pdf", size: d.size || file.size };
}

function fmtTime(ts) {
  if (!ts) return "";
  const ms = ts?.seconds ? ts.seconds * 1000 : new Date(ts).getTime();
  const diff = Math.floor((Date.now() - ms) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  if (diff < 10080) return `${Math.floor(diff / 1440)}d ago`;
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function ReqAvatar({ name = "?" }) {
  const colors = ["#1A73E8", "#0F9D58", "#F29900", "#7B1FA2", "#D93025", "#00ACC1"];
  const bg = colors[name.charCodeAt(0) % colors.length];
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: 30, height: 30, borderRadius: 8, background: bg, color: "#fff",
      fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
    }}>
      {initials}
    </div>
  );
}

const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"];
const TYPE_OPTIONS = ["Information", "Approval", "Resource", "Review", "Clarification", "Support", "Other"];
const STATUS_COLORS = {
  pending: { color: "#D97706", bg: "#FEF3C7" },
  approved: { color: "#16A34A", bg: "#F0FDF4" },
  rejected: { color: "#DC2626", bg: "#FEF2F2" },
};

/* ─── RequestSidebarPanel ─── */
function RequestSidebarPanel({ employeeId, employeeName, onClose, initialTab = "received", prefilledTask = null, highlightReqId = null, openRespondId = null, onOpenChat = null, activeChatReqId = null, chatThreads = {}, chatInput = {}, setChatInput = () => { }, sendChatMsg = () => { }, threadContext = null }) {
  const [tab, setTab] = useState(initialTab); // "compose" | "received" | "sent"
  const [employees, setEmployees] = useState([]);
  // compose form
  const [toIds, setToIds] = useState([]);
  const [subject, setSubject] = useState("");
  const [msg, setMsg] = useState("");
  const [priority, setPriority] = useState("medium");
  const [type, setType] = useState("Information");
  const [dueDate, setDueDate] = useState("");
  const [taskRef, setTaskRef] = useState(""); // optional task reference
  const [taskQuery, setTaskQuery] = useState("");
  const [taskSuggestions, setTaskSuggestions] = useState([]);
  const [showTaskDrop, setShowTaskDrop] = useState(false);
  const [selectedTaskObj, setSelectedTaskObj] = useState(null);
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  // received / sent lists
  const [received, setReceived] = useState([]);
  const [sent2, setSent2] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [respondingId, setRespondingId] = useState(null);
  const [respondMsg, setRespondMsg] = useState("");
  const chatEndRefs = useRef({});
  const reqItemRefs = useRef({});
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  // Section collapse state — pending open by default, responded closed
  const [pendingOpen, setPendingOpen] = useState(true);
  const [respondedOpen, setRespondedOpen] = useState(false);

  // Scroll to highlighted request when panel opens
  useEffect(() => {
    if (!highlightReqId) return;
    const el = reqItemRefs.current[highlightReqId];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightReqId, received]);

  // Auto-open respond form when triggered from chat card
  useEffect(() => {
    if (!openRespondId) return;
    setRespondingId(openRespondId);
    setRespondMsg("");
    setTimeout(() => {
      const el = reqItemRefs.current[openRespondId];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, [openRespondId]);
  const [seenIds, setSeenIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("req_seen_ids") || "[]")); } catch { return new Set(); }
  });
  const unseenCount = received.filter(r => !seenIds.has(r.id)).length;

  useEffect(() => {
    fetchEmployees(employeeId).then(setEmployees).catch(() => { });
  }, [employeeId]);

  // Pre-fill task when opened from tasks page
  useEffect(() => {
    if (prefilledTask?.taskId) {
      setTaskRef(prefilledTask.taskId);
      setSelectedTaskObj({ taskId: prefilledTask.taskId, title: prefilledTask.taskTitle || prefilledTask.taskId });
    }
  }, [prefilledTask]);

  // Pre-fill recipient + switch to compose when opened from DM/Group
  useEffect(() => {
    if (threadContext?.recipientId) {
      setToIds([threadContext.recipientId]);
      setTab("compose");
    }
  }, [threadContext?.recipientId]);

  // Pre-fill ALL group members when recipientIds array is passed (group request button)
  useEffect(() => {
    if (threadContext?.recipientIds?.length > 0) {
      setToIds(threadContext.recipientIds);
      setTab("compose");
    }
  }, [JSON.stringify(threadContext?.recipientIds)]);
  // Task autocomplete — simple getDocs with client-side filter, no composite index needed
  useEffect(() => {
    if (!taskQuery.trim() || taskQuery.length < 2) { setTaskSuggestions([]); return; }
    let cancelled = false;
    getDocs(collection(firebaseDb, "cowork_tasks")).then(snap => {
      if (cancelled) return;
      const lower = taskQuery.toLowerCase();
      const results = snap.docs
        .map(d => ({ taskId: d.id, ...d.data() }))
        .filter(t =>
          !t.parentTaskId &&
          t.status !== "done" &&
          (t.title?.toLowerCase().includes(lower) || t.taskId?.toLowerCase().includes(lower))
        )
        .slice(0, 6);
      setTaskSuggestions(results);
    }).catch(() => { });
    return () => { cancelled = true; };
  }, [taskQuery]);

  // Always listen to both received and sent — no orderBy to avoid missing composite index
  useEffect(() => {
    if (!employeeId) return;
    const sortByDate = docs => [...docs].sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
    const qR = query(collection(firebaseDb, "cowork_requests"), where("toId", "==", employeeId));
    const unsubR = onSnapshot(qR, snap => {
      setReceived(prev => {
        const map = new Map(prev.map(r => [r.id, r]));
        snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
        return sortByDate([...map.values()]);
      });
    }, err => console.error("received listener:", err));
    // Also catch group requests where this employee is in the toIds array
    const qRGroup = query(collection(firebaseDb, "cowork_requests"), where("toIds", "array-contains", employeeId));
    const unsubRGroup = onSnapshot(qRGroup, snap => {
      setReceived(prev => {
        const map = new Map(prev.map(r => [r.id, r]));
        snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
        return sortByDate([...map.values()]);
      });
    }, err => console.error("received group listener:", err));
    const qS = query(collection(firebaseDb, "cowork_requests"), where("fromId", "==", employeeId));
    const unsubS = onSnapshot(qS, snap => {
      setSent2(sortByDate(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, err => console.error("sent listener:", err));
    return () => { unsubR(); unsubRGroup(); unsubS(); };
  }, [employeeId]);

  const toggleRecipient = (id) => {
    setToIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleFilePick = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    setFiles(prev => [...prev, ...picked.filter(f =>
      f.type.startsWith("image/") || !f.type.startsWith("image/")  // accept all non-executable files
    ).map(f => ({ file: f, uploading: false, done: false, result: null }))]);
  };

  const resetForm = () => {
    setToIds([]); setSubject(""); setMsg(""); setPriority("medium");
    setType("Information"); setDueDate(""); setTaskRef(""); setTaskQuery(""); setSelectedTaskObj(null); setFiles([]);
    setError(""); setSent(false);
  };

  const handleSend = async () => {
    if (toIds.length === 0) { setError("Select at least one recipient."); return; }
    if (!subject.trim()) { setError("Subject is required."); return; }
    if (!msg.trim()) { setError("Message is required."); return; }
    setError(""); setSending(true);
    try {
      // Upload attachments
      const uploaded = [];
      const updFiles = [...files];
      for (let i = 0; i < updFiles.length; i++) {
        updFiles[i] = { ...updFiles[i], uploading: true };
        setFiles([...updFiles]);
        const f = updFiles[i].file;
        const result = f.type.startsWith("image/") ? await uploadImageCld(f) : await uploadPdfBackend(f);
        updFiles[i] = { ...updFiles[i], uploading: false, done: true, result };
        uploaded.push(result);
        setFiles([...updFiles]);
      }
      // ── For GROUP thread: create ONE shared request doc for all members ──
      // ── For DM / individual: keep one doc per recipient (existing behaviour) ──
      if (threadContext?.type === "group" && threadContext?.threadId) {
        const reqId = crypto.randomUUID();
        const toNames = toIds.map(id => employees.find(e => e.employeeId === id)?.name || id);
        await setDoc(doc(firebaseDb, "cowork_requests", reqId), {
          requestId: reqId,
          taskId: taskRef || null,
          taskTitle: selectedTaskObj?.title || taskRef || null,
          fromId: employeeId,
          fromName: employeeName,
          // Store first recipient for backwards-compat display, full list in toIds array
          toId: toIds[0] || null,
          toName: toNames[0] || null,
          toIds,
          toNames,
          isGroupRequest: true,
          subject: subject.trim(),
          message: msg.trim(),
          type,
          priority,
          dueDate: dueDate || null,
          attachments: uploaded,
          status: "pending",
          responseMessage: "",
          threadType: "group",
          threadId: threadContext.threadId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        // Notify each recipient individually (but only ONE request doc exists)
        const batch = writeBatch(firebaseDb);
        for (const toId of toIds) {
          const notifRef = doc(collection(firebaseDb, "cowork_notifications"));
          batch.set(notifRef, {
            recipientEmployeeId: toId,
            type: "request",
            title: `New group request from ${employeeName}`,
            body: subject.trim(),
            fromId: employeeId,
            fromName: employeeName,
            requestId: reqId,
            read: false,
            createdAt: serverTimestamp(),
          });
        }
        await batch.commit();
      } else {
        // Create one request doc per recipient (DM / task context)
        for (const toId of toIds) {
          const toEmp = employees.find(e => e.employeeId === toId);
          const reqId = crypto.randomUUID();
          await setDoc(doc(firebaseDb, "cowork_requests", reqId), {
            requestId: reqId,
            taskId: taskRef || null,
            taskTitle: selectedTaskObj?.title || taskRef || null,
            fromId: employeeId,
            fromName: employeeName,
            toId,
            toName: toEmp?.name || toId,
            subject: subject.trim(),
            message: msg.trim(),
            type,
            priority,
            dueDate: dueDate || null,
            attachments: uploaded,
            status: "pending",
            responseMessage: "",
            threadType: threadContext?.type || null,
            threadId: threadContext?.threadId || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          // Firestore notification
          const notifRef = doc(collection(firebaseDb, "cowork_notifications"));
          await setDoc(notifRef, {
            recipientEmployeeId: toId,
            type: "request",
            title: `New request from ${employeeName}`,
            body: subject.trim(),
            fromId: employeeId,
            fromName: employeeName,
            requestId: reqId,
            read: false,
            createdAt: serverTimestamp(),
          });
        }
      }
      // ── Post system message to task chat if this request is linked to a task ──
      if (taskRef) {
        try {
          const chatMsgId = crypto.randomUUID();
          await setDoc(
            doc(collection(firebaseDb, "cowork_tasks", taskRef, "chat"), chatMsgId),
            {
              messageId: chatMsgId,
              taskId: taskRef,
              senderId: "system",
              senderName: "System",
              text: `📋 New request by ${employeeName}: "${subject.trim()}"`,
              messageType: "system",
              createdAt: serverTimestamp(),
              readBy: [],
            }
          );
          // bump task updatedAt so chat count listeners pick it up
          await updateDoc(doc(firebaseDb, "cowork_tasks", taskRef), {
            updatedAt: serverTimestamp(),
          });
        } catch (_) { /* non-blocking — don't fail the request if chat write fails */ }
      }
      setSent(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };



  const handleRespond = async (reqId, status) => {
    setRespondingId(reqId);
    try {
      await updateDoc(doc(firebaseDb, "cowork_requests", reqId), {
        status,
        responseMessage: respondMsg.trim(),
        updatedAt: serverTimestamp(),
      });
      setRespondMsg(""); setRespondingId(null);
    } catch (e) {
      console.error(e);
      setRespondingId(null);
    }
  };

  const empLabel = (e) => {
    if (e.role === "ceo") return `${e.name} (CEO)`;
    if (e.role === "tl") return `${e.name}${e.department ? ` · ${e.department} TL` : " (TL)"}`;
    return `${e.name}${e.department ? ` · ${e.department}` : ""}`;
  };

  const priColor = { low: "#16A34A", medium: "#D97706", high: "#DC2626", urgent: "#7C3AED" };
  const priBg = { low: "#F0FDF4", medium: "#FEF3C7", high: "#FEF2F2", urgent: "#F5F3FF" };

  return (
    <>
      {/* Header */}
      <div className="cw-req-panel-head">
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: "#EBF3FE",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A73E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <div>
            <div className="cw-req-panel-title">Requests</div>
            <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 1 }}>Send & manage requests</div>
          </div>
        </div>
        <button className="cw-req-panel-close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="cw-req-tab-bar">
        {[
          ["compose", <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> New Request</>],
          ["received", <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg> Received</>],
          ["sent", <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg> Sent</>],
        ].map(([key, label]) => (
          <button key={key} className={`cw-req-tab${tab === key ? " active" : ""}`} onClick={() => { setTab(key); if (key === "compose") setSent(false); if (key === "received") { const ids = [...received.map(r => r.id), ...seenIds]; setSeenIds(new Set(ids)); try { localStorage.setItem("req_seen_ids", JSON.stringify(ids)); } catch { } } }}>
            {label}
            {key === "received" && unseenCount > 0 && (
              <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: "#fff", background: "#EF4444", padding: "1px 5px", borderRadius: 99 }}>
                {unseenCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="cw-req-body">
        {/* ── COMPOSE TAB ── */}
        {tab === "compose" && (
          <div style={{ padding: "16px 18px" }}>
            {sent ? (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%", background: "#ECFDF5",
                  display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px"
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#16A34A", marginBottom: 6 }}>Request Sent!</div>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 20, lineHeight: 1.6 }}>
                  Your request has been sent to {toIds.length} recipient{toIds.length > 1 ? "s" : ""}.
                </div>
                <button onClick={resetForm} style={{
                  padding: "8px 20px", background: "#1A73E8", color: "#fff",
                  border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit"
                }}>
                  Send Another
                </button>
              </div>
            ) : (
              <>
                {error && (
                  <div style={{
                    background: "#FEF2F2", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 7,
                    padding: "8px 12px", color: "#DC2626", fontSize: 12, marginBottom: 14
                  }}>
                    {error}
                  </div>
                )}

                {/* Recipients — multi-select chips */}
                <div className="cw-rf-field">
                  <label className="cw-rf-lbl">To *</label>
                  <div style={{
                    display: "flex", flexWrap: "wrap", gap: 5, padding: "8px 10px",
                    border: "1.5px solid #E4E7EC", borderRadius: 7, background: "#F9FAFB",
                    minHeight: 40, cursor: "pointer"
                  }}
                    onClick={() => document.getElementById('cw-emp-select')?.focus()}>
                    {toIds.length === 0 && <span style={{ fontSize: 12, color: "#9AA0A6", alignSelf: "center" }}>Select recipients…</span>}
                    {toIds.map(id => {
                      const e = employees.find(x => x.employeeId === id);
                      return (
                        <span key={id} style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "2px 8px 2px 6px", borderRadius: 99, background: "#EBF3FE",
                          border: "1px solid #BFDBFE", fontSize: 11, fontWeight: 600, color: "#1A73E8"
                        }}>
                          {e?.name || id}
                          <button onClick={(ev) => { ev.stopPropagation(); toggleRecipient(id); }}
                            style={{
                              background: "none", border: "none", cursor: "pointer", color: "#1A73E8",
                              fontSize: 12, lineHeight: 1, padding: 0, marginLeft: 2
                            }}>×</button>
                        </span>
                      );
                    })}
                  </div>
                  <select id="cw-emp-select" className="cw-rf-input" style={{ marginTop: 5 }}
                    value="" onChange={e => { if (e.target.value) toggleRecipient(e.target.value); }}>
                    <option value="">+ Add recipient</option>
                    {employees.filter(e => !toIds.includes(e.employeeId)).map(e => (
                      <option key={e.employeeId} value={e.employeeId}>{empLabel(e)}</option>
                    ))}
                  </select>
                </div>

                {/* Subject */}
                <div className="cw-rf-field">
                  <label className="cw-rf-lbl">Subject *</label>
                  <input className="cw-rf-input" placeholder="Brief subject line…"
                    value={subject} onChange={e => setSubject(e.target.value)} />
                </div>

                {/* Priority + Type row */}
                <div className="cw-rf-row">
                  <div className="cw-rf-field" style={{ marginBottom: 0 }}>
                    <label className="cw-rf-lbl">Priority</label>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 2 }}>
                      {PRIORITY_OPTIONS.map(p => (
                        <button key={p} onClick={() => setPriority(p)}
                          style={{
                            padding: "4px 9px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                            cursor: "pointer", fontFamily: "inherit", border: "1px solid",
                            color: priority === p ? priColor[p] : "#9AA0A6",
                            background: priority === p ? priBg[p] : "#F9FAFB",
                            borderColor: priority === p ? `${priColor[p]}44` : "#E4E7EC"
                          }}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="cw-rf-field" style={{ marginBottom: 0 }}>
                    <label className="cw-rf-lbl">Type</label>
                    <select className="cw-rf-input" value={type} onChange={e => setType(e.target.value)}>
                      {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* Due date + Task ref row */}
                <div className="cw-rf-row" style={{ marginTop: 14 }}>
                  <div className="cw-rf-field" style={{ marginBottom: 0 }}>
                    <label className="cw-rf-lbl">Due By</label>
                    <input className="cw-rf-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                  </div>
                  <div className="cw-rf-field" style={{ marginBottom: 0, position: "relative" }}>
                    <label className="cw-rf-lbl">Linked Task (optional)</label>
                    {selectedTaskObj ? (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "7px 10px",
                        border: "1.5px solid #BFDBFE", borderRadius: 7, background: "#EFF6FF"
                      }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1A73E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
                        <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "#1A73E8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {selectedTaskObj.taskId} · {selectedTaskObj.title}
                        </span>
                        <button onClick={() => { setSelectedTaskObj(null); setTaskRef(""); setTaskQuery(""); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#9AA0A6", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                      </div>
                    ) : (
                      <>
                        <input className="cw-rf-input" placeholder="Search task name or ID…"
                          value={taskQuery}
                          onChange={e => { setTaskQuery(e.target.value); setShowTaskDrop(true); }}
                          onFocus={() => setShowTaskDrop(true)}
                          onBlur={() => setTimeout(() => setShowTaskDrop(false), 180)}
                        />
                        {showTaskDrop && taskSuggestions.length > 0 && (
                          <div style={{
                            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                            background: "#fff", border: "1.5px solid #E4E7EC", borderRadius: 8,
                            boxShadow: "0 4px 16px rgba(0,0,0,0.10)", zIndex: 99, overflow: "hidden"
                          }}>
                            {taskSuggestions.map(t => (
                              <div key={t.taskId}
                                onMouseDown={() => { setSelectedTaskObj(t); setTaskRef(t.taskId); setTaskQuery(""); setShowTaskDrop(false); }}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                                  cursor: "pointer", borderBottom: "1px solid #F3F4F6", fontSize: 12
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = "#F5F7FA"}
                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                <span style={{
                                  fontSize: 9, fontFamily: "monospace", fontWeight: 700,
                                  color: "#1A73E8", background: "#EBF3FE", padding: "2px 5px", borderRadius: 4, flexShrink: 0
                                }}>
                                  {t.taskId}
                                </span>
                                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1A1D21", fontWeight: 500 }}>{t.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Message */}
                <div className="cw-rf-field" style={{ marginTop: 14 }}>
                  <label className="cw-rf-lbl">Message *</label>
                  <textarea className="cw-rf-input" rows={4}
                    style={{ resize: "vertical", lineHeight: 1.6 }}
                    placeholder="Describe your request in detail…"
                    value={msg} onChange={e => setMsg(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) handleSend(); }}
                  />
                  <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 2 }}>Ctrl + Enter to send</div>
                </div>

                {/* Attachments */}
                <div className="cw-rf-field">
                  <label className="cw-rf-lbl">Attachments</label>
                  {files.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 7 }}>
                      {files.map((f, i) => (
                        <span key={i} style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "3px 8px", borderRadius: 99, background: "#EFF6FF",
                          border: "1px solid #BFDBFE", fontSize: 11, color: "#1A73E8"
                        }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            {f.file.type.startsWith("image/")
                              ? <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>
                              : <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></>
                            }
                          </svg> {f.uploading ? "Uploading…" : f.file.name}
                          {!f.uploading && <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#9AA0A6", fontSize: 11, padding: 0 }}>×</button>}
                        </span>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => fileRef.current?.click()}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
                      background: "#F9FAFB", border: "1.5px dashed #D0D5DD", borderRadius: 7,
                      color: "#667085", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit"
                    }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                    Attach files
                  </button>
                  <input ref={fileRef} type="file" multiple style={{ display: "none" }}
                    accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.rar,.7z" onChange={handleFilePick} />
                </div>

                {/* Send button */}
                <button onClick={handleSend} disabled={sending}
                  style={{
                    width: "100%", padding: "10px", background: "#1A73E8", color: "#fff",
                    border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
                    cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit",
                    opacity: sending ? 0.7 : 1, display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 7, transition: "opacity 0.15s"
                  }}>
                  {sending ? (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Sending…</>
                  ) : (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg> Send Request</>
                  )}
                </button>
                <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
              </>
            )}
          </div>
        )}

        {/* ── RECEIVED TAB ── */}
        {tab === "received" && (
          <div>
            {loadingList ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
              </div>
            ) : received.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", color: "#9AA0A6" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: 0.4 }}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>No requests yet</div>
                <div style={{ fontSize: 12 }}>Requests sent to you appear here</div>
              </div>
            ) : (() => {
              const pendingReqs = received.filter(r => r.status === "pending");
              const respondedReqs = received.filter(r => r.status !== "pending");

              const renderCard = (req) => {
                const sc = STATUS_COLORS[req.status] || STATUS_COLORS.pending;
                const isExpanded = respondingId === req.id;
                return (
                  <div key={req.id} className="cw-req-card" ref={el => reqItemRefs.current[req.id] = el} style={activeChatReqId === req.id ? { background: "#EBF3FE", borderLeft: "3px solid #1A73E8", boxShadow: "0 0 0 1px #1A73E820" } : highlightReqId === req.id ? { background: "#EBF3FE", borderLeft: "3px solid #1A73E8" } : {}}>
                    <div className="cw-req-card-head">
                      <ReqAvatar name={req.fromName || "?"} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="cw-req-sender">{req.fromName || "Unknown"}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99, color: sc.color, background: sc.bg }}>{req.status}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 1 }}>{fmtTime(req.createdAt)}</div>
                      </div>
                      {req.priority && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5, color: priColor[req.priority] || "#667085", background: priBg[req.priority] || "#F9FAFB", border: `1px solid ${priColor[req.priority] || "#E4E7EC"}33` }}>
                          {req.priority}
                        </span>
                      )}
                    </div>
                    {req.subject && <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1D21", marginBottom: 4 }}>{req.subject}</div>}
                    {req.taskId && (
                      <div className="cw-req-task-chip">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
                        {req.taskId} {req.taskTitle ? `· ${req.taskTitle}` : ""}
                      </div>
                    )}
                    <div className="cw-req-msg">{req.message}</div>
                    {req.dueDate && <div style={{ fontSize: 10, color: "#D97706", marginTop: 5, fontWeight: 600 }}>⏰ Due {new Date(req.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>}
                    {req.type && <div style={{ marginTop: 5 }}><span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: "#F3F4F6", color: "#374151", fontWeight: 600, border: "1px solid #E5E7EB" }}>{req.type}</span></div>}
                    {req.attachments?.length > 0 && (
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
                        {req.attachments.map((att, i) => (
                          <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "#EFF6FF", border: "1px solid #BFDBFE", fontSize: 10, color: "#1A73E8", textDecoration: "none", fontWeight: 600 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              {att.type === "image" ? <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></> : <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></>}
                            </svg> {att.name || "File"}
                          </a>
                        ))}
                      </div>
                    )}
                    {req.responseMessage && (
                      <div style={{ marginTop: 8, padding: "6px 10px", background: "#F9FAFB", borderRadius: 6, fontSize: 11, color: "#374151", borderLeft: "3px solid #E4E7EC" }}>
                        <span style={{ fontWeight: 700, color: "#667085" }}>Response: </span>{req.responseMessage}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, justifyContent: "space-between" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {req.status === "pending" && !isExpanded && (
                          <button className="cw-req-btn cw-req-btn-resolve" onClick={() => { setRespondingId(req.id); setRespondMsg(""); }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg> Respond
                          </button>
                        )}
                      </div>
                      <button onClick={() => onOpenChat ? onOpenChat(req.id, req) : openChat(req.id)}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", border: "1px solid #E4E7EC", borderRadius: 6, background: activeChatReqId === req.id ? "#EBF3FE" : "#F9FAFB", color: activeChatReqId === req.id ? "#1A73E8" : "#667085", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                        Chat {chatThreads[req.id]?.length > 0 ? `(${chatThreads[req.id].length})` : ""}
                      </button>
                    </div>
                    {req.status === "pending" && isExpanded && (
                      <div style={{ marginTop: 8 }}>
                        <textarea placeholder="Optional response message…" value={respondMsg} onChange={e => setRespondMsg(e.target.value)}
                          style={{ width: "100%", padding: "7px 10px", border: "1.5px solid #E4E7EC", borderRadius: 7, fontSize: 12, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", minHeight: 60, background: "#F9FAFB", color: "#1A1D21" }} />
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <button className="cw-req-btn cw-req-btn-resolve" onClick={() => handleRespond(req.id, "approved")}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg> Approve
                          </button>
                          <button className="cw-req-btn cw-req-btn-reject" onClick={() => handleRespond(req.id, "rejected")}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg> Reject
                          </button>
                          <button onClick={() => { setRespondingId(null); setRespondMsg(""); }}
                            style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "1px solid #E4E7EC", background: "#F9FAFB", color: "#667085" }}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {!onOpenChat && chatOpenId === req.id && (
                      <div style={{ marginTop: 10, border: "1px solid #E4E7EC", borderRadius: 8, overflow: "hidden" }}>
                        <div style={{ padding: "6px 10px", background: "#F9FAFB", borderBottom: "1px solid #E4E7EC", fontSize: 10, fontWeight: 700, color: "#667085", textTransform: "uppercase", letterSpacing: "0.05em" }}>Chat Thread</div>
                        <div style={{ maxHeight: 200, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6, background: "#fff" }}>
                          {(chatThreads[req.id] || []).length === 0 ? (
                            <div style={{ textAlign: "center", padding: "12px 0", fontSize: 11, color: "#9AA0A6" }}>No messages yet. Start the conversation.</div>
                          ) : (chatThreads[req.id] || []).map((msg, mi) => {
                            const isMe = msg.senderId === employeeId;
                            return (
                              <div key={msg.id || mi} style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                                {!isMe && <div style={{ fontSize: 9, color: "#9AA0A6", marginBottom: 2, fontWeight: 600 }}>{msg.senderName}</div>}
                                <div style={{ maxWidth: "85%", padding: "6px 10px", borderRadius: isMe ? "10px 10px 2px 10px" : "10px 10px 10px 2px", background: isMe ? "#1A73E8" : "#F3F4F6", color: isMe ? "#fff" : "#1A1D21", fontSize: 12, lineHeight: 1.5 }}>{msg.text}</div>
                                <div style={{ fontSize: 9, color: "#9AA0A6", marginTop: 2 }}>{msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}</div>
                              </div>
                            );
                          })}
                          <div ref={el => chatEndRefs.current[req.id] = el} />
                        </div>
                        <div style={{ display: "flex", gap: 6, padding: "7px 10px", borderTop: "1px solid #E4E7EC", background: "#F9FAFB" }}>
                          <input value={chatInput[req.id] || ""} onChange={e => setChatInput(prev => ({ ...prev, [req.id]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMsg(req.id); } }} placeholder="Type a message…"
                            style={{ flex: 1, padding: "6px 10px", border: "1.5px solid #E4E7EC", borderRadius: 6, fontSize: 12, fontFamily: "inherit", outline: "none", background: "#fff", color: "#1A1D21" }} />
                          <button onClick={() => sendChatMsg(req.id)} style={{ padding: "6px 12px", background: "#1A73E8", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <>
                  {/* ── PENDING section ── */}
                  <div style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <button
                      onClick={() => setPendingOpen(p => !p)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: pendingOpen ? "#EFF6FF" : "#F8FAFC", border: "none", cursor: "pointer", fontFamily: "inherit", borderBottom: pendingOpen ? "1px solid #BFDBFE" : "none" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1D21", flex: 1, textAlign: "left" }}>
                        Pending Requests
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: pendingReqs.length > 0 ? "#DC2626" : "#9AA0A6", background: pendingReqs.length > 0 ? "#FEF2F2" : "#F1F5F9", border: `1px solid ${pendingReqs.length > 0 ? "#FECACA" : "#E2E8F0"}`, borderRadius: 99, padding: "1px 8px", marginRight: 4 }}>
                        {pendingReqs.length}
                      </span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: pendingOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {pendingOpen && (
                      <div>
                        {pendingReqs.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "20px", color: "#9AA0A6", fontSize: 12 }}>No pending requests</div>
                        ) : pendingReqs.map(req => renderCard(req))}
                      </div>
                    )}
                  </div>

                  {/* ── RESPONDED section ── */}
                  <div>
                    <button
                      onClick={() => setRespondedOpen(p => !p)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: respondedOpen ? "#F0FDF4" : "#F8FAFC", border: "none", cursor: "pointer", fontFamily: "inherit", borderBottom: respondedOpen ? "1px solid #BBF7D0" : "none" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1D21", flex: 1, textAlign: "left" }}>
                        Responded
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 99, padding: "1px 8px", marginRight: 4 }}>
                        {respondedReqs.length}
                      </span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: respondedOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {respondedOpen && (
                      <div>
                        {respondedReqs.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "20px", color: "#9AA0A6", fontSize: 12 }}>No responded requests</div>
                        ) : respondedReqs.map(req => renderCard(req))}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ── SENT TAB ── */}
        {tab === "sent" && (
          <div>
            {loadingList ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
              </div>
            ) : sent2.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", color: "#9AA0A6" }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Nothing sent yet</div>
                <div style={{ fontSize: 12 }}>Requests you send appear here</div>
              </div>
            ) : sent2.map(req => {
              const sc = STATUS_COLORS[req.status] || STATUS_COLORS.pending;
              return (
                <div key={req.id} className="cw-req-card" ref={el => reqItemRefs.current[req.id] = el} style={activeChatReqId === req.id ? { background: "#EBF3FE", borderLeft: "3px solid #1A73E8", boxShadow: "0 0 0 1px #1A73E820" } : highlightReqId === req.id ? { background: "#EBF3FE", borderLeft: "3px solid #1A73E8" } : {}}>
                  <div className="cw-req-card-head">
                    <ReqAvatar name={req.toName || "?"} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="cw-req-sender">To: {req.toName || req.toId}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                          color: sc.color, background: sc.bg
                        }}>{req.status}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 1 }}>{fmtTime(req.createdAt)}</div>
                    </div>
                    {req.priority && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
                        color: priColor[req.priority] || "#667085", background: priBg[req.priority] || "#F9FAFB"
                      }}>
                        {req.priority}
                      </span>
                    )}
                  </div>
                  {req.subject && <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1D21", marginBottom: 4 }}>{req.subject}</div>}
                  {req.taskId && <div className="cw-req-task-chip">{req.taskId}{req.taskTitle ? ` · ${req.taskTitle}` : ""}</div>}
                  <div className="cw-req-msg">{req.message}</div>
                  {req.dueDate && <div style={{ fontSize: 10, color: "#D97706", marginTop: 5, fontWeight: 600 }}>⏰ Due {new Date(req.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>}
                  {req.responseMessage && (
                    <div style={{
                      marginTop: 8, padding: "6px 10px", background: "#F0FDF4", borderRadius: 6,
                      fontSize: 11, color: "#374151", borderLeft: `3px solid ${sc.color}`
                    }}>
                      <span style={{ fontWeight: 700, color: sc.color }}>Response: </span>{req.responseMessage}
                    </div>
                  )}
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => onOpenChat ? onOpenChat(req.id, req) : openChat(req.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 4, padding: "3px 9px",
                        border: "1px solid #E4E7EC", borderRadius: 6,
                        background: activeChatReqId === req.id ? "#EBF3FE" : "#F9FAFB",
                        color: activeChatReqId === req.id ? "#1A73E8" : "#667085",
                        fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit"
                      }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                      Chat {chatThreads[req.id]?.length > 0 ? `(${chatThreads[req.id].length})` : ""}
                    </button>
                  </div>
                  {!onOpenChat && chatOpenId === req.id && (
                    <div style={{ marginTop: 10, border: "1px solid #E4E7EC", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{
                        padding: "6px 10px", background: "#F9FAFB", borderBottom: "1px solid #E4E7EC",
                        fontSize: 10, fontWeight: 700, color: "#667085", textTransform: "uppercase", letterSpacing: "0.05em"
                      }}>
                        Chat Thread
                      </div>
                      <div style={{ maxHeight: 200, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {(chatThreads[req.id] || []).length === 0 ? (
                          <div style={{ textAlign: "center", padding: "12px 0", fontSize: 11, color: "#9AA0A6" }}>No messages yet.</div>
                        ) : (chatThreads[req.id] || []).map((msg, mi) => {
                          const isMe = msg.senderId === employeeId;
                          return (
                            <div key={msg.id || mi} style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                              {!isMe && <div style={{ fontSize: 9, color: "#9AA0A6", marginBottom: 2, fontWeight: 600 }}>{msg.senderName}</div>}
                              <div style={{
                                maxWidth: "85%", padding: "6px 10px", borderRadius: isMe ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                                background: isMe ? "#1A73E8" : "#F3F4F6", color: isMe ? "#fff" : "#1A1D21", fontSize: 12, lineHeight: 1.5
                              }}>
                                {msg.text}
                              </div>
                              <div style={{ fontSize: 9, color: "#9AA0A6", marginTop: 2 }}>
                                {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}
                              </div>
                            </div>
                          );
                        })}
                        <div ref={el => chatEndRefs.current[req.id] = el} />
                      </div>
                      <div style={{ display: "flex", gap: 6, padding: "7px 10px", borderTop: "1px solid #E4E7EC", background: "#F9FAFB" }}>
                        <input
                          value={chatInput[req.id] || ""}
                          onChange={e => setChatInput(prev => ({ ...prev, [req.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMsg(req.id); } }}
                          placeholder="Type a message…"
                          style={{
                            flex: 1, padding: "6px 10px", border: "1.5px solid #E4E7EC", borderRadius: 6,
                            fontSize: 12, fontFamily: "inherit", outline: "none", background: "#fff", color: "#1A1D21"
                          }}
                        />
                        <button onClick={() => sendChatMsg(req.id)}
                          style={{
                            padding: "6px 12px", background: "#1A73E8", color: "#fff", border: "none",
                            borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center"
                          }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Icon set ── */
function NavIcon({ name, size = 20 }) {
  const s = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" };
  const icons = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>,
    tasks: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>,
    messages: <><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></>,
    groups: <><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" /><path d="M16 3.13a4 4 0 010 7.75" /><path d="M21 21v-2a4 4 0 00-3-3.85" /></>,
    meetings: <><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></>,
    employees: <><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
    bell: <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></>,
    search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  };
  return <svg {...s}>{icons[name]}</svg>;
}

export default function CoworkingShell({ role, employeeName, employeeId, title, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { notifications, unread, unreadDm, markRead, markSectionRead } = useCoworkNotifications(employeeId || "");

  // ── Push notifications — FCM token registration + foreground/background push ──
  // useFCMToken:         registers this device with FCM so backend can push when app is closed
  // usePushNotifications: listens to cowork_notifications and fires native OS alerts
  useFCMToken(employeeId || null);
  usePushNotifications(employeeId || null);

  // ── Per-section unread badge counts ──────────────────────────────────────
  // ALL 4 sections (Tasks, Messages, Groups, Meetings) use independent strategies:
  //   Tasks    → per-task onSnapshot on chat subcollection, readBy-based (live decrement)
  //   Messages → per-conversation onSnapshot on messages subcollection, readBy-based
  //   Groups   → per-group onSnapshot on messages subcollection, readBy-based
  //   Meetings → notification-based (meet_scheduled / cancelled / updated events)
  // Each decrements as messages are actually read: 3 → 2 → 1 → 0

  const MEET_NOTIF_TYPES = new Set(["meet_scheduled", "meet_cancelled", "meet_updated"]);
  const meetingUnreadCount = notifications.filter(n => !n.read && MEET_NOTIF_TYPES.has(n.type)).length;

  // ── Tasks: per-task chat onSnapshot ──────────────────────────────────────
  const [taskChatUnreadCount, setTaskChatUnreadCount] = useState(0);
  useEffect(() => {
    if (!employeeId || !role) return;
    const taskUnsubs = [];
    const taskCountMap = {};
    const recalc = () => setTaskChatUnreadCount(Object.values(taskCountMap).reduce((s, n) => s + n, 0));

    const run = async () => {
      let taskIds = new Set();
      try {
        if (role === "ceo") {
          const snap = await getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assignedBy", "==", employeeId)));
          snap.forEach(d => { if (!d.data().createdByTl) taskIds.add(d.id); });
        } else if (role === "tl") {
          const [s1, s2] = await Promise.all([
            getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assignedBy", "==", employeeId))),
            getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assigneeIds", "array-contains", employeeId))),
          ]);
          s1.forEach(d => taskIds.add(d.id));
          s2.forEach(d => taskIds.add(d.id));
        } else {
          const snap = await getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assigneeIds", "array-contains", employeeId)));
          snap.forEach(d => taskIds.add(d.id));
        }
      } catch (e) { console.error("task badge:", e); return; }

      taskIds.forEach(taskId => {
        const unsub = onSnapshot(
          query(collection(firebaseDb, "cowork_tasks", taskId, "chat"), orderBy("createdAt", "asc")),
          snap => {
            taskCountMap[taskId] = snap.docs.filter(d => {
              const data = d.data();
              return data.senderId !== employeeId && !(data.readBy || []).includes(employeeId);
            }).length;
            recalc();
          },
          () => { taskCountMap[taskId] = 0; recalc(); }
        );
        taskUnsubs.push(unsub);
      });
    };
    run();
    return () => taskUnsubs.forEach(u => u());
  }, [employeeId, role]);

  // ── Messages: per-conversation message onSnapshot ─────────────────────────
  // Listens to each conversation's messages directly so readBy changes
  // fire immediately and the badge decrements in real time.
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  useEffect(() => {
    if (!employeeId) return;
    const convUnsubs = [];
    const convCountMap = {};
    const recalcDm = () => setDmUnreadCount(Object.values(convCountMap).reduce((s, n) => s + n, 0));
    let convListenerUnsub = null;

    // Watch the conversation list, then watch each conversation's messages
    convListenerUnsub = onSnapshot(
      query(collection(firebaseDb, "cowork_direct_messages"), where("participantIds", "array-contains", employeeId)),
      convSnap => {
        // For each conversation, set up a per-message listener if not already
        convSnap.docs.forEach(convDoc => {
          const cid = convDoc.id;
          if (convCountMap[cid] !== undefined) return; // already watching
          convCountMap[cid] = 0;
          const unsub = onSnapshot(
            query(collection(firebaseDb, "cowork_direct_messages", cid, "messages"), where("senderId", "!=", employeeId)),
            msgSnap => {
              convCountMap[cid] = msgSnap.docs.filter(d => !(d.data().readBy || []).includes(employeeId)).length;
              recalcDm();
            },
            () => { convCountMap[cid] = 0; recalcDm(); }
          );
          convUnsubs.push(unsub);
        });
      },
      () => { }
    );
    return () => { convListenerUnsub?.(); convUnsubs.forEach(u => u()); };
  }, [employeeId]);

  // ── Groups: per-group message onSnapshot ──────────────────────────────────
  const [groupUnreadCount, setGroupUnreadCount] = useState(0);
  useEffect(() => {
    if (!employeeId) return;
    const grpUnsubs = [];
    const grpCountMap = {};
    const recalcGrp = () => setGroupUnreadCount(Object.values(grpCountMap).reduce((s, n) => s + n, 0));
    let grpListenerUnsub = null;

    grpListenerUnsub = onSnapshot(
      query(collection(firebaseDb, "cowork_groups"), where("memberIds", "array-contains", employeeId), where("deleted", "==", false)),
      grpSnap => {
        grpSnap.docs.forEach(grpDoc => {
          const gid = grpDoc.id;
          if (grpCountMap[gid] !== undefined) return;
          grpCountMap[gid] = 0;
          const unsub = onSnapshot(
            query(collection(firebaseDb, "cowork_groups", gid, "messages"), where("senderId", "!=", employeeId)),
            msgSnap => {
              grpCountMap[gid] = msgSnap.docs.filter(d => !(d.data().readBy || []).includes(employeeId)).length;
              recalcGrp();
            },
            () => { grpCountMap[gid] = 0; recalcGrp(); }
          );
          grpUnsubs.push(unsub);
        });
      },
      () => { }
    );
    return () => { grpListenerUnsub?.(); grpUnsubs.forEach(u => u()); };
  }, [employeeId]);

  // ── Notes reminder badge — count notes whose reminder fires within 30 min ─
  // Re-evaluates every 60 seconds so the badge appears/disappears automatically.
  const [notesAlertCount, setNotesAlertCount] = useState(0);
  useEffect(() => {
    if (!employeeId) return;
    const notesQ = query(
      collection(firebaseDb, "cowork_notes"),
      where("ownerId", "==", employeeId)
    );
    const checkReminders = (snap) => {
      const now = Date.now();
      const count = snap.docs.filter(d => {
        const r = d.data().reminder;
        if (!r) return false;
        const ms = new Date(r).getTime();
        // Within next 30 minutes AND not yet overdue
        return ms > now && ms <= now + 30 * 60 * 1000;
      }).length;
      setNotesAlertCount(count);
    };
    // Real-time listener for note changes
    const unsub = onSnapshot(notesQ, checkReminders, () => { });
    // Also re-check every 60 seconds — reminders can enter the 30-min window over time
    const tick = setInterval(() => {
      getDocs(notesQ).then(checkReminders).catch(() => { });
    }, 60 * 1000);
    return () => { unsub(); clearInterval(tick); };
  }, [employeeId]);

  // ── Received requests badge — count requests sent TO this user ───────────
  // Uses localStorage to track which request IDs have been "seen" (panel opened).
  // Decrements as user opens requests, same as the internal RequestSidebarPanel logic.
  const [reqUnreadCount, setReqUnreadCount] = useState(0);
  useEffect(() => {
    if (!employeeId) return;
    const q = query(
      collection(firebaseDb, "cowork_requests"),
      where("toId", "==", employeeId)
    );
    const unsub = onSnapshot(q, snap => {
      try {
        const seen = new Set(JSON.parse(localStorage.getItem("req_seen_ids") || "[]"));
        const unseen = snap.docs.filter(d => !seen.has(d.id)).length;
        setReqUnreadCount(unseen);
      } catch {
        setReqUnreadCount(0);
      }
    }, () => { });
    return () => unsub();
  }, [employeeId]);

  // Clear request badge when panel is opened
  const handleOpenReqPanel = () => {
    setReqPanelOpen(true);
    // Mark all current received requests as seen in localStorage
    try {
      const q2 = query(collection(firebaseDb, "cowork_requests"), where("toId", "==", employeeId));
      getDocs(q2).then(snap => {
        const allIds = snap.docs.map(d => d.id);
        const existing = JSON.parse(localStorage.getItem("req_seen_ids") || "[]");
        const merged = [...new Set([...existing, ...allIds])];
        localStorage.setItem("req_seen_ids", JSON.stringify(merged));
        setReqUnreadCount(0);
      }).catch(() => { });
    } catch { }
  };

  const [notifOpen, setNotifOpen] = useState(false);
  const [reqPanelOpen, setReqPanelOpen] = useState(false);
  const [activeChatReqId, setActiveChatReqId] = useState(null);
  // ── PiP Meeting state — subscribed to module-level store (persists across navigation)
  const [pipMeeting, setPipMeetingState] = useState(() => {
    const s = getPipMeeting();
    return s.isActive ? s : null;
  });
  const [pipCollapsed, setPipCollapsed] = useState(false);
  const [pipPos, setPipPos] = useState({ x: null, y: null });
  const pipDragRef = useRef(null);
  const pipDragStateRef = useRef(null);
  const [pipMicOn, setPipMicOn] = useState(true);
  const [pipCamOn, setPipCamOn] = useState(false); // cam default off in pip
  const [activeChatReq, setActiveChatReq] = useState(null); // full request object for header
  const [chatThreads, setChatThreads] = useState({});
  const [chatInput, setChatInput] = useState({});
  const [chatUploading, setChatUploading] = useState({});
  const chatEndRefs = useRef({});

  // ── PiP: subscribe to module-level store (persists across page navigations)
  useEffect(() => {
    const unsub = subscribePip((state) => {
      if (state.isActive) {
        setPipMeetingState(state);
        setPipCollapsed(false);
        setPipPos(pos => pos.x === null ? { x: window.innerWidth - 320, y: window.innerHeight - 220 } : pos);
      } else {
        setPipMeetingState(null);
        setPipCollapsed(false);
        setPipPos({ x: null, y: null });
      }
    });
    return unsub;
  }, []);

  const handlePipDragStart = (e) => {
    const el = pipDragRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    pipDragStateRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    const onMove = (e2) => {
      if (!pipDragStateRef.current) return;
      const dx = e2.clientX - pipDragStateRef.current.startX;
      const dy = e2.clientY - pipDragStateRef.current.startY;
      const newX = Math.max(0, Math.min(window.innerWidth - 300, pipDragStateRef.current.origX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 180, pipDragStateRef.current.origY + dy));
      setPipPos({ x: newX, y: newY });
    };
    const onUp = () => {
      pipDragStateRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const openChatForReq = (reqId, req) => {
    setActiveChatReqId(prev => prev === reqId ? null : reqId);
    setActiveChatReq(prev => prev?.id === reqId ? null : (req || null));
    if (!chatThreads[reqId]) {
      const q = query(collection(firebaseDb, "cowork_requests", reqId, "chat"), orderBy("createdAt", "asc"));
      onSnapshot(q, snap => {
        const msgs = snap.docs.map(d => ({
          id: d.id, ...d.data(),
          createdAt: d.data().createdAt?.seconds
            ? new Date(d.data().createdAt.seconds * 1000).toISOString()
            : d.data().createdAt,
        }));
        setChatThreads(prev => ({ ...prev, [reqId]: msgs }));
        setTimeout(() => chatEndRefs.current[reqId]?.scrollIntoView({ behavior: "smooth" }), 60);
      }, () => { });
    }
  };

  const sendChatMsg = async (reqId, attachments = []) => {
    const text = (chatInput[reqId] || "").trim();
    if (!text && attachments.length === 0) return;
    setChatInput(prev => ({ ...prev, [reqId]: "" }));
    const msgId = crypto.randomUUID();
    await setDoc(doc(collection(firebaseDb, "cowork_requests", reqId, "chat"), msgId), {
      messageId: msgId, reqId,
      senderId: employeeId, senderName: employeeName,
      text, attachments, createdAt: serverTimestamp(),
    });
    await updateDoc(doc(firebaseDb, "cowork_requests", reqId), { updatedAt: serverTimestamp() });
  };

  const deleteReqChatMsg = async (reqId, msgId) => {
    try {
      const { deleteDoc, doc: fsDoc } = await import("firebase/firestore");
      await deleteDoc(fsDoc(firebaseDb, "cowork_requests", reqId, "chat", msgId));
    } catch (e) { console.error("delete msg:", e); }
  };

  const handleChatFilePick = async (reqId, files) => {
    if (!files?.length) return;
    setChatUploading(prev => ({ ...prev, [reqId]: true }));
    try {
      const uploaded = await Promise.all(Array.from(files).map(async f => {
        if (f.type.startsWith("image/")) {
          const r = await uploadImageCld(f);
          return { url: r.url, name: f.name, type: "image", size: f.size };
        } else {
          const r = await uploadPdfBackend(f);
          return { url: r.url, name: f.name, type: "file", size: f.size };
        }
      }));
      await sendChatMsg(reqId, uploaded);
    } catch (e) { console.error("chat upload:", e); }
    finally { setChatUploading(prev => ({ ...prev, [reqId]: false })); }
  };
  const [reqPanelInitialTab, setReqPanelInitialTab] = useState("received");
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  const [reqPanelContext, setReqPanelContext] = useState(null); // { taskId, taskTitle }
  const [reqPanelThreadContext, setReqPanelThreadContext] = useState(null); // { type, threadId, recipientId, recipientName }
  const [reqPanelOpenRespondId, setReqPanelOpenRespondId] = useState(null);
  const [highlightReqId, setHighlightReqId] = useState(null);

  // Allow any page to open the request panel via custom event
  useEffect(() => {
    const handler = (e) => {
      setReqPanelOpen(true);
      if (e.detail?.tab) setReqPanelInitialTab(e.detail.tab);
      if (e.detail?.taskId) setReqPanelContext({ taskId: e.detail.taskId, taskTitle: e.detail.taskTitle || e.detail.taskId });
      else setReqPanelContext(null);
      if (e.detail?.requestId) setHighlightReqId(e.detail.requestId);
      else setHighlightReqId(null);
      if (e.detail?.threadContext) setReqPanelThreadContext(e.detail.threadContext);
      else setReqPanelThreadContext(null);
      // openChat: open panel AND immediately open chat for that request
      // openRespond: open panel and auto-expand respond form
      if (e.detail?.openRespond && e.detail?.requestId) {
        setReqPanelOpenRespondId(e.detail.requestId);
        setHighlightReqId(e.detail.requestId);
      }
      if (e.detail?.openChat && e.detail?.requestId) {
        // Use the proper openChatForReq logic inline
        const reqId = e.detail.requestId;
        setActiveChatReqId(reqId);
        const q2 = query(collection(firebaseDb, "cowork_requests", reqId, "chat"), orderBy("createdAt", "asc"));
        onSnapshot(q2, snap => {
          const msgs = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.seconds ? new Date(d.data().createdAt.seconds * 1000).toISOString() : d.data().createdAt }));
          setChatThreads(prev => ({ ...prev, [reqId]: msgs }));
        }, () => { });
      }
    };
    window.addEventListener("openRequestPanel", handler);
    return () => window.removeEventListener("openRequestPanel", handler);
  }, []);

  useEffect(() => {
    if (!notifOpen) return;
    const close = (e) => {
      if (!e.target.closest('.cw-notif-popup') && !e.target.closest('.cw-topbar-icon-btn')) setNotifOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [notifOpen]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // ── PWA Install prompt ────────────────────────────────────
  const [canInstall, setCanInstall] = React.useState(false);
  const [isInstalled, setIsInstalled] = React.useState(false);
  const [showIosGuide, setShowIosGuide] = React.useState(false);
  const deferredPromptRef = React.useRef(null);

  React.useEffect(() => {
    // Already running as installed PWA — hide button
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }
    // Check if prompt was captured before React mounted (from layout.js script)
    if (window.__pwaInstallPrompt) {
      deferredPromptRef.current = window.__pwaInstallPrompt;
      setCanInstall(true);
    }

    const handler = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      window.__pwaInstallPrompt = e;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setCanInstall(false);
      deferredPromptRef.current = null;
    });
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      setCanInstall(false);
    }
    deferredPromptRef.current = null;
  };
  useEffect(() => {
    const handler = (e) => {
      setNotesPanelOpen(true);
    };
    window.addEventListener("openNotesPanel", handler);
    return () => window.removeEventListener("openNotesPanel", handler);
  }, []);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setMobileOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const isCEO = role === "ceo";
  const isTL = role === "tl";

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard", path: "/coworking" },
    { id: "tasks", label: "Tasks", icon: "tasks", path: "/coworking/tasks" },
    { id: "messages", label: "Messages", icon: "messages", path: "/coworking/direct-messages" },
    { id: "groups", label: "Groups", icon: "groups", path: "/coworking/create-group" },
    { id: "meetings", label: "Meetings", icon: "meetings", path: "/coworking/schedule-meet" },
    ...(isCEO ? [{ id: "employees", label: "Employees", icon: "employees", path: "/coworking/create-employee" }] : []),
    { id: "calendar", label: "Calendar", icon: "calendar", path: "/coworking/calendar" },
    { id: "settings", label: "Settings", icon: "settings", path: "/coworking/settings" },
  ];

  const isActive = (path) => {
    if (path === "/coworking") return pathname === "/coworking";
    return pathname.startsWith(path);
  };

  // Map nav path → notification types to clear when user visits that section
  const SECTION_NOTIF_TYPES = {
    "/coworking/tasks": [
      "task_assigned", "task_update", "task_confirmed", "task_started",
      "task_chat", "task_forwarded", "daily_report", "deadline_changed",
      "completion_submitted", "completion_tl_approved", "completion_rejected",
      "completion_ceo_approved", "completion_ceo_rejected",
    ],
    "/coworking/direct-messages": ["direct_message"],
    "/coworking/create-group": ["group_message", "group_added"],
    "/coworking/schedule-meet": ["meet_scheduled", "meet_cancelled", "meet_updated"],
  };

  const handleNav = (path) => {
    router.push(path);
    if (isMobile) setMobileOpen(false);
    // Clear notification-based badges for the section being navigated to
    const types = SECTION_NOTIF_TYPES[path];
    if (types) markSectionRead(types);
    // Tasks badge decrements naturally via readBy updates when user reads each chat.
  };

  const handleSignOut = async () => {
    try {
      await signOut(firebaseAuth);
      router.push("/");
    } catch (e) {
      console.error("Sign out error:", e);
    }
  };

  const initials = (name = "") => name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  const roleLabel = isCEO ? "Admin" : isTL ? "Team Lead" : "Employee";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');

        .cw-shell {
          display: flex;
          height: 100vh;
          overflow: hidden;
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #F0F2F5;
        }

        /* ── Sidebar ── */
        .cw-sidebar {
          width: 240px;
          min-width: 240px;
          height: 100vh;
          background: #FFFFFF;
          border-right: 1px solid #E4E7EC;
          display: flex;
          flex-direction: column;
          z-index: 100;
          transition: width 0.2s ease, min-width 0.2s ease;
        }

        .cw-sidebar-brand {
          padding: 20px 20px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .cw-sidebar-logo {
          width: 32px; height: 32px;
          background: #1A73E8;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .cw-sidebar-logo svg { color: #fff; }
        .cw-sidebar-brand-text {
          font-size: 15px;
          font-weight: 700;
          color: #1A1D21;
          letter-spacing: -0.03em;
        }
        .cw-sidebar-brand-sub {
          font-size: 10px;
          color: #98A2B3;
          font-weight: 500;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .cw-sidebar-nav {
          flex: 1;
          padding: 4px 12px;
          overflow-y: auto;
        }
        .cw-sidebar-nav::-webkit-scrollbar { width: 0; }

        .cw-sidebar-section {
          font-size: 10px;
          font-weight: 600;
          color: #98A2B3;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 16px 8px 6px;
        }

        .cw-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border-radius: 8px;
          cursor: pointer;
          color: #667085;
          font-size: 13.5px;
          font-weight: 500;
          transition: all 0.12s ease;
          margin-bottom: 2px;
          position: relative;
          border: 1px solid transparent;
          text-decoration: none;
        }
        .cw-nav-item:hover {
          background: #F5F7FA;
          color: #344054;
        }
        .cw-nav-item.active {
          background: #EBF3FE;
          color: #1A73E8;
          font-weight: 600;
          border-color: #D3E4FD;
        }
        .cw-nav-item.active svg { stroke-width: 2.2; }

        .cw-nav-badge {
          margin-left: auto;
          min-width: 18px;
          height: 18px;
          border-radius: 9px;
          background: #EF4444;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 5px;
        }

        .cw-sidebar-footer {
          padding: 12px;
          border-top: 1px solid #F2F4F7;
        }
        .cw-user-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          background: #F9FAFB;
          border: 1px solid #F2F4F7;
          margin-bottom: 8px;
        }
        .cw-user-avatar {
          width: 34px; height: 34px;
          border-radius: 50%;
          background: #1A73E8;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }
        .cw-user-name {
          font-size: 13px;
          font-weight: 600;
          color: #1A1D21;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .cw-user-role {
          font-size: 11px;
          color: #98A2B3;
          font-weight: 500;
        }
        .cw-signout-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 12px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: #667085;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.12s;
        }
        .cw-signout-btn:hover {
          background: #FEF3F2;
          color: #D93025;
        }

        /* ── Main Area ── */
        .cw-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
        }
        .cw-topbar {
          height: 56px;
          min-height: 56px;
          background: #FFFFFF;
          border-bottom: 1px solid #E4E7EC;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          gap: 16px;
          flex-shrink: 0;
        }
        .cw-topbar-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .cw-topbar-hamburger {
          display: none;
          width: 36px; height: 36px;
          border-radius: 8px;
          border: 1px solid #E4E7EC;
          background: #fff;
          cursor: pointer;
          align-items: center;
          justify-content: center;
          color: #667085;
        }
        .cw-topbar-title {
          font-size: 17px;
          font-weight: 700;
          color: #1A1D21;
          letter-spacing: -0.02em;
        }
        .cw-topbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cw-topbar-icon-btn {
          width: 36px; height: 36px;
          border-radius: 50%;
          border: 1px solid #E4E7EC;
          background: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #667085;
          position: relative;
          transition: all 0.12s;
        }
        .cw-topbar-icon-btn:hover {
          background: #F5F7FA;
          border-color: #D0D5DD;
        }
        .cw-topbar-notif-dot {
          position: absolute;
          top: 6px; right: 6px;
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #EF4444;
          border: 2px solid #fff;
        }

        /* Notification Popup */
        .cw-notif-popup {
          position: absolute;
          top: 44px;
          right: 0;
          width: 360px;
          max-height: 420px;
          background: #fff;
          border: 1px solid #E4E7EC;
          border-radius: 12px;
          box-shadow: 0 12px 36px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
          z-index: 500;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: cw-popup-in 0.15s ease;
        }
        .req-chat-msg-wrap:hover .req-msg-del-btn { display: flex !important; }
        @keyframes cw-popup-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .cw-notif-popup-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid #F2F4F7;
        }
        .cw-notif-popup-title {
          font-size: 14px;
          font-weight: 700;
          color: #1A1D21;
        }
        .cw-notif-popup-mark {
          font-size: 12px;
          color: #1A73E8;
          background: none;
          border: none;
          cursor: pointer;
          font-family: inherit;
          font-weight: 500;
        }
        .cw-notif-popup-mark:hover { text-decoration: underline; }
        .cw-notif-popup-list {
          flex: 1;
          overflow-y: auto;
          padding: 4px 8px;
        }
        .cw-notif-popup-list::-webkit-scrollbar { width: 3px; }
        .cw-notif-popup-list::-webkit-scrollbar-thumb { background: #E4E7EC; border-radius: 2px; }
        .cw-notif-popup-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 8px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.1s;
        }
        .cw-notif-popup-item:hover { background: #F5F7FA; }
        .cw-notif-popup-item-title {
          font-size: 13px;
          font-weight: 500;
          color: #344054;
          line-height: 1.4;
        }
        .cw-notif-popup-item-body {
          font-size: 11px;
          color: #98A2B3;
          margin-top: 2px;
          line-height: 1.3;
        }
        .cw-notif-popup-item-time {
          font-size: 10px;
          color: #98A2B3;
          font-family: 'IBM Plex Mono', monospace;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .cw-notif-popup-item-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: #1A73E8;
          flex-shrink: 0;
          margin-top: 6px;
        }
        .cw-notif-popup-item-dot.read { background: #D0D5DD; }
        .cw-notif-popup-empty {
          text-align: center;
          padding: 32px 16px;
          color: #98A2B3;
          font-size: 13px;
        }
        .cw-notif-popup-footer {
          padding: 10px 16px;
          border-top: 1px solid #F2F4F7;
          text-align: center;
        }
        .cw-notif-popup-footer a {
          font-size: 12px;
          color: #1A73E8;
          font-weight: 500;
          text-decoration: none;
          cursor: pointer;
        }
        .cw-notif-popup-footer a:hover { text-decoration: underline; }

        @media (max-width: 768px) {
          .cw-notif-popup {
            /* On mobile: fixed overlay anchored to top of screen, full-width with margin */
            position: fixed;
            top: 60px;
            left: 12px;
            right: 12px;
            width: auto;
            max-height: 70vh;
            border-radius: 16px;
            box-shadow: 0 16px 48px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.1);
          }
        }
        @media (max-width: 400px) {
          .cw-notif-popup {
            top: 54px;
            left: 8px;
            right: 8px;
            max-height: 75vh;
          }
          .cw-notif-popup-item-title { font-size: 13px; }
          .cw-notif-popup-head { padding: 12px 14px; }
        }
        .cw-topbar-avatar {
          width: 34px; height: 34px;
          border-radius: 50%;
          background: #1A73E8;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .cw-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0;
        }

        /* ── Mobile Overlay ── */
        .cw-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.3);
          z-index: 99;
        }
        .cw-overlay.show { display: block; }

        /* ── Universal Request Sidebar ── */
        .cw-req-panel {
          position: fixed;
          top: 0; right: 0; bottom: 0;
          width: 480px;
          max-width: 100vw;
          background: #fff;
          border-left: 1px solid #E4E7EC;
          box-shadow: -8px 0 32px rgba(0,0,0,0.12);
          z-index: 500;
          display: flex;
          flex-direction: row;
          transform: translateX(100%);
          transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
        }
        .cw-req-panel.chat-open { width: 820px; }
        .cw-notes-panel {
          position: fixed;
          top: 0; right: 0; bottom: 0;
          width: 480px;
          max-width: 100vw;
          background: #fff;
          border-left: 1px solid #E4E7EC;
          box-shadow: -8px 0 32px rgba(0,0,0,0.12);
          z-index: 500;
          display: flex;
          flex-direction: column;
          transform: translateX(100%);
          transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
        }
        .cw-notes-panel.open { transform: translateX(0); }
        .cw-req-panel-left { width: 480px; min-width: 480px; display: flex; flex-direction: column; border-right: 1px solid #E4E7EC; }
        .cw-req-panel-chat { flex: 1; display: flex; flex-direction: column; background: #F8FAFC; }
        .cw-req-panel.open { transform: translateX(0); }
        .cw-req-panel-overlay {
          display: none;
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.25);
          z-index: 499;
        }
        .cw-req-panel-overlay.show { display: block; }
        .cw-req-panel-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 18px; border-bottom: 1px solid #E4E7EC; flex-shrink: 0;
        }
        .cw-req-panel-title { font-size: 14px; font-weight: 700; color: #1A1D21; }
        .cw-req-panel-close {
          width: 28px; height: 28px; border-radius: 6px; border: 1px solid #E4E7EC;
          background: #fff; cursor: pointer; display: flex; align-items: center;
          justify-content: center; color: #667085; font-size: 16px;
        }
        .cw-req-panel-close:hover { background: #F5F7FA; }
        .cw-req-tab-bar {
          display: flex; border-bottom: 1px solid #E4E7EC; flex-shrink: 0; padding: 0 8px; gap: 2px;
        }
        .cw-req-tab {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
          padding: 9px 8px 8px; font-size: 11px; font-weight: 500; color: #667085;
          border: none; background: none; cursor: pointer; font-family: inherit;
          border-bottom: 2px solid transparent; transition: all 0.1s; position: relative;
        }
        .cw-req-tab:hover { color: #1A1D21; background: #F9FAFB; border-radius: 4px 4px 0 0; }
        .cw-req-tab.active { color: #1A73E8; border-bottom-color: #1A73E8; font-weight: 600; }
        .cw-req-body { flex: 1; overflow-y: auto; }
        .cw-req-body::-webkit-scrollbar { width: 3px; }
        .cw-req-body::-webkit-scrollbar-thumb { background: #E4E7EC; border-radius: 2px; }

        /* Form inside request panel */
        .cw-rf-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
        .cw-rf-lbl { font-size: 10px; font-weight: 700; color: #344054; text-transform: uppercase; letter-spacing: 0.05em; }
        .cw-rf-input {
          padding: 8px 11px; border: 1.5px solid #E4E7EC; border-radius: 7px;
          font-size: 12.5px; font-family: inherit; color: #1A1D21; background: #F9FAFB;
          outline: none; width: 100%; box-sizing: border-box;
        }
        .cw-rf-input:focus { border-color: #1A73E8; background: #fff; box-shadow: 0 0 0 3px rgba(26,115,232,0.1); }
        .cw-rf-input::placeholder { color: #9AA0A6; }
        .cw-rf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

        /* Received request card */
        .cw-req-card {
          padding: 12px 16px; border-bottom: 1px solid #F2F4F7; cursor: pointer;
          transition: background 0.08s;
        }
        .cw-req-card:hover { background: #F9FAFB; }
        .cw-req-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
        .cw-req-avatar {
          width: 28px; height: 28px; border-radius: 8px; background: #1A73E8;
          color: #fff; font-size: 10px; font-weight: 700;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .cw-req-sender { font-size: 12px; font-weight: 700; color: #1A1D21; flex: 1; }
        .cw-req-time { font-size: 10px; color: #9AA0A6; }
        .cw-req-task-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 7px; border-radius: 4px;
          background: #EBF3FE; color: #1A73E8; font-size: 10px; font-weight: 600;
          margin-bottom: 5px;
        }
        .cw-req-msg { font-size: 12px; color: #374151; line-height: 1.55; white-space: pre-wrap; }
        .cw-req-actions { display: flex; gap: 6px; margin-top: 8px; }
        .cw-req-btn {
          padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600;
          cursor: pointer; font-family: inherit; border: 1px solid; transition: all 0.1s;
        }
        .cw-req-btn-resolve { background: #ECFDF5; color: #16A34A; border-color: rgba(22,163,74,0.3); }
        .cw-req-btn-resolve:hover { background: #16A34A; color: #fff; }
        .cw-req-btn-reject { background: #FEF2F2; color: #DC2626; border-color: rgba(220,38,38,0.25); }
        .cw-req-btn-reject:hover { background: #DC2626; color: #fff; }

        @media (max-width: 768px) {
          .cw-req-panel { width: 100vw; }
        }

        

        @media (max-width: 768px) {
          .cw-sidebar {
            position: fixed;
            left: -260px;
            top: 0;
            height: 100vh;
            z-index: 200;
            box-shadow: 4px 0 24px rgba(0,0,0,0.08);
            transition: left 0.25s ease;
          }
          .cw-sidebar.open { left: 0; }
          .cw-topbar-hamburger { display: flex; }
        }
      `}</style>

      <div className="cw-shell">
        {/* Mobile overlay */}
        <div className={`cw-overlay${mobileOpen ? " show" : ""}`} onClick={() => setMobileOpen(false)} />

        {/* Sidebar */}
        <aside className={`cw-sidebar${mobileOpen ? " open" : ""}`}>
          <div className="cw-sidebar-brand">
            <div className="cw-sidebar-logo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
              </svg>
            </div>
            <div>
              <div className="cw-sidebar-brand-text">CoWork</div>
              <div className="cw-sidebar-brand-sub">Workspace</div>
            </div>
          </div>

          <nav className="cw-sidebar-nav">
            <div className="cw-sidebar-section">Menu</div>
            {NAV.map(item => (
              <div
                key={item.id}
                className={`cw-nav-item${isActive(item.path) ? " active" : ""}`}
                onClick={() => handleNav(item.path)}
              >
                <NavIcon name={item.icon} size={18} />
                <span>{item.label}</span>
                {(() => {
                  // Badge counts:
                  // messages → real-time DM readBy count
                  // groups   → real-time group message readBy count
                  // tasks    → notification-based (task events)
                  // meetings → notification-based (meet events)
                  // All badges use real-time readBy-based counts so they decrement
                  // as messages are actually read — 3 → 2 → 1 → 0
                  const cnt =
                    item.id === "messages" ? dmUnreadCount        // per-message readBy live
                      : item.id === "groups" ? groupUnreadCount     // per-message readBy live
                        : item.id === "tasks" ? taskChatUnreadCount  // per-message readBy live
                          : item.id === "meetings" ? meetingUnreadCount   // notification-based
                            : 0;
                  if (cnt <= 0) return null;
                  const bg =
                    item.id === "tasks" ? "#8B5CF6"
                      : item.id === "groups" ? "#0891B2"
                        : "#EF4444";
                  return (
                    <span className="cw-nav-badge" style={{ background: bg }}>
                      {cnt > 99 ? "99+" : cnt > 9 ? "9+" : cnt}
                    </span>
                  );
                })()}
              </div>
            ))}

            {/* ── Install App button ── */}
            {!isInstalled && (
              <div style={{ margin: "8px 10px 4px" }}>
                {/* iOS: show step-by-step instruction panel */}
                {showIosGuide && (
                  <div style={{
                    marginBottom: 8, padding: "12px 14px",
                    background: "#F0FDF4", border: "1.5px solid #86EFAC",
                    borderRadius: 10, fontSize: 11, color: "#166534", lineHeight: 1.7,
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>📱 Install on iPhone/iPad:</div>
                    <div>1. Open this site in <strong>Safari</strong></div>
                    <div>2. Tap the <strong>Share</strong> button (□↑)</div>
                    <div>3. Tap <strong>"Add to Home Screen"</strong></div>
                    <div>4. Tap <strong>Add</strong> (top right)</div>
                    <div style={{ marginTop: 6, color: "#15803D", fontWeight: 600 }}>
                      ✅ Then open from home screen for notifications!
                    </div>
                    <button onClick={() => setShowIosGuide(false)}
                      style={{ marginTop: 8, fontSize: 10, color: "#16A34A", background: "none", border: "1px solid #86EFAC", borderRadius: 5, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                      Got it ✓
                    </button>
                  </div>
                )}

                <button
                  onClick={() => {
                    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                    if (isIos) {
                      // iOS: can't trigger install programmatically — show step guide
                      setShowIosGuide(p => !p);
                    } else if (canInstall) {
                      // Android/Desktop: trigger native browser install prompt
                      handleInstall();
                    } else {
                      // Prompt already used or not available — show manual hint
                      alert("To install: tap the browser menu (⋮) → \"Add to Home Screen\" or \"Install App\"");
                    }
                  }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", borderRadius: 10, border: "none",
                    background: "linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)",
                    boxShadow: "0 4px 14px rgba(37,99,235,0.35)",
                    cursor: "pointer", fontFamily: "inherit",
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.9"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
                      {canInstall ? "Install App" : "Download App"}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>
                      {canInstall ? "Tap to install — get notifications" : "Install on your device"}
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            )}
            {/* Already installed — show confirmation */}
            {isInstalled && (
              <div style={{ margin: "8px 10px 4px", padding: "8px 12px", background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>✅</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#15803D" }}>App Installed</div>
                  <div style={{ fontSize: 10, color: "#16A34A" }}>Notifications are active</div>
                </div>
              </div>
            )}
          </nav>

          <div className="cw-sidebar-footer">

            <div className="cw-user-card">
              <div className="cw-user-avatar">{initials(employeeName)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cw-user-name">{employeeName}</div>
                <div className="cw-user-role">{roleLabel}</div>
              </div>
            </div>
            <button className="cw-signout-btn" onClick={handleSignOut}>
              <NavIcon name="logout" size={16} />
              Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="cw-main">
          <header className="cw-topbar">
            <div className="cw-topbar-left">
              <button className="cw-topbar-hamburger" onClick={() => setMobileOpen(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
              </button>
              <h1 className="cw-topbar-title">{title}</h1>
            </div>
            <div className="cw-topbar-right">

              <button
                className="cw-topbar-icon-btn"
                title="Notes"
                onClick={() => setNotesPanelOpen(true)}
                style={{ position: "relative" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                {notesAlertCount > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, background: "#EF4444", color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: "1.5px solid #fff", lineHeight: 1, pointerEvents: "none", letterSpacing: "-0.02em" }}>
                    {notesAlertCount > 9 ? "9+" : notesAlertCount}
                  </span>
                )}
              </button>

              <div style={{ position: "relative" }}>
                <button className="cw-topbar-icon-btn" title="Notifications" onClick={() => setNotifOpen(!notifOpen)} style={{ position: "relative" }}>
                  <NavIcon name="bell" size={18} />
                  {unread > 0 && (
                    <span style={{
                      position: "absolute",
                      top: -4, right: -6,
                      minWidth: 16, height: 16,
                      borderRadius: 8,
                      background: "#EF4444",
                      color: "#fff",
                      fontSize: 9.5,
                      fontWeight: 800,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: "0 4px",
                      border: "1.5px solid #fff",
                      lineHeight: 1,
                      pointerEvents: "none",
                      letterSpacing: "-0.02em",
                    }}>
                      {unread > 99 ? "99+" : unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="cw-notif-popup">
                    <div className="cw-notif-popup-head">
                      <span className="cw-notif-popup-title">Notifications {unread > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#1A73E8", background: "#EBF3FE", padding: "2px 8px", borderRadius: 4, marginLeft: 6 }}>{unread}</span>}</span>
                      {unread > 0 && <button className="cw-notif-popup-mark" onClick={() => { markRead(); }}>Mark all read</button>}
                    </div>
                    <div className="cw-notif-popup-list">
                      {notifications.length === 0 ? (
                        <div className="cw-notif-popup-empty">No notifications yet</div>
                      ) : (
                        notifications.slice(0, 15).map((n, i) => (
                          <div key={n.id || i} className="cw-notif-popup-item"
                            style={{ background: n.read ? "transparent" : "rgba(26,115,232,0.03)", cursor: "pointer" }}
                            onClick={() => {
                              setNotifOpen(false);
                              const d = n.data || {};
                              const t = n.type || "";
                              if (["task_assigned", "task_confirmed", "task_started", "task_update", "task_forwarded",
                                "task_chat", "daily_report", "deadline_changed"].includes(t) || t.startsWith("completion")) {
                                if (d.taskId) localStorage.setItem("selectedTaskId", d.taskId);
                                router.push("/coworking/tasks");
                              } else if (t === "group_message" || t === "group_added") {
                                router.push(d.groupId ? `/coworking/create-group/group-chat/${d.groupId}` : "/coworking/create-group");
                              } else if (t === "direct_message") {
                                router.push("/coworking/direct-messages");
                              } else if (t === "meet_scheduled") {
                                router.push("/coworking/schedule-meet");
                              }
                            }}
                          >
                            <span className={`cw-notif-popup-item-dot${n.read ? " read" : ""}`} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="cw-notif-popup-item-title">{n.title}</div>
                              {n.body && <div className="cw-notif-popup-item-body">{n.body}</div>}
                            </div>
                            <span className="cw-notif-popup-item-time">{timeAgo(n.createdAt)}</span>
                          </div>
                        ))
                      )}
                    </div>
                    {notifications.length > 15 && (
                      <div className="cw-notif-popup-footer">
                        <a onClick={() => { setNotifOpen(false); router.push("/coworking"); }}>View all notifications</a>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Universal Request Button */}
              <button
                className="cw-topbar-icon-btn"
                title="Requests"
                onClick={handleOpenReqPanel}
                style={{ position: "relative" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                  <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
                </svg>
                {reqUnreadCount > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, background: "#EF4444", color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: "1.5px solid #fff", lineHeight: 1, pointerEvents: "none", letterSpacing: "-0.02em" }}>
                    {reqUnreadCount > 9 ? "9+" : reqUnreadCount}
                  </span>
                )}
              </button>

              <div className="cw-topbar-avatar" title={employeeName}>
                {initials(employeeName)}
              </div>
            </div>
          </header>

          <main className="cw-content">
            {children}
          </main>
        </div>
      </div>
      {/* ── Universal Request Sidebar Panel ── */}
      <div className={`cw-req-panel-overlay${reqPanelOpen ? " show" : ""}`} onClick={() => { setReqPanelOpen(false); setActiveChatReqId(null); }} />
      <div className={`cw-req-panel${reqPanelOpen ? " open" : ""}${activeChatReqId ? " chat-open" : ""}`}>
        {/* Left: Request list */}
        <div className="cw-req-panel-left">
          <RequestSidebarPanel
            employeeId={employeeId}
            employeeName={employeeName}
            onClose={() => { setReqPanelOpen(false); setActiveChatReqId(null); setReqPanelThreadContext(null); }}
            initialTab={reqPanelInitialTab}
            prefilledTask={reqPanelContext}
            highlightReqId={highlightReqId}
            onOpenChat={openChatForReq}
            activeChatReqId={activeChatReqId}
            chatThreads={chatThreads}
            chatInput={chatInput}
            setChatInput={setChatInput}
            sendChatMsg={sendChatMsg}
            threadContext={reqPanelThreadContext}
            openRespondId={reqPanelOpenRespondId}
          />
        </div>

        {/* Right: Chat panel — slides in when a chat is opened */}
        {activeChatReqId && (() => {
          const reqId = activeChatReqId;
          const msgs = chatThreads[reqId] || [];
          const uploading = chatUploading[reqId];
          return (
            <div className="cw-req-panel-chat">
              {/* Chat header */}
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #E4E7EC", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1D21", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {activeChatReq?.subject || "Chat Thread"}
                  </div>
                  <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                    {activeChatReq?.fromName || activeChatReq?.toName ? (
                      <>
                        <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#1A73E8", color: "#fff", fontSize: 8, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {(activeChatReq?.fromName || activeChatReq?.toName || "?")[0].toUpperCase()}
                        </span>
                        {activeChatReq?.fromName || activeChatReq?.toName}
                      </>
                    ) : "Request conversation"}
                  </div>
                </div>
                <button onClick={() => setActiveChatReqId(null)} style={{ width: 26, height: 26, border: "1px solid #E4E7EC", borderRadius: 6, background: "#F8FAFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#667085" }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                </button>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                {msgs.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#9AA0A6", fontSize: 12, marginTop: 40 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, display: "block", margin: "0 auto 8px" }}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                    No messages yet
                  </div>
                ) : msgs.map((msg, mi) => {
                  const isMe = msg.senderId === employeeId;
                  return (
                    <div key={msg.id || mi} style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                      {!isMe && <div style={{ fontSize: 10, color: "#9AA0A6", marginBottom: 3, fontWeight: 600 }}>{msg.senderName}</div>}
                      {msg.text && (
                        <div style={{ position: "relative", maxWidth: "80%" }} className="req-chat-msg-wrap">
                          <div style={{ padding: "8px 12px", borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px", background: isMe ? "#1A73E8" : "#fff", color: isMe ? "#fff" : "#1A1D21", fontSize: 13, lineHeight: 1.5, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", border: isMe ? "none" : "1px solid #E4E7EC" }}>
                            {msg.text}
                          </div>
                          {isMe && (
                            <button
                              onClick={() => { if (window.confirm("Delete this message?")) deleteReqChatMsg(reqId, msg.id); }}
                              className="req-msg-del-btn"
                              title="Delete message"
                              style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#EF4444", border: "1.5px solid #fff", cursor: "pointer", display: "none", alignItems: "center", justifyContent: "center", padding: 0 }}
                            >
                              <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></svg>
                            </button>
                          )}
                        </div>
                      )}
                      {/* Attachments */}
                      {(msg.attachments || []).map((att, ai) => (
                        <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer"
                          style={{ display: "flex", alignItems: "center", gap: 7, maxWidth: "80%", marginTop: 4, padding: "8px 12px", borderRadius: 8, background: isMe ? "#1558b0" : "#fff", border: isMe ? "none" : "1px solid #E4E7EC", color: isMe ? "#fff" : "#1A73E8", fontSize: 12, fontWeight: 500, textDecoration: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                          {att.type === "image" ? (
                            <img src={att.url} alt={att.name} style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 6 }} />
                          ) : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                            </>
                          )}
                        </a>
                      ))}
                      <div style={{ fontSize: 9, color: "#9AA0A6", marginTop: 3 }}>
                        {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}
                      </div>
                    </div>
                  );
                })}
                <div ref={el => chatEndRefs.current[reqId] = el} />
              </div>

              {/* Input bar */}
              <div style={{ padding: "10px 12px", borderTop: "1px solid #E4E7EC", background: "#fff", flexShrink: 0 }}>
                {uploading && (
                  <div style={{ fontSize: 11, color: "#1A73E8", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                    <svg style={{ animation: "gw-spin 0.8s linear infinite" }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
                    Uploading…
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  {/* Attach button */}
                  <button
                    onClick={() => { const inp = document.getElementById(`req-chat-file-${reqId}`); inp?.click(); }}
                    disabled={uploading}
                    style={{ width: 34, height: 34, border: "1.5px solid #E4E7EC", borderRadius: 8, background: "#F8FAFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#667085", flexShrink: 0 }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                  </button>
                  <input id={`req-chat-file-${reqId}`} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.rar" style={{ display: "none" }} onChange={e => handleChatFilePick(reqId, e.target.files)} />

                  {/* Text input */}
                  <textarea
                    value={chatInput[reqId] || ""}
                    onChange={e => setChatInput(prev => ({ ...prev, [reqId]: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMsg(reqId); } }}
                    placeholder="Type a message…"
                    rows={1}
                    style={{ flex: 1, padding: "8px 12px", border: "1.5px solid #E4E7EC", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", color: "#1A1D21", resize: "none", lineHeight: 1.5 }}
                  />

                  {/* Send button */}
                  <button
                    onClick={() => sendChatMsg(reqId)}
                    disabled={uploading || (!chatInput[reqId]?.trim())}
                    style={{ width: 34, height: 34, background: "#1A73E8", border: "none", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: (!chatInput[reqId]?.trim() && !uploading) ? 0.5 : 1 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Notes Sidebar Panel ── */}
      <div className={`cw-req-panel-overlay${notesPanelOpen ? " show" : ""}`} onClick={() => setNotesPanelOpen(false)} />
      <div className={`cw-notes-panel${notesPanelOpen ? " open" : ""}`}>
        <NotesSidebarPanel
          employeeId={employeeId}
          employeeName={employeeName}
          onClose={() => setNotesPanelOpen(false)}
          initialTab="create"
        />
      </div>

      {/* ── PiP Meeting — persistent LiveKit room + floating box ── */}
      {pipMeeting?.isActive && pipMeeting?.token && (
        <>
          {/* Hidden LiveKit room — stays connected across all page navigations */}
          <div style={{ position: "fixed", width: 1, height: 1, top: -9999, left: -9999, overflow: "hidden", opacity: 0, pointerEvents: "none", zIndex: -1 }}>
            <LiveKitRoom
              token={pipMeeting.token}
              serverUrl={pipMeeting.serverUrl}
              data-lk-theme="default"
              video={false}
              audio={pipMicOn}
              onDisconnected={() => { clearPipMeeting(); }}
            >
              <RoomAudioRenderer />
            </LiveKitRoom>
          </div>

          {/* Floating PiP box */}
          <div
            ref={pipDragRef}
            style={{
              position: "fixed",
              left: pipPos.x !== null ? pipPos.x : "auto",
              right: pipPos.x !== null ? "auto" : 24,
              top: pipPos.y !== null ? pipPos.y : "auto",
              bottom: pipPos.y !== null ? "auto" : 24,
              zIndex: 9999,
              width: pipCollapsed ? 220 : 300,
              borderRadius: 14, overflow: "hidden",
              boxShadow: "0 8px 40px rgba(0,0,0,0.45)",
              background: "#111827", border: "1px solid rgba(255,255,255,0.15)",
              userSelect: "none",
            }}
          >
            {/* Drag handle */}
            <div onMouseDown={handlePipDragStart}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "#0F172A", cursor: "grab", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", flexShrink: 0, boxShadow: "0 0 6px #EF4444" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#F1F5F9", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pipMeeting.title || "Meeting"}
              </span>
              {/* Collapse */}
              <button onClick={() => setPipCollapsed(p => !p)}
                style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "rgba(255,255,255,0.1)", color: "#CBD5E1", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  {pipCollapsed ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
                </svg>
              </button>
              {/* Restore */}
              <button onClick={() => router.push(`/coworking/cowork-meeting/${pipMeeting.meetId}`)}
                title="Return to full meeting"
                style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "rgba(37,99,235,0.4)", color: "#93C5FD", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
            </div>

            {/* Body */}
            {!pipCollapsed && (
              <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Status */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#94A3B8" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
                  Connected · {pipMeeting.title}
                </div>

                {/* Mic / Cam toggle buttons */}
                <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                  {/* Mic */}
                  <button onClick={() => setPipMicOn(p => !p)}
                    title={pipMicOn ? "Mute mic" : "Unmute mic"}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: pipMicOn ? "rgba(255,255,255,0.12)" : "#DC2626", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                    {pipMicOn
                      ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                      : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                    }
                    {pipMicOn ? "Mic On" : "Muted"}
                  </button>
                  {/* Cam */}
                  <button onClick={() => setPipCamOn(p => !p)}
                    title={pipCamOn ? "Stop camera" : "Start camera"}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: pipCamOn ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)", color: pipCamOn ? "#fff" : "#94A3B8", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, border: "1px solid rgba(255,255,255,0.1)" }}>
                    {pipCamOn
                      ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                      : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    }
                    {pipCamOn ? "Cam On" : "Cam Off"}
                  </button>
                </div>

                {/* Open / Leave */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => router.push(`/coworking/cowork-meeting/${pipMeeting.meetId}`)}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: "#2563EB", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                    Open Meeting
                  </button>
                  <button
                    onClick={() => { if (window.confirm("Leave the meeting?")) clearPipMeeting(); }}
                    style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Leave
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}