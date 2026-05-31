"""Shared test fixtures.

Everything that touches AWS runs inside moto's ``mock_aws`` context (the ``aws``
fixture), so the suite never reaches real AWS and needs no credentials or network.

The required ``Settings`` env vars are set at import time — *before* any app module
is imported — because ``main`` builds a module-level ``Settings()`` on import and the
``config.get_settings`` lru_cache is populated from the environment.
"""

import os

# --- environment must be set before importing any app module ----------------
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_SECURITY_TOKEN", "testing")
os.environ.setdefault("AWS_SESSION_TOKEN", "testing")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

os.environ.update(
    {
        "AWS_REGION": "us-east-1",
        "RAW_UPLOADS_BUCKET": "test-raw",
        "PROCESSED_VIDEOS_BUCKET": "test-processed",
        "VIDEOS_TABLE": "test-videos",
        "USERS_TABLE": "test-users",
        "VIDEO_ID_INDEX": "VideoIdIndex",
        "CLOUDFRONT_DOMAIN": "cdn.example.net",
        "CLOUDFRONT_KEY_ID": "APKAEXAMPLE123",
        "CLOUDFRONT_PRIVATE_KEY_SSM_NAME": "/cloudcast/cloudfront/private_key",
        "COGNITO_USER_POOL_ID": "us-east-1_TestPool",
        "COGNITO_CLIENT_ID": "test-client-id",
        # Deliberately small so quota-enforcement paths are reachable in tests.
        "STORAGE_QUOTA_BYTES": "1000",
    }
)

import boto3  # noqa: E402
import pytest  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from moto import mock_aws  # noqa: E402

from app.auth import AuthenticatedUser  # noqa: E402
from app.config import Settings, get_settings  # noqa: E402

REGION = "us-east-1"


@pytest.fixture
def settings() -> Settings:
    # Single cached instance built from the env above; the app's per-request
    # providers resolve the same object via get_settings().
    return get_settings()


@pytest.fixture
def aws():
    """Activate moto for the duration of a test."""
    with mock_aws():
        yield


@pytest.fixture
def dynamodb(aws, settings):
    resource = boto3.resource("dynamodb", region_name=REGION)
    resource.create_table(
        TableName=settings.videos_table,
        KeySchema=[
            {"AttributeName": "user_id", "KeyType": "HASH"},
            {"AttributeName": "id", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "user_id", "AttributeType": "S"},
            {"AttributeName": "id", "AttributeType": "S"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": settings.video_id_index,
                "KeySchema": [{"AttributeName": "id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    resource.create_table(
        TableName=settings.users_table,
        KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )
    return resource


@pytest.fixture
def s3(aws, settings):
    client = boto3.client("s3", region_name=REGION)
    client.create_bucket(Bucket=settings.raw_uploads_bucket)
    client.create_bucket(Bucket=settings.processed_videos_bucket)
    return client


@pytest.fixture(scope="session")
def rsa_key():
    """A test RSA keypair shared by the CloudFront and JWT tests."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    return {"key": private_key, "private_pem": private_pem}


@pytest.fixture
def ssm_with_key(aws, settings, rsa_key):
    client = boto3.client("ssm", region_name=REGION)
    # Store with literal backslash-n escapes so the signer's un-escape path is
    # exercised (cloudfront.py replaces "\\n" -> "\n").
    escaped = rsa_key["private_pem"].replace("\n", "\\n")
    client.put_parameter(
        Name=settings.cloudfront_private_key_ssm_name,
        Value=escaped,
        Type="SecureString",
    )
    return client


@pytest.fixture
def admin_user() -> AuthenticatedUser:
    return AuthenticatedUser(id="user-admin", email="admin@example.com", groups=["admin"])


@pytest.fixture
def plain_user() -> AuthenticatedUser:
    return AuthenticatedUser(id="user-plain", email="plain@example.com", groups=[])


# --- HTTP clients -----------------------------------------------------------
#
# Each builds a fresh app whose lifespan boto3 clients are mocked by moto, and
# overrides the auth seam (get_current_user) so we don't mint JWTs per route.
# The `dynamodb`, `s3` and `ssm_with_key` deps ensure tables/buckets/keys exist
# before the app starts handling requests.


def _client_for(user):
    from fastapi.testclient import TestClient

    from app.auth import get_current_user
    from main import create_app

    app = create_app()
    if user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


@pytest.fixture
def admin_client(dynamodb, s3, ssm_with_key, admin_user):
    with _client_for(admin_user) as client:
        yield client


@pytest.fixture
def user_client(dynamodb, s3, ssm_with_key, plain_user):
    with _client_for(plain_user) as client:
        yield client


@pytest.fixture
def anon_client(dynamodb, s3, ssm_with_key):
    with _client_for(None) as client:
        yield client
