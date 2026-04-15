"use client";
import dynamic from "next/dynamic";

const AudioCallRoom = dynamic(
    () => import("../../../../components/coworking/messaging/AudioCallRoom"),
    {
        ssr: false,
        loading: () => (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0B1315", flexDirection: "column", gap: 14, fontFamily: "sans-serif" }}>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <div style={{ width: 36, height: 36, border: "3px solid #1a3a3a", borderTopColor: "#22C55E", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <span style={{ color: "#6B7280", fontSize: 13 }}>Connecting...</span>
            </div>
        ),
    }
);

export default function AudioCallPage() {
    return <AudioCallRoom />;
}