import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// Failure first: a transient page overlay must not be mistaken for the dock.
// Moving the right dock left during hydration would cover the declared target.
for (const obstruction of ["page", "dock"] as const) {
  test(`Public picker exposure distinguishes ${obstruction} obstruction`, async () => {
    const site = {
      id: `picker-exposure-${obstruction}`,
      caseId: "primary",
      component: "Editable button",
      url: "http://127.0.0.1:5173/picker-exposure",
      target: "#selected",
      keep: "#kept",
    };
    const instance = await isolatedBrowser(site);
    let moves = 0;
    await instance.context.exposeBinding("recordDockMove", () => moves++);
    await instance.context.route(site.url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Pointer exposure</title><style>body{margin:0}#selected{position:absolute;top:100px;${obstruction === "page" ? "left:80px" : "right:80px"};width:180px;height:100px}#kept{position:absolute;top:500px;left:500px;padding:30px}#loading{position:fixed;inset:0;background:#aaa;z-index:10000}</style><button id="selected">Selected</button><aside id="kept">Independent</aside><script>let shown=false;window.addEventListener('click',event=>{const path=event.composedPath();if(path.some(node=>node.id==='move'))void window.recordDockMove();if(${obstruction === "page"}&&!shown&&path.some(node=>node.id==='edit')){shown=true;const overlay=document.createElement('div');overlay.id='loading';document.body.append(overlay);setTimeout(()=>overlay.remove(),700);}},true);</script>`,
      }),
    );
    try {
      expect(
        (await runLiveSite(instance.context, instance.extensionId, site))
          .outcome,
      ).toBe("passed");
      if (obstruction === "dock") expect(moves).toBeGreaterThan(0);
      else expect(moves).toBe(0);
    } finally {
      await instance.close();
    }
  });
}

// Failure first: semantic link promotion requires descending to its headline.
for (const wrappers of [0, 3]) {
  test(`Public picker reaches a linked heading through ${wrappers} wrappers`, async () => {
    const site = {
      id: `picker-descent-${wrappers}`,
      caseId: "primary",
      component: "Linked headline",
      url: "http://127.0.0.1:5173/picker-descent",
      target: "#selected",
      keep: "#kept",
    };
    const instance = await isolatedBrowser(site);
    await instance.context.route(site.url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Linked headline</title><style>body{padding:60px}a{display:block;width:500px;padding:30px;background:#ddd}h2{padding:20px}aside{padding:30px}</style><main><a href="/story">${"<div>".repeat(wrappers)}<h2 id="selected">Selected headline</h2>${"</div>".repeat(wrappers)}<p>Story description</p></a><aside id="kept">Independent</aside></main>`,
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
