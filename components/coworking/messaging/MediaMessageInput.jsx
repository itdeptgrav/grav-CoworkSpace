/**
 * MediaMessageInput — WhatsApp-style input bar
 * + button → image/pdf picker | emoji button | text field | mic/send button
 * Recording mode: waveform animation + timer + pause/resume + send
 *
 * NEW: @mention support — typing "@" opens a popup of group members
 *      (filtered by what comes after @). Selecting a member inserts
 *      "@FullName " into the textarea and tracks their employeeId in
 *      `mentions` so the parent can notify them specifically.
 */
"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { uploadImage, uploadVoice, uploadPDF } from "../../../lib/mediaUploadApi";

// ── Emoji categories ──────────────────────────────────────────────────────────
const EMOJI_CATS = [
    { icon: "😊", emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😊", "😇", "🥰", "😍", "🤩", "😘", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "😵", "🤯", "🤠", "🥳", "😎", "🤓", "😕", "😟", "🙁", "☹️", "😮", "😲", "😳", "🥺", "😦", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿"] },
    { icon: "👋", emojis: ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "💪", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💯", "🔥", "✨", "⭐", "🌟", "💫", "🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "💎", "👑"] },
    { icon: "🐶", emojis: ["🐶", "🐱", "🐭", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🙈", "🙉", "🙊", "🐔", "🐧", "🐦", "🦆", "🦅", "🦉", "🦇", "🐺", "🐴", "🦄", "🐝", "🦋", "🐌", "🐞", "🐢", "🐍", "🦎", "🐙", "🦑", "🦀", "🐠", "🐟", "🐬", "🐳", "🦈", "🦭", "🐘", "🦒", "🐕", "🐈", "🦮"] },
    { icon: "🍕", emojis: ["🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🥦", "🥕", "🧄", "🥐", "🍞", "🧀", "🥚", "🍳", "🥞", "🧇", "🥓", "🍗", "🍖", "🌭", "🍔", "🍟", "🍕", "🥪", "🌮", "🌯", "🥗", "🥘", "🍝", "🍜", "🍣", "🥟", "🧁", "🍰", "🎂", "🍩", "🍪", "🍫", "🍿", "☕", "🍵", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸", "🍹", "🍾"] },
    { icon: "⚽", emojis: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸", "🥊", "🥋", "🏆", "🥇", "🥈", "🥉", "🎭", "🎨", "🎬", "🎤", "🎧", "🎵", "🎶", "🥁", "🎷", "🎺", "🎸", "🎻", "🎲", "🎯", "🎳", "🎮", "🎰", "🧩", "🎪"] },
    { icon: "✈️", emojis: ["🚗", "🚕", "🚙", "🚌", "🏎️", "🚓", "🚑", "🚒", "🚲", "🛴", "⚓", "⛵", "🚤", "🚢", "✈️", "🚀", "🛸", "💺", "🚁", "🚂", "🚄", "🚇", "🏠", "🏡", "🏢", "🏥", "🏦", "🏨", "🏰", "⛲", "⛺", "🌍", "🌎", "🌏", "🌐", "🗺️", "🧭"] },
    { icon: "💯", emojis: ["💯", "✅", "❌", "⭕", "🛑", "⛔", "🚫", "❗", "❓", "⚠️", "♻️", "✔️", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🔔", "💬", "💭", "💤", "💢", "💲", "™️", "©️", "®️", "🆕", "🆓", "🆗", "🆙", "➕", "➖", "➗", "✖️", "▶️", "⏸️", "⏹️", "⏩", "⏪", "🔀", "🔁", "🔇", "🔊"] },
];
const RECENT_KEY = "cwrk_emoji_recent";
const getRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } };
const saveRecent = (e) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...getRecent().filter(x => x !== e)].slice(0, 32))); } catch { } };

