import { test } from "node:test";
import assert from "node:assert/strict";
import {
  executionSucceeded,
  receiptStatus,
  validateCommunity,
  validateProposal,
  EXAMPLE_RULES,
  plain,
} from "../lib/protocol.ts";
import { connectWallet, ensureStudioNet, watchWallets } from "../lib/wallet.ts";
import { NETWORK } from "../lib/network.ts";
const wallet = "0x1111111111111111111111111111111111111111";
test("finalized is not execution success", () => {
  assert.equal(executionSucceeded({ status: "FINALIZED" }), false);
  assert.equal(
    executionSucceeded({ status: "FINALIZED", txExecutionResult: 2 }),
    false,
  );
  assert.equal(
    executionSucceeded({
      statusName: "FINALIZED",
      txExecutionResultName: "FINISHED_WITH_RETURN",
    }),
    true,
  );
  assert.equal(receiptStatus({ statusName: "FINALIZED" }), "FINALIZED");
});
test("leader failure cannot be hidden by a successful validator", () => {
  assert.equal(
    executionSucceeded({
      consensus_data: {
        leader_receipt: [
          { mode: "leader", execution_result: "ERROR" },
          { mode: "validator", execution_result: "SUCCESS" },
        ],
      },
    }),
    false,
  );
  assert.equal(
    executionSucceeded({
      consensus_data: {
        leader_receipt: [
          { mode: "leader", execution_result: "SUCCESS" },
          { mode: "validator", execution_result: "ERROR" },
        ],
      },
    }),
    true,
  );
});
test("calldata maps normalize recursively", () =>
  assert.deepEqual(plain(new Map([["items", [new Map([["count", 2n]])]]])), {
    items: [{ count: 2 }],
  }));
test("community validation rejects duplicates and bad quorum", () => {
  assert.doesNotThrow(() =>
    validateCommunity("Builders", EXAMPLE_RULES, [wallet], 1),
  );
  assert.throws(
    () => validateCommunity("Builders", EXAMPLE_RULES, [wallet, wallet], 1),
    /duplicate/,
  );
  assert.throws(
    () => validateCommunity("Builders", EXAMPLE_RULES, [wallet], 2),
    /Quorum/,
  );
  assert.throws(
    () => validateCommunity("Builders", ["Rule", "rule"], [wallet], 1),
    /duplicate/,
  );
  assert.throws(
    () =>
      validateCommunity("Builders", EXAMPLE_RULES, ["0x" + "0".repeat(40)], 1),
    /nonzero/,
  );
});
test("proposal character bounds are fail closed", () => {
  assert.throws(() => validateProposal("", "Body"));
  assert.throws(() => validateProposal("Title", " ".repeat(12)));
  assert.throws(() => validateProposal("Title", "x".repeat(5001)));
  assert.doesNotThrow(() => validateProposal("Title", "x".repeat(5000)));
});
test("connection validates EVM account format", async () => {
  assert.equal(await connectWallet({ request: async () => [wallet] }), wallet);
  await assert.rejects(
    connectWallet({ request: async () => ["not an EVM address"] }),
  );
});
test("unknown chain is added and verified on the selected provider", async () => {
  let chain = "0x1",
    added = false;
  const methods = [];
  const provider = {
    request: async ({ method, params }) => {
      methods.push(method);
      if (method === "eth_chainId") return chain;
      if (method === "wallet_switchEthereumChain") {
        if (!added) throw { code: 4902 };
        chain = params[0].chainId;
      }
      if (method === "wallet_addEthereumChain") {
        assert.equal(params[0].chainId, NETWORK.hex);
        assert.equal(params[0].rpcUrls[0], NETWORK.rpc);
        added = true;
      }
    },
  };
  await ensureStudioNet(provider);
  assert.equal(Number(chain), 61997);
  assert.ok(methods.includes("wallet_addEthereumChain"));
});
test("wallet refusal is not treated as successful switching", async () => {
  const provider = {
    request: async ({ method }) => {
      if (method === "eth_chainId") return "0x1";
      throw { code: 4001 };
    },
  };
  await assert.rejects(ensureStudioNet(provider));
});
test("wallet that ignores switching is rejected", async () => {
  await assert.rejects(
    ensureStudioNet({
      request: async ({ method }) => (method === "eth_chainId" ? "0x1" : null),
    }),
    /Switch your selected wallet/,
  );
});
test("wallet discovery supports EIP6963 plus legacy without duplicate provider entries", () => {
  const provider = { request: async () => [wallet] };
  const scope = new EventTarget();
  scope.ethereum = provider;
  let options = [];
  const watcher = watchWallets((v) => (options = v), scope);
  assert.equal(options.length, 1);
  scope.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: { info: { name: "Wallet", uuid: "one" }, provider },
    }),
  );
  assert.equal(options.length, 1);
  watcher.stop();
});
