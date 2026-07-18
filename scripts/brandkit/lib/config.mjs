// Loads and lightly validates brand.config.json.
// No external deps — this must run on a bare `node` before install.

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root = three levels up from scripts/brandkit/lib/config.mjs. */
const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..", "..");

// Which brand to build. BRANDKIT_CONFIG points at an alternate config file
// (e.g. brand.clinicwork.json) so one checkout can build multiple sibling
// brands. Defaults to brand.config.json (MiniWork). ALWAYS run `apply.mjs
// --revert` before switching brands — the brand-name replaceAll anchors on
// "OpenWork" and can't retarget a previously-applied alias.
const CONFIG_PATH = resolve(REPO_ROOT, process.env.BRANDKIT_CONFIG ?? "brand.config.json");

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
  trim: true,
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

  // Per-language welcome override: welcomeByLang.<lang> layers over the base
  // `welcome` block so a locked-language build shows localized hero copy.
  const welcomeRaw = {
    ...(raw.welcome ?? {}),
    ...(raw.welcomeByLang?.[language.default] ?? {}),
  };

  return {
    features: normalizeFeatures(raw.features),
    language,
    brand: {
      // `name` is the ASCII base — drives appId/scheme/artifact/install-dir and
      // the packaged productName (so exe/app filenames stay ASCII-safe).
      name: brand.name,
      shortName: brand.shortName ?? brand.name,
      // `displayName` is the language-aware brand shown in the UI + window title
      // (brand.nameByLang.<lang> overrides `name`, e.g. zh → "Mini助手").
      displayName: brand.nameByLang?.[language.default] ?? brand.name,
      accentColor: brand.accentColor,
      assets: brand.assets ?? {},
    },
    desktop: {
      appId: raw.desktop?.appId ?? "com.differentai.openwork",
      deepLinkScheme: scheme,
      // Packaged app / exe / .app filename (electron-builder productName). Kept
      // separate from `brand.name` so the bundle can be short (e.g. "Mini")
      // while the UI shows the full display name. Must be filesystem-safe.
      productName: raw.desktop?.productName ?? null,
      // Optional { owner, repo } GitHub feed for electron-updater. When set,
      // the packaged app checks THIS repo's releases instead of upstream
      // different-ai/openwork — without it a branded build can auto-update
      // itself back into stock OpenWork.
      updateFeed:
        raw.desktop?.updateFeed?.owner && raw.desktop?.updateFeed?.repo
          ? { owner: raw.desktop.updateFeed.owner, repo: raw.desktop.updateFeed.repo }
          : null,
    },
    providers: {
      allowed: raw.providers?.allowed ?? [],
      // Optional model-id whitelist within the allowed providers. Empty = all.
      models: raw.providers?.models ?? [],
      default: raw.providers?.default
        ? {
            ...raw.providers.default,
            displayName:
              raw.providers.default.displayNameByLang?.[language.default] ??
              raw.providers.default.displayName ?? null,
          }
        : null,
      // Optional inline key-card override: presents the default provider as a
      // branded gateway (label, validation URL, key-prefix hint) instead of the
      // upstream. null = use the built-in per-provider catalog defaults.
      keyCard: raw.providers?.keyCard ?? null,
      // Optional override for the opencode model catalog origin (OPENCODE_MODELS_URL).
      // Point it at a gateway that serves a curated /api.json so the picker no
      // longer populates from the upstream mirror. null = leave the default.
      modelsCatalogUrl: raw.providers?.modelsCatalogUrl ?? null,
    },
    cloud: {
      hide: raw.cloud?.hide ?? true,
      requireSignin: raw.cloud?.requireSignin ?? false,
    },
    welcome: {
      showSignIn: welcomeRaw.showSignIn ?? false,
      // null → the override falls back to the app's i18n string for that slot.
      title: welcomeRaw.title ?? null,
      subtitle: welcomeRaw.subtitle ?? null,
      getStartedHeading: welcomeRaw.getStartedHeading ?? "Get started",
      getStartedLabel: welcomeRaw.getStartedLabel ?? null,
      showcaseTitle: welcomeRaw.showcaseTitle ?? ["Your computer,", "but it works for you."],
      steps: welcomeRaw.steps ?? [
        { title: "Pick a folder", desc: "Choose any folder on your machine to get started." },
        { title: "Chat", desc: `Describe what you need. ${brand.name} handles the rest.` },
        { title: "Interact", desc: "Review results, approve actions, and iterate." },
      ],
      features: welcomeRaw.features ?? [],
    },
  };
}
