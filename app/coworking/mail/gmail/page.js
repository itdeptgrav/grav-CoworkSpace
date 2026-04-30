"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../../hooks/useCoworkAuth";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function fetchEmployeeGmail(employeeId, max = 30) {
    const res = await fetch(`${BASE}/api/google/employee-gmail/inbox?employeeId=${encodeURIComponent(employeeId)}&max=${max}`);
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Gmail fetch failed"); }
    return res.json();
}

function decodeBase64(data) {
    if (!data) return "";
    try { return atob(data.replace(/-/g, "+").replace(/_/g, "/")); } catch { return ""; }
}

function getFromName(from = "") {
    return from.includes("<") ? from.split("<")[0].trim().replace(/"/g, "") : from;
}

function formatDate(dateMs) {
    if (!dateMs) return "";
    const d = new Date(dateMs);
    const now = new Date();
    return d.toDateString() === now.toDateString()
        ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// ── Email detail panel ────────────────────────────────────────────────────────
function EmailDetail({ email, onBack }) {
    const fromName = getFromName(email.from);
    const dateStr = email.dateMs
        ? new Date(email.dateMs).toLocaleString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : email.date || "";

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#fafafa" }}>
            {/* Header */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12, background: "#fff", flexShrink: 0 }}>
                <button onClick={onBack} style={{ border: "none", background: "none", cursor: "pointer", padding: 6, borderRadius: 6, display: "flex", color: "#64748b" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                </button>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#0f172a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {email.subject}
                </h2>
                {email.isStarred && <span style={{ color: "#f59e0b", fontSize: 16 }}>★</span>}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                    {/* Email meta */}
                    <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#ea4335", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
                                {(fromName || "?")[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 2 }}>{fromName || email.from}</div>
                                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                                    {email.from.includes("<") ? email.from.match(/<(.+)>/)?.[1] : email.from}
                                </div>
                            </div>
                            <span style={{ fontSize: 11.5, color: "#94a3b8", flexShrink: 0 }}>{dateStr}</span>
                        </div>
                        {(email.to || email.cc) && (
                            <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 10, paddingLeft: 52 }}>
                                {email.to && <div><b style={{ color: "#64748b" }}>To:</b> {email.to}</div>}
                                {email.cc && <div><b style={{ color: "#64748b" }}>Cc:</b> {email.cc}</div>}
                            </div>
                        )}
                    </div>
                    {/* Email content */}
                    <div
                        style={{ padding: "20px", fontSize: 14, lineHeight: 1.7, color: "#1e293b", overflowX: "auto" }}
                        dangerouslySetInnerHTML={{ __html: email.body || `<p style="color:#94a3b8">${email.snippet || "(no content)"}</p>` }}
                    />
                    {/* Attachments */}
                    {email.attachments?.length > 0 && (
                        <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {email.attachments.map((a, i) => (
                                <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12, color: "#475569" }}>
                                    📎 {a.filename} {a.size ? `(${Math.round(a.size / 1024)}KB)` : ""}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Email row ─────────────────────────────────────────────────────────────────
function EmailRow({ email, selected, onSelect }) {
    const fromName = getFromName(email.from);
    const dateStr = formatDate(email.dateMs);
    const isUnread = email.isUnread;

    return (
        <div
            onClick={onSelect}
            style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "12px 16px", cursor: "pointer",
                borderBottom: "1px solid #f1f5f9",
                background: selected ? "#eff6ff" : "transparent",
                transition: "background 0.1s",
                position: "relative",
            }}
            onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "#f8fafc"; }}
            onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
        >
            {/* Unread dot */}
            {isUnread && (
                <div style={{ position: "absolute", left: 5, top: "50%", transform: "translateY(-50%)", width: 6, height: 6, borderRadius: "50%", background: "#ea4335" }} />
            )}
            {/* Avatar */}
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#ea4335", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                {(fromName || "?")[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: isUnread ? 700 : 500, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fromName || email.from || "(Unknown)"}
                    </span>
                    <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0, fontWeight: isUnread ? 600 : 400 }}>{dateStr}</span>
                </div>
                <div style={{ fontSize: 13, color: isUnread ? "#0f172a" : "#475569", fontWeight: isUnread ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 1 }}>
                    {email.subject || "(no subject)"}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {email.snippet || ""}
                </div>
            </div>
            {email.isStarred && <span style={{ color: "#f59e0b", fontSize: 13, flexShrink: 0 }}>★</span>}
        </div>
    );
}

