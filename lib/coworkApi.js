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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const getMe = () => coworkFetch("/me");
export const changePassword = (body) => coworkFetch("/change-password", { method: "POST", body: JSON.stringify(body) });

// Employee creation — includes role ("tl" | "employee") and department (for TL)
export const createEmployee = (body) => coworkFetch("/employee/create", { method: "POST", body: JSON.stringify(body) });
export const listEmployees = () => coworkFetch("/employee/list");

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