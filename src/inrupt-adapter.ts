import type { LoginHandler } from "./types";

type InruptLoginFn = (options: {
  oidcIssuer: string;
  redirectUrl: string;
  clientName: string;
  /** Supported by @inrupt/solid-client-authn-browser: when set, the library
      does NOT navigate; it hands the authorization URL to this callback. */
  handleRedirect?: (redirectUrl: string) => unknown;
}) => Promise<unknown>;

type InruptHandleIncomingRedirectFn = (url: string) => Promise<unknown>;

/** Wrong username/password — show inline, do not redirect. */
export class InvalidCredentialsError extends Error {
  constructor(message = "Invalid username or password.") {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

/**
 * POST the login form into a hidden, script-disabled iframe and resolve with
 * the URL the issuer redirects it to (the app's own callback carrying the
 * one-time code). `sandbox="allow-same-origin"` keeps the iframe's location
 * readable while making sure no app code runs inside it (so nothing races us
 * for the authorization code).
 */
function postViaIframe(
  action: string,
  fields: URLSearchParams,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const name = `mind-login-${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement("iframe");
    iframe.name = name;
    iframe.setAttribute("sandbox", "allow-same-origin");
    iframe.style.display = "none";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const form = document.createElement("form");
    form.method = "post";
    form.action = action;
    form.target = name;
    form.style.display = "none";
    for (const [key, value] of fields.entries()) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);

    const cleanup = () => {
      clearInterval(poll);
      clearTimeout(timer);
      form.remove();
      iframe.remove();
    };
    const poll = setInterval(() => {
      try {
        // Throws while the iframe is on the issuer's origin.
        const href = iframe.contentWindow?.location.href;
        if (href && href !== "about:blank" && new URL(href).origin === window.location.origin) {
          cleanup();
          resolve(href);
        }
      } catch {
        /* still cross-origin */
      }
    }, 50);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Login timed out."));
    }, timeoutMs);

    form.submit();
  });
}

export function browserOidcLogin(
  inruptLogin: InruptLoginFn,
  opts: {
    callbackPath: string;
    clientName: string;
    /**
     * @inrupt's handleIncomingRedirect. When provided, the in-app credential
     * flow finishes the session in place — zero page loads. Without it the
     * app navigates once to its own callback URL (still never the issuer's
     * page).
     */
    handleIncomingRedirect?: InruptHandleIncomingRedirectFn;
    timeoutMs?: number;
  },
): LoginHandler {
  return async ({ issuer, username, password }) => {
    const redirectUrl = new URL(opts.callbackPath, window.location.origin).toString();

    // Classic flow: full-page redirect to the issuer's hosted login form.
    if (!username) {
      await inruptLogin({
        oidcIssuer: issuer,
        redirectUrl,
        clientName: opts.clientName,
      });
      return;
    }

    // In-app flow — the issuer's login page is never shown:
    //  1. intercept the authorization URL instead of navigating,
    //  2. probe the credentials with a no-follow fetch (401 → inline error),
    //  3. re-POST into a sandboxed iframe to capture the callback URL the
    //     issuer answers with,
    //  4. hand that URL to handleIncomingRedirect — the session completes
    //     without a single page load.
    // NB: inrupt's login() promise intentionally never resolves (it assumes
    // the page navigates away) — so resolve on the handleRedirect callback.
    const authUrl = await new Promise<string>((resolve, reject) => {
      inruptLogin({
        oidcIssuer: issuer,
        redirectUrl,
        clientName: opts.clientName,
        handleRedirect: (url) => resolve(String(url)),
      }).catch(reject);
    });
    const u = new URL(authUrl);
    const endpoint = u.origin + u.pathname;
    const fields = new URLSearchParams(u.searchParams);
    fields.set("username", username);
    fields.set("password", password ?? "");

    let supported = false;
    try {
      const probe = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        credentials: "include",
        body: fields.toString(),
        redirect: "manual",
      });
      if (probe.status === 401) throw new InvalidCredentialsError();
      // A redirect (opaque to JS) is the issuer accepting the credentials.
      supported = probe.type === "opaqueredirect" || probe.ok;
    } catch (err) {
      if (err instanceof InvalidCredentialsError) throw err;
      supported = false; // network/CORS — issuer doesn't support this flow
    }

    if (supported) {
      try {
        const callbackUrl = await postViaIframe(
          endpoint,
          fields,
          opts.timeoutMs ?? 10_000,
        );
        if (new URL(callbackUrl).searchParams.has("code")) {
          if (opts.handleIncomingRedirect) {
            // inrupt rewrites the address bar to the callback URL via
            // replaceState — put the user's actual location back afterwards.
            const here = window.location.href;
            await opts.handleIncomingRedirect(callbackUrl);
            if (window.location.href !== here) {
              window.history.replaceState(null, "", here);
            }
          } else {
            window.location.assign(callbackUrl);
          }
          return;
        }
      } catch {
        /* fall through to the hosted form */
      }
    }

    // Issuer doesn't support direct credential POST — fall back to the
    // hosted login page (the classic redirect the user would have seen).
    window.location.assign(authUrl);
  };
}
