"use client";

/**
 * Read-only MIND token ledger client — the typed surface over the server-origin
 * `/.tokens` API that mind-node ships (solidrs-ledger). This is the *balance*
 * subset: it views the ledger, it never signs or submits transfers (custody of
 * the signing key lives in the shell's Wallet app, not in ordinary apps).
 *
 * `/.tokens` is a RESERVED server route, not a pod resource: it is reached with
 * the app's own authenticated session fetch (same-origin), never through the
 * shell capability bridge — that bridge brokers pod I/O only, so an embedded
 * app gets `unsupported`/`error` here and should simply hide the balance.
 *
 * Never log amounts or ledger bodies — route + status only.
 */

export interface LedgerEntry {
  /** 1-based position in the owner's chain. */
  seq: number;
  prev_hash: string;
  /** RFC 3339 record time (advisory). */
  ts: string;
  /** `mint` | `debit` | `meter` | `transfer-out` | `transfer-in`. */
  kind: string;
  /** The other party's WebID for transfers; absent for server/operator ops. */
  counterparty?: string;
  /** Signed balance delta (credits positive). */
  amount: number;
  memo: string;
  sig?: string;
  hash: string;
}

/** `GET /.tokens` — the caller's own account (owner-scoped). */
export interface TokensView {
  owner: string;
  unit: string;
  balance: number;
  /** Current chain seq (0 for an empty chain). */
  seq: number;
  /** Last entry's hash (`"genesis"` for an empty chain). */
  head_hash: string;
  /** The registered signing did:key, or null. */
  did: string | null;
  history: LedgerEntry[];
  transfers_enabled: boolean;
}

export type TokensResult =
  | { status: "ok"; view: TokensView }
  | { status: "unauthorized" }
  /** 404 — this server has no ledger routes at all (e.g. stock CSS). */
  | { status: "unsupported" }
  /** 503 — ledger supported but switched off (no `--ledger on`). */
  | { status: "disabled" }
  | { status: "error"; detail: string };

/**
 * The ledger lives on the SAME origin as the account's WebID (it is
 * account-scoped, not pod-scoped) — derive it from the WebID rather than the
 * stored issuer, which may point at a different server while a passport session
 * is active.
 */
export function ledgerOrigin(webId: string): string {
  return new URL(webId).origin + "/";
}

/** Fetch the caller's balance + signed history. Never throws on HTTP errors. */
export async function fetchTokens(
  fetchFn: typeof fetch,
  origin: string
): Promise<TokensResult> {
  let res: Response;
  try {
    res = await fetchFn(`${origin}.tokens`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    return { status: "error", detail: "Can't reach the server." };
  }
  if (res.status === 401 || res.status === 403) return { status: "unauthorized" };
  if (res.status === 404) return { status: "unsupported" };
  if (res.status === 503) return { status: "disabled" };
  if (!res.ok) return { status: "error", detail: `Ledger lookup failed (${res.status}).` };
  try {
    const view = (await res.json()) as TokensView;
    return { status: "ok", view };
  } catch {
    return { status: "error", detail: "Ledger returned an unreadable response." };
  }
}
