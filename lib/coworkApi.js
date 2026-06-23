/**
 * GRAV-CMS/lib/coworkApi.js
 * Added: approveTask for TL to approve tasks assigned to them by employees
 */
import { firebaseAuth } from "./coworkFirebase";
const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function coworkFetch(path, opts = {}) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(`${BASE}/cowork${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Server error (${res.status}) on ${path} — response was not JSON`);
  }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const getMe = () => coworkFetch("/me");
export const changePassword = (body) => coworkFetch("/change-password", { method: "POST", body: JSON.stringify(body) });
export const changeEmail = (body) => coworkFetch("/change-email", { method: "POST", body: JSON.stringify(body) });

// Employee creation — includes role ("tl" | "employee"), department, and employeeId (biometricId from HR MongoDB)
export const createEmployee = (body) => coworkFetch("/employee/create", { method: "POST", body: JSON.stringify(body) });
export const updateEmployeeId = (oldId, newEmployeeId) => coworkFetch(`/employee/${oldId}/update-id`, { method: "PATCH", body: JSON.stringify({ newEmployeeId }) });
export const fetchMyManagers = (employeeId) => coworkFetch(`/employee/my-managers/${employeeId}`);
export const listEmployees = () => coworkFetch("/employee/list");
export const deleteEmployee = (employeeId) => coworkFetch(`/employee/${employeeId}`, { method: "DELETE" });
export const resetEmployeePassword = (employeeId, newPassword) => coworkFetch(`/employee/${employeeId}/reset-password`, { method: "POST", body: JSON.stringify({ newPassword }) });

export const createGroup = (body) => coworkFetch("/group/create", { method: "POST", body: JSON.stringify(body) });
export const deleteGroup = (id) => coworkFetch(`/group/${id}`, { method: "DELETE" });
export const listGroups = () => coworkFetch("/group/list");
export const sendGroupMessage = (gid, b) => coworkFetch(`/group/${gid}/message`, { method: "POST", body: JSON.stringify(b) });
export const getGroupMessages = (gid, l = 60) => coworkFetch(`/group/${gid}/messages?limit=${l}`);
export const sendDirectMessage = (body) => coworkFetch("/direct-message/send", { method: "POST", body: JSON.stringify(body) });
export const listConversations = () => coworkFetch("/direct-message/conversations");
export const getDirectMessages = (cid, l = 60) => coworkFetch(`/direct-message/${cid}/messages?limit=${l}`);
export const scheduleMeet = (body) => coworkFetch("/schedule-meet/create", { method: "POST", body: JSON.stringify(body) });
export const listMeets = () => coworkFetch("/schedule-meet/list");
export const getMeet = (id) => coworkFetch(`/schedule-meet/${id}`);
export const assignTask = (body) => coworkFetch("/task/assign", { method: "POST", body: JSON.stringify(body) });
export const updateTaskProgress = (tid, b) => coworkFetch(`/task/${tid}/progress`, { method: "PATCH", body: JSON.stringify(b) });
export const listTasks = () => coworkFetch("/task/list");

// TL approves a task that was assigned to them by an employee
export const approveTask = (taskId) => coworkFetch(`/task/${taskId}/approve`, { method: "POST", body: JSON.stringify({}) });

