#!/usr/bin/env node
// Discover brand ids from brands/<id>/brand.json. This is intentionally
// dependency-free so CI can build its matrix before installing the workspace.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "./lib/config.mjs";

const BRANDS_ROOT = resolve(REPO_ROOT, "brands");

function validateBrandFolder(entry) {
  const configPath = resolve(BRANDS_ROOT, entry.name, "brand.json");
  if (!existsSync(configPath)) return false;

  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(`brands/${entry.name}/brand.json is not valid JSON: ${error.message}`);
  }

  if (config.id !== entry.name) {
    throw new Error(
      `brands/${entry.name}/brand.json must use id "${entry.name}" so CI artifact names stay stable.`,
    );
  }
  return true;
}

export function discoverBrands() {
  if (!existsSync(BRANDS_ROOT)) return [];
  return readdirSync(BRANDS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && !entry.name.startsWith("."))
    .filter(validateBrandFolder)
    .map((entry) => entry.name)
    .sort();
}

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(discoverBrands())}\n`);
} else {
  process.stdout.write(`${discoverBrands().join("\n")}\n`);
}
