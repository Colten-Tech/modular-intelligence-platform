import asyncio
import logging
from typing import Optional

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)

_jwks_cache: Optional[dict] = None


async def _fetch_jwks_once() -> dict:
    jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(jwks_url)
        resp.raise_for_status()
        return resp.json()


async def _get_jwks() -> dict:
    """Return JWKS, fetching once and caching.  Retries 3× with backoff."""
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache

    last_exc: Exception = RuntimeError("JWKS fetch never attempted")
    for attempt in range(3):
        try:
            _jwks_cache = await _fetch_jwks_once()
            return _jwks_cache
        except Exception as exc:
            last_exc = exc
            if attempt < 2:
                await asyncio.sleep(0.5 * (attempt + 1))

    raise last_exc


def _get_rsa_key(jwks: dict, kid: str) -> Optional[dict]:
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Missing authorization token", "code": "AUTH_MISSING_TOKEN", "details": {}},
        )

    token = credentials.credentials

    # Decode header without verifying so we know the algorithm and key id
    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.exceptions.DecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Invalid token format", "code": "AUTH_INVALID_TOKEN", "details": {"msg": str(e)}},
        )

    algorithm = unverified_header.get("alg", "HS256")

    try:
        if algorithm.startswith("RS") or algorithm.startswith("ES"):
            # RS256 / ES256 (ECC P-256, current Supabase default) — verify via JWKS
            kid = unverified_header.get("kid")
            try:
                jwks = await _get_jwks()
            except Exception as e:
                logger.error(f"Could not fetch JWKS after retries: {e}")
                jwks = None

            if jwks and kid:
                raw_key = _get_rsa_key(jwks, kid)
                if raw_key is None:
                    # Key not found — cache might be stale, bust and retry once
                    global _jwks_cache
                    _jwks_cache = None
                    try:
                        jwks = await _get_jwks()
                        raw_key = _get_rsa_key(jwks, kid)
                    except Exception:
                        raw_key = None

                if raw_key is None:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail={"error": "Unknown token key id", "code": "AUTH_UNKNOWN_KID", "details": {}},
                    )

                # Load the public key using the correct algorithm class
                key_type = raw_key.get("kty", "RSA")
                if key_type == "EC":
                    public_key = jwt.algorithms.ECAlgorithm.from_jwk(raw_key)
                else:
                    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(raw_key)

                payload = jwt.decode(
                    token,
                    public_key,
                    algorithms=[algorithm],
                    options={"verify_aud": False},
                )
            else:
                # JWKS unavailable — fall back to HS256 with JWT secret if configured
                payload = jwt.decode(
                    token,
                    _get_hs256_secret(),
                    algorithms=["HS256"],
                    options={"verify_aud": False},
                )
        else:
            # HS256 — Supabase legacy path, signed with the project JWT Secret
            # (NOT the anon key — the JWT Secret is found at:
            #  Supabase Dashboard → Project Settings → API → JWT Keys → Legacy JWT Secret)
            payload = jwt.decode(
                token,
                _get_hs256_secret(),
                algorithms=["HS256"],
                options={"verify_aud": False},
            )

    except jwt.exceptions.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Token has expired", "code": "AUTH_TOKEN_EXPIRED", "details": {}},
        )
    except jwt.exceptions.InvalidTokenError as e:
        logger.warning(f"JWT verification failed ({algorithm}): {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Invalid token", "code": "AUTH_INVALID_TOKEN", "details": {"msg": str(e)}},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Token missing subject claim", "code": "AUTH_MISSING_SUB", "details": {}},
        )

    email = payload.get("email", "")
    user_metadata = payload.get("user_metadata", {})
    plan = user_metadata.get("plan", "free")

    return {
        "id": user_id,
        "email": email,
        "plan": plan,
        "raw": payload,
    }


def _get_hs256_secret() -> str:
    """Return the correct HMAC secret for HS256 verification.

    Supabase signs user access tokens (and the anon/service keys) with the
    project JWT Secret — *not* the anon key itself (which is just another JWT).
    Set SUPABASE_JWT_SECRET in your environment to the value shown at:
    Supabase Dashboard → Project Settings → API → JWT Settings → JWT Secret
    """
    secret = settings.supabase_jwt_secret
    if not secret:
        # Fallback: older deployments may have set the JWT secret equal to the
        # anon key accidentally.  Log a clear warning so it's easy to diagnose.
        logger.warning(
            "SUPABASE_JWT_SECRET is not set. "
            "HS256 JWT verification will fail. "
            "Add SUPABASE_JWT_SECRET to your environment variables."
        )
    return secret


def _verify_hs256(token: str) -> None:
    """No-op stub kept for call-site clarity; actual verify happens in jwt.decode."""
    pass
