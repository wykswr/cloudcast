from fastapi import APIRouter

from app.api.routes import health_router, videos_router


def get_api_router() -> APIRouter:
    router = APIRouter()
    router.include_router(health_router)
    router.include_router(videos_router)
    return router
