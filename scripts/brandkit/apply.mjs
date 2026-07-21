#!/usr/bin/env node
// Brand kit apply engine.
//
//   node scripts/brandkit/apply.mjs           apply branding to the working tree
//   node scripts/brandkit/apply.mjs --check    report what WOULD change (no tracked writes)
//   node scripts/brandkit/apply.mjs --revert    undo (git checkout tracked files + rm generated)
//
// Run this AFTER `git pull` and BEFORE building. It is idempotent: safe to run
// repeatedly. Because it only touches the working tree (never commits into
// upstream files), pulling upstream stays conflict-free.

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { loadConfig, REPO_ROOT } from "./lib/config.mjs";
import { prepareBrandAssets } from "./lib/assets.mjs";
import { buildOperations, enabledFeatures } from "./operations.mjs";
import { runOperation, trackedTargets } from "./lib/ops.mjs";

const args = new Set(process.argv.slice(2));
const CHECK = args.has("--check") || args.has("--dry-run");
const REVERT = args.has("--revert");

const GLYPH = {
  applied: "✓ applied ",
  already: "• already ",
  drifted: "⚠ DRIFTED ",
  skipped: "↷ skipped ",
  pending: "⧗ pending ",
  off: "∅ off     ",
  error: "✗ ERROR   ",
};

async function main() {
  const config = loadConfig();
  const operations = buildOperations(config);

  // --revert always covers every op, toggles included, so it cleans a tree
  // that was applied under a different features config.
  if (REVERT) return revert(operations, config);

  const features = enabledFeatures(config);
  const assetReport = features.assets && config.brand.image
    ? await prepareBrandAssets(config)
    : null;
  const enabledOps = operations.filter((op) => features[op.feature] !== false);
  const disabledOps = operations.filter((op) => features[op.feature] === false);

  // Generated files are ad-hoc: never committed. Registering them in
  // .git/info/exclude (local, not tracked) means they can't be accidentally
  // committed AND git treats them as disposable, so `git pull upstream` never
  // collides even if upstream later adds a file at the same path (e.g. opencode.json).
  if (!CHECK) {
    const added = ensureGitExcludes(operations);
    if (added.length) {
      console.log(`Registered ${added.length} generated path(s) in .git/info/exclude (ad-hoc, never committed).`);
    }
  }

  console.log(
    `\nBrand kit: ${config.brand.name}  (accent: ${config.brand.accentColor}, ` +
      `scheme: ${config.desktop.deepLinkScheme}, cloud: ${features.cloudHide ? "hidden" : "shown"})`,
  );
  const off = Object.entries(features).filter(([, on]) => !on).map(([name]) => name);
  if (off.length) console.log(`Features off: ${off.join(", ")}`);
  console.log(CHECK ? "Mode: CHECK (no tracked files written)\n" : "Mode: APPLY\n");

  // Disabled groups are cleaned up BEFORE enabled ops run: a shared target
  // (e.g. electron/main.mjs, touched by both brandName and desktopIdentity)
  // is checked out fresh, then the still-enabled ops re-apply their edits.
  if (!CHECK) cleanupDisabled(disabledOps);
  const offResults = disabledOps.map((op) => ({
    status: "off",
    id: op.id,
    detail: `features.${op.feature} = false`,
  }));

  const results = [
    ...(assetReport
      ? [{
          status: assetReport.changed > 0 ? "applied" : "already",
          id: "asset:derived",
          detail: `${assetReport.changed} derived file(s) ${CHECK ? "would be refreshed" : "refreshed"}`,
        }]
      : []),
    ...offResults,
    ...enabledOps.map((op) => runOperation(op, { apply: !CHECK })),
  ];

  const counts = {};
  for (const r of results) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    const detail = r.detail ? `  — ${r.detail}` : "";
    console.log(`  ${GLYPH[r.status] ?? r.status} ${r.id}${detail}`);
  }

  const summary = Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");
  console.log(`\nSummary: ${summary}`);

  const drifted = results.filter((r) => r.status === "drifted");
  const errored = results.filter((r) => r.status === "error");
  if (drifted.length || errored.length) {
    console.log(
      `\n${drifted.length} drifted, ${errored.length} errored. An upstream change ` +
        `likely moved an anchor — update the matching op in scripts/brandkit/operations.mjs.`,
    );
    process.exit(1);
  }
  const pending = results.filter((r) => r.status === "pending");
  if (pending.length) {
    console.log(`\n${pending.length} pending op(s) still need an anchor wired (see notes above).`);
  }
}

/**
 * Ensure every generated (writeFile) target is listed in .git/info/exclude so
 * it's ignored locally: never committed, and never a merge collision on pull.
 * Returns the paths newly added. Uses `git rev-parse` so it also works in
 * worktrees. Silently no-ops outside a git repo.
 */
function ensureGitExcludes(operations) {
  let excludePath;
  try {
    const rel = execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], {
      cwd: REPO_ROOT,
    }).toString().trim();
    excludePath = resolve(REPO_ROOT, rel);
  } catch {
    return [];
  }

  const wanted = operations
    .filter((op) => op.type === "writeFile" && op.target)
    .map((op) => `/${op.target}`);

  let current = "";
  try {
    current = readFileSync(excludePath, "utf8");
  } catch {
    // exclude file may not exist yet; append will create it
  }
  const present = new Set(current.split(/\r?\n/).map((l) => l.trim()));
  const toAdd = wanted.filter((line) => !present.has(line));
  if (toAdd.length === 0) return [];

  const header = current.includes("# brandkit (generated, ad-hoc)")
    ? ""
    : "\n# brandkit (generated, ad-hoc — never committed)\n";
  appendFileSync(excludePath, `${header}${toAdd.join("\n")}\n`);
  return toAdd;
}

/**
 * Undo a disabled feature group's footprint: git-checkout its tracked targets
 * and delete its generated files. Enabled ops run after this and re-apply
 * their own edits, so a target shared with an enabled group ends up correct.
 */
function cleanupDisabled(operations) {
  if (operations.length === 0) return;
  const tracked = trackedTargets(operations).filter((p) => existsSync(resolve(REPO_ROOT, p)));
  if (tracked.length) {
    execFileSync("git", ["checkout", "--", ...tracked], { cwd: REPO_ROOT, stdio: "inherit" });
  }
  for (const op of operations) {
    if (op.type !== "writeFile" || !op.target) continue;
    const file = resolve(REPO_ROOT, op.target);
    if (existsSync(file)) rmSync(file);
  }
}

function revert(operations, config) {
  const tracked = trackedTargets(operations).filter((p) => existsSync(resolve(REPO_ROOT, p)));
  if (tracked.length) {
    console.log(`Reverting ${tracked.length} tracked file(s) via git checkout…`);
    execFileSync("git", ["checkout", "--", ...tracked], { cwd: REPO_ROOT, stdio: "inherit" });
  }
  const generated = operations
    .filter((op) => op.type === "writeFile" && op.target)
    .map((op) => resolve(REPO_ROOT, op.target));
  for (const file of generated) {
    if (existsSync(file)) {
      rmSync(file);
      console.log(`Removed generated ${file}`);
    }
  }
  const derivedAssets = resolve(REPO_ROOT, ".brandkit", config.id);
  if (existsSync(derivedAssets)) {
    rmSync(derivedAssets, { recursive: true, force: true });
    console.log(`Removed generated ${derivedAssets}`);
  }
  console.log("Revert complete.");
}

main().catch((error) => {
  console.error(`\nBrand kit failed: ${error.message}`);
  process.exitCode = 1;
});
