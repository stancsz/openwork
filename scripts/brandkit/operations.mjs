// Declarative operation list, built from brand.config.json.
//
// GUIDING RULE: nothing here is committed into an upstream-tracked file. Every
// operation mutates the WORKING TREE at build time and is reverted with
// `--revert` (git checkout). That is what keeps `git pull upstream` a clean
// fast-forward: our committed diff is only additive new files.
//
// Each op targets a verified anchor. When an anchor can't be pinned down yet,
// the op is marked `pending` so it shows up in the report as a to-do rather
// than silently doing nothing (or worse, corrupting a file).

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "./lib/config.mjs";

const LOCALES_DIR = "apps/app/src/i18n/locales";

/** Escape a string for safe use inside a RegExp source. */
function rx(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One brand-name replace op per locale file (auto-covers locales upstream adds). */
function localeBrandOps(brandName) {
  let files = [];
  try {
    files = readdirSync(resolve(REPO_ROOT, LOCALES_DIR)).filter(
      (f) => f.endsWith(".ts") && f !== "index.ts",
    );
  } catch {
    files = ["en.ts"];
  }
  return files.map((file) => ({
    id: `brand-name:${file}`,
    feature: "brandName",
    type: "replaceAll",
    target: `${LOCALES_DIR}/${file}`,
    // Case-sensitive whole word only — deliberately avoids `openwork://`,
    // `@openwork/...`, `openworklabs.com`, and `openwork.defaultModel`.
    pattern: "\\bOpenWork\\b",
    flags: "g",
    replace: brandName,
    signature: brandName,
  }));
}

/**
 * Effective on/off state of each feature group for a loaded config.
 * `features.*` is the distributor's toggle; a group with its own config gate
 * (cloud.hide) must have both switched on to be active.
 */
export function enabledFeatures(config) {
  const f = config.features;
  return {
    brandName: f.brandName,
    accentColor: f.accentColor,
    assets: f.assets,
    desktopIdentity: f.desktopIdentity,
    providers: f.providers,
    welcomeOverride: f.welcomeOverride,
    cloudHide: f.cloudHide && config.cloud.hide,
    // The language variant is only active for a non-English build; an English
    // apply treats the group as off, which cleans up a previous variant's edits.
    language: f.language && config.language.default !== "en",
  };
}

/**
 * Build the full operation list for a loaded config. Every op carries a
 * `feature` tag; ALL ops are returned regardless of toggles so the caller can
 * both apply enabled groups and clean up disabled ones (see apply.mjs).
 */
export function buildOperations(config) {
  const { brand, desktop, providers } = config;
  const a = brand.assets;

  const ops = [
    // ---- Brand name (window title, packaged name, UI copy) -----------------
    {
      id: "brand-name:index.html",
      feature: "brandName",
      type: "replaceAll",
      target: "apps/app/index.html",
      pattern: "\\bOpenWork\\b",
      flags: "g",
      replace: brand.name,
      signature: brand.name,
    },
    {
      id: "brand-name:electron-main",
      feature: "brandName",
      type: "replaceAll",
      target: "apps/desktop/electron/main.mjs",
      pattern: "\\bOpenWork\\b",
      flags: "g",
      replace: brand.name,
      signature: brand.name,
    },
    ...localeBrandOps(brand.name),

    // ---- Accent color (routes through the existing BrandThemeEffect) -------
    {
      id: "brand-accent",
      feature: "accentColor",
      type: "replaceString",
      target: "apps/app/src/react-app/domains/cloud/brand-theme.tsx",
      find: "const brandAccentColor = config.brandAccentColor;",
      replace: `const brandAccentColor = config.brandAccentColor ?? "${brand.accentColor}"; /* brandkit:accent */`,
    },

    // ---- Brand assets (overwrite in place; paths in code stay the same) ----
    { id: "asset:mark", feature: "assets", type: "overwriteAsset", source: a.mark, target: "apps/app/public/openwork-mark.svg" },
    { id: "asset:logo", feature: "assets", type: "overwriteAsset", source: a.logo, target: "apps/app/public/openwork-logo.svg" },
    { id: "asset:logo-square", feature: "assets", type: "overwriteAsset", source: a.logoSquare, target: "apps/app/public/openwork-logo-square.svg" },
    { id: "asset:favicon-32", feature: "assets", type: "overwriteAsset", source: a.favicon32, target: "apps/app/public/favicon-32x32.png" },
    { id: "asset:favicon-16", feature: "assets", type: "overwriteAsset", source: a.favicon16, target: "apps/app/public/favicon-16x16.png" },
    { id: "asset:apple-touch", feature: "assets", type: "overwriteAsset", source: a.appleTouchIcon, target: "apps/app/public/apple-touch-icon.png" },
    { id: "asset:desktop-png", feature: "assets", type: "overwriteAsset", source: a.desktopIconPng, target: "apps/desktop/resources/icons/icon.png" },
    { id: "asset:desktop-ico", feature: "assets", type: "overwriteAsset", source: a.desktopIconIco, target: "apps/desktop/resources/icons/icon.ico" },
    { id: "asset:desktop-icns", feature: "assets", type: "overwriteAsset", source: a.desktopIconIcns, target: "apps/desktop/resources/icons/icon.icns" },

    // ---- Packaged app identity (electron-builder.yml) ----------------------
    {
      id: "pkg:appId",
      feature: "desktopIdentity",
      type: "replaceString",
      target: "apps/desktop/electron-builder.yml",
      find: "appId: com.differentai.openwork",
      replace: `appId: ${desktop.appId}`,
    },
    {
      id: "pkg:productName",
      feature: "desktopIdentity",
      type: "replaceString",
      target: "apps/desktop/electron-builder.yml",
      find: "productName: OpenWork",
      replace: `productName: ${brand.name}`,
    },
    {
      id: "pkg:scheme",
      feature: "desktopIdentity",
      type: "replaceAll",
      target: "apps/desktop/electron-builder.yml",
      // `(?![\w-])` pins to the bare scheme value and skips `- openwork-orchestrator…`.
      // No literal newline in the anchor, so CRLF vs LF can't drift us.
      pattern: "- openwork(?![\\w-])",
      flags: "g",
      replace: `- ${desktop.deepLinkScheme}`,
      signature: `- ${desktop.deepLinkScheme}`,
    },
    {
      id: "runtime:scheme",
      feature: "desktopIdentity",
      type: "replaceAll",
      target: "apps/desktop/electron/main.mjs",
      pattern: rx('openwork://'),
      flags: "g",
      replace: `${desktop.deepLinkScheme}://`,
      signature: `${desktop.deepLinkScheme}://`,
    },

    // ---- Providers: default model (safe subset) ----------------------------
    {
      id: "providers:opencode-json",
      feature: "providers",
      type: "writeFile",
      target: "opencode.json",
      content: renderOpencodeJson(providers),
    },

    // ---- Reroute: brand-owned welcome page (no source edit to the target) --
    // The override is served in place of the app's welcome-page.tsx via the
    // reroute Vite plugin; the original component is never modified.
    {
      id: "reroute:welcome-override",
      feature: "welcomeOverride",
      type: "writeFile",
      target: "brand/overrides/welcome-page.tsx",
      content: renderWelcomeOverride(config.welcome),
    },
    // Always generated (no feature tag) so `vite --config vite.brandkit.config.mts`
    // keeps working with welcomeOverride off — the reroute map is just empty then.
    {
      id: "reroute:vite-config",
      type: "writeFile",
      target: "apps/app/vite.brandkit.config.mts",
      content: renderBrandViteConfig(enabledFeatures(config).welcomeOverride),
    },
    // Make production builds actually use the brandkit Vite config. Without
    // this the reroute overrides (welcome page, etc.) exist on disk but the
    // packaged renderer is built with plain `vite build` and never sees them.
    {
      id: "reroute:app-build-script",
      type: "replaceString",
      target: "apps/app/package.json",
      find: '"build": "vite build",',
      replace: '"build": "vite build --config vite.brandkit.config.mts",',
    },

    // ---- Hide cloud / Den surfaces ------------------------------------------
    {
      id: "cloud:settings-tabs",
      feature: "cloudHide",
      type: "replaceString",
      target: "apps/app/src/react-app/domains/settings/shell/settings-page.tsx",
      find: "  return memoryEnabled ? [...CLOUD_SETTINGS_TABS, \"memory\"] : CLOUD_SETTINGS_TABS;",
      replace: "  return []; /* brandkit:hide-cloud */",
    },
    {
      id: "cloud:sidebar-workers",
      feature: "cloudHide",
      type: "replaceString",
      target: "PENDING",
      pending: true,
      note:
        "Hide 'Add a worker' / remote-worker entry points in the session sidebar. " +
        "Verify the exact anchor in apps/app/src/react-app/domains/session/sidebar/app-sidebar.tsx before wiring.",
    },
  ];

  // ---- Single-language variant (BRANDKIT_LANG) ------------------------------
  // `BRANDKIT_LANG=zh` (or language.default in config) forces the default
  // locale on every launch and hides the Appearance language switcher — a
  // hard-locked single-language build. Both ops are ALWAYS in the list; for an
  // English build the group is inactive (see enabledFeatures) and apply cleans
  // up a previous variant's edits, so one checkout can alternate en/zh builds.
  ops.push(
    {
      id: "lang:default-locale",
      feature: "language",
      type: "replaceString",
      target: "apps/app/src/i18n/index.ts",
      find: 'let localeValue: Language = "en";',
      replace: `let localeValue: Language = ${JSON.stringify(config.language.default)}; /* brandkit:lang */`,
    },
    {
      id: "lang:hide-switcher",
      feature: "language",
      type: "replaceAll",
      target: "apps/app/src/react-app/domains/settings/pages/appearance-view.tsx",
      pattern: "<Separator />\\s*<LanguageSection \\{\\.\\.\\.props\\} />",
      flags: "g",
      replace: "{null /* brandkit:lang-lock */}",
      signature: "brandkit:lang-lock",
    },
  );

  // ---- Provider picker enforcement (UI) -----------------------------------
  if (providers.allowed.length > 0) {
    ops.push({
      id: "providers:ui-filter",
      feature: "providers",
      type: "replaceString",
      target: "PENDING",
      pending: true,
      note:
        `Filter the model picker to allowed providers [${providers.allowed.join(", ")}]. ` +
        "Verify the provider list anchor in apps/app/src/components/model-select.tsx before wiring.",
    });
  }

  return ops;
}

function renderOpencodeJson(providers) {
  const doc = { $schema: "https://opencode.ai/config.json" };
  if (providers.default?.providerID && providers.default?.modelID) {
    doc.model = `${providers.default.providerID}/${providers.default.modelID}`;
  }
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** The brand-owned welcome page, generated from the `welcome` config block. */
function renderWelcomeOverride(welcome) {
  const consts =
    `const SHOW_SIGN_IN = ${welcome.showSignIn === true};\n` +
    `const TITLE = ${JSON.stringify(welcome.title ?? null)};\n` +
    `const SUBTITLE = ${JSON.stringify(welcome.subtitle ?? null)};\n` +
    `const GET_STARTED_HEADING = ${JSON.stringify(welcome.getStartedHeading ?? "Get started")};\n` +
    `const GET_STARTED_LABEL = ${JSON.stringify(welcome.getStartedLabel ?? null)};\n` +
    `const SHOWCASE_TITLE = ${JSON.stringify(welcome.showcaseTitle)};\n` +
    `const STEPS = ${JSON.stringify(welcome.steps, null, 2)};\n` +
    `const FEATURES = ${JSON.stringify(welcome.features, null, 2)};\n`;

  return `/** @jsxImportSource react */
// AUTO-GENERATED by scripts/brandkit — edit brand.config.json (welcome section)
// and re-run \`node scripts/brandkit/apply.mjs\`. This brand-owned file is served
// in place of apps/app/src/react-app/domains/onboarding/welcome-page.tsx via the
// brandkit reroute Vite plugin (the original source is never modified).
import type { ReactNode } from "react";

import { t } from "@/i18n";
import {
  Page,
  PageBackground,
  PageDescription,
  PageHeader,
  PageTitle,
  PageTitlebarRegion,
} from "@/components/page";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollAreaViewport } from "@/components/ui/scroll-area";

// ---- Brand-configurable content (from brand.config.json) ------------------
${consts}// ---------------------------------------------------------------------------

type WelcomePageProps = {
  onGetStarted: () => void;
  getStartedLabel?: string;
  busy?: boolean;
  error?: string | null;
  manualFolder?: string;
  onManualFolderChange?: (value: string) => void;
  onUseManualFolder?: () => void;
  showManualFolder?: boolean;
  onTeamSignIn?: () => void;
};

type OnboardingStepProps = { number: string; title: string; children: ReactNode };

function OnboardingStep({ number, title, children }: OnboardingStepProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-sm font-medium text-foreground">
        {number}
      </div>
      <div className="flex flex-col gap-0.5 pt-1">
        <div className="text-base font-medium text-foreground">{title}</div>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function ShowcasePanel() {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold tracking-[-0.01em] text-foreground">
        {SHOWCASE_TITLE.map((line, i) => (
          <span key={i}>
            {line}
            {i < SHOWCASE_TITLE.length - 1 ? <br /> : null}
          </span>
        ))}
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {FEATURES.map((cap) => (
          <div key={cap.title} className="flex flex-col gap-2.5 rounded-xl border border-border p-3">
            <div className="size-4 rounded-[5px] bg-[var(--dls-accent,theme(colors.foreground))]" />
            <div className="text-sm font-medium leading-tight text-foreground">{cap.title}</div>
            <div className="text-xs leading-snug text-muted-foreground">{cap.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WelcomePage({
  onGetStarted,
  getStartedLabel,
  busy,
  error,
  manualFolder,
  onManualFolderChange,
  onUseManualFolder,
  showManualFolder,
  onTeamSignIn,
}: WelcomePageProps) {
  return (
    <Page className="min-h-screen">
      <PageBackground />
      <PageTitlebarRegion />
      <ScrollArea className="relative z-10">
        <ScrollAreaViewport>
          <div className="flex min-h-screen">
            {/* ---- Left: onboarding steps ---- */}
            <div className="flex w-full flex-col items-center justify-center px-8 py-16 lg:w-[45%] lg:px-12">
              <div className="flex w-full max-w-md flex-col gap-10">
                <PageHeader className="text-left">
                  <PageTitle>{TITLE ?? t("welcome.title")}</PageTitle>
                  <PageDescription>{SUBTITLE ?? t("welcome.subtitle")}</PageDescription>
                </PageHeader>

                <div className="flex flex-col gap-4">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">{GET_STARTED_HEADING}</h2>
                  {STEPS.map((step, i) => (
                    <OnboardingStep key={step.title} number={String(i + 1)} title={step.title}>
                      {step.desc}
                    </OnboardingStep>
                  ))}
                </div>

                <div className="space-y-2">
                  <Button size="lg" className="w-full" onClick={onGetStarted} disabled={busy}>
                    {busy ? t("welcome.creating_workspace") : GET_STARTED_LABEL || getStartedLabel || t("welcome.get_started")}
                  </Button>
                  {SHOW_SIGN_IN && onTeamSignIn ? (
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto w-full p-0 text-sm text-muted-foreground"
                      onClick={onTeamSignIn}
                      data-testid="welcome-team-signin"
                    >
                      {t("welcome.team_signin")}
                    </Button>
                  ) : null}
                  {error ? <p className="text-center text-xs text-destructive">{error}</p> : null}
                  {showManualFolder ? (
                    <div className="rounded-xl border border-dashed border-border p-3">
                      <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                        Folder path
                        <input
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus:border-ring"
                          value={manualFolder ?? ""}
                          onChange={(event) => onManualFolderChange?.(event.target.value)}
                          placeholder="/workspace/my-project"
                        />
                      </label>
                      <Button
                        className="mt-2 w-full"
                        variant="outline"
                        onClick={onUseManualFolder}
                        disabled={busy || !manualFolder?.trim()}
                      >
                        Use this folder
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* ---- Right: showcase card ---- */}
            <div className="hidden lg:flex lg:w-[55%] lg:items-center lg:justify-center lg:p-6">
              <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-border">
                <div className="absolute inset-0 z-0 bg-[var(--dls-accent,theme(colors.muted.DEFAULT))] opacity-10" />
                <div className="relative z-10 m-3 rounded-2xl bg-background p-7">
                  <ShowcasePanel />
                </div>
              </div>
            </div>
          </div>
        </ScrollAreaViewport>
      </ScrollArea>
    </Page>
  );
}
`;
}

/**
 * The brand Vite config. Lives in apps/app (additive — the app's own
 * vite.config.ts is never modified) so Vite's temp-config bundling resolves
 * `vite` and the app plugins from apps/app/node_modules. Registers the reroute
 * plugin and maps the welcome-page module to the brand override.
 */
function renderBrandViteConfig(withWelcomeOverride) {
  const overrides = withWelcomeOverride
    ? `{
    [resolve(APP_ROOT, "src/react-app/domains/onboarding/welcome-page.tsx")]:
      resolve(REPO_ROOT, "brand/overrides/welcome-page.tsx"),
  }`
    : `/* features.welcomeOverride = false — no modules rerouted */ {}`;

  return `// AUTO-GENERATED by scripts/brandkit. Additive file — the app's own
// vite.config.ts is never modified. Loads the real config unchanged and layers
// in the reroute plugin so brand-owned overrides replace specific modules.
//
// Build/run the branded app with this config:
//   vite --config vite.brandkit.config.mts          (dev, cwd = apps/app)
//   vite build --config vite.brandkit.config.mts     (build, cwd = apps/app)
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";

import base from "./vite.config";
import { brandkitReroute } from "../../scripts/brandkit/vite-reroute-plugin.mjs";

const APP_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(APP_ROOT, "..", "..");

const reroute = brandkitReroute({
  overrides: ${overrides},
});

// Prepend the reroute plugin (so its \`pre\` resolveId wins), keep the app's
// plugins/alias intact, pin root, and let Vite serve the override from brand/.
export default mergeConfig(mergeConfig({ plugins: [reroute] }, base), {
  root: APP_ROOT,
  server: { fs: { allow: [REPO_ROOT] } },
});
`;
}
