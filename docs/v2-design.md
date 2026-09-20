# CharterGate v2 — steward remediation boundary

The original v1 deployment and its evidence remain historical, not migrated or erased. The public app must switch only after v2 is deployed and verified; the active binding is in lib/deployment.ts. See steward-response-v2.md for release evidence.

- Frontend owns forms, wallet selection, estimated countdowns and read-only presentation. Browser time never authorizes a vote or closure.
- Contract owns immutable charter/membership/quorum/voting duration, author-bound proposal IDs, decisions, a single author-requested same-body appeal, votes and permissionless deadline-based finalization.
- Evidence is public proposal text and charter rules, not externally verified delivery. Validators independently classify the rules, then judge every leader quote and reason against the original input and independent assessment. Exact prose agreement is not required; exact rule statuses and explicit per-field justification approval are.
- Each distinct author/body within a community has one initial assessment and at most one same-body appeal after a 60-second cooldown. An appeal creates a new linked immutable record; the original decision remains unchanged. No owner override. An eligible decision cannot be appealed to restart voting.
- The community chooses an immutable voting window of 5 minutes to 7 days (UI default 24 hours). Every eligible record receives a fixed deadline based on its screening transaction timestamp. No one, including the owner, can close early. Voting stops at the deadline; any wallet can finalize afterward. Missing quorum becomes NO_QUORUM, never a passing result.
- Membership is still an explicitly disclosed creator-selected immutable allowlist. Neutral closing time addresses steward request 4 without claiming permissionless membership or identity resistance.
- Direct tests cover deterministic boundaries and hostile validator payloads. Live Studio Next cases must separately exercise hostile proposal instructions and ambiguous criteria using actual validators. Mocked tests are never described as live consensus.

The deployed runner uses the existing verified `# v0.3.0` format marker followed by a concrete pinned Depends hash. This keeps the live runner's required header format; no test/latest runner alias is used.

Time follows the transaction context, not validator wall clock: https://docs.genlayer.com/developers/intelligent-contracts/features/transaction-context. Views report eligibility, not a guarantee that a later voting transaction arrives before its deadline.
