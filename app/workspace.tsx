"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  FileText,
  Landmark,
  Plus,
  RefreshCw,
  ShieldCheck,
  Vote,
  Wallet,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  read,
  submit,
  waitFinal,
  ExecutionError,
  configured,
  address,
} from "@/lib/chain";
import { NETWORK, pendingStorageKey } from "@/lib/network";
import { DEPLOYMENT } from "@/lib/deployment";
import {
  watchWallets,
  connectStudioWallet,
  assertWalletContext,
  watchWalletContext,
  type WalletOption,
} from "@/lib/wallet";
import { InsufficientTestBalanceError } from "@/lib/submission-preflight";
import {
  LABELS,
  EXAMPLES,
  EXAMPLE_RULES,
  safeError,
  shortAddress,
  validateCommunity,
  validateProposal,
  type Community,
  type Proposal,
  type Page,
  type Pending,
} from "@/lib/protocol";

type Action = {
  title: string;
  description: string;
  method: string;
  args: (string | number)[];
  communityId: string;
};
type ModelTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (v: unknown) => unknown | Promise<unknown>;
};
const emptyPage = { items: [], total: 0, next_offset: 0 };
const chainLink = `${NETWORK.explorer}/address/${address}`;

export default function Workspace() {
  const [communities, setCommunities] = useState<Page<Community>>(emptyPage),
    [selectedId, setSelectedId] = useState("");
  const [proposals, setProposals] = useState<Page<Proposal>>(emptyPage),
    [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [tab, setTab] = useState("proposals"),
    [loading, setLoading] = useState(configured),
    [error, setError] = useState(""),
    [fundingHelp, setFundingHelp] = useState(false),
    [notice, setNotice] = useState("");
  const [wallets, setWallets] = useState<WalletOption[]>([]),
    [walletOpen, setWalletOpen] = useState(false),
    [selectedWallet, setSelectedWallet] = useState<WalletOption | null>(null),
    [account, setAccount] = useState<`0x${string}` | null>(null);
  const [communityOpen, setCommunityOpen] = useState(false),
    [draftOpen, setDraftOpen] = useState(false),
    [name, setName] = useState(""),
    [rulesText, setRulesText] = useState(EXAMPLE_RULES.join("\n")),
    [votersText, setVotersText] = useState(""),
    [quorum, setQuorum] = useState("1");
  const [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [parentId, setParentId] = useState(""),
    [voteRecord, setVoteRecord] = useState({ key: "", choice: "" });
  const [action, setAction] = useState<Action | null>(null),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Pending | null>(null),
    [txStatus, setTxStatus] = useState("");
  const lock = useRef(false),
    abort = useRef<AbortController | null>(null),
    walletSession = useRef<AbortController | null>(null),
    walletRefresh = useRef<() => void>(() => {}),
    selectionEpoch = useRef(0);
  const community = communities.items.find((c) => c.id === selectedId);
  const canWrite = configured && !!account && !busy && !pending;
  const voteKey = (selectedProposal?.id || "") + ":" + (account || "");
  const voteChoice = voteRecord.key === voteKey ? voteRecord.choice : "";

  const loadCommunities = useCallback(async () => {
    if (!configured) return;
    try {
      const page = await read<Page<Community>>("list_communities", [0, 20]);
      setCommunities(page);
      setError("");
      setSelectedId((old) => old || page.items[0]?.id || "");
    } catch (e) {
      setError("Could not load the live community records. " + safeError(e));
    } finally {
      setLoading(false);
    }
  }, []);
  const loadProposals = useCallback(async (id: string) => {
    if (!id) return;
    const epoch = ++selectionEpoch.current;
    const page = await read<Page<Proposal>>("list_proposals", [id, 0, 20]);
    if (epoch !== selectionEpoch.current) return;
    setProposals(page);
    setSelectedProposal((old) =>
      old?.community_id === id
        ? page.items.find((p) => p.id === old.id) || old
        : null,
    );
  }, []);
  // Subscribe to the RPC-backed resource on mount; all setters follow the awaited read.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCommunities();
  }, [loadCommunities]);
  useEffect(() => {
    if (selectedId)
      void loadProposals(selectedId).catch((e) => setError(safeError(e)));
  }, [selectedId, loadProposals]);
  useEffect(() => {
    const watcher = watchWallets(setWallets);
    walletRefresh.current = watcher.refresh;
    return watcher.stop;
  }, []);
  useEffect(() => {
    const p = selectedWallet?.provider;
    if (!p || !account) return;
    let active = true;
    const changed = (reason: string) => {
      if (!active) return;
      walletSession.current?.abort();
      setAccount(null);
      setAction(null);
      setNotice(reason);
    };
    const stop = watchWalletContext(p, account, changed);
    // Catch a genuine change between connection validation and subscription.
    void assertWalletContext(p, account).catch((e) => changed(safeError(e)));
    return () => {
      active = false;
      stop();
    };
  }, [selectedWallet, account]);
  useEffect(() => {
    if (!configured) return;
    // Hydrate an external transaction checkpoint after SSR. One bounded update, not derived render state.
    try {
      const saved = JSON.parse(
        localStorage.getItem(pendingStorageKey(address)) || "null",
      );
      if (
        saved &&
        /^0x[0-9a-fA-F]{64}$/.test(saved.hash) &&
        typeof saved.action === "string" &&
        typeof saved.communityId === "string" &&
        typeof saved.account === "string"
      ) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPending(saved);
        setTxStatus("Tracking paused — resume the existing transaction.");
      }
    } catch {
      /* Storage is optional; never authoritative chain state. */
    }
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    if (!account || !selectedProposal) return;
    let active = true;
    void read<{ found: boolean; choice: string }>("get_vote", [
      selectedProposal.id,
      account,
    ])
      .then((v) => {
        if (active) setVoteRecord({ key: voteKey, choice: v.choice });
      })
      .catch((e) => {
        if (active) setError(safeError(e));
      });
    return () => {
      active = false;
    };
  }, [account, selectedProposal, voteKey]);
  async function connect(w: WalletOption) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setFundingHelp(false);
    walletSession.current?.abort();
    setAccount(null);
    try {
      const a = await connectStudioWallet(w.provider);
      walletSession.current = new AbortController();
      setSelectedWallet(w);
      setAccount(a);
      setWalletOpen(false);
      setNotice(
        `Connected ${w.name} to Studio Next. Transactions still require your approval.`,
      );
    } catch (e) {
      setError(safeError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function savePending(p: Pending | null) {
    setPending(p);
    try {
      if (p)
        localStorage.setItem(pendingStorageKey(address), JSON.stringify(p));
      else localStorage.removeItem(pendingStorageKey(address));
    } catch {
      setNotice(
        "Browser storage is unavailable. Keep the transaction link before closing this page.",
      );
    }
  }
  async function track(p: Pending) {
    abort.current = new AbortController();
    try {
      await waitFinal(p.hash, setTxStatus, abort.current.signal);
      savePending(null);
      setTxStatus("FINALIZED — execution succeeded");
      setNotice(
        `${p.action} finalized successfully. Refreshing on-chain records…`,
      );
      const page = await read<Page<Community>>("list_communities", [0, 20]);
      setCommunities(page);
      const id =
        p.communityId ||
        page.items.find((c) => c.owner === p.account.toLowerCase())?.id ||
        "";
      if (id) {
        setSelectedId(id);
        await loadProposals(id);
      }
      setDraftOpen(false);
      setCommunityOpen(false);
      setNotice(`${p.action} confirmed on Studio Next.`);
    } catch (e) {
      if (e instanceof ExecutionError) savePending(null);
      throw e;
    }
  }
  async function execute(a: Action) {
    if (lock.current || !account || !selectedWallet || pending) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setFundingHelp(false);
    try {
      const hash = await submit(
        account,
        selectedWallet.provider,
        a.method,
        a.args,
        setNotice,
        walletSession.current?.signal,
      );
      const p = {
        hash: hash as `0x${string}`,
        action: a.title,
        communityId: a.communityId,
        account,
      };
      savePending(p);
      setTxStatus("SUBMITTED");
      await track(p);
    } catch (e) {
      setNotice("");
      setFundingHelp(e instanceof InsufficientTestBalanceError);
      setError(safeError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function resume() {
    if (!pending || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await track(pending);
    } catch (e) {
      setError(safeError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function requireWallet() {
    if (!account) {
      setWalletOpen(true);
      return false;
    }
    return canWrite;
  }
  function createCommunity() {
    try {
      const rules = rulesText
          .split("\n")
          .map((r) => r.trim())
          .filter(Boolean),
        voters = votersText.split(/[\s,]+/).filter(Boolean);
      validateCommunity(name, rules, voters, Number(quorum));
      if (!requireWallet()) return;
      setAction({
        title: "Create community",
        description: `Publish ${name} with ${rules.length} fixed rules, ${voters.length} voter wallets, and quorum ${quorum}. These settings cannot be edited. The owner may close ballots after quorum; this can exclude later voters. All data is public on-chain.`,
        method: "create_community",
        args: [
          name,
          JSON.stringify(rules),
          JSON.stringify(voters),
          Number(quorum),
        ],
        communityId: "",
      });
    } catch (e) {
      setError(safeError(e));
    }
  }
  function screen() {
    try {
      validateProposal(title, body);
      if (!community) throw Error("Select a community first.");
      if (!requireWallet()) return;
      setAction({
        title: parentId ? "Screen revision" : "Screen proposal",
        description: `Publish this proposal to ${community.name}. GenLayer will screen its details against all ${community.rules.length} charter rules. Title is a label, not screening evidence. All text and the resulting decision are public and immutable.`,
        method: "submit_proposal",
        args: [community.id, title, body, parentId],
        communityId: community.id,
      });
    } catch (e) {
      setError(safeError(e));
    }
  }
  function draft(p?: Proposal) {
    setTitle(p?.title || "");
    setBody(p?.body || "");
    setParentId(p?.id || "");
    setDraftOpen(true);
    setSelectedProposal(null);
    setTab("proposals");
    setError("");
  }
  function sample(key: keyof typeof EXAMPLES) {
    const e = EXAMPLES[key];
    setTitle(e.title);
    setBody(e.body);
  }
  async function showProposal(p: Proposal) {
    setSelectedProposal(p);
    setDraftOpen(false);
    try {
      const fresh = await read<Proposal>("get_proposal", [p.id]);
      setSelectedProposal((old) => (old?.id === p.id ? fresh : old));
    } catch (e) {
      setError(safeError(e));
    }
  }
  function vote(choice: "YES" | "NO") {
    if (!selectedProposal || !community || !requireWallet()) return;
    setAction({
      title: `Vote ${choice.toLowerCase()}`,
      description: `Record a public, irreversible ${choice} vote on “${selectedProposal.title}”. Each allowed wallet can vote once.`,
      method: "vote",
      args: [selectedProposal.id, choice],
      communityId: community.id,
    });
  }
  function closeBallot() {
    if (!selectedProposal || !community || !requireWallet()) return;
    setAction({
      title: "Close ballot",
      description:
        "Permanently stop voting and record the result from votes already cast. Remaining voters will not be able to vote. This does not transfer funds.",
      method: "close_ballot",
      args: [selectedProposal.id],
      communityId: community.id,
    });
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied to clipboard.");
    } catch {
      setError("Could not copy. Select and copy the visible value instead.");
    }
  }
  const toolState = useRef({ community, proposals, account, busy, pending });
  useEffect(() => {
    toolState.current = { community, proposals, account, busy, pending };
  }, [community, proposals, account, busy, pending]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: ModelTool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifetime = new AbortController();
    const tools: ModelTool[] = [
      {
        name: "read_chartergate_workspace",
        title: "Read CharterGate workspace",
        description:
          "Read the selected community and currently loaded on-chain proposals. Does not submit a transaction.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input) {
          if (!input || typeof input !== "object" || Object.keys(input).length)
            throw Error("Expected an empty object.");
          const s = toolState.current;
          return {
            community: s.community || null,
            proposals: s.proposals,
            account: s.account,
            pending: s.pending,
          };
        },
      },
      {
        name: "stage_chartergate_proposal",
        title: "Stage a proposal draft",
        description:
          "Fill a NEW proposal draft in the selected community. Does not screen, sign, or publish. The user must review and submit it.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", maxLength: 120 },
            body: { type: "string", maxLength: 5000 },
          },
          required: ["title", "body"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          if (!input || typeof input !== "object")
            throw Error("Expected title and body.");
          const v = input as Record<string, unknown>;
          if (
            Object.keys(v).some((k) => !["title", "body"].includes(k)) ||
            typeof v.title !== "string" ||
            typeof v.body !== "string"
          )
            throw Error("Expected title and body strings only.");
          validateProposal(v.title, v.body);
          if (
            !toolState.current.community ||
            toolState.current.busy ||
            toolState.current.pending
          )
            throw Error(
              "Select a community and finish any pending transaction first.",
            );
          setTitle(v.title);
          setBody(v.body);
          setParentId("");
          setDraftOpen(true);
          setSelectedProposal(null);
          setTab("proposals");
          await new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          );
          return { staged: true, submitted: false };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifetime.signal }),
        ).catch(() => {});
      } catch {
        /* Optional browser support. */
      }
    }
    return () => lifetime.abort();
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <Landmark />
          CharterGate<span>.</span>
        </Link>
        <div className="workspace-label">GOVERNANCE WORKSPACE</div>
        <button
          className={`nav-item ${tab === "proposals" ? "active" : ""}`}
          onClick={() => setTab("proposals")}
        >
          <FileText size={18} />
          Proposals
        </button>
        <button
          className={`nav-item ${tab === "charter" ? "active" : ""}`}
          onClick={() => setTab("charter")}
        >
          <BookOpen size={18} />
          Community charter
        </button>
        <div className="sidebar-note">
          <ShieldCheck />
          <h3>Rules first. Votes second.</h3>
          <p>A proposal must pass its charter before a ballot can open.</p>
        </div>
        <a
          className="sidebar-foot"
          href={configured ? chainLink : NETWORK.studio}
          target="_blank"
          rel="noreferrer"
        >
          Built for GenLayer ↗
        </a>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            ● Studio Next <span className="muted">/ chain {NETWORK.id}</span>
          </span>
          <div className="row">
            {account && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  walletSession.current?.abort();
                  setAccount(null);
                  setSelectedWallet(null);
                  setAction(null);
                  setNotice(
                    "Wallet disconnected from this app. Submitted transaction records are preserved.",
                  );
                }}
              >
                Disconnect
              </button>
            )}
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                setWalletOpen(true);
                walletRefresh.current();
              }}
            >
              <Wallet size={17} />
              {account ? shortAddress(account) : "Connect wallet"}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div className="eyebrow">YOUR COMMUNITY. YOUR CHARTER.</div>
            <h1>Make every proposal count.</h1>
            <p>Screen against the rules. Understand the decision. Then vote.</p>
          </div>
          <div className="notice">
            Studio Next development preview. Public on-chain data; the network
            may reset. No real funds, secret information, or binding governance.
          </div>
          <details className="notice">
            <summary>Need test GEN or help connecting?</summary>
            <p>
              Use Studio Next (61997). A balance on stable Studio (61999) is
              separate and cannot pay this app’s protocol fee.
            </p>
            <p>
              Open Studio Next, connect the same wallet, select its address in
              the account menu, then use the faucet’s droplet button. Leave the
              default 10 GEN amount unchanged and select Fund. These are free
              test tokens; do not buy or bridge real funds.
            </p>
            <a href={NETWORK.studio} target="_blank" rel="noreferrer">
              Open free Studio Next faucet ↗
            </a>
            <p>
              If your wallet stopped responding after sleep or a restart, unlock
              it and reconnect. Reload if needed, then use Resume tracking for
              any existing transaction instead of resubmitting.
            </p>
          </details>
          {!configured && (
            <div className="notice">
              Deployment verification in progress. Forms are available; live
              writes are disabled until verified.
            </div>
          )}
          {error && (
            <div className="error-box" role="alert">
              <div>
                {error}
                {fundingHelp && (
                  <p>
                    <a href={NETWORK.studio} target="_blank" rel="noreferrer">
                      Open free Studio Next faucet ↗
                    </a>
                  </p>
                )}
              </div>
              <button className="text-button" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {notice && (
            <div className="status-box" role="status">
              {notice}
            </div>
          )}
          {pending && (
            <div className="pending-box" role="status">
              <strong>{pending.action}</strong>
              <p>{txStatus}</p>
              <a
                href={`${NETWORK.explorer}/transactions/${pending.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                Transaction {shortAddress(pending.hash)} ↗
              </a>
              <p className="muted">
                Do not resubmit while this hash is pending. Signing wallet:{" "}
                {shortAddress(pending.account)}.
              </p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void resume()}
              >
                Resume tracking
              </button>
            </div>
          )}
          <div className="community-picker">
            <div>
              <label htmlFor="community-select">Community</label>
              <Select
                value={selectedId}
                onValueChange={(id) => {
                  selectionEpoch.current++;
                  setProposals(emptyPage);
                  setSelectedProposal(null);
                  setDraftOpen(false);
                  setSelectedId(id);
                }}
              >
                <SelectTrigger
                  id="community-select"
                  className="community-select"
                  aria-label="Select community"
                >
                  <SelectValue
                    placeholder={
                      loading ? "Loading communities…" : "Select a community"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {communities.items.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setCommunityOpen(true);
                setError("");
              }}
            >
              <Plus size={17} />
              New community
            </button>
            <button
              className="icon-button"
              title="Refresh on-chain records"
              aria-label="Refresh on-chain records"
              disabled={loading || busy}
              onClick={() => {
                void loadCommunities();
                if (selectedId)
                  void loadProposals(selectedId).catch((e) =>
                    setError(safeError(e)),
                  );
              }}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          {communities.next_offset < communities.total && (
            <button
              className="text-button"
              onClick={() =>
                void read<Page<Community>>("list_communities", [
                  communities.next_offset,
                  20,
                ])
                  .then((page) =>
                    setCommunities((old) => ({
                      ...page,
                      items: [...old.items, ...page.items],
                    })),
                  )
                  .catch((e) => setError(safeError(e)))
              }
            >
              Load more communities
            </button>
          )}
          {community ? (
            <>
              <div className="community-bar">
                <div className="community-icon">
                  <Landmark />
                </div>
                <div>
                  <h2>{community.name}</h2>
                  <p>
                    Immutable charter · {community.voters.length} voter wallet
                    {community.voters.length === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="tag">
                  {community.rules.length} charter rules
                </span>
              </div>
              <div className="stats">
                <div>
                  <span>CHARTER RULES</span>
                  <strong>
                    {String(community.rules.length).padStart(2, "0")}
                    <BookOpen size={22} />
                  </strong>
                  <p>Fixed at community creation</p>
                </div>
                <div>
                  <span>PROPOSALS</span>
                  <strong>
                    {String(proposals.total).padStart(2, "0")}
                    <ShieldCheck size={22} />
                  </strong>
                  <p>Screening decisions recorded on-chain</p>
                </div>
                <div>
                  <span>VOTING QUORUM</span>
                  <strong>
                    {community.quorum} of {community.voters.length}
                    <Vote size={22} />
                  </strong>
                  <p>Owner can close after quorum</p>
                </div>
              </div>
              <Tabs value={tab} onValueChange={setTab}>
                <div className="section-toolbar">
                  <TabsList variant="line">
                    <TabsTrigger value="proposals">Proposals</TabsTrigger>
                    <TabsTrigger value="charter">Community charter</TabsTrigger>
                  </TabsList>
                  <button
                    className="button"
                    disabled={busy || !!pending}
                    onClick={() => draft()}
                  >
                    <Plus size={17} />
                    New proposal
                  </button>
                </div>
                <TabsContent value="proposals">
                  {draftOpen ? (
                    <section className="card panel">
                      <div className="row between">
                        <div className="eyebrow">
                          {parentId
                            ? "REVISION · NEW IMMUTABLE RECORD"
                            : "NEW PROPOSAL"}
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setDraftOpen(false)}
                        >
                          Close draft
                        </button>
                      </div>
                      <h2>What would you like to change?</h2>
                      <p className="muted">
                        Include the details needed to evaluate every charter
                        rule. The title alone is not evidence.
                      </p>
                      <div className="example-buttons">
                        <span>Sample drafts:</span>
                        <button onClick={() => sample("eligible")}>
                          Free workshop
                        </button>
                        <button onClick={() => sample("ineligible")}>
                          Paid workshop
                        </button>
                        <button onClick={() => sample("clarification")}>
                          Missing details
                        </button>
                      </div>
                      <label>
                        Proposal title
                        <input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          maxLength={120}
                          placeholder="A free beginner developer workshop"
                        />
                      </label>
                      <label>
                        Proposal details
                        <textarea
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          rows={7}
                          maxLength={5000}
                          placeholder="Explain your plan and address every charter rule."
                        />
                      </label>
                      <div className="row between">
                        <span className="muted">
                          {Array.from(body).length}/5,000 characters · public
                          on-chain
                        </span>
                        <button
                          className="button"
                          disabled={busy || !!pending || !configured}
                          onClick={screen}
                        >
                          <ShieldCheck size={17} />
                          {account ? "Screen proposal" : "Connect to screen"}
                        </button>
                      </div>
                      {parentId && (
                        <p className="mono small-note">
                          Revision of {parentId}. The original is preserved.
                        </p>
                      )}
                    </section>
                  ) : selectedProposal ? (
                    <section className="card panel proposal-detail">
                      <button
                        className="text-button back"
                        onClick={() => setSelectedProposal(null)}
                      >
                        <ArrowLeft size={16} />
                        All proposals
                      </button>
                      <div className="row between">
                        <span
                          className={`verdict ${selectedProposal.review.verdict}`}
                        >
                          {LABELS[selectedProposal.review.verdict]}
                        </span>
                        <button
                          className="text-button"
                          onClick={() => void copy(selectedProposal.id)}
                        >
                          <Copy size={14} />
                          Copy ID
                        </button>
                      </div>
                      <h2>{selectedProposal.title}</h2>
                      <p className="metadata">
                        Submitted by {shortAddress(selectedProposal.author)} ·{" "}
                        {selectedProposal.created_at}
                      </p>
                      <p className="proposal-body">{selectedProposal.body}</p>
                      {selectedProposal.parent_id && (
                        <button
                          className="text-button"
                          onClick={() =>
                            void read<Proposal>("get_proposal", [
                              selectedProposal.parent_id,
                            ])
                              .then((p) => {
                                if (p.found) setSelectedProposal(p);
                              })
                              .catch((e) => setError(safeError(e)))
                          }
                        >
                          View preserved original <ArrowUpRight size={15} />
                        </button>
                      )}
                      <h3 className="review-heading">Rule-by-rule decision</h3>
                      {selectedProposal.review.checks.map((check) => (
                        <div className="check-row" key={check.rule_index}>
                          <div className="row">
                            <span className={`check-label ${check.status}`}>
                              {check.status}
                            </span>
                            <strong>{check.rule}</strong>
                          </div>
                          {check.quote ? (
                            <blockquote>“{check.quote}”</blockquote>
                          ) : (
                            <p className="muted">
                              No relevant detail was supplied.
                            </p>
                          )}
                          <p>{check.reason}</p>
                        </div>
                      ))}
                      {selectedProposal.review.verdict === "ELIGIBLE" ? (
                        <div className="ballot">
                          <div className="row between">
                            <h3>
                              {selectedProposal.ballot.closed
                                ? "Closed ballot"
                                : "Community ballot"}
                            </h3>
                            <span className="tag">
                              {selectedProposal.ballot.closed
                                ? selectedProposal.ballot.outcome.replaceAll(
                                    "_",
                                    " ",
                                  )
                                : "Open"}
                            </span>
                          </div>
                          <div className="tally">
                            <span>
                              <strong>{selectedProposal.ballot.yes}</strong> Yes
                            </span>
                            <span>
                              <strong>{selectedProposal.ballot.no}</strong> No
                            </span>
                            <p>
                              Quorum:{" "}
                              {selectedProposal.ballot.yes +
                                selectedProposal.ballot.no}
                              /{community.quorum}
                            </p>
                          </div>
                          {!selectedProposal.ballot.closed && (
                            <>
                              <p className="muted">
                                {!account
                                  ? "Connect an allowed voter wallet to participate."
                                  : !community.voters.includes(
                                        account.toLowerCase(),
                                      )
                                    ? "Your wallet is not on this community’s fixed voter list."
                                    : voteChoice
                                      ? `Your recorded vote: ${voteChoice}. Votes cannot be changed.`
                                      : "One public vote per allowed wallet. Votes cannot be changed."}
                              </p>
                              <div className="row">
                                <button
                                  className="button"
                                  disabled={
                                    !canWrite ||
                                    !community.voters.includes(
                                      account?.toLowerCase() || "",
                                    ) ||
                                    !!voteChoice
                                  }
                                  onClick={() => vote("YES")}
                                >
                                  Vote yes
                                </button>
                                <button
                                  className="button secondary"
                                  disabled={
                                    !canWrite ||
                                    !community.voters.includes(
                                      account?.toLowerCase() || "",
                                    ) ||
                                    !!voteChoice
                                  }
                                  onClick={() => vote("NO")}
                                >
                                  Vote no
                                </button>
                                {account?.toLowerCase() === community.owner && (
                                  <button
                                    className="button secondary"
                                    disabled={
                                      !canWrite ||
                                      selectedProposal.ballot.yes +
                                        selectedProposal.ballot.no <
                                        community.quorum
                                    }
                                    onClick={closeBallot}
                                  >
                                    Close ballot
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="blocked-ballot">
                          <ShieldCheck />
                          <h3>Voting is blocked by the contract</h3>
                          <p>
                            {selectedProposal.review.verdict === "INELIGIBLE"
                              ? "A charter rule was contradicted."
                              : "Required details are missing or unclear."}{" "}
                            The author can revise and request a new screening.
                            The original decision remains.
                          </p>
                          {account?.toLowerCase() ===
                            selectedProposal.author && (
                            <button
                              className="button secondary"
                              disabled={busy || !!pending}
                              onClick={() => draft(selectedProposal)}
                            >
                              Revise proposal
                            </button>
                          )}
                        </div>
                      )}
                      <div className="small-note mono">
                        Proposal ID: {selectedProposal.id}
                      </div>
                    </section>
                  ) : proposals.items.length ? (
                    <div className="proposal-list">
                      {proposals.items.map((p) => (
                        <button
                          className="card proposal-card"
                          key={p.id}
                          onClick={() => void showProposal(p)}
                        >
                          <div>
                            <span className={`verdict ${p.review.verdict}`}>
                              {LABELS[p.review.verdict]}
                            </span>
                            <h2>{p.title}</h2>
                            <p>
                              {p.body.length > 155
                                ? p.body.slice(0, 155) + "…"
                                : p.body}
                            </p>
                            <div className="metadata">
                              {shortAddress(p.author)} ·{" "}
                              {p.parent_id ? "Revision · " : ""}
                              {p.review.verdict === "ELIGIBLE"
                                ? p.ballot.closed
                                  ? p.ballot.outcome.replaceAll("_", " ")
                                  : `${p.ballot.yes + p.ballot.no} votes · ballot open`
                                : "Voting blocked"}
                            </div>
                          </div>
                          <ChevronRight size={21} />
                        </button>
                      ))}
                      {proposals.next_offset < proposals.total && (
                        <button
                          className="button secondary"
                          onClick={() =>
                            void read<Page<Proposal>>("list_proposals", [
                              community.id,
                              proposals.next_offset,
                              20,
                            ])
                              .then((page) =>
                                setProposals((old) => ({
                                  ...page,
                                  items: [...old.items, ...page.items],
                                })),
                              )
                              .catch((e) => setError(safeError(e)))
                          }
                        >
                          Load more proposals
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="proposal-layout">
                      <section className="card empty-state">
                        <div className="empty-icon">
                          <FileText size={31} />
                        </div>
                        <div className="eyebrow">
                          THE FIRST PROPOSAL STARTS HERE
                        </div>
                        <h2>Bring your idea to the gate.</h2>
                        <p>
                          The charter is ready. Write a proposal that addresses
                          each rule and let GenLayer screen it.
                        </p>
                        <button className="text-button" onClick={() => draft()}>
                          Draft a proposal <ArrowUpRight size={17} />
                        </button>
                      </section>
                      <HowItWorks />
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="charter">
                  <section className="card panel">
                    <div className="eyebrow">
                      FIXED CHARTER · {community.rules.length} RULES
                    </div>
                    <h2>What this community stands for</h2>
                    {community.rules.map((r, i) => (
                      <div className="rule" key={i}>
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <p>{r}</p>
                      </div>
                    ))}
                    <h3>Voter allowlist</h3>
                    <p className="muted">
                      One vote per wallet, not a proof of one person. Membership
                      and rules cannot be edited.
                    </p>
                    <ul className="wallet-list">
                      {community.voters.map((v) => (
                        <li className="mono" key={v}>
                          {v}
                        </li>
                      ))}
                    </ul>
                    <h3>Ballot rules</h3>
                    <p>
                      Minimum {community.quorum} vote
                      {community.quorum === 1 ? "" : "s"} to close. A strict yes
                      majority passes; ties do not pass. The owner chooses when
                      to close after quorum, so not every listed voter is
                      guaranteed time to vote.
                    </p>
                    <p className="metadata mono">Owner: {community.owner}</p>
                    <p className="metadata mono">
                      Community ID: {community.id}
                    </p>
                    <div className="notice">
                      Screening evaluates the text and its commitments, not
                      real-world truth or future delivery. This is a prototype
                      for low-stakes community decisions.
                    </div>
                  </section>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <div className="proposal-layout">
              <section className="card empty-state">
                <div className="empty-icon">
                  <Landmark size={31} />
                </div>
                <div className="eyebrow">A CLEAR START</div>
                <h2>
                  {loading
                    ? "Loading your governance workspace…"
                    : "Good decisions start with clear rules."}
                </h2>
                <p>
                  {loading
                    ? "Reading finalized records from Studio Next."
                    : "Create a community, define who can vote, and bring your first proposal to the gate."}
                </p>
                <button
                  className="button"
                  disabled={loading}
                  onClick={() => setCommunityOpen(true)}
                >
                  <Plus size={17} />
                  Create a community
                </button>
              </section>
              <HowItWorks />
            </div>
          )}
          <footer>
            <p>
              No treasury access. No automatic payments. Just clear rules and
              accountable decisions.
            </p>
            {configured && (
              <p>
                <a href={chainLink} target="_blank" rel="noreferrer">
                  Verify contract ↗
                </a>{" "}
                ·{" "}
                <a
                  href={`${NETWORK.studio}/contracts?import-contract=${address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Studio ↗
                </a>{" "}
                ·{" "}
                <a
                  href="/contract/chartergate.py"
                  target="_blank"
                  rel="noreferrer"
                >
                  Contract source
                </a>
                {" · "}
                <a
                  href="/contract/browser-wallet-test.json"
                  target="_blank"
                  rel="noreferrer"
                >
                  Wallet test evidence
                </a>
              </p>
            )}
            <details>
              <summary>Deployment & limitations</summary>
              <p className="mono">
                {configured ? address : "Not yet deployed"} · Chain {NETWORK.id}
              </p>
              <p className="mono">
                Source SHA-256:{" "}
                {DEPLOYMENT.sourceSha256 || "Pending verification"}
              </p>
              <p>
                AI can misinterpret text. Review cited reasons. No appeal
                system, timed elections, identity verification, or enforceable
                spending. Studio Next may reset data.
              </p>
            </details>
          </footer>
        </main>
      </div>
      <Dialog open={walletOpen} onOpenChange={setWalletOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect your wallet</DialogTitle>
            <DialogDescription>
              Choose an installed Ethereum-compatible wallet. You will be asked
              to switch to Studio Next (61997). Custom networks are not
              supported by every wallet.
            </DialogDescription>
          </DialogHeader>
          {wallets.length ? (
            wallets.map((w) => (
              <button
                className="wallet-option"
                disabled={busy}
                key={w.id}
                onClick={() => void connect(w)}
              >
                <Wallet size={21} />
                <span>{w.name}</span>
                <ChevronRight size={18} />
              </button>
            ))
          ) : (
            <p>
              No compatible wallet detected. Open this app in a browser with
              MetaMask, OKX, or another EIP-1193 wallet. On mobile, use the
              wallet’s browser; mobile signing is not yet verified.
            </p>
          )}
          <button
            className="text-button"
            onClick={() => walletRefresh.current()}
          >
            Refresh wallet list
          </button>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={communityOpen} onOpenChange={setCommunityOpen}>
        <DialogContent className="community-dialog">
          <DialogHeader>
            <DialogTitle>Create a community</DialogTitle>
            <DialogDescription>
              Publish a fixed charter and voting membership. These records are
              public and cannot be edited.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createCommunity();
            }}
          >
            <label>
              Community name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="e.g. Open Builders Collective"
                required
              />
            </label>
            <label>
              Charter rules — one per line
              <textarea
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                rows={5}
                maxLength={3000}
                required
              />
            </label>
            <p className="muted">
              1–6 plain-language rules; up to 400 characters per rule.
            </p>
            <label>
              Voter wallet addresses
              <textarea
                value={votersText}
                onChange={(e) => setVotersText(e.target.value)}
                rows={3}
                placeholder="0x… (one address per line)"
                maxLength={2500}
                required
              />
            </label>
            {account && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setVotersText((old) =>
                    old.trim() ? old + "\n" + account : account,
                  )
                }
              >
                Add my connected wallet
              </button>
            )}
            <label>
              Minimum votes to close (quorum)
              <input
                value={quorum}
                onChange={(e) => setQuorum(e.target.value)}
                type="number"
                min={1}
                max={32}
                required
              />
            </label>
            <p className="muted">
              The creator can close an eligible ballot once quorum is met. A
              strict yes majority passes. No money moves.
            </p>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="button"
              disabled={busy || !!pending || !configured}
            >
              {account ? "Review & create community" : "Connect to create"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{action?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {action?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="muted">
            Network: Studio Next (61997). Your wallet will show the protocol fee
            before you approve.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canWrite}
              onClick={() => {
                const a = action;
                setAction(null);
                if (a) void execute(a);
              }}
            >
              Continue to wallet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function HowItWorks() {
  return (
    <section className="card how-card">
      <div className="eyebrow">HOW THE GATE WORKS</div>
      {[
        ["01", "Write a proposal", "Explain your idea in plain language."],
        [
          "02",
          "Check the charter",
          "GenLayer independently evaluates every rule.",
        ],
        ["03", "Open the ballot", "Only eligible proposals can receive votes."],
      ].map(([n, title, text]) => (
        <div className="how-step" key={n}>
          <span>{n}</span>
          <div>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        </div>
      ))}
      <p className="small-note">
        <Check size={15} /> History stays intact when you revise.
      </p>
    </section>
  );
}
