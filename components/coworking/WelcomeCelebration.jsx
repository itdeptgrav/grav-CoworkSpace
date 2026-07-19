"use client";
// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY FILE — safe to delete this file plus its one <WelcomeCelebration />
// usage elsewhere whenever this feature is no longer wanted. No other file
// depends on anything exported here.
//
// Fires every time a signed-in user is present (no longer gated to "once per
// login" — that check has been removed on purpose). Firework bursts use the
// Web Audio API to synthesize their own pop/crackle sound — no audio files,
// no libraries. Confetti + flower pieces fall together. All pure CSS/JS.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useRef } from "react";
import { firebaseAuth } from "../../lib/coworkFirebase";

const CONFETTI_COLORS = ["#F87171", "#FBBF24", "#34D399", "#60A5FA", "#A78BFA", "#F472B6"];
const FLOWERS = ["🌸", "🌺", "🌼", "🌻", "🌷"];
const FALLING_COUNT = 55;
const BURST_COUNT = 4;
const PARTICLES_PER_BURST = 18;

// A real firecracker crack is almost entirely noise — sharp, high-frequency,
// near-instant attack, very fast decay — not a pitched tone. A main crack
// plus 2 quick secondary snaps read as an authentic "crack-crackle" rather
// than one clean pop.
function scheduleCrackerPop(ctx, atTime) {
    const snaps = 3;
    for (let s = 0; s < snaps; s++) {
        const snapTime = atTime + s * (0.014 + Math.random() * 0.02);
        const bufferSize = Math.floor(ctx.sampleRate * 0.045);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            const decay = Math.pow(1 - i / bufferSize, 6);
            data[i] = (Math.random() * 2 - 1) * decay;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 2200 + Math.random() * 1800;
        filter.Q.value = 0.7;

        const gain = ctx.createGain();
        const vol = s === 0 ? 0.5 : 0.28;
        gain.gain.setValueAtTime(vol, snapTime);
        gain.gain.exponentialRampToValueAtTime(0.001, snapTime + 0.05);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(snapTime);
    }
}

export default function WelcomeCelebration() {
    const [show, setShow] = useState(false);
    const [name, setName] = useState("");
    const [bursts, setBursts] = useState([]);
    const firedRef = useRef(false);

    useEffect(() => {
        const unsub = firebaseAuth.onAuthStateChanged((user) => {
            if (!user || firedRef.current) return;
            firedRef.current = true;
            setName(user.displayName || "");
            setShow(true);

            setBursts(Array.from({ length: BURST_COUNT }, (_, i) => ({
                id: i,
                x: 15 + Math.random() * 70,
                y: 15 + Math.random() * 35,
                color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                delay: i * 0.35 + Math.random() * 0.1,
            })));

            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                const ctx = new AudioCtx();
                if (ctx.state === "suspended") ctx.resume().catch(() => { });
                for (let i = 0; i < BURST_COUNT; i++) {
                    scheduleCrackerPop(ctx, ctx.currentTime + i * 0.35 + Math.random() * 0.1);
                }
                setTimeout(() => ctx.close().catch(() => { }), 3000);
            } catch (e) { /* audio unavailable — visuals still run fine without it */ }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!show) return;
        const t = setTimeout(() => setShow(false), 4400);
        return () => clearTimeout(t);
    }, [show]);

    if (!show) return null;

    const fallingPieces = Array.from({ length: FALLING_COUNT }, (_, i) => {
        const isFlower = i % 4 === 0;
        return {
            id: i,
            isFlower,
            emoji: isFlower ? FLOWERS[i % FLOWERS.length] : null,
            left: Math.random() * 100,
            color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            delay: Math.random() * 1,
            duration: 2.8 + Math.random() * 1.8,
            size: isFlower ? 16 + Math.random() * 8 : 6 + Math.random() * 6,
            rotate: Math.random() * 360,
            round: Math.random() > 0.5,
        };
    });

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none", overflow: "hidden" }}>
            <style>{`
        @keyframes cowork-confetti-fall {
          0%   { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.4; }
        }
        @keyframes cowork-flower-fall {
          0%   { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          50%  { transform: translateY(50vh) rotate(180deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(360deg); opacity: 0.6; }
        }
        @keyframes cowork-burst-particle {
          0%   { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0.2); opacity: 0; }
        }
        @keyframes cowork-burst-flash {
          0%   { transform: scale(0); opacity: 0.9; }
          100% { transform: scale(3); opacity: 0; }
        }
        @keyframes cowork-welcome-pop {
          0%   { transform: scale(0.85); opacity: 0; }
          15%  { transform: scale(1); opacity: 1; }
          85%  { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.96); opacity: 0; }
        }
      `}</style>

            {bursts.map(b => {
                const particles = Array.from({ length: PARTICLES_PER_BURST }, (_, i) => {
                    const angle = (i / PARTICLES_PER_BURST) * 2 * Math.PI;
                    const distance = 70 + Math.random() * 50;
                    return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance };
                });
                return (
                    <div key={b.id} style={{ position: "absolute", left: `${b.x}%`, top: `${b.y}%` }}>
                        <div style={{
                            position: "absolute", width: 20, height: 20, marginLeft: -10, marginTop: -10,
                            borderRadius: "50%", background: b.color,
                            animation: `cowork-burst-flash 0.5s ease-out ${b.delay}s forwards`,
                        }} />
                        {particles.map((p, i) => (
                            <div key={i} style={{
                                position: "absolute", width: 6, height: 6, marginLeft: -3, marginTop: -3,
                                borderRadius: "50%", background: b.color,
                                animation: `cowork-burst-particle 0.9s ease-out ${b.delay}s forwards`,
                                "--dx": `${p.dx}px`, "--dy": `${p.dy}px`,
                            }} />
                        ))}
                    </div>
                );
            })}

            {fallingPieces.map(p => (
                <div key={p.id} style={{
                    position: "absolute", top: 0, left: `${p.left}%`,
                    width: p.isFlower ? undefined : p.size, height: p.isFlower ? undefined : p.size,
                    fontSize: p.isFlower ? p.size : undefined,
                    background: p.isFlower ? undefined : p.color,
                    borderRadius: p.isFlower ? undefined : (p.round ? "50%" : 2),
                    transform: p.isFlower ? undefined : `rotate(${p.rotate}deg)`,
                    animation: `${p.isFlower ? "cowork-flower-fall" : "cowork-confetti-fall"} ${p.duration}s ease-in ${p.delay}s forwards`,
                }}>
                    {p.isFlower ? p.emoji : null}
                </div>
            ))}

            <div style={{
                position: "absolute", top: "40%", left: "50%", transform: "translate(-50%, -50%)",
                textAlign: "center", animation: "cowork-welcome-pop 4.4s ease-in-out forwards",
            }}>
                <div style={{ fontSize: 44, marginBottom: 8 }}>🎉🎆</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#1F2937", fontFamily: "inherit" }}>
                    {name ? `Welcome back, ${name}!` : "Welcome back!"}
                </div>
            </div>
        </div>
    );
}