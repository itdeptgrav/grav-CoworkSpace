/**
 * GRAV-CMS/components/coworking/shared/CoworkShared.jsx
 * Shared UI primitives — redesigned with design system tokens.
 * ALL original logic preserved.
 */
"use client";
import { initials, avatarColor } from "../../../lib/coworkUtils";

/* ── Avatar ─────────────────────────────────────────────── */
export function GwAvatar({ name = "", size = 32, url }) {
  if (url) {
    return (
      <img
        src={url} alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size,
      borderRadius: "50%",
      background: avatarColor(name),
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff",
      fontWeight: 700,
      fontSize: Math.max(10, Math.round(size * 0.36)),
      flexShrink: 0,
      userSelect: "none",
      fontFamily: "var(--font)",
      letterSpacing: "-0.02em",
    }}>
      {initials(name)}
    </div>
  );
}

/* ── Chip ────────────────────────────────────────────────── */
export function GwChip({ label, color = "var(--primary)", bg = "var(--primary-light)" }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: "var(--radius-full)",
      fontSize: 11,
      fontWeight: 600,
      color, background: bg,
      letterSpacing: "0.01em",
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

/* ── Status Badge ───────────────────────────────────────── */
export function GwStatusBadge({ status }) {
  const map = {
    open: { c: "var(--warning)", bg: "var(--warning-light)", l: "Open" },
    confirmed: { c: "var(--primary)", bg: "var(--primary-light)", l: "Confirmed" },
    in_progress: { c: "var(--primary)", bg: "var(--primary-light)", l: "In Progress" },
    done: { c: "var(--success)", bg: "var(--success-light)", l: "Done" },
  };
  const { c, bg, l } = map[status] || map.open;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px",
      borderRadius: "var(--radius-full)",
      fontSize: 11, fontWeight: 600,
      color: c, background: bg,
      letterSpacing: "0.01em",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c, flexShrink: 0 }} />
      {l}
    </span>
  );
}

