#!/usr/bin/env python3
"""Run the Jupiter Lend Earn report."""  # noqa: EXE001

from __future__ import annotations

import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from db import DB_PATH, connect, init_schema, save_snapshot
from fetch import (
    ApiError,
    fetch_tokens,
    fetch_vaults,
    read_api_key,
)
from report import (
    aggregate_vaults,
    build_rows,
    detect_rate_scale,
    print_liquidity,
    print_pool,
    print_rates,
)


def main() -> int:
    try:
        api_key = read_api_key()
        tokens = fetch_tokens(api_key)
    except ApiError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    if not tokens:
        print("No Earn tokens returned.")
        return 0

    try:
        vaults = fetch_vaults(api_key)
    except ApiError as error:
        print(f"Warning: borrow data unavailable: {error}", file=sys.stderr)
        vaults = []
        partial_snapshot = True
    else:
        partial_snapshot = False

    scale = detect_rate_scale(tokens)
    borrow_rates, borrow_totals, collateral_totals = aggregate_vaults(vaults)
    rows = build_rows(tokens, scale, borrow_rates, borrow_totals, collateral_totals)

    db_path = Path(os.getenv("JUP_DB_PATH", str(DB_PATH)))
    now = datetime.now(timezone.utc)  # noqa: UP017
    try:
        connection = connect(db_path)
        try:
            init_schema(connection)
            save_snapshot(
                connection,
                rows,
                now.isoformat(timespec="seconds"),
                complete=not partial_snapshot,
            )
        finally:
            connection.close()
    except sqlite3.Error as error:
        print(f"Warning: database write failed: {error}", file=sys.stderr)

    print_rates(rows)
    print()
    print_pool(rows)
    print()
    print_liquidity(rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
