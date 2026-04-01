// hooks/useMeetingTranscript.js
//
// HOW IT WORKS:
//   - SpeechRecognition created ONCE on mount, never recreated
//   - Polls localParticipant.getTrackPublication("microphone").isMuted every 500ms
//   - Mic ON  → starts recognition automatically
//   - Mic OFF → stops recognition automatically
//   - Only THIS person's browser transcribes THIS person's voice
//   - Broadcasts each line via LiveKit DataChannel to all participants
//   - No duplicates — each line comes from exactly one browser

import { useEffect, useRef, useState } from "react";
import { useLocalParticipant, useDataChannel } from "@livekit/components-react";
import { Track } from "livekit-client";

const TOPIC = "meeting-transcript";

export function useMeetingTranscript({ participantName }) {
    const { localParticipant } = useLocalParticipant();

    const [transcript, setTranscript] = useState([]);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(true);

    // Use refs so the recognition callbacks never become stale
    const recognitionRef = useRef(null);
    const runningRef = useRef(false);
    const shouldRunRef = useRef(false);
    const participantRef = useRef(participantName); // stable name ref
    const localPartRef = useRef(localParticipant);
    const sendRef = useRef(null);
    const addLineRef = useRef(null);

    // Keep refs in sync
    participantRef.current = participantName;
    localPartRef.current = localParticipant;

    // ── DataChannel setup ─────────────────────────────────────────────────────
    const { send } = useDataChannel(TOPIC, (msg) => {
        try {
            const data = JSON.parse(new TextDecoder().decode(msg.payload));
            if (data.type === "tx") {
                setTranscript(prev => [...prev, { name: data.name, text: data.text, time: data.time }]);
            }
        } catch (e) { }
    });
    sendRef.current = send;

    // ── addLine: adds to local transcript + broadcasts ────────────────────────
    // Stored in a ref so recognition.onresult never goes stale
    addLineRef.current = (text) => {
        if (!text?.trim()) return;
        const myName = participantRef.current || localPartRef.current?.name || "Participant";
        const line = {
            type: "tx",
            name: myName,
            text: text.trim(),
            time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        };
        setTranscript(prev => [...prev, line]);
        try {
            sendRef.current?.(new TextEncoder().encode(JSON.stringify(line)), { reliable: true });
        } catch (e) { console.warn("DataChannel send failed:", e); }
    };

    // ── Create SpeechRecognition ONCE on mount ────────────────────────────────
    useEffect(() => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            setSpeechSupported(false);
            return;
        }

        const r = new SR();
        r.continuous = true;
        r.interimResults = false;
        r.maxAlternatives = 1;
        r.lang = "hi-IN"; // handles Hindi, English, Odia, Hinglish

        r.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    // Call via ref so this never becomes stale
                    addLineRef.current?.(event.results[i][0].transcript);
                }
            }
        };

        r.onend = () => {
            runningRef.current = false;
            // Auto-restart if mic is still unmuted
            if (shouldRunRef.current) {
                setTimeout(() => {
                    if (shouldRunRef.current) {
                        try { r.start(); runningRef.current = true; } catch (e) { }
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
                shouldRunRef.current = false;
                setIsTranscribing(false);
            }
            // "no-speech", "network", "audio-capture" → onend fires → auto-restart
        };

        recognitionRef.current = r;

        return () => {
            shouldRunRef.current = false;
            runningRef.current = false;
            try { r.abort(); } catch (e) { }
            recognitionRef.current = null;
        };
    }, []); // ← empty deps: created ONCE, never recreated

    // ── Poll mic mute state every 500ms ──────────────────────────────────────
    useEffect(() => {
        const tick = () => {
            const lp = localPartRef.current;
            if (!lp || !recognitionRef.current) return;

            // getTrackPublication("microphone") — correct LiveKit SDK call
            const pub = lp.getTrackPublication(Track.Source.Microphone);
            const muted = !pub || pub.isMuted;

            if (!muted && !shouldRunRef.current) {
                // Mic just turned ON → start recognition
                shouldRunRef.current = true;
                if (!runningRef.current) {
                    try {
                        recognitionRef.current.start();
                        runningRef.current = true;
                        setIsTranscribing(true);
                    } catch (e) { }
                }
            } else if (muted && shouldRunRef.current) {
                // Mic just MUTED → stop recognition
                shouldRunRef.current = false;
                try { recognitionRef.current.stop(); } catch (e) { }
                setIsTranscribing(false);
            }
        };

        const interval = setInterval(tick, 500);
        tick(); // check immediately on mount too

        return () => clearInterval(interval);
    }, []); // ← empty deps: poll runs forever, reads via refs

    return {
        transcript,
        isTranscribing,
        speechSupported,
        clearTranscript: () => setTranscript([]),
    };
}