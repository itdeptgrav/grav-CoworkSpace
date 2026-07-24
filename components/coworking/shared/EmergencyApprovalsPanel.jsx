"use client";
import { useEffect, useState } from "react";
import { shiftOngoingTaskDeadlines } from "../../../lib/emergencyApproval";

const F = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif";

function formatDuration(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

/**
 * currentEmployeeId: the logged-in TL/CEO's own employeeId.
 * isCEO: CEO sees ALL pending requests (including ones with no tlId found —
 * the fallback case when an employee has no manager set in HR data);
 * a TL only sees requests routed specifically to them.
 */
export default function EmergencyApprovalsPanel({ currentEmployeeId, isCEO }) {
    const [requests, setRequests] = useState([]);
    const [busyId, setBusyId] = useState(null);

    useEffect(() => {
        let unsub = () => { };
        (async () => {
            const { firebaseDb } = await import("../../../lib/coworkFirebase");
            const { collection, query, where, onSnapshot } = await import("firebase/firestore");
            const col = collection(firebaseDb, "cowork_emergency_approvals");
            const q = isCEO
                ? query(col, where("status", "==", "pending"))
                : query(col, where("status", "==", "pending"), where("tlId", "==", currentEmployeeId));
            unsub = onSnapshot(q, (snap) => {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                // CEO sees: orphaned (no manager on record), TL/CEO escalations,
                // and anything routed to them directly. Still not every TL's queue.
                // requesterRole check also catches legacy docs written before
                // escalateToCeo existed.
                setRequests(isCEO
                    ? list.filter(r =>
                        !r.tlId
                        || r.escalateToCeo === true
                        || r.requesterRole === "tl"
                        || r.requesterRole === "ceo"
                        || r.tlId === currentEmployeeId)
                    : list);
            }, (e) => console.error("[EmergencyApprovalsPanel] snapshot:", e.message));
        })();
        return () => unsub();
    }, [currentEmployeeId, isCEO]);

    const resolve = async (req, approve) => {
        setBusyId(req.id);
        try {
            const { firebaseDb } = await import("../../../lib/coworkFirebase");
            const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");
            if (approve) {
                await shiftOngoingTaskDeadlines(req.employeeId, req.gapMs);
            }
            await updateDoc(doc(firebaseDb, "cowork_emergency_approvals", req.id), {
                status: approve ? "approved" : "rejected",
                resolvedAt: serverTimestamp(),
                resolvedBy: currentEmployeeId,
            });
        } catch (e) {
            console.error("[EmergencyApprovalsPanel] resolve failed:", e.message);
            alert("Couldn't process this request: " + e.message);
        } finally {
            setBusyId(null);
        }
    };

    if (requests.length === 0) return null;

    return (
        <div style={{ fontFamily: F, border: "1px solid #E7E0D4", borderRadius: 8, background: "#FAF9F7", padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7C5A1E", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Emergency Mode Approvals ({requests.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {requests.map(req => (
                    <div key={req.id} style={{ padding: "9px 10px", background: "#fff", border: "1px solid #E4E7EC", borderRadius: 6 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1A1D21", marginBottom: 2 }}>
                            {req.employeeName} — {formatDuration(req.gapMs)}
                            {(req.escalateToCeo || req.requesterRole === "tl" || req.requesterRole === "ceo")
                                ? <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#1B4F8A", background: "#EFF6FF", padding: "1px 6px", borderRadius: 4 }}>REQUEST</span>
                                : !req.tlId && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#B45309", background: "#FFFBEB", padding: "1px 6px", borderRadius: 4 }}>NO MANAGER ON RECORD</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#667085", marginBottom: 8 }}>"{req.reason || "No reason given"}"</div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button
                                disabled={busyId === req.id}
                                onClick={() => resolve(req, false)}
                                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid #E4E7EC", background: "#F2F4F7", color: "#344054", fontSize: 12, fontWeight: 600, cursor: busyId === req.id ? "not-allowed" : "pointer", fontFamily: F }}
                            >Reject</button>
                            <button
                                disabled={busyId === req.id}
                                onClick={() => resolve(req, true)}
                                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "none", background: "#1B4F8A", color: "#fff", fontSize: 12, fontWeight: 600, cursor: busyId === req.id ? "not-allowed" : "pointer", fontFamily: F }}
                            >{busyId === req.id ? "Processing…" : "Approve"}</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}