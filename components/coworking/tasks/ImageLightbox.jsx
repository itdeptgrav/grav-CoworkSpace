"use client";
/**
 * GRAV-CMS/components/coworking/tasks/ImageLightbox.jsx
 *
 * Fullscreen image preview with download + close buttons. Esc closes.
 *
 * Extracted from app/coworking/tasks/page.js (was ~100 lines inline) — pure
 * relocation, identical behavior. Props: { url, onClose, onDownload }.
 */
import { useEffect } from "react";

export default function ImageLightbox({ url, onClose, onDownload }) {
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === "Escape" && typeof onClose === "function") onClose();
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [onClose]);

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.9)",
                zIndex: 10000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                animation: "fadeIn 0.2s ease",
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: "relative",
                    maxWidth: "90vw",
                    maxHeight: "90vh",
                    background: "transparent",
                }}
            >
                <img
                    src={url}
                    alt="Enlarged view"
                    style={{
                        maxWidth: "100%",
                        maxHeight: "90vh",
                        objectFit: "contain",
                        borderRadius: "12px",
                        boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
                    }}
                />
                <button
                    onClick={onDownload}
                    style={{
                        position: "absolute",
                        bottom: "20px",
                        right: "20px",
                        background: "rgba(0,0,0,0.7)",
                        border: "none",
                        borderRadius: "50%",
                        width: "48px",
                        height: "48px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: "#fff",
                        transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.9)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.7)"}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                </button>
                <button
                    onClick={onClose}
                    style={{
                        position: "absolute",
                        top: "20px",
                        right: "20px",
                        background: "rgba(0,0,0,0.7)",
                        border: "none",
                        borderRadius: "50%",
                        width: "40px",
                        height: "40px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: "#fff",
                        fontSize: "24px",
                        transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.9)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.7)"}
                >
                    ✕
                </button>
                <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
            </div>
        </div>
    );
}