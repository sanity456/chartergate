import { NETWORK, WALLET_NETWORK } from "./network.ts";

export type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (value: unknown) => void): void;
  removeListener?(event: string, listener: (value: unknown) => void): void;
  isMetaMask?: boolean;
  isPhantom?: boolean;
  isOkxWallet?: boolean;
  providers?: Provider[];
};
export type WalletOption = { id: string; name: string; provider: Provider };
export const CHAIN_ID = NETWORK.id;
export const CHAIN_HEX = NETWORK.hex;

export function walletName(provider: Provider) {
  if (provider.isPhantom) return "Phantom";
  if (provider.isOkxWallet) return "OKX Wallet";
  if (provider.isMetaMask) return "MetaMask";
  return "Browser wallet";
}
export function watchWallets(
  update: (options: WalletOption[]) => void,
  scope: Window = window,
) {
  const options: WalletOption[] = [];
  let sequence = 0;
  const add = (provider: Provider, name: string, id?: string) => {
    if (
      !provider ||
      typeof provider.request !== "function" ||
      options.some((x) => x.provider === provider)
    )
      return;
    options.push({
      provider,
      name: name.slice(0, 60),
      id: id || `injected-${++sequence}`,
    });
    update([...options]);
  };
  const announce = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail?.provider && typeof detail?.info?.name === "string")
      add(detail.provider, detail.info.name, detail.info.uuid);
  };
  const refresh = () => {
    scope.dispatchEvent(new Event("eip6963:requestProvider"));
    const w = scope as Window & {
      ethereum?: Provider;
      phantom?: { ethereum?: Provider };
      okxwallet?: Provider;
    };
    if (w.phantom?.ethereum) add(w.phantom.ethereum, "Phantom");
    if (w.okxwallet) add(w.okxwallet, "OKX Wallet");
    for (const p of w.ethereum?.providers || []) add(p, walletName(p));
    if (w.ethereum) add(w.ethereum, walletName(w.ethereum));
  };
  scope.addEventListener("eip6963:announceProvider", announce);
  scope.addEventListener("ethereum#initialized", refresh);
  refresh();
  return {
    refresh,
    stop: () => {
      scope.removeEventListener("eip6963:announceProvider", announce);
      scope.removeEventListener("ethereum#initialized", refresh);
    },
  };
}

export async function connectWallet(
  provider: Provider,
): Promise<`0x${string}`> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (
    !Array.isArray(accounts) ||
    !/^0x[0-9a-fA-F]{40}$/.test(accounts[0] || "")
  )
    throw new Error(
      "This wallet did not return an Ethereum-compatible account.",
    );
  return accounts[0];
}

export async function ensureStudioNet(provider: Provider) {
  const current = await provider.request({ method: "eth_chainId" });
  if (Number(current) === CHAIN_ID) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX }],
    });
  } catch (error) {
    const e = error as {
      code?: number;
      data?: { originalError?: { code?: number } };
    };
    if (e.code !== 4902 && e.data?.originalError?.code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          ...WALLET_NETWORK,
        },
      ],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX }],
    });
  }
  if (Number(await provider.request({ method: "eth_chainId" })) !== CHAIN_ID)
    throw new Error(
      "Switch your selected wallet to GenLayer Studio Next (61997). Some wallets do not support custom networks.",
    );
}

// Never silently change a wallet's identity after a fee quote or confirmation.
export async function assertWalletContext(provider: Provider, account: string) {
  const [accounts, chain] = await Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" }),
  ]);
  if (Number(chain) !== CHAIN_ID)
    throw Error(
      "Wallet network changed. Reconnect to Studio Next (61997). Nothing was submitted.",
    );
  if (
    !Array.isArray(accounts) ||
    typeof accounts[0] !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(accounts[0]) ||
    accounts[0].toLowerCase() !== account.toLowerCase()
  )
    throw Error(
      "Wallet account changed or disconnected. Reconnect before submitting. Nothing was submitted.",
    );
}

export async function connectStudioWallet(provider: Provider) {
  const account = await connectWallet(provider);
  await ensureStudioNet(provider);
  await assertWalletContext(provider, account);
  return account;
}

export function watchWalletContext(
  provider: Provider,
  account: string,
  onChange: (reason: string) => void,
) {
  let stopped = false;
  const invalidate = (reason: string) => {
    if (stopped) return;
    stopped = true;
    onChange(reason);
  };
  const accountsChanged = (value: unknown) => {
    if (
      Array.isArray(value) &&
      typeof value[0] === "string" &&
      value[0].toLowerCase() === account.toLowerCase()
    )
      return;
    invalidate(
      "Wallet account changed or disconnected. Reconnect the wallet you want to use.",
    );
  };
  const chainChanged = (value: unknown) => {
    if (
      (typeof value === "string" || typeof value === "number") &&
      Number(value) === CHAIN_ID
    )
      return;
    invalidate(
      "Wallet network changed. Reconnect to Studio Next (61997). Balances on stable Studio (61999) are separate.",
    );
  };
  const disconnected = () =>
    invalidate(
      "Wallet connection was lost. Unlock your wallet and reconnect. If it still does not respond, reload this page; any submitted transaction can be resumed.",
    );
  provider.on?.("accountsChanged", accountsChanged);
  provider.on?.("chainChanged", chainChanged);
  provider.on?.("disconnect", disconnected);
  return () => {
    stopped = true;
    provider.removeListener?.("accountsChanged", accountsChanged);
    provider.removeListener?.("chainChanged", chainChanged);
    provider.removeListener?.("disconnect", disconnected);
  };
}
