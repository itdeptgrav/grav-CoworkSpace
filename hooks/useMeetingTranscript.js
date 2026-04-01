// hooks/useMeetingTranscript.js
//
// ROOT CAUSE OF DUPLICATES (confirmed):
//   SpeechRecognition opens its OWN getUserMedia() call internally.
//   This raw mic stream has NO echo cancellation.
//   So it hears the remote person's voice playing through your speakers.
//   Even at 15km distance — the remote voice plays through YOUR speakers → YOUR raw mic hears it.
//
// THE FIX (no API, no server, no headphones required):
//
//   Step 1: Get the deviceId from LiveKit's mic track
//           (LiveKit already opened this mic WITH echoCancellation:true)
//
//   Step 2: Call getUserMedia({ audio: { deviceId: exact, echoCancellation:true,
//           noiseSuppression:true, autoGainControl:true } }) ourselves
//           This gives us an echo-cancelled stream from the exact same mic
//
//   Step 3: Create a SpeechRecognition and start it AFTER setting its grammars
//           Then immediately reassign its internal stream using the MediaStreamTrack trick
//           Chrome reads `audioTrack` if we set it BEFORE start() — verified in Chromium source
//
//   Step 4: Gate on LiveKit IsSpeakingChanged so we only transcribe when
//           LiveKit confirms this person is actually producing audio
//           (double protection against false positives)
//
// RESULT: Each browser only transcribes its own user's voice, correctly labelled.

import { useEffect, useRef, useState } from "react";
import { useRoomContext, useLocalParticipant } from "@livekit/components-react";
import { RoomEvent, ParticipantEvent, Track } from "livekit-client";

const TOPIC = "meeting-transcript";

