import React, { useState } from "react";
import { motion } from "framer-motion";
import { FiMail, FiUser, FiArrowRight, FiLinkedin } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import api from "../api";
import "./Login.css";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login"); // login | register
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user"); // user | hr
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        if (!name.trim() || !email.trim()) {
          setError("Name and email are required.");
          setLoading(false);
          return;
        }
        const res = await api.post("/auth/register", { name, email, role });
        onLogin(res.data);
      } else {
        if (!email.trim()) {
          setError("Email is required.");
          setLoading(false);
          return;
        }
        const res = await api.post("/auth/login", { email });
        onLogin(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Brand */}
        <div className="login-brand">
          <img src="/logo.png" alt="KansoAI" className="login-brand-logo" />
          <h1 className="login-brand-text">KansoAI</h1>
          <p className="login-tagline">Swipe. Apply. Get hired.</p>
        </div>

        {/* OAuth buttons — Coming Soon */}
        <div className="oauth-section">
          <button className="oauth-btn google" disabled>
            <FcGoogle size={20} />
            Continue with Google
            <span className="cs-chip">Soon</span>
          </button>
          <button className="oauth-btn linkedin" disabled>
            <FiLinkedin size={20} />
            Continue with LinkedIn
            <span className="cs-chip">Soon</span>
          </button>
        </div>

        <div className="divider">
          <span>or</span>
        </div>

        {/* Toggle */}
        <div className="login-toggle">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => { setMode("login"); setError(""); }}
          >
            Sign In
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => { setMode("register"); setError(""); }}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">
          {mode === "register" && (
            <div className="input-group">
              <FiUser size={16} className="input-icon" />
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div className="input-group">
            <FiMail size={16} className="input-icon" />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {mode === "register" && (
            <div className="role-picker">
              <p className="role-label">I am a…</p>
              <div className="role-options">
                <button
                  type="button"
                  className={`role-btn ${role === "user" ? "active" : ""}`}
                  onClick={() => setRole("user")}
                >
                  <span className="role-emoji">👤</span>
                  <span className="role-name">Job Seeker</span>
                  <span className="role-desc">Find and apply to jobs</span>
                </button>
                <button
                  type="button"
                  className={`role-btn ${role === "hr" ? "active" : ""}`}
                  onClick={() => setRole("hr")}
                >
                  <span className="role-emoji">🏢</span>
                  <span className="role-name">HR / Recruiter</span>
                  <span className="role-desc">Post jobs and find talent</span>
                </button>
              </div>
            </div>
          )}

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? "…" : mode === "login" ? "Sign In" : "Create Account"}
            {!loading && <FiArrowRight size={16} />}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
