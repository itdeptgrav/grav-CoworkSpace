"use client";
// components/coworking/meets/MeetingTranscriptPanel.jsx
//
// Changes from previous version:
//  - No separate mic button. Transcription mic = LiveKit meeting mic (same thing).
//  - No language selector. Auto-detect handles Hindi, English, Odia, Hinglish.
//  - Shows mic muted warning instead of Start Mic when mic is off in meeting.
//  - One "Start Recording" button that activates transcription (mic already on).

import { useState } from "react";
import { useMeetingTranscript } from "../../../hooks/useMeetingTranscript";
import { downloadTranscriptDocx } from "../../../lib/generateTranscriptDocx";

// Color palette for different speakers (cycles through these)
const SPEAKER_COLORS = [
    "#60A5FA", // blue
    "#F87171", // red
    "#34D399", // green
    "#FBBF24", // yellow
    "#A78BFA", // purple
    "#FB923C", // orange
    "#38BDF8", // sky
    "#F472B6", // pink
];

function getSpeakerColor(name, colorMap) {
    if (!colorMap[name]) {
        const idx = Object.keys(colorMap).length % SPEAKER_COLORS.length;
        colorMap[name] = SPEAKER_COLORS[idx];
    }
    return colorMap[name];
}

export default function MeetingTranscriptPanel({
    participantName,
    meetTitle,
    meetDate,
    isActive,
}) {
    const {
        transcript,
        isTranscribing,
        isMicMuted,
        speechSupported,
        startTranscription,
        stopTranscription,
        clearTranscript,
    } = useMeetingTranscript({ participantName, isActive });

    const [downloading, setDownloading] = useState(false);
    const [speakerColors] = useState({}); // name → color map (stable across renders)

    const handleToggle = () => {
        if (isTranscribing) stopTranscription();
        else startTranscription();
    };

    const handleDownload = async () => {
        if (transcript.length === 0) {
            alert("No transcript yet.");
            return;
        }
        setDownloading(true);
        try {
            await downloadTranscriptDocx(transcript, meetTitle, meetDate);
        } catch (e) {
            alert("Download failed: " + e.message);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div style={S.panel}>
            {/* Header */}
            <div style={S.header}>
                <span style={S.headerTitle}>📝 Live Transcript</span>
                <span style={S.count}>{transcript.length} lines</span>
            </div>

            {/* Status / Control */}
            <div style={S.controls}>
                {!speechSupported ? (
                    <div style={S.warnBox}>
                        ⚠️ Open in Chrome or Edge for speech recognition
                    </div>
                ) : isMicMuted ? (
                    <div style={S.mutedBox}>
                        🔇 Your mic is muted — unmute in the meeting to transcribe
                    </div>
                ) : (
                    <button
                        onClick={handleToggle}
                        style={{
                            ...S.transcribeBtn,
                            ...(isTranscribing ? S.transcribingOn : S.transcribingOff),
                        }}
                    >
                        {isTranscribing ? (
                            <>
                                <span style={S.recDot} />
                                Recording transcript...
                            </>
                        ) : (
                            <>▶ Start Transcript Recording</>
                        )}
                    </button>
                )}

                {/* How it works hint */}
                {speechSupported && !isMicMuted && (
                    <p style={S.hint}>
                        {isTranscribing
                            ? "Auto-detects Hindi / English / Odia. Stops when mic is muted."
                            : "Uses your meeting mic. No extra setup needed."}
                    </p>
                )}
            </div>

            {/* Transcript lines */}
            <div style={S.transcriptBox}>
                {transcript.length === 0 ? (
                    <div style={S.empty}>
                        Transcript will appear here as people speak...
                    </div>
                ) : (
                    transcript.map((line, i) => {
                        const color = getSpeakerColor(line.name, speakerColors);
                        return (
                            <div key={i} style={{ ...S.line, borderLeftColor: color }}>
                                <div style={S.lineHeader}>
                                    <span style={{ ...S.speaker, color }}>{line.name}</span>
                                    <span style={S.time}>{line.time}</span>
                                </div>
                                <div style={S.lineText}>{line.text}</div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Download */}
            <div style={S.footer}>
                <button
                    onClick={handleDownload}
                    disabled={downloading || transcript.length === 0}
                    style={{
                        ...S.downloadBtn,
                        opacity: transcript.length === 0 ? 0.4 : 1,
                        cursor: transcript.length === 0 ? "not-allowed" : "pointer",
                    }}
                >
                    {downloading ? "⏳ Generating..." : "⬇️ Download .docx"}
                </button>
                {transcript.length > 0 && (
                    <button
                        onClick={() => {
                            if (confirm("Clear all transcript lines?")) clearTranscript();
                        }}
                        style={S.clearBtn}
                        title="Clear transcript"
                    >
                        🗑️
                    </button>
                )}
            </div>
        </div>
    );
}

const S = {
    panel: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#1C1C1C",
        fontFamily: "'Google Sans','Roboto',sans-serif",
        overflow: "hidden",
    },
    header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 14px 8px",
        borderBottom: "1px solid #2A2A2A",
        flexShrink: 0,
    },
    headerTitle: { fontSize: 13, fontWeight: 700, color: "#fff" },
    count: {
        fontSize: 11,
        color: "#5F6368",
        background: "#2A2A2A",
        padding: "2px 8px",
        borderRadius: 99,
    },
    controls: {
        padding: "10px 12px",
        borderBottom: "1px solid #2A2A2A",
        flexShrink: 0,
    },
    warnBox: {
        fontSize: 12,
        color: "#F59E0B",
        background: "#2A1F0A",
        padding: "10px 12px",
        borderRadius: 8,
        lineHeight: 1.5,
    },
    mutedBox: {
        fontSize: 12,
        color: "#9CA3AF",
        background: "#2A2A2A",
        padding: "10px 12px",
        borderRadius: 8,
        lineHeight: 1.5,
        textAlign: "center",
    },
    transcribeBtn: {
        width: "100%",
        padding: "10px 0",
        border: "none",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    transcribingOn: {
        background: "#1E3A5F",
        color: "#60A5FA",
        outline: "1.5px solid #3B82F6",
    },
    transcribingOff: {
        background: "#2A2A2A",
        color: "#9AA0A6",
        outline: "1.5px solid #3C4043",
    },
    recDot: {
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "#EF4444",
        display: "inline-block",
        animation: "pulse 1s infinite",
    },
    hint: {
        fontSize: 11,
        color: "#5F6368",
        margin: "6px 0 0",
        lineHeight: 1.5,
        textAlign: "center",
    },
    transcriptBox: {
        flex: 1,
        overflowY: "auto",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
    },
    empty: {
        fontSize: 12,
        color: "#5F6368",
        textAlign: "center",
        marginTop: 20,
        lineHeight: 1.6,
    },
    line: {
        background: "#242424",
        borderRadius: 8,
        padding: "8px 10px",
        borderLeft: "3px solid #1A73E8",
    },
    lineHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 3,
    },
    speaker: { fontSize: 12, fontWeight: 700 },
    time: { fontSize: 10, color: "#5F6368" },
    lineText: { fontSize: 13, color: "#E8EAED", lineHeight: 1.5 },
    footer: {
        padding: "10px 12px",
        borderTop: "1px solid #2A2A2A",
        display: "flex",
        gap: 8,
        flexShrink: 0,
    },
    downloadBtn: {
        flex: 1,
        padding: "9px 0",
        background: "linear-gradient(135deg,#1A73E8,#0D47A1)",
        border: "none",
        borderRadius: 8,
        color: "#fff",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
    },
    clearBtn: {
        padding: "9px 12px",
        background: "#2A2A2A",
        border: "1px solid #3C4043",
        borderRadius: 8,
        color: "#9AA0A6",
        fontSize: 13,
        cursor: "pointer",
    },
};
