# Wallet UX follow-up — September 20, 2026

## What changed

Previously the page cleared its connection on every `accountsChanged` or `chainChanged` event. Late events from a successful switch could therefore disconnect a correctly connected wallet. `watchWalletContext` now ignores events describing the same account (case-insensitively) and Studio Next. Actual changes, empty accounts and disconnects still invalidate the session. Listener cleanup is tested. Connection also verifies the final account/network rather than trusting the account captured before a switch.

Previously a protocol fee was quoted, but the wallet balance was not checked before requesting approval. `preflightSubmission` now reads the connected account's pending balance from the configured chain, validates the integer response, checks the exact protocol deposit, then revalidates the wallet context. A changed/aborted session or failed balance check stops the submission path. The fee message distinguishes Studio Next (61997) from stable Studio (61999). The app links to the official free faucet and explains account selection, default amount and restart recovery.

The deposit check does not promise that balances cannot change afterward, estimate every possible wallet charge or remove the requirement to inspect a wallet request. A request already handed to the wallet cannot be remotely cancelled by the app. Do not approve it after unexpectedly switching account or network.

## Verification scope

- 29 frontend tests pass, including 19 new regressions for identity events, listener cleanup, post-switch validation, bigint balance boundaries, insufficient/malformed/unavailable balances, and context changes during preflight.
- With the repository's pinned tool versions: GenVM lint and all 35 direct contract tests pass. No contract code or deployment address changed.
- The seven actual Chrome/MetaMask transactions and read-only negative vote simulations are recorded in `deployments/browser-wallet-test.json`. They occurred before this frontend patch and are not represented as newly repeated signatures.
- Restart recovery still depends on the wallet extension. No automatic wallet login, key access or transaction signing was introduced. Other extensions and mobile signing remain unverified.

See the GitHub Checks workflow and `docs/review-readiness.md` for subsequent release checks. No portal acceptance is guaranteed.
