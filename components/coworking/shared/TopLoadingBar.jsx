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
            {/* UNIQUE LOADER: Triple-ring quantum entanglement effect */}
            <div style={{
                position: "relative",
                width: 80,
                height: 80,
            }}>
                {/* Ring 1 - Outer chaotic orbit */}
                <div style={{
                    position: "absolute",
                    inset: 0,
                    border: "3px solid transparent",
                    borderTop: "3px solid #f43f5e",
                    borderRight: "3px solid #3b82f6",
                    borderRadius: "50%",
                    animation: "quantumSpin1 1.2s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite",
                }} />

                {/* Ring 2 - Middle counter-rotating */}
                <div style={{
                    position: "absolute",
                    inset: 12,
                    border: "3px solid transparent",
                    borderBottom: "3px solid #8b5cf6",
                    borderLeft: "3px solid #06b6d4",
                    borderRadius: "50%",
                    animation: "quantumSpin2 0.9s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite reverse",
                }} />

                {/* Ring 3 - Inner pulsing dot */}
                <div style={{
                    position: "absolute",
                    inset: 28,
                    background: "conic-gradient(from 0deg, #f59e0b, #ef4444, #3b82f6, #10b981, #f59e0b)",
                    borderRadius: "50%",
                    animation: "quantumPulse 1.4s ease-in-out infinite",
                    boxShadow: "0 0 20px rgba(139,92,246,0.5)",
                }} />

                {/* Center shimmer */}
                <div style={{
                    position: "absolute",
                    inset: 36,
                    background: "white",
                    borderRadius: "50%",
                    animation: "quantumShimmer 0.6s ease-in-out infinite alternate",
                }} />
            </div>

            <style>{`
                @keyframes quantumSpin1 {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes quantumSpin2 {
                    0% { transform: rotate(360deg); }
                    100% { transform: rotate(0deg); }
                }
                @keyframes quantumPulse {
                    0%, 100% { 
                        transform: scale(1);
                        opacity: 0.7;
                    }
                    50% { 
                        transform: scale(1.3);
                        opacity: 1;
                    }
                }
                @keyframes quantumShimmer {
                    0% { 
                        transform: scale(0.6);
                        opacity: 0.3;
                    }
                    100% { 
                        transform: scale(0.9);
                        opacity: 0.8;
                    }
                }
            `}</style>
        </div>
    );
}