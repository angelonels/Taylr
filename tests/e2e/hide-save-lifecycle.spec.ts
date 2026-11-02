import { test, expect, type Page } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure contracts: Escape after Hide dispatch drops its committed Undo;
// a failed draft render claims that unsaved changes were saved.
for (const scenario of [
  "committed-hide-escape",
  "unsaved-render-error",
] as const) {
  test(`Hide and render lifecycle: ${scenario}`, async () => {
    const instance = await isolatedBrowser();
    const { context, extensionId, worker } = instance;
    const url = "http://127.0.0.1:5173/hide-save-lifecycle";
    let page: Page | undefined;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    try {
      await context.route(url, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Hide lifecycle</title><style>body{padding:70px}button{display:block;width:240px;padding:30px;margin:20px}</style><button id='selected'>Selected component</button><button id='neighbor'>Keep this component</button>",
        }),
      );
      const bridge = await driver(context, extensionId);
      page = await context.newPage();
      await page.goto(url);
      const dock = await openDock(context, bridge, page);
      const mode = scenario === "committed-hide-escape" ? "hide" : "edit";
      await dock.locator(`#${mode}`).click();
      await expect(dock.locator(`#${mode}`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(dock.locator("#hide")).toHaveAttribute("aria-busy", "false");

      if (scenario === "committed-hide-escape") {
        await worker.evaluate(() => {
          const state = globalThis as unknown as {
            hideWriteStarted: boolean;
            releaseHideWrite?: () => void;
          };
          state.hideWriteStarted = false;
          const write = chrome.storage.local.set.bind(chrome.storage.local);
          chrome.storage.local.set = async (items) => {
            state.hideWriteStarted = true;
            await new Promise<void>((resolve) => {
              state.releaseHideWrite = resolve;
            });
            // Subsequent Undo writes must use the original implementation.
            chrome.storage.local.set = write;
            return write(items);
          };
        });
        await page.locator("#selected").click();
        await expect
          .poll(
            () =>
              worker.evaluate(
                () =>
                  (globalThis as unknown as { hideWriteStarted: boolean })
                    .hideWriteStarted,
              ),
            {
              timeout: 15000,
              message: "Hide must dispatch its storage write before Escape",
            },
          )
          .toBe(true);
        await page.keyboard.press("Escape");
        await worker.evaluate(() =>
          (
            globalThis as unknown as { releaseHideWrite?: () => void }
          ).releaseHideWrite?.(),
        );
        await expect(page.locator("#selected")).toBeHidden();
        await expect(dock.locator("#undo")).toBeEnabled();
        await dock.locator("#undo").click();
        await expect(page.locator("#selected")).toBeVisible();
        await expect(dock.locator("#undo")).toBeDisabled();
      } else {
        await page.locator("#selected").click();
        await expect(
          dock.getByRole("region", { name: "Element editor" }),
        ).toBeVisible();
        await worker.evaluate(() => {
          const state = globalThis as unknown as { draftRenderFailed: boolean };
          state.draftRenderFailed = false;
          chrome.scripting.insertCSS = async () => {
            state.draftRenderFailed = true;
            throw new Error(
              "Fixture: user-origin draft stylesheet insertion failed",
            );
          };
        });
        await dock.locator("#edit-opacity").fill("67");
        await expect
          .poll(() =>
            worker.evaluate(
              () =>
                (globalThis as unknown as { draftRenderFailed: boolean })
                  .draftRenderFailed,
            ),
          )
          .toBe(true);
        await expect(dock.locator("#status")).toContainText(
          /could not|unable|failed|reload/i,
        );
        await expect(dock.locator("#status")).not.toContainText(/saved/i);
        const result = await bridge.evaluate(() =>
          chrome.runtime.sendMessage({
            type: "get",
            origin: "http://127.0.0.1:5173",
          }),
        );
        expect(result.profile.rules).toHaveLength(0);
      }
      await expect(page.locator("#neighbor")).toBeVisible();
      await expect(page.locator("#neighbor")).toHaveCSS("opacity", "1");
      await expect(page.locator("#neighbor")).toHaveText("Keep this component");
    } finally {
      try {
        if (page && !page.isClosed())
          await page.screenshot({
            path: evidencePath(`hide-save-${scenario}.png`),
          });
      } finally {
        try {
          await context.tracing.stop({
            path: evidencePath(`hide-save-${scenario}.zip`),
          });
        } finally {
          await instance.close();
        }
      }
    }
  });
}
