"use client";

import {
  getDefaultSession,
  handleIncomingRedirect,
  type ISessionInfo,
  type Session,
} from "@inrupt/solid-client-authn-browser";
import { podRootFromWebId } from "../apps/pod-client";
import { createBroker, type Broker, type BrokerIdentity, type BrokerTheme } from "./broker";
import { createPodFs, type PodFs } from "./pod-fs";

export interface CreateSolidClientOptions {
  /**
   * Stable app slug — namespaces localStorage/sessionStorage keys and the
   * broker request-id prefix. e.g. `"calendar"`, `"notes"`.
   */
  appName: string;
  /** OIDC `clientName` shown on the issuer's consent screen. */
  clientName?: string;
  /** Where to land after a successful login when no deep link was remembered. */
  defaultReturnPath: string;
  /** Issuer used when the user hasn't picked one (app passes its env value). */
  defaultIssuer: string;
}

/**
 * The per-app Solid foundation: session access, the single-flight OIDC redirect
 * handler, the shell capability bridge (broker), and a pod filesystem. Each app
 * creates exactly one of these and shares it through {@link import("./context").MindSolidProvider}.
 */
export interface SolidClient {
  readonly appName: string;
  readonly clientName: string;
  readonly defaultIssuer: string;
  readonly defaultReturnPath: string;

  /** The process-wide Inrupt default session (never instantiate a second one). */
  session(): Session;

  // ── issuer memory ──────────────────────────────────────────────────────────
  storedIssuer(): string;
  rememberIssuer(issuer: string): void;

  // ── return-to memory ─────────────────────────────────────────────────────
  rememberReturnTo(url: string): void;
  rememberReturnToDefault(url: string): void;
  rememberSignedOutPath(): void;
  consumeReturnTo(): string;

  // ── environment ──────────────────────────────────────────────────────────
  isEmbedded(): boolean;

  // ── session lifecycle ──────────────────────────────────────────────────────
  ensureSession(): Promise<ISessionInfo>;
  completeLoginRedirect(): Promise<ISessionInfo>;

  /** Active identity, brokered-first; null = signed-out and not brokered. */
  currentIdentity(): { webId: string; podRoot: string } | null;

  /** The active authed fetch — broker fetch when embedded, else session fetch. */
  authedFetch(): typeof fetch;

  readonly broker: Broker;
  readonly fs: PodFs;
}

