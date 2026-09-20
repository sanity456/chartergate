import { formatUnits } from "viem";
import { assertWalletContext, type Provider } from "./wallet.ts";

export class InsufficientTestBalanceError extends Error {
  constructor(balance: bigint, required: bigint) {
    super(
      `Not enough test GEN on Studio Next (61997). Available: ${formatUnits(balance, 18)} GEN; protocol deposit required: ${formatUnits(required, 18)} GEN; shortfall: ${formatUnits(required - balance, 18)} GEN. Stable Studio (61999) funds cannot pay this fee. Use the free Studio Next faucet for this same wallet. Nothing was submitted.`,
    );
    this.name = "InsufficientTestBalanceError";
  }
}

export function assertProtocolBalance(rawBalance: unknown, feeValue: bigint) {
  if (feeValue < 0n || feeValue > 1000000000000000000n)
    throw Error(
      "Invalid quote or quote exceeds 1 test GEN. Nothing was submitted.",
    );
  if (typeof rawBalance !== "string" || !/^0x[0-9a-f]+$/i.test(rawBalance))
    throw Error(
      "Could not verify your Studio Next balance. Retry before signing. Nothing was submitted.",
    );
  const balance = BigInt(rawBalance);
  if (balance < feeValue)
    throw new InsufficientTestBalanceError(balance, feeValue);
}

// Kept separate from the SDK writer so failure paths can be tested without signing.
export async function preflightSubmission({
  provider,
  account,
  feeValue,
  readPendingBalance,
  signal,
}: {
  provider: Provider;
  account: string;
  feeValue: bigint;
  readPendingBalance: () => Promise<unknown>;
  signal?: AbortSignal;
}) {
  const active = () => {
    if (signal?.aborted)
      throw Error(
        "Wallet connection changed while preparing the request. Reconnect and try again. Nothing was submitted.",
      );
  };
  active();
  await assertWalletContext(provider, account);
  const balance = await readPendingBalance();
  active();
  assertProtocolBalance(balance, feeValue);
  await assertWalletContext(provider, account);
  active();
}
