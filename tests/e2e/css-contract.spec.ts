import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";
import { assertEditorStyles } from "../scenarios/editor.mjs";
import { evidencePath } from "../run-evidence.mjs";

// First-principles failures observed in the catalog: layout resolves a correctly
// applied width through min-size/flex constraints; successful text editing stops
// matching a text-based discovery locator. Neither permits changing the target.
for (const mode of ["min-size", "flex", "text locator"] as const) {
  test(`CSS contract: ${mode}`, async () => {
    const site = {
      id: `css-contract-${mode.replaceAll(" ", "-")}`,
      caseId: "primary",
      component: "Contract target",
      url: "http://127.0.0.1:5173/css-contract",
      target:
        mode === "text locator" ? 'h2:text-is("Selected words")' : "#selected",
      keep: "#kept",
    };
    const instance = await isolatedBrowser(site);
    await instance.context.route(site.url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>CSS contract</title><style>body{padding:80px}main{${mode === "flex" ? "display:flex;width:800px" : ""}}#selected{padding:20px;${mode === "min-size" ? "min-width:220px;min-height:160px" : mode === "flex" ? "flex-grow:1" : ""}}aside{padding:20px}</style><main>${mode === "text locator" ? '<h2 id="selected">Selected words</h2>' : '<article id="selected"><h2>Selected words</h2></article>'}<aside id="kept">Independent content</aside></main>`,
      }),
    );
    try {
      expect(
        (await runLiveSite(instance.context, instance.extensionId, site))
          .outcome,
      ).toBe("passed");
    } finally {
      await instance.close();
    }
  });
}

// A layout constraint must never excuse a missing winning declaration.
test("CSS contract rejects a lost width declaration under a min-size", async () => {
  const instance = await isolatedBrowser();
  await instance.context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const page = await instance.context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    const target = page.locator("#keep");
    await target.evaluate((e) => {
      (e as HTMLElement).style.minWidth = "220px";
    });
    expect(
      await target.evaluate((e) => String(e.computedStyleMap().get("width"))),
    ).toBe("auto");
    await expect(
      assertEditorStyles(target, { width: "173px" }),
    ).rejects.toThrow();
  } finally {
    await instance.context.tracing.stop({
      path: evidencePath("css-missing-declaration.zip"),
    });
    await instance.close();
  }
});
