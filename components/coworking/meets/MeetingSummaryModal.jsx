"use client";
/**
 * components/coworking/meets/MeetingSummaryModal.jsx
 *
 * Full-page AI meeting summary modal.
 * Responsive: desktop (wide) + mobile (full screen).
 */

import { useState, useEffect } from "react";
import { firebaseAuth } from "../../../lib/coworkFirebase";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function getToken() {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken(false);
}

async function fetchSummary(meetId) {
    const token = await getToken();
    const res = await fetch(`${BASE}/cowork/audio/summary/${meetId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch summary");
    return data;
}

async function generateSummary(meetId) {
    const token = await getToken();
    const res = await fetch(`${BASE}/cowork/audio/summary/${meetId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to generate summary");
    return data;
}

async function downloadDocx(meetId) {
    try {
        const token = await getToken();
        const res = await fetch(`${BASE}/cowork/audio/summary/${meetId}/download`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            alert(d.error || "Download failed. Generate summary first.");
            return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const fileName = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1]
            || `Meeting_Summary_${meetId}.docx`;
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        alert("Download failed: " + e.message);
    }
}

// ── Speaker colours ───────────────────────────────────────────────────────────
const PALETTE = ["#1a73e8", "#0f9d58", "#d93025", "#f29900", "#7b1fa2", "#00acc1", "#e64a19", "#0097a7", "#558b2f", "#ad1457"];
const _clrMap = {};
let _clrIdx = 0;
function spkColor(name) {
    if (!_clrMap[name]) { _clrMap[name] = PALETTE[_clrIdx++ % PALETTE.length]; }
    return _clrMap[name];
}

// ── Parse dialogue rows ───────────────────────────────────────────────────────
function getRows(summary) {
    if (summary.dialogue?.length > 0) return summary.dialogue;
    return (summary.conversationFlow || []).map(l => {
        const i = l.indexOf(":");
        return i > 0 ? { speaker: l.slice(0, i).trim(), text: l.slice(i + 1).trim().replace(/^"|"$/g, "") } : { speaker: "—", text: l };
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function MeetingSummaryModal({ meetId, meetTitle, onClose }) {
    const [phase, setPhase] = useState("loading");
    const [summary, setSummary] = useState(null);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState("summary");

    useEffect(() => {
        if (!meetId) return;
        (async () => {
            try {
                setPhase("loading");
                const data = await fetchSummary(meetId);
                if (data.exists && data.summary) { setSummary(data.summary); setPhase("done"); }
                else setPhase("empty");
            } catch (e) { setError(e.message); setPhase("error"); }
        })();
    }, [meetId]);

    // Close on Escape key
    useEffect(() => {
        const h = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const handleGenerate = async () => {
        setPhase("generating"); setError("");
        try {
            const data = await generateSummary(meetId);
            setSummary(data.summary); setPhase("done");
        } catch (e) { setError(e.message); setPhase("error"); }
    };

    const TABS = [
        { id: "summary", label: "📋 Summary", count: null },
        { id: "convo", label: "💬 Conversation", count: summary ? getRows(summary).length : null },
        { id: "tasks", label: "✅ Tasks", count: summary?.tasksAssigned?.length || null },
        { id: "deadlines", label: "⏰ Deadlines", count: summary?.deadlines?.length || null },
        { id: "actions", label: "🚀 Action Items", count: summary?.actionItems?.length || null },
    ];

    return (
        <>
            {/* ── Responsive CSS ── */}
            <style>{`
                @keyframes msm-fadein  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
                @keyframes msm-spin    { to{transform:rotate(360deg)} }
                @keyframes msm-rowIn  { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:translateX(0)} }

                .msm-overlay {
                    position:fixed; inset:0; z-index:99999;
                    background:rgba(0,0,0,0.55);
                    display:flex; align-items:center; justify-content:center;
                    padding:16px;
                    backdrop-filter:blur(6px);
                    font-family:'Google Sans','Roboto',sans-serif;
                }
                .msm-modal {
                    background:#fff;
                    border-radius:20px;
                    width:100%; max-width:960px;
                    height:92vh; max-height:860px;
                    display:flex; flex-direction:column;
                    box-shadow:0 32px 80px rgba(0,0,0,0.3);
                    animation:msm-fadein 0.28s cubic-bezier(.4,0,.2,1);
                    overflow:hidden;
                }
                .msm-header {
                    display:flex; align-items:center; justify-content:space-between;
                    padding:20px 28px;
                    border-bottom:1px solid #E4E7EC;
                    background:#fff;
                    flex-shrink:0;
                }
                .msm-body {
                    flex:1; display:flex; flex-direction:column;
                    overflow:hidden; padding:0;
                }
                .msm-participants {
                    display:flex; align-items:center; flex-wrap:wrap; gap:8px;
                    padding:14px 28px;
                    background:#F8FAFF;
                    border-bottom:1px solid #E4E7EC;
                    flex-shrink:0;
                }
                .msm-tabs {
                    display:flex; gap:0;
                    border-bottom:2px solid #E4E7EC;
                    flex-shrink:0;
                    overflow-x:auto;
                    scrollbar-width:none;
                    padding:0 28px;
                    background:#fff;
                }
                .msm-tabs::-webkit-scrollbar { display:none; }
                .msm-tab {
                    padding:14px 20px;
                    font-size:13px; font-weight:500;
                    color:#6B7280; background:transparent;
                    border:none; border-bottom:2px solid transparent;
                    cursor:pointer; font-family:inherit;
                    white-space:nowrap;
                    margin-bottom:-2px;
                    transition:all 0.15s;
                    display:flex; align-items:center; gap:6px;
                }
                .msm-tab:hover { color:#1a73e8; background:#F0F4FF; }
                .msm-tab.active {
                    color:#1a73e8;
                    border-bottom-color:#1a73e8;
                    font-weight:700;
                }
                .msm-tab-count {
                    background:#E8F0FE; color:#1a73e8;
                    border-radius:99px; padding:1px 7px;
                    font-size:11px; font-weight:700;
                }
                .msm-content {
                    flex:1; overflow-y:auto;
                    padding:28px;
                }
                .msm-content::-webkit-scrollbar { width:6px; }
                .msm-content::-webkit-scrollbar-thumb { background:#E4E7EC; border-radius:3px; }
                .msm-footer {
                    display:flex; gap:12px; align-items:center;
                    padding:16px 28px;
                    border-top:1px solid #E4E7EC;
                    background:#fff;
                    flex-shrink:0;
                }
                /* Dialogue table */
                .msm-dialogue-table {
                    width:100%;
                    border:1px solid #E4E7EC;
                    border-radius:12px;
                    overflow:hidden;
                    border-collapse:collapse;
                }
                .msm-dialogue-table th {
                    text-align:left; padding:12px 20px;
                    background:#F8F9FA;
                    font-size:11px; font-weight:700;
                    color:#6B7280; text-transform:uppercase; letter-spacing:0.06em;
                    border-bottom:1px solid #E4E7EC;
                }
                .msm-dialogue-table td {
                    padding:13px 20px;
                    vertical-align:top;
                    font-size:13.5px;
                    border-bottom:1px solid #F1F3F4;
                    line-height:1.6;
                }
                .msm-dialogue-table tr:last-child td { border-bottom:none; }
                .msm-dialogue-table tr:nth-child(even) td { background:#FAFBFF; }
                .msm-dialogue-table tr { animation:msm-rowIn 0.18s ease both; }
                .msm-speaker-cell {
                    width:160px; min-width:130px;
                    font-weight:700;
                }
                /* Task card */
                .msm-task {
                    background:#F0FDF4; border:1px solid #BBF7D0;
                    border-radius:10px; padding:14px 18px; margin-bottom:10px;
                }
                .msm-task-name { font-size:11px; font-weight:700; color:#16A34A; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.04em; }
                .msm-task-text { font-size:13.5px; color:#1F2937; line-height:1.6; }
                /* Deadline card */
                .msm-deadline {
                    display:flex; gap:14px; align-items:flex-start;
                    background:#FFF7ED; border:1px solid #FED7AA;
                    border-radius:10px; padding:14px 18px; margin-bottom:10px;
                }
                /* Action item */
                .msm-action {
                    display:flex; gap:12px; align-items:flex-start;
                    padding:12px 0; border-bottom:1px solid #F1F3F4;
                }
                .msm-action:last-child { border-bottom:none; }
                .msm-action-num {
                    width:26px; height:26px; border-radius:50%;
                    background:#EBF3FE; color:#1a73e8;
                    font-size:12px; font-weight:700;
                    display:flex; align-items:center; justify-content:center;
                    flex-shrink:0; margin-top:1px;
                }
                /* Summary box */
                .msm-summary-box {
                    background:linear-gradient(135deg,#F8FAFF,#EFF6FF);
                    border:1px solid #DBEAFE;
                    border-radius:14px; padding:24px 28px;
                    font-size:15px; color:#1F2937; line-height:1.85;
                    letter-spacing:0.01em;
                }
                .msm-meta {
                    font-size:12px; color:#9AA0A6; margin-top:14px;
                    display:flex; align-items:center; gap:10px;
                }
                .msm-meta-dot { width:3px; height:3px; border-radius:50%; background:#D1D5DB; }
                /* Empty state */
                .msm-empty {
                    text-align:center; padding:48px 24px;
                    color:#9AA0A6;
                }
                /* Center state */
                .msm-center {
                    display:flex; flex-direction:column;
                    align-items:center; justify-content:center;
                    flex:1; text-align:center; padding:40px 24px;
                }

                /* ── Mobile ── */
                @media(max-width:640px) {
                    .msm-overlay { padding:0; }
                    .msm-modal {
                        border-radius:0; height:100vh; max-height:100vh;
                    }
                    .msm-header { padding:16px 18px; }
                    .msm-participants { padding:10px 18px; }
                    .msm-tabs { padding:0 8px; }
                    .msm-tab { padding:12px 12px; font-size:12px; }
                    .msm-content { padding:18px; }
                    .msm-footer { padding:12px 18px; }
                    .msm-speaker-cell { width:100px; min-width:90px; }
                    .msm-summary-box { padding:18px; font-size:14px; }
                }
            `}</style>

            <div className="msm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
                <div className="msm-modal">

                    {/* ── Header ── */}
                    <div className="msm-header">
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>

                            <div>
                                <div style={{ fontSize: 20, fontWeight: 500, color: "#1729ea", letterSpacing: "-0.01em" }}>
                                    Cowork Meeting Summary
                                </div>
                                <div style={{ fontSize: 23, fontWeight: 600, color: "#eb1c1c", marginTop: 2 }}>
                                    {meetTitle || meetId} &nbsp;·&nbsp; <span style={{ fontFamily: "monospace", color: "#0c0101" }}>{meetId}</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} style={{
                            width: 38, height: 38, borderRadius: "50%",
                            border: "1.5px solid #E4E7EC", background: "#F8F9FA",
                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                            color: "#6B7280", fontSize: 18, lineHeight: 1,
                        }}>✕</button>
                    </div>

                    {/* ── Body ── */}
                    <div className="msm-body">

                        {/* LOADING */}
                        {phase === "loading" && (
                            <div className="msm-center">
                                <div style={{ width: 44, height: 44, border: "3px solid #E4E7EC", borderTopColor: "#1a73e8", borderRadius: "50%", animation: "msm-spin 0.8s linear infinite" }} />
                                <div style={{ fontSize: 14, color: "#6B7280", marginTop: 16 }}>Checking for existing summary…</div>
                            </div>
                        )}

                        {/* NO SUMMARY YET */}
                        {phase === "empty" && (
                            <div className="msm-center">
                                <div style={{ fontSize: 64, marginBottom: 20 }}>🎙️</div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "#111827", marginBottom: 10 }}>
                                    No summary yet
                                </div>
                                <div style={{ fontSize: 14, color: "#6B7280", maxWidth: 380, lineHeight: 1.7, marginBottom: 32 }}>
                                    Gemini AI will analyze all audio recordings from this meeting and generate a full summary — including conversation flow, tasks, and deadlines.
                                </div>
                                <button onClick={handleGenerate} style={{
                                    padding: "13px 36px",
                                    background: "linear-gradient(135deg,#1a73e8,#0D47A1)",
                                    color: "#fff", border: "none", borderRadius: 12,
                                    fontSize: 15, fontWeight: 700, cursor: "pointer",
                                    fontFamily: "inherit",
                                    boxShadow: "0 6px 20px rgba(26,115,232,0.4)",
                                }}>
                                    ✨ Generate AI Summary
                                </button>
                            </div>
                        )}

                        {/* GENERATING */}
                        {phase === "generating" && (
                            <div className="msm-center">
                                <div style={{ position: "relative", width: 72, height: 72 }}>
                                    <div style={{ width: 72, height: 72, border: "4px solid #E4E7EC", borderTopColor: "#1a73e8", borderRadius: "50%", animation: "msm-spin 0.9s linear infinite" }} />
                                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🤖</div>
                                </div>
                                <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", marginTop: 20, marginBottom: 10 }}>
                                    Gemini is analyzing…
                                </div>
                                <div style={{ fontSize: 13, color: "#9AA0A6", lineHeight: 1.8, maxWidth: 340 }}>
                                    Downloading audio files<br />
                                    → Sending to Gemini AI<br />
                                    → Extracting conversation, tasks &amp; deadlines<br />
                                    <span style={{ color: "#1a73e8", fontWeight: 600 }}>Takes 20–60 seconds</span>
                                </div>
                            </div>
                        )}

                        {/* ERROR */}
                        {phase === "error" && (
                            <div className="msm-center">
                                <div style={{ fontSize: 52, marginBottom: 16 }}>⚠️</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: "#D93025", marginBottom: 10 }}>Something went wrong</div>
                                <div style={{
                                    fontSize: 13, color: "#6B7280",
                                    background: "#FEF2F2", border: "1px solid #FECDD3",
                                    borderRadius: 10, padding: "14px 20px",
                                    maxWidth: 420, lineHeight: 1.6, marginBottom: 24,
                                }}>
                                    {error}
                                </div>
                                <button onClick={handleGenerate} style={{
                                    padding: "11px 28px",
                                    background: "#1a73e8", color: "#fff",
                                    border: "none", borderRadius: 10,
                                    fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                                }}>🔄 Try Again</button>
                            </div>
                        )}

                        {/* DONE */}
                        {phase === "done" && summary && (
                            <>
                                {/* Participants */}
                                {summary.participants?.length > 0 && (
                                    <div className="msm-participants">
                                        <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em" }}>PARTICIPANTS:</span>
                                        {summary.participants.map((p, i) => (
                                            <span key={i} style={{
                                                padding: "4px 12px",
                                                background: `${spkColor(p)}18`,
                                                color: spkColor(p),
                                                border: `1px solid ${spkColor(p)}40`,
                                                borderRadius: 99, fontSize: 12, fontWeight: 600,
                                            }}>{p}</span>
                                        ))}
                                    </div>
                                )}

                                {/* Tabs */}
                                <div className="msm-tabs">
                                    {TABS.map(t => (
                                        <button
                                            key={t.id}
                                            className={`msm-tab${activeTab === t.id ? " active" : ""}`}
                                            onClick={() => setActiveTab(t.id)}
                                        >
                                            {t.label}
                                            {t.count > 0 && <span className="msm-tab-count">{t.count}</span>}
                                        </button>
                                    ))}
                                </div>

                                {/* Tab content */}
                                <div className="msm-content">

                                    {/* SUMMARY TAB — compact dashboard */}
                                    {activeTab === "summary" && (() => {
                                        const rows = getRows(summary);
                                        const tasks = summary.tasksAssigned || [];
                                        const deadlines = summary.deadlines || [];
                                        const actions = summary.actionItems || [];
                                        return (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                                                {/* ── Overview text ── */}
                                                <div className="msm-summary-box">
                                                    {summary.summary || "No summary available."}
                                                </div>


                                                {/* ── Tasks compact ── */}
                                                {tasks.length > 0 && (
                                                    <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: "14px 18px" }}>
                                                        <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                                                            ✅ Tasks Assigned
                                                            <span style={{ background: "#16A34A", color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: 10 }}>{tasks.length}</span>
                                                        </div>
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                                            {tasks.slice(0, 4).map((t, i) => {
                                                                const ci = t.indexOf(":");
                                                                const hasName = ci > 0 && ci < 30;
                                                                const name = hasName ? t.slice(0, ci).trim() : null;
                                                                const text = hasName ? t.slice(ci + 1).trim() : t;
                                                                // Truncate to ~80 chars
                                                                const short = text.length > 85 ? text.slice(0, 85) + "…" : text;
                                                                return (
                                                                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                                                                        <span style={{ fontSize: 12, fontWeight: 700, color: spkColor(name || "task"), flexShrink: 0, minWidth: 60 }}>
                                                                            {name || "·"}
                                                                        </span>
                                                                        <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{short}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                            {tasks.length > 4 && (
                                                                <div style={{ fontSize: 12, color: "#16A34A", fontWeight: 600, cursor: "pointer" }} onClick={() => setActiveTab("tasks")}>
                                                                    +{tasks.length - 4} more → click Tasks tab
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── Deadlines compact ── */}
                                                {deadlines.length > 0 && (
                                                    <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 12, padding: "14px 18px" }}>
                                                        <div style={{ fontSize: 11, fontWeight: 700, color: "#D97706", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                                                            ⏰ Deadlines
                                                            <span style={{ background: "#D97706", color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: 10 }}>{deadlines.length}</span>
                                                        </div>
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                                            {deadlines.slice(0, 3).map((d, i) => {
                                                                const short = d.length > 90 ? d.slice(0, 90) + "…" : d;
                                                                return (
                                                                    <div key={i} style={{ fontSize: 13, color: "#92400E", display: "flex", gap: 8 }}>
                                                                        <span style={{ flexShrink: 0 }}>›</span>
                                                                        <span style={{ lineHeight: 1.5 }}>{short}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                            {deadlines.length > 3 && (
                                                                <div style={{ fontSize: 12, color: "#D97706", fontWeight: 600, cursor: "pointer" }} onClick={() => setActiveTab("deadlines")}>
                                                                    +{deadlines.length - 3} more → click Deadlines tab
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── Action items compact ── */}
                                                {actions.length > 0 && (
                                                    <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "14px 18px" }}>
                                                        <div style={{ fontSize: 11, fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                                                            🚀 Action Items
                                                            <span style={{ background: "#1a73e8", color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: 10 }}>{actions.length}</span>
                                                        </div>
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                                            {actions.slice(0, 3).map((a, i) => {
                                                                const short = a.length > 90 ? a.slice(0, 90) + "…" : a;
                                                                return (
                                                                    <div key={i} style={{ fontSize: 13, color: "#1e40af", display: "flex", gap: 8 }}>
                                                                        <span style={{ flexShrink: 0, fontWeight: 700 }}>{i + 1}.</span>
                                                                        <span style={{ lineHeight: 1.5 }}>{short}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                            {actions.length > 3 && (
                                                                <div style={{ fontSize: 12, color: "#1a73e8", fontWeight: 600, cursor: "pointer" }} onClick={() => setActiveTab("actions")}>
                                                                    +{actions.length - 3} more → click Action Items tab
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── Meta ── */}
                                                <div className="msm-meta">
                                                    <span>{summary.audioFilesCount || 0} audio files</span>
                                                    <span className="msm-meta-dot" />
                                                    <span>{summary.participants?.length || 0} participants</span>
                                                    <span className="msm-meta-dot" />
                                                    <span>
                                                        {summary.createdAtMs
                                                            ? new Date(summary.createdAtMs).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                                                            : "Generated recently"}
                                                    </span>
                                                </div>

                                            </div>
                                        );
                                    })()}

                                    {/* CONVERSATION TAB */}
                                    {activeTab === "convo" && (() => {
                                        const rows = getRows(summary);
                                        if (rows.length === 0) return (
                                            <div className="msm-empty">
                                                <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
                                                <div>No conversation data available.</div>
                                            </div>
                                        );
                                        return (
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>
                                                    Full Conversation · {rows.length} exchanges
                                                </div>
                                                <table className="msm-dialogue-table">
                                                    <thead>
                                                        <tr>
                                                            <th className="msm-speaker-cell">Speaker</th>
                                                            <th>Dialogue</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {rows.map((row, i) => {
                                                            const c = spkColor(row.speaker);
                                                            return (
                                                                <tr key={i} style={{ animationDelay: `${i * 0.03}s` }}>
                                                                    <td className="msm-speaker-cell" style={{ color: c }}>
                                                                        {row.speaker}
                                                                    </td>
                                                                    <td style={{ color: "#1F2937" }}>
                                                                        "{row.text}"
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        );
                                    })()}

                                    {/* TASKS TAB */}
                                    {activeTab === "tasks" && (
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>
                                                Tasks Assigned
                                            </div>
                                            {(summary.tasksAssigned || []).length === 0
                                                ? <div className="msm-empty"><div style={{ fontSize: 40 }}>✅</div><div>No tasks were assigned.</div></div>
                                                : (summary.tasksAssigned || []).map((task, i) => {
                                                    const ci = task.indexOf(":");
                                                    const hasName = ci > 0 && ci < 30;
                                                    const name = hasName ? task.slice(0, ci).trim() : null;
                                                    const text = hasName ? task.slice(ci + 1).trim() : task;
                                                    return (
                                                        <div key={i} className="msm-task">
                                                            {name && <div className="msm-task-name" style={{ color: spkColor(name) }}>{name}</div>}
                                                            <div className="msm-task-text">{text}</div>
                                                        </div>
                                                    );
                                                })
                                            }
                                        </div>
                                    )}

                                    {/* DEADLINES TAB */}
                                    {activeTab === "deadlines" && (
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>
                                                Deadlines Mentioned
                                            </div>
                                            {(summary.deadlines || []).length === 0
                                                ? <div className="msm-empty"><div style={{ fontSize: 40 }}>⏰</div><div>No specific deadlines were mentioned.</div></div>
                                                : (summary.deadlines || []).map((d, i) => (
                                                    <div key={i} className="msm-deadline">
                                                        <span style={{ fontSize: 22, flexShrink: 0 }}>⏰</span>
                                                        <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>{d}</div>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    )}

                                    {/* ACTION ITEMS TAB */}
                                    {activeTab === "actions" && (
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>
                                                Action Items &amp; Next Steps
                                            </div>
                                            {(summary.actionItems || []).length === 0
                                                ? <div className="msm-empty"><div style={{ fontSize: 40 }}>🚀</div><div>No action items recorded.</div></div>
                                                : (summary.actionItems || []).map((a, i) => (
                                                    <div key={i} className="msm-action">
                                                        <div className="msm-action-num">{i + 1}</div>
                                                        <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, paddingTop: 3 }}>{a}</div>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    )}

                                </div>

                                {/* Footer */}
                                <div className="msm-footer">
                                    <button onClick={handleGenerate} style={{
                                        padding: "10px 18px",
                                        background: "#F8F9FA", border: "1px solid #E4E7EC",
                                        borderRadius: 10, fontSize: 13, fontWeight: 600,
                                        color: "#6B7280", cursor: "pointer", fontFamily: "inherit",
                                        display: "flex", alignItems: "center", gap: 6,
                                    }}>
                                        🔄 Regenerate
                                    </button>
                                    <button onClick={() => downloadDocx(meetId)} style={{
                                        flex: 1, padding: "11px 0",
                                        background: "linear-gradient(135deg,#1a73e8,#0D47A1)",
                                        color: "#fff", border: "none", borderRadius: 10,
                                        fontSize: 14, fontWeight: 700,
                                        cursor: "pointer", fontFamily: "inherit",
                                        boxShadow: "0 4px 12px rgba(26,115,232,0.3)",
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                    }}>
                                        ⬇ Download Summary (.docx)
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}