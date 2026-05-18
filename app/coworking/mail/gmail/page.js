"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useCoworkAuth } from "../../../../hooks/useCoworkAuth";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const G = `${BASE}/api/google/employee-gmail`;

const api = {
    inbox: (id, max = 50, page = "", label = "INBOX", q = "") =>
        fetch(`${G}/inbox?employeeId=${encodeURIComponent(id)}&max=${max}&pageToken=${encodeURIComponent(page || "")}&labelId=${label}&q=${encodeURIComponent(q || "")}`).then(r => r.json()),
    markRead: (id, msgId, read) =>
        fetch(`${G}/mark-read`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: id, messageId: msgId, read }) }).then(r => r.json()),
    star: (id, msgId, star) =>
        fetch(`${G}/star`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: id, messageId: msgId, star }) }).then(r => r.json()),
    trash: (id, msgId) =>
        fetch(`${G}/trash`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: id, messageId: msgId }) }).then(r => r.json()),
    archive: (id, msgId) =>
        fetch(`${G}/archive`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: id, messageId: msgId }) }).then(r => r.json()),
    send: (id, data) =>
        fetch(`${G}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: id, ...data }) }).then(r => r.json()),
    reply: (id, msgId, data) =>
        fetch(`${G}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: id, messageId: msgId, ...data }) }).then(r => r.json()),
    attachment: (id, msgId, attId) =>
        fetch(`${G}/attachment?employeeId=${encodeURIComponent(id)}&messageId=${encodeURIComponent(msgId)}&attachmentId=${encodeURIComponent(attId)}`).then(r => r.json()),
    labels: (id) =>
        fetch(`${G}/labels?employeeId=${encodeURIComponent(id)}`).then(r => r.json()),
    thread: (id, threadId) =>
        fetch(`${G}/thread?employeeId=${encodeURIComponent(id)}&threadId=${encodeURIComponent(threadId)}`).then(r => r.json()),
};

