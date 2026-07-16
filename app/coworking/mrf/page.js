// app/coworking/mrf/page.js
"use client"

import { useState, useEffect, useRef } from "react"
import { useCoworkAuth } from "../../../hooks/useCoworkAuth"
import CoworkingShell from "../../../components/coworking/layout/CoworkingShell"
import AddProductRequestForm from "../../../components/coworking/mrf/AddProductRequestForm"
import { firebaseAuth } from "../../../lib/coworkFirebase"
import { initPushNotifications } from "../../../lib/coworkPushNotifications"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"

async function getAuthHeaders() {
  try {
    const token = await firebaseAuth.currentUser?.getIdToken()
    return token
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" }
  } catch { return { "Content-Type": "application/json" } }
}

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

const fmtDate = (s) => !s ? "—" : new Date(s).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })
const fmtDateTime = (s) => !s ? "—" : new Date(s).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })
const fmtNum = (n) => n == null ? "—" : Number(n).toLocaleString("en-IN", { maximumFractionDigits:3 })
const daysFromNow = (d) => !d ? null : Math.ceil((new Date(d)-new Date())/86400000)
const relTime = (s) => {
  if (!s) return ""
  const m = Math.floor((Date.now()-new Date(s))/60000)
  if (m<1) return "just now"
  if (m<60) return `${m}m ago`
  const h=Math.floor(m/60)
  if (h<24) return `${h}h ago`
  return `${Math.floor(h/24)}d ago`
}

const STATUS = {
  PENDING:            { label:"Pending",          dot:"#F59E0B", text:"#92400E", bg:"#FFFBEB", border:"#FDE68A" },
  APPROVED:           { label:"Approved",         dot:"#3B82F6", text:"#1E40AF", bg:"#EFF6FF", border:"#BFDBFE" },
  PARTIALLY_ISSUED:   { label:"Partly Issued",    dot:"#6366F1", text:"#3730A3", bg:"#EEF2FF", border:"#C7D2FE" },
  ISSUED:             { label:"Issued",           dot:"#10B981", text:"#065F46", bg:"#ECFDF5", border:"#A7F3D0" },
  PARTIALLY_RETURNED: { label:"Partly Returned",  dot:"#8B5CF6", text:"#5B21B6", bg:"#F5F3FF", border:"#DDD6FE" },
  COMPLETED:          { label:"Completed",        dot:"#22C55E", text:"#166534", bg:"#F0FDF4", border:"#BBF7D0" },
  REJECTED:           { label:"Rejected",         dot:"#EF4444", text:"#991B1B", bg:C.redLight, border:C.redBorder },
  CANCELLED:          { label:"Cancelled",        dot:"#9CA3AF", text:"#6B7280", bg:C.surface, border:C.border },
}
const ITEM_COLOR = {
  PENDING:"#B45309", APPROVED:"#1D4ED8", ISSUED:"#065F46",
  PARTIALLY_RETURNED:"#5B21B6", RETURNED:"#6B7280", OVERDUE:"#991B1B", REJECTED:"#DC2626",
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.PENDING
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11, fontWeight:600, padding:"2px 7px", borderRadius:4, background:s.bg, border:`1px solid ${s.border}`, color:s.text }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:s.dot }} />
      {s.label}
    </span>
  )
}

// ── Plain-English "what's happening" line, derived per-MRF from real state ──
function StatusExplainer({ mrf }) {
  const issuedCount   = mrf.items.filter(i => (i.issuedQty || 0) > 0).length
  const returnedCount = mrf.items.filter(i => (i.returnedQty || 0) > 0).length
  const totalItems    = mrf.items.length
  const allIssued     = issuedCount === totalItems && totalItems > 0
  const someIssued     = issuedCount > 0 && !allIssued

  let text, color, bg, border
  if (mrf.status === "PENDING") {
    text = "Waiting for the Project Manager to approve this request."
    color = C.amber; bg = C.amberLight; border = C.amberBorder
  } else if (mrf.status === "REJECTED") {
    text = mrf.rejectionNote
      ? `This request was rejected. Reason: "${mrf.rejectionNote}"`
      : "This request was rejected."
    color = C.red; bg = C.redLight; border = C.redBorder
  } else if (mrf.status === "CANCELLED") {
    text = "You cancelled this request."
    color = C.textMuted; bg = C.surface; border = C.border
  } else if (mrf.status === "APPROVED" && !someIssued && !allIssued) {
    text = "Approved — waiting for the store to hand over the materials."
    color = C.primary; bg = C.primaryLight; border = C.primaryBorder
  } else if (allIssued && returnedCount === 0) {
    text = "All items have been issued to you by the store."
    color = C.green; bg = C.greenLight; border = C.greenBorder
  } else if (someIssued) {
    text = `${issuedCount} of ${totalItems} item(s) issued so far — the rest are still with the store.`
    color = C.primary; bg = C.primaryLight; border = C.primaryBorder
  } else if (mrf.status === "COMPLETED") {
    text = "Completed — all issued items have been returned."
    color = C.green; bg = C.greenLight; border = C.greenBorder
  } else if (mrf.status === "PARTIALLY_RETURNED") {
    text = "Some issued items have been returned; the rest are still with you."
    color = C.purple; bg = C.purpleLight; border = C.purpleBorder
  } else {
    text = "Status updated."
    color = C.textSub; bg = C.surface; border = C.border
  }

  return (
    <div style={{ marginTop:6, padding:"7px 10px", background:bg, border:`1px solid ${border}`, borderRadius:5, fontSize:12, color, fontWeight:500, lineHeight:1.4 }}>
      {text}
    </div>
  )
}

