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
  const [isListening, setIsListening] = useState(false);
  const [currentSpeech, setCurrentSpeech] = useState(""); // What user is currently saying
  const [isProcessing, setIsProcessing] = useState(false); // Waiting for AI response
  const transcriptRef = useRef(""); // collect any text from WS

  const wsRef = useRef(null);
  const timerRef = useRef(null);
  const isMutedRef = useRef(false);
  const statusRef = useRef("connecting");
  const recognitionRef = useRef(null); // Web Speech API
  const silenceTimeoutRef = useRef(null);

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

  // ── Text-to-Speech with callback when finished ──────────
  const speakTextWithCallback = useCallback((text, onFinished) => {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    // Chrome bug workaround: resume speechSynthesis if paused
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = "en-US";

    // Try to get a good English voice
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(
      (v) => v.lang.startsWith("en") && v.localService
    ) || voices.find((v) => v.lang.startsWith("en")) || voices[0];
    
    if (englishVoice) {
      utterance.voice = englishVoice;
      console.log("🔊 Using voice:", englishVoice.name);
    }

    // Chrome bug: long text can cause speech to stop
    // Workaround: keep resuming every 10 seconds
    let resumeInterval = null;

    utterance.onstart = () => {
      console.log("🔊 TTS started speaking");
      setAiSpeaking(true);
      
      resumeInterval = setInterval(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);
    };

    utterance.onend = () => {
      console.log("🔊 TTS finished speaking");
      if (resumeInterval) clearInterval(resumeInterval);
      setAiSpeaking(false);
      if (onFinished) onFinished();
    };

    utterance.onerror = (e) => {
      console.error("🔊 TTS error:", e);
      if (resumeInterval) clearInterval(resumeInterval);
      setAiSpeaking(false);
      if (onFinished) onFinished();
    };

    console.log("🔊 Speaking:", text.substring(0, 100) + "...");
    window.speechSynthesis.speak(utterance);
  }, []);

  // Refs for speech buffering
  const speechBufferRef = useRef("");
  const silenceTimerRef = useRef(null);
  const isWaitingForAIRef = useRef(false);

  // ── Cleanup helper ─────────────────────────────────────
  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    clearTimeout(silenceTimeoutRef.current);
    clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }
    if (wsRef.current && wsRef.current.readyState <= 1) {
      wsRef.current.close();
    }
    window.speechSynthesis.cancel();
  }, []);

  // ── Send buffered speech to backend ────────────────────
  const sendBufferedSpeech = useCallback(() => {
    const text = speechBufferRef.current.trim();
    if (text.length > 0 && !isWaitingForAIRef.current) {
      console.log("📤 Sending full response to backend:", text);
      transcriptRef.current += "\nCandidate: " + text;
      setIsProcessing(true);
      setCurrentSpeech("");
      
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        isWaitingForAIRef.current = true;
        wsRef.current.send(
          JSON.stringify({
            type: "user_transcript",
            transcript: text,
          })
        );
      } else {
        console.error("❌ WebSocket not open, state:", wsRef.current?.readyState);
        setIsProcessing(false);
      }
      speechBufferRef.current = "";
    }
  }, []);

  // ── Initialize Web Speech API ──────────────────────────
  const initializeSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech Recognition not supported in this browser. Please use Chrome.");
      setStatus("ended");
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.language = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("🎤 Speech recognition started");
      setIsListening(true);
      setCurrentSpeech("");
    };

    recognition.onresult = (event) => {
      // Don't process if waiting for AI response
      if (isWaitingForAIRef.current) return;

      let interimText = "";
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const isFinal = event.results[i].isFinal;
        
        if (isFinal) {
          // Add to buffer
          speechBufferRef.current += " " + transcript;
          console.log(`🎤 Added to buffer: "${transcript}"`);
          console.log(`📝 Current buffer: "${speechBufferRef.current.trim()}"`);
        } else {
          interimText += transcript;
        }
      }

      // Show what user is currently saying (interim + buffer)
      const displayText = (speechBufferRef.current + " " + interimText).trim();
      if (displayText) {
        setCurrentSpeech(displayText);
      }

      // Clear existing silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      // Set new silence timer - wait 2.5 seconds of silence before sending
      // This gives user time to think and speak full sentences
      if (speechBufferRef.current.trim().length > 0) {
        silenceTimerRef.current = setTimeout(() => {
          console.log("⏱️ Silence detected - sending response");
          sendBufferedSpeech();
        }, 2500);
      }
    };

    recognition.onerror = (event) => {
      console.error("🎤 Speech recognition error:", event.error);
      if (event.error === "no-speech") {
        // No speech detected - that's OK, just restart
        setTimeout(() => {
          if (statusRef.current === "active" && recognitionRef.current && !isWaitingForAIRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {}
          }
        }, 100);
      } else if (event.error !== "aborted") {
        setTimeout(() => {
          if (statusRef.current === "active" && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {}
          }
        }, 500);
      }
    };

    recognition.onend = () => {
      console.log("🎤 Speech recognition ended");
      setIsListening(false);
      // Restart if still in active interview and not waiting for AI
      if (statusRef.current === "active" && !isWaitingForAIRef.current) {
        setTimeout(() => {
          if (statusRef.current === "active" && recognitionRef.current && !isWaitingForAIRef.current) {
            try {
              console.log("🎤 Restarting speech recognition...");
              recognitionRef.current.start();
            } catch (e) {}
          }
        }, 100);
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [sendBufferedSpeech]);

  // ── Load voices on mount ───────────────────────────────
  useEffect(() => {
    // Preload voices (needed for some browsers)
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      console.log("Available voices:", voices.length);
    };
    
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // ── Main effect — initialize WebSocket + Speech Recognition ─────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Wait for voices to be available
        await new Promise((resolve) => {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0) {
            resolve();
          } else {
            window.speechSynthesis.onvoiceschanged = () => resolve();
            // Fallback timeout
            setTimeout(resolve, 1000);
          }
        });

        // WebSocket to backend
        const ws = new WebSocket(`ws://localhost:8000/ws/interview/${app.id}`);
        wsRef.current = ws;

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
              console.log("📨 WS message received:", msg);
              
              if (msg.type === "connected" && !cancelled) {
                setStatus("active");
                setAiSpeaking(true);
                isWaitingForAIRef.current = true;
                setIsProcessing(false);
                
                // Initialize speech recognition (but don't start yet - wait for AI greeting to finish)
                initializeSpeechRecognition();
              } else if (msg.type === "ai_response") {
                console.log("🤖 AI response:", msg.text);
                setAiSpeaking(true);
                setIsProcessing(false);
                setCurrentSpeech("");
                
                // Stop recognition while AI is speaking
                if (recognitionRef.current) {
                  try { recognitionRef.current.stop(); } catch (_) {}
                }
                
                // Speak the AI response
                speakTextWithCallback(msg.text, () => {
                  // AI finished speaking - now user can respond
                  console.log("🎤 AI finished speaking - your turn!");
                  setAiSpeaking(false);
                  isWaitingForAIRef.current = false;
                  speechBufferRef.current = "";
                  setCurrentSpeech("");
                  
                  // Start listening for user response
                  if (statusRef.current === "active" && recognitionRef.current) {
                    try {
                      recognitionRef.current.start();
                    } catch (e) {
                      console.log("Could not start recognition:", e);
                    }
                  }
                });
                
                // Capture transcript
                transcriptRef.current += "\nInterviewer: " + msg.text;
              } else if (msg.type === "interview_end") {
                setStatus("ended");
                if (recognitionRef.current) {
                  try { recognitionRef.current.stop(); } catch (_) {}
                }
              } else if (msg.type === "error") {
                setError(msg.message);
                isWaitingForAIRef.current = false;
                setIsProcessing(false);
              }
            } catch (_) {}
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
          setError("Failed to start the interview. Please try again.");
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

  // Determine status text
  const getStatusText = () => {
    if (status === "connecting") return "Connecting to interviewer…";
    if (status === "ended") return error || "Interview Ended";
    if (status === "active") {
      if (aiSpeaking) return "🔊 AI is speaking…";
      if (isProcessing) return "⏳ Processing your response…";
      if (isMuted) return "🔇 Microphone muted";
      if (isListening) return "🎤 Listening... (pause 2.5s to send)";
      return "Starting microphone…";
    }
    return "";
  };

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
            {getStatusText()}
          </div>

          {/* Show what user is saying */}
          {currentSpeech && !aiSpeaking && (
            <div className="interview-speech-preview">
              "{currentSpeech}"
            </div>
          )}

          {/* Animated Avatar */}
          <div
            className={`interview-avatar-wrap ${
              aiSpeaking ? "speaking" : ""
            } ${isListening && !aiSpeaking && !isProcessing ? "listening" : ""} ${isProcessing ? "processing" : ""} ${status}`}
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
