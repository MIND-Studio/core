"use client";

import { useEffect, useState } from "react";
import { login, logout } from "@inrupt/solid-client-authn-browser";
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
