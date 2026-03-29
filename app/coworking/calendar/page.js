"use client";
/**
 * GRAV-CMS/app/coworking/calendar/page.js
 *
 * Full Google Calendar–style UI for the CoWork module.
 * - Week / Day / Month / Agenda views
 * - Create Event / Task / Appointment modals
 * - Task & subtask deadlines fetched from your existing task system
 * - All calendar events stored in localStorage (no backend needed)
 * - Reads tasks from taskForwardApi to show deadlines on calendar
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { useRouter } from "next/navigation";
import { taskForwardApi } from "../../../lib/taskForwardApi";

// ─── Constants ────────────────────────────────────────────
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const COLORS = ["#1a73e8", "#d93025", "#1e8e3e", "#f9ab00", "#9334e9", "#00796b", "#e91e63", "#ff6d00"];

function todayDate() { return new Date(); }
function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function formatTime(h, m = 0) {
    const ampm = h >= 12 ? "pm" : "am";
    const hh = h % 12 || 12;
    return m === 0 ? `${hh} ${ampm}` : `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}
function parseLocalISO(str) {
    if (!str) return null;
    const [y, mo, d] = str.split("T")[0].split("-").map(Number);
    const [h = 0, mi = 0] = (str.split("T")[1] || "00:00").split(":").map(Number);
    return new Date(y, mo - 1, d, h, mi);
}
function toLocalISO(date) {
    const pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ─── LocalStorage helpers ─────────────────────────────────
const LS_KEY = "cowork_calendar_events";
function loadEvents() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function saveEvents(evts) {
    localStorage.setItem(LS_KEY, JSON.stringify(evts));
}

// ─── Main Page ────────────────────────────────────────────
export default function CalendarPage() {
    const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
    const router = useRouter();

    const [view, setView] = useState("week");   // week|day|month|agenda
    const [today] = useState(todayDate);
    const [cursor, setCursor] = useState(todayDate()); // currently navigated date
    const [events, setEvents] = useState([]);
    const [taskItems, setTaskItems] = useState([]);        // tasks as calendar items
    const [modal, setModal] = useState(null);      // { mode:"create"|"view", ... }
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [miniMonth, setMiniMonth] = useState(() => { const d = todayDate(); return { y: d.getFullYear(), m: d.getMonth() }; });
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQ, setSearchQ] = useState("");

    useEffect(() => {
        if (!loading && !user) router.push("/coworking-login");
    }, [user, loading]);

    // Load events from localStorage
    useEffect(() => {
        setEvents(loadEvents());
    }, []);

    // Load tasks from backend as read-only deadline markers
    useEffect(() => {
        if (!user) return;
        taskForwardApi.listTasksHierarchy().then(data => {
            const items = [];
            (data.tasks || []).forEach(task => {
                if (task.dueDate) {
                    items.push({
                        id: `task_${task.taskId}`,
                        title: task.title,
                        date: task.dueDate,         // "YYYY-MM-DD"
                        type: "task",
                        status: task.status,
                        taskId: task.taskId,
                        isParent: task.isParent,
                        color: task.status === "done" ? "#1e8e3e" :
                            task.status === "in_progress" ? "#1a73e8" : "#d93025",
                    });
                }
                // subtask deadlines
                (task.subtasks || []).forEach(st => {
                    if (st.dueDate) {
                        items.push({
                            id: `task_${st.taskId}`,
                            title: `↳ ${st.title}`,
                            date: st.dueDate,
                            type: "subtask",
                            status: st.status,
                            taskId: st.taskId,
                            color: st.status === "done" ? "#1e8e3e" :
                                st.status === "in_progress" ? "#f9ab00" : "#d93025",
                        });
                    }
                });
            });
            setTaskItems(items);
        }).catch(() => { });
    }, [user]);

    if (loading || !user) return null;

    // ── Event CRUD ──────────────────────────────────────────
    const addEvent = (evt) => {
        const updated = [...events, { ...evt, id: Date.now().toString() }];
        setEvents(updated); saveEvents(updated);
    };
    const deleteEvent = (id) => {
        const updated = events.filter(e => e.id !== id);
        setEvents(updated); saveEvents(updated);
    };

    // ── Navigation ──────────────────────────────────────────
    const navigate = (dir) => {
        const d = new Date(cursor);
        if (view === "day") d.setDate(d.getDate() + dir);
        if (view === "week") d.setDate(d.getDate() + dir * 7);
        if (view === "month") d.setMonth(d.getMonth() + dir);
        if (view === "agenda") d.setDate(d.getDate() + dir * 30);
        setCursor(d);
    };

    // ── Week days ───────────────────────────────────────────
    const getWeekDays = (base) => {
        const d = new Date(base);
        d.setDate(d.getDate() - d.getDay()); // Sunday
        return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; });
    };

    // ── Items for a date ────────────────────────────────────
    const getItemsForDate = (date) => {
        const evts = events.filter(e => {
            const s = parseLocalISO(e.start);
            return s && isSameDay(s, date);
        });
        const tasks = taskItems.filter(t => {
            const d = parseLocalISO(t.date + "T00:00");
            return d && isSameDay(d, date);
        });
        return { evts, tasks };
    };

    // ── Header label ────────────────────────────────────────
    const headerLabel = () => {
        if (view === "day") return cursor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        if (view === "week") {
            const days = getWeekDays(cursor);
            const s = days[0], e = days[6];
            if (s.getMonth() === e.getMonth()) return `${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
            return `${MONTHS[s.getMonth()]} – ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
        }
        if (view === "month") return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
        return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    };

    // ── Filtered events for search ───────────────────────────
    const allItems = [
        ...events.map(e => ({ ...e, _type: "event" })),
        ...taskItems.map(t => ({ ...t, _type: "task" })),
    ].filter(e => !searchQ || e.title?.toLowerCase().includes(searchQ.toLowerCase()));

    return (
        <div style={s.root}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Google Sans','Roboto',sans-serif; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #dadce0; border-radius: 3px; }
        .cal-slot:hover { background: #f1f3f4 !important; cursor: pointer; }
        .cal-event:hover { opacity: 0.9; cursor: pointer; }
        .cal-day-btn:hover { background: #f1f3f4; border-radius: 50%; }
        .mini-day:hover { background: #f1f3f4; border-radius: 50%; cursor: pointer; }
        .nav-btn:hover { background: #f1f3f4; }
        .view-btn:hover { background: #f1f3f4; }
        @media (max-width: 768px) {
          .sidebar { display: none !important; }
          .sidebar-open { display: flex !important; position: fixed; z-index: 200; left: 0; top: 0; height: 100vh; width: 256px; background: #fff; box-shadow: 2px 0 8px rgba(0,0,0,0.15); }
        }
        @media (max-width: 600px) {
          .week-header-day { font-size: 11px !important; }
          .time-label { font-size: 9px !important; }
        }
      `}</style>

            {/* ── TOP HEADER ── */}
            <header style={s.header}>
                <div style={s.headerLeft}>
                    <button style={s.iconBtn} onClick={() => setSidebarOpen(v => !v)} className="nav-btn">
                        <HamburgerIcon />
                    </button>
                    <div style={s.logo}>
                        <CalendarIcon />
                        <span style={s.logoText}>Calendar</span>
                    </div>
                    <button style={s.todayBtn} onClick={() => setCursor(todayDate())}>Today</button>
                    <button style={{ ...s.iconBtn, marginLeft: 2 }} className="nav-btn" onClick={() => navigate(-1)}>
                        <ChevronLeft />
                    </button>
                    <button style={s.iconBtn} className="nav-btn" onClick={() => navigate(1)}>
                        <ChevronRight />
                    </button>
                    <span style={s.headerTitle}>{headerLabel()}</span>
                </div>
                <div style={s.headerRight}>
                    {searchOpen ? (
                        <div style={s.searchBox}>
                            <input autoFocus style={s.searchInput} value={searchQ}
                                onChange={e => setSearchQ(e.target.value)}
                                placeholder="Search events and tasks"
                                onBlur={() => { if (!searchQ) setSearchOpen(false); }} />
                            <button style={s.iconBtn} onClick={() => { setSearchOpen(false); setSearchQ(""); }}>✕</button>
                        </div>
                    ) : (
                        <button style={s.iconBtn} className="nav-btn" onClick={() => setSearchOpen(true)} title="Search">
                            <SearchIcon />
                        </button>
                    )}
                    <button style={s.iconBtn} className="nav-btn" title="Settings">⚙️</button>
                    {/* View switcher */}
                    <div style={s.viewSwitcher}>
                        {["day", "week", "month", "agenda"].map(v => (
                            <button key={v} onClick={() => setView(v)}
                                className="view-btn"
                                style={{ ...s.viewBtn, ...(view === v ? s.viewBtnActive : {}) }}>
                                {v.charAt(0).toUpperCase() + v.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <div style={s.body}>
                {/* ── LEFT SIDEBAR ── */}
                <aside style={{ ...s.sidebar, ...(sidebarOpen ? {} : { display: "none" }) }} className={sidebarOpen ? "sidebar-open" : ""}>
                    {/* Create button */}
                    <button style={s.createBtn}
                        onClick={() => setModal({ mode: "create", start: toLocalISO(new Date()), end: toLocalISO(new Date(new Date().getTime() + 3600000)) })}>
                        <span style={{ fontSize: 22, marginRight: 10, color: "#5f6368" }}>+</span>
                        Create
                    </button>

                    {/* Mini calendar */}
                    <MiniCalendar
                        year={miniMonth.y} month={miniMonth.m}
                        selected={cursor} today={today}
                        onSelect={d => { setCursor(d); if (view === "month" || view === "week") setCursor(d); }}
                        onPrev={() => setMiniMonth(m => { const nm = m.m - 1 < 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 }; return nm; })}
                        onNext={() => setMiniMonth(m => { const nm = m.m + 1 > 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 }; return nm; })}
                        taskDates={taskItems.map(t => t.date)}
                    />

                    {/* My calendars */}
                    <div style={s.sectionHeader}>
                        <span style={s.sectionTitle}>My calendars</span>
                    </div>
                    {[
                        { label: employeeName || "Personal", color: "#1a73e8" },
                        { label: "Tasks", color: "#4285F4" },
                    ].map(c => (
                        <div key={c.label} style={s.calItem}>
                            <input type="checkbox" defaultChecked style={{ accentColor: c.color, marginRight: 12, width: 16, height: 16 }} />
                            <span style={{ fontSize: 13, color: "#202124" }}>{c.label}</span>
                        </div>
                    ))}

                    <div style={{ ...s.sectionHeader, marginTop: 8 }}>
                        <span style={s.sectionTitle}>Other calendars</span>
                        <span style={{ fontSize: 18, color: "#5f6368", cursor: "pointer" }}>+</span>
                    </div>
                    <div style={s.calItem}>
                        <input type="checkbox" defaultChecked style={{ accentColor: "#1e8e3e", marginRight: 12, width: 16, height: 16 }} />
                        <span style={{ fontSize: 13, color: "#202124" }}>Holidays in India</span>
                    </div>

                    {/* Task deadlines summary */}
                    {taskItems.length > 0 && (
                        <div style={{ marginTop: 16, padding: "0 12px" }}>
                            <p style={{ fontSize: 11, fontWeight: 500, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                                Upcoming deadlines
                            </p>
                            {taskItems.filter(t => t.date >= new Date().toISOString().slice(0, 10)).slice(0, 5).map(t => (
                                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" }}
                                    onClick={() => setModal({ mode: "viewTask", task: t })}>
                                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                                    <div style={{ overflow: "hidden" }}>
                                        <p style={{ fontSize: 11, color: "#202124", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{t.title}</p>
                                        <p style={{ fontSize: 10, color: "#80868b", margin: 0 }}>{t.date}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </aside>

                {/* ── MAIN CALENDAR AREA ── */}
                <main style={s.main}>
                    {view === "week" && <WeekView cursor={cursor} today={today} getItemsForDate={getItemsForDate} onSlotClick={(dt) => setModal({ mode: "create", start: toLocalISO(dt), end: toLocalISO(new Date(dt.getTime() + 3600000)) })} onItemClick={(item) => setModal({ mode: item.type === "task" || item.type === "subtask" ? "viewTask" : "viewEvent", item, task: item })} />}
                    {view === "day" && <DayView cursor={cursor} today={today} getItemsForDate={getItemsForDate} onSlotClick={(dt) => setModal({ mode: "create", start: toLocalISO(dt), end: toLocalISO(new Date(dt.getTime() + 3600000)) })} onItemClick={(item) => setModal({ mode: item.type === "task" || item.type === "subtask" ? "viewTask" : "viewEvent", item, task: item })} />}
                    {view === "month" && <MonthView cursor={cursor} today={today} getItemsForDate={getItemsForDate} onDayClick={(d) => { setCursor(d); setView("day"); }} onItemClick={(item) => setModal({ mode: item.type === "task" || item.type === "subtask" ? "viewTask" : "viewEvent", item, task: item })} />}
                    {view === "agenda" && <AgendaView cursor={cursor} events={events} taskItems={taskItems} onItemClick={(item) => setModal({ mode: item.type === "task" || item.type === "subtask" ? "viewTask" : "viewEvent", item, task: item })} />}
                </main>
            </div>

            {/* ── MODALS ── */}
            {modal?.mode === "create" && (
                <CreateEventModal
                    start={modal.start} end={modal.end}
                    onClose={() => setModal(null)}
                    onSave={(evt) => { addEvent(evt); setModal(null); }}
                />
            )}
            {modal?.mode === "viewEvent" && (
                <ViewEventModal
                    event={modal.item}
                    onClose={() => setModal(null)}
                    onDelete={(id) => { deleteEvent(id); setModal(null); }}
                />
            )}
            {modal?.mode === "viewTask" && (
                <ViewTaskModal
                    task={modal.task}
                    onClose={() => setModal(null)}
                    onNavigate={(taskId) => { setModal(null); router.push(`/coworking/tasks/${taskId}`); }}
                />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────
//  MINI CALENDAR
// ─────────────────────────────────────────────────────────
function MiniCalendar({ year, month, selected, today, onSelect, onPrev, onNext, taskDates = [] }) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const taskDateSet = new Set(taskDates.map(d => d?.slice(0, 7) == `${year}-${String(month + 1).padStart(2, "0")}` ? d?.slice(8, 10) : null).filter(Boolean));

    return (
        <div style={{ padding: "0 12px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <button style={{ background: "none", border: "none", cursor: "pointer", color: "#5f6368", padding: "4px" }} onClick={onPrev}>‹</button>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#202124" }}>{MONTHS[month]} {year}</span>
                <button style={{ background: "none", border: "none", cursor: "pointer", color: "#5f6368", padding: "4px" }} onClick={onNext}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <div key={i} style={{ textAlign: "center", fontSize: 11, color: "#70757a", padding: "2px 0", fontWeight: 500 }}>{d}</div>
                ))}
                {cells.map((d, i) => {
                    if (!d) return <div key={i} />;
                    const thisDate = new Date(year, month, d);
                    const isToday = isSameDay(thisDate, today);
                    const isSelected = isSameDay(thisDate, selected);
                    const hasTask = taskDateSet.has(String(d).padStart(2, "0"));
                    return (
                        <div key={i} className="mini-day"
                            onClick={() => onSelect(thisDate)}
                            style={{
                                textAlign: "center", fontSize: 12, padding: "3px 0", borderRadius: "50%",
                                background: isSelected ? "#1a73e8" : isToday ? "#d2e3fc" : "transparent",
                                color: isSelected ? "#fff" : isToday ? "#1a73e8" : "#202124",
                                fontWeight: isToday || isSelected ? 700 : 400,
                                position: "relative",
                            }}>
                            {d}
                            {hasTask && !isSelected && (
                                <div style={{ position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: "#1a73e8" }} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────
//  TIME GRID (shared by Week + Day views)
// ─────────────────────────────────────────────────────────
function TimeGrid({ columns, today, onSlotClick, onItemClick }) {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const scrollRef = useRef(null);
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 7 * 48; // scroll to 7am
    }, []);

    return (
        <div style={{ flex: 1, overflow: "auto", position: "relative" }} ref={scrollRef}>
            <div style={{ display: "grid", gridTemplateColumns: `56px repeat(${columns.length},1fr)`, minWidth: columns.length * 80 + 56 }}>
                {/* Hour rows */}
                {hours.map(h => (
                    <div key={h} style={{ display: "contents" }}>
                        {/* Time label */}
                        <div style={{ height: 48, borderRight: "1px solid #e0e0e0", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 8, paddingTop: 4 }}>
                            <span className="time-label" style={{ fontSize: 10, color: "#70757a", whiteSpace: "nowrap" }}>{h === 0 ? "" : formatTime(h)}</span>
                        </div>
                        {/* Slots */}
                        {columns.map((col, ci) => (
                            <div key={ci} className="cal-slot"
                                style={{ height: 48, borderRight: "1px solid #f1f3f4", borderBottom: "1px solid #f1f3f4", position: "relative", background: "#fff" }}
                                onClick={() => {
                                    const d = new Date(col.date);
                                    d.setHours(h, 0, 0, 0);
                                    onSlotClick(d);
                                }}>
                                {/* Events in this slot */}
                                {col.evts.filter(e => {
                                    const s = parseLocalISO(e.start);
                                    return s && s.getHours() === h;
                                }).map(e => (
                                    <div key={e.id} className="cal-event"
                                        onClick={ev => { ev.stopPropagation(); onItemClick(e); }}
                                        style={{
                                            position: "absolute", left: 2, right: 2, top: 2,
                                            background: e.color || "#1a73e8", color: "#fff",
                                            borderRadius: 4, padding: "2px 6px", fontSize: 11, fontWeight: 500,
                                            zIndex: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                                            minHeight: 20,
                                        }}>
                                        {e.title}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                ))}

                {/* Task/deadline markers (all-day strip already in header; show at midnight) */}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────
//  WEEK VIEW
// ─────────────────────────────────────────────────────────
function WeekView({ cursor, today, getItemsForDate, onSlotClick, onItemClick }) {
    const days = (() => {
        const d = new Date(cursor);
        d.setDate(d.getDate() - d.getDay());
        return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; });
    })();

    const columns = days.map(d => {
        const { evts, tasks } = getItemsForDate(d);
        return { date: d, evts, tasks };
    });

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Week header */}
            <div style={{ display: "grid", gridTemplateColumns: `56px repeat(7,1fr)`, borderBottom: "1px solid #e0e0e0", background: "#fff", zIndex: 10, flexShrink: 0 }}>
                <div style={{ height: 56 }} />
                {days.map((d, i) => {
                    const isToday = isSameDay(d, today);
                    const { tasks } = getItemsForDate(d);
                    return (
                        <div key={i} style={{ textAlign: "center", padding: "4px 0", borderLeft: "1px solid #f1f3f4" }}>
                            <div className="week-header-day" style={{ fontSize: 11, color: isToday ? "#1a73e8" : "#70757a", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                {DAYS[d.getDay()]}
                            </div>
                            <div style={{
                                width: 32, height: 32, borderRadius: "50%",
                                background: isToday ? "#1a73e8" : "transparent",
                                color: isToday ? "#fff" : "#202124",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                margin: "2px auto", fontSize: 16, fontWeight: isToday ? 700 : 400, cursor: "pointer",
                            }}
                                className="cal-day-btn"
                                onClick={() => onSlotClick(new Date(d.setHours(9)))}>
                                {d.getDate()}
                            </div>
                            {/* Task deadline chips */}
                            <div style={{ padding: "0 2px", minHeight: 20 }}>
                                {tasks.slice(0, 2).map(t => (
                                    <div key={t.id} style={{ background: t.color, color: "#fff", borderRadius: 3, fontSize: 10, padding: "1px 4px", margin: "1px 0", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", cursor: "pointer" }}
                                        onClick={e => { e.stopPropagation(); onItemClick(t); }}>
                                        {t.title}
                                    </div>
                                ))}
                                {tasks.length > 2 && <div style={{ fontSize: 10, color: "#5f6368" }}>{tasks.length - 2} more</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
            <TimeGrid columns={columns} today={today} onSlotClick={onSlotClick} onItemClick={onItemClick} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────
//  DAY VIEW
// ─────────────────────────────────────────────────────────
function DayView({ cursor, today, getItemsForDate, onSlotClick, onItemClick }) {
    const { evts, tasks } = getItemsForDate(cursor);
    const isToday = isSameDay(cursor, today);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", borderBottom: "1px solid #e0e0e0", background: "#fff", flexShrink: 0 }}>
                <div style={{ height: 56 }} />
                <div style={{ textAlign: "center", padding: "4px 0", borderLeft: "1px solid #f1f3f4" }}>
                    <div style={{ fontSize: 11, color: isToday ? "#1a73e8" : "#70757a", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        {DAYS[cursor.getDay()]}
                    </div>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: isToday ? "#1a73e8" : "transparent", color: isToday ? "#fff" : "#202124", display: "flex", alignItems: "center", justifyContent: "center", margin: "2px auto", fontSize: 22, fontWeight: isToday ? 700 : 400 }}>
                        {cursor.getDate()}
                    </div>
                    <div style={{ padding: "0 4px", minHeight: 20 }}>
                        {tasks.map(t => (
                            <div key={t.id} style={{ background: t.color, color: "#fff", borderRadius: 3, fontSize: 10, padding: "1px 4px", margin: "1px 0", cursor: "pointer" }}
                                onClick={e => { e.stopPropagation(); onItemClick(t); }}>
                                {t.title}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <TimeGrid columns={[{ date: cursor, evts, tasks: [] }]} today={today} onSlotClick={onSlotClick} onItemClick={onItemClick} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────
//  MONTH VIEW
// ─────────────────────────────────────────────────────────
function MonthView({ cursor, today, getItemsForDate, onDayClick, onItemClick }) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();

    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push({ date: new Date(year, month - 1, prevDays - firstDay + i + 1), current: false });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d), current: true });
    while (cells.length % 7 !== 0) {
        cells.push({ date: new Date(year, month + 1, cells.length - daysInMonth - firstDay + 1), current: false });
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
            {/* Day headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid #e0e0e0", background: "#fff", flexShrink: 0 }}>
                {DAYS.map(d => (
                    <div key={d} style={{ textAlign: "center", padding: "8px 0", fontSize: 11, color: "#70757a", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>{d}</div>
                ))}
            </div>
            {/* Weeks */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridTemplateRows: `repeat(${cells.length / 7},1fr)`, flex: 1 }}>
                {cells.map((cell, i) => {
                    const isToday = isSameDay(cell.date, today);
                    const { evts, tasks } = getItemsForDate(cell.date);
                    return (
                        <div key={i} style={{ border: "1px solid #f1f3f4", padding: "4px", minHeight: 80, cursor: "pointer", background: "#fff" }}
                            onClick={() => onDayClick(cell.date)}>
                            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 2 }}>
                                <div style={{
                                    width: 24, height: 24, borderRadius: "50%",
                                    background: isToday ? "#1a73e8" : "transparent",
                                    color: isToday ? "#fff" : cell.current ? "#202124" : "#c0c0c0",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 12, fontWeight: isToday ? 700 : 400,
                                }}>
                                    {cell.date.getDate()}
                                </div>
                            </div>
                            {[...evts.slice(0, 2).map(e => ({ ...e, _t: "event" })), ...tasks.slice(0, 2).map(t => ({ ...t, _t: "task" }))].slice(0, 3).map(item => (
                                <div key={item.id} style={{ background: item.color || "#1a73e8", color: "#fff", borderRadius: 3, fontSize: 10, padding: "1px 4px", marginBottom: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", cursor: "pointer" }}
                                    onClick={e => { e.stopPropagation(); onItemClick(item); }}>
                                    {item._t === "task" ? "⏰ " : ""}{item.title}
                                </div>
                            ))}
                            {(evts.length + tasks.length) > 3 && <div style={{ fontSize: 10, color: "#5f6368" }}>{evts.length + tasks.length - 3} more</div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────
//  AGENDA VIEW
// ─────────────────────────────────────────────────────────
function AgendaView({ cursor, events, taskItems, onItemClick }) {
    const days = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(cursor); d.setDate(d.getDate() + i); return d;
    });

    const allByDay = days.map(d => {
        const evts = events.filter(e => { const s = parseLocalISO(e.start); return s && isSameDay(s, d); });
        const tasks = taskItems.filter(t => { const td = parseLocalISO(t.date + "T00:00"); return td && isSameDay(td, d); });
        return { date: d, items: [...evts.map(e => ({ ...e, _t: "event" })), ...tasks.map(t => ({ ...t, _t: "task" }))] };
    }).filter(day => day.items.length > 0);

    if (!allByDay.length) return (
        <div style={{ padding: 60, textAlign: "center", color: "#80868b" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
            No events or deadlines in the next 30 days
        </div>
    );

    return (
        <div style={{ overflow: "auto", height: "100%" }}>
            {allByDay.map(({ date, items }) => (
                <div key={date.toDateString()} style={{ display: "grid", gridTemplateColumns: "80px 1fr", borderBottom: "1px solid #f1f3f4" }}>
                    <div style={{ padding: "16px 8px 16px 16px", textAlign: "right" }}>
                        <div style={{ fontSize: 12, color: "#70757a", fontWeight: 500 }}>{DAYS[date.getDay()]}</div>
                        <div style={{ fontSize: 26, color: "#202124", fontWeight: 400 }}>{date.getDate()}</div>
                        <div style={{ fontSize: 11, color: "#70757a" }}>{MONTHS[date.getMonth()].slice(0, 3)}</div>
                    </div>
                    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {items.map(item => (
                            <div key={item.id} onClick={() => onItemClick(item)}
                                style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 8, background: "#f8f9fa", cursor: "pointer", border: `1px solid #e8eaed` }}>
                                <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.color || item._t === "task" ? "#d93025" : "#1a73e8", flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                    <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "#202124" }}>{item.title}</p>
                                    <p style={{ margin: 0, fontSize: 12, color: "#5f6368" }}>
                                        {item._t === "task" ? `⏰ Deadline · ${item.status}` : item.start ? parseLocalISO(item.start)?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "All day"}
                                    </p>
                                </div>
                                {item._t === "task" && <span style={{ fontSize: 11, background: item.color, color: "#fff", padding: "2px 8px", borderRadius: 10, fontWeight: 500 }}>{item.type}</span>}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────
//  CREATE EVENT MODAL
// ─────────────────────────────────────────────────────────
function CreateEventModal({ start, end, onClose, onSave }) {
    const [tab, setTab] = useState("event");  // event|task|appointment
    const [title, setTitle] = useState("");
    const [sTime, setSTime] = useState(start);
    const [eTime, setETime] = useState(end);
    const [color, setColor] = useState("#1a73e8");
    const [desc, setDesc] = useState("");
    const [location, setLoc] = useState("");
    const [guests, setGuests] = useState("");

    const handleSave = () => {
        if (!title.trim()) return;
        onSave({ title: title.trim(), start: sTime, end: eTime, color, description: desc, location, type: tab });
    };

    return (
        <div style={ms.overlay} onClick={onClose}>
            <div style={ms.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={ms.modalHeader}>
                    <span style={{ color: "#5f6368", fontSize: 18, cursor: "pointer" }}>☰</span>
                    <button style={ms.closeBtn} onClick={onClose}>✕</button>
                </div>

                {/* Title input */}
                <input style={ms.titleInput} value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="Add title" autoFocus onKeyDown={e => e.key === "Enter" && handleSave()} />

                {/* Tabs: Event / Task / Appointment */}
                <div style={ms.tabs}>
                    {["event", "task", "appointment"].map(t => (
                        <button key={t} onClick={() => setTab(t)}
                            style={{ ...ms.tab, ...(tab === t ? ms.tabActive : {}) }}>
                            {t === "appointment" ? "Appointment schedule" : t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={ms.modalBody}>
                    {/* Date/time */}
                    <div style={ms.row}>
                        <span style={ms.icon}>🕐</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <input type="datetime-local" style={ms.dtInput} value={sTime} onChange={e => setSTime(e.target.value)} />
                                <span style={{ alignSelf: "center", color: "#5f6368" }}>–</span>
                                <input type="datetime-local" style={ms.dtInput} value={eTime} onChange={e => setETime(e.target.value)} />
                            </div>
                            <div style={{ fontSize: 12, color: "#5f6368", marginTop: 4 }}>
                                Time zone · Doesn't repeat
                            </div>
                        </div>
                    </div>

                    {tab === "event" && <>
                        {/* Guests */}
                        <div style={ms.row}>
                            <span style={ms.icon}>👥</span>
                            <input style={ms.textInput} value={guests} onChange={e => setGuests(e.target.value)} placeholder="Add guests" />
                        </div>
                        {/* Google Meet */}
                        <div style={ms.row}>
                            <span style={ms.icon}>🎥</span>
                            <span style={{ fontSize: 14, color: "#202124", cursor: "pointer", color: "#1a73e8" }}>Add Google Meet video conferencing</span>
                        </div>
                        {/* Location */}
                        <div style={ms.row}>
                            <span style={ms.icon}>📍</span>
                            <input style={ms.textInput} value={location} onChange={e => setLoc(e.target.value)} placeholder="Add location" />
                        </div>
                    </>}

                    {tab === "task" && (
                        <div style={ms.row}>
                            <span style={ms.icon}>🎯</span>
                            <input style={ms.textInput} placeholder="Add deadline" />
                        </div>
                    )}

                    {/* Description */}
                    <div style={ms.row}>
                        <span style={ms.icon}>≡</span>
                        <textarea style={{ ...ms.textInput, height: 60, resize: "none" }} value={desc} onChange={e => setDesc(e.target.value)}
                            placeholder={tab === "event" ? "Add description or a Google Drive attachment" : "Add description"} />
                    </div>

                    {/* Color picker */}
                    <div style={ms.row}>
                        <span style={ms.icon}>🎨</span>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {COLORS.map(c => (
                                <div key={c} onClick={() => setColor(c)}
                                    style={{ width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer", border: `2px solid ${color === c ? "#202124" : "transparent"}`, transition: "transform 0.1s" }} />
                            ))}
                        </div>
                    </div>

                    {/* Calendar selector */}
                    <div style={ms.row}>
                        <span style={ms.icon}>📅</span>
                        <div>
                            <div style={{ fontSize: 14, color: "#202124", fontWeight: 500 }}>Grav It dept</div>
                            <div style={{ fontSize: 12, color: "#5f6368" }}>
                                {tab === "event" ? "Busy · Default visibility · Notify 30 minutes before" : "Free · Private"}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={ms.modalFooter}>
                    <button style={ms.moreBtn}>More options</button>
                    <button style={ms.saveBtn} onClick={handleSave} disabled={!title.trim()}>Save</button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────
//  VIEW EVENT MODAL
// ─────────────────────────────────────────────────────────
function ViewEventModal({ event, onClose, onDelete }) {
    return (
        <div style={ms.overlay} onClick={onClose}>
            <div style={{ ...ms.modal, maxWidth: 420, padding: 0, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
                <div style={{ height: 8, background: event.color || "#1a73e8" }} />
                <div style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                        <h2 style={{ fontSize: 20, fontWeight: 400, color: "#202124", margin: 0 }}>{event.title}</h2>
                        <div style={{ display: "flex", gap: 4 }}>
                            <button style={{ ...ms.closeBtn, background: "#fce8e6", color: "#d93025" }} onClick={() => onDelete(event.id)}>🗑</button>
                            <button style={ms.closeBtn} onClick={onClose}>✕</button>
                        </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 14, color: "#202124" }}>
                            <span>🕐</span>
                            <span>{parseLocalISO(event.start)?.toLocaleString("en-IN", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} – {parseLocalISO(event.end)?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        {event.location && <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 14, color: "#202124" }}><span>📍</span><span>{event.location}</span></div>}
                        {event.description && <div style={{ display: "flex", gap: 12, fontSize: 14, color: "#202124" }}><span>≡</span><span>{event.description}</span></div>}
                        <div style={{ display: "flex", gap: 12, fontSize: 14, color: "#202124" }}><span>📅</span><span>Grav It dept</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────
//  VIEW TASK DEADLINE MODAL
// ─────────────────────────────────────────────────────────
function ViewTaskModal({ task, onClose, onNavigate }) {
    const deadlineDate = task.date ? new Date(task.date) : null;
    const now = new Date();
    const isPast = deadlineDate && deadlineDate < now;
    const statusColors = { open: "#d93025", confirmed: "#1a73e8", in_progress: "#f9ab00", done: "#1e8e3e" };

    return (
        <div style={ms.overlay} onClick={onClose}>
            <div style={{ ...ms.modal, maxWidth: 400, padding: 0, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
                <div style={{ height: 8, background: task.color || "#d93025" }} />
                <div style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                        <div>
                            <span style={{ fontSize: 11, background: task.type === "subtask" ? "#f3e8fd" : "#e8f0fe", color: task.type === "subtask" ? "#9334e9" : "#1a73e8", padding: "2px 8px", borderRadius: 10, fontWeight: 500, fontSize: 11 }}>
                                {task.type === "subtask" ? "Subtask" : "Task"}
                            </span>
                        </div>
                        <button style={ms.closeBtn} onClick={onClose}>✕</button>
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 400, color: "#202124", margin: "0 0 16px" }}>{task.title}</h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 14 }}>
                            <span>⏰</span>
                            <div>
                                <span style={{ color: "#202124", fontWeight: 500 }}>Deadline: </span>
                                <span style={{ color: isPast ? "#d93025" : "#1e8e3e", fontWeight: 500 }}>
                                    {deadlineDate?.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                                </span>
                                {isPast && <span style={{ marginLeft: 8, fontSize: 12, background: "#fce8e6", color: "#d93025", padding: "1px 6px", borderRadius: 10 }}>Overdue</span>}
                            </div>
                        </div>
                        {task.status && (
                            <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 14 }}>
                                <span>📊</span>
                                <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 500, background: `${statusColors[task.status]}20`, color: statusColors[task.status] }}>
                                    {task.status.replace("_", " ")}
                                </span>
                            </div>
                        )}
                        {task.taskId && (
                            <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 14 }}>
                                <span>🆔</span>
                                <span style={{ fontFamily: "monospace", color: "#5f6368" }}>{task.taskId}</span>
                            </div>
                        )}
                    </div>
                    {task.taskId && (
                        <button
                            onClick={() => onNavigate(task.taskId)}
                            style={{ marginTop: 16, width: "100%", padding: "10px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 4, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                            Open Task →
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────
//  SVG ICONS
// ─────────────────────────────────────────────────────────
const HamburgerIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
);
const CalendarIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24">
        <rect x="3" y="4" width="4" height="4" fill="#4285F4" rx="1" />
        <rect x="10" y="4" width="4" height="4" fill="#EA4335" rx="1" />
        <rect x="17" y="4" width="4" height="4" fill="#34A853" rx="1" />
        <rect x="3" y="11" width="4" height="4" fill="#FBBC04" rx="1" />
        <rect x="10" y="11" width="4" height="4" fill="#4285F4" rx="1" />
        <rect x="17" y="11" width="4" height="4" fill="#EA4335" rx="1" />
    </svg>
);
const SearchIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);
const ChevronLeft = () => <span style={{ fontSize: 18, color: "#5f6368" }}>‹</span>;
const ChevronRight = () => <span style={{ fontSize: 18, color: "#5f6368" }}>›</span>;

// ─────────────────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────────────────
const s = {
    root: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "'Google Sans','Roboto',sans-serif", background: "#fff", overflow: "hidden" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px", height: 64, borderBottom: "1px solid #e0e0e0", background: "#fff", flexShrink: 0, zIndex: 100 },
    headerLeft: { display: "flex", alignItems: "center", gap: 4 },
    headerRight: { display: "flex", alignItems: "center", gap: 4 },
    logo: { display: "flex", alignItems: "center", gap: 4, marginRight: 8 },
    logoText: { fontSize: 22, fontWeight: 400, color: "#202124", letterSpacing: "-0.5px" },
    iconBtn: { background: "none", border: "none", cursor: "pointer", padding: 8, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#5f6368", fontSize: 16 },
    todayBtn: { padding: "8px 16px", border: "1px solid #dadce0", borderRadius: 4, background: "#fff", color: "#3c4043", fontSize: 14, fontWeight: 500, cursor: "pointer", marginRight: 4 },
    headerTitle: { fontSize: 22, fontWeight: 400, color: "#202124", marginLeft: 8, whiteSpace: "nowrap" },
    viewSwitcher: { display: "flex", border: "1px solid #dadce0", borderRadius: 4, overflow: "hidden", marginLeft: 8 },
    viewBtn: { padding: "6px 14px", border: "none", background: "#fff", color: "#3c4043", fontSize: 13, fontWeight: 500, cursor: "pointer", borderRight: "1px solid #dadce0" },
    viewBtnActive: { background: "#e8f0fe", color: "#1a73e8" },
    searchBox: { display: "flex", alignItems: "center", border: "1px solid #dadce0", borderRadius: 24, padding: "4px 12px", gap: 8, background: "#f1f3f4" },
    searchInput: { border: "none", background: "transparent", fontSize: 14, outline: "none", width: 200, color: "#202124" },
    body: { display: "flex", flex: 1, overflow: "hidden" },
    sidebar: { width: 256, flexShrink: 0, borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column", overflowY: "auto", background: "#fff", paddingBottom: 16 },
    createBtn: { margin: "16px 12px 8px", padding: "12px 24px", border: "none", borderRadius: 24, background: "#fff", color: "#202124", fontSize: 14, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.2),0 4px 8px rgba(0,0,0,0.1)", transition: "box-shadow 0.2s" },
    sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px 4px", marginTop: 8 },
    sectionTitle: { fontSize: 11, fontWeight: 700, color: "#444746", textTransform: "uppercase", letterSpacing: "0.8px" },
    calItem: { display: "flex", alignItems: "center", padding: "4px 12px", cursor: "pointer" },
    main: { flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" },
};

const ms = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 },
    modal: { background: "#fff", borderRadius: 8, width: "min(560px,95vw)", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 38px rgba(0,0,0,0.14),0 9px 46px rgba(0,0,0,0.12)", fontFamily: "'Google Sans','Roboto',sans-serif" },
    modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px 0" },
    titleInput: { width: "100%", border: "none", borderBottom: "2px solid #1a73e8", outline: "none", fontSize: 22, fontWeight: 400, color: "#202124", padding: "8px 16px 4px", fontFamily: "inherit", background: "transparent" },
    tabs: { display: "flex", borderBottom: "1px solid #e0e0e0", padding: "0 16px", marginTop: 8 },
    tab: { padding: "10px 12px", border: "none", background: "transparent", fontSize: 14, color: "#5f6368", cursor: "pointer", borderBottom: "3px solid transparent", marginBottom: -1, fontFamily: "inherit", fontWeight: 500 },
    tabActive: { color: "#1a73e8", borderBottom: "3px solid #1a73e8" },
    modalBody: { padding: "8px 16px 0", display: "flex", flexDirection: "column", gap: 4 },
    row: { display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 0", borderBottom: "1px solid #f1f3f4" },
    icon: { fontSize: 18, color: "#5f6368", flexShrink: 0, marginTop: 2, width: 20, textAlign: "center" },
    textInput: { flex: 1, border: "none", borderBottom: "1px solid #e0e0e0", outline: "none", fontSize: 14, color: "#202124", padding: "4px 0", fontFamily: "inherit", background: "transparent", width: "100%" },
    dtInput: { border: "none", fontSize: 13, color: "#202124", outline: "none", fontFamily: "inherit", background: "#f1f3f4", borderRadius: 4, padding: "4px 8px" },
    modalFooter: { display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px" },
    moreBtn: { padding: "9px 24px", border: "none", background: "transparent", color: "#1a73e8", fontSize: 14, fontWeight: 500, cursor: "pointer", borderRadius: 4 },
    saveBtn: { padding: "9px 28px", border: "none", background: "#1a73e8", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", borderRadius: 24 },
    closeBtn: { background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: "50%", color: "#5f6368", fontSize: 16 },
};