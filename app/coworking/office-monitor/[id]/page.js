"use client";
import { useEffect, useState, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCoworkAuth } from "../../../../hooks/useCoworkAuth";
import { io } from "socket.io-client";
import { BACKEND, api, d } from "../../../../lib/monitorApi";

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

const WORK_CATS = new Set(["Development", "Work — Document", "Work — Spreadsheet", "Work — Presentation", "Meeting", "Chat", "Email", "AI Tool"])
const PERSONAL_CATS = new Set(["Video", "Entertainment", "Social Media", "Shopping", "⚠️ Terminal", "⚠️ System Tool", "⚠️ Virtual Machine", "⚠️ VPN", "⚠️ Remote Desktop", "⚠️ Screen Recorder"])
function getCatType(cat) { if (WORK_CATS.has(cat)) return 'work'; if (PERSONAL_CATS.has(cat)) return 'personal'; return 'neutral' }

const SYS_COLORS = { AGENT_STARTED: "#059669", SYSTEM_SHUTDOWN: "#DC2626", SYSTEM_RESTART: "#D97706", LAPTOP_SLEEP: "#2563EB", WAKE_FROM_SLEEP: "#059669", SCREEN_LOCKED: "#7C3AED", SCREEN_UNLOCKED: "#7C3AED", AGENT_STOPPED: "#DC2626" };
const SYS_LABELS = { AGENT_STARTED: "🟢 Login", SYSTEM_SHUTDOWN: "🔴 Shutdown", SYSTEM_RESTART: "🟠 Restart", LAPTOP_SLEEP: "🔵 Sleep", WAKE_FROM_SLEEP: "🟢 Wake", SCREEN_LOCKED: "🟣 Locked", SCREEN_UNLOCKED: "🟣 Unlocked" };

function fmt(sec) {
    if (!sec || sec < 0) return "0s";
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60), rm = m % 60;
    return `${h}h ${rm}m`;
}

