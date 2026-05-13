"use client";
import { useEffect, useState, useCallback } from "react";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../components/coworking/layout/CoworkingShell";
import { firebaseAuth, firebaseDb } from "../../../lib/coworkFirebase";
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import {
    fetchSops, createSop, updateSop, deleteSop,
    approveSop, rejectSop, applyBleach, fetchBleachHistory,
    fetchFolders, createFolder, deleteFolder,
    requestRecheck, reviewRecheck, fetchRecheckList,
    fetchTaskSuggestions, dismissTaskSuggestion,
} from "../../../lib/coworkApi";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const T = {
    blue: "#1A73E8", blueDark: "#1558B0", blueLight: "#EBF3FE", blueBorder: "#BFDBFE",
    red: "#DC2626", redLight: "#FEF2F2", redBorder: "#FECACA",
    purple: "#7C3AED", border: "#E4E7EC", borderLight: "#F3F4F6",
    text: "#1A1D21", textSub: "#6B7280", textMuted: "#9AA0A6",
    surface: "#F8FAFC", surfaceHover: "#F0F7FF",
};

export default function SopPage() {
    const { role, employeeName, employeeId, loading: authLoading } = useCoworkAuth();

    const [sops, setSops] = useState([]);
    const [folders, setFolders] = useState([]);
    const [sopsLoading, setSopsLoading] = useState(false);
    const [allEmployees, setAllEmployees] = useState([]);
    const [recheckList, setRecheckList] = useState([]);
    const [taskSuggestions, setTaskSuggestions] = useState([]);
    const [suggestBleachModal, setSuggestBleachModal] = useState(null); // task suggestion object // pending recheck employees

    const [showCreate, setShowCreate] = useState(false);
    const [editingSop, setEditingSop] = useState(null);
    const [bleachOpen, setBleachOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [collapsedFolders, setCollapsedFolders] = useState({}); // { folderName: true/false }

    const toggleFolder = (name) => setCollapsedFolders(prev => ({ ...prev, [name]: !prev[name] }));

    // Managers panel
    const [mgrOpen, setMgrOpen] = useState(false);
    const [primaryManager, setPrimaryManager] = useState(null);
    const [secondaryManager, setSecondaryManager] = useState(null);
    const [panelTarget, setPanelTarget] = useState("primary");
    const panelManager = panelTarget === "primary" ? primaryManager : secondaryManager;
    const panelColor = panelTarget === "primary" ? T.blue : T.purple;
    const panelLabel = panelTarget === "primary" ? "Primary Manager" : "Secondary Manager";

    const loadData = useCallback(async () => {
        setSopsLoading(true);
        try {
            const [sopData, folderData] = await Promise.all([fetchSops(), fetchFolders()]);
            setSops(sopData.sops || []);
            setFolders(folderData.folders || []);
            // Load pending rechecks for TL/CEO
            if (role === "ceo" || role === "tl") {
                const rData = await fetchRecheckList().catch(() => ({ list: [] }));
                setRecheckList(rData.list || []);
                const sData = await fetchTaskSuggestions().catch(() => ({ suggestions: [] }));
                setTaskSuggestions(sData.suggestions || []);
            }
        } catch (e) { console.error(e); }
        finally { setSopsLoading(false); }
    }, [role]);

    useEffect(() => { if (role) loadData(); }, [role, loadData]);

    useEffect(() => {
        getDocs(collection(firebaseDb, "cowork_employees"))
            .then(snap => { const a = []; snap.forEach(d => { if (d.data().role !== "ceo") a.push(d.data()); }); setAllEmployees(a); })
            .catch(console.error);
    }, []);

    useEffect(() => {
        if (!employeeId) return;
        firebaseAuth.currentUser?.getIdToken()
            .then(t => fetch(`${BASE}/cowork/employee/my-managers/${employeeId}`, { headers: { Authorization: `Bearer ${t}` } }))
            .then(r => r.json())
            .then(d => { if (d.success) { setPrimaryManager(d.primaryManager); setSecondaryManager(d.secondaryManager); } })
            .catch(console.error);
    }, [employeeId]);

    if (authLoading) return null;

    const myDept = allEmployees.find(e => e.employeeId === employeeId)?.department || "";
    const bleachableEmps = role === "ceo" ? allEmployees : allEmployees.filter(e => e.department === myDept && e.role === "employee");
    const approvedSops = sops.filter(s => s.status === "approved");

    const handleDelete = async (sop) => {
        if (!window.confirm(`Delete SOP "${sop.name}"?`)) return;
        await deleteSop(sop._id); loadData();
    };
    const handleApprove = async (sop) => { await approveSop(sop._id); loadData(); };
    const handleReject = async (sop) => { await rejectSop(sop._id); loadData(); };
    const handleDeleteFolder = async (folder) => {
        if (!window.confirm(`Delete folder "${folder.name}"? SOPs inside will move to Uncategorized.`)) return;
        await deleteFolder(folder._id); loadData();
    };

    // Group SOPs by folder for display
    const grouped = {};
    sops.forEach(sop => {
        const key = sop.folderName || "Uncategorized";
        if (!grouped[key]) grouped[key] = { folderName: key, folderId: sop.folderId, sops: [] };
        grouped[key].sops.push(sop);
    });
    // Add empty folders too
    folders.forEach(f => { if (!grouped[f.name]) grouped[f.name] = { folderName: f.name, folderId: f._id, sops: [] }; });
    const groupedList = Object.values(grouped).sort((a, b) => {
        if (a.folderName === "Uncategorized") return 1;
        if (b.folderName === "Uncategorized") return -1;
        return a.folderName.localeCompare(b.folderName);
    });

    return (
        <>
            <style>{`
                @keyframes sopSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
                .sop-emp-row{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid ${T.borderLight};cursor:pointer;transition:background 0.1s;}
                .sop-emp-row:hover,.sop-emp-row.active{background:${T.blueLight};}
                .sop-emp-row:last-child{border-bottom:none;}
                .sop-bleach-emp-list{width:320px;min-width:300px;border-right:1px solid ${T.border};display:flex;flex-direction:column;flex-shrink:0;}
                .sop-bleach-right{flex:1;display:flex;flex-direction:column;min-width:0;}
                @media(max-width:639px){
                    .sop-bleach-emp-list{width:100%!important;min-width:unset!important;border-right:none!important;}
                    .sop-bleach-emp-list.has-selected{display:none!important;}
                    .sop-bleach-right{width:100%;}
                }
                .sop-prow{display:flex;align-items:flex-start;gap:12px;padding:11px 0;border-bottom:1px solid ${T.borderLight};}
                .sop-prow:last-child{border-bottom:none;}
                .sop-folder-block{border:1px solid ${T.border};border-radius:12px;overflow:hidden;margin-bottom:16px;}
                .sop-folder-header{background:${T.surface};border-bottom:1px solid ${T.border};padding:10px 16px;display:flex;align-items:center;gap:8px;}
                @keyframes recheckPulse{0%,100%{opacity:1}50%{opacity:0.75}}
                @media(max-width:600px){
                    .sop-topbar{flex-direction:column!important;align-items:flex-start!important;}
                    .sop-topbar-btns{flex-wrap:wrap!important;width:100%;}
                    .sop-topbar-btns button{flex:1;justify-content:center;}
                }
            `}</style>

            <CoworkingShell role={role} employeeName={employeeName} employeeId={employeeId} title="SOP">
                <div style={{ padding: "24px", fontFamily: "inherit" }}>

                    {/* Top bar */}
                    <div className="sop-topbar" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>Standard Operating Procedure</div>
                            <div style={{ fontSize: 13, color: T.textSub, marginTop: 3 }}>
                                {role === "ceo" ? "All department SOPs and compliance"
                                    : role === "tl" ? "Your department SOPs and team compliance"
                                        : "Your compliance history"}
                            </div>
                        </div>
                        <div className="sop-topbar-btns" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <TBtn outline onClick={() => { setPanelTarget("primary"); setMgrOpen(true); }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
                                View Managers
                            </TBtn>
                            {(role === "ceo" || role === "tl") && (
                                <TBtn red onClick={() => setBleachOpen(true)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
                                    SOP Bleach
                                </TBtn>
                            )}
                            {(role === "ceo" || role === "tl") && (
                                <TBtn blue onClick={() => { setEditingSop(null); setShowCreate(true); }}>+ Create SOP</TBtn>
                            )}
                            {role === "ceo" && (
                                <TBtn outline onClick={() => setSettingsOpen(true)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                                    </svg>
                                    Settings
                                </TBtn>
                            )}
                        </div>
                    </div>

                    {/* ── Pending Recheck Banner (TL/CEO only) ── */}
                    {(role === "ceo" || role === "tl") && recheckList.length > 0 && (
                        <div
                            onClick={() => setBleachOpen(true)}
                            style={{
                                display: "flex", alignItems: "center", gap: 12,
                                padding: "12px 18px", marginBottom: 20,
                                background: "#FFFBEB", border: "1.5px solid #FCD34D",
                                borderRadius: 10, cursor: "pointer",
                                animation: "recheckPulse 2s ease-in-out infinite",
                                boxShadow: "0 2px 12px rgba(251,191,36,0.25)",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "#FEF3C7"}
                            onMouseLeave={e => e.currentTarget.style.background = "#FFFBEB"}
                        >
                            {/* Bell icon */}
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
                                </svg>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>
                                    {recheckList.reduce((s, e) => s + e.pendingCount, 0)} Pending Recheck Request{recheckList.reduce((s, e) => s + e.pendingCount, 0) > 1 ? "s" : ""}
                                </div>
                                <div style={{ fontSize: 12, color: "#B45309", marginTop: 2 }}>
                                    {recheckList.map(e => e.name).join(", ")} — click to review
                                </div>
                            </div>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2.5" strokeLinecap="round">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </div>
                    )}

                    {/* ── Task Bleach Suggestions (TL/CEO only) ── */}
                    {(role === "ceo" || role === "tl") && taskSuggestions.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                                Task Bleach Suggestions — {taskSuggestions.length} pending
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {taskSuggestions.map((s, i) => (
                                    <div key={i} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                        {/* Left: all info */}
                                        <div style={{ flex: 1, minWidth: 200 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: "#D97706", background: "#FFFBEB", border: "1px solid #FDE68A", padding: "2px 8px", borderRadius: 99 }}>⚠️ {s.eventLabel}</span>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: T.red, background: T.redLight, border: `1px solid ${T.redBorder}`, padding: "2px 8px", borderRadius: 6 }}>{s.suggestedPoints} pts</span>
                                            </div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{s.taskTitle}</div>
                                            <div style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>{s.assigneeName} · {s.department}</div>
                                        </div>
                                        {/* Right: button */}
                                        <button
                                            onClick={() => setSuggestBleachModal(s)}
                                            style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: T.red, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap" }}
                                            onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                                            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                                        >
                                            Suggest Bleach
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Employee — own bleach history */}
                    {role === "employee" && <OwnHistory employeeId={employeeId} />}

                    {/* Admin/TL — folder grouped SOP list */}
                    {(role === "ceo" || role === "tl") && (
                        sopsLoading ? <Spinner /> : groupedList.length === 0
                            ? <div style={{ textAlign: "center", padding: "60px 0", color: T.textMuted }}>
                                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No SOPs yet</div>
                                <div style={{ fontSize: 13 }}>Click "Create SOP" to add the first one.</div>
                            </div>
                            : groupedList.map(group => (
                                <div key={group.folderName} className="sop-folder-block">
                                    {/* Folder header */}
                                    <div className="sop-folder-header">
                                        {/* Toggle button */}
                                        <button onClick={() => toggleFolder(group.folderName)}
                                            style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.border}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
                                            {collapsedFolders[group.folderName]
                                                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.textSub} strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
                                                : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.textSub} strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15" /></svg>
                                            }
                                        </button>
                                        <span style={{ fontSize: 16 }}>📁</span>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1 }}>{group.folderName}</span>
                                        <span style={{ fontSize: 11, color: T.textMuted, marginRight: 8 }}>{group.sops.length} SOP{group.sops.length !== 1 ? "s" : ""}</span>
                                        {group.folderName !== "Uncategorized" && group.folderId && (role === "ceo" || folders.find(f => f._id === group.folderId)?.createdBy === employeeId) && (
                                            <button onClick={() => handleDeleteFolder({ _id: group.folderId, name: group.folderName })}
                                                style={{ padding: "3px 8px", border: `1px solid ${T.redBorder}`, borderRadius: 5, background: T.redLight, color: T.red, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                                Delete Folder
                                            </button>
                                        )}
                                    </div>

                                    {/* SOPs — hidden when collapsed */}
                                    {!collapsedFolders[group.folderName] && (
                                        <>
                                            {group.sops.length === 0
                                                ? <div style={{ padding: "14px 16px", fontSize: 12, color: T.textMuted }}>No SOPs in this folder yet.</div>
                                                : <div style={{ background: "#fff" }}>
                                                    {group.sops.map((sop, idx) => (
                                                        <div key={sop._id} style={{ padding: "12px 16px", borderBottom: idx < group.sops.length - 1 ? `1px solid ${T.borderLight}` : "none" }}>
                                                            {/* Row 1: name + pts + status */}
                                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                                                                <div style={{ fontSize: 14, fontWeight: 700, color: T.text, flex: 1 }}>{sop.name}</div>
                                                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                                    <span style={{ fontWeight: 700, color: T.red, background: T.redLight, border: `1px solid ${T.redBorder}`, padding: "2px 8px", borderRadius: 6, fontSize: 12 }}>{sop.points} pts</span>
                                                                    <StatusBadge status={sop.status} />
                                                                </div>
                                                            </div>
                                                            {/* Row 2: dept + created by */}
                                                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                                                                <span style={{ fontSize: 11, color: T.textSub, background: T.surface, padding: "1px 7px", borderRadius: 4, border: `1px solid ${T.border}` }}>{sop.department}</span>
                                                                <span style={{ fontSize: 11, color: T.textSub }}>{sop.createdByName} · <span style={{ color: T.textMuted }}>{sop.createdByRole === "ceo" ? "Admin" : "Team Lead"}</span></span>
                                                            </div>
                                                            {/* Row 3: description */}
                                                            {sop.description && (
                                                                <div style={{ fontSize: 12, color: T.textSub, marginBottom: 8, lineHeight: 1.4 }}>{sop.description}</div>
                                                            )}
                                                            {/* Row 4: action buttons */}
                                                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                                                {role === "ceo" && sop.status === "pending" && (
                                                                    <><ABtn green onClick={() => handleApprove(sop)}>Approve</ABtn><ABtn red onClick={() => handleReject(sop)}>Reject</ABtn></>
                                                                )}
                                                                {(role === "ceo" || sop.createdBy === employeeId) && (
                                                                    <ABtn blue onClick={() => { setEditingSop(sop); setShowCreate(true); }}>Edit</ABtn>
                                                                )}
                                                                {(role === "ceo" || sop.createdBy === employeeId) && (
                                                                    <ABtn red onClick={() => handleDelete(sop)}>Delete</ABtn>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            }
                                        </>
                                    )}
                                </div>
                            ))
                    )}
                </div>
            </CoworkingShell>

            {/* Create/Edit SOP Panel */}
            {showCreate && (
                <SopForm
                    editing={editingSop} role={role} myDept={myDept}
                    employeeId={employeeId} employeeName={employeeName}
                    folders={folders}
                    allDepts={[...new Set(allEmployees.map(e => e.department).filter(Boolean))].sort()}
                    onClose={() => { setShowCreate(false); setEditingSop(null); }}
                    onSaved={loadData}
                />
            )}

            {/* Bleach Panel */}
            {bleachOpen && (
                <BleachPanel
                    role={role} employees={bleachableEmps}
                    approvedSops={approvedSops} folders={folders}
                    employeeId={employeeId} employeeName={employeeName}
                    recheckList={recheckList}
                    onClose={() => setBleachOpen(false)}
                />
            )}

            {/* Managers Panel */}
            {mgrOpen && (
                <>
                    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 999 }} onClick={() => setMgrOpen(false)} />
                    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 380, maxWidth: "100vw", background: "#fff", borderLeft: `1px solid ${T.border}`, boxShadow: "-8px 0 32px rgba(0,0,0,0.15)", zIndex: 1000, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
                        <div style={{ background: panelColor, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                            <Av name={panelManager?.name} url={panelManager?.profilePhotoUrl} size={44} bg="rgba(255,255,255,0.2)" fg="#fff" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>{panelLabel}</div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{panelManager?.name || "Not assigned"}</div>
                                {panelManager?.designation && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>{panelManager.designation}</div>}
                            </div>
                            <button onClick={() => setMgrOpen(false)} style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: "rgba(255,255,255,0.2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
                            {["primary", "secondary"].map(t => (
                                <button key={t} onClick={() => setPanelTarget(t)} style={{ flex: 1, padding: "10px 8px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, background: panelTarget === t ? T.blueLight : "#fff", color: panelTarget === t ? T.blue : T.textSub, borderBottom: panelTarget === t ? `2px solid ${T.blue}` : "2px solid transparent" }}>
                                    {t === "primary" ? "Primary Manager" : "Secondary Manager"}
                                </button>
                            ))}
                        </div>
                        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
                            {!panelManager
                                ? <div style={{ textAlign: "center", padding: "40px 0", color: T.textMuted, fontSize: 13 }}>Not assigned in HR records.</div>
                                : <>
                                    <PRow label="Full Name" value={panelManager.name} />
                                    <PRow label="Designation" value={panelManager.designation} />
                                    <PRow label="Department" value={panelManager.department} />
                                    <PRow label="Employee ID" value={panelManager.biometricId ? <code style={{ fontFamily: "monospace", fontWeight: 700, color: T.text, background: T.borderLight, padding: "2px 7px", borderRadius: 5, fontSize: 12 }}>{panelManager.biometricId}</code> : null} />
                                    <PRow label="Phone" value={panelManager.phone ? <a href={`tel:${panelManager.phone}`} style={{ color: panelColor, fontWeight: 600, textDecoration: "none" }}>{panelManager.phone}</a> : null} />
                                    <PRow label="Email" value={panelManager.email ? <a href={`mailto:${panelManager.email}`} style={{ color: panelColor, fontWeight: 600, textDecoration: "none", wordBreak: "break-all", fontSize: 12 }}>{panelManager.email}</a> : null} />
                                </>
                            }
                        </div>
                    </div>
                </>
            )}
            {/* Suggest Bleach Modal */}
            {suggestBleachModal && (
                <SuggestBleachModal
                    suggestion={suggestBleachModal}
                    approvedSops={approvedSops}
                    employeeId={employeeId}
                    employeeName={employeeName}
                    onClose={(rejected) => {
                        if (rejected) {
                            setTaskSuggestions(prev => prev.filter(s => !(s.taskId === suggestBleachModal.taskId && s.eventKey === suggestBleachModal.eventKey)));
                            dismissTaskSuggestion({ taskId: suggestBleachModal.taskId, eventKey: suggestBleachModal.eventKey, assigneeId: suggestBleachModal.assigneeId }).catch(console.error);
                        }
                        setSuggestBleachModal(null);
                    }}
                    onDone={(appliedTaskId, appliedEventKey) => {
                        setSuggestBleachModal(null);
                        setTaskSuggestions(prev => prev.filter(s => !(s.taskId === appliedTaskId && s.eventKey === appliedEventKey)));
                    }}
                />
            )}

            {/* Settings Panel */}
            {settingsOpen && (
                <SopSettingsPanel
                    employeeId={employeeId}
                    employeeName={employeeName}
                    onClose={() => setSettingsOpen(false)}
                />
            )}
        </>
    );
}

// ── SOP FORM PANEL (with folder picker + create folder inline) ────────────────
function SopForm({ editing, role, myDept, employeeId, employeeName, folders, allDepts, onClose, onSaved }) {
    const [name, setName] = useState(editing?.name || "");
    const [points, setPoints] = useState(editing?.points || "");
    const [desc, setDesc] = useState(editing?.description || "");
    const [dept, setDept] = useState(editing?.department || (role === "tl" ? myDept : ""));
    const [folderId, setFolderId] = useState(editing?.folderId || "");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    // New folder creation inline
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [folderBusy, setFolderBusy] = useState(false);
    const [localFolders, setLocalFolders] = useState(folders);

    // Filter folders by dept
    const deptFolders = localFolders.filter(f => !dept || f.department === dept);

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        if (!dept) return setErr("Select a department first.");
        setFolderBusy(true);
        try {
            const d = await createFolder({ name: newFolderName.trim(), department: dept });
            setLocalFolders(prev => [...prev, d.folder]);
            setFolderId(d.folder._id);
            setNewFolderName(""); setShowNewFolder(false);
        } catch (e) { setErr(e.message); }
        finally { setFolderBusy(false); }
    };

    const save = async () => {
        if (!name.trim() || !points || !desc.trim() || !dept) return setErr("All fields are required.");
        if (isNaN(points) || Number(points) < 0.5) return setErr("Points must be at least 0.5.");
        setErr(""); setBusy(true);
        try {
            const body = { name: name.trim(), points: Number(points), description: desc.trim(), department: dept, folderId: folderId || null };
            if (editing) await updateSop(editing._id, body);
            else await createSop(body);
            onSaved(); onClose();
        } catch (e) { setErr(e.message); }
        finally { setBusy(false); }
    };

    return (
        <>
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 999 }} onClick={onClose} />
            <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "100vw", background: "#fff", borderLeft: `1px solid ${T.border}`, boxShadow: "-8px 0 32px rgba(0,0,0,0.15)", zIndex: 1000, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
                <div style={{ background: T.blue, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{editing ? "Edit SOP" : "Create SOP"}</div>
                    <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: "rgba(255,255,255,0.2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>
                {role === "tl" && <div style={{ padding: "10px 18px", background: "#FFFBEB", borderBottom: "1px solid #FDE68A", fontSize: 12, color: "#92400E" }}>⏳ Requires Admin approval before becoming active.</div>}

                <div style={{ flex: 1, overflowY: "auto", padding: "20px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                    {err && <div style={{ padding: "10px 12px", background: T.redLight, border: `1px solid ${T.redBorder}`, borderRadius: 8, fontSize: 12, color: T.red }}>{err}</div>}

                    <FLabel label="SOP Name *"><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Late Login" style={iStyle} /></FLabel>
                    <FLabel label="Deduction Points *"><input type="number" value={points} onChange={e => setPoints(e.target.value)} placeholder="e.g. 1.0" step="0.5" min="0.5" style={iStyle} /></FLabel>

                    <FLabel label="Department *">
                        {role === "tl"
                            ? <input value={myDept} disabled style={{ ...iStyle, background: "#F9FAFB", color: T.textSub }} />
                            : <select value={dept} onChange={e => { setDept(e.target.value); setFolderId(""); }} style={iStyle}>
                                <option value="">Select department…</option>
                                {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        }
                    </FLabel>

                    {/* Folder picker */}
                    <FLabel label="Folder">
                        <div style={{ display: "flex", gap: 8 }}>
                            <select value={folderId} onChange={e => setFolderId(e.target.value)} style={{ ...iStyle, flex: 1 }} disabled={!dept}>
                                <option value="">Uncategorized</option>
                                {deptFolders.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                            </select>
                            {dept && (
                                <button type="button" onClick={() => setShowNewFolder(v => !v)}
                                    style={{ padding: "0 12px", border: `1px solid ${T.blueBorder}`, borderRadius: 8, background: T.blueLight, color: T.blue, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                                    + New
                                </button>
                            )}
                        </div>
                        {showNewFolder && (
                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Folder name…" style={{ ...iStyle, flex: 1 }} onKeyDown={e => e.key === "Enter" && handleCreateFolder()} />
                                <button type="button" onClick={handleCreateFolder} disabled={folderBusy || !newFolderName.trim()}
                                    style={{ padding: "0 12px", border: "none", borderRadius: 8, background: folderBusy ? "#93C5FD" : T.blue, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                                    {folderBusy ? "…" : "Create"}
                                </button>
                            </div>
                        )}
                    </FLabel>

                    <FLabel label="Description *"><textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe the violation…" rows={3} style={{ ...iStyle, resize: "vertical" }} /></FLabel>
                </div>

                <div style={{ padding: "14px 18px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 10 }}>
                    <button onClick={onClose} style={{ flex: 1, padding: "10px", border: `1px solid ${T.border}`, borderRadius: 8, background: "#fff", color: T.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                    <button onClick={save} disabled={busy} style={{ flex: 2, padding: "10px", border: "none", borderRadius: 8, background: busy ? "#93C5FD" : T.blue, color: "#fff", fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                        {busy ? "Saving…" : editing ? "Save Changes" : role === "tl" ? "Submit for Approval" : "Create SOP"}
                    </button>
                </div>
            </div>
        </>
    );
}

// ── BLEACH PANEL (2-step folder → SOP dropdown) ───────────────────────────────
function BleachPanel({ role, employees, approvedSops, folders, employeeId, employeeName, recheckList = [], onClose }) {
    const [selectedEmp, setSelectedEmp] = useState(null);
    const [history, setHistory] = useState(null);
    const [histLoading, setHistLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [selFolder, setSelFolder] = useState("");
    const [selSop, setSelSop] = useState(null);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [search, setSearch] = useState("");

    const loadHistory = async (emp) => {
        setHistLoading(true);
        try { const d = await fetchBleachHistory(emp.employeeId); setHistory(d); }
        catch (e) { console.error(e); }
        finally { setHistLoading(false); }
    };

    const selectEmp = (emp) => {
        setSelectedEmp(emp); setShowForm(false);
        setSelFolder(""); setSelSop(null); setNote(""); setErr("");
        loadHistory(emp);
    };

    const apply = async () => {
        if (!selSop) return setErr("Select an SOP.");
        setBusy(true); setErr("");
        try {
            await applyBleach({ targetEmployeeId: selectedEmp.employeeId, sopId: selSop._id, description: note.trim() });
            setShowForm(false); setSelFolder(""); setSelSop(null); setNote("");
            loadHistory(selectedEmp);
        } catch (e) { setErr(e.message); }
        finally { setBusy(false); }
    };

    const allBleaches = [];
    (history?.sopPoints || []).forEach(yp => (yp.bleaches || []).forEach(b => allBleaches.push({ ...b, year: yp.year })));
    allBleaches.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const grouped = allBleaches.reduce((acc, b) => { const d = b.date || "Unknown"; if (!acc[d]) acc[d] = []; acc[d].push(b); return acc; }, {});
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    const filtEmps = employees.filter(e => !search || e.name?.toLowerCase().includes(search.toLowerCase()));
    const recheckEmpIds = new Set(recheckList.map(r => r.employeeId));
    // Sort: employees with pending rechecks shown first
    const sortedEmps = [...filtEmps].sort((a, b) => (recheckEmpIds.has(b.employeeId) ? 1 : 0) - (recheckEmpIds.has(a.employeeId) ? 1 : 0));

    // SOPs for selected employee's dept
    const empDeptSops = approvedSops.filter(s => !selectedEmp || s.department === selectedEmp.department);

    // Folders that have approved SOPs for this employee's dept
    const relevantFolders = [...new Set(empDeptSops.map(s => s.folderName || "Uncategorized"))].sort((a, b) => {
        if (a === "Uncategorized") return 1;
        if (b === "Uncategorized") return -1;
        return a.localeCompare(b);
    });

    // SOPs filtered by selected folder
    const folderSops = selFolder ? empDeptSops.filter(s => (s.folderName || "Uncategorized") === selFolder) : [];

    return (
        <>
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 999 }} onClick={onClose} />
            <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: selectedEmp ? "min(740px, 100vw)" : "min(340px, 100vw)", maxWidth: "100vw", background: "#fff", borderLeft: `1px solid ${T.border}`, boxShadow: "-8px 0 32px rgba(0,0,0,0.15)", zIndex: 1000, display: "flex", flexDirection: selectedEmp ? "row" : "column", transition: "width 0.25s ease", fontFamily: "inherit" }}>

                {/* Left: Employee list */}
                <div className={`sop-bleach-emp-list${selectedEmp ? " has-selected" : ""}`}>
                    <div style={{ background: T.red, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>SOP Bleach</div>
                        <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "rgba(255,255,255,0.2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                    </div>
                    <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.borderLight}`, flexShrink: 0 }}>
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…" style={{ ...iStyle, padding: "7px 10px", fontSize: 12 }} />
                    </div>
                    <div style={{ flex: 1, overflowY: "auto" }}>
                        {sortedEmps.length === 0
                            ? <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T.textMuted }}>No employees.</div>
                            : sortedEmps.map((emp, i) => {
                                const hasRecheck = recheckEmpIds.has(emp.employeeId);
                                const recheckInfo = recheckList.find(r => r.employeeId === emp.employeeId);
                                return (
                                    <div key={emp.employeeId || i}
                                        className={`sop-emp-row${selectedEmp?.employeeId === emp.employeeId ? " active" : ""}`}
                                        onClick={() => selectEmp(emp)}
                                        style={{ background: hasRecheck && selectedEmp?.employeeId !== emp.employeeId ? "#FFFBEB" : undefined }}
                                    >
                                        <Av name={emp.name} url={emp.profilePicUrl} size={34} bg={T.blueLight} fg={T.blue} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{emp.name}</div>
                                            <div style={{ fontSize: 11, color: T.textSub }}>{emp.department} · {emp.employeeId}</div>
                                        </div>
                                        {hasRecheck && (
                                            <span style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "#FCD34D", padding: "2px 7px", borderRadius: 99, flexShrink: 0 }}>
                                                ⏳ {recheckInfo?.pendingCount}
                                            </span>
                                        )}
                                    </div>
                                );
                            })
                        }
                    </div>
                </div>

                {/* Right: History + Form */}
                {selectedEmp && (
                    <div className="sop-bleach-right">
                        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: T.surface, flexShrink: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {/* Back button — mobile only */}
                                <button onClick={() => setSelectedEmp(null)}
                                    className="sop-back-btn"
                                    style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, background: "#fff", cursor: "pointer", display: "none", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text} strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                                </button>
                                <style>{`@media(max-width:639px){.sop-back-btn{display:flex!important;}}`}</style>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{selectedEmp.name}</div>
                                    <div style={{ fontSize: 11, color: T.textSub }}>{selectedEmp.department} · {selectedEmp.employeeId}</div>
                                </div>
                            </div>
                            {!showForm && (
                                <button onClick={() => { setShowForm(true); setSelFolder(""); setSelSop(null); setNote(""); setErr(""); }}
                                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 7, background: T.red, border: "none", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                    + New Bleach
                                </button>
                            )}
                        </div>

                        {/* New bleach form — 2-step folder → SOP */}
                        {showForm && (
                            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, background: T.redLight, flexShrink: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#991B1B", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Apply Bleach — {selectedEmp.name}</div>
                                {err && <div style={{ fontSize: 12, color: T.red, marginBottom: 8 }}>{err}</div>}
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

                                    {/* Step 1: Folder */}
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: "#991B1B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Step 1 — Select Folder</div>
                                        <select value={selFolder} onChange={e => { setSelFolder(e.target.value); setSelSop(null); }} style={{ ...iStyle, fontSize: 12 }}>
                                            <option value="">Select folder…</option>
                                            {relevantFolders.map(f => <option key={f} value={f}>{f === "Uncategorized" ? "📂 Uncategorized" : `📁 ${f}`}</option>)}
                                        </select>
                                    </div>

                                    {/* Step 2: SOP inside folder */}
                                    {selFolder && (
                                        <div>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: "#991B1B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Step 2 — Select SOP</div>
                                            <select value={selSop?._id || ""} onChange={e => setSelSop(folderSops.find(s => s._id === e.target.value) || null)} style={{ ...iStyle, fontSize: 12 }}>
                                                <option value="">Select SOP…</option>
                                                {folderSops.map(s => <option key={s._id} value={s._id}>{s.name} ({s.points} pts)</option>)}
                                            </select>
                                        </div>
                                    )}

                                    {selSop && <div style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>-{selSop.points} pts · {selSop.description}</div>}

                                    <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Additional note (optional)…" rows={2} style={{ ...iStyle, resize: "none", fontSize: 12 }} />

                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "8px", border: `1px solid ${T.border}`, borderRadius: 7, background: "#fff", color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                                        <button onClick={apply} disabled={busy || !selSop} style={{ flex: 2, padding: "8px", border: "none", borderRadius: 7, background: busy || !selSop ? "#FCA5A5" : T.red, color: "#fff", fontSize: 12, fontWeight: 600, cursor: busy || !selSop ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                                            {busy ? "Applying…" : "Confirm Bleach"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Bleach history */}
                        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
                            {histLoading ? <Spinner /> : allBleaches.length === 0
                                ? <div style={{ textAlign: "center", padding: "40px 0", color: T.textMuted, fontSize: 13 }}>No bleach history.</div>
                                : sortedDates.map(date => (
                                    <div key={date} className="sop-bleach-box">
                                        <div style={{ padding: "8px 14px", background: T.surface, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>📅 {date}</span>
                                            <span style={{ marginLeft: "auto", fontSize: 11, color: T.red, fontWeight: 700 }}>
                                                -{grouped[date].filter(b => b.recheck?.status !== "confirmed").reduce((s, b) => s + Number(b.points), 0).toFixed(1)} pts
                                            </span>
                                        </div>
                                        {grouped[date].map((b, i) => {
                                            const rs = b.recheck?.status || "none";
                                            const isRemoved = rs === "confirmed";
                                            return (
                                                <div key={b._id || i} style={{ padding: "9px 14px", borderBottom: i < grouped[date].length - 1 ? `1px solid ${T.redLight}` : "none", display: "flex", alignItems: "flex-start", gap: 10, opacity: isRemoved ? 0.55 : 1 }}>
                                                    <span style={{ fontSize: 14, flexShrink: 0 }}>{isRemoved ? "✅" : "❌"}</span>
                                                    <div style={{ flex: 1 }}>
                                                        {b.folderName && b.folderName !== "Uncategorized" && (
                                                            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>📁 {b.folderName}</div>
                                                        )}
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: isRemoved ? "line-through" : "none" }}>{b.sopName}</div>
                                                        {b.description && <div style={{ fontSize: 11, color: T.textSub, marginTop: 1 }}>{b.description}</div>}
                                                        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>By {b.cutByName} ({b.cutByRole})</div>

                                                        {/* Recheck badges */}
                                                        {rs === "pending" && <RecheckBadge label="⏳ Recheck Pending" color="#D97706" bg="#FFFBEB" border="#FDE68A" />}
                                                        {rs === "confirmed" && <RecheckBadge label="✅ Deduction Removed" color="#15803D" bg="#F0FDF4" border="#BBF7D0" />}
                                                        {rs === "rejected" && <RecheckBadge label="❌ Recheck Denied" color={T.red} bg={T.redLight} border={T.redBorder} />}
                                                        {b.recheck?.requestNote && <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Employee: "{b.recheck.requestNote}"</div>}

                                                        {/* TL/CEO review buttons */}
                                                        {rs === "pending" && (
                                                            <RecheckReview
                                                                bleach={b}
                                                                employeeId={selectedEmp.employeeId}
                                                                onDone={() => loadHistory(selectedEmp)}
                                                            />
                                                        )}
                                                    </div>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: isRemoved ? T.textMuted : T.red, background: isRemoved ? T.borderLight : T.redLight, padding: "2px 8px", borderRadius: 6, flexShrink: 0, textDecoration: isRemoved ? "line-through" : "none" }}>{b.points} pts</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

// ── EMPLOYEE OWN HISTORY ──────────────────────────────────────────────────────
function OwnHistory({ employeeId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [recheckModal, setRecheckModal] = useState(null); // { bleachId, sopName }
    const [recheckNote, setRecheckNote] = useState("");
    const [recheckBusy, setRecheckBusy] = useState(false);
    const [recheckErr, setRecheckErr] = useState("");

    const load = () => {
        setLoading(true);
        fetchBleachHistory(employeeId)
            .then(d => setData(d)).catch(console.error).finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, [employeeId]);

    const submitRecheck = async () => {
        if (!recheckModal) return;
        setRecheckBusy(true); setRecheckErr("");
        try {
            await requestRecheck(employeeId, recheckModal.bleachId, { requestNote: recheckNote });
            setRecheckModal(null); setRecheckNote("");
            load();
        } catch (e) { setRecheckErr(e.message); }
        finally { setRecheckBusy(false); }
    };

    if (loading) return <Spinner />;

    const sopPoints = data?.sopPoints || [];
    const totalAll = sopPoints.reduce((s, y) => s + y.totalDeducted, 0);

    if (!sopPoints.length) return (
        <div style={{ textAlign: "center", padding: "60px 0", color: T.textMuted }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Clean compliance record</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>No violations recorded.</div>
        </div>
    );

    return (
        <>
            <div style={{ maxWidth: 580 }}>
                {/* Total summary */}
                <div style={{ marginBottom: 20, padding: "14px 18px", background: T.redLight, border: `1px solid ${T.redBorder}`, borderRadius: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#991B1B", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Deducted (All Time)</div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: T.red }}>{totalAll.toFixed(1)} pts</div>
                    </div>
                    {sopPoints.map(y => (
                        <div key={y.year} style={{ borderLeft: `1px solid ${T.redBorder}`, paddingLeft: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#991B1B", textTransform: "uppercase", letterSpacing: "0.05em" }}>{y.year}</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: T.red }}>{y.totalDeducted.toFixed(1)} pts</div>
                        </div>
                    ))}
                </div>

                {/* Year-wise breakdown */}
                {sopPoints.map(yp => {
                    const allB = [...(yp.bleaches || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
                    const grp = allB.reduce((acc, b) => { const d = b.date || "?"; if (!acc[d]) acc[d] = []; acc[d].push(b); return acc; }, {});
                    const dates = Object.keys(grp).sort((a, b) => b.localeCompare(a));
                    return (
                        <div key={yp.year} style={{ marginBottom: 24 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: T.textSub, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                                {yp.year} — {yp.totalDeducted.toFixed(1)} pts deducted
                            </div>
                            {dates.map(date => (
                                <div key={date} style={{ border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                                    <div style={{ padding: "8px 14px", background: T.surface, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center" }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>📅 {date}</span>
                                        <span style={{ marginLeft: "auto", fontSize: 11, color: T.red, fontWeight: 700 }}>
                                            -{grp[date].filter(b => b.recheck?.status !== "confirmed").reduce((s, b) => s + Number(b.points), 0).toFixed(1)} pts
                                        </span>
                                    </div>
                                    {grp[date].map((b, i) => {
                                        const rs = b.recheck?.status || "none";
                                        const isRemoved = rs === "confirmed";
                                        return (
                                            <div key={b._id || i} style={{ padding: "10px 14px", borderBottom: i < grp[date].length - 1 ? `1px solid ${T.redLight}` : "none", display: "flex", alignItems: "flex-start", gap: 10, opacity: isRemoved ? 0.5 : 1 }}>
                                                <span style={{ fontSize: 14, flexShrink: 0 }}>{isRemoved ? "✅" : "❌"}</span>
                                                <div style={{ flex: 1 }}>
                                                    {b.folderName && b.folderName !== "Uncategorized" && (
                                                        <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>📁 {b.folderName}</div>
                                                    )}
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: isRemoved ? "line-through" : "none" }}>{b.sopName}</div>
                                                    {b.description && <div style={{ fontSize: 11, color: T.textSub, marginTop: 1 }}>{b.description}</div>}

                                                    {/* Recheck status badge */}
                                                    {rs === "pending" && <RecheckBadge label="⏳ Recheck Pending" color="#D97706" bg="#FFFBEB" border="#FDE68A" />}
                                                    {rs === "confirmed" && <RecheckBadge label="✅ Deduction Removed" color="#15803D" bg="#F0FDF4" border="#BBF7D0" />}
                                                    {rs === "rejected" && <RecheckBadge label="❌ Recheck Denied" color={T.red} bg={T.redLight} border={T.redBorder} />}
                                                    {b.recheck?.reviewNote && <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Review note: {b.recheck.reviewNote}</div>}
                                                </div>
                                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: isRemoved ? T.textMuted : T.red, background: isRemoved ? T.borderLight : T.redLight, padding: "2px 8px", borderRadius: 6, textDecoration: isRemoved ? "line-through" : "none" }}>{b.points} pts</span>
                                                    {/* Recheck button — only if not confirmed */}
                                                    {rs !== "confirmed" && rs !== "pending" && (
                                                        <button onClick={() => { setRecheckModal({ bleachId: b._id, sopName: b.sopName }); setRecheckNote(""); setRecheckErr(""); }}
                                                            style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", border: `1px solid ${T.blueBorder}`, borderRadius: 5, background: T.blueLight, color: T.blue, cursor: "pointer", fontFamily: "inherit" }}>
                                                            Recheck
                                                        </button>
                                                    )}
                                                    {rs === "pending" && (
                                                        <span style={{ fontSize: 10, color: "#D97706", fontWeight: 600 }}>Under review</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>

            {/* Recheck request modal */}
            {recheckModal && (
                <>
                    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1001 }} onClick={() => setRecheckModal(null)} />
                    <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 380, maxWidth: "90vw", background: "#fff", borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,0.18)", zIndex: 1002, fontFamily: "inherit", overflow: "hidden" }}>
                        <div style={{ background: T.blue, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Request Recheck</div>
                            <button onClick={() => setRecheckModal(null)} style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "rgba(255,255,255,0.2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        <div style={{ padding: "18px" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 12 }}>
                                Requesting recheck for: <span style={{ color: T.red }}>{recheckModal.sopName}</span>
                            </div>
                            {recheckErr && <div style={{ fontSize: 12, color: T.red, marginBottom: 8, padding: "8px 10px", background: T.redLight, borderRadius: 6 }}>{recheckErr}</div>}
                            <textarea
                                value={recheckNote} onChange={e => setRecheckNote(e.target.value)}
                                placeholder="Explain why this deduction is incorrect…"
                                rows={3} style={{ ...iStyle, resize: "none", marginBottom: 12 }}
                            />
                            <div style={{ display: "flex", gap: 10 }}>
                                <button onClick={() => setRecheckModal(null)} style={{ flex: 1, padding: "9px", border: `1px solid ${T.border}`, borderRadius: 8, background: "#fff", color: T.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                                <button onClick={submitRecheck} disabled={recheckBusy}
                                    style={{ flex: 2, padding: "9px", border: "none", borderRadius: 8, background: recheckBusy ? "#93C5FD" : T.blue, color: "#fff", fontSize: 13, fontWeight: 600, cursor: recheckBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                                    {recheckBusy ? "Submitting…" : "Submit Recheck"}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}

// ── SUGGEST BLEACH MODAL ──────────────────────────────────────────────────────
function SuggestBleachModal({ suggestion, approvedSops, employeeId, employeeName, onClose, onDone }) {
    const [points, setPoints] = useState(suggestion.suggestedPoints || 0);
    const [desc, setDesc] = useState(suggestion.description || "");
    const [note, setNote] = useState("");
    const [selSopId, setSelSopId] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    // Filter approved SOPs for this employee's dept
    const deptSops = approvedSops.filter(s => s.department === suggestion.department);

    const handleApprove = async () => {
        if (!suggestion.assigneeId) return setErr("No assignee found for this task.");
        setBusy(true); setErr("");
        try {
            const body = {
                targetEmployeeId: suggestion.assigneeId,
                sopId: selSopId || undefined,
                description: `[${suggestion.eventLabel}] ${desc} ${note}`.trim(),
                manualPoints: selSopId ? undefined : points,
                manualSopName: selSopId ? undefined : suggestion.eventLabel,
                taskId: suggestion.taskId,
                eventKey: suggestion.eventKey,
            };
            await applyBleach(body);
            onDone(suggestion.taskId, suggestion.eventKey);
        } catch (e) { setErr(e.message); }
        finally { setBusy(false); }
    };

    return (
        <>
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1001 }} onClick={onClose} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(460px, 95vw)", background: "#fff", borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,0.2)", zIndex: 1002, fontFamily: "inherit", overflow: "hidden" }}>

                {/* Header */}
                <div style={{ background: T.red, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Suggest Bleach</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>Review and approve or reject this deduction</div>
                    </div>
                    <button onClick={() => onClose(false)} style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "rgba(255,255,255,0.2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                <div style={{ padding: "18px", display: "flex", flexDirection: "column", gap: 14 }}>
                    {err && <div style={{ padding: "8px 12px", background: T.redLight, border: `1px solid ${T.redBorder}`, borderRadius: 7, fontSize: 12, color: T.red }}>{err}</div>}

                    {/* Task info */}
                    <div style={{ background: T.surface, borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Task Details</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{suggestion.taskTitle}</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#D97706", background: "#FFFBEB", border: "1px solid #FDE68A", padding: "2px 7px", borderRadius: 99 }}>⚠️ {suggestion.eventLabel}</span>
                            <span style={{ fontSize: 11, color: T.textSub }}>{suggestion.assigneeName} · {suggestion.department}</span>
                        </div>
                    </div>

                    {/* Select SOP (optional) */}
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: T.text, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Select SOP (optional)</label>
                        <select value={selSopId} onChange={e => {
                            setSelSopId(e.target.value);
                            const s = deptSops.find(s => s._id === e.target.value);
                            if (s) { setPoints(s.points); setDesc(s.description); }
                            else { setPoints(suggestion.suggestedPoints); setDesc(suggestion.description); }
                        }} style={iStyle}>
                            <option value="">Use suggested points (no SOP)</option>
                            {deptSops.map(s => <option key={s._id} value={s._id}>{s.name} ({s.points} pts)</option>)}
                        </select>
                    </div>

                    {/* Points */}
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: T.text, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Deduction Points</label>
                        <input type="number" value={points} onChange={e => setPoints(Number(e.target.value))} step="0.5" min="0" style={iStyle} />
                    </div>

                    {/* Description */}
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: T.text, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Description</label>
                        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Violation description…" style={iStyle} />
                    </div>

                    {/* Note */}
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: T.text, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Additional Note (optional)</label>
                        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Any additional note…" rows={2} style={{ ...iStyle, resize: "none" }} />
                    </div>

                    {/* Approve / Reject buttons */}
                    <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={() => onClose(true)} style={{ flex: 1, padding: "10px", border: `1px solid ${T.border}`, borderRadius: 8, background: "#fff", color: T.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            ✕ Reject (No Deduction)
                        </button>
                        <button onClick={handleApprove} disabled={busy || points <= 0}
                            style={{ flex: 2, padding: "10px", border: "none", borderRadius: 8, background: busy || points <= 0 ? "#FCA5A5" : T.red, color: "#fff", fontSize: 13, fontWeight: 600, cursor: busy || points <= 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                            {busy ? "Applying…" : `✓ Approve & Deduct ${points} pts`}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

// ── SOP SETTINGS PANEL ───────────────────────────────────────────────────────
const EVENT_LABELS = {
    task_overdue: { label: "Task Overdue", desc: "Regular task deadline passed and not completed", hasThreshold: false },
    task_rejected_tl: { label: "Task Rejected by TL", desc: "TL rejected employee's submitted task", hasThreshold: false },
    task_rejected_ceo: { label: "Task Rejected by CEO", desc: "CEO rejected employee's submitted task", hasThreshold: false },
    repeat_missed: { label: "Repeat Task Missed", desc: "Daily repeat task not submitted by deadline", hasThreshold: false },
    repeat_late: { label: "Repeat Task Late", desc: "Repeat task submitted after deadline time", hasThreshold: false },
    third_party_overdue: { label: "Third Party Task Overdue", desc: "External/client task deadline missed", hasThreshold: false },
    third_party_rejected: { label: "Third Party Task Rejected", desc: "Third party task submission rejected", hasThreshold: false },
    goal_overdue: { label: "Goal Task Overdue", desc: "Long-term goal task deadline missed", hasThreshold: false },
    self_assigned_overdue: { label: "Self-Assigned Task Overdue", desc: "Employee's own task deadline missed", hasThreshold: false },
    extension_rejected: { label: "Extension Request Rejected", desc: "TL/CEO rejected deadline extension request", hasThreshold: false },
    task_not_started: { label: "Task Not Started", desc: "Task assigned but not started after X days", hasThreshold: true },
};

const DEFAULT_EVENTS = Object.fromEntries(
    Object.keys(EVENT_LABELS).map(k => [k, { enabled: false, points: 0, description: "", ...(EVENT_LABELS[k].hasThreshold ? { daysThreshold: 0 } : {}) }])
);

function SopSettingsPanel({ employeeId, employeeName, onClose }) {
    const [events, setEvents] = useState(DEFAULT_EVENTS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        const load = async () => {
            try {
                const snap = await getDoc(doc(firebaseDb, "cowork_sop_settings", "task_events"));
                if (snap.exists()) {
                    const data = snap.data();
                    setEvents({ ...DEFAULT_EVENTS, ...data.events });
                }
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        load();
    }, []);

    const updateEvent = (key, field, value) => {
        setEvents(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    };

    const save = async () => {
        setSaving(true); setErr(""); setSaved(false);
        try {
            await setDoc(doc(firebaseDb, "cowork_sop_settings", "task_events"), {
                events,
                updatedBy: employeeId,
                updatedByName: employeeName,
                updatedAt: new Date().toISOString(),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e) { setErr(e.message); }
        finally { setSaving(false); }
    };

    return (
        <>
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 999 }} onClick={onClose} />
            <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(480px, 100vw)", background: "#fff", borderLeft: `1px solid ${T.border}`, boxShadow: "-8px 0 32px rgba(0,0,0,0.15)", zIndex: 1000, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>

                {/* Header */}
                <div style={{ background: T.text, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>SOP Task Event Settings</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>Configure which task events suggest a bleach</div>
                    </div>
                    <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                {/* Info bar */}
                <div style={{ padding: "10px 18px", background: "#F8FAFC", borderBottom: `1px solid ${T.border}`, fontSize: 12, color: T.textSub, flexShrink: 0 }}>
                    All events default to <strong>inactive (0 pts)</strong>. Enable and set points to activate suggestions.
                </div>

                {/* Events list */}
                <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px", display: "flex", flexDirection: "column", gap: 2 }}>
                    {loading ? <Spinner /> : Object.entries(EVENT_LABELS).map(([key, meta]) => {
                        const ev = events[key] || {};
                        return (
                            <div key={key} style={{ border: `1px solid ${ev.enabled ? T.blueBorder : T.border}`, borderRadius: 10, padding: "12px 14px", background: ev.enabled ? T.blueLight : "#fff", transition: "all 0.15s", marginBottom: 8 }}>
                                {/* Toggle + label row */}
                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: ev.enabled ? 10 : 0 }}>
                                    {/* Toggle switch */}
                                    <div onClick={() => updateEvent(key, "enabled", !ev.enabled)}
                                        style={{ width: 38, height: 22, borderRadius: 11, background: ev.enabled ? T.blue : "#D1D5DB", cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
                                        <div style={{ position: "absolute", top: 3, left: ev.enabled ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{meta.label}</div>
                                        <div style={{ fontSize: 11, color: T.textSub, marginTop: 1 }}>{meta.desc}</div>
                                    </div>
                                    {ev.enabled && (
                                        <span style={{ fontSize: 12, fontWeight: 700, color: T.red, background: T.redLight, border: `1px solid ${T.redBorder}`, padding: "2px 8px", borderRadius: 6, flexShrink: 0 }}>
                                            {ev.points || 0} pts
                                        </span>
                                    )}
                                </div>

                                {/* Expanded fields when enabled */}
                                {ev.enabled && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: T.textSub, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Deduction Points</div>
                                                <input type="number" value={ev.points} onChange={e => updateEvent(key, "points", Number(e.target.value))}
                                                    placeholder="e.g. 1.0" step="0.5" min="0"
                                                    style={{ ...iStyle, fontSize: 12 }} />
                                            </div>
                                            {meta.hasThreshold && (
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 10, fontWeight: 700, color: T.textSub, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Days Threshold</div>
                                                    <input type="number" value={ev.daysThreshold || 0} onChange={e => updateEvent(key, "daysThreshold", Number(e.target.value))}
                                                        placeholder="e.g. 2" min="1"
                                                        style={{ ...iStyle, fontSize: 12 }} />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: T.textSub, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Description</div>
                                            <input value={ev.description} onChange={e => updateEvent(key, "description", e.target.value)}
                                                placeholder="Describe this violation…"
                                                style={{ ...iStyle, fontSize: 12 }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div style={{ padding: "14px 18px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 10, flexShrink: 0 }}>
                    {err && <div style={{ fontSize: 12, color: T.red, flex: 1 }}>{err}</div>}
                    {saved && <div style={{ fontSize: 12, color: "#15803D", flex: 1 }}>✅ Settings saved!</div>}
                    <button onClick={onClose} style={{ flex: 1, padding: "10px", border: `1px solid ${T.border}`, borderRadius: 8, background: "#fff", color: T.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                    <button onClick={save} disabled={saving} style={{ flex: 2, padding: "10px", border: "none", borderRadius: 8, background: saving ? "#93C5FD" : T.blue, color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                        {saving ? "Saving…" : "Save Settings"}
                    </button>
                </div>
            </div>
        </>
    );
}

// ── RECHECK BADGE ─────────────────────────────────────────────────────────────
function RecheckBadge({ label, color, bg, border }) {
    return <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 700, color, background: bg, border: `1px solid ${border}`, padding: "2px 7px", borderRadius: 99 }}>{label}</span>;
}

// ── RECHECK REVIEW (TL/CEO inline confirm/reject) ─────────────────────────────
function RecheckReview({ bleach, employeeId, onDone }) {
    const [busy, setBusy] = useState("");
    const [note, setNote] = useState("");
    const [err, setErr] = useState("");
    const [showNote, setShowNote] = useState(false);

    const review = async (action) => {
        setBusy(action); setErr("");
        try {
            await reviewRecheck(employeeId, bleach._id, { action, reviewNote: note.trim() });
            onDone();
        } catch (e) { setErr(e.message); }
        finally { setBusy(""); }
    };

    return (
        <div style={{ marginTop: 8, padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 7 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#92400E", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>Review Recheck Request</div>
            {bleach.recheck?.requestNote && <div style={{ fontSize: 11, color: "#92400E", marginBottom: 6, fontStyle: "italic" }}>"{bleach.recheck.requestNote}"</div>}
            {err && <div style={{ fontSize: 11, color: T.red, marginBottom: 6 }}>{err}</div>}
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Review note (optional)…" rows={2}
                style={{ ...iStyle, fontSize: 11, resize: "none", marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => review("confirm")} disabled={!!busy}
                    style={{ flex: 1, padding: "6px", border: "none", borderRadius: 6, background: busy === "confirm" ? "#86EFAC" : "#15803D", color: "#fff", fontSize: 11, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {busy === "confirm" ? "…" : "✅ Confirm (Remove pts)"}
                </button>
                <button onClick={() => review("reject")} disabled={!!busy}
                    style={{ flex: 1, padding: "6px", border: "none", borderRadius: 6, background: busy === "reject" ? "#FCA5A5" : T.red, color: "#fff", fontSize: 11, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {busy === "reject" ? "…" : "❌ Reject (Keep pts)"}
                </button>
            </div>
        </div>
    );
}

// ── SHARED ────────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const m = { approved: ["#15803D", "#F0FDF4", "#BBF7D0", "Approved"], pending: ["#D97706", "#FFFBEB", "#FDE68A", "Pending"], rejected: [T.red, T.redLight, T.redBorder, "Rejected"] };
    const [c, bg, border, label] = m[status] || m.pending;
    return <span style={{ fontSize: 11, fontWeight: 700, color: c, background: bg, border: `1px solid ${border}`, padding: "2px 8px", borderRadius: 99 }}>{label}</span>;
}
function TBtn({ children, onClick, blue, red, outline }) {
    const bg = blue ? T.blue : red ? T.red : outline ? "#fff" : T.surface;
    const cl = blue || red ? "#fff" : T.text;
    const br = outline ? `1px solid ${T.border}` : "none";
    return <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, background: bg, border: br, color: cl, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.85"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>{children}</button>;
}
function ABtn({ children, onClick, blue, green, red }) {
    const bg = blue ? "#EFF6FF" : green ? "#F0FDF4" : T.redLight;
    const cl = blue ? "#1D4ED8" : green ? "#15803D" : T.red;
    return <button onClick={onClick} style={{ padding: "4px 10px", border: `1px solid ${cl}33`, borderRadius: 6, background: bg, color: cl, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{children}</button>;
}
function FLabel({ label, children }) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 5 }}><label style={{ fontSize: 11, fontWeight: 700, color: T.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>{children}</div>;
}
function Av({ name = "?", url = null, size = 32, bg = "#EBF3FE", fg = "#1A73E8" }) {
    if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
    const i = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return <div style={{ width: size, height: size, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.33), fontWeight: 700, color: fg, flexShrink: 0 }}>{i}</div>;
}
function PRow({ label, value }) {
    if (!value) return null;
    return <div className="sop-prow"><div style={{ minWidth: 90, fontSize: 12, color: T.textMuted, fontWeight: 500, paddingTop: 1 }}>{label}</div><div style={{ flex: 1, fontSize: 13, color: T.text, fontWeight: 500 }}>{value}</div></div>;
}
function Spinner() {
    return <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "32px 0", color: T.textMuted }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth="2.5" strokeLinecap="round" style={{ animation: "sopSpin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg><span style={{ fontSize: 13 }}>Loading…</span></div>;
}
const iStyle = { padding: "9px 11px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", color: T.text, background: "#F9FAFB", outline: "none", width: "100%", boxSizing: "border-box" };