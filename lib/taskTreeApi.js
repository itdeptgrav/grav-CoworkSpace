/**
 * GRAV-CMS/lib/taskTreeApi.js
 * All API calls for the unlimited-nesting task tree system.
 * UPDATED: Added createdBy field support and task creation notifications
 */

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const h = (token) => ({ Authorization: `Bearer ${token}` });
const jh = (token) => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

const call = async (url, options) => {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data;
};

// ─── Task CRUD ────────────────────────────────────────────────────────────────

export const createTask = (taskData, token) => {
    // Ensure createdBy is included in the request
    const requestData = {
        ...taskData,
        createdBy: taskData.createdBy,
        createdByRole: taskData.createdByRole
    };
    return call(`${API}/cowork/task/create`, {
        method: "POST",
        headers: jh(token),
        body: JSON.stringify(requestData)
    });
};

export const getRootTasks = (token, filterByCreator = false, creatorId = null) => {
    // Build URL with optional filter parameters
    let url = `${API}/cowork/tasks/roots`;
    if (filterByCreator && creatorId) {
        url += `?createdBy=${creatorId}`;
    }
    return call(url, { headers: h(token) }).then((d) => d.tasks || []);
};

export const getTask = (taskId, token) =>
    call(`${API}/cowork/task/${taskId}`, { headers: h(token) }).then((d) => d.task);

export const getTaskTree = (taskId, token, filterByCreator = false, creatorId = null) => {
    let url = `${API}/cowork/task/${taskId}/tree`;
    const params = new URLSearchParams();
    if (filterByCreator && creatorId) {
        params.append('createdBy', creatorId);
    }
    if (params.toString()) {
        url += `?${params.toString()}`;
    }
    return call(url, { headers: h(token) }).then((d) => d.tree);
};

export const getTaskTreeWithVisibility = (taskId, token, userRole, userId) => {
    let url = `${API}/cowork/task/${taskId}/tree`;
    const params = new URLSearchParams();
    params.append('userRole', userRole);
    params.append('userId', userId);
    url += `?${params.toString()}`;
    return call(url, { headers: h(token) }).then((d) => d.tree);
};

export const getBreadcrumb = (taskId, token) =>
    call(`${API}/cowork/task/${taskId}/breadcrumb`, { headers: h(token) }).then((d) => d.breadcrumb || []);

export const updateTask = (taskId, updates, token) =>
    call(`${API}/cowork/task/${taskId}/update`, { method: "PUT", headers: jh(token), body: JSON.stringify(updates) });

export const editDeadline = (taskId, newDeadline, reason, token) =>
    call(`${API}/cowork/task/${taskId}/deadline`, { method: "PUT", headers: jh(token), body: JSON.stringify({ newDeadline, reason }) });

export const deleteTask = (taskId, token) =>
    call(`${API}/cowork/task/${taskId}/delete`, { method: "DELETE", headers: h(token) });

export const forwardTask = (taskId, toUserId, notes, token) =>
    call(`${API}/cowork/task/${taskId}/forward`, { method: "POST", headers: jh(token), body: JSON.stringify({ toUserId, notes }) });

export const confirmTask = (taskId, token) =>
    call(`${API}/cowork/task/${taskId}/confirm`, { method: "POST", headers: h(token) });

export const startTask = (taskId, token) =>
    call(`${API}/cowork/task/${taskId}/start`, { method: "POST", headers: h(token) });

// ─── Task Chat ────────────────────────────────────────────────────────────────

export const getChatMessages = (taskId, token) =>
    call(`${API}/cowork/task/${taskId}/chat/messages`, { headers: h(token) }).then((d) => d.messages || []);

export const sendChatMessage = (taskId, msgData, token) =>
    call(`${API}/cowork/task/${taskId}/chat/send`, { method: "POST", headers: jh(token), body: JSON.stringify(msgData) });

// Send system notification about subtask creation
export const sendSubtaskCreatedNotification = (taskId, subtaskData, token) =>
    call(`${API}/cowork/task/${taskId}/chat/notify-subtask`, {
        method: "POST",
        headers: jh(token),
        body: JSON.stringify(subtaskData)
    });

