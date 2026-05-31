"""End-to-end HTTP tests for the /videos routes.

Uses TestClient over moto-backed AWS. Auth is supplied by overriding
``get_current_user`` in the client fixtures (admin / plain / anon), so these
tests focus on routing, the admin gate, status codes, and the camelCase wire
contract rather than JWT mechanics (covered in test_auth.py).
"""

import pytest

from app.services.videos import VideoRepository

ADMIN_ID = "user-admin"
PLAIN_ID = "user-plain"


@pytest.fixture
def repo(dynamodb, settings) -> VideoRepository:
    return VideoRepository(dynamodb, settings)


def _seed(repo, video_id, owner, **overrides):
    item = {
        "user_id": owner,
        "id": video_id,
        "title": "Seeded",
        "s3_key_raw": f"{owner}/{video_id}/raw/clip.mp4",
        "status": "uploading",
        "upload_id": "upload-1",
        "created_at": 100,
        "favorite": False,
    }
    item.update(overrides)
    repo.videos_table.put_item(Item=item)


# --- listing + auth ---------------------------------------------------------


def test_list_videos_returns_user_items(user_client, repo):
    _seed(repo, "v1", PLAIN_ID, created_at=200)
    _seed(repo, "v2", PLAIN_ID, created_at=100)
    resp = user_client.get("/videos")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert [i["id"] for i in items] == ["v1", "v2"]
    # camelCase wire contract
    assert "createdAt" in items[0]


def test_list_videos_requires_auth(anon_client):
    assert anon_client.get("/videos").status_code == 401


def test_upload_init_requires_admin(user_client):
    resp = user_client.post(
        "/videos/upload/init",
        json={"filename": "clip.mp4", "contentType": "video/mp4"},
    )
    assert resp.status_code == 403


# --- upload flow ------------------------------------------------------------


def test_upload_flow_init_sign_complete(admin_client, repo, settings, s3):
    init = admin_client.post(
        "/videos/upload/init",
        json={"filename": "clip.mp4", "contentType": "video/mp4", "sizeBytes": 500},
    )
    assert init.status_code == 200
    body = init.json()
    assert "uploadId" in body and "videoId" in body
    upload_id, video_id = body["uploadId"], body["videoId"]

    sign = admin_client.post(
        "/videos/upload/sign-part",
        json={"videoId": video_id, "uploadId": upload_id, "partNumber": 1},
    )
    assert sign.status_code == 200
    assert sign.json()["presignedUrl"].startswith("http")

    # Upload a real part into moto so complete_multipart_upload succeeds.
    part = s3.upload_part(
        Bucket=settings.raw_uploads_bucket,
        Key=f"{ADMIN_ID}/{video_id}/raw/clip.mp4",
        PartNumber=1,
        UploadId=upload_id,
        Body=b"data",
    )

    complete = admin_client.post(
        "/videos/upload/complete",
        json={
            "videoId": video_id,
            "uploadId": upload_id,
            "parts": [{"etag": part["ETag"], "partNumber": 1}],
        },
    )
    assert complete.status_code == 200
    assert complete.json()["status"] == "processing"
    assert repo.get_video(ADMIN_ID, video_id)["status"] == "processing"


# --- patch / delete ---------------------------------------------------------


def test_patch_video_updates_fields(admin_client, repo):
    _seed(repo, "v1", ADMIN_ID)
    resp = admin_client.patch("/videos/v1", json={"title": "Renamed", "favorite": True})
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Renamed"
    assert body["favorite"] is True


def test_patch_other_users_video_returns_404(admin_client, repo):
    _seed(repo, "v1", "stranger")
    resp = admin_client.patch("/videos/v1", json={"title": "Hijack"})
    assert resp.status_code == 404


def test_delete_video(admin_client, repo, settings, s3):
    _seed(repo, "v1", ADMIN_ID, size_bytes=100, s3_key_hls=f"{ADMIN_ID}/v1/hls/clip.m3u8")
    s3.put_object(
        Bucket=settings.raw_uploads_bucket, Key=f"{ADMIN_ID}/v1/raw/clip.mp4", Body=b"x"
    )
    resp = admin_client.delete("/videos/v1")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"
    assert repo.get_video(ADMIN_ID, "v1") is None


# --- streaming --------------------------------------------------------------


def test_stream_not_ready_returns_409(admin_client, repo):
    _seed(repo, "v1", ADMIN_ID)  # status=uploading
    assert admin_client.get("/videos/v1/stream").status_code == 409


def test_stream_ready_returns_signed_url(admin_client, repo):
    _seed(
        repo,
        "v1",
        ADMIN_ID,
        status="ready",
        s3_key_hls=f"{ADMIN_ID}/v1/hls/clip.m3u8",
    )
    resp = admin_client.get("/videos/v1/stream")
    assert resp.status_code == 200
    assert resp.json()["streamUrl"].startswith("https://")
