// hooks/useMeetingTranscript.js

import { useEffect, useRef, useState, useCallback } from "react";
import { useRoomContext, useLocalParticipant } from "@livekit/components-react";
import { RoomEvent, ParticipantEvent, Track } from "livekit-client";

const TOPIC = "meeting-transcript";

// WHY ONE INSTANCE ONLY (not 3 parallel):
// Running 3 recognition instances simultaneously causes Chrome to throttle/block them.
// That was the "not detecting voice" bug — Chrome only allows ONE SpeechRecognition
// instance to use the mic at a time. The others silently fail.
//
// SOLUTION:
// - Hindi + English auto-detect: use lang="hi-IN" which handles BOTH Hindi script
//   AND English words in the same utterance (Google's Indian language model is bilingual)
// - Odia: user clicks "Odia" button → switch lang to "or-IN"
//   or-IN may not work on all devices; if it fails, falls back to "hi-IN"
//
// WHY speakingRef GATE WAS BREAKING DETECTION:
// IsSpeakingChanged fires based on LiveKit audio levels, but there's a delay.
// If the gate was checked BEFORE LiveKit detected speaking, results were ignored.
// FIX: removed the speakingRef gate entirely. Instead we rely on ONLY the mic mute gate.
// The duplicate issue is solved differently: each browser only sends its OWN name.

export function useMeetingTranscript({ participantName }) {
    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();

    const [transcript, setTranscript] = useState([]);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(true);
    const [activeLang, setActiveLang] = useState("hi-IN"); // hi-IN = Hindi+English auto

    const recognitionRef = useRef(null);
    const runningRef = useRef(false);
    const micOnRef = useRef(false);
    const localPartRef = useRef(null);
    const nameRef = useRef(participantName);
    const activeLangRef = useRef("hi-IN");

    localPartRef.current = localParticipant;
    nameRef.current = participantName;
    activeLangRef.current = activeLang;

    // ── RECEIVE lines from other participants via DataChannel ─────────────────
    const onDataRef = useRef(null);
    onDataRef.current = (payload, participant, kind, topic) => {
        if (topic !== TOPIC) return;
        try {
            const data = JSON.parse(new TextDecoder().decode(payload));
            if (data.type === "tx") {
                setTranscript(prev => [...prev, {
                    name: data.name,
                    text: data.text,
                    time: data.time,
                }]);
            }
        } catch (e) { }
    };

    useEffect(() => {
        if (!room) return;
        const h = (...args) => onDataRef.current?.(...args);
        room.on(RoomEvent.DataReceived, h);
        return () => room.off(RoomEvent.DataReceived, h);
    }, [room]);

    // ── SEND my own transcript line ───────────────────────────────────────────
    const sendLineRef = useRef(null);
    sendLineRef.current = (text) => {
        if (!text?.trim()) return;
        const myName = nameRef.current || localPartRef.current?.name || "Participant";
        const line = {
            type: "tx",
            name: myName,
            text: text.trim(),
            time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        };
        // Add to own transcript immediately
        setTranscript(prev => [...prev, line]);
        // Broadcast to all other participants
        const lp = localPartRef.current;
        if (lp) {
            const payload = new TextEncoder().encode(JSON.stringify(line));
            lp.publishData(payload, { reliable: true, topic: TOPIC })
                .catch(e => console.warn("publishData:", e));
        }
    };

    // ── Build a fresh SpeechRecognition instance ──────────────────────────────
    const buildRecognition = useCallback((langCode) => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { setSpeechSupported(false); return null; }

        const r = new SR();
        r.continuous = true;   // keeps listening, handles long sentences
        r.interimResults = false;  // only final results — cleaner output, no partials
        r.maxAlternatives = 1;
        r.lang = langCode;

        r.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    const text = event.results[i][0].transcript;
                    if (text?.trim()) sendLineRef.current?.(text);
                }
            }
        };

        r.onend = () => {
            runningRef.current = false;
            // Auto-restart only if mic is still ON
            // This handles: silence timeout, network blip, etc.
            if (micOnRef.current) {
                setTimeout(() => {
                    const rec = recognitionRef.current;
                    if (rec && micOnRef.current && !runningRef.current) {
                        try { rec.start(); runningRef.current = true; } catch (e) { }
                    }
                }, 300);
            } else {
                setIsTranscribing(false);
            }
        };

        r.onerror = (event) => {
            runningRef.current = false;
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                setSpeechSupported(false);
                micOnRef.current = false;
                setIsTranscribing(false);
                return;
            }
            if (event.error === "language-not-supported") {
                // or-IN not available on this device → fall back to hi-IN
                console.warn(`Language ${langCode} not supported, falling back to hi-IN`);
                if (langCode === "or-IN") {
                    const fallback = buildRecognition("hi-IN");
                    if (fallback) {
                        recognitionRef.current = fallback;
                        try { fallback.start(); runningRef.current = true; } catch (e) { }
                    }
                }
                return;
            }
            // "no-speech", "network", "aborted" → onend fires → auto-restart handles it
        };

        return r;
    }, []);

    // ── Start recognition ─────────────────────────────────────────────────────
    const startRecognition = useCallback((langCode) => {
        // Stop any existing instance first
        if (recognitionRef.current) {
            runningRef.current = false;
            try { recognitionRef.current.abort(); } catch (e) { }
            recognitionRef.current = null;
        }

        const r = buildRecognition(langCode);
        if (!r) return;

        recognitionRef.current = r;
        try {
            r.start();
            runningRef.current = true;
            setIsTranscribing(true);
        } catch (e) {
            console.warn("recognition.start() failed:", e.message);
        }
    }, [buildRecognition]);

    // ── Stop recognition ──────────────────────────────────────────────────────
    const stopRecognition = useCallback(() => {
        runningRef.current = false;
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch (e) { }
            recognitionRef.current = null;
        }
        setIsTranscribing(false);
    }, []);

    // ── GATE: watch mic mute state every 500ms ────────────────────────────────
    useEffect(() => {
        if (!localParticipant) return;

        const checkMute = () => {
            const pub = localParticipant.getTrackPublication(Track.Source.Microphone);
            const muted = !pub || pub.isMuted;
            const was = micOnRef.current;
            micOnRef.current = !muted;

            if (!muted && !was) {
                // Mic just turned ON → start
                startRecognition(activeLangRef.current);
            } else if (muted && was) {
                // Mic just turned OFF → stop
                stopRecognition();
            }
        };

        const interval = setInterval(checkMute, 500);
        checkMute(); // immediate check on mount

        return () => {
            clearInterval(interval);
            micOnRef.current = false;
            stopRecognition();
        };
    }, [localParticipant, startRecognition, stopRecognition]);

    // ── Language switch (called when user clicks Odia/Hindi/English button) ───
    const switchLanguage = useCallback((langCode) => {
        setActiveLang(langCode);
        activeLangRef.current = langCode;
        // If mic is currently ON, restart recognition with new language immediately
        if (micOnRef.current) {
            startRecognition(langCode);
        }
    }, [startRecognition]);

    return {
        transcript,
        isTranscribing,
        speechSupported,
        activeLang,
        switchLanguage,
        clearTranscript: () => setTranscript([]),
    };
}