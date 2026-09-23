"""
backend/app/browser/profiles.py
================================
SSRF guard: blocks navigation to private/link-local addresses.
Also enforces an optional allowlist of domains.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

# Private IP ranges
_PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

# Schemes that are always blocked
_BLOCKED_SCHEMES = frozenset({"file", "ftp", "javascript", "data", "blob", "about", "chrome", "chrome-extension"})


class SSRFError(ValueError):
    """Raised when a URL is blocked by the SSRF guard."""


def validate_url(url: str, *, allowed_domains: list[str] | None = None) -> str:
    """
    Validate a URL for navigation safety.
    Returns the URL unchanged if safe, raises SSRFError otherwise.
    """
    try:
        parsed = urlparse(url)
    except Exception as exc:
        raise SSRFError(f"Invalid URL: {url!r}") from exc

    scheme = (parsed.scheme or "").lower()
    if scheme in _BLOCKED_SCHEMES:
        raise SSRFError(f"Scheme '{scheme}' is not allowed")

    if scheme not in ("http", "https"):
        raise SSRFError(f"Only http/https is allowed, got '{scheme}'")

    hostname = parsed.hostname
    if not hostname:
        raise SSRFError("URL has no hostname")

    # Resolve hostname to IP and check against private ranges
    try:
        addr_info = socket.getaddrinfo(hostname, None)
        for info in addr_info:
            ip_str = info[4][0]
            try:
                ip = ipaddress.ip_address(ip_str)
            except ValueError:
                continue
            if ip.is_loopback or ip.is_link_local or ip.is_private or ip.is_reserved:
                raise SSRFError(f"Navigation to private/reserved IP {ip} is not allowed")
            for net in _PRIVATE_NETS:
                if ip in net:
                    raise SSRFError(f"Navigation to private network {net} is not allowed")
    except SSRFError:
        raise
    except OSError:
        # DNS lookup failed — block it to be safe
        raise SSRFError(f"Cannot resolve hostname: {hostname!r}")

    # Optional domain allowlist
    if allowed_domains:
        if not any(hostname == d or hostname.endswith(f".{d}") for d in allowed_domains):
            raise SSRFError(f"Domain '{hostname}' is not in the allowed-domains list")

    return url


def is_safe_url(url: str) -> bool:
    """Returns True if the URL passes the SSRF guard."""
    try:
        validate_url(url)
        return True
    except SSRFError:
        return False
