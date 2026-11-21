# Mr. Juplend <img src="logos/mr.png" alt="Mr. Juplend" width="220" align="right">

<br clear="all">

A web app that shows the latest APY and pool details for Jupiter Lend Earn vaults on Solana. The Python report works now. The web frontend is in progress.

## What it does

- Lists every Earn token with its supply APY, rewards APY, total APY, and borrow APY.
- Shows the pool size, jlToken supply, and the exchange rates between jlTokens and the underlying asset.
- Shows the Earn supply, vault collateral, total liquidity, borrowed amount, and utilization for each token.

## Data

The data comes from the [Jupiter Lend API](https://developers.jup.ag/docs/lend).

- `/lend/v1/earn/tokens` gives the Earn tokens and their rates.
- `/lend/v1/borrow/vaults` gives the borrow rates and the debt per vault.
- The API returns rates in 1e4 scale.
- APY uses continuous compounding: `e^(APR) - 1`.
- Utilization is calculated as total borrowed divided by total supply.

The API key stays in a local `key` file or in the `JUP_API_KEY` environment variable.

## Tech stack

- Python 3.10 or later with `requests`.
- HTML, CSS, and vanilla JavaScript for the web app.
- JSON data files for the site.
- GitHub Actions for scheduled updates.
- Vercel for static hosting.

## Status

| Part | Status |
| - | - |
| Python report | Ready |
| Web app | Planned |
| Scheduled updates | Planned |
| Charts and history | Planned |