/* ── Confirm Dialog ─────────────────────────────────────── */
export function GwConfirm({ open, title, message, onConfirm, onCancel, busy = false, confirmLabel = "Delete", icon = "trash" }) {
  if (!open) return null;

  const FONT = "'Inter','DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9000, padding: 20,
        backdropFilter: "blur(4px)",
        animation: "gwc-fade 0.12s ease",
      }}
    >
      <div style={{
        background: "#fff",
        borderRadius: 14,
        width: "min(400px, 100%)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)",
        fontFamily: FONT,
        overflow: "hidden",
        animation: "gwc-pop 0.15s cubic-bezier(0.4,0,0.2,1)",
      }}>

        {/* ── Header ── */}
        <div style={{ padding: "20px 22px 16px", display: "flex", alignItems: "flex-start", gap: 14, borderBottom: "1px solid #F1F5F9" }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "#FEF2F2", border: "1px solid #FECACA",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em" }}>{title}</div>
          </div>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{ width: 26, height: 26, border: "1px solid #E2E8F0", borderRadius: 6, background: "#F8FAFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", flexShrink: 0, padding: 0 }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "14px 22px 20px" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.65 }}>{message}</p>
          <div style={{ marginTop: 10, padding: "9px 12px", background: "#FEF9EC", border: "1px solid #FDE68A", borderRadius: 7, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span style={{ fontSize: 12, color: "#92400E", fontWeight: 500 }}>This action is permanent and cannot be reversed.</span>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: "0 22px 20px", display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: "8px 18px", border: "1.5px solid #E2E8F0", borderRadius: 8,
              background: "#F8FAFC", color: "#374151",
              fontSize: 13, fontWeight: 500, cursor: busy ? "not-allowed" : "pointer",
              fontFamily: FONT, opacity: busy ? 0.5 : 1, transition: "all 0.12s",
            }}
            onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "#F1F5F9"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#F8FAFC"; }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: "8px 20px", border: "none", borderRadius: 8,
              background: busy ? "#FCA5A5" : "#EF4444", color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer",
              fontFamily: FONT, display: "flex", alignItems: "center", gap: 7,
              minWidth: 110, justifyContent: "center", transition: "background 0.12s",
              boxShadow: busy ? "none" : "0 2px 8px rgba(239,68,68,0.35)",
            }}
            onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "#DC2626"; }}
            onMouseLeave={e => { if (!busy) e.currentTarget.style.background = "#EF4444"; }}
          >
            {busy ? (
              <>
                <svg style={{ animation: "gw-spin 0.75s linear infinite", flexShrink: 0 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
                Deleting…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
                {confirmLabel}
              </>
            )}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes gwc-fade { from { opacity:0; } to { opacity:1; } }
        @keyframes gwc-pop  { from { opacity:0; transform:scale(0.95) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes gw-spin  { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}

/* ── Shared modal overlay ────────────────────────────────── */
export function GwModalOverlay({ children, onClose, maxWidth = "580px" }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(15,23,42,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 600,
        backdropFilter: "blur(3px)",
        padding: "20px",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="grav-fadein"
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-xl)",
          width: `min(${maxWidth}, 100%)`,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-xl)",
          fontFamily: "var(--font)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ── Modal Header ────────────────────────────────────────── */
export function GwModalHeader({ title, subtitle, onClose, icon }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      padding: "24px 24px 20px",
      borderBottom: "1px solid var(--gray-100)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {icon && (
          <div style={{
            width: 40, height: 40,
            background: "var(--primary-light)",
            borderRadius: "var(--radius-md)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--gray-900)", letterSpacing: "-0.01em" }}>{title}</h2>
          {subtitle && <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--gray-500)" }}>{subtitle}</p>}
        </div>
      </div>
      <button
        onClick={onClose}
        style={{
          width: 32, height: 32, borderRadius: "var(--radius-md)",
          border: "1px solid var(--gray-200)",
          background: "var(--gray-50)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: "var(--gray-500)",
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}

/* ── Field label + input helpers ─────────────────────────── */
export function GwField({ label, required, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{
        fontSize: 12, fontWeight: 600,
        color: "var(--gray-600)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        display: "flex", alignItems: "center", gap: 4,
      }}>
        {label}
        {required && <span style={{ color: "var(--danger)" }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: "var(--gray-400)" }}>{hint}</div>}
    </div>
  );
}

export const INPUT_STYLE = {
  padding: "9px 12px",
  border: "1.5px solid var(--gray-200)",
  borderRadius: "var(--radius-md)",
  fontSize: 13,
  fontFamily: "var(--font)",
  outline: "none",
  boxSizing: "border-box",
  width: "100%",
  background: "var(--surface)",
  color: "var(--gray-800)",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

export const TEXTAREA_STYLE = {
  ...INPUT_STYLE,
  resize: "vertical",
  minHeight: 80,
  lineHeight: 1.5,
};

/* ── Buttons ────────────────────────────────────────────── */
export function btnStyle(variant = "primary") {
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "10px 20px",
    borderRadius: "var(--radius-md)",
    fontSize: 13, fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--font)",
    border: "1.5px solid transparent",
    letterSpacing: "-0.01em",
    whiteSpace: "nowrap",
  };
  const variants = {
    primary: { background: "var(--primary)", color: "#fff", border: "1.5px solid var(--primary)" },
    ghost: { background: "transparent", color: "var(--gray-600)", border: "1.5px solid var(--gray-200)" },
    danger: { background: "var(--danger)", color: "#fff", border: "1.5px solid var(--danger)" },
    success: { background: "var(--success)", color: "#fff", border: "1.5px solid var(--success)" },
    outline: { background: "transparent", color: "var(--primary)", border: "1.5px solid var(--primary)" },
    warning: { background: "var(--warning-light)", color: "var(--warning)", border: "1.5px solid var(--warning-light)" },
  };
  return { ...base, ...variants[variant] };
}

/* ── Section label ──────────────────────────────────────── */
export function GwSectionLabel({ children }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      marginBottom: 12,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700,
        color: "var(--gray-400)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        whiteSpace: "nowrap",
      }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--gray-100)" }} />
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────── */
export function GwEmpty({ icon = "📋", title, subtitle, action }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "48px 24px",
      textAlign: "center",
    }}>
      <div style={{
        width: 64, height: 64,
        background: "var(--gray-100)",
        borderRadius: "var(--radius-xl)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, marginBottom: 16,
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--gray-800)", marginBottom: 6 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: "var(--gray-400)", lineHeight: 1.6, maxWidth: 300 }}>{subtitle}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

/* ── Spinner ────────────────────────────────────────────── */
export function GwSpinner({ size = 28, color = "var(--primary)" }) {
  return (
    <div
      className="grav-spin"
      style={{
        width: size, height: size,
        border: `2.5px solid var(--gray-200)`,
        borderTopColor: color,
        borderRadius: "50%",
        flexShrink: 0,
      }}
    />
  );
}

/* ── Error box ──────────────────────────────────────────── */
export function GwError({ message }) {
  if (!message) return null;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 14px",
      background: "var(--danger-light)",
      border: "1px solid var(--danger-mid, #FECACA)",
      borderRadius: "var(--radius-md)",
      fontSize: 13, color: "var(--danger)",
    }}>
      <span style={{ flexShrink: 0, fontWeight: 700 }}>!</span>
      {message}
    </div>
  );
}