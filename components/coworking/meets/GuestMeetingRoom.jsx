"use client";
/**
 * components/coworking/meets/GuestMeetingRoom.jsx
 *
 * Public guest room — /coworking/join/[token]. No Firebase auth.
 *
 * In-call UI = LiveKit's prebuilt VideoConference (same as employee room):
 * tiles, screen share, chat, device pickers. On top of it:
 *  - custom header with live participant count + slide-in People panel
 *    (VideoConference ships without one — this is the only custom part)
 *  - Google-Meet-style lobby with live camera preview
 *  - silent guest audio recording into the summary pipeline
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  getPublicMeetingInfo,
  guestJoin,
  getPublicSummary,
} from "../../../lib/livekitApi";
import { useMeetingRecording } from "../../../hooks/useMeetingRecording";

import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
} from "@livekit/components-react";
import "@livekit/components-styles";

const AV_COLORS = [
  "#3B6CB5",
  "#3F8F6B",
  "#B07A2F",
  "#6B5B95",
  "#A85454",
  "#3D8B96",
  "#7A6248",
  "#5C6BB5",
];
const avBg = (s = "") => AV_COLORS[(s.charCodeAt(0) || 0) % AV_COLORS.length];
const initials = (name = "") =>
  name
    .trim()
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

// ── Bridge: LiveKit's own mic button → recording pause/resume ───────────────
function RecordingBridge({ recording, startMuted }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!localParticipant || startedRef.current) return;
    startedRef.current = true;
    recording.setMuted?.(!!startMuted);
    recording.startRecording?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localParticipant]);

  useEffect(() => {
    if (!startedRef.current) return;
    recording.setMuted?.(!isMicrophoneEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMicrophoneEnabled]);

  return null;
}

// ── Header + People panel — must live INSIDE LiveKitRoom for room context ───
function RoomHeader({ meetTitle, guestName }) {
  const participants = useParticipants();
  const [showPeople, setShowPeople] = useState(false);

  return (
    <>
      <div className="g-lk-hdr">
        <span className="g-lk-title">{meetTitle}</span>
        <span className="g-lk-badge">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#5BBF8A",
            }}
          />
          LIVE
        </span>
        <span className="g-lk-guest">Joined as {guestName} · guest</span>
        <button
          className="g-peoplebtn"
          onClick={() => setShowPeople((v) => !v)}
          title="People in this meeting"
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
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
          {participants.length}
        </button>
      </div>

      {showPeople && (
        <div className="g-panel">
          <div className="g-panel-hdr">
            <span className="g-panel-title">
              People · {participants.length}
            </span>
            <button className="g-panel-x" onClick={() => setShowPeople(false)}>
              ×
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
            {participants.map((p) => {
              const name = p.name || p.identity;
              const micOn = !!p.isMicrophoneEnabled;
              return (
                <div key={p.sid} className="g-prow">
                  <div className="g-prow-av" style={{ background: avBg(name) }}>
                    {initials(name)}
                  </div>
                  <span className="g-prow-name">
                    {name}{" "}
                    {p.isLocal && <span className="g-prow-you">(you)</span>}
                  </span>
                  <span
                    style={{
                      color: micOn ? "#5BBF8A" : "#F87171",
                      flexShrink: 0,
                      display: "flex",
                    }}
                  >
                    {micOn ? (
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
                        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                        <path d="M19 10v2a7 7 0 01-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    ) : (
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
                        <line x1="1" y1="1" x2="23" y2="23" />
                        <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
                        <path d="M17 16.95A7 7 0 015 12v-2m14 0v2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export default function GuestMeetingRoom() {
  const { token } = useParams();
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState("");
  const [meetInfo, setMeetInfo] = useState(null);
  const [summary, setSummary] = useState(null);
  const [guestName, setGuestName] = useState("");
  const [joinData, setJoinData] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  // Lobby camera preview
  const previewVideoRef = useRef(null);
  const previewStreamRef = useRef(null);
  const [camErr, setCamErr] = useState(false);

  const recording = useMeetingRecording({
    meetId: joinData?.meetId,
    employeeId: joinData?.guestId,
    employeeName: guestName,
    firstName: (guestName || "Guest").split(" ")[0],
    isHost: false,
    guestSessionId: joinData?.guestSessionId,
  });

  // ── Resolve share token ───────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const info = await getPublicMeetingInfo(token);
        setMeetInfo(info);
        if (info.status === "ended") {
          try {
            const s = await getPublicSummary(info.meetId, token);
            setSummary(s.exists ? s.summary : null);
          } catch (_) {}
          setPhase("ended");
          return;
        }
        if (!info.canJoin) {
          setError("This link is no longer active.");
          setPhase("error");
          return;
        }
        setPhase("name-entry");
      } catch (e) {
        setError(e.message || "This link is invalid.");
        setPhase("error");
      }
    })();
  }, [token]);

  // ── Lobby camera preview — starts/stops with the Cam toggle ───────────────
  useEffect(() => {
    if (phase !== "name-entry" && phase !== "connecting") {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
      return;
    }
    if (!camOn) {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        previewStreamRef.current = stream;
        setCamErr(false);
        if (previewVideoRef.current) previewVideoRef.current.srcObject = stream;
      } catch (_) {
        if (!cancelled) setCamErr(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, camOn]);

  const handleJoin = async (e) => {
    e?.preventDefault();
    if (!guestName.trim()) return;
    setPhase("connecting");
    setError("");
    try {
      const res = await guestJoin(token, guestName.trim());
      // Release the preview camera BEFORE LiveKit claims the device —
      // some browsers refuse a second concurrent capture of the same cam.
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
      setJoinData(res);
      setPhase("in-call");
    } catch (e2) {
      setError(e2.message);
      setPhase("name-entry");
    }
  };

  const handleDisconnected = useCallback(() => {
    try {
      recording.stopRecording?.();
    } catch (_) {}
    setPhase("left");
  }, [recording]);

  // ═══ RENDER ═══════════════════════════════════════════════════════════════

  const css = (
    <style>{`
      @keyframes g-spin { to { transform: rotate(360deg); } }
      @keyframes g-fadein { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform:none; } }
      @keyframes g-slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
      .g-page { min-height:100vh; min-height:100dvh; background:#0B0D10; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding:20px; box-sizing:border-box; }
      .g-card { background:#15181C; border:1px solid #22262C; border-radius:16px; padding:32px 30px; width:min(380px, 100%); animation:g-fadein 0.25s ease; box-sizing:border-box; }

      /* ── Lobby ── */
      .g-lobby { display:flex; background:#111418; overflow:hidden; width:100vw; height:100vh; height:100dvh; animation:g-fadein 0.3s ease; }
      .g-lob-cam { flex:1.4; background:#000; position:relative; display:flex; align-items:center; justify-content:center; }
      .g-lob-cam video { width:100%; height:100%; object-fit:cover; transform:scaleX(-1); position:absolute; inset:0; }
      .g-lob-cam-name { position:absolute; bottom:14px; left:16px; background:rgba(0,0,0,0.55); color:#fff; font-size:12.5px; font-weight:500; padding:4px 11px; border-radius:7px; z-index:2; }
      .g-lob-cam-state { position:absolute; bottom:14px; right:16px; font-size:11px; font-weight:600; z-index:2; padding:3px 9px; border-radius:99px; background:rgba(0,0,0,0.55); }
      .g-lob-form { flex:1; max-width:460px; padding:48px 44px; display:flex; flex-direction:column; gap:20px; justify-content:center; box-sizing:border-box; border-left:1px solid #1E2126; }
      .g-chips { display:flex; gap:6px; flex-wrap:wrap; }
      .g-chip { display:inline-flex; align-items:center; gap:5px; font-size:11px; color:#9AA0A6; background:#1B1E23; border:1px solid #262A31; padding:4px 10px; border-radius:99px; }
      .g-lob-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#6B7280; }
      .g-input { width:100%; box-sizing:border-box; padding:12px 14px; border-radius:10px; border:1px solid #2A2E35; background:#0F1114; color:#E8EAED; font-size:14px; font-family:inherit; outline:none; transition:border-color 0.15s; }
      .g-input:focus { border-color:#3B6CB5; }
      .g-devrow { display:flex; align-items:center; gap:11px; padding:11px 13px; background:#0F1114; border:1px solid #22262C; border-radius:11px; cursor:pointer; transition:border-color 0.12s; user-select:none; }
      .g-devrow:hover { border-color:#2E333B; }
      .g-dev-name { flex:1; min-width:0; }
      .g-dev-title { font-size:13px; font-weight:600; color:#E8EAED; }
      .g-dev-sub { font-size:11px; margin-top:1px; }
      .g-toggle { width:36px; height:20px; border-radius:99px; position:relative; transition:background 0.15s; flex-shrink:0; }
      .g-toggle-knob { width:16px; height:16px; border-radius:50%; background:#fff; position:absolute; top:2px; transition:transform 0.15s; }
      .g-joinbtn { width:100%; padding:13px 0; border-radius:11px; border:none; background:#2563EB; color:#fff; font-weight:600; font-size:14.5px; cursor:pointer; font-family:inherit; transition:background 0.12s; margin-top:2px; }
      .g-joinbtn:hover:not(:disabled) { background:#1D4ED8; }
      .g-joinbtn:disabled { opacity:0.5; cursor:not-allowed; }
      .g-lob-foot { font-size:11px; color:#5f6368; margin-top:auto; }

      /* ── In-call ── */
      .g-lk-wrap { height:100vh; height:100dvh; display:flex; flex-direction:column; background:#111; position:relative; }
      .g-lk-hdr { display:flex; align-items:center; gap:10px; padding:0 14px; height:46px; flex-shrink:0; border-bottom:1px solid #1E2126; background:#0F1114; }
      .g-lk-title { font-size:13.5px; font-weight:600; color:#E8EAED; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .g-lk-badge { display:inline-flex; align-items:center; gap:5px; font-size:10px; font-weight:700; letter-spacing:0.06em; padding:2px 8px; border-radius:99px; background:rgba(46,125,85,0.18); color:#5BBF8A; flex-shrink:0; }
      .g-lk-guest { font-size:11px; color:#5f6368; flex-shrink:0; margin-left:auto; margin-right:10px; }
      .g-peoplebtn { display:inline-flex; align-items:center; gap:6px; background:#1B1E23; border:1px solid #2A2E35; border-radius:99px; color:#C9CDD3; font-size:12px; font-weight:600; padding:5px 12px; cursor:pointer; font-family:inherit; flex-shrink:0; transition:background 0.12s; }
      .g-peoplebtn:hover { background:#23272E; }
      .g-panel { position:absolute; top:46px; right:0; bottom:0; width:min(300px,85vw); background:#15181C; border-left:1px solid #22262C; z-index:50; display:flex; flex-direction:column; animation:g-slide 0.18s ease; }
      .g-panel-hdr { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #22262C; }
      .g-panel-title { font-size:13px; font-weight:700; color:#E8EAED; }
      .g-panel-x { background:none; border:none; color:#9AA0A6; cursor:pointer; font-size:18px; line-height:1; padding:2px 6px; }
      .g-prow { display:flex; align-items:center; gap:10px; padding:9px 16px; }
      .g-prow-av { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:#fff; flex-shrink:0; }
      .g-prow-name { flex:1; min-width:0; font-size:13px; color:#E8EAED; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .g-prow-you { font-size:10px; color:#9AA0A6; }
      .g-avatar-big { border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; color:#fff; }

      @media(max-width:760px){
        .g-lobby { flex-direction:column; overflow-y:auto; }
        .g-lob-cam { min-height:38vh; flex:none; }
        .g-lob-form { padding:26px 22px; max-width:none; border-left:none; border-top:1px solid #1E2126; justify-content:flex-start; }
        .g-lk-guest { display:none; }
      }
    `}</style>
  );

  const Center = ({ children }) => (
    <div className="g-page">
      {css}
      {children}
    </div>
  );

  if (phase === "loading")
    return (
      <Center>
        <div
          style={{
            width: 38,
            height: 38,
            border: "3px solid #22262C",
            borderTopColor: "#2563EB",
            borderRadius: "50%",
            animation: "g-spin 0.8s linear infinite",
            marginBottom: 16,
          }}
        />
        <p style={{ color: "#9AA0A6", fontSize: 13, margin: 0 }}>
          Loading meeting…
        </p>
      </Center>
    );

  if (phase === "error")
    return (
      <Center>
        <div className="g-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>🔒</div>
          <p
            style={{
              color: "#E8EAED",
              fontSize: 16,
              fontWeight: 600,
              margin: "0 0 8px",
            }}
          >
            Can't open this meeting
          </p>
          <p
            style={{
              color: "#9AA0A6",
              fontSize: 13,
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            {error}
          </p>
        </div>
      </Center>
    );

  if (phase === "left")
    return (
      <Center>
        <div className="g-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>👋</div>
          <p
            style={{
              color: "#E8EAED",
              fontSize: 16,
              fontWeight: 600,
              margin: "0 0 8px",
            }}
          >
            You left the meeting
          </p>
          <p style={{ color: "#9AA0A6", fontSize: 13, margin: 0 }}>
            Thanks for joining, {guestName || "guest"}.
          </p>
        </div>
      </Center>
    );

  if (phase === "ended")
    return (
      <div
        className="g-page"
        style={{ justifyContent: "flex-start", overflowY: "auto" }}
      >
        {css}
        <div
          className="g-card"
          style={{ margin: "auto", maxHeight: "88vh", overflowY: "auto" }}
        >
          <p
            style={{
              color: "#E8EAED",
              fontSize: 17,
              fontWeight: 600,
              margin: "0 0 6px",
            }}
          >
            {meetInfo?.meetTitle || "This meeting"} has ended
          </p>
          {!summary && (
            <p
              style={{
                color: "#9AA0A6",
                fontSize: 13,
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              The summary hasn't been generated yet — check back shortly using
              the same link.
            </p>
          )}
          {summary && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ color: "#E8EAED", fontSize: 14, margin: "0 0 8px" }}>
                Summary
              </h3>
              <p
                style={{
                  color: "#C9CDD3",
                  fontSize: 13,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                  margin: 0,
                }}
              >
                {summary.summary}
              </p>
              {summary.actionItems?.length > 0 && (
                <>
                  <h3
                    style={{
                      color: "#E8EAED",
                      fontSize: 14,
                      margin: "18px 0 8px",
                    }}
                  >
                    Action Items
                  </h3>
                  <ul
                    style={{
                      color: "#C9CDD3",
                      fontSize: 13,
                      lineHeight: 1.8,
                      margin: 0,
                      paddingLeft: 18,
                    }}
                  >
                    {summary.actionItems.map((a, i) => (
                      <li key={i}>
                        {typeof a === "string" ? a : a?.item || ""}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );

  if (phase === "name-entry" || phase === "connecting") {
    const connecting = phase === "connecting";
    return (
      <div className="g-page" style={{ padding: 0 }}>
        {css}
        <div className="g-lobby">
          {/* LEFT — live camera preview */}
          <div className="g-lob-cam">
            {camOn && !camErr ? (
              <video ref={previewVideoRef} autoPlay muted playsInline />
            ) : (
              <div
                className="g-avatar-big"
                style={{
                  width: 110,
                  height: 110,
                  fontSize: 38,
                  background: avBg(guestName || "G"),
                }}
              >
                {guestName.trim() ? (
                  initials(guestName)
                ) : (
                  <svg
                    width="52"
                    height="52"
                    viewBox="0 0 24 24"
                    fill="rgba(255,255,255,0.9)"
                  >
                    <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.34 0-10 1.67-10 5v3h20v-3c0-3.33-6.66-5-10-5z" />
                  </svg>
                )}
              </div>
            )}
            <span className="g-lob-cam-name">
              {guestName.trim() || "Guest"}
            </span>
            <span
              className="g-lob-cam-state"
              style={{ color: camOn && !camErr ? "#5BBF8A" : "#F87171" }}
            >
              {camErr
                ? "Camera unavailable"
                : camOn
                  ? "Camera on"
                  : "Camera off"}
            </span>
          </div>

          {/* RIGHT — form */}
          <div className="g-lob-form">
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#2563EB",
                  margin: "0 0 6px",
                }}
              >
                You're invited
              </p>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#E8EAED",
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                {meetInfo?.meetTitle || "CoWork Meeting"}
              </h1>
              <div className="g-chips" style={{ marginTop: 10 }}>
                <span className="g-chip">
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#5BBF8A",
                      display: "inline-block",
                    }}
                  />
                  Live now
                </span>
                <span className="g-chip">Guest access · no account needed</span>
              </div>
            </div>

            <div>
              <p className="g-lob-label" style={{ marginBottom: 7 }}>
                Your name
              </p>
              <input
                autoFocus
                className="g-input"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoin(e)}
                placeholder="How should others see you?"
                maxLength={60}
                disabled={connecting}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p className="g-lob-label">Audio & Video</p>
              <div className="g-devrow" onClick={() => setMicOn((v) => !v)}>
                <span
                  style={{
                    color: micOn ? "#5BBF8A" : "#F87171",
                    display: "flex",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {micOn ? (
                      <>
                        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                        <path d="M19 10v2a7 7 0 01-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </>
                    ) : (
                      <>
                        <line x1="1" y1="1" x2="23" y2="23" />
                        <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
                        <path d="M17 16.95A7 7 0 015 12v-2m14 0v2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </>
                    )}
                  </svg>
                </span>
                <div className="g-dev-name">
                  <div className="g-dev-title">Microphone</div>
                  <div
                    className="g-dev-sub"
                    style={{ color: micOn ? "#5BBF8A" : "#F87171" }}
                  >
                    {micOn ? "On" : "Off"}
                  </div>
                </div>
                <div
                  className="g-toggle"
                  style={{ background: micOn ? "#2563EB" : "#3A3F47" }}
                >
                  <div
                    className="g-toggle-knob"
                    style={{
                      transform: micOn ? "translateX(18px)" : "translateX(2px)",
                    }}
                  />
                </div>
              </div>
              <div className="g-devrow" onClick={() => setCamOn((v) => !v)}>
                <span
                  style={{
                    color: camOn && !camErr ? "#5BBF8A" : "#F87171",
                    display: "flex",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {camOn && !camErr ? (
                      <>
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" />
                      </>
                    ) : (
                      <>
                        <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </>
                    )}
                  </svg>
                </span>
                <div className="g-dev-name">
                  <div className="g-dev-title">Camera</div>
                  <div
                    className="g-dev-sub"
                    style={{ color: camOn && !camErr ? "#5BBF8A" : "#F87171" }}
                  >
                    {camErr ? "Unavailable" : camOn ? "On" : "Off"}
                  </div>
                </div>
                <div
                  className="g-toggle"
                  style={{
                    background: camOn && !camErr ? "#2563EB" : "#3A3F47",
                  }}
                >
                  <div
                    className="g-toggle-knob"
                    style={{
                      transform:
                        camOn && !camErr
                          ? "translateX(18px)"
                          : "translateX(2px)",
                    }}
                  />
                </div>
              </div>
            </div>

            {error && (
              <p style={{ color: "#F87171", fontSize: 12, margin: 0 }}>
                {error}
              </p>
            )}

            <button
              className="g-joinbtn"
              onClick={handleJoin}
              disabled={connecting || !guestName.trim()}
            >
              {connecting ? "Joining…" : "Join Meeting"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── IN CALL ───────────────────────────────────────────────────────────────
  return (
    <div className="g-lk-wrap" data-lk-theme="default">
      {css}
      <LiveKitRoom
        serverUrl={joinData.url}
        token={joinData.token}
        connect={true}
        audio={micOn}
        video={camOn}
        onDisconnected={handleDisconnected}
        style={{ height: "100%", display: "flex", flexDirection: "column" }}
      >
        <RoomHeader
          meetTitle={meetInfo?.meetTitle || "CoWork Meeting"}
          guestName={guestName}
        />
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <RecordingBridge recording={recording} startMuted={!micOn} />
          <VideoConference />
          <RoomAudioRenderer />
        </div>
      </LiveKitRoom>
    </div>
  );
}
