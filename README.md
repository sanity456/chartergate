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

- Network: Studio Next / development preview, chain **61997**.
- RPC: https://studio-dev.genlayer.com/api
- [Contract explorer](https://explorer-studio-dev.genlayer.com/address/0x132EfCaf14b265a7E936174DCb04b947eCA892e4)
- [Open contract in Studio](https://studio-dev.genlayer.com/contracts?import-contract=0x132EfCaf14b265a7E936174DCb04b947eCA892e4)
- Source SHA-256: `73c9d30c5cd164e39c38d6235975bea7c1cecca0634e9ba2150183a9b2df9c73`.
- Contract source: `contracts/chartergate.py`.
- Exact deployment and execution evidence: `deployments/studio-next.json`.

This is a development network and can reset. Reverify immediately before demonstrating or submitting. [Official network documentation](https://docs.genlayer.com/developers/intelligent-contracts/tools/genlayer-studio).

## Try the workflow

1. Connect an Ethereum-compatible browser wallet supporting custom networks and switch to Studio Next. Approve requests yourself.
2. Create a community with 1–6 clear rules and 1–32 voter wallets. For a personal test, add your connected address and use quorum 1. Charter, membership and quorum are fixed after creation.
3. Draft a proposal addressing all rules. The included free workshop, paid workshop and missing-details examples demonstrate the three outcomes against the default charter.
4. Submit screening. Review the fee in the wallet, wait for finalization and successful execution, then inspect each rule's status, quotation and reason.
5. Only ELIGIBLE proposals accept votes. An allowed wallet votes once. The owner can close after quorum; a strict yes majority passes and a tie does not.
6. For INELIGIBLE or NEEDS_CLARIFICATION, the author can revise the body. The new review links to the preserved original. Eligible proposals cannot be revised in place.

The seeded live-test community uses a disposable owner wallet. Create your own community to test your own voting and closure. No treasury funds move.

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
```

The direct-test compatibility shim only adapts the pinned SDK's JSON transport and Windows temporary-file cleanup. It does not replace the contract parser, validator, gate or storage logic.

`scripts/studio-release.mjs --exercise` creates a fresh disposable sandbox community and submits real test transactions. It is **not** read-only. `--verify` is read-only and checks deployed source/configuration. Pending transaction hashes are checkpointed; do not blindly redeploy on a slow receipt. Never insert a real private key.

The first line of the contract is the version marker required by this live GenVM; the next line pins the exact runner hash. An incorrectly ordered header was rejected by the pre-deployment schema check and corrected before deployment.

## Hosting

The app is a static Next.js export. All authoritative records reside on GenLayer; no application database, LLM API key or backend signer is used. The build verifies frontend/deployment/source bindings and exports the exact Python source and deployment evidence. Sites hosts the `out` artifact privately by default. Native Next.js is used for the portable runtime because the bundled Workers runtime failed on this Windows host.

## Submission status

See `docs/review-readiness.md` for verified checks and remaining work. Local tests and a live SDK workflow are not equivalent to a real extension-signing test. Public source access, an owner-wallet browser walkthrough and submission evidence still need to be prepared before review. No approval or acceptance is guaranteed.
