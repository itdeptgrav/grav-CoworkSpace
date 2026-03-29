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
export function GwConfirm({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(15,23,42,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 600,
      backdropFilter: "blur(3px)",
    }}>
      <div className="grav-fadein" style={{
        background: "var(--surface)",
        borderRadius: "var(--radius-xl)",
        padding: "32px",
        width: "min(420px, 95vw)",
        boxShadow: "var(--shadow-xl)",
        fontFamily: "var(--font)",
      }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 700, color: "var(--gray-900)" }}>{title}</h3>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: "var(--gray-600)", lineHeight: 1.65 }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={onCancel}
            className="grav-btn"
            style={btnStyle("ghost")}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="grav-btn"
            style={btnStyle("danger")}
          >
            Delete
          </button>
        </div>
      </div>
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