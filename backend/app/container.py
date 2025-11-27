from __future__ import annotations

from dataclasses import dataclass
from typing import Any, TYPE_CHECKING

from fastapi import Request

from .config import Settings

if TYPE_CHECKING:
    from .auth import CognitoTokenVerifier
    from .services.cloudfront import CloudFrontURLSigner
    from .services.uploads import UploadService
    from .services.videos import VideoRepository, VideoService


@dataclass
class AppContainer:
    settings: Settings
    s3_client: Any
    dynamodb_resource: Any
    video_repository: "VideoRepository"
    upload_service: "UploadService"
    video_service: "VideoService"
    stream_signer: "CloudFrontURLSigner"
    token_verifier: "CognitoTokenVerifier"


def get_app_container(request: Request) -> AppContainer:
    container = getattr(request.app.state, "container", None)
    if container is None:
        raise RuntimeError("Application container is not initialized")
    return container
