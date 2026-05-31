import uuid
from datetime import date, datetime
from typing import Any, AsyncGenerator, Optional

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, relationship

from app.config import settings

# ── Engine ──────────────────────────────────────────────────────────────────

# Convert postgres:// → postgresql+asyncpg://
_db_url = settings.supabase_url
# Supabase connection string comes via DATABASE_URL env sometimes; here we
# derive it from the project URL using the service key if needed.
# For direct asyncpg, callers must set DATABASE_URL in their .env.
# We accept both forms gracefully.
import os

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    # Fallback: use Supabase session pooler (accessible from any IP, no allowlist needed).
    # Direct connection (db.{ref}.supabase.co:5432) is blocked from cloud providers
    # unless the source IP is explicitly allowlisted in Supabase Network Restrictions.
    project_ref = settings.supabase_url.replace("https://", "").split(".")[0]
    # Derive region from SUPABASE_URL — eu-west-1 projects use aws-0-eu-west-1.pooler.supabase.com
    # Default to eu-west-1; override DATABASE_URL env var if you're in a different region.
    _pooler_host = f"aws-0-eu-west-1.pooler.supabase.com"
    DATABASE_URL = (
        f"postgresql+asyncpg://postgres.{project_ref}:{settings.supabase_service_key}"
        f"@{_pooler_host}:5432/postgres"
    )
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and "asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Append ssl=require via URL query param — the correct way for asyncpg.
# connect_args={"ssl": "require"} is NOT valid for asyncpg (needs SSLContext or bool).
if "ssl=" not in DATABASE_URL:
    DATABASE_URL += ("&" if "?" in DATABASE_URL else "?") + "ssl=require"

# Detect transaction pooler (port 6543) — it doesn't support prepared statements.
_connect_args: dict = {}
if ":6543/" in DATABASE_URL:
    _connect_args["statement_cache_size"] = 0

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=3,
    max_overflow=5,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args=_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── Base ─────────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


# ── Core tables ──────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(Text, nullable=False, unique=True)
    plan = Column(Text, nullable=False, server_default="free")
    is_admin = Column(Boolean, nullable=False, server_default=text("false"))
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))

    modules = relationship("Module", back_populates="user", cascade="all, delete-orphan")
    signals = relationship("Signal", back_populates="user", cascade="all, delete-orphan")


class Module(Base):
    __tablename__ = "modules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    module_type = Column(Text, nullable=False)
    config = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    enabled = Column(Boolean, nullable=False, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))

    user = relationship("User", back_populates="modules")
    jobs = relationship("Job", back_populates="module", cascade="all, delete-orphan")
    signals = relationship("Signal", back_populates="module", cascade="all, delete-orphan")
    raw_snapshots = relationship("RawSnapshot", back_populates="module", cascade="all, delete-orphan")
    embeddings = relationship("Embedding", back_populates="module", cascade="all, delete-orphan")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    status = Column(Text, nullable=False, default="pending")  # pending/running/success/failed
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))
    error = Column(Text)
    signals_found = Column(Integer, nullable=False, server_default=text("0"))

    module = relationship("Module", back_populates="jobs")


class RawSnapshot(Base):
    __tablename__ = "raw_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    url = Column(Text, nullable=False)
    content_hash = Column(Text, nullable=False)
    raw_html = Column(Text)
    fetched_at = Column(DateTime(timezone=True), server_default=text("now()"))

    module = relationship("Module", back_populates="raw_snapshots")


class Signal(Base):
    __tablename__ = "signals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(Text, nullable=False)
    body = Column(Text, nullable=False)
    score = Column(Float, nullable=False, default=0.5)
    source_url = Column(Text)
    meta = Column("metadata", JSONB, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))
    read = Column(Boolean, nullable=False, server_default=text("false"))
    archived = Column(Boolean, nullable=False, server_default=text("false"))

    module = relationship("Module", back_populates="signals")
    user = relationship("User", back_populates="signals")
    alerts = relationship("Alert", back_populates="signal", cascade="all, delete-orphan")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    signal_id = Column(UUID(as_uuid=True), ForeignKey("signals.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    channel = Column(Text, nullable=False)  # email | webhook
    sent_at = Column(DateTime(timezone=True), server_default=text("now()"))

    signal = relationship("Signal", back_populates="alerts")


class Embedding(Base):
    __tablename__ = "embeddings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    chunk_text = Column(Text, nullable=False)
    # vector(1536) — represented as JSONB for portability; use pgvector extension in prod
    embedding = Column(JSONB)
    meta = Column("metadata", JSONB, server_default=text("'{}'::jsonb"))

    module = relationship("Module", back_populates="embeddings")


# ── Module-specific tables ────────────────────────────────────────────────────

class FencingBout(Base):
    __tablename__ = "fencing_bouts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    opponent = Column(Text)
    result = Column(Text)  # win | loss | draw
    my_score = Column(Integer)
    opp_score = Column(Integer)
    action_log = Column(JSONB)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))


class VoiceRecording(Base):
    __tablename__ = "voice_recordings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_url = Column(Text)
    recorded_at = Column(DateTime(timezone=True), server_default=text("now()"))
    features = Column(JSONB)
    fatigue_score = Column(Float)
    stress_score = Column(Float)
    mood_score = Column(Float)


class GrantMatch(Base):
    __tablename__ = "grant_matches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    grant_id = Column(Text)
    title = Column(Text)
    funder = Column(Text)
    deadline = Column(Date)
    relevance_score = Column(Float)
    url = Column(Text)
    description = Column(Text)
    meta = Column("metadata", JSONB, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))


class PriceSnapshot(Base):
    __tablename__ = "price_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    url = Column(Text, nullable=False)
    tool_name = Column(Text)
    price_data = Column(JSONB)
    captured_at = Column(DateTime(timezone=True), server_default=text("now()"))
    change_detected = Column(Boolean, server_default=text("false"))
    change_type = Column(Text)  # price_increase | price_decrease | new_tier | removed_tier


class SalarySubmission(Base):
    __tablename__ = "salary_submissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_title = Column(Text, nullable=False)
    city = Column(Text)
    company_size = Column(Text)
    years_exp = Column(Integer)
    salary_eur = Column(Integer)
    tech_stack = Column(ARRAY(Text))
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))


class NapSession(Base):
    __tablename__ = "nap_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    module_id = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    recommended_start = Column(DateTime(timezone=True))
    recommended_end = Column(DateTime(timezone=True))
    duration_min = Column(Integer)
    circadian_phase = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))
