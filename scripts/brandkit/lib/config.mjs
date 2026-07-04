// Loads and lightly validates brand.config.json.
// No external deps — this must run on a bare `node` before install.

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root = three levels up from scripts/brandkit/lib/config.mjs. */
const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..", "..");

const CONFIG_PATH = resolve(REPO_ROOT, "brand.config.json");

const RADIX_COLORS = new Set([
  "gray", "gold", "bronze", "brown", "yellow", "amber", "orange",
  "tomato", "red", "ruby", "crimson", "pink", "plum", "purple",
  "violet", "iris", "indigo", "blue", "cyan", "teal", "jade",
  "green", "grass", "lime", "mint", "sky",
]);

/**
 * Read and normalize the brand kit config. Throws with a readable message
 * on the handful of things that would otherwise produce a broken build.
 */
export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `brand.config.json not found at ${CONFIG_PATH}. Copy the example and edit it.`,
    );
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (error) {
    throw new Error(`brand.config.json is not valid JSON: ${error.message}`);
  }

  const brand = raw.brand ?? {};
  if (!brand.name || typeof brand.name !== "string") {
    throw new Error("brand.config.json: brand.name is required.");
  }
  if (!RADIX_COLORS.has(brand.accentColor)) {
    throw new Error(
      `brand.config.json: brand.accentColor "${brand.accentColor}" is not a Radix color family.`,
    );
  }

  const scheme = raw.desktop?.deepLinkScheme ?? "openwork";
  if (!/^[a-z][a-z0-9-]*$/.test(scheme)) {
    throw new Error(
      `brand.config.json: desktop.deepLinkScheme "${scheme}" must be lowercase, no ':' or '//'.`,
    );
  }

  return {
    brand: {
      name: brand.name,
      shortName: brand.shortName ?? brand.name,
      accentColor: brand.accentColor,
      assets: brand.assets ?? {},
    },
    desktop: {
      appId: raw.desktop?.appId ?? "com.differentai.openwork",
      deepLinkScheme: scheme,
    },
    providers: {
      allowed: raw.providers?.allowed ?? [],
      default: raw.providers?.default ?? null,
    },
    cloud: {
      hide: raw.cloud?.hide ?? true,
      requireSignin: raw.cloud?.requireSignin ?? false,
    },
    welcome: {
      showSignIn: raw.welcome?.showSignIn ?? false,
      // null → the override falls back to the app's i18n string for that slot.
      title: raw.welcome?.title ?? null,
      subtitle: raw.welcome?.subtitle ?? null,
      getStartedHeading: raw.welcome?.getStartedHeading ?? "Get started",
      getStartedLabel: raw.welcome?.getStartedLabel ?? null,
      showcaseTitle: raw.welcome?.showcaseTitle ?? ["Your computer,", "but it works for you."],
      steps: raw.welcome?.steps ?? [
        { title: "Pick a folder", desc: "Choose any folder on your machine to get started." },
        { title: "Chat", desc: `Describe what you need. ${brand.name} handles the rest.` },
        { title: "Interact", desc: "Review results, approve actions, and iterate." },
      ],
      features: raw.welcome?.features ?? [],
    },
  };
}
