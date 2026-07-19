"use client";

const TERMINAL_STATUSES = ["done", "cancelled", "tl_final_approved", "ceo_approved"];

/** The actual deadline shift — only ever called AFTER a TL approves. */
export async function shiftOngoingTaskDeadlines(employeeId, shiftMs) {
    if (!shiftMs || shiftMs <= 0) return;
    const { firebaseDb } = await import("./coworkFirebase");
    const { collection, query, where, getDocs, updateDoc } = await import("firebase/firestore");
    const snap = await getDocs(query(collection(firebaseDb, "cowork_tasks"), where("assigneeIds", "array-contains", employeeId)));
    for (const d of snap.docs) {
        const t = d.data();
        if (!t.dueDate || TERMINAL_STATUSES.includes(t.status)) continue;
        const dueMs = new Date(t.dueDate).getTime();
        await updateDoc(d.ref, {
            dueDate: new Date(dueMs + shiftMs).toISOString(),
            lastDeadlineShiftMs: shiftMs,
        });
    }
}

/**
 * Creates a pending approval request instead of applying the shift directly.
 * Resolves the employee's real primary manager via the existing
 * /employee/my-managers endpoint. Falls back to secondary manager, then to
 * a null tlId (visible to CEO as a safety net) if neither is set in HR data.
 */
export async function requestEmergencyApproval(employeeId, employeeName, gapMs, reason) {
    if (!gapMs || gapMs <= 0) return { requested: false };

    const { firebaseDb, firebaseAuth } = await import("./coworkFirebase");
    const { collection, addDoc, serverTimestamp } = await import("firebase/firestore");

    let tlId = null, tlName = null;
    try {
        const token = await firebaseAuth.currentUser?.getIdToken();
        const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const res = await fetch(`${BASE}/cowork/employee/my-managers/${employeeId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
            const mgr = data.primaryManager || data.secondaryManager;
            if (mgr?.biometricId) { tlId = mgr.biometricId; tlName = mgr.name || tlId; }
        }
    } catch (e) {
        console.warn("[emergency-approval] TL lookup failed:", e.message);
    }

    await addDoc(collection(firebaseDb, "cowork_emergency_approvals"), {
        employeeId,
        employeeName: employeeName || employeeId,
        tlId,
        tlName,
        gapMs,
        reason: reason || "",
        status: "pending",
        createdAt: serverTimestamp(),
        resolvedAt: null,
        resolvedBy: null,
        resolvedByName: null,
    });

    return { requested: true, tlFound: !!tlId };
}