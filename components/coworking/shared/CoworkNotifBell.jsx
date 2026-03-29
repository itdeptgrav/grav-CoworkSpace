/**
 * GRAV-CMS/components/coworking/notifications/CoworkNotifBell.jsx
 *
 * UPGRADED: Covers every notification type the backend sends:
 *   task_assigned, task_confirmed, task_started, task_update,
 *   task_chat, task_forwarded, daily_report,
 *   completion_submitted, completion_tl_approved, completion_rejected,
 *   completion_ceo_approved, completion_ceo_rejected,
 *   deadline_changed, group_message, group_added,
 *   direct_message, meet_scheduled
 *
 * Real-time via Firestore onSnapshot (useCoworkNotifications hook).
 */
"use client";
import { useState, useRef, useEffect } from "react";
import { useCoworkNotifications } from "../../../hooks/useCoworkNotifications";
import { timeAgo } from "../../../lib/coworkUtils";

// ── Every type the backend emits ─────────────────────────────
const TYPE_CONFIG = {
  // Task lifecycle
  task_assigned: { icon: "📋", label: "Task Assigned", color: "#2563EB", bg: "#EFF6FF" },
  task_confirmed: { icon: "✅", label: "Task Confirmed", color: "#059669", bg: "#ECFDF5" },
  task_started: { icon: "▶", label: "Task Started", color: "#7C3AED", bg: "#F5F3FF" },
  task_update: { icon: "🔄", label: "Task Updated", color: "#2563EB", bg: "#EFF6FF" },
  task_forwarded: { icon: "↗", label: "Task Forwarded", color: "#0E7490", bg: "#ECFEFF" },
  // Chat
  task_chat: { icon: "💬", label: "Task Chat", color: "#2563EB", bg: "#EFF6FF" },
  // Reports
  daily_report: { icon: "📊", label: "Daily Report", color: "#D97706", bg: "#FFFBEB" },
  // Completion flow
  completion_submitted: { icon: "📤", label: "Work Submitted", color: "#2563EB", bg: "#EFF6FF" },
  completion_tl_approved: { icon: "✓", label: "TL Approved", color: "#059669", bg: "#ECFDF5" },
  completion_rejected: { icon: "✕", label: "Rejected", color: "#DC2626", bg: "#FEF2F2" },
  completion_ceo_approved: { icon: "🏆", label: "CEO Approved", color: "#059669", bg: "#ECFDF5" },
  completion_ceo_rejected: { icon: "✕", label: "CEO Rejected", color: "#DC2626", bg: "#FEF2F2" },
  // Deadline
  deadline_changed: { icon: "📅", label: "Deadline Changed", color: "#DC2626", bg: "#FEF2F2" },
  // Messaging
  group_message: { icon: "👥", label: "Group Message", color: "#7C3AED", bg: "#F5F3FF" },
  group_added: { icon: "➕", label: "Added to Group", color: "#0E7490", bg: "#ECFEFF" },
  direct_message: { icon: "◈", label: "Direct Message", color: "#2563EB", bg: "#EFF6FF" },
  // Meetings
  meet_scheduled: { icon: "📅", label: "Meeting Scheduled", color: "#059669", bg: "#ECFDF5" },
};
const DEFAULT_CFG = { icon: "🔔", label: "Notification", color: "#64748B", bg: "#F1F5F9" };

function getCfg(type) { return TYPE_CONFIG[type] || DEFAULT_CFG; }

