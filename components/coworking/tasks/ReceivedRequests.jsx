/**
 * components/coworking/tasks/ReceivedRequests.jsx
 *
 * UPDATED: Receiver can now see attached images (with lightbox + download)
 * and PDF files (click to open, with download) sent in requests.
 */
"use client";
import { useState, useEffect, useCallback } from "react";
import { firebaseDb } from "../../../lib/coworkFirebase";
import {
  collection, doc, updateDoc, serverTimestamp,
  query, where, onSnapshot, setDoc,
} from "firebase/firestore";

// ── Post response to task chat ─────────────────────────────────────────────────
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

// ── Image Lightbox ────────────────────────────────────────────────────────────
function ImageLightbox({ url, name, onClose }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleDownload = async () => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name || "image";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <div style={lbOverlay} onClick={onClose}>
      <div style={lbInner} onClick={e => e.stopPropagation()}>
        {/* Top bar */}
        <div style={lbTopBar}>
          <span style={{ fontSize: 13, color: "#fff", fontWeight: 600, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name || "Image"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleDownload} style={lbActionBtn} title="Download">
              ⬇ Download
            </button>
            <button onClick={onClose} style={{ ...lbActionBtn, background: "rgba(255,255,255,0.12)" }} title="Close">
              ✕ Close
            </button>
          </div>
        </div>
        {/* Image */}
        <img
          src={url}
          alt={name}
          style={{ maxWidth: "90vw", maxHeight: "80vh", objectFit: "contain", borderRadius: 8, display: "block" }}
        />
      </div>
    </div>
  );
}

// ── Attachment preview strip ──────────────────────────────────────────────────
function AttachmentStrip({ attachments }) {
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [lightboxName, setLightboxName] = useState(null);

  if (!attachments || attachments.length === 0) return null;

  const handleDownload = async (url, name) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name || "file";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <>
      {lightboxUrl && (
        <ImageLightbox
          url={lightboxUrl}
          name={lightboxName}
          onClose={() => { setLightboxUrl(null); setLightboxName(null); }}
        />
      )}

      <div style={attachRow}>
        {attachments.map((att, i) => {
          const isImage = att.type === "image";
          const isPdf = att.type === "pdf";

          if (isImage) {
            return (
              <div key={i} style={imgThumbWrap}>
                {/* Thumbnail — click to open lightbox */}
                <img
                  src={att.url}
                  alt={att.name || "image"}
                  style={imgThumb}
                  onClick={() => { setLightboxUrl(att.url); setLightboxName(att.name || "image"); }}
                  title="Click to enlarge"
                />
                {/* Download button overlaid at bottom */}
                <button
                  onClick={() => handleDownload(att.url, att.name || "image")}
                  style={imgDownloadBtn}
                  title="Download image"
                >
                  ⬇
                </button>
                {att.name && (
                  <div style={thumbName}>{att.name}</div>
                )}
              </div>
            );
          }

          if (isPdf) {
            return (
              <div key={i} style={pdfCard}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <div style={pdfIcon}>📄</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#202124", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {att.name || "document.pdf"}
                    </div>
                    <div style={{ fontSize: 10, color: "#9AA0A6" }}>PDF Document</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <button
                    onClick={() => window.open(att.url, "_blank")}
                    style={pdfBtn("#1A73E8", "#EFF6FF", "#BFDBFE")}
                    title="Open PDF"
                  >
                    👁 Open
                  </button>
                  <button
                    onClick={() => handleDownload(att.url, att.name || "document.pdf")}
                    style={pdfBtn("#1E8E3E", "#E6F4EA", "#A8D5B5")}
                    title="Download PDF"
                  >
                    ⬇ Save
                  </button>
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>
    </>
  );
}

// ── Single request card ────────────────────────────────────────────────────────
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

  const hasAttachments = req.attachments && req.attachments.length > 0;

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
          {req.message && (
            <div style={{ fontSize: 13, color: "#202124", fontWeight: 500, lineHeight: 1.5, marginBottom: hasAttachments ? 8 : 0 }}>
              "{req.message}"
            </div>
          )}
        </div>
        <span style={urgentBadge}>🔴 Urgent</span>
      </div>

      {/* ── Attachments ── */}
      {hasAttachments && (
        <AttachmentStrip attachments={req.attachments} />
      )}

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

// ── Main component ─────────────────────────────────────────────────────────────
export default function ReceivedRequests({ employeeId, employeeName }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
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
          return tb - ta;
        });
      setRequests(docs);
      setLoading(false);
    }, err => {
      console.error("ReceivedRequests listener error:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [employeeId]);

  if (loading || requests.length === 0) return null;

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

// ── Styles ─────────────────────────────────────────────────────────────────────
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

// Attachment styles
const attachRow = {
  display: "flex", flexWrap: "wrap", gap: 8,
  marginBottom: 8,
};
const imgThumbWrap = {
  position: "relative", borderRadius: 8, overflow: "hidden",
  border: "1px solid #E8EAED", cursor: "pointer",
  flexShrink: 0,
};
const imgThumb = {
  width: 100, height: 80, objectFit: "cover",
  display: "block",
  transition: "opacity 0.15s",
};
const imgDownloadBtn = {
  position: "absolute", bottom: 0, right: 0,
  background: "rgba(0,0,0,0.55)", border: "none",
  color: "#fff", fontSize: 12, padding: "3px 8px",
  cursor: "pointer", borderRadius: "8px 0 8px 0",
};
const thumbName = {
  position: "absolute", bottom: 0, left: 0, right: 20,
  background: "rgba(0,0,0,0.45)", color: "#fff",
  fontSize: 9, padding: "2px 5px",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const pdfCard = {
  display: "flex", alignItems: "center", gap: 8,
  padding: "8px 10px", background: "#F8F9FA",
  border: "1px solid #E8EAED", borderRadius: 8,
  width: "100%",
};
const pdfIcon = {
  width: 30, height: 30, borderRadius: 6,
  background: "#FCE8E6", border: "1px solid #F5C6C2",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 15, flexShrink: 0,
};
const pdfBtn = (color, bg, border) => ({
  padding: "4px 10px", background: bg,
  border: `1px solid ${border}`, borderRadius: 6,
  color, fontSize: 10, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
});

// Lightbox styles
const lbOverlay = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.92)",
  zIndex: 9999,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const lbInner = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
  padding: 16,
};
const lbTopBar = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  width: "100%", maxWidth: "90vw", gap: 12,
};
const lbActionBtn = {
  padding: "6px 14px", background: "rgba(255,255,255,0.18)",
  border: "1px solid rgba(255,255,255,0.25)", borderRadius: 7,
  color: "#fff", fontSize: 12, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
};