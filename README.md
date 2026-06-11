# 🌍 Atlas — AI Tourist Place Recommender (Agentic AI)

An agentic AI travel app that recommends destinations by reasoning over your
**budget**, **travel season**, and **interests**. It runs a genuine multi-step
LangChain workflow on top of **Groq's free-tier LLaMA 3** and serves a polished,
conversational **React** frontend.

> **Stack:** Python · FastAPI · LangChain · Groq API (LLaMA 3.3 70B) · React + Vite + Tailwind

---

## ✨ What it does

- **112 destinations** across **6 continents** and **62 countries**, each with
  season, cost, and interest metadata.
- A **multi-step agentic workflow**:

  | Step | Type | What happens |
  |------|------|--------------|
  | 1. Intent extraction | LLM | Turns free text ("beach trip in December under $1,500") into a structured brief — budget (auto-converts INR/EUR/GBP → USD), month/season, interests, trip length. |
  | 2. Destination filtering | logic | Shortlists destinations matching season + region, with graceful relaxation so you always get results. |
  | 3. Cost estimation | logic | Estimates flights + on-the-ground spend for your trip length and flags in-budget vs. a stretch. |
  | 4. Seasonal ranking | logic | Weighted score across season fit, interest fit, and budget fit. |
  | 5. Recommendation | LLM | Writes a warm, grounded reply picking the top 3 — never invents places or numbers. |

- A **conversational UI** that streams the agent's reasoning steps and renders
  rich destination cards (photo, match %, cost breakdown, best months, matched
  interests), with multi-turn follow-up support.

---

## 🚀 Quick start (Windows / PowerShell)

### 1. Get a free Groq API key
Sign up at **https://console.groq.com/keys** and copy your key.

Open `backend/.env` and paste it in:
```
GROQ_API_KEY=gsk_your_real_key_here
```

### 2. Backend (FastAPI + LangChain + Groq)
```powershell
cd backend
py -3.12 -m venv venv
./venv/Scripts/Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Backend runs at `http://127.0.0.1:8000` (interactive docs at `/docs`).

### 3. Frontend (React + Vite)
In a second terminal:
```powershell
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173**. The Vite dev server proxies `/api` → the backend,
so no extra config is needed.

---

## 🔌 API

| Method | Route | Description |
|--------|-------|-------------|
| `GET`  | `/api/health` | Liveness + model + key status |
| `GET`  | `/api/meta`   | Dataset stats + interest tags |
| `POST` | `/api/recommend` | `{ message, history? }` → `{ reply, intent, trace, recommendations }` |

Example:
```bash
curl -X POST http://127.0.0.1:8000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"message":"10 days of culture and food in Europe in spring, mid budget"}'
```

---

## 🧠 Models

Groq retired the original `llama3-*` ids, so this project defaults to the current
free-tier LLaMA 3 family:
- **`llama-3.3-70b-versatile`** — reasoning + final recommendation
- **`llama-3.1-8b-instant`** — fast intent extraction

Override either via `backend/.env`:
```
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_FAST_MODEL=llama-3.1-8b-instant
```

## 📁 Structure
```
TreckGroq/
├── backend/
│   ├── main.py            # FastAPI app + endpoints
│   ├── agent.py           # 5-step LangChain agentic workflow
│   ├── destinations.py    # 112-destination dataset
│   ├── requirements.txt
│   └── .env               # your GROQ_API_KEY
└── frontend/
    └── src/
        ├── App.jsx        # chat layout + state
        ├── api.js         # API client
        ├── lib/format.js  # helpers (photos, markdown, gradients)
        └── components/    # Message, AgentSteps, DestinationCard, Composer
```
