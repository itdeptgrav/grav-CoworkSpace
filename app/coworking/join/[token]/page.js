"use client";
import dynamic from "next/dynamic";

const GuestMeetingRoom = dynamic(
  () => import("../../../../components/coworking/meets/GuestMeetingRoom"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#111",
          flexDirection: "column",
          gap: 14,
          fontFamily: "sans-serif",
        }}
      >
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div
          style={{
            width: 40,
            height: 40,
            border: "3px solid #333",
            borderTopColor: "#1A73E8",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <span style={{ color: "#9AA0A6", fontSize: 13 }}>
          Connecting to meeting...
        </span>
      </div>
    ),
  },
);

export default function GuestJoinPage() {
  return <GuestMeetingRoom />;
}
