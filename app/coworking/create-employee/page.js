"use client";
/**
 * GRAV-CMS/app/coworking/create-employee/page.js
 * CHANGES:
 *  1. Directory tab redesigned — formal, professional table (no emoji badges)
 *  2. Reset Password button per employee row in directory
 *  3. Reset Password modal — CEO enters new password, calls POST /employee/:id/reset-password
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { createEmployee, listEmployees, deleteEmployee } from "../../../lib/coworkApi";
import { GwAvatar } from "../../../components/coworking/shared/CoworkShared";
import { firebaseAuth } from "../../../lib/coworkFirebase";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// ── Reset password API call (CEO resets any employee's password) ──────────────
async function resetEmployeePassword(employeeId, newPassword) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(`${BASE}/cowork/employee/${employeeId}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Reset failed");
  return data;
}

export default function CreateEmployeePage() {
  const { user, role, loading } = useCoworkAuth();
  const router = useRouter();

  const [form, setForm] = useState({ name: "", email: "", mobile: "", city: "", department: "" });
  const [empRole, setEmpRole] = useState("employee");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [employees, setEmployees] = useState([]);
  const [tab, setTab] = useState("create");
  const [customDept, setCustomDept] = useState(false);

  // ── Reset password modal state ──────────────────────────────────────────
  const [resetModal, setResetModal] = useState(null);  // { employeeId, name }
  const [deleteModal, setDeleteModal] = useState(null); // { employeeId, name, email }
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [resetPwd, setResetPwd] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  // ── Change role modal state ─────────────────────────────────────────────
  const [roleModal, setRoleModal] = useState(null);  // { employeeId, name, currentRole }
  const [roleBusy, setRoleBusy] = useState(false);
  const [roleError, setRoleError] = useState("");

  useEffect(() => {
    if (!loading && (!user || role !== "ceo")) {
      router.push(user ? "/coworking" : "/");
    }
  }, [user, role, loading, router]);

  useEffect(() => {
    if (user && role === "ceo") loadEmployees();
  }, [user, role]);

  const loadEmployees = async () => {
    try {
      const data = await listEmployees();
      setEmployees(data.employees || []);
    } catch (e) {
      console.error("Failed to load employees:", e);
    }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(""); setResult(null); setBusy(true);
    try {
      const d = await createEmployee({ ...form, role: empRole });
      setResult({ ...d, role: empRole });
      setForm({ name: "", email: "", mobile: "", city: "", department: "" });
      setEmpRole("employee");
      await loadEmployees();
    } catch (e) {
      setError(e.message || "Failed to create employee");
    } finally {
      setBusy(false);
    }
  };

  const openReset = (emp) => {
    setResetModal({ employeeId: emp.employeeId, name: emp.name });
    setResetPwd(""); setResetError(""); setResetSuccess(""); setShowPwd(false);
  };

  const closeReset = () => {
    if (resetBusy) return;
    setResetModal(null);
  };

  // ── Delete employee ────────────────────────────────────────────────────────
  const openDelete = (emp) => { setDeleteModal(emp); setDeleteError(""); };
  const closeDelete = () => { if (deleteBusy) return; setDeleteModal(null); setDeleteError(""); };
  const handleDelete = async () => {
    if (!deleteModal || deleteBusy) return;
    setDeleteBusy(true); setDeleteError("");
    try {
      await deleteEmployee(deleteModal.employeeId);
      setDeleteModal(null);
      // Refresh employee list
      const data = await listEmployees();
      setEmployees(data.employees || []);
    } catch (e) {
      setDeleteError(e.message || "Delete failed. Please try again.");
    } finally {
      setDeleteBusy(false);
    }
  };

  // ── Change role ───────────────────────────────────────────────────────────
  const openRole = (emp) => { setRoleModal({ employeeId: emp.employeeId, name: emp.name, currentRole: emp.role }); setRoleError(""); };
  const closeRole = () => { if (roleBusy) return; setRoleModal(null); setRoleError(""); };
  const handleChangeRole = async (newRole) => {
    if (!roleModal || roleBusy) return;
    setRoleBusy(true); setRoleError("");
    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error("Not authenticated");
      const token = await user.getIdToken();
      const res = await fetch(`${BASE}/cowork/employee/${roleModal.employeeId}/change-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Role change failed");
      setRoleModal(null);
      const refreshed = await listEmployees();
      setEmployees(refreshed.employees || []);
    } catch (e) {
      setRoleError(e.message || "Role change failed.");
    } finally {
      setRoleBusy(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!resetPwd || resetPwd.length < 6) { setResetError("Password must be at least 6 characters."); return; }
    setResetBusy(true); setResetError(""); setResetSuccess("");
    try {
      await resetEmployeePassword(resetModal.employeeId, resetPwd);
      setResetSuccess(`Password reset successfully for ${resetModal.name}.`);
      setResetPwd("");
    } catch (e) {
      setResetError(e.message || "Reset failed.");
    } finally {
      setResetBusy(false);
    }
  };

  if (loading || !user || role !== "ceo") return null;

  // Role text + style — no emojis, formal
  const roleLabel = (r) => r === "ceo" ? "CEO" : r === "tl" ? "Team Lead" : "Employee";
  const roleStyle = (r) => ({
    display: "inline-block", padding: "2px 9px", borderRadius: 3,
    fontSize: 11, fontWeight: 600, letterSpacing: "0.03em", border: "1px solid",
    ...(r === "ceo"
      ? { color: "#7f1d1d", background: "#fff1f2", borderColor: "#fecdd3" }
      : r === "tl"
        ? { color: "#1e3a5f", background: "#eff6ff", borderColor: "#bfdbfe" }
        : { color: "#14532d", background: "#f0fdf4", borderColor: "#bbf7d0" }),
  });

  return (
    <>
      {/* Tabs */}
      <div style={s.tabs}>
        {[
          { key: "create", label: "Add Employee" },
          { key: "directory", label: `Directory  (${employees.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ ...s.tab, ...(tab === t.key ? s.tabActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CREATE TAB ──────────────────────────────────────────── */}
      {tab === "create" && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>Add New Employee</h2>

          {error && <div style={s.err}>{error}</div>}

          {result && (
            <div style={s.success}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                Employee created successfully.
              </div>
              <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
                <strong>Employee ID:</strong> {result.employeeId}&nbsp;&nbsp;
                <strong>Role:</strong> {result.role === "tl" ? "Team Lead" : "Employee"}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                Share the following credentials securely with the employee:
              </div>
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, padding: "10px 14px", fontFamily: "monospace", fontSize: 13 }}>
                <div>Password: <strong>{result.tempPassword}</strong></div>
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
                The employee will be prompted to change this password on first login.
              </div>
            </div>
          )}

          <form onSubmit={handleCreate} style={s.form}>
            {/* Role */}
            <div style={s.field}>
              <label style={s.label}>Role</label>
              <div style={{ display: "flex", border: "1px solid #d1d5db", borderRadius: 4, overflow: "hidden", width: "fit-content" }}>
                {[{ v: "employee", l: "Employee" }, { v: "tl", l: "Team Lead (TL)" }].map(({ v, l }) => (
                  <button key={v} type="button" onClick={() => setEmpRole(v)}
                    style={{
                      padding: "8px 20px", border: "none", borderLeft: v === "tl" ? "1px solid #d1d5db" : "none", cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "sans-serif", transition: "all 0.12s",
                      background: empRole === v ? "#1d4ed8" : "#fff",
                      color: empRole === v ? "#fff" : "#374151",
                    }}>
                    {l}
                  </button>
                ))}
              </div>
              {empRole === "tl" && (
                <div style={{ fontSize: 12, color: "#2563eb", marginTop: 4, background: "#eff6ff", padding: "5px 10px", borderRadius: 3, border: "1px solid #bfdbfe" }}>
                  Team Leads can create subtasks and approve tasks assigned to them.
                </div>
              )}
            </div>

            <div style={s.row}>
              <GwField label="Full Name" value={form.name} onChange={v => set("name", v)} placeholder="Ramesh Kumar" />
              <GwField label="Email Address" type="email" value={form.email} onChange={v => set("email", v)} placeholder="ramesh@company.com" />
            </div>
            <div style={s.row}>
              <GwField label="Mobile" value={form.mobile} onChange={v => set("mobile", v)} placeholder="+91 9999999999" />
              <GwField label="City" value={form.city} onChange={v => set("city", v)} placeholder="Bhubaneswar" />
            </div>

            {/* Department */}
            <div style={s.field}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={s.label}>Department</label>
                <button type="button"
                  onClick={() => { setCustomDept(p => !p); set("department", ""); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 500, color: customDept ? "#1d4ed8" : "#6b7280", textDecoration: "underline", padding: 0 }}>
                  {customDept ? "Use dropdown" : "Enter custom"}
                </button>
              </div>
              {customDept ? (
                <input type="text" style={s.input} value={form.department}
                  onChange={e => set("department", e.target.value)}
                  placeholder="Enter department name" required autoFocus />
              ) : (
                <select style={s.input} value={form.department}
                  onChange={e => set("department", e.target.value)} required>
                  <option value="">Select department</option>
                  {["HR", "Sales", "Operations", "Design", "Engineering", "Finance", "Marketing", "Management"].map(d => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" disabled={busy}
                style={{ ...s.submitBtn, opacity: busy ? 0.7 : 1, cursor: busy ? "not-allowed" : "pointer" }}>
                {busy ? "Creating…" : `Create ${empRole === "tl" ? "Team Lead" : "Employee"}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── DIRECTORY TAB ───────────────────────────────────────── */}
      {tab === "directory" && (
        <div style={s.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#111827", fontFamily: "sans-serif" }}>
                Employee Directory
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#9ca3af", fontFamily: "sans-serif" }}>
                {employees.length} member{employees.length !== 1 ? "s" : ""} registered
              </p>
            </div>
            <button onClick={loadEmployees}
              style={{ padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", color: "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "sans-serif" }}>
              Refresh
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "sans-serif" }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                  {["Employee ID", "Name", "Role", "Department", "Email", "Mobile", "City", "Actions"].map(h => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "40px 14px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                      No employees found.
                    </td>
                  </tr>
                ) : employees.map((emp, idx) => (
                  <tr key={emp.employeeId}
                    style={{ borderBottom: "1px solid #f3f4f6", background: "#fff", transition: "background 0.1s", cursor: "default" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8faff"}
                    onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                  >
                    {/* Employee ID */}
                    <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                      <code style={{ fontSize: 11, fontFamily: "monospace", color: "#374151", background: "#f3f4f6", padding: "2px 6px", borderRadius: 3, border: "1px solid #e5e7eb" }}>
                        {emp.employeeId}
                      </code>
                    </td>

                    {/* Name */}
                    <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <GwAvatar name={emp.name} size={26} />
                        <span style={{ fontWeight: 500, color: "#111827" }}>{emp.name}</span>
                      </div>
                    </td>

                    {/* Role — formal text badge, no emoji */}
                    <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                      <span style={roleStyle(emp.role)}>{roleLabel(emp.role)}</span>
                    </td>

                    {/* Department */}
                    <td style={{ padding: "11px 14px", color: "#374151" }}>
                      {emp.department || <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>

                    {/* Email */}
                    <td style={{ padding: "11px 14px", color: "#4b5563" }}>{emp.email}</td>

                    {/* Mobile */}
                    <td style={{ padding: "11px 14px", color: "#4b5563", whiteSpace: "nowrap" }}>
                      {emp.mobile || <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>

                    {/* City */}
                    <td style={{ padding: "11px 14px", color: "#4b5563" }}>
                      {emp.city || <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                      {emp.role !== "ceo" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => openReset(emp)}
                            style={{ padding: "5px 12px", border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", color: "#374151", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "sans-serif", transition: "all 0.12s" }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#fffbeb"; e.currentTarget.style.borderColor = "#fcd34d"; e.currentTarget.style.color = "#92400e"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.color = "#374151"; }}
                          >
                            Reset Password
                          </button>
                          <button
                            onClick={() => openRole(emp)}
                            style={{ padding: "5px 12px", border: "1px solid #bfdbfe", borderRadius: 4, background: "#eff6ff", color: "#1e40af", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "sans-serif", transition: "all 0.12s" }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#dbeafe"; e.currentTarget.style.borderColor = "#93c5fd"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#bfdbfe"; }}
                          >
                            Change Role
                          </button>
                          <button
                            onClick={() => openDelete(emp)}
                            style={{ padding: "5px 12px", border: "1px solid #fca5a5", borderRadius: 4, background: "#fff5f5", color: "#dc2626", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "sans-serif", transition: "all 0.12s" }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#ef4444"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#fff5f5"; e.currentTarget.style.borderColor = "#fca5a5"; }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CHANGE ROLE MODAL ──────────────────────────────────────── */}
      {roleModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) closeRole(); }}
        >
          <div style={{ background: "#fff", borderRadius: 10, width: "100%", maxWidth: 420, boxShadow: "0 10px 40px rgba(0,0,0,0.2)", fontFamily: "sans-serif", overflow: "hidden" }}>

            {/* Header */}
            <div style={{ background: "#eff6ff", borderBottom: "1px solid #bfdbfe", padding: "18px 24px", display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#dbeafe", border: "1px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>
                👤
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1e3a5f" }}>Change Role</div>
                <div style={{ fontSize: 12, color: "#3b82f6", marginTop: 2 }}>
                  {roleModal.name} &nbsp;·&nbsp; {roleModal.employeeId}
                </div>
              </div>
              <button onClick={closeRole} disabled={roleBusy}
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af", lineHeight: 1 }}>
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
                Current role: <span style={roleStyle(roleModal.currentRole)}>{roleLabel(roleModal.currentRole)}</span>
              </div>
              <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 20px", lineHeight: 1.6 }}>
                Select the new role for this member. Only CEO can promote/demote roles.
              </p>

              {/* Role option cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Employee option */}
                <button
                  onClick={() => handleChangeRole("employee")}
                  disabled={roleBusy || roleModal.currentRole === "employee"}
                  style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                    border: roleModal.currentRole === "employee" ? "2px solid #bbf7d0" : "1.5px solid #e5e7eb",
                    borderRadius: 8, background: roleModal.currentRole === "employee" ? "#f0fdf4" : "#fff",
                    cursor: roleModal.currentRole === "employee" || roleBusy ? "not-allowed" : "pointer",
                    opacity: roleModal.currentRole === "employee" ? 0.6 : 1,
                    textAlign: "left", fontFamily: "sans-serif", transition: "all 0.12s",
                  }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>👤</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#14532d" }}>Employee</div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Standard member. Can join meetings and use tasks.</div>
                  </div>
                  {roleModal.currentRole === "employee" && <span style={{ marginLeft: "auto", fontSize: 11, color: "#16a34a", fontWeight: 700 }}>CURRENT</span>}
                </button>

                {/* Team Lead option */}
                <button
                  onClick={() => handleChangeRole("tl")}
                  disabled={roleBusy || roleModal.currentRole === "tl"}
                  style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                    border: roleModal.currentRole === "tl" ? "2px solid #bfdbfe" : "1.5px solid #e5e7eb",
                    borderRadius: 8, background: roleModal.currentRole === "tl" ? "#eff6ff" : "#fff",
                    cursor: roleModal.currentRole === "tl" || roleBusy ? "not-allowed" : "pointer",
                    opacity: roleModal.currentRole === "tl" ? 0.6 : 1,
                    textAlign: "left", fontFamily: "sans-serif", transition: "all 0.12s",
                  }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🏅</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1e3a5f" }}>Team Lead</div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Can start meetings, view recordings, and manage team tasks.</div>
                  </div>
                  {roleModal.currentRole === "tl" && <span style={{ marginLeft: "auto", fontSize: 11, color: "#3b82f6", fontWeight: 700 }}>CURRENT</span>}
                </button>
              </div>

              {roleError && (
                <div style={{ marginTop: 14, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>
                  {roleError}
                </div>
              )}
              {roleBusy && (
                <div style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: "#6b7280" }}>Updating role…</div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 24px 20px" }}>
              <button onClick={closeRole} disabled={roleBusy}
                style={{ width: "100%", padding: "9px 0", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", color: "#374151", fontSize: 13, fontWeight: 500, cursor: roleBusy ? "not-allowed" : "pointer", fontFamily: "sans-serif" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE EMPLOYEE MODAL ──────────────────────────────────── */}
      {deleteModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) closeDelete(); }}
        >
          <div style={{ background: "#fff", borderRadius: 10, width: "100%", maxWidth: 400, boxShadow: "0 10px 40px rgba(0,0,0,0.2)", fontFamily: "sans-serif", overflow: "hidden" }}>

            {/* Red header */}
            <div style={{ background: "#fef2f2", borderBottom: "1px solid #fecaca", padding: "18px 24px", display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#fee2e2", border: "1px solid #fecaca", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>
                🗑️
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#991b1b" }}>Delete Employee</div>
                <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 2 }}>
                  {deleteModal.name} &nbsp;·&nbsp; {deleteModal.employeeId}
                </div>
              </div>
              <button onClick={closeDelete} disabled={deleteBusy}
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af", lineHeight: 1 }}>
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 24px" }}>
              <p style={{ fontSize: 14, color: "#374151", margin: "0 0 10px", lineHeight: 1.6 }}>
                This will permanently delete <strong>{deleteModal.name}</strong> from both the app and Firebase Authentication.
              </p>
              <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 14px", fontSize: 12, color: "#6b7280", lineHeight: 1.7 }}>
                <div>📧 <strong>Email:</strong> {deleteModal.email}</div>
                <div>🆔 <strong>ID:</strong> {deleteModal.employeeId}</div>
                <div>👤 <strong>Role:</strong> {deleteModal.role}</div>
              </div>
              <p style={{ fontSize: 12, color: "#dc2626", margin: "12px 0 0", lineHeight: 1.5 }}>
                ⚠️ After deletion the same email can be re-registered as a new employee.
              </p>
              {deleteError && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>
                  {deleteError}
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div style={{ padding: "12px 24px 20px", display: "flex", gap: 10 }}>
              <button onClick={closeDelete} disabled={deleteBusy}
                style={{ flex: 1, padding: "9px 0", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", color: "#374151", fontSize: 13, fontWeight: 500, cursor: deleteBusy ? "not-allowed" : "pointer", fontFamily: "sans-serif" }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleteBusy}
                style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 6, background: deleteBusy ? "#fca5a5" : "#dc2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: deleteBusy ? "not-allowed" : "pointer", fontFamily: "sans-serif", transition: "background 0.15s" }}>
                {deleteBusy ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RESET PASSWORD MODAL ────────────────────────────────── */}
      {resetModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) closeReset(); }}
        >
          <div style={{ background: "#fff", borderRadius: 8, width: "100%", maxWidth: 420, boxShadow: "0 10px 40px rgba(0,0,0,0.15)", fontFamily: "sans-serif" }}>

            {/* Header */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>Reset Password</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                  {resetModal.name}&nbsp;&middot;&nbsp;{resetModal.employeeId}
                </div>
              </div>
              <button onClick={closeReset} disabled={resetBusy}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af", lineHeight: 1, padding: "0 2px" }}>
                ×
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleReset} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>

              {resetError && (
                <div style={{ padding: "9px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 4, fontSize: 13, color: "#b91c1c" }}>
                  {resetError}
                </div>
              )}
              {resetSuccess && (
                <div style={{ padding: "9px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 4, fontSize: 13, color: "#15803d" }}>
                  {resetSuccess}
                </div>
              )}

              {!resetSuccess && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                      New Password
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPwd ? "text" : "password"}
                        value={resetPwd}
                        onChange={e => setResetPwd(e.target.value)}
                        placeholder="Minimum 6 characters"
                        required
                        autoFocus
                        style={{ width: "100%", padding: "9px 44px 9px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, color: "#111827", fontFamily: "sans-serif", outline: "none", boxSizing: "border-box" }}
                      />
                      <button type="button" onClick={() => setShowPwd(p => !p)}
                        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 11, fontWeight: 500, padding: 0 }}>
                        {showPwd ? "Hide" : "Show"}
                      </button>
                    </div>
                    <p style={{ margin: "5px 0 0", fontSize: 11, color: "#9ca3af" }}>
                      The employee will be prompted to change this on next login.
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button type="button" onClick={closeReset} disabled={resetBusy}
                      style={{ padding: "8px 18px", border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", color: "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "sans-serif" }}>
                      Cancel
                    </button>
                    <button type="submit" disabled={resetBusy || resetPwd.length < 6}
                      style={{
                        padding: "8px 18px", border: "none", borderRadius: 4, fontSize: 13, fontWeight: 500, fontFamily: "sans-serif", cursor: resetBusy || resetPwd.length < 6 ? "not-allowed" : "pointer",
                        background: resetBusy || resetPwd.length < 6 ? "#93c5fd" : "#1d4ed8", color: "#fff"
                      }}>
                      {resetBusy ? "Resetting…" : "Reset Password"}
                    </button>
                  </div>
                </>
              )}

              {resetSuccess && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" onClick={closeReset}
                    style={{ padding: "8px 18px", border: "none", borderRadius: 4, background: "#1d4ed8", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "sans-serif" }}>
                    Done
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function GwField({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required
        style={{ padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, color: "#111827", fontFamily: "sans-serif", outline: "none", background: "#fff", width: "100%", boxSizing: "border-box" }}
      />
    </div>
  );
}

const s = {
  tabs: { display: "flex", marginBottom: 20, borderBottom: "1px solid #e5e7eb", fontFamily: "sans-serif" },
  tab: { padding: "10px 20px", border: "none", background: "transparent", color: "#6b7280", fontSize: 13, fontWeight: 500, cursor: "pointer", borderBottom: "2px solid transparent", marginBottom: -1, transition: "all 0.12s" },
  tabActive: { color: "#1d4ed8", borderBottom: "2px solid #1d4ed8", fontWeight: 600 },
  card: { background: "#fff", borderRadius: 6, padding: 24, border: "1px solid #e5e7eb" },
  cardTitle: { margin: "0 0 20px", fontSize: 16, fontWeight: 600, color: "#111827", fontFamily: "sans-serif" },
  form: { display: "flex", flexDirection: "column", gap: 18 },
  row: { display: "flex", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, fontWeight: 500, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" },
  input: { padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, color: "#111827", fontFamily: "sans-serif", outline: "none", background: "#fff" },
  submitBtn: { padding: "9px 24px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "sans-serif" },
  err: { padding: "9px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 4, color: "#b91c1c", fontSize: 13, marginBottom: 4, fontFamily: "sans-serif" },
  success: { padding: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 4, marginBottom: 4, fontFamily: "sans-serif" },
};