# Modular Intelligence Platform

A production-grade multi-tenant SaaS platform that powers 14 automated intelligence modules through a single unified dashboard. One codebase, one database, one auth system — each product is a module that can be toggled on or off.

## Architecture

```
┌─────────────────────────────────────────────┐
│            Next.js 14 Dashboard             │
│  (React · TypeScript · Tailwind · Recharts) │
└──────────────────┬──────────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────────┐
│              FastAPI Backend                 │
│  (Python 3.11 · SQLAlchemy · APScheduler)   │
├─────────────────────────────────────────────┤
│  Module Registry → 14 pluggable modules     │
│  Job Runner → Celery + Redis queue          │
│  Scraper Engine → Playwright (async)        │
│  LLM Pipeline → Anthropic Claude            │
│  Alert Delivery → Resend email + webhooks   │
└──────┬──────────────┬────────────┬──────────┘
       │              │            │
  Supabase         Redis        R2/S3
  (Postgres +    (Job Queue    (Files:
  pgvector +     + Cache)      audio/pdf/
  Auth + RLS)                  video)
```

## The 14 Modules

### Cluster A — B2B Intelligence
| Module | Description | Plan |
|--------|-------------|------|
| Startup Signal Tracker | Funding, hiring surges, exec changes across DACH | Free |
| VC Portfolio Tracker | New portfolio additions, exits, follow-on rounds | Free |
| Founder Movement Tracker | Role changes, new ventures, stealth signals | Free |
| Grant & Funding Tracker | EU/BMBF/EXIST grants matched to your company profile | Free |
| Price Drop Intelligence | SaaS pricing page change detection | Pro |
| Clinical Trial Tracker | ClinicalTrials.gov phase transitions & new registrations | Pro |
| Real Estate Signal Tool | Immobilienscout24/Immowelt price trends & supply/demand | Pro |

### Cluster B — Consumer Data
| Module | Description | Plan |
|--------|-------------|------|
| Salary Intelligence | DACH tech salary percentiles by role/city (community data) | Free |
| Researcher Second Brain | PDF/arXiv ingestion, LLM extraction, semantic search | Free |

### Cluster C — Health & Performance
| Module | Description | Plan |
|--------|-------------|------|
| Voice Biomarker Tracker | Daily voice recording → fatigue/stress/mood scores | Pro |
| Stress & Recovery Scorer | Phone usage patterns → cognitive load score | Pro |
| Nap Optimizer | Circadian model → optimal nap window recommendation | Free |
| Chronotype Planner | Sleep log analysis → optimized daily schedule | Pro |

### Cluster D — Sports
| Module | Description | Plan |
|--------|-------------|------|
| Fencing Analytics | Bout stats, touch ratios, training load, opponent profiles | Free |

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local frontend dev)
- Python 3.11+ (for local backend dev)

### 1. Clone & configure

```bash
git clone <repo> modular-intelligence-platform
cd modular-intelligence-platform
cp .env.example .env
# Edit .env with your API keys
```

### 2. Supabase setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Copy your Project URL and Service Role key into `.env`
3. Run the migration:

```bash
# Option A: Supabase CLI
supabase db push

# Option B: Paste supabase/migrations/001_initial_schema.sql
# directly in the Supabase SQL Editor
```

4. Enable the `vector` extension in Supabase Dashboard → Database → Extensions

### 3. Start with Docker Compose

```bash
docker compose up --build
```

This starts:
- `mip-api` → FastAPI backend at http://localhost:8000
- `mip-worker` → Celery worker (processes scraping/LLM jobs)
- `mip-beat` → Celery beat (cron scheduler)
- `mip-redis` → Redis at localhost:6379
- `mip-frontend` → Next.js dev server at http://localhost:3000

### 4. Local development (without Docker)

**Backend:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium

# Start API
uvicorn app.main:app --reload --port 8000

# Start Celery worker (separate terminal)
celery -A app.worker worker --loglevel=info

# Start Celery beat (separate terminal)
celery -A app.worker beat --loglevel=info
```

**Frontend:**
```bash
cd frontend
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | ✅ |
| `SUPABASE_SERVICE_KEY` | Service role key (backend only, never expose) | ✅ |
| `SUPABASE_ANON_KEY` | Anon key (safe for frontend) | ✅ |
| `REDIS_URL` | Redis connection URL | ✅ |
| `ANTHROPIC_API_KEY` | Claude API key | ✅ |
| `RESEND_API_KEY` | Resend email API key | ✅ |
| `STRIPE_SECRET_KEY` | Stripe secret (use `sk_test_` for dev) | ✅ |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | ✅ |
| `STRIPE_PRICE_PRO` | Stripe price ID for Pro plan | ✅ |
| `STRIPE_PRICE_TEAM` | Stripe price ID for Team plan | ✅ |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID | Optional |
| `R2_ACCESS_KEY` | R2 access key | Optional |
| `R2_SECRET_KEY` | R2 secret key | Optional |

