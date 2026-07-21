# Brand assets

New brands live under [`../brands/`](../brands/). Each brand folder contains a
`brand.json` and one canonical `logo.svg`; the build derives the favicon and
desktop icon formats automatically.

```text
brands/
  my-brand/
    brand.json
    logo.svg
```

Shared locale overlays remain in this directory under `i18n/`. The files that
the apply step writes into `apps/` and `apps/desktop/` are generated working
tree files and are never committed.

See [`docs/brand-kit.md`](../docs/brand-kit.md) for the config contract,
feature hiding, local commands, and CI discovery behavior.
