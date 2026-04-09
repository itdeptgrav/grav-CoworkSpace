/**
 * GRAV-CMS/components/coworking/shared/PageLoader.jsx
 * Top progress bar that shows on every page navigation.
 * Mounted in app/coworking/layout.js
 */
"use client";
import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";

export default function TopLoadingBar() {
    const pathname = usePathname();
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);
    const prevPath = useRef(null);   // null on first render — triggers initial load
    const rafRef = useRef(null);
    const timerRef = useRef(null);

    const startLoading = () => {
        // Cancel any ongoing animation
        cancelAnimationFrame(rafRef.current);
        clearTimeout(timerRef.current);

        setProgress(0);
        setVisible(true);

        // Animate progress quickly to ~85%, then pause waiting for route to settle
        let p = 0;
        const tick = () => {
            // Fast at start, slows down near 85%
            const step = p < 30 ? 4 : p < 60 ? 2.5 : p < 80 ? 1 : 0.3;
            p = Math.min(p + step, 85);
            setProgress(p);
            if (p < 85) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
    };

    const finishLoading = () => {
        cancelAnimationFrame(rafRef.current);
        // Jump to 100% then fade out
        setProgress(100);
        timerRef.current = setTimeout(() => {
            setVisible(false);
            setProgress(0);
        }, 300);
    };

    useEffect(() => {
        // Fire on first mount (initial page load) and every route change
        if (prevPath.current !== pathname) {
            prevPath.current = pathname;
            startLoading();

            // Dashboard and Tasks pages load more data — give them 2 extra seconds
            const isHeavyPage = pathname === "/coworking" || pathname === "/coworking/tasks";
            const delay = isHeavyPage ? 2600 : 600;

            timerRef.current = setTimeout(finishLoading, delay);
        }
        return () => {
            cancelAnimationFrame(rafRef.current);
            clearTimeout(timerRef.current);
        };
    }, [pathname]);

    if (!visible) return null;

    return (
        <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            zIndex: 99999,
            pointerEvents: "none",   // never blocks clicks
        }}>
            {/* Track */}
            <div style={{
                position: "absolute",
                inset: 0,
                background: "rgba(91,94,244,0.1)",
            }} />
            {/* Bar */}
            <div style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: "100%",
                width: `${progress}%`,
                background: "linear-gradient(90deg, #5B5EF4, #818CF8, #5B5EF4)",
                backgroundSize: "200% 100%",
                transition: progress === 100 ? "width 0.15s ease" : "width 0.08s linear",
                borderRadius: "0 2px 2px 0",
                boxShadow: "0 0 8px rgba(91,94,244,0.6), 0 0 3px rgba(91,94,244,0.4)",
                animation: progress < 100 ? "lb-shimmer 1.4s ease infinite" : "none",
            }} />
            {/* Leading glow dot */}
            {progress < 100 && (
                <div style={{
                    position: "absolute",
                    top: "50%",
                    left: `${progress}%`,
                    transform: "translate(-50%, -50%)",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#818CF8",
                    boxShadow: "0 0 10px 3px rgba(129,140,248,0.8)",
                }} />
            )}
            <style>{`
                @keyframes lb-shimmer {
                    0%   { background-position: 200% center; }
                    100% { background-position: -200% center; }
                }
            `}</style>
        </div>
    );
}