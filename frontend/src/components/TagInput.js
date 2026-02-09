import React, { useState, useRef, useEffect } from "react";
import { FiX } from "react-icons/fi";
import "./TagInput.css";

const SKILL_DICT = [
  "JavaScript", "TypeScript", "Python", "Java", "C++", "C#", "Go", "Rust",
  "Ruby", "PHP", "Swift", "Kotlin", "Scala", "R", "MATLAB",
  "React", "Vue.js", "Angular", "Next.js", "Svelte", "Node.js", "Express",
  "Django", "Flask", "FastAPI", "Spring Boot", "Ruby on Rails", ".NET",
  "HTML", "CSS", "Tailwind CSS", "SASS", "Bootstrap",
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "CI/CD",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "DynamoDB",
  "SQL", "NoSQL", "GraphQL", "REST API", "gRPC",
  "Git", "Linux", "Bash", "PowerShell",
  "Machine Learning", "Deep Learning", "NLP", "Computer Vision", "PyTorch",
  "TensorFlow", "Pandas", "NumPy", "Scikit-learn", "Data Science",
  "Figma", "UI/UX", "Product Management", "Agile", "Scrum",
  "React Native", "Flutter", "iOS", "Android",
  "Blockchain", "Web3", "Solidity",
  "Cybersecurity", "DevOps", "SRE", "Microservices", "System Design",
];

export default function TagInput({ tags = [], onChange, placeholder = "Type to add…" }) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [showDrop, setShowDrop] = useState(false);
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([]);
      setShowDrop(false);
      return;
    }
    const q = input.toLowerCase();
    const matches = SKILL_DICT.filter(
      (s) => s.toLowerCase().includes(q) && !tags.includes(s)
    ).slice(0, 8);
    setSuggestions(matches);
    setShowDrop(matches.length > 0);
    setFocusIdx(-1);
  }, [input, tags]);

  const addTag = (tag) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setInput("");
    setSuggestions([]);
    setShowDrop(false);
    inputRef.current?.focus();
  };

  const removeTag = (idx) => {
    onChange(tags.filter((_, i) => i !== idx));
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (focusIdx >= 0 && suggestions[focusIdx]) {
        addTag(suggestions[focusIdx]);
      } else if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === "Backspace" && !input && tags.length) {
      removeTag(tags.length - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Escape") {
      setShowDrop(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="tag-input-wrap" ref={dropRef}>
      <div className="tag-input-box" onClick={() => inputRef.current?.focus()}>
        {tags.map((tag, i) => (
          <span key={tag + i} className="tag-chip">
            {tag}
            <button
              type="button"
              className="tag-chip-x"
              onClick={(e) => { e.stopPropagation(); removeTag(i); }}
            >
              <FiX size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="tag-input-field"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length) setShowDrop(true); }}
          placeholder={tags.length === 0 ? placeholder : ""}
        />
      </div>
      {showDrop && (
        <ul className="tag-dropdown">
          {suggestions.map((s, i) => (
            <li
              key={s}
              className={`tag-dropdown-item ${i === focusIdx ? "focused" : ""}`}
              onMouseDown={() => addTag(s)}
              onMouseEnter={() => setFocusIdx(i)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
