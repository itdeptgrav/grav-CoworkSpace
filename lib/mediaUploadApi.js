/**
 * GRAV-CMS/lib/mediaUploadApi.js
 */
import { firebaseAuth } from "./coworkFirebase";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

// Wait for Firebase auth to finish initializing, then return a fresh token.
async function getToken() {
    const user = await new Promise((resolve) => {
        // If already loaded just use it
        if (firebaseAuth.currentUser !== undefined) {
            resolve(firebaseAuth.currentUser);
            return;
        }
        // Otherwise wait for onAuthStateChanged (fires once on init)
        const unsub = firebaseAuth.onAuthStateChanged((u) => {
            unsub();
            resolve(u);
        });
        // Safety timeout — 6 s
        setTimeout(() => { unsub(); resolve(null); }, 6000);
    });

    if (!user) {
        throw new Error("Not authenticated — please log in");
    }

    // getIdToken(false) uses cached token unless expired, then auto-refreshes
    const token = await user.getIdToken(false);
    if (!token) throw new Error("Could not obtain auth token");
    return token;
}

async function api(path, options = {}) {
    const token = await getToken();
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers,
        },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
}

// Images → Cloudinary directly (no backend roundtrip)
export async function uploadImage(file, folder = "cowork-messages") {
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"].includes(file.type))
        throw new Error("Images only (jpg/png/webp/gif)");
    if (file.size > 10 * 1024 * 1024) throw new Error("Max 10MB per image");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", PRESET);
    fd.append("folder", folder);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: "POST", body: fd });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || "Image upload failed");
    return { url: d.secure_url, publicId: d.public_id, format: d.format, bytes: d.bytes, originalName: file.name };
}

