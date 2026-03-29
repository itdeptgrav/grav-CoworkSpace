"use client";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "../../../lib/coworkFirebase";
import { useCoworkNotifications } from "../../../hooks/useCoworkNotifications";
import { timeAgo } from "../../../lib/coworkUtils";
import { useState, useEffect } from "react";

/* ── Icon set ── */
function NavIcon({ name, size = 20 }) {
  const s = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" };
  const icons = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>,
    tasks: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>,
    messages: <><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></>,
    groups: <><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" /><path d="M16 3.13a4 4 0 010 7.75" /><path d="M21 21v-2a4 4 0 00-3-3.85" /></>,
    meetings: <><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></>,
    employees: <><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
    bell: <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></>,
    search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  };
  return <svg {...s}>{icons[name]}</svg>;
}

export default function CoworkingShell({ role, employeeName, employeeId, title, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { notifications, unread, markRead } = useCoworkNotifications(employeeId || "");
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    if (!notifOpen) return;
    const close = (e) => {
      if (!e.target.closest('.cw-notif-popup') && !e.target.closest('.cw-topbar-icon-btn')) setNotifOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [notifOpen]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setMobileOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const isCEO = role === "ceo";
  const isTL = role === "tl";

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard", path: "/coworking" },
    { id: "tasks", label: "Tasks", icon: "tasks", path: "/coworking/tasks" },
    { id: "messages", label: "Messages", icon: "messages", path: "/coworking/direct-messages" },
    { id: "groups", label: "Groups", icon: "groups", path: "/coworking/create-group" },
    { id: "meetings", label: "Meetings", icon: "meetings", path: "/coworking/schedule-meet" },
    ...(isCEO ? [{ id: "employees", label: "Employees", icon: "employees", path: "/coworking/create-employee" }] : []),
    { id: "calendar", label: "Calendar", icon: "calendar", path: "/coworking/calendar" },
    { id: "settings", label: "Settings", icon: "settings", path: "/coworking/settings" },
  ];

  const isActive = (path) => {
    if (path === "/coworking") return pathname === "/coworking";
    return pathname.startsWith(path);
  };

  const handleNav = (path) => {
    router.push(path);
    if (isMobile) setMobileOpen(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut(firebaseAuth);
      router.push("/coworking-login");
    } catch (e) {
      console.error("Sign out error:", e);
    }
  };

  const initials = (name = "") => name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  const roleLabel = isCEO ? "Admin" : isTL ? "Team Lead" : "Employee";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');

        .cw-shell {
          display: flex;
          height: 100vh;
          overflow: hidden;
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #F0F2F5;
        }

        /* ── Sidebar ── */
        .cw-sidebar {
          width: 240px;
          min-width: 240px;
          height: 100vh;
          background: #FFFFFF;
          border-right: 1px solid #E4E7EC;
          display: flex;
          flex-direction: column;
          z-index: 100;
          transition: width 0.2s ease, min-width 0.2s ease;
        }

        .cw-sidebar-brand {
          padding: 20px 20px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .cw-sidebar-logo {
          width: 32px; height: 32px;
          background: #1A73E8;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .cw-sidebar-logo svg { color: #fff; }
        .cw-sidebar-brand-text {
          font-size: 15px;
          font-weight: 700;
          color: #1A1D21;
          letter-spacing: -0.03em;
        }
        .cw-sidebar-brand-sub {
          font-size: 10px;
          color: #98A2B3;
          font-weight: 500;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .cw-sidebar-nav {
          flex: 1;
          padding: 4px 12px;
          overflow-y: auto;
        }
        .cw-sidebar-nav::-webkit-scrollbar { width: 0; }

        .cw-sidebar-section {
          font-size: 10px;
          font-weight: 600;
          color: #98A2B3;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 16px 8px 6px;
        }

        .cw-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border-radius: 8px;
          cursor: pointer;
          color: #667085;
          font-size: 13.5px;
          font-weight: 500;
          transition: all 0.12s ease;
          margin-bottom: 2px;
          position: relative;
          border: 1px solid transparent;
          text-decoration: none;
        }
        .cw-nav-item:hover {
          background: #F5F7FA;
          color: #344054;
        }
        .cw-nav-item.active {
          background: #EBF3FE;
          color: #1A73E8;
          font-weight: 600;
          border-color: #D3E4FD;
        }
        .cw-nav-item.active svg { stroke-width: 2.2; }

        .cw-nav-badge {
          margin-left: auto;
          min-width: 18px;
          height: 18px;
          border-radius: 9px;
          background: #EF4444;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 5px;
        }

        .cw-sidebar-footer {
          padding: 12px;
          border-top: 1px solid #F2F4F7;
        }
        .cw-user-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          background: #F9FAFB;
          border: 1px solid #F2F4F7;
          margin-bottom: 8px;
        }
        .cw-user-avatar {
          width: 34px; height: 34px;
          border-radius: 50%;
          background: #1A73E8;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }
        .cw-user-name {
          font-size: 13px;
          font-weight: 600;
          color: #1A1D21;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .cw-user-role {
          font-size: 11px;
          color: #98A2B3;
          font-weight: 500;
        }
        .cw-signout-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 12px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: #667085;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.12s;
        }
        .cw-signout-btn:hover {
          background: #FEF3F2;
          color: #D93025;
        }

        /* ── Main Area ── */
        .cw-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
        }
        .cw-topbar {
          height: 56px;
          min-height: 56px;
          background: #FFFFFF;
          border-bottom: 1px solid #E4E7EC;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          gap: 16px;
          flex-shrink: 0;
        }
        .cw-topbar-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .cw-topbar-hamburger {
          display: none;
          width: 36px; height: 36px;
          border-radius: 8px;
          border: 1px solid #E4E7EC;
          background: #fff;
          cursor: pointer;
          align-items: center;
          justify-content: center;
          color: #667085;
        }
        .cw-topbar-title {
          font-size: 17px;
          font-weight: 700;
          color: #1A1D21;
          letter-spacing: -0.02em;
        }
        .cw-topbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cw-topbar-icon-btn {
          width: 36px; height: 36px;
          border-radius: 50%;
          border: 1px solid #E4E7EC;
          background: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #667085;
          position: relative;
          transition: all 0.12s;
        }
        .cw-topbar-icon-btn:hover {
          background: #F5F7FA;
          border-color: #D0D5DD;
        }
        .cw-topbar-notif-dot {
          position: absolute;
          top: 6px; right: 6px;
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #EF4444;
          border: 2px solid #fff;
        }

        /* Notification Popup */
        .cw-notif-popup {
          position: absolute;
          top: 44px;
          right: 0;
          width: 360px;
          max-height: 420px;
          background: #fff;
          border: 1px solid #E4E7EC;
          border-radius: 12px;
          box-shadow: 0 12px 36px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
          z-index: 500;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: cw-popup-in 0.15s ease;
        }
        @keyframes cw-popup-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .cw-notif-popup-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid #F2F4F7;
        }
        .cw-notif-popup-title {
          font-size: 14px;
          font-weight: 700;
          color: #1A1D21;
        }
        .cw-notif-popup-mark {
          font-size: 12px;
          color: #1A73E8;
          background: none;
          border: none;
          cursor: pointer;
          font-family: inherit;
          font-weight: 500;
        }
        .cw-notif-popup-mark:hover { text-decoration: underline; }
        .cw-notif-popup-list {
          flex: 1;
          overflow-y: auto;
          padding: 4px 8px;
        }
        .cw-notif-popup-list::-webkit-scrollbar { width: 3px; }
        .cw-notif-popup-list::-webkit-scrollbar-thumb { background: #E4E7EC; border-radius: 2px; }
        .cw-notif-popup-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 8px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.1s;
        }
        .cw-notif-popup-item:hover { background: #F5F7FA; }
        .cw-notif-popup-item-title {
          font-size: 13px;
          font-weight: 500;
          color: #344054;
          line-height: 1.4;
        }
        .cw-notif-popup-item-body {
          font-size: 11px;
          color: #98A2B3;
          margin-top: 2px;
          line-height: 1.3;
        }
        .cw-notif-popup-item-time {
          font-size: 10px;
          color: #98A2B3;
          font-family: 'IBM Plex Mono', monospace;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .cw-notif-popup-item-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: #1A73E8;
          flex-shrink: 0;
          margin-top: 6px;
        }
        .cw-notif-popup-item-dot.read { background: #D0D5DD; }
        .cw-notif-popup-empty {
          text-align: center;
          padding: 32px 16px;
          color: #98A2B3;
          font-size: 13px;
        }
        .cw-notif-popup-footer {
          padding: 10px 16px;
          border-top: 1px solid #F2F4F7;
          text-align: center;
        }
        .cw-notif-popup-footer a {
          font-size: 12px;
          color: #1A73E8;
          font-weight: 500;
          text-decoration: none;
          cursor: pointer;
        }
        .cw-notif-popup-footer a:hover { text-decoration: underline; }

        @media (max-width: 768px) {
          .cw-notif-popup {
            width: calc(100vw - 24px);
            right: -8px;
          }
        }
        .cw-topbar-avatar {
          width: 34px; height: 34px;
          border-radius: 50%;
          background: #1A73E8;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .cw-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0;
        }

        /* ── Mobile Overlay ── */
        .cw-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.3);
          z-index: 99;
        }
        .cw-overlay.show { display: block; }

        @media (max-width: 768px) {
          .cw-sidebar {
            position: fixed;
            left: -260px;
            top: 0;
            height: 100vh;
            z-index: 200;
            box-shadow: 4px 0 24px rgba(0,0,0,0.08);
            transition: left 0.25s ease;
          }
          .cw-sidebar.open { left: 0; }
          .cw-topbar-hamburger { display: flex; }
        }
      `}</style>

      <div className="cw-shell">
        {/* Mobile overlay */}
        <div className={`cw-overlay${mobileOpen ? " show" : ""}`} onClick={() => setMobileOpen(false)} />

        {/* Sidebar */}
        <aside className={`cw-sidebar${mobileOpen ? " open" : ""}`}>
          <div className="cw-sidebar-brand">
            <div className="cw-sidebar-logo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
              </svg>
            </div>
            <div>
              <div className="cw-sidebar-brand-text">CoWork</div>
              <div className="cw-sidebar-brand-sub">Workspace</div>
            </div>
          </div>

          <nav className="cw-sidebar-nav">
            <div className="cw-sidebar-section">Menu</div>
            {NAV.map(item => (
              <div
                key={item.id}
                className={`cw-nav-item${isActive(item.path) ? " active" : ""}`}
                onClick={() => handleNav(item.path)}
              >
                <NavIcon name={item.icon} size={18} />
                <span>{item.label}</span>
                {item.id === "messages" && unread > 0 && (
                  <span className="cw-nav-badge">{unread > 9 ? "9+" : unread}</span>
                )}
              </div>
            ))}
          </nav>

          <div className="cw-sidebar-footer">
            <div className="cw-user-card">
              <div className="cw-user-avatar">{initials(employeeName)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cw-user-name">{employeeName}</div>
                <div className="cw-user-role">{roleLabel}</div>
              </div>
            </div>
            <button className="cw-signout-btn" onClick={handleSignOut}>
              <NavIcon name="logout" size={16} />
              Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="cw-main">
          <header className="cw-topbar">
            <div className="cw-topbar-left">
              <button className="cw-topbar-hamburger" onClick={() => setMobileOpen(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
              </button>
              <h1 className="cw-topbar-title">{title}</h1>
            </div>
            <div className="cw-topbar-right">
              <div style={{ position: "relative" }}>
                <button className="cw-topbar-icon-btn" title="Notifications" onClick={() => setNotifOpen(!notifOpen)}>
                  <NavIcon name="bell" size={18} />
                  {unread > 0 && <span className="cw-topbar-notif-dot" />}
                </button>

                {notifOpen && (
                  <div className="cw-notif-popup">
                    <div className="cw-notif-popup-head">
                      <span className="cw-notif-popup-title">Notifications {unread > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#1A73E8", background: "#EBF3FE", padding: "2px 8px", borderRadius: 4, marginLeft: 6 }}>{unread}</span>}</span>
                      {unread > 0 && <button className="cw-notif-popup-mark" onClick={() => { markRead(); }}>Mark all read</button>}
                    </div>
                    <div className="cw-notif-popup-list">
                      {notifications.length === 0 ? (
                        <div className="cw-notif-popup-empty">No notifications yet</div>
                      ) : (
                        notifications.slice(0, 15).map((n, i) => (
                          <div key={n.id || i} className="cw-notif-popup-item" style={{ background: n.read ? "transparent" : "rgba(26,115,232,0.03)" }}>
                            <span className={`cw-notif-popup-item-dot${n.read ? " read" : ""}`} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="cw-notif-popup-item-title">{n.title}</div>
                              {n.body && <div className="cw-notif-popup-item-body">{n.body}</div>}
                            </div>
                            <span className="cw-notif-popup-item-time">{timeAgo(n.createdAt)}</span>
                          </div>
                        ))
                      )}
                    </div>
                    {notifications.length > 15 && (
                      <div className="cw-notif-popup-footer">
                        <a onClick={() => { setNotifOpen(false); router.push("/coworking"); }}>View all notifications</a>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="cw-topbar-avatar" title={employeeName}>
                {initials(employeeName)}
              </div>
            </div>
          </header>

          <main className="cw-content">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}