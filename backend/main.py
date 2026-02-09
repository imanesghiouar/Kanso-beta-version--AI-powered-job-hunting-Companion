import os
import re
import json
import uuid
import logging
import asyncio
import subprocess
import tempfile
from pathlib import Path
from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException, Query, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy import create_engine, Column, String, Text, DateTime, func
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("kansoai")

# ── Database ────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    _u = os.getenv("POSTGRES_USER", "user")
    _p = os.getenv("POSTGRES_PASSWORD", "password")
    _d = os.getenv("POSTGRES_DB", "recruiter_db")
    DATABASE_URL = f"postgresql://{_u}:{_p}@db:5432/{_d}"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ── Models ──────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    role = Column(String, nullable=False, default="user")  # user | hr
    created_at = Column(DateTime, server_default=func.now())
    # Profile fields
    headline = Column(String, default="")
    bio = Column(Text, default="")
    phone = Column(String, default="")
    location = Column(String, default="")
    linkedin = Column(String, default="")
    github = Column(String, default="")
    portfolio = Column(String, default="")
    skills = Column(Text, default="[]")  # JSON array
    experience = Column(Text, default="")
    education = Column(Text, default="")
    resume_text = Column(Text, default="")  # plain text resume for AI
    profile_image = Column(Text, default="")  # base64 or URL
    # HR-specific fields
    company_name = Column(String, default="")
    company_role = Column(String, default="")  # e.g. "Senior Recruiter"
    company_desc = Column(Text, default="")


class Application(Base):
    __tablename__ = "applications"
    id = Column(String, primary_key=True)
    user_id = Column(String, index=True)
    job_id = Column(String)
    job_title = Column(String)
    description = Column(Text)
    tailored_resume = Column(Text, default="")
    status = Column(String, default="saved")  # saved | processing | ready | applied
    notes = Column(Text, default="")  # user's personal notes
    created_at = Column(DateTime, server_default=func.now())


class SwipedLeft(Base):
    __tablename__ = "swiped_left"
    id = Column(String, primary_key=True)
    user_id = Column(String, index=True)
    job_id = Column(String)


class HRJob(Base):
    """Jobs posted by HR users from within Kanso."""
    __tablename__ = "hr_jobs"
    id = Column(String, primary_key=True)
    posted_by = Column(String, index=True)  # user id of the HR
    company = Column(String)
    logo = Column(String, default="")
    title = Column(String)
    location = Column(String, default="")
    type = Column(String, default="Full-time")
    salary = Column(String, default="")
    summary = Column(Text, default="")
    description = Column(Text, default="")
    tags = Column(Text, default="[]")  # JSON array stored as text
    created_at = Column(DateTime, server_default=func.now())


class HRPersonality(Base):
    """HR personality profiles for AI-HR chat feature."""
    __tablename__ = "hr_personalities"
    id = Column(String, primary_key=True)
    company = Column(String, index=True)
    hr_name = Column(String)
    style = Column(Text)  # Personality description used as system prompt
    common_questions = Column(Text, default="[]")  # JSON array of typical questions
    tone = Column(String, default="professional")  # casual | professional | formal
    created_at = Column(DateTime, server_default=func.now())


class ChatMessage(Base):
    """Chat history for AI-HR conversations (per application)."""
    __tablename__ = "chat_messages"
    id = Column(String, primary_key=True)
    application_id = Column(String, index=True)
    role = Column(String)  # user | assistant
    content = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class InterviewFeedback(Base):
    """AI-generated feedback after a practice interview."""
    __tablename__ = "interview_feedback"
    id = Column(String, primary_key=True)
    application_id = Column(String, index=True)
    user_id = Column(String, index=True)
    score = Column(String, default="")           # e.g. "7/10"
    summary = Column(Text, default="")           # overall summary
    strengths = Column(Text, default="[]")       # JSON array
    improvements = Column(Text, default="[]")    # JSON array
    transcript = Column(Text, default="")        # interview transcript
    duration_seconds = Column(String, default="0")
    created_at = Column(DateTime, server_default=func.now())


class Notification(Base):
    """In-app notifications for users."""
    __tablename__ = "notifications"
    id = Column(String, primary_key=True)
    user_id = Column(String, index=True)
    title = Column(String)
    body = Column(Text, default="")
    link_page = Column(String, default="")  # page to navigate to: feed | dashboard | prep
    read = Column(String, default="false")  # "true" | "false"
    created_at = Column(DateTime, server_default=func.now())


Base.metadata.create_all(bind=engine)

# ── Auto-add new columns (dev convenience, no alembic needed) ─
def _safe_add_columns():
    """Add new columns if they don't exist — idempotent."""
    from sqlalchemy import inspect as sa_inspect, text
    insp = sa_inspect(engine)
    user_cols = {c["name"] for c in insp.get_columns("users")}
    new_user_cols = {
        "headline": "VARCHAR DEFAULT ''",
        "bio": "TEXT DEFAULT ''",
        "phone": "VARCHAR DEFAULT ''",
        "location": "VARCHAR DEFAULT ''",
        "linkedin": "VARCHAR DEFAULT ''",
        "github": "VARCHAR DEFAULT ''",
        "portfolio": "VARCHAR DEFAULT ''",
        "skills": "TEXT DEFAULT '[]'",
        "experience": "TEXT DEFAULT ''",
        "education": "TEXT DEFAULT ''",
        "resume_text": "TEXT DEFAULT ''",
        "profile_image": "TEXT DEFAULT ''",
        "company_name": "VARCHAR DEFAULT ''",
        "company_role": "VARCHAR DEFAULT ''",
        "company_desc": "TEXT DEFAULT ''",
    }
    with engine.begin() as conn:
        for col, typedef in new_user_cols.items():
            if col not in user_cols:
                conn.execute(text(f'ALTER TABLE users ADD COLUMN "{col}" {typedef}'))
                logger.info("Added column users.%s", col)
    # Application columns
    app_cols = {c["name"] for c in insp.get_columns("applications")}
    new_app_cols = {
        "notes": "TEXT DEFAULT ''",
    }
    with engine.begin() as conn:
        for col, typedef in new_app_cols.items():
            if col not in app_cols:
                conn.execute(text(f'ALTER TABLE applications ADD COLUMN "{col}" {typedef}'))
                logger.info("Added column applications.%s", col)

