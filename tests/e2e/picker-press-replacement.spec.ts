import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// The selected control can survive a framework replacing its inner glyph on
// press. Replacing the selected control itself must still cancel the gesture.
for (const replace of ["child", "component"] as const) {
  test(`Picker press preserves only a connected ${replace === "child" ? "component" : "replacement boundary"}`, async () => {
    const instance = await isolatedBrowser();
    const { context, extensionId } = instance;
    const url = "http://127.0.0.1:5173/press-replacement";
    await context.route(url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><style>body{padding:80px}button{padding:40px;width:300px}span{display:block;padding:20px}</style><button id="selected"><span id="glyph">Editable control</span></button><aside id="kept">Independent</aside><script>let changed=false;window.addEventListener('pointerdown',event=>{if(changed||!event.target.closest?.('#selected'))return;changed=true;const node=document.getElementById('${replace === "child" ? "glyph" : "selected"}');node.replaceWith(node.cloneNode(true));},true);</script>`,
      }),
    );
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    try {
      const bridge = await driver(context, extensionId);
      const page = await context.newPage();
      await page.goto(url);
      const dock = await openDock(context, bridge, page);
      await startEdit(dock);
      const glyph = page.locator("#glyph");
      const box = await glyph.boundingBox();
      expect(box).not.toBeNull();
      const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
      await glyph.hover();
      expect(
        await glyph.evaluate(
          (element, p) => element.contains(document.elementFromPoint(p.x, p.y)),
          point,
        ),
      ).toBe(true);
      const oldGlyph = await glyph.elementHandle();
      const oldComponent = await page.locator("#selected").elementHandle();
      expect(oldGlyph).not.toBeNull();
      expect(oldComponent).not.toBeNull();
      await page.mouse.down();
      await page.mouse.up();
      // Prove the replacement actually ran; a missing stimulus must not pass.
      expect(await oldGlyph!.evaluate((element) => element.isConnected)).toBe(
        false,
      );
      expect(
        await oldComponent!.evaluate((element) => element.isConnected),
      ).toBe(replace === "child");
      await expect(page.locator("#glyph")).toHaveCount(1);
      await expect(page.locator("#selected")).toHaveCount(1);
      if (replace === "component") {
        await expect(dock.locator("#edit-opacity")).toHaveCount(0);
        await expect(page.locator("#selected")).toHaveCSS("opacity", "1");
        await page.locator("#glyph").click();
      }
      await expect(dock.locator("#edit-opacity")).toBeVisible();
      await dock.locator("#edit-opacity").fill("67");
      await dock.locator("#edit-save").click();
      await expect(page.locator("#selected")).toHaveCSS("opacity", "0.67");
      await expect(page.locator("#kept")).toHaveCSS("opacity", "1");
    } finally {
      await context.tracing.stop({
        path: evidencePath(`press-${replace}.zip`),
      });
      await instance.close();
    }
  });
}
