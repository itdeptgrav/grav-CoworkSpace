"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../../components/coworking/layout/CoworkingShell";
import { scheduleMeet, listEmployees } from "../../../../lib/coworkApi";
import { GwAvatar } from "../../../../components/coworking/shared/CoworkShared";

export default function NewMeetPage() {
  const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
  const router = useRouter();
  const [form, setForm] = useState({ title: "", description: "", dateTime: "", googleMeetLink: "" });
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!loading && (!user || role !== "ceo")) router.push(user ? "/coworking/schedule-meet" : "/coworking-login"); }, [user, role, loading]);
  useEffect(() => { if (user && role === "ceo") listEmployees().then(d => setEmployees(d.employees || [])).catch(() => { }); }, [user, role]);

  const toggle = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selected.length) { setError("Select at least one participant."); return; }
    setError(""); setBusy(true);
    try { await scheduleMeet({ ...form, participants: selected }); router.push("/coworking/schedule-meet"); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (loading || !user || role !== "ceo") return null;
  return (
    <>
      <button onClick={() => router.push("/coworking/schedule-meet")} style={{ padding: "8px 16px", border: "1px solid #dadce0", borderRadius: "4px", background: "#fff", color: "#1a73e8", fontSize: "13px", fontWeight: 500, cursor: "pointer", marginBottom: "16px", fontFamily: "'Google Sans',sans-serif" }}>← Back</button>
      <div style={{ background: "#fff", borderRadius: "8px", padding: "28px", border: "1px solid #e8eaed", maxWidth: "700px" }}>
        <h2 style={{ margin: "0 0 20px", fontSize: "22px", fontWeight: 400, color: "#202124", fontFamily: "'Google Sans',sans-serif" }}>New meeting</h2>
        {error && <div style={{ background: "#fce8e6", borderRadius: "4px", padding: "10px 14px", color: "#c5221f", fontSize: "13px", marginBottom: "16px" }}>{error}</div>}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={lbl}>Meeting title *</label>
            <input style={inp} value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Weekly sync" required />
          </div>
          <div style={{ display: "flex", gap: "16px" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={lbl}>Date & time *</label>
              <input type="datetime-local" style={inp} value={form.dateTime} onChange={e => set("dateTime", e.target.value)} required />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={lbl}>Google Meet link *</label>
              <input type="url" style={inp} value={form.googleMeetLink} onChange={e => set("googleMeetLink", e.target.value)} placeholder="https://meet.google.com/xxx" required />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={lbl}>Participants ({selected.length} selected)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", maxHeight: "160px", overflowY: "auto" }}>
              {employees.map(emp => {
                const sel = selected.includes(emp.employeeId);
                return (
                  <button key={emp.employeeId} type="button" onClick={() => toggle(emp.employeeId)}
                    style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", border: `1px solid ${sel ? "#1a73e8" : "#dadce0"}`, borderRadius: "20px", background: sel ? "#e8f0fe" : "#fff", cursor: "pointer", color: sel ? "#1a73e8" : "#3c4043", fontSize: "13px", fontWeight: 500 }}>
                    <GwAvatar name={emp.name} size={22} />{emp.name}{sel && <span style={{ color: "#1a73e8" }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button type="button" onClick={() => router.push("/coworking/schedule-meet")} style={{ padding: "10px 24px", border: "none", background: "transparent", color: "#1a73e8", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ padding: "10px 24px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: "4px", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}>{busy ? "Scheduling..." : "Schedule"}</button>
          </div>
        </form>
      </div>

    </>
  );
}
const lbl = { fontSize: "12px", fontWeight: 500, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.5px" };
const inp = { padding: "10px 14px", border: "1px solid #dadce0", borderRadius: "4px", fontSize: "14px", color: "#202124", fontFamily: "'Roboto',sans-serif", outline: "none", width: "100%", boxSizing: "border-box" };