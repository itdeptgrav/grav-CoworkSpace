"use client";
/**
 * hooks/useMeetingRecording.js
 * 
 * KEY FIX: Socket is initialized synchronously (not via useEffect ref),
 * so all employees immediately receive recording_started/recording_stopped.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { firebaseAuth } from "../lib/coworkFirebase";
import { getCoworkSocket } from "../lib/coworkSocket";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const CHUNK_MS = 30_000;

// ── Detect best supported MIME type per browser ───────────────────────────────
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

async function getAuthToken() {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken(false);
}

// ── Upload one 30s chunk to backend ──────────────────────────────────────────
async function uploadChunk({ blob, meetId, chunkIndex, mimeType }) {
    try {
        const token = await getAuthToken();
        const fd = new FormData();
        fd.append("chunk", blob, `chunk_${chunkIndex}.bin`);
        fd.append("meetId", meetId);
        fd.append("chunkIndex", String(chunkIndex)); // explicit string, never falsy
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

// ── Call backend to merge chunks → Drive → Firebase ──────────────────────────
async function finalizeRecording({ meetId, firstName, mimeType }) {
    const token = await getAuthToken();
    const res = await fetch(`${BASE}/cowork/audio/finalize`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ meetId, firstName, mimeType }),
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
    const meetIdRef = useRef(meetId);
    const firstNameRef = useRef(firstName);
    const employeeIdRef = useRef(employeeId);

    // Keep refs in sync every render
    meetIdRef.current = meetId;
    firstNameRef.current = firstName;
    employeeIdRef.current = employeeId;

    // ── setMuted — called by <MuteWatcher> inside LiveKitRoom ─────────────────
    const setMuted = useCallback((muted) => {
        isMutedRef.current = muted;
    }, []);

    // ── Warn user before closing tab while recording ─────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if (!isRecordingRef.current) return;
            e.preventDefault();
            e.returnValue = "Recording is active. Leaving will lose your audio. Are you sure?";
            return e.returnValue;
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, []);

    // ── Flush buffered audio chunks to server ─────────────────────────────────
    const flushChunks = useCallback(async () => {
        if (chunksRef.current.length === 0) return;
        const blobs = [...chunksRef.current];
        chunksRef.current = [];
        const combined = new Blob(blobs, { type: mimeTypeRef.current });
        if (combined.size < 100) return; // skip near-empty blobs
        const idx = chunkIndexRef.current++;
        await uploadChunk({
            blob: combined,
            meetId: meetIdRef.current,
            chunkIndex: idx,
            mimeType: mimeTypeRef.current,
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

    // ── Start MediaRecorder (this user's own mic only) ────────────────────────
    const startRecording = useCallback(async () => {
        if (isRecordingRef.current) return; // already running, ignore duplicate signals
        if (typeof window === "undefined") return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            const mimeType = getSupportedMimeType();
            mimeTypeRef.current = mimeType;
            isRecordingRef.current = true;
            chunkIndexRef.current = 0;
            chunksRef.current = [];

            const recorder = new MediaRecorder(stream, { mimeType });

            recorder.ondataavailable = (e) => {
                // Discard frames only when user is muted in LiveKit
                if (e.data && e.data.size > 0 && !isMutedRef.current) {
                    chunksRef.current.push(e.data);
                }
            };
            recorder.onerror = (e) => console.error("[MediaRecorder] Error:", e.error);
            recorder.start(1000); // slice every 1s for accurate mute gating

            mediaRecorderRef.current = recorder;
            setIsRecording(true);
            setUploadDone(false);
            setUploadError("");
            setUploadResult(null);
            startChunkTimer();
            console.log(`[Recording] ✅ Started for ${employeeIdRef.current} — format: ${mimeType}`);
        } catch (e) {
            isRecordingRef.current = false;
            console.error("[Recording] Could not start:", e.message);
            setUploadError("Microphone access denied. Cannot record.");
        }
    }, [startChunkTimer]);

    // ── Stop recording and finalize ───────────────────────────────────────────
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

        // Flush any remaining buffered audio
        await flushChunks();

        // Ask backend to merge all chunks → upload to Drive → save to Firebase
        setIsUploading(true);
        try {
            const result = await finalizeRecording({
                meetId: meetIdRef.current,
                firstName: firstNameRef.current,
                mimeType: mimeTypeRef.current,
            });
            setUploadResult(result);
            setUploadDone(true);
            console.log(`[Recording] ✅ Finalized for ${employeeIdRef.current}:`, result.fileName);
        } catch (e) {
            console.error("[Recording] Finalize error:", e.message);
            setUploadError("Upload failed: " + e.message);
        } finally {
            setIsUploading(false);
        }
    }, [stopChunkTimer, flushChunks]);

    // ── Socket: EVERY user listens for CEO/TL start/stop signals ─────────────
    // FIX: getCoworkSocket() is called directly here (not via a ref) so the
    // socket is ready immediately when this effect runs — not null.
    useEffect(() => {
        if (!meetId || !employeeId) return;

        // Get (or create) the singleton socket for this employee
        const socket = getCoworkSocket(employeeId);

        // Join the meeting-specific room so broadcasts reach this browser
        socket.emit("join_meeting_room", meetId);
        console.log(`[Recording] Joined meeting room: meeting_${meetId}`);

        const onStarted = (data) => {
            console.log(`[Recording] Signal: START received (from ${data?.startedByName})`);
            startRecording();
        };
        const onStopped = (data) => {
            console.log(`[Recording] Signal: STOP received (from ${data?.stoppedByName})`);
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

    // ── Host controls (CEO/TL only) ───────────────────────────────────────────
    const hostStartRecording = useCallback(() => {
        if (!isHost || !meetId || !employeeId) return;
        const socket = getCoworkSocket(employeeId);
        // Emit to all OTHER participants in the meeting room
        socket.emit("recording_start", {
            meetId,
            startedBy: employeeId,
            startedByName: firstName,
        });
        // Start own recording immediately
        startRecording();
    }, [isHost, meetId, employeeId, firstName, startRecording]);

    const hostStopRecording = useCallback(() => {
        if (!isHost || !meetId || !employeeId) return;
        const socket = getCoworkSocket(employeeId);
        socket.emit("recording_stop", {
            meetId,
            stoppedBy: employeeId,
            stoppedByName: firstName,
        });
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
        isRecording,
        isUploading,
        uploadDone,
        uploadError,
        uploadResult,
        setMuted,            // → passed to <MuteWatcher> inside LiveKitRoom
        hostStartRecording,
        hostStopRecording,
    };
}