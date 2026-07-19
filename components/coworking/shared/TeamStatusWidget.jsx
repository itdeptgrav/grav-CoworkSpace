
"use client";
import { useEffect, useMemo, useState } from "react";
import { listAllEmployees } from "../../../lib/mediaUploadApi";
import { GwAvatar } from "./CoworkShared";

function roleLabel(emp) {
    if (emp.role === "ceo") return "Admin / CEO";
    if (emp.role === "tl") return emp.department ? `Team Lead · ${emp.department}` : "Team Lead";
    return emp.department || "Employee";
}

function fmtSince(ms) {
    if (!ms) return null;
    const mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
}

const TABS = [
    { key: "offline", label: "Offline" },
    { key: "online", label: "Online" },
    { key: "emergency", label: "Emergency" },
    { key: "all", label: "All" },
];

export default function TeamStatusWidget({ currentEmployeeId }) {
    const [employees, setEmployees] = useState([]);
    const [statusMap, setStatusMap] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("offline");
    const [search, setSearch] = useState("");

    const load = async () => {
        try {
            const [emps, { firebaseDb }, { collection, getDocs }] = await Promise.all([
                listAllEmployees(),
                import("../../../lib/coworkFirebase"),
                import("firebase/firestore"),
            ]);
            setEmployees(emps.filter(e => e.employeeId !== currentEmployeeId));

            const snap = await getDocs(collection(firebaseDb, "cowork_duty_status"));
            const map = new Map();
            snap.docs.forEach(d => {
                const data = d.data();
                map.set(d.id, {
                    mode: data.mode || (data.isOnline ? "online" : "offline"),
                    sinceMs: data.since?.toDate ? data.since.toDate().getTime() : null,
                });
            });
            setStatusMap(map);
        } catch (e) {
            console.error("[TeamStatusWidget] load failed:", e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // Batch refresh every 60s — a status OVERVIEW, not a live timer, so this
        // is far cheaper than one listener per employee and plenty fresh enough.
        const t = setInterval(load, 60000);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentEmployeeId]);

    const enriched = useMemo(() => employees.map(e => {
        const s = statusMap.get(e.employeeId);
        return { ...e, mode: s?.mode || "offline", sinceMs: s?.sinceMs || null };
    }), [employees, statusMap]);

    const counts = useMemo(() => ({
        offline: enriched.filter(e => e.mode === "offline").length,
        online: enriched.filter(e => e.mode === "online").length,
        emergency: enriched.filter(e => e.mode === "emergency").length,
        all: enriched.length,
    }), [enriched]);

    const filtered = useMemo(() => {
        let list = tab === "all" ? enriched : enriched.filter(e => e.mode === tab);
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter(e => (e.name || "").toLowerCase().includes(q));
        }
        return [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }, [enriched, tab, search]);

    const dotColor = (mode) => mode === "online" ? "#16A34A" : mode === "emergency" ? "#D97706" : "#9CA3AF";

    return (
        <div className="wf-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>Team Status</h2>
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search…"
                    style={{ padding: "6px 10px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none", width: 140 }}
                />
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                {TABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        style={{
                            padding: "5px 12px", borderRadius: 8, border: `1px solid ${tab === t.key ? "#6C63FF" : "#E5E7EB"}`,
                            background: tab === t.key ? "#EDEDFE" : "#fff",
                            color: tab === t.key ? "#6C63FF" : "#6B7280",
                            fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                            display: "flex", alignItems: "center", gap: 5,
                        }}
                    >
                        {t.key !== "all" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor(t.key), flexShrink: 0 }} />}
                        {t.label}
                        <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7 }}>{counts[t.key]}</span>
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ fontSize: 12, color: "#9CA3AF", padding: "20px 0", textAlign: "center" }}>Loading team status…</div>
            ) : filtered.length === 0 ? (
                <div style={{ fontSize: 12, color: "#9CA3AF", padding: "20px 0", textAlign: "center" }}>
                    {tab === "offline" ? "Everyone is online right now." : `No one is ${tab} right now.`}
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, maxHeight: 320, overflowY: "auto", paddingRight: 2 }}>
                    {filtered.map(emp => (
                        <div key={emp.employeeId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid #F1F5F9", borderRadius: 8, background: "#FAFAFB", minWidth: 0 }}>
                            <div style={{ position: "relative", flexShrink: 0 }}>
                                <GwAvatar name={emp.name} size={30} url={emp.profilePicUrl} />
                                <span style={{ position: "absolute", bottom: -1, right: -1, width: 9, height: 9, borderRadius: "50%", background: dotColor(emp.mode), border: "2px solid #FAFAFB" }} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.name}</div>
                                <div style={{ fontSize: 10, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {roleLabel(emp)}{emp.sinceMs ? ` · ${fmtSince(emp.sinceMs)}` : ""}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}