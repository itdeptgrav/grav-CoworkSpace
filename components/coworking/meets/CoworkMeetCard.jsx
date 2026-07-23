"use client";
/**
 * components/coworking/meets/CoworkMeetCard.jsx
 *
 * UPDATED: Added "Join Cowork Meeting" button that routes to the
 * built-in LiveKit meeting room at /coworking/cowork-meeting/[meetId]
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "../../../lib/coworkUtils";
import { createPublicLink } from "../../../lib/livekitApi";

export default function CoworkMeetCard({ meet, role }) {
  const router = useRouter();
  const isPast = new Date(meet.dateTime) < new Date();
  const isLive = meet.status === "live";
  const isEnded = meet.status === "ended";
  const isHost = role === "ceo" || role === "tl";
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleJoinCowork = () => {
    router.push(`/coworking/cowork-meeting/${meet.meetId}`);
  };

  const handleGetPublicLink = async () => {
    setLinkBusy(true);
    try {
      const res = await createPublicLink(meet.meetId);
      const url = `${window.location.origin}/coworking/join/${res.publicShareToken}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (e) {
      alert(e.message || "Could not create public link");
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <div style={s.card}>
      {/* Live pulse indicator */}
      {isLive && (
        <div style={s.liveBanner}>
          <span style={s.liveDot} />
          LIVE NOW
        </div>
      )}

      <div style={s.top}>
        <div style={{ flex: 1 }}>
          <h3 style={s.title}>{meet.title}</h3>
          {meet.description && <p style={s.desc}>{meet.description}</p>}
        </div>
        <span
          style={{
            ...s.badge,
            background: isLive
              ? "#FEF3C7"
              : isPast || isEnded
                ? "#f1f3f4"
                : "#e6f4ea",
            color: isLive
              ? "#D97706"
              : isPast || isEnded
                ? "#80868b"
                : "#1e8e3e",
            border: isLive ? "1px solid #F59E0B" : "none",
          }}
        >
          {isLive
            ? "🔴 Live"
            : isEnded
              ? "Ended"
              : isPast
                ? "Completed"
                : "Upcoming"}
        </span>
      </div>

      <div style={s.meta}>
        <span style={s.metaItem}>
          <span style={{ marginRight: "6px" }}>📅</span>
          {formatDate(meet.dateTime)}
        </span>
        <span style={s.metaItem}>
          <span style={{ marginRight: "6px" }}>👥</span>
          {meet.participants?.length || 0} participants
        </span>
        <span
          style={{
            ...s.metaItem,
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#9aa0a6",
          }}
        >
          {meet.meetId}
        </span>
      </div>

      {/* Buttons row */}
      <div style={s.btnRow}>
        {/* Cowork Meeting button — primary action */}
        <button
          onClick={handleJoinCowork}
          disabled={isEnded}
          style={{
            ...s.coworkBtn,
            opacity: isEnded ? 0.5 : 1,
            cursor: isEnded ? "not-allowed" : "pointer",
            background: isLive
              ? "linear-gradient(135deg, #D97706, #F59E0B)"
              : isEnded
                ? "#e8eaed"
                : "linear-gradient(135deg, #1A73E8, #0D47A1)",
          }}
        >
          <span style={{ fontSize: 14 }}>🎥</span>
          <span>
            {isLive
              ? "Join Live Meeting"
              : isEnded
                ? "Meeting Ended"
                : "Join Cowork Meeting"}
          </span>
        </button>

        {/* Google Meet link — secondary */}
        {meet.googleMeetLink && !isEnded && (
          <a
            href={isPast ? undefined : meet.googleMeetLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => isPast && e.preventDefault()}
            style={{
              ...s.gMeetBtn,
              opacity: isPast ? 0.45 : 1,
              pointerEvents: isPast ? "none" : "auto",
            }}
            title="Join with Google Meet"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
            Google Meet
          </a>
        )}

        {isHost && !isEnded && (
          <button
            onClick={handleGetPublicLink}
            disabled={linkBusy}
            style={{ ...s.gMeetBtn, cursor: linkBusy ? "wait" : "pointer" }}
            title="Copy a link anyone can join with — no account needed"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 13a5 5 0 007.07 0l1.93-1.93a5 5 0 00-7.07-7.07L10 5" />
              <path d="M14 11a5 5 0 00-7.07 0L5 12.93a5 5 0 007.07 7.07L14 19" />
            </svg>
            {linkCopied
              ? "Link copied!"
              : linkBusy
                ? "Generating…"
                : "Public Link"}
          </button>
        )}
      </div>
    </div>
  );
}

const s = {
  card: {
    background: "#fff",
    borderRadius: "12px",
    padding: "18px 20px",
    border: "1px solid #e8eaed",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    fontFamily: "'Google Sans','Roboto',sans-serif",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    position: "relative",
    overflow: "hidden",
  },
  liveBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    background: "linear-gradient(90deg,#FEF3C7,#FDE68A)",
    padding: "4px 16px",
    fontSize: "10px",
    fontWeight: 700,
    color: "#92400E",
    letterSpacing: "0.08em",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#EF4444",
    boxShadow: "0 0 0 2px rgba(239,68,68,0.3)",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  top: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    marginTop: 8,
  },
  title: {
    margin: "0 0 4px",
    fontSize: "15px",
    fontWeight: 600,
    color: "#202124",
  },
  desc: { margin: 0, fontSize: "13px", color: "#5f6368", lineHeight: 1.5 },
  badge: {
    padding: "3px 12px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  meta: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap",
    fontSize: "13px",
    color: "#5f6368",
  },
  metaItem: { display: "flex", alignItems: "center" },
  btnRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 4,
  },
  coworkBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 18px",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 2px 8px rgba(26,115,232,0.25)",
    transition: "opacity 0.15s, transform 0.1s",
  },
  gMeetBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "8px 14px",
    background: "#F8F9FA",
    border: "1px solid #DADCE0",
    borderRadius: "8px",
    color: "#3C4043",
    fontSize: "12px",
    fontWeight: 500,
    textDecoration: "none",
    cursor: "pointer",
  },
};
