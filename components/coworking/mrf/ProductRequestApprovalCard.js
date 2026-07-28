// components/coworking/mrf/ProductRequestApprovalCard.js
//
// A request to add a product that is NOT in the catalogue yet, awaiting the
// requester's Primary Manager/TL.
//
// The Store does not see these at all until the TL approves — deciding whether
// the item is even needed comes before deciding which catalogue entry it maps
// to. Once approved, the Store matches it to an existing item or registers it
// as new.
"use client"

import { useState } from "react"
import { ProductImageStrip } from "./ProductImageUploader"
import { approveProductRequest, rejectProductRequest } from "../../../lib/mrfApi"

const C = {
  primary: "#1B4F8A", primaryLight: "#EBF2FA", primaryBorder: "#BFDBFE",
  border: "#E5E7EB", borderLight: "#F3F4F6",
  text: "#111827", textSub: "#4B5563", textMuted: "#9CA3AF",
  surface: "#F9FAFB", white: "#fff",
  red: "#B91C1C", redLight: "#FEF2F2", redBorder: "#FECACA",
  green: "#059669", greenLight: "#F0FDF4", greenBorder: "#A7F3D0",
  amber: "#D97706",
  purple: "#7C3AED", purpleLight: "#F5F3FF", purpleBorder: "#DDD6FE",
}
const FONT = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif"

