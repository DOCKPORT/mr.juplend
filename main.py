#!/usr/bin/env python3
"""Run the Jupiter Lend Earn report."""  # noqa: EXE001

from __future__ import annotations

import os
import sys
from pathlib import Path

from fetch import (
    DEFAULT_KEY_FILE,
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
    key_file = Path(os.getenv("JUP_KEY_FILE", str(DEFAULT_KEY_FILE)))
    try:
        api_key = read_api_key(key_file)
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

    scale = detect_rate_scale(tokens)
    borrow_rates, borrow_totals, collateral_totals = aggregate_vaults(vaults)
    rows = build_rows(tokens, scale, borrow_rates, borrow_totals, collateral_totals)

    print_rates(rows)
    print()
    print_pool(rows)
    print()
    print_liquidity(rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
