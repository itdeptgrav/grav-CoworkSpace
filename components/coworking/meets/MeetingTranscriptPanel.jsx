"use client";
// components/coworking/meeting/MeetingTranscriptPanel.jsx
//
// No "Start Transcript" button — transcription is FULLY AUTOMATIC:
//   • Starts the moment this user's mic is unmuted in LiveKit
//   • Stops the moment this user mutes their mic
//   • Each person's browser only transcribes THEIR OWN voice (no duplicates)
//   • Other participants' lines arrive via LiveKit DataChannel

import { useEffect, useRef, useState } from "react";
import { useMeetingTranscript } from "../../../hooks/useMeetingTranscript";
import { downloadTranscriptDocx } from "../../../lib/generateTranscriptDocx";

// Each speaker gets a consistent color throughout the meeting
const SPEAKER_COLORS = [
    "#60A5FA", "#F87171", "#34D399", "#FBBF24",
    "#A78BFA", "#FB923C", "#38BDF8", "#F472B6",
];
const colorMap = {};
function speakerColor(name) {
    if (!colorMap[name]) {
        colorMap[name] = SPEAKER_COLORS[Object.keys(colorMap).length % SPEAKER_COLORS.length];
    }
    return colorMap[name];
}

export default function MeetingTranscriptPanel({ participantName, meetTitle, meetDate }) {
    const { transcript, isTranscribing, speechSupported, clearTranscript } =
        useMeetingTranscript({ participantName });

    const [downloading, setDownloading] = useState(false);
    const bottomRef = useRef(null);

    // Auto-scroll to latest line
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [transcript.length]);

    const handleDownload = async () => {
        if (!transcript.length) { alert("No transcript yet. Unmute your mic to start."); return; }
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
                    {isTranscribing && (
                        <div style={S.livePill}>
                            <span style={S.recDot} />LIVE
                        </div>
                    )}
                </div>
                <span style={S.count}>{transcript.length} lines</span>
            </div>

            {/* Status — no button, just info */}
            <div style={S.statusBar}>
                {!speechSupported ? (
                    <span style={S.warn}>⚠️ Use Chrome or Edge for auto-transcription</span>
                ) : isTranscribing ? (
                    <span style={S.green}>🎙️ Your mic is ON — transcribing your voice</span>
                ) : (
                    <span style={S.gray}>🔇 Unmute your mic to start transcribing</span>
                )}
            </div>

            {/* Transcript lines — auto-scroll */}
            <div style={S.body}>
                {transcript.length === 0 ? (
                    <div style={S.empty}>
                        <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>No transcript yet</div>
                        <div style={{ fontSize: 11, color: "#5F6368", lineHeight: 1.6 }}>
                            Unmute your mic to start.<br />
                            Others' words will appear here automatically.
                        </div>
                    </div>
                ) : (
                    <>
                        {transcript.map((line, i) => {
                            const color = speakerColor(line.name);
                            return (
                                <div key={i} style={{ ...S.line, borderLeftColor: color }}>
                                    <div style={S.lineTop}>
                                        <span style={{ ...S.speakerName, color }}>{line.name}</span>
                                        <span style={S.time}>{line.time}</span>
                                    </div>
                                    <div style={S.lineText}>{line.text}</div>
                                </div>
                            );
                        })}
                        <div ref={bottomRef} />
                    </>
                )}
            </div>

            {/* Footer: download + clear */}
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
                        title="Clear transcript"
                    >🗑️</button>
                )}
            </div>

            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
        </div>
    );
}

const S = {
    panel: { display: "flex", flexDirection: "column", height: "100%", background: "#1C1C1C", fontFamily: "'Google Sans','Roboto',sans-serif", overflow: "hidden" },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: "1px solid #2A2A2A", flexShrink: 0 },
    title: { fontSize: 13, fontWeight: 700, color: "#fff" },
    livePill: { display: "inline-flex", alignItems: "center", gap: 4, background: "#1E3A1E", border: "1px solid #166534", borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "#4ADE80" },
    recDot: { width: 6, height: 6, borderRadius: "50%", background: "#EF4444", display: "inline-block", animation: "pulse 1s infinite" },
    count: { fontSize: 11, color: "#5F6368", background: "#2A2A2A", padding: "2px 8px", borderRadius: 99 },
    statusBar: { padding: "8px 14px", borderBottom: "1px solid #2A2A2A", flexShrink: 0 },
    green: { fontSize: 12, color: "#4ADE80" },
    gray: { fontSize: 12, color: "#6B7280" },
    warn: { fontSize: 12, color: "#F59E0B" },
    body: { flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 },
    empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#9AA0A6", fontSize: 13, textAlign: "center", paddingTop: 40 },
    line: { background: "#242424", borderRadius: 8, padding: "8px 10px", borderLeft: "3px solid #1A73E8", flexShrink: 0 },
    lineTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
    speakerName: { fontSize: 12, fontWeight: 700 },
    time: { fontSize: 10, color: "#5F6368" },
    lineText: { fontSize: 13, color: "#E8EAED", lineHeight: 1.5 },
    footer: { padding: "10px 12px", borderTop: "1px solid #2A2A2A", display: "flex", gap: 8, flexShrink: 0 },
    dlBtn: { flex: 1, padding: "9px 0", background: "linear-gradient(135deg,#1A73E8,#0D47A1)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
    clearBtn: { padding: "9px 12px", background: "#2A2A2A", border: "1px solid #3C4043", borderRadius: 8, color: "#9AA0A6", fontSize: 13, cursor: "pointer" },
};