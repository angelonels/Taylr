import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit, startHide } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure: positional fallback ignores a later unique permalink; parent navigation
// stops at boxless wrappers; edit mode keeps intercepting site shortcuts after lock.
for (const contract of [
  "identity",
  "navigation",
  "refinement",
  "locked keyboard",
] as const) {
  test(`Picker contract: ${contract}`, async () => {
    const instance = await isolatedBrowser();
    const { context, extensionId } = instance;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    try {
      await context.route("http://127.0.0.1:5173/picker-contract", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><title>Picker contracts</title><style>article,section{display:block;width:480px;padding:30px;margin:20px;background:#ddd}a,button{display:inline-block;padding:12px}#boxless{display:contents}</style><main>
      <article><a href="/user/ada">Ada</a><a href="/post/alpha">Alpha</a></article>
      <article><a href="/user/ada">Ada</a><a href="/post/beta">Beta</a></article>
      <section id="outer"><div id="boxless"><button id="inner">Inner</button></div></section>
      <div role="button" id="card"><a id="link" href="#destination"><span id="caption">Story</span></a></div>
      <button id="site-action" onclick="this.textContent='Activated'">Site action</button></main>`,
        }),
      );
      const bridge = await driver(context, extensionId);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:5173/picker-contract");
      const dock = await openDock(context, bridge, page);
      if (contract === "identity") {
        await startHide(dock);
        // Registration is asynchronous; the click promise alone does not mean
        // the page picker has installed its trusted-input listeners.
        await expect(dock.locator("#hide")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await expect(dock.locator("#hide")).toHaveAttribute(
          "aria-busy",
          "false",
        );
        const chosen = page
          .locator("article")
          .filter({ has: page.locator('[href="/post/beta"]') });
        await chosen.click({ position: { x: 8, y: 8 } });
        await expect(chosen).toBeHidden();
        await page.evaluate(() => {
          const cards = document.querySelectorAll("article");
          cards[0]!.before(cards[1]!);
        });
        await expect(chosen).toBeHidden();
        await expect(
          page
            .locator("article")
            .filter({ has: page.locator('[href="/post/alpha"]') }),
        ).toBeVisible();
      } else if (contract === "navigation") {
        await startEdit(dock);
        await page.locator("#caption").hover();
        await page.keyboard.press("Enter");
        await dock.locator("#edit-opacity").fill("50");
        await expect(page.locator("#link")).toHaveCSS("opacity", "0.5");
        await page.keyboard.press("Escape");
        await startEdit(dock);
        await page.locator("#inner").hover();
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Enter");
        await dock.locator("#edit-opacity").fill("40");
        await expect(page.locator("#outer")).toHaveCSS("opacity", "0.4");
      } else if (contract === "refinement") {
        await startEdit(dock);
        await page.locator("#inner").hover();
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Enter");
        await dock.locator("#edit-opacity").fill("50");
        await expect(page.locator("main")).toHaveCSS("opacity", "0.5");
      } else {
        await startEdit(dock);
        await page.locator("#inner").click();
        await dock.locator("#edit-opacity").fill("40");
        await page.locator("#site-action").focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#site-action")).toHaveText("Activated");
        await page.keyboard.press("ArrowUp");
        await expect(dock.locator("#edit-opacity")).toHaveValue("40");
        await expect(page.locator("#inner")).toHaveCSS("opacity", "0.4");
      }
    } finally {
      await context.tracing.stop({
        path: evidencePath(`picker-${contract.replaceAll(" ", "-")}-trace.zip`),
      });
      await instance.close();
    }
  });
}
