// Non-mutating checks against the submitted deployment's actual GenVM.
import { createClient, abi } from "genlayer-js";
import { TransactionHashVariant } from "genlayer-js/types";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { ACTIVE_CHAIN } from "../lib/network.ts";
import { plain } from "../lib/protocol.ts";
const report = JSON.parse(
  await readFile(
    new URL("../deployments/studio-next.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(report.live_workflow_passed, true);
const client = createClient({ chain: ACTIVE_CHAIN });
const read = async (id) =>
  plain(
    await client.readContract({
      address: report.address,
      functionName: "get_proposal",
      args: [id],
      transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
    }),
  );
const tests = [
  ["ineligible", "VOTING_BLOCKED:INELIGIBLE"],
  ["clarification", "VOTING_BLOCKED:NEEDS_CLARIFICATION"],
  ["eligible", "BALLOT_CLOSED"],
];
const evidence = {
  chain_id: 61997,
  address: report.address,
  checked_at: new Date().toISOString(),
  checks: [],
};
for (const [key, expected] of tests) {
  const id = report[key].proposal_id;
  const before = await read(id);
  let rejected = false,
    detail = "";
  try {
    // Keep the raw simulation error payload: the SDK currently drops its receipt on RPC errors.
    const data = abi.transactions.serialize([
      abi.calldata.encode(
        abi.calldata.makeCalldataObject("vote", [id, "YES"], undefined),
      ),
      false,
    ]);
    const response = await fetch(report.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sim_call",
        params: [
          {
            type: "write",
            to: report.address,
            from: report.transactions.find(
              (t) => t.action === "create_community",
            ).account,
            data,
            transaction_hash_variant: "latest-final",
          },
        ],
      }),
    });
    const result = await response.json();
    const receipt = result.error?.data?.receipt;
    detail = receipt?.result
      ? Buffer.from(receipt.result, "base64").subarray(1).toString("utf8")
      : JSON.stringify(result.error || result);
    rejected =
      receipt?.execution_result === "ERROR" &&
      detail === "[EXPECTED] " + expected;
  } catch (e) {
    detail = JSON.stringify(e, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    rejected = detail.includes(expected);
    if (!rejected) console.log(detail.slice(0, 4500));
  }
  assert.equal(
    rejected,
    true,
    `Expected ${expected}; received ${detail.slice(0, 900)}`,
  );
  const after = await read(id);
  assert.deepEqual(after, before, "Read-only simulation changed state");
  evidence.checks.push({
    case: key,
    expected,
    contract_rejected: true,
    state_unchanged: true,
    proposal_id: id,
  });
  console.log(`${key}: ${expected}; state unchanged`);
}
await writeFile(
  new URL("../deployments/negative-checks.json", import.meta.url),
  JSON.stringify(evidence, null, 2) + "\n",
);
