# CharterGate review checklist

## What is implemented

- One native GenLayer contract owns communities, immutable charters, proposal screening, revisions, voter authorization, votes, quorum, and final ballot outcomes.
- Every validator independently classifies every rule. Agreement is required on the entire ordered vector of rule statuses, not merely the overall decision or output shape.
- A deterministic read derives eligibility. No LLM runs at query time. The vote method enforces the same gate.
- Evidence quotes must occur literally in the submitted proposal; malformed output fails closed.
- Community rules and voter membership are fixed. Revisions preserve the old record. Identical proposal text cannot be rerolled in the same community by changing its title or author.
- Browser-wallet discovery, custom-network switching, fee quotes, account revalidation, transaction links and resumable tracking are implemented. Finalization is checked separately from successful execution.

## Evidence from September 20, 2026

- GenVM lint: passed against the pinned runner.
- Direct tests: 35 passed. These mock LLM responses and test storage/rule behavior; independent-validator callback tests are included.
- Frontend utility/wallet tests: 29 passed after the wallet UX changes (the original 10 plus 19 regression checks). These tests use simulated providers, not real extensions.
- Lint and TypeScript: passed.
- Production static build: passed.
- Studio Next live flow: community creation, eligible screening, YES vote, successful ballot closure, ineligible screening, and needs-clarification screening all finalized with successful execution. See `deployments/studio-next.json` for exact transactions, verdicts and validator outcomes.
- Read-only negative GenVM simulations: see `deployments/negative-checks.json`. These verify rejected votes and unchanged records, not broadcast negative transactions.
- Browser: no-wallet dialog, invalid community input, live ineligible decision/evidence, draft staging, desktop/mobile layout checks, and WebMCP valid/invalid input checked.
- Public Vercel hosting: https://chartergate-studionet.vercel.app/ is deployed in the owner's `sanity3` account space. Unauthenticated HTTP checks returned 200 for the app, contract source and both evidence files, with exact local artifact matches. The app loads in Chrome without a hosting sign-in. This hosting check does not establish successful wallet signing.
- Real Chrome/MetaMask happy path: the submitter created an owned community, screened an eligible proposal, voted YES and closed its ballot. All four transactions finalized with successful execution. Finalized state and the browser show PASSED, YES 1 / NO 0; the vote and screening history were preserved. See `deployments/browser-wallet-test.json` for hashes, detailed validator outcomes, recovery observations and remaining browser flows. This local evidence file has not yet been published to Vercel.
- Real Chrome/MetaMask ineligible path: the paid-workshop screening finalized successfully with rule statuses FAIL/PASS/PASS. The deterministic eligibility view returned `satisfied: false` and `INELIGIBLE`; the browser displayed blocked voting without vote/close buttons and offered a revision. A read-only GenVM vote simulation on that same proposal rejected with `VOTING_BLOCKED:INELIGIBLE` and preserved its full record. No failing vote transaction was broadcast. Evidence is in `deployments/browser-wallet-test.json`.
- Real Chrome/MetaMask clarification path: the meetup screening finalized successfully with UNCLEAR/PASS/PASS because attendance cost was omitted. The eligibility view returned `satisfied: false` with `NEEDS_CLARIFICATION`. The browser offered revision but no vote/close controls. A read-only GenVM vote simulation rejected with `VOTING_BLOCKED:NEEDS_CLARIFICATION` and preserved the record. The complete original record's canonical JSON hash is saved before revision for an exact preservation check.
- Real Chrome/MetaMask revision path: adding explicit free attendance produced a new linked record with PASS/PASS/PASS and `satisfied: true`. Its ballot opened at 0/0, voting was enabled for the authorized wallet, and closure stayed disabled before quorum. The original's complete canonical record hash was identical before/after revision, its eligibility stayed false, both records appeared in the list, and View preserved original opened the original blocked decision. Seven user-approved transactions finalized successfully across the planned desktop MetaMask test flows. No vote or closure was requested for the revision.
- Final read-only release check at 2026-09-20T14:48:03.832Z: RPC is chain 61997; live contract source matches the pinned frontend/source hash exactly; app, source and the two existing public evidence files all return HTTP 200 anonymously and match local bytes. The new browser-wallet evidence URL still returns 404. `gh repo view sanity456/chartergate` could not resolve a repository, so reviewer source access has not been established.

## Remaining before submission

1. Record/upload the demo if the actual Builder form requires it. A 90-second guide is in `docs/demo-script.md`; no CharterGate video has been recorded or uploaded. A 950-character description and exact evidence URLs are in `docs/submission.md`; the form itself has not been submitted.
2. Recheck the live chain, source hash and links on submission day because Studio Next can reset. Scope wallet claims to what was tested: the planned desktop Chrome/MetaMask flows passed; OKX/Phantom extension signing and mobile signing have not been verified.

## Wallet UX follow-up release

The observations in the browser-wallet evidence are preserved as test history. The later frontend changes address the reproducible issues without changing the contract:

- Same-account/checksum-only and successful Studio Next chain events no longer clear the connection. Genuine context changes still invalidate it and cancel requests being prepared. Connection validates identity after switching; signing preparation rechecks account and chain.
- The app reads the active-chain pending balance before requesting a signature, compares it with the protocol deposit using bigint arithmetic, and stops on insufficient or unverifiable funds. Errors explain the balance/shortfall and separate 61997 from 61999, with a free-faucet link.
- Unlock/reconnect/reload guidance is visible. Existing pending transaction hashes remain resumable. The app cannot guarantee recovery of a broken extension transport without a reload.
- Lint/type-check exclusions now omit generated packaging output and local runtime directories; application and test-source checks remain enabled.
- Clean checks with the pinned Python dependencies: GenVM lint passed and 35 direct tests passed. Frontend tests: 29 passed. ESLint, TypeScript and production build passed.
- The patched app was published to the same public Vercel URL. Anonymous HTTP checks returned 200 with exact local bytes for the app, contract source, deployment evidence and the newly available browser-wallet evidence. The existing MetaMask account reconnected successfully in Chrome and remained connected on follow-up inspection; no new transaction was requested. See `deployments/vercel.json` for the release identifier and scope.
- Source and reviewer documents are published in the explicitly authorized public `sanity456/chartergate` repository. The original private Sites copy is not the submission URL. Earlier 404/no-repository observations above describe the pre-publication state, not this follow-up release.

The seven signed transactions predate this frontend-only patch. Do not describe them as seven new signatures on the patched frontend. The new event/balance failure paths have simulated-provider regression coverage; follow-up real MetaMask connection checks do not sign new transactions.

## Limitations to disclose

This is a low-stakes prototype, not a production DAO or treasury. AI screening can misinterpret natural language and does not prove real-world truth or future delivery. Quorum is a minimum turnout, not a requirement to wait for every voter: the community owner can close after quorum, and can delay closure. There is no fixed voting deadline, appeal, token weighting, one-person identity proof, or automatic payment. Wallet support depends on EIP-1193 and custom-network capability. Mobile signing is not verified. On-chain text and wallet addresses are public even when the website is private.
