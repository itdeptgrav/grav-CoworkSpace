/**
 * components/coworking/tasks/WorkCommitModal.jsx
 *
 * Pause-timer panel — RIGHT SIDE SLIDER (replaces center popup).
 * Slides in from the right over the existing UI.
 * All logic/props identical to original.
 */
"use client";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

function SliderPortal({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export default function WorkCommitModal({
  commitModal,
  commitMessage,
  commitAttachments,
  commitUploading,
  commitDragging,
  savingCommit,
  setCommitMessage,
  setCommitAttachments,
  setCommitDragging,
  commitFileInputRef,
  closeCommitModal,
  uploadCommitFiles,
  handleCommitSubmit,
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (commitModal) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [!!commitModal]);

  if (!commitModal) return null;

  const submitDisabled = savingCommit || commitUploading || !commitMessage.trim();
  const isDeadlineReached = commitModal.autoReason === "deadline_reached";

  const F = { fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif" };

  return (
    <SliderPortal>
      <style>{`
        @keyframes wc-slide-in  { from { transform:translateX(100%); opacity:.8 } to { transform:translateX(0); opacity:1 } }
        @keyframes wc-slide-out { from { transform:translateX(0); opacity:1 } to { transform:translateX(100%); opacity:0 } }
        @keyframes wc-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* Dim backdrop — clicking it closes (same as Esc) */}
      <div
        onClick={() => { if (!savingCommit && !commitUploading) closeCommitModal(); }}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(15,23,42,0.25)",
          zIndex: 8998,
          backdropFilter: "blur(1px)",
        }}
      />

      {/* Slider panel */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(460px, 100vw)",
          background: "#fff",
          borderLeft: "1px solid #E5E7EB",
          boxShadow: "-6px 0 32px rgba(15,23,42,0.12)",
          display: "flex", flexDirection: "column",
          zIndex: 8999,
          ...F,
          animation: `${visible ? "wc-slide-in" : "wc-slide-out"} 0.24s cubic-bezier(0.32,0.72,0,1) both`,
        }}
        onDragOver={e => { e.preventDefault(); setCommitDragging(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setCommitDragging(false); }}
        onDrop={e => {
          e.preventDefault(); setCommitDragging(false);
          uploadCommitFiles(e.dataTransfer.files);
        }}
      >
        {/* Drop overlay */}
        {commitDragging && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            background: "rgba(27,79,138,0.07)",
            border: "2px dashed #1B4F8A", borderRadius: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1B4F8A" }}>Drop files here</div>
          </div>
        )}

        {/* Header */}
        <div style={{
          padding: "14px 18px",
          borderBottom: "1px solid #E5E7EB",
          flexShrink: 0,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          {/* Status indicator strip */}
          <div style={{
            width: 3, height: 28, borderRadius: 2, flexShrink: 0,
            background: isDeadlineReached ? "#DC2626" : "#1B4F8A",
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
              {isDeadlineReached ? "Deadline Reached — Pause Timer" : "Pause Timer"}
            </div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {commitModal.taskTitle}
            </div>
          </div>
          <button
            type="button"
            onClick={closeCommitModal}
            disabled={savingCommit || commitUploading}
            style={{
              width: 28, height: 28, borderRadius: 6,
              border: "1px solid #E5E7EB", background: "#F9FAFB",
              color: "#6B7280", cursor: (savingCommit || commitUploading) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, opacity: (savingCommit || commitUploading) ? 0.4 : 1,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Deadline-reached notice */}
          {isDeadlineReached && (
            <div style={{
              padding: "10px 12px",
              background: "#FEF2F2", border: "1px solid #FECDD3", borderRadius: 7,
              display: "flex", alignItems: "flex-start", gap: 9,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#991B1B", marginBottom: 2 }}>Timer auto-paused — approved time fully used</div>
                <div style={{ fontSize: 11, color: "#B91C1C", lineHeight: 1.55 }}>
                  Note what you completed below, save this entry, then tap <strong>Request Extension</strong> in the task to continue.
                </div>
              </div>
            </div>
          )}

          {/* Task info strip */}
          <div style={{
            padding: "9px 12px",
            background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 500, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {commitModal.taskTitle}
            </span>
          </div>

          {/* Message input */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
              {isDeadlineReached ? "What did you accomplish?" : "What did you work on?"}{" "}
              <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <textarea
              autoFocus
              value={commitMessage}
              onChange={e => setCommitMessage(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleCommitSubmit(false); }}
              placeholder={isDeadlineReached
                ? "e.g. Finished the login UI, started on form validation…"
                : "e.g. Fixed the layout bug, reviewed requirements…"
              }
              style={{
                width: "100%", minHeight: 100, padding: "10px 12px",
                border: `1px solid ${commitMessage.trim() ? "#1B4F8A" : "#E5E7EB"}`,
                borderRadius: 7, fontSize: 13, ...F,
                color: "#111827", background: "#fff",
                resize: "vertical", outline: "none", lineHeight: 1.55,
                boxSizing: "border-box", transition: "border-color 0.12s",
              }}
            />
            <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>Ctrl + Enter to save</div>
          </div>

          {/* File attachments */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
              Attachments <span style={{ fontWeight: 400, textTransform: "none", color: "#9CA3AF" }}>(optional)</span>
            </label>

            {/* Existing attachments */}
            {commitAttachments.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }}>
                {commitAttachments.map((att, idx) => (
                  <div key={idx} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 10px", background: "#F8FAFC",
                    border: "1px solid #E5E7EB", borderRadius: 6,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                    </svg>
                    <a href={att.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#1B4F8A", textDecoration: "none", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {att.name}
                    </a>
                    {att.size > 0 && <span style={{ fontSize: 10, color: "#9CA3AF", flexShrink: 0 }}>{(att.size / 1048576).toFixed(1)} MB</span>}
                    <button
                      type="button"
                      onClick={() => setCommitAttachments(prev => prev.filter((_, i) => i !== idx))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 0, display: "flex", flexShrink: 0 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload button + drop hint */}
            <input
              ref={commitFileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={e => { uploadCommitFiles(e.target.files); e.target.value = ""; }}
            />
            <button
              type="button"
              disabled={commitUploading}
              onClick={() => commitFileInputRef.current?.click()}
              style={{
                width: "100%", padding: "9px",
                border: "1px dashed #D1D5DB", borderRadius: 6,
                background: "#F8FAFC", color: "#6B7280",
                fontSize: 12, fontWeight: 500, cursor: commitUploading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                ...F, transition: "border-color 0.12s, color 0.12s",
              }}
              onMouseEnter={e => { if (!commitUploading) { e.currentTarget.style.borderColor = "#1B4F8A"; e.currentTarget.style.color = "#1B4F8A"; } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#D1D5DB"; e.currentTarget.style.color = "#6B7280"; }}
            >
              {commitUploading ? (
                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "wc-spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Uploading…</>
              ) : (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg> Attach file or drag & drop</>
              )}
            </button>
          </div>

        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 18px",
          borderTop: "1px solid #E5E7EB",
          background: "#FAFAFA",
          display: "flex", gap: 8, flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={() => handleCommitSubmit(true)}
            disabled={savingCommit || commitUploading}
            style={{
              flex: 1, padding: "9px",
              border: "1px solid #E5E7EB", borderRadius: 6,
              background: "#fff", color: "#6B7280",
              fontSize: 12, fontWeight: 500, cursor: savingCommit || commitUploading ? "not-allowed" : "pointer",
              ...F, opacity: savingCommit || commitUploading ? 0.5 : 1,
            }}
          >
            Skip & Pause
          </button>
          <button
            type="button"
            onClick={() => handleCommitSubmit(false)}
            disabled={submitDisabled}
            style={{
              flex: 2, padding: "9px",
              border: "none", borderRadius: 6,
              background: submitDisabled ? "#E5E7EB" : "#1B4F8A",
              color: submitDisabled ? "#9CA3AF" : "#fff",
              fontSize: 12, fontWeight: 600,
              cursor: submitDisabled ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              ...F, transition: "background 0.12s",
            }}
          >
            {savingCommit ? (
              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "wc-spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Saving…</>
            ) : "Save & Pause"}
          </button>
        </div>
      </div>
    </SliderPortal>
  );
}