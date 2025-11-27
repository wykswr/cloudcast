import boto3
from botocore.client import Config as BotoConfig

from .config import Settings


def create_s3_client(settings: Settings):
    endpoint = settings.s3_endpoint_url or f"https://s3.{settings.aws_region}.amazonaws.com"
    return boto3.client(
        "s3",
        region_name=settings.aws_region,
        endpoint_url=endpoint,
        config=BotoConfig(
            signature_version="s3v4",
            s3={"addressing_style": "virtual"},
        ),
    )


def create_dynamodb_resource(settings: Settings):
    endpoint = settings.dynamodb_endpoint_url or None
    kwargs = {"region_name": settings.aws_region}
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.resource("dynamodb", **kwargs)
