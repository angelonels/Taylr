import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// A saved stylesheet cannot remove DOM nodes. If the server omits the selected
// identity on revisit, that is a contract failure; a present-but-visible target
// must still fail the product's persistence check.
for (const mode of ["retained", "replaced", "lost-style"]) {
  const replaced = mode === "replaced";
  test(`Revisit contract: selected identity ${mode}`, async () => {
    const site = {
      id: `revisit-${mode}`,
      caseId: "primary",
      component: "Result card",
      url: "http://127.0.0.1:5173/contract-revisit",
      target: "article[data-id]",
      keep: "article[data-id]",
      targetIndex: 0,
      keepIndex: 1,
      identity: { self: true, selector: "[data-id]", attribute: "data-id" },
    };
    const instance = await isolatedBrowser(site);
    const { context, extensionId } = instance;
    let visits = 0;
    await context.route(site.url, async (route) => {
      visits++;
      // Fault injection: erase persistence only after the initial successful
      // Edit/Hide/Undo. The DOM identity remains, so this must fail the product.
      if (mode === "lost-style" && visits > 1)
        await instance.worker.evaluate(() => chrome.storage.local.clear());
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Catalog</title><style>body{font:18px system-ui;margin:80px;max-width:800px}article,aside{padding:40px;margin:20px;background:#eee}</style><article data-id="${replaced && visits > 1 ? "replacement" : "selected"}">Selected result</article><article data-id="retained">Independent result</article>`,
      });
    });
    try {
      const run = runLiveSite(context, extensionId, site);
      if (replaced)
        await expect(run).rejects.toMatchObject({
          outcome: "contract-failed",
          phase: "revisit-contract",
        });
      else if (mode === "lost-style")
        await expect(run).rejects.toMatchObject({
          outcome: "product-failed",
          phase: "persistence",
        });
      else expect((await run).outcome).toBe("passed");
    } finally {
      await instance.close();
    }
  });
}
