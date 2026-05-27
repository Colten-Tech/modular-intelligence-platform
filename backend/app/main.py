import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.scheduler import scheduler_instance
from app.core.module_registry import module_registry
from app.api import modules, signals, jobs, user, billing

logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}',
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Modular Intelligence Platform API")
    module_registry.discover()
    logger.info(f"Discovered {len(module_registry.list_modules())} modules")
    scheduler_instance.start()
    logger.info("Scheduler started")
    yield
    # Shutdown
    scheduler_instance.shutdown()
    logger.info("Scheduler stopped")


app = FastAPI(
    title="Modular Intelligence Platform",
    version="1.0.0",
    description="Multi-tenant SaaS running 14 automated intelligence modules",
    lifespan=lifespan,
)

# CORS — always allow localhost for local dev, plus any configured production origins
_cors_origins = {"http://localhost:3000", settings.app_url}
if settings.extra_cors_origins:
    for _o in settings.extra_cors_origins.split(","):
        _o = _o.strip()
        if _o:
            _cors_origins.add(_o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(modules.router, prefix="/api", tags=["modules"])
app.include_router(signals.router, prefix="/api", tags=["signals"])
app.include_router(jobs.router, prefix="/api", tags=["jobs"])
app.include_router(user.router, prefix="/api", tags=["user"])
app.include_router(billing.router, prefix="/api", tags=["billing"])


@app.get("/health", tags=["health"])
async def health_check():
    return {
        "status": "ok",
        "version": "1.0.0",
        "modules_loaded": len(module_registry.list_modules()),
    }
