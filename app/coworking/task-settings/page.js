"use client";
/**
 * app/coworking/settings/page.js
 *
 * Office Settings — visible to CEO / Admin only.
 * Stores data in Firestore: cowork_settings/office
 *
 * Fields:
 *  • schedule   — per-day in/out times + isOff toggle (Mon–Sun)
 *  • maxTaskActionGapMinutes — max allowed gap from task creation to first timer start
 *  • breaks — array of { name, start: "HH:MM", end: "HH:MM" }, applied every working day
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../components/coworking/layout/CoworkingShell";
import { firebaseDb } from "../../../lib/coworkFirebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const F = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif";
const BRAND = "#1B4F8A";

const DAY_KEYS  = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
const DAY_FULL  = { monday:"Monday", tuesday:"Tuesday", wednesday:"Wednesday",
                    thursday:"Thursday", friday:"Friday", saturday:"Saturday", sunday:"Sunday" };
const DAY_SHORT = { monday:"Mon", tuesday:"Tue", wednesday:"Wed",
                    thursday:"Thu", friday:"Fri", saturday:"Sat", sunday:"Sun" };

const DEFAULT_SCHEDULE = {
  monday:    { isOff: false, inTime: "09:30", outTime: "18:30" },
  tuesday:   { isOff: false, inTime: "09:30", outTime: "18:30" },
  wednesday: { isOff: false, inTime: "09:30", outTime: "18:30" },
  thursday:  { isOff: false, inTime: "09:30", outTime: "18:30" },
  friday:    { isOff: false, inTime: "09:30", outTime: "18:30" },
  saturday:  { isOff: false, inTime: "09:30", outTime: "14:30" },
  sunday:    { isOff: true,  inTime: "09:30", outTime: "18:30" },
};

const DEFAULT_GAP_MINUTES = 120;

function fmtTime12(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
}

function gapDisplay(mins) {
  if (!mins) return "";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function breakDuration(start, end) {
  if (!start || !end) return "";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return "⚠ end must be after start";
  return mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h ${mins%60 ? (mins%60)+"m" : ""}`.trim();
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12,
                  overflow:"hidden", marginBottom:20, fontFamily:F }}>
      <div style={{ padding:"16px 20px", borderBottom:"1px solid #F1F5F9",
                    background:"#FAFBFF" }}>
        <div style={{ fontSize:14, fontWeight:700, color:"#0F172A" }}>{title}</div>
        {subtitle && <div style={{ fontSize:12, color:"#6B7280", marginTop:3 }}>{subtitle}</div>}
      </div>
      <div style={{ padding:"20px" }}>{children}</div>
    </div>
  );
}

function TimeInput({ value, onChange, disabled }) {
  return (
    <input
      type="time"
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{
        padding:"6px 10px", border:"1px solid #D1D5DB", borderRadius:7,
        fontSize:12, fontFamily:F, outline:"none", background: disabled ? "#F9FAFB" : "#fff",
        color: disabled ? "#9CA3AF" : "#111827", cursor: disabled ? "not-allowed" : "text",
        width:96,
      }}
    />
  );
}

export default function SettingsPage() {
  const { user, role, employeeId, loading } = useCoworkAuth();
  const router = useRouter();

  const [schedule, setSchedule]       = useState(DEFAULT_SCHEDULE);
  const [gapVal, setGapVal]           = useState("2");
  const [gapUnit, setGapUnit]         = useState("hours");
  const [breaks, setBreaks]           = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [error, setError]             = useState("");

  useEffect(() => {
    if (!loading && user && role !== "ceo") router.replace("/coworking/tasks");
  }, [loading, user, role, router]);

  useEffect(() => {
    if (!user || role !== "ceo") return;
    (async () => {
      try {
        const snap = await getDoc(doc(firebaseDb, "cowork_settings", "office"));
        if (snap.exists()) {
          const data = snap.data();
          if (data.schedule) setSchedule({ ...DEFAULT_SCHEDULE, ...data.schedule });
          if (Array.isArray(data.breaks)) setBreaks(data.breaks);
          if (data.maxTaskActionGapMinutes) {
            const mins = Number(data.maxTaskActionGapMinutes);
            if (mins >= 60 && mins % 60 === 0) {
              setGapVal(String(mins / 60)); setGapUnit("hours");
            } else {
              setGapVal(String(mins)); setGapUnit("minutes");
            }
          }
        }
      } catch (e) { console.error("settings load:", e.message); }
      finally { setPageLoading(false); }
    })();
  }, [user, role]);

  const updateDay = useCallback((dayKey, field, value) => {
    setSchedule(prev => ({ ...prev, [dayKey]: { ...prev[dayKey], [field]: value } }));
    setSaved(false);
  }, []);

  const addBreak = () => {
    setBreaks(prev => [...prev, { name: "", start: "13:00", end: "14:00" }]);
    setSaved(false);
  };
  const updateBreak = (idx, field, value) => {
    setBreaks(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
    setSaved(false);
  };
  const removeBreak = (idx) => {
    setBreaks(prev => prev.filter((_, i) => i !== idx));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const gapMins = gapUnit === "hours"
        ? Math.round(parseFloat(gapVal) * 60)
        : Math.round(parseFloat(gapVal));
      if (!gapMins || gapMins <= 0) throw new Error("Please enter a valid max action gap.");

      const cleanBreaks = breaks
        .filter(b => b.name?.trim() && b.start && b.end)
        .map(b => ({ name: b.name.trim(), start: b.start, end: b.end }));

      for (const b of cleanBreaks) {
        const [sh, sm] = b.start.split(":").map(Number);
        const [eh, em] = b.end.split(":").map(Number);
        if ((eh * 60 + em) <= (sh * 60 + sm)) {
          throw new Error(`"${b.name}" break: end time must be after start time.`);
        }
      }

      await setDoc(doc(firebaseDb, "cowork_settings", "office"), {
        schedule,
        maxTaskActionGapMinutes: gapMins,
        breaks: cleanBreaks,
        updatedAt: serverTimestamp(),
        updatedBy: employeeId,
      }, { merge: true });

      setBreaks(cleanBreaks);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading || pageLoading) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
                    height:"100%", fontFamily:F, color:"#9CA3AF", fontSize:13 }}>
        Loading settings…
      </div>
    );
  }

  if (role !== "ceo") return null;

  const workingDays = DAY_KEYS.filter(d => !schedule[d]?.isOff).length;
  const gapMinsDisplay = gapUnit === "hours"
    ? Math.round(parseFloat(gapVal || 0) * 60)
    : Math.round(parseFloat(gapVal || 0));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
        .os-toggle { position:relative; display:inline-block; width:40px; height:22px; cursor:pointer; }
        .os-toggle input { opacity:0; width:0; height:0; }
        .os-slider { position:absolute; inset:0; background:#D1D5DB; border-radius:22px; transition:background 0.2s; }
        .os-slider::before { content:""; position:absolute; height:16px; width:16px; left:3px; bottom:3px;
                              background:#fff; border-radius:50%; transition:transform 0.2s;
                              box-shadow:0 1px 3px rgba(0,0,0,0.18); }
        .os-toggle input:checked + .os-slider { background:${BRAND}; }
        .os-toggle input:checked + .os-slider::before { transform:translateX(18px); }
        .os-off .os-slider { background:#F87171; }
        .os-off input:checked + .os-slider { background:#D1D5DB; }
        .os-inp:focus { border-color:${BRAND} !important; box-shadow:0 0 0 2px rgba(27,79,138,0.12) !important; }
        .os-save-btn:hover:not(:disabled) { background:#163E6E !important; }
        .os-day-row:hover { background:#F8FAFC; }
        .os-break-row:hover { background:#FFFBEB; }
      `}</style>

      <div style={{ height:"100%", overflowY:"auto", background:"#F5F6FA",
                    padding:"24px 28px", fontFamily:F }}>

        <div style={{ marginBottom:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <div style={{ width:36, height:36, borderRadius:9, background:BRAND,
                          display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize:20, fontWeight:700, color:"#0F172A", margin:0 }}>
                Office Settings
              </h1>
              <div style={{ fontSize:12, color:"#6B7280", marginTop:2 }}>
                Configure working hours, breaks, and task action policies
              </div>
            </div>
          </div>
        </div>

        <div>

          <SectionCard
            title="⏱ Max Allowed Action Gap"
            subtitle="Maximum time allowed from task assignment to first timer start. If an employee starts after this gap, the due time is anchored to assignment time + gap (not to start time)."
          >
            <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
              <input
                type="number" min="1" max="9999" value={gapVal}
                onChange={e => { setGapVal(e.target.value); setSaved(false); }}
                className="os-inp"
                style={{ width:90, padding:"8px 10px", border:"1px solid #D1D5DB",
                         borderRadius:8, fontSize:14, fontFamily:F, outline:"none",
                         color:"#111827", textAlign:"center", fontWeight:600 }}
              />
              <select
                value={gapUnit}
                onChange={e => { setGapUnit(e.target.value); setSaved(false); }}
                style={{ padding:"8px 12px", border:"1px solid #D1D5DB", borderRadius:8,
                         fontSize:13, fontFamily:F, background:"#fff", cursor:"pointer",
                         outline:"none", color:"#374151" }}
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
              </select>
              {gapMinsDisplay > 0 && (
                <div style={{ fontSize:12, color:"#6B7280", padding:"8px 12px",
                              background:"#EBF2FA", borderRadius:7, border:"1px solid #BFDBFE" }}>
                  = <strong style={{ color:BRAND }}>{gapDisplay(gapMinsDisplay)}</strong> from task creation
                </div>
              )}
            </div>

            <div style={{ marginTop:14, padding:"12px 14px", background:"#FFFBEB",
                          border:"1px solid #FDE68A", borderRadius:8 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#92400E",
                            textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>
                How it works
              </div>
              <div style={{ fontSize:12, color:"#78350F", lineHeight:1.65 }}>
                Task assigned at <strong>4:30 PM</strong>, gap set to <strong>{gapDisplay(gapMinsDisplay) || "2h"}</strong>.
                {" "}If employee starts at <strong>6:35 PM</strong> (past the gap) →
                due date anchors to <strong>6:30 PM</strong> + window, not 6:35 PM.
                {" "}If they start at <strong>5:00 PM</strong> (within gap) → due date anchors to 5:00 PM + window.
              </div>
            </div>
          </SectionCard>

          {/* ── NEW SECTION: Breaks ── */}
          <SectionCard
            title="☕ Daily Breaks"
            subtitle="Recurring breaks (lunch, tea, etc.) subtracted from every working day when calculating due dates. Applies the same every day."
          >
            {breaks.length === 0 && (
              <div style={{ fontSize:12, color:"#9CA3AF", padding:"10px 0" }}>
                No breaks defined yet. Working hours are treated as one continuous block.
              </div>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:14 }}>
              {breaks.map((b, idx) => {
                const dur = breakDuration(b.start, b.end);
                const isInvalid = dur.startsWith("⚠");
                return (
                  <div key={idx} className="os-break-row"
                       style={{ display:"grid", gridTemplateColumns:"1fr 110px 110px 90px 32px",
                                gap:10, alignItems:"center", padding:"10px 10px",
                                borderRadius:8, border:`1px solid ${isInvalid ? "#FECDD3" : "#F1F5F9"}`,
                                background: isInvalid ? "#FEF2F2" : "#fff" }}>
                    <input
                      type="text"
                      placeholder="e.g. Lunch Break"
                      value={b.name}
                      onChange={e => updateBreak(idx, "name", e.target.value)}
                      style={{ padding:"7px 10px", border:"1px solid #D1D5DB", borderRadius:7,
                               fontSize:12.5, fontFamily:F, outline:"none", color:"#111827" }}
                    />
                    <TimeInput value={b.start} onChange={v => updateBreak(idx, "start", v)} />
                    <TimeInput value={b.end} onChange={v => updateBreak(idx, "end", v)} />
                    <div style={{ fontSize:11, fontWeight:600,
                                  color: isInvalid ? "#DC2626" : "#6B7280", textAlign:"center" }}>
                      {dur}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBreak(idx)}
                      title="Remove this break"
                      style={{ width:28, height:28, border:"1px solid #FECDD3", borderRadius:7,
                               background:"#FEF2F2", color:"#DC2626", cursor:"pointer",
                               display:"flex", alignItems:"center", justifyContent:"center",
                               fontSize:14, fontWeight:700 }}
                    >×</button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addBreak}
              style={{ padding:"8px 16px", border:"1px dashed #BFDBFE", borderRadius:8,
                       background:"#EBF2FA", color:BRAND, fontSize:12.5, fontWeight:600,
                       cursor:"pointer", fontFamily:F }}
            >
              + Add Break
            </button>

            {breaks.length > 0 && (
              <div style={{ marginTop:14, padding:"12px 14px", background:"#F0FDF4",
                            border:"1px solid #BBF7D0", borderRadius:8 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#166534",
                              marginBottom:6, textTransform:"uppercase", letterSpacing:"0.05em" }}>
                  Active Breaks
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {breaks.filter(b => b.name && b.start && b.end).map((b, i) => (
                    <span key={i} style={{
                      fontSize:11, padding:"3px 9px", borderRadius:5,
                      background:"#DCFCE7", color:"#166534",
                      border:"1px solid #BBF7D0", fontWeight:500,
                    }}>
                      <strong>{b.name}</strong> {fmtTime12(b.start)} – {fmtTime12(b.end)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="📅 Office Working Hours"
            subtitle={`${workingDays} working day${workingDays !== 1 ? "s" : ""} configured. Deadlines will automatically roll over to the next working period.`}
          >
            <div style={{ display:"grid", gridTemplateColumns:"100px 1fr 1fr 80px",
                          gap:10, alignItems:"center", marginBottom:10,
                          padding:"0 4px" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#9CA3AF",
                            textTransform:"uppercase", letterSpacing:"0.06em" }}>Day</div>
              <div style={{ fontSize:10, fontWeight:700, color:"#9CA3AF",
                            textTransform:"uppercase", letterSpacing:"0.06em" }}>In Time</div>
              <div style={{ fontSize:10, fontWeight:700, color:"#9CA3AF",
                            textTransform:"uppercase", letterSpacing:"0.06em" }}>Out Time</div>
              <div style={{ fontSize:10, fontWeight:700, color:"#9CA3AF",
                            textTransform:"uppercase", letterSpacing:"0.06em" }}>Status</div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {DAY_KEYS.map(dayKey => {
                const cfg = schedule[dayKey] || { isOff: false, inTime:"09:30", outTime:"18:30" };
                const isWeekend = dayKey === "saturday" || dayKey === "sunday";
                return (
                  <div key={dayKey} className="os-day-row"
                       style={{ display:"grid", gridTemplateColumns:"100px 1fr 1fr 80px",
                                gap:10, alignItems:"center",
                                padding:"10px 8px", borderRadius:8, transition:"background 0.1s",
                                background: cfg.isOff ? "#FEF2F2" : "#fff",
                                border:`1px solid ${cfg.isOff ? "#FECDD3" : "#F1F5F9"}` }}>

                    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <div style={{
                        width:32, height:32, borderRadius:8,
                        background: cfg.isOff ? "#FEE2E2" : (isWeekend ? "#F5F3FF" : "#EBF2FA"),
                        color: cfg.isOff ? "#DC2626" : (isWeekend ? "#7C3AED" : BRAND),
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:11, fontWeight:700, flexShrink:0,
                      }}>
                        {DAY_SHORT[dayKey]}
                      </div>
                      <span style={{ fontSize:13, fontWeight:600,
                                     color: cfg.isOff ? "#9CA3AF" : "#111827" }}>
                        {DAY_FULL[dayKey]}
                      </span>
                    </div>

                    <div>
                      <TimeInput value={cfg.inTime} disabled={cfg.isOff}
                                 onChange={v => updateDay(dayKey, "inTime", v)} />
                      {!cfg.isOff && (
                        <div style={{ fontSize:10, color:"#94A3B8", marginTop:3 }}>
                          {fmtTime12(cfg.inTime)}
                        </div>
                      )}
                    </div>

                    <div>
                      <TimeInput value={cfg.outTime} disabled={cfg.isOff}
                                 onChange={v => updateDay(dayKey, "outTime", v)} />
                      {!cfg.isOff && (
                        <div style={{ fontSize:10, color:"#94A3B8", marginTop:3 }}>
                          {fmtTime12(cfg.outTime)}
                        </div>
                      )}
                    </div>

                    <div style={{ display:"flex", flexDirection:"column",
                                  alignItems:"center", gap:3 }}>
                      <label className={`os-toggle${cfg.isOff ? " os-off" : ""}`}>
                        <input type="checkbox" checked={!cfg.isOff}
                               onChange={e => updateDay(dayKey, "isOff", !e.target.checked)} />
                        <span className="os-slider" />
                      </label>
                      <span style={{ fontSize:9, fontWeight:600,
                                     color: cfg.isOff ? "#EF4444" : "#16A34A",
                                     textTransform:"uppercase", letterSpacing:"0.04em" }}>
                        {cfg.isOff ? "Off" : "On"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop:14, padding:"12px 14px", background:"#F0FDF4",
                          border:"1px solid #BBF7D0", borderRadius:8 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#166534",
                            marginBottom:6, textTransform:"uppercase", letterSpacing:"0.05em" }}>
                Working Schedule Summary
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {DAY_KEYS.filter(d => !schedule[d]?.isOff).map(d => {
                  const cfg = schedule[d];
                  return (
                    <span key={d} style={{
                      fontSize:11, padding:"3px 9px", borderRadius:5,
                      background:"#DCFCE7", color:"#166534",
                      border:"1px solid #BBF7D0", fontWeight:500,
                    }}>
                      <strong>{DAY_SHORT[d]}</strong> {fmtTime12(cfg.inTime)} – {fmtTime12(cfg.outTime)}
                    </span>
                  );
                })}
                {DAY_KEYS.filter(d => schedule[d]?.isOff).map(d => (
                  <span key={d} style={{
                    fontSize:11, padding:"3px 9px", borderRadius:5,
                    background:"#FEE2E2", color:"#991B1B",
                    border:"1px solid #FECDD3", fontWeight:500,
                  }}>
                    <strong>{DAY_SHORT[d]}</strong> Off
                  </span>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="🔁 Deadline Rollover Logic"
            subtitle="How due dates are calculated when work time spans office hours, breaks, holidays, and leave."
          >
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {[
                {
                  icon:"✅", bg:"#F0FDF4", border:"#BBF7D0",
                  title:"Within gap, within hours",
                  desc:"Task assigned 5:30 PM, start 6:00 PM (within 2h gap). Window = 5h. Office closes 6:30 PM → 30 min today + 4.5h next working day.",
                },
                {
                  icon:"⚠️", bg:"#FFFBEB", border:"#FDE68A",
                  title:"Past gap, anchor applied",
                  desc:"Task assigned 4:30 PM, start 7:00 PM (past 2h gap). Due date anchors from 6:30 PM (4:30 + 2h), not 7:00 PM.",
                },
                {
                  icon:"🔄", bg:"#EBF2FA", border:"#BFDBFE",
                  title:"Rolls over weekend / holiday / leave",
                  desc:"Window running into an off day, a company holiday, or the employee's approved leave → automatically continues from the next real working day, 9:30 AM.",
                },
                {
                  icon:"☕", bg:"#FEF3C7", border:"#FCD34D",
                  title:"Skips daily breaks",
                  desc:"Task assigned 10:30 AM for 4h, Lunch 1–2 PM defined. Instead of 2:30 PM, due date lands at 3:30 PM — the lunch hour doesn't count as work time.",
                },
              ].map((ex, i) => (
                <div key={i} style={{ padding:"11px 14px", background:ex.bg,
                                      border:`1px solid ${ex.border}`, borderRadius:8 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#111827", marginBottom:3 }}>
                    {ex.icon} {ex.title}
                  </div>
                  <div style={{ fontSize:11, color:"#374151", lineHeight:1.6 }}>{ex.desc}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          <div style={{ position:"sticky", bottom:0, padding:"14px 0",
                        background:"#F5F6FA", borderTop:"1px solid #E5E7EB",
                        display:"flex", alignItems:"center", gap:12 }}>
            <button
              className="os-save-btn"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding:"10px 28px", background: saving ? "#94A3B8" : BRAND,
                color:"#fff", border:"none", borderRadius:8,
                fontSize:13, fontWeight:700, cursor: saving ? "not-allowed" : "pointer",
                fontFamily:F, transition:"background 0.15s",
                display:"flex", alignItems:"center", gap:8,
              }}
            >
              {saving ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                       stroke="#fff" strokeWidth="2.5" strokeLinecap="round"
                       style={{ animation:"spin 1s linear infinite" }}>
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                  Saving…
                </>
              ) : "Save Settings"}
            </button>

            {saved && (
              <div style={{ display:"flex", alignItems:"center", gap:6,
                            fontSize:13, color:"#16A34A", fontWeight:600 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                Settings saved!
              </div>
            )}

            {error && (
              <div style={{ fontSize:12, color:"#DC2626" }}>⚠️ {error}</div>
            )}
          </div>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  );
}