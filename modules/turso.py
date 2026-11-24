#!/usr/bin/env python3
"""Turso SQL over HTTP client."""  # noqa: EXE001

from __future__ import annotations

import base64
import sys
import time
from collections.abc import Sequence
from typing import Any, Final

import requests

TIMEOUT_SECONDS: Final[float] = 20.0
PIPELINE_PATH: Final[str] = "/v2/pipeline"

# Transient status codes. Every call is safe to repeat: reads do not change,
# and the daily batch deletes the day before it inserts it again.
RETRY_STATUS: Final[frozenset[int]] = frozenset({429, 502, 503, 504})
MAX_RETRIES: Final[int] = 2
RETRY_BASE_SECONDS: Final[float] = 1.0
RETRY_MAX_SECONDS: Final[float] = 10.0


class TursoError(RuntimeError):
    """Raised when the Turso request or response is invalid."""


def value_cell(value: Any) -> dict[str, Any]:
    """Return one Turso argument value."""
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "integer", "value": "1" if value else "0"}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "float", "value": value}
    return {"type": "text", "value": str(value)}


def statement(sql: str, args: Sequence[Any] = ()) -> dict[str, Any]:
    """Return one Turso statement object."""
    stmt: dict[str, Any] = {"sql": sql}
    if args:
        stmt["args"] = [value_cell(value) for value in args]
    return stmt


def normalize_url(url: str) -> str:
    """Return an https URL for the Turso HTTP API."""
    cleaned = url.strip().rstrip("/")
    for prefix in ("libsql://", "turso://"):
        if cleaned.startswith(prefix):
            return "https://" + cleaned[len(prefix) :]
    return cleaned


def backoff_seconds(attempt: int) -> float:
    """Return the pause before the next try."""
    return min(RETRY_BASE_SECONDS * (2**attempt), RETRY_MAX_SECONDS)


def retry_delay(response: requests.Response, attempt: int) -> float:
    """Return the pause before the next try, using Retry-After if present."""
    header = response.headers.get("Retry-After", "").strip()
    if header.isdigit():
        return min(float(header), RETRY_MAX_SECONDS)
    return backoff_seconds(attempt)


def send(url: str, token: str, requests_payload: list[dict[str, Any]]) -> list[Any]:
    """Send one pipeline request and return the result list."""
    endpoint = normalize_url(url) + PIPELINE_PATH
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    body = {"requests": requests_payload}
    for attempt in range(MAX_RETRIES + 1):
        try:
            response = requests.post(
                endpoint,
                json=body,
                headers=headers,
                timeout=TIMEOUT_SECONDS,
            )
        except requests.RequestException as error:
            if attempt >= MAX_RETRIES:
                raise TursoError(f"Turso request failed: {error}") from error
            delay = backoff_seconds(attempt)
            print(
                f"Retry {attempt + 1}/{MAX_RETRIES} after a request "
                f"error in {delay:.0f}s.",
                file=sys.stderr,
            )
            time.sleep(delay)
            continue

        if response.status_code in RETRY_STATUS and attempt < MAX_RETRIES:
            delay = retry_delay(response, attempt)
            print(
                f"Retry {attempt + 1}/{MAX_RETRIES} after status "
                f"{response.status_code} in {delay:.0f}s.",
                file=sys.stderr,
            )
            time.sleep(delay)
            continue
        break

    if response.status_code != 200:
        raise TursoError(
            f"Turso returned status {response.status_code}: {response.text[:200]}"
        )

    try:
        payload = response.json()
    except ValueError as error:
        raise TursoError("Turso response is not valid JSON.") from error

    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list):
        raise TursoError("Turso response has no results.")

    for item in results:
        if isinstance(item, dict) and item.get("type") == "error":
            error_info = item.get("error") or {}
            message = error_info.get("message", "unknown error")
            raise TursoError(f"Turso query failed: {message}")

    return results


def cell_value(cell: dict[str, Any]) -> Any:
    """Return a Python value from one Turso result cell."""
    kind = cell.get("type")
    value = cell.get("value")
    if kind == "null" or value is None:
        return None
    if kind == "integer":
        return int(value)
    if kind == "real":
        return float(value)
    if kind == "blob":
        return base64.b64decode(value)
    return value


def result_rows(result: dict[str, Any]) -> list[list[Any]]:
    """Return rows from one execute result."""
    result_data = result.get("response", {}).get("result", {})
    rows = result_data.get("rows") or []
    return [[cell_value(cell) for cell in row] for row in rows]


def execute(
    url: str, token: str, sql: str, args: Sequence[Any] = ()
) -> list[list[Any]]:
    """Run one statement and return its rows."""
    results = send(
        url,
        token,
        [
            {"type": "execute", "stmt": statement(sql, args)},
            {"type": "close"},
        ],
    )
    if not results:
        raise TursoError("Turso returned no result.")
    return result_rows(results[0])


def execute_batch(
    url: str, token: str, statements: Sequence[dict[str, Any]]
) -> None:
    """Run statements in one atomic batch."""
    steps = [{"stmt": item} for item in statements]
    results = send(
        url,
        token,
        [
            {"type": "batch", "batch": {"steps": steps}},
            {"type": "close"},
        ],
    )
    if not results:
        raise TursoError("Turso returned no result.")

    batch_result = results[0].get("response", {}).get("result", {})
    for error in batch_result.get("step_errors") or []:
        if error:
            message = error.get("message", "unknown error")
            raise TursoError(f"Turso batch failed: {message}")
