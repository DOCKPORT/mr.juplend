#!/usr/bin/env python3
"""SQLite storage for Mr. Juplend daily snapshots."""  # noqa: EXE001

from __future__ import annotations

import sqlite3
from collections.abc import Sequence
from pathlib import Path
from typing import Final

from report import TokenRow

DB_PATH: Final[Path] = Path(__file__).resolve().parent / "data" / "mrjuplend.db"

SCHEMA: Final[tuple[str, ...]] = (
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
    ("CREATE UNIQUE INDEX IF NOT EXISTS Rates_day_symbol "
    "ON Rates(substr(fetched_at, 1, 10), symbol)"),
    ("CREATE UNIQUE INDEX IF NOT EXISTS Pool_day_symbol "
    "ON Pool(substr(fetched_at, 1, 10), symbol)"),
    ("CREATE UNIQUE INDEX IF NOT EXISTS Liquidity_day_symbol "
    "ON Liquidity(substr(fetched_at, 1, 10), symbol)"),
)


def connect(db_path: Path) -> sqlite3.Connection:
    """Open the database and create the parent folder."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def init_schema(connection: sqlite3.Connection) -> None:
    """Create the three snapshot tables if they do not exist."""
    for statement in SCHEMA:
        connection.execute(statement)
    connection.commit()


def has_snapshot(connection: sqlite3.Connection, snapshot_date: str) -> bool:
    """Return True when the date already has stored rows."""
    row = connection.execute(
        "SELECT 1 FROM Rates WHERE substr(fetched_at, 1, 10) = ? LIMIT 1",
        (snapshot_date,),
    ).fetchone()
    return row is not None


def save_snapshot(
    connection: sqlite3.Connection,
    rows: Sequence[TokenRow],
    fetched_at: str,
    complete: bool = True,
) -> None:
    """Replace the snapshot for one date in all three tables.

    The date is the first 10 characters of the UTC timestamp. A second run
    on the same date deletes the old rows first, so the database keeps
    exactly one set of data per day. An incomplete run keeps an existing
    snapshot for the same date.
    """
    if not rows:
        return

    snapshot_date = fetched_at[:10]
    if not complete and has_snapshot(connection, snapshot_date):
        return

    with connection:
        for table in ("Rates", "Pool", "Liquidity"):
            connection.execute(
                f"DELETE FROM {table} WHERE substr(fetched_at, 1, 10) = ?",
                (snapshot_date,),
            )

        connection.executemany(
            """
            INSERT INTO Rates (
                fetched_at, symbol, name,
                supply_apy, rewards_apy, total_apy, borrow_apy
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
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
            ],
        )

        connection.executemany(
            """
            INSERT INTO Pool (
                fetched_at, symbol,
                total_assets, total_supply,
                assets_per_share, shares_per_asset, campaigns
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
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
            ],
        )

        connection.executemany(
            """
            INSERT INTO Liquidity (
                fetched_at, symbol,
                earn_supply, collateral_supply, total_liquidity_supply,
                total_borrowed, utilization
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
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
            ],
        )
