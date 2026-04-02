// hooks/useMeetingTranscript.js
//
// MERGED VERSION:
// - Firebase real-time persistence (save every line, load on mount, 24h TTL)
// - Panel stays mounted via CSS display:none (no data loss on hide/show)
// - Odia mode = en-IN recognition → prints English words (no Odia script issues)
// - Hindi mode = hi-IN (Hindi + English auto-detect)
// - English mode = en-IN

import { useEffect, useRef, useState, useCallback } from "react";
import { useRoomContext, useLocalParticipant } from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import { firebaseDb } from "../lib/coworkFirebase";
import {
    collection, doc, setDoc, getDocs, query, orderBy, serverTimestamp,
} from "firebase/firestore";

const TOPIC = "meeting-transcript";

// ── Language config ───────────────────────────────────────────────────────────
export const SUPPORTED_LANGS = {
    HINDI: { code: "hi-IN", label: "हि/En", recognitionLang: "hi-IN", hint: "Hindi + English auto-detect" },
    ENGLISH: { code: "en-IN", label: "English", recognitionLang: "en-IN", hint: "English only" },
    ODIA: { code: "odia", label: "ଓଡ଼ିଆ", recognitionLang: "en-IN", hint: "Speak Odia — prints English words" },
};

// ── Firestore helpers ─────────────────────────────────────────────────────────

async function saveLineToFirestore(meetId, line) {
    if (!meetId || !line) return;
    try {
        const lineId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const deleteAtMs = Date.now() + 24 * 60 * 60 * 1000; // 24h TTL
        await setDoc(
            doc(firebaseDb, "meeting_transcripts", meetId, "lines", lineId),
            {
                lineId, meetId,
                name: line.name, text: line.text, time: line.time,
                language: line.language || "hi-IN",
                createdAt: serverTimestamp(),
                deleteAtMs,
            }
        );
        // Ensure parent doc exists with TTL
        await setDoc(
            doc(firebaseDb, "meeting_transcripts", meetId),
            { meetId, deleteAtMs, updatedAt: serverTimestamp() },
            { merge: true }
        );
    } catch (e) {
        console.warn("saveLineToFirestore:", e.message);
    }
}

