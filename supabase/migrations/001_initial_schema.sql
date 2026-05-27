-- ============================================================
-- Modular Intelligence Platform — Initial Schema
-- Run against Supabase: supabase db push or paste in SQL editor
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for full-text search on signals

-- ============================================================
-- CORE TABLES
-- ============================================================

-- Users table (mirrors Supabase auth.users with plan info)
CREATE TABLE IF NOT EXISTS public.users (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team')),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    webhook_url TEXT,
    email_digest_frequency TEXT DEFAULT 'daily' CHECK (email_digest_frequency IN ('realtime', 'daily', 'weekly', 'never')),
    notification_types TEXT[] DEFAULT ARRAY['high_score', 'job_failed'],
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Module instances (user's enabled modules with config)
CREATE TABLE IF NOT EXISTS public.modules (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    module_type TEXT NOT NULL,
    config      JSONB NOT NULL DEFAULT '{}',
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    schedule    TEXT NOT NULL DEFAULT '0 8 * * *',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, module_type)
);

-- Job execution log
CREATE TABLE IF NOT EXISTS public.jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id       UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'success', 'failed')),
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    error           TEXT,
    signals_found   INTEGER NOT NULL DEFAULT 0,
    log_entries     JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Raw content snapshots (for change detection)
CREATE TABLE IF NOT EXISTS public.raw_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id       UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    raw_html        TEXT,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (module_id, url)
);

-- Unified signals table
CREATE TABLE IF NOT EXISTS public.signals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id       UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    dedup_hash      TEXT NOT NULL,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    score           FLOAT NOT NULL DEFAULT 0.5 CHECK (score >= 0 AND score <= 1),
    source_url      TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    read            BOOLEAN NOT NULL DEFAULT FALSE,
    archived        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (module_id, dedup_hash)
);

-- Alert delivery records
CREATE TABLE IF NOT EXISTS public.alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_id       UUID NOT NULL REFERENCES public.signals(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    channel         TEXT NOT NULL CHECK (channel IN ('email', 'webhook')),
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    success         BOOLEAN NOT NULL DEFAULT TRUE,
    error           TEXT
);

-- Vector embeddings for semantic search (Second Brain etc.)
CREATE TABLE IF NOT EXISTS public.embeddings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id       UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    chunk_text      TEXT NOT NULL,
    embedding       VECTOR(1536),
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MODULE-SPECIFIC TABLES
-- ============================================================

-- Fencing bouts
CREATE TABLE IF NOT EXISTS public.fencing_bouts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id       UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    bout_date       DATE NOT NULL,
    opponent        TEXT,
    weapon          TEXT NOT NULL DEFAULT 'foil' CHECK (weapon IN ('foil', 'epee', 'sabre')),
    competition     TEXT,
    my_score        INTEGER NOT NULL,
    opp_score       INTEGER NOT NULL,
    result          TEXT GENERATED ALWAYS AS (
                        CASE WHEN my_score > opp_score THEN 'win'
                             WHEN my_score < opp_score THEN 'loss'
                             ELSE 'draw' END
                    ) STORED,
    action_log      JSONB DEFAULT '[]',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Voice biomarker recordings
CREATE TABLE IF NOT EXISTS public.voice_recordings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id       UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    file_url        TEXT NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    features        JSONB DEFAULT '{}',
    fatigue_score   FLOAT CHECK (fatigue_score >= 0 AND fatigue_score <= 1),
    stress_score    FLOAT CHECK (stress_score >= 0 AND stress_score <= 1),
    mood_score      FLOAT CHECK (mood_score >= 0 AND mood_score <= 1),
    processed       BOOLEAN DEFAULT FALSE
);

-- Grant opportunity matches
CREATE TABLE IF NOT EXISTS public.grant_matches (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id       UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    grant_id        TEXT NOT NULL,
    title           TEXT NOT NULL,
    funder          TEXT,
    deadline        DATE,
    relevance_score FLOAT CHECK (relevance_score >= 0 AND relevance_score <= 1),
    url             TEXT,
    description     TEXT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (module_id, grant_id)
);

-- SaaS pricing snapshots
CREATE TABLE IF NOT EXISTS public.price_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id       UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    tool_name       TEXT NOT NULL,
    price_data      JSONB NOT NULL DEFAULT '{}',
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    change_detected BOOLEAN DEFAULT FALSE,
    change_type     TEXT,
    change_summary  TEXT,
    prev_hash       TEXT
);

-- Salary dataset (anonymized community submissions)
CREATE TABLE IF NOT EXISTS public.salary_submissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_title      TEXT NOT NULL,
    role_normalized TEXT,
    city            TEXT NOT NULL,
    country         TEXT NOT NULL DEFAULT 'DE',
    company_size    TEXT CHECK (company_size IN ('1-10', '11-50', '51-200', '201-1000', '1000+')),
    years_exp       INTEGER,
    salary_eur      INTEGER NOT NULL,
    tech_stack      TEXT[] DEFAULT '{}',
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Research papers (Second Brain)
CREATE TABLE IF NOT EXISTS public.research_papers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id       UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    arxiv_id        TEXT,
    doi             TEXT,
    title           TEXT NOT NULL,
    authors         TEXT[] DEFAULT '{}',
    year            INTEGER,
    abstract        TEXT,
    file_url        TEXT,
    key_claims      TEXT[],
    methodology     TEXT,
    results         TEXT,
    limitations     TEXT,
    tags            TEXT[] DEFAULT '{}',
    processed       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nap/recovery sessions
