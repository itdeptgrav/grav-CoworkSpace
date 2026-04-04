"use client";
/**
 * app/coworking/schedule-meet/page.js
 * Status logic:
 *   LIVE     — dateTime <= now <= dateTime + 2h  (or meet.status === "live")
 *   UPCOMING — scheduled but not yet started
 *   ENDED    — past the 2h window  (or meet.status === "ended")
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { listMeets } from "../../../lib/coworkApi";
import { firebaseDb } from "../../../lib/coworkFirebase";
import { collection, getDocs } from "firebase/firestore";
import MeetingSummaryModal from "../../../components/coworking/meets/MeetingSummaryModal";

function getMeetStatus(meet) {
  if (meet.status === "ended") return "ended";
  if (meet.status === "live") return "live";
  const start = new Date(meet.dateTime).getTime();
  const now = Date.now();
  if (now >= start && now <= start + 2 * 3600000) return "live";
  if (now > start + 2 * 3600000) return "ended";
  return "upcoming";
}

function fmtFull(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function timeUntil(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 23) return `in ${Math.floor(h / 24)}d`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

const AV_COLORS = ["#1a73e8", "#0f9d58", "#f29900", "#7b1fa2", "#d93025", "#00acc1", "#e64a19", "#0097a7"];
const avBg = (id = "") => AV_COLORS[(id.charCodeAt(0) || 0) % AV_COLORS.length];

function MeetCard({ meet, status, router, empMap = {}, onViewSummary, isHost }) {
  const dt = new Date(meet.dateTime);
  const month = dt.toLocaleString("en-IN", { month: "short" });
  const day = dt.getDate();
  const time = dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const parts = meet.participants || [];
  const shown = parts.slice(0, 4);
  const extra = parts.length - shown.length;
  const until = status === "upcoming" ? timeUntil(meet.dateTime) : null;

  // Helper: get name for a participant ID
  const getName = (pid) => empMap[pid]?.name || pid || "?";
  const getDept = (pid) => empMap[pid]?.department || "";

  // Initials from a name string
  const getInitials = (name) =>
    name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  // Show participant names as a tooltip list — "Ramesh Kumar, Priya Singh, +2 more"
  const allNames = parts.map(pid => getName(pid));
  const shownNames = allNames.slice(0, 4);
  const tooltipText = allNames.slice(0, 8).join(", ") + (allNames.length > 8 ? ` +${allNames.length - 8} more` : "");

  return (
    <div className={`smc${status === "live" ? " smc-live" : ""}${status === "ended" ? " smc-ended" : ""}`}>
      <div className="smc-date">
        <span className="smc-month">{month}</span>
        <span className="smc-day">{day}</span>
        <span className="smc-time">{time}</span>
      </div>
      <div className="smc-divider" />
      <div className="smc-body">
        <div className="smc-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="smc-title">{meet.title}</div>
            {meet.description && <div className="smc-desc">{meet.description}</div>}
          </div>
          {status === "live" && (
            <span className="smc-badge smc-badge-live">
              <span className="smc-live-ring" />
              <span className="smc-live-dot" />
              LIVE
            </span>
          )}
          {status === "upcoming" && (
            <span className="smc-badge smc-badge-upcoming">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              Upcoming
            </span>
          )}
          {status === "ended" && (
            <span className="smc-badge smc-badge-ended">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              Ended
            </span>
          )}
        </div>
        <div className="smc-meta">
          {status === "live" && <span className="smc-meta-live">Started at {time}</span>}
          {status === "upcoming" && until && <span className="smc-meta-until">{until}</span>}
          {status === "ended" && <span className="smc-meta-ended">{fmtFull(meet.dateTime)}</span>}
          {parts.length > 0 && (
            <div className="smc-avstack" title={tooltipText} style={{ cursor: "default" }}>
              {shown.map((pid, i) => {
                const name = getName(pid);
                const init = getInitials(name);
                return (
                  <div key={pid} className="smc-av"
                    style={{ background: avBg(pid), zIndex: shown.length - i }}
                    title={`${name}${getDept(pid) ? ` · ${getDept(pid)}` : ""}`}>
                    {init}
                  </div>
                );
              })}
              {extra > 0 && <div className="smc-av-extra" title={allNames.slice(4).join(", ")}>+{extra}</div>}
              {/* Show first 2 names as text next to avatars */}
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 8, gap: 0 }}>
                <span className="smc-av-count">
                  {parts.length} participant{parts.length !== 1 ? "s" : ""}
                </span>
                {shownNames.length > 0 && (
                  <span style={{ fontSize: 10, color: "#9AA0A6", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {shownNames.slice(0, 2).join(", ")}{shownNames.length > 2 ? ` +${parts.length - 2} more` : ""}
                  </span>
                )}
              </div>
            </div>
          )}
          <span className="smc-meetid">{meet.meetId}</span>
        </div>
      </div>
      <div className="smc-actions">
        {status === "live" && (
          <button className="smc-btn smc-btn-join" onClick={() => router.push(`/coworking/cowork-meeting/${meet.meetId}`)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
            Join Now
          </button>
        )}
        {status === "upcoming" && (
          <>
            <button className="smc-btn smc-btn-cowork" onClick={() => router.push(`/coworking/cowork-meeting/${meet.meetId}`)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
              CoWork
            </button>
            {meet.googleMeetLink && (
              <a href={meet.googleMeetLink} target="_blank" rel="noopener noreferrer" className="smc-btn smc-btn-gmeet">
                Google Meet
              </a>
            )}
          </>
        )}
        {status === "ended" && (
          <button className="smc-btn smc-btn-view" onClick={() => router.push(`/coworking/cowork-meeting/${meet.meetId}`)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            View
          </button>
        )}
        {/* View Summary button — CEO/TL only */}
        {isHost && (
          <button
            className="smc-btn smc-btn-summary"
            onClick={() => onViewSummary(meet.meetId, meet.title)}
            title="View AI Meeting Summary"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Summary
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ label, count, dotColor, dotGlow, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 2px" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, boxShadow: dotGlow || "none", flexShrink: 0, display: "inline-block" }} />
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#5f6368" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 99, background: "#F1F3F4", color: "#5f6368" }}>{count}</span>
        <div style={{ flex: 1, height: 1, background: "#E4E7EC" }} />
      </div>
      {children}
    </div>
  );
}

function EmptyInline({ message }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#F8F9FA", border: "1.5px dashed #E4E7EC", borderRadius: 10, fontSize: 13, color: "#9AA0A6" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, flexShrink: 0 }}>
        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      {message}
    </div>
  );
}

export default function MeetingsPage() {
  const { user, role, loading } = useCoworkAuth();
  const router = useRouter();

  const [meets, setMeets] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");
  const [, setTick] = useState(0);
  const [empMap, setEmpMap] = useState({}); // employeeId -> { name, department }
  const [summaryModal, setSummaryModal] = useState(null); // { meetId, meetTitle } | null

  const handleViewSummary = (meetId, meetTitle) => setSummaryModal({ meetId, meetTitle });

  const isCEO = role === "ceo";
  const isHost = role === "ceo" || role === "tl";

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.push("/coworking-login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    listMeets()
      .then(d => setMeets(d.meets || []))
      .catch(() => { })
      .finally(() => setFetching(false));
  }, [user]);

  // Load employee names from Firestore for avatar tooltips
  useEffect(() => {
    if (!user) return;
    getDocs(collection(firebaseDb, "cowork_employees"))
      .then(snap => {
        const map = {};
        snap.forEach(d => {
          const e = d.data();
          if (e.employeeId) map[e.employeeId] = { name: e.name || "?", department: e.department || "" };
        });
        setEmpMap(map);
      })
      .catch(() => { });
  }, [user]);

  if (loading || !user) return null;

  const q = search.toLowerCase();
  const filtered = meets.filter(m =>
    !q || m.title?.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q)
  );

  const live = filtered.filter(m => getMeetStatus(m) === "live").sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  const upcoming = filtered.filter(m => getMeetStatus(m) === "upcoming").sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  const ended = filtered.filter(m => getMeetStatus(m) === "ended").sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));

  return (
    <>
      <style>{`
        .sm-page{min-height:100vh;background:#F0F2F5;font-family:'Inter','Google Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
        .sm-hdr{background:#fff;border-bottom:1px solid #E4E7EC;padding:0 28px;height:64px;display:flex;align-items:center;justify-content:space-between;gap:16px;position:sticky;top:0;z-index:10}
        .sm-hdr-icon{width:38px;height:38px;border-radius:10px;background:#EBF3FE;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .sm-hdr-title{font-size:18px;font-weight:600;color:#1A1D21;letter-spacing:-0.01em}
        .sm-new-btn{display:inline-flex;align-items:center;gap:8px;padding:9px 20px;background:#1a73e8;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:background 0.12s;white-space:nowrap}
        .sm-new-btn:hover{background:#1557b0}
        .sm-stats{display:flex;gap:8px;padding:16px 28px 0;flex-wrap:wrap}
        .sm-stat{padding:10px 18px;background:#fff;border:1px solid #E4E7EC;border-radius:10px;display:flex;flex-direction:column;align-items:center;gap:1px;min-width:70px}
        .sm-stat-n{font-size:20px;font-weight:700;line-height:1}
        .sm-stat-l{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#9AA0A6}
        .sm-search-wrap{padding:14px 28px 0}
        .sm-search{display:flex;align-items:center;gap:8px;padding:9px 14px;border:1.5px solid #E4E7EC;border-radius:8px;background:#fff;max-width:360px;transition:all 0.15s}
        .sm-search:focus-within{border-color:#1a73e8;box-shadow:0 0 0 3px rgba(26,115,232,0.1)}
        .sm-search input{border:none;background:none;outline:none;font-size:13px;color:#1A1D21;font-family:inherit;width:100%}
        .sm-search input::placeholder{color:#9AA0A6}
        .sm-body{padding:20px 28px 60px;display:flex;flex-direction:column;gap:24px}
        /* Card */
        .smc{background:#fff;border:1px solid #E4E7EC;border-radius:12px;padding:18px 20px;display:flex;align-items:flex-start;gap:14px;transition:box-shadow 0.15s,border-color 0.15s}
        .smc:hover{box-shadow:0 4px 16px rgba(0,0,0,0.07);border-color:#D0D5DD}
        .smc-live{border-left:3px solid #EA4335}
        .smc-ended{opacity:0.68}
        .smc-date{width:50px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:1px}
        .smc-month{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#9AA0A6}
        .smc-day{font-size:26px;font-weight:400;color:#1A1D21;line-height:1}
        .smc-time{font-size:10px;color:#9AA0A6;margin-top:3px}
        .smc-ended .smc-day{color:#9AA0A6}
        .smc-divider{width:1px;background:#E4E7EC;align-self:stretch;flex-shrink:0}
        .smc-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
        .smc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
        .smc-title{font-size:15px;font-weight:600;color:#1A1D21;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .smc-ended .smc-title{color:#6B7280}
        .smc-desc{font-size:12px;color:#6B7280;line-height:1.5;margin-top:2px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical}
        /* Badges */
        .smc-badge{font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;white-space:nowrap;flex-shrink:0;display:inline-flex;align-items:center;gap:5px;letter-spacing:0.03em}
        .smc-badge-live{background:#FEF2F2;color:#EA4335;border:1px solid #FECDD3;position:relative}
        .smc-badge-upcoming{background:#EFF6FF;color:#1a73e8;border:1px solid #BFDBFE}
        .smc-badge-ended{background:#F1F3F4;color:#9AA0A6;border:1px solid #E4E7EC}
        /* Live animation */
        .smc-live-dot{width:7px;height:7px;border-radius:50%;background:#EA4335;display:inline-block;flex-shrink:0}
        .smc-live-ring{position:absolute;width:7px;height:7px;border-radius:50%;background:transparent;border:2px solid #EA4335;animation:sm-ring 1.4s ease-out infinite}
        @keyframes sm-ring{0%{transform:scale(1);opacity:1}100%{transform:scale(2.8);opacity:0}}
        /* Meta */
        .smc-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .smc-meta-live{font-size:11px;color:#EA4335;font-weight:600}
        .smc-meta-until{font-size:11px;color:#1a73e8;font-weight:600}
        .smc-meta-ended{font-size:11px;color:#9AA0A6}
        .smc-avstack{display:flex;align-items:center;gap:0}
        .smc-av{width:20px;height:20px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;border:2px solid #fff;margin-left:-5px;flex-shrink:0}
        .smc-av:first-child{margin-left:0}
        .smc-av-extra{width:20px;height:20px;border-radius:50%;background:#F1F3F4;color:#6B7280;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;border:2px solid #fff;margin-left:-5px}
        .smc-av-count{font-size:11px;color:#9AA0A6;margin-left:7px;white-space:nowrap}
        .smc-meetid{font-family:monospace;font-size:10px;color:#BDC1C6}
        /* Actions */
        .smc-actions{display:flex;flex-direction:column;gap:6px;align-self:center;flex-shrink:0}
        .smc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 14px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none;white-space:nowrap;transition:all 0.12s;border:none}
        .smc-btn-join{background:#16A34A;color:#fff;box-shadow:0 2px 8px rgba(22,163,74,0.25)}
        .smc-btn-join:hover{background:#15803D}
        .smc-btn-join:hover{background:#C5221F}
        .smc-btn-cowork{background:#EBF3FE;color:#1a73e8;border:1px solid #BFDBFE !important}
        .smc-btn-cowork:hover{background:#D2E3FC}
        .smc-btn-gmeet{background:#fff;color:#5f6368;border:1px solid #E4E7EC !important}
        .smc-btn-gmeet:hover{background:#F8F9FA}
        .smc-btn-view{background:#F8F9FA;color:#9AA0A6;border:1px solid #E4E7EC !important}
        .smc-btn-view:hover{background:#F1F3F4}
        .smc-btn-summary{background:#F0FDF4;color:#16A34A;border:1px solid #BBF7D0 !important}
        .smc-btn-summary:hover{background:#DCFCE7}
        /* Skeleton */
        .sm-skel{animation:sm-sk 1.4s ease infinite}
        @keyframes sm-sk{0%,100%{opacity:1}50%{opacity:0.4}}
        .sm-skel-b{background:#F1F3F4;border-radius:6px}
        /* Responsive */
        @media(max-width:640px){
          .sm-hdr{padding:0 16px;height:56px}
          .sm-hdr-title{font-size:15px}
          .sm-stats{padding:10px 16px 0;gap:6px}
          .sm-search-wrap{padding:10px 16px 0}
          .sm-search{max-width:100%}
          .sm-body{padding:14px 16px 60px;gap:18px}
          .smc{padding:14px 14px;gap:10px}
          .smc-day{font-size:20px}
          .smc-desc{display:none}
          .sm-new-btn .sm-btn-label{display:none}
          .smc-meetid{display:none}
        }
        @media(max-width:400px){
          .smc{flex-wrap:wrap}
          .smc-divider{display:none}
          .smc-actions{flex-direction:row;flex-wrap:wrap;align-self:stretch}
          .smc-btn{flex:1}
        }
      `}</style>

      <div className="sm-page">
        <div className="sm-hdr">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="sm-hdr-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
            </div>
            <span className="sm-hdr-title">Meetings</span>
          </div>
          {isCEO && (
            <button className="sm-new-btn" onClick={() => router.push("/coworking/schedule-meet/new")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              <span className="sm-btn-label">New Meeting</span>
            </button>
          )}
        </div>

        {!fetching && meets.length > 0 && (
          <div className="sm-stats">
            {[
              { n: live.length, l: "Live", c: "#EA4335" },
              { n: upcoming.length, l: "Upcoming", c: "#1a73e8" },
              { n: ended.length, l: "Ended", c: "#9AA0A6" },
              { n: meets.length, l: "Total", c: "#1A1D21" },
            ].map(s => (
              <div className="sm-stat" key={s.l}>
                <span className="sm-stat-n" style={{ color: s.c }}>{s.n}</span>
                <span className="sm-stat-l">{s.l}</span>
              </div>
            ))}
          </div>
        )}

        <div className="sm-search-wrap">
          <div className="sm-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search meetings…" />
            {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#9AA0A6", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
          </div>
        </div>

        <div className="sm-body">
          {fetching ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="smc sm-skel" style={{ gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, width: 50 }}>
                    <div className="sm-skel-b" style={{ width: 28, height: 9 }} />
                    <div className="sm-skel-b" style={{ width: 34, height: 24 }} />
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                    <div className="sm-skel-b" style={{ width: "52%", height: 13 }} />
                    <div className="sm-skel-b" style={{ width: "32%", height: 10 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : meets.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "#9AA0A6" }}>
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#D0D5DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 16px", display: "block" }}>
                <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#6B7280", marginBottom: 6 }}>No meetings yet</div>
              {isCEO && <div style={{ fontSize: 13, color: "#9AA0A6" }}>Click "New Meeting" to schedule one.</div>}
            </div>
          ) : (
            <>
              {live.length > 0 && (
                <Section label="Live Now" count={live.length} dotColor="#EA4335" dotGlow="0 0 0 3px rgba(234,67,53,0.25)">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {live.map(m => <MeetCard key={m.meetId} meet={m} status="live" router={router} empMap={empMap} onViewSummary={handleViewSummary} isHost={isHost} />)}
                  </div>
                </Section>
              )}
              <Section label="Upcoming" count={upcoming.length} dotColor="#1a73e8">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {upcoming.length === 0
                    ? <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#F8F9FA", border: "1.5px dashed #E4E7EC", borderRadius: 10, fontSize: 13, color: "#9AA0A6" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      No upcoming meetings
                    </div>
                    : upcoming.map(m => <MeetCard key={m.meetId} meet={m} status="upcoming" router={router} empMap={empMap} onViewSummary={handleViewSummary} isHost={isHost} />)
                  }
                </div>
              </Section>
              {ended.length > 0 && (
                <Section label="Past" count={ended.length} dotColor="#D0D5DD">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ended.map(m => <MeetCard key={m.meetId} meet={m} status="ended" router={router} empMap={empMap} onViewSummary={handleViewSummary} isHost={isHost} />)}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Meeting Summary Modal */}
      {summaryModal && (
        <MeetingSummaryModal
          meetId={summaryModal.meetId}
          meetTitle={summaryModal.meetTitle}
          onClose={() => setSummaryModal(null)}
        />
      )}
    </>
  );
}