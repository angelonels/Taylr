import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const digest = (value) => createHash("sha256").update(value).digest("hex");
let build;
let harness;
function sourceHash(paths) {
  const hash = createHash("sha256");
  const visit = (path) => {
    const entries = readdirSync(path, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else hash.update(child).update(readFileSync(child));
    }
  };
  for (const path of paths) {
    if (path === "dist") visit(path);
    else hash.update(path).update(readFileSync(path));
  }
  return hash.digest("hex");
}

// Separate product, contract and harness changes; unrelated tooling dependencies do not invalidate evidence.
export function evidenceIdentity(site, component) {
  build ??= sourceHash(["dist"]);
  harness ??= sourceHash([
    "tests/scenarios/live.mjs",
    "tests/capture.mjs",
    "tests/isolated-browser.mjs",
    "tests/dock-actions.mjs",
    "tests/run-evidence.mjs",
    "tests/evidence.mjs",
    "tests/e2e/hide.spec.ts",
    "playwright.config.ts",
  ]);
  const contract = digest(
    JSON.stringify({
      url: site.url,
      origins: site.origins,
      dismiss: site.dismiss,
      readyUrl: site.readyUrl,
      invariant: site.invariant,
      component,
    }),
  );
  return { build, harness, contract };
}

export function evidenceFingerprint(site, component) {
  return digest(JSON.stringify(evidenceIdentity(site, component)));
}

export function currentEnvironment(
  environment,
  mode = process.env.TAYLR_HEADED === "1" ? "headed" : "headless",
) {
  const browsers = JSON.parse(
    readFileSync(
      join(
        dirname(require.resolve("playwright-core/package.json")),
        "browsers.json",
      ),
      "utf8",
    ),
  );
  const chromium = browsers.browsers.find(
    (browser) => browser.name === "chromium",
  );
  return (
    environment?.chromium === chromium.browserVersion &&
    environment.playwright ===
      require("@playwright/test/package.json").version &&
    environment.mode === mode &&
    environment.platform === process.platform &&
    environment.arch === process.arch &&
    environment.viewport?.width === 1440 &&
    environment.viewport?.height === 1000 &&
    environment.deviceScaleFactor === 1 &&
    environment.locale === "en-US" &&
    environment.timezone === "UTC" &&
    environment.permissionModel === "test-exact-origins" &&
    !environment.browserArgs?.length &&
    !!environment.manifestHash
  );
}
