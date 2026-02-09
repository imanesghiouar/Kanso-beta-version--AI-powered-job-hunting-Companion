import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiMic, FiMicOff, FiPhone, FiX } from "react-icons/fi";
import "./AudioInterview.css";

export default function AudioInterview({ app, hrInfo, onClose }) {
  const [status, setStatus] = useState("connecting"); // connecting | active | ended
  const [timer, setTimer] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [error, setError] = useState("");
  const transcriptRef = useRef(""); // collect any text from WS

  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const timerRef = useRef(null);
  const isMutedRef = useRef(false);
  const playNextTimeRef = useRef(0);
  const statusRef = useRef("connecting");

  // Keep refs in sync
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { statusRef.current = status; }, [status]);

  // ── Timer ──────────────────────────────────────────────
  useEffect(() => {
    if (status === "active") {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [status]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // ── Audio playback (schedule chunks sequentially) ──────
  const playAudioChunk = useCallback((pcmBuffer) => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "closed") return;

    const int16 = new Int16Array(pcmBuffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, playNextTimeRef.current);
    src.start(startAt);
    playNextTimeRef.current = startAt + buffer.duration;
  }, []);

  // ── Cleanup helper ─────────────────────────────────────
  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch (_) {}
    }
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.disconnect(); } catch (_) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    if (wsRef.current && wsRef.current.readyState <= 1) {
      wsRef.current.close();
    }
  }, []);

  // ── Start mic → WebSocket → Gemini bridge ─────────────
  const startMicStream = useCallback((audioCtx, stream, ws) => {
    const source = audioCtx.createMediaStreamSource(stream);
    sourceNodeRef.current = source;
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (isMutedRef.current) return;
      const f32 = e.inputBuffer.getChannelData(0);
      const i16 = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      ws.send(i16.buffer);
    };

    source.connect(processor);
    // Connect to destination to keep the processor running (won't produce audible output)
    processor.connect(audioCtx.destination);
  }, []);

  // ── Main effect — open mic + WebSocket ─────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Request microphone
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000,
        });
        audioCtxRef.current = audioCtx;

        // WebSocket to backend
        const ws = new WebSocket(`ws://localhost:8000/ws/interview/${app.id}`);
        wsRef.current = ws;

        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              job_title: app.job_title,
              company: app.company || "",
              description: app.description || "",
              hr_name: hrInfo?.hr_name || "",
            })
          );
        };

        ws.onmessage = (event) => {
          if (typeof event.data === "string") {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === "connected" && !cancelled) {
                setStatus("active");
                setAiSpeaking(true); // AI will greet first
                startMicStream(audioCtx, stream, ws);
              } else if (msg.type === "turn_complete" || msg.type === "turn_end") {
                setAiSpeaking(false);
              }
              // Capture any transcript text for feedback
              if (msg.transcript) {
                transcriptRef.current += (msg.role === "user" ? "\nCandidate: " : "\nInterviewer: ") + msg.transcript;
              }
            } catch (_) {}
          } else {
            // Binary audio from Gemini
            setAiSpeaking(true);
            playAudioChunk(event.data);
          }
        };

        ws.onerror = () => {
          if (!cancelled) {
            setError("Could not connect to interview service.");
            setStatus("ended");
          }
        };

        ws.onclose = () => {
          if (!cancelled && statusRef.current !== "ended") {
            setStatus("ended");
          }
        };
      } catch (err) {
        console.error("Interview init error:", err);
        if (!cancelled) {
          setError(
            err.name === "NotAllowedError"
              ? "Microphone access denied. Please allow mic permission and try again."
              : "Failed to start the interview. Check your microphone."
          );
          setStatus("ended");
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []); // eslint-disable-line

  // ── Controls ───────────────────────────────────────────
  const endInterview = () => {
    cleanup();
    setStatus("ended");
  };

  const toggleMute = () => setIsMuted((m) => !m);

  const handleClose = () => {
    onClose(transcriptRef.current, timer);
  };

  // ── Render ─────────────────────────────────────────────
  const hrName = hrInfo?.hr_name || "KansoAI Interviewer";
  const avatarLetter = hrName.charAt(0).toUpperCase();

  return (
    <AnimatePresence>
      <motion.div
        className="interview-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="interview-container">
          {/* Timer */}
          <div className="interview-timer">{formatTime(timer)}</div>

          {/* Status line */}
          <div className={`interview-status ${status}`}>
            {status === "connecting" && "Connecting to interviewer…"}
            {status === "active" && (aiSpeaking ? "AI is speaking…" : "Listening…")}
            {status === "ended" && (error || "Interview Ended")}
          </div>

          {/* Animated Avatar */}
          <div
            className={`interview-avatar-wrap ${
              aiSpeaking ? "speaking" : ""
            } ${status}`}
          >
            <div className="av-ring ring-1" />
            <div className="av-ring ring-2" />
            <div className="av-ring ring-3" />
            <div className="interview-avatar">
              <span>{avatarLetter}</span>
            </div>
          </div>

          <p className="interview-name">{hrName}</p>
          <p className="interview-role">
            {app.company || "Company"} · {app.job_title}
          </p>

          {/* Controls */}
          <div className="interview-controls">
            <button
              className={`ctrl-btn mute ${isMuted ? "active" : ""}`}
              onClick={toggleMute}
              disabled={status !== "active"}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <FiMicOff size={22} /> : <FiMic size={22} />}
            </button>
            <button
              className="ctrl-btn end"
              onClick={status === "ended" ? handleClose : endInterview}
              title={status === "ended" ? "Close" : "End Interview"}
            >
              {status === "ended" ? (
                <FiX size={22} />
              ) : (
                <FiPhone size={22} />
              )}
            </button>
          </div>

          {status === "ended" && (
            <button className="interview-back-btn" onClick={handleClose}>
              Back to Prep
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
