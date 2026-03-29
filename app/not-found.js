"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  SUPABASE CONFIG  — free tier, broadcast only, zero DB
//  supabase.com → your project → Settings → API
// ─────────────────────────────────────────────────────────────────────────────

const SB_URL = "https://sboewkfepnmdlwydgoel.supabase.co"
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib2V3a2ZlcG5tZGx3eWRnb2VsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNzQ4NjEsImV4cCI6MjA4OTY1MDg2MX0.Sdx7RgU_BEaOUXB9FQOA4WT5dut0GQpZg6O_6WL6rtQ"
const SNAKE_CH = process.env.SUPABASE_SNAKE_CHANNEL || "snake404";
const PONG_CH = process.env.SUPABASE_PONG_CHANNEL || "pong404";

// ─────────────────────────────────────────────────────────────────────────────
//  SUPABASE REALTIME  (broadcast-only, no DB)
// ─────────────────────────────────────────────────────────────────────────────
function makeChannel(url, key, channelName, onMsg, selfId) {
    const wsUrl = url.replace(/^http/, "ws") + `/realtime/v1/websocket?apikey=${key}&vsn=1.0.0`;
    const topic = `realtime:${channelName}`;
    let ws, hb, joined = false;
    const q = [];
    const send = o => ws?.readyState === 1 && ws.send(JSON.stringify(o));
    const flush = () => { while (q.length) send(q.shift()); };
    const pub = (event, payload) => {
        const msg = { topic, event: "broadcast", payload: { type: "broadcast", event, payload: { ...payload, _from: selfId } }, ref: null };
        joined ? send(msg) : q.push(msg);
    };
    function connect() {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
            send({ topic, event: "phx_join", payload: { config: { broadcast: { self: false, ack: false } } }, ref: "j1" });
            hb = setInterval(() => send({ topic: "phoenix", event: "heartbeat", payload: {}, ref: "hb" }), 25000);
        };
        ws.onmessage = e => {
            try {
                const m = JSON.parse(e.data);
                if (m.ref === "j1" && m.event === "phx_reply") { joined = true; flush(); return; }
                if (m.event === "broadcast" && m.payload?.payload) {
                    const p = m.payload.payload;
                    if (p._from === selfId) return; // drop own echo
                    onMsg(m.payload.event, p);
                }
            } catch (_) { }
        };
        ws.onclose = () => { joined = false; clearInterval(hb); setTimeout(connect, 2000); };
        ws.onerror = () => ws.close();
    }
    connect();
    return { pub, close: () => { clearInterval(hb); ws?.close(); } };
}

// ─────────────────────────────────────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────────────────────────────────────
function isMobile() {
    if (typeof window === "undefined") return false;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 820;
}
const uid = () => Math.random().toString(36).slice(2, 9);
const ri = (a, b) => Math.floor(Math.random() * (b - a)) + a;

// ─────────────────────────────────────────────────────────────────────────────
//  SNAKE CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const COLS = 25, ROWS = 38, CELL = 17, TICK = 165, FOOD_N = 5, MAX_PL = 4;

const PC = [
    { fill: "#00E5FF", body: "#005F6B", name: "CYAN" },
    { fill: "#FF2D78", body: "#7A0030", name: "PINK" },
    { fill: "#FFE600", body: "#7A6E00", name: "YELLOW" },
    { fill: "#39FF14", body: "#156800", name: "GREEN" },
    { fill: "#FF6D00", body: "#7A2E00", name: "ORANGE" },
    { fill: "#BF5FFF", body: "#5800A8", name: "VIOLET" },
];
const EMOJI_Q = ["👋", "🔥", "💀", "😂", "👑", "😤", "🫡", "🎉", "❤️", "💯"];

// ─────────────────────────────────────────────────────────────────────────────
//  SPAWN HELPER — truly random, no two players overlap
// ─────────────────────────────────────────────────────────────────────────────
function randomSpawn(occupied) {
    // Quadrant-based: divide grid into 4 quadrants, pick one randomly per player
    const zones = [
        { xMin: 2, xMax: 10, yMin: 2, yMax: 14 },
        { xMin: 14, xMax: 22, yMin: 2, yMax: 14 },
        { xMin: 2, xMax: 10, yMin: 22, yMax: 34 },
        { xMin: 14, xMax: 22, yMin: 22, yMax: 34 },
    ];
    // Pick a random zone that isn't blocked
    const avail = [...zones];
    for (let attempt = 0; attempt < 60; attempt++) {
        const zi = ri(0, avail.length);
        const z = avail[zi];
        const x = ri(z.xMin, z.xMax);
        const y = ri(z.yMin, z.yMax);
        const key = `${x},${y}`;
        if (!occupied.has(key) && !occupied.has(`${x - 1},${y}`) && !occupied.has(`${x - 2},${y}`)) {
            return { x, y };
        }
    }
    // Fallback: random anywhere
    for (let attempt = 0; attempt < 200; attempt++) {
        const x = ri(2, COLS - 2), y = ri(2, ROWS - 2);
        if (!occupied.has(`${x},${y}`)) return { x, y };
    }
    return { x: ri(2, COLS - 2), y: ri(2, ROWS - 2) };
}

// ─────────────────────────────────────────────────────────────────────────────
//  FOOD GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
function genFood(snakes, existing = []) {
    const occ = new Set([
        ...Object.values(snakes).flatMap(s => s.body.map(c => `${c.x},${c.y}`)),
        ...existing.map(f => `${f.x},${f.y}`)
    ]);
    const food = [...existing];
    let tries = 0;
    while (food.length < FOOD_N && tries < 500) {
        tries++;
        const x = ri(1, COLS - 1), y = ri(1, ROWS - 1);
        if (!occ.has(`${x},${y}`)) { occ.add(`${x},${y}`); food.push({ x, y, id: Date.now() + food.length }); }
    }
    return food;
}

