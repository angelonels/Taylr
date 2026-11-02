import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// Failure first: the application recalculates its own inline geometry on show.
// Restore must honor that current value while still detecting a retained override.
for (const retained of [false, true]) {
  test(`Restore ${retained ? "rejects retained overrides over" : "accepts"} updated native inline geometry`, async () => {
    const site = {
      id: `restore-inline-${retained}`,
      caseId: "primary",
      component: "Measured article",
      url: "http://127.0.0.1:5173/restore-inline",
      target: "#selected",
      keep: "#kept",
    };
    const instance = await isolatedBrowser(site);
    await instance.context.route(site.url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Native inline geometry</title><style>body{padding:50px}article{width:500px;padding:20px;background:#ddd}aside{margin-top:200px;padding:20px}</style><article id="selected" style="height:240px;margin-bottom:-120px"><h2>Measured article</h2><button>Nested control</button></article><aside id="kept">Independent</aside><script>const channel=new BroadcastChannel('native-geometry');function recalculate(){const target=document.querySelector('#selected');target.style.height='316px';target.style.marginBottom='0px';${retained ? "const style=document.createElement('style');style.textContent='#selected{height:127px!important;margin-bottom:17px!important}';document.head.append(style);" : ""}}channel.onmessage=recalculate;window.addEventListener('click',event=>{if(event.composedPath().some(node=>node.id==='restore')){recalculate();channel.postMessage('show');}},true);</script>`,
      }),
    );
    try {
      if (retained) {
        const error = await runLiveSite(
          instance.context,
          instance.extensionId,
          site,
        ).then(
          () => null,
          (cause: unknown) => cause,
        );
        expect(error).toMatchObject({
          phase: "restore",
          outcome: "product-failed",
        });
      } else {
        expect(
          (await runLiveSite(instance.context, instance.extensionId, site))
            .outcome,
        ).toBe("passed");
      }
    } finally {
      await instance.close();
    }
  });
}
