/**
 * FILE: components/coworking/dashboard/ReceivedRequests.jsx
 * 
 * ✅ FIXED: Removed orderBy("createdAt") to avoid Firestore composite index error.
 *    Data is sorted client-side instead.
 * 
 * Shows on dashboard — requests sent TO the logged-in user.
 * They can Resolve or Reject with a message.
 * Response is saved to Firestore + posted in task chat.
 */
"use client";
import { useState, useEffect } from "react";
import { firebaseDb } from "../../../lib/coworkFirebase";
import {
  collection, doc, updateDoc, serverTimestamp,
  query, where, onSnapshot, setDoc,
} from "firebase/firestore";

// ── Post response to task chat ────────────────────────────────────────────────
async function postResponseToChat(taskId, senderId, senderName, text) {
  try {
    const msgId = crypto.randomUUID();
    const msgsRef = collection(firebaseDb, "cowork_tasks", taskId, "chat");
    await setDoc(doc(msgsRef, msgId), {
      messageId: msgId, taskId,
      senderId, senderName,
      text, attachments: [],
      messageType: "system",
      mention: null,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(firebaseDb, "cowork_tasks", taskId), {
      lastChatAt: serverTimestamp(),
      lastChatPreview: text,
      updatedAt: serverTimestamp(),
    });
  } catch (e) { console.error("postResponseToChat:", e); }
}


// ── Single request card ───────────────────────────────────────────────────────
function RequestCard({ req, currentEmployeeId, currentEmployeeName }) {
  const [open, setOpen] = useState(false);
  const [responseMsg, setResponseMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const handleRespond = async (action) => {
    setBusy(true);
    try {
      const reqRef = doc(firebaseDb, "cowork_requests", req.requestId);
      const status = action === "resolve" ? "resolved" : "rejected";
      await updateDoc(reqRef, {
        status,
        responseMessage: responseMsg.trim(),
        respondedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const verb = action === "resolve" ? "✅ Resolved" : "❌ Rejected";
      const chatText = `${verb} request from ${req.fromName}: "${req.message}"${responseMsg.trim() ? ` → "${responseMsg.trim()}"` : ""}`;
      await postResponseToChat(req.taskId, currentEmployeeId, currentEmployeeName, chatText);
      setDone(true);
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  };

  if (done) return null;

  const ts = req.createdAt?.seconds
    ? new Date(req.createdAt.seconds * 1000)
    : req.createdAt ? new Date(req.createdAt) : new Date();
  const timeStr = ts.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const dateStr = ts.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <div style={cardStyle}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#EA4335", borderRadius: "10px 0 0 10px" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={fromBadge}>{req.fromName}</span>
            <span style={{ fontSize: 10, color: "#9AA0A6" }}>→</span>
            <span style={taskBadge}>{req.taskTitle || req.taskId}</span>
            <span style={{ fontSize: 9, fontFamily: "monospace", color: "#9AA0A6" }}>{dateStr} {timeStr}</span>
          </div>
          <div style={{ fontSize: 13, color: "#202124", fontWeight: 500, lineHeight: 1.5 }}>
            "{req.message}"
          </div>
        </div>
        <span style={urgentBadge}>🔴 Urgent</span>
      </div>

      {!open ? (
        <button onClick={() => setOpen(true)} style={respondBtn}>
          💬 Respond
        </button>
      ) : (
        <div style={{ marginTop: 8 }}>
          <textarea
            style={responseTa}
            value={responseMsg}
            onChange={e => setResponseMsg(e.target.value)}
            placeholder="Type your response (optional)..."
            rows={2}
            autoFocus
          />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={() => handleRespond("resolve")} disabled={busy} style={resolveBtn}>
              {busy ? "..." : "✅ Resolve"}
            </button>
            <button onClick={() => handleRespond("reject")} disabled={busy} style={rejectBtn}>
              {busy ? "..." : "❌ Reject"}
            </button>
            <button onClick={() => setOpen(false)} style={cancelSmBtn}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ReceivedRequests({ employeeId, employeeName }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;

    // ✅ NO orderBy here — avoids composite index error.
    // We sort client-side instead.
    const q = query(
      collection(firebaseDb, "cowork_requests"),
      where("toId", "==", employeeId),
      where("status", "==", "pending"),
    );

    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs
        .map(d => ({ ...d.data(), requestId: d.id }))
        .sort((a, b) => {
          const ta = a.createdAt?.seconds ?? 0;
          const tb = b.createdAt?.seconds ?? 0;
          return tb - ta; // newest first
        });
      setRequests(docs);
      setLoading(false);
    }, err => {
      console.error("ReceivedRequests listener error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [employeeId]);

  if (loading) return null;
  if (requests.length === 0) return null;

  return (
    <div style={sectionWrap}>
      <div style={sectionHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={iconBox}>📩</div>
          <div>
            <h2 style={titleSt}>Received Requests</h2>
            <p style={subSt}>{requests.length} pending · needs your response</p>
          </div>
        </div>
        <span style={countBadge}>{requests.length}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {requests.map(req => (
          <RequestCard
            key={req.requestId}
            req={req}
            currentEmployeeId={employeeId}
            currentEmployeeName={employeeName}
          />
        ))}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const sectionWrap = {
  background: "#fff", borderRadius: 14, padding: "15px 16px",
  border: "1px solid #E8EAED", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  marginBottom: 12,
};
const sectionHeader = {
  display: "flex", justifyContent: "space-between",
  alignItems: "flex-start", marginBottom: 12, gap: 8,
};
const iconBox = {
  width: 30, height: 30, borderRadius: 8,
  background: "linear-gradient(135deg,#FEE2E2,#F5C6C2)",
  border: "1px solid rgba(239,68,68,0.2)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 14, flexShrink: 0,
};
const titleSt = { margin: 0, fontSize: 13, fontWeight: 700, color: "#202124", letterSpacing: "-0.01em" };
const subSt = { margin: "2px 0 0", fontSize: 10, color: "#EA4335", fontWeight: 600 };
const countBadge = {
  fontSize: 11, fontWeight: 800, color: "#D93025",
  background: "#FCE8E6", border: "1px solid #F5C6C2",
  padding: "2px 10px", borderRadius: 99,
};
const cardStyle = {
  position: "relative", padding: "10px 12px 10px 16px",
  background: "#FFFBFB", borderRadius: 10,
  border: "1px solid #F5C6C2",
  overflow: "hidden",
};
const fromBadge = {
  fontSize: 11, fontWeight: 700, color: "#1A73E8",
  background: "#EFF6FF", padding: "1px 7px", borderRadius: 99,
};
const taskBadge = {
  fontSize: 10, fontWeight: 600, color: "#3C4043",
  background: "#F1F3F4", padding: "1px 6px", borderRadius: 5,
  maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const urgentBadge = {
  fontSize: 9, fontWeight: 700, color: "#D93025",
  background: "#FCE8E6", padding: "2px 8px", borderRadius: 99,
  flexShrink: 0, whiteSpace: "nowrap",
};
const respondBtn = {
  padding: "5px 14px", background: "#EFF6FF",
  border: "1px solid #BFDBFE", borderRadius: 7,
  color: "#1A73E8", fontSize: 11, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
};
const responseTa = {
  width: "100%", padding: "7px 10px",
  border: "1.5px solid #E8EAED", borderRadius: 8,
  fontSize: 12, fontFamily: "inherit", outline: "none",
  boxSizing: "border-box", resize: "none", background: "#F8F9FA",
};
const resolveBtn = {
  padding: "5px 14px", background: "#1E8E3E",
  border: "none", borderRadius: 7,
  color: "#fff", fontSize: 11, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
};
const rejectBtn = {
  padding: "5px 14px", background: "#D93025",
  border: "none", borderRadius: 7,
  color: "#fff", fontSize: 11, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
};
const cancelSmBtn = {
  padding: "5px 12px", background: "transparent",
  border: "1px solid #E8EAED", borderRadius: 7,
  color: "#5F6368", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
};