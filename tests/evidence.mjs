import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Only evidence produced for this build and this exact component contract can qualify.
export function evidenceFingerprint(site, component) {
  const hash = createHash("sha256");
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else hash.update(path).update(readFileSync(path));
    }
  };
  visit("dist");
  for (const path of [
    "tests/scenarios/live.mjs",
    "tests/isolated-browser.mjs",
    "tests/dock-actions.mjs",
    "tests/evidence.mjs",
    "tests/e2e/hide.spec.ts",
    "playwright.config.ts",
    "package-lock.json",
  ])
    hash.update(readFileSync(path));
  hash.update(
    JSON.stringify({
      url: site.url,
      origins: site.origins,
      dismiss: site.dismiss,
      readyUrl: site.readyUrl,
      invariant: site.invariant,
      component,
    }),
  );
  return hash.digest("hex");
}
