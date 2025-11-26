from functools import lru_cache

from app.auth import AuthenticatedUser, get_current_user
from app.aws import get_dynamodb_resource, get_s3_client
from app.config import get_settings
from app.schemas import (
    CompleteUploadRequest,
    CompleteUploadResponse,
    DeleteVideoResponse,
    SignPartRequest,
    SignPartResponse,
    StreamResponse,
    UploadInitRequest,
    UploadInitResponse,
    VideoListItem,
    VideoListResponse,
)
from app.services.cloudfront import CloudFrontURLSigner
from app.services.uploads import UploadService
from app.services.videos import VideoRepository, VideoService
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

settings = get_settings()

app = FastAPI(title="CloudCast API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
router = APIRouter(prefix="/videos", tags=["videos"])


@lru_cache
def get_video_repository() -> VideoRepository:
    return VideoRepository(get_dynamodb_resource(), settings)


@lru_cache
def get_upload_service() -> UploadService:
    return UploadService(get_s3_client(), get_video_repository(), settings)


@lru_cache
def get_video_service() -> VideoService:
    return VideoService(get_video_repository(), settings, get_s3_client())


@lru_cache
def get_stream_signer() -> CloudFrontURLSigner:
    return CloudFrontURLSigner(settings)


@router.post("/upload/init", response_model=UploadInitResponse)
def initiate_upload(
    payload: UploadInitRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    service: UploadService = Depends(get_upload_service),
) -> UploadInitResponse:
    upload_id, video_id = service.initiate_upload(user, payload)
    return UploadInitResponse(upload_id=upload_id, video_id=video_id)


@router.post("/upload/sign-part", response_model=SignPartResponse)
def sign_upload_part(
    payload: SignPartRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    service: UploadService = Depends(get_upload_service),
) -> SignPartResponse:
    presigned_url = service.presign_part(
        user=user,
        video_id=payload.video_id,
        upload_id=payload.upload_id,
        part_number=payload.part_number,
    )
    return SignPartResponse(presigned_url=presigned_url)


@router.post("/upload/complete", response_model=CompleteUploadResponse)
def complete_upload(
    payload: CompleteUploadRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    service: UploadService = Depends(get_upload_service),
) -> CompleteUploadResponse:
    service.complete_upload(
        user=user,
        video_id=payload.video_id,
        upload_id=payload.upload_id,
        parts=payload.parts,
    )
    return CompleteUploadResponse(status="processing")


@router.get("", response_model=VideoListResponse)
def list_videos(
    user: AuthenticatedUser = Depends(get_current_user),
    service: VideoService = Depends(get_video_service),
) -> VideoListResponse:
    items = service.list_user_videos(user)
    return VideoListResponse(items=[VideoListItem(**item) for item in items])


@router.delete("/{video_id}", response_model=DeleteVideoResponse)
def delete_video(
    video_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    service: VideoService = Depends(get_video_service),
) -> DeleteVideoResponse:
    service.delete_video(user, video_id)
    return DeleteVideoResponse(status="deleted")


@router.get("/{video_id}/stream", response_model=StreamResponse)
def get_stream_url(
    video_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    service: VideoService = Depends(get_video_service),
    signer: CloudFrontURLSigner = Depends(get_stream_signer),
) -> StreamResponse:
    video = service.load_owned_video(user, video_id)
    if video.get("status") != "ready" or not video.get("s3_key_hls"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Video not ready for streaming",
        )

    try:
        url = signer.sign(video["s3_key_hls"])
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to sign stream URL",
        ) from exc

    return StreamResponse(stream_url=url)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(router)
