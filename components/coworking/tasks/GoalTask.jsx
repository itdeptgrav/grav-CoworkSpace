"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function Modal({ children }) {
  const [m, setM] = useState(false);
  useEffect(() => { setM(true); }, []);
  if (!m) return null;
  return createPortal(children, document.body);
}

async function getToken() {
  const { firebaseAuth } = await import("../../../lib/coworkFirebase");
  return firebaseAuth.currentUser?.getIdToken();
}

function fmtDatetime(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtReadable(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function uploadFileToDrive(file) {
  const token = await getToken();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/cowork/upload/pdf`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "Upload failed");
  return { name: file.name, driveUrl: d.viewUrl || d.url, downloadUrl: d.downloadUrl || d.url, mimeType: file.type, size: file.size };
}

function distributeEqual(comps) {
  const n = comps.length;
  if (!n) return comps;
  const base = +(100 / n).toFixed(2);
  const remainder = +(100 - base * n).toFixed(2);
  return comps.map((c, i) => ({ ...c, percentage: i === n - 1 ? +(base + remainder).toFixed(2) : base }));
}

// ── Design tokens — formal, clean ────────────────────────────────────────────
const T = {
  primary: "#1B4F8A",
  primaryLight: "#EBF2FA",
  primaryBorder: "#BFDBFE",
  success: "#15803D",
  successBg: "#F0FDF4",
  successBorder: "#BBF7D0",
  warning: "#B45309",
  warningBg: "#FFFBEB",
  warningBorder: "#FDE68A",
  danger: "#B91C1C",
  dangerBg: "#FEF2F2",
  dangerBorder: "#FECACA",
  text: "#111827",
  textSub: "#4B5563",
  textMuted: "#9CA3AF",
  border: "#E5E7EB",
  borderMid: "#D1D5DB",
  bg: "#F9FAFB",
  bgAlt: "#F3F4F6",
  white: "#FFFFFF",
  radius: 6,
  shadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const inp = {
  width: "100%", padding: "7px 10px",
  border: `1px solid ${T.border}`, borderRadius: T.radius,
  fontSize: 12, fontFamily: "inherit", color: T.text,
  background: T.white, outline: "none", boxSizing: "border-box",
  transition: "border-color 0.12s",
};

const lbl = {
  fontSize: 10, fontWeight: 600, color: T.textSub,
  textTransform: "uppercase", letterSpacing: "0.05em",
  display: "block", marginBottom: 4,
};

function Btn({ children, onClick, variant = "default", disabled, style: s = {} }) {
  const base = {
    border: "none", borderRadius: T.radius, fontSize: 12, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: 5, transition: "opacity 0.12s", padding: "7px 14px",
    opacity: disabled ? 0.55 : 1, ...s,
  };
  const v = {
    default: { background: T.white, color: T.text, border: `1px solid ${T.borderMid}` },
    primary: { background: T.primary, color: "#fff" },
    success: { background: T.success, color: "#fff" },
    danger: { background: T.danger, color: "#fff" },
    ghost: { background: "transparent", color: T.textSub, border: `1px solid ${T.border}` },
    amber: { background: "#D97706", color: "#fff" },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...(v[variant] || v.default) }}>{children}</button>;
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ icon, title, desc, confirmLabel, confirmVariant = "danger", onConfirm, onCancel }) {
  return (
    <Modal>
      <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
        <div style={{ background: T.white, borderRadius: 8, padding: "24px 20px", width: "100%", maxWidth: 340, boxShadow: "0 4px 24px rgba(0,0,0,0.14)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }} onClick={e => e.stopPropagation()}>
          <span style={{ fontSize: 26 }}>{icon}</span>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: desc }} />
          </div>
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <Btn onClick={onCancel} variant="ghost" style={{ flex: 1, padding: "9px" }}>Cancel</Btn>
            <Btn onClick={onConfirm} variant={confirmVariant} style={{ flex: 1, padding: "9px" }}>{confirmLabel}</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Submit Report Modal ───────────────────────────────────────────────────────
function SubmitReportModal({ comp, idx, taskId, onSuccess, onCancel }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  const handleFiles = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;
    setUploading(true); setErr("");
    try { const u = await Promise.all(picked.map(f => uploadFileToDrive(f))); setFiles(p => [...p, ...u]); }
    catch (err) { setErr(err.message); }
    finally { setUploading(false); }
  };

  const handleSubmit = async () => {
    if (!text.trim() && !files.length) { setErr("Add a note or at least one file."); return; }
    setSubmitting(true); setErr("");
    try {
      const token = await getToken();
      const res = await fetch(`${BASE}/cowork/task/${taskId}/goal-activity/${comp.id}/submit-report`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: text.trim(), files }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      onSuccess();
    } catch (err) { setErr(err.message); }
    finally { setSubmitting(false); }
  };

  // Deadline check for display
  const isBeforeDeadline = comp.deadline ? new Date() < new Date(comp.deadline) : null;

  return (
    <Modal>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 99998 }} onClick={onCancel} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(420px,100vw)", background: T.white,
        borderLeft: `1px solid ${T.border}`,
        boxShadow: "-4px 0 20px rgba(0,0,0,0.1)",
        zIndex: 99999, display: "flex", flexDirection: "column",
        fontFamily: "inherit",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Submit Completion Report</div>
            <div style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>
              Node #{idx + 1}: <strong>{comp.heading}</strong>
            </div>
          </div>
          <button onClick={onCancel} style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${T.border}`, background: T.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.textSub, flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Points + deadline info bar */}
        {comp.points > 0 && (
          <div style={{
            padding: "8px 16px", flexShrink: 0,
            background: isBeforeDeadline === true ? T.successBg : isBeforeDeadline === false ? T.dangerBg : T.bg,
            borderBottom: `1px solid ${isBeforeDeadline === true ? T.successBorder : isBeforeDeadline === false ? T.dangerBorder : T.border}`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: isBeforeDeadline === true ? T.success : isBeforeDeadline === false ? T.danger : T.textSub }}>
              {isBeforeDeadline === true
                ? `✓ Submit before deadline — earns ${comp.points} pts credit`
                : isBeforeDeadline === false
                  ? `✗ Past deadline — ${comp.points} pts credit will not apply`
                  : `This node is worth ${comp.points} pts`
              }
            </span>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>Report Notes</label>
            <textarea value={text} onChange={e => setText(e.target.value)}
              placeholder="Describe what was done, findings, outcomes..."
              rows={5} style={{ ...inp, resize: "vertical", lineHeight: 1.6 }}
              onFocus={e => e.target.style.borderColor = T.primary}
              onBlur={e => e.target.style.borderColor = T.border} />
          </div>
          <div>
            <label style={lbl}>Attachments</label>
            <input ref={fileRef} type="file" multiple accept="*/*" onChange={handleFiles} style={{ display: "none" }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ ...inp, textAlign: "center", cursor: "pointer", color: uploading ? T.primary : T.textSub, background: T.bg }}>
              {uploading ? "Uploading…" : "+ Attach files"}
            </button>
            {files.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                {files.map((f, fi) => (
                  <div key={fi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radius }}>
                    <a href={f.driveUrl} target="_blank" rel="noreferrer"
                      style={{ flex: 1, fontSize: 11, color: T.primary, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.name}
                    </a>
                    <button onClick={() => setFiles(p => p.filter((_, i) => i !== fi))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, fontSize: 14 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {err && (
            <div style={{ padding: "7px 10px", background: T.dangerBg, border: `1px solid ${T.dangerBorder}`, borderRadius: T.radius, fontSize: 11, color: T.danger }}>
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "13px 16px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 10, flexShrink: 0, background: T.bg }}>
          <Btn onClick={onCancel} variant="ghost" style={{ flex: 1, padding: "9px" }}>Cancel</Btn>
          <Btn onClick={handleSubmit} disabled={submitting || uploading}
            variant={submitting || uploading ? "ghost" : "success"}
            style={{ flex: 2, padding: "9px" }}>
            {submitting ? "Submitting…" : "Submit Report"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── View Report Modal ─────────────────────────────────────────────────────────
function ViewReportModal({ comp, idx, onClose }) {
  const r = comp.report || {};
  return (
    <Modal>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 99998 }} onClick={onClose} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(420px,100vw)", background: T.white,
        borderLeft: `1px solid ${T.border}`,
        boxShadow: "-4px 0 20px rgba(0,0,0,0.1)",
        zIndex: 99999, display: "flex", flexDirection: "column",
        fontFamily: "inherit",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Submitted Report</div>
            <div style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>
              Node #{idx + 1}: <strong>{comp.heading}</strong>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${T.border}`, background: T.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.textSub, flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: "8px 12px", background: T.successBg, border: `1px solid ${T.successBorder}`, borderRadius: T.radius, fontSize: 11, color: "#166534" }}>
            Submitted by <strong>{r.submittedBy}</strong> · {fmtReadable(r.submittedAt)}
          </div>
          {comp.points > 0 && (
            <div style={{ padding: "8px 12px", background: T.primaryLight, border: `1px solid ${T.primaryBorder}`, borderRadius: T.radius, fontSize: 11, color: T.primary, fontWeight: 600 }}>
              This node is worth <strong>{comp.points} pts</strong> — credited on approval if submitted before deadline
            </div>
          )}
          {r.text && (
            <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "10px 12px", fontSize: 12, color: T.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {r.text}
            </div>
          )}
          {r.files?.length > 0 && (
            <div>
              <label style={lbl}>Attachments ({r.files.length})</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {r.files.map((f, fi) => (
                  <a key={fi} href={f.driveUrl} target="_blank" rel="noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radius, textDecoration: "none" }}>
                    <span style={{ flex: 1, fontSize: 11, color: T.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: T.textMuted }}>↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Footer */}
        <div style={{ padding: "13px 16px", borderTop: `1px solid ${T.border}`, flexShrink: 0, background: T.bg }}>
          <Btn onClick={onClose} variant="ghost" style={{ padding: "9px", width: "100%" }}>Close</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── History Panel ─────────────────────────────────────────────────────────────
function HistoryPanel({ components, onClose }) {
  const allEvents = [];
  components.forEach(comp => (comp.history || []).forEach(h => allEvents.push({ ...h, compHeading: comp.heading })));
  allEvents.sort((a, b) => b.at > a.at ? 1 : -1);

  return (
    <Modal>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 99998, background: "rgba(0,0,0,0.25)" }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 99999, width: "min(360px,100vw)", background: T.white, boxShadow: "-2px 0 16px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Activity History</div>
            <div style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>{allEvents.length} events · {components.length} components</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, fontSize: 18 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
          {allEvents.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: T.textMuted, fontSize: 13 }}>No activity yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {allEvents.map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 16, position: "relative" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.primary, marginTop: 4, flexShrink: 0 }} />
                    {i < allEvents.length - 1 && <div style={{ width: 1, flex: 1, background: T.border, margin: "4px 0" }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 1 }}>{h.label}</div>
                    <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>{fmtReadable(h.at)}</div>
                    <div style={{ fontSize: 10, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.compHeading}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Custom Calendar ───────────────────────────────────────────────────────────
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_H = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function CustomCalendar({ value, onChange, usedDates = [] }) {
  const today = new Date();
  const parsed = value ? new Date(value) : null;
  const [viewYear, setViewYear] = useState(parsed ? parsed.getFullYear() : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed ? parsed.getMonth() : today.getMonth());
  const [hour, setHour] = useState(parsed ? parsed.getHours() : 0);
  const [minute, setMinute] = useState(parsed ? parsed.getMinutes() : 0);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const selectDate = (day) => {
    const pad = n => String(n).padStart(2, "0");
    onChange(`${viewYear}-${pad(viewMonth + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`);
  };

  const updateTime = (h, m) => {
    setHour(h); setMinute(m);
    if (parsed) {
      const pad = n => String(n).padStart(2, "0");
      onChange(`${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(h)}:${pad(m)}`);
    }
  };

  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", background: T.bg, borderBottom: `1px solid ${T.border}` }}>
        <button onClick={prevMonth} style={{ width: 24, height: 24, border: `1px solid ${T.border}`, borderRadius: 4, background: T.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={T.textSub} strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} style={{ width: 24, height: 24, border: `1px solid ${T.border}`, borderRadius: 4, background: T.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={T.textSub} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "5px 8px 2px", gap: 1 }}>
        {DAYS_H.map(d => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: T.textMuted }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 8px 8px", gap: 1 }}>
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
          const isSelected = parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth && parsed.getDate() === day;
          return (
            <div key={day} onClick={() => selectDate(day)}
              style={{
                textAlign: "center", padding: "4px 2px", borderRadius: 4, fontSize: 12, cursor: "pointer",
                fontWeight: isSelected || isToday ? 600 : 400,
                background: isSelected ? T.primary : "transparent",
                color: isSelected ? "#fff" : isToday ? T.primary : T.text,
                border: isToday && !isSelected ? `1px solid ${T.borderMid}` : "1px solid transparent",
              }}>
              {day}
            </div>
          );
        })}
      </div>
      <div style={{ padding: "7px 12px", borderTop: `1px solid ${T.border}`, background: T.bg, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: T.textSub, flexShrink: 0 }}>Time</span>
        <select value={hour} onChange={e => updateTime(Number(e.target.value), minute)}
          style={{ flex: 1, padding: "4px 6px", border: `1px solid ${T.border}`, borderRadius: 4, fontSize: 11, fontFamily: "inherit", color: T.text, background: T.white, outline: "none" }}>
          {Array.from({ length: 24 }).map((_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}</option>)}
        </select>
        <span style={{ fontSize: 12, color: T.textMuted }}>:</span>
        <select value={minute} onChange={e => updateTime(hour, Number(e.target.value))}
          style={{ flex: 1, padding: "4px 6px", border: `1px solid ${T.border}`, borderRadius: 4, fontSize: 11, fontFamily: "inherit", color: T.text, background: T.white, outline: "none" }}>
          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
        </select>
      </div>
      {parsed && (
        <div style={{ padding: "5px 12px", borderTop: `1px solid ${T.border}`, fontSize: 11, color: T.primary, fontWeight: 500 }}>
          {fmtReadable(value)}
        </div>
      )}
    </div>
  );
}

// ── Flow Edit Box — renders as a right-side slider drawer ────────────────────
function FlowEditBox({ idx, comp, onSave, onCancel, isNew, existingDeadlines = [], readonlyDeadline = false }) {
  const [heading, setHeading] = useState(comp.heading || "");
  const [description, setDescription] = useState(comp.description || "");
  const [deadline, setDeadline] = useState(comp.deadline || "");
  const ref = useRef(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 80); }, []);
  const canSave = heading.trim() && description.trim() && deadline;

  return (
    <Modal>
      {/* Backdrop */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.22)", zIndex: 99998 }} onClick={onCancel} />
      {/* Right slider */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(400px,100vw)", background: T.white,
        borderLeft: `1px solid ${T.border}`,
        boxShadow: "-4px 0 20px rgba(0,0,0,0.1)",
        zIndex: 99999, display: "flex", flexDirection: "column",
        fontFamily: "inherit",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 22, height: 22, borderRadius: 5, background: T.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: T.primary, flexShrink: 0 }}>
              {idx + 1}
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{isNew ? "Add Component" : "Edit Component"}</div>
              <div style={{ fontSize: 10, color: T.textSub, marginTop: 1 }}>Node #{idx + 1}</div>
            </div>
          </div>
          <button onClick={onCancel} style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${T.border}`, background: T.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.textSub }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>Heading *</label>
            <input ref={ref} value={heading} onChange={e => setHeading(e.target.value)} placeholder="Component heading"
              style={inp}
              onFocus={e => e.target.style.borderColor = T.primary} onBlur={e => e.target.style.borderColor = T.border} />
          </div>
          <div>
            <label style={lbl}>Description *</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what needs to be done..." rows={4}
              style={{ ...inp, resize: "vertical", lineHeight: 1.6 }}
              onFocus={e => e.target.style.borderColor = T.primary} onBlur={e => e.target.style.borderColor = T.border} />
          </div>
          <div>
            <label style={lbl}>Deadline *</label>
            {readonlyDeadline ? (
              <div style={{ padding: "8px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radius, fontSize: 12, color: T.textSub }}>
                {fmtReadable(deadline)} <span style={{ fontSize: 10, color: T.textMuted }}>(from goal deadline)</span>
              </div>
            ) : (
              <input
                type="datetime-local"
                value={deadline ? deadline.slice(0, 16) : ""}
                onChange={e => setDeadline(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                style={{ ...inp, fontSize: 12, cursor: "pointer" }}
                onFocus={e => e.target.style.borderColor = T.primary}
                onBlur={e => e.target.style.borderColor = T.border}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "13px 16px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 10, flexShrink: 0, background: T.bg }}>
          <Btn onClick={onCancel} variant="ghost" style={{ flex: 1, padding: "9px" }}>Cancel</Btn>
          <Btn
            disabled={!canSave}
            onClick={() => canSave && onSave({ heading: heading.trim(), description: description.trim(), deadline })}
            variant={canSave ? "primary" : "ghost"}
            style={{ flex: 2, padding: "9px", cursor: canSave ? "pointer" : "not-allowed", opacity: canSave ? 1 : 0.45 }}>
            {isNew ? "Add Component" : "Save Changes"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Add Button ────────────────────────────────────────────────────────────────
function AddBtn({ onClick }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "2px 0" }}>
      <button onClick={onClick}
        style={{ padding: "3px 14px", border: `1px dashed ${T.borderMid}`, borderRadius: 99, fontSize: 11, fontWeight: 500, color: T.textSub, background: T.white, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5, transition: "all 0.12s" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = T.primary; e.currentTarget.style.color = T.primary; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderMid; e.currentTarget.style.color = T.textSub; }}>
        + Add component
      </button>
    </div>
  );
}

// ── Node Card ─────────────────────────────────────────────────────────────────
function NodeCard({ comp, idx, isDone, canEdit, isHead, taskId, allComps, isFinalNode, createdByMe,
  canMarkDone,    // true only for the assignee/receiver
  isPrevDone,     // true if this node's previous node is done (or this is the first node)
  onEdit, onDelete, onMarkDone, onMarkUndo, onPendingApproval, onReject, onReportSubmitted }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showView, setShowView] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const reportSubmitted = comp.reportSubmitted;
  const isPendingApproval = comp.status === "pending_approval";

  // Only isHead (TL/CEO) can delete any component
  const canDelete = isHead;
  // Node is locked for receiver if previous node is not done
  const isLocked = canMarkDone && !isPrevDone;

  const statusColor = isDone ? T.success : isPendingApproval ? T.warning : T.textMuted;
  const statusLabel = isDone ? "Done" : isPendingApproval ? "Awaiting Approval" : "Pending";
  const statusBg = isDone ? T.successBg : isPendingApproval ? T.warningBg : T.bg;
  const statusBorder = isDone ? T.successBorder : isPendingApproval ? T.warningBorder : T.border;

  return (
    <>
      {showSubmit && <SubmitReportModal comp={comp} idx={idx} taskId={taskId} onSuccess={() => { setShowSubmit(false); onPendingApproval(); onReportSubmitted(); }} onCancel={() => setShowSubmit(false)} />}
      {showView && <ViewReportModal comp={comp} idx={idx} onClose={() => setShowView(false)} />}
      {showUndoConfirm && (
        <ConfirmModal icon="↩" title="Undo completion?" confirmLabel="Yes, Undo" confirmVariant="amber"
          desc={`<b>"${comp.heading}"</b> will be reset to pending.`}
          onConfirm={() => { setShowUndoConfirm(false); onMarkUndo(); }} onCancel={() => setShowUndoConfirm(false)} />
      )}

      <div style={{
        background: T.white, border: `1px solid ${isDone ? T.successBorder : T.border}`,
        borderLeft: `3px solid ${isDone ? T.success : isFinalNode ? "#6D28D9" : T.primary}`,
        borderRadius: T.radius, padding: "11px 12px", boxShadow: T.shadow, position: "relative",
      }}>
        {/* Three-dot menu — shown to head (manage) and receiver (mark done only) */}
        {(isHead || canMarkDone) && (
          <button onClick={() => setMenuOpen(o => !o)}
            style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 4, border: `1px solid ${menuOpen ? T.primary : T.border}`, background: menuOpen ? T.primaryLight : T.white, color: T.textSub, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ···
          </button>
        )}

        {/* Status badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, marginBottom: 6, background: statusBg, border: `1px solid ${statusBorder}` }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: statusColor }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: statusColor }}>
            {isLocked ? "Locked" : statusLabel}
          </span>
          {isDone && comp.doneAt && <span style={{ fontSize: 9, color: T.success, fontWeight: 500 }}>· {fmtReadable(comp.doneAt)}</span>}
        </div>

        {/* Final node badge */}
        {isFinalNode && (
          <span style={{ display: "inline-block", marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#6D28D9", background: "#F5F3FF", border: "1px solid #DDD6FE", padding: "1px 6px", borderRadius: 99, verticalAlign: "middle" }}>
            Goal Target
          </span>
        )}

        {/* Report submitted */}
        {(reportSubmitted || isPendingApproval) && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 8px", background: T.primaryLight, border: `1px solid ${T.primaryBorder}`, borderRadius: T.radius, marginBottom: isHead && !isDone ? 5 : 0 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: T.primary }}>Report submitted · {comp.report?.submittedBy}</span>
              <button onClick={() => setShowView(true)} style={{ fontSize: 10, fontWeight: 700, color: T.primary, background: "none", border: "none", cursor: "pointer" }}>View →</button>
            </div>
            {isHead && isPendingApproval && (
              <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                <Btn onClick={() => { setMenuOpen(false); onMarkDone(); }} variant="success" style={{ flex: 1, padding: "5px 8px", fontSize: 11 }}>Approve</Btn>
                <Btn onClick={() => { setMenuOpen(false); onReject(); }} style={{ flex: 1, padding: "5px 8px", fontSize: 11, color: T.danger, border: `1px solid ${T.dangerBorder}` }}>Reject</Btn>
              </div>
            )}
          </div>
        )}

        {/* Title + description */}
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 3, lineHeight: 1.35, paddingRight: 30 }}>{comp.heading}</div>
        <div style={{ fontSize: 11, color: T.textSub, lineHeight: 1.55, marginBottom: 7, whiteSpace: "pre-wrap" }}>{comp.description}</div>

        {/* Meta: weight, created by */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {comp.percentage != null && (
            <span style={{ fontSize: 10, fontWeight: 600, color: T.textSub, background: T.bg, border: `1px solid ${T.border}`, padding: "1px 7px", borderRadius: 4 }}>
              {Number(comp.percentage).toFixed(1)}% weight
            </span>
          )}
          {comp.points > 0 && (
            <span style={{ fontSize: 10, fontWeight: 600, color: T.textSub, background: T.bg, border: `1px solid ${T.border}`, padding: "1px 7px", borderRadius: 4 }}>
              +{comp.points} pts
            </span>
          )}
          {/* Who created this component */}
          {comp.createdByName && (
            <span style={{ fontSize: 10, color: T.textMuted }}>
              by {comp.createdByName}
            </span>
          )}
        </div>

        {/* Deadline */}
        {comp.deadline && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", background: isDone ? T.successBg : T.bg, border: `1px solid ${isDone ? T.successBorder : T.border}`, borderRadius: T.radius, marginBottom: 5 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isDone ? T.success : T.textMuted} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            <span style={{ fontSize: 10, fontWeight: 600, color: isDone ? T.success : T.text }}>Deadline: {fmtReadable(comp.deadline)}</span>
          </div>
        )}

        {/* Timestamps */}
        {comp.createdAt && (
          <div style={{ fontSize: 9, color: T.textMuted }}>Created {fmtReadable(comp.createdAt)}</div>
        )}

        {/* Expanded action menu */}
        {menuOpen && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 6 }}>

            {/* ── HEAD (TL/CEO): Edit + Delete + Approve/Reject ── */}
            {isHead && (
              <>
                {!isFinalNode && (
                  <div style={{ display: "flex", gap: 5 }}>
                    <Btn onClick={() => { setMenuOpen(false); onEdit(); }} style={{ flex: 1, padding: "6px 8px", fontSize: 11 }}>Edit</Btn>
                    {canDelete && (
                      <Btn onClick={() => { setMenuOpen(false); onDelete(); }} style={{ padding: "6px 10px", fontSize: 11, color: T.danger, border: `1px solid ${T.dangerBorder}` }}>Delete</Btn>
                    )}
                  </div>
                )}
                {isPendingApproval && (
                  <div style={{ display: "flex", gap: 5 }}>
                    <Btn onClick={() => { setMenuOpen(false); setShowView(true); }} style={{ flex: 1, padding: "6px 8px", fontSize: 11, color: T.primary, border: `1px solid ${T.primaryBorder}` }}>View Report</Btn>
                    <Btn onClick={() => { setMenuOpen(false); onMarkDone(); }} variant="success" style={{ flex: 1, padding: "6px 8px", fontSize: 11 }}>Approve</Btn>
                    <Btn onClick={() => { setMenuOpen(false); onReject(); }} style={{ padding: "6px 8px", fontSize: 11, color: T.danger, border: `1px solid ${T.dangerBorder}` }}>Reject</Btn>
                  </div>
                )}
              </>
            )}

            {/* ── RECEIVER (isAssignee / canMarkDone): only Mark Done / Undo ── */}
            {canMarkDone && (
              <div style={{ display: "flex", gap: 5 }}>
                {isDone ? (
                  <Btn onClick={() => { setMenuOpen(false); setShowUndoConfirm(true); }} variant="amber" style={{ flex: 1, padding: "6px 8px", fontSize: 11 }}>Undo</Btn>
                ) : isLocked ? (
                  <div style={{ padding: "6px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radius, fontSize: 11, color: T.textMuted, flex: 1, textAlign: "center" }}>
                    Complete previous step first
                  </div>
                ) : !reportSubmitted && !isPendingApproval ? (
                  <Btn onClick={() => { setMenuOpen(false); setShowSubmit(true); }} variant="success" style={{ flex: 1, padding: "6px 8px", fontSize: 11 }}>Mark Done</Btn>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Progress calculation ──────────────────────────────────────────────────────
function getProgressPct(components) {
  if (!components.length) return 0;
  let last = -1;
  components.forEach((c, i) => { if (c.status === "done") last = i; });
  return last < 0 ? 0 : Math.round(((last + 1) / components.length) * 100);
}

// ── Interactive Flowchart ─────────────────────────────────────────────────────
function InteractiveFlowchart({
  components, editingIdx, addingAfter, submitted, canEdit, isHead, editingMode, taskId,
  seenCount, currentEmployeeId, goalTotalPoints, goalFinalWeightPct, goalBonusPoints,
  canMarkDoneOnly,
  onSeen, onEdit, onDelete, onMarkDone, onMarkUndo, onPendingApproval, onReject,
  onAddBetween, onSaveNew, onSaveEdit, onCancelEdit, onCancelAdd,
  onDeleteAll, onToggleEditMode, onRefresh,
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const progressPct = getProgressPct(components);
  const totalEvents = components.reduce((s, c) => s + (c.history?.length || 0), 0);
  const unseen = Math.max(0, totalEvents - seenCount);

  const wrapRef = useRef(null);
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const check = () => setIsNarrow((wrapRef.current?.offsetWidth || window.innerWidth) <= 560);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Final node = last component (auto-created from goal task)
  const finalNodeIdx = components.length - 1;

  return (
    <div ref={wrapRef}>
      {showDeleteConfirm && (
        <ConfirmModal icon="🗑" title="Delete entire roadmap?" confirmLabel="Delete All" confirmVariant="danger"
          desc="This permanently removes all components."
          onConfirm={() => { setShowDeleteConfirm(false); onDeleteAll(); }} onCancel={() => setShowDeleteConfirm(false)} />
      )}
      {showHistory && <HistoryPanel components={components} onClose={() => { setShowHistory(false); }} />}

      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: T.bg }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Goal Roadmap</span>
          {components.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 600, color: T.textSub, background: T.white, border: `1px solid ${T.border}`, padding: "2px 7px", borderRadius: 99 }}>
              {components.length} component{components.length !== 1 ? "s" : ""}
            </span>
          )}
          {components.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 600, color: progressPct === 100 ? T.success : T.textSub, background: T.white, border: `1px solid ${progressPct === 100 ? T.successBorder : T.border}`, padding: "2px 7px", borderRadius: 99 }}>
              {progressPct}% done
            </span>
          )}



          {components.length > 0 && (
            <button onClick={() => { setShowHistory(true); onSeen(totalEvents); }}
              style={{ padding: "3px 9px", border: `1px solid ${unseen > 0 ? T.primary : T.border}`, borderRadius: T.radius, background: T.white, color: unseen > 0 ? T.primary : T.textSub, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
              History
              {unseen > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: "0 4px", borderRadius: 99, background: T.primary, color: "#fff" }}>{unseen}</span>}
            </button>
          )}
          {isHead && components.length > 0 && (
            <button onClick={() => setShowDeleteConfirm(true)} style={{ padding: "3px 8px", border: `1px solid ${T.dangerBorder}`, borderRadius: T.radius, background: T.dangerBg, color: T.danger, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Delete all
            </button>
          )}
        </div>

        {/* Progress bar */}
        {components.length > 0 && (
          <div style={{ height: 2, background: T.bg }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: T.success, transition: "width 0.5s" }} />
          </div>
        )}

        {/* Body */}
        <div style={{ padding: "14px" }}>
          {components.length === 0 && addingAfter === null && (
            <div style={{ textAlign: "center", padding: "28px 0" }}>
              <div style={{ fontSize: 11, color: T.textSub, marginBottom: 12 }}>No components yet. Break your goal into steps.</div>
              {canEdit && <AddBtn onClick={() => onAddBetween(-1)} />}
            </div>
          )}
          {components.length === 0 && addingAfter === -1 && (
            <FlowEditBox idx={0} comp={{}} isNew onSave={(d) => onSaveNew(-1, d)} onCancel={onCancelAdd} existingDeadlines={[]} />
          )}

          {components.length > 0 && (
            <div style={{ position: "relative" }}>
              {!isNarrow && <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: T.border, transform: "translateX(-50%)", zIndex: 0 }} />}
              {!isNarrow && progressPct > 0 && (
                <div style={{ position: "absolute", left: "50%", top: 0, height: `${progressPct}%`, width: 2, background: T.success, transform: "translateX(-50%)", zIndex: 1, transition: "height 0.5s" }} />
              )}

              {/* Add before first node — always available for head (no submitted gate) */}
              {canEdit && addingAfter !== -1 && components.length >= 1 && (
                <div style={{ position: "relative", zIndex: 2, marginBottom: 8 }}>
                  <AddBtn onClick={() => onAddBetween(-1)} />
                </div>
              )}
              {/* Add slider at top is handled at ActivitiesSection level */}

              {components.map((comp, i) => {
                const isDone = comp.status === "done";
                const isLeft = !isNarrow && i % 2 === 0;
                const isEditing = editingIdx === i;
                const isFinal = i === finalNodeIdx;
                const createdByMe = comp.createdById === currentEmployeeId;

                return (
                  <div key={comp.id} style={{ position: "relative", zIndex: 2, marginBottom: 4 }}>
                    {isNarrow ? (
                      <div>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: isDone ? T.success : T.white, border: `2px solid ${isDone ? T.success : T.primary}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 4 }}>
                            {isDone ? <span style={{ fontSize: 9, color: "#fff", fontWeight: 900 }}>✔</span> : <span style={{ fontSize: 10, fontWeight: 700, color: T.primary }}>{i + 1}</span>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {!isEditing && (
                              <NodeCard comp={comp} idx={i} isDone={isDone} canEdit={canEdit} isHead={isHead} taskId={taskId} allComps={components} isFinalNode={isFinal} createdByMe={createdByMe}
                                canMarkDone={canMarkDoneOnly}
                                isPrevDone={i === 0 || components[i - 1]?.status === "done"}
                                onEdit={() => onEdit(i)} onDelete={() => onDelete(i)}
                                onMarkDone={() => onMarkDone(i)} onMarkUndo={() => onMarkUndo(i)}
                                onPendingApproval={() => onPendingApproval(i)} onReject={() => onReject(i)}
                                onReportSubmitted={onRefresh} />
                            )}
                          </div>
                        </div>
                        {/* Edit slider is handled at ActivitiesSection level */}
                        {/* Add btn between nodes — always for head */}
                        {!isFinal && canEdit && (
                          <div style={{ marginBottom: 8 }}>
                            <AddBtn onClick={() => onAddBetween(i)} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: "flex", alignItems: "flex-start" }}>
                          <div style={{ width: "calc(50% - 16px)", flexShrink: 0 }}>
                            {isLeft && !isEditing && (
                              <NodeCard comp={comp} idx={i} isDone={isDone} canEdit={canEdit} isHead={isHead} taskId={taskId} allComps={components} isFinalNode={isFinal} createdByMe={createdByMe}
                                canMarkDone={canMarkDoneOnly}
                                isPrevDone={i === 0 || components[i - 1]?.status === "done"}
                                onEdit={() => onEdit(i)} onDelete={() => onDelete(i)}
                                onMarkDone={() => onMarkDone(i)} onMarkUndo={() => onMarkUndo(i)}
                                onPendingApproval={() => onPendingApproval(i)} onReject={() => onReject(i)}
                                onReportSubmitted={onRefresh} />
                            )}
                          </div>
                          <div style={{ width: 32, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: 12 }}>
                            <div style={{ width: 14, height: 14, borderRadius: "50%", background: isDone ? T.success : T.white, border: `2px solid ${isDone ? T.success : T.primary}`, boxShadow: `0 0 0 3px ${T.white}, 0 0 0 4px ${isDone ? T.successBorder : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5, position: "relative" }}>
                              {isDone && <span style={{ fontSize: 7, color: "#fff", fontWeight: 900 }}>✔</span>}
                            </div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {!isLeft && !isEditing && (
                              <NodeCard comp={comp} idx={i} isDone={isDone} canEdit={canEdit} isHead={isHead} taskId={taskId} allComps={components} isFinalNode={isFinal} createdByMe={createdByMe}
                                canMarkDone={canMarkDoneOnly}
                                isPrevDone={i === 0 || components[i - 1]?.status === "done"}
                                onEdit={() => onEdit(i)} onDelete={() => onDelete(i)}
                                onMarkDone={() => onMarkDone(i)} onMarkUndo={() => onMarkUndo(i)}
                                onPendingApproval={() => onPendingApproval(i)} onReject={() => onReject(i)}
                                onReportSubmitted={onRefresh} />
                            )}
                          </div>
                        </div>
                        {/* Edit slider is handled at ActivitiesSection level */}
                        {/* Add btn between nodes — always for head */}
                        {!isFinal && canEdit && (
                          <div style={{ position: "relative", zIndex: 2, margin: "8px 0" }}>
                            <AddBtn onClick={() => onAddBetween(i)} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ── Weight + points distribution helper ──────────────────────────────────────
// Final node gets goalFinalWeightPct% of totalPoints.
// All other nodes share the remaining weight equally.
// Each node's points = Math.round((weight / 100) * totalPoints)
function applyGoalWeights(comps, totalPoints, finalWeightPct) {
  if (!comps.length) return comps;
  const total = Number(totalPoints) || 0;
  const finalIdx = comps.length - 1;
  const fw = Math.min(100, Math.max(0, Number(finalWeightPct) || 0));
  const remaining = +(100 - fw).toFixed(4);
  const nonFinalCount = comps.length - 1;

  // Step 1: assign weights
  const perNodeW = nonFinalCount > 0 ? +(remaining / nonFinalCount).toFixed(4) : 0;
  const weights = comps.map((_, i) => {
    if (i === finalIdx) return fw;
    if (i === finalIdx - 1) return +(remaining - perNodeW * (nonFinalCount - 1)).toFixed(4);
    return perNodeW;
  });

  // Step 2: assign points via Math.round, then fix rounding drift on last non-final
  const rawPts = weights.map(w => Math.round((w / 100) * total));
  const sumSoFar = rawPts.reduce((s, p) => s + p, 0);
  const drift = total - sumSoFar;
  // Apply drift correction to the last non-final node (index finalIdx - 1, or 0 if only final)
  const corrIdx = nonFinalCount > 0 ? finalIdx - 1 : finalIdx;
  const corrected = rawPts.map((p, i) => i === corrIdx ? p + drift : p);

  return comps.map((c, i) => ({
    ...c,
    percentage: +weights[i].toFixed(2),
    points: Math.max(0, corrected[i]),
  }));
}

// ── Activities Section (state container) ──────────────────────────────────────
function ActivitiesSection({ task, isAssignee, isCEO, isTL, currentEmployeeId, currentEmployeeName }) {
  const [components, setComponents] = useState([]);
  const [editingIdx, setEditingIdx] = useState(null);
  const [addingAfter, setAddingAfter] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveErr, setSaveErr] = useState("");
  const [editingMode, setEditingMode] = useState(false);
  // Goal SOP settings: weight % and points for the final node
  const [goalTotalPoints, setGoalTotalPoints] = useState(0);     // total points pool for the whole goal task
  const [goalFinalWeightPct, setGoalFinalWeightPct] = useState(0); // weight % of the final/last node
  const [goalBonusPoints, setGoalBonusPoints] = useState(0);      // bonus points for on-time/early completion

  const seenKey = `history_seen_${task?.taskId}`;
  const [seenCount, setSeenCountRaw] = useState(() => { try { return parseInt(localStorage.getItem(seenKey) || "0", 10) || 0; } catch { return 0; } });
  const handleSeen = (n) => { setSeenCountRaw(n); try { localStorage.setItem(seenKey, String(n)); } catch { } };

  // isHead = true only if this person is the SENDER (assignedBy), not just any TL/CEO
  // A TL who is the receiver (assignee) should be able to Mark Done, not Edit/Delete
  const isSender = task.assignedBy === currentEmployeeId;
  const isHead = isSender || (isCEO && !isAssignee);
  // canManage: sender/head can add, edit, delete components
  // isAssignee: receiver can ONLY mark done — no add/edit/delete
  const canEdit = isHead; // renamed meaning: only head manages structure
  const canMarkDoneOnly = isAssignee && !isHead; // receiver can only submit done

  // Load SOP goal settings; task-level totalPoints overrides SOP default if set
  const loadGoalSettings = useCallback(async () => {
    // If the task itself has a totalPoints override, use that first
    const taskTotal = task.goalConfig?.totalPoints;
    if (taskTotal != null && !isNaN(Number(taskTotal))) {
      setGoalTotalPoints(Number(taskTotal));
    }
    try {
      const { firebaseDb } = await import("../../../lib/coworkFirebase");
      const { getDoc, doc } = await import("firebase/firestore");
      const snap = await getDoc(doc(firebaseDb, "cowork_sop_settings", "task_events"));
      if (snap.exists()) {
        const data = snap.data();
        setGoalTotalPoints(Number(data.goalTotalPoints) || 0);
        // Default 40% if admin hasn't set it yet
        setGoalFinalWeightPct(data.goalFinalNodeWeightPct != null ? Number(data.goalFinalNodeWeightPct) : 40);
        setGoalBonusPoints(Number(data.goalBonusPoints) || 0);
      } else {
        // No settings doc yet — use sensible defaults
        setGoalFinalWeightPct(40);
      }
    } catch (e) { console.warn("loadGoalSettings:", e.message); }
  }, []);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${BASE}/cowork/task/${task.taskId}/goal-activities`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const d = await res.json();
      let acts = d.activities || [];

      // ── Auto-create final node from goal task if missing ──
      // The final node uses the goal task's title, description, and deadline
      const goalDeadline = task.goalConfig?.deadline || task.fixedDeadline || task.dueDate || null;
      const goalTitle = task.title || "Goal Target";
      const goalDesc = task.description || task.goalConfig?.goalDescription || "";
      const finalNodeId = `final_${task.taskId}`;

      const hasFinalNode = acts.some(a => a.id === finalNodeId || a.isFinalNode === true);
      if (!hasFinalNode && goalDeadline) {
        const now = fmtDatetime(new Date().toISOString());
        const finalNode = {
          id: finalNodeId,
          isFinalNode: true,
          heading: goalTitle,
          description: goalDesc,
          deadline: goalDeadline,
          status: "pending",
          percentage: 0,  // will be set from SOP settings
          points: 0,
          createdByName: "System",
          createdById: "system",
          createdAt: now,
          history: [{ type: "created", label: "Final node auto-created from goal task", at: now, changes: [] }],
        };
        acts = [...acts, finalNode];
        // Persist immediately
        const token2 = await getToken();
        await fetch(`${BASE}/cowork/task/${task.taskId}/goal-activities`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token2}` },
          body: JSON.stringify({ activities: acts, submitted: d.submitted || false }),
        });
      }

      // Apply goal settings to final node
      await loadGoalSettings();

      setComponents(acts);
      setSubmitted(d.submitted || false);
      setSubmittedAt(d.submittedAt || null);
    } catch { }
    finally { setLoading(false); }
  }, [task.taskId, task.title, task.description, task.goalConfig, task.fixedDeadline, task.dueDate, loadGoalSettings]);

  useEffect(() => { load(); }, [load]);

  // Re-distribute points/weight whenever SOP settings or components change
  useEffect(() => {
    if (!goalTotalPoints && !goalFinalWeightPct) return;
    setComponents(prev => applyGoalWeights(prev, goalTotalPoints, goalFinalWeightPct));
  }, [goalTotalPoints, goalFinalWeightPct]);

  const persist = useCallback(async (comps, isSubmit, submitTime) => {
    setSaving(true); setSaveErr("");
    try {
      const token = await getToken();
      const sVal = isSubmit !== undefined ? isSubmit : submitted;
      const res = await fetch(`${BASE}/cowork/task/${task.taskId}/goal-activities`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ activities: comps, submitted: sVal, submittedAt: submitTime || submittedAt }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Save failed"); }
    } catch (e) { setSaveErr(e.message); }
    finally { setSaving(false); }
  }, [task.taskId, submitted, submittedAt]);

  const genId = () => `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const redistributeWeights = (comps) => applyGoalWeights(comps, goalTotalPoints, goalFinalWeightPct);

  const handleSaveNew = (afterIdx, data) => {
    const now = fmtDatetime(new Date().toISOString());
    const entry = { type: "created", label: "Component Created", at: now, by: null, changes: [{ field: "Heading", to: data.heading }] };
    const empName = (currentEmployeeName && currentEmployeeName !== "undefined") ? currentEmployeeName : "Me";
    const newComp = {
      id: genId(), ...data, status: "pending", points: 0,
      createdByName: empName,
      createdById: currentEmployeeId || "me",
      createdAt: now, history: [{ ...entry, by: empName }],
    };
    const updated = [...components];
    // Always insert before the final node
    const insertIdx = Math.min(afterIdx + 1, updated.length - 1);
    updated.splice(insertIdx, 0, newComp);
    const withWeight = redistributeWeights(updated);
    setComponents(withWeight); setAddingAfter(null);
    persist(withWeight, submitted);
  };

  const handleSaveEdit = (idx, data) => {
    const now = fmtDatetime(new Date().toISOString());
    const prev = components[idx];
    const changes = [];
    if (prev.heading !== data.heading) changes.push({ field: "Heading", from: prev.heading, to: data.heading });
    if (prev.description !== data.description) changes.push({ field: "Description", from: prev.description, to: data.description });
    if (prev.deadline !== data.deadline) changes.push({ field: "Deadline", from: fmtDatetime(prev.deadline), to: fmtDatetime(data.deadline) });
    const entry = { type: "edited", label: "Component Edited", at: now, by: null, changes };
    const updated = components.map((c, i) => i === idx ? { ...c, ...data, editedAt: now, history: [...(c.history || []), entry] } : c);
    setComponents(updated); setEditingIdx(null);
    persist(updated, submitted);
  };

  const handleDelete = (idx) => {
    // Cannot delete the final node
    if (idx === components.length - 1) return;
    const updated = components.filter((_, i) => i !== idx);
    const withWeight = redistributeWeights(updated);
    setComponents(withWeight);
    if (editingIdx === idx) setEditingIdx(null);
    if (addingAfter === idx) setAddingAfter(null);
    persist(withWeight, submitted);
  };

  const handleDeleteAll = async () => {
    setComponents([]); setSubmitted(false); setSubmittedAt(null);
    setEditingIdx(null); setAddingAfter(null); setSaveErr(""); setEditingMode(false);
    await persist([], false, null);
  };

  const handleMarkDone = async (idx) => {
    const now = fmtDatetime(new Date().toISOString());
    const comp = components[idx];
    const entry = { type: "done", label: "Approved & Marked Done", at: now, by: null, changes: [] };
    const u = components.map((c, i) => i === idx ? { ...c, status: "done", doneAt: now, history: [...(c.history || []), entry] } : c);
    setComponents(u); persist(u, submitted);

    const pts = comp.points || 0;
    if (pts > 0) {
      try {
        const token = await getToken();
        const assigneeId = (task.assigneeIds || [])[0];
        if (assigneeId) {
          // Pass submittedAt + deadline so backend can verify on-time submission
          const submittedAt = comp.report?.submittedAt || now;
          const deadline = comp.deadline || null;
          await fetch(`${BASE}/cowork/sop/goal-credit`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              targetEmployeeId: assigneeId,
              points: pts,
              componentName: comp.heading,
              taskTitle: task.title,
              taskId: task.taskId,
              componentId: comp.id,
              submittedAt,   // when receiver submitted
              deadline,      // node deadline
            }),
          });
        }
      } catch (e) { console.error("[goal-credit]", e.message); }
    }
  };

  const handlePendingApproval = async () => { await load(); };

  const handleReject = (idx) => {
    const now = fmtDatetime(new Date().toISOString());
    const entry = { type: "rejected", label: "Report Rejected", at: now, by: null, changes: [] };
    const u = components.map((c, i) => i === idx ? { ...c, status: "pending", reportSubmitted: false, report: null, history: [...(c.history || []), entry] } : c);
    setComponents(u); persist(u, submitted);
  };

  const handleMarkUndo = (idx) => {
    const now = fmtDatetime(new Date().toISOString());
    const entry = { type: "undone", label: "Done Undone", at: now, by: null, changes: [] };
    const u = components.map((c, i) => i === idx ? { ...c, status: "pending", doneAt: null, history: [...(c.history || []), entry] } : c);
    setComponents(u); persist(u, submitted);
  };

  const handleFinalSubmit = async () => {
    if (!components.length || editingIdx !== null || addingAfter !== null) { setSaveErr("Save or cancel open component first."); return; }
    const now = fmtDatetime(new Date().toISOString());
    setSubmitted(true); setSubmittedAt(now);
    await persist(components, true, now);
  };

  if (loading) return (
    <div style={{ padding: "40px 20px", textAlign: "center", color: T.textMuted, fontSize: 12 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 20, height: 20, border: `2px solid ${T.border}`, borderTopColor: T.primary, borderRadius: "50%", margin: "0 auto 10px", animation: "spin 0.8s linear infinite" }} />
      Loading…
    </div>
  );

  const doneCount = components.filter(c => c.status === "done").length;

  // Which component is being edited
  const editingComp = editingIdx !== null ? components[editingIdx] : null;
  const addingInsertIdx = addingAfter !== null ? addingAfter : -1;

  return (
    <div style={{ padding: "12px 12px 20px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: 1 }}>

      {/* ── Add Component slider ── */}
      {addingAfter !== null && (
        <FlowEditBox
          idx={addingInsertIdx + 1}
          comp={{}}
          isNew
          onSave={(d) => handleSaveNew(addingInsertIdx, d)}
          onCancel={() => setAddingAfter(null)}
          existingDeadlines={components.map(c => ({ heading: c.heading, deadline: c.deadline }))}
          readonlyDeadline={false}
        />
      )}

      {/* ── Edit Component slider ── */}
      {editingIdx !== null && editingComp && (
        <FlowEditBox
          idx={editingIdx}
          comp={editingComp}
          isNew={false}
          readonlyDeadline={editingIdx === components.length - 1}
          onSave={(d) => handleSaveEdit(editingIdx, d)}
          onCancel={() => setEditingIdx(null)}
          existingDeadlines={components.map(c => ({ heading: c.heading, deadline: c.deadline }))}
        />
      )}

      <InteractiveFlowchart
        components={components} editingIdx={editingIdx} addingAfter={addingAfter}
        submitted={submitted} canEdit={canEdit} isHead={isHead} editingMode={editingMode}
        taskId={task.taskId} seenCount={seenCount}
        currentEmployeeId={currentEmployeeId}
        goalTotalPoints={goalTotalPoints} goalFinalWeightPct={goalFinalWeightPct} goalBonusPoints={goalBonusPoints}
        canMarkDoneOnly={canMarkDoneOnly}
        onSeen={handleSeen}
        onEdit={(i) => { setEditingIdx(i); setAddingAfter(null); }}
        onDelete={handleDelete} onMarkDone={handleMarkDone} onMarkUndo={handleMarkUndo}
        onPendingApproval={handlePendingApproval} onReject={handleReject}
        onAddBetween={(i) => { setAddingAfter(i); setEditingIdx(null); }}
        onSaveNew={handleSaveNew} onSaveEdit={handleSaveEdit}
        onCancelEdit={() => setEditingIdx(null)} onCancelAdd={() => setAddingAfter(null)}
        onDeleteAll={handleDeleteAll} onToggleEditMode={() => setEditingMode(m => !m)}
        onRefresh={load}
      />

      {/* Final submit */}
      {!submitted && canEdit && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {saveErr && (
            <div style={{ padding: "7px 10px", background: T.dangerBg, border: `1px solid ${T.dangerBorder}`, borderRadius: T.radius, fontSize: 11, color: T.danger }}>{saveErr}</div>
          )}
          <button disabled={!components.length || saving} onClick={handleFinalSubmit}
            style={{
              width: "100%", padding: "10px 14px", border: `1px solid ${!components.length || saving ? T.border : T.primary}`,
              borderRadius: T.radius, background: !components.length || saving ? T.bg : T.primary,
              color: !components.length || saving ? T.textMuted : "#fff",
              fontSize: 13, fontWeight: 600, cursor: !components.length || saving ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}>
            {saving ? "Saving…" : "Final Submit"}
          </button>
          {!components.length && <div style={{ fontSize: 11, color: T.textMuted, textAlign: "center" }}>Add at least one component to submit</div>}
        </div>
      )}

      {/* Submitted banner */}
      {submitted && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.successBg, border: `1px solid ${T.successBorder}`, borderRadius: T.radius }}>
          <span style={{ fontSize: 16 }}>✓</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.success }}>Activities Submitted</div>
            <div style={{ fontSize: 11, color: "#4ADE80", marginTop: 1 }}>
              {doneCount}/{components.length} completed{submittedAt ? ` · ${fmtReadable(submittedAt)}` : ""}
            </div>
          </div>
        </div>
      )}
      {saveErr && submitted && (
        <div style={{ padding: "7px 10px", background: T.dangerBg, border: `1px solid ${T.dangerBorder}`, borderRadius: T.radius, fontSize: 11, color: T.danger }}>{saveErr}</div>
      )}
    </div>
  );
}

export default function GoalTask({ task, isAssignee, isCEO, isTL, currentEmployeeId, currentEmployeeName, onRefresh }) {
  return (
    <ActivitiesSection
      task={task}
      isAssignee={isAssignee}
      isCEO={isCEO}
      isTL={isTL}
      currentEmployeeId={currentEmployeeId}
      currentEmployeeName={currentEmployeeName}
    />
  );
}