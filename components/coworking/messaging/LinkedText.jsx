"use client";
/**
 * components/coworking/messaging/LinkedText.jsx
 *
 * Renders a string of plain text and auto-converts any URL inside it into a
 * clickable <a target="_blank" rel="noopener noreferrer"> element. Used
 * everywhere chat messages, task notes, and request messages are displayed,
 * so link handling stays uniform.
 *
 * Detection rules (kept deliberately conservative to avoid false positives):
 *   1. Absolute URLs:     http://…   https://…
 *   2. Schemeless www:    www.example.com/…        (we prefix https:// on click)
 *   3. Email addresses:   alice@example.com        (rendered as mailto:)
 *
 * Design choices
 *   - Bare URL strings show as-is (no fancy preview card). This matches how
 *     Slack / WhatsApp chat bubbles render links and keeps bubble width stable.
 *   - Trailing punctuation like . , ! ? ) ] " ' is NOT included in the link
 *     (so "go to https://x.com." links to x.com, not x.com.).
 *   - Color depends on the bubble context:
 *        on a dark/colored bubble (isMe=true)  → soft white/underlined
 *        on a light bubble       (isMe=false) → indigo blue (#4F46E5)
 *     Pass `isMe` (bool) to control. Default is light-bubble styling.
 *   - The whole render is a plain string interpolated with <a> tags, so it
 *     preserves `whiteSpace: "pre-wrap"` on the parent exactly like the old
 *     `{msg.text}` did. Drop-in replacement.
 *
 * Usage:
 *   <div style={{ whiteSpace: "pre-wrap" }}>
 *     <LinkedText text={msg.text} isMe={msg.senderId === employeeId} />
 *   </div>
 */
import React from "react";

// Single regex that matches any of the three patterns above. Order matters —
// absolute URLs before "www." so "https://www.x.com" is captured as one token.
// We intentionally don't include trailing .,!?)]"' in the URL itself; those
// get put back as plain text after the link.
const LINK_RE =
    /(https?:\/\/[^\s<>()[\]"']+|www\.[^\s<>()[\]"']+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

// Strip trailing punctuation we don't want to include in the URL. Repeat until
// stable, so ".)." at the end gets pulled off cleanly.
function stripTrailingPunct(s) {
    const trail = /[.,!?;:)\]}"'»›]+$/;
    let trimmed = s;
    let tail = "";
    while (trail.test(trimmed)) {
        const m = trimmed.match(trail);
        tail = m[0] + tail;
        trimmed = trimmed.slice(0, -m[0].length);
    }
    return [trimmed, tail];
}

export default function LinkedText({ text = "", isMe = false, style }) {
    if (!text) return null;

    // Theme: on "me" bubbles (dark/colored bg) use a soft-white link so it
    // contrasts against the bubble; on neutral bubbles use a professional indigo.
    const linkColor = isMe ? "rgba(255,255,255,0.95)" : "#4F46E5";
    const linkDecor = isMe ? "underline" : "none";

    // Build alternating [plain, link, plain, link, ...] segments.
    const out = [];
    let lastIdx = 0;
    let match;
    LINK_RE.lastIndex = 0;

    while ((match = LINK_RE.exec(text)) !== null) {
        const [raw] = match;
        const start = match.index;
        const end = start + raw.length;

        // Preceding plain text
        if (start > lastIdx) out.push(text.slice(lastIdx, start));

        // Pull trailing punctuation off the URL
        const [clean, trailingPunct] = stripTrailingPunct(raw);

        // Decide href
        let href;
        if (/^https?:\/\//i.test(clean)) href = clean;
        else if (/^www\./i.test(clean)) href = "https://" + clean;
        else if (clean.includes("@")) href = "mailto:" + clean;
        else href = clean;

        out.push(
            <a
                key={start}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                    color: linkColor,
                    textDecoration: linkDecor,
                    wordBreak: "break-all",
                    fontWeight: isMe ? 600 : 500,
                }}
                onMouseEnter={e => { e.currentTarget.style.textDecoration = "underline"; }}
                onMouseLeave={e => { e.currentTarget.style.textDecoration = linkDecor; }}
            >
                {clean}
            </a>
        );

        if (trailingPunct) out.push(trailingPunct);
        lastIdx = end;
    }

    // Trailing plain text
    if (lastIdx < text.length) out.push(text.slice(lastIdx));

    // Nothing matched → return the raw text (React fragment) so the caller's
    // parent styling (whiteSpace: "pre-wrap", etc.) still applies cleanly.
    if (out.length === 0) return <>{text}</>;

    return <span style={style}>{out}</span>;
}