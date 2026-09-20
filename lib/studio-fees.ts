import {
  abi,
  createClient,
  createFeesDistribution,
  normalizeMessageFeeAllocations,
} from "genlayer-js";
type Client = ReturnType<typeof createClient>;
type Request = {
  address: `0x${string}`;
  functionName: string;
  args: (string | number)[];
};

export function parseChainTime(block: unknown): string {
  const timestamp = (block as { timestamp?: unknown } | null)?.timestamp;
  if (typeof timestamp !== "string" || !/^0x[0-9a-f]+$/i.test(timestamp))
    throw Error("Studio Next did not provide a valid chain timestamp.");
  const seconds = Number(BigInt(timestamp));
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 8640000000000)
    throw Error("Studio Next chain timestamp is out of range.");
  return new Date(seconds * 1000).toISOString();
}

export async function simulationTime(client: Client): Promise<string> {
  if (Number(await client.request({ method: "eth_chainId" })) !== 61997)
    throw Error("Studio Next chain mismatch.");
  return parseChainTime(
    await client.request({
      method: "eth_getBlockByNumber",
      params: ["latest", false],
    }),
  );
}

// Studio's simulated writes omit transaction_created_at unless sim_config is
// supplied. Anchor *simulation only* to the RPC's latest timestamp; never send
// a time override in a signed write. Actual transaction time remains authoritative.
export async function estimateStudioWriteFees(
  client: Client,
  account: string,
  request: Request,
) {
  const baseline = await client.estimateTransactionFees();
  const datetime = await simulationTime(client);
  const data = abi.transactions.serialize([
    abi.calldata.encode(
      abi.calldata.makeCalldataObject(
        request.functionName,
        request.args,
        undefined,
      ),
    ),
    false,
  ]);
  const fees = JSON.parse(
    JSON.stringify(
      {
        distribution: baseline.distribution,
        feeValue: baseline.feeValue,
        messageAllocations: baseline.messageAllocations,
      },
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
    ),
  );
  const result = (await client.request({
    method: "sim_estimateTransactionFees",
    params: [
      {
        type: "write",
        to: request.address,
        from: account,
        data,
        transaction_hash_variant: "latest-final",
        fees,
        sim_config: { genvm_datetime: datetime },
      },
    ],
  })) as {
    receipt?: { execution_result?: string };
    recommendedPreset?: {
      distribution?: Parameters<typeof createFeesDistribution>[0];
      feeValue?: string | number;
      messageAllocations?: Parameters<typeof normalizeMessageFeeAllocations>[0];
    };
  };
  const preset = result.recommendedPreset;
  if (
    result.receipt?.execution_result !== "SUCCESS" ||
    !preset?.distribution ||
    !(
      (typeof preset.feeValue === "string" && /^\d+$/.test(preset.feeValue)) ||
      (typeof preset.feeValue === "number" &&
        Number.isSafeInteger(preset.feeValue) &&
        preset.feeValue >= 0)
    )
  )
    throw Error(
      "Studio Next returned an invalid or unsuccessful fee simulation.",
    );
  return {
    distribution: createFeesDistribution(preset.distribution),
    feeValue: BigInt(preset.feeValue),
    messageAllocations: preset.messageAllocations
      ? normalizeMessageFeeAllocations(preset.messageAllocations)
      : undefined,
    simulation_datetime: datetime,
  };
}
