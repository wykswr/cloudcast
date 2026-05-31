"""Tests for VideoRepository against a moto-backed DynamoDB.

These exercise the real DynamoDB semantics the repository relies on: the GSI
lookup, the conditional-``ADD`` quota reservation, and ``ALL_NEW`` updates.
"""

import pytest
from fastapi import HTTPException

from app.auth import AuthenticatedUser
from app.services.videos import VideoRepository

USER = "user-1"


@pytest.fixture
def repo(dynamodb, settings) -> VideoRepository:
    return VideoRepository(dynamodb, settings)


def _create(repo, video_id, **overrides):
    kwargs = dict(
        user_id=USER,
        video_id=video_id,
        title="My Video",
        s3_key_raw=f"{USER}/{video_id}/raw/clip.mp4",
        upload_id="upload-1",
        created_at=100,
    )
    kwargs.update(overrides)
    repo.create_upload_record(**kwargs)


def test_create_and_get_video_round_trip(repo):
    _create(repo, "v1", size_bytes=500, duration_seconds=12.9)
    video = repo.get_video(USER, "v1")
    assert video["id"] == "v1"
    assert video["status"] == "uploading"
    assert video["upload_id"] == "upload-1"
    assert int(video["size_bytes"]) == 500
    # duration is rounded to a whole-second int before storage
    assert int(video["duration_seconds"]) == 12


def test_get_video_missing_returns_none(repo):
    assert repo.get_video(USER, "nope") is None


def test_get_video_by_id_uses_gsi(repo):
    _create(repo, "v1")
    found = repo.get_video_by_id("v1")
    assert found is not None
    assert found["user_id"] == USER
    assert repo.get_video_by_id("absent") is None


def test_list_videos_sorted_by_created_at_desc(repo):
    _create(repo, "old", created_at=100)
    _create(repo, "new", created_at=300)
    _create(repo, "mid", created_at=200)
    ids = [v["id"] for v in repo.list_videos(USER)]
    assert ids == ["new", "mid", "old"]


def test_mark_processing_sets_status_and_removes_upload_id(repo):
    _create(repo, "v1")
    repo.mark_processing(USER, "v1", hls_key=f"{USER}/v1/hls/clip.m3u8")
    video = repo.get_video(USER, "v1")
    assert video["status"] == "processing"
    assert video["s3_key_hls"] == f"{USER}/v1/hls/clip.m3u8"
    assert "upload_id" not in video


def test_update_fields_returns_all_new(repo):
    _create(repo, "v1")
    updated = repo.update_fields(USER, "v1", {"title": "Renamed", "favorite": True})
    assert updated["title"] == "Renamed"
    assert updated["favorite"] is True


def test_assert_owner_raises_404_on_mismatch(repo):
    with pytest.raises(HTTPException) as exc:
        repo.assert_owner(USER, {"user_id": "someone-else"})
    assert exc.value.status_code == 404


def test_reserve_storage_within_quota(repo):
    repo.reserve_storage(USER, 600)
    repo.reserve_storage(USER, 300)  # total 900, under the 1000 quota


def test_reserve_storage_cumulative_over_quota_raises_413(repo):
    repo.reserve_storage(USER, 600)
    with pytest.raises(HTTPException) as exc:
        repo.reserve_storage(USER, 600)  # would total 1200 > 1000
    assert exc.value.status_code == 413
    assert "exceed" in exc.value.detail.lower()


def test_reserve_storage_single_object_over_quota_raises_413(repo):
    with pytest.raises(HTTPException) as exc:
        repo.reserve_storage(USER, 5000)
    assert exc.value.status_code == 413
    assert "exceeds" in exc.value.detail.lower()


def test_reconcile_user_storage_recomputes_from_videos(repo):
    _create(repo, "v1", size_bytes=200)
    _create(repo, "v2", size_bytes=300)
    # Drift the counter, then prove reconcile overwrites it with the true sum.
    repo.reserve_storage(USER, 900)
    total = repo.reconcile_user_storage(USER)
    assert total == 500
    item = repo.users_table.get_item(Key={"id": USER})["Item"]
    assert int(item["storage_used_bytes"]) == 500
