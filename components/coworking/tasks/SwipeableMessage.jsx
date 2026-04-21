"use client";
/**
 * GRAV-CMS/components/coworking/tasks/SwipeableMessage.jsx
 *
 * Right-swipe-to-reply gesture wrapper for chat messages (mobile). Triggers
 * onReply when the user drags past a threshold. Haptic feedback when available.
 *
 * Extracted from app/coworking/tasks/page.js — pure relocation, no behavior change.
 * Props: { children, isMe, onReply, onContextMenu, onLongPressStart, onLongPressEnd, style }
 */
import { useState, useRef } from "react";

export default function SwipeableMessage({ children, isMe, onReply, onContextMenu, onLongPressStart, onLongPressEnd, style }) {
    const [swipeX, setSwipeX] = useState(0);
    const [swiping, setSwiping] = useState(false);
    const [triggered, setTriggered] = useState(false);
    const startXRef = useRef(0);
    const THRESHOLD = 60;

    const handleTouchStart = (e) => {
        startXRef.current = e.touches[0].clientX;
        setSwiping(true);
        setTriggered(false);
        onLongPressStart?.();
    };

    const handleTouchMove = (e) => {
        const dx = e.touches[0].clientX - startXRef.current;
        // Only allow right swipe for replies (both sides swipe right to reply like WhatsApp)
        if (dx > 0 && dx <= THRESHOLD + 20) {
            setSwipeX(dx);
            if (dx >= THRESHOLD && !triggered) {
                setTriggered(true);
                // Haptic feedback if available
                if (navigator?.vibrate) navigator.vibrate(40);
            }
        }
    };

    const handleTouchEnd = (e) => {
        onLongPressEnd?.();
        if (triggered) onReply?.();
        setSwiping(false);
        setTriggered(false);
        setSwipeX(0);
    };

    const progress = Math.min(swipeX / THRESHOLD, 1);

    return (
        <div
            style={{ ...style, position: "relative", overflow: "visible" }}
            onContextMenu={onContextMenu}
        >
            {/* Reply icon that appears on swipe */}
            {swipeX > 8 && (
                <div style={{
                    position: "absolute",
                    left: isMe ? "auto" : Math.min(swipeX - 8, THRESHOLD - 4),
                    right: isMe ? Math.min(swipeX - 8, THRESHOLD - 4) : "auto",
                    top: "50%", transform: "translateY(-50%)",
                    width: 28, height: 28,
                    borderRadius: "50%",
                    background: `rgba(79,70,229,${Math.min(progress, 1) * 0.15})`,
                    border: `1.5px solid rgba(79,70,229,${Math.min(progress, 1) * 0.5})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: triggered ? "transform 0.15s" : "none",
                    transform: `translateY(-50%) scale(${triggered ? 1.2 : 0.8 + progress * 0.4})`,
                    pointerEvents: "none",
                    zIndex: 5,
                }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                        stroke={`rgba(79,70,229,${0.4 + progress * 0.6})`}
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 00-4-4H4" />
                    </svg>
                </div>
            )}
            {/* Message content shifted on swipe */}
            <div
                className={`gv-msg-group${isMe ? " me" : ""}`}
                style={{
                    transform: swipeX > 0 ? `translateX(${isMe ? -swipeX : swipeX}px)` : "none",
                    transition: swiping ? "none" : "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
            >
                {children}
            </div>
        </div>
    );
}