// ═══════════════════════════════════════════════════════════
export default function CoworkNotifBell({ employeeId }) {
  const { notifications, unread, markRead } = useCoworkNotifications(employeeId || "");
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) await markRead();
  };

  return (
    <div ref={panelRef} style={{ position: "relative" }}>

      {/* ── Bell button ── */}
      <button
        onClick={toggle}
        title={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        style={{
          position: "relative",
          width: 38, height: 38,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--gray-200)",
          background: open ? "var(--primary-light)" : "var(--gray-50)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all var(--transition)",
          color: open ? "var(--primary)" : "var(--gray-600)",
        }}
        className="grav-btn"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1.5A4.5 4.5 0 003.5 6v3L2 10.5h12L12.5 9V6A4.5 4.5 0 008 1.5z"
            stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
          <path d="M6.5 11.5a1.5 1.5 0 003 0"
            stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: "absolute", top: 3, right: 3,
            background: "var(--danger)", color: "#fff",
            fontSize: 9, fontWeight: 700,
            borderRadius: "var(--radius-full)",
            minWidth: 15, height: 15,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px", border: "1.5px solid var(--surface)",
            lineHeight: 1, fontFamily: "var(--font-mono)",
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          className="grav-fadein"
          style={{
            position: "absolute", right: 0, top: 44,
            width: "min(400px, calc(100vw - 32px))",
            background: "var(--surface)",
            borderRadius: "var(--radius-xl)",
            boxShadow: "var(--shadow-lg)",
            border: "1px solid var(--gray-200)",
            zIndex: 300, overflow: "hidden",
            fontFamily: "var(--font)",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "13px 18px",
            borderBottom: "1px solid var(--gray-100)",
            background: "var(--gray-50)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gray-800)", letterSpacing: "-0.01em" }}>
                Notifications
              </span>
              {unread > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "var(--danger)",
                  background: "var(--danger-light)", padding: "1px 7px",
                  borderRadius: "var(--radius-full)",
                }}>
                  {unread} new
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={markRead}
                style={{
                  fontSize: 11, fontWeight: 500, color: "var(--primary)",
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: "var(--font)", padding: "4px 8px",
                  borderRadius: "var(--radius-sm)",
                }}
                className="grav-btn"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 440, overflowY: "auto" }}>
            {notifications.length === 0 ? (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", padding: "40px 20px", gap: 10,
              }}>
                <div style={{
                  width: 48, height: 48, background: "var(--gray-100)",
                  borderRadius: "var(--radius-lg)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22,
                }}>
                  🔔
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)" }}>All caught up</div>
                <div style={{ fontSize: 12, color: "var(--gray-400)", textAlign: "center" }}>
                  No notifications yet
                </div>
              </div>
            ) : (
              notifications.slice(0, 30).map((n, i) => {
                const cfg = getCfg(n.type);
                return (
                  <div
                    key={n.id || i}
                    style={{
                      display: "flex", gap: 12, padding: "11px 18px",
                      borderBottom: "1px solid var(--gray-100)",
                      background: n.read ? "var(--surface)" : "#EFF6FF",
                      transition: "background var(--transition)",
                    }}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 34, height: 34, borderRadius: "var(--radius-md)",
                      background: cfg.bg, color: cfg.color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 15, flexShrink: 0, fontWeight: 700,
                    }}>
                      {cfg.icon}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6, marginBottom: 2,
                      }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700,
                          color: cfg.color, background: cfg.bg,
                          padding: "1px 6px", borderRadius: "var(--radius-full)",
                          textTransform: "uppercase", letterSpacing: "0.04em",
                          flexShrink: 0,
                        }}>
                          {cfg.label}
                        </span>
                        {!n.read && (
                          <span style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: "var(--primary)", flexShrink: 0,
                          }} />
                        )}
                      </div>
                      <div style={{
                        fontWeight: 600, fontSize: 12, color: "var(--gray-800)",
                        marginBottom: 2, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {n.title}
                      </div>
                      {n.body && (
                        <div style={{
                          fontSize: 11, color: "var(--gray-500)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          marginBottom: 3,
                        }}>
                          {n.body}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: "var(--gray-400)", fontFamily: "var(--font-mono)" }}>
                        {timeAgo(n.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{
              padding: "9px 18px", borderTop: "1px solid var(--gray-100)",
              textAlign: "center", background: "var(--gray-50)",
            }}>
              <span style={{ fontSize: 11, color: "var(--gray-400)" }}>
                {notifications.length} total notification{notifications.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}