## Stripe Setup (Test Mode)

1. Create products in Stripe Dashboard:
   - **Pro Plan**: $49/month → copy price ID to `STRIPE_PRICE_PRO`
   - **Team Plan**: $149/month → copy price ID to `STRIPE_PRICE_TEAM`

2. Set up webhook endpoint:
   ```
   stripe listen --forward-to localhost:8000/api/webhooks/stripe
   ```
   Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

## Deployment

### Backend → Railway

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
cd backend
railway up
```

Add all environment variables in Railway dashboard. Add a Redis service (Railway provides one).

### Frontend → Vercel

```bash
cd frontend
vercel deploy
```

Set environment variables in Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL` → your Railway backend URL

## Project Structure

```
modular-intelligence-platform/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + lifespan
│   │   ├── config.py            # Pydantic settings
│   │   ├── auth/
│   │   │   └── middleware.py    # JWT verification
│   │   ├── api/
│   │   │   ├── modules.py       # Module endpoints
│   │   │   ├── signals.py       # Signal endpoints
│   │   │   ├── jobs.py          # Job log endpoints
│   │   │   ├── user.py          # User settings/stats
│   │   │   └── billing.py       # Stripe integration
│   │   ├── core/
│   │   │   ├── base_module.py   # BaseModule ABC
│   │   │   ├── module_registry.py
│   │   │   ├── scheduler.py     # APScheduler
│   │   │   ├── job_runner.py    # Execute module jobs
│   │   │   ├── alert_delivery.py
│   │   │   └── scraper.py       # Playwright engine
│   │   ├── modules/             # 14 module implementations
│   │   │   ├── startup_signal_tracker.py
│   │   │   ├── vc_portfolio_tracker.py
│   │   │   ├── founder_movement_tracker.py
│   │   │   ├── grant_funding_tracker.py
│   │   │   ├── price_drop_intelligence.py
│   │   │   ├── clinical_trial_tracker.py
│   │   │   ├── real_estate_signal.py
│   │   │   ├── salary_intelligence.py
│   │   │   ├── researcher_second_brain.py
│   │   │   ├── voice_biomarker_tracker.py
│   │   │   ├── stress_recovery_scorer.py
│   │   │   ├── nap_optimizer.py
│   │   │   ├── chronotype_planner.py
│   │   │   └── fencing_analytics.py
│   │   ├── models/
│   │   │   ├── database.py      # SQLAlchemy models
│   │   │   └── schemas.py       # Pydantic schemas
│   │   └── utils/
│   │       ├── llm.py           # LLM extraction utilities
│   │       ├── hashing.py       # Content dedup
│   │       └── email_templates.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   └── src/
│       ├── app/                 # Next.js App Router pages
│       ├── components/          # React components
│       ├── hooks/               # React Query hooks
│       ├── lib/                 # API client, Supabase, utils
│       ├── store/               # Zustand store
│       └── types/               # TypeScript types
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── docker-compose.yml
└── .env.example
```

## Module Data Flow

```
User enables module → config saved to DB
      ↓
Scheduler registers cron job for module_instance_id
      ↓
Job fires → job record created (status: running)
      ↓
Module.run() called with config
      ↓
  [Scraper fetches raw data]
      ↓
  [Raw HTML stored as snapshot]
      ↓
  [Diff against previous snapshot]
      ↓
  [If changes: LLM extracts structured signal]
      ↓
  [Signal scored + dedup hash checked]
      ↓
  [Signal written to signals table]
      ↓
Job record updated (status: success, signals_found: N)
      ↓
Alert check → email via Resend / webhook POST
      ↓
Frontend React Query invalidates cache → card appears
```

## Plans & Pricing

| Feature | Free | Pro ($49/mo) | Team ($149/mo) |
|---------|------|-------------|----------------|
| Modules | 2 | All 14 | All 14 |
| Schedule | Daily | Hourly | Hourly |
| Email alerts | — | ✅ | ✅ |
| Webhooks | — | — | ✅ |
| API access | — | — | ✅ |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Data viz | Recharts |
| State | TanStack Query + Zustand |
| Backend | FastAPI, Python 3.11 |
| Scraping | Playwright (async, headless Chromium) |
| LLM | Anthropic Claude (claude-sonnet-4-5) |
| Task queue | Celery + Redis |
| Database | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth (JWT + RLS) |
| Email | Resend |
| Billing | Stripe |
| Files | Cloudflare R2 |
| Deploy | Railway (backend) + Vercel (frontend) |
