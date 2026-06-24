"use client";
/**
 * app/coworking/calendar/page.js
 * Employee Workload Dashboard
 * Visible to: CEO (all employees) | TL (own department only)
 */

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import { getWorkloadSummary } from "../../../lib/coworkApi";

// ── Avatar ────────────────────────────────────────────────
function Avatar({ name, size = 38 }) {
    const initials = name
        ? name.trim().split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
        : "?";
    const colors = [
        { bg: "#EEEDFE", txt: "#3C3489" },
        { bg: "#E1F5EE", txt: "#0F6E56" },
        { bg: "#FAECE7", txt: "#993C1D" },
        { bg: "#E6F1FB", txt: "#0C447C" },
        { bg: "#FAEEDA", txt: "#633806" },
    ];
    const c = colors[name?.charCodeAt(0) % colors.length] || colors[0];
    return (
        <div style={{
            width: size, height: size, borderRadius: "50%",
            background: c.bg, color: c.txt, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: size * 0.34, fontWeight: 500, fontFamily: "inherit",
        }}>
            {initials}
        </div>
    );
}

// ── Status badge ──────────────────────────────────────────
function StatusBadge({ status }) {
    const map = {
        open: { bg: "#EAF3DE", txt: "#27500A", label: "Open" },
        in_progress: { bg: "#FAEEDA", txt: "#633806", label: "In progress" },
    };
    const s = map[status] || map.open;
    return (
        <span style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 20,
            background: s.bg, color: s.txt, fontWeight: 500, whiteSpace: "nowrap"
        }}>
            {s.label}
        </span>
    );
}

// ── Hours cell — handles overdue + allocated hrs + normal ─
function HoursCell({ hours, overdue, dueDate }) {
    if (overdue) return (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 20,
                background: "#FCE8E6", color: "#D93025", fontWeight: 500,
                display: "inline-block", width: "fit-content"
            }}>
                Overdue
            </span>
            {dueDate && (
                <span style={{ fontSize: 10, color: "#D93025" }}>
                    Due: {new Date(dueDate).toLocaleDateString("en-IN",
                        { day: "numeric", month: "short", year: "numeric" })}
                </span>
            )}
            {/* Always show hours — even 0 */}
            <span style={{ fontSize: 11, color: "#80868b" }}>
                {hours > 0 ? `${hours} hrs` : "0 hrs"}
            </span>
        </div>
    );

    if (!hours || hours === 0) return (
        <span style={{ color: "#80868b", fontSize: 13 }}>—</span>
    );
    return (
        <span style={{ fontSize: 13, fontWeight: 500, color: "#202124" }}>
            {hours} hrs
        </span>
    );
}

