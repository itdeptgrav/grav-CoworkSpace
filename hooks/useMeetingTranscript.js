// hooks/useMeetingTranscript.js
//
// WHY THIS VERSION IS RELIABLE:
//
// Previous versions used useDataChannel hook for send/receive.
// useDataChannel.send() returns a Promise<void> internally using a generator,
// and storing it in a ref causes stale closure crashes.
//
// This version uses ONLY the raw LiveKit SDK:
//   RECEIVE → room.on(RoomEvent.DataReceived, handler)   [pure SDK event]
//   SEND    → localParticipant.publishData(payload, opts) [pure SDK method]
//
// No React hook for data channel at all. Zero stale ref issues.
// Works identically on CEO's browser AND on every other participant's browser.

import { useEffect, useRef, useState } from "react";
import { useRoomContext, useLocalParticipant } from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";

const TOPIC = "meeting-transcript";

export function useMeetingTranscript({ participantName }) {
    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();

    const [transcript, setTranscript] = useState([]);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(true);

    // Stable refs — read inside effects/callbacks without causing re-runs
    const recognitionRef = useRef(null);
    const runningRef = useRef(false);   // recognition.start() was called
    const shouldRunRef = useRef(false);   // should recognition be running?
    const roomRef = useRef(null);
    const localPartRef = useRef(null);
    const nameRef = useRef(participantName);

    // Keep refs current on every render
    roomRef.current = room;
    localPartRef.current = localParticipant;
    nameRef.current = participantName;

    // ── RECEIVE: listen to room DataReceived event ────────────────────────────
    // Registered once. Uses ref for handler so it never goes stale.
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
        const handler = (...args) => onDataRef.current?.(...args);
        room.on(RoomEvent.DataReceived, handler);
        return () => { room.off(RoomEvent.DataReceived, handler); };
    }, [room]); // re-register only if room object changes (almost never)

    // ── SEND: publish via SDK directly ────────────────────────────────────────
    // Called from recognition.onresult via sendLineRef
    const sendLineRef = useRef(null);
    sendLineRef.current = (text) => {
        if (!text?.trim()) return;

        const myName = nameRef.current
            || localPartRef.current?.name
            || "Participant";

        const line = {
            type: "tx",
            name: myName,
            text: text.trim(),
            time: new Date().toLocaleTimeString("en-IN", {
                hour: "2-digit", minute: "2-digit",
            }),
        };

        // Add to MY transcript immediately (I don't receive my own publishData)
        setTranscript(prev => [...prev, line]);

        // Publish to everyone else
        const lp = localPartRef.current;
        if (lp) {
            const payload = new TextEncoder().encode(JSON.stringify(line));
            lp.publishData(payload, {
                reliable: true,
                topic: TOPIC,
            }).catch(e => console.warn("publishData error:", e));
        }
    };

    // ── SpeechRecognition: created ONCE, never recreated ─────────────────────
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
        // hi-IN = Google's Indian language model
        // Recognises: Hindi, English, Hinglish, Odia — auto-detected per utterance
        r.lang = "hi-IN";

        r.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    // Always call via ref — never stale
                    sendLineRef.current?.(event.results[i][0].transcript);
                }
            }
        };

        r.onend = () => {
            runningRef.current = false;
            if (shouldRunRef.current) {
                // Recognition timed out from silence — restart it
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
            // "no-speech", "network", "audio-capture" → onend fires next → auto-restart
        };

        recognitionRef.current = r;

        return () => {
            shouldRunRef.current = false;
            runningRef.current = false;
            try { r.abort(); } catch (e) { }
            recognitionRef.current = null;
        };
    }, []); // EMPTY — recognition created once, lives for the whole meeting

    // ── Mic mute polling: checks every 500ms via refs ─────────────────────────
    useEffect(() => {
        const tick = () => {
            const lp = localPartRef.current;
            if (!lp || !recognitionRef.current) return;

            // Read mute state directly from LiveKit SDK
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
                        console.warn("recognition.start() failed:", e.message);
                    }
                }
            } else if (muted && shouldRunRef.current) {
                // Mic just muted → stop recognition
                shouldRunRef.current = false;
                try { recognitionRef.current.stop(); } catch (e) { }
                setIsTranscribing(false);
            }
        };

        const interval = setInterval(tick, 500);
        tick(); // immediate check on mount

        return () => clearInterval(interval);
    }, []); // EMPTY — poll runs for lifetime of component, reads via refs

    return {
        transcript,
        isTranscribing,
        speechSupported,
        clearTranscript: () => setTranscript([]),
    };
}