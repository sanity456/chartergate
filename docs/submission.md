# CharterGate v2 — resubmission fields

Normal Builder contribution, not a hackathon entry. The owner uploads the logo and clicks Resubmit.

## Project name

CharterGate

## Tags

Governance / Proposal Screening / Quorum Enforcement

## One-liner (under 180 characters)

GenLayer-native proposal screening with validator-checked explanations, same-text appeals and deadline-based community voting.

## Description (under 1,000 characters)

CharterGate screens community proposals against immutable charter rules using GenLayer. Validators independently assess each rule and check that every leader quote and reason supports its decision. Only eligible proposals can receive votes. Blocked authors can request one unchanged-text appeal after a cooldown or submit a linked revision; original records remain intact. Proposal IDs include the author's address to prevent copied text from reserving another author's ID. Communities set an immutable voting window. No one can close early; any wallet can finalize after the deadline. Missing quorum and ties do not pass. V2 includes live hostile-prompt and ambiguous-rule tests, author-isolation and appeal evidence, plus deterministic regressions. Membership remains creator-selected. This is a low-stakes prototype, not a treasury or identity system; screening does not verify future delivery.

## Website

https://chartergate-studionet.vercel.app/

## GitHub

https://github.com/sanity456/chartergate

## Contract link

https://explorer-studio-dev.genlayer.com/address/0x75bd5c02cc488eCee4DC5a2E865FD458204cB1f0

Studio Next, chain 61997. Replace the old v1 address in the submission; do not substitute stable Studio or Bradbury.

## How-to steps

1. **Open the review community:** Open the website and select “CharterGate v2 review” followed by its timestamp. No wallet is required to inspect records.
2. **Check the decisions:** Open the free, paid, missing-details and hostile proposals. Inspect each rule's status, cited quote and reason. Paid and hostile proposals are blocked.
3. **Check appeal history:** Open the same-text appeal, then “View preserved original.” Both bodies match; the original remains unchanged.
4. **Check neutral closure:** Inspect the free workshop's PASSED ballot, 1 Yes / 0 No, fixed deadline and finalizer in linked evidence. A non-owner finalized after the deadline.
5. **Try your own workflow:** Connect on chain 61997, obtain free test GEN, create a community including your wallet, quorum 1 and a 5-minute window. Screen, vote before the deadline and finalize after it. Screen missing details to test the same-text appeal after 60 seconds.

## Expected verification outcome (under 500 characters)

The v2 review community shows Eligible, Ineligible and Needs clarification decisions with per-rule evidence. Paid and hostile proposals cannot receive votes. The same-text appeal links to an unchanged original. Different authors have distinct IDs for identical text. A non-owner finalized the eligible ballot after its fixed deadline (PASSED, 1 Yes/0 No). The ambiguous charter yields Needs clarification. Linked evidence includes successful receipts and rejected-write simulations.

## Evidence

- **GitHub Repository:** https://github.com/sanity456/chartergate
- **GitHub File:** https://github.com/sanity456/chartergate/blob/main/docs/steward-response-v2.md
- **GitHub File:** https://github.com/sanity456/chartergate/blob/main/deployments/studio-next-v2.json
- **GitHub File:** https://github.com/sanity456/chartergate/blob/main/deployments/negative-checks-v2.json
- **GenLayer Explorer Contract:** the exact v2 explorer URL above.

No demo video required. Upload `public/chartergate-logo-cg.png`. Do not use v1 MetaMask transactions as v2 signing evidence.
