// components/coworking/mrf/MrfContextBanner.js
//
// Renders the `context` object the backend attaches to every MRF
// (services/mrfContext.service.js). The wording lives on the server so the
// requester, the TL and the Store Person are never told three different
// stories about the same request — this component only styles it.
"use client"

const TONE = {
  success: { color: "#059669", bg: "#F0FDF4", border: "#A7F3D0" },
  info: { color: "#1B4F8A", bg: "#EBF2FA", border: "#BFDBFE" },
  warning: { color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  danger: { color: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" },
  muted: { color: "#6B7280", bg: "#F9FAFB", border: "#E5E7EB" },
}

const fmtWhen = (t) => {
  if (!t) return ""
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

/**
 * @param {object}  context     from the API
 * @param {boolean} showNext    show the "what happens next" line
 * @param {boolean} showActor   show who performed the latest action and when
 */
export default function MrfContextBanner({ context, showNext = true, showActor = true, style = {} }) {
  if (!context) return null
  const t = TONE[context.tone] || TONE.info
  const last = context.lastAction

  return (
    <div
      style={{
        padding: "9px 11px",
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 5,
        ...style,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: t.color, lineHeight: 1.35 }}>
        {context.headline}
      </div>
      <div style={{ fontSize: 12, color: t.color, marginTop: 3, lineHeight: 1.45, opacity: 0.95 }}>
        {context.message}
      </div>

      {showNext && context.nextAction && (
        <div
          style={{
            fontSize: 11,
            color: t.color,
            marginTop: 6,
            paddingTop: 6,
            borderTop: `1px dashed ${t.border}`,
            display: "flex",
            alignItems: "baseline",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <strong style={{ fontWeight: 700 }}>Next:</strong>
          <span style={{ opacity: 0.95 }}>{context.nextAction}</span>
        </div>
      )}

      {showActor && last?.action && (
        <div style={{ fontSize: 10.5, color: t.color, opacity: 0.75, marginTop: 4 }}>
          Last action: {last.action.replace(/_/g, " ").toLowerCase()}
          {last.actorName ? ` by ${last.actorName}` : ""}
          {last.at ? ` · ${fmtWhen(last.at)}` : ""}
        </div>
      )}
    </div>
  )
}

/** Compact single-line variant for dense lists. */
export function MrfContextPill({ context }) {
  if (!context) return null
  const t = TONE[context.tone] || TONE.info
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
        background: t.bg, border: `1px solid ${t.border}`, color: t.color,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.color }} />
      {context.statusLabel}
    </span>
  )
}
