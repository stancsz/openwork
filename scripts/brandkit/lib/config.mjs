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

/** Feature groups a distributor can toggle in brand.config.json. All default on. */
export const FEATURE_DEFAULTS = {
  brandName: true,
  accentColor: true,
  assets: true,
  desktopIdentity: true,
  providers: true,
  welcomeOverride: true,
  cloudHide: true,
  language: true,
};

function normalizeFeatures(raw) {
  const features = { ...FEATURE_DEFAULTS };
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!(key in FEATURE_DEFAULTS)) {
      throw new Error(
        `brand.config.json: unknown feature "${key}" — known features: ${Object.keys(FEATURE_DEFAULTS).join(", ")}.`,
      );
    }
    if (typeof value !== "boolean") {
      throw new Error(`brand.config.json: features.${key} must be a boolean.`);
    }
    features[key] = value;
  }
  return features;
}

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

  // Language: from brand.config.json `language.default`, overridable at build
  // time with BRANDKIT_LANG. Any non-"en" value builds a hard-locked
  // single-language variant (default locale forced, switcher hidden); unset or
  // "en" builds the normal multi-language app. This is what lets one checkout
  // emit both an English and a Chinese build.
  const envLang = (process.env.BRANDKIT_LANG ?? "").trim();
  const language = {
    default: envLang !== "" ? envLang : (raw.language?.default ?? "en"),
  };
  if (
    language.default !== "en" &&
    !existsSync(resolve(REPO_ROOT, `apps/app/src/i18n/locales/${language.default}.ts`))
  ) {
    throw new Error(
      `language "${language.default}" (from ${envLang ? "BRANDKIT_LANG" : "brand.config.json language.default"}) has no locale file in apps/app/src/i18n/locales/.`,
    );
  }

  return {
    features: normalizeFeatures(raw.features),
    language,
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
