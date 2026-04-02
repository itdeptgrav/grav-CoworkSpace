"use client";
/**
 * components/coworking/meeting/CoworkMeetingRoom.jsx
 *
 * Transcript is automatic — no "Start Transcript" button.
 * Mic ON = transcription active for that person only.
 * Mic OFF = transcription paused for that person.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { getMeet } from "../../../lib/coworkApi";
import { startMeeting, joinByCode, getMeetingInfo, endMeeting } from "../../../lib/livekitApi";
import { saveTranscript } from "../../../lib/transcriptApi";
import MeetingTranscriptPanel from "./MeetingTranscriptPanel";

import {
    LiveKitRoom,
    VideoConference,
    RoomAudioRenderer,
    useParticipants,
} from "@livekit/components-react";
import "@livekit/components-styles";

const LK_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL;

export default function CoworkMeetingRoom() {
    const { meetId } = useParams();
    const router = useRouter();
    const { user, role, employeeName, loading } = useCoworkAuth();

    const [meet, setMeet] = useState(null);
    const [info, setInfo] = useState(null);
    const [token, setToken] = useState(null);
    const [phase, setPhase] = useState("loading");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [joinCode, setJoinCode] = useState("");
    const [userChoices, setUserChoices] = useState(null);
    const [showTranscript, setShowTranscript] = useState(true); // open by default

    const intentionalLeave = useRef(false);
    const transcriptRef = useRef([]);   // kept in sync by transcript panel via onTranscriptChange
    const isHost = role === "ceo" || role === "tl";

    // Grab cowork auth token for backend transcript save calls
    const coworkToken = typeof window !== "undefined"
        ? (localStorage.getItem("coworkToken") || sessionStorage.getItem("coworkToken") || "")
        : "";

    // ── Load meeting data ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!loading && !user) { router.push("/"); return; }
        if (!user || !meetId) return;
        (async () => {
            try {
                const [meetRes, infoRes] = await Promise.all([
                    getMeet(meetId),
                    getMeetingInfo(meetId).catch(() => ({ live: false })),
                ]);
                setMeet(meetRes.meet);
                setInfo(infoRes);
                if (meetRes.meet?.status === "ended") { setPhase("ended"); return; }
                setPhase("lobby");
            } catch (e) { setError(e.message); setPhase("lobby"); }
        })();
    }, [user, loading, meetId]);

    const handleStart = async (choices) => {
        setBusy(true); setError("");
        try {
            const res = await startMeeting(meetId);
            setJoinCode(res.joinCode);
            setUserChoices(choices);
            setToken(res.token);
            intentionalLeave.current = false;
            setPhase("room");
        } catch (e) { setError(e.message); }
        finally { setBusy(false); }
    };

    const handleJoinByCode = async (code, choices) => {
        setBusy(true); setError("");
        try {
            const res = await joinByCode(code);
            setUserChoices(choices);
            setToken(res.token);
            intentionalLeave.current = false;
            setPhase("room");
        } catch (e) { setError(e.message); }
        finally { setBusy(false); }
    };

    const handleEnd = async () => {
        if (!confirm("End the meeting for everyone?")) return;
        intentionalLeave.current = true;
        try {
            // Auto-save transcript to DB before ending (silent — no alert on fail)
            const lines = transcriptRef.current;
            if (lines.length > 0 && meetId && coworkToken) {
                const meetDate = meet?.dateTime
                    ? new Date(meet.dateTime).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })
                    : new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
                saveTranscript(meetId, meet?.title, meetDate, lines, coworkToken)
                    .catch(e => console.warn("Auto-save transcript failed:", e));
            }
            await endMeeting(meetId);
            setToken(null);
            setPhase("ended");
        }
        catch (e) { setError(e.message); }
    };

    const handleLeave = () => {
        intentionalLeave.current = true;
        setToken(null);
        router.push("/coworking/schedule-meet");
    };

    const handleDisconnected = () => {
        if (intentionalLeave.current) router.push("/coworking/schedule-meet");
    };

    // ── Render ────────────────────────────────────────────────────────────────
    if (loading || phase === "loading") return <FullLoader />;
    if (phase === "ended") return <EndedScreen meet={meet} onBack={() => router.push("/coworking/schedule-meet")} />;

    if (phase === "room" && token) {
        const meetDate = meet?.dateTime
            ? new Date(meet.dateTime).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })
            : new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });

        return (
            <div style={S.roomRoot}>
                <style>{CSS}</style>
                <LiveKitRoom
                    token={token}
                    serverUrl={LK_URL}
                    data-lk-theme="default"
                    video={userChoices?.videoEnabled ?? true}
                    audio={userChoices?.audioEnabled ?? true}
                    style={S.lkRoom}
                    onDisconnected={handleDisconnected}
                >
                    {/* Top bar — inside LiveKitRoom so useParticipants works */}
                    <TopBar
                        meet={meet}
                        isHost={isHost}
                        joinCode={joinCode || info?.joinCode}
                        showTranscript={showTranscript}
                        onToggleTranscript={() => setShowTranscript(p => !p)}
                        onEnd={handleEnd}
                        onLeave={handleLeave}
                    />

                    {/* Video grid + transcript panel side by side */}
                    <div style={S.mainArea}>
                        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                            <VideoConference />
                        </div>
                        {showTranscript && (
                            <div style={S.transcriptSide}>
                                <MeetingTranscriptPanel
                                    participantName={employeeName || "Participant"}
                                    meetId={meetId}
                                    meetTitle={meet?.title}
                                    meetDate={meetDate}
                                    coworkToken={coworkToken}
                                    onTranscriptChange={(lines) => { transcriptRef.current = lines; }}
                                />
                            </div>
                        )}
                    </div>

                    <RoomAudioRenderer />
                </LiveKitRoom>
            </div>
        );
    }

    return (
        <LobbyScreen
            meet={meet}
            info={info}
            isHost={isHost}
            busy={busy}
            error={error}
            setError={setError}
            employeeName={employeeName}
            onStart={handleStart}
            onJoinByCode={handleJoinByCode}
            onBack={() => router.push("/coworking/schedule-meet")}
        />
    );
}

