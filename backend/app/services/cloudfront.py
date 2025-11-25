from datetime import datetime, timedelta, timezone
from pathlib import Path

from botocore.signers import CloudFrontSigner
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from ..config import Settings


class CloudFrontURLSigner:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._private_key = self._load_private_key()
        self._signer = CloudFrontSigner(
            settings.cloudfront_key_id, self._rsa_signer  # type: ignore[arg-type]
        )

    def _load_private_key(self):
        key_data: bytes | None = None
        if self.settings.cloudfront_private_key:
            normalized = self.settings.cloudfront_private_key.replace("\\n", "\n")
            key_data = normalized.encode("utf-8")
        elif self.settings.cloudfront_private_key_path:
            key_data = Path(self.settings.cloudfront_private_key_path).read_bytes()

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
        url = f"https://{self.settings.cloudfront_domain}/{object_path.lstrip('/')}"
        expires = datetime.now(timezone.utc) + timedelta(
            minutes=self.settings.stream_url_ttl_minutes
        )
        return self._signer.generate_presigned_url(url, date_less_than=expires)
