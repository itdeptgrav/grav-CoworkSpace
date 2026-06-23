"use client";
import { useEffect, useState, useCallback } from "react";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../components/coworking/layout/CoworkingShell";
import { firebaseAuth, firebaseDb } from "../../../lib/coworkFirebase";
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import {
  fetchSops, createSop, updateSop, deleteSop,
  approveSop, rejectSop, applyBleach, fetchBleachHistory,
  fetchFolders, createFolder, deleteFolder,
  requestRecheck, reviewRecheck, fetchRecheckList,
  fetchTaskSuggestions, dismissTaskSuggestion,
  getBandConfig, saveBandConfig, getBandDesignations,
} from "../../../lib/coworkApi";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function safeFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Server error (${res.status}): response was not JSON`); }
}

// ── Design tokens — formal ────────────────────────────────────────────────────
const C = {
  primary: "#1B4F8A",
  primaryLight: "#EBF2FA",
  primaryBorder: "#BFDBFE",
  red: "#B91C1C",
  redLight: "#FEF2F2",
  redBorder: "#FECACA",
  border: "#E5E7EB",
  borderLight: "#F3F4F6",
  text: "#111827",
  textSub: "#4B5563",
  textMuted: "#9CA3AF",
  surface: "#F9FAFB",
  white: "#fff",
};

const iStyle = {
  padding: "7px 10px",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "inherit",
  color: C.text,
  background: C.white,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  transition: "border-color 0.12s",
};

// ── Shared helpers ────────────────────────────────────────────────────────────
function Btn({ children, onClick, primary, red, outline, disabled, style: s = {} }) {
  const bg = disabled ? C.borderLight : primary ? C.primary : red ? C.red : C.white;
  const cl = disabled ? C.textMuted : primary || red ? C.white : C.text;
  const br = outline || (!primary && !red) ? `1px solid ${C.border}` : "none";
  return (
    <button onClick={disabled ? undefined : onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 6, background: bg, border: br, color: cl, fontSize: 12, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap", opacity: disabled ? 0.6 : 1, transition: "opacity 0.12s", ...s }}>
      {children}
    </button>
  );
}

function SmBtn({ children, onClick, blue, green, red }) {
  const bg = blue ? "#EFF6FF" : green ? "#F0FDF4" : C.redLight;
  const cl = blue ? "#1D4ED8" : green ? "#15803D" : C.red;
  return (
    <button onClick={onClick}
      style={{ padding: "3px 9px", border: `1px solid ${cl}33`, borderRadius: 5, background: bg, color: cl, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
      {children}
    </button>
  );
}

function FieldLabel({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      {children}
    </div>
  );
}

function Alert({ children, red, style: s = {} }) {
  return (
    <div style={{ padding: "8px 11px", background: red ? C.redLight : C.primaryLight, border: `1px solid ${red ? C.redBorder : C.primaryBorder}`, borderRadius: 6, fontSize: 12, color: red ? C.red : C.primary, ...s }}>
      {children}
    </div>
  );
}

function Av({ name = "?", url = null, size = 30, bg = C.primaryLight, fg = C.primary }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  const i = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.35), fontWeight: 700, color: fg, flexShrink: 0 }}>
      {i}
    </div>
  );
}

function StatusBadge({ status }) {
  const m = {
    approved: ["#15803D", "#F0FDF4", "#BBF7D0", "Approved"],
    pending: ["#B45309", "#FFFBEB", "#FDE68A", "Pending"],
    rejected: [C.red, C.redLight, C.redBorder, "Rejected"],
  };
  const [c, bg, border, label] = m[status] || m.pending;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: c, background: bg, border: `1px solid ${border}`, padding: "2px 8px", borderRadius: 4 }}>
      {label}
    </span>
  );
}

function PRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.borderLight}` }}>
      <div style={{ minWidth: 90, fontSize: 11, color: C.textMuted, fontWeight: 500, paddingTop: 1 }}>{label}</div>
      <div style={{ flex: 1, fontSize: 12, color: C.text, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "28px 0", color: C.textMuted }}>
      <style>{`@keyframes sopSpin{to{transform:rotate(360deg)}}`}</style>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" style={{ animation: "sopSpin 1s linear infinite" }}>
        <path d="M21 12a9 9 0 11-6.219-8.56" />
      </svg>
      <span style={{ fontSize: 12 }}>Loading…</span>
    </div>
  );
}


function RecheckBadge({ label, color, bg, border }) {
  return (
    <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 600, color, background: bg, border: `1px solid ${border}`, padding: "2px 7px", borderRadius: 4 }}>
      {label}
    </span>
  );
}

// ── bleachType helper ─────────────────────────────────────────────────────────
// bleachType "debit"  = goal reward (subtracts from penalty score) → show GREEN
// bleachType "credit" = SOP violation (adds to penalty score)      → show RED
// Backward compat: old entries with isCredit:true were the goal reward entries
function isReward(b) {
  if (b.bleachType) return b.bleachType === "debit";
  return b.isCredit === true; // legacy boolean flag
}

// ── SOP Settings Panel ────────────────────────────────────────────────────────
const EVENT_LABELS = {
  task_overdue: { label: "Task Overdue", desc: "Regular task deadline passed and not completed", hasThreshold: false },
  task_rejected_tl: { label: "Task Rejected by TL", desc: "TL rejected employee's submitted task", hasThreshold: false },
  task_rejected_ceo: { label: "Task Rejected by CEO", desc: "CEO rejected employee's submitted task", hasThreshold: false },
  repeat_missed: { label: "Repeat Task Missed", desc: "Daily repeat task not submitted by deadline", hasThreshold: false },
  repeat_late: { label: "Repeat Task Late", desc: "Repeat task submitted after deadline time", hasThreshold: false },
  third_party_overdue: { label: "Third Party Task Overdue", desc: "External/client task deadline missed", hasThreshold: false },
  third_party_rejected: { label: "Third Party Task Rejected", desc: "Third party task submission rejected", hasThreshold: false },
  goal_overdue: { label: "Goal Task Overdue", desc: "Long-term goal task deadline missed", hasThreshold: false },
  self_assigned_overdue: { label: "Self-Assigned Task Overdue", desc: "Employee's own task deadline missed", hasThreshold: false },
  extension_rejected: { label: "Extension Request Rejected", desc: "TL/CEO rejected deadline extension request", hasThreshold: false },
  task_not_started: { label: "Task Not Started", desc: "Task assigned but not started after X days", hasThreshold: true },
};

const DEFAULT_EVENTS = Object.fromEntries(
  Object.keys(EVENT_LABELS).map(k => [k, {
    enabled: false, points: 0, description: "",
    ...(EVENT_LABELS[k].hasThreshold ? { daysThreshold: 0 } : {})
  }])
);

