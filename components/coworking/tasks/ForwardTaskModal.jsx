/**
 * components/coworking/tasks/ForwardTaskModal.jsx
 * RIGHT SLIDER — Forward & split task to employees.
 * All logic identical to original; only presentation changed.
 */
"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { forwardTask, listAllEmployees } from "../../../lib/mediaUploadApi";
import DeadlineBadge, { getDeadlineInfo } from "./DeadlineBadge";

const F = { fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif" };

function SliderPortal({ children }) {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  if (!m) return null;
  return createPortal(children, document.body);
}

export default function ForwardTaskModal({ task, currentEmployeeId, onClose, onSuccess }) {
  const [employees, setEmployees] = useState([]);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [assignments, setAssignments] = useState([
    { employeeId: "", notes: "", dueDate: "", title: task?.title || "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listAllEmployees()
      .then(emps => setEmployees(emps.filter(e => e.employeeId !== currentEmployeeId)))
      .catch(err => setError("Could not load employees: " + err.message))
      .finally(() => setLoadingEmps(false));
  }, [currentEmployeeId]);

  const addRow = () => setAssignments(prev => [...prev, { employeeId: "", notes: "", dueDate: "", title: task?.title || "" }]);
  const removeRow = (i) => setAssignments(prev => prev.filter((_, j) => j !== i));
  const updateRow = (i, k, v) => setAssignments(prev => prev.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const filled = assignments.filter(a => a.employeeId && a.notes);
    if (!filled.length) { setError("Add at least one assignment with employee and notes."); return; }
    setError(""); setSubmitting(true);
    try {
      await forwardTask(task.taskId, filled);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SliderPortal>
      <style>{`@keyframes ftm-in{from{transform:translateX(100%)}to{transform:translateX(0)}} @keyframes ftm-spin{to{transform:rotate(360deg)}}`}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.25)",zIndex:8998,backdropFilter:"blur(1px)" }} />

      {/* Panel */}
      <div style={{ position:"fixed",top:0,right:0,bottom:0,width:"min(520px,100vw)",background:"#fff",borderLeft:"1px solid #E5E7EB",boxShadow:"-6px 0 32px rgba(15,23,42,0.12)",display:"flex",flexDirection:"column",zIndex:8999,...F,animation:"ftm-in 0.24s cubic-bezier(0.32,0.72,0,1) both" }}>

        {/* Header */}
        <div style={{ padding:"14px 18px",borderBottom:"1px solid #E5E7EB",flexShrink:0,display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:3,height:28,borderRadius:2,background:"#1B4F8A",flexShrink:0 }} />
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:14,fontWeight:700,color:"#111827" }}>Forward & Split Task</div>
            <div style={{ fontSize:11,color:"#6B7280",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
              <span style={{ fontFamily:"monospace",background:"#F1F5F9",padding:"1px 5px",borderRadius:3,marginRight:5,fontSize:10 }}>{task?.taskId}</span>
              {task?.title}
            </div>
          </div>
          <button onClick={onClose} style={{ width:28,height:28,borderRadius:6,border:"1px solid #E5E7EB",background:"#F9FAFB",color:"#6B7280",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0 }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1,overflowY:"auto",padding:"14px 18px",display:"flex",flexDirection:"column",gap:12 }}>
          {error && <div style={{ background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6,padding:"9px 12px",color:"#991B1B",fontSize:12 }}>⚠️ {error}</div>}

          {loadingEmps ? (
            <div style={{ display:"flex",justifyContent:"center",padding:40,color:"#9CA3AF",fontSize:12 }}>Loading employees…</div>
          ) : employees.length === 0 ? (
            <div style={{ textAlign:"center",padding:40,color:"#9CA3AF",fontSize:12 }}>No other employees found.</div>
          ) : (
            <form id="ftm-form" onSubmit={handleSubmit} style={{ display:"flex",flexDirection:"column",gap:12 }}>
              {assignments.map((row, i) => {
                const dl = getDeadlineInfo(row.dueDate);
                return (
                  <div key={i} style={{ background:"#F8FAFC",border:"1px solid #E5E7EB",borderRadius:8,padding:"12px 14px" }}>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
                      <span style={{ fontSize:12,fontWeight:700,color:"#1B4F8A" }}>Assignment {i + 1}</span>
                      {assignments.length > 1 && (
                        <button type="button" onClick={() => removeRow(i)} style={{ background:"none",border:"none",color:"#DC2626",fontSize:11,cursor:"pointer",...F }}>Remove</button>
                      )}
                    </div>

                    {/* Employee select */}
                    <div style={{ marginBottom:8 }}>
                      <label style={lbl}>Assign to *</label>
                      <select style={inp} value={row.employeeId} onChange={e => updateRow(i,"employeeId",e.target.value)} required>
                        <option value="">Select employee…</option>
                        {employees.map(emp => (
                          <option key={emp.employeeId} value={emp.employeeId}>
                            {emp.name} ({emp.employeeId}){emp.department ? ` — ${emp.department}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Title + deadline row */}
                    <div style={{ display:"flex",gap:8,marginBottom:8 }}>
                      <div style={{ flex:2 }}>
                        <label style={lbl}>Subtask title</label>
                        <input style={inp} value={row.title} onChange={e => updateRow(i,"title",e.target.value)} placeholder={task?.title} />
                      </div>
                      <div style={{ flex:1 }}>
                        <label style={lbl}>Deadline</label>
                        <input type="date" style={{ ...inp, borderColor: dl.status !== "none" ? dl.color : "#E5E7EB" }} value={row.dueDate} onChange={e => updateRow(i,"dueDate",e.target.value)} />
                        {row.dueDate && <div style={{ marginTop:3 }}><DeadlineBadge dueDate={row.dueDate} /></div>}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label style={lbl}>Instructions / Notes *</label>
                      <textarea style={{ ...inp,height:64,resize:"vertical" }} value={row.notes} onChange={e => updateRow(i,"notes",e.target.value)} placeholder="What this employee needs to do…" required />
                    </div>
                  </div>
                );
              })}

              <button type="button" onClick={addRow} style={{ padding:"8px",border:"1.5px dashed #CBD5E1",borderRadius:6,background:"transparent",color:"#6B7280",fontSize:12,cursor:"pointer",...F,transition:"all 0.12s" }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#1B4F8A";e.currentTarget.style.color="#1B4F8A"}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#CBD5E1";e.currentTarget.style.color="#6B7280"}}>
                + Add another assignment
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:"12px 18px",borderTop:"1px solid #E5E7EB",background:"#FAFAFA",display:"flex",gap:8,flexShrink:0 }}>
          <button type="button" onClick={onClose} style={{ flex:1,padding:"9px",border:"1px solid #E5E7EB",borderRadius:6,background:"#fff",color:"#6B7280",fontSize:12,fontWeight:500,cursor:"pointer",...F }}>
            Cancel
          </button>
          <button type="submit" form="ftm-form" disabled={submitting||loadingEmps} style={{ flex:2,padding:"9px",border:"none",borderRadius:6,background:submitting||loadingEmps?"#E5E7EB":"#1B4F8A",color:submitting||loadingEmps?"#9CA3AF":"#fff",fontSize:12,fontWeight:600,cursor:submitting||loadingEmps?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,...F }}>
            {submitting ? (<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{animation:"ftm-spin 1s linear infinite"}}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>Forwarding…</>) : `Forward to ${assignments.filter(a=>a.employeeId).length || 0} employee(s)`}
          </button>
        </div>
      </div>
    </SliderPortal>
  );
}

const lbl = { fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:4 };
const inp = { padding:"8px 10px",border:"1px solid #E5E7EB",borderRadius:6,fontSize:12,fontFamily:"'IBM Plex Sans',-apple-system,sans-serif",outline:"none",boxSizing:"border-box",width:"100%",background:"#fff",color:"#111827" };