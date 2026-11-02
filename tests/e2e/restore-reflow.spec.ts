import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// Failure: Restore compares the old used size with a relative declaration after
// the application reflows, even though every extension override was removed.
test("Restore verifies relative dimensions through application reflow", async () => {
  const site = {
    id: "restore-reflow",
    caseId: "primary",
    component: "Fluid article",
    url: "http://127.0.0.1:5173/restore-reflow",
    target: "#selected",
    keep: "#kept",
  };
  const instance = await isolatedBrowser(site);
  await instance.context.route(site.url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Fluid dimensions</title><style>body{padding:50px}main{height:300px;width:600px}article{height:100%;padding:12px;background:#ddd}aside{padding:20px}</style><main><article id="selected"><h2>Selected article</h2><button>Nested action</button></article></main><aside id="kept">Independent content</aside><script>window.addEventListener('click', event => { if(event.composedPath().some(node => node.id === 'restore')) document.querySelector('main').style.height='450px'; }, true);</script>`,
    }),
  );
  try {
    expect(
      (await runLiveSite(instance.context, instance.extensionId, site)).outcome,
    ).toBe("passed");
  } finally {
    await instance.close();
  }
});
