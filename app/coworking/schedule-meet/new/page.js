"use client";
/**
 * app/coworking/schedule-meet/new/page.js
 *
 * UPDATED: Google Meet link is now optional.
 * Cowork Meeting (LiveKit) is the primary meeting method.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../../hooks/useCoworkAuth";
import { scheduleMeet, listEmployees } from "../../../../lib/coworkApi";
import { GwAvatar } from "../../../../components/coworking/shared/CoworkShared";

export default function NewMeetPage() {
  const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    title: "", description: "", dateTime: "", googleMeetLink: "",
  });
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && (!user || role !== "ceo"))
      router.push(user ? "/coworking/schedule-meet" : "/");
  }, [user, role, loading]);

  useEffect(() => {
    if (user && role === "ceo")
      listEmployees().then(d => setEmployees(d.employees || [])).catch(() => { });
  }, [user, role]);

  const toggle = (id) =>
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selected.length) { setError("Select at least one participant."); return; }
    setError(""); setBusy(true);
    try {
      await scheduleMeet({ ...form, participants: selected });
      router.push("/coworking/schedule-meet");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (loading || !user || role !== "ceo") return null;

  return (
    <>
      <button
        onClick={() => router.push("/coworking/schedule-meet")}
        style={backBtn}
      >
        ← Back
      </button>

      <div style={cardWrap}>
        <h2 style={titleSt}>Schedule New Meeting</h2>
        <p style={subSt}>Participants will receive a notification and can join via Cowork Meeting.</p>

        {error && <div style={errBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Title */}
          <Field label="Meeting Title *">
            <input style={inp} value={form.title} onChange={e => set("title", e.target.value)}
              placeholder="e.g. Weekly Sync" required />
          </Field>

          {/* Description */}
          <Field label="Description">
            <textarea style={{ ...inp, height: 70, resize: "vertical" }}
              value={form.description} onChange={e => set("description", e.target.value)}
              placeholder="What's this meeting about? (optional)" />
          </Field>

          {/* Date Time */}
          <Field label="Date & Time *">
            <input type="datetime-local" style={inp} value={form.dateTime}
              onChange={e => set("dateTime", e.target.value)} required />
          </Field>

          {/* Google Meet (optional) */}
          <Field label="Google Meet Link (optional)">
            <input type="url" style={inp} value={form.googleMeetLink}
              onChange={e => set("googleMeetLink", e.target.value)}
              placeholder="https://meet.google.com/xxx — leave blank to use only Cowork Meeting" />
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9AA0A6" }}>
              💡 Cowork Meeting (built-in video call) will always be available. Google Meet is an optional fallback.
            </p>
          </Field>

          {/* Participants */}
          <Field label={`Participants (${selected.length} selected) *`}>
            <div style={participantGrid}>
              {employees.map(emp => {
                const sel = selected.includes(emp.employeeId);
                return (
                  <button
                    key={emp.employeeId} type="button"
                    onClick={() => toggle(emp.employeeId)}
                    style={{
                      ...participantBtn,
                      border: `1.5px solid ${sel ? "#1A73E8" : "#DADCE0"}`,
                      background: sel ? "#E8F0FE" : "#fff",
                      color: sel ? "#1A73E8" : "#3C4043",
                    }}
                  >
                    <GwAvatar name={emp.name} size={22} />
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{emp.name}</span>
                    {sel && <span style={{ marginLeft: "auto", color: "#1A73E8", fontSize: 12 }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8 }}>
            <button type="button" onClick={() => router.push("/coworking/schedule-meet")} style={cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={busy} style={{ ...submitBtn, opacity: busy ? 0.7 : 1 }}>
              {busy ? "Scheduling..." : "📅 Schedule Meeting"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  );
}

const backBtn = {
  padding: "8px 16px", border: "1px solid #DADCE0", borderRadius: "8px",
  background: "#fff", color: "#1A73E8", fontSize: "13px", fontWeight: 500,
  cursor: "pointer", marginBottom: "16px", fontFamily: "'Google Sans',sans-serif",
};
const cardWrap = {
  background: "#fff", borderRadius: "12px", padding: "28px 32px",
  border: "1px solid #E8EAED", maxWidth: "700px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};
const titleSt = {
  margin: "0 0 4px", fontSize: "22px", fontWeight: 500,
  color: "#202124", fontFamily: "'Google Sans',sans-serif",
};
const subSt = { margin: "0 0 24px", fontSize: "13px", color: "#5F6368" };
const errBox = {
  background: "#FCE8E6", borderRadius: "8px", padding: "10px 14px",
  color: "#C5221F", fontSize: "13px", marginBottom: "16px",
};
const lbl = {
  fontSize: "11px", fontWeight: 600, color: "#5F6368",
  textTransform: "uppercase", letterSpacing: "0.5px",
};
const inp = {
  padding: "10px 14px", border: "1.5px solid #DADCE0", borderRadius: "8px",
  fontSize: "14px", color: "#202124", fontFamily: "'Roboto',sans-serif",
  outline: "none", width: "100%", boxSizing: "border-box",
  transition: "border-color 0.15s",
};
const participantGrid = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: 8, maxHeight: 180, overflowY: "auto",
  padding: "2px 0",
};
const participantBtn = {
  display: "flex", alignItems: "center", gap: 7, padding: "7px 10px",
  borderRadius: "8px", cursor: "pointer", fontFamily: "inherit",
  transition: "all 0.12s",
};
const cancelBtn = {
  padding: "10px 24px", border: "1px solid #DADCE0", borderRadius: "8px",
  background: "transparent", color: "#3C4043", fontSize: "14px",
  fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
};
const submitBtn = {
  padding: "10px 28px", background: "#1A73E8", color: "#fff",
  border: "none", borderRadius: "8px", fontSize: "14px",
  fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  boxShadow: "0 2px 8px rgba(26,115,232,0.3)",
};