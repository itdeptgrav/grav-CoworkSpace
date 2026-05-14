"use client";
import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { firebaseAuth, firebaseDb } from "../../../lib/coworkFirebase";
import { useCoworkNotifications } from "../../../hooks/useCoworkNotifications";
import { timeAgo } from "../../../lib/coworkUtils";
import { useState, useEffect, useRef, useCallback } from "react";
import NotesSidebarPanel from "../notes/NotesSidebarPanel";
import IncomingCallToast from "../messaging/IncomingCallToast";
import LinkedText from "../messaging/LinkedText";
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
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch, limit,
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

function ReqAvatar({ name = "?", url = null, size = 30 }) {
  const colors = ["#1A73E8", "#0F9D58", "#F29900", "#7B1FA2", "#D93025", "#00ACC1"];
  const bg = colors[name.charCodeAt(0) % colors.length];
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  // If a real profile picture URL is available, render it instead of the initials tile.
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{
          width: size, height: size, borderRadius: 8, objectFit: "cover",
          flexShrink: 0, background: bg, // bg shows if the image is loading/broken
        }}
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, background: bg, color: "#fff",
      fontSize: Math.max(9, Math.round(size * 0.33)), fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
    }}>
      {initials}
    </div>
  );
}

const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"];
const TYPE_OPTIONS = ["Information", "Approval", "Resource", "Review", "Clarification", "Support", "Other"];
const STATUS_COLORS = {
  pending: { color: "#D97706", bg: "#FEF3C7" },
  in_progress: { color: "#1A73E8", bg: "#EFF6FF" },
  completion_requested: { color: "#7C3AED", bg: "#F5F3FF" },
  completed: { color: "#16A34A", bg: "#F0FDF4" },
  // Legacy values — kept so old data still renders
  approved: { color: "#16A34A", bg: "#F0FDF4" },
  accepted: { color: "#16A34A", bg: "#F0FDF4" },
  date_suggested: { color: "#7C3AED", bg: "#F5F3FF" },
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
  // Proposed date/time (sender side)
  const [proposedDate, setProposedDate] = useState("");
  const [proposedTime, setProposedTime] = useState("");
  // Sender's completion requirements (what receiver must do)
  const [completionRequirements, setCompletionRequirements] = useState("");
  // Suggest new date (receiver side)
  const [suggestId, setSuggestId] = useState(null);
  const [suggestDate, setSuggestDate] = useState("");
  const [suggestTime, setSuggestTime] = useState("");
  const [suggestMsg, setSuggestMsg] = useState("");
  const [suggestBusy, setSuggestBusy] = useState(false);
  // Mark complete (receiver side)
  const [completeId, setCompleteId] = useState(null);
  const [completeMsg, setCompleteMsg] = useState("");
  const [completeBusy, setCompleteBusy] = useState(false);
  // Reject completion (sender side)
  const [rejectCompleteId, setRejectCompleteId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  // Extra section toggles — Responded is now split into In Progress + Completed
  const [inProgressOpen, setInProgressOpen] = useState(true);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [openInProgressSenders, setOpenInProgressSenders] = useState(new Set());
  const [openCompletedSenders, setOpenCompletedSenders] = useState(new Set());
  // Sent tab section toggles — mirrors Received tab structure
  const [sentPendingOpen, setSentPendingOpen] = useState(true);
  const [sentInProgressOpen, setSentInProgressOpen] = useState(true);
  const [sentCompletedOpen, setSentCompletedOpen] = useState(false);
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
  // Per-person expand state inside each sub-section — collapsed by default.
  // Keys are sender IDs (fromId). Presence in the Set = expanded.
  const [openPendingSenders, setOpenPendingSenders] = useState(new Set());
  const [openRespondedSenders, setOpenRespondedSenders] = useState(new Set());
  // Add a new state to hold all tasks
  const [allTasks, setAllTasks] = useState([]);

  // Fetch all tasks once when the component mounts
  useEffect(() => {
    const fetchAllTasks = async () => {
      try {
        const snap = await getDocs(collection(firebaseDb, "cowork_tasks"));
        const tasks = snap.docs
          .map(d => ({ taskId: d.id, ...d.data() }))
          .filter(t => !t.parentTaskId && t.status !== "done");
        setAllTasks(tasks);
      } catch (error) {
        console.error("Failed to fetch tasks", error);
      }
    };
    fetchAllTasks();
  }, []);

  // Function to filter tasks based on query
  const filterTasks = (query) => {
    if (!query.trim()) {
      setTaskSuggestions(allTasks);
      return;
    }
    const lower = query.toLowerCase();
    const filtered = allTasks.filter(t =>
      t.title?.toLowerCase().includes(lower) ||
      t.taskId?.toLowerCase().includes(lower)
    );
    setTaskSuggestions(filtered);
  };

  // Replace the old useEffect that fetched on query change with this one
  useEffect(() => {
    filterTasks(taskQuery);
  }, [taskQuery, allTasks]);

  // Update the input's onFocus and onChange handlers
  <input
    className="cw-rf-input"
    placeholder="Search task name or ID…"
    value={taskQuery}
    onChange={(e) => {
      setTaskQuery(e.target.value);
      setShowTaskDrop(true);
    }}
    onFocus={() => {
      // Show dropdown with all tasks if no query, otherwise show filtered list
      if (!taskQuery.trim()) {
        setTaskSuggestions(allTasks);
      }
      setShowTaskDrop(true);
    }}
    onBlur={() => setTimeout(() => setShowTaskDrop(false), 180)}
  />

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
    setProposedDate(""); setProposedTime(""); setCompletionRequirements("");
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
          proposedDate: proposedDate || null,
          proposedTime: proposedTime || null,
          proposedDateTime: (proposedDate && proposedTime) ? `${proposedDate}T${proposedTime}` : (proposedDate || null),
          completionRequirements: completionRequirements.trim() || null,
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
        // FCM push for group request recipients
        for (const toId of toIds) {
          fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/cowork/notify-request-response`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await (async () => { try { const { firebaseAuth } = await import("../../../lib/coworkFirebase"); const t = await firebaseAuth.currentUser?.getIdToken(); return t ? { Authorization: `Bearer ${t}` } : {}; } catch { return {}; } })()) },
            body: JSON.stringify({
              recipientId: toId,
              title: `📨 New Request · ${employeeName}`,
              body: subject.trim().slice(0, 80),
              type: "request",
              subject: subject.trim(),
            }),
          }).catch(() => { });
        }
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
            proposedDate: proposedDate || null,
            proposedTime: proposedTime || null,
            proposedDateTime: (proposedDate && proposedTime) ? `${proposedDate}T${proposedTime}` : (proposedDate || null),
            completionRequirements: completionRequirements.trim() || null,
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
          // FCM push for new request
          fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/cowork/notify-request-response`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await (async () => { try { const { firebaseAuth } = await import("../../../lib/coworkFirebase"); const t = await firebaseAuth.currentUser?.getIdToken(); return t ? { Authorization: `Bearer ${t}` } : {}; } catch { return {}; } })()) },
            body: JSON.stringify({
              recipientId: toId,
              title: `📨 New Request · ${employeeName}`,
              body: `${subject.trim().slice(0, 60)}${priority ? " · " + priority : ""}`,
              type: "request",
              subject: subject.trim(),
            }),
          }).catch(() => { });
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



  // Accept with employee's original proposed date/time — goes to in_progress
  const handleAcceptAsIs = async (reqId) => {
    setRespondingId(reqId);
    try {
      const reqDoc = await getDoc(doc(firebaseDb, "cowork_requests", reqId));
      if (!reqDoc.exists()) return;
      const req = reqDoc.data();
      await updateDoc(doc(firebaseDb, "cowork_requests", reqId), {
        status: "in_progress",
        finalDate: req.proposedDate || null,
        finalTime: req.proposedTime || null,
        finalDateTime: req.proposedDateTime || null,
        finalBy: "sender_proposal",
        responseMessage: "",
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      // Notify sender
      try {
        const notifRef = doc(collection(firebaseDb, "cowork_notifications"));
        await setDoc(notifRef, {
          recipientEmployeeId: req.fromId,
          type: "request_accepted",
          title: `✅ Request Accepted · ${req.subject || ""}`,
          body: req.proposedDateTime
            ? `Accepted for ${new Date(req.proposedDateTime).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
            : "Your request was accepted.",
          fromId: employeeId, fromName: employeeName,
          requestId: reqId, read: false, createdAt: serverTimestamp(),
        });
        // Backend FCM push
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/cowork/notify-request-response`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await (async () => { try { const { firebaseAuth } = await import("../../../lib/coworkFirebase"); const t = await firebaseAuth.currentUser?.getIdToken(); return t ? { Authorization: `Bearer ${t}` } : {}; } catch { return {}; } })()) },
          body: JSON.stringify({
            recipientId: req.fromId,
            title: `✅ Request Accepted · ${req.subject || ""}`,
            body: "Your request was accepted.",
            type: "request_accepted",
            subject: req.subject,
          }),
        }).catch(() => { });
      } catch (_) { }
      setRespondingId(null);
    } catch (e) { console.error(e); setRespondingId(null); }
  };

  // Receiver suggests a different date/time — goes to in_progress
  const handleSuggestDate = async (reqId) => {
    if (!suggestDate) return;
    setSuggestBusy(true);
    try {
      const reqDoc = await getDoc(doc(firebaseDb, "cowork_requests", reqId));
      if (!reqDoc.exists()) return;
      const req = reqDoc.data();
      const finalDT = suggestTime ? `${suggestDate}T${suggestTime}` : suggestDate;
      await updateDoc(doc(firebaseDb, "cowork_requests", reqId), {
        status: "in_progress",
        suggestedDate: suggestDate,
        suggestedTime: suggestTime || null,
        suggestedDateTime: finalDT,
        suggestedBy: employeeName,
        suggestedById: employeeId,
        finalDate: suggestDate,
        finalTime: suggestTime || null,
        finalDateTime: finalDT,
        finalBy: "receiver_suggestion",
        responseMessage: suggestMsg.trim(),
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      // Notify sender
      try {
        const notifRef = doc(collection(firebaseDb, "cowork_notifications"));
        await setDoc(notifRef, {
          recipientEmployeeId: req.fromId,
          type: "request_date_suggested",
          title: `📅 New Date Suggested · ${req.subject || ""}`,
          body: `${employeeName} suggested ${new Date(finalDT).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${suggestMsg.trim() ? ` — ${suggestMsg.trim()}` : ""}`,
          fromId: employeeId, fromName: employeeName,
          requestId: reqId, read: false, createdAt: serverTimestamp(),
        });
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/cowork/notify-request-response`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await (async () => { try { const { firebaseAuth } = await import("../../../lib/coworkFirebase"); const t = await firebaseAuth.currentUser?.getIdToken(); return t ? { Authorization: `Bearer ${t}` } : {}; } catch { return {}; } })()) },
          body: JSON.stringify({
            recipientId: req.fromId,
            title: `📅 New Date Suggested · ${req.subject || ""}`,
            body: suggestMsg.trim() || `${employeeName} suggested a new date.`,
            type: "request_date_suggested",
            subject: req.subject,
          }),
        }).catch(() => { });
      } catch (_) { }
      setSuggestId(null); setSuggestDate(""); setSuggestTime(""); setSuggestMsg("");
    } catch (e) { console.error(e); }
    finally { setSuggestBusy(false); }
  };

  // Receiver marks request as completed — goes to sender for confirmation
  const handleMarkCompleted = async (reqId) => {
    setCompleteBusy(true);
    try {
      const reqDoc = await getDoc(doc(firebaseDb, "cowork_requests", reqId));
      if (!reqDoc.exists()) return;
      const req = reqDoc.data();
      await updateDoc(doc(firebaseDb, "cowork_requests", reqId), {
        status: "completion_requested",
        completionMessage: completeMsg.trim() || null,
        completionRequestedAt: serverTimestamp(),
        // Clear any previous rejection so the receiver's card no longer shows a stale "rejected" banner
        completionRejectionReason: null,
        completionRejectedAt: null,
        updatedAt: serverTimestamp(),
      });
      try {
        const notifRef = doc(collection(firebaseDb, "cowork_notifications"));
        await setDoc(notifRef, {
          recipientEmployeeId: req.fromId,
          type: "request_completion_requested",
          title: `Completion submitted: ${req.subject || ""}`,
          body: completeMsg.trim() || `${employeeName} marked the request as completed. Please confirm.`,
          fromId: employeeId, fromName: employeeName,
          requestId: reqId, read: false, createdAt: serverTimestamp(),
        });
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/cowork/notify-request-response`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await (async () => { try { const { firebaseAuth } = await import("../../../lib/coworkFirebase"); const t = await firebaseAuth.currentUser?.getIdToken(); return t ? { Authorization: `Bearer ${t}` } : {}; } catch { return {}; } })()) },
          body: JSON.stringify({
            recipientId: req.fromId,
            title: `Completion submitted: ${req.subject || ""}`,
            body: completeMsg.trim() || "Please confirm the completion.",
            type: "request_completion_requested",
            subject: req.subject,
          }),
        }).catch(() => { });
      } catch (_) { }
      setCompleteId(null); setCompleteMsg("");
    } catch (e) { console.error(e); }
    finally { setCompleteBusy(false); }
  };

  // Sender confirms the completion — final state
  const handleConfirmCompletion = async (reqId) => {
    try {
      const reqDoc = await getDoc(doc(firebaseDb, "cowork_requests", reqId));
      if (!reqDoc.exists()) return;
      const req = reqDoc.data();
      await updateDoc(doc(firebaseDb, "cowork_requests", reqId), {
        status: "completed",
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      try {
        const notifRef = doc(collection(firebaseDb, "cowork_notifications"));
        await setDoc(notifRef, {
          recipientEmployeeId: req.toId,
          type: "request_completed",
          title: `Request marked complete: ${req.subject || ""}`,
          body: `${employeeName} confirmed the completion.`,
          fromId: employeeId, fromName: employeeName,
          requestId: reqId, read: false, createdAt: serverTimestamp(),
        });
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/cowork/notify-request-response`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await (async () => { try { const { firebaseAuth } = await import("../../../lib/coworkFirebase"); const t = await firebaseAuth.currentUser?.getIdToken(); return t ? { Authorization: `Bearer ${t}` } : {}; } catch { return {}; } })()) },
          body: JSON.stringify({
            recipientId: req.toId,
            title: `Request marked complete: ${req.subject || ""}`,
            body: `${employeeName} confirmed the completion.`,
            type: "request_completed",
            subject: req.subject,
          }),
        }).catch(() => { });
      } catch (_) { }
    } catch (e) { console.error(e); }
  };

  // Sender rejects the completion — requires a reason; request goes back to in_progress
  const handleRejectCompletion = async (reqId) => {
    if (!rejectReason.trim()) return;
    setRejectBusy(true);
    try {
      const reqDoc = await getDoc(doc(firebaseDb, "cowork_requests", reqId));
      if (!reqDoc.exists()) return;
      const req = reqDoc.data();
      await updateDoc(doc(firebaseDb, "cowork_requests", reqId), {
        status: "in_progress", // Send back to in-progress so receiver can retry
        completionRejectionReason: rejectReason.trim(),
        completionRejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      try {
        const notifRef = doc(collection(firebaseDb, "cowork_notifications"));
        await setDoc(notifRef, {
          recipientEmployeeId: req.toId,
          type: "request_completion_rejected",
          title: `❌ Request Rejected · ${req.subject || ""}`,
          body: rejectReason.trim(),
          fromId: employeeId, fromName: employeeName,
          requestId: reqId, read: false, createdAt: serverTimestamp(),
        });
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/cowork/notify-request-response`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await (async () => { try { const { firebaseAuth } = await import("../../../lib/coworkFirebase"); const t = await firebaseAuth.currentUser?.getIdToken(); return t ? { Authorization: `Bearer ${t}` } : {}; } catch { return {}; } })()) },
          body: JSON.stringify({
            recipientId: req.toId,
            title: `❌ Request Rejected · ${req.subject || ""}`,
            body: rejectReason.trim(),
            type: "request_completion_rejected",
            subject: req.subject,
          }),
        }).catch(() => { });
      } catch (_) { }
      setRejectCompleteId(null); setRejectReason("");
    } catch (e) { console.error(e); }
    finally { setRejectBusy(false); }
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



                {/* Proposed Date + Time row */}
                <div className="cw-rf-row" style={{ marginTop: 14 }}>
                  <div className="cw-rf-field" style={{ marginBottom: 0 }}>
                    <label className="cw-rf-lbl">📅 Proposed Date</label>
                    <input className="cw-rf-input" type="date" value={proposedDate} onChange={e => setProposedDate(e.target.value)} />
                  </div>
                  <div className="cw-rf-field" style={{ marginBottom: 0 }}>
                    <label className="cw-rf-lbl">🕐 Proposed Time</label>
                    <input className="cw-rf-input" type="time" value={proposedTime} onChange={e => setProposedTime(e.target.value)} />
                  </div>
                </div>

                {/* Linked Task row */}
                <div className="cw-rf-row" style={{ marginTop: 14 }}>
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

                {/* Completion Requirements */}
                <div className="cw-rf-field">
                  <label className="cw-rf-lbl">✓ Completion Requirements</label>
                  <textarea className="cw-rf-input" rows={2}
                    style={{ resize: "vertical", lineHeight: 1.5 }}
                    placeholder="What needs to be done for this request to be considered complete?"
                    value={completionRequirements}
                    onChange={e => setCompletionRequirements(e.target.value)}
                  />
                  <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 2 }}>Optional — helps the receiver know what's expected</div>
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
              const inProgressReqs = received.filter(r =>
                r.status === "in_progress" ||
                r.status === "completion_requested" ||
                r.status === "accepted" ||         // legacy
                r.status === "date_suggested"      // legacy
              );
              const completedReqs = received.filter(r =>
                r.status === "completed" ||
                r.status === "approved"            // legacy
              );
              const respondedReqs = received.filter(r => r.status !== "pending"); // kept for backward compat

              // ── Group requests by sender (fromId) so the Received tab mirrors
              //    the person-grouped task view. All groups start collapsed.
              //    Returns [[senderId, { name, picUrl, items }], ...] sorted alphabetically.
              const groupBySender = (list) => {
                const map = new Map();
                for (const r of list) {
                  const sid = r.fromId || "__unknown__";
                  if (!map.has(sid)) {
                    // Look up the sender's real profile picture from the employees list
                    // (loaded once on mount via fetchEmployees). Falls back to initials
                    // when the employee record is missing or has no picture.
                    const emp = employees.find(e => e.employeeId === sid);
                    map.set(sid, {
                      name: emp?.name || r.fromName || "Unknown",
                      picUrl: emp?.profilePicUrl || null,
                      items: [],
                    });
                  }
                  map.get(sid).items.push(r);
                }
                return [...map.entries()].sort((a, b) =>
                  (a[1].name || "").localeCompare(b[1].name || "")
                );
              };

              // Renders a person row: avatar + name + count + chevron.
              // Clicking toggles the request list below it.
              const renderPersonGroup = (senderId, bucket, openSet, setOpenSet) => {
                const expanded = openSet.has(senderId);
                const toggle = () => setOpenSet(prev => {
                  const n = new Set(prev);
                  n.has(senderId) ? n.delete(senderId) : n.add(senderId);
                  return n;
                });
                return (
                  <div key={senderId} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <button
                      onClick={toggle}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 16px 9px 28px",
                        background: expanded ? "#F5F3FF" : "#fff",
                        border: "none", cursor: "pointer",
                        fontFamily: "inherit", textAlign: "left",
                        borderLeft: expanded ? "3px solid #5B5EF4" : "3px solid transparent",
                        transition: "background 0.12s, border-left-color 0.12s",
                      }}
                    >
                      <ReqAvatar name={bucket.name} url={bucket.picUrl} />
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#1A1D21" }}>
                        {bucket.name}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: expanded ? "#fff" : "#5B5EF4",
                        background: expanded ? "#5B5EF4" : "#EEF2FF",
                        border: `1px solid ${expanded ? "#5B5EF4" : "#C7D2FE"}`,
                        borderRadius: 99, padding: "1px 8px", minWidth: 22, textAlign: "center",
                      }}>
                        {bucket.items.length}
                      </span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {expanded && (
                      <div style={{ background: "#FAFBFF" }}>
                        {bucket.items.map(req => renderCard(req, { hideSender: true }))}
                      </div>
                    )}
                  </div>
                );
              };

              const pendingGroups = groupBySender(pendingReqs);
              const inProgressGroups = groupBySender(inProgressReqs);
              const completedGroups = groupBySender(completedReqs);
              const respondedGroups = groupBySender(respondedReqs);

              const renderCard = (req, { hideSender = false } = {}) => {
                const sc = STATUS_COLORS[req.status] || STATUS_COLORS.pending;
                const isExpanded = respondingId === req.id;
                return (
                  <div key={req.id} className="cw-req-card" ref={el => reqItemRefs.current[req.id] = el} style={activeChatReqId === req.id ? { background: "#EBF3FE", borderLeft: "3px solid #1A73E8", boxShadow: "0 0 0 1px #1A73E820" } : highlightReqId === req.id ? { background: "#EBF3FE", borderLeft: "3px solid #1A73E8" } : {}}>
                    {hideSender ? (
                      // When rendered inside a person-grouped bucket, the sender name
                      // is already shown by the group header — skip the avatar+name row
                      // here and keep just the status pill + priority + timestamp.
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99, color: sc.color, background: sc.bg }}>{req.status}</span>
                        <span style={{ fontSize: 10, color: "#9AA0A6" }}>{fmtTime(req.createdAt)}</span>
                        {req.priority && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5, color: priColor[req.priority] || "#667085", background: priBg[req.priority] || "#F9FAFB", border: `1px solid ${priColor[req.priority] || "#E4E7EC"}33`, marginLeft: "auto" }}>
                            {req.priority}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="cw-req-card-head">
                        <ReqAvatar name={req.fromName || "?"} url={employees.find(e => e.employeeId === req.fromId)?.profilePicUrl || null} />
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
                    )}
                    {req.subject && <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1D21", marginBottom: 4 }}>{req.subject}</div>}
                    {req.taskId && (
                      <div className="cw-req-task-chip">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
                        {req.taskId} {req.taskTitle ? `· ${req.taskTitle}` : ""}
                      </div>
                    )}
                    <div className="cw-req-msg"><LinkedText text={req.message} isMe={false} /></div>
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
                    {/* Completion Requirements — visible to receiver throughout the lifecycle */}
                    {req.completionRequirements && (
                      <div style={{ marginTop: 6, padding: "6px 10px", background: "#FFFBEB", borderLeft: "3px solid #F59E0B", borderRadius: 6, fontSize: 11, color: "#78350F" }}>
                        <span style={{ fontWeight: 700, color: "#B45309" }}>✓ Required: </span>{req.completionRequirements}
                      </div>
                    )}
                    {/* Completion rejection reason (from sender) — shows until receiver re-submits */}
                    {req.completionRejectionReason && req.status === "in_progress" && (
                      <div style={{ marginTop: 6, padding: "6px 10px", background: "#FEF2F2", borderLeft: "3px solid #DC2626", borderRadius: 6, fontSize: 11, color: "#991B1B" }}>
                        <span style={{ fontWeight: 700 }}>✗ Previous submission rejected: </span>{req.completionRejectionReason}
                      </div>
                    )}
                    {/* Proposed date/time display on the card */}
                    {req.proposedDateTime && (
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5, padding: "5px 9px", background: "#EFF6FF", borderRadius: 6, fontSize: 11, color: "#1A73E8", fontWeight: 600, width: "fit-content" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        Proposed: {new Date(req.proposedDateTime).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                    {/* Final agreed date (after accept or suggest) */}
                    {req.finalDateTime && req.status !== "pending" && (
                      <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 5, padding: "5px 9px", background: "#F0FDF4", borderRadius: 6, fontSize: 11, color: "#16A34A", fontWeight: 700, width: "fit-content" }}>
                        ✅ Agreed: {new Date(req.finalDateTime).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {req.finalBy === "receiver_suggestion" && <span style={{ fontSize: 9, color: "#7C3AED", background: "#F5F3FF", padding: "1px 5px", borderRadius: 99, marginLeft: 4 }}>revised</span>}
                      </div>
                    )}
                    {/* Message shown with receiver's suggestion (when they suggested a new date) */}
                    {req.responseMessage && req.finalBy === "receiver_suggestion" && (
                      <div style={{ marginTop: 6, padding: "5px 9px", background: "#F5F3FF", borderRadius: 6, fontSize: 11, color: "#5B21B6", borderLeft: "3px solid #7C3AED" }}>
                        <span style={{ fontWeight: 700 }}>{req.suggestedBy}: </span>{req.responseMessage}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, justifyContent: "space-between" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {req.status === "pending" && !isExpanded && (
                          <button className="cw-req-btn cw-req-btn-resolve" onClick={() => { setRespondingId(req.id); setRespondMsg(""); }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg> Respond
                          </button>
                        )}
                        {req.status === "in_progress" && completeId !== req.id && (
                          <button onClick={() => { setCompleteId(req.id); setCompleteMsg(""); }}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 6, border: "1.5px solid #16A34A", background: "#F0FDF4", color: "#15803D", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                            Mark as Completed
                          </button>
                        )}
                        {req.status === "completion_requested" && (
                          <div style={{ fontSize: 11, color: "#7C3AED", background: "#F5F3FF", padding: "4px 10px", borderRadius: 6, fontWeight: 600, border: "1px solid #DDD6FE" }}>
                            ⏳ Waiting for sender to confirm completion…
                          </div>
                        )}
                      </div>
                      <button onClick={() => onOpenChat ? onOpenChat(req.id, req) : openChat(req.id)}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", border: "1px solid #E4E7EC", borderRadius: 6, background: activeChatReqId === req.id ? "#EBF3FE" : "#F9FAFB", color: activeChatReqId === req.id ? "#1A73E8" : "#667085", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                        Chat {chatThreads[req.id]?.length > 0 ? `(${chatThreads[req.id].length})` : ""}
                      </button>
                    </div>
                    {/* Pending — Accept As Is / Suggest New Date panel (receiver side) */}
                    {req.status === "pending" && isExpanded && (
                      <div style={{ marginTop: 8, background: "#F8FAFC", border: "1.5px solid #E4E7EC", borderRadius: 9, padding: "10px 12px" }}>
                        {/* Accept as-is */}
                        <button
                          onClick={() => handleAcceptAsIs(req.id)}
                          style={{ width: "100%", padding: "8px", borderRadius: 7, border: "1.5px solid #BBF7D0", background: "#DCFCE7", color: "#166534", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                          Accept As Is{req.proposedDateTime ? ` · ${new Date(req.proposedDateTime).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                        </button>

                        {/* Suggest new date toggle */}
                        {suggestId !== req.id ? (
                          <button
                            onClick={() => { setSuggestId(req.id); setSuggestDate(""); setSuggestTime(""); setSuggestMsg(""); }}
                            style={{ width: "100%", padding: "7px", borderRadius: 7, border: "1.5px solid #DDD6FE", background: "#F5F3FF", color: "#7C3AED", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                            Suggest New Date
                          </button>
                        ) : (
                          <div>
                            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Date *</label>
                                <input type="date" value={suggestDate} onChange={e => setSuggestDate(e.target.value)}
                                  style={{ width: "100%", padding: "6px 8px", border: "1.5px solid #DDD6FE", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Time</label>
                                <input type="time" value={suggestTime} onChange={e => setSuggestTime(e.target.value)}
                                  style={{ width: "100%", padding: "6px 8px", border: "1.5px solid #DDD6FE", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                              </div>
                            </div>
                            <textarea placeholder="Message to sender (optional)…" value={suggestMsg} onChange={e => setSuggestMsg(e.target.value)}
                              style={{ width: "100%", padding: "7px 9px", border: "1.5px solid #DDD6FE", borderRadius: 7, fontSize: 11, fontFamily: "inherit", resize: "none", minHeight: 44, outline: "none", boxSizing: "border-box", marginBottom: 6 }} />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => handleSuggestDate(req.id)} disabled={!suggestDate || suggestBusy}
                                style={{ flex: 1, padding: "7px", borderRadius: 7, border: "none", background: !suggestDate || suggestBusy ? "#E5E7EB" : "#7C3AED", color: !suggestDate || suggestBusy ? "#9CA3AF" : "#fff", fontSize: 11, fontWeight: 700, cursor: !suggestDate || suggestBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                                {suggestBusy ? "Saving…" : "Send Suggestion"}
                              </button>
                              <button onClick={() => setSuggestId(null)}
                                style={{ padding: "7px 12px", borderRadius: 7, border: "1.5px solid #E4E7EC", background: "#F9FAFB", color: "#667085", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        <button onClick={() => { setRespondingId(null); setSuggestId(null); }}
                          style={{ marginTop: 8, width: "100%", padding: "5px", borderRadius: 6, border: "1px solid #E4E7EC", background: "transparent", color: "#9AA0A6", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                          Close
                        </button>
                      </div>
                    )}
                    {/* Mark-as-completed inline panel (receiver side) */}
                    {completeId === req.id && req.status === "in_progress" && (
                      <div style={{ marginTop: 8, background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 9, padding: "10px 12px" }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: "#166534", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Completion note (optional)</label>
                        <textarea placeholder="Describe what was done…" value={completeMsg} onChange={e => setCompleteMsg(e.target.value)}
                          style={{ width: "100%", padding: "7px 9px", border: "1.5px solid #BBF7D0", borderRadius: 7, fontSize: 11, fontFamily: "inherit", resize: "none", minHeight: 44, outline: "none", boxSizing: "border-box", marginBottom: 6, background: "#fff" }} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => handleMarkCompleted(req.id)} disabled={completeBusy}
                            style={{ flex: 1, padding: "7px", borderRadius: 7, border: "none", background: completeBusy ? "#E5E7EB" : "#16A34A", color: completeBusy ? "#9CA3AF" : "#fff", fontSize: 11, fontWeight: 700, cursor: completeBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                            {completeBusy ? "Submitting…" : "Submit for Confirmation"}
                          </button>
                          <button onClick={() => { setCompleteId(null); setCompleteMsg(""); }}
                            style={{ padding: "7px 12px", borderRadius: 7, border: "1.5px solid #E4E7EC", background: "#fff", color: "#667085", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                            Cancel
                          </button>
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
                                <div style={{ maxWidth: "85%", padding: "6px 10px", borderRadius: isMe ? "10px 10px 2px 10px" : "10px 10px 10px 2px", background: isMe ? "#1A73E8" : "#F3F4F6", color: isMe ? "#fff" : "#1A1D21", fontSize: 12, lineHeight: 1.5 }}><LinkedText text={msg.text} isMe={isMe} /></div>
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
                        ) : pendingGroups.map(([sid, bucket]) =>
                          renderPersonGroup(sid, bucket, openPendingSenders, setOpenPendingSenders)
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── IN PROGRESS section ── */}
                  <div style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <button
                      onClick={() => setInProgressOpen(p => !p)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: inProgressOpen ? "#EFF6FF" : "#F8FAFC", border: "none", cursor: "pointer", fontFamily: "inherit", borderBottom: inProgressOpen ? "1px solid #BFDBFE" : "none" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1A73E8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1D21", flex: 1, textAlign: "left" }}>
                        In Progress
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#1A73E8", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 99, padding: "1px 8px", marginRight: 4 }}>
                        {inProgressReqs.length}
                      </span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: inProgressOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {inProgressOpen && (
                      <div>
                        {inProgressReqs.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "20px", color: "#9AA0A6", fontSize: 12 }}>No in-progress requests</div>
                        ) : inProgressGroups.map(([sid, bucket]) =>
                          renderPersonGroup(sid, bucket, openInProgressSenders, setOpenInProgressSenders)
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── COMPLETED section ── */}
                  <div>
                    <button
                      onClick={() => setCompletedOpen(p => !p)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: completedOpen ? "#F0FDF4" : "#F8FAFC", border: "none", cursor: "pointer", fontFamily: "inherit", borderBottom: completedOpen ? "1px solid #BBF7D0" : "none" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1D21", flex: 1, textAlign: "left" }}>
                        Completed
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 99, padding: "1px 8px", marginRight: 4 }}>
                        {completedReqs.length}
                      </span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: completedOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {completedOpen && (
                      <div>
                        {completedReqs.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "20px", color: "#9AA0A6", fontSize: 12 }}>No completed requests yet</div>
                        ) : completedGroups.map(([sid, bucket]) =>
                          renderPersonGroup(sid, bucket, openCompletedSenders, setOpenCompletedSenders)
                        )}
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
            ) : (() => {
              const sentPending = sent2.filter(r => r.status === "pending");
              const sentInProgress = sent2.filter(r =>
                r.status === "in_progress" ||
                r.status === "completion_requested" ||
                r.status === "accepted" ||        // legacy
                r.status === "date_suggested"     // legacy
              );
              const sentCompleted = sent2.filter(r =>
                r.status === "completed" ||
                r.status === "approved"           // legacy
              );

              const renderSentCard = (req) => {
                const sc = STATUS_COLORS[req.status] || STATUS_COLORS.pending;
                return (
                  <div key={req.id} className="cw-req-card" ref={el => reqItemRefs.current[req.id] = el} style={activeChatReqId === req.id ? { background: "#EBF3FE", borderLeft: "3px solid #1A73E8", boxShadow: "0 0 0 1px #1A73E820" } : highlightReqId === req.id ? { background: "#EBF3FE", borderLeft: "3px solid #1A73E8" } : {}}>
                    <div className="cw-req-card-head">
                      <ReqAvatar name={req.toName || "?"} url={employees.find(e => e.employeeId === req.toId)?.profilePicUrl || null} />
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
                    <div className="cw-req-msg"><LinkedText text={req.message} isMe={true} /></div>
                    {req.dueDate && <div style={{ fontSize: 10, color: "#D97706", marginTop: 5, fontWeight: 600 }}>⏰ Due {new Date(req.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>}
                    {req.completionRequirements && (
                      <div style={{ marginTop: 6, padding: "6px 10px", background: "#FFFBEB", borderLeft: "3px solid #F59E0B", borderRadius: 6, fontSize: 11, color: "#78350F" }}>
                        <span style={{ fontWeight: 700, color: "#B45309" }}>✓ Required: </span>{req.completionRequirements}
                      </div>
                    )}
                    {req.proposedDateTime && (
                      <div style={{ fontSize: 10, color: "#1A73E8", marginTop: 4, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        Proposed: {new Date(req.proposedDateTime).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                    {req.finalDateTime && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", marginTop: 5, display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "#F0FDF4", borderRadius: 6, width: "fit-content" }}>
                        ✅ Agreed: {new Date(req.finalDateTime).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {req.finalBy === "receiver_suggestion" && <span style={{ fontSize: 9, color: "#7C3AED", background: "#F5F3FF", padding: "1px 5px", borderRadius: 99 }}>revised by {req.suggestedBy}</span>}
                      </div>
                    )}
                    {req.responseMessage && (
                      <div style={{
                        marginTop: 8, padding: "6px 10px", background: "#F0FDF4", borderRadius: 6,
                        fontSize: 11, color: "#374151", borderLeft: `3px solid ${sc.color}`
                      }}>
                        <span style={{ fontWeight: 700, color: sc.color }}>Response: </span><LinkedText text={req.responseMessage} isMe={false} />
                      </div>
                    )}
                    {/* Receiver submitted a completion note */}
                    {req.status === "completion_requested" && req.completionMessage && (
                      <div style={{ marginTop: 8, padding: "6px 10px", background: "#F5F3FF", borderLeft: "3px solid #7C3AED", borderRadius: 6, fontSize: 11, color: "#4C1D95" }}>
                        <span style={{ fontWeight: 700 }}>Completion note: </span>{req.completionMessage}
                      </div>
                    )}
                    {/* Previous rejection reason (shows after rejecting, as a record) */}
                    {req.completionRejectionReason && req.status !== "completed" && (
                      <div style={{ marginTop: 6, padding: "6px 10px", background: "#FEF2F2", borderLeft: "3px solid #DC2626", borderRadius: 6, fontSize: 11, color: "#991B1B" }}>
                        <span style={{ fontWeight: 700 }}>✗ You rejected: </span>{req.completionRejectionReason}
                      </div>
                    )}
                    {/* Confirm / Reject completion buttons — sender side */}
                    {req.status === "completion_requested" && rejectCompleteId !== req.id && (
                      <div style={{ marginTop: 10, background: "#FAFBFF", border: "1.5px solid #DDD6FE", borderRadius: 9, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, color: "#4C1D95", fontWeight: 700, marginBottom: 6 }}>
                          {req.toName} has marked this as completed. Confirm or reject?
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => handleConfirmCompletion(req.id)}
                            style={{ flex: 1, padding: "8px", borderRadius: 7, border: "none", background: "#16A34A", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                            Confirm Complete
                          </button>
                          <button onClick={() => { setRejectCompleteId(req.id); setRejectReason(""); }}
                            style={{ padding: "8px 12px", borderRadius: 7, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            Reject
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Reject completion — reason input (sender side) */}
                    {req.status === "completion_requested" && rejectCompleteId === req.id && (
                      <div style={{ marginTop: 10, background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 9, padding: "10px 12px" }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: "#991B1B", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Reason for rejection *</label>
                        <textarea placeholder="Explain why this isn't complete yet…" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                          style={{ width: "100%", padding: "7px 9px", border: "1.5px solid #FECACA", borderRadius: 7, fontSize: 11, fontFamily: "inherit", resize: "none", minHeight: 52, outline: "none", boxSizing: "border-box", marginBottom: 6, background: "#fff" }} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => handleRejectCompletion(req.id)} disabled={!rejectReason.trim() || rejectBusy}
                            style={{ flex: 1, padding: "7px", borderRadius: 7, border: "none", background: !rejectReason.trim() || rejectBusy ? "#E5E7EB" : "#DC2626", color: !rejectReason.trim() || rejectBusy ? "#9CA3AF" : "#fff", fontSize: 11, fontWeight: 700, cursor: !rejectReason.trim() || rejectBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                            {rejectBusy ? "Sending…" : "Send Rejection"}
                          </button>
                          <button onClick={() => { setRejectCompleteId(null); setRejectReason(""); }}
                            style={{ padding: "7px 12px", borderRadius: 7, border: "1.5px solid #E4E7EC", background: "#fff", color: "#667085", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                            Cancel
                          </button>
                        </div>
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
                                  <LinkedText text={msg.text} isMe={isMe} />
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
              };

              return (
                <>
                  {/* ── PENDING section ── */}
                  <div style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <button
                      onClick={() => setSentPendingOpen(p => !p)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: sentPendingOpen ? "#FEF3C7" : "#F8FAFC", border: "none", cursor: "pointer", fontFamily: "inherit", borderBottom: sentPendingOpen ? "1px solid #FDE68A" : "none" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1D21", flex: 1, textAlign: "left" }}>
                        Pending Requests
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: sentPending.length > 0 ? "#D97706" : "#9AA0A6", background: sentPending.length > 0 ? "#FEF3C7" : "#F1F5F9", border: `1px solid ${sentPending.length > 0 ? "#FDE68A" : "#E2E8F0"}`, borderRadius: 99, padding: "1px 8px", marginRight: 4 }}>
                        {sentPending.length}
                      </span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: sentPendingOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {sentPendingOpen && (
                      <div>
                        {sentPending.length === 0
                          ? <div style={{ textAlign: "center", padding: "20px", color: "#9AA0A6", fontSize: 12 }}>No pending requests</div>
                          : sentPending.map(renderSentCard)}
                      </div>
                    )}
                  </div>

                  {/* ── IN PROGRESS section ── */}
                  <div style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <button
                      onClick={() => setSentInProgressOpen(p => !p)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: sentInProgressOpen ? "#EFF6FF" : "#F8FAFC", border: "none", cursor: "pointer", fontFamily: "inherit", borderBottom: sentInProgressOpen ? "1px solid #BFDBFE" : "none" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1A73E8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1D21", flex: 1, textAlign: "left" }}>
                        In Progress
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#1A73E8", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 99, padding: "1px 8px", marginRight: 4 }}>
                        {sentInProgress.length}
                      </span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: sentInProgressOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {sentInProgressOpen && (
                      <div>
                        {sentInProgress.length === 0
                          ? <div style={{ textAlign: "center", padding: "20px", color: "#9AA0A6", fontSize: 12 }}>No in-progress requests</div>
                          : sentInProgress.map(renderSentCard)}
                      </div>
                    )}
                  </div>

                  {/* ── COMPLETED section ── */}
                  <div>
                    <button
                      onClick={() => setSentCompletedOpen(p => !p)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: sentCompletedOpen ? "#F0FDF4" : "#F8FAFC", border: "none", cursor: "pointer", fontFamily: "inherit", borderBottom: sentCompletedOpen ? "1px solid #BBF7D0" : "none" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1D21", flex: 1, textAlign: "left" }}>
                        Completed
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 99, padding: "1px 8px", marginRight: 4 }}>
                        {sentCompleted.length}
                      </span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: sentCompletedOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {sentCompletedOpen && (
                      <div>
                        {sentCompleted.length === 0
                          ? <div style={{ textAlign: "center", padding: "20px", color: "#9AA0A6", fontSize: 12 }}>No completed requests yet</div>
                          : sentCompleted.map(renderSentCard)}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
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
    status: <><circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3" /><circle cx="12" cy="12" r="3" /><path d="M6.3 6.3a8 8 0 000 11.4M17.7 17.7a8 8 0 000-11.4M3.5 3.5a12 12 0 000 17M20.5 20.5a12 12 0 000-17" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
    bell: <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></>,
    search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    sop: <><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" /></>,
  };
  return <svg {...s}>{icons[name]}</svg>;
}

export default function CoworkingShell({ role, employeeName, employeeId, title, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { notifications, unread, unreadDm, markRead, markSectionRead } = useCoworkNotifications(employeeId || "");

  // ── In-app notification toast — shows when app is open ───────────────────
  useEffect(() => {
    const handler = (e) => {
      const { title, body, url, type } = e.detail || {};
      setNotifToast({ title, body, url, type });
      setTimeout(() => setNotifToast(null), 4500);
    };
    window.addEventListener("cowork:notification", handler);
    return () => window.removeEventListener("cowork:notification", handler);
  }, []);

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

  // ── SOP Pending Recheck count (TL/CEO only) ───────────────────────────────
  const [pendingRecheckCount, setPendingRecheckCount] = React.useState(0);
  useEffect(() => {
    if (!employeeId || !["ceo", "tl"].includes(role)) return;
    const load = async () => {
      try {
        const token = await firebaseAuth.currentUser?.getIdToken();
        const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const res = await fetch(`${BASE}/cowork/sop/recheck/pending-count`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) setPendingRecheckCount(data.count || 0);
      } catch (e) { console.error("recheck count:", e); }
    };
    load();
    // Refresh every 60 seconds
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [employeeId, role]);

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
          if (grpCountMap[gid] !== undefined) return; // already listening
          grpCountMap[gid] = 0;
          const unsub = onSnapshot(
            query(collection(firebaseDb, "cowork_groups", gid, "messages"), orderBy("createdAt", "asc"), limit(100)),
            msgSnap => {
              grpCountMap[gid] = msgSnap.docs.filter(d => {
                const data = d.data();
                // Only count messages from others that haven't been read by me
                return data.senderId !== employeeId && !(data.readBy || []).includes(employeeId);
              }).length;
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
  // ── Own profile picture — live Firestore listener ────────────────────────
  useEffect(() => {
    if (!employeeId) return;
    const unsub = onSnapshot(doc(firebaseDb, "cowork_employees", employeeId), (snap) => {
      if (snap.exists()) setOwnProfilePicUrl(snap.data().profilePicUrl || "");
    });
    return () => unsub();
  }, [employeeId]);

  // ── Auth toasts (login success) ──────────────────────────────────────────
  const [authToast, setAuthToast] = useState(null); // { type: "login"|"logout", name }
  const [notifToast, setNotifToast] = useState(null); // { title, body, url, type }
  const [fcmUpdateBanner, setFcmUpdateBanner] = useState(false);

  // Listen for FCM token update event
  useEffect(() => {
    const handler = () => {
      setFcmUpdateBanner(true);
      setTimeout(() => setFcmUpdateBanner(false), 5000);
    };
    window.addEventListener("cowork:fcm-token-updated", handler);
    return () => window.removeEventListener("cowork:fcm-token-updated", handler);
  }, []);
  useEffect(() => {
    const name = sessionStorage.getItem("cowork_login_toast");
    if (name !== null) {
      sessionStorage.removeItem("cowork_login_toast");
      setAuthToast({ type: "login", name: name || "Welcome back" });
      setTimeout(() => setAuthToast(null), 3500);
    }
  }, []);

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

  // ── Own profile picture — live listener so it updates instantly after upload ──
  const [ownProfilePicUrl, setOwnProfilePicUrl] = useState("");
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
  const [reqPanelContext, setReqPanelContext] = useState(null);
  const [reqPanelThreadContext, setReqPanelThreadContext] = useState(null);
  const [reqPanelOpenRespondId, setReqPanelOpenRespondId] = useState(null);
  const [highlightReqId, setHighlightReqId] = useState(null);

  // ── SOP / My Managers panel state ────────────────────────────────────────
  const [sopPanelOpen, setSopPanelOpen] = useState(false);
  const [managersData, setManagersData] = useState(null);   // { primaryManager, secondaryManager }
  const [managersLoading, setManagersLoading] = useState(false);
  const [managersError, setManagersError] = useState("");

  const openSopPanel = async () => {
    setSopPanelOpen(true);
    if (managersData) return; // already loaded
    setManagersLoading(true);
    setManagersError("");
    try {
      const { firebaseAuth } = await import("../../../lib/coworkFirebase");
      const token = await firebaseAuth.currentUser?.getIdToken();
      const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${BASE}/cowork/employee/my-managers/${employeeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setManagersData({ primaryManager: data.primaryManager, secondaryManager: data.secondaryManager });
      else setManagersError(data.message || "Failed to load manager info");
    } catch (e) {
      setManagersError("Could not fetch manager details.");
    } finally {
      setManagersLoading(false);
    }
  };

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
  const [mailExpanded, setMailExpanded] = React.useState(false);
  const [tasksExpanded, setTasksExpanded] = React.useState(false);

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard", path: "/coworking" },
    { id: "tasks", label: "Tasks", icon: "tasks", path: "/coworking/tasks" },
    { id: "messages", label: "Messages", icon: "messages", path: "/coworking/direct-messages" },
    { id: "groups", label: "Groups", icon: "groups", path: "/coworking/create-group" },
    { id: "mail", label: "Mail", icon: "mail", path: "/coworking/mail" },
    { id: "meetings", label: "Meetings", icon: "meetings", path: "/coworking/schedule-meet" },
    ...(isCEO ? [{ id: "employees", label: "Employees", icon: "employees", path: "/coworking/create-employee" }] : []),
    ...((isCEO || isTL) ? [{ id: "status", label: "Live Status", icon: "status", path: "/coworking/status-tracking" }] : []),
    { id: "calendar", label: "Calendar", icon: "calendar", path: "/coworking/calendar" },
    { id: "sop", label: "SOP", icon: "sop", path: "/coworking/sop" },
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
      sessionStorage.setItem("cowork_logout_toast", "1");
      router.push("/");
    } catch (e) {
      console.error("Sign out error:", e);
    }
  };

  const initials = (name = "") => name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  const roleLabel = isCEO ? "Admin" : isTL ? "Team Lead" : "Employee";

  return (
    <>
      {/* ── FCM Token Update Banner ── */}
      {fcmUpdateBanner && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 99999, background: "#7C3AED", color: "#fff",
          borderRadius: 10, padding: "10px 20px",
          fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
          display: "flex", alignItems: "center", gap: 10,
          animation: "slideDown 0.3s ease",
        }}>
          <span>🔔</span>
          <span>Notifications updated — you&apos;re all set!</span>
          <button onClick={() => setFcmUpdateBanner(false)} style={{
            background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
            borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 12,
          }}>✕</button>
        </div>
      )}

      {/* ── In-app notification toast — bottom right ── */}
      {notifToast && (
        <div
          onClick={() => { if (notifToast.url) { window.location.href = notifToast.url; } setNotifToast(null); }}
          style={{
            position: "fixed", bottom: "env(safe-area-inset-bottom, 24px)", right: 16, zIndex: 9999,
            background: "#1E293B", color: "#fff", borderRadius: 12,
            padding: "12px 16px", maxWidth: "min(320px, calc(100vw - 32px))", minWidth: 260,
            boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
            cursor: notifToast.url ? "pointer" : "default",
            display: "flex", alignItems: "flex-start", gap: 10,
            animation: "slideInRight 0.25s ease",
            borderLeft: "4px solid #7C3AED",
          }}
        >
          <style>{`@keyframes slideInRight { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }`}</style>
          <div style={{ fontSize: 20, flexShrink: 0 }}>
            {notifToast.type === "direct_message" ? "💬" : notifToast.type === "task_assigned" ? "📋" : notifToast.type === "group_message" ? "👥" : "🔔"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{notifToast.title}</div>
            <div style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{notifToast.body}</div>
          </div>
          <button onClick={e => { e.stopPropagation(); setNotifToast(null); }} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 16, padding: 0, flexShrink: 0 }}>✕</button>
        </div>
      )}

      {/* ── Login success toast — top right ── */}
      {authToast && (
        <div style={{
          position: "fixed", top: 20, right: 24, zIndex: 99999,
          background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
          color: "#fff", padding: "14px 20px", borderRadius: 16,
          fontSize: 13, fontWeight: 600,
          boxShadow: "0 12px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", gap: 12, maxWidth: 320,
          animation: "authToastIn 0.35s cubic-bezier(0.2,0,0,1)",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg, #22C55E, #16A34A)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>✓</div>
          <div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>Logged in successfully</div>
            <div style={{ fontSize: 14 }}>
              Welcome back{authToast.name ? `, ${authToast.name.split(" ")[0]}` : ""}! 👋
            </div>
          </div>
          <button onClick={() => setAuthToast(null)}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 2 }}>
            ✕
          </button>
        </div>
      )}
      <style>{`
        @keyframes newBadgePulse {
          0%, 100% { transform: scale(1); box-shadow: 0 1px 4px rgba(239,68,68,0.4); }
          50% { transform: scale(1.12); box-shadow: 0 2px 8px rgba(239,68,68,0.7); }
        }
        @keyframes authToastIn {
          from { opacity: 0; transform: translateX(60px) scale(0.92); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>

      {/* Global incoming call toast — works on every page */}
      {employeeId && <IncomingCallToast employeeId={employeeId} />}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');

        .cw-shell {
          display: flex;
          height: 100dvh;
          min-height: 100dvh;
          min-width: 320px;
          overflow: hidden;
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #F0F2F5;
        }
        /* Fallback for browsers without dvh */
        @supports not (height: 100dvh) {
          .cw-shell { height: 100vh; min-height: 100vh; }
        }

        /* ── Sidebar ── */
        .cw-sidebar {
          width: 240px;
          min-width: 240px;
          height: 100dvh;
          background: #FFFFFF;
          border-right: 1px solid #E4E7EC;
          display: flex;
          flex-direction: column;
          z-index: 100;
          transition: width 0.2s ease, min-width 0.2s ease;
        }
        @supports not (height: 100dvh) {
          .cw-sidebar { height: 100vh; }
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
          min-height: 0;
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
          /* Inner list pane: stop forcing 480px — fill the panel */
          .cw-req-panel-left {
            width: 100% !important;
            min-width: 0 !important;
          }
          /* When a chat is opened, hide the list and show the chat full-width.
             (On desktop they sit side-by-side at 820px total.) */
          .cw-req-panel.chat-open { width: 100vw; }
          .cw-req-panel.chat-open .cw-req-panel-left { display: none; }
          .cw-req-panel.chat-open .cw-req-panel-chat { flex: 1; }

          /* Slightly tighter header padding so close button sits comfortably */
          .cw-req-panel-head { padding: 14px 14px; }
          /* Make close button bigger and more tappable on mobile */
          .cw-req-panel-close {
            width: 34px; height: 34px; border-radius: 8px;
          }
        }

        

        @media (max-width: 768px) {
          .cw-sidebar {
            position: fixed;
            left: -260px;
            top: 0;
            height: 100dvh;
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
            {NAV.map(item => {
              if (item.id === "tasks") return (
                <div key="tasks-group">
                  <div className={`cw-nav-item${isActive(item.path) ? " active" : ""}`} style={{ userSelect: "none" }}>
                    <NavIcon name={item.icon} size={18} />
                    <span style={{ flex: 1 }} onClick={() => handleNav(item.path)}>Tasks</span>
                    {taskChatUnreadCount > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: "#8B5CF6", padding: "1px 6px", borderRadius: 99, flexShrink: 0, marginRight: 4 }}>
                        {taskChatUnreadCount > 99 ? "99+" : taskChatUnreadCount}
                      </span>
                    )}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      onClick={e => { e.stopPropagation(); setTasksExpanded(v => !v); }}
                      style={{ transition: "transform 0.2s", transform: tasksExpanded ? "rotate(180deg)" : "rotate(0deg)", opacity: 0.7, flexShrink: 0, cursor: "pointer", padding: 2 }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                  {tasksExpanded && (
                    <div
                      onClick={() => { router.push("/coworking/tasks?filter=goal"); if (isMobile) setMobileOpen(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px 7px 44px", cursor: "pointer", borderRadius: 8, margin: "1px 8px", fontSize: 13, fontWeight: 500, color: "#7E22CE", transition: "background 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--cw-hover)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{ fontSize: 14, flexShrink: 0 }}>🎯</span>
                      <span>Goal Tasks</span>
                    </div>
                  )}
                </div>
              );
              if (item.id === "mail") return (
                <div key="mail-group">
                  <div
                    className={`cw-nav-item${isActive(item.path) ? " active" : ""}`}
                    onClick={() => { handleNav(item.path); setMailExpanded(e => !e); }}
                    style={{ userSelect: "none" }}
                  >
                    <NavIcon name={item.icon} size={18} />
                    <span style={{ flex: 1 }}>Mail</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transition: "transform 0.2s", transform: mailExpanded ? "rotate(180deg)" : "rotate(0deg)", opacity: 0.5, flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                  {mailExpanded && (
                    <div
                      onClick={() => { router.push("/coworking/mail/gmail"); if (isMobile) setMobileOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "7px 14px 7px 44px", cursor: "pointer",
                        borderRadius: 8, margin: "1px 8px",
                        fontSize: 13, fontWeight: 500,
                        color: "var(--cw-text-2)",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--cw-hover)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      <span>My Gmail</span>
                    </div>
                  )}
                </div>
              );
              return (

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
                      item.id === "messages" ? dmUnreadCount
                        : item.id === "groups" ? groupUnreadCount
                          : item.id === "tasks" ? taskChatUnreadCount
                            : item.id === "meetings" ? meetingUnreadCount
                              : item.id === "sop" ? pendingRecheckCount
                                : 0;

                    // NEW badge on Settings — only when no profile pic uploaded yet
                    if (item.id === "settings" && !ownProfilePicUrl) return (
                      <span style={{
                        fontSize: 8, fontWeight: 900, color: "#FACC15",
                        background: "#DC2626",
                        padding: "2px 6px", borderRadius: 99,
                        letterSpacing: "0.06em",
                        boxShadow: "0 0 0 1.5px #fff, 0 2px 6px rgba(220,38,38,0.5)",
                        animation: "newBadgePulse 1.8s ease-in-out infinite",
                        textTransform: "uppercase",
                      }}>NEW!</span>
                    );

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
              );
            })}

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
              {ownProfilePicUrl ? (
                <img src={ownProfilePicUrl} alt={employeeName}
                  className="cw-user-avatar"
                  style={{ objectFit: "cover", border: "2px solid rgba(255,255,255,0.2)" }} />
              ) : (
                <div className="cw-user-avatar">{initials(employeeName)}</div>
              )}
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

              {/* SOP button removed from topbar — accessible via sidebar only */}

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

              <div className="cw-topbar-avatar" title={employeeName}
                style={{ overflow: "hidden", padding: 0 }}>
                {ownProfilePicUrl ? (
                  <img src={ownProfilePicUrl} alt={employeeName}
                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                ) : initials(employeeName)}
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
                            <LinkedText text={msg.text} isMe={isMe} />
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

      {/* ── SOP / My Managers Sidebar Panel ── */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 499, display: sopPanelOpen ? "block" : "none" }}
        onClick={() => setSopPanelOpen(false)}
      />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 380, maxWidth: "100vw",
        background: "#fff", borderLeft: "1px solid #E4E7EC",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.12)", zIndex: 500,
        display: "flex", flexDirection: "column",
        transform: sopPanelOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        fontFamily: "inherit",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid #E4E7EC", background: "#EBF3FE", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "#1A73E8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1D21" }}>My Managers</div>
              <div style={{ fontSize: 10, color: "#6B7280", marginTop: 1 }}>Primary &amp; Secondary reporting managers</div>
            </div>
          </div>
          <button onClick={() => setSopPanelOpen(false)}
            style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #D0D5DD", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#667085" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
          {managersLoading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "48px 0", color: "#9AA0A6" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1A73E8" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
              <span style={{ fontSize: 13 }}>Fetching manager details…</span>
            </div>
          )}

          {managersError && (
            <div style={{ padding: "12px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 12, color: "#DC2626" }}>
              {managersError}
            </div>
          )}

          {!managersLoading && !managersError && managersData && (
            <>
              {/* Primary Manager Card */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                  Primary Manager
                </div>
                {managersData.primaryManager ? (
                  <div style={{ border: "1px solid #BFDBFE", borderRadius: 10, overflow: "hidden", background: "#F0F7FF" }}>
                    <div style={{ background: "#1A73E8", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                      {managersData.primaryManager.profilePhotoUrl ? (
                        <img src={managersData.primaryManager.profilePhotoUrl} alt={managersData.primaryManager.name}
                          style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.4)", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                          {managersData.primaryManager.name?.[0]?.toUpperCase() || "?"}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{managersData.primaryManager.name}</div>
                        {managersData.primaryManager.designation && (
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>{managersData.primaryManager.designation}</div>
                        )}
                      </div>
                    </div>
                    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {managersData.primaryManager.department && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#374151" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                          <span style={{ color: "#6B7280", minWidth: 72 }}>Department</span>
                          <span style={{ fontWeight: 600 }}>{managersData.primaryManager.department}</span>
                        </div>
                      )}
                      {managersData.primaryManager.phone && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#374151" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.06 1.2 2 2 0 012.03 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z" /></svg>
                          <span style={{ color: "#6B7280", minWidth: 72 }}>Phone</span>
                          <a href={`tel:${managersData.primaryManager.phone}`} style={{ fontWeight: 600, color: "#1A73E8", textDecoration: "none" }}>{managersData.primaryManager.phone}</a>
                        </div>
                      )}
                      {managersData.primaryManager.email && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#374151" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                          <span style={{ color: "#6B7280", minWidth: 72 }}>Email</span>
                          <a href={`mailto:${managersData.primaryManager.email}`} style={{ fontWeight: 600, color: "#1A73E8", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{managersData.primaryManager.email}</a>
                        </div>
                      )}
                      {managersData.primaryManager.biometricId && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></svg>
                          <span style={{ color: "#6B7280", minWidth: 72 }}>Employee ID</span>
                          <code style={{ fontFamily: "monospace", fontWeight: 700, color: "#374151", background: "#E5E7EB", padding: "1px 6px", borderRadius: 4 }}>{managersData.primaryManager.biometricId}</code>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "16px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, fontSize: 12, color: "#9AA0A6", textAlign: "center" }}>
                    No primary manager assigned
                  </div>
                )}
              </div>

              {/* Secondary Manager Card */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                  Secondary Manager
                </div>
                {managersData.secondaryManager ? (
                  <div style={{ border: "1px solid #C4B5FD", borderRadius: 10, overflow: "hidden", background: "#FAF5FF" }}>
                    <div style={{ background: "#7C3AED", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                      {managersData.secondaryManager.profilePhotoUrl ? (
                        <img src={managersData.secondaryManager.profilePhotoUrl} alt={managersData.secondaryManager.name}
                          style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.4)", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                          {managersData.secondaryManager.name?.[0]?.toUpperCase() || "?"}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{managersData.secondaryManager.name}</div>
                        {managersData.secondaryManager.designation && (
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>{managersData.secondaryManager.designation}</div>
                        )}
                      </div>
                    </div>
                    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {managersData.secondaryManager.department && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#374151" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                          <span style={{ color: "#6B7280", minWidth: 72 }}>Department</span>
                          <span style={{ fontWeight: 600 }}>{managersData.secondaryManager.department}</span>
                        </div>
                      )}
                      {managersData.secondaryManager.phone && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.06 1.2 2 2 0 012.03 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z" /></svg>
                          <span style={{ color: "#6B7280", minWidth: 72 }}>Phone</span>
                          <a href={`tel:${managersData.secondaryManager.phone}`} style={{ fontWeight: 600, color: "#7C3AED", textDecoration: "none" }}>{managersData.secondaryManager.phone}</a>
                        </div>
                      )}
                      {managersData.secondaryManager.email && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                          <span style={{ color: "#6B7280", minWidth: 72 }}>Email</span>
                          <a href={`mailto:${managersData.secondaryManager.email}`} style={{ fontWeight: 600, color: "#7C3AED", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{managersData.secondaryManager.email}</a>
                        </div>
                      )}
                      {managersData.secondaryManager.biometricId && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></svg>
                          <span style={{ color: "#6B7280", minWidth: 72 }}>Employee ID</span>
                          <code style={{ fontFamily: "monospace", fontWeight: 700, color: "#374151", background: "#EDE9FE", padding: "1px 6px", borderRadius: 4 }}>{managersData.secondaryManager.biometricId}</code>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "16px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, fontSize: 12, color: "#9AA0A6", textAlign: "center" }}>
                    No secondary manager assigned
                  </div>
                )}
              </div>
            </>
          )}

          {!managersLoading && !managersError && !managersData && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#9AA0A6", fontSize: 13 }}>No data loaded yet.</div>
          )}
        </div>
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