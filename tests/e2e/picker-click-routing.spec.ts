import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// An earlier window capture router runs before a picker installed on first use.
// Canceling click in the picker cannot reverse the router's synchronous action.
for (const scenario of [
  "router",
  "pending-capture",
  "escape-held",
  "synthetic-tail",
  "lost-capture",
] as const) {
  test(`Picker click routing: ${scenario}`, async () => {
    const instance = await isolatedBrowser();
    const { context, extensionId } = instance;
    const url = "http://127.0.0.1:5173/picker-click-routing";
    await context.route(url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Early click routing</title><style>body{padding:60px}a{display:block;width:300px;padding:30px;margin:20px;background:#ddd}#scroll{width:300px;height:100px;overflow:auto}#scroll>div{height:600px}</style><a id="target" href="/unexpected-route"><span>Editable component</span></a><button id="neighbor">Neighbor</button><div id="scroll"><div>Nested scroll content</div></div><script>
        window.addEventListener('pointerdown', event => {
          document.body.dataset.pointer = String(event.pointerId);
          if (${scenario === "pending-capture"} && event.target.closest?.('a[href]')) event.target.setPointerCapture(event.pointerId);
        }, {capture:true});
        window.addEventListener('click', event => {
          const link = event.target.closest?.('a[href]');
          if (link) {
            event.preventDefault();
            history.pushState({}, '', link.getAttribute('href'));
            document.body.dataset.navigated = 'true';
          }
        }, {capture:true});
        </script>`,
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
      const target = page.locator("#target");
      if (scenario === "escape-held") {
        const box = await target.boundingBox();
        expect(box).not.toBeNull();
        await page.mouse.move(box!.x + 20, box!.y + 20);
        await page.mouse.down();
        await page.keyboard.press("Escape");
        await page.mouse.up();
      } else {
        if (scenario === "synthetic-tail" || scenario === "lost-capture") {
          const box = await target.boundingBox();
          expect(box).not.toBeNull();
          const point = { x: box!.x + 20, y: box!.y + 20 };
          await page.mouse.move(point.x, point.y);
          await page.mouse.down();
          // Process pending capture before testing interference with its tail.
          await page.mouse.move(point.x + 1, point.y);
          if (scenario === "synthetic-tail") {
            await page.evaluate(() => {
              const sink = [
                ...document.querySelector("taylr-tools")!.shadowRoot!.children,
              ].find((element) => element.matches('span[aria-hidden="true"]'))!;
              for (const type of ["pointerup", "click"])
                sink.dispatchEvent(
                  new PointerEvent(type, { bubbles: true, composed: true }),
                );
            });
          } else {
            await page.evaluate(() => {
              const sink = [
                ...document.querySelector("taylr-tools")!.shadowRoot!.children,
              ].find((element) => element.matches('span[aria-hidden="true"]'))!;
              sink.releasePointerCapture(Number(document.body.dataset.pointer));
            });
            await page.mouse.move(point.x + 2, point.y);
            // Reacquisition must not revive the gesture invalidated by real loss.
            await page.evaluate(() => {
              const sink = [
                ...document.querySelector("taylr-tools")!.shadowRoot!.children,
              ].find((element) => element.matches('span[aria-hidden="true"]'))!;
              sink.setPointerCapture(Number(document.body.dataset.pointer));
            });
          }
          await page.mouse.up();
          if (scenario === "lost-capture") {
            await expect(dock.locator("#edit-opacity")).toHaveCount(0);
            await expect(target).toHaveCSS("opacity", "1");
            // A fresh trusted gesture must still work after cancellation.
          }
        }
        // Keep Playwright's real visibility, stability and receives-events checks.
        if (scenario !== "synthetic-tail") await target.click();
        await expect(page).toHaveURL(url);
        await expect(dock.locator("#edit-opacity")).toBeVisible();
        await dock.locator("#edit-opacity").fill("67");
        await dock.locator("#edit-save").click();
        await expect(target).toHaveCSS("opacity", "0.67");
        await expect(page.locator("#neighbor")).toHaveCSS("opacity", "1");
      }
      await expect(page).toHaveURL(url);
      await expect(page.locator("body")).not.toHaveAttribute(
        "data-navigated",
        "true",
      );
      const scroll = page.locator("#scroll");
      await scroll.hover();
      await page.mouse.wheel(0, 120);
      await expect
        .poll(() => scroll.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      if (scenario !== "escape-held") await page.keyboard.press("Escape");
      await target.click();
      await expect(page).toHaveURL("http://127.0.0.1:5173/unexpected-route");
    } finally {
      await context.tracing.stop({
        path: evidencePath(`picker-click-routing-${scenario}.zip`),
      });
      await instance.close();
    }
  });
}
