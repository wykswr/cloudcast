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

    def reserve_storage(self, user_id: str, size_bytes: int) -> None:
        """Atomically reserve `size_bytes` against the user's storage quota.

        Uses a conditional ``ADD`` so concurrent uploads can't both slip past the
        limit: the condition checks the *current* usage before the increment, so
        the post-increment total is guaranteed to stay within quota. Raises 413
        when the reservation would exceed the quota. The counter is a
        denormalization of the true per-user sum and can be repaired with
        :meth:`reconcile_user_storage`.
        """
        quota = self.settings.storage_quota_bytes

        # A single object larger than the whole quota can never fit. This also
        # guards the `attribute_not_exists` branch below (first upload), where
        # there's no stored value for the condition to reject against.
        if size_bytes > quota:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="File exceeds your storage quota",
            )

        try:
            self.users_table.update_item(
                Key={"id": user_id},
                UpdateExpression="ADD storage_used_bytes :size",
                ConditionExpression=(
                    "attribute_not_exists(storage_used_bytes) "
                    "OR storage_used_bytes <= :allowed"
                ),
                ExpressionAttributeValues={
                    ":size": size_bytes,
                    ":allowed": quota - size_bytes,
                },
            )
        except ClientError as exc:
            error = exc.response.get("Error", {})
            if error.get("Code") == "ConditionalCheckFailedException":
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail="Upload would exceed your storage quota",
                ) from exc
            logger.exception(
                "Unable to reserve storage quota",
                extra={
                    "user_id": user_id,
                    "error_code": error.get("Code"),
                    "error_message": error.get("Message"),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to reserve storage: {error.get('Message', 'Unknown error')}",
            ) from exc

    def reconcile_user_storage(self, user_id: str) -> int:
        """Recompute `storage_used_bytes` from the user's actual videos.

        The reservation counter can drift from the true sum if a write
        half-fails (e.g. quota reserved but the upload record never lands). This
        recomputes the authoritative total and overwrites the counter. Returns
        the reconciled total.
        """
        total = sum(
            int(video.get("size_bytes", 0) or 0)
            for video in self.list_videos(user_id)
        )
        try:
            self.users_table.update_item(
                Key={"id": user_id},
                UpdateExpression="SET storage_used_bytes = :total",
                ExpressionAttributeValues={":total": total},
            )
        except ClientError as exc:
            error = exc.response.get("Error", {})
            logger.exception(
                "Unable to reconcile storage usage",
                extra={
                    "user_id": user_id,
                    "error_code": error.get("Code"),
                    "error_message": error.get("Message"),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to reconcile storage: {error.get('Message', 'Unknown error')}",
            ) from exc
        return total

    def create_upload_record(
        self,
        user_id: str,
        video_id: str,
        title: str,
        s3_key_raw: str,
        upload_id: str,
        created_at: int,
        size_bytes: int | None = None,
        duration_seconds: float | None = None,
        source_width: int | None = None,
        source_height: int | None = None,
    ) -> None:
        item: dict[str, Any] = {
            "user_id": user_id,
            "id": video_id,
            "title": title,
            "s3_key_raw": s3_key_raw,
            "status": "uploading",
            "upload_id": upload_id,
            "created_at": created_at,
            "favorite": False,
        }
        if size_bytes is not None:
            item["size_bytes"] = size_bytes
        if duration_seconds is not None:
            # DynamoDB stores numbers as Decimal; round to whole seconds to avoid
            # float-precision serialization issues.
            item["duration_seconds"] = int(duration_seconds)
        if source_width is not None:
            item["source_width"] = source_width
        if source_height is not None:
            item["source_height"] = source_height

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

    def update_fields(
        self, user_id: str, video_id: str, fields: dict[str, Any]
    ) -> dict[str, Any]:
        # `favorite` is a plain attribute; `title` is too. Build a safe update
        # expression with placeholder names so reserved words never bite us.
        set_clauses = []
        names: dict[str, str] = {}
        values: dict[str, Any] = {}
        for index, (key, value) in enumerate(fields.items()):
            name_token = f"#f{index}"
            value_token = f":v{index}"
            names[name_token] = key
            values[value_token] = value
            set_clauses.append(f"{name_token} = {value_token}")

        try:
            response = self.videos_table.update_item(
                Key={"user_id": user_id, "id": video_id},
                UpdateExpression="SET " + ", ".join(set_clauses),
                ExpressionAttributeNames=names,
                ExpressionAttributeValues=values,
                ReturnValues="ALL_NEW",
            )
        except ClientError as exc:
            error = exc.response.get("Error", {})
            logger.exception(
                "Unable to update video record",
                extra={
                    "user_id": user_id,
                    "video_id": video_id,
                    "error_code": error.get("Code"),
                    "error_message": error.get("Message"),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to update video record: {error.get('Message', 'Unknown error')}",
            ) from exc

        return response.get("Attributes", {})

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

    def update_video(
        self, user: AuthenticatedUser, video_id: str, fields: dict[str, Any]
    ) -> dict[str, Any]:
        # Confirm ownership before mutating (raises 404 if missing/not owner).
        self.load_owned_video(user, video_id)
        if not fields:
            return self.repository.get_video(user.id, video_id) or {}
        return self.repository.update_fields(user.id, video_id, fields)

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
        # Recompute the quota counter from the remaining videos so freed space is
        # released exactly (no drift from decrementing).
        self.repository.reconcile_user_storage(user.id)
