"use client";
// components/coworking/meeting/MeetingTranscriptPanel.jsx
//
// No "Start Mic" or "Start Transcript" button.
// Transcription is fully automatic:
//   - Starts the moment the user's mic is ON in the meeting
//   - Stops the moment the user mutes their mic
//   - Each person's transcript lines come to everyone via DataChannel
//   - No duplicates — each line is created by exactly one browser

import { useState } from "react";
import { useMeetingTranscript } from "../../../hooks/useMeetingTranscript";
import { downloadTranscriptDocx } from "../../../lib/generateTranscriptDocx";


// Each speaker gets a consistent color across the whole meeting
const COLORS = ["#60A5FA", "#F87171", "#34D399", "#FBBF24", "#A78BFA", "#FB923C", "#38BDF8", "#F472B6"];
const colorMap = {};
function speakerColor(name) {
    if (!colorMap[name]) {
        colorMap[name] = COLORS[Object.keys(colorMap).length % COLORS.length];
    }
    return colorMap[name];
}

export default function MeetingTranscriptPanel({ participantName, meetTitle, meetDate }) {
    const { transcript, isTranscribing, speechSupported, clearTranscript } =
        useMeetingTranscript({ participantName });

    const [downloading, setDownloading] = useState(false);

    const handleDownload = async () => {
        if (!transcript.length) { alert("No transcript yet."); return; }
        setDownloading(true);
        try { await downloadTranscriptDocx(transcript, meetTitle, meetDate); }
        catch (e) { alert("Download failed: " + e.message); }
        finally { setDownloading(false); }
    };

    return (
        <div style={S.panel}>

            {/* Header */}
            <div style={S.header}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={S.title}>📝 Transcript</span>
                    {/* Live indicator */}
                    {isTranscribing && (
                        <div style={S.livePill}>
                            <span style={S.recDot} />LIVE
                        </div>
                    )}
                </div>
                <span style={S.count}>{transcript.length}</span>
            </div>

            {/* Status bar */}
            <div style={S.statusBar}>
                {!speechSupported ? (
                    <span style={S.statusWarn}>⚠️ Chrome/Edge required for auto-transcription</span>
                ) : isTranscribing ? (
                    <span style={S.statusGreen}>🎙️ Your mic is ON — transcribing automatically</span>
                ) : (
                    <span style={S.statusGray}>🔇 Unmute your mic to start transcribing</span>
                )}
            </div>

            {/* Transcript lines */}
            <div style={S.body}>
                {transcript.length === 0 ? (
                    <div style={S.empty}>
                        <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                        <div>Transcript appears here automatically</div>
                        <div style={{ fontSize: 11, marginTop: 4, color: "#5F6368" }}>
                            Unmute your mic to start recording
                        </div>
                    </div>
                ) : (
                    transcript.map((line, i) => {
                        const color = speakerColor(line.name);
                        return (
                            <div key={i} style={{ ...S.line, borderLeftColor: color }}>
                                <div style={S.lineTop}>
                                    <span style={{ ...S.name, color }}>{line.name}</span>
                                    <span style={S.time}>{line.time}</span>
                                </div>
                                <div style={S.text}>{line.text}</div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer */}
            <div style={S.footer}>
                <button
                    onClick={handleDownload}
                    disabled={downloading || !transcript.length}
                    style={{
                        ...S.dlBtn,
                        opacity: !transcript.length ? 0.4 : 1,
                        cursor: !transcript.length ? "not-allowed" : "pointer",
                    }}
                >
                    {downloading ? "⏳ Generating..." : "⬇️ Download .docx"}
                </button>
                {transcript.length > 0 && (
                    <button
                        onClick={() => confirm("Clear transcript?") && clearTranscript()}
                        style={S.clearBtn}
                        title="Clear"
                    >🗑️</button>
                )}
            </div>

            <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
        </div>
    );
}

const S = {
    panel: { display: "flex", flexDirection: "column", height: "100%", background: "#1C1C1C", fontFamily: "'Google Sans','Roboto',sans-serif", overflow: "hidden" },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: "1px solid #2A2A2A", flexShrink: 0 },
    title: { fontSize: 13, fontWeight: 700, color: "#fff" },
    livePill: { display: "inline-flex", alignItems: "center", gap: 4, background: "#1E3A1E", border: "1px solid #166534", borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "#4ADE80" },
    recDot: { width: 6, height: 6, borderRadius: "50%", background: "#EF4444", display: "inline-block", animation: "pulse 1s infinite" },
    count: { fontSize: 11, color: "#5F6368", background: "#2A2A2A", padding: "2px 8px", borderRadius: 99, minWidth: 20, textAlign: "center" },
    statusBar: { padding: "8px 14px", borderBottom: "1px solid #2A2A2A", flexShrink: 0 },
    statusGreen: { fontSize: 12, color: "#4ADE80" },
    statusGray: { fontSize: 12, color: "#6B7280" },
    statusWarn: { fontSize: 12, color: "#F59E0B" },
    body: { flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 },
    empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#6B7280", fontSize: 13, textAlign: "center", paddingTop: 40 },
    line: { background: "#242424", borderRadius: 8, padding: "8px 10px", borderLeft: "3px solid #1A73E8" },
    lineTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
    name: { fontSize: 12, fontWeight: 700 },
    time: { fontSize: 10, color: "#5F6368" },
    text: { fontSize: 13, color: "#E8EAED", lineHeight: 1.5 },
    footer: { padding: "10px 12px", borderTop: "1px solid #2A2A2A", display: "flex", gap: 8, flexShrink: 0 },
    dlBtn: { flex: 1, padding: "9px 0", background: "linear-gradient(135deg,#1A73E8,#0D47A1)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
    clearBtn: { padding: "9px 12px", background: "#2A2A2A", border: "1px solid #3C4043", borderRadius: 8, color: "#9AA0A6", fontSize: 13, cursor: "pointer" },
};