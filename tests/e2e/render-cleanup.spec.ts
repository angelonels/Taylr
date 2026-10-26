import { test, expect, type Page } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit, startHide } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// A missing cleanup acknowledgement does not prove the old sheet still exists.
// Resume must restore a Hide rule even when Pause removed it before replying late.
test("Resume restores Hide after empty-render removal lost its acknowledgement", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId, worker } = instance;
  const url = "http://127.0.0.1:5173/empty-render-cleanup";
  await context.route(url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Empty render cleanup</title><style>body{padding:70px}button{width:240px;padding:30px;margin:20px}</style><button id='selected' style='display:block!important'>Selected component</button><button id='neighbor'>Independent component</button>",
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
    await startHide(dock);
    await page.locator("#selected").click();
    await expect(page.locator("#selected")).toBeHidden();
    await worker.evaluate(() => {
      const state = globalThis as unknown as {
        emptyCleanup: { removed: number; rejected: number };
      };
      state.emptyCleanup = { removed: 0, rejected: 0 };
      const remove = chrome.scripting.removeCSS.bind(chrome.scripting);
      chrome.scripting.removeCSS = async (options) => {
        await remove(options);
        if (/display:\s*none\s*!important/.test(options.css ?? "")) {
          state.emptyCleanup.removed++;
          if (!state.emptyCleanup.rejected) {
            state.emptyCleanup.rejected++;
            throw new Error(
              "Fixture: successful Hide removal lost its acknowledgement",
            );
          }
        }
      };
    });
    await dock.locator("#site-toggle").click();
    await dock.locator("#site-pause").click();
    await expect
      .poll(() =>
        worker.evaluate(
          () =>
            (globalThis as unknown as { emptyCleanup: { rejected: number } })
              .emptyCleanup.rejected,
        ),
      )
      .toBe(1);
    await expect(page.locator("#selected")).toBeVisible();
    await expect(dock.locator("#site-pause")).toHaveText("Resume site");
    await dock.locator("#site-pause").click();
    await expect(dock.locator("#site-pause")).toHaveText("Pause site");
    await expect(page.locator("#selected")).toBeHidden();
    await expect(page.locator("#neighbor")).toBeVisible();
    const fault = await worker.evaluate(
      () =>
        (
          globalThis as unknown as {
            emptyCleanup: { removed: number; rejected: number };
          }
        ).emptyCleanup,
    );
    expect(fault.removed).toBeGreaterThan(0);
    expect(fault.rejected).toBe(1);
    await test.info().attach("empty-render-cleanup", {
      body: JSON.stringify(fault),
      contentType: "application/json",
    });
  } finally {
    await context.tracing.stop({
      path: evidencePath("empty-render-cleanup.zip"),
    });
    await instance.close();
  }
});

