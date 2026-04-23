"use client";
/**
 * hooks/useMeetingRecording.js
 *
 * BEHAVIOR:
 *   - CEO/TL clicks Record → everyone in meeting starts recording
 *   - CEO/TL clicks Stop  → everyone stops → each person's audio uploads to Drive
 *   - Format: {employeeId}_{Name}_audio_{meetId}.webm  (e.g. E015_Rakesh_audio_M002.webm)
 *
 * EDGE CASES (handled):
 *   - Late joiner: server notifies them immediately via activeMeetingRecordings map.
 *     v2 FIX — listeners now registered BEFORE the join_meeting_room emit so
 *     the server's immediate "recording_started" reply can't be missed.
 *   - Net drop: chunks kept in memory, retried on next flush
 *   - Page close during recording: beacon saves last chunk + keepalive finalize
 *   - Rejoin after disconnect: session key detects rejoin, (1) suffix added to filename
 *   - Person muted: audio chunks skipped (isMuted check + MediaRecorder pause)
 *   - Double finalize: isFinalizedRef guard prevents duplicate uploads
 *   - getUserMedia transient failure: up to 5 retries with backoff (by hook or crook)
 *   - Speech intervals: every unmute→mute transition logged as {startMs, endMs, durationMs}
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { firebaseAuth } from "../lib/coworkFirebase";
import { getCoworkSocket } from "../lib/coworkSocket";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const CHUNK_MS = 30_000;
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 5_000;
const START_RETRY_LIMIT = 5;       // getUserMedia retries
const START_RETRY_DELAY_MS = 3_000;

// ── MIME type ─────────────────────────────────────────────────────────────────
function getSupportedMimeType() {
    const types = [
        "audio/webm;codecs=opus", "audio/webm",
        "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg",
    ];
    for (const t of types) {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
    }
    return "audio/webm";
}

// ── Auth token cache ──────────────────────────────────────────────────────────
let cachedToken = null;
let tokenRefreshAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000;
async function getAuthToken() {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error("Not authenticated");
    if (!cachedToken || Date.now() > tokenRefreshAt) {
        cachedToken = await user.getIdToken(true);
        tokenRefreshAt = Date.now() + TOKEN_TTL_MS;
    }
    return cachedToken;
}
async function warmTokenCache() { try { await getAuthToken(); } catch (_) { } }

// ── Session persistence ───────────────────────────────────────────────────────
function sessionKey(meetId, empId) { return `rec_${meetId}_${empId}`; }
function saveSession(meetId, empId, mimeType) {
    try { localStorage.setItem(sessionKey(meetId, empId), JSON.stringify({ meetId, empId, mimeType, startedAt: Date.now() })); } catch (_) { }
}
function getSession(meetId, empId) {
    try {
        const raw = localStorage.getItem(sessionKey(meetId, empId));
        if (!raw) return null;
        const s = JSON.parse(raw);
        if (Date.now() - s.startedAt > 4 * 60 * 60 * 1000) { localStorage.removeItem(sessionKey(meetId, empId)); return null; }
        return s;
    } catch (_) { return null; }
}
function clearSession(meetId, empId) { try { localStorage.removeItem(sessionKey(meetId, empId)); } catch (_) { } }

// ── Upload chunk with retry ───────────────────────────────────────────────────
async function uploadChunkWithRetry({ blob, meetId, chunkIndex, mimeType }) {
    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
        try {
            const token = await getAuthToken();
            const fd = new FormData();
            fd.append("chunk", blob, `chunk_${chunkIndex}.bin`);
            fd.append("meetId", meetId);
            fd.append("chunkIndex", String(chunkIndex));
            fd.append("mimeType", mimeType);
            const res = await fetch(`${BASE}/cowork/audio/chunk`, {
                method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
            });
            if (res.ok) return true;
            console.warn(`[AudioChunk] HTTP error attempt ${attempt}`);
        } catch (e) {
            console.warn(`[AudioChunk] Network error attempt ${attempt}/${RETRY_LIMIT}:`, e.message);
        }
        if (attempt < RETRY_LIMIT) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
    return false;
}

// ── Beacon chunk (page unload) ────────────────────────────────────────────────
function sendBeaconChunk({ blob, meetId, chunkIndex, mimeType, token }) {
    try {
        const fd = new FormData();
        fd.append("chunk", blob, "chunk_emergency.bin");
        fd.append("meetId", meetId);
        fd.append("chunkIndex", String(chunkIndex));
        fd.append("mimeType", mimeType);
        fd.append("token", token);
        fd.append("emergency", "true");
        return navigator.sendBeacon(`${BASE}/cowork/audio/beacon-chunk`, fd);
    } catch (e) { console.error("[BeaconChunk]:", e.message); return false; }
}

function sendKeepaliveFinalize({ meetId, firstName, mimeType, token, isRejoin }) {
    try {
        fetch(`${BASE}/cowork/audio/finalize`, {
            method: "POST", keepalive: true,
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ meetId, firstName, mimeType, isRejoin }),
        }).catch(() => { });
    } catch (_) { }
}

// ── Normal finalize ───────────────────────────────────────────────────────────
async function finalizeRecording({ meetId, firstName, mimeType, isRejoin, speechIntervals }) {
    const token = await getAuthToken();
    const res = await fetch(`${BASE}/cowork/audio/finalize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ meetId, firstName, mimeType, isRejoin, speechIntervals: speechIntervals || [] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Finalize failed");
    return data;
}

// ═══════════════════════════════════════════════════════════════════════════════
export function useMeetingRecording({ meetId, employeeId, firstName, isHost }) {

    const [isRecording, setIsRecording] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadDone, setUploadDone] = useState(false);
    const [uploadError, setUploadError] = useState("");
    const [uploadResult, setUploadResult] = useState(null);

    const mediaRecorderRef = useRef(null);
    const pendingChunksRef = useRef([]);
    const bufferedChunksRef = useRef([]);
    const chunkIndexRef = useRef(0);
    const mimeTypeRef = useRef("");
    const isRecordingRef = useRef(false);
    const isMutedRef = useRef(false);
    const chunkTimerRef = useRef(null);
    const isRejoinRef = useRef(false);
    const isFinalizedRef = useRef(false);
    const meetIdRef = useRef(meetId);
    const firstNameRef = useRef(firstName);
    const employeeIdRef = useRef(employeeId);

    // Speech intervals — every unmute→mute transition is logged
    const speechIntervalsRef = useRef([]);       // [{ startMs, endMs, durationMs }]
    const currentSpeechStartRef = useRef(null);  // ms timestamp when unmute began

    meetIdRef.current = meetId;
    firstNameRef.current = firstName;
    employeeIdRef.current = employeeId;

    // ── setMuted ──────────────────────────────────────────────────────────────
    const prevMutedRef = useRef(null);

    const setMuted = useCallback((muted) => {
        isMutedRef.current = muted;

        if (prevMutedRef.current === muted) return;
        prevMutedRef.current = muted;

        // Speech interval tracking — runs whether or not recorder is ready yet
        if (!muted) {
            currentSpeechStartRef.current = Date.now();
        } else if (muted && currentSpeechStartRef.current) {
            const startMs = currentSpeechStartRef.current;
            const endMs = Date.now();
            const durationMs = endMs - startMs;
            if (durationMs >= 250) {
                speechIntervalsRef.current.push({ startMs, endMs, durationMs });
                console.log(`[Recording] 🗣️ Speech: ${(durationMs / 1000).toFixed(1)}s`);
            }
            currentSpeechStartRef.current = null;
        }

        const recorder = mediaRecorderRef.current;
        if (!recorder) return;

        if (muted && recorder.state === "recording") {
            try {
                recorder.pause();
                console.log("[Recording] ⏸ Mic muted — MediaRecorder paused");
            } catch (e) {
                console.warn("[Recording] pause() not supported, using chunk discard fallback");
            }
        } else if (!muted && recorder.state === "paused") {
            try {
                recorder.resume();
                console.log("[Recording] ▶️  Mic unmuted — MediaRecorder resumed");
            } catch (e) {
                console.warn("[Recording] resume() not supported");
            }
        }
    }, []);

    // ── Flush chunks to server ────────────────────────────────────────────────
    const flushChunks = useCallback(async () => {
        const toSend = [...pendingChunksRef.current, ...bufferedChunksRef.current];
        bufferedChunksRef.current = [];
        pendingChunksRef.current = [];
        if (toSend.length === 0) return;

        const combined = new Blob(toSend, { type: mimeTypeRef.current });
        if (combined.size < 100) return;

        const idx = chunkIndexRef.current++;
        const ok = await uploadChunkWithRetry({
            blob: combined, meetId: meetIdRef.current,
            chunkIndex: idx, mimeType: mimeTypeRef.current,
        });

        if (!ok) {
            pendingChunksRef.current.push(combined);
            chunkIndexRef.current--;
        }
    }, []);

    const startChunkTimer = useCallback(() => {
        if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
        chunkTimerRef.current = setInterval(flushChunks, CHUNK_MS);
    }, [flushChunks]);

    const stopChunkTimer = useCallback(() => {
        if (chunkTimerRef.current) { clearInterval(chunkTimerRef.current); chunkTimerRef.current = null; }
    }, []);

    // ── Start recording (with retry — by hook or crook) ──────────────────────
    const startRecording = useCallback(async (rejoin = false, attempt = 1) => {
        if (isRecordingRef.current) return;
        if (typeof window === "undefined") return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            const mimeType = getSupportedMimeType();
            mimeTypeRef.current = mimeType;
            isRecordingRef.current = true;
            isRejoinRef.current = rejoin;
            isFinalizedRef.current = false;
            chunkIndexRef.current = 0;
            bufferedChunksRef.current = [];
            pendingChunksRef.current = [];
            speechIntervalsRef.current = [];
            currentSpeechStartRef.current = isMutedRef.current ? null : Date.now();

            const recorder = new MediaRecorder(stream, { mimeType });
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0 && !isMutedRef.current) {
                    bufferedChunksRef.current.push(e.data);
                }
            };
            recorder.onerror = (e) => console.error("[MediaRecorder] Error:", e.error);
            recorder.start(1000);
            if (isMutedRef.current) {
                try { recorder.pause(); } catch (_) { }
            }

            mediaRecorderRef.current = recorder;
            setIsRecording(true);
            setUploadDone(false);
            setUploadError("");
            setUploadResult(null);
            startChunkTimer();
            saveSession(meetIdRef.current, employeeIdRef.current, mimeType);
            warmTokenCache();
            console.log(`[Recording] ✅ Started for ${employeeIdRef.current}${rejoin ? " (REJOIN)" : ""}`);
        } catch (e) {
            isRecordingRef.current = false;
            console.error(`[Recording] Could not start (attempt ${attempt}/${START_RETRY_LIMIT}):`, e.name, e.message);

            const permanent = e.name === "NotAllowedError" || e.name === "SecurityError" || e.name === "PermissionDeniedError";
            if (!permanent && attempt < START_RETRY_LIMIT) {
                console.log(`[Recording] Retrying in ${START_RETRY_DELAY_MS}ms…`);
                setTimeout(() => startRecording(rejoin, attempt + 1), START_RETRY_DELAY_MS);
                return;
            }

            setUploadError(permanent ? "Microphone access denied." : "Microphone unavailable after retries.");
        }
    }, [startChunkTimer]);

    // ── Stop and finalize ─────────────────────────────────────────────────────
    const stopRecording = useCallback(async () => {
        if (isFinalizedRef.current) return;
        isFinalizedRef.current = true;

        if (!isRecordingRef.current) return;

        isRecordingRef.current = false;
        setIsRecording(false);
        stopChunkTimer();

        // Close any open speech interval
        if (currentSpeechStartRef.current) {
            const startMs = currentSpeechStartRef.current;
            const endMs = Date.now();
            const durationMs = endMs - startMs;
            if (durationMs >= 250) {
                speechIntervalsRef.current.push({ startMs, endMs, durationMs });
            }
            currentSpeechStartRef.current = null;
        }

        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
            if (recorder.state === "paused") {
                try { recorder.resume(); } catch (_) { }
            }
            recorder.stop();
            recorder.stream?.getTracks().forEach(t => t.stop());
        }
        mediaRecorderRef.current = null;

        await flushChunks();
        clearSession(meetIdRef.current, employeeIdRef.current);

        setIsUploading(true);
        try {
            const result = await finalizeRecording({
                meetId: meetIdRef.current,
                firstName: firstNameRef.current,
                mimeType: mimeTypeRef.current,
                isRejoin: isRejoinRef.current,
                speechIntervals: speechIntervalsRef.current,
            });
            setUploadResult(result);
            setUploadDone(true);
            console.log(`[Recording] ✅ Uploaded: ${result.fileName} (${speechIntervalsRef.current.length} speech intervals)`);
        } catch (e) {
            if (e.message?.includes("No audio") || e.message?.includes("skipped")) {
                setUploadDone(true);
            } else {
                console.error("[Recording] Finalize error:", e.message);
                setUploadError("Upload failed: " + e.message);
            }
        } finally {
            setIsUploading(false);
        }
    }, [stopChunkTimer, flushChunks]);

    // ── beforeunload warning ──────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if (!isRecordingRef.current) return;
            e.preventDefault();
            e.returnValue = "Recording active. Audio will be saved automatically.";
            return e.returnValue;
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, []);

    // ── pagehide: emergency save ──────────────────────────────────────────────
    useEffect(() => {
        const handler = () => {
            if (!isRecordingRef.current) return;
            isRecordingRef.current = false;
            stopChunkTimer();

            const recorder = mediaRecorderRef.current;
            if (recorder && recorder.state !== "inactive") {
                try { recorder.stop(); } catch (_) { }
            }

            const token = cachedToken;
            if (!token) return;

            const allBlobs = [...pendingChunksRef.current, ...bufferedChunksRef.current];
            if (allBlobs.length > 0 && mimeTypeRef.current) {
                const combined = new Blob(allBlobs, { type: mimeTypeRef.current });
                if (combined.size >= 100) {
                    sendBeaconChunk({
                        blob: combined, meetId: meetIdRef.current,
                        chunkIndex: chunkIndexRef.current,
                        mimeType: mimeTypeRef.current, token,
                    });
                }
            }

            sendKeepaliveFinalize({
                meetId: meetIdRef.current, firstName: firstNameRef.current,
                mimeType: mimeTypeRef.current, token, isRejoin: isRejoinRef.current,
            });
        };
        window.addEventListener("pagehide", handler);
        return () => window.removeEventListener("pagehide", handler);
    }, [stopChunkTimer]);

    // ── Rejoin detection ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!meetId || !employeeId) return;
        const session = getSession(meetId, employeeId);
        if (!session) return;
        console.log(`[Recording] 🔄 Rejoin detected for ${employeeId}`);
        const t = setTimeout(() => startRecording(true), 2500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meetId, employeeId]);

    // ── Socket: listen for start/stop signals ─────────────────────────────────
    // v2 FIX: listeners registered BEFORE emitting join_meeting_room so the
    // server's instant "recording_started" reply for late joiners can't be missed.
    useEffect(() => {
        if (!meetId || !employeeId) return;
        const socket = getCoworkSocket(employeeId);

        const onStarted = (data) => {
            console.log(`[Recording] ▶️  START from ${data?.startedByName}${data?.lateJoin ? " (late join)" : ""}`);
            startRecording(false);
        };
        const onStopped = (data) => {
            console.log(`[Recording] ⏹️  STOP from ${data?.stoppedByName}`);
            stopRecording();
        };

        // STEP 1 — register listeners FIRST
        socket.on("recording_started", onStarted);
        socket.on("recording_stopped", onStopped);

        // STEP 2 — now safe to emit (server may reply instantly for late joiners)
        socket.emit("join_meeting_room", meetId);

        // STEP 3 — retry join every 3s to handle slow auth / reconnects
        let retries = 0;
        const retryJoin = setInterval(() => {
            if (retries++ >= 5) { clearInterval(retryJoin); return; }
            socket.emit("join_meeting_room", meetId);
        }, 3000);

        return () => {
            clearInterval(retryJoin);
            socket.off("recording_started", onStarted);
            socket.off("recording_stopped", onStopped);
            socket.emit("leave_meeting_room", meetId);
        };
    }, [meetId, employeeId, startRecording, stopRecording]);

    // ── Cleanup on unmount ────────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            stopChunkTimer();
            const recorder = mediaRecorderRef.current;
            if (recorder && recorder.state !== "inactive") {
                try { recorder.stop(); recorder.stream?.getTracks().forEach(t => t.stop()); } catch (_) { }
            }
        };
    }, [stopChunkTimer]);

    // ── Host controls ─────────────────────────────────────────────────────────
    const hostStartRecording = useCallback(() => {
        if (!isHost || !meetId || !employeeId) return;
        const socket = getCoworkSocket(employeeId);
        socket.emit("recording_start", { meetId, startedBy: employeeId, startedByName: firstName });
        startRecording(false);
    }, [isHost, meetId, employeeId, firstName, startRecording]);

    const hostStopRecording = useCallback(() => {
        if (!isHost || !meetId || !employeeId) return;
        const socket = getCoworkSocket(employeeId);
        socket.emit("recording_stop", { meetId, stoppedBy: employeeId, stoppedByName: firstName });
        stopRecording();
    }, [isHost, meetId, employeeId, firstName, stopRecording]);

    return {
        isRecording, isUploading, uploadDone, uploadError, uploadResult,
        setMuted,
        hostStartRecording,
        hostStopRecording,
    };
}