export const getNotifications = (u = false) => coworkFetch(`/notifications${u ? "?unreadOnly=true" : ""}`);
export const markAllRead = () => coworkFetch("/notifications/read-all", { method: "PATCH" });
export const saveFCMToken = (t) => coworkFetch("/employee/fcm-token", { method: "POST", body: JSON.stringify({ token: t }) });
export const cancelMeet = (meetId) => coworkFetch(`/schedule-meet/${meetId}/cancel`, { method: "PATCH" });
export const updateMeet = (meetId, body) => coworkFetch(`/schedule-meet/${meetId}/edit`, { method: "PATCH", body: JSON.stringify(body) });
// ── SOP API ───────────────────────────────────────────────────────────────────
export const fetchSops = () => coworkFetch("/sop");
export const createSop = (body) => coworkFetch("/sop", { method: "POST", body: JSON.stringify(body) });
export const updateSop = (id, body) => coworkFetch(`/sop/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteSop = (id) => coworkFetch(`/sop/${id}`, { method: "DELETE" });
export const approveSop = (id) => coworkFetch(`/sop/${id}/approve`, { method: "PATCH" });
export const rejectSop = (id) => coworkFetch(`/sop/${id}/reject`, { method: "PATCH" });
export const applyBleach = (body) => coworkFetch("/sop/bleach", { method: "POST", body: JSON.stringify(body) });
export const fetchBleachHistory = (employeeId) => coworkFetch(`/sop/bleach/${employeeId}`);

// ── SOP Folder API ────────────────────────────────────────────────────────────
export const fetchFolders = () => coworkFetch("/sop/folders");
export const createFolder = (body) => coworkFetch("/sop/folders", { method: "POST", body: JSON.stringify(body) });
export const deleteFolder = (id) => coworkFetch(`/sop/folders/${id}`, { method: "DELETE" });



// ── Recheck API ───────────────────────────────────────────────────────────────
export const requestRecheck = (employeeId, bleachId, body) => coworkFetch(`/sop/bleach/${employeeId}/${bleachId}/recheck`, { method: "POST", body: JSON.stringify(body) });
export const reviewRecheck = (employeeId, bleachId, body) => coworkFetch(`/sop/bleach/${employeeId}/${bleachId}/recheck`, { method: "PATCH", body: JSON.stringify(body) });
export const fetchRecheckCount = () => coworkFetch("/sop/recheck/pending-count");
export const fetchRecheckList = () => coworkFetch("/sop/recheck/pending-list");
export const fetchTaskSuggestions = () => coworkFetch("/sop/task-suggestions");
export const dismissTaskSuggestion = (body) => coworkFetch("/sop/task-suggestions/dismiss", { method: "POST", body: JSON.stringify(body) });

// ── C2 Band (Gold Tasks) ──────────────────────────────────────────────────────
// Returns { success, c2GlobalMaxPoints, totalUsed, remaining }
export const getC2Config = () => coworkFetch("/c2/config");

// Returns { success, tasks, totalWeightage, remainingWeightage, globalMaxPoints }
export const getC2GoldTasks = () => coworkFetch("/c2/gold-tasks");

// Returns { success, employeeId, globalMaxPoints, totalEarned, taskBreakdown, updatedAt }
export const getC2Scores = (employeeId) => coworkFetch(`/c2/scores/${employeeId}`);

// Returns { success, scores[], globalMaxPoints }
export const getAllC2Scores = () => coworkFetch("/c2/scores");

// POST body: { weightagePercent: number, excludeTaskId?: string }
// Returns { valid: bool, error?: string, remaining, totalUsed, requested, afterAdding }
export const validateC2Weightage = (body) =>
  coworkFetch("/c2/validate-weightage", { method: "POST", body: JSON.stringify(body) });
// ── C1 Band (Task Execution Quality Score) ────────────────────────────────────
// Returns { success, c1MaxPoints, c1BaseScore, c1DeadlineDeduction, ... }
export const getC1Config = () => coworkFetch("/c1/config");

// Returns { success, employeeId, qualityRate, c1Net, c1MaxPoints, taskBreakdown }
export const getC1Scores = (employeeId) => coworkFetch(`/c1/scores/${employeeId}`);

// Returns { success, scores[], c1MaxPoints }
export const getAllC1Scores = () => coworkFetch("/c1/scores");

// POST body: { taskId, isRejected?, submittedAt? }
// Returns { success, taskScore, deadlinesMissed, extensionsFiled, reworksReceived, cfg }
export const getC1Preview = (body) =>
  coworkFetch("/c1/preview", { method: "POST", body: JSON.stringify(body) });

// POST body: { reworkReason }
export const reworkTask = (taskId, body) =>
  coworkFetch(`/task/${taskId}/rework`, { method: "POST", body: JSON.stringify(body) });

// POST body: { waiveDeduction: bool, newDeadline?: string }
export const submitExtensionDeduction = (taskId, body) =>
  coworkFetch(`/task/${taskId}/extension-deduction`, { method: "POST", body: JSON.stringify(body) });

// ── Band Config API ───────────────────────────────────────────────────────────
export const getBandConfig = () => coworkFetch("/band-config");
export const saveBandConfig = (body) =>
  coworkFetch("/band-config", { method: "POST", body: JSON.stringify(body) });
export const getBandDesignations = () => coworkFetch("/band-config/designations");
export const getEmployeeBands = () => coworkFetch("/band-config/employee-bands");

export const getWorkloadSummary = () => coworkFetch("/workload/summary");