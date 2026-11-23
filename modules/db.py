#!/usr/bin/env python3
"""Snapshot storage for Mr. Juplend. Uses Turso or local SQLite."""  # noqa: EXE001

from __future__ import annotations

import os
import sqlite3
from collections.abc import Sequence
from pathlib import Path
from typing import Any, Final

from . import turso
from .report import TokenRow

DB_PATH: Final[Path] = (
    Path(__file__).resolve().parent.parent / "data" / "mrjuplend.db"
)

DELETE_SQL: Final[str] = (
    "DELETE FROM {table} WHERE substr(fetched_at, 1, 10) = ?"
)

RATES_INSERT: Final[str] = """
    INSERT INTO Rates (
        fetched_at, symbol, name,
        supply_apy, rewards_apy, total_apy, borrow_apy
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
"""

POOL_INSERT: Final[str] = """
    INSERT INTO Pool (
        fetched_at, symbol,
        total_assets, total_supply,
        assets_per_share, shares_per_asset, campaigns
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
"""

LIQUIDITY_INSERT: Final[str] = """
    INSERT INTO Liquidity (
        fetched_at, symbol,
        earn_supply, collateral_supply, total_liquidity_supply,
        total_borrowed, utilization
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
"""

META_UPSERT: Final[str] = """
    INSERT INTO Meta (id, latest_day, latest_fetched_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        latest_day = excluded.latest_day,
        latest_fetched_at = excluded.latest_fetched_at
"""

SCHEMA: Final[tuple[str, ...]] = (
    """
    CREATE TABLE IF NOT EXISTS Meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        latest_day TEXT NOT NULL,
        latest_fetched_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS Rates (
        fetched_at TEXT NOT NULL,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        supply_apy REAL NOT NULL,
        rewards_apy REAL NOT NULL,
        total_apy REAL NOT NULL,
        borrow_apy REAL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS Pool (
        fetched_at TEXT NOT NULL,
        symbol TEXT NOT NULL,
        total_assets REAL NOT NULL,
        total_supply REAL NOT NULL,
        assets_per_share REAL,
        shares_per_asset REAL,
        campaigns INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS Liquidity (
        fetched_at TEXT NOT NULL,
        symbol TEXT NOT NULL,
        earn_supply REAL NOT NULL,
        collateral_supply REAL NOT NULL,
        total_liquidity_supply REAL NOT NULL,
        total_borrowed REAL NOT NULL,
        utilization REAL
    )
    """,
    "CREATE UNIQUE INDEX IF NOT EXISTS Rates_day_symbol "
    "ON Rates(substr(fetched_at, 1, 10), symbol)",
    "CREATE UNIQUE INDEX IF NOT EXISTS Pool_day_symbol "
    "ON Pool(substr(fetched_at, 1, 10), symbol)",
    "CREATE UNIQUE INDEX IF NOT EXISTS Liquidity_day_symbol "
    "ON Liquidity(substr(fetched_at, 1, 10), symbol)",
)


