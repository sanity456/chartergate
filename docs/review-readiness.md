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
- Frontend utility/wallet tests: 10 passed. Wallet tests use simulated providers, not real extensions.
- Lint and TypeScript: passed.
- Production static build: passed.
- Studio Next live flow: community creation, eligible screening, YES vote, successful ballot closure, ineligible screening, and needs-clarification screening all finalized with successful execution. See `deployments/studio-next.json` for exact transactions, verdicts and validator outcomes.
- Read-only negative GenVM simulations: see `deployments/negative-checks.json`. These verify rejected votes and unchanged records, not broadcast negative transactions.
- Browser: no-wallet dialog, invalid community input, live ineligible decision/evidence, draft staging, desktop/mobile layout checks, and WebMCP valid/invalid input checked.

## Remaining before submission

1. Run the complete browser signing journey using the intended real wallet extension. No actual MetaMask/OKX/Phantom extension signature has been verified for this new app yet. A supported extension is not installed in the preview browser.
2. Create a community owned by the submitter's wallet. The seeded verification community belongs to a disposable test wallet; visitors should create their own to exercise voting.
3. Decide when to make the website and GitHub source accessible to reviewers. Default hosting is private. No public GitHub repository has been created by this build.
4. Record a short demo and prepare the exact Builder form. Recheck the live chain, source hash and verification links on submission day because Studio Next can reset.

## Limitations to disclose

This is a low-stakes prototype, not a production DAO or treasury. AI screening can misinterpret natural language and does not prove real-world truth or future delivery. Quorum is a minimum turnout, not a requirement to wait for every voter: the community owner can close after quorum, and can delay closure. There is no fixed voting deadline, appeal, token weighting, one-person identity proof, or automatic payment. Wallet support depends on EIP-1193 and custom-network capability. Mobile signing is not verified. On-chain text and wallet addresses are public even when the website is private.
