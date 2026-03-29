"use client";
/**
 * GRAV-CMS/app/coworking/create-group/page.js
 *
 * Full group management page:
 *  ✅ List all groups (real-time via Firestore onSnapshot)
 *  ✅ Create new group (CEO only)
 *  ✅ Edit group name & description (CEO only)
 *  ✅ Add member to group (CEO only)
 *  ✅ Remove member from group (CEO only)
 *  ✅ Delete group (CEO only)
 *  ✅ Message seen / unseen status on each group card
 *  ✅ Click group card → opens group chat
 *  ✅ All API calls use backend (groups management) — message ops use Firestore directly
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  collection, query, where, onSnapshot, getDocs, doc, getDoc,
} from "firebase/firestore";
import { useCoworkAuth } from "../../../hooks/useCoworkAuth";
import CoworkingShell from "../../../components/coworking/layout/CoworkingShell";
import { GwAvatar, GwSpinner, GwEmpty, GwConfirm } from "../../../components/coworking/shared/CoworkShared";
import { firebaseDb, firebaseAuth } from "../../../lib/coworkFirebase";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

async function apiFetch(path, opts = {}) {
  const u = firebaseAuth.currentUser;
  if (!u) throw new Error("Not authenticated");
  const token = await u.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...opts.headers },
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "Request failed");
  return d;
}

function tsToISO(ts) {
  if (!ts) return null;
  if (ts?.seconds) return new Date(ts.seconds * 1000).toISOString();
  return String(ts);
}

function timeAgo(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function initials(name = "") {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

const AVATAR_PALETTE = [
  "#1A73E8", "#7C3AED", "#1E8E3E", "#E37400", "#D93025", "#0E7490", "#9D174D", "#065F46"
];
function avatarColor(name = "") {
  return AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];
}

// ── Small Avatar ─────────────────────────────────────────
function SmallAvatar({ name = "", size = 30 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: avatarColor(name), display: "flex", alignItems: "center",
      justifyContent: "center", color: "#fff", fontWeight: 700,
      fontSize: Math.max(9, Math.round(size * 0.35)),
    }}>
      {initials(name)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CREATE / EDIT MODAL
// ═══════════════════════════════════════════════════════════
function GroupFormModal({ mode, group, allEmployees, currentEmployeeId, onClose, onSuccess }) {
  const [name, setName] = useState(group?.name || "");
  const [desc, setDesc] = useState(group?.description || "");
  const [selectedIds, setSelectedIds] = useState(group?.memberIds || []);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEdit = mode === "edit";
  const title = isEdit ? "Edit Group" : "Create New Group";

  const toggleMember = (id) => {
    if (id === currentEmployeeId) return; // CEO always stays
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const filtered = allEmployees.filter(e =>
    e.employeeId !== currentEmployeeId &&
    (e.name?.toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Group name is required"); return; }
    if (!isEdit && selectedIds.length === 0) { setError("Select at least one member"); return; }
    setSaving(true); setError("");
    try {
      if (isEdit) {
        await apiFetch(`/cowork/group/${group.groupId}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim(), description: desc }),
        });
      } else {
        const members = [...new Set([currentEmployeeId, ...selectedIds])];
        await apiFetch("/cowork/group/create", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), description: desc, memberIds: members }),
        });
      }
      onSuccess();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={ms.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={ms.modal}>
        {/* Header */}
        <div style={ms.header}>
          <div>
            <div style={ms.modalTitle}>{title}</div>
            {isEdit && <div style={ms.modalSub}>{group.groupId}</div>}
          </div>
          <button onClick={onClose} style={ms.closeBtn}>✕</button>
        </div>

        <div style={ms.body}>
          {/* Name */}
          <div style={ms.field}>
            <label style={ms.label}>Group Name *</label>
            <input
              style={ms.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Design Team"
              maxLength={60}
            />
          </div>

          {/* Description */}
          <div style={ms.field}>
            <label style={ms.label}>Description</label>
            <textarea
              style={{ ...ms.input, minHeight: 68, resize: "vertical" }}
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Optional group description…"
            />
          </div>

          {/* Members (create mode only) */}
          {!isEdit && (
            <div style={ms.field}>
              <label style={ms.label}>
                Members
                <span style={{ color: "#9AA0A6", fontWeight: 400, marginLeft: 6 }}>
                  {selectedIds.length} selected
                </span>
              </label>
              <input
                style={{ ...ms.input, marginBottom: 8 }}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search employees…"
              />
              <div style={ms.memberList}>
                {filtered.map(emp => {
                  const sel = selectedIds.includes(emp.employeeId);
                  return (
                    <div
                      key={emp.employeeId}
                      onClick={() => toggleMember(emp.employeeId)}
                      style={{
                        ...ms.memberRow,
                        background: sel ? "#EFF6FF" : "transparent",
                        borderColor: sel ? "#BFDBFE" : "#F1F3F4",
                      }}
                    >
                      <SmallAvatar name={emp.name} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "#202124" }}>{emp.name}</div>
                        <div style={{ fontSize: 10, color: "#9AA0A6" }}>{emp.department || emp.employeeId}</div>
                      </div>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                        border: sel ? "none" : "1.5px solid #D1D5DB",
                        background: sel ? "#1A73E8" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {sel && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5 4-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <div style={{ textAlign: "center", padding: "20px", color: "#9AA0A6", fontSize: 12 }}>
                    No employees found
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <div style={ms.errorBox}>{error}</div>}
        </div>

        <div style={ms.footer}>
          <button onClick={onClose} style={ms.cancelBtn} disabled={saving}>Cancel</button>
          <button onClick={handleSubmit} style={ms.submitBtn} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ADD MEMBER MODAL
// ═══════════════════════════════════════════════════════════
function AddMemberModal({ group, allEmployees, onClose, onSuccess }) {
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(null); // employeeId being added
  const [error, setError] = useState("");

  const nonMembers = allEmployees.filter(e =>
    !(group.memberIds || []).includes(e.employeeId) &&
    (e.name?.toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase()))
  );

  const handleAdd = async (emp) => {
    setSaving(emp.employeeId); setError("");
    try {
      await apiFetch(`/cowork/group/${group.groupId}/members`, {
        method: "POST",
        body: JSON.stringify({ employeeId: emp.employeeId }),
      });
      onSuccess();
    } catch (e) { setError(e.message); }
    finally { setSaving(null); }
  };

  return (
    <div style={ms.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...ms.modal, maxWidth: 400 }}>
        <div style={ms.header}>
          <div>
            <div style={ms.modalTitle}>Add Member</div>
            <div style={ms.modalSub}>{group.name}</div>
          </div>
          <button onClick={onClose} style={ms.closeBtn}>✕</button>
        </div>
        <div style={ms.body}>
          <input
            style={ms.input}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employees to add…"
            autoFocus
          />
          <div style={{ ...ms.memberList, marginTop: 8 }}>
            {nonMembers.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, color: "#9AA0A6", fontSize: 12 }}>
                {allEmployees.length === 0 ? "Loading…" : "All employees are already members"}
              </div>
            ) : (
              nonMembers.map(emp => (
                <div key={emp.employeeId} style={{ ...ms.memberRow, borderColor: "#F1F3F4" }}>
                  <SmallAvatar name={emp.name} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#202124" }}>{emp.name}</div>
                    <div style={{ fontSize: 10, color: "#9AA0A6" }}>{emp.department || emp.employeeId}</div>
                  </div>
                  <button
                    onClick={() => handleAdd(emp)}
                    disabled={saving === emp.employeeId}
                    style={{
                      padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                      background: saving === emp.employeeId ? "#F1F3F4" : "#EFF6FF",
                      color: "#1A73E8", border: "1px solid #BFDBFE",
                      cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
                    }}
                  >
                    {saving === emp.employeeId ? "Adding…" : "+ Add"}
                  </button>
                </div>
              ))
            )}
          </div>
          {error && <div style={{ ...ms.errorBox, marginTop: 8 }}>{error}</div>}
        </div>
        <div style={ms.footer}>
          <button onClick={onClose} style={ms.cancelBtn}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MEMBERS MANAGE MODAL (view + remove)
// ═══════════════════════════════════════════════════════════
function ManageMembersModal({ group, allEmployees, currentEmployeeId, onClose, onMemberRemoved }) {
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(null);

  const empMap = Object.fromEntries(allEmployees.map(e => [e.employeeId, e]));

  const doRemove = async (empId) => {
    setRemoving(empId); setError("");
    try {
      await apiFetch(`/cowork/group/${group.groupId}/members/${empId}`, { method: "DELETE" });
      setConfirmRemove(null);
      onMemberRemoved(empId);
    } catch (e) { setError(e.message); }
    finally { setRemoving(null); }
  };

  return (
    <div style={ms.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...ms.modal, maxWidth: 400 }}>
        <div style={ms.header}>
          <div>
            <div style={ms.modalTitle}>Manage Members</div>
            <div style={ms.modalSub}>{group.name} · {(group.memberIds || []).length} members</div>
          </div>
          <button onClick={onClose} style={ms.closeBtn}>✕</button>
        </div>
        <div style={ms.body}>
          <div style={{ ...ms.memberList, maxHeight: 340 }}>
            {(group.memberIds || []).map(id => {
              const emp = empMap[id];
              const name = emp?.name || id;
              const isCreator = id === group.createdBy;
              return (
                <div key={id} style={{ ...ms.memberRow, borderColor: "#F1F3F4" }}>
                  <SmallAvatar name={name} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#202124", display: "flex", alignItems: "center", gap: 5 }}>
                      {name}
                      {isCreator && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#1A73E8", background: "#EFF6FF", padding: "1px 6px", borderRadius: 99 }}>
                          Creator
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: "#9AA0A6" }}>{emp?.department || id}</div>
                  </div>
                  {!isCreator && (
                    <button
                      onClick={() => setConfirmRemove({ id, name })}
                      disabled={removing === id}
                      style={{
                        padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                        background: "#FCE8E6", color: "#D93025", border: "1px solid #F5C6C2",
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {removing === id ? "…" : "Remove"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {error && <div style={{ ...ms.errorBox, marginTop: 8 }}>{error}</div>}
        </div>
        <div style={ms.footer}>
          <button onClick={onClose} style={ms.cancelBtn}>Close</button>
        </div>
      </div>

      {/* Confirm remove */}
      {confirmRemove && (
        <GwConfirm
          open={true}
          title="Remove Member?"
          message={`Remove ${confirmRemove.name} from "${group.name}"? They will lose access to this group's chat.`}
          onConfirm={() => doRemove(confirmRemove.id)}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GROUP CARD
// ═══════════════════════════════════════════════════════════
function GroupCard({ group, currentEmployeeId, isCEO, allEmployees, onOpenChat, onEdit, onDelete, onAddMember, onManageMembers }) {
  const empMap = Object.fromEntries(allEmployees.map(e => [e.employeeId, e]));
  const lastMsg = group.lastMessage;
  const msgType = lastMsg?.messageType;
  const preview = msgType === "image" ? "📷 Image"
    : msgType === "pdf" ? "📄 Document"
      : msgType === "voice" ? "🎤 Voice note"
        : lastMsg?.text?.slice(0, 50) || "No messages yet";
  const ts = tsToISO(lastMsg?.sentAt || group.updatedAt || group.createdAt);

  // Seen/unseen: if lastMessage exists and senderId !== me, it's "unseen" (unread)
  const hasUnread = lastMsg && lastMsg.senderId && lastMsg.senderId !== currentEmployeeId;

  return (
    <div style={gc.card}>
      {/* Main row — click → open chat */}
      <div style={gc.mainRow} onClick={() => onOpenChat(group.groupId)}>
        {/* Avatar */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `linear-gradient(135deg, ${avatarColor(group.name)}, ${avatarColor(group.name + "x")})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 15,
          }}>
            {initials(group.name)}
          </div>
          {hasUnread && (
            <span style={{
              position: "absolute", top: -3, right: -3,
              width: 12, height: 12, borderRadius: "50%",
              background: "#D93025", border: "2px solid #fff",
            }} title="Unread messages" />
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#202124", letterSpacing: "-0.01em" }}>
              {group.name}
            </span>
            <span style={{ fontSize: 10, color: "#9AA0A6", fontFamily: "monospace", flexShrink: 0 }}>
              {timeAgo(ts)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: hasUnread ? "#202124" : "#9AA0A6", fontWeight: hasUnread ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {lastMsg?.senderName && `${lastMsg.senderName}: `}{preview}
            </div>
            {hasUnread && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: "#D93025",
                background: "#FCE8E6", padding: "1px 6px", borderRadius: 99,
                flexShrink: 0, marginLeft: 6,
              }}>
                New
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            {/* Member avatars */}
            <div style={{ display: "flex", marginRight: 2 }}>
              {(group.memberIds || []).slice(0, 4).map((id, i) => {
                const e = empMap[id];
                return (
                  <div key={id} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 4 - i }}>
                    <SmallAvatar name={e?.name || id} size={18} />
                  </div>
                );
              })}
            </div>
            <span style={{ fontSize: 10, color: "#9AA0A6" }}>
              {(group.memberIds || []).length} member{(group.memberIds || []).length !== 1 ? "s" : ""}
            </span>
            <span style={{ fontSize: 10, color: "#D1D5DB" }}>·</span>
            <span style={{ fontSize: 9, fontFamily: "monospace", color: "#D1D5DB" }}>{group.groupId}</span>
          </div>
        </div>
      </div>

      {/* CEO Action bar */}
      {isCEO && (
        <div style={gc.actions} onClick={e => e.stopPropagation()}>
          <button style={gc.actionBtn("#EFF6FF", "#1A73E8")} onClick={() => onAddMember(group)} title="Add member">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="5" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M1 11c0-2.2 1.8-4 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M10 7v4M8 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Add
          </button>
          <button style={gc.actionBtn("#F5F3FF", "#7C3AED")} onClick={() => onManageMembers(group)} title="Manage members">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="4.5" cy="4" r="2" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="9.5" cy="4" r="2" stroke="currentColor" strokeWidth="1.2" />
              <path d="M1 11c0-2 1.6-3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M7 11c0-2 1.6-3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Members
          </button>
          <button style={gc.actionBtn("#FEF7E0", "#E37400")} onClick={() => onEdit(group)} title="Edit group">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M9 2l2 2L4 11H2V9L9 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            Edit
          </button>
          <button style={gc.actionBtn("#FCE8E6", "#D93025")} onClick={() => onDelete(group)} title="Delete group">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 3.5h9M5 3.5V2.5h3v1M4 3.5l.5 7h4l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════
export default function CreateGroupPage() {
  const { user, role, employeeId, employeeName, loading } = useCoworkAuth();
  const router = useRouter();
  const isCEO = role === "ceo";

  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [allEmployees, setAllEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // null | "create" | { type:"edit"|"add"|"members", group }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const unsubRef = useRef(null);

  useEffect(() => {
    if (!loading && !user) router.push("/coworking-login");
  }, [user, loading, router]);

  // ── Real-time groups from Firestore ──────────────────────
  useEffect(() => {
    if (!employeeId) return;
    setGroupsLoading(true);
    let q;
    if (isCEO) {
      q = query(collection(firebaseDb, "cowork_groups"), where("deleted", "==", false));
    } else {
      q = query(
        collection(firebaseDb, "cowork_groups"),
        where("deleted", "==", false),
        where("memberIds", "array-contains", employeeId)
      );
    }
    const unsub = onSnapshot(q, snap => {
      const gs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aT = a.lastMessage?.sentAt?.seconds || a.updatedAt?.seconds || 0;
          const bT = b.lastMessage?.sentAt?.seconds || b.updatedAt?.seconds || 0;
          return bT - aT;
        });
      setGroups(gs);
      setGroupsLoading(false);
    }, err => {
      console.error("groups listener:", err);
      setGroupsLoading(false);
    });
    unsubRef.current = unsub;
    return () => unsub();
  }, [employeeId, isCEO]);

  // ── Load all employees (CEO needs for add/create) ────────
  useEffect(() => {
    if (!isCEO || !user) return;
    getDocs(collection(firebaseDb, "cowork_employees"))
      .then(snap => {
        setAllEmployees(snap.docs.map(d => ({ employeeId: d.id, ...d.data() })));
      })
      .catch(console.error);
  }, [isCEO, user]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/cowork/group/${deleteTarget.groupId}`, { method: "DELETE" });
      setDeleteTarget(null);
    } catch (e) { alert(e.message); }
    finally { setDeleting(false); }
  };

  const handleMemberRemoved = (removedEmpId) => {
    // Update local group state optimistically
    setGroups(prev => prev.map(g =>
      g.groupId === modal?.group?.groupId
        ? { ...g, memberIds: (g.memberIds || []).filter(id => id !== removedEmpId) }
        : g
    ));
    if (modal?.group) {
      setModal(prev => ({
        ...prev,
        group: {
          ...prev.group,
          memberIds: (prev.group.memberIds || []).filter(id => id !== removedEmpId),
        },
      }));
    }
  };

  if (loading || !user) return null;

  const filtered = groups.filter(g =>
    g.name?.toLowerCase().includes(search.toLowerCase()) ||
    g.description?.toLowerCase().includes(search.toLowerCase())
  );

  const totalUnread = groups.filter(g =>
    g.lastMessage?.senderId && g.lastMessage.senderId !== employeeId
  ).length;

  return (
    <>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* ── Page header ── */}
        <div style={pg.header}>
          <div>
            <h1 style={pg.title}>Groups</h1>
            <p style={pg.sub}>
              {groupsLoading ? "Loading…" : `${groups.length} group${groups.length !== 1 ? "s" : ""}${totalUnread > 0 ? ` · ${totalUnread} unread` : ""}`}
            </p>
          </div>
          {isCEO && (
            <button
              onClick={() => setModal("create")}
              style={pg.createBtn}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1v11M1 6.5h11" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              New Group
            </button>
          )}
        </div>

        {/* ── Search ── */}
        {groups.length > 0 && (
          <div style={pg.searchWrap}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
              <circle cx="6" cy="6" r="4.5" stroke="#9AA0A6" strokeWidth="1.3" />
              <path d="M9.5 9.5l2.5 2.5" stroke="#9AA0A6" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              style={pg.searchInput}
              placeholder="Search groups…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}

        {/* ── Group list ── */}
        {groupsLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <GwSpinner size={32} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={pg.emptyWrap}>
            <div style={pg.emptyIcon}>👥</div>
            <div style={pg.emptyTitle}>
              {groups.length === 0 ? "No groups yet" : "No groups match your search"}
            </div>
            <div style={pg.emptySub}>
              {groups.length === 0 && isCEO
                ? "Create a group to start collaborating with your team."
                : groups.length === 0
                  ? "You haven't been added to any groups yet."
                  : "Try a different search term."}
            </div>
            {groups.length === 0 && isCEO && (
              <button onClick={() => setModal("create")} style={{ ...pg.createBtn, marginTop: 16 }}>
                + Create First Group
              </button>
            )}
          </div>
        ) : (
          <div style={pg.grid}>
            {filtered.map(g => (
              <GroupCard
                key={g.groupId || g.id}
                group={g}
                currentEmployeeId={employeeId}
                isCEO={isCEO}
                allEmployees={allEmployees}
                onOpenChat={id => router.push(`/coworking/create-group/group-chat/${id}`)}
                onEdit={g => setModal({ type: "edit", group: g })}
                onDelete={g => setDeleteTarget(g)}
                onAddMember={g => setModal({ type: "add", group: g })}
                onManageMembers={g => setModal({ type: "members", group: g })}
              />
            ))}
          </div>
        )}
      </div>

      {/* ══ Modals ══ */}
      {modal === "create" && (
        <GroupFormModal
          mode="create"
          allEmployees={allEmployees}
          currentEmployeeId={employeeId}
          onClose={() => setModal(null)}
          onSuccess={() => setModal(null)}
        />
      )}
      {modal?.type === "edit" && (
        <GroupFormModal
          mode="edit"
          group={modal.group}
          allEmployees={allEmployees}
          currentEmployeeId={employeeId}
          onClose={() => setModal(null)}
          onSuccess={() => setModal(null)}
        />
      )}
      {modal?.type === "add" && (
        <AddMemberModal
          group={modal.group}
          allEmployees={allEmployees}
          onClose={() => setModal(null)}
          onSuccess={() => setModal(null)}
        />
      )}
      {modal?.type === "members" && (
        <ManageMembersModal
          group={modal.group}
          allEmployees={allEmployees}
          currentEmployeeId={employeeId}
          onClose={() => setModal(null)}
          onMemberRemoved={handleMemberRemoved}
        />
      )}

      <GwConfirm
        open={!!deleteTarget}
        title="Delete Group?"
        message={`Permanently delete "${deleteTarget?.name}"? All messages will be lost. This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

// ── Modal styles ──────────────────────────────────────────
const ms = {
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, padding: 20, backdropFilter: "blur(3px)" },
  modal: { background: "#fff", borderRadius: 16, width: "min(520px, 100%)", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,0.15)", fontFamily: "var(--font, inherit)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "20px 22px 16px", borderBottom: "1px solid #F1F3F4" },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "#202124", letterSpacing: "-0.02em" },
  modalSub: { fontSize: 11, color: "#9AA0A6", marginTop: 2, fontFamily: "monospace" },
  closeBtn: { width: 30, height: 30, border: "1px solid #E8EAED", borderRadius: 8, background: "#F8F9FA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#5F6368", flexShrink: 0 },
  body: { flex: 1, overflowY: "auto", padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14 },
  footer: { padding: "14px 22px", borderTop: "1px solid #F1F3F4", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 },
  field: { display: "flex", flexDirection: "column", gap: 5 },
  label: { fontSize: 11, fontWeight: 700, color: "#5F6368", textTransform: "uppercase", letterSpacing: "0.06em" },
  input: { padding: "9px 12px", border: "1.5px solid #E8EAED", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", color: "#202124", background: "#F8F9FA" },
  memberList: { maxHeight: 240, overflowY: "auto", border: "1.5px solid #E8EAED", borderRadius: 10, display: "flex", flexDirection: "column" },
  memberRow: { display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer", transition: "background 0.12s", borderBottom: "1px solid", userSelect: "none" },
  errorBox: { padding: "9px 13px", background: "#FCE8E6", border: "1px solid #F5C6C2", borderRadius: 8, fontSize: 12, color: "#D93025" },
  cancelBtn: { padding: "9px 20px", border: "1.5px solid #E8EAED", borderRadius: 9, background: "transparent", color: "#5F6368", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
  submitBtn: { padding: "9px 22px", border: "none", borderRadius: 9, background: "#1A73E8", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
};

// ── Group card styles ─────────────────────────────────────
const gc = {
  card: { background: "#fff", borderRadius: 14, border: "1px solid #E8EAED", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", transition: "box-shadow 0.15s" },
  mainRow: { display: "flex", alignItems: "center", gap: 13, padding: "14px 16px", cursor: "pointer" },
  actions: { display: "flex", gap: 6, padding: "8px 14px 12px", borderTop: "1px solid #F8F9FA", flexWrap: "wrap" },
  actionBtn: (bg, color) => ({
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "5px 11px", borderRadius: 99,
    background: bg, color: color,
    border: `1px solid ${bg}`, fontSize: 11, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.12s",
  }),
};

// ── Page layout styles ────────────────────────────────────
const pg = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: 700, color: "#202124", letterSpacing: "-0.02em", margin: 0 },
  sub: { fontSize: 12, color: "#9AA0A6", marginTop: 3 },
  createBtn: { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 20px", background: "#1A73E8", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(37,99,235,0.25)", transition: "all 0.15s", flexShrink: 0 },
  searchWrap: { position: "relative", marginBottom: 14 },
  searchInput: { width: "100%", padding: "9px 12px 9px 36px", border: "1.5px solid #E8EAED", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", background: "#F8F9FA", boxSizing: "border-box", color: "#202124" },
  grid: { display: "flex", flexDirection: "column", gap: 10 },
  emptyWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", textAlign: "center" },
  emptyIcon: { fontSize: 48, marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: "#3C4043", marginBottom: 6 },
  emptySub: { fontSize: 13, color: "#9AA0A6", lineHeight: 1.65, maxWidth: 320 },
};