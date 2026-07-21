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

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { getMeet } from "../../../lib/coworkApi";
import { startMeeting, joinByCode, getMeetingInfo, endMeeting } from "../../../lib/livekitApi";
import { setPipMeeting as storePipMeeting, clearPipMeeting, setPipControls, getPipMeeting } from "../../../lib/pipMeetingStore";
import RecordingControls from "./RecordingControls";
import { useMeetingRecording } from "../../../hooks/useMeetingRecording";

import {
    LiveKitRoom,
    VideoConference,
    RoomAudioRenderer,
    useParticipants,
    useLocalParticipant,
    useRoomContext,
    useTracks,
} from "@livekit/components-react";
import { Track, RoomEvent } from "livekit-client";
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
    // Profile pic map: employeeId OR name → profilePicUrl
    const [participantPicMap, setParticipantPicMap] = useState({});
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
        employeeName, // full display name — used in heartbeat + upload events
        // Use full name sanitized — avoids collision when two people share first name
        firstName: (employeeName || "Unknown").replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || employeeId,
        isHost,
    });

    const intentionalLeave = useRef(false);
    const autoStartedRef = useRef(false);

    // ── AUTO-START recording when HOST enters the room ────────────────────────
    // Requirement: recording begins for the HOST immediately on meeting start.
    useEffect(() => {
        if (!isHost) return;
        if (phase !== "room") return;
        if (autoStartedRef.current) return;
        if (recording.isRecording) return;
        autoStartedRef.current = true;
        const t = setTimeout(() => {
            console.log("[CoworkMeetingRoom] 🎙️ Auto-starting recording for host");
            recording.hostStartRecording();
        }, 2000);
        return () => clearTimeout(t);
    }, [isHost, phase, recording]);

    // ── Load meeting ──────────────────────────────────────────────────────────
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const isRestore = params.get("restore") === "1";
        if (isRestore) {
            const pip = getPipMeeting();
            if (pip.isActive && pip.token) {
                setToken(pip.token);
                setUserChoices(pip.userChoices || { audioEnabled: true, videoEnabled: false });
                intentionalLeave.current = false;
                setPhase("room");
                clearPipMeeting();
                // Fetch meet info in background for TopBar (non-blocking)
                getMeet(meetId).then(r => { if (r?.meet) setMeet(r.meet); }).catch(() => { });
                getMeetingInfo(meetId).then(r => { if (r) setInfo(r); }).catch(() => { });
                return;
            }
        }
        clearPipMeeting();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!loading && !user) { router.push("/coworking-login"); return; }
        if (!user || !meetId) return;
        if (phase === "room" && token) return; // already restored from PiP — skip
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

                // Build profile pic map from all participants
                try {
                    const { firebaseDb } = await import("../../../lib/coworkFirebase");
                    const { collection, getDocs } = await import("firebase/firestore");
                    const snap = await getDocs(collection(firebaseDb, "cowork_employees"));
                    const picMap = {};
                    snap.forEach(d => {
                        const e = d.data();
                        if (e.profilePicUrl) {
                            if (e.employeeId) picMap[e.employeeId] = e.profilePicUrl;
                            if (e.name) picMap[e.name] = e.profilePicUrl;
                        }
                    });
                    setParticipantPicMap(picMap);
                } catch (_) { }
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

    // ── Minimize to PiP — hand off to CoworkingShell's PiP system ───────────
    // Stores token in pipMeetingStore → CoworkingShell renders the floating widget
    // Navigates to dashboard so user sees actual page with PiP overlay on top
    const handleMinimize = () => {
        // Use internal pipMode — keeps LiveKit connected, shows dashboard via iframe
        // Never navigate away — that would unmount LiveKit and drop the connection
        setPipMode(true);
        setPipCollapsed(false);
        setPipPos({ x: null, y: null });
    };

    const handleRestorePip = () => {
        setPipMode(false);
        setPipCollapsed(false);
    };

    // ── PiP drag — smooth, works on mouse + touch, iframe-safe ─────────────
    const handlePipDragStart = (e) => {
        const el = pipDragRef.current;
        if (!el) return;
        e.preventDefault();

        // Get start pointer position (touch or mouse)
        const startX = e.touches ? e.touches[0].clientX : e.clientX;
        const startY = e.touches ? e.touches[0].clientY : e.clientY;
        const rect = el.getBoundingClientRect();
        const origX = rect.left;
        const origY = rect.top;

        // Disable iframe pointer events during drag so it doesn't steal events
        const iframe = el.closest("[data-pip-root]")?.querySelector("iframe");
        if (iframe) iframe.style.pointerEvents = "none";

        // Move using transform directly on DOM — no React setState during drag
        el.style.transition = "none";
        let lastX = origX;
        let lastY = origY;

        const onMove = (e2) => {
            const cx = e2.touches ? e2.touches[0].clientX : e2.clientX;
            const cy = e2.touches ? e2.touches[0].clientY : e2.clientY;
            const dx = cx - startX;
            const dy = cy - startY;
            lastX = Math.max(8, Math.min(window.innerWidth - rect.width - 8, origX + dx));
            lastY = Math.max(8, Math.min(window.innerHeight - rect.height - 8, origY + dy));
            el.style.left = lastX + "px";
            el.style.top = lastY + "px";
            el.style.right = "auto";
            el.style.bottom = "auto";
        };

        const onUp = () => {
            // Re-enable iframe pointer events
            if (iframe) iframe.style.pointerEvents = "";
            el.style.transition = "";
            // Commit final position to React state
            setPipPos({ x: lastX, y: lastY });
            pipDragState.current = null;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("touchend", onUp);
        };

        pipDragState.current = { startX, startY, origX, origY };
        window.addEventListener("mousemove", onMove, { passive: true });
        window.addEventListener("mouseup", onUp);
        window.addEventListener("touchmove", onMove, { passive: true });
        window.addEventListener("touchend", onUp);
    };

    // Stores the intended destination when user navigates away mid-meeting
    const navigateAfterLeave = useRef(null);

    const handleDisconnected = () => {
        const dest = navigateAfterLeave.current || "/coworking/schedule-meet";
        navigateAfterLeave.current = null;
        router.push(dest);
    };

    // ── Auto-leave when navigating to another page ────────────────────────────
    // Intercepts clicks on sidebar nav links while in-room
    useEffect(() => {
        if (phase !== "room") return;

        const handleClick = (e) => {
            const anchor = e.target.closest("a[href]");
            if (!anchor) return;
            const href = anchor.getAttribute("href");
            if (!href) return;
            // Ignore same-page or meeting links
            if (href.includes("cowork-meeting")) return;
            if (href === window.location.pathname) return;
            // Navigation away = FULL LEAVE (not PiP)
            // Store destination so handleDisconnected goes there, not schedule-meet
            e.preventDefault();
            e.stopPropagation();
            navigateAfterLeave.current = href;
            intentionalLeave.current = true;
            setToken(null); // triggers LiveKit disconnect → handleDisconnected → router.push(dest)
        };

        document.addEventListener("click", handleClick, true); // capture phase
        return () => document.removeEventListener("click", handleClick, true);
    }, [phase, router]);
    useEffect(() => {
        if (phase !== "room") return;

        // 1. Browser back button — popstate fires when history goes back
        const handlePopState = () => {
            intentionalLeave.current = true;
            setToken(null);
            // Don't push — the back navigation already changed URL
        };
        window.addEventListener("popstate", handlePopState);

        // 2. Tab/window close or hard navigation
        const handleBeforeUnload = (e) => {
            e.preventDefault();
            e.returnValue = "You are in a meeting. Are you sure you want to leave?";
        };
        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            window.removeEventListener("popstate", handlePopState);
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [phase]);

    // ── Render ────────────────────────────────────────────────────────────────
    if ((loading || phase === "loading") && !(phase === "room" && token)) return <FullLoader />;
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
                            <AvatarColorInjector picMap={participantPicMap} />
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
                                participantPicMap={participantPicMap}
                            />
                            <div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                                <SmartVideoConference />
                            </div>
                            <RoomAudioRenderer />
                        </LiveKitRoom>
                    </div>
                </div>

                {/* ── PiP mode: dashboard iframe overlay + floating box ── */}
                {pipMode && (
                    <>
                        {/* Dashboard shown via iframe so user can interact with app */}
                        <div data-pip-root="" style={{ position: "fixed", inset: 0, zIndex: 100, background: "#fff" }}>
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
                            <div onMouseDown={handlePipDragStart} onTouchStart={handlePipDragStart}
                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "#0F172A", cursor: "grab", borderBottom: "1px solid rgba(255,255,255,0.08)", touchAction: "none" }}>
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
            ownPicUrl={participantPicMap[employeeId] || ""}
            onStart={handleStart}
            onDirectJoin={handleDirectJoin}
            onJoinByCode={handleJoinByCode}
            onBack={() => router.push("/coworking/schedule-meet")}
        />
    );
}

