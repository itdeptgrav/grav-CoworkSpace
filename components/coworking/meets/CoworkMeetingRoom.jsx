"use client";
/**
 * components/coworking/meets/CoworkMeetingRoom.jsx
 *
 * Changes from previous version:
 *  ✅ Transcript section REMOVED entirely
 *  ✅ Lobby UI redesigned — Google Meet / Zoom style (light, clean, professional)
 *  ✅ PreJoin redesigned — Google Meet style (dark left cam preview, clean right panel)
 *  ✅ Invited employees (in meet.participants) join directly — no code needed
 *  ✅ Non-invited employees must enter a 6-digit code
 *  ✅ Join code visible ONLY to CEO and TL
 *  ✅ Record button visible ONLY to CEO and TL
 *  ✅ Leave button routes to /coworking/schedule-meet (not black screen)
 *  ✅ Bottom toolbar: Share screen | Chat | Leave (Zoom-style)
 */

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { getMeet } from "../../../lib/coworkApi";
import { startMeeting, joinByCode, getMeetingInfo, endMeeting } from "../../../lib/livekitApi";
import { setPipMeeting as storePipMeeting, clearPipMeeting } from "../../../lib/pipMeetingStore";
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["#1A73E8", "#0F9D58", "#F29900", "#7B1FA2", "#D93025", "#00ACC1", "#E64A19", "#0097A7"];
const avColor = (name = "") => AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
const initials = (name = "") => name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

