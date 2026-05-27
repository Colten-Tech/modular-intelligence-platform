FROM python:3.11-slim

WORKDIR /app

# System deps (gcc for asyncpg, curl for HEALTHCHECK)
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps — separate layer so it's cached unless requirements.txt changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright Python package is installed above but browser binaries are NOT
# installed here to keep the image lean (~600 MB vs ~1.3 GB).
# Playwright-based scraping runs via GitHub Actions (full Ubuntu runner, 7 GB RAM).
# The scraper module falls back gracefully when browsers aren't present.

COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Single worker — Koyeb nano has 0.1 vCPU; more workers just thrash context
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
