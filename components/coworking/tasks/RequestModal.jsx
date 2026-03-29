/**
 * NEW FILE: components/coworking/tasks/RequestModal.jsx
 * 
 * Circle "R" Request button modal.
 * - Any user (CEO/TL/Employee) can send a request from any task/subtask
 * - Recipient sees it on dashboard as urgent
 * - Resolve / Reject from dashboard
 * - All conversation appears in task chat section
 */
"use client";
import { useState, useEffect, useRef } from "react";
import { firebaseDb, firebaseAuth } from "../../../lib/coworkFirebase";
import {
  collection, doc, setDoc, addDoc, updateDoc,
  serverTimestamp, getDocs, query, where, orderBy,
} from "firebase/firestore";

// ── fetch all employees for "Send to" dropdown ──────────────────────────────
async function fetchAllEmployees(excludeId) {
  const snap = await getDocs(collection(firebaseDb, "cowork_employees"));
  const emps = [];
  snap.forEach(d => {
    const emp = d.data();
    if (emp.employeeId && emp.employeeId !== excludeId) {
      emps.push({ employeeId: emp.employeeId, name: emp.name, role: emp.role, department: emp.department });
    }
  });
  return emps;
}

// ── post to task chat ────────────────────────────────────────────────────────
async function postToTaskChat(taskId, senderId, senderName, text) {
  try {
    const msgId = crypto.randomUUID();
    const msgsRef = collection(firebaseDb, "cowork_tasks", taskId, "chat");
    const taskRef = doc(firebaseDb, "cowork_tasks", taskId);
    await setDoc(doc(msgsRef, msgId), {
      messageId: msgId, taskId,
      senderId, senderName,
      text, attachments: [],
      messageType: "system",
      mention: null,
      createdAt: serverTimestamp(),
    });
    await updateDoc(taskRef, {
      chatMessageCount: (await (async () => { try { const s = await import("firebase/firestore").then(m => m.getDoc(taskRef)); return (s.data()?.chatMessageCount || 0) + 1; } catch { return 1; } })()),
      lastChatAt: serverTimestamp(),
      lastChatPreview: text,
      updatedAt: serverTimestamp(),
    });
  } catch (e) { console.error("postToTaskChat:", e); }
}

export default function RequestModal({ taskId, taskTitle, onClose, currentEmployeeId, currentEmployeeName }) {
  const [employees, setEmployees] = useState([]);
  const [toId, setToId] = useState("");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const textRef = useRef(null);

  useEffect(() => {
    fetchAllEmployees(currentEmployeeId)
      .then(setEmployees)
      .catch(e => setError("Could not load employees: " + e.message));
    setTimeout(() => textRef.current?.focus(), 100);
  }, [currentEmployeeId]);

  const handleSend = async () => {
    if (!toId) { setError("Select a recipient."); return; }
    if (!msg.trim()) { setError("Type a message."); return; }
    setError(""); setSending(true);
    try {
      const reqId = crypto.randomUUID();
      // Save request to Firestore cowork_requests collection
      await setDoc(doc(firebaseDb, "cowork_requests", reqId), {
        requestId: reqId,
        taskId, taskTitle,
        fromId: currentEmployeeId,
        fromName: currentEmployeeName,
        toId,
        message: msg.trim(),
        status: "pending", // "pending" | "resolved" | "rejected"
        responseMessage: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Post in task chat so everyone in the task can see
      const toEmp = employees.find(e => e.employeeId === toId);
      await postToTaskChat(
        taskId,
        currentEmployeeId,
        currentEmployeeName,
        `📩 Request to ${toEmp?.name || toId}: "${msg.trim()}"`
      );

      setSent(true);
    } catch (e) { setError(e.message); }
    finally { setSending(false); }
  };

  const empLabel = (emp) => {
    if (emp.role === "tl" && emp.department) return `${emp.name} (${emp.department} TL)`;
    if (emp.role === "ceo") return `${emp.name} (CEO)`;
    return emp.name;
  };

  return (
    <div style={ov} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={md}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={circleR}>R</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#202124" }}>Send Request</div>
              <div style={{ fontSize: 11, color: "#5F6368", marginTop: 1 }}>
                Task: <span style={{ fontWeight: 600, color: "#1A73E8" }}>{taskTitle}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {sent ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1E8E3E", marginBottom: 4 }}>Request Sent!</div>
            <div style={{ fontSize: 12, color: "#5F6368", marginBottom: 16 }}>
              The recipient will see this on their dashboard.
            </div>
            <button onClick={onClose} style={sendBtnStyle}>Close</button>
          </div>
        ) : (
          <>
            {error && <div style={errBox}>⚠️ {error}</div>}

            {/* Send To */}
            <div style={fieldWrap}>
              <label style={lbl}>Send To *</label>
              <select style={inputSt} value={toId} onChange={e => setToId(e.target.value)}>
                <option value="">Select person...</option>
                {employees.map(emp => (
                  <option key={emp.employeeId} value={emp.employeeId}>
                    {empLabel(emp)}
                  </option>
                ))}
              </select>
            </div>

            {/* Message */}
            <div style={fieldWrap}>
              <label style={lbl}>Message / Requirement *</label>
              <textarea
                ref={textRef}
                style={{ ...inputSt, height: 90, resize: "vertical", lineHeight: 1.55 }}
                value={msg}
                onChange={e => setMsg(e.target.value)}
                placeholder="Describe what you need..."
                onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) handleSend(); }}
              />
              <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 3 }}>Ctrl+Enter to send</div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
              <button onClick={handleSend} disabled={sending} style={{ ...sendBtnStyle, opacity: sending ? 0.7 : 1 }}>
                {sending ? "Sending..." : "📩 Send Request"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const ov = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 800, padding: 16,
};
const md = {
  background: "#fff", borderRadius: 16,
  width: "min(480px, 100%)", padding: 24,
  boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  fontFamily: "'Google Sans','Roboto',sans-serif",
};
const circleR = {
  width: 36, height: 36, borderRadius: "50%",
  background: "linear-gradient(135deg,#D93025,#EA4335)",
  color: "#fff", fontWeight: 800, fontSize: 16,
  display: "flex", alignItems: "center", justifyContent: "center",
  flexShrink: 0, boxShadow: "0 3px 10px rgba(220,38,38,0.4)",
};
const closeBtn = {
  background: "none", border: "none", fontSize: 20,
  cursor: "pointer", color: "#9AA0A6", padding: 4,
};
const fieldWrap = { display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 };
const lbl = { fontSize: 11, fontWeight: 700, color: "#3C4043", textTransform: "uppercase", letterSpacing: "0.05em" };
const inputSt = {
  padding: "9px 12px", border: "1.5px solid #E8EAED",
  borderRadius: 8, fontSize: 13, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box", width: "100%",
  color: "#202124", background: "#F8F9FA",
};
const errBox = {
  background: "#FCE8E6", border: "1px solid #F5C6C2",
  borderRadius: 8, padding: "8px 12px", color: "#D93025",
  fontSize: 12, marginBottom: 12,
};
const cancelBtnStyle = {
  padding: "9px 20px", border: "1px solid #E8EAED",
  borderRadius: 8, background: "transparent",
  color: "#3C4043", fontSize: 13, fontWeight: 500, cursor: "pointer",
  fontFamily: "inherit",
};
const sendBtnStyle = {
  padding: "9px 22px", background: "#1A73E8",
  color: "#fff", border: "none", borderRadius: 8,
  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};