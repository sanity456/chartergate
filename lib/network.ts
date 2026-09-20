import { studioDevnet } from "genlayer-js/chains";

// Use the complete v0.6 preset: replacing only stable Studio's RPC is unsafe.
export const ACTIVE_CHAIN = studioDevnet;
export const NETWORK = {
  id: ACTIVE_CHAIN.id,
  hex: `0x${ACTIVE_CHAIN.id.toString(16)}`,
  name: "GenLayer Studio Next",
  rpc: ACTIVE_CHAIN.rpcUrls.default.http[0],
  explorer: "https://explorer-studio-dev.genlayer.com",
  studio: "https://studio-dev.genlayer.com",
} as const;

export const WALLET_NETWORK = {
  chainId: NETWORK.hex,
  chainName: NETWORK.name,
  nativeCurrency: ACTIVE_CHAIN.nativeCurrency,
  rpcUrls: [NETWORK.rpc],
  blockExplorerUrls: [NETWORK.explorer],
};

export function pendingStorageKey(address: string) {
  return `chartergate:pending:${NETWORK.id}:${address}`;
}
