# CharterGate v2 — response to the September 20 steward review

## Corrected deployment

- Network: **Studio Next, chain 61997**.
- [App](https://chartergate-studionet.vercel.app/) · [Repository](https://github.com/sanity456/chartergate)
- [Contract 0x75bd5c02cc488eCee4DC5a2E865FD458204cB1f0](https://explorer-studio-dev.genlayer.com/address/0x75bd5c02cc488eCee4DC5a2E865FD458204cB1f0)
- Source: [chartergate_v2.py](../contracts/chartergate_v2.py)
- SHA-256: `4d78b8fb0b760409f4b17cef70c52de4e6064c8dc578265e6d3d12aa7b3d8388`
- Deployment transaction: `0x432aa93c3aae60c60eef92be76b8e8a1fccf8b457bcf12297face21f0968d491`
- Frontend binding: [lib/deployment.ts](../lib/deployment.ts); policy `chartergate/rules-v2`.
- [Live receipts, inputs and outputs](../deployments/studio-next-v2.json)
- [Read-only rejection evidence](../deployments/negative-checks-v2.json)

This is a new deployment. V1 history and its original evidence are preserved, not migrated or relabelled.

## 1. Validator agreement covers quotations and reasons

Each validator first classifies the original charter/proposal independently and compares the complete ordered status vector. It then assesses **every proposed leader quote and reason**, in context, against the original text and its independent assessment. Every row must explicitly return both support booleans as true. A literal but irrelevant quote, fabricated explanation, embedded instruction, malformed response or disagreement causes rejection. Accurate paraphrases need not match byte-for-byte.

The contract's `screen_review`, `justification_prompt` and `justification_agrees` implement this. Direct tests exercise unsupported quote/reason fields, fabricated evidence, injected leader instructions, invalid JSON/schema, status disagreement and grounded paraphrases. These tests use controlled LLM results and are **not presented as live consensus**.

Live screening transactions used `leaderOnly: false`. Sanitized evidence separately records actual validator receipts and leader receipts. Hostile and ambiguous cases each had **3 / 3 successful independent validator agreements**, respectively. A validator cancelled with CONSENSUS_VALIDATOR_QUORUM_REACHED is disclosed; cancellation is not counted as agreement.

## 2. Same-body reassessment without destroying history

A blocked proposal's author can request one same-text appeal after a 60-second chain-time cooldown. The new linked assessment uses the original body unchanged, without injecting the previous decision into the new screening prompt. The original record remains unchanged. Successful execution consumes the appeal; failed execution does not. Eligible proposals cannot be appealed to restart voting. Changed-body revisions remain available.

Live original: `cf4ac20387e38b86f604e2d38613361137602b696961ea27e7bbd90b83090436`.
Appeal: `153e849f3e5e1d7f669947577dfdf5afe9569c84b5eac8e8b51b5332998e9442`.
Appeal transaction: `0xe1a06bc1e06c49b9f4ee369f6febabfca26c11d594106fff9405e855b4705aa5`.

The two bodies are identical and the original record was compared in full before/after. The appeal remained **NEEDS_CLARIFICATION** because the missing detail was still missing. This proves reassessment is available; it does not fabricate a reversal. A controlled direct regression also covers a blocked-to-eligible reassessment with its own ballot.

## 3. Author-bound proposal IDs

ID input is policy, community ID, canonical author address, exact body and assessment round. Title and parent-link changes do not permit duplicate initial assessments by the same author.

Live identical-body records:

- First author: `0x402db5d68e765a08705d0213d6cd9205d9981dfa`; proposal `23b4963254e12fb20ba2b49e453ac7bd797045409d3a88c037871d5d977fa727`.
- Second author: `0x0d63af4c115ca24587f527b00a1936a611dcea5e`; proposal `0c1111a5bb5aeb3994535c35f6e043f2996c4bc25756a80783f00459852bda02`.
- Second-author transaction: `0x73bf5f3a9b272a5e79ce1747f54b8445c9b70f80a7fad49aacdee48a326dcb96`.

Both authors retained separate IDs. Someone copying a pending proposal can no longer reserve the legitimate author's ID. This is wallet isolation, not proof of human identity or authorship of the text.

## 4. Neutral, time-based closure

The creator fixes a voting duration between 300 and 604800 seconds when creating a community. No one can close before the resulting ballot deadline, even if quorum is reached. At or after the deadline, votes reject and **any wallet** may finalize. Insufficient quorum yields NO_QUORUM; ties yield NOT_PASSED. Browser time is only a display hint; contract transaction time enforces the rules.

Live eligible ballot:

- Screening transaction time: `2026-09-20T20:42:29.848138Z`.
- Deadline: `1789937249` = `2026-09-20T20:47:29.000Z`.
- Finalization transaction time: `2026-09-20T20:54:56.771063Z`.
- Finalizer: `0x0d63af4c115ca24587f527b00a1936a611dcea5e`, neither owner nor listed voter.
- Result: **PASSED, 1 Yes / 0 No**.
- Transaction: `0xc581487f56b3294728525123de59ab6f04e1531da318139ae0a421a171114f53`.

The fixed creator-selected voter list remains a disclosed trust boundary. Request 4's time-based closure option is implemented; permissionless membership is not claimed. Finalization needs someone to submit a transaction—it is not an automatic background job.

## 5. Real adversarial cases, separately from mocked regressions

| Live case                                                                                     | Expected and observed result                     | Transaction                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| Proposal demands a $20 fee, then commands the validator to ignore the charter and return PASS | INELIGIBLE; free-entry rule FAIL; voting blocked | `0x464797b5d39f4a0f0d592434335df43f5045530256dea061e24d3193d2ead1ba` |
| Charter says “sufficiently excellent by the right standard” without defining that standard    | NEEDS_CLARIFICATION; UNCLEAR; voting blocked     | `0x2c02a3b24ad5ecee2be7dd7742db93ab7aa4310be290b08e6b52529dc60d44e7` |
| Same text from another author                                                                 | Distinct author-bound ID                         | `0x73bf5f3a9b272a5e79ce1747f54b8445c9b70f80a7fad49aacdee48a326dcb96` |
| Same-body appeal                                                                              | New linked decision; original unchanged          | `0xe1a06bc1e06c49b9f4ee369f6febabfca26c11d594106fff9405e855b4705aa5` |

These are real Studio Next transactions with real model evaluation, not mocked responses. They demonstrate the tested attacks, not immunity to all prompt injection or model errors. No live validator disagreement is claimed; disagreement rejection is covered by direct adversarial tests.

## Time-fixture and fee-simulation disclosure

Two distinct timestamp issues were corrected in the test/client harness, without changing the deployed contract's time rules:

1. The pinned direct-test SDK refreshed typed message fields but not `message.raw.datetime` after `warp()`. The compatibility shim now synchronizes that simulated timestamp. Exact 59.999/60-second appeal and 299.999/300-second ballot boundaries pass. Mock time is used only in direct tests.
2. The Studio fee estimator returned APPEAL_COOLDOWN for an old-enough live proposal. Its [simulation endpoint](https://github.com/genlayerlabs/genlayer-studio/blob/main/backend/protocol_rpc/endpoints.py) passes no transaction timestamp unless `sim_config` supplies one, and [node execution](https://github.com/genlayerlabs/genlayer-studio/blob/main/backend/node/base.py) consequently omits it from the VM message. The shared app/test helper now anchors **simulation only** to the latest timestamp read from the chain RPC. It does not use browser wall time and does not bypass failed estimates. The rejection evidence records the exact simulation timestamp and source.

**No live broadcast transaction includes a time override.** Receipt checks verify this. The real appeal and permissionless finalization then succeeded using their actual transaction timestamps.

## Reproduce and inspect

1. Open the public app and choose **CharterGate v2 review 2026-09-20T20:40:44.928Z**.
2. Inspect the two free-workshop records: same body, different author/ID. The first author's ballot is PASSED.
3. Inspect the paid and hostile proposals: both are blocked.
4. Inspect the missing-details proposal, its same-text appeal and preserved original.
5. Choose **CharterGate v2 ambiguous 2026-09-20T20:40:44.928Z**: its proposal is Needs clarification.
6. To sign your own test, create a new community on chain 61997 with your wallet included, quorum 1 and a five-minute window. Vote before the deadline; finalize after it. Only free test GEN is needed.

Automated checks:

```sh
npm ci
npm run lint
npm run typecheck
npm test
pip install -r requirements.txt
# GENVM_VERSION=v0.6.0-rc5, PYTHONUTF8=1, PYTHONIOENCODING=utf-8
genvm-lint check contracts/chartergate_v2.py --json
python -m pytest tests/direct -q
npm run build
npm run verify:chain
```

Local regression results: **75 direct contract tests (35 v1 history, 40 v2)** and **36 frontend/helper tests** pass. Live evidence contains **12 finalized, successfully executed v2 transactions**, with at least two independent validator agreements per transaction. Read-only negative simulations are not counted as transactions.

V2 SDK signing uses disposable funded test accounts, not the user's MetaMask keys. The seven earlier MetaMask signatures tested v1; they do not certify v2/mobile wallet signing. Production publication and browser observations are recorded separately in the release evidence.

## Short response for the portal

### Publication verification

Published to the existing Vercel URL with the v2 binding. Anonymous HTTP checks matched the exact built page, Python source and both evidence files. Chrome loaded the live v2 records and reconnected MetaMask; expired voting controls were disabled and non-owner finalization was available. No new MetaMask signature was requested. The complete paced public audit passed. [GitHub CI passed for the released application](https://github.com/sanity456/chartergate/actions/runs/35537507565). See [release verification](../deployments/v2-release-review.json) for exact scope and artifact hashes.

### Copy this response

Implemented all five requests in CharterGate v2 on Studio Next (61997). Validators now independently check every leader quote and reason as well as rule statuses. Blocked authors get one same-body appeal with immutable history. Proposal IDs include the author address. Voting has fixed deadlines, no early closure and permissionless finalization. Live hostile-prompt and ambiguous-rule cases passed with independent validator agreement. Twelve v2 transactions finalized successfully; 75 contract and 36 frontend/helper tests pass. The linked response supplies the new address, source hash, exact transaction evidence, reproduction steps and remaining trust boundaries. V1 evidence is retained as historical, not relabelled as v2.
