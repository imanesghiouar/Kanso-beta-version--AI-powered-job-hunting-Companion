# 🐰 KansoAI

<p align="center">
  <img src="frontend/public/logo.png" alt="KansoAI Logo" width="120" />
</p>

<p align="center">
  <strong>AI-powered job application platform — swipe, prep, apply.</strong>
</p>

<p align="center">
  Tinder-style job discovery + Gemini AI resume tailoring + live voice interview practice — all in one place.
</p>

---

## 🚀 Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/kansoai.git
cd kansoai

# 2. Set up environment variables
cp .env.example .env
# Edit .env and add your GOOGLE_API_KEY

# 3. Run with Docker
docker-compose up -d
```

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000

---

## ✨ Features

### Core Features

| Feature | Description |
|---------|-------------|
| **🔄 Swipe Feed** | Tinder-style job cards — swipe right to save, left to skip. Keyboard arrows supported. |
| **🔍 Smart Filters** | Filter by source (Kanso/External), job type, and tags. |
| **📄 AI Resume (PDF)** | Gemini generates a LaTeX resume tailored to each job. Rendered as PDF in-browser. |
| **👤 Profile** | Headline, skills, experience, education, links. Completeness indicator. |
| **📋 LinkedIn Import** | Upload your LinkedIn PDF → auto-parsed into profile fields. |

### AI Interview Practice

| Feature | Description |
|---------|-------------|
| **🎤 Voice Interview** | Real-time voice interview with AI interviewer using Web Speech API. |
| **💬 AI-HR Chat** | Chat with AI recruiters about roles and get personalized advice. |
| **📊 Interview Feedback** | AI scorecard after practice — score, strengths, areas to improve. |

### For Job Seekers

| Feature | Description |
|---------|-------------|
| **📱 Dashboard** | Track all saved jobs with status (saved → processing → ready → applied). |
| **📝 Notes** | Personal notes per application (interview dates, contacts, etc). |
| **🔔 Notifications** | Real-time notifications for job matches and updates. |

### For HR/Recruiters

| Feature | Description |
|---------|-------------|
| **📋 HR Dashboard** | Post jobs, manage listings, review applications. |
| **📥 Applications** | View applicants, download resumes as PDF. |
| **🔔 Alerts** | Get notified when candidates apply. |

### UI/UX

| Feature | Description |
|---------|-------------|
| **🌙 Dark/Light Theme** | Toggle in navbar, persisted in localStorage. |
| **📱 Mobile Responsive** | Full responsive design — works on phone and desktop. |
| **🔔 Toast Notifications** | Success/error/info toasts across all actions. |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, Framer Motion, React Icons |
| **Backend** | FastAPI (Python 3.11), SQLAlchemy |
| **Database** | PostgreSQL 16 with pgvector |
| **AI** | Google Gemini 2.5 Flash |
| **Voice** | Web Speech API (Speech Recognition + Speech Synthesis) |
| **Resume** | LaTeX → PDF (pdflatex, Jake Ryan template) |
| **PDF Parse** | pdfplumber (pure Python) |
| **Infra** | Docker Compose (3 containers) |

---

## 📁 Project Structure

```
kansoai/
├── docker-compose.yml      # Container orchestration
├── .env.example            # Environment template
├── backend/
│   ├── main.py             # FastAPI app — models, routes, AI logic
│   ├── requirements.txt    # Python dependencies
│   ├── dockerfile          # Backend container
│   └── data/
│       └── jobs.json       # Sample job listings
├── frontend/
│   ├── public/
│   │   ├── index.html      # HTML template
│   │   └── logo.png        # KansoAI logo
│   ├── src/
│   │   ├── App.js          # Root component
│   │   ├── api.js          # Axios API client
│   │   └── components/
│   │       ├── Feed.js           # Swipe cards
│   │       ├── Dashboard.js      # Saved applications
│   │       ├── PrepPage.js       # Resume + chat + interview
│   │       ├── Profile.js        # User profile editor
│   │       ├── HRDashboard.js    # HR job management
│   │       ├── Login.js          # Authentication
│   │       ├── Navbar.js         # Navigation
│   │       └── AudioInterview.js # Voice interview
│   ├── package.json        # Node dependencies
│   └── dockerfile          # Frontend container
└── README.md
```

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

```env
# Required - Get your key at https://aistudio.google.com/app/apikey
GOOGLE_API_KEY=your-gemini-api-key

# Optional - Database credentials (defaults provided)
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=recruiter_db
```

---

## 🐳 Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Rebuild after code changes
docker-compose up --build -d

# Restart a specific service
docker-compose restart backend
```

---

## 🔜 Roadmap

- [ ] External job apply (redirect to original posting)
- [ ] Profile image upload
- [ ] Job recommendations based on skills
- [ ] Application analytics dashboard
- [ ] Email notifications
- [ ] ATS score checker

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

<p align="center">
  <strong>Built with ❤️ using React + FastAPI + Gemini + Docker</strong>
</p>
