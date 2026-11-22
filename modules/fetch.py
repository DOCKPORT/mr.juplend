#!/usr/bin/env python3
"""Jupiter Lend API access."""  # noqa: EXE001

from __future__ import annotations

import os
from typing import Any, Final

import requests

API_URL: Final[str] = "https://api.jup.ag/lend/v1/earn/tokens"
BORROW_URL: Final[str] = "https://api.jup.ag/lend/v1/borrow/vaults"
TIMEOUT_SECONDS: Final[float] = 15.0

# The API documents supplyRate, rewardsRate, and totalRate in 1e4 scale.
# Live check: USDC supplyRate "380" equals 3.80% APR.
RATE_SCALE: Final[float] = 10_000.0


class ApiError(RuntimeError):
    """Raised when the API request or response is invalid."""


def read_api_key() -> str:
    """Return the API key from the environment or from jupdev_key.py."""
    env_key = os.getenv("JUP_API_KEY", "").strip()
    if env_key:
        return env_key

    try:
        from .jupdev_key import JUP_API_KEY as local_key
    except ImportError as error:
        raise ApiError(
            "API key not configured. Set JUP_API_KEY or create modules/jupdev_key.py."
        ) from error

    api_key = str(local_key).strip()
    if not api_key:
        raise ApiError("jupdev_key.py does not set JUP_API_KEY.")
    return api_key


def fetch_json(api_key: str, url: str) -> list[dict[str, Any]]:
    """Return a JSON list from a Jupiter Lend endpoint."""
    headers = {"x-api-key": api_key, "Accept": "application/json"}
    try:
        response = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
    except requests.Timeout as error:
        raise ApiError("Request timed out. Check the network and try again.") from error
    except requests.RequestException as error:
        raise ApiError(f"Request failed: {error}") from error

    if response.status_code == 401:
        raise ApiError("Unauthorized. The API key is missing or invalid.")
    if response.status_code == 429:
        raise ApiError("Rate limit reached. Wait and try again.")
    if response.status_code != 200:
        raise ApiError(
            f"API returned status {response.status_code}: {response.text[:200]}"
        )

    try:
        payload = response.json()
    except ValueError as error:
        raise ApiError("API response is not valid JSON.") from error

    if not isinstance(payload, list):
        raise ApiError(f"Unexpected response shape: {type(payload).__name__}")

    return [item for item in payload if isinstance(item, dict)]


def fetch_tokens(api_key: str) -> list[dict[str, Any]]:
    """Return the list of Earn tokens."""
    return fetch_json(api_key, API_URL)


def fetch_vaults(api_key: str) -> list[dict[str, Any]]:
    """Return the list of borrow vaults."""
    return fetch_json(api_key, BORROW_URL)