CREATE TABLE IF NOT EXISTS public.nap_sessions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id           UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    recommended_start   TIMESTAMPTZ,
    recommended_end     TIMESTAMPTZ,
    duration_min        INTEGER,
    circadian_phase     TEXT,
    hours_since_wake    FLOAT,
    score               FLOAT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_modules_user_id ON public.modules(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_module_id ON public.jobs(module_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_module_id ON public.signals(module_id);
CREATE INDEX IF NOT EXISTS idx_signals_user_id ON public.signals(user_id);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON public.signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_score ON public.signals(score DESC);
CREATE INDEX IF NOT EXISTS idx_signals_read ON public.signals(user_id, read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_signals_archived ON public.signals(archived) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_signals_search ON public.signals USING gin(to_tsvector('english', title || ' ' || body));
CREATE INDEX IF NOT EXISTS idx_raw_snapshots_module_url ON public.raw_snapshots(module_id, url);
CREATE INDEX IF NOT EXISTS idx_embeddings_user ON public.embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_fencing_bouts_user ON public.fencing_bouts(user_id, bout_date DESC);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_user ON public.voice_recordings(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_grant_matches_user ON public.grant_matches(user_id, relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_module ON public.price_snapshots(module_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_salary_submissions_role_city ON public.salary_submissions(role_normalized, city);
CREATE INDEX IF NOT EXISTS idx_research_papers_user ON public.research_papers(user_id, created_at DESC);

-- Vector index for embeddings similarity search
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON public.embeddings
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fencing_bouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nap_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only access their own data
CREATE POLICY "Users: own row" ON public.users
    FOR ALL USING (auth.uid() = id);

CREATE POLICY "Modules: own rows" ON public.modules
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Jobs: own rows" ON public.jobs
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Raw snapshots: own modules" ON public.raw_snapshots
    FOR ALL USING (
        module_id IN (SELECT id FROM public.modules WHERE user_id = auth.uid())
    );

CREATE POLICY "Signals: own rows" ON public.signals
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Alerts: own rows" ON public.alerts
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Embeddings: own rows" ON public.embeddings
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Fencing bouts: own rows" ON public.fencing_bouts
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Voice recordings: own rows" ON public.voice_recordings
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Grant matches: own rows" ON public.grant_matches
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Price snapshots: own modules" ON public.price_snapshots
    FOR ALL USING (
        module_id IN (SELECT id FROM public.modules WHERE user_id = auth.uid())
    );

CREATE POLICY "Research papers: own rows" ON public.research_papers
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Nap sessions: own rows" ON public.nap_sessions
    FOR ALL USING (auth.uid() = user_id);

-- Salary submissions are public (anonymized) — anyone can read, anyone can insert
-- No RLS on salary_submissions (public dataset)
ALTER TABLE public.salary_submissions DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create user record on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.users (id, email, plan)
    VALUES (NEW.id, NEW.email, 'free')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER modules_updated_at BEFORE UPDATE ON public.modules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Signal search function
CREATE OR REPLACE FUNCTION public.search_signals(
    p_user_id UUID,
    p_query TEXT,
    p_module_ids UUID[] DEFAULT NULL,
    p_min_score FLOAT DEFAULT 0,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS SETOF public.signals LANGUAGE sql STABLE AS $$
    SELECT s.*
    FROM public.signals s
    WHERE s.user_id = p_user_id
      AND s.archived = FALSE
      AND s.score >= p_min_score
      AND (p_module_ids IS NULL OR s.module_id = ANY(p_module_ids))
      AND (
          p_query IS NULL OR p_query = '' OR
          to_tsvector('english', s.title || ' ' || s.body) @@ plainto_tsquery('english', p_query)
      )
    ORDER BY s.created_at DESC
    LIMIT p_limit OFFSET p_offset;
$$;

-- Semantic search on embeddings
CREATE OR REPLACE FUNCTION public.match_embeddings(
    p_user_id UUID,
    p_module_id UUID,
    p_query_embedding VECTOR(1536),
    p_match_threshold FLOAT DEFAULT 0.7,
    p_match_count INTEGER DEFAULT 10
)
RETURNS TABLE(id UUID, chunk_text TEXT, metadata JSONB, similarity FLOAT) LANGUAGE sql STABLE AS $$
    SELECT id, chunk_text, metadata,
           1 - (embedding <=> p_query_embedding) AS similarity
    FROM public.embeddings
    WHERE user_id = p_user_id
      AND module_id = p_module_id
      AND 1 - (embedding <=> p_query_embedding) > p_match_threshold
    ORDER BY embedding <=> p_query_embedding
    LIMIT p_match_count;
$$;

-- ============================================================
-- SEED DATA (module definitions stored in backend, not DB)
-- But we seed a test user plan check function
-- ============================================================

-- Helper: check if user plan allows a module
CREATE OR REPLACE FUNCTION public.user_can_enable_module(
    p_user_id UUID,
    p_required_plan TEXT
)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT CASE
        WHEN p_required_plan = 'free' THEN TRUE
        WHEN p_required_plan = 'pro' THEN
            (SELECT plan IN ('pro', 'team') FROM public.users WHERE id = p_user_id)
        WHEN p_required_plan = 'team' THEN
            (SELECT plan = 'team' FROM public.users WHERE id = p_user_id)
        ELSE FALSE
    END;
$$;

-- Helper: count user's active modules (for plan limit check)
CREATE OR REPLACE FUNCTION public.user_active_module_count(p_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
    SELECT COUNT(*)::INTEGER FROM public.modules
    WHERE user_id = p_user_id AND enabled = TRUE;
$$;
