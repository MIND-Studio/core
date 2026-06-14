"use client";

import { useEffect, useState } from "react";
import {
  login,
  logout,
  getDefaultSession,
  handleIncomingRedirect,
  type Session,
} from "@inrupt/solid-client-authn-browser";
import { useMindTheme } from "@mind-studio/ui";
import { useSolidClient } from "./context";

export interface UseSessionResult {
  webid: string | null;
  loggedIn: boolean;
  loading: boolean;
  fetch: typeof globalThis.fetch | null;
  signIn: (issuer: string) => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Client-side session hook backed by the ambient {@link SolidClient}. On mount
 * it runs the single-flight {@link SolidClient.ensureSession} (which redeems a
 * fresh OIDC code and, inside the shell, takes the brokered identity) and
 * exposes the current WebID plus sign-in / sign-out actions.
 */
export function useSession(): UseSessionResult {
  const client = useSolidClient();
  const [info, setInfo] = useState<{ webId: string | null; loggedIn: boolean }>({
    webId: null,
    loggedIn: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    client
      .ensureSession()
      .then((s) => {
        if (cancelled) return;
        setInfo({ webId: s.webId ?? null, loggedIn: !!s.isLoggedIn });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  async function signIn(issuer: string) {
    client.rememberIssuer(issuer);
    await login({
      oidcIssuer: issuer,
      redirectUrl:
        typeof window !== "undefined" ? `${window.location.origin}/login/callback` : "",
      clientName: client.clientName,
    });
  }

  async function signOut() {
    await logout();
    setInfo({ webId: null, loggedIn: false });
  }

  return {
    webid: info.webId,
    loggedIn: info.loggedIn,
    loading,
    // Brokered fetch when embedded, the session's authed fetch otherwise.
    fetch: client.authedFetch(),
    signIn,
    signOut,
  };
}

/**
 * Applies the shell's brokered color mode to the app's `<ThemeProvider>` and
 * tracks live shell theme toggles. No-op standalone (no theme is ever brokered).
 */
export function useBrokeredTheme() {
  const client = useSolidClient();
  const { setMode } = useMindTheme();

  useEffect(() => {
    const apply = () => {
      const t = client.broker.currentBrokeredTheme();
      if (t) setMode(t);
    };
    apply(); // in case the welcome arrived before this mounted
    return client.broker.subscribeBrokeredTheme(apply);
  }, [client, setMode]);
}

export interface UseStandaloneSessionOptions {
  /** OIDC `clientName` shown on the issuer's consent screen. */
  clientName: string;
  /**
   * Remember the current deep-link path before the restore redirect so the
   * /login/callback route can return the user there. Off by default; the apps
   * that route deep links (e.g. chat) opt in.
   */
  rememberReturnTo?: boolean;
}

export interface UseStandaloneSessionResult {
  webid: string | null;
  loggedIn: boolean;
  loading: boolean;
  fetch: typeof globalThis.fetch | null;
  signIn: (issuer: string) => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Provider-free client-side session hook for apps that run **standalone only**
 * (no Mind shell broker integration — chat, dock, builder). Restores the
 * session via `handleIncomingRedirect({ restorePreviousSession: true })` on
 * mount and exposes the current WebID plus sign-in / sign-out actions.
 *
 * This intentionally differs from {@link useSession}, which is backed by a
 * {@link import("./create-client").SolidClient} and does NOT silent-restore
 * (it brokers identity inside the shell instead). Use this one when there is no
 * `MindSolidProvider` and no embedding.
 */
export function useStandaloneSession(
  opts: UseStandaloneSessionOptions,
): UseStandaloneSessionResult {
  const { clientName, rememberReturnTo = false } = opts;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Restoring a session does a silent-auth redirect through /login/callback,
      // which then bounces to a fixed route. Remember where we actually were so
      // the callback can send us back (e.g. a deep link).
      if (rememberReturnTo && typeof window !== "undefined") {
        const path = window.location.pathname;
        if (path !== "/" && !path.startsWith("/login")) {
          try {
            sessionStorage.setItem("mind:returnTo", path);
          } catch {}
        }
      }
      try {
        await handleIncomingRedirect({ restorePreviousSession: true });
      } catch {
        // Restore failed — proceed as signed-out.
      }
      if (!cancelled) {
        setSession(getDefaultSession());
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rememberReturnTo]);

  async function signIn(issuer: string) {
    await login({
      oidcIssuer: issuer,
      redirectUrl:
        typeof window !== "undefined" ? `${window.location.origin}/login/callback` : "",
      clientName,
    });
  }

  async function signOut() {
    await logout();
    // `getDefaultSession()` returns the same singleton every call, so re-setting
    // it would be a no-op for React (Object.is) and consumers would never see
    // the signed-out state. Set `null` (a real reference change) so `loggedIn`
    // flips and pages can redirect.
    setSession(null);
  }

  return {
    webid: session?.info?.webId ?? null,
    loggedIn: !!session?.info?.isLoggedIn,
    loading,
    fetch: session?.fetch ?? null,
    signIn,
    signOut,
  };
}
