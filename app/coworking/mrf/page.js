// app/coworking/mrf/page.js
"use client"

import { useState, useEffect, useRef } from "react"
import { useCoworkAuth } from "../../../hooks/useCoworkAuth"
import CoworkingShell from "../../../components/coworking/layout/CoworkingShell"
import AddProductRequestForm from "../../../components/coworking/mrf/AddProductRequestForm"
import MrfContextBanner from "../../../components/coworking/mrf/MrfContextBanner"
import MrfChatSidebar from "../../../components/coworking/mrf/MrfChatSidebar"
import MrfApprovalCard from "../../../components/coworking/mrf/MrfApprovalCard"
import ProductRequestApprovalCard from "../../../components/coworking/mrf/ProductRequestApprovalCard"
import ProductImageUploader, { ProductImageStrip } from "../../../components/coworking/mrf/ProductImageUploader"
import { initPushNotifications } from "../../../lib/coworkPushNotifications"
import {
  fetchCategories, fetchUnits, searchRawItems as apiSearchRawItems,
  fetchMyApprover, listMyMrfs, createMrf, cancelMrf,
  listProductRequests, createProductRequest, listApprovals,
} from "../../../lib/mrfApi"

const C = {
  primary: "#1B4F8A", primaryLight: "#EBF2FA", primaryBorder: "#BFDBFE",
  border: "#E5E7EB", borderLight: "#F3F4F6",
  text: "#111827", textSub: "#4B5563", textMuted: "#9CA3AF",
  surface: "#F9FAFB", white: "#fff",
  red: "#B91C1C", redLight: "#FEF2F2", redBorder: "#FECACA",
  green: "#059669", greenLight: "#F0FDF4", greenBorder: "#A7F3D0",
  amber: "#D97706", amberLight: "#FFFBEB", amberBorder: "#FDE68A",
  purple: "#7C3AED", purpleLight: "#F5F3FF", purpleBorder: "#DDD6FE",
}
const FONT = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif"

const fmtDate = (s) => !s ? "—" : new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
const fmtDateTime = (s) => !s ? "—" : new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
const fmtNum = (n) => n == null ? "—" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 })
const daysFromNow = (d) => !d ? null : Math.ceil((new Date(d) - new Date()) / 86400000)
const relTime = (s) => {
  if (!s) return ""
  const m = Math.floor((Date.now() - new Date(s)) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS = {
  PENDING: { label: "Pending", dot: "#F59E0B", text: "#92400E", bg: "#FFFBEB", border: "#FDE68A" },
  APPROVED: { label: "Approved", dot: "#3B82F6", text: "#1E40AF", bg: "#EFF6FF", border: "#BFDBFE" },
  PARTIALLY_ISSUED: { label: "Partly Issued", dot: "#6366F1", text: "#3730A3", bg: "#EEF2FF", border: "#C7D2FE" },
  ISSUED: { label: "Issued", dot: "#10B981", text: "#065F46", bg: "#ECFDF5", border: "#A7F3D0" },
  PARTIALLY_RETURNED: { label: "Partly Returned", dot: "#8B5CF6", text: "#5B21B6", bg: "#F5F3FF", border: "#DDD6FE" },
  COMPLETED: { label: "Completed", dot: "#22C55E", text: "#166534", bg: "#F0FDF4", border: "#BBF7D0" },
  REJECTED: { label: "Rejected", dot: "#EF4444", text: "#991B1B", bg: C.redLight, border: C.redBorder },
  CANCELLED: { label: "Cancelled", dot: "#9CA3AF", text: "#6B7280", bg: C.surface, border: C.border },
}
const ITEM_COLOR = {
  PENDING: "#B45309", APPROVED: "#1D4ED8", ISSUED: "#065F46",
  PARTIALLY_RETURNED: "#5B21B6", RETURNED: "#6B7280", OVERDUE: "#991B1B", REJECTED: "#DC2626",
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.PENDING
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: s.bg, border: `1px solid ${s.border}`, color: s.text }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />
      {s.label}
    </span>
  )
}

// The "what's happening" copy now comes from the backend
// (services/mrfContext.service.js) as mrf.context, so the requester, the
// approving TL and the Store Person are never shown three different accounts
// of the same request. Rendered by <MrfContextBanner />.

// When the requester needs the material IN HAND — distinct from the return
// deadline on TIME_BASED requests. Goes red once it's past, because a request
// that missed the date the person needed it is the one worth chasing.
function NeededByText({ neededBy }) {
  const days = daysFromNow(neededBy)
  if (days === null) return null
  const overdue = days < 0
  const urgent = days >= 0 && days <= 2
  const color = overdue ? C.red : urgent ? "#D97706" : C.textSub
  return (
    <span style={{ fontSize: 11, color, fontWeight: overdue || urgent ? 600 : 500 }}>
      Needed by: {fmtDate(neededBy)}
      {overdue && ` — ${Math.abs(days)}d overdue`}
      {!overdue && days === 0 && " — today"}
      {!overdue && days > 0 && ` — in ${days}d`}
    </span>
  )
}

function DeadlineText({ deadline }) {
  const days = daysFromNow(deadline)
  if (days === null) return null
  const overdue = days < 0
  const urgent = days >= 0 && days <= 2
  const color = overdue ? C.red : urgent ? "#D97706" : C.textMuted
  return (
    <span style={{ fontSize: 11, color, fontWeight: overdue || urgent ? 600 : 400 }}>
      Deadline: {fmtDate(deadline)}
      {overdue && ` — overdue ${Math.abs(days)}d`}
      {!overdue && days === 0 && " — due today"}
      {!overdue && days > 0 && ` — ${days}d remaining`}
    </span>
  )
}

