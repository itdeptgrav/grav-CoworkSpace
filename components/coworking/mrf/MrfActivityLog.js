// components/coworking/mrf/MrfActivityLog.js
//
// Request-level history for the cowork side.
//
// The store already had a full Activity Log tab; cowork had nothing equivalent.
// Per-item movement history existed but sat two clicks deep behind a collapsed
// items table, so a return recorded by the store was effectively invisible to
// the person who made the return.
//
// This merges three sources the MRF already carries into one timeline:
//   • statusHistory      — created, TL approved/rejected, availability, issued,
//                          returned, cancelled, closed
//   • items[].issueHistory  — each individual issue, with quantity and note
//   • items[].returnHistory — each individual return, ditto
"use client"

import { useState, useMemo } from "react"

const C = {
  primary: "#1B4F8A", border: "#E5E7EB", borderLight: "#F3F4F6",
  text: "#111827", textSub: "#4B5563", textMuted: "#9CA3AF",
  surface: "#F9FAFB", white: "#fff",
  green: "#059669", red: "#B91C1C", amber: "#B45309", purple: "#7C3AED",
}
const FONT = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif"

const fmtNum = (n) =>
  n == null ? "—" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 })
const fmtWhen = (t) => {
  if (!t) return ""
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

// Colour and wording per event kind. Returns get their own colour so they are
// findable at a glance — that was the whole complaint.
const KIND = {
  created: { dot: C.primary, label: "Raised" },
  approved: { dot: C.green, label: "Approved" },
  rejected: { dot: C.red, label: "Rejected" },
  availability: { dot: C.amber, label: "Availability" },
  issue: { dot: C.primary, label: "Issued" },
  return: { dot: C.purple, label: "Returned" },
  cancelled: { dot: C.textMuted, label: "Cancelled" },
  system: { dot: C.textMuted, label: "Update" },
}

/** Map a statusHistory action onto a display kind. */
function kindOf(action) {
  const a = String(action || "").toUpperCase()
  if (a === "CREATED") return "created"
  if (a.includes("APPROV")) return "approved"
  if (a.includes("REJECT")) return "rejected"
  if (a.includes("UNFULFILLED")) return "rejected"
  if (a.includes("AVAILABILITY")) return "availability"
  if (a.includes("RETURN")) return "return"
  if (a.includes("ISSUED")) return "issue"
  if (a.includes("CANCEL")) return "cancelled"
  return "system"
}

const pretty = (action) =>
  String(action || "").replace(/_/g, " ").toLowerCase().replace(/^./, c => c.toUpperCase())

export default function MrfActivityLog({ mrf, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)

  const events = useMemo(() => {
    const out = []

    // Recorded status transitions.
    ;(mrf.statusHistory || []).forEach(h => {
      out.push({
        kind: kindOf(h.action),
        at: h.at,
        title: pretty(h.action),
        detail: h.detail || "",
        actor: h.actorName || "",
        actorRole: h.actorRole || "",
      })
    })

    // Individual movements, which carry the quantities the transitions don't.
    ;(mrf.items || []).forEach(item => {
      ;(item.issueHistory || []).forEach(h => {
        out.push({
          kind: "issue",
          at: h.recordedAt || h.createdAt,
          title: `Issued ${fmtNum(h.issuedQty)} ${item.unit}`,
          detail: item.rawItemName + (h.notes ? ` — ${h.notes}` : ""),
          actor: "Store",
          actorRole: "store",
        })
      })
      // returnedAt is the schema field; the others are defensive in case an
      // older record was written with a different key.
      ;(item.returnHistory || []).forEach(h => {
        out.push({
          kind: "return",
          at: h.returnedAt || h.recordedAt || h.createdAt,
          title: `Returned ${fmtNum(h.returnedQty)} ${item.unit}`,
          detail: item.rawItemName + (h.notes ? ` — ${h.notes}` : ""),
          actor: "Store",
          actorRole: "store",
        })
      })
    })

    // Newest first — the last thing that happened is what the user came for.
    return out
      .filter(e => e.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
  }, [mrf])

  if (!events.length) return null

  const returnCount = events.filter(e => e.kind === "return").length

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.textSub, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        {open ? "Hide history" : "History"}
        <span style={{ color: C.textMuted, fontWeight: 500 }}>
          ({events.length}
          {returnCount > 0 ? `, ${returnCount} return${returnCount === 1 ? "" : "s"}` : ""})
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 7, padding: "9px 11px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5 }}>
          <div style={{ position: "relative", paddingLeft: 14 }}>
            <div style={{ position: "absolute", left: 3.5, top: 4, bottom: 4, width: 1, background: C.border }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {events.map((e, i) => {
                const cfg = KIND[e.kind] || KIND.system
                return (
                  <div key={i} style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: -14, top: 3, width: 8, height: 8, borderRadius: "50%", background: cfg.dot, border: `1.5px solid ${C.white}` }} />
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>
                      {e.title}
                    </div>
                    {e.detail && (
                      <div style={{ fontSize: 11, color: C.textSub, marginTop: 1, lineHeight: 1.4 }}>{e.detail}</div>
                    )}
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
                      {fmtWhen(e.at)}
                      {e.actor ? ` · ${e.actor}` : ""}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
