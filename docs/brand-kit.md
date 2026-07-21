# Brand kit

The brand kit is a build-time layer for creating branded OpenWork editions.
Brand source files are additive and live outside the upstream app sources, so
the rebrand can be reapplied after an upstream update.

## Add a brand

Create one folder with one config and one canonical image:

```text
brands/
  _defaults.json             # optional shared defaults
  my-brand/
    brand.json
    logo.svg
```

`brand.json` is merged on top of `brands/_defaults.json`. Its `id` must match
the folder name because CI uses that stable id for matrix entries and artifact
names. Omitted values use brand-kit defaults. The image can be SVG, PNG, or
JPEG; the build generates the web favicon and desktop PNG/ICO/ICNS files in the
disposable `.brandkit/` directory.

Minimal definition:

```json
{
  "$schema": "../../brand.schema.json",
  "id": "my-brand",
  "brand": {
    "name": "My Brand",
    "accentColor": "teal",
    "image": "logo.svg"
  },
  "desktop": {
    "appId": "com.example.mybrand",
    "deepLinkScheme": "mybrand"
  }
}
```

The config may also override providers, welcome copy, language, updater feed,
and feature groups. `extends` is available for an ad-hoc variant:

```json
{
  "$schema": "../../brand.schema.json",
  "id": "my-brand-zh",
  "extends": "../my-brand/brand.json",
  "language": { "default": "zh" }
}
```

## Feature hiding

Feature groups are per-brand. Every group defaults to enabled; set a group to
`false` in that brand's `brand.json` to leave that surface stock:

```json
{
  "features": {
    "cloudHide": true,
    "trim": true,
    "providers": true,
    "welcomeOverride": true
  },
  "cloud": {
    "hide": true
  }
}
```

`trim` currently hides remote actions, Marketplace, Docs, Feedback, and the
extra settings tabs. `cloudHide` is effective only when `cloud.hide` is also
`true`. The detailed source-file operations remain internal to the engine.

## Commands

```bash
pnpm brandkit:list                         # discovered brand ids as JSON
BRANDKIT_BRAND=clinicwork pnpm brandkit:check
BRANDKIT_BRAND=clinicwork pnpm brandkit:apply
BRANDKIT_BRAND=clinicwork BRANDKIT_LANG=zh pnpm brandkit:apply
pnpm build
```

PowerShell:

```powershell
$env:BRANDKIT_BRAND = "clinicwork"
$env:BRANDKIT_LANG = "zh"
pnpm brandkit:apply
```

`BRANDKIT_CONFIG` remains available for a one-off config path. Use
`pnpm brandkit:revert` to restore the working tree after a local apply.

## CI

The branded release workflow first runs `scripts/brandkit/list.mjs` and uses
the result as the brand matrix. Each platform/brand/language job starts from a
clean checkout, selects `BRANDKIT_BRAND`, applies the config, and packages its
own artifact. Adding a brand does not require editing the workflow.
