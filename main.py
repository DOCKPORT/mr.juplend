#!/usr/bin/env python3
"""Run the Jupiter Lend Earn report."""  # noqa: EXE001

from __future__ import annotations

import sqlite3
import sys
from datetime import datetime, timezone

from modules.db import create_store
from modules.fetch import (
    ApiError,
    fetch_tokens,
    fetch_vaults,
    read_api_key,
)
from modules.report import (
    aggregate_vaults,
    build_rows,
    detect_rate_scale,
    print_liquidity,
    print_pool,
    print_rates,
)
from modules.turso import TursoError


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

    now = datetime.now(timezone.utc)  # noqa: UP017
    store = None
    try:
        store = create_store()
        store.init_schema()
        status = store.save_snapshot(
            rows,
            now.isoformat(timespec="seconds"),
            complete=not partial_snapshot,
        )
    except (OSError, sqlite3.Error, TursoError) as error:
        print(f"Warning: database write failed: {error}", file=sys.stderr)
    else:
        snapshot_date = now.date().isoformat()
        if status == "skipped":
            print(f"Database: {store.name} snapshot skipped for {snapshot_date}.")
        else:
            print(
                f"Database: {store.name} snapshot {status} for {snapshot_date} "
                f"({len(rows)} tokens)."
            )
    finally:
        if store is not None:
            store.close()

    print_rates(rows)
    print()
    print_pool(rows)
    print()
    print_liquidity(rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