const fmtDate = (s) => !s ? "—" : new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
const relTime = (s) => {
  if (!s) return ""
  const m = Math.floor((Date.now() - new Date(s)) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function ProductRequestApprovalCard({ request: r, onDecided, onOpenChat }) {
  const [mode, setMode] = useState(null)
  const [rejectNote, setRejectNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const pending = r.approvalStatus === "PENDING_TL"
  const approved = r.approvalStatus === "TL_APPROVED"
  const accent = pending ? C.amber : approved ? C.green : C.red

  const run = async (fn) => {
    setBusy(true); setError("")
    try {
      await fn()
      onDecided?.(r._id)
    } catch (e) {
      setError(e.message || "That action could not be completed.")
      setMode(null)
    } finally { setBusy(false) }
  }

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderLeft: `3px solid ${accent}`, marginBottom: 10, fontFamily: FONT }}>
      <div style={{ padding: "12px 15px" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
          <span style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 4, fontWeight: 700, background: C.purpleLight, border: `1px solid ${C.purpleBorder}`, color: C.purple }}>
            New Product
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{r.requestedByName}</span>
          {r.requestedByDept && <span style={{ fontSize: 11, color: C.textMuted }}>{r.requestedByDept}</span>}
          {r.priority && r.priority !== "NORMAL" && (
            <span style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 4, fontWeight: 700, background: r.priority === "URGENT" ? C.redLight : "#FFF7ED", border: `1px solid ${r.priority === "URGENT" ? C.redBorder : "#FED7AA"}`, color: r.priority === "URGENT" ? C.red : "#92400E" }}>
              {r.priority}
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: C.textMuted }}>Raised {relTime(r.createdAt)}</span>
        </div>

        {r.reason && (
          <div style={{ fontSize: 11.5, color: C.textSub, marginBottom: 5 }}>
            <strong style={{ color: C.text }}>Purpose:</strong> {r.reason}
          </div>
        )}
        {r.neededBy && (
          <div style={{ fontSize: 11.5, color: C.text, marginBottom: 6 }}>
            <strong>Needed by:</strong> {fmtDate(r.neededBy)}
          </div>
        )}

        <div style={{ padding: "8px 10px", background: pending ? "#FFFBEB" : approved ? C.greenLight : C.redLight, border: `1px solid ${pending ? "#FDE68A" : approved ? C.greenBorder : C.redBorder}`, borderRadius: 5, marginBottom: 9 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: pending ? "#B45309" : approved ? C.green : C.red }}>
            {pending ? "Waiting for your approval" : approved ? "You approved this" : "You rejected this"}
          </div>
          <div style={{ fontSize: 11.5, color: pending ? "#B45309" : approved ? C.green : C.red, marginTop: 3, lineHeight: 1.45, opacity: 0.95 }}>
            {pending
              ? `${r.requestedByName} wants ${r.products?.length || 1} product(s) added to inventory that aren't in the catalogue yet. The Store will only see this once you approve.`
              : approved
                ? `Sent to the Store to match against an existing item or register as new${r.tlApprovedAt ? ` on ${fmtDate(r.tlApprovedAt)}` : ""}.`
                : `${r.tlRejectionNote ? `Reason: "${r.tlRejectionNote}"` : "No reason recorded."}`}
          </div>
        </div>

        <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 5, overflow: "hidden" }}>
          {(r.products || []).map((p, i) => (
            <div key={p._id || i} style={{ padding: "9px 11px", borderTop: i === 0 ? "none" : `1px solid ${C.borderLight}` }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{p.itemName}</div>
              <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
                {p.category && <>Category: {p.category}</>}
                {p.requestedQty ? <>{p.category ? " · " : ""}Quantity: <strong>{p.requestedQty}{p.unit ? ` ${p.unit}` : ""}</strong></> : null}
                {!p.requestedQty && p.unit ? <>{p.category ? " · " : ""}Unit: {p.unit}</> : null}
              </div>
              {p.notes && <div style={{ fontSize: 11, color: C.textSub, marginTop: 3 }}>{p.notes}</div>}
              {(p.attributes || []).length > 0 && (
                <div style={{ fontSize: 10.5, color: "#6366F1", marginTop: 3 }}>
                  {p.attributes.map(a => `${a.name}: ${a.values.join(", ")}`).join(" · ")}
                </div>
              )}
              {(p.images || []).length > 0 && (
                <div style={{ marginTop: 6 }}><ProductImageStrip images={p.images} size={46} /></div>
              )}
              {p.status !== "PENDING" && (
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, marginTop: 4 }}>
                  {String(p.status).replace(/_/g, " ")}
                  {p.matchedTo?.name && <span style={{ color: C.primary }}> → {p.matchedTo.name}</span>}
                </div>
              )}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ marginTop: 8, padding: "6px 10px", background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 5, fontSize: 11.5, color: C.red }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          {/* Same per-request thread MRFs have — a TL often needs to ask what
              the item actually is before approving it. */}
          <button
            onClick={() => onOpenChat?.(r)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.textSub, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>
            Chat
            {r.chatMessageCount > 0 && (
              <span style={{ background: C.primary, color: "#fff", borderRadius: 8, padding: "0 5px", fontSize: 9.5, fontWeight: 700 }}>{r.chatMessageCount}</span>
            )}
          </button>

          {pending && mode === null && (
            <>
              <button onClick={() => setMode("approve")}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", border: "none", borderRadius: 5, background: C.green, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
              Approve
            </button>
              <button onClick={() => setMode("reject")}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", border: `1px solid ${C.redBorder}`, borderRadius: 5, background: C.redLight, color: C.red, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                Reject
              </button>
            </>
          )}
        </div>

        {pending && mode === "approve" && (
          <div style={{ marginTop: 9, padding: "10px 12px", background: C.greenLight, border: `1px solid ${C.greenBorder}`, borderRadius: 5 }}>
            <div style={{ fontSize: 11.5, color: "#065F46", marginBottom: 8, lineHeight: 1.45 }}>
              Approving sends this to the Store. They will decide whether it already
              exists in inventory under another name, or needs registering as a new product.
            </div>
            <div style={{ display: "flex", gap: 7, justifyContent: "flex-end" }}>
              <button onClick={() => { setMode(null); setError("") }} disabled={busy}
                style={{ padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.textSub, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>
                Cancel
              </button>
              <button onClick={() => run(() => approveProductRequest(r._id))} disabled={busy}
                style={{ padding: "6px 16px", border: "none", borderRadius: 5, background: busy ? "#A7F3D0" : C.green, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: FONT }}>
                {busy ? "Approving…" : "Confirm Approval"}
              </button>
            </div>
          </div>
        )}

        {pending && mode === "reject" && (
          <div style={{ marginTop: 9, padding: "10px 12px", background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 5 }}>
            <div style={{ fontSize: 11.5, color: C.red, marginBottom: 7 }}>
              The requester sees this reason. Be specific so they know what to do next.
            </div>
            <textarea
              rows={2}
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="e.g. We already stock an equivalent — search for 'Suiting Fabric' instead."
              style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", border: `1px solid ${C.redBorder}`, borderRadius: 5, fontSize: 11.5, fontFamily: FONT, color: C.text, outline: "none", resize: "none", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 7, justifyContent: "flex-end" }}>
              <button onClick={() => { setMode(null); setError("") }} disabled={busy}
                style={{ padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.textSub, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>
                Cancel
              </button>
              <button onClick={() => run(() => rejectProductRequest(r._id, rejectNote.trim()))} disabled={busy || !rejectNote.trim()}
                style={{ padding: "6px 16px", border: "none", borderRadius: 5, background: busy || !rejectNote.trim() ? "#FECACA" : C.red, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: busy || !rejectNote.trim() ? "not-allowed" : "pointer", fontFamily: FONT }}>
                {busy ? "Rejecting…" : "Confirm Rejection"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