// ── AvatarColorInjector ───────────────────────────────────────────────────────
// Watches LiveKit DOM and injects profile pics OR coloured initials
// into participant placeholder tiles when camera is off.
const AVATAR_COLORS_LIST = ["#1A73E8", "#0F9D58", "#F29900", "#7B1FA2", "#D93025", "#00ACC1", "#E64A19", "#0097A7"];
function getAvatarColor(name = "") { return AVATAR_COLORS_LIST[(name.charCodeAt(0) || 0) % AVATAR_COLORS_LIST.length]; }
function getInitials(name = "") { return name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?"; }

function AvatarColorInjector({ picMap = {} }) {
    useEffect(() => {
        const applyAvatars = () => {
            const tiles = document.querySelectorAll(".lk-participant-tile");
            tiles.forEach(tile => {
                const nameEl = tile.querySelector(".lk-participant-name, [class*='participantName'], .lk-participant-metadata-item");
                const name = nameEl?.textContent?.replace(/\(you\)/i, "").trim() || "";
                if (!name) return;

                const placeholder = tile.querySelector(".lk-participant-placeholder, [class*='participantPlaceholder']");
                if (!placeholder) return;

                // Already injected?
                if (placeholder.dataset.picInjected === name) return;
                placeholder.dataset.picInjected = name;

                const picUrl = picMap[name] || "";
                const color = getAvatarColor(name);
                const inits = getInitials(name);

                // Clear previous injection
                const old = placeholder.querySelector(".cw-injected-av");
                if (old) old.remove();

                // Set tile CSS var for any remaining CSS usage
                tile.style.setProperty("--lk-av-color", color);
                placeholder.setAttribute("data-lk-participant-name", inits);
                placeholder.style.setProperty("--lk-av-color", color);

                // Inject profile pic or initials circle
                const av = document.createElement("div");
                av.className = "cw-injected-av";
                av.style.cssText = `
                    position:absolute; inset:0; display:flex; align-items:center;
                    justify-content:center; z-index:2; pointer-events:none;
                `;
                if (picUrl) {
                    av.innerHTML = `<img src="${picUrl}" alt="${name}" style="width:88px;height:88px;border-radius:50%;object-fit:cover;box-shadow:0 4px 16px rgba(0,0,0,0.4);" />`;
                } else {
                    av.innerHTML = `<div style="width:88px;height:88px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;color:#fff;letter-spacing:-1px;">${inits}</div>`;
                }

                // Make placeholder relative so our injected div positions correctly
                placeholder.style.position = "relative";
                placeholder.appendChild(av);
            });
        };

        applyAvatars();
        const observer = new MutationObserver(applyAvatars);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
        const interval = setInterval(applyAvatars, 1500);

        return () => { observer.disconnect(); clearInterval(interval); };
    }, [picMap]);
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

// ── SmartVideoConference — fixes presenter layout stuck after screen share ends
// ROOT CAUSE: VideoConference remounts but React's useTracks state hasn't
// cleared yet → VideoConference immediately re-pins the track → stuck again.
// FIX: Wait for React state (useTracks) to confirm tracks are gone BEFORE
// remounting VideoConference. Only then is it safe to remount to grid layout.
function SmartVideoConference() {
    const [vcKey, setVcKey] = useState(0);
    const [pendingReset, setPendingReset] = useState(false);
    const room = useRoomContext();

    // Watch screen share tracks via React state (not JS events)
    const screenTracks = useTracks([Track.Source.ScreenShare]);

    // Step 1: JS event fires → mark pending reset
    useEffect(() => {
        if (!room) return;
        const onUnsubscribed = (track) => {
            if (track.source === Track.Source.ScreenShare) {
                setPendingReset(true);
            }
        };
        room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed);
        return () => room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed);
    }, [room]);

    // Step 2: Only remount AFTER React confirms tracks are gone
    // This ensures new VideoConference won't find stale track data and re-pin
    useEffect(() => {
        if (pendingReset && screenTracks.length === 0) {
            setVcKey(k => k + 1);
            setPendingReset(false);
        }
    }, [pendingReset, screenTracks.length]);

    return <VideoConference key={vcKey} />;
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
        // Sync controls to pip store so Shell PiP buttons work
        setPipControls({
            micOn, camOn,
            toggleMic: () => localParticipant.setMicrophoneEnabled(!micOn),
            toggleCam: () => localParticipant.setCameraEnabled(!camOn),
        });
    }, [micOn, camOn, localParticipant]); // onReady is a ref, not a dep

    return null;
}

