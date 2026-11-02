import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

test("Catalog load readiness waits for native page event hydration on every visit", async () => {
  const site = {
    id: "catalog-load-readiness",
    caseId: "primary",
    component: "Hydrated article",
    url: "http://127.0.0.1:5173/catalog-load-readiness",
    readyState: "load",
    target: "#selected",
    keep: "#kept",
  };
  const instance = await isolatedBrowser(site);
  const events: { document: number; type: string; trusted?: boolean }[] = [];
  await instance.context.exposeBinding("__recordLoad", (_source, event) =>
    events.push(event),
  );
  await instance.context.route(`${site.url}/engine.svg`, async (route) => {
    // The visible DOM is complete, but this native asset still owns window.load.
    await new Promise((resolve) => setTimeout(resolve, 6000));
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    });
  });
  await instance.context.route(site.url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Page event hydration</title><style>body{padding:40px;font:18px system-ui}article,aside{display:block;width:420px;padding:25px;margin:20px;background:#ddd}</style><script>
let loaded=false;
const record=(type,trusted)=>window.__recordLoad({document:performance.timeOrigin,type,trusted});
document.addEventListener('click',event=>{if(!loaded&&event.isTrusted){record('blocked',true);event.stopImmediatePropagation();}},true);
window.addEventListener('load',()=>{loaded=true;record('load');},{once:true});
</script><main><article id="selected"><span>Native component</span></article><aside id="kept">Independent content</aside></main><img src="${site.url}/engine.svg" alt="" hidden>`,
    }),
  );
  try {
    const result = await runLiveSite(
      instance.context,
      instance.extensionId,
      site,
    ).then(
      (value) => value,
      (error) => error,
    );
    await test.info().attach("native-page-load-events", {
      body: JSON.stringify(events),
      contentType: "application/json",
    });
    expect(events.filter((event) => event.type === "blocked")).toEqual([]);
    expect(result).toMatchObject({ outcome: "passed", phase: "complete" });
    expect(
      new Set(
        events
          .filter((event) => event.type === "load")
          .map((event) => event.document),
      ).size,
    ).toBe(4);
  } finally {
    await instance.close();
  }
});
