"use client";
import React from "react";
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
import { listMeets, cancelMeet, updateMeet } from "../../../lib/coworkApi";
import { firebaseDb } from "../../../lib/coworkFirebase";
import { collection, getDocs } from "firebase/firestore";
import MeetingSummaryModal from "../../../components/coworking/meets/MeetingSummaryModal";

function getMeetStatus(meet) {
  if (meet.isCancelled) return "cancelled";
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

// ── EditMeetingModal ───────────────────────────────────────────────────────────
function EditMeetingModal({ meet, employees, saving, error, onSave, onClose }) {
  const [form, setForm] = React.useState({
    title: meet.title || "",
    description: meet.description || "",
    dateTime: meet.dateTime ? new Date(meet.dateTime).toISOString().slice(0, 16) : "",
    googleMeetLink: meet.googleMeetLink || "",
  });
  const [participantIds, setParticipantIds] = React.useState([...(meet.participants || [])]);
  const [deptFilter, setDeptFilter] = React.useState([]);
  const [empSearch, setEmpSearch] = React.useState("");

  const AV_COLORS = ["#1a73e8", "#0f9d58", "#f29900", "#7b1fa2", "#d93025", "#00acc1", "#e64a19", "#0097a7"];
  const avBg = (id = "") => AV_COLORS[(id.charCodeAt(0) || 0) % AV_COLORS.length];
  const initials = (name = "") => name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  const allDepts = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();

  const visibleEmps = employees.filter(e => {
    const matchDept = deptFilter.length === 0 || deptFilter.includes(e.department);
    const matchSearch = !empSearch || (e.name || "").toLowerCase().includes(empSearch.toLowerCase());
    return matchDept && matchSearch;
  });

  const togglePart = (id) =>
    setParticipantIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const selectAll = () => {
    const ids = visibleEmps.map(e => e.employeeId);
    setParticipantIds(prev => [...new Set([...prev, ...ids])]);
  };

  const handleSubmit = () => {
    onSave({
      title: form.title,
      description: form.description,
      dateTime: form.dateTime,
      googleMeetLink: form.googleMeetLink,
      participants: participantIds,
    });
  };

  // Prevent background scroll
  React.useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="sm-edit-overlay" onClick={onClose}>
      <div className="sm-edit-box" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sm-edit-head">
          <span className="sm-edit-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", marginRight: 8, verticalAlign: "middle" }}>
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit Meeting
          </span>
          <button className="sm-edit-close" onClick={onClose}>×</button>
        </div>

        <div className="sm-edit-body">
          {error && <div className="sm-edit-err">{error}</div>}

          {/* Title */}
          <div className="sm-edit-field">
            <label className="sm-edit-label">Meeting Title *</label>
            <input
              className="sm-edit-input"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Weekly Sync"
            />
          </div>

          {/* Description */}
          <div className="sm-edit-field">
            <label className="sm-edit-label">Description</label>
            <textarea
              className="sm-edit-input sm-edit-textarea"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Agenda, notes, context…"
            />
          </div>

          {/* Date & Time */}
          <div className="sm-edit-field">
            <label className="sm-edit-label">Date & Time *</label>
            <input
              className="sm-edit-input"
              type="datetime-local"
              value={form.dateTime}
              onChange={e => setForm(p => ({ ...p, dateTime: e.target.value }))}
            />
          </div>

          {/* Google Meet Link */}
          <div className="sm-edit-field">
            <label className="sm-edit-label">Google Meet Link (optional)</label>
            <input
              className="sm-edit-input"
              value={form.googleMeetLink}
              onChange={e => setForm(p => ({ ...p, googleMeetLink: e.target.value }))}
              placeholder="https://meet.google.com/xxx-xxxx-xxx"
            />
          </div>

          {/* Participants */}
          <div className="sm-edit-field">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <label className="sm-edit-label" style={{ marginBottom: 0 }}>
                Participants ({participantIds.length} selected)
              </label>
              <button
                onClick={selectAll}
                style={{ fontSize: 11, color: "#1a73e8", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
              >
                Select all visible
              </button>
            </div>

            {/* Dept filter pills */}
            {allDepts.length > 0 && (
              <div className="sm-edit-dept-row">
                {allDepts.map(d => (
                  <button
                    key={d}
                    className={`sm-edit-dept-btn${deptFilter.includes(d) ? " active" : ""}`}
                    onClick={() => setDeptFilter(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}

            {/* Employee search */}
            <input
              className="sm-edit-input"
              value={empSearch}
              onChange={e => setEmpSearch(e.target.value)}
              placeholder="Search by name…"
              style={{ marginBottom: 6 }}
            />

            {/* Employee list */}
            <div className="sm-edit-emp-list">
              {visibleEmps.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", color: "#9AA0A6", fontSize: 12 }}>No employees found</div>
              ) : visibleEmps.map(emp => {
                const checked = participantIds.includes(emp.employeeId);
                return (
                  <div key={emp.employeeId} className="sm-edit-emp-item" onClick={() => togglePart(emp.employeeId)}>
                    <div className="sm-edit-emp-av" style={{ background: avBg(emp.employeeId) }}>
                      {initials(emp.name || "")}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="sm-edit-emp-name">{emp.name || emp.employeeId}</div>
                      {emp.department && <div className="sm-edit-emp-dept">{emp.department}{emp.role === "tl" ? " · TL" : ""}</div>}
                    </div>
                    <div className={`sm-edit-emp-check${checked ? " checked" : ""}`}>
                      {checked && (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sm-edit-foot">
          <button className="sm-edit-cancel-btn" onClick={onClose} disabled={saving}>
            Discard
          </button>
          <button className="sm-edit-save-btn" onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "sm-spin 0.8s linear infinite" }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Saving…
              </span>
            ) : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}


function MeetCard({ meet, status, router, empMap = {}, onViewSummary, isHost, onCancel, cancellingId, employeeId, onEdit }) {
  const isCancelled = status === "cancelled";
  const dt = new Date(meet.dateTime);
  const month = dt.toLocaleString("en-IN", { month: "short" });
  const day = dt.getDate();
  const time = dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const parts = meet.participants || [];
  const shown = parts.slice(0, 4);
  const extra = parts.length - shown.length;
  const until = status === "upcoming" ? timeUntil(meet.dateTime) : null;

  const getName = (pid) => empMap[pid]?.name || pid || "?";
  const getDept = (pid) => empMap[pid]?.department || "";
  const getInitials = (name) =>
    name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  const allNames = parts.map(pid => getName(pid));
  const shownNames = allNames.slice(0, 4);
  const tooltipText = allNames.slice(0, 8).join(", ") + (allNames.length > 8 ? ` +${allNames.length - 8} more` : "");

  // Only the organiser (CEO/TL who created it) can edit/cancel — not ended or already cancelled
  const canManage = isHost && meet.createdBy === employeeId && !isCancelled && status !== "ended";
  const isCancelling = cancellingId === meet.meetId;

  // ── Three-dot menu state (local to this card) ─────────────────────────
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div className={`smc${status === "live" ? " smc-live" : ""}${status === "ended" ? " smc-ended" : ""}${isCancelled ? " smc-cancelled" : ""}`}
      style={isCancelled ? { position: "relative" } : {}}>

      {/* ── Cancelled overlay blur ────────────────────────────────────────── */}
      {isCancelled && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 12, zIndex: 2,
          background: "rgba(255,255,255,0.55)", backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            background: "#FEF2F2", border: "1.5px solid #FECDD3",
            borderRadius: 10, padding: "8px 18px",
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#DC2626", letterSpacing: "0.02em" }}>
              ✕ &nbsp;Meeting Cancelled
            </span>
            {meet.cancelledByName && (
              <span style={{ fontSize: 10, color: "#9CA3AF" }}>
                by {meet.cancelledByName}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Card content (blurred when cancelled) ─────────────────────────── */}
      <div style={{
        display: "contents", filter: isCancelled ? "blur(1.5px)" : "none",
        pointerEvents: isCancelled ? "none" : "auto"
      }}>
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

        {/* ── Actions column ─────────────────────────────────────────────── */}
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
          {/* AI Summary — host only, not for cancelled */}
          {isHost && !isCancelled && (
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

          {/* ── Three-dot menu (Edit / Cancel) — only the organiser ───────── */}
          {canManage && (
            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                className="smc-btn smc-btn-more"
                onClick={() => setMenuOpen(p => !p)}
                title="More options"
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "sm-spin 0.8s linear infinite" }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                ) : (
                  <>
                    <span style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                    <span style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                    <span style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                  </>
                )}
              </button>

              {menuOpen && !isCancelling && (
                <div className="smc-popover">
                  {/* Edit */}
                  <button
                    className="smc-popover-item"
                    onClick={() => { setMenuOpen(false); onEdit(meet); }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit Meeting
                  </button>
                  <div style={{ height: 1, background: "#F3F4F6", margin: "2px 0" }} />
                  {/* Cancel */}
                  <button
                    className="smc-popover-item smc-popover-item-danger"
                    onClick={() => { setMenuOpen(false); onCancel(meet.meetId, meet.title, meet); }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    Cancel Meeting
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
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
  const { user, role, employeeId, loading } = useCoworkAuth();
  const router = useRouter();

  const [meets, setMeets] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");
  const [, setTick] = useState(0);
  const [empMap, setEmpMap] = useState({}); // employeeId -> { name, department }
  const [summaryModal, setSummaryModal] = useState(null); // { meetId, meetTitle } | null
  const [cancellingId, setCancellingId] = useState(null); // meetId being cancelled
  const [cancelConfirm, setCancelConfirm] = useState(null); // { meetId, title, meet } | null
  const [editModal, setEditModal] = useState(null); // meet object being edited | null
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const handleViewSummary = (meetId, meetTitle) => setSummaryModal({ meetId, meetTitle });

  // Show a confirmation dialog before cancelling
  const handleCancelRequest = (meetId, title, meet) => setCancelConfirm({ meetId, title, meet: meet || null });

  const handleCancelConfirm = async () => {
    if (!cancelConfirm) return;
    const { meetId } = cancelConfirm;
    setCancelConfirm(null);
    setCancellingId(meetId);
    try {
      await cancelMeet(meetId);
      // Optimistically update local state — mark as cancelled immediately
      setMeets(prev => prev.map(m =>
        m.meetId === meetId
          ? { ...m, isCancelled: true, cancelledByName: empMap[employeeId]?.name || "You" }
          : m
      ));
    } catch (e) {
      alert(e.message || "Failed to cancel meeting. Please try again.");
    } finally {
      setCancellingId(null);
    }
  };

  const handleEditOpen = (meet) => {
    setEditError("");
    setEditModal({ ...meet });
  };

  const handleEditSave = async (updated) => {
    if (!editModal) return;
    setEditError("");
    if (!updated.title?.trim()) { setEditError("Title is required."); return; }
    if (!updated.dateTime) { setEditError("Date and time is required."); return; }
    if (!updated.participants?.length) { setEditError("At least one participant is required."); return; }
    setEditSaving(true);
    try {
      await updateMeet(editModal.meetId, {
        title: updated.title.trim(),
        description: updated.description || "",
        dateTime: updated.dateTime,
        googleMeetLink: updated.googleMeetLink || null,
        participants: updated.participants,
      });
      // Optimistically update local state
      setMeets(prev => prev.map(m =>
        m.meetId === editModal.meetId ? { ...m, ...updated } : m
      ));
      setEditModal(null);
    } catch (e) {
      setEditError(e.message || "Failed to save. Please try again.");
    } finally {
      setEditSaving(false);
    }
  };

  const isCEO = role === "ceo";
  const isHost = role === "ceo" || role === "tl"; // CEO + TL can see Summary, New Meeting

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
  const cancelled = filtered.filter(m => getMeetStatus(m) === "cancelled").sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));

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
        /* Cancelled meeting */
        .smc-cancelled{border-left:3px solid #DC2626;opacity:1;position:relative;overflow:hidden}
        .smc-btn-cancel{background:#FEF2F2;color:#DC2626;border:1px solid #FECDD3 !important}
        .smc-btn-cancel:hover:not(:disabled){background:#FEE2E2}
        .smc-btn-cancel:disabled{opacity:0.6;cursor:not-allowed}
        /* Confirm dialog overlay */
        .sm-confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px}
        .sm-confirm-box{background:#fff;border-radius:14px;padding:28px 28px 22px;max-width:380px;width:100%;box-shadow:0 20px 48px rgba(0,0,0,0.18)}
        .sm-confirm-icon{width:44px;height:44px;border-radius:50%;background:#FEF2F2;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
        .sm-confirm-title{font-size:16px;font-weight:700;color:#1A1D21;text-align:center;margin-bottom:6px}
        .sm-confirm-body{font-size:13px;color:#6B7280;text-align:center;line-height:1.55;margin-bottom:20px}
        .sm-confirm-actions{display:flex;gap:10px}
        .sm-confirm-btn{flex:1;padding:10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.12s;border:none}
        .sm-confirm-cancel-btn{background:#F3F4F6;color:#374151}
        .sm-confirm-cancel-btn:hover{background:#E5E7EB}
        .sm-confirm-ok-btn{background:#DC2626;color:#fff}
        .sm-confirm-ok-btn:hover{background:#B91C1C}
        @keyframes sm-spin{to{transform:rotate(360deg)}}
        /* Three-dot button */
        .smc-btn-more{background:#F8F9FA;color:#5f6368;border:1px solid #E4E7EC !important;gap:3px;padding:7px 10px}
        .smc-btn-more:hover:not(:disabled){background:#F1F3F4}
        /* Popover menu */
        .smc-popover{position:absolute;right:0;top:calc(100% + 6px);background:#fff;border:1px solid #E4E7EC;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.13);z-index:50;min-width:160px;padding:4px;animation:smc-pop 0.12s cubic-bezier(0.4,0,0.2,1)}
        @keyframes smc-pop{from{opacity:0;transform:scale(0.94) translateY(-4px)}to{opacity:1;transform:scale(1) translateY(0)}}
        .smc-popover-item{width:100%;display:flex;align-items:center;gap:8px;padding:8px 12px;border:none;background:transparent;font-size:12px;font-weight:500;color:#374151;cursor:pointer;border-radius:7px;font-family:inherit;text-align:left;transition:background 0.1s}
        .smc-popover-item:hover{background:#F3F4F6}
        .smc-popover-item-danger{color:#DC2626}
        .smc-popover-item-danger:hover{background:#FEF2F2}
        /* Edit modal */
        .sm-edit-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px}
        .sm-edit-box{background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,0.2);animation:smc-pop 0.18s cubic-bezier(0.4,0,0.2,1)}
        .sm-edit-head{display:flex;align-items:center;justify-content:space-between;padding:20px 24px 0}
        .sm-edit-title{font-size:17px;font-weight:700;color:#1A1D21}
        .sm-edit-close{width:32px;height:32px;border:none;background:transparent;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#5f6368;font-size:20px;transition:background 0.1s}
        .sm-edit-close:hover{background:#F1F3F4}
        .sm-edit-body{padding:20px 24px}
        .sm-edit-field{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
        .sm-edit-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#5f6368}
        .sm-edit-input{padding:9px 12px;border:1.5px solid #E4E7EC;border-radius:8px;font-size:13px;color:#1A1D21;font-family:inherit;outline:none;transition:border 0.15s;width:100%}
        .sm-edit-input:focus{border-color:#1a73e8;box-shadow:0 0 0 3px rgba(26,115,232,0.1)}
        .sm-edit-textarea{resize:vertical;min-height:72px;line-height:1.5}
        .sm-edit-dept-row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
        .sm-edit-dept-btn{padding:4px 12px;border-radius:99px;border:1.5px solid #E4E7EC;background:#fff;font-size:11px;font-weight:600;color:#5f6368;cursor:pointer;transition:all 0.12s;font-family:inherit}
        .sm-edit-dept-btn.active{background:#1a73e8;border-color:#1a73e8;color:#fff}
        .sm-edit-emp-list{max-height:180px;overflow-y:auto;border:1.5px solid #E4E7EC;border-radius:8px;background:#FAFBFF}
        .sm-edit-emp-item{display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;transition:background 0.1s;border-bottom:1px solid #F3F4F6}
        .sm-edit-emp-item:last-child{border-bottom:none}
        .sm-edit-emp-item:hover{background:#F8F9FA}
        .sm-edit-emp-av{width:26px;height:26px;border-radius:50%;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .sm-edit-emp-name{font-size:12px;font-weight:500;color:#1A1D21;flex:1}
        .sm-edit-emp-dept{font-size:10px;color:#9AA0A6}
        .sm-edit-emp-check{width:16px;height:16px;border-radius:4px;border:1.5px solid #D0D5DD;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.12s}
        .sm-edit-emp-check.checked{background:#1a73e8;border-color:#1a73e8}
        .sm-edit-foot{padding:14px 24px 20px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid #F3F4F6}
        .sm-edit-save-btn{padding:9px 22px;background:#1a73e8;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:background 0.12s}
        .sm-edit-save-btn:hover:not(:disabled){background:#1557b0}
        .sm-edit-save-btn:disabled{opacity:0.6;cursor:not-allowed}
        .sm-edit-cancel-btn{padding:9px 18px;background:#F3F4F6;color:#374151;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:background 0.12s}
        .sm-edit-cancel-btn:hover{background:#E5E7EB}
        .sm-edit-err{color:#DC2626;font-size:12px;margin-bottom:10px;padding:8px 12px;background:#FEF2F2;border-radius:7px;border:1px solid #FECDD3}
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
          {/* CHANGED: isCEO → isHost so TL also sees New Meeting button */}
          {isHost && (
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
              { n: cancelled.length, l: "Cancelled", c: "#DC2626" },
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
              {/* CHANGED: isCEO → isHost so TL also sees the hint text */}
              {isHost && <div style={{ fontSize: 13, color: "#9AA0A6" }}>Click "New Meeting" to schedule one.</div>}
            </div>
          ) : (
            <>
              {live.length > 0 && (
                <Section label="Live Now" count={live.length} dotColor="#EA4335" dotGlow="0 0 0 3px rgba(234,67,53,0.25)">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {live.map(m => <MeetCard key={m.meetId} meet={m} status="live" router={router} empMap={empMap} onViewSummary={handleViewSummary} isHost={isHost} onCancel={handleCancelRequest} cancellingId={cancellingId} employeeId={employeeId} onEdit={handleEditOpen} />)}
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
                    : upcoming.map(m => <MeetCard key={m.meetId} meet={m} status="upcoming" router={router} empMap={empMap} onViewSummary={handleViewSummary} isHost={isHost} onCancel={handleCancelRequest} cancellingId={cancellingId} employeeId={employeeId} onEdit={handleEditOpen} />)
                  }
                </div>
              </Section>
              {ended.length > 0 && (
                <Section label="Past" count={ended.length} dotColor="#D0D5DD">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ended.map(m => <MeetCard key={m.meetId} meet={m} status="ended" router={router} empMap={empMap} onViewSummary={handleViewSummary} isHost={isHost} onCancel={handleCancelRequest} cancellingId={cancellingId} employeeId={employeeId} onEdit={handleEditOpen} />)}
                  </div>
                </Section>
              )}
              {/* Cancelled meetings — visible to host + all invited participants (blurred) */}
              {cancelled.length > 0 && (
                <Section label="Cancelled" count={cancelled.length} dotColor="#DC2626">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {cancelled.map(m => (
                      <MeetCard
                        key={m.meetId}
                        meet={m}
                        status="cancelled"
                        router={router}
                        empMap={empMap}
                        onViewSummary={handleViewSummary}
                        isHost={isHost}
                        onCancel={handleCancelRequest}
                        cancellingId={cancellingId}
                        employeeId={employeeId}
                        onEdit={handleEditOpen}
                      />
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Cancel Confirmation Dialog ─────────────────────────────────────── */}
      {cancelConfirm && (
        <div className="sm-confirm-overlay" onClick={() => setCancelConfirm(null)}>
          <div className="sm-confirm-box" onClick={e => e.stopPropagation()}>
            <div className="sm-confirm-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div className="sm-confirm-title">Cancel Meeting?</div>
            <div className="sm-confirm-body">
              <strong style={{ color: "#1A1D21", fontSize: 14 }}>{cancelConfirm.title}</strong>
              {cancelConfirm.meet?.dateTime && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#6B7280" }}>
                  📅 {fmtFull(cancelConfirm.meet.dateTime)}
                </div>
              )}
              {cancelConfirm.meet?.participants?.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 12, color: "#6B7280" }}>
                  👥 {cancelConfirm.meet.participants.length} participant{cancelConfirm.meet.participants.length !== 1 ? "s" : ""} will be notified
                </div>
              )}
              <div style={{ marginTop: 12, color: "#DC2626", fontWeight: 600, fontSize: 13 }}>This cannot be undone.</div>
            </div>
            <div className="sm-confirm-actions">
              <button className="sm-confirm-btn sm-confirm-cancel-btn" onClick={() => setCancelConfirm(null)}>
                Keep Meeting
              </button>
              <button className="sm-confirm-btn sm-confirm-ok-btn" onClick={handleCancelConfirm}>
                Yes, Cancel It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Meeting Modal ────────────────────────────────────────────── */}
      {editModal && (
        <EditMeetingModal
          meet={editModal}
          employees={(() => {
            const list = [];
            Object.entries(empMap).forEach(([id, e]) => {
              if (id !== employeeId) list.push({ employeeId: id, ...e });
            });
            return list;
          })()}
          saving={editSaving}
          error={editError}
          onSave={handleEditSave}
          onClose={() => { setEditModal(null); setEditError(""); }}
        />
      )}

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