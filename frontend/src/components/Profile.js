import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  FiUser,
  FiMail,
  FiPhone,
  FiMapPin,
  FiLinkedin,
  FiGithub,
  FiGlobe,
  FiSave,
  FiFileText,
  FiZap,
} from "react-icons/fi";
import api from "../api";
import TagInput from "./TagInput";
import "./Profile.css";

export default function Profile({ user }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    headline: "",
    bio: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    portfolio: "",
    skills: [],
    experience: "",
    education: "",
    resume_text: "",
  });

  useEffect(() => {
    api
      .get(`/profile/${user.id}`)
      .then((r) => {
        const p = r.data;
        setProfile(p);
        setForm({
          headline: p.headline || "",
          bio: p.bio || "",
          phone: p.phone || "",
          location: p.location || "",
          linkedin: p.linkedin || "",
          github: p.github || "",
          portfolio: p.portfolio || "",
          skills: p.skills || [],
          experience: p.experience || "",
          education: p.education || "",
          resume_text: p.resume_text || "",
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user.id]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put(`/profile/${user.id}`, {
        headline: form.headline,
        bio: form.bio,
        phone: form.phone,
        location: form.location,
        linkedin: form.linkedin,
        github: form.github,
        portfolio: form.portfolio,
        skills: form.skills,
        experience: form.experience,
        education: form.education,
        resume_text: form.resume_text,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save profile", err);
    } finally {
      setSaving(false);
    }
  };

  const [linkedinFile, setLinkedinFile] = useState(null);
  const [parsingLI, setParsingLI] = useState(false);
  const [parseSuccess, setParseSuccess] = useState(false);

  const parseLinkedIn = async () => {
    if (!linkedinFile) return;
    setParsingLI(true);
    setParseSuccess(false);
    try {
      const formData = new FormData();
      formData.append("file", linkedinFile);
      const r = await api.post("/parse-linkedin", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const d = r.data;
      setForm((prev) => ({
        ...prev,
        headline: d.headline || prev.headline,
        bio: d.bio || prev.bio,
        skills: Array.isArray(d.skills) ? d.skills : prev.skills.length ? prev.skills : [],
        experience: d.experience || prev.experience,
        education: d.education || prev.education,
      }));
      setLinkedinFile(null);
      // Reset the file input
      const fileInput = document.getElementById("linkedin-pdf-input");
      if (fileInput) fileInput.value = "";
      setParseSuccess(true);
      setTimeout(() => setParseSuccess(false), 4000);
    } catch (err) {
      console.error("Failed to parse LinkedIn PDF", err);
      alert(err.response?.data?.detail || "Failed to parse PDF. Please try again.");
    } finally {
      setParsingLI(false);
    }
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  // ── Profile completeness ──
  const completenessFields = [
    { key: "headline", label: "Headline" },
    { key: "bio", label: "Bio" },
    { key: "phone", label: "Phone" },
    { key: "location", label: "Location" },
    { key: "skills", label: "Skills", isArray: true },
    { key: "experience", label: "Experience" },
    { key: "education", label: "Education" },
    { key: "resume_text", label: "Resume text" },
  ];
  const filledCount = completenessFields.filter((f) =>
    f.isArray ? form[f.key]?.length > 0 : form[f.key]?.trim()
  ).length;
  const completeness = Math.round((filledCount / completenessFields.length) * 100);
  const missingFields = completenessFields
    .filter((f) => (f.isArray ? !form[f.key]?.length : !form[f.key]?.trim()))
    .map((f) => f.label);

  if (loading)
    return (
      <div className="prof-loading">
        <div className="loader" />
        <p>Loading profile…</p>
      </div>
    );

  return (
    <motion.div
      className="profile-page"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="prof-header">
        <div className="prof-avatar">
          {user.name?.charAt(0).toUpperCase() || "?"}
        </div>
        <div>
          <h2 className="prof-name">{user.name}</h2>
          <p className="prof-email">{user.email}</p>
          <span className={`prof-role-badge ${user.role === "hr" ? "hr" : "seeker"}`}>
            {user.role === "hr" ? "HR / Recruiter" : "Job Seeker"}
          </span>
        </div>
      </div>

      <p className="prof-hint">
        {user.role === "hr"
          ? "Complete your profile so candidates know who they're talking to."
          : "Fill in your profile so Gemini can tailor better resumes and prep you for interviews."}
      </p>

      {/* Completeness indicator */}
      <div className="completeness-bar">
        <div className="completeness-header">
          <span className="completeness-label">Profile Completeness</span>
          <span className={`completeness-pct ${completeness === 100 ? "full" : ""}`}>{completeness}%</span>
        </div>
        <div className="completeness-track">
          <motion.div
            className="completeness-fill"
            initial={{ width: 0 }}
            animate={{ width: `${completeness}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        {missingFields.length > 0 && (
          <p className="completeness-missing">
            Missing: {missingFields.join(", ")}
          </p>
        )}
      </div>

      {/* Form sections */}
      <div className="prof-sections">
        {/* LinkedIn Import */}
        <section className="prof-section linkedin-section">
          <h3 className="section-title">
            <FiLinkedin size={14} /> Import from LinkedIn CV
          </h3>
          <p className="section-hint">
            Upload your LinkedIn PDF (download from LinkedIn → "Save to PDF") and AI will auto-fill your profile fields.
          </p>
          <div className="linkedin-upload-row">
            <label className="linkedin-file-label" htmlFor="linkedin-pdf-input">
              <FiFileText size={14} />
              {linkedinFile ? linkedinFile.name : "Choose PDF…"}
            </label>
            <input
              id="linkedin-pdf-input"
              type="file"
              accept=".pdf"
              className="linkedin-file-input"
              onChange={(e) => setLinkedinFile(e.target.files[0] || null)}
            />
            <button
              className="linkedin-parse-btn"
              onClick={parseLinkedIn}
              disabled={parsingLI || !linkedinFile}
            >
              <FiZap size={14} />
              {parsingLI ? "Parsing with AI…" : "Parse with AI"}
            </button>
            {parseSuccess && <span className="parse-success">✓ Fields updated!</span>}
          </div>
        </section>

        {/* Basic Info */}
        <section className="prof-section">
          <h3 className="section-title">Basic Info</h3>
          <div className="prof-grid">
            <div className="prof-field">
              <label><FiUser size={13} /> Headline</label>
              <input placeholder="e.g. Full Stack Engineer" value={form.headline} onChange={set("headline")} />
            </div>
            <div className="prof-field">
              <label><FiPhone size={13} /> Phone</label>
              <input placeholder="+1 (555) 000-0000" value={form.phone} onChange={set("phone")} />
            </div>
            <div className="prof-field">
              <label><FiMapPin size={13} /> Location</label>
              <input placeholder="San Francisco, CA" value={form.location} onChange={set("location")} />
            </div>
          </div>
          <div className="prof-field full">
            <label>Bio</label>
            <textarea
              rows={3}
              placeholder="A brief description about yourself…"
              value={form.bio}
              onChange={set("bio")}
            />
          </div>
        </section>

        {/* Links */}
        <section className="prof-section">
          <h3 className="section-title">Links</h3>
          <div className="prof-grid">
            <div className="prof-field">
              <label><FiLinkedin size={13} /> LinkedIn</label>
              <input placeholder="https://linkedin.com/in/…" value={form.linkedin} onChange={set("linkedin")} />
            </div>
            <div className="prof-field">
              <label><FiGithub size={13} /> GitHub</label>
              <input placeholder="https://github.com/…" value={form.github} onChange={set("github")} />
            </div>
            <div className="prof-field">
              <label><FiGlobe size={13} /> Portfolio</label>
              <input placeholder="https://yoursite.com" value={form.portfolio} onChange={set("portfolio")} />
            </div>
          </div>
        </section>

        {/* Skills & Experience */}
        <section className="prof-section">
          <h3 className="section-title">Skills & Background</h3>
          <div className="prof-field full">
            <label>Skills</label>
            <TagInput
              tags={form.skills}
              onChange={(skills) => setForm({ ...form, skills })}
              placeholder="Type a skill and press Enter…"
            />
          </div>
          <div className="prof-field full">
            <label>Experience</label>
            <textarea
              rows={4}
              placeholder="Describe your work experience…"
              value={form.experience}
              onChange={set("experience")}
            />
          </div>
          <div className="prof-field full">
            <label>Education</label>
            <textarea
              rows={3}
              placeholder="Degrees, certifications, courses…"
              value={form.education}
              onChange={set("education")}
            />
          </div>
        </section>

        {/* Resume Text */}
        <section className="prof-section">
          <h3 className="section-title">
            <FiFileText size={14} /> Resume (Plain Text)
          </h3>
          <p className="section-hint">
            Paste your current resume here. Gemini uses this to create tailored versions for each job you swipe right on.
          </p>
          <div className="prof-field full">
            <textarea
              rows={8}
              placeholder="Paste your resume text here…"
              value={form.resume_text}
              onChange={set("resume_text")}
              className="resume-textarea"
            />
          </div>
        </section>
      </div>

      {/* Save */}
      <div className="prof-footer">
        {saved && <span className="save-success">✓ Profile saved!</span>}
        <button className="prof-save-btn" onClick={handleSave} disabled={saving}>
          <FiSave size={16} />
          {saving ? "Saving…" : "Save Profile"}
        </button>
      </div>
    </motion.div>
  );
}