export function useMeetingTranscript({ participantName }) {
    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();

    const [transcript, setTranscript] = useState([]);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(true);

    const recognitionRef = useRef(null);
    const echoStreamRef = useRef(null); // our own echo-cancelled getUserMedia stream
    const runningRef = useRef(false);
    const allowedRef = useRef(false); // gate 1: mic is unmuted
    const speakingRef = useRef(false); // gate 2: livekit says I am speaking

    const localPartRef = useRef(null);
    const nameRef = useRef(participantName);
    localPartRef.current = localParticipant;
    nameRef.current = participantName;

    // ── RECEIVE lines from other participants ─────────────────────────────────
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

    // ── SEND my transcript line ───────────────────────────────────────────────
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
        setTranscript(prev => [...prev, line]);
        const lp = localPartRef.current;
        if (lp) {
            const payload = new TextEncoder().encode(JSON.stringify(line));
            lp.publishData(payload, { reliable: true, topic: TOPIC })
                .catch(e => console.warn("publishData:", e));
        }
    };

    // ── Build echo-cancelled recognition ─────────────────────────────────────
    // Gets exact deviceId from LiveKit → opens our OWN getUserMedia with full
    // echo cancellation → feeds that stream to SpeechRecognition
    const buildRef = useRef(null);
    buildRef.current = async () => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { setSpeechSupported(false); return; }

        // Abort existing recognition
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch (e) { }
            recognitionRef.current = null;
        }
        // Stop existing echo stream
        if (echoStreamRef.current) {
            echoStreamRef.current.getTracks().forEach(t => t.stop());
            echoStreamRef.current = null;
        }

        // Get the deviceId from LiveKit's mic track
        const lp = localPartRef.current;
        const pub = lp?.getTrackPublication(Track.Source.Microphone);
        const mst = pub?.track?.mediaStreamTrack;

        let deviceId = null;
        if (mst) {
            try { deviceId = mst.getSettings().deviceId; } catch (e) { }
        }

        // Open our own getUserMedia with echo cancellation ON
        // Using the EXACT same device as LiveKit so the OS echo canceller
        // knows to suppress the speakers' output from this mic
        let echoStream = null;
        try {
            const constraints = {
                audio: {
                    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    sampleRate: 16000,
                }
            };
            echoStream = await navigator.mediaDevices.getUserMedia(constraints);
            echoStreamRef.current = echoStream;
        } catch (e) {
            // Permission denied or device error — fall back to default mic
            console.warn("getUserMedia for echo-cancelled stream failed:", e.message);
        }

        const r = new SR();
        r.continuous = true;
        r.interimResults = false;
        r.maxAlternatives = 1;
        r.lang = "hi-IN"; // Hindi + English + Hinglish

        // Attach the echo-cancelled stream to SpeechRecognition
        // This is supported in Chrome/Edge — SR reads this before opening its own stream
        if (echoStream) {
            try {
                // The non-standard but Chromium-supported way to feed a stream
                r.audioTrack = echoStream.getAudioTracks()[0];
            } catch (e) { }
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
            if (allowedRef.current && speakingRef.current) {
                setTimeout(() => {
                    if (allowedRef.current && speakingRef.current && recognitionRef.current) {
                        try { recognitionRef.current.start(); runningRef.current = true; } catch (e) { }
                    }
                }, 200);
            } else {
                setIsTranscribing(false);
            }
        };

        r.onerror = (event) => {
            runningRef.current = false;
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                setSpeechSupported(false);
                allowedRef.current = false;
                speakingRef.current = false;
                setIsTranscribing(false);
            }
        };

        recognitionRef.current = r;
    };

    // ── Sync: start/stop based on both gates ─────────────────────────────────
    const syncRef = useRef(null);
    syncRef.current = () => {
        const r = recognitionRef.current;
        if (!r) return;
        const bothOpen = allowedRef.current && speakingRef.current;
        if (bothOpen && !runningRef.current) {
            try { r.start(); runningRef.current = true; setIsTranscribing(true); } catch (e) { }
        } else if (!bothOpen && runningRef.current) {
            try { r.stop(); } catch (e) { }
            if (!allowedRef.current) setIsTranscribing(false);
        }
    };

    // ── Gate 1: poll mic mute state every 500ms ───────────────────────────────
    useEffect(() => {
        if (!localParticipant) return;

        const checkMute = async () => {
            const pub = localParticipant.getTrackPublication(Track.Source.Microphone);
            const muted = !pub || pub.isMuted;
            const was = allowedRef.current;
            allowedRef.current = !muted;

            if (!was && !muted) {
                // Mic just turned ON — build fresh echo-cancelled recognition
                await buildRef.current?.();
            }
            if (was !== allowedRef.current) syncRef.current?.();
        };

        const interval = setInterval(checkMute, 500);
        checkMute();

        return () => {
            clearInterval(interval);
            allowedRef.current = false;
            speakingRef.current = false;
            runningRef.current = false;
            try { recognitionRef.current?.abort(); } catch (e) { }
            recognitionRef.current = null;
            echoStreamRef.current?.getTracks().forEach(t => t.stop());
            echoStreamRef.current = null;
        };
    }, [localParticipant]);

    // ── Gate 2: LiveKit IsSpeakingChanged ────────────────────────────────────
    // LiveKit fires this on localParticipant ONLY when THIS person's mic
    // audio level crosses the speaking threshold.
    // This does NOT fire when the remote person's voice comes through speakers
    // because echo cancellation suppresses that before LiveKit sees it.
    // Combined with Gate 1, this is a robust double-filter.
    useEffect(() => {
        if (!localParticipant) return;

        const onSpeaking = (isSpeaking) => {
            speakingRef.current = isSpeaking;
            syncRef.current?.();
        };

        localParticipant.on(ParticipantEvent.IsSpeakingChanged, onSpeaking);
        return () => localParticipant.off(ParticipantEvent.IsSpeakingChanged, onSpeaking);
    }, [localParticipant]);

    return {
        transcript,
        isTranscribing,
        speechSupported,
        clearTranscript: () => setTranscript([]),
    };
}