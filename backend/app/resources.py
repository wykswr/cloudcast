from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Request

from .config import Settings


@dataclass
class AppResources:
    """Process-lived singletons created once in the app lifespan.

    Holds only the raw AWS SDK clients/resources (plus settings). Higher-level
    collaborators (repositories, services, the token verifier, the URL signer)
    are assembled from these via the ``Depends`` providers in
    ``app.api.dependencies`` and ``app.auth`` — they are never pre-built here.
    """

    settings: Settings
    s3_client: Any
    dynamodb_resource: Any
    ssm_client: Any


def get_app_resources(request: Request) -> AppResources:
    resources = getattr(request.app.state, "resources", None)
    if resources is None:
        raise RuntimeError("Application resources are not initialized")
    return resources
