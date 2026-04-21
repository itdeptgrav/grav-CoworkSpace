/**
 * components/coworking/tasks/WorkCommitModal.jsx
 *
 * Pause-timer "Pause Timer" modal — shown when an employee pauses their task
 * timer. Captures a commit message and any number of file attachments, writes
 * both to `cowork_work_commits/{employeeId}/logs/{autoId}` via the parent's
 * handleCommitSubmit callback.
 *
 * Fully self-contained UI:
 *   - × close button + Esc key (parent handles Esc in useEffect)
 *   - Ctrl/⌘+Enter submits
 *   - Drag-and-drop attachments (all file types → Google Drive via /cowork/upload/pdf)
 *   - Pause & Save disabled while uploading/saving
 *
 * All state lives in the parent (TasksPage) so the attachments list survives
 * a parent re-render and so the same state can drive timer pause behavior.
 */
"use client";
import React from "react";

export default function WorkCommitModal({
    // state
    commitModal,          // { taskId, taskTitle, nextTaskId?, nextTaskTitle? } | null
    commitMessage,
    commitAttachments,
    commitUploading,
    commitDragging,
    savingCommit,
    // setters
    setCommitMessage,
    setCommitAttachments,
    setCommitDragging,
    // refs
    commitFileInputRef,
    // handlers
    closeCommitModal,
    uploadCommitFiles,
    handleCommitSubmit,
}) {
    if (!commitModal) return null;

    const submitDisabled = savingCommit || commitUploading || !commitMessage.trim();

    return (
        <div
            // Prevent the browser from opening a file if the user misses the drop zone
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => e.preventDefault()}
            style={{
                position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
                zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center",
                backdropFilter: "blur(3px)", padding: 16,
                fontFamily: "var(--font,'DM Sans',-apple-system,sans-serif)",
            }}
        >
            <div style={{
                background: "#fff", borderRadius: 16, width: "min(440px,96vw)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
                animation: "ctm-in 0.18s cubic-bezier(0.4,0,0.2,1)",
            }}>
                {/* Header */}
                <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #E5E7EB" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 9, background: "#FFF7ED",
                            border: "1px solid #FED7AA", display: "flex", alignItems: "center",
                            justifyContent: "center", flexShrink: 0,
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
                                <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                                <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
                            </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Pause Timer</div>
                            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {commitModal.taskTitle}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={closeCommitModal}
                            disabled={savingCommit || commitUploading}
                            title="Close (Esc)"
                            aria-label="Close"
                            style={{
                                width: 30, height: 30, borderRadius: 8,
                                border: "1px solid #E5E7EB", background: "#F9FAFB",
                                color: "#6B7280", cursor: (savingCommit || commitUploading) ? "not-allowed" : "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0, padding: 0,
                                opacity: (savingCommit || commitUploading) ? 0.5 : 1,
                                transition: "background 0.12s, color 0.12s",
                            }}
                            onMouseEnter={(e) => { if (!(savingCommit || commitUploading)) { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.color = "#111827"; } }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.color = "#6B7280"; }}
                        >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: "16px 20px" }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
                        What did you work on? <span style={{ color: "#EF4444", fontWeight: 600, textTransform: "none" }}>*</span>
                    </label>
                    <textarea
                        autoFocus
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleCommitSubmit(false); }}
                        placeholder="e.g. Fixed the login bug, updated UI layout…"
                        style={{
                            width: "100%", padding: "10px 12px",
                            border: `1.5px solid ${commitMessage.trim() ? "#E5E7EB" : "#FCA5A5"}`,
                            borderRadius: 9, fontSize: 13, fontFamily: "inherit",
                            outline: "none", resize: "vertical", minHeight: 90,
                            color: "#0F172A", background: "#FAFAFA", boxSizing: "border-box",
                            transition: "border-color 0.12s",
                        }}
                        onFocus={(e) => (e.target.style.borderColor = "#4F46E5")}
                        onBlur={(e) => (e.target.style.borderColor = "#E5E7EB")}
                    />
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "#EF4444" }}>*</span> Required — describe what you worked on
                        <span style={{ marginLeft: "auto" }}>💡 Ctrl+Enter to save</span>
                    </div>

                    {/* ── Attachments ── all types go to Google Drive via /cowork/upload/pdf ── */}
                    <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                            Attachments <span style={{ color: "#9CA3AF", fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                        </div>

                        {/* Existing chips */}
                        {commitAttachments.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                                {commitAttachments.map((a, i) => (
                                    <div key={a.fileId || i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8 }}>
                                        <span style={{ fontSize: 14 }}>
                                            {(a.mimeType || "").startsWith("image/") ? "🖼" :
                                                (a.mimeType || "").includes("pdf") ? "📕" :
                                                    (a.mimeType || "").includes("spreadsheet") || (a.mimeType || "").includes("excel") || /\.(xls|xlsx|csv)$/i.test(a.name || "") ? "📊" :
                                                        (a.mimeType || "").includes("word") || /\.(doc|docx)$/i.test(a.name || "") ? "📄" :
                                                            "📎"}
                                        </span>
                                        <span style={{ fontSize: 12, color: "#0F172A", fontWeight: 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.name}>
                                            {a.name}
                                        </span>
                                        {a.size > 0 && (
                                            <span style={{ fontSize: 10, color: "#94A3B8", flexShrink: 0 }}>
                                                {a.size < 1024 * 1024 ? `${Math.round(a.size / 1024)}KB` : `${(a.size / 1024 / 1024).toFixed(1)}MB`}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setCommitAttachments((prev) => prev.filter((_, j) => j !== i))}
                                            disabled={savingCommit}
                                            style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "transparent", color: "#EF4444", cursor: savingCommit ? "not-allowed" : "pointer", fontSize: 14, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                                            title="Remove"
                                        >✕</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add-file button (drop zone) */}
                        <input
                            ref={commitFileInputRef}
                            type="file"
                            multiple
                            style={{ display: "none" }}
                            onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                e.target.value = ""; // so user can re-pick the same file after removing it
                                uploadCommitFiles(files);
                            }}
                        />
                        <div
                            // Drag-and-drop target. Accepts any number of files and funnels them through the same helper.
                            onDragEnter={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!savingCommit && !commitUploading) setCommitDragging(true);
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!savingCommit && !commitUploading) setCommitDragging(true);
                            }}
                            onDragLeave={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                // Only clear if we're truly leaving the container, not just crossing into a child
                                if (e.currentTarget.contains(e.relatedTarget)) return;
                                setCommitDragging(false);
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setCommitDragging(false);
                                if (savingCommit || commitUploading) return;
                                const files = Array.from(e.dataTransfer?.files || []);
                                if (files.length) uploadCommitFiles(files);
                            }}
                            style={{
                                padding: "14px 12px", borderRadius: 10,
                                border: `1.5px dashed ${commitDragging ? "#4F46E5" : "#C7D2FE"}`,
                                background: commitDragging ? "#EEF2FF" : (commitUploading ? "#F1F5F9" : "#FAFAFA"),
                                transition: "border-color 0.12s, background 0.12s",
                                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => commitFileInputRef.current?.click()}
                                disabled={commitUploading || savingCommit}
                                style={{
                                    display: "inline-flex", alignItems: "center", gap: 6,
                                    padding: "7px 14px", borderRadius: 8,
                                    border: "1.5px solid #C7D2FE",
                                    background: "#fff",
                                    color: "#4F46E5", fontSize: 12, fontWeight: 600,
                                    cursor: (commitUploading || savingCommit) ? "wait" : "pointer",
                                    fontFamily: "inherit",
                                }}
                            >
                                {commitUploading ? (
                                    <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "ctm-spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Uploading…</>
                                ) : (
                                    <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> Attach file</>
                                )}
                            </button>
                            <div style={{ fontSize: 10, color: commitDragging ? "#4F46E5" : "#94A3B8", fontWeight: commitDragging ? 600 : 400, textAlign: "center" }}>
                                {commitDragging
                                    ? "Drop to attach"
                                    : "or drag & drop files here — any type, up to 50MB, stored on Google Drive"}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: "12px 20px 16px", display: "flex", gap: 8, justifyContent: "flex-end",
                    borderTop: "1px solid #F1F5F9",
                }}>
                    <button
                        onClick={() => handleCommitSubmit(false)}
                        disabled={submitDisabled}
                        style={{
                            padding: "8px 20px", borderRadius: 8, border: "none",
                            background: submitDisabled ? "#E5E7EB" : "#4F46E5",
                            color: submitDisabled ? "#94A3B8" : "#fff",
                            fontSize: 13, fontWeight: 700,
                            cursor: submitDisabled ? "not-allowed" : "pointer",
                            fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
                        }}
                    >
                        {savingCommit ? (
                            <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "ctm-spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Saving…</>
                        ) : (
                            <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Pause & Save</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}