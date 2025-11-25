import time
from typing import Any

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from fastapi import HTTPException, status

from ..auth import AuthenticatedUser
from ..config import Settings


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
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to persist user record",
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
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to persist upload record",
            ) from exc

    def get_video(self, user_id: str, video_id: str) -> dict[str, Any] | None:
        try:
            response = self.videos_table.get_item(
                Key={"user_id": user_id, "id": video_id}
            )
        except ClientError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to read video record",
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
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to read video record",
            ) from exc

        items = response.get("Items") or []
        return items[0] if items else None

    def list_videos(self, user_id: str) -> list[dict[str, Any]]:
        try:
            response = self.videos_table.query(
                KeyConditionExpression=Key("user_id").eq(user_id)
            )
        except ClientError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to list videos",
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
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to update video status",
            ) from exc

    def assert_owner(self, user_id: str, video: dict[str, Any]) -> None:
        if video.get("user_id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Video not found"
            )


class VideoService:
    def __init__(self, repository: VideoRepository, settings: Settings):
        self.repository = repository
        self.settings = settings

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
