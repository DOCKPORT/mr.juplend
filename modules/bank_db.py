"""Bank tables: the full daily snapshot source."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Final

from .report import TokenRow

TABLES: Final[tuple[str, ...]] = ("RatesBank", "PoolBank", "LiquidityBank")

DELETE_SQL: Final[str] = (
    "DELETE FROM {table} WHERE substr(fetched_at, 1, 10) = ?"
)

HAS_SNAPSHOT_SQL: Final[str] = (
    "SELECT 1 FROM RatesBank "
    "WHERE substr(fetched_at, 1, 10) = ? LIMIT 1"
)

RATES_INSERT: Final[str] = """
    INSERT INTO RatesBank (
        fetched_at, symbol, name,
        supply_apy, rewards_apy, total_apy, borrow_apy
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
"""

POOL_INSERT: Final[str] = """
    INSERT INTO PoolBank (
        fetched_at, symbol,
        total_assets, total_supply,
        assets_per_share, shares_per_asset, campaigns
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
"""

LIQUIDITY_INSERT: Final[str] = """
    INSERT INTO LiquidityBank (
        fetched_at, symbol,
        earn_supply, collateral_supply, total_liquidity_supply,
        total_borrowed, utilization
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
"""

SCHEMA: Final[tuple[str, ...]] = (
    """
    CREATE TABLE IF NOT EXISTS RatesBank (
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
    CREATE TABLE IF NOT EXISTS PoolBank (
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
    CREATE TABLE IF NOT EXISTS LiquidityBank (
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
    "ON RatesBank(substr(fetched_at, 1, 10), symbol)"),
    ("CREATE UNIQUE INDEX IF NOT EXISTS Pool_day_symbol "
    "ON PoolBank(substr(fetched_at, 1, 10), symbol)"),
    ("CREATE UNIQUE INDEX IF NOT EXISTS Liquidity_day_symbol "
    "ON LiquidityBank(substr(fetched_at, 1, 10), symbol)"),
)


def rates_values(
    rows: Sequence[TokenRow], fetched_at: str
) -> list[tuple[Any, ...]]:
    """Return the RatesBank insert values."""
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


def pool_values(
    rows: Sequence[TokenRow], fetched_at: str
) -> list[tuple[Any, ...]]:
    """Return the PoolBank insert values."""
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
    """Return the LiquidityBank insert values."""
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
