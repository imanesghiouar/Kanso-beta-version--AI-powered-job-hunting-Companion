import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiPlus,
  FiTrash2,
  FiMapPin,
  FiDollarSign,
  FiBriefcase,
  FiX,
  FiSend,
  FiUsers,
  FiFileText,
  FiDownload,
  FiMail,
} from "react-icons/fi";
import api from "../api";
import TagInput from "./TagInput";
import "./HRDashboard.css";

export default function HRDashboard({ user }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("jobs"); // jobs | applications
  const [applications, setApplications] = useState([]);
  const [appsLoading, setAppsLoading] = useState(false);

  const [form, setForm] = useState({
    company: "",
    title: "",
    location: "",
    type: "Full-time",
    salary: "",
    summary: "",
    description: "",
    tags: [],
  });

  const fetchJobs = () => {
    setLoading(true);
    api
      .get(`/hr/my-jobs/${user.id}`)
      .then((r) => setJobs(r.data))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchJobs();
  }, [user.id]); // eslint-disable-line

  const fetchApplications = () => {
    setAppsLoading(true);
    api
      .get(`/hr/applications/${user.id}`)
      .then((r) => setApplications(r.data))
      .catch(() => setApplications([]))
      .finally(() => setAppsLoading(false));
  };

  useEffect(() => {
    if (tab === "applications") fetchApplications();
  }, [tab]); // eslint-disable-line

  const handleDownloadResume = async (resumeAppId, applicantName) => {
    try {
      const r = await api.get(`/application/${resumeAppId}/resume-pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resume-${applicantName?.replace(/\s+/g, "-") || "applicant"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Could not download resume PDF.");
    }
  };

  const handlePost = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.title.trim() || !form.company.trim() || !form.description.trim()) {
      setError("Title, company, and description are required.");
      return;
    }
    setPosting(true);
    try {
      await api.post("/hr/post-job", {
        user_id: user.id,
        company: form.company,
        title: form.title,
        location: form.location,
        type: form.type,
        salary: form.salary,
        summary: form.summary,
        description: form.description,
        tags: form.tags,
      });
      setForm({ company: "", title: "", location: "", type: "Full-time", salary: "", summary: "", description: "", tags: [] });
      setShowForm(false);
      fetchJobs();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to post job.");
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (jobId) => {
    try {
      await api.delete(`/hr/job/${jobId}?user_id=${user.id}`);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };

  if (loading)
    return (
      <div className="hr-empty">
        <div className="loader" />
        <p>Loading your jobs…</p>
      </div>
    );

  return (
    <div className="hr-dashboard">
      {/* Header */}
      <div className="hr-header">
        <div>
          <h2 className="hr-title">HR Dashboard</h2>
          <p className="hr-subtitle">
            Manage job listings & review applicants
          </p>
        </div>
        {tab === "jobs" && (
          <button className="hr-add-btn" onClick={() => setShowForm(!showForm)}>
            {showForm ? <FiX size={18} /> : <FiPlus size={18} />}
            {showForm ? "Cancel" : "Post Job"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="hr-tabs">
        <button className={`hr-tab ${tab === "jobs" ? "active" : ""}`} onClick={() => setTab("jobs")}>
          <FiBriefcase size={14} /> My Jobs ({jobs.length})
        </button>
        <button className={`hr-tab ${tab === "applications" ? "active" : ""}`} onClick={() => setTab("applications")}>
          <FiUsers size={14} /> Applications
          {applications.length > 0 && <span className="tab-badge">{applications.length}</span>}
        </button>
      </div>

      {/* Post Form */}
      {tab === "jobs" && (
        <>
      <AnimatePresence>
        {showForm && (
          <motion.form
            className="hr-form"
            onSubmit={handlePost}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="hr-form-grid">
              <input
                placeholder="Job Title *"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                list="title-suggestions"
              />
              <input
                placeholder="Company *"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                list="company-suggestions"
              />
              <input
                placeholder="Location (e.g. Remote)"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                list="location-suggestions"
              />
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option>Full-time</option>
                <option>Part-time</option>
                <option>Contract</option>
                <option>Internship</option>
              </select>
              <input
                placeholder="Salary (e.g. $120k–$160k)"
                value={form.salary}
                onChange={(e) => setForm({ ...form, salary: e.target.value })}
                list="salary-suggestions"
              />
            </div>

            {/* Tags with chip input */}
            <div className="hr-form-full" style={{ marginTop: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>
                Tags / Skills
              </label>
              <TagInput
                tags={form.tags}
                onChange={(tags) => setForm({ ...form, tags })}
                placeholder="Type a skill and press Enter…"
              />
            </div>

            {/* Quick tags */}
            <div className="hr-quick-tags">
              {["React", "Python", "JavaScript", "TypeScript", "Node.js", "ML", "AWS", "Docker", "Go", "SQL", "Java", "Figma", "Product", "Data Science"].map((tag) => {
                const isActive = form.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`quick-tag ${isActive ? "active" : ""}`}
                    onClick={() => {
                      if (isActive) {
                        setForm({ ...form, tags: form.tags.filter((t) => t !== tag) });
                      } else {
                        setForm({ ...form, tags: [...form.tags, tag] });
                      }
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            {/* Datalists */}
            <datalist id="title-suggestions">
              <option value="Software Engineer" />
              <option value="Senior Software Engineer" />
              <option value="Frontend Developer" />
              <option value="Backend Developer" />
              <option value="Full Stack Developer" />
              <option value="Product Manager" />
              <option value="Data Scientist" />
              <option value="ML Engineer" />
              <option value="DevOps Engineer" />
              <option value="UX Designer" />
              <option value="QA Engineer" />
              <option value="Engineering Manager" />
              <option value="Solutions Architect" />
            </datalist>
            <datalist id="company-suggestions">
              <option value="Google" />
              <option value="Spotify" />
              <option value="Stripe" />
              <option value="OpenAI" />
              <option value="Figma" />
              <option value="Netflix" />
              <option value="Airbnb" />
              <option value="Tesla" />
            </datalist>
            <datalist id="location-suggestions">
              <option value="Remote" />
              <option value="San Francisco, CA" />
              <option value="New York, NY" />
              <option value="Seattle, WA" />
              <option value="Austin, TX" />
              <option value="London, UK" />
              <option value="Berlin, Germany" />
              <option value="Toronto, Canada" />
              <option value="Hybrid – San Francisco" />
              <option value="Hybrid – New York" />
            </datalist>
            <datalist id="salary-suggestions">
              <option value="$80k–$120k" />
              <option value="$100k–$140k" />
              <option value="$120k–$160k" />
              <option value="$140k–$180k" />
              <option value="$160k–$200k" />
              <option value="$180k–$220k" />
              <option value="Competitive" />
            </datalist>
            <input
              placeholder="Short summary"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              className="hr-form-full"
            />
            <textarea
              placeholder="Full description *"
              rows={5}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="hr-form-full"
            />
            {error && <p className="hr-form-error">{error}</p>}
            <button className="hr-submit-btn" type="submit" disabled={posting}>
              <FiSend size={14} />
              {posting ? "Posting…" : "Publish Job"}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Job List */}
      {jobs.length === 0 && !showForm ? (
        <div className="hr-empty-inline">
          <span className="empty-icon">📝</span>
          <h3>No jobs posted yet</h3>
          <p>Click "Post Job" to create your first listing.</p>
        </div>
      ) : (
        <div className="hr-list">
          <AnimatePresence>
            {jobs.map((job, i) => (
              <motion.div
                key={job.id}
                className="hr-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -200 }}
                transition={{ delay: i * 0.04 }}
              >
                <div className="hr-card-top">
                  <div className="hr-card-left">
                    <div className="hr-card-icon">🏢</div>
                    <div>
                      <p className="hr-card-title">{job.title}</p>
                      <p className="hr-card-company">{job.company}</p>
                    </div>
                  </div>
                  <span className="source-badge kanso">Kanso</span>
                </div>

                <div className="hr-card-meta">
                  {job.location && (
                    <span>
                      <FiMapPin size={12} /> {job.location}
                    </span>
                  )}
                  {job.type && (
                    <span>
                      <FiBriefcase size={12} /> {job.type}
                    </span>
                  )}
                  {job.salary && (
                    <span>
                      <FiDollarSign size={12} /> {job.salary}
                    </span>
                  )}
                </div>

                {job.tags && job.tags.length > 0 && (
                  <div className="hr-card-tags">
                    {job.tags.map((t) => (
                      <span key={t} className="htag">
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                <p className="hr-card-summary">
                  {job.summary || job.description.slice(0, 120) + "…"}
                </p>

                <div className="hr-card-footer">
                  <span className="hr-card-date">
                    {job.created_at
                      ? new Date(job.created_at).toLocaleDateString()
                      : ""}
                  </span>
                  <button
                    className="hr-delete-btn"
                    onClick={() => handleDelete(job.id)}
                  >
                    <FiTrash2 size={14} /> Remove
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
        </>
      )}

      {/* ── Applications Tab ── */}
      {tab === "applications" && (
        <>
          {appsLoading ? (
            <div className="hr-empty">
              <div className="loader" />
              <p>Loading applications…</p>
            </div>
          ) : applications.length === 0 ? (
            <div className="hr-empty-inline">
              <span className="empty-icon">📩</span>
              <h3>No applications yet</h3>
              <p>When seekers apply to your Kanso jobs, they'll show up here.</p>
            </div>
          ) : (
            <div className="hr-apps-list">
              {applications.map((ap, i) => (
                <motion.div
                  key={ap.id}
                  className="hr-app-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <div className="app-card-top">
                    <div className="app-card-avatar">
                      {ap.applicant_name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div className="app-card-info">
                      <p className="app-card-name">{ap.applicant_name}</p>
                      <p className="app-card-headline">{ap.applicant_headline || ap.applicant_email}</p>
                    </div>
                    <span className="source-badge kanso">Applied</span>
                  </div>

                  <div className="app-card-role">
                    <FiBriefcase size={12} />
                    <span>Applied for: <strong>{ap.job_title}</strong> at {ap.company}</span>
                  </div>

                  {ap.applicant_skills && ap.applicant_skills.length > 0 && (
                    <div className="app-card-skills">
                      {ap.applicant_skills.slice(0, 6).map((s) => (
                        <span key={s} className="htag">{s}</span>
                      ))}
                      {ap.applicant_skills.length > 6 && (
                        <span className="htag">+{ap.applicant_skills.length - 6}</span>
                      )}
                    </div>
                  )}

                  <div className="app-card-footer">
                    <span className="hr-card-date">
                      {ap.applied_at ? new Date(ap.applied_at).toLocaleDateString() : ""}
                    </span>
                    <div className="app-card-actions">
                      {ap.applicant_email && (
                        <a href={`mailto:${ap.applicant_email}`} className="app-action-btn">
                          <FiMail size={13} /> Email
                        </a>
                      )}
                      {ap.has_resume && (
                        <button
                          className="app-action-btn accent"
                          onClick={() => handleDownloadResume(ap.resume_app_id, ap.applicant_name)}
                        >
                          <FiDownload size={13} /> Resume PDF
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
