"use client";
/**
 * components/coworking/meets/RecordingControls.jsx
 *
 * Shown ONLY to CEO and TL inside the meeting top bar.
 * Handles:
 *   - Start recording button
 *   - Stop recording button → red danger popup (two-step confirmation)
 *   - Recording active indicator (pulsing red dot)
 *   - Upload status (uploading... / done / error)
 */

import { useState } from "react";

export default function RecordingControls({
    isHost,         // boolean — only render if true
    isRecording,    // boolean
    isUploading,    // boolean
    uploadDone,     // boolean
    uploadError,    // string
    uploadResult,   // object { driveViewUrl, fileName } | null
    onStart,        // fn
    onStop,         // fn (called after popup confirmed)
}) {
    const [showPopup, setShowPopup] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const CONFIRM_WORD = "STOP";

    if (!isHost) return null;

    // ── Danger popup ──────────────────────────────────────────────────────────
    const handleStopClick = () => {
        setShowPopup(true);
        setConfirmText("");
    };

    const handleConfirmStop = () => {
        setShowPopup(false);
        setConfirmText("");
        onStop();
    };

    const handleCancelPopup = () => {
        setShowPopup(false);
        setConfirmText("");
    };

    // ── Upload status chip ────────────────────────────────────────────────────
    const renderStatus = () => {
        if (isUploading) return (
            <div style={S.statusChip}>
                <div style={S.spinnerDot} />
                <span style={{ fontSize: 11, color: "#FCD34D" }}>Uploading audio…</span>
            </div>
        );
        if (uploadError) return (
            <div style={{ ...S.statusChip, gap: 5 }}>
                <span style={{ fontSize: 11, color: "#F87171" }}>⚠ {uploadError}</span>
            </div>
        );
        if (uploadDone && uploadResult && !uploadResult.skipped) return (
            <div style={{ ...S.statusChip, gap: 5 }}>
                <span style={{ fontSize: 11, color: "#4ADE80" }}>✓ Audio saved</span>
                <a
                    href={uploadResult.driveViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 10, color: "#60A5FA", textDecoration: "underline" }}
                >
                    View
                </a>
            </div>
        );
        return null;
    };

    return (
        <>
            {/* ── Recording button in top bar ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

                {/* Active recording indicator */}
                {isRecording && (
                    <div style={S.recordingPill}>
                        <span style={S.recDot} />
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em" }}>REC</span>
                    </div>
                )}

                {/* Start / Stop button */}
                {!isRecording && !isUploading && !uploadDone ? (
                    <button onClick={onStart} style={S.startBtn} title="Start audio recording for all participants">
                        <MicIcon />
                        <span style={{ fontSize: 11, fontWeight: 600 }}>Record</span>
                    </button>
                ) : isRecording ? (
                    <button onClick={handleStopClick} style={S.stopBtn} title="Stop recording">
                        <StopIcon />
                        <span style={{ fontSize: 11, fontWeight: 600 }}>Stop Rec</span>
                    </button>
                ) : null}

                {/* Upload status */}
                {renderStatus()}
            </div>

            {/* ── Danger popup overlay ── */}
            {showPopup && (
                <div style={S.overlay}>
                    <div style={S.popup}>

                        {/* Header */}
                        <div style={S.popupHeader}>
                            <div style={S.dangerIcon}>⚠</div>
                            <div>
                                <div style={S.popupTitle}>Stop Audio Recording?</div>
                                <div style={S.popupSubtitle}>This will stop recording for ALL participants</div>
                            </div>
                        </div>

                        {/* Warning message */}
                        <div style={S.warningBox}>
                            <p style={S.warningText}>
                                Once you stop recording:
                            </p>
                            <ul style={S.warningList}>
                                <li>Each participant's audio will be uploaded to Google Drive</li>
                                <li>Recording cannot be restarted for this meeting</li>
                                <li>All audio files will be saved with participant names</li>
                            </ul>
                        </div>

                        {/* Two-step: type STOP to confirm */}
                        <div style={S.confirmSection}>
                            <label style={S.confirmLabel}>
                                Type <strong style={{ color: "#F87171" }}>{CONFIRM_WORD}</strong> to confirm
                            </label>
                            <input
                                value={confirmText}
                                onChange={e => setConfirmText(e.target.value.toUpperCase())}
                                placeholder={`Type ${CONFIRM_WORD} here`}
                                style={{
                                    ...S.confirmInput,
                                    borderColor: confirmText === CONFIRM_WORD ? "#EF4444" : "#3C4043",
                                }}
                                autoFocus
                            />
                        </div>

                        {/* Buttons */}
                        <div style={S.popupBtns}>
                            <button onClick={handleCancelPopup} style={S.cancelBtn}>
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmStop}
                                disabled={confirmText !== CONFIRM_WORD}
                                style={{
                                    ...S.confirmBtn,
                                    opacity: confirmText === CONFIRM_WORD ? 1 : 0.4,
                                    cursor: confirmText === CONFIRM_WORD ? "pointer" : "not-allowed",
                                    pointerEvents: confirmText === CONFIRM_WORD ? "auto" : "none",
                                }}
                            >
                                <StopIcon size={12} />
                                Yes, Stop Recording & Upload
                            </button>
                        </div>

                    </div>
                </div>
            )}

            <style>{`
                @keyframes rec-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </>
    );
}

// ── Small icons ───────────────────────────────────────────────────────────────
function MicIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
    );
}

function StopIcon({ size = 13 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
    // Top bar buttons
    startBtn: {
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "6px 12px",
        background: "#2A2A2A", border: "1px solid #3C4043",
        borderRadius: 8, color: "#BDC1C6",
        fontSize: 12, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.12s",
    },
    stopBtn: {
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "6px 12px",
        background: "rgba(239,68,68,0.15)", border: "1px solid #EF4444",
        borderRadius: 8, color: "#F87171",
        fontSize: 12, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
    },
    recordingPill: {
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 10px",
        background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)",
        borderRadius: 99,
        color: "#F87171", fontSize: 10, fontWeight: 700,
    },
    recDot: {
        width: 7, height: 7, borderRadius: "50%",
        background: "#EF4444", display: "inline-block",
        animation: "rec-pulse 1s ease infinite",
    },
    statusChip: {
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 10px",
        background: "#1A1A1A", border: "1px solid #2A2A2A",
        borderRadius: 99,
    },
    spinnerDot: {
        width: 10, height: 10,
        border: "2px solid #3C4043", borderTopColor: "#FCD34D",
        borderRadius: "50%", animation: "spin 0.8s linear infinite",
    },

    // Popup overlay
    overlay: {
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        backdropFilter: "blur(4px)",
    },
    popup: {
        background: "#1A1A1A",
        border: "1.5px solid #EF4444",
        borderRadius: 16,
        padding: "28px 28px 24px",
        width: "100%", maxWidth: 440,
        boxShadow: "0 24px 60px rgba(239,68,68,0.2), 0 8px 32px rgba(0,0,0,0.7)",
        display: "flex", flexDirection: "column", gap: 20,
        fontFamily: "'Google Sans','Roboto',sans-serif",
    },
    popupHeader: {
        display: "flex", alignItems: "flex-start", gap: 14,
    },
    dangerIcon: {
        width: 44, height: 44,
        background: "rgba(239,68,68,0.15)",
        border: "1px solid rgba(239,68,68,0.4)",
        borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20, flexShrink: 0,
        color: "#F87171",
    },
    popupTitle: {
        fontSize: 17, fontWeight: 700, color: "#F9FAFB",
        marginBottom: 4,
    },
    popupSubtitle: {
        fontSize: 12, color: "#9AA0A6",
    },
    warningBox: {
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.2)",
        borderRadius: 10,
        padding: "14px 16px",
    },
    warningText: {
        fontSize: 13, color: "#FCA5A5",
        margin: "0 0 8px", fontWeight: 600,
    },
    warningList: {
        margin: 0, paddingLeft: 18,
        display: "flex", flexDirection: "column", gap: 5,
        fontSize: 12, color: "#9AA0A6", lineHeight: 1.6,
    },
    confirmSection: {
        display: "flex", flexDirection: "column", gap: 8,
    },
    confirmLabel: {
        fontSize: 12, color: "#9AA0A6",
    },
    confirmInput: {
        padding: "10px 13px",
        background: "#111",
        border: "1.5px solid #3C4043",
        borderRadius: 8,
        fontSize: 14, fontWeight: 700,
        color: "#F87171",
        fontFamily: "monospace",
        outline: "none",
        transition: "border-color 0.15s",
        letterSpacing: "0.1em",
    },
    popupBtns: {
        display: "flex", gap: 10,
    },
    cancelBtn: {
        flex: 1, padding: "11px 0",
        background: "#2A2A2A",
        border: "1px solid #3C4043",
        borderRadius: 10,
        color: "#9AA0A6", fontSize: 13, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
    },
    confirmBtn: {
        flex: 2, padding: "11px 0",
        background: "#EF4444",
        border: "none",
        borderRadius: 10,
        color: "#fff", fontSize: 13, fontWeight: 700,
        cursor: "pointer", fontFamily: "inherit",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
    },
};