from typing import Annotated

from fastapi import Depends

from app.container import AppContainer, get_app_container
from app.services.cloudfront import CloudFrontURLSigner
from app.services.uploads import UploadService
from app.services.videos import VideoRepository, VideoService


def get_video_repository(
    container: AppContainer = Depends(get_app_container),
) -> VideoRepository:
    return container.video_repository


def get_upload_service(
    container: AppContainer = Depends(get_app_container),
) -> UploadService:
    return container.upload_service


def get_video_service(
    container: AppContainer = Depends(get_app_container),
) -> VideoService:
    return container.video_service


def get_stream_signer(
    container: AppContainer = Depends(get_app_container),
) -> CloudFrontURLSigner:
    return container.stream_signer


UploadServiceDep = Annotated[UploadService, Depends(get_upload_service)]
VideoServiceDep = Annotated[VideoService, Depends(get_video_service)]
StreamSignerDep = Annotated[CloudFrontURLSigner, Depends(get_stream_signer)]
