---
name: brandkit
description: Rebrand this OpenWork fork for a distributor (name, logo, accent, app id, deep-link scheme), lock the LLM providers, and hide the OpenWork Cloud / sign-in surfaces — WITHOUT committing edits into upstream-tracked files, so `git pull upstream` stays conflict-free. Use when the user says "brand kit", "rebrand the app", "apply our branding", "change the app name/logo/colors", "lock the provider", "hide the cloud/login", or "re-apply branding after pulling upstream".
---

# Brand kit

This repo ships a re-runnable brand kit. Its whole design goal: **the committed
branch diff is only *new* files** (`brand.config.json`, `brand.schema.json`,
`brand/`, `scripts/brandkit/`). All rebranding is applied to the **working tree
at build time** and reverted on demand — so pulling upstream never conflicts
with our changes.

## The workflow

```bash
# 1. edit the config + drop assets in brand/
#    (see brand.config.json — brand name, accentColor, appId, scheme, providers, cloud)

# 2. preview what will change (no writes):
node scripts/brandkit/apply.mjs --check

# 3. apply to the working tree, then build/package with the brand Vite config:
node scripts/brandkit/apply.mjs
cd apps/app && vite build --config vite.brandkit.config.mts && cd ../..
pnpm --filter @openwork/desktop package:electron

# 4. (optional) undo the working-tree edits — kit files stay:
node scripts/brandkit/apply.mjs --revert
```

## After pulling upstream

```bash
git pull upstream dev          # clean fast-forward — we never touched their files
node scripts/brandkit/apply.mjs --check
```

If `--check` reports **DRIFTED**, upstream moved an anchor a transform targets.
Open `scripts/brandkit/operations.mjs`, find the op by its `id` (printed in the
report), and update its `find`/`pattern`/`target` to the new anchor. Nothing is
corrupted — a drifted op simply does nothing until re-pinned.

## How it's structured

- `brand.config.json` — the only file a distributor edits.
- `scripts/brandkit/operations.mjs` — the declarative op list (built from config). **This is where anchors live.**
- `scripts/brandkit/lib/ops.mjs` — idempotent, drift-aware runners (`replaceAll`, `replaceString`, `injectBefore`, `overwriteAsset`, `writeFile`).
- `scripts/brandkit/apply.mjs` — orchestrator (`--check`, `--revert`).
- `scripts/brandkit/vite-reroute-plugin.mjs` — the **reroute** plugin: replaces a whole module with a brand-owned override at resolve time, without editing the target's source.

## Feature toggles

`brand.config.json` has a `features` block — one boolean per override group, all
defaulting to `true`:

`brandName` · `accentColor` · `assets` · `desktopIdentity` (appId/productName/
deep-link scheme) · `providers` (opencode.json + picker filter) ·
`welcomeOverride` (reroute) · `cloudHide` (master switch; `cloud.hide` must
also be true) · `language` (single-language variant; active only for a
non-English build).

Semantics: `apply.mjs` is a projection of the config onto the working tree.
A group toggled **off** is reported as `∅ off` and its footprint is *cleaned up*
on apply (tracked targets `git checkout`-ed, generated files removed) — targets
shared with an enabled group are re-applied right after, so flipping a toggle
never needs a manual revert. `--revert` always covers every group regardless of
toggles. `vite.brandkit.config.mts` is always generated (empty reroute map when
`welcomeOverride` is off) so the build command never changes.

The default config ships as **MiniWork** (`com.miniwork.app`, scheme
`miniwork`) with all toggles on and cloud hidden — i.e. all OpenWork-brand
surfaces replaced/hidden out of the box.

## Language variants (en / zh from one checkout)

`language.default` in the config (or the `BRANDKIT_LANG` env var, which wins)
picks the build's language. Any non-`en` value produces a **hard-locked**
single-language edition: that locale is forced on every launch and the
Appearance language switcher is hidden. `en` (the default) is the normal
multi-language app. The lang ops are always in the op list, so an English
apply automatically cleans up a previous variant's edits — alternate freely:

```bash
node scripts/brandkit/apply.mjs                    # English build
BRANDKIT_LANG=zh node scripts/brandkit/apply.mjs   # Chinese build (locked)
```

`apply.mjs` also patches `apps/app/package.json`'s `build` script to use
`vite.brandkit.config.mts`, so `pnpm --filter @openwork/desktop
package:electron` picks up the reroute overrides in packaged builds.

## Three levels of touch

1. **Config** — no file touched (`requireSignin`, `opencode.json`).
2. **Patch / modify** — small drift-aware working-tree edit at a verified anchor (brand name, `electron-builder.yml`).
3. **Reroute** — swap a whole module for a brand override (the welcome page). The original source stays byte-for-byte unchanged; `apply.mjs` generates `brand/overrides/<name>.tsx` + `apps/app/vite.brandkit.config.mts`. Run dev/build with `vite --config vite.brandkit.config.mts` from `apps/app`.

**Generated files are ad-hoc, never committed.** `apply.mjs` produces `opencode.json`, `apps/app/vite.brandkit.config.mts`, and `brand/overrides/*.tsx` and registers them in `.git/info/exclude` — so they can't be committed by accident and `git pull upstream` never collides with them. Only kit *source* is committed. Always run `apply.mjs` before building.

The welcome page (hero copy, steps, feature cards, `showSignIn`) is customized via the `welcome` block in `brand.config.json` — no source edit.

## Statuses in the report

`applied` (changed) · `already` (no-op) · `drifted` (anchor gone — fix the op) ·
`skipped` (optional asset missing) · `pending` (anchor not yet wired) ·
`error` (unexpected).

## Known pending ops (wire when needed)

- `cloud:sidebar-workers` — hide the "Add a worker / Connect remote" entry in
  `apps/app/src/react-app/domains/session/sidebar/app-sidebar.tsx`. Not a
  security gap (remote workers need Den sign-in, which is disabled), just polish.
  Careful: "workspace" also means local folders — scope the anchor to the
  *remote/connect* action only.
- `providers:ui-filter` — filter the model picker in
  `apps/app/src/components/model-select.tsx` to `providers.allowed`. `opencode.json`
  already sets the default model; this op is about hiding the other 50+ providers
  from the picker UI.

## Rules

- Never hand-edit an upstream-tracked file and commit it. If a new surface needs
  rebranding, add an **op** in `operations.mjs`, don't commit the edit.
- Prefer newline-free regex anchors (this repo has CRLF files; a literal `\n` in
  an anchor won't match `\r\n`).
- Keep anchors minimal and unique so upstream churn rarely breaks them.