try:
    _safe_add_columns()
except Exception as e:
    logger.warning("Column migration skipped: %s", e)

# ── Seed HR Personalities (only once) ───────────────────────
def seed_hr_personalities():
    db = SessionLocal()
    try:
        if db.query(HRPersonality).count() > 0:
            return  # already seeded
        seeds = [
            HRPersonality(
                id="hr-google-01",
                company="Google",
                hr_name="Sarah Chen",
                style=(
                    "You are Sarah Chen, a senior technical recruiter at Google. "
                    "You are friendly but thorough. You care deeply about problem-solving ability, "
                    "system design thinking, and culture fit (Googleyness). You often ask behavioral "
                    "questions using the STAR method. You value clarity, curiosity, and humility. "
                    "You like to put candidates at ease before diving into harder questions."
                ),
                common_questions=json.dumps([
                    "Tell me about a time you solved a complex technical problem.",
                    "How do you approach system design for a new feature?",
                    "Describe a project where you had to collaborate across teams.",
                    "What does 'Googleyness' mean to you?",
                    "How do you handle ambiguity in requirements?",
                ]),
                tone="professional",
            ),
            HRPersonality(
                id="hr-spotify-01",
                company="Spotify",
                hr_name="Erik Lindström",
                style=(
                    "You are Erik Lindström, a talent partner at Spotify. "
                    "You are laid-back, creative, and passionate about music and tech. "
                    "You believe great engineers are curious and empathetic. You like to start "
                    "with casual conversation about interests before getting into technical depth. "
                    "You value diversity of thought and autonomous decision-making (Spotify's Band model)."
                ),
                common_questions=json.dumps([
                    "What side projects are you most proud of?",
                    "How do you stay updated with new technologies?",
                    "Tell me about a time you made a decision with incomplete data.",
                    "How would you improve Spotify's recommendation algorithm?",
                    "Describe your ideal team culture.",
                ]),
                tone="casual",
            ),
            HRPersonality(
                id="hr-stripe-01",
                company="Stripe",
                hr_name="Priya Mehta",
                style=(
                    "You are Priya Mehta, an engineering recruiter at Stripe. "
                    "You are precise, detail-oriented, and value correctness and reliability. "
                    "You focus on API design sense, testing philosophy, and how candidates think "
                    "about edge cases in distributed systems. You are warm but direct, and you "
                    "respect candidates who ask good clarifying questions."
                ),
                common_questions=json.dumps([
                    "Walk me through how you'd design an idempotent payment API.",
                    "How do you approach testing in a distributed system?",
                    "Tell me about a production incident you handled.",
                    "What's your philosophy on code reviews?",
                    "How do you balance shipping fast with shipping reliably?",
                ]),
                tone="professional",
            ),
        ]
        db.add_all(seeds)
        db.commit()
        logger.info("Seeded %d HR personalities", len(seeds))
    except Exception as e:
        db.rollback()
        logger.warning("HR personality seed skipped: %s", e)
    finally:
        db.close()


seed_hr_personalities()

# ── Fix stuck processing applications ───────────────────────
def _reset_stuck_processing():
    """Reset applications stuck in 'processing' with no resume to 'saved'."""
    db = SessionLocal()
    try:
        stuck = db.query(Application).filter(
            Application.status == "processing",
            ((Application.tailored_resume == "") | (Application.tailored_resume == None))
        ).all()
        for a in stuck:
            a.status = "saved"
        if stuck:
            db.commit()
            logger.info("Reset %d stuck processing apps to saved", len(stuck))
    except Exception as e:
        db.rollback()
        logger.warning("Stuck processing reset skipped: %s", e)
    finally:
        db.close()


try:
    _reset_stuck_processing()
except Exception:
    pass

# ── AI (lazy – app works even without a key) ────────────────
_llm = None


def get_llm():
    global _llm
    if _llm is None:
        api_key = os.getenv("GOOGLE_API_KEY", "")
        if not api_key:
            logger.warning("GOOGLE_API_KEY not set – AI features disabled")
            return None
        from langchain_google_genai import ChatGoogleGenerativeAI

        _llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=api_key,
            max_retries=3,
        )
    return _llm


async def _invoke_with_retry(llm, prompt_or_messages, retries=3):
    """Invoke the LLM with exponential backoff for 429 rate-limit errors."""
    for attempt in range(retries):
        try:
            return await llm.ainvoke(prompt_or_messages)
        except Exception as e:
            err_str = str(e).lower()
            if "429" in err_str or "resource exhausted" in err_str or "rate" in err_str:
                wait = 2 ** attempt  # 1s, 2s, 4s
                logger.warning("Rate limited (attempt %d/%d), waiting %ds…", attempt + 1, retries, wait)
                await asyncio.sleep(wait)
            else:
                raise  # non-rate-limit error → bubble up
    # Last attempt – let the exception propagate
    return await llm.ainvoke(prompt_or_messages)


# ── Jobs data ───────────────────────────────────────────────
DATA_DIR = Path(__file__).resolve().parent / "data"


def load_jobs():
    jobs_file = DATA_DIR / "jobs.json"
    if jobs_file.exists():
        return json.loads(jobs_file.read_text())
    return []


def _job_lookup(db: Session):
    """Build a dict of job_id → metadata from static + HR jobs."""
    all_jobs = {j["id"]: j for j in load_jobs()}
    for h in db.query(HRJob).all():
        all_jobs[h.id] = {
            "company": h.company, "logo": h.logo, "location": h.location,
            "salary": h.salary, "type": h.type,
            "tags": json.loads(h.tags) if h.tags else [],
            "source": "kanso",
        }
    for jid, jdata in all_jobs.items():
        if "source" not in jdata:
            jdata["source"] = "external"
    return all_jobs


