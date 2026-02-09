import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiCheck,
  FiClock,
  FiTrash2,
  FiChevronRight,
  FiMapPin,
  FiDollarSign,
  FiSend,
  FiLoader,
  FiBookmark,
  FiBriefcase,
} from "react-icons/fi";
import api from "../api";
import "./Dashboard.css";

export default function Dashboard({ userId, onOpenPrep }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | processing | ready | applied

  const fetchApps = () => {
    setLoading(true);
    api
      .get(`/dashboard/${userId}`)
      .then((r) => setApps(r.data))
      .catch(() => setApps([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchApps();
  }, [userId]); // eslint-disable-line

  const handleDelete = async (e, appId) => {
    e.stopPropagation();
    try {
      await api.delete(`/application/${appId}`);
      setApps((prev) => prev.filter((a) => a.id !== appId));
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };

  const filtered = filter === "all" ? apps : apps.filter((a) => a.status === filter);

  const counts = {
    all: apps.length,
    saved: apps.filter((a) => a.status === "saved").length,
    processing: apps.filter((a) => a.status === "processing").length,
    ready: apps.filter((a) => a.status === "ready").length,
    applied: apps.filter((a) => a.status === "applied").length,
  };

  if (loading)
    return (
      <div className="dash-empty">
        <div className="loader" />
        <p>Loading dashboard…</p>
      </div>
    );

  if (!apps.length)
    return (
      <div className="dash-empty">
        <span className="empty-icon">📋</span>
        <h2>No applications yet</h2>
        <p>Swipe right on jobs you like to see them here.</p>
      </div>
    );

  return (
    <div className="dashboard">
      {/* Stats Bar */}
      <div className="dash-stats">
        <div className="stat-card">
          <span className="stat-num">{counts.all}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{counts.saved}</span>
          <span className="stat-label">Saved</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{counts.ready}</span>
          <span className="stat-label">Resume Ready</span>
        </div>
        <div className="stat-card accent">
          <span className="stat-num">{counts.applied}</span>
          <span className="stat-label">Applied</span>
        </div>
      </div>

      {/* Header */}
      <div className="dash-header">
        <div>
          <h2 className="dash-title">My Applications</h2>
          <p className="dash-subtitle">{apps.length} job{apps.length !== 1 ? "s" : ""} saved</p>
        </div>
      </div>

      {/* Filter pills */}
      <div className="dash-filters">
        {["all", "saved", "processing", "ready", "applied"].map((f) => (
          <button
            key={f}
            className={`filter-pill ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="filter-count">{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="dash-list">
        <AnimatePresence>
          {filtered.map((app, i) => (
            <motion.div
              key={app.id}
              className="dash-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -200, transition: { duration: 0.25 } }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onOpenPrep(app)}
            >
              <div className="dash-card-top">
                <div className="dash-card-left">
                  <img
                    className="dash-logo"
                    src={app.logo}
                    alt={app.company}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = `https://ui-avatars.com/api/?name=${app.company}&background=6c5ce7&color=fff&size=48`;
                    }}
                  />
                  <div>
                    <p className="dash-job-title">{app.job_title}</p>
                    <p className="dash-company">{app.company}</p>
                  </div>
                </div>
                <div className="dash-card-badges">
                  <span className={`source-badge ${app.source === "kanso" ? "kanso" : "external"}`}>
                    {app.source === "kanso" ? "Kanso" : "External"}
                  </span>
                  <StatusBadge status={app.status} />
                </div>
              </div>

              {/* Meta row */}
              <div className="dash-card-meta">
                {app.location && (
                  <span><FiMapPin size={12} /> {app.location}</span>
                )}
                {app.type && (
                  <span><FiBriefcase size={12} /> {app.type}</span>
                )}
                {app.salary && (
                  <span><FiDollarSign size={12} /> {app.salary}</span>
                )}
              </div>

              {/* Tags */}
              {app.tags && app.tags.length > 0 && (
                <div className="dash-card-tags">
                  {app.tags.slice(0, 4).map((t) => (
                    <span key={t} className="dtag">{t}</span>
                  ))}
                </div>
              )}

              {/* Progress Steps */}
              <div className="progress-bar">
                <ProgressStep label="Saved" done={true} />
                <div className={`progress-line ${["ready", "applied"].includes(app.status) ? "done" : ""}`} />
                <ProgressStep
                  label="Resume"
                  done={["ready", "applied"].includes(app.status)}
                  active={app.status === "processing"}
                />
                <div className={`progress-line ${app.status === "applied" ? "done" : ""}`} />
                <ProgressStep label="Applied" done={app.status === "applied"} />
              </div>

              {/* Footer */}
              <div className="dash-card-footer">
                <button
                  className="dash-btn danger"
                  onClick={(e) => handleDelete(e, app.id)}
                  title="Remove application"
                >
                  <FiTrash2 size={14} /> Remove
                </button>
                <button className="dash-btn primary" onClick={() => onOpenPrep(app)}>
                  View Details <FiChevronRight size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    saved: { icon: <FiBookmark size={13} />, label: "Saved", cls: "saved" },
    processing: { icon: <FiLoader size={13} className="spin" />, label: "Processing", cls: "processing" },
    ready: { icon: <FiCheck size={13} />, label: "Resume Ready", cls: "ready" },
    applied: { icon: <FiSend size={13} />, label: "Applied", cls: "applied" },
  };
  const s = map[status] || map.processing;
  return (
    <span className={`status-badge ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

function ProgressStep({ label, done, active }) {
  return (
    <div className={`progress-step ${done ? "done" : ""} ${active ? "active" : ""}`}>
      <div className="step-dot" />
      <span className="step-label">{label}</span>
    </div>
  );
}
