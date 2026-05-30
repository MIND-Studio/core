import type { LoginHandler } from "./types";

type InruptLoginFn = (options: {
  oidcIssuer: string;
  redirectUrl: string;
  clientName: string;
}) => Promise<unknown>;

export function browserOidcLogin(
  inruptLogin: InruptLoginFn,
  opts: { callbackPath: string; clientName: string },
): LoginHandler {
  return async ({ issuer }) => {
    const redirectUrl = new URL(opts.callbackPath, window.location.origin).toString();
    await inruptLogin({
      oidcIssuer: issuer,
      redirectUrl,
      clientName: opts.clientName,
    });
  };
}
