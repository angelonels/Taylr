import { test } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// Failure: viewport hit points are passed as padding-box click offsets. Added
// borders shift the real click onto a neighboring overlay after live edits.
for (const transform of ["none", "rotate(8deg)"]) {
  test(`Pointer geometry: borders and overlays with ${transform}`, async () => {
    const site = {
      id: `pointer-borders-${transform === "none" ? "plain" : "rotated"}`,
      caseId: "primary",
      component: "Canvas under fixed overlays",
      url: "http://127.0.0.1:5173/pointer-borders",
      target: "#target",
      keep: "#kept",
      invariant: { selector: "#kept", expected: "Menu" },
    };
    const instance = await isolatedBrowser(site);
    try {
      await instance.context.route(site.url, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><title>Pointer coordinate boundary</title><style>body{margin:0}canvas{position:absolute;top:0;left:0;width:100vw;height:100vh;transform:${transform};background:#eee}header{position:fixed;top:0;left:0;right:0;height:16px;background:#aaa}button{position:fixed;top:16px;left:16px;width:36px;height:36px;padding:0;border:0}</style><canvas id="target"></canvas><header></header><button id="kept" onclick="this.textContent='Activated'">Menu</button>`,
        }),
      );
      await runLiveSite(instance.context, instance.extensionId, site);
    } finally {
      await instance.close();
    }
  });
}