// Voice → Cloudinary directly
// Voice → Cloudinary directly
export async function uploadVoice(blob, fileName = "voice.webm") {
    // Validate file type
    if (!blob.type.startsWith('audio/')) {
        throw new Error("Audio files only");
    }

    // Check file size (e.g., max 25MB for voice messages)
    if (blob.size > 25 * 1024 * 1024) {
        throw new Error("Max 25MB per voice message");
    }

    const fd = new FormData();
    fd.append("file", blob, fileName);
    fd.append("upload_preset", PRESET);
    fd.append("folder", "cowork-voice");

    // Add resource_type parameter for audio files
    fd.append("resource_type", "video"); // Cloudinary treats audio as video type

    // Add optional audio-specific parameters
    fd.append("audio_codec", "opus"); // Specify codec for better compatibility
    fd.append("bit_rate", "64k"); // Optimize for voice

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/video/upload`, {
        method: "POST",
        body: fd
    });

    const d = await res.json();
    if (!res.ok) {
        console.error("Cloudinary upload error:", d);
        throw new Error(d.error?.message || "Voice upload failed");
    }

    return {
        url: d.secure_url,
        publicId: d.public_id,
        duration: d.duration || 0,
        format: d.format,
        bytes: d.bytes
    };
}

// PDF → backend → Google Drive
// PDF → backend → Google Drive
export async function uploadPDF(file) {
    // ── Client-side size check — backend multer limit is also 50MB ──
    if (file.size > 50 * 1024 * 1024) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        throw new Error(`File "${file.name}" is ${sizeMB}MB. Maximum allowed size is 50MB.`);
    }
    const token = await getToken();
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/cowork/upload/pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
    });
    const d = await res.json();
    if (!res.ok) {
        console.error("[uploadPDF] Backend error response:", d);
        throw new Error(d?.message || d?.error || `PDF upload failed (HTTP ${res.status})`);
    }
    return d;
}

// Tasks
export async function createTask({ title, description, notes, requirements, assigneeIds, dueDate, priority, parentTaskId, createdByRole, createdBy, createdByCeo, createdByTl, status, isFolder, isRepeat, repeatConfig, isThirdParty, thirdPartyConfig, isGoal, goalConfig, hasTimer, fixedDeadline, isSelfAssigned, visibleTo, approverId, approverName, senderTimerWindowSecs, isGoldTask = false, c2Config = null, etcHours = 0 }) {
    const d = await api("/cowork/task/create", {
        method: "POST",
        body: JSON.stringify({
            title, description, notes, requirements: requirements || [], assigneeIds, dueDate, priority,
            parentTaskId: parentTaskId || null,
            createdByRole, createdBy, createdByCeo, createdByTl, status,
            isFolder: isFolder || false,
            isRepeat: isRepeat || false, repeatConfig: repeatConfig || null,
            isThirdParty: isThirdParty || false, thirdPartyConfig: thirdPartyConfig || null,
            isGoal: isGoal || false, goalConfig: goalConfig || null,
            isGoldTask: isGoldTask || false, c2Config: c2Config || null,
            // ── Timer/Deadline mode ─────────────────────────────────────────
            // hasTimer: true  → employee-set deadline flow (start/pause timer concept)
            // hasTimer: false → CEO/TL set a fixed deadline at creation; no start/pause
            hasTimer: hasTimer !== undefined ? hasTimer : true,
            fixedDeadline: hasTimer === false ? (fixedDeadline || null) : null,
            // ── Sender-preset timer: duration set by CEO/TL at task creation ──
            // When > 0 and hasTimer===true, receiver sees "Time set: X hrs — Approve or suggest"
            senderTimerWindowSecs: (hasTimer !== false && senderTimerWindowSecs) ? Number(senderTimerWindowSecs) : 0,
            // ── Self-assign fields ──────────────────────────────────────────
            isSelfAssigned: isSelfAssigned || false,
            visibleTo: visibleTo || [],
            approverId: approverId || null,
            approverName: approverName || null,
        }),
    });
    return d.task;
}

export async function listTasks() {
    try {
        const d = await api("/cowork/task/list-hierarchy");
        return d.tasks || [];
    } catch {
        const d = await api("/cowork/task/list");
        return d.tasks || [];
    }
}

export async function getFullTask(taskId) {
    const d = await api(`/cowork/task/${taskId}/details`);
    return d.task;
}

export async function forwardTask(taskId, assignments) {
    return api(`/cowork/task/${taskId}/forward`, {
        method: "POST",
        body: JSON.stringify({ assignments }),
    });
}

export async function editTaskDeadline({ taskId, newDueDate, reason }) {
    return api(`/cowork/task/${taskId}/deadline`, {
        method: "PATCH",
        body: JSON.stringify({ newDueDate, reason }),
    });
}

export async function deleteTask(taskId) {
    return api(`/cowork/task/${taskId}`, { method: "DELETE" });
}

// Task chat — isolated per task (cowork_tasks/{taskId}/chat subcollection)
// sendTaskChat / getTaskChat — removed from API layer.
// Task chat now uses Firestore directly in tasks/page.js:
//   WRITE cowork_tasks/{taskId}/chat/{messageId} via setDoc()
//   READ  cowork_tasks/{taskId}/chat via onSnapshot()

// Daily reports — isolated per task
export async function submitDailyReport(taskId, payload) {
    return api(`/cowork/task/${taskId}/daily-report`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

export async function getDailyReports(taskId) {
    const d = await api(`/cowork/task/${taskId}/daily-reports`);
    return d.reports || [];
}

// Completion flow
export async function submitCompletionRequest({ taskId, message, imageUrls, pdfAttachments }) {
    return api(`/cowork/task/${taskId}/submit-completion`, {
        method: "POST",
        body: JSON.stringify({ message, imageUrls, pdfAttachments }),
    });
}

export async function reviewCompletion({ taskId, approved, rejectionReason }) {
    return api(`/cowork/task/${taskId}/review-completion`, {
        method: "POST",
        body: JSON.stringify({ approved, rejectionReason }),
    });
}

export async function ceoReviewCompletion({ taskId, approved, rejectionReason }) {
    return api(`/cowork/task/${taskId}/ceo-review`, {
        method: "POST",
        body: JSON.stringify({ approved, rejectionReason }),
    });
}

// Employees
export async function listAllEmployees() {
    // Read cowork_employees directly from Firestore — no backend needed
    const { firebaseDb } = await import("./coworkFirebase");
    const { collection, getDocs } = await import("firebase/firestore");
    try {
        const snap = await getDocs(collection(firebaseDb, "cowork_employees"));
        return snap.docs.map(d => ({ employeeId: d.id, ...d.data() }));
    } catch (e) {
        console.error("listAllEmployees:", e);
        // fallback to backend
        const d = await api("/cowork/employee/list-members");
        return d.employees || [];
    }
}

// Messaging
// sendGroupMessageWithMedia — removed from API layer.
// Group chat now uses Firestore directly in group-chat/[groupId]/page.js:
//   WRITE cowork_groups/{groupId}/messages/{messageId} via setDoc()
//   READ  cowork_groups/{groupId}/messages via onSnapshot()

// sendDirectMessageWithMedia — REMOVED.
// Direct messages now write directly to Firestore from the [conversationId] page.
// Use firebaseDb from lib/coworkFirebase.js instead.

export async function updateParentProgress(taskId, note) {
    return api(`/cowork/task/${taskId}/parent-progress`, {
        method: "PATCH",
        body: JSON.stringify({ note }),
    });
}