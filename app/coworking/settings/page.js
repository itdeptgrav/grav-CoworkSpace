"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../components/coworking/layout/CoworkingShell";
import { changePassword } from "../../../lib/coworkApi";

export default function SettingsPage() {
  const { user, role, employeeId, employeeName, passwordChanged, tempPassword, loading } = useCoworkAuth();
  const router = useRouter();
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  useEffect(() => { if (!loading && !user) router.push("/coworking-login"); }, [user, loading]);
  if (loading || !user) return null;

  const handleChange = async (e) => {
    e.preventDefault();
    setError(""); setSuccess(false);
    if (newPw.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPw !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      await changePassword({ newPassword: newPw });
      setSuccess(true);
      setNewPw(""); setConfirm("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <CoworkingShell role={role} employeeName={employeeName} employeeId={employeeId} title="Settings">
      <div className="cw-settings">
        <style>{`
          .cw-settings {
            max-width: 640px;
            font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          }
          .cw-set-banner {
            background: linear-gradient(135deg, #FEF7E0 0%, #FFF8E1 100%);
            border: 1px solid #F9AB00;
            border-radius: 12px;
            padding: 20px 24px;
            margin-bottom: 20px;
            display: flex;
            align-items: flex-start;
            gap: 14px;
          }
          .cw-set-banner-icon {
            width: 40px; height: 40px; border-radius: 10px;
            background: rgba(249,171,0,0.15);
            display: flex; align-items: center; justify-content: center;
            font-size: 18px; flex-shrink: 0;
          }
          .cw-set-banner p { margin: 0; font-size: 13px; color: #7B4F00; line-height: 1.6; }
          .cw-set-banner strong { font-weight: 600; }
          .cw-set-banner code {
            background: rgba(249,171,0,0.12);
            padding: 2px 10px;
            border-radius: 6px;
            font-family: 'IBM Plex Mono', monospace;
            font-weight: 600;
            font-size: 13px;
          }
          .cw-set-card {
            background: #FFFFFF;
            border-radius: 12px;
            padding: 28px;
            border: 1px solid #E8EAED;
            margin-bottom: 16px;
            transition: box-shadow 0.2s;
          }
          .cw-set-card:hover { box-shadow: 0 2px 8px rgba(60,64,67,0.08); }
          .cw-set-card-title {
            margin: 0 0 20px;
            font-size: 18px;
            font-weight: 600;
            color: #202124;
            letter-spacing: -0.01em;
          }
          .cw-set-info-row {
            display: flex;
            gap: 16px;
            padding: 14px 0;
            border-bottom: 1px solid #F1F3F4;
          }
          .cw-set-info-row:last-child { border-bottom: none; }
          .cw-set-info-label {
            width: 140px;
            font-size: 13px;
            color: #5F6368;
            font-weight: 500;
            flex-shrink: 0;
          }
          .cw-set-info-value {
            font-size: 14px;
            color: #202124;
            font-weight: 500;
          }
          .cw-set-desc {
            margin: 0 0 24px;
            font-size: 14px;
            color: #5F6368;
            line-height: 1.6;
          }
          .cw-set-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
          .cw-set-label {
            font-size: 12px;
            font-weight: 600;
            color: #5F6368;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .cw-set-input-wrap { position: relative; }
          .cw-set-input {
            width: 100%;
            padding: 12px 16px;
            border: 1.5px solid #DADCE0;
            border-radius: 8px;
            font-size: 14px;
            color: #202124;
            font-family: inherit;
            outline: none;
            box-sizing: border-box;
            background: #FAFAFA;
            transition: border-color 0.2s, background 0.2s;
          }
          .cw-set-input:focus {
            border-color: #1A73E8;
            background: #FFFFFF;
            box-shadow: 0 0 0 3px rgba(26,115,232,0.1);
          }
          .cw-set-toggle {
            position: absolute;
            right: 14px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            cursor: pointer;
            color: #9AA0A6;
            padding: 4px;
            border-radius: 4px;
            transition: color 0.15s;
          }
          .cw-set-toggle:hover { color: #5F6368; }
          .cw-set-submit {
            padding: 12px 32px;
            background: #1A73E8;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            font-family: inherit;
            transition: all 0.2s;
          }
          .cw-set-submit:hover { background: #1557B0; box-shadow: 0 2px 8px rgba(26,115,232,0.3); }
          .cw-set-submit:disabled { opacity: 0.6; cursor: not-allowed; }
          .cw-set-err {
            background: #FCE8E6;
            border: 1px solid #F5C6C2;
            border-radius: 8px;
            padding: 12px 16px;
            color: #D93025;
            font-size: 13px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .cw-set-ok {
            background: #E6F4EA;
            border: 1px solid #B7E1CD;
            border-radius: 8px;
            padding: 12px 16px;
            color: #1E8E3E;
            font-size: 13px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
        `}</style>

        {/* Password banner for first-time users */}
        {!passwordChanged && tempPassword && (
          <div className="cw-set-banner">
            <div className="cw-set-banner-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F9AB00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: "14px", marginBottom: 6 }}>You're using a temporary password</p>
              <p>Your temporary password is: <code>{tempPassword}</code></p>
              <p style={{ marginTop: 4 }}>Please change it below to secure your account.</p>
            </div>
          </div>
        )}

        {/* Account info */}
        <div className="cw-set-card">
          <h2 className="cw-set-card-title">Account Information</h2>
          <div>
            {[["Name", employeeName], ["Employee ID", employeeId], ["Role", role === "ceo" ? "Administrator" : role === "tl" ? "Team Lead" : "Employee"]].map(([l, v]) => (
              <div key={l} className="cw-set-info-row">
                <span className="cw-set-info-label">{l}</span>
                <span className="cw-set-info-value">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Change password */}
        <div className="cw-set-card">
          <h2 className="cw-set-card-title">Change Password</h2>
          <p className="cw-set-desc">Choose a strong password to keep your account secure. No verification required.</p>

          {error && <div className="cw-set-err"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg> {error}</div>}
          {success && <div className="cw-set-ok"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg> Password changed successfully!</div>}

          <form onSubmit={handleChange}>
            <div className="cw-set-field">
              <label className="cw-set-label">New password</label>
              <div className="cw-set-input-wrap">
                <input type={showPw ? "text" : "password"} className="cw-set-input" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Enter new password (min. 6 chars)" required />
                <button type="button" onClick={() => setShowPw(!showPw)} className="cw-set-toggle">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {showPw ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
                  </svg>
                </button>
              </div>
            </div>
            <div className="cw-set-field">
              <label className="cw-set-label">Confirm new password</label>
              <input type="password" className="cw-set-input" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter new password" required />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button type="submit" disabled={busy} className="cw-set-submit">{busy ? "Saving..." : "Save Password"}</button>
            </div>
          </form>
        </div>
      </div>
    </CoworkingShell>
  );
}