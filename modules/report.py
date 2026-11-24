#!/usr/bin/env python3
"""Build and print the Jupiter Lend Earn report."""  # noqa: EXE001

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any, NamedTuple

from .fetch import RATE_SCALE


def detect_rate_scale(tokens: list[dict[str, Any]]) -> float:
    """Return the divisor that converts raw rates to decimal fractions.

    Live responses use 1e4 scale. Some documentation examples use decimal
    fractions instead. If every nonzero rate is at most 1, use fractions.
    """
    raw_values: list[float] = []
    for token in tokens:
        for field in ("supplyRate", "rewardsRate", "totalRate"):
            try:
                value = abs(float(token.get(field)))
            except (TypeError, ValueError):
                continue
            if value > 0.0:
                raw_values.append(value)

    if raw_values and all(value <= 1.0 for value in raw_values):
        return 1.0
    return RATE_SCALE


def parse_rate(token: dict[str, Any], field: str, scale: float) -> float:
    """Return a raw rate field as a decimal fraction, per year."""
    try:
        return float(token.get(field)) / scale
    except (TypeError, ValueError):
        return 0.0


def apr_to_apy(apr: float) -> float:
    """Return the effective yearly yield for a continuously compounded APR.

    Interest accrues every second through the exchange price, so the
    effective APY is exp(APR) - 1. This formula matches DefiLlama values
    for jupiter-lend pools to four decimals.
    """
    return math.expm1(apr)


def parse_int(value: Any) -> int:
    """Return an integer from a number or a numeric string, or 0."""
    text = str(value)
    try:
        return int(text)
    except (TypeError, ValueError):
        pass
    try:
        return int(float(text))
    except (TypeError, ValueError, OverflowError):
        return 0


def parse_optional_float(value: Any) -> float | None:
    """Return a float from a numeric string, or None."""
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


def aggregate_vaults(
    vaults: list[dict[str, Any]],
) -> tuple[dict[str, float], dict[str, int], dict[str, int]]:
    """Return borrow rates, borrow totals, and collateral totals by mint.

    Collateral supplied to a borrow vault also sits in the liquidity layer,
    so it counts toward the utilization denominator.
    """
    borrow_rates: dict[str, float] = {}
    borrow_totals: defaultdict[str, int] = defaultdict(int)
    collateral_totals: defaultdict[str, int] = defaultdict(int)

    for vault in vaults:
        supply_token = vault.get("supplyToken")
        borrow_token = vault.get("borrowToken")
        supply_address = (
            supply_token.get("address") if isinstance(supply_token, dict) else None
        )
        borrow_address = (
            borrow_token.get("address") if isinstance(borrow_token, dict) else None
        )

        if isinstance(supply_address, str):
            collateral_totals[supply_address] += parse_int(
                vault.get("totalSupplyLiquidity")
            )
        if isinstance(borrow_address, str):
            borrow_totals[borrow_address] += parse_int(
                vault.get("totalBorrowLiquidity")
            )
            if borrow_address not in borrow_rates:
                rate = parse_optional_float(vault.get("borrowRateLiquidity"))
                if rate is not None:
                    borrow_rates[borrow_address] = rate

    return borrow_rates, dict(borrow_totals), dict(collateral_totals)


class TokenRow(NamedTuple):
    """One row of display data for a lending token."""

    symbol: str
    name: str
    supply_apy: float
    rewards_apy: float
    total_apy: float
    borrow_apy: float | None
    total_assets: float
    total_supply: float
    earn_supply: float
    collateral_supply: float
    total_liquidity_supply: float
    total_borrowed: float
    utilization: float | None
    assets_per_share: float | None
    shares_per_asset: float | None
    campaigns: int


def format_amount(value: float) -> str:
    """Return a short human readable amount."""
    for suffix, divisor in (
        ("T", 1e12),
        ("B", 1e9),
        ("M", 1e6),
        ("K", 1e3),
    ):
        if abs(value) >= divisor:
            return f"{value / divisor:,.2f}{suffix}"
    return f"{value:,.2f}"


def format_pct(value: float | None) -> str:
    """Return a two-decimal percentage, or a dash."""
    return "-" if value is None else f"{value:.2f}%"


def format_ratio(value: float | None) -> str:
    """Return a four-decimal ratio, or a dash."""
    return "-" if value is None else f"{value:.4f}"


def token_symbol(token: dict[str, Any]) -> str:
    """Return the display symbol for a token.

    The API uses WSOL for the wrapped SPL mint, but its uiSymbol is SOL,
    which matches the jup.ag display.
    """
    asset = token.get("asset")
    if isinstance(asset, dict):
        ui_symbol = asset.get("uiSymbol")
        if isinstance(ui_symbol, str) and ui_symbol:
            return ui_symbol
        symbol = asset.get("symbol")
        if isinstance(symbol, str) and symbol:
            return symbol
    symbol = token.get("symbol")
    return symbol if isinstance(symbol, str) else "?"


def token_name(token: dict[str, Any]) -> str:
    """Return the display name for a token."""
    asset = token.get("asset")
    if isinstance(asset, dict):
        name = asset.get("name")
        if isinstance(name, str) and name:
            return name
    name = token.get("name")
    return name if isinstance(name, str) else ""


