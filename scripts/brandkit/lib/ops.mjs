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
    const after = before.replace(re, op.replace);
    // A pattern that also matches its own replacement (used for ops whose
    // value varies between runs, e.g. lang-suffixed names) is a no-op here.
    if (after === before) return result("already", op);
    if (apply) write(op.target, after);
    return result("applied", op, `${matches.length} match(es)`);
  }
  // No matches: either already applied or the anchor is gone.
  if (op.signature && before.includes(op.signature)) return result("already", op);
  return result("drifted", op, "no matches and no signature — anchor moved?");
}

/**
 * Replace a single exact string. Reports `drifted` if the anchor is absent and
 * the replacement isn't already there. `find` may be an array of candidate
 * anchors (e.g. pristine vs already-branded text) — the first present wins.
 */
function runReplaceString(op, { apply }) {
  if (!existsSync(abs(op.target))) return result("drifted", op, "file missing");
  const before = read(op.target);
  const finds = Array.isArray(op.find) ? op.find : [op.find];
  const found = finds.find((f) => before.includes(f));
  if (before.includes(op.replace) && found === undefined) {
    return result("already", op);
  }
  if (found === undefined) {
    return result("drifted", op, `anchor not found: ${truncate(finds[0])}`);
  }
  if (apply) write(op.target, before.split(found).join(op.replace));
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

function rxEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Merge distributor-supplied translations (op.source = a brand/i18n/<lang>.json
 * map of key -> string) into an upstream locale file (op.target =
 * apps/app/src/i18n/locales/<lang>.ts). For each key: replace the value in place
 * if the key already exists, otherwise insert a new entry before the closing
 * `} as const;`. Values run through op.substitutions ({token: replacement}) so
 * the kit JSON can stay brand-agnostic (e.g. "{BRAND}" -> displayName).
 * Idempotent and, being a non-writeFile op, reverted by `--revert` via git
 * checkout — the upstream locale file stays clean in commits.
 */
function runMergeLocale(op, { apply }) {
  if (!existsSync(abs(op.target))) return result("drifted", op, "locale file missing");
  if (!op.source || !existsSync(abs(op.source))) {
    return result("skipped", op, `no translations file: ${op.source ?? "(none)"}`);
  }
  let translations;
  try {
    translations = JSON.parse(readFileSync(abs(op.source), "utf8"));
  } catch (error) {
    return result("error", op, `invalid JSON in ${op.source}: ${error.message}`);
  }
  const before = read(op.target);
  const eol = before.includes("\r\n") ? "\r\n" : "\n";
  let body = before;
  const toAppend = [];
  for (const [key, rawValue] of Object.entries(translations)) {
    let value = String(rawValue);
    for (const [token, replacement] of Object.entries(op.substitutions ?? {})) {
      value = value.replaceAll(token, replacement);
    }
    const enc = JSON.stringify(value); // safely quoted + escaped TS string literal
    const line = `  "${key}": ${enc},`;
    // Match an existing `  "key": "…",` entry (any value, optional trailing comma).
    const keyRe = new RegExp(
      `^[ \\t]*"${rxEscape(key)}":[ \\t]*"(?:[^"\\\\]|\\\\.)*",?[ \\t]*$`,
      "m",
    );
    if (keyRe.test(body)) {
      body = body.replace(keyRe, () => line); // fn replacement → `$` in value is literal
    } else {
      toAppend.push(line);
    }
  }
  if (toAppend.length > 0) {
    const marker = "} as const;";
    const idx = body.lastIndexOf(marker);
    if (idx === -1) return result("drifted", op, "no `} as const;` insertion point");
    body = body.slice(0, idx) + toAppend.join(eol) + eol + body.slice(idx);
  }
  if (body === before) return result("already", op);
  if (apply) write(op.target, body);
  return result("applied", op, `${Object.keys(translations).length} keys`);
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
  mergeLocale: runMergeLocale,
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