export default function DeviceDetailPage({ params }) {
    const { id } = use(params)
    const router = useRouter()
    const { role, loading } = useCoworkAuth()
    const [device, setDevice] = useState(null)
    const [activity, setActivity] = useState([])
    const [systemEvents, setSystemEvents] = useState([])
    const [currentApp, setCurrentApp] = useState(null)
    const [liveSeconds, setLiveSeconds] = useState(0)
    const [totalTime, setTotalTime] = useState(0)
    const [screenshot, setScreenshot] = useState(null)
    const [screenshotMode, setScreenshotMode] = useState(false)
    const [screenshotPaused, setScreenshotPaused] = useState(false)
    const [countdown, setCountdown] = useState(2)
    const countdownIntervalRef = useRef(null)
    const screenshotPausedRef = useRef(false)
    useEffect(() => { screenshotPausedRef.current = screenshotPaused }, [screenshotPaused])
    const [expandedApps, setExpandedApps] = useState({})
    const [totalView, setTotalView] = useState(false)
    const [downloading, setDownloading] = useState(false)
    const [activeTab, setActiveTab] = useState("history")
    const [aiLoading, setAiLoading] = useState(false)
    const [analyticsFrom, setAnalyticsFrom] = useState(new Date().toLocaleDateString('sv'))
    const [analyticsTo, setAnalyticsTo] = useState(new Date().toLocaleDateString('sv'))
    const [analyticsData, setAnalyticsData] = useState([])
    const [analyticsLoading, setAnalyticsLoading] = useState(false)
    const todayStr = new Date().toLocaleDateString('sv')
    const [selectedDate, setSelectedDate] = useState(todayStr)
    const selectedDateRef = useRef(todayStr)
    useEffect(() => { selectedDateRef.current = selectedDate }, [selectedDate])

    useEffect(() => { if (!loading && role && role !== "ceo") router.replace("/coworking") }, [role, loading, router])
    useEffect(() => { api.get(`/devices/${id}`).then(setDevice).catch(() => { }) }, [id])
    useEffect(() => {
        if (!selectedDate) return
        api.get(`/activity/${id}?date=${selectedDateRef.current}`).then(rows => {
            setActivity(rows || [])
            setTotalTime((rows || []).reduce((sum, r) => sum + (r.durationSec || 0), 0))
        }).catch(() => { })
    }, [id, selectedDate])
    useEffect(() => {
        if (!selectedDate) return
        api.get(`/system-events/${id}?date=${selectedDateRef.current}`).then(rows => setSystemEvents(rows || [])).catch(() => { })
    }, [id, selectedDate])
    useEffect(() => {
        api.get(`/activity/current/${id}`).then(data => {
            if (data?.isActive && Date.now() - new Date(data.updatedAt).getTime() < 15000) setCurrentApp(data)
        }).catch(() => { })
    }, [id])

    useEffect(() => {
        const socket = io(BACKEND)
        socket.on(`current-activity-${id}`, (data) => {
            if (data?.isActive && Date.now() - new Date(data.updatedAt).getTime() < 15000) setCurrentApp(data)
            else { setCurrentApp(null); setLiveSeconds(0) }
        })
        socket.on(`activity-update-${id}`, (act) => {
            if (act.date === selectedDate) { setActivity(prev => [act, ...prev]); setTotalTime(prev => prev + (act.durationSec || 0)) }
        })
        socket.on(`system-event-${id}`, (evt) => { if (evt.date === selectedDate) setSystemEvents(prev => [evt, ...prev]) })
        socket.on('device-update', (dev) => { if (dev.machineId === id) setDevice(dev) })
        return () => socket.disconnect()
    }, [id, selectedDate])

    useEffect(() => {
        if (!screenshotMode) return
        const socket = io(BACKEND)
        socket.on(`screenshot-live-${id}`, (data) => {
            if (!screenshotPausedRef.current) { setScreenshot({ url: `data:image/jpeg;base64,${data.base64}`, time: data.timestamp ? new Date(data.timestamp) : new Date() }); setCountdown(5) }
        })
        return () => socket.disconnect()
    }, [id, screenshotMode])

    useEffect(() => {
        if (!currentApp?.startTime) { setLiveSeconds(0); return }
        const startMs = new Date(currentApp.startTime).getTime()
        if (isNaN(startMs)) { setLiveSeconds(0); return }
        const calc = () => Math.max(0, Math.floor((Date.now() - startMs) / 1000))
        setLiveSeconds(calc())
        const t = setInterval(() => setLiveSeconds(calc()), 1000)
        return () => clearInterval(t)
    }, [currentApp?.startTime])

    useEffect(() => {
        const handleFocus = () => {
            api.get(`/activity/current/${id}`).then(data => {
                if (data?.isActive && Date.now() - new Date(data.updatedAt).getTime() < 15000) setCurrentApp(data)
                else { setCurrentApp(null); setLiveSeconds(0) }
            }).catch(() => { })
        }
        window.addEventListener("focus", handleFocus)
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") handleFocus() })
        return () => window.removeEventListener("focus", handleFocus)
    }, [id])

    useEffect(() => {
        if (!screenshotMode || screenshotPaused) { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); return }
        countdownIntervalRef.current = setInterval(() => setCountdown(prev => prev <= 1 ? 2 : prev - 1), 1000)
        return () => { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current) }
    }, [screenshotMode, screenshotPaused])

    const openScreenshotMode = () => { setScreenshotMode(true); setScreenshotPaused(false); setCountdown(5); api.patch(`/devices/${id}`, { screenshotMode: true }) }
    const pauseScreenshot = () => setScreenshotPaused(true)
    const resumeScreenshot = () => { setScreenshotPaused(false); setCountdown(2) }
    const closeScreenshot = () => { setScreenshotMode(false); setScreenshotPaused(false); setScreenshot(null); api.patch(`/devices/${id}`, { screenshotMode: false }) }
    const saveScreenshot = () => {
        if (!screenshot?.url) return
        fetch(screenshot.url).then(r => r.blob()).then(blob => {
            const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url
            a.download = `screenshot_${id}_${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`; a.click(); URL.revokeObjectURL(url)
        }).catch(() => window.open(screenshot.url, "_blank"))
    }

    // Productivity calculations
    const workTime = activity.filter(r => getCatType(r.category) === 'work').reduce((s, r) => s + (r.durationSec || 0), 0)
    const personalTime = activity.filter(r => getCatType(r.category) === 'personal').reduce((s, r) => s + (r.durationSec || 0), 0)
    const neutralTime = totalTime - workTime - personalTime
    const productivityScore = totalTime > 0 ? Math.round((workTime / totalTime) * 100) : 0
    const scoreColor = productivityScore >= 70 ? "#059669" : productivityScore >= 40 ? "#D97706" : "#DC2626"
    const scoreLabel = productivityScore >= 70 ? "🟢 Productive" : productivityScore >= 40 ? "🟡 Moderate" : "🔴 Low"

    const groupedApps = {}
    activity.forEach(row => {
        const key = row.siteLabel || "Unknown"
        if (!groupedApps[key]) groupedApps[key] = { siteLabel: key, category: row.category, totalSec: 0, sessions: [], count: 0 }
        groupedApps[key].totalSec += row.durationSec || 0; groupedApps[key].count += 1; groupedApps[key].sessions.push(row)
    })
    const sortedApps = Object.values(groupedApps).sort((a, b) => b.totalSec - a.totalSec)
    const categoryTotals = {}
    activity.forEach(row => { const cat = row.category || "Other"; categoryTotals[cat] = (categoryTotals[cat] || 0) + (row.durationSec || 0) })

    const buildTimeline = () => {
        const allEvents = [...activity.map(a => ({ type: 'activity', time: new Date(a.startTime || 0), data: a })), ...systemEvents.map(s => ({ type: 'system', time: new Date(s.timestamp || 0), data: s }))].sort((a, b) => a.time - b.time)
        const sessions = []; let current = null
        for (const evt of allEvents) {
            if (evt.type === 'system' && evt.data.event === 'AGENT_STARTED') { current = { loginTime: evt.time, activities: [], logoutTime: null, logoutType: null }; sessions.push(current) }
            else if (evt.type === 'system' && ['SYSTEM_SHUTDOWN', 'SYSTEM_RESTART', 'LAPTOP_SLEEP'].includes(evt.data.event)) { if (current) { current.logoutTime = evt.time; current.logoutType = evt.data.event } current = null }
            else if (evt.type === 'activity') { if (!current) { current = { loginTime: evt.time, activities: [], logoutTime: null, logoutType: null, implicit: true }; sessions.push(current) } current.activities.push(evt.data) }
        }
        return sessions
    }
    const timeline = buildTimeline()
    const isToday = selectedDate === todayStr
    const liveCardColor = currentApp ? (getCatType(currentApp.category) === 'personal' ? { border: "#FCA5A5", left: "#DC2626" } : getCatType(currentApp.category) === 'work' ? { border: "#A7F3D0", left: "#10B981" } : { border: "#E5E7EB", left: "#9CA3AF" }) : { border: "#A7F3D0", left: "#10B981" }

    // ── Analytics helpers ─────────────────────────────────────────
    const getDatesInRange = (from, to) => {
        const dates = []
        const cur = new Date(from)
        const end = new Date(to)
        while (cur <= end) { dates.push(cur.toLocaleDateString('sv')); cur.setDate(cur.getDate() + 1) }
        return dates
    }

    const loadAnalytics = async () => {
        setAnalyticsLoading(true)
        try {
            const dates = getDatesInRange(analyticsFrom, analyticsTo)
            const results = await Promise.all(dates.map(date => api.get(`/activity/${id}?date=${date}`).catch(() => [])))
            setAnalyticsData(results.flat().filter(Boolean))
        } catch (e) { console.error(e) }
        setAnalyticsLoading(false)
    }

    // Analytics calculations
    const aTotal = analyticsData.reduce((s, r) => s + (r.durationSec || 0), 0)
    const aWork = analyticsData.filter(r => getCatType(r.category) === 'work').reduce((s, r) => s + (r.durationSec || 0), 0)
    const aPersonal = analyticsData.filter(r => getCatType(r.category) === 'personal').reduce((s, r) => s + (r.durationSec || 0), 0)
    const aNeutral = aTotal - aWork - aPersonal
    const aScore = aTotal > 0 ? Math.round((aWork / aTotal) * 100) : 0
    const aScoreColor = aScore >= 70 ? "#059669" : aScore >= 40 ? "#D97706" : "#DC2626"
    const aScoreLabel = aScore >= 70 ? "🟢 Productive" : aScore >= 40 ? "🟡 Moderate" : "🔴 Low"

    // Top apps for bar chart
    const aAppMap = {}
    analyticsData.forEach(r => {
        const k = r.siteLabel || 'Unknown'
        if (!aAppMap[k]) aAppMap[k] = { siteLabel: k, category: r.category, sec: 0, count: 0 }
        aAppMap[k].sec += r.durationSec || 0
        aAppMap[k].count += 1
    })
    const aTopApps = Object.values(aAppMap).sort((a, b) => b.sec - a.sec).slice(0, 12)

    // Category breakdown
    const aCatMap = {}
    analyticsData.forEach(r => {
        const c = r.category || 'Other'
        aCatMap[c] = (aCatMap[c] || 0) + (r.durationSec || 0)
    })
    const aCats = Object.entries(aCatMap).sort((a, b) => b[1] - a[1])

    // Pie chart (conic-gradient)
    const wPct = aTotal > 0 ? Math.round((aWork / aTotal) * 100) : 0
    const nPct = aTotal > 0 ? Math.round((aNeutral / aTotal) * 100) : 0
    const pPct = 100 - wPct - nPct
    const pieGradient = `conic-gradient(#10B981 0% ${wPct}%, #CBD5E1 ${wPct}% ${wPct + nPct}%, #EF4444 ${wPct + nPct}% 100%)`

    const downloadWordReport = async () => {
        setDownloading(true)
        try {
            const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, ExternalHyperlink } = await import("docx")
            const { saveAs } = await import("file-saver")
            const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }
            const borders = { top: border, bottom: border, left: border, right: border }
            const children = [
                new Paragraph({ children: [new TextRun({ text: "Usage History Report", bold: true, size: 36, font: "Arial" })], spacing: { after: 200 } }),
                new Paragraph({ children: [new TextRun({ text: `Employee: ${device?.customName || id}   |   Date: ${selectedDate}   |   Total: ${fmt(totalTime)}   |   Productivity: ${productivityScore}%  ${scoreLabel}`, size: 22, font: "Arial", color: "666666" })], spacing: { after: 400 } }),
                new Table({
                    width: { size: 9360, type: WidthType.DXA }, columnWidths: [4000, 2680, 2680],
                    rows: [
                        new TableRow({ children: ["App / Website", "Total Time", "Times Opened"].map(t => new TableCell({ borders, shading: { fill: "1a1a24", type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 20, font: "Arial", color: "ffffff" })] })] })) }),
                        ...sortedApps.map(app => {
                            const isPersonal = getCatType(app.category) === 'personal'
                            const isWork = getCatType(app.category) === 'work'
                            const rowFill = isPersonal ? 'FDECEA' : isWork ? 'F0FDF4' : 'FFFFFF'
                            const textColor = isPersonal ? 'C0392B' : isWork ? '059669' : '111827'
                            return new TableRow({
                                children: [
                                    new TableCell({ borders, width: { size: 4000, type: WidthType.DXA }, shading: { fill: rowFill, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: `${isPersonal ? '🔴 ' : isWork ? '🟢 ' : ''}${app.siteLabel}`, size: 20, font: 'Arial', color: textColor, bold: isPersonal })] })] }),
                                    new TableCell({ borders, width: { size: 2680, type: WidthType.DXA }, shading: { fill: rowFill, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: fmt(app.totalSec), size: 20, font: 'Arial', color: textColor, bold: isPersonal })] })] }),
                                    new TableCell({ borders, width: { size: 2680, type: WidthType.DXA }, shading: { fill: rowFill, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: String(app.count), size: 20, font: 'Arial', color: textColor, bold: isPersonal })] })] }),
                                ]
                            })
                        }),
                    ],
                }),
                new Paragraph({ children: [], spacing: { after: 300 } }),
            ]
            sortedApps.forEach(app => {
                children.push(new Paragraph({ children: [new TextRun({ text: `${app.siteLabel}  (${fmt(app.totalSec)}, ${app.count}×)`, bold: true, size: 22, font: "Arial" })], spacing: { before: 200, after: 80 } }))
                app.sessions.forEach(s => children.push(new Paragraph({ children: [new TextRun({ text: `  > ${d(s.startTime)?.toLocaleTimeString() || "-"} – ${d(s.endTime)?.toLocaleTimeString() || "-"}  (${fmt(s.durationSec)})${s.pageTitle && s.pageTitle !== app.siteLabel ? "  — " + s.pageTitle : ""}`, size: 18, font: "Arial", color: "666666" })], spacing: { after: 40 } })))
            })
            const doc2 = new Document({ sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }] })
            saveAs(await Packer.toBlob(doc2), `Report_${device?.customName || id}_${selectedDate}.docx`)
        } catch (e) { console.error(e) }
        setDownloading(false)
    }

    // ← FIX: downloadAiReport had broken bracket structure
    // doc2, saveAs, and last 2 paragraphs were floating outside children[]
    const downloadAiReport = async () => {
        setAiLoading(true)
        try {
            const descriptions = await api.get(`/ai-descriptions/${id}?date=${selectedDateRef.current}`)
            if (!descriptions || descriptions.length === 0) {
                alert('No AI analysis available for this date yet.\nRun the Python analyzer script first.')
                setAiLoading(false)
                return
            }
            const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
                WidthType, BorderStyle, ShadingType, ExternalHyperlink } = await import("docx")
            const { saveAs } = await import("file-saver")
            const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }
            const borders = { top: border, bottom: border, left: border, right: border }
            const children = [
                new Paragraph({
                    children: [new TextRun({ text: "AI Activity Analysis Report", bold: true, size: 40, font: "Arial" })],
                    spacing: { after: 120 }
                }),
                new Paragraph({
                    children: [new TextRun({ text: `Employee: ${device?.customName || id}   |   Date: ${selectedDateRef.current}   |   ${descriptions.length} screenshots analyzed`, size: 22, font: "Arial", color: "666666" })],
                    spacing: { after: 400 }
                }),
                new Table({
                    width: { size: 9360, type: WidthType.DXA },
                    columnWidths: [1800, 5760, 1800],
                    rows: [
                        new TableRow({
                            children: ["Time", "AI Description", "Screenshot Link"].map(h =>
                                new TableCell({
                                    borders,
                                    shading: { fill: "1a1a24", type: ShadingType.CLEAR },
                                    margins: { top: 80, bottom: 80, left: 120, right: 120 },
                                    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20, font: "Arial", color: "ffffff" })] })]
                                })
                            )
                        }),
                        ...descriptions.map((desc, i) => {
                            const timeStr = desc.takenAt
                                ? new Date(desc.takenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                : '—'
                            const fillColor = i % 2 === 0 ? "FFFFFF" : "F9FAFB"
                            const fileId = desc.downloadUrl?.match(/id=([^&]+)/)?.[1]
                            const viewUrl = fileId ? `https://drive.google.com/file/d/${fileId}/view` : desc.downloadUrl
                            return new TableRow({
                                children: [
                                    new TableCell({
                                        borders, shading: { fill: fillColor, type: ShadingType.CLEAR },
                                        margins: { top: 80, bottom: 80, left: 120, right: 120 },
                                        children: [new Paragraph({ children: [new TextRun({ text: timeStr, size: 18, font: "Arial", color: "374151" })] })]
                                    }),
                                    new TableCell({
                                        borders, shading: { fill: fillColor, type: ShadingType.CLEAR },
                                        margins: { top: 80, bottom: 80, left: 120, right: 120 },
                                        children: [new Paragraph({ children: [new TextRun({ text: desc.description || '—', size: 18, font: "Arial", color: "111827" })] })]
                                    }),
                                    new TableCell({
                                        borders, shading: { fill: fillColor, type: ShadingType.CLEAR },
                                        margins: { top: 80, bottom: 80, left: 120, right: 120 },
                                        children: [new Paragraph({
                                            children: (() => {
                                                const urls = desc.allUrls || (desc.downloadUrl ? [desc.downloadUrl] : [])
                                                if (!urls.length) return [new TextRun({ text: "—", size: 18, font: "Arial" })]
                                                return urls.map((u, idx) => {
                                                    const fid = u?.match(/id=([^&]+)/)?.[1]
                                                    const vUrl = fid ? `https://drive.google.com/file/d/${fid}/view` : u
                                                    return new ExternalHyperlink({
                                                        link: vUrl,
                                                        children: [new TextRun({
                                                            text: `📷 ${idx + 1}  `,
                                                            size: 18, font: "Arial", color: "1A73E8",
                                                            underline: { type: "single" }
                                                        })]
                                                    })
                                                })
                                            })()
                                        })]
                                    }),
                                ]
                            })
                        })
                    ]
                }),
                new Paragraph({ children: [], spacing: { after: 200 } }),
                new Paragraph({
                    children: [new TextRun({ text: `Generated by Office Monitor AI — ${new Date().toLocaleString()}`, size: 16, font: "Arial", color: "9CA3AF" })]
                })
            ]
            const doc2 = new Document({ sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }] })
            saveAs(await Packer.toBlob(doc2), `AI_Analysis_${device?.customName || id}_${selectedDateRef.current}.docx`)
        } catch (e) { console.error(e); alert('Error: ' + e.message) }
        setAiLoading(false)
    }

    if (loading) return <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF" }}>Loading…</div>

    const TABS = [{ id: "history", label: "📋 History" }, { id: "timeline", label: "📅 Timeline" }, { id: "raw", label: "📊 Raw Log" }, { id: "system", label: "🔐 Login / Logout" }, { id: "analytics", label: "📈 Analytics" }]

    return (
        <div style={{ padding: "24px 28px", background: "#F8FAFC", minHeight: "100%" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600, cursor: "pointer" }} onClick={() => router.push("/coworking/office-monitor")}>Office Monitor</span>
                        <span style={{ fontSize: 12, color: "#D1D5DB" }}>/</span>
                        <span style={{ fontSize: 12, color: "#6B7280" }}>{device?.customName || id}</span>
                    </div>
                    <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{device?.customName || id}</h1>
                    <p style={{ fontSize: 13, color: "#6B7280" }}>
                        Total tracked: <strong style={{ color: "#111827", fontFamily: "monospace" }}>{fmt(totalTime)}</strong>
                        {device?.ipAddress && <span style={{ marginLeft: 10, color: "#9CA3AF", fontFamily: "monospace", fontSize: 11 }}>{device.ipAddress}</span>}
                    </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", background: activeTab === tab.id ? "#1B4F8A" : "#fff", color: activeTab === tab.id ? "#fff" : "#374151", border: activeTab === tab.id ? "1px solid #1B4F8A" : "1px solid #E5E7EB" }}>{tab.label}</button>
                    ))}
                    <input type="date" value={selectedDate} max={todayStr} onChange={e => setSelectedDate(e.target.value)} style={{ padding: "7px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 12, color: "#374151", outline: "none", background: "#fff", fontFamily: "monospace" }} />
                    <button onClick={downloadAiReport} disabled={aiLoading} style={{ padding: "7px 14px", background: aiLoading ? "#F3F4F6" : "#F0FDF4", color: aiLoading ? "#9CA3AF" : "#059669", border: `1px solid ${aiLoading ? "#E5E7EB" : "#A7F3D0"}`, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: aiLoading ? "not-allowed" : "pointer" }}>
                        {aiLoading ? "⏳ Generating…" : "🤖 AI Analysis"}
                    </button>
                    {isToday && (
                        <button onClick={screenshotMode ? closeScreenshot : openScreenshotMode} style={{ padding: "7px 14px", background: screenshotMode ? "#FEE2E2" : "#EBF3FE", color: screenshotMode ? "#DC2626" : "#1A73E8", border: `1px solid ${screenshotMode ? "#FECACA" : "#BFDBFE"}`, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                            {screenshotMode ? "✕ Close Live View" : "📷 Live View"}
                        </button>
                    )}
                </div>
            </div>

            {/* Productivity Score Card */}
            {totalTime > 0 && (
                <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderLeft: `4px solid ${scoreColor}`, borderRadius: 10, padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", marginBottom: 2 }}>PRODUCTIVITY</div>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                                <span style={{ fontSize: 36, fontWeight: 800, color: scoreColor, fontFamily: "monospace", lineHeight: 1 }}>{productivityScore}%</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: scoreColor }}>{scoreLabel}</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 24 }}>
                            <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2 }}>🟢 Work</div><div style={{ fontSize: 15, fontWeight: 700, color: "#059669", fontFamily: "monospace" }}>{fmt(workTime)}</div></div>
                            <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2 }}>⬜ Neutral</div><div style={{ fontSize: 15, fontWeight: 700, color: "#9CA3AF", fontFamily: "monospace" }}>{fmt(neutralTime)}</div></div>
                            <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2 }}>🔴 Personal</div><div style={{ fontSize: 15, fontWeight: 700, color: "#DC2626", fontFamily: "monospace" }}>{fmt(personalTime)}</div></div>
                        </div>
                    </div>
                    <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ display: "flex", height: "100%" }}>
                            <div style={{ width: `${totalTime > 0 ? (workTime / totalTime) * 100 : 0}%`, background: "#10B981", transition: "width 0.5s" }} />
                            <div style={{ width: `${totalTime > 0 ? (neutralTime / totalTime) * 100 : 0}%`, background: "#E5E7EB" }} />
                            <div style={{ width: `${totalTime > 0 ? (personalTime / totalTime) * 100 : 0}%`, background: "#EF4444", transition: "width 0.5s" }} />
                        </div>
                    </div>
                </div>
            )}

            {/* Live Now */}
            {currentApp && isToday && (
                <div style={{ background: "#fff", border: `1px solid ${liveCardColor.border}`, borderLeft: `4px solid ${liveCardColor.left}`, borderRadius: 10, padding: "16px 20px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: liveCardColor.left, boxShadow: `0 0 4px ${liveCardColor.left}` }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: liveCardColor.left, letterSpacing: "0.08em" }}>
                                {currentApp.isIdle ? "⏸ IDLE" : getCatType(currentApp.category) === 'personal' ? "🔴 LIVE — NON-WORK" : "LIVE NOW"}
                            </span>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 2 }}>{currentApp.siteLabel}</div>
                        {currentApp.pageTitle && <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 6 }}>{currentApp.pageTitle}</div>}
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            {currentApp.category && <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: (CAT_COLORS[currentApp.category] || "#94a3b8") + "18", color: CAT_COLORS[currentApp.category] || "#94a3b8" }}>{getCatType(currentApp.category) === 'personal' ? '🔴 ' : getCatType(currentApp.category) === 'work' ? '🟢 ' : ''}{currentApp.category}</span>}
                        </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
                        <div style={{ fontSize: 36, fontWeight: 800, color: liveCardColor.left, fontFamily: "monospace", letterSpacing: "-2px" }}>{fmt(liveSeconds)}</div>
                        <button onClick={screenshotMode ? closeScreenshot : openScreenshotMode} style={{ padding: "8px 16px", background: screenshotMode ? "#FEE2E2" : "#EBF3FE", color: screenshotMode ? "#DC2626" : "#1A73E8", border: `1px solid ${screenshotMode ? "#FECACA" : "#BFDBFE"}`, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                            {screenshotMode ? "✕ Close" : "📷 Live View"}
                        </button>
                    </div>
                </div>
            )}

            {/* Screenshot Live Viewer */}
            {screenshotMode && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", background: "#111827", borderBottom: "1px solid #374151", flexShrink: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", flex: 1 }}>📷 Live View — {device?.customName || id}</span>
                        {screenshot?.time && <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "monospace" }}>{screenshot.time.toLocaleTimeString()}</span>}
                        {!screenshotPaused && <span style={{ fontSize: 12, color: "#10B981", fontFamily: "monospace", fontWeight: 700 }}>Next in {countdown}s</span>}
                        {screenshotPaused && <span style={{ fontSize: 12, color: "#F59E0B", fontFamily: "monospace", fontWeight: 700 }}>⏸ Paused</span>}
                        <button onClick={saveScreenshot} style={{ padding: "6px 14px", background: "#059669", border: "none", color: "#fff", cursor: "pointer", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>💾 Save</button>
                        <button onClick={screenshotPaused ? resumeScreenshot : pauseScreenshot} style={{ padding: "6px 14px", background: "#1D4ED8", border: "none", color: "#fff", cursor: "pointer", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>{screenshotPaused ? "▶ Resume" : "⏸ Pause"}</button>
                        <button onClick={closeScreenshot} style={{ padding: "6px 14px", background: "#DC2626", border: "none", color: "#fff", cursor: "pointer", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>✕ Close</button>
                    </div>
                    <div style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                        {!screenshot?.url && <div style={{ textAlign: "center", color: "#9CA3AF" }}><div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div><div style={{ fontSize: 14 }}>Waiting for screenshot…</div></div>}
                        {screenshot?.url && <img src={screenshot.url} style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, boxShadow: "0 4px 32px rgba(0,0,0,0.5)" }} alt="Employee screen" />}
                    </div>
                </div>
            )}

            {/* Category chips */}
            {Object.keys(categoryTotals).length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                    {Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([cat, sec]) => {
                        const type = getCatType(cat)
                        const chipBg = type === 'personal' ? "#FEF2F2" : type === 'work' ? "#F0FDF4" : "#fff"
                        const chipLeft = type === 'personal' ? '#EF4444' : type === 'work' ? '#10B981' : CAT_COLORS[cat] || "#94a3b8"
                        return (
                            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: chipBg, border: "1px solid #E5E7EB", borderLeft: `3px solid ${chipLeft}`, borderRadius: 8, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
                                <div>
                                    <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 1 }}>{type === 'personal' ? '🔴 ' : type === 'work' ? '🟢 ' : ''}{cat}</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", fontFamily: "monospace" }}>{fmt(sec)}</div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* HISTORY TAB */}
            {activeTab === "history" && (
                <div style={tableWrap}>
                    <div style={tableHead}>
                        <span style={tableTitle}>📋 App Usage History</span>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button onClick={() => setTotalView(v => !v)} style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", background: totalView ? "#1B4F8A" : "#F3F4F6", color: totalView ? "#fff" : "#374151", border: totalView ? "1px solid #1B4F8A" : "1px solid #E5E7EB" }}>⊞ Total</button>
                            <button onClick={downloadWordReport} disabled={downloading} style={{ padding: "6px 14px", background: downloading ? "#F3F4F6" : "#EBF3FE", color: downloading ? "#9CA3AF" : "#1A73E8", border: "1px solid #BFDBFE", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: downloading ? "not-allowed" : "pointer" }}>
                                {downloading ? "⏳ Generating…" : "📥 Download Word Report"}
                            </button>
                        </div>
                    </div>
                    {sortedApps.length === 0 && !currentApp && <div style={emptyRow}>No activity recorded for {selectedDate}</div>}
                    {timeline.map((session, si) => (
                        <div key={si} style={{ borderBottom: "2px solid #E5E7EB", marginBottom: 4 }}>
                            {!totalView && Object.values(session.activities.reduce((acc, row) => {
                                const key = row.siteLabel || 'Unknown'
                                if (!acc[key]) acc[key] = { siteLabel: key, category: row.category, totalSec: 0, sessions: [], count: 0 }
                                acc[key].totalSec += row.durationSec || 0; acc[key].count += 1; acc[key].sessions.push(row); return acc
                            }, {})).sort((a, b) => b.totalSec - a.totalSec).map(app => {
                                const at = getCatType(app.category)
                                const rowBg = at === 'personal' ? '#FFF5F5' : at === 'work' ? '#F0FDF4' : '#fff'
                                const lb = at === 'personal' ? '#EF4444' : at === 'work' ? '#10B981' : '#E5E7EB'
                                return (
                                    <div key={app.siteLabel} style={{ borderBottom: "1px solid #F3F4F6", borderLeft: `3px solid ${lb}`, background: rowBg }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", cursor: "pointer" }} onClick={() => setExpandedApps(p => ({ ...p, [`${si}-${app.siteLabel}`]: !p[`${si}-${app.siteLabel}`] }))}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <span style={{ fontSize: 10, color: "#9CA3AF", width: 12 }}>{expandedApps[`${si}-${app.siteLabel}`] ? "▼" : "▶"}</span>
                                                {at === 'personal' && <span style={{ fontSize: 12 }}>🔴</span>}{at === 'work' && <span style={{ fontSize: 12 }}>🟢</span>}
                                                <span style={{ fontSize: 13, fontWeight: 600, color: at === 'personal' ? '#DC2626' : "#111827" }}>{app.siteLabel}</span>
                                                <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 10, background: (CAT_COLORS[app.category] || "#94a3b8") + "18", color: CAT_COLORS[app.category] || "#94a3b8" }}>{app.category}</span>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                                <span style={{ fontSize: 14, fontWeight: 700, color: at === 'personal' ? '#DC2626' : "#111827", fontFamily: "monospace" }}>{fmt(app.totalSec)}</span>
                                                <span style={{ fontSize: 11, color: "#9CA3AF" }}>Opened {app.count}×</span>
                                            </div>
                                        </div>
                                        {expandedApps[`${si}-${app.siteLabel}`] && (
                                            <div style={{ background: "#F9FAFB", borderTop: "1px solid #F3F4F6", padding: "6px 0" }}>
                                                {app.sessions.map((s, i) => (
                                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "5px 18px 5px 42px" }}>
                                                        <span style={{ fontSize: 13, color: "#D1D5DB" }}>›</span>
                                                        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#6B7280", minWidth: 180 }}>{d(s.startTime)?.toLocaleTimeString()} – {d(s.endTime)?.toLocaleTimeString()}</span>
                                                        <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "monospace", color: "#059669", minWidth: 60 }}>{fmt(s.durationSec)}</span>
                                                        {s.pageTitle && s.pageTitle !== app.siteLabel && <span style={{ fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>{s.pageTitle}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                            {totalView && Object.values(session.activities.reduce((acc, row) => {
                                const key = row.siteLabel || 'Unknown'
                                if (!acc[key]) acc[key] = { siteLabel: key, category: row.category, totalSec: 0, byTitle: {}, count: 0 }
                                acc[key].totalSec += row.durationSec || 0; acc[key].count += 1
                                const title = (row.pageTitle && row.pageTitle !== row.siteLabel) ? row.pageTitle : "(no title)"
                                if (!acc[key].byTitle[title]) acc[key].byTitle[title] = { title, totalSec: 0, count: 0 }
                                acc[key].byTitle[title].totalSec += row.durationSec || 0; acc[key].byTitle[title].count += 1; return acc
                            }, {})).sort((a, b) => b.totalSec - a.totalSec).map(app => {
                                const at = getCatType(app.category)
                                const rowBg = at === 'personal' ? '#FFF5F5' : at === 'work' ? '#F0FDF4' : '#fff'
                                const lb = at === 'personal' ? '#EF4444' : at === 'work' ? '#10B981' : '#E5E7EB'
                                return (
                                    <div key={app.siteLabel} style={{ borderBottom: "1px solid #F3F4F6", borderLeft: `3px solid ${lb}`, background: rowBg }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                {at === 'personal' && <span style={{ fontSize: 12 }}>🔴</span>}{at === 'work' && <span style={{ fontSize: 12 }}>🟢</span>}
                                                <span style={{ fontSize: 13, fontWeight: 600, color: at === 'personal' ? '#DC2626' : "#111827" }}>{app.siteLabel}</span>
                                                <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 10, background: (CAT_COLORS[app.category] || "#94a3b8") + "18", color: CAT_COLORS[app.category] || "#94a3b8" }}>{app.category}</span>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                                <span style={{ fontSize: 14, fontWeight: 700, color: at === 'personal' ? '#DC2626' : "#111827", fontFamily: "monospace" }}>{fmt(app.totalSec)}</span>
                                                <span style={{ fontSize: 11, color: "#9CA3AF" }}>{app.count}× opened</span>
                                            </div>
                                        </div>
                                        <div style={{ background: "#F9FAFB", borderTop: "1px solid #F3F4F6", padding: "4px 0" }}>
                                            {Object.values(app.byTitle).sort((a, b) => b.totalSec - a.totalSec).map((row, i) => (
                                                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 18px 7px 42px" }}>
                                                    <span style={{ fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 500 }}>{row.title}</span>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                                                        <span style={{ fontSize: 13, fontWeight: 700, color: "#059669", fontFamily: "monospace" }}>{fmt(row.totalSec)}</span>
                                                        <span style={{ fontSize: 11, color: "#9CA3AF", minWidth: 60, textAlign: "right" }}>{row.count}× opened</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                            {session.activities.length === 0 && <div style={{ padding: "10px 18px", fontSize: 11, color: "#9CA3AF", fontStyle: "italic" }}>No activity in this session</div>}
                            {!session.logoutTime && currentApp && isToday && si === timeline.length - 1 && (
                                <div style={{ borderBottom: "1px solid #F3F4F6", borderLeft: `3px solid ${liveCardColor.left}`, background: getCatType(currentApp.category) === 'personal' ? '#FFF5F5' : '#F0FDF4' }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: liveCardColor.left, boxShadow: `0 0 4px ${liveCardColor.left}`, flexShrink: 0 }} />
                                            <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{currentApp.siteLabel}</span>
                                            <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 10, background: (CAT_COLORS[currentApp.category] || "#94a3b8") + "18", color: CAT_COLORS[currentApp.category] || "#94a3b8" }}>{currentApp.category}</span>
                                            <span style={{ fontSize: 11, color: liveCardColor.left, fontWeight: 600, background: getCatType(currentApp.category) === 'personal' ? '#FEE2E2' : '#D1FAE5', padding: "1px 8px", borderRadius: 20 }}>● In Progress</span>
                                        </div>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: liveCardColor.left, fontFamily: "monospace" }}>{fmt(liveSeconds)}</span>
                                    </div>
                                </div>
                            )}
                            {session.logoutTime ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", background: "#FEF2F2", borderTop: "1px solid #FECACA" }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#DC2626", flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>{session.logoutType === 'SYSTEM_RESTART' ? '🟠 Restart' : session.logoutType === 'LAPTOP_SLEEP' ? '🔵 Sleep' : '🔴 Logout / Shutdown'}</span>
                                    <span style={{ fontSize: 12, fontFamily: "monospace", color: "#6B7280" }}>{session.logoutTime?.toLocaleTimeString()}</span>
                                    <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: "auto" }}>Session: {fmt(Math.floor((session.logoutTime - session.loginTime) / 1000))}</span>
                                </div>
                            ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", background: "#FEF2F2", borderTop: "1px solid #FECACA" }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#DC2626", flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>🔴 Logout / Shutdown</span>
                                    <span style={{ fontSize: 12, fontFamily: "monospace", color: "#6B7280" }}>{device?.lastSeen ? new Date(device.lastSeen).toLocaleTimeString() : '—'} (last seen)</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* TIMELINE TAB */}
            {activeTab === "timeline" && (
                <div style={tableWrap}>
                    <div style={tableHead}><span style={tableTitle}>📅 Session Timeline</span><span style={{ fontSize: 11, color: "#9CA3AF" }}>{timeline.length} session{timeline.length !== 1 ? 's' : ''}</span></div>
                    {timeline.length === 0 && <div style={emptyRow}>No session data for {selectedDate}</div>}
                    {timeline.map((session, si) => (
                        <div key={si} style={{ borderBottom: "2px solid #E5E7EB", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", background: "#F0FDF4", borderBottom: "1px solid #D1FAE5" }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 4px #10B981", flexShrink: 0 }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>🟢 Login</span>
                                <span style={{ fontSize: 12, fontFamily: "monospace", color: "#059669" }}>{session.loginTime?.toLocaleTimeString()}</span>
                            </div>
                            {session.activities.map((act, ai) => {
                                const color = CAT_COLORS[act.category] || "#94a3b8"
                                const at = getCatType(act.category)
                                return (
                                    <div key={ai} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 16px 7px 44px", borderBottom: "1px solid #F9FAFB", background: at === 'personal' ? '#FFF5F5' : 'transparent' }}>
                                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: at === 'personal' ? '#EF4444' : at === 'work' ? '#10B981' : color, flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: at === 'personal' ? '#DC2626' : "#111827" }}>{at === 'personal' ? '🔴 ' : ''}{act.siteLabel}</span>
                                            {act.pageTitle && act.pageTitle !== act.siteLabel && <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 6 }}>— {act.pageTitle}</span>}
                                        </div>
                                        <span style={{ padding: "1px 7px", borderRadius: 20, fontSize: 10, background: color + "18", color, flexShrink: 0 }}>{act.category}</span>
                                        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#6B7280", flexShrink: 0 }}>{d(act.startTime)?.toLocaleTimeString()}</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: "#059669", flexShrink: 0, minWidth: 50, textAlign: "right" }}>{fmt(act.durationSec)}</span>
                                    </div>
                                )
                            })}
                            {session.activities.length === 0 && <div style={{ padding: "8px 44px", fontSize: 11, color: "#9CA3AF", fontStyle: "italic" }}>No activity in this session</div>}
                            {session.logoutTime ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", background: "#FEF2F2", borderTop: "1px solid #FECACA" }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#DC2626", flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>{session.logoutType === 'SYSTEM_RESTART' ? '🟠 Restart' : session.logoutType === 'LAPTOP_SLEEP' ? '🔵 Sleep' : '🔴 Logout / Shutdown'}</span>
                                    <span style={{ fontSize: 12, fontFamily: "monospace", color: "#6B7280" }}>{session.logoutTime?.toLocaleTimeString()}</span>
                                    <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: "auto" }}>Session: {fmt(Math.floor((session.logoutTime - session.loginTime) / 1000))}</span>
                                </div>
                            ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", background: "#F0FDF4", borderTop: "1px solid #D1FAE5" }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: "#059669" }}>🟢 Currently Active</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* RAW LOG TAB */}
            {activeTab === "raw" && (
                <div style={tableWrap}>
                    <div style={tableHead}><span style={tableTitle}>📊 Activity Log</span>{isToday && <span style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", fontFamily: "monospace" }}>● LIVE</span>}</div>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr>{["Start", "End", "App / Site", "Tab / File", "Category", "Duration"].map(h => <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>{h}</th>)}</tr></thead>
                            <tbody>
                                {activity.map((row, i) => {
                                    const rt = getCatType(row.category)
                                    return (
                                        <tr key={row._id || i} style={{ borderBottom: "1px solid #F3F4F6", background: rt === 'personal' ? '#FFF5F5' : 'transparent' }}>
                                            <td style={td}>{d(row.startTime)?.toLocaleTimeString() || "—"}</td>
                                            <td style={td}>{d(row.endTime)?.toLocaleTimeString() || "—"}</td>
                                            <td style={{ ...td, fontWeight: 600, color: rt === 'personal' ? '#DC2626' : "#111827" }}>{rt === 'personal' ? '🔴 ' : ''}{row.siteLabel}</td>
                                            <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.pageTitle}</td>
                                            <td style={td}><span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 11, background: (CAT_COLORS[row.category] || "#94a3b8") + "18", color: CAT_COLORS[row.category] || "#94a3b8" }}>{row.category}</span></td>
                                            <td style={{ ...td, fontWeight: 600, fontFamily: "monospace", color: "#111827" }}>{fmt(row.durationSec)}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    {activity.length === 0 && <div style={emptyRow}>No activity recorded for {selectedDate}</div>}
                </div>
            )}

            {/* SYSTEM EVENTS TAB */}
            {activeTab === "system" && (
                <div style={tableWrap}>
                    <div style={tableHead}><span style={tableTitle}>🔐 Login / Logout History</span></div>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr>{["Time", "Event", "Details"].map(h => <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>{h}</th>)}</tr></thead>
                            <tbody>
                                {systemEvents.map((evt, i) => {
                                    const color = SYS_COLORS[evt.event] || "#6B7280"
                                    return (
                                        <tr key={evt._id || i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                                            <td style={td}>{d(evt.timestamp)?.toLocaleTimeString()}</td>
                                            <td style={td}><span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: color + "18", color }}>{SYS_LABELS[evt.event] || evt.event}</span></td>
                                            <td style={{ ...td, color: "#6B7280" }}>{evt.details}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    {systemEvents.length === 0 && <div style={emptyRow}>No login/logout history for {selectedDate}</div>}
                </div>
            )}

            {/* ══ ANALYTICS TAB ══ */}
            {activeTab === "analytics" && (
                <div>
                    {/* Date Range Picker */}
                    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>From</span>
                        <input type="date" value={analyticsFrom} max={todayStr} onChange={e => setAnalyticsFrom(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #E5E7EB", borderRadius: 7, fontSize: 12, fontFamily: "monospace", outline: "none" }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>To</span>
                        <input type="date" value={analyticsTo} max={todayStr} onChange={e => setAnalyticsTo(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #E5E7EB", borderRadius: 7, fontSize: 12, fontFamily: "monospace", outline: "none" }} />
                        <button onClick={loadAnalytics} disabled={analyticsLoading} style={{ padding: "7px 18px", background: analyticsLoading ? "#F3F4F6" : "#1B4F8A", color: analyticsLoading ? "#9CA3AF" : "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: analyticsLoading ? "not-allowed" : "pointer" }}>
                            {analyticsLoading ? "⏳ Loading…" : "📈 Analyse"}
                        </button>
                        {analyticsData.length > 0 && <span style={{ fontSize: 11, color: "#9CA3AF" }}>{getDatesInRange(analyticsFrom, analyticsTo).length} day{getDatesInRange(analyticsFrom, analyticsTo).length !== 1 ? 's' : ''} · {analyticsData.length} sessions</span>}
                    </div>

                    {analyticsData.length === 0 && !analyticsLoading && (
                        <div style={{ ...tableWrap, padding: "60px 0", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                            Select a date range and click 📈 Analyse
                        </div>
                    )}

                    {analyticsData.length > 0 && (
                        <>
                            {/* Summary Cards */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                                {[
                                    { label: "Total Time", value: fmt(aTotal), color: "#1B4F8A", bg: "#EBF3FE" },
                                    { label: "Productivity", value: `${aScore}%  ${aScoreLabel}`, color: aScoreColor, bg: aScore >= 70 ? "#F0FDF4" : aScore >= 40 ? "#FFFBEB" : "#FEF2F2" },
                                    { label: "🟢 Work Time", value: fmt(aWork), color: "#059669", bg: "#F0FDF4" },
                                    { label: "🔴 Personal Time", value: fmt(aPersonal), color: "#DC2626", bg: "#FEF2F2" },
                                ].map((card, i) => (
                                    <div key={i} style={{ background: card.bg, border: "1px solid #E5E7EB", borderRadius: 10, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", marginBottom: 6 }}>{card.label.toUpperCase()}</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: card.color, fontFamily: "monospace" }}>{card.value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Pie + Top Apps row */}
                            <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, marginBottom: 16 }}>

                                {/* Pie Chart */}
                                <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 16 }}>Activity Breakdown</div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 20, justifyContent: "center" }}>
                                        <div style={{ position: "relative", width: 130, height: 130, flexShrink: 0 }}>
                                            <div style={{ width: 130, height: 130, borderRadius: "50%", background: pieGradient }} />
                                            {/* Center hole */}
                                            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 70, height: 70, borderRadius: "50%", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                                                <div style={{ fontSize: 18, fontWeight: 800, color: aScoreColor, fontFamily: "monospace", lineHeight: 1 }}>{aScore}%</div>
                                                <div style={{ fontSize: 9, color: "#9CA3AF", marginTop: 2 }}>WORK</div>
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                            {[
                                                { color: "#10B981", label: "Work", value: fmt(aWork), pct: wPct },
                                                { color: "#CBD5E1", label: "Neutral", value: fmt(aNeutral), pct: nPct },
                                                { color: "#EF4444", label: "Personal", value: fmt(aPersonal), pct: pPct },
                                            ].map((item, i) => (
                                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                                                    <div>
                                                        <div style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>{item.label}</div>
                                                        <div style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "monospace" }}>{item.value} ({item.pct}%)</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Top Apps Bar Chart */}
                                <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 16 }}>Top Apps / Websites</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                        {aTopApps.map((app, i) => {
                                            const type = getCatType(app.category)
                                            const barColor = type === 'personal' ? '#EF4444' : type === 'work' ? '#10B981' : '#94a3b8'
                                            const pct = aTopApps[0]?.sec > 0 ? (app.sec / aTopApps[0].sec) * 100 : 0
                                            return (
                                                <div key={i}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                                                        <span style={{ fontSize: 11, fontWeight: 600, color: type === 'personal' ? '#DC2626' : '#111827' }}>
                                                            {type === 'personal' ? '🔴 ' : type === 'work' ? '🟢 ' : ''}{app.siteLabel}
                                                        </span>
                                                        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#6B7280" }}>{fmt(app.sec)}</span>
                                                    </div>
                                                    <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3 }}>
                                                        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 0.5s" }} />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Category Breakdown */}
                            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "20px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 16 }}>Category Breakdown</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                    {aCats.map(([cat, sec], i) => {
                                        const type = getCatType(cat)
                                        const barColor = type === 'personal' ? '#EF4444' : type === 'work' ? '#10B981' : CAT_COLORS[cat] || '#94a3b8'
                                        const pct = aTotal > 0 ? (sec / aTotal) * 100 : 0
                                        return (
                                            <div key={i} style={{ padding: "10px 14px", background: type === 'personal' ? '#FFF5F5' : type === 'work' ? '#F0FDF4' : '#F9FAFB', borderRadius: 8, borderLeft: `3px solid ${barColor}` }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: type === 'personal' ? '#DC2626' : '#111827' }}>
                                                        {type === 'personal' ? '🔴 ' : type === 'work' ? '🟢 ' : ''}{cat}
                                                    </span>
                                                    <div style={{ textAlign: "right" }}>
                                                        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: "#111827" }}>{fmt(sec)}</span>
                                                        <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 6 }}>{Math.round(pct)}%</span>
                                                    </div>
                                                </div>
                                                <div style={{ height: 5, background: "#E5E7EB", borderRadius: 3 }}>
                                                    <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 0.5s" }} />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Full App Table */}
                            <div style={tableWrap}>
                                <div style={tableHead}><span style={tableTitle}>📋 All Apps ({Object.keys(aAppMap).length} total)</span></div>
                                <div style={{ overflowX: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                        <thead><tr>{["App / Site", "Category", "Total Time", "Sessions", "Type"].map(h => <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>{h}</th>)}</tr></thead>
                                        <tbody>
                                            {Object.values(aAppMap).sort((a, b) => b.sec - a.sec).map((app, i) => {
                                                const type = getCatType(app.category)
                                                return (
                                                    <tr key={i} style={{ borderBottom: "1px solid #F3F4F6", background: type === 'personal' ? '#FFF5F5' : 'transparent' }}>
                                                        <td style={{ ...td, fontWeight: 600, color: type === 'personal' ? '#DC2626' : '#111827' }}>{type === 'personal' ? '🔴 ' : type === 'work' ? '🟢 ' : ''}{app.siteLabel}</td>
                                                        <td style={td}><span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 11, background: (CAT_COLORS[app.category] || "#94a3b8") + "18", color: CAT_COLORS[app.category] || "#94a3b8" }}>{app.category}</span></td>
                                                        <td style={{ ...td, fontWeight: 700, fontFamily: "monospace", color: "#111827" }}>{fmt(app.sec)}</td>
                                                        <td style={td}>{app.count}×</td>
                                                        <td style={td}><span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: type === 'personal' ? '#FEE2E2' : type === 'work' ? '#D1FAE5' : '#F3F4F6', color: type === 'personal' ? '#DC2626' : type === 'work' ? '#059669' : '#6B7280' }}>{type}</span></td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

const tableWrap = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }
const tableHead = { padding: "12px 18px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff" }
const tableTitle = { fontSize: 13, fontWeight: 600, color: "#374151" }
const td = { padding: "10px 16px", fontSize: 12, color: "#6B7280", fontFamily: "monospace" }
const emptyRow = { padding: "40px 0", textAlign: "center", color: "#9CA3AF", fontSize: 13 }