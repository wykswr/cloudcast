from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import StreamSignerDep, UploadServiceDep, VideoServiceDep
from app.auth import AdminUserDep, UserDep
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

router = APIRouter(prefix="/videos", tags=["videos"])


@router.post("/upload/init", response_model=UploadInitResponse)
def initiate_upload(
    payload: UploadInitRequest,
    user: AdminUserDep,
    service: UploadServiceDep,
) -> UploadInitResponse:
    upload_id, video_id = service.initiate_upload(user, payload)
    return UploadInitResponse(upload_id=upload_id, video_id=video_id)


@router.post("/upload/sign-part", response_model=SignPartResponse)
def sign_upload_part(
    payload: SignPartRequest,
    user: AdminUserDep,
    service: UploadServiceDep,
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
    user: AdminUserDep,
    service: UploadServiceDep,
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
    user: UserDep,
    service: VideoServiceDep,
) -> VideoListResponse:
    items = service.list_user_videos(user)
    return VideoListResponse(items=[VideoListItem(**item) for item in items])


@router.delete("/{video_id}", response_model=DeleteVideoResponse)
def delete_video(
    video_id: str,
    user: AdminUserDep,
    service: VideoServiceDep,
) -> DeleteVideoResponse:
    service.delete_video(user, video_id)
    return DeleteVideoResponse(status="deleted")


@router.get("/{video_id}/stream", response_model=StreamResponse)
def get_stream_url(
    video_id: str,
    user: AdminUserDep,
    service: VideoServiceDep,
    signer: StreamSignerDep,
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
