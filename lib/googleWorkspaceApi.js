// lib/googleWorkspaceApi.js
// All frontend API calls for Google Workspace data

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function gFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "API error");
  return data;
}

// ── Dashboard (all at once) ────────────────────────────────────
export const getGoogleDashboard    = ()          => gFetch("/api/google/dashboard");

// ── Tasks ──────────────────────────────────────────────────────
export const getGoogleTaskLists    = ()          => gFetch("/api/google/tasks/lists");
export const getGoogleTasksAll     = ()          => gFetch("/api/google/tasks");
export const getGoogleTasksFlat    = ()          => gFetch("/api/google/tasks/flat");
export const getGoogleTasksByList  = (listId)    => gFetch(`/api/google/tasks/list/${listId}`);
export const createGoogleTask      = (body)      => gFetch("/api/google/tasks", { method: "POST", body: JSON.stringify(body) });
export const updateGoogleTaskApi   = (listId, taskId, body) =>
  gFetch(`/api/google/tasks/${listId}/${taskId}`, { method: "PATCH", body: JSON.stringify(body) });

// ── Gmail ──────────────────────────────────────────────────────
export const getGmailInbox         = (max = 20)  => gFetch(`/api/google/gmail/inbox?max=${max}`);
export const getGmailMessage       = (id)        => gFetch(`/api/google/gmail/message/${id}`);
export const getGmailUnread        = ()          => gFetch("/api/google/gmail/unread");
export const searchGmail           = (q)         => gFetch(`/api/google/gmail/search?q=${encodeURIComponent(q)}`);

// ── Calendar ───────────────────────────────────────────────────
export const getCalendarEvents     = (days = 30) => gFetch(`/api/google/calendar/events?days=${days}`);
export const getCalendarToday      = ()          => gFetch("/api/google/calendar/today");
export const createCalendarEvent   = (body)      => gFetch("/api/google/calendar/events", { method: "POST", body: JSON.stringify(body) });

// ── Drive ──────────────────────────────────────────────────────
export const getDriveFiles         = (max = 20)  => gFetch(`/api/google/drive/files?max=${max}`);
export const searchDriveFiles      = (q)         => gFetch(`/api/google/drive/search?q=${encodeURIComponent(q)}`);
