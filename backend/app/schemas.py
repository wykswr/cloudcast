from pydantic import BaseModel, ConfigDict, Field


class UploadInitRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    filename: str
    content_type: str = Field(..., alias="contentType")
    title: str | None = None
    size_bytes: int | None = Field(default=None, alias="sizeBytes", ge=0)
    duration_seconds: float | None = Field(default=None, alias="durationSeconds", ge=0)


class UploadInitResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    upload_id: str = Field(..., alias="uploadId")
    video_id: str = Field(..., alias="videoId")


class SignPartRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    video_id: str = Field(..., alias="videoId")
    upload_id: str = Field(..., alias="uploadId")
    part_number: int = Field(..., alias="partNumber", ge=1)


class SignPartResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    presigned_url: str = Field(..., alias="presignedUrl")


class UploadPart(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    etag: str = Field(..., alias="etag")
    part_number: int = Field(..., alias="partNumber", ge=1)


class CompleteUploadRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    video_id: str = Field(..., alias="videoId")
    upload_id: str = Field(..., alias="uploadId")
    parts: list[UploadPart]


class CompleteUploadResponse(BaseModel):
    status: str


class VideoListItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str | None = None
    status: str
    created_at: int = Field(..., alias="createdAt")
    s3_key_hls: str | None = Field(default=None, alias="s3KeyHls")
    size_bytes: int | None = Field(default=None, alias="sizeBytes")
    duration_seconds: float | None = Field(default=None, alias="durationSeconds")
    favorite: bool = False


class VideoListResponse(BaseModel):
    items: list[VideoListItem]


class UpdateVideoRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = None
    favorite: bool | None = None


class StreamResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    stream_url: str = Field(..., alias="streamUrl")


class DeleteVideoResponse(BaseModel):
    status: str
