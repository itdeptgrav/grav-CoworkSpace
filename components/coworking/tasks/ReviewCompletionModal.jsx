"use client";
/**
 * GRAV-CMS/components/coworking/tasks/ReviewCompletionModal.jsx
 * TL reviews employee submission → approve (forwards to CEO) or reject (with reason).
 * CEO reviews TL-approved submission → final approve or reject.
 */
import { useState } from "react";
import { reviewCompletion, ceoReviewCompletion } from "../../../lib/mediaUploadApi";

export default function ReviewCompletionModal({ task, currentEmployeeId, role, reviewType, onClose, onSuccess }) {
    const [rejectionReason, setRejectionReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [showRejectForm, setShowRejectForm] = useState(false);

    const isCEOReview = reviewType === "ceo_review";
    const submission = task.completionSubmission;
    const tlReview = task.tlReview;

    const handleApprove = async () => {
        setSubmitting(true); setError("");
        try {
            if (isCEOReview) {
                await ceoReviewCompletion({ taskId: task.taskId, approved: true });
            } else {
                await reviewCompletion({ taskId: task.taskId, approved: true });
            }
            onSuccess?.();
        } catch (err) { setError(err.message); }
        finally { setSubmitting(false); }
    };

    const handleReject = async () => {
        if (!rejectionReason.trim()) { setError("Please provide a reason for rejection."); return; }
        setSubmitting(true); setError("");
        try {
            if (isCEOReview) {
                await ceoReviewCompletion({ taskId: task.taskId, approved: false, rejectionReason: rejectionReason.trim() });
            } else {
                await reviewCompletion({ taskId: task.taskId, approved: false, rejectionReason: rejectionReason.trim() });
            }
            onSuccess?.();
        } catch (err) { setError(err.message); }
        finally { setSubmitting(false); }
    };

    return (
        <div style={s.overlay}>
            <div style={s.modal}>
                <div style={s.header}>
                    <div>
                        <h2 style={s.title}>{isCEOReview ? "CEO Final Review" : "Review Completion"}</h2>
                        <p style={s.subtitle}>{task.title} ({task.taskId})</p>
                    </div>
                    <button onClick={onClose} style={s.closeBtn}>✕</button>
                </div>

                {error && <div style={s.errBox}>⚠️ {error}</div>}

                {/* Submission details */}
                {submission && (
                    <div style={s.submissionCard}>
                        <div style={s.submissionHeader}>
                            <span style={s.submissionBy}>📤 Submitted by {submission.submittedByName}</span>
                            <span style={s.submissionDate}>{new Date(submission.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        {submission.message && <p style={s.submissionMsg}>{submission.message}</p>}

                        {/* Proof images */}
                        {submission.imageUrls?.length > 0 && (
                            <div style={s.proofSection}>
                                <div style={s.proofLabel}>📷 Proof Images ({submission.imageUrls.length})</div>
                                <div style={s.imageGrid}>
                                    {submission.imageUrls.map((url, i) => (
                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                            <img src={url} alt={`Proof ${i + 1}`} style={s.proofImg} />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* PDF attachments */}
                        {submission.pdfAttachments?.length > 0 && (
                            <div style={s.proofSection}>
                                <div style={s.proofLabel}>📄 PDF Documents ({submission.pdfAttachments.length})</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    {submission.pdfAttachments.map((pdf, i) => (
                                        <div key={i} style={s.pdfRow}>
                                            <span>📄 {pdf.name || "Document"}</span>
                                            <div style={{ display: "flex", gap: "8px" }}>
                                                {pdf.url && <a href={pdf.url} target="_blank" rel="noopener noreferrer" style={s.pdfLink}>View ↗</a>}
                                                {pdf.downloadUrl && <a href={pdf.downloadUrl} target="_blank" rel="noopener noreferrer" style={s.pdfLink}>Download ⬇</a>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* TL review info (for CEO view) */}
                {isCEOReview && tlReview && (
                    <div style={{ ...s.submissionCard, background: "#e8f0fe" }}>
                        <div style={s.submissionBy}>✅ TL {tlReview.reviewedByName} approved this work</div>
                        <div style={s.submissionDate}>{new Date(tlReview.reviewedAt).toLocaleDateString("en-IN")}</div>
                    </div>
                )}

                {/* Rejection form */}
                {showRejectForm && (
                    <div style={s.rejectForm}>
                        <label style={s.label}>Reason for rejection *</label>
                        <textarea
                            style={{ ...s.input, height: "80px" }}
                            value={rejectionReason}
                            onChange={e => setRejectionReason(e.target.value)}
                            placeholder="Explain why this work is not complete..."
                            autoFocus
                        />
                    </div>
                )}

                {/* Actions */}
                <div style={s.actions}>
                    <button onClick={onClose} style={s.cancelBtn} disabled={submitting}>Cancel</button>
                    {!showRejectForm ? (
                        <>
                            <button onClick={() => setShowRejectForm(true)} style={s.rejectBtn} disabled={submitting}>❌ Reject</button>
                            <button onClick={handleApprove} style={s.approveBtn} disabled={submitting}>
                                {submitting ? "Processing..." : isCEOReview ? "✅ Final Approve" : "✅ Approve → CEO"}
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setShowRejectForm(false)} style={s.cancelBtn} disabled={submitting}>Back</button>
                            <button onClick={handleReject} style={s.rejectBtn} disabled={submitting || !rejectionReason.trim()}>
                                {submitting ? "Rejecting..." : "Confirm Rejection"}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

const s = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, fontFamily: "'Google Sans','Roboto',sans-serif" },
    modal: { background: "#fff", borderRadius: "12px", width: "min(620px,96vw)", maxHeight: "90vh", overflow: "auto", padding: "26px", boxShadow: "0 24px 48px rgba(0,0,0,0.2)" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" },
    title: { margin: "0 0 4px", fontSize: "20px", fontWeight: 400, color: "#202124" },
    subtitle: { margin: 0, fontSize: "13px", color: "#5f6368" },
    closeBtn: { background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#5f6368" },
    errBox: { background: "#fce8e6", border: "1px solid #f5c6c6", borderRadius: "6px", padding: "9px 12px", color: "#c5221f", fontSize: "13px", marginBottom: "14px" },
    submissionCard: { background: "#f8f9fa", borderRadius: "8px", padding: "14px", marginBottom: "16px", border: "1px solid #e8eaed" },
    submissionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "6px" },
    submissionBy: { fontSize: "13px", fontWeight: 500, color: "#202124" },
    submissionDate: { fontSize: "12px", color: "#80868b" },
    submissionMsg: { margin: "0 0 12px", fontSize: "14px", color: "#202124", lineHeight: 1.5, whiteSpace: "pre-wrap" },
    proofSection: { marginTop: "10px" },
    proofLabel: { fontSize: "12px", fontWeight: 500, color: "#5f6368", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.4px" },
    imageGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: "8px" },
    proofImg: { width: "100%", height: "90px", objectFit: "cover", borderRadius: "6px", cursor: "pointer", border: "1px solid #e8eaed" },
    pdfRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#fff", borderRadius: "6px", border: "1px solid #e8eaed", fontSize: "13px" },
    pdfLink: { color: "#1a73e8", fontSize: "12px", textDecoration: "none", padding: "3px 8px", border: "1px solid #1a73e8", borderRadius: "4px" },
    rejectForm: { display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" },
    label: { fontSize: "11px", fontWeight: 500, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.5px" },
    input: { padding: "10px 12px", border: "1px solid #dadce0", borderRadius: "4px", fontSize: "14px", fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical" },
    actions: { display: "flex", justifyContent: "flex-end", gap: "10px", paddingTop: "16px", borderTop: "1px solid #e8eaed" },
    cancelBtn: { padding: "9px 20px", border: "none", background: "transparent", color: "#5f6368", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
    rejectBtn: { padding: "9px 20px", border: "1px solid #d93025", background: "#fce8e6", color: "#d93025", borderRadius: "4px", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
    approveBtn: { padding: "9px 22px", border: "none", background: "#1e8e3e", color: "#fff", borderRadius: "4px", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
};