// Actual deployed GenVM, read-only simulations. No signing keys or broadcasts.
import { createClient, abi } from "genlayer-js";
import { TransactionHashVariant } from "genlayer-js/types";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { ACTIVE_CHAIN, NETWORK } from "../lib/network.ts";
import { DEPLOYMENT } from "../lib/deployment.ts";
import { simulationTime } from "../lib/studio-fees.ts";
import { plain, receiptStatus, executionSucceeded } from "../lib/protocol.ts";
const file = (path) => new URL("../" + path, import.meta.url);
const evidence = JSON.parse(
  await readFile(file("deployments/studio-next-v2.json"), "utf8"),
);
assert.equal(evidence.live_workflow_passed, true);
assert.equal(evidence.live_adversarial_passed, true);
const client = createClient({ chain: ACTIVE_CHAIN });
const read = async (method, args = []) => {
  await new Promise((r) => setTimeout(r, 2000));
  return plain(
    await client.readContract({
      address: evidence.address,
      functionName: method,
      args,
      transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
    }),
  );
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const report = {
  checked_at: new Date().toISOString(),
  chain_id: 61997,
  address: evidence.address,
  source_sha256: evidence.source_sha256,
  read_only: true,
  new_transactions_broadcast: 0,
  checks: [],
  transactions: [],
};
assert.equal(Number(await client.request({ method: "eth_chainId" })), 61997);
const raw = await client.getContractCode(evidence.address);
const code = raw.startsWith("0x")
  ? Buffer.from(raw.slice(2), "hex")
  : Buffer.from(raw);
assert.equal(hash(code), evidence.source_sha256);
assert.deepEqual(code, await readFile(file("contracts/chartergate_v2.py")));
report.source_exact = true;
const config = await read("get_config");
assert.equal(config.policy, "chartergate/rules-v2");
assert.equal(config.closure, "ANYONE_AFTER_DEADLINE");
assert.deepEqual(config.consensus_fields, [
  "status",
  "quote_support",
  "reason_support",
]);
for (const key of [
  "eligible",
  "ineligible",
  "clarification",
  "hostile_injection",
  "ambiguous_charter",
  "second_author_same_body",
]) {
  const expected = evidence[key];
  const actual = await read("get_proposal", [expected.proposal_id]);
  assert.deepEqual(actual, expected.record, key + " record changed");
  assert.deepEqual(
    await read("evaluate_eligibility_view", [actual.community_id, actual.id]),
    expected.gate,
  );
}
const original = await read("get_proposal", [
  evidence.clarification.proposal_id,
]);
const appeal = await read("get_proposal", [
  (await read("get_appeal", [original.id])).proposal_id,
]);
assert.deepEqual(appeal, evidence.appeal.record);
assert.equal(appeal.body, original.body);
assert.equal(appeal.parent_id, original.id);
assert.equal(appeal.kind, "APPEAL");
assert.notEqual(
  evidence.eligible.proposal_id,
  evidence.second_author_same_body.proposal_id,
);
assert.equal(
  evidence.eligible.record.ballot.finalized_by,
  evidence.accounts[1].toLowerCase(),
);
assert.equal(evidence.eligible.record.ballot.outcome, "PASSED");
report.unchanged_text_appeal_and_original_preserved = true;
report.author_bound_ids = true;
report.non_owner_finalized = true;
async function reject(label, proposalId, method, args, from, expected) {
  const before = await read("get_proposal", [proposalId]);
  const datetime = await simulationTime(client);
  const data = abi.transactions.serialize([
    abi.calldata.encode(
      abi.calldata.makeCalldataObject(method, args, undefined),
    ),
    false,
  ]);
  const response = await fetch(NETWORK.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sim_call",
      params: [
        {
          type: "write",
          to: evidence.address,
          from,
          data,
          transaction_hash_variant: "latest-final",
          sim_config: { genvm_datetime: datetime },
        },
      ],
    }),
  });
  assert.equal(
    response.ok,
    true,
    `Simulation HTTP ${response.status}; retry the read-only audit later if rate-limited`,
  );
  const result = await response.json();
  const receipt = result.error?.data?.receipt;
  assert.equal(
    receipt?.execution_result,
    "ERROR",
    JSON.stringify(result).slice(0, 1500),
  );
  const rejection = Buffer.from(receipt.result, "base64")
    .subarray(1)
    .toString("utf8");
  assert.equal(rejection, "[EXPECTED] " + expected);
  assert.deepEqual(await read("get_proposal", [proposalId]), before);
  report.checks.push({
    case: label,
    method,
    proposal_id: proposalId,
    rejection,
    state_unchanged: true,
    transaction_broadcast: false,
    checked_at: new Date().toISOString(),
    ballot_deadline_unix: before.ballot.deadline_unix,
    simulation_datetime: datetime,
    simulation_time_source:
      "latest RPC block timestamp; simulation only, not a broadcast override",
  });
  console.log(label + ": " + rejection);
}
for (const key of [
  "ineligible",
  "clarification",
  "hostile_injection",
  "ambiguous_charter",
]) {
  const p = evidence[key].record;
  await reject(
    key,
    p.id,
    "vote",
    [p.id, "YES"],
    evidence.accounts[0],
    "VOTING_BLOCKED:" + p.review.verdict,
  );
}
await reject(
  "closed_ballot",
  evidence.eligible.proposal_id,
  "vote",
  [evidence.eligible.proposal_id, "YES"],
  evidence.accounts[0],
  "BALLOT_CLOSED",
);
await reject(
  "appeal_limit",
  original.id,
  "appeal_proposal",
  [original.id],
  evidence.accounts[0],
  "APPEAL_LIMIT_REACHED",
);
await reject(
  "appeal_author_only",
  original.id,
  "appeal_proposal",
  [original.id],
  evidence.accounts[1],
  "ONLY_AUTHOR_CAN_APPEAL",
);
await reject(
  "same_author_reroll",
  original.id,
  "submit_proposal",
  [
    original.community_id,
    "Renamed to bypass duplicate check",
    original.body,
    "",
  ],
  evidence.accounts[0],
  "IDENTICAL_PROPOSAL_ALREADY_SCREENED",
);
const unclosed = evidence.second_author_same_body.record;
if (Date.now() / 1000 < unclosed.ballot.deadline_unix)
  throw Error(
    "Wait for the real second-author deadline, then rerun. No timestamp override permitted.",
  );
