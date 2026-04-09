"use client";
/**
 * components/coworking/notes/NotesSidebarPanel.jsx
 *
 * Usage — open from anywhere via custom event:
 *   window.dispatchEvent(new CustomEvent("openNotesPanel", { detail: { tab: "create" } }));
 *
 * Add to CoworkingShell.jsx:
 *   1. Import NotesSidebarPanel
 *   2. Add state: const [notesPanelOpen, setNotesPanelOpen] = useState(false);
 *   3. Add useEffect to listen to "openNotesPanel" event (same pattern as openRequestPanel)
 *   4. Add the panel JSX at the bottom (same pattern as .cw-req-panel)
 *   5. Add a Notes button to the topbar (same as Requests button)
 *
 * Or embed directly anywhere as a standalone panel.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { firebaseAuth, firebaseDb } from "../../../lib/coworkFirebase";
import {
    collection, doc, setDoc, updateDoc, deleteDoc,
    query, where, orderBy, onSnapshot, serverTimestamp,
} from "firebase/firestore";

const CLD_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// ── helpers ──────────────────────────────────────────────────────────────────
async function uploadImageCld(file) {
    const fd = new FormData();
    fd.append("file", file); fd.append("upload_preset", CLD_PRESET); fd.append("folder", "cowork-notes");
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLD_CLOUD}/image/upload`, { method: "POST", body: fd });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || "Upload failed");
    return { url: d.secure_url, name: file.name, type: "image", size: d.bytes || file.size };
}

async function uploadPdfBackend(file) {
    const token = await firebaseAuth.currentUser?.getIdToken();
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch(`${BASE_URL}/cowork/upload/pdf`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "PDF upload failed");
    return { url: d.url || d.viewUrl, name: file.name, type: "pdf", size: d.size || file.size };
}

function fmtTime(ts) {
    if (!ts) return "";
    const ms = ts?.seconds ? ts.seconds * 1000 : new Date(ts).getTime();
    const diff = Math.floor((Date.now() - ms) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    if (diff < 10080) return `${Math.floor(diff / 1440)}d ago`;
    return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function fmtDateTime(iso) {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
            " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
}

function isOverdue(reminderISO) {
    if (!reminderISO) return false;
    return new Date(reminderISO).getTime() < Date.now();
}

// Returns true if reminder is between now and 30 minutes from now (upcoming alert)
function isWithin30Min(reminderISO) {
    if (!reminderISO) return false;
    const ms = new Date(reminderISO).getTime();
    const now = Date.now();
    return ms > now && ms <= now + 30 * 60 * 1000;
}

// ── NotesSidebarPanel ─────────────────────────────────────────────────────────
export default function NotesSidebarPanel({ employeeId, employeeName, onClose, initialTab = "create" }) {
    const [tab, setTab] = useState(initialTab);

    // ── Create/Edit form state ────────────────────────────────────────────────
    const [editingNote, setEditingNote] = useState(null); // null = create, object = edit
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [keypoints, setKeypoints] = useState([""]); // array of strings
    const [reminder, setReminder] = useState("");   // datetime-local string
    const [color, setColor] = useState("none");
    const [files, setFiles] = useState([]);
    const [saving, setSaving] = useState(false);
    const [saveErr, setSaveErr] = useState("");
    const [savedOk, setSavedOk] = useState(false);
    const fileRef = useRef(null);

    // ── Notes list state ──────────────────────────────────────────────────────
    const [notes, setNotes] = useState([]);
    const [pinnedNotes, setPinnedNotes] = useState([]);
    const [menuOpenId, setMenuOpenId] = useState(null);
    const [searchQ, setSearchQ] = useState("");

    // ── Activity (tab 3) ─────────────────────────────────────────────────────
    const [recentActivity, setRecentActivity] = useState([]);

    // ── Live listener ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!employeeId) return;
        const q = query(
            collection(firebaseDb, "cowork_notes"),
            where("ownerId", "==", employeeId)
        );
        const unsub = onSnapshot(q, snap => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => {
                    const ta = a.updatedAt?.seconds ?? 0;
                    const tb = b.updatedAt?.seconds ?? 0;
                    return tb - ta;
                });
            setPinnedNotes(all.filter(n => n.pinned));
            setNotes(all.filter(n => !n.pinned));
            // Build activity log: last 20 notes modified
            setRecentActivity(all.slice(0, 20).map(n => ({
                id: n.id, title: n.title, action: n.createdAt === n.updatedAt ? "created" : "updated",
                time: n.updatedAt,
            })));
        });
        return () => unsub();
    }, [employeeId]);

    // ── Close 3-dot menu on outside click ────────────────────────────────────
    useEffect(() => {
        if (!menuOpenId) return;
        const close = () => setMenuOpenId(null);
        document.addEventListener("click", close);
        return () => document.removeEventListener("click", close);
    }, [menuOpenId]);

    // ── Keypoints helpers ─────────────────────────────────────────────────────
    const setKp = (i, v) => setKeypoints(prev => prev.map((k, j) => j === i ? v : k));
    const addKp = () => setKeypoints(prev => [...prev, ""]);
    const removeKp = (i) => setKeypoints(prev => prev.length === 1 ? [""] : prev.filter((_, j) => j !== i));
    const kpKeyDown = (e, i) => {
        if (e.key === "Enter") { e.preventDefault(); addKp(); setTimeout(() => document.getElementById(`kp-${i + 1}`)?.focus(), 30); }
        if (e.key === "Backspace" && keypoints[i] === "" && keypoints.length > 1) { e.preventDefault(); removeKp(i); setTimeout(() => document.getElementById(`kp-${i - 1}`)?.focus(), 30); }
    };

    // ── File pick ─────────────────────────────────────────────────────────────
    const handleFilePick = (e) => {
        const picked = Array.from(e.target.files || []);
        e.target.value = "";
        setFiles(prev => [...prev, ...picked
            .filter(f => true) // accept all file types
            .map(f => ({ file: f, uploading: false, done: false, result: null }))
        ]);
    };

    // ── Reset form ────────────────────────────────────────────────────────────
    const resetForm = useCallback(() => {
        setEditingNote(null); setTitle(""); setDescription("");
        setKeypoints([""]); setReminder(""); setColor("none");
        setFiles([]); setSaveErr(""); setSavedOk(false);
    }, []);

    // ── Load note into form for editing ──────────────────────────────────────
    const startEdit = (note) => {
        setEditingNote(note);
        setTitle(note.title || "");
        setDescription(note.description || "");
        setKeypoints(note.keypoints?.length ? note.keypoints : [""]);
        setReminder(note.reminder || "");
        setColor(note.color || "none");
        setFiles((note.attachments || []).map(a => ({ file: null, uploading: false, done: true, result: a })));
        setTab("create");
        setSavedOk(false); setSaveErr("");
    };

    // ── Save note ─────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!title.trim()) { setSaveErr("Title is required."); return; }
        setSaveErr(""); setSaving(true);
        try {
            // Upload new files
            const uploaded = [];
            const updFiles = [...files];
            for (let i = 0; i < updFiles.length; i++) {
                if (updFiles[i].done && updFiles[i].result) { uploaded.push(updFiles[i].result); continue; }
                updFiles[i] = { ...updFiles[i], uploading: true }; setFiles([...updFiles]);
                const f = updFiles[i].file;
                const result = f.type.startsWith("image/") ? await uploadImageCld(f) : await uploadPdfBackend(f);
                updFiles[i] = { ...updFiles[i], uploading: false, done: true, result };
                uploaded.push(result);
                setFiles([...updFiles]);
            }

            const docData = {
                ownerId: employeeId,
                ownerName: employeeName,
                title: title.trim(),
                description: description.trim(),
                keypoints: keypoints.filter(k => k.trim()),
                reminder: reminder || null,
                color: color || "none",
                attachments: uploaded,
                updatedAt: serverTimestamp(),
            };

            if (editingNote) {
                await updateDoc(doc(firebaseDb, "cowork_notes", editingNote.id), docData);
            } else {
                const noteId = crypto.randomUUID();
                await setDoc(doc(firebaseDb, "cowork_notes", noteId), {
                    ...docData,
                    noteId,
                    pinned: false,
                    createdAt: serverTimestamp(),
                });
            }
            setSavedOk(true);
            setTimeout(() => { resetForm(); setTab("notes"); }, 900);
        } catch (e) {
            setSaveErr(e.message);
        } finally {
            setSaving(false);
        }
    };

    // ── Pin / Unpin ───────────────────────────────────────────────────────────
    const togglePin = async (note) => {
        await updateDoc(doc(firebaseDb, "cowork_notes", note.id), { pinned: !note.pinned, updatedAt: serverTimestamp() });
    };

    // ── Delete ────────────────────────────────────────────────────────────────
    const deleteNote = async (noteId) => {
        if (!confirm("Delete this note? This cannot be undone.")) return;
        await deleteDoc(doc(firebaseDb, "cowork_notes", noteId));
    };

    // ── Filtered notes ────────────────────────────────────────────────────────
    const filterNotes = (list) => {
        if (!searchQ.trim()) return list;
        const q = searchQ.toLowerCase();
        return list.filter(n =>
            n.title?.toLowerCase().includes(q) ||
            n.description?.toLowerCase().includes(q) ||
            n.keypoints?.some(k => k.toLowerCase().includes(q))
        );
    };

    const COLOR_OPTIONS = [
        { value: "none", label: "Default" },
        { value: "#FFFBEB", label: "Yellow" },
        { value: "#F0FDF4", label: "Green" },
        { value: "#EFF6FF", label: "Blue" },
        { value: "#FFF1F2", label: "Red" },
        { value: "#F5F3FF", label: "Purple" },
    ];

    // ── Image lightbox state ────────────────────────────────────────────────────
    const [lightbox, setLightbox] = useState(null); // { url, name }

    // ── 3-dot menu ────────────────────────────────────────────────────────────
    function NoteMenu({ note }) {
        const open = menuOpenId === note.id;
        return (
            <div style={{ position: "relative" }}>
                <button
                    onClick={e => { e.stopPropagation(); setMenuOpenId(open ? null : note.id); }}
                    style={BTN.dots} title="Options"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
                    </svg>
                </button>
                {open && (
                    <div style={S.menu} onClick={e => e.stopPropagation()}>
                        <button style={S.menuItem} onClick={() => { setMenuOpenId(null); startEdit(note); }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            Edit
                        </button>
                        <button style={S.menuItem} onClick={() => { setMenuOpenId(null); togglePin(note); }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                            {note.pinned ? "Unpin" : "Pin"}
                        </button>
                        <div style={S.menuSep} />
                        <button style={{ ...S.menuItem, color: "#DC2626" }} onClick={() => { setMenuOpenId(null); deleteNote(note.id); }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
                            Delete
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // ── NoteCard — clean card style like image 2 ────────────────────────────────
    function NoteCard({ note }) {
        const overdue = isOverdue(note.reminder);
        const within30 = isWithin30Min(note.reminder); // red dot alert: reminder in ≤30 min
        const bg = note.color && note.color !== "none" ? note.color : "#fff";
        const images = (note.attachments || []).filter(a => a.type === "image");
        const pdfs = (note.attachments || []).filter(a => a.type !== "image");

        return (
            <div style={{
                background: bg,
                border: "1px solid #E8E8E8",
                borderRadius: 10,
                padding: "14px 16px",
                margin: "8px 12px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}>
                {/* Title row */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                        {note.pinned && (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="#D97706" style={{ flexShrink: 0 }}>
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                            </svg>
                        )}
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>
                            {note.title}
                        </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {/* Red pulsing dot: reminder within 30 minutes */}
                        {within30 && !overdue && (
                            <span title="Reminder in less than 30 minutes" style={{
                                width: 8, height: 8, borderRadius: "50%",
                                background: "#EF4444",
                                display: "inline-block", flexShrink: 0,
                                boxShadow: "0 0 0 0 rgba(239,68,68,0.4)",
                                animation: "ns-pulse 1.4s ease-in-out infinite",
                            }} />
                        )}
                        <NoteMenu note={note} />
                    </div>
                </div>

                {/* Description */}
                {note.description && (
                    <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, margin: "0 0 10px", whiteSpace: "pre-wrap" }}>
                        {note.description}
                    </p>
                )}

                {/* Key points — numbered list like image 2 */}
                {note.keypoints?.filter(k => k.trim()).length > 0 && (
                    <ol style={{ margin: "0 0 10px", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                        {note.keypoints.filter(k => k.trim()).map((k, i) => (
                            <li key={i} style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{k}</li>
                        ))}
                    </ol>
                )}

                {/* Reminder */}
                {note.reminder && (
                    <div style={{ fontSize: 11, fontWeight: 500, color: overdue ? "#DC2626" : within30 ? "#DC2626" : "#6B7280", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                        {overdue ? "⏰ Overdue · " : within30 ? "🔴 " : "🔔 "}{fmtDateTime(note.reminder)}
                        {within30 && !overdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 4, padding: "1px 5px" }}>Soon</span>}
                    </div>
                )}
                <style>{`@keyframes ns-pulse { 0%,100% { box-shadow:0 0 0 0 rgba(239,68,68,0.4); } 50% { box-shadow:0 0 0 5px rgba(239,68,68,0); } }`}</style>

                {/* Image thumbnails — small boxes, click to open lightbox */}
                {images.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: pdfs.length > 0 ? 8 : 0 }}>
                        {images.map((att, i) => (
                            <div
                                key={i}
                                onClick={() => setLightbox({ url: att.url, name: att.name })}
                                title={att.name}
                                style={{
                                    width: 64, height: 64, borderRadius: 6, overflow: "hidden", cursor: "pointer",
                                    border: "1px solid #E5E7EB", flexShrink: 0, position: "relative",
                                    background: "#F3F4F6",
                                }}
                            >
                                <img
                                    src={att.url}
                                    alt={att.name}
                                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                />
                                {/* hover overlay hint */}
                                <div style={{
                                    position: "absolute", inset: 0, background: "rgba(0,0,0,0)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    transition: "background 0.15s",
                                }}
                                    onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.18)"}
                                    onMouseLeave={e => e.currentTarget.style.background = "rgba(0,0,0,0)"}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ opacity: 0.9 }}>
                                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* PDF attachments */}
                {pdfs.length > 0 && (
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {pdfs.map((att, i) => (
                            <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                                style={{
                                    display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px",
                                    border: "1px solid #E5E7EB", borderRadius: 5,
                                    fontSize: 11, color: "#374151", textDecoration: "none", background: "#F9FAFB",
                                    fontWeight: 500,
                                }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                                {att.name || "PDF"}
                            </a>
                        ))}
                    </div>
                )}

                {/* Updated time — bottom right, subtle */}
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 10, textAlign: "right" }}>
                    {fmtTime(note.updatedAt)}
                </div>
            </div>
        );
    }

    // ── Image Lightbox ───────────────────────────────────────────────────────────
    function ImageLightbox() {
        if (!lightbox) return null;
        return (
            <div
                onClick={() => setLightbox(null)}
                style={{
                    position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 2000,
                    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
                }}
            >
                <div onClick={e => e.stopPropagation()} style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
                    <img
                        src={lightbox.url}
                        alt={lightbox.name}
                        style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 8, display: "block", objectFit: "contain" }}
                    />
                    {/* Download button */}
                    <a
                        href={lightbox.url}
                        download={lightbox.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{
                            position: "absolute", bottom: 12, right: 12,
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "7px 14px", background: "rgba(0,0,0,0.65)",
                            color: "#fff", borderRadius: 6, fontSize: 12, fontWeight: 600,
                            textDecoration: "none", backdropFilter: "blur(4px)",
                        }}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download
                    </a>
                    {/* Close button */}
                    <button
                        onClick={() => setLightbox(null)}
                        style={{
                            position: "absolute", top: 10, right: 10,
                            background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%",
                            width: 32, height: 32, cursor: "pointer", color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>
        );
    }

    // ────────────────────────────────────────────────────────────────────────────
    return (
        <>
            {/* Header */}
            <div style={S.panelHead}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div style={S.panelIcon}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A73E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                        </svg>
                    </div>
                    <div>
                        <div style={S.panelTitle}>Notes</div>
                        <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 1 }}>
                            {notes.length + pinnedNotes.length} note{notes.length + pinnedNotes.length !== 1 ? "s" : ""}
                        </div>
                    </div>
                </div>
                <button style={S.closeBtn} onClick={onClose}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>

            {/* Tabs */}
            <div style={S.tabBar}>
                {[
                    ["create", <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> {editingNote ? "Edit Note" : "New Note"}</>],
                    ["notes", <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg> My Notes</>],
                    ["activity", <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg> Activity</>],
                ].map(([key, label]) => (
                    <button
                        key={key}
                        style={{ ...S.tab, ...(tab === key ? S.tabActive : {}) }}
                        onClick={() => { setTab(key); if (key === "create" && tab !== "create") { /* keep form state */ } }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Body */}
            <div style={S.body}>

                {/* ── CREATE / EDIT TAB ── */}
                {tab === "create" && (
                    <div style={{ padding: "16px 18px" }}>
                        {savedOk ? (
                            <div style={{ textAlign: "center", padding: "40px 20px" }}>
                                <div style={S.successIcon}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: "#16A34A", marginBottom: 6 }}>
                                    Note {editingNote ? "updated" : "saved"}!
                                </div>
                            </div>
                        ) : (
                            <>
                                {saveErr && (
                                    <div style={S.errBox}>{saveErr}</div>
                                )}

                                {editingNote && (
                                    <div style={{ marginBottom: 12, fontSize: 11, color: "#9AA0A6", display: "flex", alignItems: "center", gap: 6 }}>
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                        Editing: <strong style={{ color: "#374151" }}>{editingNote.title}</strong>
                                        <button onClick={resetForm} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#9AA0A6", textDecoration: "underline", padding: 0 }}>
                                            Cancel edit
                                        </button>
                                    </div>
                                )}

                                {/* Title */}
                                <div style={S.field}>
                                    <label style={S.lbl}>Title *</label>
                                    <input
                                        style={S.input}
                                        placeholder="Note title…"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                    />
                                </div>

                                {/* Description */}
                                <div style={S.field}>
                                    <label style={S.lbl}>Description</label>
                                    <textarea
                                        style={{ ...S.input, resize: "vertical", lineHeight: 1.6, minHeight: 70 }}
                                        placeholder="What is this note about…"
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                    />
                                </div>

                                {/* Key Points */}
                                <div style={S.field}>
                                    <label style={S.lbl}>Key Points</label>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                        {keypoints.map((kp, i) => (
                                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <span style={S.kpDot} />
                                                <input
                                                    id={`kp-${i}`}
                                                    style={{ ...S.input, flex: 1, marginBottom: 0 }}
                                                    placeholder={`Point ${i + 1}…`}
                                                    value={kp}
                                                    onChange={e => setKp(i, e.target.value)}
                                                    onKeyDown={e => kpKeyDown(e, i)}
                                                />
                                                {keypoints.length > 1 && (
                                                    <button onClick={() => removeKp(i)} style={BTN.removeKp} title="Remove">
                                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={addKp} style={BTN.addKp}>
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                        Add point
                                    </button>
                                    <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 3 }}>Press Enter to add next point, Backspace to remove empty</div>
                                </div>

                                {/* Reminder + Color row */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                                    <div style={S.field}>
                                        <label style={S.lbl}>Reminder / Deadline</label>
                                        <input
                                            type="datetime-local"
                                            style={{ ...S.input, marginBottom: 0 }}
                                            value={reminder}
                                            onChange={e => setReminder(e.target.value)}
                                        />
                                    </div>
                                    <div style={S.field}>
                                        <label style={S.lbl}>Note Color</label>
                                        <select style={{ ...S.input, marginBottom: 0 }} value={color} onChange={e => setColor(e.target.value)}>
                                            {COLOR_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Attachments */}
                                <div style={S.field}>
                                    <label style={S.lbl}>Attachments</label>
                                    {files.length > 0 && (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 7 }}>
                                            {files.map((f, i) => (
                                                <span key={i} style={S.fileChip}>
                                                    {f.uploading ? "Uploading…" : (f.result?.name || f.file?.name || "File")}
                                                    {!f.uploading && (
                                                        <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                                                            style={{ background: "none", border: "none", cursor: "pointer", color: "#9AA0A6", fontSize: 11, padding: 0, lineHeight: 1 }}>×</button>
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <button type="button" onClick={() => fileRef.current?.click()} style={BTN.attach}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                                        Attach files
                                    </button>
                                    <input ref={fileRef} type="file" multiple style={{ display: "none" }} accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.rar,.7z" onChange={handleFilePick} />
                                </div>

                                {/* Save button */}
                                <button onClick={handleSave} disabled={saving} style={{ ...BTN.save, opacity: saving ? 0.7 : 1 }}>
                                    {saving ? (
                                        <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "cw-spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Saving…</>
                                    ) : (
                                        <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg> {editingNote ? "Update Note" : "Save Note"}</>
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* ── MY NOTES TAB ── */}
                {tab === "notes" && (
                    <div>
                        {/* Search */}
                        <div style={{ padding: "10px 16px", borderBottom: "1px solid #F2F4F7" }}>
                            <div style={S.searchBox}>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                    <circle cx="5.5" cy="5.5" r="4" stroke="#9AA0A6" strokeWidth="1.1" />
                                    <line x1="8.5" y1="8.5" x2="11" y2="11" stroke="#9AA0A6" strokeWidth="1.1" strokeLinecap="round" />
                                </svg>
                                <input
                                    style={{ border: "none", background: "none", outline: "none", flex: 1, fontSize: 12, color: "#1A1D21", fontFamily: "inherit" }}
                                    placeholder="Search notes…"
                                    value={searchQ}
                                    onChange={e => setSearchQ(e.target.value)}
                                />
                            </div>
                        </div>

                        {pinnedNotes.length === 0 && notes.length === 0 ? (
                            <div style={S.empty}>
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: 0.35 }}>
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                                </svg>
                                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>No notes yet</div>
                                <div style={{ fontSize: 12 }}>Create your first note in the New Note tab</div>
                            </div>
                        ) : (
                            <>
                                {filterNotes(pinnedNotes).length > 0 && (
                                    <>
                                        <div style={S.sectionLabel}>Pinned</div>
                                        {filterNotes(pinnedNotes).map(n => <NoteCard key={n.id} note={n} />)}
                                    </>
                                )}
                                {filterNotes(notes).length > 0 && (
                                    <>
                                        {filterNotes(pinnedNotes).length > 0 && <div style={S.sectionLabel}>Notes</div>}
                                        {filterNotes(notes).map(n => <NoteCard key={n.id} note={n} />)}
                                    </>
                                )}
                                {filterNotes(pinnedNotes).length === 0 && filterNotes(notes).length === 0 && searchQ && (
                                    <div style={S.empty}>
                                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>No matches</div>
                                        <div style={{ fontSize: 12 }}>Try a different search term</div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ── ACTIVITY TAB ── */}
                {tab === "activity" && (
                    <div>
                        <div style={{ padding: "12px 16px 6px", borderBottom: "1px solid #F2F4F7" }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#344054" }}>Recent Activity</div>
                            <div style={{ fontSize: 11, color: "#9AA0A6", marginTop: 2 }}>Last 20 notes modified</div>
                        </div>

                        {/* Stats row */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "12px 16px", borderBottom: "1px solid #F2F4F7" }}>
                            {[
                                { label: "Total", value: notes.length + pinnedNotes.length },
                                { label: "Pinned", value: pinnedNotes.length },
                                { label: "With reminders", value: [...notes, ...pinnedNotes].filter(n => n.reminder).length },
                            ].map(s => (
                                <div key={s.label} style={S.statCard}>
                                    <div style={{ fontSize: 18, fontWeight: 600, color: "#1A1D21", lineHeight: 1 }}>{s.value}</div>
                                    <div style={{ fontSize: 10, color: "#9AA0A6", marginTop: 3 }}>{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Upcoming reminders */}
                        {(() => {
                            const upcoming = [...notes, ...pinnedNotes]
                                .filter(n => n.reminder && !isOverdue(n.reminder))
                                .sort((a, b) => new Date(a.reminder) - new Date(b.reminder))
                                .slice(0, 5);
                            const overdue = [...notes, ...pinnedNotes]
                                .filter(n => n.reminder && isOverdue(n.reminder));
                            return (
                                <>
                                    {overdue.length > 0 && (
                                        <>
                                            <div style={{ ...S.sectionLabel, color: "#DC2626" }}>Overdue ({overdue.length})</div>
                                            {overdue.map(n => (
                                                <div key={n.id} style={{ padding: "10px 16px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "flex-start", gap: 8 }}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1D21", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</div>
                                                        <div style={{ fontSize: 10, color: "#DC2626", marginTop: 2 }}>{fmtDateTime(n.reminder)}</div>
                                                    </div>
                                                    <button onClick={() => startEdit(n)} style={{ fontSize: 10, color: "#1A73E8", background: "none", border: "none", cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}>Edit</button>
                                                </div>
                                            ))}
                                        </>
                                    )}

                                    {upcoming.length > 0 && (
                                        <>
                                            <div style={S.sectionLabel}>Upcoming Reminders</div>
                                            {upcoming.map(n => (
                                                <div key={n.id} style={{ padding: "10px 16px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "flex-start", gap: 8 }}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1D21", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</div>
                                                        <div style={{ fontSize: 10, color: "#D97706", marginTop: 2 }}>{fmtDateTime(n.reminder)}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )}

                                    {overdue.length === 0 && upcoming.length === 0 && (
                                        <div style={{ padding: "16px 16px", fontSize: 12, color: "#9AA0A6" }}>No reminders set.</div>
                                    )}
                                </>
                            );
                        })()}

                        {/* Activity log */}
                        {recentActivity.length > 0 && (
                            <>
                                <div style={S.sectionLabel}>Recent Changes</div>
                                {recentActivity.map((item, i) => (
                                    <div key={item.id + i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 16px", borderBottom: "1px solid #F2F4F7" }}>
                                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: item.action === "created" ? "#16A34A" : "#1A73E8", flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 12, fontWeight: 500, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                                                {item.title}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: 10, color: "#9AA0A6", whiteSpace: "nowrap" }}>{fmtTime(item.time)}</span>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                )}
            </div>

            <style>{`@keyframes cw-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
            <ImageLightbox />
        </>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
    panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid #E4E7EC", flexShrink: 0 },
    panelIcon: { width: 32, height: 32, borderRadius: 8, background: "#EBF3FE", display: "flex", alignItems: "center", justifyContent: "center" },
    panelTitle: { fontSize: 14, fontWeight: 700, color: "#1A1D21" },
    closeBtn: { width: 28, height: 28, borderRadius: 6, border: "1px solid #E4E7EC", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#667085" },
    tabBar: { display: "flex", borderBottom: "1px solid #E4E7EC", flexShrink: 0, padding: "0 8px", gap: 2 },
    tab: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "9px 8px 8px", fontSize: 11, fontWeight: 500, color: "#667085", border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", borderBottom: "2px solid transparent", transition: "all 0.1s" },
    tabActive: { color: "#1A73E8", borderBottomColor: "#1A73E8", fontWeight: 600 },
    body: { flex: 1, overflowY: "auto" },
    field: { display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 },
    lbl: { fontSize: 10, fontWeight: 700, color: "#344054", textTransform: "uppercase", letterSpacing: "0.05em" },
    input: { padding: "8px 11px", border: "1.5px solid #E4E7EC", borderRadius: 7, fontSize: 12.5, fontFamily: "inherit", color: "#1A1D21", background: "#F9FAFB", outline: "none", width: "100%", boxSizing: "border-box" },
    errBox: { background: "#FEF2F2", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 7, padding: "8px 12px", color: "#DC2626", fontSize: 12, marginBottom: 14 },
    successIcon: { width: 56, height: 56, borderRadius: "50%", background: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" },
    kpList: { listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4 },
    kpItem: { display: "flex", alignItems: "flex-start", gap: 6 },
    kpDot: { width: 5, height: 5, borderRadius: "50%", background: "#9AA0A6", flexShrink: 0, marginTop: 6 },
    fileChip: { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 99, background: "#EFF6FF", border: "1px solid #BFDBFE", fontSize: 11, color: "#1A73E8" },
    attChip: { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "#EFF6FF", border: "1px solid #BFDBFE", fontSize: 10, color: "#1A73E8", textDecoration: "none", fontWeight: 600 },
    searchBox: { display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", border: "1.5px solid #E4E7EC", borderRadius: 7, background: "#F9FAFB" },
    sectionLabel: { padding: "8px 16px 4px", fontSize: 10, fontWeight: 700, color: "#9AA0A6", textTransform: "uppercase", letterSpacing: "0.06em", borderTop: "1px solid #F2F4F7", marginTop: 4 },
    empty: { textAlign: "center", padding: "48px 20px", color: "#9AA0A6" },
    noteCard: { padding: "12px 16px", borderBottom: "1px solid #F2F4F7", transition: "background 0.08s" },
    noteCardHead: { display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 5 },
    noteTitle: { fontSize: 13, fontWeight: 700, color: "#1A1D21", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    noteTime: { fontSize: 10, color: "#9AA0A6" },
    noteDesc: { fontSize: 12, color: "#374151", lineHeight: 1.55, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
    menu: { position: "absolute", top: 26, right: 0, background: "#fff", border: "1px solid #E4E7EC", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", zIndex: 99, minWidth: 140, overflow: "hidden" },
    menuItem: { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 14px", fontSize: 12, fontWeight: 500, color: "#374151", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" },
    menuSep: { height: 1, background: "#F2F4F7", margin: "2px 0" },
    statCard: { background: "#F9FAFB", borderRadius: 6, padding: "10px 12px", border: "1px solid #F2F4F7", textAlign: "center" },
};

const BTN = {
    dots: { background: "none", border: "none", cursor: "pointer", color: "#9AA0A6", padding: "2px 4px", display: "flex", alignItems: "center", borderRadius: 4, flexShrink: 0 },
    removeKp: { background: "none", border: "none", cursor: "pointer", color: "#9AA0A6", padding: 2, display: "flex", alignItems: "center", flexShrink: 0 },
    addKp: { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "#F9FAFB", border: "1px dashed #D0D5DD", borderRadius: 6, color: "#667085", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 4 },
    attach: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#F9FAFB", border: "1.5px dashed #D0D5DD", borderRadius: 7, color: "#667085", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    save: { width: "100%", padding: 10, background: "#1A73E8", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, transition: "opacity 0.15s" },
};