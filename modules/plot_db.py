"""Plot tables: one row per day for the history charts."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Final

from .report import TokenRow

# Fixed asset order for the plot read tables.
PLOT_SYMBOLS: Final[tuple[str, ...]] = (
    "USDC",
    "USDT",
    "USDS",
    "USDG",
    "USDGO",
    "JUPUSD",
    "SOL",
    "EURC",
)

PLOT_COLUMNS: Final[str] = ", ".join(
    symbol.lower() for symbol in PLOT_SYMBOLS
)

DELETE_SQL: Final[str] = (
    "DELETE FROM {table} WHERE substr(fetched_at, 1, 10) = ?"
)


def plot_ddl(table: str) -> str:
    """Return the DDL for one plot daily read table."""
    columns = ",\n".join(
        f"        {symbol.lower()} REAL" for symbol in PLOT_SYMBOLS
    )
    return (
        f"CREATE TABLE IF NOT EXISTS {table} (\n"
        "        fetched_at TEXT PRIMARY KEY,\n"
        f"{columns}\n"
        "    )"
    )


def plot_insert(table: str) -> str:
    """Return the insert SQL for one plot table."""
    marks = ", ".join("?" for _ in range(len(PLOT_SYMBOLS) + 1))
    return (
        f"INSERT INTO {table} (fetched_at, {PLOT_COLUMNS}) "
        f"VALUES ({marks})"
    )


def plot_backfill(table: str, source: str, column: str) -> str:
    """Return the one-time pivot SQL from a bank table."""
    columns = ",\n".join(
        f"            MAX(CASE WHEN UPPER(symbol) = '{symbol}' "
        f"THEN {column} END)"
        for symbol in PLOT_SYMBOLS
    )
    return (
        f"INSERT OR REPLACE INTO {table} (fetched_at, {PLOT_COLUMNS})\n"
        f"SELECT MAX(fetched_at),\n{columns}\n"
        f"FROM {source}\n"
        "GROUP BY substr(fetched_at, 1, 10)"
    )


TABLES: Final[tuple[str, ...]] = (
    "RatesTotalAPYPlot",
    "PoolTotalAssetsPlot",
    "LiquidityUtilizationPlot",
)

RATES_PLOT_INSERT: Final[str] = plot_insert("RatesTotalAPYPlot")
POOL_PLOT_INSERT: Final[str] = plot_insert("PoolTotalAssetsPlot")
LIQUIDITY_PLOT_INSERT: Final[str] = plot_insert("LiquidityUtilizationPlot")

PLOT_BACKFILL: Final[tuple[str, ...]] = (
    plot_backfill("RatesTotalAPYPlot", "RatesBank", "total_apy"),
    plot_backfill("PoolTotalAssetsPlot", "PoolBank", "total_assets"),
    plot_backfill(
        "LiquidityUtilizationPlot", "LiquidityBank", "utilization"
    ),
)

SCHEMA: Final[tuple[str, ...]] = tuple(plot_ddl(table) for table in TABLES)


def plot_values(
    rows: Sequence[TokenRow], attribute: str
) -> tuple[Any, ...]:
    """Return one plot row in the fixed asset order."""
    by_symbol = {
        row.symbol.upper(): getattr(row, attribute) for row in rows
    }
    return tuple(by_symbol.get(symbol) for symbol in PLOT_SYMBOLS)
