// Historical v1 audit. Run only while the active binding is v1.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { abi } from "genlayer-js";
import { reader, read, address } from "../lib/chain.ts";
import { DEPLOYMENT } from "../lib/deployment.ts";
import { NETWORK } from "../lib/network.ts";
import { plain, receiptStatus, executionSucceeded } from "../lib/protocol.ts";

const evidence = JSON.parse(
  await readFile(
    new URL("../deployments/browser-wallet-test.json", import.meta.url),
    "utf8",
  ),
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const report = {
  checked_at: new Date().toISOString(),
  read_only: true,
  new_transactions_broadcast: 0,
  chain_id: NETWORK.id,
  contract_address: address,
};
assert.equal(
  Number(await reader.request({ method: "eth_chainId" })),
  DEPLOYMENT.chainId,
);
const code = await reader.getContractCode(address);
const bytes =
  typeof code === "string"
    ? Buffer.from(
        code.replace(/^0x/, ""),
        code.startsWith("0x") ? "hex" : "utf8",
      )
    : Buffer.from(code);
assert.equal(hash(bytes), DEPLOYMENT.sourceSha256);
report.source_sha256 = hash(bytes);
report.source_matches = true;
const community = await read("get_community", [evidence.community.id]);
assert.equal(community.found, true);
for (const key of ["name", "owner", "rules", "voters", "quorum"])
  assert.deepEqual(community[key], evidence.community[key]);
report.community_matches = true;
report.proposals = [];
for (const key of [
  "eligible_proposal",
  "ineligible_proposal",
  "clarification_proposal",
  "revision_proposal",
]) {
  const expected = evidence[key];
  const actual = await read("get_proposal", [expected.id]);
  assert.equal(actual.found, true);
  assert.equal(actual.community_id, community.id);
  assert.equal(actual.body, expected.body);
  assert.equal(actual.review.verdict, expected.verdict);
  assert.deepEqual(
    actual.review.checks.map((row) => row.status),
    expected.rule_statuses,
  );
  assert.deepEqual(
    actual.ballot,
    expected.ballot_after_close || expected.ballot_after_screening,
  );
  const policy = await read("evaluate_eligibility_view", [
    community.id,
    actual.id,
  ]);
  assert.deepEqual(policy, expected.policy_result);
  if (key === "clarification_proposal") {
    report.original_record_sha256 = hash(JSON.stringify(canonical(actual)));
    assert.equal(
      report.original_record_sha256,
      expected.before_revision_record_sha256,
    );
  }
  if (key === "revision_proposal")
    assert.equal(actual.parent_id, evidence.clarification_proposal.id);
  const check = {
    case: key,
    id: actual.id,
    verdict: actual.review.verdict,
    policy,
    ballot: actual.ballot,
  };
  if (!policy.satisfied) {
    const data = abi.transactions.serialize([
      abi.calldata.encode(
        abi.calldata.makeCalldataObject("vote", [actual.id, "YES"], undefined),
      ),
      false,
    ]);
    const response = await fetch(NETWORK.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sim_call",
        params: [
          {
            type: "write",
            to: address,
            from: community.owner,
            data,
            transaction_hash_variant: "latest-final",
          },
        ],
      }),
    });
    assert.equal(response.ok, true);
    const receipt = (await response.json()).error?.data?.receipt;
    assert.equal(receipt?.execution_result, "ERROR");
    const rejection = Buffer.from(receipt.result, "base64")
      .subarray(1)
      .toString("utf8");
    assert.equal(rejection, `[EXPECTED] VOTING_BLOCKED:${expected.verdict}`);
    assert.deepEqual(await read("get_proposal", [actual.id]), actual);
    check.vote_simulation = {
      rejection,
      state_unchanged: true,
      transaction_broadcast: false,
    };
  }
  report.proposals.push(check);
}
report.transactions = [];
for (const tx of evidence.transactions) {
  const receipt = plain(await reader.getTransaction({ hash: tx.hash }));
  assert.equal(receiptStatus(receipt), "FINALIZED");
  assert.equal(executionSucceeded(receipt), true);
  report.transactions.push({
    action: tx.action,
    hash: tx.hash,
    status: "FINALIZED",
    execution_success: true,
  });
}
report.public_assets = [];
for (const [path, local] of [
  ["/contract/chartergate.py", "contracts/chartergate.py"],
  ["/contract/deployment.json", "deployments/studio-next.json"],
  ["/contract/negative-checks.json", "deployments/negative-checks.json"],
  [
    "/contract/browser-wallet-test.json",
    "deployments/browser-wallet-test.json",
  ],
  ["/favicon.svg", "public/favicon.svg"],
]) {
  const response = await fetch(new URL(path, evidence.website), {
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, path);
  const remote = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(
    remote,
    await readFile(new URL(`../${local}`, import.meta.url)),
    path,
  );
  report.public_assets.push({
    path,
    status: response.status,
    exact_local_match: true,
  });
}
const home = await fetch(evidence.website, {
  signal: AbortSignal.timeout(30000),
});
assert.equal(home.status, 200);
const html = await home.text();
assert.ok(html.includes("CharterGate") && html.includes("61997"));
report.public_website = {
  url: evidence.website,
  status: 200,
  expected_name_and_chain: true,
};
const repositoryResponse = await fetch(
  "https://api.github.com/repos/sanity456/chartergate",
  {
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(30000),
  },
);
assert.equal(repositoryResponse.status, 200);
const repository = await repositoryResponse.json();
assert.equal(repository.private, false);
const raw = await fetch(
  `https://raw.githubusercontent.com/sanity456/chartergate/${repository.default_branch}/contracts/chartergate.py`,
  { signal: AbortSignal.timeout(30000) },
);
assert.equal(raw.status, 200);
assert.equal(
  hash(Buffer.from(await raw.arrayBuffer())),
  DEPLOYMENT.sourceSha256,
);
report.github = {
  url: repository.html_url,
  public: true,
  contract_source_matches: true,
};
report.passed = true;
console.log(JSON.stringify(report, null, 2));
