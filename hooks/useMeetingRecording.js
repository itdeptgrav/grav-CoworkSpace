"use client";
/**
 * hooks/useMeetingRecording.js
 *
 * BEHAVIOR:
 *   - CEO/TL clicks Record → everyone in meeting starts recording
 *   - CEO/TL clicks Stop  → everyone stops → each person's audio uploads to Drive
 *   - Format: {employeeId}_{Name}_audio_{meetId}.webm  (e.g. E015_Rakesh_audio_M002.webm)
 *
 * EDGE CASES:
 *   - Late joiner: server notifies them immediately via activeMeetingRecordings map
 *   - Net drop: chunks kept in memory, retried on next flush
 *   - Page close during recording: beacon saves last chunk + keepalive finalize
 *   - Rejoin after disconnect: session key detects rejoin, (1) suffix added to filename
 *   - Person muted: audio chunks skipped (isMuted check in ondataavailable)
 *   - Double finalize: isFinalizedRef guard prevents duplicate uploads
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { firebaseAuth } from "../lib/coworkFirebase";
import { getCoworkSocket } from "../lib/coworkSocket";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const CHUNK_MS = 30_000;
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 5_000;

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
    return false; // failed — caller keeps blob
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
async function finalizeRecording({ meetId, firstName, mimeType, isRejoin }) {
    const token = await getAuthToken();
    const res = await fetch(`${BASE}/cowork/audio/finalize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ meetId, firstName, mimeType, isRejoin }),
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
    const pendingChunksRef = useRef([]);   // failed uploads — kept for retry
    const bufferedChunksRef = useRef([]);  // collected since last flush
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

    meetIdRef.current = meetId;
    firstNameRef.current = firstName;
    employeeIdRef.current = employeeId;

    // ── setMuted — called by MuteWatcher every 500ms ──────────────────────────
    const setMuted = useCallback((muted) => {
        isMutedRef.current = muted;
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
            // Keep in memory — will retry next flush
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

    // ── Start recording ───────────────────────────────────────────────────────
    const startRecording = useCallback(async (rejoin = false) => {
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

            const recorder = new MediaRecorder(stream, { mimeType });
            recorder.ondataavailable = (e) => {
                // Record audio regardless of mute state
                // (muted = LiveKit mutes the track, mic still captures silence)
                if (e.data && e.data.size > 0) {
                    bufferedChunksRef.current.push(e.data);
                }
            };
            recorder.onerror = (e) => console.error("[MediaRecorder] Error:", e.error);
            recorder.start(1000);

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
            console.error("[Recording] Could not start:", e.message);
            setUploadError("Microphone access denied.");
        }
    }, [startChunkTimer]);

    // ── Stop and finalize ─────────────────────────────────────────────────────
    const stopRecording = useCallback(async () => {
        if (isFinalizedRef.current) return;
        isFinalizedRef.current = true;

        if (!isRecordingRef.current) {
            // Was never recording (joined after stop, or mic denied)
            return;
        }

        isRecordingRef.current = false;
        setIsRecording(false);
        stopChunkTimer();

        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
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
            });
            setUploadResult(result);
            setUploadDone(true);
            console.log(`[Recording] ✅ Uploaded: ${result.fileName}`);
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

    // ── Socket: listen for CEO/TL start/stop signals ──────────────────────────
    useEffect(() => {
        if (!meetId || !employeeId) return;
        const socket = getCoworkSocket(employeeId);
        socket.emit("join_meeting_room", meetId);

        // Retry join to handle slow auth
        let retries = 0;
        const retryJoin = setInterval(() => {
            if (retries++ >= 5) { clearInterval(retryJoin); return; }
            socket.emit("join_meeting_room", meetId);
        }, 3000);

        const onStarted = (data) => {
            console.log(`[Recording] ▶️  START from ${data?.startedByName}${data?.lateJoin ? " (late join)" : ""}`);
            startRecording(false);
        };
        const onStopped = (data) => {
            console.log(`[Recording] ⏹️  STOP from ${data?.stoppedByName}`);
            stopRecording();
        };

        socket.on("recording_started", onStarted);
        socket.on("recording_stopped", onStopped);

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
        startRecording(false); // start self too
    }, [isHost, meetId, employeeId, firstName, startRecording]);

    const hostStopRecording = useCallback(() => {
        if (!isHost || !meetId || !employeeId) return;
        const socket = getCoworkSocket(employeeId);
        socket.emit("recording_stop", { meetId, stoppedBy: employeeId, stoppedByName: firstName });
        stopRecording(); // stop self too
    }, [isHost, meetId, employeeId, firstName, stopRecording]);

    return {
        isRecording, isUploading, uploadDone, uploadError, uploadResult,
        setMuted,
        hostStartRecording,
        hostStopRecording,
    };
}