# Brand kit — rebranding OpenWork

A re-runnable kit for turning this OpenWork checkout into a distributor-branded
app with locked LLM providers and no OpenWork Cloud / sign-in — designed so you
can **keep pulling upstream without resolving conflicts**.

## The core idea

Everything a distributor owns lives in **new files**:

```
brand.config.json      the one file you edit
brand.schema.json      JSON schema (autocomplete + validation)
brand/                 your logo / icons
scripts/brandkit/      the apply engine + operations
```

Nothing above modifies an upstream-tracked file. The rebrand is applied to the
**working tree at build time** by `scripts/brandkit/apply.mjs`, and can be
reverted with `--revert`. Because our commits never touch upstream's files,
`git pull upstream` is a clean fast-forward — no conflicts, ever, on the pull.

### Committed vs generated (ad-hoc)

Only **kit source** is committed (the files above). Everything `apply.mjs`
*produces* — `opencode.json`, `apps/app/vite.brandkit.config.mts`, and
`apps/app/src/brandkit-generated/*.tsx` — is **generated on the fly and never committed**.
`apply.mjs` registers those paths in `.git/info/exclude` (a local, untracked
ignore), which means they can't be committed by accident **and** `git pull
upstream` can never collide with them — even if upstream later adds its own
`opencode.json`, git treats an ignored file as disposable. Zero collision surface.

> The one honest caveat: if upstream *restructures a file one of our transforms
> targets*, that transform reports **DRIFTED** at build time. The pull is still
> clean; you just re-pin one anchor in `operations.mjs`. Conflict surface is a
> handful of well-chosen anchors, not the whole tree.

## Quick start

1. Edit `brand.config.json`:
   - `brand.name` — product name (replaces the standalone word "OpenWork").
   - `brand.accentColor` — a Radix color family (e.g. `iris`, `blue`, `jade`).
   - `brand.assets.*` — paths under `brand/` for your logo/icons (missing ones are skipped).
   - `desktop.appId` / `desktop.deepLinkScheme` — packaged bundle id + URL scheme.
   - `providers.allowed` / `providers.default` — which LLM providers, and the default model. **End users still enter their own API key.**
   - `cloud.hide` — hide OpenWork Cloud / Den surfaces (default `true`).
2. Drop your assets in `brand/` (see `brand/README.md`).
3. Preview: `node scripts/brandkit/apply.mjs --check`
4. Apply + build:
   ```bash
   node scripts/brandkit/apply.mjs
   pnpm build:ui
   pnpm --filter @openwork/desktop package:electron
   ```

## What each concern maps to

| Concern | Mechanism | Op id(s) |
| --- | --- | --- |
| Product name (title, packaged name, UI copy) | case-sensitive `\bOpenWork\b` → brand name across `index.html`, `electron/main.mjs`, every `i18n/locales/*.ts` | `brand-name:*` |
| Accent color | one-token fallback in `brand-theme.tsx` so the existing `BrandThemeEffect` applies it with no cloud | `brand-accent` |
| Logo / icons | overwrite the existing asset files in place (paths in code stay) | `asset:*` |
| Packaged identity | `electron-builder.yml` appId / productName / scheme | `pkg:appId`, `pkg:productName`, `pkg:scheme` |
| Deep-link scheme (runtime) | `openwork://` → `<scheme>://` in `electron/main.mjs` | `runtime:scheme` |
| Default model | generated root `opencode.json` | `providers:opencode-json` |
| Sign-in / login gate | **already off by default** — `requireSignin` in `desktop-bootstrap.json` defaults to `false`, so [`DenSigninGate`](../apps/app/src/react-app/shell/app-root.tsx) sends users straight to `/session` | (config, no op) |
| Cloud settings surface | `getCloudSettingsTabs()` → `[]` in `settings-page.tsx` | `cloud:settings-tabs` |

## Still pending (wire when you need them)

- `cloud:sidebar-workers` — hide the remote-worker / "Connect remote" entry in
  `app-sidebar.tsx`. Not a security gap (remote workers require Den sign-in,
  which is disabled), just visual polish. Scope the anchor to the *remote/connect*
  action — "workspace" also means local folders.
- `providers:ui-filter` — filter the model picker in `model-select.tsx` to
  `providers.allowed` so only your chosen provider(s) appear.

## Three ways the kit changes things

The kit deliberately supports a spectrum, from lightest to heaviest touch:

1. **Config** — no file touched (e.g. `requireSignin`, generated `opencode.json`).
2. **Patch / modify** — a small, drift-aware working-tree edit at a verified anchor
   (e.g. brand name, `electron-builder.yml`). Reverted by `--revert`.
3. **Reroute** — replace a *whole module* with a brand-owned override **without
   editing the target's source**. Used for the welcome page.

## Reroute — customizing a whole surface without editing its source

String-patching a component's internals is fragile against upstream. Instead, the
kit **reroutes** the module: a Vite resolver plugin
([`scripts/brandkit/vite-reroute-plugin.mjs`](../scripts/brandkit/vite-reroute-plugin.mjs))
intercepts the import and serves a brand-owned file instead. The original
`welcome-page.tsx` is **never modified** (verify with `git diff` — it's clean).

How it's wired:

- `brand.config.json` → `welcome` block (steps, feature cards, showcase title, `showSignIn`).
- `apply.mjs` generates `apps/app/src/brandkit-generated/welcome-page.tsx` from that config.
- `apply.mjs` generates `apps/app/vite.brandkit.config.mts` — an **additive** file
  (the app's own `vite.config.ts` is untouched) that loads the real config and
  registers the reroute plugin.
- You run dev/build with that config:

  ```bash
  cd apps/app
  vite --config vite.brandkit.config.mts          # dev
  vite build --config vite.brandkit.config.mts     # production build
  ```

To reroute another surface, add its target→override pair to the `overrides` map in
the generated Vite config (or extend the generator in `operations.mjs`). To take
full manual control of the welcome page, stop editing `brand.config.json` and edit
`apps/app/src/brandkit-generated/welcome-page.tsx` directly (but note `apply.mjs` regenerates it).

## Adding a new rebranding rule

Don't hand-edit and commit a tracked file. Instead add an operation to
`scripts/brandkit/operations.mjs`:

```js
{
  id: "my-thing",
  type: "replaceString",           // or replaceAll / injectBefore / overwriteAsset / writeFile
  target: "path/to/tracked/file",
  find: "exact anchor",
  replace: "branded value",
}
```

Prefer newline-free regex anchors — this repo has CRLF files, so a literal `\n`
in an anchor won't match `\r\n`.

## Commands

```bash
node scripts/brandkit/apply.mjs           # apply to working tree
node scripts/brandkit/apply.mjs --check   # dry-run report (CI-friendly: exits 1 on drift)
node scripts/brandkit/apply.mjs --revert  # undo working-tree edits (kit files stay)
```
