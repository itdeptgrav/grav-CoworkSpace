// hooks/useMeetingTranscript.js
//
// ARCHITECTURE (read this before changing anything):
//
//  Each person's browser runs THIS hook independently.
//
//  Rule 1 — Only transcribe YOUR OWN voice:
//    SpeechRecognition always uses the system mic. We do NOT try to pass a
//    MediaStream to it (that API doesn't work cross-browser). Instead we rely
//    on the rule: each browser only runs recognition for ITSELF.
//    = CEO's browser transcribes CEO's mic → sends "CEO: ..." to everyone
//    = OMM's browser transcribes OMM's mic → sends "OMM: ..." to everyone
//    = CEO's browser NEVER transcribes OMM's voice and vice versa.
//
//  Rule 2 — No duplicates:
//    Each browser only SENDS its own lines. It RECEIVES other people's lines
//    via LiveKit DataChannel. So the transcript panel on EVERY laptop shows
//    the same complete conversation, but each line was created by exactly one
//    person's browser.
//
//  Rule 3 — Auto start/stop with mic mute:
//    We watch localParticipant's mic publication for isMuted changes.
//    Mic ON  → recognition starts automatically (no button needed)
//    Mic OFF → recognition stops automatically
//    This is done via a polling interval (50ms) because LiveKit's React hooks
//    for mute state require ParticipantContext which isn't always available
//    inside a custom hook — polling the SDK object directly is more reliable.

import { useEffect, useRef, useState, useCallback } from "react";
import { useLocalParticipant, useDataChannel } from "@livekit/components-react";
import { Track } from "livekit-client";

const TRANSCRIPT_TOPIC = "meeting-transcript";

export function useMeetingTranscript({ participantName }) {
    const { localParticipant } = useLocalParticipant();

    const [transcript, setTranscript] = useState([]);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(true);

    const recognitionRef = useRef(null);
    const runningRef = useRef(false);  // is recognition currently started?
    const shouldRunRef = useRef(false);  // should it be running? (mic unmuted)

    // ── DataChannel: receive lines from other participants ────────────────────
    const { send } = useDataChannel(TRANSCRIPT_TOPIC, (msg) => {
        try {
            const data = JSON.parse(new TextDecoder().decode(msg.payload));
            if (data.type === "tx") {
                setTranscript(prev => [...prev, {
                    name: data.name,
                    text: data.text,
                    time: data.time,
                }]);
            }
        } catch (e) { /* ignore malformed */ }
    });

    // ── Broadcast MY line to everyone ─────────────────────────────────────────
    const broadcastLine = useCallback((text) => {
        if (!text?.trim()) return;
        const myName = participantName || localParticipant?.name || "Participant";
        const line = {
            type: "tx",
            name: myName,
            text: text.trim(),
            time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        };
        // Add to MY own view immediately
        setTranscript(prev => [...prev, line]);
        // Send to everyone else in the room
        try {
            send(new TextEncoder().encode(JSON.stringify(line)), { reliable: true });
        } catch (e) { console.warn("DataChannel send failed:", e); }
    }, [participantName, localParticipant, send]);

    // ── Setup SpeechRecognition engine (once) ─────────────────────────────────
    useEffect(() => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { setSpeechSupported(false); return; }

        const recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        // hi-IN = Google's broad Indian language model
        // handles Hindi, English, Hinglish, Odia automatically
        recognition.lang = "hi-IN";

        recognition.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    broadcastLine(event.results[i][0].transcript);
                }
            }
        };

        // Auto-restart when recognition times out from silence
        recognition.onend = () => {
            runningRef.current = false;
            if (shouldRunRef.current) {
                // Still supposed to be running — restart after brief pause
                setTimeout(() => {
                    if (shouldRunRef.current && recognitionRef.current) {
                        try {
                            recognitionRef.current.start();
                            runningRef.current = true;
                        } catch (e) { }
                    }
                }, 200);
            } else {
                setIsTranscribing(false);
            }
        };

        recognition.onerror = (event) => {
            runningRef.current = false;
            if (event.error === "not-allowed") {
                setSpeechSupported(false);
                shouldRunRef.current = false;
                setIsTranscribing(false);
            }
            // For "no-speech", "audio-capture" etc — onend fires next and restarts
        };

        recognitionRef.current = recognition;

        return () => {
            shouldRunRef.current = false;
            runningRef.current = false;
            try { recognition.abort(); } catch (e) { }
        };
    }, [broadcastLine]);

    // ── Poll mic mute state from LiveKit SDK directly ─────────────────────────
    // We poll localParticipant directly instead of using useIsMuted hook because:
    // 1. useIsMuted requires ParticipantContext which may not be in scope
    // 2. Direct SDK polling is always correct regardless of React context
    useEffect(() => {
        if (!localParticipant) return;

        const checkMuteState = () => {
            const micPub = localParticipant.getTrackPublication(Track.Source.Microphone);
            // isMuted = no publication OR track is muted
            const muted = !micPub || micPub.isMuted;

            if (muted && shouldRunRef.current) {
                // Mic just muted → stop recognition
                shouldRunRef.current = false;
                try { recognitionRef.current?.stop(); } catch (e) { }
                setIsTranscribing(false);

            } else if (!muted && !shouldRunRef.current && recognitionRef.current) {
                // Mic just unmuted → start recognition automatically
                shouldRunRef.current = true;
                if (!runningRef.current) {
                    try {
                        recognitionRef.current.start();
                        runningRef.current = true;
                        setIsTranscribing(true);
                    } catch (e) { }
                }
            }
        };

        // Check every 300ms — lightweight, no performance impact
        const interval = setInterval(checkMuteState, 300);
        // Also check immediately
        checkMuteState();

        return () => clearInterval(interval);
    }, [localParticipant]);

    return {
        transcript,
        isTranscribing,
        speechSupported,
        clearTranscript: () => setTranscript([]),
    };
}