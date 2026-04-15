"use client";
/**
 * DMCallScreen.jsx
 * Full-screen overlay during any call state.
 * Used by both DMCallManager (inline) and GlobalCallReceiver (portal).
 */
import { useEffect, useState, useRef } from "react";

function initials(name = "") {
    return name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || "").join("").slice(0, 2) || "?";
}
function avColor(name = "") {
    const C = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return C[h % C.length];
}

function useDuration(active) {
    const [secs, setSecs] = useState(0);
    const ref = useRef(null);
    useEffect(() => {
        if (active) {
            setSecs(0);
            ref.current = setInterval(() => setSecs(s => s + 1), 1000);
        } else {
            clearInterval(ref.current);
        }
        return () => clearInterval(ref.current);
    }, [active]);
    return `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
}

function Btn({ icon, label, bg, onClick, size = 56 }) {
    const [hov, setHov] = useState(false);
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <button
                onClick={onClick}
                onMouseEnter={() => setHov(true)}
                onMouseLeave={() => setHov(false)}
                style={{
                    width: size, height: size, borderRadius: "50%", background: bg, border: "none",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                    transform: hov ? "scale(1.08)" : "scale(1)", transition: "transform 0.12s",
                    opacity: hov ? 0.88 : 1,
                }}
            >
                {icon}
            </button>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>{label}</span>
        </div>
    );
}

const PhoneOff = () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c1.12.43 2.33.67 3.53.67a2 2 0 012 2v3a2 2 0 01-2 2 19.79 19.79 0 01-8.63-3.07A19.42 19.42 0 013.07 8.63 19.79 19.79 0 01.1 4.02 2 2 0 012.1 2H5a2 2 0 012 1.72c.14.96.37 1.9.7 2.81a2 2 0 01-.45 2.11L6.18 9.91" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
);
const PhoneAnswer = () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63 19.79 19.79 0 01.1 4.02 2 2 0 012.08 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 9.91a16 16 0 006.18 6.18l1.48-1.48a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
);
const Mic = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0014 0" />
        <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
);
const MicOff = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
        <path d="M17 16.95A7 7 0 015 10v-1m14 0v1a7 7 0 01-.11 1.23" />
        <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
);
const SpeakerOn = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 010 14.14" />
        <path d="M15.54 8.46a5 5 0 010 7.07" />
    </svg>
);

export default function DMCallScreen({ call, onAnswer, onReject, onEnd }) {
    const { state, otherName, profilePicUrl, _onMuteChange } = call;
    const [muted, setMuted] = useState(false);
    const [speaker, setSpeaker] = useState(true);
    const isConnected = state === "connected";
    const isIncoming = state === "incoming";
    const isOutgoing = state === "outgoing";
    const isEnded = state === "ended";
    const duration = useDuration(isConnected);

    useEffect(() => {
        _onMuteChange?.(muted);
    }, [muted]);

    const statusLabel = isConnected ? duration
        : isOutgoing ? "Ringing…"
            : isIncoming ? "Incoming call"
                : isEnded ? "Call ended"
                    : "";

    const bg = avColor(otherName || "");
    const ini = initials(otherName || "");
    const showRings = isOutgoing || isIncoming;

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 99999,
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "space-between",
            padding: "clamp(38px,8vh,72px) 0 clamp(36px,7vh,54px)",
            fontFamily: "'Google Sans',Roboto,sans-serif", userSelect: "none", overflow: "hidden",
        }}>
            {/* Background */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#0B1315 0%,#0F1C20 50%,#0B1315 100%)" }} />
            <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle,rgba(255,255,255,0.027) 1px,transparent 1px)", backgroundSize: "22px 22px" }} />

            {/* Top tag */}
            <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.38)", letterSpacing: "0.08em" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63 19.79 19.79 0 01.1 4.02 2 2 0 012.08 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 9.91a16 16 0 006.18 6.18l1.48-1.48a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                </svg>
                AUDIO CALL
            </div>

            {/* Center */}
            <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <div style={{ position: "relative", width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {showRings && <>
                        <div style={{ position: "absolute", width: 130, height: 130, borderRadius: "50%", background: "rgba(255,255,255,0.07)", animation: "dmCallPulse 2s ease-out infinite", animationDelay: "0s" }} />
                        <div style={{ position: "absolute", width: 170, height: 170, borderRadius: "50%", background: "rgba(255,255,255,0.07)", animation: "dmCallPulse 2s ease-out infinite", animationDelay: "0.55s" }} />
                        <div style={{ position: "absolute", width: 210, height: 210, borderRadius: "50%", background: "rgba(255,255,255,0.07)", animation: "dmCallPulse 2s ease-out infinite", animationDelay: "1.1s" }} />
                    </>}
                    {profilePicUrl
                        ? <img src={profilePicUrl} alt="" style={{ width: 110, height: 110, borderRadius: "50%", objectFit: "cover", position: "relative", zIndex: 1, border: "3px solid rgba(255,255,255,0.18)", boxShadow: "0 8px 40px rgba(0,0,0,0.55)" }} />
                        : <div style={{ width: 110, height: 110, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, fontWeight: 700, color: "#fff", position: "relative", zIndex: 1, border: "3px solid rgba(255,255,255,0.18)", boxShadow: "0 8px 40px rgba(0,0,0,0.55)", background: bg }}>{ini}</div>
                    }
                </div>
                <div style={{ fontSize: "clamp(22px,6vw,30px)", fontWeight: 700, color: "#F1F5F9", letterSpacing: "-0.02em", textAlign: "center", maxWidth: "80vw" }}>{otherName}</div>
                <div style={{ fontSize: "clamp(13px,3.5vw,15px)", color: "rgba(255,255,255,0.5)", letterSpacing: "0.02em" }}>{statusLabel}</div>
            </div>

            {/* Controls */}
            <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "clamp(16px,7vw,44px)", padding: "0 20px" }}>
                {isIncoming ? (
                    <>
                        <Btn icon={<PhoneOff />} label="Decline" bg="#EF4444" size={70} onClick={onReject} />
                        <Btn icon={<PhoneAnswer />} label="Answer" bg="#22C55E" size={70} onClick={onAnswer} />
                    </>
                ) : (
                    <>
                        <Btn icon={muted ? <MicOff /> : <Mic />} label={muted ? "Unmute" : "Mute"} bg={muted ? "#374151" : "rgba(255,255,255,0.14)"} size={56} onClick={() => setMuted(m => !m)} />
                        <Btn icon={<PhoneOff />} label="End call" bg="#EF4444" size={70} onClick={onEnd} />
                        <Btn icon={<SpeakerOn />} label={speaker ? "Speaker" : "Earpiece"} bg={speaker ? "rgba(255,255,255,0.14)" : "#374151"} size={56} onClick={() => setSpeaker(p => !p)} />
                    </>
                )}
            </div>

            <style>{`@keyframes dmCallPulse { 0%{transform:scale(1);opacity:0.35;} 100%{transform:scale(1.6);opacity:0;} }`}</style>
        </div>
    );
}