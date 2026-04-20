"use client";
/**
 * IncomingCallToast.jsx
 * Mounted in CoworkingShell. When call_incoming fires → shows a floating card.
 * Answer → navigate to /coworking/audio-call/[convId]
 * Decline → emit call_reject
 * Uses createPortal so it always renders above everything.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getCoworkSocket } from "../../../lib/coworkSocket";

function initials(name = "") {
    return name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || "").join("").slice(0, 2) || "?";
}
function avColor(name = "") {
    const C = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return C[h % C.length];
}

export default function IncomingCallToast({ employeeId }) {
    const router = useRouter();
    const [call, setCall] = useState(null); // { fromEmployeeId, fromName, convId }
    const [callerPic, setCallerPic] = useState("");
    const [mounted, setMounted] = useState(false);
    const callRef = useRef(null);
    const ringtoneRef = useRef({});
    const timeoutRef = useRef(null);

    useEffect(() => { setMounted(true); }, []);

    // ── Ringtone ────────────────────────────────────────────────────────────────
    const playRingtone = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            ringtoneRef.current.ctx = ctx;
            let i = 0;
            const ring = () => {
                const osc = ctx.createOscillator(), gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.frequency.value = 440;
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
                osc.start(); osc.stop(ctx.currentTime + 0.4);
                i++; if (i < 20) ringtoneRef.current.timer = setTimeout(ring, 1200);
            };
            ring();
        } catch (_) { }
    };
    const stopRingtone = () => clearTimeout(ringtoneRef.current.timer);

    const dismiss = () => { stopRingtone(); setCall(null); callRef.current = null; clearTimeout(timeoutRef.current); };

    // ── Socket ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!employeeId) return;
        const socket = getCoworkSocket(employeeId);

        const onIncoming = ({ fromEmployeeId, fromName, convId }) => {
            if (callRef.current) {
                // already in a call — auto reject
                socket.emit("call_reject", { toEmployeeId: fromEmployeeId, fromEmployeeId: employeeId, convId });
                return;
            }
            const info = { fromEmployeeId, fromName: fromName || fromEmployeeId, convId };
            callRef.current = info;
            setCall(info);
            playRingtone();
            // Fetch caller's profile pic asynchronously
            (async () => {
                try {
                    const { firebaseDb } = await import("../../../lib/coworkFirebase");
                    const { doc, getDoc } = await import("firebase/firestore");
                    const snap = await getDoc(doc(firebaseDb, "cowork_employees", fromEmployeeId));
                    if (snap.exists()) setCallerPic(snap.data().profilePicUrl || "");
                } catch (_) { }
            })();
            // Auto-dismiss after 30s (missed call)
            timeoutRef.current = setTimeout(() => dismiss(), 30000);
        };

        const onEnded = () => dismiss();

        socket.on("call_incoming", onIncoming);
        socket.on("call_ended", onEnded);
        return () => {
            socket.off("call_incoming", onIncoming);
            socket.off("call_ended", onEnded);
        };
    }, [employeeId]); // eslint-disable-line

    const handleAnswer = () => {
        if (!call) return;
        const socket = getCoworkSocket(employeeId);
        socket.emit("call_answer", { toEmployeeId: call.fromEmployeeId, fromEmployeeId: employeeId, convId: call.convId });
        dismiss();
        router.push(`/coworking/audio-call/${call.convId}`);
    };

    const handleDecline = () => {
        if (!call) return;
        const socket = getCoworkSocket(employeeId);
        socket.emit("call_reject", { toEmployeeId: call.fromEmployeeId, fromEmployeeId: employeeId, convId: call.convId });
        dismiss();
    };

    if (!mounted || !call) return null;

    const bg = avColor(call.fromName);
    const ini = initials(call.fromName);

    return createPortal(
        <div style={s.toast}>
            {/* Pulse ring behind avatar */}
            <div style={s.pulse} />

            {/* Avatar */}
            {callerPic
                ? <img src={callerPic} alt={call.fromName} style={{ ...s.avatar, objectFit: "cover", background: "transparent" }} />
                : <div style={{ ...s.avatar, background: bg }}>{ini}</div>
            }

            {/* Info */}
            <div style={s.info}>
                <div style={s.label}>Incoming audio call</div>
                <div style={s.name}>{call.fromName}</div>
            </div>

            {/* Decline */}
            <button onClick={handleDecline} style={{ ...s.btn, background: "#EF4444" }} title="Decline">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c1.12.43 2.33.67 3.53.67a2 2 0 012 2v3a2 2 0 01-2 2 19.79 19.79 0 01-8.63-3.07A19.42 19.42 0 013.07 8.63 19.79 19.79 0 01.1 4.02 2 2 0 012.1 2H5a2 2 0 012 1.72c.14.96.37 1.9.7 2.81a2 2 0 01-.45 2.11L6.18 9.91" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
            </button>

            {/* Answer */}
            <button onClick={handleAnswer} style={{ ...s.btn, background: "#22C55E" }} title="Answer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63 19.79 19.79 0 01.1 4.02 2 2 0 012.08 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 9.91a16 16 0 006.18 6.18l1.48-1.48a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                </svg>
            </button>

            <style>{`
        @keyframes toastIn { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes ringPulse { 0%{transform:scale(1);opacity:0.5;} 100%{transform:scale(1.8);opacity:0;} }
      `}</style>
        </div>,
        document.body
    );
}

const s = {
    toast: {
        position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
        zIndex: 99999,
        display: "flex", alignItems: "center", gap: 12,
        background: "#1E293B", borderRadius: 16,
        padding: "12px 16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)",
        fontFamily: "'Google Sans', Roboto, sans-serif",
        minWidth: 280, maxWidth: "calc(100vw - 32px)",
        animation: "toastIn 0.25s ease",
    },
    pulse: {
        position: "absolute", left: 16, width: 40, height: 40,
        borderRadius: "50%", background: "#22C55E",
        animation: "ringPulse 1.4s ease-out infinite",
        opacity: 0.5,
    },
    avatar: {
        width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 15, fontWeight: 700, color: "#fff",
        position: "relative", zIndex: 1,
    },
    info: { flex: 1, minWidth: 0 },
    label: { fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2 },
    name: { fontSize: 14, fontWeight: 700, color: "#F1F5F9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    btn: {
        width: 40, height: 40, borderRadius: "50%", border: "none",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    },
};