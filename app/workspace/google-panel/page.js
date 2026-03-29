"use client";
// app/workspace/google-panel/page.js

import { useState, useEffect, useRef } from "react";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || `HTTP ${res.status}`); }
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || `HTTP ${res.status}`); }
  return res.json();
}
async function apiPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || `HTTP ${res.status}`); }
  return res.json();
}

const fmtDate = (d) => { if (!d) return "—"; const dt = new Date(d); return isNaN(dt) ? "—" : dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
const fmtDT = (d) => { if (!d) return "—"; const dt = new Date(d); return isNaN(dt) ? "—" : dt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
const fmtTimeAgo = (d) => {
  if (!d) return "";
  const diff = Math.floor((new Date() - new Date(d)) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return fmtDate(d);
};
const isOverdue = (due) => due && new Date(due) < new Date();
const isToday = (due) => { if (!due) return false; return new Date(due).toDateString() === new Date().toDateString(); };
const stripHtml = (html) => html?.replace(/<[^>]*>/g, "") || "";
const initials = (name = "") => name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";
const SPACE_COLORS = ["#1a73e8", "#0f9d58", "#f4511e", "#8430ce", "#e52592", "#00838f", "#e65100", "#c62828", "#2979ff", "#00796b"];

export default function GooglePanelPage() {
  const [tab, setTab] = useState("tasks");
  // Tasks
  const [tasks, setTasks] = useState([]);
  const [taskLists, setTaskLists] = useState([]);
  const [taskStats, setTaskStats] = useState({});
  const [tasksByList, setTasksByList] = useState({});
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterList, setFilterList] = useState("all");
  const [expandedTask, setExpandedTask] = useState(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [ntForm, setNtForm] = useState({ tasklistId: "", title: "", notes: "", due: "" });
  const [newSubtask, setNewSubtask] = useState({ parentTaskId: "", title: "" });
  // Gmail
  const [emails, setEmails] = useState([]);
  const [openEmail, setOpenEmail] = useState(null);
  const [gmailCount, setGmailCount] = useState({ unread: 0, total: 0 });
  // Calendar
  const [calEvents, setCalEvents] = useState([]);
  const [todayEvents, setTodayEvents] = useState([]);
  const [calDays, setCalDays] = useState(30);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [evForm, setEvForm] = useState({ title: "", description: "", start: "", end: "", attendees: "" });
  // Drive
  const [driveFiles, setDriveFiles] = useState([]);
  // Chat Spaces
  const [spaces, setSpaces] = useState([]);
  const [activeSpace, setActiveSpace] = useState(null);
  const [spaceMessages, setSpaceMessages] = useState([]);
  const [spaceMembers, setSpaceMembers] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  // Shared
  const [loading, setLoading] = useState({});
  const [error, setError] = useState({});
  const [search, setSearch] = useState("");
  const msgEndRef = useRef(null);

  const setLoad = (k, v) => setLoading(p => ({ ...p, [k]: v }));
  const setErr = (k, v) => setError(p => ({ ...p, [k]: v }));

  // Load dashboard on mount
  useEffect(() => { loadDashboard(); }, []);
  useEffect(() => { if (tab === "tasks") loadTasks(); }, [tab]);
  useEffect(() => { if (tab === "gmail") loadGmail(); }, [tab]);
  useEffect(() => { if (tab === "calendar") loadCalendar(); }, [tab, calDays]);
  useEffect(() => { if (tab === "drive") loadDrive(); }, [tab]);
  useEffect(() => { if (tab === "spaces") loadSpaces(); }, [tab]);

  // Scroll to bottom when messages load
  useEffect(() => {
    if (spaceMessages.length > 0) {
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [spaceMessages]);

  const loadDashboard = async () => {
    setLoad("dashboard", true);
    try {
      const r = await apiFetch("/api/google/dashboard");
      setTasks(r.data.tasks || []);
      setTaskStats(r.data.taskStats || {});
      setTasksByList(r.data.tasksByList || {});
      setGmailCount(r.data.gmail || { unread: 0, total: 0 });
      setTodayEvents(r.data.todayEvents || []);
      if (r.data.spaces?.length > 0) setSpaces(r.data.spaces);
    } catch (e) { setErr("dashboard", e.message); }
    setLoad("dashboard", false);
  };

  const loadTasks = async () => {
    setLoad("tasks", true); setErr("tasks", "");
    try {
      const [flatR, listR] = await Promise.all([apiFetch("/api/google/tasks/flat"), apiFetch("/api/google/tasks/lists")]);
      setTasks(flatR.data || []);
      setTaskStats(flatR.stats || {});
      setTasksByList(flatR.byList || {});
      setTaskLists(listR.data || []);
      if (listR.data?.length > 0 && !ntForm.tasklistId) setNtForm(p => ({ ...p, tasklistId: listR.data[0].id }));
    } catch (e) { setErr("tasks", e.message); }
    setLoad("tasks", false);
  };

  const loadGmail = async () => {
    setLoad("gmail", true); setErr("gmail", "");
    try { const r = await apiFetch("/api/google/gmail/inbox?max=30"); setEmails(r.data || []); }
    catch (e) { setErr("gmail", e.message); }
    setLoad("gmail", false);
  };

  const loadCalendar = async () => {
    setLoad("calendar", true); setErr("calendar", "");
    try { const r = await apiFetch(`/api/google/calendar/events?days=${calDays}`); setCalEvents(r.data || []); }
    catch (e) { setErr("calendar", e.message); }
    setLoad("calendar", false);
  };

  const loadDrive = async () => {
    setLoad("drive", true); setErr("drive", "");
    try { const r = await apiFetch("/api/google/drive/files?max=30"); setDriveFiles(r.data || []); }
    catch (e) { setErr("drive", e.message); }
    setLoad("drive", false);
  };

  const loadSpaces = async () => {
    setLoad("spaces", true); setErr("spaces", "");
    try { const r = await apiFetch("/api/google/chat/spaces"); setSpaces(r.data || []); }
    catch (e) { setErr("spaces", e.message); }
    setLoad("spaces", false);
  };

  const openSpace = async (space) => {
    setActiveSpace(space);
    setSpaceMessages([]);
    setSpaceMembers([]);
    setLoadingMessages(true);
    try {
      const [msgR, memR] = await Promise.all([
        apiFetch(`/api/google/chat/spaces/${space.id}/messages?limit=50`),
        apiFetch(`/api/google/chat/spaces/${space.id}/members`),
      ]);
      setSpaceMessages(msgR.data || []);
      setSpaceMembers(memR.data || []);
    } catch (e) { console.error(e); }
    setLoadingMessages(false);
  };

  const toggleTask = async (task) => {
    const newStatus = task.status === "completed" ? "needsAction" : "completed";
    try {
      await apiPatch(`/api/google/tasks/${task.listId}/${task.id}`, { status: newStatus });
      setTasks(p => p.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    } catch (e) { alert(e.message); }
  };

  const toggleSubtask = async (task, sub) => {
    const newStatus = sub.status === "completed" ? "needsAction" : "completed";
    try {
      await apiPatch(`/api/google/tasks/${sub.listId}/${sub.id}`, { status: newStatus });
      setTasks(p => p.map(t => t.id === task.id ? { ...t, subtasks: t.subtasks.map(s => s.id === sub.id ? { ...s, status: newStatus } : s) } : t));
    } catch (e) { alert(e.message); }
  };

  const handleCreateTask = async () => {
    if (!ntForm.title.trim() || !ntForm.tasklistId) return;
    try {
      await apiPost("/api/google/tasks", ntForm);
      setShowNewTask(false); setNtForm(p => ({ ...p, title: "", notes: "", due: "" }));
      await loadTasks();
    } catch (e) { alert(e.message); }
  };

  const handleCreateSubtask = async (task) => {
    if (!newSubtask.title.trim()) return;
    try {
      await apiPost("/api/google/tasks/subtask", { tasklistId: task.listId, parentTaskId: task.id, title: newSubtask.title });
      setNewSubtask({ parentTaskId: "", title: "" });
      await loadTasks();
    } catch (e) { alert(e.message); }
  };

  const handleCreateEvent = async () => {
    if (!evForm.title || !evForm.start || !evForm.end) return;
    try {
      await apiPost("/api/google/calendar/events", { title: evForm.title, description: evForm.description, start: new Date(evForm.start).toISOString(), end: new Date(evForm.end).toISOString(), attendees: evForm.attendees.split(",").map(e => e.trim()).filter(Boolean) });
      setShowNewEvent(false); setEvForm({ title: "", description: "", start: "", end: "", attendees: "" });
      await loadCalendar();
    } catch (e) { alert(e.message); }
  };

  const filteredTasks = tasks.filter(t => {
    const matchList = filterList === "all" || t.listId === filterList;
    const matchStatus = filterStatus === "all" ? true : filterStatus === "pending" ? t.status === "needsAction" : filterStatus === "completed" ? t.status === "completed" : filterStatus === "overdue" ? isOverdue(t.due) && t.status !== "completed" : filterStatus === "today" ? isToday(t.due) : true;
    const matchSearch = !search.trim() || t.title?.toLowerCase().includes(search.toLowerCase());
    return matchList && matchStatus && matchSearch;
  });

  const TABS = [
    { id: "tasks", label: "Tasks", color: "#1a73e8", count: taskStats.pending || 0 },
    { id: "spaces", label: "Spaces", color: "#673ab7", count: spaces.length },
    { id: "gmail", label: "Gmail", color: "#ea4335", count: gmailCount.unread },
    { id: "calendar", label: "Calendar", color: "#0f9d58", count: todayEvents.length },
    { id: "drive", label: "Drive", color: "#fbbc04", count: null },
  ];

  return (
    <div className="min-h-screen bg-[#f8f9fa]" style={{ fontFamily: "'Google Sans','Segoe UI',sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between py-3 gap-4">
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" className="w-7 h-7 flex-shrink-0">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <div>
                <h1 className="text-base font-semibold text-gray-800 leading-tight">Google Workspace</h1>
                <p className="text-[11px] text-gray-400">Live data from your Google account</p>
              </div>
            </div>
            <div className="flex-1 max-w-lg">
              <div className="flex items-center bg-gray-100 rounded-full px-4 py-2 gap-2">
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg>
                <input className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
                {search && <button onClick={() => setSearch("")} className="text-gray-400 text-sm">✕</button>}
              </div>
            </div>
            <button onClick={loadDashboard} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-full hover:bg-gray-50">
              <svg className={`w-3.5 h-3.5 ${loading.dashboard ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Refresh
            </button>
          </div>
          {/* Stats */}
          <div className="flex items-center gap-4 pb-2.5 text-xs text-gray-500 flex-wrap">
            <span><span className="font-semibold text-gray-700">{taskStats.total || 0}</span> tasks</span>
            <span><span className="font-semibold text-blue-600">{taskStats.pending || 0}</span> pending</span>
            <span><span className="font-semibold text-red-600">{taskStats.overdue || 0}</span> overdue</span>
            <span><span className="font-semibold text-green-600">{taskStats.completed || 0}</span> done</span>
            <span className="text-gray-300">|</span>
            <span><span className="font-semibold text-purple-600">{spaces.length}</span> spaces</span>
            <span><span className="font-semibold text-red-500">{gmailCount.unread}</span> unread</span>
            <span><span className="font-semibold text-green-600">{todayEvents.length}</span> events today</span>
          </div>
          {/* Tabs */}
          <div className="flex -mb-px">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "text-gray-800" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
                style={{ borderBottomColor: tab === t.id ? t.color : undefined }}>
                <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                {t.label}
                {t.count != null && t.count > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{t.count}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5">

        {/* ══ TASKS ════════════════════════════════════════════════════════════ */}
        {tab === "tasks" && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { k: "all", l: `All (${tasks.length})` },
                  { k: "pending", l: `Pending (${tasks.filter(t => t.status === "needsAction").length})` },
                  { k: "completed", l: `Done (${tasks.filter(t => t.status === "completed").length})` },
                  { k: "overdue", l: `Overdue (${tasks.filter(t => isOverdue(t.due) && t.status !== "completed").length})` },
                  { k: "today", l: `Today (${tasks.filter(t => isToday(t.due) && t.status !== "completed").length})` },
                ].map(f => (
                  <button key={f.k} onClick={() => setFilterStatus(f.k)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === f.k ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
                    {f.l}
                  </button>
                ))}
                {taskLists.length > 1 && (
                  <select className="text-xs border border-gray-200 rounded-full px-3 py-1.5 bg-white text-gray-600 focus:outline-none"
                    value={filterList} onChange={e => setFilterList(e.target.value)}>
                    <option value="all">All lists</option>
                    {taskLists.map(l => <option key={l.id} value={l.id}>{l.title} ({tasksByList[l.title]?.total || 0})</option>)}
                  </select>
                )}
              </div>
              <button onClick={() => setShowNewTask(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700">
                + New Task
              </button>
            </div>

            {/* List summary */}
            {Object.keys(tasksByList).length > 0 && filterList === "all" && (
              <div className="flex gap-2 mb-4 flex-wrap">
                {Object.entries(tasksByList).map(([name, info]) => (
                  <button key={name} onClick={() => { const l = taskLists.find(l => l.title === name); if (l) setFilterList(l.id); }}
                    className="bg-white border border-gray-100 rounded-xl px-3 py-2 text-left hover:border-blue-200 hover:bg-blue-50 transition-all">
                    <p className="text-xs font-semibold text-gray-700">{name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{info.pending} pending · {info.completed} done</p>
                  </button>
                ))}
              </div>
            )}

            {error.tasks && <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">{error.tasks}</div>}
            {loading.tasks && <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>}

            {!loading.tasks && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {filteredTasks.length === 0 ? (
                  <div className="flex flex-col items-center py-16"><p className="text-sm text-gray-500">No tasks match this filter</p></div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="w-8 px-4 py-3" />
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">Task</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">List</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">Due</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">Status</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">Subtasks</th>
                        <th className="w-8 px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.map(t => (
                        <>
                          <tr key={t.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${t.status === "completed" ? "opacity-50" : ""}`}>
                            <td className="px-4 py-3">
                              <button onClick={() => toggleTask(t)}
                                className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${t.status === "completed" ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-blue-400"}`}>
                                {t.status === "completed" && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <p className={`text-sm font-medium text-gray-800 ${t.status === "completed" ? "line-through" : ""}`}>{t.title}</p>
                              {t.notes && <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-xs">{t.notes}</p>}
                            </td>
                            <td className="px-4 py-3"><span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{t.listTitle}</span></td>
                            <td className="px-4 py-3">
                              {t.due ? (
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isOverdue(t.due) && t.status !== "completed" ? "bg-red-100 text-red-700" : isToday(t.due) ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                                  {fmtDate(t.due)}{isOverdue(t.due) && t.status !== "completed" ? " ⚠" : ""}
                                </span>
                              ) : <span className="text-xs text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${t.status === "completed" ? "bg-green-100 text-green-700" : "bg-blue-50 text-blue-700"}`}>
                                {t.status === "completed" ? "✓ Done" : "○ Pending"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {t.subtasks?.length > 0 ? (
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                  {t.subtasks.filter(s => s.status === "completed").length}/{t.subtasks.length}
                                </span>
                              ) : <span className="text-xs text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => setExpandedTask(expandedTask === t.id ? null : t.id)} className="text-gray-400 hover:text-blue-600 text-sm">
                                {expandedTask === t.id ? "▲" : "▼"}
                              </button>
                            </td>
                          </tr>
                          {expandedTask === t.id && (
                            <tr key={`${t.id}-exp`}>
                              <td colSpan={7} className="px-8 pb-4 bg-blue-50/30">
                                <div className="pt-3">
                                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Subtasks</p>
                                  {(t.subtasks || []).length === 0 && <p className="text-xs text-gray-400 mb-2">No subtasks yet</p>}
                                  {(t.subtasks || []).map(sub => (
                                    <div key={sub.id} className="flex items-center gap-3 py-1.5 border-b border-gray-100">
                                      <button onClick={() => toggleSubtask(t, sub)}
                                        className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${sub.status === "completed" ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-green-400"}`}>
                                        {sub.status === "completed" && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                      </button>
                                      <span className={`flex-1 text-xs ${sub.status === "completed" ? "line-through text-gray-400" : "text-gray-700"}`}>{sub.title}</span>
                                    </div>
                                  ))}
                                  <div className="flex gap-2 mt-3">
                                    <input className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                                      placeholder="Add subtask..." value={newSubtask.parentTaskId === t.id ? newSubtask.title : ""}
                                      onChange={e => setNewSubtask({ parentTaskId: t.id, title: e.target.value })}
                                      onKeyDown={e => e.key === "Enter" && handleCreateSubtask(t)} />
                                    <button onClick={() => handleCreateSubtask(t)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium">Add</button>
                                  </div>
                                  {t.notes && <div className="mt-3 p-2.5 bg-white rounded-lg border border-gray-100"><p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Notes</p><p className="text-xs text-gray-600">{t.notes}</p></div>}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {showNewTask && (
              <Modal onClose={() => setShowNewTask(false)}>
                <h3 className="text-base font-semibold text-gray-800 mb-4">Create Google Task</h3>
                <div className="space-y-3">
                  <div><label className="text-xs font-medium text-gray-600 mb-1 block">Task List *</label>
                    <select className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={ntForm.tasklistId} onChange={e => setNtForm(p => ({ ...p, tasklistId: e.target.value }))}>
                      {taskLists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                    </select>
                  </div>
                  <GField label="Title *" value={ntForm.title} onChange={v => setNtForm(p => ({ ...p, title: v }))} placeholder="Task title..." />
                  <GField label="Notes" value={ntForm.notes} onChange={v => setNtForm(p => ({ ...p, notes: v }))} placeholder="Optional notes..." />
                  <GField label="Due Date" value={ntForm.due} onChange={v => setNtForm(p => ({ ...p, due: v }))} type="date" />
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setShowNewTask(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
                  <button onClick={handleCreateTask} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">Create Task</button>
                </div>
              </Modal>
            )}
          </div>
        )}

        {/* ══ SPACES (Chat) ════════════════════════════════════════════════════ */}
        {tab === "spaces" && (
          <div className="flex gap-4 h-[calc(100vh-220px)]">
            {/* Left: Spaces list */}
            <div className="w-64 flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-y-auto">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600">Spaces ({spaces.length})</p>
                <p className="text-[10px] text-gray-400 mt-0.5">IT, HR, Designing, Production...</p>
              </div>
              {error.spaces && (
                <div className="p-3">
                  <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{error.spaces}</p>
                  <p className="text-[10px] text-gray-400 mt-1">Note: Chat API requires re-authorization with chat scopes</p>
                </div>
              )}
              {loading.spaces && <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /></div>}
              {spaces.map((space, idx) => (
                <button key={space.name} onClick={() => openSpace(space)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 hover:bg-purple-50 transition-colors ${activeSpace?.name === space.name ? "bg-purple-50 border-l-4 border-l-purple-500" : ""}`}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: SPACE_COLORS[idx % SPACE_COLORS.length] }}>
                    {initials(space.displayName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${activeSpace?.name === space.name ? "text-purple-700" : "text-gray-800"}`}>{space.displayName}</p>
                    <p className="text-[10px] text-gray-400">{space.type === "SPACE" ? "Space" : "Group"}</p>
                  </div>
                </button>
              ))}
              {spaces.length === 0 && !loading.spaces && !error.spaces && (
                <div className="p-4 text-center">
                  <p className="text-xs text-gray-500">No spaces found</p>
                  <p className="text-[10px] text-gray-400 mt-1">You may need to re-authorize with Chat API scopes</p>
                  <a href={`http://localhost:5000/api/google/auth/url`} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-blue-600 hover:underline block mt-2">Re-authorize →</a>
                </div>
              )}
            </div>

            {/* Right: Messages */}
            <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
              {!activeSpace ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center">
                    <svg className="w-7 h-7 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  </div>
                  <p className="text-sm font-medium text-gray-700">Select a space to view messages</p>
                  <p className="text-xs text-gray-400">Click any space from the left panel</p>
                </div>
              ) : (
                <>
                  {/* Space header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: SPACE_COLORS[spaces.findIndex(s => s.name === activeSpace.name) % SPACE_COLORS.length] }}>
                      {initials(activeSpace.displayName)}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-gray-800">{activeSpace.displayName}</h3>
                      <p className="text-[11px] text-gray-400">{spaceMembers.length} members · {spaceMessages.length} messages loaded</p>
                    </div>
                    {/* Members avatars */}
                    <div className="flex -space-x-1">
                      {spaceMembers.slice(0, 5).map((m, i) => (
                        <div key={m.name} title={m.displayName}
                          className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-white text-[9px] font-bold"
                          style={{ backgroundColor: SPACE_COLORS[i % SPACE_COLORS.length] }}>
                          {initials(m.displayName)}
                        </div>
                      ))}
                      {spaceMembers.length > 5 && <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-gray-600 text-[9px] font-bold">+{spaceMembers.length - 5}</div>}
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
                    {loadingMessages && <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /></div>}
                    {!loadingMessages && spaceMessages.length === 0 && (
                      <div className="flex justify-center py-10"><p className="text-sm text-gray-400">No messages found</p></div>
                    )}
                    {spaceMessages.filter(m => !search || m.text?.toLowerCase().includes(search.toLowerCase())).map((msg, idx) => {
                      const prev = spaceMessages[idx - 1];
                      const showSender = !prev || prev.sender !== msg.sender;
                      const isTask = msg.isTaskMessage;
                      return (
                        <div key={msg.id || idx} className="flex gap-2.5 group">
                          {showSender ? (
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 self-end"
                              style={{ backgroundColor: SPACE_COLORS[(msg.sender?.charCodeAt(0) || 0) % SPACE_COLORS.length] }}>
                              {initials(msg.sender)}
                            </div>
                          ) : <div className="w-8 flex-shrink-0" />}
                          <div className="flex-1 max-w-[75%]">
                            {showSender && <p className="text-[11px] font-semibold text-gray-600 mb-0.5">{msg.sender} <span className="text-[10px] font-normal text-gray-400">{fmtTimeAgo(msg.createTime)}</span></p>}
                            <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed rounded-bl-sm inline-block max-w-full ${isTask ? "bg-blue-50 border border-blue-200 text-blue-900" : "bg-gray-100 text-gray-800"
                              }`}>
                              {isTask && <p className="text-[10px] font-semibold text-blue-500 mb-0.5">📋 Task</p>}
                              <p className="whitespace-pre-wrap break-words">{msg.text || "(No text)"}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={msgEndRef} />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══ GMAIL ════════════════════════════════════════════════════════════ */}
        {tab === "gmail" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-600"><span className="font-semibold text-red-500">{gmailCount.unread}</span> unread of {gmailCount.total} total</span>
              <button onClick={loadGmail} className="text-xs text-blue-600 hover:underline">Refresh</button>
            </div>
            {loading.gmail && <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /></div>}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {emails.filter(e => !search || e.subject?.toLowerCase().includes(search.toLowerCase()) || e.from?.toLowerCase().includes(search.toLowerCase())).map(email => (
                <button key={email.id} onClick={async () => { try { const r = await apiFetch(`/api/google/gmail/message/${email.id}`); setOpenEmail(r.data); } catch (e) { alert(e.message); } }}
                  className={`w-full flex items-start gap-4 px-4 py-3.5 border-b border-gray-50 text-left hover:bg-gray-50 transition-colors ${email.isUnread ? "bg-white" : "bg-gray-50/30"}`}>
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${email.isUnread ? "bg-blue-500" : "bg-transparent"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate max-w-xs ${email.isUnread ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>{email.from?.replace(/<.*>/, "").trim() || "Unknown"}</p>
                      <span className="text-[11px] text-gray-400 flex-shrink-0">{email.date ? new Date(email.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}</span>
                    </div>
                    <p className={`text-sm mt-0.5 truncate ${email.isUnread ? "text-gray-800 font-medium" : "text-gray-600"}`}>{email.subject || "(No subject)"}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{email.snippet?.slice(0, 100)}</p>
                  </div>
                  {email.isStarred && <span className="text-amber-400 flex-shrink-0">★</span>}
                </button>
              ))}
            </div>
            {openEmail && (
              <Modal onClose={() => setOpenEmail(null)} wide>
                <h3 className="text-base font-semibold text-gray-800">{openEmail.subject}</h3>
                <div className="flex items-center gap-3 mt-2 mb-4 text-xs text-gray-500">
                  <span>From: <span className="text-gray-700 font-medium">{openEmail.from}</span></span>
                  <span>·</span><span>{openEmail.date}</span>
                </div>
                <div className="border-t border-gray-100 pt-4 max-h-72 overflow-y-auto">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{stripHtml(openEmail.body) || openEmail.snippet}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                  <a href={`https://mail.google.com/mail/u/0/#inbox/${openEmail.id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Open in Gmail →</a>
                </div>
              </Modal>
            )}
          </div>
        )}

        {/* ══ CALENDAR ═════════════════════════════════════════════════════════ */}
        {tab === "calendar" && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex gap-2">
                {[7, 14, 30, 60].map(d => (
                  <button key={d} onClick={() => setCalDays(d)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${calDays === d ? "bg-green-600 text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
                    {d} days
                  </button>
                ))}
              </div>
              <button onClick={() => setShowNewEvent(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-full text-sm font-medium hover:bg-green-700">+ New Event</button>
            </div>
            {todayEvents.length > 0 && (
              <div className="mb-4 bg-green-50 border border-green-100 rounded-2xl p-4">
                <p className="text-xs font-semibold text-green-700 mb-2">Today — {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
                <div className="flex gap-3 flex-wrap">
                  {todayEvents.map(e => (
                    <div key={e.id} className="bg-white rounded-xl border border-green-100 px-3 py-2">
                      <p className="text-xs font-medium text-gray-800">{e.title}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{e.allDay ? "All day" : fmtDT(e.start)}</p>
                      {e.hangoutLink && <a href={e.hangoutLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline">Join Meet →</a>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {loading.calendar && <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" /></div>}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {calEvents.map(e => (
                <div key={e.id} className="flex items-start gap-4 px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50">
                  <div className="text-center w-10 flex-shrink-0">
                    <p className="text-lg font-bold text-gray-800 leading-tight">{new Date(e.start).getDate()}</p>
                    <p className="text-[10px] text-gray-400">{new Date(e.start).toLocaleDateString("en-IN", { month: "short" })}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800">{e.title}</p>
                      {e.hangoutLink && <a href={e.hangoutLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-white bg-green-600 px-2 py-1 rounded-full">Join Meet</a>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{e.allDay ? "All day" : `${fmtDT(e.start)} — ${fmtDT(e.end)}`}</p>
                    {e.location && <p className="text-[11px] text-gray-400 mt-0.5">📍 {e.location}</p>}
                  </div>
                </div>
              ))}
            </div>
            {showNewEvent && (
              <Modal onClose={() => setShowNewEvent(false)}>
                <h3 className="text-base font-semibold text-gray-800 mb-4">Create Calendar Event</h3>
                <div className="space-y-3">
                  <GField label="Title *" value={evForm.title} onChange={v => setEvForm(p => ({ ...p, title: v }))} placeholder="Meeting title..." />
                  <GField label="Description" value={evForm.description} onChange={v => setEvForm(p => ({ ...p, description: v }))} placeholder="Optional..." />
                  <div className="grid grid-cols-2 gap-2">
                    <GField label="Start *" value={evForm.start} onChange={v => setEvForm(p => ({ ...p, start: v }))} type="datetime-local" />
                    <GField label="End *" value={evForm.end} onChange={v => setEvForm(p => ({ ...p, end: v }))} type="datetime-local" />
                  </div>
                  <GField label="Attendees (emails, comma separated)" value={evForm.attendees} onChange={v => setEvForm(p => ({ ...p, attendees: v }))} placeholder="rahul@grav.in, priya@grav.in" />
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setShowNewEvent(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
                  <button onClick={handleCreateEvent} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700">Create Event</button>
                </div>
              </Modal>
            )}
          </div>
        )}

        {/* ══ DRIVE ════════════════════════════════════════════════════════════ */}
        {tab === "drive" && (
          <div>
            <div className="flex justify-between mb-4">
              <p className="text-sm text-gray-600">Recent files from Google Drive</p>
              <button onClick={loadDrive} className="text-xs text-blue-600 hover:underline">Refresh</button>
            </div>
            {loading.drive && <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">Name</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">Type</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">Owner</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">Modified</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">Open</th>
                </tr></thead>
                <tbody>
                  {driveFiles.filter(f => !search || f.name?.toLowerCase().includes(search.toLowerCase())).map(f => (
                    <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3"><div className="flex items-center gap-2.5">
                        <span>{f.type === "Doc" ? "📄" : f.type === "Sheet" ? "📊" : f.type === "Slides" ? "📽" : f.type === "PDF" ? "📕" : f.type === "Folder" ? "📁" : "📎"}</span>
                        <p className="text-sm font-medium text-gray-800 truncate max-w-[200px]">{f.name}</p>
                      </div></td>
                      <td className="px-4 py-3"><span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{f.type}</span></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{f.owner}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(f.modifiedTime)}</td>
                      <td className="px-4 py-3">{f.webViewLink && <a href={f.webViewLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Open →</a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GField({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 mb-1 block">{label}</label>
      <input type={type} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
function Modal({ children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl mx-4 p-6 relative w-full ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl">✕</button>
        {children}
      </div>
    </div>
  );
}
