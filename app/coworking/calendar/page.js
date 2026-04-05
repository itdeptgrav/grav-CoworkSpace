"use client";
/**
 * GRAV-CMS/app/coworking/calendar/page.js
 * Full Google Calendar–style UI — fully responsive (mobile + desktop)
 */
import { useState, useEffect, useRef } from "react";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { useRouter } from "next/navigation";
import { taskForwardApi } from "../../../lib/taskForwardApi";
import { firebaseDb } from "../../../lib/coworkFirebase";
import { collection, getDocs, query, where } from "firebase/firestore";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function todayDate() { return new Date(); }
function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function formatTime(h, m = 0) {
    const ampm = h >= 12 ? "pm" : "am"; const hh = h % 12 || 12;
    return m === 0 ? `${hh} ${ampm}` : `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}
function parseLocalISO(str) {
    if (!str) return null;
    const [y, mo, d] = str.split("T")[0].split("-").map(Number);
    const [h = 0, mi = 0] = (str.split("T")[1] || "00:00").split(":").map(Number);
    return new Date(y, mo - 1, d, h, mi);
}
function toLocalISO(date) {
    const p = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}
const LS_KEY = "cowork_calendar_events";
function loadEvents() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } }
function saveEvents(evts) { localStorage.setItem(LS_KEY, JSON.stringify(evts)); }

// ─────────────────────────────────────────────────────────
export default function CalendarPage() {
    const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
    const router = useRouter();

    const [view, setView] = useState("week");
    const [today] = useState(todayDate);
    const [cursor, setCursor] = useState(todayDate());
    const [events, setEvents] = useState([]);
    const [taskItems, setTaskItems] = useState([]);
    const [meetingItems, setMeetingItems] = useState([]);
    const [noteItems, setNoteItems] = useState([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [miniMonth, setMiniMonth] = useState(() => { const d = todayDate(); return { y: d.getFullYear(), m: d.getMonth() }; });
    const [modal, setModal] = useState(null);
    const [createForm, setCreateForm] = useState({ title: "", start: "", end: "", color: "#1a73e8", description: "", location: "" });

    useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading]);
    useEffect(() => { setEvents(loadEvents()); }, []);

    useEffect(() => {
        if (!user) return;
        taskForwardApi.listTasksHierarchy().then(data => {
            const items = [];
            (data.tasks || []).forEach(task => {
                if (task.dueDate) items.push({ id: `task_${task.taskId}`, title: task.title, date: task.dueDate, type: "task", status: task.status, taskId: task.taskId, color: task.status === "done" ? "#1e8e3e" : task.status === "in_progress" ? "#1a73e8" : "#d93025" });
                (task.subtasks || []).forEach(st => {
                    if (st.dueDate) items.push({ id: `task_${st.taskId}`, title: `↳ ${st.title}`, date: st.dueDate, type: "subtask", status: st.status, taskId: st.taskId, color: st.status === "done" ? "#1e8e3e" : st.status === "in_progress" ? "#f9ab00" : "#d93025" });
                });
            });
            setTaskItems(items);
        }).catch(() => { });
    }, [user]);

    useEffect(() => {
        if (!user) return;
        getDocs(collection(firebaseDb, "cowork_meets")).then(snap => {
            const items = [];
            snap.forEach(d => {
                const m = d.data();
                if (!m.dateTime) return;
                items.push({ id: `meet_${m.meetId || d.id}`, title: m.title || "Meeting", date: new Date(m.dateTime).toISOString().slice(0, 10), time: m.dateTime, type: "meeting", meetId: m.meetId || d.id, color: "#1a73e8", description: m.description || "", participants: m.participants || [] });
            });
            setMeetingItems(items);
        }).catch(() => { });
    }, [user]);

    useEffect(() => {
        if (!employeeId) return;
        getDocs(query(collection(firebaseDb, "cowork_notes"), where("ownerId", "==", employeeId))).then(snap => {
            const items = [];
            snap.forEach(d => {
                const n = d.data(); if (!n.reminder) return;
                items.push({ id: `note_${d.id}`, title: n.title || "Note reminder", date: new Date(n.reminder).toISOString().slice(0, 10), time: n.reminder, type: "note", noteId: d.id, color: "#9334e9", description: n.description || "", keypoints: n.keypoints || [] });
            });
            setNoteItems(items);
        }).catch(() => { });
    }, [user, employeeId]);

    if (loading || !user) return null;

    const addEvent = (evt) => { const updated = [...events, { ...evt, id: Date.now().toString() }]; setEvents(updated); saveEvents(updated); };
    const deleteEvent = (id) => { const updated = events.filter(e => e.id !== id); setEvents(updated); saveEvents(updated); };

    const navigate = (dir) => {
        const d = new Date(cursor);
        if (view === "day") d.setDate(d.getDate() + dir);
        if (view === "week") d.setDate(d.getDate() + dir * 7);
        if (view === "month") d.setMonth(d.getMonth() + dir);
        if (view === "agenda") d.setDate(d.getDate() + dir * 30);
        setCursor(d);
    };

    const getItemsForDate = (date) => {
        const evts = events.filter(e => { const s = parseLocalISO(e.start); return s && isSameDay(s, date); });
        const tasks = taskItems.filter(t => { const d = parseLocalISO(t.date + "T00:00"); return d && isSameDay(d, date); });
        const meetings = meetingItems.filter(m => { const d = parseLocalISO(m.time || m.date + "T00:00"); return d && isSameDay(d, date); });
        const notes = noteItems.filter(n => { const d = parseLocalISO(n.time || n.date + "T00:00"); return d && isSameDay(d, date); });
        return { evts, tasks, meetings, notes };
    };

    const headerLabel = () => {
        if (view === "day") return cursor.toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        if (view === "week") {
            const d = new Date(cursor); d.setDate(d.getDate() - d.getDay());
            const e = new Date(d); e.setDate(d.getDate() + 6);
            if (d.getMonth() === e.getMonth()) return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
            return `${MONTHS[d.getMonth()]} – ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
        }
        return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    };

    const openItem = (item) => {
        const t = item.type || item._t || "event";
        setModal({ mode: t === "task" || t === "subtask" ? "viewTask" : t === "meeting" ? "viewMeeting" : t === "note" ? "viewNote" : "viewEvent", item });
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "'Google Sans','Roboto',sans-serif", background: "#fff", overflow: "hidden" }}>
            <style>{`
                @keyframes cal-popup-in { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
                @keyframes cal-slide-in { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
                .cal-slot:hover  { background:#F8F9FA !important; cursor:pointer; }
                .cal-event:hover { opacity:0.88; cursor:pointer; }
                .mini-day:hover  { background:#F1F3F4; border-radius:50%; cursor:pointer; }
                .cal-nav:hover   { background:#F1F3F4; }
                .cal-view-btn:hover { background:#F1F3F4; }
                .cal-sidebar-overlay { display:none; }

                /* ── Sidebar overlay on mobile ── */
                @media (max-width:768px) {
                    .cal-sidebar { transform:translateX(-100%); transition:transform 0.2s ease; position:fixed !important; left:0; top:0; height:100vh; z-index:200; box-shadow:4px 0 16px rgba(0,0,0,0.15); }
                    .cal-sidebar.open { transform:translateX(0); }
                    .cal-sidebar-overlay { display:block; position:fixed; inset:0; background:rgba(0,0,0,0.3); z-index:199; }
                    .cal-header-title { display:none !important; }
                    .cal-view-switcher { display:none !important; }
                    .cal-header-right-desktop { display:none !important; }
                    .cal-bottom-nav { display:flex !important; }
                    .cal-week-col { min-width:48px !important; }
                    .cal-week-time { width:36px !important; padding-right:4px !important; font-size:9px !important; }
                }
                @media (min-width:769px) {
                    .cal-sidebar { transform:none !important; position:relative !important; }
                    .cal-bottom-nav { display:none !important; }
                    .cal-hamburger-mobile { display:none !important; }
                }

                /* ── Bottom nav (mobile only) ── */
                .cal-bottom-nav {
                    display:none;
                    position:fixed; bottom:0; left:0; right:0;
                    height:56px; background:#fff;
                    border-top:1px solid #E4E7EC;
                    z-index:150;
                    justify-content:space-around;
                    align-items:center;
                    box-shadow:0 -2px 8px rgba(0,0,0,0.06);
                }
                .cal-bnav-btn {
                    display:flex; flex-direction:column; align-items:center; gap:2px;
                    background:none; border:none; cursor:pointer;
                    padding:6px 12px; border-radius:12px;
                    font-size:10px; font-weight:600; color:#6B7280;
                    font-family:inherit;
                    transition:all 0.12s;
                }
                .cal-bnav-btn.active { color:#1a73e8; background:#EBF3FE; }
                .cal-bnav-icon { font-size:18px; }

                /* ── Mobile adjustments ── */
                @media (max-width:480px) {
                    .cal-header { padding:0 8px !important; height:50px !important; }
                    .cal-today-btn { padding:6px 10px !important; font-size:12px !important; }
                    .cal-header-title-short { font-size:14px !important; }
                    .cal-month-cell { min-height:56px !important; padding:3px !important; }
                    .cal-month-day-num { width:20px !important; height:20px !important; font-size:11px !important; }
                    .cal-agenda-date-col { width:52px !important; padding:12px 4px 12px 8px !important; }
                    .cal-agenda-date-num { font-size:22px !important; }
                }

                /* ── Week view mobile ── */
                @media (max-width:768px) {
                    .cal-week-header-day { font-size:10px !important; }
                }

                /* ── Modal ── */
                .cal-modal-overlay {
                    position:fixed; inset:0; background:rgba(0,0,0,0.35);
                    display:flex; align-items:center; justify-content:center;
                    z-index:500; padding:16px;
                }
                .cal-modal {
                    background:#fff; border-radius:12px;
                    width:min(520px,100%); max-height:90vh; overflow-y:auto;
                    box-shadow:0 24px 48px rgba(0,0,0,0.18);
                    animation:cal-popup-in 0.18s ease;
                    font-family:'Google Sans','Roboto',sans-serif;
                }
            `}</style>

            {/* ── Sidebar overlay (mobile) ── */}
            {sidebarOpen && <div className="cal-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

            {/* ── TOP HEADER ── */}
            <header className="cal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px", height: 56, borderBottom: "1px solid #E0E0E0", background: "#fff", flexShrink: 0, zIndex: 100 }}>
                {/* Left */}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button className="cal-nav" style={BTN} onClick={() => setSidebarOpen(v => !v)}>
                        ☰
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 8 }}>
                        <span style={{ fontSize: 20 }}>📅</span>
                        <span style={{ fontSize: 18, fontWeight: 500, color: "#202124" }}>Calendar</span>
                    </div>
                    <button className="cal-today-btn cal-nav" style={{ ...BTN, padding: "6px 14px", borderRadius: 4, border: "1px solid #DADCE0", fontSize: 13, fontWeight: 500, color: "#3C4043" }} onClick={() => setCursor(todayDate())}>
                        Today
                    </button>
                    <button className="cal-nav" style={BTN} onClick={() => navigate(-1)}>‹</button>
                    <button className="cal-nav" style={BTN} onClick={() => navigate(1)}>›</button>
                    <span className="cal-header-title-short" style={{ fontSize: 16, fontWeight: 400, color: "#202124", marginLeft: 4, display: "block" }}>
                        {view === "day" ? cursor.toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : headerLabel()}
                    </span>
                </div>

                {/* Right — view switcher (desktop only) */}
                <div className="cal-view-switcher" style={{ display: "flex", border: "1px solid #DADCE0", borderRadius: 4, overflow: "hidden" }}>
                    {["day", "week", "month", "agenda"].map(v => (
                        <button key={v} className="cal-view-btn" onClick={() => setView(v)}
                            style={{ padding: "6px 14px", border: "none", background: view === v ? "#E8F0FE" : "#fff", color: view === v ? "#1a73e8" : "#3C4043", fontSize: 13, fontWeight: view === v ? 600 : 400, cursor: "pointer", borderRight: "1px solid #DADCE0" }}>
                            {v.charAt(0).toUpperCase() + v.slice(1)}
                        </button>
                    ))}
                </div>
            </header>

            {/* ── BODY ── */}
            <div style={{ display: "flex", flex: 1, overflow: "hidden", paddingBottom: "env(safe-area-inset-bottom)" }}>

                {/* ── SIDEBAR ── */}
                <aside className={`cal-sidebar${sidebarOpen ? " open" : ""}`}
                    style={{ width: 240, flexShrink: 0, borderRight: "1px solid #E0E0E0", display: "flex", flexDirection: "column", overflowY: "auto", background: "#fff", paddingBottom: 16 }}>

                    <MiniCalendar year={miniMonth.y} month={miniMonth.m} selected={cursor} today={today}
                        onSelect={d => { setCursor(d); setSidebarOpen(false); }}
                        onPrev={() => setMiniMonth(m => m.m - 1 < 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 })}
                        onNext={() => setMiniMonth(m => m.m + 1 > 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 })}
                        taskDates={[...taskItems.map(t => t.date), ...meetingItems.map(m => m.date), ...noteItems.map(n => n.date)]}
                    />

                    <div style={{ padding: "8px 12px 4px", marginTop: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#444746", textTransform: "uppercase", letterSpacing: "0.8px" }}>My Calendars</span>
                    </div>
                    {[{ label: employeeName || "Personal", color: "#1a73e8" }, { label: "Tasks", color: "#4285F4" }].map(c => (
                        <div key={c.label} style={{ display: "flex", alignItems: "center", padding: "4px 12px", cursor: "pointer" }}>
                            <input type="checkbox" defaultChecked style={{ accentColor: c.color, marginRight: 12, width: 16, height: 16 }} />
                            <span style={{ fontSize: 13, color: "#202124" }}>{c.label}</span>
                        </div>
                    ))}

                    {/* Upcoming */}
                    {(taskItems.length > 0 || meetingItems.length > 0 || noteItems.length > 0) && (
                        <div style={{ marginTop: 12, padding: "0 12px" }}>
                            <p style={{ fontSize: 10, fontWeight: 600, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Upcoming</p>
                            {[...taskItems.map(t => ({ ...t, _src: "task" })), ...meetingItems.map(m => ({ ...m, _src: "meeting" })), ...noteItems.map(n => ({ ...n, _src: "note" }))]
                                .filter(t => (t.time || t.date) >= new Date().toISOString().slice(0, 10))
                                .sort((a, b) => (a.time || a.date).localeCompare(b.time || b.date))
                                .slice(0, 5)
                                .map(t => (
                                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" }} onClick={() => openItem(t)}>
                                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                                        <div style={{ overflow: "hidden", flex: 1 }}>
                                            <p style={{ fontSize: 11, color: "#202124", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{t.title}</p>
                                            <p style={{ fontSize: 10, color: "#80868b", margin: 0 }}>
                                                {t._src === "meeting" ? "📹 " : t._src === "note" ? "📝 " : "⏰ "}{t.date}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </aside>

                {/* ── MAIN CALENDAR AREA ── */}
                <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    {view === "week" && <WeekView cursor={cursor} today={today} getItemsForDate={getItemsForDate} onSlotClick={dt => setModal({ mode: "create", start: toLocalISO(dt), end: toLocalISO(new Date(dt.getTime() + 3600000)) })} onItemClick={openItem} />}
                    {view === "day" && <DayView cursor={cursor} today={today} getItemsForDate={getItemsForDate} onSlotClick={dt => setModal({ mode: "create", start: toLocalISO(dt), end: toLocalISO(new Date(dt.getTime() + 3600000)) })} onItemClick={openItem} />}
                    {view === "month" && <MonthView cursor={cursor} today={today} getItemsForDate={getItemsForDate} onDayClick={d => { setCursor(d); setView("day"); }} onItemClick={openItem} />}
                    {view === "agenda" && <AgendaView cursor={cursor} events={events} taskItems={taskItems} meetingItems={meetingItems} noteItems={noteItems} onItemClick={openItem} />}
                </main>
            </div>

            {/* ── BOTTOM NAV (mobile only) ── */}
            <nav className="cal-bottom-nav">
                {[
                    { v: "day", icon: "📆", label: "Day" },
                    { v: "week", icon: "📅", label: "Week" },
                    { v: "month", icon: "🗓️", label: "Month" },
                    { v: "agenda", icon: "📋", label: "Agenda" },
                ].map(({ v, icon, label }) => (
                    <button key={v} className={`cal-bnav-btn${view === v ? " active" : ""}`} onClick={() => setView(v)}>
                        <span className="cal-bnav-icon">{icon}</span>
                        {label}
                    </button>
                ))}
            </nav>

            {/* ── MODALS ── */}
            {modal?.mode === "create" && (
                <div className="cal-modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
                    <div className="cal-modal" onClick={e => e.stopPropagation()}>
                        <div style={{ padding: "20px 20px 0", borderBottom: "1px solid #F1F3F4" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                <h2 style={{ fontSize: 18, fontWeight: 600, color: "#202124", margin: 0 }}>New Event</h2>
                                <button style={CLOSEBTN} onClick={() => setModal(null)}>✕</button>
                            </div>
                        </div>
                        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                            <input placeholder="Event title" value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                                style={{ fontSize: 16, fontWeight: 400, color: "#202124", border: "none", borderBottom: "2px solid #1a73e8", outline: "none", padding: "4px 0", fontFamily: "inherit", width: "100%", background: "transparent" }} />
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                <div style={{ flex: 1, minWidth: 140 }}>
                                    <label style={LABEL}>Start</label>
                                    <input type="datetime-local" value={createForm.start} onChange={e => setCreateForm(f => ({ ...f, start: e.target.value }))} style={DT_INPUT} />
                                </div>
                                <div style={{ flex: 1, minWidth: 140 }}>
                                    <label style={LABEL}>End</label>
                                    <input type="datetime-local" value={createForm.end} onChange={e => setCreateForm(f => ({ ...f, end: e.target.value }))} style={DT_INPUT} />
                                </div>
                            </div>
                            <div>
                                <label style={LABEL}>Description</label>
                                <input placeholder="Add description" value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} style={{ ...DT_INPUT, width: "100%" }} />
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <label style={LABEL}>Color</label>
                                <div style={{ display: "flex", gap: 6 }}>
                                    {["#1a73e8", "#d93025", "#1e8e3e", "#f9ab00", "#9334e9"].map(c => (
                                        <div key={c} onClick={() => setCreateForm(f => ({ ...f, color: c }))}
                                            style={{ width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer", outline: createForm.color === c ? `3px solid ${c}` : "none", outlineOffset: 2 }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: "12px 20px 20px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
                            <button onClick={() => setModal(null)} style={{ padding: "9px 20px", border: "none", background: "transparent", color: "#1a73e8", fontSize: 14, fontWeight: 500, cursor: "pointer", borderRadius: 4 }}>Cancel</button>
                            <button onClick={() => { if (!createForm.title.trim()) return; addEvent({ title: createForm.title, start: createForm.start, end: createForm.end, color: createForm.color, description: createForm.description, location: createForm.location }); setCreateForm({ title: "", start: "", end: "", color: "#1a73e8", description: "", location: "" }); setModal(null); }}
                                style={{ padding: "9px 24px", border: "none", background: "#1a73e8", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", borderRadius: 20 }}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {modal?.mode === "viewEvent" && (
                <ViewEventModal event={modal.item} onClose={() => setModal(null)} onDelete={id => { deleteEvent(id); setModal(null); }} />
            )}
            {modal?.mode === "viewTask" && (
                <ViewTaskModal task={modal.item} onClose={() => setModal(null)} onNavigate={id => { router.push(`/coworking/tasks?taskId=${id}`); setModal(null); }} />
            )}
            {modal?.mode === "viewMeeting" && (
                <ViewMeetingModal item={modal.item} onClose={() => setModal(null)} onNavigate={id => { router.push(`/coworking/cowork-meeting/${id}`); setModal(null); }} />
            )}
            {modal?.mode === "viewNote" && (
                <ViewNoteModal item={modal.item} onClose={() => setModal(null)} />
            )}
        </div>
    );
}

// ── Shared button style ───────────────────────────────────
const BTN = { background: "none", border: "none", cursor: "pointer", padding: "6px 10px", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#5f6368", fontSize: 16, fontFamily: "inherit" };
const CLOSEBTN = { background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: "50%", color: "#5f6368", fontSize: 16 };
const LABEL = { fontSize: 11, fontWeight: 600, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 };
const DT_INPUT = { border: "none", background: "#F1F3F4", borderRadius: 6, padding: "7px 10px", fontSize: 13, color: "#202124", outline: "none", fontFamily: "inherit", width: "100%" };

// ── MiniCalendar ─────────────────────────────────────────
function MiniCalendar({ year, month, selected, today, onSelect, onPrev, onNext, taskDates = [] }) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    const taskSet = new Set(taskDates.map(d => d?.slice(0, 7) === `${year}-${String(month + 1).padStart(2, "0")}` ? d?.slice(8, 10) : null).filter(Boolean));

    return (
        <div style={{ padding: "12px 12px 8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <button style={BTN} onClick={onPrev}>‹</button>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#202124" }}>{MONTHS[month]} {year}</span>
                <button style={BTN} onClick={onNext}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1 }}>
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <div key={i} style={{ textAlign: "center", fontSize: 10, color: "#70757a", padding: "2px 0", fontWeight: 600 }}>{d}</div>
                ))}
                {cells.map((d, i) => {
                    if (!d) return <div key={i} />;
                    const thisDate = new Date(year, month, d);
                    const isToday = isSameDay(thisDate, today);
                    const isSelected = isSameDay(thisDate, selected);
                    const hasTask = taskSet.has(String(d).padStart(2, "0"));
                    return (
                        <div key={i} className="mini-day" onClick={() => onSelect(thisDate)}
                            style={{ textAlign: "center", fontSize: 11, padding: "3px 0", borderRadius: "50%", background: isSelected ? "#1a73e8" : isToday ? "#D2E3FC" : "transparent", color: isSelected ? "#fff" : isToday ? "#1a73e8" : "#202124", fontWeight: isToday || isSelected ? 700 : 400, position: "relative" }}>
                            {d}
                            {hasTask && !isSelected && <div style={{ position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)", width: 3, height: 3, borderRadius: "50%", background: "#1a73e8" }} />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── TimeGrid ─────────────────────────────────────────────
function TimeGrid({ columns, onSlotClick, onItemClick }) {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const scrollRef = useRef(null);
    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 7 * 48; }, []);

    return (
        <div style={{ flex: 1, overflow: "auto" }} ref={scrollRef}>
            <div style={{ display: "grid", gridTemplateColumns: `44px repeat(${columns.length},1fr)`, minWidth: columns.length * 60 + 44 }}>
                {hours.map(h => (
                    <div key={h} style={{ display: "contents" }}>
                        <div className="cal-week-time" style={{ height: 48, borderRight: "1px solid #E0E0E0", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 6, paddingTop: 3 }}>
                            <span style={{ fontSize: 10, color: "#70757a", whiteSpace: "nowrap" }}>{h === 0 ? "" : formatTime(h)}</span>
                        </div>
                        {columns.map((col, ci) => (
                            <div key={ci} className="cal-slot cal-week-col"
                                style={{ height: 48, borderRight: "1px solid #F1F3F4", borderBottom: "1px solid #F1F3F4", position: "relative", background: "#fff" }}
                                onClick={() => { const d = new Date(col.date); d.setHours(h, 0, 0, 0); onSlotClick(d); }}>
                                {col.evts.filter(e => { const s = parseLocalISO(e.start); return s && s.getHours() === h; }).map(e => (
                                    <div key={e.id} className="cal-event"
                                        onClick={ev => { ev.stopPropagation(); onItemClick(e); }}
                                        style={{ position: "absolute", left: 2, right: 2, top: 2, background: e.color || "#1a73e8", color: "#fff", borderRadius: 3, padding: "2px 4px", fontSize: 10, fontWeight: 500, zIndex: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", minHeight: 18 }}>
                                        {e.title}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── WeekView ─────────────────────────────────────────────
function WeekView({ cursor, today, getItemsForDate, onSlotClick, onItemClick }) {
    const days = (() => { const d = new Date(cursor); d.setDate(d.getDate() - d.getDay()); return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; }); })();
    const cols = days.map(d => { const { evts, tasks, meetings, notes } = getItemsForDate(d); return { date: d, evts, chips: [...tasks.map(t => ({ ...t, _t: "task" })), ...meetings.map(m => ({ ...m, _t: "meeting", color: "#1e8e3e" })), ...notes.map(n => ({ ...n, _t: "note", color: "#9334e9" }))] }; });

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "grid", gridTemplateColumns: `44px repeat(7,1fr)`, borderBottom: "1px solid #E0E0E0", background: "#fff", flexShrink: 0 }}>
                <div style={{ height: 64 }} />
                {days.map((d, i) => {
                    const isToday = isSameDay(d, today);
                    const chips = cols[i].chips;
                    return (
                        <div key={i} style={{ textAlign: "center", padding: "4px 2px", borderLeft: "1px solid #F1F3F4" }}>
                            <div className="cal-week-header-day" style={{ fontSize: 11, color: isToday ? "#1a73e8" : "#70757a", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.4px" }}>{DAYS[d.getDay()]}</div>
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: isToday ? "#1a73e8" : "transparent", color: isToday ? "#fff" : "#202124", display: "flex", alignItems: "center", justifyContent: "center", margin: "2px auto", fontSize: 14, fontWeight: isToday ? 700 : 400, cursor: "pointer" }}>
                                {d.getDate()}
                            </div>
                            <div style={{ minHeight: 18 }}>
                                {chips.slice(0, 1).map(t => (
                                    <div key={t.id} style={{ background: t.color, color: "#fff", borderRadius: 2, fontSize: 9, padding: "1px 3px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", cursor: "pointer", margin: "1px 0" }} onClick={e => { e.stopPropagation(); onItemClick(t); }}>
                                        {t._t === "meeting" ? "📹" : "⏰"} {t.title}
                                    </div>
                                ))}
                                {chips.length > 1 && <div style={{ fontSize: 9, color: "#5f6368" }}>+{chips.length - 1}</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
            <TimeGrid columns={cols} onSlotClick={onSlotClick} onItemClick={onItemClick} />
        </div>
    );
}

// ── DayView ──────────────────────────────────────────────
function DayView({ cursor, today, getItemsForDate, onSlotClick, onItemClick }) {
    const { evts, tasks, meetings, notes } = getItemsForDate(cursor);
    const isToday = isSameDay(cursor, today);
    const chips = [...tasks.map(t => ({ ...t, _t: "task" })), ...meetings.map(m => ({ ...m, _t: "meeting", color: "#1e8e3e" })), ...notes.map(n => ({ ...n, _t: "note", color: "#9334e9" }))];

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", borderBottom: "1px solid #E0E0E0", background: "#fff", flexShrink: 0 }}>
                <div style={{ height: 64 }} />
                <div style={{ textAlign: "center", padding: "4px 0", borderLeft: "1px solid #F1F3F4" }}>
                    <div style={{ fontSize: 11, color: isToday ? "#1a73e8" : "#70757a", fontWeight: 500, textTransform: "uppercase" }}>{DAYS[cursor.getDay()]}</div>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: isToday ? "#1a73e8" : "transparent", color: isToday ? "#fff" : "#202124", display: "flex", alignItems: "center", justifyContent: "center", margin: "2px auto", fontSize: 20, fontWeight: isToday ? 700 : 400 }}>
                        {cursor.getDate()}
                    </div>
                    <div style={{ padding: "0 4px" }}>
                        {chips.slice(0, 2).map(t => (
                            <div key={t.id} style={{ background: t.color, color: "#fff", borderRadius: 2, fontSize: 10, padding: "1px 4px", margin: "1px 0", cursor: "pointer" }} onClick={e => { e.stopPropagation(); onItemClick(t); }}>
                                {t._t === "meeting" ? "📹" : "⏰"} {t.title}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <TimeGrid columns={[{ date: cursor, evts, chips: [] }]} onSlotClick={onSlotClick} onItemClick={onItemClick} />
        </div>
    );
}

// ── MonthView ────────────────────────────────────────────
function MonthView({ cursor, today, getItemsForDate, onDayClick, onItemClick }) {
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const firstDay = new Date(year, month, 1).getDay(), daysInMonth = new Date(year, month + 1, 0).getDate(), prevDays = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push({ date: new Date(year, month - 1, prevDays - firstDay + i + 1), current: false });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d), current: true });
    while (cells.length % 7 !== 0) cells.push({ date: new Date(year, month + 1, cells.length - daysInMonth - firstDay + 1), current: false });

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid #E0E0E0", background: "#fff", flexShrink: 0 }}>
                {DAYS.map(d => (
                    <div key={d} style={{ textAlign: "center", padding: "8px 0", fontSize: 11, color: "#70757a", fontWeight: 500, textTransform: "uppercase" }}>{d}</div>
                ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", flex: 1 }}>
                {cells.map((cell, i) => {
                    const isToday = isSameDay(cell.date, today);
                    const { evts, tasks, meetings, notes } = getItemsForDate(cell.date);
                    const all = [...evts.map(e => ({ ...e, _t: "event" })), ...tasks.map(t => ({ ...t, _t: "task" })), ...meetings.map(m => ({ ...m, _t: "meeting", color: "#1e8e3e" })), ...notes.map(n => ({ ...n, _t: "note", color: "#9334e9" }))].slice(0, 3);
                    const total = evts.length + tasks.length + meetings.length + notes.length;
                    return (
                        <div key={i} className="cal-month-cell" style={{ border: "1px solid #F1F3F4", padding: "4px", minHeight: 72, cursor: "pointer", background: "#fff" }} onClick={() => onDayClick(cell.date)}>
                            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 2 }}>
                                <div className="cal-month-day-num" style={{ width: 22, height: 22, borderRadius: "50%", background: isToday ? "#1a73e8" : "transparent", color: isToday ? "#fff" : cell.current ? "#202124" : "#C0C0C0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: isToday ? 700 : 400 }}>
                                    {cell.date.getDate()}
                                </div>
                            </div>
                            {all.map(item => (
                                <div key={item.id} style={{ background: item.color || "#1a73e8", color: "#fff", borderRadius: 2, fontSize: 9, padding: "1px 3px", marginBottom: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", cursor: "pointer" }} onClick={e => { e.stopPropagation(); onItemClick(item); }}>
                                    {item._t === "task" ? "⏰ " : item._t === "meeting" ? "📹 " : item._t === "note" ? "📝 " : ""}{item.title}
                                </div>
                            ))}
                            {total > 3 && <div style={{ fontSize: 9, color: "#5f6368" }}>+{total - 3} more</div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── AgendaView ───────────────────────────────────────────
function AgendaView({ cursor, events, taskItems, meetingItems = [], noteItems = [], onItemClick }) {
    const days = Array.from({ length: 60 }, (_, i) => { const d = new Date(cursor); d.setDate(d.getDate() + i); return d; });
    const typeConf = {
        event: { icon: "🗓️", label: "Event", bg: "#E8F0FE", txt: "#1a73e8" },
        task: { icon: "✅", label: "Task", bg: "#FCE8E6", txt: "#d93025" },
        subtask: { icon: "↳", label: "Subtask", bg: "#FEF7E0", txt: "#f9ab00" },
        meeting: { icon: "📹", label: "Meeting", bg: "#E6F4EA", txt: "#1e8e3e" },
        note: { icon: "📝", label: "Reminder", bg: "#F3E8FD", txt: "#9334e9" },
    };
    const allByDay = days.map(d => {
        const items = [
            ...events.map(e => ({ ...e, _t: "event", _st: e.start || (e.date + "T00:00") })),
            ...taskItems.map(t => ({ ...t, _t: t.type || "task", _st: t.time || (t.date + "T00:00") })),
            ...meetingItems.map(m => ({ ...m, _t: "meeting", _st: m.time || (m.date + "T09:00") })),
            ...noteItems.map(n => ({ ...n, _t: "note", _st: n.time || (n.date + "T00:00") })),
        ].filter(item => { const dt = parseLocalISO(item._st); return dt && isSameDay(dt, d); })
            .sort((a, b) => a._st.localeCompare(b._st));
        return { date: d, items };
    }).filter(day => day.items.length > 0);

    if (!allByDay.length) return (
        <div style={{ padding: 48, textAlign: "center", color: "#80868b" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>No upcoming events</div>
            <div style={{ fontSize: 13 }}>No tasks, meetings or reminders in the next 60 days</div>
        </div>
    );

    return (
        <div style={{ overflow: "auto", height: "100%" }}>
            {allByDay.map(({ date, items }) => {
                const isToday = isSameDay(date, new Date());
                return (
                    <div key={date.toDateString()} style={{ display: "grid", gridTemplateColumns: "64px 1fr", borderBottom: "2px solid #F1F3F4" }}>
                        <div className="cal-agenda-date-col" style={{ padding: "14px 6px 14px 12px", textAlign: "right", borderRight: "2px solid #E0E0E0", background: isToday ? "#EBF3FE" : "#fff" }}>
                            <div style={{ fontSize: 10, color: isToday ? "#1a73e8" : "#70757a", fontWeight: 700, textTransform: "uppercase" }}>{DAYS[date.getDay()]}</div>
                            <div className="cal-agenda-date-num" style={{ fontSize: 24, color: isToday ? "#1a73e8" : "#202124", fontWeight: isToday ? 700 : 400, lineHeight: 1.2 }}>{date.getDate()}</div>
                            <div style={{ fontSize: 10, color: isToday ? "#1a73e8" : "#70757a" }}>{MONTHS[date.getMonth()].slice(0, 3)}</div>
                        </div>
                        <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                            {items.map(item => {
                                const cfg = typeConf[item._t] || typeConf.event;
                                const dt = parseLocalISO(item._st);
                                const timeStr = dt ? dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "All day";
                                return (
                                    <div key={item.id} onClick={() => onItemClick(item)}
                                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: "#fff", cursor: "pointer", border: "1px solid #E8EAED", borderLeft: `4px solid ${item.color || "#1a73e8"}` }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: cfg.bg, color: cfg.txt, flexShrink: 0 }}>{cfg.icon} {cfg.label}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#202124", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</p>
                                            {item.description && <p style={{ margin: "1px 0 0", fontSize: 11, color: "#80868b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</p>}
                                        </div>
                                        <span style={{ fontSize: 11, color: "#70757a", flexShrink: 0 }}>{timeStr}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ── Modals ───────────────────────────────────────────────
function ViewEventModal({ event, onClose, onDelete }) {
    return (
        <div className="cal-modal-overlay" onClick={onClose}>
            <div className="cal-modal" onClick={e => e.stopPropagation()}>
                <div style={{ height: 6, background: event.color || "#1a73e8" }} />
                <div style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 400, color: "#202124", margin: 0 }}>{event.title}</h2>
                        <div style={{ display: "flex", gap: 6 }}>
                            <button style={{ ...CLOSEBTN, background: "#FCE8E6", color: "#D93025" }} onClick={() => onDelete(event.id)}>🗑</button>
                            <button style={CLOSEBTN} onClick={onClose}>✕</button>
                        </div>
                    </div>
                    {event.start && <div style={{ display: "flex", gap: 10, fontSize: 13, color: "#202124", marginBottom: 8 }}><span>🕐</span><span>{parseLocalISO(event.start)?.toLocaleString("en-IN", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>}
                    {event.description && <div style={{ display: "flex", gap: 10, fontSize: 13, color: "#5f6368" }}><span>📝</span><span>{event.description}</span></div>}
                </div>
            </div>
        </div>
    );
}

function ViewTaskModal({ task, onClose, onNavigate }) {
    const dl = task.date ? new Date(task.date) : null;
    const isPast = dl && dl < new Date();
    return (
        <div className="cal-modal-overlay" onClick={onClose}>
            <div className="cal-modal" onClick={e => e.stopPropagation()}>
                <div style={{ height: 6, background: task.color || "#D93025" }} />
                <div style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                        <span style={{ fontSize: 11, background: "#E8F0FE", color: "#1a73e8", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>{task.type === "subtask" ? "Subtask" : "Task"}</span>
                        <button style={CLOSEBTN} onClick={onClose}>✕</button>
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 400, color: "#202124", margin: "0 0 16px" }}>{task.title}</h2>
                    {dl && <div style={{ display: "flex", gap: 10, fontSize: 13, alignItems: "center", marginBottom: 10 }}>
                        <span>⏰</span>
                        <span style={{ color: isPast ? "#D93025" : "#1e8e3e", fontWeight: 500 }}>
                            {dl.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                        </span>
                        {isPast && <span style={{ fontSize: 11, background: "#FCE8E6", color: "#D93025", padding: "1px 6px", borderRadius: 10 }}>Overdue</span>}
                    </div>}
                    {task.taskId && <button onClick={() => onNavigate(task.taskId)} style={{ marginTop: 12, width: "100%", padding: 10, background: "#1a73e8", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Open Task →</button>}
                </div>
            </div>
        </div>
    );
}

function ViewMeetingModal({ item, onClose, onNavigate }) {
    const dt = item.time ? new Date(item.time) : null;
    return (
        <div className="cal-modal-overlay" onClick={onClose}>
            <div className="cal-modal" onClick={e => e.stopPropagation()}>
                <div style={{ height: 6, background: "#1e8e3e" }} />
                <div style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                        <span style={{ fontSize: 11, background: "#E6F4EA", color: "#1e8e3e", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>📹 Meeting</span>
                        <button style={CLOSEBTN} onClick={onClose}>✕</button>
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 400, color: "#202124", margin: "0 0 16px" }}>{item.title}</h2>
                    {dt && <div style={{ display: "flex", gap: 10, fontSize: 13, color: "#202124", marginBottom: 10 }}><span>📅</span><span>{dt.toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>}
                    {item.description && <div style={{ display: "flex", gap: 10, fontSize: 13, color: "#5f6368", marginBottom: 10 }}><span>📝</span><span>{item.description}</span></div>}
                    {item.participants?.length > 0 && <div style={{ display: "flex", gap: 10, fontSize: 13, color: "#202124", marginBottom: 10 }}><span>👥</span><span>{item.participants.length} participant{item.participants.length !== 1 ? "s" : ""}</span></div>}
                    {item.meetId && <button onClick={() => onNavigate(item.meetId)} style={{ marginTop: 12, width: "100%", padding: 10, background: "#1e8e3e", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Join Meeting →</button>}
                </div>
            </div>
        </div>
    );
}

function ViewNoteModal({ item, onClose }) {
    const dt = item.time ? new Date(item.time) : null;
    const isOverdue = dt && dt < new Date();
    return (
        <div className="cal-modal-overlay" onClick={onClose}>
            <div className="cal-modal" onClick={e => e.stopPropagation()}>
                <div style={{ height: 6, background: "#9334e9" }} />
                <div style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                        <span style={{ fontSize: 11, background: "#F3E8FD", color: "#9334e9", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>📝 Note Reminder{isOverdue && " · Overdue"}</span>
                        <button style={CLOSEBTN} onClick={onClose}>✕</button>
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 400, color: "#202124", margin: "0 0 16px" }}>{item.title}</h2>
                    {dt && <div style={{ display: "flex", gap: 10, fontSize: 13, color: isOverdue ? "#D93025" : "#202124", marginBottom: 10 }}><span>⏰</span><span>{dt.toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>}
                    {item.description && <div style={{ display: "flex", gap: 10, fontSize: 13, color: "#5f6368", marginBottom: 10, lineHeight: 1.5 }}><span>📝</span><span>{item.description}</span></div>}
                    {item.keypoints?.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>{item.keypoints.map((kp, i) => <div key={i} style={{ fontSize: 13, color: "#202124" }}>{i + 1}. {kp}</div>)}</div>}
                </div>
            </div>
        </div>
    );
}