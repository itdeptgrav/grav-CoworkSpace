"use client";
/**
 * hooks/useMeetingRecording.js
 *
 * RELOAD / LEAVE SAFETY:
 *   beforeunload  → shows browser warning dialog (synchronous only)
 *   pagehide      → fires when page actually unloads (after user confirms)
 *                   uses sendBeacon (survives unload, no auth header needed)
 *                   token is pre-cached and passed in FormData body
 *
 * REJOIN:
 *   localStorage session key tells backend this is a rejoin
 *   backend adds (1), (2) suffix to filename so old file is not overwritten
 *
 * SOCKET:
 *   getCoworkSocket() called directly in useEffect — never null
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { firebaseAuth } from "../lib/coworkFirebase";
import { getCoworkSocket } from "../lib/coworkSocket";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const CHUNK_MS = 30_000; // upload buffered audio every 30 seconds

// ── MIME type detection ───────────────────────────────────────────────────────
function getSupportedMimeType() {
    const types = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "audio/ogg",
    ];
    for (const t of types) {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
    }
    return "audio/webm";
}

// ── Auth token — cached and pre-fetched so it is available synchronously ──────
// Tokens last 60 min. We refresh every 50 min.
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

// Pre-warm the cache proactively (called when recording starts)
async function warmTokenCache() {
    try { await getAuthToken(); } catch (_) { }
}

// ── Session persistence (localStorage) ───────────────────────────────────────
// Tracks whether this user was actively recording so backend knows it is a rejoin
function sessionKey(meetId, employeeId) { return `rec_${meetId}_${employeeId}`; }

function saveSession(meetId, employeeId, mimeType) {
    try {
        localStorage.setItem(sessionKey(meetId, employeeId), JSON.stringify({
            meetId, employeeId, mimeType, startedAt: Date.now(),
        }));
    } catch (_) { }
}

function getSession(meetId, employeeId) {
    try {
        const raw = localStorage.getItem(sessionKey(meetId, employeeId));
        if (!raw) return null;
        const s = JSON.parse(raw);
        // Ignore sessions older than 4 hours
        if (Date.now() - s.startedAt > 4 * 60 * 60 * 1000) {
            localStorage.removeItem(sessionKey(meetId, employeeId));
            return null;
        }
        return s;
    } catch (_) { return null; }
}

function clearSession(meetId, employeeId) {
    try { localStorage.removeItem(sessionKey(meetId, employeeId)); } catch (_) { }
}

// ── Normal chunk upload (during active recording every 30s) ───────────────────
async function uploadChunk({ blob, meetId, chunkIndex, mimeType }) {
    try {
        const token = await getAuthToken();
        const fd = new FormData();
        fd.append("chunk", blob, `chunk_${chunkIndex}.bin`);
        fd.append("meetId", meetId);
        fd.append("chunkIndex", String(chunkIndex));
        fd.append("mimeType", mimeType);
        const res = await fetch(`${BASE}/cowork/audio/chunk`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
        });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            console.error("[AudioChunk] Upload failed:", d.error);
        }
    } catch (e) {
        console.error("[AudioChunk] Network error (non-fatal):", e.message);
    }
}

// ── Emergency chunk upload via sendBeacon (survives page unload) ──────────────
// sendBeacon cannot set headers — token goes in FormData body field
function sendBeaconChunk({ blob, meetId, chunkIndex, mimeType, token }) {
    try {
        const fd = new FormData();
        fd.append("chunk", blob, `chunk_emergency.bin`);
        fd.append("meetId", meetId);
        fd.append("chunkIndex", String(chunkIndex));
        fd.append("mimeType", mimeType);
        fd.append("token", token); // auth via body since headers not supported
        fd.append("emergency", "true");
        return navigator.sendBeacon(`${BASE}/cowork/audio/beacon-chunk`, fd);
    } catch (e) {
        console.error("[BeaconChunk] Failed:", e.message);
        return false;
    }
}

// ── Emergency finalize via fetch keepalive (survives page unload, small JSON) ──
function sendKeepaliveFinalize({ meetId, firstName, mimeType, token, isRejoin }) {
    try {
        fetch(`${BASE}/cowork/audio/finalize`, {
            method: "POST",
            keepalive: true,   // key: request survives page unload
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ meetId, firstName, mimeType, isRejoin }),
        }).catch(() => { });    // fire and forget — no await possible during unload
    } catch (_) { }
}

// ── Normal finalize (awaited, during normal stop flow) ────────────────────────
async function finalizeRecording({ meetId, firstName, mimeType, isRejoin }) {
    const token = await getAuthToken();
    const res = await fetch(`${BASE}/cowork/audio/finalize`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ meetId, firstName, mimeType, isRejoin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Finalize failed");
    return data;
}

// ═══════════════════════════════════════════════════════════════════════════════
export function useMeetingRecording({ meetId, employeeId, firstName, isHost }) {

    // ── State ─────────────────────────────────────────────────────────────────
    const [isRecording, setIsRecording] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadDone, setUploadDone] = useState(false);
    const [uploadError, setUploadError] = useState("");
    const [uploadResult, setUploadResult] = useState(null);

    // ── Refs ──────────────────────────────────────────────────────────────────
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const chunkIndexRef = useRef(0);
    const mimeTypeRef = useRef("");
    const isRecordingRef = useRef(false);
    const isMutedRef = useRef(false);
    const chunkTimerRef = useRef(null);
    const isRejoinRef = useRef(false); // true when user rejoined after reload
    const meetIdRef = useRef(meetId);
    const firstNameRef = useRef(firstName);
    const employeeIdRef = useRef(employeeId);

    meetIdRef.current = meetId;
    firstNameRef.current = firstName;
    employeeIdRef.current = employeeId;

    // ── setMuted — called by <MuteWatcher> inside LiveKitRoom ─────────────────
    const setMuted = useCallback((muted) => {
        isMutedRef.current = muted;
    }, []);

    // ── Flush buffered chunks to server ───────────────────────────────────────
    const flushChunks = useCallback(async () => {
        if (chunksRef.current.length === 0) return;
        const blobs = [...chunksRef.current];
        chunksRef.current = [];
        const combined = new Blob(blobs, { type: mimeTypeRef.current });
        if (combined.size < 100) return;
        const idx = chunkIndexRef.current++;
        await uploadChunk({
            blob: combined, meetId: meetIdRef.current,
            chunkIndex: idx, mimeType: mimeTypeRef.current,
        });
    }, []);

    const startChunkTimer = useCallback(() => {
        if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
        chunkTimerRef.current = setInterval(flushChunks, CHUNK_MS);
    }, [flushChunks]);

    const stopChunkTimer = useCallback(() => {
        if (chunkTimerRef.current) {
            clearInterval(chunkTimerRef.current);
            chunkTimerRef.current = null;
        }
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
            chunkIndexRef.current = 0;
            chunksRef.current = [];

            const recorder = new MediaRecorder(stream, { mimeType });
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0 && !isMutedRef.current) {
                    chunksRef.current.push(e.data);
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

            // Save session to localStorage so we detect rejoin after reload
            saveSession(meetIdRef.current, employeeIdRef.current, mimeType);

            // Pre-warm token cache so it is ready when pagehide fires
            warmTokenCache();

            console.log(`[Recording] ✅ Started for ${employeeIdRef.current}${rejoin ? " (REJOIN)" : ""} — ${mimeType}`);
        } catch (e) {
            isRecordingRef.current = false;
            console.error("[Recording] Could not start:", e.message);
            setUploadError("Microphone access denied. Cannot record.");
        }
    }, [startChunkTimer]);

    // ── Stop and finalize ─────────────────────────────────────────────────────
    const stopRecording = useCallback(async () => {
        if (!isRecordingRef.current) return;
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

        // Clear localStorage session — this was a clean stop, not a crash
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
            console.log(`[Recording] ✅ Finalized:`, result.fileName);
        } catch (e) {
            console.error("[Recording] Finalize error:", e.message);
            setUploadError("Upload failed: " + e.message);
        } finally {
            setIsUploading(false);
        }
    }, [stopChunkTimer, flushChunks]);

    // ── beforeunload — show warning dialog (SYNCHRONOUS only) ────────────────
    // Cannot do async here — just show the prompt.
    // Actual save happens in pagehide below.
    useEffect(() => {
        const handler = (e) => {
            if (!isRecordingRef.current) return;
            e.preventDefault();
            e.returnValue = "Recording is active. Your audio will be saved automatically before you leave.";
            return e.returnValue;
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, []);

    // ── pagehide — fires when user actually leaves (after confirming dialog) ──
    // This is the correct event for cleanup. Works on mobile + desktop + iOS.
    // sendBeacon and fetch(keepalive) both work here.
    useEffect(() => {
        const handler = async () => {
            if (!isRecordingRef.current) return;
            isRecordingRef.current = false;
            stopChunkTimer();

            // Stop MediaRecorder to get final frames
            const recorder = mediaRecorderRef.current;
            if (recorder && recorder.state !== "inactive") {
                try { recorder.stop(); } catch (_) { }
            }
            mediaRecorderRef.current = null;

            // Get cached token (sync — token was pre-warmed when recording started)
            const token = cachedToken;
            if (!token) return; // no token = nothing we can do

            // Send remaining buffered chunks via sendBeacon (survives page unload)
            if (chunksRef.current.length > 0 && mimeTypeRef.current) {
                const combined = new Blob(chunksRef.current, { type: mimeTypeRef.current });
                if (combined.size >= 100) {
                    sendBeaconChunk({
                        blob: combined,
                        meetId: meetIdRef.current,
                        chunkIndex: chunkIndexRef.current,
                        mimeType: mimeTypeRef.current,
                        token,
                    });
                }
                chunksRef.current = [];
            }

            // Trigger finalize via fetch(keepalive) — survives page unload
            // Backend merges all saved chunks → Drive → Firebase
            sendKeepaliveFinalize({
                meetId: meetIdRef.current,
                firstName: firstNameRef.current,
                mimeType: mimeTypeRef.current,
                token,
                isRejoin: isRejoinRef.current,
            });

            // Keep localStorage session so on rejoin we know to add suffix to filename
            // (clearSession is NOT called here — that only happens on clean stop)
        };

        window.addEventListener("pagehide", handler);
        return () => window.removeEventListener("pagehide", handler);
    }, [stopChunkTimer]);

    // ── Auto-detect rejoin after reload ───────────────────────────────────────
    // If user had an active session and reloads, auto-start recording again
    // so their audio continues into the same meeting (with suffix on filename)
    useEffect(() => {
        if (!meetId || !employeeId) return;
        const session = getSession(meetId, employeeId);
        if (!session) return;
        console.log(`[Recording] 🔄 Rejoin detected for ${employeeId} in meeting ${meetId}`);
        // Wait 2.5s for LiveKit room to connect before grabbing mic
        const t = setTimeout(() => startRecording(true), 2500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meetId, employeeId]); // run once on mount only

    // ── Socket: every user listens for CEO/TL start/stop signals ─────────────
    useEffect(() => {
        if (!meetId || !employeeId) return;
        const socket = getCoworkSocket(employeeId);
        socket.emit("join_meeting_room", meetId);

        const onStarted = (data) => {
            console.log(`[Recording] Signal START from ${data?.startedByName}`);
            startRecording(false);
        };
        const onStopped = (data) => {
            console.log(`[Recording] Signal STOP from ${data?.stoppedByName}`);
            stopRecording();
        };

        socket.on("recording_started", onStarted);
        socket.on("recording_stopped", onStopped);
        return () => {
            socket.off("recording_started", onStarted);
            socket.off("recording_stopped", onStopped);
            socket.emit("leave_meeting_room", meetId);
        };
    }, [meetId, employeeId, startRecording, stopRecording]);

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

    // ── Cleanup on unmount ────────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            stopChunkTimer();
            const recorder = mediaRecorderRef.current;
            if (recorder && recorder.state !== "inactive") {
                recorder.stop();
                recorder.stream?.getTracks().forEach(t => t.stop());
            }
        };
    }, [stopChunkTimer]);

    return {
        isRecording, isUploading, uploadDone, uploadError, uploadResult,
        setMuted,
        hostStartRecording,
        hostStopRecording,
    };
}