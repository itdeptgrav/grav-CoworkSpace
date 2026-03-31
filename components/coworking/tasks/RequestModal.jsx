/**
 * components/coworking/tasks/RequestModal.jsx
 *
 * FIXED: Images upload directly from frontend → Cloudinary (using upload preset,
 * no api_key needed). PDFs still go through backend → Google Drive.
 * ReceivedRequests.jsx is unchanged — att.url still works for both.
 */
"use client";
import { useState, useEffect, useRef } from "react";
import { firebaseDb, firebaseAuth } from "../../../lib/coworkFirebase";
import {
  collection, doc, setDoc, updateDoc,
  serverTimestamp, getDocs, getDoc,
} from "firebase/firestore";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const CLD_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

// ── helpers ───────────────────────────────────────────────────────────────────
async function getToken() {
  const u = firebaseAuth.currentUser;
  if (!u) throw new Error("Not authenticated");
  return u.getIdToken();
}

async function fetchAllEmployees(excludeId) {
  const snap = await getDocs(collection(firebaseDb, "cowork_employees"));
  const emps = [];
  snap.forEach(d => {
    const emp = d.data();
    if (emp.employeeId && emp.employeeId !== excludeId) {
      emps.push({
        employeeId: emp.employeeId,
        name: emp.name,
        role: emp.role,
        department: emp.department,
      });
    }
  });
  return emps;
}

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
    const snap = await getDoc(taskRef);
    await updateDoc(taskRef, {
      chatMessageCount: (snap.data()?.chatMessageCount || 0) + 1,
      lastChatAt: serverTimestamp(),
      lastChatPreview: text,
      updatedAt: serverTimestamp(),
    });
  } catch (e) { console.error("postToTaskChat:", e); }
}

// ── IMAGE: upload directly from frontend to Cloudinary (no backend needed) ───
// Uses upload preset — no api_key required on the frontend side.
async function uploadImageToCloudinary(file) {
  if (!CLD_CLOUD || !CLD_PRESET) {
    throw new Error(
      "Cloudinary env vars missing: NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME or NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"
    );
  }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLD_PRESET);
  fd.append("folder", "cowork-requests");

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLD_CLOUD}/image/upload`,
    { method: "POST", body: fd }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Cloudinary upload failed");

  return {
    url: data.secure_url,
    name: file.name,
    type: "image",
    bytes: data.bytes || file.size,
    publicId: data.public_id,
  };
}

// ── PDF: upload through backend → Google Drive (unchanged) ───────────────────
async function uploadPdfToBackend(file) {
  const token = await getToken();
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${BASE}/cowork/upload/pdf`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "PDF upload failed");

  return {
    url: data.url || data.viewUrl,
    downloadUrl: data.downloadUrl || null,
    viewUrl: data.viewUrl || null,
    name: file.name,
    type: "pdf",
    bytes: data.size || file.size,
  };
}

// ── dispatcher: route by file type ───────────────────────────────────────────
async function uploadFile(file) {
  if (file.type.startsWith("image/")) return uploadImageToCloudinary(file);
  if (file.type === "application/pdf") return uploadPdfToBackend(file);
  throw new Error(`Unsupported file type: ${file.type}`);
}

// ── file pill ─────────────────────────────────────────────────────────────────
function FilePill({ fileName, fileType, uploading, onRemove }) {
  const isImg = fileType?.startsWith("image/");
  return (
    <div style={pillStyle}>
      <span style={{ fontSize: 14 }}>{isImg ? "🖼️" : "📄"}</span>
      <span style={{
        fontSize: 11, maxWidth: 130,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        color: "#3C4043",
      }}>
        {fileName}
      </span>
      {uploading
        ? <span style={{ fontSize: 10, color: "#1A73E8" }}>uploading…</span>
        : <button onClick={onRemove} style={pillRemove}>✕</button>
      }
    </div>
  );
}

