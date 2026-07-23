"use client";
/**
 * app/coworking/schedule-meet/new/page.js
 *
 * Google Meet-inspired UI. Fully responsive.
 * Department-first participant selection.
 * All existing API calls (scheduleMeet, listEmployees) preserved.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../../hooks/useCoworkAuth";
import { scheduleMeet } from "../../../../lib/coworkApi";
import { firebaseDb } from "../../../../lib/coworkFirebase";
import { collection, getDocs } from "firebase/firestore";

export default function NewMeetPage() {
  const { user, role, employeeId, loading } = useCoworkAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    title: "",
    description: "",
    dateTime: "",
    googleMeetLink: "",
  });

  const [employees, setEmployees] = useState([]);
  const [participantIds, setParticipantIds] = useState([]);
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ── Auth guard ───────────────────────────────────────────────────────────
  useEffect(() => {
    // AFTER — TL allowed through:
    if (!loading && (!user || (role !== "ceo" && role !== "tl"))) {
      router.push(user ? "/coworking" : "/coworking-login");
    }
  }, [user, role, loading, router]);

  // ── Load employees ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    getDocs(collection(firebaseDb, "cowork_employees"))
      .then((snap) => {
        const list = [];
        snap.forEach((d) => {
          const e = d.data();
          if (e.employeeId && e.employeeId !== employeeId) list.push(e);
        });
        setEmployees(list);
      })
      .catch(() => {});
  }, [user, employeeId]);

  // ── Derived: departments + filtered employees ─────────────────────────────
  const allDepts = [
    ...new Set(employees.map((e) => e.department).filter(Boolean)),
  ].sort();

  const visibleEmployees =
    selectedDepts.length === 0
      ? employees
      : employees.filter((e) => selectedDepts.includes(e.department));

  const toggleDept = (dept) =>
    setSelectedDepts((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept],
    );

  const toggleParticipant = (id) =>
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const selectAllVisible = () => {
    const ids = visibleEmployees.map((e) => e.employeeId);
    setParticipantIds((prev) => [...new Set([...prev, ...ids])]);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.title.trim()) {
      setError("Meeting title is required.");
      return;
    }
    if (!form.dateTime) {
      setError("Date and time is required.");
      return;
    }
    // Participants are optional — a meeting can run purely on the public
    // guest link with zero pre-selected employees.
    setSubmitting(true);
    try {
      await scheduleMeet({
        title: form.title.trim(),
        description: form.description.trim(),
        dateTime: form.dateTime,
        googleMeetLink: form.googleMeetLink.trim() || null,
        participants: participantIds,
      });
      router.push("/coworking/schedule-meet");
    } catch (err) {
      setError(err.message || "Failed to schedule meeting.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user || (role !== "ceo" && role !== "tl")) return null;

  const empName = (emp) =>
    emp.role === "tl" && emp.department
      ? `${emp.name} · ${emp.department} TL`
      : emp.role === "tl"
        ? `${emp.name} · TL`
        : emp.name;

  const initials = (name = "") =>
    name
      .trim()
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  // Participants display — selected employee objects
  const selectedEmps = employees.filter((e) =>
    participantIds.includes(e.employeeId),
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .sm-page {
          min-height: 100vh;
          background: #f8f9fa;
          font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding: 0;
        }

        /* ── Top bar ── */
        .sm-topbar {
          background: #fff;
          border-bottom: 1px solid #e8eaed;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 0 24px;
          height: 60px;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .sm-topbar-back {
          width: 36px; height: 36px;
          border-radius: 50%;
          border: none;
          background: transparent;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #5f6368;
          transition: background 0.12s;
        }
        .sm-topbar-back:hover { background: #f1f3f4; }
        .sm-topbar-title {
          font-size: 18px;
          font-weight: 500;
          color: #202124;
          flex: 1;
        }
        .sm-topbar-submit {
          padding: 9px 24px;
          background: #1a73e8;
          color: #fff;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          display: flex; align-items: center; gap: 8px;
          transition: background 0.12s, opacity 0.12s;
        }
        .sm-topbar-submit:hover:not(:disabled) { background: #1557b0; }
        .sm-topbar-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        /* ── Body grid ── */
        .sm-body {
          
          margin: 0 auto;
          padding: 28px 20px 60px;
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 24px;
          align-items: start;
        }

        /* ── Card ── */
        .sm-card {
          background: #fff;
          border-radius: 8px;
          border: 1px solid #e8eaed;
          overflow: hidden;
        }
        .sm-card-head {
          padding: 16px 20px;
          border-bottom: 1px solid #f1f3f4;
          display: flex; align-items: center; gap: 10px;
        }
        .sm-card-icon {
          width: 32px; height: 32px;
          border-radius: 8px;
          background: #e8f0fe;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .sm-card-title { font-size: 14px; font-weight: 600; color: #202124; }
        .sm-card-sub   { font-size: 12px; color: #9aa0a6; margin-top: 2px; }
        .sm-card-body  { padding: 20px; display: flex; flex-direction: column; gap: 18px; }

        /* ── Form fields ── */
        .sm-field       { display: flex; flex-direction: column; gap: 6px; }
        .sm-label       { font-size: 11px; font-weight: 600; color: #5f6368; text-transform: uppercase; letter-spacing: 0.05em; }
        .sm-req         { color: #d93025; }
        .sm-input, .sm-textarea, .sm-select {
          padding: 10px 13px;
          border: 1.5px solid #e8eaed;
          border-radius: 4px;
          font-size: 14px;
          font-family: inherit;
          color: #202124;
          background: #fff;
          width: 100%;
          transition: border-color 0.15s, box-shadow 0.15s;
          outline: none;
        }
        .sm-input:focus, .sm-textarea:focus {
          border-color: #1a73e8;
          box-shadow: 0 0 0 3px rgba(26,115,232,0.12);
        }
        .sm-textarea { resize: vertical; min-height: 80px; line-height: 1.6; }
        .sm-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

        /* ── Error ── */
        .sm-err {
          display: flex; align-items: flex-start; gap: 9px;
          padding: 11px 14px;
          background: #fce8e6;
          border: 1px solid #f5c6c2;
          border-radius: 6px;
          font-size: 13px;
          color: #c5221f;
          line-height: 1.5;
          margin: 0 20px;
        }

        /* ── Department chips ── */
        .sm-dept-section {
          background: #f8f9fa;
          border: 1px solid #e8eaed;
          border-radius: 6px;
          padding: 12px 14px;
        }
        .sm-dept-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 10px;
        }
        .sm-dept-header-label {
          font-size: 11px; font-weight: 600; color: #5f6368;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .sm-dept-clear {
          font-size: 12px; color: #1a73e8; background: none;
          border: none; cursor: pointer; font-family: inherit;
          font-weight: 500; padding: 0; text-decoration: underline;
        }
        .sm-dept-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .sm-dept-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 5px 12px;
          border: 1.5px solid #e8eaed;
          border-radius: 20px;
          font-size: 12px; font-weight: 500;
          cursor: pointer;
          background: #fff;
          color: #3c4043;
          font-family: inherit;
          transition: all 0.12s;
        }
        .sm-dept-chip:hover { border-color: #1a73e8; color: #1a73e8; background: #f0f4ff; }
        .sm-dept-chip.active { background: #1a73e8; color: #fff; border-color: #1a73e8; }
        .sm-dept-count {
          font-size: 10px; font-weight: 700;
          padding: 1px 6px; border-radius: 99px;
          background: rgba(255,255,255,0.25);
          color: inherit;
        }
        .sm-dept-chip:not(.active) .sm-dept-count {
          background: #f1f3f4; color: #80868b;
        }

        /* ── Employee grid ── */
        .sm-emp-grid {
          display: flex; flex-wrap: wrap; gap: 6px;
          max-height: 220px; overflow-y: auto;
          padding: 2px 0;
        }
        .sm-emp-grid::-webkit-scrollbar { width: 4px; }
        .sm-emp-grid::-webkit-scrollbar-thumb { background: #e8eaed; border-radius: 2px; }

        .sm-emp-chip {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 6px 12px;
          border: 1.5px solid #e8eaed;
          border-radius: 20px;
          font-size: 13px;
          cursor: pointer; font-family: inherit;
          background: #fff; color: #3c4043;
          font-weight: 400;
          transition: all 0.12s;
        }
        .sm-emp-chip:hover { border-color: #1a73e8; }
        .sm-emp-chip.sel {
          background: #e8f0fe; color: #1a73e8;
          border-color: #1a73e8; font-weight: 500;
        }
        .sm-emp-avatar {
          width: 24px; height: 24px; border-radius: 50%;
          background: #e8eaed; color: #5f6368;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 700; flex-shrink: 0;
        }
        .sm-emp-chip.sel .sm-emp-avatar {
          background: #1a73e8; color: #fff;
        }
        .sm-tl-tag {
          font-size: 9px; font-weight: 700;
          background: #1e8e3e; color: #fff;
          border-radius: 3px; padding: 1px 5px;
          flex-shrink: 0; letter-spacing: 0.03em;
        }

        /* ── Select all bar ── */
        .sm-select-bar {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 8px;
        }
        .sm-select-bar-info { font-size: 12px; color: #5f6368; }
        .sm-select-all-btn {
          font-size: 12px; color: #1a73e8; background: none;
          border: none; cursor: pointer; font-family: inherit;
          font-weight: 500; padding: 0; text-decoration: none;
        }
        .sm-select-all-btn:hover { text-decoration: underline; }

        /* ── Participants preview panel ── */
        .sm-preview-empty {
          padding: 32px 20px;
          text-align: center;
          color: #9aa0a6;
        }
        .sm-preview-empty-icon {
          width: 48px; height: 48px; border-radius: 50%;
          background: #f1f3f4;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 12px;
        }
        .sm-participant-row {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 20px;
          border-bottom: 1px solid #f1f3f4;
          transition: background 0.08s;
        }
        .sm-participant-row:last-child { border-bottom: none; }
        .sm-participant-row:hover { background: #f8f9fa; }
        .sm-p-avatar {
          width: 34px; height: 34px; border-radius: 50%;
          background: #1a73e8; color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700; flex-shrink: 0;
        }
        .sm-p-name  { font-size: 13px; font-weight: 500; color: #202124; }
        .sm-p-dept  { font-size: 11px; color: #9aa0a6; margin-top: 1px; }
        .sm-p-remove {
          margin-left: auto;
          width: 28px; height: 28px; border-radius: 50%;
          border: none; background: transparent; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #9aa0a6; transition: all 0.12s; flex-shrink: 0;
        }
        .sm-p-remove:hover { background: #fce8e6; color: #d93025; }

        /* ── Summary card ── */
        .sm-summary {
          background: #f8f9fa;
          border: 1px solid #e8eaed;
          border-radius: 8px;
          padding: 14px 16px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .sm-summary-row {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: #5f6368;
        }
        .sm-summary-row strong { color: #202124; font-weight: 500; }

        /* ── Footer submit (mobile) ── */
        .sm-mobile-submit {
          display: none;
          position: fixed; bottom: 0; left: 0; right: 0;
          background: #fff; border-top: 1px solid #e8eaed;
          padding: 12px 20px;
          z-index: 10;
        }
        .sm-mobile-submit button {
          width: 100%; padding: 13px;
          background: #1a73e8; color: #fff;
          border: none; border-radius: 4px;
          font-size: 15px; font-weight: 500;
          cursor: pointer; font-family: inherit;
        }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .sm-topbar { padding: 0 16px; }
          .sm-topbar-submit { display: none; }
          .sm-body {
            grid-template-columns: 1fr;
            padding: 16px 12px 80px;
            gap: 16px;
          }
          .sm-row-2 { grid-template-columns: 1fr; }
          .sm-mobile-submit { display: block; }
          .sm-emp-grid { max-height: 180px; }
        }

        @media (max-width: 480px) {
          .sm-topbar-title { font-size: 15px; }
          .sm-card-body { padding: 14px; gap: 14px; }
          .sm-dept-section { padding: 10px 12px; }
        }
      `}</style>

      <div className="sm-page">
        {/* ── Top bar ── */}
        <div className="sm-topbar">
          <button
            className="sm-topbar-back"
            onClick={() => router.push("/coworking/schedule-meet")}
            title="Back"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <span className="sm-topbar-title">New Meeting</span>
          <button
            className="sm-topbar-submit"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  style={{ animation: "sm-spin 1s linear infinite" }}
                >
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                Scheduling…
              </>
            ) : (
              "Schedule Meeting"
            )}
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="sm-body">
            {/* ── LEFT: Meeting details + Participants ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Error */}
              {error && (
                <div className="sm-err">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0, marginTop: 1 }}
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </div>
              )}

              {/* Meeting details card */}
              <div className="sm-card">
                <div className="sm-card-head">
                  <div className="sm-card-icon">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#1a73e8"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="23 7 16 12 23 17 23 7" />
                      <rect x="1" y="5" width="15" height="14" rx="2" />
                    </svg>
                  </div>
                  <div>
                    <div className="sm-card-title">Meeting Details</div>
                    <div className="sm-card-sub">
                      Basic information about the meeting
                    </div>
                  </div>
                </div>
                <div className="sm-card-body">
                  <div className="sm-field">
                    <label className="sm-label">
                      Title <span className="sm-req">*</span>
                    </label>
                    <input
                      className="sm-input"
                      value={form.title}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, title: e.target.value }))
                      }
                      placeholder="e.g. Weekly Team Standup"
                      autoFocus
                    />
                  </div>

                  <div className="sm-field">
                    <label className="sm-label">Description</label>
                    <textarea
                      className="sm-textarea"
                      value={form.description}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, description: e.target.value }))
                      }
                      placeholder="Agenda, topics to discuss, or any notes for participants…"
                    />
                  </div>

                  <div className="sm-row-2">
                    <div className="sm-field">
                      <label className="sm-label">
                        Date & Time <span className="sm-req">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        className="sm-input"
                        value={form.dateTime}
                        min={(() => {
                          const now = new Date();
                          const ist = new Date(
                            now.getTime() + 5.5 * 60 * 60 * 1000,
                          );
                          return ist.toISOString().slice(0, 16);
                        })()}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, dateTime: e.target.value }))
                        }
                      />
                    </div>
                    <div className="sm-field">
                      <label className="sm-label">
                        Meeting Link{" "}
                        <span
                          style={{
                            fontWeight: 400,
                            textTransform: "none",
                            fontSize: 11,
                            color: "#9aa0a6",
                            marginLeft: 4,
                          }}
                        >
                          (optional)
                        </span>
                      </label>
                      <input
                        className="sm-input"
                        value={form.googleMeetLink}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            googleMeetLink: e.target.value,
                          }))
                        }
                        placeholder="https://meet.google.com/..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Participants card */}
              <div className="sm-card">
                <div className="sm-card-head">
                  <div
                    className="sm-card-icon"
                    style={{ background: "#e6f4ea" }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#1e8e3e"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 00-3-3.87" />
                      <path d="M16 3.13a4 4 0 010 7.75" />
                    </svg>
                  </div>
                  <div>
                    <div className="sm-card-title">
                      Participants
                      {participantIds.length > 0 && (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            background: "#e8f0fe",
                            color: "#1a73e8",
                            borderRadius: 99,
                            padding: "2px 8px",
                            marginLeft: 8,
                          }}
                        >
                          {participantIds.length} selected
                        </span>
                      )}
                    </div>
                    <div className="sm-card-sub">Choose who to invite</div>
                  </div>
                </div>

                <div className="sm-card-body">
                  {/* Department filter */}
                  {allDepts.length > 0 && (
                    <div className="sm-dept-section">
                      <div className="sm-dept-header">
                        <span className="sm-dept-header-label">
                          Filter by department
                        </span>
                        {selectedDepts.length > 0 && (
                          <button
                            type="button"
                            className="sm-dept-clear"
                            onClick={() => setSelectedDepts([])}
                          >
                            Clear filter
                          </button>
                        )}
                      </div>
                      <div className="sm-dept-chips">
                        {allDepts.map((dept) => {
                          const active = selectedDepts.includes(dept);
                          const count = employees.filter(
                            (e) => e.department === dept,
                          ).length;
                          return (
                            <button
                              key={dept}
                              type="button"
                              className={`sm-dept-chip${active ? " active" : ""}`}
                              onClick={() => toggleDept(dept)}
                            >
                              {dept}
                              <span className="sm-dept-count">{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Select all / count */}
                  <div className="sm-select-bar">
                    <span className="sm-select-bar-info">
                      {selectedDepts.length > 0
                        ? `Showing ${visibleEmployees.length} employee${visibleEmployees.length !== 1 ? "s" : ""} from ${selectedDepts.length} department${selectedDepts.length !== 1 ? "s" : ""}`
                        : `${employees.length} employees`}
                    </span>
                    {visibleEmployees.length > 0 && (
                      <button
                        type="button"
                        className="sm-select-all-btn"
                        onClick={selectAllVisible}
                      >
                        Select all
                      </button>
                    )}
                  </div>

                  {/* Employee chips */}
                  <div className="sm-emp-grid">
                    {employees.length === 0 ? (
                      <span style={{ fontSize: 13, color: "#9aa0a6" }}>
                        Loading employees…
                      </span>
                    ) : visibleEmployees.length === 0 ? (
                      <span style={{ fontSize: 13, color: "#9aa0a6" }}>
                        No employees in selected department(s).
                      </span>
                    ) : (
                      visibleEmployees.map((emp) => {
                        const sel = participantIds.includes(emp.employeeId);
                        const isTL = emp.role === "tl";
                        return (
                          <button
                            key={emp.employeeId}
                            type="button"
                            className={`sm-emp-chip${sel ? " sel" : ""}`}
                            onClick={() => toggleParticipant(emp.employeeId)}
                          >
                            <span
                              className="sm-emp-avatar"
                              style={{ overflow: "hidden", padding: 0 }}
                            >
                              {emp.profilePicUrl ? (
                                <img
                                  src={emp.profilePicUrl}
                                  alt={emp.name}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    borderRadius: "50%",
                                  }}
                                />
                              ) : (
                                initials(emp.name)
                              )}
                            </span>
                            <span
                              style={{
                                maxWidth: 130,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {emp.name}
                            </span>
                            {isTL && <span className="sm-tl-tag">TL</span>}
                            {sel && (
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                                style={{ flexShrink: 0 }}
                              >
                                <path
                                  d="M2 6l3 3 5-5"
                                  stroke="#1a73e8"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── RIGHT: Participants preview + Summary ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Participants list */}
              <div className="sm-card">
                <div className="sm-card-head">
                  <div>
                    <div className="sm-card-title">Invited Participants</div>
                    <div className="sm-card-sub">
                      {participantIds.length === 0
                        ? "No one selected yet"
                        : `${participantIds.length} invited`}
                    </div>
                  </div>
                  {participantIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setParticipantIds([])}
                      style={{
                        marginLeft: "auto",
                        fontSize: 12,
                        color: "#d93025",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontWeight: 500,
                      }}
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {participantIds.length === 0 ? (
                  <div className="sm-preview-empty">
                    <div className="sm-preview-empty-icon">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#bdc1c6"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 00-3-3.87" />
                        <path d="M16 3.13a4 4 0 010 7.75" />
                      </svg>
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "#80868b",
                        marginBottom: 4,
                      }}
                    >
                      No participants yet
                    </div>
                    <div style={{ fontSize: 12, color: "#bdc1c6" }}>
                      Select employees from the left panel
                    </div>
                  </div>
                ) : (
                  selectedEmps.map((emp) => (
                    <div key={emp.employeeId} className="sm-participant-row">
                      <div
                        className="sm-p-avatar"
                        style={{ overflow: "hidden", padding: 0 }}
                      >
                        {emp.profilePicUrl ? (
                          <img
                            src={emp.profilePicUrl}
                            alt={emp.name}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              borderRadius: "50%",
                            }}
                          />
                        ) : (
                          initials(emp.name)
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="sm-p-name">{emp.name}</div>
                        <div className="sm-p-dept">
                          {emp.department || ""}
                          {emp.role === "tl"
                            ? emp.department
                              ? " · TL"
                              : "TL"
                            : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="sm-p-remove"
                        onClick={() => toggleParticipant(emp.employeeId)}
                        title="Remove"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Summary */}
              {(form.title || form.dateTime || participantIds.length > 0) && (
                <div className="sm-summary">
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#5f6368",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 4,
                    }}
                  >
                    Summary
                  </div>
                  {form.title && (
                    <div className="sm-summary-row">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#1a73e8"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flexShrink: 0 }}
                      >
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" />
                      </svg>
                      <strong>{form.title}</strong>
                    </div>
                  )}
                  {form.dateTime && (
                    <div className="sm-summary-row">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#5f6368"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flexShrink: 0 }}
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      {new Date(form.dateTime).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                  )}
                  {participantIds.length > 0 && (
                    <div className="sm-summary-row">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#5f6368"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flexShrink: 0 }}
                      >
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                      </svg>
                      {participantIds.length} participant
                      {participantIds.length !== 1 ? "s" : ""} invited
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Mobile sticky submit */}
        <div className="sm-mobile-submit">
          <button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Scheduling…" : "Schedule Meeting"}
          </button>
        </div>

        <style>{`@keyframes sm-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    </>
  );
}
