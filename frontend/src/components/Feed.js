import React, { useState, useEffect, useMemo } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { FiX, FiHeart, FiMapPin, FiBriefcase, FiDollarSign, FiChevronDown, FiChevronUp, FiFilter } from "react-icons/fi";
import api from "../api";
import "./Feed.css";

export default function Feed({ userId }) {
  const [allJobs, setAllJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [swiping, setSwiping] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [sourceFilter, setSourceFilter] = useState("all"); // all | external | kanso
  const [typeFilter, setTypeFilter] = useState("all");     // all | Full-time | Part-time | Contract | Internship
  const [tagFilter, setTagFilter] = useState("");           // tag string to match

  useEffect(() => {
    api
      .get(`/jobs/${userId}`)
      .then((r) => setAllJobs(r.data))
      .catch(() => setAllJobs([]))
      .finally(() => setLoading(false));
  }, [userId]);

  // Derive unique tags for filter dropdown
  const allTags = useMemo(() => {
    const s = new Set();
    allJobs.forEach((j) => (j.tags || []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [allJobs]);

  // Filtered jobs
  const jobs = useMemo(() => {
    let f = allJobs;
    if (sourceFilter !== "all") f = f.filter((j) => j.source === sourceFilter);
    if (typeFilter !== "all") f = f.filter((j) => j.type === typeFilter);
    if (tagFilter) f = f.filter((j) => (j.tags || []).some((t) => t.toLowerCase().includes(tagFilter.toLowerCase())));
    return f;
  }, [allJobs, sourceFilter, typeFilter, tagFilter]);

  const current = jobs[jobs.length - 1];

  // Keyboard shortcuts: ← = skip, → = save
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.key === "ArrowLeft") handleSwipe("left");
      else if (e.key === "ArrowRight") handleSwipe("right");
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }); // intentionally no deps — always uses latest handleSwipe

  const handleSwipe = async (direction) => {
    if (!current || swiping) return;
    setSwiping(direction);
    const payload = {
      user_id: userId,
      job_id: current.id,
      job_title: current.title,
      description: current.description,
    };

    try {
      if (direction === "right") await api.post("/swipe-right", payload);
      else await api.post("/swipe-left", payload);
    } catch (e) {
      console.error(e);
    }

    setTimeout(() => {
      setAllJobs((prev) => prev.filter((j) => j.id !== current.id));
      setExpanded(false);
      setSwiping(null);
    }, 300);
  };

  if (loading)
    return (
      <div className="feed-empty">
        <div className="loader" />
        <p>Loading jobs…</p>
      </div>
    );

  return (
    <div className="feed">
      {/* Counter + filter toggle */}
      <div className="feed-top-bar">
        <span className="feed-counter">{jobs.length} job{jobs.length !== 1 ? "s" : ""} remaining</span>
        <button className={`filter-toggle ${showFilters ? "active" : ""}`} onClick={() => setShowFilters(!showFilters)}>
          <FiFilter size={14} /> Filters
        </button>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="feed-filters">
          <div className="ff-group">
            <label>Source</label>
            <div className="ff-pills">
              {["all", "external", "kanso"].map((v) => (
                <button key={v} className={`ff-pill ${sourceFilter === v ? "active" : ""}`} onClick={() => setSourceFilter(v)}>
                  {v === "all" ? "All" : v === "external" ? "🌐 External" : "簡 Kanso"}
                </button>
              ))}
            </div>
          </div>
          <div className="ff-group">
            <label>Type</label>
            <div className="ff-pills">
              {["all", "Full-time", "Part-time", "Contract", "Internship"].map((v) => (
                <button key={v} className={`ff-pill ${typeFilter === v ? "active" : ""}`} onClick={() => setTypeFilter(v)}>
                  {v === "all" ? "All" : v}
                </button>
              ))}
            </div>
          </div>
          <div className="ff-group">
            <label>Tag</label>
            <select className="ff-select" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="">All Tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!jobs.length ? (
        <div className="feed-empty">
          <span className="empty-icon">🎉</span>
          <h2>{allJobs.length === 0 ? "All caught up!" : "No matches"}</h2>
          <p>{allJobs.length === 0 ? "No more jobs to swipe. Check your dashboard." : "Try changing your filters."}</p>
        </div>
      ) : (
        <>
          <div className="card-stack">
            {jobs.length > 1 && (
              <div className="ghost-card">
                <span className="ghost-company">{jobs[jobs.length - 2].company}</span>
              </div>
            )}
            <AnimatePresence>
              {current && (
                <SwipeCard
                  key={current.id}
                  job={current}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  onSwipe={handleSwipe}
                  swiping={swiping}
                />
              )}
            </AnimatePresence>
          </div>

          <div className="actions">
            <button className="action-btn reject" onClick={() => handleSwipe("left")}>
              <FiX size={28} />
            </button>
            <button className="action-btn accept" onClick={() => handleSwipe("right")}>
              <FiHeart size={28} />
            </button>
          </div>

          <p className="swipe-hint">
            Swipe or use ← → arrow keys · Tap ▼ for details
          </p>
        </>
      )}
    </div>
  );
}

/* ── Draggable Card ──────────────────────────────────────── */
function SwipeCard({ job, expanded, setExpanded, onSwipe, swiping }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-18, 18]);
  const leftOpacity = useTransform(x, [-150, 0], [1, 0]);
  const rightOpacity = useTransform(x, [0, 150], [0, 1]);

  const exitX = swiping === "right" ? 600 : swiping === "left" ? -600 : 0;

  return (
    <motion.div
      className={`job-card ${expanded ? "expanded" : ""}`}
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={(_, info) => {
        if (info.offset.x > 120) onSwipe("right");
        else if (info.offset.x < -120) onSwipe("left");
      }}
      initial={{ scale: 0.95, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ x: exitX, opacity: 0, transition: { duration: 0.3 } }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      {/* Swipe indicators */}
      <motion.div className="swipe-label nope" style={{ opacity: leftOpacity }}>NOPE</motion.div>
      <motion.div className="swipe-label like" style={{ opacity: rightOpacity }}>APPLY</motion.div>

      {/* Card Header */}
      <div className="card-header">
        <img
          className="company-logo"
          src={job.logo}
          alt={job.company}
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = `https://ui-avatars.com/api/?name=${job.company}&background=6c5ce7&color=fff&size=80`;
          }}
        />
        <div className="card-header-text">
          <h2 className="job-title">{job.title}</h2>
          <p className="company-name">{job.company}</p>
        </div>
        <span className={`source-badge ${job.source === "kanso" ? "kanso" : "external"}`}>
          {job.source === "kanso" ? "Kanso" : "External"}
        </span>
      </div>

      {/* Meta */}
      <div className="card-meta">
        <span><FiMapPin size={14} /> {job.location}</span>
        <span><FiBriefcase size={14} /> {job.type}</span>
        <span><FiDollarSign size={14} /> {job.salary}</span>
      </div>

      {/* Tags */}
      <div className="card-tags">
        {(job.tags || []).map((t) => (
          <span key={t} className="tag">{t}</span>
        ))}
      </div>

      {/* Summary / Description */}
      <p className="card-summary">{job.summary}</p>

      {expanded && (
        <motion.div
          className="card-description"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
        >
          {job.description.split("\n").map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </motion.div>
      )}

      <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
        {expanded ? <FiChevronUp size={20} /> : <FiChevronDown size={20} />}
        {expanded ? "Less" : "Full Description"}
      </button>
    </motion.div>
  );
}
