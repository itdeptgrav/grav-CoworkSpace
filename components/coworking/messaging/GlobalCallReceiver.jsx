"use client";
/**
 * GlobalCallReceiver.jsx
 * Mounted in CoworkingShell — receives incoming calls on ANY page.
 * Token flow: emit call_accept → server generates token
 *             → server emits call_token_ready back → connect to LiveKit
 * Uses ReactDOM.createPortal so it's NEVER clipped by shell CSS.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { getCoworkSocket } from "../../../lib/coworkSocket";
import DMCallScreen from "./DMCallScreen";
import { doc, getDoc } from "firebase/firestore";
import { firebaseDb } from "../../../lib/coworkFirebase";

let livekitImport = null;
async function getLK() {
    if (!livekitImport) livekitImport = await import("livekit-client");
    return livekitImport;
}

const IDLE = "idle";
const INCOMING = "incoming";
const CONNECTED = "connected";
const ENDED = "ended";

export default function GlobalCallReceiver({ employeeId, employeeName }) {
    const [callState, setCallState] = useState(IDLE);
    const [callerInfo, setCallerInfo] = useState(null);
    const [muted, setMuted] = useState(false);
    const [mounted, setMounted] = useState(false);

    const callStateRef = useRef(IDLE);
    const setCS = (s) => { callStateRef.current = s; setCallState(s); };

    const roomRef = useRef(null);
    const endTimeoutRef = useRef(null);
    const ringtoneRef = useRef({});

    useEffect(() => { setMounted(true); }, []);

    // ── Ringtone — real looping audio ─────────────────────────────────────────
    const playRingtone = () => {
        try {
            if (ringtoneRef.current.audio) {
                ringtoneRef.current.audio.pause();
                ringtoneRef.current.audio = null;
            }
            const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3");
            audio.loop = true;
            audio.volume = 1.0;
            audio.play().catch(() => {
                const resume = () => {
                    audio.play().catch(() => { });
                    document.removeEventListener("click", resume);
                    document.removeEventListener("touchstart", resume);
                };
                document.addEventListener("click", resume);
                document.addEventListener("touchstart", resume);
            });
            ringtoneRef.current.audio = audio;
        } catch (_) { }
    };
    const stopRingtone = () => {
        try {
            if (ringtoneRef.current.audio) {
                ringtoneRef.current.audio.pause();
                ringtoneRef.current.audio.currentTime = 0;
                ringtoneRef.current.audio = null;
            }
        } catch (_) { }
    };

    const flashEnded = () => {
        setCS(ENDED);
        clearTimeout(endTimeoutRef.current);
        endTimeoutRef.current = setTimeout(() => { setCS(IDLE); setCallerInfo(null); }, 2000);
    };

    const leaveRoom = () => {
        if (roomRef.current) {
            try { roomRef.current.disconnect(); } catch (_) { }
            roomRef.current = null;
        }
    };

    // ── Connect to LiveKit once token arrives ─────────────────────────────────
    const joinRoom = useCallback(async ({ token, url }) => {
        try {
            const LK = await getLK();
            const room = new LK.Room({ adaptiveStream: false, dynacast: false });
            roomRef.current = room;
            await room.connect(url, token);
            await room.localParticipant.setMicrophoneEnabled(true);
            setCS(CONNECTED);
            room.on(LK.RoomEvent.Disconnected, () => { leaveRoom(); flashEnded(); });
        } catch (err) {
            console.error("[GlobalCallReceiver] joinRoom:", err);
            flashEnded();
        }
    }, []); // eslint-disable-line

    useEffect(() => {
        if (!roomRef.current) return;
        try { roomRef.current.localParticipant.setMicrophoneEnabled(!muted); } catch (_) { }
    }, [muted]);

    // ── Socket — registered ONCE on mount ─────────────────────────────────────
    useEffect(() => {
        if (!employeeId) return;
        const socket = getCoworkSocket(employeeId);

        // ── CRITICAL: ensure this socket is in the employee's room ────────────
        // Re-emit join_cowork every time — handles server restarts where rooms are wiped
        socket.emit("join_cowork", employeeId);

        // Re-join room on every reconnect (server restart wipes all rooms)
        const onReconnect = () => {
            socket.emit("join_cowork", employeeId);
            console.log(`[GlobalCallReceiver] Rejoined room after reconnect: ${employeeId}`);
        };
        socket.on("connect", onReconnect);

        // Incoming call from another employee
        const onIncoming = ({ fromEmployeeId, fromName, convId, roomName }) => {
            // Already in a call — reject immediately
            if (callStateRef.current !== IDLE) {
                socket.emit("call_reject", { toEmployeeId: fromEmployeeId, fromEmployeeId: employeeId, convId });
                return;
            }
            // Show screen IMMEDIATELY
            setCallerInfo({ fromEmployeeId, fromName: fromName || fromEmployeeId, profilePicUrl: null, convId, roomName });
            setCS(INCOMING);
            playRingtone();

            // Fetch profile pic in background
            getDoc(doc(firebaseDb, "cowork_employees", fromEmployeeId))
                .then(snap => {
                    if (snap.exists() && callStateRef.current === INCOMING) {
                        setCallerInfo(prev => prev ? { ...prev, profilePicUrl: snap.data().profilePicUrl || null } : prev);
                    }
                })
                .catch(() => { });
        };

        // Server generated our token — connect to LiveKit
        const onTokenReady = ({ token, url, convId: cid }) => {
            if (!callerInfoRef.current) return;
            if (cid !== callerInfoRef.current.convId) return;
            if (callStateRef.current === INCOMING || callStateRef.current === CONNECTED) {
                joinRoom({ token, url });
            }
        };

        // Caller cancelled before we answered
        const onEnded = () => { stopRingtone(); leaveRoom(); flashEnded(); };

        socket.on("call_incoming", onIncoming);
        socket.on("call_token_ready", onTokenReady);
        socket.on("call_ended", onEnded);

        return () => {
            socket.off("connect", onReconnect);
            socket.off("call_incoming", onIncoming);
            socket.off("call_token_ready", onTokenReady);
            socket.off("call_ended", onEnded);
        };
    }, [employeeId, joinRoom]); // ← NOT callState — no stale closure

    // Keep callerInfo accessible inside socket listener via ref
    const callerInfoRef = useRef(null);
    useEffect(() => { callerInfoRef.current = callerInfo; }, [callerInfo]);

    useEffect(() => () => {
        stopRingtone(); leaveRoom(); clearTimeout(endTimeoutRef.current);
    }, []); // eslint-disable-line

    // ── Answer ─────────────────────────────────────────────────────────────────
    const handleAnswer = () => {
        stopRingtone();
        const socket = getCoworkSocket(employeeId);
        // Tell server we accepted — server generates callee token + notifies caller
        socket.emit("call_accept", {
            toEmployeeId: callerInfo.fromEmployeeId,
            fromEmployeeId: employeeId,
            fromName: employeeName,
            convId: callerInfo.convId,
        });
        // State moves to CONNECTED once call_token_ready arrives and joinRoom succeeds
        setCS(CONNECTED); // optimistic — shows "connecting..." until LiveKit connects
    };

    // ── Decline ────────────────────────────────────────────────────────────────
    const handleReject = () => {
        stopRingtone();
        const socket = getCoworkSocket(employeeId);
        socket.emit("call_reject", {
            toEmployeeId: callerInfo.fromEmployeeId,
            fromEmployeeId: employeeId,
            convId: callerInfo.convId,
        });
        setCS(IDLE);
        setCallerInfo(null);
    };

    // ── End (while connected) ──────────────────────────────────────────────────
    const handleEnd = () => {
        stopRingtone(); leaveRoom();
        const socket = getCoworkSocket(employeeId);
        socket.emit("call_end", {
            toEmployeeId: callerInfo?.fromEmployeeId,
            fromEmployeeId: employeeId,
            convId: callerInfo?.convId,
        });
        flashEnded();
    };

    if (!mounted || callState === IDLE || !callerInfo) return null;

    // Portal to document.body — bypasses all CSS stacking contexts
    return createPortal(
        <DMCallScreen
            call={{
                state: callState,
                otherName: callerInfo.fromName,
                profilePicUrl: callerInfo.profilePicUrl,
                convId: callerInfo.convId,
                _onMuteChange: (m) => { if (m !== muted) setMuted(m); },
            }}
            onAnswer={handleAnswer}
            onReject={handleReject}
            onEnd={callState === INCOMING ? handleReject : handleEnd}
        />,
        document.body
    );
}