// Upload image via backend → Cloudinary
export const uploadChatImage = async (taskId, file, token) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API}/cowork/task/${taskId}/chat/upload-image`, {
        method: "POST", headers: h(token), body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Image upload failed");
    return data;
};

// Upload voice via backend → Cloudinary
export const uploadChatVoice = async (taskId, blob, token) => {
    const fd = new FormData();
    fd.append("file", blob, "voice.webm");
    const res = await fetch(`${API}/cowork/task/${taskId}/chat/upload-voice`, {
        method: "POST", headers: h(token), body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Voice upload failed");
    return data;
};

// Upload PDF via backend → Google Drive
export const uploadChatPDF = async (taskId, file, token) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API}/cowork/task/${taskId}/chat/upload-pdf`, {
        method: "POST", headers: h(token), body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "PDF upload failed");
    return data;
};

// ─── Daily Reports ────────────────────────────────────────────────────────────

export const submitReport = (taskId, reportData, token) =>
    call(`${API}/cowork/task/${taskId}/report/submit`, { method: "POST", headers: jh(token), body: JSON.stringify(reportData) });

export const getReports = (taskId, token) =>
    call(`${API}/cowork/task/${taskId}/reports`, { headers: h(token) }).then((d) => d.reports || []);

// ─── Completion verification ──────────────────────────────────────────────────

export const submitCompletionProof = (taskId, proofData, token) =>
    call(`${API}/cowork/task/${taskId}/complete/submit`, { method: "POST", headers: jh(token), body: JSON.stringify(proofData) });

export const tlReview = (taskId, decision, reason, token) =>
    call(`${API}/cowork/task/${taskId}/complete/tl-review`, { method: "POST", headers: jh(token), body: JSON.stringify({ decision, rejectionReason: reason }) });

export const ceoReview = (taskId, decision, reason, token) =>
    call(`${API}/cowork/task/${taskId}/complete/ceo-review`, { method: "POST", headers: jh(token), body: JSON.stringify({ decision, rejectionReason: reason }) });

// ─── Employees list (reuse from existing) ────────────────────────────────────
export const listEmployees = (token) =>
    call(`${API}/cowork/employees/list`, { headers: h(token) }).then((d) => d.employees || []);

// ─── New API for fetching tasks with visibility filtering ────────────────────

export const getTasksByCreator = (creatorId, token) =>
    call(`${API}/cowork/tasks/by-creator/${creatorId}`, { headers: h(token) }).then((d) => d.tasks || []);

export const getVisibleTasksForUser = (userId, userRole, token) =>
    call(`${API}/cowork/tasks/visible`, {
        method: "POST",
        headers: jh(token),
        body: JSON.stringify({ userId, userRole })
    }).then((d) => d.tasks || []);

// ─── Helper function to get task with full hierarchy (for CEOs) ─────────────

export const getTaskHierarchyForCEO = async (taskId, token, ceoId) => {
    try {
        // First get the root task
        const rootTask = await getTask(taskId, token);

        // If CEO didn't create this task, return null
        if (rootTask.createdBy !== ceoId) {
            return null;
        }

        // Get full tree but filter by creator
        const fullTree = await getTaskTree(taskId, token, true, ceoId);
        return fullTree;
    } catch (error) {
        console.error("Error getting task hierarchy for CEO:", error);
        throw error;
    }
};

// ─── Bulk operations for task visibility ─────────────────────────────────────

export const batchUpdateTaskVisibility = async (taskIds, updates, token) => {
    return call(`${API}/cowork/tasks/batch-update`, {
        method: "POST",
        headers: jh(token),
        body: JSON.stringify({ taskIds, updates })
    });
};

// ─── Export all functions
export default {
    createTask,
    getRootTasks,
    getTask,
    getTaskTree,
    getTaskTreeWithVisibility,
    getBreadcrumb,
    updateTask,
    editDeadline,
    deleteTask,
    forwardTask,
    confirmTask,
    startTask,
    getChatMessages,
    sendChatMessage,
    sendSubtaskCreatedNotification,
    uploadChatImage,
    uploadChatVoice,
    uploadChatPDF,
    submitReport,
    getReports,
    submitCompletionProof,
    tlReview,
    ceoReview,
    listEmployees,
    getTasksByCreator,
    getVisibleTasksForUser,
    getTaskHierarchyForCEO,
    batchUpdateTaskVisibility
};