"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { createEmployee, listEmployees } from "../../../lib/coworkApi";
import { GwAvatar } from "../../../components/coworking/shared/CoworkShared";

const DEPTS = ["HR", "Sales", "Operations", "Design", "Engineering", "Finance", "Marketing", "Management"];

export default function CreateEmployeePage() {
  const { user, role, loading } = useCoworkAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", mobile: "", city: "", department: "" });
  const [empRole, setEmpRole] = useState("employee"); // "employee" | "tl"
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [employees, setEmployees] = useState([]);
  const [tab, setTab] = useState("create");

  useEffect(() => {
    if (!loading && (!user || role !== "ceo")) {
      router.push(user ? "/coworking" : "/coworking-login");
    }
  }, [user, role, loading, router]);

  useEffect(() => {
    if (user && role === "ceo") {
      loadEmployees();
    }
  }, [user, role]);

  const loadEmployees = async () => {
    try {
      const data = await listEmployees();
      setEmployees(data.employees || []);
    } catch (error) {
      console.error("Failed to load employees:", error);
    }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);
    setBusy(true);

    try {
      // Send role to backend as expected
      const payload = {
        ...form,
        role: empRole  // This will be sent to backend
      };

      console.log("Creating employee with payload:", payload); // Debug log

      const d = await createEmployee(payload);

      console.log("Employee created response:", d); // Debug log

      setResult({
        ...d,
        role: empRole
      });

      // Clear form
      setForm({ name: "", email: "", mobile: "", city: "", department: "" });
      setEmpRole("employee");

      // Refresh employee list
      await loadEmployees();

    } catch (e) {
      console.error("Creation error:", e); // Debug log
      setError(e.message || "Failed to create employee");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user || role !== "ceo") return null;

  return (
    <>
      <div style={s.tabs}>
        {["create", "directory"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}>
            {t === "create" ? "Add Employee" : `Directory (${employees.length})`}
          </button>
        ))}
      </div>

      {tab === "create" && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>Add New Employee</h2>

          {error && <div style={s.err}>⚠️ {error}</div>}

          {result && (
            <div style={s.success}>
              <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: "15px" }}>
                ✅ Employee created successfully!
              </p>
              <p style={{ margin: 0, fontSize: "13px" }}>
                <strong>Employee ID:</strong> {result.employeeId}<br />
                <strong>Role:</strong> {result.role === "tl" ? "Team Lead" : "Employee"}
              </p>
              <p style={{ margin: "8px 0 0", fontSize: "13px" }}>Share credentials securely:</p>
              <div style={{ background: "#e6f4ea", borderRadius: "6px", padding: "12px 16px", marginTop: "8px", fontFamily: "monospace", fontSize: "13px" }}>
                <div>Email: <strong>{form.email}</strong></div>
                <div>Temp password: <strong>{result.tempPassword}</strong></div>
                <div style={{ fontSize: "11px", color: "#5f6368", marginTop: "4px", fontFamily: "sans-serif" }}>
                  Employee can change this after login.
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleCreate} style={s.form}>
            {/* Role toggle - This WILL be sent to backend */}
            <div style={s.field}>
              <label style={s.label}>Role</label>
              <div style={{ display: "flex", gap: "0", border: "1px solid #dadce0", borderRadius: "6px", overflow: "hidden", width: "fit-content" }}>
                <button
                  type="button"
                  onClick={() => setEmpRole("employee")}
                  style={{
                    padding: "9px 24px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600,
                    background: empRole === "employee" ? "#1a73e8" : "#fff",
                    color: empRole === "employee" ? "#fff" : "#5f6368",
                    fontFamily: "sans-serif", transition: "all 0.15s",
                  }}
                >
                  👤 Employee
                </button>
                <button
                  type="button"
                  onClick={() => setEmpRole("tl")}
                  style={{
                    padding: "9px 24px", border: "none", borderLeft: "1px solid #dadce0", cursor: "pointer", fontSize: "13px", fontWeight: 600,
                    background: empRole === "tl" ? "#1a73e8" : "#fff",
                    color: empRole === "tl" ? "#fff" : "#5f6368",
                    fontFamily: "sans-serif", transition: "all 0.15s",
                  }}
                >
                  ⭐ Team Lead (TL)
                </button>
              </div>
              {empRole === "tl" && (
                <div style={{ fontSize: "12px", color: "#1a73e8", marginTop: "4px", background: "#e8f0fe", padding: "6px 10px", borderRadius: "4px" }}>
                  ℹ️ Team Leads can create subtasks and approve tasks from their team members.
                </div>
              )}
            </div>

            <div style={s.row}>
              <GwField label="Full Name" value={form.name} onChange={v => set("name", v)} placeholder="e.g. Ramesh Kumar" />
              <GwField label="Email Address" type="email" value={form.email} onChange={v => set("email", v)} placeholder="ramesh@company.com" />
            </div>
            <div style={s.row}>
              <GwField label="Mobile" value={form.mobile} onChange={v => set("mobile", v)} placeholder="+91 9999999999" />
              <GwField label="City" value={form.city} onChange={v => set("city", v)} placeholder="Bhubaneswar" />
            </div>
            <div style={s.field}>
              <label style={s.label}>Department</label>
              <select
                style={s.input}
                value={form.department}
                onChange={e => set("department", e.target.value)}
                required
              >
                <option value="">Select department</option>
                {DEPTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" disabled={busy} style={s.submitBtn}>
                {busy ? "Creating..." : `Create ${empRole === "tl" ? "Team Lead" : "Employee"}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === "directory" && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>Employee Directory ({employees.length})</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", fontFamily: "sans-serif" }}>
              <thead>
                <tr>
                  {["ID", "Name", "Role", "Email", "Department", "City", "Mobile"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "#5f6368", borderBottom: "1px solid #e8eaed", background: "#f8f9fa" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.employeeId} style={{ borderBottom: "1px solid #f1f3f4" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontFamily: "monospace", fontSize: "12px", background: "#e8f0fe", color: "#1a73e8", padding: "2px 8px", borderRadius: "4px", fontWeight: 500 }}>
                        {emp.employeeId}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <GwAvatar name={emp.name} size={28} />
                        <span style={{ fontWeight: 500, color: "#202124" }}>
                          {emp.name}
                          {emp.role === "tl" && (
                            <span style={{ marginLeft: 6, fontSize: "11px", color: "#1a73e8", background: "#e8f0fe", padding: "1px 6px", borderRadius: "10px", fontWeight: 600 }}>
                              TL
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {emp.role === "tl" ? (
                        <span style={{ background: "#e8f0fe", color: "#1a73e8", padding: "2px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600 }}>⭐ Team Lead</span>
                      ) : emp.role === "ceo" ? (
                        <span style={{ background: "#fce8e6", color: "#c5221f", padding: "2px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600 }}>👑 CEO</span>
                      ) : (
                        <span style={{ background: "#e6f4ea", color: "#1e8e3e", padding: "2px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600 }}>👤 Employee</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px", color: "#5f6368" }}>{emp.email}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ background: "#e8f0fe", color: "#1a73e8", padding: "2px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 500 }}>
                        {emp.department}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", color: "#5f6368" }}>{emp.city}</td>
                    <td style={{ padding: "12px 14px", color: "#5f6368" }}>{emp.mobile}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function GwField({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{ fontSize: "12px", fontWeight: 500, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required
        style={{ padding: "10px 14px", border: "1px solid #dadce0", borderRadius: "4px", fontSize: "14px", color: "#202124", fontFamily: "sans-serif", outline: "none", background: "#fff", width: "100%", boxSizing: "border-box" }}
      />
    </div>
  );
}

const s = {
  tabs: { display: "flex", marginBottom: "20px", borderBottom: "1px solid #e8eaed", fontFamily: "sans-serif" },
  tab: { padding: "12px 20px", border: "none", background: "transparent", color: "#5f6368", fontSize: "14px", fontWeight: 500, cursor: "pointer", borderBottom: "2px solid transparent", marginBottom: "-1px" },
  tabActive: { color: "#1a73e8", borderBottom: "2px solid #1a73e8" },
  card: { background: "#fff", borderRadius: "8px", padding: "24px", border: "1px solid #e8eaed" },
  cardTitle: { margin: "0 0 20px", fontSize: "20px", fontWeight: 400, color: "#202124", fontFamily: "sans-serif" },
  form: { display: "flex", flexDirection: "column", gap: "18px" },
  row: { display: "flex", gap: "16px" },
  field: { display: "flex", flexDirection: "column", gap: "6px" },
  label: { fontSize: "12px", fontWeight: 500, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.5px" },
  input: { padding: "10px 14px", border: "1px solid #dadce0", borderRadius: "4px", fontSize: "14px", color: "#202124", fontFamily: "sans-serif", outline: "none" },
  submitBtn: { padding: "10px 28px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: "4px", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
  err: { background: "#fce8e6", border: "1px solid #f5c6c6", borderRadius: "4px", padding: "10px 14px", color: "#c5221f", fontSize: "13px", marginBottom: "16px" },
  success: { background: "#e6f4ea", border: "1px solid #b7dfb8", borderRadius: "6px", padding: "16px", marginBottom: "20px", color: "#137333" },
};