"use client";
import { useEffect, useState, use, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    collection, onSnapshot, orderBy, query, limit,
    doc, where, setDoc,
} from "firebase/firestore";
import { omDb } from "../../../../lib/officeMonitorFirebase";
import { useCoworkAuth } from "../../../../hooks/useCoworkAuth";

const CAT_COLORS = {
    "Video": "#ef4444", "Entertainment": "#f97316", "Email": "#3b82f6",
    "Search / Browse": "#8b5cf6", "Shopping": "#f59e0b", "Social Media": "#ec4899",
    "Development": "#10b981", "Work — Document": "#06b6d4", "Work — Spreadsheet": "#06b6d4",
    "Work — Presentation": "#06b6d4", "Meeting": "#6366f1", "Chat": "#14b8a6",
    "AI Tool": "#a855f7", "File Explorer": "#64748b", "Desktop": "#94a3b8",
    "⚠️ Terminal": "#f59e0b", "⚠️ System Tool": "#ef4444", "⚠️ Virtual Machine": "#ef4444",
    "⚠️ Screen Recorder": "#ef4444", "⚠️ VPN": "#ef4444", "⚠️ Remote Desktop": "#f97316",
    "Other": "#94a3b8",
};

const SYS_COLORS = {
    AGENT_STARTED: "#059669", SYSTEM_SHUTDOWN: "#DC2626", SYSTEM_RESTART: "#D97706",
    LAPTOP_SLEEP: "#2563EB", WAKE_FROM_SLEEP: "#059669",
    SCREEN_LOCKED: "#7C3AED", SCREEN_UNLOCKED: "#7C3AED", AGENT_STOPPED: "#DC2626",
};
const SYS_LABELS = {
    AGENT_STARTED: "🟢 Login", SYSTEM_SHUTDOWN: "🔴 Shutdown",
    SYSTEM_RESTART: "🟠 Restart", LAPTOP_SLEEP: "🔵 Sleep",
    WAKE_FROM_SLEEP: "🟢 Wake", SCREEN_LOCKED: "🟣 Locked",
    SCREEN_UNLOCKED: "🟣 Unlocked",
};

function fmt(sec) {
    if (!sec || sec < 0) return "0s";
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60), rm = m % 60;
    return `${h}h ${rm}m`;
}