function DeadlineText({ deadline }) {
  const days = daysFromNow(deadline)
  if (days === null) return null
  const overdue = days < 0
  const urgent  = days >= 0 && days <= 2
  const color = overdue ? C.red : urgent ? "#D97706" : C.textMuted
  return (
    <span style={{ fontSize:11, color, fontWeight: overdue || urgent ? 600 : 400 }}>
      Deadline: {fmtDate(deadline)}
      {overdue && ` — overdue ${Math.abs(days)}d`}
      {!overdue && days === 0 && " — due today"}
      {!overdue && days > 0 && ` — ${days}d remaining`}
    </span>
  )
}

function TimeItemRow({ item, deadline }) {
  const issued = item.issuedQty || 0, returned = item.returnedQty || 0
  const pending = Math.max(0, issued - returned)
  const pct = issued > 0 ? Math.round((returned/issued)*100) : 0
  const days = daysFromNow(deadline)
  const isOverdue = item.itemStatus==="OVERDUE" || (days!==null && days<0 && item.itemStatus==="ISSUED")
  return (
    <tr style={{ borderTop:`1px solid ${C.borderLight}`, background: isOverdue?"#FFF5F5":"transparent" }}>
      <td style={{ padding:"5px 10px 5px 0", verticalAlign:"top" }}>
        <div style={{ fontSize:12, fontWeight:500, color:C.text }}>{item.rawItemName}</div>
        {item.variantCombination?.length>0 && <div style={{ fontSize:10, color:"#6366F1" }}>{item.variantCombination.join(" · ")}</div>}
      </td>
      <td style={{ padding:"5px 10px 5px 0", fontSize:11, color:C.textSub, whiteSpace:"nowrap", verticalAlign:"top" }}>{fmtNum(item.requestedQty)} {item.unit}</td>
      <td style={{ padding:"5px 10px 5px 0", fontSize:11, color:"#059669", fontWeight:500, verticalAlign:"top" }}>{fmtNum(issued)}</td>
      <td style={{ padding:"5px 10px 5px 0", fontSize:11, color:"#2563EB", verticalAlign:"top" }}>{fmtNum(returned)}</td>
      <td style={{ padding:"5px 10px 5px 0", fontSize:11, fontWeight:500, verticalAlign:"top", color: pending>0 ? (isOverdue?"#DC2626":"#D97706") : C.textMuted }}>{fmtNum(pending)}</td>
      <td style={{ padding:"5px 12px 5px 0", verticalAlign:"middle", width:60 }}>
        {issued>0 && (
          <div style={{ height:3, background:C.borderLight, borderRadius:2 }}>
            <div style={{ height:3, borderRadius:2, background: pct>=100?"#10B981":isOverdue?"#EF4444":"#3B82F6", width:`${pct}%` }} />
          </div>
        )}
      </td>
      <td style={{ padding:"5px 0", verticalAlign:"top" }}>
        <span style={{ fontSize:10, fontWeight:600, color: isOverdue?C.red:(ITEM_COLOR[item.itemStatus]||C.textMuted) }}>{isOverdue?"OVERDUE":item.itemStatus}</span>
      </td>
    </tr>
  )
}

function UsesItemRow({ item }) {
  return (
    <tr style={{ borderTop:`1px solid ${C.borderLight}` }}>
      <td style={{ padding:"5px 10px 5px 0", verticalAlign:"top" }}>
        <div style={{ fontSize:12, fontWeight:500, color:C.text }}>{item.rawItemName}</div>
        {item.variantCombination?.length>0 && <div style={{ fontSize:10, color:"#6366F1" }}>{item.variantCombination.join(" · ")}</div>}
      </td>
      <td style={{ padding:"5px 10px 5px 0", fontSize:11, color:C.textSub, whiteSpace:"nowrap" }}>{fmtNum(item.requestedQty)} {item.unit}</td>
      <td style={{ padding:"5px 0", fontSize:10, fontWeight:600, color:ITEM_COLOR[item.itemStatus]||C.textMuted }}>{item.itemStatus}</td>
    </tr>
  )
}