// ── Stat card ─────────────────────────────────────────────
function StatCard({ label, value, sub }) {
    return (
        <div style={{
            background: "#F8F9FA", borderRadius: 10,
            padding: "14px 18px", minWidth: 110, flex: 1
        }}>
            <div style={{
                fontSize: 11, color: "#5f6368", fontWeight: 500,
                textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4
            }}>
                {label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#202124", lineHeight: 1.2 }}>
                {value}
            </div>
            {sub && <div style={{ fontSize: 11, color: "#80868b", marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────
export default function WorkloadPage() {
    const { user, role, loading } = useCoworkAuth();
    const router = useRouter();

    const [employees, setEmployees] = useState([]);
    const [fetching, setFetching] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");
    const [deptFilter, setDeptFilter] = useState("");
    const [expanded, setExpanded] = useState({});
    const [activeTab, setActiveTab] = useState({});

    useEffect(() => {
        if (!loading && !user) { router.push("/"); return; }
        if (!loading && user && role === "employee") { router.push("/coworking"); }
    }, [user, role, loading]);

    useEffect(() => {
        if (!user || role === "employee") return;
        setFetching(true);
        getWorkloadSummary()
            .then(data => setEmployees(data.employees || []))
            .catch(e => setError(e.message))
            .finally(() => setFetching(false));
    }, [user, role]);

    const departments = useMemo(() => {
        const set = new Set(employees.map(e => e.department).filter(Boolean));
        return [...set].sort();
    }, [employees]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return employees.filter(e =>
            (!q || e.name.toLowerCase().includes(q)) &&
            (!deptFilter || e.department === deptFilter)
        );
    }, [employees, search, deptFilter]);

    const stats = useMemo(() => ({
        total: filtered.length,
        totalHours: filtered.reduce((s, e) => s + e.totalHours, 0).toFixed(1),
        totalC1: filtered.reduce((s, e) => s + e.c1Count, 0),
        totalC2: filtered.reduce((s, e) => s + e.c2Count, 0),
    }), [filtered]);

    const toggleExpand = eid => setExpanded(p => ({ ...p, [eid]: !p[eid] }));
    const getTab = eid => activeTab[eid] || "c1";
    const setTab = (eid, tab) => setActiveTab(p => ({ ...p, [eid]: tab }));

    if (loading || !user) return null;

    return (
        <div style={{
            padding: "24px 20px 48px", maxWidth: 900, margin: "0 auto",
            fontFamily: "'Google Sans','Inter',system-ui,sans-serif"
        }}>

            {/* Header */}
            <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontSize: 20, fontWeight: 600, color: "#202124", margin: 0 }}>
                    Employee Workload
                </h1>
                <p style={{ fontSize: 13, color: "#5f6368", margin: "4px 0 0" }}>
                    {role === "tl"
                        ? "Showing workload for your department"
                        : "Showing workload across all employees"}
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#80868b" }}>
                        · Hours based on office schedule
                    </span>
                </p>
            </div>

            {/* Stat cards */}
            {!fetching && !error && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                    <StatCard label="Employees" value={stats.total} />
                    <StatCard label="Total hours" value={`${stats.totalHours} hrs`} sub="Office hours" />
                    <StatCard label="C1 tasks" value={stats.totalC1} sub="Active assigned" />
                    <StatCard label="C2 gold" value={stats.totalC2} sub="Active assigned" />
                </div>
            )}

            {/* Filters */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
                    <span style={{
                        position: "absolute", left: 10, top: "50%",
                        transform: "translateY(-50%)", color: "#80868b", pointerEvents: "none"
                    }}>
                        🔍
                    </span>
                    <input type="text" placeholder="Search employee..."
                        value={search} onChange={e => setSearch(e.target.value)}
                        style={{
                            width: "100%", boxSizing: "border-box",
                            padding: "9px 12px 9px 34px", border: "1px solid #DADCE0",
                            borderRadius: 8, fontSize: 13, color: "#202124",
                            outline: "none", fontFamily: "inherit", background: "#fff"
                        }} />
                </div>
                <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                    style={{
                        padding: "9px 12px", border: "1px solid #DADCE0", borderRadius: 8,
                        fontSize: 13, color: "#202124", background: "#fff",
                        cursor: "pointer", fontFamily: "inherit", minWidth: 160
                    }}>
                    <option value="">All departments</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
            </div>

            {/* States */}
            {fetching && (
                <div style={{
                    textAlign: "center", padding: "48px 0",
                    color: "#5f6368", fontSize: 14
                }}>
                    Loading workload data...
                </div>
            )}
            {!fetching && error && (
                <div style={{
                    textAlign: "center", padding: "48px 0",
                    color: "#D93025", fontSize: 14
                }}>
                    {error}
                </div>
            )}
            {!fetching && !error && filtered.length === 0 && (
                <div style={{
                    textAlign: "center", padding: "48px 0",
                    color: "#80868b", fontSize: 14
                }}>
                    No employees match your search.
                </div>
            )}

            {/* Employee list */}
            {!fetching && !error && filtered.map(emp => {
                const isOpen = !!expanded[emp.employeeId];
                const tab = getTab(emp.employeeId);
                const hasC2 = emp.c2Count > 0;

                return (
                    <div key={emp.employeeId} style={{
                        background: "#fff",
                        border: "1px solid #E8EAED", borderRadius: 12,
                        marginBottom: 10, overflow: "hidden"
                    }}>

                        {/* Collapsed row */}
                        <div onClick={() => toggleExpand(emp.employeeId)}
                            style={{
                                display: "flex", alignItems: "center", gap: 12,
                                padding: "14px 16px", cursor: "pointer"
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "#F8F9FA"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>

                            <Avatar name={emp.name} />

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: 14, fontWeight: 500, color: "#202124",
                                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                                }}>
                                    {emp.name}
                                </div>
                                <div style={{ fontSize: 12, color: "#5f6368", marginTop: 1 }}>
                                    {emp.department}
                                    {emp.role === "tl" && (
                                        <span style={{
                                            marginLeft: 6, fontSize: 10, background: "#E8F0FE",
                                            color: "#1a73e8", padding: "1px 6px", borderRadius: 10, fontWeight: 500
                                        }}>
                                            TL
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: 20, alignItems: "center", flexShrink: 0 }}>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 15, fontWeight: 600, color: "#202124" }}>
                                        {emp.totalHours} hrs
                                    </div>
                                    <div style={{ fontSize: 10, color: "#80868b" }}>Office hrs</div>
                                </div>

                                <div style={{ width: 1, height: 28, background: "#E8EAED" }} />

                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 15, fontWeight: 600, color: "#202124" }}>
                                        {emp.c1Count}
                                    </div>
                                    <div style={{ fontSize: 10, color: "#80868b" }}>C1 tasks</div>
                                </div>

                                {hasC2 && <>
                                    <div style={{ width: 1, height: 28, background: "#E8EAED" }} />
                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontSize: 15, fontWeight: 600, color: "#7F77DD" }}>
                                            {emp.totalC2Months} mo
                                        </div>
                                        <div style={{ fontSize: 10, color: "#80868b" }}>C2 gold</div>
                                    </div>
                                </>}

                                <span style={{
                                    fontSize: 16, color: "#80868b", display: "inline-block",
                                    transform: isOpen ? "rotate(180deg)" : "none",
                                    transition: "transform 0.2s"
                                }}>
                                    ›
                                </span>
                            </div>
                        </div>

                        {/* Expanded section */}
                        {isOpen && (
                            <div style={{ borderTop: "1px solid #F1F3F4" }}>

                                {/* Tab switcher — only if C2 tasks exist */}
                                {hasC2 && (
                                    <div style={{
                                        display: "flex", padding: "10px 16px 0",
                                        borderBottom: "1px solid #F1F3F4"
                                    }}>
                                        {[
                                            { key: "c1", label: `C1 Tasks (${emp.c1Count})` },
                                            { key: "c2", label: `C2 Gold Tasks (${emp.c2Count})` },
                                        ].map(t => (
                                            <button key={t.key}
                                                onClick={() => setTab(emp.employeeId, t.key)}
                                                style={{
                                                    padding: "6px 16px 10px", border: "none",
                                                    background: "transparent", fontSize: 13, cursor: "pointer",
                                                    fontFamily: "inherit", marginBottom: -1,
                                                    fontWeight: tab === t.key ? 600 : 400,
                                                    color: tab === t.key ? "#1a73e8" : "#5f6368",
                                                    borderBottom: tab === t.key
                                                        ? "2px solid #1a73e8" : "2px solid transparent"
                                                }}>
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* C1 task table */}
                                {(!hasC2 || tab === "c1") && (
                                    <div style={{ background: "#FAFAFA" }}>
                                        <div style={{
                                            display: "grid",
                                            gridTemplateColumns: "1fr 150px 110px",
                                            padding: "8px 16px 6px 68px",
                                            borderBottom: "1px solid #F1F3F4"
                                        }}>
                                            {["Task", "Hours", "Status"].map(h => (
                                                <span key={h} style={{
                                                    fontSize: 11, color: "#80868b",
                                                    fontWeight: 600, textTransform: "uppercase",
                                                    letterSpacing: "0.04em"
                                                }}>
                                                    {h}
                                                </span>
                                            ))}
                                        </div>

                                        {emp.c1Tasks.length === 0 && (
                                            <div style={{
                                                padding: "16px 68px", fontSize: 13,
                                                color: "#80868b", fontStyle: "italic"
                                            }}>
                                                No active C1 tasks assigned
                                            </div>
                                        )}

                                        {emp.c1Tasks.map(task => (
                                            <div key={task.taskId} style={{
                                                display: "grid",
                                                gridTemplateColumns: "1fr 150px 110px",
                                                padding: "10px 16px 10px 68px",
                                                borderBottom: "1px solid #F1F3F4",
                                                alignItems: "center"
                                            }}>
                                                <span style={{
                                                    fontSize: 13, color: "#202124",
                                                    overflow: "hidden", textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap", paddingRight: 8
                                                }}>
                                                    {task.title}
                                                </span>
                                                <HoursCell
                                                    hours={task.hours}
                                                    overdue={task.overdue}
                                                    dueDate={task.dueDate}
                                                />
                                                <StatusBadge status={task.status} />
                                            </div>
                                        ))}

                                        {emp.c1Tasks.length > 0 && (
                                            <div style={{
                                                display: "flex", justifyContent: "flex-end",
                                                padding: "8px 16px 10px", gap: 6
                                            }}>
                                                <span style={{ fontSize: 12, color: "#5f6368" }}>
                                                    Total office hours:
                                                </span>
                                                <span style={{ fontSize: 13, fontWeight: 600, color: "#202124" }}>
                                                    {emp.totalHours} hrs
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* C2 task table */}
                                {hasC2 && tab === "c2" && (
                                    <div style={{ background: "#FAFAFA" }}>
                                        <div style={{
                                            display: "grid",
                                            gridTemplateColumns: "1fr 130px 110px",
                                            padding: "8px 16px 6px 68px",
                                            borderBottom: "1px solid #F1F3F4"
                                        }}>
                                            {["Gold Task", "Months left", "Status"].map(h => (
                                                <span key={h} style={{
                                                    fontSize: 11, color: "#80868b",
                                                    fontWeight: 600, textTransform: "uppercase",
                                                    letterSpacing: "0.04em"
                                                }}>
                                                    {h}
                                                </span>
                                            ))}
                                        </div>

                                        {emp.c2Tasks.map(task => (
                                            <div key={task.taskId} style={{
                                                display: "grid",
                                                gridTemplateColumns: "1fr 130px 110px",
                                                padding: "10px 16px 10px 68px",
                                                borderBottom: "1px solid #F1F3F4",
                                                alignItems: "center"
                                            }}>
                                                <span style={{
                                                    fontSize: 13, color: "#202124",
                                                    overflow: "hidden", textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap", paddingRight: 8
                                                }}>
                                                    ⭐ {task.title}
                                                </span>
                                                <span style={{ fontSize: 13, fontWeight: 600, color: "#7F77DD" }}>
                                                    {task.monthsLeft > 0 ? `${task.monthsLeft} months` : (
                                                        <span style={{ color: "#D93025" }}>Overdue</span>
                                                    )}
                                                </span>
                                                <StatusBadge status={task.status} />
                                            </div>
                                        ))}

                                        <div style={{
                                            display: "flex", justifyContent: "flex-end",
                                            padding: "8px 16px 10px", gap: 6
                                        }}>
                                            <span style={{ fontSize: 12, color: "#5f6368" }}>Total span:</span>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: "#7F77DD" }}>
                                                {emp.totalC2Months} months
                                            </span>
                                        </div>
                                    </div>
                                )}

                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}