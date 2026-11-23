# Mr. Juplend

<p align="center"><img src="logos/mr.svg" alt="Mr. Juplend" width="220"></p>

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

The API key lives in `modules/jupdev_key.py` or in the `JUP_API_KEY` environment variable. The `jupdev_key.py` file is ignored by git.

## Storage

A SQLite database keeps one snapshot per day and the full history. The Python writer uses Turso when credentials are set. Otherwise it writes the local `data/mrjuplend.db` file.

- A new run on the same day replaces that day's rows, so each day has one set of data.
- GitHub Actions will run the script with Turso credentials.
- The Vercel web app reads current and historical data from Turso.
- The browser never receives the Jupiter API key or the Turso write token.

## Tech stack

- Python 3.10 or later with `requests`.
- HTML, CSS, and vanilla JavaScript for the web app.
- SQLite for local storage and history.
- Turso for the hosted cloud database.
- GitHub Actions for scheduled updates.
- Vercel for static hosting.

## Status

| Part | Status |
| - | - |
| Python report | Ready |
| SQLite storage | Ready |
| Turso cloud database | Ready |
| Web app | In progress |
| Scheduled updates | Planned |
| Charts and history | In progress |
