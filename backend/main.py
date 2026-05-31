from contextlib import asynccontextmanager

from app.api import get_api_router
from app.aws import create_dynamodb_resource, create_s3_client, create_ssm_client
from app.config import get_settings
from app.resources import AppResources
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

settings = get_settings()


def _close(client) -> None:
    close = getattr(client, "close", None)
    if callable(close):
        close()


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # The lifespan owns only the raw AWS SDK singletons. Repositories,
        # services, the token verifier and the URL signer are assembled per
        # request from these via the `Depends` providers in app.api.dependencies
        # and app.auth — nothing higher-level is constructed here.
        s3_client = create_s3_client(settings)
        dynamodb_resource = create_dynamodb_resource(settings)
        ssm_client = create_ssm_client(settings)

        app.state.resources = AppResources(
            settings=settings,
            s3_client=s3_client,
            dynamodb_resource=dynamodb_resource,
            ssm_client=ssm_client,
        )

        try:
            yield
        finally:
            _close(s3_client)
            _close(ssm_client)
            _close(getattr(getattr(dynamodb_resource, "meta", None), "client", None))

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