// ── main modal ────────────────────────────────────────────────────────────────
export default function RequestModal({
  taskId, taskTitle, onClose,
  currentEmployeeId, currentEmployeeName,
}) {
  const [employees, setEmployees] = useState([]);
  const [toId, setToId] = useState("");
  const [msg, setMsg] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const textRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchAllEmployees(currentEmployeeId)
      .then(setEmployees)
      .catch(e => setError("Could not load employees: " + e.message));
    setTimeout(() => textRef.current?.focus(), 100);
  }, [currentEmployeeId]);

  const handleFilePick = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    const valid = [];
    const invalid = [];
    picked.forEach(f => {
      if (f.type.startsWith("image/") || f.type === "application/pdf") valid.push(f);
      else invalid.push(f.name);
    });
    if (invalid.length > 0) {
      setError(`Unsupported: ${invalid.join(", ")} — only images & PDF allowed.`);
    } else {
      setError("");
    }
    setFiles(prev => [
      ...prev,
      ...valid.map(f => ({ file: f, uploading: false, done: false, result: null, error: null })),
    ]);
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleSend = async () => {
    if (!toId) { setError("Select a recipient."); return; }
    if (!msg.trim() && files.length === 0) { setError("Type a message or attach a file."); return; }
    setError(""); setSending(true);

    try {
      // 1. Upload files
      const uploaded = [];
      const updatedFiles = [...files];

      for (let i = 0; i < updatedFiles.length; i++) {
        updatedFiles[i] = { ...updatedFiles[i], uploading: true };
        setFiles([...updatedFiles]);
        try {
          const result = await uploadFile(updatedFiles[i].file);
          updatedFiles[i] = { ...updatedFiles[i], uploading: false, done: true, result };
          uploaded.push(result);
        } catch (err) {
          updatedFiles[i] = { ...updatedFiles[i], uploading: false, error: err.message };
          throw new Error(`Upload failed for "${updatedFiles[i].file.name}": ${err.message}`);
        }
        setFiles([...updatedFiles]);
      }

      // 2. Save request to Firestore
      const reqId = crypto.randomUUID();
      await setDoc(doc(firebaseDb, "cowork_requests", reqId), {
        requestId: reqId,
        taskId, taskTitle,
        fromId: currentEmployeeId,
        fromName: currentEmployeeName,
        toId,
        message: msg.trim(),
        attachments: uploaded,
        status: "pending",
        responseMessage: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 3. Post to task chat
      const toEmp = employees.find(e => e.employeeId === toId);
      const attachNote = uploaded.length > 0 ? ` [${uploaded.length} attachment(s)]` : "";
      await postToTaskChat(
        taskId,
        currentEmployeeId,
        currentEmployeeName,
        `📩 Request to ${toEmp?.name || toId}: "${msg.trim()}"${attachNote}`
      );

      setSent(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
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
              <label style={lbl}>Message / Requirement</label>
              <textarea
                ref={textRef}
                style={{ ...inputSt, height: 80, resize: "vertical", lineHeight: 1.55 }}
                value={msg}
                onChange={e => setMsg(e.target.value)}
                placeholder="Describe what you need..."
                onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) handleSend(); }}
              />
              <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 3 }}>Ctrl+Enter to send</div>
            </div>

            {/* Attachments */}
            <div style={fieldWrap}>
              <label style={lbl}>
                Attachments{" "}
                <span style={{ color: "#9AA0A6", fontWeight: 400, textTransform: "none" }}>
                  (images or PDF)
                </span>
              </label>

              {files.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {files.map((f, i) => (
                    <FilePill
                      key={i}
                      fileName={f.file.name}
                      fileType={f.file.type}
                      uploading={f.uploading}
                      onRemove={() => removeFile(i)}
                    />
                  ))}
                </div>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                style={attachBtn}
                type="button"
              >
                <span style={{ fontSize: 14 }}>📎</span>
                <span>Attach Images / PDF</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                multiple
                style={{ display: "none" }}
                onChange={handleFilePick}
              />
              <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 4 }}>
                Images → Cloudinary · PDF → Drive · Max 50MB each
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={handleSend}
                disabled={sending}
                style={{ ...sendBtnStyle, opacity: sending ? 0.7 : 1 }}
              >
                {sending ? "Sending..." : "📩 Send Request"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────
const ov = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 800, padding: 16,
};
const md = {
  background: "#fff", borderRadius: 16,
  width: "min(500px, 100%)", padding: 24,
  boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  fontFamily: "'Google Sans','Roboto',sans-serif",
  maxHeight: "90vh", overflowY: "auto",
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
const lbl = {
  fontSize: 11, fontWeight: 700, color: "#3C4043",
  textTransform: "uppercase", letterSpacing: "0.05em",
};
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
  color: "#3C4043", fontSize: 13, fontWeight: 500,
  cursor: "pointer", fontFamily: "inherit",
};
const sendBtnStyle = {
  padding: "9px 22px", background: "#1A73E8",
  color: "#fff", border: "none", borderRadius: 8,
  fontSize: 13, fontWeight: 700, cursor: "pointer",
  fontFamily: "inherit",
};
const attachBtn = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "7px 14px", background: "#F8F9FA",
  border: "1.5px dashed #DADCE0", borderRadius: 8,
  color: "#5F6368", fontSize: 12, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
};
const pillStyle = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "4px 8px", background: "#EFF6FF",
  border: "1px solid #BFDBFE", borderRadius: 99,
  maxWidth: 200,
};
const pillRemove = {
  background: "none", border: "none",
  cursor: "pointer", color: "#9AA0A6",
  fontSize: 10, padding: 0, lineHeight: 1,
};