from typing import Annotated, Any

from fastapi import Depends, Request

from app.config import Settings, get_settings
from app.resources import AppResources, get_app_resources
from app.services.cloudfront import CloudFrontURLSigner
from app.services.uploads import UploadService
from app.services.videos import VideoRepository, VideoService


# --- raw resources (lifespan singletons) -----------------------------------


def get_s3_client(resources: AppResources = Depends(get_app_resources)) -> Any:
    return resources.s3_client


def get_dynamodb_resource(
    resources: AppResources = Depends(get_app_resources),
) -> Any:
    return resources.dynamodb_resource


def get_ssm_client(resources: AppResources = Depends(get_app_resources)) -> Any:
    return resources.ssm_client


# --- per-request services assembled from resources --------------------------
#
# These constructors are cheap (no I/O), so building them per request is free;
# FastAPI caches each provider within a single request, so the repository is
# shared by the upload and video services on the same request.


def get_video_repository(
    dynamodb_resource: Any = Depends(get_dynamodb_resource),
    settings: Settings = Depends(get_settings),
) -> VideoRepository:
    return VideoRepository(dynamodb_resource, settings)


def get_upload_service(
    s3_client: Any = Depends(get_s3_client),
    repository: VideoRepository = Depends(get_video_repository),
    settings: Settings = Depends(get_settings),
) -> UploadService:
    return UploadService(s3_client, repository, settings)


def get_video_service(
    repository: VideoRepository = Depends(get_video_repository),
    settings: Settings = Depends(get_settings),
    s3_client: Any = Depends(get_s3_client),
) -> VideoService:
    return VideoService(repository, settings, s3_client)


# --- stateful singleton: caches the RSA key loaded from SSM on construction,
# so it must persist across requests. Built lazily on first use and memoized on
# app.state rather than pre-built in the lifespan.


def get_stream_signer(
    request: Request,
    settings: Settings = Depends(get_settings),
    ssm_client: Any = Depends(get_ssm_client),
) -> CloudFrontURLSigner:
    signer = getattr(request.app.state, "stream_signer", None)
    if signer is None:
        signer = CloudFrontURLSigner(settings, ssm_client)
        request.app.state.stream_signer = signer
    return signer


UploadServiceDep = Annotated[UploadService, Depends(get_upload_service)]
VideoServiceDep = Annotated[VideoService, Depends(get_video_service)]
StreamSignerDep = Annotated[CloudFrontURLSigner, Depends(get_stream_signer)]
