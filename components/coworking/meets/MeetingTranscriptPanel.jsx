"use client";
// components/coworking/meeting/MeetingTranscriptPanel.jsx

import { useEffect, useRef, useState } from "react";
import { useMeetingTranscript, SUPPORTED_LANGS } from "../../../hooks/useMeetingTranscript";
import { downloadTranscriptDocx } from "../../../lib/generateTranscriptDocx";
import { saveTranscript } from "../../../lib/transcriptApi";

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

// Language buttons shown in panel
const LANG_BUTTONS = [
    { code: SUPPORTED_LANGS.HINDI.code, label: "हि/En", title: "Hindi + English (auto-detect)" },
    { code: SUPPORTED_LANGS.ENGLISH.code, label: "English", title: "English only" },
    { code: SUPPORTED_LANGS.ODIA.code, label: "ଓଡ଼ିଆ", title: "Odia mode — prints English words of what you say" },
];

export default function MeetingTranscriptPanel({
    participantName,
    meetId,
    meetTitle,
    meetDate,
    coworkToken,
    onTranscriptChange,
}) {
    const {
        transcript,
        isTranscribing,
        speechSupported,
        activeLang,
        switchLanguage,
        clearTranscript,
    } = useMeetingTranscript({ participantName, meetId });

    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState("");
    const bottomRef = useRef(null);

    // Keep parent's transcriptRef in sync
    useEffect(() => {
        onTranscriptChange?.(transcript);
    }, [transcript]);

    // Auto-scroll to latest line
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [transcript.length]);

    const handleSaveAndDownload = async () => {
        if (!transcript.length) { alert("No transcript yet. Unmute your mic to start speaking."); return; }
        setSaving(true); setSavedMsg("");
        try {
            if (meetId && coworkToken) {
                const result = await saveTranscript(meetId, meetTitle, meetDate, transcript, coworkToken);
                setSavedMsg(result.success
                    ? `✅ Saved. Auto-deletes: ${new Date(result.deleteAt).toLocaleDateString("en-IN")}`
                    : `⚠️ ${result.error}`
                );
            }
            await downloadTranscriptDocx(transcript, meetTitle, meetDate);
        } catch (e) { setSavedMsg(`❌ ${e.message}`); }
        finally {
            setSaving(false);
            setTimeout(() => setSavedMsg(""), 5000);
        }
    };

    // Status text based on mode
    const statusText = () => {
        if (!speechSupported) return { icon: "⚠️", text: "Use Chrome or Edge", style: S.warn };
        if (!isTranscribing) return { icon: "🔇", text: "Unmute mic to start", style: S.gray };
        if (activeLang === SUPPORTED_LANGS.ODIA.code)
            return { icon: "🎙️", text: "Odia mode — printing English words", style: S.green };
        if (activeLang === SUPPORTED_LANGS.ENGLISH.code)
            return { icon: "🎙️", text: "Listening — English", style: S.green };
        return { icon: "🎙️", text: "Listening — Hindi/English auto", style: S.green };
    };
    const status = statusText();

    return (
        <div style={S.panel}>

            {/* Header */}
            <div style={S.header}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={S.title}>📝 Transcript</span>
                    {isTranscribing && <div style={S.livePill}><span style={S.recDot} />LIVE</div>}
                </div>
                <span style={S.count}>{transcript.length}</span>
            </div>

            {/* Status */}
            <div style={S.statusBar}>
                <span style={status.style}>{status.icon} {status.text}</span>
            </div>

            {/* Language selector */}
            <div style={S.langRow}>
                <span style={S.langLabel}>Language:</span>
                {LANG_BUTTONS.map(l => (
                    <button
                        key={l.code}
                        onClick={() => switchLanguage(l.code)}
                        title={l.title}
                        style={{ ...S.langBtn, ...(activeLang === l.code ? S.langActive : {}) }}
                    >
                        {l.label}
                    </button>
                ))}
            </div>

            {/* Odia info banner */}
            {activeLang === SUPPORTED_LANGS.ODIA.code && (
                <div style={S.odiaBanner}>
                    ℹ️ Odia mode — speak normally. Your words will be printed in English.
                </div>
            )}

            {/* Saved message */}
            {savedMsg && (
                <div style={{
                    padding: "8px 14px", fontSize: 11, flexShrink: 0, borderBottom: "1px solid #2A2A2A",
                    color: savedMsg.startsWith("✅") ? "#4ADE80" : "#F87171", background: "#1A1A1A"
                }}>
                    {savedMsg}
                </div>
            )}

            {/* Transcript lines */}
            <div style={S.body}>
                {transcript.length === 0 ? (
                    <div style={S.empty}>
                        <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>No transcript yet</div>
                        <div style={{ fontSize: 11, color: "#5F6368", lineHeight: 1.7 }}>
                            • Unmute mic → Hindi &amp; English auto-detected<br />
                            • For English only: click <strong style={{ color: "#60A5FA" }}>English</strong><br />
                            • For Odia: click <strong style={{ color: "#60A5FA" }}>ଓଡ଼ିଆ</strong> — your speech prints as English words
                        </div>
                    </div>
                ) : (
                    <>
                        {transcript.map((line, i) => {
                            const color = speakerColor(line.name);
                            const isOdia = line.language === SUPPORTED_LANGS.ODIA.code;
                            return (
                                <div key={i} style={{ ...S.line, borderLeftColor: color }}>
                                    <div style={S.lineTop}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ ...S.speaker, color }}>{line.name}</span>
                                            {isOdia && (
                                                <span style={S.odiaBadge}>Odia→En</span>
                                            )}
                                        </div>
                                        <span style={S.time}>{line.time}</span>
                                    </div>
                                    <div style={S.text}>{line.text}</div>
                                </div>
                            );
                        })}
                        <div ref={bottomRef} />
                    </>
                )}
            </div>

            {/* Footer */}
            <div style={S.footer}>
                <button
                    onClick={handleSaveAndDownload}
                    disabled={saving || !transcript.length}
                    style={{ ...S.saveBtn, opacity: !transcript.length ? 0.4 : 1, cursor: !transcript.length ? "not-allowed" : "pointer" }}
                >
                    {saving ? "⏳ Saving..." : "💾 Save & Download"}
                </button>
                {transcript.length > 0 && (
                    <button onClick={() => confirm("Clear transcript?") && clearTranscript()} style={S.clearBtn} title="Clear">🗑️</button>
                )}
            </div>

            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
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
    langRow: { display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderBottom: "1px solid #2A2A2A", flexShrink: 0, flexWrap: "wrap" },
    langLabel: { fontSize: 11, color: "#5F6368", fontWeight: 600, marginRight: 2 },
    langBtn: { padding: "5px 12px", border: "1px solid #3C4043", borderRadius: 99, background: "#2A2A2A", color: "#9AA0A6", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" },
    langActive: { background: "#1E3A5F", color: "#60A5FA", border: "1px solid #3B82F6" },
    odiaBanner: { padding: "7px 14px", background: "rgba(251,191,36,0.08)", border: "none", borderBottom: "1px solid #2A2A2A", fontSize: 11, color: "#FCD34D", flexShrink: 0 },
    odiaBadge: { fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: "rgba(251,191,36,0.15)", color: "#FCD34D", border: "1px solid rgba(251,191,36,0.3)" },
    body: { flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 },
    empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#9AA0A6", fontSize: 13, textAlign: "center", paddingTop: 30 },
    line: { background: "#242424", borderRadius: 8, padding: "8px 10px", borderLeft: "3px solid #1A73E8", flexShrink: 0 },
    lineTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
    speaker: { fontSize: 12, fontWeight: 700 },
    time: { fontSize: 10, color: "#5F6368" },
    text: { fontSize: 13, color: "#E8EAED", lineHeight: 1.5 },
    footer: { padding: "10px 12px", borderTop: "1px solid #2A2A2A", display: "flex", gap: 8, flexShrink: 0 },
    saveBtn: { flex: 1, padding: "9px 0", background: "linear-gradient(135deg,#1A73E8,#0D47A1)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
    clearBtn: { padding: "9px 12px", background: "#2A2A2A", border: "1px solid #3C4043", borderRadius: 8, color: "#9AA0A6", fontSize: 13, cursor: "pointer" },
};