export function createSolidClient(opts: CreateSolidClientOptions): SolidClient {
  const { appName, defaultReturnPath, defaultIssuer } = opts;
  const clientName = opts.clientName ?? `Mind ${appName}`;
  const ISSUER_KEY = `mind-${appName}:oidc-issuer`;
  const RETURN_TO_KEY = `mind-${appName}:return-to`;

  const broker = createBroker({ reqPrefix: appName });

  function session(): Session {
    return getDefaultSession();
  }

  function isEmbedded(): boolean {
    if (typeof window === "undefined") return false;
    try {
      return window.self !== window.top;
    } catch {
      // A cross-origin parent makes `window.top` access throw — we're framed.
      return true;
    }
  }

  function authedFetch(): typeof fetch {
    return broker.isBrokered() ? broker.brokerFetch : (session().fetch as typeof fetch);
  }

  function currentIdentity(): { webId: string; podRoot: string } | null {
    const b = broker.brokeredIdentity();
    if (b) return { webId: b.webId, podRoot: b.podRoot };
    const info = session().info;
    if (info.isLoggedIn && info.webId) {
      return { webId: info.webId, podRoot: podRootFromWebId(info.webId) };
    }
    return null;
  }

  // ── issuer memory ──────────────────────────────────────────────────────────

  function storedIssuer(): string {
    if (typeof window === "undefined") return defaultIssuer;
    return localStorage.getItem(ISSUER_KEY) ?? defaultIssuer;
  }

  function rememberIssuer(issuer: string) {
    if (typeof window === "undefined") return;
    localStorage.setItem(ISSUER_KEY, issuer);
  }

  // ── return-to memory ──────────────────────────────────────────────────────

  /**
   * The URL users should land on after the OIDC dance — set right before
   * triggering login(), read by /login/callback once the code is consumed.
   *
   * We deliberately do NOT use `restorePreviousSession: true`. In the @inrupt
   * browser SDK that flag is not a token-based silent restore — it is a
   * full-page redirect to the IdP. On CSS, calling it on every page load
   * creates an infinite /login/callback ↔ app loop, and even in the happy path
   * it round-trips through the IdP and discards the deep link. The price is
   * that a hard refresh lands on the signed-out prompt; we soften that by
   * remembering the attempted path so reconnecting returns there.
   */
  function rememberReturnTo(url: string) {
    if (typeof window === "undefined") return;
    if (url.startsWith("/login/callback") || url.startsWith("/connect")) return;
    try {
      sessionStorage.setItem(RETURN_TO_KEY, url);
    } catch {}
  }

  /**
   * Set the post-login destination ONLY if one isn't already remembered, so a
   * deep link captured by a signed-out screen isn't clobbered by the /connect
   * form's default.
   */
  function rememberReturnToDefault(url: string) {
    if (typeof window === "undefined") return;
    try {
      if (!sessionStorage.getItem(RETURN_TO_KEY)) rememberReturnTo(url);
    } catch {}
  }

  /**
   * Called by signed-out screens on mount to capture where the user was trying
   * to go, so a subsequent "Connect a pod" → login returns them there.
   */
  function rememberSignedOutPath() {
    if (typeof window === "undefined") return;
    rememberReturnTo(window.location.pathname + window.location.search);
  }

  function consumeReturnTo(): string {
    if (typeof window === "undefined") return defaultReturnPath;
    try {
      const v = sessionStorage.getItem(RETURN_TO_KEY);
      sessionStorage.removeItem(RETURN_TO_KEY);
      if (v && v.startsWith("/") && !v.startsWith("//")) return v;
    } catch {}
    return defaultReturnPath;
  }

  // ── single-flight redirect ──────────────────────────────────────────────────

  /**
   * The OIDC authorization code is one-time-use: redeeming it twice makes the
   * token endpoint return `invalid_grant`, which resets the @inrupt session
   * back to signed-out. The shell mounts several session-aware components at
   * once, so memoizing the call guarantees the redirect is handled exactly once
   * per page load no matter how many components ask for the session.
   *
   * HARD RULE: this is the ONLY call site of `handleIncomingRedirect`. Apps
   * must route every session check through {@link ensureSession} /
   * {@link completeLoginRedirect}.
   */
  let redirectHandled: Promise<void> | null = null;

  function handleRedirectOnce(): Promise<void> {
    if (!redirectHandled) {
      redirectHandled = handleIncomingRedirect({
        url: typeof window !== "undefined" ? window.location.href : undefined,
      })
        .then(() => undefined)
        // Swallow: a stale/replayed code rejects here, but the first (winning)
        // call already established the session. Callers re-read session().info.
        .catch(() => undefined);
    }
    return redirectHandled;
  }

  /**
   * Idempotent session check on page load. Consumes an OIDC code if the URL has
   * one (from a fresh redirect), but does NOT trigger silent re-auth. Inside
   * the Mind shell, takes identity over the capability bridge instead of
   * running OIDC — the shell brokers all pod I/O so no credential crosses.
   */
  async function ensureSession(): Promise<ISessionInfo> {
    const s = session();
    if (s.info.isLoggedIn) return s.info;
    if (isEmbedded()) {
      const brokered = await broker.initBroker();
      if (brokered) {
        return {
          isLoggedIn: true,
          webId: brokered.webId,
          sessionId: "mind-shell-brokered",
        } as ISessionInfo;
      }
    }
    await handleRedirectOnce();
    return session().info;
  }

  /**
   * Completes the OIDC redirect on the /login/callback route. Shares the same
   * single-flight redemption as {@link ensureSession}, so the callback page and
   * any concurrently-mounted component never redeem the code twice.
   */
  async function completeLoginRedirect(): Promise<ISessionInfo> {
    await handleRedirectOnce();
    return session().info;
  }

  const fs = createPodFs(authedFetch);

  return {
    appName,
    clientName,
    defaultIssuer,
    defaultReturnPath,
    session,
    storedIssuer,
    rememberIssuer,
    rememberReturnTo,
    rememberReturnToDefault,
    rememberSignedOutPath,
    consumeReturnTo,
    isEmbedded,
    ensureSession,
    completeLoginRedirect,
    currentIdentity,
    authedFetch,
    broker,
    fs,
  };
}

export type { Broker, BrokerIdentity, BrokerTheme, PodFs };
