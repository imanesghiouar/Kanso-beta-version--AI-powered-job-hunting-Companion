import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiArrowLeft,
  FiMapPin,
  FiDollarSign,
  FiDownload,
  FiSend,
  FiMic,
  FiZap,
  FiMessageCircle,
  FiRefreshCw,
  FiEdit3,
  FiAward,
  FiChevronDown,
  FiChevronUp,
  FiAlertCircle,
  FiUser,
} from "react-icons/fi";
import api from "../api";
import { useToast } from "./Toast";
import AudioInterview from "./AudioInterview";
import "./PrepPage.css";

export default function PrepPage({ app, userId, onBack, onGoToProfile }) {
  const [liveApp, setLiveApp] = useState(app);
  const [polling, setPolling] = useState(app.status === "processing");
  const toast = useToast();

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [hrInfo, setHrInfo] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [showInterview, setShowInterview] = useState(false);
  const chatEndRef = useRef(null);

  // Notes state
  const [notes, setNotes] = useState(app.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);

  // Feedback state
  const [feedbacks, setFeedbacks] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);

  // Apply state
  const [applying, setApplying] = useState(false);

  // PDF state
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Profile completeness check modal
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [profileMissing, setProfileMissing] = useState([]);

  // Poll for resume status if still processing (every 4s, max 30 polls)
  useEffect(() => {
    if (!polling) return;
    let count = 0;
    const interval = setInterval(async () => {
      count++;
      if (count > 30) { clearInterval(interval); setPolling(false); return; }
      try {
        const r = await api.get(`/application/${app.id}`);
        setLiveApp(r.data);
        if (r.data.status !== "processing") {
          setPolling(false);
          clearInterval(interval);
        }
      } catch (_) {}
    }, 4000);
    return () => clearInterval(interval);
  }, [polling, app.id]);

  // Load chat history + HR personality + feedbacks once
  useEffect(() => {
    api.get(`/chat/${app.id}`).then((r) => setMessages(r.data)).catch(() => {});
    api.get(`/interview/feedback/${app.id}`).then((r) => setFeedbacks(r.data)).catch(() => {});
    if (app.company) {
      api.get(`/hr-personalities/${encodeURIComponent(app.company)}`).then((r) => {
        if (r.data) setHrInfo(r.data);
      }).catch(() => {});
    }
  }, [app.id, app.company]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch PDF when resume is ready
  useEffect(() => {
    if (!liveApp.tailored_resume || !liveApp.tailored_resume.includes("\\documentclass")) {
      setPdfUrl(null);
      return;
    }
    setPdfLoading(true);
    api.get(`/application/${app.id}/resume-pdf`, { responseType: "blob" })
      .then((r) => {
        const url = URL.createObjectURL(r.data);
        setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      })
      .catch(() => setPdfUrl(null))
      .finally(() => setPdfLoading(false));
    return () => setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
  }, [liveApp.tailored_resume, app.id]); // eslint-disable-line

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatLoading(true);
    // Optimistic add
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: msg }]);
    try {
      const r = await api.post("/chat", {
        application_id: app.id,
        user_id: userId,
        message: msg,
      });
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", content: r.data.reply },
      ]);
      if (r.data.hr_name && !hrInfo) {
        setHrInfo({ hr_name: r.data.hr_name, company: r.data.company });
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", content: "Sorry, something went wrong. Try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

  const generateResume = async () => {
    setGenerating(true);
    try {
      await api.post(`/generate-resume/${app.id}?user_id=${userId}`);
      setLiveApp((prev) => ({ ...prev, status: "processing" }));
      setPolling(true);
    } catch (err) {
      console.error("Failed to start resume generation", err);
    } finally {
      setGenerating(false);
    }
  };

  // ── Profile completeness check before AI actions ──
  const checkProfileThen = async (action) => {
    try {
      const r = await api.get(`/profile/${userId}`);
      const p = r.data;
      const checks = [
        { key: "headline", label: "Headline" },
        { key: "skills", label: "Skills", isArr: true },
        { key: "experience", label: "Experience" },
        { key: "education", label: "Education" },
      ];
      const missing = checks.filter((c) =>
        c.isArr ? !p[c.key]?.length : !p[c.key]?.trim()
      ).map((c) => c.label);

      if (missing.length > 0) {
        setProfileMissing(missing);
        setPendingAction(() => action);
        setShowProfileModal(true);
      } else {
        action();
      }
    } catch {
      action(); // If profile fetch fails, just proceed
    }
  };

  const hasResume = liveApp.tailored_resume && liveApp.tailored_resume.length > 0;
  const isReady = hasResume && liveApp.status !== "processing";
  const isApplied = liveApp.status === "applied";

  const handleDownload = () => {
    if (pdfUrl) {
      const a = document.createElement("a");
      a.href = pdfUrl;
      a.download = `resume-${liveApp.job_title?.replace(/\s+/g, "-") || "kanso"}.pdf`;
      a.click();
    } else if (hasResume) {
      // Fallback: download raw .tex
      const blob = new Blob([liveApp.tailored_resume], { type: "application/x-tex" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resume-${liveApp.job_title?.replace(/\s+/g, "-") || "kanso"}.tex`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Helper: strip LaTeX commands for a readable preview
  const stripLatex = (tex) => {
    if (!tex) return "";
    let t = tex;
    // Remove preamble up to \begin{document}
    const docStart = t.indexOf("\\begin{document}");
    if (docStart !== -1) t = t.substring(docStart + 16);
    t = t.replace(/\\end\{document\}/g, "");
    // Remove common commands but keep text content
    t = t.replace(/\\textbf\{([^}]*)\}/g, "$1");
    t = t.replace(/\\textit\{([^}]*)\}/g, "$1");
    t = t.replace(/\\emph\{([^}]*)\}/g, "$1");
    t = t.replace(/\\underline\{([^}]*)\}/g, "$1");
    t = t.replace(/\\href\{[^}]*\}\{([^}]*)\}/g, "$1");
    t = t.replace(/\\small|\\large|\\Large|\\LARGE|\\Huge|\\huge|\\scshape|\\raggedright/g, "");
    t = t.replace(/\\begin\{(itemize|enumerate|center|tabular\*?)\}[^]*/g, "");
    t = t.replace(/\\end\{(itemize|enumerate|center|tabular\*?)\}/g, "");
    t = t.replace(/\\(resumeItem|resumeSubheading|resumeProjectHeading|resumeSubItem)\{/g, "");
    t = t.replace(/\\(resumeSubHeadingListStart|resumeSubHeadingListEnd|resumeItemListStart|resumeItemListEnd)/g, "");
    t = t.replace(/\\section\{([^}]*)\}/g, "\n━━━ $1 ━━━\n");
    t = t.replace(/\\item/g, "  •");
    t = t.replace(/\$\|\$/g, " | ");
    t = t.replace(/\\vspace\{[^}]*\}/g, "");
    t = t.replace(/\\[a-zA-Z]+/g, "");
    t = t.replace(/[{}]/g, "");
    t = t.replace(/\n{3,}/g, "\n\n");
    return t.trim();
  };

  const isInternal = (liveApp.source || app.source) === "kanso";

  const handleApply = async () => {
    setApplying(true);
    try {
      const r = await api.post(`/application/${app.id}/apply`);
      setLiveApp((prev) => ({ ...prev, status: "applied" }));
      toast.success(r.data.is_internal
        ? "Application sent to the recruiter! 🎉"
        : "Application marked as applied! 🎉"
      );
    } catch (err) {
      toast.error("Failed to apply.");
    } finally {
      setApplying(false);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await api.put(`/application/${app.id}/notes`, { notes });
      toast.success("Notes saved.");
    } catch (err) {
      toast.error("Failed to save notes.");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleInterviewEnd = async (transcript, duration) => {
    setShowInterview(false);
    if (!transcript || transcript.trim().length < 10) {
      toast.info("Interview ended. No transcript to analyze.");
      return;
    }
    toast.info("Generating interview feedback...");
    try {
      const r = await api.post("/interview/feedback", {
        application_id: app.id,
        user_id: userId,
        transcript,
        duration_seconds: duration,
      });
      setFeedbacks((prev) => [r.data, ...prev]);
      setShowFeedback(true);
      toast.success(`Interview scored: ${r.data.score}`);
    } catch (err) {
      toast.error("Failed to generate feedback.");
    }
  };

  return (
    <motion.div
      className="prep"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Top bar */}
      <button className="prep-back" onClick={onBack}>
        <FiArrowLeft size={18} /> Back to Dashboard
      </button>

      {/* Job Header */}
      <div className="prep-header">
        <img
          className="prep-logo"
          src={liveApp.logo || app.logo}
          alt={liveApp.company || app.company}
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = `https://ui-avatars.com/api/?name=${liveApp.company || app.company}&background=6c5ce7&color=fff&size=64`;
          }}
        />
        <div className="prep-header-text">
          <h1 className="prep-title">{liveApp.job_title}</h1>
          <p className="prep-company">{liveApp.company || app.company}</p>
          <div className="prep-meta">
            {(liveApp.location || app.location) && (
              <span><FiMapPin size={13} /> {liveApp.location || app.location}</span>
            )}
            {(liveApp.salary || app.salary) && (
              <span><FiDollarSign size={13} /> {liveApp.salary || app.salary}</span>
            )}
            <span className={`source-badge ${(liveApp.source || app.source) === "kanso" ? "kanso" : "external"}`}>
              {(liveApp.source || app.source) === "kanso" ? "Kanso" : "External"}
            </span>
          </div>
        </div>
      </div>

      {/* Tags */}
      {(liveApp.tags || app.tags || []).length > 0 && (
        <div className="prep-tags">
          {(liveApp.tags || app.tags).map((t) => (
            <span key={t} className="ptag">{t}</span>
          ))}
        </div>
      )}

      {/* Side-by-side: Job Description vs Tailored Resume */}
      <div className="prep-columns">
        {/* Left: Job Description */}
        <div className="prep-col">
          <div className="col-header">
            <span className="col-label">Job Description</span>
          </div>
          <div className="col-body">
            {liveApp.description
              ? liveApp.description.split("\n").map((line, i) => (
                  <p key={i}>{line || "\u00A0"}</p>
                ))
              : <p className="muted">No description available.</p>
            }
          </div>
        </div>

        {/* Right: AI Tailored Resume */}
        <div className="prep-col">
          <div className="col-header">
            <span className="col-label">
              <FiZap size={14} /> AI Tailored Resume
            </span>
            {polling && <span className="status-chip processing"><FiRefreshCw size={12} className="spin" /> Generating…</span>}
            {isReady && <span className="status-chip ready">✓ Ready</span>}
            {!polling && !isReady && !hasResume && <span className="status-chip saved">⚡ Not Generated</span>}
          </div>
          <div className="col-body">
            {pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="resume-pdf-frame"
                title="Resume Preview"
              />
            ) : pdfLoading ? (
              <div className="resume-loading">
                <div className="loader" />
                <p>Compiling PDF…</p>
              </div>
            ) : hasResume ? (
              <div className="resume-content">
                {stripLatex(liveApp.tailored_resume).split("\n").map((line, i) => (
                  <p key={i}>{line || "\u00A0"}</p>
                ))}
              </div>
            ) : polling ? (
              <div className="resume-loading">
                <div className="loader" />
                <p>Gemini is crafting your tailored resume…</p>
                <p className="muted">This usually takes 10–20 seconds.</p>
              </div>
            ) : (
              <div className="resume-cta">
                <FiZap size={32} />
                <h3>Generate AI Resume</h3>
                <p className="muted">Click below and Gemini will craft a tailored LaTeX resume for this role using your profile data.</p>
                <button className="prep-btn accent gen-btn" onClick={() => checkProfileThen(generateResume)} disabled={generating}>
                  <FiZap size={16} /> {generating ? "Starting…" : "Generate Resume"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="prep-actions">
        <button className="prep-btn secondary" onClick={handleDownload} disabled={!hasResume}>
          <FiDownload size={16} /> {pdfUrl ? "Download PDF" : "Download Resume"}
        </button>
        {hasResume && (
          <button className="prep-btn secondary" onClick={() => checkProfileThen(generateResume)} disabled={generating || polling}>
            <FiRefreshCw size={16} /> Regenerate
          </button>
        )}
        <button className="prep-btn accent" onClick={() => setChatOpen(!chatOpen)}>
          <FiMessageCircle size={16} /> {chatOpen ? "Hide Chat" : "Chat with AI-HR"}
        </button>
        <button className="prep-btn accent" onClick={() => setShowInterview(true)}>
          <FiMic size={16} /> Practice Interview
        </button>
        {isApplied ? (
          <button className="prep-btn applied" disabled>
            <FiSend size={16} /> Applied ✓
          </button>
        ) : isInternal ? (
          <button className="prep-btn primary" onClick={handleApply} disabled={applying}>
            <FiSend size={16} /> {applying ? "Sending…" : "Apply on Kanso"}
          </button>
        ) : (
          <button className="prep-btn coming-soon-apply" disabled>
            <FiSend size={16} /> Apply (Coming Soon)
          </button>
        )}
      </div>

      {/* Notes */}
      <div className="prep-notes">
        <div className="notes-header">
          <FiEdit3 size={15} />
          <span>Personal Notes</span>
        </div>
        <textarea
          className="notes-textarea"
          rows={3}
          placeholder="Add notes about this application (interview dates, contacts, etc.)…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
        />
        {savingNotes && <span className="notes-saving">Saving…</span>}
      </div>

      {/* Interview Feedback Scorecard */}
      {feedbacks.length > 0 && (
        <div className="prep-feedback-section">
          <button className="feedback-toggle" onClick={() => setShowFeedback(!showFeedback)}>
            <FiAward size={16} />
            <span>Interview Feedback ({feedbacks.length})</span>
            {showFeedback ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
          </button>
          <AnimatePresence>
            {showFeedback && (
              <motion.div
                className="feedback-list"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                {feedbacks.map((fb) => (
                  <div key={fb.id} className="feedback-card">
                    <div className="feedback-score">
                      <span className="score-big">{fb.score}</span>
                      <span className="score-label">Score</span>
                    </div>
                    <div className="feedback-body">
                      <p className="feedback-summary">{fb.summary}</p>
                      {fb.strengths && fb.strengths.length > 0 && (
                        <div className="fb-list-group">
                          <span className="fb-list-label good">✓ Strengths</span>
                          <ul>{fb.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </div>
                      )}
                      {fb.improvements && fb.improvements.length > 0 && (
                        <div className="fb-list-group">
                          <span className="fb-list-label improve">↑ Areas to Improve</span>
                          <ul>{fb.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* AI-HR Chat */}
      {chatOpen && (
        <motion.div
          className="chat-box"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
        >
          <div className="chat-header">
            <FiMessageCircle size={16} />
            <div>
              <span className="chat-header-title">
                {hrInfo?.hr_name || "KansoAI Recruiter"}
              </span>
              <span className="chat-header-sub">
                AI-HR from {liveApp.company || app.company}
              </span>
            </div>
          </div>
          <div className="chat-notice">
            💡 You're speaking to an AI-HR from <strong>{liveApp.company || app.company}</strong>. Ask about the role, interview tips, or company culture.
          </div>
          <div className="chat-messages">
            {messages.length === 0 && (
              <p className="chat-empty">Start the conversation! Ask about the role, team, or interview process.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.role}`}>
                <span className="msg-sender">
                  {m.role === "user" ? "You" : hrInfo?.hr_name || "AI-HR"}
                </span>
                <p>{m.content}</p>
              </div>
            ))}
            {chatLoading && (
              <div className="chat-msg assistant">
                <span className="msg-sender">{hrInfo?.hr_name || "AI-HR"}</span>
                <p className="typing">Typing…</p>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input-row">
            <input
              className="chat-input"
              placeholder="Type your message…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={chatLoading}
            />
            <button className="chat-send" onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
              <FiSend size={16} />
            </button>
          </div>
        </motion.div>
      )}

      {/* Voice Agent info */}
      <div className="prep-voice-hint">
        <FiMic size={18} />
        <div>
          <p className="voice-title">Voice Agent – Interview Prep</p>
          <p className="voice-desc">
            Practice with a live AI interviewer that asks role-specific questions
            using Gemini's Native Audio. Includes a timer, mute toggle, and
            animated avatar.
          </p>
        </div>
      </div>

      {/* Audio Interview overlay */}
      {showInterview && (
        <AudioInterview
          app={{ ...liveApp, company: liveApp.company || app.company }}
          hrInfo={hrInfo}
          onClose={handleInterviewEnd}
        />
      )}

      {/* Profile completeness warning modal */}
      <AnimatePresence>
        {showProfileModal && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowProfileModal(false)}
          >
            <motion.div
              className="modal-card"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-icon-row">
                <FiAlertCircle size={32} className="modal-warn-icon" />
              </div>
              <h3 className="modal-title">Your profile is incomplete</h3>
              <p className="modal-desc">
                You're missing info on your profile page. Filling it in helps Gemini generate much better resumes and interview prep.
              </p>
              <div className="modal-missing">
                <span>Missing:</span> {profileMissing.join(", ")}
              </div>
              <div className="modal-actions">
                <button
                  className="modal-btn secondary"
                  onClick={() => {
                    setShowProfileModal(false);
                    if (pendingAction) pendingAction();
                  }}
                >
                  Send Anyway
                </button>
                <button
                  className="modal-btn primary highlighted"
                  onClick={() => {
                    setShowProfileModal(false);
                    if (onGoToProfile) onGoToProfile();
                  }}
                >
                  <FiUser size={16} /> Go to Profile
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

