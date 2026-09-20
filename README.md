# CharterGate

**Rules first. Votes second.** A GenLayer-native prototype that screens community proposals against an immutable charter and allows only eligible proposals to receive votes.

## Run locally

Use Node.js 24 and Python 3.12 or newer.

```sh
npm ci
npm run dev
```

Open the local address printed by the server. The app uses the complete `studioDevnet` preset from `genlayer-js@2.0.0-rc.1`, including its consensus configuration. Do not replace it with the stable Studio preset.

## Live deployment

- [Public app on Vercel](https://chartergate-studionet.vercel.app/), hosted in the owner's `sanity3` account space.
- Network: Studio Next / development preview, chain **61997**.
- RPC: https://studio-dev.genlayer.com/api
- [Contract explorer](https://explorer-studio-dev.genlayer.com/address/0x132EfCaf14b265a7E936174DCb04b947eCA892e4)
- [Open contract in Studio](https://studio-dev.genlayer.com/contracts?import-contract=0x132EfCaf14b265a7E936174DCb04b947eCA892e4)
- Source SHA-256: `73c9d30c5cd164e39c38d6235975bea7c1cecca0634e9ba2150183a9b2df9c73`.
- Contract source: `contracts/chartergate.py`.
- Exact deployment and execution evidence: `deployments/studio-next.json`.
- [Real Chrome/MetaMask workflow evidence](https://chartergate-studionet.vercel.app/contract/browser-wallet-test.json): seven finalized, successful user-approved transactions, plus read-only rejected-vote checks and original-record preservation.

This is a development network and can reset. Reverify immediately before demonstrating or submitting. [Official network documentation](https://docs.genlayer.com/developers/intelligent-contracts/tools/genlayer-studio).

## Try the workflow

1. Connect an Ethereum-compatible browser wallet supporting custom networks and switch to Studio Next. Approve requests yourself.
   If you need test GEN, open [Studio Next](https://studio-dev.genlayer.com/), connect the same wallet, select its address in the account menu and use the droplet faucet. Leave the default 10 GEN amount unchanged, then select Fund. These are free test tokens. Balances on stable Studio (61999) are separate; do not purchase or bridge real funds for this prototype.
2. Create a community with 1–6 clear rules and 1–32 voter wallets. For a personal test, add your connected address and use quorum 1. Charter, membership and quorum are fixed after creation.
3. Draft a proposal addressing all rules. The included free workshop, paid workshop and missing-details examples demonstrate the three outcomes against the default charter.
4. Submit screening. Review the fee in the wallet, wait for finalization and successful execution, then inspect each rule's status, quotation and reason.
5. Only ELIGIBLE proposals accept votes. An allowed wallet votes once. The owner can close after quorum; a strict yes majority passes and a tie does not.
6. For INELIGIBLE or NEEDS_CLARIFICATION, the author can revise the body. The new review links to the preserved original. Eligible proposals cannot be revised in place.

The seeded live-test community uses a disposable owner wallet. Create your own community to test your own voting and closure. No treasury funds move.

The submitter-owned **CharterGate Wallet Test** community is also available to inspect. Its recorded eligible, ineligible, clarification and revision cases are in the browser-wallet evidence. Visitors can read them but cannot vote unless they are on that community's fixed voter list.

## Wallet recovery and fee safety

Connection checks the selected account again after switching networks. Duplicate events for that same account and Studio Next do not clear the connection. Real account, network and disconnect events invalidate the session and stop requests still being prepared. Unlock/reconnect after sleep; reload if the extension transport remains unavailable. Submitted transaction checkpoints remain resumable—never resubmit a pending hash.

Before requesting a signature, the app reads the connected address's pending balance from the configured Studio Next RPC and compares it to the protocol fee deposit using exact integer arithmetic. Insufficient or unverifiable funds stop the request. Account and chain are rechecked after the balance read. This is a protocol-deposit precheck, not a guarantee against later balance changes or any additional wallet/network charges.

## Why GenLayer is essential

The contract performs the natural-language judgment rather than trusting a server or browser to provide a result. Validators independently evaluate every rule and compare the ordered decision vector. The contract checks the output shape, enforces literal evidence citations, and deterministically derives overall eligibility. `vote()` invokes the same deterministic gate as `evaluate_eligibility_view()`; hiding or modifying the frontend cannot bypass it.

The screening scope is written commitments, not proof that an event happened or a promise will be fulfilled. Data is public. Do not use this prototype for legal, financial, employment or other high-impact decisions.

## Verification

```sh
npm run lint
npm run typecheck
npm test
pip install -r requirements.txt
```

Set `GENVM_VERSION=v0.6.0-rc5`, `PYTHONUTF8=1` and `PYTHONIOENCODING=utf-8`, then run:

```sh
genvm-lint check contracts/chartergate.py --json
python -m pytest tests/direct -q
npm run build
npm run verify:chain
node --experimental-strip-types scripts/negative-checks.mjs
node --experimental-strip-types scripts/check-submission.mjs
```

The direct-test compatibility shim only adapts the pinned SDK's JSON transport and Windows temporary-file cleanup. It does not replace the contract parser, validator, gate or storage logic.

`scripts/studio-release.mjs --exercise` creates a fresh disposable sandbox community and submits real test transactions. It is **not** read-only. `--verify` is read-only and checks deployed source/configuration. Pending transaction hashes are checkpointed; do not blindly redeploy on a slow receipt. Never insert a real private key.

The first line of the contract is the version marker required by this live GenVM; the next line pins the exact runner hash. An incorrectly ordered header was rejected by the pre-deployment schema check and corrected before deployment.

## Hosting

The app is a static Next.js export. All authoritative records reside on GenLayer; no application database, LLM API key or backend signer is used. The build verifies frontend/deployment/source bindings and exports the exact Python source and deployment evidence. The public production app is hosted on Vercel at https://chartergate-studionet.vercel.app/. The earlier Sites deployment remains private and is not the public testing URL. Native Next.js is used for the portable runtime because the bundled Workers runtime failed on this Windows host.

To update the same Vercel project after a successful build, upload only the generated static artifact:

```sh
npm run build
vercel deploy out --project chartergate-studionet --scope sanity3 --prod --yes
```

Do not deploy the repository root as a static directory. The Vercel project uses the Other/static preset; the command above uploads `out`, not source files, local configuration, or credentials. See `deployments/vercel.json` for the initial production deployment record.

## Submission status

See `docs/review-readiness.md` for verified checks and remaining work and `docs/submission.md` for the draft entry. The upload-ready logo is `public/chartergate-logo.png` (1024 × 1024). No demo video is required for this normal Builder submission. The scoped desktop Chrome/MetaMask walkthrough passed; the later wallet UX changes have additional regression tests. Other wallet extensions and mobile signing are not certified by those results. No approval or acceptance is guaranteed.
