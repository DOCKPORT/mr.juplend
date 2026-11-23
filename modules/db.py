#!/usr/bin/env python3
"""Snapshot storage for Mr. Juplend. Uses Turso or local SQLite."""  # noqa: EXE001

from __future__ import annotations

import os
import sqlite3
from collections.abc import Sequence
from pathlib import Path
from typing import Final

from . import bank_db, meta_db, plot_db, turso
from .report import TokenRow

DB_PATH: Final[Path] = (
    Path(__file__).resolve().parent.parent / "data" / "mrjuplend.db"
)

SCHEMA: Final[tuple[str, ...]] = (
    meta_db.SCHEMA,
    *bank_db.SCHEMA,
    *plot_db.SCHEMA,
)


def connect(db_path: Path) -> sqlite3.Connection:
    """Open the local database and create the parent folder."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def init_schema(connection: sqlite3.Connection) -> None:
    """Create the tables if they do not exist."""
    for statement in SCHEMA:
        connection.execute(statement)
    connection.commit()


def has_snapshot(connection: sqlite3.Connection, snapshot_date: str) -> bool:
    """Return True when the date already has stored rows."""
    row = connection.execute(
        bank_db.HAS_SNAPSHOT_SQL, (snapshot_date,)
    ).fetchone()
    return row is not None


def plot_needs_backfill(connection: sqlite3.Connection) -> bool:
    """Return True when a normalized day has no plot row."""
    normalized = connection.execute(
        "SELECT COUNT(DISTINCT substr(fetched_at, 1, 10)) FROM RatesBank"
    ).fetchone()
    plot_rows = connection.execute(
        "SELECT COUNT(*) FROM RatesTotalAPYPlot"
    ).fetchone()
    if normalized is None or plot_rows is None:
        return False
    return int(normalized[0]) > int(plot_rows[0])


def backfill_plots(connection: sqlite3.Connection) -> None:
    """Fill the plot tables once from the bank tables."""
    if not plot_needs_backfill(connection):
        return
    for statement in plot_db.PLOT_BACKFILL:
        connection.execute(statement)
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
        for table in bank_db.TABLES:
            connection.execute(
                bank_db.DELETE_SQL.format(table=table), (snapshot_date,)
            )

        connection.executemany(
            bank_db.RATES_INSERT, bank_db.rates_values(rows, fetched_at)
        )
        connection.executemany(
            bank_db.POOL_INSERT, bank_db.pool_values(rows, fetched_at)
        )
        connection.executemany(
            bank_db.LIQUIDITY_INSERT,
            bank_db.liquidity_values(rows, fetched_at),
        )

        for table in plot_db.TABLES:
            connection.execute(
                plot_db.DELETE_SQL.format(table=table), (snapshot_date,)
            )
        connection.execute(
            plot_db.RATES_PLOT_INSERT,
            (fetched_at, *plot_db.plot_values(rows, "total_apy")),
        )
        connection.execute(
            plot_db.POOL_PLOT_INSERT,
            (fetched_at, *plot_db.plot_values(rows, "total_assets")),
        )
        connection.execute(
            plot_db.LIQUIDITY_PLOT_INSERT,
            (fetched_at, *plot_db.plot_values(rows, "utilization")),
        )
        meta_db.upsert(connection, snapshot_date, fetched_at)
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
        """Create the tables and backfill the read tables once."""
        init_schema(self.connection)
        meta_db.backfill(self.connection)
        backfill_plots(self.connection)

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
        """Create the tables and backfill the read tables once."""
        for statement in SCHEMA:
            turso.execute(self.url, self.token, statement)

        existing = turso.execute(self.url, self.token, meta_db.EXISTS_SQL)
        if not existing:
            latest = turso.execute(self.url, self.token, meta_db.LATEST_SQL)
            if latest and latest[0][0]:
                timestamp = str(latest[0][0])
                turso.execute(
                    self.url,
                    self.token,
                    meta_db.UPSERT_SQL,
                    (timestamp[:10], timestamp),
                )

        normalized = turso.execute(
            self.url,
            self.token,
            "SELECT COUNT(DISTINCT substr(fetched_at, 1, 10)) FROM RatesBank",
        )
        plot_rows = turso.execute(
            self.url, self.token, "SELECT COUNT(*) FROM RatesTotalAPYPlot"
        )
        if (
            normalized
            and plot_rows
            and int(normalized[0][0]) > int(plot_rows[0][0])
        ):
            for statement in plot_db.PLOT_BACKFILL:
                turso.execute(self.url, self.token, statement)

    def has_snapshot(self, snapshot_date: str) -> bool:
        """Return True when the date already has stored rows."""
        rows = turso.execute(
            self.url, self.token, bank_db.HAS_SNAPSHOT_SQL, (snapshot_date,)
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
            turso.statement(
                bank_db.DELETE_SQL.format(table=table), (snapshot_date,)
            )
            for table in bank_db.TABLES
        ]
        statements.extend(
            turso.statement(bank_db.RATES_INSERT, values)
            for values in bank_db.rates_values(rows, fetched_at)
        )
        statements.extend(
            turso.statement(bank_db.POOL_INSERT, values)
            for values in bank_db.pool_values(rows, fetched_at)
        )
        statements.extend(
            turso.statement(bank_db.LIQUIDITY_INSERT, values)
            for values in bank_db.liquidity_values(rows, fetched_at)
        )

        statements.extend(
            turso.statement(
                plot_db.DELETE_SQL.format(table=table), (snapshot_date,)
            )
            for table in plot_db.TABLES
        )
        statements.append(
            turso.statement(
                plot_db.RATES_PLOT_INSERT,
                (fetched_at, *plot_db.plot_values(rows, "total_apy")),
            )
        )
        statements.append(
            turso.statement(
                plot_db.POOL_PLOT_INSERT,
                (fetched_at, *plot_db.plot_values(rows, "total_assets")),
            )
        )
        statements.append(
            turso.statement(
                plot_db.LIQUIDITY_PLOT_INSERT,
                (fetched_at, *plot_db.plot_values(rows, "utilization")),
            )
        )
        statements.append(
            turso.statement(meta_db.UPSERT_SQL, (snapshot_date, fetched_at))
        )
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
