from contextlib import asynccontextmanager

from app.api import get_api_router
from app.auth import CognitoTokenVerifier
from app.aws import create_dynamodb_resource, create_s3_client
from app.config import get_settings
from app.container import AppContainer
from app.services.cloudfront import CloudFrontURLSigner
from app.services.uploads import UploadService
from app.services.videos import VideoRepository, VideoService
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

settings = get_settings()


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        s3_client = create_s3_client(settings)
        dynamodb_resource = create_dynamodb_resource(settings)
        video_repository = VideoRepository(dynamodb_resource, settings)
        upload_service = UploadService(s3_client, video_repository, settings)
        video_service = VideoService(video_repository, settings, s3_client)
        stream_signer = CloudFrontURLSigner(settings)
        token_verifier = CognitoTokenVerifier(
            region=settings.aws_region,
            user_pool_id=settings.cognito_user_pool_id,
            client_id=settings.cognito_client_id,
            ttl_seconds=settings.jwks_cache_seconds,
        )

        app.state.container = AppContainer(
            settings=settings,
            s3_client=s3_client,
            dynamodb_resource=dynamodb_resource,
            video_repository=video_repository,
            upload_service=upload_service,
            video_service=video_service,
            stream_signer=stream_signer,
            token_verifier=token_verifier,
        )

        try:
            yield
        finally:
            close_s3 = getattr(s3_client, "close", None)
            if callable(close_s3):
                close_s3()

            dynamodb_client = getattr(
                getattr(dynamodb_resource, "meta", None), "client", None
            )
            close_dynamodb = getattr(dynamodb_client, "close", None)
            if callable(close_dynamodb):
                close_dynamodb()

    app = FastAPI(title="CloudCast API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(get_api_router())
    return app


app = create_app()
