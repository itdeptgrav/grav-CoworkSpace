"use client";
/**
 * /app/coworking/office-monitor/page.js
 * Office Monitor — All Devices Dashboard
 * CEO-only. Renders inside CoworkingShell (no extra wrapper needed).
 * Matches CoWork light theme exactly.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { omDb } from "../../../lib/officeMonitorFirebase";
import CoworkingShell from "../../../components/coworking/layout/CoworkingShell";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";

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

const STOP_REASON_LABELS = {
    UNINSTALLED: "Uninstalled by user",
    PROCESS_KILLED_OR_STOPPED: "Killed via Task Manager",
    MANUALLY_STOPPED_VIA_CMD: "Stopped via Command Prompt",
    AGENT_CRASHED: "Agent crashed unexpectedly",
    AGENT_STOPPED: "Stopped normally",
    LAPTOP_SLEEP: "Laptop went to sleep",
};

function getDeviceStatus(device, now) {
    if (device.agentStatus === "stopped") return "stopped";
    if (!device.lastSeen) return "unknown";
    const diff = now - device.lastSeen.toDate().getTime();
    if (diff < 90000) return "online";
    if (diff < 300000) return "warning";
    return "offline";
}

function LiveActivityBadge({ machineId }) {
    const [curr, setCurr] = useState(null);
    useEffect(() => {
        const unsub = onSnapshot(doc(omDb, "current_activity", machineId), (snap) => {
            if (snap.exists() && snap.data().isActive) {
                const updatedAt = snap.data().updatedAt?.toDate?.();
                const stale = updatedAt ? Date.now() - updatedAt.getTime() > 15000 : true;
                setCurr(stale ? null : snap.data());
            } else setCurr(null);
        });
        return () => unsub();
    }, [machineId]);
    if (!curr) return null;
    const isIdle = curr.isIdle === true;
    const color = isIdle ? "#D97706" : (CAT_COLORS[curr.category] || "#94a3b8");
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "2px 9px", borderRadius: 20,
            background: color + "15", border: `1px solid ${color}30`,
            fontSize: 11, fontWeight: 600, color, marginTop: 4,
        }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
            {isIdle ? "⏸ Idle —" : ""} {curr.siteLabel}
            {!isIdle && curr.category && <span style={{ opacity: 0.7, fontWeight: 400 }}>· {curr.category}</span>}
        </span>
    );
}

export default function OfficeMonitorPage() {
    const { role, loading } = useCoworkAuth();
    const router = useRouter();
    const [devices, setDevices] = useState([]);
    const [now, setNow] = useState(Date.now());
    const [mounted, setMounted] = useState(false);
    const [renaming, setRenaming] = useState(null);
    const [newName, setNewName] = useState("");

    const [updateVersion, setUpdateVersion] = useState("")
    const [updateFile, setUpdateFile] = useState(null)
    const [updateSaved, setUpdateSaved] = useState(false)
    const [updateProgress, setUpdateProgress] = useState(0)
    const [updatePushed, setUpdatePushed] = useState(false)
    const [deployedVersion, setDeployedVersion] = useState(null)
    const [pushing, setPushing] = useState(false)
    const [releasing, setReleasing] = useState(false)
    const [showSettings, setShowSettings] = useState(false)

    useEffect(() => {
        return onSnapshot(doc(omDb, "config", "agent_version"), (snap) => {
            if (snap.exists()) setDeployedVersion(snap.data())
        })
    }, [])

    useEffect(() => {
        if (!loading && role && role !== "ceo") router.replace("/coworking");
    }, [role, loading, router]);

    useEffect(() => {
        setMounted(true);
        const t = setInterval(() => setNow(Date.now()), 5000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        const unsub = onSnapshot(collection(omDb, "devices"), (snap) => {
            const list = snap.docs.map((d) => ({ machineId: d.id, ...d.data() }));
            list.sort((a, b) => {
                const order = { active: 0, pending: 1, inactive: 2 };
                return (order[a.status] ?? 3) - (order[b.status] ?? 3);
            });
            setDevices(list);
        });
        return () => unsub();
    }, []);

    const activateDevice = (id) => updateDoc(doc(omDb, "devices", id), { status: "active", tracking: true, agentStatus: "running" });
    const deactivateDevice = (id) => updateDoc(doc(omDb, "devices", id), { status: "inactive", tracking: false });
    const toggleTracking = (id, cur) => updateDoc(doc(omDb, "devices", id), { tracking: !cur });
    const renameDevice = async (id) => {
        if (!newName.trim()) return;
        await updateDoc(doc(omDb, "devices", id), { customName: newName.trim() });
        setRenaming(null); setNewName("");
    };

    const handleSave = () => {
        if (!updateVersion.trim() || !updateFile) return
        setUpdateSaved(true)
        setUpdatePushed(false)
    }

    const handlePushFirebase = async () => {
        if (!updateFile || !updateVersion.trim()) return
        setPushing(true)
        setUpdateProgress(0)
        try {
            const { ref, uploadBytesResumable, getDownloadURL } = await import("firebase/storage")
            const { omStorage } = await import("../../../lib/officeMonitorFirebase")
            const { setDoc } = await import("firebase/firestore")
            const storageRef = ref(omStorage, `agent/MonitorAgent_v${updateVersion}.exe`)
            const task = uploadBytesResumable(storageRef, updateFile)
            task.on("state_changed",
                (snap) => setUpdateProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
                (err) => { console.error(err); setPushing(false) },
                async () => {
                    const url = await getDownloadURL(task.snapshot.ref)
                    await setDoc(doc(omDb, "config", "agent_version"), {
                        version: updateVersion.trim(),
                        downloadUrl: url,
                        status: "draft",
                        updatedAt: new Date()
                    })
                    setUpdatePushed(true)
                    setPushing(false)
                }
            )
        } catch (e) { console.error(e); setPushing(false) }
    }

    const handlePushToUsers = async () => {
        setReleasing(true)
        await updateDoc(doc(omDb, "config", "agent_version"), {
            status: "released",
            releasedAt: new Date()
        })
        setReleasing(false)
    }


    const pending = devices.filter((d) => d.status === "pending");
    const active = devices.filter((d) => d.status === "active");
    const inactive = devices.filter((d) => d.status === "inactive");
    const onlineCount = active.filter((d) => getDeviceStatus(d, now) === "online").length;

    if (loading) return <CoworkingShell><div style={{ padding: 48, textAlign: "center", color: "#9CA3AF" }}>Loading…</div></CoworkingShell>;

    return (

        <div style={{ padding: "24px 28px", background: "#F8FAFC", minHeight: "100%" }}>

            {/* ── Page Header ── */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                    <div>
                        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 2 }}>Office Monitor</h1>
                        <p style={{ fontSize: 13, color: "#6B7280" }}>Monitor and manage all connected office laptops</p>
                    </div>
                    {/* Stats row */}
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        {[
                            { label: "Total", val: devices.length, color: "#374151" },
                            { label: "Online", val: onlineCount, color: "#059669" },
                            { label: "Pending", val: pending.length, color: "#D97706" },
                            { label: "Inactive", val: inactive.length, color: "#9CA3AF" },
                        ].map((s) => (
                            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8 }}>
                                <span style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</span>
                                <span style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</span>
                            </div>
                        ))}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 4px #10B981" }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#059669" }}>Live</span>
                        </div>
                        <button
                            onClick={() => setShowSettings(prev => !prev)}
                            style={{ padding: "6px 14px", background: showSettings ? "#EEF2FF" : "#F9FAFB", color: showSettings ? "#6366F1" : "#374151", border: `1px solid ${showSettings ? "#C7D2FE" : "#E5E7EB"}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                            ⚙ Settings
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Pending ── */}
            {pending.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <div style={sectionHead}>
                        <span style={{ ...dot, background: "#D97706" }} />
                        <span style={sectionTitle}>Pending Activation</span>
                        <span style={pill}>{pending.length}</span>
                    </div>
                    {pending.map((d) => (
                        <div key={d.machineId} style={{ ...card, borderLeft: "3px solid #F59E0B" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
                                <div style={{ ...avatar, background: "#FEF3C7", color: "#D97706" }}>
                                    {(d.customName || d.machineId)[0].toUpperCase()}
                                </div>
                                <div>
                                    <div style={cardName}>{d.customName || d.machineId}</div>
                                    <div style={cardMeta}>{d.machineId} · {d.ipAddress} · Installed {d.installedAt?.toDate?.()?.toLocaleDateString()}</div>
                                </div>
                            </div>
                            <button style={btnPrimary} onClick={() => activateDevice(d.machineId)}>Activate</button>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Active ── */}
            {active.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <div style={sectionHead}>
                        <span style={{ ...dot, background: "#10B981" }} />
                        <span style={sectionTitle}>Active Devices</span>
                        <span style={{ ...pill, background: "#D1FAE5", color: "#059669" }}>{active.length}</span>
                    </div>
                    {active.map((d) => {
                        const status = getDeviceStatus(d, now);
                        const statusMap = {
                            online: { label: "● Online", color: "#059669", bg: "#D1FAE5" },
                            warning: { label: "⚠ No Signal", color: "#D97706", bg: "#FEF3C7" },
                            offline: { label: "● Offline", color: "#DC2626", bg: "#FEE2E2" },
                            stopped: { label: "✕ Stopped", color: "#DC2626", bg: "#FEE2E2" },
                            unknown: { label: "○ Unknown", color: "#9CA3AF", bg: "#F3F4F6" },
                        };
                        const st = statusMap[status] || statusMap.unknown;
                        return (
                            <div key={d.machineId} style={{
                                ...card,
                                borderLeft: `3px solid ${status === "online" ? "#10B981" : status === "warning" ? "#F59E0B" : "#EF4444"}`,
                            }}>
                                <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        ...avatar,
                                        background: status === "online" ? "#D1FAE5" : "#F3F4F6",
                                        color: status === "online" ? "#059669" : "#6B7280",
                                    }}>
                                        {(d.customName || d.machineId)[0].toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {renaming === d.machineId ? (
                                            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                                                <input
                                                    value={newName} autoFocus
                                                    onChange={(e) => setNewName(e.target.value)}
                                                    onKeyDown={(e) => e.key === "Enter" && renameDevice(d.machineId)}
                                                    placeholder="Enter name"
                                                    style={{ padding: "5px 10px", border: "1.5px solid #2563EB", borderRadius: 6, fontSize: 13, outline: "none", width: 160, color: "#111827" }}
                                                />
                                                <button style={btnSmallPrimary} onClick={() => renameDevice(d.machineId)}>Save</button>
                                                <button style={btnSmallGhost} onClick={() => setRenaming(null)}>Cancel</button>
                                            </div>
                                        ) : (
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                                                <span style={cardName}>{d.customName || d.machineId}</span>
                                                <button style={{ background: "none", border: "none", color: "#9CA3AF", fontSize: 13, cursor: "pointer", padding: "0 2px" }}
                                                    onClick={() => { setRenaming(d.machineId); setNewName(d.customName || ""); }}>✎</button>
                                                <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: d.tracking ? "#D1FAE5" : "#F3F4F6", color: d.tracking ? "#059669" : "#6B7280" }}>
                                                    {d.tracking ? "● Tracking" : "○ Paused"}
                                                </span>
                                            </div>
                                        )}
                                        <div style={cardMeta}>
                                            {d.machineId} · {d.ipAddress} · Last seen {d.lastSeen?.toDate?.()?.toLocaleTimeString()}
                                            {d.lastLoginTime && ` · Login ${d.lastLoginTime?.toDate?.()?.toLocaleTimeString()}`}
                                        </div>
                                        <LiveActivityBadge machineId={d.machineId} />
                                        {d.lastSecurityAlert && (
                                            <div style={{ marginTop: 5, padding: "3px 8px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 5, fontSize: 11, color: "#92400E", display: "inline-block" }}>
                                                ⚠ {d.lastSecurityAlert}{d.lastAlertDetails && ` — ${d.lastAlertDetails}`}
                                            </div>
                                        )}
                                        {(status === "stopped" || status === "offline") && d.stopReason && (
                                            <div style={{ marginTop: 4, padding: "3px 8px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 5, fontSize: 11, color: "#B91C1C", display: "inline-block" }}>
                                                ✕ {STOP_REASON_LABELS[d.stopReason] || d.stopReason}
                                                {d.stoppedAt && ` at ${d.stoppedAt?.toDate?.()?.toLocaleTimeString()}`}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                                    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>{st.label}</span>
                                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                        <button style={d.tracking ? btnWarning : btnSuccess} onClick={() => toggleTracking(d.machineId, d.tracking)}>
                                            {d.tracking ? "Pause" : "Resume"}
                                        </button>
                                        <button style={btnBlue} onClick={() => router.push(`/coworking/office-monitor/${d.machineId}`)}>
                                            View Activity →
                                        </button>
                                        <button style={btnDanger} onClick={() => deactivateDevice(d.machineId)}>Deactivate</button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Inactive ── */}
            {inactive.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <div style={sectionHead}>
                        <span style={{ ...dot, background: "#D1D5DB" }} />
                        <span style={sectionTitle}>Inactive Devices</span>
                        <span style={pill}>{inactive.length}</span>
                    </div>
                    {inactive.map((d) => (
                        <div key={d.machineId} style={{ ...card, opacity: 0.6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
                                <div style={{ ...avatar, background: "#F3F4F6", color: "#9CA3AF" }}>
                                    {(d.customName || d.machineId)[0].toUpperCase()}
                                </div>
                                <div>
                                    <div style={cardName}>{d.customName || d.machineId}</div>
                                    <div style={cardMeta}>{d.machineId} · {d.ipAddress}</div>
                                </div>
                            </div>
                            <button style={btnPrimary} onClick={() => activateDevice(d.machineId)}>Reactivate</button>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Update Manager ── */}
            {showSettings && <div style={{ marginBottom: 24 }}>
                <div style={sectionHead}>
                    <span style={{ ...dot, background: "#6366F1" }} />
                    <span style={sectionTitle}>Agent Update Manager</span>
                </div>
                <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>

                    {deployedVersion && (
                        <div style={{ marginBottom: 16, padding: "10px 14px", background: deployedVersion.status === "released" ? "#ECFDF5" : "#FFFBEB", border: `1px solid ${deployedVersion.status === "released" ? "#A7F3D0" : "#FDE68A"}`, borderRadius: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, color: "#6B7280" }}>Current deployed version:</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", fontFamily: "monospace" }}>v{deployedVersion.version}</span>
                            <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: deployedVersion.status === "released" ? "#D1FAE5" : "#FEF3C7", color: deployedVersion.status === "released" ? "#059669" : "#D97706" }}>
                                {deployedVersion.status === "released" ? "✓ Released" : "Draft"}
                            </span>
                            {deployedVersion.releasedAt && (
                                <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                                    Released {new Date(deployedVersion.releasedAt.seconds * 1000).toLocaleString()}
                                </span>
                            )}
                        </div>
                    )}


                    <div style={{ marginBottom: 16, fontSize: 12, color: "#6B7280" }}>
                        Run <code style={{ background: "#F3F4F6", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>node push-update.js 1.1</code> on dev laptop to upload new version. Then click Push to User Laptops.
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                            onClick={handlePushToUsers}
                            disabled={!deployedVersion || deployedVersion.status === "released" || releasing}
                            style={{ padding: "8px 18px", background: "#FEF3C7", color: "#D97706", border: "1px solid #FDE68A", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: (!deployedVersion || deployedVersion.status === "released" || releasing) ? "not-allowed" : "pointer" }}
                        >
                            {releasing ? "⏳ Releasing..." : "🚀 Push to User Laptops"}
                        </button>
                    </div>

                    {pushing && updateProgress > 0 && (
                        <div style={{ marginTop: 12, background: "#F3F4F6", borderRadius: 6, height: 6, overflow: "hidden" }}>
                            <div style={{ height: "100%", background: "#6366F1", borderRadius: 6, width: `${updateProgress}%`, transition: "width 0.3s" }} />
                        </div>
                    )}

                    <div style={{ marginTop: 14, fontSize: 11, color: "#9CA3AF", lineHeight: 1.6 }}>
                        <strong style={{ color: "#6B7280" }}>Workflow:</strong> 1. Build new exe on dev laptop → 2. Run <code style={{ background: "#F3F4F6", padding: "1px 4px", borderRadius: 3 }}>node push-update.js 1.1</code> in CMD → 3. Click Push to User Laptops
                    </div>
                </div>
            </div>}

            {/* ── Empty ── */}
            {mounted && devices.length === 0 && (
                <div style={{ textAlign: "center", padding: "80px 0" }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: "#374151", marginBottom: 8 }}>No devices connected</div>
                    <div style={{ fontSize: 13, color: "#9CA3AF" }}>Run OfficeMonitorSetup.exe on an office laptop to get started</div>
                </div>
            )}
        </div>

    );
}

// ── Shared style tokens ───────────────────────────────────────────────────────
const sectionHead = { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 };
const sectionTitle = { fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em" };
const dot = { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 };
const pill = { padding: "1px 8px", borderRadius: 20, background: "#F3F4F6", color: "#6B7280", fontSize: 11, fontWeight: 600 };

const card = {
    background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10,
    padding: "14px 18px", marginBottom: 8,
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};
const avatar = {
    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 700, fontSize: 15,
};
const cardName = { fontSize: 14, fontWeight: 600, color: "#111827" };
const cardMeta = { fontSize: 11, color: "#9CA3AF", fontFamily: "monospace", marginTop: 1 };

const btnPrimary = { padding: "7px 16px", background: "#1B4F8A", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" };
const btnSmallPrimary = { padding: "4px 12px", background: "#1B4F8A", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" };
const btnSmallGhost = { padding: "4px 10px", background: "#F3F4F6", color: "#374151", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" };
const btnSuccess = { padding: "6px 12px", background: "#D1FAE5", color: "#059669", border: "1px solid #A7F3D0", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer" };
const btnWarning = { padding: "6px 12px", background: "#FEF3C7", color: "#D97706", border: "1px solid #FDE68A", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer" };
const btnBlue = { padding: "6px 12px", background: "#EBF3FE", color: "#1A73E8", border: "1px solid #BFDBFE", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer" };
const btnDanger = { padding: "6px 12px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer" };