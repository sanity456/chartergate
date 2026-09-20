import { readFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { DEPLOYMENT } from "../lib/deployment.ts";
import { NETWORK } from "../lib/network.ts";
const source = new URL("../contracts/chartergate.py", import.meta.url);
const code = await readFile(source);
const report = JSON.parse(
  await readFile(
    new URL("../deployments/studio-next.json", import.meta.url),
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