// A successful replacement insert followed by failed old-sheet removal must
// remain tracked: Cancel must remove every attempted USER-origin draft sheet.
for (const recovery of ["cancel", "repeat", "revert"] as const) {
  test(`Cancel cleans a draft after failed removal: ${recovery}`, async () => {
    const instance = await isolatedBrowser();
    const { context, extensionId, worker } = instance;
    const url = "http://127.0.0.1:5173/render-cleanup";
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
          body: "<!doctype html><title>Draft cleanup</title><style>body{padding:70px}button{display:block;width:240px;padding:30px;margin:20px}</style><button id='selected'>Selected component</button><button id='neighbor'>Keep this component</button>",
        }),
      );
      const bridge = await driver(context, extensionId);
      page = await context.newPage();
      await page.goto(url);
      const dock = await openDock(context, bridge, page);
      await worker.evaluate(() => {
        const state = globalThis as unknown as {
          cleanupFault: {
            inserted67: number;
            inserted43: number;
            failures: number;
          };
        };
        state.cleanupFault = {
          inserted67: 0,
          inserted43: 0,
          failures: 0,
        };
        const insert = chrome.scripting.insertCSS.bind(chrome.scripting);
        const remove = chrome.scripting.removeCSS.bind(chrome.scripting);
        chrome.scripting.insertCSS = async (options) => {
          await insert(options);
          if (/opacity:\s*0\.67\b/.test(options.css ?? ""))
            state.cleanupFault.inserted67++;
          if (/opacity:\s*0\.43\b/.test(options.css ?? ""))
            state.cleanupFault.inserted43++;
        };
        chrome.scripting.removeCSS = async (options) => {
          if (
            state.cleanupFault.inserted43 &&
            state.cleanupFault.failures === 0 &&
            /opacity:\s*0\.67\b/.test(options.css ?? "")
          ) {
            state.cleanupFault.failures++;
            throw new Error(
              "Fixture: old draft stylesheet removal failed once",
            );
          }
          await remove(options);
        };
      });
      await startEdit(dock);
      await page.locator("#selected").click();
      await expect(
        dock.getByRole("region", { name: "Element editor" }),
      ).toBeVisible();
      await dock.locator("#edit-opacity").fill("67");
      await expect
        .poll(() =>
          worker.evaluate(
            () =>
              (
                globalThis as unknown as {
                  cleanupFault: { inserted67: boolean };
                }
              ).cleanupFault.inserted67,
          ),
        )
        .toBe(1);
      await expect(page.locator("#selected")).toHaveCSS("opacity", "0.67");
      await dock.locator("#edit-opacity").fill("43");
      await expect
        .poll(() =>
          worker.evaluate(
            () =>
              (globalThis as unknown as { cleanupFault: { failures: number } })
                .cleanupFault.failures,
          ),
        )
        .toBe(1);
      await expect(dock.locator("#status")).toContainText(
        /could not|unable|failed|reload/i,
      );
      if (recovery === "repeat") {
        // An unrelated profile broadcast reapplies the same in-flight draft.
        await bridge.evaluate(() =>
          chrome.runtime.sendMessage({
            type: "set-paused",
            origin: "http://127.0.0.1:5173",
            paused: false,
          }),
        );
        await expect
          .poll(() =>
            worker.evaluate(
              (key) =>
                (
                  globalThis as unknown as {
                    cleanupFault: { inserted67: number; inserted43: number };
                  }
                ).cleanupFault[key],
              recovery === "repeat" ? "inserted43" : "inserted67",
            ),
          )
          .toBe(2);
        await expect(
          dock
            .locator("#status")
            .filter({ hasText: /could not|unable|failed|reload/i }),
        ).toHaveCount(0);
        await expect(page.locator("#selected")).toHaveCSS("opacity", "0.43");
      } else if (recovery === "revert") {
        await dock.locator("#edit-opacity").fill("67");
        await expect(page.locator("#selected")).toHaveCSS("opacity", "0.67");
        await expect
          .poll(() =>
            worker.evaluate(
              (key) =>
                (
                  globalThis as unknown as {
                    cleanupFault: { inserted67: number; inserted43: number };
                  }
                ).cleanupFault[key],
              recovery === "repeat" ? "inserted43" : "inserted67",
            ),
          )
          .toBe(2);
        await expect(
          dock
            .locator("#status")
            .filter({ hasText: /could not|unable|failed|reload/i }),
        ).toHaveCount(0);
      }
      await page.keyboard.press("Escape");
      await expect(page.locator('style[data-taylr="rules"]')).toHaveText("");
      const result = await bridge.evaluate(() =>
        chrome.runtime.sendMessage({
          type: "get",
          origin: "http://127.0.0.1:5173",
        }),
      );
      expect(result.profile.rules).toHaveLength(0);
      await expect(page.locator("#selected")).toHaveCSS("opacity", "1");
      await expect(page.locator("#neighbor")).toHaveCSS("opacity", "1");
      await expect(page.locator("#neighbor")).toBeVisible();
    } finally {
      try {
        if (page && !page.isClosed())
          await page.screenshot({
            path: evidencePath(`render-cleanup-${recovery}.png`),
          });
      } finally {
        try {
          await context.tracing.stop({
            path: evidencePath(`render-cleanup-${recovery}.zip`),
          });
        } finally {
          await instance.close();
        }
      }
    }
  });
}
