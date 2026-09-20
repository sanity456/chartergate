import { createClient } from "genlayer-js";
import {
  TransactionHashVariant,
  type TransactionHash,
} from "genlayer-js/types";
import { formatUnits } from "viem";
import { ACTIVE_CHAIN, NETWORK } from "./network.ts";
import { DEPLOYMENT } from "./deployment.ts";
import { plain, executionSucceeded, receiptStatus } from "./protocol.ts";
import { assertWalletContext, type Provider } from "./wallet.ts";
import { preflightSubmission } from "./submission-preflight.ts";
import { estimateStudioWriteFees } from "./studio-fees.ts";
export const reader = createClient({ chain: ACTIVE_CHAIN });
export const address = DEPLOYMENT.address as `0x${string}`;
export const configured =
  DEPLOYMENT.chainId === NETWORK.id && /^0x[0-9a-fA-F]{40}$/.test(address);
export async function read<T>(
  functionName: string,
  args: (string | number)[] = [],
): Promise<T> {
  if (!configured)
    throw Error(
      "Live deployment is being verified. No on-chain actions are available yet.",
    );
  return plain(
    await reader.readContract({
      address,
      functionName,
      args,
      transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
    }),
  ) as T;
}
export async function submit(
  account: `0x${string}`,
  provider: Provider,
  functionName: string,
  args: (string | number)[],
  onQuote: (s: string) => void,
  signal?: AbortSignal,
) {
  if (!configured) throw Error("Live contract is not configured.");
  if (Number(await reader.request({ method: "eth_chainId" })) !== NETWORK.id)
    throw Error("RPC chain mismatch. Nothing was submitted.");
  await assertWalletContext(provider, account);
  const client = createClient({
    chain: ACTIVE_CHAIN,
    account,
    provider: provider as NonNullable<
      NonNullable<Parameters<typeof createClient>[0]>["provider"]
    >,
  });
  const request = { address, functionName, args, value: 0n, leaderOnly: false };
  onQuote(
    "Simulating this action and estimating the Studio Next protocol fee…",
  );
  const quote = await estimateStudioWriteFees(client, account, request);
  if (quote.feeValue > 1000000000000000000n)
    throw Error("Quote exceeds 1 test GEN. Nothing was submitted.");
  onQuote("Checking your available test GEN on Studio Next (61997)…");
  await preflightSubmission({
    provider,
    account,
    feeValue: quote.feeValue,
    signal,
    readPendingBalance: () =>
      reader.request({
        method: "eth_getBalance",
        params: [account, "pending"],
      }),
  });
  onQuote(
    `Review in your wallet: ${functionName.replaceAll("_", " ")} on Studio Next (61997). Protocol fee deposit ${formatUnits(quote.feeValue, 18)} test GEN. No treasury transfer.`,
  );
  return client.writeContract({
    ...request,
    fees: {
      distribution: quote.distribution,
      feeValue: quote.feeValue,
      messageAllocations: quote.messageAllocations,
    },
  });
}
export class ExecutionError extends Error {}
export async function waitFinal(
  hash: `0x${string}`,
  onStatus: (s: string) => void,
  signal: AbortSignal,
) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw Error("Invalid transaction hash.");
  let failures = 0;
  for (let i = 0; i < 100; i++) {
    if (signal.aborted)
      throw Error("Tracking paused. Resume the existing transaction.");
    try {
      const r = await reader.getTransaction({ hash: hash as TransactionHash });
      const status = receiptStatus(r);
      onStatus(status);
      failures = 0;
      if (status === "FINALIZED") {
        if (!executionSucceeded(r))
          throw new ExecutionError(
            "Finalized with a contract execution error. The action did not take effect.",
          );
        return r;
      }
      if (["CANCELED", "UNDETERMINED"].includes(status))
        throw new ExecutionError(
          `Transaction ${status.toLowerCase()}. The action did not take effect.`,
        );
    } catch (e) {
      if (e instanceof ExecutionError || ++failures > 3) throw e;
    }
    await new Promise((r) => setTimeout(r, 6000));
  }
  throw Error(
    "Still pending. Resume tracking this transaction; do not submit it again.",
  );
}
