import json
import time
import urllib.request
from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from pydantic import BaseModel

from .container import AppContainer, get_app_container

http_bearer = HTTPBearer(auto_error=False)


class AuthenticatedUser(BaseModel):
    id: str
    email: str | None = None
    groups: list[str] = []


class JWKSCache:
    def __init__(self, url: str, ttl_seconds: int):
        self.url = url
        self.ttl_seconds = ttl_seconds
        self._keys: list[dict[str, Any]] | None = None
        self._expires_at: float = 0.0

    def get_keys(self) -> list[dict[str, Any]]:
        now = time.time()
        if self._keys is not None and now < self._expires_at:
            return self._keys

        try:
            with urllib.request.urlopen(self.url) as response:
                data = json.loads(response.read().decode("utf-8"))
        except Exception as exc:  # pragma: no cover - network access is runtime-only
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to fetch Cognito JWKS",
            ) from exc

        self._keys = data.get("keys", [])
        self._expires_at = now + self.ttl_seconds
        return self._keys


class CognitoTokenVerifier:
    def __init__(
        self, region: str, user_pool_id: str, client_id: str, ttl_seconds: int
    ):
        self.region = region
        self.user_pool_id = user_pool_id
        self.client_id = client_id
        self.issuer = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}"
        self.jwks_cache = JWKSCache(f"{self.issuer}/.well-known/jwks.json", ttl_seconds)

    def verify(self, token: str) -> dict[str, Any]:
        keys = self.jwks_cache.get_keys()
        try:
            headers = jwt.get_unverified_header(token)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token header",
            ) from exc

        kid = headers.get("kid")
        key = next((k for k in keys if k.get("kid") == kid), None)
        if not key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unknown token key",
            )

        try:
            claims = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                issuer=self.issuer,
                options={"verify_aud": False},
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            ) from exc

        audience = claims.get("aud") or claims.get("client_id")
        if audience != self.client_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token audience does not match client configuration",
            )

        return claims


def get_token_verifier(
    container: AppContainer = Depends(get_app_container),
) -> CognitoTokenVerifier:
    return container.token_verifier


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(http_bearer),
    token_verifier: CognitoTokenVerifier = Depends(get_token_verifier),
) -> AuthenticatedUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    claims = token_verifier.verify(credentials.credentials)
    return AuthenticatedUser(
        id=claims["sub"],
        email=claims.get("email"),
        groups=claims.get("cognito:groups", []),
    )


UserDep = Annotated[AuthenticatedUser, Depends(get_current_user)]


def get_admin_user(user: UserDep) -> AuthenticatedUser:
    print(f"User groups: {user.groups}")  # Debugging statement
    if "admin" not in user.groups:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return user


AdminUserDep = Annotated[AuthenticatedUser, Depends(get_admin_user)]
