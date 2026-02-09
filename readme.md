# 簡 KansoAI

**AI-powered job application platform — swipe, prep, apply.**

Tinder-style job discovery + Gemini AI resume tailoring + live voice interview practice — all in one place.

---

## Quick Start

```bash
# Clone & add your API key
cp .env.example .env   # add GOOGLE_API_KEY

# Run
docker compose up -d
```

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000

---

## Features

### ✅ Working Now

| Feature | Description |
|---|---|
| **Swipe Feed** | Tinder-style job cards — swipe right to save, left to skip. Keyboard arrows supported. |
| **Filters** | Filter by source (Kanso/External), job type, and tags. |
| **AI Resume (PDF)** | Gemini generates a LaTeX resume tailored to each job. Rendered as PDF in-browser, downloadable. |
| **Profile** | Headline, skills, experience, education, links. Completeness indicator. |
| **LinkedIn PDF Import** | Upload your LinkedIn PDF → auto-parsed into profile fields (no AI, pure regex). |
| **Profile Check Modal** | Before AI actions, warns if profile is incomplete. "Go to Profile" or "Send Anyway". |
| **AI-HR Chat** | Chat with AI recruiters (Google's Sarah Chen, Spotify's Erik, Stripe's Priya) about roles. |
| **Voice Interview** | Real-time voice interview via Gemini Live API. Animated avatar, mute toggle, timer. |
| **Interview Feedback** | AI scorecard after practice interviews — score, strengths, areas to improve. |
| **In-App Apply (Kanso jobs)** | Apply directly to HR-posted jobs. HR gets a notification + sees the application. |
| **HR Dashboard** | Post jobs, manage listings, review applications, download applicant resumes as PDF. |
| **Notifications** | Bell icon with real-time notifications — new job matches, new applicants (for HR). |
| **Dashboard** | All saved jobs with status tracking (saved → processing → ready → applied). |
| **Notes** | Personal notes per application (interview dates, contacts, etc). |
| **Dark/Light Theme** | Toggle in navbar, persisted in localStorage. |
| **Mobile Responsive** | Full responsive design — works on phone and desktop. |
| **Toast Notifications** | Success/error/info toasts across all actions. |

### 🔜 Coming Soon

| Feature | Status |
|---|---|
| **External Apply** | "Apply (Coming Soon)" button for non-Kanso jobs. Plan: open original posting URL or email. |
| **Profile Image Upload** | Backend ready (`profile_image` column exists). Frontend upload UI pending. |
| **HR Profile Differentiation** | Backend fields ready (`company_name`, `company_role`, `company_desc`). Frontend pending. |

### 💡 Ideas / Backlog

- **Job Recommendations** — AI suggests jobs based on profile/skills match
- **Application Analytics** — Charts: applications/week, response rates, skill demand
- **Resume A/B Testing** — Generate multiple resume variants, track which gets more callbacks
- **Email Notifications** — SendGrid integration for apply confirmations + new matches
- **Collaborative Notes** — Share prep notes between candidates
- **Salary Estimator** — AI estimates salary range based on profile + job market
- **ATS Score Checker** — Score resume against job description before applying

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React, Framer Motion, React Icons |
| Backend | FastAPI (Python 3.11), SQLAlchemy |
| Database | PostgreSQL |
| AI | Gemini 2.5 Flash (text), Gemini Live (voice) |
| Resume | LaTeX → PDF (pdflatex, Jake Ryan template) |
| PDF Parse | pdfplumber (pure Python, no AI) |
| Infra | Docker Compose (3 containers) |

---

## Project Structure

```
├── docker-compose.yml
├── backend/
│   ├── main.py          # FastAPI app — models, routes, AI logic
│   ├── requirements.txt
│   ├── dockerfile
│   └── data/jobs.json   # Static job listings
├── frontend/
│   ├── src/
│   │   ├── App.js       # Root — routing, auth state
│   │   ├── api.js       # Axios instance
│   │   └── components/
│   │       ├── Feed.js         # Swipe cards
│   │       ├── Dashboard.js    # Saved applications
│   │       ├── PrepPage.js     # Resume + chat + interview
│   │       ├── Profile.js      # User profile editor
│   │       ├── HRDashboard.js  # HR job posting + applications
│   │       ├── Login.js        # Auth (email-based)
│   │       ├── Navbar.js       # Nav + theme + notifications
│   │       └── AudioInterview.js # Voice agent
│   └── dockerfile
```

---

## Environment Variables

```env
GOOGLE_API_KEY=your-gemini-key
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=recruiter_db
```

---

**Built for Devpost hackathon** · React + FastAPI + Gemini + Docker
