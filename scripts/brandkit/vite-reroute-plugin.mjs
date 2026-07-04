// Brand kit "reroute" — a Vite resolver plugin that redirects specific module
// imports to brand-owned override files, WITHOUT modifying the original source.
//
// This is how the brand kit customizes a whole surface (e.g. the welcome page)
// durably: instead of string-patching a component's internals (fragile against
// upstream), we intercept module resolution and serve the distributor's version.
//
// `overrides` maps an absolute TARGET module path -> absolute OVERRIDE file path.

import { dirname, resolve, extname } from "node:path";

const EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs"];

/** Candidate absolute paths a bare (extensionless) import could resolve to. */
function candidates(base) {
  if (extname(base)) return [base];
  return [
    base,
    ...EXTS.map((e) => base + e),
    ...EXTS.map((e) => resolve(base, `index${e}`)),
  ];
}

export function brandkitReroute({ overrides = {} } = {}) {
  const map = new Map(Object.entries(overrides).map(([k, v]) => [resolve(k), resolve(v)]));
  const overrideFiles = new Set(map.values());

  return {
    name: "brandkit-reroute",
    // Run before Vite's default resolver so we win for mapped modules.
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || map.size === 0) return null;
      // Never reroute an override importing itself or a sibling.
      if (overrideFiles.has(resolve(importer))) return null;
      // Only relative/absolute imports can match a file target.
      if (!source.startsWith(".") && !source.startsWith("/")) return null;

      const base = resolve(dirname(importer), source);
      for (const cand of candidates(base)) {
        const override = map.get(cand);
        if (override) return override;
      }
      return null;
    },
  };
}
