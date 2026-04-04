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
import RecordingControls from "./RecordingControls";
import { useMeetingRecording } from "../../../hooks/useMeetingRecording";

import {
    LiveKitRoom,
    VideoConference,
    RoomAudioRenderer,
    useParticipants,
    useLocalParticipant,
} from "@livekit/components-react";
import "@livekit/components-styles";

const LK_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL;

export default function CoworkMeetingRoom() {
    const { meetId } = useParams();
    const router = useRouter();
    const { user, role, employeeId, employeeName, loading } = useCoworkAuth();

    const [meet, setMeet] = useState(null);
    const [info, setInfo] = useState(null);
    const [token, setToken] = useState(null);
    const [phase, setPhase] = useState("loading");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [joinCode, setJoinCode] = useState("");
    const [userChoices, setUserChoices] = useState(null);
    const [showTranscript, setShowTranscript] = useState(true);

    // ── Audio recording (socket handled internally by hook) ───────────────────
    const isHost = role === "ceo" || role === "tl";
    const recording = useMeetingRecording({
        meetId,
        employeeId,
        firstName: (employeeName || "").split(" ")[0],
        isHost,
    });

    const intentionalLeave = useRef(false);
    const transcriptRef = useRef([]);   // kept in sync by transcript panel via onTranscriptChange

    // Grab cowork auth token for backend transcript save calls
    const coworkToken = typeof window !== "undefined"
        ? (localStorage.getItem("coworkToken") || sessionStorage.getItem("coworkToken") || "")
        : "";

    // ── Load meeting data ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!loading && !user) { router.push("/coworking-login"); return; }
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
                    {/* Syncs LiveKit mute state into recording hook — must be inside LiveKitRoom */}
                    <MuteWatcher onMuteChange={recording.setMuted} />

                    {/* Top bar — inside LiveKitRoom so useParticipants works */}
                    <TopBar
                        meet={meet}
                        isHost={isHost}
                        joinCode={joinCode || info?.joinCode}
                        showTranscript={showTranscript}
                        onToggleTranscript={() => setShowTranscript(p => !p)}
                        onEnd={handleEnd}
                        onLeave={handleLeave}
                        recording={recording}
                    />

                    {/* Video grid + transcript panel side by side */}
                    <div style={S.mainArea}>
                        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                            <VideoConference />
                        </div>
                        {/*
              CRITICAL FIX: ALWAYS mount MeetingTranscriptPanel — never unmount it.
              When hidden, we use CSS display:none so the component stays alive
              in memory. React state (transcript lines) is preserved.
              Unmounting = state destroyed = data loss on hide/show.
            */}
                        <div style={{ ...S.transcriptSide, display: showTranscript ? "flex" : "none", flexDirection: "column" }}>
                            <MeetingTranscriptPanel
                                participantName={employeeName || "Participant"}
                                meetId={meetId}
                                meetTitle={meet?.title}
                                meetDate={meetDate}
                                coworkToken={coworkToken}
                                onTranscriptChange={(lines) => { transcriptRef.current = lines; }}
                            />
                        </div>
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

// ── MuteWatcher — inside LiveKitRoom so useLocalParticipant works ─────────────
// Watches LiveKit mic mute state every 500ms and reports it to the recording hook.
function MuteWatcher({ onMuteChange }) {
    const { localParticipant } = useLocalParticipant();
    useEffect(() => {
        if (!localParticipant || !onMuteChange) return;
        const interval = setInterval(() => {
            const pub = localParticipant.getTrackPublication("microphone");
            const muted = !pub || pub.isMuted;
            onMuteChange(muted);
        }, 500);
        return () => clearInterval(interval);
    }, [localParticipant, onMuteChange]);
    return null; // renders nothing
}

// ── Top bar (inside LiveKitRoom so useParticipants works) ─────────────────────
function TopBar({ meet, isHost, joinCode, showTranscript, onToggleTranscript, onEnd, onLeave, recording }) {
    const [showCode, setShowCode] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showPeople, setShowPeople] = useState(false);
    const participants = useParticipants();

    const copyCode = () => {
        navigator.clipboard?.writeText(joinCode || "");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Avatar color by name initial
    const COLORS = ["#1A73E8", "#0F9D58", "#F29900", "#7B1FA2", "#D93025", "#00ACC1", "#E64A19", "#0097A7"];
    const avatarColor = (name = "") => COLORS[(name.charCodeAt(0) || 0) % COLORS.length];
    const initials = (name = "") => name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

    return (
        <div style={S.topBar}>
            {/* Left — meeting name + LIVE badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={S.livePill}><span style={S.liveDot} />LIVE</div>
                <span style={S.meetName}>{meet?.title || "CoWork Meeting"}</span>
            </div>

            {/* Center — time */}
            <div style={{ fontSize: 13, color: "#BDC1C6", fontFamily: "monospace", flexShrink: 0 }}>
                {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </div>

            {/* Right actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, position: "relative" }}>

                {/* ── Participants button — click to show panel ── */}
                <div style={{ position: "relative" }}>
                    <button
                        onClick={() => { setShowPeople(p => !p); setShowCode(false); }}
                        style={{ ...S.topIconBtn, ...(showPeople ? S.topIconBtnActive : {}) }}
                        title="Participants"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                        </svg>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{participants.length}</span>
                    </button>

                    {/* Participants dropdown panel */}
                    {showPeople && (
                        <div style={S.peopleDropdown} onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EAED" }}>In this meeting</div>
                                    <div style={{ fontSize: 11, color: "#9AA0A6", marginTop: 2 }}>
                                        {participants.length} participant{participants.length !== 1 ? "s" : ""} joined
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowPeople(false)}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", display: "flex", alignItems: "center", padding: 4, borderRadius: 4 }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </div>

                            {/* Participant list */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                                {participants.length === 0 ? (
                                    <div style={{ fontSize: 12, color: "#6B7280", textAlign: "center", padding: "16px 0" }}>
                                        No participants yet
                                    </div>
                                ) : participants.map((p, i) => {
                                    const name = p.name || p.identity || "Participant";
                                    const isMe = i === 0; // local participant usually first
                                    const color = avatarColor(name);
                                    const isMicOn = p.isMicrophoneEnabled;
                                    const isCamOn = p.isCameraEnabled;
                                    return (
                                        <div key={p.identity || i} style={S.personRow}>
                                            {/* Avatar */}
                                            <div style={{ ...S.personAvatar, background: color }}>
                                                {initials(name)}
                                            </div>
                                            {/* Name */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 500, color: "#E8EAED", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {name}
                                                    {isMe && <span style={{ fontSize: 10, color: "#9AA0A6", marginLeft: 6, fontWeight: 400 }}>(you)</span>}
                                                </div>
                                            </div>
                                            {/* Device status icons */}
                                            <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                                                {/* Mic */}
                                                <div style={{ ...S.deviceDot, background: isMicOn ? "rgba(52,168,83,0.18)" : "rgba(234,67,53,0.18)" }} title={isMicOn ? "Mic on" : "Mic off"}>
                                                    {isMicOn ? (
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34A853" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                                                        </svg>
                                                    ) : (
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#EA4335" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                                                        </svg>
                                                    )}
                                                </div>
                                                {/* Camera */}
                                                <div style={{ ...S.deviceDot, background: isCamOn ? "rgba(52,168,83,0.18)" : "rgba(234,67,53,0.18)" }} title={isCamOn ? "Camera on" : "Camera off"}>
                                                    {isCamOn ? (
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34A853" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                                                        </svg>
                                                    ) : (
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#EA4335" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" /><line x1="1" y1="1" x2="23" y2="23" />
                                                        </svg>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                {isHost && joinCode && (
                    <div style={{ position: "relative" }}>
                        <button onClick={() => setShowCode(p => !p)} style={S.topIconBtn} title="Join Code">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                            </svg>
                            <span style={{ fontSize: 11, fontWeight: 600 }}>Code</span>
                        </button>
                        {showCode && (
                            <div style={S.codeDropdown}>
                                <div style={{ fontSize: 11, color: "#9AA0A6", marginBottom: 8, fontWeight: 600 }}>SHARE THIS CODE</div>
                                <div style={S.codeBig}>{joinCode}</div>
                                <button onClick={copyCode} style={S.copyBtn}>
                                    {copied
                                        ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg> Copied!</>
                                        : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg> Copy Code</>
                                    }
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Audio Recording Controls (CEO/TL only) ── */}
                {isHost && recording && (
                    <RecordingControls
                        isHost={isHost}
                        isRecording={recording.isRecording}
                        isUploading={recording.isUploading}
                        uploadDone={recording.uploadDone}
                        uploadError={recording.uploadError}
                        uploadResult={recording.uploadResult}
                        onStart={recording.hostStartRecording}
                        onStop={recording.hostStopRecording}
                    />
                )}

                {/* Transcript toggle */}
                <button
                    onClick={onToggleTranscript}
                    style={{ ...S.topIconBtn, ...(showTranscript ? S.topIconBtnActive : {}) }}
                    title={showTranscript ? "Hide Transcript" : "Show Transcript"}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{showTranscript ? "Hide" : "Transcript"}</span>
                </button>

                {/* End / Leave */}
                {isHost
                    ? (
                        <button onClick={onEnd} style={S.endBtn}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c1.12.45 2.3.75 3.53.84a2 2 0 011.8 2v3.06a2 2 0 01-2.18 2A19.8 19.8 0 012 4.18 2 2 0 014 2h3.06a2 2 0 012 1.8c.09 1.23.39 2.41.84 3.53a2 2 0 01-.45 2.11L8.18 10.68" />
                            </svg>
                            End for All
                        </button>
                    ) : (
                        <button onClick={onLeave} style={S.leaveBtn}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                            Leave
                        </button>
                    )
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
            <style>{`
        .lb-back:hover { background: #2a2a2a !important; }
        .lb-code-input:focus { border-color: #1a73e8 !important; box-shadow: 0 0 0 3px rgba(26,115,232,0.2) !important; outline: none; }
        @keyframes lb-in { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

            {/* Background */}
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 40%, rgba(26,115,232,0.12) 0%, transparent 55%), radial-gradient(ellipse at 75% 60%, rgba(52,168,83,0.08) 0%, transparent 50%)", pointerEvents: "none" }} />

            <div style={S.lobbyCard}>
                <button className="lb-back" onClick={onBack} style={S.backBtn}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                    Back to Meetings
                </button>

                {/* Meeting info */}
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={S.meetIcon}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                        </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h1 style={S.lobbyTitle}>{meet?.title || "CoWork Meeting"}</h1>
                        {meet?.description && <p style={S.lobbyDesc}>{meet.description}</p>}
                        <div style={S.metaRow}>
                            {meet?.dateTime && (
                                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                    {new Date(meet.dateTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                                </span>
                            )}
                            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                                {meet?.participants?.length || 0} invited
                            </span>
                        </div>
                    </div>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid #2a2a2a" }} />

                {error && (
                    <div style={S.errBox}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                        {error}
                    </div>
                )}

                {isHost ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>You are the host</div>
                        {isLive && (
                            <div style={S.liveBanner}>
                                <span style={S.greenDot} />
                                <span>Meeting is live — {info?.participantCount || 0} participant{info?.participantCount !== 1 ? "s" : ""} inside</span>
                                {info?.joinCode && <span style={S.inlineCode}>{info.joinCode}</span>}
                            </div>
                        )}
                        <button onClick={handleHostPreview} disabled={busy}
                            style={{ ...S.primaryBtn, opacity: busy ? 0.7 : 1 }}>
                            {busy ? (
                                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Starting…</>
                            ) : isLive ? (
                                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg> Rejoin Meeting</>
                            ) : (
                                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg> Start Meeting</>
                            )}
                        </button>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Enter meeting code</div>
                        <p style={{ fontSize: 13, color: "#9AA0A6", margin: 0, lineHeight: 1.5 }}>
                            Ask the host for the 6-digit join code.
                        </p>
                        {!isLive && (
                            <div style={S.waitBanner}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                Waiting for host to start the meeting
                            </div>
                        )}
                        {isLive && (
                            <div style={S.liveBanner}>
                                <span style={S.greenDot} />Meeting is live
                            </div>
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <input
                                className="lb-code-input"
                                value={codeInput}
                                onChange={e => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                onKeyDown={e => e.key === "Enter" && handleViewerPreview()}
                                placeholder="000000"
                                maxLength={6}
                                style={S.codeInput}
                            />
                            <button onClick={handleViewerPreview}
                                disabled={joining || codeInput.length !== 6}
                                style={{
                                    ...S.primaryBtn, width: "auto", padding: "0 22px",
                                    opacity: codeInput.length !== 6 ? 0.45 : 1,
                                    cursor: codeInput.length !== 6 ? "not-allowed" : "pointer"
                                }}>
                                {joining ? "…" : "Join"}
                            </button>
                        </div>
                    </div>
                )}

                <p style={{ fontSize: 11, color: "#6B7280", textAlign: "center", margin: "4px 0 0" }}>
                    Joining as <strong style={{ color: "#9AA0A6" }}>{employeeName}</strong> · Powered by LiveKit
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
            <style>{CSS}</style>
            <div style={{ ...S.lobbyCard, textAlign: "center", maxWidth: 380 }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#1f1f1f", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c1.12.45 2.3.75 3.53.84a2 2 0 011.8 2v3.06a2 2 0 01-2.18 2A19.8 19.8 0 012 4.18 2 2 0 014 2h3.06a2 2 0 012 1.8c.09 1.23.39 2.41.84 3.53a2 2 0 01-.45 2.11L8.18 10.68" />
                    </svg>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 600, color: "#E8EAED", margin: "0 0 6px" }}>You left the meeting</h2>
                <p style={{ color: "#9AA0A6", fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
                    {meet?.title} has ended.
                </p>
                <button onClick={onBack} style={S.primaryBtn}>Return to meetings</button>
            </div>
        </div>
    );
}

function FullLoader() {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 14, background: "#111" }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ width: 36, height: 36, border: "3px solid #2a2a2a", borderTopColor: "#1A73E8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 13, color: "#6B7280", fontFamily: "sans-serif" }}>Loading meeting…</span>
        </div>
    );
}

const S = {
    roomRoot: { position: "fixed", inset: 0, zIndex: 9999, background: "#111", display: "flex", flexDirection: "column", fontFamily: "'Google Sans','Roboto',sans-serif" },
    lkRoom: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 },
    topBar: { height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", background: "#202124", borderBottom: "1px solid #2a2a2a", flexShrink: 0, position: "relative", zIndex: 10, gap: 12 },
    mainArea: { flex: 1, display: "flex", minHeight: 0, overflow: "hidden" },
    transcriptSide: { width: 300, flexShrink: 0, borderLeft: "1px solid #2A2A2A", overflow: "hidden" },
    livePill: { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", background: "#EA4335", borderRadius: 99, fontSize: 10, fontWeight: 800, color: "#fff", letterSpacing: "0.04em", flexShrink: 0 },
    liveDot: { width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.8)", display: "inline-block", animation: "pulse 1.5s ease infinite" },
    meetName: { fontSize: 14, fontWeight: 500, color: "#E8EAED", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    pCountChip: { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", background: "#2A2A2A", border: "1px solid #3C4043", borderRadius: 99, fontSize: 12, color: "#9AA0A6", fontWeight: 500 },
    peopleDropdown: { position: "absolute", top: 46, right: 0, background: "#1f1f1f", border: "1px solid #3C4043", borderRadius: 12, padding: "16px 16px 12px", boxShadow: "0 12px 40px rgba(0,0,0,0.6)", zIndex: 300, minWidth: 260, maxWidth: 300 },
    personRow: { display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" },
    personAvatar: { width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 },
    deviceDot: { width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
    topIconBtn: { display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "#2A2A2A", border: "1px solid #3C4043", borderRadius: 8, color: "#BDC1C6", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.12s", fontFamily: "inherit" },
    topIconBtnActive: { background: "#1e3a5f", color: "#60A5FA", border: "1px solid #3B82F6" },
    codeDropdown: { position: "absolute", top: 46, right: 0, background: "#1f1f1f", border: "1px solid #3C4043", borderRadius: 10, padding: "16px 18px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 200, minWidth: 220 },
    codeBig: { fontFamily: "monospace", fontSize: 32, fontWeight: 800, color: "#E8EAED", letterSpacing: 8, textAlign: "center", padding: "10px 0", background: "#2a2a2a", borderRadius: 8, marginBottom: 10 },
    copyBtn: { width: "100%", padding: "9px 0", background: "#1A73E8", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 },
    endBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#EA4335", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    leaveBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "transparent", border: "1px solid #EA4335", borderRadius: 8, color: "#EA4335", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    lobbyRoot: { position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "#111", padding: 20, fontFamily: "'Google Sans','Roboto',sans-serif", overflow: "auto" },
    lobbyCard: { position: "relative", background: "#1f1f1f", border: "1px solid #2a2a2a", borderRadius: 16, padding: "28px 32px", width: "100%", maxWidth: 480, boxShadow: "0 24px 60px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", gap: 18, animation: "lb-in 0.35s ease" },
    backBtn: { display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start", background: "none", border: "1px solid #2a2a2a", borderRadius: 8, color: "#6B7280", fontSize: 13, fontWeight: 500, cursor: "pointer", padding: "6px 14px", fontFamily: "inherit", transition: "background 0.12s" },
    meetIcon: { width: 46, height: 46, background: "linear-gradient(135deg,#1A73E8,#0D47A1)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
    lobbyTitle: { margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "#E8EAED" },
    lobbyDesc: { margin: "0 0 6px", fontSize: 13, color: "#9AA0A6", lineHeight: 1.5 },
    metaRow: { display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#6B7280" },
    liveBanner: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(22,163,74,0.12)", border: "1px solid rgba(22,163,74,0.3)", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "#4ADE80" },
    greenDot: { width: 8, height: 8, borderRadius: "50%", background: "#22C55E", display: "inline-block", flexShrink: 0 },
    inlineCode: { marginLeft: "auto", fontFamily: "monospace", fontSize: 22, fontWeight: 800, letterSpacing: 4, color: "#4ADE80" },
    waitBanner: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 8, fontSize: 13, color: "#FCD34D" },
    errBox: { display: "flex", alignItems: "flex-start", gap: 8, background: "rgba(234,67,53,0.1)", border: "1px solid rgba(234,67,53,0.3)", borderRadius: 8, padding: "10px 14px", color: "#F87171", fontSize: 13 },
    primaryBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: 13, background: "#1A73E8", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "background 0.12s" },
    codeInput: { flex: 1, padding: "13px 0", border: "2px solid #2a2a2a", borderRadius: 10, fontSize: 28, fontFamily: "monospace", fontWeight: 700, textAlign: "center", letterSpacing: 10, color: "#E8EAED", outline: "none", minWidth: 0, background: "#2a2a2a", transition: "all 0.15s" },
    sectionLabel: { fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" },
};

const CSS = `
  @keyframes spin  { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  @keyframes lb-in { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  .lk-video-conference { height: 100% !important; width: 100% !important; }
  [data-lk-theme="default"] { --lk-bg: #111 !important; }
`;