function MrfCard({ mrf }) {
  const [expanded, setExpanded] = useState(false)
  const isTime  = mrf.requestType==="TIME_BASED"
  const days    = isTime ? daysFromNow(mrf.deadline) : null
  const overdue = isTime && days!==null && days<0 && mrf.items.some(i=>["ISSUED","OVERDUE","PARTIALLY_RETURNED"].includes(i.itemStatus))
  const st = STATUS[mrf.status]||STATUS.PENDING

  return (
    <div style={{ background:C.white, border:`1px solid ${overdue?"#FECACA":C.border}`, borderLeft:`3px solid ${st.dot}`, marginBottom:8, fontFamily:FONT }}>
      <div style={{ padding:"10px 14px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
          <span style={{ fontSize:12, fontWeight:700, color:C.primary, fontFamily:"monospace" }}>{mrf.mrfNumber}</span>
          <StatusBadge status={mrf.status} />
          <span style={{ fontSize:11, padding:"2px 7px", borderRadius:4, background:isTime?C.primaryLight:C.surface, border:`1px solid ${isTime?C.primaryBorder:C.border}`, color:isTime?C.primary:C.textSub }}>
            {isTime?"Time-Based":"Uses-Based"}
          </span>
          {mrf.priority && mrf.priority!=="NORMAL" && (
            <span style={{ fontSize:11, padding:"2px 7px", borderRadius:4, fontWeight:600, background: mrf.priority==="URGENT"?C.redLight:mrf.priority==="HIGH"?"#FFF7ED":C.surface, border:`1px solid ${mrf.priority==="URGENT"?C.redBorder:mrf.priority==="HIGH"?"#FED7AA":C.border}`, color: mrf.priority==="URGENT"?C.red:mrf.priority==="HIGH"?"#92400E":C.textSub }}>
              {mrf.priority}
            </span>
          )}
          {overdue && <span style={{ fontSize:11, padding:"2px 7px", borderRadius:4, fontWeight:600, background:C.redLight, border:`1px solid ${C.redBorder}`, color:C.red }}>Overdue</span>}
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap", marginBottom:3 }}>
          <span style={{ fontSize:11, color:C.textMuted }}>Raised {relTime(mrf.createdAt)} ({fmtDateTime(mrf.createdAt)})</span>
          {isTime && mrf.deadline && <DeadlineText deadline={mrf.deadline} />}
          <span style={{ fontSize:11, color:C.textMuted }}>{mrf.items.length} item{mrf.items.length!==1?"s":""}</span>
        </div>

        {mrf.reason && (
          <div style={{ fontSize:11, color:C.textSub, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:500 }}>
            Purpose: {mrf.reason}
          </div>
        )}

        {/* ── Plain-English status explainer — the main fix ── */}
        <StatusExplainer mrf={mrf} />

        {mrf.storeNotes && mrf.status!=="REJECTED" && (
          <div style={{ marginTop:5, padding:"5px 9px", background:C.primaryLight, borderLeft:`3px solid ${C.primary}`, fontSize:11, color:C.primary }}>
            Store note: {mrf.storeNotes}
          </div>
        )}

        {isTime && (
          <div style={{ marginTop:8, overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>{["Item","Requested","Issued","Returned","Pending","Return %","Status"].map(h=>(
                <th key={h} style={{ textAlign:"left", fontSize:10, color:C.textMuted, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em", paddingBottom:4, paddingRight:h==="Status"?0:10 }}>{h}</th>
              ))}</tr></thead>
              <tbody>{mrf.items.map((item,i)=><TimeItemRow key={i} item={item} deadline={mrf.deadline} />)}</tbody>
            </table>
          </div>
        )}

        {!isTime && (
          <div style={{ marginTop:6 }}>
            <button onClick={()=>setExpanded(e=>!e)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:C.textSub, fontFamily:FONT, padding:0, display:"flex", alignItems:"center", gap:4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform:expanded?"rotate(180deg)":"rotate(0)", transition:"transform 0.15s" }}><polyline points="6 9 12 15 18 9"/></svg>
              {expanded?"Hide items":`${mrf.items.length} item${mrf.items.length!==1?"s":""}`}
            </button>
            {expanded && (
              <div style={{ marginTop:6, overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead><tr>{["Item","Requested","Status"].map(h=>(
                    <th key={h} style={{ textAlign:"left", fontSize:10, color:C.textMuted, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em", paddingBottom:4, paddingRight:h==="Status"?0:10 }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>{mrf.items.map((item,i)=><UsesItemRow key={i} item={item}/>)}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Product (raw-item add) request card ─────────────────────────────────────
function ProductRequestCard({ r }) {
  const st = r.status === "ADDED"
    ? { label:"Added to Store", color:C.green, bg:C.greenLight, border:C.greenBorder }
    : r.status === "REJECTED"
    ? { label:"Rejected", color:C.red, bg:C.redLight, border:C.redBorder }
    : { label:"Pending Review", color:C.amber, bg:C.amberLight, border:C.amberBorder }
  return (
    <div style={{ background:C.white, border:`1px solid ${C.border}`, borderLeft:`3px solid ${st.color}`, marginBottom:8, padding:"10px 14px", fontFamily:FONT }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:6 }}>
        <span style={{ fontSize:11, fontWeight:700, color:C.text }}>{r.products.length} product{r.products.length!==1?"s":""} requested</span>
        <span style={{ fontSize:11, fontWeight:600, padding:"2px 7px", borderRadius:4, background:st.bg, border:`1px solid ${st.border}`, color:st.color }}>{st.label}</span>
        <span style={{ fontSize:11, color:C.textMuted }}>{relTime(r.createdAt)}</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom: r.storeNote ? 6 : 0 }}>
        {r.products.map((p,i)=>(
          <div key={i} style={{ fontSize:12, color:C.textSub }}>
            • <strong style={{ color:C.text }}>{p.itemName}</strong>
            {p.category && <span style={{ color:C.textMuted }}> · {p.category}</span>}
            {p.variants?.length>0 && <span style={{ color:"#6366F1" }}> · {p.variants.length} variant{p.variants.length!==1?"s":""}</span>}
          </div>
        ))}
      </div>
      {r.storeNote && (
        <div style={{ padding:"6px 9px", background: r.status==="REJECTED"?C.redLight:C.primaryLight, borderLeft:`3px solid ${r.status==="REJECTED"?C.red:C.primary}`, fontSize:11, color: r.status==="REJECTED"?C.red:C.primary }}>
          Store: {r.storeNote}
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"32px 0", color:C.textMuted, fontFamily:FONT }}>
      <style>{`@keyframes coMrfSpin{to{transform:rotate(360deg)}}`}</style>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" style={{ animation:"coMrfSpin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
      <span style={{ fontSize:12 }}>Loading…</span>
    </div>
  )
}

export default function MRFPage() {
  const { role, employeeName, employeeId, loading:authLoading } = useCoworkAuth()

  // Ask/refresh push subscription once the cowork session is authenticated
  useEffect(() => {
    if (!authLoading && employeeId) {
      initPushNotifications().then(r => console.log("[cowork-push-init]", r))
    }
  }, [authLoading, employeeId])

  const [tab, setTab] = useState("mrf") // "mrf" | "product-requests"

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

  // Add-product form state — attribute/value structure (mirrors store RawItemForm)
  const [newProducts, setNewProducts] = useState([
    { itemName:"", category:"", unit:"", notes:"", attributes:[] }
  ])
  const [rawCategories, setRawCategories] = useState([])
  const [rawUnits, setRawUnits] = useState([])

  useEffect(() => {
    if (!employeeId) return
    ;(async () => {
      try {
        const headers = await getAuthHeaders()
        const [catRes, unitRes] = await Promise.all([
          fetch(`${API_URL}/api/cowork/mrf/data/categories`, { headers }),
          fetch(`${API_URL}/api/cowork/mrf/data/units`, { headers }),
        ])
        const catData = await catRes.json()
        const unitData = await unitRes.json()
        if (catData.success) setRawCategories(catData.categories || [])
        if (unitData.success) setRawUnits(unitData.units || [])
      } catch (e) { console.error(e) }
    })()
  }, [employeeId])

  useEffect(()=>{
    clearTimeout(rawTimer.current)
    if (rawSearch.trim().length<1) { setRawItems([]); setSearchedNoResult(false); return }
    rawTimer.current = setTimeout(()=>searchRawItems(rawSearch),300)
    return ()=>clearTimeout(rawTimer.current)
  },[rawSearch])

  useEffect(()=>{ if(employeeId) fetchMRFs() },[filterStatus,filterType,filterPriority,employeeId])
  useEffect(()=>{ if(employeeId && tab==="product-requests") fetchProductRequests() },[employeeId, tab])

  const fetchMRFs = async () => {
    if (!employeeId) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus)   params.append("status", filterStatus)
      if (filterType)     params.append("requestType", filterType)
      if (filterPriority) params.append("priority", filterPriority)
      const headers = await getAuthHeaders()
      const r = await fetch(`${API_URL}/api/cowork/mrf?${params}`, { headers })
      const d = await r.json()
      if (d.success) setMrfs(d.mrfs||[])
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  const fetchProductRequests = async () => {
    setPrLoading(true)
    try {
      const headers = await getAuthHeaders()
      const r = await fetch(`${API_URL}/api/cowork/mrf/product-requests`, { headers })
      const d = await r.json()
      if (d.success) setProductRequests(d.requests||[])
    } catch(e) { console.error(e) }
    finally { setPrLoading(false) }
  }

  const searchRawItems = async (q) => {
    setRawLoading(true)
    try {
      const headers = await getAuthHeaders()
      const r = await fetch(`${API_URL}/api/cowork/mrf/data/raw-items?search=${encodeURIComponent(q)}`, { headers })
      const d = await r.json()
      if (d.success) {
        setRawItems(d.rawItems||[])
        setSearchedNoResult((d.rawItems||[]).length === 0)
      }
    } catch {} finally { setRawLoading(false) }
  }

  const addToCart = (rawItem, variant=null) => {
    const key = `${rawItem._id}-${variant?._id||"base"}`
    if (cartItems.find(c=>c._key===key)) return
    const baseUnit = rawItem.baseUnit
    const allUnits = [{ name:baseUnit, isBase:true }, ...(rawItem.conversions||[]).map(cv=>({ name:cv.name, isBase:false, factor:cv.factor }))]
    setCartItems(prev=>[...prev, {
      _key:key, rawItemId:rawItem._id, rawItemName:rawItem.name, rawItemSku:rawItem.sku,
      variantId:variant?._id||null, variantCombination:variant?.combination||[],
      requestedQty:"", unit:baseUnit, baseUnit, allUnits,
      availQty:variant?variant.quantity:rawItem.quantity, showUnitPicker:false,
    }])
    setRawSearch(""); setRawItems([]); setSelRawForVariant(null); setSearchedNoResult(false)
  }

  const updateCart = (key,field,value) => setCartItems(prev=>prev.map(c=>c._key===key?{...c,[field]:value}:c))

  const resetForm = () => {
    setRequestType("USES_BASED"); setDeadline(""); setReason(""); setPriority("NORMAL")
    setCartItems([]); setRawSearch(""); setRawItems([]); setSelRawForVariant(null); setFormError("")
    setSearchedNoResult(false)
  }
  const resetProductForm = () => {
    setNewProducts([{ itemName:"", category:"", unit:"", notes:"", attributes:[] }])
    setFormError(""); setFormSuccess("")
  }

  const openMrfDrawer = () => { resetForm(); setDrawerMode("mrf"); setShowDrawer(true) }
  const openAddProductDrawer = () => { resetProductForm(); setDrawerMode("add-product"); setShowDrawer(true) }

  const handleSubmit = async () => {
    setFormError(""); setFormSuccess("")
    if (!cartItems.length) { setFormError("Add at least one item."); return }
    for (const c of cartItems) {
      if (!c.requestedQty||parseFloat(c.requestedQty)<=0) { setFormError(`Enter quantity for ${c.rawItemName}.`); return }
    }
    if (requestType==="TIME_BASED"&&!deadline) { setFormError("Select a return deadline."); return }
    if (!reason.trim()) { setFormError("Enter a reason / purpose."); return }
    setSubmitting(true)
    try {
      const authHeaders = await getAuthHeaders()
      const r = await fetch(`${API_URL}/api/cowork/mrf`, {
        method:"POST", headers:authHeaders,
        body:JSON.stringify({
          requestType, deadline:deadline||null, reason, priority,
          items:cartItems.map(c=>({ rawItemId:c.rawItemId, variantId:c.variantId, variantCombination:c.variantCombination, requestedQty:parseFloat(c.requestedQty), unit:c.unit })),
        }),
      })
      const d = await r.json()
      if (!d.success) { setFormError(d.message||"Failed."); return }
      setFormSuccess(`${d.mrf.mrfNumber} submitted. The Project Manager will review shortly.`)
      resetForm()
      setTimeout(()=>{ setShowDrawer(false); setFormSuccess(""); fetchMRFs() },1800)
    } catch { setFormError("Network error. Please try again.") }
    finally { setSubmitting(false) }
  }

  // ── Add-product form helpers ──
  

  const handleSubmitProductRequest = async () => {
    setFormError(""); setFormSuccess("")
    const cleaned = newProducts.filter(p => p.itemName.trim())
    if (!cleaned.length) { setFormError("Enter at least one product name."); return }
    setSubmitting(true)
    try {
      const authHeaders = await getAuthHeaders()
      const r = await fetch(`${API_URL}/api/cowork/mrf/product-requests`, {
        method:"POST", headers:authHeaders,
        body:JSON.stringify({ products: cleaned }),
      })
      const d = await r.json()
      if (!d.success) { setFormError(d.message||"Failed."); return }
      setFormSuccess("Sent to the store for review.")
      resetProductForm()
      setTimeout(()=>{ setShowDrawer(false); setFormSuccess(""); setTab("product-requests"); fetchProductRequests() },1500)
    } catch { setFormError("Network error. Please try again.") }
    finally { setSubmitting(false) }
  }

  if (authLoading) return null

  const clearFilters = () => { setFilterStatus(""); setFilterType(""); setFilterPriority("") }
  const hasFilters = filterStatus||filterType||filterPriority

  const iS = { padding:"7px 10px", border:`1px solid ${C.border}`, borderRadius:6, fontSize:12, fontFamily:FONT, color:C.text, background:C.white, outline:"none", width:"100%", boxSizing:"border-box" }
  const fBlue = e=>{ e.target.style.borderColor=C.primary }
  const fGray = e=>{ e.target.style.borderColor=C.border }

  return (
    <>
      <style>{`@keyframes coMrfSpin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ padding:"20px 24px", fontFamily:FONT, color:C.text, margin:"0 auto" }}>

        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16, gap:12, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:17, fontWeight:700, color:C.text, letterSpacing:"-0.01em" }}>Material Requests</div>
            <div style={{ fontSize:12, color:C.textSub, marginTop:3 }}>Request raw materials, or ask the store to register a new product.</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={fetchMRFs} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", border:`1px solid ${C.border}`, borderRadius:6, background:C.white, color:C.textSub, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:FONT }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation:loading?"coMrfSpin 1s linear infinite":"none" }}><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              Refresh
            </button>
            <button onClick={openAddProductDrawer} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", border:`1px solid ${C.purpleBorder}`, borderRadius:6, background:C.purpleLight, color:C.purple, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
              Request New Product
            </button>
            <button onClick={openMrfDrawer} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 16px", border:"none", borderRadius:6, background:C.primary, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Request
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:4, borderBottom:`1px solid ${C.border}`, marginBottom:16 }}>
          {[
            { key:"mrf", label:"My Requests" },
            { key:"product-requests", label:`Product Requests${productRequests.length ? ` (${productRequests.length})` : ""}` },
          ].map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              style={{ padding:"8px 14px", border:"none", borderBottom:`2px solid ${tab===t.key?C.primary:"transparent"}`, background:"none", fontSize:12, fontWeight:600, color:tab===t.key?C.primary:C.textMuted, cursor:"pointer", fontFamily:FONT }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "mrf" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:18 }}>
              {[
                { label:"Total",    value:mrfs.length, color:C.text },
                { label:"Pending",  value:mrfs.filter(m=>m.status==="PENDING").length, color:"#D97706" },
                { label:"Active",   value:mrfs.filter(m=>["APPROVED","PARTIALLY_ISSUED","ISSUED","PARTIALLY_RETURNED"].includes(m.status)).length, color:C.primary },
                { label:"Completed",value:mrfs.filter(m=>["COMPLETED","REJECTED","CANCELLED"].includes(m.status)).length, color:"#059669" },
              ].map(s=>(
                <div key={s.label} style={{ background:C.white, border:`1px solid ${C.border}`, padding:"10px 14px" }}>
                  <div style={{ fontSize:11, color:C.textMuted }}>{s.label}</div>
                  <div style={{ fontSize:20, fontWeight:700, color:s.color, lineHeight:1.2, marginTop:2 }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ background:C.white, border:`1px solid ${C.border}`, padding:"10px 12px", marginBottom:16, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              <span style={{ fontSize:11, color:C.textMuted, fontWeight:500, marginRight:2 }}>Filter:</span>
              {[
                { val:filterStatus, set:setFilterStatus, opts:[["","All Status"],["PENDING","Pending"],["APPROVED","Approved"],["ISSUED","Issued"],["PARTIALLY_ISSUED","Partly Issued"],["PARTIALLY_RETURNED","Partly Returned"],["COMPLETED","Completed"],["REJECTED","Rejected"],["CANCELLED","Cancelled"]] },
                { val:filterType, set:setFilterType, opts:[["","All Types"],["TIME_BASED","Time-Based"],["USES_BASED","Uses-Based"]] },
                { val:filterPriority, set:setFilterPriority, opts:[["","All Priority"],["LOW","Low"],["NORMAL","Normal"],["HIGH","High"],["URGENT","Urgent"]] },
              ].map((f,i)=>(
                <select key={i} value={f.val} onChange={e=>f.set(e.target.value)} style={{ padding:"5px 9px", border:`1px solid ${C.border}`, borderRadius:5, fontSize:12, fontFamily:FONT, color:C.text, background:C.white, outline:"none", cursor:"pointer" }}>
                  {f.opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
              ))}
              {hasFilters && <button onClick={clearFilters} style={{ padding:"5px 10px", border:`1px solid ${C.redBorder}`, borderRadius:5, background:C.redLight, color:C.red, fontSize:11, fontWeight:500, cursor:"pointer", fontFamily:FONT }}>Clear</button>}
            </div>

            {loading ? <Spinner /> : mrfs.length===0 ? (
              <div style={{ textAlign:"center", padding:"52px 0", border:`2px dashed ${C.border}` }}>
                <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>
                  {hasFilters?"No requests match the current filters.":"No requests yet."}
                </div>
                {!hasFilters && <button onClick={openMrfDrawer} style={{ marginTop:10, padding:"8px 20px", background:C.primary, color:"#fff", border:"none", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:FONT }}>+ New Request</button>}
                {hasFilters && <button onClick={clearFilters} style={{ marginTop:10, padding:"6px 16px", border:`1px solid ${C.border}`, borderRadius:5, background:C.white, color:C.textSub, fontSize:12, cursor:"pointer", fontFamily:FONT }}>Clear filters</button>}
              </div>
            ) : (
              <div>{mrfs.map(mrf=><MrfCard key={mrf._id} mrf={mrf}/>)}</div>
            )}
          </>
        )}

        {tab === "product-requests" && (
          prLoading ? <Spinner /> : productRequests.length===0 ? (
            <div style={{ textAlign:"center", padding:"52px 0", border:`2px dashed ${C.border}` }}>
              <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>No product requests yet.</div>
              <div style={{ fontSize:12, color:C.textMuted, marginBottom:14 }}>Ask the store to register an item that isn't in the system yet.</div>
              <button onClick={openAddProductDrawer} style={{ padding:"8px 20px", background:C.purple, color:"#fff", border:"none", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:FONT }}>+ Request New Product</button>
            </div>
          ) : (
            <div>{productRequests.map(r=><ProductRequestCard key={r._id} r={r}/>)}</div>
          )
        )}
      </div>

      {/* ══════════ DRAWER — MRF or Add-Product, switched by drawerMode ══════════ */}
      {showDrawer && (
        <>
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.22)", zIndex:999 }} onClick={()=>setShowDrawer(false)}/>
          <div style={{ position:"fixed", top:0, right:0, bottom:0, width:"min(520px,100vw)", background:C.white, borderLeft:`1px solid ${C.border}`, boxShadow:"-4px 0 20px rgba(0,0,0,0.08)", zIndex:1000, display:"flex", flexDirection:"column", fontFamily:FONT }}>

            <div style={{ padding:"14px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:C.text }}>
                  {drawerMode==="mrf" ? "New Material Request" : "Request New Product"}
                </div>
                <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>
                  {drawerMode==="mrf" ? <>Requesting as <strong>{employeeName}</strong></> : "Ask the store to register item(s) not yet in the system"}
                </div>
              </div>
              <button onClick={()=>setShowDrawer(false)} style={{ width:28, height:28, borderRadius:5, border:`1px solid ${C.border}`, background:C.white, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:C.textSub }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ flex:1, overflowY:"auto", padding:"16px 18px", display:"flex", flexDirection:"column", gap:14 }}>
              {formError && <div style={{ padding:"7px 11px", background:C.redLight, border:`1px solid ${C.redBorder}`, borderRadius:5, fontSize:12, color:C.red }}>{formError}</div>}
              {formSuccess && <div style={{ padding:"7px 11px", background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:5, fontSize:12, color:"#166534", fontWeight:600 }}>✓ {formSuccess}</div>}

              {drawerMode === "mrf" ? (
                <>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:7 }}>Request Type *</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                      {[{ value:"USES_BASED", label:"Uses Based", sub:"No fixed return date" }, { value:"TIME_BASED", label:"Time Based", sub:"Must return by deadline" }].map(t=>(
                        <button key={t.value} type="button" onClick={()=>setRequestType(t.value)} style={{ padding:"9px 11px", borderRadius:6, textAlign:"left", cursor:"pointer", fontFamily:FONT, border:`2px solid ${requestType===t.value?C.primary:C.border}`, background:requestType===t.value?C.primaryLight:C.white }}>
                          <div style={{ fontSize:12, fontWeight:700, color:requestType===t.value?C.primary:C.text }}>{t.label}</div>
                          <div style={{ fontSize:10, color:C.textMuted, marginTop:2 }}>{t.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {requestType==="TIME_BASED" && (
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Return Deadline *</div>
                      <input type="date" value={deadline} min={new Date().toISOString().split("T")[0]} onChange={e=>setDeadline(e.target.value)} style={iS} onFocus={fBlue} onBlur={fGray}/>
                    </div>
                  )}

                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>Priority</div>
                    <div style={{ display:"flex", gap:6 }}>
                      {["LOW","NORMAL","HIGH","URGENT"].map(p=>{
                        const act = priority===p
                        const col = { LOW:[act?"#F0FDF4":C.surface,act?"#86EFAC":C.border,act?"#166534":C.textSub], NORMAL:[act?C.primaryLight:C.surface,act?C.primaryBorder:C.border,act?C.primary:C.textSub], HIGH:[act?"#FFF7ED":C.surface,act?"#FED7AA":C.border,act?"#92400E":C.textSub], URGENT:[act?C.redLight:C.surface,act?C.redBorder:C.border,act?C.red:C.textSub] }[p]
                        return <button key={p} type="button" onClick={()=>setPriority(p)} style={{ flex:1, padding:"6px 0", borderRadius:5, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:FONT, border:`1px solid ${col[1]}`, background:col[0], color:col[2] }}>{p}</button>
                      })}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Reason / Purpose *</div>
                    <textarea rows={2} value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Production batch #12, R&D sampling…" style={{ ...iS, resize:"none" }} onFocus={fBlue} onBlur={fGray}/>
                  </div>

                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Add Materials *</div>
                    <div style={{ position:"relative" }}>
                      <div style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      </div>
                      <input type="text" value={rawSearch} onChange={e=>{ setRawSearch(e.target.value); setSelRawForVariant(null) }} placeholder="Search material by name or SKU…" style={{ ...iS, paddingLeft:28 }} onFocus={fBlue} onBlur={fGray}/>
                      {rawLoading && <div style={{ position:"absolute", right:9, top:"50%", transform:"translateY(-50%)" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" style={{ animation:"coMrfSpin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg></div>}

                      {rawSearch && !selRawForVariant && rawItems.length>0 && (
                        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:C.white, border:`1px solid ${C.border}`, boxShadow:"0 4px 12px rgba(0,0,0,0.08)", zIndex:10, maxHeight:220, overflowY:"auto" }}>
                          {rawItems.map(item=>(
                            <div key={item._id} onClick={()=>{ item.variants?.length>0?setSelRawForVariant(item):addToCart(item) }} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 11px", cursor:"pointer", borderBottom:`1px solid ${C.borderLight}`, gap:8 }} onMouseEnter={e=>e.currentTarget.style.background=C.surface} onMouseLeave={e=>e.currentTarget.style.background=C.white}>
                              <div style={{ minWidth:0, flex:1 }}>
                                <div style={{ fontSize:12, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</div>
                                <div style={{ fontSize:10, color:C.textMuted }}>{item.sku} · {item.baseUnit}{item.variants?.length>0&&<span style={{ color:C.primary, marginLeft:6, fontWeight:600 }}>{item.variants.length} variants →</span>}</div>
                              </div>
                              <span style={{ fontSize:10, fontWeight:700, color:"#059669", background:"#F0FDF4", border:"1px solid #A7F3D0", padding:"2px 6px", flexShrink:0 }}>{fmtNum(item.quantity)} {item.baseUnit}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Product not found → suggest the Add-Product flow ── */}
                      {searchedNoResult && !rawLoading && rawSearch.trim().length > 0 && (
                        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:C.white, border:`1px solid ${C.purpleBorder}`, boxShadow:"0 4px 12px rgba(0,0,0,0.08)", zIndex:10, padding:"12px" }}>
                          <p style={{ fontSize:12, color:C.textSub, marginBottom:8 }}>
                            No item found for "<strong>{rawSearch}</strong>".
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              const name = rawSearch
                              setShowDrawer(false)
                              setTimeout(() => {
                                resetProductForm()
                                setNewProducts([{ itemName: name, category:"", unit:"", notes:"", attributes:[] }])
                                setDrawerMode("add-product")
                                setShowDrawer(true)
                              }, 150)
                            }}
                            style={{ width:"100%", padding:"8px", background:C.purple, color:"#fff", border:"none", borderRadius:6, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>
                            + Request to Add "{rawSearch}"
                          </button>
                        </div>
                      )}

                      {selRawForVariant && (
                        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:C.white, border:`1px solid ${C.primaryBorder}`, boxShadow:"0 4px 12px rgba(0,0,0,0.08)", zIndex:10, overflow:"hidden" }}>
                          <div style={{ padding:"8px 11px", background:C.primaryLight, borderBottom:`1px solid ${C.primaryBorder}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                            <span style={{ fontSize:12, fontWeight:700, color:C.primary }}>{selRawForVariant.name} — select variant</span>
                            <button onClick={()=>{ setSelRawForVariant(null); setRawSearch("") }} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMuted }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                          <div style={{ maxHeight:200, overflowY:"auto" }}>
                            {selRawForVariant.variants.map(v=>(
                              <div key={v._id} onClick={()=>addToCart(selRawForVariant,v)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 11px", cursor:"pointer", borderBottom:`1px solid ${C.borderLight}` }} onMouseEnter={e=>e.currentTarget.style.background=C.surface} onMouseLeave={e=>e.currentTarget.style.background=C.white}>
                                <div>
                                  <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{v.combination?.join(" · ")||"Default"}</div>
                                  <div style={{ fontSize:10, color:C.textMuted }}>{v.sku}</div>
                                </div>
                                <span style={{ fontSize:10, fontWeight:700, color:"#059669", background:"#F0FDF4", border:"1px solid #A7F3D0", padding:"2px 6px" }}>{fmtNum(v.quantity)} {selRawForVariant.baseUnit}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {cartItems.length>0 ? (
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:7 }}>Items to Request ({cartItems.length})</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                        {cartItems.map(c=>(
                          <div key={c._key} style={{ border:`1px solid ${C.border}`, padding:"10px 11px", background:C.surface }}>
                            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:7 }}>
                              <div style={{ minWidth:0 }}>
                                <div style={{ fontSize:12, fontWeight:700, color:C.text }}>{c.rawItemName}</div>
                                {c.variantCombination?.length>0 && <div style={{ fontSize:10, color:"#6366F1", marginTop:1 }}>{c.variantCombination.join(" · ")}</div>}
                                <div style={{ fontSize:10, color:C.textMuted, marginTop:2 }}>In stock: <strong style={{ color:"#059669" }}>{fmtNum(c.availQty)} {c.baseUnit}</strong></div>
                              </div>
                              <button onClick={()=>setCartItems(p=>p.filter(x=>x._key!==c._key))} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMuted, flexShrink:0 }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <input type="number" step="0.01" min="0" value={c.requestedQty} onChange={e=>updateCart(c._key,"requestedQty",e.target.value)} onWheel={e=>e.currentTarget.blur()} placeholder="Qty" style={{ ...iS, width:80, padding:"6px 9px" }} onFocus={fBlue} onBlur={fGray}/>
                              <div style={{ position:"relative" }}>
                                <button type="button" onClick={()=>updateCart(c._key,"showUnitPicker",!c.showUnitPicker)} style={{ display:"flex", alignItems:"center", gap:4, padding:"6px 10px", border:`1px solid ${C.border}`, borderRadius:5, background:C.white, fontSize:12, cursor:"pointer", fontFamily:FONT }}>
                                  {c.unit}{c.allUnits.length>1 && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>}
                                </button>
                                {c.showUnitPicker && c.allUnits.length>1 && (
                                  <div style={{ position:"absolute", top:"calc(100% + 3px)", left:0, background:C.white, border:`1px solid ${C.border}`, boxShadow:"0 4px 12px rgba(0,0,0,0.08)", zIndex:20, minWidth:155 }}>
                                    {c.allUnits.map(u=>(
                                      <button key={u.name} type="button" onClick={()=>{ updateCart(c._key,"unit",u.name); updateCart(c._key,"showUnitPicker",false) }} style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 11px", background:c.unit===u.name?C.primaryLight:C.white, border:"none", borderBottom:`1px solid ${C.borderLight}`, cursor:"pointer", fontFamily:FONT, fontSize:12, fontWeight:c.unit===u.name?700:400, color:c.unit===u.name?C.primary:C.text }}>
                                        <span>{u.name}</span><span style={{ fontSize:10, color:C.textMuted }}>{u.isBase?"base":`×${u.factor}`}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (!rawSearch && (
                    <div style={{ textAlign:"center", padding:"18px", border:`2px dashed ${C.border}` }}>
                      <div style={{ fontSize:11, color:C.textMuted }}>Search and add materials above.</div>
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

            <div style={{ padding:"11px 18px", borderTop:`1px solid ${C.border}`, display:"flex", gap:9, flexShrink:0, background:C.surface }}>
              <button onClick={()=>setShowDrawer(false)} style={{ flex:1, padding:"9px", border:`1px solid ${C.border}`, borderRadius:6, background:C.white, color:C.text, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:FONT }}>Cancel</button>
              {drawerMode === "mrf" ? (
                <button onClick={handleSubmit} disabled={submitting||!cartItems.length||!reason.trim()}
                  style={{ flex:2, padding:"9px", border:"none", borderRadius:6, background:submitting||!cartItems.length||!reason.trim()?"#93C5FD":C.primary, color:"#fff", fontSize:12, fontWeight:600, cursor:submitting||!cartItems.length||!reason.trim()?"not-allowed":"pointer", fontFamily:FONT, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                  {submitting ? "Submitting…" : "Submit Request"}
                </button>
              ) : (
                <button onClick={handleSubmitProductRequest} disabled={submitting || !newProducts.some(p=>p.itemName.trim())}
                  style={{ flex:2, padding:"9px", border:"none", borderRadius:6, background:submitting || !newProducts.some(p=>p.itemName.trim()) ? "#D8B4FE" : C.purple, color:"#fff", fontSize:12, fontWeight:600, cursor:submitting?"not-allowed":"pointer", fontFamily:FONT }}>
                  {submitting ? "Sending…" : "Send to Store"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}