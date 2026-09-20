// Refresh sanitized public receipt evidence; no keys, signing or broadcasting.
import { createClient } from "genlayer-js";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { ACTIVE_CHAIN } from "../lib/network.ts";
import { plain, receiptStatus, executionSucceeded } from "../lib/protocol.ts";
const path = new URL("../deployments/studio-next-v2.json", import.meta.url);
const report = JSON.parse(await readFile(path, "utf8"));
assert.equal(report.live_workflow_passed, true);
const client = createClient({ chain: ACTIVE_CHAIN });
const summarize = ({ mode, vote, execution_result, genvm_result }) => ({
  mode,
  vote,
  execution_result,
  error_code: genvm_result?.error_code,
});
for (const tx of report.transactions) {
  await new Promise((r) => setTimeout(r, 1800));
  const receipt = plain(await client.getTransaction({ hash: tx.hash }));
  assert.equal(receiptStatus(receipt), "FINALIZED");
  assert.equal(executionSucceeded(receipt), true);
  assert.equal(receipt.leader_only, false);
  assert.ok(
    !receipt.sim_config?.genvm_datetime,
    "Broadcast transaction must not override time",
  );
  tx.leader_receipts = (receipt.consensus_data?.leader_receipt || []).map(
    summarize,
  );
  tx.validators = (receipt.consensus_data?.validators || []).map(summarize);
  tx.agreeing_validators = tx.validators.filter(
    (r) => r.vote === "agree" && r.execution_result === "SUCCESS",
  ).length;
  tx.transaction_created_at = receipt.created_at;
  tx.leader_only = receipt.leader_only;
  tx.broadcast_time_override = false;
  assert.ok(
    tx.agreeing_validators >= 2,
    "Need multiple independent validator agreements: " + tx.action,
  );
  console.log(
    tx.action +
      ": " +
      tx.agreeing_validators +
      " independent validators agreed",
  );
}
report.receipts_verified_at = new Date().toISOString();
await writeFile(path, JSON.stringify(report, null, 2) + "\n");
