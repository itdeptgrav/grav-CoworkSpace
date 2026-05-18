/**
 * components/coworking/tasks/EditDeadlineModal.jsx
 * RIGHT SLIDER — CEO edits task deadline with mandatory reason.
 * All logic identical to original.
 */
"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { editTaskDeadline } from "../../../lib/mediaUploadApi";
import DeadlineBadge from "./DeadlineBadge";

const F = { fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif" };

function SliderPortal({ children }) {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  if (!m) return null;
  return createPortal(children, document.body);
}

export default function EditDeadlineModal({ task, onClose, onSuccess }) {
  const [newDueDate, setNewDueDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : "");
  const [reason, setReason]         = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setError("A reason is required when changing the deadline."); return; }
    setError(""); setSubmitting(true);
    try {
      await editTaskDeadline({ taskId: task.taskId, newDueDate: newDueDate || null, reason: reason.trim() });
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SliderPortal>
      <style>{`@keyframes edm-in{from{transform:translateX(100%)}to{transform:translateX(0)}} @keyframes edm-spin{to{transform:rotate(360deg)}}`}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.25)",zIndex:8998,backdropFilter:"blur(1px)" }} />

      {/* Panel */}
      <div style={{ position:"fixed",top:0,right:0,bottom:0,width:"min(420px,100vw)",background:"#fff",borderLeft:"1px solid #E5E7EB",boxShadow:"-6px 0 32px rgba(15,23,42,0.12)",display:"flex",flexDirection:"column",zIndex:8999,...F,animation:"edm-in 0.24s cubic-bezier(0.32,0.72,0,1) both" }}>

        {/* Header */}
        <div style={{ padding:"14px 18px",borderBottom:"1px solid #E5E7EB",flexShrink:0,display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:3,height:28,borderRadius:2,background:"#D97706",flexShrink:0 }} />
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:14,fontWeight:700,color:"#111827" }}>Edit Deadline</div>
            <div style={{ fontSize:11,color:"#6B7280",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{task.title}</div>
          </div>
          <button onClick={onClose} disabled={submitting} style={{ width:28,height:28,borderRadius:6,border:"1px solid #E5E7EB",background:"#F9FAFB",color:"#6B7280",cursor:submitting?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0,opacity:submitting?0.4:1 }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1,overflowY:"auto",padding:"16px 18px",display:"flex",flexDirection:"column",gap:14 }}>
          {error && <div style={{ background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6,padding:"9px 12px",color:"#991B1B",fontSize:12 }}>⚠️ {error}</div>}

          <form id="edm-form" onSubmit={handleSubmit} style={{ display:"flex",flexDirection:"column",gap:14 }}>

            {/* Current deadline */}
            <div style={{ background:"#F8FAFC",border:"1px solid #E5E7EB",borderRadius:7,padding:"10px 12px" }}>
              <div style={{ fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5 }}>Current Deadline</div>
              {task.dueDate ? (
                <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                  <span style={{ fontSize:13,fontWeight:600,color:"#111827" }}>
                    {new Date(task.dueDate).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}
                  </span>
                  <DeadlineBadge dueDate={task.dueDate} />
                </div>
              ) : (
                <span style={{ fontSize:12,color:"#9CA3AF" }}>No deadline set</span>
              )}
            </div>

            {/* New deadline */}
            <div>
              <label style={lbl}>New Deadline <span style={{fontWeight:400,textTransform:"none",color:"#9CA3AF"}}>(leave blank to remove)</span></label>
              <input type="date" value={newDueDate} onChange={e=>setNewDueDate(e.target.value)} style={inp} />
              {newDueDate && <div style={{marginTop:6}}><DeadlineBadge dueDate={newDueDate} /></div>}
            </div>

            {/* Reason */}
            <div>
              <label style={lbl}>Reason for Change <span style={{color:"#EF4444"}}>*</span></label>
              <textarea required value={reason} onChange={e=>setReason(e.target.value)}
                placeholder="Explain why the deadline is being changed (visible to assignees)…"
                style={{ ...inp,height:90,resize:"vertical" }} />
            </div>

          </form>
        </div>

        {/* Footer */}
        <div style={{ padding:"12px 18px",borderTop:"1px solid #E5E7EB",background:"#FAFAFA",display:"flex",gap:8,flexShrink:0 }}>
          <button type="button" onClick={onClose} disabled={submitting} style={{ flex:1,padding:"9px",border:"1px solid #E5E7EB",borderRadius:6,background:"#fff",color:"#6B7280",fontSize:12,fontWeight:500,cursor:submitting?"not-allowed":"pointer",...F }}>
            Cancel
          </button>
          <button type="submit" form="edm-form" disabled={submitting||!reason.trim()} style={{ flex:2,padding:"9px",border:"none",borderRadius:6,background:submitting||!reason.trim()?"#E5E7EB":"#D97706",color:submitting||!reason.trim()?"#9CA3AF":"#fff",fontSize:12,fontWeight:600,cursor:submitting||!reason.trim()?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,...F }}>
            {submitting ? (<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{animation:"edm-spin 1s linear infinite"}}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>Saving…</>) : "Update Deadline"}
          </button>
        </div>
      </div>
    </SliderPortal>
  );
}

const lbl = { fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5 };
const inp = { padding:"9px 11px",border:"1px solid #E5E7EB",borderRadius:6,fontSize:12,fontFamily:"'IBM Plex Sans',-apple-system,sans-serif",outline:"none",boxSizing:"border-box",width:"100%",background:"#fff",color:"#111827" };