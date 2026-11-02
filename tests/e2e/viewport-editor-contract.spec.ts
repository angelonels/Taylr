import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure first: a fixed tiny resize puts an otherwise editable viewport behind
// independent app navigation, preventing later real pointer selection and Hide.
test("Full editor keeps a resized viewport reachable beneath fixed navigation", async () => {
  const site = {
    id: "viewport-editor",
    caseId: "primary",
    component: "Viewport component",
    url: "http://127.0.0.1:5173/viewport-editor",
    target: "#selected",
    keep: "#kept",
  };
  const instance = await isolatedBrowser(site);
  await instance.context.route(site.url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><title>Viewport editor</title><style>body{margin:0}#selected{position:fixed;left:0;top:0;width:100vw;height:100vh;box-sizing:border-box;background:#ddd}#kept{position:fixed;left:0;top:0;bottom:0;width:300px;background:#eee;z-index:5}</style><div id="selected"><span>Viewport content</span></div><aside id="kept">Independent fixed navigation</aside>',
    }),
  );
  try {
    const result = await runLiveSite(
      instance.context,
      instance.extensionId,
      site,
    );
    expect(result.outcome).toBe("passed");
    expect(result.checks).toHaveLength(6);
    const report = JSON.parse(
      await readFile(
        evidencePath("sites", site.id, site.caseId, "editor-checks.json"),
        "utf8",
      ),
    );
    expect(report.dimensionInputs).toEqual({
      baseline: { width: "1440px", height: "1000px" },
      chosen: { width: "1152px", height: "800px" },
    });
    expect(report.savedProperties).toContain("width");
    expect(report.savedProperties).toContain("height");
  } finally {
    await instance.close();
  }
});
