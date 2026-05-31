"""Tests for VideoService business logic (ownership, update, delete cascade)."""

import pytest
from fastapi import HTTPException

from app.auth import AuthenticatedUser
from app.services.videos import VideoRepository, VideoService

USER = "user-1"


@pytest.fixture
def repo(dynamodb, settings) -> VideoRepository:
    return VideoRepository(dynamodb, settings)


@pytest.fixture
def service(repo, settings, s3) -> VideoService:
    return VideoService(repo, settings, s3)


@pytest.fixture
def user() -> AuthenticatedUser:
    return AuthenticatedUser(id=USER, groups=["admin"])


def _create(repo, video_id, owner=USER, **overrides):
    item = {
        "user_id": owner,
        "id": video_id,
        "title": "My Video",
        "s3_key_raw": f"{owner}/{video_id}/raw/clip.mp4",
        "status": "uploading",
        "upload_id": "upload-1",
        "created_at": 100,
        "favorite": False,
    }
    item.update(overrides)
    repo.videos_table.put_item(Item=item)


def test_load_owned_video_missing_raises_404(service, user):
    with pytest.raises(HTTPException) as exc:
        service.load_owned_video(user, "absent")
    assert exc.value.status_code == 404


def test_load_owned_video_not_owner_raises_404(service, repo, user):
    _create(repo, "v1", owner="someone-else")
    with pytest.raises(HTTPException) as exc:
        service.load_owned_video(user, "v1")
    assert exc.value.status_code == 404


def test_update_video_empty_fields_returns_current(service, repo, user):
    _create(repo, "v1")
    result = service.update_video(user, "v1", {})
    assert result["id"] == "v1"
    assert result["title"] == "My Video"


def test_update_video_applies_fields(service, repo, user):
    _create(repo, "v1")
    result = service.update_video(user, "v1", {"title": "Renamed", "favorite": True})
    assert result["title"] == "Renamed"
    assert result["favorite"] is True


def test_delete_video_cascades_s3_and_reconciles(service, repo, settings, s3, user):
    _create(
        repo,
        "v1",
        size_bytes=200,
        s3_key_hls=f"{USER}/v1/hls/clip.m3u8",
    )
    repo.reserve_storage(USER, 200)

    # Seed raw + HLS objects across both buckets.
    s3.put_object(
        Bucket=settings.raw_uploads_bucket, Key=f"{USER}/v1/raw/clip.mp4", Body=b"x"
    )
    s3.put_object(
        Bucket=settings.processed_videos_bucket,
        Key=f"{USER}/v1/hls/clip.m3u8",
        Body=b"y",
    )
    s3.put_object(
        Bucket=settings.processed_videos_bucket,
        Key=f"{USER}/v1/hls/segment0.ts",
        Body=b"z",
    )

    service.delete_video(user, "v1")

    # Record gone.
    assert repo.get_video(USER, "v1") is None
    # S3 objects gone in both buckets.
    raw = s3.list_objects_v2(Bucket=settings.raw_uploads_bucket, Prefix=f"{USER}/v1/")
    hls = s3.list_objects_v2(
        Bucket=settings.processed_videos_bucket, Prefix=f"{USER}/v1/"
    )
    assert raw.get("KeyCount", 0) == 0
    assert hls.get("KeyCount", 0) == 0
    # Quota counter reconciled to zero (no videos left).
    item = repo.users_table.get_item(Key={"id": USER})["Item"]
    assert int(item["storage_used_bytes"]) == 0
