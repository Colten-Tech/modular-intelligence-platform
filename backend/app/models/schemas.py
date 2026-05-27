from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ── Module Schemas ────────────────────────────────────────────────────────────

class ModuleCreate(BaseModel):
    module_type: str
    config: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class ModuleResponse(BaseModel):
    id: UUID
    user_id: UUID
    module_type: str
    config: Dict[str, Any]
    enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ModuleConfigUpdate(BaseModel):
    config: Dict[str, Any]


class EnableModuleRequest(BaseModel):
    config: Dict[str, Any] = Field(default_factory=dict)


class ModuleInfo(BaseModel):
    module_id: str
    display_name: str
    description: str
    cluster: str
    default_schedule: str
    required_plan: str
    config_schema: Dict[str, Any]
    ui_component_hint: str
    enabled: bool = False
    instance_id: Optional[UUID] = None
    instance_config: Optional[Dict[str, Any]] = None


class ModuleStatusResponse(BaseModel):
    module_id: str
    instance_id: Optional[UUID] = None
    enabled: bool
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    total_jobs: int = 0
    successful_jobs: int = 0
    failed_jobs: int = 0
    total_signals: int = 0


# ── Signal Schemas ────────────────────────────────────────────────────────────

class SignalResponse(BaseModel):
    id: UUID
    module_id: UUID
    user_id: UUID
    title: str
    body: str
    score: float
    source_url: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    read: bool
    archived: bool
    module_type: Optional[str] = None

    model_config = {"from_attributes": True}


class SignalListResponse(BaseModel):
    items: List[SignalResponse]
    total: int
    page: int
    limit: int
    has_more: bool


# ── Job Schemas ───────────────────────────────────────────────────────────────

class JobLogEntry(BaseModel):
    timestamp: datetime
    level: str
    message: str
    data: Optional[Dict[str, Any]] = None


class JobResponse(BaseModel):
    id: UUID
    module_id: UUID
    status: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error: Optional[str] = None
    signals_found: int
    duration_seconds: Optional[float] = None
    module_type: Optional[str] = None

    model_config = {"from_attributes": True}

    @field_validator("duration_seconds", mode="before")
    @classmethod
    def compute_duration(cls, v: Any, info: Any) -> Optional[float]:
        return v


class JobListResponse(BaseModel):
    items: List[JobResponse]
    total: int
    page: int
    limit: int
    has_more: bool


# ── User Schemas ──────────────────────────────────────────────────────────────

class UserSettings(BaseModel):
    alert_email: Optional[str] = None
    webhook_url: Optional[str] = None
    alert_channels: List[str] = Field(default_factory=lambda: ["email"])
    min_alert_score: float = 0.7
    timezone: str = "UTC"
    notification_frequency: str = "realtime"  # realtime | daily | weekly


class UserStats(BaseModel):
    # Fields matched to frontend types/index.ts UserStats interface
    signals_today: int = 0
    signals_this_week: int = 0
    active_modules: int = 0
    jobs_today: int = 0
    success_rate: float = 0.0  # 0-100
    modules_limit: int = 2
    # Extra context
    total_signals: int = 0
    unread_signals: int = 0
    plan: str = "free"


# ── Billing Schemas ───────────────────────────────────────────────────────────

class PlanDetail(BaseModel):
    id: str
    name: str
    price_monthly: float
    price_yearly: float
    features: List[str]
    max_modules: int
    stripe_price_id: Optional[str] = None


class BillingPlansResponse(BaseModel):
    plans: List[PlanDetail]


class CheckoutSessionRequest(BaseModel):
    plan: str  # pro | team
    interval: str = "monthly"  # monthly | yearly


class CheckoutSessionResponse(BaseModel):
    checkout_url: str
    session_id: str


class PortalSessionResponse(BaseModel):
    portal_url: str


# ── Fencing Schemas ───────────────────────────────────────────────────────────

class FencingBoutCreate(BaseModel):
    date: str
    opponent: Optional[str] = None
    result: str  # win | loss | draw
    my_score: int
    opp_score: int
    action_log: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


class FencingBoutResponse(BaseModel):
    id: UUID
    module_id: UUID
    user_id: UUID
    date: str
    opponent: Optional[str] = None
    result: str
    my_score: int
    opp_score: int
    action_log: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Salary Schemas ────────────────────────────────────────────────────────────

class SalarySubmitRequest(BaseModel):
    role_title: str
    city: str
    company_size: str
    years_exp: int
    salary_eur: int
    tech_stack: List[str] = Field(default_factory=list)


class SalaryQueryParams(BaseModel):
    role_title: str
    city: Optional[str] = None


# ── Voice Recording Schemas ───────────────────────────────────────────────────

class VoiceRecordingResponse(BaseModel):
    id: UUID
    module_id: UUID
    user_id: UUID
    file_url: Optional[str] = None
    recorded_at: datetime
    features: Optional[Dict[str, Any]] = None
    fatigue_score: Optional[float] = None
    stress_score: Optional[float] = None
    mood_score: Optional[float] = None

    model_config = {"from_attributes": True}


# ── Generic error response ────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    error: str
    code: str
    details: Dict[str, Any] = Field(default_factory=dict)
