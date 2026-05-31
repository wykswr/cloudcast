"""Tests for CloudFront signed-URL generation.

The RSA private key is loaded from moto SSM (stored with literal ``\\n`` escapes,
so the signer's un-escape path is exercised). We decode the generated ``Policy``
query parameter to confirm the signed resource is the whole HLS prefix, not just
the manifest.
"""

import base64
import json
from urllib.parse import parse_qs, urlparse

from app.services.cloudfront import CloudFrontURLSigner


def _decode_cf_policy(policy_param: str) -> dict:
    # CloudFront uses a URL-safe base64 variant: + / = -> - ~ _
    standard = policy_param.replace("-", "+").replace("~", "/").replace("_", "=")
    return json.loads(base64.b64decode(standard))


def test_load_private_key_unescapes_newlines(settings, ssm_with_key):
    # Construction loads + parses the key; success means the \n un-escape worked.
    signer = CloudFrontURLSigner(settings, ssm_with_key)
    assert signer._private_key is not None


def test_sign_returns_url_with_signing_params(settings, ssm_with_key):
    signer = CloudFrontURLSigner(settings, ssm_with_key)
    url = signer.sign("u/v/hls/master.m3u8")

    parsed = urlparse(url)
    assert parsed.scheme == "https"
    assert parsed.netloc == settings.cloudfront_domain
    assert parsed.path == "/u/v/hls/master.m3u8"

    query = parse_qs(parsed.query)
    assert "Policy" in query
    assert "Signature" in query
    assert query["Key-Pair-Id"] == [settings.cloudfront_key_id]


def test_sign_uses_wildcard_prefix_resource(settings, ssm_with_key):
    signer = CloudFrontURLSigner(settings, ssm_with_key)
    url = signer.sign("u/v/hls/master.m3u8")

    policy_param = parse_qs(urlparse(url).query)["Policy"][0]
    policy = _decode_cf_policy(policy_param)
    resource = policy["Statement"][0]["Resource"]
    assert resource == f"https://{settings.cloudfront_domain}/u/v/hls/*"


def test_sign_strips_leading_slash(settings, ssm_with_key):
    signer = CloudFrontURLSigner(settings, ssm_with_key)
    url = signer.sign("/u/v/hls/master.m3u8")
    assert urlparse(url).path == "/u/v/hls/master.m3u8"