function SopSettingsPanel({ employeeId, employeeName, onClose }) {
  // 3 goal task settings
  // goalTotalPoints       — total points awarded for the entire goal task
  // goalFinalNodeWeightPct — weight % given to the auto-created final node
  // goalBonusPoints       — extra points for completing the goal on-time or before deadline
  const [goalTotalPoints, setGoalTotalPoints] = useState("");
  const [goalFinalNodeWeightPct, setGoalFinalNodeWeightPct] = useState("");
  const [goalBonusPoints, setGoalBonusPoints] = useState("");
  const [c2GlobalMaxPoints, setC2GlobalMaxPoints] = useState("");   // C2

  // ── C1 Band settings ──────────────────────────────────────────────────────
  const [c1MaxPoints, setC1MaxPoints] = useState("35");
  const [c1BaseScore, setC1BaseScore] = useState("1");
  const [c1DeadlineDeduction, setC1DeadlineDeduction] = useState("0.5");
  const [c1ExtensionDeduction, setC1ExtensionDeduction] = useState("0.2");
  const [c1ReworkDeduction, setC1ReworkDeduction] = useState("0.2");
  const [c1RejectScore, setC1RejectScore] = useState("0");

  // ── Role Band Configuration state ─────────────────────────────────────────
  const BAND_NAMES = ["execution-led", "balanced", "outcome-led"];
  const BAND_META = {
    "execution-led": { label: "Execution-led", color: "#1B4F8A", bg: "#EBF2FA" },
    "balanced": { label: "Balanced", color: "#7C3AED", bg: "#F5F3FF" },
    "outcome-led": { label: "Outcome-led", color: "#D97706", bg: "#FFFBEB" },
  };
  const [bandConfig, setBandConfig] = useState({
    "execution-led": { c1Max: "", c2Max: "", c3Max: "", c4Max: "", designations: [] },
    "balanced": { c1Max: "", c2Max: "", c3Max: "", c4Max: "", designations: [] },
    "outcome-led": { c1Max: "", c2Max: "", c3Max: "", c4Max: "", designations: [] },
  });
  const [newDesig, setNewDesig] = useState({ "execution-led": "", "balanced": "", "outcome-led": "" });
  const [bandSaving, setBandSaving] = useState(false);
  const [bandSaved, setBandSaved] = useState(false);
  const [bandErr, setBandErr] = useState("");
  const [allDesignations, setAllDesignations] = useState([]);


  const [events, setEvents] = useState(DEFAULT_EVENTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    getDoc(doc(firebaseDb, "cowork_sop_settings", "task_events"))
      .then(snap => {
        if (snap.exists()) {
          const d = snap.data();
          setEvents({ ...DEFAULT_EVENTS, ...(d.events || {}) });
          setGoalTotalPoints(d.goalTotalPoints != null ? String(d.goalTotalPoints) : "");
          setGoalFinalNodeWeightPct(d.goalFinalNodeWeightPct != null ? String(d.goalFinalNodeWeightPct) : "");
          setGoalBonusPoints(d.goalBonusPoints != null ? String(d.goalBonusPoints) : "");
          setC2GlobalMaxPoints(d.c2GlobalMaxPoints != null ? String(d.c2GlobalMaxPoints) : "");
          // C1 settings
          setC1MaxPoints(d.c1MaxPoints != null ? String(d.c1MaxPoints) : "35");
          setC1BaseScore(d.c1BaseScore != null ? String(d.c1BaseScore) : "1");
          setC1DeadlineDeduction(d.c1DeadlineDeduction != null ? String(d.c1DeadlineDeduction) : "0.5");
          setC1ExtensionDeduction(d.c1ExtensionDeduction != null ? String(d.c1ExtensionDeduction) : "0.2");
          setC1ReworkDeduction(d.c1ReworkDeduction != null ? String(d.c1ReworkDeduction) : "0.2");
          setC1RejectScore(d.c1RejectScore != null ? String(d.c1RejectScore) : "0");
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    getBandConfig().then(res => {
      if (res?.bands && Object.keys(res.bands).length > 0) {
        setBandConfig(prev => {
          const merged = { ...prev };
          for (const k of ["execution-led", "balanced", "outcome-led"]) {
            if (res.bands[k]) merged[k] = {
              c1Max: res.bands[k].c1Max ?? "",
              c2Max: res.bands[k].c2Max ?? "",
              c3Max: res.bands[k].c3Max ?? "",
              c4Max: res.bands[k].c4Max ?? "",
              designations: res.bands[k].designations || [],
            };
          }
          return merged;
        });
      }
    }).catch(() => { });

    getBandDesignations().then(res => {
      if (res?.designations) setAllDesignations(res.designations);
    }).catch(() => { });
  }, []);

  const updateEvent = (key, field, value) =>
    setEvents(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  const save = async () => {
    setSaving(true); setErr(""); setSaved(false);
    try {
      await setDoc(doc(firebaseDb, "cowork_sop_settings", "task_events"), {
        events,
        // These 3 field names must match exactly what GoalTask reads
        goalTotalPoints: parseFloat(goalTotalPoints) || 0,
        goalFinalNodeWeightPct: parseFloat(goalFinalNodeWeightPct) || 0,
        goalBonusPoints: parseFloat(goalBonusPoints) || 0,
        c2GlobalMaxPoints: parseFloat(c2GlobalMaxPoints) || 0,
        // ── C1 Settings ──────────────────────────────────────────────────
        c1MaxPoints: parseFloat(c1MaxPoints) || 35,
        c1BaseScore: parseFloat(c1BaseScore) ?? 1.0,
        c1DeadlineDeduction: parseFloat(c1DeadlineDeduction) ?? 0.5,
        c1ExtensionDeduction: parseFloat(c1ExtensionDeduction) ?? 0.2,
        c1ReworkDeduction: parseFloat(c1ReworkDeduction) ?? 0.2,
        c1RejectScore: parseFloat(c1RejectScore) ?? 0,
        updatedBy: employeeId,
        updatedByName: employeeName,
        updatedAt: new Date().toISOString(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  // ── Band config helpers ───────────────────────────────────────────────────
  const updateBand = (band, field, val) =>
    setBandConfig(prev => ({ ...prev, [band]: { ...prev[band], [field]: val } }));

  const addDesig = (band) => {
    const d = (newDesig[band] || "").trim();
    if (!d || bandConfig[band].designations.includes(d)) return;
    setBandConfig(prev => ({ ...prev, [band]: { ...prev[band], designations: [...prev[band].designations, d] } }));
    setNewDesig(prev => ({ ...prev, [band]: "" }));
  };

  const removeDesig = (band, d) =>
    setBandConfig(prev => ({ ...prev, [band]: { ...prev[band], designations: prev[band].designations.filter(x => x !== d) } }));

  const saveBands = async () => {
    setBandSaving(true); setBandErr(""); setBandSaved(false);
    try {
      const payload = {};
      for (const k of ["execution-led", "balanced", "outcome-led"]) {
        payload[k] = {
          c1Max: parseFloat(bandConfig[k].c1Max) || 0,
          c2Max: parseFloat(bandConfig[k].c2Max) || 0,
          c3Max: parseFloat(bandConfig[k].c3Max) || 0,
          c4Max: parseFloat(bandConfig[k].c4Max) || 0,
          designations: bandConfig[k].designations,
        };
      }
      await saveBandConfig({ bands: payload });
      setBandSaved(true);
      setTimeout(() => setBandSaved(false), 2500);
    } catch (e) { setBandErr(e.message); }
    finally { setBandSaving(false); }
  };

  // Inline field style — defined here so no module-level ref issues
  const F = {
    padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6,
    fontSize: 13, fontFamily: "inherit", color: "#111827",
    background: "#fff", outline: "none", width: "100%", boxSizing: "border-box",
  };
  const focusBlue = e => { e.target.style.borderColor = "#1B4F8A"; };
  const blurGray = e => { e.target.style.borderColor = "#E5E7EB"; };
  const lbl10 = { fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.28)", zIndex: 999 }} onClick={onClose} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(480px,100vw)", background: "#fff",
        borderLeft: "1px solid #E5E7EB",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.1)",
        zIndex: 1000, display: "flex", flexDirection: "column",
        fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif",
        overflow: "hidden",
      }}>

        {/* ── Header ── */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>SOP Settings</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>Goal tasks · C1/C2 Band · Role Band Configuration · Bleach triggers</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {loading ? <Spinner /> : (
            <>
              {/* ── Goal Task Point Settings — 3 inputs ── */}
              <div style={{ borderRadius: 7, border: "1px solid #BFDBFE" }}>

                {/* Blue header */}
                <div style={{ padding: "10px 14px", background: "#1B4F8A", borderRadius: "6px 6px 0 0" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Goal Task — Point Settings</div>
                  <div style={{ fontSize: 11, color: "#BFD9F5", marginTop: 2, lineHeight: 1.5 }}>
                    These 3 values control how points are assigned when a Goal Task is created and completed.
                  </div>
                </div>

                {/* Field 1 — Total Points */}
                <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid #E5E7EB" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                    Total Points for Goal Task
                  </div>
                  <input
                    type="number" min="0" step="1"
                    value={goalTotalPoints}
                    onChange={e => setGoalTotalPoints(e.target.value)}
                    placeholder="e.g. 100"
                    style={{ display: "block", width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: "#111827", background: "#fff", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => e.target.style.borderColor = "#1B4F8A"}
                    onBlur={e => e.target.style.borderColor = "#E5E7EB"}
                  />
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 5, lineHeight: 1.5 }}>
                    Total point pool for one goal task. Each node auto-gets: <strong style={{ color: "#1B4F8A" }}>(node weight% ÷ 100) × Total Points</strong>
                  </div>
                </div>

                {/* Field 2 — Final Node Weight % */}
                <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid #E5E7EB" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                    Auto-Created Final Node — Weight (%)
                  </div>
                  <input
                    type="number" min="0" max="100" step="1"
                    value={goalFinalNodeWeightPct}
                    onChange={e => setGoalFinalNodeWeightPct(e.target.value)}
                    placeholder="e.g. 40  (default: 40%)"
                    style={{ display: "block", width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: "#111827", background: "#fff", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => e.target.style.borderColor = "#1B4F8A"}
                    onBlur={e => e.target.style.borderColor = "#E5E7EB"}
                  />
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 5, lineHeight: 1.5 }}>
                    The last node is auto-created from the goal itself. This % is reserved for it.
                    {goalFinalNodeWeightPct
                      ? ` Remaining ${Math.max(0, 100 - (parseFloat(goalFinalNodeWeightPct) || 0)).toFixed(0)}% is split equally among intermediate nodes.`
                      : " Remaining % is split equally among intermediate nodes."
                    }
                  </div>
                </div>

                {/* Field 3 — Bonus Points */}
                <div style={{ padding: "14px 14px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                    Grace Points — Successful Completion (On-time / Early)
                  </div>
                  <input
                    type="number" min="0" step="1"
                    value={goalBonusPoints}
                    onChange={e => setGoalBonusPoints(e.target.value)}
                    placeholder="e.g. 10"
                    style={{ display: "block", width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: "#111827", background: "#fff", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => e.target.style.borderColor = "#1B4F8A"}
                    onBlur={e => e.target.style.borderColor = "#E5E7EB"}
                  />
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 5, lineHeight: 1.5 }}>
                    Extra points credited to the employee when the goal is completed on-time or before the deadline.
                  </div>
                </div>

                {/* Live calculation preview — only when both values filled */}
                {goalTotalPoints && goalFinalNodeWeightPct && (
                  <div style={{ padding: "10px 14px", background: "#EBF2FA", borderTop: "1px solid #BFDBFE", borderRadius: "0 0 6px 6px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#1B4F8A", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                      Auto-calculation preview
                    </div>
                    {(() => {
                      const total = parseFloat(goalTotalPoints) || 0;
                      const finalW = Math.min(100, Math.max(0, parseFloat(goalFinalNodeWeightPct) || 0));
                      const finalPts = Math.round((finalW / 100) * total);
                      const remW = +(100 - finalW).toFixed(1);
                      const remPts = Math.round((remW / 100) * total);
                      const bonus = parseFloat(goalBonusPoints) || 0;
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontSize: 12, color: "#1B4F8A" }}>
                            <strong>Final node:</strong> {finalW}% → <strong>{finalPts} pts</strong>
                          </div>
                          <div style={{ fontSize: 12, color: "#374151" }}>
                            <strong>Intermediate nodes share:</strong> {remW}% → {remPts} pts total (split equally per node)
                          </div>
                          {bonus > 0 && (
                            <div style={{ fontSize: 12, color: "#15803D", fontWeight: 600 }}>
                              + {bonus} grace pts for on-time / early completion
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* ── C2 Band Global Configuration ── */}
              <div style={{ borderRadius: 7, border: "2px solid #D97706" }}>
                {/* Gold header */}
                <div style={{ padding: "10px 14px", background: "#D97706", borderRadius: "5px 5px 0 0" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>🥇 C2 Band — Gold Task Configuration</div>
                  <div style={{ fontSize: 11, color: "#fff", marginTop: 3, lineHeight: 1.5, opacity: 0.9 }}>
                    Set the global maximum point pool. Each Gold Task gets a slice of this pool via its weightage %.
                  </div>
                </div>

                {/* Input: Global Max Points */}
                <div style={{ padding: "14px 14px 14px", background: "#FFFBEB", borderRadius: "0 0 5px 5px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Global C2 Max Points (%)</div>
                  <input
                    type="number" min="0" max="100" step="1"
                    value={c2GlobalMaxPoints}
                    onChange={e => setC2GlobalMaxPoints(e.target.value)}
                    placeholder="e.g. 30"
                    style={{ display: "block", width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: "#111827", background: "#fff", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => { e.target.style.borderColor = "#D97706"; }}
                    onBlur={e => { e.target.style.borderColor = "#E5E7EB"; }}
                  />
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 5, lineHeight: 1.5 }}>
                    Example: Input <strong>30</strong> → Global pool = <strong>30 pts</strong>.
                    Task A at 60% = <strong>18 pts</strong>. Task B at 40% = <strong>12 pts</strong>.
                    All active Gold Task weightages must sum to 100%.
                  </div>

                  {/* Live preview */}
                  {c2GlobalMaxPoints && Number(c2GlobalMaxPoints) > 0 && (
                    <div style={{ marginTop: 8, padding: "9px 12px", background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#92400E" }}>
                        Global C2 Pool = <strong>{Number(c2GlobalMaxPoints)} pts</strong>
                      </div>
                      <div style={{ fontSize: 10, color: "#B45309", marginTop: 3 }}>
                        TLs set per-task weightage when creating a Gold Task.
                        Total active weightages must equal 100%.
                      </div>
                    </div>
                  )}
                </div>
              </div>


              {/* ── C1 Band Settings ── */}
              <div style={{ borderRadius: 7, border: "2px solid #1B4F8A" }}>
                <div style={{ padding: "10px 14px", background: "#1B4F8A" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>⚡ C1 Band — Task Execution Quality Score</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2, lineHeight: 1.5 }}>
                    Formula: Score = Base − (Deadline × missed) − (Extension × filed) − (Rework × received)
                  </div>
                </div>
                <div style={{ padding: "12px 14px", background: "#EBF2FA", display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Row 1: Max + Base */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={lbl10}>C1 Max Points</div>
                      <input type="number" min="0" step="1" value={c1MaxPoints} onChange={e => setC1MaxPoints(e.target.value)} placeholder="e.g. 35" style={F} onFocus={focusBlue} onBlur={blurGray} />
                      <div style={{ fontSize: 10, color: "#6B7280", marginTop: 3 }}>Total C1 pts ceiling</div>
                    </div>
                    <div>
                      <div style={lbl10}>Base Score (on-time)</div>
                      <input type="number" min="0" step="0.1" value={c1BaseScore} onChange={e => setC1BaseScore(e.target.value)} placeholder="e.g. 1.0" style={F} onFocus={focusBlue} onBlur={blurGray} />
                      <div style={{ fontSize: 10, color: "#6B7280", marginTop: 3 }}>Perfect task starts at this</div>
                    </div>
                  </div>
                  {/* Row 2: Deductions */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={lbl10}>Deadline Missed</div>
                      <input type="number" min="0" step="0.1" value={c1DeadlineDeduction} onChange={e => setC1DeadlineDeduction(e.target.value)} placeholder="0.5" style={F} onFocus={focusBlue} onBlur={blurGray} />
                    </div>
                    <div>
                      <div style={lbl10}>Extension Filed</div>
                      <input type="number" min="0" step="0.1" value={c1ExtensionDeduction} onChange={e => setC1ExtensionDeduction(e.target.value)} placeholder="0.2" style={F} onFocus={focusBlue} onBlur={blurGray} />
                    </div>
                    <div>
                      <div style={lbl10}>Rework Received</div>
                      <input type="number" min="0" step="0.1" value={c1ReworkDeduction} onChange={e => setC1ReworkDeduction(e.target.value)} placeholder="0.2" style={F} onFocus={focusBlue} onBlur={blurGray} />
                    </div>
                    <div>
                      <div style={lbl10}>Reject Override</div>
                      <input type="number" step="0.1" value={c1RejectScore} onChange={e => setC1RejectScore(e.target.value)} placeholder="0" style={F} onFocus={focusBlue} onBlur={blurGray} />
                    </div>
                  </div>
                  {/* Live formula preview */}
                  {c1BaseScore && c1MaxPoints && (
                    <div style={{ padding: "8px 12px", background: "#1B4F8A", borderRadius: 6 }}>
                      <div style={{ fontSize: 11, color: "#fff", fontFamily: "monospace" }}>
                        Score = {c1BaseScore || "1"} − ({c1DeadlineDeduction || "0.5"} × missed) − ({c1ExtensionDeduction || "0.2"} × extensions) − ({c1ReworkDeduction || "0.2"} × reworks)
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 3 }}>
                        C1 = Quality Rate × {c1MaxPoints || "35"} pts max
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Role Band Configuration ── */}
              <div style={{ borderRadius: 7, border: "2px solid #374151" }}>
                <div style={{ padding: "10px 14px", background: "#1F2937", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>🏷 Role Band Configuration</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                      Assign designations to bands — sets C1/C2/C3/C4 max points per employee role
                    </div>
                  </div>
                  <button onClick={saveBands} disabled={bandSaving}
                    style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: bandSaving ? "#6B7280" : "#16A34A", color: "#fff", fontSize: 11, fontWeight: 700, cursor: bandSaving ? "not-allowed" : "pointer" }}>
                    {bandSaving ? "Saving…" : bandSaved ? "✓ Saved" : "Save Bands"}
                  </button>
                </div>
                {bandErr && <div style={{ padding: "6px 14px", background: "#FEF2F2", color: "#DC2626", fontSize: 11 }}>{bandErr}</div>}
                <div style={{ padding: "12px 14px", background: "#F9FAFB", display: "flex", flexDirection: "column", gap: 12 }}>
                  {BAND_NAMES.map(band => {
                    const meta = BAND_META[band];
                    const b = bandConfig[band];
                    return (
                      <div key={band} style={{ border: `1px solid ${meta.color}`, borderRadius: 8, overflow: "hidden", opacity: 0.9 }}>
                        <div style={{ padding: "8px 12px", background: meta.bg }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{meta.label}</div>
                        </div>
                        <div style={{ padding: "10px 12px", background: "#fff", display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                            {[["c1Max", "C1 Max"], ["c2Max", "C2 Max"], ["c3Max", "C3 Max"], ["c4Max", "C4 Max"]].map(([field, label]) => (
                              <div key={field}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: "#6B7280", marginBottom: 3 }}>{label}</div>
                                <input type="number" min="0" step="1" placeholder="0"
                                  value={b[field] ?? ""}
                                  onChange={e => updateBand(band, field, e.target.value)}
                                  style={F}
                                />
                              </div>
                            ))}
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: "#6B7280", marginBottom: 5 }}>Designations</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
                              {b.designations.map(d => (
                                <span key={d} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", background: meta.bg, border: `1px solid ${meta.color}`, borderRadius: 4, fontSize: 11, color: meta.color, fontWeight: 500 }}>
                                  {d}
                                  <button onClick={() => removeDesig(band, d)} style={{ background: "none", border: "none", color: meta.color, cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
                                </span>
                              ))}
                              {b.designations.length === 0 && <span style={{ fontSize: 11, color: "#9CA3AF" }}>No designations assigned</span>}
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <select
                                value={newDesig[band] || ""}
                                onChange={e => setNewDesig(prev => ({ ...prev, [band]: e.target.value }))}
                                style={{ ...F, flex: 1, cursor: "pointer" }}
                              >
                                <option value="">Select designation…</option>
                                {allDesignations
                                  .filter(d => !Object.values(bandConfig).some(bc => bc.designations.includes(d)))
                                  .map(d => <option key={d} value={d}>{d}</option>)
                                }
                              </select>
                              <button onClick={() => addDesig(band)}
                                style={{ padding: "5px 12px", borderRadius: 5, border: "none", background: meta.color, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                                + Add
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 10, color: "#9CA3AF", textAlign: "center" }}>C3 and C4 — max values stored now, scoring built later</div>
                </div>
              </div>


              {/* ── Divider ── */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                  Bleach Trigger Events
                </span>

                <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
              </div>

              {/* ── Event rows ── */}
              {Object.entries(EVENT_LABELS).map(([key, meta]) => {
                const ev = events[key] || {};
                return (
                  <div key={key} style={{ border: `1px solid ${ev.enabled ? "#BFDBFE" : "#E5E7EB"}`, borderRadius: 6, background: ev.enabled ? "#F8FBFF" : "#fff" }}>

                    {/* Toggle row — div not label, to avoid input-inside-label conflict */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 12px", cursor: "pointer" }}
                      onClick={() => updateEvent(key, "enabled", !ev.enabled)}>
                      <input
                        type="checkbox"
                        checked={ev.enabled || false}
                        onChange={e => { e.stopPropagation(); updateEvent(key, "enabled", e.target.checked); }}
                        onClick={e => e.stopPropagation()}
                        style={{ width: 15, height: 15, accentColor: "#1B4F8A", cursor: "pointer", flexShrink: 0, marginTop: 1 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{meta.label}</div>
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>{meta.desc}</div>
                      </div>
                      {ev.enabled && ev.points > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", padding: "2px 8px", borderRadius: 4, flexShrink: 0, whiteSpace: "nowrap" }}>
                          {ev.points} pts
                        </span>
                      )}
                    </div>

                    {/* Expanded fields when enabled */}
                    {ev.enabled && (
                      <div style={{ padding: "12px 12px 14px", borderTop: "1px solid #DBEAFE", background: "#fff", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "grid", gridTemplateColumns: meta.hasThreshold ? "1fr 1fr" : "1fr", gap: 10 }}>
                          <div>
                            <div style={lbl10}>Deduction Points</div>
                            <input
                              type="number" min="0" step="0.5"
                              value={ev.points}
                              onChange={e => updateEvent(key, "points", Number(e.target.value))}
                              placeholder="e.g. 1.0"
                              style={F}
                              onFocus={focusBlue} onBlur={blurGray}
                            />
                          </div>
                          {meta.hasThreshold && (
                            <div>
                              <div style={lbl10}>Days Threshold</div>
                              <input
                                type="number" min="1"
                                value={ev.daysThreshold || ""}
                                onChange={e => updateEvent(key, "daysThreshold", Number(e.target.value))}
                                placeholder="e.g. 2"
                                style={F}
                                onFocus={focusBlue} onBlur={blurGray}
                              />
                            </div>
                          )}
                        </div>
                        <div>
                          <div style={lbl10}>Description</div>
                          <input
                            type="text"
                            value={ev.description}
                            onChange={e => updateEvent(key, "description", e.target.value)}
                            placeholder="Describe this violation…"
                            style={F}
                            onFocus={focusBlue} onBlur={blurGray}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: "12px 18px", borderTop: "1px solid #E5E7EB", display: "flex", gap: 10, alignItems: "center", flexShrink: 0, background: "#F9FAFB" }}>
          {err && <div style={{ fontSize: 12, color: "#B91C1C", flex: 1 }}>{err}</div>}
          {saved && <div style={{ fontSize: 12, color: "#15803D", flex: 1, fontWeight: 600 }}>✓ Settings saved</div>}
          {!err && !saved && <div style={{ flex: 1 }} />}
          <button onClick={onClose}
            style={{ padding: "8px 18px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", color: "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            style={{ padding: "8px 22px", border: "none", borderRadius: 6, background: saving ? "#93C5FD" : "#1B4F8A", color: "#fff", fontSize: 12, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── SOP Form ──────────────────────────────────────────────────────────────────
function SopForm({ editing, role, myDept, employeeId, employeeName, folders, allDepts, onClose, onSaved }) {
  const [name, setName] = useState(editing?.name || "");
  const [points, setPoints] = useState(editing?.points || "");
  const [desc, setDesc] = useState(editing?.description || "");
  const [dept, setDept] = useState(editing?.department || (role === "tl" ? myDept : ""));
  const [folderId, setFolderId] = useState(editing?.folderId || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderCreated, setFolderCreated] = useState(false);
  const [localFolders, setLocalFolders] = useState(folders);

  const deptFolders = localFolders.filter(f => !dept || f.department === dept);
  const folderPending = showNewFolder && newFolderName.trim() && !folderCreated;

  const handleNewFolderNameChange = (val) => {
    setNewFolderName(val);
    setFolderCreated(false);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    if (!dept) return setErr("Select a department first.");
    setFolderBusy(true);
    try {
      const d = await createFolder({ name: newFolderName.trim(), department: dept });
      setLocalFolders(prev => [...prev, d.folder]);
      setFolderId(d.folder._id);
      setFolderCreated(true);
    } catch (e) { setErr(e.message); }
    finally { setFolderBusy(false); }
  };

  const save = async () => {
    if (!name.trim() || !points || !desc.trim() || !dept) return setErr("All fields are required.");
    if (isNaN(points) || Number(points) < 0.5) return setErr("Points must be at least 0.5.");
    setErr(""); setBusy(true);
    try {
      const body = { name: name.trim(), points: Number(points), description: desc.trim(), department: dept, folderId: folderId || null };
      if (editing) await updateSop(editing._id, body);
      else await createSop(body);
      onSaved(); onClose();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 999 }} onClick={onClose} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px,100vw)", background: C.white, borderLeft: `1px solid ${C.border}`, boxShadow: "-4px 0 20px rgba(0,0,0,0.08)", zIndex: 1000, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{editing ? "Edit SOP" : "Create SOP"}</div>
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSub }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {role === "tl" && (
          <div style={{ padding: "8px 18px", background: "#FFFBEB", borderBottom: "1px solid #FDE68A", fontSize: 11, color: "#92400E" }}>
            Requires Admin approval before becoming active.
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {err && <Alert red>{err}</Alert>}

          <FieldLabel label="SOP Name *">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Late Login" style={iStyle}
              onFocus={e => e.target.style.borderColor = C.primary} onBlur={e => e.target.style.borderColor = C.border} />
          </FieldLabel>

          <FieldLabel label="Deduction Points *">
            <input type="number" value={points} onChange={e => setPoints(e.target.value)} placeholder="e.g. 1.0" step="0.5" min="0.5" style={iStyle}
              onFocus={e => e.target.style.borderColor = C.primary} onBlur={e => e.target.style.borderColor = C.border} />
          </FieldLabel>

          <FieldLabel label="Department *">
            {role === "tl"
              ? <input value={myDept} disabled style={{ ...iStyle, background: C.surface, color: C.textSub }} />
              : <select value={dept} onChange={e => { setDept(e.target.value); setFolderId(""); setShowNewFolder(false); setNewFolderName(""); setFolderCreated(false); }} style={{ ...iStyle, cursor: "pointer" }}>
                <option value="">Select department…</option>
                {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            }
          </FieldLabel>

          <FieldLabel label="Folder">
            <div style={{ display: "flex", gap: 8 }}>
              <select value={folderId} onChange={e => setFolderId(e.target.value)} style={{ ...iStyle, flex: 1, cursor: "pointer" }} disabled={!dept}>
                <option value="">Uncategorized</option>
                {deptFolders.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
              </select>
              {dept && (
                <button type="button" onClick={() => { setShowNewFolder(v => !v); setNewFolderName(""); setFolderCreated(false); }}
                  style={{ padding: "0 12px", border: `1px solid ${C.primaryBorder}`, borderRadius: 6, background: C.primaryLight, color: C.primary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  + New
                </button>
              )}
            </div>
            {showNewFolder && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={newFolderName} onChange={e => handleNewFolderNameChange(e.target.value)} placeholder="Folder name…"
                    style={{ ...iStyle, flex: 1 }}
                    onFocus={e => e.target.style.borderColor = C.primary} onBlur={e => e.target.style.borderColor = C.border}
                    onKeyDown={e => e.key === "Enter" && handleCreateFolder()} />
                  <button type="button" onClick={handleCreateFolder} disabled={folderBusy || !newFolderName.trim()}
                    style={{ padding: "0 14px", border: "none", borderRadius: 6, background: folderBusy || !newFolderName.trim() ? "#93C5FD" : C.primary, color: C.white, fontSize: 12, fontWeight: 600, cursor: folderBusy || !newFolderName.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", flexShrink: 0, minWidth: 64 }}>
                    {folderBusy ? "…" : "Create"}
                  </button>
                </div>
                {folderPending && <div style={{ marginTop: 6, padding: "6px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 5, fontSize: 11, color: "#92400E" }}>Click <strong>Create</strong> to save this folder before submitting.</div>}
                {folderCreated && <div style={{ marginTop: 6, padding: "6px 10px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 5, fontSize: 11, color: "#15803D" }}>✓ Folder created successfully.</div>}
              </div>
            )}
          </FieldLabel>

          <FieldLabel label="Description *">
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe the violation…" rows={3} style={{ ...iStyle, resize: "vertical" }}
              onFocus={e => e.target.style.borderColor = C.primary} onBlur={e => e.target.style.borderColor = C.border} />
          </FieldLabel>
        </div>

        <div style={{ padding: "13px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, flexShrink: 0, background: C.surface }}>
          <button onClick={onClose} style={{ flex: 1, padding: "9px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.white, color: C.text, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={save} disabled={busy || folderPending}
            title={folderPending ? "Create the new folder first." : ""}
            style={{ flex: 2, padding: "9px", border: "none", borderRadius: 6, background: busy || folderPending ? "#93C5FD" : C.primary, color: C.white, fontSize: 12, fontWeight: 600, cursor: busy || folderPending ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: folderPending ? 0.7 : 1 }}>
            {busy ? "Saving…" : folderPending ? "Create folder first ↑" : editing ? "Save Changes" : role === "tl" ? "Submit for Approval" : "Create SOP"}
          </button>
        </div>
      </div>
    </>
  );
}
// ── RecheckReview — TL/CEO approves or rejects a pending recheck ─────────────
function RecheckReview({ bleach, employeeId, onDone }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  const handle = async (action) => {
    setBusy(true); setErr("");
    try {
      await reviewRecheck(employeeId, bleach.bleachId || bleach._id, {
        action: action === "approve" ? "confirm" : "reject",
        reviewNote: note,
      });
      setOpen(false);
      onDone?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ marginTop: 6, fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 4, border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#1D4ED8", cursor: "pointer" }}
      >
        Review Request
      </button>
    );
  }

  return (
    <div style={{ marginTop: 8, padding: "10px 12px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6 }}>
      {bleach.recheck?.requestNote && (
        <div style={{ fontSize: 11, color: "#374151", marginBottom: 6, lineHeight: 1.5 }}>
          <strong>Employee note:</strong> {bleach.recheck.requestNote}
        </div>
      )}
      <input
        placeholder="Review note (optional)"
        value={note}
        onChange={e => setNote(e.target.value)}
        style={{ width: "100%", padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: 5, fontSize: 11, marginBottom: 6, boxSizing: "border-box" }}
      />
      {err && <div style={{ fontSize: 10, color: "#DC2626", marginBottom: 4 }}>{err}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          disabled={busy}
          onClick={() => handle("approve")}
          style={{ flex: 1, padding: "5px 0", borderRadius: 5, border: "none", background: "#15803D", color: "#fff", fontSize: 11, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer" }}
        >
          {busy ? "…" : "✓ Approve"}
        </button>
        <button
          disabled={busy}
          onClick={() => handle("deny")}
          style={{ flex: 1, padding: "5px 0", borderRadius: 5, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 11, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer" }}
        >
          {busy ? "…" : "✕ Deny"}
        </button>
        <button
          disabled={busy}
          onClick={() => setOpen(false)}
          style={{ padding: "5px 10px", borderRadius: 5, border: "1px solid #E5E7EB", background: "#fff", color: "#6B7280", fontSize: 11, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Bleach Panel ──────────────────────────────────────────────────────────────
function BleachPanel({ role, employees, approvedSops, folders, employeeId, employeeName, recheckList = [], onClose }) {
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [history, setHistory] = useState(null);
  const [histLoading, setHistLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selFolder, setSelFolder] = useState("");
  const [selSop, setSelSop] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");

  const loadHistory = async (emp) => {
    setHistLoading(true);
    try { const d = await fetchBleachHistory(emp.employeeId); setHistory(d); }
    catch (e) { console.error(e); }
    finally { setHistLoading(false); }
  };

  const selectEmp = (emp) => {
    setSelectedEmp(emp); setShowForm(false);
    setSelFolder(""); setSelSop(null); setNote(""); setErr("");
    loadHistory(emp);
  };

  const apply = async () => {
    if (!selSop) return setErr("Select an SOP.");
    setBusy(true); setErr("");
    try {
      await applyBleach({ targetEmployeeId: selectedEmp.employeeId, sopId: selSop._id, description: note.trim() });
      setShowForm(false); setSelFolder(""); setSelSop(null); setNote("");
      loadHistory(selectedEmp);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const allBleaches = [];
  (history?.sopPoints || []).forEach(yp => (yp.bleaches || []).forEach(b => allBleaches.push({ ...b, year: yp.year })));
  allBleaches.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const grouped = allBleaches.reduce((acc, b) => { const d = b.date || "Unknown"; if (!acc[d]) acc[d] = []; acc[d].push(b); return acc; }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const filtEmps = employees.filter(e => !search || e.name?.toLowerCase().includes(search.toLowerCase()));
  const recheckEmpIds = new Set(recheckList.map(r => r.employeeId));
  const sortedEmps = [...filtEmps].sort((a, b) => (recheckEmpIds.has(b.employeeId) ? 1 : 0) - (recheckEmpIds.has(a.employeeId) ? 1 : 0));

  // SOPs for the selected employee's department
  const empDeptSops = approvedSops.filter(s => !selectedEmp || s.department === selectedEmp.department);

  // Build folder list from actual folder objects (not just SOP folderName strings).
  // This ensures folders show up even if they have 0 approved SOPs currently.
  // But we ONLY show a folder if it has at least 1 approved SOP to bleach.
  const deptFolderObjs = folders.filter(f => !selectedEmp || f.department === selectedEmp.department);

  // Collect folder names AND folder ids that have at least 1 approved SOP in that dept
  const sopFolderNames = new Set(empDeptSops.map(s => s.folderName || "Uncategorized"));
  const sopFolderIds = new Set(empDeptSops.map(s => s.folderId ? String(s.folderId) : null).filter(Boolean));

  // Build the dropdown list:
  // 1. Named folders (from folder objects) that have SOPs — matched by name OR by _id
  // 2. "Uncategorized" bucket if any SOPs have no folder
  // Map folder objects to { id: string, name: string } — use _id from MongoDB
  const namedFolders = deptFolderObjs
    .filter(f => sopFolderNames.has(f.name) || sopFolderIds.has(String(f._id)))
    .map(f => ({ id: String(f._id), name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const hasUncategorized = empDeptSops.some(s => !s.folderId && (s.folderName === "Uncategorized" || !s.folderName));
  const relevantFolders = [
    ...namedFolders,
    ...(hasUncategorized ? [{ id: "__uncategorized__", name: "Uncategorized" }] : []),
  ];

  // SOPs for the currently selected folder — match by folderId (string), folderName, or uncategorized
  const folderSops = selFolder
    ? empDeptSops.filter(s => {
      if (selFolder === "__uncategorized__") {
        return !s.folderId && (s.folderName === "Uncategorized" || !s.folderName);
      }
      // Primary match: folderId string comparison
      if (s.folderId && String(s.folderId) === selFolder) return true;
      // Fallback: find folder name by id and match folderName
      const matchedFolder = relevantFolders.find(f => f.id === selFolder);
      return matchedFolder && s.folderName === matchedFolder.name;
    })
    : [];

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 999 }} onClick={onClose} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: selectedEmp ? "min(720px,100vw)" : "min(320px,100vw)", maxWidth: "100vw", background: C.white, borderLeft: `1px solid ${C.border}`, boxShadow: "-4px 0 20px rgba(0,0,0,0.08)", zIndex: 1000, display: "flex", flexDirection: selectedEmp ? "row" : "column", transition: "width 0.22s ease", fontFamily: "inherit" }}>

        {/* Left: Employee list */}
        <div style={{ width: selectedEmp ? 300 : "100%", minWidth: selectedEmp ? 280 : "unset", borderRight: selectedEmp ? `1px solid ${C.border}` : "none", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "13px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>SOP Breach</div>
            <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 5, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSub }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.borderLight}`, flexShrink: 0 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…" style={{ ...iStyle, fontSize: 12 }}
              onFocus={e => e.target.style.borderColor = C.primary} onBlur={e => e.target.style.borderColor = C.border} />
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {sortedEmps.length === 0
              ? <div style={{ padding: "32px 14px", textAlign: "center", fontSize: 12, color: C.textMuted }}>No employees.</div>
              : sortedEmps.map((emp, i) => {
                const hasRecheck = recheckEmpIds.has(emp.employeeId);
                const recheckInfo = recheckList.find(r => r.employeeId === emp.employeeId);
                const isActive = selectedEmp?.employeeId === emp.employeeId;
                return (
                  <div key={emp.employeeId || i} onClick={() => selectEmp(emp)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: `1px solid ${C.borderLight}`, cursor: "pointer", transition: "background 0.1s", background: isActive ? C.primaryLight : hasRecheck && !isActive ? "#FFFBEB" : C.white }}>
                    <Av name={emp.name} url={emp.profilePicUrl} size={30} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? C.primary : C.text }}>{emp.name}</div>
                      <div style={{ fontSize: 10, color: C.textSub }}>{emp.department} · {emp.employeeId}</div>
                    </div>
                    {hasRecheck && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#92400E", background: "#FDE68A", padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>
                        ⏳ {recheckInfo?.pendingCount}
                      </span>
                    )}
                  </div>
                );
              })
            }
          </div>
        </div>

        {/* Right: History + Form */}
        {selectedEmp && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.surface, flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{selectedEmp.name}</div>
                <div style={{ fontSize: 11, color: C.textSub }}>{selectedEmp.department} · {selectedEmp.employeeId}</div>
              </div>
              {!showForm && (
                <button onClick={() => { setShowForm(true); setSelFolder(""); setSelSop(null); setNote(""); setErr(""); }}
                  style={{ padding: "6px 12px", borderRadius: 5, background: C.red, border: "none", color: C.white, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  + Apply Bleach
                </button>
              )}
            </div>

            {showForm && (
              <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, background: C.redLight, flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#991B1B", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Apply Bleach — {selectedEmp.name}</div>
                {err && <div style={{ fontSize: 11, color: C.red, marginBottom: 7 }}>{err}</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {relevantFolders.length === 0 ? (
                    <div style={{ padding: "10px 12px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 5, fontSize: 11, color: "#92400E" }}>
                      No approved SOPs found for <strong>{selectedEmp?.department}</strong>. Create and approve SOPs first.
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#991B1B", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>1. Select Folder</div>
                      <select value={selFolder} onChange={e => { setSelFolder(e.target.value); setSelSop(null); }} style={{ ...iStyle, fontSize: 12 }}
                        onFocus={e => e.target.style.borderColor = C.primary} onBlur={e => e.target.style.borderColor = C.border}>
                        <option value="">Select folder…</option>
                        {relevantFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </div>
                  )}
                  {selFolder && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#991B1B", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>2. Select SOP</div>
                      <select value={selSop?._id || ""} onChange={e => setSelSop(folderSops.find(s => s._id === e.target.value) || null)} style={{ ...iStyle, fontSize: 12 }}
                        onFocus={e => e.target.style.borderColor = C.primary} onBlur={e => e.target.style.borderColor = C.border}>
                        <option value="">Select SOP…</option>
                        {folderSops.map(s => <option key={s._id} value={s._id}>{s.name} ({s.points} pts)</option>)}
                      </select>
                    </div>
                  )}
                  {selSop && <div style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>−{selSop.points} pts · {selSop.description}</div>}
                  <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Additional note (optional)…" rows={2} style={{ ...iStyle, resize: "none", fontSize: 12 }}
                    onFocus={e => e.target.style.borderColor = C.primary} onBlur={e => e.target.style.borderColor = C.border} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "7px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.text, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                    <button onClick={apply} disabled={busy || !selSop} style={{ flex: 2, padding: "7px", border: "none", borderRadius: 5, background: busy || !selSop ? "#FCA5A5" : C.red, color: C.white, fontSize: 12, fontWeight: 600, cursor: busy || !selSop ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {busy ? "Applying…" : "Confirm Bleach"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
              {histLoading ? <Spinner /> : allBleaches.length === 0
                ? <div style={{ textAlign: "center", padding: "40px 0", color: C.textMuted, fontSize: 12 }}>No bleach history.</div>
                : sortedDates.map(date => (
                  <div key={date} style={{ border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 10, overflow: "hidden" }}>
                    <div style={{ padding: "7px 12px", background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{date}</span>
                      <span style={{ fontSize: 11, display: "flex", gap: 10 }}>
                        {(() => {
                          const v = grouped[date].filter(b => !isReward(b) && b.recheck?.status !== "confirmed").reduce((s, b) => s + Number(b.points), 0);
                          const r = grouped[date].filter(b => isReward(b)).reduce((s, b) => s + Number(b.points), 0);
                          return <>
                            {v > 0 && <span style={{ color: C.red, fontWeight: 600 }}>−{v.toFixed(1)} penalty</span>}
                            {r > 0 && <span style={{ color: "#15803D", fontWeight: 600 }}>+{r.toFixed(1)} reward</span>}
                          </>;
                        })()}
                      </span>
                    </div>
                    {grouped[date].map((b, i) => {
                      const rs = b.recheck?.status || "none";
                      const isRemoved = rs === "confirmed";
                      const reward = isReward(b);
                      return (
                        <div key={b._id || i}
                          style={{ padding: "10px 12px", borderBottom: i < grouped[date].length - 1 ? `1px solid ${C.borderLight}` : "none", display: "flex", alignItems: "flex-start", gap: 12, opacity: isRemoved ? 0.5 : 1 }}>
                          {/* Left: type bar */}
                          <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, flexShrink: 0, background: reward ? "#9CA3AF" : C.red, marginTop: 2 }} />
                          {/* Middle */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: reward ? "#15803D" : "#991B1B", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                {reward ? "Goal Reward" : "SOP Violation"}
                              </span>
                              {b.folderName && b.folderName !== "Uncategorized" && (
                                <span style={{ fontSize: 10, color: C.textMuted }}>{b.folderName}</span>
                              )}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, textDecoration: isRemoved ? "line-through" : "none", marginBottom: 2 }}>{b.sopName}</div>
                            {b.description && <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.5, marginBottom: 3 }}>{b.description}</div>}
                            <div style={{ fontSize: 10, color: C.textMuted }}>Applied by {b.cutByName}</div>
                            {rs === "pending" && <RecheckBadge label="Recheck pending" color="#B45309" bg="#FFFBEB" border="#FDE68A" />}
                            {rs === "confirmed" && <RecheckBadge label="Deduction removed" color="#15803D" bg="#F0FDF4" border="#BBF7D0" />}
                            {rs === "rejected" && <RecheckBadge label="Recheck denied" color={C.red} bg={C.redLight} border={C.redBorder} />}
                            {!reward && rs === "pending" && <RecheckReview bleach={b} employeeId={selectedEmp.employeeId} onDone={() => loadHistory(selectedEmp)} />}
                          </div>
                          {/* Right: points */}
                          <div style={{ flexShrink: 0, textAlign: "right" }}>
                            <span style={{
                              fontSize: 12, fontWeight: 700,
                              color: reward ? "#15803D" : isRemoved ? C.textMuted : C.red,
                              textDecoration: isRemoved ? "line-through" : "none"
                            }}>
                              {reward ? "+" : "−"}{b.points} pts
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Employee Own History ──────────────────────────────────────────────────────
function OwnHistory({ employeeId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recheckModal, setRecheckModal] = useState(null);
  const [recheckNote, setRecheckNote] = useState("");
  const [recheckBusy, setRecheckBusy] = useState(false);
  const [recheckErr, setRecheckErr] = useState("");
  const [collapsedDates, setCollapsedDates] = useState({});
  const toggleDate = (date) => setCollapsedDates(prev => ({ ...prev, [date]: !prev[date] }));

  const load = () => {
    setLoading(true);
    fetchBleachHistory(employeeId).then(d => setData(d)).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [employeeId]);

  const submitRecheck = async () => {
    if (!recheckModal) return;
    setRecheckBusy(true); setRecheckErr("");
    try {
      await requestRecheck(employeeId, recheckModal.bleachId, { requestNote: recheckNote });
      setRecheckModal(null); setRecheckNote(""); load();
    } catch (e) { setRecheckErr(e.message); }
    finally { setRecheckBusy(false); }
  };

  if (loading) return <Spinner />;
  const sopPoints = data?.sopPoints || [];
  const totalAll = sopPoints.reduce((s, y) => s + y.totalDeducted, 0);

  if (!sopPoints.length) return (
    <div style={{ padding: "40px 0", color: C.textMuted }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>Clean compliance record</div>
      <div style={{ fontSize: 12 }}>No violations or rewards recorded for this employee.</div>
    </div>
  );

  return (
    <>
      <div>

        {/* ── Summary bar ── */}
        {(() => {
          // displayTotal: flip sign so positive = good performance, negative = bad
          const displayTotal = -totalAll;
          const isClean = displayTotal === 0;
          const isPositive = displayTotal > 0; // rewards exceed violations = good
          const bgColor = isClean ? C.surface : isPositive ? "#F0FDF4" : C.redLight;
          const bdColor = isClean ? C.border : isPositive ? "#BBF7D0" : C.redBorder;
          const labelColor = isClean ? C.textMuted : isPositive ? "#15803D" : "#991B1B";
          const valColor = isClean ? C.textSub : isPositive ? "#15803D" : C.red;
          return (
            <div style={{ marginBottom: 20, padding: "14px 16px", background: bgColor, border: `1px solid ${bdColor}`, borderRadius: 6, display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: labelColor, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                  Net Penalty Score (All Time)
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: valColor, lineHeight: 1 }}>
                  {displayTotal > 0 ? `+${displayTotal.toFixed(1)}` : displayTotal.toFixed(1)}<span style={{ fontSize: 15, fontWeight: 700 }}> / 100</span> pts
                </div>
                <div style={{ fontSize: 11, color: labelColor, marginTop: 4 }}>
                  {isClean ? "No violations on record." : isPositive ? "Rewards exceed violations — keep it up." : "Violations are accumulating."}
                </div>
              </div>
              {sopPoints.map(y => (
                <div key={y.year} style={{ borderLeft: `1px solid ${bdColor}`, paddingLeft: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: labelColor, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{y.year}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: y.totalDeducted < 0 ? C.red : y.totalDeducted > 0 ? "#15803D" : C.textMuted }}>
                    {y.totalDeducted < 0 ? `${(-y.totalDeducted).toFixed(1)}` : y.totalDeducted > 0 ? `+${y.totalDeducted.toFixed(1)}` : "0.0"}<span style={{ fontSize: 13, fontWeight: 700 }}> / 100</span>
                    pts
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── Per-year history ── */}
        {sopPoints.map(yp => {
          const allB = [...(yp.bleaches || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
          const grp = allB.reduce((acc, b) => { const d = b.date || "Unknown"; if (!acc[d]) acc[d] = []; acc[d].push(b); return acc; }, {});
          const dates = Object.keys(grp).sort((a, b) => b.localeCompare(a));
          return (
            <div key={yp.year} style={{ marginBottom: 24 }}>
              {/* Year header */}
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
                {yp.year} &nbsp;·&nbsp; {yp.totalDeducted < 0 ? `−${(-yp.totalDeducted).toFixed(1)} pts penalty` : yp.totalDeducted > 0 ? `+${yp.totalDeducted.toFixed(1)} pts earned` : "0 pts net"}
              </div>

              {dates.map(date => (
                <div key={date} style={{ border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 8, overflow: "hidden" }}>
                  {/* Date row */}
                  <div onClick={() => toggleDate(date)} style={{ padding: "7px 12px", background: C.surface, borderBottom: collapsedDates[date] ? "none" : `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.textSub} strokeWidth="2.5" strokeLinecap="round">{collapsedDates[date] ? <polyline points="6 9 12 15 18 9" /> : <polyline points="18 15 12 9 6 15" />}</svg>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{date}</span>
                    </div>
                    <span style={{ fontSize: 11, display: "flex", gap: 10 }}>
                      {(() => {
                        const v = grp[date].filter(b => !isReward(b) && b.recheck?.status !== "confirmed").reduce((s, b) => s + Number(b.points), 0);
                        const r = grp[date].filter(b => isReward(b)).reduce((s, b) => s + Number(b.points), 0);
                        return <>
                          {v > 0 && <span style={{ color: C.red, fontWeight: 600 }}>−{v.toFixed(1)} penalty</span>}
                          {r > 0 && <span style={{ color: "#15803D", fontWeight: 600 }}>+{r.toFixed(1)} reward</span>}
                        </>;
                      })()}
                    </span>
                  </div>

                  {/* Entry rows */}
                  {!collapsedDates[date] && grp[date].map((b, i) => {
                    const rs = b.recheck?.status || "none";
                    const isRemoved = rs === "confirmed";
                    const reward = isReward(b);
                    return (
                      <div key={b._id || i}
                        style={{ padding: "10px 12px", borderBottom: i < grp[date].length - 1 ? `1px solid ${C.borderLight}` : "none", display: "flex", alignItems: "flex-start", gap: 12, opacity: isRemoved ? 0.5 : 1 }}>

                        {/* Left: type indicator */}
                        <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, flexShrink: 0, background: reward ? "#6B7280" : C.red, marginTop: 2 }} />

                        {/* Middle: content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: reward ? "#15803D" : "#991B1B", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                              {reward ? "Goal Reward" : "SOP Violation"}
                            </span>
                            {b.folderName && b.folderName !== "Uncategorized" && (
                              <span style={{ fontSize: 10, color: C.textMuted }}>{b.folderName}</span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, textDecoration: isRemoved ? "line-through" : "none", marginBottom: 2 }}>{b.sopName}</div>
                          {b.description && <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.5, marginBottom: 3 }}>{b.description}</div>}
                          <div style={{ fontSize: 10, color: C.textMuted }}>Applied by {b.cutByName}</div>
                          {!reward && rs === "pending" && <RecheckBadge label="Recheck pending" color="#B45309" bg="#FFFBEB" border="#FDE68A" />}
                          {!reward && rs === "confirmed" && <RecheckBadge label="Deduction removed" color="#15803D" bg="#F0FDF4" border="#BBF7D0" />}
                          {!reward && rs === "rejected" && <RecheckBadge label="Recheck denied" color={C.red} bg={C.redLight} border={C.redBorder} />}
                          {b.recheck?.reviewNote && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>Note: {b.recheck.reviewNote}</div>}
                        </div>

                        {/* Right: points + action */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                          <span style={{
                            fontSize: 12, fontWeight: 700,
                            color: reward ? "#15803D" : isRemoved ? C.textMuted : C.red,
                            textDecoration: isRemoved ? "line-through" : "none"
                          }}>
                            {reward ? "+" : "−"}{b.points} pts
                          </span>
                          {!reward && !isRemoved && rs !== "confirmed" && rs !== "pending" && (
                            <button
                              onClick={() => { setRecheckModal({ bleachId: b._id, sopName: b.sopName }); setRecheckNote(""); setRecheckErr(""); }}
                              style={{ fontSize: 10, padding: "3px 9px", border: `1px solid ${C.border}`, borderRadius: 4, background: C.white, color: C.textSub, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>
                              Dispute
                            </button>
                          )}
                          {rs === "pending" && <span style={{ fontSize: 10, color: "#B45309" }}>Under review</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {recheckModal && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 1001 }} onClick={() => setRecheckModal(null)} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(380px,90vw)", background: C.white, borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.14)", zIndex: 1002, fontFamily: "inherit", overflow: "hidden" }}>
            <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Request Recheck</div>
              <button onClick={() => setRecheckModal(null)} style={{ width: 24, height: 24, borderRadius: 5, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSub }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div style={{ padding: "16px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>
                Requesting recheck for: <span style={{ color: C.red }}>{recheckModal.sopName}</span>
              </div>
              {recheckErr && <Alert red style={{ marginBottom: 8 }}>{recheckErr}</Alert>}
              <textarea value={recheckNote} onChange={e => setRecheckNote(e.target.value)} placeholder="Explain why this deduction is incorrect…" rows={3} style={{ ...iStyle, resize: "none", marginBottom: 10 }}
                onFocus={e => e.target.style.borderColor = C.primary} onBlur={e => e.target.style.borderColor = C.border} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setRecheckModal(null)} style={{ flex: 1, padding: "8px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.white, color: C.text, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button onClick={submitRecheck} disabled={recheckBusy} style={{ flex: 2, padding: "8px", border: "none", borderRadius: 6, background: recheckBusy ? "#93C5FD" : C.primary, color: C.white, fontSize: 12, fontWeight: 600, cursor: recheckBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {recheckBusy ? "Submitting…" : "Submit Request"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Suggest Bleach Modal ──────────────────────────────────────────────────────
function SuggestBleachModal({ suggestion, employeeId, employeeName, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleApprove = async () => {
    if (!suggestion.assigneeId) return setErr("No assignee found.");
    setBusy(true); setErr("");
    try {
      await applyBleach({
        targetEmployeeId: suggestion.assigneeId,
        description: `[${suggestion.eventLabel}] ${suggestion.description} ${note}`.trim(),
        manualPoints: suggestion.suggestedPoints,
        manualSopName: suggestion.eventLabel,
        taskId: suggestion.taskId, eventKey: suggestion.eventKey,
      });
      onDone(suggestion.taskId, suggestion.eventKey);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 1001 }} onClick={() => onClose(false)} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(400px,95vw)", background: C.white, borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.16)", zIndex: 1002, fontFamily: "inherit", overflow: "hidden" }}>
        <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Apply Bleach Suggestion</div>
          <button onClick={() => onClose(false)} style={{ width: 24, height: 24, borderRadius: 5, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSub }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {err && <Alert red>{err}</Alert>}
          <div style={{ background: C.surface, borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Task</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 5 }}>{suggestion.taskTitle}</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", padding: "2px 7px", borderRadius: 4 }}>{suggestion.eventLabel}</span>
              <span style={{ fontSize: 11, color: C.textSub }}>{suggestion.assigneeName} · {suggestion.department}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#991B1B" }}>Deduction</div>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.red }}>{suggestion.suggestedPoints} pts</span>
          </div>
          <div style={{ padding: "9px 12px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 12, color: C.text }}>{suggestion.description}</div>
          </div>
          <FieldLabel label="Additional Note (optional)">
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Any additional note…" rows={2} style={{ ...iStyle, resize: "none" }}
              onFocus={e => e.target.style.borderColor = C.primary} onBlur={e => e.target.style.borderColor = C.border} />
          </FieldLabel>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onClose(true)} style={{ flex: 1, padding: "9px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.white, color: C.text, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Reject</button>
            <button onClick={handleApprove} disabled={busy} style={{ flex: 2, padding: "9px", border: "none", borderRadius: 6, background: busy ? "#FCA5A5" : C.red, color: C.white, fontSize: 12, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {busy ? "Applying…" : `Approve & Deduct ${suggestion.suggestedPoints} pts`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── C2 Band Score Card ────────────────────────────────────────────────────────
function C2ScoreCard({ c2Score, allC2Scores, role, loading }) {
  if (loading) return null;
  const globalMax = c2Score?.globalMaxPoints || 0;
  if (!globalMax) return null;

  if (role === "ceo" && allC2Scores.length > 0) {
    return (
      <div style={{ marginBottom: 20, border: "1px solid #FCD34D", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", background: "#D97706", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>🥇 C2 Band Leaderboard</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>
              Global pool: {globalMax} pts · {allC2Scores.length} employee{allC2Scores.length !== 1 ? "s" : ""} tracked
            </div>
          </div>
        </div>
        <div style={{ background: "#FFFBEB", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {[...allC2Scores]
            .sort((a, b) => (b.totalEarned || 0) - (a.totalEarned || 0))
            .slice(0, 8)
            .map((s, i) => {
              const pct = globalMax > 0 ? Math.min(100, ((s.totalEarned || 0) / globalMax) * 100) : 0;
              const barColor = pct >= 80 ? "#15803D" : pct >= 50 ? "#D97706" : "#9CA3AF";
              return (
                <div key={s.employeeId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 22, fontSize: 11, fontWeight: 700, color: "#92400E", flexShrink: 0 }}>{i + 1}.</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.employeeId}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#B45309", flexShrink: 0, marginLeft: 8 }}>{s.totalEarned || 0}/{globalMax} pts</span>
                    </div>
                    <div style={{ height: 5, background: "#FEF3C7", borderRadius: 99 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 99, transition: "width 0.5s" }} />
                    </div>
                  </div>
                </div>
              );
            })
          }
        </div>
      </div>
    );
  }

  const earned = c2Score?.totalEarned || 0;
  const pct = globalMax > 0 ? Math.min(100, (earned / globalMax) * 100) : 0;
  const barColor = pct >= 80 ? "#15803D" : pct >= 50 ? "#D97706" : "#9CA3AF";
  const breakdown = c2Score?.taskBreakdown ? Object.values(c2Score.taskBreakdown) : [];

  return (
    <div style={{ marginBottom: 20, border: "1px solid #FCD34D", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", background: "#D97706", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>🥇 Your C2 Band Score</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>Based on approved Gold Task components</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{earned}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>/ {globalMax} pts</div>
        </div>
      </div>
      <div style={{ height: 6, background: "#FEF3C7" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "width 0.6s" }} />
      </div>
      {breakdown.length > 0 ? (
        <div style={{ padding: "10px 16px", background: "#FFFBEB", display: "flex", flexDirection: "column", gap: 6 }}>
          {breakdown.map(t => {
            const tPct = t.taskMaxPoints > 0 ? Math.min(100, ((t.earnedPoints || 0) / t.taskMaxPoints) * 100) : 0;
            return (
              <div key={t.taskId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "#fff", border: "1px solid #FDE68A", borderRadius: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.taskTitle || t.taskId}</div>
                  <div style={{ fontSize: 10, color: "#92400E", marginTop: 1 }}>Weightage: {t.weightagePercent}% · Max: {t.taskMaxPoints} pts</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: tPct >= 100 ? "#15803D" : "#B45309", marginLeft: 12, flexShrink: 0 }}>{t.earnedPoints || 0}/{t.taskMaxPoints}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: "12px 16px", background: "#FFFBEB", fontSize: 11, color: "#92400E", textAlign: "center" }}>
          No Gold Task components approved yet.
        </div>
      )}
    </div>
  );
}


// ── C1 Score Card ─────────────────────────────────────────────────────────────
function C1ScoreCard({ c1Score, allC1Scores, role, loading }) {
  if (loading) return null;
  const c1Max = c1Score?.c1MaxPoints || 0;
  if (!c1Max) return null;

  if (role === "ceo" && allC1Scores.length > 0) {
    return (
      <div style={{ marginBottom: 16, border: "1px solid #BFDBFE", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", background: "#1B4F8A", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>⚡ C1 Execution Quality Leaderboard</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>
              Max: {c1Max} pts · {allC1Scores.length} employee{allC1Scores.length !== 1 ? "s" : ""} tracked
            </div>
          </div>
        </div>
        <div style={{ background: "#EBF2FA", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {[...allC1Scores]
            .filter(s => s.c1Net !== null)
            .sort((a, b) => (b.c1Net || 0) - (a.c1Net || 0))
            .slice(0, 8)
            .map((s, i) => {
              const pct = c1Max > 0 ? Math.min(100, ((s.c1Net || 0) / c1Max) * 100) : 0;
              const barColor = pct >= 80 ? "#15803D" : pct >= 50 ? "#1B4F8A" : "#9CA3AF";
              return (
                <div key={s.employeeId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 22, fontSize: 11, fontWeight: 700, color: "#1B4F8A", flexShrink: 0 }}>{i + 1}.</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.employeeId}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1B4F8A", flexShrink: 0, marginLeft: 8 }}>
                        {s.c1Net?.toFixed(1) || "0"} / {c1Max} pts
                        <span style={{ fontSize: 10, fontWeight: 400, color: "#6B7280", marginLeft: 4 }}>
                          (QR: {s.qualityRate !== null ? (s.qualityRate * 100).toFixed(0) + "%" : "—"})
                        </span>
                      </span>
                    </div>
                    <div style={{ height: 5, background: "#BFDBFE", borderRadius: 99 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 99, transition: "width 0.5s" }} />
                    </div>
                  </div>
                </div>
              );
            })
          }
        </div>
      </div>
    );
  }

  const c1Net = c1Score?.c1Net ?? null;
  const qualityRate = c1Score?.qualityRate ?? null;
  const pct = c1Net !== null && c1Max > 0 ? Math.min(100, (c1Net / c1Max) * 100) : 0;
  const barColor = pct >= 80 ? "#15803D" : pct >= 50 ? "#1B4F8A" : "#9CA3AF";
  const breakdown = c1Score?.taskBreakdown ? Object.values(c1Score.taskBreakdown) : [];

  return (
    <div style={{ marginBottom: 16, border: "1px solid #BFDBFE", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", background: "#1B4F8A", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>⚡ Your C1 Execution Score</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>
            Quality Rate: {qualityRate !== null ? (qualityRate * 100).toFixed(1) + "%" : "—"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {c1Net !== null
            ? <><div style={{ fontSize: 24, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{c1Net.toFixed(1)}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>/ {c1Max} pts</div></>
            : <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>—</div>
          }
        </div>
      </div>
      {c1Net !== null && (
        <div style={{ height: 5, background: "#BFDBFE" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "width 0.6s" }} />
        </div>
      )}
      {breakdown.length > 0 ? (
        <div style={{ padding: "10px 16px", background: "#EBF2FA", display: "flex", flexDirection: "column", gap: 6 }}>
          {breakdown.slice(0, 5).map(t => (
            <div key={t.taskId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "#fff", border: "1px solid #BFDBFE", borderRadius: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.taskTitle || t.taskId}</div>
                <div style={{ fontSize: 10, color: "#6B7280", marginTop: 1 }}>
                  ETC: {t.etcHours}h · Score: {t.taskScore?.toFixed(2)} · {t.deadlinesMissed}miss {t.extensionsFiled}ext {t.reworksReceived}rework
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: (t.taskScore || 0) >= 0.8 ? "#15803D" : (t.taskScore || 0) >= 0.5 ? "#1B4F8A" : "#B91C1C", marginLeft: 12, flexShrink: 0 }}>
                {t.taskScore?.toFixed(2) ?? "—"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "12px 16px", background: "#EBF2FA", fontSize: 11, color: "#1B4F8A", textAlign: "center" }}>
          {c1Net === null ? "No completed tasks yet. C1 score is calculated when TL approves tasks." : "No task breakdown available."}
        </div>
      )}
    </div>
  );
}

// ── PerformanceOverviewPanel ──────────────────────────────────────────────────
function PerformanceOverviewPanel({ allEmployees, threshold, setThreshold, onClose }) {
  const [c1Scores, setC1Scores] = useState([]);
  const [c2Scores, setC2Scores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    (async () => {
      try {
        const token = await firebaseAuth.currentUser?.getIdToken();
        const res = await fetch(`${BASE_URL}/cowork/sop/performance-summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) setC1Scores(data.employees || []);
      } catch (e) { console.error("perf fetch", e); }
      finally { setLoading(false); }
    })();
  }, []);

  const CATEGORIES = [
    { key: "training", label: "Needs Training", icon: "🔴", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", check: (s, t) => s < t * 0.8 },
    { key: "improvement", label: "Needs Improvement", icon: "🟡", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", check: (s, t) => s >= t * 0.8 && s < t },
    { key: "average", label: "Average", icon: "🔵", color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", check: (s, t) => s >= t && s < t * 1.4 },
    { key: "high", label: "High Performer", icon: "🟢", color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0", check: (s, t) => s >= t * 1.4 },
  ];

  const [localThreshold, setLocalThreshold] = useState(threshold);

  // Build combined score per employee
  const combined = c1Scores.map(emp => ({
    employeeId: emp.employeeId,
    name: emp.name,
    department: emp.department,
    totalEarned: emp.netScore,
    totalMax: null,
    rewards: emp.rewards,
    deductions: emp.deductions,
  }));

  const t = localThreshold;

  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    employees: combined.filter(e => cat.check(e.totalEarned, t)),
  }));

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.28)", zIndex: 999 }} onClick={onClose} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(520px,100vw)", background: "#fff",
        borderLeft: "1px solid #E5E7EB",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.1)",
        zIndex: 1000, display: "flex", flexDirection: "column",
        fontFamily: "'IBM Plex Sans',-apple-system,sans-serif",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>📊 Performance Overview</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{combined.length} employees tracked</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Threshold control */}
        <div style={{ padding: "12px 18px", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Threshold:</div>
          <input
            type="number" min="0" max="100" step="1"
            value={localThreshold}
            onChange={e => { setLocalThreshold(Number(e.target.value)); setThreshold(Number(e.target.value)); }}
            style={{ width: 70, padding: "5px 8px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, fontWeight: 700, color: "#111827", outline: "none", textAlign: "center" }}
          />
          <div style={{ fontSize: 11, color: "#6B7280" }}>pts (pass mark)</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 16, fontSize: 11, color: "#9CA3AF" }}>
            <span>🔴 &lt;{Math.round(t * 0.8)}</span>
            <span>🟡 {Math.round(t * 0.8)}–{t - 1}</span>
            <span>🔵 {t}–{Math.round(t * 1.4) - 1}</span>
            <span>🟢 {Math.round(t * 1.4)}+</span>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "scroll", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {loading ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "#9CA3AF", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B4F8A" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "sopSpin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
              Loading scores…
            </div>
          ) : combined.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
              No score data found.
            </div>
          ) : grouped.map(cat => (
            <div key={cat.key} style={{ border: `1px solid ${cat.border}`, borderRadius: 8, overflow: "hidden" }}>
              {/* Category header */}
              <div style={{ padding: "9px 14px", background: cat.bg, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>{cat.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: cat.color }}>{cat.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: cat.color, background: "#fff", padding: "1px 8px", borderRadius: 10, border: `1px solid ${cat.border}` }}>
                  {cat.employees.length} employee{cat.employees.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Employees */}
              {cat.employees.length === 0 ? (
                <div style={{ padding: "10px 14px", fontSize: 11, color: "#9CA3AF" }}>No employees in this category.</div>
              ) : <div style={{ maxHeight: 280, overflowY: "auto" }}>{cat.employees.map((emp, i) => {
                const pct = emp.totalEarned > 0 ? Math.min(100, Math.max(2, emp.totalEarned)) : 0;
                return (
                  <div key={emp.employeeId} style={{ padding: "10px 14px", borderTop: i > 0 ? "1px solid #F3F4F6" : `1px solid ${cat.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                    {/* Rank */}
                    <div style={{ width: 22, fontSize: 11, fontWeight: 700, color: cat.color, flexShrink: 0 }}>
                      {i + 1}.
                    </div>
                    {/* Employee info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{emp.name}</span>
                          {emp.department && <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 6 }}>{emp.department}</span>}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 800, color: cat.color, flexShrink: 0 }}>
                          {emp.totalEarned > 0 ? "+" : ""}{emp.totalEarned} pts
                        </span>
                      </div>
                      {/* Progress bar */}
                      {emp.totalEarned > 0 ? (
                        <>
                          <div style={{ height: 5, background: "#F1F5F9", borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: cat.color, borderRadius: 99, transition: "width 0.4s" }} />
                          </div>
                          <div style={{ marginTop: 2 }}>
                            <span style={{ fontSize: 9, color: "#9CA3AF" }}>{emp.employeeId}</span>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                          <span style={{ fontSize: 9, color: "#9CA3AF" }}>{emp.employeeId}</span>
                          <span style={{ fontSize: 9, color: "#9CA3AF", fontStyle: "italic" }}>No activity</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SopPage() {
  const { role, employeeName, employeeId, loading: authLoading } = useCoworkAuth();

  const [sops, setSops] = useState([]);
  const [folders, setFolders] = useState([]);
  const [sopsLoading, setSopsLoading] = useState(false);
  const [allEmployees, setAllEmployees] = useState([]);
  const [recheckList, setRecheckList] = useState([]);
  const [taskSuggestions, setTaskSuggestions] = useState([]);
  const [suggestBleachModal, setSuggestBleachModal] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editingSop, setEditingSop] = useState(null);
  const [bleachOpen, setBleachOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [perfOpen, setPerfOpen] = useState(false);
  const [perfThreshold, setPerfThreshold] = useState(50);

  // ── C2 Band Macro Score state ─────────────────────────────────────────────
  const [c2Score, setC2Score] = useState(null);
  const [c2Loading, setC2Loading] = useState(false);
  const [allC2Scores, setAllC2Scores] = useState([]);

  // ── C1 Band Score state ───────────────────────────────────────────────────
  const [c1Score, setC1Score] = useState(null);
  const [c1Loading, setC1Loading] = useState(false);
  const [allC1Scores, setAllC1Scores] = useState([]);

  useEffect(() => {
    if (!employeeId) return;
    setC2Loading(true);
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    firebaseAuth.currentUser?.getIdToken().then(token => {
      // Employee/TL: fetch own score
      // CEO: fetch all scores
      const url = role === "ceo"
        ? `${BASE_URL}/cowork/c2/scores`
        : `${BASE_URL}/cowork/c2/scores/${employeeId}`;
      return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    }).then(r => r?.json()).then(d => {
      if (!d?.success) return;
      if (role === "ceo" && d.scores) {
        setAllC2Scores(d.scores);
        setC2Score({ globalMaxPoints: d.globalMaxPoints });
      } else {
        setC2Score(d);
      }
    }).catch(() => { }).finally(() => setC2Loading(false));
  }, [employeeId, role]);
  // ── C1 Score fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!employeeId) return;
    setC1Loading(true);
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    firebaseAuth.currentUser?.getIdToken().then(token => {
      const url = role === "ceo"
        ? `${BASE_URL}/cowork/c1/scores`
        : `${BASE_URL}/cowork/c1/scores/${employeeId}`;
      return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    }).then(r => r?.json()).then(d => {
      if (!d?.success) return;
      if (role === "ceo" && d.scores) {
        setAllC1Scores(d.scores);
        setC1Score({ c1MaxPoints: d.c1MaxPoints, qualityRate: null, c1Net: null });
      } else {
        setC1Score(d);
      }
    }).catch(() => { }).finally(() => setC1Loading(false));
  }, [employeeId, role]);

  const [collapsedFolders, setCollapsedFolders] = useState({});
  const toggleFolder = (name) => setCollapsedFolders(prev => ({ ...prev, [name]: !prev[name] }));

  const [mgrOpen, setMgrOpen] = useState(false);
  const [primaryManager, setPrimaryManager] = useState(null);
  const [secondaryManager, setSecondaryManager] = useState(null);
  const [panelTarget, setPanelTarget] = useState("primary");
  const panelManager = panelTarget === "primary" ? primaryManager : secondaryManager;
  const panelColor = panelTarget === "primary" ? C.primary : "#6D28D9";
  const panelLabel = panelTarget === "primary" ? "Primary Manager" : "Secondary Manager";

  const loadData = useCallback(async () => {
    setSopsLoading(true);
    try {
      // Run ALL fetches in parallel — avoids sequential waterfall
      const isHeadRole = role === "ceo" || role === "tl";
      const [sopData, folderData, rData, sData] = await Promise.all([
        fetchSops().catch(() => ({ sops: [] })),
        fetchFolders().catch(() => ({ folders: [] })),
        isHeadRole ? fetchRecheckList().catch(() => ({ list: [] })) : Promise.resolve({ list: [] }),
        isHeadRole ? fetchTaskSuggestions().catch(() => ({ suggestions: [] })) : Promise.resolve({ suggestions: [] }),
      ]);
      setSops(sopData.sops || []);
      setFolders(folderData.folders || []);
      setRecheckList(rData.list || []);
      setTaskSuggestions(sData.suggestions || []);
    } catch (e) { console.error(e); }
    finally { setSopsLoading(false); }
  }, [role]);

  useEffect(() => { if (role) loadData(); }, [role, loadData]);

  useEffect(() => {
    getDocs(collection(firebaseDb, "cowork_employees"))
      .then(snap => { const a = []; snap.forEach(d => { if (d.data().role !== "ceo") a.push(d.data()); }); setAllEmployees(a); })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    firebaseAuth.currentUser?.getIdToken()
      .then(t => safeFetch(`${BASE}/cowork/employee/my-managers/${employeeId}`, { headers: { Authorization: `Bearer ${t}` } }))
      .then(d => { if (d.success) { setPrimaryManager(d.primaryManager); setSecondaryManager(d.secondaryManager); } })
      .catch(console.error);
  }, [employeeId]);

  if (authLoading) return null;

  const myDept = allEmployees.find(e => e.employeeId === employeeId)?.department || "";
  const bleachableEmps = role === "ceo" ? allEmployees : allEmployees.filter(e => e.department === myDept && e.role === "employee");
  const approvedSops = sops.filter(s => s.status === "approved");

  const handleDelete = async (sop) => {
    if (!window.confirm(`Delete SOP "${sop.name}"?`)) return;
    await deleteSop(sop._id); loadData();
  };
  const handleApprove = async (sop) => { await approveSop(sop._id); loadData(); };
  const handleReject = async (sop) => { await rejectSop(sop._id); loadData(); };
  const handleDeleteFolder = async (folder) => {
    if (!window.confirm(`Delete folder "${folder.name}"? SOPs inside will move to Uncategorized.`)) return;
    await deleteFolder(folder._id); loadData();
  };

  // ── TL view: flat folder→SOP grouping (same dept only) ──
  const grouped = {};
  sops.forEach(sop => {
    const key = sop.folderName || "Uncategorized";
    if (!grouped[key]) grouped[key] = { folderName: key, folderId: sop.folderId, sops: [] };
    grouped[key].sops.push(sop);
  });
  folders.forEach(f => { if (!grouped[f.name]) grouped[f.name] = { folderName: f.name, folderId: f._id, sops: [] }; });
  const groupedList = Object.values(grouped).sort((a, b) => {
    if (a.folderName === "Uncategorized") return 1;
    if (b.folderName === "Uncategorized") return -1;
    return a.folderName.localeCompare(b.folderName);
  });

  // ── CEO view: group by creator person → folder → SOP ──
  // personMap: {createdBy: {name, role, folders: {folderName: {folderId, sops[]} } } }
  const personMap = {};
  sops.forEach(sop => {
    const pid = sop.createdBy || "unknown";
    if (!personMap[pid]) personMap[pid] = { createdBy: pid, createdByName: sop.createdByName || "Unknown", createdByRole: sop.createdByRole || "tl", folders: {} };
    const fKey = sop.folderName || "Uncategorized";
    if (!personMap[pid].folders[fKey]) personMap[pid].folders[fKey] = { folderName: fKey, folderId: sop.folderId || null, sops: [] };
    personMap[pid].folders[fKey].sops.push(sop);
  });
  // Also include empty folders (from folders prop) under their creator
  folders.forEach(f => {
    const pid = f.createdBy || "unknown";
    if (!personMap[pid]) personMap[pid] = { createdBy: pid, createdByName: f.createdByName || "Unknown", createdByRole: f.createdByRole || "tl", folders: {} };
    if (!personMap[pid].folders[f.name]) personMap[pid].folders[f.name] = { folderName: f.name, folderId: f._id, sops: [] };
  });
  const ceoPersonList = Object.values(personMap).sort((a, b) => a.createdByName.localeCompare(b.createdByName));

  return (
    <>
      <style>{`
        @keyframes sopSpin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        @keyframes recheckPulse { 0%,100%{opacity:1} 50%{opacity:0.75} }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ padding: "20px 24px", fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif", color: C.text }}>

        {/* ── Top bar ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" }}>Standard Operating Procedure</div>
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 3 }}>
              {role === "ceo" ? "All department SOPs and compliance"
                : role === "tl" ? "Your department SOPs and team compliance"
                  : "Your compliance history"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn outline onClick={() => { setPanelTarget("primary"); setMgrOpen(true); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
              Managers
            </Btn>
            {(role === "ceo" || role === "tl") && (
              <Btn red onClick={() => setBleachOpen(true)}>SOP Breach</Btn>
            )}
            {(role === "ceo" || role === "tl") && (
              <Btn primary onClick={() => { setEditingSop(null); setShowCreate(true); }}>+ Create SOP</Btn>
            )}
            {role === "ceo" && (
              <Btn outline onClick={() => setPerfOpen(true)}>📊 Performance</Btn>
            )}
            {role === "ceo" && (
              <Btn outline onClick={() => setSettingsOpen(true)}>Settings</Btn>
            )}
          </div>
        </div>

        {/* ── C1 Execution Score Card ── */}
        <C1ScoreCard
          c1Score={c1Score}
          allC1Scores={allC1Scores}
          role={role}
          loading={c1Loading}
        />

        {/* ── C2 Band Score Card ── */}
        <C2ScoreCard
          c2Score={c2Score}
          allC2Scores={allC2Scores}
          role={role}
          loading={c2Loading}
        />

        {/* ── Pending Recheck Banner ── */}
        {(role === "ceo" || role === "tl") && recheckList.length > 0 && (
          <div onClick={() => setBleachOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", marginBottom: 16, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 7, cursor: "pointer", animation: "recheckPulse 2s ease-in-out infinite" }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>
                {recheckList.reduce((s, e) => s + e.pendingCount, 0)} Pending Recheck Request{recheckList.reduce((s, e) => s + e.pendingCount, 0) > 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 11, color: "#B45309", marginTop: 1 }}>{recheckList.map(e => e.name).join(", ")} — click to review</div>
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </div>
        )}

        {/* ── Task Bleach Suggestions ── */}
        {(role === "ceo" || role === "tl") && taskSuggestions.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
              Bleach Suggestions — {taskSuggestions.length} pending
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {taskSuggestions.map((s, i) => (
                <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", padding: "2px 7px", borderRadius: 4 }}>{s.eventLabel}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.red, background: C.redLight, border: `1px solid ${C.redBorder}`, padding: "2px 7px", borderRadius: 4 }}>{s.suggestedPoints} pts</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.taskTitle}</div>
                    <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{s.assigneeName} · {s.department}</div>
                  </div>
                  <button onClick={() => setSuggestBleachModal(s)}
                    style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: C.red, color: C.white, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                    Apply Bleach
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Employee own history ── */}
        {role === "employee" && <OwnHistory employeeId={employeeId} />}

        {/* ── SOP list ── */}
        {(role === "ceo" || role === "tl") && (
          sopsLoading ? <Spinner /> : (

            role === "ceo" ? (
              /* CEO: Person → Folder → SOP (3-level accordion) */
              ceoPersonList.length === 0
                ? <div style={{ textAlign: "center", padding: "60px 0", color: C.textMuted }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>No SOPs yet</div>
                  <div style={{ fontSize: 12 }}>Click "Create SOP" to add the first one.</div>
                </div>
                : ceoPersonList.map(person => {
                  const personKey = `person_${person.createdBy}`;
                  const personExpanded = !collapsedFolders[personKey];
                  const totalSops = Object.values(person.folders).reduce((s, f) => s + f.sops.length, 0);
                  const folderList = Object.values(person.folders).sort((a, b) => {
                    if (a.folderName === "Uncategorized") return 1;
                    if (b.folderName === "Uncategorized") return -1;
                    return a.folderName.localeCompare(b.folderName);
                  });
                  return (
                    <div key={person.createdBy} style={{ border: `1px solid ${C.primaryBorder}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                      {/* Person header */}
                      <div style={{ padding: "10px 14px", background: C.primaryLight, borderBottom: personExpanded ? `1px solid ${C.primaryBorder}` : "none", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                        onClick={() => toggleFolder(personKey)}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#fff" }}>
                          {(person.createdByName || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>{person.createdByName}</div>
                          <div style={{ fontSize: 10, color: C.textSub, marginTop: 1 }}>
                            {person.createdByRole === "ceo" ? "Admin" : "Team Lead"} · {folderList.length} folder{folderList.length !== 1 ? "s" : ""} · {totalSops} SOP{totalSops !== 1 ? "s" : ""}
                          </div>
                        </div>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round">
                          {personExpanded ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
                        </svg>
                      </div>

                      {/* Folders under this person */}
                      {personExpanded && (
                        <div style={{ background: C.white }}>
                          {folderList.map((group, fi) => {
                            const folderKey = `${person.createdBy}_${group.folderName}`;
                            const folderExpanded = !collapsedFolders[folderKey];
                            return (
                              <div key={group.folderName} style={{ borderBottom: fi < folderList.length - 1 ? `1px solid ${C.borderLight}` : "none" }}>
                                {/* Folder row */}
                                <div style={{ padding: "9px 14px 9px 18px", background: C.surface, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", borderBottom: folderExpanded && group.sops.length > 0 ? `1px solid ${C.borderLight}` : "none" }}
                                  onClick={() => toggleFolder(folderKey)}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textSub} strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text, flex: 1 }}>{group.folderName}</span>
                                  <span style={{ fontSize: 10, color: C.textMuted, marginRight: 6 }}>{group.sops.length} SOP{group.sops.length !== 1 ? "s" : ""}</span>
                                  {group.folderName !== "Uncategorized" && group.folderId && (
                                    <button onClick={e => { e.stopPropagation(); handleDeleteFolder({ _id: group.folderId, name: group.folderName }); }}
                                      style={{ padding: "1px 7px", border: `1px solid ${C.redBorder}`, borderRadius: 4, background: C.redLight, color: C.red, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                      Delete
                                    </button>
                                  )}
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.textSub} strokeWidth="2.5" strokeLinecap="round">
                                    {folderExpanded ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
                                  </svg>
                                </div>
                                {/* SOPs in this folder */}
                                {folderExpanded && (
                                  <div>
                                    {group.sops.length === 0
                                      ? <div style={{ padding: "10px 18px", fontSize: 11, color: C.textMuted }}>No SOPs in this folder yet.</div>
                                      : group.sops.map((sop, idx) => (
                                        <div key={sop._id} style={{ padding: "10px 18px", borderBottom: idx < group.sops.length - 1 ? `1px solid ${C.borderLight}` : "none" }}>
                                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>{sop.name}</div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                              <span style={{ fontWeight: 700, color: C.red, background: C.redLight, border: `1px solid ${C.redBorder}`, padding: "2px 7px", borderRadius: 4, fontSize: 11 }}>{sop.points} pts</span>
                                              <StatusBadge status={sop.status} />
                                            </div>
                                          </div>
                                          <div style={{ fontSize: 11, color: C.textSub, marginBottom: 4 }}>{sop.department}</div>
                                          {sop.description && <div style={{ fontSize: 11, color: C.textSub, marginBottom: 6, lineHeight: 1.45 }}>{sop.description}</div>}
                                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                                            {sop.status === "pending" && (
                                              <><SmBtn green onClick={() => handleApprove(sop)}>Approve</SmBtn><SmBtn red onClick={() => handleReject(sop)}>Reject</SmBtn></>
                                            )}
                                            <SmBtn blue onClick={() => { setEditingSop(sop); setShowCreate(true); }}>Edit</SmBtn>
                                            <SmBtn red onClick={() => handleDelete(sop)}>Delete</SmBtn>
                                          </div>
                                        </div>
                                      ))
                                    }
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
            ) : (
              /* TL: flat folder → SOP (original layout) */
              groupedList.length === 0
                ? <div style={{ textAlign: "center", padding: "60px 0", color: C.textMuted }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>No SOPs yet</div>
                  <div style={{ fontSize: 12 }}>Click "Create SOP" to add the first one.</div>
                </div>
                : groupedList.map(group => (
                  <div key={group.folderName} style={{ border: `1px solid ${C.border}`, borderRadius: 7, overflow: "hidden", marginBottom: 12 }}>
                    <div style={{ background: C.surface, borderBottom: collapsedFolders[group.folderName] ? "none" : `1px solid ${C.border}`, padding: "9px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                      <button onClick={() => toggleFolder(group.folderName)}
                        style={{ width: 22, height: 22, borderRadius: 4, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.textSub} strokeWidth="2.5" strokeLinecap="round">
                          {collapsedFolders[group.folderName] ? <polyline points="6 9 12 15 18 9" /> : <polyline points="18 15 12 9 6 15" />}
                        </svg>
                      </button>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textSub} strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>{group.folderName}</span>
                      <span style={{ fontSize: 11, color: C.textMuted, marginRight: 8 }}>{group.sops.length} SOP{group.sops.length !== 1 ? "s" : ""}</span>
                      {group.folderName !== "Uncategorized" && group.folderId && folders.find(f => f._id === group.folderId)?.createdBy === employeeId && (
                        <button onClick={() => handleDeleteFolder({ _id: group.folderId, name: group.folderName })}
                          style={{ padding: "2px 8px", border: `1px solid ${C.redBorder}`, borderRadius: 4, background: C.redLight, color: C.red, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          Delete
                        </button>
                      )}
                    </div>
                    {!collapsedFolders[group.folderName] && (
                      <div style={{ background: C.white }}>
                        {group.sops.length === 0
                          ? <div style={{ padding: "12px 14px", fontSize: 12, color: C.textMuted }}>No SOPs in this folder yet.</div>
                          : group.sops.map((sop, idx) => (
                            <div key={sop._id} style={{ padding: "11px 14px", borderBottom: idx < group.sops.length - 1 ? `1px solid ${C.borderLight}` : "none" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>{sop.name}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                  <span style={{ fontWeight: 700, color: C.red, background: C.redLight, border: `1px solid ${C.redBorder}`, padding: "2px 7px", borderRadius: 4, fontSize: 11 }}>{sop.points} pts</span>
                                  <StatusBadge status={sop.status} />
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 11, color: C.textSub, background: C.surface, padding: "1px 6px", borderRadius: 4, border: `1px solid ${C.border}` }}>{sop.department}</span>
                                <span style={{ fontSize: 11, color: C.textSub }}>{sop.createdByName} · {sop.createdByRole === "ceo" ? "Admin" : "Team Lead"}</span>
                              </div>
                              {sop.description && <div style={{ fontSize: 11, color: C.textSub, marginBottom: 7, lineHeight: 1.45 }}>{sop.description}</div>}
                              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                                {sop.status === "pending" && (
                                  <><SmBtn green onClick={() => handleApprove(sop)}>Approve</SmBtn><SmBtn red onClick={() => handleReject(sop)}>Reject</SmBtn></>
                                )}
                                {sop.createdBy === employeeId && (
                                  <><SmBtn blue onClick={() => { setEditingSop(sop); setShowCreate(true); }}>Edit</SmBtn><SmBtn red onClick={() => handleDelete(sop)}>Delete</SmBtn></>
                                )}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    )}
                  </div>
                ))
            )
          )
        )}
      </div>

      {/* ── Panels & Modals ── */}
      {showCreate && (
        <SopForm
          editing={editingSop} role={role} myDept={myDept}
          employeeId={employeeId} employeeName={employeeName}
          folders={folders}
          allDepts={[...new Set(allEmployees.map(e => e.department).filter(Boolean))].sort()}
          onClose={() => { setShowCreate(false); setEditingSop(null); }}
          onSaved={loadData}
        />
      )}

      {bleachOpen && (
        <BleachPanel
          role={role} employees={bleachableEmps}
          approvedSops={approvedSops} folders={folders}
          employeeId={employeeId} employeeName={employeeName}
          recheckList={recheckList}
          onClose={() => setBleachOpen(false)}
        />
      )}

      {mgrOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 999 }} onClick={() => setMgrOpen(false)} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(360px,100vw)", background: C.white, borderLeft: `1px solid ${C.border}`, boxShadow: "-4px 0 20px rgba(0,0,0,0.08)", zIndex: 1000, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
            <div style={{ background: panelColor, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <Av name={panelManager?.name} url={panelManager?.profilePhotoUrl} size={40} bg="rgba(255,255,255,0.2)" fg="#fff" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.65)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>{panelLabel}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{panelManager?.name || "Not assigned"}</div>
                {panelManager?.designation && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>{panelManager.designation}</div>}
              </div>
              <button onClick={() => setMgrOpen(false)} style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "rgba(255,255,255,0.18)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
              {["primary", "secondary"].map(t => (
                <button key={t} onClick={() => setPanelTarget(t)}
                  style={{ flex: 1, padding: "9px 8px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, background: panelTarget === t ? C.primaryLight : C.white, color: panelTarget === t ? C.primary : C.textSub, borderBottom: panelTarget === t ? `2px solid ${C.primary}` : "2px solid transparent" }}>
                  {t === "primary" ? "Primary" : "Secondary"}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
              {!panelManager
                ? <div style={{ textAlign: "center", padding: "40px 0", color: C.textMuted, fontSize: 13 }}>Not assigned in HR records.</div>
                : <>
                  <PRow label="Full Name" value={panelManager.name} />
                  <PRow label="Designation" value={panelManager.designation} />
                  <PRow label="Department" value={panelManager.department} />
                  <PRow label="Employee ID" value={panelManager.biometricId ? <code style={{ fontFamily: "monospace", fontWeight: 700, color: C.text, background: C.borderLight, padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>{panelManager.biometricId}</code> : null} />
                  <PRow label="Phone" value={panelManager.phone ? <a href={`tel:${panelManager.phone}`} style={{ color: panelColor, fontWeight: 600, textDecoration: "none" }}>{panelManager.phone}</a> : null} />
                  <PRow label="Email" value={panelManager.email ? <a href={`mailto:${panelManager.email}`} style={{ color: panelColor, fontWeight: 600, textDecoration: "none", wordBreak: "break-all", fontSize: 11 }}>{panelManager.email}</a> : null} />
                </>
              }
            </div>
          </div>
        </>
      )}

      {suggestBleachModal && (
        <SuggestBleachModal
          suggestion={suggestBleachModal}
          employeeId={employeeId} employeeName={employeeName}
          onClose={(rejected) => {
            if (rejected) {
              setTaskSuggestions(prev => prev.filter(s => !(s.taskId === suggestBleachModal.taskId && s.eventKey === suggestBleachModal.eventKey)));
              dismissTaskSuggestion({ taskId: suggestBleachModal.taskId, eventKey: suggestBleachModal.eventKey, assigneeId: suggestBleachModal.assigneeId }).catch(console.error);
            }
            setSuggestBleachModal(null);
          }}
          onDone={(appliedTaskId, appliedEventKey) => {
            setSuggestBleachModal(null);
            setTaskSuggestions(prev => prev.filter(s => !(s.taskId === appliedTaskId && s.eventKey === appliedEventKey)));
          }}
        />
      )}

      {settingsOpen && (
        <SopSettingsPanel
          employeeId={employeeId}
          employeeName={employeeName}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {perfOpen && (
        <PerformanceOverviewPanel
          allEmployees={allEmployees}
          threshold={perfThreshold}
          setThreshold={setPerfThreshold}
          onClose={() => setPerfOpen(false)}
        />
      )}
    </>
  );
}