// ── Top bar (inside LiveKitRoom) ──────────────────────────────────────────────
function TopBar({ meet, isHost, joinCode, recording, onEnd, onLeave, onMinimize, employeeId, employeeName, participantPicMap = {} }) {
    const [showCode, setShowCode] = useState(false);
    const [showPeople, setShowPeople] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const [showAudioMonitor, setShowAudioMonitor] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const [copied, setCopied] = useState(false);
    const [elapsed, setElapsed] = useState(0); // seconds since meeting started
    const participants = useParticipants();
    const { localParticipant } = useLocalParticipant();

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

    // Back: always stop screen share first, wait for remote layout to reset, then PiP
    const handleBack = useCallback(async () => {
        if (localParticipant) {
            try {
                // Always call unconditionally — no-op if not sharing,
                // but properly signals ALL remote clients to drop presenter layout
                await localParticipant.setScreenShareEnabled(false);
                // 800ms lets LiveKit propagate track removal AND remote VideoConference
                // switch from presenter-layout back to grid before we hide our room
                await new Promise(r => setTimeout(r, 800));
            } catch (e) {
                console.warn("[TopBar] screen share stop:", e.message);
            }
        }
        onMinimize?.();
    }, [localParticipant, onMinimize]);

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
                    <button onClick={handleBack} title="Back to dashboard — meeting continues in mini view"
                        className="tb-back-btn"
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#E8EAED", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginRight: 6, flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        <span className="tb-back-label">Back</span>
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
                                        {participantPicMap[p.identity] || participantPicMap[name]
                                            ? <img src={participantPicMap[p.identity] || participantPicMap[name]} alt={name}
                                                style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                                            : <div style={{ ...S.personAvatar, background: avColor(name) }}>{initials(name)}</div>
                                        }
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

                {/* Audio Monitor — Host only — desktop/tablet only (mobile uses More menu) */}
                {isHost && (
                    <div className="tb-btn-extra" style={{ position: "relative" }}>
                        <button className={`tb-btn${showAudioMonitor ? " tb-btn-active" : ""}`}
                            onClick={() => { setShowAudioMonitor(p => !p); setShowPeople(false); setShowCode(false); setShowShare(false); }}
                            title="Audio Monitor — see who has audio issues">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                            </svg>
                            <span className="tb-btn-label">Audio</span>
                        </button>
                    </div>
                )}
                {/* Audio Monitor dropdown — rendered outside tb-btn-extra so it works
                    even when the button is hidden on mobile (triggered via More menu) */}
                {isHost && showAudioMonitor && (() => {
                    // Build audio status for every participant including local
                    const allP = [...participants];
                    const audioStatus = allP.map(p => {
                        const pubs = [...p.audioTrackPublications.values()];
                        const hasTrack = pubs.length > 0;
                        const track = pubs[0];
                        const isPublished = hasTrack && !!track.track;
                        const isMuted = hasTrack ? (track.isMuted || !track.isEnabled) : true;
                        const micEnabled = p.isMicrophoneEnabled;
                        // Diagnosis
                        let status, statusColor, statusBg, reason;
                        if (!hasTrack || !isPublished) {
                            status = "No Track"; statusColor = "#EF4444"; statusBg = "#FEF2F2";
                            reason = "Audio track not published — likely mic permission denied or device error";
                        } else if (!micEnabled || isMuted) {
                            status = "Muted"; statusColor = "#F59E0B"; statusBg = "#FFFBEB";
                            reason = "Track published but microphone is muted";
                        } else {
                            status = "✓ OK"; statusColor = "#10B981"; statusBg = "#ECFDF5";
                            reason = "Audio publishing normally";
                        }
                        return { p, name: p.name || p.identity || "?", isMe: p.isLocal, hasTrack, isPublished, micEnabled, isMuted, status, statusColor, statusBg, reason };
                    });
                    const issueCount = audioStatus.filter(a => a.status !== "✓ OK").length;
                    return (
                        <div style={{ ...S.dropdown, width: 340, maxHeight: 420, overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EAED", flex: 1 }}>Audio Monitor</div>
                                {issueCount > 0
                                    ? <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#FEF2F2", color: "#EF4444" }}>⚠ {issueCount} issue{issueCount > 1 ? "s" : ""}</span>
                                    : <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#ECFDF5", color: "#10B981" }}>✓ All clear</span>
                                }
                            </div>
                            {/* Column headers */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px", gap: 4, padding: "4px 6px", marginBottom: 4 }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: "#5F6368", textTransform: "uppercase", letterSpacing: "0.06em" }}>Participant</span>
                                <span style={{ fontSize: 9, fontWeight: 700, color: "#5F6368", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>Track</span>
                                <span style={{ fontSize: 9, fontWeight: 700, color: "#5F6368", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>Status</span>
                            </div>
                            {audioStatus.map(({ p, name, isMe, hasTrack, isPublished, micEnabled, isMuted, status, statusColor, statusBg, reason }, i) => (
                                <div key={p.identity || i} style={{ marginBottom: 6, background: "#1E1E1E", borderRadius: 9, padding: "8px 10px", border: `1px solid ${status !== "✓ OK" ? "#3C2020" : "#2A2A2A"}` }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px", gap: 4, alignItems: "center" }}>
                                        {/* Name */}
                                        <div style={{ fontSize: 12, fontWeight: 600, color: "#E8EAED", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {name}{isMe && <span style={{ fontSize: 9, color: "#9AA0A6", marginLeft: 4 }}>(you)</span>}
                                        </div>
                                        {/* Track published */}
                                        <div style={{ textAlign: "center" }}>
                                            {isPublished
                                                ? <span style={{ fontSize: 10, color: "#10B981", fontWeight: 600 }}>✓ Live</span>
                                                : <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 600 }}>✗ None</span>
                                            }
                                        </div>
                                        {/* Status badge */}
                                        <div style={{ textAlign: "center" }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: statusBg, color: statusColor, display: "inline-block" }}>
                                                {status}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Reason — only for issues */}
                                    {status !== "✓ OK" && (
                                        <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 5, lineHeight: 1.4, borderTop: "1px solid #2A2A2A", paddingTop: 5 }}>
                                            💡 {reason}
                                        </div>
                                    )}
                                    {/* Mic / Cam detail row */}
                                    <div style={{ display: "flex", gap: 10, marginTop: 5 }}>
                                        <span style={{ fontSize: 10, color: micEnabled ? "#10B981" : "#EF4444" }}>
                                            {micEnabled ? "🎙️ Mic on" : "🔇 Mic off"}
                                        </span>
                                        <span style={{ fontSize: 10, color: "#9AA0A6" }}>
                                            {p.audioTrackPublications.size} audio track{p.audioTrackPublications.size !== 1 ? "s" : ""}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {/* Tip for host */}
                            <div style={{ marginTop: 8, padding: "8px 10px", background: "#1A1A2E", borderRadius: 8, fontSize: 10, color: "#9AA0A6", lineHeight: 1.5 }}>
                                💡 If someone shows "No Track" — ask them to check browser mic permissions and rejoin. If "Muted" — ask them to unmute.
                            </div>
                            <button onClick={() => setShowAudioMonitor(false)} style={{ marginTop: 8, width: "100%", background: "#2A2A2A", border: "none", borderRadius: 6, color: "#9AA0A6", fontSize: 12, padding: "6px 0", cursor: "pointer" }}>Close</button>
                        </div>
                    );
                })()}

                {/* Invite — CEO/TL only — desktop/tablet only (mobile uses More menu) */}
                {isHost && (
                    <div className="tb-btn-extra" style={{ position: "relative" }}>
                        <button className={`tb-btn${showShare ? " tb-btn-active" : ""}`}
                            onClick={() => { setShowShare(p => !p); setShowCode(false); setShowPeople(false); }} title="Share Invite">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                            </svg>
                            <span className="tb-btn-label">Invite</span>
                        </button>
                    </div>
                )}
                {/* Share modal — outside the hidden parent so it renders on mobile too */}
                {isHost && showShare && (
                    <ShareMeetingModal meet={meet} joinCode={joinCode} senderId={employeeId} senderName={employeeName} onClose={() => setShowShare(false)} />
                )}

                {/* Code — CEO/TL only — desktop/tablet only (mobile uses More menu) */}
                {isHost && joinCode && (
                    <div className="tb-btn-extra" style={{ position: "relative" }}>
                        <button className={`tb-btn${showCode ? " tb-btn-active" : ""}`}
                            onClick={() => { setShowCode(p => !p); setShowPeople(false); setShowShare(false); }} title="Meeting Code">
                            <LockIcon />
                            <span className="tb-btn-label">Code</span>
                        </button>
                    </div>
                )}
                {/* Code dropdown — rendered outside the hidden parent so it works on mobile */}
                {isHost && joinCode && showCode && (
                    <div style={{ ...S.dropdown, minWidth: 210, right: 0 }}>
                        <div style={{ fontSize: 11, color: "#9AA0A6", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Share this code</div>
                        <div style={S.codeBig}>{joinCode}</div>
                        <button onClick={copyCode} style={S.copyBtn}>{copied ? "✓ Copied!" : "Copy Code"}</button>
                    </div>
                )}

                {/* Record — CEO/TL only */}
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
                        participantStatuses={recording.participantStatuses}
                    />
                )}

                {/* More menu — mobile only — host only (Audio Monitor, Invite, Code) */}
                {isHost && (
                    <div className="tb-btn-more-wrap" style={{ position: "relative" }}>
                        <button
                            className={`tb-btn tb-btn-more${showMore ? " tb-btn-active" : ""}`}
                            onClick={() => { setShowMore(p => !p); setShowPeople(false); setShowShare(false); setShowCode(false); setShowAudioMonitor(false); }}
                            title="More"
                            aria-label="More options"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                            </svg>
                        </button>
                        {showMore && (
                            <div style={{ ...S.dropdown, right: 0, minWidth: 200, padding: 6 }} onClick={e => e.stopPropagation()}>
                                <button onClick={() => { setShowMore(false); setShowAudioMonitor(true); }}
                                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", background: "transparent", border: "none", color: "#E8EAED", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, textAlign: "left" }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#2A2A2A"}
                                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                                    </svg>
                                    Audio Monitor
                                </button>
                                <button onClick={() => { setShowMore(false); setShowShare(true); }}
                                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", background: "transparent", border: "none", color: "#E8EAED", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, textAlign: "left" }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#2A2A2A"}
                                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                                    </svg>
                                    Share Invite
                                </button>
                                {joinCode && (
                                    <button onClick={() => { setShowMore(false); setShowCode(true); }}
                                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", background: "transparent", border: "none", color: "#E8EAED", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, textAlign: "left" }}
                                        onMouseEnter={e => e.currentTarget.style.background = "#2A2A2A"}
                                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                        <LockIcon />
                                        Meeting Code
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* End / Leave */}
                {isHost
                    ? <button onClick={onEnd} className="tb-end-btn"><span className="tb-end-full">End for All</span><span className="tb-end-short">End</span></button>
                    : <button onClick={onLeave} className="tb-leave-btn">Leave</button>
                }
            </div>
        </div>
    );
}


// ── Lobby screen — sits inside CoworkingShell (no fixed positioning) ──────────
function LobbyScreen({ meet, info, isHost, isInvited, busy, error, setError, employeeName, employeeId, ownPicUrl, onStart, onDirectJoin, onJoinByCode, onBack }) {
    const [codeInput, setCodeInput] = useState("");
    const [joining, setJoining] = useState(false);
    const [showShare, setShowShare] = useState(false);

    // Merged camera/mic state
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [stream, setStream] = useState(null);
    const [camErr, setCamErr] = useState(false);
    const videoRef = useRef(null);

    const isLive = info?.live;
    // isHost = role is ceo/tl (used for record/join-code/invite — any CEO/TL, by design).
    // isActualHost = this employee is ALSO the creator of THIS specific meeting.
    // Only isActualHost may start it / skip the "waiting for host" gate.
    const isActualHost = isHost && meet?.createdBy === employeeId;

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

    const stopStream = () => stream?.getTracks().forEach(t => t.stop());
    const choices = { videoEnabled: camOn, audioEnabled: micOn };

    const handleStart = async () => { stopStream(); await onStart(choices); };
    const handleDirectJoin = async () => { stopStream(); await onDirectJoin(choices); };
    const handleCodeJoin = async () => {
        const code = codeInput.trim().replace(/\D/g, "");
        if (code.length !== 6) { setError("Enter a valid 6-digit code."); return; }
        setJoining(true); stopStream();
        await onJoinByCode(code, choices);
        setJoining(false);
    };

    return (
        <>
            <style>{`
                @keyframes lob-fade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
                .lob-page { min-height:100vh; background:#F3F4F6; display:flex; flex-direction:column; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
                .lob-topbar { height:52px; background:#fff; border-bottom:1px solid #E5E7EB; padding:0 20px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
                .lob-body { flex:1; display:flex; min-height:0; animation:lob-fade 0.25s ease; }
                .lob-left { width:420px; flex-shrink:0; background:#fff; border-right:1px solid #E5E7EB; padding:36px 36px 28px; display:flex; flex-direction:column; gap:20px; overflow-y:auto; }
                .lob-right { flex:1; background:#1C1C1E; display:flex; align-items:center; justify-content:center; padding:32px; flex-direction:column; gap:14px; }
                .lob-section-label { font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#6B7280; padding-bottom:6px; border-bottom:1px solid #F3F4F6; }
                .lob-chip { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; background:#F9FAFB; border:1px solid #E5E7EB; border-radius:6px; font-size:11.5px; color:#6B7280; }
                .lob-live-banner { display:flex; align-items:center; gap:10px; padding:10px 14px; background:#F0FDF4; border:1px solid #BBF7D0; border-radius:8px; font-size:13px; font-weight:500; color:#166534; }
                .lob-wait-banner { padding:10px 14px; background:#FFFBEB; border:1px solid #FDE68A; border-radius:8px; font-size:13px; color:#92400E; }
                .lob-err-banner  { padding:10px 14px; background:#FEF2F2; border:1px solid #FECACA; border-radius:8px; font-size:13px; color:#991B1B; }
                .lob-live-dot { width:8px; height:8px; border-radius:50%; background:#22C55E; flex-shrink:0; box-shadow:0 0 0 3px rgba(34,197,94,0.2); }
                .lob-live-code { margin-left:auto; font-family:"SF Mono",monospace; font-size:18px; font-weight:700; letter-spacing:5px; color:#166534; }
                .lob-btn-primary { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:11px 0; background:#2563EB; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; font-family:inherit; transition:background 0.15s; }
                .lob-btn-primary:hover:not(:disabled) { background:#1D4ED8; }
                .lob-btn-primary:disabled { opacity:0.45; cursor:not-allowed; }
                .lob-btn-outline { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:10px 0; background:#fff; color:#374151; border:1px solid #D1D5DB; border-radius:8px; font-size:14px; font-weight:500; cursor:pointer; font-family:inherit; transition:background 0.15s; }
                .lob-btn-outline:hover { background:#F9FAFB; }
                .lob-code-row { display:flex; gap:8px; align-items:stretch; }
                .lob-code-input { flex:1; padding:10px 8px; border:1px solid #D1D5DB; border-radius:8px; font-size:22px; font-family:"SF Mono",monospace; font-weight:700; text-align:center; letter-spacing:8px; color:#111827; outline:none; background:#F9FAFB; min-width:0; transition:border-color 0.15s; }
                .lob-code-input:focus { border-color:#2563EB; box-shadow:0 0 0 3px rgba(37,99,235,0.12); }
                .lob-code-join { padding:0 18px; background:#2563EB; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; font-family:inherit; transition:background 0.15s; }
                .lob-code-join:hover:not(:disabled) { background:#1D4ED8; }
                .lob-code-join:disabled { opacity:0.4; cursor:not-allowed; }
                .lob-dev-row { display:flex; align-items:center; gap:12px; padding:10px 12px; background:#F9FAFB; border:1px solid #E5E7EB; border-radius:8px; cursor:pointer; transition:background 0.12s; user-select:none; }
                .lob-dev-row:hover { background:#F3F4F6; }
                .lob-dev-icon { width:32px; height:32px; background:#fff; border:1px solid #E5E7EB; border-radius:7px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
                .lob-toggle { width:36px; height:20px; border-radius:99px; position:relative; transition:background 0.18s; flex-shrink:0; }
                .lob-toggle-knob { position:absolute; top:2px; width:16px; height:16px; border-radius:50%; background:#fff; transition:transform 0.18s; box-shadow:0 1px 3px rgba(0,0,0,0.2); }
                .lob-cam-box { width:100%; max-width:520px; aspect-ratio:16/9; background:#111; border-radius:12px; overflow:hidden; position:relative; box-shadow:0 4px 24px rgba(0,0,0,0.4); }
                .lob-cam-controls { position:absolute; bottom:14px; left:50%; transform:translateX(-50%); display:flex; gap:12px; z-index:2; }
                .lob-cam-btn { width:44px; height:44px; border-radius:50%; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background 0.15s; backdrop-filter:blur(8px); }
                @media (max-width:1024px) and (min-width:769px) {
                    .lob-left { width:360px; padding:28px 28px 22px; gap:16px; }
                    .lob-right { padding:24px; }
                }
                @media (max-width:768px) {
                    .lob-topbar { padding:0 14px; height:48px; }
                    .lob-body { flex-direction:column-reverse; }
                    .lob-left { width:100%; border-right:none; border-top:1px solid #E5E7EB; padding:20px 16px 24px; gap:14px; }
                    .lob-right { padding:20px 16px; min-height:220px; }
                    .lob-cam-box { max-width:100%; }
                }
            `}</style>

            <div className="lob-page">
                {/* Topbar */}
                <div className="lob-topbar">
                    <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#6B7280", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "5px 8px", borderRadius: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                        Back to Meetings
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 28, height: 28, background: "#2563EB", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>CoWork Meetings</span>
                    </div>
                </div>

                <div className="lob-body">
                    {/* LEFT */}
                    <div className="lob-left">
                        <div>
                            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6B7280", marginBottom: 8 }}>
                                {isLive ? "Live Meeting" : "Upcoming Meeting"}
                            </p>
                            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 10px", lineHeight: 1.3 }}>{meet?.title || "Meeting"}</h1>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {meet?.dateTime && (
                                    <span className="lob-chip">
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                        {new Date(meet.dateTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                                    </span>
                                )}
                                <span className="lob-chip">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
                                    {meet?.participants?.length || 0} invited
                                </span>
                                {meet?.meetId && <span className="lob-chip" style={{ fontFamily: "monospace", color: "#9CA3AF" }}>{meet.meetId}</span>}
                            </div>
                        </div>

                        {isLive && (
                            <div className="lob-live-banner">
                                <span className="lob-live-dot" />
                                Meeting in progress
                                {isHost && info?.participantCount >= 0 && <span style={{ color: "#166534", fontSize: 12 }}>· {info.participantCount} participant{info.participantCount !== 1 ? "s" : ""}</span>}
                                {isHost && info?.joinCode && <span className="lob-live-code">{info.joinCode}</span>}
                            </div>
                        )}
                        {!isLive && !isActualHost && <div className="lob-wait-banner">Waiting for host to start the meeting</div>}
                        {error && <div className="lob-err-banner">{error}</div>}

                        <div style={{ borderTop: "1px solid #F3F4F6" }} />

                        <div>
                            <p className="lob-section-label">Audio &amp; Video</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                                <div className="lob-dev-row" onClick={() => setMicOn(v => !v)}>
                                    <div className="lob-dev-icon">
                                        {micOn
                                            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /><path d="M17 16.95A7 7 0 015 12v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                        }
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Microphone</div>
                                        <div style={{ fontSize: 11, color: micOn ? "#2563EB" : "#DC2626", marginTop: 1 }}>{micOn ? "On" : "Off"}</div>
                                    </div>
                                    <div className="lob-toggle" style={{ background: micOn ? "#2563EB" : "#D1D5DB" }}>
                                        <div className="lob-toggle-knob" style={{ transform: micOn ? "translateX(16px)" : "translateX(2px)" }} />
                                    </div>
                                </div>
                                <div className="lob-dev-row" onClick={() => setCamOn(v => !v)}>
                                    <div className="lob-dev-icon">
                                        {camOn && !camErr
                                            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                                            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"><path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                        }
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Camera</div>
                                        <div style={{ fontSize: 11, color: (camOn && !camErr) ? "#2563EB" : "#DC2626", marginTop: 1 }}>{camErr ? "Unavailable" : camOn ? "On" : "Off"}</div>
                                    </div>
                                    <div className="lob-toggle" style={{ background: (camOn && !camErr) ? "#2563EB" : "#D1D5DB" }}>
                                        <div className="lob-toggle-knob" style={{ transform: (camOn && !camErr) ? "translateX(16px)" : "translateX(2px)" }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ borderTop: "1px solid #F3F4F6" }} />

                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <p className="lob-section-label">{isActualHost ? "Host Controls" : isInvited ? "Join Meeting" : "Enter Code"}</p>
                            {isActualHost ? (
                                <>
                                    <button className="lob-btn-primary" onClick={handleStart} disabled={busy}>
                                        {busy ? "Connecting…" : isLive ? "Rejoin Meeting" : "Start Meeting"}
                                    </button>
                                    {isLive && <button className="lob-btn-outline" onClick={() => setShowShare(true)}>Share Invite</button>}
                                </>
                            ) : isInvited ? (
                                <>
                                    <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>You are on the participant list.</p>
                                    <button className="lob-btn-primary" onClick={handleDirectJoin} disabled={busy || !isLive} style={{ opacity: (!isLive || busy) ? 0.45 : 1, cursor: !isLive ? "not-allowed" : "pointer" }}>
                                        {busy ? "Connecting…" : !isLive ? "Waiting for host…" : "Join Meeting"}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>Enter the 6-digit code from the host.</p>
                                    <div className="lob-code-row">
                                        <input className="lob-code-input" value={codeInput} onChange={e => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={e => e.key === "Enter" && handleCodeJoin()} placeholder="000000" maxLength={6} />
                                        <button className="lob-code-join" onClick={handleCodeJoin} disabled={joining || codeInput.length !== 6 || !isLive}>{joining ? "…" : "Join"}</button>
                                    </div>
                                </>
                            )}
                        </div>

                        <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: "auto", paddingTop: 4 }}>
                            Joining as <strong style={{ color: "#6B7280" }}>{employeeName}</strong>
                        </p>
                    </div>

                    {/* RIGHT: Camera */}
                    <div className="lob-right">
                        <div className="lob-cam-box">
                            {camOn && !camErr
                                ? <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
                                : (
                                    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                                        <div style={{ width: 72, height: 72, borderRadius: "50%", background: avColor(employeeName || "?"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, color: "#fff", overflow: "hidden" }}>
                                            {ownPicUrl ? <img src={ownPicUrl} alt={employeeName} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (employeeName || "?")[0].toUpperCase()}
                                        </div>
                                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{camErr ? "Camera unavailable" : "Camera is off"}</span>
                                    </div>
                                )
                            }
                            <div style={{ position: "absolute", top: 12, left: 12, zIndex: 2, fontSize: 12, fontWeight: 600, color: "#fff", background: "rgba(0,0,0,0.5)", padding: "3px 10px", borderRadius: 6, backdropFilter: "blur(4px)" }}>{employeeName || "You"}</div>
                            <div className="lob-cam-controls">
                                <button className="lob-cam-btn" onClick={() => setMicOn(v => !v)} style={{ background: micOn ? "rgba(255,255,255,0.15)" : "#DC2626" }}>
                                    {micOn
                                        ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                        : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /><path d="M17 16.95A7 7 0 015 12v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                    }
                                </button>
                                <button className="lob-cam-btn" onClick={() => setCamOn(v => !v)} style={{ background: (camOn && !camErr) ? "rgba(255,255,255,0.15)" : "#DC2626" }}>
                                    {camOn && !camErr
                                        ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                                        : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                    }
                                </button>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 16 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: micOn ? "#86EFAC" : "#FCA5A5" }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: micOn ? "#22C55E" : "#EF4444", display: "inline-block" }} />
                                {micOn ? "Mic on" : "Mic off"}
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: (camOn && !camErr) ? "#86EFAC" : "#FCA5A5" }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: (camOn && !camErr) ? "#22C55E" : "#EF4444", display: "inline-block" }} />
                                {camErr ? "Camera unavailable" : camOn ? "Camera on" : "Camera off"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {showShare && <ShareMeetingModal meet={meet} joinCode={info?.joinCode} senderId={employeeId} senderName={employeeName} onClose={() => setShowShare(false)} />}
        </>
    );
}

// ── PreJoin — sits inside CoworkingShell, Google Meet style ──────────────────
function PreJoin({ meetTitle, employeeName, ownPicUrl, isHost, onBack, onJoin }) {
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
                                        {ownPicUrl
                                            ? <img src={ownPicUrl} alt={employeeName} style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover" }} />
                                            : <div className="pj-cam-avatar" style={{ background: avColor(employeeName || "?") }}>
                                                {(employeeName || "?")[0].toUpperCase()}
                                            </div>
                                        }
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
                            <div className="pj-name-av" style={{ background: ownPicUrl ? "transparent" : avColor(employeeName || "?"), overflow: "hidden", padding: 0 }}>
                                {ownPicUrl
                                    ? <img src={ownPicUrl} alt={employeeName} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                                    : (employeeName || "?")[0].toUpperCase()
                                }
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
            @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }

            /* ── Base LiveKit overrides ── */
            .lk-video-conference { height:100% !important; width:100% !important; }
            [data-lk-theme="default"] {
                --lk-bg: #111317 !important;
                --lk-control-bar-bg: #1f2023 !important;
                --lk-border-radius: 12px !important;
            }

            /* ── Participant tiles — Google Meet style ── */
            .lk-participant-tile {
                background: #1e2126 !important;
                border-radius: 12px !important;
                overflow: hidden !important;
                border: 1.5px solid rgba(255,255,255,0.06) !important;
                transition: border-color 0.2s !important;
            }
            .lk-participant-tile:hover {
                border-color: rgba(255,255,255,0.14) !important;
            }

            /* Speaking indicator — blue glow ring */
            .lk-participant-tile[data-lk-speaking="true"] {
                border-color: #2563EB !important;
                box-shadow: 0 0 0 2px rgba(37,99,235,0.35) !important;
            }

            /* Grid gap */
            .lk-grid-layout, [class*="gridLayout"] {
                gap: 6px !important;
                padding: 10px !important;
                background: #111317 !important;
            }

            /* Focus / presenter layout */
            .lk-focus-layout, [class*="focusLayout"] {
                gap: 6px !important;
                background: #111317 !important;
                padding: 8px !important;
            }

            /* ── Avatar placeholder — hide default SVG silhouette ── */
            .lk-participant-placeholder svg,
            .lk-participant-tile .lk-participant-placeholder svg,
            [class*="participantPlaceholder"] svg,
            .lk-camera-disabled-indicator svg {
                display: none !important;
            }

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

            /* Coloured initials circle */
            .lk-participant-placeholder::before,
            [class*="participantPlaceholder"]::before {
                content: attr(data-lk-participant-name);
                width: 96px;
                height: 96px;
                border-radius: 50%;
                background: var(--lk-av-color, #2563EB);
                color: #fff;
                font-size: 34px;
                font-weight: 700;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                letter-spacing: 0.02em;
                box-shadow: 0 4px 24px rgba(0,0,0,0.4);
                text-transform: uppercase;
            }

            @media (max-width:600px) {
                .lk-participant-placeholder::before,
                [class*="participantPlaceholder"]::before {
                    width: 64px; height: 64px; font-size: 24px;
                }
            }

            /* ── Name plate ── */
            .lk-participant-metadata {
                background: linear-gradient(transparent, rgba(0,0,0,0.7)) !important;
                padding: 20px 10px 8px !important;
                bottom: 0 !important;
            }
            .lk-participant-name, [class*="participantName"] {
                font-size: 13px !important;
                font-weight: 600 !important;
                color: #fff !important;
                letter-spacing: 0.01em !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            }

            /* ── Mic muted indicator ── */
            .lk-participant-metadata-item svg {
                color: #EF4444 !important;
            }

            /* ── Control bar (bottom) ── */
            .lk-control-bar {
                background: #1a1d21 !important;
                border-top: 1px solid rgba(255,255,255,0.08) !important;
                padding: 10px 16px !important;
                gap: 8px !important;
            }
            .lk-button {
                background: #2a2d31 !important;
                border: 1px solid rgba(255,255,255,0.1) !important;
                border-radius: 10px !important;
                color: #E8EAED !important;
                font-size: 13px !important;
                font-weight: 600 !important;
                padding: 8px 16px !important;
                gap: 6px !important;
                transition: background 0.15s !important;
            }
            .lk-button:hover:not(:disabled) {
                background: #3c4043 !important;
            }
            /* Muted / disabled state */
            .lk-button[aria-pressed="true"],
            .lk-button[data-lk-active="true"] {
                background: #3a1f1f !important;
                border-color: #EF4444 !important;
                color: #EF4444 !important;
            }
            /* Leave / End button from control bar */
            .lk-disconnect-button {
                background: #DC2626 !important;
                border-color: #DC2626 !important;
                color: #fff !important;
            }
            .lk-disconnect-button:hover {
                background: #B91C1C !important;
            }

            /* ── TopBar responsive ── */
            .tb-root {
                height: 52px; display: flex; align-items: center;
                justify-content: space-between; padding: 0 16px;
                background: #1a1d21; border-bottom: 1px solid rgba(255,255,255,0.08);
                flex-shrink: 0; z-index: 10; gap: 8px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .tb-left  { display:flex; align-items:center; gap:8px; min-width:0; flex:1 1 0%; overflow:hidden; }
            .tb-right { display:flex; align-items:center; gap:5px; flex-shrink:0; position:relative; }
            .tb-meet-name { font-size:13px; font-weight:500; color:#E8EAED; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; flex:1 1 auto; max-width:280px; }
            .tb-elapsed { font-size:11px; color:#9AA0A6; font-family:monospace; flex-shrink:0; background:rgba(255,255,255,0.08); padding:2px 8px; border-radius:99px; }
            .tb-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 12px; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#BDC1C6; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:all 0.12s; white-space:nowrap; flex-shrink:0; }
            .tb-btn:hover { background:rgba(255,255,255,0.12); }
            .tb-btn-active { background:rgba(37,99,235,0.25) !important; color:#93C5FD !important; border-color:rgba(37,99,235,0.5) !important; }
            .tb-btn-label { /* shown on desktop */ }
            .tb-end-btn { display:inline-flex; align-items:center; gap:5px; padding:7px 16px; background:#DC2626; border:none; border-radius:8px; color:#fff; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; white-space:nowrap; flex-shrink:0; transition:background 0.15s; }
            .tb-end-btn:hover { background:#B91C1C; }
            .tb-leave-btn { display:inline-flex; align-items:center; gap:5px; padding:7px 16px; background:transparent; border:1.5px solid #DC2626; border-radius:8px; color:#EF4444; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; white-space:nowrap; flex-shrink:0; transition:all 0.15s; }
            .tb-leave-btn:hover { background:rgba(220,38,38,0.12); }
            .tb-back-label { /* "Back" word */ }
            .tb-end-full { display:inline; }
            .tb-end-short { display:none; }
            .tb-btn-extra { display:inline-block; }
            .tb-btn-more-wrap { display:none; }
            .tb-btn-more { padding:6px 10px !important; }

            @media (max-width:900px) {
                .tb-btn-label { display:none; }
                .tb-btn { padding:6px 10px; gap:0; }
                .tb-meet-name { max-width:200px; }
            }
            @media (max-width:600px) {
                .tb-root  { padding:0 8px; gap:5px; height:48px; }
                .tb-elapsed { display:none; }
                .tb-meet-name { font-size:12px; max-width:none; }
                .tb-end-btn   { padding:7px 11px; font-size:12px; }
                .tb-leave-btn { padding:7px 11px; font-size:12px; }
                .tb-left { flex:1 1 0%; min-width:0; }
                .tb-btn-extra { display:none !important; }
                .tb-btn-more-wrap { display:inline-block; }
            }
            @media (max-width:420px) {
                .tb-root  { padding:0 6px; gap:4px; }
                .tb-back-label { display:none; }
                .tb-btn { padding:6px 8px; }
                .tb-end-btn   { padding:6px 10px; font-size:11px; gap:0; }
                .tb-leave-btn { padding:6px 10px; font-size:11px; gap:0; }
                .tb-end-full { display:none; }
                .tb-end-short { display:inline; }
                .tb-meet-name { font-size:11.5px; }
            }
        `}</style>
    );
}


// ── Room styles (dark, professional) ─────────────────────────────────────────
const S = {
    roomRoot: { position: "fixed", inset: 0, zIndex: 9999, background: "#111317", display: "flex", flexDirection: "column", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" },
    lkRoom: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 },
    livePill: { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", background: "#DC2626", borderRadius: 99, fontSize: 10, fontWeight: 800, color: "#fff", letterSpacing: "0.05em", flexShrink: 0 },
    liveDot: { width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.9)", display: "inline-block", animation: "pulse 1.5s ease infinite" },
    dropdown: { position: "absolute", top: 52, right: 0, background: "#1f2023", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "16px", boxShadow: "0 16px 48px rgba(0,0,0,0.7)", zIndex: 300, minWidth: 260 },
    personRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)", marginBottom: 5 },
    personAvatar: { width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 },
    codeBig: { fontFamily: "monospace", fontSize: 32, fontWeight: 800, color: "#E8EAED", letterSpacing: 10, textAlign: "center", padding: "14px 0", background: "#2a2d31", borderRadius: 10, marginBottom: 12 },
    copyBtn: { width: "100%", padding: "9px 0", background: "#2563EB", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s" },
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
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }} onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, boxShadow: "0 8px 40px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", maxHeight: "88vh", overflow: "hidden" }}>

                {/* Header */}
                <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Share Meeting Invite</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{meet?.title} · {meet?.meetId}</div>
                    </div>
                    <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", fontSize: 14 }}>✕</button>
                </div>

                {/* Meeting info strip */}
                <div style={{ margin: "14px 20px 0", padding: "12px 14px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, background: "#2563EB", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meet?.title}</div>
                            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1, display: "flex", gap: 10 }}>
                                {meet?.dateTime && <span>{new Date(meet.dateTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>}
                                <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#374151" }}>Code: {joinCode || meet?.meetId}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Search */}
                <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…"
                        style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: "#111827" }}
                        onFocus={e => e.target.style.borderColor = "#2563EB"}
                        onBlur={e => e.target.style.borderColor = "#D1D5DB"}
                    />
                </div>

                {/* Select controls */}
                <div style={{ padding: "8px 20px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: "#6B7280" }}>{selected.size} selected</span>
                    <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={selectAll} style={{ fontSize: 11, fontWeight: 600, color: "#2563EB", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Select all</button>
                        <button onClick={clearAll} style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Clear</button>
                    </div>
                </div>

                {/* Employee list */}
                <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 12px", scrollbarWidth: "none" }}>
                    {filtered.map(emp => {
                        const isSel = selected.has(emp.employeeId);
                        const color = AVATAR_COLORS[(emp.name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];
                        return (
                            <div key={emp.employeeId} onClick={() => toggle(emp.employeeId)}
                                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, cursor: "pointer", background: isSel ? "#EFF6FF" : "transparent", marginBottom: 2, border: `1px solid ${isSel ? "#BFDBFE" : "transparent"}`, transition: "all 0.1s" }}>
                                {/* Checkbox */}
                                <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${isSel ? "#2563EB" : "#D1D5DB"}`, background: isSel ? "#2563EB" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.1s" }}>
                                    {isSel && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                </div>
                                {/* Avatar */}
                                {emp.profilePicUrl
                                    ? <img src={emp.profilePicUrl} alt={emp.name} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                                    : <div style={{ width: 32, height: 32, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                                        {initials(emp.name || "?")}
                                    </div>
                                }
                                {/* Name */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", display: "flex", alignItems: "center", gap: 6 }}>
                                        {emp.name}
                                        {emp.role === "tl" && <span style={{ fontSize: 9, fontWeight: 700, background: "#F0FDF4", color: "#166534", border: "1px solid #BBF7D0", borderRadius: 4, padding: "1px 5px" }}>TL</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>{emp.department || emp.role}</div>
                                </div>
                            </div>
                        );
                    })}
                    {filtered.length === 0 && <div style={{ textAlign: "center", padding: "20px 0", color: "#9CA3AF", fontSize: 13 }}>No employees found</div>}
                </div>

                {/* Footer */}
                <div style={{ padding: "12px 20px 16px", borderTop: "1px solid #E5E7EB", display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={onClose} style={{ flex: 1, padding: "9px 0", background: "#fff", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, fontWeight: 500, color: "#374151", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                    <button onClick={handleSend} disabled={sending || selected.size === 0 || sent}
                        style={{ flex: 2, padding: "9px 0", background: sent ? "#16A34A" : "#2563EB", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, color: "#fff", cursor: selected.size === 0 ? "not-allowed" : "pointer", opacity: selected.size === 0 ? 0.4 : 1, fontFamily: "inherit", transition: "background 0.15s" }}>
                        {sent ? "Sent" : sending ? "Sending…" : `Send to ${selected.size} employee${selected.size !== 1 ? "s" : ""}`}
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