// What the Store found for this line, in the unit the requester asked in.
// Only rendered once the Store has actually looked — "UNREVIEWED" says
// nothing useful and would just add noise.
const AVAILABILITY_UI = {
  AVAILABLE: { label: "Available in store", color: "#059669", bg: "#F0FDF4", border: "#A7F3D0" },
  PARTIAL: { label: "Partially available", color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  NOT_AVAILABLE: { label: "Not available", color: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" },
  ALTERNATIVE: { label: "Alternative offered", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
}

function AvailabilityNote({ item }) {
  const cfg = AVAILABILITY_UI[item.availability]
  if (!cfg) return null
  const requested = item.requestedQty || 0
  const available = item.availableQty
  const shortfall = available != null ? Math.max(0, requested - (item.issuedQty || 0) - available) : 0

  return (
    <div style={{ marginTop: 4, padding: "4px 7px", background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 4, fontSize: 10, color: cfg.color, lineHeight: 1.4 }}>
      <strong>{cfg.label}</strong>
      {item.availability === "PARTIAL" && available != null && (
        <> — {fmtNum(available)} of {fmtNum(requested)} {item.unit} on hand{shortfall > 0 ? `, ${fmtNum(shortfall)} ${item.unit} still pending` : ""}</>
      )}
      {item.availability === "ALTERNATIVE" && item.alternativeItem?.name && (
        <> — {item.alternativeItem.name}</>
      )}
      {item.availabilityNote && <div style={{ marginTop: 2, opacity: 0.9 }}>Store: {item.availabilityNote}</div>}
    </div>
  )
}

function TimeItemRow({ item, deadline }) {
  const issued = item.issuedQty || 0, returned = item.returnedQty || 0
  const pending = Math.max(0, issued - returned)
  const pct = issued > 0 ? Math.round((returned / issued) * 100) : 0
  const days = daysFromNow(deadline)
  const isOverdue = item.itemStatus === "OVERDUE" || (days !== null && days < 0 && item.itemStatus === "ISSUED")
  return (
    <tr style={{ borderTop: `1px solid ${C.borderLight}`, background: isOverdue ? "#FFF5F5" : "transparent" }}>
      <td style={{ padding: "5px 10px 5px 0", verticalAlign: "top" }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{item.rawItemName}</div>
        {item.variantCombination?.length > 0 && <div style={{ fontSize: 10, color: "#6366F1" }}>{item.variantCombination.join(" · ")}</div>}
        {(item.images || []).length > 0 && (
          <div style={{ marginTop: 4 }}><ProductImageStrip images={item.images} size={34} /></div>
        )}
        <AvailabilityNote item={item} />
      </td>
      <td style={{ padding: "5px 10px 5px 0", fontSize: 11, color: C.textSub, whiteSpace: "nowrap", verticalAlign: "top" }}>{fmtNum(item.requestedQty)} {item.unit}</td>
      <td style={{ padding: "5px 10px 5px 0", fontSize: 11, color: "#059669", fontWeight: 500, verticalAlign: "top" }}>{fmtNum(issued)}</td>
      <td style={{ padding: "5px 10px 5px 0", fontSize: 11, color: "#2563EB", verticalAlign: "top" }}>{fmtNum(returned)}</td>
      <td style={{ padding: "5px 10px 5px 0", fontSize: 11, fontWeight: 500, verticalAlign: "top", color: pending > 0 ? (isOverdue ? "#DC2626" : "#D97706") : C.textMuted }}>{fmtNum(pending)}</td>
      <td style={{ padding: "5px 12px 5px 0", verticalAlign: "middle", width: 60 }}>
        {issued > 0 && (
          <div style={{ height: 3, background: C.borderLight, borderRadius: 2 }}>
            <div style={{ height: 3, borderRadius: 2, background: pct >= 100 ? "#10B981" : isOverdue ? "#EF4444" : "#3B82F6", width: `${pct}%` }} />
          </div>
        )}
      </td>
      <td style={{ padding: "5px 0", verticalAlign: "top" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: isOverdue ? C.red : (ITEM_COLOR[item.itemStatus] || C.textMuted) }}>{isOverdue ? "OVERDUE" : item.itemStatus}</span>
      </td>
    </tr>
  )
}

function UsesItemRow({ item }) {
  const issued = item.issuedQty || 0
  const requested = item.requestedQty || 0
  const pct = requested > 0 ? Math.min(100, Math.round((issued / requested) * 100)) : 0
  return (
    <tr style={{ borderTop: `1px solid ${C.borderLight}` }}>
      <td style={{ padding: "5px 10px 5px 0", verticalAlign: "top" }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{item.rawItemName}</div>
        {item.variantCombination?.length > 0 && <div style={{ fontSize: 10, color: "#6366F1" }}>{item.variantCombination.join(" · ")}</div>}
        {(item.images || []).length > 0 && (
          <div style={{ marginTop: 4 }}><ProductImageStrip images={item.images} size={34} /></div>
        )}
        <AvailabilityNote item={item} />
      </td>
      <td style={{ padding: "5px 10px 5px 0", fontSize: 11, color: C.textSub, whiteSpace: "nowrap" }}>{fmtNum(item.requestedQty)} {item.unit}</td>
      <td style={{ padding: "5px 10px 5px 0", fontSize: 11, color: "#059669", fontWeight: 500, whiteSpace: "nowrap", verticalAlign: "top" }}>
        {fmtNum(issued)} {item.unit}
        {issued > 0 && (
          <div style={{ width: 60, height: 3, background: C.borderLight, borderRadius: 2, marginTop: 3 }}>
            <div style={{ height: 3, borderRadius: 2, background: pct >= 100 ? "#10B981" : "#D97706", width: `${pct}%` }} />
          </div>
        )}
      </td>
      <td style={{ padding: "5px 0", fontSize: 10, fontWeight: 600, color: ITEM_COLOR[item.itemStatus] || C.textMuted }}>{item.itemStatus}</td>
    </tr>
  )
}

function MrfCard({ mrf, onOpenChat, onCancel }) {
  const [expanded, setExpanded] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelNote, setCancelNote] = useState("")
  const [cancelError, setCancelError] = useState("")
  const [busy, setBusy] = useState(false)
  const isTime = mrf.requestType === "TIME_BASED"
  const days = isTime ? daysFromNow(mrf.deadline) : null
  const overdue = isTime && days !== null && days < 0 && mrf.items.some(i => ["ISSUED", "OVERDUE", "PARTIALLY_RETURNED"].includes(i.itemStatus))
  const st = STATUS[mrf.status] || STATUS.PENDING

  return (
    <div style={{ background: C.white, border: `1px solid ${overdue ? "#FECACA" : C.border}`, borderLeft: `3px solid ${st.dot}`, marginBottom: 8, fontFamily: FONT }}>
      <div style={{ padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.primary, fontFamily: "monospace" }}>{mrf.mrfNumber}</span>
          <StatusBadge status={mrf.status} />
          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: isTime ? C.primaryLight : C.surface, border: `1px solid ${isTime ? C.primaryBorder : C.border}`, color: isTime ? C.primary : C.textSub }}>
            {isTime ? "Time-Based" : "Uses-Based"}
          </span>
          {mrf.priority && mrf.priority !== "NORMAL" && (
            <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, fontWeight: 600, background: mrf.priority === "URGENT" ? C.redLight : mrf.priority === "HIGH" ? "#FFF7ED" : C.surface, border: `1px solid ${mrf.priority === "URGENT" ? C.redBorder : mrf.priority === "HIGH" ? "#FED7AA" : C.border}`, color: mrf.priority === "URGENT" ? C.red : mrf.priority === "HIGH" ? "#92400E" : C.textSub }}>
              {mrf.priority}
            </span>
          )}
          {overdue && <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, fontWeight: 600, background: C.redLight, border: `1px solid ${C.redBorder}`, color: C.red }}>Overdue</span>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 3 }}>
          <span style={{ fontSize: 11, color: C.textMuted }}>Raised {relTime(mrf.createdAt)} ({fmtDateTime(mrf.createdAt)})</span>
          {/* When it's needed in hand — everyone on the request sees this. */}
          {mrf.neededBy && <NeededByText neededBy={mrf.neededBy} />}
          {isTime && mrf.deadline && <DeadlineText deadline={mrf.deadline} />}
          <span style={{ fontSize: 11, color: C.textMuted }}>{mrf.items.length} item{mrf.items.length !== 1 ? "s" : ""}</span>
        </div>

        {mrf.reason && (
          <div style={{ fontSize: 11, color: C.textSub, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 500 }}>
            Purpose: {mrf.reason}
          </div>
        )}

        {/* Situation, next action and who acted last — all from the backend
            so it matches exactly what the TL and Store are being told. */}
        <MrfContextBanner context={mrf.context} style={{ marginTop: 6 }} />

        {mrf.storeNotes && mrf.status !== "REJECTED" && (
          <div style={{ marginTop: 5, padding: "5px 9px", background: C.primaryLight, borderLeft: `3px solid ${C.primary}`, fontSize: 11, color: C.primary }}>
            Store note: {mrf.storeNotes}
          </div>
        )}

        {isTime && (
          <div style={{ marginTop: 8, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Item", "Requested", "Issued", "Returned", "Pending", "Return %", "Status"].map(h => (
                <th key={h} style={{ textAlign: "left", fontSize: 10, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", paddingBottom: 4, paddingRight: h === "Status" ? 0 : 10 }}>{h}</th>
              ))}</tr></thead>
              <tbody>{mrf.items.map((item, i) => <TimeItemRow key={i} item={item} deadline={mrf.deadline} />)}</tbody>
            </table>
          </div>
        )}

        {!isTime && (
          <div style={{ marginTop: 6 }}>
            <button onClick={() => setExpanded(e => !e)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: C.textSub, fontFamily: FONT, padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }}><polyline points="6 9 12 15 18 9" /></svg>
              {expanded ? "Hide items" : `${mrf.items.length} item${mrf.items.length !== 1 ? "s" : ""}`}
            </button>
            {expanded && (
              <div style={{ marginTop: 6, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Item", "Requested", "Issued", "Status"].map(h => (
                    <th key={h} style={{ textAlign: "left", fontSize: 10, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", paddingBottom: 4, paddingRight: h === "Status" ? 0 : 10 }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>{mrf.items.map((item, i) => <UsesItemRow key={i} item={item} />)}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Actions ── */}
        <div style={{ display: "flex", gap: 7, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => onOpenChat(mrf)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.textSub, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>
            Chat with Store
            {mrf.chatMessageCount > 0 && (
              <span style={{ background: C.primary, color: "#fff", borderRadius: 8, padding: "0 5px", fontSize: 9.5, fontWeight: 700 }}>
                {mrf.chatMessageCount}
              </span>
            )}
          </button>

          {/* Cancelling is blocked once material has moved — the backend
              enforces it too, this just avoids offering a dead button. */}
          {["PENDING", "APPROVED"].includes(mrf.status) &&
            !mrf.items.some(i => (i.issuedQty || 0) > 0) && !cancelling && (
              <button
                onClick={() => { setCancelling(true); setCancelError("") }}
                style={{ padding: "5px 10px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}
              >
                Cancel request
              </button>
            )}
        </div>

        {cancelling && (
          <div style={{ marginTop: 8, padding: "9px 11px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5 }}>
            <div style={{ fontSize: 11.5, color: C.textSub, marginBottom: 6 }}>
              {mrf.status === "APPROVED"
                ? "This request is already with the Store — cancelling tells them to stop processing it."
                : "Cancel this request? Your Primary Manager/TL will be told."}
            </div>
            <input
              type="text"
              value={cancelNote}
              onChange={e => setCancelNote(e.target.value)}
              placeholder="Reason (optional)…"
              style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 11.5, fontFamily: FONT, color: C.text, outline: "none", marginBottom: 7 }}
            />
            {cancelError && <div style={{ fontSize: 11, color: C.red, marginBottom: 6 }}>{cancelError}</div>}
            <div style={{ display: "flex", gap: 7, justifyContent: "flex-end" }}>
              <button onClick={() => { setCancelling(false); setCancelNote(""); setCancelError("") }} disabled={busy}
                style={{ padding: "5px 11px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.textSub, fontSize: 11, cursor: "pointer", fontFamily: FONT }}>
                Keep it
              </button>
              <button
                onClick={async () => {
                  setBusy(true); setCancelError("")
                  try {
                    await onCancel(mrf._id, cancelNote.trim())
                    setCancelling(false); setCancelNote("")
                  } catch (e) {
                    setCancelError(e.message || "Could not cancel this request.")
                  } finally { setBusy(false) }
                }}
                disabled={busy}
                style={{ padding: "5px 13px", border: "none", borderRadius: 5, background: busy ? "#FECACA" : C.red, color: "#fff", fontSize: 11, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: FONT }}>
                {busy ? "Cancelling…" : "Confirm Cancel"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Product (raw-item add) request card ─────────────────────────────────────
// Shown inline in My Requests alongside MRFs. A product request goes to the
// TL first — the Store never sees it until then — so the status shown here
// leads with the approval stage, not the store stage.
function ProductRequestCard({ r, onOpenChat }) {
  const awaitingTl = r.approvalStatus === "PENDING_TL"
  const tlRejected = r.approvalStatus === "TL_REJECTED"

  const st = tlRejected
    ? { label: "Rejected by TL", color: C.red, bg: C.redLight, border: C.redBorder }
    : awaitingTl
      ? { label: "Pending TL Approval", color: C.amber, bg: C.amberLight, border: C.amberBorder }
      : r.status === "ADDED"
        ? { label: "Added to Store", color: C.green, bg: C.greenLight, border: C.greenBorder }
        : r.status === "MATCHED"
          ? { label: "Matched to Existing Item", color: C.primary, bg: C.primaryLight, border: C.primaryBorder }
          : r.status === "RESOLVED"
            ? { label: "Resolved", color: C.green, bg: C.greenLight, border: C.greenBorder }
            : r.status === "REJECTED"
              ? { label: "Rejected", color: C.red, bg: C.redLight, border: C.redBorder }
              : { label: "With Store", color: C.primary, bg: C.primaryLight, border: C.primaryBorder }

  // Same plain-English treatment MRFs get, for the same reason.
  const explain = tlRejected
    ? `Your Primary Manager/TL rejected this request.${r.tlRejectionNote ? ` Reason: "${r.tlRejectionNote}"` : ""}`
    : awaitingTl
      ? `Waiting for approval from ${r.approverName || "your Primary Manager/TL"}. The Store will only see it once approved.`
      : r.autoForwarded
        ? (r.autoForwardReason || "No Primary Manager/TL could be identified, so this went straight to the Store.")
        : r.status === "RESOLVED" || r.status === "ADDED" || r.status === "MATCHED"
          ? "The Store has handled this — check My Requests for the material request it created."
          : `Approved by ${r.tlApprovedByName || "your Primary Manager/TL"} — the Store is checking whether this already exists in inventory or needs registering.`

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderLeft: `3px solid ${st.color}`, marginBottom: 8, padding: "10px 14px", fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 4, fontWeight: 700, background: C.purpleLight, border: `1px solid ${C.purpleBorder}`, color: C.purple }}>
          New Product
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{r.products.length} product{r.products.length !== 1 ? "s" : ""} requested</span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>{st.label}</span>
        <span style={{ fontSize: 11, color: C.textMuted }}>{relTime(r.createdAt)}</span>
      </div>

      {r.neededBy && (
        <div style={{ fontSize: 11, color: C.text, marginBottom: 5 }}>
          <strong>Needed by:</strong> {fmtDate(r.neededBy)}
        </div>
      )}

      <div style={{ padding: "7px 10px", background: st.bg, border: `1px solid ${st.border}`, borderRadius: 5, fontSize: 11.5, color: st.color, lineHeight: 1.45, marginBottom: 7 }}>
        {explain}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: (r.storeNote || r.matchedTo?.name) ? 6 : 0 }}>
        {r.products.map((p, i) => (
          <div key={i} style={{ fontSize: 12, color: C.textSub }}>
            • <strong style={{ color: C.text }}>{p.itemName}</strong>
            {p.category && <span style={{ color: C.textMuted }}> · {p.category}</span>}
            {p.requestedQty ? <span style={{ color: C.text }}> · {fmtNum(p.requestedQty)} {p.unit || ""}</span> : null}
            {p.attributes?.length > 0 && <span style={{ color: "#6366F1" }}> · {p.attributes.length} attribute{p.attributes.length !== 1 ? "s" : ""}</span>}
            {(p.images || []).length > 0 && (
              <div style={{ marginTop: 4, marginLeft: 10 }}>
                <ProductImageStrip images={p.images} size={40} />
              </div>
            )}
          </div>
        ))}
      </div>
      {r.matchedTo?.name && (
        <div style={{ padding: "6px 9px", background: C.primaryLight, borderLeft: `3px solid ${C.primary}`, fontSize: 11, color: C.primary, marginBottom: r.storeNote ? 6 : 0 }}>
          Linked to: <strong>{r.matchedTo.name}</strong>{r.matchedTo.sku && ` (${r.matchedTo.sku})`}
        </div>
      )}
      {r.storeNote && (
        <div style={{ padding: "6px 9px", background: r.status === "REJECTED" ? C.redLight : C.primaryLight, borderLeft: `3px solid ${r.status === "REJECTED" ? C.red : C.primary}`, fontSize: 11, color: r.status === "REJECTED" ? C.red : C.primary }}>
          Store: {r.storeNote}
        </div>
      )}

      {/* Every request has its own thread — same as MRFs. */}
      <div style={{ display: "flex", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
        <button
          onClick={() => onOpenChat?.(r)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.textSub, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>
          {awaitingTl ? "Chat with your TL" : "Chat with Store"}
          {r.chatMessageCount > 0 && (
            <span style={{ background: C.primary, color: "#fff", borderRadius: 8, padding: "0 5px", fontSize: 9.5, fontWeight: 700 }}>
              {r.chatMessageCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}


function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "32px 0", color: C.textMuted, fontFamily: FONT }}>
      <style>{`@keyframes coMrfSpin{to{transform:rotate(360deg)}}`}</style>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" style={{ animation: "coMrfSpin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
      <span style={{ fontSize: 12 }}>Loading…</span>
    </div>
  )
}

export default function MRFPage() {
  const { role, employeeName, employeeId, loading: authLoading } = useCoworkAuth()

  // Ask/refresh push subscription once the cowork session is authenticated
  useEffect(() => {
    if (!authLoading && employeeId) {
      initPushNotifications().then(r => console.log("[cowork-push-init]", r))
    }
  }, [authLoading, employeeId])

  // "mrf" | "approvals" | "product-requests".
  // Approvals is a tab here rather than its own page so a TL's own requests
  // and the ones they approve live in one place.
  const [tab, setTab] = useState("mrf")

  // Approvals queue (only loaded for TL/CEO) — MRFs and product requests
  const [approvals, setApprovals] = useState([])
  const [approvalProductRequests, setApprovalProductRequests] = useState([])
  const [approvalStats, setApprovalStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 })
  const [approvalStatus, setApprovalStatus] = useState("PENDING")
  const [approvalsLoading, setApprovalsLoading] = useState(false)
  const [approvalsError, setApprovalsError] = useState("")

  const [mrfs, setMrfs] = useState([])
  const [loading, setLoading] = useState(true)

  const [productRequests, setProductRequests] = useState([])
  const [prLoading, setPrLoading] = useState(false)

  const [filterStatus, setFilterStatus] = useState("")
  const [filterType, setFilterType] = useState("")
  const [filterPriority, setFilterPriority] = useState("")

  const [showDrawer, setShowDrawer] = useState(false)
  const [drawerMode, setDrawerMode] = useState("mrf") // "mrf" | "add-product"

  // MRF form state
  const [requestType, setRequestType] = useState("USES_BASED")
  const [deadline, setDeadline] = useState("")
  // When the requester needs the material in hand. Applies to both request
  // kinds, and is separate from `deadline` (the TIME_BASED return date).
  const [neededBy, setNeededBy] = useState("")
  const [reason, setReason] = useState("")
  const [priority, setPriority] = useState("NORMAL")
  const [cartItems, setCartItems] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState("")
  const [formSuccess, setFormSuccess] = useState("")

  const [rawItems, setRawItems] = useState([])
  const [rawSearch, setRawSearch] = useState("")
  const [rawLoading, setRawLoading] = useState(false)
  const [selRawForVariant, setSelRawForVariant] = useState(null)
  const [searchedNoResult, setSearchedNoResult] = useState(false)
  const rawTimer = useRef(null)

  // Which request's chat sidebar is open, and which kind it is — material
  // requests and new-product requests each have their own thread, served from
  // different endpoints but rendered by the same sidebar.
  const [chatMrf, setChatMrf] = useState(null)
  const [chatType, setChatType] = useState("MRF")
  const openMrfChat = (m) => { setChatType("MRF"); setChatMrf(m) }
  const openProductRequestChat = (r) => { setChatType("PRODUCT_REQUEST"); setChatMrf(r) }

  // Who approves this person's requests — surfaced in the drawer so they know
  // where the request is going before they fill the form, and hear about a
  // missing HR reporting link up front rather than after submitting.
  const [approverInfo, setApproverInfo] = useState(null)

  // Add-product form state — attribute/value structure (mirrors store RawItemForm)
  const [newProducts, setNewProducts] = useState([
    { itemName: "", category: "", unit: "", notes: "", attributes: [], images: [] }
  ])
  const [rawCategories, setRawCategories] = useState([])
  const [rawUnits, setRawUnits] = useState([])

  useEffect(() => {
    if (!employeeId) return
      ; (async () => {
        const [cats, units, approver] = await Promise.allSettled([
          fetchCategories(), fetchUnits(), fetchMyApprover(),
        ])
        if (cats.status === "fulfilled") setRawCategories(cats.value.categories || [])
        if (units.status === "fulfilled") setRawUnits(units.value.units || [])
        if (approver.status === "fulfilled") setApproverInfo(approver.value)
      })()
  }, [employeeId])

  useEffect(() => {
    clearTimeout(rawTimer.current)
    if (rawSearch.trim().length < 1) { setRawItems([]); setSearchedNoResult(false); return }
    rawTimer.current = setTimeout(() => searchRawItems(rawSearch), 300)
    return () => clearTimeout(rawTimer.current)
  }, [rawSearch])

  useEffect(() => { if (employeeId) fetchMRFs() }, [filterStatus, filterType, filterPriority, employeeId])
  // Product requests show inline in My Requests, so they load with the page
  // rather than only when a separate tab is opened.
  useEffect(() => { if (employeeId) fetchProductRequests() }, [employeeId])

  // Only TLs and the CEO have an approval queue.
  const canApprove = role === "tl" || role === "ceo"

  // Land on Approvals when a notification deep-links here.
  useEffect(() => {
    if (typeof window === "undefined" || !canApprove) return
    const t = new URLSearchParams(window.location.search).get("tab")
    if (t === "approvals") setTab("approvals")
  }, [canApprove])

  // Keep the pending badge live even while the user is on another tab.
  useEffect(() => {
    if (employeeId && canApprove) fetchApprovals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, canApprove, approvalStatus, tab])

  const fetchMRFs = async () => {
    if (!employeeId) return
    setLoading(true)
    try {
      const d = await listMyMrfs({
        status: filterStatus, requestType: filterType, priority: filterPriority,
      })
      setMrfs(d.mrfs || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const fetchProductRequests = async () => {
    setPrLoading(true)
    try {
      const d = await listProductRequests()
      setProductRequests(d.requests || [])
    } catch (e) { console.error(e) }
    finally { setPrLoading(false) }
  }

  const searchRawItems = async (q) => {
    setRawLoading(true)
    try {
      const d = await apiSearchRawItems(q)
      setRawItems(d.rawItems || [])
      setSearchedNoResult((d.rawItems || []).length === 0)
    } catch { } finally { setRawLoading(false) }
  }

  const handleCancelMrf = async (id, note) => {
    await cancelMrf(id, note)
    await fetchMRFs()
  }

  const fetchApprovals = async () => {
    setApprovalsLoading(true); setApprovalsError("")
    try {
      const d = await listApprovals({ status: approvalStatus, limit: 50 })
      setApprovals(d.mrfs || [])
      setApprovalProductRequests(d.productRequests || [])
      setApprovalStats(d.stats || {})
    } catch (e) {
      setApprovalsError(e.message || "Could not load your approval queue.")
    } finally { setApprovalsLoading(false) }
  }

  // A decided request leaves the Pending list straight away rather than
  // lingering until the next refresh. The id may belong to either list.
  const handleApprovalDecided = (id) => {
    if (approvalStatus === "PENDING") {
      setApprovals(prev => prev.filter(m => String(m._id) !== String(id)))
      setApprovalProductRequests(prev => prev.filter(r => String(r._id) !== String(id)))
      setApprovalStats(s => ({ ...s, pending: Math.max(0, (s.pending || 1) - 1) }))
      // A product request that was just approved becomes visible to the store
      // and changes state in My Requests too.
      fetchProductRequests()
    } else {
      fetchApprovals()
    }
  }

  const addToCart = (rawItem, variant = null) => {
    const key = `${rawItem._id}-${variant?._id || "base"}`
    if (cartItems.find(c => c._key === key)) return
    const baseUnit = rawItem.baseUnit
    const allUnits = [{ name: baseUnit, isBase: true }, ...(rawItem.conversions || []).map(cv => ({ name: cv.name, isBase: false, factor: cv.factor }))]
    setCartItems(prev => [...prev, {
      _key: key, rawItemId: rawItem._id, rawItemName: rawItem.name, rawItemSku: rawItem.sku,
      variantId: variant?._id || null, variantCombination: variant?.combination || [],
      requestedQty: "", unit: baseUnit, baseUnit, allUnits,
      availQty: variant ? variant.quantity : rawItem.quantity, showUnitPicker: false,
      // Product context the TL and Store see alongside the catalogue record.
      description: "", specifications: "", images: [], showDetails: false,
    }])
    setRawSearch(""); setRawItems([]); setSelRawForVariant(null); setSearchedNoResult(false)
  }

  const updateCart = (key, field, value) => setCartItems(prev => prev.map(c => c._key === key ? { ...c, [field]: value } : c))

  const resetForm = () => {
    setRequestType("USES_BASED"); setDeadline(""); setNeededBy(""); setReason(""); setPriority("NORMAL")
    setCartItems([]); setRawSearch(""); setRawItems([]); setSelRawForVariant(null); setFormError("")
    setSearchedNoResult(false)
  }
  const resetProductForm = () => {
    setNewProducts([{ itemName: "", category: "", unit: "", notes: "", attributes: [], images: [] }])
    setFormError(""); setFormSuccess("")
  }

  const openMrfDrawer = () => { resetForm(); setDrawerMode("mrf"); setShowDrawer(true) }
  const openAddProductDrawer = () => { resetForm(); resetProductForm(); setDrawerMode("add-product"); setShowDrawer(true) }
  const openRequestDrawer = () => { resetForm(); resetProductForm(); setDrawerMode("mrf"); setShowDrawer(true) }
  const handleSubmit = async () => {
    setFormError(""); setFormSuccess("")
    if (!cartItems.length) { setFormError("Add at least one item."); return }
    for (const c of cartItems) {
      if (!c.requestedQty || parseFloat(c.requestedQty) <= 0) { setFormError(`Enter quantity for ${c.rawItemName}.`); return }
    }
    if (requestType === "TIME_BASED" && !deadline) { setFormError("Select a return deadline."); return }
    if (!reason.trim()) { setFormError("Enter a reason / purpose."); return }
    setSubmitting(true)
    try {
      const d = await createMrf({
        requestType, deadline: deadline || null, neededBy: neededBy || null, reason, priority,
        items: cartItems.map(c => ({
          rawItemId: c.rawItemId,
          variantId: c.variantId,
          variantCombination: c.variantCombination,
          requestedQty: parseFloat(c.requestedQty),
          // The unit chosen here is the unit the whole request is tracked in
          // — the Store sees availability and issues against this unit, not
          // the product's catalogue unit.
          unit: c.unit,
          description: c.description || "",
          specifications: c.specifications || "",
          images: c.images || [],
        })),
      })
      // The backend writes the message — it knows whether this went to a TL or
      // straight to the Store, and says so.
      setFormSuccess(d.message || `${d.mrf?.mrfNumber} submitted.`)
      resetForm()
      setTimeout(() => { setShowDrawer(false); setFormSuccess(""); fetchMRFs() }, d.duplicate ? 2600 : 1800)
    } catch (e) {
      setFormError(e.message || "Network error. Please try again.")
    }
    finally { setSubmitting(false) }
  }

  // ── Add-product form helpers ──


  const handleSubmitProductRequest = async () => {
    setFormError(""); setFormSuccess("")
    const cleaned = newProducts.filter(p => p.itemName.trim())
    if (!cleaned.length) { setFormError("Enter at least one product name."); return }
    if (!reason.trim()) { setFormError("Enter a reason / purpose."); return }
    setSubmitting(true)
    try {
      await createProductRequest({ products: cleaned, priority, reason, neededBy: neededBy || null })
      setFormSuccess("Sent to the store for review.")
      resetProductForm()
      setTimeout(() => { setShowDrawer(false); setFormSuccess(""); setTab("product-requests"); fetchProductRequests() }, 1500)
    } catch (e) {
      setFormError(e.message || "Network error. Please try again.")
    }
    finally { setSubmitting(false) }
  }

  if (authLoading) return null

  const clearFilters = () => { setFilterStatus(""); setFilterType(""); setFilterPriority("") }
  const hasFilters = filterStatus || filterType || filterPriority

  const iS = { padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: FONT, color: C.text, background: C.white, outline: "none", width: "100%", boxSizing: "border-box" }
  const fBlue = e => { e.target.style.borderColor = C.primary }
  const fGray = e => { e.target.style.borderColor = C.border }

  return (
    <>
      <style>{`@keyframes coMrfSpin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ padding: "20px 24px", fontFamily: FONT, color: C.text, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" }}>Material Requests</div>
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 3 }}>Request raw materials, or ask the store to register a new product.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={fetchMRFs} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.white, color: C.textSub, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: FONT }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: loading ? "coMrfSpin 1s linear infinite" : "none" }}><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
              Refresh
            </button>
            <button onClick={openRequestDrawer} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", border: "none", borderRadius: 6, background: C.primary, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              New Request
            </button>
          </div>
        </div>

        {/* Tabs */}
        {/* Two tabs only. Product requests are just another kind of request
            the user raised, so they live in My Requests alongside MRFs rather
            than on a separate screen the user has to remember to check. */}
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { key: "mrf", label: "My Requests" },
            ...(canApprove ? [{ key: "approvals", label: "Approvals", badge: approvalStats.pending }] : []),
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "8px 14px", border: "none", borderBottom: `2px solid ${tab === t.key ? C.primary : "transparent"}`, background: "none", fontSize: 12, fontWeight: 600, color: tab === t.key ? C.primary : C.textMuted, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}>
              {t.label}
              {t.badge > 0 && (
                <span style={{ background: "#D97706", color: "#fff", borderRadius: 8, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "mrf" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18 }}>
              {[
                { label: "Total", value: mrfs.length, color: C.text },
                { label: "Pending", value: mrfs.filter(m => m.status === "PENDING").length, color: "#D97706" },
                { label: "Active", value: mrfs.filter(m => ["APPROVED", "PARTIALLY_ISSUED", "ISSUED", "PARTIALLY_RETURNED"].includes(m.status)).length, color: C.primary },
                { label: "Completed", value: mrfs.filter(m => ["COMPLETED", "REJECTED", "CANCELLED"].includes(m.status)).length, color: "#059669" },
              ].map(s => (
                <div key={s.label} style={{ background: C.white, border: `1px solid ${C.border}`, padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, color: C.textMuted }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color, lineHeight: 1.2, marginTop: 2 }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: C.white, border: `1px solid ${C.border}`, padding: "10px 12px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500, marginRight: 2 }}>Filter:</span>
              {[
                { val: filterStatus, set: setFilterStatus, opts: [["", "All Status"], ["PENDING", "Pending"], ["APPROVED", "Approved"], ["ISSUED", "Issued"], ["PARTIALLY_ISSUED", "Partly Issued"], ["PARTIALLY_RETURNED", "Partly Returned"], ["COMPLETED", "Completed"], ["REJECTED", "Rejected"], ["CANCELLED", "Cancelled"]] },
                { val: filterType, set: setFilterType, opts: [["", "All Types"], ["TIME_BASED", "Time-Based"], ["USES_BASED", "Uses-Based"]] },
                { val: filterPriority, set: setFilterPriority, opts: [["", "All Priority"], ["LOW", "Low"], ["NORMAL", "Normal"], ["HIGH", "High"], ["URGENT", "Urgent"]] },
              ].map((f, i) => (
                <select key={i} value={f.val} onChange={e => f.set(e.target.value)} style={{ padding: "5px 9px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, fontFamily: FONT, color: C.text, background: C.white, outline: "none", cursor: "pointer" }}>
                  {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ))}
              {hasFilters && <button onClick={clearFilters} style={{ padding: "5px 10px", border: `1px solid ${C.redBorder}`, borderRadius: 5, background: C.redLight, color: C.red, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: FONT }}>Clear</button>}
            </div>

            {(() => {
              // Both kinds of request the user raised, newest first. Product
              // requests are hidden while a status/type filter is active,
              // since those filters are MRF-specific and would otherwise make
              // product requests look like they ignore the filter.
              const showProductRequests = !hasFilters
              const combined = [
                ...mrfs.map(m => ({ kind: "mrf", at: m.createdAt, data: m })),
                ...(showProductRequests
                  ? productRequests.map(r => ({ kind: "pr", at: r.createdAt, data: r }))
                  : []),
              ].sort((a, b) => new Date(b.at) - new Date(a.at))

              if (loading || prLoading) return <Spinner />

              if (!combined.length) {
                return (
                  <div style={{ textAlign: "center", padding: "52px 0", border: `2px dashed ${C.border}` }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                      {hasFilters ? "No requests match the current filters." : "No requests yet."}
                    </div>
                    {!hasFilters && (
                      <button onClick={openRequestDrawer} style={{ marginTop: 10, padding: "8px 20px", background: C.primary, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
                        + New Request
                      </button>
                    )}
                    {hasFilters && (
                      <button onClick={clearFilters} style={{ marginTop: 10, padding: "6px 16px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.textSub, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>
                        Clear filters
                      </button>
                    )}
                  </div>
                )
              }

              return (
                <div>
                  {combined.map(entry =>
                    entry.kind === "mrf" ? (
                      <MrfCard
                        key={`mrf-${entry.data._id}`}
                        mrf={entry.data}
                        onOpenChat={openMrfChat}
                        onCancel={handleCancelMrf}
                      />
                    ) : (
                      <ProductRequestCard key={`pr-${entry.data._id}`} r={entry.data} onOpenChat={openProductRequestChat} />
                    )
                  )}
                </div>
              )
            })()}
          </>
        )}

        {tab === "approvals" && (
          <>
            <div style={{ padding: "9px 12px", background: C.primaryLight, border: `1px solid ${C.primaryBorder}`, borderRadius: 5, fontSize: 11.5, color: C.primary, marginBottom: 14, lineHeight: 1.45 }}>
              Material requests raised by the people who report to you. Approving sends the
              request <strong>straight to the Store</strong> — there is no Project Manager step.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Awaiting me", value: approvalStats.pending ?? 0, color: "#D97706" },
                { label: "Approved", value: approvalStats.approved ?? 0, color: C.green },
                { label: "Rejected", value: approvalStats.rejected ?? 0, color: C.red },
                { label: "Total", value: approvalStats.total ?? 0, color: C.text },
              ].map(s => (
                <div key={s.label} style={{ background: C.white, border: `1px solid ${C.border}`, padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, color: C.textMuted }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color, lineHeight: 1.2, marginTop: 2 }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: C.white, border: `1px solid ${C.border}`, padding: "10px 12px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500 }}>Show:</span>
              <select
                value={approvalStatus}
                onChange={e => setApprovalStatus(e.target.value)}
                style={{ padding: "5px 9px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, fontFamily: FONT, color: C.text, background: C.white, outline: "none", cursor: "pointer" }}
              >
                {[["PENDING", "Needs my approval"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["ALL", "All"]]
                  .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button onClick={fetchApprovals}
                style={{ padding: "5px 11px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.textSub, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
                Refresh
              </button>
            </div>

            {approvalsError && (
              <div style={{ padding: "9px 12px", background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 5, fontSize: 12, color: C.red, marginBottom: 12 }}>
                {approvalsError}
              </div>
            )}

            {(() => {
              if (approvalsLoading) return <Spinner />

              // Material requests and new-product requests are approved by the
              // same person under the same rules — one queue, newest first.
              const queue = [
                ...approvals.map(m => ({ kind: "mrf", at: m.createdAt, data: m })),
                ...approvalProductRequests.map(r => ({ kind: "pr", at: r.createdAt, data: r })),
              ].sort((a, b) => new Date(b.at) - new Date(a.at))

              if (!queue.length) {
                return (
                  <div style={{ textAlign: "center", padding: "52px 16px", border: `2px dashed ${C.border}` }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 5 }}>
                      {approvalStatus === "PENDING" ? "Nothing waiting on you." : "No requests here."}
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, maxWidth: 460, margin: "0 auto" }}>
                      {approvalStatus === "PENDING"
                        ? "Requests appear here as soon as someone who reports to you raises one — both material requests and requests for new products. If you expected one and it is missing, check that HR has you set as their Primary Manager."
                        : "Try another filter."}
                    </div>
                  </div>
                )
              }

              return (
                <div>
                  {queue.map(entry =>
                    entry.kind === "mrf" ? (
                      <MrfApprovalCard
                        key={`mrf-${entry.data._id}`}
                        mrf={entry.data}
                        onDecided={handleApprovalDecided}
                        onOpenChat={openMrfChat}
                      />
                    ) : (
                      <ProductRequestApprovalCard
                        key={`pr-${entry.data._id}`}
                        request={entry.data}
                        onDecided={handleApprovalDecided}
                        onOpenChat={openProductRequestChat}
                      />
                    )
                  )}
                </div>
              )
            })()}
          </>
        )}

      </div>

      {/* ══════════ DRAWER — MRF or Add-Product, switched by drawerMode ══════════ */}
      {showDrawer && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.22)", zIndex: 999 }} onClick={() => setShowDrawer(false)} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(520px,100vw)", background: C.white, borderLeft: `1px solid ${C.border}`, boxShadow: "-4px 0 20px rgba(0,0,0,0.08)", zIndex: 1000, display: "flex", flexDirection: "column", fontFamily: FONT }}>

            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                  {drawerMode === "mrf" ? "New Material Request" : "Request New Product"}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  {drawerMode === "mrf" ? <>Requesting as <strong>{employeeName}</strong></> : "Ask the store to register item(s) not yet in the system"}
                </div>
                {drawerMode === "mrf" && approverInfo && (
                  <div style={{ fontSize: 10.5, marginTop: 3, color: approverInfo.willAutoForward ? C.amber : C.primary }}>
                    {approverInfo.willAutoForward
                      ? `⚠ ${approverInfo.message}`
                      : `Goes to ${approverInfo.approver?.name} for approval, then the Store.`}
                  </div>
                )}
              </div>
              <button onClick={() => setShowDrawer(false)} style={{ width: 28, height: 28, borderRadius: 5, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSub }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
              {formError && <div style={{ padding: "7px 11px", background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 5, fontSize: 12, color: C.red }}>{formError}</div>}
              {formSuccess && <div style={{ padding: "7px 11px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 5, fontSize: 12, color: "#166534", fontWeight: 600 }}>✓ {formSuccess}</div>}

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Priority</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["NORMAL", "URGENT"].map(p => {
                    const act = priority === p
                    const col = { LOW: [act ? "#F0FDF4" : C.surface, act ? "#86EFAC" : C.border, act ? "#166534" : C.textSub], NORMAL: [act ? C.primaryLight : C.surface, act ? C.primaryBorder : C.border, act ? C.primary : C.textSub], HIGH: [act ? "#FFF7ED" : C.surface, act ? "#FED7AA" : C.border, act ? "#92400E" : C.textSub], URGENT: [act ? C.redLight : C.surface, act ? C.redBorder : C.border, act ? C.red : C.textSub] }[p]
                    return <button key={p} type="button" onClick={() => setPriority(p)} style={{ flex: 1, padding: "6px 0", borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT, border: `1px solid ${col[1]}`, background: col[0], color: col[2] }}>{p}</button>
                  })}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Reason / Purpose *</div>
                <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Production batch #12, R&D sampling…" style={{ ...iS, resize: "none" }} onFocus={fBlue} onBlur={fGray} />
              </div>

              {/* When the material is needed IN HAND. Distinct from the
                  TIME_BASED return deadline below, and shown to the TL and the
                  Store so they can prioritise. */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                  Needed By <span style={{ color: C.textMuted, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>— when do you need this in hand?</span>
                </div>
                <input
                  type="date"
                  value={neededBy}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={e => setNeededBy(e.target.value)}
                  style={iS}
                  onFocus={fBlue}
                  onBlur={fGray}
                />
              </div>

              {drawerMode === "mrf" ? (
                <>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>Request Type *</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[{ value: "USES_BASED", label: "Uses Based", sub: "No fixed return date" }, { value: "TIME_BASED", label: "Time Based", sub: "Must return by deadline" }].map(t => (
                        <button key={t.value} type="button" onClick={() => setRequestType(t.value)} style={{ padding: "9px 11px", borderRadius: 6, textAlign: "left", cursor: "pointer", fontFamily: FONT, border: `2px solid ${requestType === t.value ? C.primary : C.border}`, background: requestType === t.value ? C.primaryLight : C.white }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: requestType === t.value ? C.primary : C.text }}>{t.label}</div>
                          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{t.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {requestType === "TIME_BASED" && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Return Deadline *</div>
                      <input type="date" value={deadline} min={new Date().toISOString().split("T")[0]} onChange={e => setDeadline(e.target.value)} style={iS} onFocus={fBlue} onBlur={fGray} />
                    </div>
                  )}

                  <div>

                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Materials Details</div>
                    <div style={{ position: "relative" }}>
                      <div style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                      </div>
                      <input type="text" value={rawSearch} onChange={e => { setRawSearch(e.target.value); setSelRawForVariant(null) }} placeholder="Search material by name or SKU…" style={{ ...iS, paddingLeft: 28 }} onFocus={fBlue} onBlur={fGray} />
                      {rawLoading && <div style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" style={{ animation: "coMrfSpin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg></div>}

                      {rawSearch && !selRawForVariant && rawItems.length > 0 && (
                        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: C.white, border: `1px solid ${C.border}`, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 10, maxHeight: 220, overflowY: "auto" }}>
                          {rawItems.map(item => (
                            <div key={item._id} onClick={() => { item.variants?.length > 0 ? setSelRawForVariant(item) : addToCart(item) }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 11px", cursor: "pointer", borderBottom: `1px solid ${C.borderLight}`, gap: 8 }} onMouseEnter={e => e.currentTarget.style.background = C.surface} onMouseLeave={e => e.currentTarget.style.background = C.white}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                                <div style={{ fontSize: 10, color: C.textMuted }}>{item.sku} · {item.baseUnit}{item.variants?.length > 0 && <span style={{ color: C.primary, marginLeft: 6, fontWeight: 600 }}>{item.variants.length} variants →</span>}</div>
                              </div>
                              <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", background: "#F0FDF4", border: "1px solid #A7F3D0", padding: "2px 6px", flexShrink: 0 }}>{fmtNum(item.quantity)} {item.baseUnit}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Product not found → suggest the Add-Product flow ── */}
                      {searchedNoResult && !rawLoading && rawSearch.trim().length > 0 && (
                        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: C.white, border: `1px solid ${C.purpleBorder}`, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 10, padding: "12px" }}>
                          <p style={{ fontSize: 12, color: C.textSub, marginBottom: 8 }}>
                            No item found for "<strong>{rawSearch}</strong>".
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              const name = rawSearch
                              setShowDrawer(false)
                              setTimeout(() => {
                                resetProductForm()
                                setNewProducts([{ itemName: name, category: "", unit: "", notes: "", attributes: [], images: [] }])
                                setDrawerMode("add-product")
                                setShowDrawer(true)
                              }, 150)
                            }}
                            style={{ width: "100%", padding: "8px", background: C.purple, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                            + Request to Add "{rawSearch}"
                          </button>
                        </div>
                      )}

                      {selRawForVariant && (
                        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: C.white, border: `1px solid ${C.primaryBorder}`, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 10, overflow: "hidden" }}>
                          <div style={{ padding: "8px 11px", background: C.primaryLight, borderBottom: `1px solid ${C.primaryBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>{selRawForVariant.name} — select variant</span>
                            <button onClick={() => { setSelRawForVariant(null); setRawSearch("") }} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          </div>
                          <div style={{ maxHeight: 200, overflowY: "auto" }}>
                            {selRawForVariant.variants.map(v => (
                              <div key={v._id} onClick={() => addToCart(selRawForVariant, v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 11px", cursor: "pointer", borderBottom: `1px solid ${C.borderLight}` }} onMouseEnter={e => e.currentTarget.style.background = C.surface} onMouseLeave={e => e.currentTarget.style.background = C.white}>
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{v.combination?.join(" · ") || "Default"}</div>
                                  <div style={{ fontSize: 10, color: C.textMuted }}>{v.sku}</div>
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", background: "#F0FDF4", border: "1px solid #A7F3D0", padding: "2px 6px" }}>{fmtNum(v.quantity)} {selRawForVariant.baseUnit}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {cartItems.length > 0 ? (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>Items to Request ({cartItems.length})</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {cartItems.map(c => (
                          <div key={c._key} style={{ border: `1px solid ${C.border}`, padding: "10px 11px", background: C.surface }}>
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{c.rawItemName}</div>
                                {c.variantCombination?.length > 0 && <div style={{ fontSize: 10, color: "#6366F1", marginTop: 1 }}>{c.variantCombination.join(" · ")}</div>}
                                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>In stock: <strong style={{ color: "#059669" }}>{fmtNum(c.availQty)} {c.baseUnit}</strong></div>
                              </div>
                              <button onClick={() => setCartItems(p => p.filter(x => x._key !== c._key))} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, flexShrink: 0 }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                              </button>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <input type="number" step="0.01" min="0" value={c.requestedQty} onChange={e => updateCart(c._key, "requestedQty", e.target.value)} onWheel={e => e.currentTarget.blur()} placeholder="Qty" style={{ ...iS, width: 80, padding: "6px 9px" }} onFocus={fBlue} onBlur={fGray} />
                              <div style={{ position: "relative" }}>
                                <button type="button" onClick={() => updateCart(c._key, "showUnitPicker", !c.showUnitPicker)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>
                                  {c.unit}{c.allUnits.length > 1 && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>}
                                </button>
                                {c.showUnitPicker && c.allUnits.length > 1 && (
                                  <div style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, background: C.white, border: `1px solid ${C.border}`, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 20, minWidth: 155 }}>
                                    {c.allUnits.map(u => (
                                      <button key={u.name} type="button" onClick={() => { updateCart(c._key, "unit", u.name); updateCart(c._key, "showUnitPicker", false) }} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 11px", background: c.unit === u.name ? C.primaryLight : C.white, border: "none", borderBottom: `1px solid ${C.borderLight}`, cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: c.unit === u.name ? 700 : 400, color: c.unit === u.name ? C.primary : C.text }}>
                                        <span>{u.name}</span><span style={{ fontSize: 10, color: C.textMuted }}>{u.isBase ? "base" : `×${u.factor}`}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Product detail — description, specs, photos.
                                Collapsed by default so the common case (pick
                                item, type a quantity) stays two clicks. */}
                            <button
                              type="button"
                              onClick={() => updateCart(c._key, "showDetails", !c.showDetails)}
                              style={{ marginTop: 8, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 10.5, fontWeight: 600, color: C.primary, fontFamily: FONT, display: "flex", alignItems: "center", gap: 4 }}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: c.showDetails ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }}><polyline points="6 9 12 15 18 9" /></svg>
                              {c.showDetails ? "Hide product details" : "Add description, specs or photos"}
                              {(c.images?.length > 0 || c.description || c.specifications) && !c.showDetails && (
                                <span style={{ color: C.green, fontWeight: 700 }}>
                                  ✓{c.images?.length ? ` ${c.images.length} photo${c.images.length > 1 ? "s" : ""}` : ""}
                                </span>
                              )}
                            </button>

                            {c.showDetails && (
                              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                                <input
                                  type="text"
                                  value={c.description}
                                  onChange={e => updateCart(c._key, "description", e.target.value)}
                                  placeholder="Description — what exactly do you need?"
                                  style={{ ...iS, padding: "6px 9px", fontSize: 11.5 }}
                                  onFocus={fBlue} onBlur={fGray}
                                />
                                <input
                                  type="text"
                                  value={c.specifications}
                                  onChange={e => updateCart(c._key, "specifications", e.target.value)}
                                  placeholder="Specifications — size, grade, colour, make…"
                                  style={{ ...iS, padding: "6px 9px", fontSize: 11.5 }}
                                  onFocus={fBlue} onBlur={fGray}
                                />
                                <ProductImageUploader
                                  images={c.images || []}
                                  onChange={imgs => updateCart(c._key, "images", imgs)}
                                  label="Photos"
                                  compact
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (!rawSearch && (
                    <div style={{ textAlign: "center", padding: "18px", border: `2px dashed ${C.border}` }}>
                      <div style={{ fontSize: 11, color: C.textMuted }}>Search and add materials above.</div>
                    </div>
                  ))}
                </>
              ) : (
                <AddProductRequestForm
                  products={newProducts}
                  setProducts={setNewProducts}
                  categories={rawCategories}
                  units={rawUnits}
                  formError={formError}
                />

              )}
            </div>

            <div style={{ padding: "11px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 9, flexShrink: 0, background: C.surface }}>
              <button onClick={() => setShowDrawer(false)} style={{ flex: 1, padding: "9px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.white, color: C.text, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
              {drawerMode === "mrf" ? (
                <button onClick={handleSubmit} disabled={submitting || !cartItems.length || !reason.trim()}
                  style={{ flex: 2, padding: "9px", border: "none", borderRadius: 6, background: submitting || !cartItems.length || !reason.trim() ? "#93C5FD" : C.primary, color: "#fff", fontSize: 12, fontWeight: 600, cursor: submitting || !cartItems.length || !reason.trim() ? "not-allowed" : "pointer", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {submitting ? "Submitting…" : "Submit Request"}
                </button>
              ) : (
                <button onClick={handleSubmitProductRequest} disabled={submitting || !newProducts.some(p => p.itemName.trim()) || !reason.trim()}
                  style={{ flex: 2, padding: "9px", border: "none", borderRadius: 6, background: submitting || !newProducts.some(p => p.itemName.trim()) || !reason.trim() ? "#D8B4FE" : C.purple, color: "#fff", fontSize: 12, fontWeight: 600, cursor: submitting || !newProducts.some(p => p.itemName.trim()) || !reason.trim() ? "not-allowed" : "pointer", fontFamily: FONT }}>
                  {submitting ? "Sending…" : "Send to Store"}
                </button>
              )}
            </div>
          </div >
        </>
      )
      }

      {/* Per-request chat with the Store and the approving TL */}
      {chatMrf && (
        <MrfChatSidebar
          mrf={chatMrf}
          subjectType={chatType}
          employeeId={employeeId}
          onClose={() => setChatMrf(null)}
        />
      )}
    </>
  )
}