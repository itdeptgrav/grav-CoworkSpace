'use client'
import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore'

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

export default function AdminDashboard() {
  const [devices, setDevices] = useState([])
  const [renaming, setRenaming] = useState(null)
  const [newName, setNewName] = useState('')
  const [mounted, setMounted] = useState(false)
  const [now, setNow] = useState(0)

  useEffect(() => {
    setMounted(true)
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])


  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])


  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'devices'), snap => {
      const list = snap.docs.map(d => ({ machineId: d.id, ...d.data() }))
      list.sort((a, b) => {
        const order = { active: 0, pending: 1, inactive: 2 }
        return (order[a.status] ?? 3) - (order[b.status] ?? 3)
      })
      setDevices(list)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])

  const activateDevice = id => updateDoc(doc(db, 'devices', id), { status: 'active', tracking: true, agentStatus: 'running' })
  const toggleTracking = (id, cur) => updateDoc(doc(db, 'devices', id), { tracking: !cur })
  const deactivateDevice = id => updateDoc(doc(db, 'devices', id), { status: 'inactive', tracking: false })
  const renameDevice = async id => {
    if (!newName.trim()) return
    await updateDoc(doc(db, 'devices', id), { customName: newName.trim() })
    setRenaming(null); setNewName('')
  }

  const getStatus = device => {
    if (device.agentStatus === 'stopped') return 'stopped'
    if (!device.lastSeen) return 'unknown'
    const diff = now - device.lastSeen.toDate().getTime()
    if (diff < 90000) return 'online'
    if (diff < 300000) return 'warning'
    return 'offline'
  }

  const stopReasonLabel = {
    'UNINSTALLED': 'Uninstalled by user',
    'PROCESS_KILLED_OR_STOPPED': 'Killed via Task Manager',
    'MANUALLY_STOPPED_VIA_CMD': 'Stopped via Command Prompt',
    'AGENT_CRASHED': 'Agent crashed unexpectedly',
    'AGENT_STOPPED': 'Stopped normally',
    'LAPTOP_SLEEP': 'Laptop went to sleep',
  }

  const pending = devices.filter(d => d.status === 'pending')
  const active = devices.filter(d => d.status === 'active')
  const inactive = devices.filter(d => d.status === 'inactive')
  const onlineCount = active.filter(d => getStatus(d) === 'online').length

  return (
    <div style={s.root}>
      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={s.logo}>
          <div style={s.logoIcon}>OM</div>
          <div>
            <div style={s.logoTitle}>Office Monitor</div>
            <div style={s.logoSub}>Ray & Co</div>
          </div>
        </div>

        <nav style={s.nav}>
          <a href="/" style={{ ...s.navItem, ...s.navActive }}>
            <span>⊞</span> Dashboard
          </a>
          <a href="/report" style={s.navItem}>
            <span>◈</span> Reports
          </a>
          <a href="/security" style={s.navItem}>
            <span>◉</span> Security
          </a>
        </nav>

        <div style={s.sideStats}>
          <div style={s.sideStatRow}>
            <span style={s.sideStatLabel}>Total Devices</span>
            <span style={s.sideStatVal}>{devices.length}</span>
          </div>
          <div style={s.sideStatRow}>
            <span style={s.sideStatLabel}>Online Now</span>
            <span style={{ ...s.sideStatVal, color: 'var(--green)' }}>{onlineCount}</span>
          </div>
          <div style={s.sideStatRow}>
            <span style={s.sideStatLabel}>Pending</span>
            <span style={{ ...s.sideStatVal, color: 'var(--amber)' }}>{pending.length}</span>
          </div>
          <div style={s.sideStatRow}>
            <span style={s.sideStatLabel}>Inactive</span>
            <span style={{ ...s.sideStatVal, color: 'var(--text3)' }}>{inactive.length}</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={s.main}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <h1 style={s.heading}>Devices</h1>
            <p style={s.subheading}>Monitor and manage all connected office laptops</p>
          </div>
          <div style={s.headerRight}>
            <div style={s.liveBadge}>
              <span style={s.liveDot} />
              Live
            </div>
          </div>
        </div>

        {/* Pending */}
        {pending.length > 0 && (
          <section style={s.section}>
            <div style={s.sectionHead}>
              <div style={{ ...s.dot, background: 'var(--amber)' }} />
              <h2 style={s.sectionTitle}>Pending Activation</h2>
              <span style={s.pill}>{pending.length}</span>
            </div>
            {pending.map(d => (
              <div key={d.machineId} style={{ ...s.card, borderColor: '#f5a62330' }}>
                <div style={s.cardLeft}>
                  <div style={s.avatar}>{(d.customName || d.machineId)[0].toUpperCase()}</div>
                  <div>
                    <div style={s.cardName}>{d.customName || d.machineId}</div>
                    <div style={s.cardMeta}>
                      {d.machineId} · {d.ipAddress} · Installed {d.installedAt?.toDate?.()?.toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <button style={s.btnActivate} onClick={() => activateDevice(d.machineId)}>
                  Activate
                </button>
              </div>
            ))}
          </section>
        )}

        {/* Active */}
        {active.length > 0 && (
          <section style={s.section}>
            <div style={s.sectionHead}>
              <div style={{ ...s.dot, background: 'var(--green)' }} />
              <h2 style={s.sectionTitle}>Active Devices</h2>
              <span style={{ ...s.pill, background: 'var(--green-dim)', color: 'var(--green)' }}>{active.length}</span>
            </div>
            {active.map(d => {
              const status = getStatus(d)
              const statusColors = {
                online: 'var(--green)', warning: 'var(--amber)',
                offline: 'var(--red)', stopped: 'var(--red)', unknown: 'var(--text3)'
              }
              const statusLabels = {
                online: 'Online', warning: 'No Signal',
                offline: 'Offline', stopped: 'Stopped', unknown: 'Unknown'
              }
              return (
                <div key={d.machineId} style={{
                  ...s.card,
                  borderColor: status === 'online' ? 'var(--border)' :
                    status === 'warning' ? '#f5a62330' : '#ff4d6a30'
                }}>
                  <div style={s.cardLeft}>
                    <div style={{
                      ...s.avatar,
                      background: status === 'online' ? 'var(--green-dim)' : 'var(--surface2)',
                      color: status === 'online' ? 'var(--green)' : 'var(--text2)'
                    }}>
                      {(d.customName || d.machineId)[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      {renaming === d.machineId ? (
                        <div style={s.renameRow}>
                          <input
                            style={s.renameInput}
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && renameDevice(d.machineId)}
                            placeholder="Enter name"
                            autoFocus
                          />
                          <button style={s.btnSave} onClick={() => renameDevice(d.machineId)}>Save</button>
                          <button style={s.btnCancel} onClick={() => setRenaming(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div style={s.nameRow}>
                          <span style={s.cardName}>{d.customName || d.machineId}</span>
                          <button style={s.btnEdit} onClick={() => { setRenaming(d.machineId); setNewName(d.customName || '') }}>
                            ✎
                          </button>
                          <span style={{
                            ...s.trackBadge,
                            background: d.tracking ? 'var(--green-dim)' : 'var(--surface2)',
                            color: d.tracking ? 'var(--green)' : 'var(--text3)'
                          }}>
                            {d.tracking ? '● Tracking' : '○ Paused'}
                          </span>
                        </div>
                      )}
                      <div style={s.cardMeta}>
                        {d.machineId} · {d.ipAddress} · Last seen {d.lastSeen?.toDate?.()?.toLocaleTimeString()}
                        {d.lastLoginTime && ` · Login ${d.lastLoginTime?.toDate?.()?.toLocaleTimeString()}`}
                      </div>

                      {/* Security alert */}
                      {d.lastSecurityAlert && (
                        <div style={s.alertBadge}>
                          ⚠ {d.lastSecurityAlert} — {d.lastAlertDetails}
                        </div>
                      )}

                      {/* Stop reason */}
                      {(status === 'stopped' || status === 'offline') && d.stopReason && (
                        <div style={s.stopBadge}>
                          ✕ {stopReasonLabel[d.stopReason] || d.stopReason}
                          {d.stoppedAt && ` at ${d.stoppedAt?.toDate?.()?.toLocaleTimeString()}`}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={s.cardRight}>
                    {/* Status indicator */}
                    <div style={{ ...s.statusDot, background: statusColors[status] }}>
                      <span style={{ color: statusColors[status], fontSize: 11, fontWeight: 600 }}>
                        {statusLabels[status]}
                      </span>
                    </div>

                    <div style={s.actions}>
                      <button
                        style={d.tracking ? s.btnPause : s.btnResume}
                        onClick={() => toggleTracking(d.machineId, d.tracking)}
                      >
                        {d.tracking ? 'Pause' : 'Resume'}
                      </button>
                      <a href={`/devices/${d.machineId}`} style={s.btnView}>
                        View Activity →
                      </a>
                      <button style={s.btnDeactivate} onClick={() => deactivateDevice(d.machineId)}>
                        Deactivate
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {/* Inactive */}
        {inactive.length > 0 && (
          <section style={s.section}>
            <div style={s.sectionHead}>
              <div style={{ ...s.dot, background: 'var(--text3)' }} />
              <h2 style={s.sectionTitle}>Inactive Devices</h2>
              <span style={s.pill}>{inactive.length}</span>
            </div>
            {inactive.map(d => (
              <div key={d.machineId} style={{ ...s.card, opacity: 0.5 }}>
                <div style={s.cardLeft}>
                  <div style={{ ...s.avatar, background: 'var(--surface2)', color: 'var(--text3)' }}>
                    {(d.customName || d.machineId)[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={s.cardName}>{d.customName || d.machineId}</div>
                    <div style={s.cardMeta}>{d.machineId} · {d.ipAddress}</div>
                  </div>
                </div>
                <button style={s.btnActivate} onClick={() => activateDevice(d.machineId)}>
                  Reactivate
                </button>
              </div>
            ))}
          </section>
        )}

        {mounted && devices.length === 0 && (
          <div style={s.empty}>
            <div style={s.emptyIcon}>⊞</div>
            <div style={s.emptyTitle}>No devices connected</div>
            <div style={s.emptySub}>Run OfficeMonitorSetup.exe on an office laptop to get started</div>
          </div>
        )}
      </main>
    </div>
  )
}

const s = {
  root: { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },

  sidebar: { width: 240, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '24px 0', position: 'sticky', top: 0, height: '100vh' },
  logo: { display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px 24px', borderBottom: '1px solid var(--border)' },
  logoIcon: { width: 36, height: 36, borderRadius: 10, background: 'var(--green-dim)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, fontFamily: 'DM Mono' },
  logoTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  logoSub: { fontSize: 11, color: 'var(--text3)' },

  nav: { padding: '16px 12px', flex: 1 },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--radius-sm)', color: 'var(--text2)', fontSize: 13, fontWeight: 500, marginBottom: 2, transition: 'all 0.15s' },
  navActive: { background: 'var(--surface2)', color: 'var(--text)', borderLeft: '2px solid var(--green)' },

  sideStats: { padding: '16px 20px', borderTop: '1px solid var(--border)' },
  sideStatRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' },
  sideStatLabel: { fontSize: 12, color: 'var(--text3)' },
  sideStatVal: { fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'DM Mono' },

  main: { flex: 1, padding: '32px 40px', maxWidth: 1000 },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 },
  heading: { fontSize: 24, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.5px' },
  subheading: { fontSize: 13, color: 'var(--text3)', marginTop: 4 },
  headerRight: { display: 'flex', gap: 12, alignItems: 'center' },
  liveBadge: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--green-dim)', borderRadius: 20, fontSize: 12, fontWeight: 600, color: 'var(--green)' },
  liveDot: { width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s infinite' },

  section: { marginBottom: 32 },
  sectionHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
  dot: { width: 8, height: 8, borderRadius: '50%' },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  pill: { padding: '2px 8px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--text3)', fontSize: 11, fontWeight: 600, fontFamily: 'DM Mono' },

  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, transition: 'border-color 0.2s' },
  cardLeft: { display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 },
  cardRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 },

  avatar: { width: 40, height: 40, borderRadius: 10, background: 'var(--green-dim)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 },

  nameRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardName: { fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  cardMeta: { fontSize: 11, color: 'var(--text3)', fontFamily: 'DM Mono' },

  trackBadge: { padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500 },
  alertBadge: { marginTop: 6, padding: '4px 8px', background: '#f5a62315', border: '1px solid #f5a62330', borderRadius: 6, fontSize: 11, color: 'var(--amber)', display: 'inline-block' },
  stopBadge: { marginTop: 4, padding: '3px 8px', background: 'var(--red-dim)', border: '1px solid #ff4d6a30', borderRadius: 6, fontSize: 11, color: 'var(--red)', display: 'inline-block' },

  statusDot: { display: 'flex', alignItems: 'center', gap: 6 },

  actions: { display: 'flex', gap: 6 },

  renameRow: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 },
  renameInput: { padding: '5px 10px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', fontSize: 13, outline: 'none', width: 160, fontFamily: 'DM Sans' },

  btnActivate: { padding: '8px 16px', background: 'var(--green)', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 700, letterSpacing: '0.02em' },
  btnPause: { padding: '7px 14px', background: 'var(--amber-dim)', color: 'var(--amber)', border: '1px solid #f5a62330', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500 },
  btnResume: { padding: '7px 14px', background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid #00d97e30', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500 },
  btnView: { padding: '7px 14px', background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid #4d9fff30', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500 },
  btnDeactivate: { padding: '7px 14px', background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid #ff4d6a30', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500 },
  btnEdit: { background: 'none', border: 'none', color: 'var(--text3)', fontSize: 14, padding: '0 4px' },
  btnSave: { padding: '5px 12px', background: 'var(--green)', color: '#000', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600 },
  btnCancel: { padding: '5px 12px', background: 'var(--surface2)', color: 'var(--text2)', border: 'none', borderRadius: 6, fontSize: 12 },

  empty: { textAlign: 'center', padding: '80px 0' },
  emptyIcon: { fontSize: 48, color: 'var(--text3)', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 },
  emptySub: { fontSize: 13, color: 'var(--text3)' },
}