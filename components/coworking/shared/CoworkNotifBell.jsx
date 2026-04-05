"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCoworkNotifications } from "../../../hooks/useCoworkNotifications";
import { timeAgo } from "../../../lib/coworkUtils";

const TYPE_CONFIG = {
  task_assigned: { icon: "📋", label: "Task Assigned", color: "#2563EB", bg: "#EFF6FF" },
  task_confirmed: { icon: "✅", label: "Task Confirmed", color: "#059669", bg: "#ECFDF5" },
  task_started: { icon: "▶", label: "Task Started", color: "#7C3AED", bg: "#F5F3FF" },
  task_update: { icon: "🔄", label: "Task Updated", color: "#2563EB", bg: "#EFF6FF" },
  task_forwarded: { icon: "↗", label: "Task Forwarded", color: "#0E7490", bg: "#ECFEFF" },
  task_chat: { icon: "💬", label: "Task Chat", color: "#2563EB", bg: "#EFF6FF" },
  daily_report: { icon: "📊", label: "Daily Report", color: "#D97706", bg: "#FFFBEB" },
  completion_submitted: { icon: "📤", label: "Work Submitted", color: "#2563EB", bg: "#EFF6FF" },
  completion_tl_approved: { icon: "✓", label: "TL Approved", color: "#059669", bg: "#ECFDF5" },
  completion_rejected: { icon: "✕", label: "Rejected", color: "#DC2626", bg: "#FEF2F2" },
  completion_ceo_approved: { icon: "🏆", label: "CEO Approved", color: "#059669", bg: "#ECFDF5" },
  completion_ceo_rejected: { icon: "✕", label: "CEO Rejected", color: "#DC2626", bg: "#FEF2F2" },
  deadline_changed: { icon: "📅", label: "Deadline Changed", color: "#DC2626", bg: "#FEF2F2" },
  group_message: { icon: "👥", label: "Group Message", color: "#7C3AED", bg: "#F5F3FF" },
  group_added: { icon: "➕", label: "Added to Group", color: "#0E7490", bg: "#ECFEFF" },
  direct_message: { icon: "💬", label: "Direct Message", color: "#2563EB", bg: "#EFF6FF" },
  meet_scheduled: { icon: "📅", label: "Meeting", color: "#059669", bg: "#ECFDF5" },
};
const DEFAULT_CFG = { icon: "🔔", label: "Notification", color: "#64748B", bg: "#F1F5F9" };
const getCfg = (type) => TYPE_CONFIG[type] || DEFAULT_CFG;

function playBeep(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value =
      type === "task_chat" || type === "direct_message" || type === "group_message" ? 780 :
        type === "meet_scheduled" ? 880 :
          type && type.startsWith("completion") ? 920 : 660;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
  } catch (e) { }
}

function NotifItem({ n, onClick }) {
  const [hovered, setHovered] = useState(false);
  const cfg = getCfg(n.type);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", gap: 12, padding: "12px 18px",
        borderBottom: "1px solid var(--gray-100)",
        background: hovered ? "#E0EAFF" : n.read ? "var(--surface)" : "#EFF6FF",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
    >
      {/* Icon badge */}
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: cfg.bg, color: cfg.color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, flexShrink: 0,
      }}>
        {cfg.icon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, color: cfg.color, background: cfg.bg,
            padding: "2px 7px", borderRadius: 99,
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>{cfg.label}</span>
          {!n.read && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563EB", flexShrink: 0 }} />}
        </div>
        <div style={{ fontWeight: 600, fontSize: 12.5, color: "#1E293B", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {n.title}
        </div>
        {n.body && (
          <div style={{ fontSize: 11.5, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
            {n.body}
          </div>
        )}
        <div style={{ fontSize: 10, color: "#94A3B8" }}>{timeAgo(n.createdAt)}</div>
      </div>

      {/* Arrow — always visible */}
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0, color: hovered ? "#2563EB" : "#CBD5E1", fontSize: 18, fontWeight: 700 }}>
        ›
      </div>
    </div>
  );
}

export default function CoworkNotifBell({ employeeId }) {
  const { notifications, unread, markRead } = useCoworkNotifications(employeeId || "");
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const prevLen = useRef(0);
  const router = useRouter();

  useEffect(() => {
    if (notifications.length > prevLen.current && prevLen.current !== 0) {
      playBeep(notifications[0]?.type);
    }
    prevLen.current = notifications.length;
  }, [notifications.length]);

  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) await markRead();
  };

  const handleClick = (n) => {
    console.log("CLICKED NOTIFICATION:", JSON.stringify(n));
    setOpen(false);
    const d = n.data || {};
    const t = n.type || "";

    if (["task_assigned", "task_confirmed", "task_started", "task_update", "task_forwarded",
      "task_chat", "daily_report", "deadline_changed"].includes(t) || t.startsWith("completion")) {
      if (d.taskId) localStorage.setItem("selectedTaskId", d.taskId);
      router.push("/coworking/tasks");
      return;
    }
    if (t === "group_message" || t === "group_added") {
      router.push(d.groupId ? `/coworking/create-group/group-chat/${d.groupId}` : "/coworking/create-group");
      return;
    }
    if (t === "direct_message") { router.push("/coworking/direct-messages"); return; }
    if (t === "meet_scheduled") { router.push("/coworking/schedule-meet"); return; }
  };

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      <style>{`
        .notif-bell-btn:hover { background: var(--primary-light) !important; color: var(--primary) !important; }
      `}</style>

      {/* Bell button */}
      <button onClick={toggle} className="notif-bell-btn"
        style={{
          position: "relative", width: 38, height: 38,
          borderRadius: "var(--radius-md)", border: "1px solid var(--gray-200)",
          background: open ? "var(--primary-light)" : "var(--gray-50)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          color: open ? "var(--primary)" : "var(--gray-600)", transition: "all 0.15s",
        }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1.5A4.5 4.5 0 003.5 6v3L2 10.5h12L12.5 9V6A4.5 4.5 0 008 1.5z"
            stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
          <path d="M6.5 11.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: "absolute", top: 3, right: 3, background: "#EF4444", color: "#fff",
            fontSize: 9, fontWeight: 700, borderRadius: 99, minWidth: 15, height: 15,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px", border: "1.5px solid var(--surface)", lineHeight: 1,
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", right: 0, top: 44,
          width: "min(420px, calc(100vw - 24px))",
          background: "#fff", borderRadius: 14,
          boxShadow: "0 8px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)",
          border: "1px solid #E2E8F0", zIndex: 999, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 18px", borderBottom: "1px solid #F1F5F9", background: "#F8FAFC",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Notifications</span>
              {unread > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#EF4444",
                  background: "#FEF2F2", padding: "2px 8px", borderRadius: 99,
                }}>{unread} new</span>
              )}
            </div>
            {unread > 0 && (
              <button onClick={markRead} style={{
                fontSize: 11, fontWeight: 600, color: "#2563EB", background: "none",
                border: "none", cursor: "pointer", padding: "4px 8px",
              }}>Mark all read</button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 460, overflowY: "auto" }}>
            {notifications.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🔔</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>All caught up</div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>No notifications yet</div>
              </div>
            ) : (
              notifications.slice(0, 30).map((n, i) => (
                <NotifItem key={n.id || i} n={n} onClick={() => handleClick(n)} />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{ padding: "10px 18px", borderTop: "1px solid #F1F5F9", textAlign: "center", background: "#F8FAFC" }}>
              <span style={{ fontSize: 11, color: "#94A3B8" }}>
                {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}