export default function MediaMessageInput({
    onSend,
    placeholder = "Type a message",
    disabled = false,
    members = [],          // NEW — list of group members: [{ employeeId, name, profilePicUrl }]
}) {
    const [text, setText] = useState("");
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [recording, setRecording] = useState(false);
    const [recPaused, setRecPaused] = useState(false);
    const [recSeconds, setRecSeconds] = useState(0);
    const [error, setError] = useState("");
    const [showEmoji, setShowEmoji] = useState(false);
    const [showAttMenu, setShowAttMenu] = useState(false);
    const [emojiTab, setEmojiTab] = useState(-1); // -1 = recent
    const [emojiSearch, setEmojiSearch] = useState("");
    const [recent, setRecent] = useState([]);
    const [waveform, setWaveform] = useState(Array(40).fill(3));

    // NEW — mention state
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionAnchorStart, setMentionAnchorStart] = useState(-1); // index of the "@" in text
    const [mentionHoverIdx, setMentionHoverIdx] = useState(0);
    const [mentionedIds, setMentionedIds] = useState([]); // employeeIds of mentions currently in the text

    const imageRef = useRef(null);
    const pdfRef = useRef(null);
    const textareaRef = useRef(null);
    const mrRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const waveTimerRef = useRef(null);
    const emojiRef = useRef(null);
    const attMenuRef = useRef(null);
    const mentionRef = useRef(null);
    const analyserRef = useRef(null);
    const sourceRef = useRef(null);
    const audioCtxRef = useRef(null);

    const canSend = (text.trim() || attachments.length > 0) && !uploading && !disabled;

    useEffect(() => { if (showEmoji) setRecent(getRecent()); }, [showEmoji]);

    // Close menus on outside click
    useEffect(() => {
        const h = (e) => {
            if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmoji(false);
            if (attMenuRef.current && !attMenuRef.current.contains(e.target)) setShowAttMenu(false);
            if (mentionRef.current && !mentionRef.current.contains(e.target) && textareaRef.current && !textareaRef.current.contains(e.target)) {
                setMentionOpen(false);
            }
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);

    // Waveform animation during recording
    const startWaveform = useCallback((stream) => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 128;
            const src = ctx.createMediaStreamSource(stream);
            src.connect(analyser);
            audioCtxRef.current = ctx;
            analyserRef.current = analyser;
            const buf = new Uint8Array(analyser.frequencyBinCount);
            waveTimerRef.current = setInterval(() => {
                analyser.getByteFrequencyData(buf);
                setWaveform(Array.from({ length: 40 }, (_, i) => {
                    const v = buf[Math.floor(i * buf.length / 40)] || 0;
                    return Math.max(3, Math.min(36, (v / 255) * 36));
                }));
            }, 80);
        } catch (e) { /* ignore audio ctx failure */ }
    }, []);

    const stopWaveform = useCallback(() => {
        if (waveTimerRef.current) { clearInterval(waveTimerRef.current); waveTimerRef.current = null; }
        if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch { } audioCtxRef.current = null; }
        analyserRef.current = null;
        sourceRef.current = null;
        setWaveform(Array(40).fill(3));
    }, []);

    // ── Recording ────────────────────────────────────────────────────────────
    const startRecording = async () => {
        setError("");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            chunksRef.current = [];
            const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
            mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            mr.start();
            mrRef.current = mr;
            setRecording(true);
            setRecPaused(false);
            setRecSeconds(0);
            startWaveform(stream);
            timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
        } catch (e) {
            setError("Microphone access denied");
            setTimeout(() => setError(""), 2500);
        }
    };

    const pauseRecording = () => {
        if (!mrRef.current) return;
        try { mrRef.current.pause(); } catch { }
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setRecPaused(true);
    };

    const resumeRecording = () => {
        if (!mrRef.current) return;
        try { mrRef.current.resume(); } catch { }
        timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
        setRecPaused(false);
    };

    const cancelRecording = () => {
        if (mrRef.current) {
            try { mrRef.current.stop(); } catch { }
            mrRef.current.stream?.getTracks().forEach(t => t.stop());
        }
        mrRef.current = null;
        chunksRef.current = [];
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        stopWaveform();
        setRecording(false);
        setRecPaused(false);
        setRecSeconds(0);
    };

    const sendRecording = async () => {
        const mr = mrRef.current;
        if (!mr) return;
        const done = new Promise(r => { mr.onstop = r; });
        try { mr.stop(); } catch { }
        await done;
        mr.stream?.getTracks().forEach(t => t.stop());
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        stopWaveform();
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        mrRef.current = null;
        chunksRef.current = [];
        setRecording(false);
        setRecPaused(false);
        const seconds = recSeconds;
        setRecSeconds(0);

        if (blob.size < 1000) { setError("Recording too short"); setTimeout(() => setError(""), 2500); return; }
        setUploading(true);
        try {
            const up = await uploadVoice(blob, seconds);
            onSend?.("", [{ type: "voice", url: up.url, fileId: up.fileId, duration: seconds, name: up.name || "Voice message" }], "voice");
        } catch (e) {
            setError("Voice upload failed");
            setTimeout(() => setError(""), 2500);
        }
        setUploading(false);
    };

    // ── Send text + attachments ──────────────────────────────────────────────
    const handleSend = async () => {
        if (!canSend) return;
        const trimmedText = text.trim();
        // NEW — only keep mentions whose @Name still appears in the text
        const kept = mentionedIds.filter(id => {
            const m = members.find(x => x.employeeId === id);
            if (!m) return false;
            return trimmedText.includes(`@${(m.name || "").trim()}`);
        });
        onSend?.(trimmedText, attachments, attachments.length > 0 ? attachments[0].type : "text", kept);
        setText("");
        setAttachments([]);
        setMentionedIds([]);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
    };

    const handleKeyDown = (e) => {
        // NEW — mention popup key handling takes priority
        if (mentionOpen && filteredMembers.length > 0) {
            if (e.key === "ArrowDown") { e.preventDefault(); setMentionHoverIdx(i => Math.min(i + 1, filteredMembers.length - 1)); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setMentionHoverIdx(i => Math.max(i - 1, 0)); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(filteredMembers[mentionHoverIdx]); return; }
            if (e.key === "Escape") { e.preventDefault(); setMentionOpen(false); return; }
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ── Attachments: images ──────────────────────────────────────────────────
    const handleImages = async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = "";
        if (!files.length) return;
        setShowAttMenu(false);
        setUploading(true);
        const uploaded = [];
        for (const file of files) {
            try {
                const up = await uploadImage(file);
                uploaded.push({ type: "image", url: up.url, fileId: up.fileId, name: file.name, width: up.width, height: up.height });
            } catch (err) {
                setError(`Upload failed: ${file.name}`);
                setTimeout(() => setError(""), 2500);
            }
        }
        setAttachments(prev => [...prev, ...uploaded]);
        setUploading(false);
    };

    const handlePDF = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setShowAttMenu(false);
        setUploading(true);
        try {
            const up = await uploadPDF(file);
            setAttachments(prev => [...prev, { type: "pdf", url: up.url, fileId: up.fileId, name: file.name, size: file.size }]);
        } catch (err) {
            setError("Document upload failed");
            setTimeout(() => setError(""), 2500);
        }
        setUploading(false);
    };

    // ── Emoji insert ─────────────────────────────────────────────────────────
    const insertEmoji = (emoji) => {
        saveRecent(emoji);
        const ta = textareaRef.current;
        if (!ta) { setText(t => t + emoji); return; }
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        setText(t => t.slice(0, start) + emoji + t.slice(end));
        setTimeout(() => {
            ta.focus();
            ta.selectionStart = ta.selectionEnd = start + emoji.length;
        }, 0);
    };

    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

    const displayEmojis = useMemo(() => {
        if (emojiSearch) {
            const q = emojiSearch.toLowerCase();
            return EMOJI_CATS.flatMap(c => c.emojis).filter(e => e.includes(emojiSearch) || q.length < 2);
        }
        return emojiTab === -1 ? recent : EMOJI_CATS[emojiTab]?.emojis || [];
    }, [emojiTab, emojiSearch, recent]);

    // ─────────────────────────────────────────────────────────────────────────
    // NEW — @mention detection & insertion
    // ─────────────────────────────────────────────────────────────────────────
    // Detect @mention based on cursor position inside `text`
    const detectMentionAtCursor = useCallback((nextText, cursorPos) => {
        // Look backwards from cursor for "@" preceded by whitespace or start of string
        let i = cursorPos - 1;
        while (i >= 0) {
            const ch = nextText[i];
            if (ch === "@") {
                const before = i === 0 ? " " : nextText[i - 1];
                if (/\s|^/.test(before) || i === 0) {
                    // Found an @. Query = chars between @ and cursor.
                    const query = nextText.slice(i + 1, cursorPos);
                    // Only open if query is short & doesn't contain whitespace or newline
                    if (query.length <= 30 && !/[\s\n]/.test(query)) {
                        return { anchor: i, query };
                    }
                }
                return null;
            }
            if (/[\s\n]/.test(ch)) return null; // whitespace breaks the mention
            i--;
        }
        return null;
    }, []);

    const onTextChange = (e) => {
        const next = e.target.value;
        setText(next);
        const cursor = e.target.selectionStart || next.length;
        const m = detectMentionAtCursor(next, cursor);
        if (m) {
            setMentionOpen(true);
            setMentionQuery(m.query);
            setMentionAnchorStart(m.anchor);
            setMentionHoverIdx(0);
        } else {
            setMentionOpen(false);
        }
    };

    const filteredMembers = useMemo(() => {
        const q = mentionQuery.trim().toLowerCase();
        if (!members || members.length === 0) return [];
        const list = q
            ? members.filter(m => (m.name || "").toLowerCase().includes(q) || (m.employeeId || "").toLowerCase().includes(q))
            : members;
        return list.slice(0, 8); // cap
    }, [mentionQuery, members]);

    const insertMention = (member) => {
        if (!member || mentionAnchorStart < 0) { setMentionOpen(false); return; }
        const ta = textareaRef.current;
        const cursor = ta ? ta.selectionStart : text.length;
        const before = text.slice(0, mentionAnchorStart);
        const after = text.slice(cursor);
        const tag = `@${member.name} `;
        const next = before + tag + after;
        setText(next);
        setMentionOpen(false);
        setMentionedIds(prev => prev.includes(member.employeeId) ? prev : [...prev, member.employeeId]);
        // Restore caret right after the inserted mention
        const newCaret = (before + tag).length;
        setTimeout(() => {
            if (ta) {
                ta.focus();
                ta.selectionStart = ta.selectionEnd = newCaret;
                // Recompute height for textarea
                ta.style.height = "auto";
                ta.style.height = Math.min(ta.scrollHeight, 100) + "px";
            }
        }, 0);
    };

    return (
        <div style={{ position: "relative", background: "#202C33", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            {/* Error toast */}
            {error && <div style={{ padding: "6px 16px", background: "#B03A2E", color: "#fff", fontSize: 12, fontWeight: 600 }}>{error}</div>}

            {/* Attachment previews */}
            {attachments.length > 0 && (
                <div style={{ display: "flex", gap: 8, padding: "8px 16px 0", flexWrap: "wrap" }}>
                    {attachments.map((att, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "#2A3942", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: "#E9EDEF" }}>
                            {att.type === "image" && <img src={att.url} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} />}
                            {att.type === "pdf" && <span>📄</span>}
                            {att.type === "voice" && <span>🎤</span>}
                            <span style={{ maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                            <button onClick={() => setAttachments(p => p.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#8696A0", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>✕</button>
                        </div>
                    ))}
                </div>
            )}

            {/* Uploading indicator */}
            {uploading && <div style={{ padding: "4px 16px", fontSize: 11, color: "#00A884", display: "flex", alignItems: "center", gap: 6 }}><span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid #2A3942", borderTopColor: "#00A884", borderRadius: "50%", animation: "cwSpin 0.7s linear infinite" }} />Uploading…</div>}

            {/* NEW — Mention popup */}
            {mentionOpen && filteredMembers.length > 0 && (
                <div ref={mentionRef} style={{
                    position: "absolute", bottom: "100%", left: 12, right: 12,
                    maxWidth: 360, background: "#233138",
                    borderRadius: 12, boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
                    zIndex: 250, overflow: "hidden",
                    fontFamily: "inherit",
                }}>
                    <div style={{ padding: "8px 14px 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#8696A0", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        {mentionQuery ? `Mention · "${mentionQuery}"` : "Mention a member"}
                    </div>
                    <div style={{ maxHeight: 240, overflowY: "auto" }}>
                        {filteredMembers.map((m, i) => (
                            <button
                                key={m.employeeId || i}
                                onMouseEnter={() => setMentionHoverIdx(i)}
                                onClick={() => insertMention(m)}
                                style={{
                                    display: "flex", alignItems: "center", gap: 10,
                                    width: "100%", padding: "8px 14px",
                                    background: i === mentionHoverIdx ? "rgba(0,168,132,0.14)" : "none",
                                    border: "none", cursor: "pointer",
                                    color: "#E9EDEF", fontSize: 13, fontFamily: "inherit",
                                    textAlign: "left", transition: "background 0.1s",
                                }}
                            >
                                {/* Avatar */}
                                {m.profilePicUrl
                                    ? <img src={m.profilePicUrl} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                                    : <div style={{
                                        width: 28, height: 28, borderRadius: "50%",
                                        background: avatarColor(m.employeeId || m.name || ""),
                                        color: "#fff", fontSize: 11, fontWeight: 700,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        flexShrink: 0,
                                    }}>{initials(m.name)}</div>
                                }
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: "#E9EDEF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {m.name || m.employeeId}
                                    </div>
                                    {m.employeeId && m.name && (
                                        <div style={{ fontSize: 10, color: "#8696A0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {m.employeeId}
                                        </div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Emoji panel */}
            {showEmoji && (
                <div ref={emojiRef} style={{ position: "absolute", bottom: "100%", left: 0, width: "min(340px, 100vw)", background: "#233138", borderRadius: "12px 12px 0 0", boxShadow: "0 -4px 24px rgba(0,0,0,0.4)", zIndex: 300, display: "flex", flexDirection: "column", maxHeight: 300 }}>
                    {/* Search */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 6px" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8696A0" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                        <input autoFocus value={emojiSearch} onChange={e => setEmojiSearch(e.target.value)} placeholder="Search emoji…" style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "none", outline: "none", color: "#E9EDEF", fontSize: 12, padding: "5px 10px", borderRadius: 8, fontFamily: "inherit" }} />
                        {emojiSearch && <button onClick={() => setEmojiSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#8696A0", fontSize: 13, padding: 0 }}>✕</button>}
                    </div>
                    {/* Tabs */}
                    {!emojiSearch && <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 8px" }}>
                        {["🕐", ...EMOJI_CATS.map(c => c.icon)].map((icon, i) => (
                            <button key={i} onClick={() => setEmojiTab(i === 0 ? -1 : i - 1)} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", padding: "6px 7px", borderBottom: `2px solid ${(i === 0 ? emojiTab === -1 : emojiTab === i - 1) ? "#00A884" : "transparent"}`, opacity: (i === 0 ? emojiTab === -1 : emojiTab === i - 1) ? 1 : 0.5, flexShrink: 0 }}>{icon}</button>
                        ))}
                    </div>}
                    {/* Grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 1, padding: "6px 6px 8px", overflowY: "auto", flex: 1 }}>
                        {displayEmojis.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#8696A0", fontSize: 12, padding: "16px 0" }}>{emojiSearch ? "No results" : "No recent emojis"}</div>}
                        {displayEmojis.map((emoji, i) => (
                            <button key={i} onClick={() => insertEmoji(emoji)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "4px 2px", borderRadius: 6, lineHeight: 1 }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                                onMouseLeave={e => e.currentTarget.style.background = "none"}
                            >{emoji}</button>
                        ))}
                    </div>
                </div>
            )}

            {/* Attachment menu popup */}
            {showAttMenu && (
                <div ref={attMenuRef} style={{ position: "absolute", bottom: "calc(100% + 4px)", left: 12, background: "#233138", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.4)", zIndex: 200, overflow: "hidden", minWidth: 160 }}>
                    <button onClick={() => imageRef.current?.click()} style={attMenuBtn}>
                        <span style={{ fontSize: 18 }}>🖼️</span> Image
                    </button>
                    <button onClick={() => pdfRef.current?.click()} style={attMenuBtn}>
                        <span style={{ fontSize: 18 }}>📄</span> Document
                    </button>
                </div>
            )}

            {/* ── RECORDING MODE ── */}
            {recording ? (
                <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", gap: 10, minHeight: 56 }}>
                    {/* Cancel */}
                    <button onClick={cancelRecording} style={iconBtn("#FF6B6B")}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                    </button>
                    {/* Timer */}
                    <span style={{ fontSize: 14, fontWeight: 600, color: recPaused ? "#8696A0" : "#FF6B6B", minWidth: 40, fontVariantNumeric: "tabular-nums" }}>{fmt(recSeconds)}</span>
                    {/* Waveform */}
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 2, height: 36, overflow: "hidden" }}>
                        {waveform.map((h, i) => (
                            <div key={i} style={{ width: 3, height: h, background: recPaused ? "#8696A0" : "#00A884", borderRadius: 2, transition: "height 0.08s ease", flexShrink: 0 }} />
                        ))}
                    </div>
                    {/* Pause/Resume */}
                    <button onClick={recPaused ? resumeRecording : pauseRecording} style={iconBtn("#8696A0")}>
                        {recPaused
                            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" /><polygon points="10 8 16 12 10 16 10 8" /></svg>
                            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                        }
                    </button>
                    {/* Send recording */}
                    <button onClick={sendRecording} style={{ ...iconBtn("#00A884"), background: "#00A884", borderRadius: "50%", width: 42, height: 42, color: "#fff" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                    </button>
                </div>
            ) : (
                /* ── NORMAL INPUT MODE ── */
                <div style={{ display: "flex", alignItems: "flex-end", padding: "8px 10px", gap: 6, minHeight: 56 }}>
                    <input ref={imageRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImages} />
                    <input ref={pdfRef} type="file" accept="application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.rar,.7z" style={{ display: "none" }} onChange={handlePDF} />

                    {/* + Attachment */}
                    <button onClick={() => { setShowAttMenu(p => !p); setShowEmoji(false); }} disabled={disabled || uploading} style={iconBtn("#8696A0")}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>

                    {/* Emoji button */}
                    <button onClick={() => { setShowEmoji(p => !p); setShowAttMenu(false); }} disabled={disabled} style={{ ...iconBtn("#8696A0"), color: showEmoji ? "#00A884" : "#8696A0" }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" /><line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" /></svg>
                    </button>

                    {/* Text input */}
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={onTextChange}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => {
                            // Re-detect mention when caret is moved by click
                            const cursor = e.target.selectionStart;
                            const m = detectMentionAtCursor(text, cursor);
                            if (m) { setMentionOpen(true); setMentionQuery(m.query); setMentionAnchorStart(m.anchor); setMentionHoverIdx(0); }
                            else setMentionOpen(false);
                        }}
                        placeholder={uploading ? "Uploading…" : placeholder}
                        rows={1}
                        disabled={disabled || uploading}
                        style={{ flex: 1, background: "#2A3942", border: "none", outline: "none", color: "#267dff", fontSize: 13, padding: "8px 14px", borderRadius: 24, resize: "none", fontFamily: "inherit", lineHeight: 1.5, maxHeight: 100, overflowY: "auto", boxSizing: "border-box", caretColor: "#00A884" }}
                        onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px"; }}
                    />

                    {/* Send or Mic */}
                    {canSend ? (
                        <button onClick={handleSend} style={{ ...iconBtn("#00A884"), background: "#00A884", borderRadius: "50%", width: 42, height: 42, color: "#fff", flexShrink: 0 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                        </button>
                    ) : (
                        <button onClick={startRecording} disabled={disabled || uploading} style={{ ...iconBtn("#00A884"), background: "#00A884", borderRadius: "50%", width: 42, height: 42, color: "#fff", flexShrink: 0 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0014 0" /><path d="M12 19v3" />
                            </svg>
                        </button>
                    )}
                </div>
            )}

            <style>{`@keyframes cwSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ── Helpers for the mention popup ────────────────────────────────────────────
function initials(name) {
    if (!name) return "?";
    const parts = String(name).trim().split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}
function avatarColor(seed) {
    const palette = ["#0F766E", "#9333EA", "#DB2777", "#EA580C", "#2563EB", "#059669", "#DC2626", "#CA8A04"];
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
}

const iconBtn = (color) => ({ width: 40, height: 38, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: "50%", cursor: "pointer", color, flexShrink: 10, transition: "background 0.12s" });
const attMenuBtn = { display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", color: "#E9EDEF", fontSize: 13, fontFamily: "inherit", transition: "background 0.1s" };