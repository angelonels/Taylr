import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit, startHide } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

type HeldRegistration = { entered: boolean; release: () => void };

// The actual registration is held: a native page click before release cannot
// select a node, while each startup helper waits until capture listeners exist.
for (const mode of ["edit", "hide"] as const) {
  test(`${mode} readiness waits for held registration before selecting page content`, async () => {
    const instance = await isolatedBrowser();
    const { context, extensionId, worker } = instance;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    let starting: Promise<void> | undefined;
    let ready = false;
    let startupError: unknown;
    try {
      const bridge = await driver(context, extensionId);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:5173/tests/fixture.html");
      const dock = await openDock(context, bridge, page);
      await page.evaluate(() => {
        Object.assign(window, { nativeKeepClicks: 0 });
        document.getElementById("keep")!.addEventListener("click", () => {
          (window as typeof window & { nativeKeepClicks: number })
            .nativeKeepClicks++;
        });
      });
      await worker.evaluate(() => {
        const registered = chrome.scripting.getRegisteredContentScripts.bind(
          chrome.scripting,
        );
        Object.assign(globalThis, { entered: false, release: () => {} });
        chrome.scripting.getRegisteredContentScripts = async (...args) => {
          (globalThis as unknown as HeldRegistration).entered = true;
          await new Promise<void>((resolve) => {
            (globalThis as unknown as HeldRegistration).release = resolve;
          });
          chrome.scripting.getRegisteredContentScripts = registered;
          return registered(...args);
        };
      });
      starting = (mode === "edit" ? startEdit(dock) : startHide(dock)).then(
        () => {
          ready = true;
        },
        (error: unknown) => {
          startupError = error;
        },
      );
      await expect
        .poll(() =>
          worker.evaluate(
            () => (globalThis as unknown as HeldRegistration).entered,
          ),
        )
        .toBe(true);
      await expect(dock.locator("#hide")).toHaveAttribute("aria-busy", "true");
      await expect(dock.locator(`#${mode}`)).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await page.locator("#keep").click();
      await expect(page.locator("#keep")).toBeVisible();
      await expect(
        dock.getByRole("region", { name: "Element editor" }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            (window as typeof window & { nativeKeepClicks: number })
              .nativeKeepClicks,
        ),
      ).toBe(1);
      expect(ready).toBe(false);
      await worker.evaluate(() =>
        (globalThis as unknown as HeldRegistration).release(),
      );
      await starting;
      expect(startupError).toBeUndefined();
      expect(ready).toBe(true);
      await page.locator("#keep").click();
      if (mode === "edit") {
        await expect(
          dock.getByRole("region", { name: "Element editor" }),
        ).toBeVisible();
        await dock.locator("#edit-opacity").fill("67");
        await expect(page.locator("#keep")).toHaveCSS("opacity", "0.67");
      } else {
        await expect(page.locator("#keep")).toBeHidden();
        await expect(dock.locator("#undo")).toBeEnabled();
      }
      expect(
        await page.evaluate(
          () =>
            (window as typeof window & { nativeKeepClicks: number })
              .nativeKeepClicks,
        ),
      ).toBe(1);
      await expect(page.locator("#distraction")).toBeVisible();
      await expect(page.locator("#distraction")).toHaveCSS("opacity", "1");
    } finally {
      await worker
        .evaluate(() => (globalThis as unknown as HeldRegistration).release?.())
        .catch(() => {});
      await starting;
      await context.tracing.stop({
        path: evidencePath(`${mode}-readiness-trace.zip`),
      });
      await instance.close();
    }
  });
}
