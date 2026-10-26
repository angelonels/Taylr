import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, tabForPage, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Measure actual content-script ownership work without a machine-speed gate.
// Nested hidden links model a header's large collapsed navigation catalogue.
test("Measure selector ownership work with an early unique content link", async () => {
  const results = [];
  for (const count of [1, 5000]) {
    const instance = await isolatedBrowser();
    const { context, extensionId, worker } = instance;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    try {
      const url = `http://127.0.0.1:5173/selector-workload-${count}`;
      const links = Array.from(
        { length: count },
        (_, index) =>
          `<div><span><a href="/catalogue/${index}">Item ${index}</a></span></div>`,
      ).join("");
      await context.route(url, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><title>Selector workload</title><style>body{padding:40px}header{padding:60px;background:#ddd;margin:20px}.catalogue{display:none}</style><header><a href="/first-content">First content</a><nav class="catalogue">${links}</nav></header><header><a href="/other-content">Independent header</a></header>`,
        }),
      );
      const bridge = await driver(context, extensionId);
      const page = await context.newPage();
      await page.goto(url);
      const dock = await openDock(context, bridge, page);
      const tab = await tabForPage(bridge, page);
      await startEdit(dock);
      const box = await page.locator("header").first().boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + 10, box!.y + 10);
      await worker.evaluate(async (id) => {
        await chrome.scripting.executeScript({
          target: { tabId: id },
          world: "ISOLATED",
          func: () => {
            const descriptor = Object.getOwnPropertyDescriptor(
              Node.prototype,
              "parentElement",
            )!;
            const header = document.querySelector("header")!;
            const state = globalThis as unknown as {
              ownershipMeasure: { reads: number; restore: () => void };
            };
            state.ownershipMeasure = {
              reads: 0,
              restore: () =>
                Object.defineProperty(
                  Node.prototype,
                  "parentElement",
                  descriptor,
                ),
            };
            Object.defineProperty(Node.prototype, "parentElement", {
              ...descriptor,
              get(this: Node) {
                if (header.contains(this) && this !== header)
                  state.ownershipMeasure.reads++;
                return descriptor.get!.call(this);
              },
            });
          },
        });
      }, tab.id);
      const result = await worker.evaluate(async (id) => {
        const started = performance.now();
        let selection, rpcMs, parentReads;
        try {
          selection = await chrome.tabs.sendMessage(id, {
            type: "get-picker",
            selection: true,
          });
          rpcMs = performance.now() - started;
        } finally {
          const [measurement] = await chrome.scripting.executeScript({
            target: { tabId: id },
            world: "ISOLATED",
            func: () => {
              const state = globalThis as unknown as {
                ownershipMeasure: { reads: number; restore: () => void };
              };
              const reads = state.ownershipMeasure.reads;
              state.ownershipMeasure.restore();
              return reads;
            },
          });
          parentReads = measurement.result;
        }
        return { selector: selection.selector, parentReads, rpcMs };
      }, tab.id);
      expect(typeof result.selector).toBe("string");
      expect(
        await page
          .locator("header")
          .first()
          .evaluate((element, selector) => {
            const matches = document.querySelectorAll(selector);
            return matches.length === 1 && matches[0] === element;
          }, result.selector),
      ).toBe(true);
      results.push({ irrelevantLinks: count, ...result });
      await page.screenshot({
        path: evidencePath(`selector-workload-${count}.png`),
      });
    } finally {
      try {
        await context.tracing.stop({
          path: evidencePath(`selector-workload-${count}.zip`),
        });
      } finally {
        await instance.close();
      }
    }
  }
  await test.info().attach("selector-workload", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
});