// ── Main Gmail Page ───────────────────────────────────────────────────────────
// ── Gmail Loader ─────────────────────────────────────────────────────────────
function GmailLoader() {
    const [step, setStep] = useState(0);
    const steps = [
        { icon: "🔍", text: "Peeking into your inbox…" },
        { icon: "📬", text: "Waking up your emails…" },
        { icon: "🚀", text: "Launching messages into orbit…" },
        { icon: "🎯", text: "Almost there, hold tight…" },
        { icon: "✨", text: "Polishing your inbox…" },
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setStep(s => (s + 1) % steps.length);
        }, 1100);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, #fff5f5 0%, #fff 50%, #f0f9ff 100%)",
            gap: 0, padding: 40,
        }}>
            {/* Animated envelope */}
            <div style={{ position: "relative", marginBottom: 32 }}>
                {/* Orbit ring */}
                <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    width: 110, height: 110, borderRadius: "50%",
                    border: "2px dashed #fca5a5",
                    transform: "translate(-50%, -50%)",
                    animation: "orbitRing 4s linear infinite",
                    opacity: 0.6,
                }} />
                {/* Orbiting dot */}
                <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    width: 110, height: 110,
                    transform: "translate(-50%, -50%)",
                    animation: "orbitDot 2s linear infinite",
                }}>
                    <div style={{
                        position: "absolute", top: -6, left: "50%",
                        width: 12, height: 12, borderRadius: "50%",
                        background: "linear-gradient(135deg, #ea4335, #4285F4)",
                        boxShadow: "0 0 8px rgba(234,67,53,0.6)",
                        transform: "translateX(-50%)",
                    }} />
                </div>

                {/* Center envelope */}
                <div style={{
                    width: 90, height: 90, borderRadius: 20,
                    background: "#fff",
                    border: "2px solid #fca5a5",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 44,
                    boxShadow: "0 12px 40px rgba(234,67,53,0.15)",
                    animation: "pulse 1.5s ease-in-out infinite",
                    position: "relative", zIndex: 2,
                }}>
                    📩
                </div>
            </div>

            {/* Step text */}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
                <div style={{
                    fontSize: 28, marginBottom: 10,
                    animation: "stepPop 0.4s cubic-bezier(0.2,0,0,1.5)",
                    key: step,
                }}>
                    {steps[step].icon}
                </div>
                <div style={{
                    fontSize: 15, fontWeight: 700, color: "#0f172a",
                    marginBottom: 4, letterSpacing: "-0.02em",
                    animation: "fadeSlideUp 0.4s ease",
                }}>
                    {steps[step].text}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    This takes about 5 seconds ☕
                </div>
            </div>

            {/* Progress bar */}
            <div style={{ width: 260, position: "relative" }}>
                <div style={{
                    height: 6, borderRadius: 99,
                    background: "#fee2e2", overflow: "hidden",
                }}>
                    <div style={{
                        height: "100%", borderRadius: 99,
                        background: "linear-gradient(90deg, #ea4335, #fbbc05, #34a853, #4285F4)",
                        backgroundSize: "300% 100%",
                        animation: "progressBar 5s ease-in-out forwards, shimmer 1.5s linear infinite",
                        width: "100%",
                    }} />
                </div>
                {/* Dots below bar */}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    {["Connect", "Fetch", "Decode", "Ready"].map((label, i) => (
                        <div key={label} style={{ textAlign: "center" }}>
                            <div style={{
                                width: 8, height: 8, borderRadius: "50%", margin: "0 auto 4px",
                                background: step > i ? "#ea4335" : "#e2e8f0",
                                transition: "background 0.3s",
                                boxShadow: step > i ? "0 0 6px rgba(234,67,53,0.5)" : "none",
                            }} />
                            <span style={{ fontSize: 9.5, color: step > i ? "#ea4335" : "#cbd5e1", fontWeight: 600 }}>
                                {label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                @keyframes orbitRing { to { transform: translate(-50%,-50%) rotate(360deg); } }
                @keyframes orbitDot { to { transform: translate(-50%,-50%) rotate(360deg); } }
                @keyframes pulse {
                    0%,100% { transform: scale(1); box-shadow: 0 12px 40px rgba(234,67,53,0.15); }
                    50% { transform: scale(1.06); box-shadow: 0 16px 48px rgba(234,67,53,0.25); }
                }
                @keyframes progressBar {
                    0% { transform: scaleX(0); transform-origin: left; }
                    100% { transform: scaleX(1); transform-origin: left; }
                }
                @keyframes shimmer {
                    0% { background-position: 100% 0; }
                    100% { background-position: -100% 0; }
                }
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes stepPop {
                    from { transform: scale(0.5); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
}

export default function GmailPage() {
    const { employeeId, loading: authLoading } = useCoworkAuth();
    const router = useRouter();
    const [emails, setEmails] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [connected, setConnected] = useState(false);
    const [connectedEmail, setConnectedEmail] = useState("");
    const [search, setSearch] = useState("");
    const [isMobile, setIsMobile] = useState(false);
    const [view, setView] = useState("list"); // "list" | "detail"

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    useEffect(() => {
        if (!employeeId || authLoading) return;
        setLoading(true);
        fetchEmployeeGmail(employeeId, 40)
            .then(res => {
                setConnected(res.connected);
                setConnectedEmail(res.connectedEmail || "");
                setEmails(res.messages || []);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [employeeId, authLoading]);

    const filtered = emails.filter(e => !search ||
        [e.subject, e.from, e.snippet].join(" ").toLowerCase().includes(search.toLowerCase())
    );
    const unreadCount = emails.filter(e => e.isUnread).length;

    const handleSelect = (email) => {
        setSelected(email);
        if (isMobile) setView("detail");
    };

    const handleBack = () => {
        setSelected(null);
        setView("list");
    };

    if (authLoading) return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#64748b", fontSize: 13 }}>
            Loading…
        </div>
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#fff", fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

            {/* ── Top bar ── */}
            <div style={{ padding: "0 20px", height: 56, display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #e2e8f0", flexShrink: 0, background: "#fff" }}>
                <button onClick={() => router.back()} style={{ border: "none", background: "none", cursor: "pointer", padding: 6, borderRadius: 6, color: "#64748b", display: "flex" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                </button>
                {/* Gmail G icon */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <div>
                    <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>My Gmail</h1>
                    {connectedEmail && <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{connectedEmail}</p>}
                </div>
                {unreadCount > 0 && (
                    <span style={{ marginLeft: "auto", background: "#ea4335", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99 }}>
                        {unreadCount} unread
                    </span>
                )}
            </div>

            {/* ── Content ── */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

                {/* Not connected state — fun empty screen */}
                {!loading && !error && !connected && (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", background: "linear-gradient(135deg, #fff5f5 0%, #fff 60%, #f0f9ff 100%)" }}>

                        {/* Animated envelope illustration */}
                        <div style={{ position: "relative", marginBottom: 32 }}>
                            {/* Floating letters around */}
                            {["📧", "✉️", "📨"].map((e, i) => (
                                <div key={i} style={{
                                    position: "absolute",
                                    fontSize: 20,
                                    animation: `floatLetter${i} 3s ease-in-out infinite`,
                                    animationDelay: `${i * 0.8}s`,
                                    opacity: 0.6,
                                    top: i === 0 ? -30 : i === 1 ? 10 : -20,
                                    left: i === 0 ? -50 : i === 1 ? 110 : -30,
                                }}>{e}</div>
                            ))}

                            {/* Main sad envelope */}
                            <div style={{
                                width: 120, height: 120,
                                background: "linear-gradient(135deg, #fef2f2, #fff)",
                                border: "3px solid #fca5a5",
                                borderRadius: 24,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 56,
                                boxShadow: "0 20px 60px rgba(239,68,68,0.15), 0 4px 12px rgba(0,0,0,0.06)",
                                animation: "wobble 2.5s ease-in-out infinite",
                                position: "relative", zIndex: 1,
                            }}>
                                📭
                            </div>

                            {/* Disconnected plug icon */}
                            <div style={{
                                position: "absolute", bottom: -8, right: -8,
                                background: "#fbbf24", borderRadius: "50%",
                                width: 32, height: 32,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 16, border: "3px solid #fff",
                                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                                zIndex: 2,
                            }}>🔌</div>
                        </div>

                        {/* Text */}
                        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em" }}>
                            Your inbox is lonely! 👀
                        </h2>
                        <p style={{ margin: "0 0 6px", fontSize: 14, color: "#64748b", maxWidth: 320, lineHeight: 1.7 }}>
                            Looks like Gmail hasn't been introduced to CoWork yet.
                        </p>
                        <p style={{ margin: "0 0 28px", fontSize: 13, color: "#94a3b8", maxWidth: 280, lineHeight: 1.6 }}>
                            Go to <strong style={{ color: "#475569" }}>Settings → Connect Gmail</strong> and they'll be best friends in 30 seconds. 🤝
                        </p>

                        {/* CTA Button */}
                        <a href="/coworking/settings" style={{
                            display: "inline-flex", alignItems: "center", gap: 10,
                            padding: "13px 24px",
                            background: "linear-gradient(135deg, #ea4335, #cc2d20)",
                            color: "#fff", borderRadius: 12,
                            textDecoration: "none", fontSize: 14, fontWeight: 700,
                            boxShadow: "0 8px 24px rgba(234,67,53,0.35)",
                            transition: "transform 0.15s, box-shadow 0.15s",
                            letterSpacing: "-0.01em",
                        }}
                            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(234,67,53,0.45)"; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(234,67,53,0.35)"; }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" />
                            </svg>
                            Connect Gmail Now
                        </a>

                        {/* Fun steps */}
                        <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", maxWidth: 380 }}>
                            {[
                                { emoji: "⚙️", text: "Open Settings" },
                                { emoji: "→", text: "", small: true },
                                { emoji: "🔗", text: "Connect Gmail" },
                                { emoji: "→", text: "", small: true },
                                { emoji: "🎉", text: "Done!" },
                            ].map((s, i) => (
                                <div key={i} style={{
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    flexDirection: s.small ? "row" : "column",
                                    gap: 4, minWidth: s.small ? "auto" : 70,
                                }}>
                                    <span style={{ fontSize: s.small ? 14 : 22, color: s.small ? "#cbd5e1" : "inherit" }}>{s.emoji}</span>
                                    {!s.small && <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{s.text}</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Loading — stylish funny professional */}
                {loading && <GmailLoader />}

                {/* Error */}
                {error && !loading && (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
                        <div>
                            <p style={{ color: "#ef4444", fontWeight: 600, marginBottom: 8 }}>Error loading Gmail</p>
                            <p style={{ color: "#64748b", fontSize: 13 }}>{error}</p>
                        </div>
                    </div>
                )}

                {/* Connected — email list + detail */}
                {!loading && !error && connected && (
                    <>
                        {/* Email list */}
                        {(!isMobile || view === "list") && (
                            <div style={{ width: isMobile ? "100%" : 360, display: "flex", flexDirection: "column", borderRight: "1px solid #e2e8f0", flexShrink: 0, background: "#fff" }}>
                                {/* Search */}
                                <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9" }}>
                                    <div style={{ position: "relative" }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                                            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                                        </svg>
                                        <input value={search} onChange={e => setSearch(e.target.value)}
                                            placeholder="Search Gmail…"
                                            style={{ width: "100%", padding: "8px 12px 8px 32px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", background: "#f8fafc", color: "#0f172a", boxSizing: "border-box" }} />
                                    </div>
                                    <p style={{ margin: "6px 0 0", fontSize: 11, color: "#94a3b8" }}>
                                        {filtered.length} email{filtered.length !== 1 ? "s" : ""}
                                        {unreadCount > 0 && ` · ${unreadCount} unread`}
                                    </p>
                                </div>
                                {/* Rows */}
                                <div style={{ flex: 1, overflowY: "auto" }}>
                                    {filtered.length === 0 ? (
                                        <div style={{ padding: "60px 24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                                            {search ? "No results found" : "No emails in inbox"}
                                        </div>
                                    ) : (
                                        filtered.map(email => (
                                            <EmailRow key={email.id} email={email}
                                                selected={selected?.id === email.id}
                                                onSelect={() => handleSelect(email)} />
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Email detail */}
                        {(!isMobile || view === "detail") && (
                            selected
                                ? <EmailDetail email={selected} onBack={handleBack} />
                                : <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 40, textAlign: "center", background: "#fafafa" }}>
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                        <polyline points="22,6 12,13 2,6" />
                                    </svg>
                                    <div>
                                        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#475569" }}>No email selected</p>
                                        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>Click an email to read it</p>
                                    </div>
                                </div>
                        )}
                    </>
                )}
            </div>

            <style>{`
                @keyframes gmail-spin { to { transform: rotate(360deg); } }
                @keyframes wobble {
                    0%, 100% { transform: rotate(-3deg) scale(1); }
                    25% { transform: rotate(3deg) scale(1.05); }
                    50% { transform: rotate(-2deg) scale(1); }
                    75% { transform: rotate(2deg) scale(1.03); }
                }
                @keyframes floatLetter0 {
                    0%, 100% { transform: translateY(0px) rotate(-10deg); }
                    50% { transform: translateY(-12px) rotate(5deg); }
                }
                @keyframes floatLetter1 {
                    0%, 100% { transform: translateY(0px) rotate(8deg); }
                    50% { transform: translateY(-10px) rotate(-5deg); }
                }
                @keyframes floatLetter2 {
                    0%, 100% { transform: translateY(0px) rotate(-5deg); }
                    50% { transform: translateY(-14px) rotate(10deg); }
                }
                * { box-sizing: border-box; }
            `}</style>
        </div>
    );
}