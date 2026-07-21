#!/usr/bin/env node
// Print one normalized value for build scripts after a brand is selected.

import { loadConfig } from "./lib/config.mjs";

const field = process.argv[2] ?? "productName";
const config = loadConfig();
const values = {
  id: config.id,
  name: config.brand.name,
  displayName: config.brand.displayName,
  productName: config.desktop.productName ?? config.brand.name,
  deepLinkScheme: config.desktop.deepLinkScheme,
};

if (!(field in values)) {
  throw new Error(`Unknown brand metadata field: ${field}`);
}

process.stdout.write(`${values[field]}\n`);
