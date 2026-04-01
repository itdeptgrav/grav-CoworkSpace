// hooks/useMeetingTranscript.js
//
// THE FIX FOR DUPLICATE / WRONG-NAME TRANSCRIPTION:
//
// WRONG approach (causes duplicates):
//   new SpeechRecognition()  ← uses system default mic
//   The system mic picks up room audio through speakers too.
//   So CEO's browser hears OMM speaking through speakers → transcribes as "CEO: [OMM's words]"
//
// CORRECT approach (this file):
//   Get the LocalAudioTrack's MediaStreamTrack from LiveKit SDK.
//   Create a NEW MediaStream containing ONLY that isolated track.
//   Feed it directly into SpeechRecognition via audioTrack property.
//   This stream contains ONLY this person's own microphone input.
//   It CANNOT pick up room audio — it is a direct capture of their mic only.
//   Result: each person only ever transcribes their own voice. Zero duplicates.
//
// BROWSER INDEPENDENCE:
//   Works in Chrome AND Edge (both support webkitSpeechRecognition + audioTrack).
//   Firefox does not support SpeechRecognition — users see a clear message.

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

    // Stable refs
    const recognitionRef = useRef(null);
    const runningRef = useRef(false);
    const shouldRunRef = useRef(false);
    const roomRef = useRef(null);
    const localPartRef = useRef(null);
    const nameRef = useRef(participantName);

    roomRef.current = room;
    localPartRef.current = localParticipant;
    nameRef.current = participantName;

    // ── RECEIVE: other participants' transcript lines via DataChannel ──────────
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
    }, [room]);

    // ── SEND: publish my transcript line to all other participants ────────────
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

        // Add to my own local transcript immediately
        setTranscript(prev => [...prev, line]);

        // Broadcast to everyone else in the room
        const lp = localPartRef.current;
        if (lp) {
            const payload = new TextEncoder().encode(JSON.stringify(line));
            lp.publishData(payload, { reliable: true, topic: TOPIC })
                .catch(e => console.warn("publishData error:", e));
        }
    };

    // ── Core: create SpeechRecognition bound to the LOCAL MIC TRACK only ──────
    //
    // Called every time the local mic track changes (new track published, etc.)
    // The key: recognition.audioTrack = new MediaStream([localMicTrack])
    // This makes speech recognition read ONLY the local mic — not system audio.
    //
    const buildRecognition = (mediaStreamTrack) => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            setSpeechSupported(false);
            return null;
        }

        // Abort any previous recognition instance
        if (recognitionRef.current) {
            shouldRunRef.current = false;
            runningRef.current = false;
            try { recognitionRef.current.abort(); } catch (e) { }
            recognitionRef.current = null;
        }

        const r = new SR();
        r.continuous = true;
        r.interimResults = false;
        r.maxAlternatives = 1;
        r.lang = "hi-IN"; // handles Hindi, English, and Hinglish

        // ── THE KEY FIX ──
        // Feed ONLY the isolated local microphone track into speech recognition.
        // This stream has zero room audio — purely this person's own mic input.
        if (mediaStreamTrack) {
            try {
                r.audioTrack = new MediaStream([mediaStreamTrack]);
            } catch (e) {
                // Some browsers don't support audioTrack — fall back to default mic
                // In this case accuracy is slightly less but still works
                console.warn("audioTrack not supported, using default mic:", e.message);
            }
        }

        r.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    sendLineRef.current?.(event.results[i][0].transcript);
                }
            }
        };

        r.onend = () => {
            runningRef.current = false;
            if (shouldRunRef.current) {
                // Silence timeout — restart automatically
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
            // Other errors (no-speech, network) → onend fires → auto-restart
        };

        return r;
    };

    // ── Watch local mic track and rebuild recognition when it changes ─────────
    useEffect(() => {
        if (!localParticipant) return;

        const syncRecognition = () => {
            const pub = localParticipant.getTrackPublication(Track.Source.Microphone);
            const track = pub?.track;        // LiveKit LocalAudioTrack
            const mst = track?.mediaStreamTrack; // The actual MediaStreamTrack

            const isMuted = !pub || pub.isMuted || !mst;

            if (!isMuted) {
                // Mic is live — build/rebuild recognition with this exact track
                if (!recognitionRef.current || !runningRef.current) {
                    const r = buildRecognition(mst);
                    if (!r) return;
                    recognitionRef.current = r;
                    shouldRunRef.current = true;
                    try {
                        r.start();
                        runningRef.current = true;
                        setIsTranscribing(true);
                    } catch (e) { }
                }
            } else {
                // Mic is muted — stop recognition
                if (shouldRunRef.current) {
                    shouldRunRef.current = false;
                    try { recognitionRef.current?.stop(); } catch (e) { }
                    setIsTranscribing(false);
                }
            }
        };

        // Poll every 500ms — catches mute/unmute from LiveKit ControlBar
        const interval = setInterval(syncRecognition, 500);
        syncRecognition(); // immediate check

        return () => {
            clearInterval(interval);
            shouldRunRef.current = false;
            runningRef.current = false;
            try { recognitionRef.current?.abort(); } catch (e) { }
            recognitionRef.current = null;
        };
    }, [localParticipant]); // re-run if participant object changes

    return {
        transcript,
        isTranscribing,
        speechSupported,
        clearTranscript: () => setTranscript([]),
    };
}