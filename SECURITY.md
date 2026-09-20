# Security model

CharterGate is a Studio Next prototype for public, low-stakes community proposals. Do not submit confidential information or use it for consequential eligibility decisions.

## Trust boundaries

The frontend cannot set a screening result or alter a ballot. The contract runs the LLM-based review, validates evidence, reaches agreement on each rule status, derives eligibility, and gates every vote. User proposal text is untrusted data. AI outputs still carry residual prompt-injection and interpretation risk; exact quote checks do not prove the quality of the reasoning.

Each community has immutable rules, an immutable wallet allowlist, a fixed quorum and a creator-controlled closure policy. Owners cannot rewrite results or votes. They can decide when to close after quorum, or never close; this is disclosed in the creation confirmation and charter. A wallet is not proof of one human. Public submission can be spammed and community names are not unique or authenticated identities.

Identical proposal bodies in the same community reuse a single identity and cannot be rerolled. Semantically similar but textually different submissions are not deduplicated. Someone can submit identical text first; the MVP does not establish copyright or original authorship.

No private key is requested or stored by the app. Wallet signing stays in the selected provider. Only a resumable transaction checkpoint is kept in browser storage, scoped to chain and contract; it is never a source of governance truth. All state displayed as live comes from finalized chain reads. A finalized transaction with a failed execution is not reported as successful.

The deployment has no proxy, upgrade key, treasury, transfer, or payable workflow. Releasing changed contract code requires a new deployment and source hash. Studio Next infrastructure can reset its state independently of the app. Source hashes and immutable IDs identify bytes, not a guarantee of safety.

## Verification

Run the direct contract suite, frontend utility tests, lint and type checks, then the read-only deployment verification. The live exercise script creates disposable sandbox accounts. Never put a real wallet private key in that script. See `docs/review-readiness.md` for precisely which checks have been performed and which remain.