// ═══════════════════════════════════════════════════════════════════════════════
export default function CoworkMeetingRoom() {
    const { meetId } = useParams();
    const router = useRouter();
    const { user, role, employeeId, employeeName, loading } = useCoworkAuth();

    const [meet, setMeet] = useState(null);
    const [info, setInfo] = useState(null);
    const [token, setToken] = useState(null);
    const [phase, setPhase] = useState("loading");
    const [pipMode, setPipMode] = useState(false);       // mini floating box
    const [pipCollapsed, setPipCollapsed] = useState(false); // collapsed to tiny bar
    const [pipPos, setPipPos] = useState({ x: null, y: null }); // drag position
    const [pipControls, setPipControls] = useState({ micOn: true, camOn: true, toggleMic: null, toggleCam: null });
    const pipDragRef = useRef(null);
    const pipDragState = useRef(null);
    const pipControlsCallbackRef = useRef(null);
    pipControlsCallbackRef.current = setPipControls;
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [joinCode, setJoinCode] = useState("");
    const [userChoices, setUserChoices] = useState(null);

    const isHost = role === "ceo" || role === "tl";
    const isInvited = isHost || (meet?.participants || []).includes(employeeId);

    const recording = useMeetingRecording({
        meetId, employeeId,
        // Use full name sanitized — avoids collision when two people share first name
        firstName: (employeeName || "Unknown").replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || employeeId,
        isHost,
    });

    const intentionalLeave = useRef(false);

    // ── Load meeting ──────────────────────────────────────────────────────────
    // When full meeting page is active, clear pip from shell (we render directly)
    useEffect(() => {
        clearPipMeeting();
    }, []);

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

    // ── Join handlers ─────────────────────────────────────────────────────────
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

    // Invited employee joins directly (no code)
    const handleDirectJoin = async (choices) => {
        setBusy(true); setError("");
        try {
            // Use the live joinCode from info (meeting must be live)
            const code = info?.joinCode;
            if (!code) { setError("Meeting is not live yet. Wait for the host to start."); setBusy(false); return; }
            const res = await joinByCode(code);
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
            await endMeeting(meetId);
            setToken(null);
            setPhase("ended");

        } catch (e) { setError(e.message); }
    };

    const handleLeave = () => {
        intentionalLeave.current = true;
        setToken(null);
        router.push("/coworking/schedule-meet");
    };

    // ── Minimize to PiP — NO navigation, CSS overlay only ──────────────────
    // Meeting page stays at /coworking/cowork-meeting/[meetId]
    // LiveKit room stays mounted and connected — no disconnect
    const handleMinimize = () => {
        setPipMode(true);
        setPipCollapsed(false);
        if (pipPos.x === null) {
            setPipPos({ x: window.innerWidth - 320, y: window.innerHeight - 220 });
        }
    };

    const handleRestorePip = () => {
        setPipMode(false);
        setPipCollapsed(false);
    };

    // ── PiP drag ─────────────────────────────────────────────────────────────
    const handlePipDragStart = (e) => {
        const el = pipDragRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        pipDragState.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
        const onMove = (e2) => {
            if (!pipDragState.current) return;
            const dx = e2.clientX - pipDragState.current.startX;
            const dy = e2.clientY - pipDragState.current.startY;
            const newX = Math.max(0, Math.min(window.innerWidth - 300, pipDragState.current.origX + dx));
            const newY = Math.max(0, Math.min(window.innerHeight - 200, pipDragState.current.origY + dy));
            setPipPos({ x: newX, y: newY });
        };
        const onUp = () => {
            pipDragState.current = null;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    };

    const handleDisconnected = () => {
        // Always redirect when disconnected — covers both our button + LiveKit built-in leave button
        router.push("/coworking/schedule-meet");
    };

    // ── Render ────────────────────────────────────────────────────────────────
    if (loading || phase === "loading") return <FullLoader />;
    if (phase === "ended") return <EndedScreen meet={meet} onBack={() => router.push("/coworking/schedule-meet")} />;

    if (phase === "room" && token) {
        // ONE LiveKitRoom always mounted — never unmounts in pip mode
        // In pip mode: LiveKit hidden via CSS, pip box + iframe overlay shown
        return (
            <>
                {/* ── LiveKit room — always mounted, hidden in pip mode ── */}
                <div style={pipMode
                    ? { position: "fixed", width: 1, height: 1, top: -9999, left: -9999, overflow: "hidden", opacity: 0, pointerEvents: "none", zIndex: -1 }
                    : { width: "100%", height: "100%", display: "flex", flexDirection: "column" }
                }>
                    <div style={S.roomRoot}>
                        <GlobalCSS />
                        <LiveKitRoom
                            token={token}
                            serverUrl={LK_URL}
                            data-lk-theme="default"
                            video={userChoices?.videoEnabled ?? true}
                            audio={userChoices?.audioEnabled ?? true}
                            style={S.lkRoom}
                            onDisconnected={handleDisconnected}
                        >
                            <MuteWatcher onMuteChange={recording.setMuted} />
                            <PipMediaControls onReady={pipControlsCallbackRef} />
                            <AvatarColorInjector />
                            <TopBar
                                meet={meet}
                                isHost={isHost}
                                joinCode={joinCode || info?.joinCode}
                                recording={recording}
                                onEnd={handleEnd}
                                onLeave={handleLeave}
                                onMinimize={handleMinimize}
                                employeeId={employeeId}
                                employeeName={employeeName}
                            />
                            <div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                                <VideoConference />
                            </div>
                            <RoomAudioRenderer />
                        </LiveKitRoom>
                    </div>
                </div>

                {/* ── PiP mode: dashboard iframe overlay + floating box ── */}
                {pipMode && (
                    <>
                        {/* Dashboard shown via iframe so user can interact with app */}
                        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "#fff" }}>
                            <iframe
                                src="/coworking"
                                style={{ width: "100%", height: "100%", border: "none" }}
                                title="Dashboard"
                            />
                        </div>

                        {/* Floating PiP box — above iframe */}
                        <div
                            ref={pipDragRef}
                            style={{
                                position: "fixed",
                                left: pipPos.x !== null ? pipPos.x : "auto",
                                right: pipPos.x !== null ? "auto" : 24,
                                top: pipPos.y !== null ? pipPos.y : "auto",
                                bottom: pipPos.y !== null ? "auto" : 24,
                                zIndex: 9999,
                                width: pipCollapsed ? 220 : 300,
                                borderRadius: 14, overflow: "hidden",
                                boxShadow: "0 8px 40px rgba(0,0,0,0.45)",
                                background: "#111827", border: "1px solid rgba(255,255,255,0.15)",
                                userSelect: "none",
                            }}
                        >
                            {/* Drag handle */}
                            <div onMouseDown={handlePipDragStart}
                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "#0F172A", cursor: "grab", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", flexShrink: 0, boxShadow: "0 0 6px #EF4444" }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#F1F5F9", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {meet?.title || "Meeting"}
                                </span>
                                {/* Collapse */}
                                <button onClick={() => setPipCollapsed(p => !p)}
                                    style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "rgba(255,255,255,0.1)", color: "#CBD5E1", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                        {pipCollapsed ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
                                    </svg>
                                </button>
                                {/* Restore full meeting */}
                                <button onClick={handleRestorePip} title="Return to full meeting"
                                    style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "rgba(37,99,235,0.4)", color: "#93C5FD", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                        <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                                        <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                                    </svg>
                                </button>
                            </div>

                            {/* Body */}
                            {!pipCollapsed && (
                                <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                                    {/* Status */}
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#94A3B8" }}>
                                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
                                        Connected · {meet?.title}
                                    </div>

                                    {/* Mic / Cam — wired to actual LiveKit via pipControls */}
                                    <div style={{ display: "flex", gap: 6 }}>
                                        <button onClick={() => pipControls.toggleMic?.()}
                                            style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: pipControls.micOn ? "rgba(255,255,255,0.1)" : "#DC2626", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                                            {pipControls.micOn
                                                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                                : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                            }
                                            {pipControls.micOn ? "Mic On" : "Muted"}
                                        </button>
                                        <button onClick={() => pipControls.toggleCam?.()}
                                            style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: pipControls.camOn ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)", color: pipControls.camOn ? "#fff" : "#64748B", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, border: "1px solid rgba(255,255,255,0.1)" }}>
                                            {pipControls.camOn
                                                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                                                : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                            }
                                            {pipControls.camOn ? "Cam On" : "Cam Off"}
                                        </button>
                                    </div>

                                    {/* Open full / Leave */}
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button onClick={handleRestorePip}
                                            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: "#2563EB", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                                            Open Meeting
                                        </button>
                                        <button onClick={() => { if (window.confirm("Leave the meeting?")) handleLeave(); }}
                                            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                            Leave
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </>
        );
    }

    return (
        <LobbyScreen
            meet={meet}
            info={info}
            isHost={isHost}
            isInvited={isInvited}
            busy={busy}
            error={error}
            setError={setError}
            employeeName={employeeName}
            employeeId={employeeId}
            onStart={handleStart}
            onDirectJoin={handleDirectJoin}
            onJoinByCode={handleJoinByCode}
            onBack={() => router.push("/coworking/schedule-meet")}
        />
    );
}

// ── AvatarColorInjector ───────────────────────────────────────────────────────
// Watches LiveKit DOM and injects --lk-av-color + data-lk-participant-name
// so the CSS ::before circle shows the right colour and initials.
const AVATAR_COLORS_LIST = ["#1A73E8", "#0F9D58", "#F29900", "#7B1FA2", "#D93025", "#00ACC1", "#E64A19", "#0097A7"];
function getAvatarColor(name = "") { return AVATAR_COLORS_LIST[(name.charCodeAt(0) || 0) % AVATAR_COLORS_LIST.length]; }
function getInitials(name = "") { return name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?"; }

function AvatarColorInjector() {
    useEffect(() => {
        const applyColors = () => {
            // Find all participant tiles
            const tiles = document.querySelectorAll(".lk-participant-tile");
            tiles.forEach(tile => {
                // Get participant name from the name label inside the tile
                const nameEl = tile.querySelector(".lk-participant-name, [class*='participantName'], .lk-participant-metadata-item");
                const name = nameEl?.textContent?.replace(/\(you\)/i, "").trim() || "";
                if (!name) return;
                const color = getAvatarColor(name);
                const inits = getInitials(name);
                // Set CSS variable for background colour
                tile.style.setProperty("--lk-av-color", color);
                // Set data attribute so CSS content: attr() shows the initials
                const placeholder = tile.querySelector(".lk-participant-placeholder, [class*='participantPlaceholder']");
                if (placeholder) {
                    placeholder.setAttribute("data-lk-participant-name", inits);
                    placeholder.style.setProperty("--lk-av-color", color);
                }
            });
        };

        // Run immediately and also watch for DOM changes
        applyColors();
        const observer = new MutationObserver(applyColors);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
        const interval = setInterval(applyColors, 1000); // fallback poll

        return () => { observer.disconnect(); clearInterval(interval); };
    }, []);
    return null;
}

// ── MuteWatcher ───────────────────────────────────────────────────────────────
function MuteWatcher({ onMuteChange }) {
    const { localParticipant } = useLocalParticipant();
    useEffect(() => {
        if (!localParticipant || !onMuteChange) return;
        const interval = setInterval(() => {
            const pub = localParticipant.getTrackPublication("microphone");
            onMuteChange(!pub || pub.isMuted);
        }, 500);
        return () => clearInterval(interval);
    }, [localParticipant, onMuteChange]);
    return null;
}

// ── PipMediaControls — inside LiveKitRoom, exposes mic/cam state via callback ─
function PipMediaControls({ onReady }) {
    // onReady is a ref (pipControlsCallbackRef) — stable, never changes
    const { localParticipant } = useLocalParticipant();
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);

    useEffect(() => {
        if (!localParticipant) return;
        const update = () => {
            setMicOn(!!localParticipant.isMicrophoneEnabled);
            setCamOn(!!localParticipant.isCameraEnabled);
        };
        update();
        const t = setInterval(update, 500);
        return () => clearInterval(t);
    }, [localParticipant]);

    useEffect(() => {
        if (!onReady?.current || !localParticipant) return;
        // Call the ref's current value — stable, no infinite loop
        onReady.current({
            micOn, camOn,
            toggleMic: () => localParticipant.setMicrophoneEnabled(!micOn),
            toggleCam: () => localParticipant.setCameraEnabled(!camOn),
        });
    }, [micOn, camOn, localParticipant]); // onReady is a ref, not a dep

    return null;
}

// ── Top bar (inside LiveKitRoom) ──────────────────────────────────────────────
function TopBar({ meet, isHost, joinCode, recording, onEnd, onLeave, onMinimize, employeeId, employeeName }) {
    const [showCode, setShowCode] = useState(false);
    const [showPeople, setShowPeople] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const [copied, setCopied] = useState(false);
    const [elapsed, setElapsed] = useState(0); // seconds since meeting started
    const participants = useParticipants();

    // Tick every second — count from when user actually joined (not scheduled time)
    const joinedAtRef = useRef(Date.now());
    useEffect(() => {
        joinedAtRef.current = Date.now();
        const update = () => setElapsed(Math.floor((Date.now() - joinedAtRef.current) / 1000));
        update();
        const t = setInterval(update, 1000);
        return () => clearInterval(t);
    }, []); // run once on mount

    const copyCode = () => {
        navigator.clipboard?.writeText(joinCode || "");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Format elapsed time as  0:05  /  1:23  /  1:23:45
    const fmtElapsed = (s) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
        return `${m}:${String(sec).padStart(2, "0")}`;
    };

    const elapsedStr = fmtElapsed(elapsed);

    return (
        <div className="tb-root">
            {/* Left: LIVE + meeting name + elapsed duration */}
            <div className="tb-left">
                {onMinimize && (
                    <button onClick={onMinimize} title="Back to dashboard — meeting continues in mini view"
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#E8EAED", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginRight: 6, flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        Back
                    </button>
                )}
                <div style={S.livePill}><span style={S.liveDot} />LIVE</div>
                <span className="tb-meet-name">{meet?.title || "CoWork Meeting"}</span>
                <span className="tb-elapsed">⏱ {elapsedStr}</span>
            </div>

            {/* Right: controls */}
            <div className="tb-right">

                {/* Participants */}
                <div style={{ position: "relative" }}>
                    <button className={`tb-btn${showPeople ? " tb-btn-active" : ""}`}
                        onClick={() => { setShowPeople(p => !p); setShowCode(false); setShowShare(false); }} title="Participants">
                        <PeopleIcon />
                        <span>{participants.length}</span>
                    </button>
                    {showPeople && (
                        <div style={S.dropdown} onClick={e => e.stopPropagation()}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EAED", marginBottom: 4 }}>In this meeting</div>
                            <div style={{ fontSize: 11, color: "#9AA0A6", marginBottom: 12 }}>{participants.length} joined</div>
                            {participants.map((p, i) => {
                                const name = p.name || p.identity || "Participant";
                                const isMe = p.isLocal;
                                const micOn = p.isMicrophoneEnabled;
                                const camOn = p.isCameraEnabled;
                                return (
                                    <div key={p.identity || i} style={S.personRow}>
                                        <div style={{ ...S.personAvatar, background: avColor(name) }}>{initials(name)}</div>
                                        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#E8EAED", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {name}{isMe && <span style={{ fontSize: 10, color: "#9AA0A6", marginLeft: 6 }}>(you)</span>}
                                        </div>
                                        <span style={{ fontSize: 15 }}>{micOn ? "🎙️" : "🔇"}</span>
                                        <span style={{ fontSize: 15 }}>{camOn ? "📹" : "📵"}</span>
                                    </div>
                                );
                            })}
                            <button onClick={() => setShowPeople(false)} style={{ marginTop: 10, width: "100%", background: "#2A2A2A", border: "none", borderRadius: 6, color: "#9AA0A6", fontSize: 12, padding: "6px 0", cursor: "pointer" }}>Close</button>
                        </div>
                    )}
                </div>

                {/* Invite — CEO/TL only */}
                {isHost && (<>
                    <button className={`tb-btn${showShare ? " tb-btn-active" : ""}`}
                        onClick={() => { setShowShare(p => !p); setShowCode(false); setShowPeople(false); }} title="Share Invite">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                        <span className="tb-btn-label">Invite</span>
                    </button>
                    {showShare && (
                        <ShareMeetingModal meet={meet} joinCode={joinCode} senderId={employeeId} senderName={employeeName} onClose={() => setShowShare(false)} />
                    )}
                </>)}

                {/* Code — CEO/TL only */}
                {isHost && joinCode && (
                    <div style={{ position: "relative" }}>
                        <button className={`tb-btn${showCode ? " tb-btn-active" : ""}`}
                            onClick={() => { setShowCode(p => !p); setShowPeople(false); setShowShare(false); }} title="Meeting Code">
                            <LockIcon />
                            <span className="tb-btn-label">Code</span>
                        </button>
                        {showCode && (
                            <div style={{ ...S.dropdown, minWidth: 210, right: 0 }}>
                                <div style={{ fontSize: 11, color: "#9AA0A6", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Share this code</div>
                                <div style={S.codeBig}>{joinCode}</div>
                                <button onClick={copyCode} style={S.copyBtn}>{copied ? "✓ Copied!" : "Copy Code"}</button>
                            </div>
                        )}
                    </div>
                )}

                {/* Record — CEO/TL only */}
                {isHost && recording && (
                    <RecordingControls isHost={isHost} isRecording={recording.isRecording} isUploading={recording.isUploading} uploadDone={recording.uploadDone} uploadError={recording.uploadError} uploadResult={recording.uploadResult} onStart={recording.hostStartRecording} onStop={recording.hostStopRecording} />
                )}

                {/* End / Leave */}
                {isHost
                    ? <button onClick={onEnd} className="tb-end-btn">End for All</button>
                    : <button onClick={onLeave} className="tb-leave-btn">Leave</button>
                }
            </div>
        </div>
    );
}


// ── Lobby screen — sits inside CoworkingShell (no fixed positioning) ──────────
function LobbyScreen({ meet, info, isHost, isInvited, busy, error, setError, employeeName, employeeId, onStart, onDirectJoin, onJoinByCode, onBack }) {
    const [phase, setPhase] = useState("lobby");
    const [codeInput, setCodeInput] = useState("");
    const [joining, setJoining] = useState(false);
    const [pendingFn, setPendingFn] = useState(null);
    const [showShare, setShowShare] = useState(false);
    const isLive = info?.live;

    const goPreJoin = (fn) => { setPendingFn(() => fn); setPhase("prejoin"); };

    const handlePreJoinDone = async (choices) => {
        setPhase("lobby");
        if (pendingFn) await pendingFn(choices);
    };

    if (phase === "prejoin") {
        return (
            <PreJoin
                meetTitle={meet?.title}
                employeeName={employeeName}
                isHost={isHost}
                onBack={() => setPhase("lobby")}
                onJoin={handlePreJoinDone}
            />
        );
    }

    const handleCodeJoin = async () => {
        const code = codeInput.trim().replace(/\D/g, "");
        if (code.length !== 6) { setError("Enter a valid 6-digit code."); return; }
        goPreJoin(async (choices) => {
            setJoining(true);
            await onJoinByCode(code, choices);
            setJoining(false);
        });
    };

    return (
        <>
            <style>{`
                @keyframes lob-in { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
                .lob-input:focus { outline:none; border-color:#1a73e8 !important; box-shadow:0 0 0 3px rgba(26,115,232,0.15) !important; }
                .lob-join-btn:hover { background:#1557b0 !important; }
                .lob-share-btn:hover { background:#E8F0FE !important; }
                .lob-back-btn:hover { background:#F1F3F4 !important; }

                /* ── Page shell ── */
                .lob-page { min-height:100vh; background:#F0F2F5; display:flex; flex-direction:column; font-family:'Google Sans','Roboto',sans-serif; }

                /* ── Top bar ── */
                .lob-topbar { background:#fff; border-bottom:1px solid #E4E7EC; padding:0 24px; height:56px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
                .lob-topbar-logo { display:flex; align-items:center; gap:8px; }
                .lob-topbar-logobox { width:30px; height:30px; background:#1a73e8; border-radius:8px; display:flex; align-items:center; justify-content:center; }
                .lob-topbar-name { font-size:15px; font-weight:600; color:#202124; }

                /* ── Two-column body ── */
                .lob-body { flex:1; display:flex; min-height:0; }

                /* ── Left panel ── */
                .lob-left { width:460px; flex-shrink:0; background:#fff; border-right:1px solid #E4E7EC; padding:44px 44px 32px; display:flex; flex-direction:column; gap:22px; overflow-y:auto; }

                /* ── Right panel ── */
                .lob-right { flex:1; background:linear-gradient(135deg,#EBF3FE 0%,#F0FDF4 100%); display:flex; align-items:center; justify-content:center; padding:40px; position:relative; overflow:hidden; }

                /* ── Meeting header ── */
                .lob-meet-header { display:flex; gap:16px; align-items:flex-start; }
                .lob-meet-icon { width:56px; height:56px; background:linear-gradient(135deg,#1A73E8,#0D47A1); border-radius:14px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
                .lob-meet-title { margin:0 0 5px; font-size:24px; font-weight:600; color:#202124; line-height:1.25; }
                .lob-meet-desc { margin:0 0 8px; font-size:13px; color:#5f6368; line-height:1.6; }
                .lob-chips { display:flex; gap:6px; flex-wrap:wrap; }
                .lob-chip { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; background:#F1F3F4; border-radius:99px; font-size:12px; color:#5f6368; white-space:nowrap; }

                /* ── Banners ── */
                .lob-live-banner { display:flex; align-items:center; gap:10px; padding:12px 16px; background:#E6F4EA; border:1px solid #CEEAD6; border-radius:12px; font-size:14px; font-weight:500; color:#137333; }
                .lob-wait-banner { padding:12px 16px; background:#FFF8E1; border:1px solid #FFE082; border-radius:12px; font-size:13px; color:#B45309; }
                .lob-err-banner  { padding:12px 16px; background:#FCE8E6; border:1px solid #F5C6C2; border-radius:10px; font-size:13px; color:#C5221F; }
                .lob-live-dot { width:9px; height:9px; border-radius:50%; background:#34A853; display:inline-block; flex-shrink:0; }
                .lob-live-code { margin-left:auto; font-family:monospace; font-size:22px; font-weight:800; letter-spacing:4px; color:#137333; }

                /* ── Role label ── */
                .lob-role { font-size:11px; font-weight:700; color:#1a73e8; text-transform:uppercase; letter-spacing:0.07em; }

                /* ── Buttons ── */
                .lob-btn-primary { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:14px 0; background:#1A73E8; color:#fff; border:none; border-radius:10px; font-size:15px; font-weight:600; cursor:pointer; font-family:inherit; transition:background 0.15s; }
                .lob-btn-outline { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:12px 0; background:#F8F9FA; color:#1a73e8; border:1.5px solid #1a73e8; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; font-family:inherit; transition:background 0.15s; }
                .lob-btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
                .lob-btn-primary:hover:not(:disabled) { background:#1557b0; }

                /* ── Code input row ── */
                .lob-code-row { display:flex; gap:10px; align-items:stretch; }
                .lob-code-input { flex:1; padding:12px 8px; border:1.5px solid #E4E7EC; border-radius:10px; font-size:26px; font-family:monospace; font-weight:700; text-align:center; letter-spacing:10px; color:#202124; outline:none; background:#F8F9FA; min-width:0; }
                .lob-code-join { padding:0 22px; background:#1A73E8; color:#fff; border:none; border-radius:10px; font-size:15px; font-weight:600; cursor:pointer; font-family:inherit; transition:background 0.15s; white-space:nowrap; }
                .lob-code-join:disabled { opacity:0.45; cursor:not-allowed; }
                .lob-code-join:hover:not(:disabled) { background:#1557b0; }

                /* ── Right panel content ── */
                .lob-right-inner { position:relative; z-index:1; text-align:center; max-width:420px; width:100%; }
                .lob-right-icon { width:110px; height:110px; background:linear-gradient(135deg,#1A73E8,#0D47A1); border-radius:28px; display:flex; align-items:center; justify-content:center; margin:0 auto 24px; box-shadow:0 12px 40px rgba(26,115,232,0.28); }
                .lob-right-title { font-size:26px; font-weight:300; color:#202124; margin:0 0 10px; line-height:1.3; }
                .lob-right-desc { font-size:14px; color:#5f6368; line-height:1.7; margin:0 0 22px; }
                .lob-right-cards { display:flex; justify-content:center; gap:12px; flex-wrap:wrap; }
                .lob-right-card { background:#fff; border:1px solid #DADCE0; border-radius:12px; padding:12px 18px; text-align:center; min-width:120px; }
                .lob-right-card-label { font-size:10px; font-weight:700; color:#9AA0A6; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px; }
                .lob-right-card-val { font-size:13px; font-weight:600; color:#202124; }

                /* ── Tablet: 768–1024px ── */
                @media (max-width:1024px) and (min-width:769px) {
                    .lob-left { width:400px; padding:36px 36px 28px; gap:18px; }
                    .lob-right { padding:32px 24px; }
                    .lob-meet-title { font-size:21px; }
                    .lob-right-title { font-size:22px; }
                    .lob-right-icon { width:90px; height:90px; border-radius:22px; margin-bottom:18px; }
                }

                /* ── Mobile: < 769px ── single column, action card on top ── */
                @media (max-width:768px) {
                    .lob-topbar { padding:0 16px; height:50px; }
                    .lob-topbar-name { font-size:14px; }

                    /* stack columns */
                    .lob-body { flex-direction:column; }
                    .lob-left { width:100%; border-right:none; border-bottom:none; padding:20px 16px 24px; gap:16px; }
                    .lob-right { display:none; }   /* hide decorative panel on mobile */

                    /* smaller text */
                    .lob-meet-icon { width:44px; height:44px; border-radius:11px; }
                    .lob-meet-title { font-size:18px; }
                    .lob-meet-desc { font-size:12px; }
                    .lob-chip { font-size:11px; }

                    .lob-live-banner { font-size:13px; padding:10px 12px; }
                    .lob-live-code { font-size:18px; letter-spacing:3px; }

                    .lob-btn-primary { font-size:14px; padding:13px 0; }
                    .lob-btn-outline  { font-size:13px; padding:11px 0; }
                    .lob-code-input { font-size:22px; letter-spacing:8px; padding:10px 6px; }

                    .lob-live-dot { width:8px; height:8px; }
                }

                /* ── Very small: < 400px ── */
                @media (max-width:400px) {
                    .lob-left { padding:16px 12px 20px; }
                    .lob-meet-header { gap:10px; }
                    .lob-code-row { flex-direction:column; gap:8px; }
                    .lob-code-join { padding:13px 0; width:100%; }
                    .lob-live-code { font-size:16px; }
                }
            `}</style>

            <div className="lob-page">

                {/* ── Top bar ── */}
                <div className="lob-topbar">
                    <button className="lob-back-btn" onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#5f6368", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "6px 10px", borderRadius: 8, transition: "background 0.1s" }}>
                        ← Back to Meetings
                    </button>
                    <div className="lob-topbar-logo">
                        <div className="lob-topbar-logobox">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                            </svg>
                        </div>
                        <span className="lob-topbar-name">CoWork</span>
                    </div>
                </div>

                {/* ── Two-column body ── */}
                <div className="lob-body">

                    {/* ── LEFT: actions panel ── */}
                    <div className="lob-left">

                        {/* Meeting header */}
                        <div className="lob-meet-header">
                            <div className="lob-meet-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                                </svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h1 className="lob-meet-title">{meet?.title || "CoWork Meeting"}</h1>
                                {meet?.description && <p className="lob-meet-desc">{meet.description}</p>}
                                <div className="lob-chips">
                                    {meet?.dateTime && <span className="lob-chip">📅 {new Date(meet.dateTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>}
                                    <span className="lob-chip">👥 {meet?.participants?.length || 0} invited</span>
                                    <span className="lob-chip" style={{ fontFamily: "monospace", color: "#9AA0A6" }}>{meet?.meetId || ""}</span>
                                </div>
                            </div>
                        </div>

                        {/* Status banners */}
                        {isLive && (
                            <div className="lob-live-banner">
                                <span className="lob-live-dot" />
                                Meeting is live
                                {isHost && info?.participantCount >= 0 && <span style={{ marginLeft: 4, color: "#0F9D58" }}>— {info.participantCount} inside</span>}
                                {isHost && info?.joinCode && <span className="lob-live-code">{info.joinCode}</span>}
                            </div>
                        )}
                        {!isLive && !isHost && <div className="lob-wait-banner">⏳ Waiting for host to start the meeting</div>}
                        {error && <div className="lob-err-banner">⚠️ {error}</div>}

                        <hr style={{ border: "none", borderTop: "1px solid #F1F3F4", margin: 0 }} />

                        {/* Actions */}
                        {isHost ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <div className="lob-role">YOU ARE THE HOST</div>
                                <button className="lob-btn-primary lob-join-btn" onClick={() => goPreJoin(onStart)} disabled={busy}>
                                    {busy ? "Starting…" : isLive ? "🎥 Rejoin Meeting" : "🎥 Start Meeting"}
                                </button>
                                {isLive && (
                                    <button className="lob-btn-outline lob-share-btn" onClick={() => setShowShare(true)}>
                                        📤 Share Meeting Invite
                                    </button>
                                )}
                            </div>
                        ) : isInvited ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <div className="lob-role">YOU ARE INVITED</div>
                                <p style={{ fontSize: 14, color: "#5f6368", margin: 0, lineHeight: 1.6 }}>You are on the participant list. Join directly — no code needed.</p>
                                <button className="lob-btn-primary lob-join-btn" onClick={() => goPreJoin(onDirectJoin)} disabled={busy || !isLive} style={{ opacity: (!isLive || busy) ? 0.5 : 1, cursor: !isLive ? "not-allowed" : "pointer" }}>
                                    {busy ? "Joining…" : !isLive ? "Waiting for host…" : "🎥 Join Meeting"}
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <div className="lob-role">ENTER MEETING CODE</div>
                                <p style={{ fontSize: 14, color: "#5f6368", margin: 0 }}>Ask the host for the 6-digit join code.</p>
                                <div className="lob-code-row">
                                    <input className="lob-code-input lob-input" value={codeInput} onChange={e => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={e => e.key === "Enter" && handleCodeJoin()} placeholder="000000" maxLength={6} />
                                    <button className="lob-code-join" onClick={handleCodeJoin} disabled={joining || codeInput.length !== 6 || !isLive}>
                                        {joining ? "…" : "Join"}
                                    </button>
                                </div>
                            </div>
                        )}

                        <p style={{ fontSize: 12, color: "#9AA0A6", marginTop: "auto", paddingTop: 8 }}>
                            Joining as <strong style={{ color: "#5f6368" }}>{employeeName}</strong> · Powered by LiveKit
                        </p>
                    </div>

                    {/* ── RIGHT: decorative panel (hidden on mobile) ── */}
                    <div className="lob-right">
                        <div style={{ position: "absolute", width: 380, height: 380, borderRadius: "50%", background: "rgba(26,115,232,0.07)", top: -90, right: -90 }} />
                        <div style={{ position: "absolute", width: 280, height: 280, borderRadius: "50%", background: "rgba(15,157,88,0.07)", bottom: -70, left: -50 }} />
                        <div className="lob-right-inner">
                            <div className="lob-right-icon">
                                <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                                </svg>
                            </div>
                            <h2 className="lob-right-title">{meet?.title || "CoWork Meeting"}</h2>
                            {meet?.description && <p className="lob-right-desc">{meet.description}</p>}
                            <div className="lob-right-cards">
                                {meet?.dateTime && (
                                    <div className="lob-right-card">
                                        <div className="lob-right-card-label">Date &amp; Time</div>
                                        <div className="lob-right-card-val">{new Date(meet.dateTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
                                    </div>
                                )}
                                <div className="lob-right-card">
                                    <div className="lob-right-card-label">Invited</div>
                                    <div className="lob-right-card-val">{meet?.participants?.length || 0} people</div>
                                </div>
                                <div className="lob-right-card">
                                    <div className="lob-right-card-label">Status</div>
                                    <div className="lob-right-card-val" style={{ color: isLive ? "#0F9D58" : "#F29900" }}>{isLive ? "🟢 Live" : "🟡 Scheduled"}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Share meeting modal */}
            {showShare && (
                <ShareMeetingModal
                    meet={meet}
                    joinCode={info?.joinCode}
                    senderId={employeeId}
                    senderName={employeeName}
                    onClose={() => setShowShare(false)}
                />
            )}
        </>
    );
}

// ── PreJoin — sits inside CoworkingShell, Google Meet style ──────────────────
function PreJoin({ meetTitle, employeeName, isHost, onBack, onJoin }) {
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [stream, setStream] = useState(null);
    const [camErr, setCamErr] = useState(false);
    const videoRef = useRef(null);

    useEffect(() => {
        if (!camOn) { setStream(s => { s?.getTracks().forEach(t => t.stop()); return null; }); return; }
        navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
            .then(s => { setStream(s); setCamErr(false); })
            .catch(() => setCamErr(true));
        return () => setStream(s => { s?.getTracks().forEach(t => t.stop()); return null; });
    }, [camOn]);

    useEffect(() => {
        if (videoRef.current && stream) videoRef.current.srcObject = stream;
    }, [stream]);

    const handleJoin = () => {
        stream?.getTracks().forEach(t => t.stop());
        onJoin({ videoEnabled: camOn, audioEnabled: micOn });
    };

    return (
        <>
            <style>{`
                @keyframes pj-in  { from{opacity:0} to{opacity:1} }
                @keyframes pj-up  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
                .pj-ctrl:hover     { background:rgba(255,255,255,0.22) !important; }
                .pj-ctrl-off:hover { background:#b91c1c !important; }
                .pj-join:hover     { background:#1557b0 !important; box-shadow:0 6px 20px rgba(26,115,232,0.45) !important; }
                .pj-back:hover     { background:#F1F3F4 !important; }

                /* ── Page shell ── */
                .pj-page { min-height:100vh; background:#F0F2F5; display:flex; flex-direction:column; font-family:'Google Sans','Roboto',sans-serif; animation:pj-in 0.2s ease; }

                /* ── Top bar ── */
                .pj-topbar { background:#fff; border-bottom:1px solid #E4E7EC; padding:0 24px; height:56px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }

                /* ── Main: two columns ── */
                .pj-main { flex:1; display:flex; align-items:center; justify-content:center; gap:52px; padding:28px 40px; overflow-y:auto; }

                /* ── Left camera side ── */
                .pj-cam-side { flex:0 0 520px; max-width:520px; display:flex; flex-direction:column; gap:14px; animation:pj-up 0.3s ease; }
                .pj-cam-box { position:relative; width:100%; aspect-ratio:16/9; background:#202124; border-radius:20px; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,0.22); }
                .pj-cam-video { width:100%; height:100%; object-fit:contain; transform:scaleX(-1); background:#202124; }
                .pj-cam-off { width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; }
                .pj-cam-avatar { width:88px; height:88px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:36px; font-weight:700; color:#fff; }
                .pj-cam-label { font-size:12px; color:rgba(255,255,255,0.5); }
                .pj-name-tag { display:flex; align-items:center; gap:10px; background:#fff; border:1px solid #E4E7EC; border-radius:10px; padding:10px 14px; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
                .pj-name-av { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:#fff; flex-shrink:0; }
                .pj-status-row { display:flex; justify-content:center; gap:20px; }
                .pj-status-item { display:flex; align-items:center; gap:5px; font-size:12px; font-weight:500; }
                .pj-status-dot { width:7px; height:7px; border-radius:50%; display:inline-block; }

                /* ── Right control side ── */
                .pj-ctrl-side { flex:0 0 300px; display:flex; flex-direction:column; animation:pj-up 0.35s ease; }
                .pj-badge { display:inline-block; font-size:10px; font-weight:700; letter-spacing:0.08em; color:#1A73E8; background:#E8F0FE; border:1px solid #BFDBFE; border-radius:99px; padding:3px 12px; margin-bottom:12px; width:fit-content; }
                .pj-title { font-size:24px; font-weight:700; color:#202124; margin:0 0 6px; line-height:1.3; }
                .pj-subtitle { font-size:13px; color:#5f6368; margin:0 0 22px; }
                .pj-dev-row { display:flex; align-items:center; gap:12px; background:#F8F9FA; border:1px solid #E4E7EC; border-radius:12px; padding:13px 16px; cursor:pointer; transition:background 0.12s; margin-bottom:10px; }
                .pj-dev-row:hover { background:#F1F3F4; }
                .pj-dev-icon { width:36px; height:36px; background:#fff; border:1px solid #E4E7EC; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
                .pj-dev-name { font-size:14px; font-weight:600; color:#202124; margin-bottom:2px; }
                .pj-toggle { width:42px; height:24px; border-radius:99px; position:relative; transition:background 0.2s; flex-shrink:0; }
                .pj-toggle-knob { position:absolute; top:3px; width:18px; height:18px; border-radius:50%; background:#fff; transition:transform 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.2); }
                .pj-join-btn { width:100%; padding:14px 0; background:#1A73E8; border:none; border-radius:12px; color:#fff; font-size:15px; font-weight:700; cursor:pointer; font-family:inherit; box-shadow:0 2px 8px rgba(26,115,232,0.3); transition:all 0.15s; margin-top:4px; }

                /* ── Ctrl buttons overlay on camera ── */
                .pj-ctrl-bar { position:absolute; bottom:16px; left:50%; transform:translateX(-50%); display:flex; gap:14px; z-index:2; }
                .pj-ctrl-btn { width:50px; height:50px; border-radius:50%; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(8px); transition:background 0.15s; }
                .pj-ctrl-name { position:absolute; top:14px; left:14px; z-index:2; font-size:13px; font-weight:600; color:#fff; text-shadow:0 1px 4px rgba(0,0,0,0.6); background:rgba(0,0,0,0.3); padding:3px 10px; border-radius:99px; backdrop-filter:blur(4px); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:calc(100% - 28px); }

                /* ── Tablet 768–1024 ── */
                @media (max-width:1024px) and (min-width:769px) {
                    .pj-main { gap:36px; padding:24px 28px; }
                    .pj-cam-side { flex:0 0 420px; max-width:420px; }
                    .pj-ctrl-side { flex:0 0 260px; }
                    .pj-title { font-size:21px; }
                }

                /* ── Mobile ≤ 768px: stack vertically ── */
                @media (max-width:768px) {
                    .pj-topbar { padding:0 16px; height:50px; }
                    .pj-main { flex-direction:column; gap:20px; padding:16px; align-items:stretch; }
                    .pj-cam-side { flex:none; max-width:100%; width:100%; }
                    .pj-ctrl-side { flex:none; width:100%; }
                    .pj-cam-box { border-radius:16px; }
                    .pj-title { font-size:20px; }
                    .pj-subtitle { font-size:12px; margin-bottom:16px; }
                    .pj-ctrl-btn { width:44px; height:44px; }
                    .pj-join-btn { font-size:14px; padding:13px 0; }
                    .pj-status-row { gap:14px; }
                    .pj-badge { margin-bottom:8px; }
                }

                /* ── Very small ≤ 400px ── */
                @media (max-width:400px) {
                    .pj-main { padding:12px; gap:14px; }
                    .pj-cam-box { border-radius:12px; }
                    .pj-cam-avatar { width:68px; height:68px; font-size:28px; }
                    .pj-ctrl-btn { width:40px; height:40px; }
                    .pj-ctrl-bar { gap:10px; bottom:12px; }
                    .pj-title { font-size:18px; }
                    .pj-join-btn { font-size:14px; }
                }
            `}</style>

            <div className="pj-page">

                {/* ── Top bar ── */}
                <div className="pj-topbar">
                    <button className="pj-back" onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#F1F3F4", border: "1px solid #E4E7EC", borderRadius: 99, fontSize: 13, color: "#5f6368", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s" }}>
                        ← Back
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 30, height: 30, background: "#1a73e8", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                            </svg>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#202124" }}>CoWork</span>
                    </div>
                </div>

                {/* ── Main layout ── */}
                <div className="pj-main">

                    {/* ── LEFT: Camera ── */}
                    <div className="pj-cam-side">
                        <div className="pj-cam-box">
                            {/* Name */}
                            <div className="pj-ctrl-name">{employeeName || "You"}</div>

                            {/* Video or avatar */}
                            {camOn && !camErr && stream
                                ? <video ref={videoRef} autoPlay muted playsInline className="pj-cam-video" />
                                : (
                                    <div className="pj-cam-off">
                                        <div className="pj-cam-avatar" style={{ background: avColor(employeeName || "?") }}>
                                            {(employeeName || "?")[0].toUpperCase()}
                                        </div>
                                        <span className="pj-cam-label">
                                            {camErr ? "Camera unavailable" : "Camera is off"}
                                        </span>
                                    </div>
                                )
                            }

                            {/* Mic + Cam buttons */}
                            <div className="pj-ctrl-bar">
                                <button className="pj-ctrl-btn" onClick={() => setMicOn(v => !v)}
                                    style={{ background: micOn ? "rgba(255,255,255,0.14)" : "#D93025" }}
                                    title={micOn ? "Mute" : "Unmute"}
                                >
                                    {micOn
                                        ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                        : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /><path d="M17 16.95A7 7 0 015 12v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                    }
                                </button>
                                <button className="pj-ctrl-btn" onClick={() => setCamOn(v => !v)}
                                    style={{ background: (camOn && !camErr) ? "rgba(255,255,255,0.14)" : "#D93025" }}
                                    title={camOn ? "Turn off camera" : "Turn on camera"}
                                >
                                    {camOn && !camErr
                                        ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                                        : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                    }
                                </button>
                            </div>
                        </div>

                        {/* Name tag + status */}
                        <div className="pj-name-tag">
                            <div className="pj-name-av" style={{ background: avColor(employeeName || "?") }}>
                                {(employeeName || "?")[0].toUpperCase()}
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 500, color: "#202124", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {employeeName || "You"}
                            </span>
                        </div>
                        <div className="pj-status-row">
                            <span className="pj-status-item" style={{ color: micOn ? "#0F9D58" : "#D93025" }}>
                                <span className="pj-status-dot" style={{ background: micOn ? "#0F9D58" : "#D93025" }} />
                                {micOn ? "Mic on" : "Mic off"}
                            </span>
                            <span className="pj-status-item" style={{ color: (camOn && !camErr) ? "#0F9D58" : "#D93025" }}>
                                <span className="pj-status-dot" style={{ background: (camOn && !camErr) ? "#0F9D58" : "#D93025" }} />
                                {camErr ? "Camera unavailable" : camOn ? "Camera on" : "Camera off"}
                            </span>
                        </div>
                    </div>

                    {/* ── RIGHT: Controls ── */}
                    <div className="pj-ctrl-side">
                        <div className="pj-badge">{isHost ? "HOST" : "PARTICIPANT"}</div>
                        <h2 className="pj-title">{meetTitle || "CoWork Meeting"}</h2>
                        <p className="pj-subtitle">Check your mic and camera before joining</p>

                        {/* Device toggles */}
                        <div className="pj-dev-row" onClick={() => setMicOn(v => !v)}>
                            <div className="pj-dev-icon">
                                {micOn
                                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D93025" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /><path d="M17 16.95A7 7 0 015 12v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                }
                            </div>
                            <div style={{ flex: 1 }}>
                                <div className="pj-dev-name">Microphone</div>
                                <div style={{ fontSize: 12, color: micOn ? "#1a73e8" : "#D93025" }}>{micOn ? "On" : "Off"}</div>
                            </div>
                            <div className="pj-toggle" style={{ background: micOn ? "#1a73e8" : "#E0E0E0" }}>
                                <div className="pj-toggle-knob" style={{ transform: micOn ? "translateX(18px)" : "translateX(2px)" }} />
                            </div>
                        </div>

                        <div className="pj-dev-row" onClick={() => setCamOn(v => !v)}>
                            <div className="pj-dev-icon">
                                {camOn && !camErr
                                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D93025" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                }
                            </div>
                            <div style={{ flex: 1 }}>
                                <div className="pj-dev-name">Camera</div>
                                <div style={{ fontSize: 12, color: (camOn && !camErr) ? "#1a73e8" : "#D93025" }}>
                                    {camErr ? "Unavailable" : camOn ? "On" : "Off"}
                                </div>
                            </div>
                            <div className="pj-toggle" style={{ background: (camOn && !camErr) ? "#1a73e8" : "#E0E0E0" }}>
                                <div className="pj-toggle-knob" style={{ transform: (camOn && !camErr) ? "translateX(18px)" : "translateX(2px)" }} />
                            </div>
                        </div>

                        <button className="pj-join-btn pj-join" onClick={handleJoin}>
                            {isHost ? "Start Meeting" : "Join Now"}
                        </button>

                        <p style={{ fontSize: 11, color: "#9AA0A6", textAlign: "center", marginTop: 10 }}>
                            You can change mic &amp; camera during the meeting
                        </p>
                    </div>

                </div>
            </div>
        </>
    );
}


// ── Ended screen ──────────────────────────────────────────────────────────────
function EndedScreen({ meet, onBack }) {
    return (
        <div style={{ minHeight: "100vh", background: "#F8F9FA", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Google Sans','Roboto',sans-serif" }}>
            <div style={{ textAlign: "center", padding: 40 }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 36 }}>👋</div>
                <h2 style={{ fontSize: 24, fontWeight: 600, color: "#202124", marginBottom: 8 }}>You left the meeting</h2>
                <p style={{ fontSize: 14, color: "#5f6368", marginBottom: 28 }}>{meet?.title || "Meeting"} has ended.</p>
                <button onClick={onBack} style={{ padding: "11px 32px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Return to Meetings
                </button>
            </div>
        </div>
    );
}

function FullLoader() {
    return (
        <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14, fontFamily: "'Google Sans','Roboto',sans-serif" }}>
            <GlobalCSS />
            <div style={{ width: 40, height: 40, border: "3px solid #E4E7EC", borderTopColor: "#1A73E8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 14, color: "#5f6368" }}>Loading meeting…</span>
        </div>
    );
}

// ── Icon components ───────────────────────────────────────────────────────────
function PeopleIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>;
}
function LockIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>;
}

// ── Global CSS ────────────────────────────────────────────────────────────────
function GlobalCSS() {
    return (
        <style>{`
            @keyframes spin  { to { transform: rotate(360deg); } }
            @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
            .lk-video-conference { height:100% !important; width:100% !important; }
            [data-lk-theme="default"] { --lk-bg:#111 !important; }

            /* ── Override LiveKit's grey person silhouette with coloured initial avatar ── */

            /* Hide the default grey SVG person icon completely */
            .lk-participant-placeholder svg,
            .lk-participant-tile .lk-participant-placeholder svg,
            [class*="participantPlaceholder"] svg,
            .lk-camera-disabled-indicator svg,
            .lk-participant-media-video ~ .lk-participant-placeholder svg {
                display: none !important;
            }

            /* The placeholder container — turn it into a solid coloured circle */
            .lk-participant-placeholder,
            .lk-participant-tile .lk-participant-placeholder,
            [class*="participantPlaceholder"] {
                background: transparent !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 100% !important;
                height: 100% !important;
                position: absolute !important;
                inset: 0 !important;
            }

            /* Inject the coloured circle via ::before — colour driven by CSS custom property set per-tile */
            .lk-participant-placeholder::before,
            [class*="participantPlaceholder"]::before {
                content: attr(data-lk-participant-name);
                width: 96px;
                height: 96px;
                border-radius: 50%;
                background: var(--lk-av-color, #1A73E8);
                color: #fff;
                font-size: 36px;
                font-weight: 700;
                font-family: 'Google Sans', 'Roboto', sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                letter-spacing: 0.02em;
                box-shadow: 0 4px 20px rgba(0,0,0,0.35);
                text-transform: uppercase;
            }

            /* Make the tile background dark (not grey) when camera is off */
            .lk-participant-tile:not(:has(video[style*="display: block"])) .lk-participant-placeholder ~ *,
            .lk-participant-tile { background: #1a1a1a !important; }

            /* Responsive avatar size */
            @media (max-width: 600px) {
                .lk-participant-placeholder::before,
                [class*="participantPlaceholder"]::before {
                    width: 68px; height: 68px; font-size: 26px;
                }
            }

            /* ── TopBar responsive ── */
            .tb-root { height:52px; display:flex; align-items:center; justify-content:space-between; padding:0 14px; background:#202124; border-bottom:1px solid #2a2a2a; flex-shrink:0; z-index:10; gap:8px; font-family:'Google Sans','Roboto',sans-serif; }
            .tb-left  { display:flex; align-items:center; gap:8px; min-width:0; flex:1; }
            .tb-right { display:flex; align-items:center; gap:5px; flex-shrink:0; position:relative; }
            .tb-meet-name { font-size:13px; font-weight:500; color:#E8EAED; white-space:normal; word-break:break-word; line-height:1.35; max-width:280px; }
            .tb-elapsed   { font-size:11px; color:#9AA0A6; font-family:monospace; flex-shrink:0; background:rgba(255,255,255,0.08); padding:2px 8px; border-radius:99px; }
            .tb-btn   { display:inline-flex; align-items:center; gap:5px; padding:6px 11px; background:#2A2A2A; border:1px solid #3C4043; border-radius:8px; color:#BDC1C6; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:all 0.12s; white-space:nowrap; }
            .tb-btn:hover { background:#3C4043; }
            .tb-btn-active { background:#1e3a5f !important; color:#60A5FA !important; border-color:#3B82F6 !important; }
            .tb-btn-label { /* shown on desktop */ }
            .tb-end-btn   { display:inline-flex; align-items:center; gap:5px; padding:7px 14px; background:#EA4335; border:none; border-radius:8px; color:#fff; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; white-space:nowrap; }
            .tb-leave-btn { display:inline-flex; align-items:center; gap:5px; padding:7px 14px; background:transparent; border:1.5px solid #EA4335; border-radius:8px; color:#EA4335; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; white-space:nowrap; }

            /* Mobile < 600px: hide labels from middle buttons, keep end/leave text */
            @media (max-width:600px) {
                .tb-root  { padding:0 8px; gap:4px; height:48px; }
                .tb-btn   { padding:6px 9px; gap:0; }
                .tb-btn-label { display:none; }
                .tb-meet-name { max-width:160px; font-size:12px; }
                .tb-time  { display:none; }
                .tb-end-btn   { padding:7px 10px; font-size:12px; }
                .tb-leave-btn { padding:7px 10px; font-size:12px; }
            }

            /* Very small < 380px */
            @media (max-width:380px) {
                .tb-meet-name { max-width:80px; font-size:12px; }
                .tb-end-btn   { padding:6px 8px; font-size:11px; }
                .tb-leave-btn { padding:6px 8px; font-size:11px; }
                .tb-btn { padding:5px 7px; }
            }
        `}</style>
    );
}

// ── Room styles (dark) ────────────────────────────────────────────────────────
const S = {
    roomRoot: { position: "fixed", inset: 0, zIndex: 9999, background: "#111", display: "flex", flexDirection: "column", fontFamily: "'Google Sans','Roboto',sans-serif" },
    lkRoom: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 },
    topBar: { height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", background: "#202124", borderBottom: "1px solid #2a2a2a", flexShrink: 0, zIndex: 10, gap: 12 },
    livePill: { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", background: "#EA4335", borderRadius: 99, fontSize: 10, fontWeight: 800, color: "#fff", letterSpacing: "0.04em", flexShrink: 0 },
    liveDot: { width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.85)", display: "inline-block", animation: "pulse 1.5s ease infinite" },
    meetName: { fontSize: 14, fontWeight: 500, color: "#E8EAED", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    topBtn: { display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "#2A2A2A", border: "1px solid #3C4043", borderRadius: 8, color: "#BDC1C6", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" },
    topBtnActive: { background: "#1e3a5f", color: "#60A5FA", border: "1px solid #3B82F6" },
    dropdown: { position: "absolute", top: 48, right: 0, background: "#1f1f1f", border: "1px solid #3C4043", borderRadius: 12, padding: "16px", boxShadow: "0 12px 40px rgba(0,0,0,0.6)", zIndex: 300, minWidth: 260 },
    personRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", marginBottom: 6 },
    personAvatar: { width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 },
    codeBig: { fontFamily: "monospace", fontSize: 34, fontWeight: 800, color: "#E8EAED", letterSpacing: 10, textAlign: "center", padding: "12px 0", background: "#2a2a2a", borderRadius: 8, marginBottom: 10 },
    copyBtn: { width: "100%", padding: "9px 0", background: "#1A73E8", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    endBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", background: "#EA4335", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    leaveTopBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", background: "transparent", border: "1.5px solid #EA4335", borderRadius: 8, color: "#EA4335", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
};

// ── ShareMeetingModal — CEO/TL sends meeting invite via DM ───────────────────
function ShareMeetingModal({ meet, joinCode, senderId, senderName, onClose }) {
    const [employees, setEmployees] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [search, setSearch] = useState("");

    useEffect(() => {
        import("../../../lib/coworkFirebase").then(({ firebaseDb }) => {
            import("firebase/firestore").then(({ collection, getDocs }) => {
                getDocs(collection(firebaseDb, "cowork_employees")).then(snap => {
                    const list = [];
                    snap.forEach(d => { const e = d.data(); if (e.employeeId && e.employeeId !== senderId) list.push(e); });
                    setEmployees(list);
                });
            });
        });
    }, [senderId]);

    const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const selectAll = () => setSelected(new Set(employees.map(e => e.employeeId)));
    const clearAll = () => setSelected(new Set());

    const handleSend = async () => {
        if (selected.size === 0) return;
        setSending(true);
        try {
            const { firebaseDb } = await import("../../../lib/coworkFirebase");
            const { collection, doc, setDoc, getDoc, updateDoc, serverTimestamp } = await import("firebase/firestore");

            const liveCode = joinCode || meet?.joinCode || meet?.meetId || "—";
            const inviteText = `📹 MEETING INVITATION\n\nMeeting: ${meet?.title || "CoWork Meeting"}\nDescription: ${meet?.description || "—"}\nDate & Time: ${meet?.dateTime ? new Date(meet.dateTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}\nJoin Code: ${liveCode}\n\nSent by: ${senderName} (CEO / Team Lead)\n\nClick Join Meeting to participate.`;

            for (const empId of selected) {
                const sorted = [senderId, empId].sort();
                const convId = `${sorted[0]}_${sorted[1]}`;
                const convRef = doc(firebaseDb, "cowork_direct_messages", convId);
                const msgsRef = collection(firebaseDb, "cowork_direct_messages", convId, "messages");
                const convSnap = await getDoc(convRef);
                if (!convSnap.exists()) await setDoc(convRef, { conversationId: convId, participantIds: sorted, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
                const msgId = crypto.randomUUID();
                await setDoc(doc(msgsRef, msgId), {
                    messageId: msgId, threadType: "direct", threadId: convId,
                    senderId, senderName, text: inviteText,
                    messageType: "meeting_invite", type: "meeting_invite",
                    meetingData: { meetId: meet?.meetId, joinCode: liveCode, meetTitle: meet?.title, description: meet?.description, dateTime: meet?.dateTime },
                    readBy: [senderId], status: "sent", createdAt: serverTimestamp(),
                });
                await updateDoc(convRef, { lastMessage: { text: `📹 Meeting invite: ${meet?.title}`, senderId, senderName, messageType: "meeting_invite", sentAt: serverTimestamp() }, updatedAt: serverTimestamp() });
            }
            setSent(true);
            setTimeout(() => { setSent(false); onClose(); }, 2000);
        } catch (e) { console.error("Share invite error:", e); }
        setSending(false);
    };

    const filtered = employees.filter(e => !search || e.name?.toLowerCase().includes(search.toLowerCase()) || e.department?.toLowerCase().includes(search.toLowerCase()));

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)", fontFamily: "'Google Sans','Roboto',sans-serif" }} onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 520, boxShadow: "0 24px 60px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", maxHeight: "88vh", overflow: "hidden" }}>

                {/* Header */}
                <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #E4E7EC", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#202124" }}>📤 Share Meeting Invite</div>
                        <div style={{ fontSize: 12, color: "#5f6368", marginTop: 3 }}>{meet?.title} · {meet?.meetId}</div>
                    </div>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#5f6368", fontSize: 20 }}>✕</button>
                </div>

                {/* Meeting invite preview card */}
                <div style={{ margin: "16px 24px 0", background: "linear-gradient(135deg,#1A73E8,#0D47A1)", borderRadius: 14, padding: "18px 20px", color: "#fff", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 36, height: 36, background: "rgba(255,255,255,0.2)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                        </div>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{meet?.title}</div>
                            <div style={{ fontSize: 11, opacity: 0.8 }}>Meeting Invitation · from {senderName}</div>
                        </div>
                    </div>
                    {meet?.description && <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8, lineHeight: 1.5 }}>{meet.description}</div>}
                    <div style={{ display: "flex", gap: 14, fontSize: 12, flexWrap: "wrap" }}>
                        {meet?.dateTime && <span>📅 {new Date(meet.dateTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>}
                        <span>🔑 <strong style={{ fontFamily: "monospace", letterSpacing: 2 }}>{meet?.meetId}</strong></span>
                    </div>
                </div>

                {/* Search */}
                <div style={{ padding: "14px 24px 0", flexShrink: 0 }}>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…"
                        style={{ width: "100%", padding: "9px 14px", border: "1.5px solid #E4E7EC", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
                </div>

                {/* Select controls */}
                <div style={{ padding: "10px 24px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: "#5f6368" }}>{selected.size} selected</span>
                    <div style={{ display: "flex", gap: 12 }}>
                        <button onClick={selectAll} style={{ fontSize: 12, color: "#1a73e8", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Select all</button>
                        <button onClick={clearAll} style={{ fontSize: 12, color: "#D93025", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Clear</button>
                    </div>
                </div>

                {/* Employee list */}
                <div style={{ flex: 1, overflowY: "auto", padding: "4px 24px 16px" }}>
                    {filtered.map(emp => {
                        const isSel = selected.has(emp.employeeId);
                        const color = AVATAR_COLORS[(emp.name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];
                        return (
                            <div key={emp.employeeId} onClick={() => toggle(emp.employeeId)}
                                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, cursor: "pointer", background: isSel ? "#EBF3FE" : "transparent", marginBottom: 4, border: isSel ? "1px solid #BFDBFE" : "1px solid transparent", transition: "all 0.1s" }}>
                                <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${isSel ? "#1a73e8" : "#DADCE0"}`, background: isSel ? "#1a73e8" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.1s" }}>
                                    {isSel && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                </div>
                                <div style={{ width: 36, height: 36, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                                    {initials(emp.name || "?")}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: "#202124" }}>
                                        {emp.name}
                                        {emp.role === "tl" && <span style={{ fontSize: 10, background: "#E8F5E9", color: "#2E7D32", borderRadius: 99, padding: "1px 6px", marginLeft: 6, fontWeight: 700 }}>TL</span>}
                                    </div>
                                    <div style={{ fontSize: 12, color: "#9AA0A6" }}>{emp.department || emp.role}</div>
                                </div>
                            </div>
                        );
                    })}
                    {filtered.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", color: "#9AA0A6", fontSize: 13 }}>No employees found</div>}
                </div>

                {/* Footer */}
                <div style={{ padding: "14px 24px 20px", borderTop: "1px solid #E4E7EC", display: "flex", gap: 10, flexShrink: 0 }}>
                    <button onClick={onClose} style={{ flex: 1, padding: "11px 0", background: "#F8F9FA", border: "1px solid #E4E7EC", borderRadius: 10, fontSize: 14, fontWeight: 600, color: "#5f6368", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                    <button onClick={handleSend} disabled={sending || selected.size === 0 || sent}
                        style={{ flex: 2, padding: "11px 0", background: sent ? "#0F9D58" : "#1a73e8", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, color: "#fff", cursor: selected.size === 0 ? "not-allowed" : "pointer", opacity: selected.size === 0 ? 0.45 : 1, fontFamily: "inherit", transition: "background 0.2s" }}>
                        {sent ? "✓ Sent!" : sending ? "Sending…" : `Send to ${selected.size} employee${selected.size !== 1 ? "s" : ""}`}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Lobby styles (light — Google Meet look) ───────────────────────────────────
const L = {
    chip: { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", background: "#F1F3F4", borderRadius: 99, fontSize: 12, color: "#5f6368" },
    roleLabel: { fontSize: 11, fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.07em" },
    primaryBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px 0", background: "#1A73E8", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
};