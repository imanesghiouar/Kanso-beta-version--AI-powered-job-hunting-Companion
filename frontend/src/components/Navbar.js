import React, { useState, useEffect, useRef } from "react";
import { FiLayers, FiGrid, FiLogOut, FiBriefcase, FiUser, FiSun, FiMoon, FiBell } from "react-icons/fi";
import api from "../api";
import "./Navbar.css";

export default function Navbar({ page, setPage, user, onLogout }) {
  const isHR = user?.role === "hr";

  // ── Theme toggle ──
  const [theme, setTheme] = useState(() => localStorage.getItem("kanso-theme") || "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("kanso-theme", theme);
  }, [theme]);

  // ── Notifications ──
  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const notifRef = useRef(null);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!user?.id) return;
    const fetchNotifs = () => {
      api.get(`/notifications/${user.id}`).then((r) => setNotifications(r.data)).catch(() => {});
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, [user?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`).catch(() => {});
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = async () => {
    await api.post(`/notifications/read-all/${user.id}`).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="brand-icon">簡</span>
        <span className="brand-text">KansoAI</span>
      </div>

      <div className="navbar-tabs">
        {isHR ? (
          <button
            className={`tab ${page === "hr" ? "active" : ""}`}
            onClick={() => setPage("hr")}
          >
            <FiBriefcase size={18} />
            <span>My Jobs</span>
          </button>
        ) : (
          <>
            <button
              className={`tab ${page === "feed" ? "active" : ""}`}
              onClick={() => setPage("feed")}
            >
              <FiLayers size={18} />
              <span>Feed</span>
            </button>
            <button
              className={`tab ${page === "dashboard" ? "active" : ""}`}
              onClick={() => setPage("dashboard")}
            >
              <FiGrid size={18} />
              <span>Dashboard</span>
            </button>
          </>
        )}
        <button
          className={`tab ${page === "profile" ? "active" : ""}`}
          onClick={() => setPage("profile")}
        >
          <FiUser size={18} />
          <span>Profile</span>
        </button>
      </div>

      <div className="navbar-user">
        {/* Theme toggle */}
        <button
          className="icon-btn"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <FiSun size={16} /> : <FiMoon size={16} />}
        </button>

        {/* Notification bell */}
        {!isHR && (
          <div className="notif-wrapper" ref={notifRef}>
            <button className="icon-btn notif-btn" onClick={() => setShowNotif(!showNotif)}>
              <FiBell size={16} />
              {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>

            {showNotif && (
              <div className="notif-dropdown">
                <div className="notif-header">
                  <span>Notifications</span>
                  {unreadCount > 0 && (
                    <button className="notif-mark-all" onClick={markAllRead}>Mark all read</button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <p className="notif-empty">No notifications yet.</p>
                ) : (
                  <div className="notif-list">
                    {notifications.slice(0, 20).map((n) => (
                      <div
                        key={n.id}
                        className={`notif-item ${n.read ? "read" : "unread"}`}
                        onClick={() => {
                          markRead(n.id);
                          if (n.link_page) setPage(n.link_page);
                          setShowNotif(false);
                        }}
                      >
                        <p className="notif-title">{n.title}</p>
                        <p className="notif-body">{n.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="user-info">
          <span className="user-name">{user?.name}</span>
          <span className={`user-role ${isHR ? "hr" : "seeker"}`}>
            {isHR ? "HR" : "Seeker"}
          </span>
        </div>
        <button className="logout-btn" onClick={onLogout} title="Log out">
          <FiLogOut size={16} />
        </button>
      </div>
    </nav>
  );
}
