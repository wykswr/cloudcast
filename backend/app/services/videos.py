import logging
import time
from typing import Any

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from fastapi import HTTPException, status

from ..auth import AuthenticatedUser
from ..config import Settings

logger = logging.getLogger(__name__)


class VideoRepository:
    def __init__(self, dynamodb_resource, settings: Settings):
        self.settings = settings
        self.videos_table = dynamodb_resource.Table(settings.videos_table)
        self.users_table = dynamodb_resource.Table(settings.users_table)

    def ensure_user_record(self, user: AuthenticatedUser) -> None:
        now = int(time.time())
        email_value = user.email or f"user-{user.id}"
        try:
            self.users_table.update_item(
                Key={"id": user.id},
                UpdateExpression=(
                    "SET email = if_not_exists(email, :email), "
                    "created_at = if_not_exists(created_at, :created_at)"
                ),
                ExpressionAttributeValues={
                    ":email": email_value,
                    ":created_at": now,
                },
            )
        except ClientError as exc:
            error = exc.response.get("Error", {})
            logger.exception(
                "Unable to persist user record",
                extra={
                    "user_id": user.id,
                    "error_code": error.get("Code"),
                    "error_message": error.get("Message"),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to persist user record: {error.get('Message', 'Unknown error')}",
            ) from exc

    def create_upload_record(
        self,
        user_id: str,
        video_id: str,
        title: str,
        s3_key_raw: str,
        upload_id: str,
        created_at: int,
    ) -> None:
        item: dict[str, Any] = {
            "user_id": user_id,
            "id": video_id,
            "title": title,
            "s3_key_raw": s3_key_raw,
            "status": "uploading",
            "upload_id": upload_id,
            "created_at": created_at,
        }

        try:
            self.videos_table.put_item(Item=item)
        except ClientError as exc:
            error = exc.response.get("Error", {})
            logger.exception(
                "Unable to persist upload record",
                extra={
                    "user_id": user_id,
                    "video_id": video_id,
                    "error_code": error.get("Code"),
                    "error_message": error.get("Message"),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to persist upload record: {error.get('Message', 'Unknown error')}",
            ) from exc

    def get_video(self, user_id: str, video_id: str) -> dict[str, Any] | None:
        try:
            response = self.videos_table.get_item(
                Key={"user_id": user_id, "id": video_id}
            )
        except ClientError as exc:
            error = exc.response.get("Error", {})
            logger.exception(
                "Unable to read video record",
                extra={
                    "user_id": user_id,
                    "video_id": video_id,
                    "error_code": error.get("Code"),
                    "error_message": error.get("Message"),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to read video record: {error.get('Message', 'Unknown error')}",
            ) from exc
        return response.get("Item")

    def get_video_by_id(self, video_id: str) -> dict[str, Any] | None:
        try:
            response = self.videos_table.query(
                IndexName=self.settings.video_id_index,
                KeyConditionExpression=Key("id").eq(video_id),
                Limit=1,
            )
        except ClientError as exc:
            error = exc.response.get("Error", {})
            logger.exception(
                "Unable to read video record",
                extra={
                    "video_id": video_id,
                    "error_code": error.get("Code"),
                    "error_message": error.get("Message"),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to read video record: {error.get('Message', 'Unknown error')}",
            ) from exc

        items = response.get("Items") or []
        return items[0] if items else None

    def list_videos(self, user_id: str) -> list[dict[str, Any]]:
        try:
            response = self.videos_table.query(
                KeyConditionExpression=Key("user_id").eq(user_id)
            )
        except ClientError as exc:
            error = exc.response.get("Error", {})
            logger.exception(
                "Unable to list videos",
                extra={
                    "user_id": user_id,
                    "error_code": error.get("Code"),
                    "error_message": error.get("Message"),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to list videos: {error.get('Message', 'Unknown error')}",
            ) from exc

        return sorted(
            response.get("Items") or [],
            key=lambda item: item.get("created_at", 0),
            reverse=True,
        )

    def mark_processing(self, user_id: str, video_id: str, hls_key: str) -> None:
        try:
            self.videos_table.update_item(
                Key={"user_id": user_id, "id": video_id},
                UpdateExpression="SET #status = :processing, s3_key_hls = :hls REMOVE upload_id",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={
                    ":processing": "processing",
                    ":hls": hls_key,
                },
            )
        except ClientError as exc:
            error = exc.response.get("Error", {})
            logger.exception(
                "Unable to update video status",
                extra={
                    "user_id": user_id,
                    "video_id": video_id,
                    "error_code": error.get("Code"),
                    "error_message": error.get("Message"),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to update video status: {error.get('Message', 'Unknown error')}",
            ) from exc

    def assert_owner(self, user_id: str, video: dict[str, Any]) -> None:
        if video.get("user_id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Video not found"
            )

    def delete_video(self, user_id: str, video_id: str) -> None:
        try:
            self.videos_table.delete_item(Key={"user_id": user_id, "id": video_id})
        except ClientError as exc:
            error = exc.response.get("Error", {})
            logger.exception(
                "Unable to delete video record",
                extra={
                    "user_id": user_id,
                    "video_id": video_id,
                    "error_code": error.get("Code"),
                    "error_message": error.get("Message"),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to delete video record: {error.get('Message', 'Unknown error')}",
            ) from exc


class VideoService:
    def __init__(self, repository: VideoRepository, settings: Settings, s3_client):
        self.repository = repository
        self.settings = settings
        self.s3 = s3_client

    def list_user_videos(self, user: AuthenticatedUser) -> list[dict[str, Any]]:
        return self.repository.list_videos(user.id)

    def load_owned_video(self, user: AuthenticatedUser, video_id: str) -> dict[str, Any]:
        video = self.repository.get_video_by_id(video_id)
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Video not found"
            )
        self.repository.assert_owner(user.id, video)
        return video

    def _delete_s3_prefix(self, bucket: str, prefix: str) -> None:
        paginator = self.s3.get_paginator("list_objects_v2")
        try:
            for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
                contents = page.get("Contents") or []
                if not contents:
                    continue
                objects = [{"Key": item["Key"]} for item in contents]
                # Delete in chunks of 1000 to respect S3 limits.
                for start in range(0, len(objects), 1000):
                    chunk = objects[start : start + 1000]
                    self.s3.delete_objects(
                        Bucket=bucket, Delete={"Objects": chunk, "Quiet": True}
                    )
        except ClientError as exc:
            error = exc.response.get("Error", {})
            logger.exception(
                "Unable to delete S3 media objects",
                extra={
                    "bucket": bucket,
                    "prefix": prefix,
                    "error_code": error.get("Code"),
                    "error_message": error.get("Message"),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to delete media objects: {error.get('Message', 'Unknown error')}",
            ) from exc

    def delete_video(self, user: AuthenticatedUser, video_id: str) -> None:
        video = self.load_owned_video(user, video_id)

        raw_prefix = f"{user.id}/{video_id}/"
        self._delete_s3_prefix(self.settings.raw_uploads_bucket, raw_prefix)

        hls_key = video.get("s3_key_hls")
        hls_prefix = (
            hls_key.rsplit("/", 1)[0] + "/"
            if hls_key and "/" in hls_key
            else f"{user.id}/{video_id}/hls/"
        )
        self._delete_s3_prefix(self.settings.processed_videos_bucket, hls_prefix)

        self.repository.delete_video(user.id, video_id)
