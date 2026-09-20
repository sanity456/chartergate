import { readFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { DEPLOYMENT } from "../lib/deployment.ts";
import { NETWORK } from "../lib/network.ts";
const v2 = DEPLOYMENT.policy === "chartergate/rules-v2";
const sourceName = v2 ? "chartergate_v2.py" : "chartergate.py";
const reportName = v2 ? "studio-next-v2.json" : "studio-next.json";
const source = new URL("../contracts/" + sourceName, import.meta.url);
const code = await readFile(source);
const report = JSON.parse(
  await readFile(
    new URL("../deployments/" + reportName, import.meta.url),
    "utf8",
  ),
);
assert.equal(DEPLOYMENT.address, report.address);
assert.equal(DEPLOYMENT.chainId, NETWORK.id);
assert.equal(DEPLOYMENT.deploymentTx, report.deployment_tx);
assert.equal(
  DEPLOYMENT.sourceSha256,
  createHash("sha256").update(code).digest("hex"),
);
assert.equal(DEPLOYMENT.sourceSha256, report.source_sha256);
assert.equal(report.source_exact, true);
assert.equal(
  report.live_workflow_passed,
  true,
  "Live workflow evidence is required for a release.",
);
const dest = new URL("../public/contract/", import.meta.url);
if (v2) {
  assert.equal(report.policy, DEPLOYMENT.policy);
  assert.equal(report.live_adversarial_passed, true);
  assert.equal(report.pending, undefined);
  assert.ok(report.transactions.length >= 12);
  assert.ok(
    report.transactions.every(
      (t) => t.status === "FINALIZED" && t.execution_success,
    ),
  );
  const negative = JSON.parse(
    await readFile(
      new URL("../deployments/negative-checks-v2.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(negative.address, DEPLOYMENT.address);
  assert.equal(negative.source_sha256, DEPLOYMENT.sourceSha256);
  assert.equal(negative.passed, true);
  assert.ok(negative.checks.length >= 9);
  await mkdir(dest, { recursive: true });
  await copyFile(source, new URL(sourceName, dest));
  await copyFile(
    new URL("../deployments/" + reportName, import.meta.url),
    new URL("deployment-v2.json", dest),
  );
  await copyFile(
    new URL("../deployments/negative-checks-v2.json", import.meta.url),
    new URL("negative-checks-v2.json", dest),
  );
  console.log(
    "V2 exact source, active binding, live adversarial/workflow and negative evidence verified. V1 evidence retained as history.",
  );
  process.exit(0);
}
await mkdir(dest, { recursive: true });
await copyFile(source, new URL("chartergate.py", dest));
await copyFile(
  new URL("../deployments/studio-next.json", import.meta.url),
  new URL("deployment.json", dest),
);
await copyFile(
  new URL("../deployments/negative-checks.json", import.meta.url),
  new URL("negative-checks.json", dest),
);
const walletEvidence = new URL(
  "../deployments/browser-wallet-test.json",
  import.meta.url,
);
const walletReport = JSON.parse(await readFile(walletEvidence, "utf8"));
assert.equal(walletReport.contract_address, DEPLOYMENT.address);
assert.equal(walletReport.chain_id, NETWORK.id);
assert.equal(
  walletReport.complete,
  true,
  "Scoped browser-wallet flow evidence is required.",
);
assert.ok(
  walletReport.transactions.every(
    (tx) => tx.status === "FINALIZED" && tx.execution_success,
  ),
);
await copyFile(walletEvidence, new URL("browser-wallet-test.json", dest));
console.log(
  "Release bindings and exact source verified. Public source/evidence exported.",
);
