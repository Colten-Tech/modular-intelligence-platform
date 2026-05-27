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


async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache
    jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(jwks_url)
        resp.raise_for_status()
        _jwks_cache = resp.json()
    return _jwks_cache


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

    # First try: decode without verification to get kid and algorithm
    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.exceptions.DecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Invalid token format", "code": "AUTH_INVALID_TOKEN", "details": {"msg": str(e)}},
        )

    algorithm = unverified_header.get("alg", "HS256")

    try:
        if algorithm.startswith("RS"):
            # RS256 — fetch Supabase JWKS and verify with public key
            kid = unverified_header.get("kid")
            try:
                jwks = await _get_jwks()
            except Exception as e:
                logger.warning(f"Could not fetch JWKS: {e}. Falling back to HS256 path.")
                jwks = None

            if jwks and kid:
                raw_key = _get_rsa_key(jwks, kid)
                if raw_key is None:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail={"error": "Unknown token key id", "code": "AUTH_UNKNOWN_KID", "details": {}},
                    )
                public_key = jwt.algorithms.RSAAlgorithm.from_jwk(raw_key)
                payload = jwt.decode(
                    token,
                    public_key,
                    algorithms=[algorithm],
                    options={"verify_aud": False},
                )
            else:
                # Fallback: decode with jwt_secret if RS256 not resolvable
                payload = jwt.decode(
                    token,
                    settings.supabase_anon_key,
                    algorithms=["HS256"],
                    options={"verify_aud": False},
                )
        else:
            # HS256 — Supabase signs with the project JWT secret (service key or anon key)
            payload = jwt.decode(
                token,
                settings.supabase_anon_key,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
    except jwt.exceptions.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Token has expired", "code": "AUTH_TOKEN_EXPIRED", "details": {}},
        )
    except jwt.exceptions.InvalidTokenError as e:
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
    # role / plan will be fetched from DB when needed; return lightweight dict
    user_metadata = payload.get("user_metadata", {})
    plan = user_metadata.get("plan", "free")

    return {
        "id": user_id,
        "email": email,
        "plan": plan,
        "raw": payload,
    }
