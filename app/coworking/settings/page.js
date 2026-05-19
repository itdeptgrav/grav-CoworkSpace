"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { changePassword, changeEmail, fetchBleachHistory } from "../../../lib/coworkApi";
import { firebaseDb } from "../../../lib/coworkFirebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

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
  const [strength, setStrength] = useState(0);

  // Gmail connect
  const [gmailStatus, setGmailStatus] = useState(null);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailMsg, setGmailMsg] = useState("");

  // SOP Compliance
  const [sopData, setSopData] = useState(null);
  const [sopLoading, setSopLoading] = useState(false);
  const [sopPanelOpen, setSopPanelOpen] = useState(false);

  useEffect(() => {
    if (!employeeId) return;
    setSopLoading(true);
    fetchBleachHistory(employeeId)
      .then(d => setSopData(d))
      .catch(console.error)
      .finally(() => setSopLoading(false));
  }, [employeeId]);

  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [picUploading, setPicUploading] = useState(false);
  const [picSuccess, setPicSuccess] = useState(false);

  const fileInputRef = useRef(null);

  // Load Gmail connection status + handle callback redirect params
  useEffect(() => {
    if (!employeeId) return;
    const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    const params = new URLSearchParams(window.location.search);
    const gmailParam = params.get("gmail");
    if (gmailParam === "connected") {
      setGmailMsg(`Gmail connected: ${params.get("email") || ""}`);
      window.history.replaceState({}, "", "/coworking/settings");
    } else if (gmailParam === "error") {
      setGmailMsg(`Error: ${params.get("message") || "Failed to connect Gmail"}`);
      window.history.replaceState({}, "", "/coworking/settings");
    }
    fetch(`${BASE}/api/google/employee-gmail/status?employeeId=${employeeId}`)
      .then(r => r.json())
      .then(res => { if (res.success) setGmailStatus(res); })
      .catch(() => { });
  }, [employeeId]);

  const handleConnectGmail = async () => {
    if (!employeeId) return;
    setGmailLoading(true);
    try {
      const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${BASE}/api/google/employee-gmail/auth-url?employeeId=${employeeId}`);
      const data = await res.json();
      if (data.success && data.url) window.location.href = data.url;
      else setGmailMsg("Failed to get auth URL");
    } catch (e) { setGmailMsg("Error: " + e.message); }
    finally { setGmailLoading(false); }
  };

  const handleDisconnectGmail = async () => {
    if (!employeeId || !window.confirm("Disconnect Gmail? You can reconnect anytime.")) return;
    setGmailLoading(true);
    try {
      const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      await fetch(`${BASE}/api/google/employee-gmail/disconnect?employeeId=${employeeId}`, { method: "DELETE" });
      setGmailStatus({ connected: false, connectedEmail: null });
      setGmailMsg("Gmail disconnected.");
    } catch (e) { setGmailMsg("Error: " + e.message); }
    finally { setGmailLoading(false); }
  };

  // Load current profile pic from Firestore
  useEffect(() => {
    if (!employeeId) return;
    getDoc(doc(firebaseDb, "cowork_employees", employeeId)).then(snap => {
      if (snap.exists()) setProfilePicUrl(snap.data().profilePicUrl || "");
    }).catch(() => { });
  }, [employeeId]);

  const handlePicUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !employeeId) return;
    if (!file.type.startsWith("image/")) { alert("Please select an image file."); return; }
    if (file.size > 10 * 1024 * 1024) { alert("Image must be under 10MB."); return; }
    setPicUploading(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const SIZE = 160;
          const canvas = document.createElement("canvas");
          canvas.width = SIZE; canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, SIZE, SIZE);
          resolve(canvas.toDataURL("image/jpeg", 0.75));
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
      await updateDoc(doc(firebaseDb, "cowork_employees", employeeId), { profilePicUrl: base64 });
      setProfilePicUrl(base64);
      setPicSuccess(true);
      setTimeout(() => setPicSuccess(false), 3000);
    } catch (err) {
      console.error("Profile pic upload error:", err);
      alert("Upload failed. Please try again.");
    } finally {
      setPicUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Email change state (CEO only)
  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [showEmailPw, setShowEmailPw] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState("");
  const [emailError, setEmailError] = useState("");

  const handleEmailChange = async (e) => {
    e.preventDefault();
    setEmailError(""); setEmailSuccess("");
    if (!newEmail.trim()) { setEmailError("Email is required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) { setEmailError("Enter a valid email address."); return; }
    if (emailPw && emailPw.length < 6) { setEmailError("Password must be at least 6 characters."); return; }
    setEmailBusy(true);
    try {
      const result = await changeEmail({ newEmail: newEmail.trim(), newPassword: emailPw || undefined });
      setEmailSuccess(result.message || "Email updated successfully.");
      setNewEmail(""); setEmailPw("");
    } catch (e) { setEmailError(e.message); }
    finally { setEmailBusy(false); }
  };

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
  const roleColor = role === "ceo"
    ? { bg: "#FEF2F2", color: "#991B1B", border: "#FECDD3" }
    : role === "tl"
      ? { bg: "#EFF6FF", color: "#1E40AF", border: "#BFDBFE" }
      : { bg: "#F0FDF4", color: "#166534", border: "#BBF7D0" };

  const strengthMeta = [
    { label: "Too short", color: "#EF4444" },
    { label: "Weak", color: "#F97316" },
    { label: "Fair", color: "#EAB308" },
    { label: "Good", color: "#22C55E" },
    { label: "Strong", color: "#16A34A" },
  ][strength];

  const EyeIcon = ({ open }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          background: #F5F6F8;
          min-height: 100vh;
          padding: 32px 28px 64px;
        }

        .stg-page-head {
          margin-bottom: 28px;
          padding-bottom: 20px;
          border-bottom: 1px solid #E2E8F0;
        }
        .stg-page-title {
          font-size: 20px;
          font-weight: 600;
          color: #111827;
          letter-spacing: -0.01em;
          margin: 0 0 4px;
        }
        .stg-page-sub {
          font-size: 13px;
          color: #6B7280;
          margin: 0;
        }

        .stg-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          align-items: start;
        }
        .stg-col-full { grid-column: 1 / -1; }
        .stg-col-left { grid-column: 1; }
        .stg-col-right { grid-column: 2; }

        .stg-card {
          background: #ffffff;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
        }
        .stg-card-head {
          padding: 18px 22px;
          border-bottom: 1px solid #F1F5F9;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .stg-card-icon {
          width: 34px;
          height: 34px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: #F3F4F6;
        }
        .stg-card-title {
          font-size: 14px;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }
        .stg-card-sub {
          font-size: 12px;
          color: #9CA3AF;
          margin: 2px 0 0;
        }
        .stg-card-body {
          padding: 20px 22px;
        }

        .stg-info-row {
          display: flex;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid #F9FAFB;
          gap: 12px;
        }
        .stg-info-row:last-child { border-bottom: none; padding-bottom: 0; }
        .stg-info-row:first-child { padding-top: 0; }
        .stg-info-icon {
          width: 30px;
          height: 30px;
          border-radius: 6px;
          background: #F9FAFB;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #6B7280;
        }
        .stg-info-lbl {
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #9CA3AF;
          margin: 0 0 2px;
        }
        .stg-info-val {
          font-size: 13.5px;
          font-weight: 500;
          color: #111827;
          margin: 0;
        }

        /* Temporary password notice */
        .stg-notice {
          background: #FFFBEB;
          border: 1px solid #FDE68A;
          border-radius: 6px;
          padding: 12px 16px;
          display: flex;
          gap: 10px;
          align-items: flex-start;
          margin-bottom: 18px;
        }
        .stg-notice svg { flex-shrink: 0; margin-top: 1px; color: #B45309; }
        .stg-notice p { margin: 0; font-size: 12.5px; color: #92400E; line-height: 1.55; }
        .stg-notice p + p { margin-top: 3px; }
        .stg-notice strong { font-weight: 600; }
        .stg-notice code {
          background: #FEF3C7;
          padding: 1px 6px;
          border-radius: 4px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 600;
        }

        /* Form */
        .stg-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
        .stg-field:last-of-type { margin-bottom: 0; }
        .stg-label {
          font-size: 12px;
          font-weight: 500;
          color: #374151;
        }
        .stg-input-wrap { position: relative; }
        .stg-input {
          width: 100%;
          padding: 9px 40px 9px 12px;
          border: 1px solid #D1D5DB;
          border-radius: 6px;
          font-size: 13.5px;
          color: #111827;
          font-family: inherit;
          outline: none;
          background: #FAFAFA;
          transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .stg-input:focus {
          border-color: #6366F1;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
        }
        .stg-input::placeholder { color: #D1D5DB; }
        .stg-eye {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #9CA3AF; padding: 4px; display: flex; transition: color 0.12s;
        }
        .stg-eye:hover { color: #4B5563; }

        /* Strength bar */
        .stg-strength { display: flex; align-items: center; gap: 8px; margin-top: 5px; }
        .stg-strength-bars { display: flex; gap: 3px; flex: 1; }
        .stg-strength-bar {
          height: 3px; border-radius: 99px; flex: 1;
          background: #E5E7EB; transition: background 0.2s;
        }
        .stg-strength-label { font-size: 11px; font-weight: 500; white-space: nowrap; }

        /* Alerts */
        .stg-alert {
          padding: 10px 13px;
          border-radius: 6px;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
          font-weight: 500;
        }
        .stg-alert-err { background: #FEF2F2; border: 1px solid #FECDD3; color: #B91C1C; }
        .stg-alert-ok  { background: #F0FDF4; border: 1px solid #BBF7D0; color: #15803D; }

        /* Tips box */
        .stg-tips {
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          padding: 10px 13px;
          margin-top: 6px;
        }
        .stg-tips-title {
          font-size: 11px;
          font-weight: 600;
          color: #6B7280;
          margin: 0 0 5px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .stg-tip-item {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 3px;
          font-size: 12px;
          color: #9CA3AF;
        }
        .stg-tip-dot {
          width: 3px; height: 3px;
          border-radius: 50%; background: #D1D5DB; flex-shrink: 0;
        }

        /* Submit row */
        .stg-submit-row {
          display: flex;
          justify-content: flex-end;
          margin-top: 20px;
          padding-top: 18px;
          border-top: 1px solid #F1F5F9;
        }
        .stg-submit {
          padding: 9px 24px;
          background: #4F46E5;
          color: #fff;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s, box-shadow 0.15s;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .stg-submit:hover:not(:disabled) {
          background: #4338CA;
          box-shadow: 0 2px 8px rgba(79,70,229,0.2);
        }
        .stg-submit:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 700px) {
          .stg-page { padding: 20px 16px 48px; }
          .stg-grid { grid-template-columns: 1fr; gap: 14px; }
          .stg-col-full { grid-column: 1; }
          .stg-col-left { grid-column: 1; }
          .stg-col-right { grid-column: 1; }
          .stg-page-title { font-size: 17px; }
        }

        @keyframes stg-spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="stg-page">

        {/* Page header */}
        <div className="stg-page-head">
          <h1 className="stg-page-title">Profile/settings</h1>
          <p className="stg-page-sub">Manage your account and preferences</p>
        </div>

        <div className="stg-grid">

          {/* ── PROFILE CARD ── */}
          <div className="stg-card stg-col-left">
            <div className="stg-card-head">
              <div className="stg-card-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <p className="stg-card-title">Profile</p>
                <p className="stg-card-sub">Your account details</p>
              </div>
            </div>
            <div className="stg-card-body">

              {/* Avatar section */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 0 20px", borderBottom: "1px solid #F1F5F9", marginBottom: 16, background: "linear-gradient(135deg, #F8FAFF 0%, #F1F5F9 100%)", margin: "-20px -22px 16px", padding: "20px 22px 20px" }}>
                <div
                  onClick={() => !picUploading && fileInputRef.current?.click()}
                  style={{ position: "relative", cursor: picUploading ? "not-allowed" : "pointer", flexShrink: 0 }}
                  title="Change profile picture"
                >
                  {profilePicUrl ? (
                    <img
                      src={profilePicUrl}
                      alt={employeeName}
                      style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", display: "block", border: "2px solid #E5E7EB" }}
                    />
                  ) : (
                    <div style={{
                      width: 72, height: 72, borderRadius: "50%",
                      background: "#4F46E5",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 24, fontWeight: 600, color: "#fff",
                      border: "2px solid #E5E7EB",
                    }}>
                      {(employeeName || "?").trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: "50%",
                    background: "rgba(0,0,0,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    opacity: 0, transition: "opacity 0.18s",
                  }} className="pic-overlay">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
                    </svg>
                  </div>

                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePicUpload} style={{ display: "none" }} />
                </div>

                <style>{`.pic-overlay:hover, div:hover > .pic-overlay { opacity: 1 !important; }`}</style>

                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 4 }}>{employeeName}</div>
                  <span style={{
                    fontSize: 11, fontWeight: 500, padding: "2px 9px", borderRadius: 4,
                    background: roleColor.bg, color: roleColor.color, border: `1px solid ${roleColor.border}`,
                  }}>
                    {roleLabel}
                  </span>
                  <div style={{ fontSize: 11, color: picSuccess ? "#16A34A" : "#9CA3AF", marginTop: 6 }}>
                    {picUploading ? "Uploading…" : picSuccess ? "Profile picture updated." : "Click photo to update"}
                  </div>
                </div>
              </div>

              {/* Info rows */}
              {[
                {
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" />
                    </svg>
                  ),
                  label: "Employee ID",
                  value: employeeId,
                  mono: true,
                },
                {
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                    </svg>
                  ),
                  label: "Role",
                  value: roleLabel,
                },
                {
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  ),
                  label: "Account Status",
                  value: passwordChanged !== false ? "Active" : "Pending password change",
                  valueColor: passwordChanged !== false ? "#15803D" : "#B45309",
                },
                {
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                    </svg>
                  ),
                  label: "Email",
                  value: user?.email || "—",
                  mono: false,
                },
              ].map(row => (
                <div className="stg-info-row" key={row.label}>
                  <div className="stg-info-icon">{row.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="stg-info-lbl">{row.label}</p>
                    <p className="stg-info-val" style={{
                      fontFamily: row.mono ? "'IBM Plex Mono', monospace" : "inherit",
                      fontSize: row.mono ? 12.5 : 13.5,
                      color: row.valueColor || "#111827",
                    }}>
                      {row.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── CHANGE PASSWORD CARD ── */}
          <div className="stg-card stg-col-right">
            <div className="stg-card-head">
              <div className="stg-card-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <div>
                <p className="stg-card-title">Change Password</p>
                <p className="stg-card-sub">Update your account password</p>
              </div>
            </div>
            <div className="stg-card-body">

              {/* Temporary password notice */}
              {!passwordChanged && tempPassword && (
                <div className="stg-notice">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div>
                    <p><strong>You are using a temporary password.</strong></p>
                    <p>Temporary password: <code>{tempPassword}</code></p>
                    <p style={{ marginTop: 4, color: "#B45309" }}>Please set a new password to secure your account.</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="stg-alert stg-alert-err">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                  {error}
                </div>
              )}
              {success && (
                <div className="stg-alert stg-alert-ok">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                  Password changed successfully.
                </div>
              )}

              <form onSubmit={handleSubmit}>
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
                  {newPw.length > 0 && (
                    <div className="stg-strength">
                      <div className="stg-strength-bars">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className="stg-strength-bar" style={{ background: i <= strength ? strengthMeta.color : "#E5E7EB" }} />
                        ))}
                      </div>
                      <span className="stg-strength-label" style={{ color: strengthMeta.color }}>{strengthMeta.label}</span>
                    </div>
                  )}
                </div>

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
                        borderColor: confirm && newPw && confirm !== newPw ? "#FCA5A5"
                          : confirm && newPw && confirm === newPw ? "#6EE7B7"
                            : undefined
                      }}
                    />
                    <button type="button" className="stg-eye" onClick={() => setShowConf(p => !p)}>
                      <EyeIcon open={showConf} />
                    </button>
                  </div>
                  {confirm.length > 0 && newPw.length > 0 && (
                    <div style={{
                      fontSize: 11, fontWeight: 500, marginTop: 4,
                      color: confirm === newPw ? "#15803D" : "#B91C1C",
                    }}>
                      {confirm === newPw ? "Passwords match" : "Passwords do not match"}
                    </div>
                  )}
                </div>

                <div className="stg-tips">
                  <p className="stg-tips-title">Password guidelines</p>
                  {["At least 6 characters long", "Mix uppercase and lowercase letters", "Include numbers or symbols"].map(tip => (
                    <div key={tip} className="stg-tip-item">
                      <div className="stg-tip-dot" />
                      {tip}
                    </div>
                  ))}
                </div>

                <div className="stg-submit-row">
                  <button type="submit" disabled={busy} className="stg-submit">
                    {busy ? (
                      <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "stg-spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Saving…</>
                    ) : "Save Password"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ── CEO ONLY: CHANGE EMAIL CARD ── */}
          {role === "ceo" && (
            <div className="stg-card stg-col-full">
              <div className="stg-card-head">
                <div className="stg-card-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <div>
                  <p className="stg-card-title">Change Login Email</p>
                  <p className="stg-card-sub">Update your login email — all data stays intact</p>
                </div>
              </div>
              <div className="stg-card-body">

                {emailError && (
                  <div className="stg-alert stg-alert-err">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                    {emailError}
                  </div>
                )}
                {emailSuccess && (
                  <div className="stg-alert stg-alert-ok">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                    {emailSuccess}
                  </div>
                )}

                <form onSubmit={handleEmailChange}>
                  <div className="stg-field">
                    <label className="stg-label">New Email Address</label>
                    <div className="stg-input-wrap">
                      <input
                        type="email"
                        className="stg-input"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        placeholder="Enter new email address"
                        autoComplete="email"
                        style={{ paddingRight: 12 }}
                        required
                      />
                    </div>
                  </div>

                  <div className="stg-field">
                    <label className="stg-label">
                      New Password{" "}
                      <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(optional)</span>
                    </label>
                    <div className="stg-input-wrap">
                      <input
                        type={showEmailPw ? "text" : "password"}
                        className="stg-input"
                        value={emailPw}
                        onChange={e => setEmailPw(e.target.value)}
                        placeholder="Leave blank to keep current password"
                        autoComplete="new-password"
                      />
                      <button type="button" className="stg-eye" onClick={() => setShowEmailPw(p => !p)}>
                        <EyeIcon open={showEmailPw} />
                      </button>
                    </div>
                  </div>

                  <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: "10px 13px", marginBottom: 4 }}>
                    <p style={{ fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.55 }}>
                      Your tasks, messages, meetings and history will remain unchanged. Only your login credentials will be updated.
                    </p>
                  </div>

                  <div className="stg-submit-row">
                    <button type="submit" disabled={emailBusy || !newEmail.trim()} className="stg-submit">
                      {emailBusy ? (
                        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "stg-spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Saving…</>
                      ) : "Update Email"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ── CONNECT GMAIL CARD ── */}
          <div className="stg-card">
            <div className="stg-card-head">
              <div className="stg-card-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              </div>
              <div>
                <p className="stg-card-title">Connect Gmail</p>
                <p className="stg-card-sub">Link your Gmail to view it in the Mail section</p>
              </div>
            </div>
            <div className="stg-card-body">
              {gmailMsg && (
                <div className={`stg-alert ${gmailMsg.startsWith("Error") ? "stg-alert-err" : "stg-alert-ok"}`} style={{ marginBottom: 12 }}>
                  {gmailMsg}
                </div>
              )}
              {gmailStatus?.connected ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 6, marginBottom: 14 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#15803D", margin: 0 }}>Gmail Connected</p>
                      <p style={{ fontSize: 12, color: "#16A34A", margin: 0 }}>{gmailStatus.connectedEmail}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 14, lineHeight: 1.5 }}>
                    Your inbox is accessible from <strong>Mail → My Gmail</strong>.
                  </p>
                  <button onClick={handleDisconnectGmail} disabled={gmailLoading} className="stg-submit" style={{ background: "#DC2626" }}>
                    {gmailLoading ? "Disconnecting…" : "Disconnect Gmail"}
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: "#4B5563", marginBottom: 14, lineHeight: 1.6 }}>
                    Connect your Google account to view your Gmail inbox inside CoWork. Compatible with{" "}
                    <code style={{ background: "#F3F4F6", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>@gmail.com</code> and custom domains.
                  </p>
                  <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: "10px 13px", marginBottom: 14 }}>
                    <p style={{ fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.55 }}>
                      Your Gmail is private. No other team member has access to your inbox.
                    </p>
                  </div>
                  <button onClick={handleConnectGmail} disabled={gmailLoading} className="stg-submit" style={{ background: "#1A73E8" }}>
                    {gmailLoading ? (
                      <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "stg-spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Connecting…</>
                    ) : "Connect Gmail Account"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── SOP COMPLIANCE CARD ── */}
          <div className="stg-card">
            <div className="stg-card-head">
              <div className="stg-card-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <line x1="9" y1="12" x2="15" y2="12" />
                  <line x1="9" y1="16" x2="13" y2="16" />
                </svg>
              </div>
              <div>
                <p className="stg-card-title">SOP Compliance</p>
                <p className="stg-card-sub">Your point deduction history</p>
              </div>
            </div>
            <div className="stg-card-body">
              {sopLoading ? (
                <div style={{ fontSize: 13, color: "#9CA3AF", padding: "6px 0" }}>Loading…</div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Total Deducted (Net)</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: "#DC2626", lineHeight: 1 }}>
                      {(() => {
                        const deductions = (sopData?.sopPoints || []).reduce((s, y) => s + (y.bleaches || []).filter(b => !b.isCredit && b.recheck?.status !== "confirmed").reduce((bs, b) => bs + Number(b.points), 0), 0);
                        const credits = (sopData?.sopPoints || []).reduce((s, y) => s + (y.bleaches || []).filter(b => b.isCredit).reduce((bs, b) => bs + Number(b.points), 0), 0);
                        return (deductions - credits).toFixed(1);
                      })()} pts
                    </div>
                    <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                      {(sopData?.sopPoints || []).sort((a, b) => b.year - a.year).map(y => (
                        <div key={y.year} style={{ fontSize: 12 }}>
                          <span style={{ color: "#9CA3AF" }}>{y.year}: </span>
                          <span style={{ fontWeight: 600, color: "#DC2626" }}>{(y.totalDeducted || 0).toFixed(1)} pts</span>
                        </div>
                      ))}
                      {(sopData?.sopPoints || []).length === 0 && (
                        <div style={{ fontSize: 12, color: "#15803D", fontWeight: 500 }}>No deductions on record.</div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSopPanelOpen(true)}
                    className="stg-submit"
                    style={{ background: "#DC2626" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#B91C1C"}
                    onMouseLeave={e => e.currentTarget.style.background = "#DC2626"}
                  >
                    View History
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── SOP HISTORY PANEL ── */}
      {sopPanelOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 999 }} onClick={() => setSopPanelOpen(false)} />
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0,
            width: "min(420px, 100vw)",
            background: "#fff",
            borderLeft: "1px solid #E5E7EB",
            boxShadow: "-4px 0 20px rgba(0,0,0,0.1)",
            zIndex: 1000,
            display: "flex", flexDirection: "column",
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          }}>

            {/* Panel header */}
            <div style={{ background: "#DC2626", padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>SOP Deduction History</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>Point deductions on your account</div>
              </div>
              <button onClick={() => setSopPanelOpen(false)} style={{
                width: 28, height: 28, borderRadius: 6, border: "none",
                background: "rgba(255,255,255,0.15)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* Panel body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
              {sopLoading ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
              ) : (sopData?.sopPoints || []).length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>No deductions found</div>
                  <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>Your compliance record is clean.</div>
                </div>
              ) : (
                [...(sopData?.sopPoints || [])].sort((a, b) => b.year - a.year).map(yp => {
                  const allB = [...(yp.bleaches || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
                  const grp = allB.reduce((acc, b) => { const d = b.date || "?"; if (!acc[d]) acc[d] = []; acc[d].push(b); return acc; }, {});
                  const dates = Object.keys(grp).sort((a, b) => b.localeCompare(a));
                  return (
                    <div key={yp.year} style={{ marginBottom: 24 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: "#6B7280",
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        marginBottom: 10, display: "flex", justifyContent: "space-between",
                      }}>
                        <span>{yp.year}</span>
                        <span style={{ color: "#DC2626" }}>{(yp.totalDeducted || 0).toFixed(1)} pts deducted</span>
                      </div>
                      {dates.map(date => (
                        <div key={date} style={{ border: "1px solid #E5E7EB", borderRadius: 8, marginBottom: 10, overflow: "hidden" }}>
                          <div style={{ padding: "8px 14px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center" }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{date}</span>
                            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600 }}>
                              {(() => {
                                const debits = grp[date].filter(b => !b.isCredit && b.recheck?.status !== "confirmed").reduce((s, b) => s + Number(b.points), 0);
                                const credits = grp[date].filter(b => b.isCredit).reduce((s, b) => s + Number(b.points), 0);
                                return <>
                                  {debits > 0 && <span style={{ color: "#DC2626" }}>−{debits.toFixed(1)} pts</span>}
                                  {credits > 0 && <span style={{ color: "#15803D", marginLeft: debits > 0 ? 6 : 0 }}>+{credits.toFixed(1)} pts</span>}
                                </>;
                              })()}
                            </span>
                          </div>
                          {grp[date].map((b, i) => {
                            const rs = b.recheck?.status || "none";
                            const removed = rs === "confirmed";
                            return (
                              <div key={i} style={{
                                padding: "10px 14px",
                                borderBottom: i < grp[date].length - 1 ? "1px solid #F3F4F6" : "none",
                                display: "flex", alignItems: "flex-start", gap: 10,
                                opacity: removed ? 0.5 : 1,
                                background: b.isCredit ? "#F0FDF4" : "#fff",
                              }}>
                                <div style={{ flex: 1 }}>
                                  {b.folderName && b.folderName !== "Uncategorized" && b.folderName !== "Task Event" && (
                                    <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2 }}>{b.folderName}</div>
                                  )}
                                  <div style={{
                                    fontSize: 13, fontWeight: 500,
                                    color: b.isCredit ? "#15803D" : "#111827",
                                    textDecoration: removed ? "line-through" : "none",
                                  }}>{b.sopName}</div>
                                  {b.isCredit && (
                                    <span style={{ display: "inline-block", marginTop: 2, fontSize: 10, fontWeight: 500, color: "#15803D", background: "#DCFCE7", border: "1px solid #BBF7D0", padding: "1px 6px", borderRadius: 4 }}>
                                      Goal Credit
                                    </span>
                                  )}
                                  {b.description && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>{b.description}</div>}
                                  {rs === "pending" && <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 500, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", padding: "1px 6px", borderRadius: 4 }}>Recheck Pending</span>}
                                  {rs === "confirmed" && <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 500, color: "#15803D", background: "#F0FDF4", border: "1px solid #BBF7D0", padding: "1px 6px", borderRadius: 4 }}>Deduction Removed</span>}
                                  {rs === "rejected" && <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 500, color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", padding: "1px 6px", borderRadius: 4 }}>Recheck Denied</span>}
                                </div>
                                <span style={{
                                  fontSize: 12, fontWeight: 600,
                                  color: b.isCredit ? "#15803D" : removed ? "#9CA3AF" : "#DC2626",
                                  background: b.isCredit ? "#DCFCE7" : removed ? "#F3F4F6" : "#FEF2F2",
                                  padding: "2px 8px", borderRadius: 4, flexShrink: 0,
                                  textDecoration: removed ? "line-through" : "none",
                                }}>
                                  {b.isCredit ? "+" : ""}{b.points} pts
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}