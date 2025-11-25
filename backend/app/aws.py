from functools import lru_cache

import boto3
from botocore.client import Config as BotoConfig

from .config import get_settings


@lru_cache
def get_s3_client():
    settings = get_settings()
    return boto3.client(
        "s3",
        region_name=settings.aws_region,
        config=BotoConfig(signature_version="s3v4"),
    )


@lru_cache
def get_dynamodb_resource():
    settings = get_settings()
    return boto3.resource("dynamodb", region_name=settings.aws_region)
