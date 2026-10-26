import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure: a rejected stale revision wedges Undo forever, including earlier
// entries for unrelated components. I/O failures must instead remain retryable.
for (const failure of ["revision", "storage"] as const) {
  test(`Undo recovers from ${failure} without losing unrelated history`, async () => {
    const instance = await isolatedBrowser();
    const { context, extensionId, worker } = instance;
    const origin = "http://127.0.0.1:5173";
    const url = `${origin}/undo-revision`;
    await context.route(url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Undo revision</title><style>body{padding:80px}button{padding:30px;margin:20px}</style><button id='first'>First</button><button id='second'>Second</button>",
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
      for (const id of ["first", "second"]) {
        if (id === "second") await dock.locator("#edit-pick").click();
        await page.locator(`#${id}`).click();
        await dock.locator("#edit-opacity").fill("67");
        await dock.locator("#edit-save").click();
        await expect(dock.locator("#status")).toHaveText("Changes saved.");
      }
      const readProfile = () =>
        bridge.evaluate(
          async (origin) =>
            (await chrome.runtime.sendMessage({ type: "get", origin })).profile,
          origin,
        );
      if (failure === "revision") {
        // Two local revisions of the same component must both be discarded
        // after another writer takes ownership, without undoing that writer.
        await dock.locator("#edit-opacity").fill("73");
        await dock.locator("#edit-save").click();
        await expect(dock.locator("#status")).toHaveText("Changes saved.");
        const saved = await readProfile();
        const second = saved.rules.find((rule: { selector: string }) =>
          rule.selector.includes("second"),
        );
        const other = await driver(context, extensionId);
        const result = await other.evaluate(
          ({ origin, selector }) =>
            chrome.runtime.sendMessage({
              type: "edit",
              origin,
              selector,
              label: "Second tab",
              styles: { opacity: "0.81" },
            }),
          { origin, selector: second.selector },
        );
        expect(result.savedRule.id).toBe(second.id);
        expect(result.savedRule.revision).not.toBe(second.revision);
        await page.bringToFront();
        await expect(page.locator("#second")).toHaveCSS("opacity", "0.81");
        await dock.locator("#undo").click();
        await expect(dock.locator("#status")).toContainText("another tab");
        expect((await readProfile()).rules).toEqual(result.profile.rules);
        await dock.locator("#undo").click();
        await expect(page.locator("#first")).toHaveCSS("opacity", "1");
        await expect(page.locator("#second")).toHaveCSS("opacity", "0.81");
        expect((await readProfile()).rules).toEqual([result.savedRule]);
        await expect(dock.locator("#undo")).toBeDisabled();
      } else {
        const before = await readProfile();
        await worker.evaluate(() => {
          const write = chrome.storage.local.set.bind(chrome.storage.local);
          chrome.storage.local.set = async () => {
            chrome.storage.local.set = write;
            throw new Error("Temporary storage failure");
          };
        });
        await dock.locator("#undo").click();
        await expect(dock.locator("#status")).toHaveText(
          "Temporary storage failure",
        );
        expect((await readProfile()).rules).toEqual(before.rules);
        await expect(dock.locator("#undo")).toBeEnabled();
        await dock.locator("#undo").click();
        await expect(page.locator("#second")).toHaveCSS("opacity", "1");
        await expect(page.locator("#first")).toHaveCSS("opacity", "0.67");
        await dock.locator("#undo").click();
        await expect(page.locator("#first")).toHaveCSS("opacity", "1");
        expect((await readProfile()).rules).toEqual([]);
      }
    } finally {
      await context.tracing.stop({ path: evidencePath(`undo-${failure}.zip`) });
      await instance.close();
    }
  });
}
