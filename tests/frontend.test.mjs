import { test } from "node:test";
import assert from "node:assert/strict";
import {
  executionSucceeded,
  receiptStatus,
  validateCommunity,
  validateProposal,
  EXAMPLE_RULES,
  plain,
  validateVotingWindow,
  ballotWindow,
} from "../lib/protocol.ts";
import {
  connectWallet,
  connectStudioWallet,
  ensureStudioNet,
  watchWallets,
  watchWalletContext,
  assertWalletContext,
} from "../lib/wallet.ts";
import {
  assertProtocolBalance,
  InsufficientTestBalanceError,
  preflightSubmission,
} from "../lib/submission-preflight.ts";
import { NETWORK } from "../lib/network.ts";
import { parseChainTime, estimateStudioWriteFees } from "../lib/studio-fees.ts";
import { createFeesDistribution } from "genlayer-js";
const wallet = "0x1111111111111111111111111111111111111111";

test("simulation time accepts only a valid RPC timestamp", () => {
  assert.equal(
    parseChainTime({ timestamp: "0x6ab0470a" }),
    "2026-09-20T20:50:18.000Z",
  );
  for (const block of [
    null,
    {},
    { timestamp: 1789937418 },
    { timestamp: "0x0" },
    { timestamp: "2026-09-20" },
    { timestamp: "0xffffffffffffffffffff" },
  ])
    assert.throws(() => parseChainTime(block));
});

function feeClient(patch = {}) {
  const calls = [];
  const distribution = createFeesDistribution({});
  const client = {
    estimateTransactionFees: async () => ({
      distribution,
      feeValue: 100000000000010352n,
    }),
    request: async (request) => {
      calls.push(request);
      if (request.method === "eth_chainId") return patch.chain ?? "0xf22d";
      if (request.method === "eth_getBlockByNumber")
        return patch.block ?? { timestamp: "0x6ab0470a" };
      assert.equal(
        request.method,
        "sim_estimateTransactionFees",
        "Never sign or broadcast during estimation",
      );
      if (patch.error) throw patch.error;
      return (
        patch.result ?? {
          receipt: { execution_result: "SUCCESS" },
          recommendedPreset: {
            distribution,
            feeValue: "100000000000010352",
            messageAllocations: [],
          },
        }
      );
    },
  };
  return { client, calls };
}

test("time-gated fee simulation uses RPC time and exact bigint, not browser time", async () => {
  const { client, calls } = feeClient();
  const quote = await estimateStudioWriteFees(client, wallet, {
    address: wallet,
    functionName: "appeal_proposal",
    args: ["proposal"],
  });
  assert.equal(quote.feeValue, 100000000000010352n);
  const simulation = calls.find(
    (c) => c.method === "sim_estimateTransactionFees",
  ).params[0];
  assert.deepEqual(simulation.sim_config, {
    genvm_datetime: "2026-09-20T20:50:18.000Z",
  });
  assert.equal(simulation.fees.feeValue, "100000000000010352");
  assert.equal(simulation.from, wallet);
  assert.equal(simulation.transaction_hash_variant, "latest-final");
});

test("wrong chain and missing RPC time block fee simulation", async () => {
  for (const patch of [{ chain: "0xf22f" }, { block: {} }]) {
    const { client, calls } = feeClient(patch);
    await assert.rejects(
      estimateStudioWriteFees(client, wallet, {
        address: wallet,
        functionName: "vote",
        args: ["id", "YES"],
      }),
    );
    assert.ok(!calls.some((c) => c.method === "sim_estimateTransactionFees"));
  }
});

test("failed fee simulation never falls back to bypass contract checks", async () => {
  const error = Error("[EXPECTED] APPEAL_COOLDOWN");
  const { client } = feeClient({ error });
  await assert.rejects(
    estimateStudioWriteFees(client, wallet, {
      address: wallet,
      functionName: "appeal_proposal",
      args: ["id"],
    }),
    error,
  );
});

