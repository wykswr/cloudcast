from datetime import datetime, timedelta, timezone

from botocore.signers import CloudFrontSigner
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from ..config import Settings


class CloudFrontURLSigner:
    def __init__(self, settings: Settings, ssm_client):
        self.settings = settings
        self._ssm = ssm_client
        self._private_key = self._load_private_key()
        self._signer = CloudFrontSigner(
            settings.cloudfront_key_id,
            self._rsa_signer,  # type: ignore[arg-type]
        )

    def _load_private_key(self):
        # The SSM client is a shared lifespan singleton — load the key but don't
        # close it.
        name = self.settings.cloudfront_private_key_ssm_name
        cloudfront_private_key = self._ssm.get_parameter(Name=name, WithDecryption=True)[
            "Parameter"
        ]["Value"]
        normalized = cloudfront_private_key.replace("\\n", "\n")
        key_data = normalized.encode("utf-8")

        if not key_data:
            raise ValueError(
                "CloudFront private key is not configured via path or inline value."
            )
        return serialization.load_pem_private_key(key_data, password=None)

    def _rsa_signer(self, message: bytes) -> bytes:
        return self._private_key.sign(
            message,
            padding.PKCS1v15(),
            hashes.SHA1(),
        )

    def sign(self, object_path: str) -> str:
        normalized = object_path.lstrip("/")
        manifest_url = f"https://{self.settings.cloudfront_domain}/{normalized}"
        # Sign the entire HLS prefix (master + variants + segments) so the same
        # token works for every request under the folder.
        prefix = normalized.rsplit("/", 1)[0] if "/" in normalized else ""
        wildcard_resource = (
            f"https://{self.settings.cloudfront_domain}/{prefix}/*"
            if prefix
            else manifest_url
        )

        expires = datetime.now(timezone.utc) + timedelta(
            minutes=self.settings.stream_url_ttl_minutes
        )
        policy = self._signer.build_policy(
            wildcard_resource,
            date_less_than=expires,
        )
        return self._signer.generate_presigned_url(
            manifest_url,
            policy=policy,
        )
