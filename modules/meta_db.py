"""Meta table: one row that points at the newest snapshot."""

from __future__ import annotations

import sqlite3
from typing import Final

SCHEMA: Final[str] = """
    CREATE TABLE IF NOT EXISTS Meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        latest_day TEXT NOT NULL,
        latest_fetched_at TEXT NOT NULL
    )
"""

UPSERT_SQL: Final[str] = """
    INSERT INTO Meta (id, latest_day, latest_fetched_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        latest_day = excluded.latest_day,
        latest_fetched_at = excluded.latest_fetched_at
"""

EXISTS_SQL: Final[str] = "SELECT 1 FROM Meta WHERE id = 1 LIMIT 1"

LATEST_SQL: Final[str] = (
    "SELECT fetched_at FROM RatesBank ORDER BY fetched_at DESC LIMIT 1"
)


def upsert(
    connection: sqlite3.Connection, snapshot_date: str, fetched_at: str
) -> None:
    """Point Meta at the newest snapshot."""
    connection.execute(UPSERT_SQL, (snapshot_date, fetched_at))


def backfill(connection: sqlite3.Connection) -> None:
    """Fill Meta once from the newest RatesBank row."""
    existing = connection.execute(EXISTS_SQL).fetchone()
    if existing is not None:
        return

    latest = connection.execute(LATEST_SQL).fetchone()
    if latest is not None and latest[0]:
        timestamp = str(latest[0])
        upsert(connection, timestamp[:10], timestamp)
        connection.commit()