test("malformed, failed and imprecise fee results fail closed", async () => {
  for (const result of [
    {},
    { receipt: { execution_result: "ERROR" } },
    {
      receipt: { execution_result: "SUCCESS" },
      recommendedPreset: {
        distribution: {},
        feeValue: Number.MAX_SAFE_INTEGER + 1,
      },
    },
    {
      receipt: { execution_result: "SUCCESS" },
      recommendedPreset: { distribution: {}, feeValue: "-1" },
    },
  ]) {
    const { client } = feeClient({ result });
    await assert.rejects(
      estimateStudioWriteFees(client, wallet, {
        address: wallet,
        functionName: "close_ballot",
        args: ["id"],
      }),
    );
  }
});
test("v2 voting windows enforce integer duration bounds", () => {
  assert.equal(validateVotingWindow(5), 300);
  assert.equal(validateVotingWindow(1440), 86400);
  assert.equal(validateVotingWindow(10080), 604800);
  for (const minutes of [0, 4, 5.5, 10081, NaN, Infinity])
    assert.throws(() => validateVotingWindow(minutes));
});
test("v2 ballot hints respect exact deadline and unknown browser time", () => {
  assert.deepEqual(ballotWindow(300, 0), {
    timed: true,
    ended: false,
    ready: false,
  });
  assert.equal(ballotWindow(300, 299).ended, false);
  assert.equal(ballotWindow(300, 300).ended, true);
  assert.equal(ballotWindow(300, 301).ended, true);
  assert.deepEqual(ballotWindow(undefined, 0), {
    timed: false,
    ended: false,
    ready: true,
  });
});
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

function fakeSession() {
  const listeners = new Map();
  return {
    chain: NETWORK.hex,
    accounts: [wallet],
    calls: [],
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    emit(event, value) {
      for (const listener of listeners.get(event) || []) listener(value);
    },
    listenerCount() {
      return [...listeners.values()].reduce((n, s) => n + s.size, 0);
    },
    async request({ method, params }) {
      this.calls.push(method);
      if (method === "eth_requestAccounts" || method === "eth_accounts")
        return this.accounts;
      if (method === "eth_chainId") return this.chain;
      if (method === "wallet_switchEthereumChain") {
        this.chain = params[0].chainId;
        this.emit("chainChanged", this.chain);
        return null;
      }
      throw Error(`Unexpected request: ${method}`);
    },
  };
}

test("late successful network-switch and identical account events do not disconnect", async () => {
  const provider = fakeSession();
  provider.chain = "0x1";
  const connected = await connectStudioWallet(provider);
  const changes = [];
  const stop = watchWalletContext(provider, connected, (reason) =>
    changes.push(reason),
  );
  provider.emit("chainChanged", NETWORK.hex);
  provider.emit("chainChanged", NETWORK.hex.toUpperCase());
  provider.emit("accountsChanged", [wallet]);
  assert.deepEqual(changes, []);
  stop();
  assert.equal(provider.listenerCount(), 0);
});

test("checksum-only account changes do not disconnect", () => {
  const provider = fakeSession();
  const address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const changes = [];
  const stop = watchWalletContext(provider, address, (reason) =>
    changes.push(reason),
  );
  provider.emit("accountsChanged", ["0x" + address.slice(2).toUpperCase()]);
  assert.deepEqual(changes, []);
  stop();
});

for (const [event, value, reason] of [
  ["chainChanged", "0xf22f", /network changed/],
  [
    "accountsChanged",
    ["0x2222222222222222222222222222222222222222"],
    /account changed/,
  ],
  ["accountsChanged", [], /disconnected/],
  ["accountsChanged", null, /disconnected/],
  ["disconnect", { code: 4900 }, /connection was lost/],
]) {
  test(`real context change is invalidated once: ${event} ${JSON.stringify(value)}`, () => {
    const provider = fakeSession();
    const changes = [];
    const stop = watchWalletContext(provider, wallet, (message) =>
      changes.push(message),
    );
    provider.emit(event, value);
    provider.emit(event, value);
    assert.equal(changes.length, 1);
    assert.match(changes[0], reason);
    stop();
    assert.equal(provider.listenerCount(), 0);
  });
}

test("context watcher cleanup suppresses old provider events", () => {
  const provider = fakeSession();
  const stop = watchWalletContext(provider, wallet, () =>
    assert.fail("stale listener"),
  );
  stop();
  provider.emit("disconnect", {});
  provider.emit("accountsChanged", []);
});

test("connection rechecks the account after switching networks", async () => {
  const provider = fakeSession();
  provider.chain = "0x1";
  provider.on("chainChanged", () => {
    provider.accounts = [];
  });
  await assert.rejects(connectStudioWallet(provider), /account changed/);
});

