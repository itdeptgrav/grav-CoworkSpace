"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { changePassword } from "../../../lib/coworkApi";

export default function SettingsPage() {
  const { user, role, employeeId, employeeName, passwordChanged, tempPassword, loading } = useCoworkAuth();
  const router = useRouter();
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [strength, setStrength] = useState(0); // 0-4

  useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading]);
  if (loading || !user) return null;

  const checkStrength = (pw) => {
    let s = 0;
    if (pw.length >= 6) s++;
    if (pw.length >= 10) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9!@#$%^&*]/.test(pw)) s++;
    return s;
  };

  const handlePwChange = (val) => {
    setNewPw(val);
    setStrength(checkStrength(val));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess(false);
    if (newPw.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPw !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      await changePassword({ newPassword: newPw });
      setSuccess(true);
      setNewPw(""); setConfirm(""); setStrength(0);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const roleLabel = role === "ceo" ? "Administrator" : role === "tl" ? "Team Lead" : "Employee";
  const roleColor = role === "ceo" ? { bg: "#FEF2F2", color: "#991B1B", border: "#FECDD3" }
    : role === "tl" ? { bg: "#EFF6FF", color: "#1E40AF", border: "#BFDBFE" }
      : { bg: "#F0FDF4", color: "#166534", border: "#BBF7D0" };

  const strengthMeta = [
    { label: "Too short", color: "#EF4444" },
    { label: "Weak", color: "#F97316" },
    { label: "Fair", color: "#EAB308" },
    { label: "Good", color: "#22C55E" },
    { label: "Strong", color: "#16A34A" },
  ][strength];

  const EyeIcon = ({ open }) => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {open
        ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
        : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
      }
    </svg>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        .stg-page {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #F8FAFC;
          min-height: 100vh;
          padding: 32px 24px 60px;
        }

        /* Page title area */
        .stg-page-head {
          margin-bottom: 28px;
        }
        .stg-page-title {
          font-size: 22px;
          font-weight: 700;
          color: #0F172A;
          letter-spacing: -0.02em;
          margin: 0 0 4px;
        }
        .stg-page-sub {
          font-size: 13px;
          color: #94A3B8;
          margin: 0;
        }

        /* Layout grid */
        .stg-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          max-width: 900px;
        }
        .stg-col-full { grid-column: 1 / -1; }

        /* Cards */
        .stg-card {
          background: #fff;
          border: 1px solid #E2E8F0;
          border-radius: 14px;
          overflow: hidden;
        }
        .stg-card-head {
          padding: 20px 24px 16px;
          border-bottom: 1px solid #F1F5F9;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .stg-card-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .stg-card-title {
          font-size: 14px;
          font-weight: 700;
          color: #0F172A;
          margin: 0;
        }
        .stg-card-sub {
          font-size: 12px;
          color: #94A3B8;
          margin: 2px 0 0;
        }
        .stg-card-body {
          padding: 20px 24px;
        }

        /* Info rows */
        .stg-info-row {
          display: flex;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid #F8FAFC;
          gap: 12px;
        }
        .stg-info-row:last-child { border-bottom: none; padding-bottom: 0; }
        .stg-info-row:first-child { padding-top: 0; }
        .stg-info-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: #F8FAFC;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #64748B;
        }
        .stg-info-lbl {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #94A3B8;
          margin: 0 0 2px;
        }
        .stg-info-val {
          font-size: 14px;
          font-weight: 500;
          color: #0F172A;
          margin: 0;
        }

        /* Banner */
        .stg-banner {
          background: #FFFBEB;
          border: 1px solid #FDE68A;
          border-radius: 10px;
          padding: 14px 18px;
          display: flex;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 20px;
        }
        .stg-banner-icon {
          width: 34px; height: 34px;
          border-radius: 8px;
          background: #FEF3C7;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; color: #D97706;
        }
        .stg-banner p { margin: 0; font-size: 13px; color: #92400E; line-height: 1.55; }
        .stg-banner p + p { margin-top: 4px; }
        .stg-banner strong { font-weight: 600; }
        .stg-banner code {
          background: #FEF3C7;
          padding: 1px 7px; border-radius: 5px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px; font-weight: 700;
        }

        /* Form fields */
        .stg-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
        .stg-field:last-of-type { margin-bottom: 0; }
        .stg-label {
          font-size: 11px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .stg-input-wrap { position: relative; }
        .stg-input {
          width: 100%;
          padding: 10px 44px 10px 14px;
          border: 1.5px solid #E2E8F0;
          border-radius: 9px;
          font-size: 14px;
          color: #0F172A;
          font-family: inherit;
          outline: none;
          background: #F8FAFC;
          transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .stg-input:focus {
          border-color: #3B82F6;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
        }
        .stg-input::placeholder { color: #CBD5E1; }
        .stg-eye {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #94A3B8; padding: 4px; display: flex; transition: color 0.12s;
        }
        .stg-eye:hover { color: #475569; }

        /* Strength bar */
        .stg-strength {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
        }
        .stg-strength-bars {
          display: flex;
          gap: 3px;
          flex: 1;
        }
        .stg-strength-bar {
          height: 3px;
          border-radius: 99px;
          flex: 1;
          background: #E2E8F0;
          transition: background 0.2s;
        }
        .stg-strength-label {
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }

        /* Alerts */
        .stg-alert {
          padding: 11px 14px;
          border-radius: 9px;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 18px;
          font-weight: 500;
        }
        .stg-alert-err { background:#FEF2F2; border:1px solid #FECDD3; color:#B91C1C; }
        .stg-alert-ok  { background:#F0FDF4; border:1px solid #BBF7D0; color:#15803D; }

        /* Submit */
        .stg-submit-row {
          display: flex;
          justify-content: flex-end;
          margin-top: 22px;
          padding-top: 20px;
          border-top: 1px solid #F1F5F9;
        }
        .stg-submit {
          padding: 10px 28px;
          background: #1D4ED8;
          color: #fff;
          border: none;
          border-radius: 9px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .stg-submit:hover:not(:disabled) { background: #1E40AF; box-shadow: 0 4px 14px rgba(29,78,216,0.25); }
        .stg-submit:disabled { opacity: 0.55; cursor: not-allowed; }

        /* Divider section */
        .stg-section-divider {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #CBD5E1;
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 6px 0 14px;
        }
        .stg-section-divider::before, .stg-section-divider::after {
          content: ""; flex: 1; height: 1px; background: #F1F5F9;
        }

        /* Responsive */
        @media (max-width: 700px) {
          .stg-page { padding: 20px 16px 50px; }
          .stg-grid { grid-template-columns: 1fr; gap: 14px; }
          .stg-col-full { grid-column: 1; }
          .stg-page-title { font-size: 18px; }
        }
      `}</style>

      <div className="stg-page">

        {/* Page header */}
        <div className="stg-page-head">
          <h1 className="stg-page-title">Settings</h1>
          <p className="stg-page-sub">Manage your account and preferences</p>
        </div>

        <div className="stg-grid">

          {/* ── ACCOUNT PROFILE CARD ── */}
          <div className="stg-card">
            <div className="stg-card-head">
              <div className="stg-card-icon" style={{ background: "#EFF6FF" }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <p className="stg-card-title">Profile</p>
                <p className="stg-card-sub">Your account details</p>
              </div>
            </div>
            <div className="stg-card-body">

              {/* Avatar + name header */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "4px 0 18px", borderBottom: "1px solid #F1F5F9", marginBottom: 16 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                  background: "linear-gradient(135deg,#3B82F6,#1D4ED8)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, fontWeight: 700, color: "#fff",
                }}>
                  {(employeeName || "?").trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>{employeeName}</div>
                  <span style={{
                    display: "inline-block", marginTop: 4,
                    fontSize: 11, fontWeight: 600, padding: "2px 9px",
                    borderRadius: 20, letterSpacing: "0.03em",
                    background: roleColor.bg, color: roleColor.color, border: `1px solid ${roleColor.border}`,
                  }}>
                    {roleLabel}
                  </span>
                </div>
              </div>

              {/* Info rows */}
              {[
                {
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" /></svg>,
                  label: "Employee ID",
                  value: employeeId,
                  mono: true,
                },
                {
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
                  label: "Role",
                  value: roleLabel,
                },
                {
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
                  label: "Account Status",
                  value: passwordChanged !== false ? "Active" : "Pending password change",
                  valueColor: passwordChanged !== false ? "#15803D" : "#D97706",
                },
              ].map(row => (
                <div className="stg-info-row" key={row.label}>
                  <div className="stg-info-icon">{row.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="stg-info-lbl">{row.label}</p>
                    <p className="stg-info-val" style={{
                      fontFamily: row.mono ? "'IBM Plex Mono', monospace" : "inherit",
                      fontSize: row.mono ? 13 : 14,
                      color: row.valueColor || "#0F172A",
                    }}>
                      {row.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── CHANGE PASSWORD CARD ── */}
          <div className="stg-card">
            <div className="stg-card-head">
              <div className="stg-card-icon" style={{ background: "#F0FDF4" }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <div>
                <p className="stg-card-title">Change Password</p>
                <p className="stg-card-sub">Update your account password</p>
              </div>
            </div>
            <div className="stg-card-body">

              {/* Temp password banner */}
              {!passwordChanged && tempPassword && (
                <div className="stg-banner">
                  <div className="stg-banner-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <p><strong>You are using a temporary password.</strong></p>
                    <p>Temporary password: <code>{tempPassword}</code></p>
                    <p style={{ marginTop: 6, color: "#B45309" }}>Please set a new password to secure your account.</p>
                  </div>
                </div>
              )}

              {/* Alerts */}
              {error && (
                <div className="stg-alert stg-alert-err">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                  {error}
                </div>
              )}
              {success && (
                <div className="stg-alert stg-alert-ok">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                  Password changed successfully!
                </div>
              )}

              <form onSubmit={handleSubmit}>
                {/* New password */}
                <div className="stg-field">
                  <label className="stg-label">New Password</label>
                  <div className="stg-input-wrap">
                    <input
                      type={showNew ? "text" : "password"}
                      className="stg-input"
                      value={newPw}
                      onChange={e => handlePwChange(e.target.value)}
                      placeholder="Minimum 6 characters"
                      autoComplete="new-password"
                      required
                    />
                    <button type="button" className="stg-eye" onClick={() => setShowNew(p => !p)}>
                      <EyeIcon open={showNew} />
                    </button>
                  </div>
                  {/* Strength indicator */}
                  {newPw.length > 0 && (
                    <div className="stg-strength">
                      <div className="stg-strength-bars">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className="stg-strength-bar" style={{
                            background: i <= strength ? strengthMeta.color : "#E2E8F0"
                          }} />
                        ))}
                      </div>
                      <span className="stg-strength-label" style={{ color: strengthMeta.color }}>
                        {strengthMeta.label}
                      </span>
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div className="stg-field">
                  <label className="stg-label">Confirm Password</label>
                  <div className="stg-input-wrap">
                    <input
                      type={showConf ? "text" : "password"}
                      className="stg-input"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Re-enter new password"
                      autoComplete="new-password"
                      required
                      style={{
                        borderColor: confirm && newPw && confirm !== newPw ? "#FECDD3"
                          : confirm && newPw && confirm === newPw ? "#BBF7D0"
                            : undefined
                      }}
                    />
                    <button type="button" className="stg-eye" onClick={() => setShowConf(p => !p)}>
                      <EyeIcon open={showConf} />
                    </button>
                  </div>
                  {/* Match indicator */}
                  {confirm.length > 0 && newPw.length > 0 && (
                    <div style={{
                      fontSize: 11, fontWeight: 600, marginTop: 4,
                      color: confirm === newPw ? "#15803D" : "#B91C1C",
                      display: "flex", alignItems: "center", gap: 4
                    }}>
                      {confirm === newPw ? (
                        <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg> Passwords match</>
                      ) : (
                        <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg> Passwords do not match</>
                      )}
                    </div>
                  )}
                </div>

                {/* Tips */}
                <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 13px", marginTop: 6 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#64748B", margin: "0 0 5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Password tips
                  </p>
                  {[
                    "At least 6 characters long",
                    "Mix uppercase and lowercase letters",
                    "Include numbers or symbols",
                  ].map(tip => (
                    <div key={tip} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3, fontSize: 12, color: "#94A3B8" }}>
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#CBD5E1", flexShrink: 0 }} />
                      {tip}
                    </div>
                  ))}
                </div>

                <div className="stg-submit-row">
                  <button type="submit" disabled={busy} className="stg-submit">
                    {busy ? (
                      <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "stg-spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Saving…</>
                    ) : (
                      <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg> Save Password</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

        </div>
      </div>

      <style>{`@keyframes stg-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}