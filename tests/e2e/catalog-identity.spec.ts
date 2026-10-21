import { test } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// A server may replace an unselected result between visits. The selected item
// must remain attached and hidden; fresh, unrelated results must stay visible.
test("Catalog identity: selected product persists while the server replaces its neighbor", async () => {
  const instance = await isolatedBrowser();
  try {
    await instance.context.addInitScript(() => {
      if (location.pathname !== "/tests/fixture.html") return;
      document.addEventListener("DOMContentLoaded", () => {
        const visit = Number(localStorage.getItem("catalog-visit") || 0) + 1;
        localStorage.setItem("catalog-visit", String(visit));
        const catalog = document.createElement("section");
        catalog.innerHTML = `<article data-asin="selected">Selected product</article><article data-asin="neighbor-${visit}">Another product</article>`;
        document.querySelector("#distraction").before(catalog);
      });
    });
    await runLiveSite(instance.context, instance.extensionId, {
      id: "identity-revisit-fixture",
      caseId: "primary",
      component: "Product card",
      url: "http://127.0.0.1:5173/tests/fixture.html",
      target: "[data-asin]",
      targetIndex: 0,
      keep: "[data-asin]",
      keepIndex: 1,
      identity: {
        self: true,
        selector: "[data-asin]",
        attribute: "data-asin",
      },
    });
  } finally {
    await instance.close();
  }
});