test("context validation refuses wrong networks without auto-switching", async () => {
  const provider = fakeSession();
  provider.chain = "0xf22f";
  await assert.rejects(
    assertWalletContext(provider, wallet),
    /network changed/,
  );
  assert.equal(provider.calls.includes("wallet_switchEthereumChain"), false);
});

test("protocol deposit uses bigint precision and accepts exact funds", () => {
  const fee = 391568400010352n;
  assert.doesNotThrow(() =>
    assertProtocolBalance("0x" + fee.toString(16), fee),
  );
  assert.doesNotThrow(() =>
    assertProtocolBalance("0x" + (10n ** 30n).toString(16), fee),
  );
  assert.throws(
    () => assertProtocolBalance("0x" + (fee - 1n).toString(16), fee),
    InsufficientTestBalanceError,
  );
});

test("insufficient-balance error names the active chain, shortfall and free faucet", () => {
  assert.throws(
    () => assertProtocolBalance("0x0", 391568400010352n),
    (error) => {
      assert(error instanceof InsufficientTestBalanceError);
      assert.match(error.message, /61997/);
      assert.match(error.message, /61999/);
      assert.match(error.message, /0.000391568400010352/);
      assert.match(error.message, /free Studio Next faucet/);
      assert.match(error.message, /Nothing was submitted/);
      return true;
    },
  );
});

test("missing or malformed balances and invalid quotes fail closed", () => {
  for (const value of [null, undefined, 1, "", "0x", "0xxyz", "10", -1])
    assert.throws(() => assertProtocolBalance(value, 1n), /Could not verify/);
  assert.throws(() => assertProtocolBalance("0x1", -1n), /Invalid quote/);
  assert.throws(
    () => assertProtocolBalance("0x1", 1000000000000000001n),
    /exceeds/,
  );
});

test("funded preflight reads pending balance and never signs", async () => {
  const provider = fakeSession();
  let balanceReads = 0;
  await preflightSubmission({
    provider,
    account: wallet,
    feeValue: 2n,
    readPendingBalance: async () => {
      balanceReads++;
      return "0x2";
    },
  });
  assert.equal(balanceReads, 1);
  assert.deepEqual(
    provider.calls.sort(),
    ["eth_accounts", "eth_accounts", "eth_chainId", "eth_chainId"].sort(),
  );
});

test("insufficient balance blocks the submission path", async () => {
  let writerCalled = false;
  await assert.rejects(async () => {
    await preflightSubmission({
      provider: fakeSession(),
      account: wallet,
      feeValue: 2n,
      readPendingBalance: async () => "0x1",
    });
    writerCalled = true;
  }, InsufficientTestBalanceError);
  assert.equal(writerCalled, false);
});

test("an unavailable balance cannot advance to signing", async () => {
  await assert.rejects(
    preflightSubmission({
      provider: fakeSession(),
      account: wallet,
      feeValue: 2n,
      readPendingBalance: async () => {
        throw Error("RPC unavailable");
      },
    }),
    /RPC unavailable/,
  );
});

test("account/network changes during balance reading stop signing", async () => {
  for (const change of [
    (p) => {
      p.accounts = [];
    },
    (p) => {
      p.chain = "0x1";
    },
  ]) {
    const provider = fakeSession();
    await assert.rejects(
      preflightSubmission({
        provider,
        account: wallet,
        feeValue: 2n,
        readPendingBalance: async () => {
          change(provider);
          return "0x10";
        },
      }),
      /changed/,
    );
  }
});

test("invalidated sessions cannot resume preparation after reconnecting", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    preflightSubmission({
      provider: fakeSession(),
      account: wallet,
      feeValue: 2n,
      signal: controller.signal,
      readPendingBalance: async () => assert.fail("must not read"),
    }),
    /connection changed/,
  );
});

test("session invalidation while fetching a balance stops signing", async () => {
  const controller = new AbortController();
  await assert.rejects(
    preflightSubmission({
      provider: fakeSession(),
      account: wallet,
      feeValue: 2n,
      signal: controller.signal,
      readPendingBalance: async () => {
        controller.abort();
        return "0x10";
      },
    }),
    /connection changed/,
  );
});