def connect(db_path: Path) -> sqlite3.Connection:
    """Open the local database and create the parent folder."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def init_schema(connection: sqlite3.Connection) -> None:
    """Create the three snapshot tables if they do not exist."""
    for statement in SCHEMA:
        connection.execute(statement)
    connection.commit()


def rates_values(
    rows: Sequence[TokenRow], fetched_at: str
) -> list[tuple[Any, ...]]:
    """Return the Rates insert values."""
    return [
        (
            fetched_at,
            row.symbol,
            row.name,
            row.supply_apy,
            row.rewards_apy,
            row.total_apy,
            row.borrow_apy,
        )
        for row in rows
    ]


def pool_values(rows: Sequence[TokenRow], fetched_at: str) -> list[tuple[Any, ...]]:
    """Return the Pool insert values."""
    return [
        (
            fetched_at,
            row.symbol,
            row.total_assets,
            row.total_supply,
            row.assets_per_share,
            row.shares_per_asset,
            row.campaigns,
        )
        for row in rows
    ]


def liquidity_values(
    rows: Sequence[TokenRow], fetched_at: str
) -> list[tuple[Any, ...]]:
    """Return the Liquidity insert values."""
    return [
        (
            fetched_at,
            row.symbol,
            row.earn_supply,
            row.collateral_supply,
            row.total_liquidity_supply,
            row.total_borrowed,
            row.utilization,
        )
        for row in rows
    ]


def has_snapshot(connection: sqlite3.Connection, snapshot_date: str) -> bool:
    """Return True when the date already has stored rows."""
    row = connection.execute(
        "SELECT 1 FROM Rates WHERE substr(fetched_at, 1, 10) = ? LIMIT 1",
        (snapshot_date,),
    ).fetchone()
    return row is not None


def upsert_meta(
    connection: sqlite3.Connection, snapshot_date: str, fetched_at: str
) -> None:
    """Point Meta at the newest snapshot."""
    connection.execute(META_UPSERT, (snapshot_date, fetched_at))


def backfill_meta(connection: sqlite3.Connection) -> None:
    """Fill Meta once from the newest Rates row."""
    existing = connection.execute(
        "SELECT 1 FROM Meta WHERE id = 1 LIMIT 1"
    ).fetchone()
    if existing is not None:
        return

    latest = connection.execute(
        "SELECT fetched_at FROM Rates ORDER BY fetched_at DESC LIMIT 1"
    ).fetchone()
    if latest is not None and latest[0]:
        timestamp = str(latest[0])
        upsert_meta(connection, timestamp[:10], timestamp)
        connection.commit()


def save_snapshot(
    connection: sqlite3.Connection,
    rows: Sequence[TokenRow],
    fetched_at: str,
    complete: bool = True,
) -> str:
    """Replace the snapshot for one date in the local database.

    Returns "saved", "kept", or "skipped". The date is the first 10
    characters of the UTC timestamp. A second run on the same date deletes
    the old rows first. An incomplete run keeps an existing snapshot.
    """
    if not rows:
        return "skipped"

    snapshot_date = fetched_at[:10]
    if not complete and has_snapshot(connection, snapshot_date):
        return "kept"

    with connection:
        for table in ("Rates", "Pool", "Liquidity"):
            connection.execute(DELETE_SQL.format(table=table), (snapshot_date,))

        connection.executemany(RATES_INSERT, rates_values(rows, fetched_at))
        connection.executemany(POOL_INSERT, pool_values(rows, fetched_at))
        connection.executemany(
            LIQUIDITY_INSERT, liquidity_values(rows, fetched_at)
        )
        upsert_meta(connection, snapshot_date, fetched_at)
    return "saved"


def turso_config() -> tuple[str, str] | None:
    """Return the Turso URL and write token, or None."""
    url = os.getenv("TURSO_URL", "").strip()
    token = os.getenv("TURSO_WRITE_TOKEN", "").strip()

    if not url or not token:
        try:
            from .turso_key import TURSO_URL, TURSO_WRITE_TOKEN
        except ImportError:
            return None
        url = url or str(TURSO_URL).strip()
        token = token or str(TURSO_WRITE_TOKEN).strip()

    if url and token:
        return url, token
    return None


class LocalStore:
    """Snapshot storage on a local SQLite file."""

    name = "SQLite"

    def __init__(self, db_path: Path) -> None:
        self.connection = connect(db_path)

    def init_schema(self) -> None:
        """Create the tables and backfill Meta once."""
        init_schema(self.connection)
        backfill_meta(self.connection)

    def save_snapshot(
        self, rows: Sequence[TokenRow], fetched_at: str, complete: bool = True
    ) -> str:
        """Write one daily snapshot."""
        return save_snapshot(self.connection, rows, fetched_at, complete)

    def close(self) -> None:
        """Close the connection."""
        self.connection.close()


class TursoStore:
    """Snapshot storage on Turso over HTTP."""

    name = "Turso"

    def __init__(self, url: str, token: str) -> None:
        self.url = url
        self.token = token

    def init_schema(self) -> None:
        """Create the tables and backfill Meta once."""
        for statement in SCHEMA:
            turso.execute(self.url, self.token, statement)

        existing = turso.execute(
            self.url, self.token, "SELECT 1 FROM Meta WHERE id = 1 LIMIT 1"
        )
        if existing:
            return

        latest = turso.execute(
            self.url,
            self.token,
            "SELECT fetched_at FROM Rates ORDER BY fetched_at DESC LIMIT 1",
        )
        if latest and latest[0][0]:
            timestamp = str(latest[0][0])
            turso.execute(
                self.url,
                self.token,
                META_UPSERT,
                (timestamp[:10], timestamp),
            )

    def has_snapshot(self, snapshot_date: str) -> bool:
        """Return True when the date already has stored rows."""
        rows = turso.execute(
            self.url,
            self.token,
            "SELECT 1 FROM Rates WHERE substr(fetched_at, 1, 10) = ? LIMIT 1",
            (snapshot_date,),
        )
        return bool(rows)

    def save_snapshot(
        self, rows: Sequence[TokenRow], fetched_at: str, complete: bool = True
    ) -> str:
        """Write one daily snapshot in an atomic batch."""
        if not rows:
            return "skipped"

        snapshot_date = fetched_at[:10]
        if not complete and self.has_snapshot(snapshot_date):
            return "kept"

        statements = [
            turso.statement(DELETE_SQL.format(table=table), (snapshot_date,))
            for table in ("Rates", "Pool", "Liquidity")
        ]
        statements.extend(
            turso.statement(RATES_INSERT, values)
            for values in rates_values(rows, fetched_at)
        )
        statements.extend(
            turso.statement(POOL_INSERT, values)
            for values in pool_values(rows, fetched_at)
        )
        statements.extend(
            turso.statement(LIQUIDITY_INSERT, values)
            for values in liquidity_values(rows, fetched_at)
        )
        statements.append(turso.statement(META_UPSERT, (snapshot_date, fetched_at)))
        turso.execute_batch(self.url, self.token, statements)
        return "saved"

    def close(self) -> None:
        """Close does nothing for HTTP."""
        return


def create_store() -> LocalStore | TursoStore:
    """Return the Turso store when configured, else the local store."""
    config = turso_config()
    if config is not None:
        return TursoStore(*config)
    return LocalStore(Path(os.getenv("JUP_DB_PATH", str(DB_PATH))))
