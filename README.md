# CharterGate v2

**Rules first. Votes second.** A GenLayer-native, low-stakes governance prototype: screen proposals against an immutable charter before voting.

## Active release

- [Public app](https://chartergate-studionet.vercel.app/)
- [Public repository](https://github.com/sanity456/chartergate)
- Studio Next / development preview, **chain 61997**, RPC https://studio-dev.genlayer.com/api
- [V2 contract](https://explorer-studio-dev.genlayer.com/address/0x75bd5c02cc488eCee4DC5a2E865FD458204cB1f0)
- Source: `contracts/chartergate_v2.py`
- SHA-256: `4d78b8fb0b760409f4b17cef70c52de4e6064c8dc578265e6d3d12aa7b3d8388`
- [Steward response and reproduction](docs/steward-response-v2.md)
- [Live transaction evidence](deployments/studio-next-v2.json)
- [Read-only negative checks](deployments/negative-checks-v2.json)

V2 is a new contract, not a migration. V1 communities remain at `0x132EfCaf14b265a7E936174DCb04b947eCA892e4`. The original contract, deployment records and seven Chrome/MetaMask transactions are retained as **v1 history**, not evidence of v2 signing.

## What changed

1. Validators independently classify every rule and explicitly audit **every leader quote and reason** for support in the original text. Literal quotation and matching status labels alone are insufficient. Accurate paraphrases are allowed; malformed or unsupported judgments fail closed.
2. A blocked proposal's author can request **one unchanged-text appeal after 60 seconds**. A new linked decision is stored; the original stays unchanged. Authors can also submit changed-body revisions. No owner override; eligible proposals are frozen.
3. IDs include policy, community, **author address**, exact body and assessment round. Another author submitting copied text cannot reserve your ID. Changing only the title cannot reroll your assessment.
4. Communities choose an immutable **5-minute to 7-day voting window** (UI default 24 hours). The deadline starts at the screening transaction timestamp, not finalization. No early closure, even with quorum. Any wallet can finalize after the deadline. Missing quorum records NO_QUORUM; a tie does not pass.
5. Live tests exercise hostile proposal instructions and ambiguous charter language using real validators. Direct tests separately exercise validator disagreement, fabricated reasons and misleading quotes.

Membership remains a creator-selected immutable allowlist. This is not permissionless membership or one-person-one-vote identity. A same-text appeal is a new assessment, not a promise of a changed verdict.

## Try it

1. Open the app. Reading does not require a wallet. Select the community named **CharterGate v2 review** followed by its timestamp; the separate **v2 ambiguous** community tests an intentionally unclear rule.
2. Inspect the eligible, paid, missing-detail and hostile proposals. Open the same-text appeal and its preserved original. Inspect the finalized 1 Yes / 0 No ballot; its finalizer is a different wallet from its owner.
3. For your own writes, connect an Ethereum-compatible wallet supporting custom networks and approve switching to Studio Next (61997).
4. Obtain free test GEN from the account-menu droplet in [Studio Next](https://studio-dev.genlayer.com/). Use the same wallet and network. Do not buy or bridge real funds; stable Studio 61999 is separate.
5. Create your own community with clear rules, your wallet in the voter list, quorum 1 and a 5-minute window for a short test.
6. Screen the free workshop example. Once finalized with successful execution, vote before the deadline. Wait until the fixed deadline, then finalize. Any connected wallet can finalize.
7. Screen a missing-details proposal. After the 60-second cooldown, choose **Appeal unchanged proposal**. A fresh assessment is recorded without changing the original body or deleting its history.

The seeded review wallets are disposable test identities, not accounts visitors can operate. No treasury payments occur.

## Wallet and time safety

Wallet discovery supports EIP-6963 and legacy Ethereum providers. Genuine account/network changes invalidate signing preparation; duplicate same-account events do not. Pending hashes are scoped by chain/contract and remain resumable. Never resubmit an existing pending hash.

Fee estimates and balances use exact integers. Insufficient or unverifiable funds block signing. Account and chain are rechecked before submission. Finalization is checked separately from successful execution.

Studio's simulated write path can omit transaction time. `lib/studio-fees.ts` supplies the latest RPC block timestamp **only to fee simulation**. It never adds a timestamp override to signed transactions. Failed simulations still block signing; there is no fallback around contract checks. See the precise explanation in the steward response.

## Run and verify

Use Node.js 24 and Python 3.12+:

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
pip install -r requirements.txt
```

Set `GENVM_VERSION=v0.6.0-rc5`, `PYTHONUTF8=1`, `PYTHONIOENCODING=utf-8`, then:

```sh
genvm-lint check contracts/chartergate_v2.py --json
python -m pytest tests/direct -q
npm run build
npm run verify:chain
```

The SDK is pinned to `genlayer-js@2.0.0-rc.1`, using the full `studioDevnet` chain configuration. The contract uses the live runner's required first-line version marker and second-line concrete runner hash.

Direct tests mock LLM outputs. Their compatibility shim adapts the pinned SDK's JSON transport, Windows stdin cleanup, and synchronizes simulated raw transaction time after `warp()`. It does not replace contract parsing, validation, storage or time checks. Live tests are separate.

`scripts/v2-release.mjs --prepare` creates ignored disposable local keys and prints only addresses/balances. `--execute` broadcasts real sandbox transactions, persists hashes, and resumes the same hash after interruption. Never insert a user private key. `scripts/v2-checks.mjs` performs read-only GenVM simulations with explicit current RPC time; `npm run verify:chain` also checks public source and frontend bindings.

## Hosting and limitations

Static Next.js export, no application database, backend signer or server-side LLM key. Publish only generated `out/` to the existing Vercel project:

```sh
npm run build
vercel deploy out --project chartergate-studionet --scope sanity3 --prod --yes
```

The original Sites copy remains private. V1 data is not migrated or erased. Studio Next can reset; reverify before review.

AI can misinterpret text, and screening evaluates written commitments—not real-world truth or future delivery. No treasury, token weighting or identity proof. Browser/mobile wallet support is not certified by SDK-signed test transactions. No demo video is required for this normal Builder submission and acceptance is not guaranteed. Use `public/chartergate-logo-cg.png` for the CG-initialled logo.
