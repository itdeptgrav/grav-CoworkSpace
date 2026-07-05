/**
 * GRAV-CMS/components/coworking/shared/PageLoader.jsx
 * Add <PageLoader /> inside CoworkingShell return, before <style>
 */
"use client";
import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";

export default function TopLoadingBar() {
    const pathname = usePathname();
    const [show, setShow] = useState(false);
    const prevPath = useRef(pathname);
    const timerRef = useRef(null);
    const [rotation, setRotation] = useState(0);

    useEffect(() => {
        if (pathname !== prevPath.current) {
            prevPath.current = pathname;
            setShow(true);
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setShow(false), 800);

            // Unique: Random starting rotation
            setRotation(Math.random() * 360);
        }
        return () => clearTimeout(timerRef.current);
    }, [pathname]);

    if (!show) return null;

    return (
        <div style={{
            position: "fixed",
            inset: 0,
            background: "radial-gradient(circle at center, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.08) 100%)",
            backdropFilter: "blur(8px) saturate(180%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
        }}>
            {/* Indigo ring loader on a white card — soft gradient arc, rounded caps */}
            <div style={{ width: 72, height: 72, transform: `rotate(${rotation}deg)` }}>
                <svg width="72" height="72" viewBox="0 0 72 72" style={{ display: "block", animation: "ringSpin 0.9s linear infinite" }}>
                    <defs>
                        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#C7CCF9" />
                            <stop offset="100%" stopColor="#5B5EF4" />
                        </linearGradient>
                    </defs>
                    {/* Track */}
                    <circle cx="36" cy="36" r="27" fill="none" stroke="#E9EBFC" strokeWidth="9" />
                    {/* Arc */}
                    <circle cx="36" cy="36" r="27" fill="none" stroke="url(#ringGrad)" strokeWidth="9"
                        strokeLinecap="round" strokeDasharray="112 58" transform="rotate(-90 36 36)"
                        style={{ filter: "drop-shadow(0 2px 7px rgba(91,94,244,0.35))" }} />
                </svg>
            </div>
            <style>{`
                @keyframes ringSpin { to { transform: rotate(360deg); } }
            `}</style>
        </div >
    );
}