def build_rows(
    tokens: list[dict[str, Any]],
    scale: float,
    borrow_rates: dict[str, float],
    borrow_totals: dict[str, int],
    collateral_totals: dict[str, int],
) -> list[TokenRow]:
    """Return display rows for all tokens, sorted by total APY."""
    rows: list[TokenRow] = []

    for token in tokens:
        address = token.get("assetAddress")
        asset_address = address if isinstance(address, str) else ""
        decimals = parse_int(token.get("decimals")) or 18
        denominator = 10**decimals

        supply_apy = apr_to_apy(parse_rate(token, "supplyRate", scale)) * 100.0
        rewards_apy = apr_to_apy(parse_rate(token, "rewardsRate", scale)) * 100.0
        total_apy = apr_to_apy(parse_rate(token, "totalRate", scale)) * 100.0

        borrow_apy: float | None = None
        raw_borrow_rate = borrow_rates.get(asset_address)
        if raw_borrow_rate is not None:
            borrow_apy = apr_to_apy(raw_borrow_rate / scale) * 100.0

        convert_assets = parse_int(token.get("convertToAssets"))
        convert_shares = parse_int(token.get("convertToShares"))
        # Both fields use the token decimals as scale, and they are reciprocal.
        assets_per_share = convert_assets / denominator if convert_assets > 0 else None
        shares_per_asset = convert_shares / denominator if convert_shares > 0 else None

        liquidity = token.get("liquiditySupplyData")
        earn_supply = (
            parse_int(liquidity.get("supply")) if isinstance(liquidity, dict) else 0
        )
        collateral_supply = collateral_totals.get(asset_address, 0)
        total_liquidity = earn_supply + collateral_supply
        borrowed = borrow_totals.get(asset_address, 0)
        utilization = borrowed / total_liquidity * 100.0 if total_liquidity > 0 else None

        rewards = token.get("rewards")
        campaigns = len(rewards) if isinstance(rewards, list) else 0

        rows.append(
            TokenRow(
                symbol=token_symbol(token),
                name=token_name(token),
                supply_apy=supply_apy,
                rewards_apy=rewards_apy,
                total_apy=total_apy,
                borrow_apy=borrow_apy,
                total_assets=parse_int(token.get("totalAssets")) / denominator,
                total_supply=parse_int(token.get("totalSupply")) / denominator,
                earn_supply=earn_supply / denominator,
                collateral_supply=collateral_supply / denominator,
                total_liquidity_supply=total_liquidity / denominator,
                total_borrowed=borrowed / denominator,
                utilization=utilization,
                assets_per_share=assets_per_share,
                shares_per_asset=shares_per_asset,
                campaigns=campaigns,
            )
        )

    rows.sort(key=lambda row: row.total_apy, reverse=True)
    return rows


def print_rates(rows: list[TokenRow]) -> None:
    """Print the APY table."""
    symbol_width = max(len("SYMBOL"), max(len(row.symbol) for row in rows))
    name_width = max(len("ASSET"), max(len(row.name) for row in rows))

    header = (
        f"{'SYMBOL':<{symbol_width}}  {'ASSET':<{name_width}}  "
        f"{'SUPPLY APY':>10}  {'REWARDS APY':>11}  {'TOTAL APY':>9}  "
        f"{'BORROW APY':>10}"
    )
    print(header)
    print("-" * len(header))

    for row in rows:
        print(
            f"{row.symbol:<{symbol_width}}  {row.name:<{name_width}}  "
            f"{format_pct(row.supply_apy):>10}  "
            f"{format_pct(row.rewards_apy):>11}  "
            f"{format_pct(row.total_apy):>9}  "
            f"{format_pct(row.borrow_apy):>10}"
        )


def print_pool(rows: list[TokenRow]) -> None:
    """Print the pool scale and conversion table."""
    symbol_width = max(len("SYMBOL"), max(len(row.symbol) for row in rows))

    header = (
        f"{'SYMBOL':<{symbol_width}}  {'TOTAL ASSETS':>12}  {'JL SUPPLY':>12}  "
        f"{'ASSETS/SHARE':>12}  {'SHARES/ASSET':>12}  {'CAMPAIGNS':>9}"
    )
    print(header)
    print("-" * len(header))

    for row in rows:
        print(
            f"{row.symbol:<{symbol_width}}  "
            f"{format_amount(row.total_assets):>12}  "
            f"{format_amount(row.total_supply):>12}  "
            f"{format_ratio(row.assets_per_share):>12}  "
            f"{format_ratio(row.shares_per_asset):>12}  "
            f"{row.campaigns:>9}"
        )


def print_liquidity(rows: list[TokenRow]) -> None:
    """Print the liquidity and utilization table."""
    symbol_width = max(len("SYMBOL"), max(len(row.symbol) for row in rows))

    header = (
        f"{'SYMBOL':<{symbol_width}}  {'EARN SUPPLY':>12}  {'COLLATERAL':>12}  "
        f"{'TOTAL SUPPLY':>12}  {'BORROWED':>12}  {'UTIL (CALC)':>11}"
    )
    print(header)
    print("-" * len(header))

    for row in rows:
        print(
            f"{row.symbol:<{symbol_width}}  "
            f"{format_amount(row.earn_supply):>12}  "
            f"{format_amount(row.collateral_supply):>12}  "
            f"{format_amount(row.total_liquidity_supply):>12}  "
            f"{format_amount(row.total_borrowed):>12}  "
            f"{format_pct(row.utilization):>11}"
        )
