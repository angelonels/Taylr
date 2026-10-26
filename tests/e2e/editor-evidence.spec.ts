import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure: the canonical values can equal original site values; requiring every
// property in storage mistakes correct no-op declarations for dropped edits.
test("Editor evidence distinguishes saved changes from verified baseline values", async () => {
  const site = {
    id: "editor-evidence",
    caseId: "primary",
    component: "Card",
    url: "http://127.0.0.1:5173/editor-evidence",
    target: "#selected",
    keep: "#kept",
  };
  const instance = await isolatedBrowser(site);
  await instance.context.route(site.url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><title>Editor evidence</title><style>body{padding:80px}article,aside{padding:30px;margin:20px}article{opacity:.67;border-radius:17px;border-style:solid}</style><article id="selected">Selected card</article><aside id="kept">Independent card</aside>',
    }),
  );
  try {
    expect(
      (await runLiveSite(instance.context, instance.extensionId, site)).outcome,
    ).toBe("passed");
    const report = JSON.parse(
      await readFile(
        evidencePath("sites", site.id, site.caseId, "editor-checks.json"),
        "utf8",
      ),
    );
    expect(report.unchangedProperties).toContain("border-style");
    expect(report.savedProperties).toContain("opacity");
    expect(report.checks).toHaveLength(6);
  } finally {
    await instance.close();
  }
});