# ── App ─────────────────────────────────────────────────────
app = FastAPI(title="KansoAI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Schemas ─────────────────────────────────────────────────
class SwipeRequest(BaseModel):
    user_id: str
    job_id: str
    job_title: str
    description: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    role: str = "user"  # user | hr


class LoginRequest(BaseModel):
    email: str


class PostJobRequest(BaseModel):
    user_id: str
    company: str
    logo: Optional[str] = ""
    title: str
    location: Optional[str] = ""
    type: Optional[str] = "Full-time"
    salary: Optional[str] = ""
    summary: Optional[str] = ""
    description: str
    tags: Optional[List[str]] = []


class ProfileUpdateRequest(BaseModel):
    headline: Optional[str] = ""
    bio: Optional[str] = ""
    phone: Optional[str] = ""
    location: Optional[str] = ""
    linkedin: Optional[str] = ""
    github: Optional[str] = ""
    portfolio: Optional[str] = ""
    skills: Optional[List[str]] = []
    experience: Optional[str] = ""
    education: Optional[str] = ""
    resume_text: Optional[str] = ""
    profile_image: Optional[str] = ""
    # HR-specific
    company_name: Optional[str] = ""
    company_role: Optional[str] = ""
    company_desc: Optional[str] = ""


class ChatRequest(BaseModel):
    application_id: str
    user_id: str
    message: str


# ── Auth Routes ─────────────────────────────────────────────
@app.post("/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    """Register with name + email. Role is user or hr."""
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        return {"id": existing.id, "name": existing.name, "email": existing.email, "role": existing.role}
    user = User(id=str(uuid.uuid4()), name=req.name, email=req.email, role=req.role)
    db.add(user)
    db.commit()
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


@app.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Login by email. Returns user data or 404."""
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="No account with that email. Please register first.")
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


# ── Profile Routes ──────────────────────────────────────────
@app.get("/profile/{user_id}")
def get_profile(user_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id, "name": user.name, "email": user.email, "role": user.role,
        "headline": user.headline or "",
        "bio": user.bio or "",
        "phone": user.phone or "",
        "location": user.location or "",
        "linkedin": user.linkedin or "",
        "github": user.github or "",
        "portfolio": user.portfolio or "",
        "skills": json.loads(user.skills) if user.skills else [],
        "experience": user.experience or "",
        "education": user.education or "",
        "resume_text": user.resume_text or "",
        "profile_image": user.profile_image or "",
        "company_name": user.company_name or "",
        "company_role": user.company_role or "",
        "company_desc": user.company_desc or "",
    }


@app.put("/profile/{user_id}")
def update_profile(user_id: str, req: ProfileUpdateRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.headline = req.headline or ""
    user.bio = req.bio or ""
    user.phone = req.phone or ""
    user.location = req.location or ""
    user.linkedin = req.linkedin or ""
    user.github = req.github or ""
    user.portfolio = req.portfolio or ""
    user.skills = json.dumps(req.skills or [])
    user.experience = req.experience or ""
    user.education = req.education or ""
    user.resume_text = req.resume_text or ""
    user.profile_image = req.profile_image or ""
    user.company_name = req.company_name or ""
    user.company_role = req.company_role or ""
    user.company_desc = req.company_desc or ""
    db.commit()
    return {"message": "Profile updated."}


# ── Pure-Python resume parser (no AI calls) ────────────────
def _parse_resume_text(raw: str) -> dict:
    """Parse resume/CV text into structured fields using regex heuristics."""
    result = {"headline": "", "bio": "", "skills": [], "experience": "", "education": ""}
    lines = raw.strip().split("\n")
    non_empty = [l.strip() for l in lines if l.strip()]
    if len(non_empty) >= 2:
        result["headline"] = non_empty[1]  # first line = name, second = title

    section_patterns = {
        "summary": r"(?i)^(summary|about|profile|objective|professional\s*summary)",
        "experience": r"(?i)^(experience|work\s*history|employment|professional\s*experience)",
        "education": r"(?i)^(education|academic|degrees|certifications?|qualifications?)",
        "skills": r"(?i)^(skills|technologies|technical\s*skills|competencies|expertise|tools)",
    }
    sections: dict[str, list[str]] = {"header": []}
    current = "header"
    for line in lines:
        s = line.strip()
        matched = None
        for sec, pat in section_patterns.items():
            if re.match(pat, s) and len(s) < 60:
                matched = sec
                break
        if matched:
            current = matched
            sections.setdefault(current, [])
        else:
            sections.setdefault(current, []).append(s)

    for key in sections:
        sections[key] = "\n".join(sections[key]).strip()

    if "summary" in sections and sections["summary"]:
        result["bio"] = sections["summary"]
    if "experience" in sections and sections["experience"]:
        result["experience"] = sections["experience"]
    if "education" in sections and sections["education"]:
        result["education"] = sections["education"]
    if "skills" in sections and sections["skills"]:
        raw_skills = re.split(r"[,•·|;\n]+", sections["skills"])
        result["skills"] = [s.strip() for s in raw_skills if s.strip() and len(s.strip()) < 50]
    return result


@app.post("/parse-linkedin")
async def parse_linkedin(file: UploadFile = File(...)):
    """Parse uploaded LinkedIn PDF CV using pdfplumber (pure Python, no AI calls)."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")

    import pdfplumber, io
    pdf_bytes = await file.read()
    extracted = ""
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    extracted += text + "\n"
    except Exception as e:
        logger.error("PDF extraction error: %s", e)
        raise HTTPException(status_code=400, detail="Could not read the PDF. Make sure it's a valid PDF file.")

    if not extracted.strip():
        raise HTTPException(status_code=400, detail="No text found in the PDF. The file may be image-based.")

    return _parse_resume_text(extracted)


# ── Routes ──────────────────────────────────────────────────
@app.get("/")
def read_root():
    return {"status": "KansoAI Engine Running"}


@app.get("/jobs/{user_id}")
def get_jobs(user_id: str, db: Session = Depends(get_db)):
    """Return jobs the user hasn't swiped on yet. Merges static + HR-posted."""
    static_jobs = load_jobs()
    for j in static_jobs:
        if "source" not in j:
            j["source"] = "external"

    hr_jobs_db = db.query(HRJob).all()
    hr_jobs = [
        {
            "id": h.id,
            "company": h.company,
            "logo": h.logo,
            "title": h.title,
            "location": h.location,
            "type": h.type,
            "salary": h.salary,
            "summary": h.summary,
            "description": h.description,
            "tags": json.loads(h.tags) if h.tags else [],
            "source": "kanso",
            "posted_by": h.posted_by,
        }
        for h in hr_jobs_db
    ]

    all_jobs = static_jobs + hr_jobs

    swiped_right_ids = {
        a.job_id for a in db.query(Application).filter(Application.user_id == user_id).all()
    }
    swiped_left_ids = {
        s.job_id for s in db.query(SwipedLeft).filter(SwipedLeft.user_id == user_id).all()
    }
    seen = swiped_right_ids | swiped_left_ids

    return [j for j in all_jobs if j["id"] not in seen]


@app.post("/swipe-right")
async def handle_swipe_right(
    swipe: SwipeRequest,
    db: Session = Depends(get_db),
):
    """User liked a job → save it. Resume generation is triggered separately."""
    application = Application(
        id=str(uuid.uuid4()),
        user_id=swipe.user_id,
        job_id=swipe.job_id,
        job_title=swipe.job_title,
        description=swipe.description,
    )
    db.add(application)
    db.commit()
    return {"message": "Job saved!", "job": swipe.job_title}


@app.post("/generate-resume/{app_id}")
async def generate_resume(
    app_id: str,
    background_tasks: BackgroundTasks,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """User-triggered resume generation."""
    application = db.query(Application).filter(Application.id == app_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    if application.status == "processing" and application.tailored_resume:
        return {"message": "Resume is already being generated."}

    llm = get_llm()
    if not llm:
        raise HTTPException(status_code=503, detail="AI not available – API key not configured.")

    application.status = "processing"
    db.commit()

    user = db.query(User).filter(User.id == user_id).first()
    user_data = {}
    if user:
        user_data = {
            "name": user.name or "",
            "email": user.email or "",
            "phone": user.phone or "",
            "location": user.location or "",
            "linkedin": user.linkedin or "",
            "github": user.github or "",
            "headline": user.headline or "",
            "skills": json.loads(user.skills) if user.skills else [],
            "experience": user.experience or "",
            "education": user.education or "",
            "resume_text": user.resume_text or "",
        }

    background_tasks.add_task(
        tailor_resume, app_id, application.job_title, application.description, user_data
    )
    return {"message": "Resume generation started."}


@app.post("/swipe-left")
async def handle_swipe_left(swipe: SwipeRequest, db: Session = Depends(get_db)):
    entry = SwipedLeft(id=str(uuid.uuid4()), user_id=swipe.user_id, job_id=swipe.job_id)
    db.add(entry)
    db.commit()
    return {"message": "Job dismissed."}


@app.get("/dashboard/{user_id}")
def get_dashboard(user_id: str, db: Session = Depends(get_db)):
    all_jobs = _job_lookup(db)
    apps = db.query(Application).filter(Application.user_id == user_id).order_by(Application.created_at.desc()).all()
    return [
        {
            "id": a.id,
            "job_id": a.job_id,
            "job_title": a.job_title,
            "description": a.description,
            "status": a.status,
            "tailored_resume": a.tailored_resume,
            "created_at": str(a.created_at) if a.created_at else None,
            "company": all_jobs.get(a.job_id, {}).get("company", ""),
            "logo": all_jobs.get(a.job_id, {}).get("logo", ""),
            "location": all_jobs.get(a.job_id, {}).get("location", ""),
            "salary": all_jobs.get(a.job_id, {}).get("salary", ""),
            "type": all_jobs.get(a.job_id, {}).get("type", ""),
            "tags": all_jobs.get(a.job_id, {}).get("tags", []),
            "source": all_jobs.get(a.job_id, {}).get("source", "external"),
        }
        for a in apps
    ]


@app.get("/application/{app_id}")
def get_application(app_id: str, db: Session = Depends(get_db)):
    all_jobs = _job_lookup(db)
    application = db.query(Application).filter(Application.id == app_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    job_data = all_jobs.get(application.job_id, {})
    return {
        "id": application.id,
        "job_id": application.job_id,
        "job_title": application.job_title,
        "description": application.description,
        "tailored_resume": application.tailored_resume,
        "status": application.status,
        "company": job_data.get("company", ""),
        "logo": job_data.get("logo", ""),
        "location": job_data.get("location", ""),
        "salary": job_data.get("salary", ""),
        "tags": job_data.get("tags", []),
        "source": job_data.get("source", "external"),
    }


@app.delete("/application/{app_id}")
def delete_application(app_id: str, db: Session = Depends(get_db)):
    application = db.query(Application).filter(Application.id == app_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    # Also delete related chat messages
    db.query(ChatMessage).filter(ChatMessage.application_id == app_id).delete()
    db.delete(application)
    db.commit()
    return {"message": "Application removed."}


@app.patch("/application/{app_id}/status")
def update_application_status(app_id: str, status: str = Query(...), db: Session = Depends(get_db)):
    application = db.query(Application).filter(Application.id == app_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    if status not in ("saved", "processing", "ready", "applied"):
        raise HTTPException(status_code=400, detail="Invalid status")
    application.status = status
    db.commit()
    return {"message": f"Status updated to {status}."}


# ── AI-HR Chat ──────────────────────────────────────────────
@app.get("/hr-personalities/{company}")
def get_hr_personality(company: str, db: Session = Depends(get_db)):
    """Get HR personality for a company (case-insensitive partial match)."""
    p = db.query(HRPersonality).filter(
        HRPersonality.company.ilike(f"%{company}%")
    ).first()
    if not p:
        return None
    return {
        "id": p.id, "company": p.company, "hr_name": p.hr_name,
        "tone": p.tone,
        "common_questions": json.loads(p.common_questions) if p.common_questions else [],
    }


@app.get("/chat/{application_id}")
def get_chat_history(application_id: str, db: Session = Depends(get_db)):
    """Return chat messages for an application, ordered chronologically."""
    msgs = db.query(ChatMessage).filter(
        ChatMessage.application_id == application_id
    ).order_by(ChatMessage.created_at.asc()).all()
    return [
        {"id": m.id, "role": m.role, "content": m.content,
         "created_at": str(m.created_at) if m.created_at else None}
        for m in msgs
    ]


@app.post("/chat")
async def chat_with_hr(req: ChatRequest, db: Session = Depends(get_db)):
    """Send a message to AI-HR and get a response. Uses HR personality if available."""
    llm = get_llm()
    if not llm:
        raise HTTPException(status_code=503, detail="AI not available – API key not configured.")

    # Get the application context
    application = db.query(Application).filter(Application.id == req.application_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    # Look up company from job data
    all_jobs = _job_lookup(db)
    job_data = all_jobs.get(application.job_id, {})
    company = job_data.get("company", "")

    # Try to find an HR personality for this company
    personality = db.query(HRPersonality).filter(
        HRPersonality.company.ilike(f"%{company}%")
    ).first() if company else None

    # Build system prompt
    if personality:
        system = (
            f"{personality.style}\n\n"
            f"You are conducting an informational / pre-interview chat with a candidate "
            f"who applied for the '{application.job_title}' role at {company}.\n"
            f"Job description:\n{application.description[:800]}\n\n"
            f"Keep answers concise (under 150 words). Stay in character at all times."
        )
    else:
        system = (
            f"You are a helpful AI recruiter representing {company or 'the hiring company'}. "
            f"The candidate applied for '{application.job_title}'.\n"
            f"Job description:\n{application.description[:800]}\n\n"
            f"Be professional, warm, and concise (under 150 words). "
            f"Answer questions about the role, share interview tips, and ask follow-up questions."
        )

    # Load recent chat history (last 10 messages to keep context small)
    history = db.query(ChatMessage).filter(
        ChatMessage.application_id == req.application_id
    ).order_by(ChatMessage.created_at.desc()).limit(10).all()
    history.reverse()

    # Build message list for LLM
    from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
    messages = [SystemMessage(content=system)]
    for m in history:
        if m.role == "user":
            messages.append(HumanMessage(content=m.content))
        else:
            messages.append(AIMessage(content=m.content))
    messages.append(HumanMessage(content=req.message))

    # Save user message
    user_msg = ChatMessage(
        id=str(uuid.uuid4()),
        application_id=req.application_id,
        role="user",
        content=req.message,
    )
    db.add(user_msg)
    db.commit()

    # Call Gemini (with retry for rate limits)
    try:
        response = await _invoke_with_retry(llm, messages)
        reply = response.content
    except Exception as e:
        logger.error("Gemini chat error: %s", e)
        reply = "I'm having trouble connecting right now. Please try again in a moment."

    # Save assistant message
    ai_msg = ChatMessage(
        id=str(uuid.uuid4()),
        application_id=req.application_id,
        role="assistant",
        content=reply,
    )
    db.add(ai_msg)
    db.commit()

    return {
        "reply": reply,
        "hr_name": personality.hr_name if personality else "KansoAI Recruiter",
        "company": company,
    }


# ── Background Tasks ────────────────────────────────────────
LATEX_TEMPLATE = r"""
\documentclass[letterpaper,11pt]{article}
\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\input{glyphtounicode}
\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}
\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}
\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}
\titleformat{\section}{\vspace{-4pt}\scshape\raggedright\large}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]
\pdfgentounicode=1
\newcommand{\resumeItem}[1]{\item\small{{#1 \vspace{-2pt}}}}
\newcommand{\resumeSubheading}[4]{\vspace{-2pt}\item\begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}\textbf{#1} & #2 \\\textit{\small#3} & \textit{\small #4} \\\end{tabular*}\vspace{-7pt}}
\newcommand{\resumeProjectHeading}[2]{\item\begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}\small#1 & #2 \\\end{tabular*}\vspace{-7pt}}
\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}
\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}
\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}
\begin{document}
%% CONTENT_PLACEHOLDER
\end{document}
"""


async def tailor_resume(app_id: str, job_title: str, description: str, user_data: dict = None):
    """Call Gemini to produce a LaTeX resume using the Jake Ryan template."""
    llm = get_llm()
    if not llm:
        return

    ud = user_data or {}
    name = ud.get("name", "Your Name")
    email = ud.get("email", "")
    phone = ud.get("phone", "")
    location = ud.get("location", "")
    linkedin = ud.get("linkedin", "")
    github = ud.get("github", "")
    skills = ud.get("skills", [])
    experience = ud.get("experience", "")
    education = ud.get("education", "")
    resume_text = ud.get("resume_text", "")

    prompt = (
        "You are an expert resume writer. You MUST output ONLY the LaTeX body content "
        "(everything between \\begin{document} and \\end{document}) for a professional "
        "resume using the Jake Ryan LaTeX template commands provided below.\n\n"
        "AVAILABLE COMMANDS:\n"
        "- \\resumeSubheading{Title}{Dates}{Subtitle}{Location}\n"
        "- \\resumeItem{Description text}\n"
        "- \\resumeProjectHeading{\\textbf{Name} $|$ \\emph{Tech stack}}{Dates}\n"
        "- \\resumeSubHeadingListStart / \\resumeSubHeadingListEnd\n"
        "- \\resumeItemListStart / \\resumeItemListEnd\n"
        "- \\section{Section Name}\n\n"
        f"CANDIDATE INFO:\n"
        f"- Name: {name}\n"
        f"- Email: {email}\n"
        f"- Phone: {phone}\n"
        f"- Location: {location}\n"
        f"- LinkedIn: {linkedin}\n"
        f"- GitHub: {github}\n"
        f"- Skills: {', '.join(skills) if skills else 'Not specified'}\n"
        f"- Education: {education[:800] if education else 'Not specified'}\n"
        f"- Experience: {experience[:1200] if experience else 'Not specified'}\n"
    )
    if resume_text:
        prompt += f"- Existing Resume Text: {resume_text[:1500]}\n"

    prompt += (
        f"\nTARGET JOB: {job_title}\n"
        f"JOB DESCRIPTION:\n{description[:2000]}\n\n"
        "INSTRUCTIONS:\n"
        "1. Start with a centered heading block: name, phone, email, linkedin, github.\n"
        "2. Include sections: Education, Experience, Projects (if relevant), Technical Skills.\n"
        "3. TAILOR bullet points to emphasize skills/experience relevant to the job.\n"
        "4. Use strong action verbs and quantify achievements where possible.\n"
        "5. Keep it to ONE page of content.\n"
        "6. Escape special LaTeX characters: & → \\&, % → \\%, # → \\#, $ (in text) → \\$.\n"
        "7. Return ONLY the LaTeX body content (no \\documentclass, no preamble, "
        "no \\begin{document}/\\end{document}). Start directly with \\begin{center}.\n"
        "8. Do NOT wrap in markdown code fences."
    )

    try:
        response = await _invoke_with_retry(llm, prompt)
        content = response.content.strip()
        # Strip markdown fences if present
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        # Strip any \begin{document}/\end{document} if Gemini added them
        content = content.replace("\\begin{document}", "").replace("\\end{document}", "").strip()
    except Exception as e:
        logger.error("Resume tailor error: %s", e)
        content = ""

    if not content:
        return

    # Assemble full LaTeX document
    full_latex = LATEX_TEMPLATE.replace("%% CONTENT_PLACEHOLDER", content)

    db = SessionLocal()
    try:
        application = db.query(Application).filter(Application.id == app_id).first()
        if application:
            application.tailored_resume = full_latex
            application.status = "ready"
            db.commit()
    finally:
        db.close()


# ── Notes ───────────────────────────────────────────────────
@app.put("/application/{app_id}/notes")
def update_notes(app_id: str, body: dict, db: Session = Depends(get_db)):
    app = db.query(Application).filter(Application.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    app.notes = body.get("notes", "")
    db.commit()
    return {"message": "Notes saved."}


# ── Apply ───────────────────────────────────────────────────
@app.post("/application/{app_id}/apply")
def mark_applied(app_id: str, db: Session = Depends(get_db)):
    """Apply to a job. For Kanso (internal) jobs, notifies the HR who posted it."""
    application = db.query(Application).filter(Application.id == app_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    application.status = "applied"

    # Check if this is a Kanso (internal) job → notify the HR
    hr_job = db.query(HRJob).filter(HRJob.id == application.job_id).first()
    is_internal = hr_job is not None
    if hr_job:
        applicant = db.query(User).filter(User.id == application.user_id).first()
        applicant_name = applicant.name if applicant else "Someone"
        notif = Notification(
            id=str(uuid.uuid4()),
            user_id=hr_job.posted_by,
            title=f"New applicant: {applicant_name}",
            body=f"{applicant_name} applied for your \"{application.job_title}\" role at {hr_job.company}. Check your Applications tab to review.",
            link_page="hr",
            read="false",
        )
        db.add(notif)
    db.commit()
    return {"message": "Application submitted! 🎉" if is_internal else "Application marked as applied! 🎉", "is_internal": is_internal}


# ── Resume PDF ──────────────────────────────────────────────
@app.get("/application/{app_id}/resume-pdf")
def get_resume_pdf(app_id: str, db: Session = Depends(get_db)):
    """Compile LaTeX resume to PDF and return it."""
    application = db.query(Application).filter(Application.id == app_id).first()
    if not application or not application.tailored_resume:
        raise HTTPException(status_code=404, detail="No resume found")

    latex = application.tailored_resume
    if "\\documentclass" not in latex:
        raise HTTPException(status_code=400, detail="Resume is not in LaTeX format")

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = os.path.join(tmpdir, "resume.tex")
        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(latex)

        # Run pdflatex twice (for references / table of contents)
        for _ in range(2):
            result = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode",
                 "-output-directory", tmpdir, tex_path],
                capture_output=True, timeout=60,
            )

        pdf_path = os.path.join(tmpdir, "resume.pdf")
        if not os.path.exists(pdf_path):
            # Return compilation log for debugging
            log = result.stdout.decode(errors="replace")[-2000:]
            logger.error("pdflatex failed:\n%s", log)
            raise HTTPException(status_code=500, detail="PDF compilation failed. LaTeX may have errors.")

        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="resume-{app_id[:8]}.pdf"'},
    )


# ── HR Applications ─────────────────────────────────────────
@app.get("/hr/applications/{user_id}")
def hr_get_applications(user_id: str, db: Session = Depends(get_db)):
    """Get all applications submitted to jobs posted by this HR user."""
    hr_jobs = db.query(HRJob).filter(HRJob.posted_by == user_id).all()
    job_map = {j.id: j for j in hr_jobs}
    if not job_map:
        return []

    apps = db.query(Application).filter(
        Application.job_id.in_(job_map.keys()),
        Application.status == "applied",
    ).order_by(Application.created_at.desc()).all()

    result = []
    for a in apps:
        job = job_map.get(a.job_id)
        applicant = db.query(User).filter(User.id == a.user_id).first()
        result.append({
            "id": a.id,
            "job_title": a.job_title,
            "job_id": a.job_id,
            "applicant_name": applicant.name if applicant else "Unknown",
            "applicant_email": applicant.email if applicant else "",
            "applicant_headline": (applicant.headline or "") if applicant else "",
            "applicant_skills": json.loads(applicant.skills) if applicant and applicant.skills else [],
            "has_resume": bool(a.tailored_resume),
            "resume_app_id": a.id if a.tailored_resume else None,
            "applied_at": str(a.created_at) if a.created_at else None,
            "company": job.company if job else "",
        })
    return result


# ── Interview Feedback ──────────────────────────────────────
class FeedbackRequest(BaseModel):
    application_id: str
    user_id: str
    transcript: str = ""
    duration_seconds: int = 0


@app.post("/interview/feedback")
async def generate_interview_feedback(req: FeedbackRequest, db: Session = Depends(get_db)):
    """Generate AI feedback from an interview transcript."""
    llm = get_llm()
    if not llm or not req.transcript.strip():
        # No AI or no transcript — save minimal record
        fb = InterviewFeedback(
            id=str(uuid.uuid4()),
            application_id=req.application_id,
            user_id=req.user_id,
            transcript=req.transcript,
            duration_seconds=str(req.duration_seconds),
            summary="Interview completed. No transcript available for AI feedback.",
            score="N/A",
        )
        db.add(fb)
        db.commit()
        return {"id": fb.id, "score": fb.score, "summary": fb.summary,
                "strengths": [], "improvements": [], "transcript": fb.transcript,
                "duration_seconds": fb.duration_seconds}

    # Get application context
    application = db.query(Application).filter(Application.id == req.application_id).first()
    job_title = application.job_title if application else "the role"

    prompt = (
        f"You are an expert interview coach. Analyze this practice interview for a '{job_title}' role.\n\n"
        f"TRANSCRIPT:\n{req.transcript[:3000]}\n\n"
        "Return ONLY a valid JSON object with these fields:\n"
        '- "score" (string): Rating out of 10, e.g. "7/10"\n'
        '- "summary" (string): 2-3 sentence overall assessment\n'
        '- "strengths" (array of strings): 3-4 specific things the candidate did well\n'
        '- "improvements" (array of strings): 3-4 specific areas to improve\n'
        "Return ONLY the JSON, no markdown fences."
    )
    try:
        response = await _invoke_with_retry(llm, prompt)
        text = response.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
        data = json.loads(text)
    except Exception as e:
        logger.error("Feedback generation error: %s", e)
        data = {"score": "N/A", "summary": "Could not generate feedback.", "strengths": [], "improvements": []}

    fb = InterviewFeedback(
        id=str(uuid.uuid4()),
        application_id=req.application_id,
        user_id=req.user_id,
        score=data.get("score", "N/A"),
        summary=data.get("summary", ""),
        strengths=json.dumps(data.get("strengths", [])),
        improvements=json.dumps(data.get("improvements", [])),
        transcript=req.transcript,
        duration_seconds=str(req.duration_seconds),
    )
    db.add(fb)
    db.commit()

    return {
        "id": fb.id,
        "score": fb.score,
        "summary": fb.summary,
        "strengths": data.get("strengths", []),
        "improvements": data.get("improvements", []),
        "transcript": fb.transcript,
        "duration_seconds": fb.duration_seconds,
    }


@app.get("/interview/feedback/{application_id}")
def get_interview_feedback(application_id: str, db: Session = Depends(get_db)):
    """Get all interview feedback for an application."""
    feedbacks = db.query(InterviewFeedback).filter(
        InterviewFeedback.application_id == application_id
    ).order_by(InterviewFeedback.created_at.desc()).all()
    return [
        {
            "id": f.id, "score": f.score, "summary": f.summary,
            "strengths": json.loads(f.strengths) if f.strengths else [],
            "improvements": json.loads(f.improvements) if f.improvements else [],
            "transcript": f.transcript,
            "duration_seconds": f.duration_seconds,
            "created_at": str(f.created_at) if f.created_at else None,
        }
        for f in feedbacks
    ]


# ── Notifications ───────────────────────────────────────────
@app.get("/notifications/{user_id}")
def get_notifications(user_id: str, db: Session = Depends(get_db)):
    notes = db.query(Notification).filter(
        Notification.user_id == user_id
    ).order_by(Notification.created_at.desc()).limit(50).all()
    return [
        {
            "id": n.id, "title": n.title, "body": n.body,
            "link_page": n.link_page, "read": n.read == "true",
            "created_at": str(n.created_at) if n.created_at else None,
        }
        for n in notes
    ]


@app.patch("/notifications/{notif_id}/read")
def mark_notification_read(notif_id: str, db: Session = Depends(get_db)):
    n = db.query(Notification).filter(Notification.id == notif_id).first()
    if n:
        n.read = "true"
        db.commit()
    return {"message": "ok"}


@app.post("/notifications/read-all/{user_id}")
def mark_all_read(user_id: str, db: Session = Depends(get_db)):
    db.query(Notification).filter(
        Notification.user_id == user_id, Notification.read == "false"
    ).update({"read": "true"})
    db.commit()
    return {"message": "All marked as read."}


# ── HR Routes ───────────────────────────────────────────────
@app.post("/hr/post-job")
def hr_post_job(req: PostJobRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user or user.role != "hr":
        raise HTTPException(status_code=403, detail="Only HR accounts can post jobs.")
    job = HRJob(
        id=f"kanso-{uuid.uuid4().hex[:8]}",
        posted_by=req.user_id,
        company=req.company,
        logo=req.logo or "",
        title=req.title,
        location=req.location or "",
        type=req.type or "Full-time",
        salary=req.salary or "",
        summary=req.summary or "",
        description=req.description,
        tags=json.dumps(req.tags or []),
    )
    db.add(job)
    db.commit()

    # ── Notify matching seekers ──
    job_tags = set(t.lower() for t in (req.tags or []))
    if job_tags:
        seekers = db.query(User).filter(User.role == "seeker").all()
        for seeker in seekers:
            try:
                user_skills = set(s.lower() for s in json.loads(seeker.skills or "[]"))
            except Exception:
                user_skills = set()
            overlap = job_tags & user_skills
            if overlap:
                notif = Notification(
                    id=str(uuid.uuid4()),
                    user_id=seeker.id,
                    title=f"New job match: {req.title}",
                    body=f"{req.company} posted a {req.title} role matching your skills ({', '.join(list(overlap)[:3])}).",
                    link_page="feed",
                    read="false",
                )
                db.add(notif)
        db.commit()

    return {"message": "Job posted!", "job_id": job.id}


@app.get("/hr/my-jobs/{user_id}")
def hr_my_jobs(user_id: str, db: Session = Depends(get_db)):
    jobs = db.query(HRJob).filter(HRJob.posted_by == user_id).order_by(HRJob.created_at.desc()).all()
    return [
        {
            "id": j.id,
            "company": j.company,
            "logo": j.logo,
            "title": j.title,
            "location": j.location,
            "type": j.type,
            "salary": j.salary,
            "summary": j.summary,
            "description": j.description,
            "tags": json.loads(j.tags) if j.tags else [],
            "created_at": str(j.created_at) if j.created_at else None,
        }
        for j in jobs
    ]


@app.delete("/hr/job/{job_id}")
def hr_delete_job(job_id: str, user_id: str = Query(...), db: Session = Depends(get_db)):
    job = db.query(HRJob).filter(HRJob.id == job_id, HRJob.posted_by == user_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or you don't own it.")
    db.delete(job)
    db.commit()
    return {"message": "Job removed."}


# ── Live Audio Interview (Gemini API + Text-based) ──────────────────
# This uses Gemini API with text messages (free solution)
@app.websocket("/ws/interview/{application_id}")
async def interview_websocket(websocket: WebSocket, application_id: str):
    await websocket.accept()
    try:
        # 1. Receive init payload with job context
        init_data = await websocket.receive_json()
        job_title = init_data.get("job_title", "this role")
        company = init_data.get("company", "the company")
        description = init_data.get("description", "")[:800]

        # 2. Try to load HR personality from DB
        db = SessionLocal()
        personality = None
        try:
            if company:
                personality = db.query(HRPersonality).filter(
                    HRPersonality.company.ilike(f"%{company}%")
                ).first()
        finally:
            db.close()

        # 3. Build system instruction
        if personality:
            sys_instr = (
                f"{personality.style}\n\n"
                f"You are conducting a live practice interview with a candidate "
                f"for the '{job_title}' role at {company}.\n"
                f"Job description:\n{description}\n\n"
            )
        else:
            sys_instr = (
                f"You are a professional HR interviewer at {company}. "
                f"You are conducting a live practice interview for the '{job_title}' role.\n"
                f"Job description:\n{description}\n\n"
            )
        sys_instr += (
            "Guidelines:\n"
            "- Greet the candidate warmly (do NOT introduce yourself with a name)\n"
            "- Ask behavioral and technical questions relevant to the role\n"
            "- Give brief, encouraging feedback on answers\n"
            "- Keep your responses concise (under 30 seconds of speech)\n"
            "- Be professional but friendly\n"
            "- After 4-5 questions, wrap up with closing remarks and feedback"
        )

        # 4. Initialize Gemini text-based conversation using langchain
        from langchain_google_genai import ChatGoogleGenerativeAI
        from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
        
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=os.getenv("GOOGLE_API_KEY"),
            max_retries=3,
        )
        
        # Start conversation with system prompt
        conversation_history = [SystemMessage(content=sys_instr)]
        question_count = [0]  # Track number of questions asked
        
        await websocket.send_json({"type": "connected"})

        async def handle_user_message():
            """Receive transcribed text from browser and send to Gemini."""
            try:
                while True:
                    msg = await websocket.receive_json()
                    if msg.get("type") == "user_transcript":
                        user_text = msg.get("transcript", "").strip()
                        if not user_text:
                            continue
                        
                        # Add user message to history
                        conversation_history.append(HumanMessage(content=user_text))
                        
                        # Get AI response from Gemini
                        try:
                            response = await llm.ainvoke(conversation_history)
                            ai_response = response.content.strip()
                            question_count[0] += 1
                            
                            # Add AI response to history
                            conversation_history.append(AIMessage(content=ai_response))
                            
                            # Send response back to browser (text)
                            await websocket.send_json({
                                "type": "ai_response",
                                "text": ai_response,
                                "turn_complete": True
                            })
                            
                            # End interview after 5 questions
                            if question_count[0] >= 5:
                                # Get closing remarks from AI
                                conversation_history.append(HumanMessage(content="The interview is now complete. Please thank the candidate, give brief overall feedback on their performance, and say goodbye."))
                                closing_response = await llm.ainvoke(conversation_history)
                                closing_text = closing_response.content.strip()
                                
                                await websocket.send_json({
                                    "type": "ai_response",
                                    "text": closing_text,
                                    "turn_complete": True
                                })
                                
                                await websocket.send_json({
                                    "type": "interview_end",
                                    "message": "Interview complete."
                                })
                        except Exception as e:
                            logger.error("Gemini error: %s", e)
                            await websocket.send_json({
                                "type": "error",
                                "message": "Failed to get response from AI interviewer."
                            })
            except (WebSocketDisconnect, Exception) as e:
                if not isinstance(e, WebSocketDisconnect):
                    logger.error("handle_user_message error: %s", e)

        # Send initial greeting
        try:
            conversation_history.append(HumanMessage(content="Start the interview with a warm greeting. Do not introduce yourself with a name, just say hello and welcome the candidate, then ask the first interview question."))
            greeting_response = await llm.ainvoke(conversation_history)
            greeting_text = greeting_response.content.strip()
            conversation_history.append(AIMessage(content=greeting_text))
            question_count[0] += 1
            
            await websocket.send_json({
                "type": "ai_response",
                "text": greeting_text,
                "turn_complete": True
            })
        except Exception as e:
            logger.error("Greeting error: %s", e)
        
        # Handle incoming user messages
        await handle_user_message()

    except WebSocketDisconnect:
        logger.info("Interview WS disconnected: %s", application_id)
    except Exception as e:
        logger.error("Interview WS error: %s", e)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass