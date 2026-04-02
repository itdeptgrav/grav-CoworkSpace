"use client";
/**
 * app/coworking/schedule-meet/page.js
 * Google Meet-inspired meetings list. Fully responsive.
 * Upcoming meetings shown first (soonest first), past meetings below (most recent first).
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { listMeets } from "../../../lib/coworkApi";

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
}

function initials(name = "") {
  return name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export default function MeetingsPage() {
  const { user, role, employeeId, loading } = useCoworkAuth();
  const router = useRouter();

  const [meets, setMeets] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");

  const isCEO = role === "ceo";

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

  if (loading || !user) return null;

  const now = Date.now();

  // Separate + sort: upcoming soonest first, past most-recent first
  const allFiltered = meets.filter(m => {
    const q = search.toLowerCase();
    return !q || m.title?.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q);
  });

  const upcomingMeets = allFiltered
    .filter(m => new Date(m.dateTime).getTime() >= now)
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime)); // soonest first

  const pastMeets = allFiltered
    .filter(m => new Date(m.dateTime).getTime() < now)
    .sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)); // most recent first

  const AVATAR_COLORS = ["#1a73e8", "#0f9d58", "#f29900", "#7b1fa2", "#d93025", "#00acc1", "#e64a19", "#0097a7"];
  const colorFor = (id) => AVATAR_COLORS[(id?.charCodeAt(0) || 0) % AVATAR_COLORS.length];

  function MeetCard({ meet }) {
    const dt = new Date(meet.dateTime);
    const isPast = dt.getTime() < now;
    const month = dt.toLocaleString("en-IN", { month: "short" });
    const day = dt.getDate();
    const time = dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    const parts = meet.participants || [];
    const shown = parts.slice(0, 4);
    const extra = parts.length - 4;

    return (
      <div className="ml-card">
        {/* Date column */}
        <div className="ml-card-date">
          <span className="ml-card-month">{month}</span>
          <span className="ml-card-day">{day}</span>
          <span className="ml-card-time">{time}</span>
        </div>

        <div className="ml-card-divider" />

        {/* Content */}
        <div className="ml-card-content">
          <div className="ml-card-top">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ml-card-title">{meet.title}</div>
              {meet.description && <div className="ml-card-desc">{meet.description}</div>}
            </div>
            <span className="ml-badge" style={{
              background: isPast ? "#f1f3f4" : "#e6f4ea",
              color: isPast ? "#80868b" : "#1e8e3e",
            }}>
              {isPast ? "Completed" : "Upcoming"}
            </span>
          </div>

          <div className="ml-card-meta">
            {parts.length > 0 && (
              <div className="ml-card-meta-item">
                <div className="ml-avatars">
                  {shown.map((pid, i) => (
                    <div key={pid} className="ml-p-avatar"
                      style={{ background: colorFor(pid), zIndex: shown.length - i }}>
                      {(pid || "?")[0].toUpperCase()}
                    </div>
                  ))}
                  {extra > 0 && <div className="ml-p-extra">+{extra}</div>}
                </div>
                <span style={{ marginLeft: 6 }}>{parts.length} participant{parts.length !== 1 ? "s" : ""}</span>
              </div>
            )}
            <div className="ml-card-meta-item" style={{ fontFamily: "monospace", fontSize: 11 }}>
              {meet.meetId}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7, alignSelf: "center", flexShrink: 0 }}>
          {meet.googleMeetLink && !isPast && (
            <a href={meet.googleMeetLink} target="_blank" rel="noopener noreferrer"
              className="ml-join-btn ml-join-google">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
              Join
            </a>
          )}
          <button className="ml-join-btn ml-join-cowork"
            onClick={() => router.push(`/coworking/cowork-meeting/${meet.meetId}`)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 10l5 5-5 5" /><path d="M4 4v7a4 4 0 004 4h12" />
            </svg>
            CoWork
          </button>
        </div>
      </div>
    );
  }

  function SectionHeader({ label, count }) {
    return (
      <div className="ml-section-head">
        <span className="ml-section-label">{label}</span>
        <span className="ml-section-count">{count}</span>
      </div>
    );
  }

  function EmptyState({ message }) {
    return (
      <div className="ml-empty-inline">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
          <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
        </svg>
        {message}
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .ml-page {
          min-height: 100vh;
          background: #f8f9fa;
          font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding-bottom: 40px;
        }

        .ml-header {
          background: #fff;
          border-bottom: 1px solid #e8eaed;
          padding: 0 24px;
          display: flex; align-items: center; justify-content: space-between;
          height: 64px; gap: 16px;
        }
        .ml-header-left { display: flex; align-items: center; gap: 10px; }
        .ml-header-icon {
          width: 36px; height: 36px; border-radius: 8px;
          background: #e8f0fe;
          display: flex; align-items: center; justify-content: center;
        }
        .ml-header-title { font-size: 20px; font-weight: 500; color: #202124; }
        .ml-new-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 9px 20px; background: #1a73e8; color: #fff;
          border: none; border-radius: 4px; font-size: 14px; font-weight: 500;
          cursor: pointer; font-family: inherit; transition: background 0.12s; white-space: nowrap;
        }
        .ml-new-btn:hover { background: #1557b0; }

        .ml-search-bar {
          background: #fff; border-bottom: 1px solid #e8eaed;
          padding: 10px 24px; display: flex; align-items: center; gap: 10px;
        }
        .ml-search {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 14px; border: 1.5px solid #e8eaed; border-radius: 24px;
          background: #f8f9fa; max-width: 360px; width: 100%; transition: all 0.15s;
        }
        .ml-search:focus-within { background: #fff; border-color: #1a73e8; box-shadow: 0 0 0 3px rgba(26,115,232,0.1); }
        .ml-search input { border:none; background:none; outline:none; font-size:13px; color:#202124; font-family:inherit; width:100%; }
        .ml-search input::placeholder { color: #9aa0a6; }
        .ml-meet-count { font-size: 13px; color: #80868b; margin-left: auto; }

        .ml-body { max-width: 880px; margin: 0 auto; padding: 20px; display: flex; flex-direction: column; gap: 0; }

        /* Section headers */
        .ml-section-head {
          display: flex; align-items: center; gap: 8px;
          padding: 16px 0 8px; margin-top: 4px;
        }
        .ml-section-label {
          font-size: 12px; font-weight: 600; color: #5f6368;
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .ml-section-count {
          font-size: 11px; font-weight: 600; padding: 1px 7px;
          border-radius: 99px; background: #f1f3f4; color: #5f6368;
        }
        .ml-section-divider {
          border: none; border-top: 1px solid #e8eaed; margin: 20px 0 0;
        }

        /* Cards */
        .ml-cards { display: flex; flex-direction: column; gap: 8px; }
        .ml-card {
          background: #fff; border: 1px solid #e8eaed; border-radius: 8px;
          padding: 16px 18px; display: flex; align-items: flex-start; gap: 14px;
          transition: box-shadow 0.12s;
        }
        .ml-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .ml-card-date {
          width: 50px; flex-shrink: 0; text-align: center;
          display: flex; flex-direction: column; align-items: center;
        }
        .ml-card-month { font-size: 11px; font-weight: 600; color: #9aa0a6; text-transform: uppercase; letter-spacing: 0.05em; }
        .ml-card-day   { font-size: 26px; font-weight: 400; color: #202124; line-height: 1.1; }
        .ml-card-time  { font-size: 10px; color: #9aa0a6; margin-top: 3px; }
        .ml-card-divider { width: 1px; background: #e8eaed; align-self: stretch; flex-shrink: 0; }
        .ml-card-content { flex: 1; min-width: 0; }
        .ml-card-top {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 10px; margin-bottom: 6px;
        }
        .ml-card-title { font-size: 15px; font-weight: 500; color: #202124; }
        .ml-card-desc  { font-size: 13px; color: #5f6368; margin-top: 2px; line-height: 1.5;
          overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
          -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .ml-card-meta  { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 8px; }
        .ml-card-meta-item { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #80868b; }
        .ml-badge {
          font-size: 11px; font-weight: 500; padding: 3px 10px;
          border-radius: 12px; white-space: nowrap; flex-shrink: 0;
        }
        .ml-avatars { display: flex; }
        .ml-p-avatar {
          width: 22px; height: 22px; border-radius: 50%;
          color: #fff; display: flex; align-items: center; justify-content: center;
          font-size: 8px; font-weight: 700; border: 2px solid #fff;
          margin-left: -5px; flex-shrink: 0;
        }
        .ml-p-avatar:first-child { margin-left: 0; }
        .ml-p-extra {
          width: 22px; height: 22px; border-radius: 50%; background: #f1f3f4;
          color: #5f6368; display: flex; align-items: center; justify-content: center;
          font-size: 8px; font-weight: 700; border: 2px solid #fff; margin-left: -5px;
        }
        .ml-join-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 14px; border-radius: 4px; border: none;
          font-size: 12px; font-weight: 500; cursor: pointer;
          font-family: inherit; text-decoration: none; white-space: nowrap;
          transition: background 0.12s;
        }
        .ml-join-google { background: #1a73e8; color: #fff; }
        .ml-join-google:hover { background: #1557b0; }
        .ml-join-cowork { background: #f8f9fa; color: #1a73e8; border: 1px solid #e8eaed !important; }
        .ml-join-cowork:hover { background: #e8f0fe; }

        /* Empty inline */
        .ml-empty-inline {
          display: flex; align-items: center; gap: 8px;
          padding: 14px 16px; background: #f8f9fa; border: 1px dashed #e8eaed;
          border-radius: 8px; font-size: 13px; color: #9aa0a6;
        }

        /* Full empty */
        .ml-empty { text-align: center; padding: 80px 20px; color: #9aa0a6; }
        .ml-empty-icon {
          width: 64px; height: 64px; border-radius: 50%; background: #f1f3f4;
          display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;
        }

        /* Skeleton */
        .ml-skel { animation: ml-pulse 1.4s ease infinite; }
        @keyframes ml-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        @media (max-width: 640px) {
          .ml-header { padding: 0 14px; height: 56px; }
          .ml-header-title { font-size: 17px; }
          .ml-search-bar { padding: 8px 14px; }
          .ml-body { padding: 12px; }
          .ml-card { padding: 12px 14px; gap: 10px; }
          .ml-card-day { font-size: 20px; }
          .ml-new-btn span { display: none; }
          .ml-card-desc { display: none; }
        }
      `}</style>

      <div className="ml-page">
        {/* Header */}
        <div className="ml-header">
          <div className="ml-header-left">
            <div className="ml-header-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
            </div>
            <span className="ml-header-title">Meetings</span>
          </div>
          {isCEO && (
            <button className="ml-new-btn" onClick={() => router.push("/coworking/schedule-meet/new")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New Meeting</span>
            </button>
          )}
        </div>

        {/* Search bar */}
        <div className="ml-search-bar">
          <div className="ml-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search meetings…" />
          </div>
          <span className="ml-meet-count">{meets.length} meeting{meets.length !== 1 ? "s" : ""} total</span>
        </div>

        {/* Body */}
        <div className="ml-body">
          {fetching ? (
            <>
              {[1, 2, 3].map(i => (
                <div key={i} className="ml-card ml-skel" style={{ marginBottom: 8 }}>
                  <div style={{ width: 50, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 28, height: 10, background: "#f1f3f4", borderRadius: 3 }} />
                    <div style={{ width: 36, height: 24, background: "#f1f3f4", borderRadius: 3 }} />
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ width: "55%", height: 13, background: "#f1f3f4", borderRadius: 3 }} />
                    <div style={{ width: "35%", height: 11, background: "#f1f3f4", borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </>
          ) : meets.length === 0 ? (
            <div className="ml-empty">
              <div className="ml-empty-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#bdc1c6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#80868b", marginBottom: 6 }}>No meetings yet</div>
              {isCEO && <div style={{ fontSize: 13 }}>Schedule a meeting to get started.</div>}
            </div>
          ) : (
            <>
              {/* ── UPCOMING ── */}
              <SectionHeader label="Upcoming" count={upcomingMeets.length} />
              <div className="ml-cards">
                {upcomingMeets.length === 0
                  ? <EmptyState message="No upcoming meetings" />
                  : upcomingMeets.map(m => <MeetCard key={m.meetId} meet={m} />)
                }
              </div>

              {/* ── PAST ── */}
              <hr className="ml-section-divider" />
              <SectionHeader label="Past" count={pastMeets.length} />
              <div className="ml-cards">
                {pastMeets.length === 0
                  ? <EmptyState message="No past meetings" />
                  : pastMeets.map(m => <MeetCard key={m.meetId} meet={m} />)
                }
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}