await reject(
  "expired_unclosed_ballot",
  unclosed.id,
  "vote",
  [unclosed.id, "YES"],
  evidence.accounts[0],
  "VOTING_DEADLINE_REACHED",
);
for (const tx of evidence.transactions) {
  await new Promise((r) => setTimeout(r, 1800));
  const receipt = plain(await client.getTransaction({ hash: tx.hash }));
  assert.equal(receiptStatus(receipt), "FINALIZED");
  assert.equal(executionSucceeded(receipt), true);
  const validators = receipt.consensus_data?.validators || [];
  if (tx.action.startsWith("screen_") || tx.action === "same_body_appeal")
    assert.ok(
      validators.filter(
        (r) =>
          r.mode === "validator" &&
          r.vote === "agree" &&
          r.execution_result === "SUCCESS",
      ).length >= 2,
      "No successful independent validator agreement: " + tx.action,
    );
  report.transactions.push({
    action: tx.action,
    hash: tx.hash,
    status: "FINALIZED",
    execution_success: true,
  });
}
if (process.argv.includes("--public")) {
  assert.equal(DEPLOYMENT.address, evidence.address);
  assert.equal(DEPLOYMENT.sourceSha256, evidence.source_sha256);
  assert.equal(DEPLOYMENT.policy, evidence.policy);
  report.public_assets = [];
  for (const [path, local] of [
    ["/contract/chartergate_v2.py", "contracts/chartergate_v2.py"],
    ["/contract/deployment-v2.json", "deployments/studio-next-v2.json"],
    [
      "/contract/negative-checks-v2.json",
      "deployments/negative-checks-v2.json",
    ],
  ]) {
    const response = await fetch(
      "https://chartergate-studionet.vercel.app" + path,
      { signal: AbortSignal.timeout(30000) },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      await readFile(file(local)),
    );
    report.public_assets.push({ path, status: 200, exact_local_match: true });
  }
  const home = await fetch("https://chartergate-studionet.vercel.app/", {
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.ok(html.includes(evidence.address) && html.includes("61997"));
  const github = await fetch(
    "https://raw.githubusercontent.com/sanity456/chartergate/main/contracts/chartergate_v2.py",
    { signal: AbortSignal.timeout(30000) },
  );
  assert.equal(github.status, 200);
  assert.equal(
    hash(Buffer.from(await github.arrayBuffer())),
    evidence.source_sha256,
  );
  report.public_app_and_github_passed = true;
}
report.passed = true;
// Preserve the release's exact evidence on public rechecks; print the fresh audit.
if (!process.argv.includes("--public"))
  await writeFile(
    file("deployments/negative-checks-v2.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
console.log(JSON.stringify(report, null, 2));
