/**
 * components/coworking/tasks/ReviewCompletionModal.jsx
 * RIGHT SLIDER — TL/CEO reviews employee submission.
 * All logic identical to original.
 */
"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { reviewCompletion, ceoReviewCompletion } from "../../../lib/mediaUploadApi";

const F = { fontFamily: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif" };

function SliderPortal({ children }) {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  if (!m) return null;
  return createPortal(children, document.body);
}

export default function ReviewCompletionModal({ task, currentEmployeeId, role, reviewType, onClose, onSuccess }) {
  const [rejectionReason, setRejectionReason] = useState("");
  const [submitting, setSubmitting]           = useState(false);
  const [error, setError]                     = useState("");
  const [showRejectForm, setShowRejectForm]   = useState(false);

  const isCEOReview = reviewType === "ceo_review";
  const submission  = task.completionSubmission;
  const tlReview    = task.tlReview;

  const handleApprove = async () => {
    setSubmitting(true); setError("");
    try {
      if (isCEOReview) await ceoReviewCompletion({ taskId: task.taskId, approved: true });
      else             await reviewCompletion({ taskId: task.taskId, approved: true });
      onSuccess?.();
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) { setError("Please provide a reason for rejection."); return; }
    setSubmitting(true); setError("");
    try {
      if (isCEOReview) await ceoReviewCompletion({ taskId: task.taskId, approved: false, rejectionReason: rejectionReason.trim() });
      else             await reviewCompletion({ taskId: task.taskId, approved: false, rejectionReason: rejectionReason.trim() });
      onSuccess?.();
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <SliderPortal>
      <style>{`@keyframes rcm-in{from{transform:translateX(100%)}to{transform:translateX(0)}} @keyframes rcm-spin{to{transform:rotate(360deg)}}`}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.25)",zIndex:8998,backdropFilter:"blur(1px)" }} />

      {/* Panel */}
      <div style={{ position:"fixed",top:0,right:0,bottom:0,width:"min(500px,100vw)",background:"#fff",borderLeft:"1px solid #E5E7EB",boxShadow:"-6px 0 32px rgba(15,23,42,0.12)",display:"flex",flexDirection:"column",zIndex:8999,...F,animation:"rcm-in 0.24s cubic-bezier(0.32,0.72,0,1) both" }}>

        {/* Header */}
        <div style={{ padding:"14px 18px",borderBottom:"1px solid #E5E7EB",flexShrink:0,display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:3,height:28,borderRadius:2,background:isCEOReview?"#D97706":"#1B4F8A",flexShrink:0 }} />
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:14,fontWeight:700,color:"#111827" }}>{isCEOReview ? "CEO Final Review" : "Review Completion"}</div>
            <div style={{ fontSize:11,color:"#6B7280",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
              {task.title}
              <span style={{ fontFamily:"monospace",background:"#F1F5F9",padding:"1px 5px",borderRadius:3,marginLeft:6,fontSize:10 }}>{task.taskId}</span>
            </div>
          </div>
          <button onClick={onClose} disabled={submitting} style={{ width:28,height:28,borderRadius:6,border:"1px solid #E5E7EB",background:"#F9FAFB",color:"#6B7280",cursor:submitting?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0,opacity:submitting?0.4:1 }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1,overflowY:"auto",padding:"16px 18px",display:"flex",flexDirection:"column",gap:12 }}>
          {error && <div style={{ background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6,padding:"9px 12px",color:"#991B1B",fontSize:12 }}>⚠️ {error}</div>}

          {/* Submission card */}
          {submission && (
            <div style={{ background:"#F8FAFC",border:"1px solid #E5E7EB",borderRadius:8,padding:"12px 14px" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,flexWrap:"wrap",gap:4 }}>
                <span style={{ fontSize:12,fontWeight:600,color:"#374151" }}>📤 Submitted by {submission.submittedByName}</span>
                <span style={{ fontSize:10,color:"#9CA3AF" }}>{submission.submittedAt ? new Date(submission.submittedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) : ""}</span>
              </div>

              {submission.message && (
                <p style={{ fontSize:12,color:"#1F2937",lineHeight:1.6,margin:"0 0 10px",whiteSpace:"pre-wrap" }}>{submission.message}</p>
              )}

              {/* Proof images */}
              {submission.imageUrls?.length > 0 && (
                <div style={{ marginTop:8 }}>
                  <div style={{ fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6 }}>📷 Proof Images ({submission.imageUrls.length})</div>
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))",gap:6 }}>
                    {submission.imageUrls.map((url,i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={`Proof ${i+1}`} style={{ width:"100%",height:80,objectFit:"cover",borderRadius:6,border:"1px solid #E5E7EB",cursor:"pointer" }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* PDF attachments */}
              {submission.pdfAttachments?.length > 0 && (
                <div style={{ marginTop:10 }}>
                  <div style={{ fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6 }}>📄 Documents ({submission.pdfAttachments.length})</div>
                  <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
                    {submission.pdfAttachments.map((pdf,i) => (
                      <div key={i} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:"#fff",borderRadius:6,border:"1px solid #E5E7EB",fontSize:11 }}>
                        <span style={{ color:"#374151" }}>📄 {pdf.name||"Document"}</span>
                        <div style={{ display:"flex",gap:6 }}>
                          {pdf.url && <a href={pdf.url} target="_blank" rel="noreferrer" style={{ color:"#1B4F8A",fontSize:11,textDecoration:"none",padding:"2px 7px",border:"1px solid #BFDBFE",borderRadius:4 }}>View ↗</a>}
                          {pdf.downloadUrl && <a href={pdf.downloadUrl} target="_blank" rel="noreferrer" style={{ color:"#1B4F8A",fontSize:11,textDecoration:"none",padding:"2px 7px",border:"1px solid #BFDBFE",borderRadius:4 }}>↓</a>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TL review info (CEO view) */}
          {isCEOReview && tlReview && (
            <div style={{ background:"#EBF2FA",border:"1px solid #BFDBFE",borderRadius:8,padding:"10px 12px",fontSize:11,color:"#1B4F8A" }}>
              ✅ TL <strong>{tlReview.reviewedByName}</strong> approved this work on {new Date(tlReview.reviewedAt).toLocaleDateString("en-IN")}
            </div>
          )}

          {/* Rejection form */}
          {showRejectForm && (
            <div>
              <label style={{ fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:6 }}>
                Reason for rejection <span style={{color:"#EF4444"}}>*</span>
              </label>
              <textarea autoFocus value={rejectionReason} onChange={e=>setRejectionReason(e.target.value)}
                placeholder="Explain what needs to be improved…"
                style={{ width:"100%",minHeight:90,padding:"9px 11px",border:"1px solid #FECACA",borderRadius:6,fontSize:12,...F,outline:"none",resize:"vertical",boxSizing:"border-box",color:"#111827" }} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:"12px 18px",borderTop:"1px solid #E5E7EB",background:"#FAFAFA",display:"flex",gap:8,flexShrink:0 }}>
          {!showRejectForm ? (
            <>
              <button onClick={onClose} disabled={submitting} style={{ flex:1,padding:"9px",border:"1px solid #E5E7EB",borderRadius:6,background:"#fff",color:"#6B7280",fontSize:12,fontWeight:500,cursor:submitting?"not-allowed":"pointer",...F }}>
                Cancel
              </button>
              <button onClick={()=>setShowRejectForm(true)} disabled={submitting} style={{ flex:1,padding:"9px",border:"1px solid #FECACA",borderRadius:6,background:"#FEF2F2",color:"#DC2626",fontSize:12,fontWeight:600,cursor:submitting?"not-allowed":"pointer",...F }}>
                ✕ Reject
              </button>
              <button onClick={handleApprove} disabled={submitting} style={{ flex:2,padding:"9px",border:"none",borderRadius:6,background:submitting?"#E5E7EB":"#059669",color:submitting?"#9CA3AF":"#fff",fontSize:12,fontWeight:600,cursor:submitting?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,...F }}>
                {submitting ? (<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{animation:"rcm-spin 1s linear infinite"}}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>Processing…</>) : (isCEOReview ? "✅ Final Approve" : "✅ Approve → CEO")}
              </button>
            </>
          ) : (
            <>
              <button onClick={()=>{ setShowRejectForm(false); setRejectionReason(""); setError(""); }} disabled={submitting} style={{ flex:1,padding:"9px",border:"1px solid #E5E7EB",borderRadius:6,background:"#fff",color:"#6B7280",fontSize:12,fontWeight:500,cursor:submitting?"not-allowed":"pointer",...F }}>
                ← Back
              </button>
              <button onClick={handleReject} disabled={submitting||!rejectionReason.trim()} style={{ flex:2,padding:"9px",border:"none",borderRadius:6,background:submitting||!rejectionReason.trim()?"#E5E7EB":"#DC2626",color:submitting||!rejectionReason.trim()?"#9CA3AF":"#fff",fontSize:12,fontWeight:600,cursor:submitting||!rejectionReason.trim()?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,...F }}>
                {submitting ? (<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{animation:"rcm-spin 1s linear infinite"}}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>Rejecting…</>) : "Confirm Rejection"}
              </button>
            </>
          )}
        </div>
      </div>
    </SliderPortal>
  );
}