// ─────────────────────────────────────────────────────────────────────────────
//  BUILD GAME  (called by host, spawn positions embedded in playerMap)
// ─────────────────────────────────────────────────────────────────────────────
function buildGame(playerMap, myId) {
    const snakes = {};
    const occ = new Set();
    Object.values(playerMap).forEach(p => {
        const { x, y } = randomSpawn(occ);
        occ.add(`${x},${y}`); occ.add(`${x - 1},${y}`); occ.add(`${x - 2},${y}`);
        snakes[p.id] = {
            id: p.id, ci: p.ci, name: p.name,
            body: [{ x, y }, { x: x - 1, y }, { x: x - 2, y }],
            dir: { x: 1, y: 0 },
            alive: true, score: 0,
            isMe: p.id === myId,
        };
    });
    return { snakes, food: genFood(snakes), tick: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
//  SNAKE + CHAT GAME  (mobile — up to 4 players)
// ─────────────────────────────────────────────────────────────────────────────
function SnakeChatGame() {
    const cvs = useRef(null);
    const ch = useRef(null);
    const myId = useRef(uid());
    const myCI = useRef(ri(0, PC.length));

    // mutable game world
    const gRef = useRef(null);
    const dirRef = useRef({ x: 1, y: 0 });
    const nextDir = useRef({ x: 1, y: 0 });
    const hostIdRef = useRef(null); // who runs the tick

    // React state
    const [screen, setScreen] = useState("lobby");
    const screenRef = useRef("lobby");
    useEffect(() => { screenRef.current = screen; }, [screen]);

    const [chatLog, setChatLog] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [showChat, setShowChat] = useState(false);
    const showChatRef = useRef(false);
    useEffect(() => { showChatRef.current = showChat; }, [showChat]);
    const [unread, setUnread] = useState(0);

    const [myScore, setMyScore] = useState(0);
    const [endInfo, setEndInfo] = useState(null); // { won, name }
    const [countdown, setCountdown] = useState(null);
    const cdTimer = useRef(null);

    const [playerList, setPlayerList] = useState([]); // for lobby UI
    const registry = useRef({});  // { id → { id,ci,name,lastSeen } }

    const bubbles = useRef({});  // canvas chat bubbles
    const seenMsgs = useRef(new Set());
    const ackSent = useRef(new Set());

    // Play-again voting
    const votes = useRef(new Set());
    const soloTimer = useRef(null);
    const [waiting, setWaiting] = useState(false);
    const waitRef = useRef(false);
    useEffect(() => { waitRef.current = waiting; }, [waiting]);

    // ── Helpers ──────────────────────────────────────────────────────────────
    const me = () => myId.current;
    const myColor = PC[myCI.current];

    const touchReg = useCallback((p) => {
        if (!p?.id) return;
        registry.current[p.id] = { ...registry.current[p.id], ...p, lastSeen: Date.now() };
        setPlayerList(Object.values(registry.current).filter(r => r.id !== me()));
    }, []);

    const runCountdown = useCallback((n, onDone) => {
        if (cdTimer.current) clearInterval(cdTimer.current);
        setCountdown(n);
        cdTimer.current = setInterval(() => {
            n--;
            setCountdown(n);
            if (n <= 0) {
                clearInterval(cdTimer.current); cdTimer.current = null;
                setCountdown(null);
                screenRef.current = "game";
                onDone();
            }
        }, 1000);
    }, []);

    // ── addChat (fully stable, never recreated) ───────────────────────────────
    const addChat = useCallback((msg) => {
        if (msg.msgId) {
            if (seenMsgs.current.has(msg.msgId)) return;
            seenMsgs.current.add(msg.msgId);
            if (seenMsgs.current.size > 400) seenMsgs.current.delete(seenMsgs.current.values().next().value);
        }
        setChatLog(prev => [...prev.slice(-80), msg]);
        if (!showChatRef.current) setUnread(n => n + 1);
        if (msg.id) bubbles.current[msg.id] = { text: (msg.text || "").slice(0, 20), exp: Date.now() + 3800 };
        setTimeout(() => document.getElementById("chat-end")?.scrollIntoView({ behavior: "smooth" }), 40);
    }, []);

    // ── doStart: apply a received game state ──────────────────────────────────
    const doStart = useCallback((gameState, hostId, fromHostMsg) => {
        hostIdRef.current = hostId;
        dirRef.current = { x: 1, y: 0 };
        nextDir.current = { x: 1, y: 0 };
        votes.current.clear();
        setWaiting(false);
        setMyScore(0);
        setEndInfo(null);
        // Rebuild snakes with isMe flag based on local myId
        const fixedSnakes = {};
        Object.values(gameState.snakes).forEach(s => {
            fixedSnakes[s.id] = { ...s, isMe: s.id === me() };
        });
        gRef.current = { ...gameState, snakes: fixedSnakes };
        setScreen("countdown");
        // If this is a late-join (fromHostMsg = direct spawn), show countdown only to me
        runCountdown(3, () => setScreen("game"));
    }, [runCountdown]);

    // ── Message handler ───────────────────────────────────────────────────────
    const onMsg = useCallback((event, payload) => {
        switch (event) {

            case "hello": {
                touchReg({ id: payload.id, ci: payload.ci, name: payload.name });
                if (!ackSent.current.has(payload.id)) {
                    ackSent.current.add(payload.id);
                    ch.current?.pub("hello_ack", { id: me(), ci: myCI.current, name: PC[myCI.current].name });
                    // If I'm in a game, invite them to join
                    if (gRef.current && screenRef.current === "game") {
                        const snapshot = {
                            snakes: Object.values(gRef.current.snakes).map(s => ({
                                id: s.id, ci: s.ci, name: s.name,
                                body: s.body, dir: s.dir, alive: s.alive, score: s.score
                            })),
                            food: gRef.current.food,
                        };
                        ch.current?.pub("spawn_invite", {
                            targetId: payload.id,
                            hostId: hostIdRef.current,
                            snapshot,
                        });
                    }
                }
                break;
            }

            case "hello_ack":
                touchReg({ id: payload.id, ci: payload.ci, name: payload.name });
                break;

            case "start": {
                // Build game from host's playerMap (host already computed spawn positions)
                touchReg({ id: payload.hostId, ci: payload.hostCi, name: payload.hostName });
                // Reconstruct game exactly as host built it
                doStart(payload.game, payload.hostId, false);
                break;
            }

            case "spawn_invite": {
                // Host is inviting me to join their ongoing game
                if (payload.targetId !== me()) break;
                // Add myself to the snapshot
                const occ = new Set(
                    payload.snapshot.snakes.flatMap(s => s.body.map(c => `${c.x},${c.y}`))
                );
                const { x, y } = randomSpawn(occ);
                const mySnake = {
                    id: me(), ci: myCI.current, name: PC[myCI.current].name,
                    body: [{ x, y }, { x: x - 1, y }, { x: x - 2, y }],
                    dir: { x: 1, y: 0 }, alive: true, score: 0,
                };
                const snakes = {};
                payload.snapshot.snakes.forEach(s => { snakes[s.id] = s; });
                snakes[me()] = mySnake;
                const game = { snakes, food: payload.snapshot.food, tick: 0 };
                // Tell host I'm joining
                ch.current?.pub("joining", { id: me(), ci: myCI.current, name: PC[myCI.current].name, snake: mySnake });
                doStart(game, payload.hostId, true);
                break;
            }

            case "joining": {
                // Someone is joining my game mid-session
                const g = gRef.current; if (!g) break;
                if (!g.snakes[payload.id]) {
                    g.snakes[payload.id] = { ...payload.snake, isMe: false };
                    touchReg({ id: payload.id, ci: payload.ci, name: payload.name });
                }
                break;
            }

            case "move": {
                const g = gRef.current; if (!g) break;
                const s = g.snakes[payload.id];
                if (s && !s.isMe) s.dir = payload.dir;
                break;
            }

            case "state": {
                // Only accept from current host
                if (payload.hostId !== hostIdRef.current) break;
                const g = gRef.current; if (!g) break;
                payload.snakes.forEach(rs => {
                    const ls = g.snakes[rs.id];
                    if (!ls) {
                        // New snake joined
                        g.snakes[rs.id] = { ...rs, isMe: rs.id === me() };
                        return;
                    }
                    if (ls.isMe) {
                        // Only update score and alive from host — not position (we predict)
                        ls.score = rs.score;
                        if (!rs.alive && ls.alive) ls.alive = false;
                    } else {
                        ls.body = rs.body;
                        ls.alive = rs.alive;
                        ls.score = rs.score;
                        ls.dir = rs.dir;
                    }
                });
                g.food = payload.food;
                break;
            }

            case "died": {
                const g = gRef.current; if (!g) break;
                if (g.snakes[payload.id]) g.snakes[payload.id].alive = false;
                if (payload.id === me()) {
                    setEndInfo({ won: false, name: null });
                    setScreen("end");
                }
                break;
            }

            case "won": {
                const g = gRef.current;
                if (g) g.running = false;
                setEndInfo({
                    won: payload.winnerId === me(),
                    name: payload.winnerName,
                });
                setScreen("end");
                break;
            }

            case "chat": {
                addChat({
                    msgId: payload.msgId,
                    id: payload.id,
                    name: payload.name,
                    color: PC[payload.ci]?.fill || "#fff",
                    text: payload.text,
                    ts: payload.ts,
                    isMe: false,
                });
                break;
            }

            case "play_again_vote": {
                votes.current.add(payload.id);
                if (!waitRef.current) break;
                const others = Object.keys(registry.current).filter(id => id !== me());
                const allVoted = others.every(id => votes.current.has(id));
                if (allVoted) {
                    if (soloTimer.current) { clearTimeout(soloTimer.current); soloTimer.current = null; }
                    // I'm the one who triggered waiting — if all voted, broadcast restart
                    const pm = {};
                    Object.values(registry.current).forEach(r => { pm[r.id] = r; });
                    startNewGame(pm);
                }
                break;
            }

            case "restart": {
                doStart(payload.game, payload.hostId, false);
                break;
            }
        }
    }, [touchReg, addChat, doStart]);

    // ── startNewGame: build and broadcast ────────────────────────────────────
    const startNewGame = useCallback((playerMap) => {
        if (soloTimer.current) { clearTimeout(soloTimer.current); soloTimer.current = null; }
        votes.current.clear();
        setWaiting(false);
        const game = buildGame(playerMap, me());
        gRef.current = { ...game };
        hostIdRef.current = me();
        ch.current?.pub("start", {
            game,
            hostId: me(),
            hostCi: myCI.current,
            hostName: PC[myCI.current].name,
        });
        setMyScore(0); setEndInfo(null);
        setScreen("countdown");
        runCountdown(3, () => setScreen("game"));
    }, [runCountdown]);

    // ── Connect ───────────────────────────────────────────────────────────────
    useEffect(() => {
        const id = me(), ci = myCI.current, name = PC[ci].name;
        registry.current[id] = { id, ci, name, lastSeen: Date.now() };

        const channel = makeChannel(SB_URL, SB_KEY, SNAKE_CH, onMsg, id);
        ch.current = channel;

        // Announce immediately (queue handles timing)
        let n = 0;
        const ann = setInterval(() => {
            channel.pub("hello", { id, ci, name });
            if (++n >= 5) clearInterval(ann);
        }, 300);

        // Lighter heartbeat — just presence, not a storm
        const hb = setInterval(() => {
            channel.pub("hello", { id, ci, name });
            // Prune stale players
            const now = Date.now();
            let changed = false;
            Object.keys(registry.current).forEach(rid => {
                if (rid !== id && now - registry.current[rid].lastSeen > 12000) {
                    delete registry.current[rid];
                    if (gRef.current?.snakes[rid]) gRef.current.snakes[rid].alive = false;
                    changed = true;
                }
            });
            // Reset ack set periodically so reconnecting players get re-acked
            if (n % 8 === 0) ackSent.current.clear();
            if (changed) setPlayerList(Object.values(registry.current).filter(r => r.id !== id));
        }, 5000);

        return () => { channel.close(); clearInterval(ann); clearInterval(hb); if (cdTimer.current) clearInterval(cdTimer.current); };
    }, [onMsg]);

    // ── Swipe ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (screen !== "game") return;
        let tx = 0, ty = 0;
        const ts = e => {
            if (e.target.closest?.(".chat-panel")) return;
            tx = e.touches[0].clientX; ty = e.touches[0].clientY;
        };
        const te = e => {
            if (e.target.closest?.(".chat-panel")) return;
            const dx = e.changedTouches[0].clientX - tx;
            const dy = e.changedTouches[0].clientY - ty;
            if (Math.hypot(dx, dy) < 8) return;
            const cur = dirRef.current; let nd;
            if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > 0 && cur.x !== -1) nd = { x: 1, y: 0 };
                else if (dx < 0 && cur.x !== 1) nd = { x: -1, y: 0 };
            } else {
                if (dy > 0 && cur.y !== -1) nd = { x: 0, y: 1 };
                else if (dy < 0 && cur.y !== 1) nd = { x: 0, y: -1 };
            }
            if (nd) { nextDir.current = nd; ch.current?.pub("move", { id: me(), dir: nd }); }
        };
        addEventListener("touchstart", ts, { passive: true });
        addEventListener("touchend", te, { passive: true });
        return () => { removeEventListener("touchstart", ts); removeEventListener("touchend", te); };
    }, [screen]);

    // ── Send chat ─────────────────────────────────────────────────────────────
    const sendChat = useCallback((txt) => {
        const text = (txt || "").trim(); if (!text) return;
        const id = me(), ci = myCI.current;
        const msgId = `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const msg = { msgId, id, name: PC[ci].name, color: PC[ci].fill, text, ts: Date.now(), isMe: true };
        addChat(msg); // addChat registers msgId in seenMsgs before broadcast
        ch.current?.pub("chat", { msgId, id, ci, name: PC[ci].name, text, ts: Date.now() });
        setChatInput("");
    }, [addChat]);

    // ── Play again ────────────────────────────────────────────────────────────
    const handlePlayAgain = useCallback(() => {
        votes.current.add(me());
        const others = Object.keys(registry.current).filter(id => id !== me());
        if (others.length === 0) {
            // Solo — restart immediately
            const pm = { [me()]: registry.current[me()] };
            startNewGame(pm);
            return;
        }
        ch.current?.pub("play_again_vote", { id: me() });
        const allVoted = others.every(id => votes.current.has(id));
        if (allVoted) {
            const pm = {};
            Object.values(registry.current).forEach(r => { pm[r.id] = r; });
            startNewGame(pm);
        } else {
            setWaiting(true);
            if (soloTimer.current) clearTimeout(soloTimer.current);
            soloTimer.current = setTimeout(() => {
                setWaiting(false);
                const pm = { [me()]: registry.current[me()] };
                startNewGame(pm);
            }, 10000);
        }
    }, [startNewGame]);

    // ── Game loop ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = cvs.current; if (!canvas) return;
        const ctx = canvas.getContext("2d");
        let fid, lastTick = 0;
        const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
        resize(); addEventListener("resize", resize);
        const GW = COLS * CELL, GH = ROWS * CELL;
        const isHost = () => hostIdRef.current === me();

        const loop = ts => {
            fid = requestAnimationFrame(loop);
            const g = gRef.current;
            const W = canvas.width, H = canvas.height;
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = "#07071a"; ctx.fillRect(0, 0, W, H);

            const ox = Math.floor((W - GW) / 2);
            const oy = Math.floor((H - GH) / 2 - 18);

            // Grid
            ctx.fillStyle = "#0c0c22"; ctx.fillRect(ox, oy, GW, GH);
            ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 0.5;
            for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(ox + c * CELL, oy); ctx.lineTo(ox + c * CELL, oy + GH); ctx.stroke(); }
            for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(ox, oy + r * CELL); ctx.lineTo(ox + GW, oy + r * CELL); ctx.stroke(); }
            ctx.strokeStyle = "rgba(0,229,255,0.22)"; ctx.lineWidth = 2;
            ctx.shadowColor = "#00E5FF"; ctx.shadowBlur = 12;
            ctx.strokeRect(ox, oy, GW, GH); ctx.shadowBlur = 0;

            if (!g) {
                ctx.fillStyle = "rgba(255,255,255,0.07)";
                ctx.font = `bold ${CELL * 5}px 'Courier New',monospace`;
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText("404", ox + GW / 2, oy + GH / 2); return;
            }

            // ── TICK ──
            const sn = screenRef.current;
            if (sn === "game" && ts - lastTick > TICK) {
                lastTick = ts;
                g.tick++;

                // Apply my direction
                dirRef.current = nextDir.current;
                const mySnake = g.snakes[me()];
                if (mySnake?.alive) mySnake.dir = dirRef.current;

                if (isHost()) {
                    // HOST runs authoritative physics
                    const died = [];
                    Object.values(g.snakes).forEach(snake => {
                        if (!snake.alive) return;
                        const h = snake.body[0];
                        const nx = ((h.x + snake.dir.x) + COLS) % COLS;
                        const ny = ((h.y + snake.dir.y) + ROWS) % ROWS;
                        // Self collision
                        if (snake.body.slice(1).some(s => s.x === nx && s.y === ny)) {
                            snake.alive = false; died.push(snake.id);
                            if (snake.isMe) { setEndInfo({ won: false, name: null }); setScreen("end"); }
                            return;
                        }
                        // Food
                        const fi = g.food.findIndex(f => f.x === nx && f.y === ny);
                        if (fi >= 0) {
                            snake.body = [{ x: nx, y: ny }, ...snake.body];
                            snake.score++;
                            if (snake.isMe) setMyScore(snake.score);
                            g.food.splice(fi, 1);
                            g.food = genFood(g.snakes, g.food);
                        } else {
                            snake.body = [{ x: nx, y: ny }, ...snake.body.slice(0, -1)];
                        }
                    });

                    // Cross-collision
                    const bmap = new Map();
                    Object.values(g.snakes).filter(s => s.alive).forEach(snake => {
                        snake.body.forEach(seg => {
                            const k = `${seg.x},${seg.y}`;
                            if (!bmap.has(k)) bmap.set(k, []);
                            bmap.get(k).push(snake);
                        });
                    });
                    Object.values(g.snakes).filter(s => s.alive).forEach(snake => {
                        const h = snake.body[0];
                        const hits = bmap.get(`${h.x},${h.y}`) || [];
                        hits.forEach(other => {
                            if (other.id !== snake.id) {
                                snake.alive = false; died.push(snake.id);
                                other.score += Math.max(1, Math.floor(snake.body.length / 3));
                                if (other.isMe) setMyScore(other.score);
                                if (snake.isMe) { setEndInfo({ won: false, name: null }); setScreen("end"); }
                            }
                        });
                    });

                    died.forEach(id => ch.current?.pub("died", { id }));

                    // Win check
                    const alive = Object.values(g.snakes).filter(s => s.alive);
                    if (Object.keys(g.snakes).length > 1 && alive.length <= 1) {
                        const w = alive[0];
                        const winnerId = w?.id || null;
                        const winnerName = w ? PC[w.ci]?.name || "???" : "DRAW";
                        ch.current?.pub("won", { winnerId, winnerName });
                        setEndInfo({ won: winnerId === me(), name: winnerName });
                        setScreen("end");
                        g.running = false;
                    }

                    // Broadcast state
                    ch.current?.pub("state", {
                        hostId: me(),
                        snakes: Object.values(g.snakes).map(s => ({ id: s.id, body: s.body, alive: s.alive, score: s.score, dir: s.dir })),
                        food: g.food,
                    });
                } else {
                    // NON-HOST: predict own snake only
                    const mySnake = g.snakes[me()];
                    if (mySnake?.alive) {
                        const h = mySnake.body[0];
                        const nx = ((h.x + mySnake.dir.x) + COLS) % COLS;
                        const ny = ((h.y + mySnake.dir.y) + ROWS) % ROWS;
                        if (mySnake.body.slice(1).some(s => s.x === nx && s.y === ny)) {
                            mySnake.alive = false;
                            ch.current?.pub("died", { id: me() });
                            setEndInfo({ won: false, name: null }); setScreen("end");
                        } else {
                            const onFood = g.food.some(f => f.x === nx && f.y === ny);
                            if (onFood) {
                                mySnake.body = [{ x: nx, y: ny }, ...mySnake.body];
                                mySnake.score++; setMyScore(mySnake.score);
                            } else {
                                mySnake.body = [{ x: nx, y: ny }, ...mySnake.body.slice(0, -1)];
                            }
                        }
                    }
                }
            }

            // ── DRAW FOOD ──
            g.food.forEach(f => {
                const p = 1 + Math.sin(Date.now() * 0.005 + f.id * 1.3) * 0.15;
                ctx.save(); ctx.fillStyle = "#FF4444"; ctx.shadowColor = "#FF2020"; ctx.shadowBlur = 10;
                ctx.beginPath(); ctx.arc(ox + f.x * CELL + CELL / 2, oy + f.y * CELL + CELL / 2, (CELL / 2 - 2) * p, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0; ctx.restore();
            });

            // ── DRAW SNAKES ──
            Object.values(g.snakes).forEach(snake => {
                const col = PC[snake.ci]; if (!col) return;
                snake.body.forEach((seg, i) => {
                    const isH = i === 0;
                    const alpha = snake.alive ? (isH ? 1 : Math.max(0.18, 1 - i * 0.017)) : 0.12;
                    const sz = isH ? CELL - 1 : CELL - 2, off = isH ? 0.5 : 1;
                    ctx.save(); ctx.globalAlpha = alpha;
                    if (isH && snake.isMe) { ctx.shadowColor = col.fill; ctx.shadowBlur = 18; }
                    ctx.fillStyle = isH ? col.fill : col.body;
                    ctx.beginPath(); ctx.roundRect(ox + seg.x * CELL + off, oy + seg.y * CELL + off, sz, sz, isH ? 5 : 3); ctx.fill();
                    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
                    if (isH && snake.alive) {
                        const hx = ox + seg.x * CELL + CELL / 2, hy = oy + seg.y * CELL + CELL / 2, d = snake.dir;
                        ctx.fillStyle = "#000";
                        ctx.beginPath(); ctx.arc(hx + d.x * 4 + d.y * 3, hy + d.y * 4 - d.x * 3, 1.8, 0, Math.PI * 2); ctx.fill();
                        ctx.beginPath(); ctx.arc(hx + d.x * 4 - d.y * 3, hy + d.y * 4 + d.x * 3, 1.8, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.restore();
                });
                if (snake.body.length && snake.alive) {
                    const h = snake.body[0];
                    const hx = ox + h.x * CELL + CELL / 2, hy = oy + h.y * CELL - 5;
                    ctx.save(); ctx.textAlign = "center"; ctx.font = `bold ${snake.isMe ? 10 : 9}px 'Courier New',monospace`;
                    ctx.fillStyle = snake.isMe ? col.fill : "rgba(255,255,255,0.5)";
                    ctx.shadowColor = col.fill; ctx.shadowBlur = snake.isMe ? 8 : 3;
                    ctx.fillText(snake.isMe ? "YOU" : col.name, hx, hy); ctx.shadowBlur = 0; ctx.restore();
                }
                const bub = bubbles.current[snake.id];
                if (bub && snake.body.length && Date.now() < bub.exp) {
                    const h = snake.body[0];
                    const hx = ox + h.x * CELL + CELL / 2, hy = oy + h.y * CELL;
                    const fade = Math.min(1, (bub.exp - Date.now()) / 600);
                    ctx.save(); ctx.globalAlpha = fade;
                    ctx.font = "bold 11px 'Courier New',monospace"; ctx.textAlign = "center";
                    const tw = ctx.measureText(bub.text).width;
                    ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.beginPath();
                    ctx.roundRect(hx - tw / 2 - 7, hy - 38, tw + 14, 22, 5); ctx.fill();
                    ctx.strokeStyle = col.fill; ctx.lineWidth = 1; ctx.stroke();
                    ctx.fillStyle = "#fff"; ctx.fillText(bub.text, hx, hy - 23);
                    ctx.globalAlpha = 1; ctx.restore();
                }
            });

            // Scoreboard
            if (sn === "game") {
                const sorted = Object.values(g.snakes).filter(s => s.alive).sort((a, b) => b.score - a.score).slice(0, 4);
                ctx.save();
                sorted.forEach((s, i) => {
                    ctx.font = `bold ${s.isMe ? 10 : 9}px 'Courier New',monospace`; ctx.textAlign = "left";
                    ctx.fillStyle = s.isMe ? PC[s.ci].fill : "rgba(255,255,255,0.35)";
                    ctx.shadowColor = PC[s.ci].fill; ctx.shadowBlur = s.isMe ? 6 : 0;
                    ctx.fillText(`${s.isMe ? "▶ " : ""}${PC[s.ci].name} ${s.score}`, ox + 6, oy + 13 + i * 13);
                }); ctx.shadowBlur = 0; ctx.restore();
            }
        };
        fid = requestAnimationFrame(loop);
        return () => { cancelAnimationFrame(fid); removeEventListener("resize", resize); };
    }, []);

    // ── RENDER ────────────────────────────────────────────────────────────────
    const navLinks = (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
            <Link href="/" style={{ padding: "8px 16px", borderRadius: 7, fontSize: 10, fontWeight: 700, textDecoration: "none", background: "rgba(255,255,255,.9)", color: "#111", fontFamily: "'Courier New',monospace" }}>← Home</Link>
            <Link href="/dashboard" style={{ padding: "8px 16px", borderRadius: 7, fontSize: 10, fontWeight: 700, textDecoration: "none", background: "transparent", color: "rgba(255,255,255,.4)", border: "1px solid rgba(255,255,255,.12)", fontFamily: "'Courier New',monospace" }}>Dashboard →</Link>
        </div>
    );

    const GS = `
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{width:100%;height:100%;overflow:hidden;background:#07071a;font-family:'Space Mono','Courier New',monospace}
        @keyframes popIn{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}
        @keyframes cdpop{from{opacity:0;transform:scale(1.7)}to{opacity:1;transform:scale(1)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes msgIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:3px}
    `;

    if (screen === "lobby") return (
        <>
            <style>{GS}</style>
            <canvas ref={cvs} style={{ position: "fixed", inset: 0, zIndex: 0, touchAction: "none" }} />
            <div style={{ position: "fixed", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                <div style={{ background: "rgba(5,5,20,.97)", border: `1.5px solid ${myColor.fill}33`, borderRadius: 22, padding: "26px 22px", width: "100%", maxWidth: 310, animation: "popIn .22s ease-out", boxShadow: `0 0 50px ${myColor.fill}0a` }}>
                    <p style={{ fontSize: 9, color: "rgba(255,255,255,.2)", letterSpacing: ".2em", textTransform: "uppercase", textAlign: "center", marginBottom: 10 }}>⚠ Error 404</p>
                    <h2 style={{ fontSize: 19, fontWeight: 700, color: "#fff", textAlign: "center", marginBottom: 6 }}>🐍 Snake + Chat</h2>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,.35)", textAlign: "center", lineHeight: 1.65, marginBottom: 16 }}>
                        Swipe to steer · eat 🔴 to grow<br />
                        Crash others to score · <strong style={{ color: "rgba(255,255,255,.6)" }}>chat live</strong>
                    </p>
                    <div style={{ background: `${myColor.fill}10`, border: `1px solid ${myColor.fill}44`, borderRadius: 12, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, background: myColor.fill, boxShadow: `0 0 12px ${myColor.fill}`, flexShrink: 0 }} />
                        <div>
                            <p style={{ fontSize: 11, fontWeight: 700, color: myColor.fill }}>You are {myColor.name}</p>
                            <p style={{ fontSize: 9, color: "rgba(255,255,255,.25)", marginTop: 2 }}>{playerList.length} others online{playerList.length >= MAX_PL - 1 ? " (full)" : ""}</p>
                        </div>
                    </div>
                    {playerList.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                            {playerList.map(p => (
                                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                    <span style={{ width: 10, height: 10, borderRadius: 3, background: PC[p.ci].fill, boxShadow: `0 0 8px ${PC[p.ci].fill}`, flexShrink: 0 }} />
                                    <span style={{ fontSize: 11, fontWeight: 700, color: PC[p.ci].fill }}>{PC[p.ci].name}</span>
                                    <span style={{ fontSize: 9, color: "rgba(255,255,255,.2)", marginLeft: "auto" }}>ready</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <button onClick={() => startNewGame({ ...Object.fromEntries(Object.entries(registry.current)), [me()]: registry.current[me()] })}
                        style={{ width: "100%", padding: "13px 0", borderRadius: 10, fontSize: 12, fontWeight: 700, letterSpacing: ".1em", border: "none", cursor: "pointer", background: "#fff", color: "#111", fontFamily: "inherit", marginBottom: 10 }}>
                        START {playerList.length > 0 ? `(${playerList.length + 1} players)` : "SOLO"}
                    </button>
                    {navLinks}
                </div>
            </div>
        </>
    );

    return (
        <>
            <style>{GS}</style>
            <canvas ref={cvs} style={{ position: "fixed", inset: 0, zIndex: 0, touchAction: "none" }} />

            {/* Countdown */}
            {countdown !== null && (
                <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)" }}>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,.5)", letterSpacing: ".22em", textTransform: "uppercase", marginBottom: 14, fontFamily: "'Courier New',monospace" }}>Get ready</p>
                    <div key={countdown} style={{ fontSize: 88, fontWeight: 700, color: "#fff", fontFamily: "'Courier New',monospace", textShadow: "0 0 60px rgba(255,255,255,.6)", animation: "cdpop .22s cubic-bezier(.17,.67,.3,1.3)" }}>{countdown || "GO!"}</div>
                </div>
            )}

            {/* Top HUD */}
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 10, pointerEvents: "none", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", border: "1px solid rgba(255,255,255,.1)", borderRadius: 100, fontSize: 8, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(255,255,255,.25)", background: "rgba(7,7,26,.85)", backdropFilter: "blur(8px)" }}>
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#E05050" }} />404 · Snake
                </span>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: myColor.fill, boxShadow: `0 0 6px ${myColor.fill}` }} />
                    {playerList.map(p => (
                        <span key={p.id} title={PC[p.ci].name} style={{ width: 8, height: 8, borderRadius: 3, background: PC[p.ci].fill, opacity: gRef.current?.snakes[p.id]?.alive === false ? 0.25 : 1 }} />
                    ))}
                </div>
            </div>

            {/* Swipe hint */}
            <div style={{ position: "fixed", bottom: showChat ? 312 : 80, left: 0, right: 0, zIndex: 10, textAlign: "center", pointerEvents: "none", transition: "bottom .3s" }}>
                <span style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.18)" }}>← Swipe · Eat 🔴 · Score: {myScore}</span>
            </div>

            {/* Chat toggle */}
            <button onClick={() => { setShowChat(v => !v); setUnread(0); }}
                style={{ position: "fixed", bottom: showChat ? 308 : 22, right: 18, zIndex: 20, width: 46, height: 46, borderRadius: "50%", border: `2px solid ${myColor.fill}`, background: showChat ? "rgba(0,0,0,.85)" : "rgba(5,5,20,.92)", color: myColor.fill, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .25s", boxShadow: `0 0 18px ${myColor.fill}44`, backdropFilter: "blur(10px)", fontFamily: "inherit", flexShrink: 0 }}>
                {showChat ? "✕" : "💬"}
                {unread > 0 && !showChat && <span style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: "50%", background: "#FF2D78", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{unread}</span>}
            </button>

            {/* Chat panel */}
            {showChat && (
                <div className="chat-panel" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 15, height: 300, background: "rgba(4,4,16,.97)", borderTop: "1px solid rgba(255,255,255,.1)", display: "flex", flexDirection: "column", backdropFilter: "blur(20px)", animation: "slideUp .2s ease-out" }}>
                    <div style={{ display: "flex", gap: 5, padding: "8px 12px 5px", borderBottom: "1px solid rgba(255,255,255,.06)", overflowX: "auto", flexShrink: 0 }}>
                        {EMOJI_Q.map(e => <button key={e} onClick={() => sendChat(e)} style={{ fontSize: 20, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "4px 8px", cursor: "pointer", flexShrink: 0, fontFamily: "inherit" }}>{e}</button>)}
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {chatLog.length === 0 && <p style={{ fontSize: 10, color: "rgba(255,255,255,.2)", textAlign: "center", marginTop: 20 }}>No messages · say hi 👋</p>}
                        {chatLog.map((msg, i) => (
                            <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", flexDirection: msg.isMe ? "row-reverse" : "row", animation: "msgIn .14s ease-out" }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: msg.color, flexShrink: 0, marginTop: 6, boxShadow: `0 0 6px ${msg.color}` }} />
                                <div style={{ maxWidth: "78%" }}>
                                    {!msg.isMe && <p style={{ fontSize: 8, color: "rgba(255,255,255,.3)", marginBottom: 2 }}>{msg.name}</p>}
                                    <div style={{ background: msg.isMe ? `${myColor.fill}20` : "rgba(255,255,255,.07)", border: `1px solid ${msg.isMe ? myColor.fill + "44" : "rgba(255,255,255,.09)"}`, borderRadius: msg.isMe ? "12px 12px 3px 12px" : "12px 12px 12px 3px", padding: "7px 11px" }}>
                                        <p style={{ fontSize: 12, color: "#fff", lineHeight: 1.4, wordBreak: "break-word" }}>{msg.text}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div id="chat-end" />
                    </div>
                    <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,.06)", flexShrink: 0 }}>
                        <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sendChat(chatInput); } }}
                            placeholder="Say something…" maxLength={60}
                            style={{ flex: 1, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#fff", fontFamily: "inherit", outline: "none" }} />
                        <button onClick={() => sendChat(chatInput)} style={{ padding: "10px 14px", borderRadius: 8, background: myColor.fill, color: "#111", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>→</button>
                    </div>
                </div>
            )}

            {/* End screen */}
            {screen === "end" && (
                <div style={{ position: "fixed", inset: 0, zIndex: 25, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.65)", backdropFilter: "blur(10px)" }}>
                    <div style={{ background: "rgba(4,4,18,.98)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 22, padding: "28px 24px", width: "100%", maxWidth: 300, textAlign: "center", animation: "popIn .2s ease-out" }}>
                        {endInfo?.won ? (
                            <><p style={{ fontSize: 36, marginBottom: 8 }}>🏆</p>
                                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#39FF14", textShadow: "0 0 24px #39FF14", marginBottom: 6 }}>You Win!</h2>
                                <p style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginBottom: 6 }}>Last snake standing.</p></>
                        ) : endInfo?.name ? (
                            <><p style={{ fontSize: 36, marginBottom: 8 }}>😤</p>
                                <h2 style={{ fontSize: 20, fontWeight: 700, color: "#FF2D78", marginBottom: 6 }}>{endInfo.name} Wins</h2>
                                <p style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginBottom: 6 }}>You got outplayed.</p></>
                        ) : (
                            <><p style={{ fontSize: 36, marginBottom: 8 }}>💀</p>
                                <h2 style={{ fontSize: 20, fontWeight: 700, color: "#FF2D78", textShadow: "0 0 20px #FF2D78", marginBottom: 6 }}>You Crashed!</h2>
                                <p style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginBottom: 6 }}>Watch the others finish.</p></>
                        )}
                        <p style={{ fontSize: 13, color: "rgba(255,255,255,.4)", marginBottom: 18 }}>Score: <strong style={{ color: "#FFE600" }}>{myScore}</strong></p>
                        {waiting ? (
                            <div style={{ width: "100%", padding: "12px 0", borderRadius: 10, fontSize: 11, fontWeight: 700, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.45)", textAlign: "center", marginBottom: 10 }}>
                                ⏳ Waiting for others… (10s then solo)
                            </div>
                        ) : (
                            <button onClick={handlePlayAgain} style={{ width: "100%", padding: "12px 0", borderRadius: 10, fontSize: 12, fontWeight: 700, letterSpacing: ".1em", border: "none", cursor: "pointer", background: "#fff", color: "#111", fontFamily: "inherit", marginBottom: 10 }}>PLAY AGAIN</button>
                        )}
                        <button onClick={() => { setShowChat(true); setUnread(0); }} style={{ width: "100%", padding: "9px 0", borderRadius: 10, fontSize: 11, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.55)", cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
                            💬 Chat {unread > 0 ? `(${unread} new)` : ""}
                        </button>
                        {navLinks}
                    </div>
                </div>
            )}
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PONG  (desktop — up to 4 real players: L/R/T/B paddles, AI fills gaps)
// ─────────────────────────────────────────────────────────────────────────────
const PGW = 1200, PGH = 700, PW = 14, PH = 100, BR = 9, PSPD = 6, BS0 = 5, BMAX = 13, AISPD = 4, PWIN = 3, PMRG = 36;
function nb(d = 1) { const a = Math.random() * .84 - .42; return { x: PGW / 2, y: PGH / 2, vx: Math.cos(a) * BS0 * d, vy: Math.sin(a) * BS0, spd: BS0 }; }
function pp2(s, y) { return Array.from({ length: 26 }, () => { const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 7; return { x: s === "l" ? PMRG + PW + 10 : PGW - PMRG - PW - 10, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, sz: 2 + Math.random() * 5, col: s === "l" ? "#50DD80" : "#FF5555" }; }); }

function PongGame() {
    const cvs = useRef(null);
    const ch = useRef(null);
    const myId = useRef(uid());
    const g = useRef({
        ph: "idle", ball: nb(), pY: PGH / 2 - PH / 2, aY: PGH / 2 - PH / 2,
        pS: 0, aS: 0, keys: {}, cd: 3, ct: 0, win: null, tr: [], fl: 0, fid: 0, pts: [], sx: 1, sy: 1,
        // multiplayer: remoteY tracks opponent's real paddle
        remoteY: PGH / 2 - PH / 2, remoteConnected: false, isHost: true,
    });
    const [ps, setPs] = useState(0); const [as2, setAs] = useState(0);
    const [ph, setPh] = useState("idle"); const [win, setWin] = useState(null);
    const [cnt, setCnt] = useState(3); const [alt, setAlt] = useState(false);
    const [opName, setOpName] = useState("CPU"); const [opConnected, setOpConnected] = useState(false);

    // ── Chat state ──
    const [chatLog, setChatLog] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [showChat, setShowChat] = useState(false);
    const [unread, setUnread] = useState(0);
    const showChatRef = useRef(false);
    useEffect(() => { showChatRef.current = showChat; }, [showChat]);
    const seenPongMsgs = useRef(new Set());
    const pongBubbles = useRef({}); // { "left"|"right" → { text, exp } }
    const chatEndRef = useRef(null);

    const addPongChat = useCallback((msg) => {
        if (msg.msgId) {
            if (seenPongMsgs.current.has(msg.msgId)) return;
            seenPongMsgs.current.add(msg.msgId);
        }
        setChatLog(prev => [...prev.slice(-80), msg]);
        if (!showChatRef.current) setUnread(n => n + 1);
        // Show bubble on canvas above the sender's paddle
        const side = msg.isMe ? "left" : "right";
        pongBubbles.current[side] = { text: (msg.text || "").slice(0, 22), exp: Date.now() + 4000 };
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    }, []);

    const sendPongChat = useCallback((txt) => {
        const text = (txt || "").trim(); if (!text) return;
        const id = myId.current;
        const msgId = `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        addPongChat({ msgId, id, name: "YOU", color: "#50DD80", text, isMe: true });
        ch.current?.pub("pong_chat", { msgId, id, text });
        setChatInput("");
    }, [addPongChat]);

    // ── Multiplayer channel ──
    useEffect(() => {
        const id = myId.current;
        const channel = makeChannel(SB_URL, SB_KEY, PONG_CH, (event, payload) => {
            const s = g.current;
            if (event === "pong_hello") {
                if (!s.remoteConnected) {
                    s.remoteConnected = true; s.isHost = id < payload.id; // lower ID = host
                    setOpConnected(true); setOpName(payload.name || "PLAYER");
                    channel.pub("pong_hello", { id, name: "YOU" });
                    if (!s.isHost && (s.ph === "idle" || s.ph === "won")) {
                        // Non-host waits for host to start
                    }
                }
            }
            if (event === "pong_move") s.remoteY = payload.y;
            if (event === "pong_start") { s.ph = "cd"; s.cd = 3; s.ct = 0; s.ball = nb(payload.dir ?? 1); setPh("cd"); setCnt(3); }
            if (event === "pong_ball") Object.assign(s.ball, payload);
            if (event === "pong_score") {
                if (payload.side === "l") { if (s.isHost) { s.pS++; setPs(s.pS); } else { s.aS++; setAs(s.aS); } }
                else { if (s.isHost) { s.aS++; setAs(s.aS); } else { s.pS++; setPs(s.pS); } }
            }
            if (event === "pong_chat") {
                addPongChat({ msgId: payload.msgId, id: payload.id, name: opName || "PLAYER", color: "#FF5555", text: payload.text, isMe: false });
            }
        }, id);
        ch.current = channel;
        setTimeout(() => channel.pub("pong_hello", { id, name: "YOU" }), 400);
        const hb = setInterval(() => channel.pub("pong_hello", { id, name: "YOU" }), 8000);
        return () => { channel.close(); clearInterval(hb); };
    }, []);

    const start = useCallback(() => {
        const s = g.current;
        Object.assign(s, { ph: "cd", cd: 3, ct: 0, ball: nb(1), pY: PGH / 2 - PH / 2, aY: PGH / 2 - PH / 2, pS: 0, aS: 0, win: null, tr: [], fl: 0, pts: [] });
        setPs(0); setAs(0); setWin(null); setPh("cd"); setCnt(3);
        if (s.remoteConnected) ch.current?.pub("pong_start", { dir: 1 });
    }, []);

    useEffect(() => {
        const d = e => { g.current.keys[e.code] = true; if (["Space", "ArrowUp", "ArrowDown", "KeyW", "KeyS"].includes(e.code)) e.preventDefault(); if (e.code === "Space" && (g.current.ph === "idle" || g.current.ph === "won")) start(); if (e.key === "Alt") { e.preventDefault(); setAlt(true); } };
        const u = e => { g.current.keys[e.code] = false; if (e.key === "Alt") setAlt(false); };
        addEventListener("keydown", d); addEventListener("keyup", u); return () => { removeEventListener("keydown", d); removeEventListener("keyup", u); };
    }, [start]);

    useEffect(() => {
        const m = e => {
            const s = g.current; s.pY = Math.max(0, Math.min(e.clientY / s.sy - PH / 2, PGH - PH));
            if (s.remoteConnected) ch.current?.pub("pong_move", { y: s.pY });
        };
        addEventListener("mousemove", m); return () => removeEventListener("mousemove", m);
    }, []);

    useEffect(() => {
        const canvas = cvs.current; if (!canvas) return; const ctx = canvas.getContext("2d"); const s = g.current;
        const dp = (lx, ly, col, gw) => { ctx.save(); ctx.shadowColor = gw; ctx.shadowBlur = 22; const gr = ctx.createLinearGradient(lx * s.sx, ly * s.sy, (lx + PW) * s.sx, (ly + PH) * s.sy); gr.addColorStop(0, col); gr.addColorStop(1, gw); ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(lx * s.sx, ly * s.sy, PW * s.sx, PH * s.sy, 5); ctx.fill(); ctx.shadowBlur = 0; ctx.restore(); };
        const db = (lx, ly) => { ctx.save(); ctx.shadowColor = "#fff"; ctx.shadowBlur = 24; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(lx * s.sx, ly * s.sy, BR * Math.min(s.sx, s.sy), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.restore(); };
        const dtr = () => { const sr = BR * Math.min(s.sx, s.sy); s.tr.forEach((t, i) => { ctx.globalAlpha = (i / s.tr.length) * .22; ctx.fillStyle = "#88CCFF"; ctx.beginPath(); ctx.arc(t.x * s.sx, t.y * s.sy, Math.max(.5, sr * (i / s.tr.length) * .5), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }); };
        const dm = () => { ctx.save(); ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 3; ctx.setLineDash([18 * s.sy, 14 * s.sy]); ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); };
        const d4 = () => { ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(255,255,255,.028)"; ctx.font = `bold ${Math.round(190 * s.sy)}px 'Courier New',monospace`; ctx.fillText("404", canvas.width / 2, canvas.height / 2); ctx.restore(); };
        const dpt = () => { s.pts = s.pts.filter(p => p.life > 0); s.pts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .1; p.life -= .022; ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col; ctx.shadowColor = p.col; ctx.shadowBlur = 7; ctx.beginPath(); ctx.arc(p.x * s.sx, p.y * s.sy, Math.max(.1, p.sz * p.life * Math.min(s.sx, s.sy)), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; ctx.shadowBlur = 0; }); };
        const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; s.sx = innerWidth / PGW; s.sy = innerHeight / PGH; };
        resize(); addEventListener("resize", resize);

        const loop = () => {
            s.fid = requestAnimationFrame(loop); const cw = canvas.width, ch2 = canvas.height; ctx.clearRect(0, 0, cw, ch2);
            const bg = ctx.createRadialGradient(cw / 2, ch2 / 2, 0, cw / 2, ch2 / 2, Math.max(cw, ch2) * .7); bg.addColorStop(0, "#161622"); bg.addColorStop(1, "#080810"); ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch2);
            const vg = ctx.createRadialGradient(cw / 2, ch2 / 2, ch2 * .3, cw / 2, ch2 / 2, ch2); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.5)"); ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch2);
            dm(); d4(); ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(0, 0, cw, 3); ctx.fillRect(0, ch2 - 3, cw, 3);

            // Determine right paddle: real opponent or AI
            const rightY = s.remoteConnected ? s.remoteY : s.aY;
            const rightColor = s.remoteConnected ? "#E85050" : "#773333";
            const rightGlow = s.remoteConnected ? "#FF8080" : "#FF5555";

            if (s.ph === "idle") { const t = Date.now() * .0014; db(PGW / 2 + Math.cos(t) * 180, PGH / 2 + Math.sin(t * 1.4) * 120); dp(PMRG, PGH / 2 - PH / 2, "#888", "#aaa"); dp(PGW - PMRG - PW, PGH / 2 - PH / 2, rightColor, rightGlow); return; }
            if (s.ph === "cd") { s.ct++; if (s.ct >= 60) { s.cd--; s.ct = 0; setCnt(s.cd); if (s.cd <= 0) { s.ph = "play"; setPh("play"); } } dp(PMRG, s.pY, "#E0E0E0", "#fff"); dp(PGW - PMRG - PW, rightY, rightColor, rightGlow); dpt(); return; }
            if (s.ph === "won") { dp(PMRG, s.pY, "#E0E0E0", "#fff"); dp(PGW - PMRG - PW, rightY, rightColor, rightGlow); dpt(); return; }
            if (s.ph === "play") {
                const k = s.keys; if (k.ArrowUp || k.KeyW) s.pY = Math.max(0, s.pY - PSPD); if (k.ArrowDown || k.KeyS) s.pY = Math.min(PGH - PH, s.pY + PSPD);
                // AI only controls right if no remote player
                if (!s.remoteConnected) { const ac = s.aY + PH / 2; if (s.ball.vx > 0) { if (ac < s.ball.y - 10) s.aY = Math.min(PGH - PH, s.aY + AISPD); if (ac > s.ball.y + 10) s.aY = Math.max(0, s.aY - AISPD); } }
                const b = s.ball; s.tr.push({ x: b.x, y: b.y }); if (s.tr.length > 14) s.tr.shift(); b.x += b.vx; b.y += b.vy;
                if (b.y - BR <= 3) { b.y = 3 + BR; b.vy = Math.abs(b.vy); s.fl = 3; }
                if (b.y + BR >= PGH - 3) { b.y = PGH - 3 - BR; b.vy = -Math.abs(b.vy); s.fl = 3; }
                // Left paddle
                if (b.vx < 0 && b.x - BR <= PMRG + PW && b.x - BR >= PMRG - 2 && b.y >= s.pY && b.y <= s.pY + PH) { b.x = PMRG + PW + BR; const hp = (b.y - (s.pY + PH / 2)) / (PH / 2); b.spd = Math.min(BMAX, b.spd + .35); b.vx = Math.abs(Math.cos(hp * .85) * b.spd); b.vy = Math.sin(hp * .85) * b.spd; s.fl = 6; }
                // Right paddle (remote or AI)
                const rPadY = s.remoteConnected ? s.remoteY : s.aY;
                const aX = PGW - PMRG - PW; if (b.vx > 0 && b.x + BR >= aX && b.x + BR <= aX + PW + 2 && b.y >= rPadY && b.y <= rPadY + PH) { b.x = aX - BR; const hp = (b.y - (rPadY + PH / 2)) / (PH / 2); b.spd = Math.min(BMAX, b.spd + .25); b.vx = -Math.abs(Math.cos(hp * .85) * b.spd); b.vy = Math.sin(hp * .85) * b.spd; s.fl = 6; }
                // Only host scores (prevents double-counting)
                if (s.isHost || !s.remoteConnected) {
                    if (b.x > PGW + 20) { s.pS++; setPs(s.pS); s.pts.push(...pp2("l", b.y)); s.fl = 18; ch.current?.pub("pong_score", { side: "l" }); if (s.pS >= PWIN) { s.ph = "won"; s.win = "player"; setPh("won"); setWin("player"); } else { s.ph = "cd"; s.cd = 2; s.ct = 0; s.ball = nb(1); s.tr = []; setPh("cd"); setCnt(2); ch.current?.pub("pong_start", { dir: 1 }); } }
                    if (b.x < -20) { s.aS++; setAs(s.aS); s.pts.push(...pp2("r", b.y)); s.fl = 18; ch.current?.pub("pong_score", { side: "r" }); if (s.aS >= PWIN) { s.ph = "won"; s.win = "ai"; setPh("won"); setWin("ai"); } else { s.ph = "cd"; s.cd = 2; s.ct = 0; s.ball = nb(-1); s.tr = []; setPh("cd"); setCnt(2); ch.current?.pub("pong_start", { dir: -1 }); } }
                }
                if (s.fl > 0) { ctx.fillStyle = `rgba(255,255,255,${s.fl * .018})`; ctx.fillRect(0, 0, cw, ch2); s.fl--; }
                dtr(); db(b.x, b.y); dpt(); dp(PMRG, s.pY, "#E8E8E8", "#fff"); dp(PGW - PMRG - PW, rightY, rightColor, rightGlow);
                ctx.save(); ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.font = "10px 'Courier New',monospace";
                ctx.fillText("YOU", PGW / 2 * s.sx - 58 * s.sx, 60 * s.sy);
                ctx.fillText(s.remoteConnected ? opName : "CPU", PGW / 2 * s.sx + 58 * s.sx, 60 * s.sy);
                ctx.restore();
                // ── Chat bubbles above paddles ──
                const drawBub = (bub, px, py, col) => {
                    if (!bub || Date.now() >= bub.exp) return;
                    const fade = Math.min(1, (bub.exp - Date.now()) / 500);
                    ctx.save(); ctx.globalAlpha = fade;
                    ctx.font = `bold ${Math.round(13 * Math.min(s.sx, s.sy))}px 'Courier New',monospace`;
                    ctx.textAlign = "center";
                    const tw = ctx.measureText(bub.text).width;
                    const bx = px * s.sx, by = py * s.sy;
                    const pad = 8, bh = 22 * Math.min(s.sx, s.sy);
                    ctx.fillStyle = "rgba(0,0,0,.82)";
                    ctx.beginPath(); ctx.roundRect(bx - tw / 2 - pad, by - bh - 10, tw + pad * 2, bh, 6); ctx.fill();
                    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
                    // triangle tail pointing down
                    ctx.fillStyle = "rgba(0,0,0,.82)";
                    ctx.beginPath(); ctx.moveTo(bx - 5, by - 10); ctx.lineTo(bx, by - 3); ctx.lineTo(bx + 5, by - 10); ctx.fill();
                    ctx.fillStyle = "#fff";
                    ctx.fillText(bub.text, bx, by - bh / 2 - 3);
                    ctx.globalAlpha = 1; ctx.restore();
                };
                drawBub(pongBubbles.current["left"], PMRG + PW / 2, s.pY, "#50DD80");
                drawBub(pongBubbles.current["right"], PGW - PMRG - PW / 2, s.remoteConnected ? s.remoteY : s.aY, "#FF5555");
            }
        };
        s.fid = requestAnimationFrame(loop); return () => { cancelAnimationFrame(s.fid); removeEventListener("resize", resize); };
    }, []);

    const FF = "Space Mono,Courier New,monospace";
    return (<><style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:#080810}.pc{position:fixed;inset:0;width:100vw!important;height:100vh!important;display:block;z-index:0;touch-action:none}.nc{cursor:none}.scc{cursor:default}.ov{position:fixed;inset:0;z-index:10;pointer-events:none;font-family:'Space Mono','Courier New',monospace}.t2{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:14px 22px}.badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border:1px solid rgba(255,255,255,.1);border-radius:100px;font-size:8px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.25);background:rgba(255,255,255,.04);backdrop-filter:blur(8px)}.bdot{width:5px;height:5px;border-radius:50%;background:#E05050;animation:blink 1.2s ease-in-out infinite}@keyframes blink{0%,100%{opacity:1}50%{opacity:.1}}.ah{font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.18)}.ah b{color:rgba(255,255,255,.35)}.sb{position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.07);border-radius:100px;padding:6px 16px;backdrop-filter:blur(14px)}.sblk{display:flex;flex-direction:column;align-items:center;gap:1px}.snum{font-size:20px;font-weight:700;line-height:1;letter-spacing:2px;width:28px;text-align:center}.slbl{font-size:7px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.2)}.sy{color:#50DD80;text-shadow:0 0 10px rgba(80,221,128,.6)}.scpu{color:#FF5555;text-shadow:0 0 10px rgba(255,85,85,.6)}.pip{width:7px;height:7px;border-radius:50%;border:1px solid rgba(255,255,255,.2);transition:all .2s}.py2{background:#50DD80;border-color:#50DD80;box-shadow:0 0 6px #50DD80}.pp2{background:#FF5555;border-color:#FF5555;box-shadow:0 0 6px #FF5555}.ctr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;pointer-events:none}.cnum{font-size:72px;font-weight:700;line-height:1;color:#fff;text-shadow:0 0 50px rgba(255,255,255,.5);animation:popD .2s ease-out}@keyframes popD{from{transform:scale(1.35);opacity:0}to{transform:scale(1);opacity:1}}.prm{font-size:12px;letter-spacing:.14em;text-align:center;color:rgba(255,255,255,.45);animation:pls 2s ease-in-out infinite}@keyframes pls{0%,100%{opacity:.4}50%{opacity:.9}}.sub{font-size:10px;letter-spacing:.08em;text-align:center;color:rgba(255,255,255,.2)}.wt{font-size:28px;font-weight:700;line-height:1;text-align:center}.wy{color:#50DD80;text-shadow:0 0 30px #50DD80}.wa{color:#FF5555;text-shadow:0 0 30px #FF5555}.ws{font-size:10px;color:rgba(255,255,255,.28);text-align:center}.pb{pointer-events:all;padding:9px 26px;border-radius:8px;font-size:11px;font-weight:700;letter-spacing:.1em;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);color:#fff;cursor:pointer;font-family:'Space Mono',monospace;transition:all .15s;margin-top:4px}.pb:hover{background:rgba(255,255,255,.16);transform:translateY(-1px)}.bot{position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:14px 22px}.hint{font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:rgba(255,255,255,.15)}.hint b{color:rgba(255,255,255,.32)}.btns{display:flex;gap:8px;pointer-events:all}.btn{padding:8px 18px;border-radius:7px;font-size:10px;font-weight:700;letter-spacing:.1em;text-decoration:none;cursor:pointer;font-family:'Space Mono','Courier New',monospace;transition:all .15s;display:inline-block}.bp{background:rgba(255,255,255,.9);color:#111;border:none}.bp:hover{background:#fff;transform:translateY(-1px)}.bs{background:transparent;color:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.12)}.bs:hover{border-color:rgba(255,255,255,.28);color:rgba(255,255,255,.65);transform:translateY(-1px)}.plbl{position:absolute;top:58px;font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.18)}.ply{left:22px}.pcp{right:22px}.ft{position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:8px;letter-spacing:.1em;color:rgba(255,255,255,.08)}`}</style>
        <canvas ref={cvs} className={`pc ${alt ? "scc" : "nc"}`} onClick={() => { if (g.current.ph === "idle" || g.current.ph === "won") start(); }} />

        {/* ── Chat toggle button ── */}
        <button onClick={() => { setShowChat(v => { showChatRef.current = !v; return !v; }); setUnread(0); }}
            style={{ position: "fixed", bottom: showChat ? 316 : 20, right: 20, zIndex: 40, width: 46, height: 46, borderRadius: "50%", border: "2px solid #50DD80", background: showChat ? "rgba(0,0,0,.88)" : "rgba(8,8,16,.92)", color: "#50DD80", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "bottom .25s", boxShadow: "0 0 18px rgba(80,221,128,.4)", backdropFilter: "blur(10px)", zIndex: 50, pointerEvents: "all" }}>
            {showChat ? "✕" : "💬"}
            {unread > 0 && !showChat && <span style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: "50%", background: "#FF2D78", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{unread}</span>}
        </button>

        {/* ── Chat panel ── */}
        {showChat && (
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 300, zIndex: 45, background: "rgba(4,4,14,.97)", borderTop: "1px solid rgba(255,255,255,.1)", display: "flex", flexDirection: "column", backdropFilter: "blur(20px)", animation: "slideUpP .2s ease-out", fontFamily: "'Space Mono','Courier New',monospace", pointerEvents: "all" }}>
                <style>{`@keyframes slideUpP{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}.pong-msg{animation:msgIn .14s ease-out}@keyframes msgIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}`}</style>
                {/* Quick emojis */}
                <div style={{ display: "flex", gap: 5, padding: "7px 14px 5px", borderBottom: "1px solid rgba(255,255,255,.07)", overflowX: "auto", flexShrink: 0 }}>
                    {["👋", "🔥", "💀", "😂", "👑", "🏓", "😤", "🎉", "❤️", "💯"].map(e => (
                        <button key={e} onClick={() => sendPongChat(e)} style={{ fontSize: 20, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "4px 8px", cursor: "pointer", flexShrink: 0 }}>{e}</button>
                    ))}
                </div>
                {/* Messages */}
                <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {chatLog.length === 0 && <p style={{ fontSize: 10, color: "rgba(255,255,255,.22)", textAlign: "center", marginTop: 18 }}>No messages · say something to your opponent 👋</p>}
                    {chatLog.map((msg, i) => (
                        <div key={i} className="pong-msg" style={{ display: "flex", gap: 7, alignItems: "flex-start", flexDirection: msg.isMe ? "row-reverse" : "row" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: msg.color, flexShrink: 0, marginTop: 6, boxShadow: `0 0 6px ${msg.color}` }} />
                            <div style={{ maxWidth: "76%" }}>
                                {!msg.isMe && <p style={{ fontSize: 8, color: "rgba(255,255,255,.3)", marginBottom: 2 }}>{msg.name}</p>}
                                <div style={{ background: msg.isMe ? "rgba(80,221,128,.15)" : "rgba(255,255,255,.08)", border: `1px solid ${msg.isMe ? "rgba(80,221,128,.4)" : "rgba(255,255,255,.1)"}`, borderRadius: msg.isMe ? "12px 12px 3px 12px" : "12px 12px 12px 3px", padding: "7px 11px" }}>
                                    <p style={{ fontSize: 12, color: "#fff", lineHeight: 1.4, wordBreak: "break-word" }}>{msg.text}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>
                {/* Input */}
                <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,.07)", flexShrink: 0 }}>
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sendPongChat(chatInput); } }}
                        placeholder="Say something to your opponent…" maxLength={60}
                        style={{ flex: 1, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "#fff", fontFamily: "inherit", outline: "none" }} />
                    <button onClick={() => sendPongChat(chatInput)} style={{ padding: "9px 14px", borderRadius: 8, background: "#50DD80", color: "#111", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer", flexShrink: 0 }}>→</button>
                </div>
            </div>
        )}

        <div className="ov">
            <div className="t2">
                <div className="badge"><span className="bdot" />Error 404</div>
                <span className="ah">
                    {opConnected ? <span style={{ color: "#50DD80" }}>● {opName} connected</span> : <span><b>Hold Alt</b> for cursor</span>}
                </span>
            </div>
            <span className="plbl ply">You</span>
            <span className="plbl pcp">{opConnected ? opName : "CPU"}</span>
            <div className="sb">
                <div className="sblk"><span className="snum sy">{ps}</span><span className="slbl">you</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>{Array.from({ length: PWIN }).map((_, i) => <span key={i} className={`pip ${i < ps ? "py2" : i < as2 ? "pp2" : ""}`} />)}</div>
                <div className="sblk"><span className="snum scpu">{as2}</span><span className="slbl">{opConnected ? opName : "cpu"}</span></div>
            </div>
            <div className="ctr">
                {ph === "idle" && <><h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-.5px", textAlign: "center", lineHeight: 1.2, fontFamily: FF }}>Uh oh. <span style={{ color: "rgba(255,255,255,.28)" }}>You're lost.</span></h1><p style={{ fontSize: 11, color: "rgba(255,255,255,.28)", textAlign: "center", fontFamily: FF }}>This page doesn't exist. We looked.</p><p style={{ fontSize: 10, color: "rgba(255,255,255,.16)", textAlign: "center", fontFamily: FF }}>While we <s style={{ color: "rgba(255,255,255,.09)" }}>blame someone</s> <em>investigate</em> — Pong.</p><div style={{ height: 10 }} /><p className="prm">PRESS SPACE OR TAP TO START</p><p className="sub">Move mouse · first to {PWIN} wins · {opConnected ? "vs " + opName : "vs CPU (open on another device!)"}</p></>}
                {ph === "cd" && <><p style={{ fontSize: 10, color: "rgba(255,255,255,.3)", letterSpacing: ".22em", textTransform: "uppercase", fontFamily: FF }}>Get ready</p><span className="cnum" key={cnt}>{cnt > 0 ? cnt : "GO!"}</span></>}
                {ph === "won" && <><p className={`wt ${win === "player" ? "wy" : "wa"}`}>{win === "player" ? "You Win 🎉" : (opConnected ? opName + " Wins" : "CPU Wins")}</p><p className="ws">{win === "player" ? "Not bad for someone who got lost." : "The opponent sends their regards."}</p><button className="pb" onClick={start}>Play Again</button></>}
            </div>
            <div className="bot"><p className="hint"><b>Mouse</b> to move &nbsp;·&nbsp; <b>↑↓/W·S</b> keys</p><div className="btns"><Link href="/" className="btn bp">← Go Home</Link><Link href="/dashboard" className="btn bs">Dashboard →</Link></div></div>
            <p className="ft">Status: still missing · Morale: surprisingly high</p>
        </div></>);
}

// ─────────────────────────────────────────────────────────────────────────────
//  ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function NotFound() {
    const [mobile, setMobile] = useState(false);
    const [ready, setReady] = useState(false);
    useEffect(() => { setMobile(isMobile()); setReady(true); }, []);
    if (!ready) return (
        <div style={{ position: "fixed", inset: 0, background: "#080810", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "rgba(255,255,255,0.3)", fontFamily: "'Courier New',monospace", fontSize: 12, letterSpacing: "0.2em" }}>LOADING…</span>
        </div>
    );
    return mobile ? <SnakeChatGame /> : <PongGame />;
}
