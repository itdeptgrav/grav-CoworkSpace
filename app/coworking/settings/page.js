"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { changePassword, changeEmail } from "../../../lib/coworkApi";
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
  const [strength, setStrength] = useState(0); // 0-4

  // ── Gmail connect ──
  const [gmailStatus, setGmailStatus] = useState(null); // null | { connected, connectedEmail, connectedAt }
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailMsg, setGmailMsg] = useState(""); // success/error message

  // ── Profile picture ──
  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [picUploading, setPicUploading] = useState(false);
  const [picSuccess, setPicSuccess] = useState(false);
  const [showNewFeaturePopup, setShowNewFeaturePopup] = useState(false);

  // Show new feature popup every time the settings page is visited
  useEffect(() => {
    const t = setTimeout(() => setShowNewFeaturePopup(true), 500);
    return () => clearTimeout(t);
  }, []);

  const dismissPopup = () => {
    setShowNewFeaturePopup(false);
  };

  const fileInputRef = useRef(null);

  // Load Gmail connection status + handle callback redirect params
  useEffect(() => {
    if (!employeeId) return;
    const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    // Check if returning from OAuth callback
    const params = new URLSearchParams(window.location.search);
    const gmailParam = params.get("gmail");
    if (gmailParam === "connected") {
      setGmailMsg(`Gmail connected: ${params.get("email") || ""}`);
      window.history.replaceState({}, "", "/coworking/settings");
    } else if (gmailParam === "error") {
      setGmailMsg(`Error: ${params.get("message") || "Failed to connect Gmail"}`);
      window.history.replaceState({}, "", "/coworking/settings");
    }
    // Fetch current status
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
      // Compress image to 160x160 JPEG thumbnail using canvas (~8KB)
      // Stored as base64 directly in Firestore — no external storage needed
      const base64 = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const SIZE = 160;
          const canvas = document.createElement("canvas");
          canvas.width = SIZE; canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          // Crop to square from center
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, SIZE, SIZE);
          resolve(canvas.toDataURL("image/jpeg", 0.75));
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
      // Save compressed base64 directly to Firestore employee record
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

  // ── Email change state (CEO only) ──
  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");       // optional new password alongside email change
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
      {/* ── New Feature Popup ── */}
      {showNewFeaturePopup && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 99999,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16, backdropFilter: "blur(4px)",
          animation: "nfFadeIn 0.25s ease",
        }}>
          <div style={{
            background: "#fff", borderRadius: 20, padding: "32px 28px 24px",
            width: "min(380px, 95vw)", boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
            position: "relative", animation: "nfSlideUp 0.3s cubic-bezier(0.2,0,0,1)",
          }}>
            {/* Close button */}
            <button onClick={dismissPopup} style={{
              position: "absolute", top: 14, right: 14,
              width: 28, height: 28, borderRadius: "50%", border: "none",
              background: "#F1F5F9", cursor: "pointer", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B",
            }}>✕</button>

            {/* Icon */}
            <div style={{
              width: 64, height: 64, borderRadius: 18, margin: "0 auto 16px",
              background: "linear-gradient(135deg,#3B82F6,#1D4ED8)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>

            {/* NEW label */}
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
                color: "#fff", background: "linear-gradient(135deg,#EF4444,#DC2626)",
                padding: "3px 10px", borderRadius: 99,
              }}>✦ NEW FEATURE</span>
            </div>

            {/* Title */}
            <div style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", textAlign: "center", marginBottom: 10 }}>
              Profile Pictures are here! 🎉
            </div>

            {/* Body */}
            <div style={{ fontSize: 13, color: "#64748B", textAlign: "center", lineHeight: 1.7, marginBottom: 20 }}>
              You can now add your own profile picture to CoWork. Your photo will appear everywhere — in messages, tasks, group chats, meetings and more.
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "#F1F5F9", margin: "0 -28px 20px" }} />

            {/* Steps */}
            {[
              ["📷", "Tap your avatar above to upload a photo"],
              ["✂️", "It's auto-cropped to a perfect circle"],
              ["🌐", "Shows everywhere across CoWork instantly"],
            ].map(([icon, text]) => (
              <div key={text} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                <span style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{text}</span>
              </div>
            ))}

            {/* CTA */}
            <button onClick={dismissPopup} style={{
              width: "100%", marginTop: 16, padding: "12px 0",
              background: "linear-gradient(135deg,#3B82F6,#1D4ED8)",
              color: "#fff", border: "none", borderRadius: 12,
              fontSize: 14, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 4px 16px rgba(59,130,246,0.4)",
            }}>Got it, let's set up my photo!</button>
          </div>
        </div>
      )}
      <style>{`
        @keyframes nfFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes nfSlideUp { from{opacity:0;transform:translateY(24px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
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

              {/* ── WhatsApp-style profile picture section ── */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0 24px", borderBottom: "1px solid #F1F5F9", marginBottom: 16 }}>

                {/* Big circular avatar with hover overlay */}
                <div
                  onClick={() => !picUploading && fileInputRef.current?.click()}
                  style={{ position: "relative", cursor: picUploading ? "not-allowed" : "pointer", marginBottom: 12 }}
                  title="Change profile picture"
                >
                  {/* Photo or initials */}
                  {profilePicUrl ? (
                    <img src={profilePicUrl} alt={employeeName}
                      style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", display: "block", border: "3px solid #E2E8F0" }} />
                  ) : (
                    <div style={{
                      width: 96, height: 96, borderRadius: "50%",
                      background: "linear-gradient(135deg, #3B82F6, #1D4ED8)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 32, fontWeight: 700, color: "#fff",
                      border: "3px solid #E2E8F0",
                    }}>
                      {(employeeName || "?").trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  {/* WhatsApp-style dark overlay on hover with camera icon */}
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: "50%",
                    background: "rgba(0,0,0,0.45)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                    opacity: picUploading ? 1 : 0,
                    transition: "opacity 0.2s",
                    border: "3px solid transparent",
                  }}
                    className="pic-overlay"
                  >
                    {picUploading ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                    ) : (
                      <>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
                        </svg>
                        <span style={{ fontSize: 9, color: "#fff", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                          {profilePicUrl ? "CHANGE" : "ADD"}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Green + badge when no pic yet */}
                  {!profilePicUrl && !picUploading && (
                    <div style={{
                      position: "absolute", bottom: 2, right: 2,
                      width: 24, height: 24, borderRadius: "50%",
                      background: "#22C55E", border: "2px solid #fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    </div>
                  )}

                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePicUpload} style={{ display: "none" }} />
                </div>

                {/* Name + role */}
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>{employeeName}</div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 20,
                  letterSpacing: "0.03em", background: roleColor.bg, color: roleColor.color, border: `1px solid ${roleColor.border}`,
                }}>
                  {roleLabel}
                </span>

                {/* Hint / success */}
                {picSuccess ? (
                  <div style={{ fontSize: 11, color: "#16A34A", fontWeight: 600, marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    Profile picture updated!
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
                    {picUploading ? "Uploading…" : "Tap photo to change"}
                  </div>
                )}
              </div>

              <style>{`
                div:hover > .pic-overlay { opacity: 1 !important; }
              `}</style>

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

          {/* ── CEO ONLY: CHANGE EMAIL (+ optional password) CARD ── */}
          {role === "ceo" && (
            <div className="stg-card stg-col-full" style={{ maxWidth: 480 }}>
              <div className="stg-card-head">
                <div className="stg-card-icon" style={{ background: "#FAF5FF" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                    {emailError}
                  </div>
                )}
                {emailSuccess && (
                  <div className="stg-alert stg-alert-ok">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
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
                        style={{ paddingRight: 14 }}
                        required
                      />
                    </div>
                  </div>

                  <div className="stg-field">
                    <label className="stg-label">
                      New Password <span style={{ color: "#CBD5E1", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional — leave blank to keep current)</span>
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

                  <div style={{ background: "#FAF5FF", border: "1px solid #E9D5FF", borderRadius: 8, padding: "10px 13px", marginBottom: 4 }}>
                    <p style={{ fontSize: 12, color: "#6D28D9", margin: 0, lineHeight: 1.55 }}>
                      <strong>All your data stays intact</strong> — tasks, messages, meetings and history remain unchanged. Only your login email (and optionally password) will be updated.
                    </p>
                  </div>

                  <div className="stg-submit-row">
                    <button type="submit" disabled={emailBusy || !newEmail.trim()} className="stg-submit" style={{ background: "#7C3AED" }}>
                      {emailBusy ? (
                        <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "stg-spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Saving…</>
                      ) : (
                        <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg> Update Email</>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ── CONNECT GMAIL CARD ── */}
          <div className="stg-card" style={{ maxWidth: 480 }}>
            <div className="stg-card-head">
              <div className="stg-card-icon" style={{ background: "#FEF2F2" }}>
                {/* Gmail G icon */}
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              </div>
              <div>
                <p className="stg-card-title">Connect Gmail</p>
                <p className="stg-card-sub">Link your personal Gmail to view it in the Mail section</p>
              </div>
            </div>
            <div className="stg-card-body">
              {gmailMsg && (
                <div className={`stg-alert ${gmailMsg.startsWith("Error") ? "stg-alert-err" : "stg-alert-ok"}`}
                  style={{ marginBottom: 12 }}>
                  {gmailMsg}
                </div>
              )}
              {gmailStatus?.connected ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, marginBottom: 14 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#15803D", margin: 0 }}>Gmail Connected</p>
                      <p style={{ fontSize: 12, color: "#16A34A", margin: 0 }}>{gmailStatus.connectedEmail}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: "#64748B", marginBottom: 14, lineHeight: 1.5 }}>
                    Your Gmail inbox is now accessible from the <strong>Mail → My Gmail</strong> section.
                  </p>
                  <button onClick={handleDisconnectGmail} disabled={gmailLoading}
                    className="stg-submit" style={{ background: "#DC2626", fontSize: 13 }}>
                    {gmailLoading ? "Disconnecting…" : "Disconnect Gmail"}
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: "#475569", marginBottom: 16, lineHeight: 1.6 }}>
                    Connect your personal Google account to see your Gmail inbox inside CoWork.
                    Works with any Gmail address — <code style={{ background: "#F1F5F9", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>@gmail.com</code> or{" "}
                    <code style={{ background: "#F1F5F9", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>@yourdomain.com</code>.
                  </p>
                  <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "10px 13px", marginBottom: 16 }}>
                    <p style={{ fontSize: 12, color: "#64748B", margin: 0, lineHeight: 1.55 }}>
                      🔒 <strong>Private:</strong> Only you can see your Gmail. No one else in CoWork has access.
                    </p>
                  </div>
                  <button onClick={handleConnectGmail} disabled={gmailLoading}
                    className="stg-submit" style={{ background: "#EA4335", fontSize: 13 }}>
                    {gmailLoading ? (
                      <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "stg-spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Connecting…</>
                    ) : (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" />
                        </svg>
                        Connect Gmail Account
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      <style>{`@keyframes stg-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}