// ── Top bar (inside LiveKitRoom so useParticipants works) ─────────────────────
function TopBar({ meet, isHost, joinCode, showTranscript, onToggleTranscript, onEnd, onLeave }) {
    const [showCode, setShowCode] = useState(false);
    const [copied, setCopied] = useState(false);
    const participants = useParticipants();

    const copyCode = () => {
        navigator.clipboard?.writeText(joinCode || "");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div style={S.topBar}>
            {/* Left */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={S.livePill}><span style={S.liveDot} />LIVE</div>
                <span style={S.meetName}>{meet?.title || "CoWork Meeting"}</span>
            </div>

            {/* Right */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
                {/* Join code (host only) */}
                {isHost && joinCode && (
                    <div style={{ position: "relative" }}>
                        <button onClick={() => setShowCode(p => !p)} style={S.topBtn}>🔑 Join Code</button>
                        {showCode && (
                            <div style={S.codeDropdown}>
                                <p style={{ margin: "0 0 6px", fontSize: 11, color: "#5F6368" }}>Share this code:</p>
                                <div style={S.codeBig}>{joinCode}</div>
                                <button onClick={copyCode} style={S.copyBtn}>
                                    {copied ? "✅ Copied!" : "📋 Copy"}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Transcript toggle */}
                <button
                    onClick={onToggleTranscript}
                    style={{ ...S.topBtn, ...(showTranscript ? S.topBtnActive : {}) }}
                >
                    📝 {showTranscript ? "Hide Transcript" : "Show Transcript"}
                </button>

                <span style={S.pCount}>👥 {participants.length}</span>

                {isHost
                    ? <button onClick={onEnd} style={S.endBtn}>🛑 End for All</button>
                    : <button onClick={onLeave} style={S.leaveBtn}>Leave</button>
                }
            </div>
        </div>
    );
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function LobbyScreen({ meet, info, isHost, busy, error, setError, employeeName, onStart, onJoinByCode, onBack }) {
    const [codeInput, setCodeInput] = useState("");
    const [joining, setJoining] = useState(false);
    const [showPreJoin, setShowPreJoin] = useState(false);
    const [pendingCode, setPendingCode] = useState("");
    const isLive = info?.live;

    const handleHostPreview = () => setShowPreJoin(true);
    const handleViewerPreview = () => {
        const code = codeInput.trim().replace(/\D/g, "");
        if (code.length !== 6) { setError("Enter a valid 6-digit code."); return; }
        setPendingCode(code);
        setShowPreJoin(true);
    };
    const handlePreJoinSubmit = async (choices) => {
        setShowPreJoin(false);
        if (isHost) { await onStart(choices); }
        else { setJoining(true); await onJoinByCode(pendingCode, choices); setJoining(false); }
    };

    if (showPreJoin) {
        return (
            <CustomPreJoin
                meetTitle={meet?.title}
                employeeName={employeeName}
                isHost={isHost}
                onBack={() => setShowPreJoin(false)}
                onJoin={handlePreJoinSubmit}
                onError={(err) => setError(err.message)}
            />
        );
    }

    return (
        <div style={S.lobbyRoot}>
            <style>{CSS}</style>
            <div style={S.lobbyCard}>
                <button onClick={onBack} style={S.backBtn}>← Back to Meetings</button>

                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={S.meetIcon}>🎥</div>
                    <div>
                        <h1 style={S.lobbyTitle}>{meet?.title || "CoWork Meeting"}</h1>
                        {meet?.description && <p style={S.lobbyDesc}>{meet.description}</p>}
                        <div style={S.metaRow}>
                            {meet?.dateTime && (
                                <span>📅 {new Date(meet.dateTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                            )}
                            <span>👥 {meet?.participants?.length || 0} invited</span>
                        </div>
                    </div>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid #F1F3F4" }} />
                {error && <div style={S.errBox}>⚠️ {error}</div>}

                {isHost ? (
                    <div>
                        <p style={S.sectionLabel}>You are the host</p>
                        {isLive && (
                            <div style={S.liveBanner}>
                                <span style={S.greenDot} />
                                <span>Meeting is LIVE — {info?.participantCount || 0} people inside</span>
                                {info?.joinCode && <span style={S.inlineCode}>{info.joinCode}</span>}
                            </div>
                        )}
                        <button onClick={handleHostPreview} disabled={busy}
                            style={{ ...S.primaryBtn, marginTop: 12, opacity: busy ? 0.7 : 1 }}>
                            {busy ? "Starting..." : isLive ? "🎥 Rejoin Meeting" : "🚀 Start Meeting"}
                        </button>
                    </div>
                ) : (
                    <div>
                        <p style={S.sectionLabel}>Join with meeting code</p>
                        <p style={{ fontSize: 13, color: "#5F6368", margin: "0 0 12px", lineHeight: 1.5 }}>
                            Ask the host for the 6-digit code.
                        </p>
                        {!isLive && <div style={S.waitBanner}>⏳ Waiting for host to start</div>}
                        {isLive && <div style={S.liveBanner}><span style={S.greenDot} />Meeting is live</div>}
                        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                            <input
                                value={codeInput}
                                onChange={e => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                onKeyDown={e => e.key === "Enter" && handleViewerPreview()}
                                placeholder="000000" maxLength={6} style={S.codeInput}
                            />
                            <button onClick={handleViewerPreview}
                                disabled={joining || codeInput.length !== 6}
                                style={{
                                    ...S.primaryBtn, width: "auto", padding: "0 24px",
                                    opacity: codeInput.length !== 6 ? 0.45 : 1,
                                    cursor: codeInput.length !== 6 ? "not-allowed" : "pointer"
                                }}>
                                {joining ? "..." : "Join →"}
                            </button>
                        </div>
                    </div>
                )}

                <p style={{ fontSize: 11, color: "#9AA0A6", textAlign: "center", margin: "4px 0 0" }}>
                    Joining as <strong>{employeeName}</strong> · Powered by LiveKit
                </p>
            </div>
        </div>
    );
}

// ── Custom PreJoin — full control over UI ────────────────────────────────────
function CustomPreJoin({ meetTitle, employeeName, isHost, onBack, onJoin, onError }) {
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [stream, setStream] = useState(null);
    const [camErr, setCamErr] = useState(false);
    const videoRef = useRef(null);

    // Start camera preview
    useEffect(() => {
        if (!camOn) { setStream(s => { s?.getTracks().forEach(t => t.stop()); return null; }); return; }
        navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
            .then(s => { setStream(s); setCamErr(false); })
            .catch(() => setCamErr(true));
        return () => setStream(s => { s?.getTracks().forEach(t => t.stop()); return null; });
    }, [camOn]);

    // Attach stream to video element
    useEffect(() => {
        if (videoRef.current && stream) videoRef.current.srcObject = stream;
    }, [stream]);

    const handleJoin = () => {
        stream?.getTracks().forEach(t => t.stop());
        onJoin({ videoEnabled: camOn, audioEnabled: micOn });
    };

    return (
        <div style={PJ.root}>
            <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse2 { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.4)} 50%{box-shadow:0 0 0 8px rgba(34,197,94,0)} }
      `}</style>

            {/* Background mesh */}
            <div style={PJ.bgMesh} />

            <div style={PJ.card}>
                {/* Back button */}
                <button onClick={onBack} style={PJ.backBtn}>
                    <span style={{ fontSize: 16 }}>←</span> Back
                </button>

                <div style={PJ.layout}>

                    {/* LEFT: Camera preview */}
                    <div style={PJ.camSide}>
                        <div style={PJ.camBox}>
                            {camOn && !camErr && stream ? (
                                <video
                                    ref={videoRef}
                                    autoPlay muted playsInline
                                    style={PJ.video}
                                />
                            ) : (
                                <div style={PJ.camOff}>
                                    <div style={PJ.avatar}>
                                        {(employeeName || "?")[0].toUpperCase()}
                                    </div>
                                    <span style={{ fontSize: 12, color: "#6B7280", marginTop: 8 }}>
                                        {camErr ? "Camera not available" : "Camera is off"}
                                    </span>
                                </div>
                            )}

                            {/* Mic indicator overlay */}
                            <div style={{ ...PJ.micIndicator, background: micOn ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)" }}>
                                {micOn ? "🎙️" : "🔇"}
                            </div>
                        </div>

                        {/* Name badge */}
                        <div style={PJ.nameBadge}>
                            <div style={PJ.nameInitial}>{(employeeName || "?")[0].toUpperCase()}</div>
                            <span style={PJ.nameText}>{employeeName || "Participant"}</span>
                        </div>
                    </div>

                    {/* RIGHT: Controls */}
                    <div style={PJ.controlSide}>
                        <div style={PJ.meetBadge}>
                            {isHost ? "🎯 HOST" : "👤 PARTICIPANT"}
                        </div>
                        <h2 style={PJ.title}>{meetTitle || "CoWork Meeting"}</h2>
                        <p style={PJ.subtitle}>Ready to join? Check your devices below.</p>

                        {/* Device toggles */}
                        <div style={PJ.devices}>
                            <p style={PJ.deviceLabel}>DEVICES</p>

                            {/* Microphone */}
                            <div style={PJ.deviceRow}>
                                <div style={PJ.deviceInfo}>
                                    <div style={{ ...PJ.deviceIcon, background: micOn ? "#052e16" : "#1c1917", border: `1px solid ${micOn ? "#16a34a" : "#44403c"}` }}>
                                        <span style={{ fontSize: 18 }}>{micOn ? "🎙️" : "🔇"}</span>
                                    </div>
                                    <div>
                                        <div style={PJ.deviceName}>Microphone</div>
                                        <div style={{ ...PJ.deviceStatus, color: micOn ? "#4ade80" : "#78716c" }}>
                                            {micOn ? "● Active" : "○ Muted"}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setMicOn(p => !p)} style={{ ...PJ.toggleBtn, ...(micOn ? PJ.toggleOn : PJ.toggleOff) }}>
                                    {micOn ? "ON" : "OFF"}
                                </button>
                            </div>

                            {/* Camera */}
                            <div style={PJ.deviceRow}>
                                <div style={PJ.deviceInfo}>
                                    <div style={{ ...PJ.deviceIcon, background: camOn ? "#052e16" : "#1c1917", border: `1px solid ${camOn ? "#16a34a" : "#44403c"}` }}>
                                        <span style={{ fontSize: 18 }}>{camOn ? "📷" : "🚫"}</span>
                                    </div>
                                    <div>
                                        <div style={PJ.deviceName}>Camera</div>
                                        <div style={{ ...PJ.deviceStatus, color: camOn ? "#4ade80" : "#78716c" }}>
                                            {camOn && !camErr ? "● Active" : camErr ? "○ Not found" : "○ Off"}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setCamOn(p => !p)} style={{ ...PJ.toggleBtn, ...(camOn && !camErr ? PJ.toggleOn : PJ.toggleOff) }}>
                                    {camOn && !camErr ? "ON" : "OFF"}
                                </button>
                            </div>
                        </div>

                        {/* Join button */}
                        <button onClick={handleJoin} style={PJ.joinBtn}>
                            {isHost ? "🚀 Start Meeting" : "✅ Join Meeting"}
                        </button>

                        <p style={PJ.hint}>
                            You can change mic & camera anytime inside the meeting
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// PreJoin styles
const PJ = {
    root: { position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", fontFamily: "'Google Sans','Roboto',sans-serif", padding: 16 },
    bgMesh: { position: "absolute", inset: 0, background: "radial-gradient(ellipse at 20% 50%, rgba(26,115,232,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(52,168,83,0.1) 0%, transparent 50%)", pointerEvents: "none" },
    card: { position: "relative", background: "#141414", border: "1px solid #222", borderRadius: 20, padding: 28, width: "100%", maxWidth: 780, animation: "fadeUp 0.4s ease", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" },
    backBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #2a2a2a", borderRadius: 8, color: "#6B7280", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "6px 14px", marginBottom: 20, transition: "all 0.2s" },
    layout: { display: "flex", gap: 28, alignItems: "stretch" },
    // Left
    camSide: { flex: "0 0 300px", display: "flex", flexDirection: "column", gap: 12 },
    camBox: { position: "relative", borderRadius: 14, overflow: "hidden", background: "#0d0d0d", border: "1px solid #222", aspectRatio: "4/3" },
    video: { width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" },
    camOff: { width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
    avatar: { width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#1A73E8,#0D47A1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, color: "#fff" },
    micIndicator: { position: "absolute", bottom: 10, left: 10, width: 32, height: 32, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, backdropFilter: "blur(4px)" },
    nameBadge: { display: "flex", alignItems: "center", gap: 10, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, padding: "10px 14px" },
    nameInitial: { width: 32, height: 32, borderRadius: "50%", background: "#1A73E8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 },
    nameText: { fontSize: 14, fontWeight: 600, color: "#e5e7eb" },
    // Right
    controlSide: { flex: 1, display: "flex", flexDirection: "column", gap: 0 },
    meetBadge: { display: "inline-block", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "#1A73E8", background: "#0d2137", border: "1px solid #1A73E8", borderRadius: 99, padding: "3px 12px", marginBottom: 10, width: "fit-content" },
    title: { fontSize: 22, fontWeight: 800, color: "#f9fafb", margin: "0 0 6px", lineHeight: 1.3 },
    subtitle: { fontSize: 13, color: "#6B7280", margin: "0 0 22px" },
    devices: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 },
    deviceLabel: { fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "#4B5563", margin: "0 0 6px" },
    deviceRow: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, padding: "12px 14px" },
    deviceInfo: { display: "flex", alignItems: "center", gap: 12 },
    deviceIcon: { width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" },
    deviceName: { fontSize: 13, fontWeight: 700, color: "#d1d5db", marginBottom: 2 },
    deviceStatus: { fontSize: 11, fontWeight: 600 },
    toggleBtn: { padding: "6px 16px", borderRadius: 99, fontSize: 12, fontWeight: 800, cursor: "pointer", border: "none", letterSpacing: "0.05em", transition: "all 0.2s" },
    toggleOn: { background: "#16a34a", color: "#fff" },
    toggleOff: { background: "#292524", color: "#78716c" },
    joinBtn: { width: "100%", padding: "14px 0", background: "linear-gradient(135deg,#1A73E8,#0D47A1)", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em", boxShadow: "0 8px 24px rgba(26,115,232,0.4)", marginBottom: 12 },
    hint: { fontSize: 11, color: "#4B5563", textAlign: "center", margin: 0, lineHeight: 1.5 },
};

function EndedScreen({ meet, onBack }) {
    return (
        <div style={S.lobbyRoot}>
            <div style={{ ...S.lobbyCard, textAlign: "center", maxWidth: 400, alignItems: "center" }}>
                <div style={{ fontSize: 52 }}>🏁</div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: "#202124", margin: "8px 0 4px" }}>Meeting Ended</h2>
                <p style={{ color: "#5F6368", fontSize: 13, marginBottom: 20 }}>{meet?.title} has ended.</p>
                <button onClick={onBack} style={S.primaryBtn}>← Back to Meetings</button>
            </div>
        </div>
    );
}

function FullLoader() {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 12, background: "#111" }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ width: 36, height: 36, border: "3px solid #333", borderTopColor: "#1A73E8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 13, color: "#9AA0A6", fontFamily: "sans-serif" }}>Loading meeting room...</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
const S = {
    roomRoot: { position: "fixed", inset: 0, zIndex: 9999, background: "#111", display: "flex", flexDirection: "column", fontFamily: "'Google Sans','Roboto',sans-serif" },
    lkRoom: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 },
    topBar: { height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", background: "#1E1E1E", borderBottom: "1px solid #2A2A2A", flexShrink: 0, position: "relative", zIndex: 10 },
    mainArea: { flex: 1, display: "flex", minHeight: 0, overflow: "hidden" },
    transcriptSide: { width: 300, flexShrink: 0, borderLeft: "1px solid #2A2A2A", overflow: "hidden" },
    livePill: { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", background: "#DC2626", borderRadius: 99, fontSize: 10, fontWeight: 800, color: "#fff" },
    liveDot: { width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block" },
    meetName: { fontSize: 14, fontWeight: 600, color: "#fff", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    pCount: { fontSize: 12, color: "#9AA0A6", background: "#2A2A2A", padding: "4px 10px", borderRadius: 99 },
    topBtn: { padding: "6px 12px", background: "#2A2A2A", border: "1px solid #3C4043", borderRadius: 6, color: "#9AA0A6", fontSize: 12, fontWeight: 600, cursor: "pointer" },
    topBtnActive: { background: "#1E3A5F", color: "#60A5FA", border: "1px solid #3B82F6" },
    codeDropdown: { position: "absolute", top: 44, right: 0, background: "#fff", border: "1px solid #E8EAED", borderRadius: 10, padding: "14px 16px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", zIndex: 200, minWidth: 220 },
    codeBig: { fontFamily: "monospace", fontSize: 32, fontWeight: 800, color: "#202124", letterSpacing: 7, textAlign: "center", padding: "8px 0", background: "#F8F9FA", borderRadius: 8, marginBottom: 8 },
    copyBtn: { width: "100%", padding: "8px 0", background: "#1A73E8", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" },
    endBtn: { padding: "7px 14px", background: "#D93025", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" },
    leaveBtn: { padding: "7px 14px", background: "transparent", border: "1px solid #EA4335", borderRadius: 6, color: "#EA4335", fontSize: 12, fontWeight: 600, cursor: "pointer" },
    lobbyRoot: { position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#F0F4FF,#E8F0FE)", padding: 20, fontFamily: "'Google Sans','Roboto',sans-serif" },
    lobbyCard: { background: "#fff", borderRadius: 16, padding: "28px 32px", width: "100%", maxWidth: 520, boxShadow: "0 8px 32px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", gap: 16 },
    backBtn: { alignSelf: "flex-start", background: "none", border: "none", color: "#1A73E8", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 },
    meetIcon: { width: 48, height: 48, background: "linear-gradient(135deg,#1A73E8,#0D47A1)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 },
    lobbyTitle: { margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#202124" },
    lobbyDesc: { margin: "0 0 6px", fontSize: 13, color: "#5F6368", lineHeight: 1.5 },
    metaRow: { display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#80868B" },
    sectionLabel: { fontSize: 11, fontWeight: 700, color: "#5F6368", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" },
    liveBanner: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#DCFCE7", border: "1px solid #BBF7D0", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#166534" },
    greenDot: { width: 8, height: 8, borderRadius: "50%", background: "#22C55E", display: "inline-block", flexShrink: 0 },
    inlineCode: { marginLeft: "auto", fontFamily: "monospace", fontSize: 20, fontWeight: 800, letterSpacing: 4, color: "#166534" },
    waitBanner: { padding: "10px 14px", background: "#FEF9C3", border: "1px solid #FDE047", borderRadius: 8, fontSize: 13, color: "#854D0E" },
    errBox: { background: "#FCE8E6", border: "1px solid #F5C6C2", borderRadius: 8, padding: "10px 14px", color: "#D93025", fontSize: 12 },
    primaryBtn: { width: "100%", padding: 13, background: "linear-gradient(135deg,#1A73E8,#0D47A1)", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(26,115,232,0.3)" },
    codeInput: { flex: 1, padding: "12px 0", border: "2px solid #E8EAED", borderRadius: 10, fontSize: 26, fontFamily: "monospace", fontWeight: 700, textAlign: "center", letterSpacing: 8, color: "#202124", outline: "none", minWidth: 0 },
    preJoinRoot: { display: "none" }, // replaced by CustomPreJoin component
    preJoinCard: { display: "none" },
};

const CSS = `
  @keyframes spin  { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .lk-video-conference { height: 100% !important; width: 100% !important; }
  [data-lk-theme="default"] { --lk-bg: #111 !important; }
`;