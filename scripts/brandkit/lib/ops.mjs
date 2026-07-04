// Operation runners for the brand kit apply engine.
//
// Every operation is designed to be IDEMPOTENT and DRIFT-AWARE. Re-running is
// safe, and if upstream has moved an anchor out from under us, the op reports
// `drifted` instead of corrupting the file. Statuses:
//
//   applied  — we just changed the working tree
//   already  — the change was already present (no-op)
//   drifted  — the anchor/target we expected is gone (upstream changed it)
//   skipped  — a `when`/optional source meant we intentionally did nothing
//   error    — something unexpected

import {
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  mkdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { REPO_ROOT } from "./config.mjs";

const abs = (p) => resolve(REPO_ROOT, p);
const read = (p) => readFileSync(abs(p), "utf8");
const write = (p, s) => writeFileSync(abs(p), s);

function result(status, op, detail) {
  return { status, id: op.id, target: op.target, detail: detail ?? "" };
}

/**
 * Overwrite an existing asset file with the distributor's version.
 * Skips (with a warning) when the source is missing so a first run still works.
 * Idempotent by content comparison.
 */
function runOverwriteAsset(op, { apply }) {
  if (!op.source) return result("skipped", op, "no source configured");
  if (!existsSync(abs(op.source))) {
    return result("skipped", op, `source missing: ${op.source}`);
  }
  if (!existsSync(abs(op.target))) {
    return result("drifted", op, `target no longer exists: ${op.target}`);
  }
  const src = readFileSync(abs(op.source));
  const dst = readFileSync(abs(op.target));
  if (src.equals(dst)) return result("already", op);
  if (apply) copyFileSync(abs(op.source), abs(op.target));
  return result("applied", op, `${op.source} -> ${op.target}`);
}

/**
 * Regex replace-all within a file. Idempotent via a "signature": if the
 * replacement text is already present and the pattern no longer matches, it's
 * `already`. If neither matches, it's `drifted`.
 */
function runReplaceAll(op, { apply }) {
  if (!existsSync(abs(op.target))) return result("drifted", op, "file missing");
  const before = read(op.target);
  const re = new RegExp(op.pattern, op.flags ?? "g");
  const matches = before.match(re);
  if (matches && matches.length > 0) {
    if (apply) write(op.target, before.replace(re, op.replace));
    return result("applied", op, `${matches.length} match(es)`);
  }
  // No matches: either already applied or the anchor is gone.
  if (op.signature && before.includes(op.signature)) return result("already", op);
  return result("drifted", op, "no matches and no signature — anchor moved?");
}

/**
 * Replace a single exact string. Reports `drifted` if the anchor is absent and
 * the replacement isn't already there.
 */
function runReplaceString(op, { apply }) {
  if (!existsSync(abs(op.target))) return result("drifted", op, "file missing");
  const before = read(op.target);
  if (before.includes(op.replace) && !before.includes(op.find)) {
    return result("already", op);
  }
  if (!before.includes(op.find)) {
    return result("drifted", op, `anchor not found: ${truncate(op.find)}`);
  }
  if (apply) write(op.target, before.split(op.find).join(op.replace));
  return result("applied", op);
}

/**
 * Insert a block immediately before an anchor, guarded by a marker so re-runs
 * never duplicate it.
 */
function runInjectBefore(op, { apply }) {
  if (!existsSync(abs(op.target))) return result("drifted", op, "file missing");
  const before = read(op.target);
  if (before.includes(op.marker)) return result("already", op);
  if (!before.includes(op.anchor)) {
    return result("drifted", op, `anchor not found: ${truncate(op.anchor)}`);
  }
  if (apply) write(op.target, before.replace(op.anchor, `${op.block}${op.anchor}`));
  return result("applied", op);
}

/** Write (or overwrite) a generated, non-tracked config file. Always safe. */
function runWriteFile(op, { apply }) {
  const target = abs(op.target);
  if (existsSync(target) && read(op.target) === op.content) {
    return result("already", op);
  }
  if (apply) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, op.content);
  }
  return result("applied", op);
}

function truncate(s, n = 60) {
  const one = String(s).replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
}

const RUNNERS = {
  overwriteAsset: runOverwriteAsset,
  replaceAll: runReplaceAll,
  replaceString: runReplaceString,
  injectBefore: runInjectBefore,
  writeFile: runWriteFile,
};

/** Run one operation. `apply=false` = dry-run (report only). */
export function runOperation(op, { apply }) {
  if (op.pending) {
    return result("pending", op, op.note ?? "not yet implemented");
  }
  const runner = RUNNERS[op.type];
  if (!runner) return result("error", op, `unknown op type: ${op.type}`);
  try {
    return runner(op, { apply });
  } catch (error) {
    return result("error", op, error.message);
  }
}

/** Tracked files an op touches — used by --revert to `git checkout` them. */
export function trackedTargets(operations) {
  return [
    ...new Set(
      operations
        .filter((op) => op.type !== "writeFile" && !op.pending && op.target)
        .map((op) => op.target),
    ),
  ];
}
