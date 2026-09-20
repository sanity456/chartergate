# CharterGate — Builder submission draft

This is a normal Builder project submission, not a hackathon entry. Copy into matching fields only; this document is not a submitted form.

## Title

CharterGate — charter-aware proposal screening and gated community voting

## Description (under 1,000 characters)

CharterGate is a GenLayer-native prototype for low-stakes community governance. A community defines an immutable charter, voter list and quorum. Its intelligent contract screens proposal details against every rule, records cited evidence and independently validated rule decisions, and classifies proposals as Eligible, Ineligible or Needs clarification. Only eligible proposals can receive votes; the contract enforces this gate. Authors can revise blocked proposals into new linked records without erasing the original. Allowed wallets vote once, and the owner can close after quorum. Seven user-approved desktop Chrome/MetaMask transactions verified creation, screening, voting, closure and revision on Studio Next (61997). Read-only simulations also verified that blocked proposals reject votes. Source, deployment evidence and test results are provided. This is not a treasury or production DAO, and AI screening does not prove real-world truth.

## Website

https://chartergate-studionet.vercel.app/

## GitHub repository

https://github.com/sanity456/chartergate

## Optional contract link

https://explorer-studio-dev.genlayer.com/address/0x132EfCaf14b265a7E936174DCb04b947eCA892e4

Network: Studio Next / development preview, chain 61997. Do not label it stable Studio 61999 or Bradbury. If a portal rejects a supported URL format, retain the exact URL as Other evidence or in the description; do not substitute an unrelated explorer or contract.

## Evidence entries

| Type | Link | What it proves |
| --- | --- | --- |
| GitHub Repository | https://github.com/sanity456/chartergate | Source, pinned dependencies, tests and reproduction instructions |
| GitHub File | https://github.com/sanity456/chartergate/blob/main/contracts/chartergate.py | Native contract implementation |
| GitHub File | https://github.com/sanity456/chartergate/blob/main/deployments/browser-wallet-test.json | Seven real user-approved transactions, blocked-vote simulations and immutable revision history |
| GitHub File | https://github.com/sanity456/chartergate/blob/main/docs/review-readiness.md | Test scope and limitations |
| Other | https://chartergate-studionet.vercel.app/contract/browser-wallet-test.json | Same downloadable real-wallet evidence |

If a video is requested, record the guide in `docs/demo-script.md`, upload it to your own channel, and supply the actual video URL. No CharterGate video has been recorded or uploaded by this task. Do not reuse the TranslateCheck video.

## Reviewer reproduction

1. Open the public app and select CharterGate Wallet Test. Reading requires no wallet signature.
2. Inspect the free workshop: Eligible, with a PASSED closed ballot (1 Yes / 0 No).
3. Inspect the paid workshop: the free-entry rule fails and voting is blocked.
4. Inspect the original developer meetup: the cost rule is unclear and voting is blocked.
5. Inspect the clarified meetup: all three rules pass. View preserved original returns the unchanged clarification record.
6. To sign your own tests, connect a supported wallet on chain 61997, obtain free test GEN, create your own community and include your wallet in its voter list.

## Disclosures

Natural-language screening can be wrong. It evaluates written commitments, not future delivery. Public text/wallet addresses are on-chain. The owner decides when to close once quorum is reached; there is no deadline, appeal, treasury, token weighting or identity proof. Studio Next can reset. Real signing was tested with desktop Chrome/MetaMask; other wallets and mobile signing are unverified. Test evidence distinguishes successful execution from finalization and discloses validators cancelled after quorum. Recheck source, chain, links and deployment state before submission. The user submits the final form.
