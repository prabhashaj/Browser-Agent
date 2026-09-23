"""backend/tests/test_ssrf.py — unit tests for the SSRF guard."""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app.browser.profiles import SSRFError, is_safe_url, validate_url


def _mock_dns(ip: str):
    """Patch socket.getaddrinfo to return a specific IP."""
    return patch("app.browser.profiles.socket.getaddrinfo", return_value=[(None, None, None, None, (ip, 0))])


# ── Blocked schemes ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("url", [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,<h1>test</h1>",
    "ftp://example.com/file.txt",
    "chrome://settings",
    "about:blank",
])
def test_blocked_schemes(url: str):
    with pytest.raises(SSRFError):
        validate_url(url)


# ── Private IP addresses ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("ip", [
    "127.0.0.1",
    "192.168.1.1",
    "10.0.0.1",
    "172.16.0.1",
    "169.254.0.1",
    "::1",
])
def test_private_ips_blocked(ip: str):
    with _mock_dns(ip):
        with pytest.raises(SSRFError):
            validate_url("http://internal.host/path")


# ── Public URLs pass ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("ip,url", [
    ("8.8.8.8", "https://google.com"),
    ("1.1.1.1", "https://cloudflare.com"),
    ("93.184.216.34", "https://example.com"),
])
def test_public_urls_allowed(ip: str, url: str):
    with _mock_dns(ip):
        result = validate_url(url)
        assert result == url


# ── is_safe_url helper ───────────────────────────────────────────────────────────

def test_is_safe_url_false_for_blocked():
    assert not is_safe_url("file:///etc/passwd")
    assert not is_safe_url("javascript:void(0)")


def test_is_safe_url_true_for_public():
    with _mock_dns("8.8.8.8"):
        assert is_safe_url("https://google.com")
