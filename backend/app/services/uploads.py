import time
import uuid
from pathlib import Path
from typing import Iterable

from botocore.exceptions import ClientError
from fastapi import HTTPException, status

from ..auth import AuthenticatedUser
from ..config import Settings
from ..schemas import UploadInitRequest, UploadPart
from .videos import VideoRepository


class UploadService:
    def __init__(self, s3_client, repository: VideoRepository, settings: Settings):
        self.s3 = s3_client
        self.repository = repository
        self.settings = settings

    def initiate_upload(
        self, user: AuthenticatedUser, payload: UploadInitRequest
    ) -> tuple[str, str]:
        self.repository.ensure_user_record(user)

        video_id = str(uuid.uuid4())
        s3_key_raw = f"{user.id}/{video_id}/raw/{payload.filename}"

        try:
            response = self.s3.create_multipart_upload(
                Bucket=self.settings.raw_uploads_bucket,
                Key=s3_key_raw,
                ContentType=payload.content_type,
                Metadata={
                    "video_id": video_id,
                    "user_id": user.id,
                    "title": payload.title or payload.filename,
                },
            )
        except ClientError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to initiate upload with S3",
            ) from exc

        upload_id = response["UploadId"]
        created_at = int(time.time())

        self.repository.create_upload_record(
            user_id=user.id,
            video_id=video_id,
            title=payload.title or payload.filename,
            s3_key_raw=s3_key_raw,
            upload_id=upload_id,
            created_at=created_at,
        )

        return upload_id, video_id

    def presign_part(
        self, user: AuthenticatedUser, video_id: str, upload_id: str, part_number: int
    ) -> str:
        video = self.repository.get_video(user.id, video_id)
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Video not found"
            )

        if video.get("upload_id") != upload_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Upload session does not match",
            )

        if video.get("status") != "uploading":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Upload is not active",
            )

        try:
            return self.s3.generate_presigned_url(
                "upload_part",
                Params={
                    "Bucket": self.settings.raw_uploads_bucket,
                    "Key": video["s3_key_raw"],
                    "UploadId": upload_id,
                    "PartNumber": part_number,
                },
                ExpiresIn=self.settings.multipart_url_expiration_seconds,
            )
        except ClientError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to generate presigned URL",
            ) from exc

    def complete_upload(
        self,
        user: AuthenticatedUser,
        video_id: str,
        upload_id: str,
        parts: Iterable[UploadPart],
    ) -> None:
        video = self.repository.get_video(user.id, video_id)
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Video not found"
            )

        if video.get("upload_id") != upload_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Upload session does not match",
            )

        if video.get("status") != "uploading":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Upload is not active",
            )

        sorted_parts = sorted(
            ({"ETag": part.etag, "PartNumber": part.part_number} for part in parts),
            key=lambda item: item["PartNumber"],
        )

        if not sorted_parts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No upload parts provided",
            )

        # Derive the HLS master manifest name from the original upload filename so it
        # matches MediaConvert's default naming convention.
        stem = Path(video["s3_key_raw"]).name.rsplit(".", 1)[0]
        hls_key = video.get("s3_key_hls") or f"{user.id}/{video_id}/hls/{stem}.m3u8"

        try:
            self.s3.complete_multipart_upload(
                Bucket=self.settings.raw_uploads_bucket,
                Key=video["s3_key_raw"],
                UploadId=upload_id,
                MultipartUpload={"Parts": sorted_parts},
            )
        except ClientError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to complete upload",
            ) from exc

        self.repository.mark_processing(
            user_id=user.id, video_id=video_id, hls_key=hls_key
        )
