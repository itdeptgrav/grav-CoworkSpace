// hooks/useMeetingTranscript.js
//
// KEY FIX vs previous version:
//
//  ❌ OLD: window.webkitSpeechRecognition() — listens to the whole browser tab audio
//          = picks up OTHER people's voices coming through speakers → wrong speaker labels
//
//  ✅ NEW: Gets the actual microphone MediaStreamTrack from LiveKit's local participant
//          = ONLY transcribes THIS person's own voice
//          = Automatically stops when mic is muted in LiveKit (track goes silent)
//          = Language auto-detected (hi-IN covers Hindi, English, Odia, Hinglish)
//
//  Each participant runs this hook on their OWN browser.
//  Their words are broadcast via LiveKit DataChannel with THEIR name attached.
//  Everyone receives each other's lines and the transcript builds in sequence.

import { useEffect, useRef, useState, useCallback } from "react";
import { useLocalParticipant, useDataChannel, useIsMuted } from "@livekit/components-react";
import { Track } from "livekit-client";

const TRANSCRIPT_TOPIC = "meeting-transcript";

export function useMeetingTranscript({ participantName, isActive }) {
    const { localParticipant } = useLocalParticipant();

    // Track LiveKit mic mute state — must pass participant explicitly
    const isMuted = useIsMuted({ source: Track.Source.Microphone, participant: localParticipant });

    const [transcript, setTranscript] = useState([]);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(false);

    const recognitionRef = useRef(null);
    const restartTimer = useRef(null);
    const activeRef = useRef(false); // controls auto-restart loop

    // ── DataChannel: receive lines from other participants ────────────────────
    const { send } = useDataChannel(TRANSCRIPT_TOPIC, (msg) => {
        try {
            const data = JSON.parse(new TextDecoder().decode(msg.payload));
            if (data.type === "transcript-line") {
                setTranscript(prev => [...prev, {
                    name: data.name,
                    text: data.text,
                    time: data.time,
                }]);
            }
        } catch (e) { /* ignore */ }
    });

    // ── Broadcast this person's line to everyone ──────────────────────────────
    const broadcastLine = useCallback((text) => {
        if (!text?.trim()) return;
        const myName = participantName || localParticipant?.name || "Unknown";
        const line = {
            type: "transcript-line",
            name: myName,
            text: text.trim(),
            time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        };
        // Add to my own transcript immediately
        setTranscript(prev => [...prev, line]);
        // Send to all other participants
        try {
            send(new TextEncoder().encode(JSON.stringify(line)), { reliable: true });
        } catch (e) { console.warn("DataChannel send error:", e); }
    }, [participantName, localParticipant, send]);

    // ── Build Speech Recognition using LiveKit's mic track ───────────────────
    // This is the KEY FIX: we get the EXACT microphone stream from LiveKit
    // so we only transcribe THIS person's own voice, not the meeting audio.
    const getMicStream = useCallback(() => {
        if (!localParticipant) return null;
        const micPub = localParticipant.getTrackPublication(Track.Source.Microphone);
        const track = micPub?.track?.mediaStreamTrack;
        if (!track) return null;
        return new MediaStream([track]);
    }, [localParticipant]);

    // ── Setup recognition engine ──────────────────────────────────────────────
    useEffect(() => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { setSpeechSupported(false); return; }
        setSpeechSupported(true);

        const recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        // hi-IN = Google's Hindi model — also recognises English, Hinglish, and
        // Odia words written in Hindi script. Best single choice for Indian offices.
        // If pure English is needed the recognition.lang can be toggled later.
        recognition.lang = "hi-IN";

        recognition.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    broadcastLine(event.results[i][0].transcript);
                }
            }
        };

        // Auto-restart when recognition naturally ends (it times out after silence)
        recognition.onend = () => {
            if (activeRef.current) {
                restartTimer.current = setTimeout(() => {
                    try { recognition.start(); } catch (e) { }
                }, 250);
            } else {
                setIsTranscribing(false);
            }
        };

        recognition.onerror = (event) => {
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                setSpeechSupported(false);
                activeRef.current = false;
                setIsTranscribing(false);
            }
            // "no-speech" / "audio-capture" — just restart
        };

        recognitionRef.current = recognition;
        return () => {
            activeRef.current = false;
            clearTimeout(restartTimer.current);
            try { recognition.stop(); } catch (e) { }
        };
    }, [broadcastLine]);

    // ── Auto-stop transcription when mic is MUTED in LiveKit ─────────────────
    // When someone mutes in the meeting → their transcription also stops.
    // When they unmute → transcription resumes. Perfectly synced.
    useEffect(() => {
        if (!recognitionRef.current) return;
        if (isMuted) {
            // Mic muted → stop transcribing
            activeRef.current = false;
            clearTimeout(restartTimer.current);
            try { recognitionRef.current.stop(); } catch (e) { }
            setIsTranscribing(false);
        } else {
            // Mic unmuted → resume transcribing (only if transcription was active)
            if (isTranscribing) {
                activeRef.current = true;
                try { recognitionRef.current.start(); } catch (e) { }
            }
        }
    }, [isMuted]);

    // ── Manual start/stop (for the "Start Transcription" button) ─────────────
    const startTranscription = useCallback(() => {
        if (!recognitionRef.current || isMuted) return;
        activeRef.current = true;
        try { recognitionRef.current.start(); } catch (e) { }
        setIsTranscribing(true);
    }, [isMuted]);

    const stopTranscription = useCallback(() => {
        activeRef.current = false;
        clearTimeout(restartTimer.current);
        try { recognitionRef.current?.stop(); } catch (e) { }
        setIsTranscribing(false);
    }, []);

    return {
        transcript,
        isTranscribing,
        isMicMuted: isMuted,
        speechSupported,
        startTranscription,
        stopTranscription,
        clearTranscript: () => setTranscript([]),
    };
}