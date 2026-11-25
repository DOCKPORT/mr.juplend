# Mr. Juplend

<p align="center"><img src="logos/mr.svg" alt="Mr. Juplend" width="220"></p>

A web app that shows the latest APY and pool details for Jupiter Lend Earn vaults on Solana.

Deployment : https://mr-juplend.vercel.app/

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



## Storage

A SQLite database keeps one snapshot per day and the full history. The Python writer uses Turso when credentials are set.

- A new run on the same day replaces that day's rows, so each day has one set of data.
- GitHub Actions will run the script with Turso credentials.
- A Vercel function reads Turso and serves the data to the page.
- The browser never receives the Jupiter API key, the Turso URL, or either Turso token.

## Tech stack

- Python 3.10 or later with `requests`.
- HTML, CSS, and vanilla JavaScript for the web app.
- SQLite for local storage and history.
- Turso for the hosted cloud database.
- A Vercel function for read access.
- GitHub Actions for scheduled updates.
- Vercel for static hosting.


