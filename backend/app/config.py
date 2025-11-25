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

    cloudfront_domain: str = Field(..., alias="CLOUDFRONT_DOMAIN")
    cloudfront_key_id: str = Field(..., alias="CLOUDFRONT_KEY_ID")
    cloudfront_private_key_path: str | None = Field(
        default=None, alias="CLOUDFRONT_PRIVATE_KEY_PATH"
    )
    cloudfront_private_key: str | None = Field(
        default=None, alias="CLOUDFRONT_PRIVATE_KEY"
    )

    cognito_user_pool_id: str = Field(..., alias="COGNITO_USER_POOL_ID")
    cognito_client_id: str = Field(..., alias="COGNITO_CLIENT_ID")
    cognito_region: str = Field(..., alias="COGNITO_REGION")
    jwks_cache_seconds: int = Field(default=3600)

    multipart_url_expiration_seconds: int = Field(default=3600)
    stream_url_ttl_minutes: int = Field(default=60)

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[arg-type]
