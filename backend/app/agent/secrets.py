"""
backend/app/agent/secrets.py
==============================
In-memory secret broker + optional AES-256-GCM vault.

Flow:
  1. Agent encounters a field that needs a secret (detected by label/URL)
  2. Agent emits 'secret_required' event with field descriptors
  3. User provides values via WebSocket command
  4. Broker stores values (encrypted if vault enabled) and provides them to the executor
  5. Secrets are NEVER logged, never included in events, never sent to the LLM

The broker lives in-memory for the lifetime of one run.
"""
from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Detect if vault is available
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    _HAVE_CRYPTO = True
except ImportError:
    _HAVE_CRYPTO = False


def _encrypt(plaintext: str, key_hex: str) -> bytes:
    """AES-256-GCM encrypt. Returns nonce + ciphertext."""
    key = bytes.fromhex(key_hex)
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return nonce + ct


def _decrypt(data: bytes, key_hex: str) -> str:
    """AES-256-GCM decrypt."""
    key = bytes.fromhex(key_hex)
    nonce, ct = data[:12], data[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct, None).decode()


@dataclass
class SecretField:
    key: str          # internal name, e.g. "card_number"
    label: str        # displayed to user, e.g. "Card number"
    kind: str = "text"  # "text" | "password" | "otp"


@dataclass
class SecretRequest:
    secret_id: str
    title: str
    fields: list[SecretField]


class SecretBroker:
    """
    Per-run secret store.
    Secrets are kept in memory only; optionally encrypted at rest if vault key is set.
    """

    def __init__(self, run_id: str, vault_key_hex: str | None = None):
        self.run_id = run_id
        self._vault_key = vault_key_hex if vault_key_hex and _HAVE_CRYPTO else None
        self._store: dict[str, bytes] = {}   # key → encrypted bytes
        self._pending: dict[str, asyncio.Future] = {}  # secret_id → future

    def _store_value(self, field_key: str, value: str) -> None:
        if self._vault_key:
            self._store[field_key] = _encrypt(value, self._vault_key)
        else:
            # Store as raw UTF-8 bytes (still never logged)
            self._store[field_key] = value.encode()

    def _load_value(self, field_key: str) -> str | None:
        raw = self._store.get(field_key)
        if raw is None:
            return None
        if self._vault_key:
            return _decrypt(raw, self._vault_key)
        return raw.decode()

    async def request(self, req: SecretRequest) -> dict[str, str]:
        """
        Emit a secret_required event and wait for the user to provide values.
        Returns {field_key: value} mapping.
        Caller is responsible for emitting the event; this just awaits the response.
        """
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[req.secret_id] = future
        try:
            values: dict[str, str] = await asyncio.wait_for(future, timeout=300.0)
            # Store each field value
            for k, v in values.items():
                self._store_value(k, v)
            return values
        except asyncio.TimeoutError:
            logger.warning("Secret request %s timed out for run %s", req.secret_id, self.run_id)
            raise
        finally:
            self._pending.pop(req.secret_id, None)

    def provide(self, secret_id: str, values: dict[str, str]) -> None:
        """Called when the user provides secret values via WebSocket command."""
        future = self._pending.get(secret_id)
        if future and not future.done():
            future.set_result(values)

    def get(self, field_key: str) -> str | None:
        """Retrieve a previously provided secret value."""
        return self._load_value(field_key)

    def clear(self) -> None:
        """Securely clear all stored secrets."""
        self._store.clear()
        self._pending.clear()


# ── Heuristics for detecting secret-required fields ─────────────────────────────

_SECRET_LABELS = [
    "password", "passcode", "pin", "secret", "token", "otp",
    "card number", "credit card", "cvv", "cvc", "card code",
    "social security", "ssn", "tax id",
    "two-factor", "2fa", "authenticator",
    "bank account", "routing number",
]

_SECRET_TYPES = {"password", "otp"}


def is_secret_field(label: str, kind: str = "") -> bool:
    """Heuristic: returns True if a field likely requires a secret."""
    label_lower = label.lower()
    return any(s in label_lower for s in _SECRET_LABELS) or kind in _SECRET_TYPES
