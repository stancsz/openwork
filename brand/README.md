# Brand assets

Drop your distributor brand assets here, then run `node scripts/brandkit/apply.mjs`.
Paths are configured in [`../brand.config.json`](../brand.config.json) under `brand.assets`.

Any file that is missing is **skipped with a warning** — a first run still succeeds,
you just keep the OpenWork default for that asset until you provide your own.

| Config key         | Drop file here            | Overwrites (at build time)                     |
| ------------------ | ------------------------- | ---------------------------------------------- |
| `mark`             | `brand/mark.svg`          | `apps/app/public/openwork-mark.svg`            |
| `logo`             | `brand/logo.svg`          | `apps/app/public/openwork-logo.svg`            |
| `logoSquare`       | `brand/logo-square.svg`   | `apps/app/public/openwork-logo-square.svg`     |
| `favicon32`        | `brand/favicon-32x32.png` | `apps/app/public/favicon-32x32.png`            |
| `favicon16`        | `brand/favicon-16x16.png` | `apps/app/public/favicon-16x16.png`            |
| `appleTouchIcon`   | `brand/apple-touch-icon.png` | `apps/app/public/apple-touch-icon.png`      |
| `desktopIconPng`   | `brand/icon.png`          | `apps/desktop/resources/icons/icon.png`        |
| `desktopIconIco`   | `brand/icon.ico`          | `apps/desktop/resources/icons/icon.ico`        |
| `desktopIconIcns`  | `brand/icon.icns`         | `apps/desktop/resources/icons/icon.icns`       |

These overwrite files **in the working tree only** — they are never committed, so
`git pull upstream` stays conflict-free.
