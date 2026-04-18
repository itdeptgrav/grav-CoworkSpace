/**
 * GRAV-CMS/lib/taskForwardApi.js
 *
 * Place this file at: GRAV-CMS/lib/taskForwardApi.js
 *
 * Import paths from different locations:
 *   hooks/useTaskForward.ts                        → "../lib/taskForwardApi"
 *   components/coworking/tasks/AnyComponent.jsx    → "../../../lib/taskForwardApi"
 *   app/coworking/tasks/page.js                    → "../../../lib/taskForwardApi"
 *   app/coworking/tasks/[taskId]/page.js           → "../../../../lib/taskForwardApi"
 */

import { firebaseAuth } from "./coworkFirebase";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function coworkFetch(path, opts = {}) {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error("Not authenticated. Please login.");
    const token = await user.getIdToken();
    const res = await fetch(`${BASE}/cowork${path}`, {
        ...opts,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(opts.headers || {}),
        },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
}

export const taskForwardApi = {

    createParentTask: (body) =>
        coworkFetch("/task/create-parent", { method: "POST", body: JSON.stringify(body) }),

    confirmTask: (taskId) =>
        coworkFetch(`/task/${taskId}/confirm`, { method: "POST", body: JSON.stringify({}) }),

    startTask: (taskId) =>
        coworkFetch(`/task/${taskId}/start`, { method: "POST", body: JSON.stringify({}) }),

    forwardTask: (taskId, assignments) =>
        coworkFetch(`/task/${taskId}/forward`, { method: "POST", body: JSON.stringify({ assignments }) }),

    submitDailyReport: (taskId, body) =>
        coworkFetch(`/task/${taskId}/daily-report`, { method: "POST", body: JSON.stringify(body) }),

    addThreadMessage: (taskId, message, messageType = "update") =>
        coworkFetch(`/task/${taskId}/thread-message`, { method: "POST", body: JSON.stringify({ message, messageType }) }),

    getTaskDetails: (taskId) =>
        coworkFetch(`/task/${taskId}/details`),

    listTasksHierarchy: () =>
        coworkFetch("/task/list-hierarchy"),

    updateParentProgress: (taskId, note) =>
        coworkFetch(`/task/${taskId}/parent-progress`, { method: "PATCH", body: JSON.stringify({ note }) }),

    getDailyReports: (taskId) =>
        coworkFetch(`/task/${taskId}/daily-reports`),

    // ── DEADLINE PROPOSAL FLOW ────────────────────────────────────────────────
    // Employee proposes deadline → creator (CEO/TL who assigned) approves/rejects

    proposeDeadline: (taskId, proposedDate, workedSecs = 0) =>
        coworkFetch(`/task/${taskId}/propose-deadline`, {
            method: "POST",
            body: JSON.stringify({ proposedDate, workedSecs }),
        }),

    approveDeadline: (taskId, approved, rejectionReason = "") =>
        coworkFetch(`/task/${taskId}/approve-deadline`, {
            method: "POST",
            body: JSON.stringify({ approved, rejectionReason }),
        }),

    tlCounterDeadline: (taskId, counterDate, message = "") =>
        coworkFetch(`/task/${taskId}/tl-counter-deadline`, {
            method: "POST",
            body: JSON.stringify({ counterDate, message }),
        }),

    respondToTlCounter: (taskId, accepted, rejectMessage = "") =>
        coworkFetch(`/task/${taskId}/respond-tl-counter`, {
            method: "POST",
            body: JSON.stringify({ accepted, rejectMessage }),
        }),

    // ── DRAFT CHAT (pre-confirmation negotiation) ─────────────────────────────
    getDraftChat: (taskId, limit = 100) =>
        coworkFetch(`/task/${taskId}/draft-chat?limit=${limit}`),

    sendDraftChat: (taskId, text, attachments = [], messageType = "text") =>
        coworkFetch(`/task/${taskId}/draft-chat`, {
            method: "POST",
            body: JSON.stringify({ text, attachments, messageType }),
        }),
};