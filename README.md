# @mind-studio/core

Shared core for the Mind prototypes. One visual language across every app; each app keeps its own session model. Verified end-to-end against the production pod (`codespaces-pod.duckdns.org`) — one credential entry, recognized across all sibling apps.

Three entry points:

| Import | Needs | What it is |
|---|---|---|
| `@mind-studio/core` | `react` | The `MindLoginCard` + identity-hint helpers. Transport-agnostic — no pod or `@mind-studio/ui` dep. |
| `@mind-studio/core/apps` | `@inrupt/solid-client` | `AppEntry`, `DEFAULT_APPS`, and `readApps`/`writeApps`/`ensureSeeded` over `{pod}/home/apps.ttl`. React-free. |
| `@mind-studio/core/launcher` | `@mind-studio/ui`, `react` | `<MindAppLauncher>` — the Google-style 3×3 app-grid dropdown. |

`@inrupt/solid-client` and `@mind-studio/ui` are **optional** peer deps — a consumer that only imports `@mind-studio/core` (the login card) needs neither.

## Two consumption modes

- **Published apps** (home, builder, drive, codespaces) depend on the **GitHub Packages** release:
  `@mind-studio/core@^0.1.0` via a scoped `.npmrc` (see "Publishing" below).
- **Local prototypes** in this workspace keep using the **committed tarball** (`./scripts/sync.sh`)
  so a single edit propagates without a publish round-trip.

## Publishing (GitHub Packages, maintainers)

```bash
npm run build
npm version <patch|minor|major>
npm publish            # publishConfig → npm.pkg.github.com, links to MIND-Studio/core
```

Needs a token with `write:packages` (`gh auth refresh -s write:packages,read:packages`).
Publish `@mind-studio/ui` **before** `@mind-studio/core` (core peer-depends on it), and both
before the apps' `npm install`. Consumers authenticate with a `read:packages` PAT as `NODE_AUTH_TOKEN`.

## Why a tarball, not `file:..`

Next.js 16's Turbopack rejects symlinks whose target sits outside the consumer's project root (`FileSystemPath("") … leaves the filesystem root`). `file:../mind-shared-ui` creates exactly such a symlink, so we ship a packed tarball instead — a real directory under each consumer's `node_modules/@mind-studio/core/`, no symlink, no panic.

`mind-studio-core-0.1.0.tgz` is checked into the repo so fresh clones work without a build step.

## Consumption

In a sibling prototype's `package.json`:

```json
{
  "dependencies": {
    "@mind-studio/core": "file:../mind-shared-ui/mind-studio-core-0.1.0.tgz"
  }
}
```

In `next.config.ts`:

```ts
transpilePackages: ["@mind-studio/core"];
```

That's it. No Tailwind `@source` directive — the package ships its own plain CSS that `MindLoginCard` imports automatically. (`@mind-studio/core/launcher` styles via `@mind-studio/ui` + the consumer's Tailwind build.)

## The app launcher

```tsx
"use client";
import { MindAppLauncher } from "@mind-studio/core/launcher";

// Self-fetching: reads (and seeds on first run) {pod}/home/apps.ttl.
<MindAppLauncher podRoot={podRoot} podFetch={solidFetch} manageHref="/home" />

// Controlled: render an explicit list, no pod read.
<MindAppLauncher apps={apps} />
```

The dropdown is a read-only quick switcher (tiles open in a new tab); editing the list stays in the owning app. Pod I/O lives in `@mind-studio/core/apps` and can be used on its own for a full-page launcher.

## Iterating on the shared card

```bash
cd mind-shared-ui
./scripts/sync.sh
```

`sync.sh` builds (`tsc`), packs (`npm pack`), and reinstalls into every sibling prototype that declares `@mind-studio/core` as a dep. Auto-discovers consumers by grepping each prototype's `package.json`.

## Usage — browser-side OIDC

For the six prototypes that drive Inrupt's browser SDK directly:

```tsx
"use client";
import { MindLoginCard, browserOidcLogin } from "@mind-studio/core";
import { login } from "@inrupt/solid-client-authn-browser";

const handleLogin = browserOidcLogin(login, {
  callbackPath: "/login/callback",
  clientName: "Mind Drive",
});

<MindLoginCard
  appName="Drive"
  defaultIssuer={process.env.NEXT_PUBLIC_SOLID_ISSUER ?? "https://codespaces-pod.duckdns.org/"}
  accent="#2f5fa6"
  onLogin={handleLogin}
/>;
```

## Usage — server-side / custom flow

For prototypes whose login is a Next.js route handler (`mind-agents-v0` POSTs to `/api/connect`, `mind-codespaces-v0` POSTs to `/api/auth/start`):

```tsx
<MindLoginCard
  appName="Agents"
  defaultIssuer={POD_BASE_URL}
  accent="#9a4421"
  allowCustomIssuer={false}
  onLogin={async ({ issuer }) => {
    const res = await fetch("/api/auth/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oidcIssuer: issuer }),
    });
    const { redirectUrl } = await res.json();
    window.location.href = redirectUrl;
  }}
/>
```

## Identity hint — "Continue as Alice"

On successful login, write the identity so the next visit to this app shows the personalized state. Clear it on logout.

```ts
import { writeLastIdentity, clearLastIdentity } from "@mind-studio/core";

const APP_NAME = "Drive";

// after handleIncomingRedirect resolves with a WebID
writeLastIdentity(APP_NAME, {
  webId,
  displayName: webid.split("/").filter(Boolean).pop(),
});

// in the logout handler
clearLastIdentity(APP_NAME);
```

Each app has its own storage key (`mind:<app-name>:last-identity`) — there is no cross-origin sharing. Cross-app SSO is provided by the OIDC IdP recognizing its session cookie on subsequent redirects, not by any client-side mechanism.

## Props reference

| Prop | Type | Required | Notes |
|---|---|---|---|
| `appName` | `string` | ✓ | "Drive", "Chat", "OS" — appears below the "MIND" kicker |
| `defaultIssuer` | `string` | ✓ | The OIDC issuer to use if the user doesn't pick a custom one |
| `onLogin` | `(args: { issuer }) => Promise<void>` | ✓ | What to do when the button is clicked — usually `browserOidcLogin(...)` or a fetch to your own route |
| `accent` | `string` | | CSS color; defaults to indigo (`#6366f1`). See "Accents across the Mind ecosystem" below |
| `allowCustomIssuer` | `boolean` | | Show the "Use a different pod" disclosure. Default `true`. Set `false` when the prototype has no choice (e.g. `mind-agents-v0` dev mode) |
| `tagline` | `string` | | Overrides "Sign in once. Use everywhere." |
| `trustLine` | `string` | | Overrides the default "Your identity lives in your pod…" copy |
| `needsReauth` | `boolean` | | Shows "Reconnect" instead of "Continue with Mind" + an amber warning. For the known DPoP-state-loss case |
| `lastIdentity` | `Identity \| null` | | Override the localStorage hint (useful for SSR or test fixtures) |
| `logoLetter` | `string` | | Single letter shown in the avatar tile. Defaults to "M" |

## Accents across the Mind ecosystem

| Prototype | Accent | Hex |
|---|---|---|
| mind-os-v0 | phosphor green | `#1f8a52` |
| mind-drive-v0 | blue | `#2f5fa6` |
| mind-social-network-v0 | indigo | `#5a52d4` |
| mind-codespaces-ide-v0 | purple | `#6e3aff` |
| mind-codespaces-v0 | orange | `#c66c1f` |
| mind-chat-v0 | cyan | `#0891b2` |
| mind-market-v0 | red | `#c43f1c` |
| mind-agents-v0 | rust | `#9a4421` |
| mind-todo-v0 | rose | `#db2777` |

When adding a new sibling, pick an accent that's distinct from the nine above so users learn the visual identity. The card's other tokens (background, text, divider) come from CSS variables and adapt to `prefers-color-scheme`.