export default function DeviceDetailPage({ params }) {
    const { id } = use(params);
    const router = useRouter();
    const { role, loading } = useCoworkAuth();

    const [device, setDevice] = useState(null);
    const [activity, setActivity] = useState([]);
    const [systemEvents, setSystemEvents] = useState([]);
    const [currentApp, setCurrentApp] = useState(null);
    const [liveSeconds, setLiveSeconds] = useState(0);
    const [totalTime, setTotalTime] = useState(0);

    // ── Screenshot state ──
    const [screenshot, setScreenshot] = useState(null);
    const [screenshotLoading, setScreenshotLoading] = useState(false);
    const [screenshotMode, setScreenshotMode] = useState(false);
    const [screenshotPaused, setScreenshotPaused] = useState(false);
    const [countdown, setCountdown] = useState(10);
    const screenshotIntervalRef = useRef(null);
    const countdownIntervalRef = useRef(null);

    const [expandedApps, setExpandedApps] = useState({});
    const [totalView, setTotalView] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [activeTab, setActiveTab] = useState("history");

    const todayStr = new Date().toISOString().split("T")[0];
    const [selectedDate, setSelectedDate] = useState(todayStr);

    useEffect(() => {
        if (!loading && role && role !== "ceo") router.replace("/coworking");
    }, [role, loading, router]);

    useEffect(() => {
        return onSnapshot(doc(omDb, "devices", id), (snap) => {
            if (snap.exists()) setDevice(snap.data());
        });
    }, [id]);

    useEffect(() => {
        if (!selectedDate) return;
        const q = query(collection(omDb, "activity", id, "logs"), where("date", "==", selectedDate), orderBy("timestamp", "desc"), limit(500));
        const unsub = onSnapshot(q, (snap) => {
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setActivity(rows);
            setTotalTime(rows.reduce((sum, r) => sum + (r.durationSec || 0), 0));
        });
        return () => unsub();
    }, [id, selectedDate]);

    useEffect(() => {
        if (!selectedDate) return;
        const q = query(collection(omDb, "system_events", id, "logs"), where("date", "==", selectedDate), orderBy("timestamp", "desc"), limit(50));
        const unsub = onSnapshot(q, (snap) => { setSystemEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); });
        return () => unsub();
    }, [id, selectedDate]);

    useEffect(() => {
        return onSnapshot(doc(omDb, "current_activity", id), (snap) => {
            if (snap.exists() && snap.data().isActive) {
                const updatedAt = snap.data().updatedAt?.toDate?.();
                if (updatedAt && Date.now() - updatedAt.getTime() > 15000) { setCurrentApp(null); return; }
                setCurrentApp(snap.data());
                const start = snap.data().startTime?.toDate?.();
                if (start) setLiveSeconds(Math.floor((Date.now() - start.getTime()) / 1000));
            } else { setCurrentApp(null); setLiveSeconds(0); }
        });
    }, [id]);

    // Fix: auto-refresh live data on window focus / tab switch back
    useEffect(() => {
        const handleFocus = () => {
            const ref = doc(omDb, "current_activity", id)
            import("firebase/firestore").then(({ getDoc }) => {
                getDoc(ref).then(snap => {
                    if (snap.exists() && snap.data().isActive) {
                        const data = snap.data()
                        const updatedAt = data.updatedAt?.toDate?.()
                        const diff = updatedAt ? Date.now() - updatedAt.getTime() : 999999
                        if (diff < 15000) {
                            setCurrentApp(data)
                            const start = data.startTime?.toDate?.()
                            if (start) setLiveSeconds(Math.floor((Date.now() - start.getTime()) / 1000))
                        } else {
                            setCurrentApp(null)
                            setLiveSeconds(0)
                        }
                    } else {
                        setCurrentApp(null)
                        setLiveSeconds(0)
                    }
                })
            })
        }
        window.addEventListener("focus", handleFocus)
        const handleVisibility = () => {
            if (document.visibilityState === "visible") handleFocus()
        }
        document.addEventListener("visibilitychange", handleVisibility)
        return () => {
            window.removeEventListener("focus", handleFocus)
            document.removeEventListener("visibilitychange", handleVisibility)
        }
    }, [id])


    // Track previous screenshot for auto-delete — use ref so listener always sees latest value
    const prevScreenshotRef = useRef(null);
    const isDeletingRef = useRef(false); // prevent delete loop

    const deleteScreenshotFromCloudinary = async (publicId, docId) => {
        if (!publicId || !docId) return;
        try {
            const res = await fetch("/api/delete-screenshot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ publicId }),
            });
            const json = await res.json();
            console.log("[OM] Cloudinary delete:", publicId, "→", json.result);
        } catch (e) {
            console.error("[OM] Cloudinary delete failed:", e);
        }
        try {
            const { deleteDoc, doc: fdoc } = await import("firebase/firestore");
            await deleteDoc(fdoc(omDb, "screenshots", id, "logs", docId));
            console.log("[OM] Firestore doc deleted:", docId);
        } catch (e) {
            console.error("[OM] Firestore delete failed:", e);
        }
    };

    useEffect(() => {
        const q = query(collection(omDb, "screenshots", id, "logs"), orderBy("timestamp", "desc"), limit(1));
        return onSnapshot(q, async (snap) => {
            // If empty (doc was just deleted by us) — ignore
            if (snap.empty) return;

            const docId = snap.docs[0].id;
            const data = snap.docs[0].data();

            // Skip if this is the same doc we already have
            if (prevScreenshotRef.current?.docId === docId) {
                // Same doc — just update UI if not loaded yet
                if (data.imageUrl) {
                    setScreenshot({ url: data.imageUrl, publicId: data.publicId, docId, time: data.timestamp?.toDate?.() });
                    setScreenshotLoading(false);
                }
                return;
            }

            // New screenshot arrived — delete the previous one
            const prev = prevScreenshotRef.current;

            // Set new as current immediately
            const incoming = { url: data.imageUrl, publicId: data.publicId, docId, time: data.timestamp?.toDate?.() };
            prevScreenshotRef.current = incoming;
            setScreenshot(incoming);
            setScreenshotLoading(false);

            // Now delete previous (after updating state so UI doesn't flicker)
            if (prev && !isDeletingRef.current) {
                isDeletingRef.current = true;
                await deleteScreenshotFromCloudinary(prev.publicId, prev.docId);
                isDeletingRef.current = false;
            }
        });
    }, [id]);

    // ── Screenshot functions ──
    const sendScreenshotCommand = async () => {
        await setDoc(doc(omDb, "commands", id), {
            command: "screenshot", status: "pending", machineId: id, timestamp: new Date()
        });
    };

    const startIntervals = () => {
        screenshotIntervalRef.current = setInterval(async () => {
            setScreenshotLoading(true);
            await sendScreenshotCommand();
            setCountdown(10);
        }, 10000);
        countdownIntervalRef.current = setInterval(() => {
            setCountdown(prev => prev <= 1 ? 10 : prev - 1);
        }, 1000);
    };

    const stopIntervals = () => {
        if (screenshotIntervalRef.current) clearInterval(screenshotIntervalRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };

    const startScreenshotMode = async () => {
        setScreenshotMode(true);
        setScreenshotPaused(false);
        setScreenshotLoading(true);
        setCountdown(10);
        await sendScreenshotCommand();
        startIntervals();
    };

    const pauseScreenshot = () => {
        setScreenshotPaused(true);
        stopIntervals();
    };

    const resumeScreenshot = () => {
        setScreenshotPaused(false);
        setCountdown(10);
        startIntervals();
    };

    const saveScreenshot = () => {
        if (!screenshot?.url) return;
        // Force download by fetching as blob
        fetch(screenshot.url)
            .then(res => res.blob())
            .then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `screenshot_${id}_${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
                a.click();
                URL.revokeObjectURL(url);
            })
            .catch(() => {
                // Fallback: open in new tab
                window.open(screenshot.url, "_blank");
            });
    };

    const closeScreenshot = async () => {
        stopIntervals();
        setScreenshotMode(false);
        setScreenshotPaused(false);
        setCountdown(10);
        const cur = prevScreenshotRef.current || screenshot;
        prevScreenshotRef.current = null;
        setScreenshot(null);
        setScreenshotLoading(false);
        if (cur) await deleteScreenshotFromCloudinary(cur.publicId, cur.docId);
    };

    // cleanup on unmount — stop intervals and delete any remaining screenshot
    useEffect(() => {
        return () => {
            stopIntervals();
            const cur = prevScreenshotRef.current;
            if (cur) {
                // Fire and forget delete on unmount
                fetch("/api/delete-screenshot", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ publicId: cur.publicId }),
                }).catch(() => { });
            }
        };
    }, []);

    // ── Group activity ──
    const groupedApps = {};
    activity.forEach((row) => {
        const key = row.siteLabel || row.url || "Unknown";
        if (!groupedApps[key]) groupedApps[key] = { siteLabel: key, category: row.category, totalSec: 0, sessions: [], count: 0 };
        groupedApps[key].totalSec += row.durationSec || 0;
        groupedApps[key].count += 1;
        groupedApps[key].sessions.push(row);
    });
    const sortedApps = Object.values(groupedApps).sort((a, b) => b.totalSec - a.totalSec);

    const categoryTotals = {};
    activity.forEach((row) => {
        const cat = row.category || "Other";
        categoryTotals[cat] = (categoryTotals[cat] || 0) + (row.durationSec || 0);
    });
    // ── Build session timeline ──
    const buildTimeline = () => {
        const allEvents = [
            ...activity.map(a => ({
                type: 'activity',
                time: a.startTime?.toDate?.() || new Date(0),
                data: a
            })),
            ...systemEvents.map(s => ({
                type: 'system',
                time: s.timestamp?.toDate?.() || new Date(0),
                data: s
            }))
        ].sort((a, b) => a.time - b.time)

        const sessions = []
        let current = null

        for (const evt of allEvents) {
            if (evt.type === 'system' && evt.data.event === 'AGENT_STARTED') {
                current = { loginTime: evt.time, activities: [], logoutTime: null, logoutType: null }
                sessions.push(current)
            } else if (evt.type === 'system' &&
                (evt.data.event === 'SYSTEM_SHUTDOWN' || evt.data.event === 'SYSTEM_RESTART' || evt.data.event === 'LAPTOP_SLEEP')) {
                if (current) {
                    current.logoutTime = evt.time
                    current.logoutType = evt.data.event
                }
                current = null
            } else if (evt.type === 'activity') {
                if (!current) {
                    current = { loginTime: evt.time, activities: [], logoutTime: null, logoutType: null, implicit: true }
                    sessions.push(current)
                }
                current.activities.push(evt.data)
            }
        }
        return sessions
    }

    const timeline = buildTimeline()

    const isToday = selectedDate === todayStr;

    const downloadWordReport = async () => {
        setDownloading(true);
        try {
            const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } = await import("docx");
            const { saveAs } = await import("file-saver");
            const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
            const borders = { top: border, bottom: border, left: border, right: border };
            const children = [
                new Paragraph({ children: [new TextRun({ text: "Usage History Report", bold: true, size: 36, font: "Arial" })], spacing: { after: 200 } }),
                new Paragraph({ children: [new TextRun({ text: `Employee: ${device?.customName || id}   |   Date: ${selectedDate}   |   Total: ${fmt(totalTime)}`, size: 22, font: "Arial", color: "666666" })], spacing: { after: 400 } }),
                new Table({
                    width: { size: 9360, type: WidthType.DXA }, columnWidths: [4000, 2680, 2680],
                    rows: [
                        new TableRow({ children: ["App / Website", "Total Time", "Times Opened"].map((t) => new TableCell({ borders, shading: { fill: "1a1a24", type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 20, font: "Arial", color: "ffffff" })] })] })) }),
                        ...sortedApps.map((app) => new TableRow({ children: [app.siteLabel, fmt(app.totalSec), String(app.count)].map((t) => new TableCell({ borders, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: t, size: 20, font: "Arial" })] })] })) })),
                    ],
                }),
                new Paragraph({ children: [], spacing: { after: 300 } }),
            ];
            sortedApps.forEach((app) => {
                children.push(new Paragraph({ children: [new TextRun({ text: `${app.siteLabel}  (${fmt(app.totalSec)}, ${app.count}×)`, bold: true, size: 22, font: "Arial" })], spacing: { before: 200, after: 80 } }));
                app.sessions.forEach((s) => children.push(new Paragraph({ children: [new TextRun({ text: `  > ${s.startTime?.toDate?.()?.toLocaleTimeString() || "-"} – ${s.endTime?.toDate?.()?.toLocaleTimeString() || "-"}  (${fmt(s.durationSec)})${s.pageTitle && s.pageTitle !== app.siteLabel ? "  — " + s.pageTitle : ""}`, size: 18, font: "Arial", color: "666666" })], spacing: { after: 40 } })));
            });
            const doc2 = new Document({ sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }] });
            saveAs(await Packer.toBlob(doc2), `Report_${device?.customName || id}_${selectedDate}.docx`);
        } catch (e) { console.error(e); }
        setDownloading(false);
    };

    if (loading) return <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF" }}>Loading…</div>;
    const TABS = [
        { id: "history", label: "📋 History" },
        { id: "timeline", label: "📅 Timeline" },
        { id: "raw", label: "📊 Raw Log" },
        { id: "system", label: "🔐 Login / Logout" },
    ]

    return (
        <div style={{ padding: "24px 28px", background: "#F8FAFC", minHeight: "100%" }}>

            {/* ── Header ── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600, cursor: "pointer" }} onClick={() => router.push("/coworking/office-monitor")}>
                            Office Monitor
                        </span>
                        <span style={{ fontSize: 12, color: "#D1D5DB" }}>/</span>
                        <span style={{ fontSize: 12, color: "#6B7280" }}>{device?.customName || id}</span>
                    </div>
                    <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{device?.customName || id}</h1>
                    <p style={{ fontSize: 13, color: "#6B7280" }}>
                        Total tracked: <strong style={{ color: "#111827", fontFamily: "monospace" }}>{fmt(totalTime)}</strong>
                        {device?.ipAddress && <span style={{ marginLeft: 10, color: "#9CA3AF", fontFamily: "monospace", fontSize: 11 }}>{device.ipAddress}</span>}
                    </p>
                </div>

                {/* Tabs + date + screenshot button */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {TABS.map((tab) => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                            padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer",
                            background: activeTab === tab.id ? "#1B4F8A" : "#fff",
                            color: activeTab === tab.id ? "#fff" : "#374151",
                            border: activeTab === tab.id ? "1px solid #1B4F8A" : "1px solid #E5E7EB",
                        }}>{tab.label}</button>
                    ))}
                    <input type="date" value={selectedDate} max={todayStr}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        style={{ padding: "7px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 12, color: "#374151", outline: "none", background: "#fff", fontFamily: "monospace" }}
                    />
                    {isToday && (
                        <button
                            onClick={screenshotMode ? undefined : startScreenshotMode}
                            disabled={screenshotMode}
                            style={{ padding: "7px 14px", background: screenshotMode ? "#F3F4F6" : "#EBF3FE", color: screenshotMode ? "#9CA3AF" : "#1A73E8", border: "1px solid #BFDBFE", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: screenshotMode ? "not-allowed" : "pointer", opacity: screenshotMode ? 0.6 : 1 }}>
                            {screenshotMode ? "📷 Live Mode ON" : "📷 Screenshot"}
                        </button>
                    )}
                </div>
            </div>

            {/* ── Live Now card ── */}
            {currentApp && isToday && (
                <div style={{ background: "#fff", border: `1px solid ${currentApp?.isIdle ? "#FDE68A" : "#A7F3D0"}`, borderLeft: `4px solid ${currentApp?.isIdle ? "#D97706" : "#10B981"}`, borderRadius: 10, padding: "16px 20px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: currentApp?.isIdle ? "#D97706" : "#10B981", boxShadow: currentApp?.isIdle ? "0 0 4px #D97706" : "0 0 4px #10B981" }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: currentApp.isIdle ? "#D97706" : "#059669", letterSpacing: "0.08em" }}>
                                {currentApp.isIdle ? "⏸ IDLE" : "LIVE NOW"}
                            </span>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 2 }}>{currentApp.siteLabel}</div>
                        {currentApp.pageTitle && <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 6 }}>{currentApp.pageTitle}</div>}
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            {currentApp.category && (
                                <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: (CAT_COLORS[currentApp.category] || "#94a3b8") + "18", color: CAT_COLORS[currentApp.category] || "#94a3b8" }}>
                                    {currentApp.category}
                                </span>
                            )}
                            <span style={{ fontSize: 11, color: "#9CA3AF" }}>Started {currentApp.startTime?.toDate?.()?.toLocaleTimeString()}</span>
                        </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
                        <div style={{ fontSize: 36, fontWeight: 800, color: currentApp?.isIdle ? "#D97706" : "#059669", fontFamily: "monospace", letterSpacing: "-2px" }}>{fmt(liveSeconds)}</div>
                        <button
                            onClick={screenshotMode ? undefined : startScreenshotMode}
                            disabled={screenshotMode}
                            style={{ padding: "8px 16px", background: screenshotMode ? "#F3F4F6" : "#EBF3FE", color: screenshotMode ? "#9CA3AF" : "#1A73E8", border: "1px solid #BFDBFE", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: screenshotMode ? "not-allowed" : "pointer", opacity: screenshotMode ? 0.6 : 1 }}>
                            {screenshotMode ? "📷 Live Mode ON" : "📷 Screenshot"}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Screenshot Live Mode Viewer — FULLSCREEN MODAL ── */}
            {(screenshot?.url || screenshotLoading) && screenshotMode && (
                <div style={{
                    position: "fixed", inset: 0, zIndex: 9999,
                    background: "rgba(0,0,0,0.92)",
                    display: "flex", flexDirection: "column",
                }}>
                    {/* Toolbar */}
                    <div style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "12px 20px",
                        background: "#111827",
                        borderBottom: "1px solid #374151",
                        flexShrink: 0,
                    }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", flex: 1 }}>
                            📷 Live Screenshot — {device?.customName || id}
                        </span>
                        {screenshot?.time && (
                            <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "monospace" }}>
                                {screenshot.time?.toLocaleTimeString()}
                            </span>
                        )}
                        {!screenshotPaused && (
                            <span style={{ fontSize: 12, color: "#10B981", fontFamily: "monospace", fontWeight: 700 }}>
                                Next in {countdown}s
                            </span>
                        )}
                        {screenshotPaused && (
                            <span style={{ fontSize: 12, color: "#F59E0B", fontFamily: "monospace", fontWeight: 700 }}>
                                ⏸ Paused
                            </span>
                        )}
                        <button onClick={saveScreenshot} style={{ padding: "6px 14px", background: "#059669", border: "none", color: "#fff", cursor: "pointer", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                            💾 Save
                        </button>
                        <button onClick={screenshotPaused ? resumeScreenshot : pauseScreenshot} style={{ padding: "6px 14px", background: "#1D4ED8", border: "none", color: "#fff", cursor: "pointer", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                            {screenshotPaused ? "▶ Resume" : "⏸ Pause"}
                        </button>
                        <button onClick={closeScreenshot} style={{ padding: "6px 14px", background: "#DC2626", border: "none", color: "#fff", cursor: "pointer", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                            ✕ Close
                        </button>
                    </div>

                    {/* Image area */}
                    <div style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                        {screenshotLoading && !screenshot?.url && (
                            <div style={{ textAlign: "center", color: "#9CA3AF" }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
                                <div style={{ fontSize: 14 }}>Capturing screenshot…</div>
                            </div>
                        )}
                        {screenshot?.url && (
                            <img
                                src={screenshot.url}
                                style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, boxShadow: "0 4px 32px rgba(0,0,0,0.5)" }}
                                alt="Employee screen"
                            />
                        )}
                    </div>
                </div>
            )}

            {/* ── Category chips ── */}

            {Object.keys(categoryTotals).length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                    {Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([cat, sec]) => (
                        <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "#fff", border: "1px solid #E5E7EB", borderLeft: `3px solid ${CAT_COLORS[cat] || "#94a3b8"}`, borderRadius: 8, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
                            <div>
                                <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 1 }}>{cat}</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", fontFamily: "monospace" }}>{fmt(sec)}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ══ HISTORY TAB ══ */}
            {activeTab === "history" && (
                <div style={tableWrap}>
                    <div style={tableHead}>
                        <span style={tableTitle}>📋 App Usage History</span>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            {/* Total view toggle */}
                            <button
                                onClick={() => setTotalView((v) => !v)}
                                style={{
                                    padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                    background: totalView ? "#1B4F8A" : "#F3F4F6",
                                    color: totalView ? "#fff" : "#374151",
                                    border: totalView ? "1px solid #1B4F8A" : "1px solid #E5E7EB",
                                }}>
                                {totalView ? "⊞ Total" : "⊞ Total"}
                            </button>
                            <button onClick={downloadWordReport} disabled={downloading} style={{ padding: "6px 14px", background: downloading ? "#F3F4F6" : "#EBF3FE", color: downloading ? "#9CA3AF" : "#1A73E8", border: "1px solid #BFDBFE", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: downloading ? "not-allowed" : "pointer" }}>
                                {downloading ? "⏳ Generating…" : "📥 Download Word Report"}
                            </button>
                        </div>
                    </div>
                    {sortedApps.length === 0 && !currentApp && <div style={emptyRow}>No activity recorded for {selectedDate}</div>}



                    {/* ── Live in-progress session ── */}
                    {currentApp && isToday && (
                        <div style={{ borderBottom: "1px solid #F3F4F6", background: "#F0FDF4" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 4px #10B981", flexShrink: 0 }} />
                                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{currentApp.siteLabel}</span>
                                    <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 10, background: (CAT_COLORS[currentApp.category] || "#94a3b8") + "18", color: CAT_COLORS[currentApp.category] || "#94a3b8" }}>{currentApp.category}</span>
                                    <span style={{ fontSize: 11, color: "#059669", fontWeight: 600, background: "#D1FAE5", padding: "1px 8px", borderRadius: 20 }}>● In Progress</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: "#059669", fontFamily: "monospace" }}>{fmt(liveSeconds)}</span>
                                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>Started {currentApp.startTime?.toDate?.()?.toLocaleTimeString()}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── TOTAL VIEW — unique content merged inside each app group ── */}
                    {totalView && sortedApps.map((app) => {
                        // Merge sessions by pageTitle
                        const byTitle = {};
                        app.sessions.forEach((s) => {
                            const title = (s.pageTitle && s.pageTitle !== app.siteLabel) ? s.pageTitle : "(no title)";
                            if (!byTitle[title]) byTitle[title] = { title, totalSec: 0, count: 0 };
                            byTitle[title].totalSec += s.durationSec || 0;
                            byTitle[title].count += 1;
                        });
                        const uniqueRows = Object.values(byTitle).sort((a, b) => b.totalSec - a.totalSec);
                        return (
                            <div key={app.siteLabel} style={{ borderBottom: "1px solid #F3F4F6" }}>
                                {/* App header row */}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", background: "#fff" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{app.siteLabel}</span>
                                        <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 10, background: (CAT_COLORS[app.category] || "#94a3b8") + "18", color: CAT_COLORS[app.category] || "#94a3b8" }}>{app.category}</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", fontFamily: "monospace" }}>{fmt(app.totalSec)}</span>
                                        <span style={{ fontSize: 11, color: "#9CA3AF" }}>{app.count}× opened</span>
                                    </div>
                                </div>
                                {/* Unique content rows inside */}
                                <div style={{ background: "#F9FAFB", borderTop: "1px solid #F3F4F6", padding: "4px 0" }}>
                                    {uniqueRows.map((row, i) => (
                                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 18px 7px 42px" }}>
                                            <span style={{ fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 500 }}>
                                                {row.title}
                                            </span>
                                            <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: "#059669", fontFamily: "monospace" }}>{fmt(row.totalSec)}</span>
                                                <span style={{ fontSize: 11, color: "#9CA3AF", minWidth: 60, textAlign: "right" }}>{row.count}× opened</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {/* ── DETAIL VIEW — sessions expandable ── */}
                    {!totalView && sortedApps.map((app) => (
                        <div key={app.siteLabel} style={{ borderBottom: "1px solid #F3F4F6" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", cursor: "pointer", transition: "background 0.1s" }}
                                onClick={() => setExpandedApps((p) => ({ ...p, [app.siteLabel]: !p[app.siteLabel] }))}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ fontSize: 10, color: "#9CA3AF", width: 12 }}>{expandedApps[app.siteLabel] ? "▼" : "▶"}</span>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{app.siteLabel}</span>
                                    <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 10, background: (CAT_COLORS[app.category] || "#94a3b8") + "18", color: CAT_COLORS[app.category] || "#94a3b8" }}>{app.category}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", fontFamily: "monospace" }}>{fmt(app.totalSec)}</span>
                                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>Opened {app.count}×</span>
                                </div>
                            </div>
                            {expandedApps[app.siteLabel] && (
                                <div style={{ background: "#F9FAFB", borderTop: "1px solid #F3F4F6", padding: "6px 0" }}>
                                    {app.sessions.map((s, i) => (
                                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "5px 18px 5px 42px" }}>
                                            <span style={{ fontSize: 13, color: "#D1D5DB" }}>›</span>
                                            <span style={{ fontSize: 11, fontFamily: "monospace", color: "#6B7280", minWidth: 180 }}>
                                                {s.startTime?.toDate?.()?.toLocaleTimeString()} – {s.endTime?.toDate?.()?.toLocaleTimeString()}
                                            </span>
                                            <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "monospace", color: "#059669", minWidth: 60 }}>{fmt(s.durationSec)}</span>
                                            {s.pageTitle && s.pageTitle !== app.siteLabel && (
                                                <span style={{ fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>{s.pageTitle}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                    {/* ── Logout rows ── */}
                    {systemEvents.filter(e => ['SYSTEM_SHUTDOWN', 'SYSTEM_RESTART', 'LAPTOP_SLEEP'].includes(e.event)).map((evt, i) => (
                        <div key={`logout-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", background: evt.event === 'SYSTEM_RESTART' ? "#FFFBEB" : "#FEF2F2", borderTop: "1px solid #FECACA" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: evt.event === 'SYSTEM_RESTART' ? "#D97706" : evt.event === 'LAPTOP_SLEEP' ? "#2563EB" : "#DC2626", flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: evt.event === 'SYSTEM_RESTART' ? "#D97706" : evt.event === 'LAPTOP_SLEEP' ? "#2563EB" : "#DC2626" }}>
                            </span>
                            <span style={{ fontSize: 12, fontFamily: "monospace", color: "#6B7280" }}>{evt.timestamp?.toDate?.()?.toLocaleTimeString()}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* ══ RAW LOG TAB ══ */}
            {activeTab === "raw" && (
                <div style={tableWrap}>
                    <div style={tableHead}>
                        <span style={tableTitle}>📊 Activity Log</span>
                        {isToday && <span style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", fontFamily: "monospace" }}>● LIVE</span>}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr>{["Start", "End", "App / Site", "Tab / File", "Category", "Duration"].map((h) => (
                                    <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>{h}</th>
                                ))}</tr>
                            </thead>
                            <tbody>
                                {activity.map((row) => (
                                    <tr key={row.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                                        <td style={td}>{row.startTime?.toDate?.()?.toLocaleTimeString() || "—"}</td>
                                        <td style={td}>{row.endTime?.toDate?.()?.toLocaleTimeString() || "—"}</td>
                                        <td style={{ ...td, fontWeight: 600, color: "#111827" }}>{row.siteLabel}</td>
                                        <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.pageTitle}</td>
                                        <td style={td}>
                                            <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 11, background: (CAT_COLORS[row.category] || "#94a3b8") + "18", color: CAT_COLORS[row.category] || "#94a3b8" }}>{row.category}</span>
                                        </td>
                                        <td style={{ ...td, fontWeight: 600, fontFamily: "monospace", color: "#111827" }}>{fmt(row.durationSec)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {activity.length === 0 && <div style={emptyRow}>No activity recorded for {selectedDate}</div>}
                </div>
            )}



            {/* ══ TIMELINE TAB ══ */}
            {activeTab === "timeline" && (
                <div style={tableWrap}>
                    <div style={tableHead}>
                        <span style={tableTitle}>📅 Session Timeline</span>
                        <span style={{ fontSize: 11, color: "#9CA3AF" }}>{timeline.length} session{timeline.length !== 1 ? 's' : ''}</span>
                    </div>

                    {timeline.length === 0 && (
                        <div style={emptyRow}>No session data for {selectedDate}</div>
                    )}

                    {timeline.map((session, si) => (
                        <div key={si} style={{ borderBottom: "2px solid #E5E7EB", marginBottom: 4 }}>



                            {/* Activities grouped by app */}
                            {Object.values(
                                session.activities.reduce((acc, row) => {
                                    const key = row.siteLabel || 'Unknown'
                                    if (!acc[key]) acc[key] = { siteLabel: key, category: row.category, totalSec: 0, sessions: [], count: 0 }
                                    acc[key].totalSec += row.durationSec || 0
                                    acc[key].count += 1
                                    acc[key].sessions.push(row)
                                    return acc
                                }, {})
                            ).sort((a, b) => b.totalSec - a.totalSec).map((app) => (
                                <div key={app.siteLabel} style={{ borderBottom: "1px solid #F3F4F6" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", cursor: "pointer" }}
                                        onClick={() => setExpandedApps(p => ({ ...p, [`${si}-${app.siteLabel}`]: !p[`${si}-${app.siteLabel}`] }))}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <span style={{ fontSize: 10, color: "#9CA3AF", width: 12 }}>{expandedApps[`${si}-${app.siteLabel}`] ? "▼" : "▶"}</span>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{app.siteLabel}</span>
                                            <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 10, background: (CAT_COLORS[app.category] || "#94a3b8") + "18", color: CAT_COLORS[app.category] || "#94a3b8" }}>{app.category}</span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", fontFamily: "monospace" }}>{fmt(app.totalSec)}</span>
                                            <span style={{ fontSize: 11, color: "#9CA3AF" }}>Opened {app.count}×</span>
                                        </div>
                                    </div>
                                    {expandedApps[`${si}-${app.siteLabel}`] && (
                                        <div style={{ background: "#F9FAFB", borderTop: "1px solid #F3F4F6", padding: "6px 0" }}>
                                            {app.sessions.map((s, i) => (
                                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "5px 18px 5px 42px" }}>
                                                    <span style={{ fontSize: 13, color: "#D1D5DB" }}>›</span>
                                                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "#6B7280", minWidth: 180 }}>
                                                        {s.startTime?.toDate?.()?.toLocaleTimeString()} – {s.endTime?.toDate?.()?.toLocaleTimeString()}
                                                    </span>
                                                    <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "monospace", color: "#059669", minWidth: 60 }}>{fmt(s.durationSec)}</span>
                                                    {s.pageTitle && s.pageTitle !== app.siteLabel && (
                                                        <span style={{ fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>{s.pageTitle}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {session.activities.length === 0 && (
                                <div style={{ padding: "10px 18px", fontSize: 11, color: "#9CA3AF", fontStyle: "italic" }}>
                                    No activity recorded in this session
                                </div>
                            )}



                            {/* Logout */}
                            {session.logoutTime ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", background: "#FEF2F2", borderTop: "1px solid #FECACA" }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#DC2626", flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>
                                        {session.logoutType === 'SYSTEM_RESTART' ? '🟠 Restart' : session.logoutType === 'LAPTOP_SLEEP' ? '🔵 Sleep' : '🔴 Logout / Shutdown'}
                                    </span>
                                    <span style={{ fontSize: 12, fontFamily: "monospace", color: "#6B7280" }}>{session.logoutTime?.toLocaleTimeString()}</span>
                                    <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: "auto" }}>
                                        Session: {fmt(Math.floor((session.logoutTime - session.loginTime) / 1000))}
                                    </span>
                                </div>
                            ) : (
                                <div tyle={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", background: "#FEF2F2", borderTop: "1px solid #FECACA" }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#DC2626", flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>🔴 Logout / Shutdown</span>
                                    <span style={{ fontSize: 12, fontFamily: "monospace", color: "#6B7280" }}>{device?.lastSeen?.toDate?.()?.toLocaleTimeString()} (last seen)</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {/* ══ SYSTEM EVENTS TAB ══ */}
            {activeTab === "system" && (
                <div style={tableWrap}>
                    <div style={tableHead}><span style={tableTitle}>🔐 Login / Logout History</span></div>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr>{["Time", "Event", "Details"].map((h) => (
                                    <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>{h}</th>
                                ))}</tr>
                            </thead>
                            <tbody>
                                {systemEvents.map((evt) => {
                                    const color = SYS_COLORS[evt.event] || "#6B7280";
                                    return (
                                        <tr key={evt.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                                            <td style={td}>{evt.timestamp?.toDate?.()?.toLocaleTimeString()}</td>
                                            <td style={td}>
                                                <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: color + "18", color }}>{SYS_LABELS[evt.event] || evt.event}</span>
                                            </td>
                                            <td style={{ ...td, color: "#6B7280" }}>{evt.details}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {systemEvents.length === 0 && <div style={emptyRow}>No login/logout history for {selectedDate}</div>}
                </div>
            )}
        </div>
    );
}

const tableWrap = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" };
const tableHead = { padding: "12px 18px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff" };
const tableTitle = { fontSize: 13, fontWeight: 600, color: "#374151" };
const td = { padding: "10px 16px", fontSize: 12, color: "#6B7280", fontFamily: "monospace" };
const emptyRow = { padding: "40px 0", textAlign: "center", color: "#9CA3AF", fontSize: 13 };