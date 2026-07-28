// components/coworking/mrf/MrfApprovalCard.js
//
// One row of a Primary Manager / TL's approval queue.
//
// A request reaches this queue because the requester's HR record names this
// user as their Primary Manager. Approving sends it straight to the Store —
// there is no Project Manager step.
"use client"

import { useState } from "react"
import MrfContextBanner from "./MrfContextBanner"
import { ProductImageStrip } from "./ProductImageUploader"
import { approveMrf, rejectMrf } from "../../../lib/mrfApi"

const C = {
  primary: "#1B4F8A", primaryLight: "#EBF2FA", primaryBorder: "#BFDBFE",
  border: "#E5E7EB", borderLight: "#F3F4F6",
  text: "#111827", textSub: "#4B5563", textMuted: "#9CA3AF",
  surface: "#F9FAFB", white: "#fff",
  red: "#B91C1C", redLight: "#FEF2F2", redBorder: "#FECACA",
  green: "#059669", greenLight: "#F0FDF4", greenBorder: "#A7F3D0",
  amber: "#D97706",
}
const FONT = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif"

const fmtDate = (s) => !s ? "—" : new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
const fmtNum = (n) => n == null ? "—" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 })
const relTime = (s) => {
  if (!s) return ""
  const m = Math.floor((Date.now() - new Date(s)) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
const daysFromNow = (d) => !d ? null : Math.ceil((new Date(d) - new Date()) / 86400000)

export default function MrfApprovalCard({ mrf, onDecided, onOpenChat }) {
  const [mode, setMode] = useState(null)        // null | "approve" | "reject"
  const [decisions, setDecisions] = useState(() =>
    Object.fromEntries((mrf.items || []).map(i => [String(i._id), "APPROVED"]))
  )
  const [note, setNote] = useState("")
  const [rejectNote, setRejectNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const isPending = mrf.status === "PENDING"
  const isTime = mrf.requestType === "TIME_BASED"
  const days = isTime ? daysFromNow(mrf.deadline) : null
  const approvedCount = Object.values(decisions).filter(d => d === "APPROVED").length

  const run = async (fn) => {
    setBusy(true); setError("")
    try {
      await fn()
      onDecided?.(mrf._id)
    } catch (e) {
      // Surface the server's reason verbatim — it explains *why* the action
      // was refused (not the approver, already decided, already issued…).
      setError(e.message || "That action could not be completed.")
      setMode(null)
    } finally { setBusy(false) }
  }

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderLeft: `3px solid ${isPending ? C.amber : mrf.status === "REJECTED" ? C.red : C.green}`, marginBottom: 10, fontFamily: FONT }}>
      <div style={{ padding: "12px 15px" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.primary, fontFamily: "monospace" }}>{mrf.mrfNumber}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{mrf.requestedForName}</span>
          {mrf.requestedForDept && <span style={{ fontSize: 11, color: C.textMuted }}>{mrf.requestedForDept}</span>}
          {mrf.requestedForId && <span style={{ fontSize: 10.5, color: C.textMuted, fontFamily: "monospace" }}>{mrf.requestedForId}</span>}
          {mrf.priority && mrf.priority !== "NORMAL" && (
            <span style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 4, fontWeight: 700, background: mrf.priority === "URGENT" ? C.redLight : "#FFF7ED", border: `1px solid ${mrf.priority === "URGENT" ? C.redBorder : "#FED7AA"}`, color: mrf.priority === "URGENT" ? C.red : "#92400E" }}>
              {mrf.priority}
            </span>
          )}
          <span style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 4, background: isTime ? C.primaryLight : C.surface, border: `1px solid ${isTime ? C.primaryBorder : C.border}`, color: isTime ? C.primary : C.textSub }}>
            {isTime ? "Time-Based" : "Uses-Based"}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: C.textMuted }}>Raised {relTime(mrf.createdAt)}</span>
        </div>

        {mrf.reason && (
          <div style={{ fontSize: 11.5, color: C.textSub, marginBottom: 6 }}>
            <strong style={{ color: C.text }}>Purpose:</strong> {mrf.reason}
          </div>
        )}
        {/* When they need it in hand — the main thing a TL prioritises on. */}
        {mrf.neededBy && (() => {
          const d = daysFromNow(mrf.neededBy)
          const overdue = d !== null && d < 0
          const urgent = d !== null && d >= 0 && d <= 2
          return (
            <div style={{ fontSize: 11.5, color: overdue ? C.red : urgent ? C.amber : C.text, fontWeight: overdue || urgent ? 700 : 500, marginBottom: 6 }}>
              Needed by: {fmtDate(mrf.neededBy)}
              {overdue ? ` — ${Math.abs(d)}d overdue` : d === 0 ? " — today" : d > 0 ? ` — in ${d}d` : ""}
            </div>
          )
        })()}
        {isTime && mrf.deadline && (
          <div style={{ fontSize: 11, color: days !== null && days < 0 ? C.red : C.textMuted, marginBottom: 6 }}>
            Return deadline: {fmtDate(mrf.deadline)}
            {days !== null && (days >= 0 ? ` — ${days}d away` : ` — overdue ${Math.abs(days)}d`)}
          </div>
        )}

        <MrfContextBanner context={mrf.context} showActor={!isPending} style={{ marginBottom: 9 }} />

        {/* Items — quantity in the requester's unit, plus their photos/specs */}
        <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 5, overflow: "hidden" }}>
          {(mrf.items || []).map((item, i) => {
            const id = String(item._id)
            const dec = decisions[id] || "APPROVED"
            const skipped = isPending ? dec === "REJECTED" : item.itemStatus === "REJECTED"
            return (
              <div
                key={id || i}
                style={{
                  padding: "9px 11px",
                  borderTop: i === 0 ? "none" : `1px solid ${C.borderLight}`,
                  background: skipped ? C.redLight : C.white,
                  opacity: skipped ? 0.75 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>
                      {item.rawItemName}
                      {item.rawItemSku && <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace", marginLeft: 6 }}>{item.rawItemSku}</span>}
                    </div>
                    {item.variantCombination?.length > 0 && (
                      <div style={{ fontSize: 10.5, color: "#6366F1", marginTop: 1 }}>{item.variantCombination.join(" · ")}</div>
                    )}
                    <div style={{ fontSize: 12, color: C.text, marginTop: 3 }}>
                      Requested: <strong>{fmtNum(item.requestedQty)} {item.unit}</strong>
                    </div>
                    {item.description && <div style={{ fontSize: 11, color: C.textSub, marginTop: 3 }}>{item.description}</div>}
                    {item.specifications && (
                      <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
                        <strong style={{ color: C.text }}>Specs:</strong> {item.specifications}
                      </div>
                    )}
                    {(item.images || []).length > 0 && (
                      <div style={{ marginTop: 6 }}><ProductImageStrip images={item.images} size={46} /></div>
                    )}
                  </div>

                  {isPending && (mrf.items || []).length > 1 && (
                    <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                      {[["APPROVED", "Approve"], ["REJECTED", "Skip"]].map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setDecisions(p => ({ ...p, [id]: val }))}
                          style={{
                            padding: "4px 9px", borderRadius: 4, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                            border: `1px solid ${dec === val ? (val === "APPROVED" ? C.greenBorder : C.redBorder) : C.border}`,
                            background: dec === val ? (val === "APPROVED" ? C.greenLight : C.redLight) : C.white,
                            color: dec === val ? (val === "APPROVED" ? C.green : C.red) : C.textSub,
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  {!isPending && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: skipped ? C.red : C.textSub, flexShrink: 0 }}>
                      {String(item.itemStatus || "").replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {error && (
          <div style={{ marginTop: 8, padding: "6px 10px", background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 5, fontSize: 11.5, color: C.red }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => onOpenChat(mrf)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.textSub, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>
            Chat
            {mrf.chatMessageCount > 0 && (
              <span style={{ background: C.primary, color: "#fff", borderRadius: 8, padding: "0 5px", fontSize: 9.5, fontWeight: 700 }}>{mrf.chatMessageCount}</span>
            )}
          </button>

          {isPending && mode === null && (
            <>
              <button
                onClick={() => setMode("approve")}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", border: "none", borderRadius: 5, background: C.green, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                Approve
              </button>
              <button
                onClick={() => setMode("reject")}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", border: `1px solid ${C.redBorder}`, borderRadius: 5, background: C.redLight, color: C.red, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                Reject
              </button>
            </>
          )}
        </div>

        {isPending && mode === "approve" && (
          <div style={{ marginTop: 9, padding: "10px 12px", background: C.greenLight, border: `1px solid ${C.greenBorder}`, borderRadius: 5 }}>
            <div style={{ fontSize: 11.5, color: "#065F46", marginBottom: 7, lineHeight: 1.45 }}>
              Approving sends <strong>{approvedCount} of {(mrf.items || []).length} item(s)</strong> straight to the Store for
              issuance. The Store will then confirm what is actually available.
            </div>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Note for the Store (optional)…"
              style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", border: `1px solid ${C.greenBorder}`, borderRadius: 5, fontSize: 11.5, fontFamily: FONT, color: C.text, outline: "none", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 7, justifyContent: "flex-end" }}>
              <button onClick={() => { setMode(null); setError("") }} disabled={busy}
                style={{ padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.textSub, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>
                Cancel
              </button>
              <button
                onClick={() => run(() => approveMrf(mrf._id, { itemDecisions: decisions, note: note.trim() }))}
                disabled={busy || approvedCount === 0}
                style={{ padding: "6px 16px", border: "none", borderRadius: 5, background: busy || approvedCount === 0 ? "#A7F3D0" : C.green, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: busy || approvedCount === 0 ? "not-allowed" : "pointer", fontFamily: FONT }}>
                {busy ? "Approving…" : "Confirm Approval"}
              </button>
            </div>
            {approvedCount === 0 && (
              <div style={{ fontSize: 10.5, color: C.red, marginTop: 5 }}>
                Every item is set to Skip — use Reject for the whole request instead.
              </div>
            )}
          </div>
        )}

        {isPending && mode === "reject" && (
          <div style={{ marginTop: 9, padding: "10px 12px", background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 5 }}>
            <div style={{ fontSize: 11.5, color: C.red, marginBottom: 7 }}>
              The requester sees this reason. Be specific so they know what to do next.
            </div>
            <textarea
              rows={2}
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="e.g. Already issued last week — check with the team before re-ordering."
              style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", border: `1px solid ${C.redBorder}`, borderRadius: 5, fontSize: 11.5, fontFamily: FONT, color: C.text, outline: "none", resize: "none", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 7, justifyContent: "flex-end" }}>
              <button onClick={() => { setMode(null); setError("") }} disabled={busy}
                style={{ padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.textSub, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>
                Cancel
              </button>
              <button
                onClick={() => run(() => rejectMrf(mrf._id, rejectNote.trim()))}
                disabled={busy || !rejectNote.trim()}
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
