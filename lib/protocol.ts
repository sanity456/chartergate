export type Community = {
  found: true;
  id: string;
  name: string;
  rules: string[];
  voters: string[];
  quorum: number;
  voting_seconds?: number;
  owner: string;
  created_at: string;
  policy: string;
};
export type Verdict = "ELIGIBLE" | "INELIGIBLE" | "NEEDS_CLARIFICATION";
export type Check = {
  rule_index: number;
  rule: string;
  status: "PASS" | "FAIL" | "UNCLEAR";
  quote: string;
  reason: string;
};
export type Proposal = {
  found: true;
  id: string;
  community_id: string;
  title: string;
  body: string;
  author: string;
  parent_id: string;
  created_at: string;
  created_at_unix?: number;
  kind?: "INITIAL" | "REVISION" | "APPEAL";
  policy: string;
  review: { verdict: Verdict; checks: Check[] };
  ballot: {
    yes: number;
    no: number;
    closed: boolean;
    outcome: string;
    closed_at?: string;
    deadline_unix?: number;
    finalized_by?: string;
  };
};
export type Page<T> = { items: T[]; total: number; next_offset: number };
export type Pending = {
  hash: `0x${string}`;
  action: string;
  communityId: string;
  account: string;
};
export const LABELS = {
  ELIGIBLE: "Eligible",
  INELIGIBLE: "Ineligible",
  NEEDS_CLARIFICATION: "Needs clarification",
};
export const EXAMPLE_RULES = [
  "Activities must be free for participants.",
  "Activities must teach open-source software development.",
  "Learning materials must be published openly.",
];
export const EXAMPLES = {
  eligible: {
    title: "Free open-source developer workshop",
    body: "We will run a free workshop teaching open-source software development. There is no fee for participants. We will publish all learning materials openly in a public repository.",
  },
  ineligible: {
    title: "Paid open-source developer workshop",
    body: "We will teach open-source software development at a workshop. Every participant must pay a $20 attendance fee. All learning materials will be published openly.",
  },
  clarification: {
    title: "Open-source developer meetup",
    body: "We will teach open-source software development at a meetup. Learning materials will be published openly.",
  },
};
export function plain(value: unknown): unknown {
  if (value instanceof Map)
    return Object.fromEntries(
      [...value].map(([k, v]) => [String(k), plain(v)]),
    );
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, plain(v)]),
    );
  return value;
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function executionSucceeded(value: unknown) {
  const r = plain(value);
  if (!record(r)) return false;
  const result = r.txExecutionResultName ?? r.txExecutionResult;
  if (result != null)
    return (
      result === 1 || result === "FINISHED_WITH_RETURN" || result === "SUCCESS"
    );
  const leaders = record(r.consensus_data)
    ? r.consensus_data.leader_receipt
    : null;
  const rows = (
    Array.isArray(leaders) ? leaders : leaders ? [leaders] : []
  ).filter(
    (x): x is Record<string, unknown> =>
      record(x) && (!x.mode || x.mode === "leader"),
  );
  return (
    rows.length > 0 &&
    rows.every(
      (x) =>
        x.execution_result === "SUCCESS" ||
        x.execution_result === "FINISHED_WITH_RETURN",
    )
  );
}
export function receiptStatus(value: unknown) {
  const r = plain(value);
  return record(r)
    ? String(r.statusName ?? r.status ?? "UNKNOWN").toUpperCase()
    : "UNKNOWN";
}
export const shortAddress = (s: string) =>
  s.length > 16 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
export function safeError(error: unknown) {
  const e = error as { code?: number; message?: string; shortMessage?: string };
  if (e?.code === 4001)
    return "Wallet request declined. Nothing was submitted.";
  if (e?.code === -32002)
    return "A request is already open. Check your selected wallet.";
  const m =
    e?.shortMessage || e?.message || "The request could not be completed.";
  if (/429|32429|rate.limit/i.test(m))
    return "Studio Next is rate-limiting requests. Wait a minute and refresh or resume tracking.";
  return m.slice(0, 500);
}
export function validateCommunity(
  name: string,
  rules: string[],
  voters: string[],
  quorum: number,
) {
  if (!name.trim() || Array.from(name).length > 80)
    throw Error("Enter a community name of 1–80 characters.");
  if (
    rules.length < 1 ||
    rules.length > 6 ||
    rules.some((r) => !r.trim() || Array.from(r).length > 400)
  )
    throw Error("Add 1–6 rules, each 1–400 characters.");
  if (new Set(rules.map((r) => r.trim().toLowerCase())).size !== rules.length)
    throw Error("Remove duplicate rules.");
  if (
    voters.length < 1 ||
    voters.length > 32 ||
    voters.some((v) => !/^0x[0-9a-fA-F]{40}$/.test(v) || /^0x0{40}$/i.test(v))
  )
    throw Error("Add 1–32 valid, nonzero wallet addresses.");
  if (new Set(voters.map((v) => v.toLowerCase())).size !== voters.length)
    throw Error("Remove duplicate voter wallets.");
  if (!Number.isInteger(quorum) || quorum < 1 || quorum > voters.length)
    throw Error("Quorum must be between 1 and the number of voter wallets.");
}
export function validateProposal(title: string, body: string) {
  if (!title.trim() || Array.from(title).length > 120)
    throw Error("Enter a title of 1–120 characters.");
  if (!body.trim() || Array.from(body).length > 5000)
    throw Error("Enter proposal details of 1–5,000 characters.");
}

export function validateVotingWindow(minutes: number) {
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 10080)
    throw Error("Choose a whole number of minutes from 5 to 10,080 (7 days).");
  return minutes * 60;
}

// UI hints only; the contract checks its transaction time independently.
export function ballotWindow(deadline: number | undefined, now: number) {
  const timed = typeof deadline === "number" && deadline > 0;
  return { timed, ended: timed && now >= deadline, ready: !timed || now > 0 };
}
