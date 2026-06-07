# @mind-studio/core — agent notes

## Publishing a new version (IMPORTANT)

The package is published to **GitHub Packages** (`npm.pkg.github.com`) by CI, not
from a laptop. The flow:

1. Bump `version` in `package.json` (commit it).
2. Push to `main`.
3. **Create a GitHub Release whose tag matches the version** — e.g.
   `gh release create v0.2.0 --title "…" --notes "…"`.
   This triggers `.github/workflows/publish.yml`, which builds and runs
   `npm publish` using CI's `GITHUB_TOKEN` (it has `packages: write`).
   `workflow_dispatch` works too: `gh workflow run publish.yml`.

Watch it: `gh run watch --workflow=publish.yml` (or `gh run list`).

### Gotchas
- **A plain push to `main` does NOT publish.** Push only runs CI build + the
  Storybook → Pages deploy. Only a Release (or manual dispatch) publishes.
- **Local `npm publish` needs a PAT with `write:packages`.** The usual
  `gh auth token` only has `read:packages` → publish fails with `E403 … token
  does not match expected scopes`. So prefer the Release route; for a local
  publish, `gh auth refresh -h github.com -s write:packages` first, then
  `NODE_AUTH_TOKEN="$(gh auth token)" npm publish`.
- `.npmrc` reads the token from `${NODE_AUTH_TOKEN}`.
- Consumers pin `@mind-studio/core` from this registry via their own `.npmrc`.

## Entry points
`.` (login card + pod logic), `./apps`, `./launcher`, `./feedback`,
`./login-card.css`. See `package.json` `exports`.

## Commits & releases

Use [Conventional Commits](https://www.conventionalcommits.org) on `main`
(`fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE:` → major). Releases,
tags, and `CHANGELOG.md` are automated by **release-please** — never tag manually
or hand-edit `CHANGELOG.md`. To cut a release, merge the open
"chore(main): release X.Y.Z" PR. See the README's Releases section.
