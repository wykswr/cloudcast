"""Tests for UploadService multipart orchestration and its status guards."""

import pytest
from fastapi import HTTPException

from app.auth import AuthenticatedUser
from app.schemas import UploadInitRequest, UploadPart
from app.services.uploads import UploadService
from app.services.videos import VideoRepository

USER = "user-1"


@pytest.fixture
def repo(dynamodb, settings) -> VideoRepository:
    return VideoRepository(dynamodb, settings)


@pytest.fixture
def service(s3, repo, settings) -> UploadService:
    return UploadService(s3, repo, settings)


@pytest.fixture
def user() -> AuthenticatedUser:
    return AuthenticatedUser(id=USER, email="u@example.com", groups=["admin"])


def _init(service, user, **overrides):
    payload_kwargs = dict(filename="clip.mp4", content_type="video/mp4")
    payload_kwargs.update(overrides)
    payload = UploadInitRequest(**payload_kwargs)
    return service.initiate_upload(user, payload)


def test_initiate_upload_creates_multipart_and_record(service, repo, settings, s3, user):
    upload_id, video_id = _init(service, user, size_bytes=500)

    video = repo.get_video(USER, video_id)
    assert video["status"] == "uploading"
    assert video["upload_id"] == upload_id
    assert video["s3_key_raw"] == f"{USER}/{video_id}/raw/clip.mp4"

    uploads = s3.list_multipart_uploads(Bucket=settings.raw_uploads_bucket)
    assert any(u["UploadId"] == upload_id for u in uploads.get("Uploads", []))


def test_initiate_upload_over_quota_fails_before_multipart(service, settings, s3, user):
    with pytest.raises(HTTPException) as exc:
        _init(service, user, size_bytes=5000)  # exceeds the 1000-byte quota
    assert exc.value.status_code == 413
    # No orphaned multipart session should have been opened.
    uploads = s3.list_multipart_uploads(Bucket=settings.raw_uploads_bucket)
    assert uploads.get("Uploads", []) == []


def test_presign_part_returns_url(service, user):
    upload_id, video_id = _init(service, user)
    url = service.presign_part(user, video_id, upload_id, part_number=1)
    assert isinstance(url, str) and url.startswith("http")


def test_presign_part_unknown_video_raises_404(service, user):
    with pytest.raises(HTTPException) as exc:
        service.presign_part(user, "absent", "upload-x", part_number=1)
    assert exc.value.status_code == 404


def test_presign_part_upload_id_mismatch_raises_400(service, user):
    _, video_id = _init(service, user)
    with pytest.raises(HTTPException) as exc:
        service.presign_part(user, video_id, "wrong-upload-id", part_number=1)
    assert exc.value.status_code == 400


def test_presign_part_wrong_status_raises_409(service, repo, user):
    upload_id, video_id = _init(service, user)
    # Move out of "uploading" while keeping upload_id so the status guard (409),
    # not the upload-id mismatch guard (400), is the one that trips.
    repo.update_fields(USER, video_id, {"status": "processing"})
    with pytest.raises(HTTPException) as exc:
        service.presign_part(user, video_id, upload_id, part_number=1)
    assert exc.value.status_code == 409


def test_complete_upload_empty_parts_raises_400(service, user):
    upload_id, video_id = _init(service, user)
    with pytest.raises(HTTPException) as exc:
        service.complete_upload(user, video_id, upload_id, parts=[])
    assert exc.value.status_code == 400


def test_complete_upload_marks_processing_with_derived_hls_key(
    service, repo, settings, s3, user
):
    upload_id, video_id = _init(service, user)
    key = f"{USER}/{video_id}/raw/clip.mp4"

    part = s3.upload_part(
        Bucket=settings.raw_uploads_bucket,
        Key=key,
        PartNumber=1,
        UploadId=upload_id,
        Body=b"some-bytes",
    )

    service.complete_upload(
        user,
        video_id,
        upload_id,
        parts=[UploadPart(etag=part["ETag"], part_number=1)],
    )

    video = repo.get_video(USER, video_id)
    assert video["status"] == "processing"
    # HLS key derived from the original filename stem (cross-system contract).
    assert video["s3_key_hls"] == f"{USER}/{video_id}/hls/clip.m3u8"
    assert "upload_id" not in video
