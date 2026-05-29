'use client'
import { useEffect, useState, use } from 'react'
import { db } from '../../../lib/firebase'
import Link from 'next/link'
import { collection, onSnapshot, orderBy, query, limit, doc, where, setDoc } from 'firebase/firestore'

const CAT_COLORS = {
    'Video': '#ff4d6a', 'Entertainment': '#f97316', 'Email': '#4d9fff',
    'Search / Browse': '#a78bfa', 'Shopping': '#f5a623', 'Social Media': '#ec4899',
    'Development': '#00d97e', 'Work — Document': '#06b6d4', 'Work — Spreadsheet': '#06b6d4',
    'Work — Presentation': '#06b6d4', 'Meeting': '#6366f1', 'Chat': '#14b8a6',
    'AI Tool': '#a855f7', 'File Explorer': '#64748b', 'Desktop': '#475569',
    '⚠️ Terminal': '#f5a623', '⚠️ System Tool': '#ff4d6a', '⚠️ Virtual Machine': '#ff4d6a',
    '⚠️ Screen Recorder': '#ff4d6a', '⚠️ VPN': '#ff4d6a', '⚠️ Remote Desktop': '#f97316',
    'Other': '#4a4a6a',
}

export default function DevicePage({ params }) {
    const { id } = use(params)
    const [activity, setActivity] = useState([])
    const [currentApp, setCurrentApp] = useState(null)
    const [liveSeconds, setLiveSeconds] = useState(0)
    const [totalTime, setTotalTime] = useState(0)
    const [date, setDate] = useState('')
    const [selectedDate, setSelectedDate] = useState('')
    const [device, setDevice] = useState(null)
    const [screenshotLoading, setScreenshotLoading] = useState(false)
    const [screenshot, setScreenshot] = useState(null)
    const [systemEvents, setSystemEvents] = useState([])
    const [activeTab, setActiveTab] = useState('history')
    const [expandedApps, setExpandedApps] = useState({})
    const [downloading, setDownloading] = useState(false)

    useEffect(() => {
        const today = new Date().toISOString().split('T')[0]
        setDate(today)
        setSelectedDate(today)
    }, [])

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'devices', id), snap => {
            if (snap.exists()) setDevice(snap.data())
        })
        return () => unsub()
    }, [id])

    useEffect(() => {
        if (!selectedDate) return
        const q = query(
            collection(db, 'activity', id, 'logs'),
            where('date', '==', selectedDate),
            orderBy('timestamp', 'desc'),
            limit(500)
        )
        const unsub = onSnapshot(q, snap => {
            const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            setActivity(rows)
            setTotalTime(rows.reduce((sum, r) => sum + (r.durationSec || 0), 0))
        })
        return () => unsub()
    }, [id, selectedDate])

    useEffect(() => {
        const unsub = onSnapshot(
            query(collection(db, 'screenshots', id, 'logs'), orderBy('timestamp', 'desc'), limit(1)),
            snap => {
                if (!snap.empty) {
                    const data = snap.docs[0].data()
                    setScreenshot({ url: data.imageUrl, publicId: data.publicId, docId: snap.docs[0].id, time: data.timestamp?.toDate?.() })
                    setScreenshotLoading(false)
                }
            }
        )
        return () => unsub()
    }, [id])

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'current_activity', id), snap => {
            if (snap.exists() && snap.data().isActive) {
                const updatedAt = snap.data().updatedAt?.toDate?.()
                const diff = updatedAt ? Date.now() - updatedAt.getTime() : 999999
                if (diff > 15000) { setCurrentApp(null); setLiveSeconds(0); return }
                setCurrentApp(snap.data())
                const start = snap.data().startTime?.toDate?.()
                if (start) setLiveSeconds(Math.floor((Date.now() - start.getTime()) / 1000))
            } else {
                setCurrentApp(null); setLiveSeconds(0)
            }
        })
        return () => unsub()
    }, [id])

    useEffect(() => {
        if (!currentApp) return
        const t = setInterval(() => {
            const start = currentApp.startTime?.toDate?.()
            if (start) setLiveSeconds(Math.floor((Date.now() - start.getTime()) / 1000))
        }, 1000)
        return () => clearInterval(t)
    }, [currentApp])

    useEffect(() => {
        const t = setInterval(() => {
            if (currentApp) {
                const updatedAt = currentApp.updatedAt?.toDate?.()
                if (updatedAt && Date.now() - updatedAt.getTime() > 15000) {
                    setCurrentApp(null); setLiveSeconds(0)
                }
            }
        }, 5000)
        return () => clearInterval(t)
    }, [currentApp])

    useEffect(() => {
        if (!selectedDate) return
        const q = query(
            collection(db, 'system_events', id, 'logs'),
            where('date', '==', selectedDate),
            orderBy('timestamp', 'desc'),
            limit(50)
        )
        const unsub = onSnapshot(q, snap => {
            setSystemEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        })
        return () => unsub()
    }, [id, selectedDate])

    const fmt = sec => {
        if (!sec || sec < 0) return '0s'
        if (sec < 60) return `${sec}s`
        const m = Math.floor(sec / 60), s = sec % 60
        if (m < 60) return `${m}m ${s}s`
        const h = Math.floor(m / 60), rm = m % 60
        return `${h}h ${rm}m`
    }

    const closeScreenshot = async () => {
        if (!screenshot) return
        const current = screenshot
        setScreenshot(null)
        try {
            await fetch('/api/delete-screenshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publicId: current.publicId })
            })
            const { deleteDoc, doc: firestoreDoc } = await import('firebase/firestore')
            await deleteDoc(firestoreDoc(db, 'screenshots', id, 'logs', current.docId))
        } catch { }
    }

    const takeScreenshot = async () => {
        setScreenshotLoading(true)
        setScreenshot(null)
        await setDoc(doc(db, 'commands', id), {
            command: 'screenshot', status: 'pending', machineId: id, timestamp: new Date()
        })
    }

    // group activity by app
    const groupedApps = {}
    activity.forEach(row => {
        const key = row.siteLabel || row.url || 'Unknown'
        if (!groupedApps[key]) {
            groupedApps[key] = {
                siteLabel: key,
                category: row.category,
                totalSec: 0,
                sessions: [],
                count: 0
            }
        }
        groupedApps[key].totalSec += (row.durationSec || 0)
        groupedApps[key].count += 1
        groupedApps[key].sessions.push(row)
    })
    const sortedApps = Object.values(groupedApps).sort((a, b) => b.totalSec - a.totalSec)

    const toggleApp = (key) => {
        setExpandedApps(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const downloadWordReport = async () => {
        setDownloading(true)
        try {
            const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
                AlignmentType, WidthType, BorderStyle, ShadingType } = await import('docx')
            const { saveAs } = await import('file-saver')

            const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
            const borders = { top: border, bottom: border, left: border, right: border }

            const children = [
                new Paragraph({
                    children: [new TextRun({ text: 'Usage History Report', bold: true, size: 36, font: 'Arial' })],
                    spacing: { after: 200 }
                }),
                new Paragraph({
                    children: [new TextRun({ text: `Employee: ${device?.customName || id}   |   Date: ${selectedDate}   |   Total Tracked: ${fmt(totalTime)}`, size: 22, font: 'Arial', color: '666666' })],
                    spacing: { after: 400 }
                }),
                new Paragraph({
                    children: [new TextRun({ text: 'Summary', bold: true, size: 28, font: 'Arial' })],
                    spacing: { after: 200 }
                }),
                new Table({
                    width: { size: 9360, type: WidthType.DXA },
                    columnWidths: [4000, 2680, 2680],
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({ borders, width: { size: 4000, type: WidthType.DXA }, shading: { fill: '1a1a24', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'App / Website', bold: true, size: 20, font: 'Arial', color: 'ffffff' })] })] }),
                                new TableCell({ borders, width: { size: 2680, type: WidthType.DXA }, shading: { fill: '1a1a24', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Total Time', bold: true, size: 20, font: 'Arial', color: 'ffffff' })] })] }),
                                new TableCell({ borders, width: { size: 2680, type: WidthType.DXA }, shading: { fill: '1a1a24', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Times Opened', bold: true, size: 20, font: 'Arial', color: 'ffffff' })] })] }),
                            ]
                        }),
                        ...sortedApps.map(app => new TableRow({
                            children: [
                                new TableCell({ borders, width: { size: 4000, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: app.siteLabel, size: 20, font: 'Arial' })] })] }),
                                new TableCell({ borders, width: { size: 2680, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: fmt(app.totalSec), size: 20, font: 'Arial' })] })] }),
                                new TableCell({ borders, width: { size: 2680, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: String(app.count), size: 20, font: 'Arial' })] })] }),
                            ]
                        }))
                    ]
                }),
                new Paragraph({ children: [], spacing: { after: 400 } }),
                new Paragraph({
                    children: [new TextRun({ text: 'Detailed Breakdown', bold: true, size: 28, font: 'Arial' })],
                    spacing: { after: 200 }
                }),
            ]

            sortedApps.forEach(app => {
                children.push(new Paragraph({
                    children: [new TextRun({ text: `${app.siteLabel}  (Total: ${fmt(app.totalSec)}, Opened ${app.count} times)`, bold: true, size: 22, font: 'Arial' })],
                    spacing: { before: 200, after: 100 }
                }))
                app.sessions.forEach(session => {
                    const start = session.startTime?.toDate?.()?.toLocaleTimeString() || '-'
                    const end = session.endTime?.toDate?.()?.toLocaleTimeString() || '-'

                    const title = session.pageTitle && session.pageTitle !== app.siteLabel ? `  — ${session.pageTitle}` : ''
                    children.push(new Paragraph({
                        children: [new TextRun({ text: `  > ${start} – ${end}  (${fmt(session.durationSec)})${title}`, size: 18, font: 'Arial', color: '666666' })],
                        spacing: { after: 60 }
                    }))
                })
            })

            children.push(new Paragraph({
                children: [new TextRun({ text: `Generated: ${new Date().toLocaleString()}`, size: 16, font: 'Arial', color: '999999' })],
                spacing: { before: 400 }
            }))

            const doc2 = new Document({
                sections: [{
                    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
                    children
                }]
            })

            const buffer = await Packer.toBlob(doc2)
            saveAs(buffer, `Usage_Report_${device?.customName || id}_${selectedDate}.docx`)
        } catch (err) {
            console.error('Download error:', err)
        }
        setDownloading(false)
    }

    const categoryTotals = {}
    activity.forEach(row => {
        const cat = row.category || 'Other'
        categoryTotals[cat] = (categoryTotals[cat] || 0) + (row.durationSec || 0)
    })

    const isToday = selectedDate === date

    const TABS = [
        { id: 'history', label: '📋 History' },
        { id: 'raw', label: '📊 Raw Log' },
        { id: 'system', label: '🔐 Login / Logout' },
    ]

    return (
        <div style={p.root}>
            <aside style={p.sidebar}>
                <div style={p.logo}>
                    <div style={p.logoIcon}>OM</div>
                    <div>
                        <div style={p.logoTitle}>Office Monitor</div>
                        <div style={p.logoSub}>Ray & Co</div>
                    </div>
                </div>
                <nav style={p.nav}>
                    <Link href="/" style={p.navItem}><span>⊞</span> Dashboard</Link>
                    <Link href="/report" style={p.navItem}><span>◈</span> Reports</Link>
                    <Link href="/security" style={p.navItem}><span>◉</span> Security</Link>
                </nav>
                {device && (
                    <div style={p.devicePanel}>
                        <div style={p.deviceAvatar}>{(device.customName || id)[0].toUpperCase()}</div>
                        <div style={p.deviceName}>{device.customName || id}</div>
                        <div style={p.deviceMeta}>{id}</div>
                        <div style={p.deviceMeta}>{device.ipAddress}</div>
                        {device.lastLoginTime && <div style={p.loginTime}>Login: {device.lastLoginTime?.toDate?.()?.toLocaleTimeString()}</div>}
                        {device.lastLogoutTime && <div style={{ ...p.loginTime, color: 'var(--text3)' }}>Logout: {device.lastLogoutTime?.toDate?.()?.toLocaleTimeString()}</div>}
                    </div>
                )}
            </aside>

            <main style={p.main}>
                {/* Header */}
                <div style={p.header}>
                    <div>
                        <div style={p.breadcrumb}>
                            <Link href="/" style={p.breadLink}>Dashboard</Link>
                            <span style={p.breadSep}>/</span>
                            <span style={p.breadCurrent}>{device?.customName || id}</span>
                        </div>
                        <h1 style={p.heading}>Activity History</h1>
                        <p style={p.subheading}>Total tracked: <strong style={{ color: 'var(--text)', fontFamily: 'DM Mono' }}>{fmt(totalTime)}</strong></p>
                    </div>

                    {/* TABS */}
                    <div style={p.tabRow}>
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                style={{ ...p.tab, ...(activeTab === tab.id ? p.tabActive : {}) }}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                        <input
                            type="date"
                            value={selectedDate}
                            max={date}
                            onChange={e => setSelectedDate(e.target.value)}
                            style={p.datePicker}
                        />
                    </div>
                </div>

                {/* LIVE NOW */}
                {currentApp && isToday && (
                    <div style={p.liveCard}>
                        <div style={p.liveLeft}>
                            <div style={p.livePulse}>
                                <span style={p.liveDot} />
                                <span style={p.liveLabel}>LIVE NOW</span>
                            </div>
                            <div style={p.liveApp}>{currentApp.siteLabel}</div>
                            <div style={p.livePage}>{currentApp.pageTitle}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                                <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, background: (CAT_COLORS[currentApp.category] || '#4a4a6a') + '22', color: CAT_COLORS[currentApp.category] || '#4a4a6a' }}>
                                    {currentApp.category}
                                </span>
                                <span style={p.liveStart}>Started {currentApp.startTime?.toDate?.()?.toLocaleTimeString()}</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
                            <div style={p.liveTimer}>{fmt(liveSeconds)}</div>
                            <button style={screenshotLoading ? { ...p.btnScreenshot, opacity: 0.6 } : p.btnScreenshot} onClick={takeScreenshot} disabled={screenshotLoading}>
                                {screenshotLoading ? '⏳ Capturing...' : '📷 Screenshot'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Screenshot */}
                {screenshot && screenshot.url && (
                    <div style={p.screenshotWrap}>
                        <div style={p.screenshotHead}>
                            <span style={p.screenshotTitle}>📷 Live Screenshot</span>
                            <span style={p.screenshotTime}>Captured at {screenshot.time?.toLocaleTimeString()}</span>
                            <button style={p.btnClose} onClick={closeScreenshot}>✕ Close</button>
                        </div>
                        <img src={screenshot.url} style={p.screenshotImg} alt="Employee screen" />
                    </div>
                )}

                {/* Category grid */}
                {Object.keys(categoryTotals).length > 0 && (
                    <div style={p.catGrid}>
                        {Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([cat, sec]) => (
                            <div key={cat} style={p.catCard}>
                                <div style={{ width: 3, height: '100%', background: CAT_COLORS[cat] || '#4a4a6a', borderRadius: 2, flexShrink: 0 }} />
                                <div>
                                    <div style={p.catName}>{cat}</div>
                                    <div style={p.catTime}>{fmt(sec)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── HISTORY TAB ── */}
                {activeTab === 'history' && (
                    <div style={p.tableWrap}>
                        <div style={p.tableHead}>
                            <span style={p.tableTitle}>📋 App Usage History</span>
                            <button
                                style={downloading ? { ...p.btnDownload, opacity: 0.6 } : p.btnDownload}
                                onClick={downloadWordReport}
                                disabled={downloading}
                            >
                                {downloading ? '⏳ Generating...' : '📥 Download Report (Word)'}
                            </button>
                        </div>
                        {sortedApps.length === 0 && <div style={p.empty}>No activity recorded for {selectedDate}</div>}
                        {sortedApps.map(app => (
                            <div key={app.siteLabel} style={p.appGroup}>
                                <div style={p.appHeader} onClick={() => toggleApp(app.siteLabel)}>
                                    <div style={p.appHeaderLeft}>
                                        <span style={p.expandIcon}>{expandedApps[app.siteLabel] ? '▼' : '▶'}</span>
                                        <span style={p.appName}>{app.siteLabel}</span>
                                        <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 10, background: (CAT_COLORS[app.category] || '#4a4a6a') + '22', color: CAT_COLORS[app.category] || '#4a4a6a' }}>
                                            {app.category}
                                        </span>
                                    </div>
                                    <div style={p.appStats}>
                                        <span style={p.appTotal}>{fmt(app.totalSec)}</span>
                                        <span style={p.appCount}>Opened {app.count}x</span>
                                    </div>
                                </div>
                                {expandedApps[app.siteLabel] && (
                                    <div style={p.sessionList}>
                                        {app.sessions.map((session, i) => (
                                            <div key={i} style={p.sessionRow}>
                                                <span style={p.sessionArrow}>›</span>
                                                <span style={p.sessionTime}>
                                                    {session.startTime?.toDate?.()?.toLocaleTimeString()} – {session.endTime?.toDate?.()?.toLocaleTimeString()}
                                                </span>
                                                <span style={p.sessionDur}>{fmt(session.durationSec)}</span>
                                                {session.pageTitle && session.pageTitle !== app.siteLabel && (
                                                    <span style={p.sessionTitle}>{session.pageTitle}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* ── RAW LOG TAB ── */}
                {activeTab === 'raw' && (
                    <div style={p.tableWrap}>
                        <div style={p.tableHead}>
                            <span style={p.tableTitle}>Activity Log</span>
                            {isToday && <span style={p.livePill}>● LIVE</span>}
                        </div>
                        <table style={p.table}>
                            <thead>
                                <tr>
                                    {['Start', 'End', 'App / Site', 'Tab / File', 'Category', 'Duration'].map(h => (
                                        <th key={h} style={p.th}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {activity.map(row => (
                                    <tr key={row.id} style={p.tr}>
                                        <td style={{ ...p.td, fontFamily: 'DM Mono', fontSize: 11 }}>{row.startTime?.toDate?.()?.toLocaleTimeString() || '—'}</td>
                                        <td style={{ ...p.td, fontFamily: 'DM Mono', fontSize: 11 }}>{row.endTime?.toDate?.()?.toLocaleTimeString() || '—'}</td>
                                        <td style={{ ...p.td, fontWeight: 600, color: 'var(--text)' }}>{row.siteLabel}</td>
                                        <td style={{ ...p.td, color: 'var(--text2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.pageTitle}</td>
                                        <td style={p.td}>
                                            <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, background: (CAT_COLORS[row.category] || '#4a4a6a') + '22', color: CAT_COLORS[row.category] || '#4a4a6a' }}>
                                                {row.category}
                                            </span>
                                        </td>
                                        <td style={{ ...p.td, fontFamily: 'DM Mono', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{fmt(row.durationSec)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {activity.length === 0 && <div style={p.empty}>No activity recorded for {selectedDate}</div>}
                    </div>
                )}

                {/* ── SYSTEM EVENTS TAB ── */}
                {activeTab === 'system' && (
                    <div style={p.tableWrap}>
                        <div style={p.tableHead}>
                            <span style={p.tableTitle}>🔐 Login / Logout History</span>
                        </div>
                        <table style={p.table}>
                            <thead>
                                <tr>
                                    {['Time', 'Event', 'Details'].map(h => <th key={h} style={p.th}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {systemEvents.map(evt => {
                                    const color =
                                        evt.event === 'AGENT_STARTED' ? '#00d97e' :
                                            evt.event === 'SYSTEM_SHUTDOWN' ? '#ff4d6a' :
                                                evt.event === 'SYSTEM_RESTART' ? '#f5a623' :
                                                    evt.event === 'LAPTOP_SLEEP' ? '#4d9fff' :
                                                        evt.event === 'WAKE_FROM_SLEEP' ? '#00d97e' :
                                                            evt.event === 'SCREEN_LOCKED' ? '#a78bfa' :
                                                                evt.event === 'SCREEN_UNLOCKED' ? '#a78bfa' : '#4a4a6a'
                                    const label =
                                        evt.event === 'AGENT_STARTED' ? '🟢 Login' :
                                            evt.event === 'SYSTEM_SHUTDOWN' ? '🔴 Shutdown' :
                                                evt.event === 'SYSTEM_RESTART' ? '🟠 Restart' :
                                                    evt.event === 'LAPTOP_SLEEP' ? '🔵 Sleep' :
                                                        evt.event === 'WAKE_FROM_SLEEP' ? '🟢 Wake' :
                                                            evt.event === 'SCREEN_LOCKED' ? '🟣 Locked' :
                                                                evt.event === 'SCREEN_UNLOCKED' ? '🟣 Unlocked' : evt.event
                                    return (
                                        <tr key={evt.id} style={p.tr}>
                                            <td style={{ ...p.td, fontFamily: 'DM Mono', fontSize: 11 }}>{evt.timestamp?.toDate?.()?.toLocaleTimeString()}</td>
                                            <td style={p.td}>
                                                <span style={{ padding: '2px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, background: color + '22', color }}>
                                                    {label}
                                                </span>
                                            </td>
                                            <td style={{ ...p.td, color: 'var(--text2)', fontSize: 11 }}>{evt.details}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                        {systemEvents.length === 0 && <div style={p.empty}>No login/logout history for {selectedDate}</div>}
                    </div>
                )}
            </main>
        </div>
    )
}

const p = {
    root: { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
    sidebar: { width: 240, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '24px 0', position: 'sticky', top: 0, height: '100vh' },
    logo: { display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px 24px', borderBottom: '1px solid var(--border)' },
    logoIcon: { width: 36, height: 36, borderRadius: 10, background: 'var(--green-dim)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, fontFamily: 'DM Mono' },
    logoTitle: { fontSize: 13, fontWeight: 600 },
    logoSub: { fontSize: 11, color: 'var(--text3)' },
    nav: { padding: '16px 12px' },
    navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--radius-sm)', color: 'var(--text2)', fontSize: 13, fontWeight: 500, marginBottom: 2 },
    devicePanel: { padding: '16px 20px', borderTop: '1px solid var(--border)', marginTop: 'auto' },
    deviceAvatar: { width: 48, height: 48, borderRadius: 12, background: 'var(--green-dim)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20, marginBottom: 10 },
    deviceName: { fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 },
    deviceMeta: { fontSize: 11, color: 'var(--text3)', fontFamily: 'DM Mono', marginBottom: 2 },
    loginTime: { fontSize: 11, color: 'var(--green)', marginTop: 6 },
    main: { flex: 1, padding: '32px 40px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 20 },
    breadcrumb: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
    breadLink: { fontSize: 12, color: 'var(--text3)' },
    breadSep: { fontSize: 12, color: 'var(--text3)' },
    breadCurrent: { fontSize: 12, color: 'var(--text2)' },
    heading: { fontSize: 22, fontWeight: 600, letterSpacing: '-0.5px', marginBottom: 4 },
    subheading: { fontSize: 13, color: 'var(--text3)' },
    tabRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
    tab: { padding: '8px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text2)', fontSize: 12, fontWeight: 500, cursor: 'pointer' },
    tabActive: { background: 'var(--green-dim)', border: '1px solid #00d97e40', color: 'var(--green)', fontWeight: 700 },
    datePicker: { padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'DM Mono' },
    liveCard: { background: 'linear-gradient(135deg, #00d97e08, #00d97e04)', border: '1px solid #00d97e30', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    liveLeft: { flex: 1 },
    livePulse: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
    liveDot: { width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' },
    liveLabel: { fontSize: 11, fontWeight: 700, color: 'var(--green)', letterSpacing: '0.1em' },
    liveApp: { fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 2 },
    livePage: { fontSize: 13, color: 'var(--text2)', marginBottom: 4 },
    liveStart: { fontSize: 11, color: 'var(--text3)' },
    liveTimer: { fontSize: 40, fontWeight: 700, color: 'var(--green)', fontFamily: 'DM Mono', letterSpacing: '-2px' },
    btnScreenshot: { padding: '8px 16px', background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid #4d9fff30', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500, cursor: 'pointer' },
    screenshotWrap: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 16 },
    screenshotHead: { padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 },
    screenshotTitle: { fontSize: 13, fontWeight: 600, flex: 1, color: 'var(--text)' },
    screenshotTime: { fontSize: 11, color: 'var(--text3)', fontFamily: 'DM Mono' },
    btnClose: { padding: '4px 10px', background: 'var(--surface2)', border: 'none', color: 'var(--text2)', cursor: 'pointer', borderRadius: 6, fontSize: 11 },
    screenshotImg: { width: '100%', display: 'block' },
    catGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 24 },
    catCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px', display: 'flex', gap: 10, alignItems: 'center' },
    catName: { fontSize: 11, color: 'var(--text3)', marginBottom: 3 },
    catTime: { fontSize: 14, fontWeight: 700, fontFamily: 'DM Mono' },
    tableWrap: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 24 },
    tableHead: { padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    tableTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text2)' },
    livePill: { fontSize: 11, fontWeight: 700, color: 'var(--red)', fontFamily: 'DM Mono' },
    btnDownload: { padding: '7px 14px', background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid #4d9fff30', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500, cursor: 'pointer' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', background: 'var(--surface)' },
    tr: { borderBottom: '1px solid var(--border)' },
    td: { padding: '10px 16px', fontSize: 12, color: 'var(--text2)' },
    empty: { padding: 48, textAlign: 'center', color: 'var(--text3)', fontSize: 13 },
    appGroup: { borderBottom: '1px solid var(--border)' },
    appHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', cursor: 'pointer', transition: 'background 0.15s' },
    appHeaderLeft: { display: 'flex', alignItems: 'center', gap: 10 },
    expandIcon: { fontSize: 10, color: 'var(--text3)', width: 12 },
    appName: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
    appStats: { display: 'flex', alignItems: 'center', gap: 16 },
    appTotal: { fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Mono' },
    appCount: { fontSize: 11, color: 'var(--text3)' },
    sessionList: { background: 'var(--surface2)', borderTop: '1px solid var(--border)', padding: '8px 0' },
    sessionRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '6px 20px 6px 44px' },
    sessionArrow: { fontSize: 14, color: 'var(--text3)' },
    sessionTime: { fontSize: 11, fontFamily: 'DM Mono', color: 'var(--text2)', minWidth: 180 },
    sessionDur: { fontSize: 11, fontWeight: 600, fontFamily: 'DM Mono', color: 'var(--green)', minWidth: 60 },
    sessionTitle: { fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 },
}