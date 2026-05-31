"""Tests for Cognito JWT verification and the admin authorization gate.

JWKS fetching is replaced with a local keypair so verification runs without
network access: we build a JWK from the test public key and mint matching RS256
tokens with python-jose.
"""

import time

import pytest
from cryptography.hazmat.primitives import serialization
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwk, jwt

from app.auth import (
    AuthenticatedUser,
    CognitoTokenVerifier,
    get_admin_user,
    get_current_user,
)

REGION = "us-east-1"
USER_POOL_ID = "us-east-1_TestPool"
CLIENT_ID = "test-client-id"
ISSUER = f"https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}"
KID = "test-kid"


@pytest.fixture
def public_jwk(rsa_key):
    public_pem = (
        rsa_key["key"]
        .public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
    jwk_dict = jwk.construct(public_pem, "RS256").to_dict()
    jwk_dict["kid"] = KID
    return jwk_dict


@pytest.fixture
def verifier(public_jwk, monkeypatch):
    v = CognitoTokenVerifier(REGION, USER_POOL_ID, CLIENT_ID, ttl_seconds=3600)
    monkeypatch.setattr(v.jwks_cache, "get_keys", lambda: [public_jwk])
    return v


def _mint(rsa_key, claims, kid=KID):
    payload = {"iss": ISSUER, "aud": CLIENT_ID, "exp": int(time.time()) + 3600}
    payload.update(claims)
    return jwt.encode(
        payload, rsa_key["private_pem"], algorithm="RS256", headers={"kid": kid}
    )


def test_verify_valid_token_returns_claims(verifier, rsa_key):
    token = _mint(rsa_key, {"sub": "u1", "email": "u1@example.com"})
    claims = verifier.verify(token)
    assert claims["sub"] == "u1"
    assert claims["email"] == "u1@example.com"


def test_get_current_user_maps_claims(verifier, rsa_key):
    token = _mint(
        rsa_key,
        {"sub": "u1", "email": "u1@example.com", "cognito:groups": ["admin"]},
    )
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    user = get_current_user(credentials=creds, token_verifier=verifier)
    assert isinstance(user, AuthenticatedUser)
    assert user.id == "u1"
    assert user.groups == ["admin"]


def test_missing_credentials_raises_401(verifier):
    with pytest.raises(HTTPException) as exc:
        get_current_user(credentials=None, token_verifier=verifier)
    assert exc.value.status_code == 401


def test_wrong_audience_raises_401(verifier, rsa_key):
    token = _mint(rsa_key, {"sub": "u1", "aud": "some-other-client"})
    with pytest.raises(HTTPException) as exc:
        verifier.verify(token)
    assert exc.value.status_code == 401
    assert "audience" in exc.value.detail.lower()


def test_unknown_kid_raises_401(verifier, rsa_key):
    token = _mint(rsa_key, {"sub": "u1"}, kid="not-the-kid")
    with pytest.raises(HTTPException) as exc:
        verifier.verify(token)
    assert exc.value.status_code == 401
    assert exc.value.detail == "Unknown token key"


def test_malformed_token_raises_401(verifier):
    with pytest.raises(HTTPException) as exc:
        verifier.verify("not-a-jwt")
    assert exc.value.status_code == 401
    assert exc.value.detail == "Invalid token header"


def test_expired_token_raises_401(verifier, rsa_key):
    token = _mint(rsa_key, {"sub": "u1", "exp": int(time.time()) - 10})
    with pytest.raises(HTTPException) as exc:
        verifier.verify(token)
    assert exc.value.status_code == 401


def test_admin_gate_allows_admin():
    user = AuthenticatedUser(id="u1", groups=["admin"])
    assert get_admin_user(user) is user


def test_admin_gate_rejects_non_admin():
    user = AuthenticatedUser(id="u1", groups=["viewer"])
    with pytest.raises(HTTPException) as exc:
        get_admin_user(user)
    assert exc.value.status_code == 403
