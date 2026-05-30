from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    aws_region: str = Field(default="us-east-1", alias="AWS_REGION")
    raw_uploads_bucket: str = Field(..., alias="RAW_UPLOADS_BUCKET")
    processed_videos_bucket: str = Field(..., alias="PROCESSED_VIDEOS_BUCKET")
    videos_table: str = Field(..., alias="VIDEOS_TABLE")
    users_table: str = Field(..., alias="USERS_TABLE")
    video_id_index: str = Field(default="VideoIdIndex", alias="VIDEO_ID_INDEX")
    s3_endpoint_url: str | None = Field(default=None, alias="S3_ENDPOINT_URL")

    cloudfront_domain: str = Field(..., alias="CLOUDFRONT_DOMAIN")
    cloudfront_key_id: str = Field(..., alias="CLOUDFRONT_KEY_ID")
    cloudfront_private_key_ssm_name: str = Field(
        ..., alias="CLOUDFRONT_PRIVATE_KEY_SSM_NAME"
    )

    cognito_user_pool_id: str = Field(..., alias="COGNITO_USER_POOL_ID")
    cognito_client_id: str = Field(..., alias="COGNITO_CLIENT_ID")
    jwks_cache_seconds: int = Field(default=3600)

    multipart_url_expiration_seconds: int = Field(default=3600)
    stream_url_ttl_minutes: int = Field(default=60)
    # Per-user cumulative storage quota across all of a user's videos.
    storage_quota_bytes: int = Field(
        default=20 * 1024**3, alias="STORAGE_QUOTA_BYTES"
    )

    # Accepts comma-separated list for convenience; use .cors_allow_origins to read.
    cors_allow_origins_raw: str = Field(
        default="http://localhost:5173",
        alias="CORS_ALLOW_ORIGINS",
    )
    dynamodb_endpoint_url: str | None = Field(
        default=None, alias="DYNAMODB_ENDPOINT_URL"
    )

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    @property
    def cors_allow_origins(self) -> list[str]:
        return [
            origin
            for origin in (
                item.strip() for item in self.cors_allow_origins_raw.split(",")
            )
            if origin
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[arg-type]