// getFromName — shows real display name if sender set one in Google,
// otherwise shows full email address (honest, never guesses/mangles usernames)
const getFromName = (from = "") => {
    if (!from) return "Unknown";
    // "Pramod Biswal <email@gmail.com>" — has real display name before <
    if (from.includes("<")) {
        const name = from.split("<")[0].trim().replace(/"/g, "").trim();
        if (name) return name;                          // real Google display name ✓
        const email = from.match(/<(.+?)>/)?.[1] || "";
        return email || "Unknown";                      // fallback: full email address
    }
    // Bare email: show it as-is — don't mangle the username
    if (from.includes("@")) return from.trim();
    return from || "Unknown";
};
const getEmail = (from = "") => { const m = from.match(/<(.+?)>/); return m ? m[1] : from; };
const initials = (name = "") => (name || "?").trim().split(/\s+/).map(w => w[0] || "").join("").slice(0, 2).toUpperCase();
const avatarColor = (name = "") => {
    const c = ["#1a73e8", "#0f9d58", "#e37400", "#a142f4", "#d93025", "#1e8e3e", "#7627bb", "#185abc", "#137333", "#c5221f"];
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % c.length;
    return c[Math.abs(h)];
};
const fmtDate = (ms) => {
    if (!ms) return "";
    const d = new Date(ms), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtDateLong = (ms) => !ms ? "" : new Date(ms).toLocaleString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fileIcon = (mime = "") => {
    if (mime.includes("pdf")) return "📄";
    if (mime.includes("image")) return "🖼️";
    if (mime.includes("word") || mime.includes("document")) return "📝";
    if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv")) return "📊";
    if (mime.includes("zip") || mime.includes("archive")) return "🗜️";
    if (mime.includes("video")) return "🎬";
    if (mime.includes("audio")) return "🎵";
    return "📎";
};
const fmtBytes = (b) => !b ? "" : b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(0)}KB` : `${(b / 1048576).toFixed(1)}MB`;

const SYS_FOLDERS = [
    { id: "INBOX", label: "Inbox", icon: "inbox" },
    { id: "STARRED", label: "Starred", icon: "star" },
    { id: "SENT", label: "Sent", icon: "send" },
    { id: "DRAFT", label: "Drafts", icon: "draft" },
    { id: "TRASH", label: "Trash", icon: "trash" },
    { id: "SPAM", label: "Spam", icon: "spam" },
];

const IC = {
    menu: "M4 6h16M4 12h16M4 18h16",
    compose: "M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z",
    inbox: "M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11zM22 12H16l-2 3h-4l-2-3H2",
    star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
    send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
    draft: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 13h6M9 17h4",
    trash: "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2",
    spam: "M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zM12 8v4M12 16h.01",
    search: "M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z",
    refresh: "M23 4v6h-6M20.49 15a9 9 0 11-2.12-9.36L23 10",
    back: "M19 12H5M12 5l-7 7 7 7",
    reply: "M9 17l-5-5 5-5M20 18v-2a4 4 0 00-4-4H4",
    forward: "M15 17l5-5-5-5M4 18v-2a4 4 0 014-4h12",
    archive: "M21 8v13H3V8M1 3h22v5H1zM10 12h4",
    x: "M18 6L6 18M6 6l12 12",
    attach: "M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l8.57-8.57A4 4 0 1117.93 8.8l-8.59 8.57a2 2 0 01-2.83-2.83l8.49-8.48",
    label: "M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01",
    chevD: "M6 9l6 6 6-6",
    chevR: "M9 18l6-6-6-6",
    check: "M20 6L9 17l-5-5",
    settings: "M12 15a3 3 0 100-6 3 3 0 000 6z",
    expand: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
    minimize: "M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7",
    bold: "M6 4h8a4 4 0 010 8H6zM6 12h9a4 4 0 010 8H6z",
    italic: "M19 4h-9M14 20H5M15 4L9 20",
    underline: "M6 3v7a6 6 0 006 6 6 6 0 006-6V3M4 21h16",
    link: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",
    print: "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z",
    unread: "M2 9l10 6 10-6M12 3H2v12h20V3H12z",
    moreV: "M12 13a1 1 0 100-2 1 1 0 000 2zM12 6a1 1 0 100-2 1 1 0 000 2zM12 20a1 1 0 100-2 1 1 0 000 2z",
};

function Ic({ n, size = 16, stroke = "currentColor", fill = "none", sw = 1.9, style: s = {} }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0, ...s }}>
            <path d={IC[n] || ""} />
        </svg>
    );
}

function GmailLogo({ size = 28 }) {
    const h = size * 0.75;
    return (
        <svg width={size} height={h} viewBox="0 0 52 39" style={{ display: "block" }}>
            <path fill="#4285F4" d="M0 39V9.3L26 26 52 9.3V39z" />
            <path fill="#34A853" d="M0 39V0h52v39z" opacity="0" />
            <path fill="#FBBC05" d="M0 9.3L26 26 52 9.3 26 0z" />
            <path fill="#EA4335" d="M0 39V9.3L0 0h52v9.3L26 26 0 9.3z" opacity="0" />
            <path fill="#EA4335" d="M0 0l26 26L0 9.3z" />
            <path fill="#FBBC05" d="M52 0L26 26l26-16.7z" />
            <path fill="#34A853" d="M52 9.3V39H0V9.3L26 26z" opacity="0.5" />
            <path fill="#4285F4" d="M0 39l26-13 26 13H0z" opacity="0" />
        </svg>
    );
}

function GmailWordmark() {
    return (
        <svg viewBox="0 0 75 24" width="75" height="24" style={{ display: "block" }}>
            <path fill="#4285F4" d="M1.75 8.5v7h2.5v-5.5l3.25 3.5 3.25-3.5V15.5h2.5v-7L9.5 12.25z" />
            <path fill="#EA4335" d="M16 5.5C13.5 5.5 11.5 7.5 11.5 10s2 4.5 4.5 4.5c1.2 0 2.3-.5 3.1-1.3l-1.6-1.6c-.4.4-.9.6-1.5.6-1.1 0-2-.9-2-2s.9-2 2-2c.8 0 1.5.5 1.8 1.2H15v2h5c.1-.3.1-.7.1-1 0-2.8-2-5-4.1-5z" />
            <path fill="#FBBC05" d="M25.5 5.5c-2.5 0-4.5 2-4.5 4.5s2 4.5 4.5 4.5 4.5-2 4.5-4.5-2-4.5-4.5-4.5zm0 6.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
            <path fill="#4285F4" d="M35 5.5c-2.5 0-4.5 2-4.5 4.5s2 4.5 4.5 4.5 4.5-2 4.5-4.5-2-4.5-4.5-4.5zm0 6.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
            <path fill="#34A853" d="M44 5.5c-1.3 0-2.4.5-3.3 1.3V5.8h-2.5V18h2.5v-3.6c.9.7 2 1.1 3.3 1.1 2.5 0 4.5-2 4.5-4.5s-2-4.5-4.5-4.5zm0 6.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
            <path fill="#EA4335" d="M53 2.5h-2.5v12H53v-12z" />
        </svg>
    );
}

function Av({ name = "", size = 36 }) {
    return (
        <div style={{ width: size, height: size, borderRadius: "50%", background: avatarColor(name), color: "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.37), fontWeight: 700, userSelect: "none", letterSpacing: "-0.01em" }}>
            {initials(name)}
        </div>
    );
}

function Spin({ size = 20, color = "#1a73e8" }) {
    return <div style={{ width: size, height: size, borderRadius: "50%", border: `2.5px solid ${color}22`, borderTopColor: color, animation: "gm-spin 0.75s linear infinite", flexShrink: 0 }} />;
}

function IBtn({ icon, onClick, title, active = false, danger = false, size = 16, style: ext = {}, children }) {
    const [hov, setHov] = useState(false);
    return (
        <button title={title} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, width: 36, height: 36, borderRadius: "50%", border: "none", background: hov ? (danger ? "#fce8e6" : "#f1f3f4") : "transparent", color: danger ? "#d93025" : active ? "#1a73e8" : "#444746", cursor: "pointer", flexShrink: 0, fontFamily: "inherit", fontSize: 12, transition: "background 0.15s", ...ext }}>
            {icon && <Ic n={icon} size={size} stroke="currentColor" />}
            {children}
        </button>
    );
}

function Tip({ label, children }) {
    const [s, setS] = useState(false);
    return (
        <div style={{ position: "relative", display: "inline-flex" }} onMouseEnter={() => setS(true)} onMouseLeave={() => setS(false)}>
            {children}
            {s && label && (
                <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: "rgba(32,33,36,0.88)", color: "#fff", fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 4, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 9999 }}>
                    {label}
                </div>
            )}
        </div>
    );
}

// ── Compose Window — pixel-perfect Gmail ─────────────────────────────────────
function ComposeWin({ employeeId, connectedEmail, prefill = {}, onClose, onSent, isMobile = false }) {
    const [to, setTo] = useState(prefill.to || "");
    const [cc, setCc] = useState(prefill.cc || "");
    const [bcc, setBcc] = useState(prefill.bcc || "");
    const [subject, setSubject] = useState(prefill.subject || "");
    const [showCc, setShowCc] = useState(!!prefill.cc);
    const [showBcc, setShowBcc] = useState(false);
    const [sending, setSending] = useState(false);
    const [err, setErr] = useState("");
    const [mini, setMini] = useState(false);
    const [full, setFull] = useState(false);
    const [fmtOpen, setFmtOpen] = useState(false);
    const [fontFamily, setFontFamily] = useState("Sans Serif");
    const [fontSize, setFontSize] = useState("Normal");
    const [showFontDd, setShowFontDd] = useState(false);
    const [showSizeDd, setShowSizeDd] = useState(false);
    const [showColorDd, setShowColorDd] = useState(false);
    const [colorMode, setColorMode] = useState("text"); // "text"|"bg"
    const [showMoreDd, setShowMoreDd] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const bodyRef = useRef(null);
    const fileRef = useRef(null);
    const toRef = useRef(null);

    useEffect(() => {
        if (prefill.body && bodyRef.current) bodyRef.current.innerHTML = prefill.body;
        setTimeout(() => { (!prefill.to ? toRef.current : bodyRef.current)?.focus(); }, 80);
    }, []);

    useEffect(() => {
        const close = () => { setShowFontDd(false); setShowSizeDd(false); setShowColorDd(false); setShowMoreDd(false); };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, []);

    const exec = (cmd, val = null) => { document.execCommand(cmd, false, val); bodyRef.current?.focus(); };

    const FONTS = { "Sans Serif": "sans-serif", "Serif": "serif", "Fixed Width": "monospace", "Wide": "Arial Black,sans-serif", "Narrow": "Arial Narrow,sans-serif", "Garamond": "Garamond,serif", "Georgia": "Georgia,serif", "Tahoma": "Tahoma,sans-serif", "Trebuchet MS": "Trebuchet MS,sans-serif", "Verdana": "Verdana,sans-serif", "Comic Sans MS": "Comic Sans MS,cursive" };
    const SIZES = { "Tiny": "1", "Small": "2", "Normal": "3", "Large": "4", "Huge": "5", "Gigantic": "6" };
    const COLORS = ["#000", "#434343", "#666", "#999", "#b7b7b7", "#ccc", "#d9d9d9", "#fff", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#cfe2f3", "#d9d2e9", "#ead1dc", "#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#9fc5e8", "#b4a7d6", "#ea9999", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6fa8dc", "#8e7cc3", "#c27ba0", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3d85c8", "#674ea7", "#a61c00", "#783f04", "#7f6000", "#274e13", "#0c343d", "#1c4587", "#20124d", "#4c1130"];

    const applyFont = (f) => { exec("fontName", FONTS[f]); setFontFamily(f); setShowFontDd(false); };
    const applySize = (s) => { exec("fontSize", SIZES[s]); setFontSize(s); setShowSizeDd(false); };
    const applyColor = (c) => { exec(colorMode === "text" ? "foreColor" : "hiliteColor", c); setShowColorDd(false); bodyRef.current?.focus(); };

    const insertLink = () => {
        const url = prompt("URL:", "https://"); if (!url) return;
        const sel = window.getSelection()?.toString();
        if (sel) exec("createLink", url);
        else { const t = prompt("Display text:", "") || url; exec("insertHTML", `<a href="${url}">${t}</a>`); }
        bodyRef.current?.focus();
    };

    const handleFiles = e => {
        const files = Array.from(e.target.files || []); e.target.value = "";
        if (!files.length) return;
        // Store the actual File object so we can read it as base64 on send
        setAttachments(p => [...p, ...files.map(f => ({ name: f.name, size: f.size, type: f.type, file: f }))]);
    };

    // Read a File as base64 string (strips the data:...;base64, prefix)
    const readFileAsBase64 = (file) => new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
    });

    const handleSend = async () => {
        if (!to.trim()) { toRef.current?.focus(); return setErr("Specify at least one recipient."); }
        if (!subject.trim() && !window.confirm("Send without a subject?")) return;
        const body = bodyRef.current?.innerHTML || "";
        setSending(true); setErr("");
        try {
            // Encode all attachments as base64 before sending
            const encodedAtts = await Promise.all(
                attachments.map(async a => ({
                    name: a.name,
                    mimeType: a.type || "application/octet-stream",
                    data: a.file ? await readFileAsBase64(a.file) : (a.data || ""),
                }))
            );
            const res = prefill.replyToId
                ? await api.reply(employeeId, prefill.replyToId, { to, cc, subject, body, isHtml: true, attachments: encodedAtts })
                : await api.send(employeeId, { to, cc, bcc, subject, body, isHtml: true, attachments: encodedAtts });
            if (res?.success === false) setErr(res.message || "Send failed.");
            else { onSent?.(); onClose(); }
        } catch (e) { setErr(e.message || "Send failed."); }
        finally { setSending(false); }
    };

    const title = prefill.replyToId ? `Re: ${prefill.subject || ""}` : prefill.forwardFrom ? `Fwd: ${prefill.subject || ""}` : "New Message";

    // Shared icon button for toolbar
    const TBtn = ({ tip, onMD, children, active = false }) => {
        const [h, setH] = useState(false);
        return (
            <button title={tip} onMouseDown={e => { e.preventDefault(); onMD && onMD(); }}
                onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
                style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28,
                    border: "none", borderRadius: 3, background: h || active ? "rgba(0,0,0,0.1)" : "transparent",
                    cursor: "pointer", color: "#444", padding: 0, flexShrink: 0, transition: "background 0.1s"
                }}>
                {children}
            </button>
        );
    };

    // Round icon button for bottom bar
    const RBtn = ({ tip, onClick, onMD, children, active = false, danger = false, asLabel = false }) => {
        const [h, setH] = useState(false);
        const s = {
            width: 36, height: 36, borderRadius: "50%", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background 0.1s", flexShrink: 0,
            background: h ? (danger ? "#fce8e6" : active ? "#c2dbff" : "#f1f3f4") : (active ? "#e8f0fe" : "transparent"),
            color: danger ? "#d93025" : active ? "#1a73e8" : "#444746"
        };
        if (asLabel) return (
            <label style={s} title={tip} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>
                {children}
            </label>
        );
        return (
            <button title={tip} onClick={onClick} onMouseDown={onMD}
                onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={s}>
                {children}
            </button>
        );
    };

    // Dropdown container
    const DD = ({ open, style: s = {}, children, stopProp = true }) => open ? (
        <div onMouseDown={stopProp ? e => e.stopPropagation() : undefined}
            style={{ position: "absolute", background: "#fff", borderRadius: 4, boxShadow: "0 2px 10px rgba(0,0,0,0.2)", zIndex: 10000, minWidth: 160, padding: "4px 0", ...s }}>
            {children}
        </div>
    ) : null;

    const DDItem = ({ label, onMD, style: s = {} }) => (
        <button onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onMD && onMD(); }}
            style={{ display: "block", width: "100%", padding: "7px 16px", border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#202124", textAlign: "left", fontFamily: "inherit", transition: "background 0.08s", ...s }}
            onMouseEnter={e => e.currentTarget.style.background = "#f1f3f4"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}>
            {label}
        </button>
    );

    const W = full || isMobile ? "100vw" : "500px";
    // On mobile, always show as bottom-sheet style full width
    const mobH = isMobile ? "100dvh" : undefined;

    return (
        <>
            <style>{`
        .gmc *{box-sizing:border-box}
        .gmc-field{display:flex;align-items:center;border-bottom:1px solid #e8eaed;min-height:42px;padding:0 16px;gap:0;position:relative}
        .gmc-label{font-size:13px;color:#5f6368;min-width:28px;flex-shrink:0}
        .gmc-inp{flex:1;border:none;outline:none;font-size:14px;color:#202124;background:transparent;font-family:inherit;padding:8px 4px;min-width:0}
        .gmc-inp::placeholder{color:#80868b}
        .gmc-sep{width:1px;height:16px;background:#dadce0;flex-shrink:0;margin:0 1px}
        [contenteditable]:empty::before{content:attr(data-ph);color:#80868b;pointer-events:none}
      `}</style>

            <div className="gmc" style={{
                position: "fixed", bottom: 0, right: full || isMobile ? 0 : 20,
                width: W, height: mobH || (full ? "100vh" : mini ? "40px" : "560px"),
                background: "#fff",
                borderRadius: full ? 0 : "8px 8px 0 0",
                boxShadow: "0 2px 10px 1px rgba(60,64,67,0.3),0 6px 20px 4px rgba(60,64,67,0.15)",
                zIndex: 9999, display: "flex", flexDirection: "column", overflow: "hidden",
                transition: "height 0.15s ease,width 0.15s ease",
                fontFamily: "'Google Sans','Roboto',Arial,sans-serif",
            }}>

                {/* ── Title bar ── */}
                <div
                    onClick={() => setMini(m => !m)}
                    style={{
                        background: "#404040", height: 40, minHeight: 40, padding: "0 8px 0 16px",
                        display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none", flexShrink: 0
                    }}>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 6 }}>
                        {title}
                    </span>
                    <div style={{ display: "flex", gap: 0 }} onClick={e => e.stopPropagation()}>
                        {/* Minimize */}
                        <button onClick={() => setMini(m => !m)} title={mini ? "Restore" : "Minimize"}
                            style={{ width: 32, height: 40, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.75)", borderRadius: 3, transition: "background 0.1s" }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
                            onMouseLeave={e => e.currentTarget.style.background = "none"}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                {mini ? <path d="M5 15l7-7 7 7" /> : <path d="M5 12h14" />}
                            </svg>
                        </button>
                        {/* Full screen */}
                        <button onClick={() => setFull(f => !f)} title={full ? "Exit full screen" : "Full screen"}
                            style={{ width: 32, height: 40, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.75)", borderRadius: 3, transition: "background 0.1s" }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
                            onMouseLeave={e => e.currentTarget.style.background = "none"}>
                            {full
                                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3" /></svg>
                                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                            }
                        </button>
                        {/* Close */}
                        <button onClick={onClose} title="Close"
                            style={{ width: 32, height: 40, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.75)", borderRadius: 3, transition: "background 0.1s" }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
                            onMouseLeave={e => e.currentTarget.style.background = "none"}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>

                {!mini && (
                    <>
                        {/* ── To ── */}
                        <div className="gmc-field">
                            <span className="gmc-label">To</span>
                            <input ref={toRef} value={to} onChange={e => setTo(e.target.value)}
                                className="gmc-inp" type="text" placeholder="" />
                            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                                {!showCc && <button onClick={() => setShowCc(true)}
                                    style={{ border: "none", background: "none", fontSize: 12.5, fontWeight: 600, color: "#5f6368", cursor: "pointer", fontFamily: "inherit", padding: "2px 0", letterSpacing: "0.01em" }}
                                    onMouseEnter={e => e.currentTarget.style.color = "#202124"} onMouseLeave={e => e.currentTarget.style.color = "#5f6368"}>Cc</button>}
                                {!showBcc && <button onClick={() => setShowBcc(true)}
                                    style={{ border: "none", background: "none", fontSize: 12.5, fontWeight: 600, color: "#5f6368", cursor: "pointer", fontFamily: "inherit", padding: "2px 0", letterSpacing: "0.01em" }}
                                    onMouseEnter={e => e.currentTarget.style.color = "#202124"} onMouseLeave={e => e.currentTarget.style.color = "#5f6368"}>Bcc</button>}
                            </div>
                        </div>

                        {/* ── Cc ── */}
                        {showCc && (
                            <div className="gmc-field">
                                <span className="gmc-label">Cc</span>
                                <input value={cc} onChange={e => setCc(e.target.value)} className="gmc-inp" autoFocus />
                            </div>
                        )}

                        {/* ── Bcc ── */}
                        {showBcc && (
                            <div className="gmc-field">
                                <span className="gmc-label">Bcc</span>
                                <input value={bcc} onChange={e => setBcc(e.target.value)} className="gmc-inp" autoFocus />
                            </div>
                        )}

                        {/* ── Subject ── */}
                        <div className="gmc-field">
                            <input value={subject} onChange={e => setSubject(e.target.value)}
                                placeholder="Subject" className="gmc-inp"
                                style={{ fontSize: 14, fontWeight: 400, paddingLeft: 0 }} />
                        </div>

                        {/* ── Formatting bar (shown when fmtOpen) ── */}
                        {fmtOpen && (
                            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, padding: "4px 10px", borderBottom: "1px solid #e8eaed", flexShrink: 0, background: "#fafafa" }}>

                                {/* Font family */}
                                <div style={{ position: "relative" }} onMouseDown={e => e.stopPropagation()}>
                                    <button onMouseDown={e => { e.preventDefault(); setShowFontDd(s => !s); setShowSizeDd(false); setShowColorDd(false); }}
                                        style={{ display: "flex", alignItems: "center", gap: 3, padding: "0 6px", height: 26, border: "none", borderRadius: 3, background: showFontDd ? "rgba(0,0,0,0.1)" : "transparent", cursor: "pointer", fontSize: 12, color: "#444", fontFamily: FONTS[fontFamily] || "inherit", maxWidth: 96, whiteSpace: "nowrap", overflow: "hidden", transition: "background 0.1s" }}
                                        onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.1)"} onMouseLeave={e => { if (!showFontDd) e.currentTarget.style.background = "transparent"; }}>
                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{fontFamily}</span>
                                        <svg width="9" height="9" viewBox="0 0 10 6" fill="currentColor"><path d="M0 0l5 6 5-6z" /></svg>
                                    </button>
                                    <DD open={showFontDd} style={{ top: "calc(100% + 2px)", left: 0, minWidth: 150 }}>
                                        {Object.keys(FONTS).map(f => (
                                            <DDItem key={f} label={f} onMD={() => applyFont(f)}
                                                style={{ fontFamily: FONTS[f], fontWeight: f === fontFamily ? 600 : 400, background: f === fontFamily ? "#e8f0fe" : "none" }} />
                                        ))}
                                    </DD>
                                </div>
                                <div className="gmc-sep" />

                                {/* Font size */}
                                <div style={{ position: "relative" }} onMouseDown={e => e.stopPropagation()}>
                                    <button onMouseDown={e => { e.preventDefault(); setShowSizeDd(s => !s); setShowFontDd(false); setShowColorDd(false); }}
                                        style={{ display: "flex", alignItems: "center", gap: 3, padding: "0 6px", height: 26, border: "none", borderRadius: 3, background: showSizeDd ? "rgba(0,0,0,0.1)" : "transparent", cursor: "pointer", fontSize: 12, color: "#444", whiteSpace: "nowrap", transition: "background 0.1s" }}
                                        onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.1)"} onMouseLeave={e => { if (!showSizeDd) e.currentTarget.style.background = "transparent"; }}>
                                        {fontSize}
                                        <svg width="9" height="9" viewBox="0 0 10 6" fill="currentColor"><path d="M0 0l5 6 5-6z" /></svg>
                                    </button>
                                    <DD open={showSizeDd} style={{ top: "calc(100% + 2px)", left: 0, minWidth: 110 }}>
                                        {Object.keys(SIZES).map(s => (
                                            <DDItem key={s} label={s} onMD={() => applySize(s)}
                                                style={{ fontWeight: s === fontSize ? 600 : 400, background: s === fontSize ? "#e8f0fe" : "none" }} />
                                        ))}
                                    </DD>
                                </div>
                                <div className="gmc-sep" />

                                {/* Bold */}
                                <TBtn tip="Bold (Ctrl+B)" onMD={() => exec("bold")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h8a4 4 0 010 8H6zM6 12h9a4 4 0 010 8H6z" /></svg>
                                </TBtn>
                                {/* Italic */}
                                <TBtn tip="Italic (Ctrl+I)" onMD={() => exec("italic")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" /></svg>
                                </TBtn>
                                {/* Underline */}
                                <TBtn tip="Underline (Ctrl+U)" onMD={() => exec("underline")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 3v7a6 6 0 0012 0V3" /><line x1="4" y1="21" x2="20" y2="21" /></svg>
                                </TBtn>
                                {/* Strikethrough */}
                                <TBtn tip="Strikethrough" onMD={() => exec("strikeThrough")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /><path d="M16 6c0 0-1.5-2-4-2-3 0-5 2-5 4s2 3 5 4" /><path d="M8 18c0 0 1.5 2 4 2 3 0 5-2 5-4s-2-3-5-4" /></svg>
                                </TBtn>
                                <div className="gmc-sep" />

                                {/* Text color */}
                                <div style={{ position: "relative" }} onMouseDown={e => e.stopPropagation()}>
                                    <button onMouseDown={e => { e.preventDefault(); setColorMode("text"); setShowColorDd(s => s && colorMode === "text" ? false : true); setShowFontDd(false); setShowSizeDd(false); }}
                                        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, width: 28, height: 28, border: "none", borderRadius: 3, background: showColorDd && colorMode === "text" ? "rgba(0,0,0,0.1)" : "transparent", cursor: "pointer", transition: "background 0.1s" }}
                                        title="Text color"
                                        onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.1)"} onMouseLeave={e => { if (!(showColorDd && colorMode === "text")) e.currentTarget.style.background = "transparent"; }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: "#202124", lineHeight: 1, fontFamily: "serif" }}>A</span>
                                        <div style={{ width: 14, height: 3, background: "#db4437", borderRadius: 1 }} />
                                    </button>
                                    <button onMouseDown={e => { e.preventDefault(); setColorMode("bg"); setShowColorDd(s => s && colorMode === "bg" ? false : true); setShowFontDd(false); setShowSizeDd(false); }}
                                        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, width: 28, height: 28, border: "none", borderRadius: 3, background: showColorDd && colorMode === "bg" ? "rgba(0,0,0,0.1)" : "transparent", cursor: "pointer", transition: "background 0.1s" }}
                                        title="Highlight color"
                                        onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.1)"} onMouseLeave={e => { if (!(showColorDd && colorMode === "bg")) e.currentTarget.style.background = "transparent"; }}>
                                        <span style={{ fontSize: 11, lineHeight: 1, color: "#444" }}>▲</span>
                                        <div style={{ width: 14, height: 3, background: "#f4b400", borderRadius: 1 }} />
                                    </button>
                                    <DD open={showColorDd} style={{ top: "calc(100% + 2px)", left: 0, minWidth: "auto", padding: "10px" }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: "#5f6368", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>{colorMode === "text" ? "TEXT COLOR" : "HIGHLIGHT COLOR"}</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(8,22px)", gap: 3 }}>
                                            {COLORS.map((c, i) => (
                                                <button key={i} onMouseDown={e => { e.preventDefault(); applyColor(c); }}
                                                    style={{ width: 22, height: 22, borderRadius: 3, background: c, border: "1px solid rgba(0,0,0,0.12)", cursor: "pointer", padding: 0, transition: "transform 0.1s" }}
                                                    onMouseEnter={e => e.currentTarget.style.transform = "scale(1.2)"}
                                                    onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"} />
                                            ))}
                                        </div>
                                    </DD>
                                </div>
                                <div className="gmc-sep" />

                                {/* Align */}
                                <TBtn tip="Left" onMD={() => exec("justifyLeft")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" /></svg>
                                </TBtn>
                                <TBtn tip="Center" onMD={() => exec("justifyCenter")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
                                </TBtn>
                                <TBtn tip="Right" onMD={() => exec("justifyRight")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" /></svg>
                                </TBtn>
                                <div className="gmc-sep" />

                                {/* Lists */}
                                <TBtn tip="Bulleted list" onMD={() => exec("insertUnorderedList")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" /></svg>
                                </TBtn>
                                <TBtn tip="Numbered list" onMD={() => exec("insertOrderedList")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-2-2-1" strokeWidth="1.5" /></svg>
                                </TBtn>
                                <div className="gmc-sep" />

                                {/* Indent */}
                                <TBtn tip="Decrease indent" onMD={() => exec("outdent")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="21" y1="6" x2="9" y2="6" /><line x1="21" y1="12" x2="11" y2="12" /><line x1="21" y1="18" x2="9" y2="18" /><polyline points="7 8 3 12 7 16" /></svg>
                                </TBtn>
                                <TBtn tip="Increase indent" onMD={() => exec("indent")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="13" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /><polyline points="17 8 21 12 17 16" /></svg>
                                </TBtn>
                                <div className="gmc-sep" />

                                {/* Quote */}
                                <TBtn tip="Quote" onMD={() => exec("formatBlock", "blockquote")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zm12 0c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" /></svg>
                                </TBtn>

                                {/* Remove formatting */}
                                <TBtn tip="Remove formatting" onMD={() => exec("removeFormat")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7V4h16v3M9 20h6M8 7l3 13M13 7l2.5 10M5 7h14" /><line x1="20" y1="20" x2="4" y2="4" strokeWidth="1.5" /></svg>
                                </TBtn>
                            </div>
                        )}

                        {/* ── Body ── */}
                        <div ref={bodyRef} contentEditable suppressContentEditableWarning
                            data-ph="Compose email"
                            style={{
                                flex: 1, padding: "10px 16px", outline: "none", fontSize: 14, lineHeight: 1.75,
                                color: "#202124", overflowY: "auto", fontFamily: "Arial,sans-serif",
                                minHeight: 0, wordBreak: "break-word"
                            }}
                        />

                        {/* ── Attachments ── */}
                        {attachments.length > 0 && (
                            <div style={{ padding: "6px 16px 4px", borderTop: "1px solid #e8eaed", display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0 }}>
                                {attachments.map((a, i) => (
                                    <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 10px", background: "#f1f3f4", border: "1px solid #e0e0e0", borderRadius: 16, fontSize: 12, color: "#202124", maxWidth: 220 }}>
                                        <span style={{ fontSize: 14, flexShrink: 0 }}>{fileIcon(a.type)}</span>
                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{a.name}</span>
                                        <span style={{ color: "#80868b", fontSize: 11, flexShrink: 0 }}>({fmtBytes(a.size)})</span>
                                        <button onClick={() => setAttachments(p => p.filter((_, j) => j !== i))}
                                            style={{ background: "none", border: "none", cursor: "pointer", color: "#5f6368", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", fontSize: 16, lineHeight: 1, flexShrink: 0 }}
                                            onMouseEnter={e => { e.currentTarget.style.background = "#dadce0"; e.currentTarget.style.color = "#202124"; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#5f6368"; }}>×</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── Error ── */}
                        {err && (
                            <div style={{ padding: "6px 16px", background: "#fce8e6", borderTop: "1px solid #f5c6c2", fontSize: 12.5, color: "#c5221f", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c5221f" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                {err}
                                <button onClick={() => setErr("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#c5221f", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                            </div>
                        )}

                        {/* ── Bottom action bar ── */}
                        <div style={{ display: "flex", alignItems: "center", padding: "8px 10px 10px", borderTop: "1px solid #e8eaed", flexShrink: 0, gap: 2, background: "#fff" }}>

                            {/* Send + dropdown */}
                            <div style={{ display: "flex", marginRight: 4, borderRadius: 4, overflow: "hidden", boxShadow: "0 1px 3px rgba(26,115,232,0.3)", flexShrink: 0 }}>
                                <button onClick={handleSend} disabled={sending}
                                    style={{ padding: "0 20px", height: 36, background: sending ? "#6aa7f8" : "#1a73e8", color: "#fff", border: "none", borderRight: "1px solid rgba(255,255,255,0.3)", fontSize: 14, fontWeight: 500, cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 7, transition: "background 0.15s", letterSpacing: "0.01em" }}
                                    onMouseEnter={e => { if (!sending) e.currentTarget.style.background = "#1557b0"; }}
                                    onMouseLeave={e => e.currentTarget.style.background = sending ? "#6aa7f8" : "#1a73e8"}>
                                    {sending ? <><div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "gm-spin 0.75s linear infinite" }} />Sending…</> : "Send"}
                                </button>
                                <button style={{ width: 28, height: 36, background: "#1a73e8", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#1557b0"}
                                    onMouseLeave={e => e.currentTarget.style.background = "#1a73e8"}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M7 10l5 5 5-5H7z" /></svg>
                                </button>
                            </div>

                            {/* Formatting toggle (A with underline) */}
                            <RBtn tip={fmtOpen ? "Hide formatting" : "Formatting options"} active={fmtOpen}
                                onMD={e => { e.preventDefault(); setFmtOpen(s => !s); }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M4 7V4h16v3M9 20h6M12 4v16" />
                                </svg>
                            </RBtn>

                            {/* Attach — input moved outside label, triggered via ref.click() */}
                            <input
                                ref={fileRef}
                                type="file"
                                multiple
                                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.mp4,.mp3"
                                style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                                onChange={handleFiles}
                            />
                            <RBtn tip="Attach files" onClick={() => fileRef.current?.click()}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l8.57-8.57A4 4 0 1117.93 8.8l-8.59 8.57a2 2 0 01-2.83-2.83l8.49-8.48" />
                                </svg>
                            </RBtn>

                            {/* Link */}
                            <RBtn tip="Insert link" onMD={e => { e.preventDefault(); insertLink(); }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                                </svg>
                            </RBtn>

                            {/* Emoji */}
                            <RBtn tip="Insert emoji" onClick={() => { const e = prompt("Emoji:"); if (e) exec("insertText", e); }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                    <line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
                                </svg>
                            </RBtn>

                            {/* Drive */}
                            <RBtn tip="Insert files using Drive">
                                <svg width="18" height="18" viewBox="0 0 87 78">
                                    <path d="M56.4 31.5L42.2 7H8.3L0 21l28.2 48.8L42.4 47 56.4 31.5z" fill="#0066DA" />
                                    <path d="M56.4 31.5L87 31.5 78.7 17.5 57 17.5 42.2 7 28.2 7z" fill="#00AC47" />
                                    <path d="M0 21l14.2 24.5 28.2-24.5H0z" fill="#00832D" />
                                    <path d="M28.2 69.8L56.4 69.8 87 69.8 78.7 55.8 42.4 55.8 28.2 69.8z" fill="#2684FC" />
                                    <path d="M42.4 47L28.2 69.8 0 69.8 14.2 45.5z" fill="#00AC47" />
                                    <path d="M87 31.5L73 55.8 42.4 47 56.4 31.5z" fill="#0066DA" />
                                </svg>
                            </RBtn>

                            {/* Photo */}
                            <RBtn tip="Insert photo">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                </svg>
                            </RBtn>

                            <div style={{ flex: 1 }} />

                            {/* More options */}
                            <div style={{ position: "relative" }} onMouseDown={e => e.stopPropagation()}>
                                <RBtn tip="More options" active={showMoreDd} onClick={() => setShowMoreDd(s => !s)}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
                                    </svg>
                                </RBtn>
                                <DD open={showMoreDd} style={{ bottom: "calc(100% + 4px)", right: 0, minWidth: 180 }}>
                                    <DDItem label="Default to full-screen" onMD={() => { setFull(true); setShowMoreDd(false); }} />
                                    <DDItem label="Insert table" onMD={() => { exec("insertHTML", "<table border='1' cellpadding='6' style='border-collapse:collapse;width:100%'><tr><td>Cell</td><td>Cell</td></tr><tr><td>Cell</td><td>Cell</td></tr></table>"); setShowMoreDd(false); }} />
                                    <DDItem label="Insert horizontal line" onMD={() => { exec("insertHorizontalRule"); setShowMoreDd(false); }} />
                                    <DDItem label="Print" onMD={() => { window.print(); setShowMoreDd(false); }} />
                                    <div style={{ height: 1, background: "#e8eaed", margin: "4px 0" }} />
                                    <DDItem label="Discard draft" onMD={onClose} style={{ color: "#c5221f" }} />
                                </DD>
                            </div>

                            {/* Discard */}
                            <RBtn tip="Discard draft" danger onClick={onClose}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                </svg>
                            </RBtn>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}


// ── Email Row ─────────────────────────────────────────────────────────────────
function EmailRow({ email, selected, checked, onSelect, onCheck, onStar, onAction }) {
    const [hov, setHov] = useState(false);
    const fn = getFromName(email.from);

    return (
        <div onClick={() => onSelect(email)} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
            style={{ display: "flex", alignItems: "center", height: 52, cursor: "pointer", background: selected ? "#e8f0fe" : checked ? "#fef9e7" : hov ? "#f2f6fc" : "#fff", borderBottom: "1px solid #f0f0f0", transition: "background 0.08s", position: "relative", flexShrink: 0, paddingRight: 16 }}>

            {email.isUnread && !selected && (
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#1a73e8", borderRadius: "0 2px 2px 0" }} />
            )}

            {/* Checkbox */}
            <div onClick={e => { e.stopPropagation(); onCheck(); }}
                style={{ width: 52, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: hov || checked ? 1 : 0, transition: "opacity 0.15s" }}>
                <div style={{ width: 18, height: 18, borderRadius: 3, border: `2px solid ${checked ? "#1a73e8" : "#bdbdbd"}`, background: checked ? "#1a73e8" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.1s" }}>
                    {checked && <Ic n="check" size={11} stroke="#fff" sw={3} />}
                </div>
            </div>
            {!hov && !checked && (
                <div style={{ width: 52, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Av name={fn} size={32} />
                </div>
            )}

            {/* Star */}
            <div onClick={e => { e.stopPropagation(); onStar(email); }}
                style={{ width: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: email.isStarred ? "#f4b400" : hov ? "#dadce0" : "transparent", transition: "color 0.1s" }}>
                <Ic n="star" size={17} fill={email.isStarred ? "#f4b400" : "none"} stroke={email.isStarred ? "#f4b400" : "currentColor"} sw={1.8} />
            </div>

            {/* Sender */}
            <div style={{ width: 180, flexShrink: 0, fontSize: 13.5, fontWeight: email.isUnread ? 700 : 500, color: email.isUnread ? "#202124" : "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }}>
                {fn || "(unknown)"}
            </div>

            {/* Subject + snippet */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                <span style={{ fontSize: 13.5, fontWeight: email.isUnread ? 700 : 400, color: email.isUnread ? "#202124" : "#444", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0, maxWidth: "55%" }}>
                    {email.subject || "(no subject)"}
                </span>
                <span style={{ fontSize: 13, color: "#80868b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    — {email.snippet || ""}
                </span>
                {email.attachments?.length > 0 && <Ic n="attach" size={13} stroke="#80868b" style={{ flexShrink: 0 }} />}
            </div>

            {/* Hover actions */}
            {hov && (
                <div style={{ display: "flex", gap: 0, flexShrink: 0, marginLeft: 4 }} onClick={e => e.stopPropagation()}>
                    <Tip label="Archive"><IBtn icon="archive" size={15} style={{ width: 32, height: 32 }} onClick={() => onAction("archive", email)} /></Tip>
                    <Tip label="Delete"><IBtn icon="trash" size={15} style={{ width: 32, height: 32 }} danger onClick={() => onAction("trash", email)} /></Tip>
                    <Tip label="Mark unread"><IBtn icon="unread" size={15} style={{ width: 32, height: 32 }} onClick={() => onAction("markUnread", email)} /></Tip>
                </div>
            )}

            {/* Date */}
            {!hov && (
                <div style={{ width: 88, flexShrink: 0, textAlign: "right", fontSize: 12, color: email.isUnread ? "#202124" : "#80868b", fontWeight: email.isUnread ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>
                    {fmtDate(email.dateMs)}
                </div>
            )}
        </div>
    );
}

// ── Email Detail ──────────────────────────────────────────────────────────────
function EmailDetail({ email, employeeId, connectedEmail, onBack, onAction, onCompose, onNext, onPrev, onReplySent }) {
    const [moreInfo, setMoreInfo] = useState(false);
    const [replyOpen, setReplyOpen] = useState(false);
    const [fwdOpen, setFwdOpen] = useState(false);
    const [replySending, setReplySending] = useState(false);
    const [fwdSending, setFwdSending] = useState(false);
    const [fwdTo, setFwdTo] = useState("");
    const [dlding, setDlding] = useState({});
    const [threadMsgs, setThreadMsgs] = useState([email]); // starts with current email, loads full thread
    const [threadLoading, setThreadLoading] = useState(false);
    const [expandedIds, setExpandedIds] = useState(new Set([email.id])); // latest expanded by default
    const replyRef = useRef(null);
    const fwdRef = useRef(null);
    const fn = getFromName(email.from);
    const fe = getEmail(email.from);

    // Load full Gmail thread on mount
    useEffect(() => {
        if (!email.threadId) return;
        setThreadLoading(true);
        api.thread(employeeId, email.threadId)
            .then(res => {
                if (res.messages && res.messages.length > 0) {
                    setThreadMsgs(res.messages);
                    // Expand only the latest message
                    setExpandedIds(new Set([res.messages[res.messages.length - 1].id]));
                }
            })
            .catch(() => { }) // fail silently — still shows current email
            .finally(() => setThreadLoading(false));
    }, [email.id, email.threadId, employeeId]);

    // Refresh thread after reply sent
    const refreshThread = () => {
        if (!email.threadId) return;
        setTimeout(() => {
            api.thread(employeeId, email.threadId).then(res => {
                if (res.messages && res.messages.length > 0) {
                    setThreadMsgs(res.messages);
                    setExpandedIds(new Set([res.messages[res.messages.length - 1].id]));
                }
            }).catch(() => { });
            onReplySent?.();
        }, 1500);
    };

    // Smart reply-to: if mail was sent BY me, reply to recipient not myself
    // Priority: replyTo header > to field (if I'm sender) > from field
    const replyToAddr = (() => {
        const my = (connectedEmail || "").toLowerCase().trim();
        if (email.replyTo && !getEmail(email.replyTo).toLowerCase().includes(my)) return getEmail(email.replyTo);
        if (fe.toLowerCase() === my) return email.to || fe; // I sent it, reply to recipient
        return fe; // normal - reply to sender
    })();

    const dlAtt = async (att) => {
        if (dlding[att.id]) return;
        setDlding(d => ({ ...d, [att.id]: true }));
        try {
            const res = await api.attachment(employeeId, email.id, att.id);
            if (res?.data?.data) {
                const b64 = res.data.data.replace(/-/g, "+").replace(/_/g, "/");
                const bin = atob(b64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                const blob = new Blob([bytes], { type: att.mimeType || "application/octet-stream" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url; a.download = att.filename; a.click();
                setTimeout(() => URL.revokeObjectURL(url), 3000);
            }
        } catch (e) { alert("Download failed: " + e.message); }
        finally { setDlding(d => ({ ...d, [att.id]: false })); }
    };

    const handleReply = async () => {
        const body = replyRef.current?.innerHTML || "";
        if (!body.replace(/<[^>]*>/g, "").trim()) return;
        setReplySending(true);
        try {
            await api.reply(employeeId, email.id, { to: replyToAddr, subject: `Re: ${email.subject}`, body, isHtml: true });
            setReplyOpen(false);
            if (replyRef.current) replyRef.current.innerHTML = "";
            refreshThread(); // reload thread to show the new reply
        } catch (e) { alert("Send failed: " + e.message); }
        finally { setReplySending(false); }
    };

    const handleFwd = async () => {
        if (!fwdTo.trim()) { alert("Enter recipient."); return; }
        const extra = fwdRef.current?.innerHTML || "";
        setFwdSending(true);
        try {
            const body = `${extra}<br><br><div style="border-top:1px solid #e0e0e0;padding-top:10px;margin-top:10px;color:#5f6368;font-size:13px">
        <b>---------- Forwarded message ---------</b><br>
        <b>From:</b> ${email.from}<br>
        <b>Date:</b> ${fmtDateLong(email.dateMs)}<br>
        <b>Subject:</b> ${email.subject}<br>
        <b>To:</b> ${email.to || ""}</div><br>
        ${email.body || email.snippet || ""}`;
            await api.send(employeeId, { to: fwdTo, subject: `Fwd: ${email.subject}`, body, isHtml: true });
            setFwdOpen(false); setFwdTo("");
            if (fwdRef.current) fwdRef.current.innerHTML = "";
        } catch (e) { alert("Forward failed: " + e.message); }
        finally { setFwdSending(false); }
    };

    const ActionBtn = ({ label, icon, onClick, active }) => {
        const [h, setH] = useState(false);
        return (
            <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 18px", border: `1px solid ${h || active ? "#1a73e8" : "#dadce0"}`, borderRadius: 20, background: h || active ? "#e8f0fe" : "#fff", fontSize: 13.5, fontWeight: 500, color: h || active ? "#1a73e8" : "#444746", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                <Ic n={icon} size={15} />{label}
            </button>
        );
    };

    const InlineEditor = ({ rref, onSend, sending, onDiscard, toLine }) => (
        <div style={{ marginTop: 14, border: "1px solid #dadce0", borderRadius: 8, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
            {toLine && <div style={{ padding: "8px 14px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12.5, color: "#444", fontWeight: 500, width: 28, flexShrink: 0 }}>To</span>
                {toLine}
            </div>}
            <div ref={rref} contentEditable suppressContentEditableWarning data-placeholder="Write your message…"
                style={{ padding: "12px 14px", outline: "none", fontSize: 13.5, lineHeight: 1.7, color: "#202124", minHeight: 80, fontFamily: "inherit" }} autoFocus />
            <div style={{ padding: "8px 10px", borderTop: "1px solid #e0e0e0", background: "#f8f9fa", display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={onSend} disabled={sending}
                    style={{ padding: "7px 18px", background: sending ? "#6aa7f8" : "#1a73e8", color: "#fff", border: "none", borderRadius: 4, fontSize: 13.5, fontWeight: 500, cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                    {sending ? <><Spin size={13} color="#fff" /> Sending…</> : "Send"}
                </button>
                <button onClick={onDiscard} style={{ background: "none", border: "none", cursor: "pointer", color: "#5f6368", fontFamily: "inherit", fontSize: 13, padding: "7px 10px", borderRadius: 4 }}>Discard</button>
            </div>
        </div>
    );

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff" }}>
            {/* Toolbar */}
            <div style={{ padding: "0 12px", height: 52, display: "flex", alignItems: "center", gap: 4, borderBottom: "1px solid #e0e0e0", flexShrink: 0 }}>
                <Tip label="Back to inbox"><IBtn icon="back" onClick={onBack} /></Tip>
                <div style={{ width: 1, height: 24, background: "#e0e0e0", margin: "0 2px" }} />
                <Tip label="Archive"><IBtn icon="archive" onClick={() => { onAction("archive", email); onBack(); }} /></Tip>
                <Tip label="Report spam"><IBtn icon="spam" onClick={() => { onAction("spam", email); onBack(); }} /></Tip>
                <Tip label="Delete"><IBtn icon="trash" danger onClick={() => { onAction("trash", email); onBack(); }} /></Tip>
                <div style={{ width: 1, height: 24, background: "#e0e0e0", margin: "0 2px" }} />
                <Tip label="Mark as unread"><IBtn icon="unread" onClick={() => onAction("markUnread", email)} /></Tip>
                <Tip label={email.isStarred ? "Unstar" : "Star"}><IBtn icon="star" active={email.isStarred} onClick={() => onAction("star", email)} /></Tip>
                <Tip label="Print"><IBtn icon="print" /></Tip>
                <div style={{ flex: 1 }} />
                <Tip label="Newer"><IBtn onClick={onPrev} style={{ width: 32, height: 32 }}><Ic n="back" size={15} style={{ transform: "rotate(90deg)" }} /></IBtn></Tip>
                <Tip label="Older"><IBtn onClick={onNext} style={{ width: 32, height: 32 }}><Ic n="back" size={15} style={{ transform: "rotate(270deg)" }} /></IBtn></Tip>
            </div>

            {/* Body — threaded view */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px 60px" }}>

                {/* Subject */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
                    <h1 style={{ flex: 1, fontSize: 22, fontWeight: 400, color: "#202124", margin: 0, lineHeight: 1.35, letterSpacing: "-0.01em" }}>
                        {email.subject || "(no subject)"}
                        {threadMsgs.length > 1 && <span style={{ fontSize: 14, color: "#5f6368", fontWeight: 400, marginLeft: 10 }}>{threadMsgs.length}</span>}
                    </h1>
                    <Tip label="Print"><IBtn icon="print" style={{ flexShrink: 0 }} /></Tip>
                </div>

                {threadLoading && <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, color: "#5f6368", fontSize: 13 }}><Spin size={14} />Loading thread…</div>}

                {/* All thread messages stacked */}
                {threadMsgs.map((msg, idx) => {
                    const msgName = getFromName(msg.from);
                    const msgEmail = getEmail(msg.from);
                    const isExpanded = expandedIds.has(msg.id);
                    const isLast = idx === threadMsgs.length - 1;
                    return (
                        <div key={msg.id} style={{ marginBottom: 8, border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden", background: "#fff", boxShadow: isExpanded ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
                            {/* Message header — always visible, click to expand/collapse */}
                            <div onClick={() => setExpandedIds(prev => { const n = new Set(prev); n.has(msg.id) ? n.delete(msg.id) : n.add(msg.id); return n; })}
                                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", background: isExpanded ? "#fff" : "#fafafa", userSelect: "none" }}>
                                <Av name={msgName} size={36} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                                        <span style={{ fontSize: 13.5, fontWeight: 600, color: "#202124" }}>{msgName}</span>
                                        <span style={{ fontSize: 12, color: "#5f6368", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fmtDate(msg.dateMs)}</span>
                                    </div>
                                    {!isExpanded && (
                                        <div style={{ fontSize: 12.5, color: "#80868b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                                            {msg.snippet || ""}
                                        </div>
                                    )}
                                    {isExpanded && (
                                        <div style={{ fontSize: 12, color: "#5f6368", marginTop: 1 }}>
                                            to {msg.to?.split(",").slice(0, 2).join(", ")}
                                        </div>
                                    )}
                                </div>
                                {!isExpanded && msg.isStarred && <Ic n="star" size={14} fill="#f4b400" stroke="#f4b400" sw={1.5} />}
                                {isExpanded && (
                                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                        <Tip label={msg.isStarred ? "Unstar" : "Star"}><IBtn icon="star" size={14} active={msg.isStarred} style={{ width: 28, height: 28 }} onClick={() => onAction("star", msg)} /></Tip>
                                        <Tip label="Reply"><IBtn icon="reply" size={14} style={{ width: 28, height: 28 }} onClick={() => { setReplyOpen(true); setFwdOpen(false); }} /></Tip>
                                        <Tip label="More"><IBtn icon="moreV" size={14} style={{ width: 28, height: 28 }} /></Tip>
                                    </div>
                                )}
                            </div>

                            {/* Expanded body */}
                            {isExpanded && (
                                <div style={{ padding: "0 16px 16px 64px" }}>
                                    <div className="gm-email-body" dangerouslySetInnerHTML={{ __html: msg.body || `<p style="color:#5f6368;font-style:italic">${msg.snippet || "(no content)"}</p>` }} />

                                    {/* Attachments */}
                                    {msg.attachments?.length > 0 && (
                                        <div style={{ marginTop: 16 }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: "#5f6368", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                                                {msg.attachments.length} Attachment{msg.attachments.length !== 1 ? "s" : ""}
                                            </div>
                                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                                {msg.attachments.map((att, i) => (
                                                    <button key={i} onClick={() => dlAtt(att)} disabled={dlding[att.id]}
                                                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, background: "#f8f9fa", cursor: dlding[att.id] ? "wait" : "pointer", fontFamily: "inherit", transition: "all 0.15s", maxWidth: 200 }}
                                                        onMouseEnter={e => { e.currentTarget.style.borderColor = "#1a73e8"; e.currentTarget.style.background = "#e8f0fe"; }}
                                                        onMouseLeave={e => { e.currentTarget.style.borderColor = "#e0e0e0"; e.currentTarget.style.background = "#f8f9fa"; }}>
                                                        <span style={{ fontSize: 20, flexShrink: 0 }}>{fileIcon(att.mimeType)}</span>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontSize: 12, fontWeight: 600, color: "#202124", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{att.filename}</div>
                                                            {att.size > 0 && <div style={{ fontSize: 10, color: "#80868b" }}>{fmtBytes(att.size)}</div>}
                                                        </div>
                                                        {dlding[att.id] && <Spin size={13} />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Reply / Forward — always at bottom of thread */}
                <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
                    <ActionBtn label="Reply" icon="reply" active={replyOpen} onClick={() => { setReplyOpen(r => !r); setFwdOpen(false); }} />
                    <ActionBtn label="Forward" icon="forward" active={fwdOpen} onClick={() => { setFwdOpen(f => !f); setReplyOpen(false); }} />
                </div>

                {/* Inline reply */}
                {replyOpen && (
                    <InlineEditor
                        rref={replyRef}
                        onSend={handleReply}
                        sending={replySending}
                        onDiscard={() => setReplyOpen(false)}
                        toLine={<span style={{ fontSize: 13.5, color: "#5f6368" }}>{replyToAddr}</span>}
                    />
                )}

                {/* Inline forward */}
                {fwdOpen && (
                    <div style={{ marginTop: 14, border: "1px solid #dadce0", borderRadius: 8, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
                        <div style={{ padding: "8px 14px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12.5, color: "#444", fontWeight: 500, width: 28, flexShrink: 0 }}>To</span>
                            <input value={fwdTo} onChange={e => setFwdTo(e.target.value)} placeholder="Recipients"
                                style={{ flex: 1, border: "none", outline: "none", fontSize: 13.5, color: "#202124", fontFamily: "inherit", background: "transparent" }} autoFocus />
                        </div>
                        <div ref={fwdRef} contentEditable suppressContentEditableWarning
                            style={{ padding: "12px 14px", outline: "none", fontSize: 13.5, lineHeight: 1.7, color: "#202124", minHeight: 60, fontFamily: "inherit" }} />
                        <div style={{ padding: "6px 14px 8px", borderTop: "1px solid #e8eaed", background: "#f8f9fa", fontSize: 12, color: "#5f6368", lineHeight: 1.7 }}>
                            <div>---------- Forwarded message ---------</div>
                            <div><b>From:</b> {email.from}</div>
                            <div><b>Subject:</b> {email.subject}</div>
                        </div>
                        <div style={{ padding: "8px 10px", borderTop: "1px solid #e0e0e0", background: "#f8f9fa", display: "flex", gap: 8, alignItems: "center" }}>
                            <button onClick={handleFwd} disabled={fwdSending}
                                style={{ padding: "7px 18px", background: fwdSending ? "#6aa7f8" : "#1a73e8", color: "#fff", border: "none", borderRadius: 4, fontSize: 13.5, fontWeight: 500, cursor: fwdSending ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                                {fwdSending ? <><Spin size={13} color="#fff" /> Sending…</> : "Send"}
                            </button>
                            <button onClick={() => setFwdOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#5f6368", fontFamily: "inherit", fontSize: 13, padding: "7px 10px", borderRadius: 4 }}>Discard</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function GmailPage() {
    const { employeeId, loading: authLoading } = useCoworkAuth();
    const [emails, setEmails] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [connected, setConnected] = useState(false);
    const [connectedEmail, setConnectedEmail] = useState("");
    const [folder, setFolder] = useState("INBOX");
    const [nextPage, setNextPage] = useState(null);
    const [compose, setCompose] = useState(null);
    const [search, setSearch] = useState("");
    const [searchQ, setSearchQ] = useState("");
    const [spinning, setSpinning] = useState(false);
    const [checked, setChecked] = useState(new Set());
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [labelsOpen, setLabelsOpen] = useState(false);
    const [customLabels, setCustomLabels] = useState([]);
    const [isMobile, setIsMobile] = useState(false);
    const [mobilePanel, setMobilePanel] = useState("list");
    const searchRef = useRef(null);

    useEffect(() => {
        const c = () => setIsMobile(window.innerWidth < 768);
        c(); window.addEventListener("resize", c);
        return () => window.removeEventListener("resize", c);
    }, []);

    const load = useCallback(async (fld, q, page, quiet = false) => {
        if (!employeeId) return;
        if (!quiet) { page ? setLoadingMore(true) : setLoading(true); }
        setError(null);
        try {
            const res = await api.inbox(employeeId, 50, page || "", fld || "INBOX", q || "");
            if (!res.connected) { setConnected(false); return; }
            setConnected(true);
            setConnectedEmail(res.connectedEmail || "");
            setEmails(prev => page ? [...prev, ...(res.messages || [])] : (res.messages || []));
            setNextPage(res.nextPageToken || null);
            if (!page) { setSelected(null); setChecked(new Set()); }
        } catch (e) { setError(e.message || "Load failed"); }
        finally { setLoading(false); setLoadingMore(false); setSpinning(false); }
    }, [employeeId]);

    useEffect(() => {
        if (!authLoading && employeeId) load(folder, searchQ, "");
    }, [employeeId, authLoading, folder]);

    useEffect(() => {
        if (!employeeId) return;
        api.labels(employeeId).then(res => {
            if (res.labels) {
                setCustomLabels(res.labels.filter(l => l.type === "user" && !["INBOX", "SENT", "DRAFT", "TRASH", "SPAM", "STARRED", "UNREAD", "IMPORTANT", "CATEGORY_PERSONAL", "CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS", "CATEGORY_UPDATES", "CATEGORY_FORUMS"].includes(l.id)));
            }
        }).catch(() => { });
    }, [employeeId]);

    const handleSearch = e => {
        e.preventDefault();
        if (!search.trim()) { setSearchQ(""); load("INBOX", "", ""); return; }
        setSearchQ(search); load("SEARCH", search, "");
    };
    const clearSearch = () => { setSearch(""); setSearchQ(""); load(folder, "", ""); };
    const handleRefresh = () => { setSpinning(true); load(folder, searchQ, "", true); };

    const handleSelect = email => {
        setSelected(email);
        if (email.isUnread) {
            api.markRead(employeeId, email.id, true).catch(() => { });
            setEmails(p => p.map(e => e.id === email.id ? { ...e, isUnread: false } : e));
        }
    };

    const handleStar = email => {
        const ns = !email.isStarred;
        api.star(employeeId, email.id, ns).catch(() => { });
        setEmails(p => p.map(e => e.id === email.id ? { ...e, isStarred: ns } : e));
        if (selected?.id === email.id) setSelected(s => ({ ...s, isStarred: ns }));
    };

    const handleAction = async (action, email) => {
        try {
            if (action === "star") { handleStar(email); return; }
            if (action === "markUnread") {
                await api.markRead(employeeId, email.id, false);
                setEmails(p => p.map(e => e.id === email.id ? { ...e, isUnread: true } : e));
                return;
            }
            if (action === "archive") await api.archive(employeeId, email.id);
            if (action === "trash" || action === "spam") await api.trash(employeeId, email.id);
            setEmails(p => p.filter(e => e.id !== email.id));
            if (selected?.id === email.id) setSelected(null);
        } catch (e) { console.error("[action]", action, e.message); }
    };

    const toggleCheck = id => {
        setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };

    const handleSelectAll = () => {
        if (checked.size === emails.length) { setChecked(new Set()); }
        else { setChecked(new Set(emails.map(e => e.id))); }
    };

    const handleBulk = async (action) => {
        const ids = [...checked];
        await Promise.allSettled(ids.map(async id => {
            const em = emails.find(e => e.id === id);
            if (!em) return;
            if (action === "archive") await api.archive(employeeId, id);
            if (action === "trash") await api.trash(employeeId, id);
            if (action === "markRead") await api.markRead(employeeId, id, true);
            if (action === "markUnread") await api.markRead(employeeId, id, false);
            if (action === "star") await api.star(employeeId, id, true);
        }));
        if (action === "archive" || action === "trash") setEmails(p => p.filter(e => !ids.includes(e.id)));
        else if (action === "markRead") setEmails(p => p.map(e => ids.includes(e.id) ? { ...e, isUnread: false } : e));
        else if (action === "markUnread") setEmails(p => p.map(e => ids.includes(e.id) ? { ...e, isUnread: true } : e));
        else if (action === "star") setEmails(p => p.map(e => ids.includes(e.id) ? { ...e, isStarred: true } : e));
        setChecked(new Set());
    };

    const switchFolder = fld => { setFolder(fld); setSearch(""); setSearchQ(""); setSelected(null); setChecked(new Set()); load(fld, "", ""); };
    const unread = useMemo(() => emails.filter(e => e.isUnread).length, [emails]);
    const selIdx = useMemo(() => emails.findIndex(e => e.id === selected?.id), [emails, selected]);
    const showBulk = checked.size > 0;

    if (!authLoading && !loading && !connected) return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", background: "#f6f8fc", fontFamily: "Google Sans,Roboto,sans-serif", height: "100%" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(26,115,232,0.08)", border: "2px solid rgba(26,115,232,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <Ic n="inbox" size={32} stroke="#1a73e8" sw={1.5} />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 400, color: "#202124", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Gmail not connected</h2>
            <p style={{ fontSize: 14, color: "#5f6368", marginBottom: 28, lineHeight: 1.65, maxWidth: 320 }}>
                Connect your Gmail account in <strong>Settings → Connect Gmail</strong> to read and send emails directly from CoWork.
            </p>
            <a href="/coworking/settings" style={{ padding: "10px 28px", background: "#1a73e8", color: "#fff", borderRadius: 6, textDecoration: "none", fontSize: 14, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}>
                Open Settings
            </a>
        </div>
    );

    const mob = isMobile;
    const SW = mob ? 0 : sidebarCollapsed ? 72 : 256;

    
    const showSidebar = mob ? mobilePanel === "sidebar" : true;
    const showList = mob ? mobilePanel === "list" : true;
    const showDetail = mob ? mobilePanel === "detail" : true;

    // When email selected on mobile, go to detail panel
    const handleSelectResponsive = (email) => {
        handleSelect(email);
        if (mob) setMobilePanel("detail");
    };

    return (
        <>
            <style>{`
        .gmp{height:100%;display:flex;flex-direction:column;background:#f6f8fc;font-family:'Google Sans','Roboto',Arial,sans-serif;overflow:hidden;font-size:13px;color:#202124}
        .gmp *{box-sizing:border-box}
        @keyframes gm-spin{to{transform:rotate(360deg)}}
        .gmp ::-webkit-scrollbar{width:5px;height:5px}
        .gmp ::-webkit-scrollbar-track{background:transparent}
        .gmp ::-webkit-scrollbar-thumb{background:#dadce0;border-radius:99px}
        .gmp ::-webkit-scrollbar-thumb:hover{background:#bdc1c6}
        .gm-email-body{font-size:14px;line-height:1.75;color:#202124}
        .gm-email-body img{max-width:100%;height:auto}
        .gm-email-body a{color:#1a73e8}
        .gm-email-body pre{white-space:pre-wrap;font-family:monospace;font-size:13px;background:#f8f9fa;padding:12px;border-radius:6px;border:1px solid #e0e0e0}
        .gm-email-body blockquote{border-left:3px solid #dadce0;padding-left:12px;margin:8px 0;color:#5f6368}
        .gm-email-body table{border-collapse:collapse;max-width:100%}
        [contenteditable]:empty:before{content:attr(data-placeholder);color:#80868b;pointer-events:none}
        .gnav{display:flex;align-items:center;height:32px;padding:0 8px;border-radius:0 16px 16px 0;cursor:pointer;width:calc(100% - 8px);border:none;background:transparent;font-family:inherit;font-size:14px;font-weight:400;color:#202124;text-align:left;transition:background 0.1s;user-select:none}
        .gnav:hover{background:#e8eaed}
        .gnav.act{background:#d3e3fd;font-weight:600}
        .gnav .gi{width:40px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .gnav .gl{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .gnav .gc{font-size:12px;font-weight:500;color:#202124}
        /* Mobile sidebar overlay */
        .gm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:200;display:none}
        .gm-overlay.show{display:block}
        /* Mobile sidebar drawer */
        .gm-drawer{position:fixed;top:0;left:0;bottom:0;width:280px;background:#fff;z-index:201;transform:translateX(-100%);transition:transform 0.25s cubic-bezier(0.4,0,0.2,1);overflow-y:auto;display:flex;flex-direction:column;padding-top:8px}
        .gm-drawer.open{transform:translateX(0)}
        /* Mobile bottom nav */
        .gm-bottomnav{position:fixed;bottom:0;left:0;right:0;height:56px;background:#fff;border-top:1px solid #e0e0e0;display:flex;align-items:center;justify-content:space-around;z-index:100;padding:0 8px}
        .gm-bottomnav-btn{display:flex;flex-direction:column;align-items:center;gap:2px;border:none;background:none;cursor:pointer;padding:8px 12px;border-radius:16px;color:#5f6368;font-size:10px;font-family:inherit;transition:background 0.1s;flex:1;min-width:0}
        .gm-bottomnav-btn.act{color:#1a73e8}
        .gm-bottomnav-btn:hover{background:#f1f3f4}
        /* Mobile compose FAB */
        .gm-fab{position:fixed;bottom:68px;right:16px;width:56px;height:56px;border-radius:16px;background:#c2e7ff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.2),0 4px 8px rgba(0,0,0,0.1);z-index:99;transition:box-shadow 0.2s}
        .gm-fab:hover{box-shadow:0 2px 8px rgba(0,0,0,0.25),0 6px 16px rgba(0,0,0,0.12)}
        /* Email row responsive */
        @media(max-width:767px){
          .gm-row-sender{width:130px!important}
          .gm-email-pane{margin:0!important;border-radius:0!important;border-left:none!important;border-right:none!important}
          .gm-topbar{height:56px!important;padding:0 8px!important}
          .gm-logo-text{display:none!important}
        }
        @media(max-width:480px){
          .gm-row-sender{width:100px!important}
        }
      `}</style>

            <div className="gmp">

                {/* ── Top bar ── */}
                <div className="gm-topbar" style={{ height: 64, background: "#fff", display: "flex", alignItems: "center", padding: "0 16px", gap: 4, flexShrink: 0, borderBottom: "1px solid #e0e0e0" }}>
                    {/* Hamburger */}
                    <IBtn icon="menu" style={{ width: 40, height: 40, flexShrink: 0 }}
                        onClick={() => mob ? setMobilePanel(p => p === "sidebar" ? "list" : "sidebar") : setSidebarCollapsed(s => !s)} />

                    {/* Logo — hidden on mobile when in detail */}
                    {(!mob || (mob && mobilePanel !== "detail")) && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 4, flexShrink: 0 }}>
                            <svg width="32" height="24" viewBox="0 0 52 39" style={{ display: "block" }}>
                                <path fill="#EA4335" d="M0 39V9.75L26 28.5l26-18.75V39z" />
                                <path fill="#FBBC05" d="M0 9.75L26 28.5V0z" />
                                <path fill="#34A853" d="M52 9.75L26 28.5V0z" />
                                <path fill="#4285F4" d="M0 0h52v9.75L26 28.5 0 9.75z" />
                                <path fill="#1967D2" d="M0 0l26 9.75L52 0z" />
                            </svg>
                            <span className="gm-logo-text" style={{ fontSize: 20, fontWeight: 400, color: "#202124", letterSpacing: "-0.01em", userSelect: "none" }}>Gmail</span>
                        </div>
                    )}

                    {/* Mobile detail — back arrow + subject */}
                    {mob && mobilePanel === "detail" && selected && (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <button onClick={() => { setSelected(null); setMobilePanel("list"); }}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center", color: "#444746", flexShrink: 0 }}>
                                <Ic n="back" size={20} />
                            </button>
                            <span style={{ fontSize: 16, fontWeight: 400, color: "#202124", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                                {selected.subject || "(no subject)"}
                            </span>
                        </div>
                    )}

                    {/* Search — hidden on mobile detail */}
                    {(!mob || mobilePanel !== "detail") && (
                        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: mob ? undefined : 720, margin: mob ? "0 8px" : "0 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, background: mob ? "#f1f3f4" : "#e8f0fe", borderRadius: 24, padding: "0 14px", height: mob ? 40 : 46, border: "1px solid transparent", transition: "all 0.2s" }}
                                onFocus={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2)"; }}
                                onBlur={e => { e.currentTarget.style.background = mob ? "#f1f3f4" : "#e8f0fe"; e.currentTarget.style.boxShadow = "none"; }}>
                                <button type="submit" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "#444746", flexShrink: 0 }}>
                                    <Ic n="search" size={18} stroke="#444746" />
                                </button>
                                <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mail"
                                    style={{ flex: 1, border: "none", outline: "none", fontSize: mob ? 14 : 16, color: "#202124", background: "transparent", fontFamily: "inherit", minWidth: 0 }} />
                                {search && <button type="button" onClick={clearSearch} style={{ background: "none", border: "none", cursor: "pointer", color: "#444746", display: "flex", padding: 0, flexShrink: 0 }}><Ic n="x" size={15} /></button>}
                            </div>
                        </form>
                    )}

                    {/* Right icons */}
                    {!mob && (
                        <>
                            <IBtn style={{ width: 40, height: 40 }} onClick={handleRefresh}>
                                <div style={{ animation: spinning ? "gm-spin 0.75s linear infinite" : "none" }}><Ic n="refresh" size={18} /></div>
                            </IBtn>
                            <a href="/coworking/settings" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: "50%", color: "#444746", textDecoration: "none" }}
                                onMouseEnter={e => e.currentTarget.style.background = "#f1f3f4"}
                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                <Ic n="settings" size={20} />
                            </a>
                        </>
                    )}
                    {connectedEmail && (
                        <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, marginLeft: 4, background: avatarColor(connectedEmail), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, cursor: "default", userSelect: "none", border: "2px solid #fff", boxShadow: "0 0 0 1px #dadce0" }} title={connectedEmail}>
                            {(connectedEmail[0] || "G").toUpperCase()}
                        </div>
                    )}
                </div>

                {/* ── Body ── */}
                <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

                    {/* Mobile overlay — tap to close drawer */}
                    {mob && (
                        <div className={`gm-overlay${mobilePanel === "sidebar" ? " show" : ""}`}
                            onClick={() => setMobilePanel("list")} />
                    )}

                    {/* Mobile sidebar drawer */}
                    {mob && (
                        <div className={`gm-drawer${mobilePanel === "sidebar" ? " open" : ""}`}>
                            <div style={{ padding: "12px 16px 8px", display: "flex", alignItems: "center", gap: 10 }}>
                                <svg width="28" height="21" viewBox="0 0 52 39"><path fill="#EA4335" d="M0 39V9.75L26 28.5l26-18.75V39z" /><path fill="#FBBC05" d="M0 9.75L26 28.5V0z" /><path fill="#34A853" d="M52 9.75L26 28.5V0z" /><path fill="#4285F4" d="M0 0h52v9.75L26 28.5 0 9.75z" /></svg>
                                <span style={{ fontSize: 18, color: "#202124", fontWeight: 400 }}>Gmail</span>
                            </div>
                            <nav style={{ flex: 1, padding: "4px 0" }}>
                                {SYS_FOLDERS.map(f => {
                                    const act = folder === f.id && !searchQ;
                                    const cnt = f.id === "INBOX" ? unread : 0;
                                    return (
                                        <button key={f.id} onClick={() => { switchFolder(f.id); setMobilePanel("list"); }} className={`gnav${act ? " act" : ""}`}>
                                            <span className="gi"><Ic n={f.icon} size={18} fill={f.id === "STARRED" && act ? "#f4b400" : "none"} stroke={f.id === "STARRED" && act ? "#f4b400" : "currentColor"} sw={act ? 2.2 : 1.7} /></span>
                                            <span className="gl">{f.label}</span>
                                            {cnt > 0 && <span className="gc">{cnt}</span>}
                                        </button>
                                    );
                                })}
                            </nav>
                        </div>
                    )}

                    {/* Desktop sidebar */}
                    {!mob && (
                        <aside style={{ width: SW, flexShrink: 0, display: "flex", flexDirection: "column", overflowY: "auto", overflowX: "hidden", paddingTop: 8, paddingBottom: 16, background: "#f6f8fc", transition: "width 0.2s" }}>
                            <div style={{ padding: sidebarCollapsed ? "0 8px" : "0 8px 0 16px", marginBottom: 10 }}>
                                <button onClick={() => setCompose({})}
                                    style={{ display: "flex", alignItems: "center", gap: 12, padding: sidebarCollapsed ? "16px" : "16px 24px", background: "#fff", border: "none", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.15)", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500, color: "#202124", width: sidebarCollapsed ? 52 : "100%", justifyContent: sidebarCollapsed ? "center" : "flex-start", transition: "box-shadow 0.15s" }}
                                    onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.15)"; }}>
                                    <Ic n="compose" size={20} stroke="#444746" />
                                    {!sidebarCollapsed && <span>Compose</span>}
                                </button>
                            </div>
                            <nav>
                                {SYS_FOLDERS.map(f => {
                                    const act = folder === f.id && !searchQ;
                                    const cnt = f.id === "INBOX" ? unread : 0;
                                    return (
                                        <button key={f.id} onClick={() => switchFolder(f.id)} className={`gnav${act ? " act" : ""}`} title={sidebarCollapsed ? f.label : ""}>
                                            <span className="gi"><Ic n={f.icon} size={18} fill={f.id === "STARRED" && act ? "#f4b400" : "none"} stroke={f.id === "STARRED" && act ? "#f4b400" : "currentColor"} sw={act ? 2.2 : 1.7} /></span>
                                            {!sidebarCollapsed && <><span className="gl">{f.label}</span>{cnt > 0 && <span className="gc">{cnt}</span>}</>}
                                        </button>
                                    );
                                })}
                                {!sidebarCollapsed && customLabels.length > 0 && (
                                    <div style={{ marginTop: 6 }}>
                                        <button onClick={() => setLabelsOpen(s => !s)} className="gnav" style={{ color: "#5f6368", fontSize: 13 }}>
                                            <span className="gi"><Ic n={labelsOpen ? "chevD" : "chevR"} size={15} /></span>
                                            <span className="gl">{labelsOpen ? "Less" : "More"}</span>
                                        </button>
                                        {labelsOpen && customLabels.map(lbl => (
                                            <button key={lbl.id} onClick={() => { setFolder(lbl.id); setSearchQ(""); load(lbl.id, "", ""); }} className={`gnav${folder === lbl.id ? " act" : ""}`}>
                                                <span className="gi" style={{ color: lbl.color?.textColor || "#5f6368" }}><Ic n="label" size={16} fill="currentColor" stroke="none" /></span>
                                                <span className="gl">{lbl.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </nav>
                        </aside>
                    )}

                    {/* ── Email pane ── */}
                    <div className="gm-email-pane" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden", background: "#fff", margin: mob ? "0" : "0 8px 8px 0", borderRadius: mob ? 0 : 16, border: mob ? "none" : "1px solid #e0e0e0" }}>

                        {/* Mobile: show list OR detail based on panel */}
                        {mob && mobilePanel === "detail" && selected ? (
                            <EmailDetail
                                key={selected.id}
                                email={selected}
                                employeeId={employeeId}
                                connectedEmail={connectedEmail}
                                onBack={() => { setSelected(null); setMobilePanel("list"); }}
                                onAction={handleAction}
                                onCompose={setCompose}
                                onNext={() => { const n = emails[selIdx + 1]; if (n) { handleSelect(n); setMobilePanel("detail"); } }}
                                onPrev={() => { const p = emails[selIdx - 1]; if (p) { handleSelect(p); setMobilePanel("detail"); } }}
                                onReplySent={() => load(folder, searchQ, "", true)}
                            />
                        ) : !mob && selected ? (
                            <EmailDetail
                                key={selected.id}
                                email={selected}
                                employeeId={employeeId}
                                connectedEmail={connectedEmail}
                                onBack={() => setSelected(null)}
                                onAction={handleAction}
                                onCompose={setCompose}
                                onNext={() => { const n = emails[selIdx + 1]; if (n) handleSelect(n); }}
                                onPrev={() => { const p = emails[selIdx - 1]; if (p) handleSelect(p); }}
                                onReplySent={() => load(folder, searchQ, "", true)}
                            />
                        ) : (!mob || mobilePanel === "list") ? (
                            <>
                                {/* List toolbar */}
                                <div style={{ height: mob ? 48 : 52, padding: `0 ${mob ? 8 : 16}px`, display: "flex", alignItems: "center", gap: 4, borderBottom: "1px solid #e8eaed", flexShrink: 0, background: showBulk ? "#e8f0fe" : "#fff", transition: "background 0.2s" }}>
                                    {!mob && (
                                        <>
                                            <div onClick={handleSelectAll} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: "50%", flexShrink: 0 }}
                                                onMouseEnter={e => e.currentTarget.style.background = "#f1f3f4"}
                                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                                <div style={{ width: 18, height: 18, borderRadius: 3, border: `2px solid ${checked.size > 0 ? "#1a73e8" : "#bdbdbd"}`, background: checked.size === emails.length && emails.length > 0 ? "#1a73e8" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                    {checked.size > 0 && checked.size < emails.length && <div style={{ width: 10, height: 2, background: "#1a73e8", borderRadius: 1 }} />}
                                                    {checked.size === emails.length && emails.length > 0 && <Ic n="check" size={11} stroke="#fff" sw={3} />}
                                                </div>
                                            </div>
                                            <div style={{ width: 20, display: "flex", alignItems: "center", justifyContent: "center", color: "#5f6368" }}><Ic n="chevD" size={12} /></div>
                                        </>
                                    )}
                                    {showBulk && !mob ? (
                                        <>
                                            <span style={{ fontSize: 13, color: "#5f6368", marginLeft: 8 }}>{checked.size} selected</span>
                                            <div style={{ display: "flex", gap: 0, marginLeft: 8 }}>
                                                <Tip label="Archive"><IBtn icon="archive" onClick={() => handleBulk("archive")} /></Tip>
                                                <Tip label="Delete"><IBtn icon="trash" danger onClick={() => handleBulk("trash")} /></Tip>
                                                <Tip label="Mark read"><IBtn icon="check" onClick={() => handleBulk("markRead")} /></Tip>
                                                <Tip label="Mark unread"><IBtn icon="unread" onClick={() => handleBulk("markUnread")} /></Tip>
                                                <Tip label="Star all"><IBtn icon="star" onClick={() => handleBulk("star")} /></Tip>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            {mob && <span style={{ fontSize: 13, fontWeight: 600, color: "#202124", flex: 1 }}>{SYS_FOLDERS.find(f => f.id === folder)?.label || folder}{unread > 0 && <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 400, color: "#5f6368" }}>({unread})</span>}</span>}
                                            {!mob && <div style={{ flex: 1 }} />}
                                            <IBtn style={{ width: mob ? 32 : 36, height: mob ? 32 : 36 }} onClick={handleRefresh}>
                                                <div style={{ animation: spinning ? "gm-spin 0.75s linear infinite" : "none" }}><Ic n="refresh" size={mob ? 14 : 16} /></div>
                                            </IBtn>
                                            {!mob && emails.length > 0 && <div style={{ fontSize: 12, color: "#5f6368", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", marginRight: 4 }}>1–{emails.length}</div>}
                                            {!mob && <><IBtn style={{ width: 32, height: 32 }}><Ic n="back" size={15} style={{ transform: "rotate(90deg)" }} /></IBtn><IBtn style={{ width: 32, height: 32 }}><Ic n="back" size={15} style={{ transform: "rotate(270deg)" }} /></IBtn></>}
                                        </>
                                    )}
                                </div>

                                {/* Search banner */}
                                {searchQ && (
                                    <div style={{ padding: `8px ${mob ? 12 : 20}px`, borderBottom: "1px solid #e8eaed", fontSize: 13, color: "#5f6368", display: "flex", alignItems: "center", gap: 8 }}>
                                        <Ic n="search" size={14} /><span>Results for <strong style={{ color: "#202124" }}>"{searchQ}"</strong></span>
                                        <button onClick={clearSearch} style={{ marginLeft: 8, border: "none", background: "none", color: "#1a73e8", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 500, padding: "2px 6px", borderRadius: 4 }}>Clear</button>
                                    </div>
                                )}

                                {/* Email list */}
                                <div style={{ flex: 1, overflowY: "auto", paddingBottom: mob ? 56 : 0 }}>
                                    {loading ? (
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, color: "#5f6368" }}>
                                            <Spin size={32} /><span style={{ fontSize: 14 }}>Loading…</span>
                                        </div>
                                    ) : error ? (
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, padding: 32, textAlign: "center" }}>
                                            <div style={{ fontSize: 40 }}>⚠️</div>
                                            <div style={{ fontSize: 15, fontWeight: 500, color: "#d93025" }}>Something went wrong</div>
                                            <div style={{ fontSize: 13, color: "#5f6368", maxWidth: 280, lineHeight: 1.6 }}>{error}</div>
                                            <button onClick={() => load(folder, searchQ, "")} style={{ padding: "8px 24px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 6, fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Retry</button>
                                        </div>
                                    ) : emails.length === 0 ? (
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, padding: 40, textAlign: "center" }}>
                                            <div style={{ fontSize: 56 }}>{folder === "TRASH" ? "🗑️" : folder === "SPAM" ? "🚫" : folder === "STARRED" ? "⭐" : folder === "SENT" ? "📤" : "📭"}</div>
                                            <div style={{ fontSize: 16, fontWeight: 400, color: "#444746" }}>{searchQ ? `No results for "${searchQ}"` : `${SYS_FOLDERS.find(f => f.id === folder)?.label || folder} is empty`}</div>
                                            <div style={{ fontSize: 13, color: "#80868b" }}>{searchQ ? "Try different keywords" : "You're all caught up!"}</div>
                                        </div>
                                    ) : (
                                        <>
                                            {emails.map(email => (
                                                <EmailRow key={email.id} email={email}
                                                    selected={selected?.id === email.id}
                                                    checked={checked.has(email.id)}
                                                    onSelect={handleSelectResponsive}
                                                    onCheck={() => toggleCheck(email.id)}
                                                    onStar={handleStar}
                                                    onAction={handleAction}
                                                />
                                            ))}
                                            {nextPage && (
                                                <div style={{ padding: "16px 20px", textAlign: "center", borderTop: "1px solid #f0f0f0", marginBottom: mob ? 60 : 0 }}>
                                                    <button onClick={() => load(folder, searchQ, nextPage)} disabled={loadingMore}
                                                        style={{ padding: "8px 24px", background: "#fff", border: "1px solid #dadce0", borderRadius: 20, fontSize: 13.5, color: "#1a73e8", fontWeight: 500, cursor: loadingMore ? "not-allowed" : "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8 }}
                                                        onMouseEnter={e => { if (!loadingMore) e.currentTarget.style.background = "#e8f0fe"; }}
                                                        onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                                                        {loadingMore ? <><Spin size={14} /> Loading…</> : "Load more"}
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Mobile FAB compose button */}
            {mob && mobilePanel !== "detail" && (
                <button className="gm-fab" onClick={() => setCompose({})}>
                    <Ic n="compose" size={22} stroke="#001d35" />
                </button>
            )}

            {/* Mobile bottom nav */}
            {mob && (
                <div className="gm-bottomnav">
                    {[
                        { id: "list", icon: "inbox", label: "Mail" },
                        { id: "sidebar", icon: "menu", label: "Menu" },
                    ].map(b => (
                        <button key={b.id} className={`gm-bottomnav-btn${mobilePanel === b.id ? " act" : ""}`}
                            onClick={() => b.id === "list" && selected ? setMobilePanel("detail") : setMobilePanel(b.id)}>
                            <Ic n={b.icon} size={20} stroke="currentColor" />
                            <span>{b.label}</span>
                        </button>
                    ))}
                    <button className={`gm-bottomnav-btn`} onClick={handleRefresh}>
                        <div style={{ animation: spinning ? "gm-spin 0.75s linear infinite" : "none" }}><Ic n="refresh" size={20} /></div>
                        <span>Refresh</span>
                    </button>
                    <a href="/coworking/settings" className="gm-bottomnav-btn" style={{ textDecoration: "none", color: "#5f6368" }}>
                        <Ic n="settings" size={20} />
                        <span>Settings</span>
                    </a>
                </div>
            )}

            {/* Compose window */}
            {compose !== null && (
                <ComposeWin employeeId={employeeId} connectedEmail={connectedEmail} prefill={compose}
                    isMobile={mob}
                    onClose={() => setCompose(null)}
                    onSent={() => { setCompose(null); if (folder === "SENT") setTimeout(() => load("SENT", "", ""), 1500); }}
                />
            )}
        </>
    );
}