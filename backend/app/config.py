from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_key: str
    supabase_anon_key: str
    redis_url: str = "redis://localhost:6379"
    anthropic_api_key: str
    resend_api_key: str
    stripe_secret_key: str
    stripe_webhook_secret: str
    stripe_price_pro: str = ""
    stripe_price_team: str = ""
    r2_account_id: str = ""
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_bucket: str = "mip-files"
    app_url: str = "http://localhost:3000"
    api_url: str = "http://localhost:8000"
    # Comma-separated extra CORS origins, e.g. "https://app.vercel.app,https://example.com"
    extra_cors_origins: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
