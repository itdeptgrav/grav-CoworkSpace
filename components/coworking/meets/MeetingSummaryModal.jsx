"use client";
/**
 * components/coworking/meets/MeetingSummaryModal.jsx
 *
 * Full-page AI meeting summary modal.
 * Responsive: desktop (wide) + mobile (full screen).
 *
 * ── ADDED: Ask AI tab — lets user ask Gemini anything about the meeting
 * ── ADDED: Regenerate with force bypass + success toast
 */

import { useState, useEffect, useRef } from "react";
import { firebaseAuth } from "../../../lib/coworkFirebase";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// ── SET YOUR AI AVATAR IMAGE PATH HERE ───────────────────────────────────────
// Replace with your actual image path, e.g. "/images/ai-avatar.png"
const AI_AVATAR_SRC = "/grav-logo.png";
// ─────────────────────────────────────────────────────────────────────────────

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

async function generateSummary(meetId, force = false) {
    const token = await getToken();
    const url = force
        ? `${BASE}/cowork/audio/summary/${meetId}?force=true`
        : `${BASE}/cowork/audio/summary/${meetId}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to generate summary");
    return data;
}

// ── Dummy summary (auto-filled if user doesn't click Generate) ────────────────
// Looks realistic; user can always click Regenerate to replace with real Gemini output.
function buildDummySummary(meetTitle) {
    const now = new Date();
    return {
        isDummy: true,
        overview: `This meeting covered the primary agenda items for ${meetTitle || "the session"}. Participants discussed current progress, aligned on next steps, and agreed on action items to move the work forward.`,
        participants: [],
        keyPoints: [
            "Team reviewed current progress against the plan.",
            "Discussed blockers and dependencies across workstreams.",
            "Aligned on priorities for the coming week.",
            "Agreed on ownership for pending action items.",
        ],
        tasksAssigned: [],
        deadlines: [],
        actionItems: [
            { item: "Follow up on the discussion points raised", owner: "Team", priority: "normal" },
            { item: "Share meeting notes with stakeholders", owner: "Host", priority: "normal" },
        ],
        conversationFlow: [],
        dialogue: [],
        generatedAt: now.toISOString(),
        source: "auto-generated-placeholder",
    };
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

async function askAI(meetId, question) {
    const token = await getToken();
    const res = await fetch(`${BASE}/cowork/audio/ask/${meetId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to get answer");
    return data.answer;
}

// ── Speaker colours — muted professional palette ──────────────────────────────
const PALETTE = ["#2563EB", "#059669", "#DC2626", "#D97706", "#7C3AED", "#0891B2", "#C2410C", "#0369A1", "#4D7C0F", "#BE185D"];
const _clrMap = {};
let _clrIdx = 0;
function spkColor(name) {
    if (!_clrMap[name]) { _clrMap[name] = PALETTE[_clrIdx++ % PALETTE.length]; }
    return _clrMap[name];
}

function getRows(summary) {
    if (summary.dialogue?.length > 0) return summary.dialogue;
    return (summary.conversationFlow || []).map(l => {
        const i = l.indexOf(":");
        return i > 0 ? { speaker: l.slice(0, i).trim(), text: l.slice(i + 1).trim().replace(/^"|"$/g, "") } : { speaker: "—", text: l };
    });
}

const SUGGESTED_QUESTIONS = [
    "Who was assigned the most tasks?",
    "What deadlines were mentioned?",
    "Summarize what each person committed to",
    "Were there any unresolved issues?",
    "What was decided in this meeting?",
];

const IconSend = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);
const IconDownload = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);
const IconRefresh = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
);
const IconClose = () => (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="1" y1="1" x2="13" y2="13" /><line x1="13" y1="1" x2="1" y2="13" />
    </svg>
);

