"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { coworkSignIn } from "../lib/coworkAuth";

export default function CoworkingLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [emailFilled, setEmailFilled] = useState(false);
  const [passwordFilled, setPasswordFilled] = useState(false);

  // Permanent fix for autofill overlap
  useEffect(() => {
    // Check for autofilled values
    const checkAutofill = () => {
      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');

      if (emailInput && emailInput.value) {
        setEmailFilled(true);
        setEmail(emailInput.value);
      }
      if (passwordInput && passwordInput.value) {
        setPasswordFilled(true);
        setPassword(passwordInput.value);
      }
    };

    // Check immediately
    checkAutofill();

    // Check after a short delay for browser autofill
    setTimeout(checkAutofill, 100);
    setTimeout(checkAutofill, 500);

    // Listen for animation events that browsers fire when autofilling
    document.addEventListener('animationstart', checkAutofill);

    return () => {
      document.removeEventListener('animationstart', checkAutofill);
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { role } = await coworkSignIn(email, password);
      // Accept any role except "none" or undefined
      if (role && role !== "none") {  // ← Changed this line
        router.push("/coworking");
      } else {
        setError("No workspace access. Contact your admin.");
      }
    } catch (err) {
      const msg =
        err.code === "auth/invalid-credential" || err.code === "auth/wrong-password"
          ? "Wrong email or password."
          : err.code === "auth/user-not-found"
            ? "No account found."
            : err.code === "auth/too-many-requests"
              ? "Too many attempts. Try later."
              : err.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left Panel - Hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 bg-gray-50 items-center justify-center p-12">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-16">
            <Image
              src="/grav-image-logo.svg"
              alt="CoWork Space"
              width={32}
              height={32}
              className="w-8 h-8"
            />
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
          {/* Mobile Logo - Shows only on mobile */}
          <div className="flex justify-center mb-8 lg:hidden">
            <Image
              src="/grav-image-logo.svg"
              alt="CoWork Space"
              width={80}
              height={80}
              className="w-25 h-25"
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-8 lg:p-10">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-gray-900">Sign in</h2>
              <p className="text-gray-600 mt-2">to your CoWork account</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 flex items-center gap-2 text-red-600 text-sm">
                <span>⚠️</span>
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
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailFilled(!!e.target.value);
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 peer"
                  placeholder=" "
                  required
                  autoComplete="email"
                />
                <label
                  htmlFor="email"
                  className={`absolute left-4 bg-white px-1 transition-all duration-200 pointer-events-none
                    ${email || emailFilled ? '-top-2.5 text-xs text-blue-600' : 'top-3 text-base text-gray-500'}
                    peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-blue-600`}
                >
                  Email
                </label>
              </div>

              {/* Password Field */}
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordFilled(!!e.target.value);
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 peer pr-12"
                  placeholder=" "
                  required
                  autoComplete="current-password"
                />
                <label
                  htmlFor="password"
                  className={`absolute left-4 bg-white px-1 transition-all duration-200 pointer-events-none
                    ${password || passwordFilled ? '-top-2.5 text-xs text-blue-600' : 'top-3 text-base text-gray-500'}
                    peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-blue-600`}
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
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

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-blue-300 disabled:cursor-not-allowed"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>

          <div className="text-center mt-6">
            <a href="https://policies.google.com/privacy" className="text-sm text-gray-500 hover:text-gray-700 mx-2">
              Privacy
            </a>
            <span className="text-gray-300">·</span>
            <a href="https://policies.google.com/terms" className="text-sm text-gray-500 hover:text-gray-700 mx-2">
              Terms
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}