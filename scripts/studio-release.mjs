// Disposable Studio Next accounts only. No user wallet, key export, or real funds.
import { createAccount, createClient } from "genlayer-js";
import { TransactionHashVariant } from "genlayer-js/types";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { ACTIVE_CHAIN, NETWORK } from "../lib/network.ts";
import {
  plain,
  executionSucceeded,
  receiptStatus,
  EXAMPLE_RULES,
  EXAMPLES,
} from "../lib/protocol.ts";
const account = createAccount();
const client = createClient({ chain: ACTIVE_CHAIN, account });
const path = new URL("../deployments/studio-next.json", import.meta.url);
const stringify = (v) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2) +
  "\n";
const sha = (v) => createHash("sha256").update(v).digest("hex");
const verify = process.argv.includes("--verify");
await mkdir(new URL("../deployments/", import.meta.url), { recursive: true });
let report;
try {
  report = JSON.parse(await readFile(path, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT" || verify) throw e;
  report = {
    chain_id: 61997,
    rpc: NETWORK.rpc,
    sdk_version: "2.0.0-rc.1",
    transactions: [],
    created_at: new Date().toISOString(),
  };
}
const save = () => writeFile(path, stringify(report));
assert.equal(Number(await client.request({ method: "eth_chainId" })), 61997);
const read = async (method, args = []) =>
  plain(
    await client.readContract({
      address: report.address,
      functionName: method,
      args,
      transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
    }),
  );
async function finish() {
  for (let i = 0; i < 100; i++) {
    const r = await client.getTransaction({ hash: report.pending.hash });
    const status = receiptStatus(r);
    if (i % 5 === 0) console.log(stringify({ ...report.pending, status }));
    if (["FINALIZED", "CANCELED", "UNDETERMINED"].includes(status)) {
      const success = status === "FINALIZED" && executionSucceeded(r);
      const tx = {
        ...report.pending,
        status,
        execution_success: success,
        execution_result: r.txExecutionResultName ?? r.txExecutionResult,
        completed_at: new Date().toISOString(),
        validators: r.consensus_data?.leader_receipt?.map(
          ({ mode, vote, execution_result }) => ({
            mode,
            vote,
            execution_result,
          }),
        ),
      };
      report.transactions.push(tx);
      if (success && report.pending.action === "deploy") {
        report.address =
          r.recipient || r.to_address || r.txDataDecoded?.contractAddress;
        report.deployment_tx = report.pending.hash;
      }
      delete report.pending;
      await save();
      if (!success) console.log(stringify(r));
      assert.equal(
        success,
        true,
        "Contract execution failed; inspect evidence before retrying.",
      );
      return r;
    }
    await new Promise((r) => setTimeout(r, 6000));
  }
  throw Error(
    "Transaction still pending. Resume this script to track the same hash.",
  );
}
async function fees(request) {
  assert.equal(
    await client.request({ method: "eth_gasPrice" }),
    "0x0",
    "Sandbox policy changed; stop.",
  );
  const q = request
    ? await client.estimateTransactionFeesForWrite(request)
    : await client.estimateTransactionFees();
  assert.ok(q.feeValue <= 1000000000000000000n, "Unexpectedly large test fee.");
  return {
    distribution: q.distribution,
    feeValue: q.feeValue,
    messageAllocations: q.messageAllocations,
  };
}
async function write(action, method, args) {
  const request = {
    address: report.address,
    functionName: method,
    args,
    value: 0n,
    leaderOnly: false,
  };
  const hash = await client.writeContract({
    ...request,
    fees: await fees(request),
  });
  report.pending = { action, hash, account: account.address, method, args };
  await save();
  await finish();
}
if (report.pending) {
  assert.ok(!verify, "Pending transaction requires explicit resume");
  await finish();
}
const code = await readFile(
  new URL("../contracts/chartergate.py", import.meta.url),
  "utf8",
);
if (!report.address) {
  assert.ok(!verify, "No deployment exists");
  await client.getContractSchemaForCode(code);
  const hash = await client.deployContract({
    code,
    args: [],
    leaderOnly: false,
    fees: await fees(),
  });
  report.source_sha256 = sha(code);
  report.pending = { action: "deploy", hash, account: account.address };
  await save();
  await finish();
}
assert.equal(
  report.source_sha256,
  sha(code),
  "Source changed since deployment; no silent overwrite.",
);
const raw = await client.getContractCode(report.address);
assert.equal(
  sha(
    raw.startsWith("0x") ? Buffer.from(raw.slice(2), "hex") : Buffer.from(raw),
  ),
  sha(code),
  "On-chain source differs.",
);
report.source_exact = true;
report.config = await read("get_config");
assert.equal(report.config.policy, "chartergate/rules-v1");
await save();
console.log(
  stringify({
    verified_address: report.address,
    source_sha256: sha(code),
    config: report.config,
  }),
);
if (!process.argv.includes("--exercise")) process.exit(0);
assert.ok(!verify, "--verify must remain read-only");
const name = "CharterGate live test " + new Date().toISOString();
await write("create_community", "create_community", [
  name,
  JSON.stringify(EXAMPLE_RULES),
  JSON.stringify([account.address]),
  1,
]);
const community = (await read("list_communities", [0, 20])).items.find(
  (c) => c.name === name,
);
assert.ok(community);
report.test_community_id = community.id;
await save();
for (const [key, example] of Object.entries(EXAMPLES)) {
  await write("screen_" + key, "submit_proposal", [
    community.id,
    example.title,
    example.body,
    "",
  ]);
  const p = (await read("list_proposals", [community.id, 0, 20])).items.find(
    (p) => p.body === example.body,
  );
  const expected = {
    eligible: "ELIGIBLE",
    ineligible: "INELIGIBLE",
    clarification: "NEEDS_CLARIFICATION",
  }[key];
  assert.equal(p.review.verdict, expected);
  const gate = await read("evaluate_eligibility_view", [community.id, p.id]);
  assert.equal(gate.satisfied, key === "eligible");
  report[key] = { proposal_id: p.id, review: p.review, gate };
  await save();
  if (key === "eligible") {
    await write("vote_yes", "vote", [p.id, "YES"]);
    await write("close_ballot", "close_ballot", [p.id]);
    const final = await read("get_proposal", [p.id]);
    assert.equal(final.ballot.outcome, "PASSED");
    assert.equal(final.ballot.yes, 1);
    report.eligible.ballot = final.ballot;
    await save();
  }
}
report.live_workflow_passed = true;
report.completed_at = new Date().toISOString();
await save();
console.log("LIVE WORKFLOW PASSED");