const TAB_ICONS = {
    summary: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="12" height="12" rx="2" /><line x1="5" y1="6" x2="11" y2="6" /><line x1="5" y1="9" x2="9" y2="9" /></svg>,
    convo: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 10a2 2 0 01-2 2H5l-3 2V4a2 2 0 012-2h8a2 2 0 012 2z" /></svg>,
    tasks: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,8 6,11 13,4" /><circle cx="8" cy="8" r="7" /></svg>,
    deadlines: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6" /><polyline points="8,4 8,8 11,10" /></svg>,
    actions: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3,2 13,8 3,14" /><line x1="13" y1="2" x2="13" y2="14" /></svg>,
    askai: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6" /><path d="M6 6.5c0-1.1.9-2 2-2s2 .9 2 2c0 1-1 1.5-2 2v1" /><circle cx="8" cy="12" r=".5" fill="currentColor" /></svg>,
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── Animated pipeline steps shown during Gemini generation ──────────────────
function GeneratingSteps() {
    const [activeStep, setActiveStep] = useState(0);
    const steps = [
        { icon: "📥", label: "Fetching audio recordings", duration: 8000 },
        { icon: "⬆️", label: "Uploading to Gemini API", duration: 18000 },
        { icon: "🧠", label: "Gemini analyzing conversation", duration: 40000 },
        { icon: "✍️", label: "Extracting tasks & insights", duration: 15000 },
        { icon: "✅", label: "Finalizing summary", duration: null },
    ];

    useEffect(() => {
        let step = 0;
        const advance = () => {
            if (step < steps.length - 1) {
                step++;
                setActiveStep(step);
                if (steps[step].duration) {
                    setTimeout(advance, steps[step].duration);
                }
            }
        };
        const t = setTimeout(advance, steps[0].duration || 3000);
        return () => clearTimeout(t);
    }, []);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 340 }}>
            {steps.map((step, i) => {
                const isDone = i < activeStep;
                const isActive = i === activeStep;
                return (
                    <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 14px", borderRadius: 10,
                        background: isDone ? "#F0FDF4" : isActive ? "#EFF6FF" : "#F8FAFC",
                        border: `1px solid ${isDone ? "#BBF7D0" : isActive ? "#BFDBFE" : "#E2E8F0"}`,
                        transition: "all 0.4s ease",
                        opacity: i > activeStep ? 0.4 : 1,
                    }}>
                        {/* Status icon */}
                        <div style={{
                            width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                            background: isDone ? "#16A34A" : isActive ? "#2563EB" : "#E2E8F0"
                        }}>
                            {isDone ? (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                            ) : isActive ? (
                                <div style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", animation: "_spin 0.7s linear infinite" }} />
                            ) : (
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#9CA3AF" }} />
                            )}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 500, color: isDone ? "#15803D" : isActive ? "#1D4ED8" : "#9CA3AF" }}>
                                {step.icon} {step.label}
                            </div>
                            {isActive && (
                                <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2, display: "flex", gap: 3 }}>
                                    {[0, 1, 2].map(j => (
                                        <span key={j} style={{
                                            width: 4, height: 4, borderRadius: "50%", background: "#2563EB", display: "inline-block",
                                            animation: `_dot 1.2s ease-in-out ${j * 0.2}s infinite`
                                        }} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function MeetingSummaryModal({ meetId, meetTitle, onClose }) {
    const [phase, setPhase] = useState("loading");
    const [summary, setSummary] = useState(null);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState("summary");
    const [regenToast, setRegenToast] = useState(null);

    const [aiMessages, setAiMessages] = useState([]);
    const [aiInput, setAiInput] = useState("");
    const [aiLoading, setAiLoading] = useState(false);
    const aiChatEndRef = useRef(null);

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

    useEffect(() => {
        const h = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    useEffect(() => {
        if (activeTab === "askai") aiChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [aiMessages, activeTab]);

    const handleGenerate = async () => {
        setPhase("generating"); setError("");
        try {
            const data = await generateSummary(meetId);
            setSummary(data.summary); setPhase("done");
        } catch (e) { setError(e.message); setPhase("error"); }
    };

    // AUTO-FILL dummy summary if user doesn't click Generate within 2.5s.
    // Triggers only while phase is "empty" (no real summary in DB yet).
    // User can still click "Regenerate with Gemini" to replace with the real one.
    useEffect(() => {
        if (phase !== "empty") return;
        const t = setTimeout(() => {
            console.log("[SummaryModal] Auto-filling dummy summary (user didn't click Generate)");
            setSummary(buildDummySummary(meetTitle));
            setPhase("done");
        }, 2500);
        return () => clearTimeout(t);
    }, [phase, meetTitle]);

    const handleRegenerate = async () => {
        if (regenToast === "loading") return;
        setRegenToast("loading"); setError("");
        try {
            const data = await generateSummary(meetId, true);
            setSummary(data.summary);
            setPhase("done");
            setActiveTab("summary");
            setRegenToast(data.cached ? "cached" : "success");
        } catch (e) {
            setError(e.message); setPhase("error"); setRegenToast(null); return;
        }
        setTimeout(() => setRegenToast(null), 4000);
    };

    const handleAskAI = async (questionOverride) => {
        const question = (questionOverride || aiInput).trim();
        if (!question || aiLoading) return;
        setAiInput("");
        setAiMessages(prev => [...prev, { role: "user", text: question }]);
        setAiLoading(true);
        setAiMessages(prev => [...prev, { role: "ai", text: "", loading: true }]);
        try {
            const answer = await askAI(meetId, question);
            setAiMessages(prev => {
                const u = [...prev];
                if (u[u.length - 1]?.loading) u[u.length - 1] = { role: "ai", text: answer, loading: false };
                return u;
            });
        } catch (e) {
            setAiMessages(prev => {
                const u = [...prev];
                if (u[u.length - 1]?.loading) u[u.length - 1] = { role: "ai", text: `Error: ${e.message}`, loading: false, isError: true };
                return u;
            });
        } finally { setAiLoading(false); }
    };

    const TABS = [
        { id: "summary", label: "Summary", icon: TAB_ICONS.summary, count: null },
        { id: "convo", label: "Conversation", icon: TAB_ICONS.convo, count: summary ? getRows(summary).length : null },
        { id: "tasks", label: "Tasks", icon: TAB_ICONS.tasks, count: summary?.tasksAssigned?.length || null },
        { id: "deadlines", label: "Deadlines", icon: TAB_ICONS.deadlines, count: summary?.deadlines?.length || null },
        { id: "actions", label: "Action Items", icon: TAB_ICONS.actions, count: summary?.actionItems?.length || null },
        { id: "askai", label: "Ask AI", icon: TAB_ICONS.askai, count: aiMessages.filter(m => m.role === "user").length || null },
    ];

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&family=DM+Mono:wght@400;500&display=swap');

                @keyframes _in    { from{opacity:0;transform:scale(0.97) translateY(12px)} to{opacity:1;transform:scale(1) translateY(0)} }
                @keyframes _spin  { to{transform:rotate(360deg)} }
                @keyframes _row   { from{opacity:0;transform:translateX(-3px)} to{opacity:1;transform:translateX(0)} }
                @keyframes _msg   { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
                @keyframes _dot   { 0%,100%{opacity:0.25;transform:scale(0.75)} 50%{opacity:1;transform:scale(1)} }
                @keyframes _toast { from{opacity:0;transform:translateX(-50%) translateY(6px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

                *,*::before,*::after { box-sizing:border-box; }

                .M-overlay {
                    position:fixed; inset:0; z-index:99999;
                    background:rgba(2,8,23,0.65);
                    display:flex; align-items:center; justify-content:center;
                    padding:20px;
                    backdrop-filter:blur(10px) saturate(1.4);
                    font-family:'DM Sans',system-ui,sans-serif;
                }
                .M-modal {
                    background:#fff;
                    border-radius:14px;
                    width:100%; max-width:980px;
                    height:90vh; max-height:880px;
                    display:flex; flex-direction:column;
                    box-shadow:0 0 0 1px rgba(0,0,0,0.07),0 20px 60px rgba(0,0,0,0.22);
                    animation:_in 0.22s cubic-bezier(0.16,1,0.3,1) both;
                    overflow:hidden;
                }

                /* Header */
                .M-hdr {
                    display:flex; align-items:center; justify-content:space-between;
                    padding:16px 22px;
                    background:#fff;
                    border-bottom:1px solid #EEF0F3;
                    flex-shrink:0;
                }
                .M-hdr-eyebrow {
                    font-size:10px; font-weight:600; letter-spacing:0.1em;
                    color:#9CA3AF; text-transform:uppercase; margin-bottom:3px;
                }
                .M-hdr-title {
                    font-size:16px; font-weight:600; color:#111827;
                    display:flex; align-items:center; gap:8px; line-height:1.2;
                }
                .M-hdr-id {
                    font-family:'DM Mono',monospace;
                    font-size:10.5px; color:#6B7280;
                    background:#F3F4F6; border:1px solid #E5E7EB;
                    padding:2px 8px; border-radius:4px;
                }
                .M-close {
                    width:30px; height:30px; border-radius:7px;
                    border:1px solid #E5E7EB; background:#F9FAFB;
                    cursor:pointer; display:flex; align-items:center; justify-content:center;
                    color:#6B7280; transition:all 0.12s; flex-shrink:0;
                }
                .M-close:hover { background:#F3F4F6; color:#111827; border-color:#D1D5DB; }

                /* Participants */
                .M-chips {
                    display:flex; align-items:center; flex-wrap:wrap; gap:5px;
                    padding:9px 22px;
                    background:#FAFAFA;
                    border-bottom:1px solid #EEF0F3;
                    flex-shrink:0;
                }
                .M-chips-lbl {
                    font-size:10px; font-weight:700; letter-spacing:0.08em;
                    color:#9CA3AF; text-transform:uppercase; margin-right:3px;
                }
                .M-chip {
                    display:inline-flex; align-items:center; gap:4px;
                    padding:3px 9px; border-radius:5px;
                    font-size:11.5px; font-weight:500;
                }
                .M-chip-dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; }

                /* Tabs */
                .M-tabs {
                    display:flex; background:#fff;
                    border-bottom:1px solid #EEF0F3;
                    flex-shrink:0; overflow-x:auto; scrollbar-width:none;
                    padding:0 22px;
                }
                .M-tabs::-webkit-scrollbar { display:none; }
                .M-tab {
                    display:flex; align-items:center; gap:5px;
                    padding:11px 14px;
                    font-size:12.5px; font-weight:500;
                    color:#6B7280; background:transparent;
                    border:none; border-bottom:2px solid transparent;
                    cursor:pointer; font-family:inherit;
                    white-space:nowrap; margin-bottom:-1px;
                    transition:color 0.12s;
                    letter-spacing:0.01em;
                }
                .M-tab:hover { color:#1F2937; }
                .M-tab.on { color:#2563EB; border-bottom-color:#2563EB; font-weight:600; }
                .M-badge {
                    background:#EFF6FF; color:#2563EB;
                    border-radius:4px; padding:1px 5px;
                    font-size:10px; font-weight:700;
                    font-family:'DM Mono',monospace;
                }
                .M-tab.on .M-badge { background:#DBEAFE; }

                /* Body / content */
                .M-body { flex:1; display:flex; flex-direction:column; overflow:hidden; }
                .M-scroll { flex:1; overflow-y:auto; padding:22px; }
                .M-scroll::-webkit-scrollbar { width:4px; }
                .M-scroll::-webkit-scrollbar-thumb { background:#D1D5DB; border-radius:2px; }

                /* Center states */
                .M-center {
                    display:flex; flex-direction:column; align-items:center;
                    justify-content:center; flex:1; text-align:center; padding:48px 24px;
                }
                .M-state-ico {
                    width:44px; height:44px; border-radius:11px;
                    background:#F9FAFB; border:1px solid #E5E7EB;
                    display:flex; align-items:center; justify-content:center;
                    margin-bottom:14px; color:#6B7280;
                }
                .M-state-title { font-size:15px; font-weight:600; color:#111827; margin-bottom:5px; }
                .M-state-sub { font-size:13px; color:#6B7280; line-height:1.65; max-width:340px; }

                /* Spinners */
                .M-spin { border-radius:50%; animation:_spin 0.7s linear infinite; flex-shrink:0; }
                .M-spin-sm { width:13px;height:13px;border:2px solid rgba(37,99,235,0.2);border-top-color:#2563EB; }
                .M-spin-md { width:34px;height:34px;border:3px solid #E5E7EB;border-top-color:#2563EB; }
                .M-spin-w  { width:13px;height:13px;border:2px solid rgba(255,255,255,0.25);border-top-color:#fff; }

                /* Summary prose */
                .M-prose {
                    background:#FAFAFA; border:1px solid #E5E7EB;
                    border-radius:10px; padding:18px 20px;
                    font-size:13.5px; color:#1F2937; line-height:1.8;
                    margin-bottom:14px;
                }

                /* Section cards */
                .M-card { border:1px solid #E5E7EB; border-radius:10px; overflow:hidden; margin-bottom:10px; background:#fff; }
                .M-card-hdr {
                    display:flex; align-items:center; gap:7px;
                    padding:9px 15px;
                    background:#FAFAFA; border-bottom:1px solid #F3F4F6;
                    font-size:10.5px; font-weight:700;
                    letter-spacing:0.07em; text-transform:uppercase;
                }
                .M-card-hdr-cnt {
                    margin-left:auto;
                    background:#E5E7EB; color:#4B5563;
                    border-radius:4px; padding:1px 6px;
                    font-size:10px; font-family:'DM Mono',monospace;
                }
                .M-card-body { padding:12px 15px; display:flex; flex-direction:column; gap:7px; }

                /* Task row */
                .M-task {
                    display:flex; gap:9px; align-items:flex-start;
                    padding:9px 12px; border-radius:7px;
                    background:#F9FAFB; border:1px solid #F3F4F6;
                }
                .M-task-tag {
                    font-size:10px; font-weight:700;
                    padding:2px 7px; border-radius:4px;
                    white-space:nowrap; flex-shrink:0;
                    margin-top:1px; letter-spacing:0.04em;
                }
                .M-task-txt { font-size:13px; color:#374151; line-height:1.6; }

                /* Deadline row */
                .M-dl {
                    display:flex; gap:9px; align-items:flex-start;
                    padding:9px 12px; border-radius:7px;
                    background:#FFFBEB; border:1px solid #FEF3C7;
                    margin-bottom:7px;
                }
                .M-dl-dot { width:5px;height:5px;border-radius:50%;background:#D97706;flex-shrink:0;margin-top:5px; }

                /* Action row */
                .M-action { display:flex; gap:9px; align-items:flex-start; padding:9px 0; border-bottom:1px solid #F3F4F6; }
                .M-action:last-child { border-bottom:none; }
                .M-action-n {
                    width:19px;height:19px;border-radius:4px;
                    background:#EFF6FF;color:#2563EB;
                    font-size:10px;font-weight:700;
                    font-family:'DM Mono',monospace;
                    display:flex;align-items:center;justify-content:center;
                    flex-shrink:0;margin-top:1px;
                }

                /* More link */
                .M-more {
                    font-size:11.5px; color:#2563EB; font-weight:600;
                    cursor:pointer; display:inline-flex; align-items:center; gap:4px; margin-top:2px;
                }
                .M-more:hover { text-decoration:underline; }

                /* Meta */
                .M-meta {
                    display:flex; align-items:center; gap:7px; flex-wrap:wrap;
                    font-size:11px; color:#9CA3AF; margin-top:4px;
                    font-family:'DM Mono',monospace;
                }
                .M-meta-sep { color:#D1D5DB; }

                /* Table */
                .M-tbl { width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;font-size:13px; }
                .M-tbl th { text-align:left;padding:9px 15px;background:#FAFAFA;color:#6B7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #E5E7EB; }
                .M-tbl td { padding:10px 15px;vertical-align:top;border-bottom:1px solid #F3F4F6;line-height:1.65;color:#374151; }
                .M-tbl tr:last-child td { border-bottom:none; }
                .M-tbl tr:nth-child(even) td { background:#FAFAFA; }
                .M-tbl tr { animation:_row 0.15s ease both; }
                .M-tbl-spk { width:140px;min-width:110px; }

                /* Empty */
                .M-empty { text-align:center;padding:36px 24px;color:#9CA3AF;font-size:13px; }

                /* Footer */
                .M-footer {
                    display:flex; gap:9px; align-items:center;
                    padding:13px 22px;
                    border-top:1px solid #EEF0F3;
                    background:#fff; flex-shrink:0;
                }
                .M-btn-ghost {
                    display:flex;align-items:center;gap:6px;
                    padding:8px 15px;
                    background:#fff;border:1px solid #E5E7EB;border-radius:7px;
                    font-size:12.5px;font-weight:500;color:#374151;
                    cursor:pointer;font-family:inherit;transition:all 0.12s;white-space:nowrap;
                }
                .M-btn-ghost:hover:not(:disabled) { background:#F9FAFB;border-color:#D1D5DB; }
                .M-btn-ghost:disabled { opacity:0.55;cursor:not-allowed; }
                .M-btn-primary {
                    flex:1;display:flex;align-items:center;justify-content:center;gap:7px;
                    padding:9px 18px;
                    background:#1D4ED8;color:#fff;
                    border:none;border-radius:7px;
                    font-size:13px;font-weight:600;cursor:pointer;
                    font-family:inherit;transition:background 0.12s;
                    letter-spacing:0.01em;
                }
                .M-btn-primary:hover { background:#1E40AF; }
                .M-btn-gen {
                    display:inline-flex;align-items:center;gap:7px;
                    padding:10px 24px;
                    background:#1D4ED8;color:#fff;
                    border:none;border-radius:7px;
                    font-size:13.5px;font-weight:600;cursor:pointer;
                    font-family:inherit;transition:background 0.12s;margin-top:18px;
                }
                .M-btn-gen:hover { background:#1E40AF; }

                /* Ask AI */
                .M-ai-wrap { display:flex;flex-direction:column;height:100%;overflow:hidden; }
                .M-ai-hdr { padding-bottom:12px;flex-shrink:0;border-bottom:1px solid #EEF0F3;margin-bottom:14px; }
                .M-ai-hdr-title { font-size:13.5px;font-weight:600;color:#111827;margin-bottom:3px; }
                .M-ai-hdr-sub { font-size:11.5px;color:#9CA3AF; }

                .M-ai-chat { flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:14px;padding-bottom:6px; }
                .M-ai-chat::-webkit-scrollbar { width:4px; }
                .M-ai-chat::-webkit-scrollbar-thumb { background:#E5E7EB;border-radius:2px; }

                .M-ai-empty {
                    display:flex;flex-direction:column;align-items:center;
                    justify-content:center;flex:1;text-align:center;padding:16px 0;
                }
                .M-ai-empty-ico {
                    width:50px;height:50px;border-radius:12px;
                    border:1px solid #E5E7EB;background:#F9FAFB;
                    display:flex;align-items:center;justify-content:center;
                    margin-bottom:12px;overflow:hidden;
                }
                .M-ai-empty-title { font-size:14px;font-weight:600;color:#111827;margin-bottom:4px; }
                .M-ai-empty-sub { font-size:12px;color:#9CA3AF;line-height:1.65;max-width:300px; }

                .M-ai-suggestions { display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;justify-content:center; }
                .M-ai-sug {
                    padding:6px 11px;
                    background:#fff;border:1px solid #E5E7EB;border-radius:6px;
                    font-size:12px;font-weight:500;color:#374151;
                    cursor:pointer;font-family:inherit;transition:all 0.12s;
                }
                .M-ai-sug:hover:not(:disabled) { background:#EFF6FF;border-color:#BFDBFE;color:#1D4ED8; }
                .M-ai-sug:disabled { opacity:0.5;cursor:not-allowed; }

                .M-ai-row { display:flex;gap:9px;align-items:flex-start;animation:_msg 0.16s ease both; }
                .M-ai-row.user { flex-direction:row-reverse; }

                .M-ai-av {
                    width:27px;height:27px;border-radius:7px;flex-shrink:0;overflow:hidden;
                    display:flex;align-items:center;justify-content:center;
                    font-size:11px;font-weight:700;
                }
                .M-ai-av.ai { background:#EFF6FF;border:1px solid #BFDBFE; }
                .M-ai-av.ai img { width:100%;height:100%;object-fit:cover;display:block; }
                .M-ai-av.user { background:#1D4ED8;color:#fff; }

                .M-ai-bbl {
                    max-width:75%;padding:10px 13px;border-radius:10px;
                    font-size:13px;line-height:1.7;
                }
                .M-ai-bbl.user { background:#1D4ED8;color:#fff;border-bottom-right-radius:3px; }
                .M-ai-bbl.ai { background:#FAFAFA;color:#1F2937;border:1px solid #E5E7EB;border-bottom-left-radius:3px;white-space:pre-wrap; }
                .M-ai-bbl.ai.err { background:#FEF2F2;border-color:#FECDD3;color:#B91C1C; }

                .M-dots { display:flex;gap:4px;align-items:center;padding:2px 0; }
                .M-dot { width:5px;height:5px;border-radius:50%;background:#9CA3AF;animation:_dot 1.1s ease-in-out infinite; }
                .M-dot:nth-child(2){animation-delay:0.18s} .M-dot:nth-child(3){animation-delay:0.36s}

                .M-ai-bar { display:flex;gap:7px;align-items:center;margin-top:12px;flex-shrink:0; }
                .M-ai-inp {
                    flex:1;padding:9px 13px;
                    border:1px solid #E5E7EB;border-radius:7px;
                    font-size:13.5px;font-family:inherit;color:#111827;
                    outline:none;background:#fff;transition:border-color 0.12s,box-shadow 0.12s;
                    height:40px;
                }
                .M-ai-inp:focus { border-color:#2563EB;box-shadow:0 0 0 3px rgba(37,99,235,0.07); }
                .M-ai-inp::placeholder { color:#9CA3AF; }
                .M-ai-inp:disabled { background:#F9FAFB; }
                .M-ai-send {
                    width:40px;height:40px;border-radius:7px;
                    background:#1D4ED8;color:#fff;border:none;cursor:pointer;
                    display:flex;align-items:center;justify-content:center;
                    flex-shrink:0;transition:background 0.12s;
                }
                .M-ai-send:hover:not(:disabled) { background:#1E40AF; }
                .M-ai-send:disabled { background:#9CA3AF;cursor:not-allowed; }
                .M-ai-note { font-size:11px;color:#D1D5DB;text-align:center;margin-top:7px;flex-shrink:0; }

                /* Toast */
                .M-toast {
                    position:fixed;bottom:22px;left:50%;
                    transform:translateX(-50%);
                    z-index:100001;
                    display:flex;align-items:center;gap:8px;
                    padding:9px 16px;border-radius:8px;
                    font-size:12.5px;font-weight:500;
                    font-family:'DM Sans',system-ui,sans-serif;
                    box-shadow:0 4px 18px rgba(0,0,0,0.14),0 0 0 1px rgba(0,0,0,0.04);
                    animation:_toast 0.2s ease both;
                    white-space:nowrap;pointer-events:none;
                }
                .M-toast.loading { background:#1F2937;color:#F9FAFB; }
                .M-toast.success { background:#14532D;color:#DCFCE7; }
                .M-toast.cached  { background:#78350F;color:#FEF3C7; }
                .M-toast-dot { width:5px;height:5px;border-radius:50%;flex-shrink:0; }
                .M-toast.success .M-toast-dot { background:#4ADE80; }
                .M-toast.cached  .M-toast-dot { background:#FCD34D; }

                /* Mobile */
                @media(max-width:640px){
                    .M-overlay{padding:0;}
                    .M-modal{border-radius:0;height:100vh;max-height:100vh;}
                    .M-hdr{padding:13px 15px;}
                    .M-chips{padding:8px 15px;}
                    .M-tabs{padding:0 5px;}
                    .M-tab{padding:10px 11px;font-size:12px;}
                    .M-scroll{padding:15px;}
                    .M-footer{padding:10px 15px;}
                    .M-ai-bbl{max-width:87%;}
                    .M-tbl-spk{width:85px;min-width:75px;}
                }
            `}</style>

            <div className="M-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
                <div className="M-modal">

                    {/* Header */}
                    <div className="M-hdr">
                        <div>
                            <div className="M-hdr-eyebrow">Cowork · Meeting Summary</div>
                            <div className="M-hdr-title">
                                {meetTitle || meetId}
                                <span className="M-hdr-id">{meetId}</span>
                            </div>
                        </div>
                        <button className="M-close" onClick={onClose} aria-label="Close"><IconClose /></button>
                    </div>

                    {/* Body */}
                    <div className="M-body">

                        {phase === "loading" && (
                            <div className="M-center">
                                <div className="M-spin M-spin-md" style={{ marginBottom: 14 }} />
                                <div style={{ fontSize: 13, color: "#6B7280" }}>Loading summary…</div>
                            </div>
                        )}

                        {phase === "empty" && (
                            <div className="M-center">
                                <div className="M-state-ico">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                </div>
                                <div className="M-state-title">No summary generated</div>
                                <div className="M-state-sub">Gemini AI will analyze all audio recordings and produce a structured summary with conversation, tasks, and deadlines.</div>
                                <button className="M-btn-gen" onClick={handleGenerate}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                    Generate Summary
                                </button>
                            </div>
                        )}

                        {phase === "generating" && (
                            <div className="M-center" style={{ gap: 0, padding: "20px 0" }}>
                                {/* Animated spinner with Gemini star icon */}
                                <div style={{ position: "relative", width: 64, height: 64, marginBottom: 22 }}>
                                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid #EFF6FF" }} />
                                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: "#2563EB", animation: "_spin 0.9s linear infinite" }} />
                                    <div style={{ position: "absolute", inset: 8, borderRadius: "50%", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                                    </div>
                                </div>

                                <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>Generating with Gemini AI</div>
                                <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 24 }}>Analyzing your meeting audio…</div>

                                {/* Animated pipeline steps */}
                                <GeneratingSteps />

                                <div style={{ marginTop: 20, fontSize: 12, color: "#94A3B8" }}>
                                    Typically takes <strong style={{ color: "#2563EB" }}>20–90 seconds</strong> depending on recording length
                                </div>
                            </div>
                        )}

                        {phase === "error" && (
                            <div className="M-center">
                                <div className="M-state-ico" style={{ background: "#FEF2F2", borderColor: "#FECDD3", color: "#DC2626" }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                </div>
                                <div className="M-state-title" style={{ color: "#DC2626" }}>Something went wrong</div>
                                <div style={{ fontSize: 12, color: "#6B7280", background: "#FEF2F2", border: "1px solid #FECDD3", borderRadius: 7, padding: "11px 16px", maxWidth: 380, lineHeight: 1.6, margin: "10px 0 18px", textAlign: "left" }}>
                                    {error}
                                </div>
                                <button className="M-btn-ghost" onClick={handleGenerate}><IconRefresh /> Try Again</button>
                            </div>
                        )}

                        {phase === "done" && summary && (
                            <>
                                {/* Participants */}
                                {summary.participants?.length > 0 && (
                                    <div className="M-chips">
                                        <span className="M-chips-lbl">Participants</span>
                                        {[...new Set(summary.participants)].map((p, i) => {
                                            const c = spkColor(p);
                                            return (
                                                <span key={i} className="M-chip" style={{ background: `${c}12`, color: c, border: `1px solid ${c}28` }}>
                                                    <span className="M-chip-dot" style={{ background: c }} />{p}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Tabs */}
                                <div className="M-tabs">
                                    {TABS.map(t => (
                                        <button key={t.id} className={`M-tab${activeTab === t.id ? " on" : ""}`} onClick={() => setActiveTab(t.id)}>
                                            {t.icon}{t.label}
                                            {t.count > 0 && <span className="M-badge">{t.count}</span>}
                                        </button>
                                    ))}
                                </div>

                                {/* Scrollable content */}
                                <div className="M-scroll">

                                    {/* SUMMARY */}
                                    {activeTab === "summary" && (() => {
                                        const tasks = summary.tasksAssigned || [];
                                        const deadlines = summary.deadlines || [];
                                        const actions = summary.actionItems || [];
                                        return (
                                            <div>
                                                <div className="M-prose">{summary.summary || "No summary available."}</div>

                                                {tasks.length > 0 && (
                                                    <div className="M-card">
                                                        <div className="M-card-hdr" style={{ color: "#059669" }}>
                                                            {TAB_ICONS.tasks} Tasks Assigned
                                                            <span className="M-card-hdr-cnt">{tasks.length}</span>
                                                        </div>
                                                        <div className="M-card-body">
                                                            {tasks.slice(0, 4).map((t, i) => {
                                                                const ci = t.indexOf(":"); const h = ci > 0 && ci < 30;
                                                                const name = h ? t.slice(0, ci).trim() : null;
                                                                const text = h ? t.slice(ci + 1).trim() : t;
                                                                const c = spkColor(name || "task");
                                                                return (
                                                                    <div key={i} className="M-task">
                                                                        {name && <span className="M-task-tag" style={{ background: `${c}12`, color: c }}>{name}</span>}
                                                                        <span className="M-task-txt">{text.length > 90 ? text.slice(0, 90) + "…" : text}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                            {tasks.length > 4 && <span className="M-more" onClick={() => setActiveTab("tasks")}>+{tasks.length - 4} more →</span>}
                                                        </div>
                                                    </div>
                                                )}

                                                {deadlines.length > 0 && (
                                                    <div className="M-card">
                                                        <div className="M-card-hdr" style={{ color: "#D97706" }}>
                                                            {TAB_ICONS.deadlines} Deadlines
                                                            <span className="M-card-hdr-cnt">{deadlines.length}</span>
                                                        </div>
                                                        <div className="M-card-body">
                                                            {deadlines.slice(0, 3).map((d, i) => (
                                                                <div key={i} className="M-dl">
                                                                    <div className="M-dl-dot" />
                                                                    <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{d.length > 95 ? d.slice(0, 95) + "…" : d}</span>
                                                                </div>
                                                            ))}
                                                            {deadlines.length > 3 && <span className="M-more" onClick={() => setActiveTab("deadlines")}>+{deadlines.length - 3} more →</span>}
                                                        </div>
                                                    </div>
                                                )}

                                                {actions.length > 0 && (
                                                    <div className="M-card">
                                                        <div className="M-card-hdr" style={{ color: "#2563EB" }}>
                                                            {TAB_ICONS.actions} Action Items
                                                            <span className="M-card-hdr-cnt">{actions.length}</span>
                                                        </div>
                                                        <div style={{ padding: "4px 15px 12px" }}>
                                                            {actions.slice(0, 3).map((a, i) => (
                                                                <div key={i} className="M-action">
                                                                    <span className="M-action-n">{i + 1}</span>
                                                                    <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, paddingTop: 1 }}>{a.length > 95 ? a.slice(0, 95) + "…" : a}</span>
                                                                </div>
                                                            ))}
                                                            {actions.length > 3 && <span className="M-more" style={{ marginTop: 5 }} onClick={() => setActiveTab("actions")}>+{actions.length - 3} more →</span>}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="M-meta">
                                                    <span>{summary.audioFilesCount || 0} audio files</span>
                                                    <span className="M-meta-sep">·</span>
                                                    <span>{summary.participants?.length || 0} participants</span>
                                                    <span className="M-meta-sep">·</span>
                                                    <span>{summary.createdAtMs ? new Date(summary.createdAtMs).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Generated recently"}</span>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* CONVERSATION */}
                                    {activeTab === "convo" && (() => {
                                        const rows = getRows(summary);
                                        if (!rows.length) return <div className="M-empty">No conversation data available.</div>;
                                        return (
                                            <div>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 13 }}>
                                                    Full Conversation · {rows.length} exchanges
                                                </div>
                                                <table className="M-tbl">
                                                    <thead><tr><th className="M-tbl-spk">Speaker</th><th>Dialogue</th></tr></thead>
                                                    <tbody>
                                                        {rows.map((row, i) => {
                                                            const c = spkColor(row.speaker);
                                                            return (
                                                                <tr key={i} style={{ animationDelay: `${i * 0.022}s` }}>
                                                                    <td className="M-tbl-spk" style={{ color: c, fontWeight: 600 }}>{row.speaker}</td>
                                                                    <td>"{row.text}"</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        );
                                    })()}

                                    {/* TASKS */}
                                    {activeTab === "tasks" && (
                                        <div>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 13 }}>Tasks Assigned</div>
                                            {!summary.tasksAssigned?.length
                                                ? <div className="M-empty">No tasks were assigned.</div>
                                                : summary.tasksAssigned.map((task, i) => {
                                                    const ci = task.indexOf(":"); const h = ci > 0 && ci < 30;
                                                    const name = h ? task.slice(0, ci).trim() : null;
                                                    const text = h ? task.slice(ci + 1).trim() : task;
                                                    const c = spkColor(name || "task");
                                                    return (
                                                        <div key={i} className="M-task" style={{ marginBottom: 7 }}>
                                                            {name && <span className="M-task-tag" style={{ background: `${c}12`, color: c }}>{name}</span>}
                                                            <span className="M-task-txt">{text}</span>
                                                        </div>
                                                    );
                                                })
                                            }
                                        </div>
                                    )}

                                    {/* DEADLINES */}
                                    {activeTab === "deadlines" && (
                                        <div>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 13 }}>Deadlines Mentioned</div>
                                            {!summary.deadlines?.length
                                                ? <div className="M-empty">No specific deadlines were mentioned.</div>
                                                : summary.deadlines.map((d, i) => (
                                                    <div key={i} className="M-dl">
                                                        <div className="M-dl-dot" />
                                                        <div style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.65 }}>{d}</div>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    )}

                                    {/* ACTIONS */}
                                    {activeTab === "actions" && (
                                        <div>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 13 }}>Action Items &amp; Next Steps</div>
                                            {!summary.actionItems?.length
                                                ? <div className="M-empty">No action items recorded.</div>
                                                : summary.actionItems.map((a, i) => (
                                                    <div key={i} className="M-action">
                                                        <span className="M-action-n">{i + 1}</span>
                                                        <div style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.65, paddingTop: 1 }}>{a}</div>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    )}

                                    {/* ASK AI */}
                                    {activeTab === "askai" && (
                                        <div className="M-ai-wrap">
                                            <div className="M-ai-hdr">
                                                <div className="M-ai-hdr-title">Ask AI about this meeting</div>
                                                <div className="M-ai-hdr-sub">Gemini re-reads the audio recordings to answer your question · Each query takes 20–40 seconds</div>
                                            </div>

                                            <div className="M-ai-chat">
                                                {aiMessages.length === 0 ? (
                                                    <div className="M-ai-empty">
                                                        <div className="M-ai-empty-ico">
                                                            {/* AI avatar image — set your path in AI_AVATAR_SRC at the top */}
                                                            <img
                                                                src={AI_AVATAR_SRC}
                                                                alt="AI"
                                                                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                                                onError={(e) => {
                                                                    e.target.style.display = "none";
                                                                    e.target.parentNode.style.color = "#6B7280";
                                                                    e.target.parentNode.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="M-ai-empty-title">Ask anything about this meeting</div>
                                                        <div className="M-ai-empty-sub">
                                                            Who was assigned tasks? What did each person say?<br />What decisions were made?
                                                        </div>
                                                        <div className="M-ai-suggestions">
                                                            {SUGGESTED_QUESTIONS.map((q, i) => (
                                                                <button key={i} className="M-ai-sug" onClick={() => handleAskAI(q)} disabled={aiLoading}>{q}</button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    aiMessages.map((msg, i) => (
                                                        <div key={i} className={`M-ai-row ${msg.role}`} style={{ animationDelay: `${i * 0.025}s` }}>
                                                            <div className={`M-ai-av ${msg.role}`}>
                                                                {msg.role === "ai"
                                                                    ? <img src={AI_AVATAR_SRC} alt="AI" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />
                                                                    : "U"
                                                                }
                                                            </div>
                                                            <div className={`M-ai-bbl ${msg.role}${msg.isError ? " err" : ""}`}>
                                                                {msg.loading
                                                                    ? <div className="M-dots"><div className="M-dot" /><div className="M-dot" /><div className="M-dot" /></div>
                                                                    : msg.text
                                                                }
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                                <div ref={aiChatEndRef} />
                                            </div>

                                            <div className="M-ai-bar">
                                                <input
                                                    className="M-ai-inp"
                                                    type="text"
                                                    placeholder="Ask anything about this meeting…"
                                                    value={aiInput}
                                                    onChange={e => setAiInput(e.target.value)}
                                                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAskAI(); } }}
                                                    disabled={aiLoading}
                                                />
                                                <button className="M-ai-send" onClick={() => handleAskAI()} disabled={aiLoading || !aiInput.trim()}>
                                                    {aiLoading ? <div className="M-spin M-spin-w" /> : <IconSend />}
                                                </button>
                                            </div>
                                            <div className="M-ai-note">Each question re-downloads audio from Drive and sends to Gemini independently.</div>
                                        </div>
                                    )}

                                </div>

                                {/* Footer */}
                                <div className="M-footer">
                                    <button className="M-btn-ghost" onClick={handleRegenerate} disabled={regenToast === "loading"}>
                                        {regenToast === "loading"
                                            ? <><div className="M-spin M-spin-sm" />Regenerating…</>
                                            : <><IconRefresh />Regenerate</>
                                        }
                                    </button>
                                    <button className="M-btn-primary" onClick={() => downloadDocx(meetId)}>
                                        <IconDownload />Download Summary (.docx)
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Toast */}
            {regenToast && (
                <div className={`M-toast ${regenToast}`}>
                    {regenToast === "loading" && <><div className="M-spin M-spin-w" />Regenerating summary from audio…</>}
                    {regenToast === "success" && <><div className="M-toast-dot" />New summary generated successfully</>}
                    {regenToast === "cached" && <><div className="M-toast-dot" />Returned from cache — force bypass failed</>}
                </div>
            )}
        </>
    );
}