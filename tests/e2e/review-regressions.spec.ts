import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit, startHide } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure modes from final engineering review: query-only hrefs abort picking,
// tracking-only hrefs match other content, transient child links outrank stable
// IDs, boxless wrappers lose refinement history, and implicit events drop drafts.
for (const contract of [
  "query-only",
  "tracking identity",
  "stable id",
  "boxless history",
  "hidden draft",
  "unrelated undo",
  "resume permission",
] as const) {
  test(`Review regression: ${contract}`, async () => {
    const instance = await isolatedBrowser();
    const { context, extensionId, worker } = instance;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    try {
      await context.route("http://127.0.0.1:5173/review-contract", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><title>Review contracts</title><style>article,section{width:400px;padding:20px;margin:20px;background:#ddd}a,button{display:inline-block;padding:12px}.contents{display:contents}</style><main>
      <a id="query" href="?page=2&utm_source=email">Query</a><a id="tracked" href="/pricing?utm_source=email">Pricing</a>
      <article id="stable"><a href="/session/first">Order</a></article>
      <section id="outer"><div class="contents"><button id="first">First</button><button id="second">Second</button></div></section></main>`,
        }),
      );
      const bridge = await driver(context, extensionId),
        page = await context.newPage();
      await page.goto("http://127.0.0.1:5173/review-contract");
      const dock = await openDock(context, bridge, page);
      if (["query-only", "tracking identity", "stable id"].includes(contract)) {
        await startHide(dock);
        const target = page.locator(
          contract === "query-only"
            ? "#query"
            : contract === "stable id"
              ? "#stable"
              : "#tracked",
        );
        await target.click({ position: { x: 4, y: 4 } });
        await expect(target).toBeHidden();
        if (contract === "tracking identity") {
          await page.evaluate(() => {
            const link = document.createElement("a");
            link.id = "other-plan";
            link.href = "/pricing?plan=team";
            link.textContent = "Team";
            document.querySelector("main")!.append(link);
          });
          await expect(page.locator("#other-plan")).toBeVisible();
        } else if (contract === "stable id") {
          await page
            .locator("#stable a")
            .evaluate((e) => e.setAttribute("href", "/session/second"));
          await expect(target).toBeHidden();
        }
      } else if (contract === "boxless history") {
        await startEdit(dock);
        await page.locator("#second").hover();
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await dock.locator("#edit-opacity").fill("40");
        await expect(page.locator("#second")).toHaveCSS("opacity", "0.4");
        await expect(page.locator("#first")).toHaveCSS("opacity", "1");
      } else if (contract === "hidden draft") {
        await startEdit(dock);
        await page.locator("#second").click();
        await dock.locator("#edit-text").fill("Keep my draft");
        await page
          .locator("#second")
          .evaluate((e) => ((e as HTMLElement).style.display = "none"));
        await expect(dock.locator("#edit-text")).toHaveValue("Keep my draft");
        await page
          .locator("#second")
          .evaluate((e) => ((e as HTMLElement).style.display = "inline-block"));
        await expect(dock.locator("#edit-text")).toHaveValue("Keep my draft");
        await expect(page.locator("#second")).toHaveText("Keep my draft");
      } else if (contract === "unrelated undo") {
        await startEdit(dock);
        await page.locator("#first").click();
        await dock.locator("#edit-opacity").fill("40");
        await dock.locator("#edit-save").click();
        await expect(dock.locator("#status")).toHaveText("Changes saved.");
        await dock.locator("#edit-pick").click();
        await page.locator("#second").click();
        await dock.locator("#edit-text").fill("Keep my draft");
        await expect(dock.locator("#undo")).toBeDisabled();
        await expect(page.locator("#second")).toHaveText("Keep my draft");
      } else {
        await dock.locator("#site-toggle").click();
        await dock.locator("#site-pause").click();
        await worker.evaluate(() => {
          chrome.permissions.contains = async () => false;
        });
        await dock.locator("#site-pause").click();
        await expect(dock.locator("#status")).toHaveAttribute(
          "data-error",
          "true",
        );
        const paused = await bridge.evaluate(
          async () =>
            (
              await chrome.runtime.sendMessage({
                type: "get",
                origin: "http://127.0.0.1:5173",
              })
            ).profile.paused,
        );
        expect(paused).toBe(true);
      }
    } finally {
      await context.tracing.stop({
        path: evidencePath(`review-${contract.replaceAll(" ", "-")}.zip`),
      });
      await instance.close();
    }
  });
}