async function loadLinesFromFirestore(meetId) {
    if (!meetId) return [];
    try {
        const snap = await getDocs(
            query(
                collection(firebaseDb, "meeting_transcripts", meetId, "lines"),
                orderBy("createdAt", "asc")
            )
        );
        return snap.docs.map(d => ({
            name: d.data().name,
            text: d.data().text,
            time: d.data().time,
            language: d.data().language || "hi-IN",
        }));
    } catch (e) {
        console.warn("loadLinesFromFirestore:", e.message);
        return [];
    }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useMeetingTranscript({ participantName, meetId }) {
    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();

    const [transcript, setTranscript] = useState([]);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(true);
    const [activeLang, setActiveLang] = useState(SUPPORTED_LANGS.HINDI.code);
    const [activeRecognitionLang, setActiveRecognitionLang] = useState(SUPPORTED_LANGS.HINDI.recognitionLang);

    // Refs — mirror state for use in callbacks without stale closures
    const transcriptRef = useRef([]);
    const recognitionRef = useRef(null);
    const runningRef = useRef(false);
    const micOnRef = useRef(false);
    const localPartRef = useRef(null);
    const nameRef = useRef(participantName);
    const activeLangRef = useRef(SUPPORTED_LANGS.HINDI.code);
    const activeRecognitionLangRef = useRef(SUPPORTED_LANGS.HINDI.recognitionLang);
    const meetIdRef = useRef(meetId);
    const loadedRef = useRef(false);

    // Keep refs fresh every render
    localPartRef.current = localParticipant;
    nameRef.current = participantName;
    activeLangRef.current = activeLang;
    activeRecognitionLangRef.current = activeRecognitionLang;
    meetIdRef.current = meetId;

    // ── Load existing lines from Firestore on first mount ─────────────────────
    useEffect(() => {
        if (!meetId || loadedRef.current) return;
        loadedRef.current = true;
        loadLinesFromFirestore(meetId).then(lines => {
            if (lines.length > 0) {
                transcriptRef.current = lines;
                setTranscript([...lines]);
            }
        });
    }, [meetId]);

    // ── Add line: update ref + state + save to Firestore ─────────────────────
    const addLine = useCallback((line) => {
        transcriptRef.current = [...transcriptRef.current, line];
        setTranscript([...transcriptRef.current]);
        saveLineToFirestore(meetIdRef.current, line);
    }, []);

    // ── Receive lines from other participants via DataChannel ─────────────────
    const onDataRef = useRef(null);
    onDataRef.current = (payload, participant, kind, topic) => {
        if (topic !== TOPIC) return;
        try {
            const data = JSON.parse(new TextDecoder().decode(payload));
            if (data.type === "tx") {
                addLine({ name: data.name, text: data.text, time: data.time, language: data.language });
            }
        } catch (e) { }
    };

    useEffect(() => {
        if (!room) return;
        const h = (...args) => onDataRef.current?.(...args);
        room.on(RoomEvent.DataReceived, h);
        return () => room.off(RoomEvent.DataReceived, h);
    }, [room]);

    // ── Send my own transcript line ───────────────────────────────────────────
    const sendLineRef = useRef(null);
    sendLineRef.current = (text) => {
        if (!text?.trim()) return;
        const myName = nameRef.current || localPartRef.current?.name || "Participant";
        const line = {
            type: "tx",
            name: myName,
            text: text.trim(),
            time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
            language: activeLangRef.current, // "hi-IN", "en-IN", or "odia"
        };
        // Add locally + persist
        addLine({ name: line.name, text: line.text, time: line.time, language: line.language });
        // Broadcast to others
        const lp = localPartRef.current;
        if (lp) {
            const payload = new TextEncoder().encode(JSON.stringify(line));
            lp.publishData(payload, { reliable: true, topic: TOPIC })
                .catch(e => console.warn("publishData:", e));
        }
    };

    // ── Build SpeechRecognition instance ─────────────────────────────────────
    const buildRecognition = useCallback((recognitionLangCode) => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { setSpeechSupported(false); return null; }

        const r = new SR();
        r.continuous = true;
        r.interimResults = false;
        r.maxAlternatives = 1;
        r.lang = recognitionLangCode;

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
            // Auto-restart if mic still ON — handles silence timeout, network blip
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
            }
            // "no-speech", "network", "aborted" → onend fires → auto-restart handles it
        };

        return r;
    }, []);

    // ── Start recognition ─────────────────────────────────────────────────────
    const startRecognition = useCallback((recognitionLangCode) => {
        if (recognitionRef.current) {
            runningRef.current = false;
            try { recognitionRef.current.abort(); } catch (e) { }
            recognitionRef.current = null;
        }
        const r = buildRecognition(recognitionLangCode);
        if (!r) return;
        recognitionRef.current = r;
        try { r.start(); runningRef.current = true; setIsTranscribing(true); }
        catch (e) { console.warn("recognition.start():", e.message); }
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

    // ── Watch mic mute every 500ms — runs in background regardless of sidebar ─
    useEffect(() => {
        if (!localParticipant) return;
        const checkMute = () => {
            const pub = localParticipant.getTrackPublication(Track.Source.Microphone);
            const muted = !pub || pub.isMuted;
            const was = micOnRef.current;
            micOnRef.current = !muted;
            if (!muted && !was) startRecognition(activeRecognitionLangRef.current);
            else if (muted && was) stopRecognition();
        };
        const interval = setInterval(checkMute, 500);
        checkMute();
        return () => { clearInterval(interval); micOnRef.current = false; stopRecognition(); };
    }, [localParticipant, startRecognition, stopRecognition]);

    // ── Switch language ───────────────────────────────────────────────────────
    const switchLanguage = useCallback((langCode) => {
        let recognitionLang;
        let displayLang = langCode;

        if (langCode === SUPPORTED_LANGS.HINDI.code) {
            recognitionLang = SUPPORTED_LANGS.HINDI.recognitionLang;   // "hi-IN"
        } else if (langCode === SUPPORTED_LANGS.ENGLISH.code) {
            recognitionLang = SUPPORTED_LANGS.ENGLISH.recognitionLang; // "en-IN"
        } else if (langCode === SUPPORTED_LANGS.ODIA.code) {
            // Odia = use en-IN recognition → prints English words of what user said
            // Simple, reliable, works in all browsers — no or-IN dependency
            recognitionLang = SUPPORTED_LANGS.ODIA.recognitionLang;    // "en-IN"
            displayLang = SUPPORTED_LANGS.ODIA.code;               // "odia"
        } else {
            console.warn(`Unknown lang ${langCode}, defaulting to Hindi`);
            recognitionLang = SUPPORTED_LANGS.HINDI.recognitionLang;
            displayLang = SUPPORTED_LANGS.HINDI.code;
        }

        setActiveLang(displayLang);
        setActiveRecognitionLang(recognitionLang);
        activeLangRef.current = displayLang;
        activeRecognitionLangRef.current = recognitionLang;

        if (micOnRef.current) startRecognition(recognitionLang);
    }, [startRecognition]);

    return {
        transcript,
        isTranscribing,
        speechSupported,
        activeLang,      // "hi-IN" | "en-IN" | "odia"
        switchLanguage,
        clearTranscript: () => { transcriptRef.current = []; setTranscript([]); },
    };
}