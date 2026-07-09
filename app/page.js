"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { coworkSignIn, onCoworkAuthChange } from "../lib/coworkAuth";

export default function CoworkingLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [emailFilled, setEmailFilled] = useState(false);
  const [passwordFilled, setPasswordFilled] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [logoutToast, setLogoutToast] = useState(false);

  // ── Auto-redirect if already logged in ──────────────────────────────────
  useEffect(() => {
    const unsub = onCoworkAuthChange((u) => {
      if (u) {
        router.replace("/coworking");
      } else {
        setAuthChecking(false);
      }
    });
    return () => unsub();
  }, [router]);

  // ── Show logout success toast if came from logout ──────────────────────
  useEffect(() => {
    if (sessionStorage.getItem("cowork_logout_toast")) {
      sessionStorage.removeItem("cowork_logout_toast");
      setLogoutToast(true);
      setTimeout(() => setLogoutToast(false), 3500);
    }
  }, []);
  

  // Permanent fix for autofill overlap
  useEffect(() => {
    const checkAutofill = () => {
      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');
      if (emailInput && emailInput.value) { setEmailFilled(true); setEmail(emailInput.value); }
      if (passwordInput && passwordInput.value) { setPasswordFilled(true); setPassword(passwordInput.value); }
    };
    checkAutofill();
    setTimeout(checkAutofill, 100);
    setTimeout(checkAutofill, 500);
    document.addEventListener('animationstart', checkAutofill);
    return () => document.removeEventListener('animationstart', checkAutofill);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { role, employee } = await coworkSignIn(email, password);

      if (!role || role === "none") {
        setError("No workspace access assigned. Contact your administrator.");
        return;
      }

      // Store flag so CoworkingShell shows login success toast
      sessionStorage.setItem("cowork_login_toast", employee?.name || "");
      router.push("/coworking");

    } catch (err) {
      const code = err.code || "";
      let msg;

      if (code === "cowork/employee-not-found") {
        msg = "Account not found in workspace. Your account may have been removed. Contact your administrator.";
      } else if (code === "cowork/account-inactive") {
        msg = "Your account has been deactivated. Contact your administrator.";
      } else if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/invalid-email") {
        msg = "Incorrect email or password. Please try again.";
      } else if (code === "auth/user-not-found") {
        msg = "No account found with this email. Contact your administrator.";
      } else if (code === "auth/user-disabled") {
        msg = "Your account has been disabled. Contact your administrator.";
      } else if (code === "auth/too-many-requests") {
        msg = "Too many failed attempts. Please wait a few minutes and try again.";
      } else if (code === "auth/network-request-failed") {
        msg = "Network error. Check your connection and try again.";
      } else {
        msg = err.message?.replace("Firebase: ", "").replace(/ \(auth\/.*\)\.?$/, "") || "Login failed. Please try again.";
      }

      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Show blank while checking auth (prevents flash of login form)
  if (authChecking) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#fff" }}>
      <div style={{ width: 36, height: 36, border: "3px solid #E5E7EB", borderTop: "3px solid #2563EB", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-white">

      {/* ── Logout success toast ── */}
      {logoutToast && (
        <div style={{
          position: "fixed", top: 20, right: 24, zIndex: 9999,
          background: "#1E293B", color: "#fff",
          padding: "12px 18px", borderRadius: 14,
          fontSize: 13, fontWeight: 600,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          display: "flex", alignItems: "center", gap: 10,
          animation: "slideInRight 0.3s ease-out",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          <span style={{ fontSize: 18 }}>👋</span>
          <div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 1 }}>See you soon!</div>
            <div>Logged out successfully</div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      {/* Left Panel - Hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 bg-gray-50 items-center justify-center p-12">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-16">
            <Image src="/grav-image-logo.svg" alt="CoWork Space" width={32} height={32} className="w-8 h-8" />
            <span className="text-2xl font-semibold text-gray-900">CoWork Space</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-5">
            A smarter way<br />to work together.
          </h1>
          <p className="text-gray-600 mb-12 leading-relaxed">
            Real-time messaging, task management, meetings and team collaboration — all in one place.
          </p>
          <div className="space-y-4">
            {[
              ["💬", "Instant group & direct messaging"],
              ["📋", "Task tracking & progress updates"],
              ["📅", "Meeting scheduling with Google Meet"],
              ["🔔", "Real-time notifications via Socket.io"],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-center gap-3">
                <span className="text-xl w-8">{icon}</span>
                <span className="text-gray-700">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Full width on mobile */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="flex justify-center mb-8 lg:hidden">
            <Image src="/grav-image-logo.svg" alt="CoWork Space" width={80} height={80} className="w-25 h-25" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-8 lg:p-10">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-gray-900">Sign in</h2>
              <p className="text-gray-600 mt-2">to your CoWork account</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 flex items-start gap-2 text-red-600 text-sm">
                <span className="mt-0.5 flex-shrink-0">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email Field */}
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailFilled(!!e.target.value); }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 peer"
                  placeholder=" "
                  required
                  autoComplete="email"
                />
                <label htmlFor="email"
                  className={`absolute left-4 bg-white px-1 transition-all duration-200 pointer-events-none
                    ${email || emailFilled ? '-top-2.5 text-xs text-blue-600' : 'top-3 text-base text-gray-500'}
                    peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-blue-600`}>
                  Email
                </label>
              </div>

              {/* Password Field */}
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordFilled(!!e.target.value); }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 peer pr-12"
                  placeholder=" "
                  required
                  autoComplete="current-password"
                />
                <label htmlFor="password"
                  className={`absolute left-4 bg-white px-1 transition-all duration-200 pointer-events-none
                    ${password || passwordFilled ? '-top-2.5 text-xs text-blue-600' : 'top-3 text-base text-gray-500'}
                    peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-blue-600`}>
                  Password
                </label>
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label={showPw ? "Hide password" : "Show password"}>
                  {showPw ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </button>
              </div>

              <p className="text-sm text-gray-600">
                Don't have an account? Contact your <strong>CEO / Admin</strong>.
              </p>

              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-blue-300 disabled:cursor-not-allowed">
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>

          <div className="text-center mt-6">
            <a href="https://policies.google.com/privacy" className="text-sm text-gray-500 hover:text-gray-700 mx-2">Privacy</a>
            <span className="text-gray-300">·</span>
            <a href="https://policies.google.com/terms" className="text-sm text-gray-500 hover:text-gray-700 mx-2">Terms</a>
          </div>
        </div>
      </div>
    </div>
  );
}
