"use client";
import { useState, useEffect, useRef } from "react";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function getToken() {
    const { firebaseAuth } = await import("../../../lib/coworkFirebase");
    return firebaseAuth.currentUser?.getIdToken();
}

async function apiFetch(path, opts = {}) {
    const token = await getToken();
    const res = await fetch(`${BASE}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...opts.headers },
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Request failed");
    return d;
}

const UPDATE_TYPES = [
    { value: "vendor_contacted", label: "Vendor Contacted", color: "#2563EB", bg: "#EFF6FF", icon: "📞" },
    { value: "vendor_replied", label: "Vendor Replied", color: "#059669", bg: "#F0FDF4", icon: "💬" },
    { value: "follow_up", label: "Following Up", color: "#D97706", bg: "#FFFBEB", icon: "🔄" },
    { value: "delay_reported", label: "Delay Reported", color: "#DC2626", bg: "#FEF2F2", icon: "⚠️" },
    { value: "quote_received", label: "Quote Received", color: "#7C3AED", bg: "#F5F3FF", icon: "📄" },
    { value: "payment_request", label: "Payment Request", color: "#B45309", bg: "#FEF3C7", icon: "💰" },
    { value: "order_dispatched", label: "Order Dispatched", color: "#0891B2", bg: "#ECFEFF", icon: "🚚" },
    { value: "resolved", label: "Resolved", color: "#166534", bg: "#DCFCE7", icon: "✅" },
];

const TIMELINE_STEPS = [
    { key: "created", label: "Task Created" },
    { key: "vendor_contacted", label: "Vendor Contacted" },
    { key: "in_progress", label: "In Progress" },
    { key: "quote_received", label: "Quote Received" },
    { key: "completed", label: "Completed" },
];

function fmtDate(ts) {
    if (!ts) return "";
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(ts) {
    if (!ts) return "";
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function daysSince(ts) {
    if (!ts) return null;
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/* ─── Horizontal timeline bar ─── */
function TimelineBar({ task }) {
    const updates = task.vendorUpdates || [];
    const hasStep = (key) => {
        if (key === "created") return true;
        if (key === "vendor_contacted") return updates.some(u => u.type === "vendor_contacted");
        if (key === "in_progress") return updates.some(u => ["vendor_replied", "follow_up", "quote_received"].includes(u.type));
        if (key === "quote_received") return updates.some(u => u.type === "quote_received");
        if (key === "completed") return task.thirdPartyStatus === "completed";
        return false;
    };

    const activeIdx = (() => {
        let idx = 0;
        TIMELINE_STEPS.forEach((s, i) => { if (hasStep(s.key)) idx = i; });
        return idx;
    })();

    return (
        <div style={{ padding: "12px 14px 4px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", position: "relative" }}>
                {TIMELINE_STEPS.map((step, i) => {
                    const done = hasStep(step.key);
                    const active = i === activeIdx;
                    const isLast = i === TIMELINE_STEPS.length - 1;
                    const stepUpdate = updates.findLast?.(u => u.type === step.key) || updates.find(u => u.type === step.key);
                    return (
                        <div key={step.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                            {!isLast && (
                                <div style={{ position: "absolute", top: 11, left: "50%", width: "100%", height: 3, background: done && i < activeIdx ? "#7C3AED" : "#E2E8F0", zIndex: 0 }} />
                            )}
                            <div style={{ width: 24, height: 24, borderRadius: "50%", background: done ? "#7C3AED" : "#E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, flexShrink: 0, border: active ? "2.5px solid #7C3AED" : "none", boxShadow: active ? "0 0 0 3px rgba(124,58,237,0.15)" : "none" }}>
                                {done && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </div>
                            <div style={{ marginTop: 5, textAlign: "center" }}>
                                <div style={{ fontSize: 9, fontWeight: done ? 700 : 500, color: done ? "#1E293B" : "#94A3B8", whiteSpace: "nowrap" }}>{step.label}</div>
                                {stepUpdate && <div style={{ fontSize: 8, color: "#94A3B8", marginTop: 1 }}>{fmtDate(stepUpdate.createdAt)}</div>}
                                {step.key === "created" && <div style={{ fontSize: 8, color: "#94A3B8", marginTop: 1 }}>{fmtDate(task.createdAt)}</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ─── Single update entry card ─── */
function UpdateCard({ update, isCEO, isTL, taskId, onRefresh }) {
    const ut = UPDATE_TYPES.find(u => u.value === update.type) || UPDATE_TYPES[0];
    const [approving, setApproving] = useState(false);

    const handlePaymentAction = async (action) => {
        setApproving(true);
        try {
            await apiFetch(`/cowork/task/${taskId}/third-party-payment-action`, {
                method: "POST",
                body: JSON.stringify({ updateId: update.id, action }),
            });
            onRefresh?.();
        } catch (e) { alert(e.message); }
        finally { setApproving(false); }
    };

    return (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: ut.bg, border: `1.5px solid ${ut.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{ut.icon}</div>
                <div style={{ width: 1.5, flex: 1, minHeight: 16, background: "#E2E8F0", marginTop: 2 }} />
            </div>
            <div style={{ flex: 1, paddingBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: ut.bg, color: ut.color }}>{ut.label}</span>
                    <span style={{ fontSize: 10, color: "#94A3B8" }}>{update.loggedByName}</span>
                    <span style={{ fontSize: 10, color: "#CBD5E1" }}>·</span>
                    <span style={{ fontSize: 10, color: "#94A3B8" }}>{fmtDate(update.createdAt)} {fmtTime(update.createdAt)}</span>
                </div>
                {update.message && (
                    <p style={{ fontSize: 12, color: "#1E293B", margin: "0 0 6px", lineHeight: 1.55 }}>{update.message}</p>
                )}
                {update.type === "payment_request" && update.amount && (
                    <div style={{ background: "#FFFBEB", border: "1.5px solid #FDE68A", borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#92400E" }}>💰 Payment Request: ₹{Number(update.amount).toLocaleString("en-IN")}</div>
                        {update.paymentNote && <div style={{ fontSize: 11, color: "#78350F", marginTop: 2 }}>{update.paymentNote}</div>}
                        {update.paymentStatus === "approved" && (
                            <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "#166534", background: "#DCFCE7", padding: "3px 8px", borderRadius: 5, display: "inline-block" }}>✅ Approved by {update.approvedByName}</div>
                        )}
                        {update.paymentStatus === "rejected" && (
                            <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "#991B1B", background: "#FEE2E2", padding: "3px 8px", borderRadius: 5, display: "inline-block" }}>❌ Rejected by {update.approvedByName}</div>
                        )}
                        {!update.paymentStatus && (isCEO || isTL) && (
                            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                                <button disabled={approving} onClick={() => handlePaymentAction("approved")}
                                    style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#059669", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✅ Approve</button>
                                <button disabled={approving} onClick={() => handlePaymentAction("rejected")}
                                    style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#DC2626", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>❌ Reject</button>
                            </div>
                        )}
                        {!update.paymentStatus && !(isCEO || isTL) && (
                            <div style={{ marginTop: 6, fontSize: 10, color: "#92400E" }}>Pending approval from CEO/TL</div>
                        )}
                    </div>
                )}
                {update.files?.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {update.files.map((f, i) => (
                            <a key={i} href={f.url} target="_blank" rel="noreferrer"
                                style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: "#F1F5F9", color: "#334155", textDecoration: "none", border: "0.5px solid #CBD5E1", display: "flex", alignItems: "center", gap: 4 }}>
                                📎 {f.name}
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Vendor Info Strip with inline edit ─── */
function VendorInfoStrip({ rc, task, isAssignee, isCEO, isTL, isStale, daysSinceUpdate, lastUpdateTs, onRefresh }) {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        vendorName: rc.vendorName || "",
        vendorCategory: rc.vendorCategory || "Machine",
        vendorContact: rc.vendorContact || "",
        estimatedDate: rc.estimatedDate || "",
    });

    const canEdit = isCEO || isTL || isAssignee;

    const handleSave = async () => {
        setSaving(true);
        try {
            await apiFetch(`/cowork/task/${task.taskId}/update-vendor-config`, {
                method: "PATCH",
                body: JSON.stringify({ thirdPartyConfig: { ...rc, ...form } }),
            });
            setEditing(false);
            onRefresh?.();
        } catch (e) { alert(e.message); }
        finally { setSaving(false); }
    };

    if (editing) return (
        <div style={{ background: "#F8FAFC", border: "1.5px solid #C4B5FD", borderRadius: 9, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6D28D9", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Edit Vendor Details</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input placeholder="Vendor name (optional)" value={form.vendorName} onChange={e => setForm(p => ({ ...p, vendorName: e.target.value }))}
                    style={{ padding: "7px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
                <select value={form.vendorCategory} onChange={e => setForm(p => ({ ...p, vendorCategory: e.target.value }))}
                    style={{ padding: "7px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none" }}>
                    {["Machine", "Material", "Service", "Software", "Logistics", "Other"].map(c => <option key={c}>{c}</option>)}
                </select>
                <input placeholder="Contact (phone / email) — optional" value={form.vendorContact} onChange={e => setForm(p => ({ ...p, vendorContact: e.target.value }))}
                    style={{ padding: "7px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
                <input type="date" value={form.estimatedDate} onChange={e => setForm(p => ({ ...p, estimatedDate: e.target.value }))}
                    style={{ padding: "7px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                <button onClick={handleSave} disabled={saving}
                    style={{ flex: 1, padding: "7px", borderRadius: 7, border: "none", background: saving ? "#94A3B8" : "#7C3AED", color: "#fff", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditing(false)}
                    style={{ padding: "7px 14px", borderRadius: 7, border: "1.5px solid #E2E8F0", background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    Cancel
                </button>
            </div>
        </div>
    );

    return (
        <div style={{ background: "#F8FAFC", border: "1.5px solid #E2E8F0", borderRadius: 9, padding: "9px 12px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1E293B" }}>
                    {rc.vendorName || <span style={{ color: "#94A3B8", fontStyle: "italic" }}>No vendor name set</span>}
                </div>
                <div style={{ fontSize: 10, color: "#64748B", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {rc.vendorCategory && <span style={{ background: "#EDE9FE", color: "#7C3AED", padding: "1px 7px", borderRadius: 4, fontWeight: 600 }}>{rc.vendorCategory}</span>}
                    {rc.vendorContact && <span>📞 {rc.vendorContact}</span>}
                    {rc.estimatedDate && <span>📅 Est: {rc.estimatedDate}</span>}
                    {!rc.vendorName && !rc.vendorContact && !rc.estimatedDate && canEdit && (
                        <span style={{ color: "#F59E0B", fontSize: 10 }}>⚠️ Vendor details not filled</span>
                    )}
                </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "#64748B" }}>Last update</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isStale ? "#DC2626" : "#1E293B" }}>
                        {lastUpdateTs ? `${daysSinceUpdate}d ago` : "No updates yet"}
                    </div>
                </div>
                {canEdit && task.status !== "done" && (
                    <button onClick={() => { setForm({ vendorName: rc.vendorName || "", vendorCategory: rc.vendorCategory || "Machine", vendorContact: rc.vendorContact || "", estimatedDate: rc.estimatedDate || "" }); setEditing(true); }}
                        style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "1.5px solid #C4B5FD", background: "#F5F3FF", color: "#7C3AED", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                        ✏️ Edit Vendor
                    </button>
                )}
            </div>
        </div>
    );
}

/* ─── Log Update Form ─── */
function LogUpdateForm({ taskId, onSuccess }) {
    const [type, setType] = useState("vendor_contacted");
    const [message, setMessage] = useState("");
    const [files, setFiles] = useState([]);
    const [pending, setPending] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [amount, setAmount] = useState("");
    const [paymentNote, setPaymentNote] = useState("");
    const fileInputRef = useRef(null);

    const isPayment = type === "payment_request";

    const handleFiles = async (fileList) => {
        const fileArr = Array.from(fileList || []);
        if (!fileArr.length) return;
        setError("");
        setUploading(true);

        const ids = fileArr.map(() => Math.random().toString(36).slice(2));
        setPending(prev => [...prev, ...fileArr.map((f, i) => ({ id: ids[i], name: f.name }))]);

        try {
            const { uploadImage, uploadPDF } = await import("../../../lib/mediaUploadApi");

            const results = await Promise.allSettled(fileArr.map(async (file) => {
                const isImage = file.type.startsWith("image/");
                if (isImage) {
                    const r = await uploadImage(file, "cowork-third-party");
                    return { name: file.name, url: r.url, type: "image", size: file.size, mimeType: file.type };
                }
                const r = await uploadPDF(file);
                const url = r.viewUrl || r.url || r.webViewLink;
                if (!url) throw new Error("Server didn't return a file URL.");
                return { name: file.name, url, downloadUrl: r.downloadUrl, fileId: r.fileId, type: "file", size: file.size, mimeType: r.mimeType || file.type };
            }));

            const successful = [];
            const failed = [];
            results.forEach((r, i) => {
                if (r.status === "fulfilled") successful.push(r.value);
                else failed.push({ name: fileArr[i].name, error: r.reason?.message || "Failed" });
            });

            setPending(prev => prev.filter(p => !ids.includes(p.id)));
            if (successful.length) setFiles(prev => [...prev, ...successful]);
            if (failed.length) {
                setError(`${failed.length} file${failed.length > 1 ? "s" : ""} failed — ${failed.map(f => `${f.name}: ${f.error}`).join("; ")}`);
            }
        } catch (e) {
            setPending(prev => prev.filter(p => !ids.includes(p.id)));
            setError(e.message || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async () => {
        if (!message.trim() && !isPayment) { setError("Please add a message."); return; }
        if (isPayment && !amount) { setError("Please enter the payment amount."); return; }
        setSubmitting(true); setError("");
        try {
            await apiFetch(`/cowork/task/${taskId}/third-party-update`, {
                method: "POST",
                body: JSON.stringify({ type, message, files, amount: isPayment ? amount : null, paymentNote: isPayment ? paymentNote : null }),
            });
            setType("vendor_contacted"); setMessage(""); setFiles([]); setAmount(""); setPaymentNote("");
            onSuccess?.();
        } catch (e) { setError(e.message); }
        finally { setSubmitting(false); }
    };

    return (
        <div style={{ background: "#F8FAFC", border: "1.5px solid #E2E8F0", borderRadius: 10, padding: 14, marginTop: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Log Update</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                {UPDATE_TYPES.map(u => (
                    <button key={u.value} onClick={() => setType(u.value)}
                        style={{ padding: "4px 10px", borderRadius: 99, border: `1.5px solid ${type === u.value ? u.color : "#E2E8F0"}`, background: type === u.value ? u.bg : "#fff", color: type === u.value ? u.color : "#64748B", fontSize: 11, fontWeight: type === u.value ? 700 : 500, cursor: "pointer", fontFamily: "inherit" }}>
                        {u.icon} {u.label}
                    </button>
                ))}
            </div>
            {isPayment && (
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input type="number" placeholder="Amount (₹) *" value={amount} onChange={e => setAmount(e.target.value)}
                        style={{ flex: 1, padding: "7px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
                    <input type="text" placeholder="Reason / note" value={paymentNote} onChange={e => setPaymentNote(e.target.value)}
                        style={{ flex: 2, padding: "7px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
                </div>
            )}
            <textarea placeholder={isPayment ? "Additional details (optional)..." : "What happened? Any details..."} value={message} onChange={e => setMessage(e.target.value)}
                style={{ width: "100%", minHeight: 56, padding: "7px 10px", border: "1.5px solid #E2E8F0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", resize: "vertical", outline: "none", background: "#fff", boxSizing: "border-box" }} />
            {pending.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "7px 0" }}>
                    {pending.map(p => (
                        <div key={p.id} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: "#FEF3C7", color: "#92400E", display: "flex", alignItems: "center", gap: 5 }}>
                            <span className="tpt-spin" style={{ display: "inline-block", width: 8, height: 8, border: "1.5px solid #92400E", borderTopColor: "transparent", borderRadius: "50%" }} />
                            uploading {p.name}…
                        </div>
                    ))}
                </div>
            )}
            {files.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "7px 0" }}>
                    {files.map((f, i) => (
                        <div key={i} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: "#F0FDF4", color: "#166534", display: "flex", alignItems: "center", gap: 4, border: "0.5px solid #86EFAC" }}>
                            ✓ {f.name}
                            <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                        </div>
                    ))}
                </div>
            )}
            {error && (
                <div style={{ background: "#FEF2F2", border: "1.5px solid #FECDD3", borderRadius: 7, padding: "7px 10px", margin: "8px 0 0", display: "flex", alignItems: "flex-start", gap: 6 }}>
                    <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
                    <span style={{ fontSize: 11, color: "#991B1B", lineHeight: 1.45, wordBreak: "break-word", flex: 1 }}>{error}</span>
                    <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "#991B1B", fontSize: 14, cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>
            )}
            <div style={{ display: "flex", gap: 7, marginTop: 8, alignItems: "center" }}>
                <label htmlFor="tpt-file-input"
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, border: "1.5px dashed #CBD5E1", cursor: uploading ? "not-allowed" : "pointer", fontSize: 11, color: "#475569", background: "#fff", fontFamily: "inherit", opacity: uploading ? 0.6 : 1, userSelect: "none", flexShrink: 0 }}>
                    {uploading ? "⏳ Uploading…" : "📎 Attach files"}
                </label>
                <input id="tpt-file-input" ref={fileInputRef} type="file" multiple
                    style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                    disabled={uploading}
                    onChange={e => {
                        const fileArr = Array.from(e.target.files || []);
                        e.target.value = "";
                        if (fileArr.length) handleFiles(fileArr);
                    }}
                />
                <button disabled={submitting || uploading} onClick={handleSubmit}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 7, border: "none", background: (submitting || uploading) ? "#94A3B8" : "#7C3AED", color: "#fff", fontSize: 12, fontWeight: 700, cursor: (submitting || uploading) ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {submitting ? "Logging…" : "Log Update"}
                </button>
            </div>
            <style jsx>{`
                .tpt-spin { animation: tpt-spin 0.8s linear infinite; }
                @keyframes tpt-spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

/* ─── Main ThirdPartyTask component ─── */
export default function ThirdPartyTask({ task, isAssignee, isCEO, isTL, onRefresh }) {
    const rc = task.thirdPartyConfig || {};
    const updates = [...(task.vendorUpdates || [])].sort((a, b) => {
        const ta = a.createdAt?.seconds || 0;
        const tb = b.createdAt?.seconds || 0;
        return tb - ta;
    });

    const lastUpdateTs = updates[0]?.createdAt;
    const daysSinceUpdate = daysSince(lastUpdateTs);
    const updateThresholdDays = rc.updateIntervalDays || 2;
    const isStale = daysSinceUpdate !== null && daysSinceUpdate >= updateThresholdDays;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

            <TimelineBar task={task} />

            <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

                <VendorInfoStrip
                    rc={rc}
                    task={task}
                    isAssignee={isAssignee}
                    isCEO={isCEO}
                    isTL={isTL}
                    isStale={isStale}
                    daysSinceUpdate={daysSinceUpdate}
                    lastUpdateTs={lastUpdateTs}
                    onRefresh={onRefresh}
                />

                {task.completionStatus === "submitted" && task.status !== "done" && (
                    <div style={{ background: "#F0FDF4", border: "1.5px solid #86EFAC", borderRadius: 8, padding: "10px 12px", fontSize: 11, color: "#166534", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>⏳</span>
                        <div>
                            <div style={{ fontWeight: 700, marginBottom: 2 }}>Submitted for Completion Review</div>
                            <div style={{ color: "#15803D" }}>Waiting for CEO / Team Lead to approve and mark as completed.</div>
                        </div>
                    </div>
                )}

                {isStale && (
                    <div style={{ background: "#FEF2F2", border: "1.5px solid #FECDD3", borderRadius: 8, padding: "8px 10px", fontSize: 11, color: "#991B1B", display: "flex", alignItems: "center", gap: 6 }}>
                        ⚠️ <b>No update in {daysSinceUpdate} days.</b> Expected every {updateThresholdDays} day{updateThresholdDays > 1 ? "s" : ""}.
                        {isAssignee && " Please log an update."}
                        {(isCEO || isTL) && " Employee has not updated this task."}
                    </div>
                )}

                {isAssignee && task.status !== "done" && task.completionStatus !== "submitted" && (
                    <LogUpdateForm taskId={task.taskId} onSuccess={onRefresh} />
                )}

                {updates.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: "#94A3B8", fontSize: 12 }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>📋</div>
                        No updates yet. Log the first vendor contact.
                    </div>
                ) : (
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                            Update History ({updates.length})
                        </div>
                        {updates.map(u => (
                            <UpdateCard key={u.id} update={u} isCEO={isCEO} isTL={isTL} taskId={task.taskId} onRefresh={onRefresh} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}