"use client";
/**
 * GRAV-CMS/components/coworking/tasks/CompletionVerificationPanel.jsx
 * Shows different UI based on role and task completion status
 */

import { useState } from "react";
import {
    submitCompletionProof,
    tlReviewCompletion,
    ceoReviewCompletion,
    uploadImageToCloudinary,
    uploadPDFToGoogleDrive,
} from "@/lib/mediaUploadApi";

const STATUS_LABELS = {
    pending_tl_review: { label: "Waiting for TL Review", color: "bg-yellow-100 text-yellow-800" },
    pending_ceo_review: { label: "Waiting for CEO Approval", color: "bg-blue-100 text-blue-800" },
    completed: { label: "Completed ✓", color: "bg-green-100 text-green-800" },
    rejected_by_tl: { label: "Rejected by TL", color: "bg-red-100 text-red-800" },
    rejected_by_ceo: { label: "Rejected by CEO", color: "bg-red-100 text-red-800" },
};

export default function CompletionVerificationPanel({ task, userRole, token, onUpdate }) {
    const [showSubmit, setShowSubmit] = useState(false);
    const [showReview, setShowReview] = useState(false);
    const [proofImages, setProofImages] = useState([]);
    const [proofPdfs, setProofPdfs] = useState([]);
    const [proofNotes, setProofNotes] = useState("");
    const [uploadingProof, setUploadingProof] = useState(false);
    const [rejectionReason, setRejectionReason] = useState("");
    const [loading, setLoading] = useState(false);

    const completionStatus = task.completionStatus;
    const statusInfo = completionStatus ? STATUS_LABELS[completionStatus] : null;

    // ─── Upload proof image ──────────────────────────────────────────────────────
    const handleProofImage = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingProof(true);
        try {
            const result = await uploadImageToCloudinary(file);
            setProofImages((prev) => [...prev, { url: result.url, name: file.name }]);
        } catch (err) {
            alert("Image upload failed: " + err.message);
        } finally {
            setUploadingProof(false);
            e.target.value = "";
        }
    };

    // ─── Upload proof PDF ────────────────────────────────────────────────────────
    const handleProofPDF = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingProof(true);
        try {
            const result = await uploadPDFToGoogleDrive(file, token);
            setProofPdfs((prev) => [...prev, { url: result.viewUrl, name: file.name, fileId: result.fileId }]);
        } catch (err) {
            alert("PDF send feature not added yet or upload failed: " + err.message);
        } finally {
            setUploadingProof(false);
            e.target.value = "";
        }
    };

    // ─── Employee: Submit proof ──────────────────────────────────────────────────
    const handleSubmitProof = async () => {
        if (proofImages.length === 0 && proofPdfs.length === 0 && !proofNotes.trim()) {
            return alert("Please add at least one proof (image, PDF, or notes)");
        }
        setLoading(true);
        try {
            await submitCompletionProof(task.id, { images: proofImages, pdfs: proofPdfs, notes: proofNotes }, token);
            setShowSubmit(false);
            onUpdate();
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ─── TL: Review ─────────────────────────────────────────────────────────────
    const handleTLReview = async (decision) => {
        if (decision === "reject" && !rejectionReason.trim()) {
            return alert("Please provide a rejection reason");
        }
        setLoading(true);
        try {
            await tlReviewCompletion(task.id, decision, rejectionReason, token);
            setShowReview(false);
            setRejectionReason("");
            onUpdate();
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ─── CEO: Review ─────────────────────────────────────────────────────────────
    const handleCEOReview = async (decision) => {
        if (decision === "reject" && !rejectionReason.trim()) {
            return alert("Please provide a rejection reason");
        }
        setLoading(true);
        try {
            await ceoReviewCompletion(task.id, decision, rejectionReason, token);
            setShowReview(false);
            setRejectionReason("");
            onUpdate();
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ─── Render ──────────────────────────────────────────────────────────────────
    return (
        <div className="border-t border-gray-100 pt-4 mt-4">
            {/* Status badge */}
            {statusInfo && (
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium mb-3 ${statusInfo.color}`}>
                    {statusInfo.label}
                </div>
            )}

            {/* Rejection info */}
            {completionStatus === "rejected_by_tl" && task.tlRejection && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm">
                    <p className="font-medium text-red-800">Rejected by TL: {task.tlRejection.rejectedByName}</p>
                    <p className="text-red-700 mt-0.5">Reason: {task.tlRejection.reason}</p>
                </div>
            )}
            {completionStatus === "rejected_by_ceo" && task.ceoRejection && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm">
                    <p className="font-medium text-red-800">Rejected by CEO</p>
                    <p className="text-red-700 mt-0.5">Reason: {task.ceoRejection.reason}</p>
                </div>
            )}

            {/* Employee: Submit button */}
            {userRole === "employee" && !completionStatus && task.status === "in_progress" && (
                <button
                    onClick={() => setShowSubmit(true)}
                    className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700"
                >
                    ✓ Mark as Complete
                </button>
            )}

            {/* TL: Review button */}
            {userRole === "tl" && completionStatus === "pending_tl_review" && (
                <button
                    onClick={() => setShowReview(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
                >
                    📋 Review Completion
                </button>
            )}

            {/* CEO: Final review button */}
            {userRole === "ceo" && completionStatus === "pending_ceo_review" && (
                <button
                    onClick={() => setShowReview(true)}
                    className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-purple-700"
                >
                    👑 Final Approval
                </button>
            )}

            {/* Proof viewer (for TL and CEO to see what employee submitted) */}
            {(completionStatus === "pending_tl_review" || completionStatus === "pending_ceo_review" || completionStatus === "completed") &&
                task.completionProof && (
                    <div className="mt-3 bg-gray-50 rounded-xl p-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">
                            Submitted by: {task.completionProof.submittedByName}
                        </p>
                        {task.completionProof.notes && (
                            <p className="text-sm text-gray-600 mb-2">{task.completionProof.notes}</p>
                        )}
                        {task.completionProof.images?.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {task.completionProof.images.map((img, i) => (
                                    <img
                                        key={i}
                                        src={img.url}
                                        alt={img.name}
                                        className="w-20 h-20 object-cover rounded-lg cursor-pointer"
                                        onClick={() => window.open(img.url, "_blank")}
                                    />
                                ))}
                            </div>
                        )}
                        {task.completionProof.pdfs?.length > 0 && (
                            <div className="space-y-1">
                                {task.completionProof.pdfs.map((pdf, i) => (
                                    <a key={i} href={pdf.url} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                                        📄 {pdf.name}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                )}

            {/* Submit Proof Modal */}
            {showSubmit && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                        <div className="flex items-center justify-between p-5 border-b">
                            <h2 className="font-semibold text-gray-900">Submit Completion Proof</h2>
                            <button onClick={() => setShowSubmit(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-sm text-gray-500">Upload proof of your completed work (images, PDFs, or notes).</p>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                <textarea
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                                    rows={3}
                                    placeholder="Describe what you completed..."
                                    value={proofNotes}
                                    onChange={(e) => setProofNotes(e.target.value)}
                                />
                            </div>

                            <div className="flex gap-3">
                                <label className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-3 cursor-pointer hover:border-blue-400 text-sm text-gray-600">
                                    <input type="file" accept="image/*" className="hidden" onChange={handleProofImage} />
                                    📷 Add Image
                                </label>
                                <label className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-3 cursor-pointer hover:border-red-400 text-sm text-gray-600">
                                    <input type="file" accept="application/pdf" className="hidden" onChange={handleProofPDF} />
                                    📄 Add PDF
                                </label>
                            </div>

                            {uploadingProof && <p className="text-xs text-blue-600 animate-pulse">Uploading...</p>}

                            {proofImages.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {proofImages.map((img, i) => (
                                        <div key={i} className="relative">
                                            <img src={img.url} alt={img.name} className="w-16 h-16 object-cover rounded-lg" />
                                            <button onClick={() => setProofImages(prev => prev.filter((_, j) => j !== i))}
                                                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {proofPdfs.length > 0 && (
                                <div className="space-y-1">
                                    {proofPdfs.map((pdf, i) => (
                                        <div key={i} className="flex items-center justify-between bg-gray-50 px-3 py-1 rounded">
                                            <span className="text-xs">📄 {pdf.name}</span>
                                            <button onClick={() => setProofPdfs(prev => prev.filter((_, j) => j !== i))} className="text-red-500 text-xs">✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 p-5 border-t">
                            <button onClick={() => setShowSubmit(false)} className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm">Cancel</button>
                            <button onClick={handleSubmitProof} disabled={loading || uploadingProof}
                                className="flex-1 bg-green-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                                {loading ? "Submitting..." : "Submit for Review"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TL/CEO Review Modal */}
            {showReview && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                        <div className="flex items-center justify-between p-5 border-b">
                            <h2 className="font-semibold text-gray-900">
                                {userRole === "tl" ? "Review Completion" : "Final CEO Approval"}
                            </h2>
                            <button onClick={() => setShowReview(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                        <div className="p-5 space-y-4">
                            {/* Show proof */}
                            {task.completionProof && (
                                <div className="bg-gray-50 rounded-xl p-4">
                                    <p className="text-sm font-medium text-gray-700 mb-2">
                                        Submitted by: {task.completionProof.submittedByName}
                                    </p>
                                    {task.completionProof.notes && (
                                        <p className="text-sm text-gray-600 mb-2">{task.completionProof.notes}</p>
                                    )}
                                    {task.completionProof.images?.map((img, i) => (
                                        <img key={i} src={img.url} alt="" className="w-20 h-20 object-cover rounded mr-2 mb-2 cursor-pointer inline-block"
                                            onClick={() => window.open(img.url, "_blank")} />
                                    ))}
                                    {task.completionProof.pdfs?.map((pdf, i) => (
                                        <a key={i} href={pdf.url} target="_blank" rel="noopener noreferrer"
                                            className="block text-sm text-blue-600 hover:underline">📄 {pdf.name}</a>
                                    ))}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Rejection Reason (required if rejecting)
                                </label>
                                <textarea
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                                    rows={3}
                                    placeholder="Explain why you are rejecting..."
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 p-5 border-t">
                            <button
                                onClick={() => userRole === "tl" ? handleTLReview("reject") : handleCEOReview("reject")}
                                disabled={loading}
                                className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                            >
                                ✕ Reject
                            </button>
                            <button
                                onClick={() => userRole === "tl" ? handleTLReview("approve") : handleCEOReview("approve")}
                                disabled={loading}
                                className="flex-1 bg-green-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                                ✓ Approve
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}