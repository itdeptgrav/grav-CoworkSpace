// hooks/useMeetingTranscript.js
//
// SENDING:  localParticipant.publishData() — LiveKit SDK directly, always stable
// RECEIVING: useDataChannel hook — only used for receiving, not sending
// RECOGNITION: created once with empty deps, uses refs for all callbacks
// MUTE DETECTION: polls localParticipant.getTrackPublication every 500ms via ref

import { useEffect, useRef, useState } from "react";
import { useLocalParticipant, useDataChannel } from "@livekit/components-react";
import { Track } from "livekit-client";

const TOPIC = "meeting-transcript";

export function useMeetingTranscript({ participantName }) {
    const { localParticipant } = useLocalParticipant();

    const [transcript, setTranscript] = useState([]);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(true);

    // Stable refs — never cause effect re-runs
    const recognitionRef = useRef(null);
    const runningRef = useRef(false);
    const shouldRunRef = useRef(false);
    const localPartRef = useRef(null);
    const participantRef = useRef(participantName);

    // Keep refs updated on every render
    localPartRef.current = localParticipant;
    participantRef.current = participantName;

    // ── RECEIVE lines from other participants ─────────────────────────────────
    // useDataChannel is ONLY for receiving here — we send via publishData below
    useDataChannel(TOPIC, (msg) => {
        try {
            const data = JSON.parse(new TextDecoder().decode(msg.payload));
            if (data.type === "tx") {
                setTranscript(prev => [...prev, {
                    name: data.name,
                    text: data.text,
                    time: data.time,
                }]);
            }
        } catch (e) { }
    });

    // ── SEND a line — called from recognition.onresult ────────────────────────
    // Uses localParticipant.publishData() directly — no stale ref problem
    const sendLine = (text) => {
        if (!text?.trim()) return;
        const myName = participantRef.current || localPartRef.current?.name || "Participant";
        const line = {
            type: "tx",
            name: myName,
            text: text.trim(),
            time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        };

        // Show in MY own transcript immediately
        setTranscript(prev => [...prev, line]);

        // Publish to everyone else via LiveKit SDK directly
        const lp = localPartRef.current;
        if (lp) {
            const payload = new TextEncoder().encode(JSON.stringify(line));
            lp.publishData(payload, { reliable: true, topic: TOPIC })
                .catch(e => console.warn("publishData failed:", e));
        }
    };

    // Store sendLine in a ref so recognition.onresult can call it without going stale
    const sendLineRef = useRef(sendLine);
    sendLineRef.current = sendLine;

    // ── CREATE SpeechRecognition ONCE ─────────────────────────────────────────
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
        r.lang = "hi-IN"; // handles Hindi + English + Odia + Hinglish

        r.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    sendLineRef.current(event.results[i][0].transcript);
                }
            }
        };

        r.onend = () => {
            runningRef.current = false;
            if (shouldRunRef.current) {
                // Still supposed to be running, restart
                setTimeout(() => {
                    if (shouldRunRef.current && recognitionRef.current) {
                        try {
                            recognitionRef.current.start();
                            runningRef.current = true;
                        } catch (e) { }
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
            // other errors (no-speech, network) → onend fires → auto restart
        };

        recognitionRef.current = r;

        return () => {
            shouldRunRef.current = false;
            runningRef.current = false;
            try { r.abort(); } catch (e) { }
            recognitionRef.current = null;
        };
    }, []); // EMPTY — created once, never recreated

    // ── POLL mic mute state every 500ms ───────────────────────────────────────
    useEffect(() => {
        const tick = () => {
            const lp = localPartRef.current;
            if (!lp || !recognitionRef.current) return;

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
                    } catch (e) {
                        console.warn("recognition start failed:", e);
                    }
                }
            } else if (muted && shouldRunRef.current) {
                // Mic muted → stop recognition
                shouldRunRef.current = false;
                try { recognitionRef.current.stop(); } catch (e) { }
                setIsTranscribing(false);
            }
        };

        const interval = setInterval(tick, 500);
        tick(); // check immediately

        return () => clearInterval(interval);
    }, []); // EMPTY — poll runs forever, reads via refs

    return {
        transcript,
        isTranscribing,
        speechSupported,
        clearTranscript: () => setTranscript([]),
    };
}