"use client";
/**
 * DMCallManager.jsx
 * Manages OUTGOING call lifecycle for DM pages.
 * Token flow: socket call_request → server creates room + generates token
 *             → server emits call_token_ready back → we connect to LiveKit
 * No blind HTTP fetches mid-call.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { getCoworkSocket } from "../../../lib/coworkSocket";
import DMCallScreen from "./DMCallScreen";

let livekitImport = null;
async function getLK() {
    if (!livekitImport) livekitImport = await import("livekit-client");
    return livekitImport;
}

const IDLE = "idle";
const OUTGOING = "outgoing";
const CONNECTED = "connected";
const ENDED = "ended";

// Global map so parent header button can trigger startCall
const callHandlers = new Map();
export function triggerCall(convId) { callHandlers.get(convId)?.(); }

export default function DMCallManager({ employeeId, employeeName, otherEmpId, otherName, convId, otherProfilePicUrl = null }) {
    const [callState, setCallState] = useState(IDLE);
    const [muted, setMuted] = useState(false);

    const callStateRef = useRef(IDLE);
    const setCS = (s) => { callStateRef.current = s; setCallState(s); };

    const roomRef = useRef(null);
    const endTimeoutRef = useRef(null);
    const ringtoneRef = useRef({});

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
            audio.play().catch(() => { });
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
        endTimeoutRef.current = setTimeout(() => setCS(IDLE), 2000);
    };

    const leaveRoom = () => {
        if (roomRef.current) {
            try { roomRef.current.disconnect(); } catch (_) { }
            roomRef.current = null;
        }
    };

    // ── Connect to LiveKit once we have the token ─────────────────────────────
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
            console.error("[DMCallManager] joinRoom:", err);
            flashEnded();
        }
    }, []); // eslint-disable-line

    useEffect(() => {
        if (!roomRef.current) return;
        try { roomRef.current.localParticipant.setMicrophoneEnabled(!muted); } catch (_) { }
    }, [muted]);

    // ── Socket listeners ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!employeeId) return;
        const socket = getCoworkSocket(employeeId);

        // Server generated our token — connect to LiveKit
        const onTokenReady = ({ token, url, convId: cid }) => {
            if (cid !== convId) return;
            if (callStateRef.current === OUTGOING) joinRoom({ token, url });
        };

        // Callee answered
        const onAnswered = ({ convId: cid }) => {
            if (cid !== convId) return;
            stopRingtone();
            // joinRoom is triggered by call_token_ready which server also fires after accept
        };

        // Callee rejected / missed
        const onRejected = ({ convId: cid }) => {
            if (cid !== convId) return;
            stopRingtone(); flashEnded();
        };

        // Other party ended
        const onEnded = ({ convId: cid }) => {
            if (cid !== convId) return;
            stopRingtone(); leaveRoom(); flashEnded();
        };

        const onError = ({ message }) => {
            console.error("[DMCallManager] call error:", message);
            stopRingtone(); flashEnded();
        };

        socket.on("call_token_ready", onTokenReady);
        socket.on("call_answered", onAnswered);
        socket.on("call_rejected", onRejected);
        socket.on("call_ended", onEnded);
        socket.on("call_error", onError);

        return () => {
            socket.off("call_token_ready", onTokenReady);
            socket.off("call_answered", onAnswered);
            socket.off("call_rejected", onRejected);
            socket.off("call_ended", onEnded);
            socket.off("call_error", onError);
        };
    }, [employeeId, convId, joinRoom]); // eslint-disable-line

    // Expose startCall for header button
    useEffect(() => {
        callHandlers.set(convId, startCall);
        return () => callHandlers.delete(convId);
    }); // run every render so startCall closure is fresh

    // Cleanup on unmount
    useEffect(() => () => {
        stopRingtone(); leaveRoom(); clearTimeout(endTimeoutRef.current);
    }, []); // eslint-disable-line

    // ── Start call ─────────────────────────────────────────────────────────────
    function startCall() {
        if (callStateRef.current !== IDLE) return;
        const socket = getCoworkSocket(employeeId);
        setCS(OUTGOING);
        playRingtone();
        // Server will create room + generate token, then emit call_token_ready + call_incoming
        socket.emit("call_request", {
            toEmployeeId: otherEmpId,
            fromEmployeeId: employeeId,
            fromName: employeeName,
            convId,
        });
    }

    // ── End call ───────────────────────────────────────────────────────────────
    function handleEnd() {
        stopRingtone(); leaveRoom();
        const socket = getCoworkSocket(employeeId);
        socket.emit("call_end", { toEmployeeId: otherEmpId, fromEmployeeId: employeeId, convId });
        flashEnded();
    }

    if (callState === IDLE) return null;

    return (
        <DMCallScreen
            call={{
                state: callState,
                otherName,
                profilePicUrl: otherProfilePicUrl,
                convId,
                _onMuteChange: (m) => { if (m !== muted) setMuted(m); },
            }}
            onAnswer={null}
            onReject={null}
            onEnd={handleEnd}
        />
    );
}