import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit, startHide } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure: a later lazy-image placeholder broadens a previously unique tag-only
// descendant path, so saved Edit/Hide also reaches a different image.
for (const mode of ["unique", "repeated", "siblings"]) {
  const repeated = mode !== "unique";
  test(`Image identity survives placeholder insertion (${mode} alt)`, async () => {
    const instance = await isolatedBrowser();
    const { context, extensionId } = instance;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    let placeholder = false;
    const url = "http://127.0.0.1:5173/image-identity";
    const image =
      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="blue"/></svg>';
    await context.route(url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Image identity</title><style>body{padding:50px}article{margin:30px}img{width:120px;height:80px}</style><article><a href="/story/alpha"><div>${placeholder ? `<img aria-label="image unavailable" src='${image}'>` : ""}${mode === "siblings" ? `<img alt="Selected photograph" src='${image}'>` : ""}<img alt="Selected photograph" src='${image}'></div></a></article><article><a href="/story/beta"><div><img alt="${repeated ? "Selected photograph" : "Other photograph"}" src='${image}'></div></a></article>`,
      }),
    );
    try {
      const bridge = await driver(context, extensionId);
      const page = await context.newPage();
      await page.goto(url);
      const dock = await openDock(context, bridge, page);
      const target = page.locator('a[href="/story/alpha"] img[alt]').last();
      await startEdit(dock);
      await target.click();
      await dock.locator("#edit-opacity").fill("67");
      await dock.locator("#edit-save").click();
      await expect(dock.locator("#status")).toHaveText("Changes saved.");
      await expect(target).toHaveCSS("opacity", "0.67");
      await startHide(dock);
      await target.click();
      await expect(target).toBeHidden();
      placeholder = true;
      await page.reload();
      await expect(target).toBeHidden();
      await expect(target).toHaveCSS("opacity", "0.67");
      await expect(
        page.locator('img[aria-label="image unavailable"]'),
      ).toBeVisible();
      await expect(
        page.locator('img[aria-label="image unavailable"]'),
      ).toHaveCSS("opacity", "1");
      await expect(page.locator('a[href="/story/beta"] img')).toBeVisible();
      await expect(page.locator('a[href="/story/beta"] img')).toHaveCSS(
        "opacity",
        "1",
      );
      if (mode === "siblings")
        await expect(
          page.locator('a[href="/story/alpha"] img[alt]').first(),
        ).toBeVisible();
      const reopened = await openDock(context, bridge, page);
      await reopened.locator("#rules-toggle").click();
      await reopened.locator("#restore").click();
      await expect(target).toBeVisible();
      await expect(target).toHaveCSS("opacity", "1");
    } finally {
      await context.tracing.stop({
        path: evidencePath(`image-identity-${mode}.zip`),
      });
      await instance.close();
    }
  });
}
